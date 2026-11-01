/**
 * renderer.js — desenha o tabuleiro no DOM e executa as animações das peças.
 * Posições em porcentagem → o tabuleiro se adapta a qualquer tamanho de tela.
 */
import { SPECIAL, TIMING } from './constants.js';
import { el } from './utils.js';

/** Executa uma animação Web Animations e devolve uma Promise que nunca rejeita. */
function animate(node, keyframes, options) {
  if (!node || typeof node.animate !== 'function') return Promise.resolve();
  try {
    const anim = node.animate(keyframes, { fill: 'backwards', ...options });
    return anim.finished.then(
      () => anim,
      () => anim,
    );
  } catch {
    return Promise.resolve();
  }
}

export class BoardRenderer {
  /**
   * @param {HTMLElement} root  elemento .board
   * @param {object} opts
   * @param {(type:string)=>{url:string,color:string,name:string}} opts.info
   * @param {()=>boolean} opts.reduced
   */
  constructor(root, { rows, cols, info, reduced }) {
    this.root = root;
    this.rows = rows;
    this.cols = cols;
    this.info = info;
    this.reduced = reduced;
    this.tiles = new Map(); // piece.id → elemento
    root.innerHTML = '';
    root.style.setProperty('--rows', rows);
    root.style.setProperty('--cols', cols);
    this.bg = el('div', { class: 'board-bg', 'aria-hidden': 'true' });
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) this.bg.append(el('div', { class: `board-cell ${(r + c) % 2 ? 'odd' : ''}` }));
    this.layer = el('div', { class: 'board-tiles' });
    this.fx = el('div', { class: 'board-fx', 'aria-hidden': 'true' });
    root.append(this.bg, this.layer, this.fx);
    this.selected = null;
    this.hinted = [];
  }

  /** Multiplicador de duração (animações reduzidas = bem mais rápidas). */
  t(ms) {
    return this.reduced() ? Math.round(ms * 0.35) : ms;
  }

  pos(r, c) {
    return { left: (c * 100) / this.cols + '%', top: (r * 100) / this.rows + '%' };
  }

  createTile(piece, r, c) {
    const info = this.info(piece.type);
    const img = el('img', { src: info.url, alt: '', draggable: 'false' });
    const inner = el('div', { class: 'tile-inner' }, img, el('span', { class: 'tile-special' }), el('span', { class: 'tile-shine' }));
    const node = el('div', { class: 'tile', dataset: { id: piece.id }, title: info.name }, inner);
    node.style.setProperty('--frame', info.color);
    node.style.width = 100 / this.cols + '%';
    node.style.height = 100 / this.rows + '%';
    Object.assign(node.style, this.pos(r, c));
    this.applySpecial(node, piece.special);
    this.layer.append(node);
    this.tiles.set(piece.id, node);
    return node;
  }

  applySpecial(node, special) {
    node.classList.remove('special', 'special-row', 'special-col', 'special-cross', 'special-area');
    if (special) node.classList.add('special', `special-${special}`);
  }

  tileOf(piece) {
    return piece ? this.tiles.get(piece.id) : null;
  }

  place(piece, r, c) {
    const node = this.tileOf(piece);
    if (node) Object.assign(node.style, this.pos(r, c));
    return node;
  }

  /** Remove todas as peças e recria a partir do modelo, com animação de entrada. */
  async build(board, { intro = true } = {}) {
    this.layer.innerHTML = '';
    this.tiles.clear();
    const jobs = [];
    for (let r = 0; r < board.rows; r++) {
      for (let c = 0; c < board.cols; c++) {
        const p = board.get(r, c);
        if (!p) continue;
        const node = this.createTile(p, r, c);
        if (intro) {
          const delay = this.t(c * 28 + (board.rows - r) * 22);
          jobs.push(
            animate(
              node,
              [
                { transform: `translateY(${-(r + 2) * 100}%)`, opacity: 0 },
                { transform: 'translateY(0)', opacity: 1, offset: 0.85 },
                { transform: 'translateY(0)', opacity: 1 },
              ],
              { duration: this.t(420 + r * 25), delay, easing: 'cubic-bezier(.25,.9,.35,1.15)' },
            ),
          );
        }
      }
    }
    await Promise.all(jobs);
  }

  /** Animação de troca. As peças JÁ estão nas novas posições no modelo. */
  async swap(a, b, pa, pb) {
    const na = this.place(pa, b.r, b.c);
    const nb = this.place(pb, a.r, a.c);
    const dA = { x: (a.c - b.c) * 100, y: (a.r - b.r) * 100 };
    const opts = { duration: this.t(TIMING.swap), easing: 'cubic-bezier(.4,.0,.2,1)' };
    await Promise.all([
      animate(na, [{ transform: `translate(${dA.x}%, ${dA.y}%)` }, { transform: 'translate(0,0)' }], opts),
      animate(nb, [{ transform: `translate(${-dA.x}%, ${-dA.y}%)` }, { transform: 'translate(0,0)' }], opts),
    ]);
  }

  /** Troca inválida: as peças vão e voltam. Modelo inalterado. */
  async invalidSwap(a, b, pa, pb) {
    const na = this.tileOf(pa);
    const nb = this.tileOf(pb);
    const d = { x: (b.c - a.c) * 100, y: (b.r - a.r) * 100 };
    const opts = { duration: this.t(TIMING.invalidSwap * 2 + 60), easing: 'ease-in-out' };
    await Promise.all([
      animate(na, [{ transform: 'translate(0,0)' }, { transform: `translate(${d.x}%, ${d.y}%)`, offset: 0.45 }, { transform: `translate(${d.x}%, ${d.y}%)`, offset: 0.55 }, { transform: 'translate(0,0)' }], opts),
      animate(nb, [{ transform: 'translate(0,0)' }, { transform: `translate(${-d.x}%, ${-d.y}%)`, offset: 0.45 }, { transform: `translate(${-d.x}%, ${-d.y}%)`, offset: 0.55 }, { transform: 'translate(0,0)' }], opts),
    ]);
    na?.classList.add('shake');
    nb?.classList.add('shake');
    setTimeout(() => {
      na?.classList.remove('shake');
      nb?.classList.remove('shake');
    }, 320);
  }

  // ---------------------------------------------------------------- efeitos visuais
  beam(kind, index, delay = 0) {
    const node = el('div', { class: `fx-beam fx-beam-${kind}` });
    if (kind === 'h') node.style.top = ((index + 0.5) * 100) / this.rows + '%';
    else node.style.left = ((index + 0.5) * 100) / this.cols + '%';
    node.style.animationDelay = delay + 'ms';
    this.fx.append(node);
    setTimeout(() => node.remove(), 700 + delay);
  }

  ring(r, c, radiusCells, delay = 0) {
    const size = ((radiusCells * 2 + 1) * 100) / this.cols;
    const node = el('div', {
      class: 'fx-ring',
      style: {
        left: ((c + 0.5) * 100) / this.cols + '%',
        top: ((r + 0.5) * 100) / this.rows + '%',
        width: size + '%',
        height: size + '%',
        animationDelay: delay + 'ms',
      },
    });
    this.fx.append(node);
    setTimeout(() => node.remove(), 800 + delay);
  }

  glow(r, c) {
    const node = el('div', {
      class: 'fx-glow',
      style: { left: ((c + 0.5) * 100) / this.cols + '%', top: ((r + 0.5) * 100) / this.rows + '%', width: 100 / this.cols + '%', height: 100 / this.rows + '%' },
    });
    this.fx.append(node);
    setTimeout(() => node.remove(), 900);
  }

  playEffect(effect) {
    if (this.reduced()) return;
    const { kind, r, c } = effect;
    if (kind === SPECIAL.ROW) this.beam('h', r);
    else if (kind === SPECIAL.COL) this.beam('v', c);
    else if (kind === SPECIAL.CROSS) {
      this.beam('h', r);
      this.beam('v', c);
    } else if (kind === SPECIAL.AREA) this.ring(r, c, 2);
    else if (kind === 'combo') {
      if (effect.shape?.kind === 'area') this.ring(r, c, effect.shape.radius);
      else {
        const rad = effect.shape?.radius ?? 0;
        for (let d = -rad; d <= rad; d++) {
          if (r + d >= 0 && r + d < this.rows) this.beam('h', r + d, Math.abs(d) * 50);
          if (c + d >= 0 && c + d < this.cols) this.beam('v', c + d, Math.abs(d) * 50);
        }
      }
    }
  }

  /**
   * Anima a eliminação de uma etapa: efeitos especiais, peças sumindo e
   * criação de novas peças especiais. O modelo já foi atualizado (applyStep).
   */
  async clearStep(step) {
    step.effects.forEach((e) => this.playEffect(e));
    const creationAt = new Map(step.creations.map((cr) => [`${cr.r},${cr.c}`, cr]));
    // Para cada grupo que cria especial, as peças "convergem" para a célula de criação.
    const target = new Map();
    for (const group of step.groups) {
      const cr = group.cells.map((cell) => creationAt.get(`${cell.r},${cell.c}`)).find(Boolean);
      if (cr) for (const cell of group.cells) target.set(`${cell.r},${cell.c}`, cr);
    }
    const origins = step.effects.map((e) => ({ r: e.r, c: e.c }));
    const dur = this.t(TIMING.clear);
    const jobs = [];
    for (const item of step.cleared) {
      const node = this.tileOf(item.piece);
      if (!node) continue;
      this.tiles.delete(item.piece.id);
      node.classList.add('clearing');
      const inner = node.firstElementChild;
      const cr = target.get(`${item.r},${item.c}`);
      let delay = 0;
      if (item.byEffect && origins.length && !this.reduced()) {
        const dist = Math.min(...origins.map((o) => Math.abs(o.r - item.r) + Math.abs(o.c - item.c)));
        delay = Math.min(160, dist * 22);
      }
      let job;
      if (cr && !item.byEffect) {
        const dx = (cr.c - item.c) * 100;
        const dy = (cr.r - item.r) * 100;
        job = animate(node, [{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(${dx}%, ${dy}%) scale(.6)`, opacity: 0.2 }], {
          duration: dur,
          easing: 'cubic-bezier(.5,0,.8,.4)',
          fill: 'forwards',
        });
      } else {
        job = animate(
          inner,
          [
            { transform: 'scale(1)', opacity: 1, filter: 'brightness(1)' },
            { transform: 'scale(1.18)', opacity: 1, filter: 'brightness(1.8)', offset: 0.35 },
            { transform: 'scale(0.1) rotate(25deg)', opacity: 0, filter: 'brightness(2)' },
          ],
          { duration: dur, delay, easing: 'ease-in', fill: 'both' },
        );
      }
      jobs.push(job.then(() => node.remove()));
    }
    await Promise.all(jobs);
    // Novas peças especiais
    const pops = step.creations.map((cr) => {
      const node = this.createTile(cr.piece, cr.r, cr.c);
      this.glow(cr.r, cr.c);
      return animate(node.firstElementChild, [{ transform: 'scale(0.2)', opacity: 0 }, { transform: 'scale(1.25)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }], {
        duration: this.t(TIMING.createSpecial),
        easing: 'ease-out',
      });
    });
    await Promise.all(pops);
  }

  /** Queda das peças e entrada das novas pelo topo. O modelo já foi atualizado. */
  async collapse({ falls, spawns }) {
    const jobs = [];
    const fallAnim = (node, rows, delay = 0) =>
      animate(
        node,
        [
          { transform: `translateY(${-rows * 100}%)` },
          { transform: 'translateY(5%)', offset: 0.82 },
          { transform: 'translateY(0)' },
        ],
        { duration: this.t(TIMING.fallBase + TIMING.fallPerRow * rows), delay, easing: 'cubic-bezier(.45,.05,.75,.6)' },
      );
    for (const f of falls) {
      const node = this.place(f.piece, f.toR, f.c);
      if (node) jobs.push(fallAnim(node, f.toR - f.fromR));
    }
    for (const s of spawns) {
      const node = this.createTile(s.piece, s.toR, s.c);
      jobs.push(fallAnim(node, s.dropRows, this.t(s.c * 12)));
    }
    await Promise.all(jobs);
  }

  /** Embaralhamento: todas as peças voam para as novas posições. */
  async reshuffle(positions) {
    const jobs = [];
    for (const { piece, r, c } of positions) {
      const node = this.tileOf(piece);
      if (!node) continue;
      const oldLeft = parseFloat(node.style.left);
      const oldTop = parseFloat(node.style.top);
      Object.assign(node.style, this.pos(r, c));
      const dx = ((oldLeft - parseFloat(node.style.left)) / (100 / this.cols)) * 100;
      const dy = ((oldTop - parseFloat(node.style.top)) / (100 / this.rows)) * 100;
      this.applySpecial(node, piece.special);
      const img = node.querySelector('img');
      const info = this.info(piece.type);
      if (img && img.getAttribute('src') !== info.url) img.src = info.url;
      node.style.setProperty('--frame', info.color);
      jobs.push(
        animate(node, [{ transform: `translate(${dx}%, ${dy}%) scale(1)` }, { transform: `translate(${dx / 2}%, ${dy / 2}%) scale(.5) rotate(180deg)`, offset: 0.5 }, { transform: 'translate(0,0) scale(1)' }], {
          duration: this.t(TIMING.shuffle + 200),
          easing: 'ease-in-out',
        }),
      );
    }
    await Promise.all(jobs);
  }

  /** Saída do tabuleiro (troca de etapa no modo infinito). */
  async outro() {
    const nodes = [...this.tiles.values()];
    await Promise.all(
      nodes.map((node, i) =>
        animate(node.firstElementChild, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0) rotate(-30deg)', opacity: 0 }], {
          duration: this.t(320),
          delay: this.t((i % 8) * 18 + Math.floor(i / 8) * 10),
          easing: 'ease-in',
          fill: 'both',
        }),
      ),
    );
    this.layer.innerHTML = '';
    this.tiles.clear();
  }

  // ---------------------------------------------------------------- seleção e dicas
  select(piece) {
    this.deselect();
    const node = this.tileOf(piece);
    if (node) {
      node.classList.add('selected');
      this.selected = node;
    }
  }

  deselect() {
    this.selected?.classList.remove('selected');
    this.selected = null;
  }

  showHint(pa, pb, dir) {
    this.clearHint();
    for (const [p, sign] of [
      [pa, 1],
      [pb, -1],
    ]) {
      const node = this.tileOf(p);
      if (!node) continue;
      node.style.setProperty('--hint-x', dir.c * sign * 12 + '%');
      node.style.setProperty('--hint-y', dir.r * sign * 12 + '%');
      node.classList.add('hint');
      this.hinted.push(node);
    }
  }

  clearHint() {
    this.hinted.forEach((n) => n.classList.remove('hint'));
    this.hinted = [];
  }

  /** Cursor de teclado (acessibilidade). */
  setCursor(cell) {
    if (!this.cursorEl) {
      this.cursorEl = el('div', { class: 'board-cursor', 'aria-hidden': 'true' });
      this.cursorEl.style.width = 100 / this.cols + '%';
      this.cursorEl.style.height = 100 / this.rows + '%';
      this.fx.append(this.cursorEl);
    }
    Object.assign(this.cursorEl.style, this.pos(cell.r, cell.c));
  }

  // ---------------------------------------------------------------- geometria
  cellFromPoint(x, y) {
    const rect = this.root.getBoundingClientRect();
    const c = Math.floor(((x - rect.left) / rect.width) * this.cols);
    const r = Math.floor(((y - rect.top) / rect.height) * this.rows);
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return null;
    return { r, c };
  }

  cellSize() {
    return this.root.getBoundingClientRect().width / this.cols;
  }

  /** Centro da célula em coordenadas da janela (para partículas). */
  cellCenter(r, c) {
    const rect = this.root.getBoundingClientRect();
    return { x: rect.left + ((c + 0.5) * rect.width) / this.cols, y: rect.top + ((r + 0.5) * rect.height) / this.rows };
  }

  /** Centro da célula em % do tabuleiro (para textos flutuantes). */
  cellPct(r, c) {
    return { x: ((c + 0.5) * 100) / this.cols, y: ((r + 0.5) * 100) / this.rows };
  }
}
