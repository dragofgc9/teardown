// Cessna 172S Skyhawk you can take apart. Click any part to pull it off (the order is real: the propeller before the
// cowling, the cowling before the engine); drag to orbit; the guided teardown walks the maintenance order. The engine,
// propeller and control surfaces run from the same state the parts are posed from. Left alone, the page tours itself.
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {buildAircraft, GROUPS} from '../c172-shared/aircraft.js';
import {INFO, ORDER} from '../c172-shared/info.js';
import {ENGINE, FACTS, powerAt} from '../c172-shared/spec.js';

const V3 = THREE.Vector3;
const BG = '#e9edf2';
const D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const SLOW = 12; // the engine is shown 12x slower than real so a firing order can be seen

const app = document.getElementById('app');
const canvas = document.createElement('canvas');
canvas.id = 'gl';
app.appendChild(canvas);

// ------------------------------------------------------------------ stage
const renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance'});
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 45, 110);
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.75;
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
const sun = new THREE.DirectionalLight('#fff4e6', 2.4);
sun.position.set(-7, 12, 6);
sun.castShadow = true;
Object.assign(sun.shadow.camera, {left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40});
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
sun.target.position.set(0, 1, -2.5);
scene.add(sun, sun.target, new THREE.HemisphereLight('#ffffff', '#c9d0d8', 0.5));

{
  // a soft studio floor that fades into the background, and a shadow catcher on it
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, '#f6f8fa');
  gr.addColorStop(0.55, '#eef1f5');
  gr.addColorStop(1, BG);
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshBasicMaterial({map: tex, toneMapped: false}));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.002;
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({color: '#3a4350', opacity: 0.22}));
  shade.rotation.x = -Math.PI / 2;
  shade.receiveShadow = true;
  scene.add(floor, shade);
}

const ac = buildAircraft();
scene.add(ac.root);
const parts = ac.parts;
const st = ac.state;
Object.assign(st, {rpm: 1100, roll: 0, pitch: 0, yaw: 0, flap: 0});

// ------------------------------------------------------------------ camera
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 1.2;
controls.maxDistance = 45;
const VIEWS = {
  hero: {t: [0, 1.15, -2.2], az: 38, el: 16, d: 20},
  side: {t: [0, 1.3, -2.3], az: 90, el: 3, d: 23},
  front: {t: [0, 1.3, -1], az: 0, el: 5, d: 19},
  top: {t: [0, 1, -2.4], az: 8, el: 84, d: 22},
  engine: {t: [0, 1.15, 0.7], az: 42, el: 12, d: 4.4},
  cabin: {t: [0, 1.3, -1.2], az: 72, el: 26, d: 5.2},
  tail: {t: [0, 1.7, -6], az: 145, el: 14, d: 7},
  gear: {t: [0, 0.5, -0.1], az: 55, el: 8, d: 7.5},
};
const place = (t, az, el, d) => {
  camera.position.set(t.x + d * Math.cos(el) * Math.sin(az), t.y + d * Math.sin(el), t.z + d * Math.cos(el) * Math.cos(az));
  controls.target.copy(t);
};
let tween = null;
const flyTo = (t, az, el, d, dur = 1.1) => {
  const off = camera.position.clone().sub(controls.target);
  const cur = {az: Math.atan2(off.x, off.z), el: Math.asin(off.y / off.length()), d: off.length()};
  const wrap = (a) => ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  tween = {t0: performance.now(), dur: dur * 1000, from: {t: controls.target.clone(), ...cur}, to: {t, az: cur.az + wrap(az - cur.az), el, d}};
};
const goView = (name, dur) => {
  const v = VIEWS[name];
  flyTo(new V3(...v.t), v.az * D2R, v.el * D2R, v.d, dur);
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === name));
};
const focusPart = (p) => {
  const b = new THREE.Box3().setFromObject(p.g);
  const c = b.getCenter(new V3());
  const size = b.getSize(new V3()).length();
  const off = camera.position.clone().sub(controls.target);
  const az = Math.atan2(off.x, off.z);
  flyTo(c, az, clamp(Math.asin(off.y / off.length()), 0.12, 0.7), clamp(size * 1.5 + 1.8, 3, 20), 0.9);
  document.querySelectorAll('[data-view]').forEach((b2) => b2.classList.remove('on'));
};
place(new V3(...VIEWS.hero.t), VIEWS.hero.az * D2R, VIEWS.hero.el * D2R, VIEWS.hero.d);

