// === ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===
let scene, camera, renderer;
let playerGroup, parts = {};
let platforms = [];

// Состояния игры
let gameState = 'LOGIN'; // LOGIN, DISCOVERY, PLAYING, PAUSED
let activeMapId = '';
let checkpoint = { x: 0, y: 5, z: 0 };
let gravity = 0.015;

// Интерполяция анимации (ДЛЯ ПЛАВНОСТИ)
let animTarget = { legL: 0, legR: 0, armL: 0, armR: 0 };
let animCurrent = { legL: 0, legR: 0, armL: 0, armR: 0 };
let animSpeed = 0.2; // Коэффициент плавности (0.1 = медленно, 0.5 = быстро)

// Управление
const keys = { w: false, a: false, s: false, d: false };
let cameraAngleX = 0, cameraAngleY = 0;
let velocity = { x: 0, y: 0, z: 0 };
let onGround = false;

// === ЛОГИКА ИНТЕРФЕЙСА ===

// 1. Регистрация
document.getElementById('signup-btn').addEventListener('click', () => {
    const username = document.getElementById('username-input').value || "Player";
    document.getElementById('display-name').innerText = username;
    document.getElementById('hud-username').innerText = username;
    document.getElementById('esc-username').innerText = username;
    
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-interface').classList.remove('hidden');
    gameState = 'DISCOVERY';
});

// 2. Открытие превью игры
function openGameDetails(mapId) {
    activeMapId = mapId;
    const modal = document.getElementById('game-modal');
    modal.classList.remove('hidden');
    
    const titles = {
        'rainbow': 'Mega Rainbow Obby',
        'glass': 'Glass Bridge Challenge',
        'space': 'Space Parkour (Low Gravity)',
        'lava': 'The Floor is Lava'
    };
    document.getElementById('modal-title').innerText = titles[mapId];
    
    // Цвет превью
    const thumb = document.getElementById('modal-thumb');
    thumb.className = `modal-thumb ${mapId}-thumb`;
}

function closeModal() {
    document.getElementById('game-modal').classList.add('hidden');
}

// 3. Запуск игры
document.getElementById('play-btn-main').addEventListener('click', () => {
    closeModal();
    document.getElementById('app-interface').classList.add('hidden');
    document.getElementById('game-hud').classList.remove('hidden');
    
    if (!scene) initThreeJS();
    loadLevel(activeMapId);
    
    gameState = 'PLAYING';
    document.body.requestPointerLock();
});

// 4. Меню паузы (ESC)
function toggleEscMenu() {
    const menu = document.getElementById('esc-menu');
    if (gameState === 'PLAYING') {
        gameState = 'PAUSED';
        menu.classList.remove('hidden');
        document.exitPointerLock();
    } else if (gameState === 'PAUSED') {
        gameState = 'PLAYING';
        menu.classList.add('hidden');
        document.body.requestPointerLock();
    }
}

function leaveGame() {
    toggleEscMenu();
    document.getElementById('game-hud').classList.add('hidden');
    document.getElementById('app-interface').classList.remove('hidden');
    gameState = 'DISCOVERY';
}

function switchTab(tab) {
    document.getElementById('tab-players').classList.add('hidden');
    document.getElementById('tab-settings').classList.add('hidden');
    
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    
    if (tab === 'players') {
        document.getElementById('tab-players').classList.remove('hidden');
        document.querySelector('.tab-btn:nth-child(1)').classList.add('active');
    } else {
        document.getElementById('tab-settings').classList.remove('hidden');
        document.querySelector('.tab-btn:nth-child(2)').classList.add('active');
    }
}

// Слушатели настроек
document.getElementById('shadow-toggle').addEventListener('change', (e) => {
    renderer.shadowMap.enabled = e.target.checked;
    // Нужно перекомпилировать материалы, но для простоты просто меняем настройку
    scene.traverse(child => {
        if (child.isMesh) child.castShadow = e.target.checked;
    });
});

document.getElementById('fov-slider').addEventListener('input', (e) => {
    camera.fov = e.target.value;
    camera.updateProjectionMatrix();
});

document.getElementById('menu-icon-btn').addEventListener('click', toggleEscMenu);

// === THREE.JS ДВИЖОК ===

function initThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 20, 100);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Свет
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    createPlayer();
    setupInputs();
    animate();
}

