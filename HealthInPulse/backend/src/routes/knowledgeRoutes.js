const { Router } = require('express');
const { body, query, checkExact } = require('express-validator');
const knowledgeService = require('../services/knowledgeService');
const doctorService    = require('../services/doctorService');
const { authenticate, authorize } = require('../middlewares/authMiddleware');
const { validate } = require('../middlewares/validationMiddleware');

// ─── Base da IA (/api/knowledge), só DOCTOR ──────────────────
//   GET   /                         base inteira + editable + campos editáveis
//   GET   /history                  edições (KnowledgeVersion), mais recente primeiro
//   PATCH /conditions/:code         e /prior-rules/:id, /condition-symptoms/:id,
//         /lab-rules/:id, /screening-rules/:id
//   POST  /reset                    volta aos valores de partida
// Corpo do PATCH: { <campo>: valor, ..., changeNote?: 'motivo' }.
// Sem KB_EDIT=true (Render, Docker), PATCH e reset dão 403; a leitura continua.

const sendError = (res, next) => (err) => {
  if (err.status === 422 && err.fields) {
    return res.status(422).json({ error: err.message, fields: err.fields });
  }
  next(err);
};

// Antes da validação: em modo só leitura nem olha o corpo
const requireEditable = (_req, res, next) => {
  try { knowledgeService.assertEditable(); next(); }
  catch (err) { res.status(err.status).json({ error: err.message }); }
};

// Quem editou, para o histórico (nome da médica)
const changedBy = async (req) => {
  try { return (await doctorService.getProfile(req.user.id)).fullName; }
  catch { return req.user.username ?? req.user.id; }
};

// Motivo da edição (vai para KnowledgeVersion.note). Não se chama `note`
// porque ConditionSymptom tem um campo editável `note`.
const noteRule = body('changeNote').optional({ values: 'null' }).isString().isLength({ max: 500 })
  .withMessage('Motivo de até 500 caracteres');

// express-validator a partir da lista de campos de cada entidade:
// campo fora da lista → 422 (checkExact); valor checado pelo mesmo
// checkValue que o service usa.
const rulesFor = (spec) => checkExact([
  ...Object.entries(spec.fields).map(([field, def]) => body(field)
    .optional() // só pula o ausente; null vai para o checkValue (nullable)
    .custom((v) => {
      const msg = knowledgeService.checkValue(def, v);
      if (msg) throw new Error(msg);
      return true;
    })),
  noteRule,
  // (corpo sem campo nenhum: o service responde 422 "Nenhum campo para
  // alterar". Um body().custom aqui faria o checkExact aceitar qualquer campo.)
], { message: 'Campo não editável' });

const router = Router();
router.use(authenticate);
router.use(authorize('DOCTOR'));

router.get('/', async (_req, res, next) => {
  try { res.json(await knowledgeService.getKnowledge()); }
  catch (err) { next(err); }
});

router.get(
  '/history',
  [
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('offset').optional().isInt({ min: 0 }),
    query('entity').optional().isIn(['KB', ...Object.values(knowledgeService.ENTITIES).map(e => e.entity)]),
    query('entityId').optional().isString().isLength({ max: 120 }),
  ],
  validate,
  async (req, res, next) => {
    try { res.json(await knowledgeService.history(req.query)); }
    catch (err) { next(err); }
  },
);

for (const key of knowledgeService.ENTITY_KEYS) {
  const spec = knowledgeService.ENTITIES[key];
  router.patch(`/${key}/:id`, requireEditable, rulesFor(spec), validate, async (req, res, next) => {
    try {
      const { changeNote = null, ...changes } = req.body;
      res.json(await knowledgeService.patch(key, req.params.id, changes, { changedBy: await changedBy(req), note: changeNote }));
    } catch (err) { sendError(res, next)(err); }
  });
}

router.post('/reset', requireEditable, [noteRule], validate, async (req, res, next) => {
  try {
    res.json(await knowledgeService.reset({ changedBy: await changedBy(req), note: req.body?.changeNote || undefined }));
  } catch (err) { sendError(res, next)(err); }
});

module.exports = router;
