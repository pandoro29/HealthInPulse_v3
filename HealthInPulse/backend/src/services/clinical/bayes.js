// ─── Motor bayesiano + Information Gain ─────────────────────────────
// Implementa:
//  - Posterior bayesiano para múltiplas condições simultâneas:
//      posterior(D) ∝ prior(D) × ∏ P(sᵢ | D)^xᵢ × P(sᵢ | ¬D)^(1-xᵢ)
//  - Entropia de Shannon sobre a distribuição de hipóteses
//  - Information Gain ponderado por custo da pergunta
//  - Penalização de redundância para sintomas correlacionados
//  - Modo "alvo": quando uma hipótese lidera, prioriza perguntas que
//    confirmem ou excluam ESSA hipótese (em vez de balancear todas)
//
// O motor é puro e lê tudo de um kb normalizado (kb/buildFromSeed.js
// ou banco): createEngine(kb, { categories }) devolve as funções já
// presas àquele kb. Os exports antigos (computePosterior, ...) são
// wrappers sobre o engine crônico montado do JS, com o mesmo resultado
// da v7 (tests/engine.golden.test.js confere).

const { CORRELATIONS } = require('./matrix');
const { evalWhen } = require('./kb/conditions');

const EPS = 1e-9;

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// ─── Entropia (não depende do kb) ───────────────────────────────────
const shannon = (probs) => {
  let h = 0;
  for (const p of probs) {
    if (p <= EPS) continue;
    h -= p * Math.log2(p);
  }
  return h;
};

const distribution = (posteriors) => {
  const ps = Object.values(posteriors).map(h => h.posterior);
  const sum = ps.reduce((a, b) => a + b, 0) + EPS;
  return ps.map(p => p / sum);
};

// ─── Classificação de risco a partir do top posterior ───────────────
const classifyRisk = (posteriors) => {
  const sorted = Object.values(posteriors).sort((a, b) => b.posterior - a.posterior);
  const top = sorted[0];
  if (!top) return { riskLevel: 'INCONCLUSIVE', score: null, ranking: [] };

  let level;
  if (top.posterior >= 0.85) level = 'CRITICAL';
  else if (top.posterior >= 0.65) level = 'HIGH';
  else if (top.posterior >= 0.35) level = 'MODERATE';
  else if (top.posterior >= 0.15) level = 'LOW';
  else level = 'INCONCLUSIVE';

  return {
    riskLevel: level,
    score:     Math.round(top.posterior * 100),
    ranking:   sorted.slice(0, 5).map(h => ({
      code:      h.code,
      label:     h.label,
      posterior: Number(h.posterior.toFixed(3)),
      prior:     Number(h.prior.toFixed(3)),
    })),
  };
};

// Condição de parada da sessão adaptativa
const shouldStop = (posteriors, askedCount, opts = {}) => {
  const maxQ          = opts.maxQuestions      ?? 18;
  const minQ          = opts.minQuestions      ?? 6;
  const confThreshold = opts.confidenceCutoff  ?? 0.80;

  if (askedCount >= maxQ) return { stop: true, reason: 'max_questions' };
  if (askedCount < minQ)  return { stop: false };

  const top = Object.values(posteriors).sort((a, b) => b.posterior - a.posterior)[0];
  if (top && top.posterior >= confThreshold) {
    return { stop: true, reason: 'confidence_reached' };
  }
  return { stop: false };
};

// Evidência positiva (valor 1; aceita o formato { value, weight })
const isPositiveEvidence = (raw) => {
  const v = raw != null && typeof raw === 'object' ? raw.value : raw;
  return v === 1;
};

// ─── Efeito de uma regra de prior ───────────────────────────────────
const applyEffect = (p, rule) => {
  switch (rule.effect) {
    case 'set':      return rule.amount;
    case 'add':      return p + rule.amount;
    case 'multiply': return p * rule.amount;
    default: throw new Error(`Efeito de regra desconhecido: "${rule.effect}" (regra ${rule.id})`);
  }
};

