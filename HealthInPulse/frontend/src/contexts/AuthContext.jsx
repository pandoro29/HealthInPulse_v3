import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService, coinService } from '@/services';

const AuthContext = createContext(null);

// Rotas que funcionam sem login e não devem mexer na sessão
export const isPublicPath = (path = window.location.pathname) =>
  path === '/teste' || path.startsWith('/teste/');

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) { setLoading(false); return; }
    // Teste público (/teste): não precisa de sessão. Um token velho (o
    // `npm run stand` reseta o banco) faria me() → 401 → refresh falho →
    // redirecionar para /login no meio do teste do visitante.
    if (isPublicPath()) { setLoading(false); return; }

    authService.me()
      .then(({ data }) => setUser(data.user))
      .catch(() => localStorage.clear())
      .finally(() => setLoading(false));
  }, []);

  // Guarda os tokens e o usuário (login e cadastro devolvem o mesmo formato)
  const startSession = useCallback((data) => {
    localStorage.setItem('accessToken',  data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    setUser(data.user);
    return data.user;
  }, []);

  const login = useCallback(async (username, password) => {
    const { data } = await authService.login({ username, password });
    return startSession(data);
  }, [startSession]);

  // Feira: entra só com o nome (paciente) ou direto como médica
  const enter = useCallback(async (name) => {
    const { data } = await authService.enter(name);
    return startSession(data);
  }, [startSession]);

  const enterDoctor = useCallback(async () => {
    const { data } = await authService.enterDoctor();
    return startSession(data);
  }, [startSession]);

  const register = useCallback(async (form) => {
    const { data } = await authService.register(form);
    return startSession(data);
  }, [startSession]);

  // Tutorial visto: grava no banco para não aparecer de novo em outro aparelho
  const markTutorialSeen = useCallback(async () => {
    if (!user || user.tutorialSeenAt) return;
    setUser((u) => (u ? { ...u, tutorialSeenAt: new Date().toISOString() } : u));
    try { await authService.tutorialSeen(); } catch (_) {}
  }, [user]);

  const logout = useCallback(async () => {
    try { await authService.logout(); } catch (_) {}
    localStorage.clear();
    setUser(null);
  }, []);

  // Atualiza só o saldo de coins (pra refletir após resgate ou conclusão de meta)
  const refreshCoins = useCallback(async () => {
    if (!user || user.role !== 'PATIENT') return;
    try {
      const { data } = await coinService.balance();
      setUser((u) => (u ? { ...u, healthCoins: data.balance } : u));
    } catch (_) {}
  }, [user]);

  const isPatient = user?.role === 'PATIENT';
  const isDoctor  = user?.role === 'DOCTOR';

  return (
    <AuthContext.Provider value={{
      user, loading, login, enter, enterDoctor, register, logout, refreshCoins, markTutorialSeen, isPatient, isDoctor,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// Para onde o usuário vai depois de entrar. Paciente que ainda não viu o
// tutorial está no primeiro acesso: começa pela triagem.
export const homeFor = (user) => {
  if (user?.role === 'DOCTOR') return '/doctor';
  return user?.tutorialSeenAt ? '/patient' : '/patient/triage';
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
};
