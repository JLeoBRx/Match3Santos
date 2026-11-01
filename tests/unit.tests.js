/**
 * unit.tests.js — testes da lógica do jogo.
 * Executados no navegador (tests/index.html) ou no Node (node tests/run-node.mjs).
 */
import { Board } from '../js/board.js';
import { findMatchGroups, resolveStep, applyStep, countClearedByType, specialArea, comboArea } from '../js/matching.js';
import { scoreStep, starsFor, endlessStageTarget, cascadeMultiplier } from '../js/scoring.js';
import { SPECIAL, SAVE_KEY } from '../js/constants.js';
import { SaveStore, defaultSave } from '../js/storage.js';
import { ReflectionLibrary, isDisplayable } from '../js/reflections.js';
import { GoalTracker, normalizeLevel, starsForWin } from '../js/goals.js';
import { LevelSession } from '../js/levels.js';
import { EndlessSession } from '../js/endless.js';
import { createRng } from '../js/utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function assert(cond, msg = 'falhou') {
  if (!cond) throw new Error(msg);
}
function eq(a, b, msg = '') {
  if (a !== b) throw new Error(`${msg} esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`);
}

class FakeBackend {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial));
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
}

const TYPES6 = ['a', 'b', 'c', 'd', 'e', 'f'];

/** Resolve a jogada inteira (como o jogo faz) e devolve as etapas. */
function playOut(board, swapCells, combo = null) {
  const steps = [];
  let opts = { swapCells, combo };
  for (let i = 0; i < 60; i++) {
    const step = resolveStep(board, opts);
    opts = {};
    if (!step) break;
    applyStep(board, step);
    steps.push(step);
    board.collapse();
  }
  return steps;
}

// ---------------------------------------------------------------- tabuleiro
test('Tabuleiro inicial 8×8 sem combinações prontas e com jogada possível (300 sorteios)', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const b = new Board({ types: TYPES6, rng: createRng(seed) }).fillInitial();
    eq(b.rows, 8);
    eq(b.cols, 8);
    assert(!b.hasAnyMatch(), `semente ${seed} começou com combinação`);
    assert(b.hasPossibleMove(), `semente ${seed} sem jogada`);
    for (const row of b.grid) for (const p of row) assert(p && TYPES6.includes(p.type), 'peça inválida');
  }
});

test('Troca válida é aceita e troca inválida é recusada', () => {
  const b = Board.fromMatrix([
    ['a', 'a', 'b', 'a'],
    ['c', 'd', 'e', 'f'],
    ['d', 'e', 'f', 'c'],
  ]);
  assert(b.isValidSwap({ r: 0, c: 2 }, { r: 0, c: 3 }), 'deveria formar aaa');
  assert(!b.isValidSwap({ r: 1, c: 0 }, { r: 1, c: 1 }), 'troca sem combinação deveria ser inválida');
  assert(!b.isValidSwap({ r: 0, c: 0 }, { r: 2, c: 2 }), 'não adjacentes');
  // a troca inválida não altera o tabuleiro
  eq(b.get(1, 0).type, 'c');
});

test('Combinação horizontal de 3', () => {
  const b = Board.fromMatrix([
    ['a', 'a', 'a', 'b'],
    ['c', 'd', 'e', 'f'],
  ]);
  const g = findMatchGroups(b);
  eq(g.length, 1);
  eq(g[0].cells.length, 3);
  assert(g[0].hasH && !g[0].hasV);
});

test('Combinação vertical de 3', () => {
  const b = Board.fromMatrix([['a', 'b'], ['a', 'c'], ['a', 'd'], ['e', 'f']]);
  const g = findMatchGroups(b);
  eq(g.length, 1);
  assert(g[0].hasV && !g[0].hasH);
});

