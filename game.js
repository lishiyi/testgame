// ==========================================
// 经典贪吃蛇 · 进阶版（核心状态机、道具解锁与肉鸽强化控制）
// ==========================================

// DOM 元素引用
const livesEl = document.getElementById('lives-value');
const scoreEl = document.getElementById('score-value');
const levelEl = document.getElementById('level-value');
const bestScoreEl = document.getElementById('best-score-value');
const modeBadgeEl = document.getElementById('mode-badge');
const modeSelectorEl = document.getElementById('mode-selector');
const modeEasyBtn = document.getElementById('mode-easy-btn');
const modeStandardBtn = document.getElementById('mode-standard-btn');
const modeHardBtn = document.getElementById('mode-hard-btn');
const modeDescEl = document.getElementById('mode-desc');
const nextLevelHintEl = document.getElementById('next-level-hint');
const nextUpgradeHintEl = document.getElementById('next-upgrade-hint');
const snakeLenEl = document.getElementById('snake-len-value');
const levelProgressFillEl = document.getElementById('level-progress-fill');
const itemLegendEl = document.getElementById('item-legend');
const legendPopoverEl = document.getElementById('legend-popover');
const buffBarEl = document.getElementById('buff-bar');
const rockDripChipEl = document.getElementById('rock-drip-chip');
const levelBannerEl = document.getElementById('level-banner');
const upgradeOverlayEl = document.getElementById('upgrade-overlay');
const upgradeBadgeEl = document.getElementById('upgrade-badge');
const upgradeListEl = document.getElementById('upgrade-list');
const upgradeRerollBtn = document.getElementById('upgrade-reroll-btn');
const overlayEl = document.getElementById('board-overlay');
const overlayTitleEl = document.getElementById('overlay-title');
const overlayDescEl = document.getElementById('overlay-desc');
const overlayTipsEl = document.getElementById('overlay-tips');
const pauseUpgradesEl = document.getElementById('pause-upgrades');
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
let foodMoveTimer = 0; // 词缀「游走果实」移动计时（秒）

let comboCount = 0;
let comboTimer = 0;

let particles = [];
let floatingTexts = [];

let difficulty = 'standard'; // 'easy' | 'standard' | 'hard'（开局默认标准模式）
let hardClearCount = loadHardClearCount();
let maxLives = INITIAL_LIVES;
let lives = INITIAL_LIVES;
let score = 0;
let level = 1;
let endlessMode = false;
let activeMutator = null; // 当前激活场地词缀 key（主线高关卡与无尽共用）
let bestScore = loadBestScore(difficulty);
let bestEndlessLevel = loadBestEndlessLevel(difficulty);

// 肉鸽永久强化属性与单局统计（每局重置）
let slowUpgradeCount = 0;
let scoreBoostCount = 0;
let scoreMultiplier = 1.0;
let buffBonusSec = 0;
let magnetLevel = 0;
let comboUpgradeLevel = 0;
let hasLevelFreeze = false;
let hasPhaseBody = false;
let phaseBodyCooldown = 0;    // 「相位穿身」冷却剩余时间 (秒，0 表示就绪)
let nirvanaCharges = 0;
let nirvanaUsed = false;
let hasStarfallResonance = false; // 传说卡「星陨共鸣」
let blastExpertLevel = 0;     // 「爆破专家」是否已获得（0/1，不可叠加）
let hasStoneFeast = false;    // 是否持有「以石养身」
let stoneFeastProgress = 0;   // 「以石养身」当前累计碎石进度
let hasGreedyMaw = false;     // 双刃卡「狂暴胃口」
let extraFoodGrowth = 0;      // 每次吃普通苹果额外增加的蛇身节数
let hasBerserkRush = false;   // 双刃卡「极速猎手」
let treasureSenseLevel = 0;   // 「寻宝嗅觉」层数（0~2）
let emergencyArmorLevel = 0;  // 「应急护甲」层数（0~2）
let rerollsLeft = INITIAL_REROLLS; // 每局三选一剩余重随次数
let endlessAegisPickCount = 0;     // 无尽模式中已选取「圣盾赐福」的次数（用于收益递减）

let pendingUpgradeLevels = []; // Array<number | 'chest'>
let currentUpgradeSource = null; // 当前弹窗来源（关卡数或 'chest'，重随时保留高阶加成）
let currentChoices = [];
let pickedUpgrades = [];       // Array<{ name, rarity }>
let isPostUpgradeReady = false; // 是否处于选完强化后的棋盘透视准备态
let activeLegendItem = null;
let legendPopoverTimeout = null;
let runElapsedSec = 0;
let rocksSmashed = 0;
let damageStats = { wall: 0, rock: 0, self: 0 }; // 受击分类统计
let lastHitCause = null;       // 最近一次受击原因：'wall' | 'rock' | 'self' | null
let lastDripChipKey = '';
let shareResetTimeout = null;

let baseStepInterval = INITIAL_INTERVAL;
let lastFrameTime = 0;
let stepAccumulator = 0;

bestScoreEl.textContent = String(bestScore);

function getDifficultyCfg() {
  return DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.standard;
}

function syncDifficultyUI() {
  const cfg = getDifficultyCfg();
  const isEasy = difficulty === 'easy';
  const isStandard = difficulty === 'standard';
  const isHard = difficulty === 'hard';
  if (modeEasyBtn) modeEasyBtn.classList.toggle('active', isEasy);
  if (modeStandardBtn) modeStandardBtn.classList.toggle('active', isStandard);
  if (modeHardBtn) {
    modeHardBtn.classList.toggle('active', isHard);
    modeHardBtn.textContent = hardClearCount > 0 ? `困难模式 🏅` : '困难模式';
  }
  if (modeDescEl) {
    modeDescEl.textContent = cfg.summary;
    modeDescEl.classList.toggle('easy', isEasy);
    modeDescEl.classList.toggle('hard', isHard);
  }
  if (modeBadgeEl) {
    modeBadgeEl.classList.toggle('hidden', isStandard);
    modeBadgeEl.classList.toggle('easy', isEasy);
    if (isEasy) {
      modeBadgeEl.textContent = '🌿 简单';
    } else if (isHard) {
      modeBadgeEl.textContent = '🔥 困难';
    }
  }
}

function setDifficulty(mode) {
  if (!DIFFICULTY_CONFIG[mode]) return;
  difficulty = mode;
  bestScore = loadBestScore(difficulty);
  bestEndlessLevel = loadBestEndlessLevel(difficulty);
  bestScoreEl.textContent = String(bestScore);
  syncDifficultyUI();
  if (state === 'idle') {
    const cfg = getDifficultyCfg();
    maxLives = cfg.initialLives;
    lives = cfg.initialLives;
    recalcBaseInterval();
    updateHUD();
    renderRockDripChip();
  }
}

// 无尽模式下「圣盾赐福」收益递减：第 1 次 10s+回血，第 2 次 8s+回血，第 3 次起 6s->4s 且不再回血
function getInstantAegisProfile() {
  if (!endlessMode || endlessAegisPickCount <= 0) {
    return { shieldBaseSec: 10, canHeal: true };
  }
  if (endlessAegisPickCount === 1) {
    return { shieldBaseSec: 8, canHeal: true };
  }
  return {
    shieldBaseSec: Math.max(4, 10 - endlessAegisPickCount * 2),
    canHeal: false
  };
}

