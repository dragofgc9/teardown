// Small geometry and material helpers for the 330e. Car frame: +z forward, +y up, +x the car's left; metres.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

export const V3 = THREE.Vector3;
export const D2R = Math.PI / 180;
export const TAU = Math.PI * 2;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;

export const C = {
  accent: '#1c69d4', // BMW blue: the part that is working
  hv: '#ff7a1a', // high-voltage orange
  ink: '#16181b',
  mute: '#8b8f95',
  steel: '#8e969e',
  dark: '#2b2f34',
  alu: '#c3c8ce',
  copper: '#b8733a',
  rubber: '#1b1d20',
  fuel: '#e0a21a',
};

// ---------------------------------------------------------------- materials
export const std = (color, metalness = 0.7, roughness = 0.42, extra = {}) => new THREE.MeshStandardMaterial({color, metalness, roughness, ...extra});
export const glassy = (color = '#a9b6c4', opacity = 0.3) =>
  new THREE.MeshPhysicalMaterial({color, metalness: 0.1, roughness: 0.18, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide});
export const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({color, transparent: opacity < 1, opacity});

// ---------------------------------------------------------------- geometry
/** a cylinder along an axis ('x' | 'y' | 'z') */
export const cyl = (rTop, rBot, len, axis = 'y', seg = 36, open = false) => {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, seg, 1, open);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  else if (axis === 'x') g.rotateZ(Math.PI / 2);
  return g;
};
export const rbox = (w, h, d, r = 0.008, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
export const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};
/** drafting-style outline on a mesh */
export const edged = (m, color = '#2a3038', opacity = 0.42, angle = 32) => {
  const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, angle), new THREE.LineBasicMaterial({color, transparent: true, opacity}));
  l.raycast = () => {};
  m.add(l);
  return m;
};
export const tube = (pts, r, mat, seg = 64, radial = 10, closed = false) => {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => new V3(...p)), closed, 'centripetal');
  const m = new THREE.Mesh(new THREE.TubeGeometry(c, seg, r, radial, closed), mat);
  m.castShadow = true;
  m.curve = c;
  return m;
};
/** a straight rod between two points */
export const rod = (a, b, r, mat, seg = 12) => {
  const A = new V3(...a);
  const B = new V3(...b);
  const d = B.clone().sub(A);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), mat);
  m.position.copy(A).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.normalize());
  m.castShadow = true;
  return m;
};
/** an involute-ish gear outline extruded along z (centred) */
export function gearGeo(teeth, rp, width, holeR = 0, add = 0.07, internal = false) {
  const ra = rp * (1 + add);
  const rr = rp * (1 - add * 1.2);
  const sh = new THREE.Shape();
  const ring = (path, flip) => {
    for (let i = 0; i < teeth; i++) {
      const a0 = (i / teeth) * TAU;
      const da = TAU / teeth;
      const pts = flip
        ? [[ra, a0], [ra, a0 + da * 0.3], [rr, a0 + da * 0.45], [rr, a0 + da * 0.8]]
        : [[rr, a0], [rr, a0 + da * 0.18], [ra, a0 + da * 0.34], [ra, a0 + da * 0.62], [rr, a0 + da * 0.78]];
      pts.forEach(([r, a], k) => {
        const x = r * Math.cos(a);
        const y = r * Math.sin(a);
        if (i === 0 && k === 0) path.moveTo(x, y);
        else path.lineTo(x, y);
      });
    }
    path.closePath();
  };
  if (internal) {
    // a ring gear: plain outside, teeth inside
    sh.absarc(0, 0, rp * 1.16, 0, TAU, false);
    const h = new THREE.Path();
    ring(h, true);
    sh.holes.push(h);
  } else {
    ring(sh, false);
    if (holeR) {
      const h = new THREE.Path();
      h.absarc(0, 0, holeR, 0, TAU, true);
      sh.holes.push(h);
    }
  }
  const g = new THREE.ExtrudeGeometry(sh, {depth: width, bevelEnabled: false, curveSegments: 20});
  g.translate(0, 0, -width / 2);
  return g;
}
/** a lathe profile of [radius, along] pairs, turned about 'axis' */
export const lathe = (pts, axis = 'z', seg = 48) => {
  const g = new THREE.LatheGeometry(pts.map(([r, a]) => new THREE.Vector2(r, a)), seg);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  else if (axis === 'x') g.rotateZ(-Math.PI / 2);
  return g;
};
