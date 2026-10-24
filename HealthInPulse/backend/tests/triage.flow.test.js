// ─── Máquina de estados da triagem (advance) com banco falso ────────
// COLLECT_PROFILE → INTERVIEW (crônica) → ONCO_INTERVIEW → COMPLETED,
// sem banco de verdade: o Prisma, o kbRepository, as notificações e as
// metas são trocados por versões em memória ANTES de carregar o serviço.
// Confere que o finalize sempre acontece, que a fase 2 conta as próprias
// perguntas (oncoAsked), que chamar sem payload retoma a mesma pergunta e
// que o red flag no meio da fase 2 leva o risco oncológico junto.

const test   = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');

const SRC = path.join(__dirname, '../src');
const stub = (rel, exports) => {
  const file = require.resolve(path.join(SRC, rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

// ─── Banco falso ────────────────────────────────────────────────────
const db = {
  triages: new Map(), reports: [], links: [{ doctor: { userId: 'u-medica' } }], exams: [],
  triageAnswer: {
    findFirst: async ({ where }) => {
      const t = db.triages.get(where.id);
      return t && t.patientId === where.patientId ? { ...t } : null;
    },
    update: async ({ where, data }) => {
      const t = { ...db.triages.get(where.id), ...data };
      db.triages.set(where.id, t);
      return t;
    },
  },
  patient:       { findUnique: async () => ({ userId: 'u-paciente', fullName: 'Paciente Teste' }) },
  aiReport:      { create: async ({ data }) => { db.reports.push(data); return { id: `r${db.reports.length}`, ...data }; } },
  doctorPatient: { findMany: async () => db.links },
  exam:          { findMany: async () => db.exams },
};
const sent = [];
stub('config/database.js', db);
stub('services/clinical/kb/kbRepository.js', { get: async () => require('../src/services/clinical/kb/buildFromSeed').getSeedKb() });
stub('services/goalService.js', { generateGoalsFromTriage: async () => [] });
stub('routes/notificationRoutes.js', { send: async (n) => { sent.push(n); return n; } });
const emitted = [];
stub('config/socket.js', { getIO: () => ({ to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) }) });

const triageService = require('../src/services/triageService');

let seq = 0;
const newTriage = (state) => {
  const id = `t${++seq}`;
  db.triages.set(id, { id, patientId: 'p1', status: 'IN_PROGRESS', answers: JSON.stringify(state) });
  return id;
};
const freshState = () => ({
  version: 2, profile: {}, answers: {}, rawAnswers: {}, asked: [], wearable: null, evidence: {},
  redFlag: null, status: 'COLLECT_PROFILE', oncoAsked: [], weightTrend: null,
});
const stored = (id) => JSON.parse(db.triages.get(id).answers);
const answer = (id, payload) => triageService.answerTriage('p1', id, payload);

// Responde tudo com `pick(symptom)` (padrão 0) até o RESULT
const runAll = async (id, first, pick = () => 0) => {
  const trail = [];
  let r = first;
  for (let guard = 0; r.stage === 'QUESTION' && guard < 60; guard++) {
    trail.push({ status: r.status, phase: r.phase, symptom: r.question.symptom, progress: r.progress });
    r = await answer(id, { symptom: r.question.symptom, value: pick(r.question.symptom) });
  }
  return { r, trail };
};

const MAN = { age: 63, sex: 'male', height: 172, weight: 76, smoker: false };

test('crônica → oncológica → finalize; a fase 2 conta só as próprias perguntas', async () => {
  const reportsBefore = db.reports.length;
  const id = newTriage(freshState());
  const first = await answer(id, { profile: MAN });
  assert.equal(first.stage, 'QUESTION');
  assert.equal(first.status, 'INTERVIEW');
  assert.equal(first.phase, 'CRONICA');

  const { r, trail } = await runAll(id, first);
  const chronic = trail.filter(t => t.status === 'INTERVIEW');
  const onco = trail.filter(t => t.status === 'ONCO_INTERVIEW');
  // fases em ordem, sem voltar
  assert.deepEqual(trail.map(t => t.status), [...chronic.map(() => 'INTERVIEW'), ...onco.map(() => 'ONCO_INTERVIEW')]);
  assert.ok(chronic.length >= 6 && chronic.length <= 18);
  assert.ok(onco.length >= 1 && onco.length <= 6);
  assert.ok(onco.every(t => t.phase === 'ONCOLOGIA'));
  // askedCount = oncoAsked: 0, 1, 2… de até 6, independente das crônicas
  assert.deepEqual(onco.map(t => t.progress), onco.map((_, i) => ({ asked: i, max: 6 })));
  // nada perguntado duas vezes
  assert.equal(new Set(trail.map(t => t.symptom)).size, trail.length);

  // finalize aconteceu: RESULT, estado COMPLETED, um relatório, oncologia no resultado
  assert.equal(r.stage, 'RESULT');
  assert.equal(r.status, 'COMPLETED');
  assert.equal(db.reports.length, reportsBefore + 1);
  const st = stored(id);
  assert.equal(st.status, 'COMPLETED');
  assert.equal(db.triages.get(id).status, 'COMPLETED');
  assert.deepEqual(st.oncoAsked, onco.map(t => t.symptom));
  assert.deepEqual(r.result.oncology.asked, st.oncoAsked);
  assert.ok(r.result.oncology.conditions.some(c => c.code === 'CA_PROSTATA'));
});

test('sem payload, retoma a mesma pergunta (crônica e oncológica) sem mudar o estado', async () => {
  const id = newTriage(freshState());
  let r = await answer(id, { profile: MAN });
  const again = await answer(id, {});
  assert.equal(again.question.symptom, r.question.symptom);
  assert.equal(again.status, 'INTERVIEW');

  // vai até a primeira pergunta oncológica
  while (r.status === 'INTERVIEW') r = await answer(id, { symptom: r.question.symptom, value: 0 });
  assert.equal(r.status, 'ONCO_INTERVIEW');
  const before = stored(id);
  const resumed = await triageService.advance(db.triages.get(id), stored(id), 'p1');
  assert.equal(resumed.question.symptom, r.question.symptom);
  assert.deepEqual(resumed.progress, r.progress);
  assert.deepEqual(stored(id).oncoAsked, before.oncoAsked);
  assert.equal((await answer(id, {})).question.symptom, r.question.symptom);
});

test('sem pergunta de câncer útil (mulher de 22), vai direto ao finalize', async () => {
  const reportsBefore = db.reports.length;
  const id = newTriage(freshState());
  const first = await answer(id, { profile: { age: 22, sex: 'female', height: 165, weight: 60 } });
  const { r, trail } = await runAll(id, first);
  assert.ok(trail.every(t => t.status === 'INTERVIEW'));
  assert.equal(r.stage, 'RESULT');
  assert.equal(r.status, 'COMPLETED');
  assert.equal(db.reports.length, reportsBefore + 1);
  assert.ok(r.result.oncology.conditions.every(c => c.level === 'ROTINA'));
});

test('red flag na fase 2: resultado leva a oncologia e o INVESTIGAR avisa a médica vinculada', async () => {
  sent.length = 0;
  const id = newTriage(freshState());
  let r = await answer(id, { profile: { age: 45, sex: 'female', height: 165, weight: 62, familyHistoryCancer: ['mama'] } });
  while (r.status === 'INTERVIEW') r = await answer(id, { symptom: r.question.symptom, value: 0 });
  assert.equal(r.status, 'ONCO_INTERVIEW');
  // "sim" para o nódulo (LR 55) e, na pergunta seguinte, um sinal de AVC
  r = await answer(id, { symptom: 'nodulo_mama', value: 1 });
  assert.equal(r.status, 'ONCO_INTERVIEW');
  r = await answer(id, { symptom: 'deficit_neurologico_subito', value: 1 });

  assert.equal(r.stage, 'RESULT');
  assert.equal(r.redFlag.code, 'AVC');
  assert.equal(r.result.riskLevel, 'CRITICAL');
  const mama = r.result.oncology.conditions.find(c => c.code === 'CA_MAMA');
  assert.equal(mama.level, 'INVESTIGAR');
  assert.deepEqual(sent.map(n => [n.userId, n.type, n.metadata.oncology]), [['u-medica', 'ALERT', ['CA_MAMA']]]);
  const alert = emitted.filter(e => e.event === 'triage:alert').at(-1);
  assert.equal(alert.room, 'user:u-medica');
  assert.deepEqual(alert.payload.oncology, ['CA_MAMA']);
  assert.equal(alert.payload.isRedFlag, true);
});
