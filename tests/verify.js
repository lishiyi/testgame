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
      const defaultHidden = ['level-banner', 'upgrade-overlay', 'run-summary', 'share-btn', 'rock-drip-chip'];
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

  const storageMap = new Map();
  const sandbox = {
    console, Math, Date, Set, Map, Array, Object, String, Number, Boolean, JSON,
    parseInt, parseFloat, isNaN, setTimeout: (fn) => { fn(); return 1; }, clearTimeout() {},
    MutationObserver: class { observe() {} },
    performance: { now: () => 1000 },
    requestAnimationFrame: () => 1,
    navigator,
    localStorage: {
      getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
      setItem: (k, v) => { storageMap.set(k, String(v)); }
    },
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

const statusStripIdx = indexHtml.indexOf('class="status-strip"');
const boardStageIdx = indexHtml.indexOf('class="board-stage"');
const buffBarIdx = indexHtml.indexOf('id="buff-bar"');
const levelBannerIdx = indexHtml.indexOf('id="level-banner"');
const rockDripChipIdx = indexHtml.indexOf('id="rock-drip-chip"');
const progressStripIdx = indexHtml.indexOf('class="progress-strip"');
assert(
  progressStripIdx !== -1 && progressStripIdx < statusStripIdx &&
  statusStripIdx !== -1 &&
  buffBarIdx > statusStripIdx && buffBarIdx < boardStageIdx &&
  rockDripChipIdx > statusStripIdx && rockDripChipIdx < boardStageIdx &&
  levelBannerIdx > statusStripIdx && levelBannerIdx < boardStageIdx,
  'progress-strip 与含落石倒计时的 status-strip 应位于画布上方独立区域，不遮挡棋盘地面'
);

const combinedRepoCode = '"use strict";\n' + scriptPaths
  .map((rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8'))
  .join('\n') + `
  globalThis.__game = {
    SPEED_GAIN_PER_LEVEL,
    SLOW_UPGRADE_STEP,
    UPGRADE_EVERY_LEVELS,
    LEVEL_FREEZE_DURATION,
    COMBO_WINDOW,
    MAX_COMBO_COUNT,
    BERSERK_SPEED_BONUS,
    DIFFICULTY_CONFIG,
    ENDLESS_MUTATORS,
    POWERUP_TYPES,
    UPGRADE_POOL,
    RARITY_CONFIG,
    getPointsForNextLevel,
    getScoreForLevel,
    getLevelForScore,
    getFoodBasePoints,
    loadBestEndlessLevel,
    loadHardClearCount,
    setDifficulty,
    getRocksForLevel,
    getRockDripInterval,
    getEffectiveRockDripInterval,
    getBombDynamicWeight,
    getPowerUpWeight,
    registerRocksSmashed,
    applyPowerUp,
    getMaxObstacles,
    getPowerUpCooldown,
    isPowerUpEligible,
    pickWeightedUpgrades,
    rollEndlessMutator,
    triggerTimedRockDrop,
    startGame,
    continueEndlessMode,
    stepGame,
    updateTimers,
    updateHUD,
    renderRockDripChip,
    checkLevelUp,
    openNextUpgradeChoice,
    selectUpgrade,
    copyShareStats,
    gameLoop,
    renderScene,
    getSnapshot: () => JSON.parse(JSON.stringify({
      state, difficulty, hardClearCount, level, endlessMode, activeMutator, bestEndlessLevel, score, lives, maxLives, scoreMultiplier, buffBonusSec, slowUpgradeCount, baseStepInterval,
      snake, pendingGrowth, obstacles, food, powerUp, lastPowerUpType, invulnTimer, doubleTimer, shieldTimer, ghostTimer, freezeTimer,
      comboCount, comboTimer, hasPhaseBody, phaseBodyCooldown, hasLevelFreeze,
      nirvanaCharges, nirvanaUsed, shakeTimer, hitstopTimer,
      rocksSmashed, runElapsedSec, pickedUpgrades, pendingUpgradeLevels,
      blastExpertLevel, hasStoneFeast, stoneFeastProgress,
      hasGreedyMaw, extraFoodGrowth, hasBerserkRush,
      damageStats, lastHitCause, rockDripTimer, foodMoveTimer
    })),
    spawnPowerUp,
    setTestState: (patch) => {
      if (patch.level !== undefined) level = patch.level;
      if (patch.endlessMode !== undefined) endlessMode = patch.endlessMode;
      if (patch.activeMutator !== undefined) activeMutator = patch.activeMutator;
      if (patch.snake) snake = patch.snake;
      if (patch.pendingGrowth !== undefined) pendingGrowth = patch.pendingGrowth;
      if (patch.direction) { direction = patch.direction; directionQueue = []; }
      if (patch.score !== undefined) score = patch.score;
      if (patch.lives !== undefined) lives = patch.lives;
      if (patch.maxLives !== undefined) maxLives = patch.maxLives;
      if (patch.buffBonusSec !== undefined) buffBonusSec = patch.buffBonusSec;
      if (patch.doubleTimer !== undefined) doubleTimer = patch.doubleTimer;
      if (patch.shieldTimer !== undefined) shieldTimer = patch.shieldTimer;
      if (patch.ghostTimer !== undefined) ghostTimer = patch.ghostTimer;
      if (patch.freezeTimer !== undefined) freezeTimer = patch.freezeTimer;
      if (patch.invulnTimer !== undefined) invulnTimer = patch.invulnTimer;
      if (patch.phaseBodyCooldown !== undefined) phaseBodyCooldown = patch.phaseBodyCooldown;
      if (patch.obstacles !== undefined) obstacles = patch.obstacles;
      if (patch.powerUp !== undefined) powerUp = patch.powerUp;
      if (patch.lastPowerUpType !== undefined) lastPowerUpType = patch.lastPowerUpType;
      if (patch.food !== undefined) food = patch.food;
      if (patch.blastExpertLevel !== undefined) blastExpertLevel = patch.blastExpertLevel;
      if (patch.hasStoneFeast !== undefined) hasStoneFeast = patch.hasStoneFeast;
      if (patch.stoneFeastProgress !== undefined) stoneFeastProgress = patch.stoneFeastProgress;
      if (patch.hasGreedyMaw !== undefined) hasGreedyMaw = patch.hasGreedyMaw;
      if (patch.extraFoodGrowth !== undefined) extraFoodGrowth = patch.extraFoodGrowth;
      if (patch.hasBerserkRush !== undefined) hasBerserkRush = patch.hasBerserkRush;
      if (patch.comboUpgradeLevel !== undefined) comboUpgradeLevel = patch.comboUpgradeLevel;
      if (patch.comboCount !== undefined) comboCount = patch.comboCount;
      if (patch.comboTimer !== undefined) comboTimer = patch.comboTimer;
      if (patch.rockDripTimer !== undefined) rockDripTimer = patch.rockDripTimer;
      if (patch.foodMoveTimer !== undefined) foodMoveTimer = patch.foodMoveTimer;
    }
  };
`;

const env = createBrowserSandbox();
vm.createContext(env.sandbox);
vm.runInContext(combinedRepoCode, env.sandbox);
const g = env.sandbox.__game;

// 2. 校验分段升级门槛（60 / 90 / 130 / 160）、动态碎石上限与阶梯增量
assert.strictEqual(g.getPointsForNextLevel(1), 60);
assert.strictEqual(g.getPointsForNextLevel(5), 60);
assert.strictEqual(g.getPointsForNextLevel(6), 90);
assert.strictEqual(g.getPointsForNextLevel(12), 90);
assert.strictEqual(g.getPointsForNextLevel(13), 130);
assert.strictEqual(g.getPointsForNextLevel(19), 130);
assert.strictEqual(g.getPointsForNextLevel(20), 160);
assert.strictEqual(g.getScoreForLevel(1), 0);
assert.strictEqual(g.getScoreForLevel(6), 300);
assert.strictEqual(g.getScoreForLevel(13), 930);
assert.strictEqual(g.getScoreForLevel(18), 1580);
assert.strictEqual(g.getScoreForLevel(20), 1840);
assert.strictEqual(g.getScoreForLevel(21), 2000);
assert.strictEqual(g.getScoreForLevel(22), 2160);
assert.strictEqual(g.getLevelForScore(299), 5);
assert.strictEqual(g.getLevelForScore(300), 6);
assert.strictEqual(g.getLevelForScore(1840), 20);

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

// 定时落石：Lv.1–2 不落石，Lv.3–9 每 12s，Lv.10–14 每 9s，Lv.15+ 每 7s
assert.strictEqual(g.getRockDripInterval(1), 0);
assert.strictEqual(g.getRockDripInterval(2), 0);
assert.strictEqual(g.getRockDripInterval(3), 12);
assert.strictEqual(g.getRockDripInterval(9), 12);
assert.strictEqual(g.getRockDripInterval(10), 9);
assert.strictEqual(g.getRockDripInterval(14), 9);
assert.strictEqual(g.getRockDripInterval(15), 7);
assert.strictEqual(g.getRockDripInterval(25), 7);

g.startGame();
g.setTestState({ level: 2, powerUp: null });
const dripBase = g.getSnapshot().obstacles.length;
g.updateTimers(20);
assert.strictEqual(g.getSnapshot().obstacles.length, dripBase, 'Lv.2 不应定时落石');

g.startGame();
g.setTestState({ level: 3 });
const dripStart = g.getSnapshot().obstacles.length;
g.updateTimers(11.9);
assert.strictEqual(g.getSnapshot().obstacles.length, dripStart, '12s 未到不应落石');
g.updateTimers(0.2);
const afterDrip = g.getSnapshot().obstacles;
assert.strictEqual(afterDrip.length, dripStart + 1, 'Lv.3 满 12s 应落下 1 块石头');
const dripRock = afterDrip[afterDrip.length - 1];
assert(dripRock.warnTimer > 0, '定时落石应带红色预警');
const dripHead = g.getSnapshot().snake[0];
assert(Math.abs(dripRock.x - dripHead.x) + Math.abs(dripRock.y - dripHead.y) >= 5, '定时落石需距蛇头 ≥5 格');

g.startGame();
g.setTestState({ level: 3, freezeTimer: 30 });
const frozenStart = g.getSnapshot().obstacles.length;
g.updateTimers(13);
assert.strictEqual(g.getSnapshot().obstacles.length, frozenStart, '时停期间不计时落石');

g.startGame();
const capRocks = Array.from({ length: 18 }, (_, i) => ({ x: (i % 9) * 2 + 1, y: Math.floor(i / 9) * 2 + 1, warnTimer: 0 }));
const secondOldPos = `${capRocks[1].x},${capRocks[1].y}`;
g.setTestState({ level: 3, obstacles: capRocks });
g.updateTimers(12.5);
const relocatedSnap = g.getSnapshot();
assert.strictEqual(relocatedSnap.obstacles.length, 18, '达到上限后定时落石改为移石，维持 18 块上限');
assert.strictEqual(`${relocatedSnap.obstacles[0].x},${relocatedSnap.obstacles[0].y}`, secondOldPos, '应移除最早出现的第 0 块石头');
assert(relocatedSnap.obstacles[17].warnTimer > 0, '新挪动落下的石头应带 2.2s 红色预警');
assert.strictEqual(relocatedSnap.rocksSmashed, 0, '移石不应计入玩家击碎石头数');

// 达到满额 36 块后升级（非词缀关）不再显示红色落石警示
g.startGame();
const fullRocks = Array.from({ length: 36 }, (_, i) => ({ x: (i % 16) + 2, y: Math.floor(i / 16) + 2, warnTimer: 0 }));
g.setTestState({ obstacles: fullRocks, score: g.getScoreForLevel(14) }); // 升至 Lv.14
g.checkLevelUp();
assert.strictEqual(g.getSnapshot().level, 14);
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

// 5. 校验 9 种道具名称、等级解锁表（1, 2, 3, 4, 5, 6, 8, 10, 12）与防连续重复生成
assert.strictEqual(g.POWERUP_TYPES.gold.label, '金色果实', '金果名称应为 金色果实');
assert.strictEqual(g.POWERUP_TYPES.double.label, '双倍得分', '双倍道具名称应为 双倍得分');
assert.strictEqual(g.POWERUP_TYPES.double.color, 'hsl(39, 96%, 42%)', '双倍得分图标颜色应更深沉醒目');
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

// 6. 校验 16 张强化词条池（含 2 张双刃卡）、传说稀有度权重（稀有的一半）及核心数值
assert.strictEqual(g.UPGRADE_POOL.length, 16, '词条池应扩展为 16 项（含 2 张双刃卡）');
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
const cardPoolCounts = { common: 5, uncommon: 6, rare: 4, legendary: 1 };
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

// 校验 9 种道具刷新权重（炸弹权重降为 14）
assert.deepStrictEqual(
  Object.fromEntries(Object.entries(g.POWERUP_TYPES).map(([k, v]) => [k, v.weight])),
  { gold: 25, bomb: 14, double: 18, shield: 20, heart: 12, ice: 20, scissors: 15, ghost: 15, chest: 8 },
  '9 种道具权重应符合最新数值配置（炸弹权重 14）'
);

// 炸弹动态权重：以 4 块为基准，每多 4 块 +2，基础 14，最高 24
assert.strictEqual(g.getBombDynamicWeight(0), 14);
assert.strictEqual(g.getBombDynamicWeight(7), 14);
assert.strictEqual(g.getBombDynamicWeight(8), 16);
assert.strictEqual(g.getBombDynamicWeight(16), 20);
assert.strictEqual(g.getBombDynamicWeight(24), 24);
assert.strictEqual(g.getBombDynamicWeight(36), 24);
const mkRocks = (n) => Array.from({ length: n }, (_, i) => ({ x: i % 20, y: 19 - Math.floor(i / 20), warnTimer: 0 }));
g.startGame();
g.setTestState({ obstacles: mkRocks(16), blastExpertLevel: 0 });
assert.strictEqual(g.getPowerUpWeight('bomb'), 20);
assert.strictEqual(g.getPowerUpWeight('gold'), 25);
g.setTestState({ blastExpertLevel: 1 });
assert.strictEqual(g.getPowerUpWeight('bomb'), 30, '爆破专家 Lv.1 炸弹权重 ×1.5');

// 爆破专家：不可叠加，炸弹每块额外 +5
const blastCard = g.UPGRADE_POOL.find((u) => u.id === 'blast_expert');
assert.strictEqual(blastCard.rarity, 'uncommon');
g.startGame();
assert.strictEqual(blastCard.canPick(), true);
blastCard.apply();
assert.strictEqual(g.getSnapshot().blastExpertLevel, 1);
assert.strictEqual(blastCard.canPick(), false, '爆破专家不可叠加');
g.setTestState({
  snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
  obstacles: [{ x: 12, y: 12, warnTimer: 0 }, { x: 7, y: 7, warnTimer: 0 }, { x: 0, y: 0, warnTimer: 0 }],
  score: 0, doubleTimer: 0
});
g.applyPowerUp({ x: 10, y: 10, type: 'bomb' });
assert.strictEqual(g.getSnapshot().score, 10 + 2 * 10, '爆破专家：炸弹每块 5+5=10 分');

// 护盾撞碎岩石：计分并计入连击
g.startGame();
g.setTestState({
  snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
  direction: { x: 1, y: 0 },
  obstacles: [{ x: 11, y: 10, warnTimer: 0 }],
  food: { x: 0, y: 19 }, powerUp: null,
  shieldTimer: 5, score: 0, doubleTimer: 0,
  comboUpgradeLevel: 1, comboCount: 1, comboTimer: 3
});
g.stepGame();
let shieldSnap = g.getSnapshot();
assert.strictEqual(shieldSnap.obstacles.length, 0);
assert.strictEqual(shieldSnap.comboCount, 2, '护盾碎石应计入连击');
assert.strictEqual(shieldSnap.score, 5 + 4, '护盾碎石 5 分 + 连击 x2 额外 4 分');
assert(shieldSnap.comboTimer > 4.9, '护盾碎石应刷新连击窗口');

// 以石养身：稀有，每 18 块回 1 命；满血改为 +4s 护盾（可叠加）
const feastCard = g.UPGRADE_POOL.find((u) => u.id === 'stone_feast');
assert.strictEqual(feastCard.rarity, 'rare');
g.startGame();
feastCard.apply();
assert.strictEqual(feastCard.canPick(), false);
g.setTestState({ lives: 2, maxLives: 3, shieldTimer: 0 });
g.registerRocksSmashed(17);
assert.strictEqual(g.getSnapshot().lives, 2);
assert.strictEqual(g.getSnapshot().stoneFeastProgress, 17);
g.registerRocksSmashed(1);
assert.strictEqual(g.getSnapshot().lives, 3, '累计 18 块应回复 1 命');
assert.strictEqual(g.getSnapshot().stoneFeastProgress, 0);
g.registerRocksSmashed(20);
assert.strictEqual(g.getSnapshot().lives, 3);
assert.strictEqual(g.getSnapshot().shieldTimer, 4, '满血时改为获得 4s 护盾');
assert.strictEqual(g.getSnapshot().stoneFeastProgress, 2, '溢出进度应保留');
g.registerRocksSmashed(16);
assert.strictEqual(g.getSnapshot().shieldTimer, 8, '护盾奖励为叠加而非取较大值');
g.startGame();
g.registerRocksSmashed(30);
assert.strictEqual(g.getSnapshot().stoneFeastProgress, 0, '未持有卡牌时不累计进度');

// 校验「强健体魄」罕见、「圣盾赐福」罕见、「延时充能」+2s、「从容步伐」叠加上限 2 次、「碎石冲击」震碎 70%
assert.strictEqual(g.SPEED_GAIN_PER_LEVEL, 0.04, '每级速度提升应为 0.04');
assert.strictEqual(g.SLOW_UPGRADE_STEP, 0.2, '从容步伐每次应降低 0.2 速度倍率');
assert.strictEqual(g.COMBO_WINDOW, 5.0, '连击初始维持时间窗口应为 5.0s');
assert.strictEqual(g.UPGRADE_POOL.find((u) => u.id === 'max_hp').rarity, 'uncommon', '强健体魄稀有度应为罕见');
assert.strictEqual(g.UPGRADE_POOL.find((u) => u.id === 'instant_aegis').rarity, 'uncommon', '圣盾赐福稀有度应改为罕见');

const buffExtendCard = g.UPGRADE_POOL.find((u) => u.id === 'buff_extend');
assert(buffExtendCard.getDesc().includes('+2 秒'), '延时充能描述应为 +2 秒');
g.startGame();
buffExtendCard.apply();
assert.strictEqual(g.getSnapshot().buffBonusSec, 2, '延时充能单次应增加 2 秒增益时长');
buffExtendCard.apply();
buffExtendCard.apply();
assert.strictEqual(g.getSnapshot().buffBonusSec, 6, '延时充能叠满 3 次应为 6 秒');
assert.strictEqual(buffExtendCard.canPick(), false, '延时充能叠满 3 次后不可继续抽取');

const scoreCard = g.UPGRADE_POOL.find((u) => u.id === 'score_boost');
assert(scoreCard.getDesc().includes('+50%'), '黄金胃口描述应为 +50%');
g.startGame();
scoreCard.apply();
assert.strictEqual(g.getSnapshot().scoreMultiplier, 1.5, '黄金胃口单次应提升至 1.5x');

const slowCard = g.UPGRADE_POOL.find((u) => u.id === 'slow_pace');
g.startGame();
g.setTestState({ level: 10 });
slowCard.apply(); // 第 1 次
assert.strictEqual(g.getSnapshot().baseStepInterval, Math.round(140 / (1 + 9 * 0.04 - 0.2)), '从容步伐应永久降低 0.2 速度倍率');
assert.strictEqual(slowCard.canPick(), true, '从容步伐叠加 1 次后仍可抽取第 2 次');
slowCard.apply(); // 第 2 次
assert.strictEqual(slowCard.canPick(), false, '从容步伐最多叠加 2 次');

const quakeCard = g.UPGRADE_POOL.find((u) => u.id === 'quake_clear');
g.startGame();
g.setTestState({
  obstacles: Array.from({ length: 10 }, (_, i) => ({ x: 2 + i, y: 3, warnTimer: 0 }))
});
assert(quakeCard.getDesc().includes('70%'), '碎石冲击描述应包含 70%');
quakeCard.apply();
assert.strictEqual(g.getSnapshot().obstacles.length, 3, '10 块石头触发 70% 碎石冲击后应保留 3 块');
assert.strictEqual(g.getSnapshot().rocksSmashed, 7, '碎石冲击应计入被震碎的 7 块石头');
assert.strictEqual(g.getSnapshot().score, 35, '碎石冲击每块石头应 +5 分（7*5=35）');

const trimCard = g.UPGRADE_POOL.find((u) => u.id === 'trim_body');
g.startGame();
g.setTestState({ snake: Array.from({ length: 10 }, (_, i) => ({ x: 12 - i, y: 10 })) });
assert(trimCard.getDesc().includes('40%'), '断尾瘦身描述应为 40%');
trimCard.apply();
assert.strictEqual(g.getSnapshot().snake.length, 6, '10 节蛇身触发 40% 断尾瘦身应减至 6 节');

// 7. 校验新增 4 项强化卡：连击、时停、相位穿身、涅槃
// 7a. 连击 (combo_frenzy · 初始窗口 5.0s · 上限 5 层)
assert.strictEqual(g.MAX_COMBO_COUNT, 5, '连击上限应为 5 层');
g.startGame();
const comboCard = g.UPGRADE_POOL.find((u) => u.id === 'combo_frenzy');
assert(comboCard.getDesc().includes('5 层'), '连击描述应标明最高 5 层');
comboCard.apply();
g.setTestState({
  snake: [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }],
  direction: { x: 1, y: 0 },
  food: { x: 6, y: 10 },
  obstacles: []
});
g.stepGame(); // 第 1 颗苹果：+10，激活 5.0s 连击窗口
assert.strictEqual(g.getSnapshot().score, 10);
assert.strictEqual(g.getSnapshot().comboTimer, 5.0, '连击初始窗口应为 5.0s');
g.setTestState({ food: { x: 7, y: 10 } });
g.stepGame(); // 第 2 颗苹果（连击 x2）：+10 + 4 = 14 -> 总分 24
assert.strictEqual(g.getSnapshot().score, 24, '连击第 2 层应额外 +4 分');
g.setTestState({ food: { x: 8, y: 10 } });
g.stepGame(); // 第 3 颗苹果（连击 x3）：+10 + 8 = 18 -> 总分 42
assert.strictEqual(g.getSnapshot().score, 42, '连击第 3 层应额外 +8 分');
g.setTestState({ food: { x: 9, y: 10 } });
g.stepGame(); // 第 4 颗苹果（连击 x4）：+10 + 12 = 22 -> 总分 64
g.setTestState({ food: { x: 10, y: 10 } });
g.stepGame(); // 第 5 颗苹果（连击 x5 满层）：+10 + 16 = 26 -> 总分 90
assert.strictEqual(g.getSnapshot().comboCount, 5);
assert.strictEqual(g.getSnapshot().score, 90, '连击第 5 层应额外 +16 分');
g.setTestState({ food: { x: 11, y: 10 } });
g.stepGame(); // 第 6 颗苹果：封顶维持 x5（Lv.3 苹果基础仍 10 分 + 16 = 26 -> 总分 116）
assert.strictEqual(g.getSnapshot().comboCount, 5, '连续第 6 次吃果连击层数应封顶为 5 层');
assert.strictEqual(g.getSnapshot().score, 116, '封顶后仍按 5 层连击奖励 +16 结算');

// 7b. 时停 (level_freeze · 4.0s)
assert.strictEqual(g.LEVEL_FREEZE_DURATION, 4.0, '时停时长应延长为 4.0 秒');
g.startGame();
const freezeCard = g.UPGRADE_POOL.find((u) => u.id === 'level_freeze');
assert(freezeCard.getDesc().includes('4 秒'), '时停描述应包含 4 秒');
freezeCard.apply();
g.setTestState({
  score: 60,
  powerUp: { x: 12, y: 12, type: 'gold', ttl: 8.0, maxTtl: 9.5 }
});
g.checkLevelUp(); // 升至 Lv.2，触发 4 秒时停
snap = g.getSnapshot();
assert.strictEqual(snap.freezeTimer, 4.0, '升入新关应触发 4 秒时停');
const warnBefore = snap.obstacles.find((o) => o.warnTimer > 0).warnTimer;
g.updateTimers(1.0); // 时停期间推进 1 秒：预警与道具倒计时不应减少
snap = g.getSnapshot();
assert.strictEqual(snap.freezeTimer, 3.0);
assert.strictEqual(snap.obstacles.find((o) => o.warnTimer > 0).warnTimer, warnBefore, '时停期间落石预警应冻结');

// 7c. 相位穿身 (phase_body)：保留稀有度，每 10 秒充能 1 次，撞自身免伤并触发 2 秒幽灵脱困
g.startGame();
const phaseCard = g.UPGRADE_POOL.find((u) => u.id === 'phase_body');
assert.strictEqual(phaseCard.rarity, 'rare', '相位穿身保持稀有度');
phaseCard.apply();
assert.strictEqual(phaseCard.canPick(), false, '相位穿身不可重复抽取');
assert.strictEqual(g.getSnapshot().phaseBodyCooldown, 0, '获取相位穿身后立即就绪');

const selfTrapSnake = () => ([
  { x: 6, y: 6 },
  { x: 6, y: 7 },
  { x: 7, y: 7 },
  { x: 7, y: 6 },
  { x: 7, y: 5 },
  { x: 6, y: 5 }
]);

g.setTestState({
  level: 12,
  snake: selfTrapSnake(),
  direction: { x: 1, y: 0 },
  obstacles: [],
  food: { x: 18, y: 18 }
});
assert.strictEqual(g.isPowerUpEligible('ghost'), true, '冷却式相位穿身应保留 Lv.10+ 幽灵道具刷新');

// 1) 就绪时撞自身 -> 免伤 + 自动触发 2s 幽灵穿身 + 进入 10s 冷却
g.stepGame();
snap = g.getSnapshot();
assert.strictEqual(snap.lives, 3, '相位就绪撞自身不应扣血');
assert.strictEqual(snap.damageStats.self, 0, '相位脱困不应计入撞自身受击');
assert.strictEqual(snap.ghostTimer, 2.0, '触发相位脱困应获得 2 秒幽灵穿身窗口');
assert.strictEqual(snap.phaseBodyCooldown, 10.0, '触发后应进入 10 秒充能冷却');

// 2) 2 秒幽灵窗口内再次穿身 -> 安全脱困且不扣血
g.setTestState({
  snake: selfTrapSnake(),
  direction: { x: 1, y: 0 },
  obstacles: [],
  food: { x: 18, y: 18 }
});
g.stepGame();
snap = g.getSnapshot();
assert.strictEqual(snap.lives, 3, '2 秒幽灵脱困窗口内再次穿过自身不应扣血');
assert.strictEqual(snap.phaseBodyCooldown, 10.0, '幽灵窗口内穿身不应重置冷却');

// 3) 2.5 秒后幽灵失效但仍处于冷却（剩余 7.5s）-> 撞自身应正常扣血
g.updateTimers(2.5);
snap = g.getSnapshot();
assert.strictEqual(snap.ghostTimer, 0, '2.5 秒后幽灵脱困窗口应结束');
assert.strictEqual(snap.phaseBodyCooldown, 7.5, '冷却应倒计时至 7.5 秒');
g.setTestState({
  snake: selfTrapSnake(),
  direction: { x: 1, y: 0 },
  obstacles: [],
  food: { x: 18, y: 18 }
});
g.stepGame();
snap = g.getSnapshot();
assert.strictEqual(snap.lives, 2, '冷却期间撞自身应正常扣 1 点生命');
assert.strictEqual(snap.damageStats.self, 1, '冷却期间撞自身应记为 self 受击');

// 4) 再过 7.6 秒充能完毕且无敌结束 -> 再次撞自身可重新触发相位脱困
g.updateTimers(7.6);
snap = g.getSnapshot();
assert.strictEqual(snap.phaseBodyCooldown, 0, '10 秒后相位护体应重新就绪');
assert.strictEqual(snap.invulnTimer, 0);
g.setTestState({
  snake: selfTrapSnake(),
  direction: { x: 1, y: 0 },
  obstacles: [],
  food: { x: 18, y: 18 }
});
g.stepGame();
snap = g.getSnapshot();
assert.strictEqual(snap.lives, 2, '充能就绪后再次撞自身应免伤脱困');
assert.strictEqual(snap.ghostTimer, 2.0, '二次触发同样提供 2 秒幽灵窗口');
assert.strictEqual(snap.phaseBodyCooldown, 10.0, '二次触发后重新进入 10 秒冷却');

// 5) 身上已有幽灵道具且相位就绪时撞自身 -> 优先使用幽灵状态，不浪费相位充能
g.setTestState({
  snake: selfTrapSnake(),
  direction: { x: 1, y: 0 },
  obstacles: [],
  food: { x: 18, y: 18 },
  ghostTimer: 6.5,
  phaseBodyCooldown: 0
});
g.stepGame();
snap = g.getSnapshot();
assert.strictEqual(snap.lives, 2, '幽灵道具激活期间穿身不扣血');
assert.strictEqual(snap.phaseBodyCooldown, 0, '已有幽灵道具时穿身不应浪费相位护体充能');
assert.strictEqual(snap.ghostTimer, 6.5, '已有更长幽灵时长应保持不变');

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

// 8e. 双倍得分 (double)
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
assert(!env.getEl('buff-bar').innerHTML.includes('✨'), '双倍得分 Buff 胶囊不应再包含 ✨ 前缀');
g.stepGame(); // 走到 (10,10) 在双倍期间吃普通果实：10 * 2 = +20 分（总分 30）
assert.strictEqual(g.getSnapshot().score, 30, '双倍得分激活期间吃普通果实应获得 +20 分');

// 8f. 护盾时长 Math.max 保护（圣盾赐福 9s 期间吃 7.5s 护盾道具不倒扣）
g.startGame();
g.setTestState({
  snake: [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }],
  direction: { x: 1, y: 0 },
  obstacles: [],
  shieldTimer: 9.0,
  powerUp: { x: 9, y: 10, type: 'shield', ttl: 8, maxTtl: 9.5 },
  food: { x: 15, y: 15 }
});
g.stepGame();
assert.strictEqual(g.getSnapshot().shieldTimer, 9.0, '剩余 9s 护盾时拾取 7.5s 护盾道具不应截短剩余时长');

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

// 10. 触发通关并验证无尽模式入口与跨 20 关继续挑战（分段升级门槛）
g.startGame();
g.setTestState({ score: g.getScoreForLevel(20), food: null });
g.checkLevelUp(); // Lv.20 通关（1475 分）
assert.strictEqual(g.getSnapshot().state, 'won');
assert.strictEqual(env.getEl('run-summary').classList.contains('hidden'), false);
assert.strictEqual(env.getEl('endless-btn').classList.contains('hidden'), false, 'Lv.20 通关应显示无尽模式按钮');
assert.strictEqual(env.getEl('share-btn').classList.contains('hidden'), false);

// 选择继续无尽模式：恢复 running、补全食物、激活首个词缀、HUD 显示 ∞、每 5 关轮换词缀并记录最高无尽关卡
g.continueEndlessMode();
snap = g.getSnapshot();
assert.strictEqual(snap.state, 'running');
assert.strictEqual(snap.endlessMode, true);
assert(snap.food !== null, '进入无尽模式后必须确保场上存在食物');
assert(snap.activeMutator && g.ENDLESS_MUTATORS[snap.activeMutator], '进入无尽模式应立即激活一个场地词缀');
assert.strictEqual(snap.bestEndlessLevel, 20, '进入无尽模式应记录初始无尽最高关卡 Lv.20');
assert.strictEqual(g.loadBestEndlessLevel(), 20, '无尽最高关卡应持久化至 localStorage');
assert.strictEqual(env.getEl('level-value').textContent, 'Lv.20 ∞');
assert.strictEqual(env.getEl('endless-btn').classList.contains('hidden'), true);
const firstMutator = snap.activeMutator;
g.setTestState({ score: g.getScoreForLevel(25) });
g.checkLevelUp();
snap = g.getSnapshot();
assert.strictEqual(snap.level, 25, '无尽模式应可按分段门槛继续突破 Lv.20 升至 Lv.25');
assert.notStrictEqual(snap.activeMutator, firstMutator, '无尽模式每 5 关（Lv.25）应轮换为不同的场地词缀');
assert.strictEqual(snap.bestEndlessLevel, 25, '升至 Lv.25 应刷新无尽最高关卡纪录');
assert.strictEqual(g.loadBestEndlessLevel(), 25);

// 11. 校验苹果基础分随关卡增长、每 3 关强化、延时充能逐层延长停留时间、三大无尽词缀效果与 P3 信息提示
// 11a. 苹果基础分随关卡增长：Lv.1–4 为 10，每 4 关 +2，最高 24
assert.strictEqual(g.getFoodBasePoints(1), 10);
assert.strictEqual(g.getFoodBasePoints(4), 10);
assert.strictEqual(g.getFoodBasePoints(5), 12);
assert.strictEqual(g.getFoodBasePoints(9), 14);
assert.strictEqual(g.getFoodBasePoints(13), 16);
assert.strictEqual(g.getFoodBasePoints(17), 18);
assert.strictEqual(g.getFoodBasePoints(21), 20);
assert.strictEqual(g.getFoodBasePoints(29), 24);
assert.strictEqual(g.getFoodBasePoints(40), 24);

g.startGame();
const lv9Start = g.getScoreForLevel(9);
g.setTestState({
  level: 9,
  score: lv9Start,
  snake: [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }],
  direction: { x: 1, y: 0 },
  food: { x: 6, y: 10 },
  obstacles: [],
  powerUp: null
});
g.stepGame();
assert.strictEqual(g.getSnapshot().score - lv9Start, 14, 'Lv.9 吃普通苹果基础分应为 14 分');

