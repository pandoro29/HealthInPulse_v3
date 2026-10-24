// ─── Escalas clínicas validadas ─────────────────────────────────────
// Desde a auditoria de 22/10/2026 (regra R1) são ELAS que decidem a fase
// crônica da triagem (clinical/chronicScores.js): os LRs por sintoma da
// matriz v7 não tinham fonte. Pontos e cortes com fonte:
//
//  - STOP-BANG   — AOS: 0–2 baixo, 3–4 intermediário, 5–8 alto (Chung 2016)
//  - PHQ-9       — depressão: 5/10/15/20 (Kroenke 2001); ≥ 10 (Levis 2019)
//  - FINDRISC    — DM2 em 10 anos: pontos e faixas da SBD 2025 (Tabela 2)
//  - Framingham  — risco cardiovascular (Wilson 1998, versão simplificada):
//                  só informativo para a médica; não decide nada

const { S } = require('./matrix');

// ─── STOP-BANG ─────────────────────────────────────────────────────
// 8 itens, 1 ponto cada: 0–2 baixo, 3–4 intermediário, 5–8 alto risco
// (Chung F, Abdullah HR, Liao P. Chest 2016;149(3):631-8). Só respostas da
// pessoa: IAH e PA da pulseira não são itens do STOP-Bang.
const stopBang = ({ answers, profile }) => {
  const items = {
    Snoring:    yes(answers, S.RONCO_ALTO),
    Tired:      yes(answers, S.FADIGA_DIURNA),
    Observed:   yes(answers, S.APNEIA_OBSERVADA),
    Pressure:   yes(answers, S.HAS_CONHECIDA),
    Bmi:        profile?.bmi != null && profile.bmi > 35,
    Age:        profile?.age != null && profile.age > 50,
    Neck:       yes(answers, S.PESCOCO_LARGO),
    Gender:     profile?.sex === 'male',
  };
  const score = Object.values(items).filter(Boolean).length;

  let risk;
  if (score >= 5) risk = 'HIGH';
  else if (score >= 3) risk = 'INTERMEDIATE';
  else risk = 'LOW';

  return {
    name:    'STOP-BANG',
    score,
    max:     8,
    risk,
    items,
    interpretation: risk === 'HIGH'
      ? 'Alto risco para AOS (≥ 5: sensibilidade 60%, especificidade 72% para IAH ≥ 15; Nagappa 2015)'
      : risk === 'INTERMEDIATE'
        ? 'Risco intermediário para AOS (≥ 3; Chung 2016): considerar polissonografia'
        : 'Baixo risco para AOS',
  };
};

// ─── PHQ-9 ─────────────────────────────────────────────────────────
// 9 itens, 0–3 cada (Likert). Score total 0–27.
const PHQ9_KEYS = [
  S.PHQ9_HUMOR, S.PHQ9_ANEDONIA, S.PHQ9_SONO, S.PHQ9_FADIGA,
  S.PHQ9_APETITE, S.PHQ9_CULPA, S.PHQ9_CONCENTRACAO,
  S.PHQ9_AGITACAO, S.PHQ9_IDEACAO,
];
const phq9 = ({ answers }) => {
  let score = 0;
  const present = {};
  for (const k of PHQ9_KEYS) {
    const raw = answers[`${k}_likert`] ?? answers[k];
    const n   = numericLikert(raw);
    present[k] = n;
    if (Number.isFinite(n)) score += n;
  }

  let severity;
  if (score >= 20) severity = 'SEVERE';
  else if (score >= 15) severity = 'MODERATELY_SEVERE';
  else if (score >= 10) severity = 'MODERATE';
  else if (score >= 5)  severity = 'MILD';
  else severity = 'MINIMAL';

  return {
    name:    'PHQ-9',
    score,
    max:     27,
    severity,
    items:   present,
    suicidalIdeation: (present[S.PHQ9_IDEACAO] ?? 0) > 0,
    // Faixas de Kroenke 2001; sem probabilidade (não existe na fonte)
    interpretation: ({
      SEVERE:           'Sintomas depressivos graves (≥ 20; Kroenke 2001)',
      MODERATELY_SEVERE:'Sintomas moderadamente graves (15–19; Kroenke 2001)',
      MODERATE:         'Sintomas moderados (10–14). Corte ≥ 10: sensibilidade 88%, especificidade 85% (Levis 2019)',
      MILD:             'Sintomas leves (5–9; Kroenke 2001)',
      MINIMAL:          'Sem sintomas depressivos relevantes (< 5)',
    })[severity],
  };
};

