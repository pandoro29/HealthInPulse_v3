# Base clínica oncológica: 5 cânceres

> Triagem de risco, **não diagnóstico**. Os números estimam a chance de alguém com aquele perfil receber o diagnóstico nos próximos 2 anos, para orientar conversa e rastreamento. Não substituem consulta nem exame.

Dados: `backend/src/services/clinical/data/oncology.js`. Teste de contrato: `backend/tests/kb.sources.test.js`.
Pesquisa feita em 19/10/2026; toda fonte tem URL e ano em `sources`.

## Como o modelo funciona

1. **Prior (risco de partida).** Probabilidade de diagnóstico em 2 anos ≈ 2 × incidência anual para a idade e o sexo. É a mesma definição usada pelos estudos CAPER, que embasam o NICE NG12.
   - A incidência por faixa de 5 anos vem do **GLOBOCAN 2022, Brasil** (IARC). O INCA não publica taxas por idade.
   - Cada curva é calibrada para a **taxa bruta nacional do INCA (Estimativa 2026, triênio 2026–2028)**, com o fator `bruta INCA ÷ bruta GLOBOCAN` do mesmo câncer e sexo. Assim o total bate com o número oficial brasileiro e a forma por idade vem do GLOBOCAN.
2. **Fatores de risco** (`PriorRule` RISK_FACTOR, `multiply`) multiplicam o prior. Perfil (idade, sexo, IMC, fumo, família, álcool, preventivo) entra **só aqui**.
3. **Sintomas, exames e a balança** entram só como likelihood: `logit(posterior) = logit(prior) + Σ ln LR`. O "sim" usa LR+ = pSx/pNoSx e o "não" usa LR− = (1−pSx)/(1−pNoSx).
4. **Derivação do LR.** Nos estudos caso-controle (CAPER), a fração de **casos** com o achado é a sensibilidade (pSx) e a fração de **controles** é 1 − especificidade (pNoSx). Quando o estudo só publica o VPP, vale `LR = odds(VPP) / odds(prior de referência do estudo)`. Exemplo: sangramento retal, VPP 2,4% sobre prior de 0,25%, dá 0,0246/0,0025 ≈ 9,8, igual ao LR 10 publicado.
5. **Categorias:** INVESTIGAR se P ≥ 3% (limiar do NICE NG12); ATENÇÃO se P ≥ 1% ou RR ≥ 2; senão ROTINA.

**Confiança.** A = estudo grande e direto, na população certa. B = estudo bom, mas com adaptação (outra população, proxy, corte diferente, calibração). C = poucos casos, dado não estimável ou estimativa da equipe: revisar com a médica.

## Tabela de parâmetros

### Prior (2 anos) por idade e sexo

| Parâmetro | Valor | População | Fonte | Como foi derivado | Conf. |
|---|---|---|---|---|---|
| Prior colorretal, homem | 0,0044% (30–39) a 0,51% (80+); 0,157% aos 60–64 | Brasil, H ≥30 | GLOBOCAN_2022_BR, INCA_ESTIMATIVA_2026 | 2 × taxa GLOBOCAN × 0,882 (25,16/28,53) | B |
| Prior colorretal, mulher | 0,009% (30–39) a 0,435% (80+) | Brasil, M ≥30 | idem | fator 0,918 (25,07/27,32) | B |
| Prior pulmão, homem | 0,0032% (40–44) a 0,386% (80+); 0,182% aos 65–69 | Brasil, H ≥40 | idem | fator 0,765 (17,95/23,46) | B |
| Prior pulmão, mulher | 0,0062% (40–44) a 0,21% (80+) | Brasil, M ≥40 | idem | fator 0,855 (15,14/17,71) | B |
| Prior mama | 0,029% (25–29) a 0,469% (80+); 0,103% aos 35–39 | Brasil, M ≥25 | idem | fator 0,828 (71,57/86,41) | B |
| Prior próstata | 0,0095% (40–49) a 1,25% (80+); 0,583% aos 60–64 | Brasil, H ≥40 | idem | fator 0,770 (74,62/96,96). Inclui tumores achados por PSA | B |
| Prior colo do útero | 0,014% (25–29) a 0,10% (80+) | Brasil, M ≥25 | idem | fator 1,030 (17,59/17,07) | B |
| `basePrior` (sem idade ou sexo) | 2 × taxa bruta INCA: CCR 0,050%; pulmão 0,033%; mama 0,143%; próstata 0,149%; colo 0,035% | Brasil | INCA_ESTIMATIVA_2026 | Usado só se nenhuma faixa casar | B |

