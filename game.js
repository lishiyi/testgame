// ==========================================
// 经典贪吃蛇 · 进阶版（道具系统 + 动态关卡障碍）
// ==========================================

const GRID_COUNT = 20;          // 棋盘格数：20 x 20
const BASE_SIZE = 400;          // 逻辑画布尺寸 (px)
const CELL_SIZE = BASE_SIZE / GRID_COUNT;
const INITIAL_INTERVAL = 140;   // 初始每步间隔 (毫秒)
const MIN_INTERVAL = 72;        // 最快基础速度上限 (毫秒)
const SPEED_STEP = 2.5;         // 每 10 分加快的毫秒数
const POINTS_PER_LEVEL = 50;    // 每多少分升一级并新增障碍
const MAX_OBSTACLES = 18;       // 场上最大岩石数量上限，保证可玩空间
const STORAGE_KEY = 'classic_snake_best_score_v2';

// 道具配置表
const POWERUP_TYPES = {
  gold: {
    label: '金果 +30',
    color: 'hsl(43, 96%, 56%)'
  },
  ice: {
    label: '寒冰减速',
    color: 'hsl(196, 88%, 62%)',
    duration: 6.0
  },
  shield: {
    label: '穿墙破障',
    color: 'hsl(164, 82%, 50%)',
    duration: 7.5
  }
};

// DOM 元素引用
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score-value');
const levelEl = document.getElementById('level-value');
const bestScoreEl = document.getElementById('best-score-value');
const speedEl = document.getElementById('speed-value');
const buffBarEl = document.getElementById('buff-bar');
const levelBannerEl = document.getElementById('level-banner');
const overlayEl = document.getElementById('board-overlay');
const overlayTitleEl = document.getElementById('overlay-title');
const overlayDescEl = document.getElementById('overlay-desc');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const muteBtn = document.getElementById('mute-btn');

// 高清屏适配
function setupCanvasResolution() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = BASE_SIZE * dpr;
  canvas.height = BASE_SIZE * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
setupCanvasResolution();

// 游戏核心状态
let state = 'idle'; // 'idle' | 'running' | 'paused' | 'gameover' | 'won'
let snake = [];
let pendingGrowth = 0;
let direction = { x: 1, y: 0 };
let directionQueue = [];

let food = { x: 14, y: 10 };
let powerUp = null;          // { x, y, type: 'gold'|'ice'|'shield', ttl, maxTtl }
let powerUpCooldown = 4.5;   // 距离下次刷新特殊道具的秒数
let obstacles = [];          // Array<{ x, y, warnTimer }>

let iceTimer = 0;            // 寒冰减速剩余秒数
let shieldTimer = 0;         // 穿墙破障护盾剩余秒数
let bannerTimer = 0;

let particles = [];
let floatingTexts = [];      // 拾取飘字反馈 Array<{ x, y, text, color, life }>

let score = 0;
let level = 1;
let bestScore = loadBestScore();
let baseStepInterval = INITIAL_INTERVAL;
let lastFrameTime = 0;
let stepAccumulator = 0;
let soundEnabled = true;
let audioCtx = null;

bestScoreEl.textContent = String(bestScore);

// ------------------------------------------
// 本地最高分存取
// ------------------------------------------
function loadBestScore() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? Math.max(0, parseInt(saved, 10) || 0) : 0;
  } catch {
    return 0;
  }
}

function saveBestScore(value) {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // 忽略存储异常
  }
}

// ------------------------------------------
// Web Audio 合成复古音效
// ------------------------------------------
function playTone(type) {
  if (!soundEnabled) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtx) audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'eat') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(780, now + 0.08);
      gain.gain.setValueAtTime(0.13, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'powerup') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.setValueAtTime(760, now + 0.06);
      osc.frequency.exponentialRampToValueAtTime(1040, now + 0.16);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (type === 'smash') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.11);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'levelup') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(554, now + 0.07);
      osc.frequency.setValueAtTime(659, now + 0.14);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      osc.start(now);
      osc.stop(now + 0.26);
    } else if (type === 'gameover') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(92, now + 0.3);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.start(now);
      osc.stop(now + 0.32);
    }
  } catch {
    // 忽略音频错误
  }
}

// ------------------------------------------
// 辅助查询与有效速度计算
// ------------------------------------------
function getEffectiveInterval() {
  return iceTimer > 0 ? Math.round(baseStepInterval * 1.45) : baseStepInterval;
}

