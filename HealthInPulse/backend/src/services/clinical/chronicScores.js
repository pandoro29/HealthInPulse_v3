// ─── Fase crônica por escores validados ────────────────────────────
// Desde a auditoria de 22/10/2026 (regra R1), a fase crônica da triagem
// não usa mais o motor bayesiano da v7: os LRs por sintoma não tinham
// fonte (Docs/superpowers/specs/2026-10-22-...-design.md, Parte 6).
//
// Ficam três condições, cada uma com o escore validado e o corte oficial:
//   AOS        STOP-Bang ≥ 3 (Chung 2016)
//   DM2        FINDRISC ≥ 15 (SBD 2025)
//   Depressão  PHQ-2 ≥ 3 abre o PHQ-9 (Kroenke 2003); PHQ-9 ≥ 10 (Levis 2019)
// Saíram por falta de fonte: CV/HAS, síndrome metabólica, arritmia/FA, DPOC
// e hipotireoidismo. As perguntas de sinal de alarme (dor no peito,
// desmaio, déficit neurológico, pior dor de cabeça) continuam, porque
// alimentam os red flags.
//
// Sem porcentagem: o resultado é a faixa do escore. O nível da triagem
// vem das faixas (nenhum corte de probabilidade inventado):
//   HIGH     STOP-Bang ≥ 5, FINDRISC > 20 ou PHQ-9 ≥ 20
//   MODERATE STOP-Bang ≥ 3, FINDRISC ≥ 15 ou PHQ-9 ≥ 10
//   LOW      nenhum acima

const { S } = require('./matrix');
const scales = require('./scales');
const { normalizeProfile } = require('./profile');

const PHQ2_KEYS = [S.PHQ9_ANEDONIA, S.PHQ9_HUMOR];
const PHQ_REST  = [
  S.PHQ9_SONO, S.PHQ9_FADIGA, S.PHQ9_APETITE, S.PHQ9_CULPA,
  S.PHQ9_CONCENTRACAO, S.PHQ9_AGITACAO, S.PHQ9_IDEACAO,
];

// Ordem das perguntas: alarme primeiro, depois os escores
const RED_FLAG_PROBES = [S.DOR_TORACICA_TIPICA, 'deficit_neurologico_subito', 'cefaleia_pior_da_vida', S.SINCOPE];
const STOP_BANG_ITEMS = [S.RONCO_ALTO, S.FADIGA_DIURNA, S.APNEIA_OBSERVADA, S.HAS_CONHECIDA, S.PESCOCO_LARGO];
const FINDRISC_ITEMS  = [S.CINTURA_AUMENTADA, S.SEDENTARISMO, S.POUCAS_FRUTAS_VEG, S.USO_ANTI_HAS, S.GLICEMIA_ALTERADA];

const SOURCES = {
  STOP_BANG: 'Chung F, Abdullah HR, Liao P. STOP-Bang Questionnaire: A Practical Approach to Screen for Obstructive Sleep Apnea. Chest 2016;149(3):631-8.',
  FINDRISC:  'Rodacki M et al. Brazilian guideline for screening and diagnosis of type 2 diabetes (SBD). Diabetol Metab Syndr 2025;17:78 (Tabela 2).',
  PHQ9:      'Kroenke K, Spitzer RL, Williams JB. The PHQ-9. J Gen Intern Med 2001;16(9):606-13; Levis B et al. BMJ 2019;365:l1476 (corte ≥ 10).',
  PHQ2:      'Kroenke K, Spitzer RL, Williams JB. The Patient Health Questionnaire-2: validity of a two-item depression screener. Med Care 2003;41(11):1284-92.',
};

const answered = (raw, code) => raw[code] !== undefined && raw[code] !== null && raw[code] !== '';
const likert = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const phq2Score = (raw) => PHQ2_KEYS.reduce((sum, k) => sum + likert(raw[k]), 0);

