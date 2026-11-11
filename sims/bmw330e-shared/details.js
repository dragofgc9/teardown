// The F30's face and flanks: kidney grille, headlamps with LED rings, L-shaped taillamps, roundels, the 330e badge, the
// charge flap with its LED ring, door handles, window trim. Every one is drawn flat and then shrink-wrapped onto the
// body shell: each vertex is cast along an axis onto the panel it lands on and lifted by its own depth, so a lamp
// follows the curve of the wing instead of floating off it. Run once at build time, before anything has moved.
import * as THREE from 'three';
import {TessellateModifier} from 'three/addons/modifiers/TessellateModifier.js';
import {glow, rbox, std, TAU, V3} from './kit3d.js';

const MAP = {
  front: (a, b) => [new V3(a, b, 3), new V3(0, 0, -1)],
  rear: (a, b) => [new V3(-a, b, -3), new V3(0, 0, 1)],
  left: (a, b) => [new V3(3, b, -a), new V3(-1, 0, 0)],
  right: (a, b) => [new V3(-3, b, a), new V3(1, 0, 0)],
  top: (a, b) => [new V3(a, 2, b), new V3(0, -1, 0)],
};
const AXIS = {front: 2, rear: 2, left: 0, right: 0, top: 1};

// An axis-aligned ray against a triangle soup, through a uniform grid over the two other axes: each query tests only
// the few triangles whose footprint covers it. (three's Raycaster tests every triangle; this pass cast thousands.)
const CELL = 0.04;
const samplers = new Map();
function sampler(side, meshes) {
  const key = side + meshes.map((m) => m.uuid).join();
  if (samplers.has(key)) return samplers.get(key);
  const k = AXIS[side];
  const [iu, iv] = [0, 1, 2].filter((i) => i !== k);
  const tris = [];
  for (const m of meshes) {
    const pos = m.geometry.attributes.position;
    const idx = m.geometry.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      const t = new Float32Array(9);
      for (let j = 0; j < 3; j++) {
        const v = idx ? idx.getX(i + j) : i + j;
        t[j * 3] = pos.getX(v);
        t[j * 3 + 1] = pos.getY(v);
        t[j * 3 + 2] = pos.getZ(v);
      }
      tris.push(t);
    }
  }
  const grid = new Map();
  const cellKey = (u, v) => Math.floor(u / CELL) * 100003 + Math.floor(v / CELL);
  tris.forEach((t, ti) => {
    const us = [t[iu], t[3 + iu], t[6 + iu]];
    const vs = [t[iv], t[3 + iv], t[6 + iv]];
    const u0 = Math.floor(Math.min(...us) / CELL);
    const u1 = Math.floor(Math.max(...us) / CELL);
    const v0 = Math.floor(Math.min(...vs) / CELL);
    const v1 = Math.floor(Math.max(...vs) / CELL);
    for (let u = u0; u <= u1; u++) {
      for (let v = v0; v <= v1; v++) {
        const c = u * 100003 + v;
        (grid.get(c) || grid.set(c, []).get(c)).push(ti);
      }
    }
  });
  const e1 = new V3();
  const e2 = new V3();
  const fn = (o, d) => {
    const list = grid.get(cellKey(o.getComponent(iu), o.getComponent(iv)));
    if (!list) return null;
    const pu = o.getComponent(iu);
    const pv = o.getComponent(iv);
    const sg = d.getComponent(k);
    let best = null;
    let bestT = Infinity;
    for (const ti of list) {
      const t = tris[ti];
      const au = t[iu], av = t[iv], bu = t[3 + iu], bv = t[3 + iv], cu = t[6 + iu], cv = t[6 + iv];
      const den = (bv - cv) * (au - cu) + (cu - bu) * (av - cv);
      if (Math.abs(den) < 1e-12) continue;
      const l1 = ((bv - cv) * (pu - cu) + (cu - bu) * (pv - cv)) / den;
      const l2 = ((cv - av) * (pu - cu) + (au - cu) * (pv - cv)) / den;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const depth = l1 * t[k] + l2 * t[3 + k] + l3 * t[6 + k];
      const dist = (depth - o.getComponent(k)) * sg; // distance along the ray
      if (dist < bestT) {
        bestT = dist;
        best = ti;
        best = {ti, depth};
      }
    }
    if (!best) return null;
    const t = tris[best.ti];
    const p = o.clone();
    p.setComponent(k, best.depth);
    e1.set(t[3] - t[0], t[4] - t[1], t[5] - t[2]);
    e2.set(t[6] - t[0], t[7] - t[1], t[8] - t[2]);
    const n = new V3().crossVectors(e1, e2).normalize();
    if (n.dot(d) > 0) n.negate();
    return {p, n};
  };
  samplers.set(key, fn);
  return fn;
}

