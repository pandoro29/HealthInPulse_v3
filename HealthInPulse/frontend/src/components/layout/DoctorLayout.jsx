import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSocket } from '@/contexts/SocketContext';
import { useEffect, useState } from 'react';
import { LayoutDashboard, Users, Calendar, User, LogOut, Menu, Stethoscope, BookOpen, Watch, Brain, History, Database, BellRing, X } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { doctorService } from '@/services';
import { RISK_LABEL } from '@/lib/risk';

const NAV = [
  { to: '/doctor',              label: 'Dashboard',         icon: LayoutDashboard, end: true },
  { to: '/doctor/patients',     label: 'Pacientes',         icon: Users },
  { to: '/doctor/wearable',     label: 'Wearable',          icon: Watch },
  { to: '/doctor/reports',      label: 'Relatórios',        icon: Brain },
  { to: '/doctor/history',      label: 'Histórico',         icon: History },
  { to: '/doctor/appointments', label: 'Agenda',            icon: Calendar },
  { to: '/doctor/knowledge',    label: 'Base da IA',        icon: Database },
  { to: '/doctor/reference',    label: 'Base Clínica',      icon: BookOpen },
  { to: '/doctor/profile',      label: 'Perfil',            icon: User },
];

// ─── Aviso de triagem (socket `triage:alert`) ─────────────────
// O backend manda o evento só para a sala `user:<id>` dos médicos
// vinculados ao paciente, com { patientId, riskLevel, triageId, isRedFlag,
// oncology?: ['CA_...'] } (cânceres em INVESTIGAR). Câncer nunca em
// vermelho: laranja; vermelho só para red flag de emergência (CRITICAL).
const CANCER_SHORT = {
  CA_COLORRETAL: 'colorretal',
  CA_PULMAO:     'pulmão',
  CA_MAMA:       'mama',
  CA_PROSTATA:   'próstata',
  CA_COLO_UTERO: 'colo do útero',
};

function alertText(alert) {
  const onco = (alert.oncology ?? []).map((c) => CANCER_SHORT[c] ?? c);
  if (alert.isRedFlag) return 'Sinal de alerta na triagem: veja o paciente agora.';
  if (onco.length) return `Câncer para investigar: ${onco.join(', ')}.`;
  return `Triagem concluída com risco ${(RISK_LABEL[alert.riskLevel] ?? alert.riskLevel ?? '').toLowerCase()}.`;
}

function useTriageAlerts(navigate) {
  const { socket } = useSocket() ?? {};

  useEffect(() => {
    if (!socket) return undefined;
    const onAlert = async (alert) => {
      if (!alert?.patientId) return;
      let name = 'Paciente';
      try { name = (await doctorService.getPatientDetail(alert.patientId)).data?.fullName || name; } catch { /* sem nome */ }
      const emergency = alert.isRedFlag && alert.riskLevel === 'CRITICAL';
      toast.custom((t) => (
        <div className={clsx(
          'max-w-sm w-full rounded-xl border bg-white shadow-card-hover p-4 flex items-start gap-3',
          emergency ? 'border-red-300' : 'border-orange-200',
          t.visible ? 'animate-fade-in' : 'opacity-0',
        )}>
          <BellRing size={18} className={clsx('shrink-0 mt-0.5', emergency ? 'text-red-600' : 'text-orange-600')} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-surface-900 truncate">{name}</p>
            <p className="text-xs text-surface-600 mt-0.5">{alertText(alert)}</p>
            <button type="button"
              onClick={() => { toast.dismiss(t.id); navigate(`/doctor/patients/${alert.patientId}`); }}
              className="text-xs font-medium text-brand-700 hover:text-brand-900 mt-2">
              Ver paciente →
            </button>
          </div>
          <button type="button" onClick={() => toast.dismiss(t.id)} aria-label="Fechar"
            className="text-surface-400 hover:text-surface-600">
            <X size={14} />
          </button>
        </div>
      ), { id: `triage-${alert.triageId ?? alert.patientId}`, duration: 15000 });
    };
    socket.on('triage:alert', onAlert);
    return () => { socket.off('triage:alert', onAlert); };
  }, [socket, navigate]);
}

export default function DoctorLayout() {
  const { user, logout } = useAuth();
  const navigate          = useNavigate();
  const [open, setOpen]   = useState(false);
  useTriageAlerts(navigate);

  const handleLogout = async () => {
    await logout();
    toast.success('Até logo!');
    navigate('/login');
  };

  // 100dvh: no celular o 100vh (h-screen) é maior que a área visível e o
  // topo com o menu saía da tela
  return (
    <div className="flex h-[100dvh] overflow-hidden">
      {open && (
        <div className="fixed inset-0 z-20 bg-surface-900/30 lg:hidden" onClick={() => setOpen(false)} />
      )}

      <aside className={clsx(
        'fixed inset-y-0 left-0 z-30 w-64 flex flex-col',
        'bg-white backdrop-blur-lg border-r border-surface-200',
        'transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto',
        open ? 'translate-x-0' : '-translate-x-full',
      )}>
        <div className="px-6 py-5 border-b border-surface-200">
          <span className="font-display text-lg font-bold tracking-tight">
            Health<span className="text-brand-600">InPulse</span>
          </span>
          <p className="text-[10px] text-surface-400 mt-0.5 tracking-widest uppercase flex items-center gap-1">
            <Stethoscope size={9} /> Médico
          </p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to} to={to} end={end}
              onClick={() => setOpen(false)}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-brand-50 text-brand-600'
                  : 'text-surface-500 hover:text-surface-700 hover:bg-surface-50',
              )}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 pb-4 border-t border-surface-200 pt-4">
          <div className="flex items-center gap-3 px-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 text-xs font-bold">
              {(user?.fullName || user?.username)?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-surface-700 truncate">{user?.fullName || user?.username}</p>
              <p className="text-[10px] text-surface-400">Médico</p>
            </div>
          </div>
          <button onClick={handleLogout} className="btn-ghost w-full justify-start text-red-500 hover:text-red-600">
            <LogOut size={14} /> Sair
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 flex items-center px-4 border-b border-surface-200 bg-white/80 backdrop-blur shrink-0">
          <button className="lg:hidden btn-ghost p-2" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu size={18} />
          </button>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
