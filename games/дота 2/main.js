// === Mini 3D MOBA built with Three.js ===
// Полный игровой цикл, выбор героя, ИИ, способности и UI.

// --- Константы ---
const MAP_SIZE = 1600;
const LANE_WIDTH = 120;
const CREEP_INTERVAL = 30000;
const HERO_COUNT_PER_TEAM = 5;
const TEAM_COLORS = { A: 0x4ca3ff, B: 0xff4c61 };
const TWO_PI = Math.PI * 2;

// --- Утилиты ---
const randRange = (a, b) => a + Math.random() * (b - a);

// --- DOM ссылки ---
const hpBar = document.getElementById("hp-bar");
const mpBar = document.getElementById("mp-bar");
const hpText = document.getElementById("hp-text");
const mpText = document.getElementById("mp-text");
const heroNameEl = document.getElementById("hero-name");
const scoreAEl = document.getElementById("scoreA");
const scoreBEl = document.getElementById("scoreB");
const endScreen = document.getElementById("end-screen");
const endText = document.getElementById("end-text");
const restartBtn = document.getElementById("restart");
const minimap = document.getElementById("minimap");
const minimapCtx = minimap.getContext("2d");
const abilityTooltip = document.getElementById("ability-tooltip");
const heroSelect = document.getElementById("hero-select");
const heroListEl = document.getElementById("hero-list");
const heroPreview = document.getElementById("hero-preview");

// --- Глобальные переменные сцены ---
let renderer, scene, camera, clock;
let raycaster = new THREE.Raycaster();
let mouse = new THREE.Vector2();
let plane;
let basePositions = { A: null, B: null };

// --- Игровые сущности ---
const creeps = [];
const towers = [];
const ancients = [];
const heroes = [];
const projectiles = [];
const auras = [];
let playerHero;
let scores = { A: 0, B: 0 };
let lastCreepWave = 0;
let gameEnded = false;
let gameStarted = false;
let selectedHeroId = null;

// --- Ввод игрока ---
let targetPoint = null;

// --- Базовый пул героев ---
const HERO_ARCHETYPES = [
  {
    id: "RAGNAR",
    name: "Берсерк Рагнар",
    lore: "Воин, потерявший свой отряд в кровавой битве. Сражается в ярости, не щадя себя.",
    color: 0x993333,
    type: "melee",
    baseStats: { hp: 900, mana: 300, dmg: 45, movespeed: 90, as: 1.3, armor: 0.15 },
    abilities: {
      Q: { name: "Разруб", desc: "Мощный секторный удар перед героем. Физический урон всем врагам.", mana: 60, cd: 7, execute: (hero, targetPos) => sectorAttack(hero, targetPos, 120, 120, 1.1) },
      W: { name: "Кровавый рывок", desc: "Рывок вперёд, первый враг получает урон и замедление.", mana: 60, cd: 8, execute: (hero, targetPos) => dashStrike(hero, targetPos, 220, 70, 0.5) },
      E: { name: "Волна ярости", desc: "Баф: +урон и +скорость атаки на 5 секунд.", mana: 50, cd: 12, execute: (hero) => buff(hero, { dmgMul: 1.25, asMul: 1.25 }, 5000, 0xff5555) },
      R: { name: "БЕРСЕРК", desc: "Ульт: x2 скорость атаки, x1.5 урон, но герой теряет 4% HP/сек в течение 8 сек.", mana: 100, cd: 28, execute: (hero) => berserk(hero) }
    }
  },
  {
    id: "ALTERIS",
    name: "Маг пламени Альтерис",
    lore: "Изгнанный маг огня, подчинивший себе дух феникса.",
    color: 0xcc5522,
    type: "ranged",
    baseStats: { hp: 700, mana: 600, dmg: 40, movespeed: 85, as: 1.0, armor: 0.08 },
    abilities: {
      Q: { name: "Огненный шар", desc: "Снаряд по прямой. При попадании наносит урон цели.", mana: 70, cd: 6, execute: (hero, targetPos) => fireball(hero, targetPos, 220, 160) },
      W: { name: "Пламенный взрыв", desc: "AOE круг: урон всем врагам в точке.", mana: 90, cd: 10, execute: (hero, targetPos) => aoeBlast(hero, targetPos, 150, 180) },
      E: { name: "Огненный барьер", desc: "Щит, поглощающий урон и слегка отражающий его.", mana: 80, cd: 14, execute: (hero) => shield(hero, 200, 6000, 0xffaa33) },
      R: { name: "МЕТЕОР", desc: "Задержка 1 сек, затем большой метеор: мощный AOE урон.", mana: 150, cd: 30, execute: (hero, targetPos) => meteor(hero, targetPos, 220, 320) }
    }
  },
  {
    id: "SERAPHINA",
    name: "Крио-убийца Серафина",
    lore: "Убийца из будущего, владеющая технологиями экстремального охлаждения.",
    color: 0x55ccff,
    type: "ranged",
    baseStats: { hp: 650, mana: 500, dmg: 38, movespeed: 95, as: 1.2, armor: 0.1 },
    abilities: {
      Q: { name: "Ледяной кинжал", desc: "Выстрел, наносящий урон и замедление на несколько секунд.", mana: 50, cd: 6, execute: (hero, targetPos) => slowingShot(hero, targetPos, 240, 140, 0.4, 3000) },
      W: { name: "Тень холода", desc: "Блинк за спину цели с уроном.", mana: 60, cd: 10, execute: (hero, targetPos) => blinkBehind(hero, targetPos, 200, 120) },
      E: { name: "Ледяная ловушка", desc: "Область на земле, замедляющая всех врагов внутри.", mana: 60, cd: 12, execute: (hero, targetPos) => slowZone(hero, targetPos, 200, 5000, 0.5) },
      R: { name: "АБСОЛЮТНЫЙ НОЛЬ", desc: "Большая область, оглушает врагов на 2 секунды и наносит урон.", mana: 140, cd: 28, execute: (hero, targetPos) => absoluteZero(hero, targetPos, 260, 2000) }
    }
  },
  {
    id: "ORON",
    name: "Друид леса Орон",
    lore: "Хранитель леса, отвергнутый цивилизацией, но верный природе.",
    color: 0x44aa55,
    type: "ranged",
    baseStats: { hp: 820, mana: 520, dmg: 35, movespeed: 80, as: 1.0, armor: 0.12 },
    abilities: {
      Q: { name: "Лечащий импульс", desc: "Исцеляет себя или ближайшего союзника.", mana: 70, cd: 8, execute: (hero) => heal(hero, 220) },
      W: { name: "Корни", desc: "Рутит врага на несколько секунд и наносит урон.", mana: 80, cd: 12, execute: (hero, targetPos) => rootSpell(hero, targetPos, 180, 2500) },
      E: { name: "Природный барьер", desc: "Щит-аура: бонус к броне союзникам вокруг.", mana: 70, cd: 14, execute: (hero) => auraArmor(hero, 0.2, 6000, 240) },
      R: { name: "ДУХ ЛЕСА", desc: "Призывает древня на 30 секунд для боя на линии.", mana: 120, cd: 32, execute: (hero) => summonTreant(hero) }
    }
  },
  {
    id: "VIXIS",
    name: "Техномант Виксис",
    lore: "Псих-инженер, управляющий сферами и дронами.",
    color: 0x6666ff,
    type: "ranged",
    baseStats: { hp: 760, mana: 520, dmg: 34, movespeed: 88, as: 1.05, armor: 0.1 },
    abilities: {
      Q: { name: "Электрошар", desc: "Сферический снаряд по прямой, наносит урон при попадании.", mana: 60, cd: 6, execute: (hero, targetPos) => electricOrb(hero, targetPos, 230, 150) },
      W: { name: "Щит-дрон", desc: "Дрон превращается в щит, поглощающий урон.", mana: 70, cd: 14, execute: (hero) => shield(hero, 260, 7000, 0x6688ff) },
      E: { name: "Перегрузка дронов", desc: "AOE стан вокруг точки/героя.", mana: 80, cd: 14, execute: (hero, targetPos) => stunPulse(hero, targetPos, 200, 1500) },
      R: { name: "ЭНЕРГО-ПОЛЕ", desc: "На земле зона: периодический урон всем врагам внутри.", mana: 130, cd: 30, execute: (hero, targetPos) => damageZone(hero, targetPos, 220, 5000, 70) }
    }
  }
];

