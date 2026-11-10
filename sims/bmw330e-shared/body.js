// The 330e's body shell, lofted from a handful of measured stations (length 4.633 m, width 1.811 m, height 1.429 m,
// wheelbase 2.81 m [bmw]) and cut into the panels you can take off: hood, trunk lid, four doors, bumpers, the roof with
// its glass, and the tub that stays. Car frame: +z forward, +y up, +x the car's left, ground at y = 0, z = 0 midway
// between the axles. Wheel arches are real openings: every triangle inside the arch circle is removed and the edge
// snapped to the circle.
import * as THREE from 'three';
import {toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';

export const DIM = {length: 4.633, width: 1.811, height: 1.429, wheelbase: 2.81, zFront: 1.405, zRear: -1.405, nose: 2.235, tail: -2.398};

// ---------------------------------------------------------------- monotone cubic through [z, v] keys
const pchip = (keys) => {
  const n = keys.length;
  const x = keys.map((k) => k[0]);
  const y = keys.map((k) => k[1]);
  const d = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) d[i] = (y[i + 1] - y[i]) / (x[i + 1] - x[i]);
  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  return (z) => {
    if (z <= x[0]) return y[0];
    if (z >= x[n - 1]) return y[n - 1];
    let i = 0;
    while (z > x[i + 1]) i++;
    const h = x[i + 1] - x[i];
    const t = (z - x[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y[i + 1] + (t3 - t2) * h * m[i + 1];
  };
};

const T = {
  yb: pchip([[-2.398, 0.36], [-2.25, 0.32], [-2.0, 0.28], [-1.55, 0.24], [-1.2, 0.22], [1.2, 0.22], [1.6, 0.22], [1.95, 0.24], [2.15, 0.27], [2.235, 0.3]]),
  wb: pchip([[-2.398, 0.74], [-2.25, 0.8], [-2.0, 0.84], [-1.55, 0.88], [-1.2, 0.898], [-0.9, 0.905], [1.0, 0.905], [1.2, 0.903], [1.6, 0.895], [1.95, 0.865], [2.15, 0.8], [2.235, 0.74]]),
  yBelt: pchip([[-2.398, 0.9], [-2.25, 0.94], [-2.0, 0.975], [-1.55, 1.0], [-1.2, 1.03], [-0.9, 1.03], [-0.3, 1.005], [0.5, 0.985], [0.97, 0.96], [1.2, 0.92], [1.6, 0.85], [1.95, 0.79], [2.15, 0.74], [2.235, 0.68]]),
  yTop: pchip([
    [-2.398, 0.92], [-2.25, 0.96], [-2.0, 0.985], [-1.55, 1.0], [-1.4, 1.1], [-1.2, 1.25], [-1.0, 1.35], [-0.9, 1.385], [-0.5, 1.42], [-0.3, 1.429], [0.0, 1.42], [0.15, 1.39], [0.5, 1.2],
    [0.97, 0.985], [1.2, 0.955], [1.6, 0.9], [1.95, 0.84], [2.15, 0.78], [2.235, 0.7],
  ]),
};
const ss = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * (3 - 2 * u);
};

// ring: left sill up to the roof centre (29 points), then the right side back down (28 more)
const NA = 16; // samples from the sill to the belt line
const NB = 12; // belt to roof centre
const HALF = NA + NB + 1; // 29
export const RING = HALF * 2 - 1; // 57
const BELT = NA; // ring index of the belt crease
const DZ = 0.04;

// the cross-section at z: control points of the left half, from the underside up over the roof
function half(z) {
  const yb = T.yb(z);
  const wb = T.wb(z);
  const yBelt = T.yBelt(z);
  const yTop = Math.max(T.yTop(z), yBelt + 0.03);
  const h = yTop - yBelt;
  const wTop = wb * (0.92 - 0.27 * ss(h / 0.43));
  const ws = 0.6;
  // the character line (C3) is the widest point; above it the flank tucks in 24° to the belt
  const yC = yBelt - 0.17;
  const A = [
    [ws, yb],
    [ws + 0.7 * (wb - ws), yb + 0.045],
    [wb - 0.03, yb + 0.16],
    [wb - 0.008, yb + 0.3],
    [wb, yC],
    [wb - 0.075, yBelt],
  ];
  const B = [
    [wb - 0.075, yBelt],
    [wb - 0.075 - (wb - 0.075 - wTop) * 0.55, yBelt + h * 0.55 + 0.004],
    [wTop, yBelt + h * 0.93],
    [wTop * 0.5, yTop - 0.004],
    [0, yTop],
  ];
  return {A, B, yc: (yb + yTop) / 2};
}
const sampleCurve = (pts, n, first) => {
  const v = pts.map(([x, y], i) => new THREE.Vector3(x + i * 1e-5, y + i * 1e-5, 0));
  const c = new THREE.CatmullRomCurve3(v, false, 'centripetal');
  const out = [];
  for (let i = first ? 0 : 1; i <= n; i++) {
    const p = c.getPoint(i / n);
    out.push([p.x, p.y]);
  }
  return out;
};
// the nose and tail close like a superellipse over their last stretch
const TAPER = {front: 0.075, rear: 0.085};
const taper = (z) => {
  if (z > DIM.nose - TAPER.front) {
    const t = (z - (DIM.nose - TAPER.front)) / TAPER.front;
    return Math.pow(Math.max(0, 1 - Math.pow(t, 4)), 1 / 4);
  }
  if (z < DIM.tail + TAPER.rear) {
    const t = (DIM.tail + TAPER.rear - z) / TAPER.rear;
    return Math.pow(Math.max(0, 1 - Math.pow(t, 4)), 1 / 4);
  }
  return 1;
};

const ARCH = [
  {z: DIM.zFront, R: 0.385},
  {z: DIM.zRear, R: 0.375},
];
const AY = 0.33;

// which panel owns a cell, and which material (0 paint, 1 glass, 2 trim)
const DOORS = [
  {id: 'doorFL', z0: -0.1, z1: 0.97, left: true},
  {id: 'doorFR', z0: -0.1, z1: 0.97, left: false},
  {id: 'doorRL', z0: -1.02, z1: -0.12, left: true},
  {id: 'doorRR', z0: -1.02, z1: -0.12, left: false},
];
function ownerOf(zc, j, yc) {
  const jj = j < RING / 2 ? j : RING - 2 - j; // mirrored to the left half, 0..27
  const left = j < RING / 2;
  // the flat end faces are painted; the black valance is a decal across them (details.js)
  if (zc >= DIM.nose - 1e-6) return {id: 'bumperF', m: 0};
  if (zc <= DIM.tail + 1e-6) return {id: 'bumperR', m: 0};
  if (zc > 2.02) return {id: 'bumperF', m: yc < 0.43 ? 2 : 0};
  if (zc < -2.05) return {id: 'bumperR', m: yc < 0.45 ? 2 : 0};
  if (jj >= BELT) {
    if (zc > 0.97) return {id: 'hood', m: 0};
    if (zc < -1.55) return {id: 'trunk', m: 0};
    // the greenhouse
    let m = 0;
    if (zc > 0.1) m = jj >= 19 ? 1 : 0;
    else if (zc < -1.0) m = jj >= 19 ? 1 : 0;
    else if (jj >= 22) m = 0;
    else m = zc > -0.17 && zc < -0.05 ? 0 : 1;
    return {id: 'roof', m};
  }
  if (jj >= 5) for (const d of DOORS) if (d.left === left && zc >= d.z0 && zc < d.z1) return {id: d.id, m: 0};
  return {id: 'tub', m: jj <= 3 ? 2 : 0};
}

export const BODY_PANELS = {
  tub: 'Body shell',
  hood: 'Hood',
  trunk: 'Trunk lid',
  roof: 'Roof & glass',
  doorFL: 'Front left door',
  doorFR: 'Front right door',
  doorRL: 'Rear left door',
  doorRR: 'Rear right door',
  bumperF: 'Front bumper',
  bumperR: 'Rear bumper',
};

export function buildBody() {
  // regular stations, then two at each end on the same z: the last ring at full size and a collapsed one behind it,
  // which closes the nose and the tail with a flat face instead of pinching them to a point
  const zs = [DIM.tail];
  const collapsed = [true];
  for (let z = DIM.tail; z < DIM.nose - 1e-6; z += DZ) {
    zs.push(z);
    collapsed.push(false);
  }
  zs.push(DIM.nose, DIM.nose);
  collapsed.push(false, true);
  const NS = zs.length;
  const P = new Float32Array(NS * RING * 3);
  const inside = new Uint8Array(NS * RING);
  for (let i = 0; i < NS; i++) {
    const z = zs[i];
    const {A, B, yc} = half(z);
    const left = [...sampleCurve(A.slice(0, 5), 12, true), ...sampleCurve(A.slice(4), 4, false), ...sampleCurve(B, NB, false)];
    const s = collapsed[i] ? 0 : 1;
    const yBot = left[0][1];
    for (let k = 0; k < RING; k++) {
      const l = k < HALF ? left[k] : left[RING - 1 - k];
      const sign = k < HALF ? 1 : -1;
      let x = sign * l[0] * s;
      let y = yBot + (l[1] - yBot) * s; // the collapsed ring lies on the bottom edge, so the end face has no notch
      let zz = z;
      const o = (i * RING + k) * 3;
      // wheel arches: vertices inside the circle snap to its edge, the ones that were inside are remembered
      for (const a of ARCH) {
        const dz = zz - a.z;
        const dy = y - AY;
        const d = Math.hypot(dz, dy);
        if (Math.abs(x) > 0.5 && d < a.R) {
          inside[i * RING + k] = 1;
          if (d > 1e-4) {
            zz = a.z + (dz / d) * a.R;
            y = AY + (dy / d) * a.R;
          }
        }
      }
      P[o] = x;
      P[o + 1] = y;
      P[o + 2] = zz;
    }
  }
  // cells, bucketed per panel and material
  const belt = {L: [], R: []};
  const crease = {L: [], R: []};
  for (let i = 0; i < NS; i++) {
    for (const [side, k] of [['L', BELT], ['R', RING - 1 - BELT]]) {
      const o = (i * RING + k) * 3;
      belt[side].push([P[o], P[o + 1], P[o + 2]]);
      const c = (i * RING + (side === 'L' ? 12 : RING - 1 - 12)) * 3;
      crease[side].push([P[c], P[c + 1], P[c + 2]]);
    }
  }
  const buckets = {};
  for (let i = 0; i < NS - 1; i++) {
    const zc = (zs[i] + zs[i + 1]) / 2;
    for (let j = 0; j < RING - 1; j++) {
      const a = i * RING + j;
      const b = a + 1;
      const c = a + RING;
      const d = c + 1;
      if (inside[a] && inside[b] && inside[c] && inside[d]) continue;
      const yc = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1] + P[d * 3 + 1]) / 4;
      const {id, m} = ownerOf(zc, j, yc);
      const B = (buckets[id] ||= [[], [], []]);
      B[m].push(a, c, b, b, c, d);
    }
  }
  const panels = {};
  for (const [id, mats] of Object.entries(buckets)) {
    const remap = new Map();
    const pos = [];
    const index = [];
    const groups = [];
    for (let m = 0; m < 3; m++) {
      const start = index.length;
      for (const v of mats[m]) {
        let r = remap.get(v);
        if (r === undefined) {
          r = pos.length / 3;
          remap.set(v, r);
          pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
        }
        index.push(r);
      }
      if (index.length > start) groups.push({start, count: index.length - start, materialIndex: m});
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(index);
    for (const g of groups) geo.addGroup(g.start, g.count, g.materialIndex);
    const crisp = toCreasedNormals(geo, 0.35);
    crisp.computeBoundingBox();
    panels[id] = crisp;
  }
  return {panels, arches: ARCH, archY: AY, belt, crease, zs};
}
