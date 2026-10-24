// ─── URL segura para links vindos da base (fontes clínicas) ──
// A URL de uma fonte vem do banco (ClinicalSource.url). Só vira link se
// for http/https; qualquer outra coisa (javascript:, data:, ...) devolve
// null e quem chama mostra texto puro. Use em TODO link de URL da base
// (RiskExplanation, Base da IA).
export function safeUrl(u) {
  if (typeof u !== 'string' || !u.trim()) return null;
  try {
    const url = new URL(u.trim(), window.location.origin);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
