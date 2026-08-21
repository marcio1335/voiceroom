const path = require('node:path');
const esbuild = require('esbuild');

esbuild.build({
  entryPoints: [path.resolve(__dirname, '..', 'client', 'src', 'renderer', 'app.js')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  outfile: path.resolve(__dirname, '..', 'client', 'src', 'renderer', 'app.bundle.js'),
  define: {
    'window.VOICEROOM_SIGNALING_SERVER': JSON.stringify(process.env.VOICEROOM_SIGNALING_SERVER || 'http://localhost:3000')
  },
  sourcemap: false,
  logLevel: 'info'
}).catch(() => process.exit(1));
