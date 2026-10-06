const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); } });
const flush = async () => { for(let i=0;i<30;i++) await Promise.resolve(); };

async function testHold() {
  const listeners = {}, messages = [], intervals = new Map();
  let next = 0;
  const window = { location: { hostname: 'example.com' }, addEventListener(k, fn) { (listeners[k] ||= []).push(fn); } };
  const document = { hidden: false, getElementById: () => null, addEventListener(k, fn) { (listeners[k] ||= []).push(fn); } };
  const chrome = { storage: { local: { get: async () => ({ teclaSegurar: 'F4' }) }, onChanged: event() }, runtime: { onMessage: event(), sendMessage: async m => { messages.push(m); } } };
  vm.runInNewContext(fs.readFileSync('content.js','utf8'), { window, document, chrome, console, setInterval(fn) { intervals.set(++next,fn); return next; }, clearInterval(id) { intervals.delete(id); } });
  await flush();
  const fire = (type, key, modifiers = {}) => (listeners[type] || []).forEach(fn => fn({ key, ...modifiers, preventDefault(){}, stopPropagation(){}, stopImmediatePropagation(){} }));
  fire('keydown','Insert', {altKey:true}); fire('keydown','Insert', {altKey:true});
  assert.equal(intervals.size,1, 'key repeat must not create extra timers');
  assert.equal(messages.length,1);
  [...intervals.values()][0]();
  assert.equal(messages.length,2, 'holding continues requesting answers');
  fire('keyup','Insert', {altKey:true}); assert.equal(intervals.size,0, 'release stops answering');
  fire('keydown','Insert', {altKey:true}); fire('blur'); assert.equal(intervals.size,0, 'focus loss stops answering');
  fire('keydown','Insert', {altKey:true}); document.hidden=true; fire('visibilitychange'); assert.equal(intervals.size,0);
  fire('keydown','Insert'); assert.equal(intervals.size,0, 'Insert alone does not activate');
  fire('keydown','Insert', {altKey:true}); fire('keyup','Alt'); assert.equal(intervals.size,0, 'releasing Alt stops answering');
  chrome.storage.onChanged.listeners[0]({ teclaSegurar: { newValue: 'Ctrl+Insert' } },'local');
  fire('keydown','Insert', {ctrlKey:true}); assert.equal(intervals.size,1); fire('keyup','Control'); assert.equal(intervals.size,0);
}

async function testSilent() {
  const local = {}, session = {};
  const tabs = [ {id:1,url:'https://app.native-infinity.com.br/',mutedInfo:{muted:false}}, {id:2,url:'https://app.native-infinity.com.br/',mutedInfo:{muted:true}}, {id:3,url:'https://example.com/',mutedInfo:{muted:false}} ];
  const area = data => ({ get: async () => structuredClone(data), set: async values => Object.assign(data,structuredClone(values)) });
  const chrome = {
    storage: {local:area(local),session:area(session),onChanged:event()},
    tabs: {query: async () => tabs,update:async (id,v) => {tabs.find(t=>t.id===id).mutedInfo.muted=v.muted;},onRemoved:event(),onUpdated:event(),sendMessage:async()=>({})},
    runtime:{onMessage:event()},commands:{onCommand:event()},action:{onClicked:event()}
  };
  vm.runInNewContext(fs.readFileSync('background.js','utf8'), {chrome,console}); await flush();
  const toggle = async () => { await new Promise(resolve => chrome.runtime.onMessage.listeners[0]({action:'alternar_modo_silencioso'},{},resolve)); };
  await toggle(); assert.equal(local.modoSilencioso,true); assert.deepEqual(tabs.map(t=>t.mutedInfo.muted),[true,true,false]);
  await toggle(); assert.equal(local.modoSilencioso,false); assert.deepEqual(tabs.map(t=>t.mutedInfo.muted),[false,true,false]);
  await toggle();
  tabs.push({id:4,url:'https://app.native-infinity.com.br/',mutedInfo:{muted:false}});
  chrome.tabs.onUpdated.listeners[0](4,{status:'complete'}); await flush();
  assert.equal(tabs[3].mutedInfo.muted,true,'new Native tabs are silenced');
}
(async () => { await testHold(); await testSilent(); console.log('OK: hold/release, repeat, blur, visibility, configurable key, silent toggle, audio restoration and new tabs'); })().catch(e => {console.error(e);process.exitCode=1;});
