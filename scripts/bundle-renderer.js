const path = require('node:path');
const esbuild = require('esbuild');

const LOCAL_SIGNALING_SERVER = 'http://localhost:3000';
const PRODUCTION_SIGNALING_SERVER = 'https://voiceroom-signaling.onrender.com';
const isProduction = process.argv.includes('--production');
const signalingServer = process.env.VOICEROOM_SIGNALING_SERVER
  || (isProduction ? PRODUCTION_SIGNALING_SERVER : LOCAL_SIGNALING_SERVER);

esbuild.build({
  entryPoints: [path.resolve(__dirname, '..', 'client', 'src', 'renderer', 'app.js')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  outfile: path.resolve(__dirname, '..', 'client', 'src', 'renderer', 'app.bundle.js'),
  define: {
    'window.VOICEROOM_SIGNALING_SERVER': JSON.stringify(signalingServer)
  },
  sourcemap: false,
  logLevel: 'info'
}).catch(() => process.exit(1));
