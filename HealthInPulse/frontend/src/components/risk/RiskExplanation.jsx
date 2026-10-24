// ─── "Por quê": fator a fator ────────────────────────────────
// Mostra de onde saiu a estimativa de um câncer (`Cond` do riskEngine):
//   1. ponto de partida: média da mesma idade e sexo (baselinePrior);
//   2. fatores de risco do perfil (`factors`, já dentro do prior);
//   3. o que cada resposta, exame ou dado da balança fez com a chance
//      (`contributions`, factor = e^delta, multiplica a chance).
// Props: { condition, audience: 'visitor' | 'doctor' }
// A médica vê também a fonte de cada número e o tipo de evidência.
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import clsx from 'clsx';
import { formatFactor, formatPct, shortCitation, EVIDENCE_KIND } from '@/lib/risk';
import { safeUrl } from '@/lib/url';

function Source({ source }) {
  if (!source) return null;
  const text = shortCitation(source);
  const href = safeUrl(source.url); // só http/https vira link
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-700 hover:underline" title={source.citation}>{text}</a>
    : <span title={source.citation}>{text}</span>;
}

// Uma linha: ícone de direção, rótulo, efeito e barra proporcional a |ln|
function EffectRow({ up, neutral, label, detail, factor, weight, children }) {
  const Icon = neutral ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <li className="py-2 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2">
        <Icon size={15} aria-hidden className={clsx('shrink-0 mt-0.5',
          neutral ? 'text-surface-400' : up ? 'text-amber-600' : 'text-green-600')} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-surface-800">
            {label}
            {detail && <span className="text-surface-500"> · {detail}</span>}
          </p>
          {children}
        </div>
        <span className={clsx('text-sm font-semibold tabular-nums shrink-0',
          neutral ? 'text-surface-400' : up ? 'text-amber-700' : 'text-green-700')}>
          {neutral ? '—' : formatFactor(factor)}
        </span>
      </div>
      {!neutral && (
        <div className="ml-6 mt-1.5 h-1 bg-surface-100 rounded-full overflow-hidden" aria-hidden>
          <div className={clsx('h-full rounded-full', up ? 'bg-amber-400' : 'bg-green-500')}
            style={{ width: `${Math.max(4, Math.round(weight * 100))}%` }} />
        </div>
      )}
    </li>
  );
}

export default function RiskExplanation({ condition: c, audience = 'visitor' }) {
  if (!c || !c.eligible) return null;
  const doctor = audience === 'doctor';

  const factors = c.factors ?? [];
  const contribs = [...(c.contributions ?? [])]
    .filter((x) => doctor || (x.delta !== 0 && !x.superseded))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // Barras na mesma escala: o maior |ln fator| da lista vale 100%
  const maxLn = Math.max(
    0.0001,
    ...factors.map((f) => Math.abs(Math.log(f.factor || 1))),
    ...contribs.map((x) => Math.abs(x.delta)),
  );

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="font-medium text-surface-700">Ponto de partida</p>
        <p className="text-surface-500 mt-0.5">
          {doctor
            ? <>Média para a idade e o sexo: <strong className="text-surface-700">{formatPct(c.baselinePrior)}</strong> em 2 anos
                {c.priorRelativeRisk != null && Math.abs(c.priorRelativeRisk - 1) > 0.005 && (
                  <> → com os fatores do perfil: <strong className="text-surface-700">{formatPct(c.prior)}</strong> ({formatFactor(c.priorRelativeRisk)})</>
                )}.</>
            : 'A chance média de pessoas da sua idade e do seu sexo. Depois, cada fator e cada resposta aumenta ou diminui essa chance.'}
        </p>
      </div>

      {factors.length > 0 && (
        <div>
          <p className="font-medium text-surface-700 mb-1.5">Fatores do perfil</p>
          <ul className="divide-y divide-surface-100">
            {factors.map((f) => (
              <EffectRow key={f.ruleId}
                up={f.factor > 1} neutral={f.factor === 1}
                label={f.label}
                detail={f.modifiable ? 'dá para mudar' : null}
                factor={f.factor}
                weight={Math.abs(Math.log(f.factor || 1)) / maxLn}>
                {doctor && f.source && (
                  <p className="text-xs text-surface-400 mt-0.5">Fonte: <Source source={f.source} /></p>
                )}
              </EffectRow>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="font-medium text-surface-700 mb-1.5">
          {doctor ? 'Evidências (multiplicam a chance)' : 'O que as suas respostas mudaram'}
        </p>
        {contribs.length === 0 ? (
          <p className="text-surface-500">
            {doctor ? 'Nenhuma evidência para este câncer.' : 'Nenhuma resposta mudou esta estimativa.'}
          </p>
        ) : (
          <ul className="divide-y divide-surface-100">
            {contribs.map((x) => (
              <EffectRow key={`${x.kind}:${x.code}`}
                up={x.delta > 0} neutral={x.delta === 0}
                label={x.label}
                detail={doctor ? `${EVIDENCE_KIND[x.kind] || x.kind}: ${x.answer}` : x.answer}
                factor={x.factor}
                weight={Math.abs(x.delta) / maxLn}>
                {doctor && (x.note || x.source) && (
                  <p className="text-xs text-surface-400 mt-0.5">
                    {x.note}{x.note && x.source ? ' · ' : ''}
                    {x.source && <>Fonte: <Source source={x.source} /></>}
                  </p>
                )}
              </EffectRow>
            ))}
          </ul>
        )}
      </div>

      {!doctor && (
        <p className="text-xs text-surface-400">
          Os números vêm de estudos publicados (como os CAPER, que embasam a diretriz NICE NG12) e das estimativas do INCA.
        </p>
      )}
    </div>
  );
}
