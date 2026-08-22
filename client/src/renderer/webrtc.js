const { ICE_SERVERS } = require('./config');

const DEFAULT_AUDIO_SETTINGS = Object.freeze({
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  inputGain: 1
});

const SCREEN_QUALITIES = Object.freeze({
  '480p': Object.freeze({ width: 854, height: 480, frameRate: 30 }),
  '720p': Object.freeze({ width: 1280, height: 720, frameRate: 30 })
});

function clampInputGain(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return DEFAULT_AUDIO_SETTINGS.inputGain;
  return Math.min(2, Math.max(0, numericValue));
}

function getAudioConstraints(deviceId, {
  processed = true,
  echoCancellation = DEFAULT_AUDIO_SETTINGS.echoCancellation,
  noiseSuppression = DEFAULT_AUDIO_SETTINGS.noiseSuppression,
  autoGainControl = DEFAULT_AUDIO_SETTINGS.autoGainControl
} = {}) {
  const audio = processed
    ? {
      echoCancellation: Boolean(echoCancellation),
      noiseSuppression: Boolean(noiseSuppression),
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
  autoGainControl = DEFAULT_AUDIO_SETTINGS.autoGainControl
} = {}) {
  return {
    echoCancellation: Boolean(echoCancellation),
    noiseSuppression: Boolean(noiseSuppression),
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

function createAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  return new AudioContextClass({ latencyHint: 'interactive' });
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

class PeerManager {
  constructor({ socket, selfId, onRemoteStream = () => {}, onPeerState = () => {}, onError = () => {} }) {
    this.socket = socket;
    this.selfId = selfId;
    this.onRemoteStream = onRemoteStream;
    this.onPeerState = onPeerState;
    this.onError = onError;
    this.peers = new Map();
    this.audioStream = null;
    this.audioCaptureStream = null;
    this.audioContext = null;
    this.audioGainNode = null;
    this.screenStream = null;
    this.screenViewers = new Set();
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
    let nextStream = captureStream;
    let nextAudioContext = null;
    let nextGainNode = null;

    try {
      nextAudioContext = createAudioContext();
      if (nextAudioContext) {
        await nextAudioContext.resume();
        const source = nextAudioContext.createMediaStreamSource(captureStream);
        nextGainNode = nextAudioContext.createGain();
        nextGainNode.gain.value = audioSettings.inputGain;
        const destination = nextAudioContext.createMediaStreamDestination();
        source.connect(nextGainNode).connect(destination);
        nextStream = destination.stream;
      }
    } catch {
      await closeAudioContext(nextAudioContext);
      nextAudioContext = null;
      nextGainNode = null;
      nextStream = captureStream;
    }

    const oldStream = this.audioStream;
    const oldCaptureStream = this.audioCaptureStream;
    const oldAudioContext = this.audioContext;
    const oldGainNode = this.audioGainNode;
    this.audioStream = nextStream;
    this.audioCaptureStream = captureStream;
    this.audioContext = nextAudioContext;
    this.audioGainNode = nextGainNode;
    const nextTrack = nextStream.getAudioTracks()[0];
    if (!nextTrack) {
      stopStream(nextStream);
      if (captureStream !== nextStream) stopStream(captureStream);
      await closeAudioContext(nextAudioContext);
      this.audioStream = oldStream;
      this.audioCaptureStream = oldCaptureStream;
      this.audioContext = oldAudioContext;
      this.audioGainNode = oldGainNode;
      throw new Error('O dispositivo não forneceu uma faixa de áudio.');
    }
    try {
      nextTrack.contentHint = 'speech';
    } catch {
      // contentHint pode não existir em versões antigas do Chromium.
    }
    nextTrack.enabled = !this.muted;

    for (const peer of this.peers.values()) {
      const sender = peer.audioSender || peer.connection.getSenders().find((item) => item.track?.kind === 'audio' && !peer.screenSenders?.includes(item));
      if (sender) {
        await sender.replaceTrack(nextTrack);
        peer.audioSender = sender;
      } else {
        peer.audioSender = peer.connection.addTrack(nextTrack, nextStream);
        await this.#renegotiate(peer);
      }
    }
    stopStream(oldStream);
    if (oldCaptureStream && oldCaptureStream !== oldStream) stopStream(oldCaptureStream);
    await closeAudioContext(oldAudioContext);
    return nextStream;
  }

  getAudioTrack() {
    return this.audioStream?.getAudioTracks()[0] || null;
  }

  getAudioProcessingSettings() {
    const track = this.audioCaptureStream?.getAudioTracks()[0];
    return track?.getSettings?.() || {};
  }

  async setAudioProcessing(settings = {}) {
    const track = this.audioCaptureStream?.getAudioTracks()[0];
    if (!track) return { settings: {}, unsupported: [] };
    return applyAudioProcessingConstraints(track, settings);
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
    const audioContext = createAudioContext();
    if (!audioContext) {
      stopStream(stream);
      throw new Error('O retorno de áudio não está disponível neste sistema.');
    }
    let analyser;
    let source;
    let gainNode;
    let samples;
    try {
      await audioContext.resume();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source = audioContext.createMediaStreamSource(stream);
      gainNode = audioContext.createGain();
      gainNode.gain.value = clampInputGain(inputGain);
      samples = new Uint8Array(analyser.fftSize);
      source.connect(gainNode).connect(analyser);
      analyser.connect(audioContext.destination);
    } catch (error) {
      stopStream(stream);
      await closeAudioContext(audioContext);
      throw error;
    }
    const loopback = { stream, audioContext, analyser, source, gainNode, animationFrame: null, active: true };
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

  async startScreenShare(sourceId, { includeSystemAudio = false, quality = '720p' } = {}) {
    const lock = await this.socket.startScreenShare();
    if (!lock?.ok) throw new Error(lock?.message || 'Não foi possível iniciar o compartilhamento.');
    try {
      if (sourceId && window.voiceRoom?.selectScreenSource) {
        await window.voiceRoom.selectScreenSource(sourceId);
      }
      const selectedQuality = SCREEN_QUALITIES[quality] || SCREEN_QUALITIES['720p'];
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { max: selectedQuality.width },
          height: { max: selectedQuality.height },
          frameRate: { max: selectedQuality.frameRate }
        },
        // Electron's loopback audio is the whole Windows output. Keep it off
        // unless the user explicitly opts in from the source picker.
        // restrictOwnAudio avoids feeding VoiceRoom's own playback back into
        // the shared track on Electron/Chromium versions that support it.
        audio: includeSystemAudio ? { restrictOwnAudio: true } : false
      });
      const track = stream.getVideoTracks()[0];
      if (!track) throw new Error('A captura não forneceu vídeo.');
      track.contentHint = 'detail';
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
    if (shouldWatch) this.screenViewers.add(participantId);
    else this.screenViewers.delete(participantId);

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
      return;
    }

    if (!peer.screenSenders.length) return;
    for (const sender of peer.screenSenders) peer.connection.removeTrack(sender);
    peer.screenSenders = [];
    await this.#renegotiate(peer);
  }

  close() {
    const audioStream = this.audioStream;
    const audioCaptureStream = this.audioCaptureStream;
    const audioContext = this.audioContext;
    this.audioStream = null;
    this.audioCaptureStream = null;
    this.audioContext = null;
    this.audioGainNode = null;
    stopStream(audioStream);
    if (audioCaptureStream && audioCaptureStream !== audioStream) stopStream(audioCaptureStream);
    closeAudioContext(audioContext).catch(() => {});
    stopStream(this.screenStream);
    this.screenStream = null;
    this.screenViewers.clear();
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
    this.peers.delete(participantId);
    this.onPeerState(participantId, 'closed');
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
      iceRestartAttempts: 0
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
