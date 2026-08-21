const DEFAULT_ROOM_CODE_LENGTH = 6;
const DEFAULT_MAX_USERS_PER_ROOM = 5;
const DEFAULT_PROTOCOL_VERSION = 1;

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const DEFAULT_STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
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

function getClientConfig(env = globalThis) {
  const signalingServer = env.VOICEROOM_SIGNALING_SERVER || 'http://localhost:3000';
  return {
    signalingServer,
    protocolVersion: DEFAULT_PROTOCOL_VERSION,
    maxUsersPerRoom: DEFAULT_MAX_USERS_PER_ROOM,
    iceServers: DEFAULT_STUN_SERVERS
  };
}

module.exports = {
  DEFAULT_MAX_USERS_PER_ROOM,
  DEFAULT_PROTOCOL_VERSION,
  DEFAULT_ROOM_CODE_LENGTH,
  DEFAULT_STUN_SERVERS,
  ROOM_CODE_ALPHABET,
  getClientConfig,
  getServerConfig
};

