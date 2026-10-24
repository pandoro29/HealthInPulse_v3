// ─── kb normalizado + engine ────────────────────────────────────────
// Confere o formato do kb (contrato com o banco, tarefa 3), o evalWhen,
// as candidatas por painel e o engine criado a partir do kb.

const test   = require('node:test');
const assert = require('node:assert/strict');

const { evalWhen, validateWhen, SUPPORTED_OPS } = require('../src/services/clinical/kb/conditions');
const { buildFromSeed, getSeedKb } = require('../src/services/clinical/kb/buildFromSeed');
const bayes     = require('../src/services/clinical/bayes');
const questions = require('../src/services/clinical/questions');

// ─── evalWhen ───────────────────────────────────────────────────────
test('evalWhen: lista vazia/null vale sempre; lista é um E', () => {
  assert.equal(evalWhen(null, {}), true);
  assert.equal(evalWhen(undefined, {}), true);
  assert.equal(evalWhen([], {}), true);
  const w = [{ field: 'age', op: 'gt', value: 50 }, { field: 'sex', op: 'eq', value: 'female' }];
  assert.equal(evalWhen(w, { age: 51, sex: 'female' }), true);
  assert.equal(evalWhen(w, { age: 51, sex: 'male' }), false);
  assert.equal(evalWhen(w, { age: 50, sex: 'female' }), false);
});

test('evalWhen: comparações devolvem false com null/undefined (como `age && age > 50`)', () => {
  for (const op of ['gt', 'gte', 'lt', 'lte']) {
    assert.equal(evalWhen([{ field: 'x', op, value: -5 }], { x: null }), false, op);
    assert.equal(evalWhen([{ field: 'x', op, value: -5 }], {}), false, op);
  }
  assert.equal(evalWhen([{ field: 'x', op: 'gte', value: 10 }], { x: 10 }), true);
  assert.equal(evalWhen([{ field: 'x', op: 'lt', value: 10 }], { x: 9 }), true);
  assert.equal(evalWhen([{ field: 'x', op: 'lte', value: 10 }], { x: 10 }), true);
});

test('evalWhen: neq sem guarda de null; truthy/falsy por Boolean; in estrito', () => {
  const nf = [{ field: 'sex', op: 'neq', value: 'female' }];
  assert.equal(evalWhen(nf, {}), true);
  assert.equal(evalWhen(nf, { sex: null }), true);
  assert.equal(evalWhen(nf, { sex: 'female' }), false);
  const t = [{ field: 'smoker', op: 'truthy' }];
  assert.equal(evalWhen(t, { smoker: 'false' }), true);   // string não vazia é verdadeira, como no v7
  assert.equal(evalWhen(t, { smoker: 0 }), false);
  assert.equal(evalWhen([{ field: 'smoker', op: 'falsy' }], {}), true);
  const inn = [{ field: 'smoker', op: 'in', value: [true, 'true', 1] }];
  assert.equal(evalWhen(inn, { smoker: 1 }), true);
  assert.equal(evalWhen(inn, { smoker: '1' }), false);
});

test('evalWhen: operador desconhecido é erro; validateWhen aponta', () => {
  assert.throws(() => evalWhen([{ field: 'age', op: 'maior', value: 1 }], { age: 2 }), /Operador desconhecido/);
  assert.throws(() => evalWhen({ field: 'age' }, {}), /lista/);
  assert.deepEqual(validateWhen([{ field: 'age', op: 'gt', value: 1 }]), []);
  assert.equal(validateWhen([{ field: '', op: 'xx' }]).length, 2);
  assert.deepEqual([...SUPPORTED_OPS].sort(), ['eq', 'falsy', 'gt', 'gte', 'in', 'includes', 'lt', 'lte', 'neq', 'truthy']);
});

