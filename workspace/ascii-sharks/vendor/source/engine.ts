import { AsciiRenderer } from "./renderer";
import { World, type SharkSpec } from "./world";

const STEP = 1 / 60;
const MAX_STEPS = 4;
const FRAME_INTERVAL = 1000 / 30;

/**
 * Upstream simulation adapted for a persistent page background: 30 fps,
 * bounded pixel density, explicit pause/resume, and document visibility.
 */
export class OceanEngine {
  private world: World;
  private renderer: AsciiRenderer;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private visible = true;
  private paused = false;
  private reducedMotion: MediaQueryList;
  private resizeObserver: ResizeObserver;
  private intersectionObserver: IntersectionObserver;
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement, sharks?: SharkSpec[], fishCount?: number) {
    this.world = new World(sharks, fishCount);
    this.renderer = new AsciiRenderer(canvas);
    this.renderer.setFontFamily(getComputedStyle(canvas).fontFamily);
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.intersectionObserver = new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.schedule();
    });
    this.intersectionObserver.observe(canvas);

    this.reducedMotion.addEventListener("change", this.onMotionPreference);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("pointermove", this.onPointerMove, { passive: true });
    window.addEventListener("pointerdown", this.onPointerDown, { passive: true });
    document.documentElement.addEventListener("pointerleave", this.onPointerLeave);
    window.addEventListener("blur", this.onPointerLeave);

    // Always paint an initial frame, including when pause() follows immediately.
    this.resize();
    document.fonts?.load(`600 16px ${getComputedStyle(canvas).fontFamily}`).then(() => {
      if (!this.disposed && (this.paused || this.reducedMotion.matches)) {
        this.renderer.render(this.world, 0);
      }
    });
    this.schedule();
  }

  /** Freeze the current ecosystem and discard elapsed time, keeping its image. */
  pause() {
    if (this.disposed || this.paused) return;
    this.paused = true;
    this.world.pointer.active = false;
    this.schedule();
  }

  /** Continue from the current ecosystem without catching up the paused time. */
  resume() {
    if (this.disposed || !this.paused) return;
    this.paused = false;
    this.schedule();
  }

  destroy() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    this.reducedMotion.removeEventListener("change", this.onMotionPreference);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerdown", this.onPointerDown);
    document.documentElement.removeEventListener("pointerleave", this.onPointerLeave);
    window.removeEventListener("blur", this.onPointerLeave);
  }

  private resize() {
    if (this.disposed) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.resize(rect.width, rect.height, dpr);
    this.world.resize(rect.width, rect.height, this.renderer.cellWidth, this.renderer.cellHeight);
    if (this.reducedMotion.matches && !this.paused) this.drawStill();
    else this.renderer.render(this.world, 0);
  }

  private canAnimate() {
    return !this.disposed && !this.paused && this.visible && !document.hidden && !this.reducedMotion.matches;
  }

  private schedule() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.acc = 0;
    this.last = performance.now();
    if (!this.canAnimate()) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = 0;
    if (!this.canAnimate()) return;
    const elapsed = now - this.last;
    // rAF remains responsive to pause/visibility while expensive work runs at 30 fps.
    if (elapsed + 0.001 >= FRAME_INTERVAL) {
      const dt = Math.min(0.1, elapsed / 1000);
      this.last = now;
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        this.world.step(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps === MAX_STEPS && this.acc >= STEP) this.acc = 0;
      this.renderer.render(this.world, dt);
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Reduced motion: let the ecosystem settle, then show a single frame. */
  private drawStill() {
    if (this.disposed || this.paused) return;
    for (let i = 0; i < 240 && this.world.time < 4 - STEP / 2; i++) {
      this.world.step(STEP);
    }
    this.renderer.render(this.world, STEP);
  }

  private onMotionPreference = () => {
    if (this.disposed) return;
    this.schedule();
    if (this.reducedMotion.matches && !this.paused) this.drawStill();
  };

  private onVisibilityChange = () => {
    if (document.hidden) this.world.pointer.active = false;
    this.schedule();
  };

  private toLocal(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
    return { x, y, inside };
  }

  private onPointerMove = (e: PointerEvent) => {
    if (!this.canAnimate()) return;
    const { x, y, inside } = this.toLocal(e);
    const p = this.world.pointer;
    p.x = x;
    p.y = y;
    p.active = inside && e.pointerType !== "touch";
  };

  private onPointerDown = (e: PointerEvent) => {
    if (!this.canAnimate()) return;
    const { x, y, inside } = this.toLocal(e);
    if (inside) this.world.splash(x, y);
  };

  private onPointerLeave = () => {
    this.world.pointer.active = false;
  };
}