test('Combinações simultâneas de santos diferentes são detectadas', () => {
  const b = Board.fromMatrix([
    ['a', 'a', 'a', 'f'],
    ['c', 'd', 'e', 'f'],
    ['b', 'b', 'b', 'f'],
  ]);
  const g = findMatchGroups(b);
  eq(g.length, 3);
  const step = resolveStep(b);
  const counts = countClearedByType(step);
  eq(counts.a, 3);
  eq(counts.b, 3);
  eq(counts.f, 3);
});

test('Combinação de 4 horizontal cria Raio de Luz (linha) na peça movida', () => {
  const b = Board.fromMatrix([
    ['a', 'a', 'b', 'a', 'c'],
    ['d', 'e', 'a', 'f', 'd'],
    ['e', 'f', 'd', 'c', 'e'],
  ]);
  b.swap({ r: 0, c: 2 }, { r: 1, c: 2 });
  const step = resolveStep(b, { swapCells: [{ r: 0, c: 2 }, { r: 1, c: 2 }] });
  eq(step.creations.length, 1);
  eq(step.creations[0].special, SPECIAL.ROW);
  eq(step.creations[0].r, 0);
  eq(step.creations[0].c, 2);
});

test('Combinação de 4 vertical cria Raio de Luz (coluna)', () => {
  const b = Board.fromMatrix([['a', 'b'], ['a', 'c'], ['a', 'd'], ['a', 'e'], ['f', 'b']]);
  const step = resolveStep(b);
  eq(step.creations[0].special, SPECIAL.COL);
});

test('Combinação de 5 cria Auréola (área)', () => {
  const b = Board.fromMatrix([
    ['a', 'a', 'a', 'a', 'a'],
    ['b', 'c', 'd', 'e', 'f'],
  ]);
  const step = resolveStep(b);
  eq(step.creations[0].special, SPECIAL.AREA);
  eq(step.groups[0].kind, 'five');
});

test('Combinação em L/T cria Cruz no cruzamento', () => {
  const b = Board.fromMatrix([
    ['a', 'a', 'a', 'b'],
    ['c', 'a', 'd', 'e'],
    ['f', 'a', 'e', 'd'],
  ]);
  const step = resolveStep(b);
  eq(step.groups.length, 1);
  eq(step.creations[0].special, SPECIAL.CROSS);
  eq(step.creations[0].r, 0);
  eq(step.creations[0].c, 1);
});

test('Peça especial ativada elimina linha/coluna/área e provoca reação em cadeia', () => {
  const rows = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => TYPES6[(r * 2 + c * 3 + (r % 2)) % 6]));
  const b = Board.fromMatrix(rows, TYPES6);
  eq(specialArea(b, 3, 3, SPECIAL.ROW).length, 8);
  eq(specialArea(b, 3, 3, SPECIAL.COL).length, 8);
  eq(specialArea(b, 3, 3, SPECIAL.CROSS).length, 15);
  eq(specialArea(b, 3, 3, SPECIAL.AREA).length, 25);
  eq(specialArea(b, 0, 0, SPECIAL.AREA).length, 9);
  // linha 0 com especial de linha, que atinge uma especial de coluna em (0,5)
  b.grid[0][0].special = SPECIAL.ROW;
  b.grid[0][5].special = SPECIAL.COL;
  b.grid[0][1].type = b.grid[0][0].type;
  b.grid[0][2].type = b.grid[0][0].type;
  const step = resolveStep(b);
  const keys = new Set(step.cleared.map((x) => `${x.r},${x.c}`));
  for (let c = 0; c < 8; c++) assert(keys.has(`0,${c}`), 'linha 0 inteira');
  for (let r = 0; r < 8; r++) assert(keys.has(`${r},5`), 'coluna 5 inteira (reação em cadeia)');
  eq(step.effects.length, 2);
});

