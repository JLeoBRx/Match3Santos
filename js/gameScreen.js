/**
 * gameScreen.js — tela da partida: HUD, tabuleiro, painel de reflexões,
 * pausa e resultados. Funciona tanto para fases quanto para o modo infinito.
 */
import { Game } from './game.js';
import { ReflectionPanel } from './reflectionPanel.js';
import { LevelSession, goalVisual } from './levels.js';
import { EndlessSession } from './endless.js';
import { describeGoal } from './goals.js';
import { clamp, el, formatNumber, sleep } from './utils.js';
import { icon } from './icons.js';

export class GameScreen {
  /** @param {import('./main.js').App} app */
  constructor(app) {
    this.app = app;
    this.root = document.querySelector('[data-screen="game"]');
    this.session = null;
    this.game = null;
    this.build();
    this.onResize = () => this.layout();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', () => setTimeout(this.onResize, 150));
    if ('ResizeObserver' in window) new ResizeObserver(() => this.layout()).observe(this.root);
  }

  build() {
    this.root.innerHTML = '';
    this.backBtn = el('button', { class: 'icon-btn hud-back', type: 'button', 'aria-label': 'Voltar (pausa)', title: 'Voltar / pausa', html: icon('back'), onclick: () => this.pause() });
    this.modeEl = el('span', { class: 'hud-mode' });
    this.subEl = el('strong', { class: 'hud-sub' });
    this.scoreEl = el('strong', { class: 'hud-score-value' }, '0');
    this.movesEl = el('strong', {}, '0');
    this.movesBox = el('div', { class: 'hud-moves', title: 'Movimentos restantes' }, this.movesEl, el('span', {}, 'mov.'));
    this.barEl = el('span');
    this.barLabel = el('span', { class: 'hud-bar-label' });
    this.goalsEl = el('div', { class: 'hud-goals' });
    this.hud = el(
      'header',
      { class: 'hud' },
      el(
        'div',
        { class: 'hud-row' },
        this.backBtn,
        el('div', { class: 'hud-title' }, this.modeEl, this.subEl),
        el('div', { class: 'hud-score' }, el('span', {}, 'Pontos'), this.scoreEl),
        this.movesBox,
      ),
      el('div', { class: 'hud-progress' }, el('div', { class: 'bar', role: 'progressbar', 'aria-label': 'Progresso da meta' }, this.barEl), this.barLabel),
      this.goalsEl,
    );
    this.boardEl = el('div', { class: 'board', tabindex: '0', 'aria-label': 'Tabuleiro: toque em duas peças vizinhas ou arraste para trocar' });
    this.banner = el('div', { class: 'board-banner', 'aria-live': 'polite' });
    this.frame = el('div', { class: 'board-frame' }, this.boardEl, this.banner);
    this.panelEl = el('aside', { class: 'reflection-panel', 'aria-label': 'Painel de reflexões' });
    this.side = el('div', { class: 'game-side' }, this.hud, this.panelEl);
    this.layoutEl = el('div', { class: 'game-layout' }, el('main', { class: 'board-area' }, this.frame), this.side);
    this.root.append(this.layoutEl);
  }

  // ------------------------------------------------------------------ layout responsivo
  layout() {
    if (!this.root.classList.contains('active')) return;
    const W = this.root.clientWidth;
    const H = this.root.clientHeight;
    if (!W || !H) return;
    const pref = this.app.store.prefs.panelPosition;
    const sideMode = pref === 'side' ? W >= 600 : pref === 'bottom' ? false : W / H >= 1.2 && W >= 560;
    this.layoutEl.classList.toggle('is-side', sideMode);
    this.layoutEl.classList.toggle('is-bottom', !sideMode);
    const pad = W < 480 ? 8 : 16;
    let size;
    if (sideMode) {
      const panelW = clamp(W * 0.34, 270, 520);
      this.layoutEl.style.setProperty('--side-w', panelW + 'px');
      size = Math.min(H - pad * 2, W - panelW - pad * 3, 900);
    } else {
      this.layoutEl.style.removeProperty('--side-w');
      const hudH = this.hud.offsetHeight || 110;
      const panelMin = H < 620 ? 112 : H < 760 ? 150 : H < 900 ? 190 : 270;
      size = Math.min(W - pad * 2, H - hudH - panelMin - pad * 3, 760);
    }
    size = Math.max(240, Math.floor(size / 8) * 8);
    this.layoutEl.style.setProperty('--board-size', size + 'px');
  }

