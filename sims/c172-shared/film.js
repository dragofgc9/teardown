// CESSNA 172E (1964), the teardown film: the aircraft (airframe.js) in the hangar (stage.js) under the console
// (console.js). The operator runs the engine up and checks every control surface, then tears the aircraft down to
// the bare fuselage on its stands, assembly by assembly, with the labels on and the camera pulling back as the parts
// spread, orbits the full exploded layout, and builds it back. A pure function of t.
import {runSim} from '../kit/runtime.js';
import {createConsole, DISPLAY} from './console.js';
import {createStage} from './stage.js';
import {GI, GROUPS, kAt, mechAt, NG, phaseAt, rawAt, SEQ, standsAt, stateAt} from './teardown.js';

export const SCRIPT = [
  {t: 0, seq: 'runup', view: 'hero'},
  {t: 2.6, view: 'engine'},
  {t: 2.9, display: 'xray'},
  {t: 3.4, display: 'labels'},
  {t: 6.0, display: 'labels'},
  {t: 6.1, display: 'xray'},
  {t: 6.3, view: 'front'},
  {t: 8.2, view: 'tail'},
  {t: 11.5, view: 'side'},
  {t: 13.1, display: 'xray'},
  {t: 15.2, display: 'xray'},
  {t: 16.2, seq: 'teardown', view: 'hero'},
  {t: 19.0, display: 'labels'},
  {t: 24.6, view: 'top'},
  {t: 29.4, view: 'hero'},
  {t: 29.9, display: 'orbit'},
  {t: 33.4, display: 'labels'},
  {t: 34.0, seq: 'rebuild'},
  {t: 40.5, display: 'orbit'},
];
export const DURATION = 47.6;
export const DEFAULTS = {duration: DURATION, fps: 60, theme: 'light', hud: {enabled: false, title: 'c172', subtitle: ''}, director: {enabled: false}, watermark: ''};
const D2R = Math.PI / 180;
const smoother = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));

// ------------------------------------------------------------ the sequence and the display toggles at film time t
export const seqAt = (t) => {
  const e = SCRIPT.filter((x) => x.seq && x.t <= t).pop();
  return {seq: e.seq, tau: Math.min(SEQ[e.seq].dur, t - e.t)};
};
export const displayAt = (t) => {
  const out = Object.fromEntries(DISPLAY.map((k) => [k, 0]));
  for (const e of SCRIPT) if (e.display && e.t <= t) out[e.display] = out[e.display] ? 0 : 1;
  return out;
};
const lastFlip = (key, t) => SCRIPT.filter((e) => e.display === key && e.t <= t).pop()?.t ?? -9;
export const easedDisplay = (key, t, dur = 0.7) => {
  const on = displayAt(t)[key];
  const k = ss(lastFlip(key, t), lastFlip(key, t) + dur, t);
  return on ? k : 1 - k;
};
// the propeller angle, integrated over the film from the rpm
const DT = 1 / 240;
const PROP = [0];
for (let i = 1; i * DT <= DURATION + 1; i++) {
  const {seq, tau} = seqAt((i - 0.5) * DT);
  PROP.push(PROP[i - 1] + ((mechAt(seq, tau).rpm * 2 * Math.PI) / 60) * DT);
}
export const propAt = (t) => {
  const u = Math.max(0, Math.min(PROP.length - 2, t / DT));
  const i = Math.floor(u);
  return PROP[i] + (PROP[i + 1] - PROP[i]) * (u - i);
};

/** the airframe state for a mechanism state m (teardown.js mechAt); raw overrides per assembly (live page) */
export const airframeState = (m, {prop = 0, xray = 0, raw = null, hover = null} = {}) => {
  const r = raw ?? Array.from({length: NG}, (_, i) => rawAt(m.level, i));
  const hi = {};
  GROUPS.forEach((g, i) => (hi[g.id] = r[i] > 0 && r[i] < 1 ? Math.sin(Math.PI * r[i]) ** 0.5 : 0));
  if (hover) hi[hover] = Math.max(hi[hover] ?? 0, 0.55);
  // the stands come up under the fuselage when the gear starts to leave, or whenever it is off
  const stands = Math.max(standsAt(m.level), smoother(r[GI.gear] * 6));
  return {raw: r, stands, prop, rpm: m.rpm, ail: m.ail, elev: m.elev, rud: m.rud, flap: m.flap, xray, hi};
};

