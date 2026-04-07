/**
 * postinstall.js
 *
 * Downloads the pre-built better-sqlite3 binary for the installed Electron
 * version using prebuild-install. No Python or C++ build tools required.
 *
 * Falls back gracefully if the download fails (e.g. offline) and prints
 * instructions for compiling from source when build tools are available.
 */

const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const ROOT = path.resolve(__dirname, '..')

// 1. Ensure the Electron binary is downloaded
const electronInstall = path.join(ROOT, 'node_modules', 'electron', 'install.js')
if (fs.existsSync(electronInstall)) {
  console.log('[postinstall] Installing Electron binary...')
  try {
    execFileSync(process.execPath, [electronInstall], { cwd: ROOT, stdio: 'inherit' })
    console.log('[postinstall] ✓ Electron binary ready.')
  } catch {
    console.warn('[postinstall] ✗ Electron binary download failed — re-run npm install to retry.')
  }
}

const MODULE_DIR = path.join(ROOT, 'node_modules', 'better-sqlite3')

// Skip if better-sqlite3 hasn't been installed yet
if (!fs.existsSync(MODULE_DIR)) {
  console.log('[postinstall] better-sqlite3 not found, skipping native rebuild.')
  process.exit(0)
}

// Read the actual installed Electron version dynamically
let electronVersion
try {
  const electronPkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8')
  )
  electronVersion = electronPkg.version
} catch {
  electronVersion = '31.0.0'
}

// Locate the prebuild-install bin.js — must invoke via `node` on Windows
// because .cmd shims require a shell, but execFileSync does not use one.
function findPrebuildBinJs() {
  const candidates = [
    path.join(ROOT, 'node_modules', 'prebuild-install', 'bin.js'),
    path.join(MODULE_DIR, 'node_modules', 'prebuild-install', 'bin.js')
  ]
  return candidates.find(fs.existsSync) || null
}

const prebuildBinJs = findPrebuildBinJs()
if (!prebuildBinJs) {
  console.warn('[postinstall] prebuild-install not found — skipping.')
  process.exit(0)
}

console.log(`[postinstall] Downloading better-sqlite3 pre-built binary for Electron ${electronVersion}...`)

try {
  // Invoke via the current Node executable so no shell is required on Windows.
  execFileSync(process.execPath, [prebuildBinJs, '-r', 'electron', '-t', electronVersion, '--arch', 'x64'], {
    cwd: MODULE_DIR,
    stdio: 'inherit'
  })
  console.log('[postinstall] ✓ better-sqlite3 is ready for Electron.')
} catch {
  console.warn('[postinstall] ✗ Pre-built binary download failed.')
  console.warn('[postinstall]   If you have Visual Studio Build Tools + Python, run:')
  console.warn('[postinstall]     npm run rebuild:native')
}
