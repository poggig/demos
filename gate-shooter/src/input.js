// Input: touch = RELATIVE drag (finger anywhere, the crowd follows the movement, the finger never
// covers it); mouse = the crowd follows the cursor X; keyboard = ←/→ and A/D. P / Esc = pause.
import { CONFIG } from './config.js';

const I = CONFIG.input;
const MIN_X = CONFIG.road.left + CONFIG.crowd.edgePad;
const MAX_X = CONFIG.road.right - CONFIG.crowd.edgePad;

export class Input {
  /**
   * frame: the element the game is drawn in (for mouse → logical coords).
   * getScale(): CSS px per logical px. onPause(): pause toggle.
   */
  constructor(frame, getScale, onPause) {
    this.frame = frame;
    this.getScale = getScale;
    this.onPause = onPause;
    this.active = false;        // only steer while playing
    this.world = null;
    this.dragId = null;
    this.dragX0 = 0;
    this.target0 = 0;
    this.left = false; this.right = false;
    this.lastMouseX = null;

    const opts = { passive: false };
    window.addEventListener('pointerdown', e => this.down(e), opts);
    window.addEventListener('pointermove', e => this.move(e), opts);
    window.addEventListener('pointerup', e => this.up(e), opts);
    window.addEventListener('pointercancel', e => this.up(e), opts);
    window.addEventListener('keydown', e => this.key(e, true));
    window.addEventListener('keyup', e => this.key(e, false));
    window.addEventListener('blur', () => { this.left = this.right = false; this.dragId = null; });
    // no context menu, no pinch / double-tap zoom, no pull-to-refresh, no scrolling
    window.addEventListener('contextmenu', e => e.preventDefault());
    for (const ev of ['touchstart', 'touchmove']) {
      window.addEventListener(ev, e => { if (e.cancelable && !(e.target.closest && e.target.closest('button'))) e.preventDefault(); }, opts);
    }
    window.addEventListener('gesturestart', e => e.preventDefault());
    window.addEventListener('dblclick', e => e.preventDefault());
  }

  attach(world) { this.world = world; this.dragId = null; this.lastMouseX = null; }
  setActive(on) { this.active = on; if (!on) { this.dragId = null; this.left = this.right = false; } }

  logicalX(clientX) {
    const r = this.frame.getBoundingClientRect();
    return (clientX - r.left) / this.getScale();
  }

  /** Mouse over the HUD band or a button (e.g. reaching for pause): don't steer the crowd. */
  mouseOffRoad(e) {
    if (e.target.closest && e.target.closest('button')) return true;
    const r = this.frame.getBoundingClientRect();
    return (e.clientY - r.top) / this.getScale() < I.mouseHudBand;
  }

  down(e) {
    if (!this.active || !this.world) return;
    if (e.target.closest && e.target.closest('button')) return;
    if (e.pointerType === 'mouse') { if (!this.mouseOffRoad(e)) this.world.setTargetX(this.logicalX(e.clientX)); return; }
    this.dragId = e.pointerId;
    this.dragX0 = e.clientX;
    this.target0 = this.world.targetX;
    if (e.cancelable) e.preventDefault();
  }

  move(e) {
    if (!this.active || !this.world) return;
    if (e.pointerType === 'mouse') {
      if (this.lastMouseX !== null && Math.abs(e.clientX - this.lastMouseX) < 0.5) return;
      if (this.mouseOffRoad(e)) return;
      this.lastMouseX = e.clientX;
      this.world.setTargetX(this.logicalX(e.clientX));
      return;
    }
    if (e.pointerId !== this.dragId) return;
    let t = this.target0 + ((e.clientX - this.dragX0) / this.getScale()) * I.touchSensitivity;
    // re-anchor at the road edges so reversing direction responds at once
    if (t < MIN_X || t > MAX_X) {
      t = t < MIN_X ? MIN_X : MAX_X;
      this.dragX0 = e.clientX; this.target0 = t;
    }
    this.world.setTargetX(t);
    if (e.cancelable) e.preventDefault();
  }

  up(e) { if (e.pointerId === this.dragId) this.dragId = null; }

  key(e, down) {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') { this.left = down; if (this.active) e.preventDefault(); }
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') { this.right = down; if (this.active) e.preventDefault(); }
    else if (down && !e.repeat && (k === 'p' || k === 'P' || k === 'Escape')) { this.onPause(); e.preventDefault(); }
    else if (k === ' ' && this.active) e.preventDefault();
  }

  /** Per-frame: keyboard steering. */
  update(dt) {
    if (!this.active || !this.world) return;
    const dir = (this.right ? 1 : 0) - (this.left ? 1 : 0);
    if (dir) {
      const w = this.world;
      let t = w.targetX + dir * I.keySpeed * dt;
      t = t < MIN_X ? MIN_X : t > MAX_X ? MAX_X : t;
      w.setTargetX(t);
    }
  }
}
