// ─── Personas da feira no motor oncológico (versão pura, sem banco) ──
// Roberto, Marina, João, a mulher de 22 e o homem de 67 com hemoptise.
// Os números da base podem ser revisados (Docs/base-clinica-oncologia.md),
// então o teste confere CATEGORIAS e fatos qualitativos, não percentuais
// exatos. A matemática exata está em engine.math.test.js.

const test   = require('node:test');
const assert = require('node:assert/strict');

const { buildFromSeed } = require('../src/services/clinical/kb/buildFromSeed');
const riskEngine    = require('../src/services/clinical/riskEngine');
const questionRunner = require('../src/services/clinical/questionRunner');
const labEvidence   = require('../src/services/clinical/labEvidence');
const { weightTrendFromReadings } = require('../src/services/clinical/wearableEvidence');

const KB = buildFromSeed();
const NOW = new Date('2026-10-24T10:00:00-03:00');
const DAY = 24 * 3600 * 1000;
const RANK = riskEngine.LEVEL_RANK;
const logit = (p) => Math.log(p / (1 - p));

const byCode = (r) => Object.fromEntries(r.oncology.map(o => [o.code, o]));
const atLeast = (o, level) => assert.ok(RANK[o.level] >= RANK[level], `${o.code}: ${o.level}, esperado ≥ ${level}`);
const assertInvariant = (r) => {
  for (const o of r.oncology.filter(x => x.eligible)) {
    const sum = o.contributions.reduce((a, c) => a + c.delta, logit(o.prior));
    assert.ok(Math.abs(sum - logit(o.posterior)) < 1e-9, `${o.code}: invariante`);
  }
};

// ─── Roberto, 63: ex-fumante, intestino mudou, Hb 10,9, FIT+, balança ─
const ROBERTO_PROFILE = { age: 63, sex: 'male', height: 172, weight: 76, smoker: true, packYears: 35, quitYears: 8 };
const ROBERTO_EXAMS = [
  { title: 'Hemograma', date: new Date(NOW - 12 * DAY), findings: [
    { name: 'Hemoglobina', value: '10,9', unit: 'g/dL', status: 'baixo' },
    { name: 'VCM', value: '74', unit: 'fL', status: 'baixo' },
    { name: 'Ferritina', value: '9', unit: 'ng/mL', status: 'baixo' },
  ] },
  { title: 'Sangue oculto nas fezes', date: new Date(NOW - 10 * DAY), findings: [
    { name: 'Pesquisa de sangue oculto nas fezes (FIT)', value: 'Positivo', unit: '', status: 'alterado' },
  ] },
];
// 90 dias de balança caindo de 84 para 76 kg
const ROBERTO_WEIGHTS = Array.from({ length: 13 }, (_, i) => ({
  recordedAt: new Date(NOW - (90 - i * 7.5) * DAY), weight: 84 - (8 * i) / 12,
}));

const roberto = (answers = { mudanca_habito_intestinal: true }) => {
  const labs = labEvidence.fromExams(KB, ROBERTO_EXAMS, { profile: ROBERTO_PROFILE, now: NOW });
  const trend = weightTrendFromReadings(ROBERTO_WEIGHTS, { now: NOW });
  return { labs, trend, r: riskEngine.assess(KB, {
    profile: ROBERTO_PROFILE, answers, labEvidence: labs, wearableEvidence: trend.evidence,
  }) };
};

