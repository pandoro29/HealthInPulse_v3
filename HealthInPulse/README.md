# HealthInPulse v8

[![CI](https://github.com/IgorMarran/HealthInPulse/actions/workflows/ci.yml/badge.svg)](https://github.com/IgorMarran/HealthInPulse/actions/workflows/ci.yml)

Plataforma acadêmica de saúde digital integrada à pulseira **Care Plus**: o
paciente acompanha sinais vitais em tempo real, recebe metas personalizadas via
triagem com IA e troca **health-coins** por benefícios; o(a) médico(a) tem
painel consolidado, relatórios automáticos, linha do tempo clínica e base
clínica de referência.

A v8 acrescenta a **triagem de risco de câncer** (colorretal, pulmão, mama,
próstata e colo do útero), com IA parametrizada por banco de dados: os números
do motor vivem em tabelas, cada um com fonte, e a médica os edita na tela
**Base da IA**. É triagem de risco, **não diagnóstico**, e só a médica a vê: o
resultado dela traz a categoria (ROTINA, ATENÇÃO ou INVESTIGAR), o porquê fator a
fator e o exame de rastreamento indicado pelas diretrizes brasileiras. O paciente
e o visitante **nunca veem doença**: recebem o próximo passo, a comparação com o
padrão normal, os exames preventivos da idade e metas com fonte. Foi montada para
o stand da feira da faculdade (24/10/2026), onde o visitante faz o **teste rápido
em `/teste`**, sem login e sem gravar nada. Veja [Feira (stand)](#feira-stand).

> Aplicação **demo/acadêmica**. Não usar com dados reais de pacientes.

---

## Stack

| Camada       | Tecnologia                                                 |
|--------------|------------------------------------------------------------|
| Backend      | Node 20 · Express 4 · Prisma 5 · SQLite · Socket.io · JWT  |
| Frontend     | React 18 · Vite 5 · Tailwind 3 · React Router 6 · Recharts |
| IA           | OpenAI GPT-4o (opcional) · fallback local (`aiSimulator`)  |
| Motor clínico| Bayes explicável (5 cânceres) + 3 escores validados (STOP-Bang, FINDRISC, PHQ-9) · base com fonte no SQLite |
| Auth         | JWT access + refresh com rotação                           |

---

## Como rodar

Escolha um caminho. Os três chegam no mesmo app, com os dados de demonstração.

| Você quer...                       | Caminho                                         | Precisa instalar |
|------------------------------------|-------------------------------------------------|------------------|
| programar sem instalar nada no PC  | [A. GitHub Codespaces](#a-github-codespaces)    | nada (navegador) |
| programar na sua máquina           | [B. Local](#b-local)                            | Node 20+ e Git   |
| só ver o app funcionando           | [C. Docker ou demo online](#c-só-ver-o-app)     | Docker (ou nada) |

### A. GitHub Codespaces

Melhor caminho se o Prisma não instala no seu PC (rede da faculdade, antivírus,
Windows travando arquivo).

1. No repositório no GitHub: **Code → Codespaces → Create codespace on main**.
2. Espere a criação. O `npm run setup` roda sozinho (uns 2 minutos na primeira vez).
3. No terminal do Codespace: `npm run dev`
4. Abra a aba **Ports** e clique no globo da porta **5173** ("App").

Conta pessoal do GitHub tem uma cota grátis de horas por mês (maior com o
GitHub Student Developer Pack). Quando terminar: **Codespaces → Stop**.

### B. Local

Pré-requisitos: **Node.js 20 ou mais novo** (o LTS de https://nodejs.org serve)
e **Git**. Não precisa de Postgres nem de Docker: o banco é SQLite, em arquivo.

```bash
git clone https://github.com/IgorMarran/HealthInPulse.git
cd HealthInPulse
npm run setup     # instala tudo, cria backend/.env, cria o banco e popula a demo
npm run dev       # sobe API (:3000) + frontend (:5173) no mesmo terminal
```

Abra **http://localhost:5173**. `Ctrl+C` para os dois.

**No Windows**, duas coisas evitam quase todos os problemas:

- rode os comandos no **Prompt de Comando (cmd)** ou no **Git Bash**. O
  PowerShell (padrão do terminal do VS Code) pode bloquear o `npm`; veja o
  [Troubleshooting](#troubleshooting). No VS Code: seta ao lado do **+** do
  terminal → **Command Prompt**;
- clone **fora do OneDrive**, por exemplo em `C:\dev`. A pasta Documentos
  costuma ser sincronizada pelo OneDrive, que trava arquivos durante o setup:

```bat
mkdir C:\dev
cd C:\dev
git clone https://github.com/IgorMarran/HealthInPulse.git
cd HealthInPulse
npm run setup
npm run dev
```

O que o `npm run setup` faz:

- confere a versão do Node;
- cria o `backend/.env` com segredos JWT aleatórios. Se você já tinha um `.env`
  copiado do exemplo antigo (Postgres, `sk-...`), ele conserta e avisa;
- instala as dependências da raiz, do backend e do frontend com `npm ci`
  (versões exatas do lockfile, iguais em todas as máquinas);
- gera o Prisma Client, cria o banco SQLite e popula os dados da demo;
- pode rodar de novo sem medo: não apaga seus dados. Para zerar o banco existe
  o `npm run db:reset`.

Rode o `npm run setup` de novo depois de um `git pull` que mexa em
`package.json` ou no `schema.prisma`.

`OPENAI_API_KEY` é opcional. Vazia, os relatórios e a análise de exames usam o
simulador local (determinístico, por palavras-chave), bom para apresentar
offline. Para usar o GPT-4o, cole uma chave real no `backend/.env` e reinicie o
`npm run dev`. A triagem de risco (crônicas e câncer) **não usa IA externa**: é
o motor bayesiano local, com os parâmetros do banco.

O setup também grava `KB_EDIT=true` no `backend/.env`: na sua máquina a médica
pode editar a Base da IA. Qualquer outro valor (ou a variável ausente) deixa a
base só para leitura; veja [Base da IA](#base-da-ia-e-edição).

### C. Só ver o app

**Docker** (não precisa de Node):

```bash
docker compose up --build
```

Abra **http://localhost:3000**. É um container só: API, tempo real e o build do
frontend na mesma porta. O banco fica num volume e sobrevive a restarts. No
container a Base da IA é só leitura (sem `KB_EDIT=true`).

**Demo online grátis (Render).** O `render.yaml` já descreve o serviço; o dono
do repositório configura uma vez: em render.com, **New → Blueprint**, escolhe
este repositório e **Apply**. O Render pede dois valores:

- `DEMO_PASSWORD`: **a senha da turma**. Quem abrir o link digita essa senha
  uma vez (vale por 30 dias naquele navegador) e só então chega na tela de
  login. Sem ela, qualquer pessoa com o link entraria como a médica, porque as
  senhas dos usuários de demo são públicas. **No dia da feira, deixe vazio**:
  o visitante chega pelo QR direto no `/teste`, sem digitar senha (o teste é
  público e não grava nada; o login continua protegido pelas credenciais);
- `OPENAI_API_KEY`: deixe **vazio**. A demo usa o simulador local; com chave
  real, cada relatório gerado no link gasta a sua conta da OpenAI.

O `render.yaml` fixa `KB_EDIT=false`: no Render a Base da IA é **só leitura**.
Não troque para `true`: as senhas da demo são públicas (estão no seed e no slide
da feira), então qualquer visitante poderia entrar como a médica e alterar a IA.
A edição da demo acontece no notebook do stand (`npm run stand`).

Depois disso, cada push na `main` faz deploy sozinho. Para trocar a senha da
turma: painel do Render → serviço → **Environment**. No plano grátis:

- o serviço dorme após 15 min sem acesso, e o primeiro acesso leva ~1 min.
  **Keep-warm:** crie um monitor grátis no UptimeRobot ou no cron-job.org
  chamando `https://SEU-APP.onrender.com/health` a cada 10 min (de sexta à tarde
  até o fim da feira) e abra o `/teste` uma vez antes de montar o stand;
- o disco é apagado a cada deploy/restart, e o banco volta para os dados da
  demo. Para a apresentação isso é bom: sempre começa limpo.

Para conferir o deploy: `npm run smoke -- --url=https://SEU-APP.onrender.com --demo-password=SENHA`.

---

## Credenciais demo

A tela de login abre **vazia**, sem atalhos de demonstração, com o link para o
teste rápido e o **Cadastre-se**. Digite **usuário** e **senha**: o login é por
usuário, não por e-mail. As senhas da demo ficam no slide "Logins da demo" de
[`Docs/feira/slides.pptx`](./Docs/feira/slides.pptx) (gerado por
`Docs/feira/gerador-slides.cjs`), não no site.

| Perfil                        | Usuário   | Tipo                                       |
|------------------------------|-----------|--------------------------------------------|
| 🧓 **Roberto Alves Pereira**  | `roberto` | Paciente · 63 anos, colorretal a **investigar** (FIT+, anemia, perda de peso na balança) |
| ✨ **Marina Azevedo Lima**    | `marina`  | Paciente · 34 anos, mama em **atenção** pela história familiar; escores crônicos baixos |
| 🩺 **João Carlos Mendes**     | `joao`    | Paciente · 58 anos, escores altos (STOP-Bang 6, FINDRISC 23), risco HIGH; câncer em rotina |
| 🧑‍⚕️ **Dra. Ana Beatriz Souza** | `ana`     | Médica · vinculada aos pacientes           |

As categorias da tabela são o que a **médica** vê; no app de cada paciente
aparecem só o próximo passo, o padrão normal, os exames preventivos e as metas.

**Cadastro:** só paciente se cadastra, com usuário, nome e senha (sem e-mail,
CPF ou data de nascimento). A conta entra direto na triagem, mostra o tutorial
das abas e fica ligada à médica. A médica não se cadastra: usa a conta `ana`.

O seed faz as triagens dos três pelo motor de verdade e **falha alto** se a
história mudar (por exemplo, uma revisão de número da base que tire o Roberto
de INVESTIGAR). Um banco mexido volta à história da feira com `npm run db:reset`.

---

## Feira (stand)

O que a equipe usa no sábado 24/10/2026. O roteiro completo, o pitch, o FAQ da
banca, o checklist, os slides e o banner estão em [`Docs/feira/`](./Docs/feira/).
Os números clínicos e suas fontes estão em
[`Docs/base-clinica-oncologia.md`](./Docs/base-clinica-oncologia.md).

`DEMO_MODE=true` (no `backend/.env` de dev e ligado pelo `npm run stand`) troca o login por "Seu nome + Entrar" e "Entrar como médica", sem senha; ausente/false (Render, produção) as rotas sem senha dão 404 e vale o login com usuário e senha.

**Notebook do stand (Windows, offline).** Um comando faz tudo:

```bash
npm run stand
```

Gera o Prisma Client, **zera e popula o banco** da demo, faz o build do
frontend e sobe o servidor de produção na porta 3000 com a Base da IA editável
e sem portão de senha. Imprime o endereço local, o IP da rede (para o celular
na mesma rede/hotspot abrir `/teste`), o link do Render e os logins. Precisa
só do que o `npm run setup` já instalou (rode o setup uma vez, com internet).

| Opção                                | O que muda                                                           |
|--------------------------------------|----------------------------------------------------------------------|
| `npm run stand -- --keep-db`         | não zera o banco: mantém as edições feitas na Base da IA             |
| `npm run stand -- --skip-build`      | reaproveita o `frontend/dist` que já existe                          |
| `npm run stand -- --port=3001`       | outra porta (ou a variável `STAND_PORT`; padrão 3000)                |
| `npm run stand -- --check`           | sobe, confere `/health`, `/teste`, o login da médica e a Base da IA editável, e encerra (usado no CI; porta padrão 3997) |

`STAND_PUBLIC_URL` troca só o link do Render impresso no terminal (não mexe no banner nem no QR). Para o stand
valem sempre `KB_EDIT=true`, `AUTH_RATE_LIMIT=1000` (todo mundo sai pelo IP do
notebook), `OPENAI_API_KEY` vazia e **sem `DEMO_PASSWORD`**, mesmo que exista
no ambiente ou no `backend/.env`. Se o celular não abrir o endereço da rede,
libere o Node.js no firewall do Windows para redes **privadas** (o banner mostra
o comando).

**QR do teste rápido.** `npm run qr` gera `Docs/feira/qr-teste.svg` e atualiza o
endereço escrito no banner. Quando a URL real do Render chegar:
`npm run qr -- https://SEU-APP.onrender.com/teste --pdf` (o `--pdf` também
regera o `banner.pdf`; precisa de Chrome, Chromium ou Edge).

**Quando a URL do Render chegar** (ela vive em três lugares):
1. `frontend/src/config.js`, `PUBLIC_TEST_URL`: o QR na tela do `/teste`. Fixo no build, então rode `npm run build`
   (ou defina `VITE_PUBLIC_TEST_URL` no build).
2. `scripts/stand.mjs`, `PUBLIC_URL`: só o texto que o `npm run stand` imprime (ou use `STAND_PUBLIC_URL`).
3. `Docs/feira/banner.html`, `qr-teste.svg` e `banner.pdf`: o banner impresso.

O `npm run qr -- URL --pdf` troca os três de uma vez; depois confira com `git diff`, rode `npm run build` e aponte a
câmera para o QR da tela e do PDF.

**Teste rápido (`/teste`).** Página pública: perfil, até 8 perguntas e um
resultado de prevenção, sem nenhuma doença: o próximo passo (manter a rotina,
agendar consulta ou procurar atendimento agora, com SAMU 192 ou CVV 188 quando
couber), os exames preventivos da idade e do sexo, pelo nome, e hábitos com
fonte (atividade física, álcool, fumo e o peso em relação à faixa normal do
IMC). Não mostra card por câncer, categoria de risco nem porcentagem: o risco é
da tela da médica. Nada é gravado e o corpo da requisição não vai para o log. Com
`/teste?kiosk=1` o modo quiosque volta à capa sozinho após 120 s parado. Na capa
há "Demonstração da equipe", com personas que preenchem tudo para a equipe
mostrar um resultado sem digitar.

**Base da IA e edição.** Menu "Base da IA" da médica (`/doctor/knowledge`).
Os valores são editados na linha (sensibilidade, 1−especificidade, LR+/LR−,
priors, limiares, idade mínima, ligado/desligado) e o resultado muda na hora,
na triagem, no `/teste` e no painel de riscos. A lateral "simular em paciente"
mostra o antes e o depois no Roberto, na Marina ou no João. Cada edição vira
uma linha no histórico (quem, quando, de, para, motivo).

- **A edição é fail-closed.** Só `KB_EDIT=true` (ou `1`, `yes`, `on`) libera
  editar; sem a variável, ou com qualquer outro valor, a base é só leitura
  (PATCH e restaurar devolvem 403). Local e `npm run stand` ligam; Render e
  Docker deixam desligada.
- **"Restaurar padrão"** volta a base aos valores de partida do código (e
  registra o reset no histórico). É o caminho de volta depois de uma edição.
- **O start do servidor não apaga edição da médica.** Ao subir, o backend
  (`ensureSeeded`) só completa a base: se ela já foi editada, apenas cria o que
  falta e **não sobrescreve** o que a médica mudou. Se ninguém a editou, ela é
  alinhada ao código (útil depois de um `git pull` com dados novos). Para
  voltar ao padrão, use "Restaurar padrão".
- **`npm run db:seed` (manual) sobrescreve a base.** Ele faz upsert de todas as
  linhas da base de conhecimento e **desfaz edições da médica** nos itens que
  existem no código (o histórico de edições é preservado). O `db:reset` e o
  `npm run stand` sem `--keep-db` já passam por ele.

---

## Scripts disponíveis

### Raiz (use estes no dia a dia)

| Comando             | O que faz                                                                  |
|---------------------|----------------------------------------------------------------------------|
| `npm run setup`     | Prepara tudo: dependências, `.env`, banco e dados da demo                  |
| `npm run dev`       | API + frontend juntos, com hot reload                                      |
| `npm run db:reset`  | Apaga o banco e recria os dados da demo                                    |
| `npm run db:studio` | Abre o Prisma Studio (GUI do banco) em :5555                               |
| `npm run build`     | Build de produção do frontend em `frontend/dist/`                          |
| `npm start`         | Sobe só o backend; com `frontend/dist/` presente, serve o app em :3000     |
| `npm test`          | Testes unitários do backend (`node --test`): motor, base, exames, rastreamento, personas |
| `npm run smoke`     | Teste de fumaça: sobe o backend e testa login das personas, teste rápido, painel de riscos, Base da IA e o frontend (`--url=` e `--demo-password=` testam um deploy) |
| `npm run stand`     | Sobe tudo para o stand da feira (offline); veja [Feira](#feira-stand)      |
| `npm run qr`        | Gera o QR do `/teste` e atualiza o banner em `Docs/feira/`                 |

### Backend (`/backend`)

| Comando            | O que faz                                                |
|--------------------|----------------------------------------------------------|
| `npm run dev`      | Sobe o servidor em modo dev (nodemon)                    |
| `npm start`        | Sobe o servidor em modo produção                         |
| `npm run db:generate` | Regenera o Prisma Client                              |
| `npm run db:migrate`  | Cria migration (em SQLite preferimos `prisma db push`)|
| `npm run db:studio`   | Abre o Prisma Studio (GUI do banco) em :5555          |
| `npm run db:seed`     | Popula o banco com dados demo (e **sobrescreve** a base de conhecimento) |
| `npm test`            | Testes unitários (`node --test`)                      |
| `npm run db:reset`    | Reseta migrations (use só se houver migrations)       |

Para resetar o banco e re-popular do zero, use `npm run db:reset` na raiz.

### Frontend (`/frontend`)

| Comando         | O que faz                                |
|-----------------|------------------------------------------|
| `npm run dev`     | Sobe Vite em modo dev (hot reload)       |
| `npm run build`   | Build de produção em `dist/`             |
| `npm run preview` | Serve o build de produção localmente     |

---

## Estrutura de pastas (resumo)

```
HealthInPulse/
├── .devcontainer/              # ambiente do GitHub Codespaces
├── .github/workflows/ci.yml    # CI: setup + smoke em Windows, macOS e Linux
├── scripts/
│   ├── setup.mjs               # npm run setup / db:reset
│   ├── smoke.mjs               # npm run smoke
│   ├── stand.mjs               # npm run stand (notebook da feira)
│   └── qr.mjs                  # npm run qr (QR do /teste)
├── docker/entrypoint.sh        # prepara o banco ao subir o container
├── Dockerfile                  # imagem única (API + frontend)
├── docker-compose.yml          # docker compose up
├── render.yaml                 # deploy grátis no Render
├── package.json                # scripts de raiz
├── backend/
│   ├── src/
│   │   ├── app.js              # Express app (middlewares + rotas)
│   │   ├── server.js           # bootstrap HTTP + Socket.io
│   │   ├── config/             # database, jwt, socket, multer
│   │   ├── middlewares/        # auth, validation, errors
│   │   ├── controllers/        # camada HTTP
│   │   ├── services/           # regras de negócio
│   │   │   └── clinical/       # motor: bayes, riskEngine, questionRunner,
│   │   │                       # labEvidence, screening, kb/ (base no banco), data/ (partida)
│   │   ├── routes/             # rotas Express
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # schema do banco
│   │   │   ├── seed.js         # dados demo + triagens das personas
│   │   │   ├── seedKnowledge.js # grava a base de conhecimento (upsert/missing/replace)
│   │   │   └── dev.db          # SQLite (gitignored)
│   │   ├── utils/              # logger, jsonField (helpers SQLite)
│   │   └── uploads/            # arquivos enviados (gitignored)
│   ├── tests/                  # node --test (motor, base, personas, rotas)
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── main.jsx            # entrypoint
│   │   ├── index.css           # tailwind + design system
│   │   ├── contexts/           # AuthContext, SocketContext
│   │   ├── hooks/              # useFetch, useLiveVitals, useCountUp...
│   │   ├── services/           # cliente axios + chamadas por domínio
│   │   ├── routes/             # AppRoutes + Guards
│   │   ├── components/layout/  # PatientLayout, DoctorLayout
│   │   └── pages/
│   │       ├── auth/           # Login, Register
│   │       ├── patient/        # Dashboard, Goals, Rewards, Exams...
│   │       ├── doctor/         # Dashboard, Patients, Wearable, Reports, Knowledge (Base da IA)...
│   │       └── public/         # QuickTest (/teste) e personas da equipe
│   ├── index.html
│   ├── vite.config.js
│   └── tailwind.config.js
├── Docs/
│   ├── feira/                  # pitch, FAQ, roteiro, checklist, slides, banner e QR
│   ├── base-clinica-oncologia.md # números dos 5 cânceres, com fonte e confiança
│   └── plano-feira/            # plano da feira
│                               # + docx de pacientes-demo e referência clínica
├── ARCHITECTURE.md             # como o sistema está montado
├── BUSINESS_RULES.md           # regras de negócio detalhadas
└── README.md                   # este arquivo
```

---

## Troubleshooting

**❌ "Token expirado / inválido" depois de muitos refreshes**
Limpe o `localStorage` no DevTools (F12 → Application → Storage → Clear site
data) e faça login de novo. O refresh-token rotation pode ter sido invalidado
após reset do banco.

**❌ "Muitas tentativas. Tente novamente em 15 minutos"**
É o `express-rate-limit` no `/api/auth`, ativo só com `NODE_ENV=production`
(Docker e deploy). O padrão é 30 requisições a cada 15 min por IP, e numa sala
de aula todo mundo sai pelo mesmo IP. Suba o limite com a variável
`AUTH_RATE_LIMIT` (o `render.yaml` já usa 300).

**❌ "O banco está desatualizado em relação ao schema" ao subir o servidor**
O banco foi criado antes das tabelas da base de conhecimento (ou de outra
mudança de schema). Rode `npm run setup` (mantém seus dados) ou
`npm run db:reset` (recria a demo). O `npm run stand` já recria o banco.

**❌ Dashboard em branco após login**
Quase sempre violação das Regras de Hooks do React. Abra o DevTools (F12 →
Console) e procure por "Rendered fewer hooks than expected". Recarregue com
`Ctrl+Shift+R`.

**❌ Setup falha baixando o Prisma (`binaries.prisma.sh`, `ECONNRESET`, `ETIMEDOUT`, certificado)**
Na instalação o Prisma baixa um "engine" (um programa) da internet. Rede de
faculdade, proxy ou antivírus costumam bloquear esse download. Tente outra rede
(o 4G do celular quase sempre resolve), libere a pasta do projeto no antivírus,
ou use o [Codespaces](#a-github-codespaces). Não precisa trocar o banco por
JSON: o problema é só o download.

**❌ `npm.ps1 não pode ser carregado porque a execução de scripts foi desabilitada` (Windows)**
(Em inglês: `npm.ps1 cannot be loaded because running scripts is disabled`.)
É o PowerShell bloqueando o atalho do npm. Use o **Prompt de Comando (cmd)**
ou o **Git Bash**. No VS Code: seta ao lado do **+** do terminal →
**Command Prompt**. Se quiser continuar no PowerShell, troque `npm` por
`npm.cmd` (ex.: `npm.cmd run setup`).

**❌ `EPERM` / `EBUSY` no Windows durante o setup**
Algum arquivo está em uso. Pare o `npm run dev` (`Ctrl+C`), feche o VS Code
nessa pasta e rode `npm run setup` de novo. Se o projeto estiver dentro do
OneDrive (o setup avisa), clone de novo fora dele, ex.: `C:\dev`.

**❌ Backend não sobe — `MODULE_NOT_FOUND`**
Rode `npm run setup` na raiz. Não apague o `package-lock.json`: é ele que
garante as mesmas versões em todas as máquinas.

**❌ Porta 3000 ou 5173 em uso**
Já tem outro `npm run dev` (ou o `docker compose`) rodando. Feche o outro
terminal ou rode `docker compose down`.

**❌ Prisma diz "schema.prisma not found"**
O `package.json` do backend aponta `prisma.schema` para
`src/prisma/schema.prisma`. Rode os comandos `npx prisma ...` **dentro de
`backend/`**.

**❌ "Argument `take`: Expected Int, provided String"**
Significa que algum endpoint paginado não normalizou `req.query.limit` para
número. Já corrigido em todos os services atuais, mas se voltar a ocorrer,
basta envolver em `Number(...)`.

**❌ Erro 401 em todas as chamadas, mesmo após login**
Confira no DevTools → Network se o backend está rodando em
`http://localhost:3000` e se o `Authorization: Bearer ...` está sendo
enviado. O Vite faz proxy via `/api`.

---

## Próximas leituras

- [ARCHITECTURE.md](./ARCHITECTURE.md) — como o sistema está organizado em
  camadas, fluxos principais e modelo de dados
- [BUSINESS_RULES.md](./BUSINESS_RULES.md) — regras de negócio detalhadas do
  backend (autenticação, gamificação, triagem, motor oncológico, Base da IA,
  sinais vitais, etc.)
- [Docs/base-clinica-oncologia.md](./Docs/base-clinica-oncologia.md) — cada
  número dos 5 cânceres, com fonte, população e confiança
- [Docs/feira/](./Docs/feira/) — pitch, FAQ da banca, roteiro da demo,
  checklist do stand, slides e banner

---

## Licença e uso

Projeto **acadêmico** para apresentação à **Care Plus**. Pacientes, exames e
dados clínicos são fictícios. Nenhuma decisão médica deve ser tomada com base
nesta aplicação.
