import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../', import.meta.url));
test('reference review build has locked dependencies and no native gateway coupling', () => {
  const local = join(homedir(), '.cargo/bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo');
  const cargo = process.env.CARGO || (existsSync(local) ? local : 'cargo');
  const manifest = join(root, 'tests/source-review/Cargo.toml');
  const result = spawnSync(cargo, ['metadata', '--locked', '--offline', '--no-deps', '--format-version', '1', '--manifest-path', manifest], {
    cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024,
    env: { ...process.env, CARGO_TARGET_DIR: join(root, '.jait/artifacts/rust-contract-target') },
  });
  assert.equal(result.status, 0, result.stderr);
  const metadata = JSON.parse(result.stdout);
  assert.equal(metadata.packages.length, 1);
  const pkg = metadata.packages[0];
  assert.equal(pkg.name, 'jait-source-review');
  assert.equal(pkg.targets.length, 1);
  assert.deepEqual(pkg.targets[0].kind, ['test']);
  assert.equal(pkg.targets[0].name, 'source_review');
  assert.equal(realpathSync(pkg.targets[0].src_path), realpathSync(join(root, 'tests/contract/tests/source_review.rs')));
  assert.deepEqual(pkg.dependencies.map(item => item.name).sort(), ['anyhow', 'hex', 'reqwest', 'serde', 'serde_json', 'sha2', 'uuid']);
  assert.ok(pkg.dependencies.every(item => !item.path && item.req.startsWith('=')));
});
