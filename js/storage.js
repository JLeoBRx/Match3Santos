/**
 * storage.js — salvamento do progresso em LocalStorage, com versionamento.
 *
 * Para alterar o formato no futuro:
 *   1. aumente SAVE_VERSION em constants.js;
 *   2. acrescente uma função em MIGRATIONS com a chave da NOVA versão,
 *      transformando os dados da versão anterior.
 */
import { SAVE_KEY, SAVE_VERSION } from './constants.js';
import { deepMerge, isPlainObject } from './utils.js';

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    levels: {
      unlocked: 1, // maior fase liberada
      completed: [], // ids das fases vencidas
      stars: {}, // { [id]: 0..3 }
      bestScores: {}, // { [id]: pontos }
    },
    endless: {
      highScore: 0,
      bestStage: 0,
      lastScore: 0,
      lastStage: 0,
      gamesPlayed: 0,
    },
    reflections: {
      discovered: {}, // { [saintId]: [ids já apresentadas] }
      deck: {}, // { [saintId]: [ids restantes do ciclo atual] }
      cycles: {}, // { [saintId]: número de ciclos completos }
      history: [], // últimas apresentações [{ saint, id, at }]
      last: null, // última reflexão exibida { saint, id }
      lastBySaint: {}, // { [saintId]: id da última reflexão exibida }
    },
    stats: {
      matches: {}, // { [saintId]: combinações de 3+ }
      cleared: {}, // { [saintId]: peças eliminadas }
      specialsCreated: 0,
      bestCascade: 0,
      movesPlayed: 0,
    },
    settings: {
      music: true,
      sfx: true,
      musicVolume: 0.5,
      sfxVolume: 0.8,
    },
    preferences: {
      reducedMotion: false,
      hints: true,
      readingTime: 'normal', // curto | normal | longo
      panelPosition: 'auto', // auto | bottom | side
      editorMode: false, // mostra status editorial e todas as reflexões no álbum
      seenTutorial: false,
    },
  };
}

/** Migrações: chave = versão de destino. */
const MIGRATIONS = {
  // v1 → v2: preferências separadas das configurações de áudio e estatísticas novas.
  2: (data) => {
    const prefs = data.preferences || {};
    if (data.settings && 'reducedMotion' in data.settings) {
      prefs.reducedMotion = data.settings.reducedMotion;
      delete data.settings.reducedMotion;
    }
    data.preferences = prefs;
    data.stats = data.stats || {};
    return data;
  },
};

export function migrate(data) {
  let version = Number(data.version) || 1;
  while (version < SAVE_VERSION) {
    const next = version + 1;
    if (MIGRATIONS[next]) data = MIGRATIONS[next](data);
    version = next;
    data.version = version;
  }
  return data;
}

class MemoryStore {
  constructor() {
    this.map = new Map();
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
}

function resolveBackend() {
  try {
    const ls = globalThis.localStorage;
    const probe = '__mds_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return { store: ls, persistent: true };
  } catch {
    return { store: new MemoryStore(), persistent: false };
  }
}

export class SaveStore {
  constructor(key = SAVE_KEY, backend = null) {
    this.key = key;
    const resolved = backend ? { store: backend, persistent: true } : resolveBackend();
    this.backend = resolved.store;
    this.persistent = resolved.persistent;
    this.listeners = new Set();
    this.data = this.load();
  }

  load() {
    let raw = null;
    try {
      raw = this.backend.getItem(this.key);
    } catch {
      raw = null;
    }
    if (!raw) return defaultSave();
    try {
      const parsed = JSON.parse(raw);
      if (!isPlainObject(parsed)) throw new Error('formato inválido');
      if ((Number(parsed.version) || 1) > SAVE_VERSION) {
        console.warn('[Match dos Santos] Save de versão mais nova que o jogo; mantendo os dados conhecidos.');
      }
      return deepMerge(defaultSave(), migrate(parsed));
    } catch (err) {
      console.warn('[Match dos Santos] Save corrompido; um backup foi guardado e o progresso reiniciado.', err);
      try {
        this.backend.setItem(this.key + '.backup', raw);
      } catch {
        /* sem espaço — ignora */
      }
      return defaultSave();
    }
  }

  save() {
    this.data.updatedAt = new Date().toISOString();
    this.data.version = SAVE_VERSION;
    try {
      this.backend.setItem(this.key, JSON.stringify(this.data));
    } catch (err) {
      console.warn('[Match dos Santos] Não foi possível salvar o progresso.', err);
    }
    this.listeners.forEach((fn) => fn(this.data));
  }

  /** Aplica uma alteração e salva: store.update(d => { d.endless.highScore = 10 }) */
  update(mutator) {
    mutator(this.data);
    this.save();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  reset() {
    const prefs = { settings: this.data.settings, preferences: this.data.preferences };
    this.data = deepMerge(defaultSave(), prefs);
    this.save();
  }

  get settings() {
    return this.data.settings;
  }

  get prefs() {
    return this.data.preferences;
  }

  // ---------- Fases ----------
  recordLevelResult(levelId, { won, score, stars }) {
    this.update((d) => {
      const L = d.levels;
      L.bestScores[levelId] = Math.max(L.bestScores[levelId] || 0, score);
      if (won) {
        if (!L.completed.includes(levelId)) L.completed.push(levelId);
        L.stars[levelId] = Math.max(L.stars[levelId] || 0, stars);
        L.unlocked = Math.max(L.unlocked, levelId + 1);
      }
    });
  }

  totalStars() {
    return Object.values(this.data.levels.stars).reduce((a, b) => a + b, 0);
  }

  // ---------- Modo infinito ----------
  /** Atualiza recorde (chamado ao fim de cada jogada, para não perder com recarregamento). */
  recordEndlessProgress(score, stage) {
    const e = this.data.endless;
    let changed = false;
    if (score > e.highScore) {
      e.highScore = score;
      changed = true;
    }
    if (stage > e.bestStage) {
      e.bestStage = stage;
      changed = true;
    }
    if (changed) this.save();
    return changed;
  }

  finishEndless(score, stage) {
    this.update((d) => {
      d.endless.lastScore = score;
      d.endless.lastStage = stage;
      d.endless.gamesPlayed += 1;
      d.endless.highScore = Math.max(d.endless.highScore, score);
      d.endless.bestStage = Math.max(d.endless.bestStage, stage);
    });
  }

  // ---------- Estatísticas ----------
  recordTurnStats({ matchesBySaint = {}, clearedBySaint = {}, specials = 0, cascade = 0 }) {
    const s = this.data.stats;
    for (const [id, n] of Object.entries(matchesBySaint)) s.matches[id] = (s.matches[id] || 0) + n;
    for (const [id, n] of Object.entries(clearedBySaint)) s.cleared[id] = (s.cleared[id] || 0) + n;
    s.specialsCreated += specials;
    s.bestCascade = Math.max(s.bestCascade, cascade);
    s.movesPlayed += 1;
    this.save();
  }
}