test('Roberto: colorretal INVESTIGAR, com exame, balança e resposta no "por quê"', () => {
  const { labs, trend, r } = roberto();
  assert.deepEqual(labs.evidence, { anemia_hb_baixa: { value: 1, weight: 1 }, fit_positivo: { value: 1, weight: 1 } });
  assert.equal(trend.evidence.perda_peso_objetiva.value, 1);

  const o = byCode(r);
  assert.equal(o.CA_COLORRETAL.level, 'INVESTIGAR');
  assert.equal(o.CA_COLORRETAL.riskLevel, 'HIGH');
  assert.equal(o.CA_COLORRETAL.display.posterior, '≥20%');
  assert.deepEqual(o.CA_COLORRETAL.contributions.map(c => c.code).sort(),
    ['anemia_hb_baixa', 'fit_positivo', 'mudanca_habito_intestinal', 'perda_peso_objetiva']);
  for (const c of o.CA_COLORRETAL.contributions) assert.ok(c.delta > 0 && c.source?.citation, c.code);
  assert.match(o.CA_COLORRETAL.contributions.find(c => c.code === 'fit_positivo').note, /Pesquisa de sangue oculto/);
  assert.equal(o.CA_COLORRETAL.contributions.find(c => c.code === 'perda_peso_objetiva').note, 'Pesado na balança.');

  // pulmão: ex-fumante pesado com perda de peso medida → pelo menos atenção
  atLeast(o.CA_PULMAO, 'ATENÇÃO');
  assert.ok(o.CA_PULMAO.factors.some(f => f.label === 'Ex-fumante'));
  // sem câncer de mulher para ele
  assert.ok(!o.CA_MAMA && !o.CA_COLO_UTERO);

  // rastreamento: TC de pulmão indicada (35 maços-ano, parou há 8 anos)
  const lung = r.screening.find(s => s.conditionCode === 'CA_PULMAO');
  assert.equal(lung.status, 'INDICADO_AGORA');
  assert.match(lung.exam, /Tomografia/);
  // colorretal em INVESTIGAR: o rastreio leva o aviso de que o caminho é avaliação
  assert.equal(r.screening.find(s => s.conditionCode === 'CA_COLORRETAL').investigate, true);
  assert.equal(r.oncologyLevel, 'INVESTIGAR');
  assert.equal(r.redFlag, null);
  assertInvariant(r);
});

test('Roberto respondendo "perdi peso" E com a balança: a perda conta uma vez só nos cânceres', () => {
  const both = roberto({ mudanca_habito_intestinal: true, perda_peso_inexplicada: true, sudorese_noturna: true });
  const scaleOnly = roberto({ mudanca_habito_intestinal: true });
  for (const code of ['CA_COLORRETAL', 'CA_PULMAO']) {
    const o = byCode(both.r)[code];
    const reported = o.contributions.find(c => c.code === 'perda_peso_inexplicada');
    assert.equal(reported.superseded, true, code);
    assert.equal(reported.delta, 0, code);
    assert.equal(reported.supersededBy, 'perda_peso_objetiva');
    assert.match(reported.note, /balança/);
    // mesmo posterior de quem não respondeu a pergunta
    assert.ok(Math.abs(o.posterior - byCode(scaleOnly.r)[code].posterior) < 1e-12, code);
  }
  assertInvariant(both.r);
  // a fase crônica continua usando a resposta (DM2 tem perda de peso)
  const dm2 = both.r.chronic.find(c => c.code === 'DM2');
  assert.ok(dm2.contributions.find(c => c.code === 'perda_peso_inexplicada').delta !== 0);
  // e o red flag NEOPLASIA olha a resposta, não a balança
  assert.equal(both.r.redFlag?.code, 'NEOPLASIA');

  // sem balança, a resposta conta normalmente
  const noScale = byCode(riskEngine.assess(KB, { profile: ROBERTO_PROFILE, answers: { perda_peso_inexplicada: true } }));
  assert.ok(noScale.CA_COLORRETAL.contributions.find(c => c.code === 'perda_peso_inexplicada').delta > 0);
  // objetivo 0 (se alguém o injetar) não substitui: só o positivo substitui
  const zero = byCode(riskEngine.assess(KB, {
    profile: ROBERTO_PROFILE, answers: { perda_peso_inexplicada: true },
    wearableEvidence: { perda_peso_objetiva: { value: 0, weight: 1 } },
  })).CA_COLORRETAL;
  assert.ok(!zero.contributions.find(c => c.code === 'perda_peso_inexplicada').superseded);
  assert.ok(zero.contributions.find(c => c.code === 'perda_peso_inexplicada').delta > 0);
});

