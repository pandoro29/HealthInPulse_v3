# Correções do grupo e regra da base com fonte — design

Data: 22/10/2026. Origem: lista de problemas que o grupo encontrou testando o app, mais a
regra central do produto que o Igor definiu na conversa. Este documento é o que foi
combinado; o plano de implementação sai dele.

Decisões marcadas com **(decisão do Claude)** foram tomadas por mim durante a conversa e
não confirmadas pelo Igor uma a uma. Podem ser revistas.

## Por que

O HealthInPulse é um app de **prevenção** de uma operadora de plano de saúde (Care Plus).
Ele compara os dados da pessoa com padrões normais consolidados e ajuda a manter ou não
piorar até a consulta. Ele não diagnostica e não é função dele dizer que alguém tem doença.

Duas coisas sustentam a credibilidade:

1. Tudo que o motor e a IA usam vem de fonte forte e documentada. A fonte principal é o
   **Guyton & Hall, Tratado de Fisiologia Médica**.
2. O paciente nunca ouve que tem, ou pode ter, uma doença. Isso é ética da empresa.
   Quem recebe a avaliação de risco é a médica.

Além disso, o grupo testou o app e encontrou atritos de uso (login, cadastro, menu) que
precisam sair antes de qualquer apresentação.

## Regras que valem para o projeto inteiro

**R1. Base com fonte.**
- A fonte principal é o Guyton & Hall. Outras fontes podem entrar se forem do mesmo nível:
  livro-texto de referência, diretriz oficial (OMS, Ministério da Saúde, NICE, sociedades
  médicas brasileiras) ou base oficial de dados (INCA, GLOBOCAN/IARC).
- Estudo publicado isolado e pequeno só fica se não existir fonte melhor, e aparece para a
  médica marcado como "confiança baixa" **(decisão do Claude)**.
- Não pode: "estimativa da equipe", "valor assumido", "piso adotado", número sem fonte.
- Toda fonte é documentada: livro com edição, capítulo, página impressa e trecho;
  diretriz ou base com URL, ano e como o número foi tirado.

**R2. O paciente nunca ouve doença.**
- Nenhum texto, rótulo, cor, número ou dado que chega ao paciente diz ou sugere doença.
  Isso vale para tela, resposta de API, evento de socket, notificação e para o teste
  público `/teste`.
- O filtro acontece no backend: rota e evento do paciente não carregam código, nome nem
  probabilidade de doença. Esconder só na tela não basta, porque o DevTools mostra a
  resposta **(decisão do Claude)**.

**R3. A médica vê o risco.**
- O lado da médica continua como está. Ele pode dizer, por exemplo, "com base nos dados,
  risco de câncer colorretal nos próximos 2 anos", sempre como triagem de risco e não
  diagnóstico.

## Anti-objetivos

Coisas que fazem o trabalho falhar mesmo que "funcione":

- O app do paciente insinuar doença: nome de órgão, "risco de X", selo INVESTIGAR,
  "Suspeita de...".
- Inventar ou "ajustar" um número para o motor continuar fechando depois da auditoria.
- O cadastro do paciente pedir qualquer dado além de usuário, nome e senha.
- Logins da demo aparecerem no site.

## Parte 1. Entrada no app (itens 1, 2 e 6 do grupo)

### Login

- A tela abre vazia. Sai a lista `DEMO_USERS` e o pré-preenchimento com os dados do
  Roberto (`frontend/src/pages/auth/LoginPage.jsx:50`). Saem também os 4 cards de demo.
  Continuam o link do teste rápido e o "Cadastre-se".
- Os campos passam a ser **Usuário** e **Senha**. O login é só por usuário; o login por
  e-mail deixa de existir **(decisão do Claude)**.
- O autocomplete do navegador é desligado onde o navegador respeita. Senha que a pessoa
  salvou no próprio Chrome está fora do nosso controle.

### Senha errada

- Causa: o login errado volta 401. O interceptor de `frontend/src/services/api.js:33`
  trata qualquer 401 como sessão expirada, tenta o refresh, falha e faz
  `window.location.href = '/login'` (linha 59). A página recarrega e o formulário volta
  ao estado inicial.
- Correção: o interceptor ignora 401 vindo de `/auth/login` e `/auth/register`.
- Na tela: aparece "Usuário ou senha inválidos", o usuário digitado fica, a senha é limpa
  e o foco vai para o campo de senha.

