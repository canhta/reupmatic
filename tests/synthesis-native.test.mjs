import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { WorkerClient } from '../dist-core/worker/worker-client.js';
import { SynthesisCoordinator } from '../dist-core/speech/synthesis/coordinator.js';
import { SynthesisArtifacts } from '../dist-core/speech/synthesis/artifacts.js';
import { registeredMediaResponse } from '../dist-core/media/media-response.js';

const repo = fileURLToPath(new URL('../',import.meta.url)), run = promisify(execFile);
const python = process.env.PYTHON || 'python3';
async function native(t) {
  const root = await mkdtemp(path.join(tmpdir(),'synthesis-bridge-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const {stdout} = await run(python,['-c',
    'from pathlib import Path; import sys,json; from synthesis_fixture import bundle,sdk; root=Path(sys.argv[1]); manifest,_=bundle(root); print(json.dumps({"manifest":str(manifest),"sdk":str(sdk(root))}))',root],
    {env:{...process.env,PYTHONPATH:path.join(repo,'tests')}});
  const config = JSON.parse(stdout);
  const old = process.env.PYTHONPATH;
  process.env.PYTHONPATH = config.sdk;
  const workspace = path.join(root,'workspace'); await mkdir(workspace);
  const worker = new WorkerClient(python,path.join(repo,'worker/main.py'),workspace);
  // WorkerClient starts the subprocess in its constructor; restore parent test environment.
  if (old === undefined) delete process.env.PYTHONPATH; else process.env.PYTHONPATH=old;
  t.after(()=>worker.stop());
  const status = await worker.request('synthesis.configure',{path:config.manifest}).result;
  assert.equal(status.available,true);
  const input = {request_id:randomUUID(),revision:31,params:{source_layer:'spoken',source_token:'spoken-12345678',
    language:'vi',model_id:status.model_id,voice_id:'test-voice',cues:[{id:'voice-1',text:'Xin chào',start_ms:5000,end_ms:6000}]}};
  const artifacts = new SynthesisArtifacts(workspace), coordinator = new SynthesisCoordinator(worker,artifacts);
  t.after(()=>coordinator.close());
  return {root,workspace,worker,artifacts,coordinator,input};
}

test('real TS coordinator and Python worker promote an auditionable PCM artifact through the shared queue', async t => {
  const f = await native(t), events=[]; f.coordinator.on('job',event=>events.push(event));
  const result = await f.coordinator.start(f.input).result;
  assert.equal(result.kind,'synthesis'); assert.equal(result.frames,4800);
  assert.equal(events.filter(e=>e.event==='result').length,1);
  const filename = await f.artifacts.verify(result.artifact_id);
  const response = await registeredMediaResponse(new Request('media://local/voice',{headers:{Range:'bytes=0-43'}}),filename);
  assert.equal(response.status,206); assert.equal(response.headers.get('content-type'),'audio/wav');
  assert.equal(Buffer.from(await response.arrayBuffer()).toString('ascii',0,4),'RIFF');
  await f.artifacts.save(result.artifact_id,'wav',path.join(f.root,'reviewed.wav'),[]);
  assert.equal((await readFile(path.join(f.root,'reviewed.wav'))).length,9644);
  assert.equal((await f.worker.request('hello',{}).result).protocol,1);
});

test('real worker failure preserves an earlier admitted speech artifact and stays usable', async t => {
  const f = await native(t);
  const first = await f.coordinator.start(f.input).result;
  const retry = {...f.input,request_id:randomUUID(),params:{...f.input.params,model_id:'f'.repeat(64)}};
  await assert.rejects(f.coordinator.start(retry).result,/SYNTHESIS_MODEL_CHANGED/);
  assert.ok(await f.artifacts.verify(first.artifact_id));
  assert.equal(f.coordinator.activeCount,0);
  assert.equal((await f.worker.request('synthesis.status',{}).result).available,true);
});
