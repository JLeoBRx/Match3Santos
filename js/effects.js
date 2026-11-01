/**
 * effects.js — partículas (canvas), confete de celebração e textos flutuantes.
 * Tudo é desativado/suavizado quando "animações reduzidas" está ligado.
 */
import { el } from './utils.js';

const MAX_PARTICLES = 420;
const GOLD = ['#ffd66b', '#ffb938', '#fff1c1'];
const CONFETTI = ['#ffd66b', '#b48cff', '#ff8a5b', '#ffffff', '#7fd4ff', '#ff7eb6'];

export class Effects {
  constructor(canvas, isReduced = () => false) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.isReduced = isReduced;
    this.particles = [];
    this.running = false;
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = Math.round(window.innerWidth * dpr);
    this.canvas.height = Math.round(window.innerHeight * dpr);
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
  }

  add(p) {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push(p);
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      requestAnimationFrame((t) => this.tick(t));
    }
  }

  /** Explosão de partículas em coordenadas da janela. */
  burst(x, y, color = '#ffd66b', count = 9, spread = 1) {
    if (this.isReduced()) return;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (60 + Math.random() * 180) * spread;
      this.add({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 40,
        g: 260,
        life: 0,
        max: 0.45 + Math.random() * 0.35,
        size: 2 + Math.random() * 3.5,
        color: Math.random() < 0.55 ? color : GOLD[i % GOLD.length],
        shape: Math.random() < 0.35 ? 'spark' : 'circle',
        rot: 0,
        vr: 0,
      });
    }
  }

  /** Chuva de confete (vitória). */
  confetti(duration = 2200) {
    if (this.isReduced()) return;
    const w = window.innerWidth;
    const total = Math.min(120, Math.round(w / 7));
    for (let i = 0; i < total; i++) {
      const delay = Math.random() * duration * 0.5;
      setTimeout(() => {
        this.add({
          x: Math.random() * w,
          y: -20,
          vx: (Math.random() - 0.5) * 80,
          vy: 120 + Math.random() * 160,
          g: 40,
          life: 0,
          max: 2.4 + Math.random() * 1.2,
          size: 5 + Math.random() * 6,
          color: CONFETTI[i % CONFETTI.length],
          shape: Math.random() < 0.3 ? 'spark' : 'rect',
          rot: Math.random() * 6,
          vr: (Math.random() - 0.5) * 10,
          wobble: Math.random() * 6,
        });
      }, delay);
    }
  }

  tick(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const h = window.innerHeight;
    this.particles = this.particles.filter((p) => {
      p.life += dt;
      if (p.life >= p.max || p.y > h + 40) return false;
      p.vy += p.g * dt;
      p.x += p.vx * dt + (p.wobble ? Math.sin(p.life * p.wobble) * 0.6 : 0);
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      const alpha = Math.max(0, 1 - p.life / p.max);
      ctx.globalAlpha = p.shape === 'rect' ? Math.min(1, alpha * 2) : alpha;
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else if (p.shape === 'spark') {
        drawSpark(ctx, p.x, p.y, p.size * 1.6, p.rot);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      return true;
    });
    ctx.globalAlpha = 1;
    if (this.particles.length) requestAnimationFrame((t) => this.tick(t));
    else {
      this.running = false;
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  clear() {
    this.particles = [];
  }

  /**
   * Texto flutuante dentro de um contêiner (ex.: pontos sobre o tabuleiro).
   * x, y em porcentagem do contêiner.
   */
  floatText(container, xPct, yPct, text, className = '') {
    const node = el('div', { class: `float-text ${className}`, style: { left: xPct + '%', top: yPct + '%' } }, text);
    container.append(node);
    const remove = () => node.remove();
    node.addEventListener('animationend', remove, { once: true });
    setTimeout(remove, 1800);
    return node;
  }
}

function drawSpark(ctx, x, y, r, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(Math.cos(a + Math.PI / 4) * r * 0.28, Math.sin(a + Math.PI / 4) * r * 0.28);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
