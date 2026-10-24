// ─── Personas do stand (só para a equipe demonstrar) ─────────
// Preenchem o perfil e TODAS as perguntas do painel RAPIDO que valem para
// elas, então o teste vai direto ao resultado. Os desfechos foram
// conferidos na API real (POST /api/public/quick-test, base v0):
//   Roberto: colorretal ATENÇÃO (11,6×) e pulmão ATENÇÃO. Sem os exames e
//            a balança do cadastro, o teste rápido não chega a INVESTIGAR;
//            o INVESTIGAR dele aparece no painel da médica.
//   Helena:  mama ATENÇÃO (2,2×, mãe com câncer de mama) e preventivo
//            atrasado (colo 2,0×, ainda ROTINA). Perguntas de mama em
//            "não sei": um "não" derrubaria a ATENÇÃO (LR−).
//   Carlos:  ex-fumante, tosse há 3 semanas e sangue no catarro → pulmão
//            INVESTIGAR (~6 em 100).
// Respostas: true = sim, false = não, null = não sei. As crônicas
// (CHRONIC_QUICK do quickTestService) entram por `chronic({...})`.

// Todas as perguntas crônicas do teste rápido; o que não vier é "não"
const chronic = (over = {}) => ({
  dor_toracica_tipica: false, has_conhecida: false,
  ronco_alto: false, apneia_observada: false, fadiga_diurna: false,
  phq9_anedonia: 0, phq9_humor_deprimido: 0,
  sedentarismo: false, baixo_consumo_frutas_vegetais: false,
  circunferencia_abdominal_aumentada: false, historico_glicemia_alterada: false,
  historico_familiar_dm2: false,
  ...over,
});

export const PERSONAS = [
  {
    id: 'roberto',
    name: 'Roberto, 63',
    summary: 'Ex-fumante, intestino mudou, perdeu peso',
    profile: {
      age: 63, sex: 'male', height: 172, weight: 76,
      smoker: true, packYears: 35, quitYears: 8,
      alcoholDosesWeek: 4, familyHistoryCancer: [],
    },
    answers: {
      ...chronic({ fadiga_diurna: true, has_conhecida: true, sedentarismo: true }),
      perda_peso_inexplicada: true, sudorese_noturna: false,
      mudanca_habito_intestinal: true, sangramento_retal: false,
      tosse_persistente_3sem: false, hemoptise: false,
      sintomas_urinarios_baixos: false,
    },
  },
  {
    id: 'helena',
    name: 'Helena, 47',
    summary: 'Caso na família, preventivo atrasado',
    profile: {
      age: 47, sex: 'female', height: 165, weight: 70,
      smoker: false, alcoholDosesWeek: 2,
      familyHistoryCancer: ['mama'], papEmDia: false,
    },
    answers: {
      ...chronic({ ronco_alto: true, baixo_consumo_frutas_vegetais: true, phq9_anedonia: 1 }),
      perda_peso_inexplicada: false, mudanca_habito_intestinal: false,
      sangramento_retal: false, tosse_persistente_3sem: false, hemoptise: false,
      nodulo_mama: null, sangramento_pos_coito: null,
    },
  },
  {
    id: 'carlos',
    name: 'Carlos, 67',
    summary: 'Ex-fumante com tosse e sangue no catarro',
    profile: {
      age: 67, sex: 'male', height: 172, weight: 74,
      smoker: true, packYears: 30, quitYears: 5,
      alcoholDosesWeek: 7, familyHistoryCancer: [],
    },
    answers: {
      ...chronic({ ronco_alto: true, apneia_observada: true, fadiga_diurna: true }),
      perda_peso_inexplicada: false, mudanca_habito_intestinal: false,
      sangramento_retal: false, tosse_persistente_3sem: true, hemoptise: true,
      sintomas_urinarios_baixos: false,
    },
  },
];
