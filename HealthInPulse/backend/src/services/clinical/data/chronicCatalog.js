// ─── Catálogo complementar das condições crônicas ──────────────────
// O que a matriz v7 (matrix.js) e o banco de perguntas (questions.js)
// não tinham e a base de conhecimento precisa: a fonte dos números e um
// rótulo legível para cada sintoma (a tela "Base da IA" mostra o rótulo,
// não o código).

const sources = [
  {
    code: 'HIP_MATRIZ_V7',
    citation: 'HealthInPulse: matriz clínica v7 (Documentação de triagem, Fase 1). '
      + 'Prevalências e sensibilidade/especificidade compiladas pela equipe a partir da literatura.',
    url: null,
    year: null,
    note: 'FORA DE USO desde 22/10/2026 (regra R1): estes números não têm fonte publicada e não decidem mais nada. '
      + 'A fase crônica da triagem usa escores validados com cortes oficiais (STOP-Bang, FINDRISC, PHQ-9; '
      + 'services/clinical/chronicScores.js). Ficam no banco só como histórico da v7 (golden test).',
  },
];

// Achados que a v7 conhece mas nunca pergunta (vêm de exame, pulseira
// ou follow-up). Ficam na base porque a matriz tem likelihood para eles.
const symptomLabels = {
  // AOS / sono
  ronco_alto:                          'Ronco alto',
  apneia_observada:                    'Apneia observada durante o sono',
  fadiga_diurna:                       'Cansaço ou sonolência diurna',
  cefaleia_matinal:                    'Dor de cabeça ao acordar',
  has_conhecida:                       'Hipertensão diagnosticada',
  imc_obesidade:                       'Obesidade (IMC ≥ 30)',
  imc_sobrepeso:                       'Sobrepeso (IMC ≥ 25)',
  idade_50_mais:                       'Idade ≥ 50 anos',
  idade_55h_65m:                       'Idade ≥ 55 (homem) ou ≥ 65 (mulher)',
  idade_65_mais:                       'Idade ≥ 65 anos',
  sexo_masculino:                      'Sexo masculino',
  circunferencia_cervical_aumentada:   'Pescoço largo (> 40 cm H / > 35 cm M)',
  palpitacoes_noturnas:                'Palpitações durante o sono',

  // Cardiovascular
  tabagismo_ativo:                     'Tabagismo ativo',
  diabetes_diagnosticado:              'Diabetes diagnosticado',
  colesterol_alto_relato:              'Colesterol alto (relato)',
  historico_familiar_cv:               'Infarto/AVC precoce na família',
  dor_toracica_tipica:                 'Dor no peito aos esforços',
  dispneia_esforco:                    'Falta de ar aos esforços',
  palpitacoes:                         'Palpitações',
  edema_mmii:                          'Inchaço nas pernas',
  sincope:                             'Desmaio (síncope)',

  // Diabetes
  circunferencia_abdominal_aumentada:  'Cintura aumentada',
  sedentarismo:                        'Sedentarismo (< 30 min/dia)',
  baixo_consumo_frutas_vegetais:       'Pouca fruta e verdura',
  uso_anti_hipertensivo:               'Usa remédio para pressão',
  historico_glicemia_alterada:         'Glicemia alterada em exame anterior',
  historico_familiar_dm2:              'Diabetes na família',
  poliuria:                            'Urina em excesso (poliúria)',
  polidipsia:                          'Sede excessiva (polidipsia)',
  polifagia:                           'Fome excessiva (polifagia)',
  perda_peso_inexplicada:              'Perda de peso sem causa aparente',
  visao_turva:                         'Visão turva',
  feridas_cicatrizacao_lenta:          'Feridas que demoram a cicatrizar',

  // Hipotireoidismo
  ganho_peso_inexplicado:              'Ganho de peso sem causa aparente',
  intolerancia_frio:                   'Intolerância ao frio',
  constipacao:                         'Intestino preso',
  pele_seca:                           'Pele seca',
  queda_cabelo:                        'Queda de cabelo',
  bradicardia:                         'Frequência cardíaca baixa (bradicardia)',
  fraqueza_muscular_proximal:          'Fraqueza muscular proximal',
  humor_deprimido:                     'Humor deprimido',
  irregularidade_menstrual:            'Irregularidade menstrual',
  perda_terco_lateral_sobrancelha:     'Perda do terço lateral da sobrancelha',
  reflexos_lentos:                     'Reflexos lentos',
  rouquidao:                           'Rouquidão persistente',
  edema_periorbitario:                 'Inchaço ao redor dos olhos',
  mudanca_7_sintomas_ano:              'Mudança em ≥ 7 sintomas no último ano',

  // Síndrome metabólica
  acanthosis_nigricans:                'Manchas escuras no pescoço/axilas (acantose)',
  historico_familiar_sindmet:          'Síndrome metabólica na família',
  has_e_dm_combinados:                 'Hipertensão e diabetes juntos',

  // Depressão (PHQ-9)
  phq9_humor_deprimido:                'PHQ-9: humor deprimido',
  phq9_anedonia:                       'PHQ-9: perda de interesse ou prazer',
  phq9_alt_sono:                       'PHQ-9: alteração do sono',
  phq9_fadiga:                         'PHQ-9: cansaço ou pouca energia',
  phq9_alt_apetite:                    'PHQ-9: alteração do apetite',
  phq9_culpa_desvalia:                 'PHQ-9: culpa ou sentimento de fracasso',
  phq9_concentracao:                   'PHQ-9: dificuldade de concentração',
  phq9_agitacao_lentidao:              'PHQ-9: lentidão ou agitação',
  phq9_ideacao_morte:                  'PHQ-9: pensamentos de morte',

  // Arritmias
  palpitacoes_paroxisticas:            'Palpitações que começam e param de repente',
  dispneia_subita_sem_esforco:         'Falta de ar súbita sem esforço',
  tontura_recorrente:                  'Tontura recorrente',
  dor_toracica_atipica:                'Dor no peito atípica',
  historico_icc_ou_cardiopatia:        'Insuficiência cardíaca ou cardiopatia conhecida',

  // DPOC
  tosse_cronica:                       'Tosse crônica',
  expectoracao_cronica:                'Catarro crônico',
  dispneia_repouso:                    'Falta de ar em repouso',
  sibilancia:                          'Chiado no peito',
  uso_broncodilatador:                 'Usa bombinha (broncodilatador)',
  infeccoes_respiratorias_frequentes:  'Infecções respiratórias frequentes',
  torax_em_barril:                     'Tórax em barril',
  tabagismo_acima_10_macos_ano:        'Carga tabágica > 10 maços-ano',

  // Sondas de red flag (perguntadas só na suspeita)
  deficit_neurologico_subito:          'Fraqueza/dormência súbita ou dificuldade para falar',
  cefaleia_pior_da_vida:               'Pior dor de cabeça da vida, de início súbito',
};

// Sintomas sem pergunta própria que a pulseira injeta (wearableEvidence.js)
const wearableSymptoms = ['palpitacoes_paroxisticas'];

module.exports = { sources, symptomLabels, wearableSymptoms };
