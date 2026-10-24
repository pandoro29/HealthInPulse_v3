// ─── Triage.jsx ───────────────────────────────────────────────
// Fluxo adaptativo: PROFILE → QUESTION (loop) → RESULT.
// Regra R2: o paciente nunca vê doença. O backend (patientView) já manda
// a pergunta sem o "porquê" e sem o ranking de hipóteses, e o resultado
// como visão de prevenção: próximo passo, sinais x faixa normal, exames
// preventivos e metas. No primeiro acesso a triagem vem antes de tudo, e
// o tutorial das abas abre quando o resultado aparece (ou em "Fazer depois").

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useFetch } from '@/hooks';
import { useAuth } from '@/contexts/AuthContext';
import { triageService } from '@/services';
import {
  ClipboardList, ChevronRight, Sparkles, Coins, Target, Activity, Watch, HandHeart,
} from 'lucide-react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import confetti from 'canvas-confetti';
import ProfileField from '@/components/triage/ProfileField';
import QuestionCard from '@/components/triage/QuestionCard';
import Disclaimer from '@/components/common/Disclaimer';
import {
  NextStepCard, VitalsList, ExamList, NEXT_STEP_LABEL, NEXT_STEP_BADGE,
} from '@/components/prevention/PreventionView';
import { isFieldVisible, visibleProfile } from '@/lib/conditions';

export function Triage() {
  const { user, refreshCoins } = useAuth();
  const { openTutorial }       = useOutletContext() ?? {};
  const navigate               = useNavigate();
  const firstAccess            = user && !user.tutorialSeenAt;
  const { data: history, refetch } = useFetch(() => triageService.getHistory({ limit: 5 }));

  const [session, setSession]   = useState(null);   // payload do backend
  const [busy, setBusy]         = useState(false);
  const [profileForm, setProfileForm] = useState({});

  const start = async () => {
    setBusy(true);
    try {
      const { data } = await triageService.start();
      setSession(data);
      setProfileForm({ ...(data.profile || {}) });
    } catch { toast.error('Não foi possível iniciar a triagem'); }
    finally { setBusy(false); }
  };

  const sendProfile = async () => {
    if (!session?.triageId) return;
    setBusy(true);
    try {
      // Só os campos visíveis (ex.: sem Papanicolau para homem, sem maços-ano para quem não fuma)
      const profile = visibleProfile(session.schema, profileForm);
      const { data } = await triageService.answer(session.triageId, { profile });
      setSession(data);
    } catch { toast.error('Erro ao enviar perfil'); }
    finally { setBusy(false); }
  };

  const answerSymptom = async (value, followUps = null) => {
    if (!session?.triageId || !session?.question) return;
    setBusy(true);
    try {
      const payload = { symptom: session.question.symptom, value };
      if (followUps) payload.followUps = followUps;
      const { data } = await triageService.answer(session.triageId, payload);
      setSession(data);
      if (data.stage === 'RESULT') {
        // Confete só quando o próximo passo é manter a rotina
        if (data.view?.nextStep?.code === 'ROTINA') {
          confetti({ particleCount: 80, spread: 70, origin: { y: 0.5 },
            colors: ['#003F7E', '#00A0DC', '#fbbf24', '#16a34a'] });
        }
        refreshCoins();
        refetch();
      }
    } catch { toast.error('Erro ao enviar resposta'); }
    finally { setBusy(false); }
  };

  const restart = () => { setSession(null); setProfileForm({}); };

  // Primeiro acesso: o tutorial abre quando o resultado aparece
  const showingResult = session?.stage === 'RESULT';
  useEffect(() => {
    if (showingResult && firstAccess) openTutorial?.();
  }, [showingResult]); // eslint-disable-line react-hooks/exhaustive-deps

  const later = () => {
    navigate('/patient');
    openTutorial?.();
  };

  // ─── Header padrão ───────────────────────────────────────
  const Header = (
    <div>
      <h1 className="font-display text-2xl font-bold flex items-center gap-2">
        <ClipboardList size={22} /> Triagem clínica
      </h1>
      <p className="text-surface-500 text-sm mt-0.5">
        Perguntas rápidas sobre o seu dia a dia, junto com os dados da pulseira Care Plus
      </p>
    </div>
  );

  // ─── Tela inicial ────────────────────────────────────────
  if (!session) {
    return (
      <div className="space-y-6 animate-fade-in max-w-2xl">
        {Header}
        <div className="glass p-8 text-center space-y-4">
          {firstAccess ? <HandHeart size={40} className="text-brand-700 mx-auto" /> : <Sparkles size={40} className="text-brand-700 mx-auto" />}
          <p className="font-display font-semibold text-lg">
            {firstAccess ? `Boas-vindas${user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}!` : 'Pronto para começar?'}
          </p>
          <p className="text-surface-500 text-sm">
            {firstAccess
              ? 'Antes de tudo, uma triagem rápida para o app conhecer você. Com ela montamos suas metas. Leva cerca de 2 minutos.'
              : 'A triagem usa os dados da sua pulseira e escolhe as perguntas que mais importam para você. Leva cerca de 2 minutos.'}
          </p>
          <button onClick={start} disabled={busy} className="btn-primary mx-auto">
            {busy ? 'Iniciando…' : 'Iniciar triagem'}
          </button>
          {firstAccess && (
            <button onClick={later} className="btn-ghost mx-auto text-surface-500">Fazer depois</button>
          )}
        </div>
        {history?.items?.length > 0 && <History items={history.items} />}
      </div>
    );
  }

  // ─── Wearable snapshot (mostrado em todas as etapas) ────────
  const wearableBox = session.wearableSummary?.length ? (
    <div className="glass p-4 border-brand-100 bg-brand-50/30">
      <div className="flex items-center gap-2 text-brand-700 font-medium text-sm mb-2">
        <Watch size={14} /> Sua pulseira Care Plus detectou:
      </div>
      <ul className="text-xs text-surface-700 space-y-1 list-disc list-inside">
        {session.wearableSummary.map((l, i) => <li key={i}>{l}</li>)}
      </ul>
    </div>
  ) : null;

  // ─── Etapa: PERFIL ───────────────────────────────────────
  if (session.stage === 'PROFILE') {
    return (
      <div className="space-y-6 animate-fade-in max-w-2xl">
        {Header}
        {wearableBox}
        <div className="glass p-6 space-y-4">
          <p className="font-medium text-surface-800">Confirme seus dados</p>
          <div className="grid grid-cols-2 gap-3">
            {session.schema.map((field) => (
              <ProfileField
                key={field.id}
                field={field}
                value={profileForm[field.field]}
                onChange={(v) => setProfileForm({ ...profileForm, [field.field]: v })}
                visible={isFieldVisible(field, profileForm)}
              />
            ))}
          </div>
          <button onClick={sendProfile} disabled={busy} className="btn-primary w-full justify-center">
            {busy ? 'Enviando…' : <>Iniciar perguntas <ChevronRight size={15} /></>}
          </button>
        </div>
      </div>
    );
  }

  // ─── Etapa: PERGUNTA ─────────────────────────────────────
  if (session.stage === 'QUESTION') {
    const onco = session.phase === 'ONCOLOGIA' || session.status === 'ONCO_INTERVIEW';
    return (
      <div className="space-y-6 animate-fade-in max-w-2xl">
        {Header}
        <PhaseBanner onco={onco} />
        {wearableBox}
        <QuestionCard
          question={session.question}
          progress={session.progress}
          explanation={null}
          reason={null}
          busy={busy}
          onAnswer={answerSymptom}
        />
      </div>
    );
  }

  // ─── Etapa: RESULTADO ────────────────────────────────────
  if (session.stage === 'RESULT') {
    return (
      <div className="space-y-6 animate-fade-in max-w-2xl">
        {Header}
        <ResultView view={session.view} onRestart={restart} />
        {history?.items?.length > 0 && <History items={history.items} />}
      </div>
    );
  }

  return null;
}

