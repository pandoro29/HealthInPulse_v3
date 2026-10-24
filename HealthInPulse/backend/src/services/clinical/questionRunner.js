// ─── Seletor de perguntas da oncologia ──────────────────────────────
// A fase crônica escolhe pela entropia global (bayes.selectNextSymptom).
// Para câncer isso não funciona: com P ≈ 0,2%, quase não há entropia e o
// IG de qualquer pergunta é ~0. Aqui a pontuação é o poder de mudar o
// risco das condições que valem para a pessoa:
//
//   score(sintoma) = Σ |ln LR+| / custo
//
// somando os cânceres elegíveis (sexo e idade mínima) que têm likelihood
// para o sintoma. Empate: menor sortOrder. Sintoma que nenhum câncer
// elegível enxerga não é perguntado (score 0). Nem o que já foi
// respondido ou que um achado objetivo substitui (ex.: perda de peso
// pesada na balança, riskEngine.SUPERSEDES).
//
// Puro e sem estado: o teste público manda tudo a cada chamada.

const { candidatesFor } = require('./questions');
const { normalizeProfile } = require('./profile');
const { SUPERSEDES } = require('./riskEngine');

const isPositive = (raw) => (raw != null && typeof raw === 'object' ? raw.value : raw) === 1;

const eligible = (cond, profile) =>
  cond.active !== false &&
  cond.category === 'ONCOLOGICA' &&
  (!cond.sexFilter || !profile.sex || cond.sexFilter === profile.sex) &&
  (cond.minAge == null || profile.age == null || profile.age >= cond.minAge);

const fmtLr = (lr) => (lr >= 10 ? Math.round(lr) : Number(lr.toFixed(1))).toString().replace('.', ',');
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// Frase calma para o "por que estamos perguntando"
const buildReason = (symptom, targets) => {
  const main = targets[0];
  const others = targets.slice(1).map(t => lowerFirst(t.label));
  const what = lowerFirst(symptom.label ?? symptom.code);
  let text = `Perguntamos porque ${what} é cerca de ${fmtLr(main.lr)} vezes mais comum em quem tem ${lowerFirst(main.label)} do que em quem não tem.`;
  if (others.length) text += ` Também ajuda a avaliar: ${others.join(', ')}.`;
  return `${text} Na maioria das vezes, a causa não é câncer.`;
};

// next(kb, { profile, answers, panel, max, askedCount, evidence })
//   answers    { sintoma: resposta } — chave presente = já respondido
//   panel      'ONCOLOGIA' (fase 2 da triagem) ou 'RAPIDO' (teste público)
//   max        limite de perguntas nesta fase
//   askedCount quantas já foram feitas nesta fase (padrão: quantas
//              candidatas do painel já têm resposta)
//   evidence   evidência objetiva já conhecida (exames, balança): pula o
//              que ela já responde
// → null (acabou) ou { symptom, cost, question, score, reason, targets, progress }
const next = (kb, { profile: rawProfile = {}, answers = {}, panel = 'ONCOLOGIA', max = 6, askedCount = null, evidence = {} } = {}) => {
  const profile = normalizeProfile(rawProfile);
  const known = new Set([...Object.keys(answers), ...Object.keys(evidence)]);
  const candidates = candidatesFor(kb, profile, panel);
  const asked = askedCount ?? candidates.filter(c => Object.prototype.hasOwnProperty.call(answers, c.symptom)).length;
  if (asked >= max) return null;

  const conds = new Map(kb.conditions.filter(c => eligible(c, profile)).map(c => [c.code, c]));
  const lkByCond = new Map();
  for (const cs of kb.conditionSymptoms) {
    if (!conds.has(cs.conditionCode)) continue;
    if (!lkByCond.has(cs.conditionCode)) lkByCond.set(cs.conditionCode, new Map());
    lkByCond.get(cs.conditionCode).set(cs.symptomCode, cs);
  }
  const symptomByCode = new Map(kb.symptoms.map(s => [s.code, s]));

  let best = null;
  for (const cand of candidates) {
    if (known.has(cand.symptom)) continue;
    const targets = [];
    for (const [code, lk] of lkByCond) {
      const cs = lk.get(cand.symptom);
      if (!cs) continue;
      const by = SUPERSEDES[cand.symptom];
      if (by && isPositive(evidence[by]) && lk.has(by)) continue; // a balança já mostrou a perda
      const lr = cs.pSx / cs.pNoSx;
      if (!(lr > 0) || !Number.isFinite(lr)) continue;
      targets.push({ code, label: conds.get(code).label, lr });
    }
    if (!targets.length) continue;
    const score = targets.reduce((a, t) => a + Math.abs(Math.log(t.lr)), 0) / Math.max(1, cand.cost ?? 1);
    if (score <= 0) continue;
    const sortOrder = symptomByCode.get(cand.symptom)?.sortOrder ?? 0;
    if (!best || score > best.score || (score === best.score && sortOrder < best.sortOrder)) {
      best = { ...cand, score, sortOrder, targets: targets.sort((a, b) => b.lr - a.lr) };
    }
  }
  if (!best) return null;

  const symptom = symptomByCode.get(best.symptom);
  return {
    symptom:  best.symptom,
    cost:     best.cost,
    question: best.question,
    score:    best.score,
    targets:  best.targets.map(t => ({ code: t.code, label: t.label, lr: t.lr })),
    reason:   buildReason(symptom, best.targets),
    progress: { asked, max },
  };
};

module.exports = { next, eligible };
