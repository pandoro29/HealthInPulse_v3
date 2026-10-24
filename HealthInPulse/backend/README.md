# HealthInPulse v8 — Backend

API REST + WebSocket para o sistema de saúde digital HealthInPulse.

---

## Stack

- **Runtime**: Node.js 20+
- **Framework**: Express 4
- **Banco**: SQLite via Prisma ORM (arquivo em `src/prisma/dev.db`)
- **Realtime**: Socket.io
- **IA**: OpenAI GPT-4o (opcional; sem chave usa o simulador local)
- **Auth**: JWT (access + refresh token com rotação)

---

## Setup

Na **raiz** do repositório:

```bash
npm run setup   # dependências, .env, banco e dados da demo
npm run dev     # backend (:3000) + frontend (:5173)
```

Detalhes e alternativas (Codespaces, Docker) no [README da raiz](../README.md#como-rodar).

### Variáveis de ambiente

| Variável             | Padrão                  | Para quê                                                   |
|----------------------|-------------------------|------------------------------------------------------------|
| `DATABASE_URL`       | `file:./dev.db`         | SQLite, relativo a `src/prisma/schema.prisma`              |
| `JWT_ACCESS_SECRET`  | gerado pelo setup       | assina o access token                                      |
| `JWT_REFRESH_SECRET` | gerado pelo setup       | assina o refresh token                                     |
| `OPENAI_API_KEY`     | vazio                   | vazio = simulador local de IA                              |
| `CLIENT_URL`         | `http://localhost:5173` | origem liberada no CORS e no Socket.io                     |
| `TRUST_PROXY`        | vazio (`1` no Render)   | atrás de proxy reverso, usa o IP real no rate limit        |
| `AUTH_RATE_LIMIT`    | `30`                    | requisições por 15 min em `/api/auth` (só em produção)     |
| `FRONTEND_DIST`      | `../frontend/dist`      | build do Vite servido pelo backend, se existir             |
| `DEMO_PASSWORD`      | vazio                   | senha da turma na frente de tudo (demo pública); vazio = sem portão |
| `KB_EDIT`            | `true` no .env do setup | só `true` libera editar a Base da IA; ausente/outro valor = só leitura (PATCH e reset dão 403). No Render é `false` |
| `PUBLIC_RATE_LIMIT`  | `300`                   | requisições por minuto por IP no teste rápido público      |

---

## Endpoints principais

| Método | Rota                          | Descrição                        | Role     |
|--------|-------------------------------|----------------------------------|----------|
| POST   | /api/auth/register            | Cadastro                         | Público  |
| POST   | /api/auth/login               | Login                            | Público  |
| POST   | /api/auth/refresh             | Novo access token                | Público  |
| POST   | /api/auth/logout              | Logout                           | Auth     |
| GET    | /api/patient                  | Perfil do paciente               | PATIENT  |
| GET    | /api/patient/dashboard        | Dashboard do paciente            | PATIENT  |
| GET    | /api/patient/risk             | Risco (câncer + crônicas) na hora| PATIENT  |
| POST   | /api/patient/vitals           | Registrar sinal vital            | PATIENT  |
| GET    | /api/doctor/dashboard         | Dashboard do médico              | DOCTOR   |
| GET    | /api/doctor/patients          | Lista pacientes vinculados       | DOCTOR   |
| GET    | /api/doctor/patients/:id/risk | Risco do paciente (só vinculado) | DOCTOR   |
| GET    | /api/knowledge                | Base da IA (+ `editable`)        | DOCTOR   |
| PATCH  | /api/knowledge/<entidade>/:id | Edita a base (com histórico)     | DOCTOR   |
| GET    | /api/knowledge/history        | Histórico de edições             | DOCTOR   |
| POST   | /api/knowledge/reset          | Volta a base ao padrão           | DOCTOR   |
| POST   | /api/public/quick-test        | Teste rápido sem estado (/teste) | Público  |
| POST   | /api/exams                    | Upload de exame (multipart)      | PATIENT  |
| POST   | /api/triage                   | Submeter triagem                 | PATIENT  |
| POST   | /api/ai-reports/generate/:id  | Gerar relatório completo (IA)    | DOCTOR   |
| POST   | /api/wearables/ingest         | Ingestão de dados de wearable    | PATIENT  |
| GET    | /api/appointments/my          | Consultas do paciente            | PATIENT  |
| GET    | /api/appointments/doctor      | Agenda do médico                 | DOCTOR   |
| GET    | /api/notifications            | Notificações do usuário          | Auth     |
| GET    | /health                       | Health check                     | Público  |

---

## Credenciais de desenvolvimento (seed)

| Role    | Email                          | Senha       |
|---------|--------------------------------|-------------|
| Médico  | doctor@healthinpulse.dev       | Doctor@123  |
| Paciente| patient@healthinpulse.dev      | Patient@123 |

---

## Eventos Socket.io

| Evento              | Direção         | Descrição                           |
|---------------------|-----------------|-------------------------------------|
| `vital:new`         | Server → Doctor | Novo sinal vital (só médicos vinculados) |
| `vital:alert`       | Server → Patient| Alerta de sinal vital anormal       |
| `patient:critical`  | Server → Doctor | Paciente crítico (só médicos vinculados) |
| `exam:processed`    | Server → Patient| Exame processado pela IA            |
| `triage:completed`  | Server → Patient| Análise de triagem concluída        |
| `triage:alert`      | Server → Doctor | Triagem alta/crítica (só médicos vinculados) |
| `appointment:new`   | Server → Doctor | Nova consulta agendada              |
| `appointment:updated`| Server → Both  | Status de consulta alterado         |
| `notification:new`  | Server → User   | Nova notificação em tempo real      |

---

## Estrutura de pastas

```
backend/src/
├── config/         # database, jwt, socket, multer
├── controllers/    # camada HTTP (req/res)
├── middlewares/    # auth, error, validation
├── prisma/         # schema.prisma, seed.js
├── routes/         # rotas + controller inline quando pequeno
├── services/       # lógica de negócio
├── uploads/        # arquivos de usuários (gitignored)
└── utils/          # logger
```
