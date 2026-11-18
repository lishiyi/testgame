// ==========================================
// 经典贪吃蛇 · 进阶版（核心状态机、道具解锁与肉鸽强化控制）
// ==========================================

// DOM 元素引用
const livesEl = document.getElementById('lives-value');
const scoreEl = document.getElementById('score-value');
const levelEl = document.getElementById('level-value');
const bestScoreEl = document.getElementById('best-score-value');
const itemLegendEl = document.getElementById('item-legend');
const buffBarEl = document.getElementById('buff-bar');
const levelBannerEl = document.getElementById('level-banner');
const upgradeOverlayEl = document.getElementById('upgrade-overlay');
const upgradeBadgeEl = document.getElementById('upgrade-badge');
const upgradeListEl = document.getElementById('upgrade-list');
const overlayEl = document.getElementById('board-overlay');
const overlayTitleEl = document.getElementById('overlay-title');
const overlayDescEl = document.getElementById('overlay-desc');
const overlayTipsEl = document.getElementById('overlay-tips');
const runSummaryEl = document.getElementById('run-summary');
const endlessBtn = document.getElementById('endless-btn');
const startBtn = document.getElementById('start-btn');
const shareBtn = document.getElementById('share-btn');
const pauseBtn = document.getElementById('pause-btn');
const muteBtn = document.getElementById('mute-btn');

// 游戏核心状态
let state = 'idle'; // 'idle' | 'running' | 'paused' | 'choosing' | 'gameover' | 'won'
let snake = [];
let pendingGrowth = 0;
let direction = { x: 1, y: 0 };
let directionQueue = [];

let food = { x: 14, y: 10 };
let powerUp = null;
let powerUpCooldown = 3.0;
let lastPowerUpType = null;
let obstacles = [];

let iceTimer = 0;
let doubleTimer = 0;
let shieldTimer = 0;
let ghostTimer = 0;
let freezeTimer = 0;
let invulnTimer = 0;
let bannerTimer = 0;
let shakeTimer = 0;
let hitstopTimer = 0;
let rockDripTimer = 0; // 定时落石累计计时（秒）

let comboCount = 0;
let comboTimer = 0;

let particles = [];
let floatingTexts = [];

let maxLives = INITIAL_LIVES;
let lives = INITIAL_LIVES;
let score = 0;
let level = 1;
let endlessMode = false;
let bestScore = loadBestScore();

// 肉鸽永久强化属性与单局统计（每局重置）
let slowUpgradeCount = 0;
let scoreMultiplier = 1.0;
let buffBonusSec = 0;
let magnetLevel = 0;
let comboUpgradeLevel = 0;
let hasLevelFreeze = false;
let hasPhaseBody = false;
let nirvanaCharges = 0;
let nirvanaUsed = false;
let blastExpertLevel = 0;     // 「爆破专家」是否已获得（0/1，不可叠加）
let hasStoneFeast = false;    // 是否持有「以石养身」
let stoneFeastProgress = 0;   // 「以石养身」当前累计碎石进度

let pendingUpgradeLevels = []; // Array<number | 'chest'>
let currentChoices = [];
let pickedUpgrades = [];       // Array<{ name, rarity }>
let runElapsedSec = 0;
let rocksSmashed = 0;
let shareResetTimeout = null;

let baseStepInterval = INITIAL_INTERVAL;
let lastFrameTime = 0;
let stepAccumulator = 0;

bestScoreEl.textContent = String(bestScore);