function createPlayer() {
    playerGroup = new THREE.Group();

    // Материалы
    const skin = new THREE.MeshLambertMaterial({ color: 0xffcd38 }); 
    const shirt = new THREE.MeshLambertMaterial({ color: 0x0088ff });
    const pants = new THREE.MeshLambertMaterial({ color: 0x228b22 });

    // Функция создания частей
    const createPart = (w, h, d, mat, y, name) => {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        // Создаем пивот для вращения сверху
        const group = new THREE.Group();
        group.position.y = y;
        mesh.position.y = -h / 2; // Сдвиг геометрии вниз
        group.add(mesh);
        parts[name] = group;
        return group;
    };

    // Собираем тело
    const torsoMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), shirt);
    torsoMesh.position.y = 1; 
    torsoMesh.castShadow = true;
    playerGroup.add(torsoMesh);

    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), skin);
    headMesh.position.y = 2.6;
    headMesh.castShadow = true;
    playerGroup.add(headMesh);

    // Конечности (добавляем в группу игрока)
    const armL = createPart(1, 2, 1, skin, 2, 'armL'); armL.position.x = -1.5;
    const armR = createPart(1, 2, 1, skin, 2, 'armR'); armR.position.x = 1.5;
    const legL = createPart(1, 2, 1, pants, 0, 'legL'); legL.position.x = -0.5;
    const legR = createPart(1, 2, 1, pants, 0, 'legR'); legR.position.x = 0.5;

    playerGroup.add(armL, armR, legL, legR);
    scene.add(playerGroup);
}

// === ГЕНЕРАТОР КАРТ ===
function loadLevel(type) {
    platforms.forEach(p => scene.remove(p));
    platforms = [];
    
    // Сброс физики
    gravity = 0.015;
    scene.background.setHex(0x87CEEB);
    
    // Стартовая площадка
    createPlat(0, -2, 0, 10, 1, 10, 0x555555);

    if (type === 'rainbow') {
        let z = -8;
        for(let i=0; i<30; i++) {
            const color = new THREE.Color().setHSL(i/30, 1, 0.5);
            createPlat((Math.random()-0.5)*5, 0, z, 5, 1, 5, color);
            z -= 7;
        }
    } 
    else if (type === 'glass') {
        // Игра в кальмара: стеклянный мост
        let z = -6;
        for(let i=0; i<10; i++) {
            const safeLeft = Math.random() > 0.5;
            // Левая панель
            createPlat(-3, 0, z, 4, 0.2, 5, 0x88ccff, true, safeLeft); 
            // Правая панель
            createPlat(3, 0, z, 4, 0.2, 5, 0x88ccff, true, !safeLeft);
            
            // Стекло перегородка
            createPlat(0, 0, z, 1, 0.5, 5, 0x333333);
            z -= 6;
        }
        createPlat(0, 0, z, 10, 1, 10, 0x00ff00); // Финиш
    }
    else if (type === 'space') {
        gravity = 0.005; // Низкая гравитация
        scene.background.setHex(0x000000);
        let z = -10;
        let y = 0;
        for(let i=0; i<20; i++) {
            y += (Math.random() - 0.3) * 5;
            createPlat((Math.random()-0.5)*20, y, z, 4, 4, 4, 0x555555); // Астероиды
            z -= 10;
        }
    }
    else if (type === 'lava') {
        createPlat(0, -5, 0, 200, 1, 200, 0xff3300); // Лава
        let z = -10;
        for(let i=0; i<30; i++) {
            createPlat((Math.random()-0.5)*15, Math.random()*3, z, 3, 1, 3, 0x333333);
            z -= 5;
        }
    }
    
    checkpoint = { x: 0, y: 5, z: 0 };
    respawn();
}