// 11b. 强化改为每 3 关一次（Lv.3, 6, 9, 12, 15, 18...）
assert.strictEqual(g.UPGRADE_EVERY_LEVELS, 3, '强化触发间隔应改为每 3 关一次');
g.startGame();
assert.strictEqual(env.getEl('next-upgrade-hint').textContent, '下次强化 Lv.3');
g.setTestState({ score: g.getScoreForLevel(3) });
g.checkLevelUp();
assert.deepStrictEqual(g.getSnapshot().pendingUpgradeLevels, [3], '升至 Lv.3 应获得里程碑强化');
g.openNextUpgradeChoice();
assert.strictEqual(env.getEl('upgrade-badge').textContent, 'Lv.3 里程碑奖励');
g.selectUpgrade(0);
g.setTestState({ score: g.getScoreForLevel(4) });
g.checkLevelUp();
assert.deepStrictEqual(g.getSnapshot().pendingUpgradeLevels, [], '升至 Lv.4 不再触发旧版 4 关强化');

// 11c. 【延时充能】每层都延长场上道具停留时间（9.5s -> 11.5s -> 13.5s -> 15.5s）
g.startGame();
for (const [stacks, expectedTtl] of [[0, 9.5], [1, 11.5], [2, 13.5], [3, 15.5]]) {
  g.setTestState({ buffBonusSec: stacks * 2, powerUp: null });
  g.spawnPowerUp();
  assert.strictEqual(g.getSnapshot().powerUp.maxTtl, expectedTtl, `延时充能 ${stacks} 层时场上道具停留时间应为 ${expectedTtl}s`);
}

