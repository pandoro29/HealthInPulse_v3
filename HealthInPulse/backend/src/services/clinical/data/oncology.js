// ─── Base oncológica: 5 cânceres (triagem de risco, NÃO diagnóstico) ──
// Dados de partida do seed para CA_COLORRETAL, CA_PULMAO, CA_MAMA,
// CA_PROSTATA e CA_COLO_UTERO. Cada número tem `sourceCode` apontando
// para `sources`; a derivação de cada um está em
// Docs/base-clinica-oncologia.md (tabela parâmetro | valor | população |
// fonte | como foi derivado | confiança A/B/C).
//
// Formato (contrato com buildFromSeed/seedKnowledge): módulo CommonJS com
//   { sources, conditions, priorRules, symptoms, conditionSymptoms,
//     labRules, screeningRules, profileFields }
// Campos com os mesmos nomes das tabelas do banco; `when`/`showIf`/
// `options`/`panels`/`aliases` são valores JS, nunca strings JSON; chaves
// estrangeiras por código (o seed gera os ids).
//
// ─── Matemática ──────────────────────────────────────────────────────
// Prior = probabilidade de diagnóstico em 2 anos ≈ 2 × incidência anual
// por idade e sexo (mesma definição dos estudos CAPER, base do NICE NG12).
// A incidência por faixa vem do GLOBOCAN 2022 (Brasil) e é calibrada para
// a taxa bruta nacional do INCA (Estimativa 2026): fator = bruta INCA /
// bruta GLOBOCAN do mesmo câncer e sexo (tabela INCIDENCE abaixo).
// Regras BASELINE (effect 'set') escolhem a faixa; RISK_FACTOR (effect
// 'multiply') multiplicam pelos riscos relativos. Sintomas, exames e a
// pulseira entram SÓ como likelihood (ConditionSymptom), nunca no prior.
// LR+ = pSx / pNoSx (pSx = sensibilidade; pNoSx = 1 − especificidade).
//
// ─── Operadores usados em `when` / `showIf` ──────────────────────────
// A lista é um E (todas as cláusulas valem). Operadores:
//   eq, gt, gte, lt, lte, in  — já existem em kb/conditions.js
//                               (gt/gte/lt/lte = false com null);
//   includes — NOVO (tarefa 5 implementa): o campo é uma LISTA
//              (multiselect) e contém `value`. Ex.:
//              { field: 'familyHistoryCancer', op: 'includes', value: 'mama' }
//              Campo ausente/não lista → false.
//
// ─── Campos do perfil usados ─────────────────────────────────────────
//   age (número) · sex ('male' | 'female') · bmi (número)
//   smoker (boolean: "fuma ou já fumou regularmente") · packYears (número)
//   quitYears (número: anos desde que parou; 0 = ainda fuma)          NOVO
//   alcoholDosesWeek (número de doses por semana)                     NOVO
//   papEmDia (boolean: preventivo/DNA-HPV dentro do intervalo)        NOVO
//   familyHistoryCancer (lista: 'colorretal' | 'mama' | 'ovario' |
//                        'prostata' | 'pulmao'), parente de 1º grau   NOVO
// smoker e papEmDia usam `in` com [true,'true',1] / [false,'false',0],
// como o showIf de packYears da v7, então a string 'false' não vira
// "sim". smoker falso = "nunca fumou"; campo ausente não aplica fator
// nenhum (fica na média da população). quitYears em branco num fumante
// deve ser lido como 0 (ainda fuma).
//
// ─── LabRule: como ler os achados (tarefa 5 implementa) ──────────────
// `aliases` casam com ExamResult.findings[].name sem acento e minúsculo.
// operator 'lt'/'gt'/'gte' compara o `value` numérico (aceitar vírgula);
// operator 'positive' vale 1 quando value ou status for positivo /
// reagente / detectado / alterado / presente, e 0 quando negativo /
// nao reagente / nao detectado / normal / ausente (só com emitNegative).
// minAge/maxAge são inclusivos. BI-RADS "4A/4B/4C" conta como 4.

