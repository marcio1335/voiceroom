const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getNetworkInterfaces,
  getPreferredVpnAddress,
  getVpnCandidates
} = require('../client/src/main/network');
const { normalizeHostAddress } = require('../shared/validation');

test('enumera IPv4 e classifica candidatos VPN sem incluir loopback', () => {
  const interfaces = getNetworkInterfaces({
    Loopback: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
    'Radmin VPN': [{ address: '26.42.13.7', family: 'IPv4', internal: false }],
    Tailscale: [{ address: '100.88.4.2', family: 4, internal: false }],
    Ethernet: [{ address: '192.168.0.10', family: 'IPv4', internal: false }],
    IPv6Only: [{ address: 'fe80::1', family: 'IPv6', internal: false }]
  });

  assert.equal(interfaces.length, 3);
  assert.equal(getVpnCandidates(interfaces).length, 2);
  assert.equal(getPreferredVpnAddress(interfaces), null);
  assert.equal(interfaces.find((entry) => entry.address === '26.42.13.7').provider, 'Radmin VPN');
});

test('seleciona automaticamente a única VPN claramente identificada', () => {
  const interfaces = getNetworkInterfaces({
    'Radmin VPN': [{ address: '26.42.13.7', family: 'IPv4', internal: false }],
    Ethernet: [{ address: '192.168.0.10', family: 'IPv4', internal: false }]
  });
  assert.equal(getPreferredVpnAddress(interfaces).address, '26.42.13.7');
});

test('normaliza IPv4 e porta padrão ou explícita', () => {
  assert.deepEqual(normalizeHostAddress(' 26.42.13.7 '), {
    host: '26.42.13.7', port: 32145, address: '26.42.13.7:32145', url: 'http://26.42.13.7:32145'
  });
  assert.equal(normalizeHostAddress('26.42.13.7:12345').port, 12345);
  assert.throws(() => normalizeHostAddress('abc'), (error) => error.code === 'INVALID_HOST_IP');
  assert.throws(() => normalizeHostAddress('999.999.999.999'), (error) => error.code === 'INVALID_HOST_IP');
  assert.throws(() => normalizeHostAddress('26.42.13.7:0'), (error) => error.code === 'INVALID_HOST_PORT');
  assert.throws(() => normalizeHostAddress('http://26.42.13.7'), (error) => error.code === 'INVALID_HOST_IP');
});
