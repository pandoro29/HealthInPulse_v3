// ─── O que o paciente e o visitante veem (regra R2) ───────────────
// Peças da visão de prevenção que o backend monta (services/patientView):
//   NextStepCard  próximo passo (ROTINA, CONSULTA, AGORA)
//   VitalsList    sinais da pulseira x faixa normal, com a fonte
//   ExamList      exames preventivos da idade e do sexo
//   HabitList     hábitos com fonte (teste público)
// Nada aqui recebe nome de doença: o backend já não manda.
import clsx from 'clsx';
import { CheckCircle2, CalendarCheck, Siren, Phone, Activity, FileSearch, Leaf } from 'lucide-react';

const STEP_STYLE = {
  ROTINA:   { icon: CheckCircle2,  box: 'border-green-200 bg-green-50/50',  title: 'text-green-800', ico: 'text-green-600' },
  CONSULTA: { icon: CalendarCheck, box: 'border-brand-200 bg-brand-50/50',  title: 'text-brand-800', ico: 'text-brand-700' },
  AGORA:    { icon: Siren,         box: 'border-red-300 bg-red-50/60',      title: 'text-red-800',   ico: 'text-red-600' },
};

export function NextStepCard({ step, className }) {
  if (!step) return null;
  const st = STEP_STYLE[step.code] ?? STEP_STYLE.CONSULTA;
  const Icon = st.icon;
  return (
    <div className={clsx('glass p-5 border-2', st.box, className)} role={step.code === 'AGORA' ? 'alert' : undefined}>
      <p className="section-title">Próximo passo</p>
      <div className="flex items-start gap-3 mt-2">
        <Icon size={28} className={clsx('shrink-0', st.ico)} aria-hidden />
        <div className="min-w-0">
          <h2 className={clsx('font-display font-bold text-lg', st.title)}>{step.title}</h2>
          <p className="text-sm text-surface-700 mt-1 leading-relaxed">{step.text}</p>
          {step.phone && (
            <a href={`tel:${step.phone}`} className="btn-primary mt-3 inline-flex">
              <Phone size={14} /> Ligar {step.phone}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

const VITAL_STATUS = {
  NORMAL: { text: 'na faixa normal', cls: 'text-green-700' },
  ACIMA:  { text: 'acima da faixa normal', cls: 'text-amber-700' },
  ABAIXO: { text: 'abaixo da faixa normal', cls: 'text-amber-700' },
};

export function VitalsList({ vitals }) {
  if (!vitals?.length) return null;
  return (
    <div className="glass p-5 space-y-3">
      <p className="section-title flex items-center gap-1"><Activity size={12} /> Seus sinais e o padrão normal</p>
      <ul className="divide-y divide-surface-100">
        {vitals.map((v) => {
          const s = VITAL_STATUS[v.status] ?? VITAL_STATUS.NORMAL;
          return (
            <li key={v.code} className="py-2 flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-sm text-surface-800">{v.label}</span>
              <span className="text-sm">
                <strong>{v.value} {v.unit}</strong>{' '}
                <span className={s.cls}>{s.text}</span>
              </span>
              <span className="w-full text-[11px] text-surface-400">
                Normal: {v.normalRange}{v.source ? ` · Fonte: ${v.source}` : ''}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const EXAM_BADGE = {
  RECOMENDADO: 'badge-green',
  CONVERSAR:   'badge-blue',
  FUTURO:      'badge-gray',
};
const EXAM_LABEL = { RECOMENDADO: 'Recomendado', CONVERSAR: 'Converse com o médico', FUTURO: 'Mais adiante' };

export function ExamList({ items }) {
  if (!items?.length) return null;
  return (
    <div className="glass p-5 space-y-3">
      <p className="section-title flex items-center gap-1"><FileSearch size={12} /> Exames preventivos para você</p>
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
      <p className="text-[11px] text-surface-400">Fonte: programas de rastreamento do Ministério da Saúde e do INCA.</p>
    </div>
  );
}

export function HabitList({ items }) {
  if (!items?.length) return null;
  return (
    <div className="glass p-5 space-y-3">
      <p className="section-title flex items-center gap-1"><Leaf size={12} /> Hábitos que fazem diferença</p>
      <ul className="space-y-2">
        {items.map((h) => (
          <li key={h.code} className="text-sm">
            <p className="font-medium text-surface-800">{h.title}</p>
            <p className="text-surface-600 text-xs mt-0.5">{h.text}</p>
            {h.source && <p className="text-[11px] text-surface-400 mt-0.5">Fonte: {h.source}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export const NEXT_STEP_LABEL = { ROTINA: 'Manter a rotina', CONSULTA: 'Agendar consulta', AGORA: 'Atendimento agora' };
export const NEXT_STEP_BADGE = { ROTINA: 'badge-green', CONSULTA: 'badge-blue', AGORA: 'badge-red' };
