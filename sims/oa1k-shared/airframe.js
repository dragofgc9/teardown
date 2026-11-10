// OA-1K Skyraider II (Air Tractor AT-802U, missionised by L3Harris), built from code as separable parts.
//
// Every station comes off Air Tractor's own AT-802U dimensional drawings (802u.com, side / top / front line drawings):
// span 59.25 ft, chord 6.83 ft, tailplane span 19.67 ft, wheel track 10 ft, wheelbase 23.8 ft, prop 118 in. The side
// drawing shows the aeroplane resting on its tailwheel, so the model is built in that attitude: x = metres aft of the
// spinner tip, y = metres above the ramp, z = metres to port. The cockpit follows Air Tractor's 360 cockpit tour of the
// AT-802 (tube roll cage, top-hinged doors with red latches, twin roof skylights, power quadrant on the port wall).
import * as THREE from 'three';
import {ball, bodyLoft, box, curve1, foilLoop, latheX, lerp, loft, merge, mirrorZ, naca, pipe, place, poly, profile, ring, tube, tubes} from './geo.js';

const FT = 0.3048;
const RAD = Math.PI / 180;
const PI = Math.PI;

export const DIM = {
  span: 59.25 * FT, chord: 6.83 * FT, tailSpan: 19.67 * FT, track: 10 * FT, wheelbase: 23.8 * FT,
  propDia: 118 * 0.0254, tyreDia: 30 * 0.0254,
  attitude: 6.5,   // fuselage datum, nose up, sitting on the tailwheel
  wingAngle: 9.4,  // wing chord line to the ramp in that attitude, measured on the side drawing
  dihedral: 3.5,
};

export const SPEC = [
  ['Airframe', 'Air Tractor AT-802U, built in Olney, Texas; missionised by L3Harris in Tulsa'],
  ['Engine', 'Pratt & Whitney Canada PT6A-67F, 1,600 shp at 1,700 prop rpm'],
  ['Propeller', 'Hartzell 5-blade, 118 in (300 cm), 39 in ground clearance'],
  ['Wingspan', '59.25 ft (18.06 m)'],
  ['Wing area', '401 sq ft (37.25 sq m), 6.83 ft chord'],
  ['Length', '37.5 ft (11.4 m)'],
  ['Height', '13 ft at the prop tip, 11.2 ft at the fin'],
  ['Gross weight', '16,000 lb (7,257 kg)'],
  ['Empty, with armor', '7,836 lb (3,703 kg)'],
  ['Useful load', '8,164 lb (4,000 kg)'],
  ['Fuel', '380 US gal in the wings, 360 US gal in the fuselage'],
  ['Max speed', '213 kt at 10,000 ft, no weapons'],
  ['Patrol speed', '180 kt at 10,000 ft on 71 US gal/h'],
  ['Stall', '91 kt at gross weight, flaps down'],
  ['Range', '1,303 nm at 8,000 ft with fuselage fuel'],
  ['Takeoff roll', '1,400 ft at 14,500 lb with sensors and weapons'],
  ['Landing run', '1,200 ft'],
  ['Hardpoints', '8 wing (500 lb class), 2 centerline (1,000 lb class)'],
];

// ---- materials: one fresh instance per part, so parts can be lit, ghosted and x-rayed on their own ----
const std = (color, rough, metal, extra = {}) => () => new THREE.MeshStandardMaterial({color, roughness: rough, metalness: metal, side: THREE.DoubleSide, ...extra});
const MAT = {
  paint: std(0x62686e, 0.6, 0.15),
  paintDk: std(0x2b2e32, 0.7, 0.1),
  inner: std(0x8d9398, 0.7, 0.1),
  tubeGrey: std(0x979da2, 0.55, 0.3),
  steel: std(0xc2c6ca, 0.34, 0.9),
  dkSteel: std(0x5a5f65, 0.45, 0.8),
  burnt: std(0x8b6f52, 0.42, 0.85),
  alu: std(0xaeb3b8, 0.4, 0.75),
  gold: std(0x9c8a5c, 0.45, 0.7),
  black: std(0x1c1d1f, 0.6, 0.2),
  tyre: std(0x1a1b1d, 0.92, 0.0),
  glass: std(0x9fc6cc, 0.06, 0.1, {transparent: true, opacity: 0.24, depthWrite: false}),
  lens: std(0x10161c, 0.05, 0.6),
  tank: std(0x8e8250, 0.8, 0.0),
  armor: std(0x5c5a49, 0.85, 0.0),
  olive: std(0x565b46, 0.7, 0.1),
  missile: std(0x8f959a, 0.5, 0.3),
  sensor: std(0x3c4044, 0.5, 0.4),
  seat: std(0x2c2e30, 0.9, 0.0),
  strap: std(0xa8966a, 0.9, 0.0),
  red: std(0xc0321f, 0.5, 0.1),
  green: std(0x2f9c58, 0.5, 0.1),
  blue: std(0x2f63b8, 0.5, 0.1),
  yellow: std(0xe0b21a, 0.6, 0.1),
  wire: std(0x3a3d40, 0.5, 0.6),
};

// ---- fuselage stations, read off the side and top drawings ----
const A = profile([ // spinner backplate to the windshield base
  {x: 0.47, top: 2.78, bot: 2.32, hw: 0.30, n: 2.0},
  {x: 0.87, top: 2.82, bot: 2.16, hw: 0.40, n: 2.3},
  {x: 1.76, top: 2.88, bot: 1.96, hw: 0.52, n: 2.6},
  {x: 2.84, top: 2.95, bot: 1.73, hw: 0.64, n: 3.0},
  {x: 3.88, top: 2.98, bot: 1.51, hw: 0.72, n: 3.6},
  {x: 4.84, top: 3.00, bot: 1.36, hw: 0.73, n: 4.0},
]);
const B = profile([ // cabin tub (its "top" is 0.25 m above the door sill, the skin is cut at the sill) and aft fuselage
  {x: 4.84, top: 2.77, bot: 1.36, hw: 0.73, n: 4},
  {x: 5.60, top: 2.67, bot: 1.23, hw: 0.72, n: 4},
  {x: 6.40, top: 2.55, bot: 1.16, hw: 0.66, n: 4},
  {x: 7.17, top: 2.40, bot: 1.10, hw: 0.57, n: 4},
  {x: 7.60, top: 2.27, bot: 1.07, hw: 0.52, n: 4},
  {x: 8.00, top: 2.19, bot: 1.05, hw: 0.48, n: 3.8},
  {x: 9.00, top: 1.97, bot: 1.01, hw: 0.33, n: 3.5},
  {x: 9.80, top: 1.78, bot: 0.99, hw: 0.20, n: 3.0},
  {x: 10.5, top: 1.63, bot: 0.97, hw: 0.07, n: 2.5},
]);
const FIREWALL = 2.84, CAB0 = 4.84, CAB1 = 7.17;
const sill = (x) => lerp(2.52, 2.18, (x - CAB0) / (CAB1 - CAB0));
const sillAngle = (p) => {
  const yc = (p.top + p.bot) / 2, ry = (p.top - p.bot) / 2;
  return Math.asin(Math.pow(Math.min(1, Math.max(0, (sill(p.x) - yc) / ry)), p.n / 2));
};
const zSill = (x) => { const p = B(x); return p.hw * Math.pow(Math.cos(sillAngle(p)), 2 / p.n); };
const roofY = curve1([[5.53, 3.34], [6.55, 3.36], [7.05, 3.17], [7.3, 2.98], [7.6, 2.66], [8.0, 2.21]]);
const ROOF_HW = 0.3;

// ---- wing ----
const W = {xLE: 3.25, yLE: 2.07, zRoot: 0.74, zTip: DIM.span / 2, c: DIM.chord, inc: DIM.wingAngle * RAD, dih: DIM.dihedral * RAD};
const F4415 = naca(0.04, 0.4, 0.15);
const thin = (foil, k) => (c) => { const f = foil(c); return {yc: f.yc, yt: f.yt * k}; };
const wingFrame = (z, sc = 1) => {
  const ci = Math.cos(W.inc), si = Math.sin(W.inc), c = W.c * sc, sh = (W.c - c) / 2;
  return {
    o: [W.xLE + sh * ci, W.yLE + (Math.abs(z) - W.zRoot) * Math.tan(W.dih) - sh * si, z],
    cv: [c * ci, -c * si, 0], tv: [c * si, c * ci, 0],
  };
};
const wingLoop = (z, c0, c1, foil = F4415, sc = 1, n = 16) => foilLoop({...wingFrame(z, sc), foil, c0, c1, n});
// A point on the wing surface: chord fraction c, s = +1 upper skin, -1 lower skin, 0 chord line.
const wpt = (z, c, s = 0, drop = 0) => {
  const f = wingFrame(z), {yc, yt} = F4415(c), h = yc + s * yt;
  return [f.o[0] + f.cv[0] * c + f.tv[0] * h, f.o[1] + f.cv[1] * c + f.tv[1] * h - drop, z];
};

