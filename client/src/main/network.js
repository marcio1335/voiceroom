const os = require('node:os');
const http = require('node:http');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { normalizeHostAddress, normalizeIPv4, validateIPv4 } = require('../../../shared/validation');
const { DEFAULT_SIGNALING_PORT, SIGNALING_PORT_FALLBACK_ATTEMPTS } = require('../../../shared/config');

const execFileAsync = promisify(execFile);
const DISCOVERY_PORT = DEFAULT_SIGNALING_PORT;
const DISCOVERY_PORTS = Object.freeze(Array.from(
  { length: SIGNALING_PORT_FALLBACK_ATTEMPTS },
  (_, index) => DISCOVERY_PORT + index
));
const MAX_DISCOVERY_NEIGHBORS = 64;

const VPN_INTERFACE_PATTERNS = Object.freeze([
  { provider: 'Radmin VPN', pattern: /radmin/i, score: 80 },
  { provider: 'Tailscale', pattern: /tailscale/i, score: 80 },
  { provider: 'ZeroTier', pattern: /zerotier/i, score: 80 },
  { provider: 'Hamachi', pattern: /hamachi/i, score: 80 },
  { provider: 'WireGuard', pattern: /wireguard|wg[0-9]*/i, score: 65 },
  { provider: 'VPN', pattern: /vpn|virtual|tunnel|tap|tun/i, score: 55 }
]);

function ipv4ToNumber(address) {
  if (!validateIPv4(address)) return null;
  return address.split('.').reduce((value, octet) => (value * 256) + Number(octet), 0);
}

function isInRange(address, start, end) {
  const value = ipv4ToNumber(address);
  return value !== null && value >= start && value <= end;
}

function scoreVpnAddress(address) {
  if (isInRange(address, 0x1A000000, 0x1AFFFFFF)) return { score: 45, provider: 'Radmin VPN', reason: 'faixa 26.0.0.0/8' };
  if (isInRange(address, 0x19000000, 0x19FFFFFF)) return { score: 45, provider: 'Hamachi', reason: 'faixa 25.0.0.0/8' };
  if (isInRange(address, 0x64400000, 0x647FFFFF)) return { score: 45, provider: 'Tailscale', reason: 'faixa CGNAT 100.64.0.0/10' };
  return { score: 0, provider: null, reason: null };
}

function classifyInterface(name, address) {
  const reasons = [];
  let score = 0;
  let provider = null;
  for (const match of VPN_INTERFACE_PATTERNS) {
    if (!match.pattern.test(name)) continue;
    score = Math.max(score, match.score);
    provider ||= match.provider;
    reasons.push(`nome da interface: ${match.provider}`);
  }
  const addressHint = scoreVpnAddress(address);
  if (addressHint.score > 0) {
    score = Math.max(score, addressHint.score);
    provider ||= addressHint.provider;
    reasons.push(addressHint.reason);
  }
  const likelyVpn = score >= 55;
  return {
    vpnScore: score,
    likelyVpn,
    provider,
    reason: reasons.join('; ') || 'nenhum indicador forte de VPN'
  };
}

function getNetworkInterfaces(source = os.networkInterfaces()) {
  const entries = [];
  for (const [name, addresses] of Object.entries(source || {})) {
    for (const item of addresses || []) {
      const family = item?.family === 4 || item?.family === 'IPv4' ? 'IPv4' : item?.family;
      if (family !== 'IPv4' || item.internal || !validateIPv4(item.address)) continue;
      const address = normalizeIPv4(item.address);
      const classification = classifyInterface(name, address);
      entries.push({
        name,
        address,
        family,
        internal: false,
        ...classification
      });
    }
  }
  const unique = new Map(entries.map((entry) => [`${entry.name}:${entry.address}`, entry]));
  return [...unique.values()].sort((left, right) => right.vpnScore - left.vpnScore || left.name.localeCompare(right.name));
}

