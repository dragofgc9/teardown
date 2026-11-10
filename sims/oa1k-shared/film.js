// The OA-1K film, 20 s: a pass in flight, the aircraft comes apart system by system with each one lit and named,
// then it rebuilds in reverse and flies out. render(t) is a pure function of t; the distance flown is tabulated at load.
import * as THREE from 'three';
import {runSim} from '../kit/runtime.js';
import {clamp01, easeInOutCubic, easeOutCubic, lerp, rng, smooth} from '../kit/util.js';
import {buildAircraft, DIM} from './airframe.js';
import {curve1} from './geo.js';

const DEFAULTS = {duration: 20, fps: 60, theme: 'light', hud: {enabled: false, title: 'OA-1K SKYRAIDER II', subtitle: ''}, director: {enabled: false}};
const T = {apart: 5.0, apartEnd: 6.7, show: 6.8, each: 0.9, rebuild: 14.2, whole: 15.6, out: 16.4, end: 20};
const SYSTEMS = [
  ['Powerplant', 'PT6A-67F · 1,600 shp · 118 in five-blade propeller'],
  ['Fuselage', 'Welded steel tube frame · 360 US gal fuselage tank'],
  ['Cockpit', 'Roll cage · armor tub · ballistic glass · two seats'],
  ['Wing', '59.25 ft span · 401 sq ft · 380 US gal in the wings'],
  ['Tail', '19.67 ft strut-braced tailplane · fin 11.2 ft tall'],
  ['Landing gear', 'Spring steel legs · 30 in tires · 10 ft track'],
  ['Stores and sensors', '10 hardpoints · MX-15 + MX-20 pod · GBU-12 · Hellfire'],
  ['Mission systems', 'Radios · SATCOM · missile warning · chaff and flares'],
];
const KT = 0.5144;
const SUN = new THREE.Vector3(-0.45, 0.62, 0.64).normalize();
const HAZE = new THREE.Color(0xc3d6e6), ZENITH = new THREE.Color(0x2c6cb4);

const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };

