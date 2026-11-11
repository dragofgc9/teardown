// The 1964 Cessna 172E, built from code in metres. Frame: y up, the nose toward +z, +x the left wing (port), the
// ground at y = 0 with the aircraft on its gear. Lofted superellipse fuselage with real door and windshield openings,
// NACA 2412 wings with the manual Para-Lift flaps and Frise ailerons on their hinge lines, the swept fin, the
// Continental O-300-D (six finned cylinders, sump, carburettor, magnetos, exhaust), the McCauley 76 in propeller
// lofted to its 53 in pitch, the flat spring-steel mains, the oleo nose leg, the 1964 panel with its U-yokes, the
// seats, the wing tanks and the Johnson bar between the seats.
//
// Every assembly in teardown.js is a group of parts; each part carries its own home position and the offset it
// travels when its assembly comes off. Bilateral parts are built once for the left side and mirrored (scale.x = -1),
// so their offsets mirror too. update(state) poses everything from the teardown progress, the controls and the
// propeller angle.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';
import {GROUPS, NG, SPEC} from './teardown.js';

const V3 = THREE.Vector3;
const D2R = Math.PI / 180;
const PI = Math.PI;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoother = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
export const ACCENT = '#e3562a';
/** the thrust line: crankshaft and propeller hub height */
export const THRUST_Y = 1.24;
export const PROP_Z = 2.16;

// ------------------------------------------------------------ geometry helpers
/**
 * Rings of points (all the same length) joined into a surface. closed: each ring is a loop. caps: fan-close the
 * first and last rings. skip(j, i): leave the quad between rings j, j+1 and points i, i+1 out (an opening).
 * inside(j): a point inside ring j, to turn the faces outward. Creased normals keep trailing edges sharp.
 */
function loft(rings, {closed = true, caps = closed, skip = null, inside = null, crease = 50} = {}) {
  const n = rings[0].length;
  const m = rings.length;
  const pos = [];
  const idx = [];
  for (const r of rings) for (const p of r) pos.push(p.x, p.y, p.z);
  const quads = [];
  for (let j = 0; j < m - 1; j++)
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      if (skip && skip(j, i)) continue;
      const a = j * n + i;
      const b = j * n + ((i + 1) % n);
      const c = (j + 1) * n + i;
      const d = (j + 1) * n + ((i + 1) % n);
      quads.push([a, c, b, b, c, d]);
    }
  // turn the faces outward: the summed face normals of the middle ring against the direction from its inside point
  const P = (k) => new V3(pos[3 * k], pos[3 * k + 1], pos[3 * k + 2]);
  const jm = Math.floor((m - 1) / 2);
  const ctr = inside ? inside(jm) : rings[jm].reduce((s, p) => s.add(p), new V3()).multiplyScalar(1 / n);
  let score = 0;
  for (const q of quads) {
    if (Math.floor(q[0] / n) !== jm) continue;
    const [a, c, b] = q;
    const nrm = new V3().crossVectors(P(c).sub(P(a)), P(b).sub(P(a)));
    score += nrm.dot(P(a).sub(ctr));
  }
  const flip = score < 0;
  for (const q of quads) idx.push(...(flip ? [q[0], q[2], q[1], q[3], q[5], q[4]] : q));
  if (caps) {
    for (const [j, toward] of [[0, 1], [m - 1, m - 2]]) {
      const ring = rings[j];
      const c = ring.reduce((s, p) => s.add(p), new V3()).multiplyScalar(1 / n);
      const away = c.clone().sub(rings[toward].reduce((s, p) => s.add(p), new V3()).multiplyScalar(1 / n));
      const base = pos.length / 3;
      for (const p of ring) pos.push(p.x, p.y, p.z);
      pos.push(c.x, c.y, c.z);
      const nrm = new V3().crossVectors(ring[0].clone().sub(c), ring[1].clone().sub(c));
      const f = nrm.dot(away) < 0;
      for (let i = 0; i < n; i++) {
        const a = base + i;
        const b = base + ((i + 1) % n);
        idx.push(...(f ? [base + n, b, a] : [base + n, a, b]));
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return toCreasedNormals(g, crease * D2R);
}

/** NACA 4-digit section: u (0 LE .. 1 TE) → [upper, lower] in chords */
const naca = (m, p, t) => (u) => {
  const x = clamp(u, 0, 1);
  const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const yc = m === 0 ? 0 : x < p ? (m / (p * p)) * (2 * p * x - x * x) : (m / (1 - p) ** 2) * (1 - 2 * p + 2 * p * x - x * x);
  return [yc + yt, yc - yt];
};
export const NACA2412 = naca(0.02, 0.4, 0.12);
const NACA0010 = naca(0, 0.4, 0.1);
const NACA0009 = naca(0, 0.4, 0.09);
/** a closed section loop from chord fraction c0 to c1: upper surface aft to fore, lower fore to aft */
function afRing(c0, c1, af, N = 22) {
  const us = [];
  for (let i = 0; i <= N; i++) us.push(c0 + ((c1 - c0) * (1 - Math.cos((PI * i) / N))) / 2);
  const up = us
    .slice()
    .reverse()
    .map((u) => [u, af(u)[0]]);
  const lo = us.map((u) => [u, af(u)[1]]);
  if (c0 === 0) lo.shift();
  if (c1 >= 1) lo.pop();
  return up.concat(lo);
}
/** a lifting surface: sections at the given stations, placed by place(u, v, station) */
const surface = (stations, c0, c1, af, place, N) => {
  const ring = afRing(c0, c1, af, N);
  return loft(stations.map((st) => ring.map(([u, v]) => place(u, v, st))));
};
const range = (a, b, n) => Array.from({length: n + 1}, (_, i) => lerp(a, b, i / n));
/** a cylinder between two points */
function rod(a, b, r, seg = 12, r2 = r) {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r2, r, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.clone().normalize()));
  g.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
  return g;
}
const tube = (pts, r, seg = 24) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 8);
/** a lathe about +y, laid along the given axis from a base point */
function lathe(profile, axis, base, seg = 32) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), axis.clone().normalize()));
  g.translate(base.x, base.y, base.z);
  return g;
}
const rbox = (w, h, d, r, x, y, z) => new RoundedBoxGeometry(w, h, d, 3, r).translate(x, y, z);