// 11d. 无尽模式三大场地词缀效果校验
// 游走果实 (moving_food)：吃苹果基础分 +6，每 3.5s 游走 1 格（蛇头紧邻时不逃跑）
g.startGame();
const lv21Start = g.getScoreForLevel(21);
g.setTestState({
  endlessMode: true,
  activeMutator: 'moving_food',
  level: 21,
  score: lv21Start,
  snake: [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }],
  direction: { x: 1, y: 0 },
  food: { x: 6, y: 10 },
  obstacles: [],
  powerUp: null
});
g.updateTimers(3.6); // 此时苹果 (6,10) 距蛇头 (5,10) 仅 1 格，不应逃跑
assert.deepStrictEqual(g.getSnapshot().food, { x: 6, y: 10 }, '蛇头紧邻苹果时游走果实不应贴脸逃跑');
g.stepGame(); // 吃下 Lv.21 游走苹果：20 + 6 = 26 分
assert.strictEqual(g.getSnapshot().score - lv21Start, 26, 'Lv.21 游走果实苹果基础分应为 20+6=26');
g.setTestState({ food: { x: 14, y: 14 }, foodMoveTimer: 0 });
g.updateTimers(3.6);
const movedFood = g.getSnapshot().food;
assert.strictEqual(Math.abs(movedFood.x - 14) + Math.abs(movedFood.y - 14), 1, '远离蛇头的游走果实满 3.5s 应向邻格移动 1 格');

