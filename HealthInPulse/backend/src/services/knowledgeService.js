// ─── Base da IA: leitura e edição da base de conhecimento ───────────
// GET /api/knowledge, PATCH /api/knowledge/<entidade>/:id,
// GET /api/knowledge/history e POST /api/knowledge/reset (só DOCTOR).
//
// Cada PATCH roda numa transação: lê a linha, aplica só os campos
// permitidos para aquela entidade (lista abaixo), grava uma linha de
// KnowledgeVersion por campo alterado (valor antigo e novo, em JSON) e,
// depois do commit, chama kbRepository.invalidate(). A próxima triagem,
// teste rápido ou painel de risco já usa o kb novo (versão nova).
//
// Fechado por padrão: só KB_EDIT=true (ou 1/yes/on) libera PATCH e reset.
// Sem a variável (Render, Docker, CI) a base é só leitura e eles dão 403;
// na demo pública qualquer um pode se cadastrar como médico. O setup
// (scripts/setup.mjs) grava KB_EDIT=true no .env local e no do stand.
//
// Fábrica createKnowledgeService({ prisma, repo }) para os testes usarem
// outro banco; o módulo exporta também a instância do app.

const { isDeepStrictEqual } = require('node:util');
const { KB_TABLES, fromRow } = require('./clinical/kb/kbTables');
const { listRedFlagDefinitions } = require('./clinical/redFlags');

const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

// ─── Edição ligada? ─────────────────────────────────────────────────
const isEditable = () => ['true', '1', 'yes', 'on'].includes(String(process.env.KB_EDIT ?? '').trim().toLowerCase());
const assertEditable = () => {
  if (!isEditable()) {
    throw httpError(403, 'A base de conhecimento está em modo só leitura neste servidor. '
      + 'Para editar, rode com KB_EDIT=true (o `npm run setup` já grava isso no .env local).');
  }
};

// ─── Campos editáveis por entidade ──────────────────────────────────
// type: prob (0 < x < 1), number, int, bool, string. nullable aceita null.
const prob   = (o = {}) => ({ type: 'prob', ...o });
const num    = (min, max, o = {}) => ({ type: 'number', min, max, ...o });
const int    = (min, max, o = {}) => ({ type: 'int', min, max, ...o });
const bool   = () => ({ type: 'bool' });
const string = (max, o = {}) => ({ type: 'string', max, ...o });

const ENTITIES = {
  conditions: {
    model: 'condition', entity: 'Condition', key: 'code', label: 'condição',
    fields: {
      label:          string(120),
      description:    string(2000, { nullable: true }),
      basePrior:      prob(),
      maxPrior:       num(0, 1, { minExclusive: true }),
      alertThreshold: prob(),
      watchThreshold: prob(),
      minAge:         int(0, 120, { nullable: true }),
      active:         bool(),
    },
  },
  'prior-rules': {
    model: 'priorRule', entity: 'PriorRule', key: 'id', label: 'regra de prior',
    fields: {
      label:      string(200),
      amount:     num(-1, 100), // conferido de novo pelo `effect` (crossCheck)
      modifiable: bool(),
      active:     bool(),
    },
  },
  'condition-symptoms': {
    model: 'conditionSymptom', entity: 'ConditionSymptom', key: 'id', label: 'sinal da condição',
    fields: {
      pSx:   prob(),                                // sensibilidade: P(sinal | doença)
      pNoSx: prob(),                                // 1 − especificidade: P(sinal | sem a doença)
      lrPos: num(0, 1000, { minExclusive: true }),  // atalho: muda pNoSx = pSx / LR+
      note:  string(1000, { nullable: true }),
    },
  },
  'lab-rules': {
    model: 'labRule', entity: 'LabRule', key: 'id', label: 'regra de exame',
    fields: {
      label:        string(200),
      threshold:    num(-1e6, 1e6, { nullable: true }),
      weight:       num(0, 5, { minExclusive: true }),
      emitNegative: bool(),
      maxAgeDays:   int(1, 3650),
      active:       bool(),
    },
  },
  'screening-rules': {
    model: 'screeningRule', entity: 'ScreeningRule', key: 'id', label: 'regra de rastreamento',
    fields: {
      exam:           string(200),
      recommendation: string(2000),
      minAge:         int(0, 120, { nullable: true }),
      maxAge:         int(0, 120, { nullable: true }),
      intervalMonths: int(1, 240, { nullable: true }),
      priority:       int(0, 100),
      active:         bool(),
    },
  },
};
const ENTITY_KEYS = Object.keys(ENTITIES);
const tableOf = (spec) => KB_TABLES.find(t => t.model === spec.model);

