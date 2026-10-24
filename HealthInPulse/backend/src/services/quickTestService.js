// ─── Teste rápido público (/teste, POST /api/public/quick-test) ─────
// Sem login e SEM ESTADO: o visitante manda a cada chamada tudo o que já
// respondeu ({ profile, answers }) e recebe a próxima etapa. Nada é
// gravado no banco nem escrito no log; as respostas vêm só da requisição.
//
//   PROFILE   falta idade ou sexo: devolve o formulário do perfil
//   BLOCKED   menor de 18 anos (o teste é para adultos)
//   QUESTION  primeiro as perguntas fixas das crônicas com escore validado
//             (CHRONIC_QUICK: STOP-Bang, PHQ-2, FINDRISC e um sinal de
//             alarme), depois as do painel RAPIDO (questionRunner, até 6)
//   RESULT    risco dos cânceres (riskEngine.assess), escores das crônicas
//             (chronicScores.evaluate), rastreamento e o que dá para mudar
//
// Cada pergunta sai com `station` (a estação da trilha no /teste).
//
// Puro: recebe o kb (do banco ou do buildFromSeed) e o corpo já validado
// no formato pela rota (publicRoutes). Aqui ficam as regras que dependem
// do kb: só códigos de pergunta do painel RAPIDO (e seus follow-ups).

const riskEngine     = require('./clinical/riskEngine');
const questionRunner = require('./clinical/questionRunner');
const redFlags       = require('./clinical/redFlags');
const chronicScores  = require('./clinical/chronicScores');
const { S } = require('./clinical/matrix');
const { candidatesFor, demographicSchema, getQuestionForSymptom } = require('./clinical/questions');
const { normalizeProfile } = require('./clinical/profile');

const PANEL         = 'RAPIDO';
const MAX_QUESTIONS = 6;  // do painel RAPIDO (cânceres)
const MIN_AGE       = 18;
const MAX_ANSWERS   = 40; // 12 crônicas + 6 RAPIDO + follow-ups, com folga

// Crônicas no teste rápido: só itens dos escores validados (regra R1) e um
// recorte deles para caber em ~3 minutos. Os escores saem parciais
// (subestimam), o que é aceitável num teste educativo. O PHQ-9 completo
// (com a pergunta de ideação) fica só na triagem com login.
// `text` troca o enunciado da triagem por um sem nome de doença (regra R2).
const CHRONIC_QUICK = [
  { code: S.DOR_TORACICA_TIPICA, station: 'CORACAO',
    text: 'Sente dor no peito que piora com esforço e melhora quando descansa?' },
  { code: S.HAS_CONHECIDA,       station: 'CORACAO',
    text: 'Algum médico já disse que a sua pressão é alta?' },
  { code: S.RONCO_ALTO,          station: 'SONO' },
  { code: S.APNEIA_OBSERVADA,    station: 'SONO' },
  { code: S.FADIGA_DIURNA,       station: 'SONO' },
  { code: S.PHQ9_ANEDONIA,       station: 'ANIMO',
    text: 'Nas últimas 2 semanas, com que frequência teve pouco interesse ou prazer em fazer as coisas?' },
  { code: S.PHQ9_HUMOR,          station: 'ANIMO',
    text: 'Nas últimas 2 semanas, com que frequência se sentiu para baixo ou sem esperança?' },
  { code: S.SEDENTARISMO,        station: 'ROTINA' },
  { code: S.POUCAS_FRUTAS_VEG,   station: 'ROTINA' },
  { code: S.CINTURA_AUMENTADA,   station: 'ROTINA',
    text: 'Sua cintura passa de 94 cm (homem) ou 80 cm (mulher)?' },
  { code: S.GLICEMIA_ALTERADA,   station: 'ROTINA',
    text: 'Algum exame de sangue já mostrou açúcar (glicose) alto?' },
  { code: S.HIST_FAM_DM,         station: 'ROTINA',
    text: 'Pai, mãe, irmãos ou filhos tratam açúcar alto no sangue?' },
];
const CHRONIC_CODES = CHRONIC_QUICK.map(c => c.code);
const ONCO_STATION  = 'SINAIS';

const chronicQuestion = ({ code, station, text }) => {
  const q = getQuestionForSymptom(code);
  return { ...q, text: text ?? q.text, followUps: [], station };
};

// Campos do perfil que o teste usa (os que entram no prior dos cânceres)
const PROFILE_FIELDS = [
  'age', 'sex', 'height', 'weight', 'smoker', 'packYears', 'quitYears',
  'alcoholDosesWeek', 'familyHistoryCancer', 'papEmDia',
];
const REQUIRED = ['age', 'sex'];

const DISCLAIMER = 'Teste educativo de risco. Não é diagnóstico e não substitui '
  + 'uma consulta. As porcentagens são estimativas didáticas. Nada do que você respondeu foi gravado.';
