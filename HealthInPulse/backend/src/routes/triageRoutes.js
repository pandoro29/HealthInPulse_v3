const { Router }    = require('express');
const triageService  = require('../services/triageService');
const patientService = require('../services/patientService');
const patientView    = require('../services/patientView');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

// ─── Controller ──────────────────────────────────────────────
// Tudo que sai daqui passa pelo patientView (regra R2: o paciente não
// recebe nome de doença, nível de risco nem probabilidade).

// Schema da triagem adaptativa (perfil + condições conhecidas).
// Mantém a rota antiga para o frontend antigo não quebrar.
const getQuestions = async (_req, res, next) => {
  try {
    res.json(await triageService.getQuestions());
  } catch (err) { next(err); }
};

const start = async (req, res, next) => {
  try {
    const patient  = await patientService.getProfile(req.user.id);
    const session  = await triageService.startTriage(patient.id);
    res.status(201).json(patientView.triageResponse(session));
  } catch (err) { next(err); }
};

const answer = async (req, res, next) => {
  try {
    const patient = await patientService.getProfile(req.user.id);
    const session = await triageService.answerTriage(
      patient.id,
      req.params.triageId,
      req.body || {},
    );
    res.json(patientView.triageResponse(session));
  } catch (err) { next(err); }
};

const history = async (req, res, next) => {
  try {
    const patient = await patientService.getProfile(req.user.id);
    const page = await triageService.getTriageHistory(patient.id, req.query);
    res.json({ ...page, items: page.items.map(patientView.triageHistoryItem) });
  } catch (err) { next(err); }
};

const getOne = async (req, res, next) => {
  try {
    const patient = await patientService.getProfile(req.user.id);
    const t = await triageService.getTriageById(req.params.triageId, patient.id);
    res.json({
      id: t.id, startedAt: t.startedAt, finishedAt: t.finishedAt, status: t.status,
      view: t.status === 'COMPLETED' ? patientView.triageResultView(t.session) : null,
    });
  } catch (err) { next(err); }
};

// ─── Routes ──────────────────────────────────────────────────

const router = Router();
router.use(authenticate);
router.use(authorize('PATIENT'));

router.get('/questions',          getQuestions);
router.get('/',                   history);
router.post('/start',             start);
router.post('/:triageId/answer',  answer);
router.get('/:triageId',          getOne);

module.exports = router;