// ------------------------------------------
// 三选一强化词条池（共 19 项：8 普 / 5 罕 / 4 稀 / 2 传，含 2 张高风险双刃卡）
// ------------------------------------------
const UPGRADE_POOL = [
  {
    id: 'max_hp',
    name: '强健体魄',
    rarity: 'uncommon',
    getDesc: () => `最大生命值 +1（当前上限 ${maxLives}→${maxLives + 1}），并立即恢复 1 点生命`,
    canPick: () => maxLives < getDifficultyCfg().hardMaxLives,
    apply: () => {
      const cap = getDifficultyCfg().hardMaxLives;
      maxLives = Math.min(cap, maxLives + 1);
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
    getDesc: () => '永久放缓移动速度，同时落石间隔 +12%、连击窗口 +0.5s，转向更从容',
    canPick: () => slowUpgradeCount < 2,
    apply: () => {
      slowUpgradeCount += 1;
      recalcBaseInterval();
      renderRockDripChip();
      addFloatingText(snake[0].x, snake[0].y, '移速放缓 · 落石减速!', 'hsl(196, 90%, 72%)');
    }
  },
  {
    id: 'score_boost',
    name: '黄金胃口',
    rarity: 'common',
    getDesc: () => `苹果与金果得分永久 +40%（倍率 ${scoreMultiplier.toFixed(1)}x→${(scoreMultiplier + 0.4).toFixed(1)}x，减少长身体次数）`,
    canPick: () => scoreBoostCount < 3,
    apply: () => {
      scoreBoostCount += 1;
      scoreMultiplier = +(scoreMultiplier + 0.4).toFixed(1);
      addFloatingText(snake[0].x, snake[0].y, `得分 ${scoreMultiplier.toFixed(1)}x!`, 'hsl(43, 96%, 64%)');
    }
  },
  {
    id: 'quake_clear',
    name: '碎石冲击',
    rarity: 'common',
    getDesc: () => {
      const cnt = Math.min(obstacles.length, Math.max(1, Math.round(obstacles.length * 0.7)));
      const pts = Math.min(QUAKE_CLEAR_MAX_PTS, calcDoublePts(cnt * getRockSmashBasePts()));
      return `立即震碎 70%（${cnt} 块）岩石获 +${pts} 分（上限 ${QUAKE_CLEAR_MAX_PTS}），并获 ${QUAKE_CLEAR_SHIELD_SEC} 秒护盾`;
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
      const pts = Math.min(QUAKE_CLEAR_MAX_PTS, calcDoublePts(cleared.length * getRockSmashBasePts()));
      score += pts;
      shieldTimer = Math.max(shieldTimer, QUAKE_CLEAR_SHIELD_SEC);
      shakeTimer = Math.max(shakeTimer, 0.14);
      triggerHaptic(16);
      playTone('smash');
      addFloatingText(head.x, head.y, `震碎 ${cleared.length} 石 +${pts} · ${QUAKE_CLEAR_SHIELD_SEC}s盾!`, 'hsl(42, 95%, 68%)');
    }
  },
  {
    id: 'combo_frenzy',
    name: '连击',
    rarity: 'common',
    getDesc: () => comboUpgradeLevel === 0
      ? `短时间内连续进食或护盾碎石叠加层数（最高 ${MAX_COMBO_COUNT} 层），每层额外 +4 分`
      : `连击加分提升至每层 +8 分（最高 ${MAX_COMBO_COUNT} 层），且维持窗口延长 1 秒`,
    canPick: () => comboUpgradeLevel < 2,
    apply: () => {
      comboUpgradeLevel += 1;
      addFloatingText(snake[0].x, snake[0].y, comboUpgradeLevel === 1 ? '连击加分激活!' : '连击强化!', 'hsl(48, 98%, 68%)');
    }
  },
  {
    id: 'buff_extend',
    name: '延时充能',
    rarity: 'common',
    getDesc: () => '护盾、寒冰、双倍、幽灵持续时间及场上道具停留时间每层均永久 +1.5 秒',
    canPick: () => buffBonusSec < 4.5,
    apply: () => {
      buffBonusSec = +(buffBonusSec + 1.5).toFixed(1);
      addFloatingText(snake[0].x, snake[0].y, '增益与停留 +1.5s!', 'hsl(206, 95%, 76%)');
    }
  },
  {
    id: 'treasure_sense',
    name: '寻宝嗅觉',
    rarity: 'common',
    getDesc: () => treasureSenseLevel === 0
      ? '场上道具刷新间隔缩短 15%，且拾取任意道具额外 +8 分'
      : '场上道具刷新间隔共缩短 30%，且拾取任意道具额外 +16 分',
    canPick: () => treasureSenseLevel < 2,
    apply: () => {
      treasureSenseLevel += 1;
      if (!powerUp) {
        powerUpCooldown = Math.min(powerUpCooldown, getPowerUpCooldown());
      }
      addFloatingText(snake[0].x, snake[0].y, `寻宝嗅觉 Lv.${treasureSenseLevel}!`, 'hsl(43, 96%, 68%)');
    }
  },
  {
    id: 'emergency_armor',
    name: '应急护甲',
    rarity: 'common',
    getDesc: () => emergencyArmorLevel === 0
      ? '受伤后无敌时间永久 +1 秒，且受击瞬间自动震碎蛇头周围 3×3 岩石'
      : '受伤后无敌时间再 +1 秒，且受击自动震碎范围扩大至 5×5 岩石',
    canPick: () => emergencyArmorLevel < 2,
    apply: () => {
      emergencyArmorLevel += 1;
      addFloatingText(snake[0].x, snake[0].y, `应急护甲 Lv.${emergencyArmorLevel}!`, 'hsl(206, 88%, 74%)');
    }
  },
  {
    id: 'instant_aegis',
    name: '圣盾赐福',
    rarity: 'uncommon',
    getDesc: () => {
      const { shieldBaseSec, canHeal } = getInstantAegisProfile();
      if (endlessMode && endlessAegisPickCount > 0) {
        return canHeal
          ? `无尽递减：立即获得 ${shieldBaseSec} 秒穿墙碎石护盾，若生命未满额外恢复 1 点生命`
          : `无尽递减：立即获得 ${shieldBaseSec} 秒穿墙碎石护盾（无尽多次触发后不再回血）`;
      }
      return `立即获得 ${shieldBaseSec} 秒穿墙碎石护盾，若生命未满额外恢复 1 点生命`;
    },
    canPick: () => true,
    apply: () => {
      const { shieldBaseSec, canHeal } = getInstantAegisProfile();
      shieldTimer = Math.max(shieldTimer, shieldBaseSec + buffBonusSec);
      if (canHeal && lives < maxLives) lives += 1;
      if (endlessMode) endlessAegisPickCount += 1;
      addFloatingText(snake[0].x, snake[0].y, `${shieldBaseSec}s 圣盾护体!`, 'hsl(206, 95%, 76%)');
    }
  },
  {
    id: 'level_freeze',
    name: '时停',
    rarity: 'uncommon',
    getDesc: () => `每关开始冻结 ${LEVEL_FREEZE_DURATION} 秒（暂停落石预警与道具倒计时，并减缓流速）`,
    canPick: () => !hasLevelFreeze,
    apply: () => {
      hasLevelFreeze = true;
      freezeTimer = Math.max(freezeTimer, LEVEL_FREEZE_DURATION);
      addFloatingText(snake[0].x, snake[0].y, '时停领域激活!', 'hsl(202, 98%, 76%)');
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
    id: 'greedy_maw',
    name: '狂暴胃口',
    rarity: 'uncommon',
    isDoubleEdged: true,
    getDesc: () => `苹果与金果得分永久 +90%（${scoreMultiplier.toFixed(1)}x→${(scoreMultiplier + 0.9).toFixed(1)}x）；代价：吃苹果与金果均额外多长 1 节蛇身`,
    canPick: () => !hasGreedyMaw,
    apply: () => {
      hasGreedyMaw = true;
      extraFoodGrowth += 1;
      scoreMultiplier = +(scoreMultiplier + 0.9).toFixed(1);
      addFloatingText(snake[0].x, snake[0].y, `狂暴胃口 ${scoreMultiplier.toFixed(1)}x!`, 'hsl(32, 98%, 66%)');
    }
  },
  {
    id: 'magnet_aura',
    name: '幸运磁力',
    rarity: 'rare',
    getDesc: () => magnetLevel === 0
      ? '自动隔空吸取周围 1 格内的苹果与道具，且道具刷新加快 25%'
      : '道具吸附扩至周围 2 格（5×5），刷新再加快 25%；无道具立即召唤，已有则重置停留时间',
    canPick: () => magnetLevel < 2,
    apply: () => {
      magnetLevel += 1;
      let suffix = '';
      if (!powerUp) {
        spawnPowerUp();
      } else if (magnetLevel >= 2) {
        powerUp.ttl = powerUp.maxTtl;
        suffix = ' · 道具续时!';
      }
      addFloatingText(snake[0].x, snake[0].y, (magnetLevel === 1 ? '磁力光环激活!' : '磁力 2 格强化!') + suffix, 'hsl(276, 96%, 80%)');
    }
  },
  {
    id: 'phase_body',
    name: '相位穿身',
    rarity: 'rare',
    getDesc: () => `每 ${PHASE_BODY_COOLDOWN} 秒充能 1 次：撞到自身时免伤并自动触发 ${PHASE_BODY_DURATION} 秒幽灵穿身脱困`,
    canPick: () => !hasPhaseBody,
    apply: () => {
      hasPhaseBody = true;
      phaseBodyCooldown = 0;
      addFloatingText(snake[0].x, snake[0].y, '相位护体就绪!', 'hsl(276, 96%, 82%)');
    }
  },
  {
    id: 'stone_feast',
    name: '以石养身',
    rarity: 'rare',
    getDesc: () => `每累计碎 ${STONE_FEAST_THRESHOLD} 块岩石回复 1 点生命；生命已满时改为获得 ${STONE_FEAST_SHIELD_SEC} 秒护盾`,
    canPick: () => !hasStoneFeast && level >= 6,
    apply: () => {
      hasStoneFeast = true;
      stoneFeastProgress = 0;
      addFloatingText(snake[0].x, snake[0].y, '以石养身!', 'hsl(152, 80%, 66%)');
    }
  },
  {
    id: 'berserk_rush',
    name: '极速猎手',
    rarity: 'rare',
    isDoubleEdged: true,
    getDesc: () => '所有碎石得分与连击加分永久翻倍（×2）；代价：移动速度永久加快 15%',
    canPick: () => !hasBerserkRush && level >= 6,
    apply: () => {
      hasBerserkRush = true;
      recalcBaseInterval();
      addFloatingText(snake[0].x, snake[0].y, '极速猎手 碎石/连击×2!', 'hsl(356, 95%, 70%)');
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
  },
  {
    id: 'starfall_resonance',
    name: '星陨共鸣',
    rarity: 'legendary',
    getDesc: () => '拾取任意场上道具时，自动震碎周围 5×5 岩石并计分，且果实与碎石得分永久 +30%',
    canPick: () => !hasStarfallResonance,
    apply: () => {
      hasStarfallResonance = true;
      addFloatingText(snake[0].x, snake[0].y, '✦ 星陨共鸣觉醒!', 'hsl(42, 100%, 74%)');
    }
  }
];

// ------------------------------------------
// 辅助查询与隐藏速度计算
// ------------------------------------------
function recalcBaseInterval() {
  const cfg = getDifficultyCfg();
  const levelGain =
    Math.min(level - 1, 19) * (SPEED_GAIN_PER_LEVEL * cfg.speedGainMult) +
    Math.max(0, level - CLEAR_LEVEL) * (0.025 * cfg.speedGainMult);
  const berserkGain = hasBerserkRush ? BERSERK_SPEED_BONUS : 0;
  const mutGain = activeMutator === 'overdrive' ? 0.12 : 0;
  const rawMult = Math.min(2.8, cfg.initialSpeedMult + levelGain + berserkGain + mutGain - slowUpgradeCount * SLOW_UPGRADE_STEP);
  const clampedMult = Math.max(MIN_SPEED_MULT, rawMult);
  baseStepInterval = Math.max(MIN_STEP_INTERVAL, Math.round(INITIAL_INTERVAL / clampedMult));
}

function getEffectiveInterval() {
  const slowFactor = iceTimer > 0 ? 1.45 : (freezeTimer > 0 ? 1.35 : 1);
  return Math.round(baseStepInterval * slowFactor);
}

function getPowerUpCooldown() {
  const magnetFactor = magnetLevel === 0 ? 1 : (magnetLevel === 1 ? 0.75 : 0.56);
  const treasureFactor = 1 - treasureSenseLevel * 0.15;
  const mutFactor = activeMutator === 'swift_loot' ? 0.65 : 1.0;
  return +(4.8 * magnetFactor * treasureFactor * mutFactor).toFixed(2);
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
      if (head) addFloatingText(head.x, head.y, `以石养身 +${STONE_FEAST_SHIELD_SEC}s 护盾!`, 'hsl(164, 90%, 68%)');
    }
  }
  if (triggered) updateHUD();
  renderBuffBar();
}

function getRockSmashBasePts() {
  const basePts = 5 + (activeMutator === 'double_meteor' ? 3 : 0);
  const mutMult = activeMutator === 'fragile_aegis' ? 2 : 1;
  const berserkMult = hasBerserkRush ? 2 : 1;
  const starMult = hasStarfallResonance ? 1.3 : 1;
  return Math.round(basePts * mutMult * berserkMult * starMult);
}

function getEffectiveRockDripInterval(lv = level) {
  const base = getRockDripInterval(lv);
  if (base <= 0) return 0;
  const diffMult = getDifficultyCfg().rockDripMult;
  const mutMult = activeMutator === 'double_meteor' ? 0.7 : 1.0;
  const slowMult = 1 + slowUpgradeCount * SLOW_ROCK_DRIP_COMP;
  return +(base * diffMult * mutMult * slowMult).toFixed(2);
}

function rollEndlessMutator(forcedKey = null) {
  const keys = Object.keys(ENDLESS_MUTATORS);
  let nextKey = forcedKey;
  if (!nextKey || !ENDLESS_MUTATORS[nextKey]) {
    const pool = keys.filter((k) => k !== activeMutator);
    const choices = pool.length > 0 ? pool : keys;
    nextKey = choices[Math.floor(Math.random() * choices.length)];
  }
  activeMutator = nextKey;
  foodMoveTimer = 0;
  recalcBaseInterval();
  return ENDLESS_MUTATORS[nextKey];
}

// 道具实际刷新权重：炸弹随场上岩石数量动态提升，缩身剪刀随蛇长动态提升
function getPowerUpWeight(type) {
  if (type === 'bomb') {
    const mutatorBonus = activeMutator === 'double_meteor' ? 6 : 0;
    return (getBombDynamicWeight(obstacles.length) + mutatorBonus) * (1 + 0.5 * blastExpertLevel);
  }
  if (type === 'scissors') {
    return getScissorsDynamicWeight(snake.length);
  }
  return POWERUP_TYPES[type].weight;
}

// ------------------------------------------
// 道具图鉴与关卡解锁流程（支持移动端点击浮层查看道具说明）
// ------------------------------------------
function hideLegendPopover() {
  activeLegendItem = null;
  if (legendPopoverTimeout) {
    clearTimeout(legendPopoverTimeout);
    legendPopoverTimeout = null;
  }
  if (legendPopoverEl) {
    legendPopoverEl.classList.add('hidden');
  }
  renderLegend();
}

function showLegendPopover(type) {
  const cfg = POWERUP_TYPES[type];
  if (!cfg || !legendPopoverEl) return;
  if (activeLegendItem === type && !legendPopoverEl.classList.contains('hidden')) {
    hideLegendPopover();
    return;
  }
  activeLegendItem = type;
  const unlockText = level >= cfg.unlockLevel ? '已解锁' : `Lv.${cfg.unlockLevel} 解锁`;
  legendPopoverEl.innerHTML = `
    <span class="legend-popover-title">${cfg.label}（${unlockText}）</span>
    <span class="legend-popover-desc">${cfg.desc}</span>
  `;
  legendPopoverEl.classList.remove('hidden');
  renderLegend();
  if (legendPopoverTimeout) clearTimeout(legendPopoverTimeout);
  legendPopoverTimeout = setTimeout(() => {
    hideLegendPopover();
  }, 4000);
}

function renderLegend() {
  if (!itemLegendEl) return;
  const html = Object.entries(POWERUP_TYPES)
    .map(([key, cfg]) => {
      const unlocked = level >= cfg.unlockLevel;
      const isActive = activeLegendItem === key;
      return `<button type="button" class="legend-chip ${unlocked ? '' : 'locked'}${isActive ? ' active' : ''}" data-item="${key}" title="Lv.${cfg.unlockLevel} 解锁：${cfg.label} — ${cfg.desc}">
        <i class="dot ${cfg.dotClass}"></i>
        <span>${unlocked ? cfg.label : cfg.shortLabel}</span>
        ${unlocked ? '' : `<span class="legend-lv">Lv.${cfg.unlockLevel}</span>`}
      </button>`;
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

function findSafeObstacleCandidates(maxNearbyRocks = 1) {
  const head = snake[0];
  if (!head) return [];
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
      if (nearbyRocks > maxNearbyRocks) continue;

      candidates.push({ x, y });
    }
  }
  return candidates;
}

function spawnLevelObstacles(count, lv = level) {
  const cap = getMaxObstacles(lv);
  const warnDur = getDifficultyCfg().warnDuration;
  let spawned = 0;

  for (let n = 0; n < count; n++) {
    if (obstacles.length >= cap) break;
    const candidates = findSafeObstacleCandidates(1);
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      obstacles.push({ x: pick.x, y: pick.y, warnTimer: warnDur });
      spawned++;
    }
  }

  return spawned;
}

// 定时落石与满额移石：未满上限时新增落石；到达上限后移除最早出现的岩石并在新位置落石预警
function triggerTimedRockDrop(dropCount = 1, lv = level) {
  const cap = getMaxObstacles(lv);
  const warnDur = getDifficultyCfg().warnDuration;
  let acted = 0;

  for (let n = 0; n < dropCount; n++) {
    if (obstacles.length < cap) {
      acted += spawnLevelObstacles(1, lv);
    } else if (obstacles.length > 0) {
      let candidates = findSafeObstacleCandidates(1);
      if (candidates.length === 0) {
        candidates = findSafeObstacleCandidates(3);
      }
      if (candidates.length > 0) {
        const solidIdx = obstacles.findIndex((o) => o.warnTimer <= 0);
        const removeIdx = solidIdx !== -1 ? solidIdx : 0;
        const oldRock = obstacles.splice(removeIdx, 1)[0];
        spawnBurst(oldRock.x, oldRock.y, '35, 18%, 50%', 4);
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        obstacles.push({ x: pick.x, y: pick.y, warnTimer: warnDur });
        acted++;
      }
    }
  }

  return acted;
}

function checkLevelUp() {
  const rawTarget = getLevelForScore(score);
  const targetLevel = endlessMode ? rawTarget : Math.min(CLEAR_LEVEL, rawTarget);
  if (targetLevel > level) {
    const prevLevel = level;
    level = targetLevel;
    recalcBaseInterval();

    if (endlessMode && level > bestEndlessLevel) {
      bestEndlessLevel = level;
      saveBestEndlessLevel(bestEndlessLevel, difficulty);
    }

    if (!endlessMode && level >= CLEAR_LEVEL) {
      pendingUpgradeLevels = [];
      updateHUD();
      renderLegend();
      endGame(true);
      return;
    }

    let spawnedRocks = 0;
    let rotatedMutator = null;
    const hadMutatorBefore = Boolean(activeMutator);
    const mutStartLv = getDifficultyCfg().mutatorStartLevel;
    const newlyUnlocked = [];
    const hasAvailableUpgrade = UPGRADE_POOL.some((u) => u.canPick());

    for (let lv = prevLevel + 1; lv <= level; lv++) {
      spawnedRocks += spawnLevelObstacles(getRocksForLevel(lv), lv);
      if (lv % UPGRADE_EVERY_LEVELS === 0 && hasAvailableUpgrade) {
        pendingUpgradeLevels.push(lv);
      }
      if (lv >= mutStartLv && lv % ENDLESS_MUTATOR_EVERY_LEVELS === 0) {
        rotatedMutator = rollEndlessMutator();
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
    }
    renderBuffBar();
    renderRockDripChip();

    if (newlyUnlocked.length > 0 && snake.length > 0) {
      addFloatingText(snake[0].x, snake[0].y, `解锁道具：${newlyUnlocked.join('/')}!`, 'hsl(43, 98%, 72%)');
    }
    if (rotatedMutator && snake.length > 0) {
      addFloatingText(snake[0].x, snake[0].y, `场地词缀：${rotatedMutator.name}!`, 'hsl(38, 98%, 72%)');
    }

    playTone(pendingUpgradeLevels.length > 0 ? 'upgrade' : 'levelup');
    if (rotatedMutator) {
      const labelPrefix = hadMutatorBefore ? `Lv.${level} 词缀轮换` : `Lv.${level} 精英词缀`;
      showLevelBanner(`${labelPrefix}【${rotatedMutator.name}】：${rotatedMutator.desc}`, { isMutator: true, duration: 4.2 });
    } else if (spawnedRocks > 0) {
      showLevelBanner(`Lv.${level} 关卡提升！注意红色落石预警`);
    } else {
      levelBannerEl.classList.add('hidden');
      levelBannerEl.classList.remove('mutator');
      bannerTimer = 0;
    }
    updateHUD();
    renderLegend();
  }
}

// Lv.12+ 里程碑与神秘宝箱：稀有与传说强化卡权重 ×1.5
function isHighTierUpgradeSource(source) {
  return source === 'chest' || (typeof source === 'number' && source >= 12);
}

function getEffectiveRarityWeight(rarity, highTierBoost = false) {
  const base = RARITY_CONFIG[rarity].weight;
  if (highTierBoost && (rarity === 'rare' || rarity === 'legendary')) {
    return base * 1.5;
  }
  return base;
}

function pickWeightedUpgrades(count = 3, excludeIds = null, highTierBoost = false) {
  const allEligible = UPGRADE_POOL.filter((u) => u.canPick());
  const pickFromPool = (pool, needed) => {
    const rem = pool.slice();
    const out = [];
    while (out.length < needed && rem.length > 0) {
      const totalWeight = rem.reduce(
        (sum, item) => sum + getEffectiveRarityWeight(item.rarity, highTierBoost),
        0
      );
      let roll = Math.random() * totalWeight;
      let chosenIdx = rem.length - 1;
      for (let i = 0; i < rem.length; i++) {
        roll -= getEffectiveRarityWeight(rem[i].rarity, highTierBoost);
        if (roll <= 0) {
          chosenIdx = i;
          break;
        }
      }
      out.push(rem.splice(chosenIdx, 1)[0]);
    }
    return out;
  };

  if (excludeIds && excludeIds.size > 0) {
    const freshPool = allEligible.filter((u) => !excludeIds.has(u.id));
    const picked = pickFromPool(freshPool, count);
    if (picked.length < count) {
      const pickedIds = new Set(picked.map((u) => u.id));
      const fallbackPool = allEligible.filter((u) => !pickedIds.has(u.id));
      picked.push(...pickFromPool(fallbackPool, count - picked.length));
    }
    return picked;
  }

  return pickFromPool(allEligible, count);
}

function syncRerollButton() {
  if (!upgradeRerollBtn) return;
  const totalEligible = UPGRADE_POOL.filter((u) => u.canPick()).length;
  const hasAlternatives = totalEligible > currentChoices.length;
  const canReroll = state === 'choosing' && rerollsLeft > 0 && hasAlternatives;
  upgradeRerollBtn.disabled = !canReroll;
  if (rerollsLeft <= 0) {
    upgradeRerollBtn.textContent = '🎲 换一批 (已用完)';
  } else if (!hasAlternatives) {
    upgradeRerollBtn.textContent = '🎲 无更多可换强化';
  } else {
    upgradeRerollBtn.textContent = `🎲 换一批 (剩余 ${rerollsLeft} 次)`;
  }
}

function renderUpgradeCards() {
  upgradeListEl.innerHTML = '';
  currentChoices.forEach((choice, idx) => {
    const rarityMeta = RARITY_CONFIG[choice.rarity];
    const riskBadge = choice.isDoubleEdged ? '<span class="risk-tag">双刃</span>' : '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `upgrade-card rarity-${choice.rarity}`;
    btn.innerHTML = `
      <span class="upgrade-key">${idx + 1}</span>
      <span class="upgrade-body">
        <span class="upgrade-title-row">
          <span class="upgrade-name">${choice.name}</span>
          <span class="rarity-tag rarity-${choice.rarity}">${rarityMeta.label}</span>
          ${riskBadge}
        </span>
        <span class="upgrade-desc">${choice.getDesc()}</span>
      </span>
    `;
    btn.addEventListener('click', () => selectUpgrade(idx));
    upgradeListEl.appendChild(btn);
  });
  syncRerollButton();
}

function rerollUpgradeChoices() {
  if (state !== 'choosing' || rerollsLeft <= 0) return false;
  const totalEligible = UPGRADE_POOL.filter((u) => u.canPick()).length;
  if (totalEligible <= currentChoices.length) return false;

  const excludeIds = new Set(currentChoices.map((u) => u.id));
  const boosted = isHighTierUpgradeSource(currentUpgradeSource);
  currentChoices = pickWeightedUpgrades(3, excludeIds, boosted);
  rerollsLeft -= 1;
  playTone('levelup');
  renderUpgradeCards();
  return true;
}

function syncPlayingTouchLock() {
  if (typeof document !== 'undefined' && document.body && document.body.classList) {
    document.body.classList.toggle('is-playing', state === 'running' || (state === 'paused' && isPostUpgradeReady));
  }
}

function openNextUpgradeChoice() {
  if (pendingUpgradeLevels.length === 0 || state !== 'running') return;

  const source = pendingUpgradeLevels.shift();
  const boosted = isHighTierUpgradeSource(source);
  currentUpgradeSource = source;
  currentChoices = pickWeightedUpgrades(3, null, boosted);
  if (currentChoices.length === 0) {
    currentUpgradeSource = null;
    return;
  }

  state = 'choosing';
  isPostUpgradeReady = false;
  syncPlayingTouchLock();
  pauseBtn.disabled = true;

  const boostSuffix = boosted ? ' · 高阶概率 ×1.5' : '';
  upgradeBadgeEl.textContent = source === 'chest'
    ? `🎁 神秘宝箱奖励${boostSuffix}`
    : `Lv.${source} 里程碑奖励${boostSuffix}`;
  renderUpgradeCards();

  upgradeOverlayEl.classList.remove('hidden');
}

function selectUpgrade(index) {
  if (state !== 'choosing' || !currentChoices[index]) return;

  const chosen = currentChoices[index];
  currentChoices = [];
  currentUpgradeSource = null;
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
    pauseAfterUpgrade(chosen);
  }
}

function showLevelBanner(text, { isMutator = false, duration = 2.4 } = {}) {
  levelBannerEl.textContent = text;
  levelBannerEl.classList.toggle('mutator', Boolean(isMutator));
  levelBannerEl.classList.remove('hidden');
  bannerTimer = duration;
}

// ------------------------------------------
// 初始化、暂停、战绩结算与分享
// ------------------------------------------
function initGameData() {
  isPostUpgradeReady = false;
  syncPlayingTouchLock();
  const cfg = getDifficultyCfg();
  snake = [
    { x: 6, y: 10 },
    { x: 5, y: 10 },
    { x: 4, y: 10 }
  ];
  pendingGrowth = 0;
  direction = { x: 1, y: 0 };
  directionQueue = [];

  maxLives = cfg.initialLives;
  lives = cfg.initialLives;
  score = 0;
  level = 1;
  endlessMode = false;
  activeMutator = null;
  bestScore = loadBestScore(difficulty);
  bestEndlessLevel = loadBestEndlessLevel(difficulty);

  slowUpgradeCount = 0;
  scoreBoostCount = 0;
  scoreMultiplier = 1.0;
  buffBonusSec = 0;
  magnetLevel = 0;
  comboUpgradeLevel = 0;
  hasLevelFreeze = false;
  hasPhaseBody = false;
  phaseBodyCooldown = 0;
  nirvanaCharges = 0;
  nirvanaUsed = false;
  hasStarfallResonance = false;
  blastExpertLevel = 0;
  hasStoneFeast = false;
  stoneFeastProgress = 0;
  hasGreedyMaw = false;
  extraFoodGrowth = 0;
  hasBerserkRush = false;
  treasureSenseLevel = 0;
  emergencyArmorLevel = 0;
  rerollsLeft = INITIAL_REROLLS;
  endlessAegisPickCount = 0;

  pendingUpgradeLevels = [];
  currentUpgradeSource = null;
  currentChoices = [];
  pickedUpgrades = [];
  runElapsedSec = 0;
  rocksSmashed = 0;
  damageStats = { wall: 0, rock: 0, self: 0 };
  lastHitCause = null;
  lastDripChipKey = '';

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
  foodMoveTimer = 0;
  comboCount = 0;
  comboTimer = 0;

  levelBannerEl.classList.add('hidden');
  levelBannerEl.classList.remove('mutator');
  upgradeOverlayEl.classList.add('hidden');
  overlayEl.classList.remove('post-upgrade-ready');
  if (pauseUpgradesEl) pauseUpgradesEl.classList.add('hidden');
  hideLegendPopover();

  obstacles = createInitialObstacles();
  powerUp = null;
  powerUpCooldown = 3.0;
  lastPowerUpType = null;
  particles = [];
  floatingTexts = [];

  spawnFood();
  syncDifficultyUI();
  updateHUD();
  renderLegend();
  renderBuffBar();
  renderRockDripChip();
}

function startGame() {
  initGameData();
  state = 'running';
  isPostUpgradeReady = false;
  syncPlayingTouchLock();
  stepAccumulator = 0;
  lastFrameTime = performance.now();
  pauseBtn.disabled = false;
  pauseBtn.textContent = '暂停';
  if (modeSelectorEl) modeSelectorEl.classList.add('hidden');
  overlayTipsEl.classList.add('hidden');
  if (pauseUpgradesEl) pauseUpgradesEl.classList.add('hidden');
  runSummaryEl.classList.add('hidden');
  endlessBtn.classList.add('hidden');
  shareBtn.classList.add('hidden');
  overlayEl.classList.remove('post-upgrade-ready');
  overlayEl.classList.add('hidden');
}

function continueEndlessMode() {
  if (state !== 'won' || endlessMode) return;
  endlessMode = true;
  endlessAegisPickCount = 0;
  if (level > bestEndlessLevel) {
    bestEndlessLevel = level;
    saveBestEndlessLevel(bestEndlessLevel, difficulty);
  }
  const mut = rollEndlessMutator();
  state = 'running';
  isPostUpgradeReady = false;
  syncPlayingTouchLock();
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
  if (modeSelectorEl) modeSelectorEl.classList.add('hidden');
  if (pauseUpgradesEl) pauseUpgradesEl.classList.add('hidden');
  endlessBtn.classList.add('hidden');
  shareBtn.classList.add('hidden');
  runSummaryEl.classList.add('hidden');
  overlayEl.classList.remove('post-upgrade-ready');
  overlayEl.classList.add('hidden');
  showLevelBanner(`无尽开启【${mut.name}】：${mut.desc}`, { isMutator: true, duration: 4.2 });
  if (snake.length > 0) {
    addFloatingText(snake[0].x, snake[0].y, `∞ 词缀·${mut.name}!`, 'hsl(43, 98%, 70%)');
  }
  updateHUD();
  renderBuffBar();
  renderRockDripChip();
}

function buildGroupedUpgradeChipsHtml(emptyText) {
  if (pickedUpgrades.length === 0) {
    return `<span class="summary-upgrades-empty">${emptyText}</span>`;
  }
  const grouped = [];
  const byName = new Map();
  for (const u of pickedUpgrades) {
    if (byName.has(u.name)) {
      byName.get(u.name).count += 1;
    } else {
      const entry = { name: u.name, rarity: u.rarity, count: 1 };
      byName.set(u.name, entry);
      grouped.push(entry);
    }
  }
  return grouped
    .map((u) => `<span class="summary-chip rarity-${u.rarity}">${u.name}${u.count > 1 ? ` ×${u.count}` : ''}</span>`)
    .join('');
}

function renderPauseUpgrades() {
  if (!pauseUpgradesEl) return;
  const modeLabel = getDifficultyCfg().label;
  const chipsHtml = buildGroupedUpgradeChipsHtml('暂未解锁强化（Lv.3 解锁首次三选一）');
  const mut = activeMutator && ENDLESS_MUTATORS[activeMutator] ? ENDLESS_MUTATORS[activeMutator] : null;
  const mutHtml = mut
    ? `<div class="pause-mutator"><strong>⚡ 当前词缀【${mut.name}】：</strong>${mut.desc}</div>`
    : '';
  pauseUpgradesEl.innerHTML = `
    <div class="pause-upgrades-header">
      <span><strong>本局已选强化</strong>（共 ${pickedUpgrades.length} 项）</span>
      <span class="pause-upgrades-meta">${modeLabel} · 重随 ${rerollsLeft}/${INITIAL_REROLLS}</span>
    </div>
    ${mutHtml}
    <div class="summary-upgrades">${chipsHtml}</div>
  `;
}

function pauseGame(
  title = '已暂停',
  desc = '按空格键或点击下方按钮继续挑战。'
) {
  state = 'paused';
  isPostUpgradeReady = false;
  syncPlayingTouchLock();
  pauseBtn.disabled = false;
  pauseBtn.textContent = '继续';
  renderPauseUpgrades();
  showOverlay(title, desc, '继续游戏', {
    showTips: false,
    showPauseUpgrades: true,
    showSummary: false,
    showMode: false,
    postUpgradeReady: false
  });
}

// 选完强化后的轻量棋盘透视准备态：不模糊遮挡棋盘，蛇头带脉冲箭头，按任意方向/滑动/空格立刻开跑
function pauseAfterUpgrade(chosen) {
  state = 'paused';
  isPostUpgradeReady = true;
  syncPlayingTouchLock();
  pauseBtn.disabled = false;
  pauseBtn.textContent = '继续';
  renderPauseUpgrades();
  showOverlay(
    `✦ 已获得「${chosen.name}」`,
    '观察棋盘走位，按方向键 / 滑动 / 空格或点击立即开跑',
    '立即继续',
    {
      showTips: false,
      showPauseUpgrades: false,
      showSummary: false,
      showMode: false,
      postUpgradeReady: true
    }
  );
}

function togglePause() {
  if (state === 'running') {
    pauseGame('已暂停', '按空格键或点击下方按钮继续挑战。');
  } else if (state === 'paused') {
    state = 'running';
    isPostUpgradeReady = false;
    syncPlayingTouchLock();
    stepAccumulator = 0;
    lastFrameTime = performance.now();
    pauseBtn.textContent = '暂停';
    if (pauseUpgradesEl) pauseUpgradesEl.classList.add('hidden');
    overlayEl.classList.remove('post-upgrade-ready');
    overlayEl.classList.add('hidden');
  }
}

function autoPauseOnBackground() {
  if (state === 'running') {
    pauseGame('已自动暂停', '切出页面已自动保护当前进度，按空格键或点击继续。');
  }
}

function renderRunSummary() {
  const upgradesHtml = buildGroupedUpgradeChipsHtml('本局尚未解锁强化');

  let modeTag = '';
  if (difficulty === 'hard') {
    modeTag = '<span class="summary-fatal">🔥 困难模式</span> ｜ ';
  } else if (difficulty === 'easy') {
    modeTag = '<span style="color: hsl(172, 86%, 72%); font-weight: 700;">🌿 简单模式</span> ｜ ';
  }
  const totalHits = damageStats.wall + damageStats.rock + damageStats.self;
  const fatalPrefix = state === 'gameover' && lastHitCause
    ? `<span class="summary-fatal">死因：${CAUSE_LABELS[lastHitCause]}</span> ｜ `
    : '';
  const hitBreakdown = totalHits === 0
    ? '受击：0 次（无伤！）'
    : `受击：撞墙 ${damageStats.wall} · 撞石 ${damageStats.rock} · 撞自身 ${damageStats.self}`;
  const endlessRecordText = bestEndlessLevel > 0 ? `Lv.${bestEndlessLevel}` : '未开启';

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
      <div class="summary-metric">
        <span class="summary-metric-label">最终蛇长</span>
        <span class="summary-metric-val">${snake.length} 节</span>
      </div>
      <div class="summary-metric">
        <span class="summary-metric-label">无尽最高</span>
        <span class="summary-metric-val">${endlessRecordText}</span>
      </div>
    </div>
    <div class="summary-causes">${modeTag}${fatalPrefix}${hitBreakdown}</div>
    <div class="summary-upgrades">${upgradesHtml}</div>
  `;
}

function buildShareText() {
  const modePrefix = difficulty === 'hard'
    ? '[困难模式] '
    : (difficulty === 'easy' ? '[简单模式] ' : '');
  let statusLine = `🐍 星陨贪吃蛇｜${modePrefix}闯关至 Lv.${level}`;
  if (state === 'won') {
    statusLine = `🐍 星陨贪吃蛇｜${modePrefix}恭喜通关！(Lv.${level})`;
  } else if (endlessMode) {
    statusLine = `🐍 星陨贪吃蛇｜${modePrefix}无尽模式止步 Lv.${level}（最高 Lv.${bestEndlessLevel}）`;
  }
  const upgradeLine = pickedUpgrades.length > 0
    ? pickedUpgrades.map((u) => u.name).join(' / ')
    : '无';
  const hitLine = `撞墙 ${damageStats.wall} · 撞石 ${damageStats.rock} · 撞自身 ${damageStats.self}`;

  return [
    statusLine,
    `🏆 得分：${score}（最高 ${bestScore}）｜ 🐍 蛇长：${snake.length} 节`,
    `⏱️ 存活：${formatDuration(runElapsedSec)} ｜ 🪨 碎石：${rocksSmashed} 块`,
    `💥 受击：${hitLine}`,
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
  isPostUpgradeReady = false;
  syncPlayingTouchLock();
  pauseBtn.disabled = true;
  pauseBtn.textContent = '暂停';
  upgradeOverlayEl.classList.add('hidden');
  levelBannerEl.classList.add('hidden');
  levelBannerEl.classList.remove('mutator');
  playTone(won ? 'win' : 'gameover');

  if (won && snake.length > 0) {
    triggerHaptic([30, 40, 60]);
    spawnBurst(snake[0].x, snake[0].y, '43, 96%, 60%', 18);
    spawnBurst(Math.floor(GRID_COUNT / 2), Math.floor(GRID_COUNT / 2), '152, 80%, 58%', 18);
  }

  if (won && !endlessMode && difficulty === 'hard') {
    hardClearCount += 1;
    saveHardClearCount(hardClearCount);
    syncDifficultyUI();
  }

  if (endlessMode && level > bestEndlessLevel) {
    bestEndlessLevel = level;
    saveBestEndlessLevel(bestEndlessLevel, difficulty);
  }

  if (score > bestScore) {
    bestScore = score;
    saveBestScore(bestScore, difficulty);
  }
  updateHUD();

  renderRunSummary();
  shareBtn.textContent = '复制战绩';

  const modeLabel = getDifficultyCfg().label;
  if (won) {
    const title = difficulty === 'hard'
      ? '🔥 困难模式通关！'
      : (difficulty === 'easy' ? '🌿 简单模式通关！' : '恭喜通关！');
    const desc = level >= CLEAR_LEVEL
      ? `${modeLabel}突破全部 ${CLEAR_LEVEL} 关！本局得分 ${score} · 最高纪录 ${bestScore}，可继续无尽模式挑战极限！`
      : `${modeLabel}占领全部棋盘格！本局得分 ${score} · 最高纪录 ${bestScore}`;
    showOverlay(title, desc, '再来一局', {
      showTips: false,
      showPauseUpgrades: false,
      showSummary: true,
      showEndless: !endlessMode,
      showMode: true,
      postUpgradeReady: false
    });
  } else {
    const desc = endlessMode
      ? `${modeLabel}无尽 · 止步 Lv.${level}（无尽最高 Lv.${bestEndlessLevel}）· 得分 ${score}`
      : `${modeLabel} · 闯至 Lv.${level} · 本局得分 ${score} · 最高纪录 ${bestScore}`;
    showOverlay('游戏结束', desc, '再来一局', {
      showTips: false,
      showPauseUpgrades: false,
      showSummary: true,
      showEndless: false,
      showMode: true,
      postUpgradeReady: false
    });
  }
}

function showOverlay(title, desc, btnText, { showTips = false, showPauseUpgrades = false, showSummary = false, showEndless = false, showMode = false, postUpgradeReady = false } = {}) {
  overlayTitleEl.textContent = title;
  overlayDescEl.textContent = desc;
  startBtn.textContent = btnText;
  overlayEl.classList.toggle('post-upgrade-ready', Boolean(postUpgradeReady));
  if (modeSelectorEl) modeSelectorEl.classList.toggle('hidden', !showMode);
  overlayTipsEl.classList.toggle('hidden', !showTips);
  if (pauseUpgradesEl) pauseUpgradesEl.classList.toggle('hidden', !showPauseUpgrades);
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

  const curStart = getScoreForLevel(level);
  const needPts = getPointsForNextLevel(level);
  const earnedInLv = Math.max(0, score - curStart);
  const remainPts = Math.max(0, curStart + needPts - score);

  if (!endlessMode && level >= CLEAR_LEVEL) {
    nextLevelHintEl.textContent = '已通关全部 20 关！';
    levelProgressFillEl.style.width = '100%';
  } else {
    const pct = Math.min(100, Math.round((earnedInLv / needPts) * 100));
    nextLevelHintEl.textContent = !endlessMode && level === CLEAR_LEVEL - 1
      ? `距通关 Lv.${CLEAR_LEVEL} 还差 ${remainPts} 分`
      : `距 Lv.${level + 1} 还差 ${remainPts} 分`;
    levelProgressFillEl.style.width = `${pct}%`;
  }

  const hasAvailableUpgrade = UPGRADE_POOL.some((u) => u.canPick());
  if (!hasAvailableUpgrade) {
    nextUpgradeHintEl.textContent = '强化已满';
  } else {
    const nextUpgLv = (Math.floor(level / UPGRADE_EVERY_LEVELS) + 1) * UPGRADE_EVERY_LEVELS;
    if (!endlessMode && nextUpgLv >= CLEAR_LEVEL) {
      nextUpgradeHintEl.textContent = '强化：宝箱获取';
    } else {
      nextUpgradeHintEl.textContent = `下次强化 Lv.${nextUpgLv}`;
    }
  }

  const len = snake.length;
  snakeLenEl.textContent = len >= MAX_SNAKE_LENGTH ? `蛇长 ${len}(上限)` : `蛇长 ${len} 节`;
  snakeLenEl.classList.toggle('warn', len >= 30 && len < 50);
  snakeLenEl.classList.toggle('danger', len >= 50);
}

// 状态栏严格按紧迫优先级排序：词缀 + 限时倒计时（带到期闪烁）+ 动态计数/传说状态，静态被动折叠为紧凑徽章避免手机端两行静默裁切
function renderBuffBar() {
  const pills = [];
  if (activeMutator && ENDLESS_MUTATORS[activeMutator]) {
    const mut = ENDLESS_MUTATORS[activeMutator];
    pills.push(`<span class="buff-pill" title="${mut.desc}" style="border-color: hsl(38, 95%, 56%); color: hsl(43, 100%, 76%);">词缀·${mut.name}</span>`);
  }
  if (invulnTimer > 0) {
    const exp = invulnTimer < 0.8 ? ' expiring' : '';
    pills.push(`<span class="buff-pill${exp}" style="border-color: hsl(345, 86%, 56%); color: hsl(345, 95%, 76%);">无敌 ${invulnTimer.toFixed(1)}s</span>`);
  }
  if (freezeTimer > 0) {
    const exp = freezeTimer < 1.2 ? ' expiring' : '';
    pills.push(`<span class="buff-pill${exp}" style="border-color: hsl(202, 92%, 60%); color: hsl(202, 98%, 80%);">时停 ${freezeTimer.toFixed(1)}s</span>`);
  }
  if (shieldTimer > 0) {
    const exp = shieldTimer < 1.5 ? ' expiring' : '';
    pills.push(`<span class="buff-pill${exp}" style="border-color: hsl(164, 78%, 45%); color: hsl(164, 88%, 72%);">护盾 ${shieldTimer.toFixed(1)}s</span>`);
  }
  if (ghostTimer > 0) {
    const exp = ghostTimer < 1.0 ? ' expiring' : '';
    pills.push(`<span class="buff-pill${exp}" style="border-color: hsl(258, 82%, 68%); color: hsl(258, 96%, 84%);">幽灵 ${ghostTimer.toFixed(1)}s</span>`);
  }
  if (doubleTimer > 0) {
    const exp = doubleTimer < 1.5 ? ' expiring' : '';
    pills.push(`<span class="buff-pill${exp}" style="border-color: hsl(39, 94%, 42%); color: hsl(42, 96%, 66%);">双倍 ${doubleTimer.toFixed(1)}s</span>`);
  }
  if (iceTimer > 0) {
    const exp = iceTimer < 1.5 ? ' expiring' : '';
    pills.push(`<span class="buff-pill${exp}" style="border-color: hsl(196, 80%, 52%); color: hsl(196, 92%, 76%);">减速 ${iceTimer.toFixed(1)}s</span>`);
  }
  if (comboUpgradeLevel > 0 && comboCount >= 2 && comboTimer > 0) {
    pills.push(`<span class="buff-pill" style="border-color: hsl(46, 96%, 54%); color: hsl(48, 100%, 76%);">连击 x${comboCount}</span>`);
  }
  if (hasPhaseBody) {
    if (phaseBodyCooldown <= 0) {
      pills.push('<span class="buff-pill" style="border-color: hsl(276, 82%, 64%); color: hsl(276, 96%, 82%);">相位就绪</span>');
    } else {
      pills.push(`<span class="buff-pill" style="border-color: hsla(276, 40%, 54%, 0.55); color: hsl(276, 35%, 72%);">相位 ${phaseBodyCooldown.toFixed(1)}s</span>`);
    }
  }
  if (hasStoneFeast) {
    pills.push(`<span class="buff-pill" style="border-color: hsl(152, 70%, 46%); color: hsl(152, 85%, 72%);">养身 ${stoneFeastProgress}/${STONE_FEAST_THRESHOLD}</span>`);
  }
  if (nirvanaCharges > 0) {
    pills.push('<span class="buff-pill" style="border-color: hsl(28, 96%, 56%); color: hsl(32, 100%, 78%);">涅槃待命</span>');
  }
  if (hasStarfallResonance) {
    pills.push('<span class="buff-pill" style="border-color: hsl(42, 98%, 56%); color: hsl(44, 100%, 78%);">✦ 星陨共鸣</span>');
  }

  const staticPassives = [];
  if (magnetLevel > 0) staticPassives.push(`磁力 Lv.${magnetLevel}`);
  if (blastExpertLevel > 0) staticPassives.push('爆破专家');
  if (hasGreedyMaw) staticPassives.push('狂暴胃口');
  if (hasBerserkRush) staticPassives.push('极速猎手');
  if (treasureSenseLevel > 0) staticPassives.push(`寻宝 Lv.${treasureSenseLevel}`);
  if (emergencyArmorLevel > 0) staticPassives.push(`护甲 Lv.${emergencyArmorLevel}`);

  if (staticPassives.length === 1) {
    pills.push(`<span class="buff-pill" style="border-color: hsla(150, 14%, 44%, 0.7); color: hsl(42, 24%, 82%);">${staticPassives[0]}</span>`);
  } else if (staticPassives.length > 1) {
    pills.push(`<span class="buff-pill" title="${staticPassives.join(' · ')}（暂停界面可查看全部已选强化）" style="border-color: hsla(150, 14%, 44%, 0.7); color: hsl(42, 24%, 82%);">被动 +${staticPassives.length}</span>`);
  }

  buffBarEl.innerHTML = pills.length > 0
    ? pills.join('')
    : '<span class="buff-empty">状态：暂无限时增益</span>';
}

function renderRockDripChip() {
  const effInterval = getEffectiveRockDripInterval(level);
  if (effInterval <= 0) {
    if (lastDripChipKey !== 'hidden') {
      rockDripChipEl.classList.add('hidden');
      rockDripChipEl.classList.remove('imminent', 'frozen');
      lastDripChipKey = 'hidden';
    }
    return;
  }

  const atCap = obstacles.length >= getMaxObstacles(level);
  const modeLabel = atCap ? '移石' : '落石';
  let text = '';
  let status = 'normal';

  if (freezeTimer > 0) {
    text = '🪨 冻结';
    status = 'frozen';
  } else {
    const rem = Math.max(0, effInterval - rockDripTimer);
    text = `🪨 ${modeLabel} ${rem.toFixed(1)}s`;
    if (rem <= 2.5) status = 'imminent';
  }

  const nextKey = `${status}:${text}`;
  if (nextKey !== lastDripChipKey) {
    lastDripChipKey = nextKey;
    rockDripChipEl.textContent = text;
    rockDripChipEl.classList.remove('hidden');
    rockDripChipEl.classList.toggle('imminent', status === 'imminent');
    rockDripChipEl.classList.toggle('frozen', status === 'frozen');
  }
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

// 无尽词缀「游走果实」：苹果每 3.5s 向相邻安全格移动 1 格（蛇头紧邻时不逃跑，避免贴脸挫败感）
function stepMovingFood() {
  if (!food || snake.length === 0) return false;
  const head = snake[0];
  if (Math.abs(food.x - head.x) + Math.abs(food.y - head.y) < 2) return false;

  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 }
  ];
  const candidates = [];
  for (const d of dirs) {
    const nx = food.x + d.x;
    const ny = food.y + d.y;
    if (nx < 0 || nx >= GRID_COUNT || ny < 0 || ny >= GRID_COUNT) continue;
    if (isSnakeAt(nx, ny) || isObstacleAt(nx, ny, false)) continue;
    if (powerUp && powerUp.x === nx && powerUp.y === ny) continue;
    if (countOpenNeighbors(nx, ny) < 2) continue;
    if (Math.abs(nx - head.x) + Math.abs(ny - head.y) < 2) continue;
    candidates.push({ x: nx, y: ny });
  }

  if (candidates.length === 0) return false;
  food = candidates[Math.floor(Math.random() * candidates.length)];
  spawnBurst(food.x, food.y, '16, 90%, 62%', 4);
  return true;
}

function isPowerUpEligible(type) {
  const cfg = POWERUP_TYPES[type];
  if (!cfg || level < cfg.unlockLevel) return false;
  if (type === 'heart') return lives < maxLives;
  if (type === 'bomb') return obstacles.length >= 2;
  if (type === 'scissors') return snake.length >= 6;
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

  // 「疾速秘宝」词缀下停留时间缩短，优先在距蛇头曼哈顿距离 ≤16 格内刷新，避免刷在对角线必过期
  let spawnPool = cells;
  if (activeMutator === 'swift_loot' && snake.length > 0) {
    const head = snake[0];
    const nearPreferred = cells.filter((c) => {
      const dist = Math.abs(c.x - head.x) + Math.abs(c.y - head.y);
      return dist >= 3 && dist <= 16;
    });
    if (nearPreferred.length > 0) {
      spawnPool = nearPreferred;
    } else {
      const within16 = cells.filter((c) => Math.abs(c.x - head.x) + Math.abs(c.y - head.y) <= 16);
      if (within16.length > 0) spawnPool = within16;
    }
  }

  const pos = spawnPool[Math.floor(Math.random() * spawnPool.length)];
  const rawTtl = 9.5 + buffBonusSec;
  const itemTtl = activeMutator === 'swift_loot' ? +(rawTtl * 0.65).toFixed(1) : rawTtl;

  lastPowerUpType = pickedType;
  powerUp = {
    x: pos.x,
    y: pos.y,
    type: pickedType,
    ttl: itemTtl,
    maxTtl: itemTtl
  };
}

function addPendingGrowth(amount) {
  if (amount <= 0) return;
  const room = Math.max(0, MAX_SNAKE_LENGTH - snake.length - pendingGrowth);
  if (room > 0) {
    pendingGrowth += Math.min(amount, room);
  }
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
  comboCount = Math.min(MAX_COMBO_COUNT, comboCount + 1);
  const overdriveBonus = activeMutator === 'overdrive' ? 2.0 : 0;
  const slowBonus = slowUpgradeCount * SLOW_COMBO_WINDOW_BONUS;
  comboTimer = COMBO_WINDOW + (comboUpgradeLevel > 1 ? 1.0 : 0) + overdriveBonus + slowBonus;
  renderBuffBar();
  const base = comboCount >= 2 ? (comboCount - 1) * (4 * comboUpgradeLevel) : 0;
  return hasBerserkRush ? base * 2 : base;
}

function applyPowerUp(item) {
  hitstopTimer = HITSTOP_DURATION;
  triggerHaptic(18);
  let triggerChestModal = false;
  const treasureBonus = 8 * treasureSenseLevel;
  const starFruitMult = hasStarfallResonance ? 1.3 : 1;

  if (item.type === 'heart') {
    playTone('heal');
    lives = Math.min(maxLives, lives + 1);
    score += calcDoublePts(10 + treasureBonus);
    spawnBurst(item.x, item.y, '345, 92%, 64%', 14);
    addFloatingText(item.x, item.y, '+1 生命!', 'hsl(345, 96%, 74%)');
  } else if (item.type === 'gold') {
    playTone('powerup');
    const comboBonus = registerComboBonus();
    const pts = calcDoublePts(Math.round(30 * scoreMultiplier * starFruitMult) + comboBonus + treasureBonus);
    score += pts;
    addPendingGrowth(2 + extraFoodGrowth);
    spawnBurst(item.x, item.y, '43, 96%, 58%', 14);
    addFloatingText(item.x, item.y, `+${pts} 金色果实!`, 'hsl(43, 96%, 64%)');
  } else if (item.type === 'double') {
    playTone('powerup');
    score += calcDoublePts(10 + treasureBonus);
    doubleTimer = Math.max(doubleTimer, POWERUP_TYPES.double.duration + buffBonusSec);
    spawnBurst(item.x, item.y, '39, 96%, 45%', 15);
    addFloatingText(item.x, item.y, '双倍得分!', 'hsl(42, 98%, 62%)');
  } else if (item.type === 'ice') {
    playTone('powerup');
    score += calcDoublePts(10 + treasureBonus);
    iceTimer = Math.max(iceTimer, POWERUP_TYPES.ice.duration + buffBonusSec);
    addPendingGrowth(1);
    spawnBurst(item.x, item.y, '196, 90%, 64%', 12);
    addFloatingText(item.x, item.y, '寒冰减速!', 'hsl(196, 92%, 72%)');
  } else if (item.type === 'shield') {
    playTone('powerup');
    score += calcDoublePts(10 + treasureBonus);
    const rawShieldDur = POWERUP_TYPES.shield.duration + buffBonusSec;
    const shieldDur = activeMutator === 'fragile_aegis'
      ? rawShieldDur * 0.5
      : rawShieldDur;
    shieldTimer = Math.max(shieldTimer, shieldDur);
    addPendingGrowth(1);
    spawnBurst(item.x, item.y, '164, 85%, 56%', 12);
    addFloatingText(item.x, item.y, '穿墙碎石护盾!', 'hsl(164, 90%, 66%)');
  } else if (item.type === 'bomb') {
    playTone('bomb');
    const cleared = clearObstaclesNear(snake[0].x, snake[0].y, 5);
    const expertBonus = 5 * blastExpertLevel * (hasBerserkRush ? 2 : 1);
    const pts = calcDoublePts(10 + cleared * (getRockSmashBasePts() + expertBonus) + treasureBonus);
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
    score += calcDoublePts(15 + treasureBonus);
    removed.forEach((seg) => spawnBurst(seg.x, seg.y, '220, 88%, 58%', 5));
    spawnBurst(item.x, item.y, '220, 88%, 58%', 12);
    addFloatingText(item.x, item.y, `剪短 -${removed.length} 节!`, 'hsl(220, 92%, 70%)');
  } else if (item.type === 'ghost') {
    playTone('powerup');
    score += calcDoublePts(10 + treasureBonus);
    ghostTimer = Math.max(ghostTimer, POWERUP_TYPES.ghost.duration + buffBonusSec);
    spawnBurst(item.x, item.y, '258, 90%, 76%', 14);
    addFloatingText(item.x, item.y, '幽灵穿身!', 'hsl(258, 95%, 82%)');
  } else if (item.type === 'chest') {
    playTone('upgrade');
    score += calcDoublePts(20 + treasureBonus);
    triggerChestModal = true;
    spawnBurst(item.x, item.y, '32, 98%, 60%', 18);
    addFloatingText(item.x, item.y, '🎁 开启神秘宝箱!', 'hsl(34, 100%, 74%)');
  }

  // 传说卡「星陨共鸣」：拾取任意场上道具时自动震碎周围 5×5 岩石并计分
  if (hasStarfallResonance && snake.length > 0) {
    const starCleared = clearObstaclesNear(snake[0].x, snake[0].y, 2);
    if (starCleared > 0) {
      const starPts = calcDoublePts(starCleared * getRockSmashBasePts());
      score += starPts;
      shakeTimer = Math.max(shakeTimer, 0.14);
      spawnBurst(snake[0].x, snake[0].y, '42, 100%, 66%', 14);
      addFloatingText(snake[0].x, snake[0].y, `✦ 星陨碎${starCleared}石 +${starPts}`, 'hsl(42, 100%, 74%)');
    }
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

function takeDamage(hitX, hitY, cause = 'wall') {
  if (damageStats[cause] !== undefined) {
    damageStats[cause] += 1;
  }
  lastHitCause = cause;
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

  const armorCleared = emergencyArmorLevel > 0
    ? clearObstaclesNear(hitX, hitY, emergencyArmorLevel)
    : 0;
  updateHUD();
  invulnTimer = INVULN_DURATION + emergencyArmorLevel * 1.0;
  playTone('hurt');
  spawnBurst(hitX, hitY, '356, 92%, 60%', 12);
  addFloatingText(
    hitX,
    hitY,
    armorCleared > 0 ? `-1 生命 · 护甲清${armorCleared}石` : `-1 生命 (余${lives})`,
    'hsl(356, 96%, 70%)'
  );
  renderBuffBar();
  return true;
}

// 撞墙后自动选择最安全的顺墙垂直方向，避免蛇头原地卡死连吃二次撞墙伤
function pickWallAutoTurn(head, curDir) {
  const perpDirs = [
    { x: -curDir.y, y: curDir.x },
    { x: curDir.y, y: -curDir.x }
  ];
  let bestDir = null;
  let bestScore = -Infinity;
  const center = (GRID_COUNT - 1) / 2;

  for (const d of perpDirs) {
    const nx = head.x + d.x;
    const ny = head.y + d.y;
    if (nx < 0 || nx >= GRID_COUNT || ny < 0 || ny >= GRID_COUNT) continue;
    let candidateScore = 0;
    if (!isObstacleAt(nx, ny, true)) candidateScore += 100;
    if (!isSnakeAt(nx, ny)) candidateScore += 100;
    candidateScore += countOpenNeighbors(nx, ny) * 5;
    candidateScore -= Math.abs(nx - center) + Math.abs(ny - center);
    if (candidateScore > bestScore) {
      bestScore = candidateScore;
      bestDir = d;
    }
  }
  return bestDir || curDir;
}

function stepGame() {
  if (directionQueue.length > 0) {
    direction = directionQueue.shift();
  }

  const head = snake[0];
  let nextX = head.x + direction.x;
  let nextY = head.y + direction.y;

  // 1. 边界检测：护盾状态穿墙；无护盾撞墙扣血并自动顺墙转向，避免原地卡死连续受击
  if (nextX < 0 || nextX >= GRID_COUNT || nextY < 0 || nextY >= GRID_COUNT) {
    if (shieldTimer > 0) {
      nextX = (nextX + GRID_COUNT) % GRID_COUNT;
      nextY = (nextY + GRID_COUNT) % GRID_COUNT;
    } else {
      if (invulnTimer <= 0) {
        if (!takeDamage(head.x, head.y, 'wall')) return;
      }
      direction = pickWallAutoTurn(head, direction);
      directionQueue = [];
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
      const smashPts = calcDoublePts(getRockSmashBasePts() + comboBonus);
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
      if (!takeDamage(nextX, nextY, 'rock')) return;
    } else {
      // 无敌保护期间撞到岩石：直接震碎开路（不扣血、不计分），避免无敌结束瞬间卡死在石堆中
      const rock = obstacles[hitRockIndex];
      obstacles.splice(hitRockIndex, 1);
      spawnBurst(rock.x, rock.y, '32, 18%, 62%', 8);
      playTone('smash');
    }
  }

  const foodPickupRadius = magnetLevel > 0 ? 1 : 0;
  const itemPickupRadius = magnetLevel >= 2 ? 2 : (magnetLevel > 0 ? 1 : 0);
  const willEatFood = Boolean(
    food &&
    Math.abs(nextX - food.x) <= foodPickupRadius &&
    Math.abs(nextY - food.y) <= foodPickupRadius
  );
  const willEatPowerUp = Boolean(
    powerUp &&
    Math.abs(nextX - powerUp.x) <= itemPickupRadius &&
    Math.abs(nextY - powerUp.y) <= itemPickupRadius
  );
  const canGrowByCap = snake.length < MAX_SNAKE_LENGTH;
  const willGrowThisStep = canGrowByCap && (willEatFood || pendingGrowth > 0);

  // 3. 撞自身检测（无敌或幽灵相位期间免伤；若持有「相位穿身」且冷却就绪，自动免伤并触发 2s 幽灵脱困）
  const bodyToCheck = willGrowThisStep ? snake : snake.slice(0, -1);
  const isOverlappingSelf = bodyToCheck.some((seg) => seg.x === nextX && seg.y === nextY);
  if (isOverlappingSelf) {
    if (invulnTimer > 0 || ghostTimer > 0) {
      // 已有无敌或幽灵穿身状态：直接穿过，不消耗相位护体充能
    } else if (hasPhaseBody && phaseBodyCooldown <= 0) {
      ghostTimer = Math.max(ghostTimer, PHASE_BODY_DURATION);
      phaseBodyCooldown = PHASE_BODY_COOLDOWN;
      playTone('powerup');
      spawnBurst(nextX, nextY, '276, 92%, 76%', 14);
      addFloatingText(nextX, nextY, `相位脱困 ${PHASE_BODY_DURATION}s!`, 'hsl(276, 96%, 82%)');
      renderBuffBar();
    } else {
      if (!takeDamage(nextX, nextY, 'self')) return;
    }
  }

  // 4. 推进蛇头（限制最大蛇长且在穿身叠格步不叠加蛇节，防止无尽模式蛇身膨胀叠格）
  snake.unshift({ x: nextX, y: nextY });

  if (willEatFood) {
    const comboBonus = registerComboBonus();
    const mutFoodBonus = (activeMutator === 'moving_food' || activeMutator === 'overdrive') ? 6 : 0;
    const baseFoodPts = getFoodBasePoints(level) + mutFoodBonus;
    const starFruitMult = hasStarfallResonance ? 1.3 : 1;
    const pts = calcDoublePts(Math.round(baseFoodPts * scoreMultiplier * starFruitMult) + comboBonus);
    score += pts;

    if (!canGrowByCap) {
      snake.pop();
      pendingGrowth = 0;
    } else if (isOverlappingSelf) {
      snake.pop();
      addPendingGrowth(1 + extraFoodGrowth);
    } else if (extraFoodGrowth > 0) {
      addPendingGrowth(extraFoodGrowth);
    }

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
  } else if (pendingGrowth > 0 && canGrowByCap && !isOverlappingSelf) {
    pendingGrowth--;
    updateHUD();
  } else {
    snake.pop();
    if (!canGrowByCap) {
      pendingGrowth = 0;
    }
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

  if (phaseBodyCooldown > 0) {
    phaseBodyCooldown = Math.max(0, phaseBodyCooldown - dtSeconds);
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
      levelBannerEl.classList.remove('mutator');
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
    if (activeMutator === 'moving_food' && food) {
      foodMoveTimer += dtSeconds;
      if (foodMoveTimer >= 3.5) {
        foodMoveTimer = 0;
        stepMovingFood();
      }
    } else {
      foodMoveTimer = 0;
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

    // 定时落石/移石：时停期间暂停计时；到达上限后改为挪动最早出现的岩石
    const dripInterval = getEffectiveRockDripInterval(level);
    if (dripInterval > 0) {
      rockDripTimer += dtSeconds;
      if (rockDripTimer >= dripInterval) {
        rockDripTimer = 0;
        const dropCnt = activeMutator === 'double_meteor' ? 2 : 1;
        triggerTimedRockDrop(dropCnt, level);
      }
    } else {
      rockDripTimer = 0;
    }
  }

  renderRockDripChip();
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
    } else if (e.code === 'KeyR') {
      e.preventDefault();
      rerollUpgradeChoices();
    }
    return;
  }

  const mappedDir = KEY_DIRECTION_MAP[e.code];
  if (mappedDir) {
    e.preventDefault();
    if (state === 'idle') {
      startGame();
    } else if (state === 'paused' && isPostUpgradeReady) {
      togglePause();
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

if (upgradeRerollBtn) upgradeRerollBtn.addEventListener('click', rerollUpgradeChoices);
if (modeEasyBtn) modeEasyBtn.addEventListener('click', () => setDifficulty('easy'));
if (modeStandardBtn) modeStandardBtn.addEventListener('click', () => setDifficulty('standard'));
if (modeHardBtn) modeHardBtn.addEventListener('click', () => setDifficulty('hard'));
endlessBtn.addEventListener('click', continueEndlessMode);
shareBtn.addEventListener('click', copyShareStats);
pauseBtn.addEventListener('click', togglePause);

if (itemLegendEl) {
  itemLegendEl.addEventListener('click', (e) => {
    const target = e && e.target;
    const chip = target && typeof target.closest === 'function' ? target.closest('[data-item]') : null;
    if (chip && chip.dataset && chip.dataset.item) {
      showLegendPopover(chip.dataset.item);
    }
  });
}

document.addEventListener('click', (e) => {
  if (!activeLegendItem) return;
  const target = e && e.target;
  if (target && typeof target.closest === 'function' && (target.closest('#item-legend') || target.closest('#legend-popover'))) {
    return;
  }
  hideLegendPopover();
});

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
    else if (state === 'paused' && isPostUpgradeReady) togglePause();
    queueDirection(dir);
  });
}

bindDpadButton('dpad-up', { x: 0, y: -1 });
bindDpadButton('dpad-down', { x: 0, y: 1 });
bindDpadButton('dpad-left', { x: -1, y: 0 });
bindDpadButton('dpad-right', { x: 1, y: 0 });

const SWIPE_THRESHOLD = 18;
let touchStart = null;
let touchSwiped = false;

function isTouchControlTarget(target) {
  return Boolean(
    target &&
    typeof target.closest === 'function' &&
    target.closest('button, a, input, select, textarea')
  );
}

function canSwipeSteer() {
  return state === 'running' || (state === 'paused' && isPostUpgradeReady);
}

function applySwipeDirection(dir) {
  if (state === 'paused' && isPostUpgradeReady) {
    togglePause();
  }
  queueDirection(dir);
}

document.addEventListener('touchstart', (e) => {
  if (!canSwipeSteer() || e.touches.length !== 1 || isTouchControlTarget(e.target)) {
    touchStart = null;
    touchSwiped = false;
    return;
  }
  touchStart = {
    x: e.touches[0].clientX,
    y: e.touches[0].clientY
  };
  touchSwiped = false;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (!canSwipeSteer()) return;
  if (!isTouchControlTarget(e.target)) {
    e.preventDefault();
  }
  if (!touchStart || e.touches.length !== 1) return;

  const curX = e.touches[0].clientX;
  const curY = e.touches[0].clientY;
  const dx = curX - touchStart.x;
  const dy = curY - touchStart.y;

  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;

  if (Math.abs(dx) > Math.abs(dy)) {
    applySwipeDirection(dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 });
  } else {
    applySwipeDirection(dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 });
  }
  // 重置滑动锚点，支持不抬手连续拐弯且划出场地外依然稳定响应
  touchStart = { x: curX, y: curY };
  touchSwiped = true;
}, { passive: false });

document.addEventListener('touchend', (e) => {
  if (canSwipeSteer() && touchStart && !touchSwiped && e.changedTouches.length > 0) {
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE_THRESHOLD) {
      if (Math.abs(dx) > Math.abs(dy)) {
        applySwipeDirection(dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 });
      } else {
        applySwipeDirection(dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 });
      }
    }
  }
  touchStart = null;
  touchSwiped = false;
}, { passive: true });

document.addEventListener('touchcancel', () => {
  touchStart = null;
  touchSwiped = false;
}, { passive: true });

initGameData();
requestAnimationFrame(gameLoop);
