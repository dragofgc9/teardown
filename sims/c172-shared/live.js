// The 172E as a page you drive. RUN-UP, TEAR DOWN and REBUILD start a sequence, the play button pauses it, the
// timeline scrubs it, SPEED sets its pace; the six views, the three display modes, an orbit you drag and a zoom on the
// wheel. Click any part of the aircraft, or its row in the assemblies list, to pull that assembly off or put it back;
// hovering a part lights it and names it. Left alone it plays the film's script as an auto tour with the operator's
// cursor, looped; a click, drag, wheel or key hands control to the visitor, 25 s of quiet hands it back.
import {warmComposer} from '../kit/warm.js';
import {C, createConsole, DISPLAY, VIEWS} from './console.js';
import {airframeState, camAt, ctxAt, displayAt, DURATION, makeConsoleFrame, makeCursor, seqAt, viewAt, VIEW_FN} from './film.js';
import {createStage} from './stage.js';
import {GI, GROUPS, mechAt, NG, rawAt, REQ, SEQ, SEQS} from './teardown.js';

const W = 1600;
const H = 900;
const IDLE = 25;
const D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoother = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const SPEED = [0.1, 2];
const speedK = (v) => (v - SPEED[0]) / (SPEED[1] - SPEED[0]);
const NAME = Object.fromEntries(GROUPS.map((g) => [g.id, g]));
NAME.fuse = {name: 'FUSELAGE', sub: 'STAYS ON THE JIG'};

const CSS = `
html,body{background:#e7e9ea;overflow:hidden}
#app{position:absolute!important;inset:auto!important;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#gl{touch-action:none;cursor:grab}
#gl.drag{cursor:grabbing}
#gl.part{cursor:pointer}
.bt,.row{pointer-events:auto;cursor:pointer}
.bt:hover{filter:brightness(.96)}
.hit{position:absolute;pointer-events:auto;cursor:ew-resize}
.tourchip{position:absolute;left:800px;top:154px;transform:translateX(-50%);display:flex;align-items:center;gap:7px;height:22px;padding:0 11px;border:1px solid ${C.line};border-radius:4px;background:rgba(250,251,251,.95);color:${C.ink};font:700 9px 'JetBrains Mono',monospace;letter-spacing:1.3px;white-space:nowrap;cursor:pointer;pointer-events:auto}
.tourchip i{display:block;width:6px;height:6px;border-radius:50%;background:${C.or}}
.tourchip.on i{animation:blink 1.2s steps(2) infinite}
@keyframes blink{50%{opacity:.15}}
.tip{position:absolute;z-index:40;padding:7px 10px 6px;border-radius:4px;background:${C.ink};color:#fff;white-space:nowrap;pointer-events:none;display:none}
.tip b{display:block;font:700 9.4px 'JetBrains Mono',monospace;letter-spacing:1.3px}
.tip span{display:block;font:500 7.8px 'JetBrains Mono',monospace;letter-spacing:1.2px;color:#b8bec3;margin-top:3px}
.tip em{display:block;font:700 7.8px 'JetBrains Mono',monospace;letter-spacing:1.2px;color:#ff8a63;margin-top:4px;font-style:normal}
.turn{position:fixed;left:0;right:0;bottom:18px;text-align:center;font:600 12px/1.4 'JetBrains Mono',monospace;letter-spacing:1px;color:${C.mute};text-transform:uppercase;display:none}
@media (orientation:portrait) and (max-width:820px){.turn{display:block}}
`;

