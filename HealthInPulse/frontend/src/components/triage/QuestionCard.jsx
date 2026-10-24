// ─── Card de pergunta adaptativa ─────────────────────────────
// Extraído do Triage.jsx; usado também pelo teste público (/teste).
//
// Props:
//   question     { id, symptom, text, type: boolean|likert, options?, help?, followUps? }
//   progress     { asked, max }
//   explanation  { ig, targetHypothesis, targetProb } | null  (fase crônica)
//   reason       texto "Perguntamos porque…" | null            (fase oncológica)
//   busy         desabilita os botões
//   onAnswer     (value, followUps|null) → value 1/0 (ou null = "não sei");
//                followUps = [{ id, value }]
//   size         'md' (triagem) | 'lg' (stand: botões grandes, 1 por tela)
//   allowUnknown mostra o botão "Não sei" (manda value null)
//   followUpMode 'inline'   follow-ups sempre visíveis + "Confirmar" (triagem)
//                'afterYes' follow-ups só aparecem depois do "Sim"
//   onBack       mostra "Voltar" (opcional)
import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { ArrowLeft, Info, ThumbsUp, ThumbsDown, HelpCircle, Smile, Meh, Frown, CloudRain } from 'lucide-react';

// Modo "lg" (trilha do /teste): botões com ícone e a escala do PHQ com
// carinhas. Toque marca o botão por um instante antes de enviar, para a
// pessoa ver o que escolheu.
const PICK_DELAY_MS = 180;
const BOOL_ICON  = { 1: ThumbsUp, 0: ThumbsDown, null: HelpCircle };
const LIKERT_UI  = [
  { icon: Smile,     cls: 'border-green-300 bg-green-50 text-green-800' },
  { icon: Meh,       cls: 'border-lime-300 bg-lime-50 text-lime-800' },
  { icon: Frown,     cls: 'border-amber-300 bg-amber-50 text-amber-800' },
  { icon: CloudRain, cls: 'border-orange-300 bg-orange-50 text-orange-800' },
];