// ------------------------------------------------------------ views: u = seconds on the view, c = {sp, ez}
// sp: how far the parts have spread (0 assembled .. 1 wings off); ez: how far the engine has come forward
export const VIEW_FN = {
  hero: (u, c) => ({tx: 0, ty: 1.15 + 0.35 * c.sp, tz: -1.4 + 0.7 * c.sp, az: 38 + 2 * u, el: 15 + 7 * c.sp, d: 17 + 14 * c.sp, sx: 0, sy: -34}),
  front: (u, c) => ({tx: 0, ty: 1.3 + 0.3 * c.sp, tz: -1.0, az: 4 + 1.5 * u, el: 6 + 6 * c.sp, d: 19 + 10 * c.sp, sx: 0, sy: -34}),
  side: (u, c) => ({tx: 0, ty: 1.3 + 0.2 * c.sp, tz: -1.5 + 0.5 * c.sp, az: 92 + 1.5 * u, el: 5 + 10 * c.sp, d: 17.5 + 13 * c.sp, sx: 0, sy: -34}),
  top: (u, c) => ({tx: 0, ty: 1.0, tz: -0.9, az: 180 + 1.2 * u, el: 76, d: 26 + 13 * c.sp, sx: 0, sy: -26}),
  engine: (u, c) => ({tx: 0, ty: 1.15, tz: 1.55 + c.ez, az: 58 + 3 * u, el: 15, d: 6.4, sx: 0, sy: -30}),
  tail: (u, c) => ({tx: 0, ty: 1.75, tz: -4.85, az: 148 + 3 * u, el: 13, d: 7.4, sx: 0, sy: -30}),
};
export const ctxAt = (m, raw = null) => {
  const ke = raw ? smoother(raw[GI.engine]) : kAt(m.level, GI.engine);
  const spread = raw ? Math.max(...raw.map((r, i) => smoother(r) * Math.min(1, (i + 1) / (GI.wings + 1)))) : smoother(m.level / (GI.wings + 1.3));
  return {sp: spread, ez: 2.0 * ke};
};
const VIEWS = SCRIPT.filter((e) => e.view).map((e) => [e.t, e.view]);
const blend = (a, b, k) => {
  const o = {};
  for (const key in b) o[key] = key === 'az' ? a.az + ((((b.az - a.az + 540) % 360) - 180) * k) : a[key] + (b[key] - a[key]) * k;
  const swing = Math.min(1, Math.abs(((b.az - a.az + 540) % 360) - 180) / 90);
  o.d += Math.max(0, Math.max(a.d, b.d) + 2 * swing - o.d) * Math.sin(Math.PI * k);
  return o;
};
export const camAt = (t, orbit, c) => {
  let i = 0;
  while (i < VIEWS.length - 1 && VIEWS[i + 1][0] <= t) i++;
  const cur = VIEW_FN[VIEWS[i][1]](t - VIEWS[i][0], c);
  let o = cur;
  if (i > 0) {
    const k = ss(VIEWS[i][0], VIEWS[i][0] + 1.6, t);
    if (k < 1) o = blend(VIEW_FN[VIEWS[i - 1][1]](t - VIEWS[i - 1][0], c), cur, k);
  }
  if (orbit > 0) o = {...o, az: o.az + 9 * Math.max(0, t - lastFlip('orbit', t)) * orbit};
  return o;
};
export const viewAt = (t) => VIEWS.filter(([a]) => a <= t).pop();