// Revisão T5: balança velha, curta ou comprada depois da perda não pode
// anular um "sim" relatado (antes virava evidência negativa).
test('balança sem queda não gera evidência nem muda o resultado de quem disse "perdi peso"', () => {
  const answers = { perda_peso_inexplicada: true, mudanca_habito_intestinal: true, dor_abdominal_persistente: true };
  const base = byCode(riskEngine.assess(KB, { profile: ROBERTO_PROFILE, answers }));
  const withTrend = (readings) => {
    const trend = weightTrendFromReadings(readings, { now: NOW });
    assert.deepEqual(trend.evidence, {}, 'balança sem queda não é evidência');
    return byCode(riskEngine.assess(KB, { profile: ROBERTO_PROFILE, answers, wearableEvidence: trend.evidence }));
  };
  // série velha e estável (80 kg há 170 e 130 dias)
  const stale = withTrend([{ recordedAt: new Date(NOW - 170 * DAY), weight: 80 }, { recordedAt: new Date(NOW - 130 * DAY), weight: 80 }]);
  // balança comprada há 35 dias, depois da perda: peso já estável
  const bought = withTrend(Array.from({ length: 6 }, (_, i) => ({ recordedAt: new Date(NOW - (35 - i * 7) * DAY), weight: 76 })));
  for (const r of [stale, bought]) {
    assert.equal(r.CA_COLORRETAL.posterior, base.CA_COLORRETAL.posterior);
    assert.equal(r.CA_COLORRETAL.level, base.CA_COLORRETAL.level);
    assert.ok(r.CA_COLORRETAL.contributions.find(c => c.code === 'perda_peso_inexplicada').delta > 0);
  }
  assert.equal(base.CA_COLORRETAL.level, 'INVESTIGAR');
  // e a fase oncológica pode perguntar "perdeu peso?" (nenhum positivo da balança)
  const asked = [];
  const ans = {};
  for (let n; (n = questionRunner.next(KB, { profile: ROBERTO_PROFILE, answers: ans, panel: 'ONCOLOGIA', max: 20,
    evidence: weightTrendFromReadings(ROBERTO_WEIGHTS.slice(-2), { now: NOW }).evidence }));) { asked.push(n.symptom); ans[n.symptom] = 0; }
  assert.ok(asked.includes('perda_peso_inexplicada'));
});

test('mulher de 22 anos sem queixas: tudo ROTINA, nenhuma pergunta de câncer', () => {
  const profile = { age: 22, sex: 'female' };
  const r = riskEngine.assess(KB, { profile });
  assert.ok(r.oncology.length > 0);
  for (const o of r.oncology) {
    assert.equal(o.level, 'ROTINA', o.code);
    assert.equal(o.eligible, false, o.code); // abaixo da idade de avaliação
    assert.equal(o.posterior, null);
  }
  assert.ok(!byCode(r).CA_PROSTATA);
  assert.equal(r.oncologyLevel, 'ROTINA');
  // rastreamento só no futuro (preventivo a partir dos 25)
  assert.ok(r.screening.every(s => s.status === 'FUTURO'));
  assert.equal(r.screening.find(s => s.conditionCode === 'CA_COLO_UTERO').startAge, 25);
  assert.equal(questionRunner.next(KB, { profile, answers: {}, panel: 'RAPIDO', max: 8 }), null);
  assert.equal(questionRunner.next(KB, { profile, answers: {}, panel: 'ONCOLOGIA', max: 6 }), null);
});

test('homem de 67 com hemoptise: pulmão INVESTIGAR (ex-fumante de 30 maços-ano)', () => {
  const smoker = riskEngine.assess(KB, {
    profile: { age: 67, sex: 'male', smoker: true, packYears: 30, quitYears: 5 }, answers: { hemoptise: 'sim' },
  });
  const o = byCode(smoker);
  assert.equal(o.CA_PULMAO.level, 'INVESTIGAR');
  // é o pulmão que sobe; os outros cânceres dele não mudam com a hemoptise
  assert.ok(o.CA_PULMAO.relativeRisk > o.CA_COLORRETAL.relativeRisk);
  assert.equal(o.CA_COLORRETAL.level, 'ROTINA');
  assert.ok(o.CA_PULMAO.contributions.find(c => c.code === 'hemoptise').factor > 5);
  assertInvariant(smoker);

  // nunca fumou: o mesmo sinal pede atenção (a literatura não sustenta ≥ 3%)
  const never = byCode(riskEngine.assess(KB, { profile: { age: 67, sex: 'male', smoker: false }, answers: { hemoptise: true } }));
  atLeast(never.CA_PULMAO, 'ATENÇÃO');
  assert.ok(never.CA_PULMAO.posterior < o.CA_PULMAO.posterior);
});

