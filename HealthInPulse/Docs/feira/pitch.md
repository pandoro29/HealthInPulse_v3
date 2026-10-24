# Pitch: HealthInPulse v8 na feira (sáb 24/10/2026)

Dois tamanhos: **30 segundos** para quem passa pelo stand e **3 minutos** para a banca ou para quem parou para ouvir.
Números conferidos com `Docs/base-clinica-oncologia.md` (fonte de cada um lá). Os resultados dos pacientes vêm do
motor (`riskEngine`) com os dados atuais e podem mudar um pouco se a base for ajustada: confira na tela antes de citar.

Regras para quem fala:
- O app é de **prevenção**. Nunca diga "a IA diagnostica" ou "a IA detecta câncer".
- **Para o visitante e para o paciente, nada de doença:** nem nome de doença, nem órgão, nem "risco de", nem
  categoria (ROTINA, ATENÇÃO, INVESTIGAR), nem porcentagem. Fale em **próximo passo**, **padrão normal**,
  **exames preventivos** e **metas**.
- **O risco de câncer é ferramenta da médica.** Fale dele só mostrando a tela da médica, e sempre como triagem de
  risco para ela, nunca sobre a pessoa à sua frente.
- Se perguntarem "e o câncer?", "por que não diz se eu tenho alguma coisa?" ou "de onde vêm os números?", as respostas
  estão no `faq-banca.md` (perguntas 1 e 2).
- Se alguém ficar preocupado com o resultado, siga o acolhimento do `checklist-stand.md`.

---

## 30 segundos (visitante)

> Você sabe quais exames preventivos cabem na sua idade, e se está dentro do normal? Quase ninguém sabe.
>
> O HealthInPulse é o app de prevenção ligado à pulseira e à balança da Care Plus. Ele compara os seus dados com os
> **padrões normais da medicina**, tirados do **Guyton & Hall**, o livro-texto de fisiologia médica, e de diretrizes
> oficiais, e te diz o **próximo passo**: manter a rotina, agendar uma consulta ou, se for o caso, procurar
> atendimento agora.
>
> E mostra os **exames preventivos da sua idade** e metas com fonte, como 150 minutos de atividade por semana.
>
> Não é diagnóstico. Aponta a câmera aqui no QR: são dois minutos e **nada é gravado**.

---

## 3 minutos (banca)

Marcação de tempo aproximada. Quem demonstra fica no notebook; quem fala, de frente para a banca.

### 0:00 a 0:20 · O problema

> Prevenção depende de duas coisas: saber se você está dentro do normal e fazer o exame preventivo na idade certa.
> Cada exame tem idade e público, e essas regras mudaram agora: em 2025 o Ministério da Saúde ampliou a mamografia
> para 50 a 74 anos e trocou o papanicolau pelo teste de DNA-HPV como exame principal; em 2026 o SUS passou a
> oferecer o teste de sangue oculto nas fezes dos 50 aos 75. A maioria das pessoas não sabe quais valem para ela.

### 0:20 a 0:55 · O que fizemos: dois lados

> O HealthInPulse é o app de prevenção da Care Plus, ligado à pulseira e à balança. Ele tem dois lados.
>
> **O paciente vê prevenção.** O próximo passo (manter a rotina, agendar consulta ou procurar atendimento agora, com o
> SAMU 192 ou o CVV 188 quando couber), como ele está em relação ao padrão normal, os exames preventivos da idade e do
> sexo, e metas com fonte. **Ele nunca ouve que tem, ou pode ter, uma doença.** Isso é ética da empresa: um app não
> deve dizer isso a ninguém, e o filtro é no servidor, não só na tela.
>
> **A médica vê o risco.** Para ela, o motor estima o risco de 5 cânceres, explica o porquê fator a fator e indica
> quando investigar; e aplica 3 escores validados, com os cortes oficiais: STOP-Bang (apneia), FINDRISC (diabetes
> tipo 2) e PHQ-2/PHQ-9 (depressão). Quem conversa sobre risco com o paciente é ela, na consulta.

### 0:55 a 1:15 · De onde vêm os números

