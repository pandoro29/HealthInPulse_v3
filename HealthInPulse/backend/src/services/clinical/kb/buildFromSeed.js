// ─── Base de conhecimento montada a partir do JS ────────────────────
// Junta os dados de partida (matrix.js, questions.js, data/*.js) num
// "kb" normalizado: um objeto simples, serializável em JSON, com os
// mesmos campos das tabelas do banco (ver Docs do plano, "Modelo de dados").
//
//   kb = { version, sources, conditions, priorRules, symptoms,
//          conditionSymptoms, labRules, screeningRules }
//
// O mesmo formato sai do banco (kbRepository, tarefa 3), então o motor
// (bayes.createEngine) não sabe de onde o kb veio.
//
// Regras do formato:
//   - chaves estrangeiras por código (conditionCode, symptomCode, sourceCode);
//   - `when`/`showIf`/`options`/`panels`/`aliases`/`followUps` são valores
//     JS (listas/objetos), nunca strings JSON;
//   - campo ausente vira null (ou o default da tabela), para o kb do JS
//     e o do banco poderem ser comparados com deepEqual;
//   - os ids são gerados aqui, de forma determinística.

const { CONDITIONS } = require('../matrix');
const { SYMPTOM_QUESTIONS } = require('../questions');
const { priorRules: chronicPriorRules } = require('../data/chronicPriorRules');
const chronicCatalog = require('../data/chronicCatalog');

const CHRONIC_SOURCE = 'HIP_MATRIZ_V7';

// ─── Normalizadores (um por tabela) ─────────────────────────────────
const nn = (v) => (v === undefined ? null : v);

const normSource = (s) => ({
  code:     s.code,
  citation: s.citation,
  url:      nn(s.url),
  year:     nn(s.year),
  note:     nn(s.note),
});

const normCondition = (c) => ({
  code:           c.code,
  label:          c.label,
  category:       c.category,
  description:    nn(c.description),
  basePrior:      c.basePrior,
  maxPrior:       c.maxPrior ?? 0.95,
  alertThreshold: nn(c.alertThreshold),
  watchThreshold: nn(c.watchThreshold),
  sexFilter:      nn(c.sexFilter),
  minAge:         nn(c.minAge),
  sortOrder:      c.sortOrder ?? 0,
  active:         c.active ?? true,
  sourceCode:     nn(c.sourceCode),
});

const normPriorRule = (r, id) => ({
  id,
  conditionCode: r.conditionCode,
  kind:          r.kind ?? 'ADJUST',
  label:         r.label,
  when:          r.when ?? [],
  effect:        r.effect,
  amount:        r.amount,
  modifiable:    r.modifiable ?? false,
  sortOrder:     r.sortOrder ?? 0,
  active:        r.active ?? true,
  sourceCode:    nn(r.sourceCode),
});

const normSymptom = (s) => ({
  code:            s.code,
  label:           s.label ?? s.code,
  kind:            s.kind ?? 'QUESTION',
  questionText:    nn(s.questionText),
  help:            nn(s.help),
  type:            s.type ?? 'boolean',
  options:         nn(s.options),
  binaryThreshold: nn(s.binaryThreshold),
  cost:            s.cost ?? 1,
  scaleTag:        nn(s.scaleTag),
  redFlagProbe:    s.redFlagProbe ?? false,
  showIf:          nn(s.showIf),
  followUps:       s.followUps ?? [],
  panels:          s.panels ?? [],
  sortOrder:       s.sortOrder ?? 0,
  active:          s.active ?? true,
});

const normConditionSymptom = (cs) => ({
  id:            cs.id ?? `cs:${cs.conditionCode}:${cs.symptomCode}`,
  conditionCode: cs.conditionCode,
  symptomCode:   cs.symptomCode,
  pSx:           cs.pSx,
  pNoSx:         cs.pNoSx,
  lrPos:         nn(cs.lrPos),
  sourceCode:    nn(cs.sourceCode),
  note:          nn(cs.note),
});

