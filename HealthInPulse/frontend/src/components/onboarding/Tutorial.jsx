// ─── Tutorial das abas (primeiro acesso) ──────────────────────
// Um balão por item do menu, apontando para ele. O item é achado pelo
// atributo `data-tour` que a layout põe em cada NavLink. No celular a
// layout abre o menu hamburguer enquanto o tutorial está aberto.
//   steps   [{ to, title, text }] na ordem do menu
//   onClose chamado em "Pular" e no fim (a layout grava como visto)
import { useEffect, useLayoutEffect, useState } from 'react';
import { X } from 'lucide-react';

const BALLOON_W = 280;
const GAP       = 12;

export default function Tutorial({ steps, onClose }) {
  const [i, setI]     = useState(0);
  const [box, setBox] = useState(null);
  const step = steps[i];

  // Posição do item do menu (recalcula ao trocar de passo e no resize)
  useLayoutEffect(() => {
    const measure = () => {
      const el = document.querySelector(`[data-tour="${step.to}"]`);
      setBox(el ? el.getBoundingClientRect() : null);
    };
    // espera o menu do celular terminar de deslizar (300 ms na layout)
    const t = setTimeout(measure, 320);
    measure();
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [step.to]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const last = i === steps.length - 1;

  // Balão à direita do item; se não couber (celular), embaixo dele
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let style = { left: 16, right: 16, bottom: 16 };
  if (box) {
    const fitsRight = box.right + GAP + BALLOON_W <= vw - 8;
    const left = fitsRight ? box.right + GAP : Math.max(8, Math.min(box.left, vw - BALLOON_W - 8));
    const top  = fitsRight ? Math.max(8, Math.min(box.top - 8, vh - 200)) : Math.min(box.bottom + GAP, vh - 200);
    style = { left, top, width: Math.min(BALLOON_W, vw - 16) };
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {/* Clicar no fundo (ou no item destacado) não fecha: só Pular, X e Esc */}
      <div className="absolute inset-0 bg-surface-900/40" />
      {box && (
        <div
          className="absolute rounded-xl ring-4 ring-brand-300 bg-white/10 pointer-events-none transition-all duration-200"
          style={{ left: box.left - 4, top: box.top - 4, width: box.width + 8, height: box.height + 8 }}
          aria-hidden
        />
      )}
      <div className="absolute glass bg-white p-4 shadow-card-hover space-y-2 animate-fade-in" style={style}>
        <div className="flex items-start justify-between gap-2">
          <p id="tour-title" className="font-display font-semibold text-surface-900">{step.title}</p>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600" aria-label="Fechar tutorial">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-surface-600">{step.text}</p>
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] text-surface-400">{i + 1} de {steps.length}</span>
          <div className="flex gap-2">
            {!last && <button onClick={onClose} className="btn-ghost text-xs px-2 py-1">Pular</button>}
            {i > 0 && <button onClick={() => setI(i - 1)} className="btn-ghost text-xs px-2 py-1">Voltar</button>}
            <button onClick={() => (last ? onClose() : setI(i + 1))} className="btn-primary text-xs px-3 py-1">
              {last ? 'Começar' : 'Próximo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