// ─── Etapas: 1) crônicas, 2) câncer ───────────────────────
function PhaseBanner({ onco }) {
  const steps = [
    { n: 1, label: 'Seu dia a dia',  active: !onco, done: onco },
    { n: 2, label: 'Outros sinais',  active: onco,  done: false },
  ];
  return (
    <div className="glass p-4 space-y-2">
      <p className="text-sm font-medium text-surface-800">
        {onco ? 'Etapa 2 de 2 — outros sinais' : 'Etapa 1 de 2 — seu dia a dia'}
      </p>
      <div className="flex gap-2" aria-hidden>
        {steps.map((st) => (
          <div key={st.n} className="flex-1">
            <div className={clsx('h-1.5 rounded-full', st.active || st.done ? 'bg-brand-600' : 'bg-surface-100')} />
            <p className={clsx('text-[11px] mt-1', st.active ? 'text-brand-700 font-medium' : 'text-surface-400')}>
              {st.n}. {st.label}
            </p>
          </div>
        ))}
      </div>
      {onco && (
        <p className="text-xs text-surface-500">
          Algumas perguntas sobre sinais que valem uma conversa com o médico. Responder “sim” não quer
          dizer que há algo errado.
        </p>
      )}
    </div>
  );
}

// ─── Resultado: visão de prevenção ─────────────────────────
function ResultView({ view, onRestart }) {
  if (!view?.nextStep) {
    return (
      <div className="glass p-8 text-center space-y-3">
        <Sparkles size={36} className="text-brand-700 mx-auto animate-pulse" />
        <p className="font-display font-semibold">Calculando resultado…</p>
      </div>
    );
  }
  return (
    <section className="space-y-4" aria-label="Resultado da triagem">
      <NextStepCard step={view.nextStep} />
      <VitalsList vitals={view.vitals} />
      <ExamList items={view.screening} />

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
          <Coins size={18} className="text-amber-600 mx-auto" />
          <p className="font-display font-bold text-2xl text-amber-700 mt-1">+20</p>
          <p className="text-[10px] uppercase tracking-wider text-amber-700/80">health coins</p>
        </div>
        <Link to="/patient/goals" className="rounded-xl border border-brand-200 bg-brand-50 p-3 hover:bg-brand-100/50 text-center">
          <Target size={18} className="text-brand-700 mx-auto" />
          <p className="font-display font-bold text-2xl text-brand-700 mt-1">Metas</p>
          <p className="text-[10px] uppercase tracking-wider text-brand-700/80">ver as suas →</p>
        </Link>
      </div>

      <Disclaimer audience="visitor" />
      <button onClick={onRestart} className="btn-ghost w-full justify-center">
        Nova triagem
      </button>
    </section>
  );
}

// ─── Histórico ────────────────────────────────────────────
function History({ items }) {
  return (
    <div className="glass p-5">
      <h3 className="section-title mb-3 flex items-center gap-1">
        <Activity size={12} /> Histórico de triagens
      </h3>
      <div className="divide-y divide-surface-100">
        {items.map((t) => (
          <div key={t.id} className="py-3 flex items-center justify-between">
            <p className="text-xs text-surface-500">
              {format(new Date(t.startedAt), 'dd MMM yyyy', { locale: ptBR })}
            </p>
            {t.nextStep
              ? <span className={NEXT_STEP_BADGE[t.nextStep]}>{NEXT_STEP_LABEL[t.nextStep]}</span>
              : <span className="text-xs text-surface-400">{t.status === 'COMPLETED' ? 'Concluída' : 'Em andamento'}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Triage;