// ------------------------------------------------------------ the fuselage: superellipse stations along z
// z, half width, top, bottom, the height of the widest line, the exponents above and below it
const FUSE = [
  [1.15, 0.5, 1.62, 0.77, 1.2, 3.2, 3.0],
  [0.95, 0.53, 1.7, 0.72, 1.18, 4.0, 3.2],
  [0.55, 0.56, 1.98, 0.64, 1.16, 7.0, 3.4],
  [0.0, 0.565, 2.0, 0.61, 1.16, 8.0, 3.4],
  [-0.9, 0.55, 1.99, 0.63, 1.18, 7.0, 3.2],
  [-1.55, 0.49, 1.86, 0.71, 1.22, 4.5, 3.0],
  [-2.3, 0.4, 1.7, 0.85, 1.26, 3.2, 2.8],
  [-3.3, 0.28, 1.58, 1.02, 1.3, 2.6, 2.6],
  [-4.4, 0.17, 1.52, 1.18, 1.35, 2.4, 2.4],
  [-5.2, 0.09, 1.49, 1.3, 1.39, 2.2, 2.2],
  [-5.45, 0.045, 1.47, 1.36, 1.41, 2.0, 2.0],
].map(([z, hw, top, bot, ym, nt, nb]) => ({z, hw, top, bot, ym, nt, nb}));
const COWL = [
  [2.1, 0.235, 1.43, 1.05, 1.24, 2.1, 2.1],
  [2.02, 0.38, 1.5, 0.93, 1.23, 2.4, 2.4],
  [1.85, 0.465, 1.56, 0.84, 1.22, 2.8, 2.7],
  [1.55, 0.495, 1.6, 0.79, 1.21, 3.1, 2.9],
  [1.15, 0.5, 1.62, 0.77, 1.2, 3.2, 3.0],
].map(([z, hw, top, bot, ym, nt, nb]) => ({z, hw, top, bot, ym, nt, nb}));
const KEYS = ['hw', 'top', 'bot', 'ym', 'nt', 'nb'];
/** Catmull-Rom through the stations (sorted by z, nose first) */
function interp(S, z) {
  let k = 0;
  while (k < S.length - 2 && z < S[k + 1].z) k++;
  const a = S[k];
  const b = S[k + 1];
  const t = clamp((a.z - z) / (a.z - b.z), 0, 1);
  const p0 = S[Math.max(0, k - 1)];
  const p3 = S[Math.min(S.length - 1, k + 2)];
  const out = {z};
  const t2 = t * t;
  const t3 = t2 * t;
  for (const key of KEYS) {
    const m1 = (b[key] - p0[key]) / 2;
    const m2 = (p3[key] - a[key]) / 2;
    out[key] = (2 * t3 - 3 * t2 + 1) * a[key] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * b[key] + (t3 - t2) * m2;
  }
  return out;
}
export const fuseAt = (z) => interp(z > 1.15 ? COWL : FUSE, z);
const se = (c, e) => Math.sign(c) * Math.abs(c) ** e;
/** the point at angle th (0 = left side, π/2 = top) on the section p, pushed out by off */
function fusePt(p, th, off = 0) {
  const c = Math.cos(th);
  const s = Math.sin(th);
  const e = 2 / (s >= 0 ? p.nt : p.nb);
  const x = (p.hw + off) * se(c, e);
  const y = s >= 0 ? p.ym + (p.top - p.ym + off) * se(s, e) : p.ym + (p.ym - p.bot + off) * se(s, e);
  return new V3(x, y, p.z);
}
/**
 * A patch of the fuselage surface between z0 and z1 (z0 forward), its angle range lerping from [a0, a1] at z0 to
 * [b0, b1] at z1, pushed out by off: windows, doors, the cheat line.
 */
function patch(z0, z1, a0, a1, b0, b1, off, nz = 14, nt = 14) {
  const rings = [];
  for (let j = 0; j <= nz; j++) {
    const k = j / nz;
    const p = fuseAt(lerp(z0, z1, k));
    const t0 = lerp(a0, b0, k);
    const t1 = lerp(a1, b1, k);
    rings.push(range(t0, t1, nt).map((th) => fusePt(p, th, off)));
  }
  return loft(rings, {closed: false, inside: (j) => new V3(0, fuseAt(lerp(z0, z1, j / nz)).ym, lerp(z0, z1, j / nz))});
}

// the openings, as (z, angle) boxes on the left side; the right side is their mirror (angle → π - angle)
export const DOOR = {z0: 0.9, z1: -0.2, a0: -0.17 * PI, a1: 0.26 * PI};
const DOOR_WIN = {z0: 0.8, z1: -0.1, a0: 0.035 * PI, a1: 0.215 * PI};
const SCREEN = {z0: 0.93, z1: 0.55, a0: 0.27 * PI, a1: 0.73 * PI};
const STRIPE = [-0.04 * PI, -0.008 * PI];

// ------------------------------------------------------------ the wing: left panel, +x outboard
export const WING = {x0: 0.52, xc: 2.6, xt: 5.35, xtip: 5.51, cR: 1.63, cT: 1.12, zle: 0.55, y0: 2.04, flap: [0.6, 2.52], ail: [2.68, 5.12], hingeF: 0.76, hingeA: 0.75};
const DIH = Math.tan(SPEC.dihedral * D2R);
export function wingSt(x) {
  const ax = Math.abs(x);
  let c = ax <= WING.xc ? WING.cR : lerp(WING.cR, WING.cT, (ax - WING.xc) / (WING.xt - WING.xc));
  let ts = 1;
  if (ax > WING.xt) {
    const k = (ax - WING.xt) / (WING.xtip - WING.xt);
    c = lerp(WING.cT, 0.82, k * k);
    ts = lerp(1, 0.3, k);
  }
  // 1.5° incidence at the root washing out to -1.5° at the tip
  const tw = 1.5 - (3 * Math.max(0, ax - WING.x0)) / (WING.xtip - WING.x0);
  return {x, c, ts, tw, zle: WING.zle, y: WING.y0 + Math.max(0, ax - WING.x0) * DIH};
}
const wingPlace = (u, v, st) => {
  const a = u * st.c;
  const b = v * st.c * st.ts;
  const tw = st.tw * D2R;
  const da = a - 0.25 * st.c;
  const a2 = 0.25 * st.c + da * Math.cos(tw) + b * Math.sin(tw);
  const b2 = b * Math.cos(tw) - da * Math.sin(tw);
  return new V3(st.x, st.y + b2, st.zle - a2);
};
const wingStations = (a, b, n) => range(a, b, n).map(wingSt);

// ------------------------------------------------------------ the horizontal tail (left half) and the fin
const STAB = {x0: 0.06, xt: 1.6, xtip: 1.72, y: 1.33, hinge: 0.58};
function stabSt(x) {
  const k = clamp(x / STAB.xt, 0, 1);
  let c = lerp(1.3, 0.85, k);
  let ts = 1;
  const zle = lerp(-4.25, -4.62, k);
  if (x > STAB.xt) {
    const q = (x - STAB.xt) / (STAB.xtip - STAB.xt);
    c = lerp(0.85, 0.55, q * q);
    ts = lerp(1, 0.35, q);
  }
  return {x, c, ts, zle: zle - (x > STAB.xt ? 0.05 * ((x - STAB.xt) / (STAB.xtip - STAB.xt)) ** 2 : 0)};
}
const stabPlace = (u, v, st) => new V3(st.x, STAB.y + v * st.c * st.ts, st.zle - u * st.c);
const FIN = {y0: 1.4, y1: 2.66, ytip: 2.72, hinge: 0.6};
function finSt(y) {
  const k = clamp((y - FIN.y0) / (FIN.y1 - FIN.y0), 0, 1);
  let c = lerp(1.55, 0.74, k);
  let ts = 1;
  if (y > FIN.y1) {
    const q = (y - FIN.y1) / (FIN.ytip - FIN.y1);
    c = lerp(0.74, 0.5, q * q);
    ts = lerp(1, 0.35, q);
  }
  return {y, c, ts, zle: lerp(-4.1, -5.02, k)};
}
const finPlace = (u, v, st) => new V3(v * st.c * st.ts, st.y, st.zle - u * st.c);

