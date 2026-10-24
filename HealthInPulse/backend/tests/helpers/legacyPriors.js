// ─── Priors legados (v7) ────────────────────────────────────────────
// Cópia literal dos `priorAdjust` de `src/services/clinical/matrix.js`
// como estavam na v7 (antes da refatoração para regras no banco).
// Serve de referência nos testes: o motor novo tem que devolver o mesmo
// prior que estas funções para qualquer perfil.
//
// NÃO edite: se o comportamento mudar de propósito, isso é decisão
// clínica e entra como teste novo, não como mudança aqui.

const LEGACY_PRIOR_ADJUST = {
  AOS: ({ age, sex, bmi }) => {
    let p = sex === 'female' ? 0.15 : 0.32;
    if (age && age > 50) p += sex === 'female' ? 0.10 : 0.13;
    if (bmi && bmi >= 30) p += 0.10;
    return Math.min(0.95, p);
  },

  CV: ({ age, sex }) => {
    let p = 0.20;
    if (age && age > 45) p = 0.30;
    if (age && age > 60) p = 0.45;
    if (sex === 'male') p += 0.05;
    return Math.min(0.95, p);
  },

  DM2: ({ age, bmi, familyHistoryDm }) => {
    let p = 0.13;
    if (age && age > 40) p = 0.15;
    if (age && age > 60) p = 0.22;
    if (bmi && bmi >= 30) p += 0.08;
    if (familyHistoryDm) p += 0.05;
    return Math.min(0.95, p);
  },

  HIPOTIR: ({ age, sex }) => {
    let p = 0.05;
    if (sex === 'female') p = 0.07;
    if (age && age > 60) p = sex === 'female' ? 0.12 : 0.08;
    return Math.min(0.95, p);
  },

  SINDMET: ({ age }) => age && age > 40 ? 0.50 : 0.40,

  DEPRESSAO: ({ age }) => age && age > 50 ? 0.12 : 0.11,

  ARRITMIA: ({ age }) => {
    if (age && age > 65) return 0.08;
    if (age && age > 60) return 0.05;
    return 0.02;
  },

  DPOC: ({ age, smoker, packYears }) => {
    let p = 0.05;
    if (smoker) p = 0.20;
    if (packYears && packYears >= 10) p = 0.25;
    if (age && age > 40 && smoker) p = 0.30;
    return Math.min(0.95, p);
  },
};

const LEGACY_CONDITION_CODES = Object.keys(LEGACY_PRIOR_ADJUST);

// Mesmo contrato do `matrix.resolvePrior` da v7 (0.05 para código desconhecido)
const resolveLegacyPrior = (condCode, profile = {}) => {
  const fn = LEGACY_PRIOR_ADJUST[condCode];
  return fn ? fn(profile) : 0.05;
};

module.exports = { LEGACY_PRIOR_ADJUST, LEGACY_CONDITION_CODES, resolveLegacyPrior };
