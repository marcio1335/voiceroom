const crypto = require('node:crypto');
const {
  DEFAULT_MAX_USERS_PER_ROOM,
  DEFAULT_ROOM_CODE_LENGTH,
  ROOM_CODE_ALPHABET
} = require('../../shared/config');

const RECONNECT_GRACE_MS = 30_000;

function randomId(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

function createRoomCode(length = DEFAULT_ROOM_CODE_LENGTH) {
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

class RoomStore {
  constructor({ maxUsersPerRoom = DEFAULT_MAX_USERS_PER_ROOM, roomCodeLength = DEFAULT_ROOM_CODE_LENGTH, reconnectGraceMs = RECONNECT_GRACE_MS, now = () => Date.now(), onParticipantExpired = () => {} } = {}) {
    this.maxUsersPerRoom = maxUsersPerRoom;
    this.roomCodeLength = roomCodeLength;
    this.reconnectGraceMs = reconnectGraceMs;
    this.now = now;
    this.onParticipantExpired = onParticipantExpired;
    this.rooms = new Map();
    this.resumeTimers = new Map();
  }

  createRoom(displayName) {
    let code;
    for (let attempts = 0; attempts < 20; attempts += 1) {
      const candidate = createRoomCode(this.roomCodeLength);
      if (!this.rooms.has(candidate)) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      throw new Error('Não foi possível gerar o código da sala');
    }
    const participant = this.#newParticipant(displayName);
    const room = { code, participants: new Map([[participant.participantId, participant]]), screenSharingParticipantId: null, createdAt: this.now() };
    this.rooms.set(code, room);
    return { room, participant };
  }

  joinRoom(code, displayName) {
    const room = this.rooms.get(code);
    if (!room) {
      throw new Error('ROOM_NOT_FOUND');
    }
    if (room.participants.size >= this.maxUsersPerRoom) {
      throw new Error('ROOM_FULL');
    }
    const participant = this.#newParticipant(displayName);
    room.participants.set(participant.participantId, participant);
    return { room, participant };
  }

  resumeRoom(code, resumeToken, socketId) {
    const room = this.rooms.get(code);
    if (!room) {
      throw new Error('ROOM_NOT_FOUND');
    }
    const participant = [...room.participants.values()].find((item) => item.resumeToken === resumeToken);
    if (!participant) {
      throw new Error('PARTICIPANT_NOT_FOUND');
    }
    if (participant.socketId) {
      throw new Error('ALREADY_IN_ROOM');
    }
    participant.socketId = socketId;
    participant.disconnectedAt = null;
    this.#clearResumeTimer(participant.participantId);
    return { room, participant };
  }

  findBySocket(socketId) {
    for (const room of this.rooms.values()) {
      for (const participant of room.participants.values()) {
        if (participant.socketId === socketId) {
          return { room, participant };
        }
      }
    }
    return null;
  }

  getRoom(code) {
    return this.rooms.get(code) || null;
  }

  markDisconnected(socketId) {
    const found = this.findBySocket(socketId);
    if (!found) return null;
    const { participant } = found;
    participant.socketId = null;
    participant.disconnectedAt = this.now();
    if (found.room.screenSharingParticipantId === participant.participantId) {
      found.room.screenSharingParticipantId = null;
      participant.screenSharing = false;
    }
    this.#clearResumeTimer(participant.participantId);
    const timer = setTimeout(() => {
      const removed = this.removeParticipant(found.room.code, participant.participantId);
      this.onParticipantExpired(removed);
    }, this.reconnectGraceMs);
    this.resumeTimers.set(participant.participantId, timer);
    return found;
  }

  leaveSocket(socketId) {
    const found = this.findBySocket(socketId);
    if (!found) return null;
    return this.removeParticipant(found.room.code, found.participant.participantId);
  }

  removeParticipant(code, participantId) {
    const room = this.rooms.get(code);
    if (!room) return null;
    const participant = room.participants.get(participantId);
    if (!participant) return null;
    this.#clearResumeTimer(participantId);
    room.participants.delete(participantId);
    if (room.screenSharingParticipantId === participantId) {
      room.screenSharingParticipantId = null;
    }
    if (room.participants.size === 0) {
      this.rooms.delete(code);
    }
    return { room, participant, roomDeleted: !this.rooms.has(code) };
  }

  setMuted(socketId, muted) {
    const found = this.findBySocket(socketId);
    if (!found) throw new Error('NOT_IN_ROOM');
    found.participant.muted = Boolean(muted);
    return found;
  }

  startScreenShare(socketId) {
    const found = this.findBySocket(socketId);
    if (!found) throw new Error('NOT_IN_ROOM');
    if (found.room.screenSharingParticipantId && found.room.screenSharingParticipantId !== found.participant.participantId) {
      throw new Error('SCREEN_BUSY');
    }
    found.room.screenSharingParticipantId = found.participant.participantId;
    found.participant.screenSharing = true;
    return found;
  }

  stopScreenShare(socketId) {
    const found = this.findBySocket(socketId);
    if (!found) throw new Error('NOT_IN_ROOM');
    if (found.room.screenSharingParticipantId !== found.participant.participantId) {
      throw new Error('NOT_SCREEN_OWNER');
    }
    found.room.screenSharingParticipantId = null;
    found.participant.screenSharing = false;
    return found;
  }

  serializeRoom(room) {
    return {
      code: room.code,
      participants: [...room.participants.values()].map((participant) => ({
        participantId: participant.participantId,
        displayName: participant.displayName,
        muted: participant.muted,
        screenSharing: participant.screenSharing,
        connected: Boolean(participant.socketId)
      })),
      screenSharingParticipantId: room.screenSharingParticipantId
    };
  }

  #newParticipant(displayName) {
    return {
      participantId: randomId(),
      resumeToken: randomId(24),
      displayName,
      socketId: null,
      muted: false,
      screenSharing: false,
      disconnectedAt: null
    };
  }

  #clearResumeTimer(participantId) {
    const timer = this.resumeTimers.get(participantId);
    if (timer) clearTimeout(timer);
    this.resumeTimers.delete(participantId);
  }
}

module.exports = { RECONNECT_GRACE_MS, RoomStore, createRoomCode };
