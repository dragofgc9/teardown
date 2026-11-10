// The 330e as a page you drive and take apart. Left: eight systems (click one to isolate and fly to it, the dot hides it),
// EXPLODE, body solid / ghost / hidden, DISASSEMBLE. Click any part in the 3D view to pull it out; click again to put it
// back. Right: speed, drive mode, kick-down, PLUG IN, power flow, charge, history, gearbox. Drag to orbit, wheel to zoom,
// 1-6 for views, space to freeze, H to hide the overlay. Left alone it tours itself; any click, drag, wheel or key hands
// control over, 25 s of quiet hands it back.
import {CAMS, createConsole, PLAYS, SPEED_MAX} from './console.js';
import {SYSTEMS} from './car.js';
import {MODES, makeCar, stepCar} from './drive.js';
import {createStage} from './stage.js';
import {DURATION, SCRIPT} from './tour.js';

let W = 1600; // the desktop layout; on phones W and H follow the screen
let H = 900;
const IDLE = 25;
const D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

// camera views: target in metres, azimuth from +z (the car's nose) toward +x (its left), elevation, distance
export const VIEWS = {
  hero: {tx: 0, ty: 0.62, tz: 0, az: 40, el: 19, d: 10.2},
  front: {tx: 0, ty: 0.6, tz: 0.2, az: 6, el: 9, d: 9.2},
  side: {tx: 0, ty: 0.6, tz: 0, az: 90, el: 5, d: 11.0},
  top: {tx: 0, ty: 0.3, tz: 0, az: 90, el: 84, d: 11.0},
  rear: {tx: 0, ty: 0.6, tz: -0.2, az: 176, el: 12, d: 9.8},
  under: {tx: 0, ty: 0.3, tz: 0, az: 48, el: -26, d: 9.6},
  wide: {tx: 0, ty: 0.55, tz: 0, az: 36, el: 27, d: 17},
};
export const SYS_VIEW = {
  body: VIEWS.hero,
  cabin: {tx: 0, ty: 0.72, tz: -0.1, az: 58, el: 40, d: 6.6},
  engine: {tx: 0, ty: 0.55, tz: 1.55, az: 80, el: 24, d: 3.0},
  edrive: {tx: 0, ty: 0.42, tz: 0.95, az: 74, el: 20, d: 3.3},
  hv: {tx: 0, ty: 0.42, tz: -0.2, az: 128, el: 34, d: 8.4},
  fuel: {tx: 0, ty: 0.3, tz: -0.85, az: 140, el: 36, d: 6.6},
  driveline: {tx: 0, ty: 0.34, tz: -0.45, az: 66, el: 28, d: 5.6},
  chassis: {tx: 0, ty: 0.4, tz: 0, az: 48, el: 24, d: 8.4},
};
// the order parts come off in DISASSEMBLE
const ORDER = [
  'hood', 'trunk', 'roof', 'doorFL', 'doorFR', 'doorRL', 'doorRR', 'bumperF', 'bumperR',
  'seatFL', 'seatFR', 'seatR', 'dash', 'steer',
  'cover', 'valvetrain', 'head', 'intake', 'turbo', 'liners', 'rods', 'crank', 'pan', 'cooling',
  'gearbox', 'converter', 'k0', 'rotor', 'stator',
  'cables', 'eme', 'port', 'pack', 'exhaust', 'tank', 'prop', 'diff', 'halfshafts',
  'brakeFL', 'brakeFR', 'brakeRL', 'brakeRR', 'wheelFL', 'wheelFR', 'wheelRL', 'wheelRR', 'suspFL', 'suspFR', 'suspRL', 'suspRR', 'subF', 'subR', 'floor',
];

