// The 330e's body shell. One surface S(z, u): at every station z a cross-section runs from the sill, up the flank, over
// the shoulder, up the glass and across the roof (measured: length 4.633 m, width 1.811 m, height 1.429 m, wheelbase
// 2.81 m [bmw]). The nose and the tail close as superellipse caps, rounder in plan than in side view, so the corners
// sweep back the way the F30's do. The surface is then cut, triangle by triangle, along implicit curves: wheel arches,
// shut lines, the daylight opening with its Hofmeister kink, windscreen, rear window, sunroof. Every cut is exact to
// the curve, never to a grid cell, so the panels you take off have real outlines.
// Car frame: +z forward, +y up, +x the car's left, ground at y = 0, z = 0 midway between the axles.
import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';

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
const ss = (x) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * (3 - 2 * u);
};
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// side-view and plan-view profiles, tail to nose
const T = {
  // underside of the sill / bumper
  yb: pchip([[-2.398, 0.285], [-2.1, 0.26], [-1.8, 0.22], [-1.2, 0.2], [1.9, 0.2], [2.235, 0.205]]),
  // widest half-width
  wb: pchip([[-2.398, 0.875], [-2.0, 0.89], [-1.6, 0.902], [-1.0, 0.9055], [1.2, 0.9055], [1.7, 0.9], [2.235, 0.885]]),
  // the character line through the door handles
  ySh: pchip([[-2.398, 0.92], [-1.8, 0.915], [-1.0, 0.885], [0.0, 0.845], [0.9, 0.8], [1.4, 0.76], [1.9, 0.66], [2.235, 0.6]]),
  // the edge between flank and top: wing edge, window sill, deck edge
  yBelt: pchip([
    [-2.398, 1.03], [-2.3, 1.04], [-2.0, 1.04], [-1.75, 1.035], [-1.5, 1.02], [-1.2, 1.005], [-0.6, 0.985], [0.0, 0.965], [0.72, 0.95], [0.86, 0.94],
    [1.2, 0.895], [1.6, 0.82], [1.95, 0.745], [2.15, 0.685], [2.235, 0.66],
  ]),
  // the centreline: deck, rear window, roof, windscreen, hood
  yTop: pchip([
    [-2.398, 1.06], [-2.3, 1.07], [-2.0, 1.075], [-1.75, 1.085], [-1.55, 1.165], [-1.3, 1.265], [-1.1, 1.345], [-1.0, 1.375], [-0.7, 1.415], [-0.4, 1.429], [-0.2, 1.424],
    [0.02, 1.398], [0.1, 1.37], [0.3, 1.28], [0.6, 1.128], [0.86, 1.0], [1.2, 0.955], [1.6, 0.875], [1.95, 0.79], [2.15, 0.725], [2.235, 0.7],
  ]),
};
/** everything a section needs at station z */
const at = (z) => {
  const yb = T.yb(z);
  const wb = T.wb(z);
  const yBelt = T.yBelt(z);
  const yTop = Math.max(T.yTop(z), yBelt + 0.03);
  const h = yTop - yBelt;
  const k = ss(h / 0.4);
  return {yb, wb, yBelt, yTop, h, ySh: Math.min(T.ySh(z), yBelt - 0.05), yRail: yBelt + 0.86 * h, wRail: wb * (0.8 - 0.155 * k), xBelt: wb - 0.055 - 0.02 * k};
};

