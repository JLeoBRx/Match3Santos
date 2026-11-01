/**
 * main.js — ponto de entrada do Match dos Santos.
 * Carrega os dados, prepara os módulos e controla a navegação entre telas.
 */
import { SaveStore } from './storage.js';
import { SaintRegistry } from './saints.js';
import { ReflectionLibrary } from './reflections.js';
import { LevelCatalog, renderLevelMap, renderLevelPreview } from './levels.js';
import { AudioManager } from './audio.js';
import { Effects } from './effects.js';
import { UI } from './ui.js';
import { GameScreen } from './gameScreen.js';
import { Collection } from './collection.js';
import { SettingsScreen } from './settings.js';
import { el, formatNumber, pick, prefersReducedMotion, shuffle } from './utils.js';
import { icon } from './icons.js';

const PARENT = { levels: 'home', album: 'home', settings: 'home', saint: 'album' };

export class App {
  async boot() {
    this.ui = new UI();
    this.store = new SaveStore();
    // Primeira visita: respeita a preferência do sistema por menos movimento.
    if (!this.store.data.updatedAt && prefersReducedMotion()) this.store.update((d) => (d.preferences.reducedMotion = true));
    this.applyPreferences();
    this.audio = new AudioManager(this.store);
    this.effects = new Effects(document.getElementById('fx-canvas'), () => this.store.prefs.reducedMotion);
    this.ui.show('loading');

    const bar = document.getElementById('loading-bar');
    const label = document.getElementById('loading-label');
    const setProgress = (p, text) => {
      bar.style.transform = `scaleX(${p})`;
      if (text) label.textContent = text;
    };

    try {
      setProgress(0.08, 'Carregando os santos…');
      const [saints] = await Promise.all([SaintRegistry.load('data/saints.json'), this.audio.loadManifest('data/audio.json')]);
      this.saints = saints;
      setProgress(0.2, 'Carregando as reflexões…');
      this.library = await ReflectionLibrary.load('data/reflections.json', this.store);
      setProgress(0.3, 'Preparando os retratos…');
      const imgReport = await saints.preload((done, total) => setProgress(0.3 + 0.6 * (done / total), `Preparando os retratos… ${done}/${total}`));
      if (imgReport.broken.length) console.warn('[Match dos Santos] Santos sem imagem (fora dos tabuleiros):', imgReport.broken);
      if (saints.available().length < 6) throw new Error('São necessárias pelo menos 6 imagens de santos válidas.');
      setProgress(0.95, 'Preparando as fases…');
      this.levels = await LevelCatalog.load('data/levels.json', saints.ids());
    } catch (err) {
      console.error(err);
      this.showBootError(err);
      return;
    }
    setProgress(1, 'Pronto!');

    this.gameScreen = new GameScreen(this);
    this.collection = new Collection(this);
    this.settingsScreen = new SettingsScreen(this);
    this.bindHome();
    this.setupHistory();
    this.setupAudioUnlock();
    document.addEventListener('visibilitychange', () => {
      this.audio.handleVisibility(document.hidden);
      if (document.hidden && this.ui.currentName === 'game') this.gameScreen.pause();
    });
    this.store.onChange(() => {
      if (this.ui.currentName === 'home') this.renderHomeStats();
    });
    setTimeout(() => this.go('home'), 250);
  }

  showBootError(err) {
    const box = document.getElementById('loading-error');
    const isFile = location.protocol === 'file:';
    box.hidden = false;
    box.innerHTML = '';
    box.append(
      el('strong', {}, 'Não foi possível iniciar o jogo.'),
      el(
        'p',
        {},
        isFile
          ? 'O jogo precisa ser aberto por um servidor HTTP local (os navegadores bloqueiam a leitura dos arquivos JSON em file://). Use a extensão Live Server do VS Code ou rode "python -m http.server" na pasta do projeto e acesse http://localhost:8000.'
          : String(err?.message || err),
      ),
      el('button', { class: 'btn btn-primary', type: 'button', onclick: () => location.reload(), text: 'Tentar novamente' }),
    );
    document.getElementById('loading-label').textContent = '';
  }

  /** Aplica preferências visuais globais. */
  applyPreferences() {
    const reduced = this.store.prefs.reducedMotion;
    document.body.classList.toggle('reduced-motion', Boolean(reduced));
    this.gameScreen?.layout();
  }