/** shrink-wrap geo (flat: a, b across, c up from the surface) onto `targets` as seen from `side` */
export function wrap(flat, side, targets, lift = 0) {
  // a decal is drawn with a handful of corners; cut it finely first, or its big triangles chord through the curve
  const geo = TESS.modify(flat);
  const pos = geo.attributes.position;
  const cast = sampler(side, targets);
  let last = null;
  for (let i = 0; i < pos.count; i++) {
    const [o, d] = MAP[side](pos.getX(i), pos.getY(i));
    const hit = cast(o, d);
    if (hit) last = hit;
    if (!last) continue;
    const c = pos.getZ(i) + lift;
    pos.setXYZ(i, last.p.x + last.n.x * c, last.p.y + last.n.y * c, last.p.z + last.n.z * c);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

const TESS = new TessellateModifier(0.028, 7);
const poly = (pts, mirror = 1) => {
  const sh = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? sh.lineTo(x * mirror, y) : sh.moveTo(x * mirror, y)));
  sh.closePath();
  return sh;
};
const slab = (shape, depth, bevel = 0.003) => new THREE.ExtrudeGeometry(shape, {depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 10});
// a rounded rectangle outline centred on (0, 0)
const rrect = (w, h, r) => {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
};
const moved = (g, x, y, z = 0) => g.translate(x, y, z);

const roundelTexture = () => {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#101214';
  g.beginPath();
  g.arc(128, 128, 126, 0, TAU);
  g.fill();
  g.strokeStyle = '#e9ecef';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(128, 128, 100, 0, TAU);
  g.stroke();
  const quad = (a, col) => {
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(128, 128);
    g.arc(128, 128, 96, a, a + Math.PI / 2);
    g.closePath();
    g.fill();
  };
  quad(Math.PI, '#1c69d4');
  quad(0, '#1c69d4');
  quad(Math.PI / 2, '#f4f6f8');
  quad(Math.PI * 1.5, '#f4f6f8');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};
