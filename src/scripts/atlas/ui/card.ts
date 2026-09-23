// The pass deck: when the journey lands somewhere new, the old pass swings away on its hinge and
// the new one swings in (the direction follows the scroll), then the stop's ink stamp presses
// down with a bleed, the city name rises by character, the coordinates decode and the note
// arrives line by line. The active pass tilts toward the pointer with a sheen, and during a
// flight its boarding-pass stub fills with the leg's progress.
import { gsap } from "../../motion/smooth";
import { split } from "../../motion/split";
import { scramble } from "../../motion/scramble";
import { stagger } from "../motion";

type Prepared = { chars: HTMLElement[]; words: HTMLElement[] };

export class CardDeck {
  private cards: HTMLElement[];
  private current = -1;
  private prepared = new Map<number, Prepared>();
  private ink: SVGFEDisplacementMapElement | null;
  private flying = -1;
  private tl?: gsap.core.Timeline;

  /** `glPhotos`: the WebGL dissolve (desktop tiers); otherwise a composited CSS iris reveal. */
  constructor(root: HTMLElement, private reduced: boolean, private fine: boolean, private glPhotos = fine) {
    this.cards = [...root.querySelectorAll<HTMLElement>("[data-card]")];
    this.ink = root.querySelector<SVGFEDisplacementMapElement>("[data-ink]");
    this.current = this.cards.findIndex((c) => c.classList.contains("is-current"));
    if (fine && !reduced) this.bindTilt();
    if (!reduced) this.prepareWhenIdle();
  }

  /** Warm the photo reveal's WebGL surface in idle time, if any pass has a photo. */
  warmPhotos() {
    if (this.reduced || !this.glPhotos || !this.cards.some((c) => c.querySelector("[data-photo]"))) return;
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
      ?? ((cb: () => void) => window.setTimeout(cb, 200));
    idle(() => void import("../gl/photo-reveal").then((m) => m.warmPhotoReveal()), { timeout: 4000 });
  }

  /** Split every pass's text ahead of time, one per idle slot, so a flip never pays for it. */
  private prepareWhenIdle() {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
      ?? ((cb: () => void) => window.setTimeout(cb, 60));
    let k = 0;
    const next = () => {
      if (k >= this.cards.length) return this.warmPhotos();
      this.prepare(k++);
      idle(next, { timeout: 1500 });
    };
    idle(next, { timeout: 1500 });
  }

  private prepare(i: number): Prepared {
    let p = this.prepared.get(i);
    if (p) return p;
    const c = this.cards[i];
    const chars = [...split(c.querySelector<HTMLElement>("[data-name]")!, "chars")];
    const words = [...split(c.querySelector<HTMLElement>("[data-note]")!, "words")];
    p = { chars, words };
    this.prepared.set(i, p);
    return p;
  }

