import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { cli: 'src/cli.ts' },
    format: ['cjs'],
    clean: true,
  },
  {
    entry: { action: 'src/action.ts' },
    format: ['cjs'],
    noExternal: [/.*/],
    outDir: 'dist',
  },
]);