const badgeTexture = (text) => {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.font = '600 96px Inter, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(20,22,26,.55)';
  g.fillText(text, 258, 68);
  g.fillStyle = '#dfe3e7';
  g.fillText(text, 256, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};
export const roundelMaterial = () => new THREE.MeshStandardMaterial({map: roundelTexture(), metalness: 0.3, roughness: 0.35, side: THREE.DoubleSide});

export function addBodyDetails(parts, body, paintMat) {
  const part = (id) => parts.find((p) => p.id === id).obj;
  const shell = (id) => part(id).children.find((c) => c.isMesh);
  const ALL = ['tub', 'hood', 'trunk', 'roof', 'doorFL', 'doorFR', 'doorRL', 'doorRR', 'bumperF', 'bumperR'].map(shell);
  const front = ['bumperF', 'hood', 'tub'].map(shell);
  const rear = ['bumperR', 'trunk', 'tub'].map(shell);
  const chrome = () => std('#d3d8dd', 0.95, 0.18);
  const black = () => std('#0a0b0d', 0.0, 0.6, {envMapIntensity: 0.3});
  const lens = () => new THREE.MeshPhysicalMaterial({color: '#0c1218', metalness: 0.2, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03});
  const ring = () => new THREE.MeshBasicMaterial({color: '#f4f8ff'});
  const add = (id, geo, mat, side, targets, lift = 0) => {
    mat.side = THREE.DoubleSide;
    const m = new THREE.Mesh(wrap(geo, side, targets, lift), mat);
    m.castShadow = false;
    part(id).add(m);
    return m;
  };

  // ---------------------------------------------------------------- front: kidney grille, headlamps, intakes, plate
  for (const s of [-1, 1]) {
    // each kidney: a chrome frame leaning into the centre, black inside, vertical slats
    const k = (w, h, r) => {
      const sh = rrect(w, h, r);
      return sh;
    };
    const cx = s * 0.158;
    const cy = 0.6;
    add('bumperF', moved(slab(k(0.275, 0.142, 0.03), 0.014, 0.003), cx, cy), chrome(), 'front', front, 0.0);
    add('bumperF', moved(slab(k(0.243, 0.11, 0.02), 0.017, 0.001), cx, cy), black(), 'front', front, 0.002);
    for (let i = 0; i < 9; i++) {
      const g = moved(slab(rrect(0.0085, 0.1, 0.002), 0.006, 0), cx - 0.104 + i * 0.026, cy);
      add('bumperF', g, std('#2a2e33', 0.85, 0.3), 'front', front, 0.016);
    }
    // headlamp: runs from the kidney round the corner, dark lens, two LED rings, a light blade over them
    const lamp = [[0.305, 0.602], [0.42, 0.59], [0.6, 0.6], [0.74, 0.632], [0.815, 0.672], [0.8, 0.694], [0.66, 0.708], [0.45, 0.706], [0.305, 0.69]];
    add('bumperF', slab(poly(lamp, s), 0.012, 0.003), lens(), 'front', front, -0.001);
    add('bumperF', slab(poly([[0.3, 0.598], [0.42, 0.586], [0.6, 0.596], [0.6, 0.6], [0.42, 0.59], [0.3, 0.602]], s), 0.004, 0), chrome(), 'front', front, 0.012);
    for (const [u, r] of [[0.415, 0.031], [0.53, 0.029]]) {
      const t = new THREE.TorusGeometry(r, 0.0045, 6, 6);
      t.rotateZ(Math.PI / 6);
      add('bumperF', moved(t, s * u, 0.646), ring(), 'front', front, 0.011);
      add('bumperF', moved(new THREE.CircleGeometry(r * 0.62, 20), s * u, 0.646), std('#9fa8b3', 0.9, 0.15), 'front', front, 0.008);
    }
    add('bumperF', slab(poly([[0.33, 0.688], [0.64, 0.697], [0.76, 0.686], [0.76, 0.692], [0.64, 0.704], [0.33, 0.695]], s), 0.004, 0), ring(), 'front', front, 0.012);
    // outer intake with its chrome blade and fog lamp
    const side = [[0.47, 0.292], [0.76, 0.318], [0.775, 0.4], [0.47, 0.41]];
    add('bumperF', slab(poly(side, s), 0.008, 0.002), black(), 'front', front, 0.0);
    add('bumperF', slab(poly([[0.48, 0.352], [0.765, 0.36], [0.765, 0.368], [0.48, 0.362]], s), 0.005, 0), chrome(), 'front', front, 0.008);
    add('bumperF', moved(new THREE.CircleGeometry(0.03, 24), s * 0.56, 0.385), std('#e9eef3', 0.4, 0.15, {emissive: '#cfd8e2', emissiveIntensity: 0.25}), 'front', front, 0.009);
  }
  // the centre intake, wider at the bottom
  add('bumperF', slab(poly([[-0.44, 0.262], [0.44, 0.262], [0.4, 0.4], [-0.4, 0.4]]), 0.008, 0.002), black(), 'front', front, 0.0);
  for (let i = 0; i < 3; i++) add('bumperF', moved(slab(rrect(0.78, 0.007, 0.002), 0.004, 0), 0, 0.292 + i * 0.034), std('#3a3f45', 0.8, 0.4), 'front', front, 0.01);
  // number plate
  {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#f4f5f6';
    g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#16181b';
    g.lineWidth = 6;
    g.strokeRect(8, 8, 496, 240);
    g.fillStyle = '#16181b';
    g.font = '700 150px Inter, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('2017', 256, 136);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    add('bumperF', moved(slab(rrect(0.32, 0.165, 0.008), 0.006, 0.001), 0, 0.452), black(), 'front', front, 0.0);
    const pl = new THREE.PlaneGeometry(0.305, 0.152, 8, 2);
    const m = new THREE.Mesh(wrap(moved(pl, 0, 0.452), 'front', front, 0.0085), new THREE.MeshStandardMaterial({map: t, roughness: 0.5, side: THREE.DoubleSide}));
    part('bumperF').add(m);
  }
  // roundel on the hood's leading edge
  {
    const g = new THREE.CircleGeometry(0.038, 40);
    const m = new THREE.Mesh(wrap(moved(g, 0, 2.085), 'top', [shell('hood'), shell('bumperF')], 0.002), roundelMaterial());
    part('hood').add(m);
  }

  // ---------------------------------------------------------------- rear: L-shaped taillamps, badge, roundel, plate
  for (const s of [-1, 1]) {
    const L = [[0.3, 0.838], [0.66, 0.83], [0.8, 0.8], [0.835, 0.86], [0.83, 0.955], [0.74, 0.965], [0.66, 0.905], [0.3, 0.9]];
    const mat = new THREE.MeshStandardMaterial({color: '#b3121c', emissive: '#7a0a12', emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.1});
    // wrapped from behind, where the plane's x runs the other way
    const g = slab(poly(L, -s), 0.01, 0.002);
    add('trunk', g, mat, 'rear', rear, 0.0);
    add('trunk', slab(poly([[0.32, 0.85], [0.66, 0.845], [0.79, 0.818], [0.795, 0.826], [0.66, 0.855], [0.32, 0.858]], -s), 0.004, 0), new THREE.MeshBasicMaterial({color: '#ff3b3b'}), 'rear', rear, 0.01).userData.tail = true;
    // tailpipe finisher surround in the valance
    add('bumperR', moved(slab(rrect(0.2, 0.05, 0.02), 0.006, 0.001), s * 0.42, 0.36), std('#c9ced4', 0.95, 0.2), 'rear', rear, 0.004);
  }
  {
    const g = moved(new THREE.CircleGeometry(0.037, 40), 0, 0.985);
    part('trunk').add(new THREE.Mesh(wrap(g, 'rear', rear, 0.002), roundelMaterial()));
    const bd = new THREE.PlaneGeometry(0.13, 0.0325);
    moved(bd, 0.4, 0.955); // right side of the lid: from behind, plane x runs toward the car's right
    const bm = new THREE.Mesh(wrap(bd, 'rear', rear, 0.002), new THREE.MeshBasicMaterial({map: badgeTexture('330e'), transparent: true, side: THREE.DoubleSide, depthWrite: false}));
    part('trunk').add(bm);
    // number plate recess
    add('trunk', moved(slab(rrect(0.36, 0.14, 0.012), 0.004, 0.001), 0, 0.82), black(), 'rear', rear, 0.0);
  }
  add('bumperR', slab(poly([[-0.62, 0.3], [0.62, 0.3], [0.56, 0.42], [-0.56, 0.42]]), 0.003, 0.001), black(), 'rear', rear, 0.002);

  // ---------------------------------------------------------------- flanks: charge flap, door handles
  {
    // the charge flap sits in the left front wing, ahead of the door, with an LED ring that shows the charge
    const cx = -1.04; // 'left' maps a to -z
    const cy = 0.8;
    const flap = new THREE.Mesh(wrap(moved(slab(rrect(0.105, 0.085, 0.022), 0.004, 0.001), cx, cy), 'left', [shell('tub')], 0.0), paintMat());
    const gap = new THREE.Mesh(wrap(moved(slab(rrect(0.113, 0.093, 0.026), 0.0015, 0.0005), cx, cy), 'left', [shell('tub')], 0.0), black());
    const led = new THREE.Mesh(wrap(moved(new THREE.RingGeometry(0.02, 0.026, 32), cx, cy), 'left', [shell('tub')], 0.0075), new THREE.MeshBasicMaterial({color: '#f4f8ff', side: THREE.DoubleSide}));
    const port = part('port');
    port.clear();
    port.add(gap, flap, led);
    port.userData.led = led;
  }
  const handles = [['doorFL', 'left', 0.0], ['doorFR', 'right', 0.0], ['doorRL', 'left', -0.98], ['doorRR', 'right', -0.98]];
  for (const [id, side, z] of handles) {
    const a = side === 'left' ? -z : z;
    const y = body.at(z).ySh + 0.012;
    add(id, moved(slab(rrect(0.15, 0.024, 0.011), 0.012, 0.003), a, y), paintMat(), side, [shell(id)], 0.0);
    add(id, moved(slab(rrect(0.165, 0.036, 0.016), 0.002, 0.001), a, y - 0.002), std('#5d6369', 0.4, 0.5), side, [shell(id)], 0.0);
  }
  // panel gap lines: the borders of every panel, dark and thin
  for (const id of ['hood', 'trunk', 'doorFL', 'doorFR', 'doorRL', 'doorRR', 'bumperF', 'bumperR']) {
    const sh = shell(id);
    const l = new THREE.LineSegments(new THREE.EdgesGeometry(sh.geometry, 75), new THREE.LineBasicMaterial({color: '#07090b', transparent: true, opacity: 0.6}));
    l.raycast = () => {};
    sh.add(l);
  }
}
