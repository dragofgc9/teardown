// The Cessna 172S built from code, in metres. Every removable piece is a `part` with a home pose, a direction and a
// distance it travels when pulled off, and the parts it must wait for (the prop before the cowl, the cowl before the
// engine). One state object poses the whole aircraft: how far each part is out, the control inputs, the engine angle.
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {at, foilPts, loftSolid, Node, rod, skin, sweep, V3} from './geo.js';
import {chordAt, ENGINE, PROP, TAIL, TRAVEL, WHEELS, WING} from './spec.js';

const box = (w, h, d, r = 0.008) => new RoundedBoxGeometry(w, h, d, 2, r);
const cyl = (r1, r2, h, seg = 24) => new THREE.CylinderGeometry(r1, r2, h, seg);
const v = (x, y, z) => new V3(x, y, z);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sm = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * (3 - 2 * u);
};

// ---------------------------------------------------------------- materials, one set per part so hover can light a part alone
const PAL = {
  paint: () => new THREE.MeshPhysicalMaterial({color: '#f3f2ee', roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.3}),
  navy: () => new THREE.MeshPhysicalMaterial({color: '#1d3b63', roughness: 0.35, clearcoat: 0.5}),
  orange: () => new THREE.MeshPhysicalMaterial({color: '#e3562a', roughness: 0.35, clearcoat: 0.5}),
  glass: () => new THREE.MeshPhysicalMaterial({color: '#223445', roughness: 0.08, metalness: 0, transparent: true, opacity: 0.55, envMapIntensity: 1.4, depthWrite: false}),
  inside: () => new THREE.MeshStandardMaterial({color: '#6f7378', roughness: 0.9, side: THREE.BackSide}),
  alu: () => new THREE.MeshStandardMaterial({color: '#c6cbd1', roughness: 0.3, metalness: 1}),
  steel: () => new THREE.MeshStandardMaterial({color: '#555a62', roughness: 0.4, metalness: 0.9}),
  black: () => new THREE.MeshStandardMaterial({color: '#17181b', roughness: 0.5, metalness: 0.2}),
  rubber: () => new THREE.MeshStandardMaterial({color: '#1c1d20', roughness: 0.85}),
  barrel: () => new THREE.MeshStandardMaterial({color: '#2c2f34', roughness: 0.5, metalness: 0.6}),
  head: () => new THREE.MeshStandardMaterial({color: '#a7acb3', roughness: 0.4, metalness: 0.85, emissive: new THREE.Color(0)}),
  case: () => new THREE.MeshStandardMaterial({color: '#8d939a', roughness: 0.45, metalness: 0.85}),
  exhaust: () => new THREE.MeshStandardMaterial({color: '#8c9096', roughness: 0.35, metalness: 0.95}),
  seat: () => new THREE.MeshStandardMaterial({color: '#6b5440', roughness: 0.92}),
  panel: () => new THREE.MeshStandardMaterial({color: '#2a2c31', roughness: 0.7}),
  trim: () => new THREE.MeshStandardMaterial({color: '#cfc8ba', roughness: 0.8}),
  dial: () => new THREE.MeshStandardMaterial({color: '#e9e6dc', roughness: 0.5}),
  red: () => new THREE.MeshStandardMaterial({color: '#c9302a', roughness: 0.5}),
  prop: () => new THREE.MeshStandardMaterial({color: '#2a2c30', roughness: 0.45, metalness: 0.6}),
  tip: () => new THREE.MeshStandardMaterial({color: '#e8c53a', roughness: 0.5}),
  spar: () => new THREE.MeshStandardMaterial({color: '#aab0b8', roughness: 0.5, metalness: 0.5}),
  tank: () => new THREE.MeshStandardMaterial({color: '#d9a35a', roughness: 0.6}),
  floor: () => new THREE.MeshStandardMaterial({color: '#54585e', roughness: 0.9}),
};
const matKey = (k) => k.replace(/\d+$/, '');
const SKINS = new Set(['paint', 'navy', 'orange', 'glass']);

// ---------------------------------------------------------------- stations
const FUS = [
  {z: 0.0, yc: 1.13, hw: 0.54, hh: 0.5, n: 2.8},
  {z: -0.45, yc: 1.27, hw: 0.56, hh: 0.63, n: 2.8},
  {z: -1.3, yc: 1.27, hw: 0.57, hh: 0.63, n: 2.8},
  {z: -2.3, yc: 1.24, hw: 0.55, hh: 0.62, n: 2.7},
  {z: -3.0, yc: 1.17, hw: 0.42, hh: 0.55, n: 2.5},
  {z: -4.2, yc: 1.1, hw: 0.3, hh: 0.42, n: 2.3},
  {z: -5.4, yc: 1.12, hw: 0.19, hh: 0.31, n: 2.2},
  {z: -6.3, yc: 1.18, hw: 0.1, hh: 0.22, n: 2.1},
];
const COWL = [
  {z: 0.0, yc: 1.13, hw: 0.54, hh: 0.5, n: 2.8},
  {z: 0.3, yc: 1.17, hw: 0.5, hh: 0.45, n: 2.7},
  {z: 0.7, yc: 1.2, hw: 0.44, hh: 0.37, n: 2.6},
  {z: 1.0, yc: 1.21, hw: 0.4, hh: 0.32, n: 2.5},
  {z: 1.15, yc: 1.22, hw: 0.38, hh: 0.3, n: 2.4},
  {z: 1.17, yc: 1.22, hw: 0.3, hh: 0.24, n: 2},
  {z: 1.19, yc: 1.22, hw: 0.16, hh: 0.16, n: 2},
];
// the cheat line: a navy band over an orange pinstripe, climbing toward the tail
const stripeY = (z) => 0.98 + Math.max(0, -z) * 0.02;
const inBand = (y, z, lo, hi) => y - stripeY(z) > lo && y - stripeY(z) < hi;
// panel regions on the cabin sides (|x| so one test serves both)
const inRect = (z, y, za, zb, ya, yb, m = 0) => z < za - m && z > zb + m && y > ya + m && y < yb - m;
const DOOR = {za: -0.4, zb: -1.3, ya: 0.76, yb: 1.86};
const DWIN = {za: -0.52, zb: -1.2, ya: 1.3, yb: 1.8};
const REAR = {za: -1.48, zb: -2.3, ya: 1.3, yb: 1.76};
const GAP = 0.012;

