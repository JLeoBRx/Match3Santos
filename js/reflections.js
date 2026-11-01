/**
 * reflections.js — banco de reflexões (data/reflections.json) e regras de seleção.
 *
 * Regras:
 *  - Reflexões ainda não apresentadas têm prioridade (1º ciclo segue a ordem dos ids).
 *  - Nenhuma reflexão se repete antes de todas as válidas daquele santo aparecerem.
 *  - Depois de completar o ciclo, um novo ciclo começa em ordem aleatória
 *    (sem repetir imediatamente a última exibida).
 *  - Conteúdos provisórios/marcadores NUNCA são apresentados como reflexões.
 */
import { shuffle } from './utils.js';

/** Status que impedem a exibição. "revisar" é texto real aguardando revisão → exibível. */
const BLOCKED_STATUS = new Set(['placeholder', 'provisorio', 'provisório', 'pendente', 'vazio', 'todo', 'oculto', 'desativado', 'rascunho']);

const PLACEHOLDER_PATTERNS = [
  /^\s*\[[^\]]*\]\s*$/s, // campo inteiro entre colchetes, ex.: "[TEXTO PROVISÓRIO]"
  /\[\s*(texto|pergunta|t[íi]tulo|tema|virtude)?\s*provis[óo]ri[oa]\s*\]/i,
  /lorem ipsum/i,
  /\b(PREENCHER|A DEFINIR|TODO|TBD)\b/,
];

const REQUIRED_FIELDS = ['title', 'reflection', 'question'];

function isPlaceholderText(value) {
  const text = String(value ?? '').trim();
  if (!text) return true;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(text));
}

/** A reflexão pode ser exibida ao jogador? */
export function isDisplayable(reflection) {
  if (!reflection || typeof reflection !== 'object') return false;
  const status = String(reflection.status || '').toLowerCase().trim();
  if (BLOCKED_STATUS.has(status)) return false;
  if (REQUIRED_FIELDS.some((f) => isPlaceholderText(reflection[f]))) return false;
  for (const f of ['theme', 'virtue']) if (reflection[f] && isPlaceholderText(reflection[f])) return false;
  return true;
}

/** Normaliza os dois formatos aceitos: { saints: {...} } ou { [id]: {...} }. */
function extractSaints(json) {
  if (json && typeof json.saints === 'object' && !Array.isArray(json.saints)) return json.saints;
  const out = {};
  for (const [key, value] of Object.entries(json || {})) if (value && Array.isArray(value.reflections)) out[key] = value;
  return out;
}

export class ReflectionLibrary {
  /**
   * @param {object} json conteúdo de reflections.json
   * @param {import('./storage.js').SaveStore} store
   */
  constructor(json, store) {
    this.meta = { schema: json?.schema_version, note: json?.editorial_note || '' };
    this.store = store;
    this.saints = {};
    for (const [saintId, entry] of Object.entries(extractSaints(json))) {
      const list = (entry.reflections || [])
        .map((r, i) => ({ ...r, id: Number(r.id ?? i + 1) }))
        .sort((a, b) => a.id - b.id)
        .map((r) => ({ ...r, valid: isDisplayable(r) }));
      this.saints[saintId] = { name: entry.saint_name || saintId, reflections: list };
    }
  }

  static async load(url, store) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Não foi possível carregar ${url} (${res.status})`);
    return new ReflectionLibrary(await res.json(), store);
  }

  get state() {
    return this.store.data.reflections;
  }

  has(saintId) {
    return Boolean(this.saints[saintId]);
  }

  /** Todas as posições de reflexão do santo, com flags valid/discovered. */
  slots(saintId) {
    const disc = new Set(this.state.discovered[saintId] || []);
    return (this.saints[saintId]?.reflections || []).map((r) => ({ ...r, discovered: r.valid && disc.has(r.id) }));
  }

  validIds(saintId) {
    return (this.saints[saintId]?.reflections || []).filter((r) => r.valid).map((r) => r.id);
  }

  get(saintId, id) {
    return (this.saints[saintId]?.reflections || []).find((r) => r.id === id) || null;
  }

  /** { discovered, total, slots } — total = reflexões válidas. */
  progress(saintId) {
    const valid = this.validIds(saintId);
    const disc = new Set(this.state.discovered[saintId] || []);
    return {
      discovered: valid.filter((id) => disc.has(id)).length,
      total: valid.length,
      slots: (this.saints[saintId]?.reflections || []).length,
    };
  }

  totals() {
    let discovered = 0;
    let total = 0;
    let placeholders = 0;
    for (const saintId of Object.keys(this.saints)) {
      const p = this.progress(saintId);
      discovered += p.discovered;
      total += p.total;
      placeholders += p.slots - p.total;
    }
    return { discovered, total, placeholders };
  }

  /** Quantas reflexões válidas do santo ainda não foram vistas. */
  undiscoveredCount(saintId) {
    const p = this.progress(saintId);
    return p.total - p.discovered;
  }

  /**
   * Sorteia a próxima reflexão do santo segundo as regras e registra no histórico.
   * @returns {null | { reflection, progress, isNew, cycle }}
   */
  draw(saintId) {
    const valid = this.validIds(saintId);
    if (!valid.length) return null;
    const st = this.state;
    const disc = new Set(st.discovered[saintId] || []);
    const undiscovered = valid.filter((id) => !disc.has(id));
    let id;
    let isNew = false;
    if (undiscovered.length) {
      id = undiscovered[0];
      isNew = true;
    } else {
      let deck = (st.deck[saintId] || []).filter((x) => valid.includes(x));
      if (!deck.length) {
        deck = shuffle(valid);
        const last = st.lastBySaint[saintId];
        if (deck.length > 1 && deck[0] === last) [deck[0], deck[1]] = [deck[1], deck[0]];
        st.cycles[saintId] = (st.cycles[saintId] || 0) + 1;
      }
      id = deck.shift();
      st.deck[saintId] = deck;
    }
    disc.add(id);
    st.discovered[saintId] = [...disc].sort((a, b) => a - b);
    st.lastBySaint[saintId] = id;
    st.last = { saint: saintId, id };
    st.history.push({ saint: saintId, id, at: Date.now() });
    if (st.history.length > 300) st.history.splice(0, st.history.length - 300);
    this.store.save();
    return { reflection: this.get(saintId, id), progress: this.progress(saintId), isNew, cycle: (st.cycles[saintId] || 0) + 1 };
  }

  /** Relatório para o diagnóstico de conteúdo. */
  report() {
    const status = {};
    let slots = 0;
    let valid = 0;
    for (const s of Object.values(this.saints)) {
      for (const r of s.reflections) {
        slots++;
        if (r.valid) valid++;
        const k = r.status || 'sem status';
        status[k] = (status[k] || 0) + 1;
      }
    }
    return { saints: Object.keys(this.saints).length, slots, valid, placeholders: slots - valid, status };
  }
}
