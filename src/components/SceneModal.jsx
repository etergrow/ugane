import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DETAIL_SCENE_DEBUG } from "../config/detailScenesConfig.js";
import { resolveAssetPath } from "../core/imageUtils.js";

function getHotspotKey(sceneId, hotspotId) {
  return `${sceneId}:${hotspotId}`;
}

const DRAG_THRESHOLD_MOUSE_PX = 8;
const DRAG_THRESHOLD_TOUCH_PX = 14;
const MIN_SCENE_ZOOM = 1;
const MAX_SCENE_ZOOM = 3.6;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function SceneModal({ scene, foundHotspotIds, onClose, onHotspotFound }) {
  const [hoveredHotspotId, setHoveredHotspotId] = useState(null);
  const [foundEffects, setFoundEffects] = useState([]);
  const [sceneImageError, setSceneImageError] = useState(false);
  const viewportRef = useRef(null);
  const suppressClickUntilRef = useRef(0);
  const pointersRef = useRef(new Map());
  const pinchStateRef = useRef({
    active: false,
    startDistance: 0,
    startZoomFactor: 1,
    focusSceneX: 0,
    focusSceneY: 0,
  });
  const dragStateRef = useRef({
    active: false,
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    startCameraX: 0,
    startCameraY: 0,
    moved: false,
  });
  const defaultZoomFactor = MIN_SCENE_ZOOM;
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const [camera, setCamera] = useState({
    x: 0,
    y: 0,
    zoomFactor: defaultZoomFactor,
  });
  const [isDraggingScene, setIsDraggingScene] = useState(false);
  const sceneImageSrc = useMemo(() => resolveAssetPath(scene.image), [scene.image]);

  useEffect(() => {
    setSceneImageError(false);
  }, [scene.sceneId]);

  useEffect(() => {
    // Позволяем быстро закрыть окно клавишей Escape.
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const updateViewportSize = () => {
      if (!viewportRef.current) return;
      const rect = viewportRef.current.getBoundingClientRect();
      setViewportSize({
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
      });
    };

    updateViewportSize();
    window.addEventListener("resize", updateViewportSize);
    return () => window.removeEventListener("resize", updateViewportSize);
  }, []);

  const sceneMetrics = useMemo(() => {
    const viewportWidth = Math.max(1, viewportSize.width);
    const viewportHeight = Math.max(1, viewportSize.height);
    const baseScale = Math.max(viewportWidth / scene.width, viewportHeight / scene.height);
    const scale = baseScale * camera.zoomFactor;
    const visibleSceneWidth = viewportWidth / scale;
    const visibleSceneHeight = viewportHeight / scale;
    const maxX = Math.max(0, scene.width - visibleSceneWidth);
    const maxY = Math.max(0, scene.height - visibleSceneHeight);

    return {
      scale,
      maxX,
      maxY,
      visibleSceneWidth,
      visibleSceneHeight,
    };
  }, [camera.zoomFactor, scene.height, scene.width, viewportSize.height, viewportSize.width]);

  const getScenePointFromClient = (clientX, clientY) => {
    if (!viewportRef.current) {
      return { x: camera.x, y: camera.y };
    }

    const rect = viewportRef.current.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    return {
      x: camera.x + (localX / Math.max(1, rect.width)) * sceneMetrics.visibleSceneWidth,
      y: camera.y + (localY / Math.max(1, rect.height)) * sceneMetrics.visibleSceneHeight,
    };
  };

  const getTwoPointers = () => Array.from(pointersRef.current.values()).slice(0, 2);

  useEffect(() => {
    // При открытии новой сцены центрируем камеру и выставляем читаемый zoom.
    const viewportWidth = Math.max(1, viewportSize.width);
    const viewportHeight = Math.max(1, viewportSize.height);
    const baseScale = Math.max(viewportWidth / scene.width, viewportHeight / scene.height);
    const scale = baseScale * defaultZoomFactor;
    const visibleSceneWidth = viewportWidth / scale;
    const visibleSceneHeight = viewportHeight / scale;

    setCamera({
      zoomFactor: defaultZoomFactor,
      x: Math.max(0, (scene.width - visibleSceneWidth) / 2),
      y: Math.max(0, (scene.height - visibleSceneHeight) / 2),
    });
    setIsDraggingScene(false);
  }, [defaultZoomFactor, scene.sceneId, scene.height, scene.width, viewportSize.height, viewportSize.width]);

  useEffect(() => {
    // После смены размеров viewport удерживаем камеру в допустимых пределах.
    setCamera((prev) => ({
      ...prev,
      x: clamp(prev.x, 0, sceneMetrics.maxX),
      y: clamp(prev.y, 0, sceneMetrics.maxY),
    }));
  }, [sceneMetrics.maxX, sceneMetrics.maxY]);

  const progress = useMemo(() => {
    const foundCount = scene.hotspots.filter((hotspot) =>
      foundHotspotIds.has(getHotspotKey(scene.sceneId, hotspot.id)),
    ).length;

    const totalScore = scene.hotspots.reduce((sum, hotspot) => sum + hotspot.score, 0);
    const foundScore = scene.hotspots.reduce((sum, hotspot) => {
      if (!foundHotspotIds.has(getHotspotKey(scene.sceneId, hotspot.id))) return sum;
      return sum + hotspot.score;
    }, 0);

    return {
      foundCount,
      totalCount: scene.hotspots.length,
      foundScore,
      totalScore,
    };
  }, [scene, foundHotspotIds]);

  const handleHotspotClick = (hotspot) => {
    if (Date.now() < suppressClickUntilRef.current) {
      return;
    }

    const key = getHotspotKey(scene.sceneId, hotspot.id);
    if (foundHotspotIds.has(key)) return;

    onHotspotFound({
      key,
      sceneId: scene.sceneId,
      hotspotId: hotspot.id,
      title: hotspot.title,
      score: hotspot.score,
    });

    const effectId = `${hotspot.id}-${Date.now()}`;
    setFoundEffects((prev) => [
      ...prev,
      {
        id: effectId,
        x: hotspot.x + hotspot.w / 2,
        y: hotspot.y + hotspot.h / 2,
        score: hotspot.score,
      },
    ]);

    window.setTimeout(() => {
      setFoundEffects((prev) => prev.filter((effect) => effect.id !== effectId));
    }, 850);
  };

  const handleScenePointerDown = (event) => {
    // Если клик начался по hotspot, не включаем перетаскивание сцены.
    if (event.target instanceof Element && event.target.closest(".scene-hotspot")) {
      return;
    }

    pointersRef.current.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
    });
    viewportRef.current?.setPointerCapture(event.pointerId);

    if (pointersRef.current.size === 2) {
      const [first, second] = getTwoPointers();
      const midpoint = {
        clientX: (first.clientX + second.clientX) / 2,
        clientY: (first.clientY + second.clientY) / 2,
      };
      const focusPoint = getScenePointFromClient(midpoint.clientX, midpoint.clientY);

      pinchStateRef.current = {
        active: true,
        startDistance: Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY),
        startZoomFactor: camera.zoomFactor,
        focusSceneX: focusPoint.x,
        focusSceneY: focusPoint.y,
      };

      dragStateRef.current.active = false;
      setIsDraggingScene(true);
      suppressClickUntilRef.current = Date.now() + 260;
      return;
    }

    if (pointersRef.current.size > 2) {
      pinchStateRef.current.active = true;
      dragStateRef.current.active = false;
      suppressClickUntilRef.current = Date.now() + 260;
      setIsDraggingScene(true);
      return;
    }

    dragStateRef.current = {
      active: true,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCameraX: camera.x,
      startCameraY: camera.y,
      moved: false,
    };

    setIsDraggingScene(true);
  };

  const handleScenePointerMove = (event) => {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
    }

    if (pinchStateRef.current.active && pointersRef.current.size >= 2) {
      const [first, second] = getTwoPointers();
      const currentDistance = Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
      if (currentDistance > 0 && pinchStateRef.current.startDistance > 0 && viewportRef.current) {
        const nextZoomFactor = clamp(
          pinchStateRef.current.startZoomFactor * (currentDistance / pinchStateRef.current.startDistance),
          MIN_SCENE_ZOOM,
          MAX_SCENE_ZOOM,
        );

        const rect = viewportRef.current.getBoundingClientRect();
        const baseScale = Math.max(rect.width / scene.width, rect.height / scene.height);
        const nextScale = baseScale * nextZoomFactor;
        const nextVisibleSceneWidth = rect.width / nextScale;
        const nextVisibleSceneHeight = rect.height / nextScale;
        const nextMaxX = Math.max(0, scene.width - nextVisibleSceneWidth);
        const nextMaxY = Math.max(0, scene.height - nextVisibleSceneHeight);
        const midpoint = {
          x: (first.clientX + second.clientX) / 2 - rect.left,
          y: (first.clientY + second.clientY) / 2 - rect.top,
        };
        const nextX = pinchStateRef.current.focusSceneX - (midpoint.x / Math.max(1, rect.width)) * nextVisibleSceneWidth;
        const nextY = pinchStateRef.current.focusSceneY - (midpoint.y / Math.max(1, rect.height)) * nextVisibleSceneHeight;

        setCamera({
          zoomFactor: nextZoomFactor,
          x: clamp(nextX, 0, nextMaxX),
          y: clamp(nextY, 0, nextMaxY),
        });
        suppressClickUntilRef.current = Date.now() + 260;
      }
      return;
    }

    const drag = dragStateRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startClientX;
    const deltaY = event.clientY - drag.startClientY;
    const nextX = clamp(drag.startCameraX - deltaX / sceneMetrics.scale, 0, sceneMetrics.maxX);
    const nextY = clamp(drag.startCameraY - deltaY / sceneMetrics.scale, 0, sceneMetrics.maxY);

    const dragThresholdPx = event.pointerType === "touch" ? DRAG_THRESHOLD_TOUCH_PX : DRAG_THRESHOLD_MOUSE_PX;
    if (!drag.moved && Math.hypot(deltaX, deltaY) > dragThresholdPx) {
      drag.moved = true;
      suppressClickUntilRef.current = Date.now() + 260;
    }

    setCamera((prev) => ({
      ...prev,
      x: nextX,
      y: nextY,
    }));
  };

  const finishSceneDrag = (event) => {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.delete(event.pointerId);
    }
    if (viewportRef.current?.hasPointerCapture(event.pointerId)) {
      viewportRef.current.releasePointerCapture(event.pointerId);
    }

    if (pinchStateRef.current.active) {
      if (pointersRef.current.size < 2) {
        pinchStateRef.current.active = false;
        if (pointersRef.current.size === 1) {
          const [remainingPointerId, remainingPoint] = pointersRef.current.entries().next().value;
          dragStateRef.current = {
            active: true,
            pointerId: remainingPointerId,
            startClientX: remainingPoint.clientX,
            startClientY: remainingPoint.clientY,
            startCameraX: camera.x,
            startCameraY: camera.y,
            moved: true,
          };
          setIsDraggingScene(true);
          return;
        }
      } else {
        return;
      }
    }

    const drag = dragStateRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) {
      if (pointersRef.current.size === 0) {
        setIsDraggingScene(false);
      }
      return;
    }

    dragStateRef.current.active = false;
    dragStateRef.current.pointerId = null;
    if (pointersRef.current.size === 0) {
      setIsDraggingScene(false);
    }
  };

  const handleSceneWheel = (event) => {
    if (!viewportRef.current) return;
    event.preventDefault();

    const rect = viewportRef.current.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const focusPoint = getScenePointFromClient(event.clientX, event.clientY);
    const delta = event.deltaY > 0 ? -0.08 : 0.08;
    const nextZoomFactor = clamp(camera.zoomFactor + delta, MIN_SCENE_ZOOM, MAX_SCENE_ZOOM);
    if (Math.abs(nextZoomFactor - camera.zoomFactor) < 0.0001) return;

    const baseScale = Math.max(rect.width / scene.width, rect.height / scene.height);
    const nextScale = baseScale * nextZoomFactor;
    const nextVisibleSceneWidth = rect.width / nextScale;
    const nextVisibleSceneHeight = rect.height / nextScale;
    const nextMaxX = Math.max(0, scene.width - nextVisibleSceneWidth);
    const nextMaxY = Math.max(0, scene.height - nextVisibleSceneHeight);
    const nextX = focusPoint.x - (localX / Math.max(1, rect.width)) * nextVisibleSceneWidth;
    const nextY = focusPoint.y - (localY / Math.max(1, rect.height)) * nextVisibleSceneHeight;

    setCamera({
      zoomFactor: nextZoomFactor,
      x: clamp(nextX, 0, nextMaxX),
      y: clamp(nextY, 0, nextMaxY),
    });
  };

  return (
    <div className="scene-modal-backdrop" role="dialog" aria-modal="true" aria-label={`Сцена: ${scene.title}`}>
      <div className="scene-modal">
        <header className="scene-modal__header">
          <div className="scene-modal__title-wrap">
            <p className="scene-modal__title">{scene.title}</p>
            <p className="scene-modal__subtitle">
              Найдено: {progress.foundCount}/{progress.totalCount} | Очки: {progress.foundScore}/{progress.totalScore}
            </p>
          </div>

          <button type="button" className="scene-modal__close" onClick={onClose}>
            Закрыть
          </button>
        </header>

        <div
          ref={viewportRef}
          className={`scene-modal__viewport ${isDraggingScene ? "scene-modal__viewport--dragging" : ""}`}
          onPointerDown={handleScenePointerDown}
          onPointerMove={handleScenePointerMove}
          onPointerUp={finishSceneDrag}
          onPointerCancel={finishSceneDrag}
          onPointerLeave={finishSceneDrag}
          onLostPointerCapture={finishSceneDrag}
          onWheel={handleSceneWheel}
        >
          <div
            className="scene-modal__stage"
            style={{
              width: `${scene.width}px`,
              height: `${scene.height}px`,
              transform: `translate(${-camera.x * sceneMetrics.scale}px, ${-camera.y * sceneMetrics.scale}px) scale(${sceneMetrics.scale})`,
            }}
          >
            <img
              src={sceneImageSrc}
              alt={scene.title}
              className="scene-modal__image"
              onError={() => setSceneImageError(true)}
              draggable={false}
            />

            {sceneImageError ? (
              <div className="scene-modal__image-error">
                Не удалось загрузить сцену: <code>{sceneImageSrc}</code>
              </div>
            ) : null}

            {scene.hotspots.map((hotspot) => {
              const key = getHotspotKey(scene.sceneId, hotspot.id);
              const isFound = foundHotspotIds.has(key);
              const isHovered = hoveredHotspotId === hotspot.id;
              const debugEnabled = DETAIL_SCENE_DEBUG.showHotspotBounds;

              return (
                <button
                  key={hotspot.id}
                  type="button"
                  className={[
                    "scene-hotspot",
                    debugEnabled ? "scene-hotspot--debug" : "",
                    isHovered ? "scene-hotspot--hovered" : "",
                    isFound ? "scene-hotspot--found" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{
                    left: `${hotspot.x * scene.width}px`,
                    top: `${hotspot.y * scene.height}px`,
                    width: `${hotspot.w * scene.width}px`,
                    height: `${hotspot.h * scene.height}px`,
                  }}
                  onMouseEnter={() => setHoveredHotspotId(hotspot.id)}
                  onMouseLeave={() => setHoveredHotspotId(null)}
                  onPointerDown={(event) => event.stopPropagation()}
                  onPointerMove={(event) => event.stopPropagation()}
                  onPointerUp={(event) => event.stopPropagation()}
                  onPointerCancel={(event) => event.stopPropagation()}
                  onClick={() => handleHotspotClick(hotspot)}
                  aria-label={hotspot.title}
                  title={isFound ? `Найдено: ${hotspot.title}` : `Нарушение: ${hotspot.title}`}
                >
                  {debugEnabled ? (
                    <span className="scene-hotspot__label">
                      {isFound ? "Найдено" : "Нарушение"}: {hotspot.title} (+{hotspot.score})
                    </span>
                  ) : null}
                </button>
              );
            })}

            {foundEffects.map((effect) => (
              <div
                key={effect.id}
                className="scene-found-effect"
                style={{
                  left: `${effect.x * scene.width}px`,
                  top: `${effect.y * scene.height}px`,
                }}
              >
                <span className="scene-found-effect__burst" />
                <span className="scene-found-effect__text">+{effect.score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
