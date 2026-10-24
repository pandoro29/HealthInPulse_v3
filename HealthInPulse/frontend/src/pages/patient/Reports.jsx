// Reports.jsx
// Regra R2: o backend manda a versão do paciente. O relatório da triagem
// vem como visão de prevenção (próximo passo, sinais, exames preventivos);
// os outros (exame, relatório completo) ficam com a médica e aparecem só
// com um aviso.
import { useFetch } from '@/hooks';
import { aiReportService } from '@/services';
import { Brain, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react';
import {
  NextStepCard, VitalsList, ExamList, NEXT_STEP_LABEL, NEXT_STEP_BADGE,
} from '@/components/prevention/PreventionView';

function ReportModal({ report, onClose }) {
  if (!report) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-900/40 backdrop-blur-sm">
      <div className="glass bg-surface-50 p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto animate-slide-up space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-lg">{report.title}</h3>
          <button onClick={onClose} className="btn-ghost p-1" aria-label="Fechar">✕</button>
        </div>
        {report.text && <p className="text-sm text-surface-600">{report.text}</p>}
        <NextStepCard step={report.nextStep} />
        <VitalsList vitals={report.vitals} />
        <ExamList items={report.screening} />
      </div>
    </div>
  );
}

export function Reports() {
  const { data, loading } = useFetch(() => aiReportService.list({ limit: 20 }));

  const [detail, setDetail] = useState(null);
  const openReport = async (r) => {
    const { data: d } = await aiReportService.getOne(r.id);
    setDetail(d);
  };

  const reports = data?.items || [];
  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold">Relatórios IA</h1>
        <p className="text-surface-500 text-sm mt-0.5">Os resultados das suas triagens</p>
      </div>
      <div className="space-y-2">
        {loading && <p className="text-surface-400 text-sm text-center py-8">Carregando…</p>}
        {!loading && reports.length === 0 && (
          <div className="glass p-8 text-center text-surface-400 text-sm">
            <Brain size={28} className="mx-auto mb-2 opacity-30" />
            Nenhum relatório ainda
          </div>
        )}
        {reports.map((r) => (
          <button key={r.id} onClick={() => openReport(r)} className="glass p-4 w-full flex items-center gap-4 hover:border-brand-200 transition-all text-left">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
              <Brain size={18} className="text-brand-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{r.title}</p>
              <p className="text-xs text-surface-500">{format(new Date(r.generatedAt), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}</p>
            </div>
            {r.nextStep && <span className={NEXT_STEP_BADGE[r.nextStep.code]}>{NEXT_STEP_LABEL[r.nextStep.code]}</span>}
            <ChevronRight size={14} className="text-surface-300" />
          </button>
        ))}
      </div>
      <ReportModal report={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
export default Reports;
