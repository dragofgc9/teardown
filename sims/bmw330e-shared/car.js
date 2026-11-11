// The 330e as a set of parts you can pull off. buildCar() returns the scene graph, the part registry (name, system,
// explode vector, a line of what it does) and two per-frame functions:
//   update(o, dt, pb)  poses every moving thing from the powertrain readout `o` (drive.js): wheels from road speed, the
//                      crank, pistons, valves and combustion colours from the crank angle, the rotor from shaft speed,
//                      the shift elements from the engaged gear, the pack from the charge, beads along the HV cables.
//   look(dt, S)        applies explode / pulled parts / isolate / ghost body / selection to every part.
import * as THREE from 'three';
import {buildBody, DIM} from './body.js';
import {CAR, ICE, BAT, FUEL, pinHeight, crankPin, phase, liftIn, liftEx, strokeOf} from './drive.js';
import {addBodyDetails, roundelMaterial} from './details.js';
import {C, clamp, cyl, D2R, edged, gearGeo, glassy, glow, lathe, lerp, mesh, rbox, rod, std, TAU, tube, V3} from './kit3d.js';

export const SYSTEMS = [
  {id: 'body', name: 'BODY & GLASS', short: 'BODY'},
  {id: 'cabin', name: 'CABIN', short: 'CABIN'},
  {id: 'engine', name: 'B48 ENGINE', short: 'ENGINE'},
  {id: 'edrive', name: 'eDRIVE & GEARBOX', short: 'eDRIVE'},
  {id: 'hv', name: 'HIGH VOLTAGE', short: 'HV'},
  {id: 'fuel', name: 'FUEL & EXHAUST', short: 'FUEL'},
  {id: 'driveline', name: 'DRIVELINE', short: 'DRIVE'},
  {id: 'chassis', name: 'CHASSIS & WHEELS', short: 'CHASSIS'},
];

export const Y0 = 0.38; // crank axis height
const CZ = [1.6565, 1.5655, 1.4745, 1.3835]; // cylinders 1..4, 91 mm bore spacing, 1 at the front
const DECK = Y0 + 0.223;
const CAMY = DECK + 0.142;
const CROWN = 0.03; // pin to crown
const mm = 0.001;
const PROP_Y = Y0;

// planetary sets of the 8-speed: teeth and radii (module 3.5 mm)
const ZS = 24;
const ZP = 18;
const ZR = 60;
const MOD = 0.0035;
const SET_Z = [0.9, 0.8, 0.7, 0.6];
const EL_Z = [0.955, 0.85, 0.75, 0.65, 0.545];

