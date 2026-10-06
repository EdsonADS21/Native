const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('content.js', 'utf8');
const helpers = source.slice(source.indexOf('    function normalizarTelefone'), source.indexOf('    function atualizarUtilidades'));
const answer = source.slice(source.indexOf('    function dispararAtendimento()'), source.indexOf('    // --- FUNÇÃO PARA AUTOMATIZAR A PAUSA'));
let clicks = 0;
const row = (text, visible = true, phoneIcon = true) => ({
  visible,
  querySelector: () => phoneIcon ? {} : null,
  querySelectorAll: () => [{ textContent: '' }, { textContent: text }]
});
let rows = [row('37999758528')];
const area = { parentElement: null, querySelectorAll: () => rows };
const button = { parentElement: area, click() { clicks++; } };
const context = vm.createContext({
  IS_NATIVE_TAB: true, configuracaoCarregada: false, blacklist: ['37999758528'],
  ultimoBotaoAtendido: null, obterBotaoAtendimento: () => button,
  elementoEstaVisivel: el => el.visible,
  tocarSomAtendimento() {}, removerModalChamada() {}, atualizarVisibilidadeControles() {}
});
vm.runInContext(helpers + answer, context);
const run = code => vm.runInContext(code, context);
assert.equal(run('dispararAtendimento()'), false, 'wait for preferences');
run('configuracaoCarregada = true');
assert.equal(run('dispararAtendimento()'), false, 'blocked number cannot be answered');
assert.equal(clicks, 0);
rows = [row('+55 (37) 99975-8528')];
assert.equal(run('dispararAtendimento()'), false, 'format and country code match');
rows = [];
assert.equal(run('dispararAtendimento()'), true, 'missing identity must not block all callers');
run('ultimoBotaoAtendido = null');
rows = [row('37999758528', false)];
assert.equal(run('dispararAtendimento()'), true, 'hidden blocked number must not block the current caller');
run('ultimoBotaoAtendido = null');
rows = [row('37999758528'), row('11987654321')];
assert.equal(run('dispararAtendimento()'), true, 'ambiguous identity is not a confirmed blacklist match');
run('ultimoBotaoAtendido = null');
rows = [row('11987654321')];
assert.equal(run('dispararAtendimento()'), true, 'allowed caller is answered');
assert.equal(run('dispararAtendimento()'), false, 'do not click twice');
run('ultimoBotaoAtendido = null; blacklist = []');
rows = [];
assert.equal(run('dispararAtendimento()'), true, 'empty list preserves existing behavior');
assert.equal(clicks, 5);
run("ultimoBotaoAtendido = null; blacklist = ['37999758528', '11987654321']");
for (const number of ['37999758528', '11987654321']) {
  rows = [row(number)];
  assert.equal(run('dispararAtendimento()'), false, 'each saved phone remains blocked');
}
rows = [row('21987654321')];
assert.equal(run('dispararAtendimento()'), true, 'a third phone remains allowed with multiple blocked phones');
assert.equal(run("normalizarTelefone('(55) 99975-8528')"), '55999758528', 'preserve DDD 55');
console.log('OK: blacklist, formatting, loading, missing/hidden/ambiguous identity, allowed caller and empty list');
