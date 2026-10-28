// Lista virtualizada com altura de linha fixa, para milhares de famílias sem travar.

export class VirtualList {
  constructor(scroller, { rowHeight, render, overscan = 4 }) {
    this.scroller = scroller;
    this.rowHeight = rowHeight;
    this.render = render;
    this.overscan = overscan;
    this.items = [];
    this.rows = new Map();
    this.inner = document.createElement('div');
    this.inner.className = 'vlist-inner';
    scroller.append(this.inner);
    this._raf = null;
    this.onScroll = () => {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = null; this.paint(); });
    };
    scroller.addEventListener('scroll', this.onScroll, { passive: true });
    this.ro = new ResizeObserver(() => this.paint());
    this.ro.observe(scroller);
  }

  setItems(items, { keepScroll = true } = {}) {
    this.items = items;
    this.clear();
    if (!keepScroll) this.scroller.scrollTop = 0;
    this.paint();
  }

  setRowHeight(h) {
    if (h === this.rowHeight) return;
    const ratio = this.scroller.scrollTop / Math.max(1, this.rowHeight);
    this.rowHeight = h;
    this.clear();
    this.scroller.scrollTop = ratio * h;
    this.paint();
  }

  clear() {
    for (const el of this.rows.values()) el.remove();
    this.rows.clear();
  }

  refresh() { this.clear(); this.paint(); }

  paint() {
    const { rowHeight: rh } = this;
    this.inner.style.height = this.items.length * rh + 'px';
    const top = this.scroller.scrollTop;
    const viewH = this.scroller.clientHeight || 800;
    const start = Math.max(0, Math.floor(top / rh) - this.overscan);
    const end = Math.min(this.items.length, Math.ceil((top + viewH) / rh) + this.overscan);
    for (const [i, el] of this.rows) {
      if (i < start || i >= end) { el.remove(); this.rows.delete(i); }
    }
    for (let i = start; i < end; i++) {
      if (this.rows.has(i)) continue;
      const el = this.render(this.items[i], i);
      el.style.position = 'absolute';
      el.style.top = i * rh + 'px';
      el.style.height = rh + 'px';
      el.style.left = '0';
      el.style.right = '0';
      this.inner.append(el);
      this.rows.set(i, el);
    }
  }

  destroy() {
    this.scroller.removeEventListener('scroll', this.onScroll);
    this.ro.disconnect();
    this.inner.remove();
  }
}
