import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import { homedir } from 'node:os'

const root = fileURLToPath(new URL('../../', import.meta.url))
const artifacts = resolve(root, '.jait/artifacts/rust-contract-target')
mkdirSync(artifacts, { recursive: true })
const localCargo = join(homedir(), '.cargo/bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo')
const cargo = process.env.CARGO || (existsSync(localCargo) ? localCargo : 'cargo')
const [mode = 'run', ...args] = process.argv.slice(2)
if (!['run', 'internal', 'coverage', 'test', 'fmt', 'clippy'].includes(mode)) throw new Error('Expected run, internal, coverage, test, fmt or clippy')
const manifest = fileURLToPath(new URL('./Cargo.toml', import.meta.url))
const cargoArgs = mode === 'fmt'
  ? ['fmt', '--manifest-path', manifest, '--', '--check']
  : [['internal', 'coverage'].includes(mode) ? 'run' : mode, '--locked', '--manifest-path', manifest,
    ...(['internal', 'coverage'].includes(mode) ? ['--bin', mode === 'internal' ? 'internal-contract' : 'coverage', '--', ...args]
      : mode === 'run' ? ['--', ...args] : args)]
const child = spawn(cargo, cargoArgs, {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, CARGO_TARGET_DIR: artifacts, CARGO_BUILD_JOBS: '2', CARGO_TERM_PROGRESS_WHEN: 'never', CARGO_TERM_COLOR: 'never' },
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })
