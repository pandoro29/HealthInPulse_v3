#!/usr/bin/env node
// Sobe o HealthInPulse inteiro para o stand da feira, com um comando só.
// Pensado para o notebook Windows do stand, sem internet.
//
//   npm run stand                  gera o Prisma Client, zera e popula o banco,
//                                  faz o build e sobe o servidor de produção
//   npm run stand -- --keep-db     não zera o banco (mantém edições da Base da IA)
//   npm run stand -- --skip-build  reaproveita o frontend/dist que já existe
//   npm run stand -- --port=3001   outra porta (padrão 3000, ou STAND_PORT)
//   npm run stand -- --check       sobe, confere /health, /teste, login e Base da
//                                  IA editável, e encerra (usado no CI)
//
// Depende só do que o `npm run setup` já instalou: nada é baixado aqui.
// Variáveis opcionais: STAND_PORT, STAND_PUBLIC_URL (link do Render no banner).

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import {
  BACKEND, FRONTEND, IS_WIN, ROOT, SetupError, c, checkNode, checkProjectPath,
  dbFilePath, ensureEnv, hintFor, ok, parseEnv, run, runPrisma, step, warn,
} from './setup.mjs';

const args    = process.argv.slice(2);
const flag    = (name) => args.includes(name);
const option  = (name) => args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);

const CHECK      = flag('--check');
const KEEP_DB    = flag('--keep-db');
const SKIP_BUILD = flag('--skip-build');
// No --check a porta padrão é outra: não colide com um stand já aberto
const PORT = Number(option('--port') || process.env.STAND_PORT || (CHECK ? 3997 : 3000));
const PUBLIC_URL = (process.env.STAND_PUBLIC_URL || 'https://healthinpulse.onrender.com').replace(/\/$/, '');

const DOCTOR = { username: 'ana',     password: 'Doctor@123' };
const ROBERTO = { username: 'roberto', password: 'Roberto@123' };

let server = null;     // processo do backend
let stopping = false;

// ─── ambiente do stand ───────────────────────────────────────

// Valores do stand, por cima do backend/.env. O que o notebook tiver no
// ambiente (NODE_ENV, DEMO_PASSWORD de outro projeto...) não pode vazar.
function buildEnv(fileEnv) {
  const env = { ...fileEnv, ...process.env }; // como o dotenv: o ambiente real vence o .env
  Object.assign(env, {
    NODE_ENV: 'production',     // o backend serve o frontend/dist
    PORT: String(PORT),
    AUTH_RATE_LIMIT: '1000',    // a equipe e os visitantes saem por um IP só
    KB_EDIT: 'true',            // a demo da Base da IA precisa editar
    DEMO_MODE: 'true',          // feira: entrar só com o nome, sem senha
    OPENAI_API_KEY: '',         // offline: sempre o simulador local
    CHECKPOINT_DISABLE: '1',    // o Prisma não consulta versão nova na rede
  });
  // Sem portão de senha no stand. '' (e não delete): o dotenv do backend não
  // sobrescreve chave já existente, mas recolocaria a que faltasse do backend/.env.
  env.DEMO_PASSWORD = '';
  env.TRUST_PROXY = '';
  env.FRONTEND_DIST = '';
  return env;
}

function localIps() {
  const found = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const i of list ?? []) {
      const v4 = i.family === 'IPv4' || i.family === 4;
      if (v4 && !i.internal && !i.address.startsWith('169.254.')) found.push({ name, address: i.address });
    }
  }
  return found;
}

function assertPortFree() {
  return new Promise((resolvePromise, reject) => {
    const probe = net.createServer();
    probe.once('error', (err) => reject(new SetupError(
      `A porta ${PORT} não está livre (${err.code})`,
      'Feche o outro `npm run stand`/`npm run dev` que está aberto, ou use --port=3001.',
    )));
    probe.listen(PORT, () => probe.close(() => resolvePromise()));
  });
}

// ─── servidor ────────────────────────────────────────────────

