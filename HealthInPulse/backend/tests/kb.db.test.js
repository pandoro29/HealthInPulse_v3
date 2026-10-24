// ─── kb no banco ────────────────────────────────────────────────────
// Confere que o kb gravado pelo seedKnowledge e lido pelo kbRepository é
// o mesmo kb do buildFromSeed (o motor não pode notar a diferença), e o
// ciclo de vida da base: cache, versão, ensureSeeded e resetToDefaults.
//
// Banco: um SQLite novo numa pasta temporária do sistema, criado com
// `prisma db push` no início e apagado no fim. O dev.db não é tocado.
// Precisa do Prisma Client gerado com o schema atual (`npm run setup`).

const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const os     = require('node:os');
const path   = require('node:path');
const { spawnSync } = require('node:child_process');

const { buildFromSeed } = require('../src/services/clinical/kb/buildFromSeed');
const { normalizeKb, sameKb } = require('../src/services/clinical/kb/kbTables');
const { createKbRepository } = require('../src/services/clinical/kb/kbRepository');
const { seedKnowledge } = require('../src/prisma/seedKnowledge');
const bayes     = require('../src/services/clinical/bayes');
const questions = require('../src/services/clinical/questions');

const BACKEND = path.join(__dirname, '..');

// ─── Banco temporário ───────────────────────────────────────────────
let tmpDir;
let prisma;

test.before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hip-kb-'));
  // Caminho absoluto com "/" (o Prisma aceita assim também no Windows)
  const url = `file:${path.join(tmpDir, 'kb.db').replace(/\\/g, '/')}`;

  // CLI do Prisma pelo próprio node: sem npx/shell, igual em todo sistema
  const cli = require.resolve('prisma/build/index.js', { paths: [BACKEND] });
  const push = spawnSync(process.execPath, [cli, 'db', 'push', '--skip-generate'], {
    cwd: BACKEND,
    env: { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    encoding: 'utf8',
  });
  assert.equal(push.status, 0, `prisma db push falhou:\n${push.stdout}\n${push.stderr}`);

  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient({ datasources: { db: { url } } });
  assert.ok(prisma.condition && prisma.knowledgeVersion,
    'Prisma Client sem os models do kb: rode `npm run setup` (ou `npm --prefix backend run db:generate`)');
});