test('Troca entre duas especiais gera combo', () => {
  const rows = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => TYPES6[(r * 2 + c * 3 + (r % 2)) % 6]));
  const b = Board.fromMatrix(rows, TYPES6);
  b.grid[4][4].special = SPECIAL.ROW;
  b.grid[4][5].special = SPECIAL.COL;
  assert(b.isValidSwap({ r: 4, c: 4 }, { r: 4, c: 5 }), 'duas especiais sempre podem ser trocadas');
  const area = comboArea(b, { r: 4, c: 5 }, SPECIAL.ROW, SPECIAL.COL);
  eq(area.cells.length, 15);
  const big = comboArea(b, { r: 4, c: 4 }, SPECIAL.AREA, SPECIAL.AREA);
  eq(big.cells.length, 49);
  b.swap({ r: 4, c: 4 }, { r: 4, c: 5 });
  const step = resolveStep(b, { swapCells: [{ r: 4, c: 4 }, { r: 4, c: 5 }], combo: { a: { r: 4, c: 4 }, b: { r: 4, c: 5 } } });
  assert(step.combo, 'combo registrado');
  assert(step.cleared.length >= 15);
});

test('Queda e reposição preenchem o tabuleiro', () => {
  const b = new Board({ types: TYPES6, rng: createRng(7) }).fillInitial();
  const removed = b.removeCells([{ r: 7, c: 0 }, { r: 6, c: 0 }, { r: 2, c: 3 }]);
  eq(removed.length, 3);
  const top = b.get(0, 0);
  const { falls, spawns } = b.collapse();
  eq(spawns.length, 3);
  for (const row of b.grid) for (const p of row) assert(p, 'célula vazia após reposição');
  assert(falls.some((f) => f.piece === top && f.toR === 2), 'peça do topo caiu 2 casas');
  assert(spawns.every((s) => s.dropRows >= 1));
});

test('Cascata: nova combinação após a queda vira 2ª etapa com multiplicador ×2', () => {
  // Ao eliminar "aaa" (linha 2), os dois "b" da coluna 0 caem sobre o "b" da linha 3 → "bbb" vertical.
  const b = Board.fromMatrix(
    [
      ['b', 'c', 'd'],
      ['b', 'd', 'c'],
      ['a', 'a', 'a'],
      ['b', 'c', 'd'],
    ],
    ['a', 'b', 'c', 'd'],
    createRng(3),
  );
  const steps = playOut(b, []);
  assert(steps.length >= 2, `esperava cascata, obtive ${steps.length} etapa(s)`);
  assert(steps[1].groups.some((g) => g.type === 'b' && g.hasV), 'segunda etapa forma bbb vertical');
  eq(scoreStep(steps[1], 2).multiplier, 2);
  for (const row of b.grid) for (const p of row) assert(p, 'tabuleiro cheio após a cascata');
});

test('Pontuação e multiplicadores', () => {
  eq(cascadeMultiplier(1), 1);
  eq(cascadeMultiplier(3), 3);
  eq(cascadeMultiplier(99), 8);
  const b = Board.fromMatrix([['a', 'a', 'a', 'b'], ['c', 'd', 'e', 'f']]);
  const s = resolveStep(b);
  eq(scoreStep(s, 1).points, 60);
  eq(scoreStep(s, 2).points, 120);
  eq(starsFor(500, [1000, 1500, 2000]), 0);
  eq(starsFor(1600, [1000, 1500, 2000]), 2);
  eq(starsForWin(10, [1000, 1500, 2000]), 1);
  let prev = 0;
  for (let st = 1; st <= 20; st++) {
    const t = endlessStageTarget(st);
    assert(t > prev, 'metas do infinito devem crescer');
    prev = t;
  }
});

test('Sem jogadas possíveis → embaralhamento cria jogada sem combinação pronta', () => {
  const b = Board.fromMatrix(
    [
      ['a', 'b', 'c', 'd'],
      ['c', 'd', 'a', 'b'],
      ['a', 'b', 'c', 'd'],
      ['c', 'd', 'a', 'b'],
    ],
    ['a', 'b', 'c', 'd'],
    createRng(11),
  );
  assert(!b.hasPossibleMove(), 'pré-condição: sem jogadas');
  b.reshuffle();
  assert(b.hasPossibleMove(), 'após embaralhar deve haver jogada');
  assert(!b.hasAnyMatch(), 'após embaralhar não pode haver combinação pronta');
});

