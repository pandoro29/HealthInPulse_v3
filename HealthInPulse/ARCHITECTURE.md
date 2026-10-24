# Arquitetura — HealthInPulse v8

Como o sistema está montado: camadas, fluxos críticos, modelo de dados, design
system e decisões técnicas que sustentam o demo.

---

## Visão de alto nível

```
┌─────────────────────────────────────────────────────────────────────┐
│  Navegador                                                          │
│  ┌─────────────────┐         ┌────────────────────┐                 │
│  │  Vite/React     │ HTTP    │  AuthContext       │                 │
│  │  + Tailwind     │◄────────┤  SocketContext     │                 │
│  │  + Recharts     │  REST   │  hooks + services  │                 │
│  └────────┬────────┘         └────────────────────┘                 │
└───────────┼─────────────────────────────────────────────────────────┘
            │ /api/*  /uploads/*   (proxy Vite ⇒ :3000)
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Express  (porta 3000)                                              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  middlewares: helmet · cors · rate-limit (auth em prod;      │   │
│  │              /api/public sempre) · morgan · demoGate ·       │   │
│  │              auth (JWT) · validation · error handler        │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  routes ──► controllers ──► services ──► Prisma Client ──► SQLite   │
│                                  │                                  │
│                  │               └─► openaiService                  │
│                  │                    ├─ HAS_KEY ? GPT-4o           │
│                  │                    └─ else: aiSimulator (local)  │
│                  └─► services/clinical (motor puro) ◄─ kbRepository │
│                                          (base no SQLite, em cache) │
└─────────────────────────────────────────────────────────────────────┘
```

Em produção (`NODE_ENV=production`) o mesmo Express serve o `frontend/dist`
(um processo, uma porta, sem CORS). É assim no Docker, no Render e no
`npm run stand`.

---

## Motor clínico e base de conhecimento (v8)

A v8 tirou os parâmetros do código e os pôs no banco. O motor continua puro
(recebe um `kb` e os dados da pessoa, devolve números), mas o `kb` agora é uma
tabela editável, com fonte em cada valor.

```
 JS (dados de partida)                      SQLite (editável)
  clinical/matrix.js, questions.js           ClinicalSource, Condition, PriorRule,
  data/chronicCatalog.js                     Symptom, ConditionSymptom, LabRule,
  data/chronicPriorRules.js                  ScreeningRule, KnowledgeVersion
  data/oncology.js  (5 cânceres)                    ▲            │
        └── kb/buildFromSeed.js ── seedKnowledge ───┘            │ kb/kbRepository.js
                    │                                            ▼   get() em cache,
                    └─────────── mesmo formato de kb ──────► motor     invalidate() ao editar
```

- **Base:** 13 condições (8 crônicas e 5 cânceres: colorretal, pulmão, mama,
  próstata, colo do útero), 43 fontes, 118 regras de prior, 95 sintomas, 110
  likelihoods, 10 regras de exame e 12 de rastreamento. Os números dos cânceres
  e suas fontes estão em [`Docs/base-clinica-oncologia.md`](./Docs/base-clinica-oncologia.md).
  O `buildFromSeed` (JS) e o banco geram o **mesmo** `kb`; um teste confere.
- **`kbRepository`:** `get()` lê as 7 tabelas e a versão numa transação só e
  guarda em cache (congelado) até `invalidate()`. A versão do kb é o maior
  `KnowledgeVersion.version` (0 sem edições). `resetToDefaults()` regrava a base
  do JS e registra o reset (a versão sobe, nunca volta).
- **`ensureSeeded()` (no start do `server.js`):** banco novo ou nunca editado
  fica igual ao seed do JS; base já editada pela médica só ganha o que falta,
  **sem sobrescrever** o que ela mudou. O caminho de volta é "Restaurar padrão".
  Já o `npm run db:seed` manual faz upsert da base inteira e **desfaz** edições
  nos itens que existem no código (o histórico fica). Banco criado antes do
  schema novo (P2021/P2022) falha com a instrução de rodar `npm run setup`.
- **Regra do modelo:** fatores demográficos e de risco entram **só no prior**
  (`PriorRule`); sintomas, exames e balança entram **só como likelihood**. Nada
  é contado duas vezes. Um teste garante.

