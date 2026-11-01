/**
 * reflectionPanel.js — painel permanente de reflexões (parte inferior da partida).
 *
 * - Nunca abre janelas: atualiza o próprio painel com uma transição discreta.
 * - Cada reflexão fica visível por um tempo mínimo de leitura; combinações feitas
 *   nesse intervalo deixam UMA reflexão "na fila" (a mais recente substitui a anterior).
 * - O jogador pode fixar a reflexão atual (pausar atualizações) ou avançar para a da fila.
 */
import { el, escapeHtml } from './utils.js';
import { icon } from './icons.js';

const READING_TIME = { curto: 5000, normal: 10000, longo: 18000 };

export class ReflectionPanel {
  /**
   * @param {HTMLElement} root
   * @param {object} deps { library, saints, audio, store }
   */
  constructor(root, { library, saints, audio, store }) {
    this.root = root;
    this.library = library;
    this.saints = saints;
    this.audio = audio;
    this.store = store;
    this.pending = null;
    this.pinned = false;
    this.holdUntil = 0;
    this.timer = null;
    this.current = null;
    this.sessionCount = 0;
    this.sessionNew = 0;
    this.build();
  }

  build() {
    this.root.innerHTML = '';
    this.root.classList.add('reflection-panel');
    this.body = el('div', { class: 'rp-body', 'aria-live': 'polite' });
    this.holdBar = el('div', { class: 'rp-hold' }, el('span'));
    this.pinBtn = el('button', { class: 'rp-btn rp-pin', type: 'button', title: 'Fixar esta reflexão', 'aria-pressed': 'false', html: icon('pin'), onclick: () => this.togglePin() });
    this.queueBtn = el('button', { class: 'rp-queue', type: 'button', hidden: true, onclick: () => this.showPendingNow() });
    this.totalEl = el('div', { class: 'rp-total' });
    const header = el(
      'div',
      { class: 'rp-header' },
      el('div', { class: 'rp-label', html: `${icon('book')}<span>Reflexão</span>` }),
      this.queueBtn,
      this.pinBtn,
    );
    this.root.append(this.holdBar, header, this.body, this.totalEl);
    this.renderTotal();
  }

  /** Estado inicial da partida: convida a combinar santos. */
  welcome(pool) {
    this.current = null;
    this.pending = null;
    this.holdUntil = 0;
    this.sessionCount = 0;
    this.sessionNew = 0;
    this.updateQueue();
    const faces = pool
      .map((id) => this.saints.get(id))
      .filter(Boolean)
      .map((s) => el('img', { src: s.thumbUrl, alt: s.name, title: s.name }));
    this.swapContent(
      el(
        'div',
        { class: 'rp-welcome' },
        el('div', { class: 'rp-faces' }, faces),
        el('p', { class: 'rp-welcome-title' }, 'Combine 3 ou mais retratos do mesmo santo'),
        el('p', { class: 'rp-welcome-text' }, 'Cada combinação revela aqui uma reflexão sobre a vida e as virtudes dele. Continue jogando enquanto lê!'),
      ),
      false,
    );
    this.renderTotal();
  }

  get readingTime() {
    return READING_TIME[this.store.prefs.readingTime] || READING_TIME.normal;
  }

  /**
   * Recebe as combinações de uma jogada e decide qual santo apresentar.
   * Prioridade: combinação feita diretamente pelo jogador (1ª etapa), depois
   * a maior combinação, depois o santo com mais reflexões ainda não descobertas.
   * @param {Array<{type, size, step}>} groups
   */
  offer(groups) {
    if (!groups?.length) return;
    const valid = groups.filter((g) => this.library.has(g.type));
    if (!valid.length) return;
    const best = valid
      .map((g) => ({ ...g, fresh: this.library.undiscoveredCount(g.type) }))
      .sort((a, b) => a.step - b.step || b.size - a.size || b.fresh - a.fresh)[0];
    if (this.pinned || Date.now() < this.holdUntil) {
      this.pending = best.type;
      this.updateQueue();
      return;
    }
    this.present(best.type);
  }

  /** Mostra a próxima reflexão do santo (ou o aviso de conteúdo em preparação). */
  present(saintId) {
    const saint = this.saints.get(saintId);
    if (!saint) return;
    const drawn = this.library.draw(saintId);
    this.pending = null;
    this.updateQueue();
    if (!drawn) {
      this.current = { saintId, reflection: null };
      this.swapContent(this.renderPreparing(saint));
      this.hold(Math.min(4000, this.readingTime));
      return;
    }
    this.current = { saintId, reflection: drawn.reflection };
    this.sessionCount++;
    if (drawn.isNew) this.sessionNew++;
    this.swapContent(this.renderReflection(saint, drawn));
    this.audio?.play('reflection');
    this.hold(this.readingTime);
    this.renderTotal();
  }

