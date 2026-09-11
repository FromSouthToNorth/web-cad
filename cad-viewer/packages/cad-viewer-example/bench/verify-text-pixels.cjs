/**
 * Quantitative pixel verdicts for rendered TEXT in CAD screenshots.
 *
 * Where `analyze-png.cjs` only reports global ink/colour ratios, this script
 * judges one text region at a time and turns "does the Chinese text look
 * right?" into measurable criteria:
 *
 *   1. ink ratio      - blank / not-rendered detection
 *   2. ink bbox fit   - clipping, offset and wrong font-size detection
 *   3. components     - per-glyph connectivity; a single solid block is a
 *                       tofu / fallback-box glyph
 *   4. specks/ends    - missing glyphs, broken strokes, blur
 *   5. baseline diff  - pixel-for-pixel regression against a stored PNG
 *
 * The image is decoded inside headless Chromium (`canvas.getImageData`), the
 * same technique `analyze-png.cjs` uses, so no native image dependency is
 * required.
 *
 * Usage:
 *   node bench/verify-text-pixels.cjs [options] [image.png ...]
 *
 * With no image arguments every `*.png` in `--out` (default `bench/out`) that
 * has a resolvable region is analysed. See `printUsage()` for every option.
 */
const { chromium } = require('@playwright/test')
const fs = require('fs')
const path = require('path')

// ── thresholds ───────────────────────────────────────────────────────
// Every default below is documented at its use site with the reasoning that
// fixed it. All of them can be overridden from the command line.

const DEFAULTS = {
  /** |luma - region background luma| that counts as ink. */
  inkDelta: 60,
  /** Ink below this share of the region means "blank / not rendered". */
  minInkRatio: 0.01,
  /** Ink above this share means "solid block" (mis-detected / filled box). */
  maxInkRatio: 0.6,
  /** Ink must stay this many pixels away from every region border. */
  minPaddingPx: 1,
  /** Ink must not start further than this share of the region from left/top. */
  maxPadStartRatio: 0.25,
  /** Ink must leave at least this share of the region on right/bottom. */
  maxPadEndRatio: 0.9,
  /** Components at least this large are counted as glyph parts. */
  minComponentArea: 4,
  /** Fewer components than this means missing glyphs / one solid block. */
  minComponents: 3,
  /** A component filling more of its bbox than this is a solid block. */
  maxLargestFillRatio: 0.85,
  /** Share of ink allowed to sit in sub-`minComponentArea` specks. */
  maxSpeckRatio: 0.05,
  /** Share of ink pixels with a single ink neighbour (stroke ends). */
  maxEndpointRatio: 0.35,
  /** Per-channel difference that counts as a changed pixel in the diff. */
  diffTolerance: 24,
  /** Share of changed pixels tolerated against the baseline. */
  maxChangedPct: 3.0
}

const RATIONALE = {
  inkDelta:
    'Background is estimated as the region median luma, so this works on both dark and light canvases; 60 ignores renderer dithering and JPEG-free PNG noise while still catching antialiased glyph edges.',
  minInkRatio:
    'Four CJK glyphs at 24 px cover roughly 8-12% of a snug text box; 1% leaves a ~10x margin against antialiasing noise yet fails on an empty or unrendered text run (<0.1%).',
  maxInkRatio:
    'Region dominated by ink means the measurement is wrong (solid fill, inverted selection, or a region far smaller than the glyphs); bold or large text stays far below 60%.',
  minPaddingPx:
    'A bbox touching the region border means the glyph run continues outside it: clipped text, or a region that is smaller than the string.',
  maxPadStartRatio:
    'Top-left attached MTEXT starts within a few pixels of the insertion corner; >25% of the region empty before the ink means a wrong anchor or a wrong font size.',
  maxPadEndRatio:
    'Right/bottom whitespace is expected (the dragged box is wider than the string); the bound only rejects ink that fills the whole box, which would be a mis-measured region.',
  minComponents:
    'Chinese characters are made of several disjoint strokes, so a four-glyph run yields roughly ten components; requiring at least three fails when the run collapses into one or two blobs (missing glyphs, or a renderer that draws one solid block).',
  minComponentArea:
    'Isolated 1-3 px islands are antialiasing residue rather than strokes.',
  maxLargestFillRatio:
    'A real glyph never fills its own bbox (strokes leave counters inside the outline); a solid rectangle does, so >=85% is the tofu / filled-block signature.',
  maxSpeckRatio:
    'Missing or half-rendered glyphs leave scattered specks; real text keeps them under 5% of the ink.',
  maxEndpointRatio:
    'Broken strokes and heavy blur multiply stroke ends; a clean SHX/TrueType run of four glyphs stays well under 35% of ink pixels having a single neighbour.',
  diffTolerance:
    'Per-channel 24 (~10% of 255) absorbs GPU/antialiasing jitter between runs while still catching moved or missing glyphs.',
  maxChangedPct:
    'Stable headless renders reproduce within ~1% of pixels; 3% tolerates dithering on the canvas border without hiding a glyph change.'
}

