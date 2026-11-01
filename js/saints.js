/**
 * saints.js — cadastro dos santos (data/saints.json) e carregamento das imagens.
 */
import { assetUrl } from './utils.js';

export class SaintRegistry {
  constructor(list) {
    this.list = list
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((s) => ({ ...s, thumbUrl: assetUrl(s.thumb || s.image), imageUrl: assetUrl(s.image), broken: false }));
    this.byId = new Map(this.list.map((s) => [s.id, s]));
  }

  static async load(url = 'data/saints.json') {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Não foi possível carregar ${url} (${res.status})`);
    const json = await res.json();
    const list = Array.isArray(json) ? json : json.saints;
    if (!Array.isArray(list) || !list.length) throw new Error('saints.json não contém santos.');
    return new SaintRegistry(list);
  }

  get(id) {
    return this.byId.get(id) || null;
  }

  name(id) {
    return this.get(id)?.name || id;
  }

  /** Santos com imagem válida (utilizáveis no tabuleiro). */
  available() {
    return this.list.filter((s) => !s.broken);
  }

  ids() {
    return this.available().map((s) => s.id);
  }

  /**
   * Pré-carrega as miniaturas. Se a miniatura falhar, tenta o retrato original;
   * se ambos falharem, o santo é marcado como "broken" e sai dos tabuleiros.
   * @param {(done:number,total:number)=>void} onProgress
   * @returns {Promise<{ok:number, fallback:string[], broken:string[]}>}
   */
  async preload(onProgress = () => {}) {
    let done = 0;
    const fallback = [];
    const broken = [];
    const total = this.list.length;
    const loadImg = (src) =>
      new Promise((resolve) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(img.naturalWidth > 0);
        img.onerror = () => resolve(false);
        img.src = src;
      });
    await Promise.all(
      this.list.map(async (s) => {
        let ok = await loadImg(s.thumbUrl);
        if (!ok && s.thumbUrl !== s.imageUrl) {
          ok = await loadImg(s.imageUrl);
          if (ok) {
            fallback.push(s.id);
            s.thumbUrl = s.imageUrl;
          }
        }
        if (!ok) {
          s.broken = true;
          broken.push(s.id);
          console.warn(`[Match dos Santos] Imagem não encontrada para ${s.name}: ${s.image}`);
        }
        onProgress(++done, total);
      }),
    );
    return { ok: total - broken.length, fallback, broken };
  }

  /** Verifica se o retrato ORIGINAL existe (usado no diagnóstico). */
  async verifyOriginals() {
    const results = await Promise.all(
      this.list.map(
        (s) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ id: s.id, ok: true });
            img.onerror = () => resolve({ id: s.id, ok: false });
            img.src = s.imageUrl;
          }),
      ),
    );
    return results;
  }
}