// ------------------------------------------
// 三选一强化词条池（共 14 项：普通 > 罕见 > 稀有 > 传说）
// ------------------------------------------
const UPGRADE_POOL = [
  {
    id: 'max_hp',
    name: '强健体魄',
    rarity: 'uncommon',
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
    rarity: 'common',
    getDesc: () => {
      const cut = Math.max(2, Math.floor(snake.length * 0.40));
      const actualCut = snake.length - Math.max(3, snake.length - cut);
      return `立即减去尾部 ${actualCut} 节长度（40%），大幅释放走位空间`;
    },
    canPick: () => snake.length >= 6,
    apply: () => {
      const cut = Math.max(2, Math.floor(snake.length * 0.40));
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
    rarity: 'common',
    getDesc: () => '永久放缓自身移动速度，高压关卡转向更从容',
    canPick: () => slowUpgradeCount < 2,
    apply: () => {
      slowUpgradeCount += 1;
      recalcBaseInterval();
      addFloatingText(snake[0].x, snake[0].y, '移速放缓!', 'hsl(196, 90%, 72%)');
    }
  },
  {
    id: 'score_boost',
    name: '黄金胃口',
    rarity: 'common',
    getDesc: () => `苹果与金果得分永久 +50%（倍率 ${scoreMultiplier.toFixed(1)}x→${(scoreMultiplier + 0.5).toFixed(1)}x）`,
    canPick: () => scoreMultiplier < 2.5,
    apply: () => {
      scoreMultiplier = +(scoreMultiplier + 0.5).toFixed(1);
      addFloatingText(snake[0].x, snake[0].y, `得分 ${scoreMultiplier.toFixed(1)}x!`, 'hsl(43, 96%, 64%)');
    }
  },
  {
    id: 'quake_clear',
    name: '碎石冲击',
    rarity: 'common',
    getDesc: () => {
      const cnt = Math.min(obstacles.length, Math.max(1, Math.round(obstacles.length * 0.7)));
      return `立即震碎场上 70%（${cnt} 块）岩石障碍，每块 +5 分`;
    },
    canPick: () => obstacles.length >= 4,
    apply: () => {
      const removeCount = Math.min(obstacles.length, Math.max(1, Math.round(obstacles.length * 0.7)));
      const head = snake[0];
      obstacles.sort(
        (a, b) =>
          (Math.abs(a.x - head.x) + Math.abs(a.y - head.y)) -
          (Math.abs(b.x - head.x) + Math.abs(b.y - head.y))
      );
      const cleared = obstacles.splice(0, removeCount);
      cleared.forEach((rock) => spawnBurst(rock.x, rock.y, '32, 22%, 62%', 10));
      registerRocksSmashed(cleared.length);
      score += calcDoublePts(cleared.length * 5);
      shakeTimer = Math.max(shakeTimer, 0.14);
      triggerHaptic(16);
      playTone('smash');
      addFloatingText(head.x, head.y, `震碎 ${cleared.length} 块岩石!`, 'hsl(42, 95%, 68%)');
    }
  },
  {
    id: 'combo_frenzy',
    name: '连击',
    rarity: 'common',
    getDesc: () => comboUpgradeLevel === 0
      ? '短时间内连续吃果实分数叠加，每层连击额外 +4 分'
      : '连击加分提升至每层 +8 分，且连击维持时间延长 1 秒',
    canPick: () => comboUpgradeLevel < 2,
    apply: () => {
      comboUpgradeLevel += 1;
      addFloatingText(snake[0].x, snake[0].y, comboUpgradeLevel === 1 ? '连击加分激活!' : '连击强化!', 'hsl(48, 98%, 68%)');
    }
  },
  {
    id: 'buff_extend',
    name: '延时充能',
    rarity: 'uncommon',
    getDesc: () => '护盾、寒冰、双倍与幽灵持续时间永久 +2 秒，场上道具停留更久',
    canPick: () => buffBonusSec < 6,
    apply: () => {
      buffBonusSec += 2;
      addFloatingText(snake[0].x, snake[0].y, '增益时长 +2s!', 'hsl(206, 95%, 76%)');
    }
  },
  {
    id: 'instant_aegis',
    name: '圣盾赐福',
    rarity: 'uncommon',
    getDesc: () => '立即获得 10 秒穿墙碎石护盾，若生命未满额外恢复 1 点生命',
    canPick: () => true,
    apply: () => {
      shieldTimer = Math.max(shieldTimer, 10 + buffBonusSec);
      if (lives < maxLives) lives += 1;
      addFloatingText(snake[0].x, snake[0].y, '10s 圣盾护体!', 'hsl(206, 95%, 76%)');
    }
  },
  {
    id: 'level_freeze',
    name: '时停',
    rarity: 'uncommon',
    getDesc: () => '每关开始冻结 3 秒（暂停落石预警与道具倒计时，并减缓流速）',
    canPick: () => !hasLevelFreeze,
    apply: () => {
      hasLevelFreeze = true;
      freezeTimer = Math.max(freezeTimer, LEVEL_FREEZE_DURATION);
      addFloatingText(snake[0].x, snake[0].y, '时停领域激活!', 'hsl(202, 98%, 76%)');
    }
  },
  {
    id: 'magnet_aura',
    name: '幸运磁力',
    rarity: 'rare',
    getDesc: () => magnetLevel === 0
      ? '自动隔空吸取周围 1 格内的苹果与道具，且道具刷新加快 25%'
      : '道具刷新速度再加快 25%，并立即在场上召唤一个随机道具',
    canPick: () => magnetLevel < 2,
    apply: () => {
      magnetLevel += 1;
      if (!powerUp) spawnPowerUp();
      addFloatingText(snake[0].x, snake[0].y, magnetLevel === 1 ? '磁力光环激活!' : '磁力强化!', 'hsl(276, 96%, 80%)');
    }
  },
  {
    id: 'phase_body',
    name: '相位穿身',
    rarity: 'rare',
    getDesc: () => '撞自己不扣血，永久自由穿过自身身体',
    canPick: () => !hasPhaseBody,
    apply: () => {
      hasPhaseBody = true;
      ghostTimer = 0;
      addFloatingText(snake[0].x, snake[0].y, '永久相位穿身!', 'hsl(276, 96%, 82%)');
    }
  },
  {
    id: 'blast_expert',
    name: '爆破专家',
    rarity: 'uncommon',
    getDesc: () => '炸弹刷新权重 +50%，炸弹每炸碎 1 块岩石额外 +5 分',
    canPick: () => blastExpertLevel < 1,
    apply: () => {
      blastExpertLevel = 1;
      addFloatingText(snake[0].x, snake[0].y, '爆破专家!', 'hsl(24, 98%, 68%)');
    }
  },
  {
    id: 'stone_feast',
    name: '以石养身',
    rarity: 'rare',
    getDesc: () => `每累计碎 ${STONE_FEAST_THRESHOLD} 块岩石回复 1 点生命；生命已满时改为获得 ${STONE_FEAST_SHIELD_SEC} 秒护盾`,
    canPick: () => !hasStoneFeast,
    apply: () => {
      hasStoneFeast = true;
      stoneFeastProgress = 0;
      addFloatingText(snake[0].x, snake[0].y, '以石养身!', 'hsl(152, 80%, 66%)');
    }
  },
  {
    id: 'nirvana',
    name: '涅槃',
    rarity: 'legendary',
    getDesc: () => '死亡时满血复活一次，震碎周围碎石并获得 3 秒无敌',
    canPick: () => nirvanaCharges === 0 && !nirvanaUsed,
    apply: () => {
      nirvanaCharges = 1;
      addFloatingText(snake[0].x, snake[0].y, '🔥 涅槃之力加身!', 'hsl(30, 100%, 74%)');
    }
  }
];

// ------------------------------------------
// 辅助查询与隐藏速度计算
// ------------------------------------------
function recalcBaseInterval() {
  const levelGain =
    Math.min(level - 1, 19) * SPEED_GAIN_PER_LEVEL +
    Math.max(0, level - CLEAR_LEVEL) * 0.025;
  const rawMult = Math.min(2.5, 1 + levelGain - slowUpgradeCount * SLOW_UPGRADE_STEP);
  const clampedMult = Math.max(MIN_SPEED_MULT, rawMult);
  baseStepInterval = Math.round(INITIAL_INTERVAL / clampedMult);
}

function getEffectiveInterval() {
  const slowFactor = iceTimer > 0 ? 1.45 : (freezeTimer > 0 ? 1.35 : 1);
  return Math.round(baseStepInterval * slowFactor);
}

function getPowerUpCooldown() {
  const factor = magnetLevel === 0 ? 1 : (magnetLevel === 1 ? 0.75 : 0.56);
  return 4.8 * factor;
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

function clearObstaclesNear(cx, cy, radius = 2) {
  let cleared = 0;
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    if (Math.abs(o.x - cx) <= radius && Math.abs(o.y - cy) <= radius) {
      obstacles.splice(i, 1);
      spawnBurst(o.x, o.y, '28, 85%, 62%', 9);
      cleared++;
    }
  }
  registerRocksSmashed(cleared);
  return cleared;
}

// 统一的碎石计数入口：累计战绩，并推进「以石养身」进度
function registerRocksSmashed(count) {
  if (count <= 0) return;
  rocksSmashed += count;
  if (!hasStoneFeast) return;

  stoneFeastProgress += count;
  let triggered = false;
  while (stoneFeastProgress >= STONE_FEAST_THRESHOLD) {
    stoneFeastProgress -= STONE_FEAST_THRESHOLD;
    triggered = true;
    const head = snake[0];
    if (lives < maxLives) {
      lives += 1;
      playTone('heal');
      if (head) addFloatingText(head.x, head.y, '以石养身 +1 生命!', 'hsl(152, 85%, 66%)');
    } else {
      shieldTimer += STONE_FEAST_SHIELD_SEC;
      if (head) addFloatingText(head.x, head.y, `以石养身 +${STONE_FEAST_SHIELD_SEC}s 护盾!`, 'hsl(164, 90%, 66%)');
    }
  }
  if (triggered) updateHUD();
  renderBuffBar();
}

// 道具实际刷新权重：炸弹随场上岩石数量动态提升，并叠加「爆破专家」加成
function getPowerUpWeight(type) {
  if (type === 'bomb') {
    return getBombDynamicWeight(obstacles.length) * (1 + 0.5 * blastExpertLevel);
  }
  return POWERUP_TYPES[type].weight;
}

// ------------------------------------------
// 道具图鉴与关卡解锁流程
// ------------------------------------------
function renderLegend() {
  if (!itemLegendEl) return;
  const html = Object.values(POWERUP_TYPES)
    .map((cfg) => {
      const unlocked = level >= cfg.unlockLevel;
      return `<span class="legend-chip ${unlocked ? '' : 'locked'}" title="Lv.${cfg.unlockLevel} 解锁：${cfg.label}">
        <i class="dot ${cfg.dotClass}"></i>
        <span>${unlocked ? cfg.label : cfg.shortLabel}</span>
        ${unlocked ? '' : `<span class="legend-lv">Lv.${cfg.unlockLevel}</span>`}
      </span>`;
    })
    .join('');
  itemLegendEl.innerHTML = html;
}

function createInitialObstacles() {
  return [
    { x: 4, y: 4, warnTimer: 0 },
    { x: 15, y: 4, warnTimer: 0 },
    { x: 4, y: 15, warnTimer: 0 },
    { x: 15, y: 15, warnTimer: 0 }
  ];
}

function spawnLevelObstacles(count, lv = level) {
  const head = snake[0];
  const cap = getMaxObstacles(lv);
  let spawned = 0;

  for (let n = 0; n < count; n++) {
    if (obstacles.length >= cap) break;

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
      spawned++;
    }
  }

  return spawned;
}

