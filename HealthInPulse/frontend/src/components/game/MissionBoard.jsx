// ─── Plano de prevenção do /teste ───────────────────────────
// Resultado da trilha como placar de hábitos: o que a pessoa já faz
// (wins), as missões com pontos e os exames da idade. Tudo vem do
// backend (patientView.missionsFor); aqui só apresentação. Nada cita
// doença (regra R2): pontos medem hábito, não risco.
import { useState } from 'react';
import clsx from 'clsx';
import { CheckCircle2, Circle, Sparkles, FileSearch, Trophy } from 'lucide-react';

export function ScoreRing({ earned, total }) {
  const pct = total ? Math.round((earned / total) * 100) : 0;
  const r = 42, c = 2 * Math.PI * r;
  return (
    <div className="relative w-28 h-28 shrink-0" role="img" aria-label={`${earned} de ${total} pontos de prevenção`}>
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="10" className="stroke-surface-200" />
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="10" strokeLinecap="round"
          className="stroke-brand-600 transition-[stroke-dashoffset] duration-700"
          strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl font-bold text-surface-900 tabular-nums">{earned}</span>
        <span className="text-[11px] text-surface-500">de {total} pts</span>
      </div>
    </div>
  );
}

export function WinList({ items }) {
  if (!items?.length) return null;
  return (
    <div className="glass p-5 space-y-3">
      <p className="section-title flex items-center gap-1"><Trophy size={12} /> Você já faz</p>
      <ul className="space-y-2">
        {items.map((w) => (
          <li key={w.code} className="flex items-start gap-2.5 text-sm">
            <CheckCircle2 size={18} className="text-green-600 shrink-0 mt-px" aria-hidden />
            <div className="min-w-0">
              <p className="font-medium text-surface-800">{w.title} <span className="text-green-700 text-xs">+{w.points}</span></p>
              <p className="text-surface-600 text-xs">{w.text}</p>
              {w.source && <p className="text-[11px] text-surface-400">Fonte: {w.source}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Missões com "aceitar": só na tela (nada é gravado), mas dá a sensação
// de compromisso e mostra quanto o placar subiria
export function MissionList({ items, onAccepted }) {
  const [accepted, setAccepted] = useState([]);
  if (!items?.length) {
    return (
      <div className="glass p-5 text-sm text-surface-700 flex items-center gap-2">
        <Sparkles size={16} className="text-brand-600" aria-hidden /> Nenhuma missão pendente. Mantenha o que você já faz.
      </div>
    );
  }
  const toggle = (code) => setAccepted((a) => {
    const next = a.includes(code) ? a.filter((x) => x !== code) : [...a, code];
    onAccepted?.(items.filter((m) => next.includes(m.code)).reduce((s, m) => s + m.points, 0));
    return next;
  });
  return (
    <div className="glass p-5 space-y-3">
      <p className="section-title flex items-center gap-1"><Sparkles size={12} /> Suas missões</p>
      <ul className="space-y-2">
        {items.map((m) => {
          const on = accepted.includes(m.code);
          return (
            <li key={m.code}>
              <button type="button" onClick={() => toggle(m.code)} aria-pressed={on}
                className={clsx('w-full text-left flex items-start gap-2.5 rounded-xl border p-3 transition-colors',
                  on ? 'border-brand-400 bg-brand-50' : 'border-surface-200 hover:border-brand-300')}>
                {on ? <CheckCircle2 size={18} className="text-brand-700 shrink-0 mt-px" aria-hidden />
                    : <Circle size={18} className="text-surface-300 shrink-0 mt-px" aria-hidden />}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-surface-800">{m.title} <span className="text-brand-700 text-xs">+{m.points}</span></span>
                  <span className="block text-surface-600 text-xs mt-0.5">{m.text}</span>
                  {m.source && <span className="block text-[11px] text-surface-400 mt-0.5">Fonte: {m.source}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-surface-400">Toque para aceitar uma missão. Fica só nesta tela.</p>
    </div>
  );
}

const EXAM_BADGE = { RECOMENDADO: 'badge-green', CONVERSAR: 'badge-blue', FUTURO: 'badge-gray' };
const EXAM_LABEL = { RECOMENDADO: 'Para a sua idade', CONVERSAR: 'Converse com o médico', FUTURO: 'Nos próximos anos' };

export function ExamMissions({ items, age }) {
  return (
    <div className="glass p-5 space-y-3">
      <p className="section-title flex items-center gap-1"><FileSearch size={12} /> Exames preventivos</p>
      {items?.length ? (
        <ul className="space-y-2">
          {items.map((e, i) => (
            <li key={`${e.exam}-${i}`} className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-surface-800">{e.exam}</span>
                <span className={EXAM_BADGE[e.status] ?? 'badge-gray'}>{EXAM_LABEL[e.status] ?? e.status}</span>
              </div>
              <p className="text-surface-600 text-xs mt-0.5">{e.text}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-surface-700">
          {age != null && age < 40
            ? 'Nenhum exame de rastreamento é indicado para a sua idade. O check-up de rotina com pressão e exame de sangue continua valendo.'
            : 'Nenhum exame de rastreamento pendente para o seu perfil.'}
        </p>
      )}
      <p className="text-[11px] text-surface-400">Fonte: programas de rastreamento do Ministério da Saúde e do INCA.</p>
    </div>
  );
}
