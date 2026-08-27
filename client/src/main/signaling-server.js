const http = require('node:http');
const { Server } = require('socket.io');
const {
  DEFAULT_MAX_USERS_PER_ROOM,
  DEFAULT_ROOM_CODE_LENGTH,
  DEFAULT_SIGNALING_PORT,
  DEFAULT_PROTOCOL_VERSION,
  LOCAL_ROOM_CODE
} = require('../../../shared/config');
const { ERROR_CODES, EVENTS, PROTOCOL_VERSION, fail, ok } = require('../../../shared/protocol');
const { RateLimiter } = require('../../../shared/rate-limit');
const { RoomStore } = require('../../../shared/rooms');
const {
  assertProtocolVersion,
  assertResumeToken,
  assertSignalPayload,
  assertTargetParticipant,
  normalizeAvatar,
  normalizeDisplayName,
  normalizeRoomCode
} = require('../../../shared/validation');

function messageFor(error) {
  const messages = {
    [ERROR_CODES.ROOM_NOT_FOUND]: 'Não foi possível localizar uma sala nesse endereço.',
    [ERROR_CODES.ROOM_EXISTS]: 'Já existe uma sala ativa neste computador.',
    [ERROR_CODES.ROOM_FULL]: 'A sala atingiu o limite de 5 participantes.',
    [ERROR_CODES.SCREEN_BUSY]: 'A sala já atingiu o limite de 2 transmissões.',
    [ERROR_CODES.SCREEN_NOT_ACTIVE]: 'Essa transmissão não está ativa.',
    [ERROR_CODES.NOT_SCREEN_OWNER]: 'Você não é o dono do compartilhamento atual.',
    [ERROR_CODES.RATE_LIMITED]: 'Muitas tentativas. Aguarde alguns segundos.',
    [ERROR_CODES.INVALID_PROTOCOL]: 'A versão do aplicativo não é compatível com este host.',
    [ERROR_CODES.NOT_IN_ROOM]: 'Você não está em uma sala.',
    [ERROR_CODES.PARTICIPANT_NOT_FOUND]: 'O participante não está mais conectado.'
  };
  return messages[error?.message] || messages[error] || 'Não foi possível concluir a operação.';
}

function errorCodeFor(error) {
  return Object.values(ERROR_CODES).includes(error?.message) ? error.message : ERROR_CODES.INVALID_REQUEST;
}