const BLOCKED_REASON = 'O teste rápido é para maiores de 18 anos. Converse com seus pais ou responsáveis '
  + 'e com um profissional de saúde se tiver dúvidas.';

// Formulário do perfil: os campos da triagem que importam para câncer.
// Só idade e sexo são obrigatórios (altura e peso melhoram o IMC).
const profileSchema = () => demographicSchema()
  .filter(q => PROFILE_FIELDS.includes(q.id))
  .map(q => ({ ...q, required: REQUIRED.includes(q.id) }));

// Perguntas do painel RAPIDO (ativas) e os follow-ups delas
const allowedCodes = (kb) => {
  const out = new Set(CHRONIC_CODES);
  for (const s of kb.symptoms) {
    if (s.active === false || s.kind !== 'QUESTION' || !(s.panels ?? []).includes(PANEL)) continue;
    out.add(s.code);
    for (const fu of s.followUps ?? []) out.add(fu.id);
  }
  return out;
};

const invalid = (fields) => Object.assign(new Error('Dados inválidos'), { status: 422, fields });

const pick = (obj, keys) => Object.fromEntries(
  Object.entries(obj ?? {}).filter(([k]) => keys.includes(k)),
);

// run(kb, { profile, answers }) → { stage, ... }
const run = (kb, { profile: rawProfile = {}, answers: rawAnswers = {} } = {}) => {
  rawAnswers = rawAnswers ?? {};
  const codes = Object.keys(rawAnswers);
  if (codes.length > MAX_ANSWERS) {
    throw invalid([{ field: 'answers', message: `No máximo ${MAX_ANSWERS} respostas` }]);
  }
  const allowed = allowedCodes(kb);
  const unknown = codes.filter(c => !allowed.has(c));
  if (unknown.length) {
    throw invalid(unknown.map(c => ({ field: `answers.${c}`, message: 'Pergunta desconhecida' })));
  }

  // ─── 1. Perfil ────────────────────────────────────────────────
  const profile = normalizeProfile(pick(rawProfile, PROFILE_FIELDS));
  const missing = REQUIRED.filter(f => profile[f] == null);
  if (missing.length) {
    return { stage: 'PROFILE', schema: profileSchema(), missing, disclaimer: DISCLAIMER };
  }
  if (profile.age < MIN_AGE) {
    return { stage: 'BLOCKED', reason: BLOCKED_REASON, minAge: MIN_AGE, disclaimer: DISCLAIMER };
  }

  // ─── 2. Respostas: só as das perguntas que valem para este perfil ─
  // (ex.: homem que mandou "nódulo na mama" não conta)
  const visible = new Set();
  for (const c of candidatesFor(kb, profile, PANEL)) {
    visible.add(c.symptom);
    for (const fu of c.question.followUps ?? []) visible.add(fu.id);
  }
  for (const c of CHRONIC_CODES) visible.add(c);
  const answers = pick(rawAnswers, [...visible]);
  const has = (c) => Object.prototype.hasOwnProperty.call(answers, c);

  // ─── 3. Próxima pergunta (red flag encerra na hora) ───────────
  const flagged = redFlags.detectRedFlag({ answers });
  if (!flagged) {
    const chronicDone = CHRONIC_QUICK.filter(c => has(c.code)).length;
    const total = CHRONIC_QUICK.length + MAX_QUESTIONS;
    const pending = CHRONIC_QUICK.find(c => !has(c.code));
    if (pending) {
      return { stage: 'QUESTION', question: chronicQuestion(pending), reason: null,
        progress: { asked: chronicDone, max: total } };
    }
    const next = questionRunner.next(kb, { profile, answers, panel: PANEL, max: MAX_QUESTIONS });
    if (next) {
      return { stage: 'QUESTION', question: { ...next.question, station: ONCO_STATION }, reason: next.reason,
        progress: { asked: chronicDone + next.progress.asked, max: total } };
    }
  }

  // ─── 4. Resultado ─────────────────────────────────────────────
  const a = riskEngine.assess(kb, { profile, answers });
  return {
    stage:      'RESULT',
    disclaimer: DISCLAIMER,
    redFlag:    a.redFlag,
    oncology: {
      kbVersion:  a.kbVersion,
      level:      a.oncologyLevel,     // ROTINA / ATENÇÃO / INVESTIGAR
      riskLevel:  a.oncologyRiskLevel, // LOW / MODERATE / HIGH
      conditions: a.oncology,
    },
    screening:       a.screening.filter(s => s.status !== 'FUTURO'),
    futureScreening: a.screening.filter(s => s.status === 'FUTURO'),
    modifiable:      a.modifiable,
    chronic:         chronicScores.evaluate(answers, profile),
    answers,
  };
};

module.exports = {
  run,
  allowedCodes,
  profileSchema,
  PANEL,
  MAX_QUESTIONS,
  MAX_ANSWERS,
  CHRONIC_QUICK,
  MIN_AGE,
  PROFILE_FIELDS,
  DISCLAIMER,
};
