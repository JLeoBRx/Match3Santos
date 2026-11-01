/**
 * matching.js — detecção de combinações, criação e ativação de peças especiais.
 * Módulo puro: opera sobre um Board, sem DOM.
 */
import { SPECIAL } from './constants.js';
import { cellKey, makePiece } from './board.js';

/** Encontra todas as sequências (runs) de 3+ peças iguais, horizontais e verticais. */
export function findRuns(board) {
  const runs = [];
  const scan = (outer, inner, getter, dir) => {
    for (let o = 0; o < outer; o++) {
      let start = 0;
      while (start < inner) {
        const p = getter(o, start);
        if (!p) {
          start++;
          continue;
        }
        let end = start + 1;
        while (end < inner && getter(o, end)?.type === p.type) end++;
        if (end - start >= 3) {
          const cells = [];
          for (let i = start; i < end; i++) cells.push(dir === 'h' ? { r: o, c: i } : { r: i, c: o });
          runs.push({ dir, type: p.type, cells, length: end - start });
        }
        start = end;
      }
    }
  };
  scan(board.rows, board.cols, (r, c) => board.get(r, c), 'h');
  scan(board.cols, board.rows, (c, r) => board.get(r, c), 'v');
  return runs;
}

/**
 * Agrupa runs que compartilham células (formatos L, T, +) em "grupos de combinação".
 * @returns {Array<{type, cells, runs, maxRun, hasH, hasV, intersections}>}
 */
export function findMatchGroups(board) {
  const runs = findRuns(board);
  if (!runs.length) return [];
  const parent = runs.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map();
  runs.forEach((run, i) => {
    for (const cell of run.cells) {
      const k = cellKey(cell.r, cell.c);
      if (owner.has(k)) parent[find(i)] = find(owner.get(k));
      else owner.set(k, i);
    }
  });
  const byRoot = new Map();
  runs.forEach((run, i) => {
    const root = find(i);
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root).push(run);
  });
  const groups = [];
  for (const groupRuns of byRoot.values()) {
    const cellMap = new Map();
    const hits = new Map();
    for (const run of groupRuns) {
      for (const cell of run.cells) {
        const k = cellKey(cell.r, cell.c);
        cellMap.set(k, cell);
        hits.set(k, (hits.get(k) || 0) + 1);
      }
    }
    const intersections = [...hits.entries()].filter(([, n]) => n > 1).map(([k]) => cellMap.get(k));
    groups.push({
      type: groupRuns[0].type,
      cells: [...cellMap.values()],
      runs: groupRuns,
      maxRun: Math.max(...groupRuns.map((r) => r.length)),
      hasH: groupRuns.some((r) => r.dir === 'h'),
      hasV: groupRuns.some((r) => r.dir === 'v'),
      intersections,
    });
  }
  return groups;
}

/** Classificação do grupo para pontuação/feedback. */
export function groupKind(group) {
  if (group.maxRun >= 5) return 'five';
  if (group.hasH && group.hasV) return 'cross';
  if (group.maxRun === 4) return 'four';
  return 'three';
}

/**
 * Decide se o grupo cria uma peça especial e onde.
 * @param {Set<string>} preferKeys células envolvidas na troca do jogador
 */
export function decideSpecial(group, preferKeys = new Set()) {
  const kind = groupKind(group);
  let special = null;
  if (kind === 'five') special = SPECIAL.AREA;
  else if (kind === 'cross') special = SPECIAL.CROSS;
  else if (kind === 'four') {
    const run4 = group.runs.find((r) => r.length === 4) || group.runs[0];
    special = run4.dir === 'h' ? SPECIAL.ROW : SPECIAL.COL;
  }
  if (!special) return null;

  let at = group.cells.find((cell) => preferKeys.has(cellKey(cell.r, cell.c)));
  if (!at && special === SPECIAL.CROSS && group.intersections.length) at = group.intersections[0];
  if (!at) {
    const longest = group.runs.reduce((a, b) => (b.length > a.length ? b : a));
    at = longest.cells[Math.floor((longest.length - 1) / 2)];
  }
  return { special, r: at.r, c: at.c, type: group.type };
}

/** Células atingidas por uma peça especial ativada em (r,c). */
export function specialArea(board, r, c, special) {
  const cells = [];
  const add = (y, x) => board.inBounds(y, x) && cells.push({ r: y, c: x });
  const addRow = (y) => {
    for (let x = 0; x < board.cols; x++) add(y, x);
  };
  const addCol = (x) => {
    for (let y = 0; y < board.rows; y++) add(y, x);
  };
  switch (special) {
    case SPECIAL.ROW:
      addRow(r);
      break;
    case SPECIAL.COL:
      addCol(c);
      break;
    case SPECIAL.CROSS:
      addRow(r);
      addCol(c);
      break;
    case SPECIAL.AREA:
      for (let y = r - 2; y <= r + 2; y++) for (let x = c - 2; x <= c + 2; x++) add(y, x);
      break;
    default:
      add(r, c);
  }
  return dedupe(cells);
}