// --- Линии ---
const LANES = {
  top: [
    new THREE.Vector3(-MAP_SIZE / 2 + 100, 0, -MAP_SIZE / 2 + 100),
    new THREE.Vector3(0, 0, -MAP_SIZE / 2 + 220),
    new THREE.Vector3(MAP_SIZE / 2 - 100, 0, -MAP_SIZE / 2 + 100),
    new THREE.Vector3(MAP_SIZE / 2 - 100, 0, MAP_SIZE / 2 - 100)
  ],
  mid: [
    new THREE.Vector3(-MAP_SIZE / 2 + 120, 0, MAP_SIZE / -2 + 120),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(MAP_SIZE / 2 - 120, 0, MAP_SIZE / 2 - 120)
  ],
  bot: [
    new THREE.Vector3(-MAP_SIZE / 2 + 100, 0, MAP_SIZE / 2 - 100),
    new THREE.Vector3(0, 0, MAP_SIZE / 2 - 220),
    new THREE.Vector3(MAP_SIZE / 2 - 100, 0, MAP_SIZE / 2 - 100),
    new THREE.Vector3(MAP_SIZE / 2 - 100, 0, -MAP_SIZE / 2 + 100)
  ]
};
// --- Классы сущностей ---
class Entity {
  constructor(team, mesh, opts) {
    this.team = team;
    this.mesh = mesh;
    this.hp = opts.hp || 100;
    this.maxHp = opts.hp || 100;
    this.mana = opts.mana || 0;
    this.maxMana = opts.mana || 0;
    this.dmg = opts.dmg || 10;
    this.as = opts.as || 1.0;
    this.movespeed = opts.movespeed || 60;
    this.armor = opts.armor || 0;
    this.range = opts.range || 120;
    this.attackCd = 0;
    this.target = null;
    this.isDead = false;
    this.type = opts.type || "unit";
    this.buffs = [];
    this.shield = 0;
    this.rootedUntil = 0;
    this.stunnedUntil = 0;
    this.attackWindup = 0.35;
    this.animTime = 0;
    this.special = {};
    this.aiTimer = randRange(600, 1100);
    this.currentLane = "mid";
    this.aiMoveTarget = null;
  }
  // Получение урона с учётом брони и щита
  takeDamage(amount, source) {
    if (this.isDead) return;
    let incoming = amount;
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, incoming);
      this.shield -= absorbed;
      incoming -= absorbed;
    }
    incoming *= (1 - this.armor);
    this.hp -= incoming;
    if (this.hp <= 0) this.die(source);
  }
  die(source) {
    if (this.isDead) return;
    this.isDead = true;
    scene.remove(this.mesh);
    if (this.type === "hero" && source && source.team) scores[source.team] = (scores[source.team] || 0) + 1;
  }
}

