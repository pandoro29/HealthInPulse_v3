// ─── Regra R2: o paciente e o visitante nunca ouvem doença ──────────
// O que sai do patientView (triagem, histórico, relatório, exame e o
// teste público) não pode conter nome nem código de condição, "câncer",
// selo de nível nem probabilidade. Os casos usam respostas que levam o
// motor ao INVESTIGAR, que é quando o risco de vazar é maior.

const test   = require('node:test');
const assert = require('node:assert/strict');

const { buildFromSeed } = require('../src/services/clinical/kb/buildFromSeed');
const quickTest   = require('../src/services/quickTestService');
const riskEngine  = require('../src/services/clinical/riskEngine');
const patientView = require('../src/services/patientView');

const kb = buildFromSeed();

const FORBIDDEN = [
  /c[âa]ncer/i, /tumor/i, /neoplasia/i, /INVESTIGAR/, /ATEN[ÇC][ÃA]O/, /posterior/i, /relativeRisk/,
  ...kb.conditions.flatMap(c => [new RegExp(`\\b${c.code}\\b`), new RegExp(c.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')]),
];

const assertClean = (obj, what) => {
  const json = JSON.stringify(obj);
  for (const re of FORBIDDEN) assert.ok(!re.test(json), `${what} vazou ${re}: ${json.slice(0, 400)}`);
};

// Roberto da demo: 63 anos, sangue nas fezes, anemia, perda de peso
const ROBERTO = { age: 63, sex: 'male', height: 172, weight: 70, smoker: true, packYears: 35 };
const answerYes = () => true;

const runQuick = (profile, answerFor) => {
  const answers = {};
  for (let i = 0; i < 20; i++) {
    const r = quickTest.run(kb, { profile, answers });
    if (r.stage !== 'QUESTION') return r;
    // Pergunta pode citar doença quando pergunta o histórico da pessoa
    // ("algum parente teve...?"); o que não pode é o nosso porquê
    const q = patientView.quickTestForVisitor(r, profile);
    assert.deepEqual(Object.keys(q).sort(), ['progress', 'question', 'stage']);
    assert.ok(!/c[âa]ncer/i.test(q.question.help ?? ''), q.question.help);
    answers[r.question.symptom] = answerFor(r.question.symptom);
  }
  throw new Error('não terminou');
};

test('/teste: resultado com sinais de alarme não cita doença e manda procurar atendimento', () => {
  const r = runQuick(ROBERTO, answerYes);
  const v = patientView.quickTestForVisitor(r, ROBERTO);
  assertClean(v, 'resultado do /teste');
  assert.ok(['CONSULTA', 'AGORA'].includes(v.nextStep.code), v.nextStep.code);
  assert.ok(v.habits.some(h => h.code === 'PARAR_DE_FUMAR'));
  assert.ok(v.habits.every(h => h.source), 'todo hábito tem fonte');
});

test('/teste: sem sinal nenhum, jovem: manter a rotina', () => {
  const p = { age: 30, sex: 'female', height: 165, weight: 60 };
  const v = patientView.quickTestForVisitor(runQuick(p, () => false), p);
  assertClean(v, 'resultado do /teste');
  assert.equal(v.nextStep.code, 'ROTINA');
});

test('triagem: visão do paciente e item do histórico não citam doença', () => {
  const answers = {};
  for (const s of kb.symptoms) if (s.kind === 'QUESTION') answers[s.code] = true;
  const a = riskEngine.assess(kb, { profile: ROBERTO, answers });
  const state = {
    wearable: { hasData: true, restingHrAvg: 104, restingSpO2: 93, systolicAvg: 150, diastolicAvg: 92 },
    result: {
      riskLevel: 'HIGH', redFlag: null,
      oncology: { conditions: a.oncology, screening: a.screening, modifiable: a.modifiable },
      ranking: [{ code: 'DM2', label: 'Diabetes tipo 2', posterior: 0.8 }],
      suggestions: [{ type: 'action', text: 'Procurar avaliação médica sobre câncer colorretal' }],
    },
  };
  const view = patientView.triageResultView(state);
  assertClean(view, 'resultado da triagem');
  assert.equal(view.nextStep.code, 'CONSULTA');
  assert.ok(view.vitals.find(x => x.code === 'FC_REPOUSO').status === 'ACIMA');
  assertClean(patientView.triageHistoryItem({ id: 't', status: 'COMPLETED', answers: state }), 'histórico');
  assertClean(patientView.triageResponse({ stage: 'RESULT', result: state.result, redFlag: null, view }), 'resposta');
  assertClean(patientView.wearableLines(state.wearable), 'linhas da pulseira');
});

test('red flag: o paciente vê a ação com telefone, não o rótulo clínico', () => {
  const step = patientView.nextStepFor({
    riskLevel: 'CRITICAL',
    redFlag: { label: 'Suspeita de Síndrome Coronariana Aguda / IAM', urgency: 'EMERGENCY', action: 'SAMU (192) imediato' },
  });
  assert.equal(step.code, 'AGORA');
  assert.equal(step.phone, '192');
  assertClean(step, 'red flag');
  assert.ok(!/Coronariana|IAM/.test(JSON.stringify(step)));
});

test('pergunta da triagem: sem leaderboard, sem hipótese-alvo e sem o porquê', () => {
  const out = patientView.triageResponse({
    stage: 'QUESTION', triageId: 't', question: { symptom: 'x', text: 'Pergunta?' },
    leaderboard: [{ code: 'DM2', label: 'Diabetes tipo 2', posterior: 0.5 }],
    explanation: { targetHypothesis: 'Diabetes tipo 2' }, reason: 'Perguntamos porque câncer…',
  });
  assert.deepEqual(Object.keys(out).sort(), ['hasWearable', 'phase', 'progress', 'question', 'stage', 'status', 'triageId', 'wearableSummary'].sort());
});

test('exame: só achados e faixa, sem resumo nem nível de risco', () => {
  const out = patientView.examForPatient({
    id: 'e', title: 'Hemograma', examResult: {
      id: 'r', summary: 'Sugere anemia ferropriva', riskLevel: 'HIGH',
      findings: [{ name: 'Hemoglobina', value: '10', unit: 'g/dL', status: 'baixo' }],
    },
  });
  assert.equal(out.examResult.summary, undefined);
  assert.equal(out.examResult.riskLevel, undefined);
  assert.equal(out.examResult.outOfRange, 1);
  assert.equal(out.examResult.findings[0].status, 'ABAIXO');
});