Faixas completas (taxa GLOBOCAN por 100 mil/ano → prior em 2 anos já calibrado):

| Câncer | Sexo | Calibração | Faixas |
|---|---|---|---|
| Colorretal | H | 0,882 | 30–39: 2,5 → 0,0044% · 40–44: 10,7 → 0,0189% · 45–49: 21,6 → 0,0381% · 50–54: 38,3 → 0,0676% · 55–59: 61,1 → 0,108% · 60–64: 88,9 → 0,157% · 65–69: 121,3 → 0,214% · 70–74: 160,2 → 0,283% · 75–79: 207,2 → 0,365% · 80+: 289,3 → 0,51% |
| Colorretal | M | 0,918 | 30–39: 4,9 → 0,0090% · 40–44: 13 → 0,0239% · 45–49: 22,3 → 0,0409% · 50–54: 33,9 → 0,0622% · 55–59: 47,8 → 0,0877% · 60–64: 63,9 → 0,117% · 65–69: 83,8 → 0,154% · 70–74: 112,7 → 0,207% · 75–79: 153,4 → 0,282% · 80+: 236,9 → 0,435% |
| Pulmão | H | 0,765 | 40–44: 2,1 → 0,0032% · 45–49: 8,3 → 0,0127% · 50–54: 22 → 0,0337% · 55–59: 45,4 → 0,0695% · 60–64: 79 → 0,121% · 65–69: 119,2 → 0,182% · 70–74: 159,1 → 0,243% · 75–79: 197,8 → 0,303% · 80+: 252,3 → 0,386% |
| Pulmão | M | 0,855 | 40–44: 3,6 → 0,0062% · 45–49: 10,2 → 0,0174% · 50–54: 21,2 → 0,0362% · 55–59: 35,6 → 0,0609% · 60–64: 52,8 → 0,0903% · 65–69: 70,9 → 0,121% · 70–74: 87,3 → 0,149% · 75–79: 102,5 → 0,175% · 80+: 123 → 0,21% |
| Mama | M | 0,828 | 25–29: 17,4 → 0,0288% · 30–34: 36,3 → 0,0601% · 35–39: 61,9 → 0,103% · 40–44: 92,3 → 0,153% · 45–49: 127,2 → 0,211% · 50–54: 161,9 → 0,268% · 55–59: 191,9 → 0,318% · 60–64: 218,4 → 0,362% · 65–69: 239,5 → 0,397% · 70–74: 256,7 → 0,425% · 75–79: 270,2 → 0,448% · 80+: 282,9 → 0,469% |
| Próstata | H | 0,770 | 40–49: 6,2 → 0,0095% · 50–54: 81,2 → 0,125% · 55–59: 202,2 → 0,311% · 60–64: 378,7 → 0,583% · 65–69: 569,5 → 0,877% · 70–74: 718,8 → 1,11% · 75–79: 801,1 → 1,23% · 80+: 812,6 → 1,25% |
| Colo do útero | M | 1,030 | 25–29: 7 → 0,0144% · 30–34: 12,1 → 0,0249% · 35–39: 16,9 → 0,0348% · 40–44: 21,1 → 0,0435% · 45–49: 25,1 → 0,0517% · 50–54: 29,3 → 0,0604% · 55–59: 33,9 → 0,0699% · 60–64: 38,2 → 0,0787% · 65–69: 42,2 → 0,087% · 70–74: 45,3 → 0,0934% · 75–79: 47,4 → 0,0977% · 80+: 48,5 → 0,1% |

Faixas de 80 anos ou mais juntam 80–84 e 85+, ponderadas pela população. As faixas jovens do GLOBOCAN têm ruído de modelagem (ex.: CCR em homens de 30–34 anos sai menor que de 25–29), por isso 30–39 é uma faixa só.

