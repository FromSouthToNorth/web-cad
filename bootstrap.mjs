#!/usr/bin/env node
/**
 * 一键初始化 bw-cad-view 开发环境(增量、幂等)。
 *
 * 所有包(common / geometry-engine / graphic-interface / data-model / cad-viewer 等)
 * 已合并至 cad-viewer 单一 monorepo,无需再跨仓库联动。
 *
 * 用法:
 *   node bootstrap.mjs           # 增量初始化(跳过已完成步骤)
 *   node bootstrap.mjs --fast    # 跳过最终验证构建
 *   node bootstrap.mjs --force   # 强制重跑所有步骤
 *
 * 之后日常开发:
 *   cd cad-viewer
 *   pnpm dev          # 全功能查看器
 *   pnpm dev:simple   # 简单查看器
 *   pnpm build        # 全量构建
 */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(fileURLToPath(import.meta.url))
const cadViewerDir = join(rootDir, 'cad-viewer')

const args = new Set(process.argv.slice(2))
const fastMode = args.has('--fast')
const forceMode = args.has('--force')

function run(cmd, cwd) {
  execSync(cmd, { cwd, stdio: 'inherit', shell: true })
}

function step(index, total, title) {
  console.log(`\n━━━ [${index}/${total}] ${title} ━━━`)
}

// ── 前置检查 ──────────────────────────────────────────────────

const nodeMajor = Number(process.versions.node.split('.')[0])
if (nodeMajor < 24) {
  console.warn(
    `⚠ Node ${process.version} — cad-viewer 声明要求 >= 24,推荐使用 Node 24 LTS。`
  )
}

if (!existsSync(join(cadViewerDir, 'package.json'))) {
  console.error('错误: 未找到 cad-viewer/ 目录,请在 bw-cad-view 仓库根目录运行。')
  process.exit(1)
}

// ── 主流程 ──────────────────────────────────────────────────

const totalSteps = fastMode ? 2 : 3
let stepIndex = 0
let skippedCount = 0
const startTime = Date.now()

function elapsed() {
  const s = ((Date.now() - startTime) / 1000).toFixed(1)
  return `${s}s`
}

// Step 1: 安装依赖
stepIndex++
step(stepIndex, totalSteps, '安装 cad-viewer 依赖')
if (!forceMode && existsSync(join(cadViewerDir, 'node_modules'))) {
  console.log('  ⏭ 已存在 node_modules,跳过 (--force 可强制重装)')
  skippedCount++
} else {
  run('pnpm install', cadViewerDir)
  console.log('  ✓ 完成')
}

// Step 2: 构建全部包
stepIndex++
step(stepIndex, totalSteps, '构建全部包')
if (!forceMode && existsSync(join(cadViewerDir, 'packages', 'cad-viewer-example', 'dist'))) {
  console.log('  ⏭ 已存在构建产物,跳过 (--force 可强制重构建)')
  skippedCount++
} else {
  run('pnpm build', cadViewerDir)
  console.log('  ✓ 完成')
}

// Step 3: 验证构建(--fast 跳过)
if (!fastMode) {
  stepIndex++
  step(stepIndex, totalSteps, '验证构建产物')
  const expectedFiles = [
    'packages/data-model/lib/index.js',
    'packages/data-model/dist/dxf-parser-worker.js',
    'packages/cad-viewer-example/dist/index.html'
  ]
  let allOk = true
  for (const f of expectedFiles) {
    const full = join(cadViewerDir, f)
    if (existsSync(full)) {
      console.log(`  ✓ ${f}`)
    } else {
      console.log(`  ✗ ${f} (缺失)`)
      allOk = false
    }
  }
  if (!allOk) {
    console.error('\n⚠ 部分构建产物缺失,请检查构建日志。')
    process.exit(1)
  }
}

// ── 总结 ──────────────────────────────────────────────────

const skippedMsg = skippedCount > 0 ? `(跳过 ${skippedCount} 步)` : ''
console.log(`\n✅ 初始化完成 ${skippedMsg}  耗时 ${elapsed()}`)
console.log(`
启动开发服务器:
  cd cad-viewer
  pnpm dev          # 全功能查看器
  pnpm dev:simple   # 简单查看器
  pnpm build        # 全量构建(用于部署)

提示: 使用 --fast 可跳过验证构建,加快首次初始化速度。`)
