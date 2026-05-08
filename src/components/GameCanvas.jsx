import React from "react";
import { useEffect, useRef } from "react";
import { PointClickGame } from "../core/gameEngine.js";

export function GameCanvas({ onSelectChange, onHoverChange, onItemClick, onLoadError }) {
  const canvasRef = useRef(null);
  const handlersRef = useRef({
    onSelectChange,
    onHoverChange,
    onItemClick,
    onLoadError,
  });

  handlersRef.current = {
    onSelectChange,
    onHoverChange,
    onItemClick,
    onLoadError,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const game = new PointClickGame({
      canvas,
      onSelectChange: (value) => handlersRef.current.onSelectChange(value),
      onHoverChange: (value) => handlersRef.current.onHoverChange(value),
      onItemClick: (item) => handlersRef.current.onItemClick?.(item),
      onLoadError: (error) => handlersRef.current.onLoadError(error),
    });

    game.init().catch((error) => {
      // Выводим подробность в консоль, чтобы в разработке не терять стек ошибки.
      console.error(error);
    });

    return () => {
      game.destroy();
    };
  }, []);

  return <canvas ref={canvasRef} className="game-canvas" aria-label="Игровая сцена офиса" />;
}
