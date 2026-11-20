// ==========================================
// 游戏全局配置与纯计算工具函数
// ==========================================

const GRID_COUNT = 20;              // 棋盘格数：20 x 20
const BASE_SIZE = 400;              // 逻辑画布尺寸 (px)
const CELL_SIZE = BASE_SIZE / GRID_COUNT;
const INITIAL_INTERVAL = 140;       // Lv.1 初始每步间隔 (毫秒)
const MIN_STEP_INTERVAL = 72;       // 最快步长下限 (毫秒，约 13.9 步/秒，保证困难与触屏可控)
const SPEED_GAIN_PER_LEVEL = 0.04;  // 每升 1 级速度倍率提升 0.04（隐藏属性）
const SLOW_UPGRADE_STEP = 0.20;     // 每次减速强化降低的速度倍率
const SLOW_ROCK_DRIP_COMP = 0.12;   // 每层「从容步伐」补偿定时落石间隔 +12%
const SLOW_COMBO_WINDOW_BONUS = 0.5;// 每层「从容步伐」补偿连击维持窗口 +0.5s
const MIN_SPEED_MULT = 0.78;        // 隐藏速度倍率最低下限（防止简单双减速过于拖沓）
const POINTS_PER_LEVEL = 60;        // 初始每级基础升级分数（Lv.1–5）
const CLEAR_LEVEL = 20;             // 达到第 20 关即判定通关胜利
const ENDLESS_POINTS_BASE = 160;    // 无尽模式 Lv.20->21 起始升级分
const ENDLESS_POINTS_STEP = 15;     // 无尽模式每多 1 关额外递增的升级门槛
const UPGRADE_EVERY_LEVELS = 3;     // 每逢 3 的倍数关卡触发一次三选一强化
const ENDLESS_MUTATOR_EVERY_LEVELS = 5; // 场地词缀每 5 关轮换一次
const BASE_MAX_OBSTACLES = 18;      // 前中期场上基础岩石数量上限（Lv.1–7）
const HARD_MAX_OBSTACLES = 36;      // 高关卡动态岩石数量封顶上限
const MAX_SNAKE_LENGTH = 120;       // 单局蛇身长度软上限（防止无尽模式叠格膨胀）
const INITIAL_LIVES = 3;            // 标准模式初始生命值与初始上限
const HARD_MAX_LIVES = 6;           // 标准模式强化可提升的最大生命硬上限
const INVULN_DURATION = 2.0;        // 受伤后的短暂无敌保护时间 (秒)
const NIRVANA_INVULN_DURATION = 3.0;// 涅槃重生后的无敌保护时间 (秒)
const LEVEL_FREEZE_DURATION = 3.2;  // 「时停」每关开始冻结时长 (秒)
const QUAKE_CLEAR_MAX_PTS = 160;    // 「碎石冲击」单次得分上限（防止叠加乘区连跳多关）
const QUAKE_CLEAR_SHIELD_SEC = 3.0; // 「碎石冲击」清屏后附带的短时护盾时长 (秒)
const PHASE_BODY_COOLDOWN = 10.0;   // 「相位穿身」冷却充能间隔 (秒)
const PHASE_BODY_DURATION = 2.0;    // 「相位穿身」触发时自动获得的幽灵脱困时长 (秒)
const COMBO_WINDOW = 5.0;           // 「连击」连续吃果有效时间窗口 (秒)
const MAX_COMBO_COUNT = 5;          // 「连击」最高叠加层数上限
const BERSERK_SPEED_BONUS = 0.15;   // 双刃卡「极速猎手」永久速度倍率加成
const INITIAL_REROLLS = 1;          // 每局三选一免费重随次数
const SHAKE_DURATION = 0.22;        // 受击屏幕震动持续时间 (秒)
const HITSTOP_DURATION = 0.045;     // 拾取道具瞬间微顿帧时长 (秒)
const STORAGE_KEY = 'classic_snake_best_score_v2';
const ENDLESS_LEVEL_STORAGE_KEY = 'classic_snake_best_endless_lv_v1';
const HARD_CLEAR_STORAGE_KEY = 'classic_snake_hard_clears_v1';

