/**
 * Copies hand-maintained public API declarations from `typings/` into `lib/`.
 *
 * The public surface of this package is tiny (one Vue panel plus the lazy
 * `/register` helpers), so declarations are curated by hand instead of running
 * `vue-tsc` over the package. Update those files when the public API changes.
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs'

rmSync('lib', { recursive: true, force: true })
mkdirSync('lib', { recursive: true })
cpSync('typings', 'lib', { recursive: true })
