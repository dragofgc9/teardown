// The 1964 Cessna 172E as numbers: the airframe's real dimensions, the Continental O-300-D, the twelve assemblies a
// mechanic takes off it in order, and the three sequences the page runs as functions of tau (seconds into the
// sequence): the run-up (start, mag check, control check, flaps, shutdown), the teardown and the rebuild.
// One input poses the teardown: the level L, 0 assembled .. LMAX every assembly off. No three.js in here.
//
// Sources: FAA TCDS E-253 (O-300: bore 4.0625 in, stroke 3.875 in, 301 cu in, 145 hp at 2700 rpm, 268 lb dry);
// Cessna 172 model histories (1964 172E: circuit breakers replace fuses, new panel, 2300 lb gross, flaps still
// manual on the Johnson bar until the 1965 172F); 172C/172F three-views (36 ft 2 in span, 8 ft 11 in height).

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smoother = (x) => {
  const u = clamp(x, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
};
const ss = (a, b, t) => smoother((t - a) / (b - a));
/** 0 → 1 over [a, a+r], back to 0 over [b-r, b] */
const bump = (a, b, t, r = 0.25) => ss(a, a + r, t) - ss(b - r, b, t);
export const IN = 0.0254;

export const SPEC = {
  span: 11.02, // 36 ft 2 in
  length: 8.07, // 26 ft 6 in
  height: 2.72, // 8 ft 11 in
  wingArea: 16.2, // 174 sq ft
  gross: 2300, // lb
  empty: 1330, // lb
  dihedral: 1.73, // degrees
  hp: 145,
  rpmMax: 2700,
  bore: 4.0625, // in
  stroke: 3.875, // in
  cyl: 6,
  dispCuIn: 301,
  engineDry: 268, // lb
  propD: 76 * IN, // McCauley fixed pitch, 76 in
  propPitch: 53 * IN, // 53 in pitch
  fuel: 42, // US gal, 21 per wing
  fuelUsable: 39,
  firing: '1-6-3-2-5-4',
  // control travel (172 service manual): aileron 20° up / 15° down, elevator 28° up / 23° down, rudder 16°,
  // flaps 0..40° on the manual Johnson bar
  ail: [20, 15],
  elev: [28, 23],
  rud: 16,
  flapMax: 40,
};
// displacement from bore and stroke: π/4 · b² · s · 6 = 301.4 cu in (checks against the TCDS figure)
export const DISP = (Math.PI / 4) * SPEC.bore ** 2 * SPEC.stroke * SPEC.cyl;
/** fixed-pitch propeller: absorbed power goes with rpm cubed, 145 hp at 2700 */
export const hpAt = (rpm) => SPEC.hp * (rpm / SPEC.rpmMax) ** 3;
/** blade tip speed in m/s */
export const tipAt = (rpm) => (Math.PI * SPEC.propD * rpm) / 60;

// ------------------------------------------------------------ the assemblies, in the order they come off
export const GROUPS = [
  {id: 'prop', name: 'PROPELLER & SPINNER', short: 'PROPELLER', sub: 'McCAULEY 76 IN · FIXED PITCH'},
  {id: 'cowl', name: 'ENGINE COWLING', short: 'COWLING', sub: 'UPPER AND LOWER HALVES'},
  {id: 'engine', name: 'CONTINENTAL O-300-D', short: 'ENGINE', sub: '145 HP · 6 CYL · 301 CU IN'},
  {id: 'doors', name: 'CABIN DOORS', short: 'DOORS', sub: 'ONE EACH SIDE'},
  {id: 'windshield', name: 'WINDSHIELD', short: 'WINDSHIELD', sub: 'ONE-PIECE ACRYLIC'},
  {id: 'interior', name: 'PANEL & SEATS', short: 'INTERIOR', sub: 'NEW 1964 PANEL · U-YOKES'},
  {id: 'struts', name: 'WING STRUTS', short: 'STRUTS', sub: 'STREAMLINE TUBE · ONE PER WING'},
  {id: 'wings', name: 'WINGS', short: 'WINGS', sub: 'NACA 2412 · 36 FT 2 IN SPAN'},
  {id: 'tanks', name: 'FUEL TANKS', short: 'FUEL TANKS', sub: '21 GAL EACH · 39 USABLE'},
  {id: 'htail', name: 'STABILIZER & ELEVATORS', short: 'STABILIZER', sub: 'NACA 0009 · ELEVATOR 28° UP'},
  {id: 'vtail', name: 'FIN & RUDDER', short: 'FIN & RUDDER', sub: 'SWEPT TAIL · RUDDER ±16°'},
  {id: 'gear', name: 'LANDING GEAR', short: 'LANDING GEAR', sub: 'SPRING-STEEL MAINS · OLEO NOSE'},
];
export const NG = GROUPS.length;
/**
 * What has to be fitted before an assembly can go on: the propeller bolts to the engine's flange through the closed
 * cowling, a door or the windshield closes over the panel and seats, a strut pins to the wing, the wing closes over its
 * tank. Read backwards it is what has to come off first: the cowling and propeller before the engine.
 */
export const REQ = {prop: ['engine', 'cowl'], cowl: ['engine'], doors: ['interior'], windshield: ['interior'], struts: ['wings'], wings: ['tanks']};
export const GI = Object.fromEntries(GROUPS.map((g, i) => [g.id, i]));
/** each assembly takes this many levels to come off; the next one starts one level later */
export const SPAN = 1.3;
export const LMAX = NG - 1 + SPAN;
/** raw linear progress of assembly i at level L (0..1, before easing) */
export const rawAt = (L, i) => clamp((L - i) / SPAN, 0, 1);
/** eased progress of assembly i at level L: 0 on the airframe, 1 off and set down */
export const kAt = (L, i) => smoother(rawAt(L, i));
/** the shop stands rise under the fuselage just before the gear comes off */
export const standsAt = (L) => ss(GI.gear - 0.55, GI.gear + 0.05, L);
/** how many assemblies are fully off */
export const offCount = (L) => GROUPS.filter((_, i) => rawAt(L, i) >= 1).length;

// ------------------------------------------------------------ sequences
const NEUTRAL = {ail: 0, elev: 0, rud: 0, flap: 0};
const TD = {lead: 1.0, step: 1.15, hold: 1.6};
const RB = {lead: 0.8, step: 0.85, hold: 1.4};
const tdLevel = (t) => clamp((t - TD.lead) / TD.step, 0, LMAX);
const rbLevel = (t) => clamp(LMAX - (t - RB.lead) / RB.step, 0, LMAX);

export const SEQ = {
  runup: {
    dur: 16,
    label: 'RUN-UP',
    from: 'ENGINE OFF',
    to: 'SHUTDOWN',
    level: () => 0,
    rpm: (t) => {
      let r = 160 * ss(0.8, 1.0, t) * (1 - ss(1.25, 1.5, t)) + 1000 * ss(1.25, 1.9, t);
      r += 700 * ss(3.0, 3.7, t) - 700 * ss(6.0, 6.6, t);
      r -= 75 * bump(4.2, 5.0, t) + 60 * bump(5.0, 5.8, t);
      return r * (1 - ss(14.6, 15.7, t));
    },
    controls: (t) => ({
      ail: Math.sin((2 * Math.PI * (t - 6.6)) / 1.6) * bump(6.6, 8.2, t, 0.3),
      elev: Math.sin((2 * Math.PI * (t - 8.4)) / 1.6) * bump(8.4, 10.0, t, 0.3),
      rud: Math.sin((2 * Math.PI * (t - 10.0)) / 1.6) * bump(10.0, 11.6, t, 0.3),
      flap: SPEC.flapMax * (ss(11.7, 12.9, t) - ss(13.6, 14.4, t)),
    }),
    phases: [
      [0, 'MASTER ON · MAGS BOTH'],
      [0.8, 'STARTER ENGAGED'],
      [1.5, 'ENGINE RUNNING · IDLE'],
      [3.0, 'RUN-UP · 1700 RPM'],
      [4.2, 'LEFT MAG CHECK'],
      [5.0, 'RIGHT MAG CHECK'],
      [6.0, 'BACK TO IDLE'],
      [6.6, 'AILERONS FREE & CORRECT'],
      [8.4, 'ELEVATOR FULL TRAVEL'],
      [10.0, 'RUDDER FULL TRAVEL'],
      [11.7, 'FLAPS 40° · JOHNSON BAR'],
      [13.6, 'FLAPS UP'],
      [14.6, 'MIXTURE IDLE CUT-OFF'],
      [15.7, 'ENGINE STOPPED'],
    ],
  },
  teardown: {
    dur: TD.lead + LMAX * TD.step + TD.hold,
    label: 'TEAR DOWN',
    from: 'ASSEMBLED',
    to: 'TORN DOWN',
    level: tdLevel,
    rpm: () => 0,
    controls: () => NEUTRAL,
    phases: [
      [0, 'ENGINE OFF · MASTER OFF'],
      ...GROUPS.map((g, i) => [TD.lead + i * TD.step, `REMOVE ${g.short}`]),
      [TD.lead + LMAX * TD.step, `TORN DOWN · ${NG} ASSEMBLIES OFF`],
    ],
  },
  rebuild: {
    dur: RB.lead + LMAX * RB.step + RB.hold,
    label: 'REBUILD',
    from: 'TORN DOWN',
    to: 'ASSEMBLED',
    level: rbLevel,
    rpm: () => 0,
    controls: () => NEUTRAL,
    phases: [
      [0, 'ALL ASSEMBLIES ON THE FLOOR'],
      // assembly i starts back on once the level drops below i + SPAN: lead + (LMAX - i - SPAN) * step
      ...GROUPS.map((g, i) => [RB.lead + (LMAX - i - SPAN) * RB.step, `INSTALL ${g.short}`]).reverse(),
      [RB.lead + LMAX * RB.step, 'ASSEMBLED · READY FOR RUN-UP'],
    ],
  },
};
export const SEQS = ['runup', 'teardown', 'rebuild'];

/** everything the page draws at tau seconds into a sequence */
export const mechAt = (seq, tau) => {
  const S = SEQ[seq];
  const t = clamp(tau, 0, S.dur);
  return {level: S.level(t), rpm: Math.max(0, S.rpm(t)), ...S.controls(t)};
};
export const phaseAt = (seq, t) => SEQ[seq].phases.filter(([a]) => a <= t + 1e-6).pop()[1];

/** the state chip: [title, sub, colour key] */
export const stateAt = (m, raw = null) => {
  const r = (i) => (raw ? raw[i] : rawAt(m.level, i));
  const off = GROUPS.filter((_, i) => r(i) >= 1).length;
  const moving = GROUPS.findIndex((_, i) => r(i) > 0 && r(i) < 1);
  if (moving >= 0) return [`${GROUPS[moving].short[0]}${GROUPS[moving].short.slice(1).toLowerCase()} in transit`, `${off} OF ${NG} ASSEMBLIES OFF`, 'move'];
  if (off === NG) return ['Torn down', `${NG} ASSEMBLIES OFF THE FUSELAGE`, 'ok'];
  if (off > 0) return ['Partly torn down', `${off} OF ${NG} ASSEMBLIES OFF`, 'ok'];
  if (m.rpm > 20) return ['Engine running', `${Math.round(m.rpm)} RPM · ${hpAt(m.rpm).toFixed(0)} HP ABSORBED`, 'move'];
  return ['Assembled', 'ENGINE OFF · READY', 'ok'];
};
