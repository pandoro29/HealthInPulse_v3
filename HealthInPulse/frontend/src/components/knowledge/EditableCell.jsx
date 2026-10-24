// ─── Célula editável na linha (Base da IA) ──────────────────
// Mostra o valor formatado; com `onSave`, um clique vira campo de texto.
// Enter (ou sair do campo) salva, Esc cancela. Aceita vírgula decimal.
//
// Props:
//   value     valor atual (número, texto ou null)
//   display   texto exibido (padrão: String(value))
//   toInput   valor → texto do campo (padrão: número com vírgula)
//   parse     texto → valor; lança Error('mensagem') se inválido
//             (padrão: número; vazio → null)
//   onSave    async (novoValor) → lança erro se a API recusar (o campo
//             continua aberto). Sem onSave (só leitura) a célula é texto.
//   title     dica ao passar o mouse
//   align     'right' (números, padrão) | 'left'
//   width     classe de largura do campo (padrão 'w-20')
import { useRef, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';

const BR = (n) => String(n).replace('.', ',');

export const parseNumber = (text) => {
  const t = String(text ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error('Digite um número (use vírgula ou ponto)');
  return n;
};

export const toInputNumber = (v) => (v == null ? '' : BR(v));

export default function EditableCell({
  value, display, toInput = toInputNumber, parse = parseNumber, onSave, title,
  align = 'right', width = 'w-20',
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText]       = useState('');
  const [saving, setSaving]   = useState(false);
  // Ref (não estado) para o Enter e o blur que vem logo depois não
  // salvarem duas vezes, e o Esc não salvar no blur da desmontagem.
  const busyRef = useRef(false);
  const shown = display ?? (value == null ? '—' : BR(value));

  if (!onSave) {
    return <span title={title} className={clsx('tabular-nums', align === 'right' && 'block text-right')}>{shown}</span>;
  }

  const open = () => { busyRef.current = false; setText(toInput(value)); setEditing(true); };
  const cancel = () => { busyRef.current = true; setEditing(false); setSaving(false); };

  const commit = async () => {
    if (busyRef.current) return;
    let next;
    try { next = parse(text); }
    catch (e) { toast.error(e.message); return; }
    if (next === value) { cancel(); return; }
    busyRef.current = true;
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      // a mensagem já saiu no toast de quem salvou; o campo fica aberto
      busyRef.current = false;
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        inputMode="decimal"
        value={text}
        readOnly={saving}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        }}
        aria-label={title || 'Editar valor'}
        className={clsx(
          'rounded-md border border-brand-400 bg-white px-1.5 py-0.5 text-sm tabular-nums',
          'focus:outline-none focus:ring-2 focus:ring-brand-500/30',
          align === 'right' && 'text-right', width, saving && 'opacity-60',
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={open}
      title={title ? `${title} · clique para editar` : 'Clique para editar'}
      className={clsx(
        'tabular-nums rounded px-1 -mx-1 border-b border-dashed border-brand-300 text-surface-900',
        'hover:bg-brand-50 hover:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30',
        align === 'right' ? 'text-right' : 'text-left',
      )}
    >
      {shown}
    </button>
  );
}

// Interruptor sim/não (ativo, modificável). Sem onChange vira texto.
export function Toggle({ value, onChange, label }) {
  const [saving, setSaving] = useState(false);
  if (!onChange) return <span className="text-xs text-surface-600">{value ? 'sim' : 'não'}</span>;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(value)}
      aria-label={label}
      disabled={saving}
      onClick={async () => {
        setSaving(true);
        try { await onChange(!value); } catch { /* toast já saiu */ } finally { setSaving(false); }
      }}
      className={clsx(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        value ? 'bg-brand-600' : 'bg-surface-200',
      )}
    >
      <span className={clsx('inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', value ? 'translate-x-4' : 'translate-x-0.5')} />
    </button>
  );
}
