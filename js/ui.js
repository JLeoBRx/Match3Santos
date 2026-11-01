/**
 * ui.js — navegação entre telas, janelas (modais) e avisos rápidos (toasts).
 */
import { el } from './utils.js';
import { icon } from './icons.js';

export class UI {
  constructor() {
    this.screens = new Map([...document.querySelectorAll('.screen')].map((s) => [s.dataset.screen, s]));
    this.current = null;
    this.modalRoot = document.getElementById('sheet-root');
    this.toastRoot = document.getElementById('toast-root');
    this.modalStack = [];
    this.onShow = new Set();
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalStack.length) {
        const top = this.modalStack[this.modalStack.length - 1];
        if (top.dismissible) top.close(null);
      }
    });
  }

  /** Exibe uma tela pelo nome (atributo data-screen). */
  show(name) {
    const next = this.screens.get(name);
    if (!next || next === this.current) return;
    const prev = this.current;
    if (prev) {
      prev.classList.remove('active');
      prev.setAttribute('aria-hidden', 'true');
      prev.inert = true;
    }
    next.classList.add('active');
    next.removeAttribute('aria-hidden');
    next.inert = false;
    next.scrollTop = 0;
    this.current = next;
    this.currentName = name;
    document.body.dataset.current = name;
    this.onShow.forEach((fn) => fn(name));
    const focusTarget = next.querySelector('[data-autofocus]') || next.querySelector('h1, h2');
    if (focusTarget) {
      focusTarget.setAttribute('tabindex', '-1');
      focusTarget.focus({ preventScroll: true });
    }
  }

  /**
   * Abre uma janela. Devolve uma Promise com o valor da ação escolhida (ou null).
   * @param {object} o
   * @param {string} o.title
   * @param {Node|string} [o.body]
   * @param {Array<{label, value, primary?, icon?, className?}>} [o.actions]
   * @param {boolean} [o.dismissible=true]
   * @param {string} [o.className]
   */
  modal({ title, body, actions = [], dismissible = true, className = '', eyebrow = '' }) {
    // Nomes de classe exclusivos (prefixo "mds-", sem "modal"/"popup"/"overlay"):
    // extensões de navegador (bloqueadores de pop-up, modo leitura etc.) costumam
    // restilizar elementos com esses nomes genéricos e quebrar o layout.
    return new Promise((resolve) => {
      const veil = el('div', { class: `mds-veil ${className}` });
      const close = (value) => {
        if (entry.closed) return;
        entry.closed = true;
        veil.classList.add('closing');
        this.modalStack.splice(this.modalStack.indexOf(entry), 1);
        setTimeout(() => veil.remove(), 200);
        if (!this.modalStack.length) document.body.classList.remove('has-sheet');
        resolve(value);
      };
      const entry = { close, dismissible, closed: false };
      const titleId = 'mds-heading-' + Math.random().toString(36).slice(2, 8);
      const sheet = el('div', { class: 'mds-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId });

      // Cabeçalho fixo
      const head = el('div', { class: 'mds-sheet-head' });
      if (eyebrow) head.append(el('div', { class: 'mds-kicker' }, eyebrow));
      head.append(el('h2', { class: 'mds-heading', id: titleId }, title));
      if (dismissible) head.append(el('button', { class: 'mds-x icon-btn', type: 'button', 'aria-label': 'Fechar', html: icon('close'), onclick: () => close(null) }));
      sheet.append(head);

      // Conteúdo (único trecho que rola quando a tela é baixa)
      if (body) sheet.append(el('div', { class: 'mds-sheet-body' }, typeof body === 'string' ? el('p', {}, body) : body));

      // Botões fixos no rodapé — sempre visíveis
      if (actions.length) {
        sheet.append(
          el(
            'div',
            { class: 'mds-sheet-actions' },
            actions.map((a) =>
              el('button', {
                class: `btn ${a.primary ? 'btn-primary' : 'btn-ghost'} ${a.className || ''}`,
                type: 'button',
                onclick: () => close(a.value),
                html: `${a.icon ? icon(a.icon) : ''}<span>${a.label}</span>`,
              }),
            ),
          ),
        );
      }
      veil.append(sheet);
      veil.addEventListener('pointerdown', (e) => {
        if (e.target === veil && dismissible) close(null);
      });
      this.modalRoot.append(veil);
      document.body.classList.add('has-sheet');
      this.modalStack.push(entry);
      requestAnimationFrame(() => {
        const primary = sheet.querySelector('.btn-primary') || sheet.querySelector('button');
        primary?.focus({ preventScroll: true });
      });
      entry.overlay = veil;
    });
  }

  get hasModal() {
    return this.modalStack.length > 0;
  }

  closeTopModal() {
    const top = this.modalStack[this.modalStack.length - 1];
    if (top) top.close(null);
  }

  closeAllModals() {
    [...this.modalStack].forEach((m) => m.close(null));
  }

  async confirm(title, text, { ok = 'Confirmar', cancel = 'Cancelar', danger = false } = {}) {
    const v = await this.modal({
      title,
      body: text,
      actions: [
        { label: cancel, value: false },
        { label: ok, value: true, primary: true, className: danger ? 'btn-danger' : '' },
      ],
    });
    return v === true;
  }

  toast(message, ms = 2400) {
    const node = el('div', { class: 'toast', role: 'status' }, message);
    this.toastRoot.append(node);
    setTimeout(() => node.classList.add('out'), ms);
    setTimeout(() => node.remove(), ms + 400);
  }
}
