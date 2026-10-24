// ─── Tabelas do kb no banco ─────────────────────────────────────────
// Mapa entre o kb normalizado (buildFromSeed) e os models do Prisma.
// Uma entrada por lista do kb, na ordem em que as linhas podem ser
// gravadas sem quebrar chave estrangeira (pais antes dos filhos). Para
// apagar, a ordem é a inversa.
//
//   key:     nome da lista no kb (kb.sources, kb.conditions, ...)
//   model:   delegate do Prisma (prisma.clinicalSource, ...)
//   id:      chave primária (código ou id determinístico do buildFromSeed)
//   json:    campos que no kb são listas/objetos e no banco são String
//   omit:    colunas do banco que não fazem parte do kb
//   orderBy: ordem de leitura. O motor não depende dela (ordena por
//            sortOrder onde importa), mas uma ordem fixa deixa o kb
//            do banco reproduzível.

const { isDeepStrictEqual } = require('node:util');
const { parseJson, stringifyJson } = require('../../../utils/jsonField');

const KB_TABLES = [
  {
    key: 'sources', model: 'clinicalSource', id: 'code', json: [],
    orderBy: [{ code: 'asc' }],
  },
  {
    key: 'conditions', model: 'condition', id: 'code', json: [], omit: ['updatedAt'],
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  },
  {
    key: 'symptoms', model: 'symptom', id: 'code', json: ['options', 'showIf', 'followUps', 'panels'],
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  },
  {
    key: 'priorRules', model: 'priorRule', id: 'id', json: ['when'],
    orderBy: [{ condition: { sortOrder: 'asc' } }, { sortOrder: 'asc' }, { id: 'asc' }],
  },
  {
    key: 'conditionSymptoms', model: 'conditionSymptom', id: 'id', json: [],
    orderBy: [{ condition: { sortOrder: 'asc' } }, { symptomCode: 'asc' }],
  },
  {
    key: 'labRules', model: 'labRule', id: 'id', json: ['aliases'],
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  },
  {
    key: 'screeningRules', model: 'screeningRule', id: 'id', json: ['when'],
    orderBy: [{ condition: { sortOrder: 'asc' } }, { priority: 'asc' }, { id: 'asc' }],
  },
];

// kb → linha do banco: listas/objetos viram JSON em String
const toRow = (table, item) => {
  const row = { ...item };
  for (const f of table.json) row[f] = stringifyJson(item[f]);
  return row;
};

// linha do banco → kb: JSON volta a ser valor JS, colunas extras saem
const fromRow = (table, row) => {
  const item = { ...row };
  for (const f of table.omit ?? []) delete item[f];
  for (const f of table.json) item[f] = parseJson(row[f], null);
  return item;
};

// ─── Comparação ─────────────────────────────────────────────────────
// Forma canônica para comparar dois kb (o do JS e o do banco): cada
// lista ordenada pela chave primária, sem o número da versão.
const byKey = (k) => (a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0);

const normalizeKb = (kb) => {
  const out = {};
  for (const t of KB_TABLES) out[t.key] = [...(kb[t.key] ?? [])].sort(byKey(t.id));
  return out;
};

const sameKb = (a, b) => isDeepStrictEqual(normalizeKb(a), normalizeKb(b));

module.exports = { KB_TABLES, toRow, fromRow, normalizeKb, sameKb };
