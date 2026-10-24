// ─── Teste rápido público (quickTestService) ────────────────────────
// Sem estado: a mesma entrada dá sempre a mesma saída. Etapas PROFILE →
// QUESTION… → RESULT, BLOCKED para menor de 18. Perguntas: primeiro as
// crônicas fixas (CHRONIC_QUICK), depois as do painel RAPIDO.

const test   = require('node:test');
const assert = require('node:assert/strict');

const { buildFromSeed } = require('../src/services/clinical/kb/buildFromSeed');
const quickTest = require('../src/services/quickTestService');

const kb = buildFromSeed();
const patientView = require('../src/services/patientView');

const TOTAL = quickTest.CHRONIC_QUICK.length + quickTest.MAX_QUESTIONS;
// Todas as crônicas respondidas com "não": pula direto para o painel RAPIDO
const CHRONIC_NO = Object.fromEntries(quickTest.CHRONIC_QUICK.map(c => [c.code, false]));

// Responde a todas as perguntas com `answerFor(code)` até o RESULT
const runAll = (profile, answerFor = () => false) => {
  const answers = {};
  const asked = [];
  const onco = [];
  for (let i = 0; i < 30; i++) {
    const r = quickTest.run(kb, { profile, answers });
    if (r.stage !== 'QUESTION') return { result: r, asked: onco, answers };
    assert.ok(!asked.includes(r.question.symptom), `pergunta repetida: ${r.question.symptom}`);
    assert.equal(r.progress.asked, asked.length);
    assert.equal(r.progress.max, TOTAL);
    assert.ok(r.question.station, 'toda pergunta tem estação');
    if (r.question.station === 'SINAIS') {
      assert.match(r.reason, /Perguntamos porque/);
      onco.push(r.question.symptom);
    } else {
      assert.ok(asked.length < quickTest.CHRONIC_QUICK.length, 'crônicas vêm antes');
    }
    asked.push(r.question.symptom);
    answers[r.question.symptom] = answerFor(r.question.symptom);
  }
  throw new Error('não terminou em 30 chamadas');
};

test('sem perfil: PROFILE com o formulário dos campos de câncer', () => {
  const r = quickTest.run(kb, {});
  assert.equal(r.stage, 'PROFILE');
  assert.deepEqual(r.missing, ['age', 'sex']);
  const ids = r.schema.map(q => q.id);
  assert.ok(ids.includes('familyHistoryCancer') && ids.includes('papEmDia'));
  assert.ok(!ids.includes('familyHistoryDm'), 'campo só da triagem crônica');
  assert.deepEqual(r.schema.filter(q => q.required).map(q => q.id), ['age', 'sex']);
  assert.equal(quickTest.run(kb, { profile: { age: 40 } }).stage, 'PROFILE');
});

test('menor de 18: BLOCKED, sem pergunta nem resultado', () => {
  const r = quickTest.run(kb, { profile: { age: 17, sex: 'female' }, answers: {} });
  assert.equal(r.stage, 'BLOCKED');
  assert.ok(r.reason && !('oncology' in r));
  assert.equal(quickTest.run(kb, { profile: { age: 18, sex: 'female' } }).stage, 'QUESTION'); // 18 já faz
});

test('fluxo completo (homem de 63, ex-fumante): crônicas, até 6 do RAPIDO e RESULT', () => {
  const profile = { age: 63, sex: 'male', smoker: true, packYears: 35, quitYears: 8 };
  const { result, asked } = runAll(profile);
  assert.ok(asked.length >= 1 && asked.length <= quickTest.MAX_QUESTIONS);
  assert.equal(result.stage, 'RESULT');
  assert.equal(result.redFlag, null);
  assert.ok(result.disclaimer.includes('Não é diagnóstico'));
  const codes = result.oncology.conditions.map(c => c.code);
  assert.ok(codes.includes('CA_PROSTATA') && !codes.includes('CA_MAMA'), 'sem mama para homem');
  assert.ok(['ROTINA', 'ATENÇÃO', 'INVESTIGAR'].includes(result.oncology.level));
  assert.ok(result.screening.some(s => s.conditionCode === 'CA_PULMAO' && s.status === 'INDICADO_AGORA'));
  assert.ok(result.futureScreening.every(s => s.status === 'FUTURO'));
  // sem estado: a mesma entrada dá a mesma saída
  assert.deepEqual(quickTest.run(kb, { profile, answers: { ...CHRONIC_NO, ...Object.fromEntries(asked.map(c => [c, false])) } }), result);
  assert.equal(result.chronic.riskLevel, 'LOW');
});

