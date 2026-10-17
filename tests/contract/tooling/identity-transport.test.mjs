import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
// Execute the actual generated transport helper; this catches field-name drift
// that isolated comparator tests cannot see.
function captureFixture(source) {
  const start = source.indexOf('const __jait_refs=');
  const end = source.indexOf('const __jait_captureType=', start);
  assert.ok(start >= 0 && end > start, 'generated reference-capture helper exists');
  const javascript = ts.transpile(source.slice(start, end));
  const rows = [];
  const context = {
    __jait_boxed: value => ({ type: typeof value, value }),
    __jait_record: row => rows.push(row),
  };
  vm.runInNewContext(javascript + '\nglobalThis.capture = __jait_capture;', context);
  return { capture: context.capture, rows };
}
const directory = new URL('../drivers/tailstatic/', import.meta.url);
test('generated peers send identity metadata under the Rust comparator keys', () => {
  for (const file of fs.readdirSync(directory).filter(file => file.endsWith('.ts'))) {
    const { capture, rows } = captureFixture(fs.readFileSync(new URL(file, directory), 'utf8'));
    const same = { aborted: false };
    capture(0, same, same);
    capture(1, same, { aborted: false });
    const fn = () => {};
    capture(2, fn, fn);
    capture(3, fn, () => {});
    capture(4, null, null);
    capture(5, true, true);
    for (const row of rows) {
      assert.ok(Object.hasOwn(row, 'ref'), file);
      assert.ok(Object.hasOwn(row, 'otherRef'), file);
    }
    assert.equal(rows[0].ref, rows[0].otherRef, file);
    assert.notEqual(rows[1].ref, rows[1].otherRef, file);
    assert.equal(rows[2].ref, rows[2].otherRef, file);
    assert.notEqual(rows[3].ref, rows[3].otherRef, file);
    assert.equal(rows[4].ref, null, file);
    assert.equal(rows[5].ref, null, file);
  }
});
test('the prior mismatched field is detected by the transport contract', () => {
  const first = fs.readdirSync(directory).find(file => file.endsWith('.ts'));
  const source = fs.readFileSync(new URL(first, directory), 'utf8');
  const mutant = source.replace('ref:__jait_ref(actual)', '__jait_ref:__jait_ref(actual)');
  assert.notEqual(mutant, source);
  const { capture, rows } = captureFixture(mutant);
  capture(0, {}, {});
  assert.equal(Object.hasOwn(rows[0], 'ref'), false);
});

test('generated serialization retains nested Date types without rereading getters', () => {
  for (const file of fs.readdirSync(directory).filter(file => file.endsWith('.ts'))) {
    const source = fs.readFileSync(new URL(file, directory), 'utf8');
    const start = source.indexOf('const __jait_symbols=');
    const end = source.indexOf('export async function run(', start);
    assert.ok(start >= 0 && end > start);
    const context = { Date, Map, Set, Error, RegExp, ArrayBuffer, DataView };
    vm.runInNewContext(ts.transpile(source.slice(start, end)) + '\nglobalThis.box = __jait_boxed;', context);
    const date = new Date('2020-01-01T00:00:00.000Z');
    const observed = context.box({ date, list: [date], invalid: new Date(NaN) });
    assert.equal(observed.value.date.__jait_type, 'date', file);
    assert.equal(observed.value.date.value, date.toISOString(), file);
    assert.equal(observed.value.list[0].__jait_type, 'date', file);
    assert.equal(observed.value.invalid.value, 'NaN', file);
    let reads = 0;
    context.box({ get value() { reads++; return 'plain string'; } });
    assert.equal(reads, 1, file);
  }
});
