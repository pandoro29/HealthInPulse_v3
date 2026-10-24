// ─── Exames → evidência (LabRule × ExamResult.findings) ─────────────
// Cada LabRule diz: "um achado cujo nome é um destes aliases, comparado
// com este limiar, vira o sintoma X". Exemplos (data/oncology.js):
//   Hemoglobina < 13 (homem) → anemia_hb_baixa
//   Sangue oculto positivo   → fit_positivo
//   PSA > 4,5 (60–69 anos)   → psa_acima_idade
//
// Regras de leitura:
//   - nome do achado sem acento, minúsculo e com espaços normalizados; casa
//     com o alias inteiro (ou com o nome sem o trecho entre parênteses:
//     "Sangue oculto nas fezes (FIT)" → "sangue oculto nas fezes"). Nunca
//     por prefixo: "Hemoglobina glicada" não pode virar hemoglobina;
//   - número aceita vírgula decimal ("10,9") e lixo em volta ("4A" → 4,
//     útil no BI-RADS);
//   - operador 'positive': valor/status "positivo", "reagente",
//     "detectado", "alterado", "presente", ASC-US/LSIL/HSIL... vale 1;
//     "negativo", "não reagente", "não detectado", "normal", "ausente",
//     NILM vale 0 (a negação é conferida antes);
//   - sexFilter e minAge/maxAge (inclusivos) da regra contra o perfil;
//     regra com filtro e perfil sem o dado não se aplica;
//   - exame mais velho que maxAgeDays é ignorado;
//   - resultado normal só vira evidência (valor 0) se emitNegative;
//   - o mesmo sintoma em vários exames: vale o MAIS RECENTE.

const { parseJson } = require('../../utils/jsonField');

const DAY_MS = 24 * 3600 * 1000;

const normText = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

const nameVariants = (name) => {
  const full = normText(name);
  const noParens = normText(full.replace(/\([^)]*\)/g, ' '));
  return noParens && noParens !== full ? [full, noParens] : [full];
};

// Primeiro número do texto; vírgula decimal vale. null se não houver.
const parseNumber = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = String(v ?? '').match(/-?\d+(?:[.,]\d+)?/);
  return m ? Number(m[0].replace(',', '.')) : null;
};

const NEGATIVE = /\bnao (reagente|detectad[oa]|detectavel|reativo)\b|\bnegativ|\bnormal\b|\bausente\b|\bnilm\b|dentro da normalidade|\bnegative\b/;
const POSITIVE = /positiv|\breagente\b|\breativo\b|detectad[oa]|alterad[oa]|\bpresente\b|asc-?us|asc-?h|\blsil\b|\bhsil\b|\bagc\b|\bpositive\b/;

// 1 / 0 / null a partir do valor e do status do achado
const parsePositive = (finding) => {
  for (const raw of [finding.value, finding.status, finding.result]) {
    if (raw === true) return 1;
    if (raw === false) return 0;
    const t = normText(raw);
    if (!t) continue;
    if (NEGATIVE.test(t)) return 0;
    if (POSITIVE.test(t)) return 1;
  }
  return null;
};

const compare = {
  gt:  (x, t) => x >  t,
  gte: (x, t) => x >= t,
  lt:  (x, t) => x <  t,
  lte: (x, t) => x <= t,
};

const ruleAppliesTo = (rule, profile) => {
  if (rule.sexFilter && profile.sex !== rule.sexFilter) return false;
  if (rule.minAge != null && !(profile.age != null && profile.age >= rule.minAge)) return false;
  if (rule.maxAge != null && !(profile.age != null && profile.age <= rule.maxAge)) return false;
  return true;
};

// Exame em qualquer um dos formatos: linha do Prisma com examResult
// (findings em string JSON), ou objeto simples { date, title, findings }.
const examDate = (e) => new Date(e.date ?? e.uploadedAt ?? e.processedAt ?? e.createdAt ?? e.examResult?.createdAt ?? NaN);
const examFindings = (e) => {
  const f = e.findings ?? e.examResult?.findings ?? [];
  return Array.isArray(f) ? f : parseJson(f, []);
};

