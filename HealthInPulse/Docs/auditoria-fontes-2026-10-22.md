# Fontes propostas para o motor e a IA (regra R1)

Pesquisa de 22/10/2026. Aplicada no código no mesmo dia, com a fase crônica trocada por
escores validados (veja "Como ficou" na Parte 6 de
`Docs/superpowers/specs/2026-10-22-correcoes-do-grupo-e-base-com-fonte-design.md`).
Da seção (e), só entrou a regra de o GPT comparar com a faixa impressa no próprio laudo
(sem faixa no laudo, sem status). As faixas próprias com fonte e o IMC de quem tem 60
anos ou mais ficaram para depois.
Seções na ordem da prioridade: (a) faixas e metas do paciente, (b) alarmes,
(c) oncologia, (d) 8 crônicas, (e) faixas de exame.

**Como ler cada linha.** `arquivo:linha` é o estado do código lido em 22/10 por volta
das 16h30. O builder está mexendo em paralelo: se a linha tiver andado, procure pelo
código do item (ex.: `PA_NORMAL`). Confiança: **A** = diretriz/base oficial ou estudo
grande e direto, número conferido no documento; **B** = fonte do mesmo nível, mas com
adaptação (outra população, outro aparelho, número visto só em índice/resumo, página a
conferir); **C** = estudo pequeno ou derivação indireta (mostrar à médica como
"confiança baixa"). Ação: **MANTER**, **TROCAR VALOR** (ou fonte/texto), **REMOVER**.

---

## (a) Faixas normais e metas do paciente

> **Estado em 22/10, ~17h30 (conferido no código):** o builder já aplicou quase tudo desta
> seção em `prevention.js` e `Reference.jsx`: SBC 2025, PA normal 119/79, gatilho 130 e/ou
> 80, texto da meta de PA, SpO₂ sem máximo, URL do PCDT, meta de fumo pelas 4 sessões,
> citação completa do álcool com o INCA, Guia do MS na nota da atividade física,
> temperatura sem faixa nem febre, movimento sem regra. **Faltam só:** (1) IMC de quem tem
> 60 anos ou mais (`IMC_NORMAL` não olha a idade); (2) a meta de PA acompanha só a
> sistólica. As linhas da tabela abaixo são do estado anterior a essas mudanças.

O builder já criou `backend/src/services/clinical/data/prevention.js` com faixas e
modelos de meta. As linhas abaixo apontam para esse arquivo, salvo indicação. As metas
antigas de `goalService.js` (2 L de água, 7000 passos, PA < 130 / < 125, glicemia
< 130 / < 110, sono 7–9 h, "nova triagem em 7 dias") já saíram do código; a pesquisa
confirma a saída de todas, com as ressalvas de sono e passos abaixo.

### Achado principal da seção

**Existe a Diretriz Brasileira de Hipertensão Arterial – 2025** (SBC/SBH/SBN, Arq Bras
Cardiol, set/2025). Ela substitui a de 2020, que é a que está no código. Mudou a
classificação: "PA ótima" sumiu, **PA normal passou a ser < 120 e < 80 mmHg**, e
**pré-hipertensão é 120–139 e/ou 80–89**. A faixa normal do código (< 130/85) está
desatualizada. Conferi no PDF oficial (Quadro 3.2, p. 36).

### Tabela

| arquivo:linha atual | valor atual | fonte proposta | citação completa | URL | ano | valor proposto | trecho / derivação | conf. | ação |
|---|---|---|---|---|---|---|---|---|---|
| prevention.js:77-79 (`FC_REPOUSO`) | 60–100 bpm | GUYTON_HALL_FISIOLOGIA | Hall JE, Hall ME. Guyton & Hall: Tratado de Fisiologia Médica. Edição a conferir. Valores extraídos por IA a partir do PDF | (livro; sem URL) | a conferir | 60–100 bpm (igual) | Docx do grupo: "Nas páginas 474-475, o livro define taquicardia como acima de 100 batimentos/min no adulto e bradicardia como menos de 60" (página do PDF). Ficha em `Docs/base-clinica-fisiologia.md` | B (página impressa e edição a conferir) | MANTER |
| prevention.js:81-82 (`SPO2`) | min 95, **max 99** | GUYTON_HALL_FISIOLOGIA | idem | — | a conferir | **min 95, sem máximo** | Docx: "página 3135 traz tabela de gases sanguíneos com Sat O2 arterial 98% e faixa 95%-99%". A faixa vem de gasometria arterial. No oxímetro de pulso, 100% é leitura comum e normal: com `max: 99`, quem marca 100% aparece "fora da faixa normal". O limite superior não tem uso clínico aqui | B | TROCAR VALOR (tirar o `max`) |
| prevention.js:27-36 (fonte `SBC_HAS_2020`) | Diretriz 2020; "faixa normal adotada: abaixo de 130/85" | **SBC_HAS_2025** | Brandão AA, Rodrigues CIS, Bortolotto LA, Nadruz W, et al. Diretriz Brasileira de Hipertensão Arterial – 2025. Arq Bras Cardiol. 2025;122(9):e20250624. DOI 10.36660/abc.20250624. Realização SBC, SBH e SBN | https://abccardiol.org/article/diretriz-brasileira-de-hipertensao-arterial-2025/ | 2025 | trocar a fonte inteira pela de 2025 | Quadro 3.2 (p. 36), "Classificação da pressão arterial de acordo com a medida no consultório a partir de 18 anos": "PA normal < 120 e < 80 · Pré-hipertensão 120-139 e/ou 80-89 · HA Estágio 1 140-159 e/ou 90-99 · Estágio 2 160-179 e/ou 100-109 · Estágio 3 ≥ 180 e/ou ≥ 110" | A | TROCAR (fonte) |
| prevention.js:85-86 (`PA_SISTOLICA`) | max 129 | SBC_HAS_2025 | idem | idem | 2025 | **max 119** | "PA normal < 120" (Quadro 3.2, p. 36) | A | TROCAR VALOR |
| prevention.js:89-90 (`PA_DIASTOLICA`) | max 84 | SBC_HAS_2025 | idem | idem | 2025 | **max 79** | "PA normal ... < 80" (Quadro 3.2, p. 36) | A | TROCAR VALOR |
| prevention.js:164-175 (`PA_NORMAL`, gatilho) | dispara com sistólica ≥ 130 **ou diastólica ≥ 85** | SBC_HAS_2025 | idem | idem | 2025 | dispara com **≥ 130 e/ou ≥ 80** | Quadro 3.4 (p. 37), definição de HA fora do consultório: "MRPA ≥ 130 e/ou ≥ 80" (MAPA 24 h idem). É o limiar mais próximo de medida em casa. Ressalva da própria diretriz (§15.2, p. 129): "muitos dispositivos sem manguito ainda não possuem validação suficiente para uso clínico". Por isso o gatilho deve levar a "Agendar consulta para confirmar", não a um rótulo | B (pulseira não é MRPA validada) | TROCAR VALOR |
| prevention.js:170-172 (`PA_NORMAL`, meta) | título "Pressão abaixo de 130/85 mmHg", descrição "Faixa normal da pressão no adulto", alvo sistólica ≤ 129 | SBC_HAS_2025 | idem | idem | 2025 | título "Pressão abaixo de 130/80 mmHg"; descrição **sem** "faixa normal" (a normal é < 120/80), ex.: "Meta de pressão recomendada pela diretriz brasileira"; alvo sistólica ≤ 129 **e** diastólica ≤ 79 | "Recomendações para metas terapêuticas" (p. 26): "Recomenda-se a meta de PA < 130/80 mmHg para pacientes com PA 130-139/80-89 mmHg e risco CV alto" e "Recomenda-se a meta de PA < 130/80 mmHg para os pacientes com HA independentemente de o risco CV ser baixo, moderado ou alto" (ambas FORTE). O `metric` atual só acompanha a sistólica: a diastólica fica sem meta | A | TROCAR VALOR e texto |
| prevention.js:119-128 (`ATIVIDADE_150`) e 38-44 (fonte) | 150 min/semana, todo adulto | OMS_ATIVIDADE_2020 **+ MS_GUIA_AF_2021** (Brasil primeiro) | WHO. WHO guidelines on physical activity and sedentary behaviour. Geneva: WHO; 2020. ISBN 9789240015128 · Brasil. Ministério da Saúde. Guia de Atividade Física para a População Brasileira. Brasília: MS; 2021; capítulo de adultos descrito em Ritti-Dias RM et al. Rev Bras Ativ Fís Saúde 2021;26:e0215, DOI 10.12820/rbafs.26e0215; idosos em Coelho-Ravagnani CF et al. RBAFS 2021;26:e0216, DOI 10.12820/rbafs.26e0216 | https://www.who.int/publications/i/item/9789240015128 · https://bvsms.saude.gov.br/bvs/publicacoes/guia_atividade_fisica_populacao_brasileira.pdf (fora do ar em 22/10, erro 503) · https://rbafs.org.br/RBAFS/article/download/14557/11173/57775 | 2020 / 2021 | 150 min/semana de atividade moderada (ou 75 vigorosa) | Ritti-Dias 2021 (resumo): "recomenda-se que os adultos acumulem entre 150 e 300 minutos de AF por semana com intensidade moderada e/ou entre 75 e 150 minutos por semana de intensidade vigorosa" (18–59 anos). Idosos (Coelho-Ravagnani 2021): "recomenda um mínimo de 150 minutos por semana de AF de intensidade moderada, ou 75 minutos de intensidade vigorosa". Observação: a Parte 5 diz "sedentário vira 150 min"; hoje `when: () => true` cria para todos. As duas leituras têm fonte (a recomendação vale para todo adulto), é decisão de produto | A | MANTER (acrescentar a fonte do MS) |
| prevention.js:139-153 (`IMC_NORMAL`) e 46-53 (fonte) | IMC normal 18,5–24,9; meta = peso de IMC 24,9 | OMS_IMC_2000 | WHO. Obesity: preventing and managing the global epidemic. Report of a WHO consultation. WHO Technical Report Series 894. Geneva: WHO; 2000 | https://iris.who.int/handle/10665/42330 (abre, conferido) · confirmação atual: https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight | 2000 | 18,5–24,9 (igual) | Ficha da OMS (07/10/2026): "overweight is a BMI greater than or equal to 25"; "obesity is a BMI greater than or equal to 30" | A | MANTER |
| prevention.js:142 (`IMC_NORMAL`, pessoa ≥ 60 anos) | mesma faixa 18,5–24,9 | MS_SISVAN_IDOSO (a conferir) | Brasil. Ministério da Saúde. Orientações para a coleta e análise de dados antropométricos em serviços de saúde: Norma Técnica do SISVAN. Brasília: MS; 2011 (classificação de Lipschitz, 1994) | não localizei o PDF oficial; confirmação só em estudo que usa a norma | 2011 | ≥ 60 anos: eutrofia **> 22 e < 27** | Estudo com dados do SISVAN: "IMC abaixo de 22 kg/m² representa baixo peso, acima de 22 até 27 kg/m² representa eutrofia, e 27 ou mais indica sobrepeso". Hoje um idoso com IMC 26 ganha meta de emagrecer, o que a norma do MS não indica | B (só fonte secundária) | TROCAR VALOR para ≥ 60 anos, depois de conferir a norma; se não conferir, não gerar meta de IMC acima de 60 anos |
| prevention.js:54-61 (fonte `MS_PCDT_TABAGISMO_2020`) | URL `.../midias/protocolos/20210113_pcdt_tabagismo.pdf` | MS_PCDT_TABAGISMO_2020 | Brasil. Ministério da Saúde. Portaria Conjunta SAES/SCTIE nº 10, de 16 de abril de 2020. Aprova o Protocolo Clínico e Diretrizes Terapêuticas do Tabagismo | **https://www.gov.br/conitec/pt-br/midias/protocolos/pcdt_tabagismo.pdf** (a URL do código dá 404; conferido) | 2020 | trocar a URL | — | A | TROCAR (URL) |
| prevention.js:109-118 (`PARAR_DE_FUMAR`) | meta "Marque cada semana sem cigarro", alvo **4** | MS_PCDT_TABAGISMO_2020 | idem | idem | 2020 | ou (1) ação única "Parar de fumar" (desfecho do PCDT), ou (2) "Participar das 4 sessões iniciais do tratamento no SUS", alvo 4 | PCDT (p. ~17 do PDF): "O desfecho esperado é a cessação total do tabagismo"; "Quatro sessões iniciais, preferencialmente semanais, são programadas"; abordagem breve "É indicada para todos os fumantes". "4 semanas sem cigarro" não aparece no PCDT: o 4 só tem fonte se for o das sessões | A | TROCAR VALOR/texto |
| prevention.js:62-69 e 129-138 (`REDUZIR_ALCOOL`) | "quanto menos, melhor", alvo 0 doses; citação "Lancet Public Health 2023 / WHO news" | OMS_ALCOOL_2023 **+ INCA_ALCOOL_2024** | Anderson BO, Berdzuli N, Ilbawi A, Kestel D, Kluge HP, Krech R, et al. Health and cancer risks associated with low levels of alcohol consumption. Lancet Public Health. 2023;8(1):e6–e7. DOI 10.1016/S2468-2667(22)00317-6 · Instituto Nacional de Câncer (INCA). Posicionamento do Instituto Nacional de Câncer acerca das Bebidas Alcoólicas. Rio de Janeiro: INCA; 2024 | https://www.who.int/europe/news/item/04-01-2023-no-level-of-alcohol-consumption-is-safe-for-our-health · https://ninho.inca.gov.br/jspui/bitstream/123456789/15987/1/posicionamento_do_inca_acerca_das_bebidas_alcoolicas.pdf | 2023 / 2024 | igual (sem limite numérico) | OMS: "there is no safe amount that does not affect health". INCA: "qualquer tipo de bebida alcoólica ... aumenta o risco de câncer (IARC, 2012). Além disso, alerta que não há limite seguro para o consumo da substância". **Não existe limite oficial de doses** (OMS e INCA dizem o contrário de um limite), então a meta certa é a atual, sem número | A | MANTER (completar a citação e acrescentar o INCA) |
| prevention.js:10-12 (glicemia fora do paciente) | glicemia fora das metas, porque a pulseira não sabe se é jejum | SBD_DIAG_2024 | Rodacki M, Cobas RA, Zajdenverg L, Silva Júnior WS, Giacaglia L, Calliari LE, et al. Diagnóstico de diabetes mellitus. Diretriz Oficial da Sociedade Brasileira de Diabetes (2024). DOI 10.29327/5412848.2024-1 | https://diretriz.diabetes.org.br/diagnostico-de-diabetes-mellitus/ | 2024 | manter fora da pulseira. **Se** a glicemia vier de exame de jejum (Parte (e)): normal < 100 mg/dL; HbA1c normal < 5,7% | Tabela 1: glicemia de jejum normal < 100, pré-diabetes 100–125, DM ≥ 126 mg/dL; TOTG 2 h < 140 / 140–199 / ≥ 200; HbA1c < 5,7 / 5,7–6,4 / ≥ 6,5%. Jejum de 8 a 12 h. A decisão do builder está correta: glicemia casual não tem faixa normal em diretriz (só "≥ 200 com sintomas" para diagnóstico) | A | MANTER (fora da pulseira) |
| goalService.js antigo (já removido): "glicemia < 130" (HIGH) | < 130 mg/dL | SBD_METAS_2023 | Sociedade Brasileira de Diabetes. Metas no tratamento do diabetes. Diretriz Oficial da SBD. DOI 10.29327/557753.2022-3 (revisão de 16/05/2023) | https://diretriz.diabetes.org.br/metas-no-tratamento-do-diabetes/ (fora do ar em 22/10; a tabela aparece no índice de busca da página oficial: "Glicemia de Jejum e Pré Prandial 80-130") | 2023 | não vale para o app do paciente | 80–130 mg/dL em jejum/pré-prandial e < 180 mg/dL 2 h após comer são **metas de quem já tem diabetes**, definidas pelo médico. Usar no app do paciente seria insinuar doença (R2) | B (página fora do ar) | REMOVER (confirmado) |
| goalService.js antigo: "glicemia < 110" (MODERATE) e "PA < 125" (MODERATE) | 110 mg/dL; 125 mmHg | — | — | — | — | — | 110 mg/dL era o corte antigo da OMS (1999) para glicemia de jejum alterada; a SBD usa 100. 125 mmHg não aparece em diretriz nenhuma | — | REMOVER (confirmado) |
| goalService.js antigo: "Nova triagem em 7 dias" | 7 dias | — | — | — | — | — | Prazo sem fonte; a Parte 4 já tira prazos sem fonte | — | REMOVER (confirmado) |
| prevention.js:10-12 (sono, fora) | antes: 7–9 h | AASM_SRS_SONO_2015 (opcional) | Watson NF, Badr MS, Belenky G, Bliwise DL, Buxton OM, Buysse D, et al. Recommended amount of sleep for a healthy adult: a joint consensus statement of the American Academy of Sleep Medicine and Sleep Research Society. J Clin Sleep Med. 2015;11(6):591–592. DOI 10.5664/jcsm.4758 (também em Sleep 2015;38:843–4) | https://www.aasm.org/resources/pdf/adultsleepdurationconsensus.pdf | 2015 | se voltar: **"dormir 7 h ou mais"**, só de 18 a 60 anos, disparada pela pulseira (`sleepHours < 7`). Nunca "7–9 h" | "Adults should sleep 7 or more hours per night on a regular basis to promote optimal health." Sobre o teto: "For others, it is uncertain whether sleeping more than 9 hours per night is associated with health risk" (não há teto de 9 h). É consenso de sociedade médica americana; não achei diretriz brasileira nem da OMS. O "7–9 h" vem da National Sleep Foundation (fundação, não sociedade médica) | B | REMOVER o 7–9 h (confirmado). Voltar com "≥ 7 h" é opcional, com B |
| prevention.js:10-12 (água, fora) | antes: 2 L/dia (alvo `7`) | MS_GUIA_ALIMENTAR_2014 (para justificar a saída) | Brasil. Ministério da Saúde. Guia Alimentar para a População Brasileira. 2ª ed. Brasília: MS; 2014. p. 85 | https://bvsms.saude.gov.br/bvs/publicacoes/guia_alimentar_populacao_brasileira_2ed.pdf (cópia: https://faolex.fao.org/docs/pdf/bra214639.pdf) | 2014 | sem meta numérica | p. 85: "a quantidade de água que precisamos ingerir por dia é muito variável ... Para alguns, a ingestão de dois litros de água por dia pode ser suficiente; outros precisarão de três ou quatro litros ou mesmo mais". O guia orienta atender à sede, não um volume. 2 L como meta para todos contradiz o MS. O alvo `7` do código antigo nem batia com 2 L | A | REMOVER (confirmado) |
| prevention.js:10-12 (passos, fora) | antes: 7000 passos/dia | DING_PASSOS_2025 (opcional) | Ding D, Nguyen B, Nau T, Luo M, del Pozo Cruz B, Dempsey PC, et al. Daily steps and health outcomes in adults: a systematic review and dose-response meta-analysis. Lancet Public Health. 2025;10(8):e668–e681. DOI 10.1016/S2468-2667(25)00164-1 | https://pubmed.ncbi.nlm.nih.gov/40713949/ | 2025 | se voltar: 7000 passos/dia como meta **complementar** aos 150 min | Interpretação do resumo: "7000 steps per day is associated with clinically meaningful improvements in health outcomes and might be a more realistic and achievable target for some". Meta-análise de 57 estudos/35 coortes, não diretriz. OMS e MS não dão número de passos (conferi a ficha da OMS e os capítulos de adultos e idosos do Guia do MS) | B | REMOVER (confirmado). Voltar é opcional, com B, e só como complemento |
| frontend/src/pages/doctor/Reference.jsx:14-19 (temperatura) | normal 37,0 °C; "até 37,4 °C"; "≥ 37,5 °C indica febre" | GUYTON_HALL_FISIOLOGIA (só o 37,0) | idem Guyton | — | a conferir | normal 37,0 °C; **tirar** "até 37,4" e "≥ 37,5 febre" | Docx: "tabela na página 53 com temperatura corporal 37,0 °C como valor normal" e cap. 74 (PDF p. 2626). O próprio docx diz que o corte de febre "pode variar". Não achei limiar de febre em diretriz que sirva para pulseira (que mede pele, não temperatura central). O MS usa "> 37,8 °C" em definições de vigilância (vi só em notas técnicas estaduais que reproduzem o MS); Mackowiak 1992 (148 adultos) é estudo pequeno | B | TROCAR (tirar faixa e febre) |
| frontend/src/pages/doctor/Reference.jsx:50-55 (movimento) | "alerta após 4h sem variação significativa" | — | — | — | — | sem regra | O docx: "Movimento não possui um critério quantitativo direto, então você pode definir regras próprias". É exatamente o "valor assumido" que a R1 proíbe | — | REMOVER |
| frontend/src/pages/doctor/Reference.jsx:7, 26-43 | FC 60–100; SpO2 95–99, "< 95% requer atenção" | GUYTON_HALL_FISIOLOGIA | idem | — | a conferir | igual | Mesmas fichas acima; "< 95%" é o limite inferior da faixa do livro | B | MANTER (e trocar o comentário da linha 7, que aponta para o docx, por `Docs/base-clinica-fisiologia.md`) |

