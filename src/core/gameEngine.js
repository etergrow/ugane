import { BASE_SCENE, SCENE_ITEMS } from "../config/sceneConfig.js";
import { loadImage, normalizeAnimationFrames, trimSpriteByAlpha } from "./imageUtils.js";

export class PointClickGame {
  constructor({ canvas, onHoverChange, onSelectChange, onItemClick, onLoadError }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.onHoverChange = onHoverChange;
    this.onSelectChange = onSelectChange;
    this.onItemClick = onItemClick;
    this.onLoadError = onLoadError;

    this.mapImage = null;
    this.items = [];
    this.hoveredItemId = null;
    this.selectedItemId = null;
    this.startTimestamp = performance.now();
    this.itemSeeds = new Map();

    this.animationFrameId = null;
    this.boundDraw = this.draw.bind(this);
    this.boundOnPointerMove = this.onPointerMove.bind(this);
    this.boundOnPointerLeave = this.onPointerLeave.bind(this);
    this.boundOnClick = this.onClick.bind(this);
    this.boundOnResize = this.onResize.bind(this);
  }

  async init() {
    try {
      await this.loadScene();
      this.attachEvents();
      this.onResize();
      this.animationFrameId = requestAnimationFrame(this.boundDraw);
    } catch (error) {
      if (this.onLoadError) {
        this.onLoadError(error);
      }
      throw error;
    }
  }

  async loadScene() {
    this.mapImage = await loadImage(BASE_SCENE.mapImage);

    const preparedItems = await Promise.all(
      SCENE_ITEMS.map(async (itemConfig) => {
        const isInteractive = itemConfig.interactive !== false;
        const drawWidth = itemConfig.width;

        if (Array.isArray(itemConfig.frames) && itemConfig.frames.length > 0) {
          const frameRawImages = await Promise.all(itemConfig.frames.map((src) => loadImage(src)));
          const trimmedFrames = frameRawImages.map((image) => trimSpriteByAlpha(image, 10));
          const normalized = normalizeAnimationFrames(trimmedFrames, {
            alignX: itemConfig.alignX,
            alignY: itemConfig.alignY,
            normalizeContentScale: itemConfig.normalizeContentScale,
            contentHeightStrategy: itemConfig.contentHeightStrategy,
          });
          const drawHeight = Math.round((normalized.height * drawWidth) / normalized.width);

          return {
            ...itemConfig,
            isInteractive,
            isAnimated: true,
            frameDurationMs: itemConfig.frameDurationMs ?? 140,
            drawWidth,
            drawHeight,
            animationWidth: normalized.width,
            animationHeight: normalized.height,
            animationFrames: normalized.frames.map((frame) => ({
              canvas: frame.canvas,
              pixels: frame.imageData.data,
            })),
          };
        }

        const rawImage = await loadImage(itemConfig.file);
        const trimmed = trimSpriteByAlpha(rawImage, 10);
        const drawHeight = Math.round((trimmed.height * drawWidth) / trimmed.width);

        return {
          ...itemConfig,
          isInteractive,
          isAnimated: false,
          drawWidth,
          drawHeight,
          sprite: trimmed.canvas,
          spritePixels: trimmed.imageData.data,
          spriteWidth: trimmed.width,
          spriteHeight: trimmed.height,
        };
      }),
    );

    this.items = preparedItems.sort((left, right) => left.z - right.z);
  }

  attachEvents() {
    this.canvas.addEventListener("pointermove", this.boundOnPointerMove);
    this.canvas.addEventListener("pointerleave", this.boundOnPointerLeave);
    this.canvas.addEventListener("click", this.boundOnClick);
    window.addEventListener("resize", this.boundOnResize);
  }

  onResize() {
    const pixelRatio = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();

    this.canvas.width = Math.floor(rect.width * pixelRatio);
    this.canvas.height = Math.floor(rect.height * pixelRatio);

    this.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
  }

