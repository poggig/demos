// Static rules data. Numbers follow the classic game's community-documented values;
// names are Starfall's own. Every id is stable (used in saves and orders).

// cost: [metal, crystal, deuterium], factor: cost multiplier per level.
// req: { id: level } — ids may be buildings or research.
export const BUILDINGS = {
  metalMine:    { cost: [60, 15, 0],     factor: 1.5 },
  crystalMine:  { cost: [48, 24, 0],     factor: 1.6 },
  deutSynth:    { cost: [225, 75, 0],    factor: 1.5 },
  solarPlant:   { cost: [75, 30, 0],     factor: 1.5 },
  fusionPlant:  { cost: [900, 360, 180], factor: 1.8, req: { deutSynth: 5, energyTech: 3 } },
  robotics:     { cost: [400, 120, 200], factor: 2 },
  nanite:       { cost: [1000000, 500000, 100000], factor: 2, req: { robotics: 10, computerTech: 10 } },
  shipyard:     { cost: [400, 200, 100], factor: 2, req: { robotics: 2 } },
  metalStore:   { cost: [1000, 0, 0],    factor: 2 },
  crystalStore: { cost: [1000, 500, 0],  factor: 2 },
  deutStore:    { cost: [1000, 1000, 0], factor: 2 },
  lab:          { cost: [200, 400, 200], factor: 2 },
  terraformer:  { cost: [0, 50000, 100000], factor: 2, req: { nanite: 1, energyTech: 12 }, energyCost: 1000 },
  allianceDepot:{ cost: [20000, 40000, 0], factor: 2 },
};

export const RESEARCH = {
  espionageTech:  { cost: [200, 1000, 200],   factor: 2, req: { lab: 3 } },
  computerTech:   { cost: [0, 400, 600],      factor: 2, req: { lab: 1 } },
  weaponsTech:    { cost: [800, 200, 0],      factor: 2, req: { lab: 4 } },
  shieldingTech:  { cost: [200, 600, 0],      factor: 2, req: { lab: 6, energyTech: 3 } },
  armourTech:     { cost: [1000, 0, 0],       factor: 2, req: { lab: 2 } },
  energyTech:     { cost: [0, 800, 400],      factor: 2, req: { lab: 1 } },
  hyperspaceTech: { cost: [0, 4000, 2000],    factor: 2, req: { lab: 7, energyTech: 5, shieldingTech: 5 } },
  combustion:     { cost: [400, 0, 600],      factor: 2, req: { lab: 1, energyTech: 1 } },
  impulse:        { cost: [2000, 4000, 600],  factor: 2, req: { lab: 2, energyTech: 1 } },
  hyperDrive:     { cost: [10000, 20000, 6000], factor: 2, req: { lab: 7, hyperspaceTech: 3 } },
  laserTech:      { cost: [200, 100, 0],      factor: 2, req: { lab: 1, energyTech: 2 } },
  ionTech:        { cost: [1000, 300, 100],   factor: 2, req: { lab: 4, laserTech: 5, energyTech: 4 } },
  plasmaTech:     { cost: [2000, 4000, 1000], factor: 2, req: { lab: 4, energyTech: 8, laserTech: 10, ionTech: 5 } },
  researchNet:    { cost: [240000, 400000, 160000], factor: 2, req: { lab: 10, computerTech: 8, hyperspaceTech: 8 } },
  astrophysics:   { cost: [4000, 8000, 4000], factor: 1.75, req: { lab: 3, espionageTech: 4, impulse: 3 } },
  graviton:       { cost: [0, 0, 0],          factor: 3, req: { lab: 12 }, energyCost: 300000 },
};