### Fatores de risco (multiplicam o prior)

| Parâmetro | Valor | População | Fonte | Como foi derivado | Conf. |
|---|---|---|---|---|---|
| CCR: parente de 1º grau com CCR | × 2,24 | meta-análise, 47 estudos | BUTTERWORTH_2006 | RR agrupado (2,06–2,43) | A |
| CCR: obesidade (IMC ≥ 30) | × 1,33 | 41 coortes | MA_2013 | RR obeso vs normal | A |
| CCR: álcool 15–27 doses/semana | × 1,21 | 61 estudos | FEDIRKO_2011 | RR do consumo "moderado" (2–3 doses/dia) | B |
| CCR: álcool ≥ 28 doses/semana | × 1,52 | idem | FEDIRKO_2011 | RR do consumo "pesado" (≥ 4 doses/dia) | B |
| Pulmão: nunca fumou | × 0,27 | Brasil | CONSENSO_PULMAO_BR_2024 | >85% dos casos vêm do fumo; com ~55–60% de nunca fumantes entre adultos ≥ 40 (valor assumido), taxa relativa ≈ 0,15/0,57 ≈ 0,27 da média | C |
| Pulmão: < 10 / 10–19 / 20–39 / ≥ 40 maços-ano | × 1,1 / 2,2 / 3,8 / 5,4 | fumantes | GANDINI_2008, TINDLE_2018 | RR vs nunca fumante (≈ 4 / 8 / 14 / 20; Gandini: atual 8,96; Tindle: fumante pesado ≈ 20) ÷ 3,7 (média da população = 1/0,27) | C |
| Pulmão: parou há 1–4 / 5–9 / 10–14 / 15–24 / ≥ 25 anos | × 0,61 / 0,59 / 0,39 / 0,30 / 0,19 | ex-fumantes pesados | TINDLE_2018 | HR do ex-fumante (12,1 / 11,8 / 7,8 / 5,9 / 3,85) ÷ HR do fumante atual (12,1/0,609 ≈ 19,9) | B |
| Pulmão: parente de 1º grau | × 1,5 | nunca fumantes, 11 estudos | MATAKIDOU_2005 | RR em nunca fumantes (1,51), para não contar o fumo da família duas vezes | B |
| Mama: mãe/irmã/filha, mulher < 50 | × 2,2 | 52 estudos, 58 mil casos | COLLAB_FAMILIAL_2001 | Incidência acumulada até 50 anos: 3,7% (1 parente) ÷ 1,7% (nenhum) | A |
| Mama: mãe/irmã/filha, mulher ≥ 50 | × 1,7 | idem | COLLAB_FAMILIAL_2001 | Até 80 anos: 13,3% ÷ 7,8% (o RR geral é 1,80) | B |
| Mama: parente com câncer de ovário | × 1,3 | caso-controle (CASH) | CLAUS_1993 | Risco na vida ≈ 13% vs ≈ 10% assumido para a população da época | C |
| Mama: álcool 8–14 / ≥ 15 doses/semana | × 1,15 / 1,3 | 53 estudos | HAMAJIMA_2002 | +7,1% a cada 10 g/dia, com dose de 14 g (≈ 16–28 g/dia e ≥ 30 g/dia; 35–44 g/dia = 1,32) | B |
| Mama: IMC ≥ 30 após 50 anos | × 1,15 | coortes prospectivas | RENEHAN_2008 | RR 1,12 a cada +5 kg/m² na pós-menopausa, obesa vs ~25 | B |
| Próstata: pai/irmão, homem < 65 | × 2,87 | 33 estudos | KICINSKI_2011 | RR < 65 anos | A |
| Próstata: pai/irmão, homem ≥ 65 | × 1,92 | idem | KICINSKI_2011 | RR ≥ 65 anos | A |
| Colo: preventivo/HPV atrasado | × 1,96 | Suécia (auditoria nacional) + Brasil | ANDRAE_2008, PNS_2019_PAP | OR 2,52 vs em dia; relativo à média brasileira com 81,3% em dia: 2,52/(0,813 + 0,187 × 2,52) | B |
| Colo: preventivo/HPV em dia | × 0,78 | idem | idem | 1/(0,813 + 0,187 × 2,52) | B |
| Colo: fuma atualmente / ex-fumante | × 1,6 / 1,12 | 23 estudos | IARC_COLO_TABACO_2006 | RR do carcinoma escamoso (a maioria dos casos); adenocarcinoma não tem relação | B |

