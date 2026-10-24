const authService = require('../services/authService');
const prisma      = require('../config/database');

// Usuário é gravado e procurado sempre em minúsculas, sem espaços
const normUsername = (u) => (typeof u === 'string' ? u.trim().toLowerCase() : '');

/**
 * POST /auth/register
 * Só paciente se cadastra, e só com usuário, nome e senha. O resto do
 * corpo (role, healthCoins, cpf...) é ignorado: sem isso, quem se cadastra
 * escolhia o próprio saldo de coins ou o próprio papel.
 */
const register = async (req, res, next) => {
  try {
    const { password, fullName } = req.body;
    const result = await authService.register({
      username: normUsername(req.body.username),
      password: String(password),
      fullName: String(fullName).trim(),
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/entrar  { name }  -> paciente visitante (sem senha)
 */
const enter = async (req, res, next) => {
  try {
    const fullName = String(req.body.name).trim().replace(/\s+/g, ' ').slice(0, 60);
    res.status(201).json(await authService.guestEnter({ fullName }));
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/entrar-medica  -> conta da médica de demonstração
 */
const enterDoctor = async (req, res, next) => {
  try {
    res.json(await authService.doctorEnter());
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/login
 */
const login = async (req, res, next) => {
  try {
    const result = await authService.login({
      username: normUsername(req.body.username),
      password: req.body.password,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/refresh
 */
const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken)
      return res.status(400).json({ error: 'refreshToken obrigatório' });

    const tokens = await authService.refresh(refreshToken);
    res.json(tokens);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/logout
 */
const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken, req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/change-password
 */
const changePassword = async (req, res, next) => {
  try {
    await authService.changePassword(req.user.id, req.body);
    res.json({ message: 'Senha alterada com sucesso' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /auth/tutorial-seen
 */
const tutorialSeen = async (req, res, next) => {
  try {
    await authService.markTutorialSeen(req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

/**
 * GET /auth/me
 */
const me = async (req, res) => {
  const { id, role } = req.user;

  const u = await prisma.user.findUnique({
    where:  { id },
    select: { username: true, tutorialSeenAt: true },
  });

  let fullName = null;
  let healthCoins = null;
  if (role === 'PATIENT') {
    const p = await prisma.patient.findUnique({
      where:  { userId: id },
      select: { fullName: true, healthCoins: true },
    });
    fullName    = p?.fullName    ?? null;
    healthCoins = p?.healthCoins ?? 0;
  } else if (role === 'DOCTOR') {
    const d = await prisma.doctor.findUnique({ where: { userId: id }, select: { fullName: true } });
    fullName = d?.fullName ?? null;
  }

  res.json({
    user: {
      id, role, fullName, healthCoins,
      username:       u?.username ?? null,
      tutorialSeenAt: u?.tutorialSeenAt ?? null,
    },
  });
};

module.exports = { enter, enterDoctor, register, login, refresh, logout, changePassword, tutorialSeen, me };