  onPointerMove(event) {
    const point = this.getScenePoint(event);
    const hovered = this.findTopItemAt(point.x, point.y);
    this.hoveredItemId = hovered ? hovered.id : null;

    if (hovered) {
      this.canvas.style.cursor = "pointer";
      if (this.onHoverChange) {
        this.onHoverChange(`Наведение: ${hovered.name}`);
      }
    } else {
      this.canvas.style.cursor = "default";
      if (this.onHoverChange) {
        this.onHoverChange("Наведи курсор на объект, чтобы увидеть подсветку");
      }
    }
  }

  onPointerLeave() {
    this.hoveredItemId = null;
    this.canvas.style.cursor = "default";
    if (this.onHoverChange) {
      this.onHoverChange("Наведи курсор на объект, чтобы увидеть подсветку");
    }
  }

  onClick(event) {
    const point = this.getScenePoint(event);
    const clicked = this.findTopItemAt(point.x, point.y);

    if (!clicked) return;

    this.selectedItemId = clicked.id;
    if (this.onSelectChange) {
      this.onSelectChange(clicked.name);
    }
    if (this.onItemClick) {
      this.onItemClick({
        id: clicked.id,
        name: clicked.name,
      });
    }
  }

  getScenePoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = BASE_SCENE.width / rect.width;
    const scaleY = BASE_SCENE.height / rect.height;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  findTopItemAt(sceneX, sceneY) {
    // Проверяем элементы сверху вниз (по z-index), чтобы клик был по видимому верхнему слою.
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      const item = this.items[index];
      if (!item.isInteractive) {
        continue;
      }

      if (
        sceneX < item.x ||
        sceneX > item.x + item.drawWidth ||
        sceneY < item.y ||
        sceneY > item.y + item.drawHeight
      ) {
        continue;
      }

      const localX = Math.floor(((sceneX - item.x) / item.drawWidth) * this.getFrameWidth(item));
      const localY = Math.floor(((sceneY - item.y) / item.drawHeight) * this.getFrameHeight(item));

      if (localX < 0 || localX >= this.getFrameWidth(item) || localY < 0 || localY >= this.getFrameHeight(item)) {
        continue;
      }

      const alphaPixels = this.getFramePixels(item);
      const alpha = alphaPixels[(localY * this.getFrameWidth(item) + localX) * 4 + 3];

      if (alpha > 20) {
        return item;
      }
    }

