/**
 * simulate_levels.mjs — testa a dificuldade de cada fase de data/levels.json
 * com um jogador automático "atento" (prioriza sequências longas e os santos
 * pedidos nos objetivos). Mostra taxa de vitória e estrelas médias.
 *
 * Uso: node tools/simulate_levels.mjs [partidas=60]
 */
import { readFileSync } from 'node:fs';
import { Board } from '../js/board.js';
import { resolveStep, applyStep, countClearedByType } from '../js/matching.js';
import { scoreStep } from '../js/scoring.js';
import { GoalTracker, normalizeLevel, starsForWin } from '../js/goals.js';
import { createRng } from '../js/utils.js';

const games = Number(process.argv.find((a) => /^\d+$/.test(a)) || 60);
const suggest = process.argv.includes('--sugerir');
const root = new URL('../', import.meta.url);
const saints = JSON.parse(readFileSync(new URL('data/saints.json', root), 'utf8')).saints.map((s) => s.id);
const levels = JSON.parse(readFileSync(new URL('data/levels.json', root), 'utf8')).levels.map((l) => normalizeLevel(l, saints));

function chooseMove(board, moves, wanted, rng, skill) {
  if (rng() > skill) return moves[Math.floor(rng() * moves.length)];
  let best = null;
  let bestV = -1;
  for (const mv of moves) {
    board.swap(mv.a, mv.b);
    const la = board.runLengthsAt(mv.a.r, mv.a.c);
    const lb = board.runLengthsAt(mv.b.r, mv.b.c);
    const pa = board.get(mv.a.r, mv.a.c);
    const pb = board.get(mv.b.r, mv.b.c);
    board.swap(mv.a, mv.b);
    let v = Math.max(la.h, la.v, lb.h, lb.v);
    if (la.h >= 3 && la.v >= 3) v += 1.5;
    if (lb.h >= 3 && lb.v >= 3) v += 1.5;
    if (pa.special || pb.special) v += 2;
    if (pa.special && pb.special) v += 4;
    if ((wanted.has(pa.type) && Math.max(la.h, la.v) >= 3) || (wanted.has(pb.type) && Math.max(lb.h, lb.v) >= 3)) v += 2;
    v += rng() * 0.4;
    if (v > bestV) {
      bestV = v;
      best = mv;
    }
  }
  return best;
}

function play(level, rng, skill) {
  const board = new Board({ types: level.pool, rng }).fillInitial();
  const tracker = new GoalTracker(level.goals);
  const wanted = new Set(level.goals.filter((g) => g.type === 'saint').map((g) => g.saint));
  let moves = level.moves;
  while (moves > 0) {
    const mv = chooseMove(board, board.findPossibleMoves(), wanted, rng, skill);
    const pa = board.get(mv.a.r, mv.a.c);
    const pb = board.get(mv.b.r, mv.b.c);
    board.swap(mv.a, mv.b);
    moves--;
    let first = true;
    let step = 0;
    for (;;) {
      const res = resolveStep(board, first ? { swapCells: [mv.a, mv.b], combo: pa.special && pb.special ? mv : null } : {});
      first = false;
      if (!res) break;
      step++;
      tracker.record({ points: scoreStep(res, step).points, clearedByType: countClearedByType(res), specialsCreated: res.creations.length });
      applyStep(board, res);
      board.collapse();
    }
    if (!board.hasPossibleMove()) board.reshuffle();
    if (tracker.isComplete()) {
      const final = tracker.score + moves * level.moveBonus;
      return { win: true, stars: starsForWin(final, level.stars), left: moves, final };
    }
  }
  return { win: false, stars: 0, left: 0, final: tracker.score };
}

const suggestions = {};
const pct = (list, p) => list[Math.min(list.length - 1, Math.floor(p * list.length))] || 0;
const round100 = (v) => Math.round(v / 100) * 100;
console.log('fase tipos mov | casual: vitória ★méd sobra | atento: vitória ★méd sobra pontos');
for (const level of levels) {
  const finals = [];
  const rows = [];
  for (const skill of [0.5, 0.95]) {
    const rng = createRng(1000 + level.id);
    let wins = 0;
    let stars = 0;
    let left = 0;
    let final = 0;
    for (let g = 0; g < games; g++) {
      const r = play(level, rng, skill);
      wins += r.win ? 1 : 0;
      stars += r.stars;
      left += r.left;
      final += r.final;
      if (skill > 0.9 && r.win) finals.push(r.final);
    }
    rows.push(`${String(Math.round((wins / games) * 100)).padStart(3)}% ${(stars / games).toFixed(1)} ${(left / Math.max(1, wins)).toFixed(1).padStart(4)}`);
    if (skill > 0.9) rows[rows.length - 1] += ` ${Math.round(final / games)}`;
  }
  finals.sort((a, b) => a - b);
  const scoreGoal = level.goals.find((g) => g.type === 'score');
  const s1 = scoreGoal ? scoreGoal.target : round100(pct(finals, 0.1));
  const s2 = Math.max(s1 + 300, round100(pct(finals, 0.35)));
  const s3 = Math.max(s2 + 300, round100(pct(finals, 0.75)));
  suggestions[level.id] = [s1, s2, s3];
  console.log(`${String(level.id).padStart(4)} ${String(level.pool.length).padStart(5)} ${String(level.moves).padStart(3)} |  ${rows[0]}   |  ${rows[1]}   ${level.goals.map((g) => g.type + ':' + g.target).join(' + ')} ★${level.stars.join('/')}`);
}

if (suggest) {
  console.log('\nSugestão de estrelas (pontuação final, já com bônus de movimentos):');
  console.log(JSON.stringify(suggestions));
}
