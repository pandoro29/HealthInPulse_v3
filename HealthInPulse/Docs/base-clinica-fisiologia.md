# Base clínica de fisiologia: faixas normais, metas e alarmes

> Padrões normais que o app usa para comparar os dados da pessoa, metas de hábito e
> limiares de alarme. **Não é diagnóstico.** Regra R1 do projeto: todo número aqui tem
> fonte do mesmo nível do Guyton & Hall (livro-texto, diretriz oficial ou base oficial).

Este arquivo substitui o `Docs/Dados do Livro.docx`. Pesquisa de 22/10/2026. A proposta
de aplicação no código, linha a linha, ficou num documento de trabalho separado.

Confiança: **A** = diretriz, base oficial ou livro, com o número conferido no documento;
**B** = mesmo nível de fonte, mas com adaptação (outro aparelho, outra população) ou com o
número visto só em reprodução ou resumo; **C** = estudo pequeno ou derivação indireta.

## 1. Guyton & Hall: como os valores foram extraídos

- **Livro:** Hall JE, Hall ME. *Guyton & Hall: Tratado de Fisiologia Médica*. Elsevier.
  **Edição: a conferir.** Ninguém do grupo registrou qual edição foi usada.
- **Como foi feito:** o grupo passou o PDF do livro para uma IA, que leu e devolveu os
  valores. O único registro é o `Dados do Livro.docx`, que cita a **página do PDF**, não a
  página impressa, e não cita capítulo para todos os valores.
- **O que esta revisão fez:** não há PDF do livro nesta máquina (procurei no disco
  inteiro), então **nenhum valor do Guyton foi conferido no livro** nesta revisão. As fichas
  abaixo repetem o que a IA extraiu, com o trecho do docx. Para fechar cada ficha falta:
  edição, capítulo, página impressa e o trecho literal do livro.
- **O que do docx não entra:** as frases que não são do livro e sugerem regra própria:
  "a definição de febre pode variar levemente na prática clínica (geralmente ≥ 37,5–38 °C)"
  e "você pode definir regras próprias no seu sistema (ex: inatividade prolongada)".

### Ficha G1. Temperatura corporal normal: 37,0 °C

| Campo | Valor |
|---|---|
| Valor | 37,0 °C (valor normal) |
| Livro | Guyton & Hall, Tratado de Fisiologia Médica (edição a conferir) |
| Capítulo | 74, "Regulação da temperatura corporal e febre" (nas edições recentes em inglês o capítulo 74 é *Body Temperature Regulation and Fever*; a MedlinePlus cita assim a 14ª edição) |
| Página do PDF | ~2626 (capítulo 74) e 53 (tabela com 37,0 °C) |
| Página impressa | a conferir |
| Trecho (docx) | "Temperatura: capítulo 74, por volta da página 2626 do PDF. O livro trata temperaturas corporais normais, controle da temperatura e febre. Também há uma tabela na página 53 com temperatura corporal 37,0 °C como valor normal." |
| Extração | Extraído por IA a partir do PDF; edição e página impressa a conferir |
| Uso no app | Valor de referência na tela da médica. **Sem faixa e sem limiar de febre**: o docx não traz nenhum dos dois como valor do livro, e a pulseira mede pele, não temperatura central |
| Conferir no livro | A página 53 do PDF provavelmente é a tabela de constituintes do líquido extracelular do capítulo 1; o capítulo 74 deve trazer a variação normal da temperatura oral. Se trouxer, a faixa entra com a página impressa |

### Ficha G2. Frequência cardíaca de exemplo: 72 bpm

| Campo | Valor |
|---|---|
| Valor | 72 batimentos/min |
| Livro | idem |
| Capítulo | a conferir (fisiologia do músculo cardíaco) |
| Página do PDF | 357–358 e 413 |
| Trecho (docx) | "páginas 357-358 e 413 mostram 72 batimentos/min como frequência cardíaca normal usada no exemplo fisiológico" |
| Extração | Extraído por IA a partir do PDF; edição e página impressa a conferir |
| Uso no app | **Nenhum limiar.** É exemplo fisiológico, não limite: "O valor de 72 bpm é usado como exemplo fisiológico padrão, não como limite fixo" (docx) |

