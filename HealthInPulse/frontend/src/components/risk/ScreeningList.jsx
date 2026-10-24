// ─── Rastreamento indicado ──────────────────────────────────
// Props:
//   items    [Screen] com status INDICADO_AGORA ou DECISAO_COMPARTILHADA
//   future   [Screen] com status FUTURO (startAge) — opcional
//   audience 'visitor' | 'doctor' (a médica vê o tipo da regra e a fonte)
//   empty    texto quando não há nada (opcional)
// `investigate:true` + `note`: há sinais; o próximo passo é avaliação, não
// rastreamento de rotina (destacado em laranja, nunca vermelho).
import clsx from 'clsx';
import { CalendarClock } from 'lucide-react';
import { SCREENING_STATUS, SCREENING_KIND, formatInterval } from '@/lib/risk';

export default function ScreeningList({ items = [], future = [], audience = 'visitor', empty }) {
  const doctor = audience === 'doctor';

  if (!items.length && !future.length) {
    return <p className="text-sm text-surface-500">{empty || 'Nenhum rastreamento indicado para este perfil agora.'}</p>;
  }

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((s) => {
            const st = SCREENING_STATUS[s.status] ?? SCREENING_STATUS.FUTURO;
            const every = formatInterval(s.intervalMonths);
            return (
              <li key={s.ruleId} className="rounded-xl border border-surface-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-surface-900">{s.exam}</p>
                    <p className="text-xs text-surface-500 mt-0.5">
                      {s.conditionLabel}{every && `, ${every}`}
                      {doctor && <> · {SCREENING_KIND[s.kind] || s.kind} · {s.sourceCode}</>}
                    </p>
                  </div>
                  <span className={clsx(st.badge, 'shrink-0')}>{st.label}</span>
                </div>
                {s.recommendation && <p className="text-sm text-surface-600 mt-2 leading-relaxed">{s.recommendation}</p>}
                {s.investigate && s.note && (
                  <p className="text-sm mt-2 rounded-lg border border-orange-200 bg-orange-50 text-orange-800 px-3 py-2">{s.note}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {future.length > 0 && (
        <ul className="space-y-1.5">
          {future.map((s) => (
            <li key={s.ruleId} className="flex items-start gap-2 text-sm text-surface-600">
              <CalendarClock size={15} className="shrink-0 mt-0.5 text-surface-400" aria-hidden />
              <span>
                A partir dos <strong className="text-surface-800">{s.startAge} anos</strong>: {s.exam}
                <span className="text-surface-400"> ({s.conditionLabel})</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