// Ships. hull = structural integrity (metal+crystal); shield, attack, cargo, speed, fuel as in the original.
// drive: base drive; upgrades: [{ tech, level, drive, speed, fuel }] applied when the tech is reached.
// rf: rapid fire { targetId: value }.
export const SHIPS = {
  smallCargo:  { cost: [2000, 2000, 0], shield: 10, attack: 5, cargo: 5000, speed: 5000, fuel: 10, drive: 'combustion',
                 upgrades: [{ tech: 'impulse', level: 5, drive: 'impulse', speed: 10000, fuel: 20 }],
                 req: { shipyard: 2, combustion: 2 }, rf: { probe: 5, solarSat: 5 } },
  largeCargo:  { cost: [6000, 6000, 0], shield: 25, attack: 5, cargo: 25000, speed: 7500, fuel: 50, drive: 'combustion',
                 req: { shipyard: 4, combustion: 6 }, rf: { probe: 5, solarSat: 5 } },
  lightFighter:{ cost: [3000, 1000, 0], shield: 10, attack: 50, cargo: 50, speed: 12500, fuel: 20, drive: 'combustion',
                 req: { shipyard: 1, combustion: 1 }, rf: { probe: 5, solarSat: 5 } },
  heavyFighter:{ cost: [6000, 4000, 0], shield: 25, attack: 150, cargo: 100, speed: 10000, fuel: 75, drive: 'impulse',
                 req: { shipyard: 3, armourTech: 2, impulse: 2 }, rf: { smallCargo: 3, probe: 5, solarSat: 5 } },
  cruiser:     { cost: [20000, 7000, 2000], shield: 50, attack: 400, cargo: 800, speed: 15000, fuel: 300, drive: 'impulse',
                 req: { shipyard: 5, impulse: 4, ionTech: 2 }, rf: { lightFighter: 6, probe: 5, solarSat: 5, rocketLauncher: 10 } },
  battleship:  { cost: [45000, 15000, 0], shield: 200, attack: 1000, cargo: 1500, speed: 10000, fuel: 500, drive: 'hyperDrive',
                 req: { shipyard: 7, hyperDrive: 4 }, rf: { probe: 5, solarSat: 5 } },
  battlecruiser:{ cost: [30000, 40000, 15000], shield: 400, attack: 700, cargo: 750, speed: 10000, fuel: 250, drive: 'hyperDrive',
                 req: { shipyard: 8, hyperspaceTech: 5, laserTech: 12, hyperDrive: 5 },
                 rf: { smallCargo: 3, largeCargo: 3, heavyFighter: 4, cruiser: 4, battleship: 7, probe: 5, solarSat: 5 } },
  bomber:      { cost: [50000, 25000, 15000], shield: 500, attack: 1000, cargo: 500, speed: 4000, fuel: 1000, drive: 'impulse',
                 upgrades: [{ tech: 'hyperDrive', level: 8, drive: 'hyperDrive', speed: 5000, fuel: 1000 }],
                 req: { shipyard: 8, impulse: 6, plasmaTech: 5 },
                 rf: { probe: 5, solarSat: 5, rocketLauncher: 20, lightLaser: 20, heavyLaser: 10, ionCannon: 10 } },
  destroyer:   { cost: [60000, 50000, 15000], shield: 500, attack: 2000, cargo: 2000, speed: 5000, fuel: 1000, drive: 'hyperDrive',
                 req: { shipyard: 9, hyperDrive: 6, hyperspaceTech: 5 },
                 rf: { probe: 5, solarSat: 5, lightLaser: 10, battlecruiser: 2 } },
  deathstar:   { cost: [5000000, 4000000, 1000000], shield: 50000, attack: 200000, cargo: 1000000, speed: 100, fuel: 1, drive: 'hyperDrive',
                 req: { shipyard: 12, hyperDrive: 7, hyperspaceTech: 6, graviton: 1 },
                 rf: { smallCargo: 250, largeCargo: 250, lightFighter: 200, heavyFighter: 100, cruiser: 33, battleship: 30,
                       battlecruiser: 15, bomber: 25, destroyer: 5, colonyShip: 250, recycler: 250, probe: 1250, solarSat: 1250,
                       rocketLauncher: 200, lightLaser: 200, heavyLaser: 100, gaussCannon: 50, ionCannon: 100 } },
  colonyShip:  { cost: [10000, 20000, 10000], shield: 100, attack: 50, cargo: 7500, speed: 2500, fuel: 1000, drive: 'impulse',
                 req: { shipyard: 4, impulse: 3 }, rf: { probe: 5, solarSat: 5 } },
  recycler:    { cost: [10000, 6000, 2000], shield: 10, attack: 1, cargo: 20000, speed: 2000, fuel: 300, drive: 'combustion',
                 req: { shipyard: 4, combustion: 6, shieldingTech: 2 }, rf: { probe: 5, solarSat: 5 } },
  probe:       { cost: [0, 1000, 0], shield: 0.01, attack: 0.01, cargo: 5, speed: 100000000, fuel: 1, drive: 'combustion',
                 req: { shipyard: 3, combustion: 3, espionageTech: 2 } },
  solarSat:    { cost: [0, 2000, 500], shield: 1, attack: 1, cargo: 0, speed: 0, fuel: 0, drive: null,
                 req: { shipyard: 1 }, stationary: true },
};

export const DEFENCES = {
  rocketLauncher: { cost: [2000, 0, 0],     shield: 20,    attack: 80,   req: { shipyard: 1 } },
  lightLaser:     { cost: [1500, 500, 0],   shield: 25,    attack: 100,  req: { shipyard: 2, energyTech: 1, laserTech: 3 } },
  heavyLaser:     { cost: [6000, 2000, 0],  shield: 100,   attack: 250,  req: { shipyard: 4, energyTech: 3, laserTech: 6 } },
  gaussCannon:    { cost: [20000, 15000, 2000], shield: 200, attack: 1100, req: { shipyard: 6, energyTech: 6, weaponsTech: 3, shieldingTech: 1 } },
  ionCannon:      { cost: [2000, 6000, 0],  shield: 500,   attack: 150,  req: { shipyard: 4, ionTech: 4 } },
  plasmaTurret:   { cost: [50000, 50000, 30000], shield: 300, attack: 3000, req: { shipyard: 8, plasmaTech: 7 } },
  smallDome:      { cost: [10000, 10000, 0], shield: 2000,  attack: 1,    req: { shipyard: 1, shieldingTech: 2 }, max: 1 },
  largeDome:      { cost: [50000, 50000, 0], shield: 10000, attack: 1,    req: { shipyard: 6, shieldingTech: 6 }, max: 1 },
};

// Units = ships + defences, the things that fight.
export const UNITS = { ...SHIPS, ...DEFENCES };
export const isShip = (id) => id in SHIPS;
export const isDefence = (id) => id in DEFENCES;

// Planet slot table: [minFields, maxFields, minTmax, maxTmax]. Tmin = Tmax - 40.
export const SLOTS = [
  null,
  [96, 172, 220, 260], [104, 176, 170, 210], [112, 182, 120, 160],
  [118, 208, 70, 110], [133, 232, 60, 100], [146, 242, 50, 90],
  [152, 248, 40, 80], [156, 252, 30, 70], [150, 246, 20, 60],
  [142, 232, 10, 50], [136, 210, 0, 40], [125, 186, -10, 30],
  [114, 172, -50, -10], [100, 168, -90, -50], [90, 164, -130, -90],
];

export const HOME_FIELDS = 163;
export const START_RESOURCES = [500, 500, 0];

// Drive bonus per tech level.
export const DRIVE_BONUS = { combustion: 0.1, impulse: 0.2, hyperDrive: 0.3 };

// Order in which resources are listed everywhere.
export const RES = ['metal', 'crystal', 'deut'];