function startServer(env) {
  // process.execPath (não "node"): funciona com o Node fora do PATH e com
  // espaços no caminho (C:\Program Files\nodejs\node.exe); sem shell.
  server = spawn(process.execPath, ['src/server.js'], {
    cwd: BACKEND,
    env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  server.once('exit', (code, signal) => {
    if (stopping) return;
    // Código 0 = encerrou limpo pelo Ctrl+C que chegou nele antes de chegar aqui
    if (code === 0) process.exit(0);
    console.error(c.red(`\n✖ O servidor parou sozinho (${signal ?? `código ${code}`}).`));
    process.exit(code || 1);
  });
}

// Encerra o servidor e espera. No Windows, Ctrl+C no terminal já chega
// aos dois processos (o servidor fecha sozinho, com graça); só forçamos
// se ele não sair em 4 s. Sem Ctrl+C (--check), não há sinal: mata direto.
function stopServer({ viaConsole = false } = {}) {
  stopping = true;
  const child = server;
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolvePromise) => {
    child.once('exit', () => { clearTimeout(timer); resolvePromise(); });
    const timer = setTimeout(() => child.kill('SIGKILL'), 4000);
    if (!IS_WIN) child.kill('SIGTERM');
    else if (!viaConsole) child.kill();
  });
}

async function waitForHealth(base, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new SetupError('O servidor caiu logo ao subir', 'Veja a mensagem de erro acima.');
    try {
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new SetupError(`${base}/health não respondeu em ${timeoutMs / 1000}s`);
}

// ─── --check ─────────────────────────────────────────────────

async function selfCheck(base) {
  let failures = 0;
  const check = async (name, fn) => {
    try { await fn(); ok(name); } catch (err) { failures++; console.log(`    ${c.red('✖')} ${name}\n        ${err.message}`); }
  };
  const need = (cond, msg) => { if (!cond) throw new Error(msg); };
  const get = (path, init) => fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(10_000) });
  let token;

  await check('GET /health', async () => {
    const res = await get('/health');
    need(res.ok && (await res.json()).status === 'ok', `respondeu ${res.status}`);
  });
  await check('GET /teste serve o frontend (build)', async () => {
    const res = await get('/teste');
    const html = await res.text();
    need(res.ok, `respondeu ${res.status}`);
    need(html.includes('id="root"'), 'não veio o index.html do build');
  });
  await check('login da médica (segredos JWT + seed)', async () => {
    const res = await get('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(DOCTOR),
    });
    need(res.ok, `respondeu ${res.status}`);
    token = (await res.json()).accessToken;
    need(token, 'sem accessToken');
  });
  await check('Base da IA editável (KB_EDIT=true)', async () => {
    need(token, 'sem token da médica');
    const res = await get('/api/knowledge', { headers: { authorization: `Bearer ${token}` } });
    need(res.ok, `respondeu ${res.status}`);
    need((await res.json()).editable === true, 'editable=false: KB_EDIT não chegou ao servidor');
  });
  return failures;
}

// ─── banner ──────────────────────────────────────────────────