test('evalWhen: includes = o campo (lista do multiselect) contém o valor', () => {
  const w = [{ field: 'familyHistoryCancer', op: 'includes', value: 'mama' }];
  assert.equal(evalWhen(w, { familyHistoryCancer: ['ovario', 'mama'] }), true);
  assert.equal(evalWhen(w, { familyHistoryCancer: ['ovario'] }), false);
  assert.equal(evalWhen(w, { familyHistoryCancer: [] }), false);
  assert.equal(evalWhen(w, {}), false);                                // ausente
  assert.equal(evalWhen(w, { familyHistoryCancer: 'mama' }), false);   // não é lista
  assert.deepEqual(validateWhen(w), []);
});

// ─── Formato do kb ──────────────────────────────────────────────────
const FIELDS = {
  sources:           ['code', 'citation', 'url', 'year', 'note'],
  conditions:        ['code', 'label', 'category', 'description', 'basePrior', 'maxPrior', 'alertThreshold',
                      'watchThreshold', 'sexFilter', 'minAge', 'sortOrder', 'active', 'sourceCode'],
  priorRules:        ['id', 'conditionCode', 'kind', 'label', 'when', 'effect', 'amount', 'modifiable',
                      'sortOrder', 'active', 'sourceCode'],
  symptoms:          ['code', 'label', 'kind', 'questionText', 'help', 'type', 'options', 'binaryThreshold', 'cost',
                      'scaleTag', 'redFlagProbe', 'showIf', 'followUps', 'panels', 'sortOrder', 'active'],
  conditionSymptoms: ['id', 'conditionCode', 'symptomCode', 'pSx', 'pNoSx', 'lrPos', 'sourceCode', 'note'],
  labRules:          ['id', 'code', 'label', 'aliases', 'operator', 'threshold', 'unit', 'sexFilter', 'minAge', 'maxAge',
                      'symptomCode', 'weight', 'emitNegative', 'maxAgeDays', 'sortOrder', 'active', 'sourceCode'],
  screeningRules:    ['id', 'conditionCode', 'exam', 'kind', 'sexFilter', 'minAge', 'maxAge', 'when', 'intervalMonths',
                      'recommendation', 'priority', 'active', 'sourceCode'],
};

test('kb: objeto simples, serializável, com os campos do modelo de dados', () => {
  const kb = buildFromSeed();
  assert.deepEqual(JSON.parse(JSON.stringify(kb)), kb, 'kb não sobrevive a JSON (undefined, função, ...)');
  assert.deepEqual(Object.keys(kb).sort(), ['version', ...Object.keys(FIELDS)].sort());
  for (const [entity, fields] of Object.entries(FIELDS)) {
    assert.ok(Array.isArray(kb[entity]), entity);
    for (const row of kb[entity]) assert.deepEqual(Object.keys(row).sort(), [...fields].sort(), `${entity} ${row.code ?? row.id}`);
  }
  assert.equal(kb.conditions.length, 13);
  assert.equal(kb.conditions.filter(c => c.category === 'CRONICA').length, 8);
  assert.equal(kb.conditions.filter(c => c.category === 'ONCOLOGICA').length, 5);
  assert.ok(kb.labRules.length > 0 && kb.screeningRules.length > 0);
  // só crônicas (como a v7): sem exames nem rastreamento
  const v7 = buildFromSeed({ includeOncology: false });
  assert.equal(v7.conditions.length, 8);
  assert.ok(v7.conditions.every(c => c.category === 'CRONICA'));
  assert.equal(v7.labRules.length, 0);
  assert.equal(v7.screeningRules.length, 0);
});

test('kb: sintoma repetido entre lotes só soma painéis se o tipo for o mesmo', () => {
  const kb = buildFromSeed();
  // compartilhados de propósito: a definição crônica fica, os painéis somam
  const peso = kb.symptoms.find(s => s.code === 'perda_peso_inexplicada');
  assert.deepEqual(peso.panels, ['CRONICA', 'ONCOLOGIA', 'RAPIDO']);
  assert.equal(peso.questionText, questions.getQuestionForSymptom('perda_peso_inexplicada').text);
  assert.deepEqual(kb.symptoms.find(s => s.code === 'rouquidao').panels, ['CRONICA', 'ONCOLOGIA']);
  // tipo diferente (pergunta × exame) seria esconder a pergunta: erro
  const onco = require('../src/services/clinical/data/oncology');
  const original = onco.symptoms;
  try {
    onco.symptoms = [...original, { ...original[0], code: 'bradicardia', kind: 'QUESTION' }];
    assert.throws(() => buildFromSeed(), /tipos diferentes/);
  } finally {
    onco.symptoms = original;
  }
});

