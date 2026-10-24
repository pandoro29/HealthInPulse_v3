// ─── Harness do golden v7 ───────────────────────────────────────────
// Funções que rodam o motor clínico SÓ pelos exports públicos de hoje
// (bayes.js, questions.js, redFlags.js) e devolvem objetos simples,
// serializáveis em JSON. São usadas:
//   - por `scripts/capture-golden.js`, para gravar o golden (uma vez);
//   - por `tests/engine.golden.test.js`, para conferir o código atual.
//
// `simulateSession` replica a parte pura do laço do `triageService`
// v7 (answerTriage → buildResponse), sem Prisma: aplicar a resposta,
// checar red flag, checar parada e escolher a próxima pergunta.
//
// NÃO mude este arquivo junto com a refatoração do motor: ele é a
// definição congelada do que o golden mede.

const bayes     = require('../../src/services/clinical/bayes');
const questions = require('../../src/services/clinical/questions');
const redFlags  = require('../../src/services/clinical/redFlags');

// Mesmos parâmetros fixos do triageService v7
const STOP_OPTS   = { maxQuestions: 18, minQuestions: 6, confidenceCutoff: 0.80 };
const SELECT_OPTS = { targetThreshold: 0.5 };
const MAX_LOOP    = 100; // trava de segurança: o laço real para em 18

// ─── Priors ─────────────────────────────────────────────────────────
// O prior sai do próprio computePosterior sem evidência (é o que o
// motor usa de verdade, já com o clamp).
const priorCase = (profile) => {
  const priors = {};
  for (const [code, h] of Object.entries(bayes.computePosterior({}, profile))) {
    priors[code] = h.prior;
  }
  return priors;
};

// ─── Candidatas a pergunta ───────────────────────────────────────────
// A ordem importa: em empate de score, vence a que vem primeiro.
const candidatesCase = (profile) =>
  questions.candidatesForProfile(profile).map(c => ({
    symptom: c.symptom,
    cost:    c.cost,
    type:    c.question.type,
  }));

// ─── Posterior de uma evidência avulsa ──────────────────────────────
const posteriorCase = (profile, evidence) => {
  const post = bayes.computePosterior(evidence, profile);
  const result = {};
  for (const [code, h] of Object.entries(post)) {
    result[code] = { prior: h.prior, posterior: h.posterior };
  }
  const next = bayes.selectNextSymptom(
    questions.candidatesForProfile(profile), evidence, profile, SELECT_OPTS,
  );
  return {
    result,
    verdict: bayes.classifyRisk(post),
    next: next && {
      symptom:          next.symptom,
      ig:               next.ig,
      score:            next.score,
      redundancyFactor: next.redundancyFactor,
      targetBonus:      next.targetBonus,
    },
  };
};

// ─── Sessão simulada (laço do triageService v7) ─────────────────────
//
// session: {
//   profile,                 perfil já completo (age, sex, bmi, ...)
//   initialEvidence,         evidência da pulseira (toBayesianEvidence)
//   wearable,                snapshot usado só pelos red flags (ou null)
//   answerSheet: { [symptom]: { value, followUps?: [{ id, value }] } }
// }
const simulateSession = ({ profile, initialEvidence = {}, wearable = null, answerSheet }) => {
  const state = {
    profile:    { ...profile },
    answers:    {},
    rawAnswers: {},
    asked:      [],
    evidence:   structuredClone(initialEvidence),
  };
  const steps = [];

  const finish = (outcome, extra = {}) => {
    const post = bayes.computePosterior(state.evidence, state.profile);
    const posteriors = {};
    for (const [code, h] of Object.entries(post)) posteriors[code] = h.posterior;
    return {
      outcome,
      stopReason: extra.stopReason ?? null,
      redFlag:    extra.redFlag ?? null,
      asked:      [...state.asked],
      steps,
      posteriors,
      verdict:    bayes.classifyRisk(post),
    };
  };

  for (let i = 0; i < MAX_LOOP; i++) {
    // 3. Red flag? (sobre as respostas cruas + pulseira)
    const rf = redFlags.detectRedFlag({ answers: state.rawAnswers, wearable });
    if (rf) return finish('RED_FLAG', { redFlag: rf });

    // 4. Parada por confiança/limite
    const post = bayes.computePosterior(state.evidence, state.profile);
    const stop = bayes.shouldStop(post, state.asked.length, STOP_OPTS);
    if (stop.stop) return finish('COMPLETED', { stopReason: stop.reason });

    // buildResponse: próxima pergunta
    const candidates = questions.candidatesForProfile(state.profile);
    const next = bayes.selectNextSymptom(candidates, state.evidence, state.profile, SELECT_OPTS);
    if (!next) return finish('NO_MORE_QUESTIONS');
    steps.push({ symptom: next.symptom, ig: next.ig, score: next.score });

    const answer = answerSheet[next.symptom];
    if (!answer) throw new Error(`Gabarito sem resposta para "${next.symptom}"`);
    applyAnswer(state, { symptom: next.symptom, value: answer.value, followUps: answer.followUps });
  }
  throw new Error(`Sessão não terminou em ${MAX_LOOP} passos`);
};

// Passo 2 do answerTriage v7, linha a linha
const applyAnswer = (state, payload) => {
  const qDef = questions.getQuestionForSymptom(payload.symptom) || followUpDef(payload.symptom);
  const rawVal = payload.value;
  state.rawAnswers[payload.symptom] = rawVal;

  const bin = qDef ? questions.toBinary(qDef, rawVal) : binarizeFallback(rawVal);
  if (bin === 0 || bin === 1) {
    const existing = state.evidence[payload.symptom];
    if (!existing || (existing.weight ?? 1) < 2) {
      state.evidence[payload.symptom] = bin;
    }
    state.answers[payload.symptom] = bin;
    if (!state.asked.includes(payload.symptom)) state.asked.push(payload.symptom);
  }

  if (qDef?.followUps?.length && Array.isArray(payload.followUps)) {
    for (const fu of payload.followUps) {
      state.rawAnswers[fu.id] = fu.value;
      const fuVal = binarizeFallback(fu.value);
      if (fuVal === 0 || fuVal === 1) {
        state.evidence[fu.id] = fuVal;
        state.answers[fu.id]  = fuVal;
      }
    }
  }
};

// Cópias literais dos helpers privados do triageService v7
const followUpDef = (id) => {
  for (const q of questions.SYMPTOM_QUESTIONS) {
    if (q.followUps?.some(fu => fu.id === id)) {
      return { type: 'boolean' };
    }
  }
  return null;
};

const binarizeFallback = (raw) => {
  if (raw === true || raw === 1 || raw === '1' || raw === 'Sim' || raw === 'sim') return 1;
  if (raw === false || raw === 0 || raw === '0' || raw === 'Não' || raw === 'nao' || raw === 'não') return 0;
  return null;
};

// ─── Red flags ──────────────────────────────────────────────────────
const redFlagCase = ({ answers = {}, wearable = null }) =>
  redFlags.detectRedFlag({ answers, wearable });

const redFlagDefinitions = () => redFlags.listRedFlagDefinitions();

module.exports = {
  STOP_OPTS,
  SELECT_OPTS,
  priorCase,
  candidatesCase,
  posteriorCase,
  simulateSession,
  redFlagCase,
  redFlagDefinitions,
};