/**
 * Área de efeito ao trocar DUAS peças especiais entre si.
 * @returns {{ cells, label, shape }}
 */
export function comboArea(board, at, sa, sb) {
  const isLine = (s) => s === SPECIAL.ROW || s === SPECIAL.COL;
  const cells = [];
  const add = (y, x) => board.inBounds(y, x) && cells.push({ r: y, c: x });
  const rowsCols = (radius) => {
    for (let d = -radius; d <= radius; d++) {
      for (let x = 0; x < board.cols; x++) add(at.r + d, x);
      for (let y = 0; y < board.rows; y++) add(y, at.c + d);
    }
  };
  let label;
  let shape;
  if (sa === SPECIAL.AREA && sb === SPECIAL.AREA) {
    for (let y = at.r - 3; y <= at.r + 3; y++) for (let x = at.c - 3; x <= at.c + 3; x++) add(y, x);
    label = 'Explosão de Glória!';
    shape = { kind: 'area', radius: 3 };
  } else if (isLine(sa) && isLine(sb)) {
    rowsCols(0);
    label = 'Cruz de Luz!';
    shape = { kind: 'lines', radius: 0 };
  } else {
    rowsCols(1);
    label = 'Grande Cruz!';
    shape = { kind: 'lines', radius: 1 };
  }
  return { cells: dedupe(cells), label, shape };
}

function dedupe(cells) {
  const seen = new Set();
  return cells.filter((cell) => {
    const k = cellKey(cell.r, cell.c);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Resolve UMA etapa da cascata: identifica combinações, peças especiais criadas
 * e reações em cadeia. NÃO altera o tabuleiro (ver applyStep).
 *
 * @param {Board} board
 * @param {object} [opts]
 * @param {Array<{r,c}>} [opts.swapCells] células da troca do jogador (1ª etapa)
 * @param {{a:{r,c}, b:{r,c}}} [opts.combo] troca entre duas especiais
 * @returns {null | { groups, cleared, creations, effects, combo }}
 */
export function resolveStep(board, { swapCells = [], combo = null } = {}) {
  const groups = combo ? [] : findMatchGroups(board);
  if (!groups.length && !combo) return null;

  const clear = new Map(); // key → { r, c, piece, byEffect }
  const creations = [];
  const effects = [];
  const activated = new Set();
  const queue = [];
  const preferKeys = new Set(swapCells.map((cell) => cellKey(cell.r, cell.c)));

  const mark = (r, c, byEffect) => {
    const k = cellKey(r, c);
    const p = board.get(r, c);
    if (!p || clear.has(k)) return;
    clear.set(k, { r, c, piece: p, byEffect });
    if (p.special && !activated.has(p.id)) queue.push({ r, c, piece: p });
  };

  let comboInfo = null;
  if (combo) {
    const pa = board.get(combo.a.r, combo.a.c);
    const pb = board.get(combo.b.r, combo.b.c);
    activated.add(pa.id);
    activated.add(pb.id);
    clear.set(cellKey(combo.a.r, combo.a.c), { ...combo.a, piece: pa, byEffect: true });
    clear.set(cellKey(combo.b.r, combo.b.c), { ...combo.b, piece: pb, byEffect: true });
    const area = comboArea(board, combo.b, pa.special, pb.special);
    comboInfo = { at: combo.b, specials: [pa.special, pb.special], label: area.label, type: pb.type };
    effects.push({ kind: 'combo', r: combo.b.r, c: combo.b.c, cells: area.cells, shape: area.shape, type: pb.type });
    for (const cell of area.cells) mark(cell.r, cell.c, true);
  }

  for (const group of groups) {
    for (const cell of group.cells) mark(cell.r, cell.c, false);
    const sp = decideSpecial(group, preferKeys);
    if (sp) creations.push(sp);
    group.kind = groupKind(group);
  }

  // Reações em cadeia: especiais atingidas também são ativadas.
  while (queue.length) {
    const item = queue.shift();
    if (activated.has(item.piece.id)) continue;
    activated.add(item.piece.id);
    const cells = specialArea(board, item.r, item.c, item.piece.special);
    effects.push({ kind: item.piece.special, r: item.r, c: item.c, cells, type: item.piece.type });
    for (const cell of cells) mark(cell.r, cell.c, true);
  }

  return { groups, cleared: [...clear.values()], creations, effects, combo: comboInfo };
}

/**
 * Aplica a etapa resolvida: remove as peças e coloca as especiais criadas.
 * Preenche `creation.piece` com a nova peça.
 */
export function applyStep(board, step) {
  board.removeCells(step.cleared);
  for (const creation of step.creations) {
    const piece = makePiece(creation.type, creation.special);
    board.set(creation.r, creation.c, piece);
    creation.piece = piece;
  }
  return step;
}

/** Contagem de peças eliminadas por santo (desconsidera a peça que virou especial). */
export function countClearedByType(step) {
  const counts = {};
  for (const { piece } of step.cleared) counts[piece.type] = (counts[piece.type] || 0) + 1;
  for (const creation of step.creations) counts[creation.type] = Math.max(0, (counts[creation.type] || 0) - 1);
  return counts;
}
