const { Router }    = require('express');
const prisma         = require('../config/database');
const { getIO }      = require('../config/socket');
const patientService = require('../services/patientService');
const doctorService  = require('../services/doctorService');
const { authenticate, authorize } = require('../middlewares/authMiddleware');
const { body } = require('express-validator');
const { validate } = require('../middlewares/validationMiddleware');

// ─── Service ─────────────────────────────────────────────────

const create = async ({ patientId, doctorId, scheduledAt, duration = 30, notes }) => {
  // Verifica vínculo
  const link = await prisma.doctorPatient.findUnique({
    where: { doctorId_patientId: { doctorId, patientId } },
  });
  if (!link) throw Object.assign(new Error('Médico não vinculado ao paciente'), { status: 403 });

  // Verifica conflito de agenda do médico
  const conflict = await prisma.appointment.findFirst({
    where: {
      doctorId,
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
      scheduledAt: {
        gte: new Date(new Date(scheduledAt).getTime() - duration * 60000),
        lte: new Date(new Date(scheduledAt).getTime() + duration * 60000),
      },
    },
  });
  if (conflict) throw Object.assign(new Error('Médico já possui consulta neste horário'), { status: 409 });

  const appointment = await prisma.appointment.create({
    data: { patientId, doctorId, scheduledAt: new Date(scheduledAt), duration, notes },
    include: {
      patient: { select: { fullName: true } },
      doctor:  { select: { fullName: true, specialty: true } },
    },
  });

  // Notifica médico em tempo real. A sala é por User (`user:<userId>`,
  // config/socket.js), não pelo id do Doctor.
  try {
    const doctor = await prisma.doctor.findUnique({ where: { id: doctorId }, select: { userId: true } });
    if (doctor) getIO().to(`user:${doctor.userId}`).emit('appointment:new', appointment);
  } catch (_) {}

  return appointment;
};

const list = async ({ patientId, doctorId, status, page = 1, limit = 20 }) => {
  const where = {
    ...(patientId ? { patientId } : {}),
    ...(doctorId  ? { doctorId  } : {}),
    ...(status    ? { status    } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.appointment.count({ where }),
    prisma.appointment.findMany({
      where,
      skip:    (Number(page) - 1) * Number(limit),
      take:    Number(limit),
      orderBy: { scheduledAt: 'asc' },
      include: {
        patient: { select: { fullName: true, avatarUrl: true } },
        doctor:  { select: { fullName: true, specialty: true, avatarUrl: true } },
      },
    }),
  ]);

  return { total, page, limit, items };
};

// Transições permitidas: papel → status atual → próximos status.
// Status (String no schema): SCHEDULED (padrão), CONFIRMED, COMPLETED,
// CANCELLED. COMPLETED e CANCELLED são finais. O paciente só cancela; o
// médico confirma, conclui (só depois de confirmar) ou cancela.
const TRANSITIONS = {
  PATIENT: {
    SCHEDULED: ['CANCELLED'],
    CONFIRMED: ['CANCELLED'],
  },
  DOCTOR: {
    SCHEDULED: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['COMPLETED', 'CANCELLED'],
  },
};

const updateStatus = async (appointmentId, actor, { status, notes }) => {
  const appt = await prisma.appointment.findUnique({
    where:   { id: appointmentId },
    // userId de cada lado: as salas do socket são `user:<userId>`
    include: { patient: { select: { userId: true } }, doctor: { select: { userId: true } } },
  });
  if (!appt) throw Object.assign(new Error('Consulta não encontrada'), { status: 404 });

  // Só as duas partes da consulta mexem nela, cada uma do seu lado: o
  // médico pela agenda dele, o paciente pela consulta dele. Médico de outra
  // agenda (ou paciente de outra consulta) leva 403, como o assertLink.
  const party = actor.role === 'DOCTOR' ? appt.doctor.userId : appt.patient.userId;
  if (party !== actor.id) throw Object.assign(new Error('Acesso negado'), { status: 403 });

  // Transição a partir do status atual (409: o estado atual não permite)
  if (!(TRANSITIONS[actor.role]?.[appt.status] ?? []).includes(status)) {
    throw Object.assign(
      new Error(`Não é possível mudar a consulta de ${appt.status} para ${status}`),
      { status: 409 },
    );
  }

  // Só o médico escreve em `notes` (o frontend do paciente não manda; se
  // vier, é ignorado)
  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data:  { status, ...(actor.role === 'DOCTOR' && notes ? { notes } : {}) },
    include: {
      patient: { select: { fullName: true } },
      doctor:  { select: { fullName: true } },
    },
  });

  // Notifica a outra parte
  try {
    const io = getIO();
    io.to(`user:${appt.patient.userId}`).emit('appointment:updated', updated);
    io.to(`user:${appt.doctor.userId}`).emit('appointment:updated',  updated);
  } catch (_) {}

  return updated;
};

// Filtros da listagem que vêm da query. patientId/doctorId nunca vêm de
// fora: antes `?patientId=<outro>` trocava o dono da lista (IDOR).
const listFilters = ({ status, page, limit } = {}) => ({
  status: typeof status === 'string' ? status : undefined, page, limit,
});

const CREATE_FIELDS = ['doctorId', 'scheduledAt', 'duration', 'notes'];
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj?.[k] !== undefined).map(k => [k, obj[k]]));

// ─── Router ──────────────────────────────────────────────────

const router = Router();
router.use(authenticate);

// Paciente: agenda consulta
router.post(
  '/',
  authorize('PATIENT'),
  [
    body('doctorId').isUUID(),
    body('scheduledAt').isISO8601(),
    body('duration').optional().isInt({ min: 15, max: 120 }).toInt(),
    body('notes').optional({ values: 'null' }).isString().isLength({ max: 1000 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      const patient = await patientService.getProfile(req.user.id);
      // Só os campos do agendamento vêm do corpo; o paciente é sempre o do
      // token (antes `patientId` no corpo marcava consulta em nome de outro)
      res.status(201).json(
        await create({ ...pick(req.body, CREATE_FIELDS), patientId: patient.id }),
      );
    } catch (e) { next(e); }
  },
);

// Paciente: lista suas consultas
router.get('/my', authorize('PATIENT'), async (req, res, next) => {
  try {
    const patient = await patientService.getProfile(req.user.id);
    res.json(await list({ ...listFilters(req.query), patientId: patient.id }));
  } catch (e) { next(e); }
});

// Médico: lista consultas da sua agenda
router.get('/doctor', authorize('DOCTOR'), async (req, res, next) => {
  try {
    const doctor = await doctorService.getProfile(req.user.id);
    res.json(await list({ ...listFilters(req.query), doctorId: doctor.id }));
  } catch (e) { next(e); }
});

// Médico: confirma / cancela
router.patch(
  '/:id/status',
  authorize('DOCTOR', 'PATIENT'),
  [
    body('status').isIn(['CONFIRMED', 'CANCELLED', 'COMPLETED']),
    body('notes').optional({ values: 'null' }).isString().isLength({ max: 1000 }),
  ],
  validate,
  async (req, res, next) => {
    try {
      res.json(await updateStatus(req.params.id, req.user, req.body));
    } catch (e) { next(e); }
  },
);

module.exports = { router, create, list };
