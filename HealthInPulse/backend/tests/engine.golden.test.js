// ─── Golden do motor clínico v7 ─────────────────────────────────────
// Confere o motor atual contra tests/fixtures/golden-v7.json, gravado
// pelo scripts/capture-golden.js ANTES da refatoração. Se este teste
// quebrar, a refatoração mudou o comportamento clínico.
//
// NÃO regenere o golden para fazer este teste passar.

const test   = require('node:test');
const assert = require('node:assert/strict');

const golden  = require('./fixtures/golden-v7.json');
const harness = require('./helpers/engineV7Harness');
const { resolveLegacyPrior } = require('./helpers/legacyPriors');

const TOL = golden.meta.tolerance; // 1e-12

// Igualdade profunda com tolerância numérica; o caminho no erro mostra
// exatamente qual número divergiu.
const assertClose = (actual, expected, where) => {
  if (typeof expected === 'number' && typeof actual === 'number') {
    if (Math.abs(actual - expected) > TOL) {
      assert.fail(`${where}: esperado ${expected}, veio ${actual} (Δ ${actual - expected})`);
    }
    return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${where}: esperado array, veio ${JSON.stringify(actual)}`);
    assert.equal(actual.length, expected.length, `${where}: tamanho diferente`);
    expected.forEach((e, i) => assertClose(actual[i], e, `${where}[${i}]`));
    return;
  }
  if (expected && typeof expected === 'object') {
    assert.ok(actual && typeof actual === 'object', `${where}: esperado objeto, veio ${JSON.stringify(actual)}`);
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${where}: chaves diferentes`);
    for (const k of Object.keys(expected)) assertClose(actual[k], expected[k], `${where}.${k}`);
    return;
  }
  assert.equal(actual, expected, `${where}: esperado ${JSON.stringify(expected)}, veio ${JSON.stringify(actual)}`);
};

test('golden v7: priors na grade de perfis', () => {
  golden.priors.forEach(({ profile, priors }, i) => {
    assertClose(harness.priorCase(profile), priors, `priors[${i}] ${JSON.stringify(profile)}`);
  });
});

test('golden v7: legacyPriors.js reproduz os priors gravados', () => {
  golden.priors.forEach(({ profile, priors }, i) => {
    for (const [code, expected] of Object.entries(priors)) {
      assert.equal(resolveLegacyPrior(code, profile), expected,
        `priors[${i}].${code} ${JSON.stringify(profile)}`);
    }
  });
});

test('golden v7: candidatas a pergunta por perfil (ordem e custo)', () => {
  golden.candidates.forEach(({ profile, candidates }, i) => {
    assert.deepEqual(harness.candidatesCase(profile), candidates,
      `candidates[${i}] ${JSON.stringify(profile)}`);
  });
});

test('golden v7: posteriores, classificação e próxima pergunta', () => {
  for (const c of golden.posteriors) {
    const actual = harness.posteriorCase(c.profile, c.evidence);
    assertClose(actual, { result: c.result, verdict: c.verdict, next: c.next }, `posteriors[${c.id}]`);
  }
});

test('golden v7: sessões simuladas (perguntas, parada, classifyRisk)', async (t) => {
  for (const s of golden.sessions) {
    await t.test(`sessão ${s.id} (${s.latent ?? 'sem doença'} → ${s.expected.stopReason || s.expected.redFlag?.code})`, () => {
      const actual = harness.simulateSession(s);
      // Ordem das perguntas primeiro: a mensagem fica legível
      assert.deepEqual(actual.asked, s.expected.asked, `sessions[${s.id}].asked`);
      assertClose(actual, s.expected, `sessions[${s.id}]`);
    });
  }
});

test('golden v7: red flags', () => {
  assertClose(harness.redFlagDefinitions(), golden.redFlags.definitions, 'redFlags.definitions');
  for (const c of golden.redFlags.cases) {
    assertClose(harness.redFlagCase(c), c.expected, `redFlags.cases[${c.id}] ${JSON.stringify(c.answers)}`);
  }
});
