// ─── Mapas de risco unificados ──────────────────────────────
// Um lugar só para rótulos e cores de risco. Dois vocabulários:
//   - riskLevel geral (LOW/MODERATE/HIGH/CRITICAL/INCONCLUSIVE), o mesmo
//     dos relatórios, exames e triagem crônica;
//   - nível oncológico (ROTINA/ATENÇÃO/INVESTIGAR), do motor de câncer.
// Oncologia NUNCA usa vermelho: verde → âmbar → laranja. Vermelho fica
// só para emergência (CRITICAL / red flag de emergência).

// ─── Risco geral ─────────────────────────────────────────────
export const RISK_CLASS = {
  LOW:          'badge-low',
  MODERATE:     'badge-moderate',
  HIGH:         'badge-high',
  CRITICAL:     'badge-critical',
  INCONCLUSIVE: 'inline-flex items-center text-xs px-2.5 py-0.5 rounded-full bg-surface-100 text-surface-700 border border-surface-200 font-medium',
};

export const RISK_LABEL = {
  LOW: 'Baixo', MODERATE: 'Moderado', HIGH: 'Alto', CRITICAL: 'Crítico', INCONCLUSIVE: 'Inconclusivo',
};

// ─── Nível oncológico ───────────────────────────────────────
// `tone` são classes Tailwind prontas (o purge do Tailwind só enxerga
// nomes de classe inteiros, então nada de montar `bg-${cor}-50`).
export const ONCO_LEVEL = {
  ROTINA: {
    key:      'ROTINA',
    label:    'Rotina',
    badge:    'badge-low',
    dot:      'bg-green-600',
    bar:      'bg-green-500',
    text:     'text-green-700',
    soft:     'bg-green-50 border-green-200',
    headline: 'Nada fora do esperado para a sua idade',
    visitor:  'Seu risco estimado está perto ou abaixo da média. Siga o rastreamento indicado para a sua idade.',
  },
  'ATENÇÃO': {
    key:      'ATENÇÃO',
    label:    'Atenção',
    badge:    'badge-moderate',
    dot:      'bg-amber-500',
    bar:      'bg-amber-500',
    text:     'text-amber-700',
    soft:     'bg-amber-50 border-amber-200',
    headline: 'Vale conversar com um médico',
    visitor:  'Seu risco estimado está acima da média em pelo menos um tipo de câncer. Isso não é diagnóstico: é um motivo para manter os exames em dia.',
  },
  INVESTIGAR: {
    key:      'INVESTIGAR',
    label:    'Investigar',
    badge:    'badge-high',
    dot:      'bg-orange-500',
    bar:      'bg-orange-500',
    text:     'text-orange-700',
    soft:     'bg-orange-50 border-orange-200',
    headline: 'Procure uma avaliação médica',
    visitor:  'Algumas respostas são sinais que merecem ser examinados. Na maioria das vezes a causa não é câncer, mas só uma consulta consegue confirmar.',
  },
};

export const ONCO_ORDER = ['ROTINA', 'ATENÇÃO', 'INVESTIGAR'];
export const oncoLevel = (level) => ONCO_LEVEL[level] ?? ONCO_LEVEL.ROTINA;

// Limiar do NICE NG12 e corte de exibição (o Naive Bayes fica
// superconfiante com evidências correlacionadas: acima disso, "≥20%").
export const ALERT_THRESHOLD = 0.03;
export const DISPLAY_CAP     = 0.2;

// ─── Números em pt-BR ───────────────────────────────────────
const nf = (n, digits) => n.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

// Probabilidade → "2,3%", "0,23%", "<0,01%", "≥20%". Mesma regra do motor
// (riskEngine.pct); use quando não houver `display.posterior` pronto.
export function formatPct(p) {
  if (p == null || Number.isNaN(p)) return '—';
  if (p >= DISPLAY_CAP) return '≥20%';
  if (p < 0.0001) return '<0,01%';
  const v = p * 100;
  return `${nf(v, v >= 1 ? 1 : 2)}%`;
}

// Fator multiplicativo → "3,9×", "12×", "0,6×"
export function formatFactor(f) {
  if (f == null || Number.isNaN(f)) return '—';
  return `${nf(f, f >= 10 ? 0 : 1)}×`;
}

// "Posterior" posicionado numa escala log de 0,01% a 20% (0 a 1), para a
// barra da médica. Abaixo de 0,01% fica em 0, acima de 20% em 1.
const LOG_MIN = Math.log10(0.0001);
const LOG_MAX = Math.log10(DISPLAY_CAP);
export function logScale(p) {
  if (p == null || p <= 0) return 0;
  const x = (Math.log10(p) - LOG_MIN) / (LOG_MAX - LOG_MIN);
  return Math.min(1, Math.max(0, x));
}