function createPlat(x, y, z, w, h, d, color, isGlass=false, isSafe=true) {
    const mat = new THREE.MeshLambertMaterial({ 
        color: color, 
        transparent: isGlass, 
        opacity: isGlass ? 0.6 : 1 
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    
    mesh.userData = { w, h, d, top: y+h/2, isGlass, isSafe };
    
    if(!isGlass) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
    }
    
    scene.add(mesh);
    platforms.push(mesh);
}

// === ФИЗИКА И АНИМАЦИЯ ===

function update() {
    if (gameState !== 'PLAYING') return;

    // 1. Физика
    velocity.y -= gravity;
    playerGroup.position.y += velocity.y;
    
    // Простая коллизия
    onGround = false;
    const px = playerGroup.position.x;
    const py = playerGroup.position.y;
    const pz = playerGroup.position.z;

    for (let i = 0; i < platforms.length; i++) {
        const p = platforms[i];
        const data = p.userData;
        
        // Попадание в границы X и Z
        if (px > p.position.x - data.w/2 - 0.5 && px < p.position.x + data.w/2 + 0.5 &&
            pz > p.position.z - data.d/2 - 0.5 && pz < p.position.z + data.d/2 + 0.5) {
            
            // Касание ногами
            if (py > data.top - 0.5 && py < data.top + 1.0 && velocity.y <= 0) {
                // Если это стекло и оно ложное - падаем
                if (data.isGlass && !data.isSafe) {
                    p.material.opacity = 0.1; // "Ломается"
                    p.userData.isSafe = false; // Больше не сработает
                    continue; // Пропускаем коллизию, игрок падает
                }
                
                onGround = true;
                velocity.y = 0;
                playerGroup.position.y = data.top;
            }
        }
    }

    if (playerGroup.position.y < -30) respawn();

    // 2. Движение
    let move = false;
    const speed = 0.2;
    let dx = 0, dz = 0;

    if (keys.w) { dx += Math.sin(cameraAngleX); dz += Math.cos(cameraAngleX); move = true; }
    if (keys.s) { dx -= Math.sin(cameraAngleX); dz -= Math.cos(cameraAngleX); move = true; }
    if (keys.a) { dx += Math.sin(cameraAngleX + Math.PI/2); dz += Math.cos(cameraAngleX + Math.PI/2); move = true; }
    if (keys.d) { dx += Math.sin(cameraAngleX - Math.PI/2); dz += Math.cos(cameraAngleX - Math.PI/2); move = true; }

    if (move) {
        playerGroup.position.x -= dx * speed;
        playerGroup.position.z -= dz * speed;
        playerGroup.rotation.y = Math.atan2(-dx, -dz);
    }

    // 3. ПЛАВНАЯ АНИМАЦИЯ (LERP)
    // Установка целей
    if (!onGround) {
        // Прыжок/Падение: руки вверх, ноги немного врозь
        animTarget = { legL: -0.2, legR: 0.2, armL: 3.14, armR: 3.14 };
    } else if (move) {
        // Ходьба: синусоида
        const t = Date.now() * 0.01;
        animTarget = { 
            legL: Math.sin(t), legR: -Math.sin(t), 
            armL: -Math.sin(t), armR: Math.sin(t) 
        };
    } else {
        // Покой
        animTarget = { legL: 0, legR: 0, armL: 0, armR: 0 };
    }

    // Линейная интерполяция текущих значений к целевым
    const lerp = (start, end, amt) => (1 - amt) * start + amt * end;
    
    animCurrent.legL = lerp(animCurrent.legL, animTarget.legL, animSpeed);
    animCurrent.legR = lerp(animCurrent.legR, animTarget.legR, animSpeed);
    animCurrent.armL = lerp(animCurrent.armL, animTarget.armL, animSpeed);
    animCurrent.armR = lerp(animCurrent.armR, animTarget.armR, animSpeed);

    // Применение к костям
    parts.legL.rotation.x = animCurrent.legL;
    parts.legR.rotation.x = animCurrent.legR;
    parts.armL.rotation.x = animCurrent.armL;
    parts.armR.rotation.x = animCurrent.armR;

    // Камера
    const dist = 8;
    camera.position.x = playerGroup.position.x + Math.sin(cameraAngleX) * dist * Math.cos(cameraAngleY);
    camera.position.z = playerGroup.position.z + Math.cos(cameraAngleX) * dist * Math.cos(cameraAngleY);
    camera.position.y = playerGroup.position.y + 4 + Math.sin(cameraAngleY) * dist;
    camera.lookAt(playerGroup.position.x, playerGroup.position.y + 2, playerGroup.position.z);
}

function respawn() {
    playerGroup.position.set(checkpoint.x, checkpoint.y, checkpoint.z);
    velocity = { x: 0, y: 0, z: 0 };
}

function setupInputs() {
    document.addEventListener('keydown', e => {
        if (e.code === 'KeyW') keys.w = true;
        if (e.code === 'KeyS') keys.s = true;
        if (e.code === 'KeyA') keys.a = true;
        if (e.code === 'KeyD') keys.d = true;
        if (e.code === 'Space' && onGround) velocity.y = 0.45;
        if (e.code === 'Escape') toggleEscMenu();
    });
    
    document.addEventListener('keyup', e => {
        if (e.code === 'KeyW') keys.w = false;
        if (e.code === 'KeyS') keys.s = false;
        if (e.code === 'KeyA') keys.a = false;
        if (e.code === 'KeyD') keys.d = false;
    });

    document.addEventListener('mousemove', e => {
        if (document.pointerLockElement === document.body) {
            cameraAngleX -= e.movementX * 0.003;
            cameraAngleY -= e.movementY * 0.003;
            cameraAngleY = Math.max(-1, Math.min(0.5, cameraAngleY));
        }
    });
}

function animate() {
    requestAnimationFrame(animate);
    update();
    renderer.render(scene, camera);
}