Peças do motor (`backend/src/services/clinical/`):

| Módulo               | O que faz                                                                   |
|----------------------|-----------------------------------------------------------------------------|
| `bayes.js`           | `createEngine(kb, {categories})`: prior, posterior, ganho de informação. Usado nos cânceres; a fase crônica da v7 saiu da triagem em 22/10/2026 (sem fonte) e fica só no golden test |
| `chronicScores.js`   | fase crônica por escores validados: STOP-Bang, FINDRISC (SBD 2025), PHQ-2 → PHQ-9, com os cortes oficiais e sem porcentagem |
| `riskEngine.js`      | `assess`: risco de cada condição com o "por quê" fator a fator, risco relativo à média da idade e sexo, categoria ROTINA/ATENÇÃO/INVESTIGAR |
| `questionRunner.js`  | escolhe a próxima pergunta dos cânceres (`Σ|ln LR+|/custo`, só os elegíveis por idade e sexo); a entropia global ignoraria P≈0,2% |
| `labEvidence.js`     | exames (`ExamResult.findings`) → evidência, conforme as `LabRule`           |
| `wearableEvidence.js`| pulseira e, nos cânceres, a **tendência de peso** da balança (queda ≥ 5% em até 180 dias vira `perda_peso_objetiva`) |
| `screening.js`       | `ScreeningRule` → o que fazer agora, discutir com o médico ou no futuro      |
| `redFlags.js`        | sinais de alarme, **em código** (a Base da IA só os lista)                   |
| `profile.js`         | `ageFromDob`, `mapGender`, `computeBmi`, `normalizeProfile`                 |
| `data/prevention.js` | faixas normais e modelos de meta, cada um com fonte (Guyton & Hall, SBC 2025, OMS, MS, INCA) |

**O que o paciente vê** (regra R2) passa por `services/patientView.js`: toda rota
e evento do paciente e o `/teste` recebem só o próximo passo (ROTINA, CONSULTA,
AGORA), os sinais da pulseira contra a faixa normal, os exames preventivos e as
metas. Nome, código e probabilidade de doença ficam nas rotas da médica.

Classificação oncológica própria: **INVESTIGAR** se P ≥ 3% (limiar do NICE
NG12), **ATENÇÃO** se P ≥ 1% ou risco relativo ≥ 2, senão **ROTINA**. No banco e
nos alertas isso vira HIGH, MODERATE e LOW. O número é a chance estimada de
diagnóstico em 2 anos (estimativa didática); acima de 20% a UI mostra "≥20%".

### Quem usa o motor

| Consumidor                  | Rota / tela                                  | Observação                                   |
|-----------------------------|----------------------------------------------|----------------------------------------------|
| Triagem do paciente         | `/api/triage/*` · `patient/Triage.jsx`       | fase crônica + fase oncológica; grava         |
| Teste rápido público        | `POST /api/public/quick-test` · `/teste`     | sem login, **sem estado, nada é gravado**     |
| Painel de riscos            | `GET /api/patient/risk` · `GET /api/doctor/patients/:id/risk` | calculado na hora (`riskService`) |
| Base da IA (médica)         | `/api/knowledge/*` · `doctor/Knowledge.jsx`  | edita a base; simula em paciente             |

---

## Camadas do backend

A pasta `backend/src/` segue a separação clássica em 4 camadas com **regra
estrita**: a camada superior só pode chamar a camada imediatamente abaixo.

| Camada            | Responsabilidade                                               | Pasta                |
|-------------------|----------------------------------------------------------------|----------------------|
| **Routes**        | declarar HTTP paths, validation rules, role guards             | `routes/`            |
| **Controllers**   | extrair input do `req`, despachar para service, formatar `res` | `controllers/`       |
| **Services**      | regras de negócio puras (não conhecem HTTP)                    | `services/`          |
| **Data**          | Prisma Client + utilitários de serialização JSON               | `config/database.js`, `utils/jsonField.js` |

Algumas rotas pequenas (gamificação, recompensas, notificações, wearable,
appointments, ai-reports) usam **route-as-controller** — o handler fica no
arquivo de rotas direto, sem controller separado. É consciente: o controller só
faria delega + tratamento de erro repetitivo.

### Convenções importantes

