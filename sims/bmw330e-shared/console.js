// The 330e's overlay: fixed 1600 x 900 layout. Left: the eight systems (focus, hide) and the take-apart controls.
// Right: speed, drive mode, the power flow, charge, history chart and the gearbox. Bottom: the selected part's card.
// update(s) redraws every live number from the frame's state; the handlers come in through `api`.
import {SYSTEMS} from './car.js';
import {BAT, ELEMENTS, MODES, MODE_NAME} from './drive.js';

export const K = {ink: '#16181b', mute: '#8b8f95', faint: '#c9ccd0', line: '#e1e3e6', panel: 'rgba(249,249,250,.95)', blue: '#1c69d4', hv: '#ff7a1a', green: '#17a56b', red: '#d6182b', grey: '#6a727b'};
export const SYS_COLOR = {body: '#2d4f7c', cabin: '#7a7f86', engine: '#8a9199', edrive: '#1c69d4', hv: '#ff7a1a', fuel: '#d9a21a', driveline: '#5b6470', chassis: '#3b4046'};
export const CAMS = ['hero', 'front', 'side', 'top', 'rear', 'under'];
export const PLAYS = [1 / 60, 1 / 30, 1 / 15, 1 / 8, 1 / 4, 1];
export const playText = (p) => (p >= 1 ? 'REAL TIME' : `1/${Math.round(1 / p)} SPEED`);
export const SPEED_MAX = 200;

const CSS = `
#app{font-family:Inter,system-ui,sans-serif;color:${K.ink};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.ui{position:absolute;inset:0;pointer-events:none}
.pn{position:absolute;background:${K.panel};border:1px solid ${K.line};box-shadow:0 1px 2px rgba(20,22,26,.04);pointer-events:auto}
.cap{font-size:10px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;white-space:nowrap;color:${K.mute}}
.row{display:flex;align-items:center}
.btn{display:flex;align-items:center;justify-content:center;height:26px;padding:0 9px;font-size:9.6px;font-weight:600;letter-spacing:.9px;text-transform:uppercase;border:1px solid ${K.line};background:#fff;color:${K.ink};white-space:nowrap;cursor:pointer;user-select:none;pointer-events:auto}
.btn:hover{background:#f3f4f5}
.btn.on{background:${K.ink};color:#fff;border-color:${K.ink}}
.btn.blue.on{background:${K.blue};border-color:${K.blue}}
.btn.hv.on{background:${K.hv};border-color:${K.hv};color:#16181b}
.sys{display:flex;align-items:center;height:36px;padding:0 10px 0 0;border-top:1px solid ${K.line};cursor:pointer;pointer-events:auto}
.sys:first-child{border-top:0}
.sys:hover{background:#f1f2f3}
.sys.on{background:#eef3fb}
.sys .bar{width:4px;align-self:stretch;margin-right:10px}
.sys b{font-size:11px;font-weight:600;letter-spacing:.9px;flex:1}
.sys small{font-size:9px;color:${K.mute};letter-spacing:.8px;margin-right:10px}
.eye{width:16px;height:16px;border:1.5px solid ${K.ink};border-radius:50%;position:relative;cursor:pointer}
.eye.on::after{content:'';position:absolute;inset:3px;border-radius:50%;background:${K.ink}}
.sl{position:relative;height:22px;cursor:ew-resize;touch-action:none}
.sl i{position:absolute;left:0;right:0;top:10px;height:2px;background:${K.faint}}
.sl u{position:absolute;left:0;top:10px;height:2px;background:${K.ink};text-decoration:none}
.sl s{position:absolute;top:4px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:#fff;border:2px solid ${K.ink};box-sizing:border-box}
.big{font-size:54px;font-weight:600;letter-spacing:-1.5px;line-height:1}
.unit{font-size:12px;font-weight:600;letter-spacing:1.2px;color:${K.mute}}
.val{font-size:13px;font-weight:600}
.mono{font-family:'JetBrains Mono',monospace}
.fl{display:flex;align-items:center;gap:8px;height:21px}
.fl .n{width:62px;font-size:9.6px;font-weight:600;letter-spacing:1.2px;color:${K.mute}}
.fl .t{position:relative;flex:1;height:8px;background:#eceef0}
.fl .t i{position:absolute;top:0;bottom:0}
.fl .t em{position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:${K.faint}}
.fl .v{width:62px;text-align:right;font-size:12px;font-weight:600}
.gear{display:flex;gap:3px}
.gear div{flex:1;height:26px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;background:#eceef0;color:${K.mute}}
.gear div.on{background:${K.blue};color:#fff}
.els{display:flex;gap:8px;align-items:center}
.els div{width:24px;height:24px;border-radius:50%;border:1.5px solid ${K.faint};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;color:${K.mute}}
.els div.on{background:${K.blue};border-color:${K.blue};color:#fff}
.hint{font-size:10px;letter-spacing:1.1px;color:${K.mute};text-transform:uppercase}
.tag{display:inline-block;padding:2px 7px;font-size:8.8px;font-weight:600;letter-spacing:1.1px;text-transform:uppercase;color:#fff}
.tip{position:absolute;pointer-events:none;padding:4px 8px;background:${K.ink};color:#fff;font-size:11px;font-weight:600;letter-spacing:.3px;white-space:nowrap;transform:translate(14px,-130%)}
.lead{position:absolute;pointer-events:none}
`;