// Confere um valor contra a definição do campo. Devolve a mensagem de
// erro ou null. Usado pela rota (express-validator) e pelo service.
const checkValue = (def, v) => {
  if (v === null) return def.nullable ? null : 'Não pode ser vazio';
  switch (def.type) {
    case 'bool':
      return typeof v === 'boolean' ? null : 'Use true ou false';
    case 'string':
      if (typeof v !== 'string') return 'Deve ser texto';
      if (!v.trim() && !def.nullable) return 'Não pode ser vazio';
      return v.length > def.max ? `No máximo ${def.max} caracteres` : null;
    case 'prob':
      return typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1
        ? null : 'Probabilidade entre 0 e 1 (sem incluir 0 e 1)';
    case 'int':
    case 'number': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return 'Deve ser um número';
      if (def.type === 'int' && !Number.isInteger(v)) return 'Deve ser um número inteiro';
      const lowOk = def.minExclusive ? v > def.min : v >= def.min;
      if (!lowOk || v > def.max) {
        return `Entre ${def.min} e ${def.max}${def.minExclusive ? ` (maior que ${def.min})` : ''}`;
      }
      return null;
    }
    default:
      return 'Campo desconhecido';
  }
};

// Campos do corpo → [{ field, message }] (vazio = ok)
const validateChanges = (spec, changes) => {
  const errors = [];
  const entries = Object.entries(changes ?? {});
  if (!entries.length) errors.push({ field: '', message: 'Nenhum campo para alterar' });
  for (const [f, v] of entries) {
    const def = spec.fields[f];
    if (!def) { errors.push({ field: f, message: 'Campo não editável' }); continue; }
    const msg = checkValue(def, v);
    if (msg) errors.push({ field: f, message: msg });
  }
  return errors;
};

// ─── Regras entre campos (com a linha atual já mesclada) ────────────
const round = (x, d) => Number(x.toFixed(d));

// ConditionSymptom: o motor usa pSx/pNoSx; o lrPos gravado dá o bônus do
// modo alvo da fase crônica. Os dois ficam coerentes:
//   - mudou pSx ou pNoSx → lrPos = pSx / pNoSx (2 casas, como o seed);
//   - mandou lrPos (sem pNoSx) → pNoSx = pSx / lrPos.
const deriveConditionSymptom = (current, data) => {
  if ('lrPos' in data && 'pNoSx' in data) {
    throw httpError(422, 'Dados inválidos', { fields: [{ field: 'lrPos', message: 'Mande pNoSx ou lrPos, não os dois' }] });
  }
  const out = { ...data };
  const pSx = out.pSx ?? current.pSx;
  if ('lrPos' in out) {
    out.pNoSx = round(pSx / out.lrPos, 6);
  } else if ('pSx' in out || 'pNoSx' in out) {
    out.lrPos = round(pSx / (out.pNoSx ?? current.pNoSx), 2);
  }
  return out;
};

const crossCheck = (spec, row) => {
  const errors = [];
  const add = (field, message) => errors.push({ field, message });
  if (spec.model === 'condition') {
    if (row.basePrior > row.maxPrior) add('basePrior', 'O prior base não pode passar do prior máximo');
    if (row.alertThreshold != null && row.watchThreshold != null && row.watchThreshold >= row.alertThreshold) {
      add('watchThreshold', 'O limiar de atenção deve ser menor que o de investigação');
    }
  }
  if (spec.model === 'priorRule') {
    const a = row.amount;
    if (row.effect === 'multiply' && !(a > 0 && a <= 100)) add('amount', 'Multiplicador deve ser maior que 0 (até 100)');
    if (row.effect === 'set' && !(a > 0 && a < 1)) add('amount', 'Probabilidade entre 0 e 1');
    if (row.effect === 'add' && !(a >= -1 && a <= 1)) add('amount', 'Soma entre -1 e 1');
  }
  if (spec.model === 'conditionSymptom') {
    if (!(row.pNoSx > 0 && row.pNoSx < 1)) add('lrPos', 'Com esse LR+, 1 − especificidade sai de (0, 1): ajuste a sensibilidade');
  }
  if (spec.model === 'labRule' && row.operator === 'positive' && row.threshold != null) {
    add('threshold', 'Regra de positivo/negativo não usa limiar');
  }
  if (spec.model === 'screeningRule' && row.minAge != null && row.maxAge != null && row.minAge > row.maxAge) {
    add('minAge', 'A idade mínima não pode passar da máxima');
  }
  if (errors.length) throw httpError(422, 'Dados inválidos', { fields: errors });
};

const toJson = (v) => (v === undefined ? null : JSON.stringify(v));
const fromJson = (s) => { try { return s == null ? null : JSON.parse(s); } catch { return s; } };

