// What each part is, how it comes off, and the numbers on its card. Specs are functions of the live state, so the
// propeller card reads the rpm slider and the engine card reads the same crank angle that fires the cylinders.
import {displacement, ENGINE, FACTS, PROP, powerAt, SOUND, TAIL, TRAVEL, tipSpeed, WHEELS, wingArea} from './spec.js';

const deg = (r) => `${Math.round((r * 180) / Math.PI)}°`;

export const INFO = {
  fuselage: {
    blurb: 'The semi-monocoque aluminium airframe: skin, bulkheads and stringers carry the loads, and everything else bolts to it. It is the datum for this teardown, so it stays put.',
    how: 'The reference everything else bolts to.',
    specs: () => [['Length overall', `${FACTS.length} m`], ['Seats', FACTS.seats], ['Max takeoff weight', `${FACTS.mtow} kg`], ['Fuel', `${FACTS.fuelGal} US gal`]],
  },
  spinner: {
    blurb: 'A streamlined nose cone that smooths the air into the cowl and covers the propeller hub.',
    how: 'Screws to the front of the spinner back plate. Off first, so the propeller can be reached.',
    specs: (s) => [['Base diameter', '0.33 m'], ['Turns at', `${Math.round(s.rpm)} rpm`]],
  },
  prop: {
    blurb: 'A two-blade, fixed-pitch propeller. The blade twists from a steep angle at the hub to a flat one at the tip, so every part meets the air at a useful angle as it turns.',
    how: 'Six bolts hold it to the crankshaft flange. It has to come off before the cowling can.',
    specs: (s) => [['Diameter', `${PROP.dia} m (76 in)`], ['Blades', 2], ['Tip speed (static)', `${Math.round(tipSpeed(s.rpm))} m/s`], ['Tip Mach', (tipSpeed(s.rpm) / SOUND).toFixed(2)]],
  },
  cowlTop: {
    blurb: 'The upper half of the engine cowling. It guides cooling air down over the cylinders and shuts it in so it has to pass between the fins.',
    how: 'Lifts off along the horizontal split line once the propeller is out of the way.',
    specs: () => [['Material', 'Glass-fibre / aluminium'], ['Split', 'Horizontal, at the crank line']],
  },
  cowlBot: {
    blurb: 'The lower cowling. Air that has passed the cylinders leaves through the opening under the firewall.',
    how: 'Drops away after the upper half.',
    specs: () => [['Inlets', 'Two, in the nose face'], ['Cooling air exits', 'Under the firewall']],
  },
  exhaust: {
    blurb: 'Four exhaust stubs, one per cylinder, collect into a muffler under the engine. A shroud around the muffler warms the air that heats the cabin.',
    how: 'Clamps at each cylinder port. Out before the engine, which it hangs beneath.',
    specs: () => [['Stubs', 4], ['Tailpipe', 'Exits under the belly']],
  },
  engine: {
    blurb: 'A fuel-injected, air-cooled, horizontally-opposed four. The cylinders lie flat in two pairs either side of the crankcase; the propeller bolts directly to the crankshaft, with no gearbox.',
    how: 'Four rubber-isolated mounts on the engine bed. The cowls, propeller and exhaust must all be off.',
    specs: (s) => [
      ['Engine', ENGINE.model],
      ['Cylinders', `${ENGINE.cylinders}, opposed`],
      ['Bore × stroke', `${(ENGINE.bore * 1000).toFixed(1)} × ${(ENGINE.stroke * 1000).toFixed(1)} mm`],
      ['Displacement', `${displacement().toFixed(2)} L (360 in³)`],
      ['Firing order', ENGINE.firing.join('-')],
      ['Power now', `${Math.round(powerAt(s.rpm))} hp of ${ENGINE.hp}`],
    ],
  },
  mount: {
    blurb: 'A welded steel-tube truss. It carries the engine on rubber isolators, takes its thrust and torque into the firewall, and carries the nose gear.',
    how: 'Bolts to the firewall at four points. The engine and the nose gear leave first.',
    specs: () => [['Material', 'Welded steel tube'], ['Attach points', 'Four on the firewall'], ['Also carries', 'Nose gear']],
  },
  doorR: {
    blurb: 'A cabin door with a window. The front seats and the instrument panel all come out through the door openings.',
    how: 'Lifts off its hinges. Clears the way into the cabin.',
    specs: () => [['Opens', 'Forward-hinged']],
  },
  doorL: {
    blurb: 'The pilot-side cabin door.',
    how: 'Lifts off its hinges.',
    specs: () => [['Opens', 'Forward-hinged']],
  },
  seatR: {
    blurb: 'A front seat on fore-and-aft rails with a reclining back.',
    how: 'Slides off its rails, then out through the door.',
    specs: () => [['Adjusts', 'Fore and aft, back angle']],
  },
  seatL: {
    blurb: 'The pilot seat, on the same kind of rail as the right one.',
    how: 'Slides off its rails, then out through the door.',
    specs: () => [['Adjusts', 'Fore and aft, back angle']],
  },
  bench: {
    blurb: 'The rear bench seat, for two passengers, with a baggage area behind it.',
    how: 'Lifts out through the door.',
    specs: () => [['Seats', 2]],
  },
  panel: {
    blurb: 'The instrument panel, throttle and mixture, the flap lever, the rudder pedals and the two control wheels. Each wheel is joined to the elevator by cables and rods, and to the ailerons by cables.',
    how: 'Cables come off at the cabin and rods at the column, and the whole panel comes out sideways.',
    specs: (s) => [
      ['Roll → ailerons', `${Math.round(s.roll * 100)}%`],
      ['Pull/push → elevator', `${Math.round(s.pitch * 100)}%`],
      ['Pedals → rudder', `${Math.round(s.yaw * 100)}%`],
    ],
  },
  wingR: {
    blurb: 'A high wing with a NACA 2412 section. It is straight along the front edge, constant chord to the strut, then tapered to the tip. Each wing holds a fuel tank, and a strut braces it to the fuselage.',
    how: 'Struts, flap and aileron come off first. Then two main spar bolts at the root.',
    specs: () => [['Airfoil', 'NACA 2412'], ['Span (both)', `${FACTS.span} m`], ['Area (modelled)', `${wingArea().toFixed(1)} m²`], ['Area (published)', `${FACTS.wingAreaPublished} m²`]],
  },
  wingL: {
    blurb: 'The left wing, the mirror of the right. Its fuel tank is behind the front spar.',
    how: 'Same as the right: struts and surfaces off, then the root bolts.',
    specs: () => [['Fuel in both tanks', `${FACTS.fuelGal} US gal`]],
  },
  flapR: {
    blurb: 'A slotted flap on the trailing edge. Lowered, it adds lift and drag so the aircraft can fly slow and descend steeply.',
    how: 'Unbolts at its hinges and drive arm.',
    specs: (s) => [['Now', `${s.flap}°`], ['Settings', TRAVEL.flaps.map((x) => `${x}°`).join(' · ')]],
  },
  flapL: {
    blurb: 'The left flap, driven together with the right one by an electric motor.',
    how: 'Unbolts at its hinges and drive arm.',
    specs: (s) => [['Now', `${s.flap}°`]],
  },
  aileronR: {
    blurb: 'The aileron rolls the aircraft. It goes up on one wing and down on the other, and the hinge is set so the leading edge dips into the airflow and makes the drag balance out.',
    how: 'Hinge bolts and the control cable fitting.',
    specs: () => [],
  },
  aileronL: {
    blurb: 'The left aileron moves opposite to the right one.',
    how: 'Hinge bolts and the control cable fitting.',
    specs: (s) => [['Travel', `${deg(TRAVEL.aileronUp)} up · ${deg(TRAVEL.aileronDown)} down`], ['Roll', `${Math.round(s.roll * 100)}%`]],
  },
  strutR: {
    blurb: 'The lift strut. It carries the wing’s load down into the fuselage, so the wing does not have to be a stiff cantilever, and a small jury strut stops it flexing.',
    how: 'Two bolts, one at the wing and one at the fuselage.',
    specs: () => [['Section', 'Streamlined tube'], ['Per wing', 1]],
  },
  strutL: {
    blurb: 'The left wing strut.',
    how: 'Two bolts, one at the wing and one at the fuselage.',
    specs: () => [['Per wing', 1]],
  },
  stab: {
    blurb: 'The horizontal stabilizer. It is the aircraft’s tailplane: a small wing that holds the nose up against the weight of the engine.',
    how: 'Bolts to the tailcone. The elevator comes off first.',
    specs: () => [['Span', `${TAIL.span} m`]],
  },
  elevator: {
    blurb: 'The elevator pitches the nose. A trim tab on its trailing edge holds a steady setting without pressure on the wheel.',
    how: 'Hinge bolts and the cables.',
    specs: (s) => [['Travel', `${deg(TRAVEL.elevatorUp)} up · ${deg(TRAVEL.elevatorDown)} down`], ['Now', `${Math.round(s.pitch >= 0 ? s.pitch * 28 : s.pitch * 23)}° ${s.pitch >= 0 ? 'up' : 'down'}`]],
  },
  fin: {
    blurb: 'The vertical fin keeps the nose pointing into the airflow, like the feathers on an arrow.',
    how: 'Bolts to the tailcone. The rudder comes off first.',
    specs: () => [['Overall height', `${FACTS.height} m`]],
  },
  rudder: {
    blurb: 'The rudder yaws the nose left and right. It is moved with the pedals by cables.',
    how: 'Hinge bolts and the cable fitting.',
    specs: (s) => [['Travel', `±${deg(TRAVEL.rudder)}`], ['Now', `${Math.round(s.yaw * 16)}°`]],
  },
  noseGear: {
    blurb: 'A steerable nose strut with an oil-and-air shock absorber. The rudder pedals steer it through push-rods.',
    how: 'Bolts to the engine mount and firewall. The wheel comes off first.',
    specs: () => [['Shock absorber', 'Oil and air (oleo)'], ['Steering', 'Rudder pedals']],
  },
  noseWheel: {
    blurb: 'The nose wheel, smaller than the mains, since it carries only a fraction of the weight.',
    how: 'One axle nut.',
    specs: () => [['Tyre', WHEELS.nose.tyre]],
  },
  gearR: {
    blurb: 'A tapered spring-steel tube. It bends on landing and takes the shock without an oil damper.',
    how: 'Bolts into the cabin sill. The wheel and brake come off first.',
    specs: () => [['Material', 'Spring steel tube'], ['Shock', 'Leg flexes']],
  },
  gearL: {
    blurb: 'The left main gear leg.',
    how: 'Bolts into the cabin sill.',
    specs: () => [['Material', 'Spring steel tube']],
  },
  wheelR: {
    blurb: 'A main wheel with its own hydraulic disc brake, which the pilot works with the tops of the rudder pedals.',
    how: 'One axle nut. The brake caliper stays on the leg.',
    specs: () => [['Tyre', WHEELS.main.tyre], ['Brake', 'Hydraulic disc']],
  },
  wheelL: {
    blurb: 'The left main wheel and its disc brake.',
    how: 'One axle nut.',
    specs: () => [['Tyre', WHEELS.main.tyre], ['Brake', 'Hydraulic disc']],
  },
};
INFO.aileronR.specs = (s) => [['Travel', `${deg(TRAVEL.aileronUp)} up · ${deg(TRAVEL.aileronDown)} down`], ['Now', s.roll === 0 ? '0°' : s.roll > 0 ? `${Math.round(s.roll * 20)}° up` : `${Math.round(-s.roll * 15)}° down`]];
INFO.aileronL.specs = (s) => [['Travel', `${deg(TRAVEL.aileronUp)} up · ${deg(TRAVEL.aileronDown)} down`], ['Now', s.roll === 0 ? '0°' : s.roll > 0 ? `${Math.round(s.roll * 15)}° down` : `${Math.round(-s.roll * 20)}° up`]];

/** the order a mechanic takes it apart in: each step names the part and says why it is next */
export const ORDER = [
  'spinner', 'prop', 'cowlTop', 'cowlBot', 'exhaust', 'engine', 'noseWheel', 'noseGear', 'mount',
  'doorR', 'doorL', 'seatR', 'seatL', 'bench', 'panel',
  'flapR', 'flapL', 'aileronR', 'aileronL', 'strutR', 'strutL', 'wingR', 'wingL',
  'rudder', 'fin', 'elevator', 'stab',
  'wheelR', 'wheelL', 'gearR', 'gearL',
];
