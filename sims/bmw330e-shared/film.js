// The 330e film: ten seconds at 80 km/h through a tunnel lit by sodium lamps, and on the way the car comes apart in
// the order a workshop would take it down. render(t) is a pure function of t: the powertrain is run once at load and
// tabulated per frame, the tunnel is placed from the distance covered, each part's pull-out is a function of time.
// What makes it read as a place and not a studio: the lamps are real lights that sweep over the car at their pitch,
// the reflections come from the tunnel itself (an environment map re-taken every frame from the car's position), the
// walls and the road carry the shutter's blur in their textures, the wheels blur with speed, and the picture goes
// through bloom, a vignette and grain.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {runSim} from '../kit/runtime.js';
import {rng} from '../kit/util.js';
import {buildCar} from './car.js';
import {makeCar, stepCar} from './drive.js';
import {ORDER} from './live.js';
import TL from '../bmw330e-film/timeline.json';

export const DURATION = TL.duration;
const FPS = TL.fps;
const V = TL.speed_kmh / 3.6;
const PITCH = TL.lamp_pitch_m; // lamp to lamp along the tunnel
const HALF_W = 8.2; // wall to centre
const WALL_H = 2.6; // tiled wall under the vault
const TOP = 7.0; // crown of the vault
const LAMP_X = 3.1;
const LAMP_Y = 6.15;
const SODIUM = '#ffb057';
const D2R = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ss = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};
const outQuint = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 5);
const mod = (a, m) => ((a % m) + m) % m;

// camera keys: seconds, azimuth from the nose towards the car's left, elevation, distance, target height and z
const CAM = [
  [0.0, 28, 4.5, 7.4, 0.62, 0.35],
  [3.0, 44, 8, 6.9, 0.62, 0.2],
  [5.6, 60, 21, 9.0, 0.8, 0.0],
  [8.0, 112, 25, 9.3, 0.85, -0.1],
  [10.0, 146, 17, 8.8, 0.8, -0.2],
];
const camAt = (t) => {
  let i = 0;
  while (i < CAM.length - 2 && t > CAM[i + 1][0]) i++;
  const a = CAM[i];
  const b = CAM[i + 1];
  // Catmull-Rom through the keys, so the move never stops at one
  const p = CAM[Math.max(0, i - 1)];
  const n = CAM[Math.min(CAM.length - 1, i + 2)];
  const u = clamp((t - a[0]) / (b[0] - a[0]), 0, 1);
  const out = [];
  for (let k = 1; k < 6; k++) {
    const m0 = ((b[k] - p[k]) / (b[0] - p[0] || 1)) * (b[0] - a[0]);
    const m1 = ((n[k] - a[k]) / (n[0] - a[0] || 1)) * (b[0] - a[0]);
    const u2 = u * u;
    const u3 = u2 * u;
    out.push((2 * u3 - 3 * u2 + 1) * a[k] + (u3 - 2 * u2 + u) * (i === 0 ? (b[k] - a[k]) : m0) + (-2 * u3 + 3 * u2) * b[k] + (u3 - u2) * (i === CAM.length - 2 ? (b[k] - a[k]) : m1));
  }
  return out;
};

