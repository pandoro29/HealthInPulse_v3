// ─── Aviso "não é diagnóstico" ───────────────────────────────
// Usado no teste público, no resultado da triagem e no painel da médica.
//   audience="visitor" (padrão) texto para leigo, SEM falar de porcentagem
//                      (o visitante nunca vê %);
//   audience="doctor"  menciona o % em 2 anos e o limiar de 3%.
//   text               sobrescreve o padrão (ex.: o `disclaimer` da API do
//                      /risk para a médica, ou o "nada é gravado" do /teste)
//   variant="box"    caixa com ícone (padrão)
//   variant="inline" uma linha discreta, para rodapé
import { Info } from 'lucide-react';
import clsx from 'clsx';

export const VISITOR_DISCLAIMER =
  'Orientação de prevenção. Não é diagnóstico e não substitui uma consulta: '
  + 'as faixas e recomendações vêm de livro de referência e diretrizes oficiais.';
export const DOCTOR_DISCLAIMER =
  'Triagem de risco com estimativas didáticas, não diagnóstico. Os percentuais são a chance '
  + 'estimada de diagnóstico em 2 anos; o limiar para investigar é 3% (NICE NG12).';
export const DEFAULT_DISCLAIMER = VISITOR_DISCLAIMER;

export default function Disclaimer({ text, audience = 'visitor', variant = 'box', className }) {
  const body = text || (audience === 'doctor' ? DOCTOR_DISCLAIMER : VISITOR_DISCLAIMER);

  if (variant === 'inline') {
    return (
      <p className={clsx('text-xs text-surface-500 flex items-start gap-1.5', className)}>
        <Info size={13} className="shrink-0 mt-px" aria-hidden />
        <span>{body}</span>
      </p>
    );
  }

  return (
    <div
      role="note"
      className={clsx(
        'flex items-start gap-2.5 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm text-brand-900',
        className,
      )}
    >
      <Info size={16} className="shrink-0 mt-0.5 text-brand-600" aria-hidden />
      <p>{body}</p>
    </div>
  );
}
