/**
 * e2e.mjs — teste de ponta a ponta no navegador (Playwright + Chromium).
 * Joga de verdade: arrasta e toca peças, vence uma fase, recarrega a página,
 * joga o modo infinito, abre o álbum e as configurações, em computador e celular.
 *
 * Requisitos: Node 18+ e Playwright (npm i -D playwright && npx playwright install chromium)
 * Uso:        node tests/e2e.mjs            (sobe um servidor local próprio)
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' };

// ------------------------------------------------------------------ servidor estático
const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = join(ROOT, path || 'index.html');
    if (!file.startsWith(ROOT)) throw new Error('fora da raiz');
    if ((await stat(file)).isDirectory()) throw new Error('diretório');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end('404');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

// ------------------------------------------------------------------ utilidades
const results = [];
const errors = [];
function check(cond, name, detail = '') {
  results.push({ ok: Boolean(cond), name, detail });
  console.log(`${cond ? '✔' : '✘'} ${name}${detail ? ' — ' + detail : ''}`);
}

function watch(page, label) {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${label}] console: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[${label}] erro: ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`[${label}] falha de rede: ${r.url()}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().includes('fonts.g')) errors.push(`[${label}] HTTP ${r.status()}: ${r.url()}`);
  });
}

const app = (page, fn, arg) => page.evaluate(fn, arg);

async function cellCenter(page, r, c) {
  return page.evaluate(
    ([r, c]) => {
      const b = document.querySelector('.board').getBoundingClientRect();
      return { x: b.left + ((c + 0.5) * b.width) / 8, y: b.top + ((r + 0.5) * b.height) / 8 };
    },
    [r, c],
  );
}

async function dragCells(page, a, b) {
  const p1 = await cellCenter(page, a.r, a.c);
  const p2 = await cellCenter(page, b.r, b.c);
  await page.mouse.move(p1.x, p1.y);
  await page.mouse.down();
  await page.mouse.move((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, { steps: 3 });
  await page.mouse.move(p2.x, p2.y, { steps: 3 });
  await page.mouse.up();
}

async function tapCell(page, r, c) {
  const p = await cellCenter(page, r, c);
  await page.touchscreen.tap(p.x, p.y);
}

async function waitIdle(page) {
  await page.waitForFunction(
    () => {
      const g = window.matchDosSantos.gameScreen.game;
      return !g || g.ended || (!g.locked && !g.paused);
    },
    null,
    { timeout: 30000 },
  );
  await page.waitForTimeout(60);
}

/** Escolhe a melhor jogada (maior sequência) como um jogador atento. */
async function bestMove(page) {
  return page.evaluate(() => {
    const board = window.matchDosSantos.gameScreen.game.board;
    let best = null;
    let bestV = -1;
    for (const mv of board.findPossibleMoves()) {
      board.swap(mv.a, mv.b);
      const la = board.runLengthsAt(mv.a.r, mv.a.c);
      const lb = board.runLengthsAt(mv.b.r, mv.b.c);
      board.swap(mv.a, mv.b);
      const v = Math.max(la.h, la.v, lb.h, lb.v) + (board.get(mv.a.r, mv.a.c).special ? 2 : 0) + (board.get(mv.b.r, mv.b.c).special ? 2 : 0) + Math.random() * 0.3;
      if (v > bestV) {
        bestV = v;
        best = mv;
      }
    }
    return best;
  });
}

async function closeTutorial(page) {
  const btn = await page.$('.sheet-tutorial .btn-primary');
  if (btn) {
    await btn.click();
    await page.waitForTimeout(300);
  }
}

async function noHorizontalScroll(page) {
  return page.evaluate(() => {
    const s = document.querySelector('.screen.active');
    return s.scrollWidth <= s.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1;
  });
}

const browser = await chromium.launch();