// ─── Fontes ──────────────────────────────────────────────────────────
const sources = [
  // Incidência / priors
  { code: 'INCA_ESTIMATIVA_2026', year: 2026,
    citation: 'INCA. Estimativa 2026: incidência de câncer no Brasil (triênio 2026–2028). Rio de Janeiro: INCA, 2026. Tabela 1 (taxas brutas).',
    url: 'https://ninho.inca.gov.br/jspui/bitstream/123456789/17914/1/Estima2026_completo%20%281%29.pdf',
    note: 'Taxas brutas por 100 mil: mama 71,57; próstata 74,62; cólon e reto H 25,16 / M 25,07; pulmão H 17,95 / M 15,14; colo do útero 17,59. Usadas para calibrar o GLOBOCAN.' },
  { code: 'GLOBOCAN_2022_BR', year: 2024,
    citation: 'Ferlay J, et al. Global Cancer Observatory: Cancer Today (GLOBOCAN 2022), Brasil, incidência por faixa etária. IARC, 2024.',
    url: 'https://gco.iarc.who.int/today',
    note: 'Casos e população por faixa de 5 anos (API gco-api.iarc.fr/api/globocan/v3/2022). Faixas jovens têm ruído de modelagem.' },
  { code: 'NICE_NG12', year: 2025,
    citation: 'NICE. Suspected cancer: recognition and referral (NG12). 2015, atualizada em maio de 2025.',
    url: 'https://www.nice.org.uk/guidance/ng12',
    note: 'Limiar de VPP de 3% para encaminhamento por suspeita de câncer; base do limiar INVESTIGAR.' },

  // Sintomas (VPP / sensibilidade / LR)
  { code: 'HAMILTON_CCR_2005', year: 2005,
    citation: 'Hamilton W, Round A, Sharp D, Peters TJ. Clinical features of colorectal cancer before diagnosis: a population-based case–control study. Br J Cancer 2005;93:399–405.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2361578/',
    note: 'CAPER colorretal: 349 casos ≥40 anos, 1.744 controles; prior de referência 0,25%.' },
  { code: 'HAMILTON_CAPER_2009', year: 2009,
    citation: 'Hamilton W. The CAPER studies: five case–control studies aimed at identifying and quantifying the risk of cancer in symptomatic primary care patients. Br J Cancer 2009;101(Suppl 2):S80–S86.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2790706/',
    note: 'Pulmão: % de casos e LR por achado; prior de referência 0,18%.' },
  { code: 'JONES_2007', year: 2007,
    citation: 'Jones R, Latinovic R, Charlton J, Gulliford MC. Alarm symptoms in early diagnosis of cancer in primary care: cohort study using General Practice Research Database. BMJ 2007;334:1040.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC1871798/',
    note: 'Coorte de 762 mil pacientes ≥ 15 anos. Hemoptise → câncer respiratório em 3 anos (homens): LR 25,3. Só conferência: não usado no LR porque embute a idade (ver .md).' },
  { code: 'HAASTRUP_2020', year: 2020,
    citation: 'Haastrup PF, Jarbøl DE, Balasubramaniam K, et al. Predictive values of lung cancer alarm symptoms in the general population: a nationwide cohort study. NPJ Prim Care Respir Med 2020;30:15.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7138801/',
    note: 'População geral ≥40 anos (37.455 respondentes, 41 cânceres em 12 meses). Poucos casos: IC largos.' },
  { code: 'WALKER_2014', year: 2014,
    citation: 'Walker S, Hyde C, Hamilton W. Risk of breast cancer in symptomatic women in primary care: a case–control study using electronic records. Br J Gen Pract 2014;64(629):e788–93.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4240152/',
    note: '3.994 casos ≥40 anos e 16.873 controles (CPRD).' },
  { code: 'HAMILTON_PROSTATA_2006', year: 2006,
    citation: 'Hamilton W, Sharp DJ, Peters TJ, Round AP. Clinical features of prostate cancer before diagnosis: a population-based, case–control study. Br J Gen Pract 2006;56(531):756–62.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC1920715/',
    note: '217 casos e 1.080 controles; prior de referência 0,35%.' },
  { code: 'SHAPLEY_2006', year: 2006,
    citation: 'Shapley M, Jordan J, Croft PR. A systematic review of postcoital bleeding and risk of cervical cancer. Br J Gen Pract 2006;56(527):453–60.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC1839021/',
    note: 'Sangramento pós-coito em 11% dos casos de câncer do colo; incidência anual na comunidade 3,4–12,6%.' },
  { code: 'QCANCER_F_2013', year: 2013,
    citation: 'Hippisley-Cox J, Coupland C. Symptoms and risk factors to identify women with suspected cancer in primary care: derivation and validation of an algorithm. Br J Gen Pract 2013;63(606):e11–e21. DOI 10.3399/bjgp13X660733.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3529288/',
    note: 'Coorte QResearch, mulheres de 25 a 89 anos, câncer em 2 anos. Sangramento entre menstruações: risco ~7 vezes maior; pós-menopausa ~29; pós-coito ~23.' },
  { code: 'CAMPOS_RSP_2024', year: 2024,
    citation: 'Campos MR, Rodrigues JM, Marques AP, et al. Smoking, mortality, access to diagnosis, and treatment of lung cancer in Brazil. Rev Saúde Pública 2024;58:18. DOI 10.11606/s1518-8787.2024058005704.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11090611/',
    note: 'PNS 2019 (adultos): fumantes 12,7%, ex 27,1%, nunca 60,2%. RHC/INCA 2019 (câncer de pulmão, n = 9.523): fumantes 39,1%, ex 41,1%, nunca 19,8%. Fator = fração nos casos ÷ fração na população.' },
  { code: 'ZHENG_SCIREP_2018', year: 2018,
    citation: 'Zheng G, Yu H, Kanerva A, Försti A, Sundquist K, Hemminki K. Familial ovarian cancer clusters with other cancers. Sci Rep 2018;8:11561. DOI 10.1038/s41598-018-29888-4.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6070489/',
    note: 'Registro nacional sueco. Mama com 1 parente de 1º grau com câncer de ovário: RR 1,24 (1,19–1,30); 2 ou mais: RR 2,13.' },

  // Exames
  { code: 'LEE_FIT_2014', year: 2014,
    citation: 'Lee JK, Liles EG, Bent S, Levin TR, Corley DA. Accuracy of fecal immunochemical tests for colorectal cancer: systematic review and meta-analysis. Ann Intern Med 2014;160(3):171.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4189821/',
    note: 'Assintomáticos de risco médio: sensibilidade 0,79; especificidade 0,94; LR+ 13,1.' },
  { code: 'WHO_HB_2024', year: 2024,
    citation: 'WHO. Guideline on haemoglobin cutoffs to define anaemia in individuals and populations. Geneva: WHO, 2024.',
    url: 'https://www.who.int/publications/i/item/9789240088542',
    note: 'Anemia: Hb < 13,0 g/dL (homens) e < 12,0 g/dL (mulheres não gestantes), 15–65 anos.' },
  { code: 'LEHMAN_2017', year: 2017,
    citation: 'Lehman CD, Arao RF, Sprague BL, et al. National performance benchmarks for modern screening digital mammography: update from the Breast Cancer Surveillance Consortium. Radiology 2017;283(1):49–58.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5375631/',
    note: 'Mamografia de rastreamento: detecção 5,1/1.000; sensibilidade 86,9%; especificidade 88,9%; VPP2 (biópsia recomendada, BI-RADS 4–5) 25,6%.' },
  { code: 'ACR_BIRADS_2013', year: 2013,
    citation: 'D’Orsi CJ, Sickles EA, Mendelson EB, Morris EA, et al. ACR BI-RADS Atlas: Breast Imaging Reporting and Data System. 5th ed. Reston, VA: American College of Radiology, 2013.',
    url: 'https://www.acr.org/Clinical-Resources/Clinical-Tools-and-Reference/Reporting-and-Data-Systems/BI-RADS',
    note: 'Probabilidade de malignidade: BI-RADS 4 > 2% e < 95% (4A 2–10%, 4B 10–50%, 4C 50–95%); BI-RADS 5 ≥ 95%.' },
  { code: 'SPRAGUE_2017', year: 2017,
    citation: 'Sprague BL, Arao RF, Miglioretti DL, et al. National performance benchmarks for modern diagnostic digital mammography: update from the Breast Cancer Surveillance Consortium. Radiology 2017;283(1):59–69.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5375630/',
    note: 'Mamografia diagnóstica: sensibilidade 87,8%; especificidade 90,5%; VPP2 27,5%. Só conferência: o LR do BI-RADS usa o rastreamento (Lehman 2017).' },
  { code: 'THOMPSON_PCPT_2005', year: 2005,
    citation: 'Thompson IM, Ankerst DP, Chi C, et al. Operating characteristics of prostate-specific antigen in men with an initial PSA level of 3.0 ng/ml or lower. JAMA 2005;294(1):66–70.',
    url: 'https://doi.org/10.1001/jama.294.1.66',
    note: 'PCPT (biópsia em todos): PSA > 4,0 → sensibilidade 20,5%, especificidade 93,8% para qualquer câncer.' },
  { code: 'OESTERLING_1993', year: 1993,
    citation: 'Oesterling JE, Jacobsen SJ, Chute CG, et al. Serum prostate-specific antigen in a community-based population of healthy men: establishment of age-specific reference ranges. JAMA 1993;270(7):860–4.',
    url: 'https://doi.org/10.1001/jama.1993.03510070082041',
    note: 'Limite superior (p95): 40–49 = 2,5; 50–59 = 3,5; 60–69 = 4,5; 70–79 = 6,5 ng/mL.' },
  { code: 'KOLIOPOULOS_2017', year: 2017,
    citation: 'Koliopoulos G, Nyaga VN, Santesso N, et al. Cytology versus HPV testing for cervical cancer screening in the general population. Cochrane Database Syst Rev 2017;8:CD008587.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6483676/',
    note: 'Desfecho CIN2+ (não só câncer invasivo). HPV (HC2): sens 89,9% / esp 89,9%. Citologia convencional ASC-US+: sens 62,5% / esp 96,6%.' },

  // Fatores de risco
  { code: 'BUTTERWORTH_2006', year: 2006,
    citation: 'Butterworth AS, Higgins JP, Pharoah P. Relative and absolute risk of colorectal cancer for individuals with a family history: a meta-analysis. Eur J Cancer 2006;42(2):216–27.',
    url: 'https://doi.org/10.1016/j.ejca.2005.09.023',
    note: 'RR 2,24 (2,06–2,43) com ≥1 parente de 1º grau; 3,97 com ≥2.' },
  { code: 'MA_2013', year: 2013,
    citation: 'Ma Y, Yang Y, Wang F, et al. Obesity and risk of colorectal cancer: a systematic review of prospective studies. PLoS One 2013;8(1):e53916.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3547959/',
    note: 'Obeso vs normal (IMC): RR 1,334 (1,253–1,420).' },
  { code: 'FEDIRKO_2011', year: 2011,
    citation: 'Fedirko V, Tramacere I, Bagnardi V, et al. Alcohol drinking and colorectal cancer risk: an overall and dose–response meta-analysis of published studies. Ann Oncol 2011;22(9):1958–72.',
    url: 'https://doi.org/10.1093/annonc/mdq653',
    note: 'Moderado (2–3 doses/dia) RR 1,21; pesado (≥4 doses/dia) RR 1,52.' },
  { code: 'CONSENSO_PULMAO_BR_2024', year: 2024,
    citation: 'Pereira LFF, Santos RS, Bonomi DO, et al. Lung cancer screening in Brazil: recommendations from the Brazilian Society of Thoracic Surgery, Brazilian Thoracic Association, and Brazilian College of Radiology. J Bras Pneumol 2024;50(1):e20230233.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11095927/',
    note: 'Tabagismo responde por mais de 85% dos casos. Rastreio: 50–80 anos, >20 maços-ano, parou há <15 anos, TC de baixa dose.' },
  { code: 'GANDINI_2008', year: 2008,
    citation: 'Gandini S, Botteri E, Iodice S, et al. Tobacco smoking and cancer: a meta-analysis. Int J Cancer 2008;122(1):155–64.',
    url: 'https://doi.org/10.1002/ijc.23033',
    note: 'Pulmão, fumante atual vs nunca fumante: RR 8,96 (6,73–12,11).' },
  { code: 'TINDLE_2018', year: 2018,
    citation: 'Tindle HA, Stevenson Duncan M, Greevy RA, et al. Lifetime smoking history and risk of lung cancer: results from the Framingham Heart Study. J Natl Cancer Inst 2018;110(11):1201–07.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6235683/',
    note: 'Ex-fumantes pesados (>21,3 maços-ano) vs nunca: HR 12,1 (<5 anos sem fumar), 11,8 (5–9), 7,8 (10–14), 5,9 (15–24), 3,85 (≥25); 39% menor que o fumante atual nos primeiros 5 anos.' },
  { code: 'MATAKIDOU_2005', year: 2005,
    citation: 'Matakidou A, Eisen T, Houlston RS. Systematic review of the relationship between family history and lung cancer risk. Br J Cancer 2005;93(7):825–33.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2361640/',
    note: 'Qualquer parente afetado: RR 1,84; em nunca fumantes (sem confusão pelo fumo da família): RR 1,51 (1,11–2,06).' },
  { code: 'COLLAB_FAMILIAL_2001', year: 2001,
    citation: 'Collaborative Group on Hormonal Factors in Breast Cancer. Familial breast cancer: collaborative reanalysis of individual data from 52 epidemiological studies. Lancet 2001;358(9291):1389–99.',
    url: 'https://doi.org/10.1016/S0140-6736(01)06524-2',
    note: 'RR 1,80 com 1 parente de 1º grau; incidência acumulada até 50 anos 1,7% (nenhuma) vs 3,7% (uma); até 80 anos 7,8% vs 13,3%.' },
  { code: 'CLAUS_1993', year: 1993,
    citation: 'Claus EB, Risch N, Thompson WD. The calculation of breast cancer risk for women with a first degree family history of ovarian cancer. Breast Cancer Res Treat 1993;28(2):115–20.',
    url: 'https://doi.org/10.1007/BF00666424',
    note: 'Risco de mama ao longo da vida ≈13% com 1 parente de 1º grau com câncer de ovário.' },
  { code: 'HAMAJIMA_2002', year: 2002,
    citation: 'Hamajima N, et al. (Collaborative Group on Hormonal Factors in Breast Cancer). Alcohol, tobacco and breast cancer: collaborative reanalysis of individual data from 53 epidemiological studies. Br J Cancer 2002;87(11):1234–45.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2562507/',
    note: '+7,1% de risco a cada 10 g/dia de álcool; 35–44 g/dia RR 1,32; ≥45 g/dia RR 1,46.' },
  { code: 'RENEHAN_2008', year: 2008,
    citation: 'Renehan AG, Tyson M, Egger M, Heller RF, Zwahlen M. Body-mass index and incidence of cancer: a systematic review and meta-analysis of prospective observational studies. Lancet 2008;371(9612):569–78.',
    url: 'https://doi.org/10.1016/S0140-6736(08)60269-X',
    note: 'Mama pós-menopausa: RR < 1,20 a cada +5 kg/m² (1,12).' },
  { code: 'KICINSKI_2011', year: 2011,
    citation: 'Kiciński M, Vangronsveld J, Nawrot TS. An epidemiological reappraisal of the familial aggregation of prostate cancer: a meta-analysis. PLoS One 2011;6(10):e27130.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3205054/',
    note: 'Pai ou irmão: RR 2,48; < 65 anos RR 2,87; ≥ 65 anos RR 1,92.' },
  { code: 'ANDRAE_2008', year: 2008,
    citation: 'Andrae B, Kemetli L, Sparén P, et al. Screening-preventable cervical cancer risks: evidence from a nationwide audit in Sweden. J Natl Cancer Inst 2008;100(9):622–9.',
    url: 'https://doi.org/10.1093/jnci/djn099',
    note: 'Sem preventivo no intervalo recomendado: OR 2,52 (2,19–2,91) de câncer invasivo.' },
  { code: 'PNS_2019_PAP', year: 2023,
    citation: 'Exame de Papanicolaou no Brasil: análise da Pesquisa Nacional de Saúde em 2013 e 2019. Rev Saúde Pública 2023;57:55.',
    url: 'https://revistas.usp.br/rsp/article/view/216824',
    note: '81,3% das mulheres de 25–64 anos fizeram o preventivo nos últimos 3 anos (PNS 2019).' },
  { code: 'IARC_COLO_TABACO_2006', year: 2006,
    citation: 'International Collaboration of Epidemiological Studies of Cervical Cancer. Carcinoma of the cervix and tobacco smoking: collaborative reanalysis of individual data on 13,541 women with carcinoma of the cervix. Int J Cancer 2006;118(6):1481–95.',
    url: 'https://doi.org/10.1002/ijc.21493',
    note: 'Carcinoma escamoso: fumante atual RR 1,60; ex-fumante RR 1,12.' },

  // Rastreamento (diretrizes vigentes)
  { code: 'INCA_FIT_2026', year: 2026,
    citation: 'INCA. SUS inclui teste de alta tecnologia para rastreamento de câncer colorretal (FIT a cada 2 anos, 50–75 anos, assintomáticos). Notícia de 10/08/2026.',
    url: 'https://www.gov.br/inca/pt-br/assuntos/noticias/2026/sus-inclui-teste-de-alta-tecnologia-para-rastreamento-de-cancer-colorretal',
    note: 'Mudança de 2026: antes não havia rastreamento colorretal organizado no SUS.' },
  { code: 'USPSTF_CCR_2021', year: 2021,
    citation: 'US Preventive Services Task Force. Screening for colorectal cancer: recommendation statement. JAMA 2021;325(19):1965–77.',
    url: 'https://doi.org/10.1001/jama.2021.6238',
    note: 'Rastreio de 45 a 75 anos (45–49: grau B). Sociedades brasileiras (SBCP) também defendem início aos 45.' },
  { code: 'USMSTF_2017', year: 2017,
    citation: 'Rex DK, Boland CR, Dominitz JA, et al. Colorectal cancer screening: recommendations for physicians and patients from the U.S. Multi-Society Task Force on Colorectal Cancer. Gastroenterology 2017;153(1):307–23.',
    url: 'https://doi.org/10.1053/j.gastro.2017.05.013',
    note: 'Parente de 1º grau com câncer < 60 anos (ou 2 parentes): colonoscopia a cada 5 anos a partir dos 40 ou 10 anos antes do caso mais jovem.' },
  { code: 'MS_MAMA_2025', year: 2025,
    citation: 'Ministério da Saúde/INCA. Ministério da Saúde padroniza informações para acesso ao exame de mamografia no SUS (29/09/2025), sobre a nota técnica de setembro de 2025.',
    url: 'https://www.gov.br/inca/pt-br/assuntos/noticias/2025/ministerio-da-saude-padroniza-informacoes-para-acesso-ao-exame-de-mamografia-no-sus',
    note: 'Mudança de 2025: rastreio bienal passou de 50–69 para 50–74; 40–49 sob demanda, com decisão compartilhada.' },
  { code: 'CBR_SBM_FEBRASGO_2023', year: 2023,
    citation: 'Urban LABD, Chala LF, de Paula IB, et al. Recomendações do CBR, da SBM e da Febrasgo para o rastreamento do câncer de mama no Brasil. Radiol Bras 2023;56(4):207–14.',
    url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10567087/',
    note: 'Mamografia anual 40–74. Risco ≥20% na vida: mamografia e RM anuais a partir de 10 anos antes do caso mais jovem na família, não antes dos 30.' },
  { code: 'MS_COLO_HPV_2025', year: 2025,
    citation: 'Ministério da Saúde. Portaria Conjunta SAES/SECTICS nº 13, de 29/07/2025: Diretrizes brasileiras para o rastreamento do câncer do colo do útero, parte I (teste DNA-HPV oncogênico).',
    url: 'https://www.gov.br/inca/pt-br/assuntos/gestor-e-profissional-de-saude/controle-do-cancer-do-colo-do-utero/acoes/deteccao-precoce',
    note: 'Mudança de 2025: DNA-HPV vira exame primário, 25–64 anos, a cada 5 anos após resultado negativo; onde ainda não há, Papanicolau a cada 3 anos.' },
  { code: 'MS_PROSTATA_NT9_2023', year: 2023,
    citation: 'Ministério da Saúde/INCA. Nota Técnica nº 9/2023-COSAH/CGACI/DGCI/SAPS/MS: recomendação pelo não rastreamento populacional do câncer de próstata.',
    url: 'https://www.gov.br/saude/pt-br/centrais-de-conteudo/publicacoes/notas-tecnicas/2023/nota-tecnica-no-9-2023.pdf',
    note: 'Reitera a posição de 2015; homens com fatores de risco podem testar em decisão compartilhada.' },
  { code: 'SBU_PROSTATA', year: 2018,
    citation: 'Sociedade Brasileira de Urologia, posicionamento citado pelo CFM: avaliação individual a partir dos 50 anos; 45 anos para homens negros ou com parente de 1º grau; após 75 só com expectativa de vida > 10 anos.',
    url: 'https://portal.cfm.org.br/noticias/cancer-de-prostata-cfm-chama-atencao-do-homem-para-o-cuidado-com-a-saude/',
    note: 'Fonte secundária (CFM, 2018), posição repetida pela SBU nos Novembros Azuis seguintes.' },
];

