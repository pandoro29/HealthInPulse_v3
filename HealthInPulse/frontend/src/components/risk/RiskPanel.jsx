// ─── Painel de riscos (médica, e depois o próprio paciente) ──
// Busca a avaliação na hora (nada é gravado: GET /api/doctor/patients/:id/risk
// ou GET /api/patient/risk) e mostra:
//   cabeçalho (nível oncológico, quando, versão da base, "Recalcular") →
//   em que se baseou (triagem, exames, balança, pulseira) → red flag →
//   cards por câncer → rastreamento → fatores que dá para mudar →
//   doenças crônicas (separadas: o nível crônico NÃO tinge a oncologia).
// Props:
//   load      () => Promise<{ data }>  (ex.: () => doctorService.getPatientRisk(id))
//   deps      dependências do load (ex.: [patientId])
//   audience  'doctor' (padrão) | 'visitor' (cards, crônicas e aviso sem %; para a T9)
//   title     título da seção (opcional)
import { useState } from 'react';
import {
  RefreshCw, ClipboardCheck, FlaskConical, Scale, Watch, AlertTriangle,
  Loader, ChevronDown, Leaf,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import clsx from 'clsx';
import { useFetch } from '@/hooks';
import { oncoLevel, RISK_CLASS, RISK_LABEL, formatFactor } from '@/lib/risk';
import Disclaimer from '@/components/common/Disclaimer';
import ConditionRiskCard from './ConditionRiskCard';
import ScreeningList from './ScreeningList';

const fmtDate = (d, f = "dd/MM/yyyy 'às' HH:mm") => {
  try { return format(new Date(d), f, { locale: ptBR }); } catch { return '—'; }
};

function Chip({ icon: Icon, children, tone = 'neutral' }) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border',
      tone === 'warn' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-surface-50 border-surface-200 text-surface-600',
    )}>
      <Icon size={12} aria-hidden /> {children}
    </span>
  );
}

// Em que dados a avaliação se baseou
function BasedOn({ basedOn }) {
  if (!basedOn) return null;
  const { triage, labs = [], weightTrend, wearable } = basedOn;
  const wearableLines = wearable?.summary ?? [];
  return (
    <div className="flex flex-wrap gap-1.5">
      <Chip icon={ClipboardCheck}>
        {triage
          ? `Triagem de ${fmtDate(triage.finishedAt, 'dd/MM/yyyy')} (${triage.answered} respostas)`
          : 'Sem triagem concluída: só o cadastro'}
      </Chip>
      {labs.map((l) => (
        <Chip key={l.ruleId} icon={FlaskConical} tone={l.value ? 'warn' : 'neutral'}>
          {l.findingName}: {l.rawValue}{l.unit ? ` ${l.unit}` : ''} ({fmtDate(l.date, 'dd/MM')})
        </Chip>
      ))}
      {/* weightTrend pode vir null ou com summary null (sem perda): sem dado */}
      {weightTrend?.summary && (
        <Chip icon={Scale} tone={weightTrend.lost ? 'warn' : 'neutral'}>{weightTrend.summary}</Chip>
      )}
      {wearableLines.length > 0 && (
        <Chip icon={Watch}>{wearableLines.join(' · ')}</Chip>
      )}
    </div>
  );
}

