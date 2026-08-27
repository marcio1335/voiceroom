const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { createSignalingServer } = require('../client/src/main/signaling-server');
const { LocalServerController } = require('../client/src/main/local-server');

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

test('controller escolhe automaticamente a próxima porta livre', async () => {
  const attemptedPorts = [];
  const controller = new LocalServerController({
    createServer: ({ host, port }) => ({
      start: async () => {
        attemptedPorts.push(port);
        if (port === 32145) {
          const error = new Error('ocupada');
          error.code = 'EADDRINUSE';
          throw error;
        }
        return { host, port };
      },
      stop: async () => {}
    })
  });

  const status = await controller.startLocalServer({
    ip: '26.42.13.7',
    port: 32145,
    allowPortFallback: true
  });

  assert.deepEqual(attemptedPorts, [32145, 32146]);
  assert.equal(status.port, 32146);
  assert.equal(status.fallbackUsed, true);
  assert.equal(status.requestedPort, 32145);
  await controller.stopLocalServer({ notify: false });
});

test('controller informa a faixa quando todas as portas de fallback estão ocupadas', async () => {
  const controller = new LocalServerController({
    createServer: () => ({
      start: async () => {
        const error = new Error('ocupada');
        error.code = 'EADDRINUSE';
        throw error;
      },
      stop: async () => {}
    })
  });

  await assert.rejects(
    controller.startLocalServer({
      ip: '26.42.13.7',
      port: 32145,
      allowPortFallback: true,
      maxPortAttempts: 3
    }),
    (error) => error.publicCode === 'PORT_IN_USE'
      && error.publicMessage.includes('32145 a 32147')
  );
});