### Ficha G3. Frequência cardíaca de repouso no adulto: 60 a 100 bpm

| Campo | Valor |
|---|---|
| Valor | taquicardia acima de 100 bpm; bradicardia abaixo de 60 bpm (adulto) → faixa normal 60–100 bpm |
| Livro | idem |
| Capítulo | a conferir (provavelmente o de arritmias cardíacas e sua interpretação eletrocardiográfica) |
| Página do PDF | 474–475 |
| Trecho (docx) | "Nas páginas 474-475, o livro define taquicardia como acima de 100 batimentos/min no adulto e bradicardia como menos de 60 batimentos/min." |
| Extração | Extraído por IA a partir do PDF; edição e página impressa a conferir |
| Uso no app | Faixa normal de FC de repouso (`prevention.js`, `FC_REPOUSO`); meta "frequência cardíaca de repouso entre 60 e 100" quando a média passa de 100 |
| Ressalva | FC abaixo de 60 é comum em quem treina; mostrar "abaixo da faixa" não deve virar meta |
| Conf. | B até conferir a página impressa |

### Ficha G4. Saturação arterial de O₂: 95% a 99%

| Campo | Valor |
|---|---|
| Valor | SatO₂ arterial 98%; faixa 95%–99% |
| Livro | idem |
| Capítulo | a conferir (tabela de gases sanguíneos; transporte de O₂ e CO₂ no sangue) |
| Página do PDF | 3135 (tabela); 1480 e 1647 (saturação da hemoglobina) |
| Trecho (docx) | "página 3135 traz tabela de gases sanguíneos com Sat O2 arterial 98% e faixa 95%-99%. Também há referências à saturação da hemoglobina com oxigênio nas páginas 1480 e 1647." |
| Extração | Extraído por IA a partir do PDF; edição e página impressa a conferir |
| Uso no app | Limite inferior da faixa normal: SpO₂ ≥ 95%. **Sem limite superior**: a faixa é de gasometria arterial, e 100% no oxímetro de pulso é leitura normal |
| Conferir no livro | Se o texto do capítulo de transporte de O₂ der outra média para o sangue arterial, registrar as duas |
| Conf. | B até conferir |

### Ficha G5. Movimento

| Campo | Valor |
|---|---|
| Valor | nenhum |
| Trecho (docx) | "o livro fala de movimento em contexto fisiológico e neuromuscular, mas não achei uma regra pronta de negócio tipo sem movimento por X" |
| Uso no app | Nenhum. O "alerta após 4 h sem variação" da tela de referência da médica é regra própria e sai |

### O que o Guyton não sustenta

Pressão arterial, glicemia, IMC, atividade física, sono, água e passos não vêm do livro.
Os que têm fonte do mesmo nível estão na seção 2; os outros ficam de fora.

## 2. Outras fontes do mesmo nível

### F1. Pressão arterial (SBC, SBH e SBN, 2025)

- **Fonte:** Brandão AA, Rodrigues CIS, Bortolotto LA, Nadruz W, et al. Diretriz Brasileira
  de Hipertensão Arterial – 2025. Arq Bras Cardiol. 2025;122(9):e20250624. DOI
  10.36660/abc.20250624. https://abccardiol.org/article/diretriz-brasileira-de-hipertensao-arterial-2025/
  (PDF lido). Substitui a diretriz de 2020.
- **Classificação no consultório, ≥ 18 anos (Quadro 3.2, p. 36):**

  | Classificação | PAS (mmHg) | | PAD (mmHg) |
  |---|---|---|---|
  | PA normal | < 120 | e | < 80 |
  | Pré-hipertensão | 120–139 | e/ou | 80–89 |
  | HA estágio 1 | 140–159 | e/ou | 90–99 |
  | HA estágio 2 | 160–179 | e/ou | 100–109 |
  | HA estágio 3 | ≥ 180 | e/ou | ≥ 110 |

- **Fora do consultório (Quadro 3.4, p. 37):** MRPA ≥ 130 e/ou ≥ 80; MAPA 24 h ≥ 130/80;
  vigília ≥ 135/85; sono ≥ 120/70.
