const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('content.js', 'utf8');
const start = source.indexOf('    function lerNumerosBlacklist');
const end = source.indexOf('    function obterTelefoneChamada');
let save;
let stored;
const editor = { value: '', addEventListener() {} };
const status = {};
const context = vm.createContext({
  blacklist: [], blacklistEmEdicao: false,
  shadow: { getElementById(id) {
    if (id === 'blacklist-numbers') return editor;
    if (id === 'blacklist-status') return status;
    return { addEventListener(type, fn) { save = fn; } };
  } },
  atualizarListaBlacklist() {},
  chrome: { storage: { local: { async get() { return stored || {}; }, async set(value) { stored = JSON.parse(JSON.stringify(value)); } } } }
});
vm.runInContext(source.slice(start, end), context);
vm.runInContext(source.slice(source.indexOf('        const blacklistEditor ='), source.indexOf("        shadow.getElementById('silent-row').addEventListener")), context);
(async () => {
  editor.value = '37999758528';
  await save();
  editor.value = '11987654321';
  await save();
  assert.deepEqual(stored.blacklist, ['37999758528', '11987654321'], 'adding a second phone preserves the first');
  for (const separator of ['\n', '\r\n', ',', ';', ' ']) {
    editor.value = `37999758528${separator}11987654321`;
    await save();
    assert.deepEqual(stored.blacklist, ['37999758528', '11987654321']);
    assert.equal(editor.value, '');
  }
  editor.value = '+55 (37) 99975-8528\n(11) 98765-4321\n37999758528';
  await save();
  assert.deepEqual(stored.blacklist, ['37999758528', '11987654321']);
  editor.value = '123';
  await save();
  assert.deepEqual(stored.blacklist, ['37999758528', '11987654321'], 'invalid input preserves saved list');
  assert.match(status.textContent, /Confira/);
  editor.value = '';
  await save();
  assert.deepEqual(stored.blacklist, ['37999758528', '11987654321'], 'empty input does not erase saved numbers');
  console.log('OK: sequential additions, multiple numbers, separators, formatting, duplicates and preservation on invalid/empty input');
})().catch(error => { console.error(error); process.exitCode = 1; });