// Crônicas: escores validados da última triagem, com o corte e a fonte
// (o motor bayesiano crônico saiu por falta de fonte; regra R1)
function ChronicList({ chronic }) {
  const [open, setOpen] = useState(false);
  if (!chronic?.scores?.length) return null;
  return (
    <div className="glass p-4">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 text-left">
        <span className="text-sm font-medium text-surface-700">
          Doenças crônicas (escores validados)
          {chronic.riskLevel && <span className={clsx(RISK_CLASS[chronic.riskLevel], 'ml-2')}>{RISK_LABEL[chronic.riskLevel]}</span>}
        </span>
        <ChevronDown size={16} className={clsx('text-surface-400 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <ul className="space-y-3 mt-3 animate-fade-in">
          {chronic.scores.map((s) => (
            <li key={s.code} className="text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-surface-800">{s.label}</span>
                <span className="text-surface-600 tabular-nums">{s.scale} {s.score}/{s.max}</span>
                <span className={s.positive ? 'badge-moderate' : 'badge-low'}>{s.category}</span>
                <span className="text-surface-400">corte {s.cutoff}</span>
              </div>
              <p className="text-surface-500 mt-0.5">{s.interpretation}</p>
              <p className="text-[11px] text-surface-400 mt-0.5">Fonte: {s.source}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function RiskPanel({ load, deps = [], audience = 'doctor', title = 'Risco de câncer (triagem)' }) {
  const { data, loading, error, refetch } = useFetch(load, deps);

  if (!data) {
    return (
      <section className="glass p-5">
        {loading ? (
          <p className="flex items-center text-sm text-surface-400">
            <Loader size={16} className="animate-spin mr-2" /> Calculando o risco…
          </p>
        ) : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-surface-500 flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-600" /> {error || 'Não foi possível calcular o risco.'}
            </p>
            <button type="button" onClick={refetch} className="btn-ghost"><RefreshCw size={14} /> Tentar de novo</button>
          </div>
        )}
      </section>
    );
  }

  const onco = data.oncology ?? {};
  const lv = oncoLevel(onco.level);
  const conditions = [...(onco.conditions ?? [])].sort((a, b) => Number(b.eligible) - Number(a.eligible));
  const eligible = conditions.filter((c) => c.eligible);
  const ineligible = conditions.filter((c) => !c.eligible);

  return (
    <section className="space-y-4" aria-labelledby="risk-panel-title">
      <div className={clsx('glass p-5 border-l-4', {
        'border-l-green-500':  onco.level === 'ROTINA' || !onco.level,
        'border-l-amber-500':  onco.level === 'ATENÇÃO',
        'border-l-orange-500': onco.level === 'INVESTIGAR',
      })}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 id="risk-panel-title" className="font-display text-lg font-bold flex items-center gap-2 flex-wrap">
              {title} <span className={lv.badge}>{lv.label}</span>
            </h2>
            <p className="text-xs text-surface-500 mt-1">
              Calculado {fmtDate(data.assessedAt)} · Base da IA v{data.kbVersion}
            </p>
          </div>
          <button type="button" onClick={refetch} disabled={loading} className="btn-ghost border border-surface-200">
            <RefreshCw size={14} className={clsx(loading && 'animate-spin')} /> {loading ? 'Recalculando…' : 'Recalcular'}
          </button>
        </div>
        <div className="mt-3"><BasedOn basedOn={data.basedOn} /></div>
      </div>

      {data.redFlag && (
        <div className={clsx('rounded-2xl border-2 p-4 flex items-start gap-3',
          data.redFlag.urgency === 'EMERGENCY' ? 'border-red-300 bg-red-50' : 'border-orange-300 bg-orange-50')}>
          <AlertTriangle size={20} className={data.redFlag.urgency === 'EMERGENCY' ? 'text-red-600' : 'text-orange-600'} aria-hidden />
          <div>
            <p className="font-semibold text-surface-900">Sinal de alerta: {data.redFlag.label}</p>
            <p className="text-sm text-surface-700 mt-0.5">{data.redFlag.action}</p>
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 md:items-start">
        {eligible.map((c) => (
          <ConditionRiskCard key={c.code} condition={c} audience={audience}
            defaultOpen={audience === 'doctor' && c.level === 'INVESTIGAR'} />
        ))}
      </div>
      {ineligible.length > 0 && (
        <p className="text-xs text-surface-500">
          Não avaliados: {ineligible.map((c) => `${c.label} (${(c.reason || '').replace(/\.$/, '').toLowerCase()})`).join('; ')}.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
        <div className="glass p-5">
          <h3 className="font-display font-semibold text-surface-800 mb-3">Rastreamento</h3>
          <ScreeningList items={data.screening} future={data.futureScreening} audience={audience} />
        </div>
        <div className="glass p-5">
          <h3 className="font-display font-semibold text-surface-800 mb-3 flex items-center gap-2">
            <Leaf size={16} className="text-green-600" aria-hidden /> Fatores que dá para mudar
          </h3>
          {data.modifiable?.length ? (
            <ul className="space-y-2">
              {data.modifiable.map((m) => (
                <li key={`${m.conditionCode}:${m.ruleId}`} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-surface-700">
                    {m.label}
                    <span className="block text-xs text-surface-400">{m.conditionLabel}</span>
                  </span>
                  <span className={clsx('font-semibold tabular-nums', m.factor > 1 ? 'text-amber-700' : 'text-green-700')}>
                    {formatFactor(m.factor)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-surface-500">Nenhum fator modificável ativo no perfil.</p>
          )}
        </div>
      </div>

      <ChronicList chronic={data.chronic} />

      {/* O disclaimer da API fala de %: só para a médica */}
      <Disclaimer audience={audience} text={audience === 'doctor' ? data.disclaimer : undefined} variant="inline" />
    </section>
  );
}
