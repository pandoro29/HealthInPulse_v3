// ─── Motor de risco explicável (câncer + crônicas) ──────────────────
// Puro: recebe o kb (do banco ou do buildFromSeed) e os dados da pessoa,
// devolve o risco de cada condição com o "por quê" fator a fator. Não
// toca no banco, então serve igual para o teste público (/teste), para o
// fim da triagem e para o painel da médica.
//
// Matemática (a mesma do bayes.createEngine, mesmo laço interno):
//   prior     = faixa de idade e sexo (BASELINE) × fatores de risco (RISK_FACTOR)
//   posterior = logit⁻¹( logit(prior) + Σ delta ),  delta = peso × ln LR
//   Invariante: logit(prior) + Σ contributions[].delta = logit(posterior)
//   (os fatores de risco ficam em `factors`, já dentro do prior).
//
// Classificação oncológica (NICE NG12 para o limiar de 3%):
//   INVESTIGAR se P ≥ alertThreshold (3%)
//   ATENÇÃO    se P ≥ watchThreshold (1%) ou risco relativo ≥ 2
//   ROTINA     no resto.            No banco: HIGH / MODERATE / LOW.
// Risco relativo = posterior ÷ prior da faixa (média da mesma idade e sexo).
//
// Exibição: acima de 20% a UI mostra "≥20%" (naive Bayes fica confiante
// demais com evidências correlacionadas, ex. FIT+ e anemia). O número
// exato continua em `posterior`; `display` já traz o texto.

const bayes = require('./bayes');
const redFlags = require('./redFlags');
const screening = require('./screening');
const { normalizeProfile } = require('./profile');
const { directRules } = require('./data/oncology');

const isYes = (v) => v === true || v === 1 || v === '1' || v === 'sim' || v === 'Sim' || v === 'true';

const LEVEL = { INVESTIGAR: 'INVESTIGAR', ATENCAO: 'ATENÇÃO', ROTINA: 'ROTINA' };
const LEVEL_RANK = { [LEVEL.ROTINA]: 0, [LEVEL.ATENCAO]: 1, [LEVEL.INVESTIGAR]: 2 };
const LEVEL_TO_RISK = { [LEVEL.INVESTIGAR]: 'HIGH', [LEVEL.ATENCAO]: 'MODERATE', [LEVEL.ROTINA]: 'LOW' };
const RR_WATCH = 2;
const DISPLAY_CAP = 0.20;

// Achado objetivo substitui o relatado no motor oncológico (só nele: a
// fase crônica e o red flag NEOPLASIA continuam usando a resposta).
// "Pesado na balança": com perda_peso_objetiva POSITIVA (valor 1), a
// resposta "perdi peso" não conta nos cânceres que têm a balança. Sem a
// balança mostrando perda, a resposta conta normalmente.
const SUPERSEDES = { perda_peso_inexplicada: 'perda_peso_objetiva' };

const logit = (p) => Math.log(p / (1 - p));

// ─── Engines memorizados por kb (o kb do repositório é imutável) ────
const engines = new WeakMap();
const enginesFor = (kb) => {
  let e = engines.get(kb);
  if (!e) {
    e = {
      onco:    bayes.createEngine(kb, { categories: ['ONCOLOGICA'], supersedes: SUPERSEDES }),
      chronic: bayes.createEngine(kb, { categories: ['CRONICA'] }),
    };
    // só kb congelado (o do repositório): um kb mutável pode mudar depois
    if (Object.isFrozen(kb)) engines.set(kb, e);
  }
  return e;
};

// ─── Respostas → 0/1 ────────────────────────────────────────────────
const toBin = (raw) => {
  if (raw != null && typeof raw === 'object' && 'value' in raw) return toBin(raw.value);
  if (raw === true || raw === 1 || raw === '1') return 1;
  if (raw === false || raw === 0 || raw === '0') return 0;
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (['sim', 's', 'true', 'yes'].includes(s)) return 1;
    if (['nao', 'n', 'false', 'no'].includes(s)) return 0;
  }
  return null; // "não sei" / vazio: não é evidência
};

