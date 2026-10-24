// ─── Matemática do motor de risco ──────────────────────────────────
// 1. Um caso calculado à mão (kb sintético de uma condição).
// 2. O invariante das contribuições em muitos perfis do kb real:
//      logit(prior) + Σ delta = logit(posterior)
// 3. Classificação: limiares de 3% / 1% e RR ≥ 2.

const test   = require('node:test');
const assert = require('node:assert/strict');

const { buildFromSeed } = require('../src/services/clinical/kb/buildFromSeed');
const riskEngine = require('../src/services/clinical/riskEngine');

const logit = (p) => Math.log(p / (1 - p));

// kb mínimo: uma condição oncológica, uma faixa, um fator, dois sinais
const tinyKb = () => ({
  version: 7,
  sources: [{ code: 'S', citation: 'Fonte', url: null, year: 2026, note: null }],
  conditions: [{
    code: 'CA_X', label: 'Câncer X', category: 'ONCOLOGICA', description: null, basePrior: 0.5, maxPrior: 0.95,
    alertThreshold: 0.03, watchThreshold: 0.01, sexFilter: null, minAge: 30, sortOrder: 1, active: true, sourceCode: 'S',
  }],
  priorRules: [
    { id: 'pr:CA_X:1', conditionCode: 'CA_X', kind: 'BASELINE', label: 'Base 30+', when: [{ field: 'age', op: 'gte', value: 30 }],
      effect: 'set', amount: 0.01, modifiable: false, sortOrder: 1, active: true, sourceCode: 'S' },
    { id: 'pr:CA_X:2', conditionCode: 'CA_X', kind: 'RISK_FACTOR', label: 'Fator ×2', when: [{ field: 'familyHistoryCancer', op: 'includes', value: 'mama' }],
      effect: 'multiply', amount: 2, modifiable: true, sortOrder: 2, active: true, sourceCode: 'S' },
  ],
  symptoms: [
    { code: 'a', label: 'Sinal A', kind: 'QUESTION', questionText: 'A?', help: null, type: 'boolean', options: null, binaryThreshold: null,
      cost: 1, scaleTag: null, redFlagProbe: false, showIf: null, followUps: [], panels: ['ONCOLOGIA'], sortOrder: 1, active: true },
    { code: 'b', label: 'Sinal B', kind: 'QUESTION', questionText: 'B?', help: null, type: 'boolean', options: null, binaryThreshold: null,
      cost: 1, scaleTag: null, redFlagProbe: false, showIf: null, followUps: [], panels: ['ONCOLOGIA'], sortOrder: 2, active: true },
  ],
  conditionSymptoms: [
    { id: 'cs:CA_X:a', conditionCode: 'CA_X', symptomCode: 'a', pSx: 0.5, pNoSx: 0.05, lrPos: 10, sourceCode: 'S', note: null },
    { id: 'cs:CA_X:b', conditionCode: 'CA_X', symptomCode: 'b', pSx: 0.2, pNoSx: 0.1, lrPos: 2, sourceCode: 'S', note: null },
  ],
  labRules: [],
  screeningRules: [],
});

test('caso à mão: prior 1% × 2 = 2%; "sim" para A (LR 10) e "não" para B (LR− 0,8/0,9)', () => {
  const r = riskEngine.assess(tinyKb(), {
    profile: { age: 50, sex: 'female', familyHistoryCancer: ['mama'] },
    answers: { a: true, b: 'não' },
  });
  const x = r.oncology[0];
  // odds = 0,02/0,98 × 10 × (0,8/0,9) = 0,181406...; P = odds/(1+odds)
  const odds = (0.02 / 0.98) * 10 * (0.8 / 0.9);
  assert.ok(Math.abs(x.prior - 0.02) < 1e-15);
  assert.equal(x.baselinePrior, 0.01);
  assert.ok(Math.abs(x.posterior - odds / (1 + odds)) < 1e-12);
  assert.ok(Math.abs(x.posterior - 0.153551) < 1e-6);
  assert.ok(Math.abs(x.relativeRisk - x.posterior / 0.01) < 1e-12);
  assert.equal(x.level, 'INVESTIGAR');
  assert.equal(x.riskLevel, 'HIGH');
  assert.equal(r.kbVersion, 7);

  // o fator de risco fica em `factors` (já está no prior)
  assert.deepEqual(x.factors.map(f => [f.label, f.factor, f.modifiable]), [['Fator ×2', 2, true]]);
  assert.deepEqual(r.modifiable.map(m => m.label), ['Fator ×2']);

  // contribuições: A multiplica a chance por 10, B por 0,8/0,9
  const [a, b] = x.contributions;
  assert.equal(a.code, 'a'); assert.equal(a.answer, 'sim');
  assert.ok(Math.abs(a.factor - 10) < 1e-12);
  assert.ok(Math.abs(a.delta - Math.log(10)) < 1e-15);
  assert.equal(b.answer, 'não');
  assert.ok(Math.abs(b.factor - 0.8 / 0.9) < 1e-12);
  assert.equal(a.source.code, 'S');
});