// ------------------------------------------------------------ the operator's pointer
const REST = [[860, 470], [760, 420], [940, 520], [820, 380]];
export function makeCursor(ui) {
  const EV = SCRIPT.filter((e) => e.t > 0).flatMap((e) => {
    const out = [];
    if (e.seq) out.push({t: e.t, spot: ui.spots[e.seq]});
    if (e.view) out.push({t: e.t + (e.seq ? 0.35 : 0), spot: ui.spots[e.view]});
    if (e.display) out.push({t: e.t, spot: ui.spots[e.display]});
    return out;
  });
  const WP = [[0, 900, 600]];
  EV.forEach((e, i) => {
    WP.push([e.t - 0.16, ...e.spot], [e.t + 0.22, ...e.spot]);
    WP.push([e.t + 1.4, ...REST[i % REST.length]]);
  });
  WP.sort((a, b) => a[0] - b[0]);
  return (t) => {
    let i = 0;
    while (i < WP.length - 2 && t > WP[i + 1][0]) i++;
    const [t0, x0, y0] = WP[i];
    const [t1, x1, y1] = WP[i + 1];
    const k = ss(t0, t1, t);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const bow = Math.sin(Math.PI * k) * Math.min(24, len * 0.07);
    let press = false;
    let ring = 0;
    let rx = 0;
    let ry = 0;
    for (const e of EV) {
      if (t >= e.t - 0.07 && t < e.t + 0.09) press = true;
      if (t >= e.t && t < e.t + 0.55) {
        ring = 1 - (t - e.t) / 0.55;
        [rx, ry] = e.spot;
      }
    }
    return {x: x0 + (x1 - x0) * k + (len ? (-(y1 - y0) / len) * bow : 0), y: y0 + (y1 - y0) * k + (len ? ((x1 - x0) / len) * bow : 0), press, ring, ringX: rx, ringY: ry};
  };
}

// ------------------------------------------------------------ the labels: anchors on the parts, stacked in two columns
const BOX = {x0: 330, x1: 1290, y0: 135, y1: 735};
export function makeLabels(st) {
  return (o) => {
    if (o < 0.02) return [];
    const pts = [];
    for (const a of st.plane.anchorsAt()) {
      const at = st.project(a.at);
      if (!at || at[0] < BOX.x0 || at[0] > BOX.x1 || at[1] < BOX.y0 || at[1] > BOX.y1) continue;
      // one label per spot: drop anchors that land on top of one already taken
      if (pts.some((p) => Math.hypot(p.at[0] - at[0], p.at[1] - at[1]) < 34)) continue;
      // and none on a part the camera cannot see
      if (!st.seen(a.at, a.gid)) continue;
      pts.push({a, at});
    }
    const L = pts.filter((x) => x.at[0] < 800).sort((a, b) => a.at[1] - b.at[1]);
    const R = pts.filter((x) => x.at[0] >= 800).sort((a, b) => a.at[1] - b.at[1]);
    const out = [];
    const stack = (col, x, w) => {
      let y = 150;
      for (const c of col.slice(0, 12)) {
        y = Math.max(y, Math.min(668, c.at[1] - 10));
        out.push({name: c.a.name, sub: c.a.sub, at: c.at, label: [x, y], w, o});
        y += 34;
      }
    };
    stack(L, 340, 186);
    stack(R, 1100, 186);
    return out;
  };
}

export function makeConsoleFrame(ui, st) {
  const labels = makeLabels(st);
  return (t, s) => {
    const S = SEQ[s.seq];
    ui.update({
      state: stateAt(s.mech, s.raw),
      mech: s.mech,
      raw: s.raw,
      hover: s.hover ?? null,
      seq: s.seq,
      prog: s.tau / S.dur,
      view: s.view,
      display: s.display,
      paused: s.paused ?? false,
      from: S.from,
      to: S.to,
      phase: s.phaseText ?? phaseAt(s.seq, s.tau),
      tau: s.tau,
      dur: S.dur,
      speed: s.speed ?? 1,
      speedK: s.speedK ?? 0.5,
      callouts: labels(s.labels),
      cursor: s.cursor,
    });
  };
}

export function makeFilm() {
  return async ({canvas, capture}) => {
    const st = createStage({canvas});
    const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    resize();
    const ui = createConsole(document.getElementById('app'));
    const cursorAt = makeCursor(ui);
    const frame = makeConsoleFrame(ui, st);
    window.CS = st;
    return {
      resize,
      render(t) {
        const {seq, tau} = seqAt(t);
        const m = mechAt(seq, tau);
        const disp = displayAt(t);
        const af = airframeState(m, {prop: propAt(t), xray: easedDisplay('xray', t)});
        const cam = camAt(t, disp.orbit, ctxAt(m));
        st.frame(af, {...cam, az: cam.az * D2R, el: cam.el * D2R});
        const [vt0, view] = viewAt(t);
        frame(t, {seq, tau, mech: m, raw: af.raw, view, display: disp, labels: easedDisplay('labels', t, 0.5) * ss(vt0 + 1.1, vt0 + 1.7, t), cursor: cursorAt(t)});
        return {};
      },
    };
  };
}

export const run = () => runSim(DEFAULTS, makeFilm());
