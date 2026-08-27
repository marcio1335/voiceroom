const path = require('node:path');
const esbuild = require('esbuild');

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
    outfile: path.resolve(__dirname, '..', 'client', 'src', 'renderer', 'app.bundle.js')
  }),
  esbuild.build({
    ...rendererOptions,
    entryPoints: [path.resolve(__dirname, '..', 'client', 'src', 'renderer', 'rnnoise-worklet.js')],
    format: 'esm',
    outfile: path.resolve(__dirname, '..', 'client', 'src', 'renderer', 'rnnoise-worklet.bundle.js')
  })
]).catch(() => process.exit(1));
