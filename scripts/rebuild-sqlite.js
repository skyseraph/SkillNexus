#!/usr/bin/env node
/**
 * Rebuild better-sqlite3 for Electron.
 *
 * Strategy:
 *   1. Scan prebuilds/ for ALL tarballs matching the current platform/arch.
 *      Extract each one as better_sqlite3_v{abi}.node so the app can pick
 *      the right binary at runtime using process.versions.modules (NMV),
 *      regardless of which Electron version is actually installed.
 *
 *   2. If better-sqlite3 is missing from node_modules (npm skipped it due to
 *      optionalDependency + corporate proxy failure), copy vendor/better-sqlite3
 *      into out/node_modules/better-sqlite3 so that the external
 *      require('better-sqlite3') in the built bundle resolves correctly.
 */

const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

const root = path.resolve(__dirname, '..')
const platform = process.platform  // win32 | darwin | linux
const arch = process.arch           // x64 | arm64

let sqliteVersion = '11.10.0'
try {
  const sqlitePkg = JSON.parse(
    fs.readFileSync(path.join(root, 'node_modules', 'better-sqlite3', 'package.json'), 'utf8')
  )
  sqliteVersion = sqlitePkg.version
} catch {
  // fall back to hardcoded default
}

console.log(`[rebuild-sqlite] platform: ${platform}-${arch}, sqlite: ${sqliteVersion}`)

// ---------------------------------------------------------------------------
// 1. Extract ALL prebuilts for this platform/arch, named by ABI version
//    e.g. better-sqlite3-v11.10.0-electron-v125-win32-x64.tar.gz
//       → resources/win32-x64/better_sqlite3_v125.node
// ---------------------------------------------------------------------------

const prebuildsDir = path.join(root, 'prebuilds')
const destDir = path.join(root, 'resources', `${platform}-${arch}`)
fs.mkdirSync(destDir, { recursive: true })

// Match tarballs for this platform/arch
const tarPattern = new RegExp(
  `^better-sqlite3-v[\\d.]+-electron-v(\\d+)-${platform}-${arch}\\.tar\\.gz$`
)

const tarballs = fs.readdirSync(prebuildsDir).filter(f => tarPattern.test(f))

if (tarballs.length === 0) {
  console.error(`[rebuild-sqlite] ✗ no prebuilts found in prebuilds/ for ${platform}-${arch}`)
  process.exit(1)
}

for (const tarFile of tarballs) {
  const abiMatch = tarFile.match(tarPattern)
  const abi = abiMatch[1]
  const destFile = path.join(destDir, `better_sqlite3_v${abi}.node`)
  const srcTar = path.join(prebuildsDir, tarFile)

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'better-sqlite3-'))
  try {
    execSync(`tar -xzf "${srcTar}" -C "${tmpDir}"`, { stdio: 'inherit' })
    const extracted = path.join(tmpDir, 'build', 'Release', 'better_sqlite3.node')
    if (!fs.existsSync(extracted)) {
      throw new Error(`expected build/Release/better_sqlite3.node inside ${tarFile}`)
    }
    fs.copyFileSync(extracted, destFile)
    console.log(`[rebuild-sqlite] ✓ ABI v${abi} → resources/${platform}-${arch}/better_sqlite3_v${abi}.node`)
  } catch (err) {
    console.error(`[rebuild-sqlite] ✗ extraction failed for ${tarFile}: ${err.message}`)
    process.exit(1)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// 2. Vendor copy: if better-sqlite3 is missing from node_modules, copy
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
