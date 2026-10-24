#!/usr/bin/env node
// Teste de fumaça: sobe o backend de verdade e confere o caminho feliz.
// Roda no CI (Windows, macOS, Linux) e serve para conferir uma máquina nova.
// Confere a entrada só com nome (visitante e médica), o teste rápido público, o painel de risco
// da médica (Roberto em INVESTIGAR, Marina em ATENÇÃO, João em ROTINA), a
// Base da IA e o frontend (incluindo /teste). Os dados vêm do seed: num
// banco mexido, `npm run db:reset` volta à história da feira.
//
//   npm run smoke                 sobe o backend local (precisa do `npm run setup` antes)
//   npm run smoke -- --url=URL    só testa um servidor já rodando (ex.: o deploy)
//   --demo-password=SENHA         testa também o portão da demo (DEMO_PASSWORD)

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'backend');
const PORT    = process.env.SMOKE_PORT || '3999';

const urlArg  = process.argv.find((a) => a.startsWith('--url='));
const BASE    = urlArg ? urlArg.slice('--url='.length).replace(/\/$/, '') : `http://127.0.0.1:${PORT}`;
const TIMEOUT_MS = urlArg ? 120_000 : 30_000; // deploy grátis pode estar "dormindo"
const DEMO_PASSWORD = process.argv.find((a) => a.startsWith('--demo-password='))
  ?.slice('--demo-password='.length);

// Feira: entra-se só com o nome (paciente visitante) ou direto como médica
const GUEST_NAME  = 'Visitante Smoke';
const DOCTOR_USER = 'ana';

// O que a médica vê de cada persona no painel de risco (seed da feira)
const PERSONAS = [
  { name: 'Roberto Alves Pereira', expect: { CA_COLORRETAL: 'INVESTIGAR' }, screening: { CA_PULMAO: 'INDICADO_AGORA' } },
  { name: 'Marina Azevedo Lima',   expect: { CA_MAMA: 'ATENÇÃO' },          screening: { CA_MAMA: 'INDICADO_AGORA', CA_COLO_UTERO: 'INDICADO_AGORA' } },
  { name: 'João Carlos Mendes',    level: 'ROTINA',                         screening: { CA_COLORRETAL: 'INDICADO_AGORA', CA_PROSTATA: 'DECISAO_COMPARTILHADA' } },
];

let failures = 0;
const tokens = {}; // usuário → accessToken, depois de entrar
let finished = false;
let gateCookie = null; // cookie do portão da demo, depois da senha certa

// Sem isto, uma falha silenciosa vira CI verde: o fetch do Node 20 pode
// ficar pendurado sem segurar o processo (ex.: porta do Docker aceitando
// conexão antes do app subir) e o Node sai com código 0 no meio do teste.
process.on('beforeExit', () => {
  if (!finished) {
    console.error('\nSmoke terminou sem concluir as verificações.');
    process.exitCode = 1;
  }
});

// Timer próprio (ref'd) mantém o processo vivo e aborta requisição travada.
async function http(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`sem resposta em 10s: ${url}`)), 10_000);
  try {
    const headers = { ...(gateCookie && { cookie: gateCookie }), ...opts.headers };
    return await fetch(url, { ...opts, headers, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

const check = async (name, fn) => {
  try {
    await fn();
    console.log(`  \x1b[32m✔\x1b[0m ${name}`);
  } catch (err) {
    failures++;
    console.log(`  \x1b[31m✖\x1b[0m ${name}\n      ${err.message}`);
  }
};

const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

async function waitForHealth() {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await http(`${BASE}/health`);
      if (res.ok) return;
    } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${BASE}/health não respondeu em ${TIMEOUT_MS / 1000}s`);
}

function startBackend() {
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: BACKEND,
    env: {
      ...process.env, PORT, NODE_ENV: 'test', LOG_LEVEL: 'warn', DEMO_MODE: process.env.SMOKE_DEMO_MODE ?? 'true',
      ...(DEMO_PASSWORD && { DEMO_PASSWORD }),
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  child.on('exit', (code) => {
    if (code !== null && code !== 0) console.error(`backend saiu com código ${code}`);
  });
  return child;
}

async function checkDemoGate() {
  const form = (password) => ({
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password, next: '/doctor/dashboard' }),
  });

  await check('portão: sem senha, navegador vai para /demo-access e API dá 401', async () => {
    const page = await http(`${BASE}/doctor/dashboard`, { redirect: 'manual', headers: { accept: 'text/html' } });
    assert(page.status === 302, `página respondeu ${page.status}`);
    assert(page.headers.get('location')?.startsWith('/demo-access'), `redirect para ${page.headers.get('location')}`);

    const api = await http(`${BASE}/api/auth/entrar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ name: GUEST_NAME }),
    });
    assert(api.status === 401, `login sem passar pelo portão respondeu ${api.status}`);
  });

  await check('portão: senha errada é recusada', async () => {
    const res = await http(`${BASE}/demo-access`, form('senha-errada'));
    assert(res.status === 401, `respondeu ${res.status}`);
    assert(!res.headers.get('set-cookie'), 'emitiu cookie com senha errada');
  });

  await check('portão: senha certa libera e volta para a página pedida', async () => {
    const res = await http(`${BASE}/demo-access`, form(DEMO_PASSWORD));
    assert(res.status === 303, `respondeu ${res.status}`);
    assert(res.headers.get('location') === '/doctor/dashboard', `redirect para ${res.headers.get('location')}`);
    const cookie = res.headers.get('set-cookie');
    assert(cookie?.includes('HttpOnly'), 'cookie sem HttpOnly');
    gateCookie = cookie.split(';')[0];
  });
}