test('Marina, 38: mãe com câncer de mama → mama ATENÇÃO (RR ≈ 2); preventivo atrasado', () => {
  const r = riskEngine.assess(KB, { profile: { age: 38, sex: 'female', familyHistoryCancer: ['mama'], papEmDia: false } });
  const o = byCode(r);
  assert.equal(o.CA_MAMA.level, 'ATENÇÃO');
  assert.ok(o.CA_MAMA.relativeRisk >= 2 && o.CA_MAMA.relativeRisk < 3);
  assert.ok(o.CA_MAMA.factors.some(f => /Mãe, irmã ou filha/.test(f.label)));
  assert.ok(!o.CA_PROSTATA, 'sem próstata para mulher');
  assert.ok(o.CA_COLO_UTERO.factors.some(f => /atrasado/.test(f.label)));
  assert.ok(r.modifiable.some(m => /atrasado/.test(m.label)));
  // rastreamento de alto risco antecipado e HPV indicado agora
  const mama = r.screening.find(s => s.conditionCode === 'CA_MAMA');
  assert.equal(mama.status, 'INDICADO_AGORA');
  assert.equal(mama.kind, 'ALTO_RISCO');
  const colo = r.screening.find(s => s.conditionCode === 'CA_COLO_UTERO');
  assert.equal(colo.status, 'INDICADO_AGORA');
  assert.match(colo.recommendation, /atrasado/);
  // "papEmDia" do formulário pode chegar como string
  const asString = byCode(riskEngine.assess(KB, { profile: { age: 38, sex: 'F', familyHistoryCancer: 'mama', papEmDia: 'false' } }));
  assert.equal(asString.CA_MAMA.posterior, o.CA_MAMA.posterior);
  assert.equal(asString.CA_COLO_UTERO.posterior, o.CA_COLO_UTERO.posterior);
});

test('João, 55, nunca fumou e sem queixas: ROTINA; FIT indicado e PSA em decisão compartilhada', () => {
  const r = riskEngine.assess(KB, { profile: { age: 55, sex: 'male', smoker: false, bmi: 31 } });
  for (const o of r.oncology) assert.equal(o.level, 'ROTINA', o.code);
  assert.ok(!byCode(r).CA_MAMA && !byCode(r).CA_COLO_UTERO);
  const s = Object.fromEntries(r.screening.map(x => [x.conditionCode, x]));
  assert.equal(s.CA_COLORRETAL.status, 'INDICADO_AGORA');
  assert.match(s.CA_COLORRETAL.exam, /FIT/);
  assert.equal(s.CA_PROSTATA.status, 'DECISAO_COMPARTILHADA');
  assert.ok(!s.CA_PULMAO, 'nunca fumou: sem tomografia');
  // IMC ≥ 30 é fator modificável do colorretal
  assert.ok(r.modifiable.some(m => m.conditionCode === 'CA_COLORRETAL' && /IMC/.test(m.label)));
});

test('mulher de 48 com BI-RADS 4 na mamografia: mama INVESTIGAR', () => {
  const profile = { age: 48, sex: 'female' };
  const labs = labEvidence.fromExams(KB, [{ title: 'Mamografia', date: new Date(NOW - 20 * DAY),
    findings: [{ name: 'BI-RADS', value: '4A', unit: '', status: 'alterado' }] }], { profile, now: NOW });
  const o = byCode(riskEngine.assess(KB, { profile, labEvidence: labs }));
  assert.equal(o.CA_MAMA.level, 'INVESTIGAR');
  assert.equal(o.CA_MAMA.contributions[0].kind, 'LAB');
  assert.equal(o.CA_MAMA.contributions[0].answer, 'alterado');
});