// ------------------------------------------------------------ materials
const KIND = {
  skin: {color: '#f5f1e9', roughness: 0.38, metalness: 0},
  trim: {color: '#22344d', roughness: 0.4, metalness: 0},
  glass: {color: '#26323c', roughness: 0.06, metalness: 0.55},
  shell: {color: '#3a3d42', roughness: 0.85, metalness: 0},
  dark: {color: '#2b2e33', roughness: 0.8, metalness: 0},
  alu: {color: '#c3c8cd', roughness: 0.35, metalness: 0.75},
  steel: {color: '#d6dade', roughness: 0.28, metalness: 0.9},
  case: {color: '#80868d', roughness: 0.5, metalness: 0.5},
  fins: {color: '#3d4045', roughness: 0.55, metalness: 0.4},
  exhaust: {color: '#6e5544', roughness: 0.7, metalness: 0.3},
  rubber: {color: '#1c1d1f', roughness: 0.85, metalness: 0},
  vinyl: {color: '#a98559', roughness: 0.7, metalness: 0},
  panel: {color: '#34373c', roughness: 0.6, metalness: 0},
  gauge: {color: '#e9e7e1', roughness: 0.4, metalness: 0},
  stand: {color: '#4d535b', roughness: 0.6, metalness: 0.3},
  fire: {color: '#a9acaa', roughness: 0.4, metalness: 0.7},
};
// the kinds that fade in the x-ray
const SKIN = new Set(['skin', 'trim', 'glass', 'shell']);

