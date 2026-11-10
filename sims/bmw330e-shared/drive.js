// BMW 330e (F30 LCI, 2017) powertrain model. No three.js in here: real numbers in real units, one input
// (target road speed + drive mode) and every pose and readout is a function of the state this integrates.
//
// Numbers marked [bmw] come from BMW's technical data sheet for the 2016-18 330e; [typ] are typical for the part
// (ZF 8HP gear set, B48 con-rod length ...) and are not BMW-published for this exact car.
export const CAR = {
  mass: 1725, // kg, ready to drive, ≈
  wheelR: 0.33, // m, 225/45 R18 rolling radius
  wheelbase: 2.81, // m [bmw]
  track: 1.55, // m, ≈
  cdA: 0.27 * 2.17, // drag coefficient × frontal area, m²
  crr: 0.0095,
  // ZF 8HP45-style ratios [typ]; final drive 41/13 = 3.154 (ring / pinion teeth)
  gears: [4.714, 3.143, 2.106, 1.667, 1.285, 1.0, 0.839, 0.667],
  ringTeeth: 41,
  pinionTeeth: 13,
  driveEff: 0.93,
};
CAR.final = CAR.ringTeeth / CAR.pinionTeeth;

// B48 2.0 L turbo four [bmw: bore, stroke, 135 kW, 290 N·m]
export const ICE = {
  bore: 82.0,
  stroke: 94.6,
  rod: 144, // mm [typ]
  cr: 11.0,
  idle: 750,
  redline: 6500,
  peakT: 290,
  peakP: 135000,
  order: [1, 3, 4, 2],
  fireAt: {1: 0, 3: 180, 4: 360, 2: 540}, // degrees of crank after cylinder 1 fires
  // crank pins: 1 and 4 up together, 2 and 3 half a turn later (flat-plane four)
  pin: {1: 0, 2: 180, 3: 180, 4: 0},
  lhv: 43e6, // J/kg
  rho: 0.745, // kg/L
};
// the electric machine sits on the crank axis between the engine and the torque converter, behind clutch K0
export const EM = {P: 65000, T: 250, eff: 0.92}; // [typ: 65 kW / 250 N·m]
export const BAT = {gross: 7.6, net: 5.7, V: 293, cells: 80, modules: 8, charger: 3700}; // kWh, V [bmw]; cells ≈ 293 V / 3.66 V
export const FUEL = {tank: 41}; // L [bmw]

// ZF 8HP shift elements per gear: brakes A, B and clutches C, D, E
export const ELEMENTS = ['A', 'B', 'C', 'D', 'E'];
export const SHIFT = [
  'ABC', 'ABD', 'BCD', 'BDE', 'CDE', 'BCE', 'ACE', 'ADE',
].map((s) => ELEMENTS.map((e) => s.includes(e)));
export const MODES = ['AUTO', 'MAX', 'SAVE', 'SPORT'];
export const MODE_NAME = {AUTO: 'AUTO eDRIVE', MAX: 'MAX eDRIVE', SAVE: 'SAVE BATTERY', SPORT: 'SPORT'};

const delivered_ = (Te, Tm) => Te + Tm;
const RPM = Math.PI / 30; // rad/s per rpm
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const g0 = 9.81;
export const KMH = 3.6;

/** engine torque available at shaft speed w (rad/s): torque plateau, then the 135 kW power limit, a turbo ramp below 1350 rpm */
export const engineTmax = (w) => {
  const rpm = w / RPM;
  const ramp = clamp((rpm - 700) / 650, 0, 1);
  const lowT = ICE.peakT * (0.42 + 0.58 * ramp * ramp * (3 - 2 * ramp));
  const pwrT = ICE.peakP / Math.max(w, 50);
  return Math.min(lowT, pwrT, ICE.peakT);
};
export const motorTmax = (w, limitP = EM.P) => Math.min(EM.T, limitP / Math.max(w, 20));
const fricT = (rpm) => 14 + 0.0024 * rpm; // N·m
/** fuel power in W for brake power Pe at load fraction `load` and shaft speed w */
const fuelPower = (Te, w, load) => {
  const Pe = Te * w;
  const Pf = fricT(w / RPM) * w;
  const eta = 0.4 * (0.55 + 0.45 * Math.pow(clamp(load, 0, 1), 0.6));
  return Math.max(0, Pe + Pf) / eta;
};
/** open-circuit pack voltage from the displayed charge 0..1 */
export const packV = (soc) => BAT.V * (0.9 + 0.2 * soc);

