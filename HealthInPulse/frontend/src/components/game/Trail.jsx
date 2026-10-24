// ─── Trilha do Pulso (teste público /teste) ─────────────────
// Camada de jogo por cima do teste rápido: estações, "pulso" de 0 a 100
// e selos. O pulso mede SÓ o progresso na trilha, nunca risco (regra R2:
// nada aqui pode revelar resultado clínico nem citar doença).
//
// As 3 primeiras estações são o perfil (montadas no front); as outras vêm
// do campo `station` de cada pergunta da API (quickTestService).
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  UserRound, Ruler, Coffee, HeartPulse, Moon, Smile, Footprints, Eye, Award,
} from 'lucide-react';

export const STATIONS = [
  { id: 'VOCE',    title: 'Quem é você',      badge: 'Check-in',   icon: UserRound },
  { id: 'CORPO',   title: 'Corpo',            badge: 'Medidas',    icon: Ruler },
  { id: 'HABITOS', title: 'Hábitos e família', badge: 'Raízes',    icon: Coffee },
  { id: 'CORACAO', title: 'Coração',          badge: 'Ritmo',      icon: HeartPulse },
  { id: 'SONO',    title: 'Sono',             badge: 'Boa noite',  icon: Moon },
  { id: 'ANIMO',   title: 'Ânimo',            badge: 'Astral',     icon: Smile },
  { id: 'ROTINA',  title: 'Rotina',           badge: 'Em movimento', icon: Footprints },
  { id: 'SINAIS',  title: 'Sinais do corpo',  badge: 'Atento',     icon: Eye },
];
// Frase curta que abre cada estação de perguntas (sem nome de doença)
const STATION_BLURB = {
  CORACAO: 'Duas perguntas sobre o seu coração.',
  SONO:    'Como você dorme diz muito. Três perguntas.',
  ANIMO:   'Duas semanas, duas perguntas: como anda o seu ânimo.',
  ROTINA:  'Movimento, prato e família. Cinco perguntas rápidas.',
  SINAIS:  'Última estação: sinais do corpo que valem uma conversa.',
};

export function StationIntro({ station }) {
  const s = STATIONS[stationIndex(station)];
  if (!s || !STATION_BLURB[s.id]) return null;
  const Icon = s.icon;
  return (
    <div key={s.id} className="flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 animate-slide-up">
      <span className="w-9 h-9 rounded-full bg-brand-600 text-white flex items-center justify-center shrink-0"><Icon size={18} aria-hidden /></span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-brand-700 font-semibold">Estação {stationIndex(station) + 1} · {s.title}</p>
        <p className="text-sm text-surface-700">{STATION_BLURB[s.id]}</p>
      </div>
    </div>
  );
}

export const stationIndex = (id) => Math.max(0, STATIONS.findIndex((s) => s.id === id));

// Campos do perfil por estação (ids do schema da API)
export const PROFILE_STATIONS = {
  VOCE:    ['age', 'sex'],
  CORPO:   ['height', 'weight'],
  HABITOS: ['smoker', 'packYears', 'quitYears', 'alcoholDosesWeek', 'familyHistoryCancer', 'papEmDia'],
};
export const PROFILE_STEPS = Object.keys(PROFILE_STATIONS).length;

// Pulso = fração da trilha percorrida (perfil + perguntas)
export const pulseFor = ({ profileDone = 0, asked = 0, max = 0 }) => {
  const total = PROFILE_STEPS + max;
  if (!total) return 0;
  return Math.min(100, Math.round(((profileDone + asked) / total) * 100));
};

// Barra do topo: estações + contador do pulso, que "bate" quando sobe
export function TrailHud({ current, pulse }) {
  const [beat, setBeat] = useState(false);
  useEffect(() => {
    setBeat(true);
    const t = setTimeout(() => setBeat(false), 450);
    return () => clearTimeout(t);
  }, [pulse]);

  const idx = stationIndex(current);
  return (
    <div className="space-y-2" aria-label={`Estação ${idx + 1} de ${STATIONS.length}, pulso ${pulse}`}>
      <div className="flex items-center justify-between text-xs text-surface-500">
        <span>Estação {idx + 1} de {STATIONS.length} · <strong className="text-surface-800">{STATIONS[idx].title}</strong></span>
        <span className="flex items-center gap-1 font-semibold text-red-500 tabular-nums">
          <HeartPulse size={15} aria-hidden className={clsx(beat && 'animate-heartbeat')} /> {pulse}
        </span>
      </div>
      <ol className="flex gap-1.5" aria-hidden>
        {STATIONS.map((s, i) => (
          <li key={s.id} className={clsx(
            'h-2 flex-1 rounded-full transition-colors duration-300',
            i < idx ? 'bg-brand-600' : i === idx ? 'bg-brand-300' : 'bg-surface-200',
          )} />
        ))}
      </ol>
    </div>
  );
}

// Selo que aparece ao fechar uma estação
export function BadgeToast({ station, onDone }) {
  useEffect(() => {
    if (!station) return undefined;
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [station, onDone]);
  if (!station) return null;
  const s = STATIONS[stationIndex(station)];
  const Icon = s.icon;
  return (
    <div role="status" className="fixed left-1/2 -translate-x-1/2 bottom-6 z-50 animate-badge-pop">
      <div className="glass flex items-center gap-3 px-4 py-3 shadow-lg border-brand-200">
        <span className="w-10 h-10 rounded-full bg-brand-600 text-white flex items-center justify-center">
          <Icon size={18} aria-hidden />
        </span>
        <span>
          <span className="block text-[11px] uppercase tracking-wider text-brand-700 font-semibold">Selo conquistado</span>
          <span className="block font-display font-semibold text-surface-900">{s.badge}</span>
        </span>
      </div>
    </div>
  );
}

// Abertura da tela de resultado: trilha completa e os selos
export function TrailComplete({ name, earned }) {
  return (
    <div className="glass p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4 animate-slide-up">
      <span className="w-14 h-14 rounded-full bg-brand-600 text-white flex items-center justify-center shrink-0 animate-heartbeat">
        <Award size={26} aria-hidden />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs uppercase tracking-wider text-brand-700 font-semibold">Trilha completa · pulso 100</p>
        <h2 className="font-display text-xl sm:text-2xl font-bold text-surface-900">
          {name ? `${name}, você é Guardião da prevenção` : 'Você é Guardião da prevenção'}
        </h2>
        <ul className="flex flex-wrap gap-1.5 mt-2">
          {STATIONS.filter((s) => earned.includes(s.id)).map((s) => (
            <li key={s.id} className="badge-blue gap-1"><s.icon size={12} aria-hidden /> {s.badge}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