function isObstacleAt(x, y, solidOnly = false) {
  return obstacles.some((o) => o.x === x && o.y === y && (!solidOnly || o.warnTimer <= 0));
}

function isSnakeAt(x, y) {
  return snake.some((s) => s.x === x && s.y === y);
}

function countOpenNeighbors(x, y) {
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ];
  let open = 0;
  for (const d of dirs) {
    const nx = x + d.x;
    const ny = y + d.y;
    if (nx >= 0 && nx < GRID_COUNT && ny >= 0 && ny < GRID_COUNT && !isObstacleAt(nx, ny, false)) {
      open++;
    }
  }
  return open;
}

// ------------------------------------------
// 初始化与关卡障碍生成
// ------------------------------------------
function createInitialObstacles() {
  // 第 1 关自带 4 个对称四角战术石柱，远离出生通道 (y = 10)
  return [
    { x: 4, y: 4, warnTimer: 0 },
    { x: 15, y: 4, warnTimer: 0 },
    { x: 4, y: 15, warnTimer: 0 },
    { x: 15, y: 15, warnTimer: 0 }
  ];
}

function spawnLevelObstacles(count) {
  const head = snake[0];
  for (let n = 0; n < count; n++) {
    if (obstacles.length >= MAX_OBSTACLES) break;

    const candidates = [];
    // 保持最外圈 1 格通道畅通，避免贴墙走时被死角封死
    for (let y = 1; y < GRID_COUNT - 1; y++) {
      for (let x = 1; x < GRID_COUNT - 1; x++) {
        if (isSnakeAt(x, y) || isObstacleAt(x, y, false)) continue;
        if (food && food.x === x && food.y === y) continue;
        if (powerUp && powerUp.x === x && powerUp.y === y) continue;

        // 距离蛇头至少 5 格曼哈顿距离
        const dist = Math.abs(x - head.x) + Math.abs(y - head.y);
        if (dist < 5) continue;

        // 避开蛇头正前方 6 格直线轨迹
        let inFrontLine = false;
        for (let step = 1; step <= 6; step++) {
          if (head.x + direction.x * step === x && head.y + direction.y * step === y) {
            inFrontLine = true;
            break;
          }
        }
        if (inFrontLine) continue;

        // 避免障碍过于密集连成死胡同（周围 8 格最多允许已有 1 个障碍）
        let nearbyRocks = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (isObstacleAt(x + dx, y + dy, false)) nearbyRocks++;
          }
        }
        if (nearbyRocks > 1) continue;

        candidates.push({ x, y });
      }
    }

    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      // 新障碍先进行 2.2 秒闪烁预警，预警期间无碰撞伤害
      obstacles.push({ x: pick.x, y: pick.y, warnTimer: 2.2 });
    }
  }
}

function checkLevelUp() {
  const targetLevel = Math.floor(score / POINTS_PER_LEVEL) + 1;
  if (targetLevel > level) {
    level = targetLevel;
    playTone('levelup');
    spawnLevelObstacles(2);
    showLevelBanner(`Lv.${level} 关卡提升！新岩石将在 2 秒后落下`);
    updateHUD();
  }
}

function showLevelBanner(text) {
  levelBannerEl.textContent = text;
  levelBannerEl.classList.remove('hidden');
  bannerTimer = 2.4;
}

function initGameData() {
  snake = [
    { x: 6, y: 10 },
    { x: 5, y: 10 },
    { x: 4, y: 10 }
  ];
  pendingGrowth = 0;
  direction = { x: 1, y: 0 };
  directionQueue = [];

  score = 0;
  level = 1;
  baseStepInterval = INITIAL_INTERVAL;
  iceTimer = 0;
  shieldTimer = 0;
  bannerTimer = 0;
  levelBannerEl.classList.add('hidden');

  obstacles = createInitialObstacles();
  powerUp = null;
  powerUpCooldown = 4.0;
  particles = [];
  floatingTexts = [];

  spawnFood();
  updateHUD();
  renderBuffBar();
}

function startGame() {
  initGameData();
  state = 'running';
  stepAccumulator = 0;
  lastFrameTime = performance.now();
  pauseBtn.disabled = false;
  pauseBtn.textContent = '暂停';
  overlayEl.classList.add('hidden');
}

function togglePause() {
  if (state === 'running') {
    state = 'paused';
    pauseBtn.textContent = '继续';
    showOverlay('已暂停', '按空格键或点击下方按钮继续挑战。', '继续游戏');
  } else if (state === 'paused') {
    state = 'running';
    lastFrameTime = performance.now();
    pauseBtn.textContent = '暂停';
    overlayEl.classList.add('hidden');
  }
}

function endGame(won = false) {
  state = won ? 'won' : 'gameover';
  pauseBtn.disabled = true;
  pauseBtn.textContent = '暂停';
  if (!won) playTone('gameover');

  if (score > bestScore) {
    bestScore = score;
    saveBestScore(bestScore);
    updateHUD();
  }

  if (won) {
    showOverlay('完美通关！', `不可思议，你征服了所有关卡！最终得分 ${score}。`, '再来一局');
  } else {
    showOverlay('游戏结束', `闯至 Lv.${level} · 本局得分 ${score} · 最高纪录 ${bestScore}`, '再来一局');
  }
}

function showOverlay(title, desc, btnText) {
  overlayTitleEl.textContent = title;
  overlayDescEl.textContent = desc;
  startBtn.textContent = btnText;
  overlayEl.classList.remove('hidden');
}

function updateHUD() {
  scoreEl.textContent = String(score);
  levelEl.textContent = `Lv.${level}`;
  bestScoreEl.textContent = String(bestScore);
  const multiplier = (INITIAL_INTERVAL / getEffectiveInterval()).toFixed(1);
  speedEl.textContent = `${multiplier}x`;
}

function renderBuffBar() {
  const pills = [];
  if (shieldTimer > 0) {
    pills.push(`<span class="buff-pill" style="border-color: hsl(164, 78%, 45%); color: hsl(164, 88%, 72%);">护盾 ${shieldTimer.toFixed(1)}s</span>`);
  }
  if (iceTimer > 0) {
    pills.push(`<span class="buff-pill" style="border-color: hsl(196, 80%, 52%); color: hsl(196, 92%, 76%);">减速 ${iceTimer.toFixed(1)}s</span>`);
  }
  buffBarEl.innerHTML = pills.join('');
}

// ------------------------------------------
// 生成苹果、特殊道具与粒子特效
// ------------------------------------------
function findEmptyCells(requireOpenNeighbors = true) {
  const empty = [];
  for (let y = 0; y < GRID_COUNT; y++) {
    for (let x = 0; x < GRID_COUNT; x++) {
      if (isSnakeAt(x, y) || isObstacleAt(x, y, false)) continue;
      if (food && food.x === x && food.y === y) continue;
      if (powerUp && powerUp.x === x && powerUp.y === y) continue;
      if (requireOpenNeighbors && countOpenNeighbors(x, y) < 2) continue;
      empty.push({ x, y });
    }
  }
  return empty;
}

function spawnFood() {
  food = null;
  let cells = findEmptyCells(true);
  if (cells.length === 0) cells = findEmptyCells(false);
  if (cells.length === 0) {
    endGame(true);
    return;
  }
  food = cells[Math.floor(Math.random() * cells.length)];
}

function spawnPowerUp() {
  const cells = findEmptyCells(true);
  if (cells.length === 0) return;

  const types = ['gold', 'ice', 'shield'];
  const pickedType = types[Math.floor(Math.random() * types.length)];
  const pos = cells[Math.floor(Math.random() * cells.length)];

  powerUp = {
    x: pos.x,
    y: pos.y,
    type: pickedType,
    ttl: 9.5,
    maxTtl: 9.5
  };
}

function spawnBurst(gridX, gridY, hslColor, count = 10) {
  const cx = (gridX + 0.5) * CELL_SIZE;
  const cy = (gridY + 0.5) * CELL_SIZE;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.35;
    const speed = 45 + Math.random() * 75;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1,
      radius: 2 + Math.random() * 2.2,
      color: hslColor
    });
  }
}

function addFloatingText(gridX, gridY, text, color) {
  floatingTexts.push({
    x: (gridX + 0.5) * CELL_SIZE,
    y: (gridY + 0.2) * CELL_SIZE,
    text,
    color,
    life: 1
  });
}

