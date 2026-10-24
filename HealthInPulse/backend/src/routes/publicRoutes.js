const express   = require('express');
const rateLimit = require('express-rate-limit');
const { body, checkExact } = require('express-validator');
const { validate }   = require('../middlewares/validationMiddleware');
const kbRepository   = require('../services/clinical/kb/kbRepository');
const quickTest      = require('../services/quickTestService');
const patientView  = require('../services/patientView');
const { FAMILY_CANCER_VALUES } = require('../services/clinical/profile');

// ─── Rotas públicas (sem login) ──────────────────────────────
// POST /api/public/quick-test: o teste rápido do stand (/teste).
// Sem estado e nada gravado: o corpo traz tudo o que o visitante já
// respondeu. O corpo NÃO vai para o log (morgan só registra a URL; o
// errorMiddleware só loga erro 500, sem o corpo).

// Antes do parser geral (10 MB) em app.js: limita a taxa e o tamanho.
// O parser geral pula corpo que já foi lido.
const guard = [
  rateLimit({
    windowMs: 60 * 1000,
    // No stand todo mundo sai pelo IP do notebook: ~15 chamadas por teste
    limit: Number(process.env.PUBLIC_RATE_LIMIT) || 300,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Muitas requisições. Espere um minuto e tente de novo.' },
  }),
  express.json({ limit: '16kb' }),
];

// ─── Validação do formato ────────────────────────────────────
// O que depende do kb (quais códigos de pergunta existem) fica no
// quickTestService. Campo fora da lista → 422 (checkExact no topo,
// lista explícita dentro de `profile`).
const opt = (field) => body(field).optional({ values: 'falsy' });
const ANSWER_CODE = /^[a-z0-9_]{1,64}$/;
const ANSWER_VALUES = [true, false, 0, 1, 2, 3, 'sim', 'não', 'nao']; // 2 e 3: likert do PHQ-2

const quickTestRules = checkExact([
  body('profile').optional({ values: 'null' }).isObject().withMessage('profile deve ser um objeto')
    .bail()
    // o checkExact não olha dentro de um objeto conhecido: lista explícita
    .custom((profile) => {
      if (Object.keys(profile).some(k => !quickTest.PROFILE_FIELDS.includes(k))) {
        throw new Error(`Campo não permitido. Use só: ${quickTest.PROFILE_FIELDS.join(', ')}`);
      }
      return true;
    }),
  opt('profile.age').isInt({ min: 0, max: 120 }).withMessage('idade entre 0 e 120'),
  opt('profile.sex').isIn(['male', 'female']).withMessage('sexo: male ou female'),
  opt('profile.height').isFloat({ min: 50, max: 250 }).withMessage('altura em cm (50 a 250)'),
  opt('profile.weight').isFloat({ min: 20, max: 300 }).withMessage('peso em kg (20 a 300)'),
  opt('profile.smoker').isBoolean().withMessage('true ou false'),
  opt('profile.packYears').isFloat({ min: 0, max: 200 }).withMessage('maços-ano de 0 a 200'),
  opt('profile.quitYears').isFloat({ min: 0, max: 100 }).withMessage('anos de 0 a 100'),
  opt('profile.alcoholDosesWeek').isFloat({ min: 0, max: 200 }).withMessage('doses de 0 a 200'),
  opt('profile.papEmDia').isBoolean().withMessage('true ou false'),
  body('profile.familyHistoryCancer').optional({ values: 'null' })
    .isArray({ max: FAMILY_CANCER_VALUES.length }).withMessage('lista de até 5 itens'),
  body('profile.familyHistoryCancer.*').isIn(FAMILY_CANCER_VALUES).withMessage('valor desconhecido'),
  body('answers').optional({ values: 'null' }).isObject().withMessage('answers deve ser um objeto')
    .bail()
    .custom((answers) => {
      const keys = Object.keys(answers);
      if (keys.length > quickTest.MAX_ANSWERS) throw new Error(`No máximo ${quickTest.MAX_ANSWERS} respostas`);
      if (keys.some(k => !ANSWER_CODE.test(k))) throw new Error('Código de pergunta inválido');
      return true;
    }),
  // null = "não sei" (conta como respondida, não vira evidência)
  body('answers.*').custom((v) => v === null || ANSWER_VALUES.includes(v))
    .withMessage('Resposta: true, false, 0 a 3, "sim", "não" ou null'),
], { message: 'Campo não permitido' });

const runQuickTest = async (req, res, next) => {
  try {
    const kb = await kbRepository.get();
    const profile = req.body?.profile ?? {};
    const r = quickTest.run(kb, { profile, answers: req.body?.answers ?? {} });
    // Visitante não ouve doença (regra R2): sai pelo patientView
    res.json(patientView.quickTestForVisitor(r, profile));
  } catch (err) {
    if (err.status === 422 && err.fields) {
      return res.status(422).json({ error: err.message, fields: err.fields });
    }
    next(err);
  }
};

const router = express.Router();
router.post('/quick-test', quickTestRules, validate, runQuickTest);

module.exports = { router, guard };
