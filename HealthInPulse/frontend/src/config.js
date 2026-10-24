// ─── Configuração do frontend ───────────────────────────────
// URL pública do teste rápido: é o que vai no QR code ("faça no seu
// celular"). O notebook do stand roda offline, então o QR aponta para
// o deploy no Render, que o celular do visitante alcança pela internet.
// Sobrescreva com VITE_PUBLIC_TEST_URL no build (ex.: outro domínio).
export const PUBLIC_TEST_URL =
  import.meta.env.VITE_PUBLIC_TEST_URL || 'https://healthinpulse.onrender.com/teste';

// Modo quiosque (/teste?kiosk=1): volta sozinho à capa depois disto parado
export const KIOSK_IDLE_MS = 120 * 1000;
