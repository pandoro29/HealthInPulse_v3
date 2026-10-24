// ─── Frequência natural em pontos ("~3 em 1.000") ────────────
// Matriz de ícones: cada ponto é uma pessoa; os coloridos são as que
// recebem o diagnóstico em 2 anos. É o jeito mais claro de mostrar risco
// pequeno sem assustar (e sem parecer "nada").
// Desenha só denominadores que cabem: 5, 10, 100 ou 1.000. "Menos de 1 em
// 10.000" fica só no texto.
import { useMemo } from 'react';
import { parseFrequency } from '@/lib/risk';

const LAYOUT = { 5: [5, 1], 10: [10, 1], 100: [20, 5], 1000: [50, 20] };
const FILL = {
  ROTINA:     '#16a34a', // green-600
  'ATENÇÃO':  '#f59e0b', // amber-500
  INVESTIGAR: '#f97316', // orange-500
};

export default function FrequencyDots({ frequency, level = 'ROTINA', className }) {
  const f = parseFrequency(frequency);
  const grid = f && !f.less ? LAYOUT[f.d] : null;

  const dots = useMemo(() => {
    if (!grid) return [];
    const [cols, rows] = grid;
    const out = [];
    for (let i = 0; i < cols * rows; i++) out.push({ x: i % cols, y: Math.floor(i / cols), on: i < f.n });
    return out;
  }, [grid, f?.n]);

  if (!grid) return null;
  const [cols, rows] = grid;

  return (
    <svg
      viewBox={`0 0 ${cols * 10} ${rows * 10}`}
      className={className}
      role="img"
      aria-label={`${frequency} pessoas`}
      preserveAspectRatio="xMinYMin meet"
    >
      {dots.map((d, i) => (
        <circle
          key={i}
          cx={d.x * 10 + 5} cy={d.y * 10 + 5}
          r={d.on ? 4 : 3}
          fill={d.on ? FILL[level] || FILL.ROTINA : '#dfe5ee'}
        />
      ))}
    </svg>
  );
}