// ---------------------------------------------------------------- textures
// a canvas smeared along x by `px` pixels: the shutter's blur for a surface that slides past at road speed
const smear = (src, px) => {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d');
  const n = Math.max(1, Math.round(px));
  g.globalAlpha = 1;
  g.drawImage(src, 0, 0);
  for (let i = 1; i < n; i++) {
    g.globalAlpha = 1 / (i + 1);
    g.drawImage(src, i, 0);
    g.drawImage(src, i - src.width, 0);
  }
  return c;
};
const tex = (c, rx, ry, color = true) => {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
};
// along x: one lamp pitch. down y: the wall from the crown (top) to the kerb (bottom).
function wallCanvases(R) {
  const W = 2048;
  const H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#5d5a55';
  g.fillRect(0, 0, W, H);
  // cast concrete: mottling, pour lines, stains running down
  for (let i = 0; i < 2600; i++) {
    const v = 70 + R() * 50;
    g.fillStyle = `rgba(${v},${v - 3},${v - 8},${0.05 + R() * 0.07})`;
    const w = 8 + R() * 70;
    g.fillRect(R() * W, R() * H * 0.7, w, 3 + R() * 26);
  }
  for (let i = 0; i < 90; i++) {
    const x = R() * W;
    const gr = g.createLinearGradient(0, 0, 0, H * 0.7);
    gr.addColorStop(0, 'rgba(20,18,16,0)');
    gr.addColorStop(0.3 + R() * 0.4, `rgba(20,18,16,${0.1 + R() * 0.2})`);
    gr.addColorStop(1, 'rgba(20,18,16,0)');
    g.fillStyle = gr;
    g.fillRect(x, 0, 2 + R() * 9, H * 0.7);
  }
  g.fillStyle = 'rgba(18,17,16,.55)';
  for (let k = 0; k < 4; k++) g.fillRect((k / 4) * W - 2, 0, 4, H * 0.7); // segment joints
  for (const y of [0.22, 0.45]) g.fillRect(0, H * y, W, 2);
  // the tiled band below: off-white tiles, dark grout, a blue line, road grime at the foot
  const y0 = H * 0.7;
  g.fillStyle = '#c9c4b8';
  g.fillRect(0, y0, W, H - y0);
  const tw = W / 44;
  const th = (H - y0) / 9;
  for (let i = 0; i < 44; i++) {
    for (let j = 0; j < 9; j++) {
      const v = 190 + R() * 26;
      g.fillStyle = `rgb(${v},${v - 4},${v - 14})`;
      g.fillRect(i * tw + 1.5, y0 + j * th + 1.5, tw - 3, th - 3);
    }
  }
  g.fillStyle = '#2f5d8f';
  g.fillRect(0, y0 + th * 2, W, th);
  const gr = g.createLinearGradient(0, y0 + th * 5, 0, H);
  gr.addColorStop(0, 'rgba(30,26,22,0)');
  gr.addColorStop(1, 'rgba(30,26,22,.75)');
  g.fillStyle = gr;
  g.fillRect(0, y0, W, H - y0);
  // an emergency sign and a door once per pitch
  g.fillStyle = '#1d8a4a';
  g.fillRect(W * 0.62, y0 + th * 0.3, th * 2.4, th * 1.4);
  g.fillStyle = '#e9f5ec';
  g.fillRect(W * 0.62 + th * 0.5, y0 + th * 0.7, th * 1.4, th * 0.5);
  g.fillStyle = '#3d4247';
  g.fillRect(W * 0.2, y0 + th * 2.2, th * 3.2, th * 6.8);
  // light: a pool on the vault under each lamp (at x = 0 of the pitch), fading down the wall and along the tunnel
  const e = document.createElement('canvas');
  e.width = 512;
  e.height = 256;
  const h = e.getContext('2d');
  const img = h.createImageData(512, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 512; x++) {
      const dx = Math.min(x, 512 - x) / 512; // 0 at the lamp, 0.5 between two
      const v = y / 256; // 0 crown, 1 kerb
      const along = Math.exp(-((dx * PITCH) ** 2) / 9);
      const up = Math.exp(-((v - 0.16) ** 2) / 0.02);
      const k = 0.05 + 0.95 * along * up + 0.16 * Math.exp(-((v - 0.16) ** 2) / 0.2) + 0.1 * (1 - v) * along;
      const o = (y * 512 + x) * 4;
      img.data[o] = Math.min(255, 255 * k);
      img.data[o + 1] = Math.min(255, 255 * k * 0.74);
      img.data[o + 2] = Math.min(255, 255 * k * 0.4);
      img.data[o + 3] = 255;
    }
  }
  h.putImageData(img, 0, 0);
  return {map: c, glow: e};
}
function roadCanvases(R) {
  const W = 2048;
  const H = 1024; // x: one pitch along the tunnel, y: wall to wall
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#26272a';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 26000; i++) {
    const v = 26 + R() * 54;
    g.fillStyle = `rgba(${v},${v},${v + 3},${0.25 + R() * 0.5})`;
    g.fillRect(R() * W, R() * H, 1 + R() * 2.2, 1 + R() * 1.6);
  }
  // wheel tracks polished darker, an oil line down the middle of each lane
  const y = (m) => ((m + HALF_W) / (2 * HALF_W)) * H;
  for (const lane of [-5.25, -1.75, 1.75, 5.25]) {
    for (const off of [-0.78, 0.78]) {
      const gr = g.createLinearGradient(0, y(lane + off - 0.35), 0, y(lane + off + 0.35));
      gr.addColorStop(0, 'rgba(8,8,10,0)');
      gr.addColorStop(0.5, 'rgba(8,8,10,.4)');
      gr.addColorStop(1, 'rgba(8,8,10,0)');
      g.fillStyle = gr;
      g.fillRect(0, y(lane + off - 0.35), W, y(0.7) - y(0));
    }
  }
  // markings: solid edge lines, dashed lane lines (3 m of line in every 11)
  g.fillStyle = '#d9d6cc';
  for (const m of [-7.0, 7.0]) g.fillRect(0, y(m) - 3, W, 6);
  for (const m of [-3.5, 0, 3.5]) g.fillRect(W * 0.1, y(m) - 3.5, W * (3 / PITCH), 7);
  // gloss: the lanes are worn smooth, the markings and the grit are not
  const r = document.createElement('canvas');
  r.width = 1024;
  r.height = 512;
  const h = r.getContext('2d');
  h.fillStyle = '#8a8a8a';
  h.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 5000; i++) {
    const v = 90 + R() * 110;
    h.fillStyle = `rgba(${v},${v},${v},.5)`;
    h.fillRect(R() * 1024, R() * 512, 2 + R() * 9, 1 + R() * 2);
  }
  for (let i = 0; i < 40; i++) {
    h.fillStyle = `rgba(38,38,38,${0.25 + R() * 0.4})`; // damp patches
    h.beginPath();
    h.ellipse(R() * 1024, R() * 512, 30 + R() * 120, 6 + R() * 16, 0, 0, Math.PI * 2);
    h.fill();
  }
  const e = document.createElement('canvas');
  e.width = 512;
  e.height = 256;
  const k = e.getContext('2d');
  const img = k.createImageData(512, 256);
  for (let yy = 0; yy < 256; yy++) {
    for (let x = 0; x < 512; x++) {
      const dz = (Math.min(x, 512 - x) / 512) * PITCH;
      const xm = (yy / 256) * 2 * HALF_W - HALF_W;
      const d2 = Math.min((xm - LAMP_X) ** 2, (xm + LAMP_X) ** 2);
      const v = 0.02 + 0.5 * Math.exp(-(dz * dz) / 14) * Math.exp(-d2 / 10);
      const o = (yy * 512 + x) * 4;
      img.data[o] = 255 * v;
      img.data[o + 1] = 255 * v * 0.72;
      img.data[o + 2] = 255 * v * 0.38;
      img.data[o + 3] = 255;
    }
  }
  k.putImageData(img, 0, 0);
  return {map: c, rough: r, glow: e};
}

