import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: ['obsidian'],
  outfile: 'main.js',
  target: ['es2018'],
  platform: 'browser',
  format: 'cjs',
});
