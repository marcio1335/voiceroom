const {
  DEFAULT_MAX_USERS_PER_ROOM,
  DEFAULT_ROOM_CODE_LENGTH,
  DEFAULT_SIGNALING_PORT,
  SIGNALING_PORT_FALLBACK_ATTEMPTS,
  LOCAL_ROOM_CODE
} = require('../../../shared/config');
const { createSignalingServer } = require('./signaling-server');

function normalizeServerError(error, port = DEFAULT_SIGNALING_PORT, attempts = 1) {
  const normalized = error instanceof Error ? error : new Error(String(error));
  if (normalized.code === 'EADDRINUSE') {
    normalized.publicCode = 'PORT_IN_USE';
    normalized.publicMessage = attempts > 1
      ? `Não foi possível criar a sala: as portas ${port} a ${Math.min(port + attempts - 1, 65_535)} estão ocupadas.`
      : `A porta ${port} já está sendo utilizada por outro aplicativo.`;
  } else if (normalized.code === 'EADDRNOTAVAIL') {
    normalized.publicCode = 'ADDRESS_UNAVAILABLE';
    normalized.publicMessage = 'O IP selecionado não está mais disponível. Verifique a VPN e tente novamente.';
  } else if (normalized.code === 'EACCES') {
    normalized.publicCode = 'PERMISSION_DENIED';
    normalized.publicMessage = 'O VoiceRoom não recebeu permissão para abrir a porta selecionada.';
  } else {
    normalized.publicCode ||= 'LOCAL_SERVER_ERROR';
    normalized.publicMessage ||= 'Não foi possível iniciar a sala local.';
  }
  return normalized;
}

class LocalServerController {
  constructor({ onState = () => {}, createServer = createSignalingServer, historyFile = null } = {}) {
    this.onState = onState;
    this.createServer = createServer;
    this.historyFile = historyFile;
    this.server = null;
    this.status = Object.freeze({
      state: 'stopped',
      running: false,
      host: null,
      port: DEFAULT_SIGNALING_PORT,
      roomCode: LOCAL_ROOM_CODE
    });
    this.startPromise = null;
    this.stopPromise = null;
  }

  #publish(status) {
    this.status = Object.freeze({ ...status });
    try { this.onState(this.status); } catch { /* listeners não podem quebrar o lifecycle */ }
    return this.status;
  }

  startLocalServer({
    ip,
    port = DEFAULT_SIGNALING_PORT,
    allowPortFallback = false,
    maxPortAttempts = SIGNALING_PORT_FALLBACK_ATTEMPTS
  } = {}) {
    if (this.status.running) return Promise.resolve(this.status);
    if (this.stopPromise) {
      return this.stopPromise.then(() => this.startLocalServer({ ip, port, allowPortFallback, maxPortAttempts }));
    }
    if (this.startPromise) return this.startPromise;
    if (typeof ip !== 'string' || !ip) {
      const error = new Error('Selecione um IP da rede antes de criar a sala.');
      error.publicCode = 'INVALID_BIND_ADDRESS';
      return Promise.reject(error);
    }

    this.#publish({ ...this.status, state: 'starting', running: false, host: ip, port: Number(port) });
    this.startPromise = (async () => {
      const requestedPort = Number(port);
      const attempts = allowPortFallback
        ? Math.max(1, Math.min(Number(maxPortAttempts) || 1, 65_536 - requestedPort))
        : 1;
      let lastError;
      try {
        for (let offset = 0; offset < attempts; offset += 1) {
          const candidatePort = requestedPort + offset;
          const server = this.createServer({
            host: ip,
            port: candidatePort,
            maxUsersPerRoom: DEFAULT_MAX_USERS_PER_ROOM,
            roomCodeLength: DEFAULT_ROOM_CODE_LENGTH,
            roomCode: LOCAL_ROOM_CODE,
            allowedOrigin: '*',
            historyFile: this.historyFile
          });
          this.server = server;
          try {
            const result = await server.start();
            return this.#publish({
              ...result,
              state: 'running',
              running: true,
              roomCode: LOCAL_ROOM_CODE,
              requestedPort,
              fallbackUsed: candidatePort !== requestedPort
            });
          } catch (error) {
            try { await server.stop(); } catch { /* cleanup best effort */ }
            if (this.server === server) this.server = null;
            lastError = error;
            if (error?.code !== 'EADDRINUSE' || offset === attempts - 1) break;
          }
        }
        const normalized = normalizeServerError(lastError, requestedPort, attempts);
        this.#publish({
          state: 'error',
          running: false,
          host: ip,
          port: requestedPort,
          roomCode: LOCAL_ROOM_CODE,
          errorCode: normalized.publicCode,
          message: normalized.publicMessage
        });
        throw normalized;
      } finally {
        this.startPromise = null;
      }
    })();
    return this.startPromise;
  }

  stopLocalServer({ notify = true, reason = 'host_ended' } = {}) {
    if (this.stopPromise) return this.stopPromise;
    const server = this.server;
    if (!server) {
      return Promise.resolve(this.#publish({
        state: 'stopped',
        running: false,
        host: null,
        port: DEFAULT_SIGNALING_PORT,
        roomCode: LOCAL_ROOM_CODE
      }));
    }
    this.#publish({ ...this.status, state: 'stopping', running: false });
    this.stopPromise = (async () => {
      try {
        await server.stop({ notify, reason });
      } finally {
        if (this.server === server) this.server = null;
        this.#publish({
          state: 'stopped',
          running: false,
          host: null,
          port: DEFAULT_SIGNALING_PORT,
          roomCode: LOCAL_ROOM_CODE
        });
        this.stopPromise = null;
      }
      return this.status;
    })();
    return this.stopPromise;
  }

  getServerStatus() {
    return this.status;
  }
}

const defaultController = new LocalServerController();

function startLocalServer(ip, port = DEFAULT_SIGNALING_PORT) {
  return defaultController.startLocalServer({ ip, port });
}

function stopLocalServer(options) {
  return defaultController.stopLocalServer(options);
}

function getServerStatus() {
  return defaultController.getServerStatus();
}

module.exports = {
  LocalServerController,
  getServerStatus,
  normalizeServerError,
  startLocalServer,
  stopLocalServer
};