// ─── Incidência por faixa (GLOBOCAN 2022 Brasil, por 100 mil/ano) ───
// [idadeMin, idadeMax exclusiva (null = sem teto), taxa]. `inca` e
// `globocan` são as taxas brutas usadas na calibração.
const INCIDENCE = {
  CA_COLORRETAL: {
    male:   { inca: 25.16, globocan: 28.53, bands: [[30, 40, 2.5], [40, 45, 10.7], [45, 50, 21.6], [50, 55, 38.3], [55, 60, 61.1], [60, 65, 88.9], [65, 70, 121.3], [70, 75, 160.2], [75, 80, 207.2], [80, null, 289.3]] },
    female: { inca: 25.07, globocan: 27.32, bands: [[30, 40, 4.9], [40, 45, 13.0], [45, 50, 22.3], [50, 55, 33.9], [55, 60, 47.8], [60, 65, 63.9], [65, 70, 83.8], [70, 75, 112.7], [75, 80, 153.4], [80, null, 236.9]] },
  },
  CA_PULMAO: {
    male:   { inca: 17.95, globocan: 23.46, bands: [[40, 45, 2.1], [45, 50, 8.3], [50, 55, 22.0], [55, 60, 45.4], [60, 65, 79.0], [65, 70, 119.2], [70, 75, 159.1], [75, 80, 197.8], [80, null, 252.3]] },
    female: { inca: 15.14, globocan: 17.71, bands: [[40, 45, 3.6], [45, 50, 10.2], [50, 55, 21.2], [55, 60, 35.6], [60, 65, 52.8], [65, 70, 70.9], [70, 75, 87.3], [75, 80, 102.5], [80, null, 123.0]] },
  },
  CA_MAMA: {
    female: { inca: 71.57, globocan: 86.41, bands: [[25, 30, 17.4], [30, 35, 36.3], [35, 40, 61.9], [40, 45, 92.3], [45, 50, 127.2], [50, 55, 161.9], [55, 60, 191.9], [60, 65, 218.4], [65, 70, 239.5], [70, 75, 256.7], [75, 80, 270.2], [80, null, 282.9]] },
  },
  CA_PROSTATA: {
    male:   { inca: 74.62, globocan: 96.96, bands: [[40, 50, 6.2], [50, 55, 81.2], [55, 60, 202.2], [60, 65, 378.7], [65, 70, 569.5], [70, 75, 718.8], [75, 80, 801.1], [80, null, 812.6]] },
  },
  CA_COLO_UTERO: {
    female: { inca: 17.59, globocan: 17.07, bands: [[25, 30, 7.0], [30, 35, 12.1], [35, 40, 16.9], [40, 45, 21.1], [45, 50, 25.1], [50, 55, 29.3], [55, 60, 33.9], [60, 65, 38.2], [65, 70, 42.2], [70, 75, 45.3], [75, 80, 47.4], [80, null, 48.5]] },
  },
};