  renderReflection(saint, { reflection: r, progress, isNew }) {
    const dots = el('div', { class: 'rp-dots', 'aria-hidden': 'true' });
    const slots = this.library.slots(saint.id).filter((s) => s.valid);
    for (const s of slots) dots.append(el('span', { class: `${s.discovered ? 'on' : ''} ${s.id === r.id ? 'now' : ''}` }));
    return el(
      'article',
      { class: 'rp-card' },
      el(
        'div',
        { class: 'rp-top' },
        el('div', { class: 'rp-portrait' }, el('img', { src: saint.thumbUrl, alt: saint.name })),
        el(
          'div',
          { class: 'rp-head' },
          el('div', { class: 'rp-saint' }, el('span', { class: 'rp-saint-name' }, saint.fullName || saint.name), isNew ? el('span', { class: 'rp-new' }, 'Nova') : null),
          el('h3', { class: 'rp-title' }, r.title),
          el(
            'div',
            { class: 'rp-tags' },
            r.theme ? el('span', { class: 'tag tag-theme' }, r.theme) : null,
            r.virtue ? el('span', { class: 'tag tag-virtue', html: `${icon('sparkle')}${escapeHtml(r.virtue)}` }) : null,
          ),
        ),
        el('div', { class: 'rp-progress', title: 'Reflexões descobertas deste santo' }, el('strong', {}, `${progress.discovered}/${progress.total}`), dots),
      ),
      el('p', { class: 'rp-text' }, r.reflection),
      el('p', { class: 'rp-question', html: `${icon('question')}<span>${escapeHtml(r.question)}</span>` }),
    );
  }

  renderPreparing(saint) {
    return el(
      'article',
      { class: 'rp-card rp-preparing' },
      el(
        'div',
        { class: 'rp-top' },
        el('div', { class: 'rp-portrait' }, el('img', { src: saint.thumbUrl, alt: saint.name })),
        el('div', { class: 'rp-head' }, el('div', { class: 'rp-saint' }, saint.fullName || saint.name), el('h3', { class: 'rp-title' }, 'Reflexões em preparação')),
      ),
      el('p', { class: 'rp-text muted' }, 'As reflexões deste santo ainda estão sendo escritas. Continue jogando para conhecer outros testemunhos!'),
    );
  }

  /** Troca o conteúdo com uma animação suave. */
  swapContent(node, animate = true) {
    const old = this.body.firstElementChild;
    this.body.scrollTop = 0;
    if (old && animate && !this.store.prefs.reducedMotion) {
      old.classList.add('rp-leave');
      setTimeout(() => old.remove(), 220);
      node.classList.add('rp-enter');
    } else if (old) old.remove();
    this.body.append(node);
    if (animate) {
      this.root.classList.remove('rp-flash');
      void this.root.offsetWidth; // reinicia a animação
      this.root.classList.add('rp-flash');
    }
  }

  hold(ms) {
    clearTimeout(this.timer);
    this.holdUntil = Date.now() + ms;
    const bar = this.holdBar.firstElementChild;
    bar.style.transition = 'none';
    bar.style.transform = 'scaleX(0)';
    void bar.offsetWidth;
    if (!this.pinned) {
      bar.style.transition = `transform ${ms}ms linear`;
      bar.style.transform = 'scaleX(1)';
    }
    this.timer = setTimeout(() => this.release(), ms);
  }

  release() {
    this.holdUntil = 0;
    if (this.pending && !this.pinned) this.present(this.pending);
  }

  togglePin() {
    this.pinned = !this.pinned;
    this.pinBtn.classList.toggle('active', this.pinned);
    this.pinBtn.setAttribute('aria-pressed', String(this.pinned));
    this.pinBtn.title = this.pinned ? 'Liberar novas reflexões' : 'Fixar esta reflexão';
    const bar = this.holdBar.firstElementChild;
    if (this.pinned) {
      bar.style.transition = 'none';
      bar.style.transform = 'scaleX(0)';
    } else if (Date.now() >= this.holdUntil && this.pending) {
      setTimeout(() => this.release(), 400);
    }
  }

  showPendingNow() {
    if (!this.pending) return;
    if (this.pinned) this.togglePin();
    this.present(this.pending);
  }

  updateQueue() {
    if (!this.pending) {
      this.queueBtn.hidden = true;
      return;
    }
    const s = this.saints.get(this.pending);
    this.queueBtn.hidden = false;
    this.queueBtn.innerHTML = '';
    this.queueBtn.append(el('img', { src: s.thumbUrl, alt: '' }), el('span', {}, 'Próxima'), el('span', { class: 'rp-queue-icon', html: icon('next') }));
    this.queueBtn.title = `Próxima reflexão: ${s.name}`;
  }

  renderTotal() {
    const t = this.library.totals();
    const pct = t.total ? Math.round((t.discovered / t.total) * 100) : 0;
    this.totalEl.innerHTML = '';
    this.totalEl.append(
      el('span', {}, 'Reflexões descobertas'),
      el('div', { class: 'bar' }, el('span', { style: { width: pct + '%' } })),
      el('strong', {}, `${t.discovered}/${t.total}`),
    );
  }

  destroy() {
    clearTimeout(this.timer);
  }
}
