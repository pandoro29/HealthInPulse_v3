// ─── Prevenção: faixas normais e modelos de meta ───────────────────
// O que o paciente vê (regra R2 do design de 22/10/2026): padrão normal,
// próximo passo, exames preventivos e metas. Nada aqui cita doença.
//
// Regra R1: todo número tem fonte do mesmo nível do Guyton & Hall
// (livro-texto, diretriz oficial ou base oficial). As fontes entram no
// kb (ClinicalSource) junto com as da oncologia; a ficha de cada valor do
// livro está em Docs/base-clinica-fisiologia.md.
//
// Ficou de fora por falta de fonte do mesmo nível: limiar de febre (o
// livro só dá 37,0 °C como normal), água 2 L/dia, 7000 passos/dia, sono
// e glicemia fora de jejum (a pulseira não sabe se a pessoa está em jejum).

const GUYTON = 'GUYTON_HALL_FISIOLOGIA';

const sources = [
  {
    code: GUYTON,
    short: 'Guyton & Hall, Tratado de Fisiologia Médica',
    citation: 'Hall JE, Hall ME. Guyton & Hall: Tratado de Fisiologia Médica. Edição a conferir. '
      + 'Valores extraídos por IA a partir do PDF do livro (página do PDF, não a impressa).',
    url: null,
    year: null,
    note: 'Frequência cardíaca: taquicardia acima de 100 e bradicardia abaixo de 60 bpm no adulto (PDF p. 474–475). '
      + 'SatO₂ arterial normal 95–99% (tabela de gases sanguíneos, PDF p. 3135). Ver Docs/base-clinica-fisiologia.md.',
  },
  {
    code: 'SBC_HAS_2025',
    short: 'Diretriz Brasileira de Hipertensão Arterial (SBC/SBH/SBN), 2025',
    citation: 'Brandão AA, Rodrigues CIS, Bortolotto LA, Nadruz W, et al. Diretriz Brasileira de Hipertensão '
      + 'Arterial – 2025. Arq Bras Cardiol. 2025;122(9):e20250624. DOI 10.36660/abc.20250624.',
    url: 'https://abccardiol.org/article/diretriz-brasileira-de-hipertensao-arterial-2025/',
    year: 2025,
    note: 'PA normal < 120 e < 80 mmHg; pré-hipertensão 120–139 e/ou 80–89 (Quadro 3.2, p. 36). '
      + 'Fora do consultório (MRPA/MAPA), hipertensão a partir de 130 e/ou 80 (Quadro 3.4, p. 37).',
  },
  {
    code: 'OMS_ATIVIDADE_2020',
    short: 'OMS, diretrizes de atividade física, 2020',
    citation: 'World Health Organization. WHO guidelines on physical activity and sedentary behaviour. Geneva: WHO; 2020.',
    url: 'https://www.who.int/publications/i/item/9789240015128',
    year: 2020,
    note: 'Adultos (18–64 anos e 65+): pelo menos 150 a 300 minutos por semana de atividade aeróbica moderada. '
      + 'Mesma recomendação no Guia de Atividade Física para a População Brasileira (MS, 2021; '
      + 'Ritti-Dias RM et al. Rev Bras Ativ Fís Saúde 2021;26:e0215).',
  },
  {
    code: 'OMS_IMC_2000',
    short: 'OMS, classificação do IMC',
    citation: 'World Health Organization. Obesity: preventing and managing the global epidemic. '
      + 'WHO Technical Report Series 894. Geneva: WHO; 2000.',
    url: 'https://iris.who.int/handle/10665/42330',
    year: 2000,
    note: 'IMC normal em adultos: 18,5 a 24,9 kg/m².',
  },
  {
    code: 'MS_PCDT_TABAGISMO_2020',
    short: 'Ministério da Saúde, protocolo do tabagismo, 2020',
    citation: 'Brasil. Ministério da Saúde. Portaria Conjunta SAES/SCTIE nº 10, de 16 de abril de 2020. '
      + 'Protocolo Clínico e Diretrizes Terapêuticas do Tabagismo.',
    url: 'https://www.gov.br/conitec/pt-br/midias/protocolos/pcdt_tabagismo.pdf',
    year: 2020,
    note: 'Desfecho esperado: cessação total do tabagismo. Tratamento no SUS com quatro sessões iniciais, '
      + 'preferencialmente semanais.',
  },
  {
    code: 'OMS_ALCOOL_2023',
    short: 'OMS, 2023, e INCA, 2024, sobre álcool',
    citation: 'Anderson BO, Berdzuli N, Ilbawi A, Kestel D, Kluge HP, Krech R, et al. Health and cancer risks associated '
      + 'with low levels of alcohol consumption. Lancet Public Health. 2023;8(1):e6–e7. DOI 10.1016/S2468-2667(22)00317-6. '
      + 'INCA. Posicionamento do Instituto Nacional de Câncer acerca das Bebidas Alcoólicas. Rio de Janeiro: INCA; 2024.',
    url: 'https://www.who.int/europe/news/item/04-01-2023-no-level-of-alcohol-consumption-is-safe-for-our-health',
    year: 2023,
    note: 'Não existe quantidade de álcool sem efeito na saúde (OMS); não há limite seguro (INCA). Sem limite numérico oficial.',
  },
];

// Faixas normais dos sinais que o paciente vê ("como você está em relação
// ao normal"). `field` é o campo do snapshot da pulseira
// (wearableEvidence.collectFromDatabase).
// Usada só pelo plano de prevenção do /teste (patientView.missionsFor)
sources.push({
  code: 'OMS_DIETA_2020',
  short: 'OMS, alimentação saudável, 2020',
  citation: 'World Health Organization. Healthy diet. Fact sheet. Geneva: WHO; 29 April 2020.',
  url: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet',
  year: 2020,
  note: 'Pelo menos 400 g (cinco porções) de frutas e vegetais por dia.',
});

