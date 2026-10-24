// DEMO_MODE=true liga a entrada sem senha da feira (só nome / "Entrar como
// médica"). Ausente ou qualquer outro valor = desligado: as rotas nem existem
// (404) e só o login com usuário e senha funciona. Nunca ligar num deploy público.
const demoMode = () => process.env.DEMO_MODE === 'true';

// Conta médica de demonstração do seed usada por /auth/entrar-medica
const DEMO_DOCTOR_USERNAME = 'ana';

module.exports = { demoMode, DEMO_DOCTOR_USERNAME };
