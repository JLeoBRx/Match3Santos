/**
 * board.js — modelo lógico do tabuleiro (sem DOM).
 *
 * Cada célula guarda uma peça { id, type, special } ou null.
 *  - type    → id do santo (string), ex.: "sao_jose"
 *  - special → null | 'row' | 'col' | 'cross' | 'area'
 */
import { BOARD_COLS, BOARD_ROWS } from './constants.js';
import { shuffle } from './utils.js';

let pieceSeq = 1;

export function makePiece(type, special = null) {
  return { id: pieceSeq++, type, special };
}

export const cellKey = (r, c) => `${r},${c}`;

export class Board {
  /**
   * @param {object} opts
   * @param {string[]} opts.types  ids dos santos que podem aparecer
   * @param {() => number} [opts.rng]
   */
  constructor({ rows = BOARD_ROWS, cols = BOARD_COLS, types, rng = Math.random }) {
    if (!types || types.length < 3) throw new Error('O tabuleiro precisa de pelo menos 3 tipos de peça.');
    this.rows = rows;
    this.cols = cols;
    this.types = types.slice();
    this.rng = rng;
    this.grid = Array.from({ length: rows }, () => Array(cols).fill(null));
  }

  inBounds(r, c) {
    return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
  }

  get(r, c) {
    return this.inBounds(r, c) ? this.grid[r][c] : null;
  }

  set(r, c, piece) {
    this.grid[r][c] = piece;
  }