// 双倍落石 (double_meteor)：落石间隔 ×0.7（7s -> 4.9s），每次落/移 2 块，炸弹基础权重 +6
g.startGame();
g.setTestState({
  endlessMode: true,
  activeMutator: 'double_meteor',
  level: 20,
  obstacles: [{ x: 2, y: 2, warnTimer: 0 }, { x: 17, y: 17, warnTimer: 0 }],
  blastExpertLevel: 0
});
assert.strictEqual(g.getEffectiveRockDripInterval(20), 4.9, '双倍落石词缀下 Lv.20 落石间隔应缩短至 4.9s');
assert.strictEqual(g.getPowerUpWeight('bomb'), 20, '双倍落石词缀下炸弹基础权重 14 + 6 = 20');
g.updateTimers(5.0);
assert.strictEqual(g.getSnapshot().obstacles.length, 4, '双倍落石词缀每次定时触发应落下 2 块石头');

// 碎石狂潮 (fragile_aegis)：拾取护盾时长减半，所有碎石基础分 ×2（5 -> 10）
g.startGame();
g.setTestState({
  endlessMode: true,
  activeMutator: 'fragile_aegis',
  level: 20,
  score: 0,
  shieldTimer: 0,
  buffBonusSec: 0,
  snake: [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }],
  direction: { x: 1, y: 0 },
  obstacles: [{ x: 10, y: 10, warnTimer: 0 }],
  powerUp: { x: 9, y: 10, type: 'shield', ttl: 8, maxTtl: 9.5 },
  food: { x: 18, y: 18 }
});
g.stepGame(); // 拾取护盾：+10 分，护盾时长 7.5 * 0.5 = 3.75s
assert.strictEqual(g.getSnapshot().shieldTimer, 3.75, '碎石狂潮词缀下拾取护盾道具时长应减半为 3.75s');
g.stepGame(); // 护盾撞碎 (10,10) 碎石：基础分 5*2 = +10 分（总分 20）
assert.strictEqual(g.getSnapshot().score, 20, '碎石狂潮词缀下护盾撞碎岩石应获得双倍基础分 10 分');

