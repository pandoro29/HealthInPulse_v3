// ─── Perfil clínico a partir do cadastro ───────────────────────────
// Helpers que montam o perfil usado pelo motor (idade, sexo, IMC) a
// partir dos campos do Patient. Antes viviam dentro do triageService;
// saíram para serem usados também pelos serviços de risco.

const ageFromDob = (dob) => {
  const ms = Date.now() - new Date(dob).getTime();
  return Math.floor(ms / (365.25 * 24 * 3600 * 1000));
};

const mapGender = (g) => {
  if (!g) return null;
  const s = String(g).toLowerCase();
  if (['m', 'male', 'masculino', 'h'].includes(s)) return 'male';
  if (['f', 'female', 'feminino'].includes(s))     return 'female';
  return s;
};

const computeBmi = (heightCm, weightKg) => {
  if (!heightCm || !weightKg) return null;
  const h = heightCm > 3 ? heightCm / 100 : heightCm; // aceita m ou cm
  if (!h) return null;
  return Number((weightKg / (h * h)).toFixed(1));
};

// ─── Normalização do perfil para as regras (PriorRule.when etc.) ────
// O formulário e o teste público mandam valores crus ('true', '12,5',
// '', null). As regras comparam com igualdade estrita (`papEmDia eq
// false`) e números (`quitYears lte 15`), então tudo passa por aqui antes
// do motor oncológico. Devolve uma cópia; campo vazio some do objeto
// (regra com campo ausente não aplica fator nenhum).
//
// quitYears: "0 = ainda fuma" (contrato do data/oncology.js). Se a pessoa
// fuma ou fumou (smoker true) e deixou em branco, vale 0 (fumante atual):
// sem isso a regra de rastreio do pulmão (quitYears ≤ 15) e o fator
// "fuma atualmente" do colo do útero nunca disparariam.
const BOOLEAN_FIELDS = ['smoker', 'papEmDia', 'familyHistoryDm', 'familyHistoryCv'];
const NUMBER_FIELDS  = ['age', 'bmi', 'height', 'weight', 'packYears', 'quitYears', 'alcoholDosesWeek'];
const FAMILY_CANCER_VALUES = ['colorretal', 'mama', 'ovario', 'prostata', 'pulmao'];

const toBool = (v) => {
  if (v === true || v === false) return v;
  if (v === 1 || v === 0) return v === 1;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (['true', '1', 'sim', 's', 'yes'].includes(s)) return true;
    if (['false', '0', 'nao', 'n', 'no'].includes(s)) return false;
  }
  return undefined;
};

const toNumber = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

const toFamilyList = (v) => {
  const list = Array.isArray(v) ? v : (typeof v === 'string' && v.trim() ? v.split(',') : []);
  const out = [];
  for (const x of list) {
    const s = String(x).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (FAMILY_CANCER_VALUES.includes(s) && !out.includes(s)) out.push(s);
  }
  return out;
};

const normalizeProfile = (raw = {}) => {
  const p = { ...(raw || {}) };
  for (const f of BOOLEAN_FIELDS) {
    if (!(f in p)) continue;
    const b = toBool(p[f]);
    if (b === undefined) delete p[f]; else p[f] = b;
  }
  for (const f of NUMBER_FIELDS) {
    if (!(f in p)) continue;
    const n = toNumber(p[f]);
    if (n === undefined) delete p[f]; else p[f] = n;
  }
  if ('sex' in p) {
    const s = mapGender(p.sex);
    if (s) p.sex = s; else delete p.sex;
  }
  p.familyHistoryCancer = toFamilyList(p.familyHistoryCancer);
  if (p.bmi == null) {
    const bmi = computeBmi(p.height, p.weight);
    if (bmi != null) p.bmi = bmi;
  }
  if (p.smoker === true && p.quitYears == null) p.quitYears = 0;
  return p;
};

module.exports = { ageFromDob, mapGender, computeBmi, normalizeProfile, FAMILY_CANCER_VALUES };
