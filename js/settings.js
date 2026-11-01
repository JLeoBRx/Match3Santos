/**
 * settings.js — tela de configurações (áudio, jogo, conteúdo e dados).
 */
import { el } from './utils.js';
import { icon } from './icons.js';
import { SAVE_VERSION } from './constants.js';

export class SettingsScreen {
  /** @param {import('./main.js').App} app */
  constructor(app) {
    this.app = app;
    this.root = document.querySelector('[data-screen="settings"]');
  }

  render() {
    const { app } = this;
    const store = app.store;
    this.root.innerHTML = '';

    const switchRow = (label, desc, get, set) => {
      const input = el('input', { type: 'checkbox', role: 'switch' });
      input.checked = get();
      input.addEventListener('change', () => set(input.checked));
      return el('label', { class: 'set-row' }, el('span', { class: 'set-text' }, el('strong', {}, label), desc ? el('small', {}, desc) : null), el('span', { class: 'switch' }, input, el('span', { class: 'switch-ui' })));
    };
    const sliderRow = (label, get, set) => {
      const input = el('input', { type: 'range', min: '0', max: '100', step: '5', 'aria-label': label });
      input.value = String(Math.round(get() * 100));
      input.addEventListener('input', () => set(Number(input.value) / 100));
      return el('label', { class: 'set-row slider' }, el('span', { class: 'set-text' }, el('strong', {}, label)), input);
    };
    const segRow = (label, desc, options, get, set) => {
      const seg = el('div', { class: 'segmented small', role: 'radiogroup', 'aria-label': label });
      const paint = () => [...seg.children].forEach((b) => b.classList.toggle('active', b.dataset.value === get()));
      options.forEach(([value, text]) =>
        seg.append(
          el('button', {
            type: 'button',
            dataset: { value },
            role: 'radio',
            onclick: () => {
              set(value);
              paint();
            },
            text,
          }),
        ),
      );
      paint();
      return el('div', { class: 'set-row' }, el('span', { class: 'set-text' }, el('strong', {}, label), desc ? el('small', {}, desc) : null), seg);
    };
    const setPref = (key) => (v) => {
      store.update((d) => {
        d.preferences[key] = v;
      });
      app.applyPreferences();
    };

    const audio = el(
      'section',
      { class: 'set-card' },
      el('h2', { html: `${icon('music')}<span>Áudio</span>` }),
      switchRow('Música de fundo', 'Trilha ambiente suave', () => store.settings.music, (v) => app.audio.setSetting('music', v)),
      sliderRow('Volume da música', () => store.settings.musicVolume, (v) => app.audio.setSetting('musicVolume', v)),
      switchRow('Efeitos sonoros', 'Seleção, combinações, cascatas, vitória…', () => store.settings.sfx, (v) => app.audio.setSetting('sfx', v)),
      sliderRow('Volume dos efeitos', () => store.settings.sfxVolume, (v) => {
        app.audio.setSetting('sfxVolume', v);
        app.audio.play('select');
      }),
    );

    const game = el(
      'section',
      { class: 'set-card' },
      el('h2', { html: `${icon('grid')}<span>Jogo</span>` }),
      switchRow('Dicas de jogada', 'Destaca uma jogada possível após alguns segundos parado', () => store.prefs.hints, setPref('hints')),
      switchRow('Animações reduzidas', 'Menos movimento e partículas (melhor para aparelhos simples)', () => store.prefs.reducedMotion, setPref('reducedMotion')),
      segRow(
        'Tempo de leitura',
        'Tempo mínimo que cada reflexão fica no painel',
        [
          ['curto', 'Curto'],
          ['normal', 'Normal'],
          ['longo', 'Longo'],
        ],
        () => store.prefs.readingTime,
        setPref('readingTime'),
      ),
      segRow(
        'Painel de reflexões',
        'Automático: ao lado em telas largas, abaixo em telas verticais',
        [
          ['auto', 'Automático'],
          ['bottom', 'Abaixo'],
          ['side', 'Ao lado'],
        ],
        () => store.prefs.panelPosition,
        setPref('panelPosition'),
      ),
      el('div', { class: 'set-row' }, el('span', { class: 'set-text' }, el('strong', {}, 'Como jogar'), el('small', {}, 'Rever as instruções')), el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => app.showTutorial(), text: 'Abrir' })),
    );

    const report = el('div', { class: 'diag', 'aria-live': 'polite' });
    const content = el(
      'section',
      { class: 'set-card' },
      el('h2', { html: `${icon('book')}<span>Conteúdo</span>` }),
      switchRow('Modo editorial', 'Exibe no álbum todas as reflexões e o status de revisão de cada uma', () => store.prefs.editorMode, setPref('editorMode')),
      el(
        'div',
        { class: 'set-row' },
        el('span', { class: 'set-text' }, el('strong', {}, 'Verificar conteúdo'), el('small', {}, 'Confere imagens, reflexões e fases')),
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => this.runDiagnostics(report), text: 'Verificar' }),
      ),
      report,
    );

    const data = el(
      'section',
      { class: 'set-card' },
      el('h2', { html: `${icon('trophy')}<span>Progresso</span>` }),
      el(
        'p',
        { class: 'set-note' },
        store.persistent
          ? `Seu progresso é salvo automaticamente neste navegador (formato v${SAVE_VERSION}).`
          : 'Atenção: o armazenamento local está indisponível (modo privado?). O progresso não será mantido ao fechar.',
      ),
      el(
        'div',
        { class: 'set-row' },
        el('span', { class: 'set-text' }, el('strong', {}, 'Reiniciar progresso'), el('small', {}, 'Apaga fases, estrelas, recordes e reflexões descobertas')),
        el('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: () => this.resetProgress(), text: 'Reiniciar' }),
      ),
    );

    this.root.append(
      el(
        'div',
        { class: 'screen-inner narrow' },
        el(
          'header',
          { class: 'screen-header' },
          el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Voltar', html: icon('back'), onclick: () => app.go('home') }),
          el('div', { class: 'screen-title' }, el('h1', { 'data-autofocus': '' }, 'Configurações')),
        ),
        audio,
        game,
        content,
        data,
        el('p', { class: 'set-footer' }, 'Match dos Santos · Combine. Descubra. Inspire-se.'),
      ),
    );
  }

  async resetProgress() {
    const ok = await this.app.ui.confirm('Reiniciar todo o progresso?', 'Fases, estrelas, recordes e reflexões descobertas serão apagados. Suas configurações serão mantidas. Esta ação não pode ser desfeita.', {
      ok: 'Apagar progresso',
      danger: true,
    });
    if (!ok) return;
    this.app.store.reset();
    this.app.ui.toast('Progresso reiniciado.');
    this.render();
  }

  async runDiagnostics(target) {
    const { app } = this;
    target.innerHTML = '<p>Verificando…</p>';
    const originals = await app.saints.verifyOriginals();
    const brokenOriginals = originals.filter((o) => !o.ok).map((o) => app.saints.name(o.id));
    const brokenThumbs = app.saints.list.filter((s) => s.broken).map((s) => s.name);
    const rep = app.library.report();
    const missingRefl = app.saints.list.filter((s) => !app.library.has(s.id)).map((s) => s.name);
    const statusText = Object.entries(rep.status)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' · ');
    const rows = [
      [brokenOriginals.length === 0, `Retratos originais: ${originals.length - brokenOriginals.length}/${originals.length} carregados${brokenOriginals.length ? ' — faltando: ' + brokenOriginals.join(', ') : ''}`],
      [brokenThumbs.length === 0, `Peças do tabuleiro: ${app.saints.list.length - brokenThumbs.length}/${app.saints.list.length}${brokenThumbs.length ? ' — sem imagem: ' + brokenThumbs.join(', ') : ''}`],
      [missingRefl.length === 0, `Santos com reflexões cadastradas: ${rep.saints}${missingRefl.length ? ' — sem cadastro: ' + missingRefl.join(', ') : ''}`],
      [rep.placeholders === 0, `Reflexões exibíveis: ${rep.valid}/${rep.slots}${rep.placeholders ? ` (${rep.placeholders} provisórias ocultas)` : ''}`],
      [true, `Status editorial — ${statusText}`],
      [app.levels.count > 0, `Fases carregadas: ${app.levels.count}`],
    ];
    target.innerHTML = '';
    target.append(
      el(
        'ul',
        {},
        rows.map(([ok, text]) => el('li', { class: ok ? 'ok' : 'warn' }, el('span', { class: 'diag-icon', html: icon(ok ? 'check' : 'info') }), el('span', {}, text))),
      ),
    );
  }
}
