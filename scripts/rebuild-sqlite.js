#!/usr/bin/env node
/**
 * Rebuild better-sqlite3 for Electron.
 *
 * Strategy:
 *   1. Extract the matching prebuilt tarball from repo's prebuilds/ and place
 *      the .node file at prebuilds/{platform}-{arch}/electron-v{abi}.node —
 *      the exact path node-gyp-build looks for at Electron runtime.
 *      Zero network access, zero build tools required.
 *   2. If no bundled tarball matches, fall back to electron-rebuild (source compile).
 */

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

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

// Step 1: extract bundled tarball and place binary where node-gyp-build expects it.
if (abi) {
  const tarName = `better-sqlite3-v${sqliteVersion}-electron-v${abi}-${platform}-${arch}.tar.gz`
  const srcTar = path.join(root, 'prebuilds', tarName)

  if (fs.existsSync(srcTar)) {
    // Destination: prebuilds/{platform}-{arch}/electron-v{abi}.node
    // This is exactly where node-gyp-build looks for Electron prebuilds.
    const destDir = path.join(sqliteDir, 'prebuilds', `${platform}-${arch}`)
    const destFile = path.join(destDir, `electron-v${abi}.node`)

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'better-sqlite3-'))
    try {
      execSync(`tar -xzf "${srcTar}" -C "${tmpDir}"`, { stdio: 'inherit' })
      const extracted = path.join(tmpDir, 'build', 'Release', 'better_sqlite3.node')
      if (!fs.existsSync(extracted)) {
        throw new Error(`expected build/Release/better_sqlite3.node inside ${tarName}`)
      }
      fs.mkdirSync(destDir, { recursive: true })
      fs.copyFileSync(extracted, destFile)
      console.log(`[rebuild-sqlite] ✓ prebuilt binary installed → prebuilds/${platform}-${arch}/electron-v${abi}.node`)
      process.exit(0)
    } catch (err) {
      console.warn(`[rebuild-sqlite] extraction failed: ${err.message}`)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  } else {
    console.warn(`[rebuild-sqlite] no bundled prebuilt for ${tarName} — falling back to compile`)
  }
}

// Step 2: compile from source as last resort (requires build tools).
console.warn('[rebuild-sqlite] falling back to electron-rebuild (requires Visual Studio / Xcode / build-essential)')
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