**Lacunas que eu não fechei nesta seção.** (1) A edição e a página impressa do Guyton:
não há PDF do livro nesta máquina (procurei em todo o disco), então nada do Guyton foi
conferido por mim; as fichas repetem o que a IA do grupo extraiu. (2) Não abri o PDF do
Guia de Atividade Física do MS (o site do MS deu erro 503); o número de 150 min veio dos
dois artigos oficiais dos capítulos, escritos pelos autores do guia.

---

## (b) Limiares de alarme e evidência da pulseira

Regra desta seção: alarme não sai por falta de fonte. Cada limiar abaixo ganhou fonte
oficial (às vezes com valor trocado para o da fonte). O que **sai** é só o que não é
alarme: a conversão de número da pulseira em "sintoma" do motor bayesiano
(`wearableEvidence.toBayesianEvidence`), que não tem fonte nenhuma.

O alerta de `openaiService.analyzeVitalSign` **é alarme**: `routes/wearableRoutes.js:97-124`
transforma `severity: 'high'` em notificação CRITICAL para o paciente e em
`patient:critical` para a médica. Por isso ele segue a regra de alarme.

### Fontes desta seção

- **OMS_COVID_2023**: World Health Organization. Clinical management of COVID-19: living
  guideline (versões de 18/08/2023 e jun/2025). Definição de doença grave em adulto:
  "SpO₂ < 90% on room air". URL https://www.who.int/publications/i/item/WHO-2019-nCoV-Clinical-2023.2.
  Conferi a definição só em material de treinamento da OMS que a reproduz
  (https://opencriticalcare.org/wp-content/uploads/2021/05/COVID19-clinical-care-training-bundle-nj5f7r.pdf),
  não no PDF da diretriz. Confiança B.
- **RCP_NEWS2_2017**: Royal College of Physicians. National Early Warning Score (NEWS) 2:
  Standardising the assessment of acute-illness severity in the NHS. Updated report of a
  working party. London: RCP; 2017. URL
  https://www.rcp.ac.uk/improving-care/resources/national-early-warning-score-news-2/.
  Faixas que valem 3 pontos (vermelho): SpO₂ (escala 1) ≤ 91%; pulso ≤ 40 ou ≥ 131.
  SpO₂ 92–93 = 2; 94–95 = 1; ≥ 96 = 0. Regra conferida no guia do NHS Scotland que
  reproduz o RCP (https://rightdecisions.scot.nhs.uk/media/vhcccgq2/news2-guideline-no-fp.pdf):
  "A single red score (indicating 3 in one parameter) is unusual and should prompt a
  review by a clinician". As faixas da tabela vi em reproduções do quadro do RCP.
  É escore de paciente internado/agudo, adotado pelo NHS. Confiança B para pulseira.
- **AHA_ACLS_TAQUI_2025**: American Heart Association. Adult Tachyarrhythmia With a
  Pulse Algorithm (ACLS), 2025 AHA Guidelines for CPR and ECC, versão de 26/07/2025.
  URL https://cpr.heart.org/-/media/CPR-Files/CPR-Guidelines-Files/2025-Accessible/Algorithm-ACLS-Tachyarrhythmia-LngDscrp-250726-Ed.pdf.
  Quadro 1: "Heart rate typically ≥150/min if tachyarrhythmia" (texto visto no índice
  de busca; o PDF deu 403 para download). O mesmo 150 está no algoritmo de 2020.
  Confiança B (algoritmo de atendimento, aplicado a FC de repouso de pulseira).
- **MS_CAB36_DIABETES_2013**: Brasil. Ministério da Saúde. Estratégias para o cuidado da
  pessoa com doença crônica: diabetes mellitus. Cadernos de Atenção Básica, n. 36.
  Brasília: MS; 2013. ISBN 978-85-334-2059-5. URL
  http://189.28.128.100/dab/docs/portaldab/publicacoes/caderno_36.pdf (o endereço da BVS,
  https://bvsms.saude.gov.br/bvs/publicacoes/estrategias_cuidado_pessoa_diabetes_mellitus_cab36.pdf,
  estava fora do ar). PDF baixado e lido.
- **ADA_CRISES_2024**: Umpierrez GE, Davis GM, ElSayed NA, Fadini GP, Galindo RJ, Hirsch IB,
  et al. Hyperglycemic Crises in Adults With Diabetes: A Consensus Report. Diabetes Care.
  2024;47(8):1257–1275. DOI 10.2337/dci24-0032. URL https://pmc.ncbi.nlm.nih.gov/articles/PMC11272983/.
- **SBC_HAS_2025**: ver seção (a).
- **AASM_ICSD3_2014** (para o IAH): American Academy of Sleep Medicine. International
  Classification of Sleep Disorders, 3rd ed. Darien, IL: AASM; 2014; reproduzida em Kapur VK
  et al. Clinical Practice Guideline for Diagnostic Testing for Adult Obstructive Sleep Apnea.
  J Clin Sleep Med. 2017;13(3):479–504. DOI 10.5664/jcsm.6506. Não abri o texto; os cortes
  (IAH ≥ 15, ou ≥ 5 com sintomas; 5–15 leve, 15–30 moderada, ≥ 30 grave) são os da
  classificação. Confiança B.
- **GLIM_2019** (para a perda de peso na balança): Cederholm T, Jensen GL, Correia MITD,
  Gonzalez MC, Fukushima R, Higashiguchi T, et al. GLIM criteria for the diagnosis of
  malnutrition – A consensus report from the global clinical nutrition community. Clin Nutr.
  2019;38(1):1–9. DOI 10.1016/j.clnu.2018.08.002. O resumo confirma "non-volitional weight
  loss" como critério; o corte "> 5% nos últimos 6 meses" está na Tabela 1, que não abri.
  Confiança B.

### Tabela

| arquivo:linha atual | valor atual | fonte proposta | citação completa | URL | ano | valor proposto | trecho / derivação | conf. | ação |
|---|---|---|---|---|---|---|---|---|---|
| clinical/redFlags.js:36-37 (`INSUF_RESP`, EMERGENCY) | SpO₂ < 90 | OMS_COVID_2023 (+ RCP_NEWS2_2017 como apoio) | ver fontes acima | ver acima | 2023 | < 90 (igual) | OMS: doença grave = "SpO₂ < 90% on room air". NEWS2 já dá vermelho em ≤ 91. Se a médica preferir mais sensível, o valor com fonte é **≤ 91** (NEWS2) | B | MANTER (ou TROCAR para ≤ 91) |
| clinical/redFlags.js:45-46 (`TAQUI_GRAVE`, EMERGENCY) | FC de repouso > 150 | AHA_ACLS_TAQUI_2025 | ver acima | ver acima | 2025 | **≥ 150** | "Heart rate typically ≥150/min if tachyarrhythmia". Diferença de operador: hoje 150 exato não dispara. Alternativa com fonte, mais sensível: ≥ 131 (NEWS2, vermelho) | B | TROCAR VALOR (operador `>` → `>=`) |
| clinical/redFlags.js:54-55 (`HIPERGLICEMIA`, EMERGENCY) | glicemia > 350 | MS_CAB36_DIABETES_2013 | ver acima | ver acima | 2013 | **> 250 mg/dL** | p. 67: "As complicações agudas do DM incluem a descompensação hiperglicêmica aguda, com glicemia casual superior a 250 mg/dl ... Essas complicações requerem ação imediata da pessoa, da família ou dos amigos, e do serviço de Saúde". Tabela 5 (p. 69): "Pessoas com glicemia >250 mg/dL, cetonúria e hálito cetônico, desidratação ou vômitos: encaminhar para serviço de emergência prontamente". O 350 não aparece em fonte nenhuma. O consenso ADA/EASD 2024 usa ≥ 200 mg/dL **junto com** cetonas e acidose (não serve sozinho) e 600 mg/dL para o estado hiperosmolar | B (o MS fala de glicemia capilar casual; a pulseira não diz de onde vem a glicemia) | TROCAR VALOR (350 → 250) |
| services/openaiService.js:188 (alerta `high`) | SpO₂ < 92 | RCP_NEWS2_2017 | ver acima | ver acima | 2017 | < 92 (= ≤ 91, igual) | NEWS2: SpO₂ ≤ 91% vale 3 pontos (vermelho) e pede revisão por clínico | B | MANTER |
| services/openaiService.js:189 (alerta `medium`) | SpO₂ < 95 | GUYTON_HALL_FISIOLOGIA (+ RCP_NEWS2_2017) | ver seção (a) | — | — | < 95 (igual) | Limite inferior da faixa normal 95–99% do Guyton (docx, PDF p. 3135). No NEWS2, ≤ 95 já pontua | B | MANTER |
| services/openaiService.js:190 (alerta `high`) | sistólica > 160 | SBC_HAS_2025 | ver seção (a) | ver (a) | 2025 | **≥ 160 e/ou diastólica ≥ 100** | Quadro 3.2 (p. 36): "HA Estágio 2 160-179 e/ou 100-109". Hoje 160 exato não dispara e a diastólica não é olhada | A (o limiar); B (medida da pulseira) | TROCAR VALOR |
| services/openaiService.js:191 (alerta `medium`) | sistólica > 140 | SBC_HAS_2025 | idem | idem | 2025 | **≥ 140 e/ou diastólica ≥ 90** | Quadro 3.2: "HA Estágio 1 140-159 e/ou 90-99" | A / B | TROCAR VALOR |
| services/openaiService.js:192 (alerta `high`) | glicemia > 250 | MS_CAB36_DIABETES_2013 | ver acima | ver acima | 2013 | > 250 (igual) | Mesmo trecho da p. 67. Fica coerente com o red flag acima | B | MANTER |
| services/openaiService.js:105-106 (`generateHealthReport` sem chave, nível do relatório; **não é alarme**) | HIGH: sistólica > 140, glicemia > 160, SpO₂ < 94; MODERATE: sistólica > 130, glicemia > 130, SpO₂ < 96 | SBC_HAS_2025, RCP_NEWS2_2017 | ver acima | ver acima | 2025 / 2017 | PA: ≥ 140/90 e ≥ 130/80; SpO₂: < 94 e < 96 (iguais); **glicemia: tirar** | SpO₂ < 96 e < 94 coincidem com as faixas do NEWS2 (1 e 2 pontos). PA: estágio 1 (Quadro 3.2) e limiar de MRPA (Quadro 3.4). Glicemia 160 não tem fonte; 130 só é meta de quem tem diabetes (SBD) e a leitura não é de jejum. Além disso, esse nível de risco vai para o `AiReport`, que a R2 já restringe | B | TROCAR VALOR (PA), MANTER (SpO₂), REMOVER (glicemia). Como não é alarme, tirar a heurística inteira também é aceitável |
| clinical/wearableEvidence.js:108-111 (IAH → `apneia_observada`, peso 3 ou 2) | IAH ≥ 15 peso 3; ≥ 5 peso 2 | (cortes) AASM_ICSD3_2014; (pesos) nenhuma | ver acima | ver acima | 2014 | **tirar a conversão** | Os cortes 5 e 15 têm fonte. A conversão não: "apneia observada" é o relato de quem dorme junto, e os pesos 3 e 2 não existem em fonte nenhuma. IAH de polissonografia é exame (vira regra de exame, com fonte); IAH estimado por pulseira não tem validação para diagnóstico | — | REMOVER (conversão e pesos) |
| clinical/wearableEvidence.js:112-115 (SpO₂ noturna < 90 → apneia peso 3 + ronco peso 1) | < 90 | nenhuma | — | — | — | — | Dessaturação não é "ronco" nem "apneia observada". Sem fonte para o corte nem para o peso | — | REMOVER |
| clinical/wearableEvidence.js:116-118 (sono < 5 h → fadiga) | < 5 h | nenhuma | — | — | — | — | Horas de sono não são o sintoma "cansaço diurno". O AASM fala em ≥ 7 h, não em 5 | — | REMOVER |
| clinical/wearableEvidence.js:121-125 (PA ≥ 140 → `has_conhecida`, peso 2 ou 1) | ≥ 140 | (corte) SBC_HAS_2025; (conversão) nenhuma | ver (a) | ver (a) | 2025 | **tirar a conversão** | `has_conhecida` é "Você tem diagnóstico de pressão alta?" (questions.js:63). Pressão medida por pulseira sem manguito não fecha diagnóstico (SBC 2025, §15.2, p. 129). A PA da pulseira continua aparecendo como "fora da faixa normal" (seção a) | — | REMOVER |
| clinical/wearableEvidence.js:126-128 (FC média > 100 → `palpitacoes`) | > 100 | (corte) GUYTON; (conversão) nenhuma | — | — | — | tirar a conversão | O Guyton define taquicardia > 100; palpitação é sintoma relatado. Continua como faixa normal (seção a) | — | REMOVER |
| clinical/wearableEvidence.js:131-137 (ritmo irregular e taquicardia paroxística → palpitações, pesos 2 e 3) | qualquer evento | nenhuma | — | — | — | tirar a conversão | Sem fonte para converter aviso da pulseira em sintoma, nem para os pesos. Se quiser usar o aviso de ritmo irregular, ele deve levar a "Agendar consulta" (confirmação por eletrocardiograma), não a um LR | — | REMOVER |
| clinical/wearableEvidence.js:138-141 (HRV < 20 → fadiga) | < 20 ms | nenhuma | — | — | — | — | Sem fonte para o corte nem para a conversão | — | REMOVER |
| clinical/wearableEvidence.js:144-149 (SpO₂ < 95 → dispneia aos esforços; < 92 → dispneia em repouso, peso 2) | < 95, < 92 | (cortes) GUYTON e NEWS2; (conversão) nenhuma | — | — | — | tirar a conversão | Os cortes têm fonte (seção a e acima), mas SpO₂ baixa não é o sintoma "falta de ar". A SpO₂ já tem alarme e faixa própria | — | REMOVER |
| clinical/wearableEvidence.js:152-155 (glicemia ≥ 200 → poliúria e polidipsia, peso 2) | ≥ 200 | (corte) SBD_DIAG_2024; (conversão) nenhuma | ver (a) | ver (a) | 2024 | tirar a conversão | A SBD usa "glicemia ao acaso ≥ 200 mg/dL **com** sintomas" (poliúria, polidipsia, perda de peso). Os sintomas precisam ser perguntados; inventá-los a partir da glicemia inverte a regra | — | REMOVER |
| clinical/wearableEvidence.js:164-181 (`summarizeForPatient`) | textos "apneia moderada-grave detectada", "possível fibrilação atrial", "acima do alvo"; glicemia > 180 | — | — | — | — | — | Os textos citam doença ao paciente (R2). O 180 é a meta pós-refeição de quem tem diabetes (SBD), não faixa normal. Se o resumo continuar, usar só "fora da faixa normal" com as faixas da seção (a) | — | REMOVER os textos com doença; TROCAR os cortes pelos da seção (a) |
| clinical/wearableEvidence.js:200-203 (balança: queda ≥ 5% em 180 dias) | 5% em 180 dias | GLIM_2019 | ver acima | ver acima | 2019 | igual | Critério fenotípico GLIM: perda de peso não intencional > 5% nos últimos 6 meses. Ressalva: o LR que essa regra ativa é do CAPER, que registrou "perda de peso" anotada pelo médico, sem corte em % (já marcado B em `base-clinica-oncologia.md`) | B | MANTER |
| clinical/wearableEvidence.js:15 (`NIGHTLY_WINDOW_DAYS = 30`) | 30 dias | — | — | — | — | — | Janela de média, decisão de produto, não limiar clínico. Fica documentada como tal; não precisa de fonte clínica | — | MANTER (documentar como parâmetro de produto) |

### Lacunas de alarme (decisão do dono, não pedidas)

Achei, nas mesmas fontes, três situações que hoje **não** disparam alarme nenhum:

- **Frequência muito baixa:** NEWS2 dá vermelho em pulso ≤ 40.
- **Hipoglicemia:** MS CAB 36 (p. 67): "hipoglicemia, com glicemia casual inferior a 60
  mg/dL. Essas complicações requerem ação imediata".
- **Pressão muito alta:** SBC 2025 (p. 98): "PAS ≥ 180 e/ou PAD ≥ 110 mmHg", chamada
  "elevação importante da PA". É emergência quando há lesão de órgão-alvo (sintomas). Hoje
  o máximo é o alerta `high` do `openaiService` a partir de 160.

---

## (c) Oncologia: as 9 linhas de confiança C

Arquivo de dados: `backend/src/services/clinical/data/oncology.js`. As linhas de
`Docs/base-clinica-oncologia.md` citadas entre parênteses.

### Fontes novas desta seção

- **QCANCER_F_2013**: Hippisley-Cox J, Coupland C. Symptoms and risk factors to identify
  women with suspected cancer in primary care: derivation and validation of an algorithm.
  Br J Gen Pract. 2013;63(606):e11–e21. DOI 10.3399/bjgp13X660733. URL
  https://pmc.ncbi.nlm.nih.gov/articles/PMC3529288/. Coorte QResearch (452 clínicas de
  derivação, mulheres de 25 a 89 anos), desfecho câncer em 2 anos (mesma janela do nosso
  prior). Razões de chance ajustadas por idade, outros sintomas e fatores de risco.