// 11e. P3 HUD 进度条、蛇长预警、落石倒计时胶囊与结算死因受击统计
g.startGame();
assert.strictEqual(env.getEl('next-level-hint').textContent, '距 Lv.2 还差 60 分');
assert.strictEqual(env.getEl('snake-len-value').textContent, '蛇长 3 节');
assert.strictEqual(env.getEl('rock-drip-chip').classList.contains('hidden'), true, 'Lv.1 不显示落石倒计时胶囊');

g.setTestState({
  level: 3,
  score: 150, // Lv.3 起始 120 分，再差 30 分升 Lv.4（进度 50%）
  snake: Array.from({ length: 32 }, (_, i) => ({ x: i % 20, y: Math.floor(i / 20) })),
  rockDripTimer: 10.0 // 距 12s 落石还剩 2.0s（imminent）
});
g.updateHUD();
g.renderRockDripChip();
assert.strictEqual(env.getEl('next-level-hint').textContent, '距 Lv.4 还差 30 分');
assert.strictEqual(env.getEl('level-progress-fill').style.width, '50%');
assert.strictEqual(env.getEl('snake-len-value').textContent, '蛇长 32 节');
assert.strictEqual(env.getEl('snake-len-value').classList.contains('warn'), true, '30 节以上蛇长应显示 warn 样式');
assert.strictEqual(env.getEl('rock-drip-chip').textContent, '🪨 落石 2.0s');
assert.strictEqual(env.getEl('rock-drip-chip').classList.contains('imminent'), true, '剩余 ≤2.5s 时落石胶囊应高亮 imminent');

