// ─── Triage Service (motor adaptativo) ──────────────────────────────
// Implementa o fluxo descrito na Documentação de triagem:
//
//   1. Coleta perfil demográfico (priors bayesianos)
//   2. Lê evidência objetiva da pulseira Care Plus (IAH, SpO₂ noturna,
//      PA, HRV, FC repouso, eventos paroxísticos) e injeta no Bayes com
//      peso máximo
//   3. Seleciona a próxima pergunta por Information Gain ponderado por
//      custo, com penalização de redundância e modo "alvo" quando uma
//      hipótese lidera
//   4. Após cada resposta verifica RED FLAGS — se disparar, interrompe
//      e devolve urgência
//   5. Em paralelo calcula STOP-BANG / PHQ-9 / FINDRISC / Framingham
//      como âncoras de calibração
//   6. Encerra quando posterior ≥ 80% OU atinge 18 perguntas
//   7. Fase 2 (ONCO_PHASE_ENABLED): até 6 perguntas de câncer escolhidas
//      pelo questionRunner (Σ|ln LR+|/custo, só cânceres elegíveis), e o
//      finalize junta o risco oncológico (riskEngine.assess com exames e
//      balança). Nível final = o maior entre crônico e oncológico.
//
// Estados (TriageAnswer.answers.status):
//   COLLECT_PROFILE → INTERVIEW (crônica) → ONCO_INTERVIEW → COMPLETED
//   (RED_FLAG interrompe em qualquer fase). Quem decide a próxima
//   pergunta é `advance`; o buildResponse só monta o JSON. Assim a sessão
//   nunca termina sem passar pelo finalize.
//
// O TriageAnswer.answers serializa o estado completo da sessão para que
// /answer possa retomar entre requests sem in-memory state.

const prisma         = require('../config/database');
const goalService    = require('./goalService');
const patientView    = require('./patientView');
const { getIO }      = require('../config/socket');
const { stringifyJson, parseTriage, parseJson } = require('../utils/jsonField');

const bayes     = require('./clinical/bayes');
const redFlags  = require('./clinical/redFlags');
const scales    = require('./clinical/scales');
const questions = require('./clinical/questions');
const wearable  = require('./clinical/wearableEvidence');
const kbRepository = require('./clinical/kb/kbRepository');
const riskEngine     = require('./clinical/riskEngine');
const questionRunner = require('./clinical/questionRunner');
const labEvidence    = require('./clinical/labEvidence');
const chronicScores  = require('./clinical/chronicScores');
const { ageFromDob, mapGender, computeBmi, normalizeProfile } = require('./clinical/profile');

// ─── Fase oncológica ───────────────────────────────────────────────
// Desligar (false) volta à triagem só crônica, exatamente como a v7.
const ONCO_PHASE_ENABLED  = true;
const ONCO_PANEL          = 'ONCOLOGIA';
const ONCO_MAX_QUESTIONS  = 6;
const CHRONIC_MAX_QUESTIONS = 18;

// ─── Base de conhecimento + engine ─────────────────────────────────
// O kb vem do banco (kbRepository, em cache até a base ser editada). O
// engine é recriado só quando chega outro kb: edição na tela "Base da IA"
// grava uma KnowledgeVersion nova e invalida o cache do repositório.
const CHRONIC_PANEL = 'CRONICA';
const getKb = () => kbRepository.get();

let engineCache = { kb: null, version: null, engine: null };
const getEngine = async () => {
  const kb = await getKb();
  if (engineCache.kb !== kb || engineCache.version !== kb.version) {
    engineCache = { kb, version: kb.version, engine: bayes.createEngine(kb, { categories: [CHRONIC_PANEL] }) };
  }
  return engineCache.engine;
};

// ─── Perguntas estáticas (compat) ──────────────────────────────────
// O frontend antigo chama GET /triage/questions. Hoje a triagem é
// adaptativa — devolvemos só o schema demográfico para a primeira tela.
const getQuestions = async () => {
  const engine = await getEngine();
  return {
    mode: 'adaptive',
    demographic: questions.demographicSchema(),
    totalSymptoms: questions.SYMPTOM_QUESTIONS.length,
    // na ordem do motor (sortOrder), não na ordem em que o kb veio
    conditions: engine.conditionCodes
      .map(code => engine.kb.conditions.find(c => c.code === code))
      .map(c => ({ code: c.code, label: c.label })),
    oncologyEnabled: ONCO_PHASE_ENABLED,
    oncologyConditions: ONCO_PHASE_ENABLED
      ? engine.kb.conditions
        .filter(c => c.category === 'ONCOLOGICA' && c.active !== false)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map(c => ({ code: c.code, label: c.label, sexFilter: c.sexFilter, minAge: c.minAge }))
      : [],
  };
};