- **Meta (p. 26):** "Recomenda-se a meta de PA < 130/80 mmHg para os pacientes com HA
  independentemente de o risco CV ser baixo, moderado ou alto" (forte).
- **Elevação importante (p. 98):** "PAS ≥ 180 e/ou PAD ≥ 110 mmHg"; é emergência quando há
  lesão aguda de órgão-alvo.
- **Pulseira (p. 129):** "muitos dispositivos sem manguito ainda não possuem validação
  suficiente para uso clínico".
- **Uso no app:** faixa normal < 120/80; meta "abaixo de 130/80" quando a média da pulseira
  passa de 130/80, levando a "Agendar consulta para confirmar"; alertas da pulseira nos
  estágios 1 e 2. Conf. A para os limiares, B para a medida da pulseira.

### F2. Glicemia e HbA1c (SBD, 2024)

- **Fonte:** Rodacki M, Cobas RA, Zajdenverg L, Silva Júnior WS, Giacaglia L, Calliari LE,
  et al. Diagnóstico de diabetes mellitus. Diretriz Oficial da Sociedade Brasileira de
  Diabetes (2024). DOI 10.29327/5412848.2024-1.
  https://diretriz.diabetes.org.br/diagnostico-de-diabetes-mellitus/
- **Valores (Tabela 1):** glicemia de jejum (8 a 12 h) normal < 100 mg/dL, pré-diabetes
  100–125, diabetes ≥ 126; TOTG 2 h < 140 / 140–199 / ≥ 200; HbA1c < 5,7% / 5,7–6,4 /
  ≥ 6,5. Glicemia ao acaso ≥ 200 mg/dL só conta **com** sintomas típicos.
- **Uso no app:** só para glicemia de exame em jejum. A glicemia da pulseira não tem faixa
  normal com fonte (não se sabe se é jejum). Conf. A.
- **Não usar no paciente:** as metas de quem já tem diabetes (80–130 mg/dL em jejum,
  < 180 após comer; SBD, "Metas no tratamento do diabetes", DOI 10.29327/557753.2022-3) são
  da médica.

### F3. Índice de massa corporal (OMS)

- **Fonte:** World Health Organization. Obesity: preventing and managing the global
  epidemic. Report of a WHO consultation. WHO Technical Report Series 894. Geneva: WHO; 2000.
  https://iris.who.int/handle/10665/42330. Ficha atual da OMS ("Obesity and overweight",
  07/10/2026): "overweight is a BMI greater than or equal to 25"; "obesity is a BMI greater
  than or equal to 30".
- **Valor:** normal 18,5–24,9 kg/m². Conf. A.
- **A conferir:** para 60 anos ou mais, o Ministério da Saúde (Norma Técnica do SISVAN,
  2011, classificação de Lipschitz) usa eutrofia entre 22 e 27 kg/m². Só vi isso em fonte
  secundária; até conferir, não gerar meta de IMC acima dos 60 anos.

### F4. Atividade física (OMS 2020 e Ministério da Saúde 2021)