// 触发撞墙 -> 撞石 -> 致命撞自身，校验结算死因与受击分类统计
g.startGame();
g.setTestState({
  lives: 3,
  snake: [{ x: 19, y: 10 }, { x: 18, y: 10 }, { x: 17, y: 10 }],
  direction: { x: 1, y: 0 },
  invulnTimer: 0,
  shieldTimer: 0
});
g.stepGame(); // 1) 撞墙 (lives: 2)
g.setTestState({
  snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
  direction: { x: 1, y: 0 },
  obstacles: [{ x: 11, y: 10, warnTimer: 0 }],
  food: { x: 0, y: 0 },
  invulnTimer: 0
});
g.stepGame(); // 2) 撞碎石 (lives: 1)
g.setTestState({
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
  invulnTimer: 0,
  ghostTimer: 0
});
g.stepGame(); // 3) 致命撞自身 (lives: 0 -> gameover)
snap = g.getSnapshot();
assert.strictEqual(snap.state, 'gameover');
assert.strictEqual(snap.lastHitCause, 'self');
assert.deepStrictEqual(snap.damageStats, { wall: 1, rock: 1, self: 1 });
const summaryHtml = env.getEl('run-summary').innerHTML;
assert(summaryHtml.includes('死因：撞自身'), '结算面板应明确显示致命死因');
assert(summaryHtml.includes('撞墙 1 · 撞石 1 · 撞自身 1'), '结算面板应显示受击分类统计');
assert(summaryHtml.includes('Lv.25'), '结算面板应显示持久化的无尽最高关卡纪录');