// Probabilidade em 2 anos a partir da taxa anual por 100 mil (3 algarismos)
const twoYearProb = (ratePer100k, calibration) =>
  Number((2 * ratePer100k * calibration / 1e5).toPrecision(3));

// ─── Condições ───────────────────────────────────────────────────────
// basePrior = 2 × taxa bruta INCA 2026 (ambos os sexos), usado só quando
// nenhuma faixa casa (idade ou sexo ausentes).
const conditions = [
  { code: 'CA_COLORRETAL', label: 'Câncer colorretal (intestino)', category: 'ONCOLOGICA',
    description: 'Risco estimado de diagnóstico de câncer de cólon ou reto nos próximos 2 anos. Triagem de risco, não diagnóstico.',
    basePrior: twoYearProb(25.11, 1), maxPrior: 0.95, alertThreshold: 0.03, watchThreshold: 0.01,
    sexFilter: null, minAge: 30, sortOrder: 9, active: true, sourceCode: 'INCA_ESTIMATIVA_2026' },
  { code: 'CA_PULMAO', label: 'Câncer de pulmão', category: 'ONCOLOGICA',
    description: 'Risco estimado de diagnóstico de câncer de pulmão nos próximos 2 anos. O cigarro responde por mais de 85% dos casos.',
    basePrior: twoYearProb(16.51, 1), maxPrior: 0.95, alertThreshold: 0.03, watchThreshold: 0.01,
    sexFilter: null, minAge: 40, sortOrder: 10, active: true, sourceCode: 'INCA_ESTIMATIVA_2026' },
  { code: 'CA_MAMA', label: 'Câncer de mama', category: 'ONCOLOGICA',
    description: 'Risco estimado de diagnóstico de câncer de mama nos próximos 2 anos. Triagem de risco, não diagnóstico.',
    basePrior: twoYearProb(71.57, 1), maxPrior: 0.95, alertThreshold: 0.03, watchThreshold: 0.01,
    sexFilter: 'female', minAge: 25, sortOrder: 11, active: true, sourceCode: 'INCA_ESTIMATIVA_2026' },
  { code: 'CA_PROSTATA', label: 'Câncer de próstata', category: 'ONCOLOGICA',
    description: 'Risco estimado de diagnóstico de câncer de próstata nos próximos 2 anos. Inclui tumores de crescimento lento, que muitas vezes não precisam de tratamento.',
    basePrior: twoYearProb(74.62, 1), maxPrior: 0.95, alertThreshold: 0.03, watchThreshold: 0.01,
    sexFilter: 'male', minAge: 40, sortOrder: 12, active: true, sourceCode: 'INCA_ESTIMATIVA_2026' },
  { code: 'CA_COLO_UTERO', label: 'Câncer do colo do útero', category: 'ONCOLOGICA',
    description: 'Risco estimado de diagnóstico de câncer do colo do útero nos próximos 2 anos. É o câncer que o preventivo e o teste de HPV mais evitam.',
    basePrior: twoYearProb(17.59, 1), maxPrior: 0.95, alertThreshold: 0.03, watchThreshold: 0.01,
    sexFilter: 'female', minAge: 25, sortOrder: 13, active: true, sourceCode: 'INCA_ESTIMATIVA_2026' },
];

// ─── Regras de prior ─────────────────────────────────────────────────
const MALE   = { field: 'sex', op: 'eq', value: 'male' };
const FEMALE = { field: 'sex', op: 'eq', value: 'female' };
const AGE_GTE = (n) => ({ field: 'age', op: 'gte', value: n });
const AGE_LT  = (n) => ({ field: 'age', op: 'lt', value: n });
const FAMILY  = (v) => ({ field: 'familyHistoryCancer', op: 'includes', value: v });
// Mesma leitura do showIf de packYears na v7 (questions.js): só
// true / 'true' / 1 contam como fumante. Com 'truthy', a string 'false'
// viraria fumante.
const SMOKER       = { field: 'smoker', op: 'in', value: [true, 'true', 1] };
const NEVER_SMOKED = { field: 'smoker', op: 'in', value: [false, 'false', 0] };
const PAP_ATRASADO = { field: 'papEmDia', op: 'in', value: [false, 'false', 0] };
const PAP_EM_DIA   = { field: 'papEmDia', op: 'in', value: [true, 'true', 1] };
const range = (field, lo, hi) => [
  ...(lo != null ? [{ field, op: 'gte', value: lo }] : []),
  ...(hi != null ? [{ field, op: 'lt', value: hi }] : []),
];