- **Erros como objetos**: services lançam `throw Object.assign(new Error('...'), { status: 404 })`. O `errorMiddleware` no fim da chain captura e devolve o status correto.
- **Transações Prisma**: usadas em qualquer operação que envolva crédito/débito
  de coins, conclusão de meta, ou resgate de recompensa — evitam saldo
  inconsistente. Veja `coinService.credit/debit` e `rewardService.redeem`.
- **Paginação coercida**: todo endpoint que aceita `?page=&limit=` passa por
  `Number(page)` / `Number(limit)` antes de chegar no Prisma (que é
  estrito-de-tipo a partir da v5).

### Serviços (`backend/src/services/`)

| Service           | Responsabilidade                                                    |
|-------------------|---------------------------------------------------------------------|
| `authService`     | register/login/refresh/logout/changePassword + auditoria            |
| `patientService`  | perfil + sinais vitais + dashboard (com 30d de tendência)           |
| `doctorService`   | perfil + pacientes vinculados + dashboard + consolidated + history  |
| `examService`     | upload + processamento async (OCR + IA) + listagem                  |
| `triageService`   | triagem adaptativa em 2 fases (crônica e oncológica) + resultado + metas + alerta à médica |
| `riskService`     | painel de riscos: cadastro + última triagem + exames + balança → `riskEngine.assess` |
| `quickTestService`| teste rápido público: `run(kb, {profile, answers})` → próxima etapa     |
| `knowledgeService`| Base da IA: leitura, edição com histórico (`KnowledgeVersion`), reset e `KB_EDIT` |
| `goalService`     | CRUD de metas + cálculo de progresso + geração via triagem          |
| `coinService`     | credit/debit/balance/history (sempre em transação)                  |
| `rewardService`   | catálogo + redeem (transacional)                                    |
| `openaiService`   | wrapper que escolhe entre GPT-4o e simulador local                  |
| `aiSimulator`     | análise local determinística (keywords) com suporte a `INCONCLUSIVE`|

### Rotas registradas (`app.js`)

```
/api/auth          → register, login, refresh, logout, me, change-password
/api/patient       → perfil + sinais vitais + dashboard + risk (painel de riscos)
/api/doctor        → perfil + pacientes + dashboard + consolidated + history + patients/:id/risk
/api/exams         → upload + listagem + acesso médico
/api/triage        → questions + start + answer (uma pergunta por vez) + history + getOne
/api/public        → quick-test  (sem login; sem estado, nada gravado)
/api/knowledge     → Base da IA: get + history + patch por entidade + reset  (só DOCTOR; edição exige KB_EDIT)
/api/notifications → list + unread-count + markRead + markAllRead
/api/ai-reports    → list/get (paciente) + generate/get (médico)
/api/appointments  → create + list + updateStatus
/api/wearables     → devices CRUD + ingest + history  (legacy, ainda exposto)
/api/goals         → CRUD + updateProgress + coins/balance + coins/transactions
/api/rewards       → list + redeem + my/redemptions
/health            → health check
```

---

## Frontend

### Camadas

```
main.jsx
  └─ <AuthProvider>            ← guarda user + healthCoins, expõe login/logout/refreshCoins
       └─ <SocketProvider>     ← Socket.io client (autenticado via JWT)
            └─ <BrowserRouter>
                 └─ <AppRoutes>        ← lazy load + Guards por role
                      ├─ <PublicRoute>  → Login / Register
                      ├─ <RoleRoute role="PATIENT">  → PatientLayout
                      └─ <RoleRoute role="DOCTOR">   → DoctorLayout
                                                       (Outlet → cada página)
```

### Contextos

- **`AuthContext`**: estado global do usuário logado. Persiste `accessToken` e
  `refreshToken` em `localStorage`; chama `/auth/me` no mount. Expõe
  `refreshCoins()` para atualizar o saldo após resgate/meta concluída.
- **`SocketContext`**: conecta Socket.io autenticado com o JWT atual. Embora os
  emits do backend existam, **nenhuma página consome o socket** hoje — a
  pulseira é simulada no frontend (ver `useLiveVitals`). Fica pronto para o
  futuro evoluir pra dados realmente em tempo real entre paciente↔médico.

### Hooks customizados (`src/hooks/`)