function checkLevelUp() {
  const rawTarget = getLevelForScore(score);
  const targetLevel = endlessMode ? rawTarget : Math.min(CLEAR_LEVEL, rawTarget);
  if (targetLevel > level) {
    const prevLevel = level;
    level = targetLevel;
    recalcBaseInterval();

    if (!endlessMode && level >= CLEAR_LEVEL) {
      pendingUpgradeLevels = [];
      updateHUD();
      renderLegend();
      endGame(true);
      return;
    }

    let spawnedRocks = 0;
    const newlyUnlocked = [];
    const hasAvailableUpgrade = UPGRADE_POOL.some((u) => u.canPick());

    for (let lv = prevLevel + 1; lv <= level; lv++) {
      spawnedRocks += spawnLevelObstacles(getRocksForLevel(lv), lv);
      if (lv % UPGRADE_EVERY_LEVELS === 0 && hasAvailableUpgrade) {
        pendingUpgradeLevels.push(lv);
      }
      for (const cfg of Object.values(POWERUP_TYPES)) {
        if (cfg.unlockLevel === lv) {
          newlyUnlocked.push(cfg.shortLabel);
        }
      }
    }
    rockDripTimer = 0; // 升级落石后重新计时，避免与定时落石连续叠加

    if (hasLevelFreeze) {
      freezeTimer = LEVEL_FREEZE_DURATION;
      renderBuffBar();
    }

    if (newlyUnlocked.length > 0 && snake.length > 0) {
      addFloatingText(snake[0].x, snake[0].y, `解锁道具：${newlyUnlocked.join('/')}!`, 'hsl(43, 98%, 72%)');
    }

    playTone(pendingUpgradeLevels.length > 0 ? 'upgrade' : 'levelup');
    if (spawnedRocks > 0) {
      showLevelBanner(`Lv.${level} 关卡提升！注意红色落石预警`);
    } else {
      levelBannerEl.classList.add('hidden');
      bannerTimer = 0;
    }
    updateHUD();
    renderLegend();
  }
}