  // ------------------------------------------------------------------ navegação
  go(name) {
    if (name === 'home') this.renderHome();
    if (name === 'levels') this.renderLevels();
    if (name === 'album') this.collection.render();
    if (name === 'settings') this.settingsScreen.render();
    if (name !== 'home') this.stopHomeAnimation();
    this.ui.show(name);
    if (name === 'levels') this.scrollMapToCurrent();
    if (name === 'game') this.gameScreen.layout();
  }

  /** Botão "voltar" do navegador/Android. Devolve false quando não há para onde voltar. */
  handleBack() {
    if (this.ui.hasModal) {
      const top = this.ui.modalStack[this.ui.modalStack.length - 1];
      if (top.dismissible) this.ui.closeTopModal();
      return true;
    }
    const current = this.ui.currentName;
    if (current === 'game') {
      this.gameScreen.handleBack();
      return true;
    }
    if (current === 'saint') {
      this.collection.back();
      return true;
    }
    if (PARENT[current]) {
      this.go(PARENT[current]);
      return true;
    }
    return false;
  }

  setupHistory() {
    try {
      history.replaceState({ mds: 'root' }, '');
      history.pushState({ mds: 'app' }, '');
      window.addEventListener('popstate', () => {
        if (this.handleBack()) history.pushState({ mds: 'app' }, '');
        else history.back();
      });
    } catch {
      /* ambientes sem History API */
    }
  }

  setupAudioUnlock() {
    const unlock = () => {
      this.audio.unlock();
      this.audio.startMusic();
    };
    // iOS/Safari só libera o áudio em alguns tipos de gesto: registramos vários.
    for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(type, unlock, { passive: true });
  }

  // ------------------------------------------------------------------ tela inicial
  bindHome() {
    const click = (id, fn) =>
      document.getElementById(id).addEventListener('click', () => {
        this.audio.play('click');
        fn();
      });
    click('btn-play', () => this.go('levels'));
    click('btn-endless', () => this.gameScreen.startEndless());
    click('btn-album', () => this.go('album'));
    click('btn-settings', () => this.go('settings'));
    document.querySelectorAll('[data-icon]').forEach((node) => node.insertAdjacentHTML('afterbegin', icon(node.dataset.icon)));
  }

  renderHome() {
    this.renderHomeStats();
    this.startHomeAnimation();
  }

  renderHomeStats() {
    const box = document.getElementById('home-records');
    const d = this.store.data;
    const totals = this.library.totals();
    const card = (ic, value, label) => el('div', { class: 'record' }, el('span', { class: 'record-icon', html: icon(ic) }), el('strong', {}, value), el('span', {}, label));
    box.innerHTML = '';
    box.append(
      card('trophy', formatNumber(d.endless.highScore), 'Recorde infinito'),
      card('infinity', String(d.endless.bestStage || 0), 'Melhor etapa'),
      card('star', `${this.store.totalStars()}/${this.levels.count * 3}`, 'Estrelas'),
      card('book', `${totals.discovered}/${totals.total}`, 'Reflexões'),
    );
    const next = Math.min(d.levels.unlocked, this.levels.count);
    document.getElementById('btn-play-sub').textContent = d.levels.completed.length ? `Fase ${next}` : 'Comece pela fase 1';
  }

  /** Peças de santos flutuando e uma pequena "combinação" animada sob o logo. */
  startHomeAnimation() {
    const reduced = this.store.prefs.reducedMotion || prefersReducedMotion();
    const floatBox = document.getElementById('home-tiles');
    const saints = this.saints.available();
    if (!floatBox.childElementCount) {
      // posições nas bordas da tela (x%, y%) para não competir com o menu
      const spots = [
        [3, 8], [88, 6], [-2, 34], [92, 30], [1, 62], [93, 58], [4, 90], [86, 88], [30, 2], [64, 1],
      ];
      shuffle(saints)
        .slice(0, spots.length)
        .forEach((s, i) => {
          const [x, y] = spots[i];
          floatBox.append(
            el('img', {
              class: 'float-tile',
              src: s.thumbUrl,
              alt: '',
              style: { left: x + '%', top: y + '%', animationDelay: `${-i * 1.7}s`, animationDuration: `${9 + (i % 4) * 2}s`, '--rot': `${(i % 2 ? 1 : -1) * (6 + i)}deg` },
            }),
          );
        });
    }
    const row = document.getElementById('home-match');
    const setRow = () => {
      const s = pick(saints);
      row.innerHTML = '';
      for (let i = 0; i < 3; i++) row.append(el('span', { class: 'demo-tile', style: { animationDelay: `${i * 90}ms` } }, el('img', { src: s.thumbUrl, alt: '' })));
    };
    setRow();
    this.stopHomeAnimation();
    if (reduced) return;
    this.homeTimer = setInterval(() => {
      row.classList.add('matching');
      setTimeout(() => {
        row.classList.remove('matching');
        setRow();
      }, 700);
    }, 3200);
  }

