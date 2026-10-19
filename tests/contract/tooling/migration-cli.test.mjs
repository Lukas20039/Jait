import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
const command=fileURLToPath(new URL('../migration.mjs',import.meta.url))
for(const args of [[],['--backend','unknown'],['--backend','bun','--backend','rust'],['--backend','rust','--active-stream-argv','[]'],['--backend','rust','--active-stream-argv','[1]'],['--backend','rust','--active-stream-argv','[" "]'],['--backend','rust','--active-stream-argv','["native","\\u0000"]']]){
  test(`reject invalid selection before launching Cargo: ${JSON.stringify(args)}`,()=>{
    const result=spawnSync(process.execPath,[command,...args],{encoding:'utf8',timeout:2000,env:{...process.env,CARGO:'/__jait_should_never_launch__'}})
    assert.equal(result.status,1)
    assert.match(result.stderr,/Usage:|required|Invalid active-stream/)
    assert.doesNotMatch(result.stderr,/__jait_should_never_launch__/)
  })
}
const { completeCases } = await import('../migration-report.mjs')
test('omitted required scenario remains blocked instead of lowering acceptance',()=>{
  assert.deepEqual(completeCases(['storage/retain','stream/cancel'],[{id:'storage/retain',status:'passed'}]),[
    {id:'storage/retain',status:'passed'},
    {id:'stream/cancel',status:'blocked',reason:'Required scenario was not executed'},
  ])
})
test('duplicate and unregistered observations cannot manufacture passing cases',()=>{
  assert.throws(()=>completeCases(['storage/retain'],[{id:'storage/retain',status:'passed'},{id:'storage/retain',status:'passed'}]),/duplicate/)
  assert.throws(()=>completeCases(['storage/retain'],[{id:'other/case',status:'passed'}]),/Unexpected/)
})
test('a duplicate inventory is invalid even if all observations passed',()=>{
  assert.throws(()=>completeCases(['storage/retain','storage/retain'],[{id:'storage/retain',status:'passed'}]),/inventory/)
})