export default function QuestionCard({
  question: q, progress, explanation: exp, reason, busy, onAnswer,
  size = 'md', allowUnknown = false, followUpMode = 'inline', onBack,
}) {
  const [followUps, setFollowUps] = useState({});
  const [saidYes, setSaidYes]     = useState(false);
  const [picked, setPicked]       = useState(undefined); // valor tocado, até enviar

  useEffect(() => { setFollowUps({}); setSaidYes(false); setPicked(undefined); }, [q?.id]);

  const pick = (value, send) => {
    if (busy || picked !== undefined) return;
    setPicked(value);
    setTimeout(() => { setPicked(undefined); send(value); }, PICK_DELAY_MS);
  };

  if (!q) return null;
  const lg = size === 'lg';
  const hasFollowUps = Array.isArray(q.followUps) && q.followUps.length > 0;
  const showFollowUps = hasFollowUps && (followUpMode === 'inline' || saidYes);

  const triggerSubmit = (value) => {
    if (hasFollowUps && value === 1) {
      if (followUpMode === 'afterYes' && !saidYes) { setSaidYes(true); return; }
      // Com follow-up: precisa coletar todos antes de enviar
      if (q.followUps.every((fu) => followUps[fu.id] != null)) {
        const fus = Object.entries(followUps).map(([id, v]) => ({ id, value: v }));
        onAnswer(value, fus);
      }
      return;
    }
    onAnswer(value);
  };

  const mainOptions = [{ v: 1, l: 'Sim' }, { v: 0, l: 'Não' }];
  if (allowUnknown) mainOptions.push({ v: null, l: 'Não sei' });

  return (
    <div className={clsx('glass space-y-5', lg ? 'p-5 sm:p-8' : 'p-6')}>
      {progress && (
        <>
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: progress.max }).map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full transition-all ${
                i < progress.asked ? 'bg-brand-600' : 'bg-surface-100'
              }`} />
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 -mt-2">
            <p className="text-xs text-surface-400">
              {lg ? `Pergunta ${progress.asked + 1} de até ${progress.max}` : `${progress.asked} de até ${progress.max} perguntas`}
              {exp && (
                <span className="ml-2 text-surface-500">
                  · IG {exp.ig} · foco: {exp.targetHypothesis} ({exp.targetProb}%)
                </span>
              )}
            </p>
            {onBack && (
              <button type="button" onClick={onBack} disabled={busy}
                className="btn-ghost px-2 py-1 text-xs">
                <ArrowLeft size={13} /> Voltar
              </button>
            )}
          </div>
        </>
      )}

      <div className="space-y-3">
        <p className={clsx(
          lg ? 'font-display text-xl sm:text-2xl font-semibold leading-snug text-surface-900' : 'font-medium text-surface-800',
        )}>{q.text}</p>
        {q.help && <p className={clsx('text-surface-500', lg ? 'text-sm' : 'text-xs')}>{q.help}</p>}

        {/* Sim / Não (/ Não sei) */}
        {q.type === 'boolean' && (
          <div className={clsx(lg ? 'grid gap-3 pt-2' : 'flex gap-3', lg && (allowUnknown ? 'grid-cols-3' : 'grid-cols-2'))}>
            {mainOptions.map((o) => {
              const Icon = BOOL_ICON[o.v];
              const active = (o.v === 1 && saidYes) || picked === o.v;
              return (
                <button key={o.l} type="button"
                  onClick={() => (lg ? pick(o.v, triggerSubmit) : triggerSubmit(o.v))}
                  disabled={busy}
                  aria-pressed={active}
                  className={clsx(
                    'rounded-xl font-medium border transition-all duration-150 disabled:opacity-50',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40',
                    lg ? 'py-4 text-lg flex flex-col items-center gap-1.5 active:scale-95' : 'flex-1 py-2.5 text-sm',
                    active
                      ? 'bg-brand-100 border-brand-500 text-brand-700 scale-[1.03]'
                      : 'border-surface-200 hover:bg-brand-50 hover:border-brand-400',
                    o.v === null && !active && 'text-surface-500',
                  )}>
                  {lg && <Icon size={26} aria-hidden strokeWidth={1.75} />}
                  {o.l}
                </button>
              );
            })}
          </div>
        )}

        {/* Likert 0-3 */}
        {q.type === 'likert' && (
          <div className={clsx('grid gap-2', lg ? 'grid-cols-2 sm:grid-cols-4 pt-2' : 'grid-cols-2')}>
            {q.options.map((o, i) => {
              const ui = LIKERT_UI[Math.min(i, LIKERT_UI.length - 1)];
              const Icon = ui.icon;
              const active = picked === o.value;
              return (
                <button key={o.value} type="button"
                  onClick={() => (lg ? pick(o.value, onAnswer) : onAnswer(o.value))}
                  disabled={busy}
                  aria-pressed={active}
                  className={clsx(
                    'rounded-xl border transition-all duration-150 disabled:opacity-50',
                    lg
                      ? clsx('py-4 px-2 flex flex-col items-center gap-1.5 text-sm font-medium active:scale-95', active ? clsx(ui.cls, 'scale-[1.03]') : 'border-surface-200 hover:border-brand-400 hover:bg-brand-50')
                      : 'py-2.5 text-sm border-surface-200 hover:bg-brand-50 hover:border-brand-400 text-left px-3',
                  )}>
                  {lg ? <Icon size={28} aria-hidden strokeWidth={1.75} /> : <span className="text-xs text-surface-400 mr-1">{o.value}</span>}
                  {o.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Follow-ups condicionais */}
        {showFollowUps && (
          <div className="border-t border-surface-100 pt-3 mt-3 space-y-2 animate-fade-in">
            <p className={clsx('text-surface-500', lg ? 'text-sm' : 'text-xs')}>
              {followUpMode === 'afterYes' ? 'Mais uma coisa:' : 'Se sim, responda também:'}
            </p>
            {q.followUps.map((fu) => (
              <div key={fu.id}>
                <p className={clsx('text-surface-700 mb-1', lg ? 'text-base' : 'text-sm')}>{fu.text}</p>
                <div className="flex gap-2">
                  {[{ v: 1, l: 'Sim' }, { v: 0, l: 'Não' }].map((o) => (
                    <button key={o.l} type="button"
                      aria-pressed={followUps[fu.id] === o.v}
                      onClick={() => setFollowUps((f) => ({ ...f, [fu.id]: o.v }))}
                      className={`flex-1 rounded-xl border ${lg ? 'py-3 text-base' : 'py-2 text-xs'} ${
                        followUps[fu.id] === o.v ? 'bg-brand-100 border-brand-500 text-brand-600' : 'border-surface-200 text-surface-500 hover:border-surface-300'
                      }`}>{o.l}</button>
                  ))}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => triggerSubmit(1)}
              disabled={busy || q.followUps.some((fu) => followUps[fu.id] == null)}
              className={clsx('btn-primary w-full justify-center mt-2', lg && 'py-3 text-base')}>
              Confirmar respostas
            </button>
          </div>
        )}
      </div>

      {reason && (
        <p className="flex items-start gap-2 text-xs text-surface-500 border-t border-surface-100 pt-3">
          <Info size={13} className="shrink-0 mt-px text-brand-500" aria-hidden />
          <span>{reason}</span>
        </p>
      )}
    </div>
  );
}