class Hero extends Entity {
  constructor(team, archetype, position) {
    const body = new THREE.Group();
    const baseColor = applyTeamTint(archetype.color, team);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(18, 14, 48, 6), new THREE.MeshStandardMaterial({ color: baseColor }));
    torso.position.y = 24;
    const head = new THREE.Mesh(new THREE.SphereGeometry(12, 12, 12), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    head.position.y = 52;
    const weapon = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 50), new THREE.MeshStandardMaterial({ color: 0xaa0000 }));
    weapon.position.set(16, 32, 0);
    body.add(torso, head, weapon);
    body.position.copy(position);
    super(team, body, { ...archetype.baseStats, range: archetype.type === "ranged" ? 260 : 120, type: "hero" });
    this.archetype = archetype;
    this.abilities = createAbilities(archetype.abilities);
  }
}

class Creep extends Entity {
  constructor(team, lanePath, type, laneName) {
    const color = team === "A" ? 0x55aaff : 0xff6666;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(16, 20, 16), new THREE.MeshStandardMaterial({ color }));
    mesh.position.copy(lanePath[team === "A" ? 0 : lanePath.length - 1]);
    mesh.position.y = 10;
    const melee = type === "melee";
    super(team, mesh, { hp: melee ? 260 : 200, dmg: melee ? 22 : 18, movespeed: 60, as: melee ? 1.2 : 1.0, range: melee ? 90 : 200, type: "creep" });
    this.lanePath = lanePath;
    this.laneName = laneName;
    this.pathIndex = team === "A" ? 0 : lanePath.length - 1;
  }
}

class Tower extends Entity {
  constructor(team, position) {
    const color = team === "A" ? 0x3366ff : 0xff3333;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(18, 24, 70, 8), new THREE.MeshStandardMaterial({ color }));
    mesh.position.copy(position);
    mesh.position.y = 35;
    super(team, mesh, { hp: 1400, dmg: 80, movespeed: 0, as: 0.7, range: 320, type: "tower" });
  }
}

class Ancient extends Entity {
  constructor(team, position) {
    const color = team === "A" ? 0x5599ff : 0xff5577;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(80, 80, 80), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 }));
    mesh.position.copy(position);
    mesh.position.y = 40;
    super(team, mesh, { hp: 4000, dmg: 120, movespeed: 0, as: 0.5, range: 360, type: "ancient" });
  }
}

// --- Меню выбора героя ---
buildHeroMenu();
function buildHeroMenu() {
  heroListEl.innerHTML = "";
  heroPreview.textContent = "Кликни на карточку, чтобы стартовать.";
  HERO_ARCHETYPES.forEach((arch) => {
    const card = document.createElement("div");
    card.className = "hero-card";
    card.innerHTML = `
      <div class="title">${arch.name}</div>
      <div class="role">${arch.type === "melee" ? "Ближний бой" : "Дальний бой"}</div>
      <div class="lore">${arch.lore}</div>
    `;
    card.addEventListener("click", () => {
      selectedHeroId = arch.id;
      heroPreview.innerHTML = `
        <strong>${arch.name}</strong><br/>
        ${arch.lore}<br/>
        <em>HP: ${arch.baseStats.hp}, Мана: ${arch.baseStats.mana}, Урон: ${arch.baseStats.dmg}</em>
      `;
      startGame(arch.id);
      heroSelect.classList.add("hidden");
    });
    heroListEl.appendChild(card);
  });
}

// --- Запуск игры ---
function startGame(heroId) {
  if (gameStarted) return;
  gameStarted = true;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f16);
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.getElementById("game-container").appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 5000);
  clock = new THREE.Clock();

  addLights();
  createMap();
  createTeams(heroId);
  lastCreepWave = performance.now();
  spawnCreepWaves();

  window.addEventListener("resize", onWindowResize);
  window.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("keydown", onKeyDown);
  restartBtn.addEventListener("click", () => location.reload());
  bindAbilityTooltips();

  animate();
}

// --- Свет ---
function addLights() {
  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(400, 600, 400);
  scene.add(dir);
}

// --- Карта ---
function createMap() {
  plane = new THREE.Mesh(new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 32, 32), new THREE.MeshStandardMaterial({ color: 0x1a1f26 }));
  plane.rotation.x = -Math.PI / 2;
  scene.add(plane);

  const river = new THREE.Mesh(new THREE.PlaneGeometry(MAP_SIZE, 80), new THREE.MeshStandardMaterial({ color: 0x224477, transparent: true, opacity: 0.7 }));
  river.rotation.x = -Math.PI / 2;
  river.position.z = 0;
  scene.add(river);

  Object.values(LANES).forEach((pts) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 40, LANE_WIDTH / 2, 6, false);
    const lane = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x2c2c2c, transparent: true, opacity: 0.8 }));
    scene.add(lane);
  });

  const treeMat = new THREE.MeshStandardMaterial({ color: 0x2e5c2e });
  for (let i = 0; i < 60; i++) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 32, 6), treeMat);
    const x = randRange(-MAP_SIZE / 2 + 100, MAP_SIZE / 2 - 100);
    const z = randRange(-MAP_SIZE / 2 + 100, MAP_SIZE / 2 - 100);
    trunk.position.set(x, 16, z);
    scene.add(trunk);
  }
}

