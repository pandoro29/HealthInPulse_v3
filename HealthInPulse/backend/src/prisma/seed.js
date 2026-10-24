const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { seedKnowledge } = require('./seedKnowledge');
const { goalTemplates } = require('../services/clinical/data/prevention');

// O seed faz as triagens das personas pelo triageService, que carrega
// config/socket → config/jwt: sem JWT_ACCESS_SECRET e JWT_REFRESH_SECRET
// no ambiente, ele nem carrega. O `new PrismaClient()` lê o backend/.env
// para o process.env; por isso a conferência (requireJwtSecrets) vem
// depois dele. Nada de segredo padrão: quem gera é o `npm run setup`.
const prisma = new PrismaClient();

const requireJwtSecrets = () => {
  const missing = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'].filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Seed: faltam ${missing.join(' e ')} (as triagens das personas carregam o config/jwt). `
      + 'Rode `npm run setup` na raiz (gera o backend/.env) ou defina as variáveis.');
  }
};

const DAY  = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const lerp  = (a, b, t) => a + (b - a) * t;
const noise = (amp) => (Math.random() - 0.5) * 2 * amp;
const round = (v, d = 0) => Number(v.toFixed(d));

// Leituras de `days` dias até hoje, `perDay` por dia, espaçadas de
// `stepHours` horas: build(recordedAt, diasAtrás, índiceNoDia) → linha.
const everyDay = (days, perDay, stepHours, build) => {
  const rows = [];
  for (let i = days - 1; i >= 0; i--) {
    for (let s = 0; s < perDay; s++) {
      rows.push(build(new Date(Date.now() - i * DAY + s * stepHours * HOUR), i, s));
    }
  }
  return rows;
};

// ─── Triagem pelo motor ───────────────────────────────────────────
// Os serviços do app usam o client de config/database. No seed, eles
// recebem o client do seed: uma conexão só com o SQLite e sem o log de
// cada query (o .env de desenvolvimento liga esse log).
const loadTriageService = (client) => {
  const dbPath = require.resolve('../config/database');
  if (!require.cache[dbPath]) {
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: client };
  }
  return require('../services/triageService');
};

// Resposta padrão de quem não tem o sintoma
const noAnswer = (question) => (question.type === 'likert' ? 0 : false);

// Faz a triagem inteira pela API interna, como o frontend faria:
// perfil → perguntas crônicas → perguntas de câncer → resultado.
//   answers  { sintoma: resposta } do roteiro; o resto é "não"
//   unknown  sintomas da fase oncológica que a pessoa deixou em "não sei"
//            (a chave fica nas respostas com null: o motor ignora e o
//            seletor não pergunta de novo, como no teste público)
//   daysAgo  quando a triagem aconteceu (data da triagem e do AiReport)
const runTriage = async (triageService, patientId, { profile, answers = {}, unknown = [], daysAgo = 0 }) => {
  let res = await triageService.startTriage(patientId);
  const triageId = res.triageId;
  res = await triageService.answerTriage(patientId, triageId, { profile });

  for (let guard = 0; res.stage === 'QUESTION'; guard++) {
    if (guard > 60) throw new Error('Seed: a triagem não terminou em 60 passos');
    const code = res.question.symptom ?? res.question.id;

    if (unknown.includes(code)) {
      if (res.status !== 'ONCO_INTERVIEW') throw new Error(`Seed: "não sei" só na fase oncológica (${code})`);
      const triage = await prisma.triageAnswer.findUnique({ where: { id: triageId } });
      const state = JSON.parse(triage.answers);
      state.answers[code] = null;
      state.rawAnswers[code] = null;
      res = await triageService.advance(triage, state, patientId);
      continue;
    }

    const value = code in answers ? answers[code] : noAnswer(res.question);
    // Follow-ups de quem disse "sim" (ex.: perda de peso → suor noturno): "não"
    const followUps = value === true
      ? (res.question.followUps ?? []).map(fu => ({ id: fu.id, value: answers[fu.id] ?? false }))
      : undefined;
    res = await triageService.answerTriage(patientId, triageId, { symptom: code, value, followUps });
  }
  if (res.stage !== 'RESULT' || !res.result) {
    throw new Error(`Seed: triagem terminou em ${res.stage}/${res.status}, sem resultado`);
  }

  // Data da triagem no passado (a história aconteceu antes da feira)
  const finishedAt = new Date(Date.now() - daysAgo * DAY);
  await prisma.triageAnswer.update({
    where: { id: triageId },
    data:  { startedAt: new Date(finishedAt - 8 * 60000), finishedAt },
  });
  await prisma.aiReport.updateMany({ where: { triageId }, data: { generatedAt: finishedAt } });
  await prisma.notification.updateMany({ where: { metadata: { contains: triageId } }, data: { createdAt: finishedAt } });
  return res;
};

// O seed falha alto se a história mudou (ex.: um número da base revisado
// tirou o Roberto de INVESTIGAR): melhor descobrir aqui que no stand.
const expectOncology = (name, res, expected) => {
  const got = Object.fromEntries((res.result.oncology?.conditions ?? []).map(c => [c.code, c.level]));
  for (const [code, level] of Object.entries(expected)) {
    if (got[code] !== level) {
      throw new Error(`Seed: ${name} deveria ter ${code} em ${level}, veio ${got[code] ?? 'nada'}`);
    }
  }
};