export const GROUPS = ['Powerplant', 'Cabin', 'Wings', 'Tail', 'Landing gear'];

export function buildAircraft() {
  const root = new THREE.Group();
  const parts = {};
  const list = [];
  const mk = (part, key) => {
    part.mats[key] ??= PAL[matKey(key)]();
    return part.mats[key];
  };

  /** o: name, group, dir, dist, needs[], skins (materials that go to glass in x-ray) */
  const part = (id, o) => {
    const p = {id, ...o, mats: {}, g: new THREE.Group(), home: new V3(), p: 0, out: 0, dir: new V3(...(o.dir || [0, 1, 0])).normalize(), needs: o.needs || [], hl: 0, fire: 0};
    p.node = new Node(mk, p);
    p.g.add(p.node.group);
    p.nodes = [p.node];
    root.add(p.g);
    parts[id] = p;
    list.push(p);
    return p;
  };
  /** a sub-node with its own pivot inside a part */
  const sub = (p, parent = p.node.group) => {
    const n = new Node(mk, p);
    parent.add(n.group);
    p.nodes.push(n);
    return n;
  };
  const done = (p) => {
    for (const n of p.nodes) n.build();
    return p;
  };

  // ============================================================ fuselage
  const fus = part('fuselage', {name: 'Fuselage', group: 'Cabin', dir: [0, 0, 0], dist: 0, fixed: true});
  {
    const st = FUS;
    const zEnd = -6.3;
    const nz = 330;
    const holes = (x, y, z) => {
      const ax = Math.abs(x);
      if (z < 0 && z > -0.55 && y > 1.5 && ax < 0.46) return true; // windshield
      if (ax > 0.3 && inRect(z, y, DOOR.za, DOOR.zb, DOOR.ya, DOOR.yb, -GAP)) return true; // door
      if (ax > 0.3 && inRect(z, y, REAR.za, REAR.zb, REAR.ya, REAR.yb)) return true; // rear side window
      if (z < -2.42 && z > -2.98 && y > 1.5 && ax < 0.3) return true; // rear window
      return false;
    };
    const body = skin({st, z0: 0, z1: zEnd, nz, nang: 144, keep: (x, y, z) => !holes(x, y, z)});
    fus.node.add(body, 'paint');
    fus.node.add(body, 'inside');
    const stripe = (lo, hi, key) =>
      fus.node.add(skin({st, z0: 0, z1: zEnd, nz, nang: 144, off: 0.003, keep: (x, y, z) => Math.abs(x) > 0.12 && inBand(y, z, lo, hi) && !holes(x, y, z) && !inRect(z, y, DOOR.za, DOOR.zb, DOOR.ya, DOOR.yb, -GAP)}), key);
    stripe(-0.04, 0.05, 'navy');
    stripe(-0.075, -0.045, 'orange');
    // glass: windshield, rear side windows, rear window
    fus.node.add(skin({st, z0: 0, z1: -3.0, nz: 150, nang: 144, off: -0.004, keep: (x, y, z) => {
      const ax = Math.abs(x);
      return (z < 0 && z > -0.55 && y > 1.5 && ax < 0.46) || (ax > 0.3 && inRect(z, y, REAR.za, REAR.zb, REAR.ya, REAR.yb)) || (z < -2.42 && z > -2.98 && y > 1.5 && ax < 0.3);
    }}), 'glass');
    // structure: the firewall, floor, bulkheads
    fus.node.add(at(box(1.06, 1.0, 0.02, 0.004), 0, 1.12, 0.0), 'steel');
    fus.node.add(at(box(1.0, 0.025, 2.75, 0.004), 0, 0.68, -1.38), 'floor');
    fus.node.add(at(box(0.9, 0.9, 0.02, 0.004), 0, 1.15, -2.72), 'panel');
    for (const z of [-3.6, -4.5, -5.3]) {
      const s = 1 - Math.abs(z + 3.6) * 0.14;
      fus.node.add(at(box(0.5 * s, 0.6 * s, 0.015, 0.004), 0, 1.1, z), 'panel');
    }
    for (const sx of [-1, 1]) {
      fus.node.add(rod(v(sx * 0.46, 0.72, -0.25), v(sx * 0.46, 0.72, -2.7), 0.03, 0.03, 8), 'steel'); // floor beams
      fus.node.add(rod(v(sx * 0.15, 1.9, -0.4), v(sx * 0.15, 1.9, -2.3), 0.02, 0.02, 8), 'steel');
    }
  }
  done(fus);

  // ============================================================ cowling
  const mkCowl = (id, name, a0, a1) => {
    const p = part(id, {name, group: 'Powerplant', dir: id === 'cowlTop' ? [0, 1, 0.3] : [0, -1, 0.3], dist: id === 'cowlTop' ? 1.7 : 0.65, needs: ['prop']});
    const common = {st: COWL, z0: 0, z1: 1.19, nz: 90, nang: 72, a0, a1};
    p.node.add(skin({...common, off: 0}), 'paint');
    p.node.add(skin({...common, off: 0}), 'inside');
    if (id === 'cowlBot') {
      const band = (lo, hi, key) => p.node.add(skin({...common, z1: 1.14, off: 0.003, keep: (x, y, z) => Math.abs(x) > 0.1 && inBand(y, 0, lo, hi)}), key);
      band(-0.04, 0.05, 'navy');
      band(-0.075, -0.045, 'orange');
    }
    // two inlets in the nose face
    p.node.add(skin({...common, z0: 1.15, dz: 0.004, keep: (x, y, z) => z > 1.168 && Math.abs(x) > 0.2 && Math.abs(y - 1.22) < 0.1}), 'black');
    return done(p);
  };
  mkCowl('cowlTop', 'Upper cowling', 0, Math.PI);
  mkCowl('cowlBot', 'Lower cowling', Math.PI, Math.PI * 2);

  // ============================================================ spinner and propeller
  const spinner = part('spinner', {name: 'Spinner', group: 'Powerplant', dir: [0, 0, 1], dist: 4.4});
  {
    const prof = [[0.001, 0], [0.165, 0], [0.162, 0.05], [0.14, 0.13], [0.105, 0.22], [0.06, 0.3], [0.025, 0.34], [0.001, 0.355]].map(([r, h]) => new THREE.Vector2(r, h));
    const g = new THREE.LatheGeometry(prof, 40);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, 0.0);
    spinner.node.add(g, 'alu');
    spinner.spin = true;
    spinner.home.set(0, PROP.axisY, PROP.hubZ + 0.04);
  }
  done(spinner);

  const prop = part('prop', {name: 'Propeller', group: 'Powerplant', dir: [0, 0, 1], dist: 3.3, needs: ['spinner']});
  {
    prop.spin = true;
    prop.home.set(0, PROP.axisY, PROP.hubZ);
    // a blade: sections along the radius, chord and twist from the hub to the tip, thin cambered foil
    const R = PROP.dia / 2;
    const sec = [[0.1, 0.075, 36], [0.2, 0.115, 31], [0.4, 0.158, 22], [0.6, 0.168, 16.5], [0.8, 0.152, 13], [0.93, 0.13, 11.5], [R, 0.1, 10]];
    const ring = (r, c, beta, t) => {
      const b = (beta * Math.PI) / 180;
      const cd = v(Math.cos(b), 0, -Math.sin(b)); // chord direction
      const nd = v(Math.sin(b), 0, Math.cos(b)); // thickness direction: toward the flight direction of the face
      return foilPts({m: 0.04, p: 0.4, t, n: 12}).map(([x, y]) => v(0, r, 0).addScaledVector(cd, (x - 0.35) * c).addScaledVector(nd, y * c));
    };
    for (const k of [0, 1]) {
      const n = sub(prop, prop.node.group);
      n.group.rotation.z = k * Math.PI;
      const rs = sec.slice(0, 6);
      const body = loftSolid(rs.map(([r, c, b]) => ring(r, c, b, 0.1 - 0.05 * (r / R))));
      n.add(body, 'prop');
      n.add(loftSolid(sec.slice(5).map(([r, c, b]) => ring(r, c, b, 0.1 - 0.05 * (r / R)))), 'tip');
      n.add(at(cyl(0.035, 0.03, 0.14, 16), 0, 0.14, 0), 'alu'); // blade root clamp
    }
    prop.node.add(at(cyl(0.12, 0.12, 0.05, 36), 0, 0, 0, Math.PI / 2), 'alu'); // hub
    prop.node.add(at(cyl(0.16, 0.16, 0.012, 40), 0, 0, -0.03, Math.PI / 2), 'steel'); // spinner back plate
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      prop.node.add(at(cyl(0.012, 0.012, 0.02, 8), Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.03, Math.PI / 2), 'black');
    }
  }
  done(prop);

  // ============================================================ engine
  const engine = part('engine', {name: 'Engine', group: 'Powerplant', dir: [0, 0, 1], dist: 2.2, needs: ['cowlTop', 'cowlBot', 'prop', 'exhaust']});
  const heads = {};
  {
    const Y = PROP.axisY;
    const N = engine.node;
    N.add(at(box(0.34, 0.3, 0.68, 0.03), 0, Y, 0.46), 'case');
    N.add(at(box(0.3, 0.1, 0.5, 0.02), 0, Y - 0.2, 0.4), 'case'); // oil sump
    N.add(at(cyl(0.13, 0.13, 0.26, 28), 0, Y, 0.92, Math.PI / 2), 'case'); // nose case
    N.add(at(cyl(0.095, 0.095, 0.03, 28), 0, Y, 1.07, Math.PI / 2), 'steel'); // propeller flange
    N.add(at(cyl(0.04, 0.04, 0.06, 20), 0, Y, 1.1, Math.PI / 2), 'steel');
    N.add(at(box(0.32, 0.3, 0.12, 0.02), 0, Y, 0.14), 'case'); // accessory case
    for (const sx of [-1, 1]) N.add(at(cyl(0.05, 0.05, 0.12, 20), sx * 0.1, Y + 0.1, 0.06, Math.PI / 2), 'black'); // magnetos
    N.add(at(cyl(0.05, 0.05, 0.11, 20), 0.19, Y + 0.05, 0.2, 0, 0, Math.PI / 2), 'black'); // starter
    N.add(at(cyl(0.045, 0.045, 0.1, 20), -0.19, Y + 0.07, 0.22, 0, 0, Math.PI / 2), 'steel'); // alternator
    N.add(at(box(0.26, 0.1, 0.26, 0.02), 0, Y - 0.29, 0.34), 'black'); // fuel servo
    N.add(at(box(0.28, 0.12, 0.3, 0.025), 0, 0.97, 0.78), 'black'); // air box
    // cylinders: 1 and 2 forward, odd on the right
    const spec = [[1, 1, 0.62], [2, -1, 0.58], [3, 1, 0.31], [4, -1, 0.27]];
    for (const [no, sx, z] of spec) {
      N.add(at(cyl(0.062, 0.062, 0.14, 20), sx * 0.2, Y, z, 0, 0, Math.PI / 2), 'barrel');
      for (let i = 0; i < 8; i++) N.add(at(cyl(0.092, 0.092, 0.006, 22), sx * (0.15 + i * 0.016), Y, z, 0, 0, Math.PI / 2), 'barrel');
      N.add(at(box(0.11, 0.18, 0.16, 0.02), sx * 0.325, Y, z), `head${no}`);
      for (let i = 0; i < 5; i++) N.add(at(box(0.1, 0.004, 0.17, 0.001), sx * 0.325, Y - 0.09 + i * 0.045, z), `head${no}`);
      N.add(at(box(0.05, 0.15, 0.12, 0.012), sx * 0.4, Y, z), 'alu');
      N.add(rod(v(sx * 0.12, Y + 0.06, z - 0.04), v(sx * 0.33, Y + 0.075, z - 0.04), 0.008, 0.008, 6), 'steel'); // pushrod tube
      N.add(rod(v(sx * 0.12, Y - 0.2, z), v(sx * 0.3, Y - 0.085, z), 0.016, 0.016, 8), 'steel'); // intake runner
      heads[no] = {key: `head${no}`, sx, z};
    }
    // six bolt heads on the flange
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      N.add(at(cyl(0.011, 0.011, 0.012, 8), Math.cos(a) * 0.075, Y + Math.sin(a) * 0.075, 1.09, Math.PI / 2), 'black');
    }
  }
  done(engine);

  const mount = part('mount', {name: 'Engine mount', group: 'Powerplant', dir: [0, 0, 1], dist: 1.1, needs: ['engine', 'noseGear']});
  {
    const N = mount.node;
    for (const sx of [-1, 1]) {
      const f = [v(sx * 0.3, 1.55, 0.0), v(sx * 0.3, 0.85, 0.0)];
      const b = [v(sx * 0.2, 1.42, 0.76), v(sx * 0.2, 1.0, 0.76)];
      N.add(rod(f[0], b[0], 0.016, 0.016, 8), 'steel');
      N.add(rod(f[1], b[1], 0.016, 0.016, 8), 'steel');
      N.add(rod(f[0], b[1], 0.012, 0.012, 8), 'steel');
      N.add(rod(f[1], b[0], 0.012, 0.012, 8), 'steel');
      N.add(rod(f[0], f[1], 0.014, 0.014, 8), 'steel');
      N.add(at(cyl(0.034, 0.034, 0.05, 12), ...b[0].toArray(), 0, 0, Math.PI / 2), 'black'); // rubber isolators
      N.add(at(cyl(0.034, 0.034, 0.05, 12), ...b[1].toArray(), 0, 0, Math.PI / 2), 'black');
    }
    N.add(rod(v(-0.2, 1.42, 0.76), v(0.2, 1.42, 0.76), 0.016, 0.016, 8), 'steel');
    N.add(rod(v(-0.2, 1.0, 0.76), v(0.2, 1.0, 0.76), 0.016, 0.016, 8), 'steel');
  }
  done(mount);

  const exhaust = part('exhaust', {name: 'Exhaust and muffler', group: 'Powerplant', dir: [0, -1, 0.2], dist: 0.55, needs: ['cowlBot']});
  {
    const N = exhaust.node;
    const Y = PROP.axisY;
    for (const [, h] of Object.entries(heads)) {
      N.add(sweep([v(h.sx * 0.33, Y - 0.1, h.z), v(h.sx * 0.31, Y - 0.2, h.z), v(h.sx * 0.26, 0.76, h.z + 0.02), v(h.sx * 0.15, 0.71, h.z + 0.04)], [0.026, 0.026, 0.026, 0.026], {seg: 10}), 'exhaust');
    }
    for (const sx of [-1, 1]) {
      N.add(rod(v(sx * 0.15, 0.71, 0.66), v(sx * 0.09, 0.66, 0.1), 0.04, 0.04, 14), 'exhaust');
      N.add(rod(v(sx * 0.09, 0.66, 0.1), v(sx * 0.09, 0.66, -0.15), 0.042, 0.042, 14), 'exhaust');
      N.add(rod(v(sx * 0.09, 0.66, -0.15), v(sx * 0.09, 0.56, -0.62), 0.03, 0.03, 12), 'exhaust');
    }
    N.add(at(cyl(0.09, 0.09, 0.34, 24), 0, 0.66, 0.0, Math.PI / 2), 'steel'); // muffler shroud
  }
  done(exhaust);

  // ============================================================ doors
  for (const sx of [1, -1]) {
    const id = sx > 0 ? 'doorR' : 'doorL';
    const d = part(id, {name: sx > 0 ? 'Right door' : 'Left door', group: 'Cabin', dir: [sx, 0.08, 0], dist: 1.25});
    const side = (x) => (sx > 0 ? x > 0.3 : x < -0.3);
    const common = {st: FUS, z0: 0, z1: -1.5, nz: 100, nang: 144};
    const inDoor = (x, y, z) => side(x) && inRect(z, y, DOOR.za, DOOR.zb, DOOR.ya, DOOR.yb, GAP);
    const inWin = (x, y, z) => side(x) && inRect(z, y, DWIN.za, DWIN.zb, DWIN.ya, DWIN.yb);
    d.node.add(skin({...common, off: 0.002, keep: (x, y, z) => inDoor(x, y, z) && !inWin(x, y, z)}), 'paint');
    d.node.add(skin({...common, off: -0.003, keep: inWin}), 'glass');
    d.node.add(skin({...common, off: 0.005, keep: (x, y, z) => inDoor(x, y, z) && inBand(y, z, -0.04, 0.05)}), 'navy');
    d.node.add(skin({...common, off: 0.005, keep: (x, y, z) => inDoor(x, y, z) && inBand(y, z, -0.075, -0.045)}), 'orange');
    d.node.add(at(box(0.05, 0.02, 0.09, 0.006), sx * 0.575, 1.18, -0.42), 'black'); // handle
    done(d);
  }

  // ============================================================ interior
  const mkSeat = (id, name, x, w, z, dir) => {
    const s = part(id, {name, group: 'Cabin', dir, dist: id === 'bench' ? 2.6 : 1.9});
    const N = s.node;
    N.add(at(box(w, 0.1, 0.46, 0.03), x, 0.8, z), 'seat');
    N.add(at(box(w, 0.56, 0.09, 0.03), x, 1.08, z - 0.25, -0.2), 'seat');
    if (id !== 'bench') N.add(at(box(0.28, 0.16, 0.07, 0.025), x, 1.45, z - 0.3, -0.2), 'seat');
    else for (const dx of [-0.25, 0.25]) N.add(at(box(0.22, 0.14, 0.07, 0.025), x + dx, 1.42, z - 0.29, -0.2), 'seat');
    for (const dx of [-0.17, 0.17]) N.add(at(box(0.03, 0.08, 0.4, 0.004), x + dx * (w > 0.6 ? 2.4 : 1), 0.7, z), 'steel'); // rails
    return done(s);
  };
  mkSeat('seatR', 'Right front seat', 0.3, 0.44, -0.9, [1, 0.12, 0]);
  mkSeat('seatL', 'Left front seat', -0.3, 0.44, -0.9, [-1, 0.12, 0]);
  mkSeat('bench', 'Rear bench seat', 0, 0.98, -1.95, [1, 0.12, 0]);

  const panel = part('panel', {name: 'Instrument panel and controls', group: 'Cabin', dir: [-1, 0.1, -0.25], dist: 2.9});
  panel.yokes = [];
  {
    const N = panel.node;
    N.add(at(box(1.04, 0.42, 0.06, 0.01), 0, 1.4, -0.16, -0.25), 'panel');
    N.add(at(box(1.04, 0.1, 0.4, 0.02), 0, 1.58, -0.08, -0.1), 'black'); // glare shield
    const dials = [[-0.3, 1.46], [-0.18, 1.46], [-0.06, 1.46], [-0.3, 1.34], [-0.18, 1.34], [-0.06, 1.34], [0.08, 1.4], [0.2, 1.4], [0.32, 1.4]];
    for (const [x, y] of dials) {
      N.add(at(cyl(0.045, 0.045, 0.012, 24), x, y, -0.2, Math.PI / 2 - 0.25), 'dial');
      N.add(at(cyl(0.05, 0.05, 0.01, 24), x, y, -0.195, Math.PI / 2 - 0.25), 'black');
    }
    N.add(at(box(0.18, 0.14, 0.05, 0.01), 0, 1.2, -0.12), 'black'); // radio stack
    N.add(at(box(0.1, 0.5, 0.18, 0.02), 0, 0.88, -0.35), 'trim'); // pedestal
    N.add(at(cyl(0.014, 0.014, 0.16, 8), -0.025, 1.07, -0.32, 0.2), 'steel');
    N.add(at(cyl(0.02, 0.02, 0.03, 12), -0.025, 1.17, -0.34, 0.2), 'red'); // throttle
    N.add(at(cyl(0.014, 0.014, 0.16, 8), 0.025, 1.07, -0.32, 0.2), 'steel');
    N.add(at(cyl(0.02, 0.02, 0.03, 12), 0.025, 1.17, -0.34, 0.2), 'black'); // mixture
    N.add(at(box(0.04, 0.2, 0.04, 0.006), 0.07, 1.02, -0.4, -0.3), 'black'); // flap handle
    for (const sx of [-1, 1]) {
      N.add(at(box(0.1, 0.14, 0.02, 0.006), sx * 0.3, 0.85, -0.12, -0.5), 'black'); // pedals
      N.add(at(cyl(0.022, 0.022, 0.4, 12), sx * 0.3, 1.22, -0.43, Math.PI / 2), 'steel'); // column
      const y = sub(panel);
      y.group.position.set(sx * 0.3, 1.22, -0.5);
      y.add(at(box(0.05, 0.05, 0.05, 0.01), 0, 0, 0), 'black');
      y.add(rod(v(-0.16, 0.0, 0), v(0.16, 0.0, 0), 0.014, 0.014, 8), 'black');
      for (const gx of [-0.18, 0.18]) y.add(rod(v(gx, -0.09, 0), v(gx, 0.1, 0), 0.02, 0.02, 10), 'black');
      y.add(at(cyl(0.012, 0.012, 0.08, 8), 0, -0.05, 0), 'steel');
      panel.yokes.push(y);
    }
  }
  done(panel);

  // ============================================================ wings
  const wingPts = (s, x0, x1, t = 0.12) => {
    const c = chordAt(s);
    const y0 = WING.y0 + s * Math.tan(WING.dihedral) + 0.04 * c;
    return foilPts({m: 0.02, p: 0.4, t, x0, x1, n: 18}).map(([x, y]) => v(s, y0 + y * c, WING.zLE - x * c));
  };
  const hingeAt = (s) => {
    const c = chordAt(s);
    return v(s, WING.y0 + s * Math.tan(WING.dihedral) + 0.04 * c + 0.014 * c, WING.zLE - WING.hinge * c);
  };
  const SS = [0, 1.15, 2.3, 3.9, 5.5];
  const hingedSurface = (p, s0, s1, key) => {
    const H0 = hingeAt(s0);
    const H1 = hingeAt(s1);
    const q0 = new THREE.Quaternion().setFromUnitVectors(v(1, 0, 0), H1.clone().sub(H0).normalize());
    const pivot = new THREE.Group();
    pivot.position.copy(H0);
    pivot.quaternion.copy(q0);
    p.node.group.add(pivot);
    const rot = new THREE.Group();
    pivot.add(rot);
    const n = sub(p, rot);
    n.group.quaternion.copy(q0).invert();
    const ss = [s0, (s0 + s1) / 2, s1];
    n.add(loftSolid(ss.map((s) => wingPts(s, WING.hinge, 1).map((q) => q.sub(H0)))), key);
    n.add(rod(v(...[0, 0, 0]), H1.clone().sub(H0), 0.012, 0.012, 8), 'steel'); // hinge pin
    return rot;
  };
  const wings = {};
  for (const sx of [1, -1]) {
    const L = sx > 0 ? 'R' : 'L';
    // flap and aileron are built as their own parts, added after the wing so the wing can list them
    const wing = part(`wing${L}`, {name: `${sx > 0 ? 'Right' : 'Left'} wing`, group: 'Wings', dir: [sx * 0.85, 0.5, 0], dist: 3.8, needs: [`strut${L}`, `flap${L}`, `aileron${L}`]});
    const flap = part(`flap${L}`, {name: `${sx > 0 ? 'Right' : 'Left'} flap`, group: 'Wings', dir: [0, 0.2, -1], dist: 1.5});
    const ail = part(`aileron${L}`, {name: `${sx > 0 ? 'Right' : 'Left'} aileron`, group: 'Wings', dir: [0, 0.3, -1], dist: 1.5});
    for (const p of [wing, flap, ail]) p.mirror = sx;
    wing.node.group.scale.x = flap.node.group.scale.x = ail.node.group.scale.x = sx;
    const N = wing.node;
    N.add(loftSolid(SS.map((s) => wingPts(s, 0, WING.hinge))), 'paint');
    // trailing-edge fill where there is no flap or aileron
    for (const [a, b] of [[0, WING.flap[0] - 0.02], [WING.flap[1] + 0.02, WING.aileron[0] - 0.02], [WING.aileron[1] + 0.02, WING.semi]]) N.add(loftSolid([a, (a + b) / 2, b].map((s) => wingPts(s, WING.hinge - 0.002, 1))), 'paint');
    // a wingtip stripe and the navy/orange tip
    N.add(loftSolid([5.3, 5.4, 5.5].map((s) => wingPts(s, 0.02, 0.69, 0.121))), 'navy');
    // structure, seen when the skin is clear: ribs, two spars, the fuel tank
    for (let s = 0.3; s < 5.4; s += 0.42) N.add(loftSolid([s, s + 0.005].map((q) => wingPts(q, 0.03, 0.68, 0.112))), 'spar');
    for (const f of [0.25, 0.65]) {
      const web = (s) => {
        const c = chordAt(s);
        const y = WING.y0 + s * Math.tan(WING.dihedral) + 0.04 * c;
        const z = WING.zLE - f * c;
        return [v(s, y + 0.005 * c, z), v(s, y + 0.075 * c, z), v(s, y + 0.075 * c, z - 0.03), v(s, y + 0.005 * c, z - 0.03)];
      };
      N.add(loftSolid([web(0.1), web(5.3)]), 'spar');
    }
    N.add(at(box(1.6, 0.1, 0.4, 0.03), 1.5, WING.y0 + 0.11 + 1.5 * Math.tan(WING.dihedral), WING.zLE - 0.4), 'tank');
    done(wing);
    // ailerons and flaps
    const fl = hingedSurface(flap, WING.flap[0], WING.flap[1], 'paint');
    const ai = hingedSurface(ail, WING.aileron[0], WING.aileron[1], 'paint');
    done(flap);
    done(ail);
    wings[L] = {flap: fl, ail: ai};
    wings[L].sx = sx;
    // struts: the lift strut with its fittings
    const strut = part(`strut${L}`, {name: `${sx > 0 ? 'Right' : 'Left'} wing strut`, group: 'Wings', dir: [sx, -0.35, 0], dist: 1.4});
    {
      const a = v(sx * 0.6, 0.8, -0.4);
      const b = v(sx * 2.3, 1.92 + 2.3 * Math.tan(WING.dihedral), -0.4);
      const up = v(0, 0, 1);
      strut.node.add(sweep([a, b], [0.044, 0.044], {flat: 0.34, seg: 16, up}), 'paint');
      strut.node.add(at(box(0.08, 0.05, 0.14, 0.01), a.x, a.y, a.z), 'steel');
      strut.node.add(at(box(0.08, 0.05, 0.14, 0.01), b.x, b.y - 0.01, b.z), 'steel');
      // the jury strut from mid-strut to the wing, aft
      const m = a.clone().lerp(b, 0.62);
      strut.node.add(rod(m, v(sx * 1.88, 1.93 + 1.88 * Math.tan(WING.dihedral), -0.5), 0.013, 0.013, 8), 'steel');
      done(strut);
    }
  }

  // ============================================================ tail
  const stab = part('stab', {name: 'Horizontal stabilizer', group: 'Tail', dir: [0, -0.15, -1], dist: 1.7, needs: ['elevator']});
  const elev = part('elevator', {name: 'Elevator', group: 'Tail', dir: [0, 0.2, -1], dist: 3.5});
  elev.pivot = new THREE.Group();
  {
    const half = TAIL.span / 2;
    const tailPts = (x, x0, x1) => {
      const k = Math.abs(x) / half;
      const le = TAIL.leRoot + (TAIL.leTip - TAIL.leRoot) * k;
      const c = TAIL.teZ - le; // negative: toward the tail
      const hinge = (TAIL.hingeZ - le) / c;
      const a = x0 === 0 ? 0 : hinge;
      const b = x1 === 1 ? 1 : hinge;
      return foilPts({m: 0, t: 0.09, x0: a, x1: b, n: 12}).map(([f, y]) => v(x, TAIL.y + y * Math.abs(c), le + f * c));
    };
    const xs = [-half, -half / 2, 0, half / 2, half];
    stab.node.add(loftSolid(xs.map((x) => tailPts(x, 0, 0.5))), 'paint');
    // elevator pivots about the straight hinge line z = hingeZ
    elev.pivot.position.set(0, TAIL.y, TAIL.hingeZ);
    elev.node.group.add(elev.pivot);
    const n = sub(elev, elev.pivot);
    n.group.position.set(0, -TAIL.y, -TAIL.hingeZ);
    n.add(loftSolid(xs.map((x) => tailPts(x, 0.5, 1))), 'paint');
    n.add(at(box(0.46, 0.012, 0.08, 0.004), 0, TAIL.y + 0.02, TAIL.teZ + 0.06), 'navy'); // trim tab
    // tip fairings
    for (const sx of [-1, 1]) stab.node.add(at(box(0.04, 0.09, 0.7, 0.02), sx * (half + 0.005), TAIL.y, (TAIL.leTip + TAIL.hingeZ) / 2), 'navy');
  }
  done(stab);
  done(elev);

  const fin = part('fin', {name: 'Vertical fin', group: 'Tail', dir: [0, 1, 0], dist: 1.8, needs: ['rudder']});
  const rudder = part('rudder', {name: 'Rudder', group: 'Tail', dir: [0, 0.3, -1], dist: 2.0});
  {
    const prof = (pts, th, key, node) => {
      const sh = new THREE.Shape();
      pts.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y)));
      sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, {depth: th, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2});
      g.translate(0, 0, -th / 2);
      g.rotateY(-Math.PI / 2); // shape x (z) -> world z, extrusion -> world x
      node.add(g, key);
    };
    prof([[-5.1, 1.42], [-6.12, 2.72], [-6.4, 2.72], [-6.31, 1.3], [-5.5, 1.3]], 0.05, 'paint', fin.node);
    fin.node.add(at(box(0.05, 0.1, 0.25, 0.012), 0, 2.72, -6.26), 'navy');
    // rudder pivots about a vertical hinge at z = -6.35
    rudder.pivot = new THREE.Group();
    rudder.pivot.position.set(0, 0, -6.35);
    rudder.node.group.add(rudder.pivot);
    const n = sub(rudder, rudder.pivot);
    n.group.position.set(0, 0, 6.35);
    prof([[-6.33, 1.3], [-6.41, 2.72], [-6.68, 2.7], [-6.74, 1.28]], 0.044, 'paint', n);
    n.add(at(box(0.048, 0.45, 0.28, 0.01), 0, 1.7, -6.54), 'navy');
    n.add(at(box(0.05, 0.1, 0.1, 0.01), 0, 2.74, -6.55), 'orange');
  }
  done(fin);
  done(rudder);

  // ============================================================ landing gear
  const wheelNode = (p, r, w, brake) => {
    const wh = sub(p);
    const prof = [];
    for (let i = 0; i <= 18; i++) {
      const a = -Math.PI / 2 + (i / 18) * Math.PI;
      prof.push(new THREE.Vector2(r - (w / 2) * 0.62 + (w / 2) * 0.62 * Math.cos(a), (w / 2) * Math.sin(a)));
    }
    prof.unshift(new THREE.Vector2(r * 0.52, -w * 0.46));
    prof.push(new THREE.Vector2(r * 0.52, w * 0.46));
    const tyre = new THREE.LatheGeometry(prof, 40);
    tyre.rotateZ(Math.PI / 2);
    wh.add(tyre, 'rubber');
    wh.add(at(cyl(r * 0.56, r * 0.56, w * 0.8, 36), 0, 0, 0, 0, 0, Math.PI / 2), 'alu');
    wh.add(at(cyl(r * 0.2, r * 0.2, w * 1.0, 20), 0, 0, 0, 0, 0, Math.PI / 2), 'black');
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      wh.add(at(cyl(0.013, 0.013, w * 0.9, 8), 0, Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38, 0, 0, Math.PI / 2), 'black');
    }
    if (brake) wh.add(at(cyl(r * 0.5, r * 0.5, 0.008, 36), brake * w * 0.5, 0, 0, 0, 0, Math.PI / 2), 'steel');
    return wh;
  };
  const noseGear = part('noseGear', {name: 'Nose gear strut', group: 'Landing gear', dir: [0, 0.1, 1], dist: 1.5, needs: ['noseWheel']});
  const noseWheel = part('noseWheel', {name: 'Nose wheel', group: 'Landing gear', dir: [0, 0, 1], dist: 2.6});
  {
    const T = v(0, 1.0, 0.6);
    const A = v(0, WHEELS.nose.r, WHEELS.nose.z);
    const M = T.clone().lerp(A, 0.5);
    noseGear.node.add(rod(T, M, 0.034, 0.034, 20), 'steel');
    noseGear.node.add(rod(M, A.clone().lerp(M, 0.18), 0.024, 0.024, 16), 'alu');
    noseGear.node.add(at(cyl(0.036, 0.036, 0.05, 20), M.x, M.y, M.z, 0.25), 'black');
    for (const sx of [-1, 1]) {
      noseGear.node.add(rod(v(sx * 0.014, M.y - 0.06, M.z + 0.02), v(sx * 0.05, A.y + 0.08, A.z - 0.01), 0.014, 0.014, 8), 'steel');
      noseGear.node.add(rod(v(sx * 0.055, A.y + 0.14, A.z - 0.04), v(sx * 0.075, A.y, A.z), 0.02, 0.02, 8), 'steel');
    }
    noseGear.node.add(rod(v(-0.06, M.y - 0.1, M.z + 0.03), v(0.06, M.y - 0.1, M.z + 0.03), 0.012, 0.012, 8), 'steel');
    const wh = wheelNode(noseWheel, WHEELS.nose.r, WHEELS.nose.w, 0);
    wh.group.position.copy(A);
    noseWheel.wheel = wh.group;
    noseWheel.axle = A;
  }
  done(noseGear);
  done(noseWheel);
  noseWheel.node.group.position.set(0, 0, 0);

  for (const sx of [1, -1]) {
    const L = sx > 0 ? 'R' : 'L';
    const gear = part(`gear${L}`, {name: `${sx > 0 ? 'Right' : 'Left'} main gear leg`, group: 'Landing gear', dir: [sx, 0.1, 0], dist: 0.95, needs: [`wheel${L}`]});
    const wheel = part(`wheel${L}`, {name: `${sx > 0 ? 'Right' : 'Left'} main wheel`, group: 'Landing gear', dir: [sx, 0, 0], dist: 1.75});
    const X = WHEELS.main.x;
    const Z = WHEELS.main.z;
    const pts = [v(sx * 0.3, 0.8, Z + 0.02), v(sx * 0.62, 0.66, Z + 0.01), v(sx * 0.95, 0.46, Z), v(sx * (X - 0.12), 0.25, Z)];
    gear.node.add(sweep(pts, [0.046, 0.042, 0.036, 0.03], {seg: 16}), 'steel');
    gear.node.add(at(box(0.14, 0.09, 0.14, 0.02), sx * 0.46, 0.76, Z), 'steel');
    gear.node.add(rod(v(sx * (X - 0.15), WHEELS.main.r, Z), v(sx * (X - 0.01), WHEELS.main.r, Z), 0.026, 0.026, 12), 'alu'); // axle
    gear.node.add(at(box(0.04, 0.12, 0.1, 0.01), sx * (X - 0.04), WHEELS.main.r + 0.1, Z - 0.03), 'orange'); // brake caliper
    const wh = wheelNode(wheel, WHEELS.main.r, WHEELS.main.w, -sx);
    wh.group.position.set(sx * X, WHEELS.main.r, Z);
    wheel.wheel = wh.group;
    done(gear);
    done(wheel);
  }

  // ============================================================ posing
  for (const p of list) p.base = p.home.clone();
  const ease = (x) => sm(x);
  const state = {explode: 0, prop: 0, crank: 0, flap: 0, roll: 0, pitch: 0, yaw: 0};
  const deflect = (x, up, down) => (x >= 0 ? x * up : x * down);

  const update = (st = state) => {
    for (const p of list) {
      const k = ease(Math.max(p.p, st.explode));
      p.out = k;
      p.g.position.copy(p.base).addScaledVector(p.dir, p.dist * k);
    }
    // the spinner and propeller turn about the crankshaft axis
    for (const id of ['spinner', 'prop']) {
      const p = parts[id];
      p.g.rotation.z = st.prop;
      p.g.position.x = p.base.x + p.dir.x * p.dist * p.out;
    }
    parts.spinner.g.position.set(0, PROP.axisY, PROP.hubZ + 0.04 + parts.spinner.dir.z * parts.spinner.dist * parts.spinner.out);
    parts.prop.g.position.set(0, PROP.axisY, PROP.hubZ + parts.prop.dir.z * parts.prop.dist * parts.prop.out);
    // the cylinders fire 1-3-2-4, 180 degrees of crank apart; each head glows through its power stroke
    const cyc = ((st.crank % (Math.PI * 4)) + Math.PI * 4) % (Math.PI * 4);
    ENGINE.firing.forEach((no, i) => {
      const ph = ((cyc - i * Math.PI + Math.PI * 4) % (Math.PI * 4)) / Math.PI; // 0..4, power stroke is the first unit
      heads[no].glow = ph < 1 ? 1 - ph * 0.85 : 0;
    });
    // flight controls
    const f = (st.flap * Math.PI) / 180;
    for (const L of ['R', 'L']) {
      const sx = L === 'R' ? 1 : -1;
      wings[L].flap.rotation.x = -f;
      const a = st.roll * sx; // roll right: right aileron up
      wings[L].ail.rotation.x = a >= 0 ? a * TRAVEL.aileronUp : a * TRAVEL.aileronDown;
    }
    elev.pivot.rotation.x = st.pitch >= 0 ? st.pitch * TRAVEL.elevatorUp : st.pitch * TRAVEL.elevatorDown; // pull = trailing edge up = +x rotation
    rudder.pivot.rotation.y = -st.yaw * TRAVEL.rudder;
    for (const y of panel.yokes) {
      y.group.rotation.z = st.roll * 1.15;
      y.group.position.z = -0.5 - st.pitch * 0.08;
    }
    // wheels roll on their axles when the explode swings them out, a touch of life
    for (const k of ['wheelR', 'wheelL', 'noseWheel']) parts[k].wheel.rotation.x = parts[k].out * 3.2 * (k === 'wheelL' ? 1 : 1);
  };

  const heat = new THREE.Color('#ff6a2c');
  const hl = new THREE.Color('#e3562a');
  /** hover/selection tint and the firing glow, once a frame */
  const paint = () => {
    for (const p of list) {
      for (const [key, m] of Object.entries(p.mats)) {
        if (!m.emissive) continue;
        const no = /^head(\d)$/.exec(key);
        const g = no ? heads[no[1]].glow || 0 : 0;
        m.emissive.copy(hl).multiplyScalar(p.hl * 0.42);
        if (g) m.emissive.add(heat.clone().multiplyScalar(g * 0.8));
      }
    }
  };
  /** clear glass for the skins, back to solid when off */
  const xray = (on) => {
    for (const p of list) {
      for (const [key, m] of Object.entries(p.mats)) {
        if (!SKINS.has(matKey(key)) && matKey(key) !== 'inside') continue;
        if (p.group === 'Landing gear') continue;
        if (matKey(key) === 'inside') {
          m.visible = true;
          continue;
        }
        const base = key === 'glass' ? 0.55 : 1;
        m.transparent = on || key === 'glass';
        m.opacity = on ? (key === 'glass' ? 0.16 : 0.2) : base;
        m.depthWrite = !(on || key === 'glass');
        m.needsUpdate = true;
      }
    }
  };

  return {root, parts, list, update, paint, xray, state, wings, heads};
}
