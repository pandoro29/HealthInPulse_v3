# HealthInPulse v8 · IA de risco com foco em câncer, para a feira de 24/10

## Contexto
O objetivo do Igor é que o HealthInPulse **preveja doenças, principalmente câncer, com uma IA parametrizada por banco de dados**. A apresentação é num **stand da feira da faculdade no sábado, 24/10/2026**; hoje é sexta, 16/10, à noite.

Hoje o projeto (repo `~/Estudos/HealthInPulse`, `main` com CI verde) tem:
- um motor bayesiano bom para **8 doenças crônicas**, com todos os parâmetros **fixos em JS** (`backend/src/services/clinical/matrix.js`);
- **nenhum câncer** (só um red flag "neoplasia/TB");
- telas que **escondem as probabilidades** e não explicam nada;
- nenhum teste unitário.

O que o Igor decidiu:
- Câncer como **triagem de risco**, não modelo de ML treinado. Parâmetros em tabelas do banco, explicação do porquê e exame de rastreamento indicado, **sem prometer diagnóstico**.
- No stand: **o visitante faz um teste rápido** (no notebook ou no celular, via QR) **e o grupo demonstra** com os pacientes de demo (visão do paciente e da médica).
- Roda **local no notebook Windows (principal, offline)** e **online no Render (QR)**. Sem portão de senha.
- Entregas além do app: **pitch + FAQ da banca, slides e banner**.
- Caso de demo novo: **câncer colorretal**, o Sr. Roberto, 63.
- **Só o Claude mexe no código.** O Igor revisa **só no final**. O notebook do stand é **Windows**.

## Resultado esperado
1. Uma **base de conhecimento clínico no banco** (13 condições: 8 crônicas + 5 cânceres), com fonte em cada número, editável pela médica numa tela "Base da IA". Editar um valor muda o resultado na hora.
2. Um **motor oncológico explicável**: risco estimado, risco relativo à média da mesma idade e sexo, categoria ROTINA/ATENÇÃO/INVESTIGAR (limiar de 3% do NICE NG12), "por quê" fator a fator e rastreamento conforme as diretrizes brasileiras.
3. **`/teste` público** para o visitante (2–3 min, nada é gravado, modo quiosque, QR) e **painel de riscos da médica**, com Roberto, Marina e João contando a história.
4. **`npm run stand`**, que funciona offline no Windows, e o deploy no Render.
5. `Docs/feira/`: pitch, FAQ, roteiro da demo, checklist, slides (.pptx) e banner (PDF com QR).

## Arquitetura
```
JS (dados de partida do seed)         Banco SQLite (editável)
 matrix.js/questions.js (crônicas)    ClinicalSource, Condition, PriorRule, Symptom,
 data/chronicPriorRules.js            ConditionSymptom, LabRule, ScreeningRule, KnowledgeVersion
 data/oncology.js (5 cânceres)               │ kb/kbRepository.js (cache, invalidate ao editar, ensureSeeded no start)
        └─ kb/buildFromSeed.js ─► kb normalizado ◄┘
motor puro: bayes.createEngine(kb,{categories}) · riskEngine.assess · questionRunner.next
            labEvidence.fromExams · screening.evaluate · wearable (tendência de peso)
serviços: triageService (fase crônica como hoje + fase oncológica) · riskService · knowledgeService
rotas:    /api/public/quick-test · /api/patient/risk · /api/doctor/patients/:id/risk · /api/knowledge/*
```
O mesmo `kb` é montado a partir do JS (nos testes) ou lido do banco (em produção), e um teste confirma que os dois são iguais. Se a migração para o banco atrasar, o motor continua rodando com o kb montado do JS.

### Regras de projeto (para não quebrar a matemática)
- **Fatores demográficos e de risco entram só no prior (`PriorRule`). Sintomas, exames e pulseira entram só como likelihood.** Nada de derivar `idade_*`, `imc_*` ou `sexo_*` como sintoma, porque isso conta a mesma coisa duas vezes. Um teste garante isso.
- **Câncer fica num painel separado.** A fase crônica continua idêntica (filtro `category='CRONICA'`). A oncológica tem seletor próprio (|ln LR|/custo, filtrado por idade e sexo); a entropia global ignoraria condições com P≈0,2%.
- **O prior do câncer** é a probabilidade de diagnóstico em 2 anos ≈ 2× a incidência anual por idade e sexo (INCA/GLOBOCAN), a mesma definição dos estudos CAPER que embasam o NICE. O LR+ de cada sintoma sai de LR = odds(VPP publicado)/odds(prior). Os riscos relativos dos fatores multiplicam o prior.
- **Classificação oncológica própria:** INVESTIGAR se P ≥ 3%; ATENÇÃO se P ≥ 1% ou RR ≥ 2; senão ROTINA. No banco, isso mapeia para HIGH/MODERATE/LOW.
- **Red flags continuam em código** (`redFlags.js`); a página só lista as regras.