// --- Команды ---
function createTeams(selectedId) {
  basePositions = {
    A: new THREE.Vector3(-MAP_SIZE / 2 + 160, 0, -MAP_SIZE / 2 + 160),
    B: new THREE.Vector3(MAP_SIZE / 2 - 160, 0, MAP_SIZE / 2 - 160)
  };

  const ancientA = new Ancient("A", basePositions.A);
  const ancientB = new Ancient("B", basePositions.B);
  scene.add(ancientA.mesh, ancientB.mesh);
  ancients.push(ancientA, ancientB);

  const lanePositionsA = [
    new THREE.Vector3(-MAP_SIZE / 4, 0, -MAP_SIZE / 2 + 180),
    new THREE.Vector3(-MAP_SIZE / 4, 0, -MAP_SIZE / 4),
    new THREE.Vector3(-MAP_SIZE / 4, 0, MAP_SIZE / 2 - 180),
    new THREE.Vector3(-MAP_SIZE / 2 + 220, 0, -MAP_SIZE / 2 + 220)
  ];
  const lanePositionsB = [
    new THREE.Vector3(MAP_SIZE / 4, 0, -MAP_SIZE / 2 + 180),
    new THREE.Vector3(MAP_SIZE / 4, 0, MAP_SIZE / 4),
    new THREE.Vector3(MAP_SIZE / 4, 0, MAP_SIZE / 2 - 180),
    new THREE.Vector3(MAP_SIZE / 2 - 220, 0, MAP_SIZE / 2 - 220)
  ];
  lanePositionsA.forEach((p) => { const t = new Tower("A", p); towers.push(t); scene.add(t.mesh); });
  lanePositionsB.forEach((p) => { const t = new Tower("B", p); towers.push(t); scene.add(t.mesh); });

  HERO_ARCHETYPES.forEach((arch) => {
    const heroA = new Hero("A", arch, basePositions.A.clone().add(new THREE.Vector3(randRange(-40, 40), 0, randRange(-40, 40))));
    const heroB = new Hero("B", arch, basePositions.B.clone().add(new THREE.Vector3(randRange(-40, 40), 0, randRange(-40, 40))));
    heroes.push(heroA, heroB);
    scene.add(heroA.mesh, heroB.mesh);
    if (arch.id === selectedId) playerHero = heroA;
  });
  if (!playerHero) playerHero = heroes[0];
  playerHero.currentLane = "mid";
  heroNameEl.textContent = playerHero.archetype.name;
}

// --- Инициализация способностей ---
function createAbilities(dict) {
  const res = {};
  Object.keys(dict).forEach((k) => { res[k] = { ...dict[k], cdLeft: 0 }; });
  return res;
}
// --- События ввода ---
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onMouseMove(e) {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
}

function onMouseDown(e) {
  if (gameEnded) return;
  const point = raycastGround(e.clientX, e.clientY);
  const enemy = point ? findEnemyAtPoint(point, playerHero.team) : null;
  if (e.button === 0) {
    if (enemy) {
      playerHero.target = enemy;
      targetPoint = null;
    } else if (point) {
      targetPoint = point;
      playerHero.target = null;
    }
  } else if (e.button === 2) {
    if (enemy) {
      playerHero.target = enemy;
      targetPoint = null;
    } else if (point) {
      targetPoint = point;
      playerHero.target = null;
    }
  }
}

function onKeyDown(e) {
  if (!playerHero || gameEnded) return;
  const key = e.key.toUpperCase();
  if (["Q", "W", "E", "R"].includes(key)) {
    castAbility(playerHero, key, targetPoint || playerHero.mesh.position.clone());
  }
}

// --- Главный цикл ---
function animate() {
  requestAnimationFrame(animate);
  if (!gameStarted) return;
  const delta = clock.getDelta();
  updateCamera(delta);
  updateEntities(delta);
  updateUI();
  drawMinimap();
  renderer.render(scene, camera);
}

// Камера следует за героем сверху под углом
function updateCamera() {
  if (!playerHero) return;
  const target = playerHero.mesh.position.clone().add(new THREE.Vector3(-260, 320, 260));
  camera.position.lerp(target, 0.08);
  camera.lookAt(playerHero.mesh.position);
}

// --- Обновление сущностей ---
function updateEntities(delta) {
  const now = performance.now();
  if (now - lastCreepWave > CREEP_INTERVAL) {
    spawnCreepWaves();
    lastCreepWave = now;
  }

  heroes.forEach((h) => { if (!h.isDead) updateHero(h, delta); });
  creeps.forEach((c) => { if (!c.isDead) updateCreep(c, delta); });
  towers.forEach((t) => { if (!t.isDead) updateTower(t, delta); });
  ancients.forEach((a) => { if (!a.isDead) updateTower(a, delta); });

  projectiles.forEach((p) => updateProjectile(p, delta));
  for (let i = projectiles.length - 1; i >= 0; i--) if (projectiles[i].dead) projectiles.splice(i, 1);

  auras.forEach((a) => updateAura(a, delta));
  for (let i = auras.length - 1; i >= 0; i--) if (auras[i].expire < now) { scene.remove(auras[i].mesh); auras.splice(i, 1); }
  for (let i = creeps.length - 1; i >= 0; i--) if (creeps[i].isDead) creeps.splice(i, 1);

  ancients.forEach((anc) => {
    if (anc.hp <= 0 && !gameEnded) {
      gameEnded = true;
      endScreen.classList.remove("hidden");
      const playerWin = anc.team !== playerHero.team;
      endText.textContent = playerWin ? "ПОБЕДА" : "ПОРАЖЕНИЕ";
    }
  });
}

// --- Герои ---
function updateHero(hero, delta) {
  const now = performance.now();
  Object.values(hero.abilities).forEach((ab) => { if (ab.cdLeft > 0) ab.cdLeft = Math.max(0, ab.cdLeft - delta * 1000); });

  hero.hp = Math.min(hero.maxHp, hero.hp + 3 * delta);
  hero.mana = Math.min(hero.maxMana, hero.mana + 4 * delta);

  for (let i = hero.buffs.length - 1; i >= 0; i--) {
    const b = hero.buffs[i];
    if (now > b.end) {
      hero.dmg /= b.dmgMul || 1;
      hero.as /= b.asMul || 1;
      hero.movespeed /= b.msMul || 1;
      hero.buffs.splice(i, 1);
    }
  }

  if (hero === playerHero) {
    handlePlayerMovement(hero, delta);
  } else {
    aiHero(hero, delta);
  }

  attackLogic(hero, delta);
  animateHeroMesh(hero, delta);
}

