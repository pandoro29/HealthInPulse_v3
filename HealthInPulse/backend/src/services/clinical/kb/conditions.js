// ─── Condições em JSON (`when` / `showIf`) ──────────────────────────
// As regras da base de conhecimento (PriorRule.when, Symptom.showIf,
// ScreeningRule.when) guardam condições como JSON, para caberem no banco:
//
//   [{ field: 'age', op: 'gt', value: 50 }, { field: 'sex', op: 'eq', value: 'female' }]
//
// A lista é um E (todas as cláusulas têm que valer). Lista vazia ou
// null vale sempre. Os operadores replicam exatamente o JS da v7:
//   - gt/gte/lt/lte devolvem false se o campo for null/undefined
//     (o v7 escrevia `age && age > 50`);
//   - neq NÃO tem guarda de null: sexo ausente conta como "não é mulher",
//     como o `sex === 'female' ? ... : ...` do v7;
//   - truthy/falsy usam Boolean(v), como o `if (smoker)` do v7;
//   - in compara com igualdade estrita contra uma lista de valores;
//   - includes é o contrário: o CAMPO é uma lista (multiselect, ex.:
//     familyHistoryCancer) e precisa conter `value`. Campo ausente ou
//     que não é lista → false.

const OPS = {
  eq:     (v, x) => v === x,
  neq:    (v, x) => v !== x,
  gt:     (v, x) => v != null && v >  x,
  gte:    (v, x) => v != null && v >= x,
  lt:     (v, x) => v != null && v <  x,
  lte:    (v, x) => v != null && v <= x,
  truthy: (v)    => Boolean(v),
  falsy:  (v)    => !v,
  in:     (v, x) => Array.isArray(x) && x.includes(v),
  includes: (v, x) => Array.isArray(v) && v.includes(x),
};

const SUPPORTED_OPS = Object.keys(OPS);

// Uma cláusula: { field, op, value }. Operador desconhecido é erro de
// dado (regra mal cadastrada), não "falso" silencioso.
const evalClause = (clause, facts) => {
  const fn = OPS[clause.op];
  if (!fn) throw new Error(`Operador desconhecido em condição: "${clause.op}" (campo ${clause.field})`);
  return fn(facts?.[clause.field], clause.value);
};

const evalWhen = (when, facts = {}) => {
  if (when == null) return true;
  if (!Array.isArray(when)) throw new Error('Condição inválida: `when` deve ser uma lista de cláusulas');
  for (const clause of when) {
    if (!evalClause(clause, facts)) return false;
  }
  return true;
};

// Confere a forma de uma condição sem avaliar (útil ao salvar no banco)
const validateWhen = (when) => {
  if (when == null) return [];
  if (!Array.isArray(when)) return ['`when` deve ser uma lista'];
  const errors = [];
  when.forEach((c, i) => {
    if (!c || typeof c !== 'object') { errors.push(`cláusula ${i}: não é objeto`); return; }
    if (typeof c.field !== 'string' || !c.field) errors.push(`cláusula ${i}: sem campo`);
    if (!OPS[c.op]) errors.push(`cláusula ${i}: operador "${c.op}" não suportado`);
    if (c.op === 'in' && !Array.isArray(c.value)) errors.push(`cláusula ${i}: "in" exige lista`);
  });
  return errors;
};

module.exports = { evalWhen, evalClause, validateWhen, SUPPORTED_OPS };