// ------------------------------------------------------------------ UI
const $ = (sel, root = document) => root.querySelector(sel);
const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
};
const ui = h(`<div class="ui">
  <div class="brand"><b>CESSNA 172S SKYHAWK</b><span>TEARDOWN · click any part to take it off</span></div>
  <aside class="list" id="list"></aside>
  <aside class="card" id="card"></aside>
  <aside class="ctl" id="ctl"></aside>
  <div class="toast" id="toast"></div>
  <div class="tip" id="tip"></div>
  <div class="bar" id="bar"></div>
  <button class="tour" id="tour"></button>
</div>`);
app.appendChild(ui);
const toast = $('#toast');
const tip = $('#tip');
let toastT = 0;
const say = (msg) => {
  toast.textContent = msg;
  toast.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => toast.classList.remove('on'), 2400);
};

// the parts list
const list = $('#list');
const rows = {};
for (const g of GROUPS) {
  list.appendChild(h(`<h4>${g}</h4>`));
  for (const p of ac.list.filter((q) => q.group === g)) {
    const r = h(`<button class="row"><i></i><span>${p.name}</span><em></em></button>`);
    r.addEventListener('click', () => {
      lastInput();
      pick(p, true);
      pull(p);
    });
    r.addEventListener('pointerenter', () => (hover = p));
    r.addEventListener('pointerleave', () => hover === p && (hover = null));
    list.appendChild(r);
    rows[p.id] = r;
  }
}

// the controls panel
const ctl = $('#ctl');
ctl.innerHTML = `<h4>Run it <span class="chip" title="The engine and propeller turn at one twelfth of real speed so the firing order can be followed">slow motion ×1/${SLOW}</span></h4>
<label class="sl"><span>Engine</span><input type="range" id="rpm" min="0" max="${ENGINE.rpmMax}" step="10" value="${st.rpm}"><b id="rpmv"></b></label>
<div class="cyl" id="cyl"></div>
<div class="kv" id="eng"></div>
<h4>Flaps</h4><div class="seg" id="flaps"></div>
<h4>Controls</h4>
<label class="sl"><span>Roll</span><input type="range" id="roll" min="-1" max="1" step="0.01" value="0"><b id="rollv"></b></label>
<label class="sl"><span>Pitch</span><input type="range" id="pitch" min="-1" max="1" step="0.01" value="0"><b id="pitchv"></b></label>
<label class="sl"><span>Rudder</span><input type="range" id="yaw" min="-1" max="1" step="0.01" value="0"><b id="yawv"></b></label>`;
const cylBox = $('#cyl');
for (const no of ENGINE.firing) cylBox.appendChild(h(`<i data-c="${no}">${no}</i>`));
$('#flaps').append(...[0, 10, 20, 30].map((f) => {
  const b = h(`<button data-flap="${f}">${f}°</button>`);
  b.addEventListener('click', () => {
    lastInput();
    st.flap = f;
    document.querySelectorAll('[data-flap]').forEach((x) => x.classList.toggle('on', Number(x.dataset.flap) === f));
  });
  return b;
}));
$('[data-flap="0"]').classList.add('on');
for (const k of ['rpm', 'roll', 'pitch', 'yaw']) {
  const el = $('#' + k);
  el.addEventListener('input', () => {
    lastInput();
    st[k] = Number(el.value);
  });
  if (k !== 'rpm') el.addEventListener('dblclick', () => ((el.value = 0), (st[k] = 0)));
}

// the toolbar
const bar = $('#bar');
bar.innerHTML = `<div class="grp">
  <button id="prev" title="Put the last part back">◀</button>
  <button id="next" class="go">Take apart ▶</button>
  <button id="all">Take it all apart</button>
  <button id="back">Put it back</button>
</div>
<div class="grp"><label class="sl ex"><span>Explode</span><input type="range" id="ex" min="0" max="1" step="0.005" value="0"></label>
<button id="xray" title="X">X-ray</button></div>
<div class="grp views">${Object.keys(VIEWS).map((v) => `<button data-view="${v}">${v}</button>`).join('')}</div>
<div class="count"><i id="cbar"></i><span id="cnum"></span></div>`;
$('#tour').addEventListener('click', () => (tour.on ? stopTour() : startTour()));

