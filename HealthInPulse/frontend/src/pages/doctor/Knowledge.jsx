// ─── Base da IA (/doctor/knowledge) ──────────────────────────
// O conhecimento clínico que o motor usa, lido do banco (/api/knowledge):
// condições (prior e limiares), fatores de risco (PriorRule), sinais e
// exames (ConditionSymptom: Sens, 1−Esp, LR+, LR−), regras de leitura de
// exame, rastreamento e fontes. A médica edita na linha; cada PATCH sobe
// a versão, entra no histórico e muda o resultado na hora ("Simular em
// paciente" mostra o antes e o depois).
// Sem KB_EDIT=true no servidor a base é só leitura (`editable:false` no
// GET, 403 no PATCH): a página mostra o aviso e não abre os campos.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  Database, History, RotateCcw, Lock, FlaskConical, ExternalLink, Users, ArrowRight,
  RefreshCw, AlertTriangle, BookMarked, ShieldAlert, ChevronDown,
} from 'lucide-react';
import { knowledgeService, doctorService } from '@/services';
import EditableCell, { Toggle, parseNumber } from '@/components/knowledge/EditableCell';
import { safeUrl } from '@/lib/url';
import {
  oncoLevel, displayRelativeRisk, shortCitation, formatInterval, EVIDENCE_KIND, SCREENING_KIND,
} from '@/lib/risk';

// ─── Números ─────────────────────────────────────────────────
const nf = (n, max = 2) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: max });
const round = (n, sig = 8) => Number(Number(n).toPrecision(sig));

// Probabilidade em %, com casas suficientes para priors pequenos (0,157%)
const pct = (p) => (p == null ? '—' : `${nf(p * 100, p * 100 < 1 ? 3 : 2)}%`);
const pctInput = (p) => (p == null ? '' : String(round(p * 100, 6)).replace('.', ','));
const parsePct = (text) => {
  const n = parseNumber(String(text).replace('%', ''));
  if (n == null) throw new Error('Informe um valor em %');
  return round(n / 100);
};
const parsePctNullable = (text) => (String(text).trim() === '' ? null : parsePct(text));
const parseProb = (text) => {
  const t = String(text).trim();
  if (t.endsWith('%')) return parsePct(t);
  const n = parseNumber(t);
  if (n == null) throw new Error('Informe um valor entre 0 e 1');
  return n;
};
const parseInt0 = (nullable) => (text) => {
  const n = parseNumber(text);
  if (n == null) { if (nullable) return null; throw new Error('Informe um número inteiro'); }
  if (!Number.isInteger(n)) throw new Error('Use um número inteiro');
  return n;
};
const parseRequired = (text) => {
  const n = parseNumber(text);
  if (n == null) throw new Error('Informe um número');
  return n;
};

const lrNeg = (cs) => (cs.pSx != null && cs.pNoSx != null && cs.pNoSx < 1 ? (1 - cs.pSx) / (1 - cs.pNoSx) : null);

// ─── Rótulos ─────────────────────────────────────────────────
const CATEGORY = [
  { key: 'ONCOLOGICA', label: 'Câncer' },
  { key: 'CRONICA',    label: 'Crônicas' },
];
const RULE_KIND = { BASELINE: 'Base (idade/sexo)', RISK_FACTOR: 'Fator de risco', ADJUST: 'Ajuste' };
const OPERATOR  = { gte: '≥', gt: '>', lte: '≤', lt: '<', eq: '=', neq: '≠', in: 'em', includes: 'inclui', truthy: 'sim', falsy: 'não', positive: 'positivo' };
const SEX       = { male: 'homens', female: 'mulheres' };
const ENTITY    = {
  KB: 'Base', Condition: 'Condição', PriorRule: 'Fator', ConditionSymptom: 'Sinal/exame',
  LabRule: 'Regra de exame', ScreeningRule: 'Rastreamento',
};
const FIELD = {
  basePrior: 'prior base', maxPrior: 'prior máximo', alertThreshold: 'limiar de investigar',
  watchThreshold: 'limiar de atenção', minAge: 'idade mínima', maxAge: 'idade máxima', active: 'ativa',
  amount: 'valor', modifiable: 'modificável', pSx: 'Sens', pNoSx: '1−Esp', lrPos: 'LR+', note: 'nota',
  threshold: 'limiar', weight: 'peso', maxAgeDays: 'validade (dias)', emitNegative: 'conta negativo',
  intervalMonths: 'intervalo (meses)', priority: 'prioridade', label: 'nome', description: 'descrição',
  exam: 'exame', recommendation: 'recomendação', reset: 'restaurar padrão',
};

const whenText = (when) => (Array.isArray(when) && when.length
  ? when.map((c) => `${c.field} ${OPERATOR[c.op] ?? c.op} ${Array.isArray(c.value) ? c.value.join('/') : c.value ?? ''}`.trim()).join(' e ')
  : 'sempre');

