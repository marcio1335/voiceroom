const { ICE_SERVERS } = require('./config');
const {
  ScreenQualityController,
  calculateScreenScale,
  getScreenProfile,
  normalizeScreenProfile,
  normalizeFraction,
  orderScreenCodecs
} = require('./screen-quality');

const DEFAULT_AUDIO_SETTINGS = Object.freeze({
  echoCancellation: true,
  noiseSuppressionMode: 'native',
  noiseSuppression: true,
  autoGainControl: true,
  inputGain: 1
});

const NOISE_SUPPRESSION_MODES = Object.freeze(['native', 'rnnoise', 'off']);
const RNNOISE_SAMPLE_RATE = 48000;

function getNoiseSuppressionMode(settings = {}) {
  if (NOISE_SUPPRESSION_MODES.includes(settings.noiseSuppressionMode)) {
    return settings.noiseSuppressionMode;
  }
  if (settings.noiseSuppression === false) return 'off';
  return 'native';
}

function shouldUseNativeNoiseSuppression(settings = {}) {
  return getNoiseSuppressionMode(settings) === 'native';
}

function clampInputGain(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_AUDIO_SETTINGS.inputGain;
  return Math.min(2, Math.max(0, numericValue));
}

function getAudioConstraints(deviceId, {
  processed = true,
  echoCancellation = DEFAULT_AUDIO_SETTINGS.echoCancellation,
  noiseSuppression = DEFAULT_AUDIO_SETTINGS.noiseSuppression,
  noiseSuppressionMode,
  autoGainControl = DEFAULT_AUDIO_SETTINGS.autoGainControl
} = {}) {
  const nativeNoiseSuppression = noiseSuppressionMode !== undefined
    ? shouldUseNativeNoiseSuppression({ noiseSuppressionMode })
    : Boolean(noiseSuppression);
  const audio = processed
    ? {
      echoCancellation: Boolean(echoCancellation),
      noiseSuppression: nativeNoiseSuppression,
      autoGainControl: Boolean(autoGainControl)
    }
    : {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    };
  if (deviceId) audio.deviceId = { exact: deviceId };
  return audio;
}

function getAudioProcessingConstraints({
  echoCancellation = DEFAULT_AUDIO_SETTINGS.echoCancellation,
  noiseSuppression = DEFAULT_AUDIO_SETTINGS.noiseSuppression,
  noiseSuppressionMode,
  autoGainControl = DEFAULT_AUDIO_SETTINGS.autoGainControl
} = {}) {
  const nativeNoiseSuppression = noiseSuppressionMode !== undefined
    ? shouldUseNativeNoiseSuppression({ noiseSuppressionMode })
    : Boolean(noiseSuppression);
  return {
    echoCancellation: Boolean(echoCancellation),
    noiseSuppression: nativeNoiseSuppression,
    autoGainControl: Boolean(autoGainControl)
  };
}

const AUDIO_PROCESSING_KEYS = ['echoCancellation', 'noiseSuppression', 'autoGainControl'];

function constraintSupportsValue(capability, value) {
  if (Array.isArray(capability)) return capability.includes(value) || (value === true && capability.includes('all'));
  if (typeof capability === 'boolean') return capability === value;
  return true;
}

async function applyAudioProcessingConstraints(track, settings) {
  const constraints = getAudioProcessingConstraints(settings);
  if (!track?.applyConstraints) {
    const error = new Error('Este dispositivo não permite alterar o processamento do microfone durante a chamada.');
    error.code = 'AUDIO_CONSTRAINT_UNSUPPORTED';
    error.constraints = AUDIO_PROCESSING_KEYS;
    throw error;
  }

  const capabilities = track.getCapabilities?.() || {};
  const unsupported = AUDIO_PROCESSING_KEYS.filter((key) => !constraintSupportsValue(capabilities[key], constraints[key]));
  const currentSettings = track.getSettings?.() || {};
  const constraintsToApply = { ...constraints };
  for (const key of unsupported) {
    if (currentSettings[key] !== undefined) constraintsToApply[key] = currentSettings[key];
  }

  await track.applyConstraints(constraintsToApply);
  const actualSettings = track.getSettings?.() || {};
  const mismatches = AUDIO_PROCESSING_KEYS.filter(
    (key) => actualSettings[key] !== undefined && actualSettings[key] !== constraints[key]
  );
  return { settings: actualSettings, unsupported: [...new Set([...unsupported, ...mismatches])] };
}

function createAudioContext({ sampleRate } = {}) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  return new AudioContextClass({
    latencyHint: 'interactive',
    ...(sampleRate ? { sampleRate } : {})
  });
}

function stopStream(stream) {
  if (stream) stream.getTracks().forEach((track) => track.stop());
}

async function closeAudioContext(audioContext) {
  if (!audioContext || audioContext.state === 'closed') return;
  try {
    await audioContext.close();
  } catch {
    // O contexto pode já ter sido encerrado pelo Electron.
  }
}

function createRnnoiseUnavailableError(message = 'RNNoise não está disponível neste sistema.') {
  const error = new Error(message);
  error.code = 'RNNOISE_UNAVAILABLE';
  return error;
}