const SEX_LABEL = { male: 'homem', female: 'mulher' };

// Uma regra BASELINE ('set') por faixa etária e sexo
const baselineRules = (conditionCode) => {
  const rules = [];
  for (const [sex, data] of Object.entries(INCIDENCE[conditionCode])) {
    const calibration = data.inca / data.globocan;
    for (const [lo, hi, rate] of data.bands) {
      const faixa = hi == null ? `${lo}+ anos` : `${lo}–${hi - 1} anos`;
      rules.push({
        conditionCode,
        kind: 'BASELINE',
        label: `Base ${faixa} (${SEX_LABEL[sex]})`,
        when: [{ field: 'sex', op: 'eq', value: sex }, ...range('age', lo, hi)],
        effect: 'set',
        amount: twoYearProb(rate, calibration),
        modifiable: false,
        active: true,
        sourceCode: 'GLOBOCAN_2022_BR',
      });
    }
  }
  return rules;
};

const factor = (conditionCode, label, when, amount, modifiable, sourceCode) => ({
  conditionCode, kind: 'RISK_FACTOR', label, when, effect: 'multiply', amount, modifiable, active: true, sourceCode,
});

const riskFactorRules = [
  // ── Colorretal
  factor('CA_COLORRETAL', 'Parente de 1º grau com câncer colorretal', [FAMILY('colorretal')], 2.24, false, 'BUTTERWORTH_2006'),
  factor('CA_COLORRETAL', 'Obesidade (IMC ≥ 30)', [{ field: 'bmi', op: 'gte', value: 30 }], 1.33, true, 'MA_2013'),
  factor('CA_COLORRETAL', 'Álcool: 15 a 27 doses por semana', range('alcoholDosesWeek', 15, 28), 1.21, true, 'FEDIRKO_2011'),
  factor('CA_COLORRETAL', 'Álcool: 28 doses ou mais por semana', range('alcoholDosesWeek', 28, null), 1.52, true, 'FEDIRKO_2011'),

  // ── Pulmão (fatores relativos à MÉDIA da população, que mistura
  //    fumantes e não fumantes; ver o .md). Nunca fumou → abaixo da média.
  // Fatores do fumo com dados brasileiros (RHC/INCA × PNS 2019, Campos 2024):
  // fração dos casos ÷ fração da população. A média ponderada dá 1,00.
  // As faixas de maços-ano e de anos sem fumar saíram (a de "nunca fumou"
  // usava um valor assumido); quitYears segue valendo no rastreamento.
  factor('CA_PULMAO', 'Nunca fumou', [NEVER_SMOKED], 0.33, false, 'CAMPOS_RSP_2024'),
  factor('CA_PULMAO', 'Fuma atualmente', [SMOKER, ...range('quitYears', 0, 1)], 3.08, true, 'CAMPOS_RSP_2024'),
  factor('CA_PULMAO', 'Ex-fumante', [SMOKER, ...range('quitYears', 1, null)], 1.52, true, 'CAMPOS_RSP_2024'),
  factor('CA_PULMAO', 'Parente de 1º grau com câncer de pulmão', [FAMILY('pulmao')], 1.5, false, 'MATAKIDOU_2005'),

  // ── Mama
  factor('CA_MAMA', 'Mãe, irmã ou filha com câncer de mama (você com menos de 50 anos)', [FAMILY('mama'), AGE_LT(50)], 2.2, false, 'COLLAB_FAMILIAL_2001'),
  factor('CA_MAMA', 'Mãe, irmã ou filha com câncer de mama (você com 50 anos ou mais)', [FAMILY('mama'), AGE_GTE(50)], 1.7, false, 'COLLAB_FAMILIAL_2001'),
  factor('CA_MAMA', 'Parente de 1º grau com câncer de ovário', [FAMILY('ovario')], 1.24, false, 'ZHENG_SCIREP_2018'),
  factor('CA_MAMA', 'Álcool: 8 a 14 doses por semana', range('alcoholDosesWeek', 8, 15), 1.15, true, 'HAMAJIMA_2002'),
  factor('CA_MAMA', 'Álcool: 15 doses ou mais por semana', range('alcoholDosesWeek', 15, null), 1.3, true, 'HAMAJIMA_2002'),
  factor('CA_MAMA', 'Obesidade (IMC ≥ 30) após os 50 anos', [{ field: 'bmi', op: 'gte', value: 30 }, AGE_GTE(50)], 1.15, true, 'RENEHAN_2008'),

  // ── Próstata
  factor('CA_PROSTATA', 'Pai ou irmão com câncer de próstata (você com menos de 65 anos)', [FAMILY('prostata'), AGE_LT(65)], 2.87, false, 'KICINSKI_2011'),
  factor('CA_PROSTATA', 'Pai ou irmão com câncer de próstata (você com 65 anos ou mais)', [FAMILY('prostata'), AGE_GTE(65)], 1.92, false, 'KICINSKI_2011'),

  // ── Colo do útero (relativo à média: 81% das brasileiras estão em dia)
  factor('CA_COLO_UTERO', 'Preventivo / teste de HPV atrasado', [PAP_ATRASADO], 1.96, true, 'ANDRAE_2008'),
  factor('CA_COLO_UTERO', 'Preventivo / teste de HPV em dia', [PAP_EM_DIA], 0.78, true, 'ANDRAE_2008'),
  factor('CA_COLO_UTERO', 'Fuma atualmente', [SMOKER, { field: 'quitYears', op: 'lt', value: 1 }], 1.6, true, 'IARC_COLO_TABACO_2006'),
  factor('CA_COLO_UTERO', 'Ex-fumante', [SMOKER, { field: 'quitYears', op: 'gte', value: 1 }], 1.12, true, 'IARC_COLO_TABACO_2006'),
];

// Numera por condição: primeiro as faixas (BASELINE), depois os fatores
const priorRules = (() => {
  const all = [];
  for (const c of conditions) {
    const rules = [...baselineRules(c.code), ...riskFactorRules.filter(r => r.conditionCode === c.code)];
    rules.forEach((r, i) => all.push({ ...r, sortOrder: i + 1 }));
  }
  return all;
})();

// ─── Sintomas (perguntas, exames e pulseira) ─────────────────────────
const ONCO = ['ONCOLOGIA'];
const ONCO_RAPIDO = ['ONCOLOGIA', 'RAPIDO'];

const question = (code, label, questionText, help, cost, showIf, panels, sortOrder) => ({
  code, label, kind: 'QUESTION', questionText, help, type: 'boolean', options: null,
  binaryThreshold: null, cost, scaleTag: null, redFlagProbe: false,
  showIf, followUps: [], panels, sortOrder, active: true,
});

const finding = (code, label, kind, help, sortOrder) => ({
  code, label, kind, questionText: null, help, type: 'boolean', options: null,
  binaryThreshold: null, cost: 1, scaleTag: null, redFlagProbe: false,
  showIf: null, followUps: [], panels: [], sortOrder, active: true,
});

