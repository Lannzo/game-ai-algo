// game_3d.js
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import TWEEN from "@tweenjs/tween.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ExtrudeGeometry } from "three"; // Needed for Hearts
import { TextureLoader, EquirectangularReflectionMapping } from 'three';


// --- DOM Elements ---
const canvasContainer = document.getElementById("gameCanvasContainer");
const canvas = document.getElementById("threeCanvas");
const btnPlanMove = document.getElementById("btnPlanMove");
const btnPlanShoot = document.getElementById("btnPlanShoot");
const btnReset = document.getElementById("btnReset");
const phaseIndicator = document.getElementById("phaseIndicator");
const messageArea = document.getElementById("messageArea");
const playerFuelInfo = document.getElementById("playerFuelInfo");
const aiFuelInfo = document.getElementById("aiFuelInfo");
const playerHealthInfo = document.getElementById("playerHealthInfo");
const aiHealthInfo = document.getElementById("aiHealthInfo");
const planFuelCostInfo = document.getElementById("planFuelCostInfo");

// --- Game Constants ---
const GRID_SIZE = 20;
const CELL_3D_SIZE = 2;
const WALL_HEIGHT = CELL_3D_SIZE * 2.5;
const WALL_DENSITY = 0.28;
const DAMPENER_DENSITY = 0.15; // % of floor cells that become dampeners
const INITIAL_FUEL = 10;
const FUEL_PER_UPGRADE = 5;
const INITIAL_POWERUP_COUNT = 8;
const BASE_MOVE_COST = 1; // Cost for normal floor
const DAMPENER_MOVE_COST = 2; // Cost for dampener floor
const INITIAL_HEALTH = 3;
const MAX_POWERUPS = Math.floor(GRID_SIZE * GRID_SIZE * 0.02);

// Timing Constants
const MISSILE_TRAVEL_DURATION = 1200;
const MOVEMENT_DURATION = 400;
const AI_THINK_DELAY = 50;
const ACTION_RESOLVE_DELAY = 200;
const EXPLOSION_DURATION = 700; // Base duration for normal explosions

// --- NEW MECHANICS Constants ---
const FUEL_EXPLOSION_RADIUS = 2;
const FUEL_EXPLOSION_SCALE_MULTIPLIER = 1.8;
const FUEL_EXPLOSION_PARTICLE_MULTIPLIER = 2.0;
const NUKES_PER_ROUND = 3;
const NUKE_DAMAGE = 1;
const NUKE_EXPLOSION_SCALE_MULTIPLIER = 1.0;
const NUKE_EXPLOSION_PARTICLE_MULTIPLIER = 3.5;
const NUKE_EXPLOSION_DURATION_MULTIPLIER = 1.4;
const NUKE_INDICATOR_PULSE_DURATION = 800;
const DAMPENER_PULSE_SPEED = 0.8; // Speed for dampener visual effect
const DAMPENER_PULSE_AMOUNT = 0.08; // How much the dampener pulses vertically

// --- Three.js Setup ---
let scene, camera, renderer, controls, composer;
let gameBoardGroup;
let floorMeshes = []; // 2D array: [y][x] -> mesh or null
let wallMeshes = [];
let powerupMeshes = []; // {mesh, pos}
let playerMesh, aiMesh;
let playerHeartsGroup, aiHeartsGroup;
let activeHighlights = [];
let activeProjectiles = []; // {mesh?, trail?}
let nukeIndicatorMeshes = []; // {mesh, tween?}
let dampenerFloorMeshes = []; // Keep track for animation

// Materials
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.9, metalness: 0.2, receiveShadow: true, flatShading: true });
const dampenerMaterial = new THREE.MeshStandardMaterial({ color: 0x6a0dad, roughness: 0.7, metalness: 0.3, emissive: 0x4a097d, emissiveIntensity: 0.8, receiveShadow: true, flatShading: true, transparent: true, opacity: 0.95 });
const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x5a6a7a, roughness: 0.7, metalness: 0.3, emissive: 0x101010, emissiveIntensity: 0.1, flatShading: true, castShadow: true, receiveShadow: true });
const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x007bff, roughness: 0.4, metalness: 0.5, emissive: 0x003a7f, emissiveIntensity: 0.5, castShadow: true });
const aiMaterial = new THREE.MeshStandardMaterial({ color: 0xdc3545, roughness: 0.4, metalness: 0.5, emissive: 0x6b1a22, emissiveIntensity: 0.5, castShadow: true });
const heartMaterial = new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xcc2222, emissiveIntensity: 0.6, roughness: 0.6, metalness: 0.2, flatShading: true });
const powerupMaterial = new THREE.MeshStandardMaterial({ color: 0xffc107, emissive: 0xffaa00, emissiveIntensity: 1.8, roughness: 0.2, metalness: 0.8, castShadow: true });
const moveHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00, transparent: true, opacity: 0.4, emissive: 0x00ff00, emissiveIntensity: 0.2 });
const pathHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0xffa500, transparent: true, opacity: 0.5, emissive: 0xffa500, emissiveIntensity: 0.3 });
const invalidPathHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0x888888, transparent: true, opacity: 0.3, emissive: 0x444444, emissiveIntensity: 0.1 });
const hitHighlightMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, transparent: true, opacity: 0.6, emissive: 0xff0000, emissiveIntensity: 0.5 });
const nukeIndicatorMaterial = new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xff8822, emissiveIntensity: 1.5, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });

