const PROTOCOL_VERSION = 1;

const EVENTS = Object.freeze({
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_RESUME: 'room:resume',
  ROOM_LEAVE: 'room:leave',
  ROOM_PING: 'room:ping',
  ROOM_STATE: 'room:state',
  PEER_OFFER: 'peer:offer',
  PEER_ANSWER: 'peer:answer',
  PEER_ICE: 'peer:ice',
  PARTICIPANT_MUTED: 'participant:muted',
  SCREEN_START_REQUEST: 'screen:start-request',
  SCREEN_STARTED: 'screen:started',
  SCREEN_STOP: 'screen:stop',
  SCREEN_STOPPED: 'screen:stopped',
  SCREEN_SUBSCRIBE_REQUEST: 'screen:subscribe-request',
  SCREEN_UNSUBSCRIBE_REQUEST: 'screen:unsubscribe-request',
  SCREEN_VIEWER_JOINED: 'screen:viewer-joined',
  SCREEN_VIEWER_LEFT: 'screen:viewer-left'
});

const ERROR_CODES = Object.freeze({
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_PROTOCOL: 'INVALID_PROTOCOL',
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ALREADY_IN_ROOM: 'ALREADY_IN_ROOM',
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  PARTICIPANT_NOT_FOUND: 'PARTICIPANT_NOT_FOUND',
  SCREEN_BUSY: 'SCREEN_BUSY',
  SCREEN_NOT_ACTIVE: 'SCREEN_NOT_ACTIVE',
  NOT_SCREEN_OWNER: 'NOT_SCREEN_OWNER',
  RATE_LIMITED: 'RATE_LIMITED',
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
