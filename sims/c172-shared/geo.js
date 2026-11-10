// Geometry helpers for the Cessna 172S: lofted solids (wing, tail, blades, struts), the fuselage skin as a gridded
// superellipse loft that can be masked into panels (doors, glass, paint stripes), and a small accumulator that
// merges everything a part is made of into one mesh per material.
import * as THREE from 'three';
import {mergeGeometries, toCreasedNormals} from 'three/addons/utils/BufferGeometryUtils.js';

export const V3 = THREE.Vector3;

/** monotone cubic interpolation (Fritsch-Carlson): smooth, never overshoots between stations */
export function pchip(xs, ys) {
  const n = xs.length;
  const d = [];
  const m = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// ------------------------------------------------------------------ airfoils
/** NACA 4-digit camber line height and slope at x (fraction of chord) */
export function camber(m, p, x) {
  if (!m) return [0, 0];
  return x < p ? [(m / (p * p)) * (2 * p * x - x * x), ((2 * m) / (p * p)) * (p - x)] : [(m / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * x - x * x), ((2 * m) / ((1 - p) * (1 - p))) * (p - x)];
}
/** the closed outline of the chord stretch x0..x1 as [x, y] in chord fractions: upper surface forward, lower back */
export function foilPts({m = 0.02, p = 0.4, t = 0.12, x0 = 0, x1 = 1, n = 20} = {}) {
  const up = [];
  const lo = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * ((1 - Math.cos((Math.PI * i) / n)) / 2);
    const yt = 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    const [yc, dy] = camber(m, p, x);
    const th = Math.atan(dy);
    up.push([x - yt * Math.sin(th), yc + yt * Math.cos(th)]);
    lo.push([x + yt * Math.sin(th), yc - yt * Math.cos(th)]);
  }
  return [...up, ...lo.reverse()];
}

// ------------------------------------------------------------------ solids
const finish = (pos, idx, crease) => {
  let vol = 0;
  const a = new V3();
  const b = new V3();
  const c = new V3();
  for (let i = 0; i < idx.length; i += 3) {
    a.fromArray(pos, idx[i] * 3);
    b.fromArray(pos, idx[i + 1] * 3);
    c.fromArray(pos, idx[i + 2] * 3);
    vol += a.dot(b.cross(c));
  }
  if (vol < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return toCreasedNormals(g.toNonIndexed(), crease);
};

/** a closed solid through rings of equal point count (each ring a loop), capped with a fan at both ends */
export function loftSolid(rings, crease = 0.85) {
  const R = rings.length;
  const N = rings[0].length;
  const pos = [];
  const idx = [];
  for (const r of rings) for (const p of r) pos.push(p.x, p.y, p.z);
  const cen = (r) => r.reduce((s, p) => s.add(p), new V3()).multiplyScalar(1 / r.length);
  const c0 = cen(rings[0]);
  const c1 = cen(rings[R - 1]);
  const i0 = pos.length / 3;
  pos.push(c0.x, c0.y, c0.z, c1.x, c1.y, c1.z);
  for (let r = 0; r < R - 1; r++)
    for (let j = 0; j < N; j++) {
      const a = r * N + j;
      const b = r * N + ((j + 1) % N);
      const c = (r + 1) * N + j;
      const d = (r + 1) * N + ((j + 1) % N);
      idx.push(a, b, c, b, d, c);
    }
  for (let j = 0; j < N; j++) {
    idx.push(i0, (j + 1) % N, j);
    idx.push(i0 + 1, (R - 1) * N + j, (R - 1) * N + ((j + 1) % N));
  }
  return finish(pos, idx, crease);
}

/** a tapered round or elliptical bar along a polyline: radii [a, b] per point, `flat` squashes the second axis */
export function sweep(points, radii, {flat = 1, seg = 14, up = new V3(0, 0, 1), crease = 0.9} = {}) {
  const rings = points.map((p, i) => {
    const t = (points[Math.min(points.length - 1, i + 1)].clone().sub(points[Math.max(0, i - 1)])).normalize();
    const u = up.clone().sub(t.clone().multiplyScalar(up.dot(t))).normalize();
    const v = new V3().crossVectors(t, u).normalize();
    const r = radii[i];
    const ring = [];
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      ring.push(p.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r * flat));
    }
    return ring;
  });
  return loftSolid(rings, crease);
}