const el = (tag, cls, parent, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
};
const fmt = (x, d = 0) => (Math.abs(x) < 0.5 * 10 ** -d ? 0 : x).toFixed(d);

export function createConsole(app, api) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = el('div', 'ui', app);
  const U = {root, btn: {}, spots: {}};
  const pos = (e, x, y, w, h) => Object.assign(e.style, {position: 'absolute', left: x + 'px', top: y + 'px', ...(w ? {width: w + 'px'} : {}), ...(h ? {height: h + 'px'} : {})});
  const panel = (x, y, w, h) => {
    const p = el('div', 'pn', root);
    pos(p, x, y, w, h);
    return p;
  };

  // ------------------------------------------------------------ title
  const title = el('div', '', root);
  title.style.cssText = 'position:absolute;left:24px;top:22px;pointer-events:none';
  title.innerHTML = `<div style="font-size:30px;font-weight:600;letter-spacing:-.6px">BMW 330e</div>
    <div class="cap" style="margin-top:4px">F30 · 2017 · iPerformance plug-in hybrid</div>`;

  // ------------------------------------------------------------ systems
  const sp = panel(24, 96, 268, 36 * SYSTEMS.length + 30);
  el('div', 'cap', sp, 'Systems').style.cssText = 'height:30px;line-height:30px;padding-left:14px;border-bottom:1px solid ' + K.line;
  const sysBox = el('div', '', sp);
  U.sys = {};
  for (const s of SYSTEMS) {
    const r = el('div', 'sys', sysBox, `<span class="bar" style="background:${SYS_COLOR[s.id]}"></span><b>${s.name}</b><small></small>`);
    const eye = el('div', 'eye on', r);
    r.addEventListener('click', (e) => {
      if (e.target === eye) return;
      api.onSystem(s.id);
    });
    eye.addEventListener('click', (e) => {
      e.stopPropagation();
      api.onEye(s.id);
    });
    U.sys[s.id] = {row: r, eye, count: r.querySelector('small')};
  }

  // ------------------------------------------------------------ take apart
  const tp = panel(24, 96 + 36 * SYSTEMS.length + 30 + 12, 268, 178);
  el('div', 'cap', tp, 'Take apart').style.cssText = 'position:absolute;left:14px;top:9px';
  const exLab = el('div', 'cap', tp, 'Explode');
  pos(exLab, 14, 34);
  const exVal = el('div', 'val', tp, '0%');
  pos(exVal, 218, 31);
  exVal.style.cssText += ';width:36px;text-align:right;position:absolute';
  U.explodeSlider = slider(tp, 14, 50, 240, api.onExplode);
  const bm = el('div', 'row', tp);
  pos(bm, 14, 84);
  bm.style.cssText += ';position:absolute;gap:4px';
  for (const m of ['solid', 'ghost', 'hidden']) {
    const b = el('div', 'btn', bm, 'Body ' + m);
    b.style.width = '77px';
    b.style.padding = '0';
    b.addEventListener('click', () => api.onBody(m));
    U.btn['body-' + m] = b;
  }
  const dz = el('div', 'btn blue', tp, 'Disassemble');
  pos(dz, 14, 120, 118);
  dz.addEventListener('click', () => api.onDisassemble());
  const rz = el('div', 'btn', tp, 'Put it back');
  pos(rz, 136, 120, 118);
  rz.addEventListener('click', () => api.onReassemble());
  U.btn.disassemble = dz;
  U.btn.reassemble = rz;
  const pbLab = el('div', 'cap', tp, 'Motion');
  pos(pbLab, 14, 157);
  const pbVal = el('div', 'val', tp, '');
  pbVal.style.cssText = 'position:absolute;right:14px;top:153px;font-size:11px';
  U.playVal = pbVal;

  // ------------------------------------------------------------ camera
  const cr = panel(330, 22, 940, 36);
  cr.style.background = 'transparent';
  cr.style.border = '0';
  cr.style.boxShadow = 'none';
  cr.style.pointerEvents = 'none';
  const cams = el('div', 'row', cr);
  cams.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);gap:4px;top:0';
  for (const c of CAMS) {
    const b = el('div', 'btn', cams, c);
    b.style.width = '70px';
    b.style.padding = '0';
    b.addEventListener('click', () => api.onCam(c));
    U.btn['cam-' + c] = b;
  }

  // ------------------------------------------------------------ right column: drive
  const X = 1306;
  const W = 270;
  const dp = panel(X, 22, W, 176);
  el('div', 'cap', dp, 'Drive').style.cssText = 'position:absolute;left:14px;top:9px';
  const spd = el('div', 'big mono', dp, '0');
  spd.style.cssText += ';position:absolute;left:14px;top:34px';
  U.spd = spd;
  const kmh = el('div', 'unit', dp, 'km/h');
  kmh.style.cssText = 'position:absolute;left:14px;top:92px';
  U.mph = el('div', 'unit', dp, '');
  U.mph.style.cssText = 'position:absolute;left:68px;top:92px';
  U.gearBig = el('div', 'val mono', dp, 'P');
  U.gearBig.style.cssText = 'position:absolute;right:14px;top:34px;font-size:30px;text-align:right';
  U.rpm = el('div', 'unit', dp, '');
  U.rpm.style.cssText = 'position:absolute;right:14px;top:74px;text-align:right';
  U.modeNow = el('div', 'cap', dp, '');
  U.modeNow.style.cssText = 'position:absolute;left:14px;top:118px;color:' + K.ink;
  U.state = el('div', 'cap', dp, '');
  U.state.style.cssText = 'position:absolute;right:14px;top:118px;text-align:right';
  const tl = el('div', 'cap', dp, 'Target speed');
  tl.style.cssText = 'position:absolute;left:14px;top:142px';
  U.tgtVal = el('div', 'val', dp, '');
  U.tgtVal.style.cssText = 'position:absolute;right:14px;top:139px;font-size:11px';
  U.targetSlider = slider(dp, 14, 154, 242, api.onTarget);
  U.targetSlider.root.style.top = '154px';

  const mp = panel(X, 210, W, 120);
  el('div', 'cap', mp, 'Drive mode').style.cssText = 'position:absolute;left:14px;top:9px';
  MODES.forEach((m, i) => {
    const b = el('div', 'btn blue', mp, MODE_NAME[m]);
    pos(b, 14 + (i % 2) * 124, 30 + Math.floor(i / 2) * 30, 118);
    b.addEventListener('click', () => api.onMode(m));
    U.btn['mode-' + m] = b;
  });
  const kd = el('div', 'btn', mp, 'Kick-down (hold)');
  pos(kd, 14, 90, 118);
  kd.addEventListener('pointerdown', () => api.onKick(true));
  addEventListener('pointerup', () => api.onKick(false));
  U.btn.kick = kd;
  const pg = el('div', 'btn hv', mp, 'Plug in');
  pos(pg, 138, 90, 118);
  pg.addEventListener('click', () => api.onPlug());
  U.btn.plug = pg;

  // power flow
  const fp = panel(X, 342, W, 226);
  el('div', 'cap', fp, 'Power flow').style.cssText = 'position:absolute;left:14px;top:9px';
  const rows = [['engine', 'Engine', K.grey], ['motor', 'e-motor', K.blue], ['battery', 'Battery', K.hv], ['wheels', 'Wheels', K.ink]];
  U.flow = {};
  rows.forEach(([k, name, col], i) => {
    const r = el('div', 'fl', fp, `<span class="n">${name}</span><span class="t"><em></em><i style="background:${col}"></i></span><span class="v mono"></span>`);
    pos(r, 14, 30 + i * 22, W - 28);
    U.flow[k] = {bar: r.querySelector('i'), v: r.querySelector('.v')};
  });
  U.soc = el('div', '', fp);
  pos(U.soc, 14, 124, W - 28);
  U.soc.innerHTML = `<div class="row" style="justify-content:space-between"><span class="cap">Charge</span><span class="val mono" data-k="soc"></span></div>
    <div style="position:relative;height:10px;background:#eceef0;margin-top:5px"><i data-k="socbar" style="position:absolute;left:0;top:0;bottom:0;background:${K.green}"></i></div>
    <div class="row" style="justify-content:space-between;margin-top:6px"><span class="hint" data-k="kwh"></span><span class="hint" data-k="volt"></span></div>`;
  U.socV = U.soc.querySelector('[data-k=soc]');
  U.socBar = U.soc.querySelector('[data-k=socbar]');
  U.socKwh = U.soc.querySelector('[data-k=kwh]');
  U.socVolt = U.soc.querySelector('[data-k=volt]');
  U.eco = el('div', '', fp);
  pos(U.eco, 14, 184, W - 28);
  U.eco.innerHTML = `<div class="row" style="justify-content:space-between"><span class="cap">Fuel</span><span class="val mono" data-k="fuel"></span></div>
    <div class="row" style="justify-content:space-between;margin-top:4px"><span class="cap">Trip</span><span class="val mono" data-k="trip" style="font-size:11px"></span></div>`;
  U.fuel = U.eco.querySelector('[data-k=fuel]');
  U.trip = U.eco.querySelector('[data-k=trip]');

  // history
  const hp = panel(X, 580, W, 126);
  el('div', 'cap', hp, 'Last 30 s').style.cssText = 'position:absolute;left:14px;top:9px';
  hp.insertAdjacentHTML('beforeend', `<div class="row cap" style="position:absolute;right:14px;top:9px;gap:9px"><span style="color:${K.grey}">● ENG</span><span style="color:${K.blue}">● MOT</span><span style="color:${K.hv}">● BAT</span></div>`);
  U.chart = el('canvas', '', hp);
  U.chart.width = (W - 28) * 2;
  U.chart.height = 80 * 2;
  U.chart.style.cssText = `position:absolute;left:14px;top:32px;width:${W - 28}px;height:80px`;

  // gearbox
  const gp = panel(X, 718, W, 160);
  el('div', 'cap', gp, '8-speed gearbox').style.cssText = 'position:absolute;left:14px;top:9px';
  U.ratio = el('div', 'cap', gp, '');
  U.ratio.style.cssText = 'position:absolute;right:14px;top:9px;color:' + K.ink;
  const gr = el('div', 'gear', gp);
  pos(gr, 14, 30, W - 28);
  U.gears = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => el('div', '', gr, n));
  el('div', 'cap', gp, 'Shift elements engaged').style.cssText = 'position:absolute;left:14px;top:72px';
  const er = el('div', 'els', gp);
  pos(er, 14, 94);
  U.els = ELEMENTS.map((n) => el('div', '', er, n));
  U.elNote = el('div', 'hint', gp, '');
  U.elNote.style.cssText = 'position:absolute;left:14px;top:128px;right:14px;line-height:1.4;text-transform:none;letter-spacing:.2px;font-size:10px';

  // ------------------------------------------------------------ part card (bottom centre)
  const card = panel(330, 782, 940, 96);
  U.card = card;
  U.cardTag = el('span', 'tag', card, '');
  U.cardTag.style.cssText = 'position:absolute;left:16px;top:14px';
  U.cardName = el('div', '', card, '');
  U.cardName.style.cssText = 'position:absolute;left:16px;top:36px;font-size:20px;font-weight:600;letter-spacing:-.2px';
  U.cardInfo = el('div', '', card, '');
  U.cardInfo.style.cssText = 'position:absolute;left:330px;top:14px;width:430px;font-size:12.5px;line-height:1.5;color:#3b4046';
  U.cardBtn = el('div', 'btn', card, 'Remove');
  pos(U.cardBtn, 790, 14, 134);
  U.cardBtn.addEventListener('click', () => api.onCardRemove());
  U.cardHide = el('div', 'btn', card, 'Deselect');
  pos(U.cardHide, 790, 50, 134);
  U.cardHide.addEventListener('click', () => api.onDeselect());
  U.cardCount = el('div', 'hint', card, '');
  U.cardCount.style.cssText = 'position:absolute;left:16px;top:66px;text-transform:none;letter-spacing:.3px;font-size:11px';

  U.tip = el('div', 'tip', root, '');
  U.tip.style.display = 'none';
  U.tourChip = null;

  function slider(parent, x, y, w, onChange) {
    const r = el('div', 'sl', parent);
    r.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px`;
    const track = el('i', '', r);
    const fill = el('u', '', r);
    const knob = el('s', '', r);
    const set = (k) => {
      fill.style.width = k * w + 'px';
      knob.style.left = k * w + 'px';
    };
    set(0);
    let down = false;
    const move = (e) => {
      const b = r.getBoundingClientRect();
      const sc = b.width / w;
      onChange(Math.min(1, Math.max(0, (e.clientX - b.left) / sc / w)));
    };
    r.addEventListener('pointerdown', (e) => {
      down = true;
      r.setPointerCapture(e.pointerId);
      move(e);
    });
    r.addEventListener('pointermove', (e) => down && move(e));
    r.addEventListener('pointerup', () => (down = false));
    void track;
    return {root: r, set};
  }

  // ------------------------------------------------------------ update
  const chart = U.chart.getContext('2d');
  const drawChart = (h) => {
    const w = U.chart.width;
    const ht = U.chart.height;
    chart.clearRect(0, 0, w, ht);
    const lo = -80;
    const hi = 150;
    const Y = (v) => ht - ((v - lo) / (hi - lo)) * ht;
    chart.strokeStyle = K.faint;
    chart.lineWidth = 1;
    chart.beginPath();
    chart.moveTo(0, Y(0));
    chart.lineTo(w, Y(0));
    chart.stroke();
    const n = h.n;
    const line = (arr, col, fill) => {
      chart.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / (h.len - 1)) * w;
        const y = Y(arr[(h.i + i) % h.len]);
        i ? chart.lineTo(x, y) : chart.moveTo(x, y);
      }
      chart.strokeStyle = col;
      chart.lineWidth = 3;
      chart.stroke();
      if (fill) {
        chart.lineTo(((n - 1) / (h.len - 1)) * w, Y(0));
        chart.lineTo(0, Y(0));
        chart.fillStyle = fill;
        chart.fill();
      }
    };
    line(h.pe, K.grey, 'rgba(106,114,123,.12)');
    line(h.pm, K.blue, 'rgba(28,105,212,.10)');
    line(h.pb, K.hv, null);
  };
  const setBar = (b, v, max) => {
    const k = Math.min(1, Math.abs(v) / max);
    b.style.left = (v >= 0 ? 50 : 50 - k * 50) + '%';
    b.style.width = k * 50 + '%';
  };
  const last = {};
  const txt = (key, node, s) => {
    if (last[key] !== s) {
      last[key] = s;
      node.textContent = s;
    }
  };
  U.update = (s) => {
    const o = s.o;
    txt('spd', U.spd, fmt(o.kmh));
    txt('mph', U.mph, `${fmt(o.mph)} mph`);
    txt('gear', U.gearBig, o.v < 0.05 && o.rpm < 1 ? 'P' : 'D' + o.gear);
    txt('rpm', U.rpm, o.engOn ? `${fmt(o.rpm, 0)} rpm` : 'ENGINE OFF');
    txt('mode', U.modeNow, MODE_NAME[o.mode]);
    const st = o.plugged ? 'CHARGING' : o.regen ? 'RECUPERATING' : o.brake > 0.02 ? 'BRAKING' : o.engOn ? (o.Tm > 5 ? 'HYBRID BOOST' : 'ENGINE') : o.v > 0.1 ? 'ELECTRIC' : 'READY';
    txt('state', U.state, st);
    U.state.style.color = o.plugged ? K.green : o.regen ? K.green : o.engOn ? K.ink : K.blue;
    txt('tgt', U.tgtVal, `${fmt(s.target)} km/h`);
    U.targetSlider.set(s.target / SPEED_MAX);
    U.explodeSlider.set(s.explode);
    txt('ex', exVal_(), `${Math.round(s.explode * 100)}%`);
    txt('play', U.playVal, playText(s.play));
    for (const m of MODES) U.btn['mode-' + m].classList.toggle('on', o.mode === m);
    U.btn.plug.classList.toggle('on', s.plug);
    U.btn.kick.classList.toggle('on', s.kick);
    for (const m of ['solid', 'ghost', 'hidden']) U.btn['body-' + m].classList.toggle('on', s.bodyMode === m);
    for (const c of CAMS) U.btn['cam-' + c].classList.toggle('on', s.cam === c);
    for (const sy of SYSTEMS) {
      const u = U.sys[sy.id];
      u.row.classList.toggle('on', s.focus === sy.id);
      u.eye.classList.toggle('on', !s.hidden.has(sy.id));
      const n = s.counts[sy.id];
      txt('c' + sy.id, u.count, n.out ? `${n.out}/${n.all}` : `${n.all}`);
      u.count.style.color = n.out ? K.blue : K.mute;
    }
    // flow
    const kW = (w) => w / 1000;
    const wheels = o.Pwheel;
    const fl = U.flow;
    setBar(fl.engine.bar, kW(o.Pe), 140);
    setBar(fl.motor.bar, kW(o.Pm), 70);
    setBar(fl.battery.bar, kW(o.Pbat), 70);
    setBar(fl.wheels.bar, kW(wheels), 140);
    txt('fe', fl.engine.v, `${fmt(kW(o.Pe), 1)} kW`);
    txt('fm', fl.motor.v, `${fmt(kW(o.Pm), 1)} kW`);
    txt('fb', fl.battery.v, `${fmt(kW(o.Pbat), 1)} kW`);
    txt('fw', fl.wheels.v, `${fmt(kW(wheels), 1)} kW`);
    const kwh = o.soc * BAT.net;
    txt('soc', U.socV, `${fmt(o.soc * 100, 0)} %`);
    U.socBar.style.width = o.soc * 100 + '%';
    U.socBar.style.background = o.soc < 0.2 ? K.red : K.green;
    txt('kwh', U.socKwh, `${kwh.toFixed(1)} of ${BAT.net} kWh`);
    txt('volt', U.socVolt, `${fmt(o.Vbat)} V · ${fmt(o.Ibat)} A`);
    txt('fuel', U.fuel, o.engOn && o.Lph > 0.05 ? `${o.Lph.toFixed(1)} L/h${o.L100 ? ' · ' + o.L100.toFixed(1) + ' L/100' : ''}` : 'cut');
    const km = o.kmEV + o.kmICE;
    txt('trip', U.trip, `${km.toFixed(2)} km · ${km > 0.01 ? Math.round((o.kmEV / km) * 100) : 0}% electric · ${o.fuelL.toFixed(2)} L`);
    // gearbox
    U.gears.forEach((g, i) => g.classList.toggle('on', i + 1 === o.gear));
    U.els.forEach((e, i) => e.classList.toggle('on', o.elements[i]));
    txt('ratio', U.ratio, `GEAR ${o.gear} · ${(o.ratio / 3.154).toFixed(3)}:1`);
    txt('elnote', U.elNote, `Gear ${o.gear} holds ${ELEMENTS.filter((_, i) => o.elements[i]).join(' + ')}. Shifting swaps exactly one.`);
    drawChart(s.hist);
    // card
    const p = s.part;
    if (p) {
      U.card.style.display = '';
      const sy = SYSTEMS.find((q) => q.id === p.system);
      txt('cardTag', U.cardTag, sy.name);
      U.cardTag.style.background = SYS_COLOR[p.system];
      txt('cardName', U.cardName, p.name);
      txt('cardInfo', U.cardInfo, p.info);
      U.cardBtn.style.display = p.ex.lengthSq() > 1e-4 ? '' : 'none';
      txt('cardBtn', U.cardBtn, p.pullT > 0.5 ? 'Put back' : 'Pull out');
      U.cardBtn.classList.toggle('on', p.pullT > 0.5);
      txt('cardCount', U.cardCount, s.outCount ? `${s.outCount} of ${s.partCount} parts pulled out` : 'Click it again, or press Esc, to let go');
    } else {
      U.card.style.display = 'none';
    }
    // hover tip
    if (s.tip) {
      U.tip.style.display = '';
      U.tip.style.left = s.tip.x + 'px';
      U.tip.style.top = s.tip.y + 'px';
      txt('tip', U.tip, s.tip.name);
    } else U.tip.style.display = 'none';
  };
  const exValNode = exVal;
  function exVal_() {
    return exValNode;
  }
  return U;
}
