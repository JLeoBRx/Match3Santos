/**
 * game.js — controlador da partida: une o modelo (Board), as regras (matching/scoring),
 * a renderização (BoardRenderer) e a entrada (BoardInput).
 *
 * Não conhece fases nem modo infinito: comunica-se com a "sessão" por callbacks.
 */
import { BOARD_COLS, BOARD_ROWS, FRAME_COLORS, SPECIAL, TIMING } from './constants.js';
import { Board } from './board.js';
import { applyStep, countClearedByType, resolveStep } from './matching.js';
import { cascadeLabel, scoreStep } from './scoring.js';
import { BoardRenderer } from './renderer.js';
import { BoardInput } from './input.js';
import { formatNumber, pick, sleep } from './utils.js';

export class Game {
  /**
   * @param {object} o
   * @param {HTMLElement} o.boardEl
   * @param {import('./saints.js').SaintRegistry} o.saints
   * @param {string[]} o.pool ids dos santos no tabuleiro
   * @param {import('./audio.js').AudioManager} o.audio
   * @param {import('./effects.js').Effects} o.effects
   * @param {()=>object} o.prefs preferências atuais
   * @param {object} o.on callbacks: moveStart(), step(info), turnEnd(turn) → Promise|void
   */
  constructor(o) {
    this.o = o;
    this.root = o.boardEl;
    this.audio = o.audio;
    this.effects = o.effects;
    this.on = o.on || {};
    this.locked = true;
    this.ended = false;
    this.paused = false;
    this.selected = null;
    this.hintTimer = null;
    this.setPool(o.pool);
    const reduced = () => Boolean(o.prefs().reducedMotion);
    this.reduced = reduced;
    this.renderer = new BoardRenderer(this.root, { rows: BOARD_ROWS, cols: BOARD_COLS, info: (t) => this.typeInfo(t), reduced });
    this.input = new BoardInput(this.root, {
      cellFromPoint: (x, y) => this.renderer.cellFromPoint(x, y),
      cellSize: () => this.renderer.cellSize(),
      onTap: (cell) => this.tap(cell),
      onDrag: (from, to) => this.attemptSwap(from, to),
      onCursor: (cell) => this.renderer.setCursor?.(cell),
    });
  }

  setPool(pool) {
    this.pool = pool.slice();
    this.colors = new Map(this.pool.map((id, i) => [id, FRAME_COLORS[i % FRAME_COLORS.length]]));
  }

  typeInfo(type) {
    const s = this.o.saints.get(type);
    return { url: s?.thumbUrl || '', color: this.colors.get(type) || '#ffffff', name: s?.name || type };
  }

  get interactive() {
    return !this.locked && !this.ended && !this.paused;
  }

  async start() {
    this.board = new Board({ rows: BOARD_ROWS, cols: BOARD_COLS, types: this.pool }).fillInitial();
    await this.renderer.build(this.board, { intro: true });
    this.locked = false;
    this.scheduleHint();
  }

  /** Troca o tabuleiro inteiro (nova etapa do modo infinito). */
  async newBoard(pool) {
    this.locked = true;
    this.clearSelection();
    await this.renderer.outro();
    this.setPool(pool);
    this.board = new Board({ rows: BOARD_ROWS, cols: BOARD_COLS, types: this.pool }).fillInitial();
    await this.renderer.build(this.board, { intro: true });
    if (!this.ended) this.locked = false;
    this.scheduleHint();
  }

  setPaused(paused) {
    this.paused = paused;
    if (paused) this.clearHint();
    else this.scheduleHint();
  }

  end() {
    this.ended = true;
    this.locked = true;
    this.clearHint();
    this.clearSelection();
  }

  destroy() {
    this.end();
    this.input.destroy();
  }

  // ------------------------------------------------------------------ seleção
  clearSelection() {
    this.selected = null;
    this.renderer.deselect();
  }

  tap(cell) {
    if (!this.interactive) return;
    const piece = this.board.get(cell.r, cell.c);
    if (!piece) return;
    if (!this.selected) {
      this.selected = cell;
      this.renderer.select(piece);
      this.audio.play('select');
      return;
    }
    const sel = this.selected;
    if (sel.r === cell.r && sel.c === cell.c) {
      this.clearSelection();
      return;
    }
    if (Board.adjacent(sel, cell)) {
      this.attemptSwap(sel, cell);
      return;
    }
    this.selected = cell;
    this.renderer.select(piece);
    this.audio.play('select');
  }

