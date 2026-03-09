const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const GRAVITY = 1600;
const MOVE_SPEED = 290;
const JUMP_SPEED = 700;
const TOTAL_COINS = 10;
const MAX_DEATHS = 3;
const GROUND_Y = 492;
const PLAYER_SIZE = 36;
const COIN_RADIUS = 12;
const MIN_PLATFORM_COUNT = 10;
const MAX_PLATFORM_COUNT = 16;

const PLATFORM_TEMPLATES = [
  { xRange: [50, 90], y: 420, widthRange: [170, 210], isSpawn: true },
  { xRange: [260, 360], y: 410, widthRange: [140, 180] },
  { xRange: [150, 290], y: 325, widthRange: [125, 165] },
  { xRange: [360, 540], y: 275, widthRange: [130, 180] },
  { xRange: [640, 790], y: 390, widthRange: [130, 180] },
  { xRange: [650, 800], y: 235, widthRange: [115, 155] },
  { xRange: [430, 610], y: 170, widthRange: [110, 145] },
  { xRange: [220, 410], y: 225, widthRange: [120, 160] },
  { xRange: [95, 220], y: 145, widthRange: [110, 145] },
  { xRange: [520, 700], y: 445, widthRange: [120, 165] },
  { xRange: [720, 850], y: 335, widthRange: [110, 150] },
  { xRange: [60, 175], y: 285, widthRange: [110, 145] },
  { xRange: [500, 650], y: 350, widthRange: [120, 150] },
  { xRange: [760, 865], y: 165, widthRange: [95, 125] },
  { xRange: [300, 470], y: 120, widthRange: [110, 140] },
  { xRange: [560, 760], y: 95, widthRange: [95, 130] }
];

const input = {
  left: false,
  right: false,
  jump: false,
  jumpPressed: false
};

let level;
let player;
let coins;
let deaths;
let collectedCoins;
let gameState;
let lastTime = 0;
let audioContext;

function getAudioContext() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      return null;
    }

    audioContext = new AudioContextClass();
  }

  return audioContext;
}

function playSound({ frequency, duration, type, volume, endFrequency = frequency }) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    context.resume();
  }

  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const now = context.currentTime;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);

  gainNode.gain.setValueAtTime(volume, now);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playJumpSound() {
  playSound({
    frequency: 340,
    endFrequency: 520,
    duration: 0.12,
    type: "square",
    volume: 0.05
  });
}

function playLandSound() {
  playSound({
    frequency: 220,
    endFrequency: 110,
    duration: 0.1,
    type: "triangle",
    volume: 0.06
  });
}

function playCoinSound() {
  playSound({
    frequency: 620,
    endFrequency: 880,
    duration: 0.08,
    type: "square",
    volume: 0.04
  });
}