// Missile/Explosion Materials
const playerMissileCoreMaterial = new THREE.MeshStandardMaterial({ color: 0x00bfff, emissive: 0x00bfff, emissiveIntensity: 2.0, roughness: 0.1, metalness: 0.6 });
const aiMissileCoreMaterial = new THREE.MeshStandardMaterial({ color: 0xff6a6a, emissive: 0xff6a6a, emissiveIntensity: 2.0, roughness: 0.1, metalness: 0.6 });
const missileTrailMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.15, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, sizeAttenuation: true, depthWrite: false });
const explosionShockwaveMaterial = new THREE.MeshBasicMaterial({ color: 0xffccaa, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
const explosionParticleMaterial = new THREE.PointsMaterial({ color: 0xff8844, size: 0.25, transparent: true, opacity: 1.0, blending: THREE.AdditiveBlending, sizeAttenuation: true, depthWrite: false, vertexColors: true });
const nukeExplosionBaseColor = new THREE.Color(0xff5500);

// Raycasting
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let intersectionPlane;

// --- Game State ---
let grid = []; 
let playerPos = { x: -1, y: -1 };
let aiPos = { x: -1, y: -1 };
let playerFuel = INITIAL_FUEL;
let aiFuel = INITIAL_FUEL;
let playerHealth = INITIAL_HEALTH;
let aiHealth = INITIAL_HEALTH;
let powerUpPositions = []; // {x, y}
let pendingNukeLocations = []; // {x, y} for next round's nukes
let gamePhase = "playerTurn";
let currentPlayer = "player";
let currentPlanningMode = "move";
let plannedShootPath = null;
let plannedShootCost = 0;
let currentHoverPos = null;
let gameOverState = null;
let isResolving = false;

// --- Initialization ---
function init() {
    console.log("Initializing 3D Missile Game with Gravity Dampeners...");
    initThreeJS();
    initGameLogic();
    setupInputListeners();
    animate();
    console.log("Game Initialized.");
}

function initThreeJS() {
    scene = new THREE.Scene();
    const texLoader = new TextureLoader();
    texLoader.load('textures/space.jpg', texture => {
     texture.mapping = EquirectangularReflectionMapping;
     scene.background = texture;
        });
    //scene.background = new THREE.Color(0x0f1113);
    const aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100);
    camera.position.set(0, GRID_SIZE * CELL_3D_SIZE * 0.8, GRID_SIZE * CELL_3D_SIZE * 0.7);
    camera.lookAt(0, 0, 0);
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(GRID_SIZE * CELL_3D_SIZE * 0.6, GRID_SIZE * CELL_3D_SIZE * 1.2, GRID_SIZE * CELL_3D_SIZE * 0.5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = GRID_SIZE * CELL_3D_SIZE * 2.5;
    const shadowCamSize = GRID_SIZE * CELL_3D_SIZE * 0.7;
    directionalLight.shadow.camera.left = -shadowCamSize;
    directionalLight.shadow.camera.right = shadowCamSize;
    directionalLight.shadow.camera.top = shadowCamSize;
    directionalLight.shadow.camera.bottom = -shadowCamSize;
    scene.add(directionalLight);
    const ambientLight = new THREE.AmbientLight(0x808080, 0.6);
    scene.add(ambientLight);
    const hemisphereLight = new THREE.HemisphereLight(0x4488bb, 0x080820, 0.5);
    scene.add(hemisphereLight);
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(canvasContainer.clientWidth, canvasContainer.clientHeight), 1.0, 0.4, 0.85);
    composer.addPass(bloomPass);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.target.set(0, 0, 0);
    controls.maxPolarAngle = Math.PI / 2 - 0.05;
    controls.minDistance = CELL_3D_SIZE * 3;
    controls.maxDistance = CELL_3D_SIZE * GRID_SIZE * 1.5;
    gameBoardGroup = new THREE.Group();
    scene.add(gameBoardGroup);
    const planeSize = GRID_SIZE * CELL_3D_SIZE;
    const planeGeom = new THREE.PlaneGeometry(planeSize, planeSize);
    const planeMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    intersectionPlane = new THREE.Mesh(planeGeom, planeMat);
    intersectionPlane.rotation.x = -Math.PI / 2;
    intersectionPlane.position.y = -0.04; 
    scene.add(intersectionPlane);
    window.addEventListener("resize", onWindowResize, false);
    onWindowResize();
}

function onWindowResize() {
    const width = canvasContainer.clientWidth;
    const height = canvasContainer.clientHeight;
    if (width === 0 || height === 0) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
}

function initGameLogic() {
    clearBoard3D();
    generateGrid(); 

    // for fixed start positions
    const pCorner =  {x:0, y:GRID_SIZE - 1};
    const aCorner = {x:GRID_SIZE - 1, y:0};
    grid[pCorner.y][pCorner.x] = "floor"; 
    grid[aCorner.y][aCorner.x] = "floor"; 

    createBoard3D(); 

    playerPos = {...pCorner};
    aiPos = {...aCorner};

    playerFuel = INITIAL_FUEL;
    aiFuel = INITIAL_FUEL;
    playerHealth = INITIAL_HEALTH;
    aiHealth = INITIAL_HEALTH;
    powerUpPositions = [];
    powerupMeshes = [];
    pendingNukeLocations = [];
    dampenerFloorMeshes = []; 
    gameOverState = null;
    isResolving = false;
    currentPlayer = "player";
    gamePhase = "playerTurn";
    currentPlanningMode = "move";
    plannedShootPath = null;
    plannedShootCost = 0;
    currentHoverPos = null;


    createUnits3D();
    spawnInitialPowerups();
    selectNextNukeLocations(); // Select the first set of nukes and show indicators

    setMessage("Your Turn: Plan your move or missile shot. Watch out for incoming impacts and dampeners!");
    updatePhaseIndicator();
    updateFuelInfo();
    updateHealthInfo();
    enablePlanningControls();
    clearHighlights();
    clearPlanningCostUI();
    controls.target.set(0, 0, 0);
    controls.update();
    setPlanningMode("move");
}

function setupInputListeners() {
    btnPlanMove.addEventListener("click", () => setPlanningMode("move"));
    btnPlanShoot.addEventListener("click", () => setPlanningMode("shoot"));
    btnReset.addEventListener("click", initGameLogic);
    canvasContainer.addEventListener("click", handleCanvasClick);
    canvasContainer.addEventListener("mousemove", handleCanvasMouseMove);
    canvasContainer.addEventListener("contextmenu", (event) => event.preventDefault());
}


// --- Grid Generation Functions 
function generateGrid() {
    let attempts = 0;
    while (attempts < 10) {
        grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill("floor"));
        let wallCount = 0;
        const totalCells = GRID_SIZE * GRID_SIZE;
        const targetWallCount = Math.floor(totalCells * WALL_DENSITY) * 0.7;

        // Place Walls
        while (wallCount < targetWallCount) {
            const x = Math.floor(Math.random() * GRID_SIZE);
            const y = Math.floor(Math.random() * GRID_SIZE);
            const isNearCorner = (px, py) =>
                (px >= 0 && px <= 4 && py >= 0 && py <= 4) ||
                (px >= GRID_SIZE - 5 && px < GRID_SIZE && py >= GRID_SIZE - 5 && py < GRID_SIZE) ||
                (px >= 0 && px <= 4 && py >= GRID_SIZE - 5 && py < GRID_SIZE) ||
                (px >= GRID_SIZE - 5 && px < GRID_SIZE && py >= 0 && py <= 4);

            if (grid[y][x] === "floor" && !isNearCorner(x, y) && Math.random() < 0.9) {
                grid[y][x] = "wall";
                wallCount++;
            } else if (grid[y][x] === "floor" && Math.random() < 0.2) {
                grid[y][x] = "wall";
                wallCount++;
            }
        }

        // Place Dampeners on remaining Floor cells
        let dampenerCount = 0;
        const floorCells = [];
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                if (grid[y][x] === "floor") {
                    floorCells.push({x, y});
                }
            }
        }
        const targetDampenerCount = Math.floor(floorCells.length * DAMPENER_DENSITY);
        floorCells.sort(() => Math.random() - 0.5); // Shuffle floor cells

        for (let i = 0; i < Math.min(targetDampenerCount, floorCells.length); i++) {
            const { x, y } = floorCells[i];
            grid[y][x] = "dampener";
            dampenerCount++;
        }
        console.log(`Placed ${dampenerCount} gravity dampeners.`);


        if (isGridConnected()) {
            console.log("Generated connected grid with walls and dampeners.");
            return;
        }
        attempts++;
        console.warn(`Generated grid attempt ${attempts} was not connected, retrying...`);
    }
    console.error("Failed to generate a connected grid after multiple attempts. Using last attempt.");
    if (!isGridConnected()) {
        console.warn("WARNING: Grid may still be disconnected.");
    }
}

function isGridConnected() {
    const startNode = findFirstFloorOrDampener(); // Check connectivity for both floor types
    if (!startNode) return false;

    const q = [startNode];
    const visited = new Set([`${startNode.x},${startNode.y}`]);
    let reachableFloorCount = 0;
    let totalFloorCount = 0;

    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            if (grid[y][x] === "floor" || grid[y][x] === "dampener") totalFloorCount++; // Count both
        }
    }
    if (totalFloorCount === 0) return false;

    while (q.length > 0) {
        const { x, y } = q.shift();
        reachableFloorCount++;

        const neighbors = [
            { x: x + 1, y: y }, { x: x - 1, y: y },
            { x: x, y: y + 1 }, { x: x, y: y - 1 }
        ];

        for (const n of neighbors) {
            const key = `${n.x},${n.y}`;
            if (isValid(n.x, n.y) && (grid[n.y][n.x] === "floor" || grid[n.y][n.x] === "dampener") && !visited.has(key)) { // Check both
                visited.add(key);
                q.push(n);
            }
        }
    }
    return reachableFloorCount === totalFloorCount;
}

function findFirstFloorOrDampener() {
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            if (grid[y][x] === "floor" || grid[y][x] === "dampener") return { x, y };
        }
    }
    return null;
}



// --- 3D Object Creation / Management Functions 
function get3DPosition(x, y, yOffset = 0) {
    const worldX = (x - (GRID_SIZE - 1) / 2) * CELL_3D_SIZE;
    const worldZ = (y - (GRID_SIZE - 1) / 2) * CELL_3D_SIZE;
    return new THREE.Vector3(worldX, yOffset, worldZ);
}

function getGridCoords(position) {
    const x = Math.round(position.x / CELL_3D_SIZE + (GRID_SIZE - 1) / 2);
    const y = Math.round(position.z / CELL_3D_SIZE + (GRID_SIZE - 1) / 2);
    return { x, y };
}

function disposeMesh(mesh) {
    if (!mesh) return;
    if (mesh.isGroup) {
        mesh.children.slice().forEach(child => disposeMesh(child));
    }
    if (mesh.userData && mesh.userData.tween) {
        mesh.userData.tween.stop();
        mesh.userData.tween = null;
    }
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
        if (Array.isArray(mesh.material)) {
            mesh.material.forEach((mat) => {
                if (mat.map) mat.map.dispose();
                mat.dispose();
            });
        } else {
            if (mesh.material.map) mesh.material.map.dispose();
            mesh.material.dispose();
        }
    }
    if (mesh.parent) {
        mesh.parent.remove(mesh);
    }
}

function clearBoard3D() {
    gameBoardGroup.children.slice().forEach(child => disposeMesh(child));
    playerHeartsGroup = null;
    aiHeartsGroup = null;
    floorMeshes = []; // Clear the 2D array references
    wallMeshes = [];
    powerupMeshes = [];
    dampenerFloorMeshes = []; // Clear dampener list
    playerMesh = null;
    aiMesh = null;
    activeHighlights = [];
    activeProjectiles.forEach(proj => {
        if (proj.mesh) disposeMesh(proj.mesh);
        if (proj.trail) disposeMesh(proj.trail);
    });
    activeProjectiles = [];
    clearNukeIndicators();
}

