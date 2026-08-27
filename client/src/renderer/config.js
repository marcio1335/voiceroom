const PROTOCOL_VERSION = 1;
const DEFAULT_SIGNALING_PORT = 32145;
const DEFAULT_CONNECTION_TIMEOUT_MS = 5_000;
const DEFAULT_RECONNECT_TIMEOUT_MS = 30_000;
const LOCAL_ROOM_CODE = 'VPN234';
// A VPN supplies the direct network path. STUN can be enabled later as an
// explicit fallback after validating the selected VPN with getStats().
const ICE_SERVERS = [];

module.exports = {
  DEFAULT_CONNECTION_TIMEOUT_MS,
  DEFAULT_RECONNECT_TIMEOUT_MS,
  DEFAULT_SIGNALING_PORT,
  ICE_SERVERS,
  LOCAL_ROOM_CODE,
  PROTOCOL_VERSION
};