  stopHomeAnimation() {
    clearInterval(this.homeTimer);
    this.homeTimer = null;
  }

  // ------------------------------------------------------------------ mapa de fases
  renderLevels() {
    const screen = document.querySelector('[data-screen="levels"]');
    screen.innerHTML = '';
    const stars = this.store.totalStars();
    const done = this.store.data.levels.completed.length;
    const mapBox = el('div', { class: 'map' });
    screen.append(
      el(
        'div',
        { class: 'screen-inner map-inner' },
        el(
          'header',
          { class: 'screen-header sticky' },
          el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Voltar', html: icon('back'), onclick: () => this.go('home') }),
          el('div', { class: 'screen-title' }, el('h1', { 'data-autofocus': '' }, 'Fases'), el('p', {}, `${done}/${this.levels.count} concluídas`)),
          el('div', { class: 'header-chip', html: `${icon('star')}<span>${stars}/${this.levels.count * 3}</span>` }),
        ),
        mapBox,
      ),
    );
    this.currentMapNode = renderLevelMap(mapBox, {
      catalog: this.levels,
      store: this.store,
      saints: this.saints,
      onSelect: (level, state) => this.openLevelPreview(level, state),
    });
  }

  scrollMapToCurrent() {
    const node = this.currentMapNode;
    if (!node) return;
    requestAnimationFrame(() => node.scrollIntoView({ block: 'center', behavior: 'auto' }));
  }

  async openLevelPreview(level, state) {
    this.audio.play('click');
    if (state === 'locked') {
      this.ui.toast(`Conclua a fase ${level.id - 1} para desbloquear.`);
      return;
    }
    const choice = await this.ui.modal({
      eyebrow: `Fase ${level.id}${level.chapter ? ' · ' + level.chapter : ''}`,
      title: level.name,
      body: renderLevelPreview(level, { store: this.store, saints: this.saints }),
      className: 'sheet-preview',
      actions: [{ label: 'Jogar', value: 'play', primary: true, icon: 'play' }],
    });
    if (choice === 'play') this.gameScreen.startLevel(level.id);
  }

  // ------------------------------------------------------------------ tutorial
  async showTutorial() {
    const step = (ic, title, text) => el('li', {}, el('span', { class: 'tut-icon', html: icon(ic) }), el('div', {}, el('strong', {}, title), el('p', {}, text)));
    const body = el(
      'ol',
      { class: 'tutorial' },
      step('grid', 'Troque peças vizinhas', 'Toque em um santo e depois em um vizinho — ou arraste — para formar linhas de 3 ou mais retratos iguais.'),
      step('bolt', 'Crie peças especiais', '4 em linha criam um Raio de Luz (limpa linha ou coluna). Formatos em L ou T criam uma Cruz. 5 em linha criam uma Auréola, que limpa uma grande área. Troque duas especiais entre si para um efeito ainda maior!'),
      step('sparkle', 'Cascatas multiplicam', 'Peças que caem e formam novas combinações valem ×2, ×3, ×4…'),
      step('book', 'Descubra reflexões', 'Cada combinação revela, no painel abaixo do tabuleiro, uma reflexão do santo combinado. Continue jogando enquanto lê — use o alfinete para fixar uma reflexão.'),
    );
    const wasGame = this.ui.currentName === 'game' && this.gameScreen.game;
    if (wasGame) this.gameScreen.game.setPaused(true);
    await this.ui.modal({ title: 'Como jogar', body, className: 'sheet-tutorial', actions: [{ label: 'Entendi!', value: 'ok', primary: true }] });
    if (wasGame && this.gameScreen.game) this.gameScreen.game.setPaused(false);
    if (!this.store.prefs.seenTutorial) this.store.update((d) => (d.preferences.seenTutorial = true));
  }
}

const app = new App();
window.matchDosSantos = app; // útil para depuração no console
app.boot();