async function main() {
  requireJwtSecrets(); // antes de apagar qualquer coisa
  console.log('🌱 Iniciando seed...');

  // ─── Base de conhecimento clínico (parâmetros do motor) ───
  // Primeiro: as triagens da demo e o motor leem a base do banco.
  const kbCounts = await seedKnowledge(prisma);
  console.log(`  → Base de conhecimento: ${kbCounts.conditions} condições, ${kbCounts.symptoms} sintomas, `
    + `${kbCounts.conditionSymptoms} likelihoods, ${kbCounts.priorRules} regras de prior`);

  const hash = (pw) => bcrypt.hash(pw, 12);

  // ─── Limpa o seed anterior ────────────────────────────────
  await prisma.user.deleteMany({
    where: {
      OR: [
        { username: { in: ['ana', 'joao', 'marina', 'roberto'] } },
        { email: { in: ['patient@healthinpulse.dev'] } }, // Carlos (legado)
      ],
    },
  });

  // ─── Médica ────────────────────────────────────────────────
  const doctorUser = await prisma.user.create({
    data: {
      username:      'ana',
      email:         'doctor@healthinpulse.dev',
      tutorialSeenAt: new Date(), // demo não abre o tutorial
      passwordHash:  await hash('Doctor@123'),
      role:          'DOCTOR',
      emailVerified: true,
      doctor: {
        create: {
          fullName:  'Dra. Ana Beatriz Souza',
          crm:       'CRM-SP 123456',
          specialty: 'Clínica Geral',
          phone:     '11 91234-5678',
          bio:       'Médica clínica geral com foco em medicina preventiva e saúde digital.',
        },
      },
    },
    include: { doctor: true },
  });
  const doctorId = doctorUser.doctor.id;

  // ─── Paciente 1: João Carlos Mendes (caso grave) ──────────
  console.log('  → João Carlos Mendes (caso grave)');
  const joaoUser = await prisma.user.create({
    data: {
      username:      'joao',
      email:         'joao@healthinpulse.dev',
      tutorialSeenAt: new Date(), // demo não abre o tutorial
      passwordHash:  await hash('Joao@123'),
      role:          'PATIENT',
      emailVerified: true,
      patient: {
        create: {
          fullName:       'João Carlos Mendes',
          dateOfBirth:    new Date('1968-04-12'),
          gender:         'MALE',
          phone:          '11 98800-1100',
          bloodType:      'A+',
          height:         174,
          weight:         96,
          allergies:      JSON.stringify([]),
          chronicConds:   JSON.stringify(['Hipertensão', 'Diabetes tipo 2', 'Colesterol alto']),
          emergencyName:  'Lúcia Mendes',
          emergencyPhone: '11 98800-1101',
        },
      },
    },
    include: { patient: true },
  });
  const joaoId = joaoUser.patient.id;
  await prisma.doctorPatient.create({ data: { doctorId, patientId: joaoId } });

  // 30 dias de leituras "ruim" do João (HAS + DM2 descompensados)
  await prisma.vitalSign.createMany({
    data: everyDay(30, 2, 10, (recordedAt) => ({
      patientId: joaoId,
      heartRate:   round(94  + noise(4)),
      systolic:    round(146 + noise(6)),
      diastolic:   round(92  + noise(4)),
      oxygenSat:   round(93.5 + noise(0.8), 1),
      temperature: round(36.8 + noise(0.2), 1),
      glucose:     round(184 + noise(12)),
      source:      'wearable',
      recordedAt,
    })),
  });

  // Exames do João
  const examMet = await prisma.exam.create({
    data: {
      patientId: joaoId,
      title:       'Painel metabólico',
      description: 'Glicemia em jejum, HbA1c, perfil lipídico',
      fileUrl:     '/uploads/exams/seed-joao-metabolico.pdf',
      fileType:    'pdf',
      status:      'DONE',
      ocrText:     'Glicemia jejum 186 mg/dL. HbA1c 8.2%. LDL 168. Trig 241.',
      uploadedAt:  new Date(Date.now() - 10 * DAY),
      processedAt: new Date(Date.now() - 10 * DAY + 90000),
    },
  });
  await prisma.examResult.create({
    data: {
      examId:    examMet.id,
      summary:   'Controle metabólico inadequado. Hiperglicemia em jejum, HbA1c elevada e dislipidemia.',
      findings:  JSON.stringify([
        { name: 'Glicemia em jejum', value: '186', unit: 'mg/dL', status: 'alto' },
        { name: 'HbA1c',              value: '8.2', unit: '%',     status: 'alto' },
        { name: 'LDL colesterol',     value: '168', unit: 'mg/dL', status: 'alto' },
        { name: 'Triglicerídeos',     value: '241', unit: 'mg/dL', status: 'alto' },
      ]),
      riskLevel: 'HIGH',
    },
  });

  const examRenal = await prisma.exam.create({
    data: {
      patientId: joaoId,
      title:       'Função renal',
      description: 'Creatinina sérica e ureia',
      fileUrl:     '/uploads/exams/seed-joao-renal.pdf',
      fileType:    'pdf',
      status:      'DONE',
      ocrText:     'Creatinina 1.25 mg/dL. Ureia 48 mg/dL.',
      uploadedAt:  new Date(Date.now() - 8 * DAY),
      processedAt: new Date(Date.now() - 8 * DAY + 80000),
    },
  });
  await prisma.examResult.create({
    data: {
      examId:    examRenal.id,
      summary:   'Função renal limítrofe — sugere acompanhamento pelo risco de nefropatia diabética.',
      findings:  JSON.stringify([
        { name: 'Creatinina', value: '1.25', unit: 'mg/dL', status: 'atenção' },
        { name: 'Ureia',      value: '48',   unit: 'mg/dL', status: 'normal'  },
      ]),
      riskLevel: 'MODERATE',
    },
  });

  const examSono = await prisma.exam.create({
    data: {
      patientId: joaoId,
      title:       'Polissonografia',
      description: 'Estudo do sono',
      fileUrl:     '/uploads/exams/seed-joao-sono.pdf',
      fileType:    'pdf',
      status:      'DONE',
      ocrText:     'IAH 22 eventos/h. Eficiência 68%. Despertares 8. Tempo total 5h42min.',
      uploadedAt:  new Date(Date.now() - 5 * DAY),
      processedAt: new Date(Date.now() - 5 * DAY + 110000),
    },
  });
  await prisma.examResult.create({
    data: {
      examId:    examSono.id,
      summary:   'Apneia obstrutiva do sono moderada. Indicação de avaliação para CPAP.',
      findings:  JSON.stringify([
        { name: 'IAH',                value: '22',     unit: 'eventos/h', status: 'alto'    },
        { name: 'Eficiência do sono', value: '68',     unit: '%',         status: 'baixo'   },
        { name: 'Tempo total',        value: '5h42',   unit: '',          status: 'baixo'   },
        { name: 'Despertares',        value: '8',      unit: '',          status: 'alto'    },
      ]),
      riskLevel: 'MODERATE',
    },
  });

  // Relatório IA do João
  await prisma.aiReport.create({
    data: {
      patientId:  joaoId,
      doctorId,
      type:       'full',
      content:    `# Avaliação clínica — João Carlos Mendes

## Resumo
Paciente masculino, 58 anos, com múltiplos fatores de risco cardiometabólico já estabelecidos. Os dados coletados pela pulseira Care Plus e exames laboratoriais sugerem **síndrome metabólica avançada com diabetes tipo 2 descompensado** e **provável apneia obstrutiva do sono**.

## Achados principais
- Pressão arterial média de **148/94 mmHg** (HAS descompensada)
- Glicemia em jejum **186 mg/dL** e HbA1c **8.2%** (controle inadequado)
- LDL **168 mg/dL** e triglicerídeos **241 mg/dL** (dislipidemia)
- SpO₂ basal **93%** com IAH de **22 eventos/h** (apneia moderada)
- Sono fragmentado: eficiência de 68%, 8 despertares por noite

## Probabilidades clínicas estimadas
- Diabetes tipo 2 descompensado — **86%**
- Hipertensão descompensada — **84%**
- Síndrome metabólica — **78%**
- Apneia obstrutiva do sono — **71%**
- Risco cardiovascular aumentado — **69%**

## Conclusão
Recomenda-se acompanhamento médico contínuo, ajuste terapêutico para controle glicêmico e pressórico, avaliação cardiológica e investigação formal do sono. O HealthInPulse seguirá monitorando os sinais vitais via pulseira Care Plus.`,
      riskLevel:  'HIGH',
      suggestions: JSON.stringify([
        { type: 'medication', text: 'Avaliar ajuste de Metformina + adicionar inibidor SGLT2' },
        { type: 'medication', text: 'Reavaliar terapia anti-hipertensiva (associar IECA + diurético)' },
        { type: 'exam',       text: 'Solicitar microalbuminúria e fundo de olho (rastreio de complicações)' },
        { type: 'specialist', text: 'Encaminhar para cardiologia e medicina do sono' },
        { type: 'lifestyle',  text: 'Plano nutricional individualizado + atividade física supervisionada' },
      ]),
      generatedAt: new Date(Date.now() - 1 * DAY),
    },
  });

  // Consultas do João
  await prisma.appointment.create({
    data: {
      patientId: joaoId, doctorId,
      scheduledAt: new Date(Date.now() - 12 * DAY),
      duration: 45, status: 'COMPLETED',
      notes: 'Avaliação inicial — solicitação de exames laboratoriais e polissonografia',
    },
  });
  await prisma.appointment.create({
    data: {
      patientId: joaoId, doctorId,
      scheduledAt: new Date(Date.now() + 2 * DAY + 10 * HOUR),
      duration: 30, status: 'CONFIRMED',
      notes: 'Retorno — revisão dos exames e ajuste medicamentoso',
    },
  });

  // Notificações do João
  await prisma.notification.createMany({
    data: [
      {
        userId: joaoUser.id, type: 'CRITICAL',
        title:   'Pressão arterial elevada',
        message: 'Sua pressão média nas últimas 24h foi de 148/94 mmHg',
        read: false,
        metadata: JSON.stringify({ severity: 'high' }),
        createdAt: new Date(Date.now() - 6 * HOUR),
      },
      {
        userId: joaoUser.id, type: 'ALERT',
        title:   'Saturação de O₂ baixa durante o sono',
        message: 'SpO₂ atingiu 89% em 4 momentos da última noite',
        read: false,
        metadata: JSON.stringify({ severity: 'high' }),
        createdAt: new Date(Date.now() - 14 * HOUR),
      },
      {
        userId: joaoUser.id, type: 'INFO',
        title:   'Exame processado',
        message: 'Painel metabólico analisado pela IA — resultado disponível',
        read: true,
        metadata: JSON.stringify({}),
        createdAt: new Date(Date.now() - 10 * DAY + 90000),
      },
    ],
  });

  // ─── Paciente 2: Marina Azevedo Lima (preventivo) ─────────
  console.log('  → Marina Azevedo Lima (caso preventivo)');
  const marinaUser = await prisma.user.create({
    data: {
      username:      'marina',
      email:         'marina@healthinpulse.dev',
      tutorialSeenAt: new Date(), // demo não abre o tutorial
      passwordHash:  await hash('Marina@123'),
      role:          'PATIENT',
      emailVerified: true,
      patient: {
        create: {
          fullName:       'Marina Azevedo Lima',
          dateOfBirth:    new Date('1992-09-23'),
          gender:         'FEMALE',
          phone:          '11 99700-2200',
          bloodType:      'O+',
          height:         166,
          weight:         70,
          allergies:      JSON.stringify([]),
          chronicConds:   JSON.stringify([]),
          emergencyName:  'Pedro Lima',
          emergencyPhone: '11 99700-2201',
        },
      },
    },
    include: { patient: true },
  });
  const marinaId = marinaUser.patient.id;
  await prisma.doctorPatient.create({ data: { doctorId, patientId: marinaId } });

  // 60 dias da Marina com tendência crescente de piora metabólica
  // dia 60..40 saudável | 40..20 transição | 20..0 alerta
  await prisma.vitalSign.createMany({
    data: everyDay(60, 2, 11, (recordedAt, i) => {
      const t = 1 - (i / 59);  // 0 → 1 ao longo de 60 dias
      // Interpola entre saudável (t=0) e alerta (t=1)
      return {
        patientId: marinaId,
        heartRate:   round(lerp(70,  84,  t) + noise(2)),
        systolic:    round(lerp(114, 128, t) + noise(3)),
        diastolic:   round(lerp(74,  84,  t) + noise(2)),
        oxygenSat:   round(lerp(98.5, 97, t) + noise(0.3), 1),
        temperature: round(36.7 + noise(0.15), 1),
        glucose:     round(lerp(90,  112, t) + noise(4)),
        source:      'wearable',
        recordedAt,
      };
    }),
  });

  // Exames da Marina — inicial (60 dias) vs atual (3 dias)
  const examIni = await prisma.exam.create({
    data: {
      patientId: marinaId,
      title:       'Painel metabólico inicial',
      description: 'Linha de base ao iniciar acompanhamento',
      fileUrl:     '/uploads/exams/seed-marina-inicial.pdf',
      fileType:    'pdf',
      status:      'DONE',
      ocrText:     'Glicemia jejum 88 mg/dL. HbA1c 5.2%. LDL 118.',
      uploadedAt:  new Date(Date.now() - 58 * DAY),
      processedAt: new Date(Date.now() - 58 * DAY + 70000),
    },
  });
  await prisma.examResult.create({
    data: {
      examId:    examIni.id,
      summary:   'Perfil metabólico dentro da normalidade. Sem indícios de doença.',
      findings:  JSON.stringify([
        { name: 'Glicemia em jejum', value: '88',  unit: 'mg/dL', status: 'normal' },
        { name: 'HbA1c',              value: '5.2', unit: '%',     status: 'normal' },
        { name: 'LDL colesterol',     value: '118', unit: 'mg/dL', status: 'normal' },
      ]),
      riskLevel: 'LOW',
    },
  });

  const examAtual = await prisma.exam.create({
    data: {
      patientId: marinaId,
      title:       'Painel metabólico (revisão)',
      description: 'Reavaliação após detecção de tendência de piora pela pulseira',
      fileUrl:     '/uploads/exams/seed-marina-atual.pdf',
      fileType:    'pdf',
      status:      'DONE',
      ocrText:     'Glicemia jejum 112 mg/dL. HbA1c 5.9%. LDL 132. Trig 158.',
      uploadedAt:  new Date(Date.now() - 3 * DAY),
      processedAt: new Date(Date.now() - 3 * DAY + 80000),
    },
  });
  await prisma.examResult.create({
    data: {
      examId:    examAtual.id,
      summary:   'Glicemia e HbA1c em faixa de pré-diabetes. Perfil lipídico em atenção. Recomenda-se intervenção precoce.',
      findings:  JSON.stringify([
        { name: 'Glicemia em jejum', value: '112', unit: 'mg/dL', status: 'atenção' },
        { name: 'HbA1c',              value: '5.9', unit: '%',     status: 'atenção' },
        { name: 'LDL colesterol',     value: '132', unit: 'mg/dL', status: 'atenção' },
        { name: 'Triglicerídeos',     value: '158', unit: 'mg/dL', status: 'atenção' },
      ]),
      riskLevel: 'MODERATE',
    },
  });

  // Relatório IA da Marina
  await prisma.aiReport.create({
    data: {
      patientId:  marinaId,
      doctorId,
      type:       'full',
      content:    `# Avaliação preventiva — Marina Azevedo Lima

## Resumo
Paciente do sexo feminino, 34 anos, previamente saudável, iniciou o uso do HealthInPulse com perfil metabólico normal. Ao longo de 60 dias de monitoramento contínuo pela pulseira Care Plus, foram detectados **sinais discretos e progressivos de piora metabólica** que justificam intervenção precoce.

## Tendência observada nos 60 dias
- Ganho de peso: 64 kg → **70 kg** (+6 kg; IMC 23.2 → 25.4)
- Glicemia em jejum: 88 → **112 mg/dL** (passou para faixa de pré-diabetes)
- HbA1c: 5.2 → **5.9%** (pré-diabetes)
- Frequência cardíaca de repouso média: 70 → **84 bpm**
- Pressão arterial média: 114/74 → **128/84 mmHg**
- Qualidade do sono caiu de boa para regular (eficiência 76%)

## Probabilidades clínicas estimadas
- Pré-diabetes — **62%**
- Síndrome metabólica inicial — **48%**
- Hipertensão futura — **36%**
- Risco cardiovascular aumentado — **31%**
- Apneia do sono — **18%**

## Conclusão
A detecção precoce permite intervenção **antes** da evolução para um quadro grave. Recomenda-se ajuste de estilo de vida (dieta + atividade física), monitoramento mantido pela pulseira e reavaliação em 3 meses.`,
      riskLevel:  'MODERATE',
      suggestions: JSON.stringify([
        { type: 'lifestyle',  text: 'Reduzir carboidratos refinados e açúcar — encaminhar para nutricionista' },
        { type: 'lifestyle',  text: 'Atividade física aeróbica 150 min/semana + treino de força 2x/semana' },
        { type: 'exam',       text: 'Reavaliar HbA1c e perfil lipídico em 90 dias' },
        { type: 'info',       text: 'Manter monitoramento contínuo via pulseira Care Plus' },
      ]),
      generatedAt: new Date(Date.now() - 1 * DAY),
    },
  });

  // Consultas Marina
  await prisma.appointment.create({
    data: {
      patientId: marinaId, doctorId,
      scheduledAt: new Date(Date.now() - 58 * DAY),
      duration: 30, status: 'COMPLETED',
      notes: 'Avaliação preventiva inicial — paciente saudável buscando monitoramento',
    },
  });
  await prisma.appointment.create({
    data: {
      patientId: marinaId, doctorId,
      scheduledAt: new Date(Date.now() + 4 * DAY + 15 * HOUR),
      duration: 30, status: 'SCHEDULED',
      notes: 'Revisão dos exames recentes e plano de intervenção precoce',
    },
  });

  // Notificações Marina
  await prisma.notification.createMany({
    data: [
      {
        userId: marinaUser.id, type: 'ALERT',
        title:   'Tendência de glicemia em alta',
        message: 'Sua glicemia média subiu 24% em 60 dias',
        read: false,
        metadata: JSON.stringify({ severity: 'medium' }),
        createdAt: new Date(Date.now() - 4 * DAY),
      },
      {
        userId: marinaUser.id, type: 'INFO',
        title:   'Novo relatório disponível',
        message: 'Análise preventiva da pulseira Care Plus pronta para visualização',
        read: false,
        metadata: JSON.stringify({}),
        createdAt: new Date(Date.now() - 1 * DAY),
      },
    ],
  });

  // ─── Paciente 3: Roberto Alves Pereira (caso oncológico) ──
  // A história do stand: 63 anos, ex-fumante (35 maços-ano, parou há 8),
  // intestino mudou, cansado. A balança Care Plus mostra 8 kg a menos em
  // 90 dias; o hemograma tem anemia ferropriva e o FIT veio positivo. O
  // motor dá colorretal INVESTIGAR e indica a TC de pulmão (ex-fumante).
  console.log('  → Roberto Alves Pereira (caso oncológico)');
  const robertoUser = await prisma.user.create({
    data: {
      username:      'roberto',
      email:         'roberto@healthinpulse.dev',
      tutorialSeenAt: new Date(), // demo não abre o tutorial
      passwordHash:  await hash('Roberto@123'),
      role:          'PATIENT',
      emailVerified: true,
      patient: {
        create: {
          fullName:       'Roberto Alves Pereira',
          dateOfBirth:    new Date('1963-05-10'),
          gender:         'MALE',
          phone:          '11 97600-3300',
          bloodType:      'B+',
          height:         172,
          weight:         76,
          allergies:      JSON.stringify([]),
          chronicConds:   JSON.stringify(['Ex-tabagista (35 maços-ano, parou há 8 anos)']),
          emergencyName:  'Sônia Pereira',
          emergencyPhone: '11 97600-3301',
        },
      },
    },
    include: { patient: true },
  });
  const robertoId = robertoUser.patient.id;
  await prisma.doctorPatient.create({ data: { doctorId, patientId: robertoId } });

  // Pulseira: 30 dias de leituras discretamente alteradas (anemia: FC um
  // pouco alta). Balança: 90 dias, de 84 para 76 kg, pesando de manhã
  // (2 h antes da leitura da pulseira do dia, que fica como a mais recente).
  await prisma.vitalSign.createMany({
    data: [
      ...everyDay(30, 2, 9, (recordedAt) => ({
        patientId: robertoId,
        heartRate:   round(88  + noise(4)),
        systolic:    round(128 + noise(5)),
        diastolic:   round(80  + noise(3)),
        oxygenSat:   round(96.5 + noise(0.6), 1),
        temperature: round(36.6 + noise(0.2), 1),
        glucose:     round(98  + noise(6)),
        source:      'wearable',
        recordedAt,
      })),
      ...Array.from({ length: 31 }, (_, k) => ({
        patientId:  robertoId,
        weight:     round(lerp(84, 76, k / 30), 1),
        source:     'scale',
        recordedAt: new Date(Date.now() - (90 - k * 3) * DAY - 2 * HOUR),
      })),
    ],
  });
  await prisma.device.create({
    data: {
      patientId: robertoId, name: 'Balança Care Plus', type: 'scale',
      status: 'ACTIVE', lastSyncAt: new Date(Date.now() - 2 * HOUR),
    },
  });

  // Exames do Roberto: anemia ferropriva e sangue oculto positivo
  const examHemo = await prisma.exam.create({
    data: {
      patientId: robertoId,
      title:       'Hemograma e ferritina',
      description: 'Hemograma completo e perfil de ferro',
      fileUrl:     '/uploads/exams/seed-roberto-hemograma.pdf',
      fileType:    'pdf',
      status:      'DONE',
      ocrText:     'Hemoglobina 10,9 g/dL. VCM 74 fL. Ferritina 9 ng/mL.',
      uploadedAt:  new Date(Date.now() - 12 * DAY),
      processedAt: new Date(Date.now() - 12 * DAY + 85000),
    },
  });
  await prisma.examResult.create({
    data: {
      examId:    examHemo.id,
      summary:   'Anemia microcítica com ferritina baixa (padrão de deficiência de ferro). Em homem de 63 anos, pede investigação de perda de sangue pelo intestino.',
      findings:  JSON.stringify([
        { name: 'Hemoglobina', value: '10,9', unit: 'g/dL',  status: 'baixo' },
        { name: 'VCM',         value: '74',   unit: 'fL',    status: 'baixo' },
        { name: 'Ferritina',   value: '9',    unit: 'ng/mL', status: 'baixo' },
      ]),
      riskLevel: 'HIGH',
    },
  });

  const examFit = await prisma.exam.create({
    data: {
      patientId: robertoId,
      title:       'Sangue oculto nas fezes (FIT)',
      description: 'Teste imunoquímico fecal',
      fileUrl:     '/uploads/exams/seed-roberto-fit.pdf',
      fileType:    'pdf',
      status:      'DONE',
      ocrText:     'Pesquisa de sangue oculto nas fezes (método imunoquímico): POSITIVO.',
      uploadedAt:  new Date(Date.now() - 10 * DAY),
      processedAt: new Date(Date.now() - 10 * DAY + 60000),
    },
  });
  await prisma.examResult.create({
    data: {
      examId:    examFit.id,
      summary:   'FIT positivo. O próximo passo indicado é a colonoscopia.',
      findings:  JSON.stringify([
        { name: 'Pesquisa de sangue oculto nas fezes (FIT)', value: 'Positivo', unit: '', status: 'alterado' },
      ]),
      riskLevel: 'HIGH',
    },
  });

  // Consulta do Roberto: retorno para pedir a colonoscopia
  await prisma.appointment.create({
    data: {
      patientId: robertoId, doctorId,
      scheduledAt: new Date(Date.now() + 1 * DAY + 9 * HOUR),
      duration: 30, status: 'CONFIRMED',
      notes: 'Retorno — FIT positivo e anemia: pedir colonoscopia',
    },
  });
  await prisma.notification.create({
    data: {
      userId: robertoUser.id, type: 'INFO',
      title:   'Exame processado',
      message: 'Sangue oculto nas fezes analisado — resultado disponível',
      read: false,
      metadata: JSON.stringify({}),
      createdAt: new Date(Date.now() - 10 * DAY + 60000),
    },
  });

  // ─── Triagens concluídas (calculadas pelo motor) ──────────
  // Cada persona faz a triagem de verdade (triageService: fase crônica,
  // fase oncológica e finalize), com as respostas do roteiro. O resultado,
  // o AiReport e o aviso à médica saem do motor, não de texto fixo.
  console.log('  → triagens das personas (motor)');
  const triageService = loadTriageService(prisma);

  const roberto = await runTriage(triageService, robertoId, {
    profile: {
      smoker: true, packYears: 35, quitYears: 8, alcoholDosesWeek: 4,
      familyHistoryCancer: [], familyHistoryDm: false, familyHistoryCv: false,
    },
    answers: {
      mudanca_habito_intestinal: true,
      fadiga_diurna:             true,
      phq9_fadiga:               2,     // cansado mais da metade dos dias
      perda_peso_inexplicada:    true,  // a balança já pesou: não conta de novo no câncer
      tabagismo_acima_10_macos_ano: true,
    },
    daysAgo: 1,
  });
  expectOncology('Roberto', roberto, { CA_COLORRETAL: 'INVESTIGAR' });
  if (roberto.result.riskLevel !== 'HIGH') {
    throw new Error(`Seed: AiReport do Roberto deveria ser HIGH, veio ${roberto.result.riskLevel}`);
  }

  const joao = await runTriage(triageService, joaoId, {
    profile: {
      smoker: false, alcoholDosesWeek: 4, familyHistoryCancer: [],
      familyHistoryDm: true, familyHistoryCv: true,
    },
    answers: {
      has_conhecida: true, uso_anti_hipertensivo: true, diabetes_diagnosticado: true,
      historico_glicemia_alterada: true, colesterol_alto_relato: true, historico_familiar_cv: true,
      historico_familiar_dm2: true, sedentarismo: true, circunferencia_abdominal_aumentada: true,
      ronco_alto: true, apneia_observada: true, fadiga_diurna: true, poliuria: true, polidipsia: true,
    },
    daysAgo: 5,
  });
  expectOncology('João', joao, { CA_COLORRETAL: 'ROTINA', CA_PULMAO: 'ROTINA', CA_PROSTATA: 'ROTINA' });

  // Marina não respondeu às perguntas de mama ("não sei"): a ATENÇÃO dela
  // vem do perfil (mãe com câncer de mama aos 41). Um "não" ali derrubaria
  // o risco relativo para perto de 1 e ela cairia em ROTINA.
  const marina = await runTriage(triageService, marinaId, {
    profile: {
      smoker: false, alcoholDosesWeek: 2, familyHistoryCancer: ['mama'], papEmDia: false,
      familyHistoryDm: false, familyHistoryCv: false,
    },
    answers: {
      historico_glicemia_alterada: true, ganho_peso_inexplicado: true,
    },
    unknown: ['nodulo_mama', 'alteracao_mamilo', 'alteracao_pele_mama'],
    daysAgo: 2,
  });
  expectOncology('Marina', marina, { CA_MAMA: 'ATENÇÃO' });

  // A triagem gera metas e o bônus de coins sozinha. Roberto fica com as
  // dele; João e Marina usam as metas e o saldo curados mais abaixo.
  await prisma.healthGoal.deleteMany({ where: { patientId: { in: [joaoId, marinaId] } } });
  await prisma.healthCoinTx.deleteMany({ where: { patientId: { in: [joaoId, marinaId] } } });

  // ─── Catálogo de recompensas ──────────────────────────────
  console.log('  → catálogo de recompensas');
  const rewards = await Promise.all([
    prisma.reward.create({ data: {
      title: 'Guia nutricional personalizado', type: 'item',
      description: 'PDF com plano alimentar adaptado ao seu perfil',
      costCoins: 50,
    }}),
    prisma.reward.create({ data: {
      title: 'Desconto de 20% em exames laboratoriais', type: 'discount',
      description: 'Cupom para usar na rede credenciada Care Plus',
      costCoins: 150,
    }}),
    prisma.reward.create({ data: {
      title: 'Kit fitness Care Plus', type: 'item',
      description: 'Garrafa, faixa elástica e podômetro',
      costCoins: 200,
    }}),
    prisma.reward.create({ data: {
      title: 'Consulta com nutricionista', type: 'consultation',
      description: 'Sessão de 45 min com profissional credenciado',
      costCoins: 300,
    }}),
    prisma.reward.create({ data: {
      title: 'Consulta com especialista', type: 'consultation',
      description: 'Endocrinologia, cardiologia ou medicina do sono',
      costCoins: 500,
    }}),
    prisma.reward.create({ data: {
      title: 'Check-up cardiológico completo', type: 'exam',
      description: 'Eletrocardiograma + ecocardiograma + holter 24h',
      costCoins: 800,
    }}),
  ]);

  // ─── Metas iniciais e coins ───────────────────────────────
  console.log('  → metas iniciais e saldo de coins');

  // Metas curadas a partir dos modelos com fonte (data/prevention.js),
  // com progresso inventado só para a demo mostrar a barra andando.
  const fromTemplate = (code, ctx, extra) => {
    const t = goalTemplates.find((x) => x.code === code);
    return { ...t.build(ctx), templateCode: t.code, sourceCode: t.sourceCode, source: 'triage', ...extra };
  };

  // João — caso grave: pressão, atividade física e a consulta já marcada
  const joaoGoals = [
    fromTemplate('PA_NORMAL', { wearable: { systolicAvg: 160 } }, { current: 146, progress: 45 }),
    fromTemplate('ATIVIDADE_150', {}, { current: 90, progress: 60 }),
  ];
  for (const g of joaoGoals) {
    await prisma.healthGoal.create({ data: { patientId: joaoId, ...g, status: 'ACTIVE' } });
  }
  // Uma meta já concluída pra mostrar progresso
  await prisma.healthGoal.create({ data: {
    patientId: joaoId,
    ...fromTemplate('CONSULTA', {}, { coinsReward: 40 }),
    current: 1, progress: 100,
    status: 'DONE',
    completedAt: new Date(Date.now() - 11 * DAY),
  }});

  // Marina — preventivo: atividade física e a consulta pedida pela triagem
  const marinaGoals = [
    fromTemplate('ATIVIDADE_150', {}, { current: 120, progress: 80 }),
    fromTemplate('CONSULTA', {}, { current: 0, progress: 0 }),
  ];
  for (const g of marinaGoals) {
    await prisma.healthGoal.create({ data: { patientId: marinaId, ...g, status: 'ACTIVE' } });
  }
  await prisma.healthGoal.create({ data: {
    patientId: marinaId,
    title: 'Triagem inicial',
    description: 'Completar primeira triagem do sistema',
    metric: 'custom', targetCmp: 'gte', targetValue: 1,
    current: 1, progress: 100,
    status: 'DONE', coinsReward: 20, source: 'manual',
    completedAt: new Date(Date.now() - 50 * DAY),
  }});

  // Transações iniciais de coins
  const joaoCoins = 220;
  await prisma.healthCoinTx.createMany({ data: [
    { patientId: joaoId, delta: 100, reason: 'Bônus: bem-vindo ao HealthInPulse', refType: 'bonus',
      createdAt: new Date(Date.now() - 12 * DAY) },
    { patientId: joaoId, delta: 20,  reason: 'Bônus: triagem concluída', refType: 'triage',
      createdAt: new Date(Date.now() - 5  * DAY) },
    { patientId: joaoId, delta: 40,  reason: 'Meta concluída: Agendar consulta com seu médico', refType: 'goal',
      createdAt: new Date(Date.now() - 11 * DAY) },
    { patientId: joaoId, delta: 30,  reason: 'Dia de adesão completa ao monitoramento', refType: 'bonus',
      createdAt: new Date(Date.now() - 2  * DAY) },
    { patientId: joaoId, delta: 30,  reason: '7 dias consecutivos de uso da pulseira', refType: 'bonus',
      createdAt: new Date(Date.now() - 1  * DAY) },
  ]});
  await prisma.patient.update({ where: { id: joaoId }, data: { healthCoins: joaoCoins } });

  const marinaCoins = 410;
  await prisma.healthCoinTx.createMany({ data: [
    { patientId: marinaId, delta: 100, reason: 'Bônus: bem-vindo ao HealthInPulse', refType: 'bonus',
      createdAt: new Date(Date.now() - 58 * DAY) },
    { patientId: marinaId, delta: 20,  reason: 'Meta concluída: Triagem inicial', refType: 'goal',
      createdAt: new Date(Date.now() - 50 * DAY) },
    { patientId: marinaId, delta: 50,  reason: 'Bônus: 30 dias consecutivos de uso', refType: 'bonus',
      createdAt: new Date(Date.now() - 28 * DAY) },
    { patientId: marinaId, delta: 30,  reason: 'Bônus: atividade física semanal', refType: 'bonus',
      createdAt: new Date(Date.now() - 20 * DAY) },
    { patientId: marinaId, delta: 50,  reason: 'Bônus: 60 dias consecutivos de uso', refType: 'bonus',
      createdAt: new Date(Date.now() - 2  * DAY) },
    { patientId: marinaId, delta: 60,  reason: 'Bônus: hábitos saudáveis semanais', refType: 'bonus',
      createdAt: new Date(Date.now() - 7  * DAY) },
    { patientId: marinaId, delta: 100, reason: 'Promoção: paciente preventivo', refType: 'bonus',
      createdAt: new Date(Date.now() - 1  * DAY) },
  ]});
  await prisma.patient.update({ where: { id: marinaId }, data: { healthCoins: marinaCoins } });

  // Um resgate antigo da Marina (pra mostrar histórico de loja)
  await prisma.rewardRedemption.create({
    data: {
      patientId: marinaId,
      rewardId:  rewards[0].id,
      costCoins: rewards[0].costCoins,
      status:    'APPROVED',
      redeemedAt: new Date(Date.now() - 25 * DAY),
    },
  });
  await prisma.healthCoinTx.create({ data: {
    patientId: marinaId, delta: -rewards[0].costCoins,
    reason: `Resgate: ${rewards[0].title}`, refType: 'redemption',
    createdAt: new Date(Date.now() - 25 * DAY),
  }});
  // Saldo real da Marina após esse resgate
  await prisma.patient.update({
    where: { id: marinaId },
    data:  { healthCoins: marinaCoins - rewards[0].costCoins },
  });

  console.log('✅ Seed concluído!');
  console.log('');
  console.log('  👩‍⚕️ Médica:  ana     / Doctor@123  (Dra. Ana Beatriz)');
  console.log('  🧑 João:    joao    / Joao@123    (caso grave)');
  console.log('  👩 Marina:  marina  / Marina@123  (preventivo)');
  console.log('  👴 Roberto: roberto / Roberto@123 (colorretal)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