const normLabRule = (r) => ({
  id:           r.id ?? `lab:${r.code}`,
  code:         r.code,
  label:        r.label,
  aliases:      r.aliases ?? [],
  operator:     r.operator,
  threshold:    nn(r.threshold),
  unit:         nn(r.unit),
  sexFilter:    nn(r.sexFilter),
  minAge:       nn(r.minAge),
  maxAge:       nn(r.maxAge),
  symptomCode:  r.symptomCode,
  weight:       r.weight ?? 1,
  emitNegative: r.emitNegative ?? false,
  maxAgeDays:   r.maxAgeDays ?? 365,
  sortOrder:    r.sortOrder ?? 0,
  active:       r.active ?? true,
  sourceCode:   nn(r.sourceCode),
});

const normScreeningRule = (r, id) => ({
  id,
  conditionCode:  r.conditionCode,
  exam:           r.exam,
  kind:           r.kind,
  sexFilter:      nn(r.sexFilter),
  minAge:         nn(r.minAge),
  maxAge:         nn(r.maxAge),
  when:           r.when ?? [],
  intervalMonths: nn(r.intervalMonths),
  recommendation: r.recommendation,
  priority:       r.priority ?? 0,
  active:         r.active ?? true,
  sourceCode:     nn(r.sourceCode),
});

// Ids determinísticos por condição: pr:AOS:1, pr:AOS:2, ... (ordem de entrada)
const numberPerCondition = (prefix) => {
  const count = new Map();
  return (conditionCode) => {
    const n = (count.get(conditionCode) ?? 0) + 1;
    count.set(conditionCode, n);
    return `${prefix}:${conditionCode}:${n}`;
  };
};

// ─── Crônicas (v7) ──────────────────────────────────────────────────
const chronicSeed = () => {
  const { symptomLabels, wearableSymptoms } = chronicCatalog;

  const conditions = Object.values(CONDITIONS).map((c, i) => ({
    code:       c.code,
    label:      c.label,
    category:   'CRONICA',
    basePrior:  c.basePrior,
    maxPrior:   0.95,
    sortOrder:  i + 1,
    sourceCode: CHRONIC_SOURCE,
  }));

  // A ordem dos sintomas segue SYMPTOM_QUESTIONS: em empate de score, a
  // pergunta que vem primeiro vence (o golden confere a ordem).
  const symptoms = SYMPTOM_QUESTIONS.map((q, i) => ({
    code:            q.symptom,
    label:           symptomLabels[q.symptom],
    kind:            'QUESTION',
    questionText:    q.text,
    type:            q.type,
    options:         q.options,
    binaryThreshold: q.binaryThreshold,
    cost:            q.cost,
    scaleTag:        q.scaleTag,
    redFlagProbe:    q.redFlagProbe,
    showIf:          q.showIf,
    followUps:       q.followUps,
    panels:          ['CRONICA'],
    sortOrder:       i + 1,
  }));

  // Sintomas da matriz que não têm pergunta própria (exame físico,
  // pulseira, follow-up): entram sem painel, então nunca viram pergunta.
  const asked = new Set(symptoms.map(s => s.code));
  const conditionSymptoms = [];
  for (const c of Object.values(CONDITIONS)) {
    for (const [symptomCode, def] of Object.entries(c.symptoms)) {
      conditionSymptoms.push({
        conditionCode: c.code,
        symptomCode,
        pSx:   def.pSx,
        pNoSx: def.pNoSx,
        lrPos: def.lrPos,
        sourceCode: CHRONIC_SOURCE,
      });
      if (!asked.has(symptomCode)) {
        asked.add(symptomCode);
        symptoms.push({
          code:      symptomCode,
          label:     symptomLabels[symptomCode],
          kind:      wearableSymptoms.includes(symptomCode) ? 'WEARABLE' : 'LAB',
          panels:    [],
          sortOrder: 100 + symptoms.length,
        });
      }
    }
  }

  return {
    sources: chronicCatalog.sources,
    conditions,
    priorRules: chronicPriorRules,
    symptoms,
    conditionSymptoms,
    labRules: [],
    screeningRules: [],
  };
};

