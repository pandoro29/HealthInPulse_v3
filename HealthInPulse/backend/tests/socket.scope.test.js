// ─── Sinais vitais em tempo real só para os médicos vinculados ──────
// `vital:new` e `patient:critical` levam dado clínico. Eles saem por
// doctorService.emitToLinkedDoctors, que manda só para `user:<userId>`
// de cada médico com DoctorPatient, nunca para a sala `doctors`.

const test   = require('node:test');
const assert = require('node:assert/strict');

const { emitToLinkedDoctors, linkedDoctorUserIds } = require('../src/services/doctorService');

const fakeIo = () => {
  const sent = [];
  return { sent, to: (room) => ({ emit: (event, payload) => sent.push({ room, event, payload }) }) };
};
const fakeDb = (doctorUserIds) => ({
  doctorPatient: { findMany: async ({ where }) => {
    assert.equal(where.patientId, 'p1');
    return doctorUserIds.map(userId => ({ doctor: { userId } }));
  } },
});

test('vital:new vai só para a sala de cada médico vinculado (sem repetir)', async () => {
  const io = fakeIo();
  await emitToLinkedDoctors('p1', 'vital:new', { patientId: 'p1', vital: { heartRate: 80 } },
    { io, db: fakeDb(['u-medica', 'u-medico', 'u-medica']) });
  assert.deepEqual(io.sent.map(m => m.room).sort(), ['user:u-medica', 'user:u-medico']);
  assert.ok(io.sent.every(m => m.event === 'vital:new' && m.payload.vital.heartRate === 80));
  assert.ok(!io.sent.some(m => m.room === 'doctors'));
});

test('sem vínculo ninguém recebe; erro do socket não derruba quem chamou', async () => {
  const io = fakeIo();
  await emitToLinkedDoctors('p1', 'patient:critical', {}, { io, db: fakeDb([]) });
  assert.equal(io.sent.length, 0);
  const broken = { to: () => { throw new Error('socket fora'); } };
  await assert.doesNotReject(emitToLinkedDoctors('p1', 'patient:critical', {}, { io: broken, db: fakeDb(['u']) }));
  assert.deepEqual(await linkedDoctorUserIds('p1', fakeDb(['a', 'a', 'b'])), ['a', 'b']);
});
