const { ICE_SERVERS } = require('./config');

const DEFAULT_AUDIO_SETTINGS = Object.freeze({
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  inputGain: 1
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
      await captureTrack.applyConstraints(getAudioProcessingConstraints(audioSettings));
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
        await captureTrack.applyConstraints(getAudioProcessingConstraints(processingSettings));
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
    const track = this.getAudioTrack();
    if (!track) return false;
    this.muted = Boolean(muted);
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

  async handleOffer(fromParticipantId, description) {
    const peer = this.peers.get(fromParticipantId) || this.#createPeer({ participantId: fromParticipantId });
    await peer.connection.setRemoteDescription(description);
    for (const candidate of peer.pendingCandidates.splice(0)) {
      await peer.connection.addIceCandidate(candidate);
    }
    const answer = await peer.connection.createAnswer();
    await peer.connection.setLocalDescription(answer);
    await this.socket.sendSignal('peer:answer', fromParticipantId, { description: peer.connection.localDescription });
  }

  async handleAnswer(fromParticipantId, description) {
    const peer = this.peers.get(fromParticipantId);
    if (!peer) return;
    await peer.connection.setRemoteDescription(description);
    for (const candidate of peer.pendingCandidates.splice(0)) {
      await peer.connection.addIceCandidate(candidate);
    }
  }

  async handleIce(fromParticipantId, candidate) {
    const peer = this.peers.get(fromParticipantId) || this.#createPeer({ participantId: fromParticipantId });
    if (!peer.connection.remoteDescription) {
      peer.pendingCandidates.push(candidate);
      return;
    }
    await peer.connection.addIceCandidate(candidate);
  }

  async startScreenShare(sourceId) {
    const lock = await this.socket.startScreenShare();
    if (!lock?.ok) throw new Error(lock?.message || 'Não foi possível iniciar o compartilhamento.');
    try {
      if (sourceId && window.voiceRoom?.selectScreenSource) {
        await window.voiceRoom.selectScreenSource(sourceId);
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { max: 1280 }, height: { max: 720 }, frameRate: { max: 30 } },
        audio: true
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
      for (const peer of this.peers.values()) {
        peer.screenSenders = stream.getTracks().map((screenTrack) => peer.connection.addTrack(screenTrack, stream));
        await this.#renegotiate(peer);
      }
      return stream;
    } catch (error) {
      await this.socket.stopScreenShare();
      throw error;
    }
  }

  async stopScreenShare() {
    if (!this.screenStream) return;
    this.screenStream.getTracks().forEach((track) => track.stop());
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
    this.stopMicrophoneLoopback().catch(() => {});
    for (const participantId of this.peers.keys()) this.removePeer(participantId);
  }

  removePeer(participantId) {
    const peer = this.peers.get(participantId);
    if (!peer) return;
    peer.connection.ontrack = null;
    peer.connection.close();
    this.peers.delete(participantId);
    this.onPeerState(participantId, 'closed');
  }

  #createPeer(participant) {
    const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const peer = { participantId: participant.participantId, connection, pendingCandidates: [], audioSender: null, screenSenders: [] };
    this.peers.set(participant.participantId, peer);
    if (this.audioStream) {
      const audioTrack = this.audioStream.getAudioTracks()[0];
      if (audioTrack) peer.audioSender = connection.addTrack(audioTrack, this.audioStream);
    }
    if (this.screenStream) {
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
    return peer;
  }

  async #renegotiate(peer) {
    if (!peer || !this.peers.has(peer.participantId)) return;
    const offer = await peer.connection.createOffer();
    await peer.connection.setLocalDescription(offer);
    await this.socket.sendSignal('peer:offer', peer.participantId, { description: peer.connection.localDescription });
  }
}

module.exports = { PeerManager };
