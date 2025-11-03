import React from 'react';

/* All styles live inside this component */
const css = `
  /* full-screen opaque gradient overlay */
  .global-loader-overlay{
    position:fixed;inset:0;z-index:9999;
    width:100vw;height:100vh;
    background:linear-gradient(135deg,#063941 0%,#547872 100%);
    display:flex;align-items:center;justify-content:center;
    opacity: 0.92; /* <-- makes the whole overlay slightly see-through */
  }

  /* shared constants */
  :root{--primary:#FFFFFF;}   /* white loader blocks */
  .push-pop,.push-out{
    --duration:.85;
    height:100px;width:100px;
    position:relative;overflow:hidden;
    margin:0 32px;
  }

  /* first moving block */
  .push-pop>div:nth-of-type(1),
  .push-out>div:nth-of-type(1){
    height:20px;width:20px;position:absolute;
    animation:push-pop-slide calc(var(--duration)*1s) infinite alternate ease-in-out;
    transform:translate(0,-100%);top:100%;left:0;
  }
  .push-pop>div:nth-of-type(1)::after,
  .push-out>div:nth-of-type(1)::after{
    content:'';position:absolute;inset:0;
    background:var(--primary);
    animation:push-pop-flip calc(var(--duration)*1s) infinite alternate ease-in-out;
  }

  /* centre pillar */
  .push-pop>div:nth-of-type(2),
  .push-out>div:nth-of-type(2){
    background:var(--primary);
    height:30px;width:20px;
    position:absolute;top:100%;left:50%;
    transform:translate(-50%,-100%);
  }

  /* side pillars */
  .push-pop::before,.push-pop::after,
  .push-out::before,.push-out::after{
    content:'';position:absolute;bottom:0;
    width:20px;height:40px;background:var(--primary);
  }

  /* push-pop pillar animations */
  .push-pop::before{left:0;animation:push-pop-pushed calc(var(--duration)*1s) alternate-reverse infinite ease;}
  .push-pop::after {right:0;animation:push-pop-pushed calc(var(--duration)*1s) alternate        infinite ease;}

  /* push-out pillar animations */
  .push-out::before{left:0; animation:push-out-pushed-2 calc(var(--duration)*4s) infinite ease;}
  .push-out::after {right:0;animation:push-out-pushed-1 calc(var(--duration)*4s) infinite ease;}

  /* keyframes */
  @keyframes push-pop-slide{to{transform:translate(0,-100%) translate(80px,0);}}
  @keyframes push-pop-flip{0%{transform:translate(0,0) rotate(0);}50%{transform:translate(0,-80px) rotate(90deg);}100%{transform:translate(0,0) rotate(180deg);}}
  @keyframes push-pop-pushed{0%,72.5%{transform:translate(0,0);}100%{transform:translate(0,100%);}}

  @keyframes push-out-slide{to{transform:translate(0,-100%) translate(80px,0);}}
  @keyframes push-out-pushed-1{0%,18.125%,50%,68.125%,100%{transform:translate(0,0);}25%,43.125%,75%,93.125%{transform:translate(0,100%);}}
  @keyframes push-out-pushed-2{0%,18.125%,50%,68.125%,100%{transform:translate(0,100%);}25%,43.125%,75%,93.125%{transform:translate(0,0);}}
`;

export default function Loader() {
  return (
    <div className="global-loader-overlay">
      <style>{css}</style>

      <div className="push-pop loader">
        <div></div><div></div>
      </div>

      <div className="push-out loader">
        <div></div><div></div>
      </div>
    </div>
  );
}
