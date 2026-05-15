import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

const ALERT_SEVERITIES = ["critical", "high", "medium", "low", "info"];
const SEVERITY_WEIGHTS = [0.12, 0.2, 0.3, 0.24, 0.14];
const SEVERITY_LABELS = {
  critical: "Критический",
  high: "Высокий",
  medium: "Средний",
  low: "Низкий",
  info: "Инфо",
};
const SEVERITY_POINTS = {
  critical: 18,
  high: 14,
  medium: 11,
  low: 8,
  info: 6,
};
const MAX_ACTIVE_ALERTS = 20;

const TRUE_POSITIVE_TEMPLATES = [
  {
    title: "Подбор пароля к VPN",
    source: "VPN-Gateway-1",
    category: "Bruteforce",
    description:
      "Зафиксировано более 150 неудачных попыток входа с одного IP за короткий промежуток времени. Наблюдается последовательный перебор учётной записи администратора.",
  },
  {
    title: "Запуск PowerShell с загрузкой payload",
    source: "EDR-Desktop-27",
    category: "Execution",
    description:
      "На рабочей станции выполнена цепочка команд с Base64-параметрами и последующим сетевым обращением к неизвестному домену.",
  },
  {
    title: "Массовое шифрование файлов",
    source: "FileServer-02",
    category: "Ransomware",
    description:
      "Обнаружены аномальные массовые операции переименования и изменения расширений в каталоге общего доступа.",
  },
  {
    title: "Аномальная отправка данных наружу",
    source: "Proxy-Core",
    category: "Data Exfiltration",
    description:
      "Сервисная учётная запись выгрузила необычно большой объём данных на внешний ресурс, не входящий в белый список.",
  },
];

const FALSE_POSITIVE_TEMPLATES = [
  {
    title: "Плановый скан уязвимостей",
    source: "Scanner-Nessus",
    category: "Vulnerability Scan",
    description:
      "Источник сканирования совпадает с доверенным сканером, время и диапазон IP соответствуют утверждённому окну проверки.",
  },
  {
    title: "Тестовая эмуляция фишинга",
    source: "Mail-Sec-Training",
    category: "Phishing Simulation",
    description:
      "Письмо сформировано внутренней системой обучения безопасности, домен и шаблон полностью совпадают с планом тренировки.",
  },
  {
    title: "Резервное копирование вне графика",
    source: "Backup-Orchestrator",
    category: "Backup",
    description:
      "Запуск связан с ручной репликацией после обновления. Действие подтверждено дежурным администратором.",
  },
  {
    title: "Повышенная сетeвая активность CI/CD",
    source: "Build-Agent-4",
    category: "DevOps Activity",
    description:
      "Скачивание зависимостей и контейнерных слоёв связано с ночной сборкой релиза. Артефакты подписаны внутренним ключом.",
  },
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(items) {
  return items[randomInt(0, items.length - 1)];
}

function weightedRandom(items, weights) {
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = Math.random() * total;

  for (let index = 0; index < items.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) {
      return items[index];
    }
  }

  return items[items.length - 1];
}

