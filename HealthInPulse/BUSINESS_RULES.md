# Regras de negócio — Backend HealthInPulse v8

Este documento descreve em detalhes **todas** as regras de negócio
implementadas hoje no backend, organizadas por domínio. Sempre que possível
referencia o arquivo/função responsável.

Duas regras valem para tudo (design de 22/10/2026,
`Docs/superpowers/specs/2026-10-22-correcoes-do-grupo-e-base-com-fonte-design.md`):

- **R1. Base com fonte.** Todo número que o motor ou a IA usa tem fonte do nível
  do Guyton & Hall (livro-texto, diretriz oficial, base oficial), documentada.
  Sem fonte, não entra.
- **R2. O paciente nunca ouve doença.** Tela, API, socket e o `/teste` do
  paciente não carregam nome, código nem probabilidade de doença. O filtro é
  no backend (`services/patientView.js`). A médica vê o risco por doença.

---

## 1. Autenticação e autorização

### 1.1 Cadastro (`POST /api/auth/register`)

Implementado em `services/authService.js::register`.

- **Só paciente se cadastra**, com **usuário, nome e senha**. A médica já tem
  login pronto (seed). O resto do corpo é ignorado (`role`, `cpf`, `healthCoins`...).
- Usuário: 3 a 30 caracteres, letras minúsculas sem acento, números, `.` e `_`;
  gravado em minúsculas; único (HTTP 409 "Esse usuário já existe, escolha outro").
- Senha mínima de **8 caracteres** (validado em `routes/authRoutes.js`).
- Senha é guardada como hash bcrypt com **12 rounds**.
- O `Patient` é criado em **transação única** junto com o `User` e já sai
  **vinculado a toda médica cadastrada** (`DoctorPatient`), para o alerta da
  triagem ter destino.
- Imediatamente após cadastrar, o backend emite o par de tokens — o usuário já
  sai logado. `User.tutorialSeenAt` nasce nulo: o primeiro acesso começa pela
  triagem e o tutorial das abas abre depois do resultado (ou em "Fazer depois").
  `POST /api/auth/tutorial-seen` grava como visto.

### 1.2 Login (`POST /api/auth/login`)

- Usuário e senha são obrigatórios (o login é por **usuário**, não e-mail).
- Erro: 401 "Usuário ou senha inválidos". O interceptor do frontend não trata
  esse 401 como sessão expirada (não recarrega a página nem apaga o formulário).
- Usuário precisa estar com `isActive=true`.
- Comparação de senha via `bcrypt.compare`.
- **Em todo login bem-sucedido**: registra um `AuditLog` com `action='LOGIN'`.
- Devolve `{ user, accessToken, refreshToken }` — `user.fullName` e
  `user.healthCoins` (paciente) já incluídos.

### 1.3 Tokens JWT

- **Access token**: validade **15 minutos** (configurável via `JWT_ACCESS_EXPIRY`).
- **Refresh token**: validade **7 dias** (`JWT_REFRESH_EXPIRY`), persistido em
  `RefreshToken` no banco.
- **Rotação de refresh**: a cada `POST /api/auth/refresh`, o token apresentado
  é **deletado** e um novo par é emitido. Reuso de refresh token é
  automaticamente bloqueado.
- Mudança de senha (`POST /api/auth/change-password`) **invalida TODOS** os
  refresh tokens do usuário, forçando login novamente em todos os dispositivos.

### 1.4 Autorização por role

Middleware `authorize('PATIENT')` ou `authorize('DOCTOR')` em
`middlewares/authMiddleware.js`. Aplicado prefixo-a-prefixo em rotas:

- `/api/patient/*` → só `PATIENT`
- `/api/doctor/*`  → só `DOCTOR`
- `/api/goals/*`   → só `PATIENT`
- `/api/rewards/*` → só `PATIENT`
- `/api/triage/*`  → só `PATIENT`
- `/api/exams`     → upload e gestão por `PATIENT`; leitura específica por `DOCTOR`
- `/api/knowledge/*` → só `DOCTOR` (Base da IA; editar exige `KB_EDIT`, ver §16)
- `/api/public/*`  → **sem login** (teste rápido, ver §15)
- `/api/auth/me`   → qualquer autenticado

### 1.5 Vínculo médico↔paciente

Tabela `DoctorPatient` (relação n:m). **Regras**:

- Apenas pacientes vinculados aparecem em `GET /api/doctor/patients`.
- Toda rota do médico que acessa dados de um paciente específico chama
  `assertLink(doctorId, patientId)` no `doctorService.js`. Se não houver
  vínculo, retorna **HTTP 403 "Paciente não vinculado"**.
- Em produção, o vínculo seria criado quando o paciente compartilha código de
  convite com o médico. **No demo, os 3 pacientes (Roberto, Marina e João) são
  pré-vinculados via seed**. O endpoint `POST /api/doctor/patients` ainda existe mas não tem mais
  UI exposta.

### 1.6 Rate-limit

Em **produção** (`NODE_ENV=production`), o endpoint `/api/auth` aceita
no máximo **30 tentativas em 15 minutos** por IP (ajustável com
`AUTH_RATE_LIMIT`: o `render.yaml` usa 300 e o `npm run stand` usa 1000, porque
a sala toda sai por um IP só). Em desenvolvimento, fica **desativado** para
facilitar testes manuais (definido em `src/app.js`).

`/api/public` tem limite próprio, **sempre ativo**: 300 requisições por minuto
por IP (`PUBLIC_RATE_LIMIT`) e corpo de até 16 KB.

### 1.7 Portão da demo (`DEMO_PASSWORD`)

Com `DEMO_PASSWORD` definida, o servidor só entrega o app a quem digitou a
senha da turma (vale 30 dias no navegador). Sem a variável, não há portão. É
para a demo pública, porque as senhas dos usuários de demo são públicas. **Na
feira fica vazia** (visitante entra pelo QR direto no `/teste`) e o `npm run
stand` nunca liga o portão, mesmo com a variável no ambiente ou no `.env`.

---

## 2. Pacientes e sinais vitais

