// ─── Condições em JSON (`showIf` / `when`) ──────────────────
// Cópia, no frontend, do evalWhen do backend
// (backend/src/services/clinical/kb/conditions.js). A lista é um E: todas
// as cláusulas têm que valer. Lista vazia ou null vale sempre.
//   - gt/gte/lt/lte devolvem false se o campo for null/undefined;
//   - neq NÃO tem guarda de null;
//   - in: o valor do campo está na lista; includes: o campo é uma lista
//     (multiselect) e contém o valor.
// Diferença proposital: operador desconhecido aqui vale `true` (mostra o
// campo) em vez de lançar erro, para a tela não quebrar por um dado novo.

const OPS = {
  eq:       (v, x) => v === x,
  neq:      (v, x) => v !== x,
  gt:       (v, x) => v != null && v >  x,
  gte:      (v, x) => v != null && v >= x,
  lt:       (v, x) => v != null && v <  x,
  lte:      (v, x) => v != null && v <= x,
  truthy:   (v)    => Boolean(v),
  falsy:    (v)    => !v,
  in:       (v, x) => Array.isArray(x) && x.includes(v),
  includes: (v, x) => Array.isArray(v) && v.includes(x),
};

export function evalWhen(when, facts = {}) {
  if (!Array.isArray(when) || when.length === 0) return true;
  return when.every((c) => {
    const fn = OPS[c?.op];
    return fn ? fn(facts?.[c.field], c.value) : true;
  });
}

// Campo do formulário de perfil visível para os valores atuais.
// Usa o `showIf` inteiro (ex.: papEmDia = mulher E idade ≥ 25), não só o
// `showIfField`, que guarda apenas o primeiro campo.
export const isFieldVisible = (field, values) => evalWhen(field?.showIf, values);

// Tira do perfil os campos que não estão visíveis (ex.: maços-ano de quem
// marcou que não fuma) e os vazios, antes de mandar para a API.
export function visibleProfile(schema, values) {
  const out = {};
  for (const f of schema ?? []) {
    const v = values?.[f.field];
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (!isFieldVisible(f, values)) continue;
    out[f.field] = v;
  }
  return out;
}
