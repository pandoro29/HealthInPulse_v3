#!/usr/bin/env node
// ─── Captura do golden do motor clínico v7 ──────────────────────────
// Roda o motor ATUAL numa bateria fixa de casos e grava o resultado em
// tests/fixtures/golden-v7.json. O teste engine.golden.test.js confere
// o motor contra esse arquivo, e é isso que prova que a refatoração
// (motor parametrizado pelo banco) não mudou nenhum número.
//
//   node scripts/capture-golden.js            (a partir de backend/)
//
// Rodou uma vez, antes da refatoração; o JSON gerado está no git.
// Rodar de novo depois da refatoração NÃO vale como prova de nada.
//
// Determinístico: PRNG mulberry32 com semente fixa, sem data nem
// Math.random. Rodar duas vezes gera o mesmo arquivo, byte a byte.

const fs   = require('fs');
const path = require('path');

const { CONDITIONS, allSymptoms } = require('../src/services/clinical/matrix');
const { SYMPTOM_QUESTIONS }       = require('../src/services/clinical/questions');
const harness = require('../tests/helpers/engineV7Harness');

const SEED     = 20261024; // dia da feira
const OUT_FILE = path.join(__dirname, '..', 'tests', 'fixtures', 'golden-v7.json');

// ─── PRNG ───────────────────────────────────────────────────────────
const mulberry32 = (seed) => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rnd     = mulberry32(SEED);
const int     = (min, max) => min + Math.floor(rnd() * (max - min + 1));
const pick    = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance  = (p) => rnd() < p;
const round1  = (x) => Math.round(x * 10) / 10;

// IMC como o triageService v7 calcula (computeBmi)
const bmiOf = (heightCm, weightKg) => Number((weightKg / ((heightCm / 100) ** 2)).toFixed(1));

const randomProfile = () => {
  const height = int(150, 195);
  const weight = round1(50 + rnd() * 80);
  const smoker = chance(0.3);
  const profile = {
    age:             int(18, 90),
    sex:             pick(['male', 'female']),
    height,
    weight,
    bmi:             bmiOf(height, weight),
    familyHistoryDm: chance(0.3),
    familyHistoryCv: chance(0.25),
    smoker,
  };
  if (smoker) profile.packYears = round1(1 + rnd() * 39);
  return profile;
};

// ─── 1. Priors numa grade de perfis ─────────────────────────────────
// Valores nas bordas de cada regra do priorAdjust (> 40, > 45, > 50,
// > 60, > 65, IMC ≥ 30, maços-ano ≥ 10) e campos ausentes/nulos.
const AGES    = [undefined, null, 25, 40, 41, 45, 46, 50, 51, 60, 61, 65, 66, 80];
const SEXES   = [undefined, 'male', 'female'];
const BMIS    = [undefined, 29.9, 30];
const SMOKING = [{}, { smoker: true }, { smoker: true, packYears: 10 }, { smoker: false, packYears: 10 }];
const FAM_DM  = [undefined, true];

const definedOnly = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

const buildPriors = () => {
  const out = [];
  for (const age of AGES) for (const sex of SEXES) for (const bmi of BMIS)
    for (const smoking of SMOKING) for (const familyHistoryDm of FAM_DM) {
      const profile = definedOnly({ age, sex, bmi, ...smoking, familyHistoryDm });
      out.push({ profile, priors: harness.priorCase(profile) });
    }
  return out;
};

// ─── 1b. Candidatas a pergunta (ordem, custo, tipo, filtro showIf) ──
const CANDIDATE_PROFILES = [
  {},
  { age: 30, sex: 'male', smoker: false },
  { age: 30, sex: 'female', smoker: false },
  { age: 70, sex: 'female', smoker: true, packYears: 20 },
];

const buildCandidates = () =>
  CANDIDATE_PROFILES.map(profile => ({ profile, candidates: harness.candidatesCase(profile) }));

// ─── 2. Posteriores de evidências pseudoaleatórias ──────────────────
// Inclui follow-ups (que nenhuma condição enxerga), evidência ponderada
// da pulseira ({ value, weight }) e valores fora de 0/1 (ignorados).
const EVIDENCE_KEYS = [...allSymptoms(), 'sudorese_noturna', 'irradiacao_braco_mandibula'];

const randomEvidenceValue = () => {
  const r = rnd();
  if (r < 0.75) return chance(0.5) ? 1 : 0;
  if (r < 0.93) return { value: chance(0.7) ? 1 : 0, weight: pick([0, 0.5, 1, 2, 3]) };
  if (r < 0.97) return { value: 1 };            // weight ausente → 1
  return pick([2, '1']);                        // ignorado pelo motor
};

const randomEvidence = (n) => {
  const ev = {};
  while (Object.keys(ev).length < n) ev[pick(EVIDENCE_KEYS)] = randomEvidenceValue();
  return ev;
};

