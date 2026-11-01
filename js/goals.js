/**
 * goals.js — objetivos de fase (lógica pura, sem DOM).
 *
 * Tipos de objetivo suportados em data/levels.json:
 *   { "type": "score",    "target": 3000 }                      → alcançar pontuação
 *   { "type": "clear",    "target": 60 }                        → eliminar N peças (quaisquer)
 *   { "type": "saint",    "saint": "sao_jose", "target": 15 }   → eliminar N peças de um santo
 *   { "type": "specials", "target": 3 }                         → criar N peças especiais
 * Vários objetivos na mesma fase = objetivo combinado (todos precisam ser cumpridos).
 */
import { createRng, hashString, shuffle } from './utils.js';

export const DEFAULT_MOVE_BONUS = 120;
export const MIN_POOL = 4;
export const MAX_POOL = 8;

/**
 * Converte um registro bruto de levels.json em uma fase pronta para jogar.
 * Aceita também o formato simplificado { id, targetScore, moves, stars }.
 */
export function normalizeLevel(raw, allSaintIds) {
  const id = Number(raw.id);
  const goals = Array.isArray(raw.goals) ? raw.goals.map((g) => ({ ...g, target: Number(g.target) || 0 })) : [];
  if (raw.targetScore && !goals.some((g) => g.type === 'score')) goals.unshift({ type: 'score', target: Number(raw.targetScore) });
  if (!goals.length) goals.push({ type: 'score', target: 1000 });

  const valid = new Set(allSaintIds);
  let pool = Array.isArray(raw.saints) ? raw.saints.filter((s) => valid.has(s)) : [];
  // Santos exigidos por objetivos precisam estar no tabuleiro.
  for (const g of goals) if (g.type === 'saint' && valid.has(g.saint) && !pool.includes(g.saint)) pool.push(g.saint);
  if (raw.featured && valid.has(raw.featured) && !pool.includes(raw.featured)) pool.unshift(raw.featured);
  const wanted = Math.max(MIN_POOL, Math.min(MAX_POOL, Number(raw.saintCount) || pool.length || 6));
  if (pool.length < wanted) {
    const rng = createRng(hashString('nivel-' + id));
    for (const s of shuffle(allSaintIds, rng)) {
      if (pool.length >= wanted) break;
      if (!pool.includes(s)) pool.push(s);
    }
  }
  pool = pool.slice(0, MAX_POOL);

  const scoreGoal = goals.find((g) => g.type === 'score');
  let stars = Array.isArray(raw.stars) ? raw.stars.map(Number).slice(0, 3) : [];
  if (stars.length < 3) {
    const base = scoreGoal ? scoreGoal.target : 1000;
    stars = [base, Math.round(base * 1.4), Math.round(base * 1.8)];
  }

  return {
    id,
    name: raw.name || `Fase ${id}`,
    chapter: raw.chapter || null,
    moves: Math.max(1, Number(raw.moves) || 20),
    pool,
    featured: raw.featured && valid.has(raw.featured) ? raw.featured : pool[0],
    goals: goals.filter((g) => g.type !== 'saint' || valid.has(g.saint)),
    stars,
    moveBonus: Number(raw.moveBonus) || DEFAULT_MOVE_BONUS,
    hint: raw.hint || '',
  };
}

/** Acompanha o andamento dos objetivos durante a partida. */
export class GoalTracker {
  constructor(goals) {
    this.goals = goals.map((g) => ({ ...g, current: 0 }));
    this.score = 0;
    this.cleared = 0;
    this.specials = 0;
    this.byType = {};
  }

  /** Registra o resultado de uma etapa da cascata. */
  record({ points = 0, clearedByType = {}, specialsCreated = 0 }) {
    this.score += points;
    this.specials += specialsCreated;
    for (const [type, n] of Object.entries(clearedByType)) {
      this.byType[type] = (this.byType[type] || 0) + n;
      this.cleared += n;
    }
    for (const g of this.goals) {
      if (g.type === 'score') g.current = this.score;
      else if (g.type === 'clear') g.current = this.cleared;
      else if (g.type === 'saint') g.current = this.byType[g.saint] || 0;
      else if (g.type === 'specials') g.current = this.specials;
    }
  }

  isComplete() {
    return this.goals.every((g) => g.current >= g.target);
  }

  /** Progresso geral de 0 a 1 (média dos objetivos). */
  progress() {
    if (!this.goals.length) return 0;
    const sum = this.goals.reduce((acc, g) => acc + Math.min(1, g.target ? g.current / g.target : 1), 0);
    return sum / this.goals.length;
  }
}

/** Texto curto de um objetivo. */
export function describeGoal(goal, saintName = (id) => id) {
  switch (goal.type) {
    case 'score':
      return `Faça ${goal.target.toLocaleString('pt-BR')} pontos`;
    case 'clear':
      return `Elimine ${goal.target} peças`;
    case 'saint':
      return `Elimine ${goal.target} peças de ${saintName(goal.saint)}`;
    case 'specials':
      return `Crie ${goal.target} peças especiais`;
    default:
      return 'Objetivo';
  }
}

/** Estrelas de uma vitória (sempre ao menos 1). */
export function starsForWin(score, thresholds) {
  let stars = 1;
  thresholds.forEach((t, i) => {
    if (score >= t) stars = Math.max(stars, i + 1);
  });
  return Math.min(3, stars);
}
