import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Heart, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiError } from '@/services/api';

// Mesma regra do backend (authRoutes.js): 3 a 30, minúsculas, números, . e _
const USERNAME_RE = /^[a-z0-9._]{3,30}$/;

// Só paciente se cadastra, com usuário, nome e senha. A médica já tem login.
export default function RegisterPage() {
  const { register }          = useAuth();
  const navigate              = useNavigate();
  const [show, setShow]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm]       = useState({ username: '', fullName: '', password: '' });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setUsername = (e) =>
    setForm((f) => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }));

  const submit = async (e) => {
    e.preventDefault();
    if (!USERNAME_RE.test(form.username)) {
      return toast.error('Usuário: de 3 a 30 caracteres, só letras sem acento, números, ponto e _');
    }
    if (form.password.length < 8) return toast.error('A senha precisa ter pelo menos 8 caracteres');
    setLoading(true);
    try {
      await register(form);
      // Primeiro acesso começa pela triagem (depois vem o tutorial)
      navigate('/patient/triage', { replace: true });
    } catch (err) {
      toast.error(apiError(err, 'Erro ao cadastrar'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-brand-50 blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative animate-slide-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-brand-50 mb-4">
            <Heart size={22} className="text-brand-600" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Health<span className="text-brand-600">InPulse</span>
          </h1>
        </div>

        <div className="glass p-6">
          <h2 className="font-display text-lg font-semibold mb-5">Criar conta</h2>
          <form onSubmit={submit} className="space-y-3" autoComplete="off">
            <div>
              <label className="label" htmlFor="reg-username">Usuário</label>
              <input
                id="reg-username" className="input" value={form.username} onChange={setUsername}
                placeholder="ex.: maria.silva" required autoComplete="off" autoCapitalize="none" spellCheck={false}
              />
              <p className="text-[11px] text-surface-400 mt-1">Letras sem acento, números, ponto e _. É com ele que você entra.</p>
            </div>
            <div>
              <label className="label" htmlFor="reg-name">Nome</label>
              <input id="reg-name" className="input" value={form.fullName} onChange={set('fullName')} placeholder="Seu nome" required />
            </div>
            <div>
              <label className="label" htmlFor="reg-password">Senha</label>
              <div className="relative">
                <input
                  id="reg-password" className="input pr-10" type={show ? 'text' : 'password'}
                  value={form.password} onChange={set('password')} placeholder="Mínimo 8 caracteres"
                  required autoComplete="new-password"
                />
                <button
                  type="button" onClick={() => setShow(!show)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-500"
                  aria-label={show ? 'Esconder senha' : 'Mostrar senha'}
                >
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-1">
              {loading ? 'Criando…' : 'Criar conta'}
            </button>
          </form>
        </div>

        <p className="text-center text-surface-400 text-sm mt-4">
          Já tem conta?{' '}
          <Link to="/login" className="text-brand-600 hover:text-brand-700">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