function pickWeightedUpgrades(count = 3) {
  const remaining = UPGRADE_POOL.filter((u) => u.canPick());
  const picked = [];

  while (picked.length < count && remaining.length > 0) {
    const totalWeight = remaining.reduce(
      (sum, item) => sum + RARITY_CONFIG[item.rarity].weight,
      0
    );
    let roll = Math.random() * totalWeight;
    let chosenIdx = remaining.length - 1;
    for (let i = 0; i < remaining.length; i++) {
      roll -= RARITY_CONFIG[remaining[i].rarity].weight;
      if (roll <= 0) {
        chosenIdx = i;
        break;
      }
    }
    picked.push(remaining.splice(chosenIdx, 1)[0]);
  }

  return picked;
}

function openNextUpgradeChoice() {
  if (pendingUpgradeLevels.length === 0 || state !== 'running') return;

  const source = pendingUpgradeLevels.shift();
  currentChoices = pickWeightedUpgrades(3);
  if (currentChoices.length === 0) return;

  state = 'choosing';
  pauseBtn.disabled = true;

  upgradeBadgeEl.textContent = source === 'chest'
    ? '🎁 神秘宝箱奖励'
    : `Lv.${source} 里程碑奖励`;
  upgradeListEl.innerHTML = '';

  currentChoices.forEach((choice, idx) => {
    const rarityMeta = RARITY_CONFIG[choice.rarity];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `upgrade-card rarity-${choice.rarity}`;
    btn.innerHTML = `
      <span class="upgrade-key">${idx + 1}</span>
      <span class="upgrade-body">
        <span class="upgrade-title-row">
          <span class="upgrade-name">${choice.name}</span>
          <span class="rarity-tag rarity-${choice.rarity}">${rarityMeta.label}</span>
        </span>
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
  pickedUpgrades.push({ name: chosen.name, rarity: chosen.rarity });
  playTone('upgrade');
  chosen.apply();

  recalcBaseInterval();
  checkLevelUp();
  if (state !== 'choosing') return;

  updateHUD();
  invulnTimer = Math.max(invulnTimer, 1.2);
  renderBuffBar();

  if (pendingUpgradeLevels.length > 0) {
    state = 'running';
    openNextUpgradeChoice();
  } else {
    upgradeOverlayEl.classList.add('hidden');
    directionQueue = [];
    stepAccumulator = 0;
    pauseGame('强化已生效', `已获得「${chosen.name}」，确认走位后按空格或点击继续。`);
  }
}

function showLevelBanner(text) {
  levelBannerEl.textContent = text;
  levelBannerEl.classList.remove('hidden');
  bannerTimer = 2.4;
}

// ------------------------------------------
// 初始化、暂停、战绩结算与分享
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
  endlessMode = false;

  slowUpgradeCount = 0;
  scoreMultiplier = 1.0;
  buffBonusSec = 0;
  magnetLevel = 0;
  comboUpgradeLevel = 0;
  hasLevelFreeze = false;
  hasPhaseBody = false;
  nirvanaCharges = 0;
  nirvanaUsed = false;
  blastExpertLevel = 0;
  hasStoneFeast = false;
  stoneFeastProgress = 0;

  pendingUpgradeLevels = [];
  currentChoices = [];
  pickedUpgrades = [];
  runElapsedSec = 0;
  rocksSmashed = 0;

  recalcBaseInterval();
  iceTimer = 0;
  doubleTimer = 0;
  shieldTimer = 0;
  ghostTimer = 0;
  freezeTimer = 0;
  invulnTimer = 0;
  bannerTimer = 0;
  shakeTimer = 0;
  hitstopTimer = 0;
  rockDripTimer = 0;
  comboCount = 0;
  comboTimer = 0;

  levelBannerEl.classList.add('hidden');
  upgradeOverlayEl.classList.add('hidden');

  obstacles = createInitialObstacles();
  powerUp = null;
  powerUpCooldown = 3.0;
  lastPowerUpType = null;
  particles = [];
  floatingTexts = [];

  spawnFood();
  updateHUD();
  renderLegend();
  renderBuffBar();
}

function startGame() {
  initGameData();
  state = 'running';
  stepAccumulator = 0;
  lastFrameTime = performance.now();
  pauseBtn.disabled = false;
  pauseBtn.textContent = '暂停';
  overlayTipsEl.classList.add('hidden');
  runSummaryEl.classList.add('hidden');
  endlessBtn.classList.add('hidden');
  shareBtn.classList.add('hidden');
  overlayEl.classList.add('hidden');
}

function continueEndlessMode() {
  if (state !== 'won' || endlessMode) return;
  endlessMode = true;
  state = 'running';
  directionQueue = [];
  stepAccumulator = 0;
  lastFrameTime = performance.now();
  invulnTimer = Math.max(invulnTimer, 2.0);
  if (hasLevelFreeze) {
    freezeTimer = Math.max(freezeTimer, LEVEL_FREEZE_DURATION);
  }
  if (!food) {
    spawnFood();
  }
  pauseBtn.disabled = false;
  pauseBtn.textContent = '暂停';
  endlessBtn.classList.add('hidden');
  shareBtn.classList.add('hidden');
  runSummaryEl.classList.add('hidden');
  overlayEl.classList.add('hidden');
  showLevelBanner('无尽模式开启！向更高关卡冲刺');
  if (snake.length > 0) {
    addFloatingText(snake[0].x, snake[0].y, '∞ 无尽模式启动!', 'hsl(43, 98%, 70%)');
  }
  updateHUD();
  renderBuffBar();
}

function pauseGame(
  title = '已暂停',
  desc = '按空格键或点击下方按钮继续挑战。'
) {
  state = 'paused';
  pauseBtn.disabled = false;
  pauseBtn.textContent = '继续';
  showOverlay(title, desc, '继续游戏', { showTips: false, showSummary: false });
}

function togglePause() {
  if (state === 'running') {
    pauseGame('已暂停', '按空格键或点击下方按钮继续挑战。');
  } else if (state === 'paused') {
    state = 'running';
    stepAccumulator = 0;
    lastFrameTime = performance.now();
    pauseBtn.textContent = '暂停';
    overlayEl.classList.add('hidden');
  }
}

function autoPauseOnBackground() {
  if (state === 'running') {
    pauseGame('已自动暂停', '切出页面已自动保护当前进度，按空格键或点击继续。');
  }
}

function renderRunSummary() {
  const upgradesHtml = pickedUpgrades.length > 0
    ? pickedUpgrades
        .map((u) => `<span class="summary-chip rarity-${u.rarity}">${u.name}</span>`)
        .join('')
    : '<span class="summary-upgrades-empty">本局尚未解锁强化</span>';

  runSummaryEl.innerHTML = `
    <div class="summary-metrics">
      <div class="summary-metric">
        <span class="summary-metric-label">存活时间</span>
        <span class="summary-metric-val">${formatDuration(runElapsedSec)}</span>
      </div>
      <div class="summary-metric">
        <span class="summary-metric-label">击碎碎石</span>
        <span class="summary-metric-val">${rocksSmashed} 块</span>
      </div>
    </div>
    <div class="summary-upgrades">${upgradesHtml}</div>
  `;
}

function buildShareText() {
  let statusLine = `🐍 贪吃蛇·肉鸽挑战｜闯关至 Lv.${level}`;
  if (state === 'won') {
    statusLine = `🐍 贪吃蛇·肉鸽挑战｜恭喜通关！(Lv.${level})`;
  } else if (endlessMode) {
    statusLine = `🐍 贪吃蛇·肉鸽挑战｜无尽模式止步 Lv.${level}`;
  }
  const upgradeLine = pickedUpgrades.length > 0
    ? pickedUpgrades.map((u) => u.name).join(' / ')
    : '无';

  return [
    statusLine,
    `🏆 得分：${score}（最高 ${bestScore}）`,
    `⏱️ 存活：${formatDuration(runElapsedSec)} ｜ 🪨 碎石：${rocksSmashed} 块`,
    `✨ 强化：${upgradeLine}`
  ].join('\n');
}

async function copyShareStats() {
  const text = buildShareText();
  let copied = false;

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      copied = true;
    }
  } catch {
    copied = false;
  }

  if (!copied) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      copied = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch {
      copied = false;
    }
  }

  if (shareResetTimeout) clearTimeout(shareResetTimeout);
  shareBtn.textContent = copied ? '已复制战绩 ✓' : '复制失败';
  shareResetTimeout = setTimeout(() => {
    shareBtn.textContent = '复制战绩';
  }, 2000);
}

function endGame(won = false) {
  state = won ? 'won' : 'gameover';
  pauseBtn.disabled = true;
  pauseBtn.textContent = '暂停';
  upgradeOverlayEl.classList.add('hidden');
  levelBannerEl.classList.add('hidden');
  playTone(won ? 'win' : 'gameover');

  if (won && snake.length > 0) {
    triggerHaptic([30, 40, 60]);
    spawnBurst(snake[0].x, snake[0].y, '43, 96%, 60%', 18);
    spawnBurst(Math.floor(GRID_COUNT / 2), Math.floor(GRID_COUNT / 2), '152, 80%, 58%', 18);
  }

  if (score > bestScore) {
    bestScore = score;
    saveBestScore(bestScore);
    updateHUD();
  }

  renderRunSummary();
  shareBtn.textContent = '复制战绩';

  if (won) {
    const desc = level >= CLEAR_LEVEL
      ? `成功突破全部 ${CLEAR_LEVEL} 关挑战！本局得分 ${score} · 最高纪录 ${bestScore}，可选择继续无尽模式挑战极限！`
      : `成功占领全部棋盘格！本局得分 ${score} · 最高纪录 ${bestScore}`;
    showOverlay('恭喜通关！', desc, '再来一局', {
      showTips: false,
      showSummary: true,
      showEndless: !endlessMode
    });
  } else {
    const desc = endlessMode
      ? `无尽模式 · 止步 Lv.${level} · 本局得分 ${score} · 最高纪录 ${bestScore}`
      : `闯至 Lv.${level} · 本局得分 ${score} · 最高纪录 ${bestScore}`;
    showOverlay('游戏结束', desc, '再来一局', {
      showTips: false,
      showSummary: true,
      showEndless: false
    });
  }
}

function showOverlay(title, desc, btnText, { showTips = false, showSummary = false, showEndless = false } = {}) {
  overlayTitleEl.textContent = title;
  overlayDescEl.textContent = desc;
  startBtn.textContent = btnText;
  overlayTipsEl.classList.toggle('hidden', !showTips);
  runSummaryEl.classList.toggle('hidden', !showSummary);
  endlessBtn.classList.toggle('hidden', !showEndless);
  shareBtn.classList.toggle('hidden', !showSummary);
  overlayEl.classList.remove('hidden');
}

function updateHUD() {
  livesEl.textContent = '♥'.repeat(lives) + '♡'.repeat(Math.max(0, maxLives - lives));
  scoreEl.textContent = String(score);
  levelEl.textContent = endlessMode ? `Lv.${level} ∞` : `Lv.${level}`;
  bestScoreEl.textContent = String(bestScore);
}

function renderBuffBar() {
  const pills = [];
  if (nirvanaCharges > 0) {
    pills.push('<span class="buff-pill" style="border-color: hsl(28, 96%, 56%); color: hsl(32, 100%, 78%);">涅槃待命</span>');
  }
  if (invulnTimer > 0) {
    pills.push(`<span class="buff-pill" style="border-color: hsl(345, 86%, 56%); color: hsl(345, 95%, 76%);">无敌 ${invulnTimer.toFixed(1)}s</span>`);
  }
  if (freezeTimer > 0) {
    pills.push(`<span class="buff-pill" style="border-color: hsl(202, 92%, 60%); color: hsl(202, 98%, 80%);">时停 ${freezeTimer.toFixed(1)}s</span>`);
  }
  if (doubleTimer > 0) {
    pills.push(`<span class="buff-pill" style="border-color: hsl(39, 94%, 42%); color: hsl(42, 96%, 66%);">双倍 ${doubleTimer.toFixed(1)}s</span>`);
  }
  if (shieldTimer > 0) {
    pills.push(`<span class="buff-pill" style="border-color: hsl(164, 78%, 45%); color: hsl(164, 88%, 72%);">护盾 ${shieldTimer.toFixed(1)}s</span>`);
  }
  if (iceTimer > 0) {
    pills.push(`<span class="buff-pill" style="border-color: hsl(196, 80%, 52%); color: hsl(196, 92%, 76%);">减速 ${iceTimer.toFixed(1)}s</span>`);
  }
  if (hasPhaseBody) {
    pills.push('<span class="buff-pill" style="border-color: hsl(276, 82%, 64%); color: hsl(276, 96%, 82%);">相位穿身</span>');
  } else if (ghostTimer > 0) {
    pills.push(`<span class="buff-pill" style="border-color: hsl(258, 82%, 68%); color: hsl(258, 96%, 84%);">幽灵 ${ghostTimer.toFixed(1)}s</span>`);
  }
  if (comboUpgradeLevel > 0 && comboCount >= 2 && comboTimer > 0) {
    pills.push(`<span class="buff-pill" style="border-color: hsl(46, 96%, 54%); color: hsl(48, 100%, 76%);">连击 x${comboCount}</span>`);
  }
  if (magnetLevel > 0) {
    pills.push(`<span class="buff-pill" style="border-color: hsl(276, 82%, 64%); color: hsl(276, 96%, 82%);">磁力 Lv.${magnetLevel}</span>`);
  }
  if (blastExpertLevel > 0) {
    pills.push(`<span class="buff-pill" style="border-color: hsl(20, 92%, 56%); color: hsl(24, 98%, 74%);">爆破专家</span>`);
  }
  if (hasStoneFeast) {
    pills.push(`<span class="buff-pill" style="border-color: hsl(152, 70%, 46%); color: hsl(152, 85%, 72%);">养身 ${stoneFeastProgress}/${STONE_FEAST_THRESHOLD}</span>`);
  }
  buffBarEl.innerHTML = pills.length > 0
    ? pills.join('')
    : '<span class="buff-empty">状态：暂无限时增益</span>';
}

// ------------------------------------------
// 生成苹果、按等级解锁的随机道具与粒子特效
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

function isPowerUpEligible(type) {
  const cfg = POWERUP_TYPES[type];
  if (!cfg || level < cfg.unlockLevel) return false;
  if (type === 'heart') return lives < maxLives;
  if (type === 'bomb') return obstacles.length >= 2;
  if (type === 'scissors') return snake.length >= 6;
  if (type === 'ghost') return !hasPhaseBody;
  if (type === 'chest') return UPGRADE_POOL.some((u) => u.canPick());
  return true;
}

function spawnPowerUp() {
  const cells = findEmptyCells(true);
  if (cells.length === 0) return;

  const eligible = Object.keys(POWERUP_TYPES).filter(isPowerUpEligible);
  if (eligible.length === 0) return;

  const nonRepeat = eligible.filter((key) => key !== lastPowerUpType);
  const candidates = nonRepeat.length > 0 ? nonRepeat : eligible;

  const totalWeight = candidates.reduce((sum, key) => sum + getPowerUpWeight(key), 0);
  let roll = Math.random() * totalWeight;
  let pickedType = candidates[0];
  for (const key of candidates) {
    roll -= getPowerUpWeight(key);
    if (roll <= 0) {
      pickedType = key;
      break;
    }
  }

  const pos = cells[Math.floor(Math.random() * cells.length)];
  const itemTtl = 9.5 + (buffBonusSec > 0 ? 2.0 : 0);

  lastPowerUpType = pickedType;
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
// 连击计分、道具触发与碰撞判定
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

function calcDoublePts(pts) {
  return doubleTimer > 0 ? pts * 2 : pts;
}

function registerComboBonus() {
  if (comboUpgradeLevel <= 0) return 0;
  comboCount = Math.min(8, comboCount + 1);
  comboTimer = COMBO_WINDOW + (comboUpgradeLevel > 1 ? 1.0 : 0);
  renderBuffBar();
  return comboCount >= 2 ? (comboCount - 1) * (4 * comboUpgradeLevel) : 0;
}

function applyPowerUp(item) {
  hitstopTimer = HITSTOP_DURATION;
  triggerHaptic(18);
  let triggerChestModal = false;

  if (item.type === 'heart') {
    playTone('heal');
    lives = Math.min(maxLives, lives + 1);
    score += calcDoublePts(10);
    spawnBurst(item.x, item.y, '345, 92%, 64%', 14);
    addFloatingText(item.x, item.y, '+1 生命!', 'hsl(345, 96%, 74%)');
  } else if (item.type === 'gold') {
    playTone('powerup');
    const comboBonus = registerComboBonus();
    const pts = calcDoublePts(Math.round(30 * scoreMultiplier) + comboBonus);
    score += pts;
    pendingGrowth += 2;
    spawnBurst(item.x, item.y, '43, 96%, 58%', 14);
    addFloatingText(item.x, item.y, `+${pts} 金色果实!`, 'hsl(43, 96%, 64%)');
  } else if (item.type === 'double') {
    playTone('powerup');
    score += calcDoublePts(10);
    doubleTimer = Math.max(doubleTimer, POWERUP_TYPES.double.duration + buffBonusSec);
    spawnBurst(item.x, item.y, '39, 96%, 45%', 15);
    addFloatingText(item.x, item.y, '双倍得分!', 'hsl(42, 98%, 62%)');
  } else if (item.type === 'ice') {
    playTone('powerup');
    score += calcDoublePts(10);
    iceTimer = Math.max(iceTimer, POWERUP_TYPES.ice.duration + buffBonusSec);
    pendingGrowth += 1;
    spawnBurst(item.x, item.y, '196, 90%, 64%', 12);
    addFloatingText(item.x, item.y, '寒冰减速!', 'hsl(196, 92%, 72%)');
  } else if (item.type === 'shield') {
    playTone('powerup');
    score += calcDoublePts(10);
    shieldTimer = Math.max(shieldTimer, POWERUP_TYPES.shield.duration + buffBonusSec);
    pendingGrowth += 1;
    spawnBurst(item.x, item.y, '164, 85%, 56%', 12);
    addFloatingText(item.x, item.y, '穿墙碎石护盾!', 'hsl(164, 90%, 66%)');
  } else if (item.type === 'bomb') {
    playTone('bomb');
    const cleared = clearObstaclesNear(snake[0].x, snake[0].y, 5);
    const pts = calcDoublePts(10 + cleared * (5 + 5 * blastExpertLevel));
    score += pts;
    shakeTimer = Math.max(shakeTimer, 0.2);
    triggerHaptic([25, 20, 35]);
    spawnBurst(item.x, item.y, '20, 96%, 60%', 18);
    addFloatingText(
      item.x,
      item.y,
      cleared > 0 ? `爆破 ${cleared} 石 +${pts}!` : `11×11 爆破 +${pts}!`,
      'hsl(24, 98%, 68%)'
    );
  } else if (item.type === 'scissors') {
    playTone('powerup');
    const targetLen = Math.max(3, snake.length - 5);
    const removed = snake.splice(targetLen);
    pendingGrowth = 0;
    score += calcDoublePts(15);
    removed.forEach((seg) => spawnBurst(seg.x, seg.y, '220, 88%, 58%', 5));
    spawnBurst(item.x, item.y, '220, 88%, 58%', 12);
    addFloatingText(item.x, item.y, `剪短 -${removed.length} 节!`, 'hsl(220, 92%, 70%)');
  } else if (item.type === 'ghost') {
    playTone('powerup');
    score += calcDoublePts(10);
    ghostTimer = Math.max(ghostTimer, POWERUP_TYPES.ghost.duration + buffBonusSec);
    spawnBurst(item.x, item.y, '258, 90%, 76%', 14);
    addFloatingText(item.x, item.y, '幽灵穿身!', 'hsl(258, 95%, 82%)');
  } else if (item.type === 'chest') {
    playTone('upgrade');
    score += calcDoublePts(20);
    triggerChestModal = true;
    spawnBurst(item.x, item.y, '32, 98%, 60%', 18);
    addFloatingText(item.x, item.y, '🎁 开启神秘宝箱!', 'hsl(34, 100%, 74%)');
  }

  recalcBaseInterval();
  powerUp = null;
  powerUpCooldown = getPowerUpCooldown();
  checkLevelUp();

  if (state === 'running' && triggerChestModal && UPGRADE_POOL.some((u) => u.canPick())) {
    pendingUpgradeLevels.push('chest');
  }

  updateHUD();
  renderBuffBar();
}

function takeDamage(hitX, hitY) {
  lives = Math.max(0, lives - 1);
  shakeTimer = SHAKE_DURATION;
  triggerHaptic([35, 25, 45]);

  if (lives <= 0) {
    // 若持有传说强化「涅槃」，触发满血复活并震碎周围碎石
    if (nirvanaCharges > 0) {
      nirvanaCharges -= 1;
      nirvanaUsed = true;
      lives = maxLives;
      invulnTimer = NIRVANA_INVULN_DURATION;
      shakeTimer = 0.28;
      triggerHaptic([45, 30, 60, 30, 80]);
      clearObstaclesNear(hitX, hitY, 2);
      playTone('nirvana');
      spawnBurst(hitX, hitY, '28, 100%, 62%', 22);
      addFloatingText(hitX, hitY, '🔥 涅槃满血重生!', 'hsl(32, 100%, 74%)');
      updateHUD();
      renderBuffBar();
      return true;
    }

    updateHUD();
    endGame(false);
    return false;
  }

  updateHUD();
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

  // 1. 边界检测：仅护盾状态可穿墙；无护盾撞墙停在原地并扣血触发短暂无敌
  if (nextX < 0 || nextX >= GRID_COUNT || nextY < 0 || nextY >= GRID_COUNT) {
    if (shieldTimer > 0) {
      nextX = (nextX + GRID_COUNT) % GRID_COUNT;
      nextY = (nextY + GRID_COUNT) % GRID_COUNT;
    } else {
      if (invulnTimer <= 0) {
        takeDamage(head.x, head.y);
      }
      return;
    }
  }

  // 2. 岩石障碍检测
  const hitRockIndex = obstacles.findIndex(
    (o) => o.x === nextX && o.y === nextY && o.warnTimer <= 0
  );
  if (hitRockIndex !== -1) {
    if (shieldTimer > 0) {
      // 护盾撞碎岩石：计分并计入连击，鼓励开盾主动冲撞
      const rock = obstacles[hitRockIndex];
      obstacles.splice(hitRockIndex, 1);
      registerRocksSmashed(1);
      const comboBonus = registerComboBonus();
      const smashPts = calcDoublePts(5 + comboBonus);
      score += smashPts;
      shakeTimer = Math.max(shakeTimer, 0.1);
      triggerHaptic(14);
      playTone('smash');
      spawnBurst(rock.x, rock.y, '32, 18%, 62%', 12);
      addFloatingText(
        rock.x,
        rock.y,
        comboBonus > 0 ? `碎石 +${smashPts} 连击x${comboCount}` : `碎石 +${smashPts}`,
        'hsl(164, 85%, 68%)'
      );
      checkLevelUp();
      updateHUD();
      if (state !== 'running') return;
    } else if (invulnTimer <= 0) {
      const rock = obstacles[hitRockIndex];
      obstacles.splice(hitRockIndex, 1);
      registerRocksSmashed(1);
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

  // 3. 撞自身检测（无敌、幽灵相位道具或永久「相位穿身」时免疫自身碰撞）
  const bodyToCheck = willGrowThisStep ? snake : snake.slice(0, -1);
  const canPhaseSelf = invulnTimer > 0 || ghostTimer > 0 || hasPhaseBody;
  if (!canPhaseSelf && bodyToCheck.some((seg) => seg.x === nextX && seg.y === nextY)) {
    if (!takeDamage(nextX, nextY)) return;
  }

  // 4. 推进蛇头
  snake.unshift({ x: nextX, y: nextY });

  if (willEatFood) {
    const comboBonus = registerComboBonus();
    const pts = calcDoublePts(Math.round(10 * scoreMultiplier) + comboBonus);
    score += pts;
    playTone('eat');
    spawnBurst(food.x, food.y, '16, 90%, 62%', 10);
    if (comboBonus > 0) {
      addFloatingText(food.x, food.y, `连击x${comboCount} +${pts}`, 'hsl(46, 100%, 70%)');
    } else if (doubleTimer > 0) {
      addFloatingText(food.x, food.y, `双倍 +${pts}`, 'hsl(42, 98%, 62%)');
    } else if (pts > 10) {
      addFloatingText(food.x, food.y, `+${pts}`, 'hsl(43, 96%, 68%)');
    }
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

  if (state === 'running' && pendingUpgradeLevels.length > 0) {
    openNextUpgradeChoice();
  }
}

// ------------------------------------------
// 计时器更新与主循环
// ------------------------------------------
function updateTimers(dtSeconds) {
  runElapsedSec += dtSeconds;
  let buffChanged = false;
  const isWorldFrozen = freezeTimer > 0;

  if (freezeTimer > 0) {
    freezeTimer = Math.max(0, freezeTimer - dtSeconds);
    buffChanged = true;
  }

  if (invulnTimer > 0) {
    invulnTimer = Math.max(0, invulnTimer - dtSeconds);
    buffChanged = true;
  }

  if (iceTimer > 0) {
    iceTimer = Math.max(0, iceTimer - dtSeconds);
    buffChanged = true;
  }

  if (doubleTimer > 0) {
    doubleTimer = Math.max(0, doubleTimer - dtSeconds);
    buffChanged = true;
  }

  if (shieldTimer > 0) {
    shieldTimer = Math.max(0, shieldTimer - dtSeconds);
    buffChanged = true;
  }

  if (ghostTimer > 0) {
    ghostTimer = Math.max(0, ghostTimer - dtSeconds);
    buffChanged = true;
  }

  if (comboTimer > 0 && !isWorldFrozen) {
    comboTimer = Math.max(0, comboTimer - dtSeconds);
    if (comboTimer === 0) {
      comboCount = 0;
      buffChanged = true;
    }
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
    if (!isWorldFrozen) {
      powerUp.ttl -= dtSeconds;
      if (powerUp.ttl <= 0) {
        powerUp = null;
        powerUpCooldown = getPowerUpCooldown();
      }
    }
  } else {
    powerUpCooldown -= dtSeconds;
    if (powerUpCooldown <= 0) {
      spawnPowerUp();
      powerUpCooldown = getPowerUpCooldown();
    }
  }

  if (!isWorldFrozen) {
    // 定时落石：时停期间暂停计时；复用升级落石的公平性规则与动态上限，达到上限即不再落石
    const dripInterval = getRockDripInterval(level);
    if (dripInterval > 0) {
      rockDripTimer += dtSeconds;
      if (rockDripTimer >= dripInterval) {
        rockDripTimer = 0;
        spawnLevelObstacles(1, level);
      }
    } else {
      rockDripTimer = 0;
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
}

function gameLoop(timestamp) {
  if (!lastFrameTime) lastFrameTime = timestamp;
  const deltaMs = Math.min(timestamp - lastFrameTime, 100);
  const dtSeconds = deltaMs / 1000;
  lastFrameTime = timestamp;

  if (shakeTimer > 0) {
    shakeTimer = Math.max(0, shakeTimer - dtSeconds);
  }

  if (state === 'running') {
    if (hitstopTimer > 0) {
      hitstopTimer = Math.max(0, hitstopTimer - dtSeconds);
    } else {
      updateTimers(dtSeconds);
      stepAccumulator += deltaMs;
      let currentInterval = getEffectiveInterval();
      while (stepAccumulator >= currentInterval && state === 'running' && hitstopTimer <= 0) {
        stepAccumulator -= currentInterval;
        stepGame();
        currentInterval = getEffectiveInterval();
      }
    }
  }

  renderScene(timestamp, dtSeconds);
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
    if (state === 'paused') {
      togglePause();
    } else {
      startGame();
    }
  }
});

// 切出标签页、锁屏或窗口失焦时自动暂停
document.addEventListener('visibilitychange', () => {
  if (document.hidden) autoPauseOnBackground();
});
window.addEventListener('blur', autoPauseOnBackground);

startBtn.addEventListener('click', () => {
  if (state === 'paused') {
    togglePause();
  } else if (state !== 'choosing') {
    startGame();
  }
});

endlessBtn.addEventListener('click', continueEndlessMode);
shareBtn.addEventListener('click', copyShareStats);
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
