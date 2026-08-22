const { io } = require('socket.io-client');
const { PROTOCOL_VERSION, SIGNALING_SERVER } = require('./config');

class SocketClient {
  constructor({ onEvent = () => {} } = {}) {
    this.onEvent = onEvent;
    this.socket = io(SIGNALING_SERVER, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      timeout: 8_000
    });
    this.resumeContext = null;
    this.#bindEvents();
  }

  #bindEvents() {
    this.socket.on('connect', () => {
      this.onEvent('connect', { socketId: this.socket.id });
      if (this.resumeContext) {
        this.resumeRoom(this.resumeContext.roomCode, this.resumeContext.resumeToken)
          .then((response) => this.onEvent('resume-result', response));
      }
    });
    this.socket.on('disconnect', (reason) => this.onEvent('disconnect', { reason }));
    this.socket.on('connect_error', (error) => this.onEvent('connect-error', { message: error.message }));
    for (const event of [
      'room:state',
      'peer:offer',
      'peer:answer',
      'peer:ice',
      'screen:started',
      'screen:stopped',
      'screen:viewer-joined',
      'screen:viewer-left'
    ]) {
      this.socket.on(event, (payload) => this.onEvent(event, payload));
    }
  }

  request(event, data) {
    return new Promise((resolve) => {
      this.socket.timeout(10_000).emit(event, { ...data, protocolVersion: PROTOCOL_VERSION }, (error, response) => {
        if (error) {
          resolve({ ok: false, errorCode: 'TIMEOUT', message: 'O servidor demorou para responder.' });
          return;
        }
        resolve(response);
      });
    });
  }

  async createRoom(displayName, avatar = null) {
    const response = await this.request('room:create', { displayName, avatar });
    if (response?.ok) {
      this.resumeContext = { roomCode: response.data.room.code, resumeToken: response.data.resumeToken };
    }
    return response;
  }

  async joinRoom(roomCode, displayName, avatar = null) {
    const response = await this.request('room:join', { roomCode, displayName, avatar });
    if (response?.ok) {
      this.resumeContext = { roomCode: response.data.room.code, resumeToken: response.data.resumeToken };
    }
    return response;
  }

  async resumeRoom(roomCode, resumeToken) {
    const response = await this.request('room:resume', { roomCode, resumeToken });
    if (!response?.ok) this.resumeContext = null;
    return response;
  }

  leaveRoom() {
    this.resumeContext = null;
    return this.request('room:leave', {});
  }

  setMuted(muted) {
    return this.request('participant:muted', { muted });
  }

  setProfileAvatar(avatar) {
    return this.request('participant:profile', { avatar });
  }

  sendSignal(event, targetParticipantId, signal) {
    return this.request(event, { targetParticipantId, signal });
  }

  startScreenShare() {
    return this.request('screen:start-request', {});
  }

  stopScreenShare() {
    return this.request('screen:stop', {});
  }

  subscribeScreen(ownerParticipantId) {
    return this.request('screen:subscribe-request', { targetParticipantId: ownerParticipantId });
  }

  unsubscribeScreen(ownerParticipantId) {
    return this.request('screen:unsubscribe-request', { targetParticipantId: ownerParticipantId });
  }

  async measureLatency() {
    if (!this.socket.connected) return null;
    const startedAt = performance.now();
    const response = await this.request('room:ping', {});
    if (!response?.ok) return null;
    return Math.max(0, Math.round(performance.now() - startedAt));
  }

  close() {
    this.socket.close();
  }
}

module.exports = { SocketClient };
