const http = require('node:http');
const { Server } = require('socket.io');
const { getServerConfig } = require('../../shared/config');
const { ERROR_CODES, EVENTS, PROTOCOL_VERSION, fail, ok } = require('../../shared/protocol');
const { RateLimiter } = require('./rate-limit');
const { RoomStore } = require('./rooms');
const {
  assertProtocolVersion,
  assertResumeToken,
  assertSignalPayload,
  assertTargetParticipant,
  normalizeDisplayName,
  normalizeRoomCode
} = require('./validation');

const config = getServerConfig();
const rooms = new RoomStore({
  ...config,
  onParticipantExpired: (removed) => {
    if (removed && !removed.roomDeleted) broadcastRoom(io, removed.room);
  }
});
const eventLimiter = new RateLimiter({ windowMs: 10_000, max: 80 });
const roomActionLimiter = new RateLimiter({ windowMs: 60_000, max: 20 });

function messageFor(error) {
  const messages = {
    [ERROR_CODES.ROOM_NOT_FOUND]: 'Esta sala não existe.',
    [ERROR_CODES.ROOM_FULL]: 'A sala atingiu o limite de 5 participantes.',
    [ERROR_CODES.SCREEN_BUSY]: 'A sala já atingiu o limite de 2 transmissões.',
    [ERROR_CODES.SCREEN_NOT_ACTIVE]: 'Essa transmissão não está ativa.',
    [ERROR_CODES.NOT_SCREEN_OWNER]: 'Você não é o dono do compartilhamento atual.',
    [ERROR_CODES.RATE_LIMITED]: 'Muitas tentativas. Aguarde alguns segundos.',
    [ERROR_CODES.INVALID_PROTOCOL]: 'A versão do aplicativo não é compatível com este servidor.',
    [ERROR_CODES.NOT_IN_ROOM]: 'Você não está em uma sala.'
  };
  return messages[error.message] || messages[error] || 'Não foi possível concluir a operação.';
}

function errorCodeFor(error) {
  return Object.values(ERROR_CODES).includes(error.message) ? error.message : ERROR_CODES.INVALID_REQUEST;
}

function withGuard(socket, eventName, handler, { roomAction = false } = {}) {
  return (payload = {}, ack = () => {}) => {
    const key = `${socket.handshake.address}:${eventName}`;
    if (!eventLimiter.allow(key) || (roomAction && !roomActionLimiter.allow(`${socket.handshake.address}:${eventName}`))) {
      ack(fail(ERROR_CODES.RATE_LIMITED, messageFor(ERROR_CODES.RATE_LIMITED)));
      return;
    }
    try {
      const result = handler(payload);
      ack(ok(result));
    } catch (error) {
      const errorCode = errorCodeFor(error);
      ack(fail(errorCode, messageFor(error)));
    }
  };
}

function assertPayload(payload) {
  assertProtocolVersion(payload.protocolVersion, PROTOCOL_VERSION);
  return payload;
}

function getBoundParticipant(socket) {
  return rooms.findBySocket(socket.id);
}

function broadcastRoom(io, room) {
  if (!room) return;
  io.to(room.code).emit(EVENTS.ROOM_STATE, { room: rooms.serializeRoom(room), protocolVersion: PROTOCOL_VERSION });
}