  // ------------------------------------------------------------------ jogada
  async attemptSwap(a, b) {
    if (!this.interactive) return;
    if (!this.board.inBounds(b.r, b.c) || !Board.adjacent(a, b)) return;
    this.clearSelection();
    this.clearHint();
    this.locked = true;
    const pa = this.board.get(a.r, a.c);
    const pb = this.board.get(b.r, b.c);

    if (!this.board.isValidSwap(a, b)) {
      this.audio.play('invalid');
      await this.renderer.invalidSwap(a, b, pa, pb);
      if (!this.ended) this.locked = false;
      this.scheduleHint();
      return;
    }

    this.board.swap(a, b);
    this.audio.play('swap');
    await this.renderer.swap(a, b, pa, pb);
    this.on.moveStart?.();
    const combo = pa.special && pb.special ? { a, b } : null;
    const turn = await this.resolve({ swapCells: [a, b], combo });

    if (!this.board.hasPossibleMove()) await this.reshuffle();
    await this.on.turnEnd?.(turn);
    if (!this.ended) {
      this.locked = false;
      this.scheduleHint();
    }
  }

  /** Resolve a jogada inteira, incluindo cascatas. Devolve o resumo da jogada. */
  async resolve(firstOpts) {
    const turn = {
      steps: 0,
      points: 0,
      groups: [],
      matchesBySaint: {},
      clearedBySaint: {},
      specialsCreated: 0,
      combo: null,
    };
    let opts = firstOpts;
    let stepIndex = 0;
    for (;;) {
      const step = resolveStep(this.board, opts);
      opts = {};
      if (!step) break;
      stepIndex++;
      const score = scoreStep(step, stepIndex);
      const cleared = countClearedByType(step);
      applyStep(this.board, step);

      for (const g of step.groups) {
        turn.matchesBySaint[g.type] = (turn.matchesBySaint[g.type] || 0) + 1;
        turn.groups.push({ type: g.type, size: g.cells.length, kind: g.kind, step: stepIndex });
      }
      for (const [type, n] of Object.entries(cleared)) turn.clearedBySaint[type] = (turn.clearedBySaint[type] || 0) + n;
      turn.specialsCreated += step.creations.length;
      turn.points += score.points;
      if (step.combo) turn.combo = step.combo;

      this.on.step?.({ step, stepIndex, score, cleared });
      this.feedback(step, stepIndex, score);
      await this.renderer.clearStep(step);
      const fall = this.board.collapse();
      await this.renderer.collapse(fall);
      if (stepIndex > 50) break; // salvaguarda contra laços improváveis
    }
    turn.steps = stepIndex;
    return turn;
  }

  /** Sons, partículas e textos de uma etapa. */
  feedback(step, stepIndex, score) {
    const kinds = new Set(step.effects.map((e) => e.kind));
    if (step.combo) this.audio.play('combo');
    else if (kinds.has(SPECIAL.AREA)) this.audio.play('area');
    else if (kinds.size) this.audio.play('line');
    this.audio.play('match', { step: stepIndex });
    if (stepIndex >= 2) this.audio.play('cascade', { step: stepIndex });
    if (step.creations.length) setTimeout(() => this.audio.play('special'), 160);

    // Partículas (limitadas para preservar desempenho)
    if (!this.reduced()) {
      const stride = Math.max(1, Math.ceil(step.cleared.length / 26));
      step.cleared.forEach((item, i) => {
        if (i % stride) return;
        const { x, y } = this.renderer.cellCenter(item.r, item.c);
        this.effects.burst(x, y, this.colors.get(item.piece.type), step.cleared.length > 12 ? 5 : 8);
      });
    }

    // Pontos flutuando sobre a combinação principal
    const anchor = step.combo?.at || step.creations[0] || step.groups[0]?.cells[Math.floor(step.groups[0].cells.length / 2)] || step.effects[0];
    if (anchor) {
      const p = this.renderer.cellPct(anchor.r, anchor.c);
      const label = score.multiplier > 1 ? `+${formatNumber(score.points)} ×${score.multiplier}` : `+${formatNumber(score.points)}`;
      this.effects.floatText(this.renderer.fx, p.x, p.y, label, score.multiplier > 1 ? 'float-score multi' : 'float-score');
    }
    const word = step.combo?.label || cascadeLabel(stepIndex);
    if (word) this.effects.floatText(this.renderer.fx, 50, 46, word, 'float-word');
  }

  async reshuffle() {
    this.audio.play('shuffle');
    this.effects.floatText(this.renderer.fx, 50, 50, 'Sem jogadas — embaralhando!', 'float-word small');
    await sleep(this.reduced() ? 100 : 450);
    const positions = this.board.reshuffle();
    await this.renderer.reshuffle(positions);
  }

  // ------------------------------------------------------------------ dicas
  scheduleHint() {
    this.clearHint();
    if (!this.o.prefs().hints || this.ended) return;
    this.hintTimer = setTimeout(() => this.showHint(), TIMING.hintDelay);
  }

  showHint() {
    if (!this.interactive) return;
    const moves = this.board.findPossibleMoves();
    if (!moves.length) return;
    const m = pick(moves);
    const pa = this.board.get(m.a.r, m.a.c);
    const pb = this.board.get(m.b.r, m.b.c);
    this.renderer.showHint(pa, pb, { r: m.b.r - m.a.r, c: m.b.c - m.a.c });
  }

  clearHint() {
    clearTimeout(this.hintTimer);
    this.hintTimer = null;
    this.renderer?.clearHint();
  }
}
