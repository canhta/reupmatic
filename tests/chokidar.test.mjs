// Separate dependency/OS gate. Missing Chokidar fails this lane, never skips it.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { watch } from 'chokidar';
import { collectFiles } from '../dist-core/folders/folder-monitor.js';
async function until(predicate) {
  const end = Date.now() + 10000;
  while (!predicate()) { if (Date.now() > end) throw new Error('Chokidar event timeout'); await new Promise(resolve => setTimeout(resolve, 50)); }
}
test('installed Chokidar delivers stable-file events and closes cleanly', { timeout: 20000 }, async () => {
  const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'reupmatic-chokidar-')));
  const output = path.join(dir, 'out'); await fs.mkdir(output); const events = []; const errors = [];
  const observer = watch(dir, { ignoreInitial:true, followSymlinks:false, depth:0, awaitWriteFinish:{stabilityThreshold:300,pollInterval:50} });
  observer.on('add', filename => events.push(filename)).on('error', error => errors.push(error));
  try {
    await new Promise((resolve,reject) => { observer.once('ready',resolve); observer.once('error',reject); });
    const filename = path.join(dir, 'tiếng Việt.mp4'); await fs.writeFile(filename,'first');
    await new Promise(resolve=>setTimeout(resolve,100)); await fs.appendFile(filename,'second');
    assert.equal(events.includes(filename),false); await until(()=>events.includes(filename));
    const files = await collectFiles({source_dir:dir,output_dir:output,recursive:false,include_existing:true},[output],new Set());
    assert.equal(files.length,1); assert.equal(events.filter(value=>value===filename).length,1); assert.deepEqual(errors,[]);
    await observer.close(); const n=events.length; await fs.writeFile(path.join(dir,'after.mp4'),'none');
    await new Promise(resolve=>setTimeout(resolve,400)); assert.equal(events.length,n);
  } finally { await observer.close(); await fs.rm(dir,{recursive:true,force:true}); }
});