function handlePlayerMovement(hero, delta) {
  if (targetPoint && hero.rootedUntil < performance.now()) {
    moveTowards(hero, targetPoint, delta);
    if (hero.mesh.position.distanceTo(targetPoint) < 10) targetPoint = null;
  }
}

// --- Улучшенный ИИ героев ---
function aiHero(hero, delta) {
  hero.aiTimer -= delta * 1000;
  const hpPercent = hero.hp / hero.maxHp;
  if (hpPercent < 0.3) {
    hero.target = null;
    hero.aiMoveTarget = hero.team === "A" ? basePositions.A : basePositions.B;
  }

  const enemyHero = findClosestEnemy(hero, 280, "hero");
  const enemyCreep = findClosestEnemy(hero, 320, "creep");
  const enemyTower = findClosestEnemy(hero, 320, "tower") || findClosestEnemy(hero, 320, "ancient");

  if (!hero.target) {
    if (enemyCreep) hero.target = enemyCreep;
    if (enemyHero && hpPercent > 0.45) hero.target = enemyHero;
    if (enemyTower && nearbyAlliedCreeps(hero, 140)) hero.target = enemyTower;
  }

  if (hero.aiTimer <= 0) {
    hero.aiTimer = randRange(500, 1000);
    const laneChoice = hero.currentLane || ["top", "mid", "bot"][Math.floor(randRange(0, 3))];
    hero.currentLane = laneChoice;
    const front = findFrontCreep(hero.team, laneChoice);
    if (front) {
      const dir = (hero.team === "A" ? 1 : -1);
      hero.aiMoveTarget = front.mesh.position.clone().add(new THREE.Vector3(dir * 60, 0, dir * 60));
    } else {
      const path = LANES[laneChoice];
      hero.aiMoveTarget = hero.team === "A" ? path[path.length - 1] : path[0];
    }

    const castTarget = hero.target ? hero.target.mesh.position.clone() : hero.mesh.position.clone();
    ["R", "E", "W", "Q"].forEach((key) => {
      const ab = hero.abilities[key];
      if (ab && ab.cdLeft <= 0 && hero.mana >= ab.mana) {
        castAbility(hero, key, castTarget);
      }
    });
  }

  if (hero.target) {
    const dist = hero.mesh.position.distanceTo(hero.target.mesh.position);
    if (dist > hero.range * 0.9) hero.aiMoveTarget = hero.target.mesh.position.clone();
  }

  if (hero.aiMoveTarget) {
    moveTowards(hero, hero.aiMoveTarget, delta);
    if (hero.mesh.position.distanceTo(hero.aiMoveTarget) < 18) hero.aiMoveTarget = null;
  }
}

// --- Крипы ---
function updateCreep(creep, delta) {
  const enemy = findClosestEnemy(creep, creep.range, null);
  if (enemy) {
    creep.target = enemy;
    attackLogic(creep, delta);
  } else if (creep.lanePath) {
    const dest = creep.team === "A" ? creep.lanePath[creep.pathIndex + 1] : creep.lanePath[creep.pathIndex - 1];
    if (dest) {
      moveTowards(creep, dest, delta);
      if (creep.mesh.position.distanceTo(dest) < 16) {
        creep.pathIndex += creep.team === "A" ? 1 : -1;
        creep.pathIndex = THREE.MathUtils.clamp(creep.pathIndex, 0, creep.lanePath.length - 1);
      }
    }
  }
}

// --- Башни / троны ---
function updateTower(tower, delta) {
  const enemy = findClosestEnemy(tower, tower.range);
  if (enemy) {
    tower.target = enemy;
    attackLogic(tower, delta, true);
  }
}

// --- Движение / атака ---
function moveTowards(ent, point, delta) {
  if (ent.rootedUntil > performance.now()) return;
  const dir = point.clone().sub(ent.mesh.position);
  dir.y = 0;
  if (dir.lengthSq() < 4) return;
  dir.normalize();
  ent.mesh.position.addScaledVector(dir, ent.movespeed * delta);
}

function attackLogic(ent, delta, instant) {
  const now = performance.now();
  if (ent.stunnedUntil > now) return;
  if (!ent.target || ent.target.isDead) return;
  const dist = ent.mesh.position.distanceTo(ent.target.mesh.position);
  if (dist > ent.range) {
    moveTowards(ent, ent.target.mesh.position, delta);
    return;
  }
  ent.attackCd -= delta;
  if (ent.attackCd <= 0) {
    ent.attackCd = 1 / ent.as;
    setTimeout(() => {
      if (!ent.target || ent.target.isDead) return;
      const inRange = ent.mesh.position.distanceTo(ent.target.mesh.position) <= ent.range + 10;
      if (!inRange) return;
      if (ent.range > 150) spawnProjectile(ent, ent.target, ent.dmg); else ent.target.takeDamage(ent.dmg, ent);
    }, instant ? 50 : ent.attackWindup * 1000);
  }
}

// --- Проектилы ---
function spawnProjectile(src, target, dmg) {
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(6, 8, 8), new THREE.MeshStandardMaterial({ color: TEAM_COLORS[src.team] }));
  sphere.position.copy(src.mesh.position);
  sphere.position.y += 20;
  scene.add(sphere);
  projectiles.push({ mesh: sphere, target, dmg, speed: 280, dead: false, source: src });
}