test('kb: ids únicos, chaves estrangeiras válidas e fonte em todo número', () => {
  const kb = buildFromSeed();
  const uniq = (xs, what) => assert.equal(new Set(xs).size, xs.length, `${what} repetido`);
  uniq(kb.conditions.map(c => c.code), 'Condition.code');
  uniq(kb.symptoms.map(s => s.code), 'Symptom.code');
  uniq(kb.priorRules.map(r => r.id), 'PriorRule.id');
  uniq(kb.conditionSymptoms.map(cs => cs.id), 'ConditionSymptom.id');
  uniq(kb.conditionSymptoms.map(cs => `${cs.conditionCode}|${cs.symptomCode}`), 'ConditionSymptom (cond, sx)');

  const conds = new Set(kb.conditions.map(c => c.code));
  const sxs   = new Set(kb.symptoms.map(s => s.code));
  const srcs  = new Set(kb.sources.map(s => s.code));
  for (const r of kb.priorRules) {
    assert.ok(conds.has(r.conditionCode), r.id);
    assert.ok(srcs.has(r.sourceCode), r.id);
    assert.deepEqual(validateWhen(r.when), [], r.id);
    assert.ok(['set', 'add', 'multiply'].includes(r.effect), r.id);
  }
  for (const cs of kb.conditionSymptoms) {
    assert.ok(conds.has(cs.conditionCode) && sxs.has(cs.symptomCode), cs.id);
    assert.ok(srcs.has(cs.sourceCode), cs.id);
  }
  for (const c of kb.conditions) assert.ok(srcs.has(c.sourceCode), c.code);
  for (const s of kb.symptoms) {
    assert.deepEqual(validateWhen(s.showIf), [], s.code);
    assert.ok(s.label && s.label !== s.code, `sintoma sem rótulo: ${s.code}`);
  }
});

// Perfil (idade, IMC, sexo) entra só no prior. Os achados idade_*/imc_*/
// sexo_masculino abaixo são da matriz v7 (o golden os usa como evidência)
// e NADA os deriva do perfil: ficam sem painel, só nas crônicas. Lista
// fechada: qualquer achado de perfil novo (ou ligado a um câncer) falha.
const LEGACY_V7_PROFILE_FINDINGS = new Set([
  'imc_obesidade', 'imc_sobrepeso', 'idade_50_mais', 'idade_55h_65m', 'idade_65_mais', 'sexo_masculino',
]);

test('kb: nenhum sintoma derivado de perfil (exceto os achados legados da v7, só crônicos)', () => {
  const kb = buildFromSeed();
  const category = new Map(kb.conditions.map(c => [c.code, c.category]));
  const PROFILE_LIKE = /^(idade|imc|sexo|age|bmi|sex)_/;
  for (const s of kb.symptoms.filter(x => PROFILE_LIKE.test(x.code))) {
    assert.ok(LEGACY_V7_PROFILE_FINDINGS.has(s.code), `${s.code}: perfil não pode virar sintoma (vai no PriorRule)`);
    assert.deepEqual(s.panels, [], `${s.code}: achado legado não vira pergunta`);
  }
  for (const cs of kb.conditionSymptoms) {
    if (category.get(cs.conditionCode) !== 'ONCOLOGICA') continue;
    assert.doesNotMatch(cs.symptomCode, PROFILE_LIKE, `${cs.id}: câncer com likelihood de perfil`);
  }
});

