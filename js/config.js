// ==========================================
// 游戏全局配置与纯计算工具函数
// ==========================================

const GRID_COUNT = 20;              // 棋盘格数：20 x 20
const BASE_SIZE = 400;              // 逻辑画布尺寸 (px)
const CELL_SIZE = BASE_SIZE / GRID_COUNT;
const INITIAL_INTERVAL = 140;       // Lv.1 初始每步间隔 (毫秒)
const SPEED_GAIN_PER_LEVEL = 0.05;  // 每升 1 级速度倍率提升 0.05（隐藏属性）
const SLOW_UPGRADE_STEP = 0.15;     // 每次减速强化降低的速度倍率
const MIN_SPEED_MULT = 0.70;        // 隐藏速度倍率最低下限
const POINTS_PER_LEVEL = 50;        // 每多少分升一级并新增障碍
const CLEAR_LEVEL = 20;             // 达到第 20 关即判定通关胜利
const UPGRADE_EVERY_LEVELS = 4;     // 每逢 4 的倍数关卡触发一次三选一强化
const BASE_MAX_OBSTACLES = 18;      // 前中期场上基础岩石数量上限（Lv.1–7）
const HARD_MAX_OBSTACLES = 36;      // 高关卡动态岩石数量封顶上限
const INITIAL_LIVES = 3;            // 初始生命值与初始上限
const HARD_MAX_LIVES = 6;           // 强化可提升的最大生命硬上限
const INVULN_DURATION = 2.0;        // 受伤后的短暂无敌保护时间 (秒)
const NIRVANA_INVULN_DURATION = 3.0;// 涅槃重生后的无敌保护时间 (秒)
const LEVEL_FREEZE_DURATION = 3.0;  // 「时停」每关开始冻结时长 (秒)
const COMBO_WINDOW = 4.2;           // 「连击」连续吃果有效时间窗口 (秒)
const SHAKE_DURATION = 0.22;        // 受击屏幕震动持续时间 (秒)
const HITSTOP_DURATION = 0.045;     // 拾取道具瞬间微顿帧时长 (秒)
const STORAGE_KEY = 'classic_snake_best_score_v2';

// 8 种场上随机道具配置（按关卡逐步解锁）
const POWERUP_TYPES = {
  gold: {
    label: '金果 +30',
    shortLabel: '金果',
    unlockLevel: 1,
    weight: 28,
    dotClass: 'dot-gold',
    color: 'hsl(43, 96%, 56%)'
  },
  ice: {
    label: '寒冰减速',
    shortLabel: '寒冰',
    unlockLevel: 2,
    weight: 24,
    dotClass: 'dot-ice',
    color: 'hsl(196, 88%, 62%)',
    duration: 6.0
  },
  shield: {
    label: '穿墙护盾',
    shortLabel: '护盾',
    unlockLevel: 3,
    weight: 24,
    dotClass: 'dot-shield',
    color: 'hsl(164, 82%, 50%)',
    duration: 7.5
  },
  heart: {
    label: '生命之心',
    shortLabel: '生命',
    unlockLevel: 4,
    weight: 12,
    dotClass: 'dot-heart',
    color: 'hsl(345, 92%, 64%)'
  },
  bomb: {
    label: '爆破炸弹',
    shortLabel: '炸弹',
    unlockLevel: 6,
    weight: 16,
    dotClass: 'dot-bomb',
    color: 'hsl(20, 95%, 58%)'
  },
  scissors: {
    label: '缩身剪刀',
    shortLabel: '剪刀',
    unlockLevel: 8,
    weight: 15,
    dotClass: 'dot-scissors',
    color: 'hsl(220, 82%, 48%)'
  },
  ghost: {
    label: '幽灵相位',
    shortLabel: '幽灵',
    unlockLevel: 10,
    weight: 11,
    dotClass: 'dot-ghost',
    color: 'hsl(258, 90%, 76%)',
    duration: 6.5
  },
  chest: {
    label: '神秘宝箱',
    shortLabel: '宝箱',
    unlockLevel: 12,
    weight: 5,
    dotClass: 'dot-chest',
    color: 'hsl(32, 98%, 56%)'
  }
};

// 三选一强化稀有度权重配置（普通 > 罕见 > 稀有 > 传说，传说权重为稀有的一半）
const RARITY_CONFIG = {
  common: { label: '普通', weight: 8 },
  uncommon: { label: '罕见', weight: 4 },
  rare: { label: '稀有', weight: 2 },
  legendary: { label: '传说', weight: 1 }
};

// 每关升级新增碎石数量阶梯
function getRocksForLevel(lv) {
  if (lv >= 15) return 5;
  if (lv >= 10) return 4;
  if (lv >= 5) return 3;
  return 2;
}

// 随关卡动态增长的碎石数量上限：Lv.1–7 为 18，Lv.8 起每级上限 +2，最高 36
function getMaxObstacles(lv) {
  return Math.min(
    HARD_MAX_OBSTACLES,
    Math.max(BASE_MAX_OBSTACLES, BASE_MAX_OBSTACLES + 2 * (lv - 7))
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

// 本地最高分存取
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
