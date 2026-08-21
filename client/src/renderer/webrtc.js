const { ICE_SERVERS } = require('./config');

function getAudioConstraints(deviceId, { processed = true } = {}) {
  const audio = processed
    ? {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
    : {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    };
  if (deviceId) audio.deviceId = { exact: deviceId };
  return audio;
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
    this.screenStream = null;
    this.microphoneLoopback = null;
  }

  async startAudio(deviceId) {
    const constraints = {
      audio: getAudioConstraints(deviceId),
      video: false
    };
    const nextStream = await navigator.mediaDevices.getUserMedia(constraints);
    const oldStream = this.audioStream;
    this.audioStream = nextStream;
    if (oldStream) oldStream.getTracks().forEach((track) => track.stop());

    for (const peer of this.peers.values()) {
      const sender = peer.connection.getSenders().find((item) => item.track?.kind === 'audio');
      if (sender) {
        await sender.replaceTrack(nextStream.getAudioTracks()[0]);
      } else {
        peer.connection.addTrack(nextStream.getAudioTracks()[0], nextStream);
        await this.#renegotiate(peer);
      }
    }
    return nextStream;
  }

  getAudioTrack() {
    return this.audioStream?.getAudioTracks()[0] || null;
  }

  async startMicrophoneLoopback(deviceId, onLevel = () => {}) {
    if (this.microphoneLoopback) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: getAudioConstraints(deviceId, { processed: false }),
      video: false
    });
    const audioContext = new AudioContext();
    await audioContext.resume();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    const source = audioContext.createMediaStreamSource(stream);
    const samples = new Uint8Array(analyser.fftSize);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    const loopback = { stream, audioContext, analyser, source, animationFrame: null, active: true };
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
    loopback.analyser.disconnect();
    loopback.stream.getTracks().forEach((track) => track.stop());
    await loopback.audioContext.close();
    this.microphoneLoopback = null;
    onLevel(0);
  }

  setMuted(muted) {
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
        audio: false
      });
      const track = stream.getVideoTracks()[0];
      track.contentHint = 'detail';
      track.onended = () => this.stopScreenShare().catch(() => {});
      this.screenStream = stream;
      for (const peer of this.peers.values()) {
        peer.screenSender = peer.connection.addTrack(track, stream);
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
      if (peer.screenSender) {
        peer.connection.removeTrack(peer.screenSender);
        peer.screenSender = null;
        await this.#renegotiate(peer);
      }
    }
    this.screenStream = null;
    await this.socket.stopScreenShare();
  }

  close() {
    if (this.audioStream) this.audioStream.getTracks().forEach((track) => track.stop());
    if (this.screenStream) this.screenStream.getTracks().forEach((track) => track.stop());
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
    const peer = { participantId: participant.participantId, connection, pendingCandidates: [], screenSender: null };
    this.peers.set(participant.participantId, peer);
    if (this.audioStream) {
      for (const track of this.audioStream.getTracks()) connection.addTrack(track, this.audioStream);
    }
    if (this.screenStream) {
      peer.screenSender = connection.addTrack(this.screenStream.getVideoTracks()[0], this.screenStream);
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