// ------------------------------------------------------------ the build
export function buildPlane() {
  const root = new THREE.Group();
  const ids = [...GROUPS.map((g) => g.id), 'fuse', 'stands'];
  const G = Object.fromEntries(ids.map((id) => [id, {parts: [], mats: {}, hi: 0}]));
  const anchors = [];
  const xrayMats = [];
  const mat = (gid, kind, side = THREE.FrontSide) => {
    const key = `${kind}:${side}`;
    const ms = G[gid].mats;
    if (!ms[key]) {
      const m = new THREE.MeshStandardMaterial({...KIND[kind], side, envMapIntensity: KIND[kind].metalness > 0.5 ? 0.6 : 0.5});
      m.emissive = new THREE.Color(ACCENT);
      m.emissiveIntensity = 0;
      m.userData.kind = kind;
      if (SKIN.has(kind) && gid !== 'interior') {
        m.transparent = true;
        xrayMats.push(m);
      }
      ms[key] = m;
    }
    return ms[key];
  };
  const mesh = (geo, gid, kind, side) => {
    const m = new THREE.Mesh(geo, mat(gid, kind, side));
    m.castShadow = kind !== 'glass';
    m.receiveShadow = true;
    m.userData.gid = gid;
    return m;
  };
  /** a part: obj (already holding its meshes) under parent, travelling dir (local) when its assembly comes off */
  const part = (gid, parent, obj, dir, delay = 0) => {
    parent.add(obj);
    obj.traverse((o) => (o.userData.gid ??= gid));
    G[gid].parts.push({obj, home: obj.position.clone(), dir: new V3(...dir), delay});
    return obj;
  };
  const group = (...meshes) => {
    const g = new THREE.Group();
    for (const m of meshes) g.add(m);
    return g;
  };
  /** a label anchor at world point p (left-side coordinates) inside obj, whose home position is home */
  const anchor = (gid, obj, p, name, sub, home = obj.position) => {
    const a = new THREE.Object3D();
    a.position.copy(p).sub(home);
    obj.add(a);
    anchors.push({gid, name, sub, obj: a});
  };

  // ============================================================ the fuselage (stays on the jig)
  const fuse = new THREE.Group();
  part('fuse', root, fuse, [0, 0, 0]);
  {
    // angles: uniform, plus every opening edge on both sides, so the openings are exact
    const ths = new Set(range(0, 2 * PI, 72).slice(0, -1).map((x) => +x.toFixed(6)));
    for (const a of [DOOR.a0, DOOR.a1, SCREEN.a0, SCREEN.a1]) {
      ths.add(+(((a % (2 * PI)) + 2 * PI) % (2 * PI)).toFixed(6));
      ths.add(+((((PI - a) % (2 * PI)) + 2 * PI) % (2 * PI)).toFixed(6));
    }
    const TH = [...ths].sort((a, b) => a - b);
    const zs = new Set(range(1.15, -5.45, 66).map((x) => +x.toFixed(5)));
    for (const z of [DOOR.z0, DOOR.z1, SCREEN.z0, SCREEN.z1]) zs.add(z);
    const ZS = [...zs].sort((a, b) => b - a);
    const rings = ZS.map((z) => TH.map((th) => fusePt(fuseAt(z), th)));
    const inBox = (z, th, b) => z <= b.z0 + 1e-6 && z >= b.z1 - 1e-6 && th >= b.a0 - 1e-6 && th <= b.a1 + 1e-6;
    const sym = (th) => {
      // fold the right side onto the left: angle → π - angle, into (-π/2, 3π/2]
      const a = th > PI / 2 && th < (3 * PI) / 2 ? PI - th : th > PI ? th - 2 * PI : th;
      return a;
    };
    const skip = (j, i) => {
      const z = (ZS[j] + ZS[j + 1]) / 2;
      const t0 = TH[i];
      const t1 = TH[(i + 1) % TH.length] || 2 * PI;
      const th = sym((t0 + (t1 < t0 ? t1 + 2 * PI : t1)) / 2);
      return inBox(z, th, DOOR) || inBox(z, th, SCREEN);
    };
    const inside = (j) => new V3(0, fuseAt(ZS[j]).ym, ZS[j]);
    const skinGeo = loft(rings, {caps: false, skip, inside, crease: 70});
    fuse.add(mesh(skinGeo, 'fuse', 'skin'), mesh(skinGeo, 'fuse', 'shell', THREE.BackSide));
    // the firewall and the tail cap
    const fw = fuseAt(1.15);
    const fwRing = range(0, 2 * PI, 48).slice(0, -1).map((th) => fusePt(fw, th, -0.004));
    fuse.add(mesh(loft([fwRing, fwRing.map((p) => p.clone().setZ(1.14))], {crease: 30}), 'fuse', 'fire'));
    const tc = fuseAt(-5.449);
    const tcRing = range(0, 2 * PI, 32).slice(0, -1).map((th) => fusePt(tc, th));
    fuse.add(mesh(loft([tcRing, tcRing.map((p) => p.clone().setZ(-5.47))]), 'fuse', 'skin'));
    // the cheat line, both sides, and the fixed windows: rear side windows and the Omni-Vision rear window
    for (const s of [1, -1]) {
      const m = (a) => (s > 0 ? a : PI - a);
      const st = patch(DOOR.z1 - 0.005, -5.25, m(STRIPE[0]), m(STRIPE[1]), m(STRIPE[0] + 0.02 * PI), m(STRIPE[1] + 0.025 * PI), 0.003, 40, 2);
      fuse.add(mesh(st, 'fuse', 'trim', THREE.DoubleSide));
      const fw2 = patch(1.13, DOOR.z0 + 0.005, m(STRIPE[0]), m(STRIPE[1]), m(STRIPE[0]), m(STRIPE[1]), 0.003, 4, 2);
      fuse.add(mesh(fw2, 'fuse', 'trim', THREE.DoubleSide));
      const rw = patch(-0.32, -1.0, m(0.035 * PI), m(0.215 * PI), m(0.05 * PI), m(0.17 * PI), 0.004, 10, 8);
      fuse.add(mesh(rw, 'fuse', 'glass', THREE.DoubleSide));
    }
    fuse.add(mesh(patch(-1.08, -2.15, 0.3 * PI, 0.7 * PI, 0.4 * PI, 0.6 * PI, 0.004, 14, 10), 'fuse', 'glass', THREE.DoubleSide));
    // the centre section the two wings bolt to, flush with them over the cabin roof
    fuse.add(mesh(surface([-WING.x0, 0, WING.x0].map((x) => ({...wingSt(WING.x0), x})), 0, 1, NACA2412, wingPlace, 24), 'fuse', 'skin'));
    // the engine mount: welded tube from the firewall to the four engine pads
    for (const sx of [1, -1])
      for (const [y0, y1] of [[1.48, 1.36], [0.95, 1.08]]) {
        const a = new V3(sx * 0.34, y0, 1.15);
        const b = new V3(sx * 0.2, y1, 1.36);
        fuse.add(mesh(rod(a, b, 0.012), 'fuse', 'stand'));
        fuse.add(mesh(rod(a, new V3(0, y1, 1.36), 0.01), 'fuse', 'stand'));
      }
    // the floor and the Johnson bar between the front seats: pulled up, it lowers the flaps through cables
    fuse.add(mesh(new THREE.BoxGeometry(0.76, 0.02, 1.5).translate(0, 0.73, -0.15), 'fuse', 'dark'));
    const jb = new THREE.Group();
    jb.position.set(0, 0.72, -0.34);
    jb.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.44, 10).rotateX(PI / 2).translate(0, 0, 0.22), 'fuse', 'steel'));
    jb.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 12).rotateX(PI / 2).translate(0, 0, 0.47), 'fuse', 'rubber'));
    jb.add(mesh(new THREE.BoxGeometry(0.06, 0.05, 0.08), 'fuse', 'case'));
    fuse.add(jb);
    fuse.userData.johnson = jb;
    anchor('fuse-in', fuse, new V3(0, 0.82, -0.12), 'JOHNSON BAR', 'MANUAL FLAPS · 0 TO 40°');
    anchor('fuse', fuse, new V3(0.1, 1.55, -3.2), 'FUSELAGE', 'SEMI-MONOCOQUE · STAYS ON THE JIG');
  }

  // ============================================================ the cowling: upper and lower halves
  {
    const zs = range(2.1, 1.15, 22);
    const half = (t0, t1) => {
      const rings = zs.map((z) => range(t0, t1, 24).map((th) => fusePt(fuseAt(z), th, 0.002)));
      return loft(rings, {closed: false, inside: (j) => new V3(0, fuseAt(zs[j]).ym, zs[j])});
    };
    const up = group(mesh(half(0, PI), 'cowl', 'skin', THREE.DoubleSide));
    const lo = group(mesh(half(PI, 2 * PI), 'cowl', 'skin', THREE.DoubleSide));
    // the nose bowl's inlets around the spinner, dark
    const bowl = (t0, t1) => {
      const p = fuseAt(2.1);
      const outer = range(t0, t1, 16).map((th) => fusePt(p, th, 0.002));
      const inner = range(t0, t1, 16).map((th) => new V3(0.175 * Math.cos(th), THRUST_Y + 0.175 * Math.sin(th), 2.1));
      return loft([outer, inner], {closed: false, caps: false});
    };
    up.add(mesh(bowl(0, PI), 'cowl', 'dark', THREE.DoubleSide));
    lo.add(mesh(bowl(PI, 2 * PI), 'cowl', 'dark', THREE.DoubleSide));
    for (const s of [1, -1]) {
      const m = (a) => (s > 0 ? a : PI - a);
      lo.add(mesh(patch(1.9, 1.15, m(STRIPE[0]), m(STRIPE[1]), m(STRIPE[0]), m(STRIPE[1]), 0.005, 8, 2), 'cowl', 'trim', THREE.DoubleSide));
    }
    part('cowl', root, up, [0, 1.25, 2.0]);
    part('cowl', root, lo, [0, -0.5, 2.0], 0.15);
    anchor('cowl', up, new V3(0.3, 1.58, 1.6), 'UPPER COWLING', 'HINGED OIL-DOOR ACCESS');
  }

  // ============================================================ the engine: Continental O-300-D
  const engine = new THREE.Group();
  {
    const Y = THRUST_Y;
    engine.add(mesh(rbox(0.34, 0.3, 0.66, 0.05, 0, Y - 0.02, 1.58), 'engine', 'case'));
    engine.add(mesh(rbox(0.3, 0.13, 0.42, 0.04, 0, Y - 0.2, 1.52), 'engine', 'case'));
    // six finned cylinders, 1-3-5 on the right, 2-4-6 on the left, the left bank staggered forward
    const barrel = [];
    for (let i = 0; i <= 14; i++) barrel.push([i % 2 ? 0.083 : 0.063, (i / 14) * 0.17]);
    const head = [[0.07, 0.17]];
    for (let i = 0; i <= 8; i++) head.push([i % 2 ? 0.094 : 0.072, 0.17 + (i / 8) * 0.1]);
    head.push([0.05, 0.28], [0.0, 0.282]);
    for (const s of [1, -1])
      for (let i = 0; i < 3; i++) {
        const z = 1.36 + i * 0.2 + (s > 0 ? 0.05 : -0.0);
        const base = new V3(s * 0.165, Y, z);
        engine.add(mesh(lathe(barrel, new V3(s, 0, 0), base, 28), 'engine', 'fins'));
        engine.add(mesh(lathe(head, new V3(s, 0, 0), base, 28), 'engine', 'alu'));
        engine.add(mesh(rbox(0.05, 0.06, 0.15, 0.015, s * 0.43, Y + 0.035, z), 'engine', 'case'));
        // push-rod tubes under the barrel, an intake pipe up from the sump, the exhaust down and back
        engine.add(mesh(rod(new V3(s * 0.17, Y - 0.07, z - 0.03), new V3(s * 0.4, Y - 0.06, z - 0.03), 0.009), 'engine', 'steel'));
        engine.add(mesh(rod(new V3(s * 0.17, Y - 0.07, z + 0.03), new V3(s * 0.4, Y - 0.06, z + 0.03), 0.009), 'engine', 'steel'));
        engine.add(mesh(tube([new V3(s * 0.08, Y - 0.24, 1.6), new V3(s * 0.2, Y - 0.2, z + 0.02), new V3(s * 0.33, Y - 0.09, z + 0.04)], 0.016, 16), 'engine', 'case'));
        engine.add(mesh(tube([new V3(s * 0.38, Y - 0.09, z - 0.04), new V3(s * 0.36, Y - 0.24, z - 0.06), new V3(s * 0.27, Y - 0.36, 1.32), new V3(s * 0.24, Y - 0.44, 1.2)], 0.022, 20), 'engine', 'exhaust'));
      }
    // carburettor and air box under the sump, the two magnetos and the starter on the accessory case
    engine.add(mesh(rbox(0.1, 0.12, 0.1, 0.02, 0, Y - 0.33, 1.6), 'engine', 'alu'));
    engine.add(mesh(rbox(0.16, 0.06, 0.18, 0.02, 0, Y - 0.42, 1.6), 'engine', 'dark'));
    for (const s of [1, -1]) engine.add(mesh(rod(new V3(s * 0.09, Y + 0.12, 1.26), new V3(s * 0.12, Y + 0.18, 1.18), 0.045, 16), 'engine', 'dark'));
    engine.add(mesh(rod(new V3(0, Y - 0.12, 1.25), new V3(0, Y - 0.12, 1.16), 0.055, 16), 'engine', 'dark'));
    engine.add(mesh(rod(new V3(-0.13, Y - 0.04, 1.25), new V3(-0.13, Y - 0.04, 1.17), 0.06, 16), 'engine', 'case'));
    // the crankshaft nose and the propeller flange
    engine.add(mesh(rod(new V3(0, Y, 1.9), new V3(0, Y, 2.04), 0.05, 20), 'engine', 'steel'));
    engine.add(mesh(rod(new V3(0, Y, 2.0), new V3(0, Y, 2.04), 0.095, 24), 'engine', 'steel'));
    part('engine', root, engine, [0, 0.06, 2.0]);
    anchor('engine', engine, new V3(0.42, Y + 0.08, 1.6), 'CONTINENTAL O-300-D', '145 HP AT 2700 RPM · 301 CU IN');
    anchor('engine', engine, new V3(0.29, Y - 0.34, 1.34), 'EXHAUST STACKS', 'ONE PER BANK');
    anchor('engine', engine, new V3(0, Y - 0.38, 1.6), 'CARBURETTOR', 'MARVEL-SCHEBLER · UNDER THE SUMP');
  }

  // ============================================================ the propeller and spinner
  const propSpin = new THREE.Group();
  let blur = null;
  const prop = new THREE.Group();
  {
    prop.position.set(0, THRUST_Y, PROP_Z);
    prop.add(propSpin);
    const P = SPEC.propPitch;
    const R = SPEC.propD / 2;
    const stations = range(0.15, R, 14).map((r) => {
      const k = (r - 0.15) / (R - 0.15);
      const c = r < 0.45 ? lerp(0.1, 0.14, (r - 0.15) / 0.3) : lerp(0.14, 0.065, ((r - 0.45) / (R - 0.45)) ** 1.6);
      return {r, c, t: lerp(0.19, 0.07, k), beta: Math.atan(P / (2 * PI * r))};
    });
    // counter-clockwise from the front: the blade at the top moves toward -x, the leading edge leads
    const bladePlace = (u, v, st) => {
      const C = new V3(Math.cos(st.beta), 0, -Math.sin(st.beta));
      const N = new V3(Math.sin(st.beta), 0, Math.cos(st.beta));
      return new V3(0, st.r, 0).addScaledVector(C, (u - 0.35) * st.c).addScaledVector(N, (v / 0.12) * st.t * st.c);
    };
    const blade = surface(stations, 0, 1, naca(0.04, 0.4, 0.12), bladePlace, 14);
    for (const a of [0, PI]) {
      const b = mesh(blade, 'prop', 'alu');
      b.rotation.z = a;
      propSpin.add(b);
    }
    propSpin.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.12, 24).rotateX(PI / 2), 'prop', 'steel'));
    const spin = [[0.172, 0], [0.17, 0.06], [0.158, 0.14], [0.128, 0.22], [0.084, 0.29], [0.034, 0.326], [0, 0.336]];
    propSpin.add(mesh(lathe(spin, new V3(0, 0, 1), new V3(0, 0, -0.07), 40), 'prop', 'skin'));
    propSpin.add(mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.01, 40).rotateX(PI / 2).translate(0, 0, -0.07), 'prop', 'alu'));
    // the blur disc: the blades fade into it as the rpm climbs, so a running propeller reads as running
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g2 = c.getContext('2d');
    const gr = g2.createRadialGradient(128, 128, 20, 128, 128, 127);
    gr.addColorStop(0, 'rgba(110,118,126,0)');
    gr.addColorStop(0.22, 'rgba(110,118,126,0.42)');
    gr.addColorStop(0.8, 'rgba(110,118,126,0.24)');
    gr.addColorStop(0.95, 'rgba(80,86,92,0.55)');
    gr.addColorStop(1, 'rgba(80,86,92,0)');
    g2.fillStyle = gr;
    g2.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    blur = new THREE.Mesh(new THREE.CircleGeometry(R, 64), new THREE.MeshBasicMaterial({map: tex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide}));
    blur.userData.gid = 'prop';
    prop.add(blur);
    for (const m of Object.values(G.prop.mats)) m.transparent = true;
    part('prop', root, prop, [0, 0, 3.4]);
    anchor('prop', prop, new V3(0.02, THRUST_Y + 0.62, PROP_Z), 'McCAULEY PROPELLER', '76 IN DIA · 53 IN PITCH');
    anchor('prop', prop, new V3(0, THRUST_Y + 0.05, PROP_Z + 0.22), 'SPINNER', 'ALUMINIUM · TWO PIECES');
  }

  // ============================================================ the windshield
  {
    const ws = group(mesh(patch(SCREEN.z0 + 0.012, SCREEN.z1 - 0.012, SCREEN.a0 - 0.005 * PI, SCREEN.a1 + 0.005 * PI, SCREEN.a0 - 0.005 * PI, SCREEN.a1 + 0.005 * PI, 0.004, 10, 24), 'windshield', 'glass', THREE.DoubleSide));
    part('windshield', root, ws, [0, 0.9, 1.1]);
    anchor('windshield', ws, new V3(0, 1.88, 0.72), 'WINDSHIELD', 'ONE-PIECE ACRYLIC');
  }

  // ============================================================ the interior: panel and yokes, the rear bench
  const yokes = [];
  {
    const panel = new THREE.Group();
    panel.add(mesh(rbox(1.0, 0.3, 0.07, 0.02, 0, 1.38, 0.86), 'interior', 'panel'));
    panel.add(mesh(rbox(1.02, 0.05, 0.22, 0.02, 0, 1.55, 0.92), 'interior', 'panel'));
    // the six-pack in front of the pilot (left seat), engine gauges on the right, the radios centre-mounted
    const gauge = (x, y, r) => {
      panel.add(mesh(new THREE.CylinderGeometry(r, r, 0.012, 28).rotateX(PI / 2).translate(x, y, 0.82), 'interior', 'gauge'));
      panel.add(mesh(new THREE.CylinderGeometry(r * 0.82, r * 0.82, 0.014, 28).rotateX(PI / 2).translate(x, y, 0.818), 'interior', 'dark'));
    };
    for (const [x, y] of [[0.42, 1.46], [0.33, 1.46], [0.24, 1.46], [0.42, 1.37], [0.33, 1.37], [0.24, 1.37]]) gauge(x, y, 0.038);
    for (const [x, y] of [[-0.3, 1.45], [-0.38, 1.45], [-0.3, 1.38], [-0.38, 1.38]]) gauge(x, y, 0.028);
    panel.add(mesh(rbox(0.2, 0.17, 0.03, 0.006, -0.03, 1.4, 0.82), 'interior', 'dark'));
    for (const y of [1.45, 1.4, 1.35]) panel.add(mesh(rbox(0.17, 0.03, 0.01, 0.004, -0.03, y, 0.805), 'interior', 'case'));
    // the 1964 U-yokes on their columns: push-pull for the elevator, turn for the ailerons
    for (const x of [0.33, -0.27]) {
      const col = new THREE.Group();
      col.position.set(x, 1.28, 0.82);
      col.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.3, 12).rotateX(PI / 2).translate(0, 0, -0.1), 'interior', 'steel'));
      const yoke = new THREE.Group();
      yoke.position.set(0, 0, -0.25);
      const U = [[-0.13, 0.07], [-0.13, -0.02], [-0.09, -0.07], [0, -0.08], [0.09, -0.07], [0.13, -0.02], [0.13, 0.07]].map(([a, b]) => new V3(a, b, 0));
      yoke.add(mesh(tube(U, 0.014, 30), 'interior', 'panel'));
      yoke.add(mesh(rbox(0.06, 0.05, 0.05, 0.01, 0, -0.07, 0.02), 'interior', 'panel'));
      col.add(yoke);
      panel.add(col);
      yokes.push({col, yoke, z0: col.position.z});
    }
    part('interior', root, panel, [0, 1.6, 0.25]);
    anchor('interior', panel, new V3(0.33, 1.47, 0.82), 'INSTRUMENT PANEL', 'NEW FOR 1964 · CIRCUIT BREAKERS');
    anchor('interior', panel, new V3(0.33, 1.22, 0.57), 'U-YOKE', 'PUSH-PULL ELEVATOR · TURN AILERONS');
    const bench = group(mesh(rbox(0.92, 0.1, 0.42, 0.03, 0, 0.86, -0.98), 'interior', 'vinyl'), mesh(rbox(0.92, 0.5, 0.09, 0.03, 0, 1.13, -1.22).rotateX(0), 'interior', 'vinyl'));
    part('interior', root, bench, [1.9, 0.08, 0.6], 0.3);
  }

  // ============================================================ the tail: fin, rudder, dorsal fin
  const rudderPivot = new THREE.Group();
  {
    const fin = new THREE.Group();
    const ys = range(FIN.y0, FIN.y1, 8).concat(range(FIN.y1, FIN.ytip, 4).slice(1));
    fin.add(mesh(surface(ys.map(finSt), 0, FIN.hinge, NACA0009, finPlace, 20), 'vtail', 'skin'));
    // the dorsal fin running forward along the tail cone
    const sh = new THREE.Shape([new THREE.Vector2(-2.95, 1.54), new THREE.Vector2(-4.3, 1.54), new THREE.Vector2(-4.3, 1.9)].map((v) => new THREE.Vector2(-v.x, v.y)));
    const dg = new THREE.ExtrudeGeometry(sh, {depth: 0.05, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2});
    dg.translate(0, 0, -0.025);
    dg.rotateY(PI / 2);
    fin.add(mesh(dg, 'vtail', 'skin'));
    // the rudder on its hinge line
    const yr = range(FIN.y0 + 0.04, FIN.y1, 8).concat([FIN.y1 + 0.03]);
    const h0 = finPlace(FIN.hinge, 0, finSt(yr[0]));
    const h1 = finPlace(FIN.hinge, 0, finSt(yr[yr.length - 1]));
    rudderPivot.position.copy(h0);
    rudderPivot.userData.axis = h1.clone().sub(h0).normalize();
    const rg = surface(yr.map(finSt), FIN.hinge + 0.006, 1, NACA0009, finPlace, 14);
    rg.translate(-h0.x, -h0.y, -h0.z);
    rudderPivot.add(mesh(rg, 'vtail', 'skin'));
    // a stripe across the rudder
    const sg = surface([2.3, 2.42].map(finSt), FIN.hinge + 0.006, 1, (u) => NACA0009(u).map((v) => v * 1.06), finPlace, 14);
    sg.translate(-h0.x, -h0.y, -h0.z);
    rudderPivot.add(mesh(sg, 'vtail', 'trim'));
    const rWrap = new THREE.Group();
    rWrap.position.copy(h0);
    rudderPivot.position.set(0, 0, 0);
    rWrap.add(rudderPivot);
    part('vtail', root, fin, [0, 1.0, -0.9]);
    part('vtail', fin, rWrap, [0, 0.05, -0.45], 0.45);
    anchor('vtail', fin, new V3(0, 2.3, -4.75), 'VERTICAL FIN', 'SWEPT · SINCE THE 1960 172A');
    anchor('vtail', rWrap, new V3(0, 2.0, -5.45), 'RUDDER', '±16° · CABLES TO THE PEDALS');
  }

  // ============================================================ the shop stands (rise before the gear comes off)
  const stands = [];
  {
    for (const z of [0.25, -2.6]) {
      const yb = fuseAt(z).bot;
      const g = new THREE.Group();
      g.add(mesh(rbox(0.7, 0.05, 0.16, 0.015, 0, yb - 0.03, z), 'stands', 'stand'));
      for (const sx of [1, -1])
        for (const sz of [1, -1]) g.add(mesh(rod(new V3(sx * 0.42, 0, z + sz * 0.22), new V3(sx * 0.3, yb - 0.05, z), 0.022, 10), 'stands', 'stand'));
      root.add(g);
      g.traverse((o) => (o.userData.gid = 'stands'));
      stands.push(g);
    }
  }

  // ============================================================ the nose gear
  {
    const ng = new THREE.Group();
    const z = 1.3;
    ng.add(mesh(rod(new V3(0, 0.86, 1.2), new V3(0, 0.5, z), 0.045, 18), 'gear', 'skin'));
    ng.add(mesh(rod(new V3(0, 0.52, z - 0.005), new V3(0, 0.33, z), 0.03, 18), 'gear', 'steel'));
    ng.add(mesh(rbox(0.16, 0.04, 0.08, 0.01, 0, 0.33, z), 'gear', 'skin'));
    for (const sx of [1, -1]) ng.add(mesh(rbox(0.02, 0.18, 0.06, 0.008, sx * 0.07, 0.24, z), 'gear', 'skin'));
    ng.add(mesh(new THREE.TorusGeometry(0.11, 0.062, 14, 36).rotateY(PI / 2).translate(0, 0.172, z), 'gear', 'rubber'));
    ng.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 24).rotateZ(PI / 2).translate(0, 0.172, z), 'gear', 'alu'));
    // the shimmy damper beside the strut
    ng.add(mesh(rod(new V3(0.07, 0.62, 1.24), new V3(0.06, 0.5, 1.36), 0.016, 10), 'gear', 'steel'));
    part('gear', root, ng, [0, 0, 1.0]);
    anchor('gear', ng, new V3(0, 0.55, z), 'NOSE GEAR', 'AIR-OIL OLEO · STEERABLE');
  }

  // ============================================================ the bilateral parts, built for the left side
  const sides = [];
  for (const s of [1, -1]) {
    const side = new THREE.Group();
    side.scale.x = s;
    root.add(side);
    const L = s > 0;
    const S = {};

    // --- the door, its window and its stripe, swinging out
    {
      const d = new THREE.Group();
      d.add(mesh(patch(DOOR.z0 + 0.012, DOOR.z1 - 0.012, DOOR.a0 - 0.012 * PI, DOOR.a1 + 0.004 * PI, DOOR.a0 - 0.012 * PI, DOOR.a1 + 0.004 * PI, 0.004, 14, 18), 'doors', 'skin', THREE.DoubleSide));
      d.add(mesh(patch(DOOR_WIN.z0, DOOR_WIN.z1, DOOR_WIN.a0, DOOR_WIN.a1, DOOR_WIN.a0, DOOR_WIN.a1 - 0.02 * PI, 0.009, 10, 8), 'doors', 'glass', THREE.DoubleSide));
      d.add(mesh(patch(DOOR.z0 - 0.003, DOOR.z1 + 0.003, STRIPE[0], STRIPE[1], STRIPE[0], STRIPE[1], 0.009, 8, 2), 'doors', 'trim', THREE.DoubleSide));
      d.add(mesh(rbox(0.02, 0.025, 0.12, 0.008, 0.56, 1.22, -0.08), 'doors', 'steel'));
      part('doors', side, d, [0.85, 0, 0]);
      if (L) anchor('doors', d, new V3(0.57, 1.3, 0.35), 'CABIN DOOR', 'PIANO HINGE ON THE FORWARD EDGE');
    }

    // --- the front seat
    {
      const seat = group(mesh(rbox(0.44, 0.1, 0.46, 0.03, 0.27, 0.86, -0.02), 'interior', 'vinyl'), mesh(rbox(0.44, 0.56, 0.09, 0.03, 0, 0, 0).rotateX(-0.2).translate(0.27, 1.17, -0.27), 'interior', 'vinyl'));
      part('interior', side, seat, [1.5, 0.05, 0], 0.15);
      if (L) anchor('interior', seat, new V3(0.27, 1.25, -0.28), 'FRONT SEATS', 'FORE-AFT ADJUSTABLE');
    }

    // --- the wing strut
    {
      const a = new V3(0.5, 0.8, 0.12);
      const st = wingSt(2.95);
      const b = wingPlace(0.25, NACA2412(0.25)[1], st).add(new V3(0, -0.01, 0));
      const d = b.clone().sub(a);
      const g = new THREE.CylinderGeometry(1, 1, d.length(), 20);
      g.scale(0.016, 1, 0.042);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.clone().normalize()));
      g.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
      const strut = group(mesh(g, 'struts', 'skin'), mesh(rbox(0.05, 0.04, 0.08, 0.01, b.x, b.y + 0.005, b.z), 'struts', 'steel'), mesh(rbox(0.05, 0.05, 0.08, 0.01, a.x, a.y, a.z), 'struts', 'steel'));
      part('struts', side, strut, [0.9, -0.35, 0]);
      if (L) anchor('struts', strut, a.clone().lerp(b, 0.55), 'WING STRUT', 'CARRIES THE LIFT TO THE CABIN FLOOR');
    }

    // --- the wing with its flap, aileron and tank
    const wing = new THREE.Group();
    {
      const W = WING;
      wing.add(mesh(surface(wingStations(W.x0, W.flap[0], 1), 0, 1, NACA2412, wingPlace, 22), 'wings', 'skin'));
      wing.add(mesh(surface(wingStations(W.flap[0], W.flap[1], 6), 0, W.hingeF, NACA2412, wingPlace, 22), 'wings', 'skin'));
      wing.add(mesh(surface(wingStations(W.flap[1], W.ail[0], 1), 0, 1, NACA2412, wingPlace, 22), 'wings', 'skin'));
      wing.add(mesh(surface(wingStations(W.ail[0], W.ail[1], 8), 0, W.hingeA, NACA2412, wingPlace, 22), 'wings', 'skin'));
      const tip = wingStations(W.ail[1], W.xt, 2).concat(wingStations(W.xt, W.xtip, 5).slice(1));
      wing.add(mesh(surface(tip, 0, 1, NACA2412, wingPlace, 22), 'wings', 'skin'));
      // the painted tip
      wing.add(mesh(surface(wingStations(W.xt - 0.12, W.xtip, 4), 0, 1, (u) => NACA2412(u).map((v) => v * 1.02), wingPlace, 22), 'wings', 'trim'));
      // a control surface on a hinge line: a pivot at the hinge's inboard end, axis along the hinge
      const surf = (x0, x1, hu, hv, n) => {
        const h0 = wingPlace(hu, hv, wingSt(x0));
        const h1 = wingPlace(hu, hv, wingSt(x1));
        const pivot = new THREE.Group();
        pivot.userData.axis = h1.clone().sub(h0).normalize();
        const geo = surface(wingStations(x0, x1, n), hu + 0.008, 1, NACA2412, wingPlace, 12);
        geo.translate(-h0.x, -h0.y, -h0.z);
        pivot.add(mesh(geo, 'wings', 'skin'));
        const wrap = new THREE.Group();
        wrap.position.copy(h0);
        wrap.add(pivot);
        return {wrap, pivot, h0};
      };
      // the flap hinges below the wing, so it swings down and aft (Para-Lift)
      const flap = surf(W.flap[0] + 0.01, W.flap[1] - 0.01, W.hingeF, -0.07, 6);
      const ail = surf(W.ail[0] + 0.01, W.ail[1] - 0.01, W.hingeA, 0.0, 8);
      part('wings', wing, flap.wrap, [0, -0.25, -0.6], 0.5);
      part('wings', wing, ail.wrap, [0, -0.2, -0.6], 0.5);
      S.flap = flap.pivot;
      S.ail = ail.pivot;
      // the fuel tank between the spars, inboard
      const ty = wingSt(1.55).y + 0.035;
      const tank = group(mesh(rbox(1.7, 0.12, 0.55, 0.04, 1.55, ty, -0.14), 'tanks', 'alu'), mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 16).translate(1.75, ty + 0.08, 0.05), 'tanks', 'case'));
      part('tanks', wing, tank, [0, 0.8, 0]);
      part('wings', side, wing, [2.4, 0.6, 0]);
      if (L) {
        anchor('wings', wing, wingPlace(0.3, 0.09, wingSt(3.9)), 'WING', 'NACA 2412 · 1.5° TO -1.5° TWIST');
        anchor('wings', flap.wrap, wingPlace(0.88, 0.0, wingSt(1.6)), 'FLAP', 'PARA-LIFT · MANUAL TO 40°', flap.h0);
        anchor('wings', ail.wrap, wingPlace(0.88, 0.0, wingSt(4.0)), 'AILERON', 'FRISE · 20° UP / 15° DOWN', ail.h0);
        anchor('tanks', tank, new V3(1.4, ty + 0.06, -0.14), 'FUEL TANK', '21 US GAL · GRAVITY FEED');
      }
    }

    // --- the stabilizer half and its elevator
    {
      const stab = new THREE.Group();
      const xs = range(STAB.x0, STAB.xt, 6).concat(range(STAB.xt, STAB.xtip, 4).slice(1));
      stab.add(mesh(surface(xs.map(stabSt), 0, STAB.hinge, NACA0010, stabPlace, 18), 'htail', 'skin'));
      const xe = range(0.1, STAB.xt, 6).concat([STAB.xt + 0.06]);
      const h0 = stabPlace(STAB.hinge, 0, stabSt(xe[0]));
      const h1 = stabPlace(STAB.hinge, 0, stabSt(xe[xe.length - 1]));
      const pivot = new THREE.Group();
      pivot.userData.axis = h1.clone().sub(h0).normalize();
      const eg = surface(xe.map(stabSt), STAB.hinge + 0.006, 1, NACA0010, stabPlace, 12);
      eg.translate(-h0.x, -h0.y, -h0.z);
      pivot.add(mesh(eg, 'htail', 'skin'));
      const wrap = new THREE.Group();
      wrap.position.copy(h0);
      wrap.add(pivot);
      part('htail', stab, wrap, [0, 0, -0.45], 0.45);
      part('htail', side, stab, [0.55, 0, -1.3]);
      S.elev = pivot;
      if (L) {
        anchor('htail', stab, stabPlace(0.25, 0.04, stabSt(1.1)), 'STABILIZER', 'FIXED · NACA 0010');
        anchor('htail', wrap, stabPlace(0.8, 0.0, stabSt(1.0)), 'ELEVATOR', '28° UP / 23° DOWN · TRIM TAB', h0);
      }
    }

    // --- the main gear: a flat spring-steel leg and its wheel
    {
      const R = new V3(0.2, 0.66, -0.4);
      const A = new V3(1.04, 0.2, -0.42);
      const dir = A.clone().sub(R).normalize();
      const w = new V3(0, 0, 1);
      const t = new V3().crossVectors(dir, w).normalize();
      const rings = range(0, 1, 8).map((k) => {
        const P = R.clone().lerp(A, k).addScaledVector(t, Math.sin(PI * k) * 0.02);
        const hw = lerp(0.04, 0.03, k);
        const ht = lerp(0.016, 0.012, k);
        return [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([a, b]) => P.clone().addScaledVector(w, a * hw).addScaledVector(t, b * ht));
      });
      const gear = group(mesh(loft(rings, {crease: 40}), 'gear', 'skin'));
      const C = new V3(1.12, 0.195, -0.42);
      gear.add(mesh(new THREE.TorusGeometry(0.125, 0.07, 16, 40).rotateY(PI / 2).translate(C.x, C.y, C.z), 'gear', 'rubber'));
      gear.add(mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.12, 28).rotateZ(PI / 2).translate(C.x, C.y, C.z), 'gear', 'alu'));
      gear.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 28).rotateZ(PI / 2).translate(C.x - 0.075, C.y, C.z), 'gear', 'steel'));
      gear.add(mesh(rbox(0.04, 0.07, 0.06, 0.01, C.x - 0.085, C.y + 0.08, C.z + 0.04), 'gear', 'dark'));
      part('gear', side, gear, [1.0, 0, 0]);
      if (L) anchor('gear', gear, R.clone().lerp(A, 0.6), 'MAIN GEAR LEG', 'FLAT SPRING STEEL · 6.00-6 TYRE');
    }
    sides.push({s, side, ...S});
  }

  // ------------------------------------------------------------ posing
  const tmpQ = new THREE.Quaternion();
  const hingeTo = (pivot, deg) => pivot.quaternion.setFromAxisAngle(pivot.userData.axis, deg * D2R);
  const order = GROUPS.map((g) => g.id);
  /**
   * st: {raw: [NG] linear progress per assembly (0 on, 1 off), stands 0..1, prop (radians), rpm, ail, elev, rud
   * (-1..1), flap (degrees), xray 0..1, hi: {gid: 0..1} accent highlight}
   */
  const update = (st) => {
    order.forEach((id, i) => {
      const raw = st.raw[i] ?? 0;
      for (const p of G[id].parts) {
        const k = smoother((raw - p.delay) / (1 - p.delay));
        p.obj.position.copy(p.home).addScaledVector(p.dir, k);
      }
    });
    for (const [i, g] of stands.entries()) {
      const k = Math.max(0.001, st.stands ?? 0);
      g.scale.y = k;
      g.visible = k > 0.002;
      g.position.y = 0;
      void i;
    }
    // the engine shakes a little at its firing frequency while it runs
    const rpm = st.rpm ?? 0;
    const shake = Math.min(1, rpm / 600) * 0.0012;
    const ph = (st.prop ?? 0) * 3;
    engine.position.x += shake * Math.sin(ph);
    engine.position.y += shake * Math.cos(ph * 1.3);
    prop.position.x += shake * Math.sin(ph);
    propSpin.rotation.z = st.prop ?? 0;
    // above ~400 rpm the blades blur into the disc
    const bl = smoother((rpm - 350) / 600);
    blur.material.opacity = bl * 0.75;
    blur.visible = bl > 0.01;
    for (const m of Object.values(G.prop.mats)) m.opacity = 1 - 0.82 * bl;
    // controls: ailerons up-positive about their hinge, the flap down, the elevator up on a pull, the rudder
    const ail = st.ail ?? 0;
    const elev = st.elev ?? 0;
    for (const sd of sides) {
      // a positive yoke rolls right: the right aileron goes up 20°, the left down 15°
      const up = sd.s > 0 ? -ail * (ail > 0 ? SPEC.ail[1] : SPEC.ail[0]) : ail * (ail > 0 ? SPEC.ail[0] : SPEC.ail[1]);
      hingeTo(sd.ail, up);
      hingeTo(sd.flap, -(st.flap ?? 0));
      hingeTo(sd.elev, elev > 0 ? elev * SPEC.elev[0] : elev * SPEC.elev[1]);
    }
    hingeTo(rudderPivot, (st.rud ?? 0) * SPEC.rud);
    for (const y of yokes) {
      y.col.position.z = y.z0 - elev * 0.07;
      y.yoke.rotation.z = -ail * 0.7;
    }
    fuse.userData.johnson.rotation.x = -(8 + (st.flap ?? 0) * 1.4) * D2R;
    // x-ray: the skin fades, the structure inside stays solid
    const xr = st.xray ?? 0;
    for (const m of xrayMats) {
      m.opacity = 1 - (m.userData.kind === 'glass' ? 0.7 : 0.84) * xr;
      m.depthWrite = xr < 0.35;
    }
    // the accent on the assembly that is moving or hovered
    for (const id of [...order, 'fuse']) {
      const h = st.hi?.[id] ?? 0;
      if (h === G[id].hi) continue;
      G[id].hi = h;
      for (const m of Object.values(G[id].mats)) m.emissiveIntensity = m.userData.kind === 'glass' ? h * 0.3 : h * 0.42;
    }
    void tmpQ;
  };
  update({raw: new Array(NG).fill(0)});
  root.updateMatrixWorld(true);
  const wp = new V3();
  /** the label anchors in world space */
  const anchorsAt = () => anchors.map((a) => ({...a, at: a.obj.getWorldPosition(wp.clone())}));
  return {root, update, anchors, anchorsAt, groups: G, prop, engine};
}
