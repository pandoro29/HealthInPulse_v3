import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth, homeFor } from '@/contexts/AuthContext';
import { Heart, ClipboardCheck, Activity, Sparkles, Stethoscope, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiError } from '@/services/api';
import { authService } from '@/services';

// Contas de demonstração do seed, uma por situação. O subtítulo não cita
// doença (regra R2): o login é público e o paciente também vê esta tela.
const DEMO_USERS = [
  { id: 'roberto', label: 'Roberto Pereira',  sub: 'Paciente · 63 anos · exames pedem atenção', icon: UserRound,   username: 'roberto', pass: 'Roberto@123',
    what: 'Exames recentes mudaram. Veja o próximo passo, os exames indicados e o retorno já marcado.' },
  { id: 'joao',    label: 'João Mendes',      sub: 'Paciente · 58 anos · acompanhamento de perto', icon: Activity, username: 'joao',    pass: 'Joao@123',
    what: '30 dias de pressão e glicose fora da faixa, alertas, metas da semana e consulta marcada.' },
  { id: 'marina',  label: 'Marina Lima',      sub: 'Paciente · 34 anos · prevenção',            icon: Sparkles,    username: 'marina',  pass: 'Marina@123',
    what: 'Exames ainda bons, mas subindo em 60 dias. Veja metas, moedas e hábitos para virar o jogo.' },
  { id: 'ana',     label: 'Dra. Ana Beatriz', sub: 'Médica · visão da equipe de saúde',         icon: Stethoscope, username: 'ana',     pass: 'Doctor@123',
    what: 'Lista de pacientes, risco de cada um, alertas e a base clínica com as fontes.' },
];

// Feira (DEMO_MODE no backend): entrar é só digitar o nome. Sem cadastro,
// sem senha. O backend cria um paciente com esse nome e dados de exemplo.
// Sem DEMO_MODE o GET /auth/entrar dá 404 e a tela volta ao login com senha.
export default function LoginPage() {
  const { enter, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from     = location.state?.from?.pathname || null;

  const [name, setName]       = useState('');
  const [loading, setLoading] = useState(false);
  // null = ainda perguntando ao backend; true = feira; false = login com senha
  const [demo, setDemo]       = useState(null);
  const [cred, setCred]       = useState({ username: '', password: '' });

  useEffect(() => {
    authService.demoMode()
      .then(() => setDemo(true))
      .catch((err) => setDemo(err.response?.status === 404 ? false : true));
  }, []);

  const go = async (fn) => {
    setLoading(true);
    try {
      const user = await fn();
      navigate(from || homeFor(user), { replace: true });
    } catch (err) {
      toast.error(apiError(err, 'Não foi possível entrar, tente de novo'));
    } finally {
      setLoading(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return toast.error('Digite seu nome');
    go(() => enter(n));
  };

  const submitPassword = (e) => {
    e.preventDefault();
    if (!cred.username || !cred.password) return toast.error('Preencha usuário e senha');
    go(() => login(cred.username, cred.password));
  };
  const setC = (k) => (e) => setCred((c) => ({ ...c, [k]: e.target.value }));

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-brand-50 blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative animate-slide-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-brand-50 mb-4">
            <Heart size={22} className="text-brand-700" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Health<span className="text-brand-700">InPulse</span>
          </h1>
          <p className="text-surface-500 text-sm mt-1">Saúde digital · Care Plus</p>
        </div>

        <div className="glass p-6">
          {demo === false ? (
          <form onSubmit={submitPassword} className="space-y-4" autoComplete="off">
            <div>
              <label className="label" htmlFor="login-username">Usuário</label>
              <input id="login-username" value={cred.username} onChange={setC('username')}
                className="input" autoComplete="off" autoCapitalize="none" spellCheck={false} />
            </div>
            <div>
              <label className="label" htmlFor="login-password">Senha</label>
              <input id="login-password" type="password" value={cred.password} onChange={setC('password')}
                className="input" autoComplete="off" />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-1">
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
          ) : (
          <form onSubmit={submit} className="space-y-4" autoComplete="off">
            <div>
              <label className="label" htmlFor="login-name">Seu nome</label>
              <input
                id="login-name" name="hip-name" autoFocus
                value={name} onChange={(e) => setName(e.target.value)}
                className="input" placeholder="Como você se chama?"
                maxLength={60} autoComplete="off"
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-1">
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
          )}

          {/* Demo: clique entra direto na conta do seed */}
          {demo !== false && (
          <div className="mt-6 pt-5 border-t border-surface-200">
            <p className="text-[10px] uppercase tracking-widest text-surface-400 font-semibold mb-3">
              Ou veja um perfil de demonstração
            </p>
            <div className="grid gap-2">
              {DEMO_USERS.map((u) => (
                <button
                  type="button"
                  key={u.id}
                  onClick={() => go(() => login(u.username, u.pass))}
                  disabled={loading}
                  className="w-full text-left p-3 rounded-xl border border-surface-200 hover:border-brand-300 hover:bg-brand-50/40 transition-all flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-surface-100 text-surface-500 group-hover:bg-brand-100 group-hover:text-brand-700 transition-colors">
                    <u.icon size={16} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-surface-800">{u.label}</span>
                    <span className="block text-[11px] text-surface-500">{u.sub}</span>
                    <span className="block text-[11px] text-surface-400 mt-0.5 leading-snug">{u.what}</span>
                  </span>
                  <span className="text-surface-300 group-hover:text-brand-600 transition-colors">→</span>
                </button>
              ))}
            </div>
          </div>
          )}
        </div>

        {/* Teste rápido do stand: público, sem login */}
        <Link
          to="/teste"
          className="glass mt-4 p-4 flex items-center gap-3 hover:border-brand-300 hover:bg-brand-50/40 transition-all group"
        >
          <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-brand-50 text-brand-700">
            <ClipboardCheck size={16} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium text-surface-800">Teste rápido de prevenção</span>
            <span className="block text-[11px] text-surface-500">2 a 3 minutos, sem login, nada é gravado</span>
          </span>
          <span className="text-surface-300 group-hover:text-brand-600 transition-colors">→</span>
        </Link>

      </div>
    </div>
  );
}