| Hook              | Função                                                                |
|-------------------|-----------------------------------------------------------------------|
| `useFetch(fn, deps)` | Wrapper sobre Promise: loading/error/data/refetch                  |
| `useAsync(fn)`       | Wrapper imperativo: `await run(args)` com loading/error            |
| `useDebounce(v, ms)` | Debounce simples (usado na busca de pacientes)                     |
| `useLocalStorage(k)` | Persiste estado em localStorage                                    |
| `useLiveVitals`      | **Simulador da pulseira Care Plus** — gera leitura a cada 1s        |
| `useCountUp`         | Interpola animadamente entre valores (números nos cards de vitais) |

### Páginas

```
src/pages/
├── auth/
│   ├── LoginPage.jsx        ← usuário e senha (abre vazio, sem cards) + link do /teste
│   └── RegisterPage.jsx     ← cadastro só de paciente: usuário, nome e senha
├── patient/
│   ├── Dashboard.jsx        ← hero + score animado + 5 vitais + gráficos 30d
│   ├── Goals.jsx            ← metas com barras de progresso + confetti
│   ├── Rewards.jsx          ← loja Care Plus (catálogo + meus resgates)
│   ├── Exams.jsx            ← upload + lista com status async
│   ├── Triage.jsx           ← perfil + etapa 1/2 (crônicas) + etapa 2/2 (câncer) + resultado
│   ├── Reports.jsx          ← lista de relatórios IA + modal
│   ├── Appointments.jsx     ← lista de consultas
│   └── Profile.jsx
├── doctor/
│   ├── Dashboard.jsx        ← KPIs + donut de risco + bar 7d + pacientes em alerta
│   ├── Patients.jsx         ← lista filtrada da médica (sem botão "Vincular")
│   ├── PatientDetail.jsx    ← detalhe clínico + gráfico FC
│   ├── Wearable.jsx         ← seletor + consolidado dos últimos dados
│   ├── Reports.jsx          ← seletor + síntese IA + gerar nova
│   ├── History.jsx          ← seletor + timeline filtrada por tipo
│   ├── Appointments.jsx     ← agenda + ações (confirmar/cancelar/concluir)
│   ├── Knowledge.jsx        ← Base da IA: edição na linha, histórico, restaurar, simular em paciente
│   ├── Reference.jsx        ← Base Clínica (do livro de fisiologia)
│   ├── Profile.jsx
│   └── PatientSelector.jsx  ← componente shared para Wearable/Reports/History
└── public/
    ├── QuickTest.jsx        ← /teste: teste rápido sem login (modo quiosque com ?kiosk=1)
    └── personas.js          ← personas da equipe que preenchem o teste

src/components/risk/          ← RiskPanel (PatientDetail), ConditionRiskCard, RiskExplanation,
                                ScreeningList, FrequencyDots (reaproveitados no /teste e na triagem)
src/lib/risk.js               ← categorias, risco relativo e frequência natural por público
                                (o visitante nunca vê o % nem vermelho; a médica vê o % em 2 anos)
```

---

## Fluxos críticos

### 1. Login + refresh token

```
LoginPage → AuthContext.login(email, pass)
            └─ POST /api/auth/login
                 └─ authService.login
                      ├─ bcrypt.compare
                      ├─ AuditLog (LOGIN)
                      └─ issueTokenPair  → grava RefreshToken (7d)
            ◄── { user, accessToken, refreshToken }
            ├─ localStorage.setItem(accessToken)
            ├─ localStorage.setItem(refreshToken)
            └─ setUser(user)  ← inclui healthCoins se for paciente
```

Quando uma chamada autenticada retorna **401**, o axios interceptor
(`services/api.js`) faz refresh transparente:

```
api.request --401-→ interceptor
                    ├─ enfileira chamadas concorrentes
                    ├─ POST /api/auth/refresh { refreshToken }
                    │     └─ rotaciona: deleta o antigo, cria novo par
                    ├─ atualiza accessToken/refreshToken no localStorage
                    └─ reenvia todas as chamadas enfileiradas
```

### 2. Pulseira Care Plus (live vitals)

A pulseira é **simulada no frontend**, não há hardware ou Bluetooth.

