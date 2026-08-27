const os = require('node:os');
const { normalizeHostAddress, normalizeIPv4, validateIPv4 } = require('../../../shared/validation');

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

module.exports = {
  classifyInterface,
  getNetworkInterfaces,
  getPreferredVpnAddress,
  getVpnCandidates,
  ipv4ToNumber,
  normalizeHostAddress,
  scoreVpnAddress,
  validateIPv4
};
