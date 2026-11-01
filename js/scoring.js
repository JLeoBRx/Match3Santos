/**
 * scoring.js — pontuação, multiplicadores de cascata, estrelas e metas do modo infinito.
 */

export const POINTS = Object.freeze({
  piece: 20, // cada peça eliminada
  four: 60, // bônus por combinação de 4
  cross: 100, // bônus por combinação em L/T
  five: 150, // bônus por combinação de 5
  specialActivation: 40, // cada peça especial ativada
  combo: 200, // troca entre duas especiais
});

export const MAX_MULTIPLIER = 8;

/** 1ª etapa ×1, 2ª ×2, 3ª ×3 ... até ×8. */
export function cascadeMultiplier(stepIndex) {
  return Math.max(1, Math.min(stepIndex, MAX_MULTIPLIER));
}

/** Calcula os pontos de uma etapa resolvida (ver matching.resolveStep). */
export function scoreStep(step, stepIndex) {
  let base = step.cleared.length * POINTS.piece;
  for (const group of step.groups) {
    if (group.kind === 'five') base += POINTS.five;
    else if (group.kind === 'cross') base += POINTS.cross;
    else if (group.kind === 'four') base += POINTS.four;
  }
  base += step.effects.filter((e) => e.kind !== 'combo').length * POINTS.specialActivation;
  if (step.combo) base += POINTS.combo;
  const multiplier = cascadeMultiplier(stepIndex);
  return { base, multiplier, points: base * multiplier };
}

/** Palavra de incentivo exibida nas cascatas. */
export function cascadeLabel(stepIndex) {
  const labels = ['', '', 'Bom!', 'Ótimo!', 'Incrível!', 'Divino!', 'Aleluia!'];
  return labels[Math.min(stepIndex, labels.length - 1)] || '';
}

/** Quantidade de estrelas (0–3) para uma pontuação e limites [1★, 2★, 3★]. */
export function starsFor(score, thresholds = []) {
  let stars = 0;
  thresholds.forEach((t, i) => {
    if (score >= t) stars = i + 1;
  });
  return Math.min(3, stars);
}

/** Meta de pontos da etapa N do modo infinito (cresce de forma progressiva). */
export function endlessStageTarget(stage) {
  const n = Math.max(1, stage) - 1;
  const raw = 1200 + 650 * n + 90 * n * n;
  return Math.round(raw / 50) * 50;
}
