// ─── Exames (LabRule × ExamResult.findings) e balança ───────────────

const test   = require('node:test');
const assert = require('node:assert/strict');

const { buildFromSeed } = require('../src/services/clinical/kb/buildFromSeed');
const labEvidence = require('../src/services/clinical/labEvidence');
const { weightTrendFromReadings } = require('../src/services/clinical/wearableEvidence');

const KB = buildFromSeed();
const NOW = new Date('2026-10-24T12:00:00Z');
const DAY = 24 * 3600 * 1000;
const exam = (daysAgo, findings, title = 'Exame') => ({ title, date: new Date(NOW - daysAgo * DAY), findings });
const run = (exams, profile) => labEvidence.fromExams(KB, exams, { profile, now: NOW });

test('números: vírgula decimal, unidade junto e BI-RADS "4A"', () => {
  assert.equal(labEvidence.parseNumber('10,9'), 10.9);
  assert.equal(labEvidence.parseNumber('4.5 ng/mL'), 4.5);
  assert.equal(labEvidence.parseNumber('4A'), 4);
  assert.equal(labEvidence.parseNumber('BI-RADS 5'), 5);
  assert.equal(labEvidence.parseNumber(12), 12);
  assert.equal(labEvidence.parseNumber('ilegível'), null);
});

test('positivo/negativo: negação conferida antes ("não reagente" não é "reagente")', () => {
  const p = (value, status) => labEvidence.parsePositive({ value, status });
  assert.equal(p('Positivo'), 1);
  assert.equal(p('REAGENTE'), 1);
  assert.equal(p('Detectado'), 1);
  assert.equal(p('ASC-US'), 1);
  assert.equal(p('Não reagente'), 0);
  assert.equal(p('não detectado'), 0);
  assert.equal(p('Negativo'), 0);
  assert.equal(p('NILM - negativo para lesão'), 0);
  assert.equal(p('', 'alterado'), 1);
  assert.equal(p('', 'normal'), 0);
  assert.equal(p('xyz', ''), null);
});

test('hemoglobina por sexo, alias sem acento e mais recente vence', () => {
  const hb = (v, d = 10) => exam(d, [{ name: 'Hemoglobina', value: v, unit: 'g/dL' }], 'Hemograma');
  // 12,5: anemia para homem (< 13), normal para mulher (< 12)
  assert.deepEqual(run([hb('12,5')], { sex: 'male', age: 60 }).evidence, { anemia_hb_baixa: { value: 1, weight: 1 } });
  assert.deepEqual(run([hb('12,5')], { sex: 'female', age: 60 }).evidence, { anemia_hb_baixa: { value: 0, weight: 1 } });
  // sem sexo no perfil: regra com sexFilter não se aplica
  assert.deepEqual(run([hb('9')], { age: 60 }).evidence, {});
  // dois hemogramas: vale o mais recente (normal), o antigo fica em ignored
  const r = run([hb('10,9', 100), hb('14,1', 5)], { sex: 'male', age: 63 });
  assert.equal(r.evidence.anemia_hb_baixa.value, 0);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].numericValue, 14.1);
  assert.match(r.ignored[0].reason, /mais recente/);
  // "Hemoglobina glicada" (HbA1c) NÃO é hemoglobina
  assert.deepEqual(run([exam(5, [{ name: 'Hemoglobina glicada', value: '6' }, { name: 'HbA1c', value: '8.2' }])],
    { sex: 'male', age: 60 }).evidence, {});
});

test('FIT: nome com acento, parênteses e maiúsculas; negativo gera evidência 0', () => {
  const fit = (name, value, status) => run([exam(3, [{ name, value, status }])], { sex: 'male', age: 55 });
  assert.equal(fit('Pesquisa de Sangue Oculto nas Fezes (FIT)', 'Positivo').evidence.fit_positivo.value, 1);
  assert.equal(fit('Teste imunoquímico fecal', '', 'detectado').evidence.fit_positivo.value, 1);
  assert.equal(fit('Sangue oculto', 'Negativo').evidence.fit_positivo.value, 0);
  assert.deepEqual(fit('Sangue oculto', '???').evidence, {});
  assert.equal(fit('Sangue oculto', '???').ignored[0].reason, 'valor ilegível');
});

