const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { createSignalingServer } = require('../client/src/main/signaling-server');

function waitForConnect(socket) {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
}

function request(socket, event, data = {}) {
  return new Promise((resolve) => {
    socket.timeout(2_000).emit(event, { ...data, protocolVersion: 1 }, (error, response) => {
      resolve(error ? { ok: false, errorCode: 'TIMEOUT' } : response);
    });
  });
}

function waitForEvent(socket, event) {
  return new Promise((resolve) => socket.once(event, resolve));
}

test('signaling local cria sessão única, aceita convidado e encerra com o HOST', async () => {
  const server = createSignalingServer({ host: '127.0.0.1', port: 0, roomCode: 'VPN234' });
  const clients = [];
  try {
    await server.start();
    const port = server.httpServer.address().port;
    const healthResponse = await fetch(`http://127.0.0.1:${port}/health`);
    const health = await healthResponse.json();
    assert.equal(health.status, 'ok');
    assert.equal(health.app, 'VoiceRoom');
    assert.equal(healthResponse.headers.get('access-control-allow-origin'), '*');

    const host = connect(`http://127.0.0.1:${port}`, { autoConnect: false });
    const guest = connect(`http://127.0.0.1:${port}`, { autoConnect: false });
    clients.push(host, guest);
    host.connect();
    guest.connect();
    await Promise.all(clients.map(waitForConnect));

    const created = await request(host, 'room:create', { displayName: 'Host' });
    assert.equal(created.ok, true);
    assert.equal(created.data.role, 'host');
    assert.equal(created.data.room.code, 'VPN234');

    const hostState = waitForEvent(host, 'room:state');
    const joined = await request(guest, 'room:join', { displayName: 'Convidado' });
    assert.equal(joined.ok, true);
    assert.equal(joined.data.role, 'guest');
    assert.equal((await hostState).room.participants.length, 2);

    const ended = waitForEvent(guest, 'room:host-ended');
    const left = await request(host, 'room:leave');
    assert.equal(left.ok, true);
    assert.equal(left.data.hostEnded, true);
    assert.equal((await ended).reason, 'host_left');
  } finally {
    for (const client of clients) client.disconnect();
    await server.stop({ notify: false });
  }
  assert.equal(server.getServerStatus().running, false);
  assert.equal(server.httpServer.listening, false);
});