// JSON de uma rota da API (com o token da pessoa, se houver)
async function api(path, { token, method = 'GET', body } = {}) {
  const res = await http(`${BASE}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      ...(body && { 'content-type': 'application/json' }),
      ...(token && { authorization: `Bearer ${token}` }),
    },
    ...(body && { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  assert(res.ok, `${method} ${path} respondeu ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

// Teste rápido público (/teste): sem login, do perfil ao resultado,
// respondendo "não" a tudo. O frontend manda tudo a cada chamada.
async function checkQuickTest() {
  await check('teste rápido público: perfil → perguntas → resultado', async () => {
    const first = await api('/api/public/quick-test', { method: 'POST', body: {} });
    assert(first.stage === 'PROFILE', `primeira etapa ${first.stage}`);

    const profile = { age: 63, sex: 'male', height: 175, weight: 80, smoker: true, packYears: 35, quitYears: 8 };
    const answers = {};
    let res;
    for (let i = 0; i < 30; i++) {
      res = await api('/api/public/quick-test', { method: 'POST', body: { profile, answers } });
      if (res.stage !== 'QUESTION') break;
      answers[res.question.id] = false;
    }
    assert(res.stage === 'RESULT', `terminou em ${res.stage} depois de ${Object.keys(answers).length} respostas`);
    assert(Object.keys(answers).length > 0, 'nenhuma pergunta feita');
    // Regra R2: o visitante recebe próximo passo, exames e hábitos, nunca doença
    assert(!('oncology' in res), 'resultado do /teste trouxe o risco por câncer');
    assert(!/c[âa]ncer|CA_[A-Z]|INVESTIGAR/i.test(JSON.stringify(res)), 'resultado do /teste cita doença');
    assert(['ROTINA', 'CONSULTA', 'AGORA'].includes(res.nextStep?.code), `próximo passo ${res.nextStep?.code}`);
    assert(res.habits?.some((h) => h.code === 'ATIVIDADE_150'), 'hábitos sem a atividade física');
  });
}

// Painel de risco da médica (personas do seed) e a Base da IA
async function checkDoctorRisk() {
  const token = tokens[DOCTOR_USER];
  if (!token) return; // o login da médica já falhou acima

  const { patients } = await api('/api/doctor/patients?limit=100', { token });
  for (const p of PERSONAS) {
    await check(`médica: risco de ${p.name.split(' ')[0]}`, async () => {
      const patient = patients.find((x) => x.fullName === p.name);
      assert(patient, `${p.name} não está entre os pacientes da médica (rode \`npm run db:reset\`)`);
      const risk = await api(`/api/doctor/patients/${patient.id}/risk`, { token });
      const levels = Object.fromEntries(risk.oncology.conditions.map((c) => [c.code, c.level]));
      for (const [code, level] of Object.entries(p.expect ?? {})) {
        assert(levels[code] === level, `${code}: ${levels[code]}, esperado ${level}`);
      }
      if (p.level) assert(risk.oncology.level === p.level, `nível ${risk.oncology.level}, esperado ${p.level}`);
      for (const [code, status] of Object.entries(p.screening)) {
        const s = risk.screening.find((x) => x.conditionCode === code);
        assert(s?.status === status, `rastreio ${code}: ${s?.status ?? 'nenhum'}, esperado ${status}`);
      }
    });
  }

  await check('Base da IA: /api/knowledge com 13 condições', async () => {
    const kb = await api('/api/knowledge', { token });
    assert(kb.conditions?.length === 13, `${kb.conditions?.length} condições`);
    assert(kb.conditions.filter((c) => c.category === 'ONCOLOGICA').length === 5, 'esperava 5 cânceres');
  });
}

async function main() {
  let backend;
  if (!urlArg) {
    if (!existsSync(join(BACKEND, '.env'))) {
      console.error('backend/.env não existe: rode `npm run setup` antes.');
      process.exit(1);
    }
    backend = startBackend();
  }

  console.log(`Smoke test em ${BASE}`);
  try {
    await check('GET /health responde', waitForHealth);

    if (DEMO_PASSWORD) await checkDemoGate();

    // DEMO_MODE: o smoke local liga; num --url sem a flag as rotas sem senha
    // dão 404 e o login da médica vai por usuário e senha (seed).
    const demoMode = (await http(`${BASE}/api/auth/entrar`)).status === 204;
    if (demoMode) {
      await check('entrar só com o nome + dashboard do paciente', async () => {
        const res = await api('/api/auth/entrar', { method: 'POST', body: { name: GUEST_NAME } });
        assert(res.accessToken, 'entrar não devolveu accessToken');
        assert(res.user?.role === 'PATIENT', `papel ${res.user?.role}`);
        assert(res.user?.fullName === GUEST_NAME, `nome ${res.user?.fullName}`);
        const dash = await api('/api/patient/dashboard', { token: res.accessToken });
        assert(dash && Object.keys(dash).length, 'dashboard vazio');
      });

      await check('entrar sem nome é recusado', async () => {
        const res = await http(`${BASE}/api/auth/entrar`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: '   ' }),
        });
        assert(res.status === 400 || res.status === 422, `respondeu ${res.status}`);
      });

      await check('entrar como médica + dashboard da médica', async () => {
        const res = await api('/api/auth/entrar-medica', { method: 'POST' });
        assert(res.user?.role === 'DOCTOR', `papel ${res.user?.role}`);
        tokens[DOCTOR_USER] = res.accessToken;
        await api('/api/doctor/dashboard', { token: res.accessToken });
      });

    } else {
      await check('sem DEMO_MODE: rotas sem senha dão 404', async () => {
        for (const p of ['/api/auth/entrar', '/api/auth/entrar-medica']) {
          const res = await http(`${BASE}${p}`, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"x"}',
          });
          assert(res.status === 404, `${p} respondeu ${res.status}`);
        }
      });
      await check('login com senha + dashboard da médica', async () => {
        const res = await api('/api/auth/login', { method: 'POST', body: { username: DOCTOR_USER, password: 'Doctor@123' } });
        tokens[DOCTOR_USER] = res.accessToken;
        await api('/api/doctor/dashboard', { token: res.accessToken });
      });
    }

    await check('rota protegida recusa sem token', async () => {
      const res = await http(`${BASE}/api/patient/dashboard`);
      assert(res.status === 401, `esperava 401, veio ${res.status}`);
    });

    await checkQuickTest();
    await checkDoctorRisk();

    await check('socket.io aceita handshake', async () => {
      const res  = await http(`${BASE}/socket.io/?EIO=4&transport=polling`);
      const body = await res.text();
      assert(res.ok && body.startsWith('0{'), `resposta inesperada: ${res.status} ${body.slice(0, 60)}`);
    });

    const servesFrontend = urlArg || existsSync(join(ROOT, 'frontend', 'dist', 'index.html'));
    if (servesFrontend) {
      await check('frontend servido (/, rota do React Router e /teste)', async () => {
        for (const path of ['/', '/doctor/dashboard', '/teste']) {
          const res = await http(`${BASE}${path}`);
          const html = await res.text();
          assert(res.ok && html.includes('id="root"'), `${path} não devolveu o index.html (${res.status})`);
        }
      });

      await check('rota de API inexistente dá 404 JSON, não o index.html', async () => {
        for (const path of ['/api', '/api/nao-existe']) {
          const res = await http(`${BASE}${path}`);
          assert(res.status === 404, `${path} respondeu ${res.status}`);
          assert(res.headers.get('content-type')?.includes('json'), `${path} não devolveu JSON`);
        }
      });
    }
  } finally {
    backend?.kill();
  }

  if (failures) {
    console.error(`\n${failures} verificação(ões) falharam.`);
    process.exit(1);
  }
  finished = true;
  console.log('\nTudo certo.');
}

main();