// ring: left sill up to the roof centre, then the right side back down
const NA1 = 16; // sill to the character line
const NA2 = 4; // character line to the belt
const NB1 = 8; // belt to the roof rail
const NB2 = 12; // roof rail to the centre
const JC = NA1;
const BELT = NA1 + NA2;
const JR = BELT + NB1;
const HALF = JR + NB2 + 1;
export const RING = HALF * 2 - 1;
const DZ = 0.03;

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
// the left half of the cross-section at z
function half(z) {
  const s = at(z);
  const {yb, wb, ySh, yBelt, yTop, h, yRail, wRail, xBelt} = s;
  const q = Math.min(1, h / 0.2); // the rail's corner tightens as the greenhouse rises out of the hood
  // open underneath between the sills; closed across under the bumpers
  const x0 = 0.55 * (1 - ss((Math.abs(z) - 1.66) / 0.14));
  const A1 = [[x0, yb], [wb - 0.13, yb], [wb - 0.045, yb + 0.035], [wb - 0.02, yb + 0.14], [wb - 0.004, yb + 0.32], [wb, ySh - 0.1], [wb - 0.003, ySh]];
  const A2 = [[wb - 0.003, ySh], [wb - 0.02, ySh + (yBelt - ySh) * 0.5], [xBelt, yBelt]];
  const rx = wRail + 0.012 * q;
  const ry = yRail - 0.03 * q;
  const B1 = [[xBelt, yBelt], [(xBelt + rx) / 2 + 0.01 * q, (yBelt + ry) / 2], [rx, ry]];
  const B2 = [[rx, ry], [wRail - 0.03, yRail + 0.004 * q], [wRail * 0.6, yBelt + h * 0.975], [wRail * 0.25, yTop - 0.002], [0, yTop]];
  return [...sampleCurve(A1, NA1, true), ...sampleCurve(A2, NA2, false), ...sampleCurve(B1, NB1, false), ...sampleCurve(B2, NB2, false)];
}

// the caps: |x / a|^nx + |t|^nx = 1 in plan, a squarer exponent in side view, and squarer still below the centre so the
// bumpers stand upright down to their lower edge
const CAP = {
  front: {L: 0.56, nx: 2.25, ny: 5.5, nl: 16, yc: 0.52},
  rear: {L: 0.5, nx: 2.7, ny: 7, nl: 14, yc: 0.62},
};
const sup = (t, n) => Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, t), n)), 1 / n);
const capAt = (z) => {
  const f = CAP.front;
  const r = CAP.rear;
  const c = z > DIM.nose - f.L ? f : z < DIM.tail + r.L ? r : null;
  if (!c) return null;
  const t = c === f ? (z - (DIM.nose - f.L)) / f.L : (DIM.tail + r.L - z) / r.L;
  return {sx: sup(t, c.nx), sy: sup(t, c.ny), sl: sup(t, c.nl), yc: c.yc};
};

const ARCH = [
  {z: DIM.zFront, R: 0.372},
  {z: DIM.zRear, R: 0.366},
];
const AY = 0.33;