test.after(async () => {
  await prisma?.$disconnect();
  // maxRetries: no Windows o arquivo do SQLite pode ficar preso (EBUSY) por
  // alguns ms depois do $disconnect
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

// Base limpa: só o seed, sem histórico
const freshDb = async (kb = buildFromSeed()) => {
  await prisma.knowledgeVersion.deleteMany();
  await seedKnowledge(prisma, { kb, mode: 'replace' });
};

// ─── kb do banco == kb do JS ────────────────────────────────────────
test('kb lido do banco é igual ao do buildFromSeed', async () => {
  await freshDb();
  const repo = createKbRepository(prisma);
  const fromDb = await repo.get();
  const fromJs = buildFromSeed();

  assert.equal(fromDb.version, 0);
  assert.deepEqual(Object.keys(fromDb).sort(), Object.keys(fromJs).sort());
  assert.deepEqual(normalizeKb(fromDb), normalizeKb(fromJs));
  // Onde a ordem tem significado, ela já sai igual do banco
  assert.deepEqual(fromDb.conditions, fromJs.conditions);
  assert.deepEqual(fromDb.symptoms, fromJs.symptoms);
  assert.deepEqual(fromDb.priorRules, fromJs.priorRules);
});

test('motor sobre o kb do banco dá os mesmos números (bit a bit) que sobre o kb do JS', async () => {
  await freshDb();
  const kbDb = await createKbRepository(prisma).get();
  const kbJs = buildFromSeed();
  const engDb = bayes.createEngine(kbDb, { categories: ['CRONICA'] });
  const engJs = bayes.createEngine(kbJs, { categories: ['CRONICA'] });

  const profiles = [
    {},
    { age: 63, sex: 'male', bmi: 31, smoker: true, packYears: 20, familyHistoryDm: true },
    { age: 34, sex: 'female', bmi: 22 },
    { age: 71, sex: 'female', bmi: 28, smoker: false },
  ];
  const codes = [...new Set(kbJs.conditionSymptoms.map(cs => cs.symptomCode))];
  for (const [i, profile] of profiles.entries()) {
    // Evidência determinística: um a cada 3 sintomas, alternando 1/0
    const evidence = {};
    codes.forEach((sx, j) => { if ((j + i) % 3 === 0) evidence[sx] = (j % 2); });

    assert.deepEqual(engDb.computePosterior(evidence, profile), engJs.computePosterior(evidence, profile));
    assert.deepEqual(engDb.explain(evidence, profile), engJs.explain(evidence, profile));

    const candDb = questions.candidatesFor(kbDb, profile, 'CRONICA');
    const candJs = questions.candidatesFor(kbJs, profile, 'CRONICA');
    assert.deepEqual(candDb, candJs);
    const opts = { targetThreshold: 0.5 };
    assert.deepEqual(engDb.selectNextSymptom(candDb, {}, profile, opts), engJs.selectNextSymptom(candJs, {}, profile, opts));
  }
});

// ─── seedKnowledge ──────────────────────────────────────────────────
test('seedKnowledge: upsert é idempotente e sobrescreve valor alterado', async () => {
  await freshDb();
  await prisma.condition.update({ where: { code: 'DM2' }, data: { basePrior: 0.5 } });
  const counts = await seedKnowledge(prisma); // upsert
  assert.equal(counts.conditions, 13); // 8 crônicas + 5 cânceres
  await seedKnowledge(prisma);
  assert.ok(sameKb(await createKbRepository(prisma).get(), buildFromSeed()));
});

test('seedKnowledge: rejeita base com `when` inválido sem gravar nada', async () => {
  await freshDb();
  const kb = buildFromSeed();
  kb.priorRules[0].when = [{ field: 'age', op: 'maior', value: 1 }];
  kb.conditions[0].basePrior = 0.99;
  await assert.rejects(seedKnowledge(prisma, { kb }), /inválida/);
  assert.ok(sameKb(await createKbRepository(prisma).get(), buildFromSeed()));
});

// Linhas no formato normalizado de cada tabela que hoje está vazia (ou
// só tem crônicas): prova que todas as colunas fazem ida e volta, para
// os cânceres (tarefa 5) entrarem sem mudar o seed.
const withSyntheticOncology = () => {
  const kb = buildFromSeed();
  kb.sources.push({ code: 'TESTE_SRC', citation: 'Fonte de teste', url: 'https://exemplo.org', year: 2025, note: 'nota' });
  kb.conditions.push({
    code: 'CA_TESTE', label: 'Câncer de teste', category: 'ONCOLOGICA', description: 'só para o teste',
    basePrior: 0.004, maxPrior: 0.95, alertThreshold: 0.03, watchThreshold: 0.01, sexFilter: 'male', minAge: 40,
    sortOrder: 20, active: true, sourceCode: 'TESTE_SRC',
  });
  kb.priorRules.push({
    id: 'pr:CA_TESTE:1', conditionCode: 'CA_TESTE', kind: 'RISK_FACTOR', label: 'Parente de 1º grau',
    when: [{ field: 'familyHistoryCancer', op: 'truthy' }], effect: 'multiply', amount: 1.8, modifiable: false,
    sortOrder: 1, active: true, sourceCode: 'TESTE_SRC',
  });
  kb.symptoms.push({
    code: 'sangue_teste', label: 'Sangue de teste', kind: 'QUESTION', questionText: 'Teve sangue?', help: 'ajuda',
    type: 'choice', options: [{ value: 'sim', label: 'Sim' }, { value: 'nao', label: 'Não' }], binaryThreshold: 1.5,
    cost: 2, scaleTag: null, redFlagProbe: false, showIf: [{ field: 'age', op: 'gte', value: 40 }],
    followUps: [{ id: 'x', text: 'Quando?' }], panels: ['ONCOLOGIA', 'RAPIDO'], sortOrder: 200, active: false,
  });
  kb.conditionSymptoms.push({
    id: 'cs:CA_TESTE:sangue_teste', conditionCode: 'CA_TESTE', symptomCode: 'sangue_teste',
    pSx: 0.3, pNoSx: 0.01, lrPos: null, sourceCode: 'TESTE_SRC', note: 'VPP 2,4%',
  });
  kb.labRules.push({
    id: 'lab:fit_teste', code: 'fit_teste', label: 'Sangue oculto', aliases: ['FIT', 'sangue oculto'],
    operator: 'positive', threshold: null, unit: null, sexFilter: null, minAge: 50, maxAge: 75,
    symptomCode: 'sangue_teste', weight: 1.5, emitNegative: true, maxAgeDays: 365, sortOrder: 1, active: true,
    sourceCode: 'TESTE_SRC',
  });
  kb.screeningRules.push({
    id: 'sr:CA_TESTE:1', conditionCode: 'CA_TESTE', exam: 'Colonoscopia', kind: 'POPULACIONAL',
    sexFilter: null, minAge: 50, maxAge: 75, when: [], intervalMonths: 24, recommendation: 'A cada 2 anos',
    priority: 1, active: true, sourceCode: 'TESTE_SRC',
  });
  return kb;
};

test('seedKnowledge é genérico: condição oncológica, exame e rastreamento fazem ida e volta', async () => {
  const kb = withSyntheticOncology();
  await freshDb(kb);
  const fromDb = await createKbRepository(prisma).get();
  assert.deepEqual(normalizeKb(fromDb), normalizeKb(kb));
  assert.equal(fromDb.labRules.length, buildFromSeed().labRules.length + 1);
  assert.equal(fromDb.screeningRules.length, buildFromSeed().screeningRules.length + 1);
});

// ─── kbRepository ───────────────────────────────────────────────────
test('get: cache até invalidate; versão = maior KnowledgeVersion; kb congelado', async () => {
  await freshDb();
  const repo = createKbRepository(prisma);
  const a = await repo.get();
  assert.equal(await repo.get(), a, 'segunda leitura deveria vir do cache');
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.conditions[0]));

  // Edição como a tela "Base da IA" fará: muda o valor, grava o histórico, invalida
  await prisma.condition.update({ where: { code: 'DPOC' }, data: { basePrior: 0.07 } });
  const v = await prisma.knowledgeVersion.create({
    data: { entity: 'Condition', entityId: 'DPOC', field: 'basePrior', oldValue: '0.05', newValue: '0.07' },
  });
  assert.equal((await repo.get()).version, 0, 'sem invalidate, continua no cache');
  repo.invalidate();
  const b = await repo.get();
  assert.notEqual(b, a);
  assert.equal(b.version, v.version);
  assert.equal(await repo.currentVersion(), v.version);
  assert.equal(b.conditions.find(c => c.code === 'DPOC').basePrior, 0.07);
});

