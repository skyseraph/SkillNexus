#!/usr/bin/env node
/**
 * Rebuild better-sqlite3 for Electron.
 *
 * Strategy:
 *   Extract the matching prebuilt tarball from repo's prebuilds/ and place
 *   the .node file at resources/{platform}-{arch}/better_sqlite3.node.
 *   This path is independent of node_modules, so it works even when
 *   better-sqlite3's install script fails (e.g. corporate proxy / no build tools).
 *
 *   The db/index.ts loader checks this path first before falling back to
 *   the standard node_modules resolution.
 */

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

const root = path.resolve(__dirname, '..')

// Read electron version — prefer dist/version (written by electron's install script)
let electronVersion = '31.7.7'
try {
  const distVersion = fs.readFileSync(
    path.join(root, 'node_modules', 'electron', 'dist', 'version'), 'utf8'
  ).trim()
  if (distVersion) electronVersion = distVersion
} catch {
  try {
    const electronPkg = JSON.parse(
      fs.readFileSync(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8')
    )
    electronVersion = electronPkg.version
  } catch {
    // fall back to hardcoded default
  }
}

// Read sqlite version — fall back to hardcoded if node_modules not present
let sqliteVersion = '11.10.0'
const sqliteDir = path.join(root, 'node_modules', 'better-sqlite3')
try {
  const sqlitePkg = JSON.parse(
    fs.readFileSync(path.join(sqliteDir, 'package.json'), 'utf8')
  )
  sqliteVersion = sqlitePkg.version
} catch {
  // fall back to hardcoded default
}

// Electron ABI map — extend when upgrading Electron.
const ELECTRON_ABI = { '31': '128', '32': '130', '33': '132', '34': '134' }
const majorVersion = electronVersion.split('.')[0]
const abi = ELECTRON_ABI[majorVersion]

const platform = process.platform  // win32 | darwin | linux
const arch = process.arch           // x64 | arm64

console.log(`[rebuild-sqlite] Electron ${electronVersion} (ABI v${abi ?? '?'}) — ${platform}-${arch}`)
console.log(`[rebuild-sqlite] sqlite version: ${sqliteVersion}`)

if (!abi) {
  console.error(`[rebuild-sqlite] ✗ unknown Electron major version: ${majorVersion}`)
  console.error('[rebuild-sqlite] Add it to ELECTRON_ABI map in scripts/rebuild-sqlite.js')
  process.exit(1)
}

const tarName = `better-sqlite3-v${sqliteVersion}-electron-v${abi}-${platform}-${arch}.tar.gz`
const srcTar = path.join(root, 'prebuilds', tarName)

console.log(`[rebuild-sqlite] looking for tarball: ${tarName}`)

if (!fs.existsSync(srcTar)) {
  console.error(`[rebuild-sqlite] ✗ no bundled prebuilt found: prebuilds/${tarName}`)
  console.error('[rebuild-sqlite] Add the tarball to the prebuilds/ directory.')
  process.exit(1)
}

// Destination: resources/{platform}-{arch}/better_sqlite3.node
// This path is checked first by db/index.ts before node_modules resolution.
const destDir = path.join(root, 'resources', `${platform}-${arch}`)
const destFile = path.join(destDir, 'better_sqlite3.node')

// Skip if already installed
if (fs.existsSync(destFile)) {
  console.log(`[rebuild-sqlite] ✓ already installed → resources/${platform}-${arch}/better_sqlite3.node`)
  process.exit(0)
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'better-sqlite3-'))
try {
  execSync(`tar -xzf "${srcTar}" -C "${tmpDir}"`, { stdio: 'inherit' })
  const extracted = path.join(tmpDir, 'build', 'Release', 'better_sqlite3.node')
  if (!fs.existsSync(extracted)) {
    throw new Error(`expected build/Release/better_sqlite3.node inside ${tarName}`)
  }
  fs.mkdirSync(destDir, { recursive: true })
  fs.copyFileSync(extracted, destFile)
  console.log(`[rebuild-sqlite] ✓ prebuilt binary installed → resources/${platform}-${arch}/better_sqlite3.node`)
} catch (err) {
  console.error(`[rebuild-sqlite] ✗ extraction failed: ${err.message}`)
  process.exit(1)
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}
