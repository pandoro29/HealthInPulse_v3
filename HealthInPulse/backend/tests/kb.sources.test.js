// ─── Base oncológica: fonte em toda linha e números válidos ─────────
// Confere o contrato de data/oncology.js antes de ir para o banco:
//   - toda linha (condição, regra, likelihood, exame, rastreamento) aponta
//     para uma fonte que existe, com URL e ano;
//   - probabilidades no intervalo aberto (0, 1) e LR+ coerente;
//   - nenhum "sintoma" derivado de perfil (idade_*, imc_*, sexo_*): perfil
//     entra só no prior, senão a mesma coisa conta duas vezes;
//   - códigos únicos e referências cruzadas resolvidas;
//   - só operadores conhecidos nos `when` / `showIf`.

const test   = require('node:test');
const assert = require('node:assert/strict');

const onco = require('../src/services/clinical/data/oncology');
const { S } = require('../src/services/clinical/matrix');
const { SUPPORTED_OPS } = require('../src/services/clinical/kb/conditions');

// Sintomas compartilhados de propósito com a fase crônica (mesma pergunta)
const SHARED_WITH_CHRONIC = new Set(['perda_peso_inexplicada', 'rouquidao']);

// `includes` (lista contém valor) é novo: a tarefa 5 adiciona ao evalWhen
const ALLOWED_OPS = new Set([...SUPPORTED_OPS, 'includes']);

const PROFILE_FIELDS = new Set([
  'age', 'sex', 'bmi', 'smoker', 'packYears',
  'quitYears', 'alcoholDosesWeek', 'papEmDia', 'familyHistoryCancer',
]);

const sourceCodes   = new Set(onco.sources.map(s => s.code));
const conditionCode = new Set(onco.conditions.map(c => c.code));
const symptomByCode = new Map(onco.symptoms.map(s => [s.code, s]));

const isOpenProb = (p) => typeof p === 'number' && Number.isFinite(p) && p > 0 && p < 1;

const unique = (label, values) => {
  const seen = new Set();
  for (const v of values) {
    assert.ok(!seen.has(v), `${label} duplicado: ${v}`);
    seen.add(v);
  }
};

const checkWhen = (where, when) => {
  if (when == null) return;
  assert.ok(Array.isArray(when), `${where}: when/showIf deve ser lista`);
  for (const c of when) {
    assert.ok(ALLOWED_OPS.has(c.op), `${where}: operador "${c.op}" desconhecido`);
    assert.ok(PROFILE_FIELDS.has(c.field), `${where}: campo de perfil "${c.field}" desconhecido`);
    if (c.op === 'includes') assert.equal(c.field, 'familyHistoryCancer', `${where}: includes só em multiselect`);
  }
};

test('exporta as 7 tabelas do contrato + profileFields, todas listas', () => {
  for (const key of ['sources', 'conditions', 'priorRules', 'symptoms', 'conditionSymptoms', 'labRules', 'screeningRules', 'profileFields']) {
    assert.ok(Array.isArray(onco[key]) && onco[key].length > 0, `${key} vazio ou ausente`);
  }
  assert.deepEqual(
    onco.conditions.map(c => c.code).sort(),
    ['CA_COLORRETAL', 'CA_COLO_UTERO', 'CA_MAMA', 'CA_PROSTATA', 'CA_PULMAO'],
  );
});