// ------------------------------------------
// 移动、道具触发与碰撞判定
// ------------------------------------------
function queueDirection(nextDir) {
  if (state !== 'running') return;

  const refDir = directionQueue.length > 0
    ? directionQueue[directionQueue.length - 1]
    : direction;

  const isSame = nextDir.x === refDir.x && nextDir.y === refDir.y;
  const isOpposite = nextDir.x + refDir.x === 0 && nextDir.y + refDir.y === 0;
  if (isSame || isOpposite) return;

  if (directionQueue.length < 2) {
    directionQueue.push(nextDir);
  }
}

function applyPowerUp(item) {
  playTone('powerup');

  if (item.type === 'gold') {
    score += 30;
    pendingGrowth += 2;
    spawnBurst(item.x, item.y, '43, 96%, 58%', 14);
    addFloatingText(item.x, item.y, '+30 金果!', 'hsl(43, 96%, 64%)');
  } else if (item.type === 'ice') {
    score += 10;
    iceTimer = POWERUP_TYPES.ice.duration;
    pendingGrowth += 1;
    spawnBurst(item.x, item.y, '196, 90%, 64%', 12);
    addFloatingText(item.x, item.y, '寒冰减速!', 'hsl(196, 92%, 72%)');
  } else if (item.type === 'shield') {
    score += 10;
    shieldTimer = POWERUP_TYPES.shield.duration;
    pendingGrowth += 1;
    spawnBurst(item.x, item.y, '164, 85%, 56%', 12);
    addFloatingText(item.x, item.y, '穿墙碎石护盾!', 'hsl(164, 90%, 66%)');
  }

  baseStepInterval = Math.max(MIN_INTERVAL, INITIAL_INTERVAL - Math.floor(score / 10) * SPEED_STEP);
  powerUp = null;
  powerUpCooldown = 6.5;
  checkLevelUp();
  updateHUD();
  renderBuffBar();
}

function stepGame() {
  if (directionQueue.length > 0) {
    direction = directionQueue.shift();
  }

  const head = snake[0];
  let nextX = head.x + direction.x;
  let nextY = head.y + direction.y;

  // 1. 边界检测（护盾激活时可穿墙绕回对侧！）
  if (nextX < 0 || nextX >= GRID_COUNT || nextY < 0 || nextY >= GRID_COUNT) {
    if (shieldTimer > 0) {
      nextX = (nextX + GRID_COUNT) % GRID_COUNT;
      nextY = (nextY + GRID_COUNT) % GRID_COUNT;
    } else {
      endGame(false);
      return;
    }
  }

  // 2. 岩石障碍检测（仅已实体化的岩石有碰撞；护盾激活时可直接撞碎岩石得分！）
  const hitRockIndex = obstacles.findIndex(
    (o) => o.x === nextX && o.y === nextY && o.warnTimer <= 0
  );
  if (hitRockIndex !== -1) {
    if (shieldTimer > 0) {
      const rock = obstacles[hitRockIndex];
      obstacles.splice(hitRockIndex, 1);
      score += 5;
      playTone('smash');
      spawnBurst(rock.x, rock.y, '32, 18%, 62%', 12);
      addFloatingText(rock.x, rock.y, '碎石 +5', 'hsl(164, 85%, 68%)');
      checkLevelUp();
      updateHUD();
    } else {
      endGame(false);
      return;
    }
  }

  const willEatFood = Boolean(food && nextX === food.x && nextY === food.y);
  const willEatPowerUp = Boolean(powerUp && nextX === powerUp.x && nextY === powerUp.y);
  const willGrowThisStep = willEatFood || pendingGrowth > 0;

  // 3. 撞自身检测
  const bodyToCheck = willGrowThisStep ? snake : snake.slice(0, -1);
  if (bodyToCheck.some((seg) => seg.x === nextX && seg.y === nextY)) {
    endGame(false);
    return;
  }

  // 4. 推进蛇头
  snake.unshift({ x: nextX, y: nextY });

  if (willEatFood) {
    score += 10;
    baseStepInterval = Math.max(MIN_INTERVAL, INITIAL_INTERVAL - Math.floor(score / 10) * SPEED_STEP);
    playTone('eat');
    spawnBurst(food.x, food.y, '16, 90%, 62%', 10);
    checkLevelUp();
    updateHUD();
    spawnFood();
  } else if (pendingGrowth > 0) {
    pendingGrowth--;
  } else {
    snake.pop();
  }

  if (willEatPowerUp && powerUp) {
    applyPowerUp(powerUp);
  }
}