## Modelo de dados (adicionar ao `backend/src/prisma/schema.prisma`)
As chaves estrangeiras usam códigos, não UUID, para o seed com upsert ser simples. JSON fica em String, como no resto do projeto (`utils/jsonField.js`).
- `ClinicalSource`: `code` (PK), citation, url, year, note.
- `Condition`: `code` (PK), label, category (CRONICA|ONCOLOGICA), description, basePrior, maxPrior=.95, alertThreshold (.03), watchThreshold (.01), sexFilter, minAge, sortOrder, active, sourceCode, updatedAt.
- `PriorRule`: id, conditionCode, kind (BASELINE|RISK_FACTOR|ADJUST), label, `when` JSON `[{field,op,value}]`, effect (set|add|multiply), amount, modifiable, sortOrder, active, sourceCode.
- `Symptom`: `code` (PK), label, kind (QUESTION|LAB|WEARABLE), questionText, help, type, options, binaryThreshold, cost, scaleTag, redFlagProbe, showIf JSON, followUps JSON, panels JSON (`["CRONICA"]` / `["ONCOLOGIA","RAPIDO"]`), sortOrder, active.
- `ConditionSymptom`: id, conditionCode, symptomCode, pSx, pNoSx, lrPos (gravado tal como está hoje, porque é ele que dá o bônus do modo alvo), sourceCode, note; único por (condition, symptom).
- `LabRule`: code, label, aliases JSON, operator (gte|gt|lte|lt|positive), threshold, unit, sexFilter, minAge, maxAge, symptomCode, weight, emitNegative, maxAgeDays=365, sortOrder, active, sourceCode.
- `ScreeningRule`: conditionCode, exam, kind (POPULACIONAL|ALTO_RISCO|DECISAO_COMPARTILHADA), sexFilter, minAge, maxAge, `when` JSON, intervalMonths, recommendation, priority, active, sourceCode.
- `KnowledgeVersion`: version (autoincrement), entity, entityId, field, oldValue, newValue, note, changedBy, createdAt.
- `Patient` não muda. Os fatores de risco (história familiar de câncer, álcool, anos sem fumar, Papanicolau em dia) ficam no perfil da triagem (`TriageAnswer.answers.profile`).

## Passos de implementação

### 0. Antes de mexer (rede de segurança)
- Criar a branch `feat/oncologia-feira`.
- `backend/scripts/capture-golden.js` roda **com o código atual** e grava `backend/tests/fixtures/golden-v7.json` com:
  - priors numa grade de perfis;
  - cerca de 80 posteriores de evidências pseudoaleatórias com semente fixa;
  - 25 sessões simuladas (sequência de perguntas, parada, `classifyRisk`);
  - red flags.
- Copiar os `priorAdjust` atuais para `tests/helpers/legacyPriors.js`.
- Correções rápidas que não afetam o golden:
  - textos do PHQ9_HUMOR e PHQ9_ANEDONIA trocados (`questions.js:115-116`);
  - `mode:'insensitive'` no `doctorService.getPatients` (o SQLite não suporta, dá 500);
  - sala do socket `user:${patientId}` que deveria ser `user:${userId}` (`triageService.js:434`, `examService.js:59`);
  - o `db:reset` do `setup.mjs` precisa rodar `prisma generate`.