export function makeCar() {
  return {
    // integrated state
    v: 0,
    dist: 0,
    wheel: 0, // wheel angle, rad
    soc: 0.78,
    gear: 0,
    gearT: 9, // seconds since the last shift
    engOn: false,
    engDwell: 9,
    engW: 0, // engine speed, rad/s
    crank: 0, // crank angle, rad
    k0: 0, // clutch K0 closure 0..1
    fuelL: 0,
    kmEV: 0,
    kmICE: 0,
    plugged: false,
    saveSoc: 0.78,
    // last-step readouts
    out: {},
  };
}

/**
 * Advance the car by dt seconds. cmd: {target (m/s), mode, plug (bool), grade (rad)}.
 * Returns the readout object (also stored in car.out).
 */
export function stepCar(c, dt, cmd) {
  const {target, mode} = cmd;
  const grade = cmd.grade || 0;
  const v = c.v;
  const Fres = 0.5 * 1.2 * CAR.cdA * v * v + CAR.crr * CAR.mass * g0 * Math.cos(grade) * (v > 0.05 ? 1 : 0) + CAR.mass * g0 * Math.sin(grade);
  const plugged = !!cmd.plug && v < 0.2;
  // the driver (cruise): a gentle P controller on speed, launch and comfort limited
  const err = target - v;
  // kick-down (pedal to the floor) and SPORT ask for everything the car has; the normal driver is gentler
  const aMax = cmd.kick ? 4.2 : mode === 'SPORT' ? 3.0 : 1.3;
  let aDes = clamp(err * 0.55, -1.9, aMax);
  if (cmd.kick && err > 0.2) aDes = aMax;
  if (Math.abs(err) < 0.05) aDes = 0;
  if (target < 0.05 && v < 0.12) aDes = 0;
  let Fdem = CAR.mass * aDes + Fres;
  if (v < 0.12 && target < 0.05) Fdem = 0;
  // MAX eDRIVE stays electric: the wish is trimmed to what the machine can give, unless the pedal is floored
  if (mode === 'MAX' && !cmd.kick && c.soc > 0.04 && v > 0.5) {
    const Fcap = Math.min((EM.P * 0.97) / v, (EM.T * 0.97 * CAR.gears[c.gear] * CAR.final * CAR.driveEff) / CAR.wheelR);
    Fdem = Math.min(Fdem, Fcap);
  }

  // gear: a shift schedule on speed and demand, held at least 0.6 s
  const wheelW = v / CAR.wheelR; // rad/s
  const rpmOf = (g) => (wheelW * CAR.final * CAR.gears[g]) / RPM;
  const pedalGuess = clamp(Fdem / 5500, 0, 1);
  c.gearT += dt;
  if (c.gearT > 0.6) {
    const up = 1900 + 2900 * pedalGuess;
    const dn = 1150 + 1000 * pedalGuess;
    let g = c.gear;
    if (g < 7 && rpmOf(g) > up) g++;
    else if (g > 0 && rpmOf(g) < dn) g--;
    if (g !== c.gear) {
      c.gear = g;
      c.gearT = 0;
    }
  }
  const ratio = CAR.gears[c.gear] * CAR.final;
  const shaftW = wheelW * ratio; // motor / crank-side shaft when K0 is closed, rad/s
  const wSyn = Math.max(shaftW, ICE.idle * RPM);

  // torque wanted at the crank-side shaft
  const braking = Fdem < 0;
  const Treq = Fdem >= 0 ? (Fdem * CAR.wheelR) / (ratio * CAR.driveEff) : (Fdem * CAR.wheelR * CAR.driveEff) / ratio;
  const Preq = Math.max(0, Fdem * v);

  // when to run the engine
  const lowBat = c.soc <= 0.04;
  const motorAvailP = lowBat ? 0 : EM.P;
  let want;
  if (plugged) want = false;
  else if (mode === 'SPORT') want = true;
  else if (mode === 'SAVE') want = v > 3 || Preq > 0.2 * EM.P || c.soc < 0.02;
  else if (mode === 'MAX') want = lowBat || v > 33.3 || Preq > EM.P * 1.0 || Treq > EM.T * 1.02;
  else want = lowBat || v > 24 || Preq > 0.6 * EM.P || (c.engOn && Preq > 0.3 * EM.P);
  // hysteresis: a request must hold 2.5 s before the engine stops again; starting is immediate
  c.engDwell += dt;
  if (want && !c.engOn) {
    c.engOn = true;
    c.engDwell = 0;
  } else if (!want && c.engOn && c.engDwell > 2.5) {
    c.engOn = false;
    c.engDwell = 0;
  }

  // engine speed: follows the shaft through the converter when on, spins down when off
  const tgt = c.engOn ? wSyn : 0;
  c.engW += (tgt - c.engW) * (1 - Math.exp(-dt / (c.engOn ? 0.1 : 0.4)));
  if (!c.engOn && c.engW < 2) c.engW = 0;
  const synced = c.engOn && c.engW > 0.92 * tgt;
  c.k0 += ((synced ? 1 : 0) - c.k0) * (1 - Math.exp(-dt / 0.08));
  const engineLive = synced && c.engOn;
  const wE = c.engW;

  // torque split
  const Tm_cap = motorTmax(shaftW, motorAvailP);
  const Te_cap = engineLive ? engineTmax(wE) : 0;
  let Te = 0;
  let Tm = 0;
  if (braking) {
    // recuperation first, the rest goes to the friction brakes
    const regenCap = motorTmax(Math.max(shaftW, 30), 50000);
    Tm = -Math.min(-Treq, regenCap) * (c.soc < 0.995 ? 1 : 0);
    Te = 0;
  } else if (plugged) {
    Tm = 0;
  } else if (engineLive) {
    if (mode === 'SPORT') {
      const share = clamp(Treq / (Te_cap + Tm_cap + 1), 0, 1);
      Tm = Math.min(Tm_cap, Treq * (0.35 + 0.3 * share));
      Te = clamp(Treq - Tm, 0, Te_cap);
      Tm = Math.min(Tm_cap, Treq - Te);
    } else {
      Te = Math.min(Treq, Te_cap);
      Tm = Math.min(Tm_cap, Math.max(0, Treq - Te));
    }
    // SAVE BATTERY: the engine also drives the machine as a generator to hold the charge
    if (mode === 'SAVE') {
      const gen = clamp((c.saveSoc - c.soc) * 18 + 0.15, 0, 1) * 70;
      const room = Te_cap - Te;
      const add = Math.min(gen, room);
      Te += add;
      Tm -= add;
    }
  } else {
    Tm = Math.min(Treq, Tm_cap);
  }
  // net force: the powertrain (negative while recuperating), friction brakes make up the rest of the wanted braking
  const F = (delivered_(Te, Tm) * ratio * CAR.driveEff) / CAR.wheelR;
  const Fbrake = braking ? Math.max(0, F - Fdem) : 0;
  const a = (F - Fbrake - Fres) / CAR.mass;
  c.v = Math.max(0, c.v + a * dt);
  if (target < 0.05 && c.v < 0.12) c.v = 0;
  const dd = c.v * dt;
  c.dist += dd;
  c.wheel += (c.v / CAR.wheelR) * dt;
  c.crank += c.engW * dt;
  if (plugged) c.v = 0;

  // electrical side
  const Pm_mech = Tm * shaftW;
  const Pm_elec = Pm_mech >= 0 ? Pm_mech / EM.eff : Pm_mech * EM.eff;
  const aux = 450; // W: 12 V loads through the DC/DC converter
  const Pcharge = plugged && c.soc < 1 ? BAT.charger * 0.92 : 0;
  const Pbat = Pm_elec + aux * (c.soc > 0.02 ? 1 : 0) - Pcharge; // +W leaves the pack
  const cap = BAT.net * 3.6e6; // J, usable
  c.soc = clamp(c.soc - (Pbat * dt) / cap, 0, 1);
  if (c.soc <= 0) c.soc = 0;
  const Vp = packV(c.soc);
  const Ibat = Pbat / Vp;

  // fuel
  const Pe = Te * wE;
  const loadE = Te_cap > 0 ? Te / Te_cap : 0;
  let Pfuel = 0;
  if (c.engOn && c.engW > 1) {
    const cut = braking && Te <= 0; // overrun fuel cut
    if (!cut) Pfuel = fuelPower(Math.max(0, Te), Math.max(wE, 20), loadE);
  }
  const Lps = Pfuel / (ICE.lhv * ICE.rho);
  c.fuelL += Lps * dt;
  if (c.v > 0.1) {
    if (c.engOn) c.kmICE += dd / 1000;
    else c.kmEV += dd / 1000;
  }
  if (mode !== 'SAVE') c.saveSoc = c.soc;

  // turbo: shaft speed follows exhaust energy, boost follows torque ≈
  const turbo = c.engOn ? clamp(0.18 + 0.82 * loadE * clamp(wE / (3200 * RPM), 0.2, 1), 0, 1) : 0;

  const o = {
    v: c.v,
    kmh: c.v * KMH,
    mph: c.v * 2.23694,
    accel: a,
    gear: c.gear + 1,
    ratio,
    rpm: wE / RPM,
    shaftRpm: shaftW / RPM,
    wheelRpm: wheelW / RPM,
    pedal: clamp(braking ? 0 : Treq / Math.max(1, (engineLive ? Te_cap + Tm_cap : Tm_cap)), 0, 1),
    brake: braking ? clamp(Fbrake / 6000, 0, 1) : 0,
    Te, Tm, Treq,
    Pe, // W at the crank
    Pm: Pm_mech,
    Pwheel: F * c.v,
    Pbat,
    Pcharge,
    Ibat,
    Vbat: Vp,
    soc: c.soc,
    Pfuel,
    Lph: Lps * 3600,
    L100: c.v > 1 ? (Lps / c.v) * 1e5 : null,
    engOn: c.engOn,
    k0: c.k0,
    loadE,
    turbo,
    boost: turbo * 1.15, // bar over ambient, ≈
    regen: braking && Tm < 0,
    plugged,
    kWhPer100: c.v > 1 ? ((Pm_elec + aux) / c.v) * 1e5 / 3.6e6 : null,
    mode,
    elements: SHIFT[c.gear],
    kmEV: c.kmEV,
    kmICE: c.kmICE,
    fuelL: c.fuelL,
    dist: c.dist,
  };
  c.out = o;
  return o;
}