function createBoard3D() {
    floorMeshes = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
    dampenerFloorMeshes = []; // Reset list
    wallMeshes = [];
    const floorGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.2, CELL_3D_SIZE);
    const dampenerGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.18, CELL_3D_SIZE); // Slightly thinner
    const wallGeom = new THREE.BoxGeometry(CELL_3D_SIZE, WALL_HEIGHT, CELL_3D_SIZE);

    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            const pos = get3DPosition(x, y);
            const cellType = grid[y][x];

            if (cellType === "floor") {
                const floorMesh = new THREE.Mesh(floorGeom, floorMaterial);
                floorMesh.position.copy(pos);
                floorMesh.position.y = -0.1;
                floorMesh.castShadow = false;
                floorMesh.receiveShadow = true;
                floorMesh.userData = { gridX: x, gridY: y, type: "floor", originalY: -0.1 };
                gameBoardGroup.add(floorMesh);
                floorMeshes[y][x] = floorMesh;
            } else if (cellType === "dampener") {
                const dampenerMesh = new THREE.Mesh(dampenerGeom, dampenerMaterial.clone()); 
                dampenerMesh.position.copy(pos);
                dampenerMesh.position.y = -0.11; 
                dampenerMesh.castShadow = false;
                dampenerMesh.receiveShadow = true;
                dampenerMesh.userData = { gridX: x, gridY: y, type: "dampener", originalY: -0.11 }; 
                gameBoardGroup.add(dampenerMesh);
                floorMeshes[y][x] = dampenerMesh;
                dampenerFloorMeshes.push(dampenerMesh); 
            } else if (cellType === "wall") {
                const wallMesh = new THREE.Mesh(wallGeom, wallMaterial);
                wallMesh.position.copy(pos);
                wallMesh.position.y = WALL_HEIGHT / 2 - 0.1;
                wallMesh.castShadow = true;
                wallMesh.receiveShadow = true;
                wallMesh.userData = { gridX: x, gridY: y, type: "wall" };
                gameBoardGroup.add(wallMesh);
                wallMeshes.push(wallMesh);
                floorMeshes[y][x] = null; // Ensure no floor mesh here
            }
        }
    }
}

// --- Create Heart Geometry 
function createHeartGeometry() {
    const heartShape = new THREE.Shape();
    const x = 0, y = 0;
    heartShape.moveTo(x, y - 0.2);
    heartShape.bezierCurveTo(x, y - 0.1, x - 0.3, y + 0.2, x - 0.3, y + 0.2);
    heartShape.bezierCurveTo(x - 0.3, y + 0.4, x - 0.1, y + 0.5, x, y + 0.4);
    heartShape.bezierCurveTo(x + 0.1, y + 0.5, x + 0.3, y + 0.4, x + 0.3, y + 0.2);
    heartShape.bezierCurveTo(x + 0.3, y + 0.2, x, y - 0.1, x, y - 0.2);
    const extrudeSettings = { steps: 1, depth: 0.15, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelOffset: 0, bevelSegments: 3 };
    const geometry = new THREE.ExtrudeGeometry(heartShape, extrudeSettings);
    geometry.center();
    geometry.scale(CELL_3D_SIZE * 0.3, CELL_3D_SIZE * 0.3, CELL_3D_SIZE * 0.3);
    return geometry;
}
const cachedHeartGeometry = createHeartGeometry();

// --- Update Health Visuals 
function updateHealthVisuals(health, heartsGroup) {
    if (!heartsGroup) return;
    heartsGroup.children.slice().forEach(child => disposeMesh(child));
    heartsGroup.clear();
    const spacing = CELL_3D_SIZE * 0.3;
    const totalWidth = (health - 1) * spacing;
    const startX = -totalWidth / 2;
    for (let i = 0; i < health; i++) {
        const heartMesh = new THREE.Mesh(cachedHeartGeometry, heartMaterial);
        heartMesh.position.x = startX + i * spacing;
        heartsGroup.add(heartMesh);
    }
}

// --- Create Units 3D 
function createUnits3D() {
    
    const playerUnitHeight = CELL_3D_SIZE * 0.9;
    const playerUnitRadius = CELL_3D_SIZE * 0.3;
    const playerGeom = new THREE.CapsuleGeometry(playerUnitRadius, playerUnitHeight - playerUnitRadius * 2, 4, 10);
    playerMesh = new THREE.Mesh(playerGeom, playerMaterial);
    playerMesh.castShadow = true;
    playerMesh.receiveShadow = false;
    const playerPos3D = get3DPosition(playerPos.x, playerPos.y, playerUnitHeight / 2);
    playerMesh.position.copy(playerPos3D);
    playerMesh.userData = { type: "player" };
    gameBoardGroup.add(playerMesh);
    playerHeartsGroup = new THREE.Group();
    playerHeartsGroup.position.set(0, playerUnitHeight * 0.8, 0);
    playerMesh.add(playerHeartsGroup);
    updateHealthVisuals(playerHealth, playerHeartsGroup);

    const aiUnitHeight = CELL_3D_SIZE * 1.0;
    const aiUnitRadius = CELL_3D_SIZE * 0.4;
    const aiGeom = new THREE.ConeGeometry(aiUnitRadius, aiUnitHeight, 8);
    aiMesh = new THREE.Mesh(aiGeom, aiMaterial);
    aiMesh.castShadow = true;
    aiMesh.receiveShadow = false;
    const aiPos3D = get3DPosition(aiPos.x, aiPos.y, aiUnitHeight / 2);
    aiMesh.position.copy(aiPos3D);
    aiMesh.userData = { type: "ai" };
    gameBoardGroup.add(aiMesh);
    aiHeartsGroup = new THREE.Group();
    aiHeartsGroup.position.set(0, aiUnitHeight * 0.8, 0);
    aiMesh.add(aiHeartsGroup);
    updateHealthVisuals(aiHealth, aiHeartsGroup);
}

// --- Create/Remove Powerup 3D 
function createPowerup3D(x, y) {
    const powerupSize = CELL_3D_SIZE * 0.3;
    const powerupGeom = new THREE.IcosahedronGeometry(powerupSize, 0);
    const mesh = new THREE.Mesh(powerupGeom, powerupMaterial);
    mesh.position.copy(get3DPosition(x, y, powerupSize * 0.7));
    mesh.castShadow = true;
    mesh.userData = { type: "powerup", gridX: x, gridY: y, spinSpeed: Math.random() * 0.03 + 0.015 };
    gameBoardGroup.add(mesh);
    return { mesh: mesh, pos: { x, y } };
}
function removePowerup3D(x, y) {
    const meshIndex = powerupMeshes.findIndex(p => p.pos.x === x && p.pos.y === y);
    if (meshIndex !== -1) {
        disposeMesh(powerupMeshes[meshIndex].mesh);
        powerupMeshes.splice(meshIndex, 1);
    } else { console.warn(`Could not find fuel cell mesh at ${x},${y} to remove visually.`); }
    const logicalIndex = powerUpPositions.findIndex(p => p.x === x && p.y === y);
    if (logicalIndex !== -1) { powerUpPositions.splice(logicalIndex, 1); }
    else { console.warn(`Could not find fuel cell position at ${x},${y} to remove logically.`); }
}

// --- Highlighting Functions 
function clearHighlights() {
    // Remove existing highlight meshes
    activeHighlights.forEach(mesh => disposeMesh(mesh));
    activeHighlights = [];

    // Restore original floor meshes that were replaced by highlights
    for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
            // If a floor *should* be here but isn't (because it was highlighted)
            if ((grid[y][x] === 'floor' || grid[y][x] === 'dampener') && !floorMeshes[y]?.[x]) {
                const cellType = grid[y][x];
                const pos = get3DPosition(x, y);
                let originalMesh;

                if (cellType === 'floor') {
                    const floorGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.2, CELL_3D_SIZE);
                    originalMesh = new THREE.Mesh(floorGeom, floorMaterial);
                    originalMesh.position.copy(pos);
                    originalMesh.position.y = -0.1;
                    originalMesh.userData = { gridX: x, gridY: y, type: "floor", originalY: -0.1 };
                } else { // cellType === 'dampener'
                    const dampenerGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.18, CELL_3D_SIZE);
                    originalMesh = new THREE.Mesh(dampenerGeom, dampenerMaterial.clone());
                    originalMesh.position.copy(pos);
                    originalMesh.position.y = -0.11;
                    originalMesh.userData = { gridX: x, gridY: y, type: "dampener", originalY: -0.11 };
                     // Add back to animation list if it was removed during highlight
                    if (!dampenerFloorMeshes.some(m => m === originalMesh)) {
                         dampenerFloorMeshes.push(originalMesh);
                    }
                }
                originalMesh.castShadow = false;
                originalMesh.receiveShadow = true;
                gameBoardGroup.add(originalMesh);
                floorMeshes[y][x] = originalMesh; // Put it back in the main array
            }
        }
    }
}


function highlightCell(x, y, highlightMaterial) {
    const cellType = grid[y]?.[x];
    if (isValid(x, y) && (cellType === "floor" || cellType === "dampener")) {
        const existingMesh = floorMeshes[y]?.[x];

        // If there's an existing floor/dampener mesh, remove it first
        if (existingMesh) {
             // If it's a dampener, remove from animation list
            if(existingMesh.userData.type === 'dampener') {
                const dampenerIndex = dampenerFloorMeshes.indexOf(existingMesh);
                if(dampenerIndex > -1) {
                    dampenerFloorMeshes.splice(dampenerIndex, 1);
                }
            }
            disposeMesh(existingMesh);
            floorMeshes[y][x] = null; // Mark as empty in the array temporarily
        }

        // Create and add the highlight mesh
        const highlightGeom = new THREE.BoxGeometry(CELL_3D_SIZE, 0.25, CELL_3D_SIZE); // Slightly thicker highlight
        const highlightMesh = new THREE.Mesh(highlightGeom, highlightMaterial.clone());
        highlightMesh.position.copy(get3DPosition(x, y));
        highlightMesh.position.y = -0.08; // Consistent highlight height
        highlightMesh.userData = { gridX: x, gridY: y, type: "highlight" };
        gameBoardGroup.add(highlightMesh);
        activeHighlights.push(highlightMesh);
    }
}