    return null;
  }

  draw(timestamp) {
    const width = this.canvas.getBoundingClientRect().width;
    const height = this.canvas.getBoundingClientRect().height;

    this.ctx.clearRect(0, 0, width, height);
    this.ctx.drawImage(this.mapImage, 0, 0, width, height);

    const scaleX = width / BASE_SCENE.width;
    const scaleY = height / BASE_SCENE.height;
    const pulse = 0.65 + Math.sin(timestamp * 0.005) * 0.35;
    const elapsed = timestamp - this.startTimestamp;

    for (const item of this.items) {
      const dx = item.x * scaleX;
      const dy = item.y * scaleY;
      const dw = item.drawWidth * scaleX;
      const dh = item.drawHeight * scaleY;
      const isHovered = item.id === this.hoveredItemId;
      const isSelected = item.id === this.selectedItemId;
      const frameCanvas = this.getFrameCanvas(item, elapsed);

      if (isHovered || isSelected) {
        const glowPower = isSelected ? 1 : pulse;

        this.ctx.save();
        this.ctx.filter = [
          `brightness(${1.08 + glowPower * 0.1})`,
          "saturate(1.25)",
          `drop-shadow(0 0 ${10 + glowPower * 10}px rgba(82, 255, 219, 0.92))`,
          `drop-shadow(0 0 ${22 + glowPower * 16}px rgba(64, 176, 255, 0.66))`,
        ].join(" ");
        this.ctx.drawImage(frameCanvas, dx, dy, dw, dh);
        this.ctx.restore();
      } else {
        this.ctx.drawImage(frameCanvas, dx, dy, dw, dh);
      }

      this.renderDecorativeEffects(item, dx, dy, dw, dh, elapsed);
    }

    this.animationFrameId = requestAnimationFrame(this.boundDraw);
  }

  destroy() {
    cancelAnimationFrame(this.animationFrameId);
    this.canvas.removeEventListener("pointermove", this.boundOnPointerMove);
    this.canvas.removeEventListener("pointerleave", this.boundOnPointerLeave);
    this.canvas.removeEventListener("click", this.boundOnClick);
    window.removeEventListener("resize", this.boundOnResize);
  }

  getFrameIndex(item, elapsedMs = performance.now() - this.startTimestamp) {
    if (!item.isAnimated) return 0;
    const framesCount = item.animationFrames.length;
    const frameDuration = Math.max(1, item.frameDurationMs);
    return Math.floor(elapsedMs / frameDuration) % framesCount;
  }

  getFrameCanvas(item, elapsedMs) {
    if (!item.isAnimated) return item.sprite;
    return item.animationFrames[this.getFrameIndex(item, elapsedMs)].canvas;
  }

  getFramePixels(item) {
    if (!item.isAnimated) return item.spritePixels;
    return item.animationFrames[this.getFrameIndex(item)].pixels;
  }

  getFrameWidth(item) {
    if (!item.isAnimated) return item.spriteWidth;
    return item.animationWidth;
  }

  getFrameHeight(item) {
    if (!item.isAnimated) return item.spriteHeight;
    return item.animationHeight;
  }

  renderDecorativeEffects(item, dx, dy, dw, dh, elapsedMs) {
    if (!item.effect || !item.effect.type) return;

    switch (item.effect.type) {
      case "monitorActivity":
        this.renderMonitorActivityEffect(item, dx, dy, dw, dh, elapsedMs);
        break;
      case "neonBlink":
        this.renderNeonBlinkEffect(item, dx, dy, dw, dh, elapsedMs);
        break;
      case "pizzaSteam":
        this.renderPizzaSteamEffect(item, dx, dy, dw, dh, elapsedMs);
        break;
      case "serverSparks":
        this.renderServerSparksEffect(item, dx, dy, dw, dh, elapsedMs);
        break;
      default:
        break;
    }
  }

  renderMonitorActivityEffect(item, dx, dy, dw, dh, elapsedMs) {
    const effect = item.effect;
    const screens = effect.screens ?? [];

    for (const [screenIndex, screen] of screens.entries()) {
      const screenRect = this.getScreenRect(screen, dx, dy, dw, dh);
      this.ctx.save();
      this.clipToScreen(screen, dx, dy, dw, dh);

      const mode = screen.mode ?? "code";
      switch (mode) {
        case "windows":
          this.paintWindowsScreen(item, screen, screenIndex, screenRect, elapsedMs);
          break;
        case "game":
          this.paintGameScreen(item, screen, screenIndex, screenRect, elapsedMs);
          break;
        case "desktop":
          this.paintDesktopScreen(item, screen, screenIndex, screenRect, elapsedMs, true);
          break;
        case "desktopStatic":
          this.paintDesktopScreen(item, screen, screenIndex, screenRect, elapsedMs, false);
          break;
        case "alert":
          this.paintAlertScreen(item, screen, screenIndex, screenRect, elapsedMs);
          break;
        case "code":
        default:
          this.paintCodeScreen(item, screen, screenIndex, screenRect, elapsedMs);
          break;
      }

      // Небольшая прозрачная тень/блик для "стекла" монитора.
      this.ctx.fillStyle = "rgba(10, 12, 18, 0.08)";
      this.ctx.fillRect(screenRect.x, screenRect.y, screenRect.w, screenRect.h);
      this.ctx.restore();
    }
  }

  clipToScreen(screen, dx, dy, dw, dh) {
    // Для полигонов оставляем ручной контур, для x/y/w/h используем стабильный rect-клиппинг.
    if (!screen.points?.length) {
      const rect = this.getScreenRect(screen, dx, dy, dw, dh);
      this.ctx.beginPath();
      this.ctx.rect(rect.x, rect.y, rect.w, rect.h);
      this.ctx.clip();
      return;
    }

    this.ctx.beginPath();
    screen.points.forEach(([px, py], index) => {
      const x = dx + px * dw;
      const y = dy + py * dh;
      if (index === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    });
    this.ctx.closePath();
    this.ctx.clip();
  }

  getScreenRect(screen, dx, dy, dw, dh) {
    if (screen.points?.length) {
      const xValues = screen.points.map(([px]) => px);
      const yValues = screen.points.map(([, py]) => py);
      const minX = Math.min(...xValues);
      const maxX = Math.max(...xValues);
      const minY = Math.min(...yValues);
      const maxY = Math.max(...yValues);

      return {
        x: dx + minX * dw,
        y: dy + minY * dh,
        w: Math.max(1, (maxX - minX) * dw),
        h: Math.max(1, (maxY - minY) * dh),
      };
    }

    let x = screen.x ?? 0;
    let y = screen.y ?? 0;
    let w = screen.w ?? 0;
    let h = screen.h ?? 0;

    // Если ширина/высота ушли в минус, корректируем якорь, чтобы поведение оставалось предсказуемым.
    if (w < 0) {
      x += w;
      w = Math.abs(w);
    }

    if (h < 0) {
      y += h;
      h = Math.abs(h);
    }

    return {
      x: dx + x * dw,
      y: dy + y * dh,
      w: Math.max(1, w * dw),
      h: Math.max(1, h * dh),
    };
  }

  paintCodeScreen(item, screen, screenIndex, screenRect, elapsedMs) {
    const { x: dx, y: dy, w: dw, h: dh } = screenRect;
    const seed = this.getItemSeed(item) + screenIndex * 101;
    const gradient = this.ctx.createLinearGradient(dx, dy, dx, dy + dh);
    gradient.addColorStop(0, "rgba(10, 20, 12, 0.98)");
    gradient.addColorStop(1, "rgba(4, 10, 8, 0.98)");
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(dx, dy, dw, dh);

    const lines = screen.lines ?? 18;
    for (let row = 0; row < lines; row += 1) {
      const ny = row / lines;
      const jitter = (this.getCycleNoise(item, seed + row * 17 + Math.floor(elapsedMs / 130)) - 0.5) * dw * 0.06;
      const widthFactor = 0.2 + this.getCycleNoise(item, seed + row * 19) * 0.65;
      const x = dx + dw * 0.06 + jitter;
      const y = dy + dh * (0.08 + ny * 0.84);
      const w = dw * widthFactor;
      const alpha = 0.18 + this.getCycleNoise(item, seed + row * 23 + Math.floor(elapsedMs / 210)) * 0.52;

      this.ctx.fillStyle = `rgba(93, 255, 149, ${alpha.toFixed(3)})`;
      this.ctx.fillRect(x, y, w, Math.max(1, dh * 0.012));
    }

    const caretY = dy + ((elapsedMs / 14) % dh);
    this.ctx.fillStyle = "rgba(130, 255, 180, 0.85)";
    this.ctx.fillRect(dx + dw * 0.9, caretY, dw * 0.012, dh * 0.05);
  }

  paintWindowsScreen(item, screen, screenIndex, screenRect, elapsedMs) {
    const { x: dx, y: dy, w: dw, h: dh } = screenRect;
    const gradient = this.ctx.createLinearGradient(dx, dy, dx, dy + dh);
    gradient.addColorStop(0, "rgba(27, 54, 94, 0.98)");
    gradient.addColorStop(1, "rgba(9, 22, 48, 0.98)");
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(dx, dy, dw, dh);

    // "Окна" и панель задач
    this.ctx.fillStyle = "rgba(174, 214, 255, 0.16)";
    this.ctx.fillRect(dx + dw * 0.06, dy + dh * 0.1, dw * 0.4, dh * 0.34);
    this.ctx.fillRect(dx + dw * 0.52, dy + dh * 0.2, dw * 0.42, dh * 0.42);
    this.ctx.fillStyle = "rgba(80, 170, 255, 0.35)";
    this.ctx.fillRect(dx, dy + dh * 0.9, dw, dh * 0.1);

    const pulse = 0.45 + Math.sin((elapsedMs + screenIndex * 200) * 0.006) * 0.25;
    this.ctx.strokeStyle = `rgba(197, 233, 255, ${pulse})`;
    this.ctx.lineWidth = Math.max(1, dw * 0.008);
    this.ctx.strokeRect(dx + dw * 0.06, dy + dh * 0.1, dw * 0.4, dh * 0.34);
  }

  paintGameScreen(item, screen, screenIndex, screenRect, elapsedMs) {
    const { x: dx, y: dy, w: dw, h: dh } = screenRect;
    const gradient = this.ctx.createLinearGradient(dx, dy, dx, dy + dh);
    gradient.addColorStop(0, "rgba(52, 72, 108, 0.98)");
    gradient.addColorStop(0.55, "rgba(42, 58, 92, 0.98)");
    gradient.addColorStop(0.56, "rgba(78, 64, 49, 0.98)");
    gradient.addColorStop(1, "rgba(49, 38, 31, 0.98)");
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(dx, dy, dw, dh);

    // Легкий сдвиг камеры, чтобы добавить живость сцене FPS.
    const sway = Math.sin((elapsedMs + screenIndex * 170) * 0.0028);
    const camX = dx + sway * dw * 0.012;

    // Перспективные "коридорные" линии в стиле шутера.
    this.ctx.strokeStyle = "rgba(180, 170, 150, 0.22)";
    this.ctx.lineWidth = Math.max(1, dw * 0.006);
    for (let i = 0; i < 4; i += 1) {
      const t = i / 3;
      const left = camX + dw * (0.2 - t * 0.18);
      const right = camX + dw * (0.8 + t * 0.18);
      const y = dy + dh * (0.56 + t * 0.43);
      this.ctx.beginPath();
      this.ctx.moveTo(left, y);
      this.ctx.lineTo(right, y);
      this.ctx.stroke();
    }

    this.ctx.strokeStyle = "rgba(170, 165, 150, 0.18)";
    this.ctx.beginPath();
    this.ctx.moveTo(camX + dw * 0.12, dy + dh * 0.56);
    this.ctx.lineTo(camX - dw * 0.02, dy + dh * 0.98);
    this.ctx.moveTo(camX + dw * 0.88, dy + dh * 0.56);
    this.ctx.lineTo(camX + dw * 1.02, dy + dh * 0.98);
    this.ctx.stroke();

    // Силуэт оружия внизу экрана (вид от первого лица).
    this.ctx.fillStyle = "rgba(18, 22, 28, 0.92)";
    this.ctx.beginPath();
    this.ctx.moveTo(camX + dw * 0.54, dy + dh * 0.68);
    this.ctx.lineTo(camX + dw * 0.76, dy + dh * 0.73);
    this.ctx.lineTo(camX + dw * 0.94, dy + dh * 0.98);
    this.ctx.lineTo(camX + dw * 0.66, dy + dh * 0.98);
    this.ctx.lineTo(camX + dw * 0.48, dy + dh * 0.84);
    this.ctx.closePath();
    this.ctx.fill();

    // Противник вдали.
    const enemyPulse = 0.45 + Math.sin((elapsedMs + screenIndex * 90) * 0.006) * 0.2;
    this.ctx.fillStyle = `rgba(40, 40, 44, ${0.7 + enemyPulse * 0.2})`;
    this.ctx.fillRect(camX + dw * 0.47, dy + dh * 0.49, dw * 0.04, dh * 0.12);
    this.ctx.fillRect(camX + dw * 0.465, dy + dh * 0.61, dw * 0.02, dh * 0.06);
    this.ctx.fillRect(camX + dw * 0.495, dy + dh * 0.61, dw * 0.02, dh * 0.06);

    // Прицел по центру.
    const cx = camX + dw * 0.5;
    const cy = dy + dh * 0.52;
    this.ctx.strokeStyle = "rgba(133, 255, 150, 0.88)";
    this.ctx.lineWidth = Math.max(1, dw * 0.007);
    this.ctx.beginPath();
    this.ctx.moveTo(cx - dw * 0.032, cy);
    this.ctx.lineTo(cx - dw * 0.012, cy);
    this.ctx.moveTo(cx + dw * 0.012, cy);
    this.ctx.lineTo(cx + dw * 0.032, cy);
    this.ctx.moveTo(cx, cy - dh * 0.032);
    this.ctx.lineTo(cx, cy - dh * 0.012);
    this.ctx.moveTo(cx, cy + dh * 0.012);
    this.ctx.lineTo(cx, cy + dh * 0.032);
    this.ctx.stroke();

    // Небольшой HUD, чтобы читалось как Counter-Strike-подобный интерфейс.
    this.ctx.fillStyle = "rgba(9, 11, 14, 0.55)";
    this.ctx.fillRect(dx + dw * 0.03, dy + dh * 0.85, dw * 0.3, dh * 0.12);
    this.ctx.fillRect(dx + dw * 0.72, dy + dh * 0.85, dw * 0.25, dh * 0.12);

    this.ctx.fillStyle = "rgba(102, 245, 132, 0.95)";
    this.ctx.font = `${Math.max(7, Math.floor(dh * 0.13))}px monospace`;
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText("100 | 87", dx + dw * 0.05, dy + dh * 0.91);

    this.ctx.fillStyle = "rgba(255, 210, 92, 0.95)";
    this.ctx.textAlign = "right";
    this.ctx.fillText("$ 4250", dx + dw * 0.95, dy + dh * 0.91);
  }

  paintDesktopScreen(item, screen, screenIndex, screenRect, elapsedMs, animated = true) {
    const { x: dx, y: dy, w: dw, h: dh } = screenRect;
    const gradient = this.ctx.createLinearGradient(dx, dy, dx, dy + dh);
    gradient.addColorStop(0, "rgba(32, 44, 95, 0.95)");
    gradient.addColorStop(1, "rgba(13, 18, 34, 0.98)");
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(dx, dy, dw, dh);

    this.ctx.fillStyle = "rgba(188, 220, 255, 0.38)";
    const cols = 3;
    const rows = 2;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const iconX = dx + dw * (0.08 + c * 0.19);
        const iconY = dy + dh * (0.12 + r * 0.22);
        this.ctx.fillRect(iconX, iconY, dw * 0.06, dh * 0.09);
      }
    }

    const taskPulse = animated ? 0.3 + Math.sin((elapsedMs + screenIndex * 150) * 0.004) * 0.15 : 0.3;
    this.ctx.fillStyle = `rgba(125, 170, 255, ${taskPulse})`;
    this.ctx.fillRect(dx, dy + dh * 0.9, dw, dh * 0.1);
  }

  paintAlertScreen(item, screen, screenIndex, screenRect, elapsedMs) {
    const { x: dx, y: dy, w: dw, h: dh } = screenRect;
    const blink = 0.4 + Math.abs(Math.sin((elapsedMs + screenIndex * 120) * 0.014)) * 0.6;
    this.ctx.fillStyle = `rgba(78, 0, 0, ${0.88 + blink * 0.08})`;
    this.ctx.fillRect(dx, dy, dw, dh);

    this.ctx.fillStyle = `rgba(255, 48, 48, ${0.4 + blink * 0.6})`;
    this.ctx.fillRect(dx, dy, dw, dh * 0.2);
    this.ctx.fillStyle = `rgba(255, 18, 18, ${0.7 + blink * 0.3})`;
    this.ctx.font = `${Math.max(8, Math.floor(dh * 0.18))}px monospace`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText("ALERT", dx + dw * 0.5, dy + dh * 0.5);
  }

  renderNeonBlinkEffect(item, dx, dy, dw, dh, elapsedMs) {
    const effect = item.effect;
    const periodMs = effect.periodMs ?? 4300;
    const activeMs = effect.activeMs ?? 700;
    const cycle = Math.floor(elapsedMs / periodMs);
    const phase = elapsedMs % periodMs;
    const cycleNoise = this.getCycleNoise(item, cycle);

    let glowStrength = 0.08;
    if (cycleNoise > 0.48 && phase <= activeMs) {
      const flickerStep = Math.floor(phase / 60);
      const flickerNoise = this.getCycleNoise(item, cycle * 37 + flickerStep);
      glowStrength = flickerNoise > 0.38 ? 1 : 0.22;
    }

    this.ctx.save();
    this.ctx.globalAlpha = Math.min(1, glowStrength);
    this.ctx.filter = [
      `brightness(${1 + glowStrength * 0.38})`,
      `saturate(${1.2 + glowStrength * 0.45})`,
      `drop-shadow(0 0 ${6 + glowStrength * 12}px rgba(66, 243, 255, 0.9))`,
      `drop-shadow(0 0 ${12 + glowStrength * 18}px rgba(84, 154, 255, 0.7))`,
    ].join(" ");
    this.ctx.drawImage(this.getFrameCanvas(item, elapsedMs), dx, dy, dw, dh);
    this.ctx.restore();
  }

  renderPizzaSteamEffect(item, dx, dy, dw, dh, elapsedMs) {
    const effect = item.effect;
    const lifeMs = effect.lifeMs ?? 2400;
    const anchors = effect.anchors ?? [{ x: 0.35, y: 0.3, plumes: 4 }];

    this.ctx.save();
    this.ctx.globalCompositeOperation = "screen";

    for (const anchor of anchors) {
      const plumes = anchor.plumes ?? 3;
      for (let index = 0; index < plumes; index += 1) {
        const phase = ((elapsedMs + index * 420) % lifeMs) / lifeMs;
        const sway = Math.sin((elapsedMs / 430) + index) * dw * 0.01;
        const x = dx + dw * anchor.x + sway + (index - (plumes - 1) / 2) * dw * 0.012;
        const y = dy + dh * anchor.y - phase * dh * 0.2;
        const radius = Math.max(2, dw * (0.01 + phase * 0.018));
        const alpha = Math.max(0, 0.26 * (1 - phase));

        const gradient = this.ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius);
        gradient.addColorStop(0, `rgba(250, 250, 250, ${alpha})`);
        gradient.addColorStop(1, "rgba(250, 250, 250, 0)");
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    this.ctx.restore();
  }

  renderServerSparksEffect(item, dx, dy, dw, dh, elapsedMs) {
    const effect = item.effect;
    const periodMs = effect.periodMs ?? 3600;
    const burstMs = effect.burstMs ?? 360;
    const sizeScale = effect.sizeScale ?? 1;
    const cycle = Math.floor(elapsedMs / periodMs);
    const phase = elapsedMs % periodMs;

    if (this.getCycleNoise(item, cycle) < 0.55 || phase > burstMs) {
      return;
    }

    const anchorX = effect.anchorX ?? 0.55;
    const anchorY = effect.anchorY ?? 0.08;
    const sparks = effect.sparks ?? 4;

    this.ctx.save();
    this.ctx.globalCompositeOperation = "screen";
    this.ctx.lineCap = "round";

    for (let index = 0; index < sparks; index += 1) {
      const local = ((phase + index * 75) % burstMs) / burstMs;
      const power = 1 - local;
      const alpha = 0.15 + power * 0.85;
      const length = dh * (0.015 + power * 0.03) * sizeScale;
      const spread = (this.getCycleNoise(item, cycle * 29 + index) - 0.5) * 1.35;

      const sx = dx + dw * anchorX + (this.getCycleNoise(item, cycle * 13 + index) - 0.5) * dw * 0.02;
      const sy = dy + dh * anchorY + (this.getCycleNoise(item, cycle * 17 + index) - 0.5) * dh * 0.01;
      const ex = sx + Math.cos(spread) * length;
      const ey = sy - Math.abs(Math.sin(spread)) * length;

      this.ctx.strokeStyle = `rgba(255, 220, 120, ${alpha})`;
      this.ctx.lineWidth = Math.max(1, dw * 0.0045 * sizeScale);
      this.ctx.beginPath();
      this.ctx.moveTo(sx, sy);
      this.ctx.lineTo(ex, ey);
      this.ctx.stroke();

      this.ctx.fillStyle = `rgba(255, 245, 190, ${alpha * 0.9})`;
      this.ctx.beginPath();
      this.ctx.arc(sx, sy, Math.max(1, dw * 0.0035 * sizeScale), 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  getCycleNoise(item, value) {
    const seed = this.getItemSeed(item);
    const x = Math.sin(seed * 0.173 + value * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  getItemSeed(item) {
    if (this.itemSeeds.has(item.id)) {
      return this.itemSeeds.get(item.id);
    }

    const seed = Array.from(item.id).reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0);
    this.itemSeeds.set(item.id, seed);
    return seed;
  }
}