### 1. Refatoração do motor sem mudar o comportamento (pelo golden)
- `clinical/kb/conditions.js`, com `evalWhen(when, facts)` replicando o JS atual: gt/gte/lt/lte retornam false com null; `neq` sem guarda de null; `truthy` = `Boolean(v)`.
- `clinical/data/chronicPriorRules.js`: os `priorAdjust` traduzidos em regras na mesma ordem (AOS, CV, DM2, HIPOTIR, SINDMET, DEPRESSAO, ARRITMIA, DPOC), com o teto de .95 no fim.
- `clinical/kb/buildFromSeed.js` gera o kb normalizado. O `sortOrder` dos sintomas segue `SYMPTOM_QUESTIONS`, porque o desempate depende da ordem.
- `bayes.js` vira `createEngine(kb,{categories})`, com `resolvePrior`, `priorTrace`, `computePosterior`, `explain` (contribuições; mesmo laço interno do posterior), `selectNextSymptom`, `classifyRisk` e `shouldStop`. Os exports antigos continuam como wrappers.
- `candidatesFor(kb, profile, panel)`, com `showIf` em JSON e filtro por `panels`. Remove `extractShowIfField`.
- Prisma: `db push`, `prisma/seedKnowledge.js` e `kb/kbRepository.js` (`get`, `invalidate`, `ensureSeeded`, `resetToDefaults`). O `server.js` chama `ensureSeeded()` antes do `listen`. O `triageService` passa a usar `await kbRepository.get()`, memorizando o engine por versão.
- O `priorAdjust` sai do `matrix.js`, que continua como fonte de dados do `S`, ainda importado por `scales.js`, `redFlags.js` e `wearableEvidence.js`.

### 2. Conteúdo oncológico, com pesquisa (WebSearch) e fonte em cada linha
- `clinical/data/oncology.js` e `Docs/base-clinica-oncologia.md`, com uma tabela: parâmetro | valor | população | fonte | como foi derivado | confiança A/B/C.

| Câncer | Elegibilidade | Fatores (multiply) | Sintomas | Exames / pulseira |
|---|---|---|---|---|
| CA_COLORRETAL | ≥30 | família 1º grau, IMC ≥30, álcool >14 doses/sem | sangramento retal, mudança do hábito intestinal, dor abdominal persistente, perda de peso | FIT positivo, anemia (Hb por sexo), perda de peso objetiva (balança) |
| CA_PULMAO | ≥40 | maços-ano em faixas, desconto por anos sem fumar, família | tosse ≥3 semanas, hemoptise, rouquidão, dispneia | perda de peso objetiva |
| CA_MAMA | F ≥25 | família (mama/ovário), álcool, IMC ≥30 após 50 | nódulo, alteração no mamilo, alteração na pele da mama | BI-RADS ≥4 |
| CA_PROSTATA | M ≥40 | família | sintomas urinários, hematúria | PSA acima do limite para a idade |
| CA_COLO_UTERO | F ≥25 | Papanicolau/HPV em atraso, tabagismo | sangramento pós-coito, sangramento fora do ciclo | Papanicolau alterado, HPV de alto risco |

- Rastreamento a confirmar na pesquisa (houve mudanças em 2024–25):
  - mama: MS e SBM, com alto risco familiar antecipando;
  - colo do útero: DNA-HPV de 5 em 5 anos, dos 25 aos 64;
  - colorretal: 45–75, FIT ou colonoscopia;
  - pulmão: 50–80 anos, ≥20 maços-ano, ≤15 anos sem fumar, TC de baixa dose;
  - próstata: decisão compartilhada (MS/INCA contra rastreio populacional; SBU a partir de 50, ou 45 com fator de risco).
- O perfil ganha `familyHistoryCancer` (multiselect), `quitYears`, `alcoholDosesWeek` e `papEmDia`.

### 3. Motor oncológico (`services/clinical/`)
- `riskEngine.assess(kb,{profile,answers,labEvidence,wearableEvidence})` devolve `{kbVersion, oncology[], chronic[], screening[], modifiable[], redFlag}`. Cada condição traz `{prior, baselinePrior, posterior, relativeRisk, level, contributions[{kind,label,answer,factor,delta,source}]}`. Invariante: logit(prior) + Σ delta = logit(posterior).
- `questionRunner.next(kb,{profile,answers,panel,max})`: candidatas por painel e `showIf`, pontuação Σ|ln LR+|/custo, desempate por `sortOrder`. Devolve um `reason` legível.
- `labEvidence.fromExams`: lê `ExamResult.findings` comparando com os aliases (sem acentos), aceita vírgula decimal e "positivo", respeita `maxAgeDays` e gera evidência negativa quando o exame é normal.
- `wearableEvidence.collectWeightTrend`: queda de peso ≥5% em até 180 dias vira `perda_peso_objetiva`. É uma chave nova, para não acionar o red flag NEOPLASIA.
- `screening.evaluate`: a regra mais prioritária que se aplica, com status INDICADO_AGORA, FUTURO (com a idade de início) ou DECISAO_COMPARTILHADA.
- Fase 2 no app (`triageService`), ligada pela constante `ONCO_PHASE_ENABLED`:
  - quando a fase crônica termina, o estado passa para `ONCO_INTERVIEW` com no máximo 6 perguntas e depois `finalize`;
  - o cálculo de `next` sai do `buildResponse`, o que corrige o bug de terminar sem `finalize`;
  - o nível final é o maior entre o crônico e o oncológico;
  - se algum câncer der INVESTIGAR, notifica o médico vinculado (`notificationRoutes.send`) e emite o socket `triage:alert`.