function renderHighlights() {
    clearHighlights(); // Clear previous highlights and restore original floors
    clearPlanningCostUI();
    if (currentPlayer !== "player" || isResolving || gameOverState) {
        return; // No highlights if not player's turn or game busy/over
    }
    if (currentPlanningMode === "move") {
        const validMoves = getValidMoves(playerPos, aiPos);
        validMoves.forEach(move => highlightCell(move.x, move.y, moveHighlightMaterial));
    } else if (currentPlanningMode === "shoot") {
        if (plannedShootPath && plannedShootPath.length > 0) {
            const cost = plannedShootCost;
            const available = playerFuel;
            const canAfford = cost <= available;
            const pathMaterial = canAfford ? pathHighlightMaterial : invalidPathHighlightMaterial;
            plannedShootPath.forEach(p => {
                if (!(p.x === playerPos.x && p.y === playerPos.y)) { // Don't highlight the player's own cell in path
                    highlightCell(p.x, p.y, pathMaterial);
                }
            });
            const target = plannedShootPath[plannedShootPath.length - 1];
            const targetMaterial = canAfford ? hitHighlightMaterial : invalidPathHighlightMaterial;
            highlightCell(target.x, target.y, targetMaterial); // Highlight final target
            updatePlanningCostUI(cost, available);
        } else {
            clearPlanningCostUI();
        }
    }
}


// --- NUKE INDICATOR & RESOLUTION LOGIC 
function createNukeIndicator3D(x, y) {
    const radius = CELL_3D_SIZE * 0.45; const height = CELL_3D_SIZE * 0.05;
    const indicatorGeom = new THREE.CylinderGeometry(radius, radius, height, 16, 1, true);
    const indicatorMesh = new THREE.Mesh(indicatorGeom, nukeIndicatorMaterial.clone());
    indicatorMesh.position.copy(get3DPosition(x, y, height));
    indicatorMesh.rotation.x = 0;
    indicatorMesh.userData = { type: "nuke_indicator", gridX: x, gridY: y, tween: null };
    gameBoardGroup.add(indicatorMesh);
    nukeIndicatorMeshes.push(indicatorMesh);
    const baseOpacity = nukeIndicatorMaterial.opacity; const pulseTargetOpacity = baseOpacity * 0.5;
    const tweenForward = new TWEEN.Tween(indicatorMesh.material).to({ opacity: pulseTargetOpacity }, NUKE_INDICATOR_PULSE_DURATION / 2).easing(TWEEN.Easing.Quadratic.InOut);
    const tweenBackward = new TWEEN.Tween(indicatorMesh.material).to({ opacity: baseOpacity }, NUKE_INDICATOR_PULSE_DURATION / 2).easing(TWEEN.Easing.Quadratic.InOut);
    tweenForward.chain(tweenBackward); tweenBackward.chain(tweenForward); tweenForward.start();
    indicatorMesh.userData.tween = tweenForward;
    return indicatorMesh;
}
function clearNukeIndicators() { nukeIndicatorMeshes.forEach(mesh => disposeMesh(mesh)); nukeIndicatorMeshes = []; }
function selectNextNukeLocations() {
    clearNukeIndicators(); pendingNukeLocations = [];
    let availableFloorCells = [];
    for (let y = 0; y < GRID_SIZE; y++) { for (let x = 0; x < GRID_SIZE; x++) { if (grid[y][x] === 'floor' || grid[y][x] === 'dampener') availableFloorCells.push({ x, y }); } }
    if (availableFloorCells.length === 0) return;
    for (let i = availableFloorCells.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [availableFloorCells[i], availableFloorCells[j]] = [availableFloorCells[j], availableFloorCells[i]]; }
    const count = Math.min(NUKES_PER_ROUND, availableFloorCells.length);
    for (let i = 0; i < count; i++) { const targetPos = availableFloorCells[i]; pendingNukeLocations.push(targetPos); createNukeIndicator3D(targetPos.x, targetPos.y); }
    console.log(`Selected ${pendingNukeLocations.length} nuke targets for next round:`, pendingNukeLocations);
}
async function resolveNukeImpacts() {
    if (pendingNukeLocations.length === 0) return { impactedLocations: [], hitMessages: [], playerWasHit: false, aiWasHit: false };
    console.log("Resolving nuke impacts...");
    const impactPromises = []; const hitMessages = []; let playerWasHit = false; let aiWasHit = false; const destroyedFuelCells = []; const currentImpactLocations = [...pendingNukeLocations];
    clearNukeIndicators(); pendingNukeLocations = [];
    currentImpactLocations.forEach(pos => {
        const { x, y } = pos; console.log(` Nuke impacting at ${x},${y}`); const impactPosition3D = get3DPosition(x, y, CELL_3D_SIZE * 0.4);
        const explosionPromise = new Promise(resolve => { createExplosionEffect(impactPosition3D, nukeExplosionBaseColor, NUKE_EXPLOSION_SCALE_MULTIPLIER, NUKE_EXPLOSION_PARTICLE_MULTIPLIER, resolve, NUKE_EXPLOSION_DURATION_MULTIPLIER); });
        impactPromises.push(explosionPromise);
        if (playerPos.x === x && playerPos.y === y) { playerHealth -= NUKE_DAMAGE; playerWasHit = true; hitMessages.push(`Player caught in nuke blast at ${x},${y}!`); }
        if (aiPos.x === x && aiPos.y === y) { aiHealth -= NUKE_DAMAGE; aiWasHit = true; hitMessages.push(`AI caught in nuke blast at ${x},${y}!`); }
        if (isPowerupAt(x, y)) { removePowerup3D(x, y); destroyedFuelCells.push({ x, y }); hitMessages.push(`Fuel cell at ${x},${y} obliterated by nuke.`); }
    });
    await Promise.all(impactPromises); console.log("Nuke explosion visuals complete.");
    if (playerWasHit || aiWasHit) { updateHealthInfo(); }
    return { impactedLocations: currentImpactLocations, hitMessages, playerWasHit, aiWasHit };
}