const symptoms = [
  // ── Colorretal (30+)
  question('sangramento_retal', 'Sangue nas fezes',
    'Nos últimos meses, você notou sangue nas fezes ou no papel higiênico?',
    'Muitas vezes é hemorroida ou fissura, mas sangue nas fezes sempre merece uma avaliação.',
    2, [AGE_GTE(30)], ONCO_RAPIDO, 201),
  question('mudanca_habito_intestinal', 'Mudança no ritmo do intestino',
    'Há mais de 3 semanas o seu intestino mudou, sem motivo claro (fezes mais soltas ou indo mais vezes ao banheiro)?',
    'Mudanças passageiras por comida ou viagem não contam.',
    1, [AGE_GTE(30)], ONCO_RAPIDO, 202),
  question('dor_abdominal_persistente', 'Dor na barriga persistente',
    'Você tem tido dor na barriga que não passa, ou que volta com frequência, há mais de 3 semanas?',
    null, 1, [AGE_GTE(30)], ONCO, 203),
  // Compartilhado com a fase crônica (mesmo código de matrix.js S.PERDA_PESO):
  // a resposta vale para as duas fases e não se pergunta duas vezes.
  question('perda_peso_inexplicada', 'Perda de peso sem causa aparente',
    'Perdeu mais de 5 kg sem causa aparente nos últimos 3 meses?',
    'Sem estar fazendo dieta ou exercício para emagrecer.',
    1, null, ONCO_RAPIDO, 204),

  // ── Pulmão (40+)
  question('tosse_persistente_3sem', 'Tosse há mais de 3 semanas',
    'Está com tosse há mais de 3 semanas?',
    'Tosse que começou com um resfriado e já passou de 3 semanas também conta.',
    1, [AGE_GTE(40)], ONCO_RAPIDO, 211),
  question('hemoptise', 'Sangue ao tossir',
    'Nos últimos meses, você tossiu sangue, mesmo pouco (como raias de sangue no catarro)?',
    null, 1, [AGE_GTE(40)], ONCO_RAPIDO, 212),
  question('dispneia_persistente', 'Falta de ar nova',
    'Nas últimas semanas, você tem sentido falta de ar com mais facilidade do que antes?',
    null, 1, [AGE_GTE(40)], ONCO, 213),
  // Compartilhado com a fase crônica (matrix.js S.ROUQUIDAO)
  question('rouquidao', 'Rouquidão persistente',
    'Tem notado rouquidão persistente?',
    'Voz rouca há mais de 3 semanas, sem gripe ou uso excessivo da voz.',
    1, null, ONCO, 214),

  // ── Mama (mulher 25+)
  question('nodulo_mama', 'Caroço na mama ou axila',
    'Você percebeu algum caroço (nódulo) novo na mama ou na axila?',
    'A maioria dos nódulos não é nada grave, mas todo nódulo novo merece avaliação.',
    2, [FEMALE, AGE_GTE(25)], ONCO_RAPIDO, 221),
  question('alteracao_mamilo', 'Mudança em um mamilo',
    'Notou mudança em um dos mamilos, como ele ficar virado para dentro ou sair líquido sem apertar?',
    null, 2, [FEMALE, AGE_GTE(25)], ONCO, 222),
  question('alteracao_pele_mama', 'Mudança na pele da mama',
    'Notou mudança na pele da mama, como aspecto de casca de laranja, afundamento ou vermelhidão que não passa?',
    null, 2, [FEMALE, AGE_GTE(25)], ONCO, 223),

  // ── Próstata (homem 40+)
  question('sintomas_urinarios_baixos', 'Urinando mais vezes (inclusive à noite)',
    'Nos últimos meses, você passou a urinar mais vezes do que antes, inclusive tendo que levantar à noite para urinar?',
    'É muito comum com o aumento benigno da próstata. Se sim, vale conversar com o médico sobre o PSA.',
    2, [MALE, AGE_GTE(40)], ONCO_RAPIDO, 231),
  question('hematuria_visivel', 'Sangue na urina',
    'Nos últimos meses, você viu sangue na urina?',
    null, 1, [MALE, AGE_GTE(40)], ONCO, 232),

  // ── Colo do útero (mulher 25+)
  question('sangramento_pos_coito', 'Sangramento após relação sexual',
    'Você tem tido sangramento depois da relação sexual?',
    'Pergunta íntima: se preferir, responda no seu celular pelo QR code.',
    3, [FEMALE, AGE_GTE(25)], ONCO_RAPIDO, 241),
  question('sangramento_fora_ciclo', 'Sangramento fora da menstruação',
    'Teve sangramento vaginal fora da menstruação (entre as menstruações ou depois da menopausa)?',
    null, 2, [FEMALE, AGE_GTE(25)], ONCO, 242),

  // ── Exames (LAB): nunca viram pergunta; vêm das LabRules
  finding('fit_positivo', 'Sangue oculto nas fezes (FIT) positivo', 'LAB', 'Teste imunoquímico fecal positivo.', 251),
  finding('anemia_hb_baixa', 'Anemia (hemoglobina baixa)', 'LAB', 'Hb < 13 g/dL (homem) ou < 12 g/dL (mulher), critério OMS 2024.', 252),
  finding('birads_4_5', 'Mamografia BI-RADS 4 ou 5', 'LAB', 'Achado suspeito na mamografia, com indicação de biópsia.', 253),
  finding('psa_acima_idade', 'PSA acima do limite para a idade', 'LAB', 'Limites de Oesterling 1993: 2,5 / 3,5 / 4,5 / 6,5 ng/mL por década.', 254),
  finding('papanicolau_alterado', 'Preventivo (Papanicolau) alterado', 'LAB', 'ASC-US ou pior.', 255),
  finding('hpv_alto_risco', 'Teste de HPV de alto risco positivo', 'LAB', 'DNA-HPV oncogênico detectado.', 256),

  // ── Pulseira / balança (WEARABLE)
  finding('perda_peso_objetiva', 'Perda de peso medida (≥ 5% em até 180 dias)', 'WEARABLE',
    'Vem da balança conectada; chave própria para não acionar o red flag NEOPLASIA.', 261),
];

// ─── Likelihoods (sintoma × condição) ────────────────────────────────
// lrPos = pSx / pNoSx (2 casas), gravado para o bônus do modo alvo.
const cs = (conditionCode, symptomCode, pSx, pNoSx, sourceCode, note) => ({
  conditionCode, symptomCode, pSx, pNoSx,
  lrPos: Number((pSx / pNoSx).toFixed(2)),
  sourceCode, note,
});

