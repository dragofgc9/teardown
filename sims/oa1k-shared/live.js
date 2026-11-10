// The OA-1K as a page you drive with a thumb: orbit, pinch, tap a part, pull the aircraft apart with one slider,
// sit in either seat and look around. Built phone first; the same layout widens on a desktop.
import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {buildAircraft, DIM, SPEC} from './airframe.js';

const $ = (sel, el = document) => el.querySelector(sel);
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const VIEWS = [
  {id: 'hero', name: 'Three-quarter', th: -0.72, ph: 1.2, k: 1, tgt: [5.0, 2.0, 0]},
  {id: 'side', name: 'Side', th: 0, ph: 1.5, k: 0.95, tgt: [5.3, 2.0, 0]},
  {id: 'front', name: 'Nose on', th: -Math.PI / 2, ph: 1.45, k: 1, tgt: [4.2, 2.0, 0]},
  {id: 'top', name: 'Plan', th: -0.001, ph: 0.06, k: 1.1, tgt: [5.0, 2.0, 0]},
  {id: 'rear', name: 'Rear quarter', th: 0.95, ph: 1.15, k: 1, tgt: [5.4, 2.0, 0]},
  {id: 'under', name: 'Stores, from below', th: -0.6, ph: 1.86, k: 0.62, tgt: [4.2, 1.6, 0]},
  {id: 'engine', name: 'Engine bay', th: -1.0, ph: 1.3, k: 0.3, tgt: [1.6, 2.4, 0]},
  {id: 'cabin', name: 'Cockpit, outside', th: -0.35, ph: 1.1, k: 0.33, tgt: [6.0, 2.7, 0]},
];
const SEATS = {front: {eye: [5.9, 3.02, 0], name: 'Pilot seat'}, rear: {eye: [6.84, 3.0, 0], name: 'Rear seat'}};

