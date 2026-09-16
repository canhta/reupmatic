import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertCues, splitCue, mergeNext, resultIsCurrent } from '../dist-core/subtitles/cues.js';
import { previewTextRule } from '../dist-core/subtitles/text-rules.js';
import { openEditorHistory, changeEditor } from '../dist-core/projects/editor-history.js';
const cues=[{id:'a',start_ms:0,end_ms:2000,text:'Tiếng Việt'}, {id:'b',start_ms:2000,end_ms:4000,text:'English'}];
test('invalid timing rejected',()=>assert.throws(()=>assertCues([{...cues[0],end_ms:0}])));
test('duplicate cue IDs rejected',()=>assert.throws(()=>assertCues([cues[0],cues[0]])));
test('split preserves Unicode text and partitions timing',()=>{
 const out=splitCue(cues,'a',1000,5,'c');assert.equal(out[0].text+out[1].text,cues[0].text);assert.equal(out[1].start_ms,1000);assert.equal(cues.length,2);
});
test('split does not cut surrogate pair',()=>assert.throws(()=>splitCue([{...cues[0],text:'😀x'}],'a',1000,1,'c')));
test('merge preserves both cue contents',()=>{const out=mergeNext(cues,'a');assert.equal(out.length,1);assert.equal(out[0].text,'Tiếng Việt\nEnglish');assert.equal(out[0].end_ms,4000)});
test('replace scope leaves unselected content intact',()=>{const out=previewTextRule(cues,{mode:'literal',find:'i',replacement:'X',case_sensitive:true},['a']).cues;assert.equal(out[1].text,'English')});
test('history snapshots are independent',()=>{const initial=openEditorHistory({cues,sample:{start_ms:0,end_ms:1000}});const out=changeEditor(initial,{cues:[{...cues[0],text:'edited'}]});out.present.cues[0].text='again';assert.equal(out.past[0].cues[0].text,'Tiếng Việt')});
test('stale revision and superseded request rejected',()=>{assert.equal(resultIsCurrent(1,2,'a','a'),false);assert.equal(resultIsCurrent(2,2,'a','b'),false);assert.equal(resultIsCurrent(2,2,'b','b'),true)});
