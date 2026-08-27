const PROTOCOL_VERSION = 1;

const EVENTS = Object.freeze({
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_RESUME: 'room:resume',
  ROOM_LEAVE: 'room:leave',
  ROOM_PING: 'room:ping',
  ROOM_HOST_ENDED: 'room:host-ended',
  ROOM_STATE: 'room:state',
  ROOM_SETTINGS_UPDATE: 'room:settings-update',
  ROOM_PERMISSION_UPDATE: 'room:permission-update',
  PEER_OFFER: 'peer:offer',
  PEER_ANSWER: 'peer:answer',
  PEER_ICE: 'peer:ice',
  PARTICIPANT_MUTED: 'participant:muted',
  PARTICIPANT_PROFILE: 'participant:profile',
  PARTICIPANT_LATENCY: 'participant:latency',
  SCREEN_START_REQUEST: 'screen:start-request',
  SCREEN_STARTED: 'screen:started',
  SCREEN_STOP: 'screen:stop',
  SCREEN_STOPPED: 'screen:stopped',
  SCREEN_SUBSCRIBE_REQUEST: 'screen:subscribe-request',
  SCREEN_UNSUBSCRIBE_REQUEST: 'screen:unsubscribe-request',
  SCREEN_VIEWER_JOINED: 'screen:viewer-joined',
  SCREEN_VIEWER_LEFT: 'screen:viewer-left',
  CHAT_MESSAGE: 'chat:message',
  VOTE_START: 'vote:start',
  VOTE_CAST: 'vote:cast',
  VOTE_STATE: 'vote:state',
  MODERATION_FORCED_MUTE: 'moderation:forced-mute',
  MODERATION_BANNED: 'moderation:banned',
  MODERATION_BANS_LIST: 'moderation:bans-list',
  MODERATION_BAN_REVOKE: 'moderation:ban-revoke'
});

const ERROR_CODES = Object.freeze({
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_PROTOCOL: 'INVALID_PROTOCOL',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_EXISTS: 'ROOM_EXISTS',
  ROOM_FULL: 'ROOM_FULL',
  ALREADY_IN_ROOM: 'ALREADY_IN_ROOM',
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  PARTICIPANT_NOT_FOUND: 'PARTICIPANT_NOT_FOUND',
  SCREEN_BUSY: 'SCREEN_BUSY',
  SCREEN_NOT_ACTIVE: 'SCREEN_NOT_ACTIVE',
  NOT_SCREEN_OWNER: 'NOT_SCREEN_OWNER',
  RATE_LIMITED: 'RATE_LIMITED',
  MESSAGE_TOO_LARGE: 'MESSAGE_TOO_LARGE',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  BANNED: 'BANNED',
  VOTE_NOT_FOUND: 'VOTE_NOT_FOUND',
  ALREADY_VOTED: 'ALREADY_VOTED',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
});

function ok(data = {}) {
  return { ok: true, data, protocolVersion: PROTOCOL_VERSION };
}

function fail(errorCode, message, details = undefined) {
  return {
    ok: false,
    errorCode,
    message,
    ...(details ? { details } : {}),
    protocolVersion: PROTOCOL_VERSION
  };
}

module.exports = { ERROR_CODES, EVENTS, PROTOCOL_VERSION, fail, ok };
