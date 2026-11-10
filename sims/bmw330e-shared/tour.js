// The auto tour: one loop of operator moves. Each step sets views, focus, body mode, explode, drive mode and speed;
// the car does the rest, so the numbers on the panels are whatever the powertrain model says at that moment.
export const SCRIPT = [
  {t: 0, view: 'hero', body: 'solid', target: 0, mode: 'AUTO', explode: 0, say: 'A 2017 BMW 330e: a 2.0 L turbo four, an electric machine and a battery, driving the rear wheels through an 8-speed automatic.'},
  {t: 2.0, target: 40, say: 'Pulling away on electricity alone. The engine is off, so its pistons stand still.'},
  {t: 6.0, body: 'ghost', say: 'Take the shell away and the whole powertrain is right there.'},
  {t: 8.0, focus: 'hv', target: 70, say: 'Energy leaves the 5.7 kWh pack along the orange cables, through the inverter, to the motor.'},
  {t: 14.5, focus: 'edrive', say: 'The electric machine sits on the crank axis. Clutch K0 is open, so the engine is disconnected.'},
  {t: 19.0, target: 120, say: 'Ask for more and the engine starts. K0 closes and engine and motor drive the same shaft.'},
  {t: 27.0, focus: 'engine', say: 'Cylinders fire 1-3-4-2. Orange is combustion; every valve follows its cam.'},
  {t: 35.0, focus: 'edrive', target: 40, say: 'The gearbox holds three of five shift elements in each gear. A shift swaps exactly one.'},
  {t: 41.5, focus: 'driveline', target: 0, say: 'The propshaft carries the torque aft: the pinion turns the ring gear through 90°.'},
  {t: 47.0, focus: null, view: 'wide', body: 'solid', explode: 1, say: 'And all of it comes apart. Click any part to pull it out yourself.'},
  {t: 55.0, explode: 0, view: 'hero', plug: true, say: 'Parked, plug in: the 3.7 kW charger refills the pack.'},
];
export const DURATION = 64;