```
PatientDashboard
  └─ useLiveVitals(initialVitals, initialTrend)
       └─ setInterval(1000ms):
            └─ next(prev, baseline, jitter, min, max)
                 ├─ drift  = (baseline - prev) * 0.06   ← reversão à média
                 └─ noise  = ±jitter                     ← ruído controlado
       ↳ retorna { current, spark[30] }                 ← janela deslizante
```

- **Baseline** vem do `latestVital` real do paciente no banco. Para o João
  (caso grave), parte de PA ~148/94, glicemia ~186, SpO₂ 93. Para Marina, parte
  de valores normais-limítrofes.
- **Min/max** acomodam casos extremos: SpO₂ aceita 88-100, glicemia 75-230,
  sistólica 95-175.
- Cada tick avança o `recordedAt` e empurra um ponto na janela de 30 leituras
  → atualiza os sparklines em tempo real.
- `useCountUp` interpola os números mostrados (700ms, ease-out) para a UI ficar
  fluida sem saltos.

Os **gráficos grandes de 30 dias** (PA + glicose) não são "live" — usam dados
históricos persistidos no banco. Coerente: histórico não muda a cada segundo.

### 3. Triagem adaptativa (crônicas + câncer)

A triagem é uma sessão guardada em `TriageAnswer.answers` (o estado inteiro:
perfil, respostas, fase). Cada chamada retoma de lá; não há estado em memória.

```
PatientTriage
  ├─ POST /api/triage/start            → { stage: PROFILE, schema, ... }
  ├─ POST /api/triage/:id/answer       → { stage: QUESTION | RESULT, ... }  (repete)
  └─ resultado: stage RESULT

Estados: COLLECT_PROFILE → INTERVIEW (crônica) → ONCO_INTERVIEW → COMPLETED
         (RED_FLAG interrompe em qualquer fase)
```

- **Perfil** (idade, sexo, altura, peso, fumo, álcool, história familiar de
  câncer, Papanicolau...) vira o prior. Evidência da pulseira entra no Bayes.
- **Fase crônica** ("etapa 1 de 2"): a próxima pergunta é a de maior ganho de
  informação por custo; encerra com posterior ≥ 80% ou 18 perguntas. Idêntica à
  v7 (golden test); as escalas (STOP-BANG, PHQ-9, FINDRISC, Framingham) reforçam o nível.
- **Fase oncológica** ("etapa 2 de 2", `ONCO_INTERVIEW`): até 6 perguntas do
  painel `ONCOLOGIA`, escolhidas pelo `questionRunner`. Dá para desligar com
  `ONCO_PHASE_ENABLED = false` em `triageService.js`.
- **Red flag** (suspeita de IAM, AVC, ideação suicida, neoplasia etc.) interrompe e devolve a urgência,
  mas o risco oncológico do que já foi respondido continua no resultado.
- **`finalize`:** `riskEngine.assess` junta perfil, respostas, **exames**
  (`labEvidence`) e **tendência de peso** (balança). O nível final é o maior
  entre o crônico e o oncológico (ROTINA não sobe; ATENÇÃO sobe até MODERATE;
  INVESTIGAR até HIGH). Grava `COMPLETED` + `AiReport` (`triage`), gera as
  metas, dá o bônus de coins e emite `triage:completed` ao paciente.
- **Alerta à médica:** nível HIGH/CRITICAL (inclusive câncer em INVESTIGAR)
  emite `triage:alert` **só** para a sala `user:<userId>` de cada médico
  vinculado (nunca para uma sala geral). Câncer em INVESTIGAR cria também uma
  `Notification` ALERT. A tela mostra um toast na `DoctorLayout`.
- Confete só quando não há risco nenhum (crônico baixo, câncer em ROTINA e sem red flag).

Sem `OPENAI_API_KEY` o sistema inteiro funciona: a triagem **não usa** LLM, só
o motor local; o `aiSimulator` cobre relatórios e exames.

### 3b. Teste rápido público (`/teste`)