### 4. Endpoints
- `POST /api/public/quick-test` (sem autenticação, sem estado, nada gravado nem logado, rate limit de 300/min):
  - entrada `{profile, answers}`;
  - saída: `PROFILE`, `BLOCKED` (menor de 18), `QUESTION {question, reason, progress}` ou `RESULT {disclaimer, redFlag, oncology, screening, futureScreening, modifiable}`.
- `GET /api/patient/risk` e `GET /api/doctor/patients/:id/risk` (com `assertLink`): `riskService.assessPatient`, combinando a última triagem, os exames e a pulseira.
- `GET /api/knowledge`, `PATCH /api/knowledge/{conditions/:code|prior-rules/:id|condition-symptoms/:id|lab-rules/:id|screening-rules/:id}`, `GET /api/knowledge/history` e `POST /api/knowledge/reset`, todos para DOCTOR:
  - cada PATCH roda numa transação, grava `KnowledgeVersion` com o valor antigo e o novo, e faz `invalidate()`;
  - `KB_EDIT=false` devolve 403 (configurado no Render).
- Arquivos novos: `routes/publicRoutes.js`, `routes/knowledgeRoutes.js`, `services/riskService.js`, `services/knowledgeService.js`, montados em `app.js`.
- No portão da demo (`demoGateMiddleware.js`), `/teste`, `/assets/`, `/favicon.svg` e `/api/public/` ficam abertos por prefixo.

### 5. Frontend
- Arquivos novos:
  - `src/lib/risk.js`: mapas de risco unificados, com INCONCLUSIVE; oncologia em verde/âmbar/laranja, nunca vermelho;
  - `src/lib/conditions.js`, `src/services/publicApi.js` (fetch puro, sem o interceptor que manda para /login) e `src/config.js` (URL pública do teste);
  - `components/triage/{ProfileField,QuestionCard}.jsx`, extraídos de `Triage.jsx`, com `multiselect`;
  - `components/risk/{ConditionRiskCard,RiskExplanation,ScreeningList,RiskPanel}.jsx` e `components/common/Disclaimer.jsx`. Reaproveitam o padrão de barras do Leaderboard (`Triage.jsx:345`) e os tokens `.glass`, `.badge-*` e `.btn-*`.
- `pages/public/QuickTest.jsx` na rota `/teste`, **fora** do `PublicRoute`:
  - capa (o que é, "não é diagnóstico") → perfil → uma pergunta por tela com botões grandes → resultado (cards, por quê, rastreamento, o que você pode fazer, QR "faça no seu celular", "Novo teste");
  - `?kiosk=1` volta sozinho à capa depois de 120 s parado;
  - personas para a equipe (`personas.js`: Roberto, Helena, Carlos);
  - QR gerado pelo pacote `qrcode` em SVG inline.
- `pages/doctor/Knowledge.jsx` em `/doctor/knowledge`, item "Base da IA" no menu:
  - condições por categoria; prior e limiares editáveis; tabelas de fatores e de sinais/exames (Sens, 1−Esp, LR+, LR−, Fonte), editáveis na linha; rastreamento e fontes;
  - selo da versão, histórico e "Restaurar padrão";
  - "Simular em paciente" mostrando antes e depois.
- Alterados:
  - `Triage.jsx`: etapa 2/2 de câncer; seção oncológica no resultado; confete só sem risco (bug);
  - `doctor/PatientDetail.jsx`: `RiskPanel` no topo com "Recalcular";
  - `DoctorLayout.jsx`: menu e toast quando chega `triage:alert`;
  - `LoginPage.jsx`: card do Roberto e link "Teste rápido";
  - `AppRoutes.jsx` e `services/index.js`;
  - fontes locais (`@fontsource/dm-sans`, `sora`, `jetbrains-mono`) no lugar do Google Fonts, para funcionar offline.

