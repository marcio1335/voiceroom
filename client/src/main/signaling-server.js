const http = require('node:http');
const crypto = require('node:crypto');
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
const { ChatHistoryStore } = require('../../../shared/chat-history');
const { ModerationStore } = require('../../../shared/moderation-store');
const {
  assertProtocolVersion,
  assertResumeToken,
  assertSignalPayload,
  assertTargetParticipant,
  normalizeAvatar,
  normalizeChatMessage,
  normalizeDisplayName,
  normalizeProfileId,
  normalizeRoomCode
} = require('../../../shared/validation');

function messageFor(error) {
  const messages = {
    [ERROR_CODES.ROOM_NOT_FOUND]: 'Não foi possível localizar uma sala nesse endereço.',
    [ERROR_CODES.ROOM_EXISTS]: 'Já existe uma sala ativa neste computador.',
    [ERROR_CODES.ROOM_FULL]: 'A sala atingiu o limite de 10 participantes.',
    [ERROR_CODES.SCREEN_BUSY]: 'A sala já atingiu o limite de 2 transmissões.',
    [ERROR_CODES.SCREEN_NOT_ACTIVE]: 'Essa transmissão não está ativa.',
    [ERROR_CODES.NOT_SCREEN_OWNER]: 'Você não é o dono do compartilhamento atual.',
    [ERROR_CODES.RATE_LIMITED]: 'Muitas tentativas. Aguarde alguns segundos.',
    [ERROR_CODES.INVALID_PROTOCOL]: 'A versão do aplicativo não é compatível com este host.',
    [ERROR_CODES.NOT_IN_ROOM]: 'Você não está em uma sala.',
    [ERROR_CODES.PARTICIPANT_NOT_FOUND]: 'O participante não está mais conectado.',
    [ERROR_CODES.PERMISSION_DENIED]: 'Você não tem permissão para alterar esta sala.',
    [ERROR_CODES.BANNED]: 'Este perfil está banido desta sala.',
    [ERROR_CODES.VOTE_NOT_FOUND]: 'Esta votação não está mais ativa.',
    [ERROR_CODES.ALREADY_VOTED]: 'Você já votou.'
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
  onHostEnded = () => {},
  historyFile = null,
  moderationFile = null
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
  const chatHistory = new ChatHistoryStore(historyFile);
  const moderation = new ModerationStore(moderationFile);
  const profileIdsByParticipant = new Map();
  const activeVotes = new Map();
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

  function serializeVote(vote, status = 'active') {
    const threshold = Math.floor(vote.eligibleParticipantIds.length / 2) + 1;
    return {
      voteId: vote.voteId,
      targetParticipantId: vote.targetParticipantId,
      targetDisplayName: vote.targetDisplayName,
      action: vote.action,
      durationSeconds: vote.durationSeconds,
      yes: vote.yes.size,
      no: vote.no.size,
      threshold,
      endsAt: vote.endsAt,
      status
    };
  }

  function publishVote(vote, status = 'active') {
    io.to(vote.roomCode).emit(EVENTS.VOTE_STATE, {
      vote: serializeVote(vote, status),
      protocolVersion: PROTOCOL_VERSION
    });
  }

  function finishVote(vote, passed) {
    if (!activeVotes.has(vote.roomCode)) return;
    activeVotes.delete(vote.roomCode);
    clearTimeout(vote.timer);
    publishVote(vote, passed ? 'passed' : 'failed');
    if (!passed) return;
    const room = rooms.getRoom(vote.roomCode);
    const target = room?.participants.get(vote.targetParticipantId);
    if (!room || !target) return;
    if (vote.action === 'mute') {
      const until = Date.now() + 30_000;
      rooms.forceMuteParticipant(room, target.participantId, true);
      if (target.socketId) io.to(target.socketId).emit(EVENTS.MODERATION_FORCED_MUTE, { until, protocolVersion: PROTOCOL_VERSION });
      broadcastRoom(io, room);
      const muteTimer = setTimeout(() => {
        const activeRoom = rooms.getRoom(vote.roomCode);
        const activeTarget = activeRoom?.participants.get(vote.targetParticipantId);
        if (!activeRoom || !activeTarget) return;
        rooms.forceMuteParticipant(activeRoom, activeTarget.participantId, false);
        if (activeTarget.socketId) io.to(activeTarget.socketId).emit(EVENTS.MODERATION_FORCED_MUTE, { until: null, protocolVersion: PROTOCOL_VERSION });
        broadcastRoom(io, activeRoom);
      }, 30_000);
      muteTimer.unref?.();
      return;
    }
    const profileId = profileIdsByParticipant.get(target.participantId);
    if (!profileId) return;
    const ban = moderation.add({ profileId, displayName: target.displayName, durationSeconds: vote.durationSeconds });
    if (target.socketId) {
      io.to(target.socketId).emit(EVENTS.MODERATION_BANNED, { ban, protocolVersion: PROTOCOL_VERSION });
      const targetSocket = io.sockets.sockets.get(target.socketId);
      rooms.removeParticipant(room.code, target.participantId);
      targetSocket?.leave(room.code);
      targetSocket?.disconnect(true);
      broadcastRoom(io, room);
    }
  }

  function evaluateVote(vote) {
    const threshold = Math.floor(vote.eligibleParticipantIds.length / 2) + 1;
    if (vote.yes.size >= threshold) finishVote(vote, true);
    else if (vote.no.size > vote.eligibleParticipantIds.length - threshold) finishVote(vote, false);
    else publishVote(vote);
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
      const requestedProfileId = payload.profileId ? normalizeProfileId(payload.profileId) : null;
      const created = rooms.createRoom(displayName, normalizeAvatar(payload.avatar), {
        code: config.roomCode || undefined
      });
      const profileId = requestedProfileId || created.participant.participantId;
      created.participant.socketId = socket.id;
      socket.join(created.room.code);
      socket.data.participantId = created.participant.participantId;
      socket.data.roomCode = created.room.code;
      socket.data.role = 'host';
      socket.data.profileId = profileId;
      profileIdsByParticipant.set(created.participant.participantId, profileId);
      return {
        participantId: created.participant.participantId,
        resumeToken: created.participant.resumeToken,
        role: 'host',
        room: rooms.serializeRoom(created.room),
        chatHistory: chatHistory.list(created.room.code, profileId)
      };
    }, { roomAction: true }));

    socket.on(EVENTS.ROOM_JOIN, withGuard(socket, EVENTS.ROOM_JOIN, (payload) => {
      assertPayload(payload);
      if (getBoundParticipant(socket)) throw new Error('ALREADY_IN_ROOM');
      const displayName = normalizeDisplayName(payload.displayName);
      const requestedProfileId = payload.profileId ? normalizeProfileId(payload.profileId) : null;
      const code = normalizeRoomCode(payload.roomCode || config.roomCode || LOCAL_ROOM_CODE, config.roomCodeLength);
      const joined = rooms.joinRoom(code, displayName, normalizeAvatar(payload.avatar));
      const profileId = requestedProfileId || joined.participant.participantId;
      const activeBan = moderation.getActive(profileId);
      if (activeBan) {
        rooms.removeParticipant(code, joined.participant.participantId);
        const error = new Error('BANNED');
        error.details = { expiresAt: activeBan.expiresAt };
        throw error;
      }
      joined.participant.socketId = socket.id;
      socket.join(code);
      socket.data.participantId = joined.participant.participantId;
      socket.data.roomCode = code;
      socket.data.role = 'guest';
      socket.data.profileId = profileId;
      profileIdsByParticipant.set(joined.participant.participantId, profileId);
      broadcastRoom(io, joined.room);
      return {
        participantId: joined.participant.participantId,
        resumeToken: joined.participant.resumeToken,
        role: 'guest',
        room: rooms.serializeRoom(joined.room),
        chatHistory: chatHistory.list(joined.room.code, profileId)
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
      socket.data.profileId = profileIdsByParticipant.get(resumed.participant.participantId) || null;
      broadcastRoom(io, resumed.room);
      return {
        participantId: resumed.participant.participantId,
        role: resumed.participant.role,
        room: rooms.serializeRoom(resumed.room),
        chatHistory: chatHistory.list(resumed.room.code, socket.data.profileId)
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

    socket.on(EVENTS.PARTICIPANT_LATENCY, withGuard(socket, EVENTS.PARTICIPANT_LATENCY, (payload) => {
      assertPayload(payload);
      const updated = rooms.setLatency(socket.id, payload.latencyMs);
      broadcastRoom(io, updated.room);
      return { latencyMs: updated.participant.latencyMs };
    }));

    socket.on(EVENTS.ROOM_SETTINGS_UPDATE, withGuard(socket, EVENTS.ROOM_SETTINGS_UPDATE, (payload) => {
      assertPayload(payload);
      const updated = rooms.updateSettings(socket.id, { chatName: payload.chatName });
      broadcastRoom(io, updated.room);
      return { room: rooms.serializeRoom(updated.room) };
    }));

    socket.on(EVENTS.ROOM_PERMISSION_UPDATE, withGuard(socket, EVENTS.ROOM_PERMISSION_UPDATE, (payload) => {
      assertPayload(payload);
      const updated = rooms.setModerator(socket.id, assertTargetParticipant(payload.targetParticipantId), Boolean(payload.allowed));
      broadcastRoom(io, updated.room);
      return { room: rooms.serializeRoom(updated.room) };
    }));

    socket.on(EVENTS.VOTE_START, withGuard(socket, EVENTS.VOTE_START, (payload) => {
      assertPayload(payload);
      const found = getBoundParticipant(socket);
      if (!found) throw new Error('NOT_IN_ROOM');
      if (activeVotes.has(found.room.code)) throw new Error('ALREADY_VOTED');
      const targetParticipantId = assertTargetParticipant(payload.targetParticipantId);
      const target = found.room.participants.get(targetParticipantId);
      if (!target || !target.socketId || targetParticipantId === found.participant.participantId) throw new Error('PARTICIPANT_NOT_FOUND');
      const action = payload.action === 'mute' ? 'mute' : payload.action === 'ban' ? 'ban' : null;
      if (!action || (action === 'ban' && target.role === 'host')) throw new Error('PERMISSION_DENIED');
      const durationSeconds = action === 'mute' ? 30 : Math.max(0, Math.min(31_536_000, Math.floor(Number(payload.durationSeconds) || 0)));
      const eligibleParticipantIds = [...found.room.participants.values()]
        .filter((participant) => participant.connected !== false && participant.socketId && participant.participantId !== targetParticipantId)
        .map((participant) => participant.participantId);
      const vote = {
        voteId: crypto.randomUUID(),
        roomCode: found.room.code,
        targetParticipantId,
        targetDisplayName: target.displayName,
        action,
        durationSeconds,
        eligibleParticipantIds,
        yes: new Set([found.participant.participantId]),
        no: new Set(),
        endsAt: Date.now() + 15_000,
        timer: null
      };
      vote.timer = setTimeout(() => finishVote(vote, false), 15_000);
      activeVotes.set(found.room.code, vote);
      evaluateVote(vote);
      return { vote: serializeVote(vote) };
    }));

    socket.on(EVENTS.VOTE_CAST, withGuard(socket, EVENTS.VOTE_CAST, (payload) => {
      assertPayload(payload);
      const found = getBoundParticipant(socket);
      if (!found) throw new Error('NOT_IN_ROOM');
      const vote = activeVotes.get(found.room.code);
      if (!vote || vote.voteId !== payload.voteId) throw new Error('VOTE_NOT_FOUND');
      if (!vote.eligibleParticipantIds.includes(found.participant.participantId)) throw new Error('PERMISSION_DENIED');
      if (vote.yes.has(found.participant.participantId) || vote.no.has(found.participant.participantId)) throw new Error('ALREADY_VOTED');
      (payload.approve ? vote.yes : vote.no).add(found.participant.participantId);
      evaluateVote(vote);
      return { vote: serializeVote(vote) };
    }));

    socket.on(EVENTS.MODERATION_BANS_LIST, withGuard(socket, EVENTS.MODERATION_BANS_LIST, (payload) => {
      assertPayload(payload);
      if (!rooms.canManageRoom(socket.id)) throw new Error('PERMISSION_DENIED');
      return { bans: moderation.list() };
    }));

    socket.on(EVENTS.MODERATION_BAN_REVOKE, withGuard(socket, EVENTS.MODERATION_BAN_REVOKE, (payload) => {
      assertPayload(payload);
      if (!rooms.canManageRoom(socket.id)) throw new Error('PERMISSION_DENIED');
      if (typeof payload.banId !== 'string' || !payload.banId) throw new Error('INVALID_REQUEST');
      return { revoked: moderation.revoke(payload.banId), bans: moderation.list() };
    }));

    socket.on(EVENTS.CHAT_MESSAGE, withGuard(socket, EVENTS.CHAT_MESSAGE, (payload) => {
      assertPayload(payload);
      const found = getBoundParticipant(socket);
      if (!found) throw new Error('NOT_IN_ROOM');
      const { kind, content } = normalizeChatMessage(payload);
      const audienceProfileIds = [...found.room.participants.values()]
        .filter((participant) => participant.socketId)
        .map((participant) => profileIdsByParticipant.get(participant.participantId));
      const message = chatHistory.append({
        roomCode: found.room.code,
        author: {
          participantId: found.participant.participantId,
          displayName: found.participant.displayName,
          avatar: found.participant.avatar
        },
        kind,
        content,
        audienceProfileIds
      });
      io.to(found.room.code).emit(EVENTS.CHAT_MESSAGE, { message, protocolVersion: PROTOCOL_VERSION });
      return { message };
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
    maxHttpBufferSize: 768 * 1024,
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
      for (const vote of activeVotes.values()) clearTimeout(vote.timer);
      activeVotes.clear();
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
