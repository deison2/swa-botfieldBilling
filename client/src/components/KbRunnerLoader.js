// KbRunnerLoader.js
import React, { useEffect, useRef } from "react";

const IMG_URL =
  "https://storageacctbmssprod001.blob.core.windows.net/container-bmssprod001-public/images/KeithBotfieldWebFavicon.svg";

/**
 * Tiny endless-runner loader for use inside the Edit Draft tray.
 * Mounts while data is loading; unmounts when loading finishes.
 *
 * Optional: you can pass a `percent` prop (0–100) to control the
 * LOADING % externally. If omitted, it just animates up to ~93%.
 */
export default function KbRunnerLoader({ percent = null }) {
  const canvasRef = useRef(null);
  const scoreRef = useRef(null);
  const pctRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    // Internal resolution; CSS will scale it to fit the tray column
    const W = (canvas.width = 960);
    const H = (canvas.height = 260);

    const state = {
      running: true,
      inRun: true,
      last: 0,
      score: 0,
      pct: 0,
      groundY: H * 0.78,
      bot: {
        x: W * 0.18,
        y: 0,
        w: 70,
        h: 70,
        vy: 0,
        gravity: 2300,
        jumpVy: -1150,
        onGround: true,
      },
      obstacles: [],
      spawnTimer: 0,
      spawnInterval: 1.35,
      baseSpeed: 420,
      keysJump: 0,
    };

    state.bot.y = state.groundY - state.bot.h;

    // Starfield
    const stars = Array.from({ length: 50 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      z: 0.3 + Math.random() * 0.7,
    }));

    // Sprite canvas
    const sprite = document.createElement("canvas");
    const sctx = sprite.getContext("2d", { willReadFrequently: true });

    let rafId;
    let keyDownHandler;
    let keyUpHandler;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = IMG_URL;
    img.onload = () => {
      makeSprite(img);
      state.last = performance.now();
      rafId = requestAnimationFrame(loop);
    };
    img.onerror = () => {
      sprite.width = sprite.height = 24;
      sctx.fillStyle = "#74f2ce";
      sctx.fillRect(2, 2, 20, 20);
      sctx.clearRect(7, 7, 10, 10);
      state.last = performance.now();
      rafId = requestAnimationFrame(loop);
    };

    function makeSprite(image) {
      const base = 32;
      sprite.width = sprite.height = base;
      sctx.imageSmoothingEnabled = false;
      sctx.clearRect(0, 0, base, base);
      const side = Math.min(image.width || base, image.height || base);
      const sx = ((image.width || base) - side) / 2;
      const sy = ((image.height || base) - side) / 2;
      try {
        sctx.drawImage(image, sx, sy, side, side, 0, 0, base, base);
      } catch (e) {
        sctx.drawImage(image, 0, 0, base, base);
      }
    }

    keyDownHandler = (e) => {
      const k = e.key.toLowerCase();
      if (k === " " || k === "arrowup" || k === "w") {
        e.preventDefault();
        state.keysJump = 1;
        if (!state.inRun) restart();
      }
    };

    keyUpHandler = (e) => {
      const k = e.key.toLowerCase();
      if (k === " " || k === "arrowup" || k === "w") {
        state.keysJump = 0;
      }
    };

    window.addEventListener("keydown", keyDownHandler);
    window.addEventListener("keyup", keyUpHandler);

    function loop(t) {
      if (!state.running) return;
      const dt = Math.min(0.033, (t - state.last) / 1000 || 0.016);
      state.last = t;

      update(dt);
      draw(dt);

      rafId = requestAnimationFrame(loop);
    }

    function update(dt) {
      // Loading percentage: use external prop if given, else cosmetic.
      if (typeof percent === "number") {
        state.pct = Math.max(0, Math.min(100, percent));
      } else {
        if (state.pct < 93) {
          const speed = state.pct < 75 ? 18 : 8;
          state.pct = Math.min(93, state.pct + speed * dt);
        }
      }

      if (state.inRun) {
        updateBot(dt);
        updateObstacles(dt);
        updateStars(dt);
        checkCollisions();
      } else {
        updateStars(dt * 0.4);
      }

      if (scoreRef.current) {
        scoreRef.current.textContent = `SCORE: ${String(
          state.score
        ).padStart(3, "0")}`;
      }
      if (pctRef.current) {
        pctRef.current.textContent = `LOADING: ${Math.floor(state.pct)}%`;
      }
    }

    function updateStars(dt) {
      for (const s of stars) {
        s.x -= s.z * 40 * (dt || 0.016);
        if (s.x < 0) {
          s.x = W;
          s.y = Math.random() * H;
        }
      }
    }

    function updateBot(dt) {
      const bot = state.bot;

      if (state.keysJump && bot.onGround) {
        bot.vy = bot.jumpVy;
        bot.onGround = false;
      }

      bot.vy += bot.gravity * dt;
      bot.y += bot.vy * dt;

      if (bot.y + bot.h >= state.groundY) {
        bot.y = state.groundY - bot.h;
        bot.vy = 0;
        bot.onGround = true;
      }
    }

    function updateObstacles(dt) {
      const speed = state.baseSpeed + Math.min(260, state.score * 5);

      state.spawnTimer += dt;
      if (state.spawnTimer >= state.spawnInterval) {
        state.spawnTimer = 0;
        const h = 55 + Math.random() * 35;
        const w = 36 + Math.random() * 18;
        const y = state.groundY - h;
        state.obstacles.push({
          x: W + 20,
          y,
          w,
          h,
          scored: false,
        });
      }

      for (const o of state.obstacles) {
        o.x -= speed * dt;
      }

      state.obstacles = state.obstacles.filter((o) => o.x + o.w > -30);

      for (const o of state.obstacles) {
        if (!o.scored && o.x + o.w < state.bot.x) {
          o.scored = true;
          state.score++;
        }
      }
    }

    function rectsOverlap(x1, y1, w1, h1, x2, y2, w2, h2) {
      return (
        x1 < x2 + w2 &&
        x1 + w1 > x2 &&
        y1 < y2 + h2 &&
        y1 + h1 > y2
      );
    }

    function checkCollisions() {
      const b = state.bot;
      for (const o of state.obstacles) {
        if (
          rectsOverlap(b.x, b.y, b.w, b.h, o.x, o.y, o.w, o.h)
        ) {
          state.inRun = false;
          return;
        }
      }
    }

    function restart() {
      state.inRun = true;
      state.score = 0;
      state.obstacles = [];
      state.spawnTimer = 0;
      state.bot.y = state.groundY - state.bot.h;
      state.bot.vy = 0;
      state.bot.onGround = true;
    }

    function draw(dt) {
      // Background
      ctx.fillStyle = "#061017";
      ctx.fillRect(0, 0, W, H);

      // Starfield
      for (const s of stars) {
        const size = (1 + s.z * 1) | 0;
        ctx.fillStyle = `rgba(158,234,214,${0.15 + s.z * 0.55})`;
        ctx.fillRect(s.x | 0, s.y | 0, size, size);
      }

      // Ground
      ctx.fillStyle = "#071015";
      ctx.fillRect(0, state.groundY, W, H - state.groundY);
      ctx.fillStyle = "#36c2a6";
      ctx.fillRect(0, state.groundY, W, 2);

      // Obstacles
      for (const o of state.obstacles) {
        ctx.fillStyle = "#264b46";
        ctx.fillRect(o.x, o.y, o.w, o.h);

        ctx.fillStyle = "#3fe6c2";
        ctx.fillRect(o.x + 3, o.y + 3, o.w - 6, 5);

        ctx.fillStyle = "#17322f";
        ctx.fillRect(
          o.x + o.w * 0.2,
          o.y + o.h - 8,
          o.w * 0.6,
          4
        );
      }

      // KB bot
      const b = state.bot;
      const bob = Math.sin(performance.now() / 220) * 3;

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        sprite,
        0,
        0,
        sprite.width,
        sprite.height,
        b.x,
        b.y + bob,
        b.w,
        b.h
      );
    }

    return () => {
      state.running = false;
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("keydown", keyDownHandler);
      window.removeEventListener("keyup", keyUpHandler);
    };
  }, [percent]);

  return (
    <div className="kb-runner-inline">
      <div className="kb-runner-inline__hud">
        <span ref={scoreRef} className="kb-pill">
          SCORE: 000
        </span>
        <span ref={pctRef} className="kb-pill">
          LOADING: 0%
        </span>
      </div>
      <div className="kb-runner-inline__frame">
        <canvas ref={canvasRef} />
      </div>
      <div className="kb-runner-inline__hint">
        Space / ↑ to jump while we fetch the draft…
      </div>
    </div>
  );
}