### Cadastro

- **Só paciente se cadastra:** usuário, nome e senha. Nada mais.
- **A médica não se cadastra.** Ela já tem login pronto (a conta `ana` do seed). Por
  isso sai a etapa "Você é... Paciente / Médico" e sai o cadastro de médico.
- **Paciente novo fica ligado automaticamente à médica.** Na prática, a todo usuário
  DOCTOR que existir, que hoje é só a Ana. Sem isso o alerta da triagem não chega a
  ninguém, porque hoje só o seed cria o vínculo `DoctorPatient` **(decisão do Claude, a
  partir de "médico pode ter um login já pra ela")**.
- Regra do usuário **(decisão do Claude)**: de 3 a 30 caracteres; letras minúsculas sem
  acento, números, ponto e underline; gravado em minúsculas; único sem diferenciar
  maiúscula de minúscula. Se já existir, o backend responde 409 e a tela diz "Esse
  usuário já existe, escolha outro".
- A senha mantém o mínimo atual de 8 caracteres.
- Depois de criar a conta, a pessoa entra direto. Isso já funciona hoje
  (`RegisterPage.jsx:46`); o destino passa a ser a Parte 2.

### Banco

- `User.username String @unique` (novo).
- `User.email` vira opcional.
- `Patient.cpf`, `Patient.dateOfBirth` e `Patient.gender` viram opcionais. A coluna
  `cpf` fica no banco, mas some do app **(decisão do Claude)**.
- O banco é SQLite e o Render recria tudo pelo seed a cada deploy. Não precisa migração
  com backfill; basta atualizar o schema e o seed.
- Idade e sexo, que o motor usa, já são perguntados na triagem (`questions.js:31-32`).
  Tela que mostra idade a partir de `dateOfBirth`, como na área da médica, passa a usar o
  perfil da última triagem e mostra "sem triagem" quando não houver.

### CPF sai do app inteiro

- Sai do cadastro, da busca da médica (placeholder "Buscar por nome ou CPF…" em
  `pages/doctor/Patients.jsx:39` e a busca no backend), do perfil se aparecer e do seed.

### Pronto quando

- Abrir `/login` em janela anônima mostra os campos vazios e nenhum card.
- Errar a senha mantém o usuário digitado e mostra a mensagem, sem recarregar a página.
- Cadastrar paciente só com usuário, nome e senha funciona e entra direto.
- Usuário repetido mostra o erro.
- `auth.register.test.js` atualizado e passando.

## Parte 2. Primeiro acesso: triagem e tutorial (item 5)

**Fluxo do paciente novo:**

1. Termina o cadastro e cai direto em `/patient/triage`, com uma frase de boas-vindas
   explicando que a triagem vem primeiro para o app conhecer a pessoa.
2. Tem um botão "Fazer depois" **(decisão do Claude)**. Quem pula cai no Dashboard com um
   aviso de "Triagem pendente".
3. Ao terminar a triagem e ver o resultado, ou ao pular, aparece o **tutorial**.

**Tutorial:**

- Um balão por aba do menu, com uma frase cada, apontando para o item do menu. No
  celular, o tutorial abre o menu hamburguer para apontar.
- Botões "Próximo" e "Pular".
- Aparece uma vez por conta. O estado fica no banco (por exemplo `User.tutorialSeenAt`)
  e não no `localStorage`, para não reaparecer em outro aparelho **(decisão do Claude)**.
- "Rever tutorial" no Perfil.
- A médica não se cadastra, então não tem tutorial. As contas do seed já nascem com o
  tutorial marcado como visto, para não aparecer no meio da demo **(decisão do Claude)**.
- Os textos seguem a R2.

Rascunho dos textos do paciente, para o builder ajustar:

| Aba | Frase |
|---|---|
| Dashboard | Resumo do dia com os sinais da sua pulseira. |
| Metas | Ações para manter sua saúde em dia. Cada meta concluída vale coins. |
| Recompensas | Troque seus coins na loja. |
| Exames | Envie seus exames e veja como eles se comparam às faixas normais. |
| Triagem | Questionário que atualiza suas metas. Refaça quando quiser. |
| Relatórios IA | Resumos feitos a partir dos seus dados. |
| Consultas | Agende e acompanhe suas consultas. |
| Perfil | Seus dados. Aqui você também revê este tutorial. |