function playSpikeDeathSound() {
  playSound({
    frequency: 240,
    endFrequency: 90,
    duration: 0.18,
    type: "sawtooth",
    volume: 0.06
  });
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(items) {
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function createPlatform(template) {
  const width = randomInt(template.widthRange[0], template.widthRange[1]);
  const maxX = Math.min(template.xRange[1], WIDTH - width - 20);
  const x = randomInt(template.xRange[0], Math.max(template.xRange[0], maxX));

  return {
    x,
    y: template.y,
    width,
    height: 18,
    type: "platform",
    isSpawn: Boolean(template.isSpawn)
  };
}

function getSpikesOnPlatform(platform, spikes) {
  return spikes.filter((spike) => spike.y === platform.y && spike.x < platform.x + platform.width && spike.x + spike.width > platform.x);
}

function getSafeSegments(platform, spikes) {
  let segments = [{ start: platform.x + 22, end: platform.x + platform.width - 22 }];

  for (const spike of spikes) {
    const blockedStart = spike.x - 18;
    const blockedEnd = spike.x + spike.width + 18;
    const nextSegments = [];

    for (const segment of segments) {
      if (blockedEnd <= segment.start || blockedStart >= segment.end) {
        nextSegments.push(segment);
        continue;
      }

      if (blockedStart > segment.start) {
        nextSegments.push({ start: segment.start, end: blockedStart });
      }

      if (blockedEnd < segment.end) {
        nextSegments.push({ start: blockedEnd, end: segment.end });
      }
    }

    segments = nextSegments;
  }

  return segments.filter((segment) => segment.end - segment.start >= 34);
}

function createLevel() {
  const spawnTemplate = PLATFORM_TEMPLATES.find((template) => template.isSpawn);
  const otherTemplates = shuffle(PLATFORM_TEMPLATES.filter((template) => !template.isSpawn));
  const platformCount = randomInt(MIN_PLATFORM_COUNT, Math.min(MAX_PLATFORM_COUNT, PLATFORM_TEMPLATES.length));
  const platforms = [
    { x: 0, y: GROUND_Y, width: WIDTH, height: HEIGHT - GROUND_Y, type: "ground" },
    createPlatform(spawnTemplate),
    ...otherTemplates.slice(0, platformCount - 1).map(createPlatform)
  ];

  const spawnPlatform = platforms.find((platform) => platform.isSpawn);
  const spikes = [];

  for (const platform of shuffle(platforms.filter((entry) => entry.type === "platform" && !entry.isSpawn)).slice(0, 3)) {
    const maxWidth = Math.min(62, platform.width - 36);

    if (maxWidth < 36) {
      continue;
    }

    const width = randomInt(36, maxWidth);
    const x = randomInt(platform.x + 16, platform.x + platform.width - width - 16);
    spikes.push({ x, y: platform.y, width, height: 20 });
  }

  return {
    groundY: GROUND_Y,
    spawn: {
      x: spawnPlatform.x + 24,
      y: spawnPlatform.y - PLAYER_SIZE
    },
    platforms,
    spikes
  };
}

function buildCoinSlots(currentLevel) {
  const primarySlots = [];
  const overflowSlots = [];

  for (const platform of currentLevel.platforms) {
    const spikes = getSpikesOnPlatform(platform, currentLevel.spikes);
    const safeSegments = getSafeSegments(platform, spikes);
    const baseY = platform.type === "ground" ? platform.y - 34 : platform.y - 28;
    const platformSlots = [];

    for (const segment of safeSegments) {
      const width = segment.end - segment.start;
      const center = (segment.start + segment.end) / 2;

      platformSlots.push({ x: center, y: baseY });

      if (width > 84) {
        platformSlots.push({ x: segment.start + width * 0.3, y: baseY - 6 });
        platformSlots.push({ x: segment.start + width * 0.7, y: baseY - 6 });
      }
    }

    if (platformSlots.length > 0) {
      const shuffledPlatformSlots = shuffle(platformSlots);
      primarySlots.push(shuffledPlatformSlots[0]);
      overflowSlots.push(...shuffledPlatformSlots.slice(1));
    }
  }

  return {
    primary: shuffle(primarySlots),
    overflow: shuffle(overflowSlots)
  };
}

function slotIntersectsSpawn(slot, currentLevel) {
  const closestX = Math.max(currentLevel.spawn.x, Math.min(slot.x, currentLevel.spawn.x + PLAYER_SIZE));
  const closestY = Math.max(currentLevel.spawn.y, Math.min(slot.y, currentLevel.spawn.y + PLAYER_SIZE));
  const dx = slot.x - closestX;
  const dy = slot.y - closestY;

  return dx * dx + dy * dy < COIN_RADIUS * COIN_RADIUS;
}

function createCoinsForLevel(currentLevel, remainingCoins) {
  const slotGroups = buildCoinSlots(currentLevel);
  const slots = slotGroups.primary.filter((slot) => !slotIntersectsSpawn(slot, currentLevel));

  if (slots.length < remainingCoins) {
    const validOverflowSlots = slotGroups.overflow.filter((slot) => !slotIntersectsSpawn(slot, currentLevel));
    slots.push(...validOverflowSlots.slice(0, remainingCoins - slots.length));
  }

  return slots.slice(0, remainingCoins).map((slot) => ({
    x: Math.round(slot.x),
    y: Math.round(slot.y),
    radius: COIN_RADIUS,
    collected: false,
    bob: Math.random() * Math.PI * 2
  }));
}

function resetGame() {
  collectedCoins = 0;
  deaths = 0;
  gameState = "playing";
  player = {
    x: 0,
    y: 0,
    width: PLAYER_SIZE,
    height: PLAYER_SIZE,
    vx: 0,
    vy: 0,
    onGround: false,
    squish: 0
  };
  respawnPlayer();
}

function respawnPlayer() {
  level = createLevel();
  coins = createCoinsForLevel(level, TOTAL_COINS - collectedCoins);
  player.x = level.spawn.x;
  player.y = level.spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.squish = 1;
  input.jump = false;
  input.jumpPressed = false;
}

function getCollectedCoins() {
  return collectedCoins;
}

function killPlayer() {
  if (gameState !== "playing") {
    return;
  }

  deaths += 1;

  if (deaths >= MAX_DEATHS) {
    gameState = "lost";
    return;
  }

  respawnPlayer();
}

function clampPlayerToWorld() {
  if (player.x < 0) {
    player.x = 0;
  }

  if (player.x + player.width > WIDTH) {
    player.x = WIDTH - player.width;
  }

  if (player.y > HEIGHT + 100) {
    killPlayer();
  }
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function circleIntersectsPlayer(circle) {
  const closestX = Math.max(player.x, Math.min(circle.x, player.x + player.width));
  const closestY = Math.max(player.y, Math.min(circle.y, player.y + player.height));
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy < circle.radius * circle.radius;
}

function updatePlayer(dt) {
  if (gameState !== "playing") {
    player.vx = 0;
    return;
  }

  const wasOnGround = player.onGround;
  player.vx = 0;

  if (input.left) {
    player.vx -= MOVE_SPEED;
  }

  if (input.right) {
    player.vx += MOVE_SPEED;
  }

  if (input.jumpPressed && player.onGround) {
    player.vy = -JUMP_SPEED;
    player.onGround = false;
    player.squish = 1;
    playJumpSound();
  }

  player.vy += GRAVITY * dt;
  player.x += player.vx * dt;

  const horizontalBounds = { x: player.x, y: player.y, width: player.width, height: player.height };
  for (const platform of level.platforms) {
    if (!rectsOverlap(horizontalBounds, platform)) {
      continue;
    }

    if (player.vx > 0) {
      player.x = platform.x - player.width;
    } else if (player.vx < 0) {
      player.x = platform.x + platform.width;
    }

    horizontalBounds.x = player.x;
  }

  player.y += player.vy * dt;
  player.onGround = false;

  const verticalBounds = { x: player.x, y: player.y, width: player.width, height: player.height };
  for (const platform of level.platforms) {
    if (!rectsOverlap(verticalBounds, platform)) {
      continue;
    }

    if (player.vy > 0) {
      player.y = platform.y - player.height;
      player.vy = 0;
      player.onGround = true;
    } else if (player.vy < 0) {
      player.y = platform.y + platform.height;
      player.vy = 0;
    }

    verticalBounds.y = player.y;
  }

  clampPlayerToWorld();
  if (!wasOnGround && player.onGround && player.vy === 0) {
    playLandSound();
  }

  player.squish = Math.max(0, player.squish - dt * 4);
  input.jumpPressed = false;
}

function updateCoins(dt) {
  for (const coin of coins) {
    coin.bob += dt * 4;

    if (!coin.collected && circleIntersectsPlayer(coin)) {
      coin.collected = true;
      collectedCoins += 1;
      playCoinSound();
    }
  }

  if (collectedCoins === TOTAL_COINS) {
    gameState = "won";
  }
}

function updateSpikes() {
  const hurtbox = {
    x: player.x + 5,
    y: player.y + 5,
    width: player.width - 10,
    height: player.height - 5
  };

  for (const spike of level.spikes) {
    const spikeHitbox = {
      x: spike.x,
      y: spike.y - spike.height,
      width: spike.width,
      height: spike.height
    };

    if (rectsOverlap(hurtbox, spikeHitbox)) {
      playSpikeDeathSound();
      killPlayer();
      return;
    }
  }
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#87d6ff");
  sky.addColorStop(0.7, "#8be1ff");
  sky.addColorStop(1, "#d2f5ff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.arc(130, 90, 40, 0, Math.PI * 2);
  ctx.arc(165, 88, 30, 0, Math.PI * 2);
  ctx.arc(200, 96, 24, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(720, 80, 32, 0, Math.PI * 2);
  ctx.arc(752, 72, 24, 0, Math.PI * 2);
  ctx.arc(783, 82, 20, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#71bb5e";
  ctx.fillRect(0, level.groundY - 12, WIDTH, 12);
}

function drawPlatforms() {
  for (const platform of level.platforms) {
    if (platform.type === "ground") {
      ctx.fillStyle = "#5e4540";
    } else {
      ctx.fillStyle = "#7b5d57";
    }

    ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
    ctx.fillStyle = "#9be16e";
    ctx.fillRect(platform.x, platform.y, platform.width, 6);
  }
}

function drawSpikes() {
  for (const spike of level.spikes) {
    const count = Math.floor(spike.width / 18);
    const baseWidth = spike.width / count;

    for (let i = 0; i < count; i += 1) {
      const x = spike.x + i * baseWidth;
      ctx.fillStyle = "#ff5f8f";
      ctx.beginPath();
      ctx.moveTo(x, spike.y);
      ctx.lineTo(x + baseWidth / 2, spike.y - spike.height);
      ctx.lineTo(x + baseWidth, spike.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawCoins() {
  for (const coin of coins) {
    if (coin.collected) {
      continue;
    }

    const bobOffset = Math.sin(coin.bob) * 5;
    ctx.fillStyle = "#ffd84d";
    ctx.beginPath();
    ctx.arc(coin.x, coin.y + bobOffset, coin.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c79800";
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

function drawPlayer() {
  const squashX = 1 + player.squish * 0.25;
  const squashY = 1 - player.squish * 0.2;
  const centerX = player.x + player.width / 2;
  const centerY = player.y + player.height / 2;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.scale(squashX, squashY);

  ctx.fillStyle = "#53d58d";
  ctx.beginPath();
  ctx.ellipse(0, 0, player.width / 2, player.height / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#173927";
  ctx.beginPath();
  ctx.arc(-7, -3, 3.5, 0, Math.PI * 2);
  ctx.arc(7, -3, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#173927";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 4, 8, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();

  ctx.restore();
}

function drawHud() {
  ctx.fillStyle = "rgba(16, 25, 47, 0.72)";
  ctx.fillRect(18, 18, 220, 86);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px Arial";
  ctx.fillText(`Coins: ${getCollectedCoins()}/${TOTAL_COINS}`, 32, 50);
  ctx.fillText(`Deaths: ${deaths}/${MAX_DEATHS}`, 32, 84);
}

function drawOverlay() {
  if (gameState === "playing") {
    return;
  }

  ctx.fillStyle = "rgba(10, 16, 30, 0.6)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "bold 54px Arial";
  ctx.fillText(gameState === "won" ? "You Win!" : "Game Over", WIDTH / 2, 210);

  ctx.font = "24px Arial";
  if (gameState === "won") {
    ctx.fillText("The blob grabbed all 10 coins.", WIDTH / 2, 260);
  } else {
    ctx.fillText("The blob died 3 times and lost the run.", WIDTH / 2, 260);
  }

  ctx.fillText("Press R to restart.", WIDTH / 2, 310);
  ctx.textAlign = "start";
}

function update(dt) {
  updatePlayer(dt);

  if (gameState === "playing") {
    updateCoins(dt);
    updateSpikes();
  }
}

function render() {
  drawBackground();
  drawPlatforms();
  drawCoins();
  drawSpikes();
  drawPlayer();
  drawHud();
  drawOverlay();
}

function gameLoop(timestamp) {
  if (!lastTime) {
    lastTime = timestamp;
  }

  const dt = Math.min((timestamp - lastTime) / 1000, 1 / 30);
  lastTime = timestamp;

  update(dt);
  render();
  requestAnimationFrame(gameLoop);
}

function setKeyState(code, pressed) {
  if (code === "ArrowLeft" || code === "KeyA") {
    input.left = pressed;
  }

  if (code === "ArrowRight" || code === "KeyD") {
    input.right = pressed;
  }

  if (code === "ArrowUp" || code === "KeyW" || code === "Space") {
    if (pressed && !input.jump) {
      input.jumpPressed = true;
    }

    input.jump = pressed;
  }
}

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyR") {
    resetGame();
    return;
  }

  if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(event.code)) {
    event.preventDefault();
  }

  setKeyState(event.code, true);
});

window.addEventListener("keyup", (event) => {
  setKeyState(event.code, false);
});

resetGame();
requestAnimationFrame(gameLoop);