// ---------------------------------------------------------------- the cut lines (all negative inside)
const SEAM_F = 1.66; // wing to front bumper, where it meets the arch
const SEAM_R = -1.585; // rear wing to bumper: level from the arch to the tail
const B_PILLAR = -0.14;
const DOOR_F = 0.9;
const zCowl = (x) => 0.845 - 0.4 * x * x; // foot of the windscreen
const zHdr = (x) => 0.035 - 0.08 * x * x; // its top
const zRH = (x) => -1.085 - 0.05 * x * x; // top of the rear window
const zDeck = (x) => -1.74 + 0.25 * x * x; // its foot
// the daylight opening's rear edge: leans back as it comes down, then kicks forward at the sill (the Hofmeister kink)
const zKink = (r) => -1.4 + 0.1 * Math.pow(r, 1.5) + 0.14 * Math.pow(Math.max(0, 1 - r / 0.45), 2);
const rrectSdf = (x, z, hx, hz, r) => {
  const qx = Math.abs(x) - hx + r;
  const qz = Math.abs(z) - hz + r;
  return Math.min(Math.max(qx, qz), 0) + Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) - r;
};
const F = {
  arch: (v) => Math.min(...ARCH.map((a) => Math.hypot(v.z - a.z, v.y - AY) - a.R)),
  bumperF: (v) => SEAM_F + ss((v.y - 0.58) / 0.14) * (0.39 - 0.22 * (v.x / 0.8) ** 2) - v.z,
  bumperR: (v) => Math.max(v.z - SEAM_R, v.y - 0.66),
  hoodRear: (v) => zCowl(v.x) + 0.075 - v.z,
  cowl: (v) => zCowl(v.x) - v.z,
  deck: (v) => v.z - (zDeck(v.x) - 0.03),
  lid: (v) => Math.max(Math.abs(v.x) - 0.62, 0.66 - v.y),
  doorBottom: (v) => T.yb(v.z) + 0.11 - v.y,
  doorFront: (v) => v.z - DOOR_F,
  doorMid: (v) => v.z - B_PILLAR,
  doorRear: (v) => Math.max(-1.12 - v.z, ARCH[1].R + 0.05 - Math.hypot(v.z - ARCH[1].z, v.y - AY)),
  ws: (v) => Math.max(v.z - (zCowl(v.x) - 0.03), zHdr(v.x) + 0.03 - v.z, Math.abs(v.x) - (at(v.z).wRail - 0.06)),
  wsFrame: (v) => Math.max(v.z - zCowl(v.x), zHdr(v.x) - v.z, Math.abs(v.x) - (at(v.z).wRail - 0.035)),
  rw: (v) => Math.max(zDeck(v.x) + 0.03 - v.z, v.z - (zRH(v.x) - 0.03), Math.abs(v.x) - (at(v.z).wRail - 0.065)),
  rwFrame: (v) => Math.max(zDeck(v.x) - v.z, v.z - zRH(v.x), Math.abs(v.x) - (at(v.z).wRail - 0.04)),
  sun: (v) => rrectSdf(v.x, v.z + 0.34, 0.4, 0.25, 0.06),
  sunFrame: (v) => rrectSdf(v.x, v.z + 0.34, 0.42, 0.27, 0.07),
  side: (v) => {
    const s = at(v.z);
    const top = s.yRail - 0.03;
    const r = clamp((v.y - s.yBelt) / Math.max(1e-3, top - s.yBelt), 0, 1);
    return Math.max(s.yBelt + 0.024 - v.y, v.y - (top - 0.02), v.z - 0.78, zKink(r) + 0.02 - v.z);
  },
  sideFrame: (v) => {
    const s = at(v.z);
    const top = s.yRail - 0.03;
    const r = clamp((v.y - s.yBelt) / Math.max(1e-3, top - s.yBelt), 0, 1);
    return Math.max(s.yBelt + 0.006 - v.y, v.z - 0.82, zKink(r) - v.z);
  },
  pillar: (v) => Math.abs(v.z - B_PILLAR) - 0.045,
  divider: (v) => Math.abs(v.z + 0.99) - 0.011,
};
// which cells each cut touches: 's' the flank, 'g' the glass band, 'r' the roof, 'u' the underside
const CUTS = [
  ['arch', 'su'], ['bumperF', 'sgru'], ['bumperR', 'sgru'], ['hoodRear', 'gr'], ['cowl', 'gr'], ['deck', 'sgr'], ['lid', 'sgr'],
  ['doorBottom', 's'], ['doorFront', 's'], ['doorMid', 's'], ['doorRear', 's'],
  ['ws', 'r'], ['wsFrame', 'r'], ['rw', 'r'], ['rwFrame', 'r'], ['sun', 'r'], ['sunFrame', 'r'],
  ['side', 'g'], ['sideFrame', 'g'], ['pillar', 'g'], ['divider', 'g'],
];
const zoneOf = (cj) => (cj < 1 ? 'u' : cj < BELT ? 's' : cj < JR ? 'g' : 'r');