async function createRnnoiseNode(audioContext) {
  const AudioWorkletNodeClass = window.AudioWorkletNode;
  if (!audioContext?.audioWorklet || !AudioWorkletNodeClass) {
    throw createRnnoiseUnavailableError('O processamento RNNoise não é compatível com esta versão do aplicativo.');
  }
  if (audioContext.sampleRate !== RNNOISE_SAMPLE_RATE) {
    throw createRnnoiseUnavailableError('O RNNoise precisa de um contexto de áudio em 48 kHz.');
  }
  try {
    const workletUrl = new URL('./rnnoise-worklet.bundle.js', document.baseURI).toString();
    await audioContext.audioWorklet.addModule(workletUrl);
    const node = new AudioWorkletNodeClass(audioContext, 'rnnoise-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1]
    });
    await new Promise((resolve, reject) => {
      let timeout;
      const finish = (callback) => (value) => {
        window.clearTimeout(timeout);
        node.port.onmessage = null;
        node.onprocessorerror = null;
        callback(value);
      };
      timeout = window.setTimeout(
        () => finish(reject)(createRnnoiseUnavailableError('O RNNoise demorou demais para iniciar.')),
        8000
      );
      node.port.onmessage = (event) => {
        if (event.data?.type === 'ready') finish(resolve)(event.data);
        if (event.data?.type === 'error') finish(reject)(createRnnoiseUnavailableError(event.data.message));
      };
      node.onprocessorerror = () => finish(reject)(createRnnoiseUnavailableError('O processador RNNoise falhou ao iniciar.'));
    });
    return node;
  } catch (error) {
    if (error?.code === 'RNNOISE_UNAVAILABLE') throw error;
    throw createRnnoiseUnavailableError(error?.message || 'Não foi possível carregar o RNNoise.');
  }
}

async function createAudioPipeline(captureStream, audioSettings) {
  const noiseSuppressionMode = getNoiseSuppressionMode(audioSettings);
  const pipeline = {
    stream: captureStream,
    audioContext: null,
    audioGainNode: null,
    rnnoiseNode: null,
    noiseSuppressionMode
  };
  const sampleRate = noiseSuppressionMode === 'rnnoise' ? RNNOISE_SAMPLE_RATE : undefined;
  const audioContext = createAudioContext({ sampleRate });
  if (!audioContext) {
    if (noiseSuppressionMode === 'rnnoise') {
      throw createRnnoiseUnavailableError('O processamento RNNoise não é compatível com este sistema.');
    }
    return pipeline;
  }
  try {
    await audioContext.resume();
    const source = audioContext.createMediaStreamSource(captureStream);
    const gainNode = audioContext.createGain();
    gainNode.gain.value = clampInputGain(audioSettings.inputGain);
    const destination = audioContext.createMediaStreamDestination();
    let output = source;
    let rnnoiseNode = null;
    if (noiseSuppressionMode === 'rnnoise') {
      rnnoiseNode = await createRnnoiseNode(audioContext);
      output = output.connect(rnnoiseNode);
    }
    output.connect(gainNode).connect(destination);
    pipeline.stream = destination.stream;
    pipeline.audioContext = audioContext;
    pipeline.audioGainNode = gainNode;
    pipeline.rnnoiseNode = rnnoiseNode;
    return pipeline;
  } catch (error) {
    await closeAudioContext(audioContext);
    if (noiseSuppressionMode === 'rnnoise') {
      if (error?.code === 'RNNOISE_UNAVAILABLE') throw error;
      throw createRnnoiseUnavailableError(error?.message || 'Não foi possível iniciar o RNNoise.');
    }
    return pipeline;
  }
}

function closeRnnoiseNode(rnnoiseNode) {
  if (!rnnoiseNode) return;
  try { rnnoiseNode.port.postMessage({ type: 'close' }); } catch { /* contexto já encerrado */ }
  try { rnnoiseNode.disconnect(); } catch { /* nó já desconectado */ }
}

class PeerManager {
  constructor({
    socket,
    selfId,
    onRemoteStream = () => {},
    onPeerState = () => {},
    onError = () => {},
    onScreenStats = () => {}
  }) {
    this.socket = socket;
    this.selfId = selfId;
    this.onRemoteStream = onRemoteStream;
    this.onPeerState = onPeerState;
    this.onError = onError;
    this.onScreenStats = onScreenStats;
    this.peers = new Map();
    this.audioStream = null;
    this.audioCaptureStream = null;
    this.audioContext = null;
    this.audioGainNode = null;
    this.rnnoiseNode = null;
    this.noiseSuppressionMode = 'native';
    this.screenStream = null;
    this.screenQuality = 'balanced';
    this.screenViewers = new Set();
    this.screenQualityControllers = new Map();
    this.screenStatsTimer = null;
    this.screenStatsInFlight = false;
    this.microphoneLoopback = null;
    this.muted = false;
  }

