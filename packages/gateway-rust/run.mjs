import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = fileURLToPath(new URL('./Cargo.toml', import.meta.url));
const target = join(root, '.jait/artifacts/gateway-rust-target');
mkdirSync(target, { recursive: true });
const localCargo = join(homedir(), '.cargo/bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo');
const cargo = process.env.CARGO || (existsSync(localCargo) ? localCargo : 'cargo');
const [mode = 'run', ...args] = process.argv.slice(2);
if (!['run', 'build', 'check', 'test', 'fmt', 'clippy'].includes(mode)) throw new Error('Expected run, build, check, test, fmt, or clippy');
const cargoArgs = mode === 'fmt'
  ? ['fmt', '--manifest-path', manifest, '--', '--check']
  : [mode, '--locked', '--manifest-path', manifest, ...args];
const child = spawn(cargo, cargoArgs, {
  cwd: root, stdio: 'inherit',
  env: { ...process.env, CARGO_TARGET_DIR: target, CARGO_BUILD_JOBS: '2', CARGO_TERM_PROGRESS_WHEN: 'never', CARGO_TERM_COLOR: 'never' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
