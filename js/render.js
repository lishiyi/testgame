// ==========================================
// 画布高清适配与场景渲染模块
// ==========================================

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

function setupCanvasResolution() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = BASE_SIZE * dpr;
  canvas.height = BASE_SIZE * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
setupCanvasResolution();

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

  // 时停冻结光效边框（最后 1.2s 闪烁预警）
  if (freezeTimer > 0) {
    const freezeAlpha = freezeTimer < 1.2 ? (Math.sin(timestamp * 0.03) > 0 ? 0.85 : 0.2) : 0.72;
    ctx.save();
    ctx.strokeStyle = `hsla(202, 96%, 68%, ${freezeAlpha})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(2.5, 2.5, BASE_SIZE - 5, BASE_SIZE - 5);
    ctx.restore();
  }

  // 寒冰减速边框反馈（最后 1.5s 闪烁预警即将恢复原速）
  if (iceTimer > 0 && freezeTimer <= 0) {
    const iceAlpha = iceTimer < 1.5 ? (Math.sin(timestamp * 0.028) > 0 ? 0.78 : 0.18) : 0.42;
    ctx.save();
    ctx.strokeStyle = `hsla(196, 92%, 64%, ${iceAlpha})`;
    ctx.lineWidth = 2.4;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(2, 2, BASE_SIZE - 4, BASE_SIZE - 4);
    ctx.restore();
  }

  // 幽灵相位边框反馈（最后 1.0s 快速闪烁预警即将恢复自身碰撞）
  if (ghostTimer > 0) {
    const ghostAlpha = ghostTimer < 1.0 ? (Math.sin(timestamp * 0.038) > 0 ? 0.86 : 0.16) : 0.48;
    ctx.save();
    ctx.strokeStyle = `hsla(258, 92%, 76%, ${ghostAlpha})`;
    ctx.lineWidth = 2.2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(4.5, 4.5, BASE_SIZE - 9, BASE_SIZE - 9);
    ctx.restore();
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

  // 受击瞬间棋盘边缘红光反馈
  if (shakeTimer > 0.06) {
    const alpha = Math.min(0.7, (shakeTimer / SHAKE_DURATION) * 0.65);
    ctx.save();
    ctx.strokeStyle = `hsla(356, 95%, 60%, ${alpha.toFixed(2)})`;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, BASE_SIZE - 4, BASE_SIZE - 4);
    ctx.restore();
  }
}

function drawObstacles(timestamp) {
  for (const obs of obstacles) {
    const x = obs.x * CELL_SIZE;
    const y = obs.y * CELL_SIZE;

    if (obs.warnTimer > 0) {
      const pulse = freezeTimer > 0 ? 0.5 : 0.5 + 0.5 * Math.sin(timestamp * 0.018);
      const fillAlpha = 0.12 + 0.28 * pulse;
      const strokeAlpha = 0.45 + 0.55 * pulse;
      const warnHue = freezeTimer > 0 ? 200 : 356;
      ctx.save();
      ctx.fillStyle = `hsla(${warnHue}, 92%, 56%, ${fillAlpha})`;
      ctx.fillRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4);
      ctx.strokeStyle = `hsla(${warnHue}, 96%, 64%, ${strokeAlpha})`;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x + 2.5, y + 2.5, CELL_SIZE - 5, CELL_SIZE - 5);

      ctx.fillStyle = `hsla(${warnHue}, 100%, 76%, ${strokeAlpha})`;
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(freezeTimer > 0 ? '❄' : '!', x + CELL_SIZE / 2, y + CELL_SIZE / 2 + 0.5);
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
  } else if (powerUp.type === 'double') {
    // 双倍得分：深琥珀金四角主星芒（带深色描边）+ 右上副星芒
    const r = CELL_SIZE * 0.33 * pulse;
    const inner = r * 0.34;
    ctx.fillStyle = 'hsl(39, 96%, 42%)';
    ctx.strokeStyle = 'hsl(28, 90%, 24%)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = -Math.PI / 2 + (Math.PI / 4) * i;
      const rad = i % 2 === 0 ? r : inner;
      const px = cx - 0.8 + Math.cos(ang) * rad;
      const py = cy + 0.6 + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'hsla(44, 100%, 66%, 0.72)';
    ctx.beginPath();
    ctx.arc(cx - 0.8, cy + 0.6, r * 0.14, 0, Math.PI * 2);
    ctx.fill();

    const sr = CELL_SIZE * 0.14 * pulse;
    const sx = cx + r * 0.58;
    const sy = cy - r * 0.56;
    ctx.fillStyle = 'hsl(36, 94%, 44%)';
    ctx.beginPath();
    ctx.moveTo(sx, sy - sr);
    ctx.lineTo(sx + sr * 0.35, sy - sr * 0.35);
    ctx.lineTo(sx + sr, sy);
    ctx.lineTo(sx + sr * 0.35, sy + sr * 0.35);
    ctx.lineTo(sx, sy + sr);
    ctx.lineTo(sx - sr * 0.35, sy + sr * 0.35);
    ctx.lineTo(sx - sr, sy);
    ctx.lineTo(sx - sr * 0.35, sy - sr * 0.35);
    ctx.closePath();
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
  } else if (powerUp.type === 'bomb') {
    // 爆破炸弹：深炭圆球 + 橙红导火索火花
    const r = CELL_SIZE * 0.27 * pulse;
    ctx.fillStyle = 'hsl(220, 12%, 22%)';
    ctx.beginPath();
    ctx.arc(cx - 0.5, cy + 1.5, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'hsl(25, 95%, 62%)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.45, cy - r * 0.45);
    ctx.quadraticCurveTo(cx + r * 0.9, cy - r * 1.1, cx + r * 1.15, cy - r * 0.85);
    ctx.stroke();
    const sparkR = 1.8 + (Math.sin(timestamp * 0.03) + 1) * 0.7;
    ctx.fillStyle = 'hsl(42, 100%, 66%)';
    ctx.beginPath();
    ctx.arc(cx + r * 1.15, cy - r * 0.85, sparkR, 0, Math.PI * 2);
    ctx.fill();
  } else if (powerUp.type === 'scissors') {
    // 缩身剪刀：深钴蓝双交叉刀刃 + 双圆指环
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(pulse, pulse);
    ctx.strokeStyle = 'hsl(220, 82%, 48%)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-4.2, 2.5);
    ctx.lineTo(4.6, -5);
    ctx.moveTo(4.2, 2.5);
    ctx.lineTo(-4.6, -5);
    ctx.stroke();
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(-3.5, 4, 2.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(3.5, 4, 2.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (powerUp.type === 'ghost') {
    // 幽灵相位：半透明淡紫圆拱 + 波浪裙摆 + 双眼
    const r = CELL_SIZE * 0.28 * pulse;
    ctx.fillStyle = 'hsla(258, 92%, 80%, 0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy - 1.2, r, Math.PI, 0);
    ctx.lineTo(cx + r, cy + r * 0.95);
    ctx.lineTo(cx + r * 0.35, cy + r * 0.55);
    ctx.lineTo(cx, cy + r * 0.95);
    ctx.lineTo(cx - r * 0.35, cy + r * 0.55);
    ctx.lineTo(cx - r, cy + r * 0.95);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'hsl(258, 45%, 18%)';
    ctx.beginPath();
    ctx.arc(cx - 2.1, cy - 1.2, 1.3, 0, Math.PI * 2);
    ctx.arc(cx + 2.1, cy - 1.2, 1.3, 0, Math.PI * 2);
    ctx.fill();
  } else if (powerUp.type === 'chest') {
    // 神秘宝箱：橙金宝箱 + 深棕分界线 + 亮金锁扣
    const w = CELL_SIZE * 0.56 * pulse;
    const h = CELL_SIZE * 0.46 * pulse;
    ctx.fillStyle = 'hsl(28, 92%, 50%)';
    drawRoundedRect(cx - w / 2, cy - h / 2 + 0.5, w, h, 2.5);
    ctx.fillStyle = 'hsl(38, 98%, 62%)';
    drawRoundedRect(cx - w / 2, cy - h / 2 + 0.5, w, h * 0.45, 2.5);
    ctx.fillStyle = 'hsl(24, 50%, 20%)';
    ctx.fillRect(cx - w / 2, cy - 0.6, w, 1.4);
    ctx.fillStyle = 'hsl(48, 100%, 74%)';
    ctx.fillRect(cx - 1.8, cy - 2.0, 3.6, 3.8);
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

function drawSnake(timestamp) {
  const total = snake.length;
  const isPhase = (hasPhaseBody && phaseBodyCooldown <= 0) || ghostTimer > 0;
  const iceExpiringBlink = iceTimer > 0 && iceTimer < 1.5 && Math.sin(timestamp * 0.028) < 0;
  const ghostExpiringBlink = ghostTimer > 0 && ghostTimer < 1.0 && Math.sin(timestamp * 0.038) < 0;
  const hue = (iceTimer > 0 && !iceExpiringBlink)
    ? 178
    : ((ghostTimer > 0 && !ghostExpiringBlink) ? 256 : 152);
  const invulnFlash = invulnTimer > 0 && Math.sin(timestamp * 0.03) < 0;

  if (magnetLevel > 0 && snake.length > 0) {
    const hx = (snake[0].x + 0.5) * CELL_SIZE;
    const hy = (snake[0].y + 0.5) * CELL_SIZE;
    ctx.save();
    ctx.strokeStyle = 'hsla(276, 92%, 72%, 0.28)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(hx, hy, CELL_SIZE * 1.45, 0, Math.PI * 2);
    ctx.stroke();
    if (magnetLevel >= 2) {
      ctx.strokeStyle = 'hsla(43, 96%, 64%, 0.24)';
      ctx.lineWidth = 1.1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(hx, hy, CELL_SIZE * 2.35, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.save();
  if (invulnFlash) {
    ctx.globalAlpha = 0.42;
  } else if (ghostTimer > 0) {
    ctx.globalAlpha = ghostExpiringBlink ? 0.96 : 0.72;
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
    } else if (isPhase && !ghostExpiringBlink && !isHead && i % 2 === 1) {
      ctx.strokeStyle = 'hsla(262, 92%, 78%, 0.55)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.roundRect(seg.x * CELL_SIZE + pad, seg.y * CELL_SIZE + pad, size, size, radius);
      ctx.stroke();
    }

    if (isHead) {
      drawSnakeEyes(seg);
    }
  }
  ctx.restore();
}

// 选完强化后的透视准备态：在蛇头前方绘制脉冲方向指示箭头，帮助一眼确认当前朝向
function drawPostUpgradeDirectionHint(timestamp) {
  if (state !== 'paused' || !isPostUpgradeReady || snake.length === 0) return;
  const head = snake[0];
  const pulse = 0.5 + 0.5 * Math.sin(timestamp * 0.008);
  const hx = (head.x + 0.5) * CELL_SIZE;
  const hy = (head.y + 0.5) * CELL_SIZE;
  const dist = CELL_SIZE * (0.95 + pulse * 0.25);
  const tipX = hx + direction.x * (dist + 6);
  const tipY = hy + direction.y * (dist + 6);
  const baseX = hx + direction.x * (dist - 2);
  const baseY = hy + direction.y * (dist - 2);
  const perpX = -direction.y * 5.5;
  const perpY = direction.x * 5.5;

  ctx.save();
  ctx.fillStyle = `hsla(43, 100%, 66%, ${(0.65 + pulse * 0.35).toFixed(2)})`;
  ctx.strokeStyle = 'hsla(150, 20%, 8%, 0.85)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(baseX + perpX, baseY + perpY);
  ctx.lineTo(baseX - perpX, baseY - perpY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
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

function renderScene(timestamp, dtSeconds) {
  ctx.clearRect(0, 0, BASE_SIZE, BASE_SIZE);
  ctx.save();

  if (shakeTimer > 0) {
    const amp = (shakeTimer / SHAKE_DURATION) * 4.2;
    const ox = Math.sin(timestamp * 0.095) * amp;
    const oy = Math.cos(timestamp * 0.115) * amp;
    ctx.translate(ox, oy);
  }

  drawBoard(timestamp);
  drawObstacles(timestamp);
  drawFood(timestamp);
  drawPowerUp(timestamp);
  drawSnake(timestamp);
  drawPostUpgradeDirectionHint(timestamp);
  updateAndDrawEffects(dtSeconds);

  ctx.restore();
}