// ------------------------------------------------------------------ state of the teardown
const removable = ac.list.filter((p) => !p.fixed);
let sel = parts.spinner;
let hover = null;
const removedCount = () => removable.filter((p) => p.target === 1).length;
for (const p of ac.list) p.target = 0;
const blockers = (p) => p.needs.map((id) => parts[id]).filter((q) => q.target !== 1);
const dependents = (p) => ac.list.filter((q) => q.target === 1 && q.needs.includes(p.id));
const flash = (list2) => list2.forEach((q) => (q.flash = 1));
/** pull a part off, or put it back; false (with a message) when something is in the way */
function pull(p, quiet) {
  if (p.fixed) {
    if (!quiet) say('The fuselage is the datum: everything else bolts to it.');
    return false;
  }
  if (p.target === 0) {
    const b = blockers(p);
    if (b.length) {
      if (!quiet) say(`Take off the ${b.map((q) => q.name.toLowerCase()).join(' and the ')} first.`);
      flash(b);
      return false;
    }
    p.target = 1;
  } else {
    const d = dependents(p);
    if (d.length) {
      if (!quiet) say(`Put back the ${d.map((q) => q.name.toLowerCase()).join(' and the ')} first.`);
      flash(d);
      return false;
    }
    p.target = 0;
  }
  return true;
}
function pick(p, focus) {
  sel = p;
  if (focus) focusPart(p);
}
const nextPart = () => ORDER.map((id) => parts[id]).find((p) => p.target === 0 && !blockers(p).length);
const lastPart = () => [...ORDER].reverse().map((id) => parts[id]).find((p) => p.target === 1 && !dependents(p).length);
$('#next').addEventListener('click', () => {
  lastInput();
  const p = nextPart();
  if (!p) return say('That is everything. Press Put it back to rebuild it.');
  pull(p, true);
  pick(p, true);
});
$('#prev').addEventListener('click', () => {
  lastInput();
  const p = lastPart();
  if (!p) return;
  pull(p, true);
  pick(p, true);
});
let seq = null;
const run = (mode) => {
  lastInput();
  seq = {mode, t: 0};
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.remove('on'));
  if (mode === 'out') goView('hero', 1.2);
};
$('#all').addEventListener('click', () => run('out'));
$('#back').addEventListener('click', () => run('in'));
const xrayBtn = $('#xray');
let xrayOn = false;
const setXray = (on) => {
  xrayOn = on;
  ac.xray(on);
  xrayBtn.classList.toggle('on', on);
};
xrayBtn.addEventListener('click', () => (lastInput(), setXray(!xrayOn)));
$('#ex').addEventListener('input', (e) => ((st.explode = Number(e.target.value)), lastInput()));
bar.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => (lastInput(), goView(b.dataset.view))));

addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const k = e.key.toLowerCase();
  const views = Object.keys(VIEWS);
  if (/^[1-8]$/.test(k)) goView(views[Number(k) - 1]);
  else if (k === 'x') xrayBtn.click();
  else if (k === 'n' || k === 'arrowright') $('#next').click();
  else if (k === 'p' || k === 'arrowleft') $('#prev').click();
  else if (k === 'r') $('#back').click();
  else if (k === 'e') {
    st.explode = st.explode > 0.5 ? 0 : 1;
    $('#ex').value = st.explode;
  } else return;
  lastInput();
});

// ------------------------------------------------------------------ the tour: left alone, it takes itself apart
const tour = {on: false, t: 0, step: 0, phase: 'out'};
let idleAt = performance.now();
function lastInput() {
  idleAt = performance.now();
  if (tour.on) stopTour();
}
function startTour() {
  tour.on = true;
  tour.t = 0;
  tour.step = 0;
  tour.phase = 'out';
  seq = null;
  for (const p of removable) p.target = 0;
  goView('hero', 1.5);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.8;
  $('#tour').classList.add('on');
  $('#tour').innerHTML = '<i></i>AUTO TOUR · CLICK TO TAKE OVER';
}
function stopTour() {
  tour.on = false;
  controls.autoRotate = false;
  $('#tour').classList.remove('on');
  $('#tour').innerHTML = '▶ AUTO TOUR';
}
$('#tour').innerHTML = '▶ AUTO TOUR';
for (const ev of ['pointerdown', 'wheel', 'touchstart']) canvas.addEventListener(ev, () => lastInput(), {passive: true});