const conditionSymptoms = [
  // ── Colorretal: CAPER (casos vs controles = sensibilidade vs 1−especificidade)
  cs('CA_COLORRETAL', 'sangramento_retal', 0.424, 0.042, 'HAMILTON_CCR_2005', '148/349 casos vs 73/1.744 controles; LR 10 (7,9–13); VPP 2,4% com prior 0,25%.'),
  cs('CA_COLORRETAL', 'mudanca_habito_intestinal', 0.378, 0.098, 'HAMILTON_CCR_2005', 'Proxy: "diarreia" do CAPER (132/349 vs 171/1.744); LR 3,9. Constipação sozinha tem LR 1,8.'),
  cs('CA_COLORRETAL', 'dor_abdominal_persistente', 0.424, 0.094, 'HAMILTON_CCR_2005', '148/349 vs 163/1.744; LR 4,5.'),
  cs('CA_COLORRETAL', 'perda_peso_inexplicada', 0.269, 0.053, 'HAMILTON_CCR_2005', '94/349 vs 92/1.744; LR 5,1.'),
  cs('CA_COLORRETAL', 'perda_peso_objetiva', 0.269, 0.053, 'HAMILTON_CCR_2005', 'Mesmo LR da perda de peso registrada no prontuário (CAPER); a balança torna o achado objetivo.'),
  cs('CA_COLORRETAL', 'fit_positivo', 0.79, 0.06, 'LEE_FIT_2014', 'Meta-análise em assintomáticos: sens 0,79, esp 0,94, LR+ 13,1. Em sintomáticos a especificidade é menor.'),
  cs('CA_COLORRETAL', 'anemia_hb_baixa', 0.272, 0.052, 'HAMILTON_CCR_2005', 'Hb < 13 g/dL somando as faixas do CAPER: 95/349 casos vs 90/1.744 controles; LR 5,3 (Hb < 10 sozinha: LR 9,5).'),

  // ── Pulmão
  cs('CA_PULMAO', 'hemoptise', 0.20, 0.015, 'HAMILTON_CAPER_2009', 'CAPER pulmão (controles ≥ 40 anos pareados por idade): 20% dos casos vs 1,5% dos controles; LR 13. O LR 25,3 de Jones 2007 (coorte ≥ 15 anos, 3 anos) não foi usado: mistura idade no LR e contaria a idade duas vezes.'),
  cs('CA_PULMAO', 'tosse_persistente_3sem', 0.146, 0.091, 'HAASTRUP_2020', 'População geral, tosse > 4 semanas: 6/41 casos, LR+ 1,6 → 1−esp = 0,146/1,6.'),
  cs('CA_PULMAO', 'dispneia_persistente', 0.171, 0.081, 'HAASTRUP_2020', 'Dispneia: 7/41 casos, LR+ 2,1.'),
  cs('CA_PULMAO', 'rouquidao', 0.098, 0.038, 'HAASTRUP_2020', 'Rouquidão > 4 semanas: 4/41 casos, LR+ 2,6 (IC 1,0–6,6).'),
  cs('CA_PULMAO', 'perda_peso_inexplicada', 0.27, 0.045, 'HAMILTON_CAPER_2009', 'CAPER pulmão: 27% dos casos, LR 6 → 1−esp = 0,27/6.'),
  cs('CA_PULMAO', 'perda_peso_objetiva', 0.27, 0.045, 'HAMILTON_CAPER_2009', 'Mesmo LR da perda de peso do CAPER pulmão.'),

  // ── Mama
  cs('CA_MAMA', 'nodulo_mama', 0.441, 0.008, 'WALKER_2014', '1.762/3.994 casos vs 132/16.873 controles; LR 55. VPP 4,8% (40–49) a 48% (>70).'),
  cs('CA_MAMA', 'alteracao_mamilo', 0.0203, 0.00142, 'WALKER_2014', 'Retração ou secreção: 81/3.994 casos vs 24/16.873 controles; LR 14.'),
  // alteracao_pele_mama: sem LR (Walker 2014 teve 3 casos e 0 controles).
  // Vira regra direta do NICE NG12 (directRules, abaixo).
  cs('CA_MAMA', 'birads_4_5', 0.869, 0.013, 'LEHMAN_2017', 'Rastreamento (BCSC, 1,7 milhão de exames): VPP2 25,6% sobre prior de 0,51% (detecção 5,1/1.000) → LR = odds(0,256)/odds(0,0051) ≈ 67; pSx = sensibilidade 86,9%, pNoSx = 0,869/67. Coerente com o ACR BI-RADS 2013 (categoria 4 > 2%, 5 ≥ 95%).'),

  // ── Próstata
  cs('CA_PROSTATA', 'sintomas_urinarios_baixos', 0.47, 0.071, 'HAMILTON_PROSTATA_2006', 'Polaciúria (frequência): 102/217 vs 77/1.080; LR 6,6 (noctúria sozinha: 63/217 vs 49/1.080, LR 6,4). Parte do LR vem de PSA pedido por causa do sintoma (viés de detecção).'),
  cs('CA_PROSTATA', 'hematuria_visivel', 0.152, 0.05, 'HAMILTON_PROSTATA_2006', '33/217 vs 54/1.080; LR 3,0.'),
  cs('CA_PROSTATA', 'psa_acima_idade', 0.205, 0.062, 'THOMPSON_PCPT_2005', 'PSA > 4,0 no PCPT: sens 20,5%, esp 93,8% → LR 3,3 (corte fixo; aplicado ao limite por idade).'),

  // ── Colo do útero
  cs('CA_COLO_UTERO', 'sangramento_pos_coito', 0.11, 0.05, 'SHAPLEY_2006', '11% dos casos têm sangramento pós-coito; incidência na comunidade ~5%/ano (35–54 anos) → LR 2,2.'),
  // O QCancer só publica o LR+ (~7 entre menstruações, ~29 pós-menopausa).
  // A pergunta junta os dois: fica o menor (7). pSx e pNoSx pequenos só para
  // o LR+ dar 7 com LR− ≈ 1 ("não" não muda nada, o artigo não dá a fração).
  cs('CA_COLO_UTERO', 'sangramento_fora_ciclo', 0.0007, 0.0001, 'QCANCER_F_2013', 'QCancer 2013: sangramento entre menstruações, risco ~7 vezes maior (pós-menopausa ~29). LR+ 7, LR− ≈ 1. Confiança C.'),
  cs('CA_COLO_UTERO', 'papanicolau_alterado', 0.625, 0.034, 'KOLIOPOULOS_2017', 'Citologia convencional ASC-US+: sens 62,5%, esp 96,6% para CIN2+ → LR 18,4.'),
  cs('CA_COLO_UTERO', 'hpv_alto_risco', 0.899, 0.101, 'KOLIOPOULOS_2017', 'HPV (HC2): sens 89,9%, esp 89,9% para CIN2+ → LR 8,9.'),
];

// ─── Regras de exame (ExamResult.findings → evidência) ───────────────
const HB_ALIASES  = ['hemoglobina', 'hb', 'hgb', 'hemoglobina (hb)'];
const PSA_ALIASES = ['psa', 'psa total', 'antigeno prostatico especifico', 'antigeno prostatico especifico total'];

const lab = (code, label, aliases, operator, threshold, unit, sexFilter, minAge, maxAge, symptomCode, maxAgeDays, sortOrder, sourceCode) => ({
  code, label, aliases, operator, threshold, unit, sexFilter, minAge, maxAge, symptomCode,
  weight: 1, emitNegative: true, maxAgeDays, sortOrder, active: true, sourceCode,
});

const labRules = [
  lab('FIT_POSITIVO', 'Sangue oculto nas fezes (FIT) positivo',
    ['sangue oculto', 'sangue oculto nas fezes', 'pesquisa de sangue oculto', 'pesquisa de sangue oculto nas fezes', 'psof', 'fit', 'teste imunoquimico fecal', 'imunoquimico fecal'],
    'positive', null, null, null, null, null, 'fit_positivo', 365, 1, 'LEE_FIT_2014'),
  lab('HB_BAIXA_HOMEM', 'Hemoglobina < 13 g/dL (homem)', HB_ALIASES, 'lt', 13, 'g/dL', 'male', null, null, 'anemia_hb_baixa', 180, 2, 'WHO_HB_2024'),
  lab('HB_BAIXA_MULHER', 'Hemoglobina < 12 g/dL (mulher)', HB_ALIASES, 'lt', 12, 'g/dL', 'female', null, null, 'anemia_hb_baixa', 180, 3, 'WHO_HB_2024'),
  lab('BIRADS_4_5', 'Mamografia BI-RADS 4 ou 5',
    ['bi-rads', 'birads', 'bi rads', 'categoria bi-rads', 'mamografia bi-rads', 'mamografia'],
    'gte', 4, null, 'female', null, null, 'birads_4_5', 365, 4, 'ACR_BIRADS_2013'),
  lab('PSA_40_49', 'PSA > 2,5 ng/mL (40–49 anos)', PSA_ALIASES, 'gt', 2.5, 'ng/mL', 'male', 40, 49, 'psa_acima_idade', 365, 5, 'OESTERLING_1993'),
  lab('PSA_50_59', 'PSA > 3,5 ng/mL (50–59 anos)', PSA_ALIASES, 'gt', 3.5, 'ng/mL', 'male', 50, 59, 'psa_acima_idade', 365, 6, 'OESTERLING_1993'),
  lab('PSA_60_69', 'PSA > 4,5 ng/mL (60–69 anos)', PSA_ALIASES, 'gt', 4.5, 'ng/mL', 'male', 60, 69, 'psa_acima_idade', 365, 7, 'OESTERLING_1993'),
  lab('PSA_70_MAIS', 'PSA > 6,5 ng/mL (70 anos ou mais)', PSA_ALIASES, 'gt', 6.5, 'ng/mL', 'male', 70, null, 'psa_acima_idade', 365, 8, 'OESTERLING_1993'),
  lab('PAPANICOLAU_ALTERADO', 'Preventivo (Papanicolau) alterado',
    ['papanicolau', 'preventivo', 'exame preventivo', 'citologia oncotica', 'citopatologico', 'colpocitologia', 'citologia cervical'],
    'positive', null, null, 'female', null, null, 'papanicolau_alterado', 1095, 9, 'KOLIOPOULOS_2017'),
  lab('HPV_ALTO_RISCO', 'DNA-HPV de alto risco detectado',
    ['hpv', 'dna-hpv', 'dna hpv', 'teste de hpv', 'hpv alto risco', 'hpv de alto risco', 'hpv oncogenico'],
    'positive', null, null, 'female', null, null, 'hpv_alto_risco', 1825, 10, 'KOLIOPOULOS_2017'),
];