```
/teste (QuickTest.jsx)
  └─ POST /api/public/quick-test  { profile, answers }   a cada tela
       ├─ publicRoutes: rate limit 300/min por IP (PUBLIC_RATE_LIMIT), corpo ≤ 16 KB,
       │                campo fora da lista → 422
       └─ quickTestService.run(kb, { profile, answers })
            ├─ falta idade/sexo → { stage: PROFILE, schema }
            ├─ menor de 18      → { stage: BLOCKED }
            ├─ questionRunner.next (painel RAPIDO, até 8) → { stage: QUESTION, reason }
            └─ riskEngine.assess → { stage: RESULT, oncology, screening, modifiable }
```

Sem estado: o cliente reenvia tudo o que já respondeu e o servidor devolve a
próxima etapa. **Nada é gravado e o corpo não vai para o log.** Red flag encerra
na hora. O `null` ("não sei") conta como respondida e não vira evidência.

### 3c. Base da IA (edição pela médica)

```
doctor/Knowledge.jsx
  ├─ GET   /api/knowledge             → base + editable + campos editáveis
  ├─ PATCH /api/knowledge/<entidade>/:id  { campo: valor, changeNote }
  │     requireEditable (KB_EDIT) → validação → knowledgeService.patch
  │       (transação: atualiza + 1 KnowledgeVersion por campo) → kbRepository.invalidate()
  ├─ POST  /api/knowledge/reset       → volta aos valores do JS
  └─ GET   /api/knowledge/history
```

A próxima triagem, teste rápido ou painel de riscos já usa o `kb` novo. Entidades
editáveis: `conditions`, `prior-rules`, `condition-symptoms`, `lab-rules`,
`screening-rules` (valores, textos e ativo/inativo; a estrutura das regras, `when`,
`effect`, `operator` e `kind`, não). **Fail-closed:** só `KB_EDIT=true` (ou 1, yes,
on) libera PATCH e reset; sem a variável é só leitura (403). A edição fica
desligada no Render e no Docker, e ligada no `.env` local e no `npm run stand`.

### 4. Gamificação (metas → coins → recompensas)

```
Meta atualizada (PATCH /api/goals/:id/progress)
  └─ goalService.updateProgress
       ├─ computeProgress(current)  ← lógica por targetCmp (lte/gte/between)
       ├─ se progress === 100 e status === ACTIVE
       │   ├─ goal.status = DONE
       │   └─ coinService.credit(coinsReward)   ← em transação
       └─ retorna { goal, justCompleted: true }
        ↳ frontend: confetti + toast + refreshCoins()

Resgate de recompensa (POST /api/rewards/:id/redeem)
  └─ rewardService.redeem  (Prisma $transaction)
       ├─ valida saldo
       ├─ cria RewardRedemption (status=PENDING)
       ├─ cria HealthCoinTx delta=-costCoins
       └─ Patient.healthCoins -= costCoins
        ↳ frontend: confetti + atualiza saldo + entra em "Meus resgates"
```

O **saldo desnormalizado** (`Patient.healthCoins`) é a fonte de verdade para
leitura rápida. A integridade é mantida pela atomicidade das transações que
incluem tanto a `HealthCoinTx` quanto o `update` do paciente.

### 5. Painel do médico — consolidado e histórico

```
DoctorWearable / DoctorReports / DoctorHistory
  └─ PatientSelector (dropdown persistido em localStorage)
       └─ doctorService.getConsolidated(patientId)  → bundle de 30d
       │   └─ assertLink → 403 se não vinculado
       └─ doctorService.getHistory(patientId)       → linha do tempo
           └─ agrega: appointments + exams + aiReports + goals DONE +
                      triages + notifications ALERT/CRITICAL
              ordenado por data desc, agrupado por dia no frontend
```

---

## Modelo de dados

Diagrama lógico (relações 1:n omitidas para facilitar leitura):