  // ------------------------------------------------------------------ início
  async startLevel(levelId) {
    const level = this.app.levels.get(levelId);
    if (!level) return;
    this.lastStart = { type: 'level', id: levelId };
    await this.begin(new LevelSession(level, this.app.store));
    const goalText = level.goals.map((g) => describeGoal(g, (id) => this.app.saints.name(id))).join(' · ');
    this.showBanner(`Fase ${level.id}`, goalText, 2600);
  }

  async startEndless() {
    this.lastStart = { type: 'endless' };
    await this.begin(new EndlessSession(this.app.store, this.app.saints.ids()));
    this.showBanner('Modo Infinito', `Etapa 1 · meta ${formatNumber(this.session.target)} pontos`, 2400);
  }

  async begin(session) {
    this.teardown();
    this.session = session;
    this.displayScore = 0;
    this.app.ui.show('game');
    this.panel = new ReflectionPanel(this.panelEl, {
      library: this.app.library,
      saints: this.app.saints,
      audio: this.app.audio,
      store: this.app.store,
    });
    this.panel.welcome(session.pool);
    this.renderHud(true);
    this.layout();
    this.game = new Game({
      boardEl: this.boardEl,
      saints: this.app.saints,
      pool: session.pool,
      audio: this.app.audio,
      effects: this.app.effects,
      prefs: () => this.app.store.prefs,
      on: {
        moveStart: () => {
          this.session.useMove();
          this.renderHud();
        },
        step: ({ step, score, cleared }) => {
          this.session.record({ points: score.points, cleared, specialsCreated: step.creations.length });
          this.renderHud();
        },
        turnEnd: (turn) => this.onTurnEnd(turn),
      },
    });
    requestAnimationFrame(() => this.layout());
    await this.game.start();
    this.boardEl.focus({ preventScroll: true });
    if (!this.app.store.prefs.seenTutorial) this.app.showTutorial();
  }

  teardown() {
    this.game?.destroy();
    this.panel?.destroy();
    this.game = null;
    this.panel = null;
    this.app.effects.clear();
  }

  // ------------------------------------------------------------------ HUD
  renderHud(full = false) {
    const s = this.session;
    if (!s) return;
    this.modeEl.textContent = s.title;
    this.subEl.textContent = s.subtitle;
    this.movesEl.textContent = String(s.moves);
    this.movesBox.classList.toggle('low', s.moves <= 5);
    this.movesBox.classList.toggle('critical', s.moves <= 2);
    this.animateScore(s.score);
    const p = clamp(s.progress(), 0, 1);
    this.barEl.style.transform = `scaleX(${p})`;
    this.barEl.parentElement.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    this.barEl.parentElement.classList.toggle('full', p >= 1);

    if (s.mode === 'endless') {
      this.barLabel.textContent = `${formatNumber(s.stageScore)} / ${formatNumber(s.target)}`;
      if (full || this.goalsKey !== `e${s.stage}`) {
        this.goalsKey = `e${s.stage}`;
        this.goalsEl.innerHTML = '';
        this.goalsEl.append(
          el('div', { class: 'goal-chip', html: `${icon('target')}<span>Meta ${formatNumber(s.target)}</span>` }),
          el('div', { class: 'goal-chip muted', html: `${icon('trophy')}<span>Recorde ${formatNumber(Math.max(this.app.store.data.endless.highScore, s.score))}</span>` }),
        );
      } else {
        this.goalsEl.lastElementChild.innerHTML = `${icon('trophy')}<span>Recorde ${formatNumber(Math.max(this.app.store.data.endless.highScore, s.score))}</span>`;
      }
      return;
    }

    this.barLabel.textContent = `${Math.round(p * 100)}%`;
    if (full || !this.goalChips) {
      this.goalsEl.innerHTML = '';
      this.goalChips = s.goals.map((g) => {
        const v = goalVisual(g, this.app.saints);
        const value = el('strong');
        const chip = el(
          'div',
          { class: 'goal-chip', title: describeGoal(g, (id) => this.app.saints.name(id)) },
          v.img ? el('img', { src: v.img, alt: '' }) : el('span', { class: 'goal-icon', html: icon(v.icon) }),
          value,
        );
        this.goalsEl.append(chip);
        return { chip, value, goal: g };
      });
    }
    this.goalChips.forEach(({ chip, value }, i) => {
      const g = s.goals[i];
      const done = g.current >= g.target;
      value.textContent = `${formatNumber(Math.min(g.current, g.target))}/${formatNumber(g.target)}`;
      if (done && !chip.classList.contains('done')) {
        chip.classList.add('done');
        if (!full) this.app.audio.play('star', { step: 1 });
      }
    });
  }