// ─── Rastreamento (diretrizes brasileiras vigentes em out/2026) ──────
// O motor (tarefa 5) escolhe, por condição, a regra de maior prioridade
// (menor `priority`) que se aplica; fora da faixa → FUTURO com minAge.
const screen = (conditionCode, priority, kind, exam, sexFilter, minAge, maxAge, when, intervalMonths, recommendation, sourceCode) => ({
  conditionCode, exam, kind, sexFilter, minAge, maxAge, when, intervalMonths, recommendation, priority, active: true, sourceCode,
});

const screeningRules = [
  // ── Colorretal
  screen('CA_COLORRETAL', 1, 'ALTO_RISCO', 'Colonoscopia', null, 40, 75, [FAMILY('colorretal')], 60,
    'Se o seu parente de 1º grau teve câncer colorretal antes dos 60 anos, ou se dois ou mais parentes de 1º grau tiveram, a colonoscopia costuma começar aos 40 anos (ou 10 anos antes da idade do diagnóstico do parente mais jovem) e se repetir a cada 5 anos. Em outros casos de família, converse com o médico sobre quando começar.',
    'USMSTF_2017'),
  screen('CA_COLORRETAL', 2, 'POPULACIONAL', 'Teste de sangue oculto nas fezes (FIT)', null, 50, 75, [], 24,
    'De 50 a 75 anos, sem sintomas: teste imunoquímico de sangue oculto nas fezes (FIT) a cada 2 anos, no SUS desde 2026. Se der positivo, o próximo passo é a colonoscopia.',
    'INCA_FIT_2026'),
  screen('CA_COLORRETAL', 3, 'DECISAO_COMPARTILHADA', 'FIT ou colonoscopia', null, 45, 49, [], 24,
    'Dos 45 aos 49 anos, sociedades médicas já recomendam começar o rastreamento; no SUS o programa começa aos 50. Vale conversar com seu médico.',
    'USPSTF_CCR_2021'),

  // ── Pulmão
  screen('CA_PULMAO', 1, 'ALTO_RISCO', 'Tomografia de tórax de baixa dose', null, 50, 80,
    [SMOKER, { field: 'packYears', op: 'gte', value: 20 }, { field: 'quitYears', op: 'lt', value: 15 }], 12,
    'Fumantes ou ex-fumantes (parou há menos de 15 anos) com 20 maços-ano ou mais, de 50 a 80 anos: tomografia de baixa dose anual, segundo o consenso das sociedades brasileiras (2024). Ainda não é programa do SUS; converse com seu médico. Parar de fumar é a medida que mais reduz o risco.',
    'CONSENSO_PULMAO_BR_2024'),

  // ── Mama
  screen('CA_MAMA', 1, 'ALTO_RISCO', 'Mamografia (e ressonância, se risco alto)', 'female', 30, 74, [FAMILY('mama')], 12,
    'Com mãe, irmã ou filha com câncer de mama, o rastreamento pode começar mais cedo: mamografia anual a partir de 10 anos antes da idade do diagnóstico da parente (não antes dos 30), com ressonância se o risco calculado for alto. Converse com seu médico.',
    'CBR_SBM_FEBRASGO_2023'),
  screen('CA_MAMA', 2, 'ALTO_RISCO', 'Avaliação de risco genético', 'female', 25, null, [FAMILY('ovario')], null,
    'Câncer de ovário na família pode indicar alteração genética (BRCA). Vale conversar com o médico sobre aconselhamento genético.',
    'CBR_SBM_FEBRASGO_2023'),
  screen('CA_MAMA', 3, 'POPULACIONAL', 'Mamografia', 'female', 50, 74, [], 24,
    'De 50 a 74 anos: mamografia a cada 2 anos no SUS (faixa ampliada em 2025).',
    'MS_MAMA_2025'),
  screen('CA_MAMA', 4, 'DECISAO_COMPARTILHADA', 'Mamografia', 'female', 40, 49, [], 12,
    'De 40 a 49 anos: o SUS garante a mamografia sob demanda desde 2025, depois de conversar com o profissional sobre benefícios e desvantagens. As sociedades médicas recomendam fazer todo ano.',
    'MS_MAMA_2025'),

  // ── Próstata
  screen('CA_PROSTATA', 1, 'DECISAO_COMPARTILHADA', 'PSA (e toque retal)', 'male', 45, 75, [FAMILY('prostata')], 12,
    'Com pai ou irmão com câncer de próstata, a Sociedade Brasileira de Urologia sugere conversar com o médico sobre o PSA a partir dos 45 anos. Se você urina mais vezes do que antes, converse com o médico sobre o PSA mesmo antes disso. A decisão é sua junto com o médico.',
    'SBU_PROSTATA'),
  screen('CA_PROSTATA', 2, 'DECISAO_COMPARTILHADA', 'PSA (e toque retal)', 'male', 50, 75, [], 12,
    'O Ministério da Saúde e o INCA não recomendam o PSA para todos os homens sem sintomas, porque ele também acha tumores que nunca causariam problema. A SBU sugere uma conversa individual a partir dos 50 anos. Se você passou a urinar mais vezes (inclusive à noite), converse com o médico sobre o PSA.',
    'MS_PROSTATA_NT9_2023'),

  // ── Colo do útero
  screen('CA_COLO_UTERO', 1, 'POPULACIONAL', 'Teste de DNA-HPV (ou preventivo)', 'female', 25, 64, [PAP_ATRASADO], 60,
    'Seu exame está atrasado. Procure a unidade de saúde: o teste de DNA-HPV (ou o preventivo, onde o teste ainda não chegou) é gratuito no SUS.',
    'MS_COLO_HPV_2025'),
  screen('CA_COLO_UTERO', 2, 'POPULACIONAL', 'Teste de DNA-HPV (ou preventivo)', 'female', 25, 64, [], 60,
    'De 25 a 64 anos: teste de DNA-HPV a cada 5 anos se der negativo (diretriz de 2025). Onde o teste ainda não chegou, preventivo (Papanicolau) a cada 3 anos.',
    'MS_COLO_HPV_2025'),
];

// ─── Campos novos do perfil (tarefa 5 liga ao formulário) ────────────
const profileFields = [
  { id: 'familyHistoryCancer', field: 'familyHistoryCancer', type: 'multiselect',
    label: 'Algum parente de 1º grau (pai, mãe, irmãos ou filhos) já teve câncer?',
    help: 'Marque todos que se aplicam. Se nenhum, deixe em branco.',
    options: [
      { value: 'colorretal', label: 'Intestino (colorretal)' },
      { value: 'mama',       label: 'Mama' },
      { value: 'ovario',     label: 'Ovário' },
      { value: 'prostata',   label: 'Próstata' },
      { value: 'pulmao',     label: 'Pulmão' },
    ],
    showIf: null },
  { id: 'quitYears', field: 'quitYears', type: 'number',
    label: 'Há quantos anos você parou de fumar?',
    help: 'Responda 0 se ainda fuma.',
    options: null, min: 0, max: 80, step: 1, default: 0,
    showIf: [SMOKER] },
  { id: 'alcoholDosesWeek', field: 'alcoholDosesWeek', type: 'number',
    label: 'Quantas doses de bebida alcoólica você toma por semana, em média?',
    help: '1 dose = 1 lata de cerveja, 1 taça de vinho ou 1 dose de destilado.',
    options: null, min: 0, max: 100, step: 1,
    showIf: null },
  { id: 'papEmDia', field: 'papEmDia', type: 'boolean',
    label: 'Seu preventivo (Papanicolau) ou teste de HPV está em dia?',
    help: 'Em dia = preventivo nos últimos 3 anos ou teste de HPV negativo nos últimos 5 anos.',
    options: null,
    showIf: [FEMALE, AGE_GTE(25)] },
];

// ─── Regras diretas (sem número) ─────────────────────────────────────
// Achado que leva a um nível mínimo sem LR, por recomendação de diretriz.
// O riskEngine sobe o câncer para `level` se a resposta for "sim".
const directRules = [
  { conditionCode: 'CA_MAMA', symptomCode: 'alteracao_pele_mama', level: 'ATENÇÃO', sourceCode: 'NICE_NG12',
    label: 'Alteração na pele da mama (NICE NG12: considerar encaminhamento por suspeita)' },
];

module.exports = {
  directRules,
  sources,
  conditions,
  priorRules,
  symptoms,
  conditionSymptoms,
  labRules,
  screeningRules,
  profileFields,
  INCIDENCE,
};