const showValue = (v) => {
  if (v == null) return '—';
  if (typeof v === 'number') return nf(v, 6);
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (typeof v === 'string') return v.length > 60 ? `${v.slice(0, 60)}…` : v;
  return JSON.stringify(v);
};

const apiError = (e) => {
  const d = e?.response?.data;
  if (d?.fields?.length) return d.fields.map((f) => f.message).join(' · ');
  return d?.error || 'Não foi possível salvar';
};

// Lista do GET e campo de id de cada entidade do PATCH
const ENTITY_LIST = {
  conditions:           ['conditions', 'code'],
  'prior-rules':        ['priorRules', 'id'],
  'condition-symptoms': ['conditionSymptoms', 'id'],
  'lab-rules':          ['labRules', 'id'],
  'screening-rules':    ['screeningRules', 'id'],
};

// ─── Fonte (link só se a URL for http/https) ────────────────
function SourceLink({ source, code }) {
  if (!source) return <span className="text-xs text-surface-400">{code || '—'}</span>;
  const href = safeUrl(source.url);
  const text = shortCitation(source) || source.code;
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" title={source.citation}
      className="text-xs text-brand-700 hover:text-brand-900 hover:underline whitespace-nowrap">
      {text}
    </a>
  ) : (
    <span className="text-xs text-surface-600 whitespace-nowrap" title={source.citation}>{text}</span>
  );
}

