// ─── API pública (sem login) ────────────────────────────────
// fetch puro, de propósito: o axios de services/api.js tem um interceptor
// que, num 401, limpa o localStorage e manda para /login. O teste rápido
// do stand não pode cair nisso, nem mexer na sessão de quem está logado.

async function post(path, body, { signal } = {}) {
  let res;
  try {
    res = await fetch(`/api/public${path}`, {
      method:      'POST',
      headers:     { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body:        JSON.stringify(body ?? {}),
      signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError' || signal?.aborted) throw Object.assign(new Error('Tempo esgotado'), { status: 0, aborted: true });
    throw Object.assign(new Error('Sem conexão com o servidor. Confira a rede e tente de novo.'), { status: 0 });
  }

  let data = null;
  try { data = await res.json(); } catch { /* corpo vazio ou não-JSON */ }

  if (!res.ok) {
    const msg = data?.error || `Erro ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status, fields: data?.fields ?? [] });
  }
  return data;
}

export const publicApi = {
  // { profile?, answers? } → { stage: PROFILE | BLOCKED | QUESTION | RESULT, ... }
  // Sem estado: mande sempre o perfil e TODAS as respostas acumuladas.
  // opts.signal: AbortController (tempo máximo / nova chamada cancela a velha)
  quickTest: ({ profile, answers } = {}, opts) => post('/quick-test', { profile, answers }, opts),
};

export default publicApi;
