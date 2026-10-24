#!/usr/bin/env node
// Prepara o projeto do zero, igual em Windows, macOS e Linux.
//
//   npm run setup       instala tudo, cria o .env, cria o banco e popula a demo
//   npm run db:reset    apaga o banco e popula a demo de novo
//   --check             só confere se o setup já foi feito (usado pelo `npm run dev`)
//
// Só usa módulos nativos do Node: roda antes de qualquer `npm install`.

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT     = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BACKEND  = join(ROOT, 'backend');
export const FRONTEND = join(ROOT, 'frontend');
export const ENV_FILE = join(BACKEND, '.env');
const ENV_EXAMPLE = join(BACKEND, '.env.example');
const SCHEMA_DIR  = join(BACKEND, 'src', 'prisma');

const MIN_NODE = 20;
export const IS_WIN   = process.platform === 'win32';
const args     = new Set(process.argv.slice(2));

export const c = {
  bold:  (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow:(s) => `\x1b[33m${s}\x1b[0m`,
  red:   (s) => `\x1b[31m${s}\x1b[0m`,
  dim:   (s) => `\x1b[2m${s}\x1b[0m`,
};

let stepNo = 0;
export const step = (msg) => console.log(`\n${c.bold(`[${++stepNo}]`)} ${msg}`);
export const ok   = (msg) => console.log(`    ${c.green('✔')} ${msg}`);
export const warn = (msg) => console.log(`    ${c.yellow('!')} ${msg}`);

export class SetupError extends Error {
  constructor(message, hint) { super(message); this.hint = hint; }
}

// ─── execução de comandos ────────────────────────────────────

// Mostra a saída ao vivo e guarda uma cópia para diagnosticar falhas.
export function run(cmd, cmdArgs, { cwd = ROOT } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, cmdArgs, {
      cwd,
      shell: IS_WIN, // npm/npx são .cmd no Windows
      env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    });
    let output = '';
    const tee = (stream) => (chunk) => { output += chunk; stream.write(c.dim(chunk.toString())); };
    child.stdout.on('data', tee(process.stdout));
    child.stderr.on('data', tee(process.stderr));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolvePromise(output);
      else reject(Object.assign(new Error(`${cmd} ${cmdArgs.join(' ')} saiu com código ${code}`), { output }));
    });
  });
}

const PRISMA_DOWNLOAD_HINT = [
  'O Prisma baixa um "engine" (um programa) de binaries.prisma.sh na instalação.',
  'Esse download costuma ser bloqueado por rede de faculdade/empresa, proxy ou antivírus.',
  'Tente, nesta ordem:',
  '  1. Outra rede (o 4G do celular resolve na maioria das vezes) e rode `npm run setup` de novo.',
  '  2. Antivírus: libere a pasta do projeto (o Windows Defender às vezes trava o arquivo .node).',
  '  3. Atrás de proxy: defina HTTPS_PROXY antes de rodar o setup.',
  '  4. Sem jeito na sua máquina: use o GitHub Codespaces (veja o README), roda no navegador.',
].join('\n');

const FILE_LOCKED_HINT =
  'Algum arquivo está em uso (comum no Windows). Pare o `npm run dev` (Ctrl+C), '
  + 'feche o VS Code nessa pasta e rode de novo.';

// Arquivo travado vem antes: no Windows o EPERM/EBUSY é quase sempre o
// `npm run dev` segurando o engine do Prisma ou o dev.db, não a rede.
export function hintFor(output = '') {
  if (/EPERM|EBUSY/.test(output)) return FILE_LOCKED_HINT;
  if (/binaries\.prisma\.sh|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|self[- ]signed certificate|unable to get local issuer/i
    .test(output)) return PRISMA_DOWNLOAD_HINT;
  return undefined;
}

export async function runPrisma(prismaArgs) {
  try {
    return await run('npx', ['--no-install', 'prisma', ...prismaArgs], { cwd: BACKEND });
  } catch (err) {
    throw new SetupError(`Prisma falhou: prisma ${prismaArgs.join(' ')}`, hintFor(err.output));
  }
}

async function npmCi(dir, label) {
  try {
    // --include=dev: com NODE_ENV=production no shell o npm pularia o CLI do
    // Prisma e o nodemon, e o setup quebraria logo depois
    await run('npm', ['ci', '--include=dev', '--no-audit', '--no-fund'], { cwd: dir });
  } catch (err) {
    throw new SetupError(`Falha ao instalar dependências do ${label}`, hintFor(err.output));
  }
}

// ─── .env ────────────────────────────────────────────────────

export function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

function setEnvVar(text, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');
  return re.test(text) ? text.replace(re, line) : `${text.trimEnd()}\n${line}\n`;
}

const secret = () => randomBytes(48).toString('hex');
const isPlaceholderSecret = (v) => !v || v.startsWith('troque_');

