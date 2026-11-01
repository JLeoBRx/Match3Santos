/**
 * input.js — entrada por mouse, toque e caneta (Pointer Events).
 * Suporta: toque/clique em duas peças adjacentes OU arrastar uma peça na direção desejada.
 * Também aceita teclado: setas movem o cursor, Enter/Espaço seleciona.
 */

export class BoardInput {
  /**
   * @param {HTMLElement} root elemento do tabuleiro
   * @param {object} handlers
   * @param {(cell)=>{r,c}|null} handlers.cellFromPoint
   * @param {()=>number} handlers.cellSize
   * @param {(cell)=>void} handlers.onTap
   * @param {(from, to)=>void} handlers.onDrag
   * @param {(cell)=>void} [handlers.onCursor]
   */
  constructor(root, handlers) {
    this.root = root;
    this.h = handlers;
    this.start = null;
    this.cursor = null;
    this.onDown = this.onDown.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onUp = this.onUp.bind(this);
    this.onKey = this.onKey.bind(this);
    root.addEventListener('pointerdown', this.onDown);
    root.addEventListener('pointermove', this.onMove);
    root.addEventListener('pointerup', this.onUp);
    root.addEventListener('pointercancel', this.onUp);
    root.addEventListener('keydown', this.onKey);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const cell = this.h.cellFromPoint(e.clientX, e.clientY);
    if (!cell) return;
    e.preventDefault();
    this.start = { cell, x: e.clientX, y: e.clientY, id: e.pointerId, dragged: false };
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      /* alguns navegadores antigos */
    }
  }

  onMove(e) {
    const s = this.start;
    if (!s || s.id !== e.pointerId || s.dragged) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const threshold = Math.max(10, this.h.cellSize() * 0.32);
    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
    s.dragged = true;
    const dir = Math.abs(dx) > Math.abs(dy) ? { r: 0, c: Math.sign(dx) } : { r: Math.sign(dy), c: 0 };
    this.h.onDrag(s.cell, { r: s.cell.r + dir.r, c: s.cell.c + dir.c });
  }

  onUp(e) {
    const s = this.start;
    if (!s || s.id !== e.pointerId) return;
    this.start = null;
    try {
      this.root.releasePointerCapture(e.pointerId);
    } catch {
      /* ignora */
    }
    if (!s.dragged && e.type === 'pointerup') this.h.onTap(s.cell);
  }

  onKey(e) {
    const keys = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (keys[e.key]) {
      e.preventDefault();
      const cur = this.cursor || { r: 3, c: 3 };
      const [dr, dc] = keys[e.key];
      this.cursor = { r: Math.max(0, Math.min(7, cur.r + dr)), c: Math.max(0, Math.min(7, cur.c + dc)) };
      this.h.onCursor?.(this.cursor);
    } else if ((e.key === 'Enter' || e.key === ' ') && this.cursor) {
      e.preventDefault();
      this.h.onTap(this.cursor);
    }
  }

  destroy() {
    this.root.removeEventListener('pointerdown', this.onDown);
    this.root.removeEventListener('pointermove', this.onMove);
    this.root.removeEventListener('pointerup', this.onUp);
    this.root.removeEventListener('pointercancel', this.onUp);
    this.root.removeEventListener('keydown', this.onKey);
  }
}