// ================================================================== COMPUTADOR
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  watch(page, 'desktop');
  await page.goto(BASE + 'index.html');
  await page.waitForSelector('[data-screen="home"].active', { timeout: 20000 });

  // 1–2. Imagens
  const img = await app(page, async () => {
    const a = window.matchDosSantos;
    const originals = await a.saints.verifyOriginals();
    return { count: a.saints.list.length, broken: a.saints.list.filter((s) => s.broken).length, originalsOk: originals.filter((o) => o.ok).length };
  });
  check(img.count === 30 && img.broken === 0, 'As 30 miniaturas dos santos carregaram', JSON.stringify(img));
  check(img.originalsOk === 30, 'Os 30 retratos originais (Santos/) carregaram sem imagem quebrada');
  check(await noHorizontalScroll(page), 'Tela inicial sem rolagem horizontal');

  // Fase 1
  await page.click('#btn-play');
  await page.waitForSelector('[data-screen="levels"].active');
  check((await page.$$('.level-node')).length === 30, 'Mapa exibe 30 fases');
  check((await page.$$('.level-node.state-locked')).length === 29, 'Somente a fase 1 começa liberada');
  await page.click('.level-node.state-available');
  await page.click('.sheet-preview .btn-primary');
  await page.waitForSelector('[data-screen="game"].active');
  await page.waitForTimeout(1200);
  await closeTutorial(page);
  await waitIdle(page);

  // 3. Tabuleiro inicial
  const start = await app(page, () => {
    const g = window.matchDosSantos.gameScreen.game;
    return { tiles: document.querySelectorAll('.board .tile').length, match: g.board.hasAnyMatch(), moves: window.matchDosSantos.gameScreen.session.moves };
  });
  check(start.tiles === 64 && !start.match, 'Tabuleiro 8×8 com 64 peças e sem combinações automáticas', JSON.stringify(start));

  // 5. Troca inválida
  const invalid = await app(page, () => {
    const b = window.matchDosSantos.gameScreen.game.board;
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 7; c++) {
        const a = { r, c };
        const bb = { r, c: c + 1 };
        if (!b.isValidSwap(a, bb)) return { a, b: bb, before: JSON.stringify(b.toMatrix()) };
      }
    return null;
  });
  await dragCells(page, invalid.a, invalid.b);
  await page.waitForTimeout(500);
  await waitIdle(page);
  const afterInvalid = await app(page, () => ({ m: JSON.stringify(window.matchDosSantos.gameScreen.game.board.toMatrix()), moves: window.matchDosSantos.gameScreen.session.moves }));
  check(afterInvalid.m === invalid.before && afterInvalid.moves === start.moves, 'Troca inválida é desfeita e não gasta movimento');

  // 4, 10, 11, 12. Troca válida por arrastar
  let mv = await bestMove(page);
  await dragCells(page, mv.a, mv.b);
  await page.waitForTimeout(200);
  await waitIdle(page);
  const after1 = await app(page, () => {
    const s = window.matchDosSantos.gameScreen.session;
    const panel = document.querySelector('.reflection-panel');
    return {
      moves: s.moves,
      score: s.score,
      title: panel.querySelector('.rp-title')?.textContent || '',
      text: panel.querySelector('.rp-text')?.textContent || '',
      progress: panel.querySelector('.rp-progress strong')?.textContent || '',
      html: panel.textContent,
      noMatch: !window.matchDosSantos.gameScreen.game.board.hasAnyMatch(),
    };
  });
  check(after1.moves === start.moves - 1, 'Jogada válida por arrastar gasta 1 movimento', `${start.moves} → ${after1.moves}`);
  check(after1.score > 0, 'Pontuação aumenta após combinação', String(after1.score));
  check(after1.title && after1.text && /^\d+\/10$/.test(after1.progress), 'Painel de reflexão atualizado (título, texto e progresso x/10)', `${after1.title} · ${after1.progress}`);
  check(!/PROVIS[ÓO]RI/i.test(after1.html), 'Nenhum marcador provisório exibido no painel');
  check(after1.noMatch, 'Após as cascatas o tabuleiro fica estável (sem combinações pendentes)');
  check((await page.$$('.mds-veil')).length === 0, 'A reflexão não abre janela/modal durante a partida');

  // 6. Clique-clique (mouse)
  mv = await bestMove(page);
  const movesBefore = await app(page, () => window.matchDosSantos.gameScreen.session.moves);
  const p1 = await cellCenter(page, mv.a.r, mv.a.c);
  const p2 = await cellCenter(page, mv.b.r, mv.b.c);
  await page.mouse.click(p1.x, p1.y);
  await page.waitForTimeout(120);
  check(await page.$('.tile.selected'), 'Clique seleciona a peça (destaque visual)');
  await page.mouse.click(p2.x, p2.y);
  await page.waitForTimeout(200);
  await waitIdle(page);
  check((await app(page, () => window.matchDosSantos.gameScreen.session.moves)) === movesBefore - 1, 'Troca por clique em duas peças vizinhas funciona');

  // Joga até o fim da fase
  let sawQueue = false;
  let sawSpecial = false;
  let maxSteps = 0;
  for (let i = 0; i < 40; i++) {
    const over = await page.$('.sheet-result');
    if (over) break;
    mv = await bestMove(page);
    if (!mv) break;
    await dragCells(page, mv.a, mv.b);
    await page.waitForTimeout(150);
    await waitIdle(page);
    sawQueue = sawQueue || Boolean(await page.$('.rp-queue:not([hidden])'));
    sawSpecial = sawSpecial || Boolean(await page.$('.tile.special'));
    maxSteps = Math.max(maxSteps, await app(page, () => window.matchDosSantos.store.data.stats.bestCascade));
  }
  await page.waitForSelector('.sheet-result', { timeout: 15000 });
  await page.waitForTimeout(1600);
  const res = await app(page, () => ({ title: document.querySelector('.sheet-result .mds-heading').textContent, stars: document.querySelectorAll('.rstar.on').length, save: window.matchDosSantos.store.data.levels }));
  check(res.save.unlocked >= 2 && res.save.completed.includes(1), 'Vitória na fase 1 desbloqueia a fase 2', `${res.title} · ${res.stars}★`);
  check(res.stars >= 1 && res.save.stars[1] === res.stars, 'Estrelas exibidas e salvas', `${res.stars}`);
  check(sawQueue, 'Combinações durante o tempo de leitura ficam na fila (sem sobrepor o painel)');
  check(maxSteps >= 2, 'Cascatas ocorreram e foram registradas', `maior cascata: ${maxSteps}`);
  console.log(`   (peça especial vista durante a partida: ${sawSpecial ? 'sim' : 'não'})`);
  await page.screenshot({ path: ROOT + 'tests/screenshots/desktop-result.png' }).catch(() => {});
  await page.click('.sheet-result .btn-primary'); // próxima fase
  await page.waitForTimeout(1500);
  check(await app(page, () => window.matchDosSantos.gameScreen.session?.level?.id === 2), 'Botão "Próxima fase" inicia a fase 2');

  // 14. Recarregar a página preserva o progresso
  const discoveredBefore = await app(page, () => window.matchDosSantos.library.totals().discovered);
  await page.reload();
  await page.waitForSelector('[data-screen="home"].active', { timeout: 20000 });
  const reloaded = await app(page, () => ({ unlocked: window.matchDosSantos.store.data.levels.unlocked, stars: window.matchDosSantos.store.totalStars(), disc: window.matchDosSantos.library.totals().discovered }));
  check(reloaded.unlocked >= 2 && reloaded.stars >= 1 && reloaded.disc === discoveredBefore && reloaded.disc > 0, 'Progresso restaurado após recarregar a página', JSON.stringify(reloaded));

  // 16. Modo infinito
  await page.click('#btn-endless');
  await page.waitForSelector('[data-screen="game"].active');
  await page.waitForTimeout(1200);
  await closeTutorial(page);
  await waitIdle(page);
  const e0 = await app(page, () => ({ moves: window.matchDosSantos.gameScreen.session.moves, pool: window.matchDosSantos.gameScreen.session.pool.slice() }));
  check(e0.moves === 30 && e0.pool.length === 6, 'Modo infinito começa com 30 movimentos');
  let stage2 = null;
  for (let i = 0; i < 30 && !stage2; i++) {
    const before = await app(page, () => ({ moves: window.matchDosSantos.gameScreen.session.moves, stage: window.matchDosSantos.gameScreen.session.stage }));
    mv = await bestMove(page);
    await dragCells(page, mv.a, mv.b);
    await page.waitForTimeout(150);
    await waitIdle(page);
    const now = await app(page, () => ({ moves: window.matchDosSantos.gameScreen.session.moves, stage: window.matchDosSantos.gameScreen.session.stage, pool: window.matchDosSantos.gameScreen.session.pool.slice(), tiles: document.querySelectorAll('.board .tile').length }));
    if (now.stage === 2) stage2 = { before, now };
  }
  check(stage2 && stage2.now.moves === stage2.before.moves - 1 + 15, 'Etapa concluída concede +15 movimentos', stage2 ? `${stage2.before.moves} → ${stage2.now.moves}` : 'etapa 2 não alcançada');
  check(stage2 && stage2.now.tiles === 64 && stage2.now.pool.join() !== e0.pool.join(), 'Nova etapa traz novo tabuleiro com outro grupo de santos');
  const hs = await app(page, () => window.matchDosSantos.store.data.endless);
  check(hs.highScore > 0 && hs.bestStage >= 2, 'Recorde e melhor etapa do infinito salvos durante a partida', JSON.stringify(hs));
  // pausa → sair
  await page.click('.hud-back');
  await page.waitForSelector('.sheet-pause');
  await page.click('.sheet-pause .btn:not(.btn-primary)'); // Sair
  await page.waitForTimeout(250);
  await page.click('.mds-veil:last-child .btn-primary'); // confirmar
  await page.waitForSelector('[data-screen="home"].active');
  check(true, 'Pausa → Sair volta à tela inicial');

  // Álbum
  await page.click('#btn-album');
  await page.waitForSelector('[data-screen="album"].active');
  check((await page.$$('.saint-card')).length === 30, 'Álbum exibe os 30 santos');
  await page.click('.saint-card.state-discovered, .saint-card.state-complete');
  await page.waitForSelector('[data-screen="saint"].active');
  const det = await app(page, () => ({ items: document.querySelectorAll('.refl-item').length, open: document.querySelectorAll('.refl-item.open').length, hero: document.querySelector('.saint-hero-img img').naturalWidth > 0 }));
  check(det.items === 10 && det.open >= 1 && det.hero, 'Detalhes do santo: retrato grande e 10 reflexões com as descobertas legíveis', JSON.stringify(det));
  await page.click('[data-screen="saint"] .screen-header .icon-btn');
  await page.waitForSelector('[data-screen="album"].active');

  // Configurações
  await page.click('[data-screen="album"] .screen-header .icon-btn');
  await page.click('#btn-settings');
  await page.waitForSelector('[data-screen="settings"].active');
  await page.click('.set-row:has-text("Animações reduzidas") .switch');
  await page.click('.set-row:has-text("Música de fundo") .switch');
  const prefs = await app(page, () => ({ reduced: window.matchDosSantos.store.prefs.reducedMotion, music: window.matchDosSantos.store.settings.music, bodyClass: document.body.classList.contains('reduced-motion') }));
  check(prefs.reduced && !prefs.music && prefs.bodyClass, 'Configurações aplicadas e salvas (animações reduzidas, música desligada)');
  await page.click('.set-row:has-text("Verificar conteúdo") button');
  await page.waitForSelector('.diag li');
  const diag = await app(page, () => ({ ok: document.querySelectorAll('.diag li.ok').length, warn: document.querySelectorAll('.diag li.warn').length }));
  check(diag.warn === 0 && diag.ok >= 6, 'Diagnóstico de conteúdo sem pendências', JSON.stringify(diag));
  await ctx.close();
}

