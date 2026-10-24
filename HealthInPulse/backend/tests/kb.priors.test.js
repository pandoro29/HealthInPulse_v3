// ─── Priors: regras em dados × priorAdjust da v7 ────────────────────
// O engine novo (data/chronicPriorRules.js + evalWhen) tem que devolver
// o MESMO número (===, não "perto") que os priorAdjust antigos para
// qualquer perfil, inclusive com campos ausentes, null, strings e
// valores nas bordas de cada regra.

const test   = require('node:test');
const assert = require('node:assert/strict');

const { createEngine } = require('../src/services/clinical/bayes');
const { buildFromSeed } = require('../src/services/clinical/kb/buildFromSeed');
const { LEGACY_CONDITION_CODES, resolveLegacyPrior } = require('./helpers/legacyPriors');

const ABSENT = Symbol('ausente'); // campo fora do objeto (≠ undefined explícito)

const GRID = {
  age:             [ABSENT, undefined, null, 0, '', NaN, -1, 25, 40, 40.5, 41, 45, 46, 50, 51, 60, 61, 65, 66, 80, '61'],
  sex:             [ABSENT, undefined, null, '', 'male', 'female', 'other', 'M'],
  bmi:             [ABSENT, null, 0, 29.9, 30, '31'],
  smoker:          [ABSENT, undefined, null, true, false, 'true', 'false', 1, 0],
  packYears:       [ABSENT, null, 0, 9.5, 10, '12'],
  familyHistoryDm: [ABSENT, null, true, false, 'false'],
};

// Produto cartesiano da grade (≈ 270 mil perfis × 8 condições)
function* profiles() {
  const fields = Object.keys(GRID);
  const walk = function* (i, acc) {
    if (i === fields.length) { yield acc; return; }
    for (const v of GRID[fields[i]]) {
      const next = { ...acc };
      if (v !== ABSENT) next[fields[i]] = v;
      yield* walk(i + 1, next);
    }
  };
  yield* walk(0, {});
}

const engine = createEngine(buildFromSeed(), { categories: ['CRONICA'] });

test('kb: as 8 crônicas do engine são as mesmas do legado, na mesma ordem', () => {
  assert.deepEqual(engine.conditionCodes, LEGACY_CONDITION_CODES);
});

test('kb: resolvePrior === priorAdjust v7 na grade inteira de perfis', () => {
  let n = 0;
  for (const profile of profiles()) {
    for (const code of LEGACY_CONDITION_CODES) {
      const got = engine.resolvePrior(code, profile);
      const exp = resolveLegacyPrior(code, profile);
      if (!Object.is(got, exp)) {
        assert.fail(`${code} ${JSON.stringify(profile)}: esperado ${exp}, veio ${got}`);
      }
      n++;
    }
  }
  assert.ok(n > 500_000, `grade pequena demais (${n})`);
});

test('kb: resolvePrior sem perfil e com código desconhecido (contrato v7)', () => {
  for (const code of LEGACY_CONDITION_CODES) {
    assert.equal(engine.resolvePrior(code), resolveLegacyPrior(code, {}));
    assert.equal(engine.resolvePrior(code, undefined), resolveLegacyPrior(code));
  }
  assert.equal(engine.resolvePrior('NAO_EXISTE', { age: 70 }), 0.05);
});

test('kb: priorTrace refaz a mesma conta do resolvePrior', () => {
  const samples = [{}, { age: 70, sex: 'female', bmi: 32, familyHistoryDm: true },
    { age: 55, sex: 'male', smoker: true, packYears: 20 }, { age: 30, sex: 'female' }];
  for (const profile of samples) {
    for (const code of LEGACY_CONDITION_CODES) {
      const t = engine.priorTrace(code, profile);
      assert.equal(t.prior, engine.resolvePrior(code, profile));
      // cada passo começa onde o anterior parou
      let p = t.basePrior;
      for (const s of t.steps) { assert.equal(s.before, p); p = s.after; }
      assert.equal(Math.min(t.maxPrior, p), t.prior);
    }
  }
  const aos = engine.priorTrace('AOS', { age: 70, sex: 'female', bmi: 32 });
  assert.deepEqual(aos.steps.map(s => s.ruleId), ['pr:AOS:1', 'pr:AOS:3', 'pr:AOS:4']);
});