// 12. 校验主线高关卡词缀前置、双刃剑强化卡与标准/困难模式切换
// 12a. 标准模式主线 Lv.15 开启场地词缀（非无尽模式同样生效）
g.setDifficulty('standard');
g.startGame();
g.setTestState({ score: g.getScoreForLevel(14) });
g.checkLevelUp();
assert.strictEqual(g.getSnapshot().activeMutator, null, '标准模式 Lv.14 尚未激活主线词缀');
g.setTestState({ score: g.getScoreForLevel(15) });
g.checkLevelUp();
snap = g.getSnapshot();
assert.strictEqual(snap.endlessMode, false);
assert(snap.activeMutator && g.ENDLESS_MUTATORS[snap.activeMutator], '标准模式主线 Lv.15 应激活场地词缀');
assert(env.getEl('buff-bar').innerHTML.includes('词缀·'), '主线词缀应在状态条中展示');
assert(env.getEl('level-banner').textContent.includes('精英阶段·词缀激活'), '首次激活主线词缀应弹出精英阶段横幅');

// 校验主线（endlessMode=false）下词缀效果实际生效（碎石狂潮）
g.setTestState({
  activeMutator: 'fragile_aegis',
  endlessMode: false,
  shieldTimer: 0,
  buffBonusSec: 0,
  score: 0,
  snake: [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }],
  direction: { x: 1, y: 0 },
  obstacles: [{ x: 10, y: 10, warnTimer: 0 }],
  powerUp: { x: 9, y: 10, type: 'shield', ttl: 8, maxTtl: 9.5 },
  food: { x: 18, y: 18 }
});
g.stepGame();
assert.strictEqual(g.getSnapshot().shieldTimer, 3.75, '主线激活碎石狂潮时拾取护盾时长同样减半');
g.stepGame();
assert.strictEqual(g.getSnapshot().score, 20, '主线激活碎石狂潮时碎石基础分同样 ×2');