> Tudo tem fonte forte e documentada. A base principal é o **Guyton & Hall, Tratado de Fisiologia Médica**: por
> exemplo, a frequência cardíaca de repouso normal do adulto, de 60 a 100. O que o livro não cobre vem de fonte do
> mesmo nível: INCA, Organização Mundial da Saúde, Ministério da Saúde, NICE e as Sociedades Brasileiras de
> Cardiologia e de Diabetes. Número sem fonte não entra no motor: na auditoria, cinco doenças crônicas que não tinham
> fonte desse nível saíram, em vez de ganhar número inventado. E todos os números ficam no **banco de dados**, com a fonte ao lado,
> onde a médica pode editar.

### 1:15 a 1:45 · Como a IA da médica pensa

> Do lado da médica, é raciocínio bayesiano: a mesma lógica de um médico, só que com a conta à mostra.
> - **Ponto de partida:** a chance de alguém da mesma idade e sexo receber o diagnóstico em 2 anos. Vem do INCA
>   (Estimativa 2026) e do GLOBOCAN 2022 para o Brasil.
> - **Cada pista multiplica a chance.** A força de cada sintoma ou exame vem de estudos publicados, como os estudos
>   CAPER, do Reino Unido, que embasam a diretriz do NICE.
> - **Limites claros:** a partir de **3%** de chance, a recomendação para a médica é investigar. Esse corte é o da
>   diretriz NICE NG12.
>
> E a próxima pergunta não é fixa: a IA escolhe a que mais muda o resultado. Por isso o teste é curto.

### 1:45 a 2:25 · Demonstração: o Sr. Roberto

*(no notebook: login da médica, usuário `ana` (senha no slide 5) → paciente Roberto → painel de riscos)*

> Esta é a tela da médica. O Roberto tem 63 anos e é ex-fumante. Para um homem da idade dele, a chance de câncer de
> intestino em 2 anos é de cerca de **2 em 1.000**. Mas a balança Care Plus registrou que ele perdeu peso, de 84 para
> 76 kg em 3 meses; o hemograma mostra anemia; o exame de sangue oculto nas fezes deu positivo; e ele contou que o
> intestino mudou.
>
> Cada pista multiplica a chance, e o risco passa de **20%**. A categoria é **INVESTIGAR**: o próximo passo é a
> avaliação médica, com colonoscopia. E como ele fumou 35 maços-ano e parou há 8 anos, a IA também indica a
> **tomografia de pulmão de baixa dose**, pelo consenso brasileiro de 2024.
>
> No app dele, o Roberto vê só o próximo passo, **"Agendar consulta"**, os exames preventivos da idade e as metas.
> Nenhuma palavra sobre doença.
<!-- conferir na tela: texto do próximo passo no app do Roberto -->

### 2:25 a 2:45 · A base é editável

*(Base da IA → Simular em paciente: Roberto → LR+ do FIT de 13,17 para 2: o risco cai de 44,8% para 11,0% → Histórico → "Restaurar padrão")*

> Se a médica discordar de um número, ela muda aqui. O resultado do Roberto muda na hora, e o sistema guarda quem
> mudou, quando e de quanto para quanto. É a mesma ideia do Git, aplicada aos dados da IA.

### 2:45 a 3:00 · Limites e fecho

> Não é diagnóstico e não foi calibrado com pacientes brasileiros: é prevenção para o paciente e triagem de risco para
> a médica, com números da literatura, e a gente declara os limites na tela. O próximo passo seria validar com dados
> reais. Se quiserem testar, o QR está no banner: dois minutos, e nada é gravado.

---

## Se perguntarem "e a Marina e o João?" (30 s extras, tela da médica)

> **Marina**, 34 anos: a mãe teve câncer de mama aos 41. O risco dela ainda é baixo, cerca de **1 em 1.000**, mas é
> **2,2 vezes** a média da idade dela, então a médica vê a categoria **ATENÇÃO**, e o rastreamento de mama pode
> começar mais cedo, a partir dos 31 (10 anos antes da idade da mãe), se a médica confirmar o risco alto. O preventivo
> está atrasado, então ela também recebe a indicação do teste de DNA-HPV.
>
> **João**, 58 anos: nenhum sinal de câncer, categoria **ROTINA**, mas os escores crônicos estão altos: STOP-Bang 6
> (alto) e FINDRISC 23 (muito alto), e a médica recebe o alerta. A IA indica o rastreamento de intestino pela idade e,
> sobre o PSA, conversar com o médico, porque o Ministério da Saúde não recomenda o exame para todos os homens sem
> sintomas. No app dele: "Agendar consulta".
>
> No app, os dois veem o mesmo tipo de tela que o Roberto: próximo passo, padrão normal, exames preventivos e metas.
