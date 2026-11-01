/**
 * levels.js — fases (data/levels.json), mapa de progressão e sessão de fase.
 */
import { GoalTracker, describeGoal, normalizeLevel, starsForWin } from './goals.js';
import { el, escapeHtml, formatNumber } from './utils.js';
import { icon } from './icons.js';

export class LevelCatalog {
  constructor(list, saintIds) {
    this.levels = list.map((raw) => normalizeLevel(raw, saintIds)).sort((a, b) => a.id - b.id);
    this.byId = new Map(this.levels.map((l) => [l.id, l]));
  }

  static async load(url, saintIds) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Não foi possível carregar ${url} (${res.status})`);
    const json = await res.json();
    return new LevelCatalog(Array.isArray(json) ? json : json.levels || [], saintIds);
  }

  get(id) {
    return this.byId.get(Number(id)) || null;
  }

  get count() {
    return this.levels.length;
  }

  next(id) {
    return this.levels.find((l) => l.id > id) || null;
  }
}

/** Estado da fase no progresso salvo. */
export function levelState(level, store) {
  const L = store.data.levels;
  if (L.completed.includes(level.id)) return 'completed';
  if (level.id <= L.unlocked) return 'available';
  return 'locked';
}

/** Ícone + texto de um objetivo (para HUD e pré-visualização). */
export function goalVisual(goal, saints) {
  if (goal.type === 'saint') {
    const s = saints.get(goal.saint);
    return { img: s?.thumbUrl, icon: null, short: s?.name || goal.saint };
  }
  const map = { score: ['star', 'Pontos'], clear: ['grid', 'Peças'], specials: ['bolt', 'Especiais'] };
  const [ic, short] = map[goal.type] || ['target', 'Meta'];
  return { img: null, icon: ic, short };
}

/** Desenha o mapa de fases em `container`. */
export function renderLevelMap(container, { catalog, store, saints, onSelect }) {
  container.innerHTML = '';
  const path = el('div', { class: 'map-path' });
  let currentNode = null;
  let lastChapter = null;
  const firstOpen = catalog.levels.find((l) => levelState(l, store) === 'available');
  catalog.levels.forEach((level, i) => {
    if (level.chapter && level.chapter !== lastChapter) {
      lastChapter = level.chapter;
      path.append(el('div', { class: 'map-chapter' }, el('span', {}, level.chapter)));
    }
    const state = levelState(level, store);
    const stars = store.data.levels.stars[level.id] || 0;
    const featured = saints.get(level.featured);
    const offset = Math.sin(i * 0.95).toFixed(3); // caminho sinuoso (fator -1..1)
    const isCurrent = firstOpen && firstOpen.id === level.id;
    const starRow = el('div', { class: 'node-stars' });
    for (let s = 1; s <= 3; s++) starRow.append(el('span', { class: s <= stars ? 'on' : '', html: icon('star') }));
    const node = el(
      'button',
      {
        class: `level-node state-${state} ${isCurrent ? 'current' : ''}`,
        type: 'button',
        style: { '--x': offset },
        'aria-label': `Fase ${level.id}${state === 'locked' ? ' (bloqueada)' : ''}${stars ? `, ${stars} estrelas` : ''}`,
        onclick: () => onSelect(level, state),
      },
      el('span', { class: 'node-orb' }, state === 'locked' ? el('span', { class: 'node-lock', html: icon('lock') }) : el('span', { class: 'node-num' }, String(level.id))),
      featured ? el('img', { class: 'node-face', src: featured.thumbUrl, alt: '' }) : null,
      el('span', { class: 'node-name' }, level.name),
      state === 'completed' ? starRow : null,
    );
    path.append(el('div', { class: 'map-step' }, node));
    if (isCurrent) currentNode = node;
  });
  container.append(path);
  const draw = () => drawRoad(container, path, store);
  requestAnimationFrame(draw);
  if (container._roadObserver) container._roadObserver.disconnect();
  if ('ResizeObserver' in window) {
    container._roadObserver = new ResizeObserver(draw);
    container._roadObserver.observe(container);
  }
  return currentNode;
}

/** Desenha a "estrada" curva que liga as fases (SVG atrás dos botões). */
function drawRoad(container, path, store) {
  container.querySelector('.map-road')?.remove();
  const box = container.getBoundingClientRect();
  if (!box.width) return;
  const k = box.width / (container.offsetWidth || box.width) || 1; // compensa transformações da tela
  const orbs = [...path.querySelectorAll('.node-orb')];
  const pts = orbs.map((o) => {
    const r = o.getBoundingClientRect();
    return { x: (r.left - box.left + r.width / 2) / k, y: (r.top - box.top + r.height / 2) / k };
  });
  if (pts.length < 2) return;
  const curve = (list) =>
    list.reduce((d, p, i) => {
      if (i === 0) return `M${p.x},${p.y}`;
      const prev = list[i - 1];
      const my = (prev.y + p.y) / 2;
      return `${d} C${prev.x},${my} ${p.x},${my} ${p.x},${p.y}`;
    }, '');
  const done = Math.min(pts.length, store.data.levels.unlocked);
  const ns = 'http://www.w3.org/2000/svg';
  const svgEl = document.createElementNS(ns, 'svg');
  svgEl.setAttribute('class', 'map-road');
  svgEl.setAttribute('aria-hidden', 'true');
  svgEl.innerHTML =
    '<defs><linearGradient id="roadGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a3"/><stop offset="1" stop-color="#ff9f3a"/></linearGradient></defs>';
  const mk = (cls, d) => {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('class', cls);
    p.setAttribute('d', d);
    svgEl.append(p);
  };
  mk('road-base', curve(pts));
  mk('road-dash', curve(pts));
  if (done > 1) mk('road-done', curve(pts.slice(0, done)));
  container.prepend(svgEl);
}

/** Conteúdo da janela de apresentação da fase. */
export function renderLevelPreview(level, { store, saints }) {
  const best = store.data.levels.bestScores[level.id] || 0;
  const stars = store.data.levels.stars[level.id] || 0;
  const featured = saints.get(level.featured);
  const goals = el(
    'ul',
    { class: 'goal-list' },
    level.goals.map((g) => {
      const v = goalVisual(g, saints);
      return el(
        'li',
        {},
        v.img ? el('img', { src: v.img, alt: '' }) : el('span', { class: 'goal-icon', html: icon(v.icon) }),
        el('span', {}, describeGoal(g, (id) => saints.name(id))),
      );
    }),
  );
  const pool = el(
    'div',
    { class: 'pool-row' },
    level.pool.map((id) => {
      const s = saints.get(id);
      return s ? el('img', { src: s.thumbUrl, alt: s.name, title: s.name }) : null;
    }),
  );
  const starLine = el('div', { class: 'preview-stars' });
  level.stars.forEach((t, i) =>
    starLine.append(el('div', { class: `pstar ${i < stars ? 'on' : ''}` }, el('span', { html: icon('star').repeat(i + 1) }), el('small', {}, formatNumber(t)))),
  );
  return el(
    'div',
    { class: 'level-preview' },
    el(
      'div',
      { class: 'lp-col' },
      featured ? el('div', { class: 'preview-hero' }, el('img', { src: featured.thumbUrl, alt: featured.name }), el('span', {}, `Em destaque: ${featured.name}`)) : null,
      el('div', { class: 'preview-moves', html: `${icon('target')}<span><strong>${level.moves}</strong> movimentos</span>` }),
      el('h4', {}, level.goals.length > 1 ? 'Objetivos (todos)' : 'Objetivo'),
      goals,
    ),
    el(
      'div',
      { class: 'lp-col' },
      el('h4', {}, 'Santos nesta fase'),
      pool,
      el('h4', {}, 'Estrelas'),
      starLine,
      best ? el('p', { class: 'preview-best', html: `Melhor pontuação: <strong>${escapeHtml(formatNumber(best))}</strong>` }) : null,
    ),
  );
}

/** Sessão de uma fase em andamento: movimentos, objetivos, vitória e derrota. */
export class LevelSession {
  constructor(level, store) {
    this.mode = 'level';
    this.level = level;
    this.store = store;
    this.pool = level.pool;
    this.moves = level.moves;
    this.tracker = new GoalTracker(level.goals);
    this.title = 'Modo Fases';
    this.subtitle = `Fase ${level.id} · ${level.name}`;
  }

  get score() {
    return this.tracker.score;
  }

  get goals() {
    return this.tracker.goals;
  }

  useMove() {
    this.moves = Math.max(0, this.moves - 1);
  }

  record({ points, cleared, specialsCreated }) {
    this.tracker.record({ points, clearedByType: cleared, specialsCreated });
  }

  /** Barra de progresso: média dos objetivos. */
  progress() {
    return this.tracker.progress();
  }

  /** Chamado ao fim de cada jogada. */
  evaluate() {
    if (this.tracker.isComplete()) return 'win';
    if (this.moves <= 0) return 'lose';
    return null;
  }

  /** Fecha a fase, salva o progresso e devolve o resumo para a tela de resultado. */
  finalize(won) {
    const base = this.tracker.score;
    const bonus = won ? this.moves * this.level.moveBonus : 0;
    const finalScore = base + bonus;
    const stars = won ? starsForWin(finalScore, this.level.stars) : 0;
    const prevBest = this.store.data.levels.bestScores[this.level.id] || 0;
    const prevStars = this.store.data.levels.stars[this.level.id] || 0;
    const wasUnlocked = this.store.data.levels.unlocked;
    this.store.recordLevelResult(this.level.id, { won, score: finalScore, stars });
    return {
      won,
      base,
      bonus,
      movesLeft: won ? this.moves : 0,
      moveBonus: this.level.moveBonus,
      finalScore,
      stars,
      newBest: finalScore > prevBest && prevBest > 0,
      moreStars: stars > prevStars,
      unlockedNext: this.store.data.levels.unlocked > wasUnlocked,
      goals: this.tracker.goals.map((g) => ({ ...g })),
    };
  }
}