// ─── FINDRISC ──────────────────────────────────────────────────────
// Risco de DM2 em 10 anos. Escore 0–26. Pontos e faixas da Diretriz da SBD
// (Rodacki M et al. Diabetol Metab Syndr 2025;17:78, Tabela 2).
const findrisc = ({ answers, profile }) => {
  let score = 0;

  // Idade: 45–54 → 2; 55–64 → 3; acima de 64 → 4
  if (profile?.age != null) {
    if (profile.age > 64) score += 4;
    else if (profile.age >= 55) score += 3;
    else if (profile.age >= 45) score += 2;
  }
  // IMC
  if (profile?.bmi != null) {
    if (profile.bmi > 30) score += 3;
    else if (profile.bmi >= 25) score += 1;
  }
  // Cintura acima de 94 cm (homem) ou 80 cm (mulher): 3 pontos para os dois
  // (o 4 exige a segunda faixa, > 102 / > 88 cm, que o app não pergunta)
  if (yes(answers, S.CINTURA_AUMENTADA)) score += 3;
  // Sedentarismo
  if (yes(answers, S.SEDENTARISMO)) score += 2;
  // Frutas/vegetais
  if (yes(answers, S.POUCAS_FRUTAS_VEG)) score += 1;
  // Anti-hipertensivo
  if (yes(answers, S.USO_ANTI_HAS)) score += 2;
  // Glicemia alterada
  if (yes(answers, S.GLICEMIA_ALTERADA)) score += 5;
  // História familiar de 1º grau (pai, mãe, irmãos ou filhos): 5 pontos.
  // Vem da pergunta ou do formulário do perfil (familyHistoryDm).
  if (yes(answers, S.HIST_FAM_DM) || profile?.familyHistoryDm === true) score += 5;

  // Faixas: < 7 baixo, 7–11 levemente elevado, 12–14 moderado, 15–20 alto,
  // > 20 muito alto
  let risk, prob10y;
  if (score > 20)       { risk = 'VERY_HIGH'; prob10y = 0.50; }
  else if (score >= 15) { risk = 'HIGH';      prob10y = 0.33; }
  else if (score >= 12) { risk = 'MODERATE';  prob10y = 0.17; }
  else if (score >= 7)  { risk = 'SLIGHTLY_ELEVATED'; prob10y = 0.04; }
  else                  { risk = 'LOW';       prob10y = 0.01; }

  return {
    name: 'FINDRISC',
    score,
    max:  26,
    risk,
    prob10y,
    interpretation: `Probabilidade estimada de DM2 em 10 anos: ${(prob10y * 100).toFixed(0)}%`,
  };
};

// ─── Framingham simplificado ───────────────────────────────────────
// Versão acadêmica — risco CV em 10 anos baseado em fatores básicos.
const framingham = ({ answers, profile, wearable }) => {
  let points = 0;
  if (profile?.age != null) {
    if (profile.age >= 70)      points += profile.sex === 'male' ? 14 : 16;
    else if (profile.age >= 60) points += profile.sex === 'male' ? 10 : 12;
    else if (profile.age >= 50) points += profile.sex === 'male' ? 6  : 7;
    else if (profile.age >= 40) points += profile.sex === 'male' ? 3  : 3;
  }
  if (yes(answers, S.TABAGISMO))       points += 4;
  if (yes(answers, S.DIABETES_DX))     points += 5;
  if (yes(answers, S.HIST_FAM_CV))     points += 2;
  if (yes(answers, S.COLESTEROL_ALTO)) points += 3;
  const systolic = wearable?.systolicAvg ?? wearable?.systolic;
  if (systolic != null) {
    if (systolic >= 160)      points += 4;
    else if (systolic >= 140) points += 2;
    else if (systolic >= 130) points += 1;
  } else if (yes(answers, S.HAS_CONHECIDA)) {
    points += 3;
  }

  // Mapeamento simplificado pontos → risco
  let prob10y;
  if (points >= 18)      prob10y = 0.30;
  else if (points >= 14) prob10y = 0.20;
  else if (points >= 10) prob10y = 0.10;
  else if (points >= 6)  prob10y = 0.05;
  else                   prob10y = 0.02;

  let risk;
  if (prob10y >= 0.20)      risk = 'HIGH';
  else if (prob10y >= 0.10) risk = 'MODERATE';
  else                      risk = 'LOW';

  return {
    name: 'Framingham',
    score: points,
    prob10y,
    risk,
    interpretation: `Risco CV em 10 anos: ${(prob10y * 100).toFixed(0)}% (${risk})`,
  };
};

// ─── Roda todas as escalas aplicáveis ──────────────────────────────
const runAll = (ctx) => ({
  stopBang:   stopBang(ctx),
  phq9:       phq9(ctx),
  findrisc:   findrisc(ctx),
  framingham: framingham(ctx),
});

// ─── Helpers ───────────────────────────────────────────────────────
const yes = (answers, key) => {
  const v = answers?.[key];
  return v === 1 || v === '1' || v === true || v === 'Sim' || v === 'sim';
};
const numericLikert = (v) => {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const s = String(v).toLowerCase();
  if (['0','nunca','never','não'].includes(s))                return 0;
  if (['1','alguns dias','vários dias','some days'].includes(s)) return 1;
  if (['2','mais da metade dos dias','mais que metade'].includes(s)) return 2;
  if (['3','quase todo dia','todos os dias','nearly every day'].includes(s)) return 3;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

module.exports = { stopBang, phq9, findrisc, framingham, runAll };