**Pulmão e colo usam fatores relativos à média.** O prior do GLOBOCAN é a média da população, que mistura fumantes e não fumantes (e mulheres com e sem preventivo). Quando o efeito é grande, multiplicar a média pelo RR "vs nunca fumante" contaria o fumo duas vezes. Por isso o fator é dividido pelo multiplicador médio, e campo não respondido fica na média (× 1). Nos outros fatores o expostos são poucos (≤ 10–25% da população) e o efeito é pequeno, então o erro de usar o RR direto fica abaixo de 10%.

### Sintomas, exames e balança (likelihood)

| Parâmetro | pSx / pNoSx (LR+) | População | Fonte | Como foi derivado | Conf. |
|---|---|---|---|---|---|
| CCR: sangramento retal | 0,424 / 0,042 (10,1) | CAPER, ≥ 40 anos | HAMILTON_CCR_2005 | 148/349 casos vs 73/1.744 controles | A |
| CCR: mudança do hábito intestinal | 0,378 / 0,098 (3,86) | idem | HAMILTON_CCR_2005 | Proxy: "diarreia" (132/349 vs 171/1.744). A pergunta descreve fezes mais soltas ou mais idas ao banheiro | B |
| CCR: dor abdominal persistente | 0,424 / 0,094 (4,51) | idem | HAMILTON_CCR_2005 | 148/349 vs 163/1.744 | A |
| CCR: perda de peso relatada | 0,269 / 0,053 (5,08) | idem | HAMILTON_CCR_2005 | 94/349 vs 92/1.744 | A |
| CCR: perda de peso na balança | 0,269 / 0,053 (5,08) | idem | HAMILTON_CCR_2005 | Mesmo LR; regra da balança: queda ≥ 5% em até 180 dias | B |
| CCR: FIT positivo | 0,79 / 0,06 (13,17) | 19 estudos, assintomáticos | LEE_FIT_2014 | sens 0,79; esp 0,94 | A |
| CCR: anemia (Hb < 13 H / < 12 M) | 0,272 / 0,052 (5,23) | CAPER | HAMILTON_CCR_2005, WHO_HB_2024 | Soma das faixas Hb < 13 g/dL: 95/349 vs 90/1.744. Corte por sexo da OMS 2024 | B |
| Pulmão: hemoptise | 0,20 / 0,015 (13,33) | CAPER pulmão, ≥ 40 anos, controles pareados por idade | HAMILTON_CAPER_2009 | 20% dos casos vs 1,5% dos controles; LR 13 (VPP 2,4% sobre prior de 0,18%). O LR 25,3 de Jones 2007 **não** foi usado: vem de uma coorte a partir dos 15 anos, com janela de 3 anos, e por isso já embute a idade no LR. Como a idade já entra no prior, a idade contaria duas vezes | B |
| Pulmão: tosse > 3 semanas | 0,146 / 0,091 (1,6) | população geral ≥ 40 | HAASTRUP_2020 | Tosse > 4 semanas: 6/41 casos; LR+ 1,6 | C |
| Pulmão: falta de ar nova | 0,171 / 0,081 (2,11) | idem | HAASTRUP_2020 | 7/41 casos; LR+ 2,1 | C |
| Pulmão: rouquidão persistente | 0,098 / 0,038 (2,58) | idem | HAASTRUP_2020 | 4/41 casos; LR+ 2,6 (IC 1,0–6,6) | C |
| Pulmão: perda de peso (relatada ou balança) | 0,27 / 0,045 (6,0) | CAPER pulmão | HAMILTON_CAPER_2009 | 27% dos casos; LR 6 | B |
| Mama: nódulo | 0,441 / 0,008 (55,13) | CPRD, ≥ 40 anos | WALKER_2014 | 1.762/3.994 vs 132/16.873 | A |
| Mama: alteração no mamilo | 0,0203 / 0,00142 (14,3) | idem | WALKER_2014 | Retração + secreção: 81/3.994 vs 24/16.873 | B |
| Mama: alteração na pele | 0,001 / 0,00007 (14,29) | idem | WALKER_2014 | 3 casos e 0 controles: LR não estimável (Haldane daria ~30, com IC enorme). Adotado o LR do mamilo como piso | C |
| Mama: BI-RADS 4–5 | 0,869 / 0,013 (66,85) | BCSC, 1,7 milhão de mamografias de rastreamento | LEHMAN_2017, ACR_BIRADS_2013 | LR = odds(VPP2 25,6%) / odds(prior 0,51%, detecção 5,1/1.000) = 0,344/0,00513 ≈ 67; pSx = sensibilidade 86,9%, pNoSx = 0,869/67. O ACR BI-RADS 2013 define a categoria 4 como > 2% e a 5 como ≥ 95% de malignidade. A versão anterior usava a mamografia diagnóstica (Sprague 2017, LR 9,2), cujo prior (3,5%) não é o da população | B |
| Próstata: urinar mais vezes (inclusive à noite) | 0,47 / 0,071 (6,62) | CAPER próstata | HAMILTON_PROSTATA_2006 | Polaciúria (frequência): 102/217 vs 77/1.080. Noctúria sozinha dá LR 6,4 (63/217 vs 49/1.080); o estudo não publica as duas juntas, então fica o LR da frequência. A pergunta ficou restrita a frequência/noctúria, que é o que o CAPER mediu (jato fraco não foi medido). Parte do LR vem de PSA pedido por causa do sintoma (viés de detecção) | B |
| Próstata: sangue na urina | 0,152 / 0,05 (3,04) | idem | HAMILTON_PROSTATA_2006 | 33/217 vs 54/1.080 | B |
| Próstata: PSA acima do limite da idade | 0,205 / 0,062 (3,31) | PCPT, biópsia em todos | THOMPSON_PCPT_2005, OESTERLING_1993 | Corte 4,0 ng/mL: sens 20,5%, esp 93,8%. Aplicado ao limite por idade de Oesterling (2,5/3,5/4,5/6,5) | B |
| Colo: sangramento pós-coito | 0,11 / 0,05 (2,2) | revisão sistemática | SHAPLEY_2006 | 11% dos casos têm o sintoma; incidência anual na comunidade 3,4–7,2% entre 25 e 54 anos (~5%) | C |
| Colo: sangramento fora da menstruação | 0,20 / 0,08 (2,5) | n/a | HIP_ESTIMATIVA_ONCO | Nenhum número publicado encontrado. Estimativa conservadora da mesma ordem do pós-coito | C |
| Colo: Papanicolau alterado (ASC-US+) | 0,625 / 0,034 (18,38) | Cochrane, 40 estudos | KOLIOPOULOS_2017 | Citologia convencional; desfecho CIN2+ (inclui lesão precursora) | B |
| Colo: HPV de alto risco | 0,899 / 0,101 (8,9) | idem | KOLIOPOULOS_2017 | HC2; desfecho CIN2+ | B |