  animateScore(target) {
    cancelAnimationFrame(this.scoreRaf);
    const from = this.displayScore || 0;
    if (target === from) {
      this.scoreEl.textContent = formatNumber(target);
      return;
    }
    const start = performance.now();
    const dur = this.app.store.prefs.reducedMotion ? 1 : 450;
    const tick = (t) => {
      const k = Math.min(1, (t - start) / dur);
      const v = Math.round(from + (target - from) * (1 - Math.pow(1 - k, 3)));
      this.scoreEl.textContent = formatNumber(v);
      this.displayScore = v;
      if (k < 1) this.scoreRaf = requestAnimationFrame(tick);
    };
    this.scoreRaf = requestAnimationFrame(tick);
    this.scoreEl.classList.remove('bump');
    void this.scoreEl.offsetWidth;
    this.scoreEl.classList.add('bump');
  }

  showBanner(title, text, ms = 2000) {
    clearTimeout(this.bannerTimer);
    this.banner.innerHTML = '';
    this.banner.append(el('strong', {}, title), text ? el('span', {}, text) : null);
    this.banner.classList.remove('show');
    void this.banner.offsetWidth;
    this.banner.classList.add('show');
    this.bannerTimer = setTimeout(() => this.banner.classList.remove('show'), ms);
  }

  // ------------------------------------------------------------------ fim de jogada
  async onTurnEnd(turn) {
    const s = this.session;
    const store = this.app.store;
    store.recordTurnStats({
      matchesBySaint: turn.matchesBySaint,
      clearedBySaint: turn.clearedBySaint,
      specials: turn.specialsCreated,
      cascade: turn.steps,
    });
    this.panel.offer(turn.groups);
    const outcome = s.evaluate();
    if (s.mode === 'endless') s.checkpoint();
    this.renderHud();

    if (outcome === 'stage') {
      this.app.audio.play('stage');
      this.app.effects.confetti(1200);
      const done = s.stage;
      const info = s.nextStage();
      s.checkpoint(); // salva a nova melhor etapa imediatamente
      this.showBanner(`Etapa ${done} concluída!`, `+${info.bonusMoves} movimentos · nova meta ${formatNumber(info.target)}`, 2600);
      this.goalsKey = null;
      this.renderHud(true);
      await sleep(store.prefs.reducedMotion ? 300 : 900);
      if (this.session === s) await this.game.newBoard(s.pool);
      return;
    }
    if (outcome === 'win' || outcome === 'lose') {
      this.game.end();
      await sleep(outcome === 'win' ? 450 : 650);
      if (this.session !== s) return;
      if (s.mode === 'endless') this.showEndlessResult(s.finalize());
      else this.showLevelResult(s.finalize(outcome === 'win'));
    }
  }

