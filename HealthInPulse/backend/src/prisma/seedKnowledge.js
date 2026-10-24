// ─── Seed da base de conhecimento clínico ───────────────────────────
// Grava no banco o kb montado do JS (services/clinical/kb/buildFromSeed.js):
// fontes, condições, regras de prior, sintomas, likelihoods, regras de
// exame e de rastreamento. É genérico sobre as tabelas (kb/kbTables.js):
// o que o buildFromSeed devolver (crônicas hoje, + cânceres depois) entra
// sem mudar este arquivo.
//
// Modos:
//   upsert   (padrão) cria ou sobrescreve cada linha pelo código/id.
//            Linhas que não estão no seed ficam como estão.
//   missing  só cria o que falta; não toca no que já existe (preserva
//            o que a médica editou). Usado pelo ensureSeeded.
//   replace  apaga a base inteira e grava o seed: banco == seed.
//            Usado pelo resetToDefaults. Não mexe no histórico
//            (KnowledgeVersion).
//
// Uso direto: node src/prisma/seedKnowledge.js [--missing | --replace]

const { buildFromSeed } = require('../services/clinical/kb/buildFromSeed');
const { KB_TABLES, toRow } = require('../services/clinical/kb/kbTables');
const { validateWhen } = require('../services/clinical/kb/conditions');

const MODES = ['upsert', 'missing', 'replace'];
const EFFECTS = ['set', 'add', 'multiply'];

// Erro de dado no seed vira erro antes de gravar, não regra que nunca
// dispara (ou que derruba o motor no meio de uma triagem).
const validateKb = (kb) => {
  const errors = [];
  for (const r of kb.priorRules ?? []) {
    for (const e of validateWhen(r.when)) errors.push(`PriorRule ${r.id}: ${e}`);
    if (!EFFECTS.includes(r.effect)) errors.push(`PriorRule ${r.id}: efeito desconhecido "${r.effect}"`);
  }
  for (const r of kb.screeningRules ?? []) {
    for (const e of validateWhen(r.when)) errors.push(`ScreeningRule ${r.id}: ${e}`);
  }
  for (const s of kb.symptoms ?? []) {
    for (const e of validateWhen(s.showIf)) errors.push(`Symptom ${s.code}: showIf: ${e}`);
  }
  return errors;
};

// Grava o kb usando `db` (o client ou um `tx` de transação). Devolve
// quantas linhas de cada lista foram gravadas.
const writeKb = async (db, kb, mode = 'upsert') => {
  if (!MODES.includes(mode)) throw new Error(`seedKnowledge: modo desconhecido "${mode}"`);
  const errors = validateKb(kb);
  if (errors.length) throw new Error(`Base de conhecimento inválida:\n  ${errors.join('\n  ')}`);

  if (mode === 'replace') {
    for (const t of [...KB_TABLES].reverse()) await db[t.model].deleteMany();
  }

  const counts = {};
  for (const t of KB_TABLES) {
    const rows = (kb[t.key] ?? []).map(item => toRow(t, item));

    if (mode === 'upsert') {
      for (const row of rows) {
        const { [t.id]: key, ...rest } = row;
        await db[t.model].upsert({ where: { [t.id]: key }, create: row, update: rest });
      }
      counts[t.key] = rows.length;
      continue;
    }

    let toCreate = rows;
    if (mode === 'missing') {
      const existing = new Set((await db[t.model].findMany({ select: { [t.id]: true } })).map(r => r[t.id]));
      toCreate = rows.filter(r => !existing.has(r[t.id]));
    }
    if (toCreate.length) await db[t.model].createMany({ data: toCreate });
    counts[t.key] = toCreate.length;
  }
  return counts;
};

// Tudo numa transação: ou a base inteira entra, ou nada muda.
const seedKnowledge = (prisma, { kb = buildFromSeed(), mode = 'upsert' } = {}) =>
  prisma.$transaction((tx) => writeKb(tx, kb, mode), { maxWait: 10_000, timeout: 60_000 });

module.exports = { seedKnowledge, writeKb, validateKb, MODES };

// ─── CLI ────────────────────────────────────────────────────────────
if (require.main === module) {
  require('dotenv').config({ path: require('node:path').join(__dirname, '..', '..', '.env') });
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const mode = process.argv.includes('--replace') ? 'replace'
    : process.argv.includes('--missing') ? 'missing' : 'upsert';
  seedKnowledge(prisma, { mode })
    .then((counts) => console.log(`🧠 Base de conhecimento (${mode}):`, counts))
    .catch((err) => { console.error(err); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
}