// ================================================================== CELULAR (toque)
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  watch(page, 'celular');
  await page.goto(BASE + 'index.html');
  await page.waitForSelector('[data-screen="home"].active', { timeout: 20000 });
  check(await noHorizontalScroll(page), 'Celular: tela inicial sem rolagem horizontal');
  await page.tap('#btn-endless');
  await page.waitForSelector('[data-screen="game"].active');
  await page.waitForTimeout(1200);
  await closeTutorial(page);
  await waitIdle(page);
  const geo = await app(page, () => {
    const b = document.querySelector('.board').getBoundingClientRect();
    const p = document.querySelector('.reflection-panel').getBoundingClientRect();
    return { cell: b.width / 8, boardBottom: b.bottom, panelTop: p.top, panelH: p.height, layout: document.querySelector('.game-layout').className };
  });
  check(geo.cell >= 40, 'Celular: peças com tamanho confortável para toque', `${geo.cell.toFixed(1)}px`);
  check(geo.layout.includes('is-bottom') && geo.panelTop >= geo.boardBottom && geo.panelH >= 110, 'Celular: painel de reflexão abaixo do tabuleiro', JSON.stringify(geo));
  check(await noHorizontalScroll(page), 'Celular: partida sem rolagem horizontal');
  const mv = await bestMove(page);
  const m0 = await app(page, () => window.matchDosSantos.gameScreen.session.moves);
  await tapCell(page, mv.a.r, mv.a.c);
  await page.waitForTimeout(150);
  await tapCell(page, mv.b.r, mv.b.c);
  await page.waitForTimeout(200);
  await waitIdle(page);
  check((await app(page, () => window.matchDosSantos.gameScreen.session.moves)) === m0 - 1, 'Celular: troca por toque em duas peças funciona');
  await page.screenshot({ path: ROOT + 'tests/screenshots/phone-game.png' }).catch(() => {});
  for (const screen of ['levels', 'album', 'settings']) {
    await app(page, (s) => {
      window.matchDosSantos.gameScreen.teardown();
      window.matchDosSantos.go(s);
    }, screen);
    await page.waitForTimeout(400);
    check(await noHorizontalScroll(page), `Celular: tela "${screen}" sem rolagem horizontal`);
  }
  await ctx.close();
}