- **CAMPOS_RSP_2024**: Campos MR, Rodrigues JM, Marques AP, Faria LV, Valerio TS, Sobreira da
  Silva MJ, et al. Smoking, mortality, access to diagnosis, and treatment of lung cancer in
  Brazil. Rev Saúde Pública. 2024;58:18. DOI 10.11606/s1518-8787.2024058005704. URL
  https://pmc.ncbi.nlm.nih.gov/articles/PMC11090611/. Cruza o Registro Hospitalar de Câncer
  (RHC, INCA) com a PNS (IBGE): Tabela 1 (PNS 2019, adultos ≥ 18): fumantes atuais 12,7%,
  ex-fumantes 27,1%, nunca fumou 60,2%. Tabela 2 (RHC 2019, câncer de pulmão, n = 9.523):
  atuais 39,1%, ex 41,1%, nunca 19,8% (dados faltantes de fumo redistribuídos por UF).
- **ZHENG_SCIREP_2018**: Zheng G, Yu H, Kanerva A, Försti A, Sundquist K, Hemminki K.
  Familial ovarian cancer clusters with other cancers. Sci Rep. 2018;8:11561. DOI
  10.1038/s41598-018-29888-4. URL https://pmc.ncbi.nlm.nih.gov/articles/PMC6070489/.
  Swedish Family-Cancer Database (registro nacional).
