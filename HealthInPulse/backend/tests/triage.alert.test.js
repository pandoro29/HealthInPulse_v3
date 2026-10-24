// ─── triage:alert só para os médicos vinculados ─────────────────────
// O alerta leva dado clínico (nível, cânceres em INVESTIGAR). Ele não
// pode ir para a sala `doctors` inteira: só para `user:<userId>` de cada
// médico com DoctorPatient para aquele paciente.

const test   = require('node:test');
const assert = require('node:assert/strict');

const { emitCompleted } = require('../src/services/triageService');

const fakeIo = () => {
  const sent = [];
  return { sent, to: (room) => ({ emit: (event, payload) => sent.push({ room, event, payload }) }) };
};
const fakeDb = (doctorUserIds) => ({
  patient:       { findUnique: async () => ({ userId: 'u-paciente' }) },
  doctorPatient: { findMany: async ({ where }) => {
    assert.equal(where.patientId, 'p1');
    return doctorUserIds.map(userId => ({ doctor: { userId } }));
  } },
});

test('alerta com câncer vai só para as salas dos médicos vinculados', async () => {
  const io = fakeIo();
  await emitCompleted('p1', 't1', 'HIGH', 'r1', false, { oncology: ['CA_MAMA'] },
    { io, db: fakeDb(['u-medica-1', 'u-medica-2', 'u-medica-1']) });
  const alerts = io.sent.filter(m => m.event === 'triage:alert');
  assert.deepEqual(alerts.map(a => a.room).sort(), ['user:u-medica-1', 'user:u-medica-2']);
  assert.deepEqual(alerts[0].payload.oncology, ['CA_MAMA']);
  assert.ok(!io.sent.some(m => m.room === 'doctors'), 'nada na sala doctors');
  // o paciente recebe o "concluído" na sala dele
  assert.deepEqual(io.sent.filter(m => m.event === 'triage:completed').map(m => m.room), ['user:u-paciente']);
});

test('sem médico vinculado, ninguém recebe o alerta; nível baixo não alerta', async () => {
  const io = fakeIo();
  await emitCompleted('p1', 't1', 'CRITICAL', 'r1', true, {}, { io, db: fakeDb([]) });
  assert.equal(io.sent.filter(m => m.event === 'triage:alert').length, 0);
  const io2 = fakeIo();
  await emitCompleted('p1', 't1', 'MODERATE', 'r1', false, {}, { io: io2, db: fakeDb(['u-medica-1']) });
  assert.equal(io2.sent.filter(m => m.event === 'triage:alert').length, 0);
});
