// The Cessna 172S Skyhawk in real numbers. Geometry, gauges and part cards all read from here, so a number on screen
// cannot disagree with the model. Metres, radians. x to starboard, y up, z toward the nose, z = 0 at the firewall.

const D2R = Math.PI / 180;

export const ENGINE = {
  model: 'Lycoming IO-360-L2A',
  cylinders: 4,
  bore: 0.1302, // 5.125 in
  stroke: 0.1111, // 4.375 in
  hp: 180,
  rpmMax: 2700,
  firing: [1, 3, 2, 4], // odd cylinders on the right, 1 and 2 forward
};
/** swept volume in litres, from bore and stroke */
export const displacement = () => ((ENGINE.cylinders * Math.PI * ENGINE.bore ** 2 * ENGINE.stroke) / 4) * 1000;
/** a fixed-pitch propeller absorbs power with the cube of rpm */
export const powerAt = (rpm) => ENGINE.hp * (rpm / ENGINE.rpmMax) ** 3;

export const PROP = {dia: 1.93, hubZ: 1.215, axisY: 1.22, rootR: 0.1};
export const tipSpeed = (rpm) => (Math.PI * PROP.dia * rpm) / 60; // m/s, static
export const SOUND = 340.3;

// control travel, 172S limits
export const TRAVEL = {
  aileronUp: 20 * D2R,
  aileronDown: 15 * D2R,
  elevatorUp: 28 * D2R,
  elevatorDown: 23 * D2R,
  rudder: 16 * D2R,
  flaps: [0, 10, 20, 30],
};

// the wing, right half: straight leading edge, constant chord to the strut, then tapering
export const WING = {
  semi: 5.5,
  rootChord: 1.63,
  tipChord: 1.13,
  taperFrom: 2.3,
  zLE: 0.1,
  y0: 1.88, // underside at the root
  dihedral: 1.5 * D2R,
  hinge: 0.7, // flaps and ailerons hinge at 70% chord
  flap: [0.62, 2.93],
  aileron: [3.05, 5.15],
};
export const chordAt = (s) => (s <= WING.taperFrom ? WING.rootChord : WING.rootChord + ((WING.tipChord - WING.rootChord) * (s - WING.taperFrom)) / (WING.semi - WING.taperFrom));
/** planform area of both wings, m² (the wing carries across the cabin top) */
export const wingArea = () => {
  let a = 0;
  const n = 400;
  for (let i = 0; i < n; i++) a += chordAt(((i + 0.5) / n) * WING.semi) * (WING.semi / n);
  return 2 * a;
};

export const TAIL = {span: 3.45, hingeZ: -6.3, teZ: -6.74, leRoot: -5.55, leTip: -5.98, y: 1.14};

export const WHEELS = {main: {r: 0.197, w: 0.15, x: 1.27, z: -0.85, tyre: '6.00-6'}, nose: {r: 0.15, w: 0.12, z: 0.82, tyre: '5.00-5'}};

export const FACTS = {
  name: 'Cessna 172S Skyhawk',
  span: 11.0,
  length: 8.28,
  height: 2.72,
  wingAreaPublished: 16.2,
  seats: 4,
  mtow: 1157,
  fuelGal: 56,
};
