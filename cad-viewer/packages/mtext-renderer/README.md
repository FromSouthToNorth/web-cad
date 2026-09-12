# @mlightcad/mtext-renderer (vendored)

AutoCAD MText renderer based on Three.js, vendored into this monorepo so the
viewer consumes it as a local pnpm workspace package instead of an npm
dependency.

## Provenance

| | |
| --- | --- |
| Upstream | <https://github.com/mlightcad/mtext-renderer> |
| Path | `packages/mtext-renderer` |
| Commit | `f7e7b695646026210c047fc653e84488e7c4029f` (2026-09-07) |
| Version | `0.12.7` |
| License | MIT (see `LICENSE`) |

Only the library package is vendored. Upstream's private
`packages/example` demo was intentionally left out because this repo already
ships `@hy/cad-viewer-example`.

## Why the package name is unchanged

The package keeps the upstream name `@mlightcad/mtext-renderer` on purpose.
`@mlightcad/mtext-input-box` declares it as a **peer** dependency
(`^0.12.4`) and runtime-imports class values from it (`MTextColor`,
`MText`, `MTextContext`, `UnifiedRenderer`). Renaming the local package would
let pnpm install a second copy from the registry for that peer edge, which
splits class identity (`instanceof` breaks at the `AcEdMTextEditor` →
`MTextInputBox` boundary) and duplicates roughly 1 MB of bundle. Keeping the
name and version means the workspace package satisfies the peer range and pnpm
resolves a single instance.

`version` must stay inside `^0.12.4` for the same reason. Do not move this
package onto the repo's lockstep version line (`1.x`) without also reworking
`mtext-input-box`.

The package is `private: true` so it can never be published to the
`@mlightcad` scope by `pnpm -r publish`.

## Local modifications vs upstream

1. `package.json` — added `private: true`, added `three` to `devDependencies`,
   wrapped `exports` in the `"."` key, dropped upstream's `nx` field (the root
   `nx.json` already declares `dist`/`lib` outputs), dropped publish-only
   metadata.
2. `tsconfig.json` — now extends the root `tsconfig.json`; overrides
   `target`/`lib` to ES2020, points `outDir` at `lib`, and relaxes
   `noUnusedLocals`/`noUnusedParameters`.
3. `vite.config.main.ts` — dropped `vite-plugin-dts`; declarations are emitted
   by `tsc` into `lib/` like every other package in this repo. The exact-match
   `external: ['three']` is preserved so `three/examples/jsm/*` subpaths stay
   bundled, as upstream intended.

Everything under `src/`, `test/` and `vitest.config.ts` is upstream code held
verbatim.

## Build

```bash
pnpm --filter @mlightcad/mtext-renderer build
```

Produces the contracts the rest of the monorepo depends on:

| Artifact | Consumer |
| --- | --- |
| `dist/index.js` | app bundlers (`module`) |
| `dist/index.umd.cjs` | `require()` / `tools/copy-workers.mjs` package-root lookup |
| `dist/mtext-renderer-worker.js` | copied as a runtime asset; **filename is load-bearing** |
| `lib/index.d.ts` | TypeScript (`types`) |

The worker filename is hard-coded in `tools/worker-assets.mjs` and copied by
`tools/copy-workers.mjs`, `packages/cad-simple-viewer/vite.config.ts`,
`packages/cad-simple-viewer-cli/scripts/copy-runner-assets.mjs` and
`packages/cad-viewer-example/vite.config.ts`. Renaming it requires touching all
of those.

## Tests

Upstream's vitest suite is kept in `test/`. It is **not** part of the root Jest
run (`jest.config.ts` ignores this path) because it needs the `vitest` runner:

```bash
pnpm --filter @mlightcad/mtext-renderer test
```

Note that upstream's suite downloads SHX fonts from jsDelivr, so a subset of
the files requires network access.

## Syncing with upstream

Re-copy `packages/mtext-renderer/{src,test}` from the desired upstream tag or
commit, then re-apply the four config adaptations listed above. Bump `version`
only if the new version still satisfies `^0.12.4`.