// ─── Estado da sessão (persistido em TriageAnswer.answers) ─────────
const newSessionState = () => ({
  version:    2,
  profile:    {},          // demografia
  answers:    {},          // sintoma → 0/1 (binarizado)
  rawAnswers: {},          // sintoma → resposta crua (likert, follow-ups, ...)
  asked:      [],          // ordem em que foram perguntados
  wearable:   null,        // snapshot da pulseira no início
  evidence:   {},          // evidência efetiva injetada no Bayes (sintomas + wearable)
  redFlag:    null,
  status:     'COLLECT_PROFILE',
  oncoAsked:  [],          // perguntas feitas na fase 2 (câncer), em ordem
  weightTrend: null,       // tendência da balança (perda_peso_objetiva)
});

const loadState = (triage) => {
  const persisted = parseJson(triage.answers, null);
  if (persisted && persisted.version === 2) {
    persisted.oncoAsked ??= []; // sessões abertas antes da fase 2
    return persisted;
  }
  return newSessionState();
};

const isProfileComplete = (profile) => !!(profile.age != null && profile.sex && profile.bmi);

const saveState = (triageId, state, extra = {}) =>
  prisma.triageAnswer.update({
    where: { id: triageId },
    data:  { answers: stringifyJson(state), ...extra },
  });

// ─── Cria sessão de triagem ────────────────────────────────────────
const startTriage = async (patientId) => {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: {
      fullName: true, dateOfBirth: true, gender: true,
      height: true, weight: true, chronicConds: true, allergies: true,
    },
  });

  const wearableSnap = await wearable.collectFromDatabase(patientId);

  const state = newSessionState();
  state.wearable = wearableSnap;
  if (ONCO_PHASE_ENABLED) {
    try { state.weightTrend = await wearable.collectWeightTrend(patientId); }
    catch (e) { console.error('Tendência de peso indisponível:', e.message); }
  }
  // Pré-preenche perfil com o que já temos cadastrado
  if (patient?.dateOfBirth) state.profile.age = ageFromDob(patient.dateOfBirth);
  if (patient?.gender) state.profile.sex = mapGender(patient.gender);
  if (patient?.height && patient?.weight) {
    state.profile.bmi = computeBmi(patient.height, patient.weight);
    state.profile.height = patient.height;
    state.profile.weight = patient.weight;
  }

  const triage = await prisma.triageAnswer.create({
    data: {
      patientId,
      status:  'IN_PROGRESS',
      answers: stringifyJson(state),
    },
  });

  return buildResponse(triage.id, state, { patient });
};

