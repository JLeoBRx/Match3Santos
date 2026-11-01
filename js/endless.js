/**
 * endless.js — Modo Infinito.
 *
 * Regras:
 *  - começa com 30 movimentos;
 *  - cada etapa tem uma meta de pontos (cada vez maior);
 *  - ao atingir a meta: nova etapa, +15 movimentos e um novo grupo de santos;
 *  - acabou os movimentos antes da meta → fim de jogo;
 *  - recorde, pontuação e melhor etapa são salvos.
 */
import { ENDLESS } from './constants.js';
import { endlessStageTarget } from './scoring.js';
import { shuffle } from './utils.js';

export class EndlessSession {
  constructor(store, saintIds) {
    this.mode = 'endless';
    this.store = store;
    this.allSaints = saintIds.slice();
    this.deck = [];
    this.stage = 1;
    this.moves = ENDLESS.startMoves;
    this.score = 0;
    this.stageScore = 0;
    this.target = endlessStageTarget(1);
    this.pool = this.drawPool();
    this.goals = [];
    this.recordBroken = false;
    this.startRecord = store.data.endless.highScore;
    this.startBestStage = store.data.endless.bestStage;
  }

  get title() {
    return 'Modo Infinito';
  }

  get subtitle() {
    return `Etapa ${this.stage}`;
  }

  /** Sorteia os santos da etapa percorrendo os 30 em ciclos (todos aparecem). */
  drawPool() {
    const size = Math.min(ENDLESS.saintsPerStage, this.allSaints.length);
    const pool = [];
    let guard = 0;
    while (pool.length < size && guard++ < 200) {
      if (!this.deck.length) this.deck = shuffle(this.allSaints);
      const next = this.deck.shift();
      if (!pool.includes(next)) pool.push(next);
    }
    return pool;
  }

  useMove() {
    this.moves = Math.max(0, this.moves - 1);
  }

  record({ points }) {
    this.score += points;
    this.stageScore += points;
  }

  progress() {
    return Math.min(1, this.stageScore / this.target);
  }

  evaluate() {
    if (this.stageScore >= this.target) return 'stage';
    if (this.moves <= 0) return 'lose';
    return null;
  }

  /** Avança para a próxima etapa. */
  nextStage() {
    this.stage += 1;
    this.moves += ENDLESS.bonusMoves;
    this.stageScore = 0;
    this.target = endlessStageTarget(this.stage);
    this.pool = this.drawPool();
    return { stage: this.stage, bonusMoves: ENDLESS.bonusMoves, target: this.target };
  }

  /** Salva recorde parcial (para não se perder ao recarregar a página). */
  checkpoint() {
    const broke = this.store.recordEndlessProgress(this.score, this.stage);
    if (broke && this.score > this.startRecord) this.recordBroken = true;
  }

  finalize() {
    this.store.finishEndless(this.score, this.stage);
    return {
      score: this.score,
      stage: this.stage,
      newRecord: this.score > this.startRecord && this.score > 0,
      newBestStage: this.stage > this.startBestStage && this.stage > 1,
      highScore: this.store.data.endless.highScore,
      bestStage: this.store.data.endless.bestStage,
    };
  }
}
