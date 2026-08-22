const { ROOM_CODE_ALPHABET } = require('../../shared/config');

const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]+$`);
const PROFILE_AVATAR_PATTERN = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_PROFILE_AVATAR_LENGTH = 32_000;

function normalizeDisplayName(value) {
  if (typeof value !== 'string') {
    throw new Error('Nome inválido');
  }
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length < 1 || name.length > 30 || /[<>]/.test(name) || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new Error('O nome deve ter entre 1 e 30 caracteres');
  }
  return name;
}

function normalizeRoomCode(value, expectedLength = 6) {
  if (typeof value !== 'string') {
    throw new Error('Código de sala inválido');
  }
  const code = value.trim().toUpperCase();
  if (code.length !== expectedLength || !ROOM_CODE_PATTERN.test(code)) {
    throw new Error('Código de sala inválido');
  }
  return code;
}

function normalizeAvatar(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > MAX_PROFILE_AVATAR_LENGTH || !PROFILE_AVATAR_PATTERN.test(value)) {
    throw new Error('Foto de perfil inválida');
  }
  return value;
}

function assertProtocolVersion(value, expectedVersion) {
  if (!Number.isInteger(value) || value !== expectedVersion) {
    throw new Error('Versão de protocolo incompatível');
  }
}

function assertParticipantId(value) {
  if (typeof value !== 'string' || !/^[a-f0-9-]{16,64}$/.test(value)) {
    throw new Error('Participante inválido');
  }
  return value;
}

function assertTargetParticipant(value) {
  return assertParticipantId(value);
}

function assertResumeToken(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{32,64}$/.test(value)) {
    throw new Error('Token de retomada inválido');
  }
  return value;
}

function assertSignalPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload de signaling inválido');
  }
  const description = payload.description;
  const candidate = payload.candidate;
  if (description !== undefined) {
    if (!description || typeof description !== 'object' ||
      !['offer', 'answer'].includes(description.type) ||
      typeof description.sdp !== 'string' || description.sdp.length > 100_000) {
      throw new Error('Descrição SDP inválida');
    }
  }
  if (candidate !== undefined) {
    if (!candidate || typeof candidate !== 'object' ||
      typeof candidate.candidate !== 'string' || candidate.candidate.length > 10_000) {
      throw new Error('ICE candidate inválido');
    }
  }
  if (description === undefined && candidate === undefined) {
    throw new Error('Payload de signaling vazio');
  }
  return payload;
}

module.exports = {
  assertParticipantId,
  assertResumeToken,
  assertSignalPayload,
  assertTargetParticipant,
  assertProtocolVersion,
  normalizeAvatar,
  normalizeDisplayName,
  normalizeRoomCode
};
