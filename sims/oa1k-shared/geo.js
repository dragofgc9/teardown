// Geometry helpers for the OA-1K: lofts between loops of points, superellipse fuselage rings, NACA sections, tubes.
// Frame used everywhere: x = metres aft of the spinner tip, y = metres above the ground, z = metres to port.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Skin between successive loops of [x,y,z] points. Every loop has the same number of points.
export function loft(loops, {closed = true, capStart = false, capEnd = false} = {}) {
  const n = loops[0].length;
  const pos = [];
  const idx = [];
  for (const L of loops) for (const p of L) pos.push(p[0], p[1], p[2]);
  const m = closed ? n : n - 1;
  for (let i = 0; i < loops.length - 1; i++) {
    for (let j = 0; j < m; j++) {
      const a = i * n + j, b = i * n + ((j + 1) % n), c = (i + 1) * n + j, d = (i + 1) * n + ((j + 1) % n);
      idx.push(a, c, b, b, c, d);
    }
  }
  const cap = (L) => {
    const base = pos.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (const p of L) { cx += p[0]; cy += p[1]; cz += p[2]; }
    pos.push(cx / n, cy / n, cz / n);
    for (const p of L) pos.push(p[0], p[1], p[2]);
    for (let j = 0; j < n; j++) idx.push(base, base + 1 + j, base + 1 + ((j + 1) % n));
  };
  if (capStart) cap(loops[0]);
  if (capEnd) cap(loops[loops.length - 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Catmull-Rom through [x, v] pairs, clamped at the ends.
export function curve1(pts) {
  return (x) => {
    const n = pts.length;
    if (x <= pts[0][0]) return pts[0][1];
    if (x >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 0;
    while (x > pts[i + 1][0]) i++;
    const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
    const p0 = pts[Math.max(0, i - 1)][1], p1 = pts[i][1], p2 = pts[i + 1][1], p3 = pts[Math.min(n - 1, i + 2)][1];
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  };
}

// Fuselage stations {x, top, bot, hw, n} -> prof(x) = the interpolated station.
export function profile(secs) {
  const f = {};
  for (const k of ['top', 'bot', 'hw', 'n']) f[k] = curve1(secs.map((s) => [s.x, s[k]]));
  return (x) => ({x, top: f.top(x), bot: f.bot(x), hw: f.hw(x), n: f.n(x)});
}

// Points on a superellipse station between angles a0..a1 (0 = port side, 90 deg = top, 180 = starboard, 270 = belly).
export function ring(p, a0, a1, na, {scale = 1, grow = 0} = {}) {
  const yc = (p.top + p.bot) / 2;
  const ry = ((p.top - p.bot) / 2) * scale + grow;
  const hw = p.hw * scale + grow;
  const e = 2 / p.n;
  const out = [];
  for (let j = 0; j <= na; j++) {
    const a = lerp(a0, a1, j / na);
    out.push([p.x, yc + ry * spow(Math.sin(a), e), hw * spow(Math.cos(a), e)]);
  }
  return out;
}

export function bodyLoft(prof, x0, x1, nx, a0, a1, na, opt = {}) {
  const loops = [];
  for (let i = 0; i <= nx; i++) {
    const p = prof(lerp(x0, x1, i / nx));
    const A0 = typeof a0 === 'function' ? a0(p) : a0;
    const A1 = typeof a1 === 'function' ? a1(p) : a1;
    loops.push(ring(p, A0, A1, na, opt));
  }
  const full = typeof a0 === 'number' && typeof a1 === 'number' && Math.abs(a1 - a0 - Math.PI * 2) < 1e-6;
  return loft(loops, {closed: full, capStart: opt.capStart, capEnd: opt.capEnd});
}

// NACA 4-digit: camber and half thickness at chord fraction c.
export function naca(m, p, t) {
  return (c) => {
    const yt = 5 * t * (0.2969 * Math.sqrt(c) - 0.126 * c - 0.3516 * c * c + 0.2843 * c ** 3 - 0.1015 * c ** 4);
    const yc = m === 0 ? 0 : c < p ? (m / (p * p)) * (2 * p * c - c * c) : (m / ((1 - p) ** 2)) * (1 - 2 * p + 2 * p * c - c * c);
    return {yc, yt};
  };
}

// One closed section loop. o = leading edge, cv = full chord vector, tv = thickness direction with the chord's length.
export function foilLoop({o, cv, tv, foil, c0 = 0, c1 = 1, n = 16}) {
  const pts = [];
  const at = (c, s) => {
    const {yc, yt} = foil(c);
    const h = yc + s * yt;
    return [o[0] + cv[0] * c + tv[0] * h, o[1] + cv[1] * c + tv[1] * h, o[2] + cv[2] * c + tv[2] * h];
  };
  for (let i = 0; i <= n; i++) pts.push(at(lerp(c1, c0, 0.5 - 0.5 * Math.cos((Math.PI * i) / n)), 1));
  for (let i = 0; i <= n; i++) pts.push(at(lerp(c0, c1, 0.5 - 0.5 * Math.cos((Math.PI * i) / n)), -1));
  return pts;
}

const Y = new THREE.Vector3(0, 1, 0);
export function tube(a, b, r, seg = 8, r2 = r) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const g = new THREE.CylinderGeometry(r2, r, A.distanceTo(B), seg, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, B.clone().sub(A).normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}
export const tubes = (pairs, r, seg = 8) => merge(pairs.map(([a, b]) => tube(a, b, r, seg)));
// A polyline of tubes with ball joints.
export function pipe(pts, r, seg = 8) {
  const gs = [];
  for (let i = 0; i < pts.length - 1; i++) gs.push(tube(pts[i], pts[i + 1], r, seg));
  for (let i = 1; i < pts.length - 1; i++) gs.push(ball(pts[i], r));
  return merge(gs);
}
export function ball(c, r, sx = 1, sy = 1, sz = 1, seg = 14) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(8, seg - 4));
  g.scale(sx, sy, sz);
  g.translate(c[0], c[1], c[2]);
  return g;
}
export function box(c, s, rot) {
  const g = new THREE.BoxGeometry(s[0], s[1], s[2]);
  if (rot) g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0] || 0, rot[1] || 0, rot[2] || 0)));
  g.translate(c[0], c[1], c[2]);
  return g;
}
// Solid of revolution about the x axis. pts = [[u, r], ...] with u along x.
export function latheX(pts, seg = 20) {
  const g = new THREE.LatheGeometry(pts.map(([u, r]) => new THREE.Vector2(Math.max(r, 1e-4), u)), seg);
  g.rotateZ(-Math.PI / 2);
  return g;
}
// Flat convex polygon as a triangle fan.
export function poly(pts) {
  const pos = [];
  for (let i = 1; i < pts.length - 1; i++) pos.push(...pts[0], ...pts[i], ...pts[i + 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
export function merge(gs) {
  const list = gs.filter(Boolean).map((g) => {
    const h = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(h.attributes)) if (k !== 'position' && k !== 'normal') h.deleteAttribute(k);
    if (!h.attributes.normal) h.computeVertexNormals();
    return h;
  });
  return mergeGeometries(list);
}
// Place a locally built piece: rotate about z (nose up positive, in degrees) then move.
export function place(g, pos, rzDeg = 0, ryDeg = 0, rxDeg = 0) {
  if (rxDeg) g.rotateX((rxDeg * Math.PI) / 180);
  if (ryDeg) g.rotateY((ryDeg * Math.PI) / 180);
  if (rzDeg) g.rotateZ((rzDeg * Math.PI) / 180);
  g.translate(pos[0], pos[1], pos[2]);
  return g;
}
export const mirrorZ = (g) => {
  const h = g.clone();
  h.scale(1, 1, -1);
  // Mirroring reverses the winding: swap two corners of every triangle so front faces stay front faces.
  if (h.index) {
    const ix = h.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  } else {
    for (const k of Object.keys(h.attributes)) {
      const at = h.attributes[k], n = at.itemSize, arr = at.array;
      for (let i = 0; i < arr.length; i += 3 * n) for (let c = 0; c < n; c++) { const t = arr[i + n + c]; arr[i + n + c] = arr[i + 2 * n + c]; arr[i + 2 * n + c] = t; }
    }
  }
  return h;
};