export function runLive(mount = document.body) {
  const el = document.createElement('div');
  el.id = 'oa';
  el.innerHTML = `
    <canvas id="oa-gl" aria-label="3D model of the OA-1K Skyraider II. Drag to orbit, pinch to zoom, tap a part."></canvas>
    <header class="oa-head">
      <div class="oa-title"><span class="oa-flag">OA-1K</span><h1>Skyraider II</h1></div>
      <p class="oa-sub">AT-802U &middot; to Air Tractor's drawings</p>
    </header>
    <button class="oa-btn oa-spec-btn" id="oa-spec-btn" type="button">Data plate</button>
    <div class="oa-hint" id="oa-hint">Drag to turn &middot; pinch to zoom &middot; tap a part</div>
    <div class="oa-seatbar" id="oa-seatbar" hidden>
      <span id="oa-seatname">Pilot seat</span>
      <button class="oa-btn" id="oa-seat-swap" type="button">Other seat</button>
      <button class="oa-btn oa-on" id="oa-seat-exit" type="button">Step out</button>
    </div>
    <section class="oa-card" id="oa-card" hidden aria-live="polite">
      <div class="oa-card-top"><div><p class="oa-sys" id="oa-card-sys"></p><h2 id="oa-card-name"></h2></div><button class="oa-x" id="oa-card-x" type="button" aria-label="Close">&times;</button></div>
      <ul id="oa-card-facts"></ul>
      <div class="oa-row">
        <button class="oa-btn" id="oa-iso" type="button">Isolate</button>
        <button class="oa-btn" id="oa-hide" type="button">Remove</button>
        <button class="oa-btn" id="oa-zoom" type="button">Zoom to it</button>
      </div>
    </section>
    <section class="oa-sheet" id="oa-sheet" hidden>
      <div class="oa-sheet-top"><h2 id="oa-sheet-title"></h2><button class="oa-x" id="oa-sheet-x" type="button" aria-label="Close">&times;</button></div>
      <div class="oa-sheet-body" id="oa-sheet-body"></div>
    </section>
    <nav class="oa-dock" id="oa-dock">
      <label class="oa-slide" for="oa-explode"><span>Take apart</span><input id="oa-explode" type="range" min="0" max="100" value="0" step="1"><output id="oa-explode-out">0%</output></label>
      <div class="oa-chips">
        <button class="oa-btn" id="oa-parts" type="button">Parts</button>
        <button class="oa-btn" id="oa-views" type="button">Views</button>
        <button class="oa-btn" id="oa-sit" type="button">Sit inside</button>
        <button class="oa-btn" id="oa-doors" type="button" aria-pressed="false">Doors</button>
        <button class="oa-btn" id="oa-prop" type="button" aria-pressed="false">Prop</button>
        <button class="oa-btn" id="oa-xray" type="button" aria-pressed="false">X-ray</button>
        <button class="oa-btn" id="oa-reset" type="button">Reset</button>
      </div>
    </nav>`;
  mount.appendChild(el);
  const canvas = $('#oa-gl', el);

  // ---------- stage ----------
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({canvas, antialias: true, powerPreference: 'high-performance'});
  } catch (e) {
    $('#oa-hint', el).textContent = 'This device could not start WebGL, so the 3D model cannot be shown.';
    return;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.75;
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 400);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f94, 0.55);
  const sun = new THREE.DirectionalLight(0xffffff, 2.3);
  sun.position.set(-8, 22, 12);
  sun.castShadow = true;
  const coarse = matchMedia('(pointer: coarse)').matches;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  Object.assign(sun.shadow.camera, {left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 60});
  sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.09;
  sun.target.position.set(5, 0, 0);
  scene.add(hemi, sun, sun.target);

  const groundMat = new THREE.MeshStandardMaterial({color: 0xd9dde0, roughness: 0.95, metalness: 0});
  const ground = new THREE.Mesh(new THREE.CircleGeometry(120, 64), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  scene.add(ground);
  // ramp markings: a taxi line and tie-down rings, so the floor reads as a ramp and gives scale
  const lineMat = new THREE.MeshBasicMaterial({color: 0xe0b21a});
  const line = new THREE.Mesh(new THREE.PlaneGeometry(60, 0.1), lineMat);
  line.rotation.x = -Math.PI / 2; line.position.set(5, 0.004, 0);
  scene.add(line);

  const {root, parts, byId} = buildAircraft();
  scene.add(root);
  const pickables = [];
  for (const p of parts) for (const m of p.meshes) pickables.push(m);
  for (const p of parts) for (const m of Object.values(p.mats)) m.userData.base = {opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite, emissive: m.emissive.clone(), ei: m.emissiveIntensity};

  // ---------- state ----------
  const S = {explode: 0, explodeTo: 0, doors: 0, doorsTo: 0, prop: false, propAngle: 0, propSpeed: 0, xray: false, selected: null, isolated: null,
    seat: null, yaw: 0, pitch: 0, fov: 78, idle: true, dirty: true};
  const cam = {th: VIEWS[0].th, ph: VIEWS[0].ph, dist: 30, tgt: new THREE.Vector3(...VIEWS[0].tgt), fit: 30};
  let tween = null;
  const accent = new THREE.Color(0xf2b90c);

  function fitDistance() {
    const v = (camera.fov * Math.PI) / 180, h = 2 * Math.atan(Math.tan(v / 2) * camera.aspect);
    return (9.6 / Math.sin(Math.min(v, h) / 2)) * 0.86;
  }
  function resize() {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 2 : 2.5));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const f = fitDistance() * (camera.aspect < 0.8 ? 0.86 : 1);
    cam.dist *= f / cam.fit; cam.fit = f;
    lift();
  }
  // Slide the picture up so the aircraft sits in the space the dock and the open card leave free.
  function lift() {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    const cardOpen = !$('#oa-card', el).hidden && w < 860;
    const k = S.seat ? 0 : cardOpen ? 0.2 : w < 860 ? 0.07 : 0.05;
    camera.setViewOffset(w, h, 0, Math.round(k * h), w, h);
    S.dirty = true;
  }
  new ResizeObserver(resize).observe(el);

  function theme() {
    const cs = getComputedStyle(el);
    const col = (name, fb) => { const v = cs.getPropertyValue(name).trim(); return new THREE.Color(v || fb); };
    const bg = col('--oa-stage', '#e7eaec');
    scene.background = bg;
    scene.fog = new THREE.Fog(bg, 60, 120);
    groundMat.color.copy(col('--oa-ramp', '#d6dadd'));
    const dark = bg.getHSL({}).l < 0.4;
    hemi.intensity = dark ? 0.35 : 0.55;
    scene.environmentIntensity = dark ? 0.55 : 0.75;
    S.dirty = true;
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', theme);
  new MutationObserver(theme).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme']});

  // ---------- part states ----------
  function paint() {
    for (const p of parts) {
      const ghost = S.isolated && S.isolated !== p;
      const xr = !ghost && S.xray && p.skin && S.selected !== p;
      p.group.visible = !p.hidden;
      p.ghost = !!ghost;
      for (const m of Object.values(p.mats)) {
        const b = m.userData.base;
        if (ghost) { m.transparent = true; m.opacity = 0.05; m.depthWrite = false; }
        else if (xr) { m.transparent = true; m.opacity = Math.min(b.opacity, 0.14); m.depthWrite = false; }
        else { m.transparent = b.transparent; m.opacity = b.opacity; m.depthWrite = b.depthWrite; }
        if (S.selected === p) { m.emissive.copy(accent); m.emissiveIntensity = m.emissiveMap ? b.ei : 0.42; if (m.emissiveMap) m.emissive.copy(b.emissive); }
        else { m.emissive.copy(b.emissive); m.emissiveIntensity = b.ei; }
        m.needsUpdate = true;
      }
    }
    S.dirty = true;
  }
  function pose() {
    const t = ease(S.explode);
    root.position.y = 1.55 * t;
    for (const p of parts) {
      p.group.position.copy(p.home).addScaledVector(p.off, t);
      if (p.hinge) p.group.quaternion.setFromAxisAngle(p.hinge.axis, p.hinge.sign * ease(S.doors) * 1.35);
    }
    byId.prop.spin.rotation.x = S.propAngle;
  }

  const box3 = new THREE.Box3(), sph = new THREE.Sphere();
  function focus(p) {
    box3.setFromObject(p.group).getBoundingSphere(sph);
    flyTo({tgt: sph.center.clone(), dist: clamp((sph.radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.5, 2.2, cam.fit * 1.2)});
  }
  function flyTo(to, ms = 700) {
    S.idle = false;
    tween = {t0: performance.now(), ms, from: {th: cam.th, ph: cam.ph, dist: cam.dist, tgt: cam.tgt.clone()},
      to: {th: to.th ?? cam.th, ph: to.ph ?? cam.ph, dist: to.dist ?? cam.dist, tgt: to.tgt || cam.tgt.clone()}};
    // turn the short way round
    while (tween.to.th - tween.from.th > Math.PI) tween.to.th -= 2 * Math.PI;
    while (tween.to.th - tween.from.th < -Math.PI) tween.to.th += 2 * Math.PI;
  }
  function goView(v) {
    leaveSeat();
    flyTo({th: v.th, ph: v.ph, dist: cam.fit * v.k * (1 + 0.55 * S.explodeTo), tgt: new THREE.Vector3(v.tgt[0], v.tgt[1] + 1.55 * ease(S.explodeTo), v.tgt[2])});
  }

  // ---------- selection ----------
  const card = $('#oa-card', el);
  function select(p) {
    S.selected = p;
    if (!p) { card.hidden = true; if (S.isolated) S.isolated = null; paint(); lift(); return; }
    $('#oa-card-sys', el).textContent = p.sys;
    $('#oa-card-name', el).textContent = p.name;
    $('#oa-card-facts', el).innerHTML = p.facts.map((f) => `<li>${f}</li>`).join('');
    $('#oa-iso', el).textContent = S.isolated === p ? 'Show all' : 'Isolate';
    $('#oa-iso', el).classList.toggle('oa-on', S.isolated === p);
    card.hidden = false;
    $('#oa-hint', el).hidden = true;
    paint(); lift();
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(pickables, false);
    let glass = null;
    for (const h of hits) {
      const p = h.object.userData.part;
      if (p.hidden || p.ghost) continue;
      if (S.xray && p.skin && p !== S.selected) continue;
      // a tap goes through glass to whatever is behind it; the pane is chosen only if nothing else is
      if (h.object.material.opacity < 0.5 && !p.hinge) { glass = glass || p; continue; }
      return p;
    }
    return glass;
  }

  // ---------- pointer control ----------
  const pts = new Map();
  let moved = 0, pinch = null, downAt = 0;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (pts.size === 1) { moved = 0; downAt = performance.now(); }
    pinch = null; tween = null; S.idle = false;
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 1) {
      moved += Math.abs(dx) + Math.abs(dy);
      if (S.seat) {
        const k = (S.fov / 78) * 0.0042;
        S.yaw += dx * k; S.pitch = clamp(S.pitch + dy * k, -1.35, 1.35);
      } else if (e.shiftKey || e.buttons === 2) pan(dx, dy);
      else { cam.th -= dx * 0.0085; cam.ph = clamp(cam.ph - dy * 0.0085, 0.05, 2.2); }
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      if (pinch) {
        if (S.seat) S.fov = clamp(S.fov * (pinch.d / d), 30, 95);
        else { cam.dist = clamp(cam.dist * (pinch.d / d), 1.2, cam.fit * 2.6); pan(cx - pinch.cx, cy - pinch.cy); }
      }
      pinch = {d, cx, cy}; moved += 10;
    }
    S.dirty = true;
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId); pinch = null;
    if (pts.size === 0 && moved < 8 && performance.now() - downAt < 600 && e.type === 'pointerup') select(pick(e.clientX, e.clientY));
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    tween = null; S.idle = false;
    if (S.seat) S.fov = clamp(S.fov * Math.exp(e.deltaY * 0.001), 30, 95);
    else cam.dist = clamp(cam.dist * Math.exp(e.deltaY * 0.0012), 1.2, cam.fit * 2.6);
    S.dirty = true;
  }, {passive: false});
  const vx = new THREE.Vector3(), vy = new THREE.Vector3();
  function pan(dx, dy) {
    const k = (cam.dist * Math.tan((camera.fov * Math.PI) / 360) * 2) / el.clientHeight;
    vx.setFromMatrixColumn(camera.matrixWorld, 0); vy.setFromMatrixColumn(camera.matrixWorld, 1);
    cam.tgt.addScaledVector(vx, -dx * k).addScaledVector(vy, dy * k);
    cam.tgt.y = clamp(cam.tgt.y, 0, 8);
  }

  // ---------- sheets ----------
  const sheet = $('#oa-sheet', el), body = $('#oa-sheet-body', el);
  let sheetKind = null;
  function openSheet(kind) {
    if (sheetKind === kind) return closeSheet();
    sheetKind = kind; sheet.hidden = false; el.classList.add('oa-sheet-open');
    $('#oa-sheet-title', el).textContent = {parts: 'Parts', views: 'Views', spec: 'Data plate'}[kind];
    if (kind === 'parts') renderParts();
    if (kind === 'views') body.innerHTML = `<div class="oa-grid">${VIEWS.map((v) => `<button class="oa-btn" type="button" data-view="${v.id}">${v.name}</button>`).join('')}</div>
      <p class="oa-note">One finger turns the aircraft, two fingers zoom and slide it. On a desktop, scroll to zoom and hold Shift to slide.</p>`;
    if (kind === 'spec') body.innerHTML = `<dl class="oa-spec">${SPEC.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
      <p class="oa-note">Figures are Air Tractor's published AT-802U numbers. The outline is traced from the company's side, top and front dimensional drawings, the stores from its loadout drawings, and the cockpit from its 360 cockpit tour of the AT-802. The mission displays and antenna fit are representative, not official.</p>`;
    body.scrollTop = 0;
  }
  function closeSheet() { sheetKind = null; sheet.hidden = true; el.classList.remove('oa-sheet-open'); }
  function renderParts() {
    const groups = {};
    for (const p of parts) (groups[p.sys] ||= []).push(p);
    const anyHidden = parts.some((p) => p.hidden);
    body.innerHTML = `<div class="oa-row"><button class="oa-btn" type="button" data-all="1" ${anyHidden ? '' : 'disabled'}>Put everything back</button><span class="oa-count">${parts.length} parts</span></div>` +
      Object.entries(groups).map(([sys, list]) => `<h3>${sys}</h3><ul class="oa-list">${list.map((p) => `<li class="${p.hidden ? 'oa-off' : ''}">
        <button class="oa-name" type="button" data-part="${p.id}">${p.name}</button>
        <button class="oa-eye" type="button" data-eye="${p.id}" aria-pressed="${!p.hidden}" aria-label="${p.hidden ? 'Put back' : 'Remove'} ${p.name}">${p.hidden ? 'Off' : 'On'}</button></li>`).join('')}</ul>`).join('');
  }
  body.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.view) { goView(VIEWS.find((v) => v.id === t.dataset.view)); if (narrow()) closeSheet(); }
    if (t.dataset.part) { const p = byId[t.dataset.part]; if (p.hidden) { p.hidden = false; } leaveSeat(); select(p); focus(p); if (narrow()) closeSheet(); else renderParts(); }
    if (t.dataset.eye) { const p = byId[t.dataset.eye]; p.hidden = !p.hidden; if (p.hidden && S.selected === p) select(null); paint(); const y = body.scrollTop; renderParts(); body.scrollTop = y; }
    if (t.dataset.all) { for (const p of parts) p.hidden = false; paint(); renderParts(); }
  });
  const narrow = () => el.clientWidth < 860;

  // ---------- cockpit ----------
  const seatbar = $('#oa-seatbar', el);
  function sit(which) {
    S.seat = which; S.yaw = 0; S.pitch = which === 'rear' ? -0.3 : -0.12; S.fov = 78; S.idle = false; tween = null;
    seatbar.hidden = false; el.classList.add('oa-seated');
    $('#oa-seatname', el).textContent = SEATS[which].name;
    $('#oa-hint', el).hidden = false; $('#oa-hint', el).textContent = 'Drag to look around · pinch to zoom';
    closeSheet(); select(null); lift();
  }
  function leaveSeat() {
    if (!S.seat) return;
    S.seat = null; seatbar.hidden = true; el.classList.remove('oa-seated'); $('#oa-hint', el).hidden = true;
    camera.fov = 36; camera.updateProjectionMatrix(); lift();
  }

  // ---------- dock ----------
  const slider = $('#oa-explode', el), out = $('#oa-explode-out', el);
  let lastTo = 0;
  slider.addEventListener('input', () => {
    S.explodeTo = slider.value / 100; out.textContent = `${slider.value}%`; S.idle = false;
    if (!S.seat) { cam.dist = clamp((cam.dist * (1 + 0.55 * S.explodeTo)) / (1 + 0.55 * lastTo), 1.2, cam.fit * 2.6); }
    lastTo = S.explodeTo;
  });
  const toggle = (id, fn) => $(id, el).addEventListener('click', (e) => { const on = fn(); e.currentTarget.setAttribute('aria-pressed', on); e.currentTarget.classList.toggle('oa-on', on); S.dirty = true; });
  toggle('#oa-doors', () => { S.doorsTo = S.doorsTo ? 0 : 1; return !!S.doorsTo; });
  toggle('#oa-prop', () => (S.prop = !S.prop));
  toggle('#oa-xray', () => { S.xray = !S.xray; paint(); return S.xray; });
  $('#oa-parts', el).addEventListener('click', () => openSheet('parts'));
  $('#oa-views', el).addEventListener('click', () => openSheet('views'));
  $('#oa-spec-btn', el).addEventListener('click', () => openSheet('spec'));
  $('#oa-sheet-x', el).addEventListener('click', closeSheet);
  $('#oa-sit', el).addEventListener('click', () => sit('front'));
  $('#oa-seat-swap', el).addEventListener('click', () => sit(S.seat === 'front' ? 'rear' : 'front'));
  $('#oa-seat-exit', el).addEventListener('click', () => { leaveSeat(); goView(VIEWS[7]); });
  $('#oa-card-x', el).addEventListener('click', () => select(null));
  $('#oa-iso', el).addEventListener('click', () => { S.isolated = S.isolated === S.selected ? null : S.selected; select(S.selected); if (S.isolated) focus(S.isolated); });
  $('#oa-hide', el).addEventListener('click', () => { if (S.selected) { S.selected.hidden = true; S.isolated = null; select(null); if (sheetKind === 'parts') renderParts(); } });
  $('#oa-zoom', el).addEventListener('click', () => S.selected && focus(S.selected));
  $('#oa-reset', el).addEventListener('click', () => {
    for (const p of parts) p.hidden = false;
    S.isolated = null; S.xray = false; S.prop = false; S.doorsTo = 0; S.explodeTo = 0; lastTo = 0; slider.value = 0; out.textContent = '0%';
    for (const id of ['#oa-doors', '#oa-prop', '#oa-xray']) { $(id, el).setAttribute('aria-pressed', false); $(id, el).classList.remove('oa-on'); }
    select(null); closeSheet(); leaveSeat(); goView(VIEWS[0]);
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (S.seat) { leaveSeat(); goView(VIEWS[7]); } else if (sheetKind) closeSheet(); else select(null); } });

  // ---------- frame loop ----------
  const eye = new THREE.Vector3(), look = new THREE.Vector3();
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    let moving = false;
    for (const [k, to] of [['explode', 'explodeTo'], ['doors', 'doorsTo']]) {
      if (S[k] !== S[to]) { const d = S[to] - S[k], step = dt * (k === 'doors' ? 1.4 : 4); S[k] = Math.abs(d) <= step ? S[to] : S[k] + Math.sign(d) * Math.max(step * Math.min(1, Math.abs(d) * 6), 0.002); moving = true; }
    }
    S.propSpeed += ((S.prop ? 9 : 0) - S.propSpeed) * Math.min(1, dt * 1.6);
    if (Math.abs(S.propSpeed) > 0.01) { S.propAngle += S.propSpeed * dt; moving = true; }
    if (tween) {
      const u = clamp((now - tween.t0) / tween.ms, 0, 1), k = ease(u);
      cam.th = tween.from.th + (tween.to.th - tween.from.th) * k; cam.ph = tween.from.ph + (tween.to.ph - tween.from.ph) * k;
      cam.dist = tween.from.dist + (tween.to.dist - tween.from.dist) * k; cam.tgt.lerpVectors(tween.from.tgt, tween.to.tgt, k);
      if (u >= 1) tween = null;
      moving = true;
    }
    if (S.idle && !reduced) { cam.th += dt * 0.08; moving = true; }
    if (!moving && !S.dirty) return;
    S.dirty = false;
    pose();
    if (S.seat) {
      const s = SEATS[S.seat];
      eye.set(s.eye[0], s.eye[1] + root.position.y, s.eye[2]);
      camera.position.copy(eye);
      look.set(-Math.cos(S.pitch) * Math.cos(S.yaw), Math.sin(S.pitch), Math.cos(S.pitch) * Math.sin(S.yaw)).add(eye);
      if (camera.fov !== S.fov) { camera.fov = S.fov; camera.updateProjectionMatrix(); }
      camera.lookAt(look);
    } else {
      const sp = Math.sin(cam.ph);
      camera.position.set(cam.tgt.x + cam.dist * sp * Math.sin(cam.th), Math.max(0.12, cam.tgt.y + cam.dist * Math.cos(cam.ph)), cam.tgt.z + cam.dist * sp * Math.cos(cam.th));
      camera.lookAt(cam.tgt);
    }
    renderer.render(scene, camera);
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  resize(); cam.dist = cam.fit; theme(); paint(); pose();
  requestAnimationFrame(frame);

  // Test and capture hook: lets a script pose the page without touching the DOM.
  window.__oa = {S, cam, parts, byId, select, sit, leaveSeat, goView, VIEWS, openSheet, focus, paint, DIM,
    set(o) { Object.assign(S, o); if ('explode' in o) S.explodeTo = o.explode; if ('doors' in o) S.doorsTo = o.doors; paint(); }};
}