function spawnSkillProjectile(hero, point, speed, damage, color) {
  const dir = point.clone().sub(hero.mesh.position);
  dir.y = 0; dir.normalize();
  const projMesh = new THREE.Mesh(new THREE.SphereGeometry(7, 10, 10), new THREE.MeshStandardMaterial({ color }));
  projMesh.position.copy(hero.mesh.position).add(new THREE.Vector3(0, 20, 0));
  scene.add(projMesh);
  const proj = { mesh: projMesh, dir, speed, dmg: damage, dead: false, source: hero, onHit: null };
  projectiles.push(proj);
  return proj;
}

function updateProjectile(p, delta) {
  if (p.dead) return;
  if (!p.target || p.target.isDead) { scene.remove(p.mesh); p.dead = true; return; }
  const dir = p.target.mesh.position.clone().sub(p.mesh.position);
  const dist = dir.length();
  dir.normalize();
  p.mesh.position.addScaledVector(dir, p.speed * delta);
  if (dist < 10) {
    if (p.onHit) p.onHit(p.target); else p.target.takeDamage(p.dmg, p.source);
    scene.remove(p.mesh);
    p.dead = true;
  }
}

// --- Способности ---
function castAbility(hero, key, point) {
  const ab = hero.abilities[key];
  if (!ab || ab.cdLeft > 0 || hero.mana < ab.mana) return;
  ab.cdLeft = ab.cd;
  hero.mana -= ab.mana;
  ab.execute(hero, point);
}
function sectorAttack(hero, point, radius, damage, arcRad) {
  const pos = hero.mesh.position.clone();
  const forward = point.clone().sub(pos).setY(0).normalize();
  heroes.concat(creeps, towers, ancients).forEach((unit) => {
    if (unit.team === hero.team || unit.isDead) return;
    const dir = unit.mesh.position.clone().sub(pos).setY(0);
    const dist = dir.length();
    if (dist < radius) {
      dir.normalize();
      const angle = Math.acos(THREE.MathUtils.clamp(dir.dot(forward), -1, 1));
      if (angle < arcRad / 2) unit.takeDamage(damage + hero.dmg * 0.4, hero);
    }
  });
  visualCone(pos, forward, radius, arcRad, 0xff4444);
}

function dashStrike(hero, point, dashDist, damage, slowDuration) {
  const dir = point.clone().sub(hero.mesh.position);
  dir.y = 0; dir.normalize();
  hero.mesh.position.addScaledVector(dir, dashDist);
  const enemy = findClosestEnemy(hero, 80);
  if (enemy) {
    enemy.takeDamage(damage, hero);
    enemy.special.slowUntil = performance.now() + slowDuration * 1000;
    enemy.movespeed *= 0.6;
    setTimeout(() => { enemy.movespeed /= 0.6; }, slowDuration * 1000);
  }
}

function buff(hero, stats, duration, color) {
  const now = performance.now();
  hero.dmg *= stats.dmgMul || 1;
  hero.as *= stats.asMul || 1;
  hero.movespeed *= stats.msMul || 1;
  hero.buffs.push({ ...stats, end: now + duration });
  pulse(hero.mesh, color, duration);
}

function berserk(hero) {
  const dur = 8000;
  const now = performance.now();
  hero.dmg *= 1.5;
  hero.as *= 2;
  hero.buffs.push({ dmgMul: 1.5, asMul: 2, end: now + dur });
  const interval = setInterval(() => {
    if (hero.isDead) { clearInterval(interval); return; }
    hero.takeDamage(hero.maxHp * 0.04, hero);
  }, 1000);
  setTimeout(() => clearInterval(interval), dur);
  pulse(hero.mesh, 0xff2222, dur);
}

function fireball(hero, point, speed, damage) {
  const proj = spawnSkillProjectile(hero, point, speed, damage, 0xff7733);
  proj.onHit = (unit) => unit.takeDamage(damage + hero.dmg * 0.4, hero);
}

function aoeBlast(hero, point, radius, damage) {
  aoeDamage(point, radius, damage + hero.dmg * 0.3, hero, 0xff5522);
}

function shield(hero, amount, duration, color) {
  hero.shield += amount;
  pulse(hero.mesh, color, duration);
  setTimeout(() => { hero.shield = Math.max(0, hero.shield - amount); }, duration);
}

function meteor(hero, point, radius, damage) {
  const marker = drawCircle(point, radius, 0xffaa55, 0.4);
  setTimeout(() => {
    aoeDamage(point, radius, damage + hero.dmg * 0.5, hero, 0xffaa55);
    scene.remove(marker);
  }, 1000);
}

function slowingShot(hero, point, speed, damage, slowPct, duration) {
  const proj = spawnSkillProjectile(hero, point, speed, damage, 0x66ccff);
  proj.onHit = (unit) => {
    unit.takeDamage(damage + hero.dmg * 0.3, hero);
    const prev = unit.movespeed;
    unit.movespeed *= (1 - slowPct);
    setTimeout(() => unit.movespeed = prev, duration);
  };
}

function blinkBehind(hero, point, damage) {
  hero.mesh.position.copy(point.clone().add(new THREE.Vector3(randRange(-10, 10), 0, randRange(-10, 10))));
  const enemy = findClosestEnemy(hero, 120);
  if (enemy) enemy.takeDamage(damage + hero.dmg * 0.5, hero);
}

function slowZone(hero, point, radius, duration, slowPct) {
  const mesh = drawCircle(point, radius, 0x88ccff, 0.3);
  const aura = { mesh, radius, center: point.clone(), slowPct, expire: performance.now() + duration, type: "slow", team: hero.team };
  auras.push(aura);
}