// ---- engine axis: prop flange, then down the thrust line ----
const E0 = [0.55, 2.545, 0];
const eng = (u, yl = 0, zl = 0) => {
  const a = DIM.attitude * RAD;
  return [E0[0] + u * Math.cos(a) + yl * Math.sin(a), E0[1] - u * Math.sin(a) + yl * Math.cos(a), zl];
};

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// The front panel: flight displays, a standby cluster and switch rows. The OA-1K's real layout is not published in
// detail, so this is a representative glass panel on the AT-802's panel outline.
function panelTex(rear) {
  return canvasTex(1024, rear ? 512 : 448, (g, w, h) => {
    g.fillStyle = '#17191b'; g.fillRect(0, 0, w, h);
    const screen = (x, y, sw, sh, kind) => {
      g.fillStyle = '#060809'; g.fillRect(x - 8, y - 8, sw + 16, sh + 16);
      g.fillStyle = kind === 'video' ? '#3b4142' : '#0c1a22'; g.fillRect(x, y, sw, sh);
      g.save(); g.beginPath(); g.rect(x, y, sw, sh); g.clip();
      if (kind === 'pfd') {
        g.fillStyle = '#2f6fa8'; g.fillRect(x, y, sw, sh * 0.5);
        g.fillStyle = '#6a4a2a'; g.fillRect(x, y + sh * 0.5, sw, sh * 0.5);
        g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y + sh * 0.5); g.lineTo(x + sw, y + sh * 0.5); g.stroke();
        g.strokeStyle = '#ffd21a'; g.lineWidth = 5; g.beginPath(); g.moveTo(x + sw * 0.3, y + sh * 0.52); g.lineTo(x + sw * 0.44, y + sh * 0.52); g.lineTo(x + sw * 0.5, y + sh * 0.58); g.lineTo(x + sw * 0.56, y + sh * 0.52); g.lineTo(x + sw * 0.7, y + sh * 0.52); g.stroke();
        g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(x + 8, y + 20, 44, sh - 40); g.fillRect(x + sw - 52, y + 20, 44, sh - 40);
        g.fillStyle = '#fff'; g.font = '600 18px monospace'; g.fillText('180', x + 12, y + sh * 0.52); g.fillText('100', x + sw - 50, y + sh * 0.52);
      } else if (kind === 'map') {
        g.strokeStyle = '#1f5d4a'; g.lineWidth = 2;
        for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(x, y + i * 40 + 12); g.bezierCurveTo(x + sw * 0.3, y + i * 40 - 20, x + sw * 0.6, y + i * 40 + 50, x + sw, y + i * 40); g.stroke(); }
        g.strokeStyle = '#2bd0e8'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + sw * 0.5, y + sh * 0.85); g.lineTo(x + sw * 0.42, y + sh * 0.5); g.lineTo(x + sw * 0.66, y + sh * 0.22); g.stroke();
        g.strokeStyle = '#e8e8e8'; g.beginPath(); g.arc(x + sw * 0.5, y + sh * 0.85, sh * 0.62, PI * 1.2, PI * 1.8); g.stroke();
        g.fillStyle = '#ffd21a'; g.beginPath(); g.moveTo(x + sw * 0.5, y + sh * 0.8); g.lineTo(x + sw * 0.47, y + sh * 0.9); g.lineTo(x + sw * 0.53, y + sh * 0.9); g.fill();
      } else if (kind === 'video') {
        g.fillStyle = '#565d5e'; g.fillRect(x + sw * 0.1, y + sh * 0.55, sw * 0.5, sh * 0.2);
        g.fillStyle = '#7b8384'; g.fillRect(x + sw * 0.55, y + sh * 0.3, sw * 0.25, sh * 0.16);
        g.strokeStyle = '#d7f5d0'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x + sw * 0.5 - 40, y + sh * 0.5); g.lineTo(x + sw * 0.5 - 10, y + sh * 0.5); g.moveTo(x + sw * 0.5 + 10, y + sh * 0.5); g.lineTo(x + sw * 0.5 + 40, y + sh * 0.5);
        g.moveTo(x + sw * 0.5, y + sh * 0.5 - 40); g.lineTo(x + sw * 0.5, y + sh * 0.5 - 10); g.moveTo(x + sw * 0.5, y + sh * 0.5 + 10); g.lineTo(x + sw * 0.5, y + sh * 0.5 + 40); g.stroke();
        g.fillStyle = '#d7f5d0'; g.font = '600 15px monospace'; g.fillText('EO  WFOV', x + 10, y + 22); g.fillText('LRF ----', x + sw - 90, y + 22);
      } else {
        g.fillStyle = '#35d07a'; g.font = '600 16px monospace';
        ['TQ', 'ITT', 'NG', 'NP', 'OIL', 'FUEL'].forEach((t, i) => { g.fillText(t, x + 10, y + 26 + i * 30); g.fillRect(x + 64, y + 14 + i * 30, (sw - 80) * (0.45 + 0.08 * ((i * 7) % 5)), 12); });
      }
      g.restore();
    };
    const gauge = (cx, cy, r) => {
      g.fillStyle = '#060809'; g.beginPath(); g.arc(cx, cy, r + 6, 0, PI * 2); g.fill();
      g.fillStyle = '#101214'; g.beginPath(); g.arc(cx, cy, r, 0, PI * 2); g.fill();
      g.strokeStyle = '#e9e9e9'; g.lineWidth = 2;
      for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78); g.lineTo(cx + Math.cos(a) * r * 0.94, cy + Math.sin(a) * r * 0.94); g.stroke(); }
      g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + r * 0.6, cy - r * 0.45); g.stroke();
    };
    const switches = (x, y, n, sw) => {
      for (let i = 0; i < n; i++) {
        g.fillStyle = '#0a0b0c'; g.fillRect(x + i * sw, y, sw - 8, 34);
        g.fillStyle = '#c9ccd0'; g.fillRect(x + i * sw + (sw - 8) / 2 - 4, y + 6, 8, 18);
        g.fillStyle = i % 5 === 0 ? '#e0b21a' : '#8d9398'; g.fillRect(x + i * sw + 4, y + 38, sw - 16, 4);
      }
    };
    if (rear) {
      screen(40, 40, 440, 300, 'video'); screen(544, 40, 440, 300, 'map');
      switches(40, 380, 12, 38); switches(544, 380, 12, 38);
      g.fillStyle = '#8d9398'; g.font = '600 20px monospace'; g.fillText('SENSOR', 40, 470); g.fillText('TACTICAL', 544, 470);
    } else {
      gauge(74, 96, 46); gauge(74, 214, 46); gauge(950, 96, 46); gauge(950, 214, 46);
      screen(150, 36, 300, 250, 'pfd'); screen(482, 36, 200, 250, 'eng'); screen(714, 36, 170, 250, 'map');
      g.fillStyle = '#7a1d14'; g.fillRect(150, 300, 734, 16);
      g.fillStyle = '#f3d9a0'; g.font = '600 13px monospace'; g.fillText('MASTER ARM   FIRE   GEN OUT   FUEL PRESS   CHIP   DOOR', 162, 313);
      switches(60, 340, 22, 41);
      g.fillStyle = '#8d9398'; g.font = '600 18px monospace'; g.fillText('LIGHTS', 60, 420); g.fillText('FUEL / START', 330, 420); g.fillText('STORES', 700, 420);
    }
  });
}
// Low-visibility national insignia for the aft fuselage.
const insigniaTex = () => canvasTex(512, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = '#3d4247'; g.fillStyle = '#3d4247'; g.lineWidth = 9;
  g.beginPath(); g.arc(256, 128, 92, 0, PI * 2); g.stroke();
  g.strokeRect(36, 88, 440, 80);
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -PI / 2 + (i * PI) / 5, r = i % 2 ? 34 : 86; g[i ? 'lineTo' : 'moveTo'](256 + Math.cos(a) * r, 128 + Math.sin(a) * r); }
  g.closePath(); g.fill();
  g.fillRect(36, 122, 128, 12); g.fillRect(348, 122, 128, 12);
});