### 6. Seed (`backend/src/prisma/seed.js`)
- No início, `seedKnowledge`. Os vitais passam a usar `createMany`.
- **Roberto Alves Pereira**, 63, masculino, ex-fumante (35 maços-ano, parou há 8 anos):
  - balança Care Plus com 90 dias de peso caindo de 84 para 76 kg;
  - hemograma com Hb 10,9, VCM 74 e ferritina 9; FIT positivo;
  - triagem concluída (mudança de hábito intestinal e cansaço), com o resultado calculado pelo motor;
  - AiReport HIGH.
  - Esperado: **colorretal INVESTIGAR** e TC de pulmão indicada.
- **Marina**: mãe teve câncer de mama aos 41 e o Papanicolau está atrasado. Esperado: mama ATENÇÃO (RR≈2), rastreamento de alto risco antecipado e HPV indicado.
- **João**: sem achado oncológico. Esperado: ROTINA, colorretal 45–75 indicado e PSA em decisão compartilhada.
- Roberto entra nos usuários de demo do smoke e do login.

### 7. Testes e CI
- Script `backend` com `"test": "node --test"`, arquivos em `backend/tests/*.test.js`. Na raiz: `npm test`.
- Arquivos de teste:
  - `engine.golden` (priors, posteriores com tolerância 1e-12, sequências de perguntas, red flags);
  - `engine.math` (um caso calculado à mão e o invariante das contribuições);
  - `onco.personas` (Roberto INVESTIGAR; mulher de 22 tudo ROTINA; homem de 67 com hemoptise → pulmão; Marina; sem próstata para mulher);
  - `labs`, `screening`, `kb.sources` (fonte em toda linha oncológica, 0<p<1, nenhum sintoma de perfil);
  - `kb.db` (banco igual ao JS; PATCH sobe a versão e muda o posterior).
- `smoke.mjs`: teste público de ponta a ponta; médica com Roberto em INVESTIGAR; `/api/knowledge` com 13 condições; `/teste` servido.
- CI: `npm test` nos 3 sistemas operacionais.

### 8. Operação do stand
- `scripts/stand.mjs` (`npm run stand`):
  - `prisma generate`; reset e seed (exceto com `--keep-db`); build; servidor de produção em :3000 com `AUTH_RATE_LIMIT=1000`;
  - imprime a URL local, o IP da rede e o link do Render;
  - funciona offline no Windows.
- Render: `KB_EDIT=false`, `DEMO_PASSWORD` e `OPENAI_API_KEY` vazios; keep-warm (UptimeRobot ou cron-job.org no `/health` a cada 10 min).
- Atualizar README, ARCHITECTURE.md e BUSINESS_RULES.md (estão desatualizados: descrevem a triagem antiga). Sem diagramas PlantUML, porque o projeto não tem `docs/arquitetura`.

### 9. Materiais da feira (`Docs/feira/`, D maiúsculo: no Windows, `docs` e `Docs` colidiriam)
- `pitch.md` (versões de 30 s e 3 min).
- `faq-banca.md` (~20 perguntas: onde está a IA, de onde vêm os números, limitações, ética/LGPD, ANVISA RDC 657/2022, próximos passos como calibrar com dados reais).
- `roteiro-demo.md` (cliques, tempos, plano B) e `checklist-stand.md`.
- `slides.pptx` (6–7 slides, skill `anthropic-skills:pptx`).
- `banner.html` → `banner.pdf` (impressão, com QR) e `qr-teste.svg` (gerado por `scripts/qr.mjs`).

## Cronograma (sem paradas intermediárias; o Igor revisa no final)
- **Sex 16, noite:** branch, golden, correções rápidas.
- **Sáb 17:** passos 1 (motor no banco, golden verde). Começa a pesquisa oncológica.
  - Se o banco não ficar verde até a noite, sigo com o kb montado do JS e a migração passa para segunda.
- **Dom 18:** pesquisa concluída; `oncology.js`; `riskEngine`, exames, peso, rastreamento, `questionRunner`; testes das personas.
- **Seg 19:** endpoints; seed (Roberto, Marina, João); fase 2; smoke; PR + CI verde + merge (o Render faz o deploy sozinho).
- **Ter 20:** frontend `/teste` e `RiskPanel` da médica; revisão visual em 390 px e 1366 px pelo Chrome; rascunho do banner.
- **Qua 21:** página Base da IA; resultado oncológico na triagem; toast; login; fontes offline; `npm run stand`.
  - **Banner final em PDF à noite**, para imprimir na quinta.
