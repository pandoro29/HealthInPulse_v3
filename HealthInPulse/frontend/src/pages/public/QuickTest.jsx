// ─── Teste rápido público (/teste) ──────────────────────────
// O visitante do stand responde em 2–3 minutos, no notebook ou no
// celular (QR). Fluxo: capa → perfil → uma pergunta por tela → resultado,
// contado como a "Trilha do Pulso" (components/game/Trail.jsx).
// A API é SEM ESTADO (POST /api/public/quick-test): a cada passo mandamos
// o perfil e todas as respostas acumuladas; nada é gravado.
//
// Fica FORA do PublicRoute (quem está logado também abre) e usa o
// publicApi (fetch puro: um 401 aqui não derruba a sessão nem manda
// para /login).
//
// ?kiosk=1 → volta sozinho à capa depois de 120 s sem toque.
// Personas (personas.js) preenchem tudo para a equipe demonstrar rápido.
//
// Regra R2: o visitante nunca ouve doença. A API já devolve a visão de
// prevenção (patientView.quickTestForVisitor): próximo passo, exames
// preventivos da idade e do sexo e hábitos com fonte. O risco por doença
// é só da tela da médica.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ShieldCheck, Info, Smartphone, RotateCcw, ChevronRight, Users, ArrowLeft, BookOpen,
} from 'lucide-react';
import { publicApi } from '@/services/publicApi';
import { PUBLIC_TEST_URL, KIOSK_IDLE_MS } from '@/config';
import { isFieldVisible, visibleProfile } from '@/lib/conditions';
import ProfileField from '@/components/triage/ProfileField';
import QuestionCard from '@/components/triage/QuestionCard';
import { NextStepCard } from '@/components/prevention/PreventionView';
import Disclaimer from '@/components/common/Disclaimer';
import QrCode from '@/components/common/QrCode';
import { PERSONAS } from './personas';
import {
  TrailHud, BadgeToast, TrailComplete, StationIntro, PROFILE_STATIONS, PROFILE_STEPS, pulseFor,
} from '@/components/game/Trail';
import { ScoreRing, WinList, MissionList, ExamMissions } from '@/components/game/MissionBoard';

const PROFILE_KEYS = Object.keys(PROFILE_STATIONS);

// Campos numéricos curtos dividem a linha; os de rótulo longo ocupam tudo
const HALF_WIDTH = ['age', 'height', 'weight', 'packYears'];

const CALL_TIMEOUT_MS = 20 * 1000;

const QUICKTEST_DISCLAIMER = 'Teste educativo de prevenção. Não é diagnóstico e não substitui '
  + 'uma consulta: as recomendações vêm de livro de referência e diretrizes oficiais. Nada do que você respondeu foi gravado.';