// ------------------------------------------------------------------ picking
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const meshes = [];
ac.root.traverse((o) => o.isMesh && o.userData.part && meshes.push(o));
let pointer = null;
let down = null;
const pickAt = (cx, cy) => {
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(meshes, false).find((i) => i.object.visible && !(i.object.material.transparent && i.object.material.opacity < 0.3 && i.object.material.depthWrite === false && !xrayOn && i.object.material.color.getHex() === 0x223445));
  return hit ? hit.object.userData.part : null;
};
canvas.addEventListener('pointermove', (e) => {
  pointer = {x: e.clientX, y: e.clientY};
  tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 16}px)`;
});
canvas.addEventListener('pointerleave', () => ((pointer = null), (hover = null)));
canvas.addEventListener('pointerdown', (e) => (down = {x: e.clientX, y: e.clientY}));
canvas.addEventListener('pointerup', (e) => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
  const p = pickAt(e.clientX, e.clientY);
  down = null;
  if (!p) return;
  pick(p, false);
  pull(p);
});

// ------------------------------------------------------------------ cards and readouts
let cardKey = '';
const specState = () => ({rpm: st.rpm, roll: st.roll, pitch: st.pitch, yaw: st.yaw, flap: st.flap});
const card = $('#card');
function drawCard() {
  const p = sel;
  const inf = INFO[p.id];
  const b = p.target === 0 ? blockers(p) : [];
  const d = p.target === 1 ? dependents(p) : [];
  const stateTxt = p.fixed ? 'FIXED DATUM' : p.target === 1 ? 'REMOVED' : 'INSTALLED';
  const spec = inf.specs(specState());
  const key = [p.id, p.target, b.length, d.length, JSON.stringify(spec)].join('|');
  if (key === cardKey) return;
  cardKey = key;
  card.innerHTML = `<div class="tag">${p.group.toUpperCase()} · <b class="${p.fixed ? 'fx' : p.target === 1 ? 'rm' : 'in'}">${stateTxt}</b></div>
  <h3>${p.name}</h3>
  <p>${inf.blurb}</p>
  <div class="how"><b>How it comes off</b>${inf.how}</div>
  <table>${spec.map(([k, v2]) => `<tr><td>${k}</td><td>${v2}</td></tr>`).join('')}</table>
  ${b.length ? `<div class="wait">Waiting on: ${b.map((q) => `<a data-go="${q.id}">${q.name}</a>`).join(', ')}</div>` : ''}
  ${d.length ? `<div class="wait">Holding it in: ${d.map((q) => `<a data-go="${q.id}">${q.name}</a>`).join(', ')}</div>` : ''}
  ${p.fixed ? '' : `<button class="act" id="act">${p.target === 1 ? 'Put it back' : 'Take it off'}</button>`}`;
  const act = $('#act', card);
  if (act) act.addEventListener('click', () => (lastInput(), pull(p)));
  card.querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', () => (lastInput(), pick(parts[a.dataset.go], true))));
}

// ------------------------------------------------------------------ frame
const resize = () => {
  const w = innerWidth;
  const hh = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(w, hh, false);
  camera.aspect = w / hh;
  // keep the aircraft clear of the side panels on wide screens: shift the view centre
  const wide = w > 1100;
  camera.setViewOffset(w, hh, wide ? -20 : 0, wide ? -10 : 0, w, hh);
  camera.updateProjectionMatrix();
};
addEventListener('resize', resize);
resize();

let last = performance.now();
let seqTimer = 0;
const eng = $('#eng');
const rpmv = $('#rpmv');
const live = {roll: $('#rollv'), pitch: $('#pitchv'), yaw: $('#yawv')};
const cylEls = [...cylBox.children];
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // the tour and the sequences
  if (!tour.on && now - idleAt > 14000) startTour();
  if (tour.on) {
    tour.t += dt;
    const gap = tour.phase === 'out' ? 0.9 : 0.4;
    if (tour.t > gap) {
      tour.t = 0;
      if (tour.phase === 'out') {
        const p = nextPart();
        if (p) {
          pull(p, true);
          pick(p, false);
        } else {
          tour.phase = 'hold';
          tour.t = -3.2;
          st.explode = 0;
        }
      } else if (tour.phase === 'hold') {
        tour.phase = 'in';
      } else {
        const p = lastPart();
        if (p) {
          pull(p, true);
          pick(p, false);
        } else {
          tour.phase = 'rest';
          tour.t = -2.5;
        }
      }
      if (tour.phase === 'rest' && tour.t >= 0) tour.phase = 'out';
    }
    if (tour.phase === 'rest') tour.phase = tour.t >= -0.01 ? 'out' : 'rest';
    // while the tour runs, the surfaces wave
    st.roll = Math.sin(now / 1400) * 0.6;
    st.pitch = Math.sin(now / 1900) * 0.5;
    st.yaw = Math.sin(now / 2300) * 0.5;
    for (const k of ['roll', 'pitch', 'yaw']) $('#' + k).value = st[k];
  }
  if (seq) {
    seq.t += dt;
    if (seq.t > (seq.mode === 'out' ? 0.42 : 0.3)) {
      seq.t = 0;
      const p = seq.mode === 'out' ? nextPart() : lastPart();
      if (!p) seq = null;
      else {
        pull(p, true);
        pick(p, false);
      }
    }
  }

  for (const p of ac.list) {
    p.p += clamp(p.target - p.p, -dt / 0.95, dt / 0.95);
    p.flash = Math.max(0, (p.flash || 0) - dt * 1.6);
    const goal = Math.max(hover === p ? 1 : 0, sel === p ? 0.5 : 0, p.flash ? Math.abs(Math.sin(p.flash * 9)) : 0);
    p.hl += (goal - p.hl) * Math.min(1, dt * 14);
  }
  st.prop += (st.rpm / 60) * Math.PI * 2 * dt / SLOW;
  st.crank = st.prop;
  ac.update(st);
  ac.paint();

  if (tween) {
    const k = clamp((performance.now() - tween.t0) / tween.dur, 0, 1);
    const e = k * k * (3 - 2 * k);
    const { from, to } = tween;
    const t = from.t.clone().lerp(to.t, e);
    place(t, from.az + (to.az - from.az) * e, from.el + (to.el - from.el) * e, from.d + (to.d - from.d) * e);
    if (k >= 1) tween = null;
  }
  controls.update();

  // hover
  if (pointer && !down) {
    const p = pickAt(pointer.x, pointer.y);
    hover = p;
    canvas.style.cursor = p ? 'pointer' : 'grab';
    tip.textContent = p ? p.name : '';
    tip.classList.toggle('on', !!p);
  } else if (!pointer) tip.classList.remove('on');

  renderer.render(scene, camera);

  // panels
  drawCard();
  const out = removedCount();
  $('#cbar').style.width = `${(out / removable.length) * 100}%`;
  $('#cnum').textContent = `${out} / ${removable.length} parts removed`;
  for (const p of ac.list) {
    const r = rows[p.id];
    const blocked = p.target === 0 ? blockers(p).length > 0 : dependents(p).length > 0;
    r.classList.toggle('out', p.target === 1);
    r.classList.toggle('sel', sel === p);
    r.classList.toggle('lock', blocked && !p.fixed);
    r.classList.toggle('fix', !!p.fixed);
  }
  rpmv.textContent = `${Math.round(st.rpm)} rpm`;
  eng.innerHTML = `<span>Power</span><b>${Math.round(powerAt(st.rpm))} hp</b><span>Crank</span><b>${Math.round(((st.crank / D2R) % 720 + 720) % 720)}°</b>`;
  const ph = ((st.crank % (Math.PI * 4)) + Math.PI * 4) % (Math.PI * 4);
  ENGINE.firing.forEach((no, i) => {
    const q = ((ph - i * Math.PI + Math.PI * 4) % (Math.PI * 4)) / Math.PI;
    cylEls[i].style.setProperty('--g', st.rpm > 0 && q < 1 ? (1 - q * 0.85).toFixed(2) : '0');
  });
  live.roll.textContent = st.roll === 0 ? '0°' : st.roll > 0 ? `R aileron ${Math.round(st.roll * 20)}° up` : `L aileron ${Math.round(-st.roll * 20)}° up`;
  live.pitch.textContent = st.pitch === 0 ? '0°' : st.pitch > 0 ? `${Math.round(st.pitch * 28)}° up` : `${Math.round(-st.pitch * 23)}° down`;
  live.yaw.textContent = `${Math.round(st.yaw