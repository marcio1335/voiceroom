const { getServerConfig } = require('../../shared/config');
const { createSignalingServer } = require('../../client/src/main/signaling-server');

// Compatibilidade para desenvolvimento e para a suíte existente. O produto
// empacotado usa a mesma fábrica através de client/src/main/local-server.js.
const config = getServerConfig();
const server = createSignalingServer(config);
const { httpServer, io, rooms } = server;

if (require.main === module) {
  server.start()
    .then(() => console.log(`VoiceRoom signaling server listening on http://${config.host}:${config.port}`))
    .catch((error) => {
      console.error(`Não foi possível iniciar o signaling server: ${error.code || error.message}`);
      process.exitCode = 1;
    });
}

module.exports = { ...server, config, httpServer, io, rooms };