  async startAudio(deviceId, settings = {}) {
    const audioSettings = {
      ...DEFAULT_AUDIO_SETTINGS,
      ...settings,
      inputGain: clampInputGain(settings.inputGain)
    };
    const constraints = {
      audio: getAudioConstraints(deviceId, audioSettings),
      video: false
    };
    const captureStream = await navigator.mediaDevices.getUserMedia(constraints);
    const captureTrack = captureStream.getAudioTracks()[0];
    if (!captureTrack) {
      stopStream(captureStream);
      throw new Error('O dispositivo não forneceu uma faixa de áudio.');
    }
    try {
      await applyAudioProcessingConstraints(captureTrack, audioSettings);
    } catch {
      // Alguns drivers aceitam a captura, mas não permitem reaplicar as constraints.
      // O estado efetivo será exposto por getAudioProcessingSettings().
    }
    let pipeline;
    try {
      pipeline = await createAudioPipeline(captureStream, audioSettings);
    } catch (error) {
      stopStream(captureStream);
      throw error;
    }

    const oldStream = this.audioStream;
    const oldCaptureStream = this.audioCaptureStream;
    const oldAudioContext = this.audioContext;
    const oldGainNode = this.audioGainNode;
    const oldRnnoiseNode = this.rnnoiseNode;
    const oldNoiseSuppressionMode = this.noiseSuppressionMode;
    this.audioStream = pipeline.stream;
    this.audioCaptureStream = captureStream;
    this.audioContext = pipeline.audioContext;
    this.audioGainNode = pipeline.audioGainNode;
    this.rnnoiseNode = pipeline.rnnoiseNode;
    this.noiseSuppressionMode = pipeline.noiseSuppressionMode;
    const nextTrack = pipeline.stream.getAudioTracks()[0];
    if (!nextTrack) {
      closeRnnoiseNode(pipeline.rnnoiseNode);
      stopStream(pipeline.stream);
      if (captureStream !== pipeline.stream) stopStream(captureStream);
      await closeAudioContext(pipeline.audioContext);
      this.audioStream = oldStream;
      this.audioCaptureStream = oldCaptureStream;
      this.audioContext = oldAudioContext;
      this.audioGainNode = oldGainNode;
      this.rnnoiseNode = oldRnnoiseNode;
      this.noiseSuppressionMode = oldNoiseSuppressionMode;
      throw new Error('O dispositivo não forneceu uma faixa de áudio.');
    }
    try {
      nextTrack.contentHint = 'speech';
    } catch {
      // contentHint pode não existir em versões antigas do Chromium.
    }
    nextTrack.enabled = !this.muted;
    await this.#replaceAudioTrack(pipeline.stream);
    stopStream(oldStream);
    if (oldCaptureStream && oldCaptureStream !== oldStream) stopStream(oldCaptureStream);
    closeRnnoiseNode(oldRnnoiseNode);
    await closeAudioContext(oldAudioContext);
    return pipeline.stream;
  }

  getAudioTrack() {
    return this.audioStream?.getAudioTracks()[0] || null;
  }

  getAudioProcessingSettings() {
    const track = this.audioCaptureStream?.getAudioTracks()[0];
    return track?.getSettings?.() || {};
  }

  getNoiseSuppressionMode() {
    return this.noiseSuppressionMode;
  }

  async setAudioProcessing(settings = {}) {
    const track = this.audioCaptureStream?.getAudioTracks()[0];
    if (!track) return { settings: {}, unsupported: [] };
    const nextMode = getNoiseSuppressionMode(settings);
    const result = await applyAudioProcessingConstraints(track, settings);
    if (nextMode === this.noiseSuppressionMode) return result;
    const pipeline = await createAudioPipeline(this.audioCaptureStream, settings);
    const nextTrack = pipeline.stream.getAudioTracks()[0];
    if (!nextTrack) {
      closeRnnoiseNode(pipeline.rnnoiseNode);
      stopStream(pipeline.stream);
      await closeAudioContext(pipeline.audioContext);
      throw new Error('O dispositivo não forneceu uma faixa de áudio.');
    }
    nextTrack.contentHint = 'speech';
    nextTrack.enabled = !this.muted;
    await this.#replaceAudioTrack(pipeline.stream);
    const oldStream = this.audioStream;
    const oldContext = this.audioContext;
    const oldRnnoiseNode = this.rnnoiseNode;
    this.audioStream = pipeline.stream;
    this.audioContext = pipeline.audioContext;
    this.audioGainNode = pipeline.audioGainNode;
    this.rnnoiseNode = pipeline.rnnoiseNode;
    this.noiseSuppressionMode = pipeline.noiseSuppressionMode;
    stopStream(oldStream);
    closeRnnoiseNode(oldRnnoiseNode);
    await closeAudioContext(oldContext);
    return result;
  }