const N_POSTERIORS = 80;
const buildPosteriors = () => {
  const out = [];
  for (let i = 0; i < N_POSTERIORS; i++) {
    const profile  = randomProfile();
    const evidence = randomEvidence(i % 10 === 0 ? 0 : int(1, 14));
    out.push({ id: i, profile, evidence, ...harness.posteriorCase(profile, evidence) });
  }
  return out;
};

// ─── 3. Sessões simuladas ───────────────────────────────────────────
// Cada sessão tem uma "doença latente" (ou nenhuma) e um gabarito com a
// resposta de TODAS as perguntas; o motor escolhe a ordem. Respostas
// sim/não seguem o pSx da doença latente (ou a média do pNoSx).
const CONDITION_CODES = Object.keys(CONDITIONS);
const LATENTS = [...CONDITION_CODES, null];

// Snapshots de pulseira no formato que o wearable.toBayesianEvidence v7 gera
const WEARABLE_EVIDENCE = [
  { apneia_observada: { value: 1, weight: 3 }, ronco_alto: { value: 1, weight: 1 } },
  { has_conhecida: { value: 1, weight: 2 } },
  { palpitacoes_paroxisticas: { value: 1, weight: 3 }, palpitacoes: { value: 1, weight: 2 } },
  { fadiga_diurna: { value: 1, weight: 1 }, has_conhecida: { value: 1, weight: 1 } },
];

const baselineYes = (sx) => {
  const defs = Object.values(CONDITIONS).map(c => c.symptoms[sx]).filter(Boolean);
  if (defs.length === 0) return 0.1;
  return defs.reduce((s, d) => s + d.pNoSx, 0) / defs.length;
};

const boolAnswer = (yes, asText) => (asText ? (yes ? 'Sim' : 'Não') : (yes ? 1 : 0));

const buildAnswerSheet = (latent, { allowIdeation, asText }) => {
  const sheet = {};
  for (const q of SYMPTOM_QUESTIONS) {
    if (q.redFlagProbe) continue;
    const def = latent && CONDITIONS[latent].symptoms[q.symptom];
    let yes = chance(def ? def.pSx : baselineYes(q.symptom));
    if (q.symptom === 'phq9_ideacao_morte' && !allowIdeation) yes = false;

    let value;
    if (q.type === 'likert') value = yes ? pick([2, 3]) : (q.symptom === 'phq9_ideacao_morte' ? 0 : pick([0, 1]));
    else value = boolAnswer(yes, asText);

    const entry = { value };
    // Follow-ups só vão junto quando a resposta principal é "sim" (como o frontend faz)
    if (yes && q.followUps?.length) {
      entry.followUps = q.followUps.map(fu => ({
        id: fu.id,
        value: asText ? chance(0.3) : (chance(0.3) ? 1 : 0),
      }));
    }
    sheet[q.symptom] = entry;
  }
  return sheet;
};

const N_SESSIONS = 25;
const buildSessions = () => {
  const out = [];
  for (let i = 0; i < N_SESSIONS; i++) {
    const latent  = LATENTS[i % LATENTS.length];
    const profile = randomProfile();
    const initialEvidence = i % 4 === 1 ? pick(WEARABLE_EVIDENCE) : {};
    // Pulseira só para os red flags: um caso dispara SpO₂ < 90 logo no início
    let wearable = null;
    if (i === 7)  wearable = { hasData: true, restingSpO2: 88, restingHr: 72 };
    if (i === 13) wearable = { hasData: true, restingSpO2: 96, restingHr: 120, glucose: 200 };

    const answerSheet = buildAnswerSheet(latent, {
      allowIdeation: i === 5 || i === 14,
      asText:        i % 5 === 4,             // respostas como "Sim"/"Não"/true/false
    });
    const session = { id: i, latent, profile, initialEvidence, wearable, answerSheet };
    out.push({ ...session, expected: harness.simulateSession(session) });
  }
  return out;
};

// ─── 4. Red flags ───────────────────────────────────────────────────
const HANDWRITTEN_RED_FLAGS = [
  { answers: {}, wearable: null },
  { answers: { dor_toracica_tipica: 1 } },
  { answers: { dor_toracica_tipica: 1, irradiacao_braco_mandibula: 1 } },
  { answers: { dor_toracica_tipica: 'Sim', sudorese_fria: 'sim' } },
  { answers: { dor_toracica_tipica: 0, irradiacao_braco_mandibula: 1, sudorese_fria: 1 } },
  { answers: { deficit_neurologico_subito: true } },
  { answers: { cefaleia_pior_da_vida: '1' } },
  { answers: { cefaleia_pior_da_vida: 'Não' } },
  { answers: {}, wearable: { restingSpO2: 89 } },
  { answers: {}, wearable: { restingSpO2: 90 } },
  { answers: {}, wearable: { restingHr: 151 } },
  { answers: {}, wearable: { restingHr: 150 } },
  { answers: {}, wearable: { glucose: 351 } },
  { answers: {}, wearable: { glucose: 350 } },
  { answers: { phq9_ideacao_morte: 0 } },
  { answers: { phq9_ideacao_morte: 1 } },
  { answers: { phq9_ideacao_morte: '0' } },
  { answers: { phq9_ideacao_morte: '2' } },
  { answers: { phq9_ideacao_morte: null } },
  { answers: { sincope: 1, sincope_durante_esforco: 1 } },
  { answers: { sincope: 1, sincope_durante_esforco: 0 } },
  { answers: { perda_peso_inexplicada: 1, sudorese_noturna: 1 } },
  { answers: { perda_peso_inexplicada: 1, sudorese_noturna: 'nao' } },
  // Ordem de prioridade: o primeiro da lista vence
  { answers: { perda_peso_inexplicada: 1, sudorese_noturna: 1, sincope: 1, sincope_durante_esforco: 1 } },
  { answers: { phq9_ideacao_morte: 3, dor_toracica_tipica: 1, sudorese_fria: 1 }, wearable: { glucose: 400 } },
  { answers: { cefaleia_pior_da_vida: 1 }, wearable: { restingSpO2: 80, restingHr: 170 } },
];