function createSignalingServer({
  host = '127.0.0.1',
  port = DEFAULT_SIGNALING_PORT,
  maxUsersPerRoom = DEFAULT_MAX_USERS_PER_ROOM,
  roomCodeLength = DEFAULT_ROOM_CODE_LENGTH,
  roomCode = null,
  protocolVersion = DEFAULT_PROTOCOL_VERSION,
  allowedOrigin = '*',
  closeOnHostDisconnect = false,
  onHostEnded = () => {}
} = {}) {
  const config = {
    host,
    port: Number(port),
    maxUsersPerRoom: Number(maxUsersPerRoom),
    roomCodeLength: Number(roomCodeLength),
    roomCode: roomCode || null,
    protocolVersion,
    allowedOrigin
  };
  const eventLimiter = new RateLimiter({ windowMs: 10_000, max: 80 });
  const roomActionLimiter = new RateLimiter({ windowMs: 60_000, max: 20 });
  let lifecycle = 'stopped';
  let startPromise = null;
  let stopPromise = null;

  let io;
  const rooms = new RoomStore({
    maxUsersPerRoom: config.maxUsersPerRoom,
    roomCodeLength: config.roomCodeLength,
    onParticipantExpired: (removed) => {
      if (removed && !removed.roomDeleted) broadcastRoom(io, removed.room);
    }
  });

  function broadcastRoom(targetIo, room) {
    if (!targetIo || !room) return;
    targetIo.to(room.code).emit(EVENTS.ROOM_STATE, {
      room: rooms.serializeRoom(room),
      protocolVersion: PROTOCOL_VERSION
    });
  }

  function assertPayload(payload) {
    assertProtocolVersion(payload?.protocolVersion, config.protocolVersion);
    return payload;
  }

  function getBoundParticipant(socket) {
    return rooms.findBySocket(socket.id);
  }

  function withGuard(socket, eventName, handler, { roomAction = false } = {}) {
    return (payload = {}, ack = () => {}) => {
      const key = `${socket.handshake.address}:${eventName}`;
      if (!eventLimiter.allow(key) || (roomAction && !roomActionLimiter.allow(key))) {
        ack(fail(ERROR_CODES.RATE_LIMITED, messageFor(ERROR_CODES.RATE_LIMITED)));
        return;
      }
      try {
        const result = handler(payload);
        ack(ok(result));
      } catch (error) {
        ack(fail(errorCodeFor(error), messageFor(error)));
      }
    };
  }

  function emitHostEnded(reason = 'host_ended') {
    if (!io) return;
    for (const room of rooms.rooms.values()) {
      io.to(room.code).emit(EVENTS.ROOM_HOST_ENDED, {
        reason,
        protocolVersion: PROTOCOL_VERSION
      });
    }
  }

  function endHostSession(reason) {
    emitHostEnded(reason);
    try { onHostEnded({ reason }); } catch { /* callback de integração não pode derrubar o servidor */ }
  }

  function bindSocket(socket) {
    socket.on(EVENTS.ROOM_CREATE, withGuard(socket, EVENTS.ROOM_CREATE, (payload) => {
      assertPayload(payload);
      if (getBoundParticipant(socket)) throw new Error('ALREADY_IN_ROOM');
      if (rooms.rooms.size > 0) throw new Error('ROOM_EXISTS');
      const displayName = normalizeDisplayName(payload.displayName);
      const created = rooms.createRoom(displayName, normalizeAvatar(payload.avatar), {
        code: config.roomCode || undefined
      });
      created.participant.socketId = socket.id;
      socket.join(created.room.code);
      socket.data.participantId = created.participant.participantId;
      socket.data.roomCode = created.room.code;
      socket.data.role = 'host';
      return {
        participantId: created.participant.participantId,
        resumeToken: created.participant.resumeToken,
        role: 'host',
        room: rooms.serializeRoom(created.room)
      };
    }, { roomAction: true }));

    socket.on(EVENTS.ROOM_JOIN, withGuard(socket, EVENTS.ROOM_JOIN, (payload) => {
      assertPayload(payload);
      if (getBoundParticipant(socket)) throw new Error('ALREADY_IN_ROOM');
      const displayName = normalizeDisplayName(payload.displayName);
      const code = normalizeRoomCode(payload.roomCode || config.roomCode || LOCAL_ROOM_CODE, config.roomCodeLength);
      const joined = rooms.joinRoom(code, displayName, normalizeAvatar(payload.avatar));
      joined.participant.socketId = socket.id;
      socket.join(code);
      socket.data.participantId = joined.participant.participantId;
      socket.data.roomCode = code;
      socket.data.role = 'guest';
      broadcastRoom(io, joined.room);
      return {
        participantId: joined.participant.participantId,
        resumeToken: joined.participant.resumeToken,
        role: 'guest',
        room: rooms.serializeRoom(joined.room)
      };
    }, { roomAction: true }));

    socket.on(EVENTS.ROOM_RESUME, withGuard(socket, EVENTS.ROOM_RESUME, (payload) => {
      assertPayload(payload);
      if (getBoundParticipant(socket)) throw new Error('ALREADY_IN_ROOM');
      const code = normalizeRoomCode(payload.roomCode || config.roomCode || LOCAL_ROOM_CODE, config.roomCodeLength);
      const resumed = rooms.resumeRoom(code, assertResumeToken(payload.resumeToken), socket.id);
      socket.join(code);
      socket.data.participantId = resumed.participant.participantId;
      socket.data.roomCode = code;
      socket.data.role = resumed.participant.role;
      broadcastRoom(io, resumed.room);
      return {
        participantId: resumed.participant.participantId,
        role: resumed.participant.role,
        room: rooms.serializeRoom(resumed.room)
      };
    }));

    socket.on(EVENTS.ROOM_PING, withGuard(socket, EVENTS.ROOM_PING, (payload) => {
      assertPayload(payload);
      return { serverTimestamp: Date.now() };
    }));

    socket.on(EVENTS.ROOM_LEAVE, withGuard(socket, EVENTS.ROOM_LEAVE, (payload) => {
      assertPayload(payload);
      const found = getBoundParticipant(socket);
      if (!found) throw new Error('NOT_IN_ROOM');
      const wasHost = found.participant.role === 'host' || socket.data.role === 'host';
      const wasScreenSharing = Boolean(found.participant.screenSharing);
      const screenParticipantId = found.participant.participantId;
      const roomCode = found.room.code;
      const removed = rooms.leaveSocket(socket.id);
      if (wasScreenSharing) {
        io.to(roomCode).emit(EVENTS.SCREEN_STOPPED, {
          participantId: screenParticipantId,
          protocolVersion: PROTOCOL_VERSION
        });
      }
      socket.leave(roomCode);
      socket.data.participantId = undefined;
      socket.data.roomCode = undefined;
      socket.data.role = undefined;
      broadcastRoom(io, removed?.roomDeleted ? null : removed?.room);
      if (wasHost) endHostSession('host_left');
      return { left: true, hostEnded: wasHost };
    }));

    socket.on(EVENTS.PARTICIPANT_MUTED, withGuard(socket, EVENTS.PARTICIPANT_MUTED, (payload) => {
      assertPayload(payload);
      const updated = rooms.setMuted(socket.id, Boolean(payload.muted));
      broadcastRoom(io, updated.room);
      return { muted: updated.participant.muted };
    }));

    socket.on(EVENTS.PARTICIPANT_PROFILE, withGuard(socket, EVENTS.PARTICIPANT_PROFILE, (payload) => {
      assertPayload(payload);
      const updated = rooms.setAvatar(socket.id, normalizeAvatar(payload.avatar));
      broadcastRoom(io, updated.room);
      return { avatar: updated.participant.avatar };
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
      const wasHost = beforeDisconnect?.participant.role === 'host' || socket.data.role === 'host';
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
      }
      if (wasHost && closeOnHostDisconnect) endHostSession('host_disconnect');
    });
  }

  const httpServer = http.createServer((request, response) => {
    if (request.url === '/health' || request.url === '/healthz' || request.url === '/readyz') {
      response.writeHead(200, {
        'access-control-allow-origin': '*',
        'content-type': 'application/json; charset=utf-8'
      });
      response.end(JSON.stringify({ status: 'ok', app: 'VoiceRoom', ok: true, ready: true, version: config.protocolVersion }));
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: false, error: 'NOT_FOUND' }));
  });

  io = new Server(httpServer, {
    maxHttpBufferSize: 128 * 1024,
    cors: {
      origin: config.allowedOrigin === '*' ? true : config.allowedOrigin,
      methods: ['GET', 'POST']
    }
  });
  io.on('connection', (socket) => bindSocket(socket));

  function start() {
    if (lifecycle === 'running') return Promise.resolve(getServerStatus());
    if (startPromise) return startPromise;
    lifecycle = 'starting';
    startPromise = new Promise((resolve, reject) => {
      const onError = (error) => {
        httpServer.removeListener('listening', onListening);
        lifecycle = 'error';
        startPromise = null;
        reject(error);
      };
      const onListening = () => {
        httpServer.removeListener('error', onError);
        lifecycle = 'running';
        startPromise = null;
        resolve(getServerStatus());
      };
      httpServer.once('error', onError);
      httpServer.once('listening', onListening);
      httpServer.listen(config.port, config.host);
    });
    return startPromise;
  }

  async function stop({ notify = false, reason = 'host_ended' } = {}) {
    if (stopPromise) return stopPromise;
    if (lifecycle === 'stopped' && !httpServer.listening) {
      rooms.dispose();
      return getServerStatus();
    }
    lifecycle = 'stopping';
    if (notify) emitHostEnded(reason);
    stopPromise = (async () => {
      await new Promise((resolve) => {
        try { io.close(() => resolve()); } catch { resolve(); }
      });
      if (httpServer.listening) {
        await new Promise((resolve) => httpServer.close(() => resolve()));
      }
      rooms.dispose();
      eventLimiter.clear();
      roomActionLimiter.clear();
      lifecycle = 'stopped';
      stopPromise = null;
      startPromise = null;
      return getServerStatus();
    })();
    return stopPromise;
  }

  function getServerStatus() {
    return {
      state: lifecycle,
      running: lifecycle === 'running' && httpServer.listening,
      host: config.host,
      port: config.port,
      roomCode: config.roomCode || null
    };
  }

  return { config, httpServer, io, rooms, start, stop, getServerStatus, emitHostEnded, endHostSession };
}

module.exports = { createSignalingServer };