// ─── Serviço ────────────────────────────────────────────────────────
const createKnowledgeService = ({ prisma, repo }) => {
  // Base inteira + o que a tela precisa saber para editar
  const getKnowledge = async () => {
    const kb = await repo.get();
    return {
      version:  kb.version,
      editable: isEditable(),
      editableFields: Object.fromEntries(ENTITY_KEYS.map(k => [k, Object.keys(ENTITIES[k].fields)])),
      sources:           kb.sources,
      conditions:        kb.conditions,
      priorRules:        kb.priorRules,
      symptoms:          kb.symptoms,
      conditionSymptoms: kb.conditionSymptoms,
      labRules:          kb.labRules,
      screeningRules:    kb.screeningRules,
      redFlags:          listRedFlagDefinitions(), // ficam em código (redFlags.js); a tela só lista
    };
  };

  // patch('conditions' | 'prior-rules' | ..., id, { campo: valor }, { changedBy, note })
  const patch = async (entityKey, id, changes, { changedBy = null, note = null } = {}) => {
    assertEditable();
    const spec = ENTITIES[entityKey];
    if (!spec) throw httpError(404, 'Entidade desconhecida');
    const errors = validateChanges(spec, changes);
    if (errors.length) throw httpError(422, 'Dados inválidos', { fields: errors });

    const result = await prisma.$transaction(async (tx) => {
      const where = { [spec.key]: id };
      const current = await tx[spec.model].findUnique({ where });
      if (!current) throw httpError(404, `Não existe ${spec.label} com o id ${String(id).slice(0, 80)}`);

      const data = spec.model === 'conditionSymptom' ? deriveConditionSymptom(current, changes) : { ...changes };
      crossCheck(spec, { ...current, ...data });

      const fields = Object.keys(data).filter(f => !isDeepStrictEqual(current[f], data[f]));
      if (!fields.length) return { row: current, changes: [], version: null };

      const row = await tx[spec.model].update({
        where, data: Object.fromEntries(fields.map(f => [f, data[f]])),
      });
      const out = [];
      let version = null;
      for (const f of fields) {
        const v = await tx.knowledgeVersion.create({
          data: {
            entity: spec.entity, entityId: id, field: f,
            oldValue: toJson(current[f]), newValue: toJson(row[f]), note, changedBy,
          },
        });
        version = v.version;
        out.push({ field: f, oldValue: current[f], newValue: row[f], version });
      }
      return { row, changes: out, version };
    });

    // Depois do commit: o próximo get() lê a base nova
    if (result.changes.length) repo.invalidate();
    return {
      entity:  entityKey,
      id,
      version: result.version ?? await repo.currentVersion(),
      changes: result.changes,
      item:    fromRow(tableOf(spec), result.row),
    };
  };

  // Histórico de edições (mais recente primeiro)
  const history = async ({ limit = 50, offset = 0, entity = null, entityId = null } = {}) => {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const skip = Math.max(Number(offset) || 0, 0);
    // ?entity=a&entity=b chega como lista: só texto vira filtro
    const where = {
      ...(typeof entity === 'string' && entity && { entity }),
      ...(typeof entityId === 'string' && entityId && { entityId }),
    };
    const [total, rows] = await prisma.$transaction([
      prisma.knowledgeVersion.count({ where }),
      prisma.knowledgeVersion.findMany({ where, orderBy: { version: 'desc' }, take, skip }),
    ]);
    return {
      total, limit: take, offset: skip,
      items: rows.map(r => ({ ...r, oldValue: fromJson(r.oldValue), newValue: fromJson(r.newValue) })),
    };
  };

  // Volta tudo aos valores de partida do JS (o histórico fica)
  const reset = async ({ changedBy = null, note } = {}) => {
    assertEditable();
    const { version } = await repo.resetToDefaults({ changedBy, ...(note && { note }) });
    return { version };
  };

  return { getKnowledge, patch, history, reset };
};

// ─── Instância do app (criada no primeiro uso) ──────────────────────
let appService = null;
const service = () => {
  if (!appService) {
    appService = createKnowledgeService({
      prisma: require('../config/database'),
      repo:   require('./clinical/kb/kbRepository'),
    });
  }
  return appService;
};

module.exports = {
  createKnowledgeService,
  ENTITIES,
  ENTITY_KEYS,
  checkValue,
  validateChanges,
  isEditable,
  assertEditable,
  getKnowledge: (...a) => service().getKnowledge(...a),
  patch:        (...a) => service().patch(...a),
  history:      (...a) => service().history(...a),
  reset:        (...a) => service().reset(...a),
};