export function runLive() {
  const top = Number(document.body.dataset.top || 0);
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const app = document.getElementById('app');
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);
  const st = createStage({canvas});
  const ui = createConsole(app);
  const tourCursor = makeCursor(ui);
  const frameConsole = makeConsoleFrame(ui, st);

  // ------------------------------------------------------------ quality tiers
  const TIERS = [
    {samples: 8, ao: true, shadow: 4096, pr: 2},
    {samples: 4, ao: false, shadow: 2048, pr: 1.5},
    {samples: 2, ao: false, shadow: 1024, pr: 1},
  ];
  const light = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700;
  let tier = light ? 2 : 0;
  let scale = 1;
  const fit = () => {
    const h = innerHeight - top;
    scale = Math.min(innerWidth / W, h / H);
    app.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${top + (h - H * scale) / 2}px) scale(${scale})`;
    st.resize(W, H, clamp((devicePixelRatio || 1) * scale, 0.75, TIERS[tier].pr));
  };
  const applyTier = () => {
    const {pr, ...q} = TIERS[tier];
    st.setQuality(q);
    fit();
  };
  applyTier();
  addEventListener('resize', fit);
  const toStage = (cx, cy) => {
    const r = app.getBoundingClientRect();
    return [(cx - r.left) / scale, (cy - r.top) / scale];
  };
  const tourChip = document.createElement('div');
  tourChip.className = 'tourchip';
  ui.root.appendChild(tourChip);
  const tip = document.createElement('div');
  tip.className = 'tip';
  ui.root.appendChild(tip);
  const note = document.createElement('div');
  note.className = 'turn';
  note.textContent = 'Turn your phone sideways for the full console';
  document.body.appendChild(note);

  // ------------------------------------------------------------ state
  let T = 0;
  let seq = 'runup';
  let tau = 0;
  let speed = 1;
  let paused = false;
  let view = 'hero';
  let viewAt0 = 0;
  const disp = Object.fromEntries(DISPLAY.map((k) => [k, {on: 0, t: -9}]));
  const off = {az: 0, el: 0, k: 1};
  const cam = {...VIEW_FN.hero(0, {sp: 0, ez: 0})};
  let prop = 0;
  let ring = {t: -9, x: 0, y: 0};
  let hover = null;
  // per-assembly overrides from clicks: {from, to, t}; null follows the sequence
  const man = new Array(NG).fill(null);
  const eased = (k, dur = 0.7) => {
    const d = disp[k];
    const x = ss(d.t, d.t + dur, T);
    return d.on ? x : 1 - x;
  };
  const pulse = (k) => (ring = {t: T, x: ui.spots[k][0], y: ui.spots[k][1]});
  const rawNow = (level) =>
    Array.from({length: NG}, (_, i) => {
      const o = man[i];
      if (!o) return rawAt(level, i);
      return o.from + (o.to - o.from) * clamp((T - o.t) / o.dur, 0, 1);
    });
  let lastRaw = new Array(NG).fill(0);
  // pulling an assembly first pulls whatever is in its way (REQ read backwards); refitting one first refits what it
  // goes onto; each step starts as the one before it finishes
  const plan = (id, to, out = []) => {
    const i = GI[id];
    if ((lastRaw[i] >= 0.5 ? 1 : 0) === to || out.some((x) => x.i === i)) return out;
    const deps = to ? GROUPS.filter((g) => (REQ[g.id] || []).includes(id)).map((g) => g.id) : REQ[id] || [];
    for (const d of deps) plan(d, to, out);
    out.push({i, to});
    return out;
  };
  const toggle = (i) => {
    let t = T;
    for (const {i: j, to} of plan(GROUPS[i].id, lastRaw[i] < 0.5 ? 1 : 0)) {
      const cur = lastRaw[j];
      const dur = 1.2 * Math.max(0.25, Math.abs(to - cur));
      man[j] = {from: cur, to, t, dur};
      t += dur * 0.7;
    }
  };
  const clearMan = () => man.fill(null);

  // ------------------------------------------------------------ the tour
  const AP = {on: true, t0: 0, loop: 0};
  let lastInput = 0;
  const startTour = () => {
    AP.on = true;
    AP.t0 = T;
    AP.loop = 0;
    paused = false;
    speed = 1;
    clearMan();
    Object.assign(off, {az: 0, el: 0, k: 1});
  };
  const takeOver = () => {
    lastInput = T;
    if (!AP.on) return;
    AP.on = false;
    const cyc = (T - AP.t0) % DURATION;
    const [t0, v] = viewAt(cyc);
    view = v;
    viewAt0 = T - (cyc - t0);
  };
  tourChip.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    lastInput = T;
    if (AP.on) takeOver();
    else startTour();
  });
  addEventListener('pointerdown', (e) => {
    if (e.target !== tourChip) takeOver();
  });
  const syncDisplay = (cyc) => {
    const want = displayAt(cyc);
    for (const k of DISPLAY) {
      if (disp[k].on !== want[k]) {
        disp[k].on = want[k];
        disp[k].t = T;
      }
    }
  };

  // ------------------------------------------------------------ controls
  const startSeq = (s) => {
    seq = s;
    tau = 0;
    paused = false;
    clearMan();
  };
  for (const s of SEQS)
    ui.btn[s].addEventListener('click', () => {
      takeOver();
      pulse(s);
      startSeq(s);
    });
  for (const v of VIEWS)
    ui.btn[v].addEventListener('click', () => {
      takeOver();
      pulse(v);
      view = v;
      viewAt0 = T;
      Object.assign(off, {az: 0, el: 0, k: 1});
    });
  for (const k of DISPLAY)
    ui.btn[k].addEventListener('click', () => {
      takeOver();
      pulse(k);
      disp[k].on = disp[k].on ? 0 : 1;
      disp[k].t = T;
    });
  GROUPS.forEach((g, i) => {
    const r = ui.btn[`part:${g.id}`];
    r.addEventListener('click', () => {
      takeOver();
      toggle(i);
    });
    r.addEventListener('pointerenter', () => (hover = g.id));
    r.addEventListener('pointerleave', () => hover === g.id && (hover = null));
  });
  ui.btn.play.addEventListener('click', () => {
    takeOver();
    pulse('play');
    if (tau >= SEQ[seq].dur - 1e-3) tau = 0;
    paused = !paused;
  });
  const slider = (x0, w, y, apply) => {
    const d = document.createElement('div');
    d.className = 'hit';
    Object.assign(d.style, {left: `${x0 - 8}px`, top: `${y - 11}px`, width: `${w + 16}px`, height: '22px'});
    const move = (e) => {
      const [x] = toStage(e.clientX, e.clientY);
      apply(clamp((x - x0) / w, 0, 1));
      lastInput = T;
    };
    d.addEventListener('pointerdown', (e) => {
      takeOver();
      d.setPointerCapture(e.pointerId);
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      move(e);
    });
    ui.root.appendChild(d);
  };
  slider(ui.TL.x, ui.TL.w, 821, (k) => {
    tau = k * SEQ[seq].dur;
    paused = true;
    clearMan();
  });
  slider(ui.SP.x, ui.SP.w, 824, (k) => (speed = SPEED[0] + k * (SPEED[1] - SPEED[0])));
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    const v = {1: 'hero', 2: 'front', 3: 'side', 4: 'top', 5: 'engine', 6: 'tail'}[key];
    const b = {' ': 'play', r: 'runup', t: 'teardown', b: 'rebuild', l: 'labels', x: 'xray', o: 'orbit'}[key];
    if (v) ui.btn[v].click();
    else if (b) ui.btn[b].click();
    else return;
    e.preventDefault();
  });
  // drag to orbit; a click that does not drag pulls the part under it
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = {x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY};
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    const [sx, sy] = toStage(e.clientX, e.clientY);
    if (drag) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 4) canvas.classList.add('drag');
      off.az += ((e.clientX - drag.x) / scale) * 0.3;
      off.el = clamp(off.el + ((e.clientY - drag.y) / scale) * 0.2, -25, 60);
      drag.x = e.clientX;
      drag.y = e.clientY;
      lastInput = T;
      hover = null;
    } else {
      hover = st.pick(sx, sy);
      canvas.classList.toggle('part', !!hover && hover !== 'fuse');
      const g = hover && NAME[hover];
      if (g) {
        const i = GROUPS.findIndex((x) => x.id === hover);
        const act = i < 0 ? '' : lastRaw[i] < 0.5 ? 'CLICK TO PULL IT OFF' : 'CLICK TO REFIT';
        tip.innerHTML = `<b>${g.name}</b><span>${g.sub}</span>${act ? `<em>${act}</em>` : ''}`;
        tip.style.display = 'block';
        tip.style.left = `${Math.min(sx + 16, 1340)}px`;
        tip.style.top = `${sy + 18}px`;
      } else tip.style.display = 'none';
    }
  });
  const endDrag = (e) => {
    if (drag && e && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) <= 4) {
      const [sx, sy] = toStage(e.clientX, e.clientY);
      const gid = st.pick(sx, sy);
      const i = GROUPS.findIndex((g) => g.id === gid);
      if (i >= 0) toggle(i);
    }
    drag = null;
    canvas.classList.remove('drag');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', () => endDrag(null));
  canvas.addEventListener('pointerleave', () => {
    if (!drag) {
      hover = null;
      tip.style.display = 'none';
    }
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      takeOver();
      off.k = clamp(off.k * Math.exp(e.deltaY * 0.0012), 0.3, 2.2);
    },
    {passive: false},
  );

  // ------------------------------------------------------------ the frame
  startTour();
  let last = performance.now();
  const perf = {n: 0, sum: 0, slow: 0, age: 0};
  const frame = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    T += dt;
    if (tier < TIERS.length - 1) {
      perf.age += dt;
      if (perf.age > 0.6) {
        perf.sum += dt;
        perf.n++;
        if (perf.sum >= 0.5 && perf.n >= 6) {
          perf.slow = perf.sum / perf.n > 0.022 ? perf.slow + 1 : 0;
          perf.sum = 0;
          perf.n = 0;
          if (perf.slow >= (perf.age < 6 ? 1 : 2)) {
            tier++;
            applyTier();
            Object.assign(perf, {age: 0, slow: 0});
          }
        }
      }
    }

    let cursor;
    let since;
    let m;
    let raw;
    let tgt;
    if (AP.on) {
      const c = T - AP.t0;
      const loop = Math.floor(c / DURATION);
      const cyc = c - loop * DURATION;
      if (loop > AP.loop) AP.loop = loop;
      const s = seqAt(cyc);
      seq = s.seq;
      tau = s.tau;
      syncDisplay(cyc);
      m = mechAt(seq, tau);
      raw = rawNow(m.level);
      tgt = camAt(cyc, displayAt(cyc).orbit, ctxAt(m, raw));
      const [t0, v] = viewAt(cyc);
      view = v;
      since = cyc - t0;
      cursor = tourCursor(cyc);
      if (AP.loop > 0 && cyc < 0.8) {
        const end = tourCursor(DURATION - 0.01);
        const k = ss(0, 0.8, cyc);
        cursor = {...cursor, x: end.x + (cursor.x - end.x) * k, y: end.y + (cursor.y - end.y) * k};
      }
    } else {
      if (T - lastInput > IDLE) startTour();
      if (!paused) tau = Math.min(SEQ[seq].dur, tau + dt * speed);
      m = mechAt(seq, tau);
      raw = rawNow(m.level);
      since = T - viewAt0;
      tgt = VIEW_FN[view](since, ctxAt(m, raw));
      tgt.az += off.az + (disp.orbit.on ? 9 * (T - disp.orbit.t) : 0);
      tgt.el = clamp(tgt.el + off.el, -20, 88);
      tgt.d *= off.k;
      const rk = Math.max(0, 1 - (T - ring.t) / 0.55);
      cursor = {x: -99, y: -99, press: false, ring: rk, ringX: ring.x, ringY: ring.y};
    }
    lastRaw = raw;
    // a propeller or engine coming off stops the engine
    m = {...m, rpm: m.rpm * (1 - smoother(Math.max(raw[GI.prop], raw[GI.engine]) * 6))};
    const live = AP.on || !paused;
    prop += live ? ((m.rpm * 2 * Math.PI) / 60) * dt * (AP.on ? 1 : speed) : 0;

    const k = 1 - Math.exp(-dt / (AP.on ? 0.18 : 0.4));
    cam.az += wrap(tgt.az - cam.az) * k;
    for (const key of ['tx', 'ty', 'tz', 'el', 'd', 'sx', 'sy']) cam[key] += (tgt[key] - cam[key]) * k;
    const af = airframeState(m, {prop, xray: eased('xray'), raw, hover: AP.on ? null : hover});
    st.frame(af, {...cam, az: cam.az * D2R, el: cam.el * D2R});
    const display = Object.fromEntries(DISPLAY.map((x) => [x, disp[x].on]));
    const touched = man.some(Boolean);
    frameConsole(T, {
      seq,
      tau,
      mech: m,
      raw,
      hover: AP.on ? null : hover,
      view,
      display,
      labels: eased('labels', 0.5) * ss(1.1, 1.7, since),
      cursor,
      paused: AP.on ? false : paused,
      speed: AP.on ? 1 : speed,
      speedK: speedK(AP.on ? 1 : speed),
      phaseText: touched && !AP.on ? `HANDS-ON · ${raw.filter((r) => r >= 1).length} OF ${NG} OFF` : undefined,
    });
    if (tourChip.classList.contains('on') !== AP.on || !tourChip.firstChild) {
      tourChip.classList.toggle('on', AP.on);
      tourChip.innerHTML = AP.on ? '<i></i>AUTO TOUR · CLICK TO TAKE OVER' : '▶ RESUME TOUR';
    }
    if (!window.SIM_SHOWN) {
      window.SIM_SHOWN = true;
      dispatchEvent(new Event('simframe'));
    }
    requestAnimationFrame(frame);
  };
  warmComposer(st.renderer, st.composer, st.scene, st.camera).then(() => requestAnimationFrame(frame));
  window.LIVE = {
    st,
    cam,
    startTour,
    takeOver,
    toggle,
    get tier() {
      return tier;
    },
    get T() {
      return T;
    },
  };
}