// panel and material (0 paint, 1 glass, 2 black trim) of a piece, from its centroid
function owner(zone, c, down) {
  if (zone !== 'r' && zone !== 'g' && F.arch(c) < 0) return null;
  // the flat underside is black; where the same strip turns up into the nose or the tail it is paint again
  const m = zone === 'u' && down ? 2 : 0;
  if (F.bumperF(c) < 0) return ['bumperF', m];
  if (F.bumperR(c) < 0) return ['bumperR', m];
  if (zone === 'u') return ['tub', m];
  if (F.deck(c) < 0) return [F.lid(c) < 0 ? 'trunk' : 'tub', 0];
  if (zone === 'r' || zone === 'g') {
    if (F.hoodRear(c) < 0) return ['hood', 0];
    if (F.cowl(c) < 0) return ['tub', 2];
    if (zone === 'r') {
      if (F.ws(c) < 0 || F.rw(c) < 0 || F.sun(c) < 0) return ['roof', 1];
      if (F.wsFrame(c) < 0 || F.rwFrame(c) < 0 || F.sunFrame(c) < 0) return ['roof', 2];
      return ['roof', 0];
    }
    if (F.sideFrame(c) < 0) return ['roof', F.side(c) < 0 && F.pillar(c) > 0 && F.divider(c) > 0 ? 1 : 2];
    return ['roof', 0];
  }
  if (F.doorBottom(c) < 0) {
    const s = c.x > 0 ? 'L' : 'R';
    if (c.z < DOOR_F && c.z > B_PILLAR) return ['doorF' + s, 0];
    if (c.z < B_PILLAR && F.doorRear(c) < 0) return ['doorR' + s, 0];
  }
  return ['tub', 0];
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

// ---------------------------------------------------------------- cutting a triangle along f = 0
const mix = (a, b, k) => {
  const nx = a.nx + (b.nx - a.nx) * k;
  const ny = a.ny + (b.ny - a.ny) * k;
  const nz = a.nz + (b.nz - a.nz) * k;
  const l = Math.hypot(nx, ny, nz) || 1;
  return {x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, nx: nx / l, ny: ny / l, nz: nz / l};
};
function cut(tris, f, zones) {
  const out = [];
  const EPS = 1e-6;
  for (const t of tris) {
    if (!zones.includes(t.zone)) {
      out.push(t);
      continue;
    }
    const v = t.v;
    const d = [f(v[0]), f(v[1]), f(v[2])].map((x) => (Math.abs(x) < EPS ? 0 : x));
    if ((d[0] >= 0 && d[1] >= 0 && d[2] >= 0) || (d[0] <= 0 && d[1] <= 0 && d[2] <= 0)) {
      out.push(t);
      continue;
    }
    const neg = [];
    const pos = [];
    for (let e = 0; e < 3; e++) {
      const a = v[e];
      const b = v[(e + 1) % 3];
      const da = d[e];
      const db = d[(e + 1) % 3];
      if (da <= 0) neg.push(a);
      if (da >= 0) pos.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const m = mix(a, b, da / (da - db));
        neg.push(m);
        pos.push(m);
      }
    }
    for (const poly of [neg, pos]) for (let i = 1; i + 1 < poly.length; i++) out.push({v: [poly[0], poly[i], poly[i + 1]], zone: t.zone});
  }
  return out;
}