// ─── Próxima pergunta (após uma resposta) ──────────────────────────
const answerTriage = async (patientId, triageId, payload) => {
  const triage = await prisma.triageAnswer.findFirst({
    where: { id: triageId, patientId },
  });
  if (!triage) throw Object.assign(new Error('Triagem não encontrada'), { status: 404 });
  if (triage.status === 'COMPLETED') {
    return buildResponse(triage.id, loadState(triage), { completed: true });
  }

  const state = loadState(triage);

  // ─── 1. Recebe demografia (lote inteiro de uma vez) ──────────────
  // (também aceita reenvio enquanto o perfil estiver incompleto)
  const profileOpen = state.status === 'COLLECT_PROFILE' ||
    (state.status === 'INTERVIEW' && state.asked.length === 0 && !isProfileComplete(state.profile));
  if (profileOpen && payload?.profile) {
    Object.assign(state.profile, payload.profile);
    state.profile.bmi = state.profile.bmi
      || computeBmi(state.profile.height, state.profile.weight);
    state.status = 'INTERVIEW';
    // Re-injetar evidência da pulseira (pode depender de perfil)
    state.evidence = wearable.toBayesianEvidence(state.wearable);
  }

  // ─── 2. Recebe resposta a um sintoma (fase crônica ou oncológica) ─
  const interviewing = state.status === 'INTERVIEW' || state.status === 'ONCO_INTERVIEW';
  if (interviewing && payload?.symptom != null) {
    const qDef = questions.getQuestionForSymptom(payload.symptom)
      || await kbQuestionDef(payload.symptom)
      || followUpDef(payload.symptom);
    const rawVal = payload.value;
    state.rawAnswers[payload.symptom] = rawVal;

    const bin = qDef ? questions.toBinary(qDef, rawVal) : binarizeFallback(rawVal);
    if (bin === 0 || bin === 1) {
      // Mantém evidência da pulseira mas deixa resposta sobrescrever
      // exceto se a evidência vier com weight ≥ 2 (objetiva).
      const existing = state.evidence[payload.symptom];
      if (!existing || (existing.weight ?? 1) < 2) {
        state.evidence[payload.symptom] = bin;
      }
      state.answers[payload.symptom] = bin;
      if (state.status === 'ONCO_INTERVIEW') {
        if (!state.oncoAsked.includes(payload.symptom)) state.oncoAsked.push(payload.symptom);
      } else if (!state.asked.includes(payload.symptom)) {
        state.asked.push(payload.symptom);
      }
    }

    // Follow-ups (se a pergunta principal dispara filhos)
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
  }

  // ─── 3. Red flag? ────────────────────────────────────────────────
  const rf = redFlags.detectRedFlag({
    answers:  state.rawAnswers,
    wearable: state.wearable,
  });
  if (rf) {
    state.redFlag = rf;
    state.status  = 'RED_FLAG';
    await finalizeWithRedFlag(triage, state, patientId);
    return buildResponse(triage.id, state, { completed: true });
  }

  // ─── 4. Próxima pergunta, próxima fase ou fim ────────────────────
  return advance(triage, state, patientId);
};

// ─── Máquina de estados ────────────────────────────────────────────
// INTERVIEW: pergunta crônica até parar (confiança ≥ 80% ou 18
// perguntas, mínimo 6) ou acabar a lista. Depois ONCO_INTERVIEW: até 6
// perguntas de câncer; quando o seletor não tem mais nada útil, finalize.
const advance = async (triage, state, patientId) => {
  if (state.status === 'INTERVIEW' && isProfileComplete(state.profile)) {
    const next = await nextChronicQuestion(state);
    if (next) {
      await saveState(triage.id, state);
      return buildResponse(triage.id, state, { next });
    }
    if (ONCO_PHASE_ENABLED) {
      state.status = 'ONCO_INTERVIEW';
    } else {
      state.status = 'COMPLETED';
      await finalize(triage, state, patientId);
      return buildResponse(triage.id, state, { completed: true });
    }
  }

  if (state.status === 'ONCO_INTERVIEW') {
    const next = await nextOncologyQuestion(state);
    if (next) {
      await saveState(triage.id, state);
      return buildResponse(triage.id, state, { next });
    }
    state.status = 'COMPLETED';
    await finalize(triage, state, patientId);
    return buildResponse(triage.id, state, { completed: true });
  }

  await saveState(triage.id, state);
  return buildResponse(triage.id, state, {});
};

// Fase crônica: perguntas fixas dos escores validados (chronicScores),
// na ordem: sinais de alarme, PHQ-2, STOP-Bang, FINDRISC e, se o PHQ-2
// der ≥ 3, o resto do PHQ-9. Sem motor bayesiano (regra R1).
const nextChronicQuestion = async (state) => {
  const { code, progress } = chronicScores.nextQuestion(state.rawAnswers, state.profile);
  if (!code) return null;
  const question = questions.getQuestionForSymptom(code);
  if (!question) return null;
  return {
    phase:       CHRONIC_PANEL,
    question,
    explanation: null,
    reason:      null,
    leaderboard: [],
    progress,
  };
};

// Fase oncológica: seletor próprio (a entropia global ignoraria P ≈ 0,2%)
const nextOncologyQuestion = async (state) => {
  const kb = await getKb();
  const next = questionRunner.next(kb, {
    profile:    state.profile,
    answers:    state.answers,
    panel:      ONCO_PANEL,
    max:        ONCO_MAX_QUESTIONS,
    askedCount: state.oncoAsked.length,
    evidence:   state.weightTrend?.evidence ?? {}, // balança já respondeu "perdeu peso?"
  });
  if (!next) return null;
  return {
    phase:       ONCO_PANEL,
    question:    next.question,
    explanation: null, // o "IG / foco" da fase crônica não se aplica
    reason:      next.reason,
    targets:     next.targets.map(t => ({ code: t.code, label: t.label })),
    leaderboard: [],   // sem % de câncer ao vivo durante as perguntas
    progress:    { asked: state.oncoAsked.length, max: ONCO_MAX_QUESTIONS },
  };
};

