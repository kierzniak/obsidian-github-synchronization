import esbuild from 'esbuild';
const production = process.argv.includes('production');
const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'browser',
  inject: ['src/buffer-shim.ts'],
  external: ['obsidian'],
  format: 'cjs',
  target: 'es2020',
  outfile: 'main.js',
  minify: production,
  sourcemap: production ? false : 'inline',
  metafile: true,
  plugins: [
    {
      name: 'mobile-dependencies',
      setup(build) {
        build.onEnd((result) => {
          const external = Object.values(result.metafile?.outputs || {})
            .flatMap((output) => output.imports)
            .filter((item) => item.external && item.path !== 'obsidian');
          if (external.length)
            return {
              errors: [
                {
                  text: `Non-mobile dependencies: ${external.map((item) => item.path).join(', ')}`,
                },
              ],
            };
        });
      },
    },
  ],
});
if (production) {
  await context.rebuild();
  await context.dispose();
} else await context.watch();