// --- Missile / Explosion Visual Functions --- (Unchanged)
function createGuidedMissileVisual(path, missileCoreMaterial, onImpactCallback = null) {
    if (!path || path.length < 2) return;
    const startGridPos = path[0]; const endGridPos = path[path.length - 1];
    const launchHeight = CELL_3D_SIZE * 0.7; const impactHeight = CELL_3D_SIZE * 0.3; const midHeightBoost = CELL_3D_SIZE * 1.5 * Math.min(1.0, path.length / 5);
    const points3D = path.map((p, index) => { let yOffset = launchHeight + (impactHeight - launchHeight) * (index / (path.length - 1)); const midPointFactor = Math.sin((index / (path.length - 1)) * Math.PI); yOffset += midHeightBoost * midPointFactor; return get3DPosition(p.x, p.y, yOffset); });
    points3D[0] = get3DPosition(startGridPos.x, startGridPos.y, launchHeight); points3D[points3D.length - 1] = get3DPosition(endGridPos.x, endGridPos.y, impactHeight);
    const curve = new THREE.CatmullRomCurve3(points3D, false, "catmullrom", 0.2);
    const missileRadius = CELL_3D_SIZE * 0.12; const missileLength = CELL_3D_SIZE * 0.45;
    const missileGeom = new THREE.ConeGeometry(missileRadius, missileLength, 8); missileGeom.rotateX(Math.PI / 2); missileGeom.translate(0, 0, missileLength / 2);
    const missileMesh = new THREE.Mesh(missileGeom, missileCoreMaterial.clone()); missileMesh.position.copy(curve.getPointAt(0)); missileMesh.lookAt(curve.getPointAt(0.01)); missileMesh.userData = { type: "missile_object" };
    scene.add(missileMesh); activeProjectiles.push({ mesh: missileMesh });
    const trailGroup = new THREE.Group(); scene.add(trailGroup); activeProjectiles.push({ trail: trailGroup });
    const trailSpawnInterval = 30; let lastTrailSpawnTime = 0; const trailParticleLifetime = 400;
    const travelTween = new TWEEN.Tween({ t: 0 }).to({ t: 1 }, MISSILE_TRAVEL_DURATION).easing(TWEEN.Easing.Linear.None)
        .onUpdate((obj) => {
            const currentTime = performance.now(); const currentPoint = curve.getPointAt(obj.t); const tangent = curve.getTangentAt(obj.t).normalize();
            missileMesh.position.copy(currentPoint); const lookAtPoint = currentPoint.clone().add(tangent); missileMesh.lookAt(lookAtPoint);
            if (currentTime - lastTrailSpawnTime > trailSpawnInterval && obj.t < 0.98) {
                lastTrailSpawnTime = currentTime; const particleGeom = new THREE.SphereGeometry(missileRadius * 0.4, 4, 2); const particleMat = missileTrailMaterial.clone(); particleMat.opacity = 0.7;
                const particle = new THREE.Mesh(particleGeom, particleMat); particle.position.copy(currentPoint).addScaledVector(tangent, -missileLength * 0.6); trailGroup.add(particle);
                new TWEEN.Tween(particle.material).to({ opacity: 0 }, trailParticleLifetime).easing(TWEEN.Easing.Quadratic.In).start();
                new TWEEN.Tween(particle.scale).to({ x: 0.01, y: 0.01, z: 0.01 }, trailParticleLifetime).easing(TWEEN.Easing.Quadratic.In).onComplete(() => disposeMesh(particle)).start();
            }
        })
        .onComplete(() => {
            let missileIndex = activeProjectiles.findIndex(p => p.mesh === missileMesh); if (missileIndex > -1) activeProjectiles.splice(missileIndex, 1); disposeMesh(missileMesh);
            setTimeout(() => { let trailIndex = activeProjectiles.findIndex(p => p.trail === trailGroup); if (trailIndex > -1) activeProjectiles.splice(trailIndex, 1); disposeMesh(trailGroup); }, trailParticleLifetime);
            if (onImpactCallback) onImpactCallback();
        })
        .start();
}
function createExplosionEffect(position, baseColor, scaleMultiplier = 1.0, particleMultiplier = 1.0, onCompleteCallback = null, durationMultiplier = 1.0) {
    const explosionGroup = new THREE.Group(); scene.add(explosionGroup);
    const baseExplosionScale = CELL_3D_SIZE * 1.5; const explosionScale = baseExplosionScale * scaleMultiplier;
    const baseParticleCount = 150; const particleCount = Math.round(baseParticleCount * particleMultiplier);
    const baseDuration = EXPLOSION_DURATION; const effectDuration = baseDuration * durationMultiplier;
    let shockwaveMesh, particleSystem, flashLight; let completedComponents = 0; const totalVisualComponents = 3;
    const checkCleanup = () => { completedComponents++; if (completedComponents >= totalVisualComponents) { disposeMesh(shockwaveMesh); disposeMesh(particleSystem); if (flashLight && flashLight.parent) flashLight.parent.remove(flashLight); if (explosionGroup.parent) explosionGroup.parent.remove(explosionGroup); if (onCompleteCallback) onCompleteCallback(); } };
    const shockwaveGeom = new THREE.SphereGeometry(explosionScale * 0.1, 32, 16); const shockwaveMat = explosionShockwaveMaterial.clone(); shockwaveMat.color.set(baseColor).lerp(new THREE.Color(0xffffff), 0.7);
    shockwaveMesh = new THREE.Mesh(shockwaveGeom, shockwaveMat); shockwaveMesh.position.copy(position); explosionGroup.add(shockwaveMesh);
    new TWEEN.Tween(shockwaveMesh.scale).to({ x: explosionScale, y: explosionScale, z: explosionScale }, effectDuration * 0.6).easing(TWEEN.Easing.Quadratic.Out).start();
    new TWEEN.Tween(shockwaveMesh.material).to({ opacity: 0 }, effectDuration * 0.7).easing(TWEEN.Easing.Cubic.In).delay(effectDuration * 0.1).onComplete(checkCleanup).start();
    const positions = new Float32Array(particleCount * 3); const velocities = []; const colors = new Float32Array(particleCount * 3); const particleBaseColor = baseColor.clone().lerp(new THREE.Color(0xffaa00), 0.5);
    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = 0; positions[i * 3 + 1] = 0; positions[i * 3 + 2] = 0; const theta = Math.random() * Math.PI * 2; const phi = Math.acos(Math.random() * 2 - 1); const speed = (Math.random() * 0.8 + 0.2) * explosionScale * (1.5 + scaleMultiplier * 0.3);
        const velocity = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi)).multiplyScalar(speed); velocities.push(velocity);
        const initialColor = particleBaseColor.clone().lerp(new THREE.Color(0xffffdd), Math.random() * 0.6); colors[i * 3] = initialColor.r; colors[i * 3 + 1] = initialColor.g; colors[i * 3 + 2] = initialColor.b;
    }
    const particleGeom = new THREE.BufferGeometry(); particleGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3)); particleGeom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const particleMat = explosionParticleMaterial.clone(); particleMat.size = 0.3 * scaleMultiplier;
    particleSystem = new THREE.Points(particleGeom, particleMat); particleSystem.position.copy(position); explosionGroup.add(particleSystem);
    const particleTween = new TWEEN.Tween({ t: 0, sizeFactor: 1.0, opacity: 1.0 }).to({ t: 1, sizeFactor: 0.01, opacity: 0.0 }, effectDuration).easing(TWEEN.Easing.Exponential.Out)
        .onUpdate((obj) => {
            const posAttr = particleSystem.geometry.attributes.position; const colAttr = particleSystem.geometry.attributes.color; const easeT = TWEEN.Easing.Quadratic.Out(obj.t);
            for (let i = 0; i < particleCount; i++) {
                posAttr.setXYZ(i, velocities[i].x * easeT, velocities[i].y * easeT, velocities[i].z * easeT); const colorProgress = Math.min(1, obj.t * 1.5); const currentColor = new THREE.Color().setRGB(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
                const targetColor = new THREE.Color(0x551100); currentColor.lerp(targetColor, colorProgress * 0.8); colAttr.setXYZ(i, currentColor.r, currentColor.g, currentColor.b);
            }
            if (particleSystem.material) { particleSystem.material.size = obj.sizeFactor * 0.3 * scaleMultiplier; particleSystem.material.opacity = obj.opacity; }
            if (posAttr) posAttr.needsUpdate = true; if (colAttr) colAttr.needsUpdate = true;
        })
        .onComplete(checkCleanup).start();
    flashLight = new THREE.PointLight(baseColor.clone().lerp(new THREE.Color(0xffffff), 0.8), 15.0 * scaleMultiplier * scaleMultiplier, explosionScale * 2.5, 1.5); flashLight.position.copy(position); explosionGroup.add(flashLight);
    new TWEEN.Tween(flashLight).to({ intensity: 0 }, effectDuration * 0.4).easing(TWEEN.Easing.Quadratic.Out).onComplete(checkCleanup).start();
}

// --- Animation Loop (UPDATED for DAMPENERS) ---
let clock = new THREE.Clock(); // Use clock for time-based animation

function animate(time) {
    requestAnimationFrame(animate);
    const delta = clock.getDelta(); // Get time difference
    const elapsed = clock.getElapsedTime(); // Get total time elapsed

    TWEEN.update(time);
    controls.update();

    // Animate powerups
    powerupMeshes.forEach(p => {
        if (p.mesh) {
            p.mesh.rotation.y += (p.mesh.userData.spinSpeed || 0.015) * delta * 60; // Scale by delta
            p.mesh.rotation.x += (p.mesh.userData.spinSpeed || 0.015) * 0.5 * delta * 60;
        }
    });

    // Animate hearts
    const heartSpinSpeed = 0.5; // Radians per second
    if (playerHeartsGroup) playerHeartsGroup.rotation.y += heartSpinSpeed * delta;
    if (aiHeartsGroup) aiHeartsGroup.rotation.y -= heartSpinSpeed * delta;

    // Animate dampener floors
    dampenerFloorMeshes.forEach(mesh => {
        if (mesh && mesh.userData) {
            const originalY = mesh.userData.originalY || -0.11;
            mesh.position.y = originalY + Math.sin(elapsed * DAMPENER_PULSE_SPEED + mesh.position.x * 0.5) * DAMPENER_PULSE_AMOUNT; // Use elapsed time and position offset for variation
        }
    });


    composer.render();
}

// --- Input Handling Functions 
function handleCanvasMouseMove(event) {
    if (currentPlayer !== "player" || isResolving || gameOverState || currentPlanningMode !== "shoot") {
        if (plannedShootPath || currentHoverPos) {
            plannedShootPath = null;
            plannedShootCost = 0;
            currentHoverPos = null;
            clearPlanningCostUI();
            renderHighlights(); // Clear path highlights
        }
        return;
    }
    updateMouseCoords(event);
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(intersectionPlane);
    let targetPos = null;
    if (intersects.length > 0) {
        const gridPos = getGridCoords(intersects[0].point);
        // Can target floor or dampener
        if (isValid(gridPos.x, gridPos.y) && (grid[gridPos.y][gridPos.x] === "floor" || grid[gridPos.y][gridPos.x] === "dampener")) {
            targetPos = gridPos;
        }
    }
    const hoverChanged = !currentHoverPos || !targetPos || currentHoverPos.x !== targetPos.x || currentHoverPos.y !== targetPos.y;
    if (hoverChanged) {
        currentHoverPos = targetPos ? { ...targetPos } : null;
        if (targetPos && !(targetPos.x === playerPos.x && targetPos.y === playerPos.y)) {
            // Use the UPDATED pathfinding function
            const result = findShortestMissilePath(playerPos, targetPos, [aiPos]);
            if (result) {
                plannedShootPath = result.path;
                plannedShootCost = result.cost;
                setMessage(`Target: ${targetPos.x},${targetPos.y}. Est. Cost: ${result.cost} (Dampeners cost ${DAMPENER_MOVE_COST})`);
            } else {
                plannedShootPath = null;
                plannedShootCost = 0;
                setMessage(`Cannot reach target ${targetPos.x},${targetPos.y}.`);
            }
        } else {
            plannedShootPath = null;
            plannedShootCost = 0;
            setMessage(`Your Turn (Fuel: ${playerFuel}): Hover over a floor/dampener tile to target missile.`);
        }
        renderHighlights(); // Update path highlights
    }
}

