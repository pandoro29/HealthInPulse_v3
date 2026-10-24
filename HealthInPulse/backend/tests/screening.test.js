// ─── Rastreamento (ScreeningRule → INDICADO_AGORA / FUTURO / DECISAO) ─

const test   = require('node:test');
const assert = require('node:assert/strict');

const { buildFromSeed } = require('../src/services/clinical/kb/buildFromSeed');
const screening = require('../src/services/clinical/screening');
const { normalizeProfile } = require('../src/services/clinical/profile');

const KB = buildFromSeed();
const ev = (profile) => Object.fromEntries(
  screening.evaluate(KB, normalizeProfile(profile)).map(s => [s.conditionCode, s]));

test('colorretal: FIT 50–75 (SUS 2026); 45–49 decisão compartilhada; família → colonoscopia aos 40', () => {
  assert.equal(ev({ age: 50, sex: 'male' }).CA_COLORRETAL.status, 'INDICADO_AGORA');
  assert.match(ev({ age: 75, sex: 'female' }).CA_COLORRETAL.exam, /FIT/);
  assert.equal(ev({ age: 47, sex: 'male' }).CA_COLORRETAL.status, 'DECISAO_COMPARTILHADA');
  const young = ev({ age: 30, sex: 'male' }).CA_COLORRETAL;
  assert.equal(young.status, 'FUTURO');
  assert.equal(young.startAge, 45);
  const fam = ev({ age: 42, sex: 'female', familyHistoryCancer: ['colorretal'] }).CA_COLORRETAL;
  assert.equal(fam.status, 'INDICADO_AGORA');
  assert.equal(fam.kind, 'ALTO_RISCO');
  assert.equal(fam.exam, 'Colonoscopia');
  assert.equal(ev({ age: 35, sex: 'female', familyHistoryCancer: ['colorretal'] }).CA_COLORRETAL.startAge, 40);
  assert.ok(!ev({ age: 80, sex: 'male' }).CA_COLORRETAL, 'acima de 75: sem rastreio');
});

test('pulmão: 50–80, ≥ 20 maços-ano, parou há menos de 15 anos (consenso 2024)', () => {
  const ok = { age: 60, sex: 'male', smoker: true, packYears: 25, quitYears: 5 };
  assert.equal(ev(ok).CA_PULMAO.status, 'INDICADO_AGORA');
  assert.match(ev(ok).CA_PULMAO.exam, /Tomografia/);
  // fumante atual com quitYears em branco = ainda fuma (0)
  assert.equal(ev({ ...ok, quitYears: '' }).CA_PULMAO.status, 'INDICADO_AGORA');
  assert.ok(!ev({ ...ok, packYears: 15 }).CA_PULMAO, 'menos de 20 maços-ano');
  assert.ok(!ev({ ...ok, quitYears: 20 }).CA_PULMAO, 'parou há muito tempo');
  assert.ok(!ev({ age: 60, sex: 'male', smoker: false }).CA_PULMAO, 'nunca fumou');
  assert.ok(!ev({ age: 60, sex: 'male', smoker: 'false', packYears: 30 }).CA_PULMAO, '"false" do formulário não é fumante');
  const future = ev({ ...ok, age: 45 }).CA_PULMAO;
  assert.equal(future.status, 'FUTURO');
  assert.equal(future.startAge, 50);
});

test('evaluate normaliza o perfil sozinho (chamada direta, sem quitYears)', () => {
  const direct = screening.evaluate(KB, { age: 60, sex: 'M', smoker: true, packYears: 30 });
  assert.equal(direct.find(s => s.conditionCode === 'CA_PULMAO')?.status, 'INDICADO_AGORA');
  assert.deepEqual(screening.evaluate(KB, normalizeProfile({ age: 60, sex: 'male', smoker: true, packYears: 30 })), direct);
});

test('mama: 50–74 no SUS (2025); 40–49 decisão compartilhada; família antecipa; nada para homem', () => {
  assert.equal(ev({ age: 60, sex: 'female' }).CA_MAMA.status, 'INDICADO_AGORA');
  assert.equal(ev({ age: 60, sex: 'female' }).CA_MAMA.kind, 'POPULACIONAL');
  assert.equal(ev({ age: 44, sex: 'female' }).CA_MAMA.status, 'DECISAO_COMPARTILHADA');
  const fam = ev({ age: 34, sex: 'female', familyHistoryCancer: ['mama'] }).CA_MAMA;
  assert.equal(fam.status, 'INDICADO_AGORA');
  assert.equal(fam.kind, 'ALTO_RISCO');
  assert.equal(ev({ age: 30, sex: 'female' }).CA_MAMA.startAge, 40);
  assert.ok(!ev({ age: 60, sex: 'male' }).CA_MAMA);
  assert.ok(!ev({ age: 60, sex: 'male' }).CA_COLO_UTERO);
});

test('colo do útero: DNA-HPV 25–64 (2025); atrasado tem recomendação própria', () => {
  const late = ev({ age: 38, sex: 'female', papEmDia: false }).CA_COLO_UTERO;
  assert.equal(late.status, 'INDICADO_AGORA');
  assert.match(late.recommendation, /atrasado/);
  const ok = ev({ age: 38, sex: 'female', papEmDia: true }).CA_COLO_UTERO;
  assert.equal(ok.status, 'INDICADO_AGORA');
  assert.doesNotMatch(ok.recommendation, /atrasado/);
  assert.equal(ok.intervalMonths, 60);
  assert.ok(!ev({ age: 70, sex: 'female' }).CA_COLO_UTERO);
});

test('próstata: sempre decisão compartilhada; 45 com pai/irmão, 50 sem', () => {
  assert.equal(ev({ age: 55, sex: 'male' }).CA_PROSTATA.status, 'DECISAO_COMPARTILHADA');
  assert.equal(ev({ age: 46, sex: 'male', familyHistoryCancer: ['prostata'] }).CA_PROSTATA.status, 'DECISAO_COMPARTILHADA');
  const future = ev({ age: 46, sex: 'male' }).CA_PROSTATA;
  assert.equal(future.status, 'FUTURO');
  assert.equal(future.startAge, 50);
});

test('regra mais prioritária vence; ordem das condições; regra desativada some', () => {
  const list = screening.evaluate(KB, normalizeProfile({ age: 55, sex: 'female', familyHistoryCancer: ['mama'] }));
  assert.deepEqual(list.map(s => s.conditionCode), ['CA_COLORRETAL', 'CA_MAMA', 'CA_COLO_UTERO']);
  // família (prioridade 1) vence a populacional (prioridade 3)
  assert.equal(list.find(s => s.conditionCode === 'CA_MAMA').kind, 'ALTO_RISCO');
  for (const s of list) assert.ok(s.ruleId && s.sourceCode && s.recommendation, s.conditionCode);

  const kb = buildFromSeed();
  for (const r of kb.screeningRules) if (r.conditionCode === 'CA_COLORRETAL') r.active = false;
  assert.ok(!screening.evaluate(kb, { age: 60, sex: 'male' }).some(s => s.conditionCode === 'CA_COLORRETAL'));
});
