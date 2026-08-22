const test = require('node:test');
const assert = require('node:assert/strict');
const { RoomStore, createRoomCode } = require('../server/src/rooms');
const { normalizeDisplayName, normalizeRoomCode } = require('../server/src/validation');
const { ROOM_CODE_ALPHABET } = require('../shared/config');

test('gera código de sala sem caracteres ambíguos', () => {
  const code = createRoomCode(6);
  assert.equal(code.length, 6);
  assert.match(code, /^[A-Z2-9]+$/);
  assert.ok([...code].every((character) => ROOM_CODE_ALPHABET.includes(character)));
});

test('cria sala, entra, atualiza mute e remove sala vazia', () => {
  const store = new RoomStore({ maxUsersPerRoom: 2 });
  const created = store.createRoom('Marcio');
  created.participant.socketId = 'socket-a';
  const joined = store.joinRoom(created.room.code, 'João');
  joined.participant.socketId = 'socket-b';

  assert.equal(created.room.participants.size, 2);
  assert.equal(store.setMuted('socket-b', true).participant.muted, true);
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

test('normaliza nome e código e rejeita entradas inválidas', () => {
  assert.equal(normalizeDisplayName('  João   da Silva '), 'João da Silva');
  assert.equal(normalizeRoomCode(' abcd23 '), 'ABCD23');
  assert.throws(() => normalizeDisplayName(''), /1 e 30/);
  assert.throws(() => normalizeDisplayName('<script>alert(1)</script>'), /1 e 30/);
  assert.throws(() => normalizeRoomCode('ABC123'), /Código/);
});
