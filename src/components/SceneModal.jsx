import React from "react";
import { useEffect, useMemo, useState } from "react";
import { DETAIL_SCENE_DEBUG } from "../config/detailScenesConfig.js";

function getHotspotKey(sceneId, hotspotId) {
  return `${sceneId}:${hotspotId}`;
}

export function SceneModal({ scene, foundHotspotIds, onClose, onHotspotFound }) {
  const [hoveredHotspotId, setHoveredHotspotId] = useState(null);
  const [foundEffects, setFoundEffects] = useState([]);

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

        <div className="scene-modal__image-wrap" style={{ aspectRatio: `${scene.width} / ${scene.height}` }}>
          <img src={scene.image} alt={scene.title} className="scene-modal__image" />

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
                  left: `${hotspot.x * 100}%`,
                  top: `${hotspot.y * 100}%`,
                  width: `${hotspot.w * 100}%`,
                  height: `${hotspot.h * 100}%`,
                }}
                onMouseEnter={() => setHoveredHotspotId(hotspot.id)}
                onMouseLeave={() => setHoveredHotspotId(null)}
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
                left: `${effect.x * 100}%`,
                top: `${effect.y * 100}%`,
              }}
            >
              <span className="scene-found-effect__burst" />
              <span className="scene-found-effect__text">+{effect.score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