const weightOf = (raw) => (raw != null && typeof raw === 'object' ? (raw.weight ?? 1) : 1);

// Junta as fontes de evidência. Mesma regra da triagem: a resposta
// sobrescreve a pulseira, exceto evidência objetiva forte (weight ≥ 2).
// Exame vence tudo (é medido).
const mergeEvidence = ({ answers = {}, wearableEvidence = {}, labEvidence = {} }) => {
  const ev = {};
  for (const [k, v] of Object.entries(wearableEvidence)) ev[k] = v;
  for (const [k, raw] of Object.entries(answers)) {
    const b = toBin(raw);
    if (b == null) continue;
    if (!ev[k] || weightOf(ev[k]) < 2) ev[k] = b;
  }
  for (const [k, v] of Object.entries(labEvidence)) ev[k] = v;
  return ev;
};

// ─── Texto ──────────────────────────────────────────────────────────
const pct = (p) => {
  if (p == null) return null;
  if (p >= DISPLAY_CAP) return '≥20%';
  const x = p * 100;
  if (x < 0.01) return '<0,01%';
  const digits = x < 1 ? 2 : 1;
  return `${x.toFixed(digits).replace('.', ',')}%`;
};

// Frequência natural: "~3 em 1.000" (ou "~2 em 10.000" se for raro)
const naturalFrequency = (p) => {
  if (p == null) return null;
  if (p >= DISPLAY_CAP) return 'mais de 1 em 5';
  for (const base of [100, 1000, 10000]) {
    const n = Math.round(p * base);
    if (n >= 1) return `~${n} em ${base.toLocaleString('pt-BR')}`;
  }
  return 'menos de 1 em 10.000';
};

const rrText = (rr) => (rr == null ? null : `${rr.toFixed(1).replace('.', ',')}×`);

const answerText = (kind, value) => {
  if (kind === 'LAB') return value === 1 ? 'alterado' : 'normal';
  if (kind === 'WEARABLE') return value === 1 ? 'detectado' : 'não detectado';
  return value === 1 ? 'sim' : 'não';
};

// ─── Uma condição oncológica ────────────────────────────────────────
const classify = (cond, posterior, relativeRisk) => {
  if (posterior >= (cond.alertThreshold ?? 0.03)) return LEVEL.INVESTIGAR;
  if (posterior >= (cond.watchThreshold ?? 0.01) || (relativeRisk != null && relativeRisk >= RR_WATCH)) return LEVEL.ATENCAO;
  return LEVEL.ROTINA;
};

// Prior da faixa: só as regras BASELINE (média da mesma idade e sexo)
const baselineFrom = (trace, cond) => {
  let p = cond.basePrior;
  for (const s of trace.steps) {
    if (s.kind !== 'BASELINE') continue;
    if (s.effect === 'set') p = s.amount;
    else if (s.effect === 'multiply') p *= s.amount;
    else if (s.effect === 'add') p += s.amount;
  }
  return Math.min(cond.maxPrior ?? 0.95, p);
};

const sourceInfo = (sourceByCode, code) => {
  if (!code) return null;
  const s = sourceByCode.get(code);
  return s ? { code: s.code, citation: s.citation, year: s.year, url: s.url } : { code };
};

