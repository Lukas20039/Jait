// Development evidence only. The native gateway itself has no JS runtime dependency.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const manifestPath = fileURLToPath(new URL('../native-coverage.json', import.meta.url));
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const inventory = JSON.parse(readFileSync(join(root, 'tests/contract/coverage.json'), 'utf8'));
const known = new Set(inventory.source_files.map(f => f.path));
if (known.size !== manifest.inventory_total) throw new Error('component inventory changed; review native progress denominator');
const credited = manifest.components.filter(c => c.status === 'verified');
if (new Set(credited.map(c => c.reference)).size !== credited.length) throw new Error('duplicate native component credit');
for (const c of manifest.components) {
  if (!known.has(c.reference)) throw new Error('unknown component: ' + c.reference);
  if (c.status === 'verified' && (!c.native.length || !c.contracts.length || !c.review)) throw new Error('missing component evidence');
}
const hash = path => createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
for (const c of credited) {
  if (hash(c.reference) !== c.reference_sha256) throw new Error('reference changed; review native parity: ' + c.reference);
}
const nativeFiles = readdirSync(join(root, 'packages/gateway-rust/src'), {recursive:true,withFileTypes:true})
  .filter(e => e.isFile()).map(e => join(e.parentPath,e.name).slice(root.length));
const sharedFiles = readdirSync(join(root, 'packages/shared/src'), {recursive:true,withFileTypes:true})
  .filter(e => e.isFile()).map(e => join(e.parentPath,e.name).slice(root.length));
const paths = [...new Set([
  // Bind indirect gateway dependencies (server hooks/config/helpers) as well.
  ...known, ...sharedFiles, ...nativeFiles, 'packages/gateway-rust/run.mjs', 'packages/gateway-rust/tooling/check-native.mjs', 'packages/gateway/package.json',
  'tests/contract/coverage.json', 'packages/gateway-rust/native-coverage.json',
  'packages/gateway-rust/Cargo.toml', 'packages/gateway-rust/Cargo.lock',
  'packages/gateway-rust/build.rs', 'packages/gateway-rust/tooling/validate-frozen.py',
  'tests/contract/tooling/test_native_inventory_metadata.py', 'tests/contract/Cargo.toml', 'tests/contract/Cargo.lock',
  'tests/contract/src/internal_driver.rs', 'tests/contract/drivers/internals.ts',
  ...credited.flatMap(c => [c.reference, ...c.native, ...c.contracts]),
])].sort();
const fingerprint = () => Object.fromEntries(paths.map(p => [p, hash(p)]));
const before = fingerprint();
const output = resolve(root, '.jait/artifacts/gateway-rust/native-progress');
mkdirSync(output, {recursive:true});
const targets = [...new Set(credited.flatMap(c => c.targets))];
const commands = [
  [join(root, 'packages/gateway-rust/run.mjs'), 'fmt'],
  [join(root, 'packages/gateway-rust/run.mjs'), 'clippy', '--all-targets', '--', '-D', 'warnings'],
  [join(root, 'packages/gateway-rust/run.mjs'), 'test', '--lib'],
  [join(root, 'tests/contract/run.mjs'), 'test', ...targets.flatMap(t => ['--test', t])],
];
const checks = [];
let stdout = '', stderr = '';
for (const args of commands) {
  const checked = spawnSync(process.execPath, args, {cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});
  stdout += checked.stdout ?? ''; stderr += checked.stderr ?? '';
  checks.push({args:args.map(a => a.startsWith(root) ? a.slice(root.length) : a),exit:checked.status,error:checked.error?.message});
  if (checked.status !== 0) break;
}
const result = {status:checks.every(c=>c.exit===0) ? 0 : 1,stdout,stderr};
writeFileSync(join(output, 'validation.log'), stdout + stderr);
const after = fingerprint();
const passed = result.status === 0 && JSON.stringify(before) === JSON.stringify(after);
const report = {
  format: 1, generated_at: new Date().toISOString(), passed, test_exit: result.status,
  sources_unchanged: JSON.stringify(before) === JSON.stringify(after),
  inventory_total: manifest.inventory_total, verified_components: passed ? credited.length : 0,
  verified_percent: passed ? Number((100 * credited.length / manifest.inventory_total).toFixed(2)) : 0,
  replacement_ready: false, checks, targets, sources: before, components: credited,
};
writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log((result.stdout ?? '').slice(-7000) + (result.stderr ?? '').slice(-2000));
console.log(JSON.stringify({passed, verified:report.verified_components, total:manifest.inventory_total, percent:report.verified_percent, report:'.jait/artifacts/gateway-rust/native-progress/report.json'}));
if (!passed) process.exitCode = 1;