// ─── Montagem ───────────────────────────────────────────────────────
// Junta lotes de dados crus (formato de data/oncology.js) num kb só.
// Sintoma repetido entre lotes (ex.: perda de peso, que é crônica e
// oncológica) mantém a primeira definição (texto, custo, showIf,
// sortOrder: a fase crônica não muda) e soma os painéis. Só vale para o
// MESMO tipo de sintoma: se um lote declara como pergunta um código que
// outro declarou como exame/pulseira, a primeira definição esconderia a
// pergunta (sem questionText), então é erro de dado.
const assemble = (batches) => {
  const kb = {
    version: 0, // kb do JS; o do banco usa o número da KnowledgeVersion
    sources: [], conditions: [], priorRules: [], symptoms: [],
    conditionSymptoms: [], labRules: [], screeningRules: [],
  };
  const prId = numberPerCondition('pr');
  const srId = numberPerCondition('sr');
  const sourceCodes  = new Set();
  const symptomByCode = new Map();

  for (const b of batches) {
    for (const s of b.sources ?? []) {
      if (sourceCodes.has(s.code)) continue;
      sourceCodes.add(s.code);
      kb.sources.push(normSource(s));
    }
    for (const c of b.conditions ?? []) {
      if (kb.conditions.some(x => x.code === c.code)) throw new Error(`Condição duplicada no kb: ${c.code}`);
      kb.conditions.push(normCondition(c));
    }
    for (const r of b.priorRules ?? []) kb.priorRules.push(normPriorRule(r, prId(r.conditionCode)));
    for (const s of b.symptoms ?? []) {
      const prev = symptomByCode.get(s.code);
      if (prev) {
        const kind = s.kind ?? 'QUESTION';
        if (prev.kind !== kind) {
          throw new Error(`Sintoma ${s.code} declarado com tipos diferentes (${prev.kind} e ${kind})`);
        }
        for (const p of s.panels ?? []) if (!prev.panels.includes(p)) prev.panels.push(p);
        continue;
      }
      const sym = normSymptom(s);
      symptomByCode.set(sym.code, sym);
      kb.symptoms.push(sym);
    }
    for (const cs of b.conditionSymptoms ?? []) kb.conditionSymptoms.push(normConditionSymptom(cs));
    for (const r of b.labRules ?? []) kb.labRules.push(normLabRule(r));
    for (const r of b.screeningRules ?? []) kb.screeningRules.push(normScreeningRule(r, srId(r.conditionCode)));
  }
  return kb;
};

// buildFromSeed() → 8 crônicas (v7) + 5 cânceres (data/oncology.js).
// buildFromSeed({ includeOncology: false }) → só as crônicas (testes do v7).
// Devolve sempre um objeto novo, que pode ser alterado à vontade.
const buildFromSeed = ({ includeOncology = true } = {}) => {
  const batches = [chronicSeed()];
  if (includeOncology) {
    batches.push(require('../data/oncology'));
    // Fontes das faixas normais e das metas (data/prevention.js)
    batches.push({ sources: require('../data/prevention').sources });
  }
  // structuredClone corta referências aos arrays do seed (followUps,
  // options, when...): mexer no kb não mexe em questions.js nem nos dados.
  return structuredClone(assemble(batches));
};

// kb do JS compartilhado pelos wrappers antigos (bayes.computePosterior,
// questions.candidatesForProfile...). Congelado: quem precisa alterar
// monta o seu com buildFromSeed().
let seedKb = null;
const getSeedKb = () => {
  if (!seedKb) seedKb = deepFreeze(buildFromSeed());
  return seedKb;
};

const deepFreeze = (o) => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

module.exports = { buildFromSeed, getSeedKb };