// ------------------------------------------------------------ B48 kinematics (engine space, millimetres)
const D2R = Math.PI / 180;
const mod = (a, m) => ((a % m) + m) % m;
export const R = ICE.stroke / 2;
/** piston pin height above the crank axis (mm) for cylinder c at crank angle th (rad): exact slider-crank */
export const pinHeight = (c, th) => {
  const a = th + ICE.pin[c] * D2R;
  return R * Math.cos(a) + Math.sqrt(ICE.rod * ICE.rod - (R * Math.sin(a)) ** 2);
};
/** crank pin offset (y up, x across) of cylinder c at th */
export const crankPin = (c, th) => {
  const a = th + ICE.pin[c] * D2R;
  return [R * Math.sin(a), R * Math.cos(a)];
};
/** four-stroke phase of cylinder c, degrees after its firing TDC (0-180 power, 180-360 exhaust, 360-540 intake, 540-720 compression) */
export const phase = (c, th) => mod(th / D2R - ICE.fireAt[c], 720);
export const STROKES = ['POWER', 'EXHAUST', 'INTAKE', 'COMPRESSION'];
export const strokeOf = (ps) => STROKES[Math.floor(ps / 180) % 4];
const bump = (ps, a, b) => {
  const x = mod(ps - a, 720) / (b - a);
  return x >= 0 && x <= 1 ? Math.sin(Math.PI * x) ** 2 : 0;
};
// valve lift 0..1 over the 720° cycle (phase after firing TDC)
export const liftEx = (ps) => bump(ps, 140, 380);
export const liftIn = (ps) => bump(ps, 340, 580);
