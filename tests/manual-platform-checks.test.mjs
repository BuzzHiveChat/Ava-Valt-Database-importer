import test from 'node:test';
import assert from 'node:assert/strict';
import {platformCheckBatches,runSelectedPlatformChecks,PLATFORM_CHECK_BATCH_SIZE} from '../lib/manualPlatformChecks.mjs';

const sample = n => Array.from({length:n},(_,i)=>({id:`avtr_test-${i}`}));
const response = batch => ({avatars:batch,stats:{attempted:batch.length,resolvedByLookup:Math.min(2,batch.length),unresolved:Math.max(0,batch.length-2),deferred:0}});

test('more than 10 selections are partitioned without dropping avatars', () => {
  const groups=platformCheckBatches(sample(27));
  assert.deepEqual(groups.map(g=>g.length),[10,10,7]);
  assert.equal(groups.flat().length,27);
  assert.equal(PLATFORM_CHECK_BATCH_SIZE,10);
});

test('does not allow a caller to exceed the server request limit', () => {
  assert.deepEqual(platformCheckBatches(sample(23),500).map(g=>g.length),[10,10,3]);
  assert.deepEqual(platformCheckBatches(sample(3),-1).map(g=>g.length),[3]);
});

test('deduplicates IDs before batching', () => {
  assert.deepEqual(platformCheckBatches([...sample(12),sample(12)[0]]).map(g=>g.length),[10,2]);
});

test('bulk check processes all selected IDs in sequential capped batches', async () => {
  const ids=[],progress=[];
  const result=await runSelectedPlatformChecks({
    avatars:sample(37),delayMs:0,
    requestBatch:async batch=>{ids.push(...batch.map(a=>a.id));return response(batch)},
    onBatch:(_,summary)=>progress.push(summary.processed)
  });
  assert.deepEqual(progress,[10,20,30,37]);
  assert.equal(ids.length,37);
  assert.equal(new Set(ids).size,37);
  assert.equal(result.attempted,37);
  assert.equal(result.resolved,8);
  assert.equal(result.processed,37);
  assert.equal(result.error,null);
});

test('even 1000 selected avatars can be checked without increasing the single-request limit', async () => {
  let count=0,max=0;
  const result=await runSelectedPlatformChecks({avatars:sample(1000),delayMs:0,requestBatch:async batch=>{count++;max=Math.max(max,batch.length);return response(batch)}});
  assert.equal(count,100);
  assert.equal(max,10);
  assert.equal(result.processed,1000);
});

test('stop request prevents additional API calls without dropping completed results',async()=>{
  let stopped=false,requests=0;
  const summary=await runSelectedPlatformChecks({avatars:sample(28),delayMs:0,shouldStop:()=>stopped,requestBatch:async batch=>{requests++;stopped=true;return response(batch)}});
  assert.equal(summary.stopped,true);
  assert.equal(requests,1);
  assert.equal(summary.processed,10);
});

test('one failed batch pauses the process, preserving previous successful batches',async()=>{
  let requests=0;
  const summary=await runSelectedPlatformChecks({avatars:sample(25),delayMs:0,requestBatch:async batch=>{requests++;if(requests===2)throw new Error('provider is down');return response(batch)}});
  assert.equal(summary.processed,10);
  assert.equal(summary.error,'provider is down');
  assert.equal(requests,2);
});

test('deferred avatar lookups are not counted as definitely checked',async()=>{
  const summary=await runSelectedPlatformChecks({avatars:sample(10),delayMs:0,requestBatch:async batch=>({avatars:batch,stats:{attempted:6,resolvedByLookup:3,unresolved:7,deferred:4}})});
  assert.equal(summary.processed,10);
  assert.equal(summary.attempted,6);
  assert.equal(summary.resolved,3);
  assert.equal(summary.unresolved,3);
  assert.equal(summary.deferred,4);
});