// ─── Seletor de perguntas ───────────────────────────────────────────
test('questionRunner: painel, sexo, máximo, já respondidas e balança', () => {
  const man = { age: 63, sex: 'male' };
  const woman = { age: 45, sex: 'female' };
  const seq = (profile, panel, max, opts = {}) => {
    const answers = {};
    const out = [];
    for (let n; (n = questionRunner.next(KB, { profile, answers, panel, max, ...opts }));) {
      assert.ok(n.reason.length > 20 && /vezes mais comum/.test(n.reason), n.reason);
      assert.ok(n.score > 0 && n.targets.length > 0);
      assert.deepEqual(n.progress, { asked: out.length, max });
      out.push(n.symptom);
      answers[n.symptom] = false;
    }
    return out;
  };
  const manQ = seq(man, 'ONCOLOGIA', 6);
  assert.equal(manQ.length, 6);
  assert.ok(!manQ.some(s => /mama|coito|ciclo/.test(s)));
  const womanQ = seq(woman, 'ONCOLOGIA', 20);
  assert.ok(!womanQ.includes('sintomas_urinarios_baixos') && !womanQ.includes('hematuria_visivel'));
  assert.ok(womanQ.includes('nodulo_mama'));
  // RAPIDO: só as perguntas marcadas para o teste público
  const rapido = new Set(KB.symptoms.filter(s => s.panels.includes('RAPIDO')).map(s => s.code));
  assert.ok(seq(man, 'RAPIDO', 8).every(s => rapido.has(s)));
  // com a balança, não pergunta "perdeu peso?"
  const withScale = seq(man, 'ONCOLOGIA', 20, { evidence: { perda_peso_objetiva: { value: 1 } } });
  assert.ok(!withScale.includes('perda_peso_inexplicada'));
  assert.ok(manQ.includes('perda_peso_inexplicada') || seq(man, 'ONCOLOGIA', 20).includes('perda_peso_inexplicada'));
  // askedCount explícito (triagem conta só as feitas na fase 2)
  assert.equal(questionRunner.next(KB, { profile: man, answers: {}, panel: 'ONCOLOGIA', max: 6, askedCount: 6 }), null);
});

test('questionRunner: maior Σ|ln LR+|/custo primeiro; empate pelo sortOrder', () => {
  const kb = buildFromSeed();
  // duas perguntas com o mesmo LR e custo só para colorretal: vence o menor sortOrder
  for (const cs of kb.conditionSymptoms.filter(c => c.conditionCode.startsWith('CA_'))) { cs.pSx = 0.2; cs.pNoSx = 0.1; }
  for (const s of kb.symptoms) s.cost = 1;
  const first = questionRunner.next(kb, { profile: { age: 35, sex: 'male' }, panel: 'ONCOLOGIA', max: 6 });
  const ccrQuestions = kb.symptoms.filter(s => s.kind === 'QUESTION' && s.panels.includes('ONCOLOGIA')
    && kb.conditionSymptoms.some(c => c.symptomCode === s.code && c.conditionCode === 'CA_COLORRETAL'))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  assert.equal(first.symptom, ccrQuestions[0].code);
});

test('pele da mama: regra direta do NICE NG12 sobe para ATENÇÃO, sem LR', () => {
  const kbAll = require('../src/services/clinical/kb/buildFromSeed').buildFromSeed();
  const riskEngine = require('../src/services/clinical/riskEngine');
  const profile = { age: 45, sex: 'female', height: 165, weight: 62 };
  const sem = riskEngine.assess(kbAll, { profile, answers: {} }).oncology.find(c => c.code === 'CA_MAMA');
  const com = riskEngine.assess(kbAll, { profile, answers: { alteracao_pele_mama: true } }).oncology.find(c => c.code === 'CA_MAMA');
  assert.equal(sem.level, 'ROTINA');
  assert.equal(com.level, 'ATENÇÃO');
  assert.equal(com.posterior, sem.posterior, 'a regra não mexe no número');
  assert.match(com.directRule.source.citation, /NICE/);
});