export function buildCar() {
  const root = new THREE.Group();
  const parts = [];
  const A = {}; // animated things

  const add = (id, name, system, info, ex, build, opts = {}) => {
    const obj = new THREE.Group();
    obj.name = id;
    build(obj);
    root.add(obj);
    parts.push({id, name, system, info, ex: new V3(...ex), obj, pull: 0, fade: 1, hl: 0, ...opts});
    return obj;
  };

  // ============================================================ body
  const body = buildBody();
  const paintMat = () => new THREE.MeshPhysicalMaterial({color: '#e6e8ea', metalness: 0.0, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.9, side: THREE.DoubleSide});
  const glassMat = () => new THREE.MeshPhysicalMaterial({color: '#0c1317', metalness: 0.0, roughness: 0.05, transparent: true, opacity: 0.68, envMapIntensity: 0.5, side: THREE.DoubleSide, depthWrite: false});
  const trimMat = () => new THREE.MeshStandardMaterial({color: '#08090a', metalness: 0.0, roughness: 0.65, envMapIntensity: 0.25, side: THREE.DoubleSide});
  const PANEL = {
    tub: ['Body shell', [0, 0, 0], 'F30 sedan unibody: 4,633 mm long, 1,811 mm wide, 2,810 mm between the axles. The battery lives under the boot floor.'],
    hood: ['Hood', [0, 0.95, 0.5], 'Hinged at the cowl. Under it: the 2.0 L engine, the eDrive module behind it and the power electronics.'],
    trunk: ['Trunk lid', [0, 0.9, -0.55], 'The boot floor sits on the high-voltage pack, so boot space is smaller than in the petrol 3 Series.'],
    roof: ['Roof & glass', [0, 1.1, 0], 'Roof panel, pillars, windscreen, side and rear glass as one lift-off assembly.'],
    doorFL: ['Front left door', [1.05, 0.12, 0.25], 'Door shell. The charge port is in the left front wing just ahead of it.'],
    doorFR: ['Front right door', [-1.05, 0.12, 0.25], 'Door shell with side-impact beam.'],
    doorRL: ['Rear left door', [1.05, 0.12, -0.25], 'Rear door shell.'],
    doorRR: ['Rear right door', [-1.05, 0.12, -0.25], 'Rear door shell.'],
    bumperF: ['Front bumper', [0, 0, 1.0], 'Front fascia with the radiator opening; the crash beam sits behind it.'],
    bumperR: ['Rear bumper', [0, 0, -1.0], 'Rear fascia with the exhaust cut-outs.'],
  };
  for (const [id, geo] of Object.entries(body.panels)) {
    const [name, ex, info] = PANEL[id];
    const sys = 'body';
    add(id, name, sys, info, ex, (g) => {
      const skin = paintMat();
      skin.side = THREE.FrontSide;
      const m = new THREE.Mesh(geo, [skin, glassMat(), trimMat()]);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      // the inside of every panel is dark, so the glass shows a cabin and not the far side's paint
      const off = new THREE.MeshBasicMaterial({visible: false});
      const lining = new THREE.MeshStandardMaterial({color: '#1d1f22', roughness: 0.9, side: THREE.BackSide});
      const inner = new THREE.Mesh(geo, [lining, off, lining]);
      inner.raycast = () => {};
      g.add(inner);
      const left = id.endsWith('L');
      if (id === 'doorFL' || id === 'doorFR') {
        // door mirror: a painted cap on a black foot at the front corner of the side glass
        const s = left ? 1 : -1;
        const mir = new THREE.Group();
        const cap = mesh(new THREE.SphereGeometry(0.5, 24, 16), paintMat(), 0, 0, 0);
        cap.scale.set(0.175, 0.105, 0.085);
        mir.add(cap);
        const glassM = mesh(new THREE.CircleGeometry(0.5, 24), std('#8d99a6', 0.9, 0.08), 0, 0, -0.03);
        glassM.scale.set(0.15, 0.085, 1);
        glassM.rotation.y = Math.PI;
        mir.add(glassM);
        const low = mesh(new THREE.SphereGeometry(0.5, 20, 12), std('#0e1012', 0.2, 0.5), 0, -0.022, -0.004);
        low.scale.set(0.166, 0.085, 0.078);
        mir.add(low);
        mir.add(mesh(rbox(0.09, 0.026, 0.055, 0.012), std('#0e1012', 0.2, 0.5), -s * 0.075, -0.04, 0.005));
        const st = body.at(0.69);
        mir.position.set(s * (st.xBelt + 0.105), st.yBelt + 0.065, 0.69);
        mir.rotation.y = s * -0.16;
        g.add(mir);
      }
    });
  }
  // wheel arch liners stay with the shell: a half-cylinder over each wheel, open to the road
  {
    const liner = (R, w) => {
      const pos = [];
      const idx = [];
      const N = 28;
      for (let i = 0; i <= N; i++) {
        const f = (i / N) * Math.PI;
        for (const x of [-w / 2, w / 2]) pos.push(x, R * Math.sin(f), R * Math.cos(f));
        if (i) idx.push((i - 1) * 2, i * 2, (i - 1) * 2 + 1, (i - 1) * 2 + 1, i * 2, i * 2 + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const lm = () => new THREE.MeshStandardMaterial({color: '#17181a', roughness: 0.9, side: THREE.DoubleSide});
    for (const a of body.arches) for (const s of [-1, 1]) parts.find((p) => p.id === 'tub').obj.add(mesh(liner(a.R + 0.012, 0.3), lm(), s * 0.74, body.archY, a.z));
  }

  // ============================================================ cabin
  const seatMat = () => std('#2a2b2e', 0.05, 0.8);
  const seatAt = (id, name, x, z, w) =>
    add(id, name, 'cabin', 'Seat frame, foam and trim.', [0, 0.45, 0], (g) => {
      g.add(mesh(rbox(w, 0.13, 0.5, 0.05), seatMat(), x, 0.43, z));
      const back = mesh(rbox(w, 0.58, 0.12, 0.05), seatMat(), x, 0.78, z - 0.27);
      back.rotation.x = -0.2;
      g.add(back);
      if (w < 0.7) g.add(mesh(rbox(0.3, 0.2, 0.09, 0.04), seatMat(), x, 1.13, z - 0.36));
    });
  seatAt('seatFL', 'Front left seat', 0.36, 0.22, 0.5);
  seatAt('seatFR', 'Front right seat', -0.36, 0.22, 0.5);
  seatAt('seatR', 'Rear bench', 0, -0.62, 1.32);
  add('dash', 'Dashboard & console', 'cabin', 'Instrument panel, iDrive display and centre console over the transmission tunnel. The eDRIVE button and charge indicator live here.', [0, 0.5, 0.5], (g) => {
    g.add(mesh(rbox(1.55, 0.2, 0.34, 0.06), std('#202225', 0.1, 0.7), 0, 0.84, 0.74));
    g.add(mesh(rbox(0.26, 0.16, 0.02, 0.01), glow('#2b4a6a'), 0, 1.0, 0.64));
    g.add(mesh(rbox(0.22, 0.12, 0.85, 0.04), std('#202225', 0.1, 0.7), 0, 0.61, 0.28));
  });
  add('steer', 'Steering wheel', 'cabin', 'Electric power steering; the column connects to the rack on the front subframe.', [0.4, 0.5, 0.5], (g) => {
    const t = mesh(new THREE.TorusGeometry(0.18, 0.013, 12, 40), std('#17181a', 0.1, 0.6), 0.37, 0.86, 0.5);
    t.rotation.x = -0.45;
    g.add(t);
    const col = rod([0.37, 0.86, 0.5], [0.37, 0.7, 0.8], 0.016, std('#2a2d31', 0.6, 0.5));
    g.add(col);
  });

  // ============================================================ chassis: floor, subframes
  add('floor', 'Floor & tunnel', 'chassis', 'The floor pan and the transmission tunnel that carries the propshaft to the rear.', [0, -0.0, 0.0], (g) => {
    const sh = new THREE.Shape();
    const bot = [[-0.64, 0.2], [-0.25, 0.2], [-0.25, 0.4], [-0.2, 0.52], [-0.12, 0.58], [0.12, 0.58], [0.2, 0.52], [0.25, 0.4], [0.25, 0.2], [0.64, 0.2]];
    const top = bot.map(([x, y]) => [x, y + 0.02]).reverse();
    [...bot, ...top].forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    const geo = new THREE.ExtrudeGeometry(sh, {depth: 3.1, bevelEnabled: false});
    geo.translate(0, 0, -2.15);
    const m = mesh(geo, glassy('#59616a', 0.42));
    g.add(edged(m, '#2a3038', 0.35, 40));
  });
  add('subF', 'Front subframe', 'chassis', 'Carries the engine mounts, steering rack and the front lower arms.', [0, -0.0, 0.55], (g) => {
    const mat = std('#33373c', 0.6, 0.55);
    for (const x of [-0.34, 0.34]) g.add(rod([x, 0.24, 1.12], [x, 0.24, 1.78], 0.02, mat));
    for (const z of [1.12, 1.78]) g.add(rod([-0.34, 0.24, z], [0.34, 0.24, z], 0.02, mat));
    g.add(rod([-0.55, 0.3, 1.3], [0.55, 0.3, 1.3], 0.016, std('#9aa1a8', 0.8, 0.4)));
  });
  add('subR', 'Rear subframe', 'chassis', 'Carries the rear differential and the multi-link suspension.', [0, -0.0, -0.55], (g) => {
    const mat = std('#33373c', 0.6, 0.55);
    for (const x of [-0.4, 0.4]) g.add(rod([x, 0.27, -1.65], [x, 0.27, -1.15], 0.02, mat));
    for (const z of [-1.65, -1.15]) g.add(rod([-0.4, 0.27, z], [0.4, 0.27, z], 0.02, mat));
  });

  // ============================================================ wheels, brakes, suspension (four corners)
  A.wheels = [];
  const corners = [
    ['FL', 1, DIM.zFront], ['FR', -1, DIM.zFront], ['RL', 1, DIM.zRear], ['RR', -1, DIM.zRear],
  ];
  const tireProfile = [[0.232, -0.095], [0.246, -0.105], [0.292, -0.1125], [0.322, -0.105], [0.33, -0.07], [0.332, 0], [0.33, 0.07], [0.322, 0.105], [0.292, 0.1125], [0.246, 0.105], [0.232, 0.095]];
  for (const [tag, s, z] of corners) {
    const front = tag[0] === 'F';
    const name = (front ? 'Front ' : 'Rear ') + (s > 0 ? 'left' : 'right');
    // wheel + tyre
    add('wheel' + tag, name + ' wheel', 'chassis', '225/45 R18 tyre, rolling radius 0.33 m: one wheel turn is 2.07 m of road.', [s * 0.8, 0.0, 0], (g) => {
      const w = new THREE.Group();
      w.position.set(s * 0.775, 0.33, z);
      w.scale.x = s;
      const spin = new THREE.Group();
      w.add(spin);
      spin.add(mesh(lathe(tireProfile, 'x', 64), std('#17181a', 0.05, 0.9), 0, 0, 0));
      spin.add(mesh(cyl(0.2286, 0.2286, 0.2, 'x', 48, true), std('#aeb4bb', 0.9, 0.3, {side: THREE.DoubleSide})));
      spin.add(mesh(cyl(0.232, 0.232, 0.012, 'x', 48, true), std('#dfe3e7', 0.9, 0.25, {side: THREE.DoubleSide}), 0.095, 0, 0));
      const hub = mesh(cyl(0.05, 0.05, 0.03, 'x', 24), std('#d5d9de', 0.9, 0.3), 0.09, 0, 0);
      spin.add(hub);
      const face = mesh(cyl(0.2286, 0.05, 0.05, 'x', 32), std('#b9bfc6', 0.9, 0.32), 0.07, 0, 0);
      face.scale.set(0.2, 1, 1);
      spin.add(face);
      // V-spoke: five pairs that leave the hub together and open towards the rim
      for (let i = 0; i < 5; i++) {
        for (const d of [-0.2, 0.2]) {
          const sp = mesh(rbox(0.02, 0.2, 0.03, 0.006), std('#d5d9de', 0.9, 0.28), 0.085, 0, 0);
          sp.geometry.translate(0, 0.12, 0);
          sp.rotation.x = (i / 5) * TAU + d;
          spin.add(sp);
        }
      }
      const cap = new THREE.Mesh(new THREE.CircleGeometry(0.032, 32), roundelMaterial());
      cap.rotation.y = Math.PI / 2;
      cap.position.set(0.1, 0, 0);
      spin.add(cap);
      g.add(w);
      A.wheels.push({spin, tag});
    });
    add('brake' + tag, name + ' brake', 'chassis', 'Ventilated disc and floating caliper. Recuperation takes the first part of every stop; the pads only get the rest.', [s * 0.4, 0.0, 0], (g) => {
      const w = new THREE.Group();
      w.position.set(s * 0.775, 0.33, z);
      w.scale.x = s;
      const disc = new THREE.Group();
      disc.add(mesh(cyl(0.165, 0.165, 0.03, 'x', 48), std('#7b8189', 0.9, 0.5), -0.03, 0, 0));
      disc.add(mesh(cyl(0.07, 0.07, 0.045, 'x', 24), std('#6c7279', 0.9, 0.5), -0.03, 0, 0));
      w.add(disc);
      const calMat = std('#3d4046', 0.5, 0.45);
      const cal = mesh(rbox(0.085, 0.1, 0.17, 0.02), calMat, -0.03, 0, 0);
      cal.position.set(-0.03, 0.12, -0.1);
      cal.rotation.x = 0.7;
      w.add(cal);
      w.add(mesh(cyl(0.046, 0.046, 0.12, 'x', 20), std('#8e969e', 0.8, 0.4), -0.1, 0, 0));
      g.add(w);
      A.wheels.find((q) => q.tag === tag).disc = disc;
      A.wheels.find((q) => q.tag === tag).cal = cal;
    });
    // suspension
    const x0 = s * 0.69;
    add('susp' + tag, name + ' suspension', 'chassis', front ? 'Spring strut: coil spring and damper on one axis, a lower arm to the subframe.' : 'Multi-link rear axle: spring, damper and links keep the wheel upright through the stroke.', [s * 0.5, 0.35, 0], (g) => {
      const steel = std('#9097a0', 0.8, 0.4);
      const spr = std(front ? '#c43a2f' : '#c43a2f', 0.4, 0.5);
      const xs = front ? s * 0.6 : s * 0.62;
      const zs = front ? z + 0.03 : z - 0.12;
      const y0 = front ? 0.5 : 0.36;
      const y1 = front ? 0.7 : 0.66;
      const pts = [];
      const N = 200;
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * TAU * 7;
        pts.push(new V3(xs + 0.055 * Math.cos(a), lerp(y0 + 0.02, y1 - 0.02, i / N), zs + 0.055 * Math.sin(a)));
      }
      const coil = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N * 2, 0.0065, 6), spr);
      coil.castShadow = true;
      g.add(coil);
      g.add(mesh(cyl(0.022, 0.022, y1 - y0 - 0.04, 'y', 16), steel, xs, (y0 + y1) / 2 - 0.02, zs));
      g.add(mesh(cyl(0.007, 0.007, 0.1, 'y', 8), std('#d5d9de', 0.9, 0.2), xs, y1 + 0.03, zs));
      g.add(mesh(cyl(0.045, 0.045, 0.02, 'y', 20), std('#262a2f', 0.3, 0.6), xs, y1 + 0.08, zs));
      // lower arm and links
      const arm = std('#454a51', 0.6, 0.5);
      const inner = s * 0.3;
      g.add(rod([x0, 0.27, z], [inner, 0.25, z + 0.18], 0.013, arm));
      g.add(rod([x0, 0.27, z], [inner, 0.25, z - 0.18], 0.013, arm));
      g.add(rod([x0, y0, zs], [x0, 0.3, z], 0.013, arm));
      if (!front) g.add(rod([x0, 0.4, z + 0.06], [inner, 0.38, z + 0.3], 0.011, arm));
    });
  }

  // ============================================================ engine (B48, 2.0 L, 4 cylinders, 82 x 94.6 mm)
  const EZ0 = 1.31;
  const EZ1 = 1.775;
  const EL = EZ1 - EZ0;
  const EZC = (EZ0 + EZ1) / 2;
  A.pist = [];
  A.rods = [];
  A.valves = [];
  A.cams = [];
  A.fills = [];
  const shellMat = (c = '#9fb0c0', o = 0.26) => glassy(c, o);
  add('block', 'Engine block & crankcase', 'engine', 'Aluminium crankcase for four 82 mm bores. The crankshaft turns in five main bearings.', [0, 0, 0], (g) => {
    const m = mesh(rbox(0.25, DECK - 0.27, EL, 0.012), shellMat(), 0, (DECK + 0.27) / 2, EZC);
    edged(m);
    g.add(m);
  });
  add('liners', 'Cylinders & charge', 'engine', 'Four 82 mm bores. The colour is the charge: blue intake, yellow compression, orange combustion, grey exhaust. Fires 1-3-4-2.', [0, 0.14, 0], (g) => {
    for (let i = 0; i < 4; i++) {
      const liner = mesh(cyl(0.0415, 0.0415, DECK - (Y0 + 0.09), 'y', 32, true), glassy('#cdd6df', 0.22), 0, (DECK + Y0 + 0.09) / 2, CZ[i]);
      g.add(liner);
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.0398, 0.0398, 1, 28), new THREE.MeshBasicMaterial({color: '#7fb6ff', transparent: true, opacity: 0.3, depthWrite: false}));
      f.position.set(0, 0, CZ[i]);
      g.add(f);
      A.fills.push(f);
    }
  });
  add('crank', 'Crankshaft', 'engine', 'Four-throw crank, 94.6 mm stroke. Pins 1 and 4 sit opposite 2 and 3, so one cylinder fires every half turn.', [0, -0.06, 0], (g) => {
    const cr = new THREE.Group();
    cr.position.set(0, Y0, 0);
    const steel = std('#7f8790', 0.9, 0.35);
    cr.add(mesh(cyl(0.026, 0.026, EL + 0.07, 'z', 20), steel, 0, 0, EZC));
    const R = ICE.stroke / 2 * mm;
    for (let i = 0; i < 4; i++) {
      const c = i + 1;
      const up = ICE.pin[c] === 0 ? 1 : -1;
      cr.add(mesh(cyl(0.024, 0.024, 0.032, 'z', 20), std('#aab1b9', 0.95, 0.25), 0, up * R, CZ[i]));
      for (const dz of [-0.0235, 0.0235]) {
        const web = mesh(cyl(0.05, 0.05, 0.012, 'z', 28), steel, 0, 0, CZ[i] + dz);
        cr.add(web);
        const cw = mesh(rbox(0.07, 0.07, 0.012, 0.01), steel, 0, -up * 0.04, CZ[i] + dz);
        cr.add(cw);
        const arm = mesh(rbox(0.036, R + 0.02, 0.012, 0.005), steel, 0, up * R / 2, CZ[i] + dz);
        cr.add(arm);
      }
    }
    g.add(cr);
    A.crank = cr;
  });
  add('rods', 'Pistons & rods', 'engine', '1,998 cc from 82 x 94.6 mm. Mean piston speed is 17 m/s at 5,400 rpm. (Rod length, 144 mm, is a typical value.)', [0, 0.26, 0], (g) => {
    const alu = std('#d3d8de', 0.95, 0.22);
    const rodMat = std('#a0a7af', 0.9, 0.35);
    for (let i = 0; i < 4; i++) {
      const pg = new THREE.Group();
      pg.position.z = CZ[i];
      const crown = mesh(cyl(0.0405, 0.0405, 0.052, 'y', 28), alu, 0, 0.004, 0);
      pg.add(crown);
      for (const yy of [0.02, 0.009]) pg.add(mesh(cyl(0.0412, 0.0412, 0.003, 'y', 28), std('#5a6068', 0.9, 0.4), 0, yy + 0.004, 0));
      pg.add(mesh(cyl(0.01, 0.01, 0.075, 'z', 14), rodMat, 0, 0, 0));
      g.add(pg);
      A.pist.push(pg);
      const rg = new THREE.Group();
      rg.position.z = CZ[i];
      const rodLen = ICE.rod * mm;
      const beam = mesh(rbox(0.018, rodLen, 0.012, 0.004), rodMat, 0, rodLen / 2, 0);
      rg.add(beam);
      rg.add(mesh(cyl(0.03, 0.03, 0.026, 'z', 24), rodMat, 0, 0, 0));
      rg.add(mesh(cyl(0.014, 0.014, 0.026, 'z', 16), rodMat, 0, rodLen, 0));
      g.add(rg);
      A.rods.push(rg);
    }
  });
  add('head', 'Cylinder head', 'engine', 'Aluminium head, four valves per cylinder. The exhaust manifold is cast into it and feeds the turbo directly.', [0, 0.3, 0], (g) => {
    const m = mesh(rbox(0.25, 0.1, EL, 0.012), shellMat('#b4c0cc', 0.3), 0, DECK + 0.055, EZC);
    edged(m);
    g.add(m);
    // spark plugs
    for (let i = 0; i < 4; i++) g.add(mesh(cyl(0.008, 0.008, 0.07, 'y', 10), std('#d9d4c4', 0.1, 0.6), 0, DECK + 0.1, CZ[i]));
  });
  add('valvetrain', 'Valvetrain & camshafts', 'engine', 'Two overhead camshafts open sixteen valves. The intake side adds Valvetronic lift control, which this model draws as a fixed 9 mm lift.', [0, 0.5, 0], (g) => {
    const valveMat = std('#c8cdd3', 0.95, 0.25);
    const camMat = std('#6e757d', 0.9, 0.35);
    const lobe = (() => {
      const sh = new THREE.Shape();
      for (let i = 0; i <= 72; i++) {
        const a = (i / 72) * TAU - Math.PI;
        const r = 0.011 + 0.009 * Math.exp(-(a * a) / (2 * 0.5 * 0.5));
        const x = r * Math.cos(a);
        const y = r * Math.sin(a);
        i ? sh.lineTo(x, y) : sh.moveTo(x, y);
      }
      const geo = new THREE.ExtrudeGeometry(sh, {depth: 0.012, bevelEnabled: false});
      geo.translate(0, 0, -0.006);
      geo.rotateZ(-Math.PI / 2); // nose points down
      return geo;
    })();
    for (const x of [-0.03, 0.03]) g.add(mesh(cyl(0.008, 0.008, EL - 0.02, 'z', 12), camMat, x, CAMY, EZC));
    for (let i = 0; i < 4; i++) {
      for (const kind of ['in', 'ex']) {
        const x = kind === 'in' ? 0.03 : -0.03;
        for (const dz of [-0.02, 0.02]) {
          const vg = new THREE.Group();
          vg.position.set(x, 0, CZ[i] + dz);
          vg.add(mesh(cyl(0.0034, 0.0034, 0.115, 'y', 8), valveMat, 0, 0.0, 0));
          vg.children[0].position.y = DECK + 0.015 + 0.0575 - 0.0;
          vg.add(mesh(cyl(0.017, 0.012, 0.003, 'y', 20), valveMat, 0, DECK + 0.012, 0));
          vg.add(mesh(cyl(0.0155, 0.0155, 0.012, 'y', 16), std('#8d949c', 0.8, 0.4), 0, CAMY - 0.0185, 0));
          vg.add(mesh(cyl(0.011, 0.011, 0.01, 'y', 10), std('#b35a3a', 0.4, 0.5), 0, DECK + 0.045, 0)); // retainer / spring seat
          g.add(vg);
          const lb = mesh(lobe, camMat, x, CAMY, CZ[i] + dz);
          g.add(lb);
          A.valves.push({vg, kind, cyl: i + 1});
          A.cams.push({lb, kind, cyl: i + 1});
        }
      }
    }
  });
  add('cover', 'Valve cover', 'engine', 'Cast cover over the cams, with the oil filler and the VANOS cam-phasing actuators.', [0, 0.72, 0], (g) => {
    const m = mesh(rbox(0.25, 0.085, EL, 0.014), shellMat('#aab6c2', 0.34), 0, CAMY + 0.035, EZC);
    edged(m);
    g.add(m);
    g.add(mesh(rbox(0.19, 0.012, 0.3, 0.005), std('#2a2d31', 0.4, 0.5), 0, CAMY + 0.082, EZC - 0.02));
    g.add(mesh(cyl(0.02, 0.02, 0.02, 'y', 16), std('#17181a', 0.1, 0.7), 0, CAMY + 0.09, EZ1 - 0.07));
  });
  add('pan', 'Oil pan', 'engine', 'The sump under the crankcase: it catches the oil that lubricates the crank, rods and pistons.', [0, -0.1, 0], (g) => {
    const m = mesh(rbox(0.22, 0.14, EL - 0.05, 0.03), shellMat('#b4bcc4', 0.45), 0, 0.235, EZC);
    edged(m);
    g.add(m);
  });
  add('intake', 'Intake & intercooler', 'engine', 'Charge air passes an intercooler built into the intake manifold, then the throttle.', [0.45, 0.35, 0], (g) => {
    const gl = () => glassy('#59616b', 0.42);
    g.add(edged(mesh(rbox(0.07, 0.08, EL - 0.04, 0.02), gl(), 0.2, DECK + 0.03, EZC)));
    for (let i = 0; i < 4; i++) g.add(mesh(cyl(0.015, 0.015, 0.09, 'x', 12), gl(), 0.145, DECK + 0.03, CZ[i]));
    g.add(mesh(cyl(0.03, 0.03, 0.08, 'z', 20), gl(), 0.2, DECK + 0.03, EZ1 + 0.03));
    g.add(edged(mesh(rbox(0.09, 0.08, 0.24, 0.03), gl(), 0.32, DECK + 0.0, EZC + 0.12)));
  });
  add('turbo', 'Turbocharger', 'engine', 'Twin-scroll turbo on the exhaust side. A turbine wheel can reach roughly 200,000 rpm; here it turns at a fraction of that so you can see it.', [-0.5, 0.3, 0], (g) => {
    const ts = new THREE.Group();
    ts.position.set(-0.2, DECK - 0.1, 1.38);
    const hot = std('#6a5f58', 0.7, 0.55);
    const turb = mesh(cyl(0.06, 0.05, 0.07, 'z', 28), glassy('#c8b8aa', 0.5), 0, 0, -0.05);
    ts.add(turb);
    const comp = mesh(cyl(0.05, 0.062, 0.065, 'z', 28), glassy('#c3ccd4', 0.5), 0, 0, 0.065);
    ts.add(comp);
    ts.add(mesh(cyl(0.012, 0.012, 0.12, 'z', 12), std('#d8dce0', 0.9, 0.25), 0, 0, 0));
    const wh = new THREE.Group();
    wh.position.z = -0.05;
    for (let i = 0; i < 11; i++) {
      const b = mesh(rbox(0.004, 0.044, 0.026, 0.001), std('#d8dce0', 0.95, 0.25), 0, 0, 0);
      b.geometry.translate(0, 0.026, 0);
      b.rotation.z = (i / 11) * TAU;
      wh.add(b);
    }
    ts.add(wh);
    const wc = new THREE.Group();
    wc.position.z = 0.065;
    for (let i = 0; i < 9; i++) {
      const b = mesh(rbox(0.004, 0.04, 0.03, 0.001), std('#aeb5bc', 0.95, 0.3), 0, 0, 0);
      b.geometry.translate(0, 0.024, 0);
      b.rotation.z = (i / 9) * TAU;
      wc.add(b);
    }
    ts.add(wc);
    ts.add(mesh(cyl(0.02, 0.02, 0.08, 'x', 14), hot, 0.055, 0.0, -0.05));
    g.add(ts);
    A.turboT = wh;
    A.turboC = wc;
  });
  add('cooling', 'Cooling pack & crash beam', 'engine', 'Radiator and fan behind the grille, with the crash beam in front of them.', [0, 0, 0.85], (g) => {
    const m = mesh(rbox(0.66, 0.44, 0.06, 0.01), std('#30343a', 0.5, 0.6), 0, 0.52, 2.0);
    g.add(m);
    for (let i = 0; i < 9; i++) g.add(mesh(rbox(0.64, 0.006, 0.07, 0.002), std('#6c737b', 0.8, 0.4), 0, 0.34 + i * 0.045, 2.0));
    g.add(mesh(cyl(0.17, 0.17, 0.03, 'z', 32), std('#1b1d20', 0.2, 0.7), 0, 0.52, 1.95));
    g.add(mesh(rbox(1.0, 0.09, 0.06, 0.02), std('#8a9199', 0.8, 0.4), 0, 0.44, 2.07));
  });

  // ============================================================ eDrive: motor, clutch K0, converter, gearbox
  A.rotor = new THREE.Group();
  A.rotor.position.set(0, Y0, 0);
  add('stator', 'Electric machine · stator', 'edrive', 'Electric machine on the crank axis, modelled at about 65 kW and 250 N·m (approximate). The stator is the fixed ring of copper windings.', [0, 0.4, 0], (g) => {
    const st = new THREE.Group();
    st.position.set(0, Y0, 1.17);
    const iron = mesh(cyl(0.17, 0.17, 0.14, 'z', 48, true), glassy('#6b737c', 0.35));
    const inner = mesh(cyl(0.125, 0.125, 0.14, 'z', 48, true), glassy('#6b737c', 0.35));
    st.add(iron, inner);
    const cap = (zz) => {
      const rg = new THREE.RingGeometry(0.125, 0.17, 48);
      const m = mesh(rg, glassy('#6b737c', 0.35), 0, 0, zz);
      st.add(m);
    };
    cap(0.07);
    cap(-0.07);
    const cu = std(C.copper, 0.8, 0.35);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      const m = mesh(rbox(0.026, 0.03, 0.17, 0.008), cu, Math.cos(a) * 0.147, Math.sin(a) * 0.147, 0);
      m.rotation.z = a;
      st.add(m);
    }
    g.add(st);
  });
  add('rotor', 'Electric machine · rotor', 'edrive', 'The rotor carries the magnets and turns with the transmission input. With the engine off it is the only thing driving the car.', [0, 0.25, -0.2], (g) => {
    A.rotor.clear();
    A.rotor.position.set(0, Y0, 1.17);
    A.rotor.add(mesh(cyl(0.118, 0.118, 0.13, 'z', 40, true), std('#7b838c', 0.8, 0.4, {side: THREE.DoubleSide})));
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const m = mesh(rbox(0.04, 0.012, 0.12, 0.004), std(i % 2 ? '#c8352f' : '#2c6fd6', 0.5, 0.4), Math.cos(a) * 0.121, Math.sin(a) * 0.121, 0);
      m.rotation.z = a - Math.PI / 2;
      A.rotor.add(m);
    }
    A.rotor.add(mesh(new THREE.RingGeometry(0.07, 0.118, 40), std('#7b838c', 0.8, 0.4, {side: THREE.DoubleSide}), 0, 0, 0.065));
    g.add(A.rotor);
  });
  add('k0', 'Clutch K0', 'edrive', 'Wet clutch that joins the engine to the electric machine. Open: the car is electric and the engine stands still. Closed: engine and motor drive together.', [0, 0.1, 0.6], (g) => {
    const k = new THREE.Group();
    k.position.set(0, Y0, 1.17);
    A.k0Fix = new THREE.Group();
    A.k0Mov = new THREE.Group();
    const plate = (c) => mesh(cyl(0.08, 0.08, 0.008, 'z', 32), std(c, 0.7, 0.45));
    for (let i = 0; i < 3; i++) {
      const p = plate('#b9a58c');
      p.position.z = -0.02 + i * 0.02;
      (i % 2 ? A.k0Mov : A.k0Fix).add(p);
    }
    A.k0Fix.add(mesh(cyl(0.085, 0.085, 0.006, 'z', 32), std('#4a4f56', 0.7, 0.4), 0, 0, -0.05));
    A.k0Mov.add(mesh(cyl(0.02, 0.02, 0.1, 'z', 16), std('#c9ced3', 0.9, 0.3), 0, 0, 0.0));
    k.add(A.k0Fix, A.k0Mov);
    g.add(k);
  });
  add('converter', 'Torque converter', 'edrive', 'Fluid coupling between the e-machine and the gearbox, drawn simplified. Pump and turbine turn at different speeds when pulling away.', [0, 0.25, 0.4], (g) => {
    const c = new THREE.Group();
    c.position.set(0, Y0, 1.04);
    c.add(mesh(lathe([[0.05, 0.05], [0.12, 0.047], [0.165, 0.02], [0.17, 0], [0.165, -0.02], [0.12, -0.045], [0.05, -0.05]], 'z', 48), glassy('#b9c6d3', 0.3)));
    A.pump = new THREE.Group();
    A.turb = new THREE.Group();
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU;
      const f = mesh(rbox(0.004, 0.09, 0.034, 0.001), std('#d3d8de', 0.8, 0.3), 0, 0, 0.02);
      f.geometry.translate(0, 0.1, 0);
      f.rotation.z = a;
      A.pump.add(f);
      const f2 = mesh(rbox(0.004, 0.08, 0.034, 0.001), std(C.accent, 0.5, 0.4), 0, 0, -0.02);
      f2.geometry.translate(0, 0.095, 0);
      f2.rotation.z = a + 0.1;
      A.turb.add(f2);
    }
    c.add(A.pump, A.turb);
    g.add(c);
  });
  A.sets = [];
  A.els = [];
  add('gearbox', 'ZF 8-speed automatic', 'edrive', 'Eight forward gears from four planetary sets and five shift elements (brakes A, B; clutches C, D, E). Any gear uses three; a shift swaps one.', [0, 0.38, -0.3], (g) => {
    const gb = new THREE.Group();
    gb.position.set(0, Y0, 0);
    g.add(gb);
    gb.add(mesh(lathe([[0.001, 0.98], [0.14, 0.97], [0.15, 0.9], [0.15, 0.65], [0.125, 0.5], [0.1, 0.4], [0.07, 0.33], [0.001, 0.32]], 'z', 40), glassy('#aab7c3', 0.26)));
    const gearMat = std('#a2a9b1', 0.85, 0.35);
    const plMat = std('#cdd2d8', 0.85, 0.3);
    const sunG = gearGeo(ZS, ZS * MOD / 2, 0.04, 0.012);
    const plG = gearGeo(ZP, ZP * MOD / 2, 0.04, 0.006);
    const ringG = gearGeo(ZR, ZR * MOD / 2, 0.04, 0, 0.07, true);
    SET_Z.forEach((z) => {
      const set = {z};
      set.sun = mesh(sunG, gearMat, 0, 0, z);
      set.ring = mesh(ringG, std('#8d959d', 0.85, 0.4), 0, 0, z);
      set.car = new THREE.Group();
      set.car.position.z = z;
      set.carDisc = mesh(cyl(0.083, 0.083, 0.008, 'z', 32), std('#6f767e', 0.8, 0.4), 0, 0, 0.025);
      set.car.add(set.carDisc);
      set.planets = [0, 1, 2].map((k) => {
        const a = (k / 3) * TAU;
        const p = mesh(plG, plMat, Math.cos(a) * (ZS + ZP) * MOD / 2, Math.sin(a) * (ZS + ZP) * MOD / 2, 0);
        set.car.add(p);
        return p;
      });
      const pin = new THREE.Group();
      set.pin = pin;
      gb.add(set.sun, set.ring, set.car);
      A.sets.push(set);
    });
    // input shaft and output shaft
    gb.add(mesh(cyl(0.014, 0.014, 0.68, 'z', 12), std('#c9ced3', 0.9, 0.3), 0, 0, 0.64));
    A.outShaft = new THREE.Group();
    A.outShaft.add(mesh(cyl(0.026, 0.026, 0.16, 'z', 20), std('#c9ced3', 0.9, 0.3), 0, 0, 0.36));
    A.outShaft.add(mesh(cyl(0.05, 0.05, 0.012, 'z', 24), std('#8a9199', 0.8, 0.4), 0, 0, 0.29));
    gb.add(A.outShaft);
    // shift elements: the discs light up when engaged
    EL_Z.forEach((z, i) => {
      const m = mesh(cyl(0.131, 0.131, 0.014, 'z', 40), new THREE.MeshStandardMaterial({color: '#777f88', metalness: 0.6, roughness: 0.5, emissive: '#000000'}), 0, 0, z);
      gb.add(m);
      A.els.push(m);
    });
  });

  // ============================================================ high voltage
  const orange = () => new THREE.MeshStandardMaterial({color: C.hv, metalness: 0.2, roughness: 0.45});
  A.mods = [];
  add('pack', 'HV battery pack', 'hv', 'Lithium-ion, 7.6 kWh gross, 5.7 kWh usable, about 293 V nominal, under the boot floor. The glow is the charge; the eight-module layout is illustrative.', [0, 0.75, -0.4], (g) => {
    const tray = mesh(rbox(0.9, 0.04, 0.74, 0.01), glassy('#9aa7b4', 0.36), 0, 0.5, -1.7);
    g.add(edged(tray));
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 2; c++) {
        const x = (c - 0.5) * 0.4;
        const z = -1.7 + (r - 1.5) * 0.17;
        const box = mesh(rbox(0.38, 0.095, 0.155, 0.01), glassy('#ced6de', 0.32), x, 0.575, z);
        edged(box);
        g.add(box);
        const bar = mesh(new THREE.BoxGeometry(0.34, 1, 0.12), new THREE.MeshBasicMaterial({color: '#39d98a'}), x, 0.53, z);
        g.add(bar);
        A.mods.push(bar);
      }
    }
    g.add(mesh(rbox(0.9, 0.012, 0.74, 0.005), glassy('#9aa7b4', 0.3), 0, 0.64, -1.7));
  });
  add('eme', 'Power electronics & charger', 'hv', 'The inverter turns the pack\'s direct current into three-phase current for the motor, and back when recuperating. Charger and 12 V converter are drawn with it; their real positions are simplified.', [-0.5, 0.5, 0], (g) => {
    const m = mesh(rbox(0.24, 0.15, 0.34, 0.015), std('#8f969d', 0.8, 0.4), -0.42, 0.65, 1.12);
    g.add(m);
    g.add(mesh(rbox(0.245, 0.03, 0.345, 0.01), orange(), -0.42, 0.74, 1.12));
    for (let i = 0; i < 6; i++) g.add(mesh(rbox(0.22, 0.006, 0.012, 0.002), std('#5b626a', 0.8, 0.4), -0.42, 0.71, 0.99 + i * 0.05));
  });
  add('port', 'Charge port', 'hv', 'Plugged in, the charger fills the pack at up to 3.7 kW: about three hours from empty on a domestic socket.', [0.55, 0.0, 0.25], (g) => {
    const flap = mesh(cyl(0.05, 0.05, 0.012, 'x', 24), std('#f3f4f5', 0.0, 0.3), 0.915, 0.72, 1.12);
    g.add(flap);
    g.add(mesh(cyl(0.036, 0.036, 0.02, 'x', 24), std('#16181b', 0.2, 0.6), 0.905, 0.72, 1.12));
    A.led = mesh(new THREE.SphereGeometry(0.008, 10, 8), glow('#39d98a'), 0.92, 0.77, 1.12);
    g.add(A.led);
  });
  // cables: battery to power electronics, power electronics to stator, inlet to charger
  const cables = [
    {id: 'bat', pts: [[0.2, 0.58, -1.45], [0.4, 0.3, -1.3], [0.45, 0.27, -0.5], [0.45, 0.27, 0.8], [0.36, 0.34, 1.0], [0.1, 0.55, 1.05], [-0.3, 0.64, 1.1]]},
    {id: 'mot', pts: [[-0.42, 0.62, 1.04], [-0.22, 0.52, 1.1], [-0.1, 0.36, 1.17]]},
    {id: 'chg', pts: [[0.9, 0.72, 1.12], [0.7, 0.72, 1.12], [0.3, 0.72, 1.14], [-0.3, 0.7, 1.16]]},
  ];
  A.cables = [];
  add('cables', 'HV cables', 'hv', 'Orange cables mark everything above 60 V. The beads show energy moving: out of the pack when driving, back in when braking or charging.', [0, 0.1, 0], (g) => {
    for (const c of cables) {
      const t = tube(c.pts, 0.012, orange(), 80, 10);
      g.add(t);
      const N = 16;
      const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.013, 10, 8), new THREE.MeshBasicMaterial({color: '#ffe6a8'}), N);
      beads.frustumCulled = false;
      g.add(beads);
      A.cables.push({id: c.id, curve: t.curve, beads, N, u: 0});
    }
  });

  // ============================================================ fuel and exhaust
  add('tank', 'Fuel tank · 41 L', 'fuel', '41 litres, drawn under the rear seat and split around the tunnel (simplified). The amber level drops as the engine burns fuel.', [0, -0.0, -0.5], (g) => {
    for (const s of [-1, 1]) {
      const m = mesh(rbox(0.32, 0.15, 0.66, 0.04), glassy('#cbd3da', 0.3), s * 0.3, 0.3, -0.72);
      edged(m);
      g.add(m);
    }
    g.add(mesh(rbox(0.3, 0.08, 0.2, 0.03), glassy('#cbd3da', 0.3), 0, 0.26, -0.72));
    A.fuelLvl = [];
    for (const s of [-1, 1]) {
      const f = mesh(new THREE.BoxGeometry(0.29, 1, 0.62), new THREE.MeshBasicMaterial({color: C.fuel, transparent: true, opacity: 0.75}), s * 0.3, 0.25, -0.72);
      g.add(f);
      A.fuelLvl.push(f);
    }
  });
  add('exhaust', 'Exhaust system', 'fuel', 'Turbine outlet, catalytic converter, silencer and tailpipes (routing simplified). With the engine off nothing flows through it.', [-0.9, 0.0, 0.0], (g) => {
    const pipe = std('#9aa0a6', 0.9, 0.35);
    g.add(tube([[-0.2, 0.52, 1.28], [-0.2, 0.4, 1.18], [-0.17, 0.29, 1.02], [-0.15, 0.27, 0.98]], 0.028, pipe, 24, 12));
    g.add(mesh(cyl(0.056, 0.056, 0.32, 'z', 28), glassy('#c9b8a6', 0.5), -0.15, 0.27, 0.8));
    g.add(mesh(cyl(0.04, 0.04, 0.3, 'z', 20), std('#c78a3f', 0.6, 0.5), -0.15, 0.27, 0.8));
    g.add(tube([[-0.15, 0.27, 0.62], [-0.12, 0.24, 0.1], [-0.1, 0.235, -1.2], [-0.1, 0.27, -1.55], [-0.1, 0.3, -1.68]], 0.026, pipe, 60, 12));
    g.add(edged(mesh(rbox(0.7, 0.17, 0.4, 0.05), glassy('#c6ccd2', 0.4), 0, 0.31, -1.86)));
    for (const s of [-1, 1]) {
      g.add(tube([[s * 0.24, 0.33, -2.0], [s * 0.4, 0.36, -2.2], [s * 0.4, 0.37, -2.33]], 0.026, pipe, 20, 12));
      g.add(mesh(cyl(0.036, 0.036, 0.07, 'z', 28, true), std('#e4e8ec', 0.98, 0.12, {side: THREE.DoubleSide}), s * 0.4, 0.37, -2.34));
    }
  });

  // ============================================================ driveline
  add('prop', 'Propshaft', 'driveline', 'Carries the gearbox output rearwards. At 100 km/h in 8th gear it turns at about 2,500 rpm while the engine turns at about 1,700.', [0, 0.35, -0.2], (g) => {
    const sh = new THREE.Group();
    sh.position.set(0, PROP_Y, 0);
    sh.add(mesh(cyl(0.036, 0.036, 1.6, 'z', 24), std('#6d747c', 0.8, 0.45), 0, 0, -0.52));
    for (let i = 0; i < 6; i++) sh.add(mesh(rbox(0.012, 0.074, 0.05, 0.003), std('#c7ccd2', 0.9, 0.3), 0, 0, -0.1 - i * 0.2).clone());
    sh.add(mesh(new THREE.SphereGeometry(0.05, 20, 14), std('#8a9199', 0.8, 0.4), 0, 0, 0.29));
    sh.add(mesh(new THREE.SphereGeometry(0.05, 20, 14), std('#8a9199', 0.8, 0.4), 0, 0, -1.3));
    g.add(sh);
    A.prop = sh;
  });
  add('diff', 'Rear differential', 'driveline', 'Final drive about 3.15, drawn as a 13-tooth pinion on a 41-tooth ring gear. It turns the drive through 90° and a differential splits the torque between the rear wheels.', [0, 0.25, -0.6], (g) => {
    const hous = mesh(rbox(0.3, 0.26, 0.3, 0.07), glassy('#b9c3cd', 0.3), 0.02, 0.33, -1.4);
    edged(hous);
    g.add(hous);
    const ring = new THREE.Group();
    ring.position.set(0, 0.33, -1.405);
    ring.add(mesh(cyl(0.11, 0.11, 0.016, 'x', 48), std('#8d959d', 0.9, 0.35), 0.0, 0, 0));
    const tooth = new THREE.BoxGeometry(0.02, 0.012, 0.012);
    for (let i = 0; i < CAR.ringTeeth; i++) {
      const a = (i / CAR.ringTeeth) * TAU;
      const t = mesh(tooth, std('#c8cdd3', 0.95, 0.25), 0.015, Math.cos(a) * 0.1, Math.sin(a) * 0.1);
      t.rotation.x = -a + Math.PI / 2;
      t.rotation.order = 'XYZ';
      ring.add(t);
    }
    ring.add(mesh(cyl(0.05, 0.05, 0.14, 'x', 24), std('#6d747c', 0.8, 0.4), 0, 0, 0));
    g.add(ring);
    A.ring = ring;
    const pin = new THREE.Group();
    pin.position.set(0.038, 0.33, -1.405 + 0.06);
    pin.add(mesh(cyl(0.028, 0.028, 0.12, 'z', 20), std('#aab1b9', 0.9, 0.3), 0, 0, 0.0));
    const pt = new THREE.BoxGeometry(0.008, 0.012, 0.045);
    for (let i = 0; i < CAR.pinionTeeth; i++) {
      const a = (i / CAR.pinionTeeth) * TAU;
      const t = mesh(pt, std('#d6dade', 0.95, 0.25), Math.cos(a) * 0.032, Math.sin(a) * 0.032, 0);
      t.rotation.z = a;
      pin.add(t);
    }
    pin.add(mesh(cyl(0.02, 0.02, 0.2, 'z', 16), std('#aab1b9', 0.9, 0.3), 0, 0, 0.16));
    g.add(pin);
    A.pinion = pin;
  });
  A.halfs = [];
  add('halfshafts', 'Halfshafts', 'driveline', 'Two shafts with constant-velocity joints carry the torque to the rear hubs, turning at wheel speed.', [0, 0.0, -0.45], (g) => {
    for (const s of [-1, 1]) {
      const h = new THREE.Group();
      h.position.set(0, 0.33, -1.405);
      h.add(mesh(cyl(0.017, 0.017, 0.7, 'x', 14), std('#aab1b9', 0.9, 0.3), s * 0.42, 0, 0));
      h.add(mesh(cyl(0.04, 0.03, 0.06, 'x', 20), std('#2b2f35', 0.3, 0.6), s * 0.2, 0, 0));
      h.add(mesh(cyl(0.04, 0.03, 0.06, 'x', 20), std('#2b2f35', 0.3, 0.6), s * 0.64, 0, 0));
      h.add(mesh(rbox(0.02, 0.05, 0.012, 0.003), std('#c7ccd2', 0.9, 0.3), s * 0.42, 0.0, 0));
      g.add(h);
      A.halfs.push(h);
    }
  });

  addBodyDetails(parts, body, paintMat);
  A.led = parts.find((p) => p.id === 'port').obj.userData.led;

  // ============================================================ finish: materials per part, centres, picking
  const pickables = [];
  for (const p of parts) {
    p.mats = [];
    p.obj.traverse((n) => {
      if (n.material) {
        const clone = (m) => {
          const c = m.clone();
          p.mats.push({m: c, o: c.opacity, t: c.transparent, dw: c.depthWrite, env: c.envMapIntensity ?? 1, e: c.emissive ? c.emissive.clone() : null, ei: c.emissiveIntensity ?? 0});
          return c;
        };
        n.material = Array.isArray(n.material) ? n.material.map(clone) : clone(n.material);
      }
      if (n.isMesh) {
        n.userData.part = p;
        pickables.push(n);
        n.geometry.computeBoundingSphere();
        // small parts (valves, teeth, beads) add draw calls to the shadow pass and no visible shadow
        if (n.geometry.boundingSphere.radius * Math.max(n.scale.x, n.scale.y, n.scale.z) < 0.045) {
          n.userData.small = true;
          n.castShadow = false;
        }
      }
    });
    p.shadowOn = true;
  }
  root.updateMatrixWorld(true);
  for (const p of parts) {
    const b = new THREE.Box3().setFromObject(p.obj);
    p.center = b.getCenter(new V3());
    p.size = b.getSize(new V3());
    p.anchor = p.center.clone();
  }
  const byId = Object.fromEntries(parts.map((p) => [p.id, p]));
  // live fills must not take part in shading as bright beads: leave as is

  // ============================================================ per-frame animation
  const S = {wheel: 0, rotor: 0, shaft: 0, crank: 0, turbo: 0, beadsT: 0};
  const tmpC = new THREE.Color();
  const mtx = new THREE.Matrix4();
  const rpmRad = Math.PI / 30;
  const update = (o, dt, pb) => {
    S.wheel += o.wheelRpm * rpmRad * dt * pb;
    S.shaft += o.shaftRpm * rpmRad * dt * pb;
    const rotorRpm = o.k0 > 0.5 ? o.rpm : o.shaftRpm;
    S.rotor += rotorRpm * rpmRad * dt * pb;
    S.crank += o.rpm * rpmRad * dt * pb;
    S.turbo += (0.4 + o.turbo * 6) * dt * 3 * (o.engOn ? 1 : 0.2);

    // wheels, brakes, driveline
    for (const w of A.wheels) {
      w.spin.rotation.x = S.wheel;
      if (w.disc) w.disc.rotation.x = S.wheel;
      if (w.cal) {
        const m = w.cal.material;
        if (m.emissive) {
          m.emissive.set('#ff4a1a');
          m.emissiveIntensity = o.brake * 1.2 + (o.regen ? 0 : 0);
        }
      }
    }
    for (const h of A.halfs) h.rotation.x = S.wheel;
    A.ring.rotation.x = S.wheel;
    A.pinion.rotation.z = S.wheel * CAR.final;
    A.prop.rotation.z = S.wheel * CAR.final;
    A.outShaft.rotation.z = S.wheel * CAR.final;

    // electric machine, clutch K0, converter
    A.rotor.rotation.z = S.rotor;
    A.pump.rotation.z = S.rotor;
    A.turb.rotation.z = S.shaft;
    A.k0Mov.position.z = (1 - o.k0) * 0.022;
    A.k0Fix.rotation.z = S.crank;
    A.k0Mov.rotation.z = S.rotor;

    // gearbox: four planetary sets, kinematically consistent (sun, carrier, ring and planets mesh); the shift elements
    const inA = S.shaft;
    const outA = S.wheel * CAR.final;
    const mix = [[1, 0.5, 0.5], [0.55, 0.45, 0.4], [0.3, 0.7, 0.2], [0, 1, 0.1]]; // [sun weight on input, carrier weight on input, spare]
    A.sets.forEach((s, i) => {
      const [ws, wc] = mix[i];
      const angS = inA * ws + outA * (1 - ws);
      const angC = inA * (wc * 0.5) + outA * (1 - wc * 0.5);
      s.sun.rotation.z = angS;
      s.car.rotation.z = angC;
      const angR = (angC * (ZS + ZR) - angS * ZS) / ZR;
      s.ring.rotation.z = angR;
      const rel = (-(angS - angC) * ZS) / ZP;
      for (const p of s.planets) p.rotation.z = rel;
    });
    A.els.forEach((m, i) => {
      const on = o.elements[i];
      m.material.color.set(on ? C.accent : '#777f88');
      m.material.emissive.set(on ? C.accent : '#000000');
      m.material.emissiveIntensity = on ? 0.55 : 0;
    });

    // the engine, from the crank angle
    const th = S.crank;
    A.crank.rotation.z = -th;
    for (let i = 0; i < 4; i++) {
      const c = i + 1;
      const [px, py] = crankPin(c, th);
      const pinY = pinHeight(c, th) * mm;
      A.pist[i].position.y = Y0 + pinY;
      const rg = A.rods[i];
      rg.position.set(px * mm, Y0 + py * mm, CZ[i]);
      const dx = 0 - px * mm;
      const dy = pinY - py * mm;
      rg.rotation.z = Math.atan2(-dx, dy);
      // charge in the cylinder
      const ps = phase(c, th);
      const f = A.fills[i];
      const crownY = Y0 + pinY + CROWN;
      const h = Math.max(0.004, DECK + 0.012 - crownY);
      f.scale.y = h;
      f.position.y = crownY + h / 2;
      const st = strokeOf(ps);
      const m = f.material;
      if (!o.engOn && o.rpm < 30) {
        m.color.set('#bcd3ea');
        m.opacity = 0.12;
      } else if (st === 'POWER') {
        const k = clamp(ps / 150, 0, 1);
        m.color.set(tmpC.set('#ffd27a').lerp(new THREE.Color('#e8531f'), k));
        m.opacity = lerp(0.95, 0.45, k);
      } else if (st === 'EXHAUST') {
        m.color.set('#9aa0a6');
        m.opacity = 0.42;
      } else if (st === 'INTAKE') {
        m.color.set('#6fb0ff');
        m.opacity = 0.3;
      } else {
        const k = (ps - 540) / 180;
        m.color.set(tmpC.set('#a9d0ff').lerp(new THREE.Color('#ffd166'), k));
        m.opacity = lerp(0.32, 0.6, k);
      }
    }
    for (const v of A.valves) {
      const ps = phase(v.cyl, th);
      const lift = v.kind === 'in' ? liftIn(ps) : liftEx(ps);
      v.vg.position.y = -lift * 0.009;
    }
    for (const cm of A.cams) {
      const ps = phase(cm.cyl, th);
      const mid = cm.kind === 'in' ? 460 : 260;
      cm.lb.rotation.z = ((ps - mid) / 2) * D2R;
    }
    A.turboT.rotation.z = S.turbo;
    A.turboC.rotation.z = S.turbo;

    // pack charge, fuel, plug light
    const soc = o.soc;
    for (const b of A.mods) {
      b.scale.y = Math.max(0.001, soc * 0.088);
      b.position.y = 0.53 + (soc * 0.088) / 2;
      b.material.color.set(soc > 0.5 ? tmpC.set('#e5c64a').lerp(new THREE.Color('#39d98a'), (soc - 0.5) * 2) : tmpC.set('#e5503a').lerp(new THREE.Color('#e5c64a'), soc * 2));
    }
    const lvl = clamp(0.62 - o.fuelL / FUEL.tank, 0.02, 1);
    for (const f of A.fuelLvl) {
      f.scale.y = lvl * 0.12;
      f.position.y = 0.245 + (lvl * 0.12) / 2;
    }
    A.led.material.color.set(o.plugged ? '#39d98a' : '#dfe6ee');

    // energy along the cables: + moves from the pack towards the motor
    const flows = {bat: o.Pbat, mot: o.Pm / 0.92, chg: -o.Pcharge};
    S.beadsT += dt;
    for (const c of A.cables) {
      const P = c.id === 'chg' ? o.Pcharge : flows[c.id];
      const dir = c.id === 'chg' ? 1 : Math.sign(P);
      const mag = Math.abs(P);
      c.u = (c.u + dir * (0.03 + 0.16 * Math.min(1, mag / 60000)) * dt + 1) % 1;
      const on = mag > 150;
      for (let i = 0; i < c.N; i++) {
        const p = c.curve.getPointAt((c.u + i / c.N) % 1);
        mtx.makeTranslation(p.x, p.y, p.z);
        mtx.scale(new V3(on ? 1 : 0.0001, on ? 1 : 0.0001, on ? 1 : 0.0001));
        // scale applied after translation would move it: compose explicitly
        const sc = on ? 1 : 0.0001;
        mtx.compose(p, new THREE.Quaternion(), new V3(sc, sc, sc));
        c.beads.setMatrixAt(i, mtx);
      }
      c.beads.instanceMatrix.needsUpdate = true;
    }
  };

  // a film sets the running angles for its frame outright instead of integrating them, then calls update(o, 0, pb)
  const seek = (a) => {
    Object.assign(S, a);
    if (a.beads !== undefined) for (const c of A.cables) c.u = ((a.beads * (c.id === 'mot' ? 1.3 : 1)) % 1 + 1) % 1;
  };

  // ============================================================ per-frame look: explode, fade, highlight
  const look = (dt, L) => {
    const kf = 1 - Math.exp(-dt / 0.2);
    const selSys = L.selected ? byId[L.selected].system : null;
    for (const p of parts) {
      const k = Math.max(L.explode, p.pull);
      p.obj.position.copy(p.ex).multiplyScalar(k);
      const bodyFade = L.bodyMode === 'solid' ? 1 : L.bodyMode === 'ghost' ? 0.12 : 0;
      let f = 1;
      if (L.hidden.has(p.system)) f = 0;
      else {
        if (L.isolate && p.system !== L.isolate) f = p.system === 'body' ? 0 : 0.035;
        if (p.system === 'body') f = Math.min(f, bodyFade);
        if (selSys && selSys !== 'body' && p.id !== L.selected) f = Math.min(f, p.system === 'body' ? f : 0.3);
        if (L.selected === p.id) f = Math.min(1, Math.max(f, p.system === 'body' ? bodyFade : 1));
      }
      p.fade += (f - p.fade) * kf;
      const hlT = L.selected === p.id ? 1 : L.hover === p.id ? 0.55 : 0;
      p.hl += (hlT - p.hl) * kf;
      const vis = p.fade > 0.012;
      p.obj.visible = vis;
      if (!vis) continue;
      const solid = p.fade > 0.97;
      for (const r of p.mats) {
        const m = r.m;
        m.opacity = r.o * p.fade;
        const tr = r.t || !solid;
        if (m.transparent !== tr) {
          m.transparent = tr;
          m.needsUpdate = true;
        }
        m.depthWrite = r.dw && p.fade > 0.55;
        if (m.envMapIntensity !== undefined) m.envMapIntensity = r.env * Math.sqrt(p.fade);
        if (r.e && p.mats.length && m.emissive && !m.userData.keepEmissive && !r.m.isMeshBasicMaterial) {
          if (p.id !== 'gearbox' || !r.m.userData.el) {
            if (p.hl > 0.01) {
              m.emissive.set(C.accent);
              m.emissiveIntensity = p.hl * 0.35;
            } else if (m.emissiveIntensity !== r.ei && !(p.id === 'gearbox' || p.id === 'brakeFL' || p.id.startsWith('brake'))) {
              m.emissive.copy(r.e);
              m.emissiveIntensity = r.ei;
            }
          }
        }
      }
      const sh = p.fade > 0.5;
      if (sh !== p.shadowOn) {
        p.shadowOn = sh;
        p.obj.traverse((n) => {
          if (n.isMesh) n.castShadow = sh && !n.userData.small;
        });
      }
    }
  };

  // where a part is right now (its centre plus the current explode offset)
  const anchorOf = (p, out = new V3()) => out.copy(p.center).add(p.obj.position);

  return {root, parts, byId, pickables, update, look, seek, anchorOf, SYSTEMS, A};
}