const CSS = `
html,body{background:#ecedef;position:fixed;inset:0;width:100%;height:100%;overflow:hidden;overscroll-behavior:none}
#clip{position:fixed;inset:0;overflow:hidden}
#app{position:absolute!important;inset:auto!important;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#gl{touch-action:none;cursor:grab}
#gl.drag{cursor:grabbing}
#gl.pick{cursor:pointer}
.tourchip{position:absolute;left:50%;top:64px;transform:translateX(-50%);display:flex;align-items:center;gap:8px;height:24px;padding:0 12px;border:1px solid #e1e3e6;background:rgba(255,255,255,.95);color:#16181b;font:600 9px Inter,sans-serif;letter-spacing:1.3px;white-space:nowrap;cursor:pointer;pointer-events:auto}
.tourchip i{display:block;width:6px;height:6px;border-radius:50%;background:#d6182b}
.tourchip.on i{animation:blink 1.2s steps(2) infinite}
@keyframes blink{50%{opacity:.15}}
.say{position:absolute;left:50%;top:98px;transform:translateX(-50%);max-width:640px;text-align:center;font:500 15px/1.45 Inter,sans-serif;color:#2a2e33;pointer-events:none;text-shadow:0 0 8px #eceef0,0 0 3px #eceef0}
.ui.m .tourchip{top:90px;height:28px}
.ui.m .say{top:126px;font-size:12.5px;max-width:88%}
.ui.m.ls .tourchip{left:12px;transform:none;top:84px}
.ui.m.ls .say{left:12px;transform:none;top:116px;text-align:left;max-width:300px;font-size:11.5px}
.ui.m.ls .mcard{left:12px;transform:none;top:84px;width:320px}
.ui.m.ls .mini{right:auto;left:12px;top:32px}
`;

