// ==========================================
// 经典贪吃蛇 · 进阶版（肉鸽强化 + 道具系统 + 关卡障碍）
// ==========================================

const GRID_COUNT = 20;          // 棋盘格数：20 x 20
const BASE_SIZE = 400;          // 逻辑画布尺寸 (px)
const CELL_SIZE = BASE_SIZE / GRID_COUNT;
const INITIAL_INTERVAL = 140;       // Lv.1 初始每步间隔 (毫秒)
const SPEED_GAIN_PER_LEVEL = 0.05;  // 每升 1 级速度倍率提升 0.05（隐藏属性）
const SLOW_UPGRADE_STEP = 0.15;     // 每次减速强化降低的速度倍率
const MIN_SPEED_MULT = 0.70;        // 隐藏速度倍率最低下限
const POINTS_PER_LEVEL = 50;        // 每多少分升一级并新增障碍
const CLEAR_LEVEL = 20;             // 达到第 20 关即判定通关胜利
const UPGRADE_EVERY_LEVELS = 4;     // 每逢 4 的倍数关卡触发一次三选一强化
const MAX_OBSTACLES = 18;           // 场上最大岩石数量上限
const INITIAL_LIVES = 3;            // 初始生命值与初始上限
const HARD_MAX_LIVES = 6;           // 强化可提升的最大生命硬上限
const INVULN_DURATION = 2.0;        // 受伤后的短暂无敌保护时间 (秒)
const STORAGE_KEY = 'classic_snake_best_score_v2';

// 道具配置表
const POWERUP_TYPES = {
  gold: {
    label: '金果',
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
  },
  heart: {
    label: '生命之心',
    color: 'hsl(345, 92%, 64%)'
  }
};

// DOM 元素引用
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const livesEl = document.getElementById('lives-value');
const scoreEl = document.getElementById('score-value');
const levelEl = document.getElementById('level-value');
const bestScoreEl = document.getElementById('best-score-value');
const buffBarEl = document.getElementById('buff-bar');
const levelBannerEl = document.getElementById('level-banner');
const upgradeOverlayEl = document.getElementById('upgrade-overlay');
const upgradeBadgeEl = document.getElementById('upgrade-badge');
const upgradeListEl = document.getElementById('upgrade-list');
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
let state = 'idle'; // 'idle' | 'running' | 'paused' | 'choosing' | 'gameover' | 'won'
let snake = [];
let pendingGrowth = 0;
let direction = { x: 1, y: 0 };
let directionQueue = [];

let food = { x: 14, y: 10 };
let powerUp = null;          // { x, y, type: 'gold'|'ice'|'shield'|'heart', ttl, maxTtl }
let powerUpCooldown = 4.5;
let obstacles = [];          // Array<{ x, y, warnTimer }>

let iceTimer = 0;
let shieldTimer = 0;
let invulnTimer = 0;
let bannerTimer = 0;

let particles = [];
let floatingTexts = [];

let maxLives = INITIAL_LIVES;
let lives = INITIAL_LIVES;
let score = 0;
let level = 1;
let bestScore = loadBestScore();

// 肉鸽永久强化属性（每局重置）
let slowUpgradeCount = 0;    // 永久减速层数
let scoreMultiplier = 1.0;   // 果实得分倍率
let buffBonusSec = 0;        // 增益道具额外持续秒数
let magnetLevel = 0;         // 磁力等级（>0 时解锁周围 1 格自动吸取）
let pendingUpgradeLevels = [];
let currentChoices = [];

let baseStepInterval = INITIAL_INTERVAL;
let lastFrameTime = 0;
let stepAccumulator = 0;
let soundEnabled = true;
let audioCtx = null;

bestScoreEl.textContent = String(bestScore);