test('mulher de 22: nenhuma pergunta, tudo ROTINA e rastreio só no futuro', () => {
  const r = quickTest.run(kb, { profile: { age: 22, sex: 'female' }, answers: CHRONIC_NO });
  assert.equal(r.stage, 'RESULT');
  assert.equal(r.oncology.level, 'ROTINA');
  assert.equal(r.screening.length, 0);
  assert.ok(r.futureScreening.length >= 1);
});

// Fatores do fumo com dados brasileiros (Campos 2024): fumante × 3,08,
// ex-fumante × 1,52. Com hemoptise, o fumante passa de 3% e o ex-fumante
// (parou há 5 anos) fica em ATENÇÃO, perto de 2,6%.
test('hemoptise aos 67: fumante INVESTIGAR, ex-fumante ATENÇÃO', () => {
  const lungFor = (quitYears) => {
    const profile = { age: 67, sex: 'male', smoker: true, packYears: 30, quitYears };
    const { result } = runAll(profile, (code) => code === 'hemoptise');
    return { lung: result.oncology.conditions.find(c => c.code === 'CA_PULMAO'), result };
  };
  const now = lungFor(0);
  assert.equal(now.lung.level, 'INVESTIGAR');
  assert.equal(now.result.oncology.level, 'INVESTIGAR');
  assert.equal(lungFor(5).lung.level, 'ATENÇÃO');
});

test('red flag (perda de peso + suor noturno) encerra na hora', () => {
  const r = quickTest.run(kb, {
    profile: { age: 50, sex: 'female' },
    answers: { perda_peso_inexplicada: true, sudorese_noturna: 'sim' },
  });
  assert.equal(r.stage, 'RESULT');
  assert.equal(r.redFlag?.code, 'NEOPLASIA');
});

test('respostas: código desconhecido → 422; pergunta de outro perfil é ignorada', () => {
  assert.throws(() => quickTest.run(kb, { profile: { age: 40, sex: 'male' }, answers: { nao_existe: true } }),
    (e) => e.status === 422 && e.fields[0].field === 'answers.nao_existe');
  const many = Object.fromEntries(Array.from({ length: quickTest.MAX_ANSWERS + 1 }, (_, i) => [`x${i}`, true]));
  assert.throws(() => quickTest.run(kb, { profile: {}, answers: many }), (e) => e.status === 422);
  // homem com "nódulo na mama": não quebra e não conta
  const a = quickTest.run(kb, { profile: { age: 45, sex: 'male' }, answers: { nodulo_mama: true } });
  const b = quickTest.run(kb, { profile: { age: 45, sex: 'male' }, answers: {} });
  assert.deepEqual(a, b);
});

test('campos de perfil fora da lista não entram no motor', () => {
  const a = quickTest.run(kb, { profile: { age: 22, sex: 'female', familyHistoryDm: true, bmi: 60 } });
  const b = quickTest.run(kb, { profile: { age: 22, sex: 'female' } });
  assert.deepEqual(a, b);
});

test('crônicas: ronco + parada respiratória + cansaço (STOP-Bang ≥ 3) pede consulta', () => {
  const answers = { ...CHRONIC_NO, ronco_alto: true, apneia_observada: true, fadiga_diurna: true };
  const r = quickTest.run(kb, { profile: { age: 22, sex: 'female' }, answers });
  assert.equal(r.stage, 'RESULT');
  assert.equal(r.chronic.riskLevel, 'MODERATE');
  const v = patientView.quickTestForVisitor(r, { age: 22, sex: 'female' });
  assert.equal(v.nextStep.code, 'CONSULTA');
  assert.ok(!('chronic' in v), 'escore fica fora da resposta do visitante');
});

test('crônicas: PHQ-2 aceita likert 0 a 3 e enunciados não citam doença (R2)', () => {
  const proibido = /diabet|hipertens|depress|apneia|síncope|câncer|doença/i;
  for (const c of quickTest.CHRONIC_QUICK) {
    const r = quickTest.run(kb, {
      profile: { age: 40, sex: 'male' },
      answers: Object.fromEntries(quickTest.CHRONIC_QUICK.slice(0, quickTest.CHRONIC_QUICK.indexOf(c)).map(x => [x.code, 0])),
    });
    assert.equal(r.question.symptom, c.code);
    assert.doesNotMatch(r.question.text, proibido, r.question.text);
  }
  const r = quickTest.run(kb, { profile: { age: 22, sex: 'female' }, answers: { ...CHRONIC_NO, phq9_anedonia: 3, phq9_humor_deprimido: 2 } });
  assert.equal(r.stage, 'RESULT');
});