  // ------------------------------------------------------------------ resultados
  async showLevelResult(res) {
    const { app } = this;
    const level = this.session.level;
    const next = app.levels.next(level.id);
    if (res.won) {
      app.audio.play('win');
      app.effects.confetti(2600);
    } else app.audio.play('lose');

    const starsBox = el('div', { class: 'result-stars' });
    for (let i = 1; i <= 3; i++) starsBox.append(el('span', { class: 'rstar', html: icon('star') }));
    const reflections = this.panel ? this.panel.sessionCount : 0;
    const body = el(
      'div',
      { class: 'result' },
      res.won ? starsBox : el('div', { class: 'result-emblem lose', html: icon('heart') }),
      el(
        'div',
        { class: 'result-lines' },
        line('Pontos', formatNumber(res.base)),
        res.won && res.bonus ? line(`Bônus: ${res.movesLeft} mov. × ${res.moveBonus}`, '+' + formatNumber(res.bonus)) : null,
        res.won ? line('Total', formatNumber(res.finalScore), 'total') : null,
      ),
      res.won
        ? null
        : el(
            'ul',
            { class: 'goal-list result-goals' },
            res.goals.map((g) =>
              el(
                'li',
                { class: g.current >= g.target ? 'done' : '' },
                el('span', { class: 'goal-icon', html: icon(g.current >= g.target ? 'check' : 'target') }),
                el('span', {}, `${describeGoal(g, (id) => app.saints.name(id))} — ${formatNumber(Math.min(g.current, g.target))}/${formatNumber(g.target)}`),
              ),
            ),
          ),
      reflections ? el('p', { class: 'result-note', html: `${icon('book')}<span>${reflections} ${reflections === 1 ? 'reflexão apresentada' : 'reflexões apresentadas'} nesta partida</span>` }) : null,
      res.newBest ? el('p', { class: 'result-badge' }, 'Nova melhor pontuação da fase!') : null,
      res.won && res.unlockedNext && next ? el('p', { class: 'result-badge soft' }, `Fase ${next.id} desbloqueada`) : null,
      res.won && !next ? el('p', { class: 'result-badge' }, 'Você concluiu todas as fases disponíveis! Que tal o Modo Infinito?') : null,
      res.won ? null : el('p', { class: 'result-note' }, 'Seu progresso já conquistado foi mantido. Tente de novo!'),
    );
    const actions = res.won
      ? [
          { label: 'Mapa', value: 'map', icon: 'map' },
          { label: 'Repetir', value: 'retry', icon: 'refresh' },
          next ? { label: 'Próxima fase', value: 'next', primary: true, icon: 'play' } : { label: 'Modo Infinito', value: 'endless', primary: true, icon: 'infinity' },
        ]
      : [
          { label: 'Mapa', value: 'map', icon: 'map' },
          { label: 'Tentar novamente', value: 'retry', primary: true, icon: 'refresh' },
        ];
    const choicePromise = app.ui.modal({
      title: res.won ? (res.stars === 3 ? 'Glorioso!' : 'Vitória!') : 'Quase lá!',
      eyebrow: `Fase ${level.id} · ${level.name}`,
      body,
      actions,
      dismissible: false,
      className: `result-modal ${res.won ? 'win' : 'lose'}`,
    });
    if (res.won) {
      const stars = [...starsBox.children];
      for (let i = 0; i < res.stars; i++) {
        await sleep(app.store.prefs.reducedMotion ? 60 : 380);
        stars[i].classList.add('on');
        app.audio.play('star', { step: i + 1 });
      }
    }
    const choice = await choicePromise;
    if (choice === 'next' && next) this.startLevel(next.id);
    else if (choice === 'retry') this.startLevel(level.id);
    else if (choice === 'endless') this.startEndless();
    else this.exitTo('levels');
  }