export function buildAircraft() {
  const root = new THREE.Group();
  const parts = [];
  const byId = {};

  function part(id, name, sys, off, facts, opt = {}) {
    const p = {id, name, sys, off: new THREE.Vector3(...off), facts, group: new THREE.Group(), mats: {}, skin: !!opt.skin, hinge: opt.hinge || null,
      home: new THREE.Vector3(...(opt.pivot || [0, 0, 0])), hidden: false, meshes: []};
    p.group.position.copy(p.home);
    p.holder = p.group;
    if (opt.spin) {
      p.group.rotation.z = -DIM.attitude * RAD;
      p.holder = new THREE.Group();
      p.group.add(p.holder);
      p.spin = p.holder;
    }
    p.mat = (key) => (p.mats[key] ||= MAT[key]());
    p.add = (g, key, m) => {
      if (!opt.spin && opt.pivot) g.translate(-p.home.x, -p.home.y, -p.home.z);
      const mesh = new THREE.Mesh(g, m || p.mat(key));
      mesh.castShadow = key !== 'glass';
      mesh.receiveShadow = true;
      mesh.userData.part = p;
      p.holder.add(mesh);
      p.meshes.push(mesh);
      return mesh;
    };
    parts.push(p); byId[id] = p; root.add(p.group);
    return p;
  }
  const both = (g) => merge([g, mirrorZ(g)]);

  // ================= powerplant =================
  {
    const p = part('prop', 'Propeller', 'Powerplant', [-2.4, 0, 0], [
      'Hartzell 5-blade constant-speed propeller with a titanium dome.',
      '118 in (300 cm) diameter, aluminum blades.',
      '39 in (0.99 m) of ground clearance: here the lowest tip passes 1.05 m above the ramp.',
      'Turns 1,700 rpm at takeoff power.',
    ], {pivot: [0.4, 2.56, 0], spin: true});
    p.add(latheX([[-0.4, 0], [-0.37, 0.05], [-0.28, 0.11], [-0.15, 0.165], [0, 0.2], [0.07, 0.205], [0.07, 0.02]], 28), 'paintDk');
    const chord = curve1([[0.18, 0.12], [0.45, 0.2], [0.9, 0.25], [1.25, 0.22], [1.42, 0.14], [1.4986, 0.04]]);
    const pitch = curve1([[0.18, 62], [0.6, 46], [1.0, 34], [1.4986, 24]]);
    const f = naca(0, 0.4, 0.1);
    const loops = [];
    const R = DIM.propDia / 2;
    for (let i = 0; i <= 14; i++) {
      const r = lerp(0.18, R, i / 14), c = chord(r), b = pitch(r) * RAD, k = lerp(1.6, 0.7, i / 14);
      const cv = [c * Math.sin(b), 0, c * Math.cos(b)], tv = [c * Math.cos(b) * k, 0, -c * Math.sin(b) * k];
      loops.push(foilLoop({o: [-0.05 - cv[0] / 2, r, -cv[2] / 2], cv, tv, foil: f, n: 8}));
    }
    const blade = loft(loops, {capEnd: true});
    const blades = [], cuffs = [];
    for (let k = 0; k < 5; k++) {
      const b = blade.clone(); b.rotateX((k * 2 * PI) / 5); blades.push(b);
      const c = tube([-0.05, 0.1, 0], [-0.05, 0.3, 0], 0.055, 12); c.rotateX((k * 2 * PI) / 5); cuffs.push(c);
    }
    p.add(merge(blades), 'black');
    p.add(merge(cuffs), 'steel');
  }
  {
    const top = part('cowlTop', 'Upper cowling', 'Powerplant', [-0.7, 1.25, 0], [
      'Lift-off upper cowl over the PT6A, hot section and oil tank.',
      'The dark strip is the anti-glare panel that runs back to the windshield.',
    ], {skin: true});
    top.add(bodyLoft(A, 0.47, FIREWALL, 16, 0, PI, 28, {capStart: true}), 'paint');
    top.add(bodyLoft(A, 0.47, FIREWALL, 16, PI / 2 - 0.55, PI / 2 + 0.55, 10, {grow: 0.004}), 'paintDk');
    const bot = part('cowlBot', 'Lower cowling', 'Powerplant', [-0.7, -0.95, 0], [
      'Carries the chin air inlet for the engine and oil cooler under the spinner.',
      'Exhaust stubs exit through both sides just behind the propeller, as on every PT6: the engine sits back to front.',
    ], {skin: true});
    bot.add(bodyLoft(A, 0.47, FIREWALL, 16, PI, 2 * PI, 28, {capStart: true}), 'paint');
    bot.add(ball([0.5, 2.39, 0], 0.1, 0.5, 0.55, 2.0), 'black');
    bot.add(box([2.3, 2.02, 0.565], [0.42, 0.34, 0.1]), 'paint');
  }
  {
    const p = part('engine', 'PT6A-67F turboprop', 'Powerplant', [-1.35, 0, 0], [
      'Pratt & Whitney Canada PT6A-67F: 1,600 shp for takeoff and maximum continuous.',
      'Reverse flow, free turbine: air enters through the screen at the back, burns forward, and leaves through the two stubs behind the prop.',
      'Reduction gearbox at the front brings the power turbine down to 1,700 prop rpm.',
      'Patrol burn is about 71 US gal per hour at 180 kt.',
    ]);
    const at = (g) => place(g, E0, -DIM.attitude);
    p.add(at(latheX([[0, 0.07], [0, 0.11], [0.05, 0.13], [0.06, 0.2], [0.14, 0.215], [0.3, 0.2], [0.36, 0.16]], 24)), 'gold');
    p.add(at(latheX([[0.36, 0.16], [0.4, 0.235], [0.62, 0.245], [0.66, 0.2]], 24)), 'burnt');
    p.add(at(latheX([[0.66, 0.2], [0.7, 0.235], [1.05, 0.235], [1.1, 0.19]], 24)), 'steel');
    p.add(at(latheX([[1.1, 0.19], [1.46, 0.185]], 24)), 'alu');
    p.add(at(latheX([[1.46, 0.2], [1.62, 0.2]], 24)), 'black');
    p.add(at(latheX([[1.62, 0.215], [1.78, 0.215], [1.8, 0.1], [1.8, 0]], 24)), 'alu');
    // fuel manifold ring, igniters, accessories on the rear gearbox
    const ringG = new THREE.TorusGeometry(0.25, 0.012, 6, 28); ringG.rotateY(PI / 2); ringG.translate(0.86, 0, 0);
    const bits = [ringG, tube([1.78, 0.1, 0.08], [2.02, 0.1, 0.08], 0.07, 12), tube([1.78, -0.08, -0.1], [1.95, -0.08, -0.1], 0.05, 10),
      box([1.7, -0.26, 0], [0.16, 0.12, 0.14]), box([0.2, 0.25, 0], [0.12, 0.1, 0.1])];
    for (let k = 0; k < 14; k++) { const a = (k / 14) * 2 * PI; bits.push(tube([0.86, 0.25 * Math.cos(a), 0.25 * Math.sin(a)], [0.8, 0.235 * Math.cos(a), 0.235 * Math.sin(a)], 0.012, 5)); }
    p.add(at(merge(bits)), 'dkSteel');
    const stub = merge([pipe([[0.5, 0, 0.19], [0.52, 0.01, 0.34], [0.6, 0.01, 0.47], [0.74, 0, 0.55]], 0.095, 14), tube([0.74, 0, 0.55], [0.98, -0.01, 0.6], 0.095, 14, 0.105)]);
    p.add(at(both(stub)), 'burnt');
    p.add(at(both(tube([0.975, -0.01, 0.599], [0.985, -0.01, 0.601], 0.09, 14))), 'black');
    const m = part('mount', 'Engine mount truss', 'Powerplant', [-0.55, 0, 0], [
      'Welded steel tube truss from the firewall to the engine mount ring.',
      'The whole powerplant comes off as one unit at these four firewall fittings.',
    ]);
    const mr = new THREE.TorusGeometry(0.262, 0.016, 6, 28); mr.rotateY(PI / 2); mr.translate(1.08, 0, 0);
    const pairs = [];
    const fw = A(FIREWALL), yc = (fw.top + fw.bot) / 2;
    for (const sy of [1, -1]) for (const sz of [1, -1]) {
      const corner = [FIREWALL, yc + sy * 0.36, sz * 0.42];
      pairs.push([corner, eng(1.08, sy * 0.25, sz * 0.08)], [corner, eng(1.08, sy * 0.08, sz * 0.25)]);
    }
    m.add(merge([at(mr), tubes(pairs, 0.017)]), 'tubeGrey');
    const ea = part('engArmor', 'Engine armor', 'Powerplant', [-0.3, -1.25, 0], [
      'Lightweight composite ballistic panels around the lower engine bay.',
      'Developed over years of coca eradication flying in South America, where AT-802s took ground fire at low level.',
    ]);
    ea.add(bodyLoft(A, 1.25, 2.78, 6, PI + 0.45, 2 * PI - 0.45, 14, {scale: 0.9}), 'armor');
    const f = part('firewall', 'Firewall', 'Powerplant', [-0.28, 0, 0], [
      'Stainless bulkhead between the engine bay and the fuselage tank.',
      'The fuel shutoff control system closes the lines here.',
    ]);
    f.add(bodyLoft(A, FIREWALL - 0.02, FIREWALL, 1, 0, 2 * PI, 36, {scale: 0.975, capStart: true, capEnd: true}), 'steel');
  }

  // ================= fuselage =================
  const sideRange = (s) => (s > 0 ? [-PI / 2, PI / 2] : [PI / 2, (3 * PI) / 2]);
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'L' : 'R', sideName = s > 0 ? 'port' : 'starboard';
    const [a0, a1] = sideRange(s);
    const f = part('fwdSkin' + tag, `Forward fuselage skin, ${sideName}`, 'Fuselage', [0, 0.2, s * 1.35], [
      'Removable aluminum side panel between the firewall and the cockpit.',
      'On a crop duster this bay holds the 800 gal hopper. On the AT-802U it holds the fuselage fuel tank and the forward mission equipment bay.',
    ], {skin: true});
    f.add(bodyLoft(A, FIREWALL, CAB0, 12, a0, a1, 22, {capEnd: true}), 'paint');
    f.add(bodyLoft(A, FIREWALL, CAB0, 12, s > 0 ? PI / 2 - 0.5 : PI / 2, s > 0 ? PI / 2 : PI / 2 + 0.5, 6, {grow: 0.004}), 'paintDk');

    const c = part('cabSkin' + tag, `Cockpit side skin, ${sideName}`, 'Fuselage', [0, -0.1, s * 1.55], [
      'Outer skin below the door sill. The armor tub sits directly behind it.',
    ], {skin: true});
    c.add(bodyLoft(B, CAB0, CAB1, 12, s > 0 ? -PI / 2 : (p) => PI - sillAngle(p), s > 0 ? sillAngle : (3 * PI) / 2, 16), 'paint');

    const a = part('aftSkin' + tag, `Aft fuselage skin, ${sideName}`, 'Fuselage', [0.6, 0, s * 1.25], [
      'Light removable panels over the tube frame, so the structure can be inspected and repaired in the field.',
    ], {skin: true});
    a.add(bodyLoft(B, CAB1, 10.5, 18, a0, a1, 18, {capEnd: true}), 'paint');
    // low-visibility insignia, laid on the tapering side
    const x0 = 8.25, x1 = 9.05, z0 = B(x0).hw + 0.012, z1 = B(x1).hw + 0.012;
    const dec = new THREE.PlaneGeometry(Math.hypot(x1 - x0, z1 - z0), 0.42);
    dec.rotateY(s * Math.atan2(z0 - z1, x1 - x0) + (s > 0 ? 0 : PI));
    dec.translate((x0 + x1) / 2, 1.55, (s * (z0 + z1)) / 2);
    const dm = new THREE.MeshStandardMaterial({map: insigniaTex(), transparent: true, roughness: 0.7, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2});
    a.mats.decal = dm;
    const dmesh = a.add(dec, 'decal', dm);
    dmesh.castShadow = false;
  }
  {
    const p = part('frame', 'Steel tube fuselage frame', 'Fuselage', [0, 0, 0], [
      'Welded chromoly steel tube truss from the firewall to the sternpost.',
      'It absorbs energy in a crash: more than 2.5 million AT-802 flight hours stand behind the design.',
      'Wings, gear, engine mount and tail all bolt to this frame, which is why the aircraft can be broken down to fit a C-17 and rebuilt in a day.',
    ]);
    const xs = [FIREWALL, 3.5, 4.2, CAB0, 5.6, 6.35, CAB1, 8.0, 8.8, 9.6, 10.35];
    const corner = (x, sy, sz) => {
      const pr = x < CAB0 - 1e-6 ? A(x) : B(x), yc = (pr.top + pr.bot) / 2, ry = (pr.top - pr.bot) / 2;
      const inCab = x >= CAB0 - 1e-6 && x <= CAB1 + 1e-6;
      if (sy > 0 && inCab) return [x, sill(x) - 0.04, sz * zSill(x) * 0.93];
      return [x, yc + sy * ry * 0.82, sz * pr.hw * 0.82];
    };
    const pairs = [];
    xs.forEach((x, i) => {
      const cabMid = x > CAB0 + 0.1 && x < CAB1 - 0.1;
      const c = {tl: corner(x, 1, 1), tr: corner(x, 1, -1), bl: corner(x, -1, 1), br: corner(x, -1, -1)};
      pairs.push([c.tl, c.bl], [c.tr, c.br], [c.bl, c.br]);
      if (!cabMid) pairs.push([c.tl, c.tr]);
      if (i < xs.length - 1) {
        const x2 = xs[i + 1];
        const d = {tl: corner(x2, 1, 1), tr: corner(x2, 1, -1), bl: corner(x2, -1, 1), br: corner(x2, -1, -1)};
        pairs.push([c.tl, d.tl], [c.tr, d.tr], [c.bl, d.bl], [c.br, d.br]);
        pairs.push(i % 2 ? [c.tl, d.bl] : [c.bl, d.tl], i % 2 ? [c.tr, d.br] : [c.br, d.tr], i % 2 ? [c.bl, d.br] : [c.br, d.bl]);
        const midCab = x >= CAB0 - 1e-6 && x2 <= CAB1 + 1e-6;
        if (!midCab) pairs.push(i % 2 ? [c.tl, d.tr] : [c.tr, d.tl]);
      }
    });
    p.add(tubes(pairs, 0.019, 7), 'tubeGrey');
  }
  {
    const p = part('fuseTank', 'Fuselage fuel tank', 'Fuselage', [0, 2.45, 0], [
      '360 US gal (1,363 L) auxiliary tank where the hopper would be.',
      'Self-sealing, like the wing tanks and the fuel hoses.',
      'Rapid fuel jettison lets the crew dump it in an emergency.',
      'With it full, economy-cruise range is 1,303 nm.',
    ]);
    p.add(bodyLoft(A, 3.55, 4.74, 8, 0, 2 * PI, 32, {scale: 0.77, capStart: true, capEnd: true}), 'tank');
    p.add(tube([4.2, 2.95, 0], [4.2, 3.0, 0], 0.07, 14), 'steel');
    const b = part('bay', 'Forward mission equipment bay', 'Mission systems', [0, 1.3, 0], [
      'Racks for mission computers, radios and power conditioning behind the firewall.',
      'Fed by a dedicated electrical bus so mission kit can change without touching the flight systems.',
    ]);
    b.add(merge([box([3.2, 2.62, 0.28], [0.42, 0.34, 0.4]), box([3.2, 2.62, -0.28], [0.42, 0.34, 0.4]), box([3.2, 2.2, 0], [0.42, 0.3, 0.86])]), 'black');
    b.add(merge([box([3.2, 2.62, 0.28], [0.44, 0.04, 0.34]), box([3.2, 2.62, -0.28], [0.44, 0.04, 0.34]), box([3.2, 2.2, 0], [0.44, 0.04, 0.8]), box([3.2, 1.98, 0], [0.5, 0.03, 0.96])]), 'alu');
    const av = part('aftBay', 'Aft equipment shelf', 'Mission systems', [0.3, 1.5, 0], [
      'Battery, emergency locator transmitter and remote avionics behind the rear seat.',
      'Two-place diluter-demand oxygen is plumbed from here.',
    ]);
    av.add(merge([box([8.0, 1.62, 0.12], [0.36, 0.22, 0.26]), box([8.45, 1.56, -0.08], [0.3, 0.18, 0.3])]), 'black');
    av.add(merge([box([8.2, 1.48, 0], [1.0, 0.025, 0.62]), tube([7.72, 1.75, -0.2], [7.72, 2.05, -0.2], 0.075, 12)]), 'green');
    const jt = part('dump', 'Fuel jettison tube', 'Fuselage', [0.25, -0.8, 0], [
      'The angled tube under the wing trailing edge on Air Tractor’s side drawing.',
      'Shown here as the outlet for the fuselage tank’s emergency fuel dump.',
    ]);
    jt.add(tube([5.42, 1.42, 0.3], [5.62, 0.72, 0.3], 0.035, 10), 'paint');
  }

  // ================= cockpit =================
  const cab = (x, y, s) => [x, y, s]; // readability only
  const doorPts = (s, rear) => {
    const xa = rear ? 6.31 : 5.58, xb = rear ? 7.05 : 6.24;
    const tf = [xa, roofY(Math.max(5.53, xa)) - 0.02, s * ROOF_HW], tr = [xb, roofY(xb) - 0.02, s * ROOF_HW];
    const xbf = rear ? 6.31 : 4.99, xbr = rear ? 7.15 : 6.24;
    const bf = [xbf, sill(xbf) + 0.01, s * zSill(xbf)], br = [xbr, sill(xbr) + 0.01, s * zSill(xbr)];
    return {tf, tr, br, bf};
  };
  {
    const p = part('cage', 'Cockpit roll cage', 'Cockpit', [0, 1.75, 0], [
      'Steel tube roll cage strong enough to carry the full weight of the aircraft upside down.',
      'There are no ejection seats: the cage, the airbag harnesses and the energy-absorbing frame are the crash protection.',
      'Layout follows Air Tractor’s 360 cockpit tour: posts at the windshield, between the doors and behind the rear seat, with a V brace behind the front seat.',
    ]);
    const pairs = [];
    for (const s of [1, -1]) {
      const f = doorPts(s, false), r = doorPts(s, true);
      pairs.push(
        [[4.86, 3.0, s * 0.34], [5.53, 3.34, s * 0.28]], // windshield post
        [f.bf, [5.55, 3.33, s * ROOF_HW]], // door front post
        [[5.53, 3.34, s * ROOF_HW], [6.55, 3.36, s * ROOF_HW]], [[6.55, 3.36, s * ROOF_HW], [7.05, roofY(7.05), s * ROOF_HW]], // roof rail
        [[6.275, 3.35, s * ROOF_HW], [6.275, sill(6.275), s * zSill(6.275)]], // post between the doors
        [[7.05, roofY(7.05), s * ROOF_HW], [7.16, sill(7.16), s * zSill(7.16)]], // rear post
        [[6.3, 3.34, 0], [6.3, sill(6.3) + 0.02, s * zSill(6.3) * 0.96]], // V brace
        [f.bf, [6.275, sill(6.275), s * zSill(6.275)]], [[6.275, sill(6.275), s * zSill(6.275)], [7.16, sill(7.16), s * zSill(7.16)]], // sill rail
      );
    }
    for (const x of [5.53, 6.275, 7.05]) pairs.push([[x, roofY(x), ROOF_HW], [x, roofY(x), -ROOF_HW]]);
    pairs.push([[4.86, 3.0, 0.34], [4.86, 3.0, -0.34]], [[7.16, sill(7.16), zSill(7.16)], [7.16, sill(7.16), -zSill(7.16)]]);
    p.add(tubes(pairs, 0.024, 8), 'tubeGrey');
  }
  {
    const p = part('roof', 'Roof and turtledeck', 'Cockpit', [0.35, 2.75, 0], [
      'Fixed roof over both seats with two skylights, as seen overhead in the 360 tour.',
      'The turtledeck fairs the tall cabin down into the aft fuselage.',
    ], {skin: true});
    const loops = [];
    for (let i = 0; i <= 10; i++) {
      const x = lerp(5.5, 7.07, i / 10), y = roofY(Math.max(5.53, x));
      loops.push([[x, y + 0.03, ROOF_HW + 0.03], [x, y + 0.045, 0], [x, y + 0.03, -ROOF_HW - 0.03], [x, y - 0.005, -ROOF_HW - 0.03], [x, y - 0.005, ROOF_HW + 0.03]]);
    }
    p.add(loft(loops, {capStart: true, capEnd: true}), 'paint');
    const td = [];
    for (let i = 0; i <= 12; i++) {
      const x = lerp(7.05, 8.02, i / 12), base = lerp(2.2, 2.14, i / 12), top = Math.max(roofY(x), base + 0.05);
      td.push(ring({x, top, bot: 2 * base - top, hw: B(x).hw * (x < 7.3 ? 0.93 : 0.97), n: lerp(3.2, 2.2, i / 12)}, 0, PI, 20));
    }
    p.add(loft(td, {closed: false, capStart: true}), 'paint');
    p.add(merge([ball([5.95, 3.375, 0.13], 0.14, 1.5, 0.08, 0.8), ball([5.95, 3.375, -0.13], 0.14, 1.5, 0.08, 0.8), ball([6.75, 3.33, 0.13], 0.12, 1.4, 0.08, 0.8), ball([6.75, 3.33, -0.13], 0.12, 1.4, 0.08, 0.8)]), 'lens');
  }
  {
    const p = part('windshield', 'Ballistic windshield', 'Cockpit', [-0.95, 1.05, 0], [
      'Flat ballistic glass panels: a center pane and two quarter panes.',
      'Flat panes are easier to armor and cheap to replace in the field.',
    ]);
    const ws = [poly([[4.86, 3.0, 0.34], [4.86, 3.0, -0.34], [5.53, 3.34, -0.28], [5.53, 3.34, 0.28]])];
    for (const s of [1, -1]) ws.push(poly([[4.86, 3.0, s * 0.34], [5.53, 3.34, s * 0.28], [5.56, 3.32, s * ROOF_HW], [4.99, sill(4.99), s * zSill(4.99)], [4.86, 2.74, s * 0.69]]));
    p.add(merge(ws), 'glass');
  }
  for (const s of [1, -1]) for (const rear of [false, true]) {
    const d = doorPts(s, rear);
    const axis = new THREE.Vector3(d.tr[0] - d.tf[0], d.tr[1] - d.tf[1], 0).normalize();
    const p = part(`door${rear ? 'R' : 'F'}${s > 0 ? 'L' : 'R'}`, `${rear ? 'Rear' : 'Front'} cockpit door, ${s > 0 ? 'port' : 'starboard'}`, 'Cockpit', [0, 0.65, s * 1.95], [
      'Hinged along the roof rail and swings up, exactly as in the 360 tour. Use Doors to open all four.',
      'Ballistic glass in an armored frame. The red handle at the sill is the latch.',
      'Placards read: do not open door in flight.',
    ], {pivot: d.tf, hinge: {axis, sign: -s}});
    p.add(tubes([[d.tf, d.tr], [d.tr, d.br], [d.br, d.bf], [d.bf, d.tf]], 0.02, 8), 'paint');
    p.add(poly([d.tf, d.tr, d.br, d.bf]), 'glass');
    const lx = (d.bf[0] + d.br[0]) / 2;
    p.add(box([lx, sill(lx) + 0.05, s * (zSill(lx) - 0.035)], [0.12, 0.035, 0.03]), 'red');
  }
  {
    const p = part('tub', 'Armor tub and floor', 'Cockpit', [0, -1.15, 0], [
      'Composite ballistic armor "bathtub" around both seats: side panels, floor and footwell.',
      'Part of the 7,836 lb empty weight: that figure is quoted with armor fitted.',
    ]);
    p.add(bodyLoft(B, CAB0 + 0.06, CAB1 - 0.06, 10, (q) => PI - sillAngle(q) + 0.12, (q) => 2 * PI + sillAngle(q) - 0.12, 26, {scale: 0.94}), 'armor');
    const fl = [];
    for (let i = 0; i <= 6; i++) { const x = lerp(CAB0 + 0.08, CAB1 - 0.08, i / 6), w = B(x).hw * 0.86, y = B(x).bot + 0.36; fl.push([[x, y, w], [x, y, -w], [x, y - 0.03, -w], [x, y - 0.03, w]]); }
    p.add(loft(fl, {capStart: true, capEnd: true}), 'inner');
  }
  const floorY = (x) => B(x).bot + 0.36;
  const seat = (id, name, x, facts, off) => {
    const p = part(id, name, 'Cockpit', off, facts);
    const py = floorY(x) + 0.52;
    p.add(merge([box([x, py, 0], [0.46, 0.09, 0.46]), box([x + 0.27, py + 0.44, 0], [0.09, 0.82, 0.44], [0, 0, -0.2]), box([x + 0.37, py + 0.93, 0], [0.08, 0.2, 0.26], [0, 0, -0.2])]), 'seat');
    p.add(merge([box([x + 0.215, py + 0.48, 0.1], [0.012, 0.74, 0.05], [0, 0, -0.2]), box([x + 0.215, py + 0.48, -0.1], [0.012, 0.74, 0.05], [0, 0, -0.2]), box([x - 0.02, py + 0.055, 0], [0.3, 0.012, 0.05])]), 'strap');
    p.add(tubes([[[x - 0.18, py, 0.2], [x - 0.18, floorY(x), 0.2]], [[x - 0.18, py, -0.2], [x - 0.18, floorY(x), -0.2]], [[x + 0.2, py, 0.2], [x + 0.2, floorY(x), 0.2]], [[x + 0.2, py, -0.2], [x + 0.2, floorY(x), -0.2]], [[x + 0.3, py + 0.8, 0.2], [x + 0.2, floorY(x), 0.2]], [[x + 0.3, py + 0.8, -0.2], [x + 0.2, floorY(x), -0.2]]], 0.014, 6), 'tubeGrey');
    return p;
  };
  seat('seatF', 'Pilot seat', 5.72, [
    'Front seat for the pilot, on the aircraft centerline with the wing leading edge well ahead.',
    'AmSafe inflatable 5-point restraint: the airbags are in the shoulder straps.',
    'The civil AT-802 in the 360 tour wears red mesh. Military seats are shown here in dark fabric.',
  ], [0, 0.95, 0]);
  seat('seatR', 'Rear crew seat', 6.66, [
    'Rear seat for the combat systems officer, who runs the sensors and weapons.',
    'Full dual controls: flight, power and fuel controls and instruments are duplicated here.',
    'Same AmSafe inflatable 5-point restraint as the front.',
  ], [0.2, 1.05, 0]);
  {
    const p = part('panels', 'Instrument panels', 'Cockpit', [-0.35, 1.25, 0], [
      'Front panel sits under the glareshield at the windshield base. The rear panel hangs from the cage behind the pilot.',
      'Night-vision-goggle compatible lighting is standard on the AT-802U.',
      'The displays drawn here are representative: the OA-1K’s mission layout is not published in detail.',
    ]);
    const fm = new THREE.MeshStandardMaterial({map: panelTex(false), emissiveMap: null, roughness: 0.6, side: THREE.DoubleSide});
    fm.emissive = new THREE.Color(0xffffff); fm.emissiveMap = fm.map; fm.emissiveIntensity = 0.55;
    const fp = new THREE.PlaneGeometry(1.12, 0.49); fp.rotateY(PI / 2); fp.translate(5.03, 2.72, 0);
    p.mats.front = fm; p.add(fp, 'front', fm).castShadow = false;
    const rm = new THREE.MeshStandardMaterial({map: panelTex(true), roughness: 0.6, side: THREE.DoubleSide});
    rm.emissive = new THREE.Color(0xffffff); rm.emissiveMap = rm.map; rm.emissiveIntensity = 0.55;
    const rp = new THREE.PlaneGeometry(0.72, 0.36); rp.rotateY(PI / 2); rp.translate(6.235, 2.64, 0);
    p.mats.rear = rm; p.add(rp, 'rear', rm).castShadow = false;
    p.add(merge([box([4.99, 2.72, 0], [0.06, 0.51, 1.14]), box([5.0, 2.985, 0], [0.34, 0.03, 1.2]), box([5.08, 2.3, 0], [0.16, 0.38, 0.3]), box([6.2, 2.64, 0], [0.06, 0.38, 0.74])]), 'black');
  }
  {
    const p = part('controls', 'Flight and engine controls', 'Cockpit', [0, 0.45, 0], [
      'Sticks, rudder pedals and a power quadrant on the port wall at both seats.',
      'Three levers, as in the 360 tour: power (black), propeller (blue) and start control (red).',
      'The big wheel beside the quadrant is elevator trim.',
    ]);
    const grey = [], blk = [], knobs = {black: [], blue: [], red: []};
    for (const x of [5.5, 6.44]) {
      const fy = floorY(x);
      grey.push(tube([x + 0.06, fy, 0], [x - 0.02, fy + 0.62, 0], 0.016, 8));
      blk.push(tube([x - 0.02, fy + 0.62, 0], [x - 0.04, fy + 0.76, 0], 0.024, 10));
      for (const s of [1, -1]) { grey.push(box([x - 0.4, fy + 0.2, s * 0.17], [0.03, 0.16, 0.11], [0, 0, 0.5])); grey.push(tube([x - 0.4, fy + 0.2, s * 0.17], [x - 0.3, fy, s * 0.17], 0.012, 6)); }
      const zq = zSill(x) * 0.9 - 0.06, yq = sill(x) - 0.12;
      blk.push(box([x - 0.05, yq, zq], [0.3, 0.1, 0.1]));
      ['black', 'blue', 'red'].forEach((k, i) => {
        const lx = x - 0.14 + i * 0.07, zz = zq - 0.03 + i * 0.012;
        grey.push(tube([lx, yq, zz], [lx - 0.05, yq + 0.16, zz], 0.008, 6));
        knobs[k].push(ball([lx - 0.05, yq + 0.17, zz], 0.022));
      });
      const tw = new THREE.TorusGeometry(0.09, 0.014, 6, 20); tw.translate(x + 0.22, yq - 0.02, zq + 0.03);
      blk.push(tw);
    }
    p.add(merge(grey), 'tubeGrey'); p.add(merge(blk), 'black');
    p.add(merge(knobs.black), 'seat'); p.add(merge(knobs.blue), 'blue'); p.add(merge(knobs.red), 'red');
  }

  // ================= wing =================
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'L' : 'R', sideName = s > 0 ? 'port' : 'starboard';
    const M = (g) => (s > 0 ? g : mirrorZ(g));
    const zs = (z0, z1, n) => Array.from({length: n + 1}, (_, i) => lerp(z0, z1, i / n));
    const wo = [0, 0, s * 3.3];
    const sk = part('wing' + tag, `Wing skin, ${sideName}`, 'Wing', [0, 0.95, wo[2]], [
      'Constant 6.83 ft chord from root to tip: span 59.25 ft, area 401 sq ft for the pair.',
      'NACA 4415 section, a thick high-lift airfoil that suits a 91 kt stall at 16,000 lb.',
      'Each wing unbolts at the root for C-17 transport.',
    ], {skin: true});
    sk.add(M(loft(zs(0.6, 8.65, 8).map((z) => wingLoop(z, 0, 0.74)), {capStart: true, capEnd: true})), 'paint');
    sk.add(M(loft([wingLoop(8.65, 0, 1), wingLoop(8.9, 0, 1), wingLoop(9.0, 0, 1, thin(F4415, 0.8), 0.94), wingLoop(DIM.span / 2, 0, 1, thin(F4415, 0.35), 0.8)], {capStart: true, capEnd: true})), 'paint');
    sk.add(M(loft([wingLoop(0.6, 0.74, 1), wingLoop(0.8, 0.74, 1)], {capStart: true, capEnd: true})), 'paint');
    sk.add(M(ball(wpt(DIM.span / 2 - 0.03, 0.1, 0), 0.035)), s > 0 ? 'red' : 'green');
    if (s > 0) sk.add(pipe([wpt(6.5, 0.12, -1, 0.0), wpt(6.5, 0.1, -1, 0.14), [wpt(6.5, 0.1, -1, 0.14)[0] - 0.3, wpt(6.5, 0.1, -1, 0.14)[1] + 0.05, 6.5]], 0.012, 6), 'steel');

    const st = part('wingBox' + tag, `Wing structure and fuel tank, ${sideName}`, 'Wing', wo, [
      'Main spar at about 28 percent chord: Air Tractor calls it an extremely strong spar, sized for 16,000 lb at agricultural load factors.',
      'The inboard bays hold 190 US gal each, 380 US gal (1,438 L) for both wings.',
      'Tanks are self-sealing.',
    ]);
    const inner = thin(F4415, 0.86);
    const sparAt = (c, t) => { const a = [], b = []; for (const z of [0.2, 8.6]) { const u = wpt(z, c, 1), l = wpt(z, c, -1); a.push(u, l); } return loft([[[a[0][0] - t, a[0][1] - 0.012, 0.2], [a[0][0] + t, a[0][1] - 0.012, 0.2], [a[1][0] + t, a[1][1] + 0.012, 0.2], [a[1][0] - t, a[1][1] + 0.012, 0.2]], [[a[2][0] - t, a[2][1] - 0.012, 8.6], [a[2][0] + t, a[2][1] - 0.012, 8.6], [a[3][0] + t, a[3][1] + 0.012, 8.6], [a[3][0] - t, a[3][1] + 0.012, 8.6]]], {capStart: true, capEnd: true}); };
    const ribs = [];
    for (let z = 0.85; z < 8.7; z += 0.87) ribs.push(loft([wingLoop(z, 0.02, 0.73, inner, 1, 10), wingLoop(z + 0.02, 0.02, 0.73, inner, 1, 10)], {capStart: true, capEnd: true}));
    st.add(M(merge([sparAt(0.28, 0.035), sparAt(0.7, 0.02), ...ribs])), 'alu');
    st.add(M(loft(zs(0.95, 4.55, 4).map((z) => wingLoop(z, 0.06, 0.66, thin(F4415, 0.78), 1, 10)), {capStart: true, capEnd: true})), 'tank');

    const fl = part('flap' + tag, `Flap, ${sideName}`, 'Wing', [0.95, 0.95, wo[2]], [
      'Large-span flap covering the inboard half of the trailing edge.',
      'Flaps down, the aircraft stalls at 91 kt at gross weight and 70 kt at 12,500 lb.',
    ]);
    fl.add(M(loft(zs(0.84, 4.98, 4).map((z) => wingLoop(z, 0.745, 1, F4415, 1, 8)), {capStart: true, capEnd: true})), 'paint');
    const ai = part('ail' + tag, `Aileron, ${sideName}`, 'Wing', [0.95, 0.95, s * 3.8], [
      'Outboard aileron, mass balanced and driven by pushrods through the wing.',
      'They droop with the flaps on the AT-802 family to keep roll control at low speed.',
    ]);
    ai.add(M(loft(zs(5.02, 8.62, 4).map((z) => wingLoop(z, 0.745, 1, F4415, 1, 8)), {capStart: true, capEnd: true})), 'paint');
  }

  // ================= tail =================
  const F0010 = naca(0, 0.4, 0.1);
  {
    const ta = 8 * RAD, c = 1.13;
    const tloop = (z, c0, c1) => foilLoop({o: [9.3, 1.77, z], cv: [c * Math.cos(ta), -c * Math.sin(ta), 0], tv: [c * Math.sin(ta), c * Math.cos(ta), 0], foil: F0010, c0, c1, n: 10});
    const tp = (z, cf, dy = 0) => [9.3 + c * cf * Math.cos(ta), 1.77 - c * cf * Math.sin(ta) + dy, z];
    for (const s of [1, -1]) {
      const M = (g) => (s > 0 ? g : mirrorZ(g)), tag = s > 0 ? 'L' : 'R', sideName = s > 0 ? 'port' : 'starboard';
      const st = part('stab' + tag, `Horizontal stabilizer, ${sideName}`, 'Tail', [0.75, 0.6, s * 1.35], [
        'Rectangular, strut-braced tailplane: 19.67 ft across both halves.',
        'One streamlined strut each side runs down to the lower longeron, as the front drawing shows.',
      ], {skin: true});
      st.add(M(loft([0.05, 1.5, DIM.tailSpan / 2 - 0.04, DIM.tailSpan / 2].map((z, i) => (i === 3 ? foilLoop({o: [9.34, 1.765, z], cv: [(c - 0.08) * Math.cos(ta), -(c - 0.08) * Math.sin(ta), 0], tv: [c * 0.5 * Math.sin(ta), c * 0.5 * Math.cos(ta), 0], foil: F0010, c0: 0, c1: 0.59, n: 10}) : tloop(z, 0, 0.59))), {capStart: true, capEnd: true})), 'paint');
      st.add(M(tube(tp(1.55, 0.3, -0.06), [9.55, 1.1, 0.24], 0.022, 8)), 'paint');
      const el = part('elev' + tag, `Elevator, ${sideName}`, 'Tail', [1.6, 0.6, s * 1.35], [
        'Fabric-light, cable-driven elevator with a trim tab.',
        'Big surfaces for authority at low speed on short dirt strips.',
      ]);
      el.add(M(loft([0.26, 1.6, DIM.tailSpan / 2 - 0.05].map((z) => tloop(z, 0.6, 1)), {capStart: true, capEnd: true})), 'paint');
    }
    const fin = part('fin', 'Vertical fin', 'Tail', [0.5, 1.6, 0], [
      'Tall swept fin: the top of the tail stands 11.2 ft above the ramp.',
      'The wire running from the cabin roof to the fin tip on the drawings is an antenna.',
    ], {skin: true});
    const leX = (y) => 9.05 + ((y - 1.95) * 0.93) / 1.47;
    fin.add(loft([1.62, 2.2, 2.8, 3.38].map((y) => { const x = leX(y), ch = 10.245 - x; return foilLoop({o: [x, y, 0], cv: [ch, 0, 0], tv: [0, 0, ch * 0.9], foil: F0010, n: 10}); }), {capEnd: true}), 'paint');
    const rud = part('rudder', 'Rudder', 'Tail', [1.55, 1.6, 0], [
      'Full-height rudder with a horn balance that overhangs the fin tip.',
      'It reaches below the fuselage to stay effective at the high angles of a tailwheel landing.',
    ]);
    const F12 = naca(0, 0.4, 0.12);
    rud.add(loft([1.02, 1.9, 2.8, 3.385].map((y, i) => foilLoop({o: [10.25, y, 0], cv: [i === 0 ? 0.66 : 0.74, 0, 0], tv: [0, 0, 0.74], foil: F12, n: 10})), {capStart: true, capEnd: true}), 'paint');
    rud.add(loft([3.39, 3.5, 3.56].map((y, i) => foilLoop({o: [9.96 + i * 0.03, y, 0], cv: [1.03 - i * 0.05, 0, 0], tv: [0, 0, i === 2 ? 0.4 : 0.72], foil: F0010, n: 10})), {capStart: true, capEnd: true}), 'paint');
  }

  // ================= landing gear =================
  for (const s of [1, -1]) {
    const M = (g) => (s > 0 ? g : mirrorZ(g));
    const p = part('gear' + (s > 0 ? 'L' : 'R'), `Main landing gear, ${s > 0 ? 'port' : 'starboard'}`, 'Landing gear', [0, -1.4, s * 1.5], [
      'Heavy spring-steel leg: no oleo to leak or service on a dirt strip.',
      '30 in tire with eight-piston brakes.',
      '10 ft track. The mains sit 23.8 ft ahead of the tailwheel.',
      s > 0 ? 'The boarding step ladder is fixed to this leg.' : 'Lands in 1,200 ft.',
    ]);
    const ax = [2.82, DIM.tyreDia / 2, DIM.track / 2];
    const top = [2.96, 1.74, 0.5], mid = [2.9, 1.2, 0.98];
    const rect = (c, w, t) => { const dz = 0.75, dy = 0.66; return [[c[0] - w, c[1] + t * dz, c[2] + t * dy], [c[0] + w, c[1] + t * dz, c[2] + t * dy], [c[0] + w, c[1] - t * dz, c[2] - t * dy], [c[0] - w, c[1] - t * dz, c[2] - t * dy]]; };
    p.add(M(loft([rect(top, 0.13, 0.035), rect(mid, 0.11, 0.032), rect([ax[0], ax[1] + 0.06, ax[2] - 0.22], 0.08, 0.028)], {capStart: true, capEnd: true})), 'paintDk');
    const tyre = new THREE.LatheGeometry([[0.2, -0.13], [0.3, -0.14], [0.36, -0.11], [0.381, -0.04], [0.381, 0.04], [0.36, 0.11], [0.3, 0.14], [0.2, 0.13]].map(([r, u]) => new THREE.Vector2(r, u)), 32);
    tyre.rotateX(PI / 2); tyre.translate(...ax);
    p.add(M(tyre), 'tyre');
    p.add(M(merge([tube([ax[0], ax[1], ax[2] - 0.13], [ax[0], ax[1], ax[2] + 0.13], 0.2, 20), tube([ax[0], ax[1], ax[2] - 0.24], [ax[0], ax[1], ax[2] + 0.15], 0.05, 10)])), 'alu');
    p.add(M(merge([tube([ax[0], ax[1], ax[2] - 0.16], [ax[0], ax[1], ax[2] - 0.14], 0.17, 20), box([ax[0] + 0.1, ax[1] + 0.08, ax[2] - 0.17], [0.12, 0.14, 0.06])])), 'dkSteel');
    if (s > 0) {
      const a = [2.72, 1.5, 0.82], b = [2.72, 0.95, 1.18];
      p.add(tubes([[a, b], [[a[0] + 0.22, a[1], a[2]], [b[0] + 0.22, b[1], b[2]]], ...[0.2, 0.5, 0.8].map((t) => [[a[0], lerp(a[1], b[1], t), lerp(a[2], b[2], t)], [a[0] + 0.22, lerp(a[1], b[1], t), lerp(a[2], b[2], t)]])], 0.012, 6), 'tubeGrey');
    }
  }
  {
    const p = part('tailwheel', 'Tailwheel', 'Landing gear', [0.35, -1.35, 0], [
      'Lockable, steerable tailwheel on a leaf spring.',
      'A taildragger keeps the propeller high and the weight on big main tires, which is what soft, rough strips need.',
    ]);
    const c = [10.3, 0.18, 0];
    const t = new THREE.LatheGeometry([[0.08, -0.06], [0.15, -0.065], [0.18, -0.03], [0.18, 0.03], [0.15, 0.065], [0.08, 0.06]].map(([r, u]) => new THREE.Vector2(r, u)), 24);
    t.rotateX(PI / 2); t.translate(...c);
    p.add(t, 'tyre');
    p.add(merge([tube([c[0], c[1], -0.07], [c[0], c[1], 0.07], 0.08, 14), tubes([[[c[0], c[1], 0.085], [10.18, 0.42, 0.085]], [[c[0], c[1], -0.085], [10.18, 0.42, -0.085]], [[10.18, 0.42, -0.085], [10.18, 0.42, 0.085]], [[10.18, 0.42, 0], [10.14, 0.6, 0]]], 0.02, 8)]), 'dkSteel');
    p.add(loft([[[9.6, 1.02, 0.05], [9.6, 1.02, -0.05], [9.6, 0.99, -0.05], [9.6, 0.99, 0.05]], [[10.16, 0.61, 0.04], [10.16, 0.61, -0.04], [10.14, 0.585, -0.04], [10.14, 0.585, 0.04]]], {capStart: true, capEnd: true}), 'paintDk');
  }

  // ================= stores and sensors =================
  const fins = (x, len, span, n = 4, rot = PI / 4) => { const gs = []; for (let k = 0; k < n; k++) { const g = box([x, span / 2, 0], [len, span, 0.012]); g.rotateX(rot + (k * 2 * PI) / n); gs.push(g); } return gs; };
  const stores = {
    gbu12: () => ({olive: merge([latheX([[-1.2, 0.09], [-1.05, 0.115], [-0.75, 0.1365], [0.75, 0.1365], [0.95, 0.09], [1.66, 0.075], [1.66, 0]], 18), ...fins(1.36, 0.6, 0.3), ...fins(-1.28, 0.18, 0.2)]),
      missile: latheX([[-1.67, 0], [-1.64, 0.035], [-1.5, 0.05], [-1.42, 0.05], [-1.4, 0.085], [-1.2, 0.09]], 16), yellow: latheX([[-0.98, 0.127], [-0.9, 0.132]], 18)}),
    hellfire: () => {
      const one = (z) => place(merge([latheX([[-0.815, 0], [-0.79, 0.05], [-0.7, 0.085], [0.78, 0.089], [0.815, 0.06], [0.815, 0]], 14), ...fins(0.62, 0.3, 0.16), ...fins(-0.25, 0.25, 0.11)]), [0, -0.19, z]);
      return {missile: merge([one(0.15), one(-0.15)]), lens: merge([ball([-0.79, -0.19, 0.15], 0.052), ball([-0.79, -0.19, -0.15], 0.052)]), dkSteel: merge([box([0, -0.03, 0], [1.3, 0.1, 0.42]), box([0, -0.1, 0.15], [1.2, 0.05, 0.05]), box([0, -0.1, -0.15], [1.2, 0.05, 0.05])])};
    },
    clt: () => {
      const tb = [], caps = [];
      for (const y of [-0.12, -0.3]) for (const z of [0.092, -0.092]) { tb.push(tube([-0.65, y, z], [0.65, y, z], 0.085, 14)); caps.push(tube([-0.66, y, z], [-0.65, y, z], 0.07, 14)); }
      return {olive: merge(tb), black: merge(caps), dkSteel: merge([box([0, -0.02, 0], [0.9, 0.06, 0.2]), box([-0.4, -0.21, 0], [0.04, 0.4, 0.38]), box([0.4, -0.21, 0], [0.04, 0.4, 0.38])])};
    },
    lau131: () => {
      const holes = [tube([-0.801, -0.16, 0], [-0.78, -0.16, 0], 0.036, 10)];
      for (let k = 0; k < 6; k++) holes.push(tube([-0.801, -0.16 + 0.078 * Math.cos((k * PI) / 3), 0.078 * Math.sin((k * PI) / 3)], [-0.78, -0.16 + 0.078 * Math.cos((k * PI) / 3), 0.078 * Math.sin((k * PI) / 3)], 0.036, 10));
      return {olive: place(latheX([[-0.8, 0], [-0.8, 0.125], [0.7, 0.125], [0.82, 0.08], [0.82, 0]], 20), [0, -0.16, 0]), black: merge(holes)};
    },
    mmss: () => ({
      sensor: merge([place(latheX([[-1.0, 0], [-0.94, 0.14], [-0.75, 0.22], [0.75, 0.22], [0.95, 0.14], [1.0, 0]], 20), [0, -0.24, 0]), box([-0.5, -0.47, 0], [0.3, 0.1, 0.3]), box([0.45, -0.47, 0], [0.4, 0.1, 0.4]),
        ball([-0.5, -0.66, 0], 0.195), ball([0.45, -0.73, 0], 0.265)]),
      lens: merge([ball([-0.62, -0.7, 0.05], 0.075), ball([-0.6, -0.68, -0.08], 0.05), ball([0.28, -0.78, 0.07], 0.105), ball([0.3, -0.76, -0.11], 0.07), ball([0.34, -0.9, 0], 0.05)]),
    }),
  };
  const STATION_Z = [2.08, 3.23, 4.37, 5.5];
  const pylonAt = (z) => { const c = wpt(z, 0.45, -1, 0.09); return place(box([0, 0, 0], [0.8, 0.2, 0.07]), c, -DIM.wingAngle); };
  const hang = (z) => wpt(z, 0.45, -1, 0.19);
  for (const s of [1, -1]) {
    const tag = s > 0 ? 'L' : 'R', sideName = s > 0 ? 'port' : 'starboard';
    const py = part('pylons' + tag, `Wing pylons, ${sideName}`, 'Stores and sensors', [0, -0.45, s * 3.3], [
      'Four hardpoints under each wing, each rated for a 500 lb class store.',
      'The innermost station is optimised for guns from .50 cal to 20 mm.',
      'Stations 1 to 3 sit 2.08, 3.23 and 4.37 m from the centerline on Air Tractor’s loadout drawings. The fourth is placed outboard of them here.',
    ]);
    py.add(merge(STATION_Z.map((z) => pylonAt(s * z))), 'paintDk');
    const fit = (id, name, k, kind, facts) => {
      const p = part(id + tag, name, 'Stores and sensors', [0, -1.2, s * 3.3], facts);
      const g = stores[kind]();
      for (const key of Object.keys(g)) p.add(place(g[key], hang(s * STATION_Z[k]), -DIM.wingAngle), key);
    };
    if (s > 0) fit('mmss', 'MMSS sensor pod (MX-15 + MX-20)', 0, 'mmss', [
      'Station L1 on Air Tractor’s maximum strike loadout: one pod carrying two WESCAM turrets.',
      'The smaller ball is the MX-15, the larger the MX-20: electro-optical and infrared cameras with laser designation.',
      'Carrying sensors in pods keeps the airframe standard and lets a mission kit be swapped in hours.',
    ]);
    else fit('lau', 'LAU-131 rocket pod (APKWS)', 0, 'lau131', [
      'Seven-tube launcher for 2.75 in rockets.',
      'With the APKWS guidance kit each rocket becomes a laser-guided round, designated by the aircraft’s own turret.',
    ]);
    fit('clt', 'Common launch tube rack, 4 rounds', 1, 'clt', [
      `Station ${tag}2, marked LCLT-4 on the loadout drawing: four launch tubes on one rack.`,
      'Launch tubes carry small glide munitions and air-launched effects.',
    ]);
    fit('hf', 'AGM-114 Hellfire, twin rail', 2, 'hellfire', [
      `Station ${tag}3 carries precision-guided missiles on the maximum strike loadout.`,
      'AGM-114: 64 in long, 7 in diameter, about 100 lb, laser guided.',
    ]);
  }
  {
    const belly = (x) => (x < CAB0 ? A(x).bot : B(x).bot);
    const cl = part('pylonsC', 'Centerline pylons', 'Stores and sensors', [0, -0.45, 0], [
      'Two side-by-side stations under the belly, each rated for a 1,000 lb class store.',
      'They sit 0.74 m apart, either side of the keel.',
    ]);
    cl.add(merge([-0.37, 0.37].map((z) => place(box([0, 0, 0], [0.9, 0.16, 0.08]), [4.2, belly(4.2) - 0.05, z], -9))), 'paintDk');
    for (const s of [1, -1]) {
      const p = part('gbu' + (s > 0 ? 'L' : 'R'), `GBU-12 Paveway II, centerline ${s > 0 ? 'C2' : 'C1'}`, 'Stores and sensors', [0, -1.25, s * 0.25], [
        '500 lb laser-guided bomb: a Mk 82 body with a seeker and folding tail kit.',
        '10 ft 11 in long, 10.75 in diameter.',
        'Both centerline stations carry one on the maximum strike loadout.',
      ]);
      const g = stores.gbu12();
      for (const key of Object.keys(g)) p.add(place(g[key], [4.25, belly(4.25) - 0.27, s * 0.37], -9), key);
    }
  }

  // ================= mission systems =================
  {
    const p = part('ant', 'Antennas and SATCOM', 'Mission systems', [0, 3.3, 0], [
      'Line-of-sight and beyond-line-of-sight radios feed full-motion video and data to the ground force.',
      'Mast and blade positions follow the drawings. The SATCOM fairing placement on the aft spine is representative.',
    ]);
    const top = (x) => B(x).top;
    p.add(merge([tube([5.62, 3.37, 0], [5.66, 3.63, 0], 0.012, 6), box([8.95, top(8.95) + 0.13, 0], [0.16, 0.26, 0.02], [0, 0, -0.25]), box([6.0, B(6.0).bot - 0.12, 0], [0.18, 0.24, 0.02], [0, 0, 0.3]),
      box([3.6, A(3.6).top + 0.11, 0], [0.14, 0.22, 0.02], [0, 0, -0.2])]), 'paintDk');
    p.add(place(latheX([[0, 0], [0.02, 0.2], [0.07, 0.19], [0.1, 0.1], [0.1, 0]], 20), [8.45, top(8.45) - 0.01, 0], 90 - 12), 'paint');
    const w = part('wire', 'Wire antenna', 'Mission systems', [0, 3.6, 0], [
      'Long-wire antenna strung from the cabin roof mast to the fin tip, drawn on the side view.',
    ]);
    w.add(tube([5.66, 3.63, 0], [10.0, 3.5, 0], 0.005, 5), 'wire');
    const d = part('das', 'Defensive aids', 'Mission systems', [0, -0.7, 0], [
      'Mounting provisions for the AN/AAR-47 missile warning system: sensors look out from the wingtips.',
      'AN/ALE-47 dispensers under the wings fire chaff and flares.',
      'Air Tractor lists both as optional fits.',
    ]);
    const gs = [];
    for (const s of [1, -1]) {
      gs.push(box(wpt(s * (DIM.span / 2 - 0.12), 0.06, 0), [0.1, 0.07, 0.1]), box(wpt(s * (DIM.span / 2 - 0.12), 0.93, 0), [0.1, 0.06, 0.1]));
      gs.push(place(box([0, 0, 0], [0.26, 0.07, 0.2]), wpt(s * 6.3, 0.5, -1, 0.03), -DIM.wingAngle));
    }
    d.add(merge(gs), 'sensor');
  }

  return {root, parts, byId};
}