const RF_ANSWER_KEYS = [
  'dor_toracica_tipica', 'irradiacao_braco_mandibula', 'sudorese_fria',
  'deficit_neurologico_subito', 'cefaleia_pior_da_vida', 'phq9_ideacao_morte',
  'sincope', 'sincope_durante_esforco', 'perda_peso_inexplicada', 'sudorese_noturna',
];
const RF_VALUES = [1, 0, '1', '0', true, false, 'Sim', 'sim', 'Não', null, 2];

const randomRedFlagInput = () => {
  const answers = {};
  for (const key of RF_ANSWER_KEYS) if (chance(0.2)) answers[key] = pick(RF_VALUES);
  const wearable = {};
  if (chance(0.15)) wearable.restingSpO2 = int(85, 99);
  if (chance(0.15)) wearable.restingHr   = int(60, 170);
  if (chance(0.15)) wearable.glucose     = int(80, 420);
  return { answers, wearable: Object.keys(wearable).length ? wearable : null };
};

const N_RANDOM_RED_FLAGS = 40;
const buildRedFlags = () => {
  const inputs = [
    ...HANDWRITTEN_RED_FLAGS.map(c => ({ answers: c.answers, wearable: c.wearable ?? null })),
    ...Array.from({ length: N_RANDOM_RED_FLAGS }, randomRedFlagInput),
  ];
  return {
    definitions: harness.redFlagDefinitions(),
    cases: inputs.map((input, id) => ({ id, ...input, expected: harness.redFlagCase(input) })),
  };
};

// ─── Gravação ───────────────────────────────────────────────────────
// Um caso por linha: o arquivo fica legível e o diff, localizado.
const formatGolden = (golden) => {
  const parts = Object.entries(golden).map(([key, value]) => {
    if (Array.isArray(value)) {
      return `  ${JSON.stringify(key)}: [\n${value.map(v => `    ${JSON.stringify(v)}`).join(',\n')}\n  ]`;
    }
    if (value && Array.isArray(value.cases)) {
      const inner = Object.entries(value).map(([k, v]) => Array.isArray(v)
        ? `    ${JSON.stringify(k)}: [\n${v.map(x => `      ${JSON.stringify(x)}`).join(',\n')}\n    ]`
        : `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
      return `  ${JSON.stringify(key)}: {\n${inner.join(',\n')}\n  }`;
    }
    return `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`;
  });
  return `{\n${parts.join(',\n')}\n}\n`;
};

const main = () => {
  const golden = {
    meta: {
      engine:      'v7',
      generatedBy: 'backend/scripts/capture-golden.js',
      seed:        SEED,
      tolerance:   1e-12,
      conditions:  CONDITION_CODES,
      stopOpts:    harness.STOP_OPTS,
      selectOpts:  harness.SELECT_OPTS,
    },
    priors:     buildPriors(),
    candidates: buildCandidates(),
    posteriors: buildPosteriors(),
    sessions:   buildSessions(),
    redFlags:   buildRedFlags(),
  };

  // Garante que o JSON volta idêntico (nada de undefined/NaN perdido)
  const text = formatGolden(golden);
  const back = JSON.stringify(JSON.parse(text));
  if (back !== JSON.stringify(golden)) throw new Error('golden não sobrevive ao JSON.parse');

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, text);

  const outcomes = {};
  for (const s of golden.sessions) {
    const k = s.expected.stopReason || s.expected.redFlag?.code || s.expected.outcome;
    outcomes[k] = (outcomes[k] || 0) + 1;
  }
  console.log(`golden gravado em ${path.relative(process.cwd(), OUT_FILE)}`);
  console.log(`  priors: ${golden.priors.length} perfis · posteriores: ${golden.posteriors.length}`
    + ` · sessões: ${golden.sessions.length} · red flags: ${golden.redFlags.cases.length}`);
  console.log(`  desfecho das sessões: ${JSON.stringify(outcomes)}`);
};

main();
