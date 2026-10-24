const crypto    = require('crypto');
const express   = require('express');
const rateLimit = require('express-rate-limit');
const logger    = require('../utils/logger');

/**
 * Portão de acesso da demo pública (ex.: Render).
 *
 * As senhas dos usuários de demo são públicas (README, cards do login): um link
 * aberto deixaria qualquer pessoa entrar como a médica e, com OPENAI_API_KEY
 * configurada, gastar a chave paga. Com DEMO_PASSWORD definido, só passa quem
 * digitou a senha da turma. Ela vira um cookie HttpOnly assinado, que o
 * navegador manda sozinho em toda requisição, sem conflitar com o Bearer
 * token da API.
 *
 * Sem DEMO_PASSWORD (dev, Codespaces, docker compose local) não faz nada.
 * O Socket.io não passa por aqui (atende antes do Express) e já exige JWT.
 */

const COOKIE      = 'demo_access';
const MAX_AGE_MS  = 30 * 24 * 60 * 60 * 1000; // 30 dias
const OPEN_PATHS  = new Set(['/health', '/demo-access', '/favicon.svg']);
// Teste público do stand (/teste, aberto pelo QR): a página, os arquivos
// do build e a API dele passam sem senha. Por prefixo: '/teste' libera
// '/teste' e '/teste/...', mas não '/testes'. O favicon é exato (acima).
const OPEN_PREFIXES = ['/teste', '/assets/', '/api/public/'];
// Caminho com `..` (cru ou codificado) nunca é aberto: o express.static e
// o SPA normalizam `/teste/../api/...` e o prefixo enganaria o portão.
const TRAVERSAL = /\/\.\.|%2e/i;
const isOpen = (p) => {
  if (typeof p !== 'string' || TRAVERSAL.test(p)) return false;
  return OPEN_PATHS.has(p) || OPEN_PREFIXES.some((pre) =>
    p === pre || p.startsWith(pre.endsWith('/') ? pre : `${pre}/`));
};

// Trocar a senha invalida os cookies já emitidos
const sign = (password) => crypto
  .createHmac('sha256', process.env.JWT_ACCESS_SECRET || 'healthinpulse-demo-gate')
  .update(`demo-gate:${password}`)
  .digest('hex');

// Compara em tempo constante, mesmo com tamanhos diferentes
const safeEqual = (a, b) => crypto.timingSafeEqual(
  crypto.createHash('sha256').update(String(a)).digest(),
  crypto.createHash('sha256').update(String(b)).digest(),
);

const readCookie = (req, name) => {
  const pair = (req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : null;
};

// Só caminhos internos: evita open redirect via ?next=https://... ou //host
const safeNext = (value) =>
  (typeof value === 'string' && /^\/(?![/\\])/.test(value) ? value : '/');

const escapeHtml = (text) => text.replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));

const page = ({ next, error }) => `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HealthInPulse · acesso à demo</title>
  <style>
    :root { color-scheme: light dark; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center;
           font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
           background: #f1f5f9; color: #0f2a4a; }
    main { width: min(360px, calc(100% - 32px)); background: #fff; padding: 28px;
           border-radius: 16px; box-shadow: 0 8px 30px rgba(15, 42, 74, .08); }
    h1 { margin: 0 0 4px; font-size: 1.35rem; }
    p { margin: 0 0 20px; color: #475569; font-size: .92rem; line-height: 1.4; }
    label { display: block; font-size: .8rem; font-weight: 600; margin-bottom: 6px; }
    input { box-sizing: border-box; width: 100%; padding: 10px 12px; font-size: 1rem;
            border: 1px solid #cbd5e1; border-radius: 10px; }
    input:focus { outline: 2px solid #0d9488; border-color: transparent; }
    button { margin-top: 14px; width: 100%; padding: 11px; font-size: 1rem; font-weight: 600;
             color: #fff; background: #0f2a4a; border: 0; border-radius: 10px; cursor: pointer; }
    .error { margin: 0 0 14px; padding: 8px 10px; border-radius: 8px;
             background: #fef2f2; color: #b91c1c; font-size: .88rem; }
    @media (prefers-color-scheme: dark) {
      body { background: #0b1626; color: #e2e8f0; }
      main { background: #12233a; box-shadow: none; }
      p { color: #94a3b8; }
      input { background: #0b1626; color: #e2e8f0; border-color: #334155; }
      button { background: #0d9488; }
      .error { background: #3b1219; color: #fecaca; }
    }
  </style>
</head>
<body>
  <main>
    <h1>HealthInPulse</h1>
    <p>Demo acadêmica restrita à turma. Digite a senha de acesso que o grupo passou.</p>
    ${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ''}
    <form method="post" action="/demo-access">
      <input type="hidden" name="next" value="${escapeHtml(next)}">
      <label for="password">Senha da demo</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
      <button type="submit">Entrar</button>
    </form>
  </main>
</body>
</html>`;

const demoGate = () => {
  const router   = express.Router();
  const password = process.env.DEMO_PASSWORD;

  if (!password) {
    if (process.env.NODE_ENV === 'production') {
      logger.warn('DEMO_PASSWORD não definido: a demo está aberta para qualquer pessoa com o link');
    }
    return router; // sem portão
  }

  const token = sign(password);

  router.get('/demo-access', (req, res) => {
    res.send(page({ next: safeNext(req.query.next) }));
  });

  router.post(
    '/demo-access',
    // Conta só tentativas erradas: a turma inteira pode sair pelo mesmo IP
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 20,
      skipSuccessfulRequests: true,
      handler: (req, res) => res.status(429).send(page({
        next:  safeNext(req.body?.next),
        error: 'Muitas tentativas erradas. Espere 15 minutos.',
      })),
    }),
    (req, res) => {
      const next = safeNext(req.body?.next);
      if (!safeEqual(req.body?.password ?? '', password)) {
        return res.status(401).send(page({ next, error: 'Senha incorreta.' }));
      }
      res.cookie(COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure:   req.secure,
        maxAge:   MAX_AGE_MS,
        path:     '/',
      });
      res.redirect(303, next);
    },
  );

  router.use((req, res, next) => {
    if (isOpen(req.path)) return next();

    const cookie = readCookie(req, COOKIE);
    if (cookie && safeEqual(cookie, token)) return next();

    // Navegação do navegador vai para a página da senha; API recebe JSON
    if (req.method === 'GET' && req.accepts(['html', 'json']) === 'html') {
      return res.redirect(302, `/demo-access?next=${encodeURIComponent(req.originalUrl)}`);
    }
    res.status(401).json({ error: 'Demo protegida: abra a página inicial e digite a senha da turma.' });
  });

  return router;
};

module.exports = demoGate;
module.exports.isOpen = isOpen;
