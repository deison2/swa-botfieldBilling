// LoaderMini.js
import React from "react";

const css = `
  /* Wrapper just lays out the two loaders side by side */
  .loader-mini {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 32px;
  }

  /* shared constants, scoped to loader-mini */
  .loader-mini .push-pop,
  .loader-mini .push-out {
    /* configurable via CSS vars on the wrapper */
    --duration: var(--loader-duration, 0.85s);
    height: var(--loader-size, 100px);
    width:  var(--loader-size, 100px);
    position: relative;
    overflow: hidden;
  }

  /* first moving block */
  .loader-mini .push-pop > div:nth-of-type(1),
  .loader-mini .push-out > div:nth-of-type(1) {
    height: 20px;
    width: 20px;
    position: absolute;
    animation: push-pop-slide var(--duration) infinite alternate ease-in-out;
    transform: translate(0, -100%);
    top: 100%;
    left: 0;
  }

  .loader-mini .push-pop > div:nth-of-type(1)::after,
  .loader-mini .push-out > div:nth-of-type(1)::after {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--loader-primary, #ffffff);
    animation: push-pop-flip var(--duration) infinite alternate ease-in-out;
  }

  /* centre pillar */
  .loader-mini .push-pop > div:nth-of-type(2),
  .loader-mini .push-out > div:nth-of-type(2) {
    background: var(--loader-primary, #ffffff);
    height: 30px;
    width: 20px;
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translate(-50%, -100%);
  }

  /* side pillars */
  .loader-mini .push-pop::before,
  .loader-mini .push-pop::after,
  .loader-mini .push-out::before,
  .loader-mini .push-out::after {
    content: '';
    position: absolute;
    bottom: 0;
    width: 20px;
    height: 40px;
    background: var(--loader-primary, #ffffff);
  }

  /* push-pop pillar animations */
  .loader-mini .push-pop::before {
    left: 0;
    animation: push-pop-pushed var(--duration) alternate-reverse infinite ease;
  }
  .loader-mini .push-pop::after {
    right: 0;
    animation: push-pop-pushed var(--duration) alternate infinite ease;
  }

  /* push-out pillar animations */
  .loader-mini .push-out::before {
    left: 0;
    animation: push-out-pushed-2 calc(var(--duration) * 4) infinite ease;
  }
  .loader-mini .push-out::after {
    right: 0;
    animation: push-out-pushed-1 calc(var(--duration) * 4) infinite ease;
  }

  /* keyframes (global names are fine) */
  @keyframes push-pop-slide {
    to { transform: translate(0, -100%) translate(80px, 0); }
  }

  @keyframes push-pop-flip {
    0%   { transform: translate(0, 0) rotate(0); }
    50%  { transform: translate(0, -80px) rotate(90deg); }
    100% { transform: translate(0, 0) rotate(180deg); }
  }

  @keyframes push-pop-pushed {
    0%, 72.5% { transform: translate(0, 0); }
    100%      { transform: translate(0, 100%); }
  }

  @keyframes push-out-slide {
    to { transform: translate(0, -100%) translate(80px, 0); }
  }

  @keyframes push-out-pushed-1 {
    0%,18.125%,50%,68.125%,100%       { transform: translate(0, 0); }
    25%,43.125%,75%,93.125%          { transform: translate(0, 100%); }
  }

  @keyframes push-out-pushed-2 {
    0%,18.125%,50%,68.125%,100%       { transform: translate(0, 100%); }
    25%,43.125%,75%,93.125%          { transform: translate(0, 0); }
  }
`;

/**
 * Mini loader for use *inside* a tray or card
 * (no background / overlay).
 *
 * Props:
 *  - primary: block color (default white)
 *  - size: size of each loader box in px (default 100)
 *  - duration: base animation duration in seconds (default 0.85)
 */
export default function LoaderMini({
  primary = "#FFFFFF",
  size = 100,
  duration = 0.85,
}) {
  return (
    <div
      className="loader-mini"
      // feed values into CSS custom properties so you can tweak easily
      style={{
        "--loader-primary": primary,
        "--loader-size": `${size}px`,
        "--loader-duration": `${duration}s`,
      }}
    >
      <style>{css}</style>

      <div className="push-pop">
        <div></div>
        <div></div>
      </div>

      <div className="push-out">
        <div></div>
        <div></div>
      </div>
    </div>
  );
}