- **NICE_NG12**: National Institute for Health and Care Excellence. Suspected cancer:
  recognition and referral (NG12). London: NICE; 2015, com atualizações. URL
  https://www.nice.org.uk/guidance/ng12. A recomendação de pele da mama ("Consider a
  suspected cancer pathway referral for breast cancer in people with skin changes that
  suggest breast cancer") vi em reproduções do NG12 (GPnotebook, Macmillan); o site da NICE
  bloqueou a leitura automática. Confiança B.

### Tabela

| arquivo:linha atual | valor atual | fonte proposta | citação completa | URL | ano | valor proposto | trecho / derivação | conf. | ação |
|---|---|---|---|---|---|---|---|---|---|
| oncology.js:523 (`sangramento_fora_ciclo`, colo) e :102-105 (fonte `HIP_ESTIMATIVA_ONCO`); .md:98 | pSx 0,20 / pNoSx 0,08 (LR 2,5), "estimativa da equipe" | QCANCER_F_2013 | ver acima | ver acima | 2013 | **separar a pergunta em duas**: sangramento entre as menstruações → LR+ ≈ 7; sangramento depois da menopausa → LR+ ≈ 29. Para "não": sem evidência (LR− = 1) | Texto do artigo: "Inter-menstrual bleeding was associated with a 7-fold increased risk of cervical cancer"; sangramento pós-menopausa, 29 vezes; pós-coito, 23 vezes. Derivação: para sintoma pouco frequente e câncer raro, a razão de chances ajustada ≈ risco relativo ≈ LR+ (a chance posterior ≈ chance a priori × RR quando quase ninguém tem o sintoma). O artigo não dá a fração de casos com o sintoma, então não dá para tirar pSx e pNoSx, só o LR+. Hoje a pergunta junta os dois sangramentos (oncology.js:468), que têm pesos muito diferentes. Se o motor não aceitar "só LR+", a alternativa honesta é REMOVER | C (aproximação OR ≈ LR; sintoma anotado pelo médico de família, não autorrelato) | TROCAR (fonte, valor e pergunta); `HIP_ESTIMATIVA_ONCO` sai da base |
| oncology.js:522 (`sangramento_pos_coito`); .md:97 | 0,11 / 0,05 (LR 2,2), SHAPLEY_2006 | SHAPLEY_2006 (fica) | já na base | já na base | 2006 | igual, **com aviso** | O design manda manter Shapley como C. Mas o QCancer, maior e com a mesma janela de 2 anos, dá 23 vezes para o mesmo sintoma, 10 vezes o LR atual. A diferença vem do denominador: Shapley usa a frequência do sintoma na comunidade, o QCancer usa quem levou o sintoma ao médico. A médica precisa ver as duas | C | MANTER (marcar a divergência para a médica) |
| oncology.js:347 (`Nunca fumou`, pulmão); .md:57 | × 0,27, com "~55–60% de nunca fumantes (valor assumido)" | **CAMPOS_RSP_2024** | ver acima | ver acima | 2024 | **× 0,33** | Fator = fração dos casos de pulmão que nunca fumou ÷ fração da população que nunca fumou = 0,198 / 0,602 = **0,329**. As duas frações são do mesmo artigo, com dados oficiais (RHC/INCA e PNS/IBGE, 2019). Limitação: a PNS é de todos os adultos e os casos são mais velhos; entre os de 60+ há mais ex-fumantes (IBGE: 42,2% já pararam), então o fator por idade seria um pouco maior que 0,33 | B | TROCAR VALOR (e a fonte) |
| oncology.js:348-351 (maços-ano, pulmão); .md:58 | × 1,1 / 2,2 / 3,8 / 5,4 (RR "≈ 4/8/14/20" ÷ 3,7) | CAMPOS_RSP_2024 | ver acima | ver acima | 2024 | **trocar as 4 faixas por 2 fatores**: fuma hoje **× 3,08**; ex-fumante **× 1,52** (com "nunca" × 0,33, a média ponderada dá 1,00) | Mesma conta: atual 0,391 / 0,127 = 3,08; ex 0,411 / 0,271 = 1,52. Conferência: 0,602 × 0,329 + 0,271 × 1,517 + 0,127 × 3,079 = 1,000. **Por que não manter as faixas de maços-ano:** existe gradiente com fonte forte (SYNERGY: Pesch B et al., Int J Cancer 2012;131:1210–19, DOI 10.1002/ijc.27339, 13.169 casos; homens atuais: < 20 maços-ano OR 8,9; 20–29: 17,1; 30–39: 24,6; 40–49: 32,4), mas para dividir pela média brasileira seria preciso saber como os fumantes brasileiros se distribuem em maços-ano, e nenhuma base oficial publica isso (a PNS não mede maços-ano). Com os OR europeus a média sairia ~8, contra ~3 dos dados brasileiros: misturar as duas fontes é exatamente o "valor assumido" que a R1 proíbe. A regra de rastreamento (≥ 20 maços-ano, TC de baixa dose) **não muda**: é do consenso brasileiro, não do fator | B | TROCAR (4 faixas → 2 fatores). As duas linhas (nunca fumou e fumo) ganham fonte juntas, como o design pede |
| oncology.js:352-356 (anos sem fumar, pulmão); .md:59 | × 0,61 / 0,59 / 0,39 / 0,30 / 0,19 (TINDLE_2018, B) | — | — | — | — | **sai se a linha acima for aceita** | Não é linha C, mas depende da anterior: os fatores de Tindle são relativos ao fumante atual pesado e eram multiplicados pelo fator de maços-ano. Com "ex-fumante × 1,52" (que já é a média dos ex-fumantes), aplicar Tindle por cima contaria a cessação duas vezes. O tempo sem fumar continua valendo para a regra de rastreamento (`quitYears < 15`) | — | REMOVER (consequência da linha acima) |
| oncology.js:362 (`Parente de 1º grau com câncer de ovário`, mama) e :174-177 (fonte `CLAUS_1993`); .md:63 | × 1,3 (13% na vida ÷ "≈10% assumido") | **ZHENG_SCIREP_2018** | ver acima | ver acima | 2018 | **× 1,24** (1 parente de 1º grau); × 2,13 com 2 ou mais | Tabela 3, câncer de mama, um parente de 1º grau com câncer de ovário: RR 1,24 (IC 95% 1,19–1,30), 1.981 casos; dois ou mais: RR 2,13 (1,49–3,05), 30 casos. Registro nacional sueco, comparação com quem não tem ovário na família. Como poucas mulheres têm esse parente, o RR serve direto como multiplicador sobre a média | B (população sueca) | TROCAR VALOR (e a fonte) |
| oncology.js:513 (`alteracao_pele_mama`); .md:92 | 0,001 / 0,00007 (LR 14,29), "adotado o LR do mamilo como piso" | NICE_NG12 (regra, sem número) | ver acima | ver acima | 2015 (atualizado depois) | **sem LR**. "Sim" vira regra direta: próximo passo **Agendar consulta** (no lado da médica, ATENÇÃO para mama) | Walker 2014 teve 3 casos e 0 controles: o LR não é estimável e o "piso" é valor adotado. O NG12 recomenda considerar encaminhamento rápido para pele com alteração sugestiva, sem dar VPP. Isso sustenta a ação, não um número | B (a regra) | REMOVER o LR; TROCAR por regra direta |
| oncology.js:504-506 (tosse, dispneia, rouquidão, pulmão); .md:86-88 | LR 1,6 / 2,1 / 2,6 (HAASTRUP_2020, 41 casos) | HAASTRUP_2020 (fica) | já na base | já na base | 2020 | igual | O design manda manter como confiança baixa. Não procurei substituto | C | MANTER |

### Efeito nas personas desta seção

- **Roberto** (ex-fumante, 35 maços-ano, parou há 8 anos): o fator de pulmão cai de
  3,8 × 0,59 = 2,24 para 1,52. Pela conta do `.md` (1,6% hoje), o pulmão fica perto de
  1,1%: continua ATENÇÃO, raspando. O colorretal (INVESTIGAR, o que o seed confere) não muda.
- **Marina**: não tem ovário na família; nada muda.
- **Exemplos do `.md`** (homem de 67 anos com hemoptise): o ex-fumante de 30 maços-ano que
  parou há 5 anos vai de × 2,24 para × 1,52 e o 5,2% cai para perto de 3,6%, ainda
  INVESTIGAR. O fumante atual vai de × 3,8 para × 3,08. O nunca fumante vai de × 0,27 para
  × 0,33. **Refaça as contas do `.md` depois de aplicar**: os números aqui são estimativa
  minha pela razão dos fatores, não saída do motor.

---

## (d) As 8 doenças crônicas (hoje tudo em `HIP_MATRIZ_V7`)

Arquivos: `backend/src/services/clinical/matrix.js` (prior base e pSx/pNoSx),
`backend/src/services/clinical/data/chronicPriorRules.js` (ajustes de prior; abaixo
"rules.js") e `backend/src/services/clinical/scales.js`. Esta seção junta três pesquisas
feitas em paralelo (priors; sintomas de AOS/depressão/FA/DPOC; sintomas de CV/DM2/tireoide/
síndrome metabólica). Conferi por amostragem, no Europe PMC: o EPISONO 4, a PNS com HbA1c e
a posição da SBD de 2025 (resumos batem com o que está abaixo). O resto foi conferido por
quem pesquisou, no texto ou no resumo, como dito em cada linha.

### Veredito por condição

| Condição | Prior base | Evidências (sintomas) | Veredito |
|---|---|---|---|
| AOS | com fonte (EPISONO 4, 2026) | 5 de 10 itens com fonte C; o escore STOP-Bang tem fonte A/B | **fica**, de preferência com o escore STOP-Bang no lugar dos itens |
| CV "Doença Cardiovascular / HAS" | sem fonte (a condição mistura hipertensão e doença do coração) | 0 de 12 | **condição sem fonte: remover do motor** |
| DM2 | com fonte (PNS 2014-15 com HbA1c) | 0 de 14 itens; o escore FINDRISC tem fonte B | **fica**, com o FINDRISC como evidência única |
| Hipotireoidismo | com fonte B (ELSA-Brasil) | 12 de 15 com fonte, todas C (estudos pequenos de caso-controle) | **fica com confiança baixa**; melhor usar só a contagem de sintomas que mudaram (Canaris) |
| Síndrome metabólica | com fonte B (PNS 2013) | 0 de 6; é definição por 5 critérios de exame, não se infere por sintoma | **remover do motor** (só dá para avaliar com exames: cintura, PA, glicemia, TG, HDL) |
| Depressão | com fonte (PNS 2019) | 0 de 9 itens; o PHQ-9 total tem fonte A | **fica**, como PHQ-9 total |
| Arritmia / FA | com fonte B (ELSA-Brasil) | 0 de 10 com fonte forte | **remover do motor**: sem evidência com fonte, o prior sozinho não mexe em nada |
| DPOC | com fonte B (PLATINO São Paulo, só ≥ 40 anos) | 5 de 10 com fonte (B/C) | **fica**, só para ≥ 40 anos |

### Três problemas que valem para todas

1. **Contagem dupla.** Idade, sexo, IMC, fumo e histórico familiar entram como regra de
   prior (rules.js) **e** como "sintoma" com LR (matrix.js). Se o prior passar a ser a
   prevalência por idade e sexo das fontes abaixo, esses LRs saem.
2. **Itens correlacionados somados como independentes.** Holleman & Simel (J Gen Intern Med
   1997, DOI 10.1007/s11606-006-5024-6) mostraram que somar LRs de itens clínicos como se
   fossem independentes foi a estratégia menos precisa. Por isso a proposta troca conjuntos
   de itens por **escores validados** (STOP-Bang, FINDRISC, PHQ-9), cada um entrando uma vez.
3. **Os cortes de classificação do motor crônico não têm fonte.** `bayes.js:47-51`
   (CRITICAL ≥ 0,85, HIGH ≥ 0,65, MODERATE ≥ 0,35, LOW ≥ 0,15) e o critério de parada
   (`bayes.js:67-69`: 18 perguntas, 6 mínimas, 0,80) não vêm de fonte nenhuma. A oncologia
   tem o 3% do NICE NG12; a parte crônica não tem equivalente. Proposta: o próximo passo
   "Agendar consulta" sair dos **cortes oficiais de cada escore** (STOP-Bang ≥ 3: risco
   intermediário/alto, Chung 2016; FINDRISC ≥ 15: alto, SBD 2025; PHQ-9 ≥ 10: Kroenke 2001 /
   Levis 2019) em vez de um corte de probabilidade inventado. O mesmo vale para os pesos de
   correlação de `matrix.js:280-292`, que só mexem na ordem das perguntas: documentar como
   parâmetro de produto ou tirar.

