// ─── Portão da demo: caminhos abertos sem senha ─────────────────────
// Só o teste público (/teste), os arquivos do build e a API dele passam
// sem a senha da turma. Prefixo exato (não "/testes") e nada com `..`.

const test   = require('node:test');
const assert = require('node:assert/strict');

const { isOpen } = require('../src/middlewares/demoGateMiddleware');

test('abre /teste, /assets/, /favicon.svg, /api/public/, /health e /demo-access', () => {
  for (const p of ['/teste', '/teste/', '/teste/x', '/assets/index-abc.js', '/favicon.svg',
    '/api/public/quick-test', '/health', '/demo-access']) {
    assert.equal(isOpen(p), true, p);
  }
});

test('não abre parecidos nem o resto do app', () => {
  for (const p of ['/testeX', '/testes', '/TESTE', '/api/publicfoo', '/api/public', '/assetsX', '/assets',
    '/favicon.svgx', '/favicon.svg/x', '/', '/doctor/dashboard', '/api/auth/login', '/api/knowledge']) {
    assert.equal(isOpen(p), false, p);
  }
});

test('não abre caminho com `..` (cru ou codificado)', () => {
  for (const p of ['/teste/../api/auth/login', '/assets/../doctor', '/api/public/../knowledge',
    '/teste/%2e%2e/api/auth/login', '/teste/%2E%2E/x', '/assets/%2e./x', '/teste/..']) {
    assert.equal(isOpen(p), false, p);
  }
});
