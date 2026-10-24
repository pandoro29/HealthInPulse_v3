// ─── Risco do paciente (painel da médica e do paciente) ─────────────
// GET /api/patient/risk e GET /api/doctor/patients/:id/risk.
//
// Junta, na hora da chamada, tudo o que o banco sabe da pessoa e passa
// pelo motor explicável (riskEngine.assess) com o kb atual:
//   - perfil:    cadastro (idade pela data de nascimento, sexo, altura,
//                peso) + o perfil da última triagem concluída (fatores de
//                risco: fumo, álcool, família, preventivo);
//   - respostas: as da última triagem concluída (crônica + oncológica);
//   - exames:    labEvidence.collectFromDatabase (LabRules sobre os achados);
//   - pulseira:  snapshot dos últimos 30 dias + tendência de peso (balança).
// Nada é gravado: o resultado muda sozinho quando a médica edita a base
// (kb novo) ou quando chega exame/peso novo. Quem chama já conferiu o
// acesso (paciente: o próprio; médico: assertLink).

const prisma       = require('../config/database');
const kbRepository = require('./clinical/kb/kbRepository');
const riskEngine   = require('./clinical/riskEngine');
const labEvidence  = require('./clinical/labEvidence');
const wearable     = require('./clinical/wearableEvidence');
const { ageFromDob, mapGender, computeBmi, normalizeProfile } = require('./clinical/profile');
const { parseJson } = require('../utils/jsonField');
const chronicScores = require('./clinical/chronicScores');

const DISCLAIMER = 'Triagem de risco com estimativas didáticas, não diagnóstico. '
  + 'Os percentuais são a chance estimada de diagnóstico em 2 anos; o limiar para investigar é 3% (NICE NG12).';

// Perfil a partir do cadastro (o que não depende da triagem)
const profileFromPatient = (patient) => {
  const p = {};
  if (patient.dateOfBirth) p.age = ageFromDob(patient.dateOfBirth);
  if (patient.gender) p.sex = mapGender(patient.gender);
  if (patient.height) p.height = patient.height;
  if (patient.weight) p.weight = patient.weight;
  const bmi = computeBmi(patient.height, patient.weight);
  if (bmi != null) p.bmi = bmi;
  return p;
};

// Última triagem concluída (inclui a interrompida por red flag)
const latestCompletedTriage = (patientId) => prisma.triageAnswer.findFirst({
  where:   { patientId, status: 'COMPLETED' },
  orderBy: [{ finishedAt: 'desc' }, { startedAt: 'desc' }],
});

// assessPatient(patientId) → JSON do painel de risco (ver task-6-report.md)
const assessPatient = async (patientId, { now = new Date() } = {}) => {
  const [kb, patient, triage, snap, weightTrend] = await Promise.all([
    kbRepository.get(),
    prisma.patient.findUnique({
      where:  { id: patientId },
      select: { id: true, fullName: true, dateOfBirth: true, gender: true, height: true, weight: true },
    }),
    latestCompletedTriage(patientId),
    wearable.collectFromDatabase(patientId),
    wearable.collectWeightTrend(patientId, { now }),
  ]);
  if (!patient) throw Object.assign(new Error('Paciente não encontrado'), { status: 404 });

  const state = triage ? parseJson(triage.answers, {}) ?? {} : {};
  const fromPatient = profileFromPatient(patient);
  // A idade vem da data de nascimento (a da triagem pode ser de meses atrás)
  const profile = normalizeProfile({ ...fromPatient, ...(state.profile ?? {}), ...(fromPatient.age != null && { age: fromPatient.age }) });
  const answers = state.answers ?? {}; // já binarizadas (0/1) pela triagem

  const labs = await labEvidence.collectFromDatabase(kb, patientId, { profile, now });
  const wearableEvidence = { ...wearable.toBayesianEvidence(snap), ...(weightTrend.evidence ?? {}) };

  const a = riskEngine.assess(kb, { profile, answers, labEvidence: labs, wearableEvidence, wearable: snap });

  return {
    patientId,
    patientName: patient.fullName,
    assessedAt:  now.toISOString(),
    kbVersion:   a.kbVersion,
    disclaimer:  DISCLAIMER,
    // De onde veio cada evidência (para a médica conferir)
    basedOn: {
      profileFrom: triage ? 'TRIAGEM' : 'CADASTRO',
      triage: triage ? {
        id:         triage.id,
        finishedAt: triage.finishedAt,
        status:     state.status ?? null, // COMPLETED ou RED_FLAG
        answered:   Object.keys(answers).length,
        riskLevel:  triage.riskLevel,
      } : null,
      labs:        labs.items,
      weightTrend: weightTrend.hasData
        ? { summary: weightTrend.summary, dropPct: weightTrend.dropPct, days: weightTrend.days, lost: weightTrend.lost }
        : null,
      wearable: { hasData: !!snap?.hasData, summary: wearable.summarizeForPatient(snap) },
    },
    profile: a.profile,
    redFlag: a.redFlag ?? state.redFlag ?? null,
    oncology: {
      level:      a.oncologyLevel,     // ROTINA / ATENÇÃO / INVESTIGAR
      riskLevel:  a.oncologyRiskLevel, // LOW / MODERATE / HIGH
      conditions: a.oncology,
    },
    // Crônicas: escores validados da última triagem (regra R1; o motor
    // bayesiano crônico saiu por falta de fonte)
    chronic: triage && state.rawAnswers
      ? chronicScores.evaluate(state.rawAnswers, state.profile ?? {})
      : null,
    screening:       a.screening.filter(s => s.status !== 'FUTURO'),
    futureScreening: a.screening.filter(s => s.status === 'FUTURO'),
    modifiable:      a.modifiable,
  };
};

module.exports = { assessPatient, profileFromPatient, DISCLAIMER };