test('classificação: INVESTIGAR ≥ 3%; ATENÇÃO ≥ 1% ou RR ≥ 2; senão ROTINA', () => {
  const cond = { alertThreshold: 0.03, watchThreshold: 0.01 };
  assert.equal(riskEngine.classify(cond, 0.03, 1), 'INVESTIGAR');
  assert.equal(riskEngine.classify(cond, 0.0299, 1), 'ATENÇÃO');
  assert.equal(riskEngine.classify(cond, 0.01, 1), 'ATENÇÃO');
  assert.equal(riskEngine.classify(cond, 0.002, 2), 'ATENÇÃO');
  assert.equal(riskEngine.classify(cond, 0.002, 1.99), 'ROTINA');
  assert.equal(riskEngine.classify(cond, 0.0099, null), 'ROTINA');
});

test('exibição: acima de 20% vira "≥20%"; frequência natural e RR em texto', () => {
  assert.equal(riskEngine.pct(0.6795), '≥20%');
  assert.equal(riskEngine.pct(0.2), '≥20%');
  assert.equal(riskEngine.pct(0.0227), '2,3%');
  assert.equal(riskEngine.pct(0.00227), '0,23%');
  assert.equal(riskEngine.pct(0.00004), '<0,01%');
  assert.equal(riskEngine.naturalFrequency(0.003), '~3 em 1.000');
  assert.equal(riskEngine.naturalFrequency(0.0002), '~2 em 10.000');
  assert.equal(riskEngine.naturalFrequency(0.03), '~3 em 100');
});

// ─── Invariante no kb real ──────────────────────────────────────────
const KB = buildFromSeed();
const QUESTION_CODES = KB.symptoms.filter(s => s.kind === 'QUESTION' && s.panels.includes('ONCOLOGIA')).map(s => s.code);
const LAB_CODES = KB.symptoms.filter(s => s.kind !== 'QUESTION' && s.panels.length === 0
  && KB.conditionSymptoms.some(cs => cs.symptomCode === s.code && cs.conditionCode.startsWith('CA_'))).map(s => s.code);

// gerador determinístico (sem Math.random: o teste repete igual)
const rng = (seed) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

test('invariante: logit(prior) + Σ delta = logit(posterior), em 400 perfis aleatórios', () => {
  const rand = rng(42);
  const pick = (xs) => xs[Math.floor(rand() * xs.length)];
  let checked = 0;
  for (let i = 0; i < 400; i++) {
    const smoker = pick([true, false, undefined]);
    const profile = {
      age: 18 + Math.floor(rand() * 70), sex: pick(['male', 'female']), bmi: 18 + rand() * 20,
      smoker, packYears: smoker ? Math.floor(rand() * 60) : undefined, quitYears: smoker ? pick([0, 3, 12, 30, '']) : undefined,
      alcoholDosesWeek: Math.floor(rand() * 35), papEmDia: pick([true, false, undefined]),
      familyHistoryCancer: ['colorretal', 'mama', 'ovario', 'prostata', 'pulmao'].filter(() => rand() < 0.2),
    };
    const answers = {};
    for (const c of QUESTION_CODES) if (rand() < 0.4) answers[c] = rand() < 0.3;
    const labEvidence = {};
    for (const c of LAB_CODES) if (rand() < 0.3) labEvidence[c] = { value: rand() < 0.5 ? 1 : 0, weight: 1 };
    const r = riskEngine.assess(KB, { profile, answers, labEvidence });
    for (const o of r.oncology) {
      if (!o.eligible) { assert.equal(o.posterior, null); continue; }
      const sum = o.contributions.reduce((a, c) => a + c.delta, logit(o.prior));
      assert.ok(Math.abs(sum - logit(o.posterior)) < 1e-9, `${o.code}: ${sum} vs ${logit(o.posterior)}`);
      assert.ok(o.prior > 0 && o.prior < 1 && o.posterior > 0 && o.posterior < 1, o.code);
      assert.ok(Math.abs(o.relativeRisk - o.posterior / o.baselinePrior) < 1e-12);
      checked++;
    }
    for (const c of r.chronic) {
      const sum = c.contributions.reduce((a, x) => a + x.delta, c.logOddsPrior);
      assert.equal(sum, c.logOdds, c.code); // mesma ordem de soma do engine
    }
  }
  assert.ok(checked > 500, `poucas condições conferidas: ${checked}`);
});

test('a parte crônica do assess é o engine crônico de sempre', () => {
  const bayes = require('../src/services/clinical/bayes');
  const profile = { age: 58, sex: 'male', bmi: 31.2, smoker: true, packYears: 12 };
  const answers = { ronco_alto: 1, poliuria: 0, palpitacoes: 1 };
  const r = riskEngine.assess(KB, { profile, answers });
  const post = bayes.createEngine(KB, { categories: ['CRONICA'] }).computePosterior(answers, riskEngine.assess(KB, { profile }).profile);
  for (const c of r.chronic) assert.equal(c.posterior, post[c.code].posterior, c.code);
  assert.deepEqual(r.chronic.map(c => c.code), ['AOS', 'CV', 'DM2', 'HIPOTIR', 'SINDMET', 'DEPRESSAO', 'ARRITMIA', 'DPOC']);
});