// ---------------------------------------------------------------- reflexões
function sampleReflections() {
  const mk = (n, extra = {}) => ({ id: n, title: `Título ${n}`, theme: 'Tema', reflection: `Texto ${n}`, question: `Pergunta ${n}?`, virtue: 'Virtude', status: 'revisar', ...extra });
  return {
    saints: {
      santo_x: { saint_name: 'Santo X', reflections: Array.from({ length: 10 }, (_, i) => mk(i + 1)) },
      santo_y: {
        saint_name: 'Santo Y',
        reflections: [mk(1), mk(2, { reflection: '[TEXTO PROVISÓRIO]', question: '[PERGUNTA PROVISÓRIA]' }), mk(3, { status: 'placeholder' }), mk(4)],
      },
      santo_z: { saint_name: 'Santo Z', reflections: [mk(1, { reflection: '[TEXTO PROVISÓRIO]' })] },
    },
  };
}

test('Marcadores provisórios nunca são considerados reflexões', () => {
  assert(!isDisplayable({ title: 'A', reflection: '[TEXTO PROVISÓRIO]', question: 'Q?' }));
  assert(!isDisplayable({ title: 'A', reflection: 'Texto', question: '[PERGUNTA PROVISÓRIA]' }));
  assert(!isDisplayable({ title: '', reflection: 'Texto', question: 'Q?' }));
  assert(!isDisplayable({ title: 'A', reflection: 'Texto', question: 'Q?', status: 'placeholder' }));
  assert(isDisplayable({ title: 'A', reflection: 'Texto real', question: 'Q?', status: 'revisar' }));
  const lib = new ReflectionLibrary(sampleReflections(), new SaveStore('t', new FakeBackend()));
  eq(lib.progress('santo_y').total, 2);
  eq(lib.draw('santo_z'), null);
  const seen = new Set();
  for (let i = 0; i < 12; i++) seen.add(lib.draw('santo_y').reflection.id);
  assert(!seen.has(2) && !seen.has(3), 'provisórias não podem aparecer');
});

test('Reflexões: 1º ciclo em ordem, sem repetir antes de completar as 10', () => {
  const store = new SaveStore('t', new FakeBackend());
  const lib = new ReflectionLibrary(sampleReflections(), store);
  const first = [];
  for (let i = 0; i < 10; i++) {
    const d = lib.draw('santo_x');
    first.push(d.reflection.id);
    assert(d.isNew, 'no primeiro ciclo todas são novas');
  }
  eq(first.join(','), '1,2,3,4,5,6,7,8,9,10');
  eq(lib.progress('santo_x').discovered, 10);
  // ciclos seguintes: aleatórios, cada um com as 10 sem repetição, e sem repetir a última na virada
  let last = first[first.length - 1];
  for (let cycle = 0; cycle < 6; cycle++) {
    const ids = [];
    for (let i = 0; i < 10; i++) ids.push(lib.draw('santo_x').reflection.id);
    eq(new Set(ids).size, 10, 'ciclo sem repetição');
    assert(ids[0] !== last, 'não repete a última reflexão na virada do ciclo');
    last = ids[9];
  }
});

test('Reflexões: histórico salvo e restaurado (persistência)', () => {
  const backend = new FakeBackend();
  const store = new SaveStore(SAVE_KEY, backend);
  const lib = new ReflectionLibrary(sampleReflections(), store);
  lib.draw('santo_x');
  lib.draw('santo_x');
  lib.draw('santo_y');
  const store2 = new SaveStore(SAVE_KEY, backend);
  const lib2 = new ReflectionLibrary(sampleReflections(), store2);
  eq(lib2.progress('santo_x').discovered, 2);
  eq(store2.data.reflections.history.length, 3);
  eq(store2.data.reflections.last.saint, 'santo_y');
  eq(lib2.draw('santo_x').reflection.id, 3, 'continua de onde parou');
});