// ------------------------------------------
// 计时器更新（道具倒计时、Buff 持续时间、障碍预警）
// ------------------------------------------
function updateTimers(dtSeconds) {
  let buffChanged = false;

  if (iceTimer > 0) {
    iceTimer = Math.max(0, iceTimer - dtSeconds);
    buffChanged = true;
    if (iceTimer === 0) updateHUD();
  }

  if (shieldTimer > 0) {
    shieldTimer = Math.max(0, shieldTimer - dtSeconds);
    buffChanged = true;
  }

  if (buffChanged) {
    renderBuffBar();
  }

  if (bannerTimer > 0) {
    bannerTimer = Math.max(0, bannerTimer - dtSeconds);
    if (bannerTimer === 0) {
      levelBannerEl.classList.add('hidden');
    }
  }

  // 特殊道具刷新与过期倒计时
  if (powerUp) {
    powerUp.ttl -= dtSeconds;
    if (powerUp.ttl <= 0) {
      powerUp = null;
      powerUpCooldown = 5.5;
    }
  } else {
    powerUpCooldown -= dtSeconds;
    if (powerUpCooldown <= 0) {
      spawnPowerUp();
      powerUpCooldown = 6.5;
    }
  }

  // 关卡岩石预警倒计时（若倒计时结束时蛇身正压在该格上，则延缓实体化，绝不凭空卡死玩家）
  for (const obs of obstacles) {
    if (obs.warnTimer > 0) {
      obs.warnTimer -= dtSeconds;
      if (obs.warnTimer <= 0) {
        if (isSnakeAt(obs.x, obs.y)) {
          obs.warnTimer = 0.25;
        } else {
          obs.warnTimer = 0;
          spawnBurst(obs.x, obs.y, '35, 25%, 55%', 6);
        }
      }
    }
  }
}

