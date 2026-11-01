/**
 * simulate.mjs — ferramenta de balanceamento.
 * Simula partidas com um "jogador" automático para estimar pontos por jogada,
 * útil ao criar novas fases em data/levels.json.
 *
 * Uso:  node tools/simulate.mjs [qtdTipos=6] [jogadas=25] [partidas=200]
 */
import { Board } from '../js/board.js';
import { resolveStep, applyStep, countClearedByType } from '../js/matching.js';
import { scoreStep } from '../js/scoring.js';
import { createRng } from '../js/utils.js';

const nTypes = Number(process.argv[2] || 6);
const movesPerGame = Number(process.argv[3] || 25);
const games = Number(process.argv[4] || 200);

function playMove(board, move) {
  const { a, b } = move;
  const pa = board.get(a.r, a.c);
  const pb = board.get(b.r, b.c);
  board.swap(a, b);
  const combo = pa.special && pb.special ? { a, b } : null;
  let first = true;
  let step = 0;
  let points = 0;
  let cleared = 0;
  let specials = 0;
  for (;;) {
    const res = resolveStep(board, first ? { swapCells: [a, b], combo } : {});
    first = false;
    if (!res) break;
    step++;
    points += scoreStep(res, step).points;
    cleared += Object.values(countClearedByType(res)).reduce((x, y) => x + y, 0);
    specials += res.creations.length;
    applyStep(board, res);
    board.collapse();
    if (step > 60) break;
  }
  if (!board.hasPossibleMove()) board.reshuffle();
  return { points, cleared, steps: step, specials };
}

for (const strategy of ['random', 'greedy']) {
  let total = 0;
  let totalCleared = 0;
  let maxSteps = 0;
  let totalSpecials = 0;
  const rng = createRng(42);
  for (let g = 0; g < games; g++) {
    const types = Array.from({ length: nTypes }, (_, i) => 't' + i);
    const board = new Board({ types, rng }).fillInitial();
    for (let m = 0; m < movesPerGame; m++) {
      const moves = board.findPossibleMoves();
      let move = moves[Math.floor(rng() * moves.length)];
      if (strategy === 'greedy') {
        // Escolhe a jogada que forma a maior sequência imediata (como um jogador atento).
        let best = -1;
        for (const mv of moves) {
          board.swap(mv.a, mv.b);
          const la = board.runLengthsAt(mv.a.r, mv.a.c);
          const lb = board.runLengthsAt(mv.b.r, mv.b.c);
          board.swap(mv.a, mv.b);
          const pa = board.get(mv.a.r, mv.a.c);
          const pb = board.get(mv.b.r, mv.b.c);
          const bonus = (pa.special ? 3 : 0) + (pb.special ? 3 : 0);
          const v = Math.max(la.h, la.v, lb.h, lb.v) + bonus + rng() * 0.5;
          if (v > best) {
            best = v;
            move = mv;
          }
        }
      }
      const r = playMove(board, move);
      total += r.points;
      totalCleared += r.cleared;
      totalSpecials += r.specials;
      maxSteps = Math.max(maxSteps, r.steps);
    }
  }
  const n = games * movesPerGame;
  console.log(
    `${strategy.padEnd(6)} tipos=${nTypes}  pts/jogada=${(total / n).toFixed(0)}  peças/jogada=${(totalCleared / n).toFixed(1)}  ` +
      `especiais/jogada=${(totalSpecials / n).toFixed(2)}  maior cascata=${maxSteps}`,
  );
}
