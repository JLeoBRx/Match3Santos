/**
 * collection.js — Álbum dos Santos: grade de cartões e página de detalhes.
 */
import { el, escapeHtml, formatNumber } from './utils.js';
import { icon } from './icons.js';

export class Collection {
  /** @param {import('./main.js').App} app */
  constructor(app) {
    this.app = app;
    this.gridScreen = document.querySelector('[data-screen="album"]');
    this.detailScreen = document.querySelector('[data-screen="saint"]');
    this.filter = 'all';
  }

  /** complete = todas as reflexões vistas; discovered = ao menos uma; locked = nenhuma. */
  saintState(id) {
    const p = this.app.library.progress(id);
    if (p.total && p.discovered >= p.total) return 'complete';
    if (p.discovered > 0) return 'discovered';
    return 'locked';
  }

  // ------------------------------------------------------------------ grade
  render() {
    const { app } = this;
    const root = this.gridScreen;
    root.innerHTML = '';
    const saints = app.saints.list;
    const totals = app.library.totals();
    const discoveredSaints = saints.filter((s) => this.saintState(s.id) !== 'locked').length;
    const pct = totals.total ? Math.round((totals.discovered / totals.total) * 100) : 0;

    const header = el(
      'header',
      { class: 'screen-header' },
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Voltar', html: icon('back'), onclick: () => app.go('home') }),
      el('div', { class: 'screen-title' }, el('h1', { 'data-autofocus': '' }, 'Álbum dos Santos'), el('p', {}, 'Combine os retratos no jogo para descobrir as reflexões')),
    );
    const summary = el(
      'div',
      { class: 'album-summary' },
      stat(`${discoveredSaints}/${saints.length}`, 'santos descobertos'),
      stat(`${totals.discovered}/${totals.total}`, 'reflexões descobertas'),
      el('div', { class: 'album-meter' }, el('div', { class: 'bar' }, el('span', { style: { width: pct + '%' } })), el('small', {}, `${pct}% do álbum`)),
    );
    const filters = el(
      'div',
      { class: 'segmented', role: 'tablist', 'aria-label': 'Filtrar santos' },
      [
        ['all', 'Todos'],
        ['discovered', 'Descobertos'],
        ['locked', 'A descobrir'],
      ].map(([key, label]) =>
        el(
          'button',
          {
            type: 'button',
            role: 'tab',
            class: this.filter === key ? 'active' : '',
            'aria-selected': String(this.filter === key),
            onclick: () => {
              this.filter = key;
              this.render();
            },
          },
          label,
        ),
      ),
    );
    const grid = el('div', { class: 'album-grid' });
    for (const s of saints) {
      const state = this.saintState(s.id);
      if (this.filter === 'discovered' && state === 'locked') continue;
      if (this.filter === 'locked' && state !== 'locked') continue;
      const p = app.library.progress(s.id);
      const ppct = p.total ? (p.discovered / p.total) * 100 : 0;
      grid.append(
        el(
          'button',
          { class: `saint-card state-${state}`, type: 'button', onclick: () => this.openSaint(s.id), 'aria-label': `${s.name}: ${p.discovered} de ${p.total} reflexões` },
          el(
            'div',
            { class: 'saint-card-img' },
            el('img', { src: s.thumbUrl, alt: '', loading: 'lazy' }),
            state === 'locked' ? el('span', { class: 'card-lock', html: icon('lock') }) : null,
            state === 'complete' ? el('span', { class: 'card-done', html: icon('check') }) : null,
          ),
          el('span', { class: 'saint-card-name' }, s.name),
          el('span', { class: 'saint-card-count' }, p.total ? `${p.discovered}/${p.total} reflexões` : 'Em preparação'),
          el('span', { class: 'bar small' }, el('span', { style: { width: ppct + '%' } })),
          el('span', { class: 'saint-card-state' }, state === 'locked' ? 'A descobrir' : state === 'complete' ? 'Completo' : 'Descoberto'),
        ),
      );
    }
    if (!grid.children.length) grid.append(el('p', { class: 'empty-note' }, this.filter === 'locked' ? 'Você já encontrou todos os santos!' : 'Jogue para começar a descobrir os santos.'));
    root.append(el('div', { class: 'screen-inner' }, header, summary, filters, grid));
  }

  // ------------------------------------------------------------------ detalhes
  openSaint(id) {
    this.renderDetail(id);
    this.app.go('saint');
  }

