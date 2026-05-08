import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles/main.css";

const rootElement = document.getElementById("root");
let fallbackShown = false;

function showFatalMessage(message) {
  if (fallbackShown) return;
  fallbackShown = true;

  const fallback = document.createElement("pre");
  fallback.style.margin = "24px";
  fallback.style.padding = "16px";
  fallback.style.background = "rgba(32, 0, 0, 0.85)";
  fallback.style.border = "1px solid rgba(255, 86, 86, 0.8)";
  fallback.style.borderRadius = "10px";
  fallback.style.color = "#ffd5d5";
  fallback.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, monospace";
  fallback.style.whiteSpace = "pre-wrap";
  fallback.textContent = message;
  document.body.appendChild(fallback);
}

if (!rootElement) {
  throw new Error("Не найден DOM-элемент #root для монтирования React-приложения");
}

// Глобальный перехват ошибок, чтобы вместо пустого экрана всегда был читаемый текст проблемы.
window.addEventListener("error", (event) => {
  const details = event.error ? String(event.error.stack || event.error) : String(event.message);
  showFatalMessage(`Ошибка JavaScript:\n${details}`);
});

window.addEventListener("unhandledrejection", (event) => {
  const details = event.reason ? String(event.reason.stack || event.reason) : "Неизвестная причина";
  showFatalMessage(`Необработанный Promise rejection:\n${details}`);
});

try {
  createRoot(rootElement).render(<App />);
} catch (error) {
  // Если React не смонтировался синхронно, сразу показываем текст ошибки.
  showFatalMessage(`Ошибка запуска приложения:\n${String(error)}`);
  console.error(error);
}