// Lista de perguntas que valem para esta sessão, na ordem
const questionCodes = (rawAnswers = {}, rawProfile = {}) => {
  const profile = normalizeProfile(rawProfile);
  const list = [...RED_FLAG_PROBES, ...PHQ2_KEYS, ...STOP_BANG_ITEMS, ...FINDRISC_ITEMS];
  // História familiar de diabetes já vem do formulário do perfil
  if (profile.familyHistoryDm == null) list.push(S.HIST_FAM_DM);
  // PHQ-2 positivo (≥ 3) abre os outros 7 itens do PHQ-9
  if (PHQ2_KEYS.every(k => answered(rawAnswers, k)) && phq2Score(rawAnswers) >= 3) list.push(...PHQ_REST);
  return list;
};

// Próxima pergunta não respondida (ou null quando acabou)
const nextQuestion = (rawAnswers = {}, profile = {}) => {
  const list = questionCodes(rawAnswers, profile);
  const code = list.find(c => !answered(rawAnswers, c));
  return {
    code: code ?? null,
    progress: { asked: list.filter(c => answered(rawAnswers, c)).length, max: list.length },
  };
};

const STOP_BANG_LABEL = { LOW: 'baixo', INTERMEDIATE: 'intermediário', HIGH: 'alto' };
const FINDRISC_LABEL  = { LOW: 'baixo', SLIGHTLY_ELEVATED: 'levemente elevado', MODERATE: 'moderado', HIGH: 'alto', VERY_HIGH: 'muito alto' };
const PHQ9_LABEL      = { MINIMAL: 'mínimo', MILD: 'leve', MODERATE: 'moderado', MODERATELY_SEVERE: 'moderadamente grave', SEVERE: 'grave' };

// Escores e nível a partir das respostas cruas da triagem
const evaluate = (rawAnswers = {}, rawProfile = {}) => {
  const profile = normalizeProfile(rawProfile);
  const ctx = { answers: rawAnswers, profile };
  const sb = scales.stopBang(ctx);
  const fr = scales.findrisc(ctx);
  const phq2 = phq2Score(rawAnswers);
  const phqComplete = PHQ_REST.every(k => answered(rawAnswers, k));
  const ph = scales.phq9(ctx);

  const scores = [
    {
      code: 'AOS', label: 'Apneia obstrutiva do sono', scale: 'STOP-Bang',
      score: sb.score, max: sb.max, category: STOP_BANG_LABEL[sb.risk],
      positive: sb.score >= 3, high: sb.score >= 5, cutoff: '≥ 3',
      interpretation: sb.interpretation, source: SOURCES.STOP_BANG,
    },
    {
      code: 'DM2', label: 'Diabetes tipo 2', scale: 'FINDRISC',
      score: fr.score, max: fr.max, category: FINDRISC_LABEL[fr.risk],
      positive: fr.score >= 15, high: fr.score > 20, cutoff: '≥ 15',
      interpretation: fr.interpretation, source: SOURCES.FINDRISC,
    },
    phqComplete
      ? {
        code: 'DEPRESSAO', label: 'Depressão', scale: 'PHQ-9',
        score: ph.score, max: ph.max, category: PHQ9_LABEL[ph.severity],
        positive: ph.score >= 10, high: ph.score >= 20, cutoff: '≥ 10',
        interpretation: ph.interpretation, source: SOURCES.PHQ9,
      }
      : {
        code: 'DEPRESSAO', label: 'Depressão', scale: 'PHQ-2',
        score: phq2, max: 6, category: phq2 >= 3 ? 'positivo' : 'negativo',
        positive: false, high: false, cutoff: '≥ 3 abre o PHQ-9',
        interpretation: 'PHQ-2 abaixo de 3: rastreio negativo, o PHQ-9 não foi aplicado.',
        source: SOURCES.PHQ2,
      },
  ];

  const riskLevel = scores.some(s => s.high) ? 'HIGH'
    : scores.some(s => s.positive) ? 'MODERATE' : 'LOW';

  return { riskLevel, scores, suicidalIdeation: likert(rawAnswers[S.PHQ9_IDEACAO]) > 0 };
};

module.exports = { nextQuestion, questionCodes, evaluate, SOURCES };
