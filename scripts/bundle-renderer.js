const path = require('node:path');
const esbuild = require('esbuild');

const LOCAL_SIGNALING_SERVER = 'http://localhost:3000';
const PRODUCTION_SIGNALING_SERVER = 'https://voiceroom-signaling.onrender.com';
const isProduction = process.argv.includes('--production');
const signalingServer = process.env.VOICEROOM_SIGNALING_SERVER
  || (isProduction ? PRODUCTION_SIGNALING_SERVER : LOCAL_SIGNALING_SERVER);

const rendererOptions = {
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  sourcemap: false,
  logLevel: 'info'
};

Promise.all([
  esbuild.build({
    ...rendererOptions,
    entryPoints: [path.resolve(__dirname, '..', 'client', 'src', 'renderer', 'app.js')],
    format: 'iife',
    outfile: path.resolve(__dirname, '..', 'client', 'src', 'renderer', 'app.bundle.js'),
    define: {
      'window.VOICEROOM_SIGNALING_SERVER': JSON.stringify(signalingServer)
    }
  }),
  esbuild.build({
    ...rendererOptions,
    entryPoints: [path.resolve(__dirname, '..', 'client', 'src', 'renderer', 'rnnoise-worklet.js')],
    format: 'esm',
    outfile: path.resolve(__dirname, '..', 'client', 'src', 'renderer', 'rnnoise-worklet.bundle.js')
  })
]).catch(() => process.exit(1));
