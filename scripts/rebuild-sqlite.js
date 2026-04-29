#!/usr/bin/env node
/**
 * Rebuild better-sqlite3 for Electron.
 *
 * Strategy:
 *   1. Copy the matching prebuilt tarball from repo's prebuilds/ into
 *      node_modules/better-sqlite3/prebuilds/ so prebuild-install finds it
 *      locally — no network access or build tools required.
 *   2. Run prebuild-install (picks up the local file).
 *   3. If that fails, fall back to electron-rebuild (requires build tools).
 */

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const root = path.resolve(__dirname, '..')
const sqliteDir = path.join(root, 'node_modules', 'better-sqlite3')

if (!fs.existsSync(sqliteDir)) {
  console.error('[rebuild-sqlite] better-sqlite3 not found in node_modules — run npm install first')
  process.exit(1)
}

// Read versions dynamically so this script stays correct across lockfile updates.
let electronVersion = '31.7.7'
try {
  const electronPkg = JSON.parse(
    fs.readFileSync(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8')
  )
  electronVersion = electronPkg.version
} catch {
  // fall back to the hardcoded default
}

let sqliteVersion = '11.10.0'
try {
  const sqlitePkg = JSON.parse(
    fs.readFileSync(path.join(sqliteDir, 'package.json'), 'utf8')
  )
  sqliteVersion = sqlitePkg.version
} catch {
  // fall back to the hardcoded default
}

// Electron ABI map — extend when upgrading Electron.
const ELECTRON_ABI = { '31': '128', '32': '130', '33': '132', '34': '134' }
const majorVersion = electronVersion.split('.')[0]
const abi = ELECTRON_ABI[majorVersion]

const platform = process.platform  // win32 | darwin | linux
const arch = process.arch           // x64 | arm64

console.log(`[rebuild-sqlite] Electron ${electronVersion} (ABI v${abi ?? '?'}) — ${platform}-${arch}`)

// Step 1: seed node_modules/better-sqlite3/prebuilds/ from our bundled tarballs.
if (abi) {
  const tarName = `better-sqlite3-v${sqliteVersion}-electron-v${abi}-${platform}-${arch}.tar.gz`
  const srcTar = path.join(root, 'prebuilds', tarName)
  const destDir = path.join(sqliteDir, 'prebuilds')
  const destTar = path.join(destDir, tarName)

  if (fs.existsSync(srcTar)) {
    fs.mkdirSync(destDir, { recursive: true })
    fs.copyFileSync(srcTar, destTar)
    console.log(`[rebuild-sqlite] seeded local prebuilt: ${tarName}`)
  } else {
    console.warn(`[rebuild-sqlite] no bundled prebuilt for ${tarName} — will try network download`)
  }
}

// Step 2: run prebuild-install (finds the local file or falls back to download).
const prebuildBin = path.join(
  root, 'node_modules', '.bin',
  process.platform === 'win32' ? 'prebuild-install.cmd' : 'prebuild-install'
)
const prebuildCmd = `"${prebuildBin}" --runtime electron --target ${electronVersion} --tag-prefix v`

try {
  execSync(prebuildCmd, { cwd: sqliteDir, stdio: 'inherit' })
  console.log('[rebuild-sqlite] ✓ prebuilt binary installed')
  process.exit(0)
} catch {
  console.warn('[rebuild-sqlite] prebuild-install failed — falling back to electron-rebuild (requires build tools)')
}

// Step 3: compile from source as last resort.
const rebuildBin = path.join(
  root, 'node_modules', '.bin',
  process.platform === 'win32' ? 'electron-rebuild.cmd' : 'electron-rebuild'
)
try {
  execSync(`"${rebuildBin}" -f -w better-sqlite3`, { cwd: root, stdio: 'inherit' })
  console.log('[rebuild-sqlite] ✓ compiled from source via electron-rebuild')
} catch (err) {
  console.error('[rebuild-sqlite] ✗ both strategies failed')
  console.error(err.message)
  process.exit(1)
}
