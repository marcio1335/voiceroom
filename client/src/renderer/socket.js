const { io } = require('socket.io-client');
const {
  DEFAULT_CONNECTION_TIMEOUT_MS,
  DEFAULT_RECONNECT_TIMEOUT_MS,
  LOCAL_ROOM_CODE,
  PROTOCOL_VERSION
} = require('./config');

const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_CONNECT_TIMEOUT_MS = DEFAULT_CONNECTION_TIMEOUT_MS;

class SocketClient {
  constructor({ onEvent = () => {} } = {}) {
    this.onEvent = onEvent;
    this.socket = null;
    this.signalingUrl = null;
    this.resumeContext = null;
    this.reconnectTimer = null;
  }

  static async healthCheck(url, timeoutMs = 5_000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${url}/health`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) return { ok: false, errorCode: 'HOST_NOT_FOUND' };
      const payload = await response.json().catch(() => null);
      if (payload?.status !== 'ok' || payload?.app !== 'VoiceRoom') {
        return { ok: false, errorCode: 'INVALID_HOST' };
      }
      return { ok: true, data: payload };
    } catch (error) {
      return {
        ok: false,
        errorCode: error?.name === 'AbortError' ? 'CONNECTION_TIMEOUT' : 'HOST_NOT_FOUND'
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  #bindEvents() {
    if (!this.socket) return;
    this.socket.on('connect', () => {
      this.#clearReconnectTimer();
      this.onEvent('connect', { socketId: this.socket.id, signalingUrl: this.signalingUrl });
      if (this.resumeContext) {
        this.resumeRoom(this.resumeContext.roomCode, this.resumeContext.resumeToken)
          .then((response) => this.onEvent('resume-result', response));
      }
    });
    this.socket.on('disconnect', (reason) => {
      this.onEvent('disconnect', { reason });
      if (this.resumeContext && reason !== 'io client disconnect') {
        this.#clearReconnectTimer();
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          this.onEvent('reconnect-timeout', { timeoutMs: DEFAULT_RECONNECT_TIMEOUT_MS });
          this.close();
        }, DEFAULT_RECONNECT_TIMEOUT_MS);
      }
    });
    this.socket.on('connect_error', (error) => this.onEvent('connect-error', { message: error?.message }));
    for (const event of [
      'room:state',
      'room:host-ended',
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

  connect(url, { timeoutMs = DEFAULT_CONNECT_TIMEOUT_MS } = {}) {
    if (typeof url !== 'string' || !url.startsWith('http://')) {
      return Promise.reject(new Error('Endereço do host inválido.'));
    }
    if (this.socket?.connected && this.signalingUrl === url) return Promise.resolve({ ok: true });
    this.close({ clearResume: false });
    this.signalingUrl = url;
    this.socket = io(url, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      timeout: timeoutMs,
      transports: ['websocket', 'polling']
    });
    this.#bindEvents();
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.socket?.off('connect', onConnect);
        this.socket?.off('connect_error', onError);
        callback(value);
      };
      const onConnect = () => finish(resolve, { ok: true });
      const onError = (error) => finish(reject, error);
      const timer = setTimeout(() => finish(reject, new Error('Não foi possível conectar ao host.')), timeoutMs);
      this.socket.once('connect', onConnect);
      this.socket.once('connect_error', onError);
      this.socket.connect();
    });
  }

  request(event, data = {}) {
    if (!this.socket) return Promise.resolve({ ok: false, errorCode: 'NOT_CONNECTED', message: 'O cliente não está conectado.' });
    return new Promise((resolve) => {
      this.socket.timeout(REQUEST_TIMEOUT_MS).emit(event, { ...data, protocolVersion: PROTOCOL_VERSION }, (error, response) => {
        if (error) {
          resolve({ ok: false, errorCode: 'TIMEOUT', message: 'O host demorou para responder.' });
          return;
        }
        resolve(response);
      });
    });
  }

  async createRoom(displayName, avatar = null) {
    const response = await this.request('room:create', { displayName, avatar });
    if (response?.ok) {
      this.resumeContext = { roomCode: LOCAL_ROOM_CODE, resumeToken: response.data.resumeToken };
    }
    return response;
  }

  async joinRoom(displayName, avatar = null) {
    const response = await this.request('room:join', { roomCode: LOCAL_ROOM_CODE, displayName, avatar });
    if (response?.ok) {
      this.resumeContext = { roomCode: LOCAL_ROOM_CODE, resumeToken: response.data.resumeToken };
    }
    return response;
  }

  async resumeRoom(roomCode = LOCAL_ROOM_CODE, resumeToken) {
    const response = await this.request('room:resume', { roomCode, resumeToken });
    if (!response?.ok) this.resumeContext = null;
    return response;
  }

  leaveRoom() {
    this.resumeContext = null;
    return this.request('room:leave', {});
  }

  setMuted(muted) { return this.request('participant:muted', { muted }); }

  setProfileAvatar(avatar) { return this.request('participant:profile', { avatar }); }

  sendSignal(event, targetParticipantId, signal) {
    return this.request(event, { targetParticipantId, signal });
  }

  startScreenShare() { return this.request('screen:start-request', {}); }

  stopScreenShare() { return this.request('screen:stop', {}); }

  subscribeScreen(ownerParticipantId) {
    return this.request('screen:subscribe-request', { targetParticipantId: ownerParticipantId });
  }

  unsubscribeScreen(ownerParticipantId) {
    return this.request('screen:unsubscribe-request', { targetParticipantId: ownerParticipantId });
  }

  async measureLatency() {
    if (!this.socket?.connected) return null;
    const startedAt = performance.now();
    const response = await this.request('room:ping', {});
    if (!response?.ok) return null;
    return Math.max(0, Math.round(performance.now() - startedAt));
  }

  close({ clearResume = true } = {}) {
    this.#clearReconnectTimer();
    if (clearResume) this.resumeContext = null;
    this.socket?.close();
    this.socket = null;
    if (clearResume) this.signalingUrl = null;
  }

  #clearReconnectTimer() {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}

module.exports = { SocketClient };