// ------------------------------------------------------------------ the skin: a masked superellipse loft
/**
 * stations: [{z, yc, hw, hh, n}] (centre height, half width, half height, squareness). Samples a z0..z1 by a0..a1 grid.
 * keep(x, y, z) masks quads (doors, windows, stripes); off pushes the surface out along its normal; dz shifts it in z
 * (for a nose face). Normals come from the whole grid before the mask, so the edge of a hole shades like its neighbours.
 */
export function skin({st, z0, z1, nz, nang, a0 = 0, a1 = Math.PI * 2, keep = null, off = 0, dz = 0}) {
  const sorted = [...st].sort((a, b) => a.z - b.z);
  const zs = sorted.map((s) => s.z);
  const f = Object.fromEntries(['yc', 'hw', 'hh', 'n'].map((k) => [k, pchip(zs, sorted.map((s) => s[k]))]));
  const cols = nang + 1;
  const pos = new Float32Array((nz + 1) * cols * 3);
  const out = [];
  for (let i = 0; i <= nz; i++) {
    const z = z0 + ((z1 - z0) * i) / nz;
    const yc = f.yc(z);
    const hw = f.hw(z);
    const hh = f.hh(z);
    const n = f.n(z);
    for (let j = 0; j <= nang; j++) {
      const a = a0 + ((a1 - a0) * j) / nang;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const x = hw * Math.sign(c) * Math.abs(c) ** (2 / n);
      const y = hh * Math.sign(s) * Math.abs(s) ** (2 / n);
      let gx = (Math.sign(x) * Math.abs(x / hw) ** (n - 1)) / hw;
      let gy = (Math.sign(y) * Math.abs(y / hh) ** (n - 1)) / hh;
      const gl = Math.hypot(gx, gy) || 1;
      gx /= gl;
      gy /= gl;
      const k = (i * cols + j) * 3;
      pos[k] = x + gx * off;
      pos[k + 1] = yc + y + gy * off;
      pos[k + 2] = z + dz;
      out.push(gx, gy);
    }
  }
  const full = [];
  for (let i = 0; i < nz; i++)
    for (let j = 0; j < nang; j++) {
      const v = i * cols + j;
      full.push(v, v + 1, v + cols, v + 1, v + cols + 1, v + cols);
    }
  // orientation: the first triangle against its outward direction
  const A = new V3().fromArray(pos, full[0] * 3);
  const B = new V3().fromArray(pos, full[1] * 3);
  const C = new V3().fromArray(pos, full[2] * 3);
  const nrm = B.sub(A).cross(C.sub(A));
  const flip = nrm.x * out[full[0] * 2] + nrm.y * out[full[0] * 2 + 1] < 0;
  if (flip) for (let i = 0; i < full.length; i += 3) [full[i + 1], full[i + 2]] = [full[i + 2], full[i + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(full);
  g.computeVertexNormals();
  if (!keep) return g;
  const kept = [];
  for (let t = 0; t < full.length; t += 6) {
    // the quad's centre decides
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const k of [full[t], full[t + 1], full[t + 2], full[t + 4]]) {
      cx += pos[k * 3];
      cy += pos[k * 3 + 1];
      cz += pos[k * 3 + 2];
    }
    if (keep(cx / 4, cy / 4, cz / 4)) for (let q = 0; q < 6; q++) kept.push(full[t + q]);
  }
  g.setIndex(kept);
  return g;
}

// ------------------------------------------------------------------ the accumulator
const bare = (g) => {
  const x = g.index ? g.toNonIndexed() : g;
  x.deleteAttribute('uv');
  if (!x.attributes.normal) x.computeVertexNormals();
  return x;
};

/** a group whose geometry is gathered per material key and merged on build() */
export class Node {
  constructor(mk, part) {
    this.group = new THREE.Group();
    this.mk = mk;
    this.part = part;
    this.b = {};
    this.meshes = [];
  }
  add(geo, key) {
    (this.b[key] ??= []).push(bare(geo));
    return geo;
  }
  build() {
    for (const [key, list] of Object.entries(this.b)) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), this.mk(this.part, key));
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.part = this.part;
      this.group.add(mesh);
      this.meshes.push(mesh);
    }
    this.b = {};
    return this;
  }
}

// ------------------------------------------------------------------ small placed primitives (world coordinates)
const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
/** rotate (Euler XYZ) then translate in place */
export const at = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  M4.compose(new V3(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), new V3(1, 1, 1));
  return g.applyMatrix4(M4);
};
/** a cylinder between two points */
export const rod = (a, b, r, r2 = r, seg = 10) => {
  const d = new V3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r2, r, d.length(), seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.clone().normalize()));
  const m = a.clone().add(b).multiplyScalar(0.5);
  return g.translate(m.x, m.y, m.z);
};