  renderDetail(id) {
    const { app } = this;
    const s = app.saints.get(id);
    if (!s) return;
    const root = this.detailScreen;
    root.innerHTML = '';
    const list = app.saints.list;
    const idx = list.findIndex((x) => x.id === id);
    const prev = list[(idx - 1 + list.length) % list.length];
    const next = list[(idx + 1) % list.length];
    const editor = app.store.prefs.editorMode;
    const p = app.library.progress(id);
    const stats = app.store.data.stats;
    const state = this.saintState(id);
    const focus = s.crop ? `${Math.round(s.crop.x * 100)}% ${Math.round(s.crop.y * 100)}%` : '50% 25%';

    const header = el(
      'header',
      { class: 'screen-header' },
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Voltar ao álbum', html: icon('back'), onclick: () => this.back() }),
      el('div', { class: 'screen-title' }, el('h1', { 'data-autofocus': '' }, s.fullName || s.name), el('p', {}, `Santo ${idx + 1} de ${list.length}`)),
      el(
        'div',
        { class: 'detail-nav' },
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': `Anterior: ${prev.name}`, html: icon('back'), onclick: () => this.renderDetail(prev.id) }),
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': `Próximo: ${next.name}`, html: icon('next'), onclick: () => this.renderDetail(next.id) }),
      ),
    );

    const hero = el(
      'div',
      { class: `saint-hero state-${state}` },
      el('div', { class: 'saint-hero-img' }, el('img', { src: s.imageUrl, alt: `Retrato de ${s.fullName || s.name}`, style: { objectPosition: focus }, onerror: (e) => (e.target.src = s.thumbUrl) })),
      el(
        'div',
        { class: 'saint-hero-info' },
        el('h2', {}, s.fullName || s.name),
        el(
          'div',
          { class: 'hero-stats' },
          stat(`${p.discovered}/${p.total}`, 'reflexões'),
          stat(formatNumber(stats.matches[id] || 0), 'combinações'),
          stat(formatNumber(stats.cleared[id] || 0), 'peças eliminadas'),
        ),
        el('div', { class: 'bar' }, el('span', { style: { width: (p.total ? (p.discovered / p.total) * 100 : 0) + '%' } })),
        bioBlock(s),
      ),
    );

    const items = app.library.slots(id).map((r, i) => {
      const n = i + 1;
      if (!r.valid) {
        return el(
          'li',
          { class: 'refl-item placeholder' },
          el('div', { class: 'refl-head' }, el('span', { class: 'refl-num' }, String(n)), el('span', { class: 'refl-title' }, 'Reflexão em preparação'), editor ? el('span', { class: 'refl-status warn' }, r.status || 'provisória') : null),
        );
      }
      const visible = r.discovered || editor;
      if (!visible) {
        return el(
          'li',
          { class: 'refl-item locked' },
          el(
            'div',
            { class: 'refl-head' },
            el('span', { class: 'refl-num' }, String(n)),
            el('span', { class: 'refl-title' }, 'Ainda não descoberta'),
            el('span', { class: 'refl-lock', html: icon('lock') }),
          ),
        );
      }
      return el(
        'li',
        { class: `refl-item ${r.discovered ? 'open' : 'editor-only'}` },
        el(
          'details',
          {},
          el(
            'summary',
            { class: 'refl-head' },
            el('span', { class: 'refl-num' }, String(n)),
            el('span', { class: 'refl-title' }, r.title),
            r.theme ? el('span', { class: 'tag tag-theme' }, r.theme) : null,
            !r.discovered ? el('span', { class: 'refl-status' }, 'não descoberta') : null,
            editor && r.status ? el('span', { class: 'refl-status' }, `status: ${r.status}`) : null,
          ),
          el(
            'div',
            { class: 'refl-body' },
            el('p', { class: 'rp-text' }, r.reflection),
            el('p', { class: 'rp-question', html: `${icon('question')}<span>${escapeHtml(r.question)}</span>` }),
            r.virtue ? el('span', { class: 'tag tag-virtue', html: `${icon('sparkle')}${escapeHtml(r.virtue)}` }) : null,
          ),
        ),
      );
    });

    root.append(
      el(
        'div',
        { class: 'screen-inner' },
        header,
        hero,
        el(
          'section',
          { class: 'refl-section' },
          el('h3', {}, 'Reflexões', el('small', {}, ` ${p.discovered} de ${p.total} descobertas`)),
          editor ? el('p', { class: 'editor-note' }, 'Modo editorial ativo: todas as reflexões estão visíveis para revisão (desative em Configurações).') : null,
          el('ol', { class: 'refl-list' }, items),
        ),
      ),
    );
    root.scrollTop = 0;
  }

  back() {
    this.render();
    this.app.go('album');
  }
}

function stat(value, label) {
  return el('div', { class: 'stat' }, el('strong', {}, value), el('span', {}, label));
}

function bioBlock(s) {
  const facts = [];
  if (s.feastDay) facts.push(el('li', {}, el('strong', {}, 'Festa litúrgica: '), s.feastDay));
  if (s.patronage) facts.push(el('li', {}, el('strong', {}, 'Padroeiro(a) de: '), Array.isArray(s.patronage) ? s.patronage.join(', ') : s.patronage));
  return el(
    'div',
    { class: 'bio' },
    el('h3', {}, 'Biografia'),
    s.bio ? el('p', {}, s.bio) : el('p', { class: 'muted' }, 'Biografia em preparação. Este espaço receberá um resumo revisado em breve.'),
    facts.length ? el('ul', { class: 'bio-facts' }, facts) : null,
  );
}