// ---------------------------------------------------------------- armazenamento
test('Salvamento: ida e volta, migração de versão e save corrompido', () => {
  const backend = new FakeBackend();
  const s1 = new SaveStore(SAVE_KEY, backend);
  s1.recordLevelResult(1, { won: true, score: 4000, stars: 2 });
  s1.recordEndlessProgress(12345, 4);
  const s2 = new SaveStore(SAVE_KEY, backend);
  eq(s2.data.levels.unlocked, 2);
  eq(s2.data.levels.stars[1], 2);
  eq(s2.data.endless.highScore, 12345);
  eq(s2.data.endless.bestStage, 4);
  // migração v1 → atual
  const old = { version: 1, levels: { unlocked: 5, completed: [1, 2, 3, 4], stars: { 1: 3 } }, settings: { music: false, reducedMotion: true } };
  const s3 = new SaveStore(SAVE_KEY, new FakeBackend({ [SAVE_KEY]: JSON.stringify(old) }));
  eq(s3.data.version, defaultSave().version);
  eq(s3.data.levels.unlocked, 5);
  eq(s3.data.settings.music, false);
  eq(s3.data.preferences.reducedMotion, true);
  assert(!('reducedMotion' in s3.data.settings));
  // corrompido
  const bad = new FakeBackend({ [SAVE_KEY]: '{isso não é json' });
  const s4 = new SaveStore(SAVE_KEY, bad);
  eq(s4.data.levels.unlocked, 1);
  assert(bad.getItem(SAVE_KEY + '.backup'), 'backup do save corrompido');
  // reiniciar mantém configurações
  s2.update((d) => (d.settings.sfx = false));
  s2.reset();
  eq(s2.data.levels.unlocked, 1);
  eq(s2.data.settings.sfx, false);
});

// ---------------------------------------------------------------- fases e infinito
test('Objetivos: pontuação, peças, santo específico e combinados', () => {
  const t = new GoalTracker([
    { type: 'score', target: 100 },
    { type: 'clear', target: 6 },
    { type: 'saint', saint: 'a', target: 3 },
    { type: 'specials', target: 1 },
  ]);
  t.record({ points: 60, clearedByType: { a: 3 } });
  assert(!t.isComplete());
  t.record({ points: 60, clearedByType: { b: 3 }, specialsCreated: 1 });
  assert(t.isComplete());
  eq(t.progress(), 1);
});

test('Fase: vitória desbloqueia a próxima e salva estrelas; derrota preserva progresso', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  const level = normalizeLevel({ id: 1, moves: 3, saints: ids, goals: [{ type: 'score', target: 100 }], stars: [100, 300, 500] }, ids);
  const store = new SaveStore('t', new FakeBackend());
  const s = new LevelSession(level, store);
  s.useMove();
  s.record({ points: 120, cleared: { a: 3 }, specialsCreated: 0 });
  eq(s.evaluate(), 'win');
  const res = s.finalize(true);
  eq(res.bonus, 2 * level.moveBonus);
  assert(res.stars >= 2);
  eq(store.data.levels.unlocked, 2);
  assert(store.data.levels.completed.includes(1));
  // derrota
  const s2 = new LevelSession(level, store);
  s2.useMove();
  s2.useMove();
  s2.useMove();
  eq(s2.evaluate(), 'lose');
  s2.finalize(false);
  eq(store.data.levels.unlocked, 2, 'derrota não remove desbloqueio');
  eq(store.data.levels.stars[1], res.stars, 'derrota não remove estrelas');
  // formato simplificado do levels.json
  const simple = normalizeLevel({ id: 9, targetScore: 1000, moves: 20, stars: [1000, 1500, 2000] }, ids);
  eq(simple.goals[0].type, 'score');
  eq(simple.goals[0].target, 1000);
  assert(simple.pool.length >= 4);
});