// 开局难度模式配置（简单 / 标准 / 困难；默认标准模式）
const DIFFICULTY_CONFIG = {
  easy: {
    id: 'easy',
    label: '简单模式',
    shortLabel: '简单',
    initialLives: 4,
    hardMaxLives: 7,
    initialSpeedMult: 0.92,
    speedGainMult: 0.75,
    warnDuration: 2.8,
    rockDripMult: 1.35,
    mutatorStartLevel: 20,
    summary: '4 命 · 移速更缓 · 预警 2.8s · 主线无词缀'
  },
  standard: {
    id: 'standard',
    label: '标准模式',
    shortLabel: '标准',
    initialLives: INITIAL_LIVES,
    hardMaxLives: HARD_MAX_LIVES,
    initialSpeedMult: 1.0,
    speedGainMult: 1.0,
    warnDuration: 2.2,
    rockDripMult: 1.0,
    mutatorStartLevel: 15,
    summary: '3 命 · 预警 2.2s · Lv.15 开启主线词缀'
  },
  hard: {
    id: 'hard',
    label: '困难模式',
    shortLabel: '困难',
    initialLives: 2,
    hardMaxLives: 5,
    initialSpeedMult: 1.08,
    speedGainMult: 1.25,
    warnDuration: 1.5,
    rockDripMult: 0.8,
    mutatorStartLevel: 10,
    summary: '2 命 · 移速 +25% · 预警 1.5s · 落石加快 · Lv.10 开启词缀'
  }
};

// 9 种场上随机道具配置（按关卡逐步解锁）
const POWERUP_TYPES = {
  gold: {
    label: '金色果实',
    shortLabel: '金果',
    unlockLevel: 1,
    weight: 25,
    dotClass: 'dot-gold',
    color: 'hsl(43, 96%, 56%)',
    desc: '直接获得 +30 基础分（受得分倍率加成），蛇身 +2 节'
  },
  bomb: {
    label: '爆破炸弹',
    shortLabel: '炸弹',
    unlockLevel: 2,
    weight: 14,
    dotClass: 'dot-bomb',
    color: 'hsl(20, 95%, 58%)',
    desc: '立即炸碎蛇头周围 11×11 全部岩石并按块计分'
  },
  double: {
    label: '双倍得分',
    shortLabel: '双倍',
    unlockLevel: 3,
    weight: 18,
    dotClass: 'dot-double',
    color: 'hsl(39, 96%, 42%)',
    duration: 8.0,
    desc: '8 秒内所有果实、道具与碎石得分全部翻倍（×2）'
  },
  shield: {
    label: '穿墙护盾',
    shortLabel: '护盾',
    unlockLevel: 4,
    weight: 20,
    dotClass: 'dot-shield',
    color: 'hsl(164, 82%, 50%)',
    duration: 7.5,
    desc: '7.5 秒可穿透边界，并主动撞碎岩石计分与叠加连击'
  },
  heart: {
    label: '生命之心',
    shortLabel: '生命',
    unlockLevel: 5,
    weight: 12,
    dotClass: 'dot-heart',
    color: 'hsl(345, 92%, 64%)',
    desc: '立即恢复 1 点生命值（仅生命未满时刷新）'
  },
  ice: {
    label: '寒冰减速',
    shortLabel: '寒冰',
    unlockLevel: 6,
    weight: 20,
    dotClass: 'dot-ice',
    color: 'hsl(196, 88%, 62%)',
    duration: 6.0,
    desc: '6 秒内大幅放缓移动速度，高压局面精准控蛇'
  },
  scissors: {
    label: '缩身剪刀',
    shortLabel: '剪刀',
    unlockLevel: 8,
    weight: 15,
    dotClass: 'dot-scissors',
    color: 'hsl(220, 82%, 48%)',
    desc: '立即剪短蛇尾 5 节（蛇长越长刷新概率越高）'
  },
  ghost: {
    label: '幽灵相位',
    shortLabel: '幽灵',
    unlockLevel: 10,
    weight: 15,
    dotClass: 'dot-ghost',
    color: 'hsl(258, 90%, 76%)',
    duration: 6.5,
    desc: '6.5 秒幽灵化，可安全穿过自身蛇身不扣血'
  },
  chest: {
    label: '神秘宝箱',
    shortLabel: '宝箱',
    unlockLevel: 12,
    weight: 8,
    dotClass: 'dot-chest',
    color: 'hsl(32, 98%, 56%)',
    desc: '立即开启一次额外三选一强化（稀有/传说概率 ×1.5）'
  }
};