function Section({ title, icon: Icon, count, children, hint }) {
  return (
    <section className="glass p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h3 className="font-display font-semibold text-surface-900 flex items-center gap-2">
          {Icon && <Icon size={15} className="text-brand-600" />} {title}
          {count != null && <span className="text-xs font-normal text-surface-400">({count})</span>}
        </h3>
        {hint && <p className="text-xs text-surface-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

const TH = 'px-2 py-2 text-[11px] font-semibold uppercase tracking-wider text-surface-400 whitespace-nowrap';
const TD = 'px-2 py-2 align-top';

// ─── Página ──────────────────────────────────────────────────
export default function Knowledge() {
  const [kb, setKb]           = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [category, setCategory] = useState('ONCOLOGICA');
  const [selected, setSelected] = useState('CA_COLORRETAL');
  const [changeNote, setChangeNote] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [simTick, setSimTick] = useState(0);   // muda a cada edição → "depois" recalcula
  const [resetting, setResetting] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await knowledgeService.get();
      setKb(data);
      setLoadError(null);
    } catch (e) {
      setLoadError(e.response?.data?.error || 'Não foi possível carregar a base');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Índices por código
  const idx = useMemo(() => {
    if (!kb) return null;
    const by = (list, key) => new Map((list ?? []).map((x) => [x[key], x]));
    return {
      sources:    by(kb.sources, 'code'),
      symptoms:   by(kb.symptoms, 'code'),
      conditions: by(kb.conditions, 'code'),
    };
  }, [kb]);

  const editable = Boolean(kb?.editable);

  // PATCH de uma linha: troca o item na lista, sobe a versão e avisa a simulação
  const save = useCallback(async (entity, id, body) => {
    const note = changeNote.trim();
    try {
      const { data } = await knowledgeService.patch(entity, id, note ? { ...body, changeNote: note } : body);
      const [listKey, idKey] = ENTITY_LIST[entity];
      setKb((prev) => ({
        ...prev,
        version: data.version ?? prev.version,
        [listKey]: prev[listKey].map((x) => (x[idKey] === id ? data.item : x)),
      }));
      if (data.changes?.length) {
        toast.success(`Salvo · base v${data.version}`);
        setSimTick((t) => t + 1);
      } else {
        toast('Valor igual ao atual: nada mudou');
      }
    } catch (e) {
      if (e.response?.status === 403) setKb((prev) => ({ ...prev, editable: false }));
      toast.error(apiError(e));
      throw e;
    }
  }, [changeNote]);

  const restore = async () => {
    if (!window.confirm('Restaurar todos os valores de partida da base? As edições continuam no histórico.')) return;
    setResetting(true);
    try {
      const { data } = await knowledgeService.reset(changeNote.trim() || 'Restaurar padrão');
      await load();
      setSimTick((t) => t + 1);
      toast.success(`Base restaurada · v${data.version}`);
    } catch (e) {
      if (e.response?.status === 403) setKb((prev) => ({ ...prev, editable: false }));
      toast.error(apiError(e));
    } finally {
      setResetting(false);
    }
  };

  if (loadError) {
    return (
      <div className="glass p-6 max-w-xl">
        <p className="font-medium text-surface-800">{loadError}</p>
        <button onClick={load} className="btn-ghost mt-3"><RefreshCw size={14} /> Tentar de novo</button>
      </div>
    );
  }
  if (!kb || !idx) {
    return <div className="glass p-6 animate-pulse h-40" />;
  }

  const inCategory = kb.conditions.filter((c) => c.category === category);
  const cond = inCategory.find((c) => c.code === selected) ?? inCategory[0];

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Database size={22} /> Base da IA
          </h1>
          <p className="text-surface-500 text-sm mt-0.5 max-w-2xl">
            O conhecimento clínico que o motor usa. Cada número tem fonte; editar um valor muda o resultado na hora.
          </p>
          <p className="text-xs text-surface-400 mt-1">
            {kb.conditions.length} condições · {kb.priorRules.length} fatores · {kb.conditionSymptoms.length} sinais e exames ·{' '}
            {kb.labRules.length} regras de exame · {kb.screeningRules.length} rastreamentos · {kb.sources.length} fontes
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-200 font-semibold tabular-nums"
            title="Sobe a cada campo editado e a cada restauração">
            Versão {kb.version}
          </span>
          <button type="button" onClick={() => setShowHistory((v) => !v)} className="btn-ghost" aria-expanded={showHistory}>
            <History size={14} /> Histórico
          </button>
          <button type="button" onClick={restore} disabled={!editable || resetting} className="btn-ghost"
            title={editable ? 'Volta aos valores do seed (com fonte)' : 'Base em modo só leitura'}>
            <RotateCcw size={14} className={clsx(resetting && 'animate-spin')} /> Restaurar padrão
          </button>
        </div>
      </div>

      {!editable && (
        <div role="note" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Lock size={16} className="shrink-0 mt-0.5 text-amber-600" />
          <div>
            <p className="font-medium">Modo só leitura neste servidor.</p>
            <p className="text-amber-800/90 mt-0.5">
              Dá para consultar a base inteira, mas não editar. No notebook do stand, <code className="font-mono text-xs">npm run stand</code>{' '}
              liga a edição (<code className="font-mono text-xs">KB_EDIT=true</code>).
            </p>
          </div>
        </div>
      )}

      {editable && (
        <div className="glass p-3 flex items-center gap-3 flex-wrap">
          <label htmlFor="kb-note" className="text-xs text-surface-500 shrink-0">Motivo da edição (opcional, vai para o histórico):</label>
          <input id="kb-note" value={changeNote} onChange={(e) => setChangeNote(e.target.value)} maxLength={500}
            placeholder="ex.: ajuste de limiar" className="input flex-1 min-w-[12rem] py-1.5 text-sm" />
          <span className="text-xs text-surface-400">Clique num valor sublinhado para editar · Enter salva · Esc cancela</span>
        </div>
      )}

      {showHistory && <HistoryPanel version={kb.version} idx={idx} kb={kb} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
        <div className="space-y-5 min-w-0">
          {/* Categoria e condição */}
          <div className="space-y-3">
            <div className="inline-flex rounded-xl border border-surface-200 bg-white p-1" role="tablist">
              {CATEGORY.map((c) => (
                <button key={c.key} type="button" role="tab" aria-selected={category === c.key}
                  onClick={() => { setCategory(c.key); setSelected(kb.conditions.find((x) => x.category === c.key)?.code); }}
                  className={clsx('px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    category === c.key ? 'bg-brand-600 text-white' : 'text-surface-500 hover:text-surface-800')}>
                  {c.label} <span className="opacity-70">({kb.conditions.filter((x) => x.category === c.key).length})</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {inCategory.map((c) => (
                <button key={c.code} type="button" onClick={() => setSelected(c.code)} aria-pressed={cond?.code === c.code}
                  className={clsx('px-3 py-1.5 rounded-full border text-sm transition-colors',
                    cond?.code === c.code
                      ? 'bg-brand-50 border-brand-400 text-brand-800 font-medium'
                      : 'bg-white border-surface-200 text-surface-600 hover:border-surface-300',
                    !c.active && 'line-through opacity-60')}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {cond && <ConditionEditor key={cond.code} cond={cond} kb={kb} idx={idx} save={editable ? save : null} />}

          <RedFlagsList items={kb.redFlags} />
        </div>

        <SimulatePanel tick={simTick} kbVersion={kb.version} />
      </div>
    </div>
  );
}

// ─── Uma condição: parâmetros, fatores, sinais, exames, rastreio ──
function ConditionEditor({ cond, kb, idx, save }) {
  const onco = cond.category === 'ONCOLOGICA';
  const s = (entity, id, field) => (save ? (v) => save(entity, id, { [field]: v }) : undefined);

  const rules    = kb.priorRules.filter((r) => r.conditionCode === cond.code);
  const signs    = kb.conditionSymptoms.filter((x) => x.conditionCode === cond.code);
  const signSet  = new Set(signs.map((x) => x.symptomCode));
  const labs     = kb.labRules.filter((l) => signSet.has(l.symptomCode));
  const screens  = kb.screeningRules.filter((r) => r.conditionCode === cond.code);
  const srcCodes = [...new Set([cond.sourceCode, ...rules, ...signs, ...labs, ...screens].map((x) => (typeof x === 'string' ? x : x?.sourceCode)).filter(Boolean))];

  const params = [
    { field: 'basePrior', label: 'Prior base', hint: onco ? 'chance de diagnóstico em 2 anos, população geral' : 'prevalência de partida',
      display: pct(cond.basePrior), toInput: pctInput, parse: parsePct },
    { field: 'maxPrior', label: 'Prior máximo', hint: 'teto depois dos fatores', display: pct(cond.maxPrior), toInput: pctInput, parse: parsePct },
    ...(onco ? [
      { field: 'watchThreshold', label: 'Limiar de atenção', hint: 'ATENÇÃO a partir daqui (ou RR ≥ 2)',
        display: pct(cond.watchThreshold), toInput: pctInput, parse: parsePct },
      { field: 'alertThreshold', label: 'Limiar de investigar', hint: 'NICE NG12: 3%',
        display: pct(cond.alertThreshold), toInput: pctInput, parse: parsePct },
    ] : []),
    { field: 'minAge', label: 'Idade mínima', hint: 'vazio = qualquer idade',
      display: cond.minAge == null ? '—' : `${cond.minAge} anos`, parse: parseInt0(true) },
  ];

  return (
    <div className="space-y-5">
      {/* Parâmetros */}
      <section className="glass p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-surface-900">{cond.label}</h2>
            <p className="text-xs text-surface-400 mt-0.5">
              {cond.code}{cond.sexFilter ? ` · só ${SEX[cond.sexFilter] ?? cond.sexFilter}` : ''} · fonte{' '}
              <SourceLink source={idx.sources.get(cond.sourceCode)} code={cond.sourceCode} />
            </p>
            {cond.description && <p className="text-sm text-surface-600 mt-2 max-w-2xl">{cond.description}</p>}
          </div>
          <label className="flex items-center gap-2 text-xs text-surface-600">
            Ativa <Toggle value={cond.active} label="Condição ativa" onChange={s('conditions', cond.code, 'active')} />
          </label>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {params.map((p) => (
            <div key={p.field} className="rounded-xl border border-surface-100 bg-surface-50/60 px-3 py-2.5">
              <dt className="text-xs text-surface-500">{p.label}</dt>
              <dd className="mt-0.5 font-display text-lg font-semibold">
                <EditableCell value={cond[p.field]} display={p.display} toInput={p.toInput} parse={p.parse}
                  align="left" width="w-28" title={p.label} onSave={s('conditions', cond.code, p.field)} />
              </dd>
              <p className="text-[11px] text-surface-400 mt-0.5">{p.hint}</p>
            </div>
          ))}
        </dl>
      </section>

      {/* Fatores do perfil (PriorRule) */}
      <Section title="Fatores do perfil" icon={Users} count={rules.length}
        hint="Idade, sexo e fatores de risco entram só no prior">
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b border-surface-100">
              <th className={TH}>Regra</th><th className={TH}>Tipo</th><th className={clsx(TH, 'text-right')}>Valor</th>
              <th className={TH}>Modif.</th><th className={TH}>Ativa</th><th className={TH}>Fonte</th>
            </tr></thead>
            <tbody className="divide-y divide-surface-100">
              {rules.map((r) => (
                <tr key={r.id} className={clsx(!r.active && 'opacity-50')}>
                  <td className={clsx(TD, 'min-w-[12rem]')}>
                    <span className="text-surface-800">{r.label}</span>
                    <span className="block text-[11px] text-surface-400 font-mono">{whenText(r.when)}</span>
                  </td>
                  <td className={clsx(TD, 'text-xs text-surface-500 whitespace-nowrap')}>{RULE_KIND[r.kind] ?? r.kind}</td>
                  <td className={clsx(TD, 'text-right whitespace-nowrap')}><RuleAmount rule={r} onSave={s('prior-rules', r.id, 'amount')} /></td>
                  <td className={TD}><Toggle value={r.modifiable} label="Fator modificável" onChange={s('prior-rules', r.id, 'modifiable')} /></td>
                  <td className={TD}><Toggle value={r.active} label="Regra ativa" onChange={s('prior-rules', r.id, 'active')} /></td>
                  <td className={TD}><SourceLink source={idx.sources.get(r.sourceCode)} code={r.sourceCode} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Sinais, sintomas e exames (ConditionSymptom) */}
      <Section title="Sinais, sintomas e exames" icon={FlaskConical} count={signs.length}
        hint="Sens = P(sinal | doença) · 1−Esp = P(sinal | sem doença) · LR+ = Sens/(1−Esp) · LR− = (1−Sens)/Esp">
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b border-surface-100">
              <th className={TH}>Sinal</th>
              <th className={clsx(TH, 'text-right')}>Sens</th><th className={clsx(TH, 'text-right')}>1−Esp</th>
              <th className={clsx(TH, 'text-right')}>LR+</th><th className={clsx(TH, 'text-right')}>LR−</th>
              <th className={TH}>Fonte</th>
            </tr></thead>
            <tbody className="divide-y divide-surface-100">
              {signs.map((x) => <SignRow key={x.id} cs={x} idx={idx} save={save} />)}
            </tbody>
          </table>
        </div>
        {save && (
          <p className="text-[11px] text-surface-400">
            Mudar Sens ou 1−Esp recalcula o LR+. Mudar o LR+ mantém a Sens e ajusta a 1−Esp; mudar o LR− mantém a 1−Esp e ajusta a Sens.
          </p>
        )}
      </Section>

      {/* Regras de leitura de exame (LabRule) */}
      {labs.length > 0 && (
        <Section title="Leitura de exames" icon={BookMarked} count={labs.length}
          hint="Como um laudo enviado vira evidência (limiar, peso, validade)">
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b border-surface-100">
                <th className={TH}>Achado</th><th className={clsx(TH, 'text-right')}>Limiar</th><th className={clsx(TH, 'text-right')}>Peso</th>
                <th className={clsx(TH, 'text-right')}>Validade</th><th className={TH}>Ativa</th><th className={TH}>Fonte</th>
              </tr></thead>
              <tbody className="divide-y divide-surface-100">
                {labs.map((l) => (
                  <tr key={l.id} className={clsx(!l.active && 'opacity-50')}>
                    <td className={clsx(TD, 'min-w-[12rem]')}>
                      <span className="text-surface-800">{l.label}</span>
                      {(l.sexFilter || l.minAge != null || l.maxAge != null) && (
                        <span className="block text-[11px] text-surface-400">
                          {[l.sexFilter && `só ${SEX[l.sexFilter] ?? l.sexFilter}`, l.minAge != null && `≥ ${l.minAge} anos`, l.maxAge != null && `≤ ${l.maxAge} anos`].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </td>
                    <td className={clsx(TD, 'text-right whitespace-nowrap')}>
                      {l.operator === 'positive' ? <span className="text-xs text-surface-600">positivo</span> : (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-surface-500">{OPERATOR[l.operator] ?? l.operator}</span>
                          <EditableCell value={l.threshold} title="Limiar" onSave={s('lab-rules', l.id, 'threshold')} parse={parseRequired} />
                          <span className="text-xs text-surface-500">{l.unit}</span>
                        </span>
                      )}
                    </td>
                    <td className={clsx(TD, 'text-right')}><EditableCell value={l.weight} title="Peso da evidência (0 a 5)" onSave={s('lab-rules', l.id, 'weight')} parse={parseRequired} /></td>
                    <td className={clsx(TD, 'text-right whitespace-nowrap')}>
                      <EditableCell value={l.maxAgeDays} display={`${l.maxAgeDays} dias`} title="Validade do exame em dias"
                        onSave={s('lab-rules', l.id, 'maxAgeDays')} parse={parseInt0(false)} />
                    </td>
                    <td className={TD}><Toggle value={l.active} label="Regra ativa" onChange={s('lab-rules', l.id, 'active')} /></td>
                    <td className={TD}><SourceLink source={idx.sources.get(l.sourceCode)} code={l.sourceCode} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Rastreamento (ScreeningRule) */}
      {screens.length > 0 && (
        <Section title="Rastreamento" icon={ShieldAlert} count={screens.length} hint="Diretrizes brasileiras, com o ano da fonte">
          <ul className="space-y-3">
            {screens.map((r) => (
              <li key={r.id} className={clsx('rounded-xl border border-surface-200 bg-white p-4 space-y-2', !r.active && 'opacity-50')}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-medium text-surface-900">{r.exam}</p>
                    <p className="text-xs text-surface-500">
                      {SCREENING_KIND[r.kind] ?? r.kind}{r.sexFilter ? ` · só ${SEX[r.sexFilter] ?? r.sexFilter}` : ''}
                      {r.when?.length ? ` · se ${whenText(r.when)}` : ''} · fonte <SourceLink source={idx.sources.get(r.sourceCode)} code={r.sourceCode} />
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-surface-600">
                    Ativa <Toggle value={r.active} label="Rastreamento ativo" onChange={s('screening-rules', r.id, 'active')} />
                  </label>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-surface-700">
                  <span className="inline-flex items-center gap-1">De
                    <EditableCell value={r.minAge} display={r.minAge ?? '—'} title="Idade inicial" parse={parseInt0(true)} onSave={s('screening-rules', r.id, 'minAge')} />
                    a
                    <EditableCell value={r.maxAge} display={r.maxAge ?? '—'} title="Idade final" parse={parseInt0(true)} onSave={s('screening-rules', r.id, 'maxAge')} />
                    anos
                  </span>
                  <span className="inline-flex items-center gap-1">Intervalo:
                    <EditableCell value={r.intervalMonths} display={r.intervalMonths ? `${r.intervalMonths} meses (${formatInterval(r.intervalMonths)})` : '—'}
                      title="Intervalo em meses" parse={parseInt0(true)} onSave={s('screening-rules', r.id, 'intervalMonths')} />
                  </span>
                </div>
                {r.recommendation && <p className="text-xs text-surface-500 leading-relaxed">{r.recommendation}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Fontes */}
      <Section title="Fontes desta condição" icon={BookMarked} count={srcCodes.length}>
        <ul className="space-y-2">
          {srcCodes.map((code) => {
            const src = idx.sources.get(code);
            const href = safeUrl(src?.url);
            return (
              <li key={code} className="text-sm text-surface-700 leading-relaxed">
                <span className="font-mono text-[11px] text-surface-400 mr-1.5">{code}</span>
                {src?.citation || 'Sem citação'}
                {href && (
                  <a href={href} target="_blank" rel="noopener noreferrer"
                    className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-brand-700 hover:underline">
                    abrir <ExternalLink size={11} />
                  </a>
                )}
                {src?.note && <span className="block text-xs text-surface-500">{src.note}</span>}
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}

// Valor de uma regra do prior, na unidade do efeito
function RuleAmount({ rule: r, onSave }) {
  if (r.effect === 'multiply') {
    return <EditableCell value={r.amount} display={`×${nf(r.amount, 2)}`} title="Multiplica o prior" parse={parseRequired} onSave={onSave} />;
  }
  if (r.effect === 'set') {
    return <EditableCell value={r.amount} display={`= ${pct(r.amount)}`} toInput={pctInput} parse={parsePct} title="Prior (em %)" onSave={onSave} />;
  }
  // add: em pontos percentuais
  return (
    <EditableCell value={r.amount} display={`${r.amount >= 0 ? '+' : ''}${nf(r.amount * 100, 2)} p.p.`}
      toInput={pctInput} parse={parsePct} title="Soma ao prior (pontos percentuais)" onSave={onSave} />
  );
}

// Linha de sinal: Sens, 1−Esp, LR+ (editáveis) e LR− (editável, ajusta a Sens)
function SignRow({ cs, idx, save }) {
  const sym = idx.symptoms.get(cs.symptomCode);
  const neg = lrNeg(cs);
  const can = Boolean(save);
  const patch = (body) => save('condition-symptoms', cs.id, body);

  const saveLrNeg = (v) => {
    const pSx = round(1 - v * (1 - cs.pNoSx), 6);
    if (!(pSx > 0 && pSx < 1)) {
      toast.error(`Com 1−Esp ${nf(cs.pNoSx, 3)}, o LR− precisa ficar entre 0 e ${nf(1 / (1 - cs.pNoSx), 2)}`);
      return Promise.reject(new Error('fora da faixa'));
    }
    return patch({ pSx });
  };

  return (
    <tr>
      <td className={clsx(TD, 'min-w-[13rem]')}>
        <span className="text-surface-800">{sym?.label ?? cs.symptomCode}</span>
        <span className="block text-[11px] text-surface-400">
          {EVIDENCE_KIND[sym?.kind] ?? sym?.kind}{cs.note ? ` · ${cs.note}` : ''}
        </span>
      </td>
      <td className={clsx(TD, 'text-right')}>
        <EditableCell value={cs.pSx} display={nf(cs.pSx, 3)} title="Sensibilidade, P(sinal | doença)" parse={parseProb}
          onSave={can ? (v) => patch({ pSx: v }) : undefined} />
      </td>
      <td className={clsx(TD, 'text-right')}>
        <EditableCell value={cs.pNoSx} display={nf(cs.pNoSx, 3)} title="1 − especificidade, P(sinal | sem doença)" parse={parseProb}
          onSave={can ? (v) => patch({ pNoSx: v }) : undefined} />
      </td>
      <td className={clsx(TD, 'text-right font-medium')}>
        <EditableCell value={cs.lrPos} display={nf(cs.lrPos, 2)} title="LR+ (razão de verossimilhança positiva)" parse={parseRequired}
          onSave={can ? (v) => patch({ lrPos: v }) : undefined} />
      </td>
      <td className={clsx(TD, 'text-right')}>
        <EditableCell value={neg == null ? null : round(neg, 3)} display={neg == null ? '—' : nf(neg, 2)}
          title="LR− (razão de verossimilhança negativa)" parse={parseRequired}
          onSave={can && neg != null ? saveLrNeg : undefined} />
      </td>
      <td className={TD}><SourceLink source={idx.sources.get(cs.sourceCode)} code={cs.sourceCode} /></td>
    </tr>
  );
}

// ─── Red flags (ficam no código) ─────────────────────────────
function RedFlagsList({ items = [] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <section className="glass p-5">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="w-full flex items-center justify-between text-left">
        <span className="font-display font-semibold text-surface-900 flex items-center gap-2">
          <AlertTriangle size={15} className="text-brand-600" /> Sinais de alarme ({items.length})
          <span className="text-xs font-normal text-surface-400">ficam no código (redFlags.js); aqui só a lista</span>
        </span>
        <ChevronDown size={16} className={clsx('transition-transform text-surface-400', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="mt-3 divide-y divide-surface-100">
          {items.map((r) => (
            <li key={r.code} className="py-2 flex items-start justify-between gap-3 text-sm">
              <span className="text-surface-800">{r.label}</span>
              <span className="text-xs text-surface-500 text-right shrink-0 max-w-[45%]">{r.action}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ─── Histórico de edições ────────────────────────────────────
function HistoryPanel({ version, idx, kb }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    knowledgeService.history({ limit: 50 })
      .then(({ data: d }) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(e.response?.data?.error || 'Não foi possível carregar o histórico'); });
    return () => { alive = false; };
  }, [version]);

  // "cs:CA_COLORRETAL:fit_positivo" → "Câncer colorretal · Sangue oculto…"
  const describe = (h) => {
    if (h.entity === 'KB') return 'Base inteira';
    if (h.entity === 'Condition') return idx.conditions.get(h.entityId)?.label ?? h.entityId;
    const list = { PriorRule: kb.priorRules, ConditionSymptom: kb.conditionSymptoms, LabRule: kb.labRules, ScreeningRule: kb.screeningRules }[h.entity];
    const row = list?.find((x) => x.id === h.entityId);
    if (!row) return h.entityId;
    const condLabel = idx.conditions.get(row.conditionCode)?.label;
    const what = row.label ?? row.exam ?? idx.symptoms.get(row.symptomCode)?.label ?? h.entityId;
    return condLabel ? `${condLabel} · ${what}` : what;
  };

  return (
    <section className="glass p-5 space-y-3">
      <h3 className="font-display font-semibold text-surface-900 flex items-center gap-2">
        <History size={15} className="text-brand-600" /> Histórico de edições
        {data && <span className="text-xs font-normal text-surface-400">({data.total})</span>}
      </h3>
      {error && <p className="text-sm text-surface-500">{error}</p>}
      {!data && !error && <div className="h-16 animate-pulse rounded-xl bg-surface-100" />}
      {data && data.items.length === 0 && <p className="text-sm text-surface-500">Nenhuma edição ainda: a base está nos valores de partida.</p>}
      {data && data.items.length > 0 && (
        <div className="overflow-x-auto -mx-2 max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white"><tr className="text-left border-b border-surface-100">
              <th className={TH}>v</th><th className={TH}>O quê</th><th className={TH}>Campo</th>
              <th className={TH}>De → para</th><th className={TH}>Quem / quando</th>
            </tr></thead>
            <tbody className="divide-y divide-surface-100">
              {data.items.map((h) => (
                <tr key={h.version}>
                  <td className={clsx(TD, 'tabular-nums text-surface-500')}>{h.version}</td>
                  <td className={clsx(TD, 'min-w-[12rem]')}>
                    <span className="text-[11px] text-surface-400 block">{ENTITY[h.entity] ?? h.entity}</span>
                    {describe(h)}
                    {h.note && <span className="block text-xs text-surface-500 italic">“{h.note}”</span>}
                  </td>
                  <td className={clsx(TD, 'text-surface-600 whitespace-nowrap')}>{FIELD[h.field] ?? h.field}</td>
                  <td className={clsx(TD, 'whitespace-nowrap tabular-nums')}>
                    {h.field === 'reset' ? '—' : <>{showValue(h.oldValue)} <span className="text-surface-400">→</span> <strong>{showValue(h.newValue)}</strong></>}
                  </td>
                  <td className={clsx(TD, 'text-xs text-surface-500 whitespace-nowrap')}>
                    {h.changedBy || '—'}<br />{new Date(h.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Simular em paciente: antes e depois ─────────────────────
// "Antes" é o resultado quando a médica escolhe o paciente (ou quando
// clica em "Usar como antes"); "depois" é recalculado a cada edição
// (GET /api/doctor/patients/:id/risk calcula na hora com a base atual).
function SimulatePanel({ tick, kbVersion }) {
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState('');
  const [before, setBefore] = useState(null);
  const [after, setAfter]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

  useEffect(() => {
    doctorService.getPatients({ limit: 50 })
      .then(({ data }) => setPatients(data?.patients ?? []))
      .catch(() => setPatients([]));
  }, []);

  const fetchRisk = useCallback(async (id) => {
    setLoading(true);
    setError(null);
    try { return (await doctorService.getPatientRisk(id)).data; }
    catch (e) { setError(e.response?.data?.error || 'Não foi possível calcular'); return null; }
    finally { setLoading(false); }
  }, []);

  const pick = async (id) => {
    setPatientId(id);
    setBefore(null); setAfter(null);
    if (!id) return;
    const d = await fetchRisk(id);
    setBefore(d); setAfter(d);
  };

  // A cada edição (tick), recalcula o "depois"
  useEffect(() => {
    if (!patientId || tick === 0) return;
    let alive = true;
    fetchRisk(patientId).then((d) => { if (alive && d) setAfter(d); });
    return () => { alive = false; };
  }, [tick, patientId, fetchRisk]);

  const rows = useMemo(() => {
    if (!after) return [];
    const prev = new Map((before?.oncology?.conditions ?? []).map((c) => [c.code, c]));
    return (after.oncology?.conditions ?? []).map((c) => ({ code: c.code, label: c.label, a: prev.get(c.code), b: c }));
  }, [before, after]);

  return (
    <aside className="glass p-5 space-y-4 lg:sticky lg:top-0">
      <div>
        <h3 className="font-display font-semibold text-surface-900 flex items-center gap-2">
          <FlaskConical size={15} className="text-brand-600" /> Simular em paciente
        </h3>
        <p className="text-xs text-surface-500 mt-1">
          Escolha um paciente, edite um valor ao lado e veja o risco antes e depois. Nada do paciente é alterado.
        </p>
      </div>

      <select value={patientId} onChange={(e) => pick(e.target.value)} className="input text-sm" aria-label="Paciente para simular">
        <option value="">Escolha um paciente…</option>
        {patients.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
      </select>

      {error && <p className="text-sm text-surface-600">{error}</p>}
      {loading && !after && <div className="h-24 animate-pulse rounded-xl bg-surface-100" />}

      {after && (
        <>
          <div className="flex items-center justify-between text-[11px] text-surface-400">
            <span>antes: base v{before?.kbVersion ?? '—'}</span>
            <span className={clsx(loading && 'animate-pulse')}>depois: base v{after.kbVersion}{after.kbVersion !== kbVersion && loading ? '…' : ''}</span>
          </div>
          <ul className="space-y-2">
            {rows.map(({ code, label, a, b }) => <SimRow key={code} label={label} a={a} b={b} />)}
          </ul>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" className="btn-ghost text-xs px-2 py-1" onClick={() => setBefore(after)}
              disabled={before === after} title="O resultado atual passa a ser o 'antes'">
              Usar como antes
            </button>
            <Link to={`/doctor/patients/${patientId}`} className="btn-ghost text-xs px-2 py-1">
              Painel do paciente <ArrowRight size={12} />
            </Link>
          </div>
          <p className="text-[11px] text-surface-400">
            % em 2 anos, estimativa didática. Acima de 20% o painel mostra “≥20%”; aqui aparece também o valor do motor.
          </p>
        </>
      )}
    </aside>
  );
}

const simPct = (c) => {
  if (!c?.eligible || c.posterior == null) return null;
  return c.display?.capped ? `${c.display.posterior} (${nf(c.posterior * 100, 1)}%)` : c.display?.posterior;
};

function SimRow({ label, a, b }) {
  const lb = oncoLevel(b.level);
  const la = a ? oncoLevel(a.level) : null;
  const changed = a && b.posterior != null && a.posterior != null && Math.abs(b.posterior - a.posterior) > 1e-9;
  if (!b.eligible) {
    return (
      <li className="rounded-xl border border-surface-100 px-3 py-2 text-xs text-surface-500">
        <span className="font-medium text-surface-700">{label}</span> · {b.reason || 'não avaliado'}
      </li>
    );
  }
  return (
    <li className={clsx('rounded-xl border px-3 py-2', changed ? 'border-brand-300 bg-brand-50/40' : 'border-surface-100')}>
      <p className="text-sm font-medium text-surface-800">{label}</p>
      <div className="mt-1 flex items-center gap-2 text-sm flex-wrap">
        {a && (
          <>
            <span className={clsx('inline-flex items-center gap-1.5', changed && 'text-surface-400')}>
              <span className={clsx('w-2 h-2 rounded-full', la.dot)} />
              <span className="tabular-nums">{simPct(a)}</span>
            </span>
            <ArrowRight size={12} className="text-surface-300" />
          </>
        )}
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <span className={clsx('w-2 h-2 rounded-full', lb.dot)} />
          <span className={clsx('tabular-nums', lb.text)}>{simPct(b)}</span>
        </span>
        <span className={clsx(lb.badge, 'ml-auto')}>{lb.label}</span>
      </div>
      <p className="text-[11px] text-surface-400 mt-0.5 tabular-nums">
        RR {a && changed ? `${displayRelativeRisk(a)} → ` : ''}{displayRelativeRisk(b)} a média
      </p>
    </li>
  );
}
