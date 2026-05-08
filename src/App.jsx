import React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GameCanvas } from "./components/GameCanvas.jsx";
import { SceneModal } from "./components/SceneModal.jsx";
import { DETAIL_SCENES, DETAIL_SCENE_ITEM_IDS } from "./config/detailScenesConfig.js";

const DEFAULT_SELECTED_TEXT = "Ничего не выбрано";
const DEFAULT_HOVER_HINT = "Наведи курсор на объект, чтобы увидеть подсветку";
const GAME_PHASE = {
  INTRO: "intro",
  PLAYING: "playing",
  FINISHED: "finished",
};
const GAME_MODE = {
  TIMED: "timed",
  FREE: "free",
};
const TIMED_MODE_SECONDS = 60;

function formatTimer(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function App() {
  const [selectedName, setSelectedName] = useState(DEFAULT_SELECTED_TEXT);
  const [hoverHint, setHoverHint] = useState(DEFAULT_HOVER_HINT);
  const [activeSceneId, setActiveSceneId] = useState(null);
  const [totalScore, setTotalScore] = useState(0);
  const [foundHotspotIds, setFoundHotspotIds] = useState(() => new Set());
  const [gamePhase, setGamePhase] = useState(GAME_PHASE.INTRO);
  const [gameMode, setGameMode] = useState(null);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(TIMED_MODE_SECONDS);
  const [lastRunScore, setLastRunScore] = useState(0);
  const [lastRunFoundCount, setLastRunFoundCount] = useState(0);
  const [finishReason, setFinishReason] = useState("manual");

  const activeScene = activeSceneId ? DETAIL_SCENES[activeSceneId] : null;

  const discoveredViolationsCount = foundHotspotIds.size;
  const totalViolationsCount = useMemo(
    () => Object.values(DETAIL_SCENES).reduce((sum, scene) => sum + scene.hotspots.length, 0),
    [],
  );

  const isPlaying = gamePhase === GAME_PHASE.PLAYING;
  const isTimedMode = gameMode === GAME_MODE.TIMED;
  const shouldShowTimer = isPlaying && isTimedMode;
  const timerText = formatTimer(timeLeftSeconds);

  const handleLoadError = useCallback(() => {
    setSelectedName("Ошибка загрузки сцены");
    setHoverHint("Проверь пути к ассетам и перезапусти dev-сервер");
  }, []);

  const resetGameProgress = useCallback(() => {
    setTotalScore(0);
    setFoundHotspotIds(new Set());
    setSelectedName(DEFAULT_SELECTED_TEXT);
    setHoverHint(DEFAULT_HOVER_HINT);
    setActiveSceneId(null);
  }, []);

  const handleStartGame = useCallback((mode) => {
    resetGameProgress();
    setGameMode(mode);
    setTimeLeftSeconds(TIMED_MODE_SECONDS);
    setFinishReason("manual");
    setGamePhase(GAME_PHASE.PLAYING);
  }, [resetGameProgress]);

  const handleEndGame = useCallback((reason = "manual") => {
    if (!isPlaying) {
      return;
    }

    setLastRunScore(totalScore);
    setLastRunFoundCount(discoveredViolationsCount);
    setFinishReason(reason);
    setActiveSceneId(null);
    setGamePhase(GAME_PHASE.FINISHED);
  }, [discoveredViolationsCount, isPlaying, totalScore]);

  useEffect(() => {
    if (!isPlaying || !isTimedMode) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setTimeLeftSeconds((previousValue) => {
        if (previousValue <= 1) {
          window.clearInterval(intervalId);
          window.setTimeout(() => handleEndGame("timeout"), 0);
          return 0;
        }

        return previousValue - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [handleEndGame, isPlaying, isTimedMode]);

  const handleMapItemClick = useCallback((item) => {
    if (!isPlaying) {
      return;
    }

    if (!DETAIL_SCENE_ITEM_IDS.has(item.id)) {
      return;
    }

    setActiveSceneId(item.id);
    setHoverHint("Найди все нарушения на детальной сцене и кликай по ним");
  }, [isPlaying]);

  const handleCloseScene = useCallback(() => {
    setActiveSceneId(null);
    setHoverHint(DEFAULT_HOVER_HINT);
  }, []);

  const handleHotspotFound = useCallback((foundData) => {
    if (!isPlaying) {
      return;
    }

    setFoundHotspotIds((previousSet) => {
      if (previousSet.has(foundData.key)) {
        return previousSet;
      }

      const nextSet = new Set(previousSet);
      nextSet.add(foundData.key);
      setTotalScore((previousScore) => previousScore + foundData.score);
      setSelectedName(`${foundData.title} (+${foundData.score} очков)`);
      return nextSet;
    });
  }, [isPlaying]);

  return (
    <main className="app">
      <header className="top-panel">
        <div className="selected-box">
          <p className="selected-box__label">Последний клик</p>
          <p className="selected-box__value">{selectedName}</p>
        </div>

        <div className="top-panel__center">
          <button
            type="button"
            className="end-game-btn"
            onClick={() => handleEndGame("manual")}
            disabled={!isPlaying || isTimedMode}
            aria-disabled={!isPlaying || isTimedMode}
          >
            Завершить игру
          </button>
        </div>

        <div className="score-box">
          <p className="score-box__label">Прогресс ИБ</p>
          <p className="score-box__value">
            Очки: {totalScore} | Нарушения: {discoveredViolationsCount}/{totalViolationsCount}
          </p>
          {shouldShowTimer ? <p className="score-box__timer">Таймер: {timerText}</p> : null}
        </div>
      </header>

      <section className="game-shell">
        <GameCanvas
          onSelectChange={setSelectedName}
          onHoverChange={setHoverHint}
          onItemClick={handleMapItemClick}
          onLoadError={handleLoadError}
        />
      </section>

      <section className="bottom-panel">
        <p className="bottom-panel__text">{hoverHint}</p>
      </section>

      {activeScene ? (
        <SceneModal
          scene={activeScene}
          foundHotspotIds={foundHotspotIds}
          onClose={handleCloseScene}
          onHotspotFound={handleHotspotFound}
        />
      ) : null}

      {gamePhase !== GAME_PHASE.PLAYING ? (
        <div className="game-overlay" role="dialog" aria-modal="true">
          <div className="game-overlay__card">
            <p className="game-overlay__title">
              {gamePhase === GAME_PHASE.INTRO ? "UGAME Квест по ИБ" : "Игра завершена"}
            </p>

            {gamePhase === GAME_PHASE.INTRO ? (
              <p className="game-overlay__subtitle">
                Найди на локациях нарушения политик ИБ и набери максимум очков.
              </p>
            ) : (
              <>
                <p className="game-overlay__subtitle">
                  {finishReason === "timeout" ? "Время вышло. Результат прохождения:" : "Результат прохождения:"}
                </p>
                <p className="game-overlay__score">{lastRunScore} очков</p>
                <p className="game-overlay__meta">
                  Найдено нарушений: {lastRunFoundCount}/{totalViolationsCount}
                </p>
                <p className="game-overlay__meta">
                  Режим: {gameMode === GAME_MODE.TIMED ? "На время (60 сек)" : "Свободный"}
                </p>
              </>
            )}

            <div className="game-overlay__actions">
              <button
                type="button"
                className="game-overlay__start-btn"
                onClick={() => handleStartGame(GAME_MODE.TIMED)}
              >
                {gamePhase === GAME_PHASE.INTRO ? "Начать: На время (60 сек)" : "Новая игра: На время"}
              </button>

              <button
                type="button"
                className="game-overlay__start-btn game-overlay__start-btn--alt"
                onClick={() => handleStartGame(GAME_MODE.FREE)}
              >
                {gamePhase === GAME_PHASE.INTRO ? "Начать: Свободный режим" : "Новая игра: Свободный режим"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