// 12b. 双刃剑强化卡「狂暴胃口」与「极速猎手」
const greedyCard = g.UPGRADE_POOL.find((u) => u.id === 'greedy_maw');
assert(greedyCard && greedyCard.rarity === 'uncommon' && greedyCard.isDoubleEdged === true, '狂暴胃口应为罕见双刃卡');
g.startGame();
greedyCard.apply();
assert.strictEqual(greedyCard.canPick(), false, '狂暴胃口不可叠加');
assert.strictEqual(g.getSnapshot().scoreMultiplier, 1.8, '狂暴胃口应使得分倍率 +0.8');
assert.strictEqual(g.getSnapshot().extraFoodGrowth, 1, '狂暴胃口代价：吃苹果额外多长 1 节');
// 验证与「黄金胃口」互不抢占叠加次数
assert.strictEqual(scoreCard.canPick(), true, '拿到狂暴胃口后黄金胃口仍可正常抽取');
g.setTestState({
  snake: [{ x: 5, y: 10 }, { x: 4, y: 10 }, { x: 3, y: 10 }],
  direction: { x: 1, y: 0 },
  food: { x: 6, y: 10 },
  obstacles: [],
  powerUp: null,
  score: 0
});
g.stepGame(); // 吃苹果：10 * 1.8 = 18 分，蛇身 3->4，pendingGrowth=1
assert.strictEqual(g.getSnapshot().score, 18, '狂暴胃口下 Lv.1 吃苹果应得 18 分');
assert.strictEqual(g.getSnapshot().snake.length, 4);
assert.strictEqual(g.getSnapshot().pendingGrowth, 1);
g.setTestState({ food: { x: 18, y: 18 } });
g.stepGame(); // 下一步消耗额外成长：蛇身 4->5
assert.strictEqual(g.getSnapshot().snake.length, 5, '狂暴胃口代价应使每颗苹果总计成长 2 节');

const berserkCard = g.UPGRADE_POOL.find((u) => u.id === 'berserk_rush');
assert(berserkCard && berserkCard.rarity === 'rare' && berserkCard.isDoubleEdged === true, '极速猎手应为稀有双刃卡');
g.startGame();
const speedBeforeBerserk = g.getSnapshot().baseStepInterval;
berserkCard.apply();
assert.strictEqual(berserkCard.canPick(), false, '极速猎手不可叠加');
assert(g.getSnapshot().baseStepInterval < speedBeforeBerserk, '极速猎手代价应永久加快移动速度');
assert.strictEqual(g.getSnapshot().baseStepInterval, Math.round(140 / 1.15), 'Lv.1 极速猎手速度倍率应为 1.15x');
// 极速猎手：护盾撞碎岩石双倍分 + 连击加分翻倍
g.setTestState({
  snake: [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }],
  direction: { x: 1, y: 0 },
  obstacles: [{ x: 9, y: 10, warnTimer: 0 }],
  food: { x: 18, y: 18 },
  powerUp: null,
  shieldTimer: 5,
  score: 0,
  comboUpgradeLevel: 1,
  comboCount: 1,
  comboTimer: 4
});
g.stepGame(); // 护盾撞碎岩石：基础 5*2=10 + 连击x2 (4*2=8) = 18 分
assert.strictEqual(g.getSnapshot().score, 18, '极速猎手下护盾碎石与连击加分应均翻倍（10+8=18）');

// 12c. 困难模式切换、属性生效与通关持久化
g.setDifficulty('hard');
g.startGame();
snap = g.getSnapshot();
assert.strictEqual(snap.difficulty, 'hard');
assert.strictEqual(snap.lives, 2, '困难模式初始生命应为 2');
assert.strictEqual(snap.maxLives, 2, '困难模式初始生命上限应为 2');
assert.strictEqual(env.getEl('mode-badge').classList.contains('hidden'), false, '困难模式应显示顶部困难徽章');
assert.strictEqual(snap.baseStepInterval, Math.round(140 / 1.08), '困难模式 Lv.1 基础速度应为 1.08x');
assert.strictEqual(g.getEffectiveRockDripInterval(3), 9.6, '困难模式 Lv.3 定时落石间隔应加快 20% 至 9.6s');

// 困难模式落石预警缩短为 1.5s，且 Lv.10 提前激活词缀、Lv.15 轮换
g.setTestState({ score: g.getScoreForLevel(10) });
g.checkLevelUp();
snap = g.getSnapshot();
assert(snap.activeMutator && g.ENDLESS_MUTATORS[snap.activeMutator], '困难模式应在主线 Lv.10 提前开启词缀');
const hardWarnRock = snap.obstacles.find((o) => o.warnTimer > 0);
assert.strictEqual(hardWarnRock.warnTimer, 1.5, '困难模式落石预警应缩短为 1.5s');
const hardFirstMut = snap.activeMutator;
g.setTestState({ score: g.getScoreForLevel(15) });
g.checkLevelUp();
assert.notStrictEqual(g.getSnapshot().activeMutator, hardFirstMut, '困难模式 Lv.15 应轮换为不同词缀');

// 困难模式通关 Lv.20：持久化困难通关次数，徽章显示 🏅，分享文本带 [困难模式]
g.setTestState({ score: g.getScoreForLevel(20) });
g.checkLevelUp();
assert.strictEqual(g.getSnapshot().state, 'won');
assert.strictEqual(g.getSnapshot().hardClearCount, 1, '困难模式通关应累加困难通关次数');
assert.strictEqual(g.loadHardClearCount(), 1, '困难模式通关次数应持久化至 localStorage');
assert(env.getEl('mode-hard-btn').textContent.includes('🏅'), '困难通关后模式按钮应点亮 🏅 徽章');

// 切回标准模式并验证通关战绩分享文本
(async () => {
  await g.copyShareStats();
  assert(env.getClipboardText().includes('[困难模式]'), '困难模式复制战绩应带 [困难模式] 标识');
  assert(env.getClipboardText().includes('恭喜通关'), '复制战绩文本应包含通关信息');
  assert(env.getClipboardText().includes('蛇长：'), '复制战绩文本应包含蛇长统计');
  assert(env.getClipboardText().includes('受击：'), '复制战绩文本应包含受击统计');

  g.setDifficulty('standard');
  g.startGame();
  assert.strictEqual(g.getSnapshot().lives, 3, '切回标准模式后应恢复 3 点生命');
  assert.strictEqual(env.getEl('mode-badge').classList.contains('hidden'), true, '切回标准模式后应隐藏困难徽章');

  g.gameLoop(1500);
  assert.strictEqual(env.getSaveDepth(), 0, 'Canvas save/restore 深度必须归零');
  console.log('✓ 全部仓库模块自动化回归测试通过！（60/90/130/160阶梯门槛 + 主线高关词缀 + 双刃强化卡 + 标准/困难模式切换）');
})();
