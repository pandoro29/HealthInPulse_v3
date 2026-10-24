# FAQ da banca: HealthInPulse v8

Perguntas que a banca (ou um visitante da área de saúde) deve fazer, com a resposta curta para falar e o detalhe
para quem insistir. O app tem dois lados: **o paciente e o visitante veem prevenção** (próximo passo, padrão normal,
exames preventivos e metas, sem nenhuma doença) e **a médica vê o risco**. Os números do risco estão em
`Docs/base-clinica-oncologia.md`, com a fonte, a população e o grau de confiança (A, B ou C); as faixas normais, em
`Docs/base-clinica-fisiologia.md`. Se não souber responder, diga "esse número está na base com a fonte, posso te
mostrar" e abra a tela **Base da IA**.
<!-- conferir: Docs/base-clinica-fisiologia.md é da Parte 6; se não existir no dia, tire a menção -->

Sumário: [Prevenção e fontes](#prevenção-e-fontes) · [A IA](#a-ia) · [Os números](#os-números) ·
[Limitações](#limitações) · [Ética, LGPD e ANVISA](#ética-lgpd-e-anvisa) · [Engenharia](#engenharia) ·
[Próximos passos](#próximos-passos)

---

## Prevenção e fontes

### 1. Por que o app não diz se eu tenho doença?

**Curta:** porque é um app de prevenção, não de diagnóstico. Dizer a alguém que ele tem, ou pode ter, uma doença, sem
exame e sem médico, assusta e pode estar errado. Por isso o paciente e o visitante recebem o **próximo passo** (manter
a rotina, agendar consulta ou procurar atendimento agora), como estão em relação ao **padrão normal**, os **exames
preventivos** da idade e do sexo e **metas** com fonte. Quem vê a avaliação de risco é a médica, que sabe interpretar
e conversar na consulta.

**Detalhe:** é ética da empresa e regra do projeto.
- **O filtro é no servidor.** As respostas da API, os eventos em tempo real e o `/teste` do paciente não levam nome,
  código nem probabilidade de doença. Esconder só na tela não bastaria, porque o DevTools mostra a resposta inteira.
- **Como o resultado do motor vira próximo passo:** sinal de alarme → **procurar atendimento agora** (com o SAMU 192,
  ou o CVV 188 quando é sofrimento emocional); risco acima de baixo em qualquer condição, resultado inconclusivo ou
  câncer em ATENÇÃO ou INVESTIGAR → **agendar consulta**; nada disso → **manter a rotina**. Não aparece prazo sem
  fonte ("em até 7 dias"): emergência é "agora", o resto é "agende".
- **Exames preventivos aparecem pelo nome**, sem dizer o que previnem (mamografia, sangue oculto nas fezes, DNA-HPV).
  O paciente vê os que valem para todo mundo da idade e do sexo dele; os de alto risco (por família ou por fumo) ficam
  com a médica, porque mostrar um deles já sinalizaria risco.
- **As perguntas da triagem continuam.** Perguntar "algum parente teve câncer?" é coletar o que a pessoa já sabe, não
  dizer que ela tem algo.

### 2. De onde vêm os números?

**Curta:** de fonte forte e documentada. A base principal é o **Guyton & Hall, Tratado de Fisiologia Médica**: dele
vêm as faixas normais, como a frequência cardíaca de repouso do adulto entre 60 e 100 bpm e a saturação de oxigênio
entre 95% e 99%. O que o livro não cobre vem de fonte do mesmo nível: diretriz oficial (OMS, Ministério da Saúde,
NICE, Diretriz de Hipertensão 2025 da SBC, Diretriz 2025 da SBD com o FINDRISC) ou base oficial de dados (INCA,
GLOBOCAN/IARC). Nada de "estimativa da equipe".

**Detalhe:**
- **Cada número tem ficha:** livro com capítulo, página e trecho; diretriz ou base com URL, ano e como o número foi
  tirado.
- **Como o Guyton entrou:** o grupo passou o livro (PDF) por uma IA, que devolveu os valores. Cada valor tem o trecho e
  a página do PDF, para conferir no livro; a edição e a página impressa ainda estão sendo conferidas.
- **As metas do paciente também têm fonte:** 150 minutos de atividade por semana (OMS, 2020), IMC normal de 18,5 a
  24,9 (OMS), parar de fumar (protocolo do Ministério da Saúde, 2020), pressão abaixo de 130/85 (SBC).
- **Estudo publicado pequeno** só fica se não existir fonte melhor, e aparece para a médica como confiança baixa.
- **Número sem fonte sai do motor.** Foi o que aconteceu com o motor antigo das 8 crônicas: os números não tinham fonte
  desse nível, então ele saiu. Ficaram 3 escores validados com cortes oficiais (pergunta 3); doença cardiovascular e
  hipertensão, síndrome metabólica, arritmia, DPOC e hipotireoidismo saíram.
- **Alarme de segurança nunca sai por falta de fonte:** ganhou fonte. Glicemia > 250 (Ministério da Saúde, Caderno 36),
  frequência cardíaca ≥ 150 (AHA), oxigenação < 90% (OMS).
- Um teste automático barra fonte sem documentação na base.

---

## A IA

### 3. Onde está a IA?

**Curta:** num motor de raciocínio probabilístico (bayesiano). Ele parte da chance média, atualiza com cada pista e
escolhe sozinho a próxima pergunta que mais muda o resultado. O risco calculado vai para a médica; o paciente e o
visitante recebem o próximo passo (pergunta 1).

**Detalhe:** é IA no sentido de sistema especialista probabilístico, não de rede neural. Para cada câncer:
`logit(chance final) = logit(chance de partida) + Σ ln(força de cada pista)`. O motor devolve, junto com o risco, a
lista de contribuições fator a fator, e um teste automático confere que a soma das partes bate com o resultado.
A escolha da pergunta usa `Σ |ln LR+| / custo` somado sobre os cânceres que valem para a pessoa (idade e sexo).
Nas crônicas não há mais motor bayesiano: são 3 escores validados, sem porcentagem, com os cortes oficiais.
**STOP-Bang** para apneia do sono (≥ 3 intermediário, ≥ 5 alto; Chung 2016); **FINDRISC** para diabetes tipo 2 (≥ 15
alto, > 20 muito alto; SBD 2025); **PHQ-2** para depressão (≥ 3 abre o **PHQ-9**, positivo a partir de 10; Kroenke
2001/2003, Levis 2019).

### 4. Por que não treinaram um modelo de machine learning?

**Curta:** porque não temos dados de pacientes brasileiros com desfecho, e porque em saúde o modelo precisa
explicar cada resultado.

**Detalhe:** treinar exigiria milhares de prontuários com o diagnóstico confirmado depois, autorização ética e
tratamento de dado sensível pela LGPD. Um modelo treinado com dados de outro país seria uma caixa-preta difícil de
validar. Escolhemos parâmetros publicados, com fonte, e um modelo em que cada número pode ser conferido e editado.
Calibrar com dados reais é o próximo passo (pergunta 26).

### 5. É o ChatGPT?

Não. O risco de câncer é calculado pelo motor bayesiano, local, sem internet e sem modelo de linguagem. O app tem
uma integração opcional com o GPT-4o para gerar relatórios em texto (triagem, exames). Na feira ela fica sem chave,
e o app usa o simulador local no lugar.

### 6. Como a IA escolhe a próxima pergunta?

Pela força da pergunta: quanto uma resposta "sim" tipicamente mudaria o risco dos cânceres que valem para aquela pessoa,
dividido pelo "custo" da pergunta. Ex.: para um homem de 60 anos, "sangue nas fezes" (LR ≈ 10 para colorretal) vem
antes de "rouquidão" (LR ≈ 2,6 para pulmão). Pergunta sobre mama não aparece para homem, e próstata não aparece para
mulher. No app do paciente e no `/teste`, a pergunta aparece sem o "por que estamos perguntando", porque esse texto
citava a doença.
<!-- conferir na tela: a pergunta do /teste sem o "por que estamos perguntando" -->

---

## Os números

### 7. De onde vem o ponto de partida (o "prior")?

É a chance de alguém da mesma idade e sexo receber o diagnóstico nos próximos **2 anos**, calculada como 2 × a
incidência anual. A forma por idade vem do **GLOBOCAN 2022 para o Brasil** (IARC); o total é calibrado para a taxa
bruta oficial do **INCA, Estimativa 2026** (triênio 2026–2028). Ex.: colorretal em homem de 60–64 anos = 0,157% em 2
anos, cerca de 2 em 1.000.

### 8. Por que 2 anos?

É a mesma janela dos estudos **CAPER** (Hamilton, Reino Unido), que mediram quanto cada sintoma aumenta a chance de
câncer e embasam a diretriz **NICE NG12**. Usar a mesma definição deixa o prior e a força das pistas na mesma
escala.

### 9. De onde vem a força de cada sintoma ou exame?

É a razão de verossimilhança (LR): quantas vezes o achado é mais comum em quem tem o câncer do que em quem não tem.
Nos estudos caso-controle, LR+ = (fração de casos com o achado) ÷ (fração de controles com o achado). Quando o estudo
só publica o valor preditivo positivo (VPP), `LR = odds(VPP) / odds(prior do estudo)`.

Exemplo para conferir de cabeça: sangramento retal tem VPP de 2,4% sobre um prior de 0,25% no CAPER, então
0,0246 / 0,0025 ≈ **9,8**, igual ao LR de 10 publicado (Hamilton 2005).

Outros exemplos: FIT positivo LR ≈ 13 (Lee 2014, 19 estudos); nódulo na mama LR ≈ 55 (Walker 2014, CPRD);
BI-RADS 4–5 LR ≈ 67 (Lehman 2017, 1,7 milhão de mamografias).

### 10. E os fatores de risco, como família e cigarro?

Multiplicam o ponto de partida, cada um com um risco relativo publicado. Ex.: parente de 1º grau com câncer
colorretal × 2,24 (Butterworth 2006, meta-análise de 47 estudos); mãe, irmã ou filha com câncer de mama, em mulher
com menos de 50 anos, × 2,2 (Collaborative Group 2001, 52 estudos); preventivo atrasado × 1,96 para colo do útero
(Andrae 2008, com a cobertura brasileira da PNS 2019).

Regra de projeto: **perfil (idade, sexo, IMC, fumo, família) entra só no ponto de partida; sintomas, exames e
balança entram só como pistas.** Assim nada é contado duas vezes, e um teste automático garante isso.

### 11. Por que o limite de 3% para "investigar"?

É o limiar de valor preditivo positivo que o **NICE NG12** (Reino Unido, atualizado em 2025) usa para encaminhar
por suspeita de câncer. As categorias, que só a médica vê, são:
- **INVESTIGAR:** chance ≥ 3%;
- **ATENÇÃO:** chance ≥ 1% **ou** pelo menos 2 vezes a média da mesma idade e sexo;
- **ROTINA:** o resto.

Para o paciente, ATENÇÃO e INVESTIGAR viram o mesmo próximo passo: agendar consulta (pergunta 1).

### 12. Por que "2 vezes a média" já dá ATENÇÃO, mesmo com risco baixo?

Porque é isso que muda o plano de exames. A Marina tem 34 anos e chance de mama de cerca de 1 em 1.000, mas a mãe
teve câncer de mama aos 41: o risco dela é 2,2 vezes a média, e as sociedades brasileiras (CBR/SBM/Febrasgo 2023)
recomendam começar o rastreamento 10 anos antes do caso mais jovem da família, se o risco alto for confirmado.

### 13. As recomendações de exame seguem qual diretriz?

As brasileiras vigentes em outubro de 2026, com o ano na tela:
- **colorretal:** FIT a cada 2 anos dos 50 aos 75 no SUS (INCA, 2026); 45–49 como decisão compartilhada;
- **mama:** mamografia a cada 2 anos dos 50 aos 74 (Ministério da Saúde, 2025); 40–49 sob demanda;
- **colo do útero:** DNA-HPV a cada 5 anos dos 25 aos 64 (Portaria Conjunta SAES/SECTICS nº 13, 2025);
- **pulmão:** TC de baixa dose anual para 50–80 anos, ≥ 20 maços-ano, parou há menos de 15 anos (consenso
  SBCT/SBPT/CBR, 2024; ainda não é programa do SUS);
- **próstata:** o Ministério da Saúde e o INCA **não** recomendam rastrear todos os homens (Nota Técnica nº 9/2023);
  a IA indica conversa com o médico (decisão compartilhada).

O paciente e o visitante veem esses exames só pelo nome e só os que valem para a idade e o sexo; os de alto risco,
como a TC de pulmão ou a mamografia antecipada pela família, ficam com a médica (pergunta 1).

---

## Limitações

### 14. O Roberto aparece com "≥ 20%". Por que não o número exato?

Porque o número exato engana. O modelo é um **Naive Bayes**: supõe que as pistas são independentes. FIT positivo e
anemia, por exemplo, andam juntos (os dois vêm de sangramento do tumor), então multiplicar as duas forças superestima
o risco. Pela conta pura, o Roberto daria entre 45% e 68%, conforme as respostas sobre sangue nas fezes e dor
abdominal. Acima de 20%, a tela da médica mostra "≥ 20%" e a categoria, que é o que importa para a decisão:
investigar.

### 15. Quais são as limitações do modelo?

- **Não é diagnóstico** e **não foi calibrado com dados reais** brasileiros.
- **Pistas correlacionadas** inflam o risco (pergunta 14).
- **Boa parte dos LRs vem de estudos de atenção primária** (CAPER e CPRD, Reino Unido) e de meta-análises. Num
  visitante de feira, um "sim" tende a pesar um pouco mais do que deveria.
- **HPV e Papanicolau** foram validados para lesão precursora (CIN2+), não só para câncer invasivo.
- **Próstata:** o PSA acha tumores que nunca dariam sintoma, o que infla tanto a incidência (o prior) quanto a força
  do sintoma urinário. Por isso a recomendação para esse caso é **conversar sobre o PSA**, não "câncer provável".
- **Estudos com poucos casos** (como os de tosse e falta de ar) aparecem para a médica como confiança baixa. O que era
  estimativa sem fonte do mesmo nível sai do motor ou ganha fonte, pela regra da base com fonte (pergunta 2).

### 16. Os números de estudos estrangeiros servem para brasileiros?

Em parte. O **ponto de partida** é brasileiro (INCA 2026 + GLOBOCAN Brasil), e é ele que mais pesa para quem não tem
sintomas. A **força das pistas** (LR) tende a ser mais estável entre populações do que a incidência, porque compara doentes
com não doentes, mas ainda assim vem de outro sistema de saúde. É a primeira coisa a recalibrar com dados reais.

### 17. Exame normal diminui o risco?

Sim. Cada pista tem o "sim" (LR+) e o "não" (LR−). Um FIT negativo, por exemplo, divide a chance de câncer
colorretal (LR− = (1 − 0,79) / (1 − 0,06) ≈ 0,22). Um "não" em pergunta também conta, só que menos.

---

## Ética, LGPD e ANVISA

### 18. Vocês guardam os dados de quem faz o teste no stand?

**Não.** O teste público (`/teste`) não tem cadastro, não grava no banco e não entra no log de requisições (o
servidor ignora `/api/public/`): o celular manda as respostas, o servidor calcula e devolve o resultado, e nada fica. Dado de saúde é **dado pessoal
sensível** pela LGPD (Lei 13.709/2018), então a decisão foi não coletar. As perguntas mais íntimas podem ser
respondidas no próprio celular, pelo QR, sem ninguém do lado.

### 19. E os pacientes do app com login?

Os da demonstração são **fictícios** (Roberto, Marina, João e a Dra. Ana). O cadastro de paciente pede só **usuário,
nome e senha**: sem e-mail, CPF ou data de nascimento. Idade e sexo, que o motor usa, entram na triagem. Num produto
real, os dados do paciente exigiriam base legal para dado sensível, consentimento, controle de acesso (já existe: a
médica só vê pacientes vinculados) e registro de quem acessou.

### 20. O que acontece se o visitante receber "Agendar consulta" ou "Procurar atendimento agora"?

A tela não mostra doença, categoria de risco nem porcentagem, e diz "não é diagnóstico". **"Agendar consulta"** quer
dizer só isso: vale conversar com um médico, levando o resultado. **"Procurar atendimento agora"** aparece quando uma
resposta é sinal de alarme, com o telefone quando couber (SAMU 192, CVV 188). A equipe tem um roteiro de acolhimento
(`checklist-stand.md`): ouvir, explicar que o teste compara com o padrão normal e não diagnostica, indicar o médico,
não interpretar o caso pessoal e não falar em doença.

### 21. Isso precisaria de registro na ANVISA?

Para virar produto, provavelmente sim. A **RDC 657/2022** da ANVISA trata do **software como dispositivo médico**
(SaMD): software que estima risco de doença e orienta conduta tem finalidade médica. O registro exigiria definir o
uso pretendido, classificar o risco, ter validação clínica, gestão de risco e controle de versões. Hoje é um projeto
acadêmico, com aviso explícito de que não é diagnóstico.

### 22. Se a médica pode editar os números, alguém não pode estragar o modelo?

No app, só o perfil **médico** edita, e toda edição vira uma versão com autor, data, valor antigo e novo. Existe
"Restaurar padrão". A edição é **fechada por padrão**: só liga com `KB_EDIT=true` explícito (aceita também 1, yes, on). No site público (Render) fica **desligada** (`KB_EDIT=false`) e a tela mostra "só leitura"; só no notebook do stand (`npm run stand` liga) ela
está ativa para a demonstração. Num produto, a mudança passaria por revisão (dois médicos) antes de valer.

---

## Engenharia

### 23. Como vocês garantem que não quebrou nada?

- **Auditoria de fontes:** cada número da base tem fonte do nível do Guyton (livro-texto, diretriz oficial ou base
  oficial), com ficha documentada, e um teste automático barra fonte sem documentação. O que não tinha fonte saiu do
  motor, como o modelo antigo das 8 crônicas (pergunta 2).
- **Testes de matemática:** um caso calculado à mão e a invariante "prior + soma das contribuições = resultado" em 400
  perfis aleatórios.
- **Personas como teste:** Roberto em INVESTIGAR, uma mulher de 22 anos com tudo em ROTINA, e nunca próstata para
  mulher. O João sai com STOP-Bang 6 e FINDRISC 23, e o seed confere.
- **CI:** cada mudança roda os testes em Windows, macOS e Linux antes de entrar.

### 24. Por que os números estão no banco e não no código?

Separar **dados** (mudam com a ciência) de **lógica** (como calcular, coberta por testes). Com os números numa
tabela, com a fonte ao lado, a médica ajusta sem programador e sem publicar uma nova versão, e o histórico mostra de
onde veio cada resultado.

### 25. Como a pulseira e a balança entram?

A balança Care Plus mede o peso ao longo do tempo. Uma queda de 5% ou mais em até 180 dias vira a pista "perda de
peso medida", com a força da perda de peso do CAPER (LR ≈ 5 para colorretal, ≈ 6 para pulmão). Quando existe a
medida, a perda de peso só "relatada" é ignorada, para não contar a mesma coisa duas vezes.

---

## Próximos passos

### 26. O que falta para isso virar produto?

1. **Calibração com dados reais:** estudo retrospectivo com prontuários anonimizados de uma operadora ou hospital,
   aprovado em comitê de ética. Comparar o risco previsto com o diagnóstico em 2 anos (curva de calibração e
   discriminação), e recalibrar os pontos de partida e as forças.
2. **Modelar pistas correlacionadas** (ex.: FIT e anemia juntos) em vez de supor independência.
3. **Validação clínica prospectiva** e o caminho regulatório da ANVISA (pergunta 21).
4. **Revisão médica** dos parâmetros de confiança C, e governança para editar a base.
5. Mais cânceres (pele está na lista) e lembrete de rastreamento em dia ou atrasado.

### 27. Por que esses cinco cânceres?

Estão entre os mais frequentes no Brasil (INCA 2026: próstata 74,6 e mama 71,6 casos novos por 100 mil por ano;
colorretal cerca de 25; pulmão 15 a 18; colo do útero 17,6) e todos têm exame de rastreamento ou sinais de alerta
estudados em atenção primária. Câncer de pele ficou para depois por prazo.