**Pronto quando:** uma conta nova passa por cadastro, triagem e tutorial; ao sair e
entrar de novo, o tutorial não reaparece; o "Rever tutorial" funciona.

## Parte 3. Menu sempre visível (item 7)

- O grupo relata que precisa rolar para cima para o hamburguer aparecer.
- No código, o topo já fica fora da área que rola (`PatientLayout.jsx:44`,
  `DoctorLayout.jsx:94`). A hipótese é o celular: `h-screen` usa `100vh`, que no celular
  é maior que a área visível, e o topo sai da tela junto com a barra do navegador.
- Primeiro reproduzir em largura de celular (cerca de 390 × 844) numa página longa, como
  Triagem ou Base da IA, e confirmar a causa. Depois corrigir as duas layouts para o
  topo com o hamburguer ficar sempre visível durante a rolagem.
- **Pronto quando:** rolando qualquer página longa em largura de celular, o hamburguer
  continua na tela o tempo todo.

## Parte 4. O paciente não vê doença (regra R2)

### O que o paciente vê

1. **Próximo passo**, um entre três:
   - **Manter a rotina.**
   - **Agendar consulta.**
   - **Procurar atendimento agora**, com o número quando couber: SAMU 192, CVV 188.
2. **Como ele está em relação ao padrão normal.** Por exemplo: "frequência cardíaca de
   repouso acima da faixa normal (60–100 bpm)". A faixa vem do Guyton.
3. **Exames preventivos por idade e sexo**, sem dizer o que previnem. Por exemplo:
   "exame de sangue oculto nas fezes, recomendado a partir dos 50 anos". A fonte é a das
   regras de rastreamento (INCA/Ministério).
4. **Metas** (Parte 5).

### Como o resultado do motor vira próximo passo (decisão do Claude)

| Resultado do motor | Próximo passo do paciente |
|---|---|
| Sinal de alarme (`redFlags.js`) | Procurar atendimento agora |
| Câncer em INVESTIGAR ou ATENÇÃO; crônica HIGH, CRITICAL ou MODERATE; INCONCLUSIVE | Agendar consulta |
| LOW sem nada acima | Manter a rotina |

Não aparece prazo sem fonte para o paciente. "Em até 7 dias" e "nas próximas 24h" saem.
Emergência é "agora".

### O que sai do lado do paciente (levantamento inicial)

O builder precisa varrer tudo; esta lista é o ponto de partida:

- **`pages/patient/Triage.jsx`:** `ConditionRiskCard` (linha 270), `ScreeningList` com
  nome de câncer (290), fatores com `conditionLabel` (297) e o selo "Risco X" (364, 493).
- **`pages/patient/Reports.jsx`, `Dashboard.jsx` e `Exams.jsx`:** selos `RISK_LABEL`. No
  exame, o selo vira "dentro / fora da faixa normal".