// Pergunta da base (oncologia) que não está em questions.js
const kbQuestionDef = async (code) => {
  const kb = await getKb();
  const s = kb.symptoms.find(x => x.code === code && x.kind === 'QUESTION');
  return s ? { type: s.type, binaryThreshold: s.binaryThreshold, followUps: s.followUps ?? [] } : null;
};

// Risco oncológico no fim da triagem: respostas + exames + balança
const assessOncology = async (patientId, state) => {
  const kb = await getKb();
  const profile = normalizeProfile(state.profile);
  const labs = await labEvidence.collectFromDatabase(kb, patientId, { profile });
  const wearableEvidence = {
    ...wearable.toBayesianEvidence(state.wearable),
    ...(state.weightTrend?.evidence ?? {}),
  };
  const a = riskEngine.assess(kb, {
    profile, answers: state.answers, labEvidence: labs, wearableEvidence, wearable: state.wearable,
  });
  const t = state.weightTrend;
  return {
    kbVersion:  a.kbVersion,
    level:      a.oncologyLevel,     // ROTINA / ATENÇÃO / INVESTIGAR
    riskLevel:  a.oncologyRiskLevel, // LOW / MODERATE / HIGH
    conditions: a.oncology,
    screening:  a.screening,
    modifiable: a.modifiable,
    labs:       labs.items,
    weightTrend: t?.hasData ? { summary: t.summary, dropPct: t.dropPct, days: t.days, lost: t.lost } : null,
    asked:      state.oncoAsked,
  };
};

// ─── Finalizadores ─────────────────────────────────────────────────
const finalize = async (triage, state, patientId) => {
  // Fase crônica: escores validados com os cortes oficiais (chronicScores)
  const chronic = chronicScores.evaluate(state.rawAnswers, state.profile);
  const computedScales = scales.runAll({ answers: state.rawAnswers, profile: normalizeProfile(state.profile) });
  let level = chronic.riskLevel;
  const score = null; // sem probabilidade: o nível vem das faixas dos escores

  // Fase 2: risco oncológico. ROTINA não sobe o nível; ATENÇÃO sobe até
  // MODERATE e INVESTIGAR até HIGH (o maior entre crônico e oncológico).
  let oncology = null;
  if (ONCO_PHASE_ENABLED) {
    try { oncology = await assessOncology(patientId, state); }
    catch (e) { console.error('Erro no risco oncológico:', e.message); }
  }
  if (oncology && oncology.level !== riskEngine.LEVEL.ROTINA && rank(level) < rank(oncology.riskLevel)) {
    level = oncology.riskLevel;
  }
  const investigate = (oncology?.conditions ?? []).filter(c => c.level === riskEngine.LEVEL.INVESTIGAR);

  const summary = buildSummary(state, chronic, oncology);
  const suggestions = buildSuggestions(level, chronic, oncology);

  state.result = {
    riskLevel: level,
    score,
    chronic,
    scales:    computedScales,
    summary,
    suggestions,
    oncology,
  };

  await saveState(triage.id, state, {
    status:    'COMPLETED',
    riskLevel: level,
    score,
    finishedAt: new Date(),
  });

  const report = await prisma.aiReport.create({
    data: {
      patientId,
      triageId:   triage.id,
      type:       'triage',
      content:    summary,
      riskLevel:  level,
      suggestions: stringifyJson(suggestions),
    },
  });

  const nextStep = patientView.nextStepFor(state.result)?.code ?? null;
  try {
    await goalService.generateGoalsFromTriage(patientId, {
      profile: normalizeProfile(state.profile), wearable: state.wearable ?? {}, nextStep,
    }, triage.id);
  } catch (e) { console.error('Erro ao gerar metas:', e.message); }

  if (investigate.length) await notifyDoctors(patientId, triage.id, investigate);
  await emitCompleted(patientId, triage.id, level, report.id, false, {
    nextStep,
    ...(investigate.length ? { oncology: investigate.map(c => c.code) } : {}),
  });
};

