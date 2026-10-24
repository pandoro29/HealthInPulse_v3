// ─── Cadastro: só usuário, nome e senha ──────────────────────────────
// O POST /auth/register já espalhou o corpo inteiro no Patient/Doctor
// (mass assignment): dava para se cadastrar com healthCoins: 999999. Hoje
// o controller só repassa usuário, senha e nome.
// O authService é trocado por um falso (require.cache) para ver o que o
// controller manda gravar, sem banco.

const test   = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');

const calls = [];
const servicePath = path.join(__dirname, '../src/services/authService.js');
require.cache[servicePath] = {
  id: servicePath, filename: servicePath, loaded: true,
  exports: { register: async (args) => { calls.push(args); return { ok: true }; } },
};
const { register } = require('../src/controllers/authController');

const post = async (body) => {
  calls.length = 0;
  let status = null;
  let error = null;
  const res = { status(s) { status = s; return this; }, json() { return this; } };
  await register({ body }, res, (err) => { error = err; });
  assert.equal(error, null);
  assert.equal(status, 201);
  return calls[0];
};

test('cadastro: manda só usuário, senha e nome; o resto do corpo é ignorado', async () => {
  const sent = await post({
    username: 'ana', password: '12345678', fullName: 'Ana',
    role: 'DOCTOR', cpf: '111.222.333-44', email: 'a@b.dev',
    healthCoins: 999999, id: 'x', userId: 'y', crm: 'CRM-SP 1',
  });
  assert.deepEqual(sent, { username: 'ana', password: '12345678', fullName: 'Ana' });
});

test('cadastro: usuário vai em minúsculas e sem espaço nas pontas', async () => {
  const sent = await post({ username: '  Roberto.P ', password: '12345678', fullName: ' Roberto ' });
  assert.equal(sent.username, 'roberto.p');
  assert.equal(sent.fullName, 'Roberto');
});

test('login: procura o usuário em minúsculas', async () => {
  const { login } = require('../src/controllers/authController');
  const seen = [];
  require.cache[servicePath].exports.login = async (args) => { seen.push(args); return { ok: true }; };
  await login({ body: { username: 'MARINA ', password: 'x' } }, { json() { return this; } }, (err) => { throw err; });
  assert.deepEqual(seen[0], { username: 'marina', password: 'x' });
});
