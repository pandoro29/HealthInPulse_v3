// ─── Rastreamento (ScreeningRule → o que fazer agora ou no futuro) ───
// Para cada câncer que se aplica ao sexo da pessoa, escolhe a regra de
// maior prioridade (menor `priority`) que vale hoje:
//   - INDICADO_AGORA        → regra POPULACIONAL ou ALTO_RISCO na faixa;
//   - DECISAO_COMPARTILHADA → regra DECISAO_COMPARTILHADA na faixa
//                             (conversar com o médico: ex. PSA);
//   - FUTURO                → nenhuma vale hoje, mas uma vai valer quando a
//                             pessoa chegar à idade `startAge`.
// Câncer sem regra hoje nem no futuro (ex.: pulmão para quem nunca fumou,
// colo do útero depois dos 64) não aparece.
//
// Puro: recebe o kb e o perfil cru ou normalizado (normalizeProfile roda
// aqui e é idempotente: { smoker: true, packYears: 30 } sem quitYears
// vale como fumante atual e entra no rastreio de pulmão).

const { evalWhen } = require('./kb/conditions');
const { normalizeProfile } = require('./profile');

const STATUS = {
  NOW:    'INDICADO_AGORA',
  SHARED: 'DECISAO_COMPARTILHADA',
  FUTURE: 'FUTURO',
};

const sexOk = (sexFilter, sex) => !sexFilter || !sex || sexFilter === sex;

// Faixa etária inclusiva nas duas pontas (minAge/maxAge null = sem limite).
// Idade desconhecida: só regra sem limite de idade vale "agora".
const inAgeRange = (rule, age) => {
  if (age == null) return rule.minAge == null && rule.maxAge == null;
  if (rule.minAge != null && age < rule.minAge) return false;
  if (rule.maxAge != null && age > rule.maxAge) return false;
  return true;
};

const entry = (cond, rule, status, extra = {}) => ({
  conditionCode:  cond.code,
  conditionLabel: cond.label,
  status,
  kind:           rule.kind,
  exam:           rule.exam,
  recommendation: rule.recommendation,
  intervalMonths: rule.intervalMonths,
  minAge:         rule.minAge,
  maxAge:         rule.maxAge,
  startAge:       null,
  ruleId:         rule.id,
  priority:       rule.priority,
  sourceCode:     rule.sourceCode,
  ...extra,
});

// evaluate(kb, profile, { conditionCodes? }) → [entry] na ordem das condições
const evaluate = (kb, rawProfile = {}, { conditionCodes = null } = {}) => {
  const profile = normalizeProfile(rawProfile);
  const age = profile.age ?? null;
  const out = [];
  const conditions = kb.conditions
    .filter(c => c.active !== false && c.category === 'ONCOLOGICA')
    .filter(c => !conditionCodes || conditionCodes.includes(c.code))
    .filter(c => sexOk(c.sexFilter, profile.sex))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  for (const cond of conditions) {
    const rules = kb.screeningRules
      .filter(r => r.conditionCode === cond.code && r.active !== false)
      .filter(r => sexOk(r.sexFilter, profile.sex) && evalWhen(r.when, profile))
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    const now = rules.find(r => inAgeRange(r, age));
    if (now) {
      out.push(entry(cond, now, now.kind === 'DECISAO_COMPARTILHADA' ? STATUS.SHARED : STATUS.NOW));
      continue;
    }
    // Futuro: a regra que começa mais cedo (empate: a mais prioritária)
    if (age == null) continue;
    const future = rules
      .filter(r => r.minAge != null && age < r.minAge)
      .sort((a, b) => (a.minAge - b.minAge) || ((a.priority ?? 0) - (b.priority ?? 0)))[0];
    if (future) out.push(entry(cond, future, STATUS.FUTURE, { startAge: future.minAge }));
  }
  return out;
};

module.exports = { evaluate, STATUS };