  /** Show stop i. `quiet` skips the animation (intermediate stops of a rail jump). */
  show(i: number, dir: number, quiet = false) {
    if (i === this.current) return;
    const prev = this.current;
    this.current = i;
    const card = this.cards[i], old = this.cards[prev];
    this.cards.forEach((c, k) => c.classList.toggle("is-current", k === i));
    if (!card) return;
    if (this.reduced || quiet) {
      if (old) gsap.set(old, { clearProps: "all" });
      gsap.set(card, { clearProps: "all" });
      const p = this.reduced ? null : this.prepare(i);
      if (p) gsap.set([...p.chars, ...p.words], { clearProps: "all" });
      return;
    }
    this.tl?.progress(1).kill();
    const fwd = dir >= 0;
    const tl = (this.tl = gsap.timeline());
    if (old) {
      tl.fromTo(old, { rotationY: 0, autoAlpha: 1 }, {
        rotationY: fwd ? -86 : 86, transformOrigin: fwd ? "0% 50%" : "100% 50%", autoAlpha: 0,
        duration: 0.42, ease: "power2.in", clearProps: "transform,transformOrigin",
        onComplete: () => gsap.set(old, { clearProps: "all" }),
      }, 0);
    }
    const p = this.prepare(i);
    const stamp = card.querySelector<SVGElement>("[data-stamp]");
    const coord = card.querySelector<HTMLElement>("[data-coord]");
    // group the note's words into their rendered lines, so each line arrives together
    const tops = p.words.map((w) => (w.parentElement as HTMLElement).offsetTop);
    const lineOf = (k: number) => [...new Set(tops)].indexOf(tops[k]);
    tl.fromTo(card, { rotationY: fwd ? 86 : -86, transformOrigin: fwd ? "100% 50%" : "0% 50%", autoAlpha: 0 }, {
      rotationY: 0, autoAlpha: 1, duration: 0.8, ease: "atlas.out", clearProps: "transform,transformOrigin,opacity,visibility",
    }, old ? 0.16 : 0);
    tl.fromTo(p.chars, { yPercent: 105 }, { yPercent: 0, duration: 0.75, ease: "atlas.out", stagger: stagger.char }, 0.42);
    if (coord) tl.call(() => scramble(coord, 600), undefined, 0.5);
    tl.fromTo(p.words, { opacity: 0, y: 10 }, {
      opacity: 1, y: 0, duration: 0.7, ease: "atlas.out", delay: (k: number) => lineOf(k) * stagger.line,
    }, 0.58);
    if (stamp) {
      tl.fromTo(stamp, { scale: 1.5, opacity: 0, rotation: -22, transformOrigin: "50% 50%" }, {
        scale: 1, opacity: 1, rotation: 0, duration: 0.5, ease: "back.out(1.8)", clearProps: "transform",
      }, 0.72);
      if (this.ink) tl.fromTo(this.ink, { attr: { scale: 18 } }, { attr: { scale: 2.5 }, duration: 0.9, ease: "power2.out" }, 0.72);
    }
    const photo = card.querySelector<HTMLElement>("[data-photo]");
    if (photo && !photo.dataset.revealed) {
      photo.querySelector("img")!.style.opacity = "0"; // it arrives through the dissolve, not before it
      tl.call(() => void this.revealPhoto(photo), undefined, 0.5);
    }
  }

  /** The boarding-pass stub fills while the leg after stop i is flown (null: landed). */
  flight(i: number, progress: number | null) {
    if (this.flying !== i && this.flying >= 0) this.cards[this.flying]?.classList.remove("is-flying");
    this.flying = progress === null ? -1 : i;
    const c = this.cards[i];
    if (!c) return;
    c.classList.toggle("is-flying", progress !== null);
    if (progress !== null) c.style.setProperty("--flight", progress.toFixed(4));
  }

  private async revealPhoto(fig: HTMLElement) {
    if (fig.dataset.revealed) return;
    fig.dataset.revealed = "1";
    const img = fig.querySelector("img")!;
    img.loading = "eager";
    try {
      await img.decode();
      if (this.glPhotos) {
        const { revealPhoto } = await import("../gl/photo-reveal");
        await revealPhoto(fig, img);
      } else {
        // compositor-only (opacity + transform): no per-frame repaint of a large image on a phone
        img.style.opacity = "";
        gsap.fromTo(img, { opacity: 0, scale: 1.14, yPercent: 4 }, { opacity: 1, scale: 1, yPercent: 0, duration: 1.1, ease: "atlas.out", clearProps: "all" });
      }
    } catch {
      img.style.opacity = "";
    }
  }

  private bindTilt() {
    this.cards.forEach((card) => {
      const face = card.querySelector<HTMLElement>("[data-face]")!;
      gsap.set(face, { transformPerspective: 900 });
      const rx = gsap.quickTo(face, "rotationX", { duration: 0.6, ease: "power3" });
      const ry = gsap.quickTo(face, "rotationY", { duration: 0.6, ease: "power3" });
      face.addEventListener("pointermove", (e) => {
        if (!card.classList.contains("is-current")) return;
        const r = face.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        rx(-(y - 0.5) * 6);
        ry((x - 0.5) * 8);
        face.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
        face.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
      });
      face.addEventListener("pointerleave", () => { rx(0); ry(0); });
    });
  }
}
