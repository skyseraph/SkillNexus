#!/usr/bin/env node
/**
 * Rebuild better-sqlite3 for Electron.
 *
 * Strategy:
 *   1. Extract the matching prebuilt tarball from prebuilds/ and place the
 *      .node file at resources/{platform}-{arch}/better_sqlite3.node.
 *      db/index.ts passes this path via the nativeBinding option so
 *      node-gyp-build / bindings are never invoked at runtime.
 *
 *   2. If better-sqlite3 is missing from node_modules (npm skipped it due to
 *      optionalDependency + corporate proxy failure), copy vendor/better-sqlite3
 *      into out/node_modules/better-sqlite3 so that the external
 *      require('better-sqlite3') in the built bundle resolves correctly.
 *      Node's module resolution walks: out/main/node_modules → out/node_modules
 *      → node_modules, so out/node_modules/ is sufficient.
 */

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

const root = path.resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// 1. Detect Electron + sqlite versions
// ---------------------------------------------------------------------------

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

let sqliteVersion = '11.10.0'
try {
  const sqlitePkg = JSON.parse(
    fs.readFileSync(path.join(root, 'node_modules', 'better-sqlite3', 'package.json'), 'utf8')
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

// ---------------------------------------------------------------------------
// 2. Extract prebuilt binary → resources/{platform}-{arch}/better_sqlite3.node
// ---------------------------------------------------------------------------

const tarName = `better-sqlite3-v${sqliteVersion}-electron-v${abi}-${platform}-${arch}.tar.gz`
const srcTar = path.join(root, 'prebuilds', tarName)

console.log(`[rebuild-sqlite] looking for tarball: ${tarName}`)

if (!fs.existsSync(srcTar)) {
  console.error(`[rebuild-sqlite] ✗ no bundled prebuilt found: prebuilds/${tarName}`)
  console.error('[rebuild-sqlite] Add the tarball to the prebuilds/ directory.')
  process.exit(1)
}

const destDir = path.join(root, 'resources', `${platform}-${arch}`)
const destFile = path.join(destDir, 'better_sqlite3.node')

if (fs.existsSync(destFile)) {
  console.log(`[rebuild-sqlite] ✓ already installed → resources/${platform}-${arch}/better_sqlite3.node`)
} else {
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
}

// ---------------------------------------------------------------------------
// 3. Vendor copy: if better-sqlite3 is missing from node_modules, copy
//    vendor/better-sqlite3 into out/node_modules/better-sqlite3 so the
//    external require('better-sqlite3') in the built bundle resolves.
// ---------------------------------------------------------------------------

const nmSqlite = path.join(root, 'node_modules', 'better-sqlite3')
const vendorSrc = path.join(root, 'vendor', 'better-sqlite3')
const outModules = path.join(root, 'out', 'node_modules', 'better-sqlite3')

if (!fs.existsSync(nmSqlite) && fs.existsSync(vendorSrc)) {
  console.log('[rebuild-sqlite] better-sqlite3 missing from node_modules — copying vendor/ to out/node_modules/')
  copyDirSync(vendorSrc, outModules)
  console.log('[rebuild-sqlite] ✓ vendor better-sqlite3 → out/node_modules/better-sqlite3')
} else {
  console.log('[rebuild-sqlite] ✓ better-sqlite3 present in node_modules — skipping vendor copy')
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
