// ─── Regras de prior das 8 condições crônicas ──────────────────────
// Tradução literal dos `priorAdjust` da v7 (antes em matrix.js) para
// regras em dados, no mesmo formato de `PriorRule` do banco.
//
// Como o motor resolve o prior (bayes.createEngine → resolvePrior):
//   p = Condition.basePrior (em matrix.js)
//   para cada regra ativa, em ordem de sortOrder, se `when` vale:
//     set → p = amount · add → p += amount · multiply → p *= amount
//   no fim: p = min(Condition.maxPrior (.95), p)
//
// A ordem e as operações são as mesmas do JS antigo, então o prior sai
// idêntico até o último bit (o golden v7 e tests/kb.priors.test.js
// conferem). Mudar um valor aqui é decisão clínica.

const SRC = 'HIP_MATRIZ_V7';

const AGE_GT = (n) => ({ field: 'age', op: 'gt', value: n });
const FEMALE     = { field: 'sex', op: 'eq',  value: 'female' };
const NOT_FEMALE = { field: 'sex', op: 'neq', value: 'female' }; // sexo ausente conta como "não mulher"
const MALE       = { field: 'sex', op: 'eq',  value: 'male' };
const BMI_30     = { field: 'bmi', op: 'gte', value: 30 };
const SMOKER     = { field: 'smoker', op: 'truthy' };

const rule = (conditionCode, sortOrder, kind, label, when, effect, amount, modifiable = false) => ({
  conditionCode,
  kind,
  label,
  when,
  effect,
  amount,
  modifiable,
  sortOrder,
  active: true,
  sourceCode: SRC,
});

const priorRules = [
  // ── AOS: base .32 (homem / sexo ausente)
  rule('AOS', 1, 'BASELINE',    'Mulher: prevalência base menor',        [FEMALE],                 'set', 0.15),
  rule('AOS', 2, 'BASELINE',    'Idade > 50 anos (homem)',               [AGE_GT(50), NOT_FEMALE], 'add', 0.13),
  rule('AOS', 3, 'BASELINE',    'Idade > 50 anos (mulher)',              [AGE_GT(50), FEMALE],     'add', 0.10),
  rule('AOS', 4, 'RISK_FACTOR', 'Obesidade (IMC ≥ 30)',                  [BMI_30],                 'add', 0.10, true),

  // ── CV: base .20
  rule('CV', 1, 'BASELINE', 'Idade > 45 anos',  [AGE_GT(45)], 'set', 0.30),
  rule('CV', 2, 'BASELINE', 'Idade > 60 anos',  [AGE_GT(60)], 'set', 0.45),
  rule('CV', 3, 'BASELINE', 'Sexo masculino',   [MALE],       'add', 0.05),

  // ── DM2: base .13
  rule('DM2', 1, 'BASELINE',    'Idade > 40 anos',                    [AGE_GT(40)], 'set', 0.15),
  rule('DM2', 2, 'BASELINE',    'Idade > 60 anos',                    [AGE_GT(60)], 'set', 0.22),
  rule('DM2', 3, 'RISK_FACTOR', 'Obesidade (IMC ≥ 30)',               [BMI_30],     'add', 0.08, true),
  rule('DM2', 4, 'RISK_FACTOR', 'Diabetes em parente de 1º grau',
    [{ field: 'familyHistoryDm', op: 'truthy' }], 'add', 0.05),

  // ── HIPOTIR: base .05
  rule('HIPOTIR', 1, 'BASELINE', 'Sexo feminino',            [FEMALE],                 'set', 0.07),
  rule('HIPOTIR', 2, 'BASELINE', 'Idade > 60 anos (mulher)', [AGE_GT(60), FEMALE],     'set', 0.12),
  rule('HIPOTIR', 3, 'BASELINE', 'Idade > 60 anos (homem)',  [AGE_GT(60), NOT_FEMALE], 'set', 0.08),

  // ── SINDMET: base .40
  rule('SINDMET', 1, 'BASELINE', 'Idade > 40 anos', [AGE_GT(40)], 'set', 0.50),

  // ── DEPRESSAO: base .11
  rule('DEPRESSAO', 1, 'BASELINE', 'Idade > 50 anos', [AGE_GT(50)], 'set', 0.12),

  // ── ARRITMIA: base .02 (a regra de > 65 vem depois e sobrescreve)
  rule('ARRITMIA', 1, 'BASELINE', 'Idade > 60 anos', [AGE_GT(60)], 'set', 0.05),
  rule('ARRITMIA', 2, 'BASELINE', 'Idade > 65 anos', [AGE_GT(65)], 'set', 0.08),

  // ── DPOC: base .05
  rule('DPOC', 1, 'RISK_FACTOR', 'Fuma ou já fumou',                [SMOKER], 'set', 0.20, true),
  rule('DPOC', 2, 'RISK_FACTOR', 'Carga tabágica ≥ 10 maços-ano',
    [{ field: 'packYears', op: 'gte', value: 10 }], 'set', 0.25, true),
  rule('DPOC', 3, 'RISK_FACTOR', 'Fumante com mais de 40 anos',     [AGE_GT(40), SMOKER], 'set', 0.30, true),
];

module.exports = { priorRules };