test('kb: sortOrder dos sintomas segue SYMPTOM_QUESTIONS (desempate do seletor)', () => {
  const kb = buildFromSeed();
  const asked = kb.symptoms.filter(s => s.kind === 'QUESTION' && s.panels.includes('CRONICA')).sort((a, b) => a.sortOrder - b.sortOrder);
  assert.deepEqual(asked.map(s => s.code), questions.SYMPTOM_QUESTIONS.map(q => q.symptom));
  // sintomas sem pergunta não entram em painel nenhum
  for (const s of kb.symptoms.filter(x => x.kind !== 'QUESTION')) assert.deepEqual(s.panels, [], s.code);
});

test('kb: buildFromSeed devolve cópia nova; getSeedKb é congelado', () => {
  const a = buildFromSeed();
  a.symptoms[0].followUps.push({ id: 'x' });
  a.priorRules[0].when.push({ field: 'x', op: 'truthy' });
  const b = buildFromSeed();
  assert.notDeepEqual(a, b);
  assert.deepEqual(b, getSeedKb());
  assert.ok(Object.isFrozen(getSeedKb().conditions[0]));
});

// ─── Candidatas ─────────────────────────────────────────────────────
test('candidatesFor: filtra por painel, showIf em JSON e red flag', () => {
  const kb = buildFromSeed({ includeOncology: false });
  const male   = questions.candidatesFor(kb, { sex: 'male' }, 'CRONICA').map(c => c.symptom);
  const female = questions.candidatesFor(kb, { sex: 'female' }, 'CRONICA').map(c => c.symptom);
  assert.ok(!male.includes('irregularidade_menstrual'));
  assert.ok(female.includes('irregularidade_menstrual'));
  assert.ok(!female.includes('deficit_neurologico_subito'));
  assert.deepEqual(questions.candidatesFor(kb, {}, 'ONCOLOGIA'), []);
  // o wrapper v7 é o painel crônico do kb do JS (com ou sem oncologia, igual)
  assert.deepEqual(questions.candidatesForProfile({ sex: 'female' }), questions.candidatesFor(kb, { sex: 'female' }, 'CRONICA'));
  assert.deepEqual(questions.candidatesFor(buildFromSeed(), { sex: 'female', age: 50 }, 'CRONICA'),
    questions.candidatesFor(kb, { sex: 'female', age: 50 }, 'CRONICA'));

  // mesmo payload de pergunta que o serializeQuestion da v7
  const byId = new Map(questions.SYMPTOM_QUESTIONS.map(q => [q.id, q]));
  for (const c of questions.candidatesFor(kb, { sex: 'female' }, 'CRONICA')) {
    const old = questions.serializeQuestion(byId.get(c.symptom));
    assert.deepEqual(JSON.parse(JSON.stringify(c.question)),
      JSON.parse(JSON.stringify({ ...old, followUps: old.followUps ?? [] })), c.symptom);
  }

  // painel novo num sintoma passa a valer sem mudar código
  kb.symptoms.find(s => s.code === 'ronco_alto').panels.push('RAPIDO');
  assert.deepEqual(questions.candidatesFor(kb, {}, 'RAPIDO').map(c => c.symptom), ['ronco_alto']);
});

test('demographicSchema: showIf em JSON e showIfField para o frontend', () => {
  const py = questions.demographicSchema().find(q => q.id === 'packYears');
  assert.deepEqual(py.showIf, [{ field: 'smoker', op: 'in', value: [true, 'true', 1] }]);
  assert.equal(py.showIfField, 'smoker');
  assert.equal(questions.demographicSchema().find(q => q.id === 'age').showIfField, null);
});

// ─── Engine ─────────────────────────────────────────────────────────
const EVIDENCE = { ronco_alto: 1, apneia_observada: { value: 1, weight: 3 }, poliuria: 0, palpitacoes: 1, xyz: 1 };
const PROFILE  = { age: 58, sex: 'male', bmi: 31.2, smoker: true, packYears: 12 };

