#!/usr/bin/env node
/**
 * Rebuild better-sqlite3 for Electron.
 *
 * Strategy:
 *   1. Try prebuild-install to download a prebuilt binary from GitHub Releases.
 *      This works on all platforms without requiring Visual Studio / Xcode / node-gyp.
 *   2. If that fails (no prebuilt for this Electron version, or network error),
 *      fall back to electron-rebuild which compiles from source.
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

// Read the Electron version from the installed package so this script stays
// correct even when the lockfile pins a different patch version.
let electronVersion = '31.7.7'
try {
  const electronPkg = JSON.parse(
    fs.readFileSync(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8')
  )
  electronVersion = electronPkg.version
} catch {
  // fall back to the hardcoded default
}

const prebuildBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'prebuild-install.cmd' : 'prebuild-install')
const prebuildCmd = `"${prebuildBin}" --runtime electron --target ${electronVersion} --tag-prefix v`

console.log(`[rebuild-sqlite] Electron ${electronVersion} — trying prebuild-install…`)

try {
  execSync(prebuildCmd, { cwd: sqliteDir, stdio: 'inherit' })
  console.log('[rebuild-sqlite] ✓ prebuilt binary installed')
} catch {
  console.warn('[rebuild-sqlite] prebuild-install failed — falling back to electron-rebuild (requires build tools)')
  const rebuildBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-rebuild.cmd' : 'electron-rebuild')
  try {
    execSync(`"${rebuildBin}" -f -w better-sqlite3`, { cwd: root, stdio: 'inherit' })
    console.log('[rebuild-sqlite] ✓ compiled from source via electron-rebuild')
  } catch (err) {
    console.error('[rebuild-sqlite] ✗ both strategies failed')
    console.error(err.message)
    process.exit(1)
  }
}