```
User ─┬─ 1:1 ─ Patient ─┬─ 1:n ─ VitalSign
      │                  ├─ 1:n ─ Exam ─ 1:1 ─ ExamResult
      │                  ├─ 1:n ─ TriageAnswer ─ 1:1 ─ AiReport
      │                  ├─ 1:n ─ AiReport
      │                  ├─ 1:n ─ Device ─ 1:n ─ WearableData
      │                  ├─ 1:n ─ Appointment
      │                  ├─ 1:n ─ HealthGoal
      │                  ├─ 1:n ─ HealthCoinTx
      │                  ├─ 1:n ─ RewardRedemption
      │                  └─ n:m ─ Doctor       (via DoctorPatient)
      ├─ 1:1 ─ Doctor
      ├─ 1:n ─ Notification
      ├─ 1:n ─ AuditLog
      └─ 1:n ─ RefreshToken

Reward ─ 1:n ─ RewardRedemption

Base de conhecimento do motor clínico (chaves por código, não UUID):
Condition ─┬─ 1:n ─ PriorRule
           ├─ 1:n ─ ConditionSymptom ─ n:1 ─ Symptom ─ 1:n ─ LabRule
           └─ 1:n ─ ScreeningRule
ClinicalSource ─ 1:n ─ (Condition, PriorRule, ConditionSymptom, LabRule, ScreeningRule)
KnowledgeVersion   histórico de edições; o maior `version` é a versão do kb
```

