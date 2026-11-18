#!/usr/bin/env node
'use strict';

/**
 * 仓库自动化回归验证脚本（零外部依赖）
 * 运行方式：node tests/verify.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');

function createBrowserSandbox() {
  let saveDepth = 0;
  let clipboardText = '';
  const vibrated = [];
  const docListeners = {};
  const winListeners = {};

  const ctx = {
    setTransform() {}, clearRect() {}, fillRect() {}, strokeRect() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {},
    roundRect() {}, ellipse() {}, bezierCurveTo() {}, quadraticCurveTo() {},
    fill() {}, stroke() {}, setLineDash() {}, fillText() {}, translate() {}, scale() {},
    save() { saveDepth++; },
    restore() { saveDepth--; assert(saveDepth >= 0, 'Unbalanced ctx.restore()'); }
  };

  function makeClassList(initial = []) {
    const set = new Set(initial);
    return {
      add: (...c) => c.forEach((x) => set.add(x)),
      remove: (...c) => c.forEach((x) => set.delete(x)),
      contains: (x) => set.has(x),
      toggle: (x, force) => {
        if (force === undefined) {
          if (set.has(x)) { set.delete(x); return false; }
          set.add(x); return true;
        }
        if (force) set.add(x); else set.delete(x);
        return Boolean(force);
      }
    };
  }

  const elements = new Map();
  function getEl(id) {
    if (!elements.has(id)) {
      const defaultHidden = ['level-banner', 'upgrade-overlay', 'run-summary', 'share-btn'];
      const children = [];
      const listeners = {};
      elements.set(id, {
        id,
        width: 400,
        height: 400,
        textContent: '',
        innerHTML: '',
        disabled: false,
        style: {},
        children,
        listeners,
        focus() {},
        classList: makeClassList(
          defaultHidden.includes(id)
            ? ['hidden']
            : (id === 'level-toast' ? ['opacity-0'] : [])
        ),
        getContext: () => ctx,
        addEventListener(ev, fn) { listeners[ev] = fn; },
        appendChild(ch) { children.push(ch); },
        removeChild() {},
        getBoundingClientRect: () => ({ width: 400, height: 400 })
      });
    }
    return elements.get(id);
  }

  const document = {
    hidden: false,
    documentElement: { classList: makeClassList(['dark']) },
    body: { appendChild() {}, removeChild() {} },
    getElementById: (id) => getEl(id),
    querySelectorAll: () => [],
    execCommand: () => true,
    createElement: (tag) => ({
      tagName: tag,
      type: '',
      value: '',
      className: '',
      innerHTML: '',
      style: {},
      listeners: {},
      setAttribute() {},
      select() {},
      addEventListener(ev, fn) { this.listeners[ev] = fn; }
    }),
    addEventListener(ev, fn) {
      docListeners[ev] = docListeners[ev] || [];
      docListeners[ev].push(fn);
    }
  };

  const navigator = {
    vibrate: (p) => { vibrated.push(p); return true; },
    clipboard: {
      writeText: async (text) => { clipboardText = text; }
    }
  };

  const sandbox = {
    console, Math, Date, Set, Map, Array, Object, String, Number, Boolean, JSON,
    parseInt, parseFloat, isNaN, setTimeout: (fn) => { fn(); return 1; }, clearTimeout() {},
    MutationObserver: class { observe() {} },
    performance: { now: () => 1000 },
    requestAnimationFrame: () => 1,
    navigator,
    localStorage: { getItem: () => null, setItem() {} },
    window: {
      devicePixelRatio: 2,
      focus() {},
      addEventListener(ev, fn) {
        winListeners[ev] = winListeners[ev] || [];
        winListeners[ev].push(fn);
      },
      matchMedia: () => ({ matches: true, addEventListener() {} })
    },
    document
  };
  sandbox.window.localStorage = sandbox.localStorage;

  return {
    sandbox,
    getEl,
    getSaveDepth: () => saveDepth,
    getClipboardText: () => clipboardText,
    getVibrated: () => vibrated,
    triggerVisibilityHidden() {
      document.hidden = true;
      (docListeners.visibilitychange || []).forEach((fn) => fn());
      document.hidden = false;
    },
    triggerWindowBlur() {
      (winListeners.blur || []).forEach((fn) => fn());
    }
  };
}

// 1. 校验 index.html 引用的全部脚本顺序并加载测试
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scriptPaths = [...indexHtml.matchAll(/<script\s+src="([^"]+)"><\/script>/g)].map((m) => m[1]);
assert.deepStrictEqual(scriptPaths, [
  './js/config.js',
  './js/audio.js',
  './js/render.js',
  './game.js'
], 'index.html 模块脚本加载顺序应匹配预期');

const combinedRepoCode = '"use strict";\n' + scriptPaths
  .map((rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8'))
  .join('\n') + `
  globalThis.__game = {
    SPEED_GAIN_PER_LEVEL,
    SLOW_UPGRADE_STEP,
    POWERUP_TYPES,
    UPGRADE_POOL,
    RARITY_CONFIG,
    getRocksForLevel,
    getMaxObstacles,
    getPowerUpCooldown,
    isPowerUpEligible,
    pickWeightedUpgrades,
    startGame,
    continueEndlessMode,
    stepGame,
    updateTimers,
    checkLevelUp,
    openNextUpgradeChoice,
    selectUpgrade,
    copyShareStats,
    gameLoop,
    renderScene,
    getSnapshot: () => JSON.parse(JSON.stringify({
      state, level, endlessMode, score, lives, maxLives, scoreMultiplier, baseStepInterval,
      snake, obstacles, food, powerUp, lastPowerUpType, invulnTimer, doubleTimer, shieldTimer, ghostTimer, freezeTimer,
      comboCount, comboTimer, hasPhaseBody, hasLevelFreeze,
      nirvanaCharges, nirvanaUsed, shakeTimer, hitstopTimer,
      rocksSmashed, runElapsedSec, pickedUpgrades
    })),
    spawnPowerUp,
    setTestState: (patch) => {
      if (patch.level !== undefined) level = patch.level;
      if (patch.endlessMode !== undefined) endlessMode = patch.endlessMode;
      if (patch.snake) snake = patch.snake;
      if (patch.direction) { direction = patch.direction; directionQueue = []; }
      if (patch.score !== undefined) score = patch.score;
      if (patch.lives !== undefined) lives = patch.lives;
      if (patch.maxLives !== undefined) maxLives = patch.maxLives;
      if (patch.doubleTimer !== undefined) doubleTimer = patch.doubleTimer;
      if (patch.shieldTimer !== undefined) shieldTimer = patch.shieldTimer;
      if (patch.ghostTimer !== undefined) ghostTimer = patch.ghostTimer;
      if (patch.freezeTimer !== undefined) freezeTimer = patch.freezeTimer;
      if (patch.invulnTimer !== undefined) invulnTimer = patch.invulnTimer;
      if (patch.obstacles !== undefined) obstacles = patch.obstacles;
      if (patch.powerUp !== undefined) powerUp = patch.powerUp;
      if (patch.lastPowerUpType !== undefined) lastPowerUpType = patch.lastPowerUpType;
      if (patch.food !== undefined) food = patch.food;
    }
  };
`;

const env = createBrowserSandbox();
vm.createContext(env.sandbox);
vm.runInContext(combinedRepoCode, env.sandbox);
const g = env.sandbox.__game;

// 2. 校验动态碎石上限（Lv.8 起按 18 + 1*(lv - 7) 提升至封顶 36）与阶梯增量
assert.strictEqual(g.getMaxObstacles(1), 18);
assert.strictEqual(g.getMaxObstacles(7), 18);
assert.strictEqual(g.getMaxObstacles(8), 19);
assert.strictEqual(g.getMaxObstacles(12), 23);
assert.strictEqual(g.getMaxObstacles(16), 27);
assert.strictEqual(g.getMaxObstacles(20), 31);
assert.strictEqual(g.getMaxObstacles(25), 36);
assert.strictEqual(g.getMaxObstacles(30), 36);
assert.strictEqual(g.getRocksForLevel(4), 2);
assert.strictEqual(g.getRocksForLevel(5), 3);
assert.strictEqual(g.getRocksForLevel(10), 4);
assert.strictEqual(g.getRocksForLevel(15), 5);

// 达到满额 36 块后升级不再显示红色落石警示
g.startGame();
const fullRocks = Array.from({ length: 36 }, (_, i) => ({ x: (i % 16) + 2, y: Math.floor(i / 16) + 2, warnTimer: 0 }));
g.setTestState({ obstacles: fullRocks, score: 850 }); // 升至 Lv.18
g.checkLevelUp();
assert.strictEqual(g.getSnapshot().level, 18);
assert.strictEqual(env.getEl('level-banner').classList.contains('hidden'), true);

// 3. 校验切出页面 / 窗口失焦自动暂停
g.startGame();
assert.strictEqual(g.getSnapshot().state, 'running');
env.triggerVisibilityHidden();
assert.strictEqual(g.getSnapshot().state, 'paused');

g.startGame();
env.triggerWindowBlur();
assert.strictEqual(g.getSnapshot().state, 'paused');

// 4. 校验撞墙规则：无护盾扣 1 命、停在原地并短暂无敌；无敌期间继续面朝墙壁仍停在原地且不重复扣血；有护盾正常穿墙
g.startGame();
g.setTestState({
  snake: [{ x: 19, y: 10 }, { x: 18, y: 10 }, { x: 17, y: 10 }],
  direction: { x: 1, y: 0 },
  shieldTimer: 0,
  invulnTimer: 0
});
g.stepGame();
let snap = g.getSnapshot();
assert.strictEqual(snap.lives, 2, '无护盾撞墙应扣 1 命');
assert.deepStrictEqual(snap.snake[0], { x: 19, y: 10 }, '撞墙后蛇头应停在原地不穿墙');
assert(snap.invulnTimer > 0, '撞墙后应获得短暂无敌');
assert(snap.shakeTimer > 0, '受击应触发屏幕震动');
assert(env.getVibrated().length > 0, '受击应触发触觉震动');

// 无敌期间再次朝墙步进：仍停在原地且不额外扣血
g.stepGame();
snap = g.getSnapshot();
assert.strictEqual(snap.lives, 2);
assert.deepStrictEqual(snap.snake[0], { x: 19, y: 10 });

// 有护盾时撞墙：正常穿墙至 x = 0
g.setTestState({ shieldTimer: 5.0 });
g.stepGame();
snap = g.getSnapshot();
assert.deepStrictEqual(snap.snake[0], { x: 0, y: 10 }, '护盾激活时应可穿墙');

// 5. 校验 9 种道具等级解锁表（1, 2, 3, 4, 5, 6, 8, 10, 12）与防连续重复生成
assert.deepStrictEqual(
  Object.fromEntries(Object.entries(g.POWERUP_TYPES).map(([k, v]) => [k, v.unlockLevel])),
  { gold: 1, bomb: 2, double: 3, shield: 4, heart: 5, ice: 6, scissors: 8, ghost: 10, chest: 12 },
  '9 种道具解锁关卡应符合 1/2/3/4/5/6/8/10/12 新设定（双倍3级、护盾4级、生命5级）'
);
g.startGame();
g.setTestState({
  level: 1,
  lives: 2,
  snake: Array.from({ length: 7 }, (_, i) => ({ x: 10 - i, y: 10 }))
});
assert.strictEqual(g.isPowerUpEligible('gold'), true);
assert.strictEqual(g.isPowerUpEligible('bomb'), false);
g.setTestState({ level: 2 });
assert.strictEqual(g.isPowerUpEligible('bomb'), true);
assert.strictEqual(g.isPowerUpEligible('double'), false);
g.setTestState({ level: 3 });
assert.strictEqual(g.isPowerUpEligible('double'), true);
assert.strictEqual(g.isPowerUpEligible('shield'), false);
g.setTestState({ level: 4 });
assert.strictEqual(g.isPowerUpEligible('shield'), true);
assert.strictEqual(g.isPowerUpEligible('heart'), false);
g.setTestState({ level: 5 });
assert.strictEqual(g.isPowerUpEligible('heart'), true);
assert.strictEqual(g.isPowerUpEligible('ice'), false);
g.setTestState({ level: 6 });
assert.strictEqual(g.isPowerUpEligible('ice'), true);
assert.strictEqual(g.isPowerUpEligible('scissors'), false);
g.setTestState({ level: 8 });
assert.strictEqual(g.isPowerUpEligible('scissors'), true);
assert.strictEqual(g.isPowerUpEligible('ghost'), false);
g.setTestState({ level: 10 });
assert.strictEqual(g.isPowerUpEligible('ghost'), true);
assert.strictEqual(g.isPowerUpEligible('chest'), false);
g.setTestState({ level: 12 });
assert.strictEqual(g.isPowerUpEligible('chest'), true);

// 连续 100 次生成道具，校验不会连续两次出现同一种道具
g.startGame();
g.setTestState({
  level: 12,
  lives: 2,
  snake: Array.from({ length: 8 }, (_, i) => ({ x: 10 - i, y: 10 })),
  obstacles: [{ x: 2, y: 2, warnTimer: 0 }, { x: 17, y: 17, warnTimer: 0 }]
});
let prevType = null;
for (let i = 0; i < 100; i++) {
  g.setTestState({ powerUp: null });
  g.spawnPowerUp();
  const spawnedType = g.getSnapshot().powerUp.type;
  assert.notStrictEqual(spawnedType, prevType, '不应连续两次生成同一种道具');
  prevType = spawnedType;
}

// 6. 校验 12 张强化词条池、传说稀有度权重（稀有的一半）及核心数值
assert.strictEqual(g.UPGRADE_POOL.length, 12, '词条池应扩展为 12 项');
assert.strictEqual(g.RARITY_CONFIG.legendary.weight * 2, g.RARITY_CONFIG.rare.weight, '传说稀有度单卡权重应为稀有的一半');
assert(
  g.RARITY_CONFIG.legendary.weight < g.RARITY_CONFIG.rare.weight &&
  g.RARITY_CONFIG.rare.weight < g.RARITY_CONFIG.uncommon.weight &&
  g.RARITY_CONFIG.uncommon.weight < g.RARITY_CONFIG.common.weight,
  '单卡权重应满足 传说 < 稀有 < 罕见 < 普通'
);

// 蒙特卡洛抽样验证单卡出现率：传说 < 稀有 < 罕见 < 普通
g.startGame();
g.setTestState({ snake: Array.from({ length: 8 }, (_, i) => ({ x: 10 - i, y: 10 })) });
const pickCounts = { common: 0, uncommon: 0, rare: 0, legendary: 0 };
const cardPoolCounts = { common: 6, uncommon: 3, rare: 2, legendary: 1 };
for (let i = 0; i < 6000; i++) {
  for (const c of g.pickWeightedUpgrades(3)) {
    pickCounts[c.rarity]++;
  }
}
const perCardRate = {
  common: pickCounts.common / cardPoolCounts.common,
  uncommon: pickCounts.uncommon / cardPoolCounts.uncommon,
  rare: pickCounts.rare / cardPoolCounts.rare,
  legendary: pickCounts.legendary / cardPoolCounts.legendary
};
assert(
  perCardRate.legendary < perCardRate.rare &&
  perCardRate.rare < perCardRate.uncommon &&
  perCardRate.uncommon < perCardRate.common,
  '蒙特卡洛单卡抽中率应满足 传说 < 稀有 < 罕见 < 普通'
);

// 校验 9 种道具刷新权重
assert.deepStrictEqual(
  Object.fromEntries(Object.entries(g.POWERUP_TYPES).map(([k, v]) => [k, v.weight])),
  { gold: 25, bomb: 20, double: 18, shield: 20, heart: 12, ice: 20, scissors: 15, ghost: 15, chest: 8 },
  '9 种道具权重应符合最新数值配置'
);

// 校验「强健体魄」罕见、「圣盾赐福」普通、「黄金胃口」+50%、「断尾瘦身」40%、「从容步伐」0.20 与「碎石冲击」全屏震碎
assert.strictEqual(g.SPEED_GAIN_PER_LEVEL, 0.04, '每级速度提升应为 0.04');
assert.strictEqual(g.SLOW_UPGRADE_STEP, 0.2, '从容步伐每次应降低 0.2 速度倍率');
assert.strictEqual(g.UPGRADE_POOL.find((u) => u.id === 'max_hp').rarity, 'uncommon', '强健体魄稀有度应为罕见');
assert.strictEqual(g.UPGRADE_POOL.find((u) => u.id === 'instant_aegis').rarity, 'common', '圣盾赐福稀有度应为普通');

const scoreCard = g.UPGRADE_POOL.find((u) => u.id === 'score_boost');
assert(scoreCard.getDesc().includes('+50%'), '黄金胃口描述应为 +50%');
g.startGame();
scoreCard.apply();
assert.strictEqual(g.getSnapshot().scoreMultiplier, 1.5, '黄金胃口单次应提升至 1.5x');

const slowCard = g.UPGRADE_POOL.find((u) => u.id === 'slow_pace');
g.startGame();
g.setTestState({ level: 10 });
slowCard.apply(); // Lv.10 gain = 0.36 -> 1.36 - 0.20 = 1.16 -> round(140 / 1.16) = 121
assert.strictEqual(g.getSnapshot().baseStepInterval, Math.round(140 / (1 + 9 * 0.04 - 0.2)), '从容步伐应永久降低 0.2 速度倍率');

const quakeCard = g.UPGRADE_POOL.find((u) => u.id === 'quake_clear');
g.startGame();
g.setTestState({
  obstacles: [
    { x: 2, y: 2, warnTimer: 0 },
    { x: 3, y: 3, warnTimer: 0 },
    { x: 4, y: 4, warnTimer: 0 },
    { x: 5, y: 5, warnTimer: 0 },
    { x: 6, y: 6, warnTimer: 0 }
  ]
});
assert(quakeCard.getDesc().includes('全部'), '碎石冲击描述应包含全部岩石');
quakeCard.apply();
assert.strictEqual(g.getSnapshot().obstacles.length, 0, '碎石冲击应震碎场上全部石头');
assert.strictEqual(g.getSnapshot().rocksSmashed, 5, '碎石冲击应计入全部被震碎石块');
assert.strictEqual(g.getSnapshot().score, 25, '碎石冲击每块石头应 +5 分');

const trimCard = g.UPGRADE_POOL.find((u) => u.id === 'trim_body');
g.startGame();
g.setTestState({ snake: Array.from({ length: 10 }, (_, i) => ({ x: 12 - i, y: 10 })) });
assert(trimCard.getDesc().includes('40%'), '断尾瘦身描述应为 40%');
trimCard.apply();
assert.strictEqual(g.getSnapshot().snake.length, 6, '10 节蛇身触发 40% 断尾瘦身应减至 6 节');

// 7. 校验新增 4 项强化卡：连击、时停、相位穿身、涅槃
// 7a. 连击 (combo_frenzy)
g.startGame();
const comboCard = g.UPGRADE_POOL.find((u) => u.id === 'combo_frenzy');
comboCard.apply();
g.setTestState({
  snake: [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }],
  direction: { x: 1, y: 0 },
  food: { x: 6, y: 10 },
  obstacles: []
});
g.stepGame(); // 第 1 颗苹果：+10
assert.strictEqual(g.getSnapshot().score, 10);
g.setTestState({ food: { x: 7, y: 10 } });
g.stepGame(); // 第 2 颗苹果（连击 x2）：+10 + 4 = 14 -> 总分 24
assert.strictEqual(g.getSnapshot().score, 24, '连击第 2 层应额外 +4 分');
g.setTestState({ food: { x: 8, y: 10 } });
g.stepGame(); // 第 3 颗苹果（连击 x3）：+10 + 8 = 18 -> 总分 42
assert.strictEqual(g.getSnapshot().score, 42, '连击第 3 层应额外 +8 分');

// 7b. 时停 (level_freeze)
g.startGame();
const freezeCard = g.UPGRADE_POOL.find((u) => u.id === 'level_freeze');
freezeCard.apply();
g.setTestState({
  score: 50,
  powerUp: { x: 12, y: 12, type: 'gold', ttl: 8.0, maxTtl: 9.5 }
});
g.checkLevelUp(); // 升至 Lv.2，触发 3 秒时停
snap = g.getSnapshot();
assert.strictEqual(snap.freezeTimer, 3.0, '升入新关应触发 3 秒时停');
const warnBefore = snap.obstacles.find((o) => o.warnTimer > 0).warnTimer;
g.updateTimers(1.0); // 时停期间推进 1 秒：预警与道具倒计时不应减少
snap = g.getSnapshot();
assert.strictEqual(snap.freezeTimer, 2.0);
assert.strictEqual(snap.obstacles.find((o) => o.warnTimer > 0).warnTimer, warnBefore, '时停期间落石预警应冻结');

// 7c. 相位穿身 (phase_body)
g.startGame();
const phaseCard = g.UPGRADE_POOL.find((u) => u.id === 'phase_body');
phaseCard.apply();
g.setTestState({
  level: 12,
  // 蛇头在 (6,6) 向右走，(7,6) 是自身第 3 节身体
  snake: [
    { x: 6, y: 6 },
    { x: 6, y: 7 },
    { x: 7, y: 7 },
    { x: 7, y: 6 },
    { x: 7, y: 5 },
    { x: 6, y: 5 }
  ],
  direction: { x: 1, y: 0 },
  obstacles: [],
  food: { x: 18, y: 18 }
});
assert.strictEqual(g.isPowerUpEligible('ghost'), false, '拥有永久相位穿身后不再刷新幽灵道具');
g.stepGame();
assert.strictEqual(g.getSnapshot().lives, 3, '相位穿身穿过自身身体不应扣血');

// 7d. 涅槃 (nirvana)
g.startGame();
const nirvanaCard = g.UPGRADE_POOL.find((u) => u.id === 'nirvana');
nirvanaCard.apply();
assert.strictEqual(nirvanaCard.canPick(), false, '持有涅槃时不可重复抽取');
g.setTestState({
  lives: 1,
  maxLives: 4,
  snake: [{ x: 19, y: 10 }, { x: 18, y: 10 }, { x: 17, y: 10 }],
  direction: { x: 1, y: 0 },
  obstacles: [{ x: 18, y: 9, warnTimer: 0 }],
  invulnTimer: 0,
  shieldTimer: 0
});
g.stepGame(); // 致命撞墙 -> 触发涅槃满血复活
snap = g.getSnapshot();
assert.strictEqual(snap.state, 'running', '涅槃应在致命伤时阻止死亡');
assert.strictEqual(snap.lives, 4, '涅槃应满血复活');
assert.strictEqual(snap.nirvanaUsed, true);
assert.strictEqual(snap.invulnTimer, 3.0, '涅槃复活应给予 3 秒无敌');
assert.strictEqual(snap.obstacles.length, 0, '涅槃复活应震碎周围碎石');
assert.strictEqual(nirvanaCard.canPick(), false, '本局已触发过涅槃后不可再次抽取');

// 8. 校验新增 4 种场上道具：爆破炸弹、缩身剪刀、幽灵相位、神秘宝箱
// 8a. 爆破炸弹 (bomb · 11x11 区域，半径 5)
g.startGame();
g.setTestState({
  snake: [{ x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }],
  direction: { x: 1, y: 0 },
  obstacles: [
    { x: 11, y: 10, warnTimer: 0 }, // 距离新蛇头 (10,10) 1 格 -> 炸毁
    { x: 15, y: 15, warnTimer: 0 }, // 距离新蛇头 (10,10) 偏移 (5,5)，仍在 11x11 边缘 -> 炸毁
    { x: 16, y: 10, warnTimer: 0 }  // 距离新蛇头 (10,10) 偏移 (6,0)，在 11x11 之外 -> 保留
  ],
  powerUp: { x: 10, y: 10, type: 'bomb', ttl: 8, maxTtl: 9.5 },
  food: { x: 2, y: 2 }
});
g.stepGame();
snap = g.getSnapshot();
assert.strictEqual(snap.obstacles.length, 1, '爆破炸弹应清除蛇头周围 11x11 内碎石');
assert.strictEqual(snap.rocksSmashed, 2, '炸毁碎石应计入击碎数');
assert.strictEqual(snap.score, 20, '爆破炸弹应获得 10 + 2*5 = 20 分');

// 8b. 缩身剪刀 (scissors · 减少 5 节)
g.startGame();
g.setTestState({
  snake: Array.from({ length: 8 }, (_, i) => ({ x: 9 - i, y: 10 })),
  direction: { x: 1, y: 0 },
  obstacles: [],
  powerUp: { x: 10, y: 10, type: 'scissors', ttl: 8, maxTtl: 9.5 },
  food: { x: 2, y: 2 }
});
g.stepGame();
assert.strictEqual(g.getSnapshot().snake.length, 3, '8 节蛇身吃到缩身剪刀应剪去 5 节剩 3 节');

// 8c. 幽灵相位道具 (ghost)
g.startGame();
g.setTestState({
  snake: [
    { x: 6, y: 6 },
    { x: 6, y: 7 },
    { x: 7, y: 7 },
    { x: 8, y: 7 },
    { x: 8, y: 6 },
    { x: 8, y: 5 },
    { x: 7, y: 5 }
  ],
  direction: { x: 1, y: 0 },
  obstacles: [],
  powerUp: { x: 7, y: 6, type: 'ghost', ttl: 8, maxTtl: 9.5 },
  food: { x: 18, y: 18 }
});
g.stepGame(); // 走到 (7,6) 拾取幽灵相位
assert(g.getSnapshot().ghostTimer > 0, '拾取幽灵相位应激活持续时间');
g.stepGame(); // 走到 (8,6) 穿过自身身体不扣血
assert.strictEqual(g.getSnapshot().lives, 3, '幽灵相位激活期间穿过自身不应扣血');

// 8d. 神秘宝箱 (chest)
g.startGame();
g.setTestState({
  snake: [{ x: 9, y: 10 }, { x: 8, y: 10 }, { x: 7, y: 10 }],
  direction: { x: 1, y: 0 },
  obstacles: [],
  powerUp: { x: 10, y: 10, type: 'chest', ttl: 8, maxTtl: 9.5 },
  food: { x: 2, y: 2 }
});
g.stepGame();
assert.strictEqual(g.getSnapshot().state, 'choosing', '拾取神秘宝箱应立即打开三选一强化面板');
assert(env.getEl('upgrade-badge').textContent.includes('神秘宝箱'), '弹窗角标应显示神秘宝箱奖励');
g.selectUpgrade(0);
assert.strictEqual(g.getSnapshot().state, 'paused', '选择宝箱强化后应自动触发安全暂停');

// 8e. ✨ 双倍得分 (double)
g.startGame();
g.setTestState({
  snake: [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }],
  direction: { x: 1, y: 0 },
  obstacles: [],
  powerUp: { x: 9, y: 10, type: 'double', ttl: 8, maxTtl: 9.5 },
  food: { x: 10, y: 10 }
});
g.stepGame(); // 走到 (9,10) 拾取双倍得分：+10 分，激活 8.0s 双倍
assert.strictEqual(g.getSnapshot().score, 10, '首次拾取双倍得分应获得基础 +10 分');
assert.strictEqual(g.getSnapshot().doubleTimer, 8.0, '拾取双倍得分应激活 8.0s 持续时间');
assert(env.getEl('buff-bar').innerHTML.includes('双倍'), 'Buff 栏应显示双倍得分状态胶囊');
g.stepGame(); // 走到 (10,10) 在双倍期间吃普通果实：10 * 2 = +20 分（总分 30）
assert.strictEqual(g.getSnapshot().score, 30, '双倍得分激活期间吃普通果实应获得 +20 分');

// 9. 校验全部 9 种道具与冻结特效的 Canvas 绘制栈平衡
g.startGame();
for (const type of Object.keys(g.POWERUP_TYPES)) {
  g.setTestState({
    freezeTimer: 1.5,
    doubleTimer: 3.0,
    ghostTimer: 2.0,
    powerUp: { x: 10, y: 10, type, ttl: 6, maxTtl: 9.5 }
  });
  g.renderScene(2000, 0.016);
  assert.strictEqual(env.getSaveDepth(), 0, `渲染道具 ${type} 后 Canvas save/restore 深度必须归零`);
}

// 10. 触发通关并验证无尽模式入口与跨 20 关继续挑战
g.startGame();
g.setTestState({ score: 950, food: null });
g.checkLevelUp(); // Lv.20 通关
assert.strictEqual(g.getSnapshot().state, 'won');
assert.strictEqual(env.getEl('run-summary').classList.contains('hidden'), false);
assert.strictEqual(env.getEl('endless-btn').classList.contains('hidden'), false, 'Lv.20 通关应显示无尽模式按钮');
assert.strictEqual(env.getEl('share-btn').classList.contains('hidden'), false);

// 选择继续无尽模式：恢复 running、补全食物、HUD 显示 ∞、可继续升至 Lv.21+
g.continueEndlessMode();
snap = g.getSnapshot();
assert.strictEqual(snap.state, 'running');
assert.strictEqual(snap.endlessMode, true);
assert(snap.food !== null, '进入无尽模式后必须确保场上存在食物');
assert.strictEqual(env.getEl('level-value').textContent, 'Lv.20 ∞');
assert.strictEqual(env.getEl('endless-btn').classList.contains('hidden'), true);
g.setTestState({ score: 1050 });
g.checkLevelUp();
assert.strictEqual(g.getSnapshot().level, 22, '无尽模式应可继续突破 Lv.20 升级');
assert.strictEqual(env.getEl('level-value').textContent, 'Lv.22 ∞');

// 再次重置验证复制战绩
g.startGame();
g.setTestState({ score: 950 });
g.checkLevelUp();

(async () => {
  await g.copyShareStats();
  assert(env.getClipboardText().includes('恭喜通关'), '复制战绩文本应包含通关信息');
  g.gameLoop(1500);
  assert.strictEqual(env.getSaveDepth(), 0, 'Canvas save/restore 深度必须归零');
  console.log('✓ 全部仓库模块自动化回归测试通过！（9种道具含Lv.3双倍得分 + 11x11炸弹 + 20关无尽模式）');
})();