test('toda fonte tem citação, ano e URL (exceto estimativa interna HIP_*)', () => {
  unique('fonte', onco.sources.map(s => s.code));
  for (const s of onco.sources) {
    assert.ok(s.citation && s.citation.length > 10, `${s.code}: sem citação`);
    assert.ok(Number.isInteger(s.year) && s.year >= 1990 && s.year <= 2026, `${s.code}: ano inválido`);
    if (!s.code.startsWith('HIP_')) assert.match(String(s.url), /^https:\/\//, `${s.code}: sem URL`);
  }
});

test('toda linha oncológica aponta para uma fonte existente', () => {
  const rows = [
    ...onco.conditions.map(r => [`condição ${r.code}`, r]),
    ...onco.priorRules.map(r => [`prior ${r.conditionCode}/${r.label}`, r]),
    ...onco.conditionSymptoms.map(r => [`likelihood ${r.conditionCode}/${r.symptomCode}`, r]),
    ...onco.labRules.map(r => [`exame ${r.code}`, r]),
    ...onco.screeningRules.map(r => [`rastreamento ${r.conditionCode}/${r.exam}`, r]),
  ];
  for (const [where, r] of rows) {
    assert.ok(sourceCodes.has(r.sourceCode), `${where}: fonte "${r.sourceCode}" não existe`);
  }
});

test('condições: categoria, prior base e limiares válidos', () => {
  for (const c of onco.conditions) {
    assert.equal(c.category, 'ONCOLOGICA', c.code);
    assert.ok(isOpenProb(c.basePrior), `${c.code}: basePrior ${c.basePrior}`);
    assert.ok(isOpenProb(c.maxPrior), `${c.code}: maxPrior`);
    assert.equal(c.alertThreshold, 0.03, `${c.code}: limiar NICE de 3%`);
    assert.equal(c.watchThreshold, 0.01, `${c.code}: limiar de atenção 1%`);
    assert.ok(Number.isInteger(c.minAge), `${c.code}: minAge`);
    assert.ok([null, 'male', 'female'].includes(c.sexFilter), `${c.code}: sexFilter`);
  }
});

test('regras de prior: set ∈ (0,1), multiply > 0, kind e when válidos', () => {
  for (const r of onco.priorRules) {
    const where = `${r.conditionCode}/${r.label}`;
    assert.ok(conditionCode.has(r.conditionCode), `${where}: condição desconhecida`);
    assert.ok(['BASELINE', 'RISK_FACTOR', 'ADJUST'].includes(r.kind), `${where}: kind`);
    assert.ok(['set', 'multiply'].includes(r.effect), `${where}: effect ${r.effect}`);
    if (r.effect === 'set') assert.ok(isOpenProb(r.amount), `${where}: prior ${r.amount}`);
    if (r.effect === 'multiply') assert.ok(r.amount > 0 && r.amount < 20, `${where}: fator ${r.amount}`);
    assert.equal(typeof r.modifiable, 'boolean', `${where}: modifiable`);
    checkWhen(where, r.when);
  }
});

test('faixas BASELINE não se sobrepõem (mesmo sexo e idade → uma faixa só)', () => {
  for (const c of onco.conditions) {
    const bands = onco.priorRules.filter(r => r.conditionCode === c.code && r.kind === 'BASELINE');
    assert.ok(bands.length > 0, `${c.code}: sem faixas`);
    for (const sex of ['male', 'female']) {
      for (let age = c.minAge; age <= 100; age++) {
        const hits = bands.filter(r => r.when.every(w =>
          (w.field === 'sex' && w.value === sex) ||
          (w.field === 'age' && (w.op === 'gte' ? age >= w.value : age < w.value))));
        if (c.sexFilter && c.sexFilter !== sex) assert.equal(hits.length, 0);
        else assert.equal(hits.length, 1, `${c.code} ${sex} ${age}: ${hits.length} faixas`);
      }
    }
  }
});

test('sintomas: códigos únicos, sem perfil, sem colidir com a fase crônica', () => {
  unique('sintoma', onco.symptoms.map(s => s.code));
  const chronic = new Set(Object.values(S));
  for (const s of onco.symptoms) {
    assert.doesNotMatch(s.code, /^(idade|imc|sexo)_/, `${s.code}: derivado de perfil não pode ser sintoma`);
    if (chronic.has(s.code)) assert.ok(SHARED_WITH_CHRONIC.has(s.code), `${s.code}: colide com matrix.js S`);
    assert.ok(['QUESTION', 'LAB', 'WEARABLE'].includes(s.kind), `${s.code}: kind`);
    if (s.kind === 'QUESTION') {
      assert.ok(s.questionText && s.questionText.endsWith('?'), `${s.code}: questionText`);
      assert.equal(s.type, 'boolean', `${s.code}: type`);
      assert.ok(s.panels.includes('ONCOLOGIA'), `${s.code}: painel ONCOLOGIA`);
    } else {
      assert.deepEqual(s.panels, [], `${s.code}: exame/pulseira não vira pergunta`);
    }
    checkWhen(`showIf ${s.code}`, s.showIf);
  }
});

test("booleanos do perfil (smoker, papEmDia) não tratam a string 'false' como sim", () => {
  const clauses = [
    ...onco.priorRules.flatMap(r => r.when ?? []),
    ...onco.screeningRules.flatMap(r => r.when ?? []),
    ...onco.symptoms.flatMap(s => s.showIf ?? []),
    ...onco.profileFields.flatMap(f => f.showIf ?? []),
  ].filter(c => c.field === 'smoker' || c.field === 'papEmDia');
  assert.ok(clauses.length > 0);
  for (const c of clauses) {
    assert.equal(c.op, 'in', `${c.field}: use "in" como o showIf de packYears da v7 (não ${c.op})`);
    const yes = c.value.includes(true);
    assert.deepEqual(c.value, yes ? [true, 'true', 1] : [false, 'false', 0], `${c.field}: valores`);
  }
});

test('teste rápido tem no máximo 8 perguntas', () => {
  const rapido = onco.symptoms.filter(s => s.panels.includes('RAPIDO'));
  assert.ok(rapido.length > 0 && rapido.length <= 8, `RAPIDO com ${rapido.length}`);
});

test('likelihoods: 0 < pSx, pNoSx < 1, pSx > pNoSx e lrPos = pSx/pNoSx', () => {
  unique('par condição×sintoma', onco.conditionSymptoms.map(r => `${r.conditionCode}:${r.symptomCode}`));
  for (const r of onco.conditionSymptoms) {
    const where = `${r.conditionCode}/${r.symptomCode}`;
    assert.ok(conditionCode.has(r.conditionCode), `${where}: condição desconhecida`);
    assert.ok(symptomByCode.has(r.symptomCode), `${where}: sintoma não declarado`);
    assert.ok(isOpenProb(r.pSx), `${where}: pSx ${r.pSx}`);
    assert.ok(isOpenProb(r.pNoSx), `${where}: pNoSx ${r.pNoSx}`);
    assert.ok(r.pSx > r.pNoSx, `${where}: achado deveria aumentar o risco`);
    assert.ok(Math.abs(r.lrPos - r.pSx / r.pNoSx) < 0.01, `${where}: lrPos ${r.lrPos}`);
    assert.ok(r.note, `${where}: sem nota de derivação`);
  }
  // Todo sintoma oncológico é usado por pelo menos uma condição (likelihood
  // ou regra direta de diretriz, sem número)
  const used = new Set([
    ...onco.conditionSymptoms.map(r => r.symptomCode),
    ...onco.directRules.map(r => r.symptomCode),
  ]);
  for (const s of onco.symptoms) assert.ok(used.has(s.code), `${s.code}: sem likelihood`);
});

test('exames: código único, operador válido e sintoma LAB', () => {
  unique('exame', onco.labRules.map(r => r.code));
  for (const r of onco.labRules) {
    assert.ok(['gte', 'gt', 'lte', 'lt', 'positive'].includes(r.operator), `${r.code}: operador`);
    if (r.operator !== 'positive') assert.equal(typeof r.threshold, 'number', `${r.code}: limiar`);
    assert.equal(symptomByCode.get(r.symptomCode)?.kind, 'LAB', `${r.code}: sintoma ${r.symptomCode} não é LAB`);
    assert.ok(r.aliases.length > 0, `${r.code}: sem aliases`);
    for (const a of r.aliases) {
      assert.equal(a, a.toLowerCase(), `${r.code}: alias "${a}" com maiúscula`);
      assert.equal(a, a.normalize('NFD').replace(/[̀-ͯ]/g, ''), `${r.code}: alias "${a}" com acento`);
    }
  }
});

test('rastreamento: condição, tipo e when válidos', () => {
  for (const r of onco.screeningRules) {
    const where = `${r.conditionCode}/${r.exam}`;
    assert.ok(conditionCode.has(r.conditionCode), `${where}: condição`);
    assert.ok(['POPULACIONAL', 'ALTO_RISCO', 'DECISAO_COMPARTILHADA'].includes(r.kind), `${where}: kind`);
    assert.ok(r.recommendation && r.recommendation.length > 20, `${where}: recomendação`);
    checkWhen(where, r.when);
  }
});

test('campos novos do perfil estão declarados', () => {
  const ids = onco.profileFields.map(f => f.id);
  for (const id of ['familyHistoryCancer', 'quitYears', 'alcoholDosesWeek', 'papEmDia']) {
    assert.ok(ids.includes(id), `profileFields sem ${id}`);
  }
  const fh = onco.profileFields.find(f => f.id === 'familyHistoryCancer');
  assert.equal(fh.type, 'multiselect');
  assert.deepEqual(fh.options.map(o => o.value), ['colorretal', 'mama', 'ovario', 'prostata', 'pulmao']);
  for (const f of onco.profileFields) checkWhen(`profileField ${f.id}`, f.showIf);
});