// Cria o .env ou conserta um .env feito à mão a partir do exemplo antigo
// (que apontava para Postgres e trazia OPENAI_API_KEY=sk-...).
export function ensureEnv() {
  const created = !existsSync(ENV_FILE);
  let text = readFileSync(created ? ENV_EXAMPLE : ENV_FILE, 'utf8');
  const env = parseEnv(text);
  const fixes = [];

  if (!env.DATABASE_URL?.startsWith('file:')) {
    text = setEnvVar(text, 'DATABASE_URL', '"file:./dev.db"');
    if (!created) fixes.push(`DATABASE_URL apontava para "${env.DATABASE_URL ?? '(vazio)'}"; o projeto usa SQLite`);
  }
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    if (isPlaceholderSecret(env[key])) {
      text = setEnvVar(text, key, secret());
      if (!created) fixes.push(`${key} estava com valor de exemplo; gerei um aleatório`);
    }
  }
  if (env.OPENAI_API_KEY && !/^sk-[A-Za-z0-9_-]{20,}$/.test(env.OPENAI_API_KEY)) {
    text = setEnvVar(text, 'OPENAI_API_KEY', '');
    if (!created) fixes.push('OPENAI_API_KEY não parecia uma chave real; deixei vazia (usa o simulador local)');
  }

  // Base da IA editável nesta máquina (dev e notebook do stand). Sem a
  // variável o servidor fica só leitura (padrão seguro do Render/Docker).
  // Valor já definido (ex.: KB_EDIT=false) é respeitado.
  if (env.KB_EDIT === undefined) {
    text = setEnvVar(text, 'KB_EDIT', 'true');
    if (!created) fixes.push('KB_EDIT ausente; liguei a edição da Base da IA neste computador (KB_EDIT=true)');
  }

  if (created || fixes.length) writeFileSync(ENV_FILE, text);
  if (created) ok('backend/.env criado com segredos JWT novos');
  else if (fixes.length) fixes.forEach((f) => warn(`.env corrigido: ${f}`));
  else ok('backend/.env já estava ok');

  return parseEnv(text);
}

export function dbFilePath(env) {
  const url = env.DATABASE_URL.replace(/^file:/, '');
  return resolve(SCHEMA_DIR, url); // Prisma resolve relativo ao schema.prisma
}

// ─── checagens ───────────────────────────────────────────────

export function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < MIN_NODE) {
    throw new SetupError(
      `Node ${process.versions.node} é antigo demais (precisa do ${MIN_NODE} ou mais novo)`,
      'Instale o Node LTS em https://nodejs.org (ou `nvm install 20`) e abra um terminal novo.',
    );
  }
  ok(`Node ${process.versions.node}`);
}

// O OneDrive sincroniza o node_modules enquanto o npm escreve: EPERM/EBUSY
// aleatórios e um setup lento. A pasta Documentos do Windows costuma estar nele.
export function checkProjectPath() {
  if (IS_WIN && /onedrive/i.test(ROOT)) {
    warn('o projeto está dentro do OneDrive; se der EPERM/EBUSY, clone fora dele (ex.: C:\\dev\\HealthInPulse)');
  }
}

function checkOnly() {
  const missing = [];
  if (!existsSync(ENV_FILE)) missing.push('backend/.env');
  if (!existsSync(join(BACKEND, 'node_modules', '.prisma', 'client'))) missing.push('dependências do backend / Prisma Client');
  if (!existsSync(join(FRONTEND, 'node_modules'))) missing.push('dependências do frontend');
  if (existsSync(ENV_FILE) && !existsSync(dbFilePath(parseEnv(readFileSync(ENV_FILE, 'utf8'))))) missing.push('banco de dados');
  if (missing.length) {
    console.error(c.red(`\nFalta rodar o setup: ${missing.join(', ')}.`));
    console.error(`Rode ${c.bold('npm run setup')} e depois ${c.bold('npm run dev')}.\n`);
    process.exit(1);
  }
}

// ─── fluxo principal ─────────────────────────────────────────

async function main() {
  if (args.has('--check')) return checkOnly();

  const resetDb = args.has('--reset-db');
  console.log(c.bold(resetDb ? 'HealthInPulse · resetando o banco' : 'HealthInPulse · setup'));

  step('Conferindo o ambiente');
  checkNode();
  checkProjectPath();

  step('Configurando backend/.env');
  const env = ensureEnv();

  if (!resetDb) {
    step('Instalando dependências (raiz, backend, frontend)');
    await npmCi(ROOT, 'projeto raiz');
    await npmCi(BACKEND, 'backend');
    await npmCi(FRONTEND, 'frontend');
    ok('dependências instaladas');
  }

  // Também no db:reset: depois de um `git pull` que mexe no schema, o
  // client antigo não conhece as tabelas novas e o seed quebra.
  step('Gerando o Prisma Client');
  await runPrisma(['generate']);
  ok('Prisma Client gerado');

  step('Criando/atualizando o banco SQLite');
  const dbFile = dbFilePath(env);
  const isNewDb = !existsSync(dbFile);
  await runPrisma(resetDb
    ? ['db', 'push', '--force-reset', '--skip-generate', '--accept-data-loss']
    : ['db', 'push', '--skip-generate']);
  ok(`banco em ${dbFile}`);

  if (isNewDb || resetDb) {
    step('Populando dados de demonstração');
    await run('npm', ['run', 'db:seed'], { cwd: BACKEND });
    ok('pacientes, médica, metas e recompensas criados');
  } else {
    step('Dados de demonstração');
    ok('banco já existia, mantive seus dados (para recomeçar: npm run db:reset)');
  }

  console.log(`\n${c.green(c.bold('Pronto!'))} Agora rode:\n`);
  console.log(`    ${c.bold('npm run dev')}\n`);
  console.log('e abra http://localhost:5173 (entre com usuário e senha: ana / Doctor@123, roberto / Roberto@123).\n');
}

// Também é importado pelo scripts/stand.mjs (reaproveita run, cores e o .env):
// só executa quando o arquivo é o ponto de entrada.
if (basename(process.argv[1] ?? '') === 'setup.mjs') {
  main().catch((err) => {
    console.error(`\n${c.red(c.bold('✖ Setup falhou:'))} ${err.message}`);
    if (err.hint) console.error(`\n${err.hint}`);
    console.error(c.dim('\nSe não resolver, mande o print deste terminal no grupo.\n'));
    process.exit(1);
  });
}