// ================================================================== CELULAR DEITADO
{
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  watch(page, 'paisagem');
  await page.goto(BASE + 'index.html');
  await page.waitForSelector('[data-screen="home"].active', { timeout: 20000 });
  await app(page, () => window.matchDosSantos.store.update((d) => (d.preferences.seenTutorial = true)));
  await page.tap('#btn-endless');
  await page.waitForSelector('[data-screen="game"].active');
  await page.waitForTimeout(1200);
  const geo = await app(page, () => ({ size: document.querySelector('.board').getBoundingClientRect().width, layout: document.querySelector('.game-layout').className }));
  check(geo.layout.includes('is-side') && geo.size >= 300, 'Paisagem: painel ao lado e tabuleiro priorizado', JSON.stringify(geo));
  check(await noHorizontalScroll(page), 'Paisagem: sem rolagem horizontal');
  await ctx.close();
}

// ================================================================== JANELAS EM TELA BAIXA
{
  const ctx = await browser.newContext({ viewport: { width: 1334, height: 494 } });
  const page = await ctx.newPage();
  watch(page, 'tela-baixa');
  await page.goto(BASE + 'index.html');
  await page.waitForSelector('[data-screen="home"].active', { timeout: 20000 });
  await page.click('#btn-play');
  await page.waitForSelector('[data-screen="levels"].active');
  await page.click('.level-node.state-available');
  await page.waitForSelector('.sheet-preview .mds-sheet');
  await page.waitForTimeout(450);
  const sheet = await app(page, () => {
    const q = (s) => document.querySelector('.sheet-preview ' + s).getBoundingClientRect();
    const box = q('.mds-sheet');
    const head = q('.mds-heading');
    const body = q('.mds-sheet-body');
    const btn = q('.btn-primary');
    return { boxH: box.height, headAbove: head.bottom <= body.top + 1, btnVisible: btn.top >= 0 && btn.bottom <= innerHeight && btn.bottom <= box.bottom + 1, dir: getComputedStyle(document.querySelector('.mds-sheet')).flexDirection };
  });
  check(sheet.dir === 'column' && sheet.headAbove && sheet.boxH > 200, 'Tela baixa: janela da fase em coluna (título acima do conteúdo)', JSON.stringify(sheet));
  check(sheet.btnVisible, 'Tela baixa: botão "Jogar" visível sem rolar');
  await page.click('.sheet-preview .btn-primary');
  await page.waitForSelector('.sheet-tutorial .btn-primary');
  const tut = await app(page, () => {
    const b = document.querySelector('.sheet-tutorial .btn-primary').getBoundingClientRect();
    return b.top >= 0 && b.bottom <= innerHeight;
  });
  check(tut, 'Tela baixa: botão do tutorial visível sem rolar');
  await ctx.close();
}

// ================================================================== testes unitários no navegador
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  watch(page, 'unitários');
  await page.goto(BASE + 'tests/index.html');
  await page.waitForFunction(() => window.__testResult, null, { timeout: 60000 });
  const r = await page.evaluate(() => window.__testResult);
  check(r.fail === 0, 'Testes unitários no navegador', `${r.pass}/${r.total}`);
  await ctx.close();
}

await browser.close();
server.close();

check(errors.length === 0, 'Nenhum erro no console', errors.join('\n'));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram.`);
process.exit(failed.length ? 1 : 0);
