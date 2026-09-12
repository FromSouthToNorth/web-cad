import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist',
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'MTextRenderer',
      fileName: 'index',
      formats: ['es', 'umd']
    },
    minify: true,
    rollupOptions: {
      // Exact-match only, so `three/examples/jsm/*` subpath imports stay
      // bundled instead of becoming externals (same as upstream). Rollup
      // compares string externals with `ids.has(id)`, so subpaths are not
      // covered by this entry.
      external: ['three'],
      output: {
        globals: {
          three: 'THREE'
        }
      }
    }
  }
})