test('Modo infinito: 30 movimentos, +15 por etapa, metas crescentes e recorde salvo', () => {
  const ids = Array.from({ length: 30 }, (_, i) => 's' + i);
  const store = new SaveStore('t', new FakeBackend());
  const e = new EndlessSession(store, ids);
  eq(e.moves, 30);
  eq(e.pool.length, 6);
  const seen = new Set(e.pool);
  e.useMove();
  e.record({ points: e.target });
  eq(e.evaluate(), 'stage');
  const t1 = e.target;
  e.nextStage();
  e.pool.forEach((p) => seen.add(p));
  eq(e.stage, 2);
  eq(e.moves, 29 + 15);
  assert(e.target > t1);
  eq(e.stageScore, 0);
  for (let i = 0; i < 3; i++) {
    e.nextStage();
    e.pool.forEach((p) => seen.add(p));
  }
  eq(seen.size, 30, 'em 5 etapas os 30 santos aparecem');
  e.nextStage();
  e.nextStage();
  e.checkpoint();
  eq(store.data.endless.highScore, e.score);
  e.moves = 0;
  eq(e.evaluate(), 'lose');
  const res = e.finalize();
  eq(res.stage, 7);
  eq(store.data.endless.bestStage, 7);
});

// ---------------------------------------------------------------- dados do projeto
export function dataTests(loadJson) {
  test('Dados: 30 santos com ids únicos e reflexões correspondentes', async () => {
    const saints = (await loadJson('data/saints.json')).saints;
    const refl = await loadJson('data/reflections.json');
    eq(saints.length, 30);
    eq(new Set(saints.map((s) => s.id)).size, 30);
    for (const s of saints) {
      assert(/^[a-z0-9_]+$/.test(s.id), `id inválido: ${s.id}`);
      assert(s.image === 'Santos/' + s.file, `caminho da imagem de ${s.id}`);
      assert(refl.saints[s.id], `sem reflexões para ${s.id}`);
      eq(refl.saints[s.id].reflections.length, 10, `10 reflexões para ${s.id}`);
    }
  });

  test('Dados: as 300 reflexões do arquivo são exibíveis', async () => {
    const refl = await loadJson('data/reflections.json');
    const lib = new ReflectionLibrary(refl, new SaveStore('t', new FakeBackend()));
    const rep = lib.report();
    eq(rep.slots, 300);
    eq(rep.valid, 300, `${rep.placeholders} reflexões marcadas como provisórias`);
  });

  test('Dados: todas as fases são válidas e jogáveis', async () => {
    const saints = (await loadJson('data/saints.json')).saints.map((s) => s.id);
    const levels = (await loadJson('data/levels.json')).levels.map((l) => normalizeLevel(l, saints));
    assert(levels.length >= 10);
    levels.forEach((l, i) => {
      eq(l.id, i + 1, 'ids sequenciais');
      assert(l.pool.length >= 4 && l.pool.length <= 8, `fase ${l.id}: santos no tabuleiro`);
      assert(l.goals.length >= 1, `fase ${l.id}: objetivos`);
      assert(l.stars[0] < l.stars[1] && l.stars[1] < l.stars[2], `fase ${l.id}: estrelas crescentes`);
      for (const g of l.goals) if (g.type === 'saint') assert(l.pool.includes(g.saint), `fase ${l.id}: santo do objetivo no tabuleiro`);
      new Board({ types: l.pool, rng: createRng(l.id) }).fillInitial();
    });
    const featured = new Set(levels.map((l) => l.featured));
    eq(featured.size, Math.min(30, levels.length), 'cada fase destaca um santo diferente');
  });
}

/** Executa todos os testes; `log(ok, name, err)` recebe cada resultado. */
export async function runAll(log) {
  let pass = 0;
  let fail = 0;
  for (const t of tests) {
    try {
      await t.fn();
      pass++;
      log(true, t.name);
    } catch (err) {
      fail++;
      log(false, t.name, err);
    }
  }
  return { pass, fail, total: tests.length };
}