Sintomas **compartilhados** com a fase crônica: `perda_peso_inexplicada` e `rouquidao` usam o mesmo código de `matrix.js`. A pessoa responde uma vez e a resposta vale para as duas fases (o `assemble` do kb junta os painéis). Os demais códigos são novos.

### Exames: limites usados (`LabRule`)

| Regra | Limite | Fonte |
|---|---|---|
| FIT positivo | resultado "positivo" (validade 365 dias) | LEE_FIT_2014 |
| Anemia | Hb < 13,0 g/dL (H) · < 12,0 g/dL (M), validade 180 dias | WHO_HB_2024 |
| BI-RADS | ≥ 4 (4A/4B/4C contam como 4) | ACR_BIRADS_2013, LEHMAN_2017 |
| PSA | > 2,5 (40–49) · > 3,5 (50–59) · > 4,5 (60–69) · > 6,5 (≥ 70) ng/mL | OESTERLING_1993 |
| Papanicolau | "alterado" (ASC-US ou pior), validade 3 anos | KOLIOPOULOS_2017 |
| DNA-HPV | "detectado/positivo", validade 5 anos | KOLIOPOULOS_2017 |

Todas emitem evidência negativa quando o exame vem normal (`emitNegative: true`).

## Rastreamento: diretrizes vigentes (outubro de 2026)