// ------------------------------------------
// 三选一强化词条池（8 种策略流派）
// ------------------------------------------
const UPGRADE_POOL = [
  {
    id: 'max_hp',
    name: '强健体魄',
    getDesc: () => `最大生命值 +1（当前上限 ${maxLives}→${maxLives + 1}），并立即恢复 1 点生命`,
    canPick: () => maxLives < HARD_MAX_LIVES,
    apply: () => {
      maxLives = Math.min(HARD_MAX_LIVES, maxLives + 1);
      lives = Math.min(maxLives, lives + 1);
      addFloatingText(snake[0].x, snake[0].y, '生命上限 +1!', 'hsl(345, 95%, 72%)');
    }
  },
  {
    id: 'trim_body',
    name: '断尾瘦身',
    getDesc: () => {
      const cut = Math.max(2, Math.floor(snake.length * 0.35));
      const actualCut = snake.length - Math.max(3, snake.length - cut);
      return `立即减去尾部 ${actualCut} 节长度，大幅释放走位空间`;
    },
    canPick: () => snake.length >= 6,
    apply: () => {
      const cut = Math.max(2, Math.floor(snake.length * 0.35));
      const targetLen = Math.max(3, snake.length - cut);
      const removed = snake.splice(targetLen);
      pendingGrowth = 0;
      removed.forEach((seg) => spawnBurst(seg.x, seg.y, '152, 65%, 55%', 4));
      addFloatingText(snake[0].x, snake[0].y, `瘦身 -${removed.length} 节!`, 'hsl(152, 80%, 66%)');
    }
  },
  {
    id: 'slow_pace',
    name: '从容步伐',
    getDesc: () => '永久放缓自身移动速度，高压关卡转向更从容',
    canPick: () => slowUpgradeCount < 4,
    apply: () => {
      slowUpgradeCount += 1;
      recalcBaseInterval();
      addFloatingText(snake[0].x, snake[0].y, '移速放缓!', 'hsl(196, 90%, 72%)');
    }
  },
  {
    id: 'score_boost',
    name: '黄金胃口',
    getDesc: () => `苹果与金果得分永久 +50%（倍率 ${scoreMultiplier.toFixed(1)}x→${(scoreMultiplier + 0.5).toFixed(1)}x）`,
    canPick: () => scoreMultiplier < 3.0,
    apply: () => {
      scoreMultiplier = +(scoreMultiplier + 0.5).toFixed(1);
      addFloatingText(snake[0].x, snake[0].y, `得分 ${scoreMultiplier.toFixed(1)}x!`, 'hsl(43, 96%, 64%)');
    }
  },
  {
    id: 'quake_clear',
    name: '碎石冲击',
    getDesc: () => `立即震碎场上一半岩石障碍（约 ${Math.ceil(obstacles.length / 2)} 块），每块 +5 分`,
    canPick: () => obstacles.length >= 4,
    apply: () => {
      const removeCount = Math.ceil(obstacles.length / 2);
      for (let i = 0; i < removeCount && obstacles.length > 0; i++) {
        const idx = Math.floor(Math.random() * obstacles.length);
        const rock = obstacles.splice(idx, 1)[0];
        spawnBurst(rock.x, rock.y, '32, 22%, 62%', 10);
      }
      score += removeCount * 5;
      playTone('smash');
      addFloatingText(snake[0].x, snake[0].y, `震碎 ${removeCount} 块岩石!`, 'hsl(42, 95%, 68%)');
    }
  },
  {
    id: 'buff_extend',
    name: '延时充能',
    getDesc: () => '护盾与寒冰减速持续时间永久 +2.5 秒，场上道具停留更久',
    canPick: () => buffBonusSec < 7.5,
    apply: () => {
      buffBonusSec += 2.5;
      addFloatingText(snake[0].x, snake[0].y, '增益时长 +2.5s!', 'hsl(164, 88%, 68%)');
    }
  },
  {
    id: 'magnet_aura',
    name: '幸运磁力',
    getDesc: () => magnetLevel === 0
      ? '自动隔空吸取周围 1 格内的苹果与道具，且道具刷新加快 25%'
      : '道具刷新速度再加快 25%，并立即在场上召唤一个随机道具',
    canPick: () => magnetLevel < 2,
    apply: () => {
      magnetLevel += 1;
      if (!powerUp) spawnPowerUp();
      addFloatingText(snake[0].x, snake[0].y, magnetLevel === 1 ? '磁力光环激活!' : '磁力强化!', 'hsl(43, 96%, 66%)');
    }
  },
  {
    id: 'instant_aegis',
    name: '圣盾赐福',
    getDesc: () => '立即获得 10 秒穿墙碎石护盾，若生命未满额外恢复 1 点生命',
    canPick: () => true,
    apply: () => {
      shieldTimer = Math.max(shieldTimer, 10 + buffBonusSec);
      if (lives < maxLives) lives += 1;
      addFloatingText(snake[0].x, snake[0].y, '10s 圣盾护体!', 'hsl(164, 92%, 70%)');
    }
  }
];

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
    } else if (type === 'upgrade') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523, now);
      osc.frequency.setValueAtTime(659, now + 0.06);
      osc.frequency.setValueAtTime(784, now + 0.12);
      osc.frequency.setValueAtTime(1046, now + 0.18);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      osc.start(now);
      osc.stop(now + 0.34);
    } else if (type === 'heal') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523, now);
      osc.frequency.setValueAtTime(659, now + 0.06);
      osc.frequency.setValueAtTime(784, now + 0.12);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.start(now);
      osc.stop(now + 0.24);
    } else if (type === 'hurt') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(130, now + 0.16);
      gain.gain.setValueAtTime(0.13, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (type === 'win') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523, now);
      osc.frequency.setValueAtTime(659, now + 0.08);
      osc.frequency.setValueAtTime(784, now + 0.16);
      osc.frequency.setValueAtTime(1046, now + 0.25);
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
      osc.start(now);
      osc.stop(now + 0.48);
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
// 辅助查询与隐藏速度计算
// ------------------------------------------
function recalcBaseInterval() {
  const rawMult = 1 + (level - 1) * SPEED_GAIN_PER_LEVEL - slowUpgradeCount * SLOW_UPGRADE_STEP;
  const clampedMult = Math.max(MIN_SPEED_MULT, rawMult);
  baseStepInterval = Math.round(INITIAL_INTERVAL / clampedMult);
}