// fromExams(kb, exams, { profile, now }) →
//   { evidence: { [symptomCode]: { value: 0|1, weight } },
//     items:   [{ ruleId, ruleCode, label, symptomCode, value, findingName, rawValue,
//                 numericValue, unit, operator, threshold, examTitle, date, ageDays, sourceCode }],
//     ignored: [{ ruleCode, findingName, examTitle, reason }] }
const fromExams = (kb, exams = [], { profile = {}, now = new Date() } = {}) => {
  const rules = (kb.labRules ?? [])
    .filter(r => r.active !== false)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const aliasIndex = rules.map(r => ({ rule: r, aliases: new Set((r.aliases ?? []).map(normText)) }));

  const sorted = [...exams]
    .map(e => ({ e, date: examDate(e) }))
    .sort((a, b) => (b.date.getTime() || 0) - (a.date.getTime() || 0)); // mais recente primeiro

  const evidence = {};
  const items = [];
  const ignored = [];

  for (const { e, date } of sorted) {
    const ageDays = Number.isNaN(date.getTime()) ? null : Math.floor((now - date) / DAY_MS);
    const examTitle = e.title ?? null;
    for (const finding of examFindings(e)) {
      if (!finding || finding.name == null) continue;
      const names = nameVariants(finding.name);
      for (const { rule, aliases } of aliasIndex) {
        if (!names.some(n => aliases.has(n))) continue;
        if (!ruleAppliesTo(rule, profile)) continue; // ex.: Hb da regra do outro sexo
        const skip = (reason) => ignored.push({ ruleCode: rule.code, findingName: finding.name, examTitle, reason });
        if (evidence[rule.symptomCode] !== undefined) { skip('há exame mais recente'); continue; }
        if (ageDays == null) { skip('sem data'); continue; }
        if (ageDays > (rule.maxAgeDays ?? 365)) { skip(`exame de ${ageDays} dias (limite ${rule.maxAgeDays ?? 365})`); continue; }

        let value = null;
        let numericValue = null;
        if (rule.operator === 'positive') {
          value = parsePositive(finding);
        } else if (compare[rule.operator]) {
          numericValue = parseNumber(finding.value);
          if (numericValue != null) value = compare[rule.operator](numericValue, rule.threshold) ? 1 : 0;
        }
        if (value == null) { skip('valor ilegível'); continue; }
        if (value === 0 && !rule.emitNegative) continue;

        evidence[rule.symptomCode] = { value, weight: rule.weight ?? 1 };
        items.push({
          ruleId: rule.id, ruleCode: rule.code, label: rule.label, symptomCode: rule.symptomCode, value,
          findingName: finding.name, rawValue: finding.value ?? null, numericValue,
          unit: finding.unit ?? rule.unit ?? null, operator: rule.operator, threshold: rule.threshold,
          examTitle, date: date.toISOString(), ageDays, sourceCode: rule.sourceCode,
        });
      }
    }
  }
  return { evidence, items, ignored };
};

// Exames do paciente no banco (com resultado), já lidos pelas LabRules
// (require do banco só aqui: o resto do módulo é puro e roda sem banco)
const collectFromDatabase = async (kb, patientId, { profile = {}, now = new Date() } = {}) => {
  const prisma = require('../../config/database');
  const maxDays = Math.max(365, ...(kb.labRules ?? []).map(r => r.maxAgeDays ?? 365));
  const exams = await prisma.exam.findMany({
    where:   { patientId, uploadedAt: { gte: new Date(now.getTime() - maxDays * DAY_MS) }, examResult: { isNot: null } },
    include: { examResult: true },
    orderBy: { uploadedAt: 'desc' },
  });
  return fromExams(kb, exams, { profile, now });
};

module.exports = { fromExams, collectFromDatabase, parseNumber, parsePositive, normText };