const describeContributions = (raw, ctx) => raw.map((c) => {
  const sym = ctx.symptomByCode.get(c.symptomCode);
  const cs = ctx.csByKey.get(`${ctx.cond.code}|${c.symptomCode}`);
  const kind = sym?.kind ?? 'QUESTION';
  const out = {
    kind,
    code: c.symptomCode,
    label: sym?.label ?? c.symptomCode,
    answer: answerText(kind, c.value),
    value: c.value,
    weight: c.weight,
    factor: Math.exp(c.deltaLogOdds), // quanto multiplica a chance (odds)
    delta: c.deltaLogOdds,
    source: sourceInfo(ctx.sourceByCode, cs?.sourceCode),
    note: null,
  };
  if (c.supersededBy) {
    out.superseded = true;
    out.supersededBy = c.supersededBy;
    out.note = 'Não contou: a perda de peso foi pesada na balança, que substitui a resposta.';
  } else if (Object.values(SUPERSEDES).includes(c.symptomCode)) {
    out.note = 'Pesado na balança.';
  }
  const lab = ctx.labItems.find(i => i.symptomCode === c.symptomCode);
  if (lab) {
    out.note = `${lab.findingName}: ${lab.rawValue ?? ''}${lab.unit ? ` ${lab.unit}` : ''} (${lab.examTitle ?? 'exame'}, há ${lab.ageDays} dias)`.trim();
  }
  return out;
});

const assessCondition = (cond, ex, profile, ctx) => {
  const age = profile.age;
  if (cond.minAge != null && age != null && age < cond.minAge) {
    return {
      code: cond.code, label: cond.label, category: cond.category, eligible: false,
      reason: `Avaliado a partir dos ${cond.minAge} anos.`,
      level: LEVEL.ROTINA, riskLevel: LEVEL_TO_RISK[LEVEL.ROTINA],
      prior: null, baselinePrior: null, posterior: null, relativeRisk: null,
      factors: [], contributions: [], display: null,
      alertThreshold: cond.alertThreshold, watchThreshold: cond.watchThreshold,
    };
  }

  const trace = ex.priorTrace;
  const baselinePrior = baselineFrom(trace, cond);
  const relativeRisk = baselinePrior > 0 ? ex.posterior / baselinePrior : null;
  const level = classify(cond, ex.posterior, relativeRisk);

  const factors = trace.steps
    .filter(s => s.kind !== 'BASELINE')
    .map(s => ({
      ruleId: s.ruleId, kind: s.kind, label: s.label, effect: s.effect,
      factor: s.effect === 'multiply' ? s.amount : null, amount: s.amount,
      modifiable: s.modifiable, source: sourceInfo(ctx.sourceByCode, s.sourceCode),
    }));

  return {
    code: cond.code, label: cond.label, category: cond.category, eligible: true, reason: null,
    level, riskLevel: LEVEL_TO_RISK[level],
    prior: ex.prior, baselinePrior, posterior: ex.posterior, relativeRisk,
    priorRelativeRisk: baselinePrior > 0 ? ex.prior / baselinePrior : null,
    logOddsPrior: ex.logOddsPrior, logOdds: ex.logOdds,
    factors,
    contributions: describeContributions(ex.contributions, { ...ctx, cond }),
    alertThreshold: cond.alertThreshold, watchThreshold: cond.watchThreshold,
    display: {
      posterior: pct(ex.posterior),
      capped: ex.posterior >= DISPLAY_CAP,
      frequency: naturalFrequency(ex.posterior),
      relativeRisk: rrText(relativeRisk),
    },
  };
};