### 2.1 Estrutura do perfil

`Patient` tem campos cadastrais opcionais (data de nascimento, sexo, tipo
sanguíneo, altura, peso; o CPF saiu do app e a coluna ficou só para dados
antigos). Idade e sexo do motor vêm da triagem, contato de emergência e os arrays JSON-serializados:

- **`allergies`** — lista de strings (ex: `["Penicilina", "Dipirona"]`)
- **`chronicConds`** — condições crônicas (ex: `["Hipertensão", "DM2"]`)

Esses arrays são desserializados automaticamente quando saem da API (via
`utils/jsonField.js::parsePatient`).

### 2.2 Faixas normais (base clínica)

Fonte única no backend: `services/clinical/data/prevention.js` (`normalRanges`,
com `sourceCode` de cada faixa no `ClinicalSource`). O frontend repete em
`pages/patient/Dashboard.jsx` (`RANGES`). Fichas: `Docs/base-clinica-fisiologia.md`.

| Vital              | Normal                | Fonte                                   |
|--------------------|-----------------------|-----------------------------------------|
| Frequência cardíaca| 60–100 bpm            | Guyton & Hall (taqui >100, bradi <60)    |
| SpO₂               | a partir de 95%       | Guyton & Hall (gasometria 95–99%)        |
| Pressão            | < 120 / < 80 mmHg     | Diretriz Brasileira de Hipertensão 2025  |
| Temperatura        | sem faixa             | o livro só dá 37,0 °C, sem corte de febre |
| Glicose (pulseira) | sem faixa             | a pulseira não sabe se é jejum           |

