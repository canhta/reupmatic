// SOURCE-ONLY until dependencies are installed. Real Electron + Chokidar + media;
// only the user's native folder choices are controlled by the test.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
import { pythonExecutable } from '../../scripts/python.mjs';
import { chooseLocale } from './ui-actions.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
for (const locale of ['en', 'vi']) {
  test(`Electron folder intake, real queued render and desktop UI (${locale})`, { timeout: 120000 }, async () => {
    const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'reupmatic-folder-ui-')));
    const source = path.join(dir,'nguồn'), output = path.join(source,'bản xuất'), userData = path.join(dir,'app-data');
    await fs.mkdir(output,{recursive:true}); await fs.mkdir(userData);
    const prepared = path.join(dir,'fixture.mp4');
    execFileSync(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=160x90:rate=12:duration=1','-c:v','libx264','-threads','1','-n',prepared]);
    let application;
    try {
      application = await electron.launch({cwd:root,args:[...(process.getuid?.()===0?['--no-sandbox']:[]),'tests/e2e/launch.mjs'],env:{...process.env,REUPMATIC_TEST_USER_DATA:userData,REUPMATIC_DEV_AUTOMATION:'1',PYTHON:pythonExecutable(root)}});
      await application.evaluate(({dialog},choices)=>{
        const pending=[[choices.source],[choices.output]];
        dialog.showOpenDialog=async()=>{const files=pending.shift();if(!files)throw new Error('Unexpected picker');return{canceled:false,filePaths:files};};
        dialog.showMessageBox=async()=>({response:1,checkboxChecked:false});
      },{source,output});
      const page=await application.firstWindow();
      await chooseLocale(page, locale);
      const labels=locale==='vi'?{nav:'Tự động hóa',source:'Chọn folder nguồn',output:'Chọn folder đích',scope:'File mới hoặc thay đổi sau lần kiểm kê đầu',save:'Lưu quy tắc',watch:'Bắt đầu theo dõi',pause:'Dừng theo dõi',batch:/Xử lý lô & tác vụ/,run:'Chạy hàng đợi'}:{nav:'Automation',source:'Choose source folder',output:'Choose destination folder',scope:'New or changed files after the first inventory',save:'Save rule',watch:'Start monitoring',pause:'Pause monitoring',batch:/Batch & jobs/,run:'Start queue'};
      await page.getByRole('button',{name:labels.nav,exact:true}).click();
      await page.getByRole('button',{name:labels.source,exact:true}).click();
      await page.getByRole('button',{name:labels.output,exact:true}).click();
      await page.getByRole('radio', { name: labels.scope, exact: true }).check();
      await page.getByRole('button',{name:labels.save,exact:true}).click();
      await page.getByRole('button',{name:labels.watch,exact:true}).click();
      await page.waitForFunction(async()=>{const value=await window.reupmatic.folderSnapshot();return value.ok&&value.data.rules[0]?.state==='watching';});
      const temporary=path.join(source,'video.mp4.partial');await fs.copyFile(prepared,temporary);
      await fs.rename(temporary,path.join(source,'video.mp4'));
      await page.waitForFunction(async()=>{const value=await window.reupmatic.batchSnapshot();return value.ok&&value.data.items.length===1;},null,{timeout:30000});
      await page.getByRole('button',{name:labels.batch}).click();
      await page.getByRole('button',{name:labels.run,exact:true}).click();
      await page.locator('.batch-workspace [data-state="complete"]').waitFor({timeout:60000});
      assert.equal((await fs.readdir(output)).length,1);
      await page.getByRole('button',{name:labels.pause,exact:true}).click();
      await page.emulateMedia({reducedMotion:'reduce'});
      const screenshots=path.join(root,'.test-artifacts');await fs.mkdir(screenshots,{recursive:true});
      await page.screenshot({path:path.join(screenshots,`folder-${locale}.png`),fullPage:true});
      const snapshot=await page.evaluate(()=>window.reupmatic.folderSnapshot());
      assert.equal(snapshot.ok,true);assert.equal(snapshot.data.rules[0].state,'paused');
    }finally{if(application)await application.close();await fs.rm(dir,{recursive:true,force:true});}
  });
}
