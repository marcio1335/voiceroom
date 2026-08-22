const test = require('node:test');
const assert = require('node:assert/strict');
const packageConfig = require('../package.json');

test('configura publicação e atualização automática para releases do GitHub', () => {
  assert.equal(packageConfig.dependencies['electron-updater'], '^6.8.9');
  assert.deepEqual(packageConfig.build.publish, {
    provider: 'github',
    owner: 'marcio1335',
    repo: 'voiceroom',
    releaseType: 'release'
  });
});