function absoluteZero(hero, point, radius, duration) {
  drawCircle(point, radius, 0xaaddff, 0.6);
  heroes.concat(creeps).forEach((u) => {
    if (u.team !== hero.team && !u.isDead && u.mesh.position.distanceTo(point) < radius) {
      u.stunnedUntil = performance.now() + duration;
      u.takeDamage(120 + hero.dmg * 0.6, hero);
    }
  });
}

function heal(hero, amount) {
  hero.hp = Math.min(hero.maxHp, hero.hp + amount);
}

function rootSpell(hero, point, radius, duration) {
  const enemy = findClosestEnemyAtPoint(point, radius, hero.team);
  if (enemy) {
    enemy.rootedUntil = performance.now() + duration;
    enemy.takeDamage(60 + hero.dmg * 0.3, hero);
  }
}

function auraArmor(hero, bonus, duration, radius) {
  const mesh = drawCircle(hero.mesh.position, radius, 0x55aa66, 0.25);
  const aura = { mesh, radius, center: hero.mesh.position, bonus, expire: performance.now() + duration, type: "armor", team: hero.team };
  auras.push(aura);
}

function summonTreant(hero) {
  const treant = new Creep(hero.team, LANES.mid, "melee", "mid");
  treant.hp = 600; treant.maxHp = 600; treant.dmg = 50; treant.mesh.scale.set(1.4, 1.4, 1.4);
  treant.mesh.material.color.set(0x55aa55);
  treant.mesh.position.copy(hero.mesh.position);
  creeps.push(treant);
  scene.add(treant.mesh);
  setTimeout(() => { treant.die(); }, 30000);
}

function electricOrb(hero, point, speed, damage) {
  const proj = spawnSkillProjectile(hero, point, speed, damage, 0x88aaff);
  proj.onHit = (unit) => unit.takeDamage(damage + hero.dmg * 0.35, hero);
}

function stunPulse(hero, point, radius, duration) {
  drawCircle(point, radius, 0x6688ff, 0.3);
  heroes.concat(creeps).forEach((u) => {
    if (u.team !== hero.team && !u.isDead && u.mesh.position.distanceTo(point) < radius) {
      u.stunnedUntil = performance.now() + duration;
      u.takeDamage(70 + hero.dmg * 0.2, hero);
    }
  });
}

function damageZone(hero, point, radius, duration, tickDamage) {
  const mesh = drawCircle(point, radius, 0x7777ff, 0.35);
  const aura = { mesh, radius, center: point.clone(), tickDamage, expire: performance.now() + duration, type: "dot", team: hero.team, tick: 0 };
  auras.push(aura);
}

// --- Ауры ---
function updateAura(aura, delta) {
  const now = performance.now();
  if (aura.type === "slow") {
    heroes.concat(creeps).forEach((u) => {
      if (u.team !== aura.team && !u.isDead && u.mesh.position.distanceTo(aura.center) < aura.radius) {
        if (!u.special.slowAura) {
          u.movespeed *= (1 - aura.slowPct);
          u.special.slowAura = true;
        }
      } else if (u.special.slowAura) {
        u.movespeed /= (1 - aura.slowPct);
        u.special.slowAura = false;
      }
    });
  } else if (aura.type === "armor") {
    heroes.forEach((u) => {
      if (u.team === aura.team && u.mesh.position.distanceTo(aura.center) < aura.radius) {
        u.armor = Math.min(0.5, u.armor + aura.bonus);
      }
    });
  } else if (aura.type === "dot") {
    aura.tick += delta;
    if (aura.tick > 0.5) {
      aura.tick = 0;
      heroes.concat(creeps).forEach((u) => {
        if (u.team !== aura.team && !u.isDead && u.mesh.position.distanceTo(aura.center) < aura.radius) {
          u.takeDamage(aura.tickDamage, aura.source || null);
        }
      });
    }
  }
}

// --- AOE урон ---
function aoeDamage(point, radius, damage, source, color) {
  drawCircle(point, radius, color, 0.2);
  heroes.concat(creeps, towers, ancients).forEach((u) => {
    if (u.team !== source.team && !u.isDead && u.mesh.position.distanceTo(point) < radius) {
      u.takeDamage(damage, source);
    }
  });
}

// --- Визуализация ---
function visualCone(pos, dir, radius, arc, color) {
  const geom = new THREE.ConeGeometry(radius, 2, 16, 1, true, -arc / 2, arc);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
  const cone = new THREE.Mesh(geom, mat);
  cone.position.copy(pos).add(new THREE.Vector3(0, 4, 0));
  cone.rotation.x = Math.PI / 2;
  cone.rotation.z = Math.atan2(dir.x, dir.z);
  scene.add(cone);
  setTimeout(() => scene.remove(cone), 400);
}

function drawCircle(point, radius, color, opacity) {
  const geom = new THREE.RingGeometry(radius * 0.2, radius, 32);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
  const ring = new THREE.Mesh(geom, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(point).setY(1);
  scene.add(ring);
  setTimeout(() => scene.remove(ring), 1600);
  return ring;
}

function pulse(mesh, color, duration) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 });
  const ring = new THREE.Mesh(new THREE.CircleGeometry(40, 24), mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(mesh.position).setY(2);
  scene.add(ring);
  setTimeout(() => scene.remove(ring), duration);
}

// --- Поиск целей ---
function findEnemyAtPoint(point, team) {
  const list = heroes.concat(creeps, towers, ancients);
  return list.find((u) => u.team !== team && !u.isDead && u.mesh.position.distanceTo(point) < 30);
}

