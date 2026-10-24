// ─── Campo do formulário de perfil ──────────────────────────
// Extraído do Triage.jsx; usado também pelo teste público (/teste).
// O `field` vem do schema da API (demographicSchema):
//   { id, field, type: number|select|boolean|multiselect, label, help?,
//     options?, min?, max?, step?, showIf? }
// `visible` é decidido por quem chama (ver lib/conditions.isFieldVisible).
// size="lg" aumenta os alvos de toque (teste do stand, celular).
// wide: campo numérico ocupa a linha inteira (rótulo longo).
import clsx from 'clsx';
import { Check } from 'lucide-react';

const choiceClass = (active, size) => clsx(
  'flex-1 rounded-xl border transition-colors duration-150',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40',
  size === 'lg' ? 'py-3 text-base' : 'py-2 text-sm',
  active
    ? 'bg-brand-100 border-brand-500 text-brand-600'
    : 'border-surface-200 text-surface-500 hover:border-surface-300',
);

function Help({ text }) {
  if (!text) return null;
  return <p className="text-xs text-surface-400 mt-1">{text}</p>;
}

export default function ProfileField({ field, value, onChange, visible = true, size = 'md', wide = false }) {
  if (!visible) return null;
  const lg = size === 'lg';
  const labelClass = lg ? 'text-[15px] text-surface-800' : 'text-sm text-surface-700';

  if (field.type === 'boolean') {
    return (
      <div className="col-span-2">
        <p className={clsx(labelClass, 'mb-1')}>{field.label}</p>
        <div className="flex gap-2">
          {[{ v: true, l: 'Sim' }, { v: false, l: 'Não' }].map((o) => (
            <button key={o.l} type="button"
              aria-pressed={value === o.v}
              onClick={() => onChange(o.v)}
              className={choiceClass(value === o.v, size)}>{o.l}</button>
          ))}
        </div>
        <Help text={field.help} />
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <div className="col-span-2">
        <p className={labelClass}>{field.label}</p>
        <div className="flex gap-2 mt-1">
          {field.options.map((o) => (
            <button key={o.value} type="button"
              aria-pressed={value === o.value}
              onClick={() => onChange(o.value)}
              className={choiceClass(value === o.value, size)}>{o.label}</button>
          ))}
        </div>
        <Help text={field.help} />
      </div>
    );
  }

  // Várias opções (ex.: câncer na família). Vazio = nenhuma.
  if (field.type === 'multiselect') {
    const list = Array.isArray(value) ? value : [];
    const toggle = (v) => onChange(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
    return (
      <div className="col-span-2">
        <p className={labelClass}>{field.label}</p>
        <div className="flex flex-wrap gap-2 mt-1.5">
          {field.options.map((o) => {
            const on = list.includes(o.value);
            return (
              <button key={o.value} type="button"
                aria-pressed={on}
                onClick={() => toggle(o.value)}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-full border transition-colors duration-150',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40',
                  lg ? 'px-4 py-2.5 text-[15px]' : 'px-3 py-1.5 text-sm',
                  on
                    ? 'bg-brand-100 border-brand-500 text-brand-700'
                    : 'border-surface-200 text-surface-500 hover:border-surface-300',
                )}>
                {on && <Check size={14} aria-hidden />}
                {o.label}
              </button>
            );
          })}
        </div>
        <Help text={field.help} />
      </div>
    );
  }

  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <label className={labelClass} htmlFor={`pf-${field.id}`}>{field.label}</label>
      <input
        id={`pf-${field.id}`}
        type="number"
        inputMode="decimal"
        className={clsx('input mt-1', lg && 'text-base py-3')}
        min={field.min} max={field.max} step={field.step || 1}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
      <Help text={field.help} />
    </div>
  );
}