test('ensureSeeded: banco vazio recebe o seed; rodar de novo não muda nada', async () => {
  await prisma.knowledgeVersion.deleteMany();
  await seedKnowledge(prisma, { kb: { sources: [] }, mode: 'replace' }); // tabelas vazias
  const repo = createKbRepository(prisma);
  assert.equal((await repo.ensureSeeded()).action, 'replace');
  assert.ok(sameKb(await repo.get(), buildFromSeed()));
  assert.equal((await repo.ensureSeeded()).action, 'none');
});

test('ensureSeeded: sem edições, base fica igual ao seed (código ganhou dados novos)', async () => {
  await freshDb();
  const repo = createKbRepository(prisma);
  const kb = withSyntheticOncology();
  assert.equal((await repo.ensureSeeded({ kb })).action, 'replace');
  assert.ok(sameKb(await repo.get(), kb));
});

test('ensureSeeded: com edição da médica, preserva a edição e só cria o que falta', async () => {
  await freshDb();
  await prisma.condition.update({ where: { code: 'DM2' }, data: { basePrior: 0.2 } });
  await prisma.knowledgeVersion.create({ data: { entity: 'Condition', entityId: 'DM2', field: 'basePrior', oldValue: '0.13', newValue: '0.2' } });
  await prisma.conditionSymptom.delete({ where: { id: buildFromSeed().conditionSymptoms[0].id } });

  const repo = createKbRepository(prisma);
  const res = await repo.ensureSeeded({ kb: withSyntheticOncology() });
  assert.equal(res.action, 'missing');
  assert.equal(res.counts.conditionSymptoms, 2); // a apagada + a do câncer de teste
  assert.equal(res.counts.conditions, 1);

  const kb = await repo.get();
  assert.equal(kb.conditions.find(c => c.code === 'DM2').basePrior, 0.2, 'edição da médica foi sobrescrita');
  assert.ok(kb.conditions.some(c => c.code === 'CA_TESTE'));
  assert.equal(kb.conditionSymptoms.length, withSyntheticOncology().conditionSymptoms.length);
});

