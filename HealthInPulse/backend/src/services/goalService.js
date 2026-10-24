const prisma = require('../config/database');
const coinService = require('./coinService');
const { goalTemplates, sourceShort } = require('./clinical/data/prevention');

const computeProgress = (goal, current) => {
  if (current == null) return goal.progress ?? 0;
  if (goal.targetCmp === 'lte' && goal.targetValue != null) {
    // Quanto menor melhor — progresso é 100 quando current <= target
    if (current <= goal.targetValue) return 100;
    // Se baseline > target, progresso é o quanto andou em direção ao alvo a partir de current inicial
    const startedFrom = goal.rangeMax ?? (goal.targetValue * 1.6);
    const total       = startedFrom - goal.targetValue;
    const done        = startedFrom - current;
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  }
  if (goal.targetCmp === 'gte' && goal.targetValue != null) {
    if (current >= goal.targetValue) return 100;
    const startedFrom = goal.rangeMin ?? 0;
    const total       = goal.targetValue - startedFrom;
    const done        = current - startedFrom;
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  }
  if (goal.targetCmp === 'between' && goal.rangeMin != null && goal.rangeMax != null) {
    if (current >= goal.rangeMin && current <= goal.rangeMax) return 100;
    // Distância proporcional ao centro da faixa
    const center = (goal.rangeMin + goal.rangeMax) / 2;
    const halfRange = (goal.rangeMax - goal.rangeMin) / 2;
    const dist = Math.abs(current - center);
    return Math.max(0, Math.min(100, Math.round(100 * (1 - (dist - halfRange) / Math.max(1, center)))));
  }
  return goal.progress ?? 0;
};

// A fonte vai junto, em texto curto (as das metas não citam doença)
const listGoals = async (patientId, { status } = {}) => {
  const where = { patientId, ...(status ? { status } : {}) };
  const goals = await prisma.healthGoal.findMany({
    where,
    orderBy: [{ status: 'asc' }, { startedAt: 'desc' }],
  });
  return goals.map(g => ({ ...g, sourceLabel: g.sourceCode ? sourceShort[g.sourceCode] ?? null : null }));
};

const createGoal = async (patientId, data) => {
  return prisma.healthGoal.create({
    data: {
      patientId,
      title:       data.title,
      description: data.description || null,
      metric:      data.metric || 'custom',
      targetCmp:   data.targetCmp || 'lte',
      targetValue: data.targetValue ?? null,
      rangeMin:    data.rangeMin    ?? null,
      rangeMax:    data.rangeMax    ?? null,
      current:     data.current     ?? null,
      progress:    0,
      coinsReward: data.coinsReward ?? 50,
      source:      data.source || 'manual',
    },
  });
};

/**
 * Atualiza o valor atual da meta. Se atingir 100% e ainda estiver ACTIVE,
 * marca como DONE e credita os coins.
 */
const updateProgress = async (goalId, current, patientId) => {
  const goal = await prisma.healthGoal.findFirst({
    where: { id: goalId, patientId },
  });
  if (!goal) throw Object.assign(new Error('Meta não encontrada'), { status: 404 });

  const progress = computeProgress(goal, current);
  const justFinished = goal.status === 'ACTIVE' && progress >= 100;

  const updated = await prisma.healthGoal.update({
    where: { id: goalId },
    data: {
      current,
      progress,
      status:      justFinished ? 'DONE'           : goal.status,
      completedAt: justFinished ? new Date()       : goal.completedAt,
    },
  });

  if (justFinished) {
    await coinService.credit(
      patientId,
      goal.coinsReward,
      `Meta concluída: ${goal.title}`,
      { refType: 'goal', refId: goal.id },
    );
  }

  return { goal: updated, justCompleted: justFinished };
};

// ─── Metas a partir da triagem ─────────────────────────────────────
// Só nasce meta de um modelo de data/prevention.js, e todo modelo tem
// fonte (regra R1) ou vem do próximo passo da triagem (consulta). Meta
// igual a uma que já está ativa não é criada de novo.
//
// ctx = { profile (normalizado), wearable (snapshot da pulseira), nextStep }
const generateGoalsFromTriage = async (patientId, ctx, triageId) => {
  const safe = { profile: ctx?.profile ?? {}, wearable: ctx?.wearable ?? {}, nextStep: ctx?.nextStep ?? null };
  const active = await prisma.healthGoal.findMany({
    where:  { patientId, status: 'ACTIVE', templateCode: { not: null } },
    select: { templateCode: true },
  });
  const already = new Set(active.map(g => g.templateCode));

  const created = [];
  for (const t of goalTemplates) {
    if (already.has(t.code) || !t.when(safe)) continue;
    const goal = await prisma.healthGoal.create({
      data: {
        patientId, ...t.build(safe),
        source: 'triage', templateCode: t.code, sourceCode: t.sourceCode,
        progress: 0, status: 'ACTIVE',
      },
    });
    created.push(goal);
  }

  // Bônus de coins por completar triagem
  await coinService.credit(
    patientId,
    20,
    'Bônus: triagem concluída',
    { refType: 'triage', refId: triageId || null },
  );

  return created;
};

module.exports = { listGoals, createGoal, updateProgress, generateGoalsFromTriage, computeProgress };