function getVpnCandidates(interfaces = getNetworkInterfaces()) {
  return interfaces.filter((entry) => entry.likelyVpn);
}

function getPreferredVpnAddress(interfaces = getNetworkInterfaces()) {
  const candidates = getVpnCandidates(interfaces);
  if (candidates.length === 0) return null;
  const [first, second] = candidates;
  if (candidates.length === 1 || (first.vpnScore >= 80 && first.vpnScore > second.vpnScore)) return first;
  return null;
}

function parseArpTable(output = '') {
  const entries = [];
  let localAddress = null;
  for (const line of String(output).split(/\r?\n/)) {
    const header = line.match(/(?:interface|interface:|interfaz)\s*:?\s*(\d{1,3}(?:\.\d{1,3}){3})\s+---/i);
    if (header) {
      localAddress = validateIPv4(header[1]) ? normalizeIPv4(header[1]) : null;
      continue;
    }
    const neighbor = line.match(/^\s*(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-f]{2}(?:[-:][0-9a-f]{2}){5})\s+/i);
    if (!neighbor || !localAddress || !validateIPv4(neighbor[1])) continue;
    const address = normalizeIPv4(neighbor[1]);
    if (address === localAddress || address.endsWith('.255') || address.startsWith('224.')) continue;
    entries.push({ localAddress, address, macAddress: neighbor[2].toLowerCase() });
  }
  return [...new Map(entries.map((entry) => [`${entry.localAddress}:${entry.address}`, entry])).values()];
}

function probeVoiceRoom(address, { port = DISCOVERY_PORT, timeoutMs = 650 } = {}) {
  return new Promise((resolve) => {
    const request = http.get({ host: address, port, path: '/health', timeout: timeoutMs, agent: false }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        if (body.length < 4096) body += chunk;
      });
      response.on('end', () => {
        try {
          const payload = JSON.parse(body);
          resolve(response.statusCode === 200 && payload?.app === 'VoiceRoom'
            ? { address, port, protocolVersion: payload.version || null }
            : null);
        } catch {
          resolve(null);
        }
      });
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(null));
  });
}

async function discoverVpnPeers({
  interfaces = getNetworkInterfaces(),
  arpOutput,
  runArp = () => execFileAsync('arp', ['-a'], { windowsHide: true, encoding: 'utf8', timeout: 3_000, maxBuffer: 256 * 1024 }),
  probe = probeVoiceRoom
} = {}) {
  const vpnInterfaces = getVpnCandidates(interfaces);
  if (!vpnInterfaces.length) return [];
  let output = arpOutput;
  if (output === undefined) {
    try {
      const result = await runArp();
      output = result?.stdout || '';
    } catch {
      return [];
    }
  }
  const byLocalAddress = new Map(vpnInterfaces.map((entry) => [entry.address, entry]));
  const neighbors = parseArpTable(output)
    .filter((entry) => byLocalAddress.has(entry.localAddress))
    .slice(0, MAX_DISCOVERY_NEIGHBORS);
  const results = await Promise.all(neighbors.map(async (neighbor) => {
    let room = null;
    for (const port of DISCOVERY_PORTS) {
      room = await probe(neighbor.address, { port });
      if (room) break;
    }
    if (!room) return null;
    const network = byLocalAddress.get(neighbor.localAddress);
    return {
      address: neighbor.address,
      port: room.port || DISCOVERY_PORT,
      provider: network.provider || 'VPN',
      interfaceName: network.name,
      protocolVersion: room.protocolVersion || null
    };
  }));
  return results.filter(Boolean).sort((left, right) => left.address.localeCompare(right.address, undefined, { numeric: true }));
}

module.exports = {
  classifyInterface,
  discoverVpnPeers,
  getNetworkInterfaces,
  getPreferredVpnAddress,
  getVpnCandidates,
  ipv4ToNumber,
  normalizeHostAddress,
  parseArpTable,
  probeVoiceRoom,
  scoreVpnAddress,
  validateIPv4
};
