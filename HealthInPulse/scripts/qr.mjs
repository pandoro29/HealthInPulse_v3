#!/usr/bin/env node
// QR do teste rápido para o banner e os slides da feira.
// Gera Docs/feira/qr-teste.svg e atualiza o endereço escrito no banner.
//
//   npm run qr                                   URL padrão (nome do serviço no Render)
//   npm run qr -- https://outro.onrender.com/teste   quando a URL real do Render chegar
//   npm run qr -- URL --pdf                      também regera o Docs/feira/banner.pdf
//                                                 (precisa do Chrome, Chromium ou Edge)
//
// Com URL explícita, também troca o padrão em frontend/src/config.js (QR da tela,
// fixo no build: rode `npm run build` depois) e em scripts/stand.mjs (aviso do terminal).
//
// Depois de trocar a URL: conferir o PDF e apontar a câmera do celular para o QR.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import QRCode from 'qrcode';

const ROOT   = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FEIRA  = join(ROOT, 'Docs', 'feira');
const SVG    = join(FEIRA, 'qr-teste.svg');
const BANNER = join(FEIRA, 'banner.html');
const PDF    = join(FEIRA, 'banner.pdf');

const DEFAULT_URL = 'https://healthinpulse.onrender.com/teste';

const args = process.argv.slice(2);
const wantPdf = args.includes('--pdf');
const url = args.find((a) => !a.startsWith('--')) ?? DEFAULT_URL;

// ─── Validação da URL ───────────────────────────────────────────────
let parsed;
try {
  parsed = new URL(url);
} catch {
  console.error(`URL inválida: ${url}`);
  process.exit(1);
}
if (!['http:', 'https:'].includes(parsed.protocol)) {
  console.error(`A URL precisa começar com http:// ou https:// (veio ${url})`);
  process.exit(1);
}

// ─── QR em SVG ──────────────────────────────────────────────────────
// Correção de erro "Q" (até ~25% do código danificado): banner impresso
// pega reflexo, dobra e sujeira. Margem de 4 módulos é o mínimo da norma.
const svg = await QRCode.toString(url, {
  type: 'svg',
  errorCorrectionLevel: 'Q',
  margin: 4,
  color: { dark: '#002a55', light: '#ffffff' }, // brand-900 sobre branco
});
writeFileSync(SVG, svg);
console.log(`QR gravado: ${SVG}`);
console.log(`  aponta para ${url}`);

// ─── Endereço escrito no banner ─────────────────────────────────────
// O banner mostra a URL por extenso entre os marcadores <!--qr-url-->.
if (existsSync(BANNER)) {
  const html = readFileSync(BANNER, 'utf8');
  const shown = url.replace(/^https?:\/\//, '');
  const next = html.replace(/<!--qr-url-->[\s\S]*?<!--\/qr-url-->/g, `<!--qr-url-->${shown}<!--/qr-url-->`);
  if (next !== html) {
    writeFileSync(BANNER, next);
    console.log(`Banner atualizado: ${shown}`);
  } else if (!html.includes('<!--qr-url-->')) {
    console.warn('Aviso: banner.html sem o marcador <!--qr-url-->; o texto da URL não foi trocado.');
  }
}

// ─── Outros dois lugares com a URL padrão ───────────────────────────
// config.js (QR da tela do /teste) e stand.mjs (texto do terminal). Só com URL
// explícita; troca apenas a string padrão entre aspas simples.
if (args.some((a) => !a.startsWith('--'))) {
  const trocar = (arquivo, re, novo) => {
    if (!existsSync(arquivo)) return;
    const txt = readFileSync(arquivo, 'utf8');
    const next = txt.replace(re, (_, pre, pos) => `${pre}'${novo}'${pos}`);
    if (next === txt) {
      if (!re.test(txt)) console.warn(`Aviso: padrão não encontrado em ${arquivo}; troque a URL à mão.`);
      return;
    }
    writeFileSync(arquivo, next);
    console.log(`Atualizado: ${arquivo}`);
  };
  trocar(join(ROOT, 'frontend', 'src', 'config.js'),
    /(VITE_PUBLIC_TEST_URL \|\| )'[^'\n]*'(;)/, url);
  trocar(join(ROOT, 'scripts', 'stand.mjs'),
    /(process\.env\.STAND_PUBLIC_URL \|\| )'[^'\n]*'(\))/, parsed.origin);
  console.log('  Lembrete: rode `npm run build` para o QR da tela usar a URL nova.');
}

// ─── PDF do banner (opcional) ───────────────────────────────────────
const CHROME_CANDIDATES = [
  'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const findChrome = () => {
  for (const c of CHROME_CANDIDATES) {
    if (c.includes('/') || c.includes('\\')) {
      if (existsSync(c)) return c;
      continue;
    }
    const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) return c;
  }
  return null;
};

if (wantPdf) {
  const chrome = findChrome();
  if (!chrome) {
    console.error('Chrome/Chromium/Edge não encontrado. Abra o banner.html no Chrome e use Imprimir → Salvar como PDF (margens: nenhuma, gráficos de fundo: ligado).');
    process.exit(1);
  }
  const r = spawnSync(chrome, [
    '--headless', '--disable-gpu', '--no-pdf-header-footer',
    '--allow-file-access-from-files',
    `--print-to-pdf=${PDF}`,
    pathToFileURL(BANNER).href,
  ], { encoding: 'utf8' });
  if (r.status !== 0 || !existsSync(PDF)) {
    console.error(`Falha ao gerar o PDF com ${chrome}:\n${r.stderr}`);
    process.exit(1);
  }
  console.log(`PDF gravado: ${PDF}`);
}