> Esses limites são usados para classificar status de cada vital ("normal /
> acima / abaixo") e para calcular o **score de saúde** do paciente.

### 2.3 Score de saúde (Dashboard do paciente)

Calculado em runtime no frontend:

```
score = (vitais dentro da faixa / vitais lidos) * 100, arredondado
```

Categorias:
- `>= 80` → "Bom estado" (verde)
- `>= 60` → "Atenção" (âmbar)
- `<  60` → "Crítico" (vermelho)
- sem dados → "—"

O score recalcula automaticamente a cada tick da pulseira (1s).

### 2.4 Pulseira simulada

`hooks/useLiveVitals.js` gera leituras 1×/s. **Regras**:

- Cada vital tem `baseline` (vem do último vital real do banco), `jitter`
  (amplitude do ruído) e `[min, max]` (clamp absoluto).
- Cada tick: `next = clamp(prev + drift(baseline) + noise, min, max)`
  com **drift = 6% em direção ao baseline** (reversão à média).
- Os números **não fogem da fisiologia** mesmo após muitos ticks.
- A janela deslizante (`spark`) mantém as últimas 30 leituras para
  alimentar os sparklines dos cards.

### 2.5 Sinais vitais persistidos (`VitalSign`)

- Pode ter origem `manual` (registro pelo paciente) ou `wearable` (pulseira).
- Campos opcionais: HR, sistólica, diastólica, SpO₂, temperatura, glicose, peso, freq. respiratória.
- Indexado por `(patientId, recordedAt)` para queries rápidas de tendência.

> No demo, a tela de "Sinais Vitais" foi **removida** da navegação do paciente
> porque os dados chegam via pulseira. Os endpoints continuam existindo para
> ingestão programática (`/api/wearables/ingest`).

---

## 3. Exames

### 3.1 Upload (`POST /api/exams`)

- Tipo aceito: **PDF**, **JPEG**, **PNG**, **WebP**.
- Tamanho máximo: **10 MB**.
- Arquivo salvo em `backend/src/uploads/exams/`.
- Status inicial: `PENDING` → muda para `PROCESSING` ao iniciar análise.
- Processamento é **assíncrono**: responde 202 imediatamente, IA roda em
  background.

### 3.2 Análise pela IA

`services/examService.js::processExam`:

1. Lê arquivo, codifica em base64.
2. Chama `openaiService.analyzeExam`:
   - Com `OPENAI_API_KEY` → GPT-4o-vision com prompt estruturado retornando JSON.
   - Sem chave → retorna placeholder com `riskLevel='INCONCLUSIVE'`.
3. Persiste `ExamResult` (summary, findings JSON, riskLevel).
4. Atualiza `Exam.status='DONE'` (ou `ERROR` em caso de falha).
5. Emite Socket.io `exam:processed`.

### 3.3 Acesso

- **Paciente** vê só seus próprios exames (`/api/exams`).
- **Médico** acessa `/api/exams/doctor/:examId` — exige vínculo com o paciente
  dono do exame (HTTP 403 caso contrário).

---

## 4. Triagem de risco (crônicas e câncer)

A triagem do paciente (`/api/triage`) é um motor bayesiano **adaptativo** em duas
fases. Ela é **triagem de risco, não diagnóstico**. Não usa LLM: a conta é local
e os parâmetros vêm da base de conhecimento no banco (ver §16).

### 4.1 Fluxo e estados

`POST /api/triage/start` abre a sessão; `POST /api/triage/:id/answer` responde e
recebe a próxima etapa (`PROFILE`, `QUESTION` ou `RESULT`). O estado inteiro
(perfil, respostas, fase) fica em `TriageAnswer.answers`:

```
COLLECT_PROFILE → INTERVIEW (crônica) → ONCO_INTERVIEW → COMPLETED
                  (RED_FLAG interrompe em qualquer fase)
```

### 4.2 Perfil (prior)

Idade, sexo, altura, peso/IMC, fumo (maços-ano e anos sem fumar), álcool,
história familiar de câncer (colorretal, mama, ovário, próstata, pulmão) e, para
mulheres, Papanicolau em dia. Idade, sexo e peso vêm do cadastro quando existem.
Esses fatores entram **só no prior** (`PriorRule`), nunca como sintoma.

### 4.3 Fase crônica ("etapa 1 de 2")

Desde a auditoria de 22/10/2026 (R1), **escores validados com os cortes
oficiais**, sem porcentagem (`clinical/chronicScores.js`). O motor bayesiano da
v7 saiu da triagem: os LRs por sintoma não tinham fonte (os números continuam no
banco como histórico, marcados "fora de uso"; o golden test ainda confere o
código antigo).

| Condição  | Escore      | Corte (faixa)                                | Fonte                         |
|-----------|-------------|----------------------------------------------|-------------------------------|
| Apneia    | STOP-Bang   | 0–2 baixo · 3–4 intermediário · 5–8 alto      | Chung 2016                    |
| DM2       | FINDRISC    | < 7 · 7–11 · 12–14 · 15–20 alto · > 20 muito alto | SBD 2025 (Tabela 2)       |
| Depressão | PHQ-2 → PHQ-9 | PHQ-2 ≥ 3 abre o PHQ-9; PHQ-9 ≥ 10          | Kroenke 2003/2001, Levis 2019 |

- Perguntas fixas, nesta ordem: sinais de alarme (dor no peito, déficit
  neurológico, pior dor de cabeça, desmaio), PHQ-2, STOP-Bang, FINDRISC e, se o
  PHQ-2 der ≥ 3, o resto do PHQ-9. A história familiar de diabetes vem do perfil.
- Após cada resposta, os **red flags** (`redFlags.js`) são verificados.
- Nível: HIGH se STOP-Bang ≥ 5, FINDRISC > 20 ou PHQ-9 ≥ 20; MODERATE se algum
  passa do corte; senão LOW. É um mapeamento das faixas oficiais, sem corte de
  probabilidade.
- Saíram por falta de fonte: CV/HAS, síndrome metabólica, arritmia/FA, DPOC e
  hipotireoidismo. A pulseira não vira mais "sintoma" (as conversões tinham
  pesos inventados); ela aparece contra a faixa normal e nos alarmes.

### 4.4 Fase oncológica ("etapa 2 de 2")

Até **6 perguntas** do painel `ONCOLOGIA`, escolhidas pelo `questionRunner`:
`score = Σ |ln LR+| / custo`, somando só os cânceres **elegíveis** (sexo e idade
mínima). A entropia global não serve aqui (com P ≈ 0,2% quase não há entropia).
Não pergunta o que já foi respondido nem o que um achado objetivo substitui. Cada
pergunta traz o "por que estamos perguntando" em linguagem calma. A fase pode ser
desligada com `ONCO_PHASE_ENABLED = false` (volta à triagem só crônica).

### 4.5 Como o risco de câncer é calculado

Cinco cânceres: colorretal, pulmão, mama, próstata e colo do útero. Detalhe e
fonte de cada número: [`Docs/base-clinica-oncologia.md`](./Docs/base-clinica-oncologia.md).

1. **Prior** = probabilidade de diagnóstico em 2 anos ≈ 2 × a incidência anual
   da faixa de idade e sexo (GLOBOCAN 2022 Brasil, calibrado pela taxa bruta do
   INCA 2026).
2. **Fatores de risco** (fumo, história familiar, álcool, IMC, Papanicolau
   atrasado...) **multiplicam** o prior (`PriorRule`, efeito `multiply`).
3. **Sintomas, exames e balança** entram só como likelihood:
   `logit(posterior) = logit(prior) + Σ peso × ln LR`. "Sim" usa LR+, "não" usa
   LR−; "não sei" (`null`) conta como respondida e não vira evidência.
4. **Risco relativo** = posterior ÷ prior da faixa (a média da mesma idade e sexo).
5. **Categoria** (`riskEngine`):

| Categoria    | Regra                                   | No banco  |
|--------------|-----------------------------------------|-----------|
| `INVESTIGAR` | posterior ≥ 3% (limiar do NICE NG12)    | `HIGH`    |
| `ATENÇÃO`    | posterior ≥ 1% **ou** risco relativo ≥ 2| `MODERATE`|
| `ROTINA`     | o resto                                 | `LOW`     |

Os limiares (3% e 1%) são colunas de `Condition` e a médica pode editá-los.
Cada resultado traz o **"por quê" fator a fator** (contribuição de cada
evidência) e a conta fecha: `logit(prior) + Σ delta = logit(posterior)`.

**Exibição.** O naive Bayes fica confiante demais com evidências correlacionadas
(FIT+ e anemia, por exemplo). Por isso acima de **20%** a tela mostra "≥20%"
(o número exato continua no motor). A **médica** vê o % em 2 anos, marcado como
estimativa didática; o **visitante** e o **paciente** veem a categoria, "vezes a
média da sua idade" e a frequência natural ("~3 em 1.000"), sem vermelho. O
risco relativo não é mostrado em INVESTIGAR ("285× a média" assusta e o modelo
exagera).

### 4.6 Exames e balança como evidência

- **Exames** (`labEvidence.js`): cada `LabRule` liga o nome de um achado de
  `ExamResult.findings` (por alias, sem acento, nunca por prefixo: "hemoglobina
  glicada" não vira hemoglobina) a um sintoma, com operador e limiar. Exemplos:
  Hb < 13 (homem) ou < 12 (mulher), sangue oculto/FIT positivo, BI-RADS 4/5, PSA
  acima do corte da faixa de idade, Papanicolau alterado, HPV de alto risco. Vale
  o exame mais recente do mesmo sintoma; exame com mais de 365 dias é ignorado
  (`maxAgeDays`); resultado normal só vira evidência se a regra tem
  `emitNegative`; vírgula decimal é aceita.
- **Tendência de peso** (`wearableEvidence.collectWeightTrend`): com leituras de
  peso nos últimos 180 dias, queda ≥ **5%** em relação ao maior peso anterior vira
  o achado `perda_peso_objetiva`. Só vale com série suficiente ("pesado na
  balança"). Quando a balança confirma a perda, a resposta "perdi peso" **não é
  contada de novo** nos cânceres que usam a balança (`riskEngine.SUPERSEDES`).

### 4.7 Rastreamento

`screening.js` escolhe, para cada câncer que vale para o sexo da pessoa, a regra
de maior prioridade que se aplica:

| Status                  | Significado                                              |
|-------------------------|----------------------------------------------------------|
| `INDICADO_AGORA`        | regra POPULACIONAL ou ALTO_RISCO na faixa de idade       |
| `DECISAO_COMPARTILHADA` | conversar com o médico (ex.: PSA)                        |
| `FUTURO`                | vai valer quando chegar à idade inicial (ex.: aos 45)    |

Exemplos: FIT bienal de 50 a 75 anos (e colonoscopia para alto risco); mamografia
de 50 a 74 (anual de 40 a 49 por decisão compartilhada, ou de 30 a 74 em alto
risco); DNA-HPV ou preventivo de 25 a 64; tomografia de baixa dose para
fumante/ex-fumante de alto risco; PSA por decisão compartilhada. Câncer em
**INVESTIGAR** não recebe "faça o rastreamento": o próximo passo é a avaliação
médica (`investigate: true`).

### 4.8 Fechamento e níveis

O `finalize` junta perfil, respostas, exames e balança no `riskEngine.assess`. O
nível final da triagem é o **maior entre o crônico e o oncológico**: ROTINA não
sobe nada, ATENÇÃO sobe até `MODERATE`, INVESTIGAR até `HIGH`. Red flag manda no
nível (`CRITICAL` em emergência, `HIGH` nos demais), mas o risco oncológico do que
já foi respondido continua no resultado.

| Nível      | Quando ocorre                                                               |
|------------|------------------------------------------------------------------------------|
| `LOW`      | escores abaixo dos cortes, câncer em ROTINA e sem red flag                  |
| `MODERATE` | algum escore acima do corte, ou algum câncer em ATENÇÃO                     |
| `HIGH`     | escore em faixa alta, red flag não emergencial, ou câncer em INVESTIGAR; no demo, o João (STOP-Bang 6, FINDRISC 23) |
| `CRITICAL` | emergência (red flag)                                                       |

Depois: grava `COMPLETED`, cria o `AiReport` (`triage`), gera as metas (§5.3),
credita +20 coins e emite `triage:completed` ao paciente (só com o próximo passo). Câncer em INVESTIGAR cria
uma `Notification` ALERT para as médicas vinculadas; HIGH/CRITICAL emitem
`triage:alert` (§8.2). O confete só sai quando o próximo passo é manter a rotina.

### 4.9 Sugestões

As `suggestions` do `AiReport` continuam com o texto clínico, mas são **da médica**.
O paciente recebe o **próximo passo** (`patientView.nextStepFor`):

| Resultado do motor                                                         | Próximo passo do paciente |
|----------------------------------------------------------------------------|---------------------------|
| red flag                                                                   | `AGORA` (192, ou 188 no CVV) |
| câncer em ATENÇÃO/INVESTIGAR, rastreamento ALTO_RISCO, crônica ≠ LOW        | `CONSULTA`                |
| LOW e nada acima                                                           | `ROTINA`                  |

Junto vão os sinais da pulseira contra a faixa normal e os exames preventivos
POPULACIONAL e de decisão compartilhada (sem dizer o que previnem). Sem prazo
sem fonte ("24h", "7 dias") para o paciente.

### 4.10 Onde o LLM e o simulador ainda entram

Triagem e teste rápido **não** chamam LLM. `openaiService`/`aiSimulator` seguem
em: análise de exames (placeholder `INCONCLUSIVE` sem chave), relatório completo
da médica (§6) e texto de apoio. O `aiSimulator` é determinístico, por palavras-chave.

---

## 5. Gamificação

### 5.1 Metas de saúde (`HealthGoal`)

- Cada meta tem um **`metric`** (`heartRate`, `systolic`, `glucose`, `weight`,
  `steps`, `spo2` ou `custom`) e um **`targetCmp`** (`lte`, `gte`, `between`).
- Combinações típicas:
  - "Reduzir glicemia" → `metric='glucose'`, `targetCmp='lte'`, `targetValue=130`
  - "Caminhar 7000 passos" → `metric='steps'`, `targetCmp='gte'`, `targetValue=7000`
  - "Dormir 7-9h" → `metric='custom'`, `targetCmp='between'`, `rangeMin=7`, `rangeMax=9`
- **`progress`** (0–100) é calculado por `goalService.computeProgress`:
  - `lte`: progresso é proporcional à distância percorrida do baseline (rangeMax) até o target.
  - `gte`: idem, mas crescendo.
  - `between`: cheio quando está na faixa; cai proporcionalmente à distância do centro.
- **`status`**: `ACTIVE` → `DONE` (atingiu 100%) ou `EXPIRED` (não usado ainda).
- **`coinsReward`**: padrão **50**, ajustável por meta (universais valem ~30-50, adaptadas a HAS/DM2 valem 60-80).
- **`source`**: `triage` (geradas automaticamente) ou `manual` (criação direta).

### 5.2 Atualização de progresso

`PATCH /api/goals/:id/progress { current }`:

1. Valida que a meta pertence ao paciente autenticado.
2. Recalcula `progress`.
3. Se progresso atinge **100% e status era `ACTIVE`**:
   - Marca `status='DONE'` e `completedAt=now()`.
   - Credita `coinsReward` (em transação atômica).
4. Retorna `{ goal, justCompleted: boolean }`.

### 5.3 Geração automática a partir da triagem

`goalService.generateGoalsFromTriage(patientId, { profile, wearable, nextStep }, triageId)`.
Meta só nasce de um modelo de `data/prevention.js` (`goalTemplates`), e todo
modelo tem fonte (`HealthGoal.sourceCode`) ou vem do próximo passo. O texto
nunca cita doença. Meta com o mesmo `templateCode` já ativa não é recriada.

| Modelo             | Quando                                  | Fonte                         |
|--------------------|-----------------------------------------|-------------------------------|
| `CONSULTA`         | próximo passo = CONSULTA                | resultado da triagem          |
| `PARAR_DE_FUMAR`   | fuma (4 sessões iniciais no SUS)        | MS, PCDT do tabagismo 2020    |
| `ATIVIDADE_150`    | todo adulto (150 min/semana)            | OMS 2020 · MS 2021            |
| `REDUZIR_ALCOOL`   | bebe alguma dose por semana             | OMS 2023 · INCA 2024          |
| `IMC_NORMAL`       | IMC ≥ 25 (peso do IMC 24,9)             | OMS (TRS 894)                 |
| `FC_REPOUSO_NORMAL`| FC de repouso da pulseira > 100         | Guyton & Hall                 |
| `PA_NORMAL`        | pulseira ≥ 130 e/ou ≥ 80 (< 130/80)     | Diretriz de Hipertensão 2025  |

Saíram por falta de fonte do mesmo nível: água 2 L, 7000 passos, sono 7–9 h,
glicemia < 130/110, PA < 125, "nova triagem em 7 dias". A lista vai com a fonte
em texto curto (`sourceLabel`).

### 5.4 Health Coins

Modelo: tabela `HealthCoinTx` (movimentações) + `Patient.healthCoins` (saldo
desnormalizado).

**Regras invariantes**:
- Todo crédito/débito **sempre** cria uma `HealthCoinTx` E atualiza o saldo na mesma transação.
- Saldo desnormalizado existe só para performance de leitura — recalculável pelo somatório das transações.
- Saldo nunca pode ficar negativo. Tentativa de débito sem saldo → HTTP 400 "Saldo insuficiente".

**`HealthCoinTx.refType`** distingue origem:
- `goal` → conclusão de meta
- `redemption` → resgate de recompensa (delta negativo)
- `triage` → bônus de triagem (+20)
- `bonus` → bônus manual (boas-vindas, sequência de dias, etc.)

### 5.5 Catálogo de recompensas (`Reward`)

Populado no seed. 6 itens iniciais:

| Item                              | Tipo          | Custo (coins) |
|-----------------------------------|---------------|---------------|
| Guia nutricional personalizado    | item          | 50            |
| Desconto de 20% em exames lab.    | discount      | 150           |
| Kit fitness Care Plus             | item          | 200           |
| Consulta com nutricionista        | consultation  | 300           |
| Consulta com especialista         | consultation  | 500           |
| Check-up cardiológico completo    | exam          | 800           |

`Reward.available` permite desativar item sem deletar.

### 5.6 Resgate (`POST /api/rewards/:id/redeem`)

Implementado em `rewardService.redeem` — **toda lógica em uma transação**:

1. Valida que reward existe e está disponível.
2. Verifica saldo do paciente ≥ custo. Se não, HTTP 400.
3. Cria `RewardRedemption` (status `PENDING`).
4. Cria `HealthCoinTx` com `delta = -costCoins`.
5. Decrementa `Patient.healthCoins`.

Status do resgate evolui:
- `PENDING` → recém resgatado, aguardando aprovação interna Care Plus
- `APPROVED` → benefício liberado (mudaria via painel admin não exposto)
- `DENIED` → recusado (com refund manual de coins — não automatizado)

> O fluxo de aprovação não é parte do MVP demo. Resgates ficam em `PENDING`
> mesmo. O paciente vê o status em "Meus resgates".

---

## 6. Relatórios de IA (`AiReport`)

### 6.1 Tipos

- **`triage`** — gerado automaticamente após cada triagem submetida.
- **`full`** — relatório completo solicitado pelo médico.
- (`vitals`, `exam` reservados, não em uso ativo).

### 6.2 Geração de relatório completo (`POST /api/ai-reports/generate/:patientId`)

Apenas médicos vinculados. Em `aiReportRoutes.js::generateFullReport`:

1. `assertLink` — médico precisa estar vinculado ao paciente.
2. Carrega contexto: paciente, últimos 10 vitais, últimos 5 exames com
   resultado, últimas 3 triagens completas.
3. Chama `openaiService.generateHealthReport`:
   - Com chave → GPT-4o monta markdown estruturado.
   - Sem chave → **fallback determinístico** que monta markdown com seções
     fixas (Resumo, Vitais, Exames, Triagens, Conclusão) e classifica risco
     com base em heurística:
     - SpO₂ < 94 OR sistólica > 140 OR glicemia > 160 → `HIGH`
     - SpO₂ < 96 OR sistólica > 130 OR glicemia > 130 → `MODERATE`
     - caso contrário → `LOW`
4. Salva `AiReport` com `type='full'`, `doctorId`, `content`, `riskLevel`, `suggestions`.

### 6.3 Acesso aos relatórios

- **Paciente** lista os seus em `GET /api/ai-reports` e abre detalhe em
  `/my/:reportId`, sempre na versão do paciente (`patientView.reportForPatient`):
  o de triagem vira a visão de prevenção; os outros aparecem só com o aviso
  "feito para a sua médica". Sem `content`, `riskLevel` nem `suggestions`.
- **Médico** abre o detalhe de um relatório do seu paciente em
  `/doctor/:reportId` (com `assertLink`).

---

## 7. Consultas (`Appointment`)

### 7.1 Agendamento

Em `appointmentRoutes.js::create`:

- Apenas paciente vinculado ao médico pode agendar com ele (HTTP 403 caso
  contrário).
- **Conflito de agenda do médico**: se já houver consulta `SCHEDULED` ou
  `CONFIRMED` em janela de ±`duration` minutos, retorna HTTP 409.
- `duration` padrão é 30 min (entre 15 e 120, validado).

### 7.2 Mudança de status

- `SCHEDULED` → `CONFIRMED` (paciente ou médico)
- `SCHEDULED`/`CONFIRMED` → `CANCELLED` (ambos)
- `CONFIRMED` → `COMPLETED` (médico, após a consulta)
- Notas (`notes`) podem ser anexadas em qualquer transição.

### 7.3 Listagem

- **Paciente**: `GET /api/appointments/my` — só suas consultas.
- **Médico**: `GET /api/appointments/doctor` — toda a agenda dele.
- Dashboards filtram por `{ status: ['SCHEDULED', 'CONFIRMED'] }` e
  `scheduledAt >= now` para mostrar só as próximas.

---

## 8. Notificações

### 8.1 Tipos

`Notification.type`:
- `ALERT` — alerta clínico moderado (ex: tendência de glicemia em alta)
- `CRITICAL` — alerta crítico (ex: SpO₂ baixa em série)
- `INFO` — info geral (ex: exame processado, novo relatório)
- `REMINDER` — lembrete (ex: consulta em 2 dias)

### 8.2 Geração

- Pulseira → `wearableRoutes.js::analyzeAndAlert` cria notificação quando a
  IA classifica vital como severidade `medium` ou `high`.
- Triagem com câncer em INVESTIGAR → `Notification` ALERT ("Triagem: sinais para
  investigar") para cada médica vinculada.
- Triagem com risco HIGH/CRITICAL → evento Socket.io `triage:alert` para a sala
  `user:<userId>` de cada médica vinculada (sem persistência; só o evento).
- Exames processados → notificação INFO ao paciente.

### 8.3 Leitura

- `GET /api/notifications` — listagem (com paginação).
- `GET /api/notifications/unread-count` — contagem não lidas (badge no sino do topbar).
- `PATCH /api/notifications/:id/read` — marca uma como lida.
- `PATCH /api/notifications/read-all` — marca todas.

---

## 9. Painel médico

### 9.1 Dashboard (`GET /api/doctor/dashboard`)

Agrega em uma única chamada:

- `totalPatients` — pacientes vinculados
- `criticalAlerts` — relatórios HIGH/CRITICAL nas últimas 24h
- `todayAppointments` — consultas SCHEDULED/CONFIRMED hoje
- `upcomingAppointments` — próximas 5 consultas
- `recentReports` — últimos 5 relatórios IA gerados
- `riskDistribution` — contagem de pacientes por nível do **último** relatório
- `appointmentsByDay` — agenda dos próximos 7 dias (count por dia)
- `criticalPatients` — pacientes com último relatório HIGH/CRITICAL

### 9.2 Consolidado por paciente (`GET /api/doctor/patients/:id/consolidated`)

Bundle usado pela aba **Wearable**:

- Identidade do paciente (nome, sexo, condições crônicas, alergias)
- Último vital persistido
- 30 dias de vitais (para os 3 mini-gráficos)
- Últimos 5 exames com resultado
- Últimos 3 relatórios IA
- Todas as metas (ativas + concluídas)
- Última triagem completa

Acesso requer vínculo (HTTP 403 se não vinculado).

### 9.3 Histórico (`GET /api/doctor/patients/:id/history`)

Agregação cronológica usada na aba **Histórico** (timeline). **Eventos
unificados**:

| Tipo (`kind`)      | Origem                                       |
|--------------------|----------------------------------------------|
| `appointment`      | Tabela `Appointment` (qualquer status)       |
| `exam`             | Tabela `Exam` (+ resultado se disponível)    |
| `aiReport`         | Tabela `AiReport`                            |
| `goal`             | `HealthGoal` com `status='DONE'`             |
| `triage`           | `TriageAnswer` com `status='COMPLETED'`      |
| `alert`            | `Notification` tipo `ALERT`                  |
| `critical`         | `Notification` tipo `CRITICAL`               |

Todos ordenados por data desc, **agrupados por dia** no frontend.

---

## 10. Wearables / Pulseira (legacy)

Embora a UI de "Dispositivos" tenha sido removida do menu do paciente, o
backend continua mantendo o endpoint **`POST /api/wearables/ingest`** com
payload genérico:

```json
{ "deviceId": "...", "payload": { "heart_rate": 92, "spo2": 96, ... } }
```

Em `wearableRoutes.js::ingestWearableData`:

1. Persiste payload bruto em `WearableData`.
2. Extrai sinais vitais conhecidos via `extractVitalsFromPayload` (mapeamento
   tolerante: `heart_rate`/`heartRate`/`spo2`/`oxygen_sat`/etc.).
3. Se algum vital extraído, cria `VitalSign` com `source='wearable'`.
4. Chama `analyzeAndAlert` que pode disparar notificação.
5. Atualiza `lastSyncAt` do `Device`.

Útil para integração externa futura (sem mexer na UI atual).

---

## 11. Auditoria

`AuditLog` registra eventos sensíveis. **Atualmente** só LOGIN e LOGOUT
são logados:

```js
{ userId, action: 'LOGIN', entity: 'User', entityId: userId, ip, userAgent, createdAt }
```

O schema suporta também `CREATE`, `UPDATE`, `DELETE`, `VIEW`, `EXPORT` para
expansão futura.

---

## 12. Persistência e particularidades do SQLite

### 12.1 Campos JSON-serializados

Como SQLite via Prisma não suporta `Json` nativo, os campos abaixo são
`String` no banco e (de)serializados em runtime pelos helpers em
`utils/jsonField.js`:

| Tabela           | Campo          | Tipo lógico  |
|------------------|----------------|--------------|
| `Patient`        | `allergies`    | string[]     |
| `Patient`        | `chronicConds` | string[]     |
| `ExamResult`     | `findings`     | object[]     |
| `TriageAnswer`   | `answers`      | object (estado da sessão: perfil, respostas, fase, resultado) |
| `AiReport`       | `suggestions`  | object[]     |
| `Notification`   | `metadata`     | object       |
| `WearableData`   | `payload`      | object       |

A API **sempre devolve esses campos já desserializados** (arrays/objetos).

### 12.2 Enums lógicos

Não há enums no SQLite — campos são `String`. As constantes lógicas estão
documentadas no topo do `schema.prisma`. As regras de validação ficam por
conta da camada de service e dos validators das rotas.

### 12.3 Paginação

Todo endpoint paginado aceita `?page=` e `?limit=`. **Os services convertem
explicitamente para `Number(...)` antes de passar ao Prisma**, porque o
Prisma 5 rejeita strings em `skip`/`take`.

---

## 13. Resumo das invariantes críticas

| Invariante                                                                 | Como é garantida                                      |
|----------------------------------------------------------------------------|-------------------------------------------------------|
| Saldo de coins nunca negativo                                              | `coinService.debit` valida e `rewardService.redeem` em transação |
| Saldo desnormalizado = soma das transações                                 | Toda alteração de saldo está dentro de `$transaction` com `HealthCoinTx` |
| Apenas médico vinculado vê dados do paciente                               | `doctorService.assertLink` em todo endpoint sensível  |
| Refresh token usado é invalidado                                           | `authService.refresh` faz delete + insert na mesma chamada |
| Mudança de senha desloga em todos os dispositivos                          | `authService.changePassword` deleta `RefreshToken` do user |
| Conflito de agenda do médico bloqueia novo agendamento                     | `appointmentRoutes.create` testa janela ±duration     |
| Triagem com risco HIGH/CRITICAL avisa só as médicas vinculadas             | Socket.io `triage:alert` para a sala `user:<userId>` de cada vínculo (`DoctorPatient`) |
| Teste rápido público não grava nada e não loga o corpo                     | `quickTestService` puro; `publicRoutes` sem Prisma de escrita; morgan só registra a URL |
| Câncer nunca sai como diagnóstico                                          | Categoria + "estimativa didática" + disclaimer em toda tela da médica |
| Paciente e visitante nunca recebem doença (R2)                             | `patientView` em toda rota/evento do paciente e no `/teste`; contrato em `tests/r2.patient.test.js` |
| Meta e faixa normal só com fonte (R1)                                      | `data/prevention.js` (`sourceCode` no `ClinicalSource`); teste em `onco.personas.db.test.js` |
| Fator demográfico/de risco entra só no prior; sintoma/exame/balança só como likelihood | Teste de contrato (`kb.priors.test.js`) |
| Base de conhecimento só é editável com `KB_EDIT=true`                      | `knowledgeService.assertEditable` (fail-closed: ausente ou outro valor = 403) |
| Toda edição da base deixa histórico e muda a versão                        | `KnowledgeVersion` gravada na mesma transação do PATCH |
| Sem `OPENAI_API_KEY` o sistema continua funcional                          | `openaiService` tem fallbacks em todos os 4 métodos   |
| Score, sparklines e cards refletem a pulseira em 1s                        | `useLiveVitals` + `useCountUp` no frontend            |

---

## 14. Onde encontrar cada regra no código

| Domínio              | Arquivo principal                                        |
|----------------------|----------------------------------------------------------|
| Autenticação         | `backend/src/services/authService.js`                    |
| Pacientes/Vitais     | `backend/src/services/patientService.js`                 |
| Médico/Painel        | `backend/src/services/doctorService.js`                  |
| Exames               | `backend/src/services/examService.js`                    |
| Triagem              | `backend/src/services/triageService.js`                  |
| Motor de risco       | `backend/src/services/clinical/` (`bayes`, `riskEngine`, `questionRunner`, `labEvidence`, `screening`) |
| Base de conhecimento | `backend/src/services/clinical/kb/kbRepository.js` + `backend/src/prisma/seedKnowledge.js` |
| Dados de partida     | `backend/src/services/clinical/data/` (`oncology.js`, `chronicCatalog.js`, `chronicPriorRules.js`) |
| Teste rápido público | `backend/src/services/quickTestService.js` + `routes/publicRoutes.js` |
| Painel de riscos     | `backend/src/services/riskService.js`                    |
| Base da IA           | `backend/src/services/knowledgeService.js` + `routes/knowledgeRoutes.js` |
| Stand                | `scripts/stand.mjs`, `scripts/qr.mjs`, `render.yaml`      |
| Metas                | `backend/src/services/goalService.js`                    |
| Coins                | `backend/src/services/coinService.js`                    |
| Recompensas          | `backend/src/services/rewardService.js`                  |
| Relatórios IA        | `backend/src/routes/aiReportRoutes.js`                   |
| IA real e fallback   | `backend/src/services/openaiService.js` + `aiSimulator.js` |
| Consultas            | `backend/src/routes/appointmentRoutes.js`                |
| Notificações         | `backend/src/routes/notificationRoutes.js`               |
| Wearable ingest      | `backend/src/routes/wearableRoutes.js`                   |
| JWT                  | `backend/src/config/jwt.js`                              |
| Schema do banco      | `backend/src/prisma/schema.prisma`                       |
| Dados demo (seed)    | `backend/src/prisma/seed.js`                             |

---

## 15. Teste rápido público (`/teste`)

`POST /api/public/quick-test`, sem login, para o visitante da feira
(`quickTestService`, puro).

- **Sem estado e nada gravado.** O corpo traz `{ profile, answers }`, o que o
  visitante já respondeu; a resposta é a próxima etapa. Não há tabela, sessão
  nem log do corpo (morgan registra só a URL; o `errorMiddleware` só loga erro 500).
- **Etapas:** `PROFILE` (falta idade ou sexo; só esses dois são obrigatórios),
  `BLOCKED` (menor de **18 anos**), `QUESTION` (painel `RAPIDO`, até **8**
  perguntas, com follow-ups) e `RESULT`.
- **Validação:** campos fora da lista dão 422; só perguntas do painel `RAPIDO`;
  no máximo 30 respostas; valores `true/false/0/1/"sim"/"não"` ou `null`.
  Resposta de pergunta que não vale para o perfil (homem com "nódulo na mama")
  é descartada. Limite de 300 req/min por IP e corpo de 16 KB.
- **Red flag** encerra na hora.
- **Resultado:** categoria por câncer, risco relativo, frequência natural,
  rastreamento (agora e futuro) e "o que você pode mudar". Sem exames nem
  balança, o teste não chega a INVESTIGAR para o perfil do Roberto; o INVESTIGAR
  dele aparece no painel da médica.
- **Aviso:** "Teste educativo de risco... Não é diagnóstico... Nada do que você
  respondeu foi gravado."
- **Frontend:** `?kiosk=1` volta à capa após 120 s parado; "Demonstração da
  equipe" preenche personas (inclusive uma de pulmão em INVESTIGAR).

## 16. Base da IA (base de conhecimento)

### 16.1 O que existe

Tabelas `ClinicalSource`, `Condition`, `PriorRule`, `Symptom`,
`ConditionSymptom`, `LabRule`, `ScreeningRule` e `KnowledgeVersion` (13
condições: 8 crônicas e 5 cânceres). Toda condição, regra, probabilidade, regra
de exame e de rastreamento aponta uma **fonte** (`sourceCode`) com citação, URL e
ano. A origem é o código (`services/clinical/data/`); o banco é a cópia editável.

### 16.2 Edição (`/doctor/knowledge`, `/api/knowledge`)

- **Quem edita:** só `DOCTOR`, e só com `KB_EDIT=true` (ou `1`, `yes`, `on`).
  **Fail-closed:** ausente ou qualquer outro valor = só leitura (PATCH e reset
  respondem 403; a leitura continua). Local e `npm run stand` ligam; o Render
  (`render.yaml`) e o Docker deixam desligado, porque o cadastro de médica é
  aberto e as senhas da demo são públicas.
- **O que se edita:** valores, textos e ativo/inativo: probabilidades (`pSx`,
  `pNoSx`, ou `lrPos`, que ajusta `pNoSx`), prior base e máximo, limiares, idade
  mínima, valor e ativação de regras de prior, limiar e peso de regras de
  exame, idades e intervalo do rastreamento. A **estrutura** (`when`, `effect`,
  `operator`, `kind`) e a criação/remoção de linhas não são editáveis.
- **Validação:** probabilidades entre 0 e 1, tipos e limites por campo; campo fora
  da lista dá 422 (`checkExact`).
- **Histórico:** cada PATCH roda numa transação e grava uma linha de
  `KnowledgeVersion` por campo (valor antigo, novo, quem, motivo opcional
  `changeNote`). A versão do kb é o maior `version`. O cache do `kbRepository` é
  invalidado: a próxima triagem, teste rápido ou painel já usa o valor novo.
- **Restaurar padrão** (`POST /api/knowledge/reset`): regrava a base com os
  valores do código, numa transação, e registra o reset no histórico.
- **Simular em paciente** (tela): mostra o risco do paciente escolhido antes e
  depois de cada edição.
- **Sinais de alarme** (red flags) ficam **em código**; a tela só os lista.

### 16.3 Ressalvas

1. **`ensureSeeded` (start do servidor) não sobrescreve base editada.** Base nunca
   editada (ou logo após um reset) é alinhada ao código; base já editada só ganha
   o que falta. O caminho de volta é "Restaurar padrão".
2. **`npm run db:seed` manual faz upsert da base inteira** e desfaz as edições da
   médica nos itens que existem no código (o histórico é mantido). `npm run
   db:reset` e `npm run stand` (sem `--keep-db`) passam por ele.
3. Editar `minAge` para vazio num câncer o torna elegível em qualquer idade; é
   escolha da médica e o reset desfaz.
4. Banco criado antes do schema novo: o servidor falha ao subir com a instrução
   de rodar `npm run setup` (mantém os dados) ou `npm run db:reset`.

## 17. Painel de riscos

`GET /api/patient/risk` (o próprio paciente) e `GET /api/doctor/patients/:id/risk`
(médica vinculada, `assertLink`) chamam `riskService.assessPatient`, que calcula
**na hora** (nada é gravado) com o kb atual:

- perfil do cadastro + perfil e respostas da **última triagem concluída**;
- exames (`labEvidence`) e snapshot da pulseira, com a **tendência de peso**;
- sem triagem concluída, cai no perfil do cadastro (`profileFrom: CADASTRO`).

O resultado muda sozinho quando a médica edita a base ou quando chega exame ou
peso novo. A médica vê o % em 2 anos, o limiar de 3% e o "por quê"; o aviso diz
que são estimativas didáticas.

## 18. Personas da demo

O seed (`db:seed`) cria a médica e três pacientes vinculados, e **roda as
triagens pelo motor de verdade** (mesmo caminho do frontend). Se a história
mudar, o seed falha alto em vez de levar o problema para o stand.

| Persona | Credenciais | Câncer | Triagem |
|---|---|---|---|
| **Roberto**, 63, ex-fumante (35 maços-ano, parou há 8 anos) | `roberto` (senha no slide 5) | **colorretal em INVESTIGAR** (FIT+, Hb 10,9, balança -9,5% em 90 dias, mudança no intestino); pulmão em ATENÇÃO | HIGH; médica recebe o alerta |
| **Marina**, 34 | `marina` (senha no slide 5) | **mama em ATENÇÃO** (história familiar); colo do útero em rotina; mamografia e DNA-HPV indicados | MODERATE (crônico LOW) |
| **João**, 58 | `joao` (senha no slide 5) | tudo em ROTINA (FIT indicado agora; PSA por decisão compartilhada) | CRITICAL pela parte crônica (DM2) |
| **Dra. Ana Beatriz Souza** | `ana` (senha no slide 5) | vinculada aos três | |

## 19. Operação: testes, stand e Render

- `npm test` (backend, `node --test`): motor (golden da v7 e matemática), base de
  conhecimento (banco igual ao seed, fontes, priors), exames, rastreamento,
  personas, teste rápido, alerta de triagem, escopo do socket, portão da demo e
  cadastro.
- `npm run smoke`: sobe o backend e confere login das personas, teste rápido,
  painel de riscos, Base da IA e o frontend, inclusive `/teste`.
- `npm run stand` (flags `--keep-db`, `--skip-build`, `--port=`, `--check`),
  `npm run qr`: ver o [README](./README.md#feira-stand).
- **Render:** `KB_EDIT=false`, `DEMO_PASSWORD` e `OPENAI_API_KEY` vazios na feira,
  `AUTH_RATE_LIMIT=300`, `TRUST_PROXY=1`. Plano grátis dorme após 15 min: monitor
  (UptimeRobot ou cron-job.org) em `/health` a cada 10 min. O disco é apagado a
  cada restart e o entrypoint recria o banco com a demo.
- Material da banca em [`Docs/feira/`](./Docs/feira/).