export default function QuickTest() {
  const [params] = useSearchParams();
  const kiosk = params.get('kiosk') === '1';

  const [step, setStep]       = useState('COVER'); // COVER | PROFILE | QUESTION | BLOCKED | RESULT
  const [schema, setSchema]   = useState(null);
  const [profile, setProfile] = useState({});
  const [answers, setAnswers] = useState({});
  const [order, setOrder]     = useState([]);      // [[códigos de uma tela], ...] para o "Voltar"
  const [res, setRes]         = useState(null);    // última resposta da API
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState(null);    // { message, fields }
  const [persona, setPersona] = useState(null);
  // Trilha: estação do perfil (0..2), nome (só na tela, não vai à API),
  // selos ganhos e o selo que está aparecendo agora
  const [profileStep, setProfileStep] = useState(0);
  const [name, setName]       = useState('');
  const [earned, setEarned]   = useState([]);
  const [toast, setToast]     = useState(null);
  const clearToast = useCallback(() => setToast(null), []);
  const award = useCallback((station) => {
    if (!station) return;
    setEarned((e) => (e.includes(station) ? e : [...e, station]));
    setToast(station);
  }, []);

  // Geração: cada reset invalida as respostas da API ainda a caminho
  // (ex.: o quiosque volta à capa enquanto uma chamada lenta termina).
  const genRef   = useRef(0);
  const abortRef = useRef(null);

  const reset = useCallback(() => {
    genRef.current += 1;
    abortRef.current?.abort();
    setStep('COVER'); setProfile({}); setAnswers({}); setOrder([]);
    setRes(null); setError(null); setPersona(null); setBusy(false);
    setProfileStep(0); setName(''); setEarned([]); setToast(null);
  }, []);

  // Uma chamada à API. Devolve a resposta ou null (erro já mostrado).
  // Tempo máximo de 20 s (o Render acorda devagar depois de parado);
  // resposta de uma geração antiga é descartada.
  const call = async (body) => {
    const gen = genRef.current;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = setTimeout(() => ctrl.abort('timeout'), CALL_TIMEOUT_MS);
    setBusy(true); setError(null);
    try {
      const data = await publicApi.quickTest(body, { signal: ctrl.signal });
      if (gen !== genRef.current) return null;
      // Mudou de estação (ou terminou): ganha o selo da anterior
      setRes((prev) => {
        const was = prev?.stage === 'QUESTION' ? prev.question?.station : null;
        const now = data.stage === 'QUESTION' ? data.question?.station : null;
        if (was && was !== now) award(was);
        return data;
      });
      if (data.stage === 'PROFILE') setSchema(data.schema);
      setStep(data.stage);
      return data;
    } catch (e) {
      // Reset ou chamada mais nova cancelou esta: descarta em silêncio
      if (gen !== genRef.current) return null;
      if (ctrl.signal.aborted && ctrl.signal.reason !== 'timeout') return null;
      const timedOut = ctrl.signal.aborted;
      setError(timedOut
        ? { message: 'O servidor demorou para responder (ele pode estar acordando). Toque de novo em alguns segundos.', fields: [] }
        : { message: e.message, fields: e.fields ?? [] });
      return null;
    } finally {
      clearTimeout(timer);
      // Só a chamada vigente desliga o "ocupado"
      if (abortRef.current === ctrl) {
        abortRef.current = null;
        if (gen === genRef.current) setBusy(false);
      }
    }
  };

  // ─── Ações ─────────────────────────────────────────────────
  const start = async (p = null) => {
    setPersona(p);
    setProfile(p ? { ...p.profile } : {});
    setAnswers({}); setOrder([]); setProfileStep(0); setEarned([]);
    if (schema) { setError(null); setStep('PROFILE'); return; }
    await call({});
  };

  const sendProfile = () => {
    award(PROFILE_KEYS[PROFILE_KEYS.length - 1]);
    if (persona) setEarned(PROFILE_KEYS);
    const prof = visibleProfile(schema, profile);
    const ans = persona ? { ...persona.answers } : {};
    setAnswers(ans);
    setOrder([]);
    call({ profile: prof, answers: ans });
  };

  const answer = async (value, followUps) => {
    const q = res?.question;
    if (!q) return;
    const next = { ...answers, [q.id]: value };
    const keys = [q.id];
    for (const fu of followUps ?? []) { next[fu.id] = fu.value; keys.push(fu.id); }
    // Só guarda a resposta se a API aceitou (erro de rede: tenta de novo)
    if (await call({ profile: visibleProfile(schema, profile), answers: next })) {
      setAnswers(next);
      setOrder((o) => [...o, keys]);
    }
  };

  const nextProfileStep = () => {
    award(PROFILE_KEYS[profileStep]);
    setProfileStep((s) => s + 1);
  };

  const back = async () => {
    if (order.length === 0) { setError(null); setStep('PROFILE'); setProfileStep(PROFILE_STEPS - 1); return; }
    const last = order[order.length - 1];
    const next = { ...answers };
    for (const k of last) delete next[k];
    if (await call({ profile: visibleProfile(schema, profile), answers: next })) {
      setAnswers(next);
      setOrder((o) => o.slice(0, -1));
    }
  };

  // ─── Topo da página a cada tela nova ───────────────────────
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step, res]);

  // ─── Modo quiosque: 120 s parado → capa ────────────────────
  useEffect(() => {
    if (!kiosk || step === 'COVER') return undefined;
    let t = setTimeout(reset, KIOSK_IDLE_MS);
    const poke = () => { clearTimeout(t); t = setTimeout(reset, KIOSK_IDLE_MS); };
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'wheel'];
    events.forEach((ev) => window.addEventListener(ev, poke, { passive: true }));
    return () => {
      clearTimeout(t);
      events.forEach((ev) => window.removeEventListener(ev, poke));
    };
  }, [kiosk, step, reset]);

  return (
    <div className="min-h-dvh flex flex-col bg-surface-50">
      <header className="bg-white border-b border-surface-200">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <button type="button" onClick={reset} className="text-left" aria-label="Voltar à capa">
            <span className="font-display text-base font-bold tracking-tight">
              Health<span className="text-brand-600">InPulse</span>
            </span>
            <span className="hidden sm:inline text-sm text-surface-500 ml-2">Teste rápido de prevenção</span>
          </button>
          {step !== 'COVER' && (
            <button type="button" onClick={reset} className="btn-ghost text-xs px-3">
              <RotateCcw size={14} /> Recomeçar
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-10">
        {(step === 'PROFILE' || step === 'QUESTION') && (
          <div className="max-w-xl mx-auto mb-5">
            <TrailHud
              current={step === 'PROFILE' ? PROFILE_KEYS[profileStep] : res?.question?.station}
              pulse={step === 'PROFILE'
                ? pulseFor({ profileDone: profileStep, asked: 0, max: 18 })
                : pulseFor({ profileDone: PROFILE_STEPS, asked: res?.progress?.asked ?? 0, max: res?.progress?.max ?? 0 })}
            />
          </div>
        )}
        <BadgeToast station={toast} onDone={clearToast} />
        {step === 'COVER' && (
          <Cover onStart={() => start()} onPersona={start} busy={busy} error={error} kiosk={kiosk} />
        )}

        {step === 'PROFILE' && schema && (
          <ProfileStep
            schema={schema} profile={profile} setProfile={setProfile}
            persona={persona} busy={busy} error={error}
            station={PROFILE_KEYS[profileStep]} last={profileStep === PROFILE_STEPS - 1}
            name={name} setName={setName}
            onNext={nextProfileStep} onSubmit={sendProfile}
            onBack={profileStep === 0 ? reset : () => setProfileStep((s) => s - 1)}
          />
        )}

        {step === 'QUESTION' && res?.question && (
          <div className="max-w-xl mx-auto space-y-4 animate-fade-in">
            {persona && <PersonaNote persona={persona} />}
            <StationIntro station={res.question.station} />
            <QuestionCard
              key={res.question.id}
              question={res.question}
              progress={null}
              busy={busy}
              onAnswer={answer}
              onBack={back}
              size="lg"
              allowUnknown
              followUpMode="afterYes"
            />
            <button type="button" onClick={back} disabled={busy} className="btn-ghost text-xs px-3 mx-auto flex">
              <ArrowLeft size={13} /> Voltar
            </button>
            {error && <ErrorBox error={error} />}
            <p className="text-xs text-surface-400 text-center">Nada do que você responde é gravado.</p>
          </div>
        )}

        {step === 'BLOCKED' && (
          <div className="max-w-xl mx-auto glass p-6 sm:p-8 space-y-4 text-center animate-fade-in">
            <Info size={32} className="mx-auto text-brand-600" aria-hidden />
            <p className="text-surface-700">{res?.reason}</p>
            <button type="button" onClick={reset} className="btn-primary mx-auto">Voltar ao início</button>
          </div>
        )}

        {step === 'RESULT' && res && (
          <Result res={res} persona={persona} name={name} earned={earned} age={profile.age} onRestart={reset} />
        )}
      </main>

      <footer className="border-t border-surface-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-3">
          <Disclaimer variant="inline" audience="visitor" text="Teste educativo de prevenção. Não é diagnóstico e não substitui uma consulta. Nada do que você responde é gravado." />
        </div>
      </footer>
    </div>
  );
}

// ─── Capa ────────────────────────────────────────────────────
function Cover({ onStart, onPersona, busy, error, kiosk }) {
  return (
    <div className="animate-fade-in">
      <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr] md:items-center">
        <div className="space-y-6">
          <h1 className="font-display text-3xl sm:text-5xl font-bold leading-[1.1] tracking-tight text-brand-900">
            Cuide da sua saúde antes que algo aconteça.
          </h1>
          <p className="text-surface-600 text-base sm:text-lg leading-relaxed max-w-prose">
            Percorra 8 estações em cerca de 3 minutos, ganhe selos pelo caminho. Você sai sabendo o próximo passo, quais exames preventivos
            valem para a sua idade e quais hábitos fazem diferença.
          </p>
          <ul className="grid gap-2 text-sm text-surface-700 sm:grid-cols-2">
            <li className="flex items-center gap-2"><ShieldCheck size={16} className="text-green-600" aria-hidden /> Nada é gravado, sem login</li>
            <li className="flex items-center gap-2"><Info size={16} className="text-brand-600" aria-hidden /> Não é diagnóstico</li>
          </ul>
          <div className="space-y-3">
            <button type="button" onClick={onStart} disabled={busy}
              className="btn-primary text-base px-7 py-3.5 w-full sm:w-auto justify-center">
              {busy ? 'Abrindo…' : <>Começar o teste <ChevronRight size={18} /></>}
            </button>
            {error && <ErrorBox error={error} />}
          </div>
        </div>

        {/* De onde vêm as recomendações */}
        <figure className="glass p-5 sm:p-6 space-y-3">
          <BookOpen size={28} className="text-brand-700" aria-hidden />
          <figcaption className="text-sm text-surface-600 leading-relaxed">
            <strong className="font-display text-lg text-surface-900 block">Com base em quem entende</strong>
            As faixas normais e as recomendações vêm do Guyton & Hall, o livro de referência da fisiologia
            médica, e de diretrizes oficiais (Ministério da Saúde, INCA, OMS).
          </figcaption>
        </figure>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-[auto_1fr]">
        <div className="hidden md:flex glass p-4 items-center gap-4 max-w-md">
          <QrCode value={PUBLIC_TEST_URL} size={kiosk ? 148 : 112} />
          <div>
            <p className="font-medium text-surface-800 flex items-center gap-1.5"><Smartphone size={16} aria-hidden /> Prefere responder no celular?</p>
            <p className="text-sm text-surface-500 mt-1">Algumas perguntas são íntimas. Aponte a câmera e faça com privacidade.</p>
          </div>
        </div>

        <div className="md:self-end md:justify-self-end">
          <p className="text-xs text-surface-400 mb-2 flex items-center gap-1.5"><Users size={13} aria-hidden /> Demonstração da equipe</p>
          <div className="flex flex-wrap gap-2">
            {PERSONAS.map((p) => (
              <button key={p.id} type="button" onClick={() => onPersona(p)} disabled={busy}
                title={p.summary}
                className="text-xs px-3 py-1.5 rounded-full border border-surface-200 bg-white text-surface-600 hover:border-brand-300 hover:text-brand-700">
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Perfil: 3 estações da trilha ────────────────────────────
const STATION_COPY = {
  VOCE:    { title: 'Vamos começar', text: 'Seu nome fica só nesta tela. Idade e sexo ajustam as recomendações.' },
  CORPO:   { title: 'Seu corpo', text: 'Altura e peso deixam a estimativa mais precisa. Pode pular se não souber.' },
  HABITOS: { title: 'Hábitos e família', text: 'Responda o que souber. Nada aqui é gravado.' },
};

function ProfileStep({
  schema, profile, setProfile, persona, busy, error, station, last, name, setName, onNext, onSubmit, onBack,
}) {
  const ids = PROFILE_STATIONS[station];
  const fields = schema.filter((f) => ids.includes(f.id));
  const ready = station !== 'VOCE' || (profile.age != null && profile.age !== '' && profile.sex);
  const copy = STATION_COPY[station];
  const submit = (e) => {
    e.preventDefault();
    if (!ready || busy) return;
    if (persona || last) onSubmit(); else onNext();
  };
  return (
    <div className="max-w-xl mx-auto space-y-4 animate-fade-in" key={station}>
      {persona && <PersonaNote persona={persona} />}
      <form className="glass p-5 sm:p-8 space-y-6" onSubmit={submit}>
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-semibold text-surface-900">{copy.title}</h2>
          <p className="text-sm text-surface-500 mt-1">{copy.text}</p>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-5">
          {station === 'VOCE' && (
            <div className="col-span-2">
              <label htmlFor="qt-name" className="text-[15px] text-surface-800 mb-1 block">Como podemos te chamar?</label>
              <input id="qt-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40}
                className="input text-base py-3" placeholder="Seu primeiro nome (opcional)" autoComplete="off" />
            </div>
          )}
          {fields.map((field) => (
            <ProfileField
              key={field.id}
              field={field}
              value={profile[field.field]}
              onChange={(v) => setProfile((p) => ({ ...p, [field.field]: v }))}
              visible={isFieldVisible(field, profile)}
              size="lg"
              wide={!HALF_WIDTH.includes(field.id)}
            />
          ))}
        </div>
        {!ready && !error && (
          <p className="text-sm text-surface-500">Preencha idade e sexo para continuar.</p>
        )}
        {error && <ErrorBox error={error} />}
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="btn-ghost"><ArrowLeft size={15} /> Voltar</button>
          <button type="submit" disabled={!ready || busy}
            className="btn-primary flex-1 justify-center py-3 text-base">
            {busy ? 'Enviando…' : <>{persona ? 'Ver o resultado' : last ? 'Seguir a trilha' : 'Próxima estação'} <ChevronRight size={17} /></>}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Resultado ───────────────────────────────────────────────
function Result({ res, persona, name, earned, age, onRestart }) {
  const [bonus, setBonus] = useState(0); // missões aceitas na tela
  const urgent = res.redFlag || res.nextStep?.code === 'AGORA';
  return (
    <div className="space-y-6 animate-fade-in">
      {persona && <PersonaNote persona={persona} />}
      {!urgent && <TrailComplete name={name.trim()} earned={earned} />}

      <NextStepCard step={res.nextStep} />

      {res.score && (
        <div className="glass p-5 flex items-center gap-5">
          <ScoreRing earned={res.score.earned + bonus} total={res.score.total} />
          <div className="min-w-0">
            <p className="section-title">Seu placar de prevenção</p>
            <p className="text-sm text-surface-700 mt-1">
              {res.wins?.length ?? 0} {res.wins?.length === 1 ? 'hábito que você já tem' : 'hábitos que você já tem'}
              {res.missions?.length ? ` e ${res.missions.length} ${res.missions.length === 1 ? 'missão' : 'missões'} para subir o placar.` : '. Placar cheio.'}
            </p>
            <p className="text-xs text-surface-500 mt-1">Pontos medem hábitos, montados a partir das suas respostas.</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <MissionList items={res.missions} onAccepted={setBonus} />
        <div className="space-y-4">
          <WinList items={res.wins} />
          <ExamMissions items={res.screening} age={age} />
        </div>
      </div>

      <Disclaimer audience="visitor" text={QUICKTEST_DISCLAIMER} />

      <div className="flex flex-col-reverse gap-4 md:flex-row md:items-center md:justify-between">
        <div className="hidden md:flex items-center gap-4">
          <QrCode value={PUBLIC_TEST_URL} size={104} />
          <div>
            <p className="font-medium text-surface-800 flex items-center gap-1.5"><Smartphone size={16} aria-hidden /> Faça no seu celular</p>
            <p className="text-sm text-surface-500 mt-1 max-w-xs">Leve o teste com você ou mostre para alguém da família.</p>
          </div>
        </div>
        <button type="button" onClick={onRestart} className="btn-primary text-base px-7 py-3.5 justify-center">
          <RotateCcw size={17} /> Novo teste
        </button>
      </div>
    </div>
  );
}

function PersonaNote({ persona }) {
  return (
    <p className="text-xs text-brand-700 bg-brand-50 border border-brand-100 rounded-lg px-3 py-2 flex items-center gap-2">
      <Users size={13} aria-hidden /> Demonstração: {persona.name} ({persona.summary.toLowerCase()})
    </p>
  );
}

function ErrorBox({ error }) {
  return (
    <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p>{error.message}</p>
      {error.fields?.length > 0 && (
        <ul className="list-disc list-inside text-xs mt-1">
          {error.fields.map((f, i) => <li key={i}>{f.message}</li>)}
        </ul>
      )}
    </div>
  );
}
