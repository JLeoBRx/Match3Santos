/**
 * constants.js — parâmetros globais do jogo.
 * Ajuste aqui para alterar o ritmo das animações, o tamanho do tabuleiro etc.
 */

export const BOARD_ROWS = 8;
export const BOARD_COLS = 8;

/** Tipos de peças especiais. */
export const SPECIAL = Object.freeze({
  ROW: 'row', // combinação de 4 na horizontal → elimina a linha
  COL: 'col', // combinação de 4 na vertical → elimina a coluna
  CROSS: 'cross', // combinação em L ou T → elimina linha + coluna
  AREA: 'area', // combinação de 5 em linha → elimina área 5×5
});

export const SPECIAL_INFO = Object.freeze({
  row: { name: 'Raio de Luz', desc: 'Elimina toda a linha' },
  col: { name: 'Raio de Luz', desc: 'Elimina toda a coluna' },
  cross: { name: 'Cruz', desc: 'Elimina linha e coluna' },
  area: { name: 'Auréola', desc: 'Elimina uma área 5×5' },
});

/** Cores das molduras: cada santo do tabuleiro recebe uma cor distinta para leitura rápida. */
export const FRAME_COLORS = Object.freeze([
  '#9b6bff', // violeta
  '#f7b733', // dourado
  '#ff7a45', // laranja
  '#22c3b4', // turquesa
  '#ff5d8f', // rosa
  '#4d8dff', // azul
  '#6fcf7c', // verde
  '#e6e9f5', // prata
]);

/** Duração das animações (ms). Multiplicadas por 0 quando "animações reduzidas" está ativo. */
export const TIMING = Object.freeze({
  swap: 170,
  invalidSwap: 150,
  clear: 240,
  createSpecial: 260,
  fallBase: 150,
  fallPerRow: 45,
  stepPause: 60,
  shuffle: 420,
  hintDelay: 6000,
});

export const SAVE_KEY = 'matchDosSantos.save';
export const SAVE_VERSION = 2;

/** Modo infinito. */
export const ENDLESS = Object.freeze({
  startMoves: 30,
  bonusMoves: 15,
  saintsPerStage: 6,
});