test('resetToDefaults: volta ao seed, registra no histórico e a versão sobe', async () => {
  await freshDb();
  const repo = createKbRepository(prisma);
  await prisma.condition.update({ where: { code: 'CV' }, data: { basePrior: 0.9, active: false } });
  const edit = await prisma.knowledgeVersion.create({ data: { entity: 'Condition', entityId: 'CV', field: 'basePrior', oldValue: '0.2', newValue: '0.9' } });
  const before = await repo.get();

  const { version } = await repo.resetToDefaults({ changedBy: 'teste' });
  assert.ok(version > edit.version);
  const after = await repo.get();
  assert.notEqual(after, before, 'reset deveria invalidar o cache');
  assert.equal(after.version, version);
  assert.ok(sameKb(after, buildFromSeed()));
  assert.equal(await prisma.knowledgeVersion.count(), 2, 'o histórico de edições continua');

  // Depois do reset a base volta a ser "como saiu do seed"
  assert.equal((await repo.ensureSeeded()).action, 'none');
});

// ─── knowledgeService (tela "Base da IA") ───────────────────────────
const { createKnowledgeService } = require('../src/services/knowledgeService');
const riskEngine = require('../src/services/clinical/riskEngine');

// Ex-fumante de 67 com hemoptise: o caso que a edição deve mexer
const HEMOPTISE = {
  profile: { age: 67, sex: 'male', smoker: true, packYears: 30, quitYears: 5 },
  answers: { hemoptise: true },
};
const lungPosterior = (kb) => riskEngine.assess(kb, HEMOPTISE).oncology.find(c => c.code === 'CA_PULMAO').posterior;

const withKbEdit = async (value, fn) => {
  const old = process.env.KB_EDIT;
  if (value == null) delete process.env.KB_EDIT; else process.env.KB_EDIT = value;
  try { return await fn(); } finally { if (old == null) delete process.env.KB_EDIT; else process.env.KB_EDIT = old; }
};

test('knowledgeService.patch: transação + histórico + invalidate; versão sobe e o posterior muda', () => withKbEdit('true', async () => {
  await freshDb();
  const repo = createKbRepository(prisma);
  const svc = createKnowledgeService({ prisma, repo });
  const before = await repo.get();
  const pBefore = lungPosterior(before);

  const res = await svc.patch('condition-symptoms', 'cs:CA_PULMAO:hemoptise',
    { pSx: 0.4 }, { changedBy: 'Dra. Teste', note: 'teste' });
  // pSx e o lrPos recalculado (pSx/pNoSx), uma linha de histórico cada
  assert.deepEqual(res.changes.map(c => c.field).sort(), ['lrPos', 'pSx']);
  assert.equal(res.item.lrPos, Number((0.4 / 0.015).toFixed(2)));
  assert.equal(res.version, await repo.currentVersion());
  assert.ok(res.version > 0);

  const after = await repo.get();
  assert.notEqual(after, before, 'patch deveria invalidar o cache');
  assert.equal(after.version, res.version);
  assert.ok(lungPosterior(after) > pBefore, 'sensibilidade maior → posterior maior');

  const h = await svc.history({ limit: 10 });
  assert.equal(h.total, 2);
  assert.deepEqual(h.items.find(i => i.field === 'pSx'),
    { ...h.items.find(i => i.field === 'pSx'), entity: 'ConditionSymptom', entityId: 'cs:CA_PULMAO:hemoptise',
      oldValue: 0.2, newValue: 0.4, changedBy: 'Dra. Teste', note: 'teste' });

  // mesmo valor de novo: nada muda, versão igual
  const same = await svc.patch('condition-symptoms', 'cs:CA_PULMAO:hemoptise', { pSx: 0.4 });
  assert.equal(same.changes.length, 0);
  assert.equal(same.version, res.version);

  // LR+ direto: deriva 1 − especificidade
  const lr = await svc.patch('condition-symptoms', 'cs:CA_PULMAO:hemoptise', { lrPos: 20 });
  assert.equal(lr.item.pNoSx, 0.02);
}));

