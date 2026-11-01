/**
 * utils.js — funções utilitárias genéricas (sem dependência de DOM, exceto `el`).
 */

export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Gerador pseudoaleatório determinístico (mulberry32) — usado em testes e fases. */
export function createRng(seed = Date.now()) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash simples e estável de string → inteiro (para semear RNG). */
export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Embaralhamento Fisher–Yates; devolve um NOVO array. */
export function shuffle(list, rng = Math.random) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pick(list, rng = Math.random) {
  return list[Math.floor(rng() * list.length)];
}

/** Converte um caminho relativo com espaços/acentos em URL segura. */
export function assetUrl(path) {
  if (!path) return '';
  return path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatNumber(n) {
  return Math.round(n || 0).toLocaleString('pt-BR');
}

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Mescla profundamente `source` sobre uma cópia de `base` (arrays são substituídos). */
export function deepMerge(base, source) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!isPlainObject(source)) return out;
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(out[key])) out[key] = deepMerge(out[key], value);
    else out[key] = value;
  }
  return out;
}

/**
 * Pequeno criador de elementos DOM.
 * el('div', { class: 'x', onclick: fn, dataset: { id: 1 } }, 'texto', outroEl)
 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) {
        if (prop.startsWith('--')) node.style.setProperty(prop, v);
        else node.style[prop] = v;
      }
    }
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Retorna true se o usuário (ou o sistema) pede movimento reduzido. */
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