const normalRanges = [
  {
    code: 'FC_REPOUSO', label: 'Frequência cardíaca de repouso', unit: 'bpm',
    field: 'restingHrAvg', fallbackField: 'restingHr', min: 60, max: 100, sourceCode: GUYTON,
  },
  {
    code: 'SPO2', label: 'Oxigenação do sangue (SpO₂)', unit: '%',
    // Sem máximo: 95–99% é da gasometria arterial; no oxímetro 100% é leitura normal
    field: 'restingSpO2', min: 95, sourceCode: GUYTON,
  },
  {
    code: 'PA_SISTOLICA', label: 'Pressão sistólica (a maior)', unit: 'mmHg',
    field: 'systolicAvg', fallbackField: 'systolic', max: 119, sourceCode: 'SBC_HAS_2025',
  },
  {
    code: 'PA_DIASTOLICA', label: 'Pressão diastólica (a menor)', unit: 'mmHg',
    field: 'diastolicAvg', fallbackField: 'diastolic', max: 79, sourceCode: 'SBC_HAS_2025',
  },
];

// Modelos de meta. Uma meta só nasce daqui: consulta (próximo passo),
// hábito que a triagem encontrou ou sinal fora da faixa normal. `when`
// recebe { profile, wearable, nextStep } e diz se a meta vale; `build`
// devolve os campos do HealthGoal. O texto nunca cita doença.
const goalTemplates = [
  {
    code: 'CONSULTA',
    sourceCode: null, // vem do resultado da triagem (motor com fonte), não de um número
    when: ({ nextStep }) => nextStep === 'CONSULTA',
    build: () => ({
      title: 'Agendar consulta com seu médico',
      description: 'Leve o resultado da triagem. Marque como feita quando a consulta estiver agendada.',
      metric: 'custom', targetCmp: 'gte', targetValue: 1, rangeMin: 0, coinsReward: 60,
    }),
  },
  {
    code: 'PARAR_DE_FUMAR',
    sourceCode: 'MS_PCDT_TABAGISMO_2020',
    when: ({ profile }) => profile.smoker === true && (profile.quitYears == null || profile.quitYears === 0),
    build: () => ({
      title: 'Parar de fumar',
      description: 'Comece pelas 4 sessões iniciais do tratamento gratuito no SUS. Marque cada sessão feita.',
      metric: 'custom', targetCmp: 'gte', targetValue: 4, rangeMin: 0, coinsReward: 80,
    }),
  },
  {
    code: 'ATIVIDADE_150',
    sourceCode: 'OMS_ATIVIDADE_2020',
    when: () => true, // recomendação da OMS para todo adulto
    build: () => ({
      title: '150 minutos de atividade física por semana',
      description: 'Caminhada rápida, bicicleta, dança: atividade moderada, somando pelo menos 150 minutos na semana.',
      metric: 'custom', targetCmp: 'gte', targetValue: 150, rangeMin: 0, coinsReward: 50,
    }),
  },
  {
    code: 'REDUZIR_ALCOOL',
    sourceCode: 'OMS_ALCOOL_2023',
    when: ({ profile }) => Number(profile.alcoholDosesWeek) > 0,
    build: ({ profile }) => ({
      title: 'Reduzir o álcool',
      description: 'Não existe quantidade de álcool sem efeito na saúde: quanto menos, melhor.',
      metric: 'custom', targetCmp: 'lte', targetValue: 0, rangeMax: Number(profile.alcoholDosesWeek), coinsReward: 50,
    }),
  },
  {
    code: 'IMC_NORMAL',
    sourceCode: 'OMS_IMC_2000',
    when: ({ profile }) => profile.bmi != null && profile.bmi >= 25 && profile.height,
    build: ({ profile }) => {
      const h = profile.height > 3 ? profile.height / 100 : profile.height;
      const target = Math.floor(24.9 * h * h);
      return {
        title: `Chegar a ${target} kg`,
        description: 'Peso em que o IMC entra na faixa normal (18,5 a 24,9).',
        metric: 'weight', targetCmp: 'lte', targetValue: target,
        rangeMax: profile.weight ?? null, coinsReward: 80,
      };
    },
  },
  {
    code: 'FC_REPOUSO_NORMAL',
    sourceCode: GUYTON,
    when: ({ wearable }) => (wearable.restingHrAvg ?? wearable.restingHr) > 100,
    build: () => ({
      title: 'Frequência cardíaca de repouso entre 60 e 100 bpm',
      description: 'Faixa normal no adulto em repouso.',
      metric: 'heartRate', targetCmp: 'between', rangeMin: 60, rangeMax: 100, coinsReward: 60,
    }),
  },
  {
    code: 'PA_NORMAL',
    sourceCode: 'SBC_HAS_2025',
    // Medida fora do consultório (pulseira): o limiar da diretriz é 130 e/ou 80
    when: ({ wearable }) => (wearable.systolicAvg ?? wearable.systolic) >= 130
      || (wearable.diastolicAvg ?? wearable.diastolic) >= 80,
    build: ({ wearable }) => ({
      title: 'Pressão abaixo de 130/80 mmHg',
      description: 'Meta de pressão medida em casa recomendada pela diretriz brasileira.',
      metric: 'systolic', targetCmp: 'lte', targetValue: 129,
      rangeMax: Math.round(wearable.systolicAvg ?? wearable.systolic ?? 150), coinsReward: 60,
    }),
  },
];

const sourceShort = Object.fromEntries(sources.map(s => [s.code, s.short]));

module.exports = { sources, normalRanges, goalTemplates, sourceShort, GUYTON };
