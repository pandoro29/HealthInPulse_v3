// ─── Card de risco de um câncer ──────────────────────────────
// Props:
//   condition  `Cond` do riskEngine (teste rápido ou /risk)
//   audience   'visitor' → categoria, risco relativo ("2,2× a média"; abaixo
//                          de 1,2× só "dentro/abaixo da média") e
//                          frequência natural ("~3 em 1.000"), sem %;
//              'doctor'  → também o % em 2 anos ("estimativa didática"),
//                          numa escala com os limiares de 1% e 3%.
//              RR acima de 10× com INVESTIGAR aparece como ">10×" (médica);
//              para o visitante, ">10×" em qualquer nível (lib/risk).
//   explain    mostra o botão "Por quê?" com a RiskExplanation (padrão true)
//   defaultOpen abre a explicação já de início
// Acima de 20% o motor manda display.posterior = "≥20%" (capped).
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import {
  oncoLevel, logScale, formatPct, formatFactor, visitorRelativeRisk, displayRelativeRisk, ATTENTION_BY_AGE_TEXT, ALERT_THRESHOLD,
} from '@/lib/risk';
import FrequencyDots from './FrequencyDots';
import RiskExplanation from './RiskExplanation';

// Escala log de 0,01% a 20% com as marcas de 1% (atenção) e 3% (investigar)
export function RiskScale({ condition: c }) {
  const lv   = oncoLevel(c.level);
  const pos  = logScale(c.posterior);
  const watch = logScale(c.watchThreshold ?? 0.01);
  const alert = logScale(c.alertThreshold ?? ALERT_THRESHOLD);
  return (
    <div className="pt-5 pb-1" aria-hidden>
      <div className="relative h-2 rounded-full bg-surface-100">
        <div className={clsx('absolute inset-y-0 left-0 rounded-full', lv.bar)} style={{ width: `${pos * 100}%` }} />
        {[{ x: watch, l: formatPct(c.watchThreshold ?? 0.01) }, { x: alert, l: formatPct(c.alertThreshold ?? ALERT_THRESHOLD) }].map((m) => (
          <div key={m.l} className="absolute -top-4 bottom-[-4px] flex flex-col items-center" style={{ left: `${m.x * 100}%` }}>
            <span className="text-[10px] leading-none text-surface-400 -translate-x-1/2 absolute -top-0.5 whitespace-nowrap">{m.l}</span>
            <span className="absolute top-3 w-px h-4 bg-surface-400" />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-surface-400 mt-1.5">
        <span>0,01%</span><span>≥20%</span>
      </div>
    </div>
  );
}

export default function ConditionRiskCard({ condition: c, audience = 'visitor', explain = true, defaultOpen = false, className }) {
  const [open, setOpen] = useState(defaultOpen);
  const lv = oncoLevel(c.level);
  const doctor = audience === 'doctor';
  const d = c.display;

  // Fora da faixa de idade: só o motivo
  if (!c.eligible || !d) {
    return (
      <div className={clsx('glass p-4 flex items-start gap-3', className)}>
        <div className="flex-1">
          <p className="font-display font-semibold text-surface-700">{c.label}</p>
          <p className="text-sm text-surface-500 mt-0.5">{c.reason || 'Não avaliado para este perfil.'}</p>
        </div>
      </div>
    );
  }

  // Visitante: sem RR com INVESTIGAR (a mensagem é procurar avaliação) e
  // sem número abaixo de 1,2× (lib/risk.visitorRelativeRisk). A médica vê
  // o RR sempre (com ">10×" para INVESTIGAR).
  const vrr = doctor ? null : visitorRelativeRisk(c);

  return (
    <article className={clsx('glass p-5 flex flex-col gap-3', className)}>
      <header className="flex items-start justify-between gap-3">
        <h3 className="font-display font-semibold text-surface-900 leading-snug">{c.label}</h3>
        <span className={clsx(lv.badge, 'shrink-0')}>{lv.label}</span>
      </header>

      {doctor ? (
        <div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={clsx('font-display text-3xl font-bold tabular-nums', lv.text)}>{d.posterior}</span>
            <span className="text-xs text-surface-500">em 2 anos · estimativa didática</span>
          </div>
          <RiskScale condition={c} />
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs mt-2">
            <dt className="text-surface-500">Risco relativo</dt>
            <dd className="text-surface-800 font-medium text-right tabular-nums">{displayRelativeRisk(c)} a média</dd>
            <dt className="text-surface-500">Só fatores do perfil</dt>
            <dd className="text-surface-800 text-right tabular-nums">{formatFactor(c.priorRelativeRisk)}</dd>
            <dt className="text-surface-500">Frequência</dt>
            <dd className="text-surface-800 text-right">{d.frequency}</dd>
          </dl>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-surface-700 text-sm leading-relaxed">
            <span className={clsx('font-display text-2xl font-bold block leading-tight', lv.text)}>{d.frequency}</span>
            pessoas com respostas como as suas recebem esse diagnóstico em 2 anos.
          </p>
          <FrequencyDots frequency={d.frequency} level={c.level} className="w-full h-auto" />
          {vrr && (
            <p className="text-sm text-surface-600">
              {vrr.value
                ? <><strong className="text-surface-800 tabular-nums">{vrr.value} a média</strong> de pessoas da sua idade e sexo.</>
                : <>Risco <strong className="text-surface-800">{vrr.phrase}</strong> para a sua idade e sexo.
                    {c.level === 'ATENÇÃO' && <> {ATTENTION_BY_AGE_TEXT}</>}</>}
            </p>
          )}
          {c.level === 'INVESTIGAR' && (
            <p className={clsx('text-sm rounded-lg border px-3 py-2', lv.soft, lv.text)}>
              Procure uma avaliação médica e conte o que você respondeu aqui.
            </p>
          )}
        </div>
      )}

      {explain && (
        <div className="border-t border-surface-100 pt-2 mt-auto">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
            className="w-full flex items-center justify-between text-sm font-medium text-brand-700 py-1 hover:text-brand-900">
            Por quê?
            <ChevronDown size={16} className={clsx('transition-transform', open && 'rotate-180')} aria-hidden />
          </button>
          {open && (
            <div className="pt-3 animate-fade-in">
              <RiskExplanation condition={c} audience={audience} />
            </div>
          )}
        </div>
      )}
    </article>
  );
}