// ─── Engine ─────────────────────────────────────────────────────────
//
// kb: { conditions, priorRules, symptoms, conditionSymptoms, ... }
// opts.categories: ['CRONICA'] / ['ONCOLOGICA'] / null (todas)
// opts.correlations: pares [a, b, r] para a penalização de redundância
//   (padrão: matrix.CORRELATIONS; ficam em código, fora do banco)
// opts.supersedes: { sintomaRelatado: achadoObjetivo }. Numa condição que
//   tem likelihood para o achado objetivo, se a evidência traz esse achado
//   POSITIVO (valor 1), o relatado não conta (entra no "por quê" com delta
//   0 e `supersededBy`). Achado objetivo ausente ou 0 não substitui nada:
//   a resposta conta normalmente. Evita contar a mesma perda de peso duas vezes. O
//   motor crônico não usa (padrão {}), então o v7 não muda.
const createEngine = (kb, { categories = null, correlations = CORRELATIONS, supersedes = {} } = {}) => {
  // Condições ativas da categoria, na ordem de sortOrder. A ordem importa:
  // é a ordem das chaves do posterior, da soma da entropia e do desempate.
  const conditions = kb.conditions
    .filter(c => c.active !== false && (!categories || categories.includes(c.category)))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const condByCode = new Map(conditions.map(c => [c.code, c]));

  // Regras de prior por condição, ativas, em ordem de sortOrder
  const rulesByCond = new Map(conditions.map(c => [c.code, []]));
  for (const r of kb.priorRules) {
    if (r.active === false) continue;
    rulesByCond.get(r.conditionCode)?.push(r);
  }
  for (const list of rulesByCond.values()) list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  // Likelihoods: condição → (sintoma → { pSx, pNoSx, lrPos }).
  // Sintoma desativado na base deixa de contar como evidência.
  const inactiveSymptoms = new Set(kb.symptoms.filter(s => s.active === false).map(s => s.code));
  const likelihoods = new Map(conditions.map(c => [c.code, new Map()]));
  for (const cs of kb.conditionSymptoms) {
    if (inactiveSymptoms.has(cs.symptomCode)) continue;
    likelihoods.get(cs.conditionCode)?.set(cs.symptomCode, cs);
  }
  // Quantas condições enxergam cada sintoma (normaliza o preditivo)
  const seenBy = new Map();
  for (const lk of likelihoods.values()) {
    for (const sx of lk.keys()) seenBy.set(sx, (seenBy.get(sx) ?? 0) + 1);
  }

  const correlationMap = new Map();
  for (const [a, b, r] of correlations) {
    if (!correlationMap.has(a)) correlationMap.set(a, new Map());
    if (!correlationMap.has(b)) correlationMap.set(b, new Map());
    correlationMap.get(a).set(b, r);
    correlationMap.get(b).set(a, r);
  }
  const getCorrelation = (a, b) => correlationMap.get(a)?.get(b) ?? 0;

  // ─── Prior ────────────────────────────────────────────────────────
  // p = basePrior; regras em ordem; teto maxPrior no fim. `steps`, se
  // vier, recebe o rastro (mesma conta, para o "por quê" bater).
  const runPrior = (code, profile, steps) => {
    const cond = condByCode.get(code);
    if (!cond) return 0.05; // contrato v7 para código desconhecido
    let p = cond.basePrior;
    for (const rule of rulesByCond.get(code)) {
      if (!evalWhen(rule.when, profile)) continue;
      const before = p;
      p = applyEffect(p, rule);
      if (steps) {
        steps.push({
          ruleId: rule.id, label: rule.label, kind: rule.kind,
          effect: rule.effect, amount: rule.amount, modifiable: rule.modifiable,
          sourceCode: rule.sourceCode, before, after: p,
        });
      }
    }
    return Math.min(cond.maxPrior ?? 0.95, p);
  };

  const resolvePrior = (code, profile = {}) => runPrior(code, profile, null);

  const priorTrace = (code, profile = {}) => {
    const cond = condByCode.get(code);
    const steps = [];
    const prior = runPrior(code, profile, steps);
    const uncapped = steps.length ? steps[steps.length - 1].after : (cond?.basePrior ?? prior);
    return {
      code,
      label:     cond?.label ?? null,
      basePrior: cond?.basePrior ?? null,
      maxPrior:  cond ? (cond.maxPrior ?? 0.95) : null,
      steps,
      capped:    uncapped > prior, // o teto maxPrior cortou o valor
      prior,
    };
  };

  // ─── Laço interno do posterior (um só, para posterior e explicação)
  //
  // evidence: { [symptomKey]: 0 | 1 | { value: 0|1, weight: number } }
  //   weight permite que uma evidência da pulseira "pese mais" que um
  //   sintoma autorrelatado — basta repetir o termo no produto.
  const scoreCondition = (cond, evidence, profile, contributions) => {
    const prior = clamp01(resolvePrior(cond.code, profile));
    const logOddsPrior = Math.log(Math.max(prior, EPS) / Math.max(1 - prior, EPS));
    let logOdds = logOddsPrior;
    const lk = likelihoods.get(cond.code);

    for (const [sx, raw] of Object.entries(evidence)) {
      const def = lk.get(sx);
      if (!def) continue; // sintoma não pertinente a essa condição

      const value  = typeof raw === 'object' ? raw.value  : raw;
      const weight = typeof raw === 'object' ? Math.max(0, raw.weight ?? 1) : 1;
      if (value == null || (value !== 0 && value !== 1)) continue;

      const by = supersedes[sx];
      if (by && lk.has(by) && isPositiveEvidence(evidence[by])) {
        if (contributions) {
          contributions.push({ symptomCode: sx, value, weight: 0, lr: 1, deltaLogOdds: 0, supersededBy: by });
        }
        continue;
      }

      const pSx     = clamp01(def.pSx);
      const pNoSx   = clamp01(def.pNoSx);
      const lr = value === 1
        ? Math.max(pSx, EPS)     / Math.max(pNoSx, EPS)
        : Math.max(1 - pSx, EPS) / Math.max(1 - pNoSx, EPS);

      const delta = weight * Math.log(lr);
      logOdds += delta;
      if (contributions) {
        contributions.push({ symptomCode: sx, value, weight, lr, deltaLogOdds: delta });
      }
    }

    const odds = Math.exp(logOdds);
    const post = odds / (1 + odds);
    return { prior, logOddsPrior, logOdds, posterior: clamp01(post) };
  };

  // profile: { age, sex, bmi, smoker, packYears, familyHistoryDm, ... }
  const computePosterior = (evidence = {}, profile = {}) => {
    const result = {};
    for (const cond of conditions) {
      const { prior, posterior } = scoreCondition(cond, evidence, profile, null);
      result[cond.code] = { code: cond.code, label: cond.label, prior, posterior };
    }
    return result;
  };

  // "Por quê": prior com o rastro das regras + contribuição de cada
  // evidência em log-odds (soma de deltaLogOdds = logOdds - logOddsPrior).
  const explain = (evidence = {}, profile = {}) => {
    const out = {};
    for (const cond of conditions) {
      const contributions = [];
      const s = scoreCondition(cond, evidence, profile, contributions);
      out[cond.code] = {
        code: cond.code,
        label: cond.label,
        category: cond.category,
        prior: s.prior,
        priorTrace: priorTrace(cond.code, profile),
        logOddsPrior: s.logOddsPrior,
        logOdds: s.logOdds,
        contributions,
        posterior: s.posterior,
      };
    }
    return out;
  };

  // Probabilidade de o sintoma estar presente, marginalizada sobre as
  // condições atuais. Usada para calcular IG sem pular para o futuro.
  const predictiveSymptomProb = (sx, posteriors) => {
    let p = 0;
    for (const [code, h] of Object.entries(posteriors)) {
      const def = likelihoods.get(code)?.get(sx);
      if (!def) continue;
      p += h.posterior * def.pSx + (1 - h.posterior) * def.pNoSx;
    }
    // Normalizado pelo número de condições que enxergam o sintoma
    const n = seenBy.get(sx) ?? 0;
    return n === 0 ? 0.5 : clamp01(p / n);
  };

  // Atualiza posteriores hipotéticos como se o sintoma viesse com valor v.
  const projectPosteriorOnSymptom = (sx, value, evidence, profile) =>
    computePosterior({ ...evidence, [sx]: value }, profile);

  const informationGain = (sx, evidence, profile) => {
    const basePost = computePosterior(evidence, profile);
    const Hbase    = shannon(distribution(basePost));

    const pPos = predictiveSymptomProb(sx, basePost);
    const pNeg = 1 - pPos;

    const Hpos = shannon(distribution(projectPosteriorOnSymptom(sx, 1, evidence, profile)));
    const Hneg = shannon(distribution(projectPosteriorOnSymptom(sx, 0, evidence, profile)));

    const Hcond = pPos * Hpos + pNeg * Hneg;
    return Math.max(0, Hbase - Hcond);
  };

  // ─── Seleção de próxima pergunta ──────────────────────────────────
  //
  // candidates: lista de { symptom, cost (1-5), question (qualquer payload) }
  //
  // Aplica:
  //  - IG ponderado: IG / cost
  //  - Penalização de redundância contra sintomas já respondidos
  //  - Modo "alvo": se top hipótese > 0.5, dá bônus para sintomas mais
  //    discriminativos para essa condição específica
  const selectNextSymptom = (candidates, evidence, profile, opts = {}) => {
    const askedSet = new Set(Object.keys(evidence));
    const filtered = candidates.filter(c => !askedSet.has(c.symptom));
    if (filtered.length === 0) return null;

    const posts = computePosterior(evidence, profile);
    const top   = Object.values(posts).sort((a, b) => b.posterior - a.posterior)[0];
    const targetMode = top && top.posterior > (opts.targetThreshold ?? 0.5);

    let best = null;
    for (const cand of filtered) {
      const ig = informationGain(cand.symptom, evidence, profile);
      const cost = Math.max(1, cand.cost ?? 1);

      // Penalização de redundância: reduz IG conforme a maior correlação
      // com os sintomas já respondidos.
      let redundancy = 0;
      for (const askedSx of askedSet) {
        const r = getCorrelation(cand.symptom, askedSx);
        if (r > redundancy) redundancy = r;
      }
      const redundancyFactor = 1 - redundancy * 0.7;

      // Bônus por modo alvo: peso extra se o sintoma é específico para a
      // hipótese líder (LR+ alto).
      let targetBonus = 1;
      if (targetMode) {
        const def = likelihoods.get(top.code).get(cand.symptom);
        if (def && def.lrPos >= 5) targetBonus = 1.4;
        else if (def && def.lrPos >= 3) targetBonus = 1.2;
        else if (!def) targetBonus = 0.8; // sintoma não fala da hipótese líder
      }

      const score = (ig / cost) * redundancyFactor * targetBonus;

      if (!best || score > best.score) {
        best = { ...cand, ig, score, redundancyFactor, targetBonus };
      }
    }

    return best;
  };

  return {
    kb,
    categories,
    conditionCodes: conditions.map(c => c.code),
    resolvePrior,
    priorTrace,
    computePosterior,
    explain,
    predictiveSymptomProb,
    informationGain,
    selectNextSymptom,
    getCorrelation,
    classifyRisk,
    shouldStop,
    shannon,
  };
};

// ─── Wrappers v7 (engine crônico com o kb montado do JS) ────────────
// require tardio: buildFromSeed → questions → (nada daqui), mas manter
// o kb fora do carregamento deste módulo evita ciclos futuros.
let defaultEngine = null;
const getDefaultEngine = () => {
  if (!defaultEngine) {
    const { getSeedKb } = require('./kb/buildFromSeed');
    defaultEngine = createEngine(getSeedKb(), { categories: ['CRONICA'] });
  }
  return defaultEngine;
};

const computePosterior      = (evidence, profile) => getDefaultEngine().computePosterior(evidence, profile);
const predictiveSymptomProb = (sx, posteriors) => getDefaultEngine().predictiveSymptomProb(sx, posteriors);
const informationGain       = (sx, evidence, profile) => getDefaultEngine().informationGain(sx, evidence, profile);
const selectNextSymptom     = (candidates, evidence, profile, opts) =>
  getDefaultEngine().selectNextSymptom(candidates, evidence, profile, opts);

module.exports = {
  createEngine,
  getDefaultEngine,
  computePosterior,
  predictiveSymptomProb,
  informationGain,
  selectNextSymptom,
  classifyRisk,
  shouldStop,
  shannon,
};