  async showEndlessResult(res) {
    const { app } = this;
    app.audio.play(res.newRecord ? 'win' : 'lose');
    if (res.newRecord) app.effects.confetti(2600);
    const reflections = this.panel ? this.panel.sessionCount : 0;
    const body = el(
      'div',
      { class: 'result' },
      el('div', { class: 'result-emblem', html: icon('infinity') }),
      el(
        'div',
        { class: 'result-lines' },
        line('Pontuação', formatNumber(res.score), 'total'),
        line('Etapa alcançada', String(res.stage)),
        line('Recorde', formatNumber(res.highScore)),
        line('Melhor etapa', String(res.bestStage)),
      ),
      res.newRecord ? el('p', { class: 'result-badge' }, 'Novo recorde pessoal!') : null,
      !res.newRecord && res.newBestStage ? el('p', { class: 'result-badge soft' }, 'Nova melhor etapa!') : null,
      reflections ? el('p', { class: 'result-note', html: `${icon('book')}<span>${reflections} ${reflections === 1 ? 'reflexão apresentada' : 'reflexões apresentadas'} nesta partida</span>` }) : null,
    );
    const choice = await app.ui.modal({
      title: res.newRecord ? 'Novo recorde!' : 'Fim de jogo',
      eyebrow: 'Modo Infinito',
      body,
      dismissible: false,
      className: 'result-modal endless',
      actions: [
        { label: 'Início', value: 'home', icon: 'home' },
        { label: 'Jogar de novo', value: 'retry', primary: true, icon: 'refresh' },
      ],
    });
    if (choice === 'retry') this.startEndless();
    else this.exitTo('home');
  }

  // ------------------------------------------------------------------ pausa
  async pause() {
    if (!this.game || this.game.ended || this.app.ui.hasModal || this.pausing) return;
    // Se uma jogada ainda está sendo resolvida, espera terminar (evita janelas sobrepostas).
    this.pausing = true;
    const game = this.game;
    while (game.locked && !game.ended && this.game === game) await sleep(80);
    this.pausing = false;
    if (this.game !== game || game.ended || this.app.ui.hasModal) return;
    this.game.setPaused(true);
    const { app } = this;
    const toggle = (key, label, ic) => {
      const btn = el('button', { class: `toggle-pill ${app.store.settings[key] ? 'on' : ''}`, type: 'button', 'aria-pressed': String(app.store.settings[key]) });
      const paint = () => {
        const on = app.store.settings[key];
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-pressed', String(on));
        btn.innerHTML = `${icon(on ? ic : 'mute')}<span>${label}: ${on ? 'ligado' : 'desligado'}</span>`;
      };
      btn.addEventListener('click', () => {
        app.audio.setSetting(key, !app.store.settings[key]);
        paint();
      });
      paint();
      return btn;
    };
    const s = this.session;
    const info =
      s.mode === 'endless'
        ? `Etapa ${s.stage} · ${formatNumber(s.score)} pontos · ${s.moves} movimentos`
        : s.goals.map((g) => `${describeGoal(g, (id) => app.saints.name(id))} (${formatNumber(Math.min(g.current, g.target))}/${formatNumber(g.target)})`).join(' · ');
    const body = el('div', { class: 'pause-body' }, el('p', { class: 'pause-info' }, info), el('div', { class: 'pause-toggles' }, toggle('music', 'Música', 'music'), toggle('sfx', 'Efeitos', 'sound')));
    const choice = await app.ui.modal({
      title: 'Pausa',
      eyebrow: `${s.title} · ${s.subtitle}`,
      body,
      className: 'pause-modal',
      actions: [
        { label: 'Sair', value: 'exit', icon: 'home' },
        { label: 'Reiniciar', value: 'restart', icon: 'refresh' },
        { label: 'Continuar', value: 'resume', primary: true, icon: 'play' },
      ],
    });
    if (choice === 'exit') {
      const ok = await app.ui.confirm('Sair da partida?', 'O andamento desta partida será perdido. Fases, recordes e reflexões já conquistados continuam salvos.', { ok: 'Sair' });
      if (ok) {
        if (s.mode === 'endless') s.checkpoint();
        this.exitTo(s.mode === 'endless' ? 'home' : 'levels');
        return;
      }
      this.pause();
      return;
    }
    if (choice === 'restart') {
      if (s.mode === 'endless') {
        s.checkpoint();
        this.startEndless();
      } else this.startLevel(s.level.id);
      return;
    }
    this.game?.setPaused(false);
  }

  /** Botão "voltar" do sistema (Android) durante a partida. */
  handleBack() {
    if (this.app.ui.hasModal) return;
    this.pause();
  }

  exitTo(screen) {
    this.teardown();
    this.session = null;
    this.app.go(screen);
  }
}

function line(label, value, cls = '') {
  return el('div', { class: `rline ${cls}` }, el('span', {}, label), el('strong', {}, value));
}