  static adjacent(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  randomType(exclude = null) {
    const options = exclude ? this.types.filter((t) => !exclude.has(t)) : this.types;
    const list = options.length ? options : this.types;
    return list[Math.floor(this.rng() * list.length)];
  }

  /** Tipos que formariam trinca se colocados em (r,c), olhando só esquerda e acima. */
  forbiddenAt(r, c) {
    const forbid = new Set();
    const l1 = this.get(r, c - 1);
    const l2 = this.get(r, c - 2);
    if (l1 && l2 && l1.type === l2.type) forbid.add(l1.type);
    const u1 = this.get(r - 1, c);
    const u2 = this.get(r - 2, c);
    if (u1 && u2 && u1.type === u2.type) forbid.add(u1.type);
    return forbid;
  }

  /**
   * Preenche o tabuleiro inteiro sem nenhuma combinação pronta
   * e garantindo pelo menos uma jogada possível.
   */
  fillInitial() {
    for (let attempt = 0; attempt < 200; attempt++) {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          this.grid[r][c] = null;
          this.grid[r][c] = makePiece(this.randomType(this.forbiddenAt(r, c)));
        }
      }
      if (!this.hasAnyMatch() && this.hasPossibleMove()) return this;
    }
    throw new Error('Não foi possível gerar um tabuleiro válido.');
  }

  /** Troca o conteúdo de duas células. */
  swap(a, b) {
    const tmp = this.grid[a.r][a.c];
    this.grid[a.r][a.c] = this.grid[b.r][b.c];
    this.grid[b.r][b.c] = tmp;
  }

  /** Tamanho das sequências horizontal e vertical que passam por (r,c). */
  runLengthsAt(r, c) {
    const p = this.get(r, c);
    if (!p) return { h: 0, v: 0 };
    let h = 1;
    for (let x = c - 1; x >= 0 && this.grid[r][x]?.type === p.type; x--) h++;
    for (let x = c + 1; x < this.cols && this.grid[r][x]?.type === p.type; x++) h++;
    let v = 1;
    for (let y = r - 1; y >= 0 && this.grid[y][c]?.type === p.type; y--) v++;
    for (let y = r + 1; y < this.rows && this.grid[y][c]?.type === p.type; y++) v++;
    return { h, v };
  }

  isMatchAt(r, c) {
    const { h, v } = this.runLengthsAt(r, c);
    return h >= 3 || v >= 3;
  }

  hasAnyMatch() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) if (this.isMatchAt(r, c)) return true;
    }
    return false;
  }

  /** A troca entre a e b gera combinação (ou é um combo de duas especiais)? */
  isValidSwap(a, b) {
    if (!this.inBounds(a.r, a.c) || !this.inBounds(b.r, b.c) || !Board.adjacent(a, b)) return false;
    const pa = this.get(a.r, a.c);
    const pb = this.get(b.r, b.c);
    if (!pa || !pb) return false;
    if (pa.special && pb.special) return true;
    if (pa.type === pb.type) return false;
    this.swap(a, b);
    const ok = this.isMatchAt(a.r, a.c) || this.isMatchAt(b.r, b.c);
    this.swap(a, b);
    return ok;
  }

  /** Lista de jogadas válidas (até `limit`). */
  findPossibleMoves(limit = Infinity) {
    const moves = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const a = { r, c };
        for (const b of [{ r, c: c + 1 }, { r: r + 1, c }]) {
          if (this.inBounds(b.r, b.c) && this.isValidSwap(a, b)) {
            moves.push({ a, b });
            if (moves.length >= limit) return moves;
          }
        }
      }
    }
    return moves;
  }

  hasPossibleMove() {
    return this.findPossibleMoves(1).length > 0;
  }

  /** Remove as peças das células indicadas. Devolve as peças removidas. */
  removeCells(cells) {
    const removed = [];
    for (const { r, c } of cells) {
      const p = this.grid[r][c];
      if (p) removed.push({ r, c, piece: p });
      this.grid[r][c] = null;
    }
    return removed;
  }

  /**
   * Aplica gravidade e repõe peças no topo.
   * @returns {{ falls: Array<{piece, fromR, toR, c}>, spawns: Array<{piece, toR, c, dropRows}> }}
   */
  collapse() {
    const falls = [];
    const spawns = [];
    for (let c = 0; c < this.cols; c++) {
      let write = this.rows - 1;
      for (let r = this.rows - 1; r >= 0; r--) {
        const p = this.grid[r][c];
        if (!p) continue;
        if (r !== write) {
          this.grid[write][c] = p;
          this.grid[r][c] = null;
          falls.push({ piece: p, fromR: r, toR: write, c });
        }
        write--;
      }
      const empty = write + 1; // quantidade de células vazias no topo
      for (let r = write; r >= 0; r--) {
        const p = makePiece(this.randomType());
        this.grid[r][c] = p;
        spawns.push({ piece: p, toR: r, c, dropRows: empty });
      }
    }
    return { falls, spawns };
  }

  /**
   * Embaralha as peças existentes até não haver combinações e existir jogada.
   * @returns {Array<{piece, r, c}>} nova posição de cada peça
   */
  reshuffle() {
    const pieces = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (this.grid[r][c]) pieces.push(this.grid[r][c]);
    for (let attempt = 0; attempt < 120; attempt++) {
      const order = shuffle(pieces, this.rng);
      let i = 0;
      for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) this.grid[r][c] = order[i++] ?? null;
      if (!this.hasAnyMatch() && this.hasPossibleMove()) return this.positions();
    }
    // Último recurso: troca os tipos das peças comuns, preservando as especiais.
    for (let attempt = 0; attempt < 200; attempt++) {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const p = this.grid[r][c];
          if (!p.special) p.type = this.randomType(this.forbiddenAt(r, c));
        }
      }
      if (!this.hasAnyMatch() && this.hasPossibleMove()) break;
    }
    return this.positions();
  }

  positions() {
    const list = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (this.grid[r][c]) list.push({ piece: this.grid[r][c], r, c });
    return list;
  }

  /** Utilitário para testes: cria um tabuleiro a partir de uma matriz de tipos. */
  static fromMatrix(matrix, types, rng) {
    const allTypes = types || [...new Set(matrix.flat().map((t) => String(t).split(':')[0]))];
    const board = new Board({ rows: matrix.length, cols: matrix[0].length, types: allTypes, rng });
    matrix.forEach((row, r) =>
      row.forEach((cell, c) => {
        if (cell === null) return;
        const [type, special] = String(cell).split(':');
        board.grid[r][c] = makePiece(type, special || null);
      }),
    );
    return board;
  }

  toMatrix() {
    return this.grid.map((row) => row.map((p) => (p ? p.type + (p.special ? ':' + p.special : '') : null)));
  }
}