export function buildBody() {
  // stations: an even pitch, the planes the shut lines lie on, and the caps' own spacing (even in angle round the corner)
  const want = [DIM.tail, DIM.nose, SEAM_F, SEAM_R, DOOR_F, B_PILLAR, B_PILLAR - 0.045, B_PILLAR + 0.045, 1.8, -1.8];
  for (const [c, dir, end] of [[CAP.front, 1, DIM.nose], [CAP.rear, -1, DIM.tail]]) {
    const K = 22;
    for (let k = 1; k < K; k++) want.push(end - dir * c.L * (1 - Math.pow(Math.sin(((k / K) * Math.PI) / 2), 2 / c.nx)));
  }
  for (let z = DIM.tail + DZ; z < DIM.nose - 1e-6; z += DZ) want.push(z);
  const zs = [];
  for (const z of want) if (!zs.some((q) => Math.abs(q - z) < 0.007)) zs.push(z);
  zs.sort((a, b) => a - b);
  const NS = zs.length;

  const P = new Float32Array(NS * RING * 3);
  for (let i = 0; i < NS; i++) {
    const z = zs[i];
    const left = half(z);
    const cap = capAt(z);
    for (let k = 0; k < RING; k++) {
      const l = k < HALF ? left[k] : left[RING - 1 - k];
      let x = (k < HALF ? 1 : -1) * l[0];
      let y = l[1];
      if (cap) {
        x *= cap.sx;
        y = cap.yc + (y - cap.yc) * (y > cap.yc ? cap.sy : cap.sl);
      }
      P.set([x, y, z], (i * RING + k) * 3);
    }
  }
  // normals from the grid; along the character line the two sides keep their own, so the crease stays a crease. It
  // fades out over the front wing, as on the car.
  const pt = (i, k) => new THREE.Vector3(P[(i * RING + k) * 3], P[(i * RING + k) * 3 + 1], P[(i * RING + k) * 3 + 2]);
  const CREASE = new Set([JC, RING - 1 - JC]);
  const sharp = (z) => ss((0.95 - z) / 0.3) * ss((z + 2.1) / 0.2);
  const ncache = new Map();
  const normal = (i, k, side) => {
    const key = (i * RING + k) * 3 + side + 1;
    let n = ncache.get(key);
    if (n) return n;
    const tk = pt(i, Math.min(RING - 1, k + (side >= 0 ? 1 : 0))).sub(pt(i, Math.max(0, k - (side <= 0 ? 1 : 0))));
    const ti = pt(Math.min(NS - 1, i + 1), k).sub(pt(Math.max(0, i - 1), k));
    n = tk.cross(ti);
    if (n.lengthSq() < 1e-14) n.set(0, 0, i > NS / 2 ? 1 : -1);
    n.normalize();
    if (side !== 0) n.lerp(normal(i, k, 0), 1 - sharp(zs[i])).normalize();
    ncache.set(key, n);
    return n;
  };
  const vert = (i, k, side) => {
    const o = (i * RING + k) * 3;
    const n = normal(i, k, CREASE.has(k) ? side : 0);
    return {x: P[o], y: P[o + 1], z: P[o + 2], nx: n.x, ny: n.y, nz: n.z};
  };
  let tris = [];
  const quad = (a, b, c, d, zone) => {
    tris.push({v: [a, b, c], zone}, {v: [b, d, c], zone});
  };
  for (let i = 0; i < NS - 1; i++) {
    for (let j = 0; j < RING - 1; j++) {
      const cj = j < HALF - 1 ? j : RING - 2 - j;
      // on the right half the ring runs downwards, so "above" and "below" swap
      const lo = j < HALF - 1 ? 1 : -1;
      quad(vert(i, j, lo), vert(i, j + 1, -lo), vert(i + 1, j, lo), vert(i + 1, j + 1, -lo), zoneOf(cj));
    }
  }
  for (const [name, zones] of CUTS) tris = cut(tris, F[name], zones);

  const buckets = {};
  for (const t of tris) {
    const [a, b, c] = t.v;
    const ax = b.x - a.x, ay = b.y - a.y, az = b.z - a.z;
    const bx = c.x - a.x, by = c.y - a.y, bz = c.z - a.z;
    const area = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
    if (area < 1e-10) continue;
    const o = owner(t.zone, {x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3, z: (a.z + b.z + c.z) / 3}, (az * bx - ax * bz) / area < -0.7);
    if (!o) continue;
    ((buckets[o[0]] ||= [[], [], []])[o[1]]).push(a, b, c);
  }
  const panels = {};
  for (const [id, mats] of Object.entries(buckets)) {
    const pos = [];
    const nor = [];
    const groups = [];
    for (let m = 0; m < 3; m++) {
      const start = pos.length / 3;
      for (const v of mats[m]) {
        pos.push(v.x, v.y, v.z);
        nor.push(v.nx, v.ny, v.nz);
      }
      if (pos.length / 3 > start) groups.push([start, pos.length / 3 - start, m]);
    }
    const raw = new THREE.BufferGeometry();
    raw.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    raw.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    const geo = mergeVertices(raw, 1e-5);
    for (const g of groups) geo.addGroup(...g);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    panels[id] = geo;
  }
  const line = (k) => zs.map((z, i) => [P[(i * RING + k) * 3], P[(i * RING + k) * 3 + 1], z]);
  return {
    panels, arches: ARCH, archY: AY, zs,
    belt: {L: line(BELT), R: line(RING - 1 - BELT)},
    crease: {L: line(JC), R: line(RING - 1 - JC)},
    at, zCowl, zDeck, B_PILLAR, DOOR_F,
  };
}