function handleCanvasClick(event) {
    if (currentPlayer !== "player" || isResolving || gameOverState) return;
    updateMouseCoords(event);
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(intersectionPlane);
    if (intersects.length > 0) {
        const clickedGridPos = getGridCoords(intersects[0].point);
        if (isValid(clickedGridPos.x, clickedGridPos.y)) {
            const cellType = grid[clickedGridPos.y][clickedGridPos.x];
            const isWalkable = cellType === "floor" || cellType === "dampener";

            if (currentPlanningMode === "move") {
                if (isWalkable) {
                    handleMoveInput(clickedGridPos.x, clickedGridPos.y);
                } else { setMessage("Invalid move click: Must click on a floor or dampener tile."); }
            } else if (currentPlanningMode === "shoot") {
                if (isWalkable && plannedShootPath && plannedShootPath.length > 0 && plannedShootPath[plannedShootPath.length - 1].x === clickedGridPos.x && plannedShootPath[plannedShootPath.length - 1].y === clickedGridPos.y) {
                    const cost = plannedShootCost;
                    if (cost <= playerFuel) {
                        const action = { type: "shoot", target: clickedGridPos, _path: plannedShootPath, _cost: cost };
                        executeAction(action);
                    } else { setMessage(`Not enough fuel! Cost: ${cost}, Available: ${playerFuel}`); }
                } else if (isWalkable) {
                     setMessage("Invalid target click. Hover over a valid destination first to see the path and cost.");
                } else {
                    setMessage("Invalid click: Target must be a floor or dampener tile.");
                }
            }
        } else { setMessage("Invalid click: Click within the grid boundaries."); }
    } else { setMessage("Invalid click: Click within the grid area."); }
}
function updateMouseCoords(event) {
    const rect = canvasContainer.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}


// --- UI Update Functions 
function setMessage(msg) { messageArea.textContent = msg; }
function updatePhaseIndicator() {
    let phaseText = "Unknown";
    if (gameOverState) { phaseText = `Game Over! ${gameOverState.message}`; }
    else if (isResolving) { phaseText = `Executing ${currentPlayer}'s Action...`; }
    else if (currentPlayer === "player") { phaseText = "Your Turn"; }
    else if (currentPlayer === "ai") { phaseText = "AI Turn"; }
    phaseIndicator.textContent = phaseText;
}
function updateFuelInfo() { playerFuelInfo.textContent = `Your Fuel: ${playerFuel}`; aiFuelInfo.textContent = `AI Fuel: ${aiFuel}`; }
function updateHealthInfo() {
    playerHealthInfo.textContent = `Your Health: ${playerHealth} / ${INITIAL_HEALTH}`;
    aiHealthInfo.textContent = `AI Health: ${aiHealth} / ${INITIAL_HEALTH}`;
    updateHealthVisuals(playerHealth, playerHeartsGroup);
    updateHealthVisuals(aiHealth, aiHeartsGroup);
}
function updatePlanningCostUI(cost, available) {
    if (cost > 0) {
        planFuelCostInfo.textContent = `Est. Fuel Cost: ${cost} / Avail: ${available}`;
        planFuelCostInfo.style.color = cost <= available ? 'lightgreen' : 'salmon';
        planFuelCostInfo.style.fontWeight = 'bold';
    } else { planFuelCostInfo.textContent = ''; planFuelCostInfo.style.fontWeight = 'normal'; }
}
function clearPlanningCostUI() { planFuelCostInfo.textContent = ''; planFuelCostInfo.style.fontWeight = 'normal'; }
function enablePlanningControls() {
    if (gameOverState || isResolving || currentPlayer !== 'player') return;
    btnPlanMove.disabled = false; btnPlanShoot.disabled = false;
    renderHighlights();
}
function disablePlanningControls() {
    btnPlanMove.disabled = true; btnPlanShoot.disabled = true;
    plannedShootPath = null; plannedShootCost = 0; currentHoverPos = null;
    clearHighlights(); clearPlanningCostUI();
}


// --- Planning Phase Logic Functions (Player Only) --- (Unchanged)
function setPlanningMode(mode) {
    if (currentPlayer !== "player" || isResolving || gameOverState) return;
    currentPlanningMode = mode;
    plannedShootPath = null; plannedShootCost = 0; currentHoverPos = null;
    clearPlanningCostUI();
    btnPlanMove.classList.toggle("active", mode === "move"); btnPlanShoot.classList.toggle("active", mode === "shoot");
    if (mode === "move") { setMessage("Your Turn: Click an adjacent floor/dampener cell to move."); }
    else if (mode === "shoot") { setMessage(`Your Turn (Fuel: ${playerFuel}): Hover over a floor/dampener tile to target missile.`); }
    renderHighlights();
}
function handleMoveInput(targetX, targetY) {
    if (currentPlayer !== "player" || currentPlanningMode !== "move" || isResolving || gameOverState) return;
    const validMoves = getValidMoves(playerPos, aiPos);
    const isValidTarget = validMoves.some(move => move.x === targetX && move.y === targetY);
    if (isValidTarget) {
        const action = { type: "move", target: { x: targetX, y: targetY } };
        executeAction(action);
    } else {
        setMessage("Invalid move target. Click a highlighted adjacent square.");
    }
}


// --- ============================================== ---
// --- Pathfinding Logic (UPDATED for Dampener Cost) ---
// --- ============================================== ---

/**
 * Finds the shortest path for a missile using UCS (Uniform Cost Search).
 * Considers variable movement cost: BASE_MOVE_COST for normal floors, DAMPENER_MOVE_COST for dampener floors.
 * NO turn penalty is applied.
 * @param {object} startPos - {x, y} starting position.
 * @param {object} targetPos - {x, y} target position.
 * @param {Array<object>} opponentBlockers - Array of {x, y} positions blocked by opponents (usually just one).
 * @returns {object|null} - { path: Array<{x, y}>, cost: number } or null if not reachable.
 */
function findShortestMissilePath(startPos, targetPos, opponentBlockers = []) {
    const priorityQueue = []; // Stores [cost, state]
    const startState = { pos: startPos, path: [startPos], cost: 0 };
    priorityQueue.push([0, startState]);

    // Stores the minimum cost found so far to reach a cell { "x,y": cost }
    const minCostToCell = { [`${startPos.x},${startPos.y}`]: 0 };

    const blockerSet = new Set(opponentBlockers.map(p => `${p.x},${p.y}`));

    while (priorityQueue.length > 0) {
        // Get the state with the lowest cost
        priorityQueue.sort((a, b) => a[0] - b[0]);
        const [currentCost, currentState] = priorityQueue.shift();
        const currentCellKey = `${currentState.pos.x},${currentState.pos.y}`;

        // If we've already found a cheaper path to this cell, skip
        if (currentCost > (minCostToCell[currentCellKey] ?? Infinity)) {
            continue;
        }

        // Goal check
        if (currentState.pos.x === targetPos.x && currentState.pos.y === targetPos.y) {
            return { path: currentState.path, cost: currentState.cost };
        }

        // Explore neighbors
        const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
        for (const moveDir of directions) {
            const neighborPos = { x: currentState.pos.x + moveDir.dx, y: currentState.pos.y + moveDir.dy };

            // Check validity: within bounds, not a wall
            if (!isValid(neighborPos.x, neighborPos.y) || isWall(neighborPos.x, neighborPos.y)) {
                continue;
            }

            const neighborKey = `${neighborPos.x},${neighborPos.y}`;

            // Check validity: not blocked by opponent (unless it's the target itself)
            if (blockerSet.has(neighborKey) && (neighborPos.x !== targetPos.x || neighborPos.y !== targetPos.y)) {
                continue;
            }

            // Determine the cost to move to this neighbor
            const cellType = grid[neighborPos.y][neighborPos.x];
            let stepCost = BASE_MOVE_COST;
            if (cellType === "dampener") {
                stepCost = DAMPENER_MOVE_COST;
            }
           

            const newCost = currentCost + stepCost;

            // If this path is cheaper than any previous path to the neighbor
            if (newCost < (minCostToCell[neighborKey] ?? Infinity)) {
                minCostToCell[neighborKey] = newCost; // Update minimum cost
                const newState = {
                    pos: neighborPos,
                    path: [...currentState.path, neighborPos],
                    cost: newCost
                };
                priorityQueue.push([newCost, newState]); // Add to queue
            }
        }
    }

    return null; // Target not reachable
}