| Câncer | Recomendação | Tipo | Fonte (ano) | Mudou em 2024–26? |
|---|---|---|---|---|
| Colorretal | **50–75 anos, FIT a cada 2 anos** no SUS, para quem não tem sintomas; positivo → colonoscopia | POPULACIONAL | INCA, 10/08/2026 | **Sim (2026).** Antes não havia rastreamento colorretal organizado no SUS |
| Colorretal | 45–49: sociedades recomendam começar (USPSTF 2021; SBCP) | DECISÃO COMPARTILHADA | USPSTF 2021 | Não |
| Colorretal | Parente de 1º grau: colonoscopia a cada 5 anos a partir dos 40 (ou 10 anos antes do caso mais jovem) | ALTO RISCO | USMSTF 2017 | Não |
| Pulmão | 50–80 anos, fumante ou ex-fumante que parou há menos de 15 anos (`quitYears < 15`), ≥ 20 maços-ano: TC de baixa dose anual | ALTO RISCO | Consenso SBCT/SBPT/CBR, J Bras Pneumol 2024 | **Sim (2024)**, primeira recomendação brasileira. **Não** é programa do SUS; o INCA estuda a implantação |
| Mama | 50–74 anos: mamografia a cada 2 anos | POPULACIONAL | MS, set/2025 | **Sim (2025):** a faixa era 50–69 |
| Mama | 40–49 anos: mamografia sob demanda no SUS, com decisão compartilhada; SBM/CBR/Febrasgo recomendam anual de 40 a 74 | DECISÃO COMPARTILHADA | MS 2025; CBR/SBM/Febrasgo 2023 | **Sim (2025):** antes o MS não oferecia aos 40–49 |
| Mama | Risco ≥ 20% na vida (ex.: mãe ou irmã com câncer jovem): mamografia e RM anuais a partir de 10 anos antes do caso mais jovem, não antes dos 30. Ovário na família: aconselhamento genético | ALTO RISCO | CBR/SBM/Febrasgo 2023 | Atualização de 2023 |
| Colo do útero | **25–64 anos, DNA-HPV a cada 5 anos** após resultado negativo; onde o teste não chegou, Papanicolau a cada 3 anos | POPULACIONAL | Portaria Conjunta SAES/SECTICS nº 13, 29/07/2025 | **Sim (2025):** o DNA-HPV virou o exame primário; implantação gradual até o fim de 2026 |
| Próstata | MS/INCA **contra** rastreamento populacional; decisão compartilhada para quem tem fator de risco | DECISÃO COMPARTILHADA | Nota Técnica nº 9/2023 | Reafirmada em 2023 |
| Próstata | SBU: conversa individual a partir dos 50; aos 45 para homens negros ou com pai/irmão afetado; após 75 só com expectativa de vida > 10 anos | DECISÃO COMPARTILHADA | SBU (via CFM, 2018) | Não |

Diferenças em relação ao rascunho do plano:
- **Colorretal:** o plano dizia 45–75 com FIT ou colonoscopia. O programa oficial (2026) é **50–75 com FIT bienal**. Os 45–49 ficaram como decisão compartilhada.
- **Pulmão:** o consenso brasileiro fala em "mais de 20 maços-ano". A regra usa ≥ 20, como o USPSTF 2021. Para o tempo sem fumar, a regra usa `quitYears < 15`, igual ao consenso ("parou há menos de 15 anos"; para quem passou de 15 anos sem fumar, o rastreamento para).
- **Colorretal, alto risco:** a colonoscopia a partir dos 40 vale para parente de 1º grau diagnosticado antes dos 60 anos, ou para 2 ou mais parentes. O perfil não guarda a idade do parente, então o texto explica a condição e manda conversar com o médico nos outros casos.

## Personas (conferência com naive Bayes)

Calculado com os dados deste arquivo: `logit(prior) + Σ ln LR`.