// Câncer em INVESTIGAR: avisa os médicos vinculados (notificação + socket)
const notifyDoctors = async (patientId, triageId, conditions) => {
  try {
    const { send } = require('../routes/notificationRoutes'); // tardio: rotas carregam middlewares
    const [patient, doctorUserIds] = await Promise.all([
      prisma.patient.findUnique({ where: { id: patientId }, select: { fullName: true } }),
      linkedDoctorUserIds(patientId),
    ]);
    const labels = conditions.map(c => c.label.toLowerCase()).join(', ');
    for (const userId of doctorUserIds) {
      await send({
        userId,
        type:     'ALERT',
        title:    'Triagem: sinais para investigar',
        message:  `${patient?.fullName ?? 'Paciente'}: ${labels} acima do limiar de 3% (triagem de risco, não diagnóstico).`,
        metadata: { patientId, triageId, oncology: conditions.map(c => c.code) },
      });
    }
  } catch (e) { console.error('Erro ao notificar médico:', e.message); }
};

const finalizeWithRedFlag = async (triage, state, patientId) => {
  const rf = state.redFlag;
  const level = rf.urgency === 'EMERGENCY' ? 'CRITICAL' : 'HIGH';
  const summary = `🚨 ${rf.label}. Ação imediata: ${rf.action}.`;
  const suggestions = [
    { type: 'warning', text: rf.action },
    { type: 'info',    text: `Sinal detectado: ${rf.label}` },
  ];

  // O red flag manda (nível CRITICAL/HIGH, ação imediata), mas o risco
  // oncológico com o que já foi respondido continua no resultado: a médica
  // vê o câncer em INVESTIGAR e é avisada, em qualquer fase.
  let oncology = null;
  if (ONCO_PHASE_ENABLED && isProfileComplete(state.profile)) {
    try { oncology = await assessOncology(patientId, state); }
    catch (e) { console.error('Erro no risco oncológico:', e.message); }
  }
  const investigate = (oncology?.conditions ?? []).filter(c => c.level === riskEngine.LEVEL.INVESTIGAR);

  state.result = {
    riskLevel: level,
    score:     99,
    redFlag:   rf,
    summary,
    suggestions,
    oncology,
  };

  await saveState(triage.id, state, {
    status:    'COMPLETED',
    riskLevel: level,
    score:     99,
    finishedAt: new Date(),
  });

  const report = await prisma.aiReport.create({
    data: {
      patientId,
      triageId:   triage.id,
      type:       'triage',
      content:    summary,
      riskLevel:  level,
      suggestions: stringifyJson(suggestions),
    },
  });

  // Metas de hábito também valem no alarme (a de consulta não: o passo é
  // procurar atendimento agora)
  try {
    await goalService.generateGoalsFromTriage(patientId, {
      profile: normalizeProfile(state.profile), wearable: state.wearable ?? {}, nextStep: 'AGORA',
    }, triage.id);
  } catch (e) { console.error('Erro ao gerar metas:', e.message); }

  if (investigate.length) await notifyDoctors(patientId, triage.id, investigate);
  await emitCompleted(patientId, triage.id, level, report.id, true, {
    nextStep: 'AGORA',
    ...(investigate.length ? { oncology: investigate.map(c => c.code) } : {}),
  });
};