// ------------------------------------------
// 画面渲染
// ------------------------------------------
function drawRoundedRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function drawBoard(timestamp) {
  for (let y = 0; y < GRID_COUNT; y++) {
    for (let x = 0; x < GRID_COUNT; x++) {
      ctx.fillStyle = (x + y) % 2 === 0
        ? 'hsl(152, 12%, 11%)'
        : 'hsl(152, 11%, 12.2%)';
      ctx.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    }
  }

  // 护盾开启时绘制可穿墙虚线提示边框
  if (shieldTimer > 0) {
    const blink = shieldTimer < 1.5 ? (Math.sin(timestamp * 0.025) > 0 ? 0.85 : 0.25) : 0.75;
    ctx.save();
    ctx.strokeStyle = `hsla(164, 85%, 55%, ${blink})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -(timestamp * 0.03) % 14;
    ctx.strokeRect(1.5, 1.5, BASE_SIZE - 3, BASE_SIZE - 3);
    ctx.restore();
  }
}

function drawObstacles(timestamp) {
  for (const obs of obstacles) {
    const x = obs.x * CELL_SIZE;
    const y = obs.y * CELL_SIZE;

    if (obs.warnTimer > 0) {
      // 预警状态：高频红色闪烁危险框 + 感叹号（与金色苹果明显区分）
      const pulse = 0.5 + 0.5 * Math.sin(timestamp * 0.018);
      const fillAlpha = 0.12 + 0.28 * pulse;
      const strokeAlpha = 0.45 + 0.55 * pulse;
      ctx.save();
      ctx.fillStyle = `hsla(356, 92%, 56%, ${fillAlpha})`;
      ctx.fillRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4);
      ctx.strokeStyle = `hsla(356, 96%, 60%, ${strokeAlpha})`;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x + 2.5, y + 2.5, CELL_SIZE - 5, CELL_SIZE - 5);

      ctx.fillStyle = `hsla(356, 100%, 72%, ${strokeAlpha})`;
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', x + CELL_SIZE / 2, y + CELL_SIZE / 2 + 0.5);
      ctx.restore();
    } else {
      // 实体岩石：立体切角石块质感
      ctx.fillStyle = 'hsl(30, 8%, 26%)';
      drawRoundedRect(x + 1.2, y + 1.2, CELL_SIZE - 2.4, CELL_SIZE - 2.4, 4);

      ctx.fillStyle = 'hsl(30, 9%, 42%)';
      drawRoundedRect(x + 2.2, y + 2, CELL_SIZE - 4.4, CELL_SIZE - 5.2, 3);

      // 石块顶部高光棱线
      ctx.fillStyle = 'hsla(40, 18%, 68%, 0.35)';
      ctx.fillRect(x + 4, y + 3.2, CELL_SIZE - 8, 2);
    }
  }
}

function drawFood(timestamp) {
  if (!food) return;
  const pulse = 1 + Math.sin(timestamp * 0.007) * 0.07;
  const cx = (food.x + 0.5) * CELL_SIZE;
  const cy = (food.y + 0.5) * CELL_SIZE;
  const radius = CELL_SIZE * 0.36 * pulse;

  ctx.fillStyle = 'hsl(12, 82%, 58%)';
  ctx.beginPath();
  ctx.arc(cx, cy + 1, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'hsla(20, 100%, 88%, 0.65)';
  ctx.beginPath();
  ctx.arc(cx - radius * 0.3, cy - radius * 0.25, radius * 0.24, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'hsl(142, 62%, 52%)';
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy - radius - 1, 3.2, 1.8, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawPowerUp(timestamp) {
  if (!powerUp) return;

  const cx = (powerUp.x + 0.5) * CELL_SIZE;
  const cy = (powerUp.y + 0.5) * CELL_SIZE;
  const pulse = 1 + Math.sin(timestamp * 0.01) * 0.09;
  const progress = Math.max(0, powerUp.ttl / powerUp.maxTtl);
  const cfg = POWERUP_TYPES[powerUp.type];

  // 外圈剩余时间进度环
  ctx.save();
  ctx.strokeStyle = cfg.color;
  ctx.lineWidth = 1.8;
  ctx.globalAlpha = powerUp.ttl < 2.2 ? (Math.sin(timestamp * 0.025) > 0 ? 0.95 : 0.3) : 0.85;
  ctx.beginPath();
  ctx.arc(cx, cy, CELL_SIZE * 0.45, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
  ctx.stroke();

  if (powerUp.type === 'gold') {
    // 金色苹果
    const r = CELL_SIZE * 0.31 * pulse;
    ctx.fillStyle = 'hsl(43, 96%, 56%)';
    ctx.beginPath();
    ctx.arc(cx, cy + 0.5, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'hsla(52, 100%, 90%, 0.8)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.28, cy - r * 0.28, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  } else if (powerUp.type === 'ice') {
    // 寒冰菱形水晶
    const r = CELL_SIZE * 0.32 * pulse;
    ctx.fillStyle = 'hsl(196, 90%, 62%)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.85, cy);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r * 0.85, cy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'hsla(200, 100%, 92%, 0.75)';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  } else if (powerUp.type === 'shield') {
    // 翡翠青金护盾核心
    const r = CELL_SIZE * 0.29 * pulse;
    ctx.fillStyle = 'hsl(164, 82%, 48%)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'hsl(164, 100%, 85%)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawSnake(timestamp) {
  const total = snake.length;
  const hue = iceTimer > 0 ? 178 : 152;

  for (let i = total - 1; i >= 0; i--) {
    const seg = snake[i];
    const isHead = i === 0;
    const ratio = i / Math.max(total - 1, 1);
    const lightness = isHead ? 53 : 46 - ratio * 13;

    ctx.fillStyle = state === 'gameover' && isHead
      ? 'hsl(12, 72%, 54%)'
      : `hsl(${hue}, 60%, ${lightness}%)`;

    const pad = isHead ? 1.2 : 1.8;
    const size = CELL_SIZE - pad * 2;
    const radius = isHead ? 6 : 5;

    drawRoundedRect(
      seg.x * CELL_SIZE + pad,
      seg.y * CELL_SIZE + pad,
      size,
      size,
      radius
    );

    // 护盾状态下为蛇头与蛇身描绘保护光边（快到期时闪烁提醒）
    if (shieldTimer > 0 && (isHead || i % 2 === 0)) {
      const showAura = shieldTimer > 1.5 || Math.sin(timestamp * 0.03) > 0;
      if (showAura) {
        ctx.strokeStyle = 'hsla(164, 95%, 74%, 0.85)';
        ctx.lineWidth = isHead ? 1.8 : 1.1;
        ctx.beginPath();
        ctx.roundRect(seg.x * CELL_SIZE + pad, seg.y * CELL_SIZE + pad, size, size, radius);
        ctx.stroke();
      }
    }

    if (isHead) {
      drawSnakeEyes(seg);
    }
  }
}

function drawSnakeEyes(head) {
  const cx = (head.x + 0.5) * CELL_SIZE;
  const cy = (head.y + 0.5) * CELL_SIZE;
  const forwardOffset = 3.5;
  const sideOffset = 4.2;

  const perpX = -direction.y;
  const perpY = direction.x;

  const leftEye = {
    x: cx + direction.x * forwardOffset + perpX * sideOffset,
    y: cy + direction.y * forwardOffset + perpY * sideOffset
  };
  const rightEye = {
    x: cx + direction.x * forwardOffset - perpX * sideOffset,
    y: cy + direction.y * forwardOffset - perpY * sideOffset
  };

  ctx.fillStyle = 'hsl(150, 20%, 10%)';
  [leftEye, rightEye].forEach((eye) => {
    ctx.beginPath();
    ctx.arc(eye.x, eye.y, 2, 0, Math.PI * 2);
    ctx.fill();
  });
}

function updateAndDrawEffects(dtSeconds) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dtSeconds;
    p.y += p.vy * dtSeconds;
    p.life -= dtSeconds * 2.7;

    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }

    ctx.fillStyle = `hsla(${p.color}, ${p.life.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y -= 22 * dtSeconds;
    ft.life -= dtSeconds * 1.35;

    if (ft.life <= 0) {
      floatingTexts.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.globalAlpha = Math.min(1, ft.life * 1.3);
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, Math.max(32, Math.min(BASE_SIZE - 32, ft.x)), Math.max(14, ft.y));
    ctx.restore();
  }
}

// ------------------------------------------
// 主循环
// ------------------------------------------
function gameLoop(timestamp) {
  if (!lastFrameTime) lastFrameTime = timestamp;
  const deltaMs = Math.min(timestamp - lastFrameTime, 100);
  const dtSeconds = deltaMs / 1000;
  lastFrameTime = timestamp;

  if (state === 'running') {
    updateTimers(dtSeconds);
    stepAccumulator += deltaMs;
    let currentInterval = getEffectiveInterval();
    while (stepAccumulator >= currentInterval && state === 'running') {
      stepAccumulator -= currentInterval;
      stepGame();
      currentInterval = getEffectiveInterval();
    }
  }

  drawBoard(timestamp);
  drawObstacles(timestamp);
  drawFood(timestamp);
  drawPowerUp(timestamp);
  drawSnake(timestamp);
  updateAndDrawEffects(dtSeconds);

  requestAnimationFrame(gameLoop);
}

// ------------------------------------------
// 事件绑定
// ------------------------------------------
const KEY_DIRECTION_MAP = {
  ArrowUp: { x: 0, y: -1 },
  KeyW: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  KeyS: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  KeyA: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  KeyD: { x: 1, y: 0 }
};

window.addEventListener('keydown', (e) => {
  const mappedDir = KEY_DIRECTION_MAP[e.code];
  if (mappedDir) {
    e.preventDefault();
    if (state === 'idle') {
      startGame();
    }
    queueDirection(mappedDir);
    return;
  }

  if (e.code === 'Space') {
    e.preventDefault();
    if (state === 'running' || state === 'paused') {
      togglePause();
    } else {
      startGame();
    }
  } else if (e.code === 'Enter' && state !== 'running') {
    e.preventDefault();
    startGame();
  }
});

startBtn.addEventListener('click', () => {
  if (state === 'paused') {
    togglePause();
  } else {
    startGame();
  }
});

pauseBtn.addEventListener('click', togglePause);

muteBtn.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  muteBtn.textContent = soundEnabled ? '音效: 开' : '音效: 关';
});

function bindDpadButton(id, dir) {
  const btn = document.getElementById(id);
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (state === 'idle') startGame();
    queueDirection(dir);
  });
}

bindDpadButton('dpad-up', { x: 0, y: -1 });
bindDpadButton('dpad-down', { x: 0, y: 1 });
bindDpadButton('dpad-left', { x: -1, y: 0 });
bindDpadButton('dpad-right', { x: 1, y: 0 });

let touchStart = null;
canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) return;
  touchStart = {
    x: e.touches[0].clientX,
    y: e.touches[0].clientY
  };
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
  if (state === 'running') {
    e.preventDefault();
  }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  if (!touchStart || e.changedTouches.length === 0) return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  touchStart = null;

  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;

  if (Math.abs(dx) > Math.abs(dy)) {
    queueDirection(dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 });
  } else {
    queueDirection(dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 });
  }
});

initGameData();
requestAnimationFrame(gameLoop);