function printUsage() {
  const lines = [
    'Usage: node bench/verify-text-pixels.cjs [options] [image.png ...]',
    '',
    'Options:',
    '  --out=<dir>              directory scanned when no image is passed',
    '                           (default: <bench>/out)',
    '  --region=x,y,w,h         text region in image pixels (overrides sidecar)',
    '  --baseline=<png>         baseline image; default <image>.baseline.png,',
    '                           <dir>/baseline.png or the sidecar "baseline"',
    '  --ink-delta=<n>          ink/background luma delta (default 60)',
    '  --min-ink-ratio=<f>      default 0.01',
    '  --max-ink-ratio=<f>      default 0.60',
    '  --min-padding-px=<n>     default 1',
    '  --max-pad-start-ratio=<f> default 0.25',
    '  --max-pad-end-ratio=<f>  default 0.90',
    '  --min-components=<n>     default 3',
    '  --min-component-area=<n> default 4',
    '  --max-largest-fill=<f>   default 0.85',
    '  --max-speck-ratio=<f>    default 0.05',
    '  --max-endpoint-ratio=<f> default 0.35',
    '  --diff-tolerance=<n>     default 24',
    '  --max-changed-pct=<f>    default 3.0',
    '  --selftest               analyse synthetic positive/negative controls',
    '                           and verify that the expected criteria fire',
    '  --help                   print this message',
    '',
    'Region sidecar: <image>.region.json, either {x,y,width,height} or',
    '{"region":{...},"baseline":"other.png","label":"..."}.'
  ]
  console.log(lines.join('\n'))
}