function findBestActionUCSBased() { //simple thinking AI that uses UCS to decide actions
  const startTime = performance.now();

  // 1) Attempt a UCS‐based shot if AI has enough fuel
  const shootResult = findShortestMissilePath(aiPos, playerPos, []);
  if (shootResult && shootResult.cost <= aiFuel) {
    console.log(
      `AI Decision: Shooting player. Path cost ${shootResult.cost}, remaining fuel ${aiFuel}.`
    );
    const action = {
      type: "shoot",
      target: { ...playerPos },
      _path: shootResult.path,
      _cost: shootResult.cost
    };
    console.log(`AI decision took ${(performance.now() - startTime).toFixed(2)} ms.`);
    return action;
  }

  // 2) No shot possible—find the nearest fuel cell via BFS
  let bestFuelPath = null;
  let bestFuelTarget = null;
  for (const upgradePos of powerUpPositions) {
    const path = findShortestPath_SimpleBFS(aiPos, upgradePos, [playerPos]);
    if (path && path.length > 1) {
      if (!bestFuelPath || path.length < bestFuelPath.length) {
        bestFuelPath = path;
        bestFuelTarget = upgradePos;
      }
    }
  }

  if (bestFuelPath) {
    const nextStep = bestFuelPath[1];
    console.log(
      `AI Decision: No shot—moving toward fuel at ${bestFuelTarget.x},${bestFuelTarget.y}. Next step ${nextStep.x},${nextStep.y}.`
    );
    const action = { type: "move", target: nextStep };
    console.log(`AI decision took ${(performance.now() - startTime).toFixed(2)} ms.`);
    return action;
  }

  // 3) Fallback: nowhere to shoot or refuel
  console.log("AI Decision: No viable shot or fuel path—staying put.");
  console.log(`AI decision took ${(performance.now() - startTime).toFixed(2)} ms.`);
  return { type: "stay" };
}


// --- Simple BFS for basic reachability  ---
function findShortestPath_SimpleBFS(startPos, targetPos, opponentBlockers = []) {
    const q = [{ pos: startPos, path: [startPos] }];
    const visited = new Set([`${startPos.x},${startPos.y}`]);
    const blockerSet = new Set(opponentBlockers.map(p => `${p.x},${p.y}`));
    while (q.length > 0) {
        const { pos, path } = q.shift();
        if (pos.x === targetPos.x && pos.y === targetPos.y) return path;
        const neighbors = getValidMoves(pos, { x: -1, y: -1 }); // Get adjacent walkable tiles
        for (const neighbor of neighbors) {
            const key = `${neighbor.x},${neighbor.y}`;
            // Can path through opponent *if* it's the target cell itself
            if (!visited.has(key) && !(blockerSet.has(key) && (neighbor.x !== targetPos.x || neighbor.y !== targetPos.y))) {
                visited.add(key);
                q.push({ pos: neighbor, path: [...path, neighbor] });
            }
        }
    }
    return null; 
}


// --- AI Trigger --- 
function triggerAiTurn() {
    disablePlanningControls(); // Ensure controls disabled before thinking starts
    setTimeout(() => {
        if (gameOverState) return;
        const aiAction = findBestActionUCSBased(); // Uses updated pathfinding internally
        if (!aiAction) { console.error("AI failed to find ANY action (even 'stay')!"); executeAction({ type: "stay" }); return; }
        executeAction(aiAction);
    }, AI_THINK_DELAY);
}


// --- Action Execution & Turn Management ---
async function executeAction(action) {
    if (isResolving || gameOverState) return;
    console.log(`Executing ${currentPlayer}'s action:`, action);
    isResolving = true; disablePlanningControls(); updatePhaseIndicator();
    const activePlayer = currentPlayer;
    let actionSuccess = true; let wasHit = false; let hitPlayer = null; let collectedPowerup = false; let actionMessageLog = [];
    const activePlayerMesh = activePlayer === "player" ? playerMesh : aiMesh;
    const activePlayerPosRef = activePlayer === "player" ? playerPos : aiPos;
    const opponentPos = activePlayer === "player" ? aiPos : playerPos;
    const missileCoreMaterial = activePlayer === "player" ? playerMissileCoreMaterial : aiMissileCoreMaterial;

    if (action.type === "move") {
        if (action.target.x === opponentPos.x && action.target.y === opponentPos.y) {
            actionMessageLog.push(`${activePlayer.toUpperCase()} move blocked by opponent!`); actionSuccess = false; await wait(ACTION_RESOLVE_DELAY);
        } else {
            await animateMove(activePlayerMesh, action.target);
            activePlayerPosRef.x = action.target.x; activePlayerPosRef.y = action.target.y;
            actionMessageLog.push(`${activePlayer.toUpperCase()} moved to ${action.target.x},${action.target.y}.`);
            const powerupIndex = powerUpPositions.findIndex(p => p.x === activePlayerPosRef.x && p.y === activePlayerPosRef.y);
            if (powerupIndex !== -1) {
                collectedPowerup = true; const collectedPos = powerUpPositions[powerupIndex]; removePowerup3D(collectedPos.x, collectedPos.y);
                if (activePlayer === "player") { playerFuel += FUEL_PER_UPGRADE; actionMessageLog.push(`Collected fuel cell! (+${FUEL_PER_UPGRADE} Fuel, Total: ${playerFuel})`); }
                else { aiFuel += FUEL_PER_UPGRADE; actionMessageLog.push(`Collected fuel cell! (+${FUEL_PER_UPGRADE} Fuel, Total: ${aiFuel})`); }
                updateFuelInfo();
            }
        }
    } else if (action.type === "shoot") {
        const path = action._path; const cost = action._cost; let currentFuel = activePlayer === "player" ? playerFuel : aiFuel;
        if (path && path.length > 1 && cost <= currentFuel) {
            if (activePlayer === "player") playerFuel -= cost; else aiFuel -= cost;
            updateFuelInfo(); actionMessageLog.push(`${activePlayer.toUpperCase()} missile launched (Cost: ${cost}).`);
            const targetPos = path[path.length - 1]; let explosionCompletePromise = null;
            await new Promise(resolveMissileImpact => { createGuidedMissileVisual(path, missileCoreMaterial, resolveMissileImpact); });
            const targetX = targetPos.x; const targetY = targetPos.y;
            if (isPowerupAt(targetX, targetY)) {
                actionMessageLog.push(`Missile hit a fuel cell at ${targetX},${targetY}!`);
                explosionCompletePromise = triggerFuelChainExplosion(targetX, targetY); const destroyedCoords = await explosionCompletePromise;
                if (destroyedCoords.length > 0) { actionMessageLog.push(`Chain reaction destroyed ${destroyedCoords.length} fuel cell(s).`); }
                wasHit = false;
            } else {
                const impactPosition3D = get3DPosition(targetX, targetY, CELL_3D_SIZE * 0.3);
                explosionCompletePromise = new Promise(resolveExplosion => { createExplosionEffect(impactPosition3D, missileCoreMaterial.color, 1.0, 1.0, resolveExplosion); });
                if (targetX === opponentPos.x && targetY === opponentPos.y) { wasHit = true; hitPlayer = activePlayer === "player" ? "ai" : "player"; actionMessageLog.push(`${hitPlayer.toUpperCase()} was hit!`); }
                else { actionMessageLog.push(`Missile impacted floor at ${targetX},${targetY}.`); }
                await explosionCompletePromise;
            }
            updateFuelInfo();
        } else { actionMessageLog.push(`${activePlayer.toUpperCase()} missile fizzled! (Check fuel/path).`); actionSuccess = false; wasHit = false; await wait(ACTION_RESOLVE_DELAY); }
    } else if (action.type === "stay") { actionMessageLog.push(`${activePlayer.toUpperCase()} did not move.`); await wait(ACTION_RESOLVE_DELAY); }
    setMessage(actionMessageLog.join(" "));
    if (wasHit && hitPlayer) {
        if (hitPlayer === 'player') playerHealth--; else aiHealth--;
        actionMessageLog.push(`${hitPlayer.toUpperCase()} health reduced to ${hitPlayer === 'player' ? playerHealth : aiHealth}.`);
        updateHealthInfo();
        if (playerHealth <= 0) { setMessage(actionMessageLog.join(" ")); endGame("AI Wins! Player eliminated.", "ai"); return; }
        else if (aiHealth <= 0) { setMessage(actionMessageLog.join(" ")); endGame("Player Wins! AI eliminated.", "player"); return; }
    }
    setMessage(actionMessageLog.join(" "));
    let nukeMessages = [];
    if (!gameOverState && activePlayer === 'ai') {
        setMessage("Resolving incoming nuke impacts..."); updatePhaseIndicator(); await wait(ACTION_RESOLVE_DELAY);
        const nukeResult = await resolveNukeImpacts();
        if (nukeResult && nukeResult.hitMessages.length > 0) {
            nukeMessages = nukeResult.hitMessages; setMessage(nukeMessages.join(" ")); await wait(ACTION_RESOLVE_DELAY * 2);
        } else { await wait(ACTION_RESOLVE_DELAY / 2); }
        if (playerHealth <= 0) { endGame("Player eliminated by nuke impact! AI Wins!", "ai"); return; }
        if (aiHealth <= 0) { endGame("AI eliminated by nuke impact! Player Wins!", "player"); return; }
    }
    if (!gameOverState) {
        currentPlayer = activePlayer === "player" ? "ai" : "player"; gamePhase = currentPlayer + "Turn";
        if (activePlayer === 'ai') { spawnRandomPowerup(); selectNextNukeLocations(); }
        isResolving = false;
        await wait(ACTION_RESOLVE_DELAY / 2);
        if (currentPlayer === "ai") { setMessage("AI is thinking..."); updatePhaseIndicator(); triggerAiTurn(); }
        else { setMessage("Your Turn: Plan your action. Check nuke indicators!"); updatePhaseIndicator(); enablePlanningControls(); setPlanningMode("move"); }
    } else { isResolving = false; }
}