function getCurrentTimeStamp() {
  return new Date().toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function createAlert(idCounter) {
  const isTruePositive = Math.random() < 0.56;
  const template = isTruePositive ? randomChoice(TRUE_POSITIVE_TEMPLATES) : randomChoice(FALSE_POSITIVE_TEMPLATES);
  const severity = weightedRandom(ALERT_SEVERITIES, SEVERITY_WEIGHTS);

  return {
    id: `siem-alert-${idCounter}-${Date.now()}`,
    isTruePositive,
    severity,
    severityLabel: SEVERITY_LABELS[severity],
    source: template.source,
    category: template.category,
    title: template.title,
    description: template.description,
    user: randomChoice(["svc-backup", "corp\\analyst", "corp\\admin", "vpn_user", "system"]),
    timestamp: getCurrentTimeStamp(),
  };
}

function getDecisionCorrectness(alert, action) {
  if (alert.isTruePositive && action === "incident") return true;
  if (!alert.isTruePositive && action === "close") return true;
  return false;
}

export function SiemModal({ onClose, onAlertResolved }) {
  const [alerts, setAlerts] = useState(() => Array.from({ length: 5 }, (_, index) => createAlert(index + 1)));
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  const [resolutionFx, setResolutionFx] = useState(null);
  const alertCounterRef = useRef(6);

  const selectedAlert = useMemo(
    () => alerts.find((alert) => alert.id === selectedAlertId) ?? null,
    [alerts, selectedAlertId],
  );

  const severityCounters = useMemo(() => {
    return alerts.reduce(
      (acc, alert) => {
        acc[alert.severity] += 1;
        return acc;
      },
      { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    );
  }, [alerts]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        if (selectedAlertId) {
          setSelectedAlertId(null);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, selectedAlertId]);

  useEffect(() => {
    // Пока достигнут лимит, генерация полностью на паузе.
    if (alerts.length >= MAX_ACTIVE_ALERTS) {
      return undefined;
    }

    const delayMs = randomInt(1400, 4200);
    const timeoutId = window.setTimeout(() => {
      setAlerts((previousAlerts) => {
        if (previousAlerts.length >= MAX_ACTIVE_ALERTS) {
          return previousAlerts;
        }

        const newAlert = createAlert(alertCounterRef.current);
        alertCounterRef.current += 1;
        return [newAlert, ...previousAlerts].slice(0, MAX_ACTIVE_ALERTS);
      });
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [alerts.length]);

  const handleResolveAlert = (action) => {
    if (!selectedAlert || resolutionFx) return;

    const resolvedAlert = selectedAlert;
    const isCorrect = getDecisionCorrectness(resolvedAlert, action);
    const scoreAward = isCorrect ? SEVERITY_POINTS[resolvedAlert.severity] : 0;

    setResolutionFx({
      isCorrect,
      scoreAward,
      title: isCorrect ? "Верное решение" : "Неверное решение",
      text: isCorrect ? `+${scoreAward} очков` : "0 очков",
    });
    setSelectedAlertId(null);

    window.setTimeout(() => {
      onAlertResolved({
        alertId: resolvedAlert.id,
        action,
        isCorrect,
        scoreAward,
        severity: resolvedAlert.severity,
        title: resolvedAlert.title,
      });

      setAlerts((previousAlerts) => previousAlerts.filter((alert) => alert.id !== resolvedAlert.id));
      setResolutionFx(null);
    }, 2800);
  };

  return (
    <div className="siem-modal-backdrop" role="dialog" aria-modal="true" aria-label="SIEM центр мониторинга">
      <div className="siem-modal">
        <header className="siem-modal__header">
          <div>
            <p className="siem-modal__title">SIEM UGANE</p>
            <p className="siem-modal__subtitle">События генерируются в реальном времени. Оцени каждое срабатывание.</p>
          </div>

          <button type="button" className="siem-modal__close" onClick={onClose}>
            Закрыть SIEM
          </button>
        </header>

        <section className="siem-kpi-grid">
          <article className="siem-kpi-card">
            <p className="siem-kpi-card__label">Всего активных</p>
            <p className="siem-kpi-card__value">{alerts.length}</p>
          </article>
          <article className="siem-kpi-card">
            <p className="siem-kpi-card__label">Критических</p>
            <p className="siem-kpi-card__value siem-kpi-card__value--critical">{severityCounters.critical}</p>
          </article>
          <article className="siem-kpi-card">
            <p className="siem-kpi-card__label">Высоких</p>
            <p className="siem-kpi-card__value siem-kpi-card__value--high">{severityCounters.high}</p>
          </article>
          <article className="siem-kpi-card">
            <p className="siem-kpi-card__label">Средних/низких</p>
            <p className="siem-kpi-card__value">
              {severityCounters.medium + severityCounters.low + severityCounters.info}
            </p>
          </article>
        </section>

        <section className="siem-table">
          <div className="siem-table__head">
            <span>Время</span>
            <span>Уровень</span>
            <span>Источник</span>
            <span>Пользователь</span>
            <span>Событие</span>
            <span>Категория</span>
          </div>

          <div className="siem-table__body">
            {alerts.map((alert) => (
              <button
                key={alert.id}
                type="button"
                className="siem-table__row"
                onClick={() => setSelectedAlertId(alert.id)}
              >
                <span>{alert.timestamp}</span>
                <span className={`siem-severity siem-severity--${alert.severity}`}>{alert.severityLabel}</span>
                <span>{alert.source}</span>
                <span>{alert.user}</span>
                <span>{alert.title}</span>
                <span>{alert.category}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {selectedAlert ? (
        <div className="siem-alert-modal-backdrop">
          <div className="siem-alert-modal">
            <p className="siem-alert-modal__title">{selectedAlert.title}</p>
            <p className="siem-alert-modal__meta">
              Уровень: <strong>{selectedAlert.severityLabel}</strong> | Источник: <strong>{selectedAlert.source}</strong>
            </p>
            <p className="siem-alert-modal__text">{selectedAlert.description}</p>

            <div className="siem-alert-modal__actions">
              <button
                type="button"
                className="siem-alert-modal__btn siem-alert-modal__btn--incident"
                onClick={() => handleResolveAlert("incident")}
                disabled={Boolean(resolutionFx)}
              >
                Завести инцидент
              </button>
              <button
                type="button"
                className="siem-alert-modal__btn siem-alert-modal__btn--close"
                onClick={() => handleResolveAlert("close")}
                disabled={Boolean(resolutionFx)}
              >
                Закрыть
              </button>
            </div>

            <button
              type="button"
              className="siem-alert-modal__dismiss"
              onClick={() => setSelectedAlertId(null)}
              disabled={Boolean(resolutionFx)}
            >
              Назад к ленте
            </button>

          </div>
        </div>
      ) : null}

      {resolutionFx ? (
        <div
          className={[
            "siem-judgement-overlay",
            resolutionFx.isCorrect ? "siem-judgement-overlay--success" : "siem-judgement-overlay--fail",
          ].join(" ")}
        >
          <div className="siem-judgement-overlay__card">
            <p className="siem-judgement-overlay__title">{resolutionFx.title}</p>
            <p className="siem-judgement-overlay__score">{resolutionFx.text}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