// ─── API ────────────────────────────────────────────────────────────
// assess(kb, { profile, answers, labEvidence, wearableEvidence, wearable, now })
//   profile          perfil cru ou normalizado (normalizeProfile roda aqui)
//   answers          { sintoma: true/false/1/0/'sim'/'não' } (respostas)
//   labEvidence      { sintoma: {value, weight} } ou o retorno de
//                    labEvidence.fromExams ({ evidence, items })
//   wearableEvidence { sintoma: {value, weight} } (pulseira + balança)
//   wearable         snapshot da pulseira, só para os red flags (opcional)
const assess = (kb, {
  profile: rawProfile = {}, answers = {}, labEvidence = {}, wearableEvidence = {}, wearable = null,
} = {}) => {
  const profile = normalizeProfile(rawProfile);
  const labMap = labEvidence?.evidence ?? labEvidence ?? {};
  const labItems = labEvidence?.items ?? [];
  const evidence = mergeEvidence({ answers, wearableEvidence, labEvidence: labMap });
  const { onco, chronic } = enginesFor(kb);

  const ctx = {
    labItems,
    sourceByCode:  new Map(kb.sources.map(s => [s.code, s])),
    symptomByCode: new Map(kb.symptoms.map(s => [s.code, s])),
    csByKey:       new Map(kb.conditionSymptoms.map(cs => [`${cs.conditionCode}|${cs.symptomCode}`, cs])),
  };
  const condByCode = new Map(kb.conditions.map(c => [c.code, c]));

  // Oncologia: só os cânceres do sexo da pessoa (sem próstata para mulher)
  const oncoExplain = onco.explain(evidence, profile);
  const oncology = onco.conditionCodes
    .map(code => condByCode.get(code))
    .filter(c => !c.sexFilter || !profile.sex || c.sexFilter === profile.sex)
    .map(c => assessCondition(c, oncoExplain[c.code], profile, ctx));

  // Regras diretas da diretriz (sem LR): sobem o nível mínimo do câncer
  for (const r of directRules) {
    const o = oncology.find(x => x.code === r.conditionCode && x.eligible);
    if (!o || !isYes(answers[r.symptomCode]) || LEVEL_RANK[o.level] >= LEVEL_RANK[r.level]) continue;
    o.level = r.level;
    o.riskLevel = LEVEL_TO_RISK[r.level];
    o.directRule = { label: r.label, source: sourceInfo(ctx.sourceByCode, r.sourceCode) };
  }

  // Crônicas: posterior com o "por quê" (o nível crônico continua sendo
  // o da triagem: engine.classifyRisk sobre o maior posterior)
  const chronicExplain = chronic.explain(evidence, profile);
  const chronicList = chronic.conditionCodes.map((code) => {
    const e = chronicExplain[code];
    return {
      code, label: e.label, category: e.category, prior: e.prior, posterior: e.posterior,
      logOddsPrior: e.logOddsPrior, logOdds: e.logOdds,
      contributions: describeContributions(e.contributions, { ...ctx, cond: condByCode.get(code) }),
    };
  });
  const chronicVerdict = chronic.classifyRisk(chronic.computePosterior(evidence, profile));

  // Rastreamento; câncer em INVESTIGAR leva aviso (o caminho é avaliação,
  // não rastreio de quem não tem sintoma)
  const investigate = new Set(oncology.filter(o => o.level === LEVEL.INVESTIGAR).map(o => o.code));
  const screeningList = screening.evaluate(kb, profile).map(s => ({
    ...s,
    investigate: investigate.has(s.conditionCode),
    note: investigate.has(s.conditionCode)
      ? 'Com os sinais encontrados, o próximo passo é a avaliação médica, não o rastreamento de rotina.'
      : null,
  }));

  // O que a pessoa pode mudar: fatores modificáveis que pesaram no prior
  const modifiable = [];
  for (const o of oncology) {
    for (const f of o.factors) {
      if (!f.modifiable) continue;
      modifiable.push({ conditionCode: o.code, conditionLabel: o.label, ruleId: f.ruleId,
        label: f.label, factor: f.factor, source: f.source });
    }
  }

  const top = oncology.reduce((m, o) => (LEVEL_RANK[o.level] > LEVEL_RANK[m] ? o.level : m), LEVEL.ROTINA);

  return {
    kbVersion: kb.version ?? 0,
    profile,
    oncology,
    oncologyLevel: top,
    oncologyRiskLevel: LEVEL_TO_RISK[top],
    chronic: chronicList,
    chronicRiskLevel: chronicVerdict.riskLevel,
    screening: screeningList,
    modifiable,
    redFlag: redFlags.detectRedFlag({ answers, wearable: wearable ?? {} }),
    evidence,
  };
};

module.exports = {
  assess,
  classify,
  mergeEvidence,
  naturalFrequency,
  pct,
  logit,
  SUPERSEDES,
  LEVEL,
  LEVEL_RANK,
  LEVEL_TO_RISK,
  DISPLAY_CAP,
};