test('knowledgeService.patch: valida campo, faixa e regras entre campos sem gravar nada', () => withKbEdit('true', async () => {
  await freshDb();
  const repo = createKbRepository(prisma);
  const svc = createKnowledgeService({ prisma, repo });
  const rejects = (entity, id, changes, status = 422) =>
    assert.rejects(svc.patch(entity, id, changes), (e) => e.status === status);

  await rejects('conditions', 'CA_PULMAO', { category: 'CRONICA' });         // fora da lista
  await rejects('conditions', 'CA_PULMAO', { basePrior: 1.2 });              // prob fora de (0,1)
  await rejects('conditions', 'CA_PULMAO', { watchThreshold: 0.05 });        // atenção ≥ investigar
  await rejects('prior-rules', 'pr:CA_PULMAO:22', { amount: 0 });            // multiplicador ≤ 0
  await rejects('prior-rules', 'pr:CA_PULMAO:1', { amount: 2 });             // set fora de (0,1)
  await rejects('condition-symptoms', 'cs:CA_PULMAO:hemoptise', { lrPos: 0.1 }); // pNoSx = 2
  await rejects('condition-symptoms', 'cs:CA_PULMAO:hemoptise', { lrPos: 5, pNoSx: 0.1 });
  await rejects('screening-rules', 'sr:CA_COLORRETAL:1', { minAge: 90 });    // min > max
  await rejects('conditions', 'NAO_EXISTE', { basePrior: 0.1 }, 404);
  await rejects('conditions', 'CA_PULMAO', {});
  assert.equal(await prisma.knowledgeVersion.count(), 0, 'nada gravado');
  assert.ok(sameKb(await repo.get(), buildFromSeed()));

  const ok = await svc.patch('prior-rules', 'pr:CA_PULMAO:22', { amount: 4.2, active: true });
  assert.deepEqual(ok.changes.map(c => c.field), ['amount']);
}));

test('knowledgeService: fechado por padrão; só KB_EDIT=true libera patch e reset (403); leitura continua', async () => {
  await freshDb();
  const repo = createKbRepository(prisma);
  const svc = createKnowledgeService({ prisma, repo });
  for (const value of [null, '', 'false', '0', 'qualquer']) {
    await withKbEdit(value, async () => {
      await assert.rejects(svc.patch('conditions', 'DPOC', { basePrior: 0.07 }), (e) => e.status === 403);
      await assert.rejects(svc.reset(), (e) => e.status === 403);
      const k = await svc.getKnowledge();
      assert.equal(k.editable, false, `KB_EDIT=${value}`);
      assert.equal(k.conditions.length, 13);
    });
  }
  for (const value of ['true', 'TRUE', '1', 'yes', 'on']) {
    await withKbEdit(value, async () => assert.equal((await svc.getKnowledge()).editable, true, `KB_EDIT=${value}`));
  }
  assert.equal(await prisma.knowledgeVersion.count(), 0);
});

test('knowledgeService.reset: volta ao padrão e o posterior volta ao original', () => withKbEdit('true', async () => {
  await freshDb();
  const repo = createKbRepository(prisma);
  const svc = createKnowledgeService({ prisma, repo });
  const p0 = lungPosterior(await repo.get());
  await svc.patch('condition-symptoms', 'cs:CA_PULMAO:hemoptise', { pSx: 0.5 });
  await svc.patch('conditions', 'CA_PULMAO', { alertThreshold: 0.05 });
  assert.notEqual(lungPosterior(await repo.get()), p0);

  const { version } = await svc.reset({ changedBy: 'Dra. Teste' });
  const kb = await repo.get();
  assert.equal(kb.version, version);
  assert.ok(sameKb(kb, buildFromSeed()));
  assert.equal(lungPosterior(kb), p0);
  const h = await svc.history();
  assert.equal(h.items[0].entity, 'KB');
  assert.equal(h.items[0].field, 'reset');
  assert.equal(h.total, 4); // 2 campos do pSx/lrPos + limiar + reset
}));