// ---------------------------------------------------------------- the tunnel
function buildTunnel(R) {
  const g = new THREE.Group();
  const Z0 = -90;
  const Z1 = 240;
  const LEN = Z1 - Z0;
  const reps = LEN / PITCH;
  const blurPx = (W) => ((V / FPS) * 0.5 * W) / PITCH; // a 180° shutter
  // one wall + half vault as a ribbon: v runs from the crown down to the kerb
  const wc = wallCanvases(R);
  const wallMap = tex(smear(wc.map, blurPx(2048)), reps, 1);
  const wallGlow = tex(wc.glow, reps, 1);
  const profile = [];
  const N = 28;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * (Math.PI / 2); // crown to springing
    profile.push([HALF_W * Math.sin(a), WALL_H + (TOP - WALL_H) * Math.cos(a)]);
  }
  profile.push([HALF_W, 0.22]);
  const lens = [0];
  for (let i = 1; i < profile.length; i++) lens.push(lens[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
  const total = lens[lens.length - 1];
  const scroll = [wallMap, wallGlow];
  for (const s of [-1, 1]) {
    const pos = [];
    const uv = [];
    const idx = [];
    profile.forEach(([x, y], i) => {
      // the tiled band takes the last 30% of the texture exactly
      const split = lens[N] / total;
      const v = i <= N ? (lens[i] / lens[N]) * 0.7 : 1;
      void split;
      pos.push(s * x, y, Z0, s * x, y, Z1);
      uv.push(0, 1 - v, 1, 1 - v);
      if (i) {
        const a = (i - 1) * 2;
        if (s > 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({map: wallMap, emissiveMap: wallGlow, emissive: '#ffffff', emissiveIntensity: 0.3, roughness: 0.62, metalness: 0}));
    m.receiveShadow = false;
    g.add(m);
  }
  // road
  const rc = roadCanvases(R);
  const roadMap = tex(smear(rc.map, blurPx(2048)), reps, 1);
  const roadRough = tex(smear(rc.rough, blurPx(1024)), reps, 1, false);
  const roadGlow = tex(rc.glow, reps, 1);
  scroll.push(roadMap, roadRough, roadGlow);
  {
    const geo = new THREE.PlaneGeometry(LEN, 2 * HALF_W);
    geo.rotateX(-Math.PI / 2);
    geo.rotateY(-Math.PI / 2); // u along +z
    geo.translate(0, 0, (Z0 + Z1) / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({map: roadMap, roughnessMap: roadRough, roughness: 0.62, metalness: 0, emissiveMap: roadGlow, emissive: '#ffffff', emissiveIntensity: 0.17, envMapIntensity: 1.1}));
    m.receiveShadow = true;
    g.add(m);
    g.userData.road = m;
  }
  // kerbs with a painted edge
  for (const s of [-1, 1]) {
    const k = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.24, LEN), new THREE.MeshStandardMaterial({color: '#4a4844', roughness: 0.8}));
    k.position.set(s * (HALF_W - 0.35), 0.12, (Z0 + Z1) / 2);
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, LEN), new THREE.MeshStandardMaterial({color: '#c9a227', roughness: 0.6}));
    e.position.set(s * (HALF_W - 0.72), 0.245, (Z0 + Z1) / 2);
    g.add(k, e);
  }
  // things that pass: lamps (two rows), cable trays on brackets, a jet fan every sixth pitch
  const NL = Math.ceil(LEN / PITCH);
  const streak = (V / FPS) * 0.5;
  const lampGeo = new THREE.BoxGeometry(0.34, 0.07, 1.25 + streak);
  const lampMat = new THREE.MeshBasicMaterial({color: new THREE.Color(SODIUM).multiplyScalar(3.4)});
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, NL * 2);
  const housGeo = new THREE.BoxGeometry(0.46, 0.12, 1.5 + streak);
  const hous = new THREE.InstancedMesh(housGeo, new THREE.MeshStandardMaterial({color: '#1b1c1e', roughness: 0.6}), NL * 2);
  const ribGeo = new THREE.BoxGeometry(0.1, 0.5, 0.12 + streak);
  const ribs = new THREE.InstancedMesh(ribGeo, new THREE.MeshStandardMaterial({color: '#2a2b2d', roughness: 0.7}), NL * 4);
  lamps.frustumCulled = hous.frustumCulled = ribs.frustumCulled = false;
  g.add(lamps, hous, ribs);
  for (const s of [-1, 1]) {
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, LEN), new THREE.MeshStandardMaterial({color: '#2b2c2f', roughness: 0.55, metalness: 0.6}));
    tray.position.set(s * 6.1, 5.0, (Z0 + Z1) / 2);
    g.add(tray);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, LEN, 8), new THREE.MeshStandardMaterial({color: ['#16171a', '#3a2a1a', '#16171a'][i], roughness: 0.5}));
      c.rotation.x = Math.PI / 2;
      c.position.set(s * (5.95 + i * 0.15), 5.08, (Z0 + Z1) / 2);
      g.add(c);
    }
  }
  const fans = [];
  for (let i = 0; i < 2; i++) {
    const f = new THREE.Group();
    for (const x of [-1.0, 1.0]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 4.2, 24, 1, true), new THREE.MeshStandardMaterial({color: '#3b3d40', roughness: 0.45, metalness: 0.7, side: THREE.DoubleSide}));
      b.rotation.x = Math.PI / 2;
      b.position.set(x, 5.95, 0);
      f.add(b);
    }
    g.add(f);
    fans.push(f);
  }
  const M = new THREE.Matrix4();
  const place = (dist) => {
    const off = mod(dist, PITCH);
    const u = -dist / PITCH;
    for (const t of scroll) t.offset.x = -u;
    let n = 0;
    let r = 0;
    for (let i = 0; i < NL; i++) {
      const z = Z0 + i * PITCH - off + PITCH;
      for (const s of [-1, 1]) {
        M.makeTranslation(s * LAMP_X, LAMP_Y, z);
        lamps.setMatrixAt(n, M);
        M.makeTranslation(s * LAMP_X, LAMP_Y + 0.085, z);
        hous.setMatrixAt(n++, M);
        M.makeTranslation(s * 6.1, 5.3, z + PITCH * 0.5);
        ribs.setMatrixAt(r++, M);
        M.makeTranslation(s * LAMP_X, LAMP_Y + 0.4, z + 0.5);
        ribs.setMatrixAt(r++, M);
      }
    }
    lamps.instanceMatrix.needsUpdate = hous.instanceMatrix.needsUpdate = ribs.instanceMatrix.needsUpdate = true;
    fans.forEach((f, i) => (f.position.z = mod(40 + i * PITCH * 9 - dist + 60, PITCH * 18) - 60));
  };
  return {group: g, place};
}

