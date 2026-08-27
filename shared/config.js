const DEFAULT_ROOM_CODE_LENGTH = 6;
const DEFAULT_MAX_USERS_PER_ROOM = 5;
const DEFAULT_PROTOCOL_VERSION = 1;
const DEFAULT_SIGNALING_PORT = 32145;
const DEFAULT_CONNECTION_TIMEOUT_MS = 5_000;
const DEFAULT_RECONNECT_TIMEOUT_MS = 30_000;
// Identificador interno compatível com o alfabeto legado; não é exibido na UI.
const LOCAL_ROOM_CODE = 'VPN234';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const DEFAULT_STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

function getServerConfig(env = process.env) {
  const port = Number(env.PORT || 3000);
  const maxUsers = Number(env.MAX_USERS_PER_ROOM || DEFAULT_MAX_USERS_PER_ROOM);
  const roomCodeLength = Number(env.ROOM_CODE_LENGTH || DEFAULT_ROOM_CODE_LENGTH);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT inválida');
  }
  if (!Number.isInteger(maxUsers) || maxUsers < 2 || maxUsers > 10) {
    throw new Error('MAX_USERS_PER_ROOM deve estar entre 2 e 10');
  }
  if (!Number.isInteger(roomCodeLength) || roomCodeLength < 4 || roomCodeLength > 12) {
    throw new Error('ROOM_CODE_LENGTH deve estar entre 4 e 12');
  }

  return {
    host: env.HOST || '127.0.0.1',
    port,
    maxUsersPerRoom: maxUsers,
    roomCodeLength,
    protocolVersion: DEFAULT_PROTOCOL_VERSION,
    allowedOrigin: env.ALLOWED_ORIGIN || '*'
  };
}

function getClientConfig() {
  return {
    signalingServer: null,
    protocolVersion: DEFAULT_PROTOCOL_VERSION,
    maxUsersPerRoom: DEFAULT_MAX_USERS_PER_ROOM,
    iceServers: []
  };
}

function getLocalServerConfig(overrides = {}) {
  const port = Number(overrides.port ?? DEFAULT_SIGNALING_PORT);
  const maxUsersPerRoom = Number(overrides.maxUsersPerRoom ?? DEFAULT_MAX_USERS_PER_ROOM);
  const roomCodeLength = Number(overrides.roomCodeLength ?? DEFAULT_ROOM_CODE_LENGTH);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('SIGNALING_PORT inválida');
  if (!Number.isInteger(maxUsersPerRoom) || maxUsersPerRoom < 2 || maxUsersPerRoom > 10) {
    throw new Error('MAX_USERS_PER_ROOM deve estar entre 2 e 10');
  }
  if (!Number.isInteger(roomCodeLength) || roomCodeLength < 4 || roomCodeLength > 12) {
    throw new Error('ROOM_CODE_LENGTH deve estar entre 4 e 12');
  }
  return {
    host: overrides.host || '127.0.0.1',
    port,
    maxUsersPerRoom,
    roomCodeLength,
    protocolVersion: DEFAULT_PROTOCOL_VERSION,
    allowedOrigin: overrides.allowedOrigin || '*',
    roomCode: overrides.roomCode || LOCAL_ROOM_CODE
  };
}

module.exports = {
  DEFAULT_CONNECTION_TIMEOUT_MS,
  DEFAULT_MAX_USERS_PER_ROOM,
  DEFAULT_PROTOCOL_VERSION,
  DEFAULT_RECONNECT_TIMEOUT_MS,
  DEFAULT_ROOM_CODE_LENGTH,
  DEFAULT_SIGNALING_PORT,
  DEFAULT_STUN_SERVERS,
  LOCAL_ROOM_CODE,
  ROOM_CODE_ALPHABET,
  getClientConfig,
  getLocalServerConfig,
  getServerConfig
};
