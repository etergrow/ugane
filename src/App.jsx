import React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GameCanvas } from "./components/GameCanvas.jsx";
import { SceneModal } from "./components/SceneModal.jsx";
import { SiemModal } from "./components/SiemModal.jsx";
import { DETAIL_SCENES, DETAIL_SCENE_ITEM_IDS } from "./config/detailScenesConfig.js";

const DEFAULT_SELECTED_TEXT = "Ничего не выбрано";
const DEFAULT_HOVER_HINT = "Зажми и перетаскивай карту, затем кликай по объектам";
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
const SOC_SIEM_ITEM_IDS = new Set(["soc_stol_and_monitors"]);

function formatTimer(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function App() {
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 900px)").matches : false,
  );
  const [isHudCollapsed, setIsHudCollapsed] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 900px)").matches : false,
  );
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
  const [isSiemOpen, setIsSiemOpen] = useState(false);
  const [siemStats, setSiemStats] = useState({
    resolved: 0,
    correct: 0,
    wrong: 0,
  });

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

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 900px)");
    const applyLayout = (matches) => {
      setIsMobileLayout(matches);
      setIsHudCollapsed(matches);
    };

    applyLayout(mediaQuery.matches);
    const onChange = (event) => applyLayout(event.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

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
    setIsSiemOpen(false);
    setSiemStats({
      resolved: 0,
      correct: 0,
      wrong: 0,
    });
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
    setIsSiemOpen(false);
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
      if (SOC_SIEM_ITEM_IDS.has(item.id)) {
        setActiveSceneId(null);
        setIsSiemOpen(true);
        setHoverHint("Обработай алерты в SIEM: TP -> инцидент, FP -> закрыть");
      }
      return;
    }

    setIsSiemOpen(false);
    setActiveSceneId(item.id);
    setHoverHint("Найди все нарушения на детальной сцене и кликай по ним");
  }, [isPlaying]);

  const handleCloseScene = useCallback(() => {
    setActiveSceneId(null);
    setHoverHint(DEFAULT_HOVER_HINT);
  }, []);

  const handleCloseSiem = useCallback(() => {
    setIsSiemOpen(false);
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

  const handleSiemAlertResolved = useCallback((resolution) => {
    if (!isPlaying) {
      return;
    }

    setSiemStats((previousStats) => ({
      resolved: previousStats.resolved + 1,
      correct: previousStats.correct + (resolution.isCorrect ? 1 : 0),
      wrong: previousStats.wrong + (resolution.isCorrect ? 0 : 1),
    }));

    if (resolution.isCorrect) {
      setTotalScore((previousScore) => previousScore + resolution.scoreAward);
      setSelectedName(`SIEM: верно (${resolution.scoreAward} очков)`);
    } else {
      setSelectedName("SIEM: решение неверное (0 очков)");
    }
  }, [isPlaying]);

  return (
    <main className="app">
      <section className={`hud ${isHudCollapsed ? "hud--collapsed" : ""}`}>
        {isMobileLayout ? (
          <button
            type="button"
            className="hud-toggle-btn"
            onClick={() => setIsHudCollapsed((previousValue) => !previousValue)}
          >
            {isHudCollapsed ? "Показать меню" : "Скрыть меню"}
          </button>
        ) : null}

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
            <p className="score-box__siem">
              SIEM: {siemStats.correct} верно / {siemStats.wrong} неверно
            </p>
            {shouldShowTimer ? <p className="score-box__timer">Таймер: {timerText}</p> : null}
          </div>
        </header>

        <section className="bottom-panel">
          <p className="bottom-panel__text">{hoverHint}</p>
        </section>
      </section>

      <section className="game-shell">
        <GameCanvas
          onSelectChange={setSelectedName}
          onHoverChange={setHoverHint}
          onItemClick={handleMapItemClick}
          onLoadError={handleLoadError}
        />
      </section>
      
      {activeScene ? (
        <SceneModal
          scene={activeScene}
          foundHotspotIds={foundHotspotIds}
          onClose={handleCloseScene}
          onHotspotFound={handleHotspotFound}
        />
      ) : null}

      {isSiemOpen ? (
        <SiemModal onClose={handleCloseSiem} onAlertResolved={handleSiemAlertResolved} />
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