| Persona | Resultado |
|---|---|
| Roberto, 63, H, ex-fumante de 35 maços-ano, parou há 8 anos; mudança do hábito intestinal, Hb 10,9, FIT+, perda de 9,5% do peso na balança | **Colorretal 68% → INVESTIGAR** (prior 0,157%). Com "não" para sangue nas fezes e dor: 45%. Pulmão: prior × 2,24, posterior 1,6% → ATENÇÃO. TC de baixa dose indicada |
| Marina, 38, M, mãe com câncer de mama aos 41, preventivo atrasado | **Mama RR 2,2 → ATENÇÃO** (0,23%). Colo RR 1,96 → ROTINA, com DNA-HPV indicado. Rastreamento de alto risco: mamografia anual a partir dos 31 (41 − 10), se a médica confirmar risco ≥ 20% |
| Mulher de 22 sem nada | Nenhum câncer elegível (idade mínima 25) → **tudo ROTINA** |
| Homem de 67 com hemoptise, fumo não informado | Pulmão 2,4% → **ATENÇÃO** (RR 13). Com "não" nas outras perguntas do teste rápido: 1,7%, ATENÇÃO |
| Mesmo homem, ex-fumante de 30 maços-ano que parou há 5 anos | Pulmão 5,2% → **INVESTIGAR**. Com "não" nas outras perguntas do teste rápido: 3,8%, INVESTIGAR. Se parou há 10 anos: 3,5% |
| Mesmo homem, nunca fumou (outras perguntas "não") | Pulmão 0,47%, RR 2,6 → ATENÇÃO |
| Mesmo homem, fumante atual de 30 maços-ano (outras perguntas "não") | Pulmão 6,3% → INVESTIGAR |
| Mulher com BI-RADS 4–5, sem outros dados | 25 anos: 1,9% (ATENÇÃO) · 35: 6,5% · **42: 9,3% · 47: 12,4% · 52: 15,2% · 55: 17,6%** · 65: 21% → INVESTIGAR a partir dos 30–34 anos (prior 0,060% × 67 ≈ 3,9%) |
| Homem que passou a urinar mais vezes, sem outros dados | 45: 0,06% · 52: 0,82% · 57: 2,0% (ATENÇÃO) · **62: 3,7% · 67: 5,5% · 72: 6,9% · 77: 7,6% → INVESTIGAR a partir dos 60 anos** |

## Limitações (para o FAQ da banca)

- **Naive Bayes supõe achados independentes.** FIT+ e anemia, ou tosse e hemoptise, andam juntos, então somar os LRs superestima o risco. Por isso a tela mostra "≥ 20%" acima de 20%.
- **LRs de estudos ingleses (CAPER, CPRD, GPRD)** são de atenção primária. Aplicados a visitante de feira, o "sim" tende a pesar um pouco mais do que deveria.
- **HPV e Papanicolau** foram validados para CIN2+, não só para câncer invasivo.
- **Próstata:** um homem que passou a urinar mais vezes (LR 6,6) passa de 3% **a partir dos 60 anos**: 50–54 dá 0,82%, 55–59 dá 2,0% (ATENÇÃO), 60–64 dá 3,7%, 65–69 dá 5,5%, 70–74 dá 6,9% e 75–79 dá 7,6% (INVESTIGAR). A recomendação para esse caso é **conversar com o médico sobre o PSA**, não "câncer provável". É coerente com o NICE NG12, que manda considerar o PSA em homem com sintoma urinário.
- **Viés de detecção (para o FAQ):** o PSA acha tumores que nunca dariam sintoma. Isso infla a incidência brasileira de próstata (o prior) e também o LR do sintoma urinário, porque o homem com sintoma faz mais PSA e por isso recebe mais diagnósticos. Os dois efeitos empurram o risco de próstata para cima.
- **Perda de peso contada duas vezes:** a perda de peso relatada (`perda_peso_inexplicada`) e a medida na balança (`perda_peso_objetiva`) têm LR para colorretal e pulmão. Na fase oncológica, o motor (tarefa 5) usa só a medida quando ela existe, e a relatada é ignorada para não somar o mesmo achado duas vezes.
- **Valores C** (tosse, dispneia, rouquidão, pele da mama, sangramentos do colo, fator "nunca fumou") devem ser revistos pela médica na tela "Base da IA".