// "~3 em 1.000" → { n: 3, d: 1000, approx: true }. "menos de 1 em
// 10.000" e "mais de 1 em 5" também são reconhecidos (less / more).
export function parseFrequency(text) {
  if (!text) return null;
  const m = /(\d[\d.]*)\s+em\s+(\d[\d.]*)/.exec(text);
  if (!m) return null;
  const toInt = (s) => Number(s.replace(/\./g, ''));
  return {
    n:      toInt(m[1]),
    d:      toInt(m[2]),
    less:   /menos de/i.test(text),
    more:   /mais de/i.test(text),
    approx: text.trim().startsWith('~'),
  };
}

// Risco relativo para exibir. Com INVESTIGAR o RR explode (Naive Bayes
// com evidências correlacionadas: o Roberto dá 285×), então acima de 10×
// mostramos ">10×". ROTINA e ATENÇÃO mantêm o valor do motor.
export const RR_CAP = 10;
export function displayRelativeRisk(c) {
  if (!c?.display?.relativeRisk) return null;
  if (c.level === 'INVESTIGAR' && c.relativeRisk > RR_CAP) return `>${RR_CAP}×`;
  return c.display.relativeRisk;
}

// Risco relativo para o VISITANTE. Decisões pelo valor BRUTO (não pelo
// texto arredondado do motor: 1,96 não pode virar "2,0×" ao lado de Rotina):
//   - INVESTIGAR: não mostra RR (a mensagem é procurar avaliação);
//   - RR > 10: ">10×" em qualquer nível (o Naive Bayes exagera);
//   - 1,2 ≤ RR ≤ 10: número truncado em 1 casa ("1,9×", "2,2×");
//   - RR < 1,2: sem número: "dentro da média" (≥ 0,8) ou "abaixo da média".
// Devolve { value: '2,2×' | null, phrase, above } ou null (não mostrar nada).
export const RR_VISITOR_MIN = 1.2;
export function formatVisitorRR(rr) {
  if (rr == null || Number.isNaN(rr)) return null;
  if (rr > RR_CAP) return `>${RR_CAP}×`;
  return `${nf(Math.floor(rr * 10) / 10, 1)}×`;
}
export function visitorRelativeRisk(c) {
  const rr = c?.relativeRisk;
  if (rr == null || c.level === 'INVESTIGAR') return null;
  if (rr >= RR_VISITOR_MIN) return { value: formatVisitorRR(rr), phrase: 'acima da média', above: true };
  return { value: null, phrase: rr >= 0.8 ? 'dentro da média' : 'abaixo da média', above: false };
}

// ATENÇÃO pode vir só do risco absoluto (P ≥ 1%) com RR ≈ 1 (ex.: homem
// de 70+ e próstata). Aí "acima da média" seria falso: o texto passa a
// falar da idade. Usado no card e na manchete do resultado do visitante.
export const ATTENTION_BY_AGE_TEXT = 'Na sua idade, a chance já pede atenção ao rastreamento.';
export const attentionByRR = (c) => c?.level === 'ATENÇÃO' && (c.relativeRisk ?? 0) >= RR_VISITOR_MIN;

// Manchete e texto do resultado do visitante, pelo nível geral e pelos cards
export function visitorSummary(level, conditions = []) {
  const lv = oncoLevel(level);
  if (level === 'ATENÇÃO' && !conditions.some(attentionByRR)) {
    return {
      headline: 'Na sua idade, vale manter os exames em dia',
      text: `${ATTENTION_BY_AGE_TEXT} Isso vem da idade, não das suas respostas, e não é diagnóstico.`,
    };
  }
  return { headline: lv.headline, text: lv.visitor };
}

// ─── Explicação (contribuições do motor) ───────────────────
export const EVIDENCE_KIND = {
  QUESTION: 'Resposta',
  LAB:      'Exame',
  WEARABLE: 'Pulseira / balança',
};

// ─── Rastreamento ───────────────────────────────────────────
export const SCREENING_STATUS = {
  INDICADO_AGORA:        { label: 'Indicado agora',        badge: 'badge-low' },
  DECISAO_COMPARTILHADA: { label: 'Converse com o médico', badge: 'inline-flex items-center text-xs px-2.5 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200 font-medium' },
  FUTURO:                { label: 'No futuro',             badge: 'inline-flex items-center text-xs px-2.5 py-0.5 rounded-full bg-surface-100 text-surface-600 border border-surface-200 font-medium' },
};

export const SCREENING_KIND = {
  POPULACIONAL:          'Rastreamento para todos da faixa',
  ALTO_RISCO:            'Alto risco',
  DECISAO_COMPARTILHADA: 'Decisão compartilhada',
};

export function formatInterval(months) {
  if (!months) return null;
  if (months === 12) return 'todo ano';
  if (months % 12 === 0) return `a cada ${months / 12} anos`;
  return `a cada ${months} meses`;
}

// Autor + ano de uma fonte: "Hamilton W, Round A, ... 2005" → "Hamilton 2005"
export function shortCitation(source) {
  if (!source) return null;
  const author = (source.citation || source.code || '').split(/[ ,.:]/)[0];
  return [author, source.year].filter(Boolean).join(' ');
}