/** Parses `--key=value` flags plus positional image paths. */
function parseArgs(argv) {
  const opts = {
    ...DEFAULTS,
    images: [],
    outDir: null,
    region: null,
    selftest: false
  }
  const numeric = {
    '--ink-delta': 'inkDelta',
    '--min-ink-ratio': 'minInkRatio',
    '--max-ink-ratio': 'maxInkRatio',
    '--min-padding-px': 'minPaddingPx',
    '--min-components': 'minComponents',
    '--min-component-area': 'minComponentArea',
    '--max-largest-fill': 'maxLargestFillRatio',
    '--max-speck-ratio': 'maxSpeckRatio',
    '--max-endpoint-ratio': 'maxEndpointRatio',
    '--diff-tolerance': 'diffTolerance',
    '--max-changed-pct': 'maxChangedPct',
    '--max-pad-start-ratio': 'maxPadStartRatio',
    '--max-pad-end-ratio': 'maxPadEndRatio'
  }
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    } else if (arg === '--selftest') {
      opts.selftest = true
    } else if (arg.startsWith('--out=')) {
      opts.outDir = path.resolve(arg.slice('--out='.length))
    } else if (arg.startsWith('--region=')) {
      const parts = arg.slice('--region='.length).split(',').map(Number)
      if (parts.length !== 4 || parts.some(v => !Number.isFinite(v))) {
        throw new Error(`Invalid --region: ${arg}`)
      }
      opts.region = {
        x: parts[0],
        y: parts[1],
        width: parts[2],
        height: parts[3]
      }
    } else if (arg.startsWith('--baseline=')) {
      opts.baseline = path.resolve(arg.slice('--baseline='.length))
    } else if (arg.startsWith('--')) {
      const eq = arg.indexOf('=')
      const key = eq === -1 ? arg : arg.slice(0, eq)
      const value = eq === -1 ? '' : arg.slice(eq + 1)
      if (!(key in numeric)) throw new Error(`Unknown option: ${arg}`)
      const parsed = Number(value)
      if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid value for ${key}: ${value}`)
      }
      opts[numeric[key]] = parsed
    } else {
      opts.images.push(path.resolve(arg))
    }
  }
  return opts
}

function readRegionSidecar(imagePath) {
  const sidecarPath = `${imagePath}.region.json`
  if (!fs.existsSync(sidecarPath)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'))
    const region = raw.region ?? raw
    if (
      !region ||
      !['x', 'y', 'width', 'height'].every(k => Number.isFinite(region[k]))
    ) {
      return { error: `sidecar ${sidecarPath} has no usable region` }
    }
    return { region, baseline: raw.baseline, label: raw.label, sidecarPath }
  } catch (error) {
    return { error: `sidecar ${sidecarPath} is unreadable: ${error.message}` }
  }
}

/** Locates a baseline PNG for `imagePath` (explicit > sidecar > convention). */
function resolveBaseline(imagePath, sidecar, explicit) {
  const candidates = []
  if (explicit) candidates.push(explicit)
  if (sidecar && sidecar.baseline) {
    candidates.push(path.resolve(path.dirname(imagePath), sidecar.baseline))
  }
  const dir = path.dirname(imagePath)
  const ext = path.extname(imagePath)
  const base = path.basename(imagePath, ext)
  candidates.push(path.join(dir, `${base}.baseline${ext}`))
  candidates.push(path.join(dir, 'baseline.png'))
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate
  }
  return null
}

/**
 * Decodes every image and computes all region metrics inside the browser, so
 * the pixel loops run on typed arrays in the same environment the screenshots
 * were taken in.
 */
async function analyze(page, jobs) {
  return page.evaluate(async jobs => {
    const loadPixels = async url => {
      const img = new Image()
      img.src = url
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = img.width
      canvas.height = img.height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      return {
        width: canvas.width,
        height: canvas.height,
        data: ctx.getImageData(0, 0, canvas.width, canvas.height).data
      }
    }
    const lumaAt = (data, index) =>
      0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2]

    const results = []
    for (const job of jobs) {
      const image = await loadPixels(job.url)
      const region = job.region
      const x0 = Math.max(0, Math.round(region.x))
      const y0 = Math.max(0, Math.round(region.y))
      const x1 = Math.min(image.width, Math.round(region.x + region.width))
      const y1 = Math.min(image.height, Math.round(region.y + region.height))
      const w = x1 - x0
      const h = y1 - y0
      if (w <= 0 || h <= 0) {
        results.push({ ...job.meta, error: 'region is outside the image' })
        continue
      }

      // Background luma: median of the region. The region is dominated by
      // canvas background, which makes this theme agnostic (dark or light).
      const lumas = new Float64Array(w * h)
      const opaque = new Uint8Array(w * h)
      let p = 0
      let opaqueCount = 0
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++, p++) {
          const index = (y * image.width + x) * 4
          lumas[p] = lumaAt(image.data, index)
          if (image.data[index + 3] >= 128) {
            opaque[p] = 1
            opaqueCount++
          }
        }
      }
      const sorted = Float64Array.from(lumas).sort()
      const backgroundLuma = sorted[sorted.length >> 1]
      // A canvas screenshot may come back with a transparent background
      // (transparent pixels decode as luma 0). Then "opaque" itself is the
      // ink signal, which keeps black-on-transparent text detectable.
      const transparentBackground = opaqueCount < lumas.length / 2

      const ink = new Uint8Array(w * h)
      let inkCount = 0
      for (let i = 0; i < lumas.length; i++) {
        const isInk = transparentBackground
          ? opaque[i] === 1
          : Math.abs(lumas[i] - backgroundLuma) >= job.inkDelta
        if (isInk) {
          ink[i] = 1
          inkCount++
        }
      }

      // Ink bounding box → fit / clipping / offset judgement.
      let boxLeft = w
      let boxTop = h
      let boxRight = -1
      let boxBottom = -1
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!ink[y * w + x]) continue
          if (x < boxLeft) boxLeft = x
          if (x > boxRight) boxRight = x
          if (y < boxTop) boxTop = y
          if (y > boxBottom) boxBottom = y
        }
      }
      const hasInk = boxRight >= 0

      // 8-connected components → glyph count / tofu detection.
      const labels = new Int32Array(w * h).fill(-1)
      const components = []
      const stack = new Int32Array(w * h)
      for (let start = 0; start < ink.length; start++) {
        if (!ink[start] || labels[start] !== -1) continue
        const id = components.length
        let top = 0
        stack[top++] = start
        labels[start] = id
        let area = 0
        let minX = w
        let minY = h
        let maxX = -1
        let maxY = -1
        while (top > 0) {
          const index = stack[--top]
          const cy = (index / w) | 0
          const cx = index - cy * w
          area++
          if (cx < minX) minX = cx
          if (cx > maxX) maxX = cx
          if (cy < minY) minY = cy
          if (cy > maxY) maxY = cy
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue
              const ny = cy + dy
              const nx = cx + dx
              if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue
              const neighbour = ny * w + nx
              if (!ink[neighbour] || labels[neighbour] !== -1) continue
              labels[neighbour] = id
              stack[top++] = neighbour
            }
          }
        }
        components.push({
          area,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
          minX,
          minY
        })
      }

      const minArea = job.minComponentArea
      const glyphComponents = components.filter(c => c.area >= minArea)
      const speckInk = components
        .filter(c => c.area < minArea)
        .reduce((sum, c) => sum + c.area, 0)
      const largest = components.reduce(
        (best, c) => (best === null || c.area > best.area ? c : best),
        null
      )

      // Stroke ends: ink pixels with exactly one ink 8-neighbour. Broken or
      // heavily blurred strokes emit many of them.
      let endpoints = 0
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!ink[y * w + x]) continue
          let neighbours = 0
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue
              const ny = y + dy
              const nx = x + dx
              if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue
              if (ink[ny * w + nx]) neighbours++
            }
          }
          if (neighbours === 1) endpoints++
        }
      }

      // Column/row projections: how many separate ink bands the region shows.
      // A single text line of N glyphs normally produces N (or fewer, when
      // glyphs touch) column bands and exactly one row band.
      const columnHasInk = new Uint8Array(w)
      const rowHasInk = new Uint8Array(h)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (!ink[y * w + x]) continue
          columnHasInk[x] = 1
          rowHasInk[y] = 1
        }
      }
      const countRuns = profile => {
        let runs = 0
        let inRun = false
        for (let i = 0; i < profile.length; i++) {
          const value = profile[i] === 1
          if (value && !inRun) runs++
          inRun = value
        }
        return runs
      }

      const regionArea = w * h
      const inkRatio = inkCount / regionArea
      const padLeft = hasInk ? boxLeft : 0
      const padTop = hasInk ? boxTop : 0
      const padRight = hasInk ? w - 1 - boxRight : 0
      const padBottom = hasInk ? h - 1 - boxBottom : 0

      const metrics = {
        region: { x: x0, y: y0, width: w, height: h },
        imageSize: { width: image.width, height: image.height },
        backgroundLuma: +backgroundLuma.toFixed(1),
        transparentBackground,
        inkPixels: inkCount,
        inkRatio: +inkRatio.toFixed(5),
        inkBox: hasInk
          ? {
              x: x0 + boxLeft,
              y: y0 + boxTop,
              width: boxRight - boxLeft + 1,
              height: boxBottom - boxTop + 1
            }
          : null,
        paddingPx: {
          left: padLeft,
          top: padTop,
          right: padRight,
          bottom: padBottom
        },
        paddingRatio: {
          left: +(padLeft / w).toFixed(4),
          top: +(padTop / h).toFixed(4),
          right: +(padRight / w).toFixed(4),
          bottom: +(padBottom / h).toFixed(4)
        },
        components: components.length,
        glyphComponents: glyphComponents.length,
        componentAreas: components
          .map(c => c.area)
          .sort((a, b) => b - a)
          .slice(0, 12),
        columnRuns: countRuns(columnHasInk),
        rowRuns: countRuns(rowHasInk),
        largestComponentFillRatio: largest
          ? +(largest.area / (largest.width * largest.height)).toFixed(4)
          : 0,
        speckRatio: inkCount ? +(speckInk / inkCount).toFixed(4) : 0,
        endpointRatio: inkCount ? +(endpoints / inkCount).toFixed(4) : 0
      }

      const checks = []
      const check = (name, ok, detail) =>
        checks.push({ name, pass: !!ok, detail })

      check(
        'ink-present',
        inkRatio >= job.minInkRatio && inkRatio <= job.maxInkRatio,
        `inkRatio=${metrics.inkRatio} expected ${job.minInkRatio}..${job.maxInkRatio}`
      )
      check(
        'ink-inside-region',
        hasInk &&
          padLeft >= job.minPaddingPx &&
          padTop >= job.minPaddingPx &&
          padRight >= job.minPaddingPx &&
          padBottom >= job.minPaddingPx,
        `padding(px)=${JSON.stringify(metrics.paddingPx)} min=${job.minPaddingPx}`
      )
      check(
        'ink-starts-near-origin',
        hasInk &&
          metrics.paddingRatio.left <= job.maxPadStartRatio &&
          metrics.paddingRatio.top <= job.maxPadStartRatio,
        `padLeftRatio=${metrics.paddingRatio.left} padTopRatio=${metrics.paddingRatio.top} max=${job.maxPadStartRatio}`
      )
      check(
        'ink-leaves-room',
        hasInk &&
          metrics.paddingRatio.right <= job.maxPadEndRatio &&
          metrics.paddingRatio.bottom <= job.maxPadEndRatio,
        `padRightRatio=${metrics.paddingRatio.right} padBottomRatio=${metrics.paddingRatio.bottom} max=${job.maxPadEndRatio}`
      )
      check(
        'glyph-components',
        metrics.glyphComponents >= job.minComponents,
        `components>=${job.minComponentArea}px: ${metrics.glyphComponents}, need ${job.minComponents}`
      )
      check(
        'not-solid-block',
        metrics.largestComponentFillRatio <= job.maxLargestFillRatio,
        `largestFillRatio=${metrics.largestComponentFillRatio} max=${job.maxLargestFillRatio}`
      )
      check(
        'low-speck-ratio',
        metrics.speckRatio <= job.maxSpeckRatio,
        `speckRatio=${metrics.speckRatio} max=${job.maxSpeckRatio}`
      )
      check(
        'not-fragmented',
        metrics.endpointRatio <= job.maxEndpointRatio,
        `endpointRatio=${metrics.endpointRatio} max=${job.maxEndpointRatio}`
      )

      let diff = null
      if (job.baselineUrl) {
        const baseline = await loadPixels(job.baselineUrl)
        if (
          baseline.width !== image.width ||
          baseline.height !== image.height
        ) {
          diff = {
            error: `baseline size ${baseline.width}x${baseline.height} != ${image.width}x${image.height}`
          }
          check('baseline-diff', false, diff.error)
        } else {
          let changed = 0
          for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
              const index = (y * image.width + x) * 4
              if (
                Math.abs(image.data[index] - baseline.data[index]) >
                  job.diffTolerance ||
                Math.abs(image.data[index + 1] - baseline.data[index + 1]) >
                  job.diffTolerance ||
                Math.abs(image.data[index + 2] - baseline.data[index + 2]) >
                  job.diffTolerance
              ) {
                changed++
              }
            }
          }
          const changedPct = +((changed / regionArea) * 100).toFixed(3)
          diff = {
            baseline: job.baselineLabel,
            tolerance: job.diffTolerance,
            changedPixels: changed,
            changedPct
          }
          check(
            'baseline-diff',
            changedPct <= job.maxChangedPct,
            `changedPct=${changedPct} max=${job.maxChangedPct}`
          )
        }
      }

      results.push({
        ...job.meta,
        metrics,
        checks,
        diff,
        pass: checks.every(c => c.pass)
      })
    }
    return results
  }, jobs)
}

/**
 * Launches headless Chromium. `analyze-png.cjs` assumes the `chrome`
 * channel; here the Playwright channel is read from the environment first
 * (`PLAYWRIGHT_BROWSER_CHANNEL`, the same variable the e2e config honours) and
 * a missing channel falls back to the bundled browser.
 */
async function launchBrowser() {
  const channel = process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? 'chrome'
  try {
    return await chromium.launch({ headless: true, channel })
  } catch (error) {
    console.warn(
      `Could not launch channel "${channel}" (${error.message}); ` +
        'falling back to the bundled Chromium.'
    )
    return chromium.launch({ headless: true })
  }
}

/**
 * Negative/positive controls for the analyser itself.
 *
 * Draws four synthetic text regions and checks that only the good one passes:
 * a clean glyph run (must PASS), an empty region (blank), a filled rectangle
 * (tofu block) and a run drawn far outside the region (offset/clipped). Run
 * with `--selftest`; every control also verifies that the specific criterion
 * that should reject it is the one that fires.
 */
async function buildSelfTestJobs(page, thresholdArgs) {
  const images = await page.evaluate(() => {
    const make = draw => {
      const canvas = document.createElement('canvas')
      canvas.width = 212
      canvas.height = 48
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      draw(ctx, canvas)
      return canvas.toDataURL('image/png')
    }
    return {
      good: make(ctx => {
        ctx.fillStyle = '#ffffff'
        ctx.font = '24px sans-serif'
        ctx.textBaseline = 'top'
        ctx.fillText('中文测试', 6, 6)
      }),
      blank: make(() => {}),
      solid: make(ctx => {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(6, 6, 150, 32)
      }),
      offset: make(ctx => {
        ctx.fillStyle = '#ffffff'
        ctx.font = '24px sans-serif'
        ctx.textBaseline = 'top'
        ctx.fillText('中文测试', 120, 40)
      })
    }
  })
  const region = { x: 0, y: 0, width: 212, height: 48 }
  const base = {
    ...thresholdArgs,
    region,
    baselineUrl: null,
    baselineLabel: null
  }
  return [
    {
      ...base,
      url: images.good,
      meta: { image: '<selftest:good>', expect: 'pass', expectFailed: [] }
    },
    {
      ...base,
      url: images.blank,
      meta: {
        image: '<selftest:blank>',
        expect: 'fail',
        expectFailed: ['ink-present']
      }
    },
    {
      ...base,
      url: images.solid,
      meta: {
        image: '<selftest:solid>',
        expect: 'fail',
        expectFailed: ['not-solid-block', 'glyph-components']
      }
    },
    {
      ...base,
      url: images.offset,
      meta: {
        image: '<selftest:offset>',
        expect: 'fail',
        expectFailed: ['ink-starts-near-origin', 'ink-inside-region']
      }
    }
  ]
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const benchDir = __dirname
  const outDir = opts.outDir ?? path.join(benchDir, 'out')

  const thresholdArgs = {
    inkDelta: opts.inkDelta,
    minInkRatio: opts.minInkRatio,
    maxInkRatio: opts.maxInkRatio,
    minPaddingPx: opts.minPaddingPx,
    maxPadStartRatio: opts.maxPadStartRatio,
    maxPadEndRatio: opts.maxPadEndRatio,
    minComponents: opts.minComponents,
    minComponentArea: opts.minComponentArea,
    maxLargestFillRatio: opts.maxLargestFillRatio,
    maxSpeckRatio: opts.maxSpeckRatio,
    maxEndpointRatio: opts.maxEndpointRatio,
    diffTolerance: opts.diffTolerance,
    maxChangedPct: opts.maxChangedPct
  }

  const jobs = []
  const skipped = []
  if (opts.selftest) {
    // Jobs are built after the browser starts (the controls are drawn in it).
  } else {
    const images = opts.images.length
      ? opts.images
      : fs.existsSync(outDir)
        ? fs
            .readdirSync(outDir)
            .filter(f => f.toLowerCase().endsWith('.png'))
            .sort()
            .map(f => path.join(outDir, f))
        : []

    if (!images.length) {
      console.error(`No PNG images found (looked in ${outDir})`)
      process.exit(2)
    }

    for (const imagePath of images) {
      const sidecar = readRegionSidecar(imagePath)
      if (sidecar && sidecar.error) {
        skipped.push({ image: imagePath, reason: sidecar.error })
        continue
      }
      const region = opts.region ?? (sidecar ? sidecar.region : null)
      if (!region) {
        skipped.push({
          image: imagePath,
          reason: 'no region: pass --region=x,y,w,h or add <image>.region.json'
        })
        continue
      }
      const baselinePath = resolveBaseline(imagePath, sidecar, opts.baseline)
      jobs.push({
        ...thresholdArgs,
        url: toDataUrl(imagePath),
        baselineUrl: baselinePath ? toDataUrl(baselinePath) : null,
        region,
        baselineLabel: baselinePath ? path.basename(baselinePath) : null,
        meta: {
          image: path.relative(process.cwd(), imagePath).replace(/\\/g, '/'),
          label: sidecar ? sidecar.label : undefined
        }
      })
    }

    if (!jobs.length) {
      console.log(
        JSON.stringify({ thresholds: opts, skipped, results: [] }, null, 2)
      )
      console.log('FAIL')
      process.exit(1)
    }
  }

  const browser = await launchBrowser()
  const page = await browser.newPage()
  await page.goto('about:blank')
  const selfTestJobs = opts.selftest
    ? await buildSelfTestJobs(page, thresholdArgs)
    : []
  const results = await analyze(page, opts.selftest ? selfTestJobs : jobs)
  await browser.close()

  if (opts.selftest) {
    const controls = results.map(result => {
      const failed = result.checks.filter(c => !c.pass).map(c => c.name)
      const expect = result.expect
      const expectedFailed = result.expectFailed ?? []
      const ok =
        expect === 'pass'
          ? result.pass
          : !result.pass && expectedFailed.every(name => failed.includes(name))
      return { image: result.image, expect, failedChecks: failed, ok }
    })
    const allOk = controls.every(c => c.ok)
    console.log(
      JSON.stringify(
        {
          mode: 'selftest',
          controls,
          summary: {
            controls: controls.length,
            ok: controls.filter(c => c.ok).length
          },
          results
        },
        null,
        2
      )
    )
    console.log(allOk ? 'PASS' : 'FAIL')
    process.exit(allOk ? 0 : 1)
  }

  const passed = results.filter(r => r.pass).length
  const report = {
    thresholds: thresholdArgs,
    rationale: RATIONALE,
    outDir: path.relative(process.cwd(), outDir).replace(/\\/g, '/'),
    skipped,
    summary: {
      images: results.length,
      passed,
      failed: results.length - passed
    },
    results
  }
  console.log(JSON.stringify(report, null, 2))
  console.log(report.summary.failed === 0 ? 'PASS' : 'FAIL')
  process.exit(report.summary.failed === 0 ? 0 : 1)
}

/**
 * Chromium cannot `fetch()` `file://` URLs, so images are handed to the page
 * as base64 data URLs (`analyze-png.cjs` does the same).
 */
function toDataUrl(filePath) {
  const bytes = fs.readFileSync(filePath)
  const ext = path.extname(filePath).toLowerCase()
  const mime = ext === '.png' ? 'image/png' : 'application/octet-stream'
  return `data:${mime};base64,${bytes.toString('base64')}`
}

main().catch(error => {
  console.error('VERIFY_TEXT_PIXELS_FAILED', error)
  process.exit(1)
})
