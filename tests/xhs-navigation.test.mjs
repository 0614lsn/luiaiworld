import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto, createHash } from 'node:crypto';
import { xhsOperation } from '../extensions/draft-delivery/xhs-page.js';

// Regression: XHS saves/opens via full navigation. Any subsequent DOM access in
// that injected context is invalid; verification must happen in a new injection.
test('save clicks only the exact draft button and returns without reading the destroyed document', async()=>{
  let alive=true,saves=0,publishes=0;
  const bytes=new Uint8Array([1,2,3]), digest=createHash('sha256').update(bytes).digest('hex');
  const account={textContent:'测试账号'},title={value:'测试标题'},editor={innerText:'完整正文'};
  const img={src:'blob:https://creator.xiaohongshu.com/example',complete:true,naturalWidth:1080};
  const host={getAttribute:()=> 'false'};
  const document={querySelector(selector){assert.equal(alive,true,'read after full navigation');return ({'.user-info .name-box':account,'input[placeholder="填写标题会有更多赞哦"]':title,'.tiptap[contenteditable="true"]':editor,'xhs-publish-btn':host})[selector];},querySelectorAll(){assert.equal(alive,true);return[img];}};
  const buttons=[{textContent:'发布',click(){publishes++;}},{textContent:'暂存离开',disabled:false,click(){saves++;alive=false;}}];
  const run=vm.runInNewContext(`(${xhsOperation.toString()})`,{document,location:{origin:'https://creator.xiaohongshu.com',pathname:'/publish/publish'},crypto:webcrypto,fetch:async()=>({arrayBuffer:async()=>bytes.buffer}),chrome:{dom:{openOrClosedShadowRoot:()=>({querySelectorAll:()=>buttons})}},setTimeout});
  const result=await run('save',{account:'测试账号',title:'测试标题',caption:'完整正文',cards:[{sha256:digest}]});
  assert.equal(result.clicked,true);assert.equal(saves,1);assert.equal(publishes,0);
});

test('opening a matched draft returns its saved time and leaves body verification to a new context',async()=>{
  let alive=true,opens=0;
  const element=text=>({children:[],textContent:text,getBoundingClientRect:()=>({width:100,height:20})});
  const edit={...element('编辑'),click(){opens++;alive=false;}};
  const row={querySelectorAll:()=>[edit],querySelector:()=>({textContent:'保存于今天'})};
  const title={...element('测试标题'),parentElement:row};
  const tab={...element('图文笔记(1)'),click(){},closest:()=>({classList:{contains:()=>true}})};
  const document={querySelector(selector){assert.equal(alive,true,'read after opening navigated');if(selector==='.user-info .name-box')return{textContent:'测试账号'};return null;},querySelectorAll(selector){assert.equal(alive,true);return selector==='*'?[tab]:selector==='.draft-title-text'?[title]:[];}};
  const run=vm.runInNewContext(`(${xhsOperation.toString()})`,{document,location:{origin:'https://creator.xiaohongshu.com',pathname:'/publish/publish'},setTimeout});
  const result=await run('open',{account:'测试账号',title:'测试标题',cards:[]});
  assert.equal(result.exists,true);assert.equal(result.savedAt,'保存于今天');assert.equal(opens,1);
});
