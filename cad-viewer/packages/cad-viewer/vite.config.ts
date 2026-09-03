import {
  defineConfig,
  type ConfigEnv,
  type LibraryFormats,
  PluginOption
} from 'vite'
import svgLoader from 'vite-svg-loader'
import { visualizer } from 'rollup-plugin-visualizer'
import peerDepsExternal from 'rollup-plugin-peer-deps-external'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { libInjectCss } from 'vite-plugin-lib-inject-css'

const packageId = 'cad-viewer'

export default defineConfig(({ mode }: ConfigEnv) => {
  const plugins: PluginOption[] = [
    vue() as PluginOption,
    svgLoader(),
    libInjectCss() as PluginOption,
    peerDepsExternal() as PluginOption,
    dts({
      include: ['src/**/*.ts', 'src/**/*.vue'],
      exclude: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
      beforeWriteFile: (filePath, content) => {
        const normalized = filePath.replace(/\\/g, '/')
        if (normalized.endsWith('/dist/index.d.ts')) {
          return {
            filePath: filePath.replace(/index\.d\.ts$/, `${packageId}.d.ts`),
            content: content.replace(
              '//# sourceMappingURL=index.d.ts.map',
              `//# sourceMappingURL=${packageId}.d.ts.map`
            )
          }
        }
      }
    }) as PluginOption
  ]

  if (mode === 'analyze') {
    plugins.push(visualizer())
  }

  return {
    outDir: 'dist',
    build: {
      lib: {
        entry: {
          index: 'src/index.ts',
          legacy: 'src/legacy.ts'
        },
        name: packageId,
        fileName: (format, entryName) => {
          const suffix = entryName === 'index' ? '' : `-${entryName}`
          return format === 'es'
            ? `${packageId}${suffix}.js`
            : `${packageId}${suffix}.umd.cjs`
        },
        formats: ['es'] as LibraryFormats[]
      },
      minify: true,
      rollupOptions: {
        // PDF/HTML/SVG/Agent plugins are peers; loaded at runtime via dynamic import
        external: [
          '@mlightcad/cad-pdf-plugin',
          '@mlightcad/cad-html-plugin',
          '@mlightcad/cad-svg-plugin',
          '@mlightcad/cad-agent-plugin',
          '@mlightcad/cad-agent-plugin/register',
          '@mlightcad/cad-agent-plugin/style.css'
        ],
        output: {
          chunkFileNames: `${packageId}-[name]-[hash].js`,
          // Keep the main entry's stylesheet as `cad-viewer.css` (public URL
          // consumed by CDN hosts); shared/legacy chunks get `cad-viewer-<name>.css`.
          // libInjectCss emits asset names that already carry the .css extension.
          assetFileNames: assetInfo => {
            const raw = (assetInfo.names?.[0] ?? assetInfo.name ?? 'index')
              .replace(/\.css$/i, '')
            return raw === 'index' ? `${packageId}.css` : `${packageId}-${raw}.css`
          }
        }
      }
    },
    plugins
  }
})