// --- Fuel Cell Explosion Logic 
async function triggerFuelChainExplosion(startX, startY) {
    const explosionQueue = [{ x: startX, y: startY }]; const explodedThisTurn = new Set([`${startX},${startY}`]); const destroyedThisTurn = new Set(); const visualCompletionPromises = [];
    while (explosionQueue.length > 0) {
        const { x: currentX, y: currentY } = explosionQueue.shift(); const currentKey = `${currentX},${currentY}`;
        if (!isPowerupAt(currentX, currentY) || destroyedThisTurn.has(currentKey)) continue;
        destroyedThisTurn.add(currentKey); const pos3D = get3DPosition(currentX, currentY, CELL_3D_SIZE * 0.3);
        const visualPromise = new Promise(resolve => { createExplosionEffect(pos3D, powerupMaterial.color, FUEL_EXPLOSION_SCALE_MULTIPLIER, FUEL_EXPLOSION_PARTICLE_MULTIPLIER, resolve); });
        visualCompletionPromises.push(visualPromise);
        for (let dx = -FUEL_EXPLOSION_RADIUS; dx <= FUEL_EXPLOSION_RADIUS; dx++) { for (let dy = -FUEL_EXPLOSION_RADIUS; dy <= FUEL_EXPLOSION_RADIUS; dy++) { if (Math.abs(dx) + Math.abs(dy) > FUEL_EXPLOSION_RADIUS || (dx === 0 && dy === 0)) continue; const nearbyX = currentX + dx; const nearbyY = currentY + dy; const nearbyKey = `${nearbyX},${nearbyY}`; if (isValid(nearbyX, nearbyY) && isPowerupAt(nearbyX, nearbyY) && !destroyedThisTurn.has(nearbyKey)) { destroyedThisTurn.add(nearbyKey); } } }
        const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
        for (const dir of directions) { const adjX = currentX + dir.dx; const adjY = currentY + dir.dy; const adjKey = `${adjX},${adjY}`; if (isValid(adjX, adjY) && isPowerupAt(adjX, adjY) && !explodedThisTurn.has(adjKey)) { explodedThisTurn.add(adjKey); explosionQueue.push({ x: adjX, y: adjY }); } }
    }
    await Promise.all(visualCompletionPromises);
    const destroyedCoordsList = []; destroyedThisTurn.forEach(key => { const [x, y] = key.split(',').map(Number); if (isPowerupAt(x, y)) { removePowerup3D(x, y); destroyedCoordsList.push({ x, y }); } });
    console.log(`Fuel chain reaction finished. Destroyed cells: ${destroyedCoordsList.length}`);
    return destroyedCoordsList;
}


// --- Animate Move Function --- (Unchanged)
function animateMove(mesh, targetGridPos) {
    return new Promise((resolve) => {
        const startPos3D = mesh.position.clone();
        const targetY = mesh.userData.type === 'player' ? (CELL_3D_SIZE * 0.9) / 2 : (CELL_3D_SIZE * 1.0) / 2;
        const targetPos3D = get3DPosition(targetGridPos.x, targetGridPos.y, targetY);
        const hopHeight = CELL_3D_SIZE * 0.3;
        const midPos3D = new THREE.Vector3((startPos3D.x + targetPos3D.x) / 2, Math.max(startPos3D.y, targetPos3D.y) + hopHeight, (startPos3D.z + targetPos3D.z) / 2);
        new TWEEN.Tween(startPos3D).to(midPos3D, MOVEMENT_DURATION * 0.5).easing(TWEEN.Easing.Quadratic.Out)
            .onUpdate(() => { mesh.position.copy(startPos3D); })
            .onComplete(() => {
                new TWEEN.Tween(startPos3D).to(targetPos3D, MOVEMENT_DURATION * 0.5).easing(TWEEN.Easing.Quadratic.In)
                    .onUpdate(() => { mesh.position.copy(startPos3D); })
                    .onComplete(resolve).start();
            }).start();
    });
}

// --- Utility Wait Function 
function wait(duration) { return new Promise(resolve => setTimeout(resolve, duration)); }


// --- Powerup Logic Functions 
function spawnInitialPowerups() {
  // 1) Clear old state
  powerupMeshes.forEach(p => disposeMesh(p.mesh));
  powerupMeshes = [];
  powerUpPositions = [];

  // 2) Gather all available cells
  const availableCells = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if ((grid[y][x] === 'floor' || grid[y][x] === 'dampener') &&
          !(x === playerPos.x && y === playerPos.y) &&
          !(x === aiPos.x     && y === aiPos.y)) {
        availableCells.push({ x, y });
      }
    }
  }

  // 3) Split into “near player” vs “near AI”
  const nearPlayer = [];
  const nearAI     = [];
  availableCells.forEach(cell => {
    const dp = Math.hypot(cell.x - playerPos.x, cell.y - playerPos.y);
    const da = Math.hypot(cell.x - aiPos.x,     cell.y - aiPos.y);
    if (dp <= da) nearPlayer.push(cell);
    else          nearAI.push(cell);
  });

  // 4) Shuffle each pool
  [nearPlayer, nearAI].forEach(pool => {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  });

  // 5) Take half from each (rounding)
  const halfCount = Math.floor(INITIAL_POWERUP_COUNT / 2);
  let selected    = nearPlayer.slice(0, halfCount)
                    .concat(nearAI.slice(0, INITIAL_POWERUP_COUNT - halfCount));

  // 6) Backfill if any pool was too small
  if (selected.length < INITIAL_POWERUP_COUNT) {
    for (const cell of availableCells) {
      if (selected.length >= INITIAL_POWERUP_COUNT) break;
      if (!selected.some(p => p.x === cell.x && p.y === cell.y)) {
        selected.push(cell);
      }
    }
  }

  // 7) Instantiate
  selected.forEach(({ x, y }) => {
    powerUpPositions.push({ x, y });
    const mesh = createPowerup3D(x, y);
    if (mesh) powerupMeshes.push(mesh);
  });

  console.log(`Spawned ${selected.length}/${INITIAL_POWERUP_COUNT} powerups (half‐and‐half).`);
}


function spawnRandomPowerup() {
    if (powerUpPositions.length >= MAX_POWERUPS) return;
    let emptyCells = [];
    for (let y = 0; y < GRID_SIZE; y++) { for (let x = 0; x < GRID_SIZE; x++) { if (grid[y][x] === 'floor' || grid[y][x] === 'dampener') { if (!(x === playerPos.x && y === playerPos.y) && !(x === aiPos.x && y === aiPos.y) && !isPowerupAt(x, y)) emptyCells.push({ x, y }); } } } // Can spawn on dampeners
    if (emptyCells.length > 0) {
        const spawnPos = emptyCells[Math.floor(Math.random() * emptyCells.length)]; console.log(`Spawning new fuel cell at ${spawnPos.x}, ${spawnPos.y}`);
        powerUpPositions.push({ x: spawnPos.x, y: spawnPos.y }); const np = createPowerup3D(spawnPos.x, spawnPos.y); if (np) powerupMeshes.push(np);
    } else { console.log("No empty cells for powerup."); }
}


// --- Game Over Function --- (Unchanged)
function endGame(message, winner) {
    console.log("Game Over:", message);
    gamePhase = "gameOver"; gameOverState = { winner: winner, message: message };
    setMessage(message); updatePhaseIndicator(); disablePlanningControls(); clearNukeIndicators();
    isResolving = false;
}


// --- Utility Functions --- (UPDATED for dampeners)
function isValid(x, y) { return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE; }
function isWall(x, y) { return isValid(x, y) && grid[y][x] === "wall"; }
function isPowerupAt(x, y) { return powerUpPositions.some(p => p.x === x && p.y === y); }
function getValidMoves(unitPos, opponentPosToBlock) {
    const moves = [];
    const directions = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
    directions.forEach(dir => {
        const nextX = unitPos.x + dir.dx; const nextY = unitPos.y + dir.dy;
        // Check if valid, not a wall, and not blocked by opponent
        if (isValid(nextX, nextY) && grid[nextY][nextX] !== "wall" && !(nextX === opponentPosToBlock?.x && nextY === opponentPosToBlock?.y)) {
            moves.push({ x: nextX, y: nextY });
        }
    });
    return moves;
}
function distance(pos1, pos2) { return Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y); }
function findNearestPowerup(pos, powerupList = powerUpPositions) {
    let minDist = Infinity; let nearest = null;
    powerupList.forEach(p => { const d = distance(pos, p); if (d < minDist) { minDist = d; nearest = p; } });
    return nearest;
}


// --- Start Game ---
init();