function printBanner() {
  const local = `http://localhost:${PORT}`;
  const ips = localIps();
  const line = '─'.repeat(60);
  console.log(`\n${c.green(line)}\n${c.green(c.bold('  HealthInPulse no ar · modo stand (offline)'))}\n${c.green(line)}`);
  console.log(`\n  Neste notebook   ${c.bold(local)}`);
  console.log(`  Teste rápido     ${c.bold(`${local}/teste`)}`);
  if (ips.length) {
    for (const { name, address } of ips) {
      console.log(`  Rede             ${c.bold(`http://${address}:${PORT}/teste`)}  ${c.dim(name)}`);
    }
    console.log(c.dim('                   (celular na mesma rede/hotspot; vários IPs = use o do Wi-Fi)'));
  } else {
    console.log(`  Rede             ${c.yellow('sem rede: só este notebook enxerga o servidor')}`);
  }
  console.log(`  Online (Render)  ${c.bold(PUBLIC_URL)}  ${c.dim('(precisa de internet)')}`);
  console.log(`\n  ${c.bold('Logins da demo')}`);
  // Senhas só no slide 5 (logins da demo); aqui só os usuários
  console.log(`    Médica    ${DOCTOR.username}`);
  console.log(`    Roberto   ${ROBERTO.username}`);
  console.log('    Marina    marina');
  console.log('    João      joao');
  console.log(c.dim('    senhas: slide 5 da apresentação'));
  console.log(`\n  Base da IA editável: ${c.green('sim')} · banco ${KEEP_DB ? 'mantido' : 'zerado e populado agora'}`);
  if (IS_WIN) {
    console.log(`\n  ${c.yellow('Firewall do Windows:')} se o celular não abrir o endereço da rede, na primeira vez`);
    console.log('  clique em "Permitir acesso" para o Node.js em redes PRIVADAS (ou rode, como');
    console.log('  administrador: netsh advfirewall firewall add rule name="HealthInPulse" dir=in');
    console.log(`  action=allow protocol=TCP localport=${PORT} profile=private).`);
  }
  console.log(`\n  ${c.bold('Ctrl+C')} para encerrar.\n`);
}

// ─── fluxo principal ─────────────────────────────────────────

async function main() {
  console.log(c.bold(CHECK ? 'HealthInPulse · stand (verificação)' : 'HealthInPulse · stand'));

  step('Conferindo o ambiente');
  checkNode();
  checkProjectPath();
  if (!existsSync(join(BACKEND, 'node_modules')) || !existsSync(join(FRONTEND, 'node_modules'))) {
    throw new SetupError('Faltam as dependências do backend/frontend', 'Rode `npm run setup` uma vez (precisa de internet) e depois `npm run stand`.');
  }
  await assertPortFree();
  ok(`porta ${PORT} livre`);

  step('Configurando backend/.env');
  // Antes de tudo: o que o notebook tiver no ambiente não pode ligar o portão
  // de senha nem nos filhos (seed/build) nem no servidor.
  for (const k of ['DEMO_PASSWORD', 'TRUST_PROXY', 'FRONTEND_DIST']) delete process.env[k];
  const fileEnv = ensureEnv();
  const env = buildEnv(fileEnv);
  if (String(fileEnv.KB_EDIT).toLowerCase() !== 'true') warn(`.env tem KB_EDIT=${fileEnv.KB_EDIT}; no stand a Base da IA fica editável de qualquer jeito`);
  if (fileEnv.OPENAI_API_KEY) warn('OPENAI_API_KEY ignorada no stand (offline usa o simulador local)');
  // Os filhos (prisma, seed) herdam: o seed precisa dos segredos JWT e do DATABASE_URL
  Object.assign(process.env, env);

  step('Gerando o Prisma Client');
  await runPrisma(['generate']);
  ok('Prisma Client gerado');

  step(KEEP_DB ? 'Atualizando o banco (mantendo os dados)' : 'Zerando e populando o banco da demo');
  const dbFile = dbFilePath(env);
  const isNewDb = !existsSync(dbFile);
  await runPrisma(KEEP_DB
    ? ['db', 'push', '--skip-generate']
    : ['db', 'push', '--force-reset', '--skip-generate', '--accept-data-loss']);
  ok(`banco em ${dbFile}`);
  if (!KEEP_DB || isNewDb) {
    try {
      await run('npm', ['run', 'db:seed'], { cwd: BACKEND });
    } catch (err) {
      throw new SetupError('O seed da demo falhou', hintFor(err.output));
    }
    ok('Roberto, Marina, João, médica e Base da IA criados');
  } else {
    ok('mantive os dados que já estavam no banco');
  }

  step('Build do frontend');
  if (SKIP_BUILD && existsSync(join(FRONTEND, 'dist', 'index.html'))) {
    ok('--skip-build: usando o frontend/dist existente');
  } else {
    try {
      await run('npm', ['run', 'build'], { cwd: ROOT });
    } catch (err) {
      throw new SetupError('O build do frontend falhou', hintFor(err.output));
    }
    assertDist();
    ok('frontend/dist pronto');
  }

  step('Subindo o servidor de produção');
  startServer(env);
  const base = `http://127.0.0.1:${PORT}`;
  await waitForHealth(base);
  ok(`respondendo em ${base}`);

  if (CHECK) {
    step('Conferindo o servidor');
    const failures = await selfCheck(base);
    await stopServer();
    if (failures) throw new SetupError(`${failures} verificação(ões) falharam`);
    console.log(`\n${c.green(c.bold('✔ Stand ok.'))} Para subir de verdade: ${c.bold('npm run stand')}\n`);
    process.exit(0);
  }

  printBanner();
  await new Promise(() => {}); // fica no ar até Ctrl+C (o 'exit' do servidor encerra)
}

function assertDist() {
  if (!existsSync(join(FRONTEND, 'dist', 'index.html'))) {
    throw new SetupError('O build terminou mas não gerou frontend/dist/index.html');
  }
}

// ─── Ctrl+C ──────────────────────────────────────────────────

for (const sig of IS_WIN ? ['SIGINT', 'SIGBREAK', 'SIGTERM'] : ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    if (stopping) return;
    console.log(c.dim('\nEncerrando o servidor...'));
    await stopServer({ viaConsole: true });
    console.log(c.dim('Até a próxima.\n'));
    process.exit(0);
  });
}

main().catch(async (err) => {
  await stopServer();
  console.error(`\n${c.red(c.bold('✖ Stand falhou:'))} ${err.message}`);
  if (err.hint) console.error(`\n${err.hint}`);
  console.error(c.dim('\nSe não resolver, mande o print deste terminal no grupo.\n'));
  process.exit(1);
});