**Atenção ao tirar condições:** as perguntas de dor no peito, síncope e perda de peso
alimentam os red flags (`SCA_IAM`, `SINCOPE_ESFORCO`, `NEOPLASIA`). Elas continuam no
questionário mesmo que CV e arritmia saiam do motor.

### Fontes desta seção (citações completas)

- **EPISONO4_2026**: Tufik S, Porcacchia AS, Pires GN, Andersen ML. Prevalence and Risk Factors for Obstructive Sleep Apnea in São Paulo: Findings From the 4th Edition of the EPISONO Study. J Sleep Res. 2026;35(3):e70255. DOI 10.1111/jsr.70255. https://pmc.ncbi.nlm.nih.gov/articles/PMC13193509/ (polissonografia em laboratório, n = 769, 20–80 anos, coleta 2018-19).
- **PNS_HBA1C_2019**: Malta DC, Duncan BB, Schmidt MI, Machado IE, Silva AG, Bernal RTI, et al. Prevalência de diabetes mellitus determinada pela hemoglobina glicada na população adulta brasileira, Pesquisa Nacional de Saúde. Rev Bras Epidemiol. 2019;22(Supl 2):E190006.SUPL.2. DOI 10.1590/1980-549720190006.supl.2. https://www.scielo.br/j/rbepid/a/qQttB6XwmqzJYgcZKfpMV7L/
- **ELSA_TIREOIDE_2015**: Olmos RD, Figueiredo RC, Aquino EM, Lotufo PA, Bensenor IM. Gender, race and socioeconomic influence on diagnosis and treatment of thyroid disorders in the Brazilian Longitudinal Study of Adult Health (ELSA-Brasil). Braz J Med Biol Res. 2015;48(8):751-8. DOI 10.1590/1414-431X20154445. https://pmc.ncbi.nlm.nih.gov/articles/PMC4541696/
- **PNS2013_SINDMET**: Oliveira LVA, Santos BNS, Machado IE, Malta DC, Velasquez-Melendez G, Felisbino-Mendes MS. Prevalência da síndrome metabólica e seus componentes na população adulta brasileira. Ciênc Saúde Coletiva. 2020;25(11):4269-80. DOI 10.1590/1413-812320202511.31202020. https://www.scielo.br/j/csc/a/yjdDz8ccXCGgwj4YhVxKmZc/
- **PNS2019_PHQ9**: Melo APS, Bonadiman CSC, Andrade FM, Pinheiro PC, Malta DC. Depression Screening in a population-based study: Brazilian National Health Survey 2019. Ciênc Saúde Coletiva. 2023;28(4):1163-74. DOI 10.1590/1413-81232023284.14912022. https://www.scielo.br/j/csc/a/wWKFtv8ZVZZTwVDM94Q3gFt/
- **ELSA_FA_2021**: Santos IS, Lotufo PA, Brant L, Pinto Filho MM, Pereira AC, Barreto SM, et al. Atrial Fibrillation Diagnosis using ECG Records and Self-Report in the Community: Cross-Sectional Analysis from ELSA-Brasil. Arq Bras Cardiol. 2021;117(3):426-34. DOI 10.36660/abc.20190873. https://pmc.ncbi.nlm.nih.gov/articles/PMC8462958/
- **PLATINO_2005**: Menezes AMB, Perez-Padilla R, Jardim JRB, Muiño A, Lopez MV, Valdivia G, et al. Chronic obstructive pulmonary disease in five Latin American cities (the PLATINO study): a prevalence study. Lancet. 2005;366(9500):1875-81. DOI 10.1016/S0140-6736(05)67632-5. (+ PLATINO_SP_2005: Menezes AMB et al. Cad Saúde Pública. 2005;21(5):1565-73. DOI 10.1590/S0102-311X2005000500030.)
- **PNS2019_HAS**: Malta DC, et al. Hipertensão arterial e fatores associados: Pesquisa Nacional de Saúde, 2019. Rev Saúde Pública. 2022;56:122. DOI 10.11606/s1518-8787.2022056004177. https://pmc.ncbi.nlm.nih.gov/articles/PMC9749662/
- **VIGITEL_2023**: Brasil. Ministério da Saúde, Secretaria de Vigilância em Saúde e Ambiente. Vigitel Brasil 2023: vigilância de fatores de risco e proteção para doenças crônicas por inquérito telefônico. Brasília: MS; 2023 (Tabela 46, hipertensão autorreferida por idade; só capitais). https://www.gov.br/saude/pt-br/centrais-de-conteudo/publicacoes/svsa/vigitel/vigitel-brasil-2023-vigilancia-de-fatores-de-risco-e-protecao-para-doencas-cronicas-por-inquerito-telefonico
- **DUARTE_JBP_2017**: Duarte RLM, Fonseca LBM, Magalhães-da-Silveira FJ, Silveira EA, Rabahi MF. Validation of the STOP-Bang questionnaire as a means of screening for obstructive sleep apnea in adults in Brazil. J Bras Pneumol. 2017;43(6):456-63. DOI 10.1590/s1806-37562017000000139.
- **MYERS_JAMA_2013**: Myers KA, Mrkobrada M, Simel DL. Does this patient have obstructive sleep apnea? The Rational Clinical Examination systematic review. JAMA. 2013;310(7):731-41. DOI 10.1001/jama.2013.276185 (só o resumo).
- **CHEN_SLEEPBREATH_2021**: Chen L, Pivetta B, Nagappa M, Saripella A, Islam S, Englesakis M, Chung F. Validation of the STOP-Bang questionnaire for screening of obstructive sleep apnea in the general population and commercial drivers: a systematic review and meta-analysis. Sleep Breath. 2021;25(4):1741-51. DOI 10.1007/s11325-021-02299-y.
- **NAGAPPA_PLOSONE_2015**: Nagappa M, Liao P, Wong J, Auckley D, Ramachandran SK, Memtsoudis S, et al. Validation of the STOP-Bang Questionnaire as a Screening Tool for Obstructive Sleep Apnea among Different Populations: A Systematic Review and Meta-Analysis. PLoS One. 2015;10(12):e0143697. DOI 10.1371/journal.pone.0143697.
- **CHUNG_CHEST_2016**: Chung F, Abdullah HR, Liao P. STOP-Bang Questionnaire: A Practical Approach to Screen for Obstructive Sleep Apnea. Chest. 2016;149(3):631-8. DOI 10.1378/chest.15-0903. **CHUNG_BJA_2012**: Chung F, et al. High STOP-Bang score indicates a high probability of obstructive sleep apnoea. Br J Anaesth. 2012;108(5):768-75. DOI 10.1093/bja/aes022.
- **KAPUR_AASM_2017**: Kapur VK, Auckley DH, Chowdhuri S, Kuhlmann DC, Mehra R, Ramar K, Harrod CG. Clinical Practice Guideline for Diagnostic Testing for Adult Obstructive Sleep Apnea: An AASM Clinical Practice Guideline. J Clin Sleep Med. 2017;13(3):479-504. DOI 10.5664/jcsm.6506. Recomendação forte: questionários não diagnosticam AOS sem polissonografia (o texto do app fala em risco, nunca em diagnóstico).
- **LEVIS_BMJ_2019**: Levis B, Benedetti A, Thombs BD; DEPRESSD Collaboration. Accuracy of Patient Health Questionnaire-9 (PHQ-9) for screening to detect major depression: individual participant data meta-analysis. BMJ. 2019;365:l1476. DOI 10.1136/bmj.l1476.
- **KROENKE_JGIM_2001**: Kroenke K, Spitzer RL, Williams JB. The PHQ-9: validity of a brief depression severity measure. J Gen Intern Med. 2001;16(9):606-13. https://pmc.ncbi.nlm.nih.gov/articles/PMC1495268/
- **SANTOS_CSP_2013**: Santos IS, Tavares BF, Munhoz TN, Almeida LSP, Silva NTB, Tams BD, et al. Sensibilidade e especificidade do Patient Health Questionnaire-9 (PHQ-9) entre adultos da população geral. Cad Saúde Pública. 2013;29(8):1533-43. DOI 10.1590/0102-311x00144612.
- **THAVENDIRANATHAN_JAMA_2009**: Thavendiranathan P, Bagai A, Khoo C, Dorian P, Choudhry NK. Does this patient with palpitations have a cardiac arrhythmia? JAMA. 2009;302(19):2135-43. DOI 10.1001/jama.2009.1673.
- **HOLLEMAN_JAMA_1995**: Holleman DR Jr, Simel DL. Does the clinical examination predict airflow limitation? JAMA. 1995;273(4):313-9 (tabela reproduzida em Dewar M, Curry RW Jr. Am Fam Physician. 2006;73(4):669-76, https://www.aafp.org/pubs/afp/issues/2006/0215/p669.html).
- **STRAUS_JAMA_2000**: Straus SE, McAlister FA, Sackett DL, Deeks JJ. The accuracy of patient history, wheezing, and laryngeal measurements in diagnosing obstructive airway disease (CARE-COAD1). JAMA. 2000;283(14):1853-7 (tabela em Deeks JJ, Altman DG. BMJ. 2004;329:168-9, DOI 10.1136/bmj.329.7458.168).
- **MURGIA_BMCPM_2014**: Murgia N, Brisman J, Claesson A, Muzi G, Olin AC, Torén K. Validity of a questionnaire-based diagnosis of chronic obstructive pulmonary disease in a general population-based study. BMC Pulm Med. 2014;14:49. DOI 10.1186/1471-2466-14-49.
- **GU_ANNMED_2021**: Gu Y, et al. Performance of COPD population screener questionnaire in COPD screening: a validation study and meta-analysis. Ann Med. 2021;53(1). DOI 10.1080/07853890.2021.1949486 (só o resumo; o IC impresso no resumo não contém o ponto, erro do próprio resumo).
- **SBD_RASTREIO_2025**: Rodacki M, Zajdenverg L, da Silva Júnior WS, Giacaglia L, Negrato CA, Cobas RA, et al. Brazilian guideline for screening and diagnosis of type 2 diabetes: a position statement from the Brazilian Diabetes Society. Diabetol Metab Syndr. 2025;17:78. DOI 10.1186/s13098-024-01572-w. https://pmc.ncbi.nlm.nih.gov/articles/PMC11881304/ (Tabela 2: pontos do FINDRISC).
- **LINDSTROM_2003**: Lindström J, Tuomilehto J. The diabetes risk score: a practical tool to predict type 2 diabetes risk. Diabetes Care. 2003;26(3):725-31. DOI 10.2337/diacare.26.3.725.
- **CANARIS_1997**: Canaris GJ, Steiner JF, Ridgway EC. Do traditional symptoms of hypothyroidism correlate with biochemical disease? J Gen Intern Med. 1997;12(9):544-50. https://pmc.ncbi.nlm.nih.gov/articles/PMC1497160/ (76 casos com TSH > 20 vs 147 controles).
- **ZULEWSKI_1997**: Zulewski H, Müller B, Exer P, Miserez AR, Staub JJ. Estimation of tissue hypothyroidism by a new clinical score: evaluation of patients with various grades of hypothyroidism and controls. J Clin Endocrinol Metab. 1997;82(3):771-6. DOI 10.1210/jcem.82.3.3810 (50 vs 80, só mulheres, clínica endócrina).
- **CARLE_2014**: Carlé A, Pedersen IB, Knudsen N, Perrild H, Ovesen L, Laurberg P. Hypothyroid symptoms and the likelihood of overt thyroid failure: a population-based case-control study. Eur J Endocrinol. 2014;171(5):593-602. DOI 10.1530/EJE-14-0481 (só o resumo).
- **SBC_DISLIP_2025**: Rached FH, et al. Diretriz Brasileira de Dislipidemias e Prevenção da Aterosclerose – 2025. Arq Bras Cardiol. 2025;122(9):e20250640. DOI 10.36660/abc.20250640 (recomenda o escore PREVENT para risco CV em 30–79 anos).
- **CHUN_MCGEE_2004**: Chun AA, McGee SR. Bedside diagnosis of coronary artery disease: a systematic review. Am J Med. 2004;117(5):334-43. DOI 10.1016/j.amjmed.2004.03.021.
- **ALBERTI_2009**: Alberti KG, Eckel RH, Grundy SM, et al. Harmonizing the metabolic syndrome: a joint interim statement. Circulation. 2009;120(16):1640-5. DOI 10.1161/CIRCULATIONAHA.109.192644.

### (d.1) AOS

| arquivo:linha atual | valor atual | fonte proposta | valor proposto | trecho / derivação | conf. | ação |
|---|---|---|---|---|---|---|
| matrix.js:121 (prior base, homem/sexo ausente) | 0,32 | EPISONO4_2026 (2026, URL acima) | sexo ausente 0,371; homem 0,449 | Tab. 2, prevalência ajustada: "Total 37.12 [33.71; 40.53] … Men 44.88". Critério: IAH ≥ 15, ou 5–14,9 com sintoma. O 0,32 atual é o total de 2007 (Tufik 2010), não o de homens | A | TROCAR VALOR |
| rules.js:39 (mulher set) | 0,15 | EPISONO4_2026 | 0,308 | Tab. 2: "Women … 30.79 [26.57; 35.01]" | A | TROCAR VALOR |
| rules.js:40 (> 50 homem +0,13) | +0,13 | EPISONO4_2026 | trocar soma por valor por faixa (homem): 20–29 0,171; 30–39 0,369; 40–49 0,563; 50–59 0,476; 60–69 0,533; 70–80 0,637 | Tab. 3, homens, ajustado | B (células pequenas, IC de ±12–18 pontos) | TROCAR VALOR (e cortes) |
| rules.js:41 (> 50 mulher +0,10) | +0,10 (dá 0,25) | EPISONO4_2026 | mulher: 20–29 0,053; 30–39 0,058; 40–49 0,186; 50–59 0,429; 60–69 0,534; 70–80 0,550 | Tab. 3, mulheres. O 0,25 atual é metade da fonte | B | TROCAR VALOR (e cortes) |
| rules.js:42 (IMC ≥ 30 +0,10) | +0,10 | nenhuma | — | A fonte só dá OR por kg/m² (1,044), não prevalência por faixa de IMC. E IMC já é LR em matrix.js:128 | — | REMOVER |
| matrix.js:123 (ronco alto) | 0,95/0,40 (LR 2,4) | MYERS_JAMA_2013 | LR+ 1,1 (se precisar de par: 0,72/0,56, Duarte) | "Snoring … is not useful … (summary LR, 1.1; 95% CI, 1.0-1.1)". Duarte: 258/357 vs 55/99 | B (LR) / C (par) | TROCAR VALOR |
| matrix.js:124 (apneia observada) | 0,75/0,06 (LR 12,5) | DUARTE_JBP_2017 | 0,52/0,29 (LR 1,79) | Tab. 1: 187/357 com AOS vs 29/99 sem. O LR atual é ~7 vezes a evidência. Myers: "engasgo ou arfar à noite" tem LR 3,3, mas é outra pergunta | C (clínica do sono, Brasil, n = 456) | TROCAR VALOR |
| matrix.js:125 (cansaço diurno) | 0,80/0,50 (LR 1,6) | DUARTE_JBP_2017 | 0,60/0,58 (LR 1,04) | 213/357 vs 57/99: praticamente neutro | C | TROCAR VALOR (ou remover, dá no mesmo) |
| matrix.js:127 (HAS conhecida) | 0,55/0,30 (LR 1,8) | DUARTE_JBP_2017 | 0,39/0,20 (LR 1,94) | 140/357 vs 20/99 | C | TROCAR VALOR |
| matrix.js:131 + questions.js:59 (pescoço largo) | 0,55/0,25 (LR 2,2); corte 40 cm H / 35 cm M | DUARTE_JBP_2017; CHUNG_BJA_2012 | 0,59/0,24 (LR 2,45); corte **> 40 cm para os dois sexos** | 212/357 vs 24/99. Chung 2012: "Neck circumference >40 cm?" (o corte de 35 cm para mulher não existe no STOP-Bang) | C (par) / A (corte) | TROCAR VALOR e a pergunta |
| matrix.js:126, 128-130, 132 (cefaleia matinal, IMC ≥ 30, idade ≥ 50, sexo masculino, palpitações noturnas) | LR 1,9 / 1,7 / 1,4 / 1,6 / 2,0 | — | — | Cefaleia matinal: LR < 2 e "not useful" (Myers, via registro DARE). IMC, idade e sexo nunca viram evidência (sem pergunta) e já estão no prior. Palpitações noturnas: nenhuma fonte | — | REMOVER |
| (novo) escore STOP-Bang como evidência única | — | CHEN_SLEEPBREATH_2021 (≥ 3); NAGAPPA_PLOSONE_2015 (≥ 5) | ≥ 3: 0,88/0,58 (LR 1,52); ≥ 5: 0,60/0,28 (LR 2,14); referência IAH ≥ 15 | Chen, população geral, IAH ≥ 15: sens 88 (86–89), esp 42 (40–43), 5 estudos, n = 8.586. Nagappa, clínica do sono: "≥5 \| 60 \| 72". **Se usar o escore, o prior tem de ser o de IAH ≥ 15**: EPISONO 4 dá moderada 11,5% + grave 7,9% = 19,4% no total (resumo; por sexo e idade, ver Tab. 3) | A (≥ 3) / B (≥ 5) | TROCAR (substitui os itens) |
| scales.js:13 (comentário "≥3: alto risco") e :41 ("sensibilidade 93% para AHI > 15" no nível ALTO) | — | CHUNG_CHEST_2016; NAGAPPA_PLOSONE_2015 | comentário: 0–2 baixo, 3–4 intermediário, 5–8 alto; frase do nível alto: sens 60%, esp 72% para IAH ≥ 15 | Os 93% de Chung 2008 valem para o corte ≥ 3 em cirúrgicos, não para ≥ 5 | A | TROCAR (texto) |
| scales.js:19-21 (Observed = IAH ≥ 5 da pulseira; Pressure = PAS ≥ 140 da pulseira) | — | — | — | Nenhum dos dois é item do STOP-Bang. IAH é o próprio padrão-ouro (circular) | — | REMOVER as substituições |
| scales.js:22-25, 30-32 (IMC > 35, idade > 50, cortes 3 e 5) | — | CHUNG_BJA_2012; CHUNG_CHEST_2016 | igual | "BMI more than 35", "Age over 50"; 0–2 / 3–4 / 5–8 | A | MANTER |

### (d.2) CV "Doença Cardiovascular / HAS": **condição sem fonte: remover do motor**

| arquivo:linha atual | valor atual | fonte proposta | valor proposto | trecho / derivação | conf. | ação |
|---|---|---|---|---|---|---|
| matrix.js:140 (prior base) | 0,20 | nenhuma para "doença CV / HAS" | — | O 0,20 lembra HAS autorreferida (PNS 2013: 21,4%; PNS 2019: 23,9%), não doença do coração (IBGE, PNS 2019: 5,3%). A condição usa "tem HAS?" como sintoma dela mesma (matrix.js:143) | — | REMOVER (condição inteira) |
| rules.js:45-47 (> 45 set 0,30; > 60 set 0,45; homem +0,05) | 0,30 / 0,45 / +0,05 | (só se a condição virar "HAS") VIGITEL_2023 Tab. 46; PNS2019_HAS Tab. 1 | 45–54: 0,347; 55–64: 0,501; ≥ 60: 0,550 | Vigitel 2023, Tab. 46: "45 a 54 34,7 … 55 a 64 50,1". PNS 2019: "≥ 60 \| 54.99". Homem +0,05: no autorrelato o sinal é o contrário (mulher 26,45 vs homem 21,06, PNS 2019) | B / A | REMOVER |
| matrix.js:142-153 (12 itens: tabagismo, HAS, diabetes, colesterol, família, dor típica, dispneia, idade, sexo, palpitações, edema, síncope) | LR 1,4 a 7,5 | SBC_DISLIP_2025; CHUN_MCGEE_2004 | — | Não existe LR de fator de risco para uma "doença CV" genérica. A SBC 2025 manda estimar risco CV pelo escore PREVENT ("Para indivíduos entre 30-79 anos, sem doença cardiovascular prévia estabelecida, recomenda-se a favor do uso do escore PREVENT", forte/alta). Dor torácica típica tem LR+ 5,8 (Chun & McGee) em quem já chega com dor torácica, e serve para "doença coronariana", não para "CV/HAS" | A (a recomendação) | REMOVER |
| scales.js:137-178 ("Framingham simplificado") | pontos e faixas próprios | SBC_DISLIP_2025 (PREVENT); D'Agostino RB Sr et al. Circulation. 2008;117(6):743-53 (para conferir) | trocar por PREVENT, ou sem exames, pelo modelo não laboratorial da OMS (WHO CVD Risk Chart Working Group. Lancet Glob Health. 2019;7(10):e1332-45) | Não é o Framingham: as entradas reais são idade, CT, HDL, PAS tratada ou não, tabagismo e DM; não tem histórico familiar nem "colesterol sim/não", e a tabela pontos→risco não vem do artigo | A | REMOVER |

### (d.3) DM2

| arquivo:linha atual | valor atual | fonte proposta | valor proposto | trecho / derivação | conf. | ação |
|---|---|---|---|---|---|---|
| matrix.js:161 (prior base) | 0,13 | PNS_HBA1C_2019 | idade ausente 0,084; 18–29 0,015; 30–44 0,035 | Tab. 2 (HbA1c ≥ 6,5% ou remédio): "Total 8,4 (7,65–9,11); 18 a 29 1,47; 30 a 44 3,48". O 0,13 dá 4 a 9 vezes a faixa. É DM de qualquer tipo | A | TROCAR VALOR |
| rules.js:50 (> 40 set 0,15) | 0,15 | PNS_HBA1C_2019 | corte em ≥ 45: 0,126 | "45 a 59 \| 12,60" | A | TROCAR VALOR e corte |
| rules.js:51 (> 60 set 0,22) | 0,22 | PNS_HBA1C_2019 | ≥ 60: 0,206 | "60 ou mais \| 20,59" | A | TROCAR VALOR |
| rules.js:52 (IMC ≥ 30 +0,08) | +0,08 | — | — | A fonte dá RP ajustada 3,30 contra peso normal, não uma soma; e IMC já é LR em matrix.js:164 | — | REMOVER |
| rules.js:53-54 (parente de 1º grau +0,05) | +0,05 | (só achei EPIC-InterAct, europeu, incidência: HR 2,72) | — | PNS e Vigitel não medem histórico familiar; e já é LR em matrix.js:170 | C | REMOVER |
| matrix.js:163-170 (8 itens do FINDRISC: sobrepeso, obesidade, cintura, sedentarismo, frutas, anti-hipertensivo, glicemia alterada, família) | LR 1,2 a 10 | SBD_RASTREIO_2025 | — (viram pontos do escore) | Os pontos têm fonte (SBD 2025, Tab. 2); LR por item não existe em fonte nenhuma | A (pontos) | REMOVER como LR |
| matrix.js:171-176 (poliúria, polidipsia, polifagia, perda de peso, visão turva, feridas) | LR 11 / 10 / 8 / 11,7 / 6 / 8,3 | — | — (vira regra: sintoma clássico → "Agendar consulta" para dosar glicemia) | Não há sensibilidade/especificidade por sintoma na população geral. A SBD (R11) usa o sintoma para indicar glicemia: "When typical hyperglycemic symptoms are present … random plasma glucose ≥ 200 mg/dL" | — | REMOVER (são esses LRs que levam o João a CRITICAL) |
| (novo) FINDRISC ≥ 9 como evidência única | — | LINDSTROM_2003 | 0,78/0,23 (LR+ 3,4; LR− 0,29) | "score value ≥9 had sensitivity of 0.78 and 0.81, specificity of 0.77 and 0.76". Ressalva: o desfecho é DM tratado com remédio em 10 anos (incidência), não DM atual; uma meta-análise de 2025 (Acosta-Reyes, só resumo) dá sens 53–85% e falso-positivo 22–55% para DM atual | B | TROCAR (substitui os 14 itens) |
| scales.js:96-98 (FINDRISC idade) | ≥ 64 → 4; ≥ 54 → 3; ≥ 45 → 2 | SBD_RASTREIO_2025 | 45–54 → 2; 55–64 → 3; > 64 → 4 | "45 to 54 years (2) / 55 to 64 (3) / over 64 (4)": hoje 54 e 64 anos ganham um ponto a mais | A | TROCAR VALOR |
| scales.js:106 (cintura) | sim → homem 4, mulher 3 | SBD_RASTREIO_2025 | 3 para os dois com o corte único (94/80 cm); 4 só com segunda pergunta (> 102 / > 88 cm) | Homem 94–102 cm = 3, > 102 = 4; mulher 80–88 = 3, > 88 = 4 | A | TROCAR VALOR |
| scales.js:116 (família) | sim → 5 | SBD_RASTREIO_2025 | 1º grau 5 (correto para a pergunta); falta 2º grau = 3 | "grandparents, aunt, uncle or first cousins (3 points)"; "parents, brothers, sisters or children (5 points)" | A | TROCAR (acrescentar 2º grau) |
| scales.js:119-123 (faixas de risco) | ≥ 20 → 50% | SBD_RASTREIO_2025 | muito alto só com > 20 (≥ 21); percentuais iguais | SBD: "high (15–20 points), and very high (more than 20 points)": hoje 20 pontos sai 50% e deveria sair 33% | A | TROCAR VALOR |
| scales.js:101-114 (IMC, atividade, frutas, anti-HAS, glicemia) | 1/3, 2, 1, 2, 5 | SBD_RASTREIO_2025 | igual | Os pontos batem | A | MANTER |

### (d.4) Hipotireoidismo (fica com confiança baixa)

| arquivo:linha atual | valor atual | fonte proposta | valor proposto | trecho / derivação | conf. | ação |
|---|---|---|---|---|---|---|
| matrix.js:184 (prior base) | 0,05 | ELSA_TIREOIDE_2015 | sexo ausente 0,074; homem 0,027 | "Overt hypothyroidism was present in 7.4% (95%CI=5.8-9.0)". Homem, pela Tab. 1: 181/6.665 = 2,72%. Definição inclui quem já usa levotiroxina; 35–74 anos | B | TROCAR VALOR |
| rules.js:57 (mulher) | 0,07 | ELSA_TIREOIDE_2015 | 0,113 | Tab. 1: 899/7.925 = 11,34% | B | TROCAR VALOR |
| rules.js:58-59 (> 60 mulher 0,12; > 60 homem 0,08) | 0,12 / 0,08 | — | — | A fonte não cruza idade e sexo | — | REMOVER |
| matrix.js:200 (mudança em ≥ 7 sintomas) | 0,60/0,07 (LR 8,7) | CANARIS_1997 | 0,36/0,04 (LR 8,7) | Tab. 4: 27/76 casos vs 6/147 controles. O LR está certo; pSx e pNoSx não. **Proposta:** usar esta contagem como evidência única (Tab. 4 tem LR por faixa: 0 → 0,5; 1–2 → 0,6; 3–4 → 1,5; 5–6 → 1,2; 7–8 → 9,0; 9–10 → 5,8; ≥ 11 → 13,5) e não somar com os itens soltos | C | TROCAR VALOR |
| matrix.js:186-199 (itens soltos) | vários | CANARIS_1997; ZULEWSKI_1997; CARLE_2014 | cansaço 0,81/0,42 (Carlé); ganho de peso 0,54/0,225 (Zulewski); frio 0,51/0,40; intestino preso 0,17/0,10; pele seca 0,48/0,24; fraqueza 0,41/0,18; humor 0,38/0,18; menstruação 0,44/0,27; rouquidão 0,17/0,04; inchaço nos olhos 0,36/0,09 (Canaris) | Canaris, Tab. 2-3 (ex.: "Hoarse voice 17 / 4 / 4.2"); Zulewski, Tab. 1. Só servem se a contagem acima não for usada | C | TROCAR VALOR (alternativa à contagem) |
| matrix.js:191, 192, 196, 197 (queda de cabelo, bradicardia, sobrancelha, reflexos) | LR 2,2 / 4,4 / 10 / 10 | — | — | Cabelo: só OR, sem prevalência. Bradicardia: Zulewski 58% vs 57,5%, LR 1,0. Sobrancelha: só relato de caso. Reflexos: exame feito por endocrinologista, o app não coleta | — | REMOVER |

### (d.5) Síndrome metabólica: **remover do motor**

| arquivo:linha atual | valor atual | fonte proposta | valor proposto | trecho / derivação | conf. | ação |
|---|---|---|---|---|---|---|
| matrix.js:208; rules.js:62 (prior 0,40; > 40 set 0,50) | 0,40 / 0,50 | PNS2013_SINDMET | (se ficar) total 0,384; 18–39 0,167; 40–59 0,457; ≥ 60 0,661 | "A prevalência de SM foi de 38,4%"; critério adaptado (HbA1c e colesterol total, coleta sem jejum) | B | o prior tem fonte, mas a condição sai |
| matrix.js:210-215 (6 itens: obesidade, cintura, HAS+DM, sedentarismo, acantose, família) | LR 2,0 a 6,0 | ALBERTI_2009 | — | A síndrome é **definição**: 3 de 5 critérios (cintura, PA, TG, HDL, glicemia). Cintura e HAS+DM fazem parte da definição (LR inflado por construção). Acantose: estudos são de resistência à insulina, sem sensibilidade utilizável. Família de "síndrome metabólica": nenhuma fonte | A (a definição) | REMOVER; se um dia houver exames, avaliar de forma determinística pelos 5 critérios |

### (d.6) Depressão (fica, como PHQ-9 total)

| arquivo:linha atual | valor atual | fonte proposta | valor proposto | trecho / derivação | conf. | ação |
|---|---|---|---|---|---|---|
| matrix.js:223 (prior base) | 0,11 | PNS2019_PHQ9 | 0,057 (algoritmo do PHQ-9, o mais próximo de depressão maior) | Tab. 1: "Overall 10.8" no corte ≥ 10 e "5.7 (5.4-6.0)" pelo algoritmo. Usar 10,8% como prior e depois o PHQ-9 ≥ 10 como evidência contaria o mesmo dado duas vezes | A | TROCAR VALOR |
| rules.js:65 (> 50 set 0,12) | 0,12 | PNS2019_PHQ9 | — | Não há gradiente por idade (≥ 10: 40–49 11,7; 50–59 11,9; 60–69 10,5). O gradiente forte é de sexo (mulher 15,0 vs homem 6,1) | A | REMOVER (opcional: regra por sexo) |
| matrix.js:228-236 (9 itens do PHQ-9) | LR 2,0 a 22,5 | — | — | Kroenke 2001 só traz acurácia do escore total ("Per-item … Not reported"). Nenhuma fonte por item | — | REMOVER |
| (novo) PHQ-9 total ≥ 10 | — | LEVIS_BMJ_2019 | 0,88/0,15 (LR 5,9) | "cut-off score of 10 or above … sensitivity 0.88 … specificity 0.85" (29 estudos, 6.725 participantes). Alternativa brasileira: Santos 2013, > 9: 0,775/0,133 (B). Alternativa por faixa: Kroenke, LR 0,04 / 0,5 / 2,6 / 8,4 / 36,8 (B) | A | TROCAR (substitui os itens) |
| scales.js:66-70 (cortes 5/10/15/20) | — | KROENKE_JGIM_2001 | igual | "scores of 5, 10, 15, and 20 represented mild, moderate, moderately severe, and severe depression" | A | MANTER |
| scales.js:80-83 (frases "~95%", "~75%", "~45%", "~18%") | — | — | — | Não existem no Kroenke. Com os LRs de Kroenke e prior 0,11 dariam ~82%, ~51%, ~24% e ~6% | — | REMOVER (são vistas pela médica) |
| redFlags.js:58-67 (item 9 > 0 → CVV 188) | — | — | igual | Regra de segurança, não é probabilidade | — | MANTER |

### (d.7) Arritmia / FA: **remover do motor**

| arquivo:linha atual | valor atual | fonte proposta | valor proposto | trecho / derivação | conf. | ação |
|---|---|---|---|---|---|---|
| matrix.js:244; rules.js:68-69 (prior 0,02; > 60 0,05; > 65 0,08) | 0,02 / 0,05 / 0,08 | ELSA_FA_2021 | (se ficar) total 0,025; < 45 0,012; 45–54 0,022; 55–64 0,029; > 64 0,054 | "333 (2,5%) … 1,2%, 2,2%, 2,9%, e 5,4% para as idades < 45, 45-54, 55-64, e > 64 anos" (285 dos 333 só por autorrelato) | B | o prior tem fonte, mas a condição sai |
| matrix.js:246-255 (10 itens) | LR 1,4 a 9,0 | THAVENDIRANATHAN_JAMA_2009 (só para quem já tem palpitação) | — | Não há revisão com sensibilidade/especificidade de sintomas para FA na população geral. A JAMA 2009 estuda quem já chega com palpitação e acha "No other features significantly alter the probability", exceto palpitação < 5 min (LR 0,38) e cardiopatia conhecida (LR 2,03) | C | REMOVER |

### (d.8) DPOC (fica, só ≥ 40 anos)

| arquivo:linha atual | valor atual | fonte proposta | valor proposto | trecho / derivação | conf. | ação |
|---|---|---|---|---|---|---|
| matrix.js:263 (prior base) | 0,05 | PLATINO_2005 | ≥ 40 nunca fumante: 0,125; **< 40: sem fonte** (não avaliar) | Tab. 4, São Paulo: "Never smoker 12·5%"; "Overall 15·8%"; razão fixa VEF1/CVF < 0,70 | B | TROCAR VALOR (≥ 40) / REMOVER (< 40) |
| rules.js:72 (fuma ou já fumou set 0,20) | 0,20 | PLATINO_2005; PLATINO_SP_2005 | ex 0,156; atual 0,218; quem fuma ou fumou 0,182 | "Former smoker 15·6%; Current smoker 21·8%"; média ponderada com a Tab. 2 do Cad SP: (33,1 × 15,5 + 24,0 × 21,9)/57,1 = 18,19% | B | TROCAR VALOR |
| rules.js:73-74 (≥ 10 maços-ano set 0,25) | 0,25 | PLATINO_2005 | 10–19,9: 0,153; ≥ 20: 0,246 | Tab. 4: "10–19·9 15·3%; ≥20 24·6%" | B | TROCAR VALOR (2 faixas) |
| rules.js:75 (fumante > 40 set 0,30) | 0,30 | PLATINO_2005 | 0,218 | A amostra já é ≥ 40; nenhum estrato chega a 0,30. A ordem das regras precisa mudar (hoje esta sobrescreve a de maços-ano) | B | TROCAR VALOR |
| matrix.js:265 + questions.js:121 (> 10 maços-ano) | 0,85/0,25 (LR 3,4) | STRAUS_JAMA_2000 | ≥ 40 maços-ano: 0,284/0,014 (LR 20,4 univariado; 8,3 ajustado) | Deeks 2004, tabela: "≥40 \| 42 (28.4) \| 2 (1.4)". Nenhuma fonte usa 10 maços-ano. **Duplica o prior por fumo**: escolher um dos dois | C | TROCAR (ou REMOVER se o fumo ficar só no prior) |
| matrix.js:266 (tosse crônica) | 0,75/0,20 (LR 3,75) | HOLLEMAN_JAMA_1995 | 0,51/0,29 (LR 1,8) | "Coughing \| 51 \| 71 \| 1.8" | B (pacientes com suspeita de DPOC) | TROCAR VALOR |
| matrix.js:267 (catarro crônico) | 0,65/0,15 (LR 4,3) | MURGIA_BMCPM_2014 | só junto com a tosse ("tosse e catarro ≥ 3 meses/ano por 2 anos"): 0,046/0,021 (LR 2,24) | Tab. 2, população geral sueca | B | REMOVER como item isolado (ou juntar com a tosse) |
| matrix.js:268 (falta de ar aos esforços) | 0,80/0,15 (LR 5,3) | HOLLEMAN_JAMA_1995 | 0,82/0,67 (LR 1,2) | "Dyspnea \| 82 \| 33 \| 1.2" | B | TROCAR VALOR |
| matrix.js:270 (chiado) | 0,55/0,20 (LR 2,75) | HOLLEMAN_JAMA_1995 | 0,51/0,16 (LR 3,2) | "Wheezing history \| 51 \| 84"; a tabela imprime LR 3,8 (agrupado à parte), a conta dá 3,2 | B | TROCAR VALOR |
| matrix.js:269, 271-274 (falta de ar em repouso, bombinha, infecções, idade ≥ 50, tórax em barril) | LR 13,3 / 10 / 3,7 / 3,75 / 15 | — | — | Sem fonte, circular (bombinha = diagnóstico já feito), sem pergunta (idade, tórax) ou exame físico (tórax em barril: Mattos 2009, LR 2,58, C) | — | REMOVER |
| (novo, opcional) COPD-PS | — | GU_ANNMED_2021 | 0,66/0,14 (LR 3,0) | Meta-análise de 8 estudos, maioria asiáticos; só o resumo | B | opcional, no lugar dos itens |

### (d.9) Itens sem pergunta (limpeza)

`imc_sobrepeso`, `imc_obesidade`, `idade_50_mais`, `idade_55h_65m`, `idade_65_mais`,
`sexo_masculino`, `has_e_dm_combinados`, `bradicardia`, `fraqueza_muscular_proximal`,
`humor_deprimido`, `perda_terco_lateral_sobrancelha`, `reflexos_lentos`,
`edema_periorbitario`, `torax_em_barril`, `dor_toracica_atipica`: não têm pergunta em
`questions.js` e nada no código os preenche (o `kb/buildFromSeed.js` cadastra como LAB sem
painel). Hoje não pesam; com a regra R1, saem da base junto com o LR.

---

## (e) Faixas de exame laboratorial (hoje decididas pelo GPT)

**Situação.** `services/openaiService.js:25-34` pede ao GPT-4o um `status`
(`normal|alto|baixo|critico`) e um `riskLevel` por exame, sem faixa nenhuma: o modelo
decide sozinho o que é "alto". Os exames do seed mostram os marcadores da demo:
glicemia de jejum, HbA1c, LDL, triglicérides (João e Marina), creatinina e ureia (João),
IAH e dados de sono (João), hemoglobina, VCM, ferritina e FIT (Roberto).

**Proposta de desenho (princípio).** Dois tipos de número, duas fontes:

1. **Limite de decisão de diretriz**, quando existe (glicemia, HbA1c, lipídeos, hemoglobina,
   TFG, IAH): a faixa vem da base, com a fonte abaixo, e o GPT só extrai nome, valor e
   unidade.
2. **Intervalo de referência do laboratório**, para todo o resto (ureia, VCM, TSH,
   enzimas...): ele depende do método e da população de cada laboratório, e o próprio
   laudo traz a faixa impressa. O GPT passa a **extrair a faixa impressa no laudo**
   (`refMin`, `refMax`, como texto do OCR) e o status sai da comparação com ela. A fonte é
   o laudo daquele exame. Se o laudo não trouxer faixa, o status fica "sem faixa".
   Isso segue a prática de laboratório (cada laboratório estabelece e publica seus
   intervalos; padrão CLSI EP28-A3c, *Defining, Establishing, and Verifying Reference
   Intervals in the Clinical Laboratory*, 2010; citado de memória, não abri o documento).
3. **`critico` e `riskLevel` saem do GPT.** "Crítico" só onde a seção (b) tem alarme com
   fonte (glicemia > 250 mg/dL, MS CAB 36). O `riskLevel` do exame não tem fonte e, pela
   R2, nem chega ao paciente.

### Fontes desta seção

- **SBD_DIAG_2024**: ver seção (a).
- **SBC_DISLIP_2025**: Rached FH, et al. Diretriz Brasileira de Dislipidemias e Prevenção
  da Aterosclerose – 2025. Arq Bras Cardiol. 2025;122(9):e20250640. DOI
  10.36660/abc.20250640. https://pmc.ncbi.nlm.nih.gov/articles/PMC12674852/. Tabela 3.1,
  "Valores referenciais ou alvos terapêuticos do perfil lipídico" (texto lido). A própria
  diretriz manda esses valores constarem dos laudos.
- **WHO_HB_2024**: já na base (oncologia): hemoglobina < 13,0 g/dL (homem) e < 12,0 g/dL
  (mulher não grávida), ≥ 15 anos.
- **WHO_FERRITINA_2020**: World Health Organization. WHO guideline on use of ferritin
  concentrations to assess iron status in individuals and populations. Geneva: WHO; 2020.
  ISBN 978-92-4-000012-4. https://www.who.int/publications/i/item/9789240000124. A página
  confirma o título e o ano; os cortes (< 15 µg/L em adulto aparentemente saudável; < 70
  µg/L com infecção ou inflamação) estão no PDF, **que não abri**: conferir.
- **KDIGO_DRC_2024**: Kidney Disease: Improving Global Outcomes (KDIGO) CKD Work Group.
  KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of Chronic
  Kidney Disease. Kidney Int. 2024;105(4S):S117–S314. DOI 10.1016/j.kint.2023.10.018
  (citação de memória; **não abri**: conferir). Categorias de TFG: G1 ≥ 90, G2 60–89,
  G3a 45–59, G3b 30–44, G4 15–29, G5 < 15 mL/min/1,73 m².
- **AASM_ICSD3_2014**: ver seção (b) (IAH < 5 normal; 5–14,9 leve; 15–29,9 moderado; ≥ 30
  grave).

### Tabela

| arquivo:linha atual | valor atual | fonte proposta | citação completa | URL | ano | valor proposto | trecho / derivação | conf. | ação |
|---|---|---|---|---|---|---|---|---|---|
| openaiService.js:31 (glicemia de jejum) | GPT decide | SBD_DIAG_2024 | ver (a) | ver (a) | 2024 | normal < 100; alterada 100–125; ≥ 126 mg/dL "fora da faixa" (o paciente vê só "fora da faixa normal") | Tabela 1 da diretriz (seção a) | A | TROCAR (faixa da base) |
| openaiService.js:31 (HbA1c) | GPT decide | SBD_DIAG_2024 | idem | idem | 2024 | normal < 5,7%; 5,7–6,4; ≥ 6,5 | Tabela 1 | A | TROCAR |
| openaiService.js:31 (colesterol total, TG, HDL) | GPT decide | SBC_DISLIP_2025 | ver acima | ver acima | 2025 | CT < 190 mg/dL; TG < 150 (jejum de 12 h) ou < 175 (sem jejum); HDL > 40 | Tabela 3.1: "Colesterol Total \| < 190 mg/dL \| < 190 mg/dL"; "Triglicérides \| < 150 mg/dL \| < 175 mg/dL"; "HDL-c \| > 40 mg/dL \| > 40 mg/dL". O GPT precisa extrair se o laudo é com ou sem jejum | A | TROCAR |
| openaiService.js:31 (LDL e não-HDL) | GPT decide | SBC_DISLIP_2025 | idem | idem | 2025 | **sem faixa normal única**: o alvo depende da categoria de risco (LDL < 115 baixo; < 100 intermediário; < 70 alto; < 50 muito alto; < 40 extremo). No app do paciente: mostrar o valor sem selo; a médica vê o alvo pelo risco | Tabela 3.1 (LDL-c por categoria). A categoria de risco exige escore (PREVENT), que o app não calcula | A | TROCAR (sem status para o paciente) |
| openaiService.js:31 (hemoglobina) | GPT decide | WHO_HB_2024 | já na base | já na base | 2024 | < 13,0 (H) / < 12,0 (M) g/dL "abaixo da faixa" | Igual à `LabRule` de anemia da oncologia | A | TROCAR (reusar a regra) |
| openaiService.js:31 (ferritina) | GPT decide | WHO_FERRITINA_2020 | ver acima | ver acima | 2020 | < 15 µg/L (= ng/mL) abaixo, em adulto sem inflamação | Corte do guideline, a conferir no PDF | B | TROCAR (depois de conferir) |
| openaiService.js:31 (creatinina) | GPT decide | KDIGO_DRC_2024 + faixa do laudo | ver acima | ver acima | 2024 | creatinina: faixa impressa no laudo (depende do método). TFG (CKD-EPI), se o laudo trouxer: ≥ 60 sem outro marcador = fora das categorias de DRC | Categorias G1–G5 do KDIGO. Creatinina isolada não tem faixa de diretriz | B | TROCAR |
| openaiService.js:31 (ureia, VCM, TSH, enzimas, demais) | GPT decide | faixa do laudo (CLSI EP28-A3c) | ver princípio acima | — | — | faixa impressa no laudo; sem ela, "sem faixa" | Intervalos de referência são do laboratório | B | TROCAR |
| openaiService.js:31 (IAH na polissonografia) | GPT decide | AASM_ICSD3_2014 | ver (b) | ver (b) | 2014 | < 5 normal; ≥ 5 fora da faixa | Classificação AASM | B | TROCAR |
| openaiService.js:31 (eficiência do sono, tempo total, despertares) | GPT decide | nenhuma | — | — | — | sem status | Não há faixa de diretriz para esses números de laudo de sono; usar a do laudo se houver | — | REMOVER o status |
| openaiService.js:31 (PSA, FIT, BI-RADS, Papanicolau, DNA-HPV) | GPT decide | já na base (OESTERLING_1993, LEE_FIT_2014, ACR_BIRADS_2013, KOLIOPOULOS_2017) | já na base | já na base | — | usar as `LabRule` da oncologia | As regras já têm fonte (`base-clinica-oncologia.md`, "Exames: limites usados") | A/B | TROCAR (reusar) |
| openaiService.js:31 (`status: critico`) | GPT decide | MS_CAB36_DIABETES_2013 (só glicemia) | ver (b) | ver (b) | 2013 | "crítico" só para glicemia > 250 mg/dL; nenhum outro marcador | Os demais não têm valor crítico com fonte nesta pesquisa | B | TROCAR |
| openaiService.js:33 (`riskLevel` do exame) | GPT decide | nenhuma | — | — | — | — | Sem fonte e, pela R2, não vai ao paciente | — | REMOVER |
| openaiService.js:29 (`summary` "para o paciente") | GPT escreve | — | — | — | — | o resumo para o paciente cita só "dentro/fora da faixa normal", sem doença | R2 | — | TROCAR (instrução do prompt) |

---

## Resumo final

### Ficou com fonte

- **Faixas do paciente:** FC 60–100 e SpO₂ ≥ 95 (Guyton, página a conferir); PA normal
  < 120/80 e meta < 130/80 (**SBC 2025**, não a de 2020 que está no código); IMC 18,5–24,9
  (OMS); 150 min/semana (OMS 2020 + Guia do MS 2021); parar de fumar (PCDT 2020, URL do
  código está quebrada); álcool sem limite seguro (OMS 2023 + INCA 2024); glicemia de
  jejum < 100 e HbA1c < 5,7 só para exame de laboratório (SBD 2024).
- **Alarmes:** todos ficam, com fonte: SpO₂ < 90 (OMS), FC ≥ 150 (AHA), glicemia > 250
  (MS, **era 350**), alertas de PA nos estágios da SBC 2025, SpO₂ < 92 e < 95 (NEWS2 e
  Guyton), perda de peso ≥ 5% em 6 meses (GLIM).
- **Oncologia:** sangramento fora da menstruação (QCancer, C, separado em dois);
  "nunca fumou" × 0,33 e fumo atual × 3,08 / ex × 1,52 (RHC + PNS, B); ovário na família
  × 1,24 (registro sueco, B); pele da mama vira regra direta do NICE.
- **Crônicas:** prior com fonte para 7 das 8 (EPISONO 4, PNS-HbA1c, ELSA, PNS 2013,
  PNS 2019, ELSA-FA, PLATINO); escores validados no lugar dos itens: STOP-Bang (A/B),
  FINDRISC (B), PHQ-9 total (A); hipotireoidismo com C (Canaris); DPOC com B (Holleman).
- **Exames:** glicemia, HbA1c, lipídeos (SBC 2025), hemoglobina; o resto pela faixa do
  próprio laudo.

### Deve sair

- Metas: água 2 L (o Guia Alimentar do MS diz que varia), 7000 passos, sono 7–9 h,
  PA < 125, glicemia < 110 e < 130, "nova triagem em 7 dias" (o builder já tirou).
  Temperatura "até 37,4 / febre ≥ 37,5" e "alerta após 4 h sem movimento" na tela de
  referência da médica.
- Toda a conversão de número da pulseira em sintoma (`wearableEvidence.toBayesianEvidence`).
- `HIP_ESTIMATIVA_ONCO`, os 4 fatores de maços-ano (trocados por 2) e os 5 de anos sem
  fumar (consequência), o "piso" da pele da mama.
- **Condições inteiras:** CV/HAS (**condição sem fonte: remover do motor**), síndrome
  metabólica e arritmia/FA (têm prior com fonte, mas nenhuma evidência com fonte).
- Os ~60 LRs de itens soltos de AOS, DM2, depressão, FA, DPOC e síndrome metabólica sem
  fonte; o "Framingham simplificado"; as frases "~95% / ~75% / ~45% / ~18%" do PHQ-9;
  o `riskLevel` e o "crítico" livre do GPT nos exames.
- **Pendente de fonte (não resolvi):** os cortes CRITICAL/HIGH/MODERATE/LOW do motor
  crônico (`bayes.js:47-51`). Proposta: decidir o próximo passo pelos cortes oficiais dos
  escores (STOP-Bang ≥ 3, FINDRISC ≥ 15, PHQ-9 ≥ 10).

### Impacto esperado nas personas (estimativa minha, à mão; rodar o motor para confirmar)

- **João (58 anos, IMC 31,7, hoje CRITICAL por diabetes):** sai do CRITICAL. O CRITICAL
  vem dos LRs sem fonte de poliúria (11), polidipsia (10) e glicemia alterada (10), que
  saem. Com prior 0,126 (PNS, 45–59) e FINDRISC 23 pontos (≥ 9, LR 3,4), o DM2 fica perto
  de **33%**. A condição mais alta passa a ser a AOS: prior de homem 50–59 de 0,476
  (EPISONO 4) e STOP-Bang 6 (≥ 5, LR 2,14) dão perto de **66% (HIGH)**; com o LR de ≥ 3 da
  população geral (1,52), perto de 58% (MODERATE); com o prior de IAH ≥ 15 (19,4%), perto
  de 34%. Em qualquer caso o próximo passo dele é "Agendar consulta", não emergência
  (glicemia média 184 fica abaixo do novo alarme de 250). **O roteiro da demo que diz
  "João CRITICAL por diabetes" precisa mudar.** Detalhe: o João responde "tenho diabetes",
  e o motor de DM2 hoje ignora essa resposta; vale a médica ver "diagnóstico relatado" em
  vez de uma probabilidade.
- **Roberto (63 anos):** o INVESTIGAR colorretal (o que o seed confere) não muda. Pulmão
  cai de ~1,6% para ~1,1% (ainda ATENÇÃO). O HIGH do relatório vem da oncologia; a parte
  crônica perde o LR 11,7 da perda de peso no DM2 e o LR 3,4 do fumo no DPOC.
- **Marina (34 anos, IMC 25,4):** a ATENÇÃO de mama (mãe aos 41, × 2,2) não muda. Na parte
  crônica, a glicemia alterada perde o LR 10 e o prior do DM2 cai de 0,13 para 0,035 (PNS,
  30–44 anos); com FINDRISC 6 (abaixo de 9, LR− 0,29), o DM2 fica perto de 1%, e o hipotireoidismo (prior de mulher 0,113 com ganho de peso,
  LR 2,4, C) fica perto de 20–23% antes dos "não". A crônica dela deve cair para LOW ou
  INCONCLUSIVE; o próximo passo continua "Agendar consulta" pela mama.