  async startMicrophoneLoopback(deviceId, onLevel = () => {}, inputGain = 1, processingSettings = {}) {
    if (this.microphoneLoopback) return;
    const processed = processingSettings.processed === true || processingSettings.processMicrophoneTest === true;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: getAudioConstraints(deviceId, {
        ...processingSettings,
        processed
      }),
      video: false
    });
    const captureTrack = stream.getAudioTracks()[0];
    if (!captureTrack) {
      stopStream(stream);
      throw new Error('O dispositivo não forneceu uma faixa de áudio.');
    }
    if (processed) {
      try {
        await applyAudioProcessingConstraints(captureTrack, processingSettings);
      } catch {
        // O retorno continua disponível mesmo quando o driver ignora uma opção.
      }
    }
    const noiseSuppressionMode = processed ? getNoiseSuppressionMode(processingSettings) : 'off';
    const audioContext = createAudioContext({
      sampleRate: noiseSuppressionMode === 'rnnoise' ? RNNOISE_SAMPLE_RATE : undefined
    });
    if (!audioContext) {
      stopStream(stream);
      throw new Error('O retorno de áudio não está disponível neste sistema.');
    }
    let analyser;
    let source;
    let gainNode;
    let rnnoiseNode = null;
    let samples;
    try {
      await audioContext.resume();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source = audioContext.createMediaStreamSource(stream);
      gainNode = audioContext.createGain();
      gainNode.gain.value = clampInputGain(inputGain);
      samples = new Uint8Array(analyser.fftSize);
      let output = source;
      if (noiseSuppressionMode === 'rnnoise') {
        rnnoiseNode = await createRnnoiseNode(audioContext);
        output = output.connect(rnnoiseNode);
      }
      output.connect(gainNode).connect(analyser);
      analyser.connect(audioContext.destination);
    } catch (error) {
      stopStream(stream);
      closeRnnoiseNode(rnnoiseNode);
      await closeAudioContext(audioContext);
      throw error;
    }
    const loopback = {
      stream,
      audioContext,
      analyser,
      source,
      gainNode,
      rnnoiseNode,
      animationFrame: null,
      active: true
    };
    this.microphoneLoopback = loopback;
    const updateLevel = () => {
      if (!loopback.active) return;
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const normalized = (sample - 128) / 128;
        sum += normalized * normalized;
      }
      const level = Math.min(1, Math.sqrt(sum / samples.length) * 3.2);
      onLevel(level);
      loopback.animationFrame = requestAnimationFrame(updateLevel);
    };
    updateLevel();
  }

  async stopMicrophoneLoopback(onLevel = () => {}) {
    const loopback = this.microphoneLoopback;
    if (!loopback) return;
    loopback.active = false;
    if (loopback.animationFrame) cancelAnimationFrame(loopback.animationFrame);
    loopback.source.disconnect();
    closeRnnoiseNode(loopback.rnnoiseNode);
    loopback.gainNode.disconnect();
    loopback.analyser.disconnect();
    stopStream(loopback.stream);
    await closeAudioContext(loopback.audioContext);
    this.microphoneLoopback = null;
    onLevel(0);
  }

  setInputGain(inputGain) {
    const value = clampInputGain(inputGain);
    if (this.audioGainNode && this.audioContext) {
      this.audioGainNode.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.01);
    }
    if (this.microphoneLoopback?.gainNode && this.microphoneLoopback.audioContext) {
      this.microphoneLoopback.gainNode.gain.setTargetAtTime(
        value,
        this.microphoneLoopback.audioContext.currentTime,
        0.01
      );
    }
    return value;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    const track = this.getAudioTrack();
    if (!track) return false;
    track.enabled = !muted;
    return muted;
  }

  async syncParticipants(participants) {
    const currentIds = new Set(participants.filter((item) => item.participantId !== this.selfId).map((item) => item.participantId));
    for (const participantId of this.peers.keys()) {
      if (!currentIds.has(participantId)) this.removePeer(participantId);
    }
    for (const participant of participants) {
      if (participant.participantId === this.selfId || this.peers.has(participant.participantId)) continue;
      const peer = this.#createPeer(participant);
      if (this.selfId < participant.participantId) {
        await this.#renegotiate(peer);
      }
    }
  }

  async reconnectAll() {
    const participantIds = [...this.peers.keys()];
    for (const participantId of participantIds) this.removePeer(participantId);
    await this.syncParticipants(participantIds.map((participantId) => ({ participantId })));
  }

  async getLatency() {
    const values = [];
    for (const peer of this.peers.values()) {
      if (!peer.connection.getStats) continue;
      try {
        const report = await peer.connection.getStats();
        for (const stat of report.values()) {
          if (stat.type !== 'candidate-pair' || stat.state !== 'succeeded') continue;
          if (stat.nominated === false && stat.selected !== true) continue;
          if (Number.isFinite(stat.currentRoundTripTime)) values.push(stat.currentRoundTripTime * 1000);
        }
      } catch {
        // A conexão pode estar sendo substituída enquanto as estatísticas são lidas.
      }
    }
    return values.length ? Math.round(Math.min(...values)) : null;
  }

  async handleOffer(fromParticipantId, description) {
    const peer = this.peers.get(fromParticipantId) || this.#createPeer({ participantId: fromParticipantId });
    return this.#queueSignaling(peer, () => this.#applyOffer(peer, fromParticipantId, description));
  }

  async #applyOffer(peer, fromParticipantId, description) {
    const offerCollision = description?.type === 'offer'
      && (peer.makingOffer || peer.connection.signalingState !== 'stable');
    peer.ignoreOffer = !peer.polite && offerCollision;
    if (peer.ignoreOffer) return;
    if (offerCollision && peer.connection.signalingState !== 'stable') {
      await peer.connection.setLocalDescription({ type: 'rollback' });
      // A polite peer may have local tracks that were not included in the
      // incoming offer. Ask for a follow-up negotiation after answering it.
      peer.needsNegotiation = true;
    }
    await peer.connection.setRemoteDescription(description);
    for (const candidate of peer.pendingCandidates.splice(0)) {
      await peer.connection.addIceCandidate(candidate);
    }
    await peer.connection.setLocalDescription(await peer.connection.createAnswer());
    await this.socket.sendSignal('peer:answer', fromParticipantId, { description: peer.connection.localDescription });
    if (peer.needsNegotiation) await this.#renegotiate(peer);
  }

  async handleAnswer(fromParticipantId, description) {
    const peer = this.peers.get(fromParticipantId);
    if (!peer) return;
    return this.#queueSignaling(peer, () => this.#applyAnswer(peer, description));
  }

  async #applyAnswer(peer, description) {
    await peer.connection.setRemoteDescription(description);
    for (const candidate of peer.pendingCandidates.splice(0)) {
      await peer.connection.addIceCandidate(candidate);
    }
    if (peer.needsNegotiation) await this.#renegotiate(peer);
  }

  async handleIce(fromParticipantId, candidate) {
    const peer = this.peers.get(fromParticipantId) || this.#createPeer({ participantId: fromParticipantId });
    return this.#queueSignaling(peer, () => this.#applyIce(peer, candidate));
  }

  async #applyIce(peer, candidate) {
    if (peer.ignoreOffer) return;
    if (!peer.connection.remoteDescription) {
      peer.pendingCandidates.push(candidate);
      return;
    }
    await peer.connection.addIceCandidate(candidate);
  }

  async startScreenShare(sourceId, { includeSystemAudio = false, quality = 'balanced' } = {}) {
    const lock = await this.socket.startScreenShare();
    if (!lock?.ok) throw new Error(lock?.message || 'Não foi possível iniciar o compartilhamento.');
    try {
      if (sourceId && window.voiceRoom?.selectScreenSource) {
        await window.voiceRoom.selectScreenSource(sourceId);
      }
      this.screenQuality = normalizeScreenProfile(quality);
      const selectedQuality = getScreenProfile(this.screenQuality);
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          // Capture the selected surface in its native aspect ratio. Scaling
          // is applied per RTP sender below, so a 16:10 or ultrawide window
          // is never cropped to fit a 16:9 box.
          frameRate: { ideal: selectedQuality.frameRate, max: selectedQuality.frameRate },
          resizeMode: 'none'
        },
        // Electron's loopback audio is the whole Windows output. Keep it off
        // unless the user explicitly opts in from the source picker.
        // restrictOwnAudio avoids feeding VoiceRoom's own playback back into
        // the shared track on Electron/Chromium versions that support it.
        audio: includeSystemAudio ? { restrictOwnAudio: true } : false
      });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('A captura não forneceu vídeo.');
      try {
        track.contentHint = selectedQuality.contentHint;
      } catch {
        // contentHint pode não existir em versões antigas do Chromium.
      }
      for (const audioTrack of stream.getAudioTracks()) {
        try {
          audioTrack.contentHint = 'music';
        } catch {
          // contentHint pode não existir em versões antigas do Chromium.
        }
      }
      track.onended = () => this.stopScreenShare().catch(() => {});
      this.screenStream = stream;
      for (const participantId of this.screenViewers) await this.setScreenViewer(participantId, true);
      return stream;
    } catch (error) {
      await this.socket.stopScreenShare();
      throw error;
    }
  }

  async stopScreenShare() {
    if (!this.screenStream) return;
    this.screenStream.getTracks().forEach((track) => track.stop());
    this.screenViewers.clear();
    this.screenQualityControllers.clear();
    this.#stopScreenStatsLoop();
    for (const peer of this.peers.values()) {
      if (peer.screenSenders?.length) {
        for (const sender of peer.screenSenders) peer.connection.removeTrack(sender);
        peer.screenSenders = [];
        await this.#renegotiate(peer);
      }
    }
    this.screenStream = null;
    await this.socket.stopScreenShare();
  }

  async setScreenViewer(participantId, shouldWatch) {
    if (!participantId || participantId === this.selfId) return;
    if (shouldWatch) {
      this.screenViewers.add(participantId);
      if (!this.screenQualityControllers.has(participantId)) {
        this.screenQualityControllers.set(participantId, new ScreenQualityController({
          desiredProfile: this.screenQuality
        }));
      }
    } else {
      this.screenViewers.delete(participantId);
      this.screenQualityControllers.delete(participantId);
    }

    const peerAlreadyExisted = this.peers.has(participantId);
    const peer = this.peers.get(participantId) || (shouldWatch ? this.#createPeer({ participantId }) : null);
    if (!peer) return;

    if (shouldWatch) {
      if (!this.screenStream) return;
      let screenTracksAdded = false;
      if (!peer.screenSenders.length) {
        peer.screenSenders = this.screenStream.getTracks().map((track) => peer.connection.addTrack(track, this.screenStream));
        screenTracksAdded = true;
      }
      // #createPeer can attach the tracks while constructing a new peer. It
      // still needs an offer so the viewer actually receives those tracks.
      if (!peerAlreadyExisted || screenTracksAdded) await this.#renegotiate(peer);
      this.#startScreenStatsLoop();
      return;
    }

    if (!peer.screenSenders.length) return;
    for (const sender of peer.screenSenders) peer.connection.removeTrack(sender);
    peer.screenSenders = [];
    await this.#renegotiate(peer);
    if (!this.screenViewers.size) this.#stopScreenStatsLoop();
  }

  async #configureScreenSenders(senders = [], participantId) {
    const controller = participantId ? this.screenQualityControllers.get(participantId) : null;
    const quality = getScreenProfile(controller?.effectiveProfile || this.screenQuality);
    const peer = participantId ? this.peers.get(participantId) : null;
    const safeBitrate = Number.isFinite(peer?.screenSafeBitrate)
      ? Math.min(quality.maxBitrate, peer.screenSafeBitrate)
      : quality.maxBitrate;
    for (const sender of senders) {
      if (sender?.track?.kind !== 'video' || typeof sender.getParameters !== 'function') continue;
      try {
        const settings = sender.track.getSettings?.() || {};
        const width = Number(settings.width);
        const height = Number(settings.height);
        const scale = calculateScreenScale(width, height, quality.id);
        const parameters = sender.getParameters();
        if (!Array.isArray(parameters.encodings) || !parameters.encodings.length) continue;
        for (const encoding of parameters.encodings) {
          encoding.scaleResolutionDownBy = scale;
          encoding.maxBitrate = safeBitrate;
          encoding.maxFramerate = quality.frameRate;
        }
        parameters.degradationPreference = quality.degradationPreference;
        await sender.setParameters(parameters);
      } catch (error) {
        this.onScreenStats(participantId, {
          type: 'screen-quality-warning',
          participantId,
          code: 'SCREEN_PARAMETERS_UNSUPPORTED',
          message: error?.message || 'O runtime não aceitou todos os parâmetros de qualidade.'
        });
      }
    }
  }

  async setScreenQuality(value) {
    this.screenQuality = normalizeScreenProfile(value);
    const selectedProfile = getScreenProfile(this.screenQuality);
    const track = this.screenStream?.getVideoTracks?.()[0];
    if (track) {
      try { track.contentHint = selectedProfile.contentHint; } catch { /* recurso opcional */ }
      const currentFrameRate = Number(track.getSettings?.().frameRate);
      const knownFrameRate = Number.isFinite(currentFrameRate) ? currentFrameRate : 0;
      if (selectedProfile.frameRate > knownFrameRate && typeof track.applyConstraints === 'function') {
        try {
          await track.applyConstraints({
            frameRate: { ideal: selectedProfile.frameRate, max: selectedProfile.frameRate }
          });
        } catch {
          // Se o runtime não elevar o FPS, a captura segue no limite atual.
        }
      }
    }
    for (const controller of this.screenQualityControllers.values()) controller.setDesiredProfile(this.screenQuality);
    for (const peer of this.peers.values()) {
      if (!peer.screenSenders?.length) continue;
      await this.#configureScreenSenders(peer.screenSenders, peer.participantId);
    }
    return this.screenQuality;
  }

  getScreenQuality() {
    return this.screenQuality;
  }

  #startScreenStatsLoop() {
    if (this.screenStatsTimer || !this.screenViewers.size) return;
    this.screenStatsTimer = setInterval(() => {
      this.#pollScreenStats().catch(() => {});
    }, 2000);
    this.#pollScreenStats().catch(() => {});
  }

  #stopScreenStatsLoop() {
    if (this.screenStatsTimer) clearInterval(this.screenStatsTimer);
    this.screenStatsTimer = null;
    this.screenStatsInFlight = false;
    for (const peer of this.peers.values()) {
      peer.screenStatsPrevious = null;
      peer.screenSafeBitrate = null;
    }
  }

  async #pollScreenStats() {
    if (this.screenStatsInFlight || !this.screenStream || !this.screenViewers.size) return;
    this.screenStatsInFlight = true;
    try {
      for (const participantId of this.screenViewers) {
        const peer = this.peers.get(participantId);
        const controller = this.screenQualityControllers.get(participantId);
        if (!peer?.screenSenders?.length || !controller) continue;
        const previousSafeBitrate = peer.screenSafeBitrate;
        const metrics = await this.#readScreenStats(peer, controller);
        if (!metrics) continue;
        const decision = controller.update(metrics);
        this.onScreenStats(participantId, { ...metrics, ...decision });
        const safeBitrateChanged = Number.isFinite(metrics.safeBitrate)
          && (!Number.isFinite(previousSafeBitrate)
            || Math.abs(metrics.safeBitrate - previousSafeBitrate) / Math.max(1, previousSafeBitrate) >= 0.2);
        if (decision.changed || safeBitrateChanged) {
          await this.#configureScreenSenders(peer.screenSenders, participantId);
          this.onScreenStats(participantId, {
            ...metrics,
            ...decision,
            appliedProfile: decision.effectiveProfile
          });
        }
      }
    } finally {
      this.screenStatsInFlight = false;
    }
  }

  async #readScreenStats(peer, controller) {
    if (typeof peer.connection.getStats !== 'function') return null;
    try {
      const report = await peer.connection.getStats();
      const stats = [...report.values()];
      const outbound = stats.find((stat) => stat.type === 'outbound-rtp'
        && (stat.kind === 'video' || stat.mediaType === 'video'));
      if (!outbound) return null;
      const remoteInbound = stats.find((stat) => stat.type === 'remote-inbound-rtp'
        && stat.localId === outbound.id);
      const selectedPair = stats.find((stat) => stat.type === 'candidate-pair'
        && stat.state === 'succeeded'
        && stat.nominated !== false
        && (stat.selected === true || stat.nominated === true));
      const codec = stats.find((stat) => stat.type === 'codec' && stat.id === outbound.codecId);
      const timestamp = Number(outbound.timestamp) || Date.now();
      const previous = peer.screenStatsPrevious;
      const elapsedMs = previous ? timestamp - previous.timestamp : 0;
      const bitrate = previous && elapsedMs > 0 && Number.isFinite(Number(outbound.bytesSent))
        ? Math.max(0, (Number(outbound.bytesSent) - previous.bytesSent) * 8 * 1000 / elapsedMs)
        : null;
      peer.screenStatsPrevious = {
        timestamp,
        bytesSent: Number(outbound.bytesSent) || 0
      };
      const finiteStat = (value) => {
        if (value === null || value === undefined || value === '') return null;
        const numericValue = Number(value);
        return Number.isFinite(numericValue) ? numericValue : null;
      };
      const effectiveProfile = getScreenProfile(controller.effectiveProfile);
      const rttSeconds = Number(remoteInbound?.roundTripTime ?? selectedPair?.currentRoundTripTime);
      const availableOutgoingBitrate = Number.isFinite(Number(selectedPair?.availableOutgoingBitrate))
        ? Number(selectedPair.availableOutgoingBitrate)
        : null;
      const safeBitrate = availableOutgoingBitrate !== null
        ? Math.max(300_000, Math.floor(availableOutgoingBitrate * 0.8))
        : null;
      if (safeBitrate !== null) peer.screenSafeBitrate = safeBitrate;
      return {
        type: 'screen-quality',
        timestamp,
        desiredProfile: controller.desiredProfile,
        effectiveProfile: controller.effectiveProfile,
        width: finiteStat(outbound.frameWidth),
        height: finiteStat(outbound.frameHeight),
        framesPerSecond: finiteStat(outbound.framesPerSecond),
        targetFrameRate: effectiveProfile.frameRate,
        maxBitrate: effectiveProfile.maxBitrate,
        bitrate,
        rttMs: Number.isFinite(rttSeconds) ? rttSeconds * 1000 : null,
        lossFraction: normalizeFraction(remoteInbound?.fractionLost),
        qualityLimitationReason: outbound.qualityLimitationReason || 'none',
        availableOutgoingBitrate,
        safeBitrate,
        nackCount: finiteStat(remoteInbound?.nackCount),
        pliCount: finiteStat(remoteInbound?.pliCount),
        codec: codec?.mimeType || null,
        encoderImplementation: outbound.encoderImplementation || null
      };
    } catch {
      // A peer can be replaced while the report is being read.
      return null;
    }
  }

  async #configureScreenCodec(peer) {
    if (!peer?.screenSenders?.length || typeof peer.connection.getTransceivers !== 'function') return;
    const sender = peer.screenSenders.find((item) => item?.track?.kind === 'video');
    const transceiver = peer.connection.getTransceivers().find((item) => item.sender === sender);
    const senderCapabilities = globalThis.RTCRtpSender?.getCapabilities?.('video');
    if (!transceiver || typeof transceiver.setCodecPreferences !== 'function' || !senderCapabilities?.codecs?.length) return;
    try {
      const orderedCodecs = orderScreenCodecs(senderCapabilities.codecs);
      if (orderedCodecs.length) await transceiver.setCodecPreferences(orderedCodecs);
    } catch (error) {
      this.onScreenStats(peer.participantId, {
        type: 'screen-quality-warning',
        participantId: peer.participantId,
        code: 'SCREEN_CODEC_PREFERENCE_UNSUPPORTED',
        message: error?.message || 'A preferência de codec não pôde ser aplicada.'
      });
    }
  }

  close() {
    const audioStream = this.audioStream;
    const audioCaptureStream = this.audioCaptureStream;
    const audioContext = this.audioContext;
    this.audioStream = null;
    this.audioCaptureStream = null;
    this.audioContext = null;
    this.audioGainNode = null;
    closeRnnoiseNode(this.rnnoiseNode);
    this.rnnoiseNode = null;
    this.noiseSuppressionMode = 'native';
    stopStream(audioStream);
    if (audioCaptureStream && audioCaptureStream !== audioStream) stopStream(audioCaptureStream);
    closeAudioContext(audioContext).catch(() => {});
    stopStream(this.screenStream);
    this.screenStream = null;
    this.screenViewers.clear();
    this.screenQualityControllers.clear();
    this.#stopScreenStatsLoop();
    this.stopMicrophoneLoopback().catch(() => {});
    for (const participantId of this.peers.keys()) this.removePeer(participantId);
  }

  removePeer(participantId) {
    const peer = this.peers.get(participantId);
    if (!peer) return;
    peer.connection.ontrack = null;
    peer.connection.onconnectionstatechange = null;
    peer.connection.oniceconnectionstatechange = null;
    peer.connection.onicecandidate = null;
    peer.connection.close();
    this.screenViewers.delete(participantId);
    this.screenQualityControllers.delete(participantId);
    peer.screenStatsPrevious = null;
    this.peers.delete(participantId);
    if (!this.screenViewers.size) this.#stopScreenStatsLoop();
    this.onPeerState(participantId, 'closed');
  }

  async #replaceAudioTrack(stream) {
    const nextTrack = stream?.getAudioTracks?.()[0];
    if (!nextTrack) throw new Error('O dispositivo não forneceu uma faixa de áudio.');
    for (const peer of this.peers.values()) {
      const sender = peer.audioSender || peer.connection.getSenders().find(
        (item) => item.track?.kind === 'audio' && !peer.screenSenders?.includes(item)
      );
      if (sender) {
        await sender.replaceTrack(nextTrack);
        peer.audioSender = sender;
      } else {
        peer.audioSender = peer.connection.addTrack(nextTrack, stream);
        await this.#renegotiate(peer);
      }
    }
  }

  #createPeer(participant) {
    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const peer = {
      participantId: participant.participantId,
      connection,
      pendingCandidates: [],
      signalQueue: Promise.resolve(),
      audioSender: null,
      screenSenders: [],
      negotiationQueue: Promise.resolve(),
      polite: this.selfId > participant.participantId,
      makingOffer: false,
      ignoreOffer: false,
      needsNegotiation: false,
      iceRestartAttempts: 0,
      screenStatsPrevious: null,
      screenSafeBitrate: null
    };
    this.peers.set(participant.participantId, peer);
    if (this.audioStream) {
      const audioTrack = this.audioStream.getAudioTracks()[0];
      if (audioTrack) peer.audioSender = connection.addTrack(audioTrack, this.audioStream);
    }
    if (this.screenStream && this.screenViewers.has(participant.participantId)) {
      peer.screenSenders = this.screenStream.getTracks().map((track) => connection.addTrack(track, this.screenStream));
    }
    connection.onicecandidate = ({ candidate }) => {
      if (candidate) this.socket.sendSignal('peer:ice', participant.participantId, { candidate }).catch(() => {});
    };
    connection.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      this.onRemoteStream(participant.participantId, event.track, stream);
    };
    connection.onconnectionstatechange = () => {
      this.onPeerState(participant.participantId, connection.connectionState);
      if (['failed', 'closed'].includes(connection.connectionState)) this.onError(participant.participantId, 'P2P_FAILED');
    };
    connection.oniceconnectionstatechange = () => {
      const state = connection.iceConnectionState;
      if (['connected', 'completed'].includes(state)) {
        peer.iceRestartAttempts = 0;
        return;
      }
      if (state !== 'failed' || peer.iceRestartAttempts >= 2 || !this.peers.has(peer.participantId)) return;
      peer.iceRestartAttempts += 1;
      try {
        connection.restartIce?.();
      } catch {
        // O estado pode ter mudado para closed enquanto o ICE falhava.
      }
      this.#renegotiate(peer, { iceRestart: true }).catch(() => {});
    };
    return peer;
  }

  #queueSignaling(peer, task) {
    const next = peer.signalQueue.catch(() => {}).then(task);
    peer.signalQueue = next.catch(() => {});
    return next;
  }

  async #renegotiate(peer, { iceRestart = false } = {}) {
    if (!peer || !this.peers.has(peer.participantId)) return;
    peer.needsNegotiation = true;
    const negotiate = async () => {
      if (!this.peers.has(peer.participantId)) return;
      if (peer.connection.signalingState !== 'stable') return;
      peer.needsNegotiation = false;
      peer.makingOffer = true;
      try {
        await this.#configureScreenSenders(peer.screenSenders, peer.participantId);
        await this.#configureScreenCodec(peer);
        const offer = await peer.connection.createOffer(iceRestart ? { iceRestart: true } : undefined);
        if (peer.connection.signalingState !== 'stable') {
          peer.needsNegotiation = true;
          return;
        }
        await peer.connection.setLocalDescription(offer);
        await this.socket.sendSignal('peer:offer', peer.participantId, { description: peer.connection.localDescription });
      } catch (error) {
        peer.needsNegotiation = true;
        throw error;
      } finally {
        peer.makingOffer = false;
      }
    };
    const next = peer.negotiationQueue.catch(() => {}).then(negotiate);
    peer.negotiationQueue = next.catch(() => {});
    return next;
  }
}

module.exports = { PeerManager };