function skyMesh() {
  return new THREE.Mesh(new THREE.SphereGeometry(60000, 32, 20), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {sun: {value: SUN}, haze: {value: HAZE}, zen: {value: ZENITH}},
    vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 d; uniform vec3 sun, haze, zen;
      void main(){ vec3 n = normalize(d); float h = clamp(n.y, 0.0, 1.0);
        vec3 c = mix(haze, zen, pow(h, 0.55));
        float s = max(dot(n, sun), 0.0);
        c += vec3(1.0, 0.93, 0.8) * (pow(s, 600.0) * 4.0 + pow(s, 24.0) * 0.22 + pow(s, 4.0) * 0.08);
        if (n.y < 0.0) c = mix(haze, haze * 0.92, clamp(-n.y * 3.0, 0.0, 1.0));
        gl_FragColor = vec4(c, 1.0); }`,
  }));
}

// Farmland from 1,200 m: a patchwork of fields, tree lines, a river and two roads, tiled.
function groundTex(seed) {
  const r = rng(seed);
  return canvasTex(2048, 2048, (g, w) => {
    g.fillStyle = '#6f7a4c'; g.fillRect(0, 0, w, w);
    const cols = ['#7d8a52', '#66763f', '#8c8a58', '#a39a66', '#586b3a', '#94a05e', '#77693f', '#b0a873', '#4f6236'];
    const split = (x, y, sw, sh, d) => {
      if (d > 0 && (sw > 90 || sh > 90) && r() > 0.12) {
        if (sw > sh) { const k = lerp(0.3, 0.7, r()) * sw; split(x, y, k, sh, d - 1); split(x + k, y, sw - k, sh, d - 1); }
        else { const k = lerp(0.3, 0.7, r()) * sh; split(x, y, sw, k, d - 1); split(x, y + k, sw, sh - k, d - 1); }
        return;
      }
      g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(x + 1.5, y + 1.5, sw - 3, sh - 3);
      if (r() > 0.5) { g.strokeStyle = 'rgba(0,0,0,0.07)'; g.lineWidth = 1; const st = 5 + r() * 6; g.beginPath(); for (let i = st; i < (r() > 0.5 ? sw : 0); i += st) { g.moveTo(x + i, y + 2); g.lineTo(x + i, y + sh - 2); } g.stroke(); }
    };
    split(0, 0, w, w, 8);
    for (let i = 0; i < 420; i++) { const cx = r() * w, cy = r() * w, n = 4 + r() * 26, sp = 10 + r() * 60; for (let j = 0; j < n; j++) { g.fillStyle = `rgba(${38 + r() * 20},${58 + r() * 25},${30 + r() * 15},${0.45 + r() * 0.4})`; g.beginPath(); g.arc(cx + (r() - 0.5) * sp * (r() > 0.6 ? 4 : 1), cy + (r() - 0.5) * sp, 1.2 + r() * 2.6, 0, 6.3); g.fill(); } }
    for (let i = 0; i < 60; i++) { const x = r() * w, y = r() * w, s = 120 + r() * 260, c = r() > 0.5 ? '255,250,225' : '20,30,15', gr = g.createRadialGradient(x, y, 0, x, y, s); gr.addColorStop(0, `rgba(${c},0.1)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - s, y - s, 2 * s, 2 * s); }
    g.strokeStyle = '#3f5f72'; g.lineWidth = 14; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 700);
    g.bezierCurveTo(500, 500, 700, 1100, 1100, 900); g.bezierCurveTo(1500, 700, 1700, 900, 2048, 700); g.stroke();
    g.strokeStyle = '#c9c4b2'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, 1500); g.lineTo(2048, 1500); g.moveTo(1300, 0); g.lineTo(1300, 2048); g.stroke();
  });
}
function puffTex(seed) {
  const r = rng(seed);
  return canvasTex(256, 256, (g) => {
    for (let i = 0; i < 70; i++) {
      const a = r() * 6.3, rad = Math.pow(r(), 0.7) * 78, x = 128 + Math.cos(a) * rad * 1.25, y = 138 + Math.sin(a) * rad * 0.55 - r() * 14, s = 14 + r() * 30;
      const gr = g.createRadialGradient(x, y, 0, x, y, s);
      gr.addColorStop(0, 'rgba(255,255,255,0.34)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    }
  });
}

export function run() {
  runSim(DEFAULTS, async ({canvas}) => {
    const renderer = new THREE.WebGLRenderer({canvas, antialias: true, preserveDrawingBuffer: true});
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(HAZE, 0.000115);
    const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.3, 90000);

    scene.add(skyMesh());
    const gt = groundTex(71); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(28, 28); gt.anisotropy = 8;
    const TILE = 3600, ALT = 1250;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(TILE * 28, TILE * 28), new THREE.MeshStandardMaterial({map: gt, roughness: 1, metalness: 0}));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -ALT; scene.add(ground);

    // reflections come from the same sky the aircraft flies in
    const envScene = new THREE.Scene(); envScene.add(skyMesh());
    const eg = new THREE.Mesh(new THREE.CircleGeometry(40000, 24), new THREE.MeshBasicMaterial({color: 0x6f7a4c})); eg.rotation.x = -Math.PI / 2; eg.position.y = -800; envScene.add(eg);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(envScene, 0, 1, 80000).texture; scene.environmentIntensity = 0.9;
    const sun = new THREE.DirectionalLight(0xfff2de, 3.1);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 120});
    sun.shadow.bias = -0.0015; sun.shadow.normalBias = 0.09;
    scene.add(sun, sun.target, new THREE.HemisphereLight(0xbfd8f5, 0x69704e, 0.75));

    // clouds: positions wrap along the flight path, so they are a function of distance flown
    const r = rng(1962);
    const puffs = [0, 1, 2, 3].map((i) => puffTex(11 + i));
    const clouds = [];
    const addCloud = (L, x, y, z, s, op) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: puffs[Math.floor(r() * 4)], transparent: true, depthWrite: false, opacity: op, fog: true}));
      sp.scale.set(s, s * 0.62, 1); sp.userData = {L, x, y, z}; scene.add(sp); clouds.push(sp);
    };
    for (let i = 0; i < 16; i++) { const side = r() > 0.5 ? 1 : -1; addCloud(2800, r() * 2800, lerp(-140, 60, r()), side * lerp(110, 520, r()), lerp(90, 220, r()), 0.85); }
    for (let i = 0; i < 46; i++) addCloud(9000, r() * 9000, lerp(-640, -360, r()), lerp(-4200, 4200, r()), lerp(380, 1100, r()), 0.62);
    for (let i = 0; i < 40; i++) addCloud(30000, r() * 30000, lerp(600, 1500, r()), lerp(-14000, 14000, r()), lerp(1500, 3600, r()), 0.5);

    // the aircraft, pivoting about its centre of gravity
    const {root, parts, byId} = buildAircraft();
    const CG = new THREE.Vector3(4.15, 2.25, 0);
    const plane = new THREE.Group(); root.position.copy(CG).negate(); plane.add(root); scene.add(plane);
    for (const p of parts) for (const m of Object.values(p.mats)) m.userData.base = {emissive: m.emissive.clone(), ei: m.emissiveIntensity};
    parts.forEach((p, i) => { p.order = i / (parts.length - 1); p.sysIndex = SYSTEMS.findIndex((s) => s[0] === p.sys); });
    const accent = new THREE.Color(0xf2b90c);
    // propeller: a blur disc at speed, blades when it stops
    const prop = byId.prop, bladeMat = prop.mats.black;
    bladeMat.transparent = true;
    const discTex = canvasTex(256, 256, (g) => { const gr = g.createRadialGradient(128, 128, 14, 128, 128, 128); gr.addColorStop(0, 'rgba(30,32,34,0)'); gr.addColorStop(0.16, 'rgba(20,22,24,0.34)'); gr.addColorStop(0.6, 'rgba(20,22,24,0.16)'); gr.addColorStop(0.93, 'rgba(20,22,24,0.13)'); gr.addColorStop(0.96, 'rgba(230,200,60,0.2)'); gr.addColorStop(1, 'rgba(40,42,44,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(DIM.propDia / 2, 48), new THREE.MeshBasicMaterial({map: discTex, transparent: true, depthWrite: false, side: THREE.DoubleSide}));
    disc.rotation.y = Math.PI / 2; disc.position.x = -0.05; prop.holder.add(disc);

    // tables over time: how hard the aircraft is "live" (1 flying, 0 held for the teardown), distance flown, prop angle
    const N = Math.round(T.end * 240) + 1;
    const live = (t) => 1 - smooth((t - (T.apart - 0.9)) / 1.2) + smooth((t - (T.whole - 0.5)) / 1.3);
    const dist = new Float64Array(N), ang = new Float64Array(N);
    for (let i = 1; i < N; i++) { const t = i / 240, k = live(t); dist[i] = dist[i - 1] + (lerp(22, 180, k) * KT) / 240; ang[i] = ang[i - 1] + (lerp(0, 1700 / 60, Math.pow(k, 1.5)) * 2 * Math.PI) / 240; }
    const tab = (a, t) => { const x = clamp01(t / T.end) * (N - 1), i = Math.min(N - 2, Math.floor(x)); return lerp(a[i], a[i + 1], x - i); };

    const camTh = curve1([[0, -1.32], [2.4, -0.62], [5, 0.12], [6.7, -0.3], [10.5, -0.95], [14.2, -1.45], [15.8, -1.12], [17.5, -0.2], [20, 0.75]]);
    const camPh = curve1([[0, 1.5], [2.4, 1.33], [5, 1.22], [6.7, 1.08], [10.5, 1.02], [14.2, 1.14], [15.8, 1.3], [20, 1.42]]);
    const camD = curve1([[0, 21], [2.4, 23], [5, 27], [6.7, 34], [14.2, 34], [15.8, 26], [17.5, 27], [20, 30]]);

    const app = canvas.parentElement;
    const ov = document.createElement('div'); ov.className = 'of';
    ov.innerHTML = `<div class="of-head"><span class="of-flag">OA-1K</span><span class="of-name">Skyraider II</span></div><div class="of-read"></div>
      <div class="of-cap"><div class="of-k"></div><div class="of-sys"></div><div class="of-fact"></div></div><div class="of-dots">${SYSTEMS.map(() => '<i></i>').join('')}</div>`;
    app.appendChild(ov);
    const q = (s) => ov.querySelector(s), cap = q('.of-cap'), dots = [...ov.querySelectorAll('.of-dots i')];

    const eu = new THREE.Euler(), tgt = new THREE.Vector3();
    function render(t) {
      const k = live(t), d = tab(dist, t);
      // flight: a banked arrival, a steady pass, held level for the teardown, then a climbing break away
      const out = smooth((t - T.out) / 3.2);
      const roll = (lerp(-24, 0, smooth(t / 3.4)) + 4 * Math.sin(t * 0.9) * k + 42 * out) * (Math.PI / 180);
      const pitch = (DIM.attitude + 1.5 * Math.sin(t * 0.7 + 1) * k - 9 * out) * (Math.PI / 180);
      const yaw = (-16 * out) * (Math.PI / 180);
      eu.set(roll, yaw, pitch, 'YZX'); plane.quaternion.setFromEuler(eu);
      const away = Math.max(0, t - T.out);
      plane.position.set(-away * away * 5.2, 0.5 * Math.sin(t * 1.1) * k + away * away * 0.55, -away * away * 1.7);

      // parts: staggered out nose to tail, lit one system at a time, pulled back in the reverse order
      const sysNow = t >= T.show && t < T.rebuild ? Math.min(SYSTEMS.length - 1, Math.floor((t - T.show) / T.each)) : -1;
      const su = sysNow < 0 ? 0 : ((t - T.show) / T.each) % 1;
      const glow = sysNow < 0 ? 0 : smooth(su / 0.18) * (1 - smooth((su - 0.84) / 0.16));
      let apart = 0;
      for (const p of parts) {
        const e = t < T.rebuild
          ? easeInOutCubic(clamp01((t - T.apart - p.order * 0.75) / 0.95))
          : 1 - easeInOutCubic(clamp01((t - T.rebuild - (1 - p.order) * 0.75) / 0.6));
        if (e > 0.5) apart++;
        const mine = p.sysIndex === sysNow;
        p.group.position.copy(p.home).addScaledVector(p.off, e * (1 + (mine ? 0.12 * glow : 0)));
        for (const m of Object.values(p.mats)) {
          const b = m.userData.base;
          if (m.emissiveMap) continue;
          if (mine) { m.emissive.copy(accent); m.emissiveIntensity = 0.5 * glow; } else { m.emissive.copy(b.emissive); m.emissiveIntensity = b.ei; }
        }
      }
      const spin = Math.pow(k, 1.5);
      prop.spin.rotation.x = tab(ang, t);
      disc.material.opacity = smooth((spin - 0.25) / 0.5);
      bladeMat.opacity = 1 - smooth((spin - 0.3) / 0.5);
      bladeMat.depthWrite = bladeMat.opacity > 0.9;

      for (const c of clouds) { const u = c.userData; c.position.set((((u.x + d) % u.L) + u.L) % u.L - u.L / 2, u.y, u.z); }
      gt.offset.x = -(d / TILE) % 1;

      const th = camTh(t), ph = camPh(t), cd = camD(t) * (camera.aspect < 1 ? 1.9 : 1);
      tgt.set(plane.position.x * 0.55 + 0.6, plane.position.y * 0.5 - 0.2, plane.position.z * 0.5);
      camera.position.set(tgt.x + cd * Math.sin(ph) * Math.sin(th), tgt.y + cd * Math.cos(ph), tgt.z + cd * Math.sin(ph) * Math.cos(th));
      camera.lookAt(tgt);
      sun.position.copy(plane.position).addScaledVector(SUN, 50); sun.target.position.copy(plane.position); sun.target.updateMatrixWorld();

      // words
      const flying = t < T.apart - 0.4 || t > T.whole + 0.2;
      q('.of-read').textContent = flying ? `${Math.round(lerp(22, 180, k))} kt · 4,100 ft` : `${apart} of ${parts.length} parts off`;
      let kText = '', sText = '', fText = '', op = 0;
      if (sysNow >= 0) { kText = `System ${sysNow + 1} of ${SYSTEMS.length} · ${parts.filter((p) => p.sysIndex === sysNow).length} parts`; sText = SYSTEMS[sysNow][0]; fText = SYSTEMS[sysNow][1]; op = smooth(su / 0.12) * (1 - smooth((su - 0.9) / 0.1)); }
      else if (t < T.apart) { kText = 'L3Harris · Air Tractor AT-802U'; sText = 'Armed overwatch'; fText = 'Patrol speed 180 kt · range 1,303 nm'; op = smooth((t - 0.5) / 0.6) * (1 - smooth((t - (T.apart - 1.1)) / 0.5)); }
      else if (t >= T.apart && t < T.show) { kText = 'Teardown'; sText = `${parts.length} parts`; fText = 'Everything bolts to one steel tube frame'; op = smooth((t - T.apart - 0.2) / 0.3) * (1 - smooth((t - (T.show - 0.3)) / 0.25)); }
      else if (t >= T.rebuild && t < T.out + 1.6) { kText = 'Rebuild'; sText = 'Back together'; fText = 'Reassembled from a C-17 load in a day'; op = smooth((t - T.rebuild - 0.1) / 0.3) * (1 - smooth((t - (T.whole + 0.9)) / 0.5)); }
      q('.of-k').textContent = kText; q('.of-sys').textContent = sText; q('.of-fact').textContent = fText; cap.style.opacity = op.toFixed(3);
      dots.forEach((el, i) => el.classList.toggle('on', i === sysNow));
      ov.querySelector('.of-dots').style.opacity = sysNow >= 0 ? 1 : 0;

      renderer.render(scene, camera);
      return {};
    }
    function resize() {
      const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
      renderer.setPixelRatio(window.devicePixelRatio || 1); renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    resize();
    return {render, resize};
  });
}
