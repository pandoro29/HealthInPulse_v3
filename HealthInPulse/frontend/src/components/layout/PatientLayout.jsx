import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useState, useEffect, useCallback } from 'react';
import Tutorial from '@/components/onboarding/Tutorial';
import { notificationService } from '@/services';
import {
  LayoutDashboard, FileText, ClipboardList,
  Brain, Calendar, User, LogOut, Bell, Menu,
  Target, Gift, Coins,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

const NAV = [
  { to: '/patient',              label: 'Dashboard',     icon: LayoutDashboard, end: true,
    tour: 'Resumo do dia com os sinais da sua pulseira e o seu próximo passo.' },
  { to: '/patient/goals',        label: 'Metas',         icon: Target,
    tour: 'Ações para manter sua saúde em dia. Cada meta concluída vale coins.' },
  { to: '/patient/rewards',      label: 'Recompensas',   icon: Gift,
    tour: 'Troque seus coins na loja Care Plus.' },
  { to: '/patient/exams',        label: 'Exames',        icon: FileText,
    tour: 'Envie seus exames e veja o que ficou dentro ou fora da faixa de referência.' },
  { to: '/patient/triage',       label: 'Triagem',       icon: ClipboardList,
    tour: 'Questionário que atualiza suas metas. Refaça quando quiser.' },
  { to: '/patient/reports',      label: 'Relatórios IA', icon: Brain,
    tour: 'Os resultados das suas triagens, guardados para você rever.' },
  { to: '/patient/appointments', label: 'Consultas',     icon: Calendar,
    tour: 'Suas consultas marcadas com a médica.' },
  { to: '/patient/profile',      label: 'Perfil',        icon: User,
    tour: 'Seus dados. Aqui você também revê este tutorial.' },
];

const TOUR_STEPS = NAV.map(({ to, label, tour }) => ({ to, title: label, text: tour }));

export default function PatientLayout() {
  const { user, logout, markTutorialSeen } = useAuth();
  const navigate          = useNavigate();
  const [open,        setOpen]        = useState(false);
  const [unread,      setUnread]      = useState(0);
  const [touring,     setTouring]     = useState(false);

  // Tutorial: a triagem abre no primeiro acesso; o Perfil abre para rever.
  // No celular o menu abre junto para o balão apontar para os itens.
  const openTutorial = useCallback(() => {
    setTouring(true);
    if (window.innerWidth < 1024) setOpen(true);
  }, []);
  const closeTutorial = useCallback(() => {
    setTouring(false);
    setOpen(false);
    markTutorialSeen();
  }, [markTutorialSeen]);

  useEffect(() => {
    notificationService.unreadCount()
      .then(({ data }) => setUnread(data.count))
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await logout();
    toast.success('Até logo!');
    navigate('/login');
  };

  // 100dvh: no celular o 100vh (h-screen) é maior que a área visível e o
  // topo com o menu saía da tela
  return (
    <div className="flex h-[100dvh] overflow-hidden">
      {/* ── Overlay mobile ── */}
      {open && !touring && (
        <div
          className="fixed inset-0 z-20 bg-surface-900/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      {touring && <Tutorial steps={TOUR_STEPS} onClose={closeTutorial} />}

      {/* ── Sidebar ── */}
      <aside className={clsx(
        'fixed inset-y-0 left-0 z-30 w-64 flex flex-col',
        'bg-white backdrop-blur-lg border-r border-surface-200',
        'transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto',
        open ? 'translate-x-0' : '-translate-x-full',
      )}>
        {/* Logo */}
        <div className="px-6 py-5 border-b border-surface-200">
          <span className="font-display text-lg font-bold tracking-tight">
            Health<span className="text-brand-600">InPulse</span>
          </span>
          <p className="text-[10px] text-surface-400 mt-0.5 tracking-widest uppercase">Paciente</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to} to={to} end={end} data-tour={to}
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

        {/* Footer */}
        <div className="px-3 pb-4 border-t border-surface-200 pt-4">
          <div className="flex items-center gap-3 px-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 text-xs font-bold">
              {(user?.fullName || user?.username)?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-surface-700 truncate">{user?.fullName || user?.username}</p>
              <p className="text-[10px] text-surface-400">Paciente</p>
            </div>
          </div>
          <button onClick={handleLogout} className="btn-ghost w-full justify-start text-red-500 hover:text-red-600">
            <LogOut size={14} /> Sair
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-14 flex items-center justify-between px-4 border-b border-surface-200 bg-white/80 backdrop-blur shrink-0">
          <button className="lg:hidden btn-ghost p-2" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu size={18} />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Link
              to="/patient/rewards"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors"
              title="Health Coins — clique para ver recompensas"
            >
              <Coins size={13} />
              {user?.healthCoins ?? 0}
            </Link>
            <button className="btn-ghost p-2 relative">
              <Bell size={16} />
              {unread > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand-700" />
              )}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet context={{ openTutorial }} />
        </main>
      </div>
    </div>
  );
}