- **Qui 22:** documentação; `Docs/feira` completo (pitch, FAQ, roteiro, checklist, slides); **congelamento às 22h**; tag `v8-feira`; relatório final para o Igor.
- **Sex 23:** ensaios e só correções. **Sáb 24, de manhã:** `npm run stand`.

**Ordem de corte se atrasar:**
1. Fase 2 no app (o risco aparece pelo seed e pela médica).
2. Edição de exames e rastreamento na Base da IA.
3. Tendência de peso (semear a resposta de perda de peso).
4. Slides reduzidos.
5. Unificação dos mapas de risco.

**Fora de escopo:** treinar modelo de ML ou calibrar, red flags no banco, migrations do Prisma, portão de senha no teste.

## Ações que só o Igor pode fazer
1. **Até dom 18:** em render.com, **New → Blueprint** → repo `IgorMarran/HealthInPulse` → **Apply**, deixando `DEMO_PASSWORD` e `OPENAI_API_KEY` vazios. Depois me mandar a URL, que vai no QR e no banner. Sem a URL até quarta, o banner sai com `https://healthinpulse.onrender.com` (o nome do serviço) e eu confiro.
2. **Qui 22/sex 23:** imprimir o banner (a gráfica costuma levar 24–48 h; plano B: A3 com QR).
3. **Qui 22/sex 23:** no notebook Windows do stand, clone limpo + `npm run setup` + `npm run stand` com o Wi-Fi desligado.

## Riscos e como lidar
- **Percentuais de câncer pequenos assustam ou parecem nada.** O visitante vê a categoria, o risco relativo ("1,8× a média") e a frequência natural ("~3 em 1.000"). A médica vê o % em 2 anos, marcado como estimativa didática, e o limiar de 3%.
- **Naive Bayes superconfiante** com evidências correlacionadas (FIT+, anemia): exibir "≥20%" acima de 20% e declarar a limitação no FAQ.
- **Banco antigo após mudar o schema:** `ensureSeeded()` no start, `generate` no `stand` e aviso no README.
- **Windows** (EPERM, firewall): o `stand` reseta o banco antes de subir; o checklist manda liberar o node na rede privada.
- **Impacto emocional no stand:** sem vermelho, linguagem calma, roteiro da equipe para quem receber "procure avaliação", e o QR para responder as perguntas íntimas no próprio celular.
- **Diretrizes que mudaram em 2024–25:** confirmar na pesquisa e citar o ano.

## Reaproveitar
- `utils/jsonField.js` (`parseJson`/`stringifyJson`).
- `notificationRoutes.send`; `doctorService.assertLink`; `authenticate`/`authorize`; `express-rate-limit`.
- `ageFromDob`, `mapGender` e `computeBmi` do `triageService`, movidos para `clinical/profile.js`.
- `wearableEvidence.collectFromDatabase`.
- `scripts/setup.mjs` (`run`, cores, `SetupError`) como base do `stand.mjs`.
- `scripts/smoke.mjs` (`check`, `http`).
- Frontend: `useFetch`, `KpiCard` (`doctor/Dashboard.jsx:30`), o anel de progresso do Dashboard do paciente, `toast`, `useSocket`.

## Verificação
- `npm test` verde, com o golden igual ao comportamento v7, as personas nas categorias esperadas e a invariante das contribuições.
- `npm run smoke` local e contra o Render (`--url=`); CI verde em Windows, macOS e Linux, Node 20 e 24, e Docker.
- Navegador (Chrome), no build de produção local com o Wi-Fi desligado:
  - `/teste` completo em 390 px e 1366 px;
  - login como médica → Roberto aparece em INVESTIGAR com o "por quê";
  - editar o LR do FIT na Base da IA → o resultado muda → restaurar;
  - Marina em ATENÇÃO para mama; triagem do paciente com a etapa 2.
- `npm run stand` num clone limpo (Linux aqui; Windows pelo CI, e o Igor confere no notebook).
- Os materiais em `Docs/feira/` abrem: o PDF do banner com o QR legível e testado com a câmera (o QR é decodificado pelo script), e o .pptx.