test('engine: wrappers antigos == engine criado do kb do JS', () => {
  const engine = bayes.createEngine(buildFromSeed(), { categories: ['CRONICA'] });
  assert.deepEqual(bayes.computePosterior(EVIDENCE, PROFILE), engine.computePosterior(EVIDENCE, PROFILE));
  const cands = questions.candidatesForProfile(PROFILE);
  assert.deepEqual(bayes.selectNextSymptom(cands, EVIDENCE, PROFILE, { targetThreshold: 0.5 }),
    engine.selectNextSymptom(cands, EVIDENCE, PROFILE, { targetThreshold: 0.5 }));
});

test('engine: explain usa o mesmo laço do posterior', () => {
  const engine = bayes.createEngine(buildFromSeed(), { categories: ['CRONICA'] });
  const post = engine.computePosterior(EVIDENCE, PROFILE);
  const ex   = engine.explain(EVIDENCE, PROFILE);
  assert.deepEqual(Object.keys(ex), Object.keys(post));
  for (const [code, e] of Object.entries(ex)) {
    assert.equal(e.posterior, post[code].posterior, code);
    assert.equal(e.prior, post[code].prior, code);
    assert.equal(e.priorTrace.prior, e.prior, code);
    const sum = e.contributions.reduce((a, c) => a + c.deltaLogOdds, e.logOddsPrior);
    assert.equal(sum, e.logOdds, code); // mesma ordem de soma, mesmo bit
  }
  assert.deepEqual(ex.AOS.contributions.map(c => c.symptomCode), ['ronco_alto', 'apneia_observada']);
  assert.equal(ex.AOS.contributions[1].weight, 3);
});

test('engine: editar o kb muda o resultado (sem mexer no código)', () => {
  const kb = buildFromSeed();
  const before = bayes.createEngine(kb, { categories: ['CRONICA'] }).resolvePrior('DM2', { age: 30 });
  kb.conditions.find(c => c.code === 'DM2').basePrior = 0.2;
  kb.priorRules.push({ id: 'pr:DM2:x', conditionCode: 'DM2', kind: 'RISK_FACTOR', label: 'teste',
    when: [{ field: 'sedentario', op: 'truthy' }], effect: 'multiply', amount: 1.5,
    modifiable: true, sortOrder: 99, active: true, sourceCode: null });
  const engine = bayes.createEngine(kb, { categories: ['CRONICA'] });
  assert.equal(before, 0.13);
  assert.equal(engine.resolvePrior('DM2', { age: 30 }), 0.2);
  assert.equal(engine.resolvePrior('DM2', { age: 30, sedentario: true }), 0.2 * 1.5);
  // regra inativa não conta; teto maxPrior vale para multiply também
  kb.priorRules.at(-1).active = false;
  assert.equal(bayes.createEngine(kb).resolvePrior('DM2', { age: 30, sedentario: true }), 0.2);
  kb.priorRules.at(-1).active = true;
  kb.priorRules.at(-1).amount = 100;
  const capped = bayes.createEngine(kb).priorTrace('DM2', { sedentario: true });
  assert.equal(capped.prior, 0.95);
  assert.equal(capped.capped, true);
});

test('engine: categories filtra as condições', () => {
  const kb = buildFromSeed({ includeOncology: false });
  kb.conditions.push({ ...kb.conditions[0], code: 'CA_TESTE', category: 'ONCOLOGICA', sortOrder: 99, basePrior: 0.004 });
  kb.conditionSymptoms.push({ ...kb.conditionSymptoms[0], id: 'cs:CA_TESTE:ronco_alto', conditionCode: 'CA_TESTE' });
  const chronic = bayes.createEngine(kb, { categories: ['CRONICA'] });
  const onco    = bayes.createEngine(kb, { categories: ['ONCOLOGICA'] });
  const all     = bayes.createEngine(kb);
  assert.equal(chronic.conditionCodes.length, 8);
  assert.deepEqual(onco.conditionCodes, ['CA_TESTE']);
  assert.equal(all.conditionCodes.length, 9);
  // a condição oncológica não altera o posterior crônico
  assert.deepEqual(chronic.computePosterior(EVIDENCE, PROFILE), bayes.computePosterior(EVIDENCE, PROFILE));
  assert.equal(onco.computePosterior({}, {}).CA_TESTE.prior, 0.004);
});
