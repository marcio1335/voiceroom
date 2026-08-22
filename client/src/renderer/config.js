const SIGNALING_SERVER = window.VOICEROOM_SIGNALING_SERVER || 'http://localhost:3000';
const PROTOCOL_VERSION = 1;
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

module.exports = { ICE_SERVERS, PROTOCOL_VERSION, SIGNALING_SERVER };