export function runLive() {
  const top = Number(document.body.dataset.top || 0);
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const app = document.getElementById('app');
  // The 1600 px layout would make a phone widen its layout viewport (innerWidth reads 1500+ on an 844 px screen) and
  // every size would be computed wrong: clip it in a fixed box so the viewport stays the screen.
  const clip = document.createElement('div');
  clip.id = 'clip';
  app.parentNode.insertBefore(clip, app);
  clip.appendChild(app);
  const coarse = matchMedia('(pointer: coarse)').matches;
  const wantMobile = () => (coarse ? Math.min(innerWidth, innerHeight) < 900 : Math.min(innerWidth, innerHeight) < 560);
  let mobile = false;
  const canvas = document.createElement('canvas');
  canvas.id = 'gl';
  app.appendChild(canvas);
  const st = createStage({canvas, mobile: coarse || wantMobile()});
  const car = st.car;

  // ------------------------------------------------------------ quality tiers
  // 0 desktop; 1 phones start here (no MSAA, 1.5x, small shadow map); 2 no shadows (a blob instead), 1x. A slow
  // device steps down on its own.
  const TIERS = [{shadow: 2048, pr: 2}, {shadow: 1024, pr: 1.5}, {shadow: 0, pr: 1}];
  let tier = coarse || wantMobile() ? 1 : 0;
  let scale = 1;
  const fit = () => {
    if (mobile) {
      W = innerWidth;
      H = innerHeight;
      scale = 1;
      app.style.width = W + 'px';
      app.style.height = H + 'px';
      app.style.transform = 'none';
    } else {
      W = 1600;
      H = 900;
      app.style.width = '';
      app.style.height = '';
      const h = innerHeight - top;
      scale = Math.min(innerWidth / W, h / H);
      app.style.transform = `translate(${(innerWidth - W * scale) / 2}px, ${top + (h - H * scale) / 2}px) scale(${scale})`;
    }
    st.setFov(W / H < 1.25 ? 38 : 24);
    st.resize(W, H, clamp((devicePixelRatio || 1) * scale, 0.75, TIERS[tier].pr));
  };
  const applyTier = () => {
    st.setQuality({shadow: TIERS[tier].shadow});
    fit();
  };
  applyTier();
  const toStage = (cx, cy) => {
    const r = app.getBoundingClientRect();
    return [(cx - r.left) / scale, (cy - r.top) / scale];
  };

  // ------------------------------------------------------------ state
  const vehicle = makeCar();
  const S = {
    target: 0, // km/h
    mode: 'AUTO',
    plug: false,
    kick: false,
    explode: 0,
    explodeT: 0,
    bodyMode: 'solid',
    focus: null,
    hidden: new Set(),
    selected: null,
    hover: null,
    view: 'hero',
    playI: 2,
    paused: false,
    hide: false,
  };
  const off = {az: 0, el: 0, k: 1};
  let viewT = {...VIEWS.hero};
  const cam = {...VIEWS.hero, sx: 0, sy: -16};
  let T = 0;
  let lastInput = 0;
  let seq = null; // an ordered pull / push in progress: {list, i, t, dir}
  const hist = {len: 300, n: 300, i: 0, pe: new Float32Array(300), pm: new Float32Array(300), pb: new Float32Array(300), t: 0};
  let tipPos = null;

  const partOut = () => car.parts.filter((p) => p.pullT > 0.5).length;
  for (const p of car.parts) p.pullT = 0;

  // ------------------------------------------------------------ the console
  const api = {
    onSystem: (id) => {
      takeOver();
      focusSystem(S.focus === id ? null : id);
    },
    onEye: (id) => {
      takeOver();
      if (S.hidden.has(id)) S.hidden.delete(id);
      else S.hidden.add(id);
    },
    onExplode: (k) => {
      takeOver();
      S.explodeT = k;
      S.explode = k;
    },
    onBody: (m) => {
      takeOver();
      S.bodyMode = m;
    },
    onCam: (c) => {
      takeOver();
      setView(c);
    },
    onMode: (m) => {
      takeOver();
      S.mode = m;
    },
    onTarget: (k) => {
      takeOver();
      S.target = Math.round((k * SPEED_MAX) / 5) * 5;
    },
    onKick: (v) => {
      if (v) takeOver();
      S.kick = v;
    },
    onPlug: () => {
      takeOver();
      S.plug = !S.plug;
      if (S.plug) S.target = 0;
    },
    onDisassemble: () => {
      takeOver();
      S.selected = null;
      S.focus = null;
      S.bodyMode = 'solid';
      setView('wide');
      seq = {list: ORDER.slice(), i: 0, t: 0, dir: 1};
    },
    onReassemble: () => {
      takeOver();
      S.selected = null;
      seq = {list: ORDER.filter((id) => car.byId[id].pullT > 0.5).reverse(), i: 0, t: 0, dir: -1};
      S.explodeT = 0;
    },
    onCardRemove: () => {
      takeOver();
      const p = car.byId[S.selected];
      if (p) p.pullT = p.pullT > 0.5 ? 0 : 1;
    },
    onDeselect: () => {
      takeOver();
      S.selected = null;
    },
  };
  const ui = createConsole(app, api);
  const tourChip = document.createElement('div');
  tourChip.className = 'tourchip';
  ui.root.appendChild(tourChip);
  const say = document.createElement('div');
  say.className = 'say';
  ui.root.appendChild(say);

  // ------------------------------------------------------------ phones: panels move into a tabbed drawer
  // Portrait: a sheet along the bottom you scroll sideways. Landscape: a column down the right edge. The same panels,
  // scaled 1.15x for fingers; the speed and the selected part get compact versions of their own (console.js).
  const P = ui.panels;
  const orig = Object.fromEntries(Object.entries(P).map(([k, p]) => [k, p.style.cssText]));
  const KEYS = ['sys', 'take', 'drive', 'modes', 'flow', 'chart', 'gear'];
  const SZ = Object.fromEntries(KEYS.map((k) => [k, [parseFloat(P[k].style.width), parseFloat(P[k].style.height)]]));
  const PK = 1.15;
  const TABS = [['parts', 'Parts', ['sys', 'take']], ['drive', 'Drive', ['drive', 'modes']], ['power', 'Power', ['flow', 'chart']], ['gear', 'Gearbox', ['gear']]];
  const drawer = document.createElement('div');
  drawer.className = 'drawer';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  drawer.append(sheet, tabs);
  ui.root.appendChild(drawer);
  let openTab = null;
  let drawerSize = [0, 0];
  const measure = () => (drawerSize = [drawer.offsetWidth, drawer.offsetHeight]);
  const setTab = (id) => {
    openTab = id;
    drawer.classList.toggle('open', !!id);
    TABS.forEach(([t], i) => tabBtns[i].classList.toggle('on', t === id));
    sheet.replaceChildren(...(id ? TABS.find((t) => t[0] === id)[2].map((k) => P[k]) : []));
    measure();
  };
  const tabBtns = TABS.map(([id, name]) => {
    const b = document.createElement('div');
    b.className = 'btn';
    b.textContent = name;
    b.addEventListener('click', () => {
      takeOver();
      setTab(openTab === id ? null : id);
    });
    tabs.appendChild(b);
    return b;
  });
  const enterMobile = () => {
    // CSS zoom, not a transform: scaled layers composite badly in some browsers, and zoom also grows the layout box
    for (const k of KEYS) {
      const [w, h] = SZ[k];
      P[k].style.cssText = `position:relative;flex:none;width:${w}px;height:${h}px;zoom:${PK}`;
      P[k].remove(); // it comes back inside the sheet when its tab opens
    }
    P.cams.style.pointerEvents = 'auto';
  };
  const exitMobile = () => {
    for (const k of [...KEYS, 'cams']) {
      ui.root.appendChild(P[k]);
      P[k].style.cssText = orig[k];
    }
    sheet.replaceChildren();
    openTab = null;
    drawer.classList.remove('open');
    TABS.forEach((_, i) => tabBtns[i].classList.remove('on'));
  };
  const layout = () => {
    const m = wantMobile();
    if (m !== mobile) {
      mobile = m;
      ui.root.classList.toggle('m', m);
      m ? enterMobile() : exitMobile();
    }
    const land = innerWidth > innerHeight;
    ui.root.classList.toggle('pt', m && !land);
    ui.root.classList.toggle('ls', m && land);
    if (m) P.cams.style.cssText = land ? 'position:absolute;left:150px;top:6px;right:12px;height:34px;overflow-x:auto;overflow-y:hidden;pointer-events:auto;background:transparent;border:0;box-shadow:none' : 'position:absolute;left:0;right:0;top:50px;height:34px;overflow-x:auto;overflow-y:hidden;pointer-events:auto;background:transparent;border:0;box-shadow:none';
    fit();
    measure();
  };
  addEventListener('resize', layout);
  addEventListener('orientationchange', () => setTimeout(layout, 120));
  layout();
  // the playback step: − / + beside the label
  {
    const tp = ui.playVal.parentNode;
    ui.playVal.style.right = '78px';
    for (const [txt, d, x] of [['−', -1, 192], ['+', 1, 226]]) {
      const b = document.createElement('div');
      b.className = 'btn';
      b.textContent = txt;
      b.style.cssText = `position:absolute;left:${x}px;top:148px;width:30px;padding:0`;
      b.addEventListener('click', () => {
        takeOver();
        S.playI = clamp(S.playI + d, 0, PLAYS.length - 1);
      });
      tp.appendChild(b);
    }
  }

  const setView = (name) => {
    S.view = name;
    viewT = {...VIEWS[name]};
    Object.assign(off, {az: 0, el: 0, k: 1});
  };
  const focusSystem = (id) => {
    S.focus = id;
    if (id) {
      viewT = {...SYS_VIEW[id]};
      S.view = null;
      if (id === 'body') {
        S.focus = null;
        S.bodyMode = 'solid';
        viewT = {...VIEWS.hero};
      }
      S.hidden.delete(id);
    }
    Object.assign(off, {az: 0, el: 0, k: 1});
  };

  // ------------------------------------------------------------ the tour
  const AP = {on: true, t0: 0, loop: 0, idx: -1, say: ''};
  const reset = () => {
    for (const p of car.parts) p.pullT = 0;
    seq = null;
    Object.assign(S, {target: 0, mode: 'AUTO', plug: false, kick: false, explode: 0, explodeT: 0, bodyMode: 'solid', focus: null, selected: null, hover: null, playI: 2});
    S.hidden.clear();
    setView('hero');
  };
  const startTour = () => {
    AP.on = true;
    AP.t0 = T;
    AP.idx = -1;
    AP.say = '';
    reset();
  };
  const applyStep = (e) => {
    if (e.view) {
      setView(e.view);
      S.focus = null;
    }
    if ('focus' in e) {
      S.focus = e.focus;
      if (e.focus) {
        viewT = {...SYS_VIEW[e.focus]};
        S.view = null;
      }
    }
    if (e.body) S.bodyMode = e.body;
    if ('explode' in e) S.explodeT = e.explode;
    if ('target' in e) S.target = e.target;
    if (e.mode) S.mode = e.mode;
    if ('plug' in e) S.plug = e.plug;
    if ('kick' in e) S.kick = e.kick;
    if ('az' in e) viewT = {...viewT, az: e.az};
    if (e.say !== undefined) AP.say = e.say;
    if (e.pull) for (const id of e.pull) car.byId[id].pullT = 1;
    if (e.push) for (const id of e.push) car.byId[id].pullT = 0;
  };
  const takeOver = () => {
    lastInput = T;
    if (!AP.on) return;
    AP.on = false;
    AP.say = '';
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

  // ------------------------------------------------------------ pointer: orbit, hover, click to pull
  let drag = null;
  const ptrs = new Map(); // touches down on the canvas, for the two-finger pinch
  let pinch = null;
  const stagePos = (e) => toStage(e.clientX, e.clientY);
  canvas.addEventListener('pointerdown', (e) => {
    ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = {d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: off.k};
      if (drag) drag.moved = true;
    }
    drag = {x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: !!pinch};
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('drag');
  });
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = stagePos(e);
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      off.k = clamp(pinch.k0 * (pinch.d0 / (Math.hypot(a.x - b.x, a.y - b.y) || 1)), 0.3, 2.2);
      lastInput = T;
      return;
    }
    if (drag) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) drag.moved = true;
      if (drag.moved) {
        off.az -= ((e.clientX - drag.x) / scale) * 0.3;
        off.el = clamp(off.el + ((e.clientY - drag.y) / scale) * 0.2, -60, 70);
        lastInput = T;
      }
      drag.x = e.clientX;
      drag.y = e.clientY;
      return;
    }
    tipPos = [x, y];
  });
  canvas.addEventListener('pointerleave', () => (tipPos = null));
  const endDrag = (e) => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (drag && !drag.moved && e.type === 'pointerup') {
      const [x, y] = stagePos(e);
      const p = st.pick(x, y);
      if (p) {
        if (S.selected === p.id && p.pullT > 0.5) {
          p.pullT = 0;
          S.selected = null;
        } else {
          S.selected = p.id;
          if (p.ex.lengthSq() > 1e-4) p.pullT = 1;
        }
      } else S.selected = null;
    }
    drag = null;
    canvas.classList.remove('drag');
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      takeOver();
      off.k = clamp(off.k * Math.exp(e.deltaY * 0.0012), 0.3, 2.2);
    },
    {passive: false},
  );
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    takeOver();
    if (/^[1-6]$/.test(key)) setView(CAMS[Number(key) - 1]);
    else if (key === ' ') S.paused = !S.paused;
    else if (key === 'h') S.hide = !S.hide;
    else if (key === 'escape') S.selected = null;
    else if (key === 'e') S.explodeT = S.explode = S.explodeT > 0.5 ? 0 : 1;
    else if (key === 'arrowup') S.target = clamp(S.target + 10, 0, SPEED_MAX);
    else if (key === 'arrowdown') S.target = clamp(S.target - 10, 0, SPEED_MAX);
    else if (key === 'm') S.mode = MODES[(MODES.indexOf(S.mode) + 1) % MODES.length];
    else return;
    e.preventDefault();
  });

  // ------------------------------------------------------------ the frame
  startTour();
  let last = performance.now();
  const perf = {n: 0, sum: 0, slow: 0, age: 0};
  const counts = () => {
    const o = {};
    for (const s of SYSTEMS) o[s.id] = {all: 0, out: 0};
    for (const p of car.parts) {
      o[p.system].all++;
      if (p.pullT > 0.5) o[p.system].out++;
    }
    return o;
  };
  const frame = (now) => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (tier < TIERS.length - 1) {
      perf.age += dt;
      if (perf.age > 0.6) {
        perf.sum += dt;
        perf.n++;
        if (perf.sum >= 0.5 && perf.n >= 6) {
          perf.slow = perf.sum / perf.n > 0.026 ? perf.slow + 1 : 0;
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

    const o = tick(dt);
    st.frame({...cam, az: cam.az * D2R, el: cam.el * D2R, sx: cam.sx, sy: cam.sy}, vehicle.dist, o.v > 0.3);
    drawUi(o);
    requestAnimationFrame(frame);
  };
  const tick = (dt, seeking = false) => {
    T += dt;
    // the tour: steps fire in order, the clock loops
    if (AP.on) {
      const c = T - AP.t0;
      const cyc = c % DURATION;
      const loop = Math.floor(c / DURATION);
      if (loop > AP.loop) {
        AP.loop = loop;
        AP.idx = -1;
        reset();
      }
      while (AP.idx + 1 < SCRIPT.length && SCRIPT[AP.idx + 1].t <= cyc) applyStep(SCRIPT[++AP.idx]);
    } else if (T - lastInput > IDLE) startTour();

    // an ordered pull-out / put-back
    if (seq) {
      seq.t += dt;
      while (seq.t > 0.28 && seq.i < seq.list.length) {
        seq.t -= 0.28;
        car.byId[seq.list[seq.i++]].pullT = seq.dir > 0 ? 1 : 0;
      }
      if (seq.i >= seq.list.length) seq = null;
    }
    for (const p of car.parts) p.pull += (p.pullT - p.pull) * (1 - Math.exp(-dt / 0.32));
    S.explode += (S.explodeT - S.explode) * (1 - Math.exp(-dt / 0.45));

    // the car
    const pb = PLAYS[S.playI];
    if (!S.paused) {
      let acc = dt;
      const h = 1 / 120;
      let o = vehicle.out;
      while (acc > 1e-6) {
        const d = Math.min(h, acc);
        o = stepCar(vehicle, d, {target: S.target / 3.6, mode: S.mode, plug: S.plug, kick: S.kick});
        acc -= d;
      }
      car.update(o, dt, pb);
      hist.t += dt;
      while (hist.t > 0.1) {
        hist.t -= 0.1;
        const k = hist.i;
        hist.pe[k] = o.Pe / 1000;
        hist.pm[k] = o.Pm / 1000;
        hist.pb[k] = o.Pbat / 1000;
        hist.i = (hist.i + 1) % hist.len;
      }
    }
    const o = vehicle.out.v === undefined ? stepCar(vehicle, 1 / 60, {target: 0, mode: S.mode}) : vehicle.out;

    // camera eases to its target
    const k = 1 - Math.exp(-dt / (AP.on ? 0.55 : 0.4));
    cam.az += wrap(viewT.az + off.az - cam.az) * k;
    // a narrow screen backs the camera off so the car still fits the width
    const asp = W / H;
    const fitK = mobile ? Math.max(1, ((Math.tan(12 * D2R) * 1.78) / (Math.tan(((asp < 1.25 ? 38 : 24) / 2) * D2R) * asp)) * 0.8) : 1;
    for (const key of ['tx', 'ty', 'tz', 'el', 'd']) {
      const goal = key === 'el' ? clamp(viewT.el + off.el, -60, 86) : key === 'd' ? viewT.d * fitK * off.k * (1 + 0.3 * Math.max(S.explode, partOut() / car.parts.length)) : viewT[key];
      cam[key] += (goal - cam[key]) * k;
    }
    // centre the car in what the panels leave free
    let gx = 0;
    let gy = -14;
    if (mobile) {
      if (H > W) gy = (124 + (H - (openTab ? drawerSize[1] : 44))) / 2 - H / 2;
      else {
        gx = (W - (openTab ? drawerSize[0] : 0)) / 2 - W / 2;
        gy = 22;
      }
    }
    cam.sx += (gx - cam.sx) * k;
    cam.sy += (gy - cam.sy) * k;
    // hover
    if (!seeking && tipPos && !drag) {
      const p = st.pick(tipPos[0], tipPos[1]);
      S.hover = p ? p.id : null;
    } else S.hover = null;
    if (!seeking) canvas.classList.toggle('pick', !!S.hover && !drag);

    car.look(dt, {explode: S.explode, hidden: S.hidden, isolate: S.focus, bodyMode: S.bodyMode, selected: S.selected, hover: S.hover});
    return o;
  };
  const drawUi = (o) => {
    ui.root.style.display = S.hide ? 'none' : '';
    const sel = S.selected ? car.byId[S.selected] : null;
    const hv = S.hover && !sel ? car.byId[S.hover] : null;
    let tip = null;
    if (S.hover && tipPos && S.hover !== S.selected) tip = {x: tipPos[0], y: tipPos[1], name: car.byId[S.hover].name};
    void hv;
    ui.update({
      o,
      target: S.target,
      explode: S.explode,
      bodyMode: S.bodyMode,
      cam: S.view,
      focus: S.focus,
      hidden: S.hidden,
      counts: counts(),
      play: PLAYS[S.playI],
      plug: S.plug,
      kick: S.kick,
      hist,
      part: sel,
      outCount: partOut(),
      partCount: car.parts.length,
      tip,
    });
    if (tourChip.classList.contains('on') !== AP.on || !tourChip.firstChild) {
      tourChip.classList.toggle('on', AP.on);
      tourChip.innerHTML = AP.on ? '<i></i>AUTO TOUR · CLICK TO TAKE OVER' : '▶ RESUME TOUR';
    }
    if (say.textContent !== AP.say) say.textContent = AP.say;
    if (!window.SIM_SHOWN) {
      window.SIM_SHOWN = true;
      dispatchEvent(new Event('simframe'));
    }
  };
  // every shader compiles at once off the main thread before the first frame
  st.renderer.compileAsync(st.scene, st.camera).then(() => requestAnimationFrame(frame), () => requestAnimationFrame(frame));
  window.LIVE = {st, S, vehicle, car, cam, api, startTour, takeOver, step: (sec) => {
    for (let tt = 0; tt < sec; tt += 1 / 30) tick(1 / 30, true);
    st.frame({...cam, az: cam.az * D2R, el: cam.el * D2R, sx: cam.sx, sy: cam.sy}, vehicle.dist, vehicle.out.v > 0.3);
    drawUi(vehicle.out);
  }, seek: (t) => {
    startTour();
    for (let tt = 0; tt < t; tt += 1 / 30) tick(1 / 30, true);
    st.frame({...cam, az: cam.az * D2R, el: cam.el * D2R, sx: cam.sx, sy: cam.sy}, vehicle.dist, vehicle.out.v > 0.3);
    drawUi(vehicle.out);
  }, sim: (sec) => {
    for (let i = 0; i < sec * 120; i++) stepCar(vehicle, 1 / 120, {target: S.target / 3.6, mode: S.mode, plug: S.plug, kick: S.kick});
  }, get T() {
    return T;
  }, get tier() {
    return tier;
  }};
}