test('PSA pelo limite da idade (Oesterling) e idade inclusiva', () => {
  const psa = (age, v) => run([exam(30, [{ name: 'PSA total', value: v, unit: 'ng/mL' }])], { sex: 'male', age }).evidence.psa_acima_idade?.value;
  assert.equal(psa(45, '3,0'), 1);   // > 2,5
  assert.equal(psa(55, '3,0'), 0);   // ≤ 3,5
  assert.equal(psa(65, '4,6'), 1);   // > 4,5
  assert.equal(psa(69, '4,5'), 0);   // limite: gt, e 69 ainda é da faixa 60–69
  assert.equal(psa(75, '6,0'), 0);   // ≤ 6,5
  assert.equal(psa(35, '9'), undefined); // nenhuma faixa (< 40)
});

test('maxAgeDays: exame antigo é ignorado (Hb 180 dias; HPV 5 anos)', () => {
  const old = run([exam(200, [{ name: 'Hb', value: '9' }])], { sex: 'female', age: 50 });
  assert.deepEqual(old.evidence, {});
  assert.match(old.ignored[0].reason, /200 dias/);
  const hpv = run([exam(4 * 365, [{ name: 'DNA-HPV', value: 'Detectado' }])], { sex: 'female', age: 40 });
  assert.equal(hpv.evidence.hpv_alto_risco.value, 1);
  // HPV não vale para homem
  assert.deepEqual(run([exam(10, [{ name: 'HPV', value: 'Detectado' }])], { sex: 'male', age: 40 }).evidence, {});
});

test('aceita a linha do Prisma (examResult.findings em string JSON)', () => {
  const row = {
    title: 'Hemograma', uploadedAt: new Date(NOW - 7 * DAY),
    examResult: { findings: JSON.stringify([{ name: 'Hemoglobina (Hb)', value: '11.2', unit: 'g/dL', status: 'baixo' }]) },
  };
  const r = run([row], { sex: 'female', age: 52 });
  assert.equal(r.evidence.anemia_hb_baixa.value, 1);
  assert.equal(r.items[0].examTitle, 'Hemograma');
  assert.equal(r.items[0].ageDays, 7);
  assert.equal(r.items[0].sourceCode, 'WHO_HB_2024');
});

test('regra inativa na base (edição da médica) deixa de ler o exame', () => {
  const kb = buildFromSeed();
  for (const r of kb.labRules) if (r.symptomCode === 'fit_positivo') r.active = false;
  const r = labEvidence.fromExams(kb, [exam(3, [{ name: 'FIT', value: 'Positivo' }])], { profile: { age: 60 }, now: NOW });
  assert.deepEqual(r.evidence, {});
});

// ─── Balança ────────────────────────────────────────────────────────
const series = (fromKg, toKg, days, n = 10) => Array.from({ length: n }, (_, i) => ({
  recordedAt: new Date(NOW - (days - (days * i) / (n - 1)) * DAY), weight: fromKg + ((toKg - fromKg) * i) / (n - 1),
}));

test('balança: queda ≥ 5% em até 180 dias vira perda_peso_objetiva', () => {
  const t = weightTrendFromReadings(series(84, 76, 90), { now: NOW });
  assert.deepEqual(t.evidence, { perda_peso_objetiva: { value: 1, weight: 1 } });
  assert.equal(t.dropPct, 9.5);
  assert.equal(t.days, 90);
  assert.match(t.summary, /9,5% do peso em 90 dias \(84 → 76 kg\)/);
  // a balança só emite POSITIVO: nunca "não perdeu peso" (valor 0)
  const none = (readings) => assert.deepEqual(weightTrendFromReadings(readings, { now: NOW }).evidence, {});
  none(series(80, 76.1, 90));   // 4,9%: abaixo do limiar, mas não é "estável"
  none(series(80, 80, 10));     // série curta
  none(series(80, 80, 170));    // série longa e estável
  none([{ recordedAt: new Date(NOW - 170 * DAY), weight: 80 }, { recordedAt: new Date(NOW - 130 * DAY), weight: 80 }]); // velha
  none([{ recordedAt: NOW, weight: 70 }]);                                                                             // 1 leitura
  // a queda antiga (fora dos 180 dias) não conta
  none([...series(90, 80, 60).map(p => ({ ...p, recordedAt: new Date(p.recordedAt - 300 * DAY) })), ...series(80, 79.5, 90)]);
  none(series(70, 80, 90));     // ganho de peso
  assert.equal(weightTrendFromReadings(series(80, 76.1, 90), { now: NOW }).lost, false);
});