A base nasce do JS (`services/clinical/kb/buildFromSeed.js`), é gravada por
`prisma/seedKnowledge.js` (modos `upsert`, `missing` e `replace`) e lida pelo
motor via `services/clinical/kb/kbRepository.js` (em cache até a próxima edição).
Veja [Motor clínico e base de conhecimento](#motor-clínico-e-base-de-conhecimento-v8)
para o que o `ensureSeeded()` e o `db:seed` fazem com edições da médica. Na triagem,
o estado da sessão (inclusive o perfil de risco e o resultado oncológico) fica
em `TriageAnswer.answers`; o `Patient` não mudou.

### Particularidades do SQLite

O Prisma **não suporta enums nem `Json` nativos em SQLite**. Para destravar o
projeto sem mudar de banco, fizemos:

- Enums (`Role`, `RiskLevel`, `ExamStatus`, etc.) viraram **`String`** com
  validação no service.
- Arrays e Json (`Patient.allergies`, `ExamResult.findings`, `TriageAnswer.answers`,
  `AiReport.suggestions`, `Notification.metadata`, `WearableData.payload`)
  viraram **`String`** com JSON serializado.
- Os helpers em `backend/src/utils/jsonField.js` fazem `JSON.stringify` na
  escrita e `JSON.parse` na leitura, retornando para o frontend os arrays e
  objetos esperados.

---

## Tema / design system

### Paleta Care Plus

Definida em `frontend/tailwind.config.js`:

```
brand   (azul navy corporativo)
  brand-50  #eef4fa  brand-100 #d4e3f1  ... brand-700 #003F7E ← primary
accent  (ciano de destaque — links, hover, indicador "ao vivo")
  accent-50 #e6f7fd  accent-500 #00A0DC
surface (cinzas / fundos)
  surface-50 #F7F9FC ← bg geral
  surface-900 #0F172A ← texto
```

### Classes utilitárias (`frontend/src/index.css`)

- `.glass` — card branco com borda + sombra suave (substitui o antigo "glass"
  escuro do dark theme original)
- `.card-hover` — interação de hover (lift + sombra)
- `.btn-primary` — botão azul navy Care Plus
- `.btn-accent` — botão ciano
- `.btn-ghost` — botão transparente
- `.input` / `.label` — formulários
- `.badge-{low,moderate,high,critical}` — badges de risco clínico
- `.live-dot` — indicador pulsante ciano (pulseira em tempo real)

### Animações

Definidas no Tailwind: `fade-in`, `slide-up`, `pulse-ring`. Usadas em entradas
de página, modais e cards "ao vivo".

---

## Decisões arquiteturais relevantes

| Decisão                                | Por quê                                                              |
|----------------------------------------|----------------------------------------------------------------------|
| **SQLite em arquivo**                  | Demo acadêmico — zero dependência externa. Schema usa String para enums/Json. |
| **Pulseira simulada no front**         | Sem hardware. Determinístico ao baseline do paciente, sem latência. |
| **Fallback de IA local**               | Apresentação offline. O sistema funciona sem OpenAI key.            |
| **Saldo de coins desnormalizado**      | Performance de leitura. Integridade via transações.                 |
| **Route-as-controller** em alguns módulos | Casos pequenos não merecem 3 arquivos.                            |
| **Hooks no topo do componente**        | Regras do React. Aprendido na marra com 2 incidentes de tela branca. |
| **Triagem em passos (start/answer)**   | Cada resposta devolve a próxima etapa; o estado da sessão vive em `TriageAnswer.answers`, sem memória no servidor. |
| **Parâmetros clínicos no banco**       | A médica edita e o resultado muda na hora; cada número tem fonte e o histórico fica em `KnowledgeVersion`. |
| **Câncer como triagem de risco**       | Prior por idade e sexo (INCA/GLOBOCAN) × fatores, likelihoods publicados; categoria e exame de rastreamento, sem prometer diagnóstico. |
| **Teste público sem estado**           | Nada de visitante é gravado nem logado; o cliente reenvia as respostas a cada chamada. |
| **Edição da base fail-closed**         | Só `KB_EDIT=true` edita; a demo pública (cadastro de médica aberto) fica só leitura. |

---

## Onde olhar para entender uma feature

| Quero entender...                       | Comece por...                                              |
|-----------------------------------------|------------------------------------------------------------|
| Como o login funciona ponta-a-ponta     | `services/index.js` → `services/authService.js`            |
| A pulseira em tempo real                | `hooks/useLiveVitals.js`                                   |
| Como uma meta é concluída e coins entram| `services/goalService.js::updateProgress`                  |
| Como a triagem decide e fecha           | `services/triageService.js::advance` e `finalize`          |
| O risco de câncer e o "por quê"         | `services/clinical/riskEngine.js::assess`                  |
| O teste público do stand                | `services/quickTestService.js` + `routes/publicRoutes.js`  |
| O que o paciente vê (sem doença)        | `services/patientView.js` + `components/prevention/PreventionView.jsx` |
| Faixas normais e metas com fonte        | `services/clinical/data/prevention.js` + `Docs/base-clinica-fisiologia.md` |
| Primeiro acesso e tutorial              | `contexts/AuthContext.jsx::homeFor` + `components/onboarding/Tutorial.jsx` |
| A base de conhecimento                  | `services/clinical/kb/kbRepository.js` + `prisma/seedKnowledge.js` |
| A edição da Base da IA                  | `services/knowledgeService.js` + `pages/doctor/Knowledge.jsx` |
| Os números dos cânceres                 | `services/clinical/data/oncology.js` + `Docs/base-clinica-oncologia.md` |
| A linha do tempo do paciente            | `services/doctorService.js::getPatientHistory`             |
| O design system                         | `frontend/tailwind.config.js` + `frontend/src/index.css`   |
| As referências clínicas                 | `frontend/src/pages/doctor/Reference.jsx` + `Docs/*.docx`  |

Para regras clínicas detalhadas, veja **[BUSINESS_RULES.md](./BUSINESS_RULES.md)**.

---

## Execução: local, stand e Render

| Ambiente         | Como sobe              | Banco                           | `KB_EDIT` | Portão de senha |
|------------------|------------------------|---------------------------------|-----------|-----------------|
| Dev              | `npm run dev` (API :3000 + Vite :5173) | `dev.db`, mantido | `true` (setup) | não |
| Stand (notebook Windows, offline) | `npm run stand` (:3000) | zerado e populado a cada subida (`--keep-db` mantém) | `true` (forçado) | **nunca** (limpo do ambiente e do `.env`) |
| Docker           | `docker compose up`    | volume                          | desligado | opcional (`DEMO_PASSWORD`) |
| Render (QR)      | Blueprint (`render.yaml`) | recriado a cada restart       | `false`   | vazio na feira  |

O `npm run stand` (`scripts/stand.mjs`, reaproveita `scripts/setup.mjs`) gera o
Prisma Client, zera e popula o banco, faz o build, sobe o servidor em modo
produção com `AUTH_RATE_LIMIT=1000`, `OPENAI_API_KEY` vazia e sem rede para o
Prisma, e imprime o endereço local, o IP da rede e o link do Render. Com
`--check` ele sobe, confere `/health`, `/teste`, o login da médica e a Base da
IA editável, e encerra (é o que o CI roda). O Render é Docker no plano grátis
(dorme após 15 min, por isso o keep-warm em `/health`). `npm run qr` gera o QR
do `/teste` para o banner. Detalhes no [README](./README.md#feira-stand).

Para o checklist, o roteiro e o pitch, veja [`Docs/feira/`](./Docs/feira/).
