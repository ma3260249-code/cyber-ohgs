import * as THREE from "three";
import { Client, Callbacks, type Room } from "@colyseus/sdk";
import "./style.css";

type PlayerView = { x: number; y: number; z: number; displayName: string };
type WorldStateView = { players: Map<string, PlayerView> };

const SERVER_URL = import.meta.env.VITE_COLYSEUS_URL || "wss://aornlaso-server.onrender.com";
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const sceneRoot = $("scene");
const statusLine = $("status-line");
const joinButton = $("join-button") as HTMLButtonElement;
const nameInput = $("player-name") as HTMLInputElement;
const connectionDot = $("connection-dot");
const connectionLabel = $("connection-label");
const playersList = $("players-list");
const playerCount = $("player-count");
const systemLog = $("system-log");

let room: Room<WorldStateView> | null = null;
let joined = false;
let localX = 0;
let localZ = 0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080b16);
scene.fog = new THREE.FogExp2(0x080b16, 0.018);
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
camera.position.set(0, 15, 27);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
renderer.outputColorSpace = THREE.SRGBColorSpace;
sceneRoot.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0x8b9bc8, 1.8));
const keyLight = new THREE.PointLight(0xffd99a, 85, 100);
keyLight.position.set(0, 8, 4);
scene.add(keyLight);

const starGeometry = new THREE.BufferGeometry();
const starPositions: number[] = [];
for (let i = 0; i < 900; i++) {
  starPositions.push((Math.random() - 0.5) * 180, (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 150);
}
starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(starPositions, 3));
const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xd8d8ee, size: 0.22 }));
scene.add(stars);

const grid = new THREE.GridHelper(120, 40, 0x665b46, 0x292c3b);
grid.position.y = -4;
(scene.add(grid));

const planet = new THREE.Mesh(
  new THREE.SphereGeometry(4.2, 48, 48),
  new THREE.MeshStandardMaterial({ color: 0x315b78, roughness: 0.88, metalness: 0.05 })
);
planet.position.set(0, 0, -14);
scene.add(planet);
const atmosphere = new THREE.Mesh(
  new THREE.SphereGeometry(4.45, 48, 48),
  new THREE.MeshBasicMaterial({ color: 0x6bb8e5, transparent: true, opacity: 0.12, side: THREE.BackSide })
);
atmosphere.position.copy(planet.position);
scene.add(atmosphere);

const avatarGeometry = new THREE.CapsuleGeometry(0.55, 1.1, 4, 8);
const avatars = new Map<string, THREE.Mesh>();
const avatarMaterials = new Map<string, THREE.MeshStandardMaterial>();

function resize() {
  const width = sceneRoot.clientWidth || 640;
  const height = sceneRoot.clientHeight || 340;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
window.addEventListener("resize", resize);
resize();

function renderPlayers(state?: WorldStateView) {
  if (!state?.players) return;
  const active = new Set<string>();
  const names: string[] = [];
  state.players.forEach((player, sessionId) => {
    active.add(sessionId);
    names.push(player.displayName || "مستكشف");
    let avatar = avatars.get(sessionId);
    if (!avatar) {
      const material = new THREE.MeshStandardMaterial({
        color: avatars.size === 0 ? 0xe2bd70 : 0x76b9d9,
        roughness: 0.55
      });
      avatar = new THREE.Mesh(avatarGeometry, material);
      avatar.position.y = -2.2;
      scene.add(avatar);
      avatars.set(sessionId, avatar);
      avatarMaterials.set(sessionId, material);
    }
    avatar.position.x = player.x;
    avatar.position.z = player.z;
  });
  for (const [id, avatar] of avatars) {
    if (!active.has(id)) {
      scene.remove(avatar);
      avatar.geometry.dispose();
      (avatar.material as THREE.Material).dispose();
      avatars.delete(id);
      avatarMaterials.delete(id);
    }
  }
  playerCount.textContent = String(names.length);
  playersList.innerHTML = names.length
    ? names.map((name) => `<span class="player-chip">✦ ${escapeHtml(name)}</span>`).join("")
    : '<p class="empty">لم يدخل أحد إلى العالم بعد</p>';
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char] || char);
}

async function joinWorld() {
  if (joined) return;
  joinButton.disabled = true;
  statusLine.textContent = "جارٍ الاتصال بخادم العالم…";
  try {
    const client = new Client(SERVER_URL);
    room = await client.joinOrCreate<WorldStateView>("world", {
      displayName: nameInput.value.trim().slice(0, 24) || "مستكشف"
    });
    joined = true;
      document.body.classList.add("in-world");
    connectionDot.classList.add("online");
    connectionLabel.textContent = "متصل";
    statusLine.textContent = `متصل بالعالم · ${room.sessionId.slice(0, 8)}`;
    joinButton.textContent = "أنت داخل العالم";
    room.onStateChange((state) => renderPlayers(state as WorldStateView));
    renderPlayers(room.state);
    room.onMessage("system", (message: string) => {
      systemLog.textContent = message;
    });
    room.onLeave(() => {
      joined = false;
      room = null;
      connectionDot.classList.remove("online");
      connectionLabel.textContent = "غير متصل";
      statusLine.textContent = "انقطع الاتصال. يمكنك المحاولة مجدداً.";
      joinButton.disabled = false;
      joinButton.textContent = "إعادة الاتصال";
      avatars.forEach((avatar) => scene.remove(avatar));
      avatars.clear();
      playerCount.textContent = "0";
      playersList.innerHTML = '<p class="empty">لم يدخل أحد إلى العالم بعد</p>';
    });
  } catch (error) {
    console.error(error);
    statusLine.textContent = "تعذر الاتصال. تحقق من تشغيل الخادم وعنوانه.";
    joinButton.disabled = false;
  }
}
joinButton.addEventListener("click", joinWorld);

const moveStep = 1.25;
function move(direction: string) {
  if (!room || !joined) {
    statusLine.textContent = "ادخل العالم أولاً لتتمكن من الحركة.";
    return;
  }
  if (direction === "forward") localZ -= moveStep;
  if (direction === "back") localZ += moveStep;
  if (direction === "left") localX -= moveStep;
  if (direction === "right") localX += moveStep;
  localX = Math.max(-95, Math.min(95, localX));
  localZ = Math.max(-95, Math.min(95, localZ));
  room.send("move", { x: localX, z: localZ });
}
document.querySelectorAll<HTMLButtonElement>("[data-move]").forEach((button) => {
  button.addEventListener("click", () => move(button.dataset.move || ""));
});

function animate() {
  requestAnimationFrame(animate);
  planet.rotation.y += 0.0009;
  stars.rotation.y += 0.00004;
  renderer.render(scene, camera);
}
animate();