- **`backend/src/services/triageService.js`:**
  - Sugestões com nome de doença: linhas 610 e 613 (`${top.label}`).
  - Resumo de alarme com `rf.label` (linhas 456 a 460).
  - Os rótulos de `redFlags.js` citam doença ("Suspeita de Síndrome Coronariana Aguda /
    IAM", "Suspeita de neoplasia / TB"). Para o paciente, entra um texto de ação sem
    doença; o rótulo atual continua para a médica.
- **`AiReport`:** o texto gerado hoje serve aos dois lados. Passa a existir uma versão do
  paciente, que segue a R2, e a versão completa da médica. O builder escolhe se grava as
  duas ou monta a do paciente na leitura.
- **Socket e API do paciente:** `triage:completed` e as rotas `/triage` e `/ai-reports`
  do paciente não podem levar código, rótulo nem probabilidade de doença.
- **`/teste` (`pages/public/QuickTest.jsx`, `quickTestService.js`):** sai o card por
  câncer. Fica: perfil, próximo passo, exames preventivos e hábitos. O alerta vermelho
  continua, com texto de ação sem doença.

O confete "só sem risco" pode ficar, porque não cita doença.

### Até onde vai a R2 (decisão do Claude)

- **Perguntas da triagem ficam.** Perguntar "Você tem diagnóstico de diabetes?" ou
  "Algum parente teve câncer?" é coletar o que a pessoa já sabe, não alegar doença. Sai
  o que é rótulo nosso: a etapa chamada "Câncer" e o cabeçalho "risco de 5 cânceres"
  (`Triage.jsx:100,212`).
- **Exames preventivos:**
  - O paciente só vê as regras POPULACIONAL, por idade e sexo.
  - As regras ALTO_RISCO ficam só com a médica, porque mostrar uma delas já sinaliza
    risco.
  - O nome do exame pode aparecer (mamografia, colonoscopia). O texto de recomendação é
    reescrito sem citar doença.
- **`riskLevel` sai do payload do paciente:** `triage:completed`, `exam:processed` e as
  rotas do paciente. No lugar entra o próximo passo.

**Pronto quando:** buscar nas respostas da API e nos eventos de socket do paciente não
encontra código nem nome de condição; as telas do paciente e o `/teste` não mostram
doença; os testes de `quicktest`, `triage.flow`, `triage.alert` e `onco.personas` estão
atualizados; o lado da médica não muda.

## Parte 5. Metas com fonte (item 3)

### Situação hoje

- As metas são geradas no fim da triagem (`triageService.js:421`, função
  `generateGoalsFromTriage` em `goalService.js:99`) e aparecem na aba Metas.
- Os alvos estão fixos no código e não têm fonte: 2 L de água, 7000 passos, PA < 130,
  glicemia < 130, sono 7–9 h, "nova triagem em 7 dias".
- Cada triagem cria todas de novo, sem checar duplicata.
- Ninguém testa isso de verdade: `triage.flow.test.js:41` substitui o `goalService` por
  um stub.

### Como fica

- **O que é uma meta:** uma ação clara para manter ou não piorar até a consulta. Não cita
  doença, órgão nem "risco de".
- **De onde a meta pode nascer**, e só daqui:
  1. **Consulta.** O próximo passo é "Agendar consulta": a meta é "Agendar consulta com
     seu médico". O motivo fica só com a médica. A consulta acontece fora do app: o
     paciente marca a meta como feita, e a médica pode agendar pela tela dela, que já
     existe **(decisão do Claude)**. O app do paciente não ganha agendamento.
  2. **Hábito modificável encontrado na triagem.** Por exemplo: fuma vira "parar de
     fumar"; sedentário vira "150 min de atividade por semana" (OMS); álcool e IMC seguem
     a mesma lógica, sempre com diretriz.
  3. **Sinal vital fora da faixa normal do Guyton.** A meta é voltar para a faixa, por
     exemplo "manter a frequência cardíaca de repouso entre 60 e 100", citando capítulo e
     página.
- **Os modelos de meta ficam em `backend/src/services/clinical/data/prevention.js`**,
  e as fontes deles entram no banco (`ClinicalSource`) junto com as da oncologia.
  `HealthGoal` ganha `templateCode` e `sourceCode` **(decisão do Claude; mudou na
  implementação: modelo em tabela própria ficou para depois, porque não cabia no
  prazo)**.
- **Metas atuais:** as que não tiverem fonte do mesmo nível saem.
- **Fonte para o paciente:** ele só vê fonte que não cita doença (Guyton, OMS). A médica
  vê todas.
- **Sem duplicata:** a triagem nova não cria meta igual a uma que já está ativa.
- **Coins:** os valores continuam como estão. São regra de jogo, não número clínico
  **(decisão do Claude)**.
- **Onde aparecem:** na aba Metas e no Dashboard. O "no perfil" do grupo foi lido como
  "na conta do paciente" **(decisão do Claude)**.
- **Pronto quando:** um teste de verdade, sem stub, roda a triagem do começo ao fim e
  confere as metas gravadas, a fonte de cada uma e que não houve duplicata ao repetir a
  triagem.

## Parte 6. Base com fonte (regra R1)

### Guyton documentado

- O `Docs/Dados do Livro.docx` não cita o Guyton, a edição nem a página impressa: usa a
  página do PDF. Além disso, parece um resumo de chat ("Se quiser, eu posso agora",
  "você pode definir regras próprias").
- Como foi feito: o grupo passou o livro para uma IA, que leu tudo e devolveu os valores
  que estão no software. Não existe outro registro além do docx.
- Ele é substituído por `Docs/base-clinica-fisiologia.md`, com uma ficha por valor:
  valor, livro, capítulo, página do PDF e trecho. A ficha diz como o valor foi extraído
  (por IA, a partir do PDF). A edição e a página impressa ficam marcadas como "a
  conferir" (ver Em aberto).
- O que o Guyton sustenta, segundo o docx:
  - Temperatura normal de 37,0 °C (capítulo 74).
  - Frequência cardíaca: 72 bpm como exemplo fisiológico; taquicardia acima de 100 e
    bradicardia abaixo de 60 no adulto.
  - SatO₂ arterial normal de 95% a 99%.
- O que o Guyton não sustenta, segundo o docx: pressão, glicemia e movimento.
  - **Pressão:** vem da Diretriz Brasileira de Hipertensão Arterial 2025 (SBC/SBH/SBN):
    normal abaixo de 120/80; fora do consultório, o limiar é 130 e/ou 80.
  - **Glicemia:** fica sem faixa para o paciente, porque a pulseira não sabe se a
    medida é de jejum.
  - **Movimento:** sem regra.
- As frases do docx que sugerem regra própria ("febre geralmente ≥ 37,5–38 °C",
  "inatividade prolongada" com regra definida por nós) não entram.

### Auditoria das 8 doenças crônicas

- Hoje todos os números dessas doenças apontam para `HIP_MATRIZ_V7`:
  `chronicCatalog.js:9` diz "compiladas pela equipe a partir da literatura", sem URL e
  sem ano. Pela R1, isso conta como número sem fonte.
- Cada prevalência, sensibilidade e especificidade ganha uma fonte do mesmo nível ou sai
  do motor.
- Doença que ficar sem número com fonte sai do motor em vez de ganhar número inventado.
- O golden v7 (`tests/fixtures/golden-v7.json`) vai mudar de propósito e é substituído
  por um novo depois da auditoria.

### Como ficou (implementado em 22/10/2026)

O Igor escolheu trocar a fase crônica por escores validados no mesmo dia.

- **Saíram do motor:** CV/HAS, síndrome metabólica, arritmia/FA, DPOC e
  hipotireoidismo.
- **Ficaram, por escore e com os cortes oficiais, sem porcentagem:**
  - Apneia: STOP-Bang, de Chung 2016.
  - DM2: FINDRISC, com os pontos e faixas da SBD 2025 e os erros de idade,
    cintura e faixa muito alta corrigidos.
  - Depressão: PHQ-2 maior ou igual a 3 abre o PHQ-9, com corte 10 (Kroenke e
    Levis).
- **Alarmes:**
  - Glicemia acima de 250 (MS, Caderno de Atenção Básica 36).
  - Frequência cardíaca de 150 para cima (AHA).
  - SpO₂ abaixo de 90 (OMS).
- **Pulseira:** deixou de virar sintoma.
- **Oncologia:**
  - QCancer no lugar da estimativa da equipe.
  - Fumo pelo INCA/PNS.
  - Ovário pelo registro sueco.
  - Pele da mama vira regra direta do NICE NG12.
- **Pesquisa completa:** `Docs/base-clinica-fisiologia.md` (fichas do Guyton e
  das fontes do mesmo nível) e `Docs/auditoria-fontes-2026-10-22.md` (cada
  número auditado, com a ação tomada).

### Oncologia

- Das 9 linhas de confiança C em `Docs/base-clinica-oncologia.md`, saem ou ganham fonte
  as que são suposição:
  - `HIP_ESTIMATIVA_ONCO`: sangramento fora da menstruação no colo do útero.
  - "Valor assumido" em pulmão de quem nunca fumou e em mama com parente com câncer de
    ovário.
  - O piso adotado para alteração de pele na mama.
- As linhas de estudo publicado, mas com poucos casos ou com derivação indireta
  (Haastrup, com 41 casos, e Shapley) ficam, marcadas como confiança baixa para a médica.
- A linha de maços-ano do pulmão (`base-clinica-oncologia.md:58`) divide por 1/0,27 e
  depende do "valor assumido" de quem nunca fumou (linha 57). As duas ganham fonte
  juntas ou saem juntas. Tirar só a 57 deixaria a 58 sem base **(decisão do Claude)**.

### Números fora da base de conhecimento (decisão do Claude)

A R1 vale também para números fora das tabelas da base:

- Os limiares de alarme em `redFlags.js`: SpO₂ < 90, FC > 150, glicemia > 350.
- `wearableEvidence.js`.
- A heurística de SpO₂ < 92 em `openaiService.js:187`.
- As faixas de exame, hoje geradas pelo GPT-4o sem fonte (`openaiService.js:25-34`).

Para esses números:

- **Alarme nunca sai do motor por falta de fonte.** Tirar alarme é risco de segurança.
  Ele fica e ganha fonte do mesmo nível.
- **As faixas de exame** passam a vir da base, com fonte, e não do GPT.

### Contrato

- `tests/kb.sources.test.js` passa a barrar:
  - Fonte `HIP_*` na base.
  - Linha sem `sourceCode`.
  - Fonte de livro sem edição e página, ou fonte de diretriz ou base sem URL e ano.
- Vale considerar um campo de tipo em `ClinicalSource` (livro, diretriz, base oficial,
  estudo) para o teste conferir o nível.

Esta é a parte mais longa, porque depende de pesquisa. Pode correr em paralelo às outras.

## Parte 7. Demo e materiais da feira

- **Seed:** as personas continuam, com os usuários `roberto`, `joao`, `marina` e `ana` e
  as mesmas senhas.
- **Slides:** um slide novo em `Docs/feira/gerador-slides.cjs` lista os logins, visíveis
  no slide e não só nas notas **(decisão do Claude)**. O `slides.pptx` é gerado de novo.
- **Roteiro e checklist:**
  - `Docs/feira/roteiro-demo.md`, `Docs/feira/checklist-stand.md` e o `README.md` deixam
    de falar em "clicar no card" e passam a usar usuário e senha.
  - A parte do `/teste` no roteiro é reescrita, porque não há mais card por câncer.
  - A parte da médica fica igual.
- **Banner, pitch e FAQ seguem a R2 já na feira.** O banner ainda não foi impresso.
  - `Docs/feira/banner.html` hoje promete "Qual exame de câncer você deveria fazer? Uma
    IA que estima o risco de 5 cânceres". Muda para a proposta de prevenção: o que fazer
    para manter a saúde e quais exames preventivos cabem na idade da pessoa.
  - `pitch.md` e `faq-banca.md` mudam do mesmo jeito para o visitante. O risco de câncer
    continua sendo assunto da médica.
  - O banner gera um PDF novo.

## Em aberto

- **Item 4 do grupo, "pedir a senha do cartão depois do cadastro":** não existe nada de
  cartão no app e ninguém sabe o que o item quer dizer. Fica fora até o grupo explicar.
- **Edição do Guyton e página impressa:** ninguém tem registrado. A ficha sai com
  capítulo e página do PDF, marcada "a conferir".

## Prazo e ordem

- **Prazo:** tudo hoje, 22/10. A feira é no sábado, 24/10.
- **Ordem (decisão do Claude):**
  1. Parte 1 (entrada) e Parte 3 (menu): rápidas e destravam o grupo.
  2. Parte 4 (o paciente não vê doença).
  3. Parte 5 (metas com fonte). Depende da 4 para o próximo passo.
  4. Parte 2 (primeiro acesso). O tutorial vem depois do resultado da triagem, que muda
     na 4.
  5. Parte 7 (demo e feira). Depende da 1 e da 4.
  6. Parte 6 (base com fonte). Começa já, em paralelo, e fecha por último.
- **Risco do prazo:** a auditoria das 8 crônicas (Parte 6) depende de pesquisa e é a
  parte com mais chance de não fechar hoje. Pela própria regra, doença que ficar sem
  fonte até o congelamento sai do motor. Isso pode mudar a demo, por exemplo o João,
  que hoje sai CRITICAL por diabetes. Nesse caso o roteiro é ajustado ao que ficou.

## Fica a cargo do builder

- Como guardar a versão do relatório do paciente: gravada ou montada na leitura.
- O componente do tutorial: próprio ou biblioteca pequena. Preferência por não adicionar
  dependência.
- Como medir progresso de meta de ação única, como "agendar consulta": marcar como feita
  ou detectar consulta agendada.
- Se a checagem de usuário repetido acontece ao vivo, enquanto a pessoa digita, ou só no
  envio.