// ─── Construção da resposta para o frontend ────────────────────────
// Só monta o JSON: quem escolhe a pergunta é o `advance` (extra.next).
//   PROFILE  { triageId, stage, status, profile, schema, wearableSummary, hasWearable, progress }
//   QUESTION { triageId, stage, status, phase: 'CRONICA'|'ONCOLOGIA', question, explanation,
//              reason, targets?, progress, leaderboard, wearableSummary }
//   RESULT   { triageId, stage, status, profile, result (com result.oncology), redFlag,
//              wearableSummary, progress }
const buildResponse = async (triageId, state, extra = {}) => {
  // Etapa 1 — perfil
  if (state.status === 'COLLECT_PROFILE' || !isProfileComplete(state.profile)) {
    return {
      triageId,
      stage:      'PROFILE',
      status:     state.status,
      profile:    state.profile,
      schema:     questions.demographicSchema(),
      wearableSummary: patientView.wearableLines(state.wearable),
      hasWearable: !!state.wearable?.hasData,
      progress: { asked: 0, max: CHRONIC_MAX_QUESTIONS },
    };
  }

  // Etapa final
  if (state.status === 'COMPLETED' || state.status === 'RED_FLAG' || extra.completed) {
    return {
      triageId,
      stage: 'RESULT',
      status: state.status,
      profile: state.profile,
      result: state.result,
      redFlag: state.redFlag,
      view: patientView.triageResultView(state),
      wearableSummary: patientView.wearableLines(state.wearable),
      progress: { asked: state.asked.length, max: CHRONIC_MAX_QUESTIONS },
    };
  }

  // Etapa de pergunta (a próxima já foi escolhida pelo advance)
  const next = extra.next;
  if (!next) {
    // Não deveria acontecer: o advance sempre manda a pergunta ou finaliza
    return { triageId, stage: 'RESULT', status: state.status, profile: state.profile,
      progress: { asked: state.asked.length, max: CHRONIC_MAX_QUESTIONS } };
  }
  return {
    triageId,
    stage: 'QUESTION',
    status: state.status,
    phase: next.phase,
    question: next.question,
    explanation: next.explanation,
    reason: next.reason,
    ...(next.targets ? { targets: next.targets } : {}),
    progress: next.progress,
    leaderboard: next.leaderboard,
    wearableSummary: patientView.wearableLines(state.wearable),
  };
};

// ─── Helpers de finalização ────────────────────────────────────────
const rank = (level) => ({ INCONCLUSIVE: 0, LOW: 1, MODERATE: 2, HIGH: 3, CRITICAL: 4 }[level] ?? 0);

// Resumo da médica: escores com a faixa e a fonte, pulseira e câncer
const buildSummary = (state, chronic, oncology = null) => {
  const wearLine = patientView.wearableLines(state.wearable).map(l => `- ${l}`).join('\n')
    || '- Sinais da pulseira na faixa normal (ou sem dados recentes)';
  return [
    '**Escores validados (fase crônica):**',
    ...chronic.scores.map(s => `- ${s.label}: ${s.scale} ${s.score}/${s.max} (${s.category}; corte ${s.cutoff})`),
    '',
    '**Dados da pulseira Care Plus:**',
    wearLine,
    ...oncologySummaryLines(oncology),
  ].join('\n');
};

// Linhas do resumo para a parte de câncer (linguagem calma)
const oncologySummaryLines = (oncology) => {
  if (!oncology) return [];
  const eligible = oncology.conditions.filter(c => c.eligible);
  const lines = ['', '**Câncer (triagem de risco, não diagnóstico):**'];
  if (!eligible.length) lines.push('- Nenhum dos 5 cânceres avaliados se aplica à sua idade ainda.');
  for (const c of eligible) {
    const what = c.level === 'INVESTIGAR' ? 'sinais que pedem avaliação médica'
      : c.level === 'ATENÇÃO' ? 'vale conversar com o médico'
      : 'sem sinal de alerta';
    // risco relativo só fora do INVESTIGAR ("111× a média" assusta e o
    // naive Bayes exagera com sinais correlacionados)
    const rr = c.level === 'INVESTIGAR' ? '' : ` (${c.display.relativeRisk} a média da sua idade)`;
    lines.push(`- ${c.label}: ${c.level} — ${what}${rr}`);
  }
  if (oncology.weightTrend?.summary) lines.push(`- ${oncology.weightTrend.summary}`);
  return lines;
};