function getEffectiveInterval() {
  return iceTimer > 0 ? Math.round(baseStepInterval * 1.45) : baseStepInterval;
}

function getPowerUpCooldown() {
  const factor = magnetLevel === 0 ? 1 : (magnetLevel === 1 ? 0.75 : 0.56);
  return 6.4 * factor;
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
// 关卡升级与三选一强化流程
// ------------------------------------------
function createInitialObstacles() {
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
    for (let y = 1; y < GRID_COUNT - 1; y++) {
      for (let x = 1; x < GRID_COUNT - 1; x++) {
        if (isSnakeAt(x, y) || isObstacleAt(x, y, false)) continue;
        if (food && food.x === x && food.y === y) continue;
        if (powerUp && powerUp.x === x && powerUp.y === y) continue;

        const dist = Math.abs(x - head.x) + Math.abs(y - head.y);
        if (dist < 5) continue;

        let inFrontLine = false;
        for (let step = 1; step <= 6; step++) {
          if (head.x + direction.x * step === x && head.y + direction.y * step === y) {
            inFrontLine = true;
            break;
          }
        }
        if (inFrontLine) continue;

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
      obstacles.push({ x: pick.x, y: pick.y, warnTimer: 2.2 });
    }
  }
}

function checkLevelUp() {
  const targetLevel = Math.min(CLEAR_LEVEL, Math.floor(score / POINTS_PER_LEVEL) + 1);
  if (targetLevel > level) {
    const prevLevel = level;
    level = targetLevel;
    recalcBaseInterval();

    if (level >= CLEAR_LEVEL) {
      pendingUpgradeLevels = [];
      updateHUD();
      endGame(true);
      return;
    }

    for (let lv = prevLevel + 1; lv <= level; lv++) {
      spawnLevelObstacles(2);
      if (lv % UPGRADE_EVERY_LEVELS === 0) {
        pendingUpgradeLevels.push(lv);
      }
    }

    playTone(pendingUpgradeLevels.length > 0 ? 'upgrade' : 'levelup');
    showLevelBanner(`Lv.${level} 关卡提升！注意红色落石预警`);
    updateHUD();
  }
}

function openNextUpgradeChoice() {
  if (pendingUpgradeLevels.length === 0 || state !== 'running') return;

  const milestoneLv = pendingUpgradeLevels.shift();
  state = 'choosing';
  pauseBtn.disabled = true;

  // 从满足条件的词条中不重复随机抽取 3 项
  const pool = UPGRADE_POOL.filter((u) => u.canPick());
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  currentChoices = shuffled.slice(0, 3);

  upgradeBadgeEl.textContent = `Lv.${milestoneLv} 里程碑奖励`;
  upgradeListEl.innerHTML = '';

  currentChoices.forEach((choice, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'upgrade-card';
    btn.innerHTML = `
      <span class="upgrade-key">${idx + 1}</span>
      <span class="upgrade-body">
        <span class="upgrade-name">${choice.name}</span>
        <span class="upgrade-desc">${choice.getDesc()}</span>
      </span>
    `;
    btn.addEventListener('click', () => selectUpgrade(idx));
    upgradeListEl.appendChild(btn);
  });

  upgradeOverlayEl.classList.remove('hidden');
}

function selectUpgrade(index) {
  if (state !== 'choosing' || !currentChoices[index]) return;

  const chosen = currentChoices[index];
  currentChoices = [];
  playTone('upgrade');
  chosen.apply();

  recalcBaseInterval();
  checkLevelUp();
  if (state !== 'choosing') return;

  updateHUD();

  // 选择强化后给予短暂无敌缓冲，防止恢复瞬间贴脸受击
  invulnTimer = Math.max(invulnTimer, 1.2);
  renderBuffBar();

  if (pendingUpgradeLevels.length > 0) {
    state = 'running';
    openNextUpgradeChoice();
  } else {
    upgradeOverlayEl.classList.add('hidden');
    state = 'running';
    pauseBtn.disabled = false;
    stepAccumulator = 0;
    lastFrameTime = performance.now();
  }
}

function showLevelBanner(text) {
  levelBannerEl.textContent = text;
  levelBannerEl.classList.remove('hidden');
  bannerTimer = 2.4;
}

// ------------------------------------------
// 初始化与主状态控制
// ------------------------------------------
function initGameData() {
  snake = [
    { x: 6, y: 10 },
    { x: 5, y: 10 },
    { x: 4, y: 10 }
  ];
  pendingGrowth = 0;
  direction = { x: 1, y: 0 };
  directionQueue = [];

  maxLives = INITIAL_LIVES;
  lives = INITIAL_LIVES;
  score = 0;
  level = 1;

  slowUpgradeCount = 0;
  scoreMultiplier = 1.0;
  buffBonusSec = 0;
  magnetLevel = 0;
  pendingUpgradeLevels = [];
  currentChoices = [];

  recalcBaseInterval();
  iceTimer = 0;
  shieldTimer = 0;
  invulnTimer = 0;
  bannerTimer = 0;
  levelBannerEl.classList.add('hidden');
  upgradeOverlayEl.classList.add('hidden');

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
  upgradeOverlayEl.classList.add('hidden');
  levelBannerEl.classList.add('hidden');
  playTone(won ? 'win' : 'gameover');

  if (won && snake.length > 0) {
    spawnBurst(snake[0].x, snake[0].y, '43, 96%, 60%', 18);
    spawnBurst(Math.floor(GRID_COUNT / 2), Math.floor(GRID_COUNT / 2), '152, 80%, 58%', 18);
  }

  if (score > bestScore) {
    bestScore = score;
    saveBestScore(bestScore);
    updateHUD();
  }

  if (won) {
    const desc = level >= CLEAR_LEVEL
      ? `成功突破全部 ${CLEAR_LEVEL} 关挑战！本局得分 ${score} · 最高纪录 ${bestScore}`
      : `成功占领全部棋盘格！本局得分 ${score} · 最高纪录 ${bestScore}`;
    showOverlay('恭喜通关！', desc, '再来一局');
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
  livesEl.textContent = '♥'.repeat(lives) + '♡'.repeat(Math.max(0, maxLives - lives));
  scoreEl.textContent = String(score);
  levelEl.textContent = `Lv.${level}`;
  bestScoreEl.textContent = String(bestScore);
}

function renderBuffBar() {
  const pills = [];
  if (invulnTimer > 0) {
    pills.push(`<span class="buff-pill" style="border-color: hsl(345, 86%, 56%); color: hsl(345, 95%, 76%);">无敌保护 ${invulnTimer.toFixed(1)}s</span>`);
  }
  if (shieldTimer > 0) {
    pills.push(`<span class="buff-pill" style="border-color: hsl(164, 78%, 45%); color: hsl(164, 88%, 72%);">护盾 ${shieldTimer.toFixed(1)}s</span>`);
  }
  if (iceTimer > 0) {
    pills.push(`<span class="buff-pill" style="border-color: hsl(196, 80%, 52%); color: hsl(196, 92%, 76%);">减速 ${iceTimer.toFixed(1)}s</span>`);
  }
  if (magnetLevel > 0) {
    pills.push(`<span class="buff-pill" style="border-color: hsl(43, 85%, 52%); color: hsl(43, 96%, 72%);">磁力 Lv.${magnetLevel}</span>`);
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

  // 生命之心仅在当前生命小于上限时低概率 (12%) 出现
  let pickedType = 'gold';
  const roll = Math.random();
  if (lives < maxLives) {
    if (roll < 0.12) pickedType = 'heart';
    else if (roll < 0.42) pickedType = 'gold';
    else if (roll < 0.71) pickedType = 'ice';
    else pickedType = 'shield';
  } else {
    if (roll < 0.34) pickedType = 'gold';
    else if (roll < 0.67) pickedType = 'ice';
    else pickedType = 'shield';
  }

  const pos = cells[Math.floor(Math.random() * cells.length)];
  const itemTtl = 9.5 + (buffBonusSec > 0 ? 2.0 : 0);

  powerUp = {
    x: pos.x,
    y: pos.y,
    type: pickedType,
    ttl: itemTtl,
    maxTtl: itemTtl
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
  if (item.type === 'heart') {
    playTone('heal');
    lives = Math.min(maxLives, lives + 1);
    score += 10;
    spawnBurst(item.x, item.y, '345, 92%, 64%', 14);
    addFloatingText(item.x, item.y, '+1 生命!', 'hsl(345, 96%, 74%)');
  } else {
    playTone('powerup');
    if (item.type === 'gold') {
      const pts = Math.round(30 * scoreMultiplier);
      score += pts;
      pendingGrowth += 2;
      spawnBurst(item.x, item.y, '43, 96%, 58%', 14);
      addFloatingText(item.x, item.y, `+${pts} 金果!`, 'hsl(43, 96%, 64%)');
    } else if (item.type === 'ice') {
      score += 10;
      iceTimer = POWERUP_TYPES.ice.duration + buffBonusSec;
      pendingGrowth += 1;
      spawnBurst(item.x, item.y, '196, 90%, 64%', 12);
      addFloatingText(item.x, item.y, '寒冰减速!', 'hsl(196, 92%, 72%)');
    } else if (item.type === 'shield') {
      score += 10;
      shieldTimer = POWERUP_TYPES.shield.duration + buffBonusSec;
      pendingGrowth += 1;
      spawnBurst(item.x, item.y, '164, 85%, 56%', 12);
      addFloatingText(item.x, item.y, '穿墙碎石护盾!', 'hsl(164, 90%, 66%)');
    }
  }

  recalcBaseInterval();
  powerUp = null;
  powerUpCooldown = getPowerUpCooldown();
  checkLevelUp();
  updateHUD();
  renderBuffBar();
}

function takeDamage(hitX, hitY) {
  lives = Math.max(0, lives - 1);
  updateHUD();

  if (lives <= 0) {
    endGame(false);
    return false;
  }

  invulnTimer = INVULN_DURATION;
  playTone('hurt');
  spawnBurst(hitX, hitY, '356, 92%, 60%', 12);
  addFloatingText(hitX, hitY, `-1 生命 (余${lives})`, 'hsl(356, 96%, 70%)');
  renderBuffBar();
  return true;
}

function stepGame() {
  if (directionQueue.length > 0) {
    direction = directionQueue.shift();
  }

  const head = snake[0];
  let nextX = head.x + direction.x;
  let nextY = head.y + direction.y;

  // 1. 边界检测
  if (nextX < 0 || nextX >= GRID_COUNT || nextY < 0 || nextY >= GRID_COUNT) {
    if (shieldTimer > 0 || invulnTimer > 0) {
      nextX = (nextX + GRID_COUNT) % GRID_COUNT;
      nextY = (nextY + GRID_COUNT) % GRID_COUNT;
    } else {
      if (!takeDamage(head.x, head.y)) return;
      nextX = (nextX + GRID_COUNT) % GRID_COUNT;
      nextY = (nextY + GRID_COUNT) % GRID_COUNT;
    }
  }

  // 2. 岩石障碍检测
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
      if (state !== 'running') return;
    } else if (invulnTimer <= 0) {
      const rock = obstacles[hitRockIndex];
      obstacles.splice(hitRockIndex, 1);
      spawnBurst(rock.x, rock.y, '32, 18%, 62%', 10);
      if (!takeDamage(nextX, nextY)) return;
    }
  }

  const pickupRadius = magnetLevel > 0 ? 1 : 0;
  const willEatFood = Boolean(
    food &&
    Math.abs(nextX - food.x) <= pickupRadius &&
    Math.abs(nextY - food.y) <= pickupRadius
  );
  const willEatPowerUp = Boolean(
    powerUp &&
    Math.abs(nextX - powerUp.x) <= pickupRadius &&
    Math.abs(nextY - powerUp.y) <= pickupRadius
  );
  const willGrowThisStep = willEatFood || pendingGrowth > 0;

  // 3. 撞自身检测
  const bodyToCheck = willGrowThisStep ? snake : snake.slice(0, -1);
  if (invulnTimer <= 0 && bodyToCheck.some((seg) => seg.x === nextX && seg.y === nextY)) {
    if (!takeDamage(nextX, nextY)) return;
  }

  // 4. 推进蛇头
  snake.unshift({ x: nextX, y: nextY });

  if (willEatFood) {
    const pts = Math.round(10 * scoreMultiplier);
    score += pts;
    playTone('eat');
    spawnBurst(food.x, food.y, '16, 90%, 62%', 10);
    if (pts > 10) addFloatingText(food.x, food.y, `+${pts}`, 'hsl(43, 96%, 68%)');
    checkLevelUp();
    updateHUD();
    if (state !== 'running') {
      food = null;
      return;
    }
    spawnFood();
  } else if (pendingGrowth > 0) {
    pendingGrowth--;
  } else {
    snake.pop();
  }

  if (state === 'running' && willEatPowerUp && powerUp) {
    applyPowerUp(powerUp);
  }

  // 若本步触发了 4 的倍数关卡里程碑，弹出三选一强化面板
  if (state === 'running' && pendingUpgradeLevels.length > 0) {
    openNextUpgradeChoice();
  }
}

// ------------------------------------------
// 计时器更新
// ------------------------------------------
function updateTimers(dtSeconds) {
  let buffChanged = false;

  if (invulnTimer > 0) {
    invulnTimer = Math.max(0, invulnTimer - dtSeconds);
    buffChanged = true;
  }

  if (iceTimer > 0) {
    iceTimer = Math.max(0, iceTimer - dtSeconds);
    buffChanged = true;
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

  if (powerUp) {
    powerUp.ttl -= dtSeconds;
    if (powerUp.ttl <= 0) {
      powerUp = null;
      powerUpCooldown = getPowerUpCooldown();
    }
  } else {
    powerUpCooldown -= dtSeconds;
    if (powerUpCooldown <= 0) {
      spawnPowerUp();
      powerUpCooldown = getPowerUpCooldown();
    }
  }

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
      ctx.fillStyle = 'hsl(30, 8%, 26%)';
      drawRoundedRect(x + 1.2, y + 1.2, CELL_SIZE - 2.4, CELL_SIZE - 2.4, 4);

      ctx.fillStyle = 'hsl(30, 9%, 42%)';
      drawRoundedRect(x + 2.2, y + 2, CELL_SIZE - 4.4, CELL_SIZE - 5.2, 3);

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

  ctx.save();
  ctx.strokeStyle = cfg.color;
  ctx.lineWidth = 1.8;
  ctx.globalAlpha = powerUp.ttl < 2.2 ? (Math.sin(timestamp * 0.025) > 0 ? 0.95 : 0.3) : 0.85;
  ctx.beginPath();
  ctx.arc(cx, cy, CELL_SIZE * 0.45, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
  ctx.stroke();

  if (powerUp.type === 'gold') {
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
  } else if (powerUp.type === 'heart') {
    const s = 0.52 * pulse;
    ctx.save();
    ctx.translate(cx, cy + 1);
    ctx.scale(s, s);
    ctx.fillStyle = 'hsl(345, 92%, 62%)';
    ctx.beginPath();
    ctx.moveTo(0, 7);
    ctx.bezierCurveTo(-12, -2, -12, -12, 0, -5);
    ctx.bezierCurveTo(12, -12, 12, -2, 0, 7);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

function drawSnake(timestamp) {
  const total = snake.length;
  const hue = iceTimer > 0 ? 178 : 152;
  const invulnFlash = invulnTimer > 0 && Math.sin(timestamp * 0.03) < 0;

  // 若激活磁力光环，在蛇头周围绘制微弱吸取范围圈
  if (magnetLevel > 0 && snake.length > 0) {
    const hx = (snake[0].x + 0.5) * CELL_SIZE;
    const hy = (snake[0].y + 0.5) * CELL_SIZE;
    ctx.save();
    ctx.strokeStyle = 'hsla(43, 95%, 60%, 0.22)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(hx, hy, CELL_SIZE * 1.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  if (invulnFlash) {
    ctx.globalAlpha = 0.42;
  }

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
  ctx.restore();
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
    ctx.fillText(ft.text, Math.max(40, Math.min(BASE_SIZE - 40, ft.x)), Math.max(14, ft.y));
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

const UPGRADE_KEY_MAP = {
  Digit1: 0, Numpad1: 0,
  Digit2: 1, Numpad2: 1,
  Digit3: 2, Numpad3: 2
};

window.addEventListener('keydown', (e) => {
  // 三选一强化界面支持按键 1 / 2 / 3 直接选择
  if (state === 'choosing') {
    if (e.code in UPGRADE_KEY_MAP) {
      e.preventDefault();
      selectUpgrade(UPGRADE_KEY_MAP[e.code]);
    }
    return;
  }

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
  } else if (state !== 'choosing') {
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
    if (state === 'choosing') return;
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