- **Fontes:** WHO. WHO guidelines on physical activity and sedentary behaviour. Geneva:
  WHO; 2020. ISBN 9789240015128. https://www.who.int/publications/i/item/9789240015128 ·
  Brasil. Ministério da Saúde. Guia de Atividade Física para a População Brasileira.
  Brasília: MS; 2021. Capítulo de adultos: Ritti-Dias RM et al. Rev Bras Ativ Fís Saúde.
  2021;26:e0215, DOI 10.12820/rbafs.26e0215 ("recomenda-se que os adultos acumulem entre 150
  e 300 minutos de AF por semana com intensidade moderada e/ou entre 75 e 150 minutos por
  semana de intensidade vigorosa"). Idosos: Coelho-Ravagnani CF et al. RBAFS
  2021;26:e0216, DOI 10.12820/rbafs.26e0216 ("um mínimo de 150 minutos por semana de AF de
  intensidade moderada, ou 75 minutos de intensidade vigorosa").
- **Valor:** 150 min/semana de atividade moderada (ou 75 vigorosa). Conf. A.
- **Passos por dia:** nem a OMS nem o MS dão número de passos. A meta-análise de Ding D et
  al. (Lancet Public Health. 2025;10(8):e668–e681, DOI 10.1016/S2468-2667(25)00164-1) diz
  que "7000 steps per day is associated with clinically meaningful improvements in health
  outcomes". É estudo, não diretriz: no máximo meta complementar, conf. B.

### F5. Tabagismo (Ministério da Saúde, 2020)

- **Fonte:** Brasil. Ministério da Saúde. Portaria Conjunta SAES/SCTIE nº 10, de 16 de abril
  de 2020: Protocolo Clínico e Diretrizes Terapêuticas do Tabagismo.
  https://www.gov.br/conitec/pt-br/midias/protocolos/pcdt_tabagismo.pdf
- **Trechos:** a abordagem breve "É indicada para todos os fumantes"; "O desfecho esperado é
  a cessação total do tabagismo"; no tratamento, "Quatro sessões iniciais, preferencialmente
  semanais".
- **Uso no app:** meta "parar de fumar". Se a meta tiver contagem, o 4 com fonte é o das
  sessões iniciais, não "4 semanas sem cigarro". Conf. A.

### F6. Álcool (OMS 2023 e INCA 2024)

- **Fontes:** Anderson BO, Berdzuli N, Ilbawi A, Kestel D, Kluge HP, Krech R, et al. Health
  and cancer risks associated with low levels of alcohol consumption. Lancet Public Health.
  2023;8(1):e6–e7. DOI 10.1016/S2468-2667(22)00317-6 (nota da OMS Europa, 04/01/2023:
  "there is no safe amount that does not affect health") · INCA. Posicionamento do Instituto
  Nacional de Câncer acerca das Bebidas Alcoólicas. Rio de Janeiro: INCA; 2024.
  https://ninho.inca.gov.br/jspui/bitstream/123456789/15987/1/posicionamento_do_inca_acerca_das_bebidas_alcoolicas.pdf
  ("não há limite seguro para o consumo da substância").
- **Valor:** **não existe limite oficial de doses.** A meta é "reduzir o álcool, quanto
  menos melhor", sem número. Conf. A.

### F7. Sono (opcional)

- **Fonte:** Watson NF, Badr MS, Belenky G, Bliwise DL, Buxton OM, Buysse D, et al.
  Recommended amount of sleep for a healthy adult: a joint consensus statement of the
  American Academy of Sleep Medicine and Sleep Research Society. J Clin Sleep Med.
  2015;11(6):591–592. DOI 10.5664/jcsm.4758.
- **Trecho:** "Adults should sleep 7 or more hours per night on a regular basis to promote
  optimal health." Vale para 18 a 60 anos. Não há teto de 9 h ("it is uncertain whether
  sleeping more than 9 hours per night is associated with health risk").
- **Valor:** ≥ 7 h. Não achei diretriz brasileira nem da OMS. O "7–9 h" vem da National
  Sleep Foundation, que não é sociedade médica: não entra. Conf. B.

### F8. Água (por que não há meta)

- **Fonte:** Brasil. Ministério da Saúde. Guia Alimentar para a População Brasileira. 2ª ed.
  Brasília: MS; 2014. p. 85.
- **Trecho:** "a quantidade de água que precisamos ingerir por dia é muito variável ... Para
  alguns, a ingestão de dois litros de água por dia pode ser suficiente; outros precisarão
  de três ou quatro litros ou mesmo mais". O guia orienta atender à sede.
- **Uso no app:** nenhuma meta numérica de água. Conf. A.

### F9. Lipídeos de exame (SBC, 2025)

- **Fonte:** Rached FH, et al. Diretriz Brasileira de Dislipidemias e Prevenção da
  Aterosclerose – 2025. Arq Bras Cardiol. 2025;122(9):e20250640. DOI 10.36660/abc.20250640.
  https://pmc.ncbi.nlm.nih.gov/articles/PMC12674852/
- **Valores (Tabela 3.1):** colesterol total < 190 mg/dL; triglicérides < 150 (jejum de 12 h)
  ou < 175 (sem jejum); HDL > 40. LDL e não-HDL não têm faixa única: o alvo depende da
  categoria de risco (LDL < 115 baixo, < 100 intermediário, < 70 alto, < 50 muito alto,
  < 40 extremo). Conf. A.

### F10. Hemoglobina (OMS, 2024)

Já está na base da oncologia (`WHO_HB_2024`): anemia com Hb < 13,0 g/dL no homem e < 12,0
g/dL na mulher não grávida, a partir dos 15 anos. Conf. A.

## 3. Limiares de alarme

Alarme nunca sai por falta de fonte; cada um ganhou fonte oficial.

| Alarme | Limiar | Fonte | Trecho | Conf. |
|---|---|---|---|---|
| Falta de oxigênio | SpO₂ < 90% | OMS, Clinical management of COVID-19: living guideline (2023; jun/2025). https://www.who.int/publications/i/item/WHO-2019-nCoV-Clinical-2023.2 | Doença grave em adulto: "SpO₂ < 90% on room air" (vi em material de treinamento da OMS que reproduz a definição) | B |
| Alerta alto de SpO₂ | SpO₂ ≤ 91% | Royal College of Physicians. National Early Warning Score (NEWS) 2. London: RCP; 2017. https://www.rcp.ac.uk/improving-care/resources/national-early-warning-score-news-2/ | SpO₂ ≤ 91% vale 3 pontos; "A single red score (indicating 3 in one parameter) ... should prompt a review by a clinician" | B |
| Alerta médio de SpO₂ | SpO₂ < 95% | Guyton (ficha G4) e NEWS2 (≤ 95 pontua) | Limite inferior da faixa normal | B |
| Taquicardia grave | FC ≥ 150 bpm | American Heart Association. Adult Tachyarrhythmia With a Pulse Algorithm (ACLS), 2025 AHA Guidelines for CPR and ECC | "Heart rate typically ≥150/min if tachyarrhythmia" (texto visto em índice de busca; o PDF bloqueou o download) | B |
| Glicemia muito alta | > 250 mg/dL | Brasil. Ministério da Saúde. Estratégias para o cuidado da pessoa com doença crônica: diabetes mellitus. Cadernos de Atenção Básica, n. 36. Brasília: MS; 2013. ISBN 978-85-334-2059-5 (PDF lido) | p. 67: "descompensação hiperglicêmica aguda, com glicemia casual superior a 250 mg/dl ... Essas complicações requerem ação imediata da pessoa, da família ou dos amigos, e do serviço de Saúde" | B |
| Pressão alta (alertas) | ≥ 140/90 (médio); ≥ 160/100 (alto) | SBC 2025 (F1) | Estágios 1 e 2, Quadro 3.2 | A (limiar) / B (pulseira) |
| Perda de peso na balança | queda ≥ 5% em 180 dias | Cederholm T, Jensen GL, Correia MITD, et al. GLIM criteria for the diagnosis of malnutrition. Clin Nutr. 2019;38(1):1–9. DOI 10.1016/j.clnu.2018.08.002 | Critério fenotípico GLIM: perda de peso não intencional > 5% em 6 meses (Tabela 1, não aberta; o resumo confirma o critério) | B |

**Sem alarme hoje, mas com fonte (decisão do dono):** pulso ≤ 40 (NEWS2, vermelho);
glicemia < 60 mg/dL (MS CAB 36, p. 67: "hipoglicemia, com glicemia casual inferior a 60
mg/dL ... requerem ação imediata"); PA ≥ 180 e/ou ≥ 110 (SBC 2025, p. 98).

## 4. Pendências

1. Edição, capítulo e página impressa de cada ficha do Guyton (G1 a G4).
2. PDF do Guia de Atividade Física do MS (o site deu erro 503 em 22/10; o número veio dos
   artigos oficiais dos capítulos).
3. Norma Técnica do SISVAN (IMC de idosos).
4. Tabela 1 do GLIM e a definição de gravidade da diretriz de COVID-19 da OMS, no documento
   original.