function findClosestEnemy(ent, range, typeFilter) {
  let closest = null, best = Infinity;
  const list = heroes.concat(creeps, towers, ancients);
  list.forEach((u) => {
    if (u.team === ent.team || u.isDead) return;
    if (typeFilter && u.type !== typeFilter) return;
    const d = ent.mesh.position.distanceTo(u.mesh.position);
    if (d < range && d < best) { best = d; closest = u; }
  });
  return closest;
}

function findClosestEnemyAtPoint(point, range, team) {
  let res = null, best = Infinity;
  heroes.concat(creeps, towers, ancients).forEach((u) => {
    if (u.team === team || u.isDead) return;
    const d = point.distanceTo(u.mesh.position);
    if (d < range && d < best) { best = d; res = u; }
  });
  return res;
}

function findFrontCreep(team, laneName) {
  const sameLane = creeps.filter((c) => c.team === team && c.laneName === laneName);
  if (sameLane.length === 0) return null;
  return team === "A" ? sameLane.reduce((a, b) => (a.pathIndex > b.pathIndex ? a : b)) : sameLane.reduce((a, b) => (a.pathIndex < b.pathIndex ? a : b));
}

function nearbyAlliedCreeps(hero, radius) {
  return creeps.some((c) => c.team === hero.team && c.mesh.position.distanceTo(hero.mesh.position) < radius);
}

// --- Raycast для пола ---
function raycastGround(x, y) {
  mouse.x = (x / window.innerWidth) * 2 - 1;
  mouse.y = -(y / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersect = raycaster.intersectObject(plane);
  if (intersect.length > 0) return intersect[0].point;
  return null;
}

// --- Анимация тела героя ---
function animateHeroMesh(hero, delta) {
  hero.animTime += delta;
  const bob = Math.sin(hero.animTime * 6) * 2;
  hero.mesh.position.y = 10 + bob;
}

// --- Спавн крипов ---
function spawnCreepWaves() {
  Object.keys(LANES).forEach((lane) => {
    const path = LANES[lane];
    const creepA1 = new Creep("A", path, "melee", lane);
    const creepA2 = new Creep("A", path, "ranged", lane);
    const creepB1 = new Creep("B", path, "melee", lane);
    const creepB2 = new Creep("B", path, "ranged", lane);
    [creepA1, creepA2, creepB1, creepB2].forEach((c) => { creeps.push(c); scene.add(c.mesh); });
  });
}

// --- UI ---
function updateUI() {
  if (!playerHero) return;
  hpBar.style.width = `${(playerHero.hp / playerHero.maxHp) * 100}%`;
  mpBar.style.width = `${(playerHero.mana / playerHero.maxMana) * 100}%`;
  hpText.textContent = `HP: ${playerHero.hp.toFixed(0)} / ${playerHero.maxHp}`;
  mpText.textContent = `MP: ${playerHero.mana.toFixed(0)} / ${playerHero.maxMana}`;
  scoreAEl.textContent = scores.A;
  scoreBEl.textContent = scores.B;

  const cds = { Q: document.getElementById("cd-q"), W: document.getElementById("cd-w"), E: document.getElementById("cd-e"), R: document.getElementById("cd-r") };
  ["Q", "W", "E", "R"].forEach((k) => {
    const ab = playerHero.abilities[k];
    const el = cds[k];
    if (ab.cdLeft > 0) {
      el.style.opacity = 0.7;
      el.textContent = ab.cdLeft.toFixed(1);
    } else {
      el.style.opacity = 0;
      el.textContent = "";
    }
  });
}

// --- Мини-карта ---
function drawMinimap() {
  minimapCtx.clearRect(0, 0, minimap.width, minimap.height);
  minimapCtx.fillStyle = "#0b0f16";
  minimapCtx.fillRect(0, 0, minimap.width, minimap.height);
  minimapCtx.fillStyle = "#4ca3ff";
  drawMiniDot(basePositions.A.x, basePositions.A.z, 10);
  minimapCtx.fillStyle = "#ff4c61";
  drawMiniDot(basePositions.B.x, basePositions.B.z, 10);
  drawMiniDot(playerHero.mesh.position.x, playerHero.mesh.position.z, 6, "#fff");
}

function drawMiniDot(x, z, r, color = "#fff") {
  const scale = minimap.width / MAP_SIZE;
  const cx = (x + MAP_SIZE / 2) * scale;
  const cz = (z + MAP_SIZE / 2) * scale;
  minimapCtx.fillStyle = color;
  minimapCtx.beginPath();
  minimapCtx.arc(cx, minimap.height - cz, r, 0, TWO_PI);
  minimapCtx.fill();
}

// --- Наведение для способностей ---
function bindAbilityTooltips() {
  const els = document.querySelectorAll(".ability");
  els.forEach((el) => {
    el.addEventListener("mouseenter", (e) => showAbilityTooltip(e, el.dataset.key));
    el.addEventListener("mouseleave", hideAbilityTooltip);
  });
}

function showAbilityTooltip(e, key) {
  if (!playerHero) return;
  const ab = playerHero.abilities[key];
  if (!ab) return;
  abilityTooltip.innerHTML = `<strong>${key}: ${ab.name}</strong><br>${ab.desc}<br>Мана: ${ab.mana} | КД: ${ab.cd}с`;
  abilityTooltip.classList.remove("hidden");
  const rect = abilityTooltip.getBoundingClientRect();
  abilityTooltip.style.left = `${e.clientX + 12}px`;
  abilityTooltip.style.top = `${e.clientY - rect.height - 6}px`;
}

function hideAbilityTooltip() {
  abilityTooltip.classList.add("hidden");
}

// --- Вспомогательные ---
function applyTeamTint(color, team) {
  const base = new THREE.Color(color);
  const tint = new THREE.Color(team === "A" ? TEAM_COLORS.A : TEAM_COLORS.B);
  return base.lerp(tint, 0.25);
}