// Sugestões da médica (o paciente vê só o próximo passo, patientView)
const buildSuggestions = (level, chronic, oncology = null) => {
  const out = [];
  if (level === 'HIGH' || level === 'CRITICAL') {
    out.push({ type: 'action', text: 'Avaliação médica: escore em faixa alta' });
  } else if (level === 'MODERATE') {
    out.push({ type: 'action', text: 'Avaliação médica: escore acima do corte de rastreio' });
  } else {
    out.push({ type: 'info', text: 'Escores abaixo dos cortes de rastreio: manter rotina' });
  }
  if (chronic.suicidalIdeation) {
    out.unshift({ type: 'warning', text: 'Item 9 do PHQ-9 positivo: suporte de saúde mental imediato (CVV 188)' });
  }
  const byCode = Object.fromEntries(chronic.scores.map(s => [s.code, s]));
  if (byCode.AOS?.positive) out.push({ type: 'exam', text: `Considerar polissonografia (STOP-Bang ${byCode.AOS.score}, corte ≥ 3)` });
  if (byCode.DM2?.positive) out.push({ type: 'exam', text: `Glicemia de jejum e HbA1c (FINDRISC ${byCode.DM2.score}, corte ≥ 15; SBD 2025)` });
  if (byCode.DEPRESSAO?.positive) out.push({ type: 'action', text: `Avaliação de saúde mental (PHQ-9 ${byCode.DEPRESSAO.score}, corte ≥ 10)` });
  for (const c of oncology?.conditions ?? []) {
    if (c.level === 'INVESTIGAR') {
      out.push({ type: 'action', text: `Procurar avaliação médica sobre ${c.label.toLowerCase()}: os sinais pedem exames (não é diagnóstico)` });
    }
  }
  for (const s of oncology?.screening ?? []) {
    if (s.investigate) continue;
    if (s.status === 'INDICADO_AGORA') out.push({ type: 'exam', text: `Rastreamento: ${s.exam} (${s.conditionLabel.toLowerCase()})` });
    if (s.status === 'DECISAO_COMPARTILHADA') out.push({ type: 'info', text: `Conversar com o médico sobre ${s.exam} (${s.conditionLabel.toLowerCase()})` });
  }
  return out;
};

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

// A sala do socket é por usuário (`user:<userId>`, ver config/socket.js);
// patientId é o id do Patient, então busca o userId dele.
//
// O alerta (`triage:alert`, com nível e, se houver, os cânceres em
// INVESTIGAR) vai SÓ para a sala `user:<userId>` de cada médico vinculado
// ao paciente (DoctorPatient). Nada de dado clínico na sala `doctors`
// inteira: médico sem vínculo não pode saber da triagem de quem não é
// paciente dele. `deps` ({ io, db }) existe para o teste.
const linkedDoctorUserIds = async (patientId, db = prisma) => {
  const links = await db.doctorPatient.findMany({
    where: { patientId }, include: { doctor: { select: { userId: true } } },
  });
  return [...new Set(links.map(l => l.doctor?.userId).filter(Boolean))];
};

const emitCompleted = async (patientId, triageId, riskLevel, reportId, isRedFlag = false, extra = {}, deps = {}) => {
  try {
    const io = deps.io ?? getIO();
    const db = deps.db ?? prisma;
    const patient = await db.patient.findUnique({
      where: { id: patientId }, select: { userId: true },
    });
    if (patient) {
      // Paciente: só o próximo passo (regra R2: nada de nível de risco)
      io.to(`user:${patient.userId}`).emit('triage:completed', {
        triageId, reportId, isRedFlag, nextStep: extra.nextStep ?? null,
      });
    }
    if (['HIGH', 'CRITICAL'].includes(riskLevel)) {
      for (const userId of await linkedDoctorUserIds(patientId, db)) {
        const { nextStep: _patientOnly, ...doctorExtra } = extra;
        io.to(`user:${userId}`).emit('triage:alert', { patientId, riskLevel, triageId, isRedFlag, ...doctorExtra });
      }
    }
  } catch (_) {}
};

// ─── Histórico e consulta (compat) ────────────────────────────────
const getTriageHistory = async (patientId, { page = 1, limit = 10 } = {}) => {
  const [total, items] = await Promise.all([
    prisma.triageAnswer.count({ where: { patientId } }),
    prisma.triageAnswer.findMany({
      where:   { patientId },
      skip:    (Number(page) - 1) * Number(limit),
      take:    Number(limit),
      orderBy: { startedAt: 'desc' },
    }),
  ]);
  return { total, page, limit, items: items.map(parseTriage) };
};

const getTriageById = async (triageId, patientId) => {
  const triage = await prisma.triageAnswer.findFirst({
    where:   { id: triageId, patientId },
    include: { aiReport: true },
  });
  if (!triage) throw Object.assign(new Error('Triagem não encontrada'), { status: 404 });
  const state = loadState(triage);
  const enriched = parseTriage(triage);
  enriched.session = state;
  return enriched;
};

module.exports = {
  ONCO_PHASE_ENABLED,
  emitCompleted, // exportado para o teste do escopo do alerta
  advance,       // exportado para o teste da máquina de estados
  getQuestions,
  startTriage,
  answerTriage,
  getTriageHistory,
  getTriageById,
};