// 三选一强化稀有度权重配置（普通 > 罕见 > 稀有 > 传说，传说权重为稀有的一半）
const RARITY_CONFIG = {
  common: { label: '普通', weight: 8 },
  uncommon: { label: '罕见', weight: 4 },
  rare: { label: '稀有', weight: 2 },
  legendary: { label: '传说', weight: 1 }
};

// 分段升级门槛：Lv.1–5 每级 60 分，Lv.6–12 每级 90 分，Lv.13–19 每级 130 分，Lv.20+ 无尽起 160 分且每关递增 +15 分
function getPointsForNextLevel(lv) {
  if (lv >= CLEAR_LEVEL) return ENDLESS_POINTS_BASE + (lv - CLEAR_LEVEL) * ENDLESS_POINTS_STEP;
  if (lv >= 13) return 130;
  if (lv >= 6) return 90;
  return POINTS_PER_LEVEL;
}

function getScoreForLevel(targetLv) {
  let total = 0;
  for (let lv = 1; lv < targetLv; lv++) {
    total += getPointsForNextLevel(lv);
  }
  return total;
}

function getLevelForScore(currentScore) {
  let lv = 1;
  let remaining = Math.max(0, currentScore);
  while (remaining >= getPointsForNextLevel(lv)) {
    remaining -= getPointsForNextLevel(lv);
    lv++;
  }
  return lv;
}

// 苹果基础分随关卡阶梯增长：Lv.1–4 为 10，每 4 关 +2（Lv.5: 12, Lv.9: 14, Lv.13: 16, Lv.17: 18, Lv.21: 20，最高 24）
function getFoodBasePoints(lv) {
  const tier = Math.floor(Math.max(0, lv - 1) / 4);
  return Math.min(24, 10 + tier * 2);
}

// 主线高关卡与无尽模式共用的场地变化词缀（共 5 种；标准 Lv.15 / 困难 Lv.10 / 简单无尽 Lv.20 激活，每 5 关轮换）
const ENDLESS_MUTATORS = {
  moving_food: {
    id: 'moving_food',
    name: '游走果实',
    desc: '苹果每3.5s游走1格，苹果分+6'
  },
  double_meteor: {
    id: 'double_meteor',
    name: '双倍落石',
    desc: '落石+30%且双落，炸弹增多、碎石+3分'
  },
  fragile_aegis: {
    id: 'fragile_aegis',
    name: '碎石狂潮',
    desc: '护盾道具时长减半，碎石基础分×2'
  },
  swift_loot: {
    id: 'swift_loot',
    name: '疾速秘宝',
    desc: '道具刷新+35%就近生成，停留-35%'
  },
  overdrive: {
    id: 'overdrive',
    name: '狂飙时刻',
    desc: '移速+12%，连击窗口+2s且苹果分+6'
  }
};

// 受击与死因分类名称
const CAUSE_LABELS = {
  wall: '撞墙',
  rock: '撞碎石',
  self: '撞自身'
};

// 每关升级新增碎石数量阶梯
function getRocksForLevel(lv) {
  if (lv >= 15) return 5;
  if (lv >= 10) return 4;
  if (lv >= 5) return 3;
  return 2;
}

// 炸弹动态权重：以开局 4 块岩石为基准，每多 4 块岩石权重 +2，基础 14、最高 24
const BOMB_WEIGHT_MAX = 24;
function getBombDynamicWeight(rockCount) {
  const extraSteps = Math.floor(Math.max(0, rockCount - 4) / 4);
  return Math.min(BOMB_WEIGHT_MAX, POWERUP_TYPES.bomb.weight + extraSteps * 2);
}

