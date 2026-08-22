const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { httpServer, io: serverIo, rooms } = require('../server/src/server');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function request(socket, event, data = {}) {
  return new Promise((resolve) => {
    socket.timeout(2_000).emit(event, { ...data, protocolVersion: 1 }, (error, response) => {
      resolve(error ? { ok: false, errorCode: 'TIMEOUT' } : response);
    });
  });
}

function waitForConnect(socket) {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
}

function waitForEvent(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

test('cria, entra, limita a sexta pessoa e arbitra duas transmissões', async () => {
  await listen(httpServer);
  const url = `http://127.0.0.1:${httpServer.address().port}`;
  const clients = Array.from({ length: 6 }, () => connect(url, { autoConnect: false }));
  try {
    await Promise.all(clients.map((client) => {
      client.connect();
      return waitForConnect(client);
    }));

    const avatar = 'data:image/jpeg;base64,AA==';
    const created = await request(clients[0], 'room:create', { displayName: 'Criador', avatar });
    assert.equal(created.ok, true);
    const roomCode = created.data.room.code;
    assert.equal(created.data.room.participants[0].avatar, avatar);

    const statePromise = waitForEvent(clients[0], 'room:state');
    const joined = await request(clients[1], 'room:join', { roomCode, displayName: 'Convidado' });
    assert.equal(joined.ok, true);
    assert.equal((await statePromise).room.participants.length, 2);

    const profileStatePromise = waitForEvent(clients[1], 'room:state');
    const updatedAvatar = 'data:image/jpeg;base64,AAAA';
    const profileUpdated = await request(clients[0], 'participant:profile', { avatar: updatedAvatar });
    assert.equal(profileUpdated.ok, true);
    assert.equal((await profileStatePromise).room.participants[0].avatar, updatedAvatar);

    const lock = await request(clients[0], 'screen:start-request');
    assert.equal(lock.ok, true);
    const secondLock = await request(clients[1], 'screen:start-request');
    assert.equal(secondLock.ok, true);
    const joinedTwo = await request(clients[2], 'room:join', { roomCode, displayName: 'Pessoa 2' });
    assert.equal(joinedTwo.ok, true);
    const busy = await request(clients[2], 'screen:start-request');
    assert.equal(busy.ok, false);
    assert.equal(busy.errorCode, 'SCREEN_BUSY');
    const viewerJoined = waitForEvent(clients[0], 'screen:viewer-joined');
    assert.equal((await request(clients[2], 'screen:subscribe-request', { targetParticipantId: created.data.participantId })).ok, true);
    assert.equal((await viewerJoined).viewerParticipantId, joinedTwo.data.participantId);
    const viewerLeft = waitForEvent(clients[0], 'screen:viewer-left');
    assert.equal((await request(clients[2], 'screen:unsubscribe-request', { targetParticipantId: created.data.participantId })).ok, true);
    assert.equal((await viewerLeft).viewerParticipantId, joinedTwo.data.participantId);
    assert.equal((await request(clients[0], 'screen:stop')).ok, true);
    assert.equal((await request(clients[1], 'screen:stop')).ok, true);

    for (let index = 3; index < 5; index += 1) {
      const result = await request(clients[index], 'room:join', { roomCode, displayName: `Pessoa ${index}` });
      assert.equal(result.ok, true);
    }
    const full = await request(clients[5], 'room:join', { roomCode, displayName: 'Sexta pessoa' });
    assert.equal(full.ok, false);
    assert.equal(full.errorCode, 'ROOM_FULL');
  } finally {
    for (const client of clients) {
      if (client.connected) await request(client, 'room:leave');
      client.close();
    }
    rooms.rooms.clear();
    await new Promise((resolve) => serverIo.close(() => resolve()));
    await new Promise((resolve) => httpServer.close(resolve));
  }
});