const FilmShader = {
  uniforms: {tDiffuse: {value: null}, uT: {value: 0}, uAspect: {value: 16 / 9}},
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uT; uniform float uAspect; varying vec2 vUv;
    float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c * vec2(1.0, 1.0 / uAspect) * 1.9, c * vec2(1.0, 1.0 / uAspect) * 1.9);
      // a touch of lateral colour towards the corners, as a real lens has
      vec2 d = c * r2 * 0.0035;
      vec3 col = vec3(texture2D(tDiffuse, vUv + d).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d).b);
      col *= mix(1.0, 0.42, clamp(r2 * 1.15, 0.0, 1.0));
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      float n = hash(gl_FragCoord.xy + fract(uT * 7.31) * 913.0) - 0.5;
      col += n * 0.028 * (1.0 - 0.6 * clamp(l, 0.0, 1.0));
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export function run() {
  const DEFAULTS = {duration: DURATION, fps: FPS, hud: {enabled: false, title: 'BMW 330e', subtitle: 'TUNNEL'}, director: {enabled: false}};
  runSim(DEFAULTS, async ({canvas, capture}) => {
    const R = rng(330);
    document.body.style.background = '#000';
    const renderer = new THREE.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#050403');
    scene.fog = new THREE.FogExp2('#1c1108', 0.0085);
    const camera = new THREE.PerspectiveCamera(33, 16 / 9, 0.1, 400);

    const tunnel = buildTunnel(R);
    scene.add(tunnel.group);
    const car = buildCar();
    scene.add(car.root);

    // ---- light. Three lamps of each row are real at any time: the ones nearest the car. They slide back with the
    // tunnel and jump forward by three pitches once they are well behind, so every lamp that reaches the car lights it.
    scene.add(new THREE.HemisphereLight('#5a4630', '#120d08', 0.3));
    const NLIGHT = 3;
    const lamps = [];
    for (const s of [-1, 1]) {
      for (let i = 0; i < NLIGHT; i++) {
        const l = new THREE.PointLight(SODIUM, 0, 26, 1.7);
        l.userData.s = s;
        l.userData.i = i;
        scene.add(l);
        lamps.push(l);
      }
    }
    // a soft key straight down for the shadows the parts drop on the road
    const key = new THREE.DirectionalLight('#ffc78a', 0.32);
    key.position.set(0.6, 9, 0.8);
    key.castShadow = true;
    Object.assign(key.shadow.camera, {left: -5.5, right: 5.5, top: 6, bottom: -6, near: 1, far: 14});
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 5;
    scene.add(key, key.target);
    // a cool edge from behind, the daylight of a portal far back
    const rim = new THREE.DirectionalLight('#8fb4ff', 0.16);
    rim.position.set(-3, 3.5, -9);
    scene.add(rim);
    // contact shadow under the car
    {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(0,0,0,.85)');
      gr.addColorStop(0.6, 'rgba(0,0,0,.45)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 5.6), new THREE.MeshBasicMaterial({map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4}));
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.004;
      scene.add(m);
      scene.userData.blob = m;
    }
    // the car's own lights travel with the panels that carry them
    const bumperF = car.byId.bumperF.obj;
    const beams = [];
    for (const s of [-1, 1]) {
      const sp = new THREE.SpotLight('#dfeaff', 20, 46, 0.34, 0.7, 1.6);
      sp.position.set(s * 0.6, 0.66, 2.1);
      sp.target.position.set(s * 0.9, -0.5, 22);
      bumperF.add(sp, sp.target);
      beams.push(sp);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20), new THREE.MeshBasicMaterial({color: new THREE.Color('#dfeaff').multiplyScalar(3)}));
      glow.position.set(s * 0.47, 0.648, 2.19);
      bumperF.add(glow);
    }
    const tail = new THREE.PointLight('#ff2a1a', 1.1, 6, 2);
    tail.position.set(0, 0.85, -2.7);
    car.byId.trunk.obj.add(tail);
    // lamps and rings burn: the tunnel is dim, so everything that glows goes above white for the bloom to catch
    car.root.traverse((n) => {
      for (const m of [n.material].flat()) {
      if (!m) continue;
      if (m.isMeshBasicMaterial && !m.map && (m.color.r + m.color.g + m.color.b > 2.6) && n.parent && n.parent.name === 'bumperF') m.color.multiplyScalar(2.4);
      if (m.emissive && m.color.r > 0.6 && m.color.g < 0.2 && m.emissiveIntensity > 0.3) {
        m.emissive.set('#ff1a10');
        m.emissiveIntensity = 2.6;
      }
      if (n.userData.tail) m.color.set('#ff2a1a').multiplyScalar(4);
      // a lamp's glint on polished glass or lacquer is a pinpoint far above white: soften the surface a little so it
      // reads as a highlight and not as a flare
      if (m.isMeshPhysicalMaterial && m.transparent && m.roughness < 0.1) m.roughness = 0.16;
      if (m.isMeshPhysicalMaterial && m.clearcoat > 0.5) m.clearcoatRoughness = Math.max(m.clearcoatRoughness, 0.14);
      }
    });
    // spokes blur into a disc at speed
    const blurDiscs = [];
    for (const w of car.A.wheels) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(128, 128, 20, 128, 128, 128);
      gr.addColorStop(0, 'rgba(200,205,212,.95)');
      gr.addColorStop(0.3, 'rgba(150,156,164,.7)');
      gr.addColorStop(0.82, 'rgba(120,126,134,.62)');
      gr.addColorStop(0.9, 'rgba(210,214,220,.9)');
      gr.addColorStop(1, 'rgba(210,214,220,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 256);
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.236, 48), new THREE.MeshStandardMaterial({map: new THREE.CanvasTexture(c), transparent: true, metalness: 0.9, roughness: 0.35, depthWrite: false}));
      d.rotation.y = Math.PI / 2;
      d.position.set(0.1, 0, 0);
      w.spin.parent.add(d);
      blurDiscs.push(d);
    }

    // ---- the drive, run once and tabulated: readout and running angles for every frame
    const veh = makeCar();
    const cmd = {target: V, mode: 'SPORT', plug: false, kick: false};
    for (let i = 0; i < 40 * 120; i++) stepCar(veh, 1 / 120, cmd);
    const NF = Math.round(DURATION * FPS) + 2;
    const frames = [];
    const ang = {wheel: 0, shaft: 0, rotor: 0, crank: 0, turbo: 0};
    const SLOW = 1 / 14; // the engine's insides run slowed so the strokes can be followed; the wheels run true
    const rr = Math.PI / 30;
    const d0 = veh.dist;
    for (let f = 0; f < NF; f++) {
      const o = veh.out;
      frames.push({o: {...o, elements: [...o.elements]}, dist: veh.dist - d0, ...ang});
      for (let k = 0; k < 2; k++) {
        const q = stepCar(veh, 1 / 120, cmd);
        const dt = 1 / 120;
        ang.wheel += q.wheelRpm * rr * dt;
        ang.shaft += q.shaftRpm * rr * dt * SLOW;
        ang.rotor += (q.k0 > 0.5 ? q.rpm : q.shaftRpm) * rr * dt * SLOW;
        ang.crank += q.rpm * rr * dt * SLOW;
        ang.turbo += (0.4 + q.turbo * 6) * dt * 3;
      }
    }

    // ---- reflections: the tunnel as the car sees it, re-taken every frame
    const pmrem = new THREE.PMREMGenerator(renderer);
    let env = null;
    const takeEnv = () => {
      car.root.visible = false;
      scene.userData.blob.visible = false;
      const fog = scene.fog;
      scene.fog = null;
      scene.environment = null;
      const next = pmrem.fromScene(scene, 0, 0.1, 300, {size: 128, position: new THREE.Vector3(0, 0.9, 0)});
      if (env) env.dispose();
      env = next;
      scene.environment = env.texture;
      scene.fog = fog;
      car.root.visible = true;
      scene.userData.blob.visible = true;
    };

    // ---- post
    const target = new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 4});
    const composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.28, 0.5, 1.0);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    const film = new ShaderPass(FilmShader);
    composer.addPass(film);

    const resize = () => {
      const w = innerWidth;
      const h = innerHeight;
      const pr = capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 1.5);
      renderer.setPixelRatio(pr);
      renderer.setSize(w, h, false);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      film.uniforms.uAspect.value = w / h;
    };
    resize();

    const pulls = ORDER.map((id, i) => ({p: car.byId[id], t0: TL.pull.start + (i / (ORDER.length - 1)) * TL.pull.span}));
    const L = {explode: 0, hidden: new Set(), isolate: null, bodyMode: 'solid', selected: null, hover: null};
    await renderer.compileAsync(scene, camera);

    const render = (t) => {
      const fi = clamp(t * FPS, 0, NF - 1.001);
      const f0 = frames[Math.floor(fi)];
      const f1 = frames[Math.floor(fi) + 1];
      const u = fi - Math.floor(fi);
      const mix = (k) => f0[k] + (f1[k] - f0[k]) * u;
      const dist = mix('dist');
      tunnel.place(dist);
      // the car
      car.seek({wheel: mix('wheel'), shaft: mix('shaft'), rotor: mix('rotor'), crank: mix('crank'), turbo: mix('turbo'), beads: t * 0.16});
      car.update(f0.o, 0, 1);
      let out = 0;
      for (const q of pulls) {
        // each part leaves fast and settles slowly, and keeps drifting a little once it is out
        const k = outQuint((t - q.t0) / TL.pull.each);
        q.p.pull = k * (1 + 0.06 * clamp((t - q.t0 - TL.pull.each) / 4, 0, 1));
        out = Math.max(out, k);
      }
      car.look(10, L);
      for (const d of blurDiscs) d.material.opacity = 0.92;
      scene.userData.blob.material.opacity = 1 - 0.55 * out;
      // lamps
      const off = mod(dist, PITCH);
      for (const l of lamps) {
        const z = mod(l.userData.i * PITCH - off + PITCH * 1.2, PITCH * NLIGHT) - PITCH * 1.2;
        l.position.set(l.userData.s * LAMP_X, LAMP_Y - 0.25, z);
        // fade in and out at the ends of the run so the jump forward is never seen
        const edge = Math.min(z + PITCH * 1.2, PITCH * (NLIGHT - 1.2) - z) / (PITCH * 0.5);
        l.intensity = 34 * ss(edge);
      }
      // camera: the rig's path plus the small shake of a tracking car
      const [az, el, d, ty, tz] = camAt(t);
      const a = az * D2R;
      const e = el * D2R;
      const sh = (f, p) => Math.sin(t * f + p) * 0.5 + Math.sin(t * f * 2.31 + p * 1.7) * 0.3 + Math.sin(t * f * 4.9 + p * 0.3) * 0.2;
      const px = d * Math.cos(e) * Math.sin(a) + sh(9, 1) * 0.008;
      const py = ty + d * Math.sin(e) + sh(11, 2) * 0.01;
      const pz = tz + d * Math.cos(e) * Math.cos(a) + sh(7, 3) * 0.008;
      camera.position.set(clamp(px, -HALF_W + 0.9, HALF_W - 0.9), Math.max(0.35, py), pz);
      camera.lookAt(sh(5, 4) * 0.006, ty + sh(6, 5) * 0.006, tz);
      camera.updateMatrixWorld();
      takeEnv();
      film.uniforms.uT.value = t;
      composer.render();
      return {};
    };
    return {render, resize};
  });
}