function bindSocket(io, socket) {
  socket.on(EVENTS.ROOM_CREATE, withGuard(socket, EVENTS.ROOM_CREATE, (payload) => {
    assertPayload(payload);
    if (getBoundParticipant(socket)) throw new Error('ALREADY_IN_ROOM');
    const displayName = normalizeDisplayName(payload.displayName);
    const created = rooms.createRoom(displayName);
    created.participant.socketId = socket.id;
    socket.join(created.room.code);
    socket.data.participantId = created.participant.participantId;
    socket.data.roomCode = created.room.code;
    return {
      participantId: created.participant.participantId,
      resumeToken: created.participant.resumeToken,
      room: rooms.serializeRoom(created.room)
    };
  }, { roomAction: true }));

  socket.on(EVENTS.ROOM_JOIN, withGuard(socket, EVENTS.ROOM_JOIN, (payload) => {
    assertPayload(payload);
    if (getBoundParticipant(socket)) throw new Error('ALREADY_IN_ROOM');
    const displayName = normalizeDisplayName(payload.displayName);
    const code = normalizeRoomCode(payload.roomCode, config.roomCodeLength);
    const joined = rooms.joinRoom(code, displayName);
    joined.participant.socketId = socket.id;
    socket.join(code);
    socket.data.participantId = joined.participant.participantId;
    socket.data.roomCode = code;
    broadcastRoom(io, joined.room);
    return {
      participantId: joined.participant.participantId,
      resumeToken: joined.participant.resumeToken,
      room: rooms.serializeRoom(joined.room)
    };
  }, { roomAction: true }));

  socket.on(EVENTS.ROOM_RESUME, withGuard(socket, EVENTS.ROOM_RESUME, (payload) => {
    assertPayload(payload);
    if (getBoundParticipant(socket)) throw new Error('ALREADY_IN_ROOM');
    const code = normalizeRoomCode(payload.roomCode, config.roomCodeLength);
    const resumed = rooms.resumeRoom(code, assertResumeToken(payload.resumeToken), socket.id);
    socket.join(code);
    socket.data.participantId = resumed.participant.participantId;
    socket.data.roomCode = code;
    broadcastRoom(io, resumed.room);
    return { participantId: resumed.participant.participantId, room: rooms.serializeRoom(resumed.room) };
  }));

  socket.on(EVENTS.ROOM_PING, withGuard(socket, EVENTS.ROOM_PING, (payload) => {
    assertPayload(payload);
    return { serverTimestamp: Date.now() };
  }));

  socket.on(EVENTS.ROOM_LEAVE, withGuard(socket, EVENTS.ROOM_LEAVE, (payload) => {
    assertPayload(payload);
    const found = getBoundParticipant(socket);
    if (!found) throw new Error('NOT_IN_ROOM');
    const wasScreenSharing = Boolean(found.participant.screenSharing);
    const screenParticipantId = found.participant.participantId;
    const removed = rooms.leaveSocket(socket.id);
    if (wasScreenSharing) {
      io.to(found.room.code).emit(EVENTS.SCREEN_STOPPED, {
        participantId: screenParticipantId,
        protocolVersion: PROTOCOL_VERSION
      });
    }
    socket.leave(found.room.code);
    socket.data.participantId = undefined;
    socket.data.roomCode = undefined;
    broadcastRoom(io, removed.roomDeleted ? null : removed.room);
    return { left: true };
  }));

  socket.on(EVENTS.PARTICIPANT_MUTED, withGuard(socket, EVENTS.PARTICIPANT_MUTED, (payload) => {
    assertPayload(payload);
    const updated = rooms.setMuted(socket.id, Boolean(payload.muted));
    broadcastRoom(io, updated.room);
    return { muted: updated.participant.muted };
  }));

  for (const eventName of [EVENTS.PEER_OFFER, EVENTS.PEER_ANSWER, EVENTS.PEER_ICE]) {
    socket.on(eventName, withGuard(socket, eventName, (payload) => {
      assertPayload(payload);
      const found = getBoundParticipant(socket);
      if (!found) throw new Error('NOT_IN_ROOM');
      const targetId = assertTargetParticipant(payload.targetParticipantId);
      const target = found.room.participants.get(targetId);
      if (!target || !target.socketId) throw new Error('PARTICIPANT_NOT_FOUND');
      const signal = assertSignalPayload(payload.signal);
      io.to(target.socketId).emit(eventName, {
        fromParticipantId: found.participant.participantId,
        signal,
        protocolVersion: PROTOCOL_VERSION
      });
      return { forwarded: true };
    }));
  }

  socket.on(EVENTS.SCREEN_START_REQUEST, withGuard(socket, EVENTS.SCREEN_START_REQUEST, (payload) => {
    assertPayload(payload);
    const started = rooms.startScreenShare(socket.id);
    io.to(started.room.code).emit(EVENTS.SCREEN_STARTED, {
      participantId: started.participant.participantId,
      protocolVersion: PROTOCOL_VERSION
    });
    broadcastRoom(io, started.room);
    return { started: true };
  }));

  socket.on(EVENTS.SCREEN_STOP, withGuard(socket, EVENTS.SCREEN_STOP, (payload) => {
    assertPayload(payload);
    const stopped = rooms.stopScreenShare(socket.id);
    io.to(stopped.room.code).emit(EVENTS.SCREEN_STOPPED, {
      participantId: stopped.participant.participantId,
      protocolVersion: PROTOCOL_VERSION
    });
    broadcastRoom(io, stopped.room);
    return { stopped: true };
  }));

  for (const [requestEvent, ownerEvent] of [
    [EVENTS.SCREEN_SUBSCRIBE_REQUEST, EVENTS.SCREEN_VIEWER_JOINED],
    [EVENTS.SCREEN_UNSUBSCRIBE_REQUEST, EVENTS.SCREEN_VIEWER_LEFT]
  ]) {
    socket.on(requestEvent, withGuard(socket, requestEvent, (payload) => {
      assertPayload(payload);
      const found = getBoundParticipant(socket);
      if (!found) throw new Error('NOT_IN_ROOM');
      const ownerId = assertTargetParticipant(payload.targetParticipantId);
      if (ownerId === found.participant.participantId) throw new Error('SCREEN_NOT_ACTIVE');
      const owner = found.room.participants.get(ownerId);
      if (!owner || !owner.socketId) throw new Error('PARTICIPANT_NOT_FOUND');
      if (!found.room.screenSharingParticipantIds.includes(ownerId)) throw new Error('SCREEN_NOT_ACTIVE');
      io.to(owner.socketId).emit(ownerEvent, {
        ownerParticipantId: ownerId,
        viewerParticipantId: found.participant.participantId,
        protocolVersion: PROTOCOL_VERSION
      });
      return { forwarded: true, ownerParticipantId: ownerId };
    }));
  }

  socket.on('disconnect', () => {
    const beforeDisconnect = getBoundParticipant(socket);
    const wasScreenSharing = Boolean(beforeDisconnect?.participant.screenSharing);
    const roomCode = beforeDisconnect?.room.code;
    const participantId = beforeDisconnect?.participant.participantId;
    const found = rooms.markDisconnected(socket.id);
    if (found) {
      if (wasScreenSharing && roomCode) {
        io.to(roomCode).emit(EVENTS.SCREEN_STOPPED, {
          participantId,
          protocolVersion: PROTOCOL_VERSION
        });
      }
      broadcastRoom(io, found.room);
      console.log(JSON.stringify({ event: 'participant_disconnected', peerCount: found.room.participants.size }));
    }
  });
}

const httpServer = http.createServer((request, response) => {
  if (request.url === '/healthz' || request.url === '/readyz') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: true, ready: true, version: PROTOCOL_VERSION }));
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ ok: false, error: 'NOT_FOUND' }));
});

const io = new Server(httpServer, {
  maxHttpBufferSize: 128 * 1024,
  cors: {
    origin: config.allowedOrigin === '*' ? true : config.allowedOrigin,
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log(JSON.stringify({ event: 'socket_connected' }));
  bindSocket(io, socket);
});

if (require.main === module) {
  httpServer.listen(config.port, config.host, () => {
    console.log(`VoiceRoom signaling server listening on http://${config.host}:${config.port}`);
  });
}

module.exports = { config, httpServer, io, rooms };