// 缩身剪刀动态权重：蛇身达到 24 节后每多 8 节权重 +3，基础 15、最高 27（缓解不抽倍率卡时的控长压力）
const SCISSORS_WEIGHT_MAX = 27;
function getScissorsDynamicWeight(snakeLen) {
  if (snakeLen < 24) return POWERUP_TYPES.scissors.weight;
  const extraSteps = Math.floor((snakeLen - 24) / 8) + 1;
  return Math.min(SCISSORS_WEIGHT_MAX, POWERUP_TYPES.scissors.weight + extraSteps * 3);
}

// 「以石养身」：每累计碎 13 块岩石回复 1 点生命；满血时改为获得 4 秒护盾
const STONE_FEAST_THRESHOLD = 13;
const STONE_FEAST_SHIELD_SEC = 4.0;

// 定时落石间隔（秒）：Lv.1–2 不落石，Lv.3–9 每 12s，Lv.10–14 每 9s，Lv.15+ / 无尽每 7s
// 返回 0 表示当前关卡不触发定时落石；到达上限后改为挪动最早出现的岩石
function getRockDripInterval(lv) {
  if (lv >= 15) return 7;
  if (lv >= 10) return 9;
  if (lv >= 3) return 12;
  return 0;
}

// 随关卡动态增长的碎石数量上限：Lv.1–7 为 18，Lv.8 起每级上限 +1，最高 36（Lv.25 封顶）
function getMaxObstacles(lv) {
  return Math.min(
    HARD_MAX_OBSTACLES,
    Math.max(BASE_MAX_OBSTACLES, BASE_MAX_OBSTACLES + (lv - 7))
  );
}

// 格式化存活时长（秒 -> X分XX秒 / X秒）
function formatDuration(seconds) {
  const total = Math.max(1, Math.round(seconds));
  if (total >= 60) {
    const mins = Math.floor(total / 60);
    const secs = String(total % 60).padStart(2, '0');
    return `${mins}分${secs}秒`;
  }
  return `${total}秒`;
}

// 按难度生成独立存储键（标准模式沿用原键，兼容已有历史纪录）
function getBestScoreStorageKey(mode = 'standard') {
  return mode === 'standard' ? STORAGE_KEY : `${STORAGE_KEY}_${mode}`;
}

function getBestEndlessStorageKey(mode = 'standard') {
  return mode === 'standard' ? ENDLESS_LEVEL_STORAGE_KEY : `${ENDLESS_LEVEL_STORAGE_KEY}_${mode}`;
}

// 本地最高分、无尽最高关卡与困难通关次数存取（按难度独立统计）
function loadBestScore(mode = 'standard') {
  try {
    const saved = localStorage.getItem(getBestScoreStorageKey(mode));
    return saved ? Math.max(0, parseInt(saved, 10) || 0) : 0;
  } catch {
    return 0;
  }
}

function saveBestScore(value, mode = 'standard') {
  try {
    localStorage.setItem(getBestScoreStorageKey(mode), String(value));
  } catch {
    // 忽略存储异常
  }
}

function loadBestEndlessLevel(mode = 'standard') {
  try {
    const saved = localStorage.getItem(getBestEndlessStorageKey(mode));
    return saved ? Math.max(0, parseInt(saved, 10) || 0) : 0;
  } catch {
    return 0;
  }
}

function saveBestEndlessLevel(value, mode = 'standard') {
  try {
    localStorage.setItem(getBestEndlessStorageKey(mode), String(value));
  } catch {
    // 忽略存储异常
  }
}

function loadHardClearCount() {
  try {
    const saved = localStorage.getItem(HARD_CLEAR_STORAGE_KEY);
    return saved ? Math.max(0, parseInt(saved, 10) || 0) : 0;
  } catch {
    return 0;
  }
}

function saveHardClearCount(value) {
  try {
    localStorage.setItem(HARD_CLEAR_STORAGE_KEY, String(value));
  } catch {
    // 忽略存储异常
  }
}
