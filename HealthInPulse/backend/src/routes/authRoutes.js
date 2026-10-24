const { Router } = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { authenticate } = require('../middlewares/authMiddleware');
const { validate } = require('../middlewares/validationMiddleware');
const { demoMode } = require('../config/demo');

const router = Router();

// ─── validações reutilizáveis ────────────────────────────────

// Usuário: 3 a 30 caracteres, letras minúsculas sem acento, números, ponto e _
const usernameRule = body('username')
  .isString().bail()
  .trim().toLowerCase()
  .matches(/^[a-z0-9._]{3,30}$/)
  .withMessage('Usuário: de 3 a 30 caracteres, só letras sem acento, números, ponto e _');
const passwordRule = body('password').isLength({ min: 8 }).withMessage('Senha mínima de 8 caracteres');

// ─── rotas públicas ──────────────────────────────────────────

// Feira: entrar só com o nome. Só existe com DEMO_MODE=true; sem a flag
// estas rotas dão 404 e o frontend volta ao login com usuário e senha.
// O GET /entrar serve para o frontend descobrir se o modo demo está ligado.
if (demoMode()) {
  router.get('/entrar', (req, res) => res.status(204).send());

  router.post(
    '/entrar',
    [body('name').isString().bail().trim().isLength({ min: 1, max: 60 }).withMessage('Digite seu nome')],
    validate,
    authController.enter,
  );

  router.post('/entrar-medica', authController.enterDoctor);
} else {
  // 404 explícito: sem isto o router.use(authenticate) abaixo responderia 401
  // e o frontend tentaria renovar sessão em vez de mostrar o login com senha
  router.all(['/entrar', '/entrar-medica'], (req, res) => res.status(404).json({ error: 'Rota não encontrada' }));
}

router.post(
  '/register',
  [
    usernameRule,
    passwordRule,
    body('fullName').isString().bail().trim().notEmpty().withMessage('Informe seu nome'),
  ],
  validate,
  authController.register,
);

router.post(
  '/login',
  [body('username').isString().bail().trim().notEmpty(), body('password').notEmpty()],
  validate,
  authController.login,
);

router.post('/refresh', authController.refresh);

// ─── rotas protegidas ────────────────────────────────────────

router.use(authenticate);

router.get('/me', authController.me);

router.post('/logout', authController.logout);

router.post('/tutorial-seen', authController.tutorialSeen);

router.post(
  '/change-password',
  [
    body('currentPassword').notEmpty(),
    passwordRule.withMessage('Nova senha mínima de 8 caracteres').bail().custom((val, { req }) => {
      if (val === req.body.currentPassword)
        throw new Error('Nova senha não pode ser igual à atual');
      return true;
    }),
  ],
  validate,
  authController.changePassword,
);

module.exports = router;
