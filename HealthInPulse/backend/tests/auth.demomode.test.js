// DEMO_MODE: as rotas sem senha (/auth/entrar, /auth/entrar-medica) só
// existem com a flag. Sem ela, o router nem as registra (404) e /login segue.
const test   = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');

const routesPath = path.join(__dirname, '../src/routes/authRoutes.js');

const routesWith = (value) => {
  // '' e não delete: algum módulo chama dotenv, que recolocaria o valor do .env
  process.env.DEMO_MODE = value ?? '';
  delete require.cache[routesPath];
  const router = require(routesPath);
  return router.stack.filter((l) => l.route).map((l) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`);
};

test('sem DEMO_MODE: rotas sem senha não existem, login com senha sim', () => {
  for (const v of [undefined, 'false', '1', 'TRUE']) {
    const r = routesWith(v);
    assert.ok(!r.some((x) => /^(get|post) \/entrar/.test(x)), `DEMO_MODE=${v}: ${r}`);
    assert.ok(r.includes('post /login'));
  }
});

test('DEMO_MODE=true: entrar e entrar-medica existem e /login continua', () => {
  const r = routesWith('true');
  for (const x of ['get /entrar', 'post /entrar', 'post /entrar-medica', 'post /login']) assert.ok(r.includes(x), x);
  process.env.DEMO_MODE = '';
});
