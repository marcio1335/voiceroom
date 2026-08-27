const test = require('node:test');
const assert = require('node:assert/strict');
const { RoomStore, createRoomCode } = require('../server/src/rooms');
const { normalizeAvatar, normalizeDisplayName, normalizeRoomCode } = require('../server/src/validation');
const { ROOM_CODE_ALPHABET } = require('../shared/config');

test('gera código de sala sem caracteres ambíguos', () => {
  const code = createRoomCode(6);
  assert.equal(code.length, 6);
  assert.match(code, /^[A-Z2-9]+$/);
  assert.ok([...code].every((character) => ROOM_CODE_ALPHABET.includes(character)));
});

test('cria sala, entra, atualiza mute e latência e remove sala vazia', () => {
  const store = new RoomStore({ maxUsersPerRoom: 2 });
  const created = store.createRoom('Marcio');
  created.participant.socketId = 'socket-a';
  const joined = store.joinRoom(created.room.code, 'João');
  joined.participant.socketId = 'socket-b';

  assert.equal(created.room.participants.size, 2);
  assert.equal(store.setMuted('socket-b', true).participant.muted, true);
  assert.equal(store.setLatency('socket-b', 42.7).participant.latencyMs, 43);
  assert.equal(store.serializeRoom(created.room).participants[1].latencyMs, 43);
  assert.throws(() => store.joinRoom(created.room.code, 'Pedro'), /ROOM_FULL/);

  const removedA = store.leaveSocket('socket-a');
  assert.equal(removedA.roomDeleted, false);
  const removedB = store.leaveSocket('socket-b');
  assert.equal(removedB.roomDeleted, true);
  assert.equal(store.getRoom(created.room.code), null);
});

test('permite até duas transmissões e bloqueia a terceira', () => {
  const store = new RoomStore();
  const created = store.createRoom('A');
  created.participant.socketId = 'socket-a';
  const joined = store.joinRoom(created.room.code, 'B');
  joined.participant.socketId = 'socket-b';

  store.startScreenShare('socket-a');
  assert.equal(store.startScreenShare('socket-b').participant.screenSharing, true);
  assert.throws(() => {
    const extra = store.joinRoom(created.room.code, 'C');
    extra.participant.socketId = 'socket-c';
    store.startScreenShare('socket-c');
  }, /SCREEN_BUSY/);
  store.stopScreenShare('socket-a');
  assert.equal(store.stopScreenShare('socket-b').participant.screenSharing, false);
  assert.equal(store.startScreenShare('socket-a').participant.screenSharing, true);
});

test('host delega configuração da sala e moderador renomeia o chat', () => {
  const store = new RoomStore();
  const created = store.createRoom('Host');
  created.participant.socketId = 'socket-host';
  const joined = store.joinRoom(created.room.code, 'Moderador');
  joined.participant.socketId = 'socket-moderator';

  assert.throws(() => store.updateSettings('socket-moderator', { chatName: 'Projetos' }), /PERMISSION_DENIED/);
  store.setModerator('socket-host', joined.participant.participantId, true);
  assert.equal(store.updateSettings('socket-moderator', { chatName: 'Projetos' }).room.chatName, 'Projetos');
  assert.deepEqual(store.serializeRoom(created.room).moderatorParticipantIds, [joined.participant.participantId]);
});

test('normaliza nome e código e rejeita entradas inválidas', () => {
  assert.equal(normalizeDisplayName('  João   da Silva '), 'João da Silva');
  assert.equal(normalizeRoomCode(' abcd23 '), 'ABCD23');
  assert.throws(() => normalizeDisplayName(''), /1 e 30/);
  assert.throws(() => normalizeDisplayName('<script>alert(1)</script>'), /1 e 30/);
  assert.throws(() => normalizeRoomCode('ABC123'), /Código/);
});

test('aceita apenas miniaturas de perfil em data URL', () => {
  const avatar = 'data:image/jpeg;base64,AA==';
  assert.equal(normalizeAvatar(avatar), avatar);
  assert.equal(normalizeAvatar(null), null);
  assert.throws(() => normalizeAvatar('https://example.com/avatar.png'), /Foto/);
});
