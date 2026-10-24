// ─── Base de conhecimento lida do banco ─────────────────────────────
// O motor (bayes.createEngine) recebe o kb daqui em produção. O formato
// é o mesmo do buildFromSeed (tests/kb.db.test.js confere), então o motor
// não sabe de onde o kb veio.
//
//   get()              kb do banco, em cache até o próximo invalidate().
//                      kb.version = maior KnowledgeVersion.version (0 sem edições).
//   invalidate()       descarta o cache (chamar depois de editar a base).
//   currentVersion()   versão atual lida do banco, sem montar o kb.
//   ensureSeeded()     no start do servidor: garante que a base existe.
//   resetToDefaults()  volta a base para os valores de partida do JS.
//
// O módulo exporta uma instância sobre o Prisma do app (config/database)
// e a fábrica createKbRepository(prisma), usada nos testes com outro banco.

const { buildFromSeed } = require('./buildFromSeed');
const { KB_TABLES, fromRow, sameKb } = require('./kbTables');
const { seedKnowledge, writeKb } = require('../../../prisma/seedKnowledge');

// Linha do histórico gravada pelo resetToDefaults
const RESET = { entity: 'KB', field: 'reset' };

const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

const createKbRepository = (prisma) => {
  // Guarda a promessa: chamadas simultâneas no start dividem a mesma leitura
  let cache = null;

  const currentVersion = async () => {
    const agg = await prisma.knowledgeVersion.aggregate({ _max: { version: true } });
    return agg._max.version ?? 0;
  };

  // Leitura atômica: versão e as 7 tabelas no mesmo instantâneo (uma
  // transação). Sem isso, uma edição gravada no meio da leitura daria um
  // kb com a versão antiga e parte dos valores novos (ou o contrário).
  const load = async () => {
    const [agg, ...lists] = await prisma.$transaction([
      prisma.knowledgeVersion.aggregate({ _max: { version: true } }),
      ...KB_TABLES.map(t => prisma[t.model].findMany({ orderBy: t.orderBy })),
    ]);
    const kb = { version: agg._max.version ?? 0 };
    KB_TABLES.forEach((t, i) => { kb[t.key] = lists[i].map(row => fromRow(t, row)); });
    // Compartilhado entre requisições: congelado para ninguém alterar sem querer
    return deepFreeze(kb);
  };

  const get = () => {
    if (!cache) {
      const p = load();
      cache = p;
      p.catch(() => { if (cache === p) cache = null; }); // falhou: tenta de novo na próxima
    }
    return cache;
  };

  const invalidate = () => { cache = null; };

  // A base está "como saiu do seed" se ninguém a editou desde o último
  // reset: sem histórico, ou a última linha é o próprio reset.
  const isPristine = async () => {
    const last = await prisma.knowledgeVersion.findFirst({ orderBy: { version: 'desc' } });
    return !last || (last.entity === RESET.entity && last.field === RESET.field);
  };

  // No start do servidor:
  //  - base sem edições da médica: fica igual ao seed do JS (banco novo,
  //    ou código que ganhou dados novos, como os cânceres);
  //  - base editada: só cria o que falta; o que a médica mudou fica.
  // Devolve { action: 'none' | 'replace' | 'missing', counts }.
  const ensureSeeded = async ({ kb = buildFromSeed() } = {}) => {
    let result;
    if (await isPristine()) {
      result = sameKb(await load(), kb)
        ? { action: 'none', counts: {} }
        : { action: 'replace', counts: await seedKnowledge(prisma, { kb, mode: 'replace' }) };
    } else {
      result = { action: 'missing', counts: await seedKnowledge(prisma, { kb, mode: 'missing' }) };
    }
    invalidate();
    return result;
  };

  // Apaga a base e grava os valores de partida, numa transação só, e
  // registra o reset no histórico: a versão sobe (nunca volta atrás), então
  // quem memoriza o motor por versão percebe a mudança.
  const resetToDefaults = async ({ changedBy = null, note = 'Base restaurada para os valores de partida', kb = buildFromSeed() } = {}) => {
    const entry = await prisma.$transaction(async (tx) => {
      await writeKb(tx, kb, 'replace');
      return tx.knowledgeVersion.create({ data: { ...RESET, note, changedBy } });
    }, { maxWait: 10_000, timeout: 60_000 });
    invalidate();
    return { version: entry.version };
  };

  return { get, invalidate, currentVersion, ensureSeeded, resetToDefaults };
};

// ─── Instância do app (criada no primeiro uso) ──────────────────────
let appRepo = null;
const repo = () => {
  if (!appRepo) appRepo = createKbRepository(require('../../../config/database'));
  return appRepo;
};

module.exports = {
  createKbRepository,
  RESET,
  get:             (...a) => repo().get(...a),
  invalidate:      (...a) => repo().invalidate(...a),
  currentVersion:  (...a) => repo().currentVersion(...a),
  ensureSeeded:    (...a) => repo().ensureSeeded(...a),
  resetToDefaults: (...a) => repo().resetToDefaults(...a),
};
