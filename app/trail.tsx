"use client";

import { useEffect, useRef } from "react";

/**
 * The mechanism, drawn: trades stream in from the left and pass through the
 * scout's sniff ring. Most go straight through (real traders). A few bounce
 * back and forth through the ring (wallets buying and selling to themselves),
 * and the ring flags them in red. One ambient motion, off under reduced motion.
 */
export function TrailCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, raf = 0, last = performance.now();
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    type Dot = { x: number; y: number; v: number; wash: boolean; dir: 1 | -1; flips: number; r: number; flagged: number };
    let dots: Dot[] = [];
    let pulse = 0;

    const resize = () => {
      const b = canvas.getBoundingClientRect();
      w = b.width; h = b.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const spawn = (x = -10): Dot => ({
      x, y: h * (0.2 + Math.random() * 0.6), v: 40 + Math.random() * 60, wash: Math.random() < 0.18,
      dir: 1, flips: 0, r: 1.6 + Math.random() * 1.8, flagged: 0,
    });
    resize();
    dots = Array.from({ length: Math.round(w / 18) }, () => spawn(Math.random() * w));
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const cx = w * 0.62, cy = h / 2, R = Math.min(h * 0.36, 70);
      ctx.clearRect(0, 0, w, h);

      // the sniff ring
      pulse = Math.max(0, pulse - dt * 1.5);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `rgba(168,184,237,${0.35 + pulse * 0.5})`;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = `rgba(97,134,213,${0.18 + pulse * 0.3})`;
      ctx.beginPath(); ctx.arc(cx, cy, R + 10 + pulse * 8, 0, Math.PI * 2); ctx.stroke();

      for (const d of dots) {
        if (!still) d.x += d.v * d.dir * dt;
        const inside = Math.hypot(d.x - cx, d.y - cy) < R;
        // wash wallets turn around after passing the ring and come back through it
        if (d.wash && d.flips < 4 && ((d.dir === 1 && d.x > cx + R * 1.6) || (d.dir === -1 && d.x < cx - R * 1.6))) {
          d.dir = d.dir === 1 ? -1 : 1; d.flips++;
          if (d.flips >= 2 && !d.flagged) { d.flagged = 1; pulse = 1; }
        }
        const bad = d.flagged > 0;
        ctx.fillStyle = bad ? "rgba(255,122,107,0.95)" : inside ? "rgba(255,255,255,0.95)" : "rgba(200,220,247,0.7)";
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r + (bad ? 0.8 : 0), 0, Math.PI * 2); ctx.fill();
        if (d.x > w + 20 || (d.wash && d.flips >= 4 && d.x < -20)) Object.assign(d, spawn());
      }
      if (!still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return <canvas ref={ref} className="trail" />;
}
