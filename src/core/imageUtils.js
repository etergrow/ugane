// Приводит путь к изображению к абсолютному, если это локальный ассет.
export function resolveAssetPath(src) {
  if (!src) return src;
  if (/^(https?:)?\/\//i.test(src)) return src;
  if (src.startsWith("data:")) return src;
  if (src.startsWith("/")) return src;
  return `/${src}`;
}

// Загружает изображение и возвращает готовый HTMLImageElement.
export function loadImage(src) {
  const resolvedSrc = resolveAssetPath(src);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Не удалось загрузить изображение: ${resolvedSrc}`));
    image.src = resolvedSrc;
  });
}

// Обрезает прозрачные края по порогу альфа-канала, чтобы точнее работать с кликами.
export function trimSpriteByAlpha(image, alphaThreshold = 10) {
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = image.width;
  sourceCanvas.height = image.height;

  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  sourceCtx.drawImage(image, 0, 0);

  const sourceImageData = sourceCtx.getImageData(0, 0, image.width, image.height);
  const pixels = sourceImageData.data;

  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const alpha = pixels[(y * image.width + x) * 4 + 3];

      if (alpha >= alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return {
      canvas: sourceCanvas,
      imageData: sourceImageData,
      width: image.width,
      height: image.height,
    };
  }

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const trimmedCanvas = document.createElement("canvas");
  trimmedCanvas.width = width;
  trimmedCanvas.height = height;

  const trimmedCtx = trimmedCanvas.getContext("2d", { willReadFrequently: true });
  trimmedCtx.drawImage(sourceCanvas, minX, minY, width, height, 0, 0, width, height);
  const trimmedData = trimmedCtx.getImageData(0, 0, width, height);

  return {
    canvas: trimmedCanvas,
    imageData: trimmedData,
    width,
    height,
  };
}

// Нормализует кадры анимации к единому размеру холста.
// Выравнивание идёт по нижнему краю и по центру, чтобы персонаж "стоял" на месте.
export function normalizeAnimationFrames(frames, options = {}) {
  const alignX = options.alignX ?? "center";
  const alignY = options.alignY ?? "bottom";
  const normalizeContentScale = options.normalizeContentScale ?? false;

  const preparedFrames = normalizeContentScale
    ? scaleFramesToUniformHeight(frames, options.contentHeightStrategy ?? "max")
    : frames;

  const maxWidth = Math.max(...preparedFrames.map((frame) => frame.width));
  const maxHeight = Math.max(...preparedFrames.map((frame) => frame.height));

  const normalizedFrames = preparedFrames.map((frame) => {
    const canvas = document.createElement("canvas");
    canvas.width = maxWidth;
    canvas.height = maxHeight;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let offsetX = Math.floor((maxWidth - frame.width) / 2);
    let offsetY = maxHeight - frame.height;

    if (alignX === "left") {
      offsetX = 0;
    } else if (alignX === "right") {
      offsetX = maxWidth - frame.width;
    }

    if (alignY === "top") {
      offsetY = 0;
    } else if (alignY === "center") {
      offsetY = Math.floor((maxHeight - frame.height) / 2);
    }

    ctx.drawImage(frame.canvas, offsetX, offsetY);

    return {
      canvas,
      imageData: ctx.getImageData(0, 0, maxWidth, maxHeight),
      width: maxWidth,
      height: maxHeight,
    };
  });

  return {
    width: maxWidth,
    height: maxHeight,
    frames: normalizedFrames,
  };
}

// Масштабирует кадры к единой высоте контента, чтобы убрать визуальное "прыгание" размера.
function scaleFramesToUniformHeight(frames, strategy) {
  const heights = frames.map((frame) => frame.height);
  const maxHeight = Math.max(...heights);
  const minHeight = Math.min(...heights);
  const avgHeight = Math.round(heights.reduce((sum, value) => sum + value, 0) / heights.length);

  let targetHeight = maxHeight;
  if (strategy === "min") targetHeight = minHeight;
  if (strategy === "average") targetHeight = avgHeight;

  return frames.map((frame) => {
    if (frame.height === targetHeight) return frame;

    const ratio = targetHeight / frame.height;
    const scaledWidth = Math.max(1, Math.round(frame.width * ratio));
    const scaledHeight = targetHeight;

    const scaledCanvas = document.createElement("canvas");
    scaledCanvas.width = scaledWidth;
    scaledCanvas.height = scaledHeight;
    const scaledCtx = scaledCanvas.getContext("2d", { willReadFrequently: true });
    scaledCtx.drawImage(frame.canvas, 0, 0, scaledWidth, scaledHeight);

    return {
      canvas: scaledCanvas,
      imageData: scaledCtx.getImageData(0, 0, scaledWidth, scaledHeight),
      width: scaledWidth,
      height: scaledHeight,
    };
  });
}
