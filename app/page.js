"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PETS = [
  {
    id: "dog",
    label: "Dog",
    modelPath: "/models/dog.glb",
    iconPath: "/assets/icons/dog.png",
    soundPath: "/assets/sounds/bark.mp3",
    accent: "sunset",
  },
  {
    id: "cat",
    label: "Cat",
    modelPath: "/models/cat.glb",
    iconPath: "/assets/icons/cat.png",
    soundPath: "/assets/sounds/meow.mp3",
    accent: "sea",
  },
];

const PREFERRED_ANIMATIONS = ["Idle", "Walk", "Run", "Jump"];
const CAMERA_PRESETS = [
  { id: "front", label: "Front", theta: 0, phi: 70, radius: 110 },
  { id: "left", label: "Left", theta: 90, phi: 70, radius: 110 },
  { id: "right", label: "Right", theta: -90, phi: 70, radius: 110 },
  { id: "top", label: "Top", theta: 0, phi: 28, radius: 130 },
  { id: "hero", label: "Hero", theta: 32, phi: 64, radius: 98 },
];
const PET_BASE_HEALTH = {
  dog: { energy: 82, mood: 76, fitness: 79, hydration: 72 },
  cat: { energy: 74, mood: 84, fitness: 68, hydration: 77 },
};
const HEALTH_METRICS = [
  { key: "energy", label: "Energy", color: "#ff8a5b" },
  { key: "mood", label: "Mood", color: "#4fc3f7" },
  { key: "fitness", label: "Fitness", color: "#22c55e" },
  { key: "hydration", label: "Hydration", color: "#3b82f6" },
];
const HEALTH_ACTIONS = [
  { id: "feed", label: "Feed", delta: { energy: 12, mood: 3, hydration: 2 } },
  { id: "water", label: "Water", delta: { hydration: 16, mood: 2 } },
  { id: "play", label: "Play", delta: { mood: 10, fitness: 4, energy: -5 } },
  { id: "rest", label: "Rest", delta: { energy: 9, mood: 5 } },
];
const ESSENTIAL_ANIMATION_NAMES = ["Idle", "Walk", "Run", "Jump", "Survey"];
const MAX_VISIBLE_ANIMATIONS = 4;
const SENSOR_POLL_MS = 3000;
const SENSOR_STALE_MS = 15000;

function clampMetric(value) {
  return Math.max(0, Math.min(100, value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function blendMetric(current, target, weight) {
  return current + (target - current) * weight;
}

function mapSensorReadingToHealth(reading) {
  if (!reading) return null;

  const heartRate = clamp(reading.heartRate ?? 90, 35, 220);
  const temperatureC = clamp(reading.temperatureC ?? 38.3, 34, 43);
  const spo2 = clamp(reading.spo2 ?? 96, 70, 100);
  const activityLevel = clamp(reading.activityLevel ?? 45, 0, 100);
  const hydrationPct = clamp(reading.hydrationPct ?? 72, 0, 100);

  const heartRateScore = clampMetric(100 - Math.abs(heartRate - 95) * 1.1);
  const temperatureScore = clampMetric(100 - Math.abs(temperatureC - 38.3) * 45);

  return {
    energy: clampMetric(
      activityLevel * 0.48 + heartRateScore * 0.22 + spo2 * 0.15 + temperatureScore * 0.15,
    ),
    mood: clampMetric(
      heartRateScore * 0.3 + temperatureScore * 0.26 + spo2 * 0.2 + hydrationPct * 0.24,
    ),
    fitness: clampMetric(activityLevel * 0.58 + spo2 * 0.26 + heartRateScore * 0.16),
    hydration: clampMetric(hydrationPct * 0.85 + temperatureScore * 0.15),
  };
}

function formatSensorTime(timestamp) {
  if (!timestamp) return "No live data";
  const deltaSec = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (deltaSec < 3) return "Updated just now";
  return `Updated ${deltaSec}s ago`;
}

function getHealthDeltaFromAnimation(animationName) {
  const name = (animationName || "").toLowerCase();

  if (
    name.includes("run") ||
    name.includes("jump") ||
    name.includes("attack") ||
    name.includes("gallop")
  ) {
    return { energy: -2.6, mood: 0.8, fitness: 1.3, hydration: -1.1 };
  }

  if (name.includes("walk") || name.includes("survey")) {
    return { energy: -1.4, mood: 0.5, fitness: 0.9, hydration: -0.7 };
  }

  if (name.includes("idle") || name.includes("rest") || name.includes("sleep")) {
    return { energy: 1.2, mood: 0.3, fitness: 0.1, hydration: -0.2 };
  }

  return { energy: -0.7, mood: 0.2, fitness: 0.4, hydration: -0.4 };
}

function orderAnimations(animations) {
  const unique = [...new Set(animations.filter(Boolean))];
  const lowerToOriginal = new Map(
    unique.map((animation) => [animation.toLowerCase(), animation]),
  );

  const preferred = PREFERRED_ANIMATIONS.map((name) =>
    lowerToOriginal.get(name.toLowerCase()),
  ).filter(Boolean);

  const preferredSet = new Set(preferred.map((name) => name.toLowerCase()));
  const extras = unique.filter((name) => !preferredSet.has(name.toLowerCase()));

  return [...preferred, ...extras];
}

function pickEssentialAnimations(animations) {
  const normalizedMap = new Map(
    animations.map((name) => [name.toLowerCase(), name]),
  );

  const essentials = ESSENTIAL_ANIMATION_NAMES.map((name) =>
    normalizedMap.get(name.toLowerCase()),
  ).filter(Boolean);

  if (essentials.length > 0) {
    return essentials.slice(0, MAX_VISIBLE_ANIMATIONS);
  }

  return animations.slice(0, Math.min(3, animations.length));
}

export default function Home() {
  const viewerRef = useRef(null);
  const audioRef = useRef(null);
  const cameraTweenFrameRef = useRef(0);
  const cameraTourFrameRef = useRef(0);
  const cameraTourLastTimeRef = useRef(0);
  const cameraOrbitRef = useRef({
    theta: CAMERA_PRESETS[0].theta,
    phi: CAMERA_PRESETS[0].phi,
    radius: CAMERA_PRESETS[0].radius,
  });

  const [isClient, setIsClient] = useState(false);
  const [activePetId, setActivePetId] = useState(PETS[0].id);
  const [isLoadingModel, setIsLoadingModel] = useState(true);
  const [availableAnimations, setAvailableAnimations] = useState([]);
  const [activeAnimation, setActiveAnimation] = useState("");
  const [isPlayingSound, setIsPlayingSound] = useState(false);
  const [health, setHealth] = useState({
    ...PET_BASE_HEALTH[PETS[0].id],
  });
  const [sensorSnapshot, setSensorSnapshot] = useState(null);
  const [sensorError, setSensorError] = useState("");
  const [isSensorSyncEnabled, setIsSensorSyncEnabled] = useState(true);
  const [sensorClock, setSensorClock] = useState(Date.now());
  const [activeCameraPreset, setActiveCameraPreset] = useState(
    CAMERA_PRESETS[0].id,
  );
  const [isCameraTouring, setIsCameraTouring] = useState(false);

  const activePet = useMemo(
    () => PETS.find((pet) => pet.id === activePetId) ?? PETS[0],
    [activePetId],
  );
  const healthScore = useMemo(
    () =>
      Math.round(
        health.energy * 0.34 +
          health.mood * 0.28 +
          health.fitness * 0.23 +
          health.hydration * 0.15,
      ),
    [health],
  );
  const healthStatus = useMemo(() => {
    if (healthScore >= 85) return { label: "Excellent", tone: "excellent" };
    if (healthScore >= 70) return { label: "Stable", tone: "stable" };
    if (healthScore >= 50) return { label: "Needs Care", tone: "care" };
    return { label: "Critical", tone: "critical" };
  }, [healthScore]);
  const isDogSensorMode = activePetId === "dog" && isSensorSyncEnabled;
  const isSensorFresh = useMemo(() => {
    if (!sensorSnapshot?.timestamp) return false;
    return Date.now() - sensorSnapshot.timestamp <= SENSOR_STALE_MS;
  }, [sensorClock, sensorSnapshot]);
  const sensorLabel = useMemo(() => {
    if (!isSensorSyncEnabled) return "Sensor Sync Off";
    if (sensorError) return "Sensor Error";
    if (isSensorFresh) return "Sensor Live";
    if (sensorSnapshot?.timestamp) return "Sensor Stale";
    return "Waiting Sensor Data";
  }, [isSensorFresh, isSensorSyncEnabled, sensorError, sensorSnapshot]);

  const stopSound = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    audioRef.current = null;
    setIsPlayingSound(false);
  }, []);

  const stopCameraTween = useCallback(() => {
    if (!cameraTweenFrameRef.current) return;
    cancelAnimationFrame(cameraTweenFrameRef.current);
    cameraTweenFrameRef.current = 0;
  }, []);

  const stopCameraTour = useCallback(() => {
    if (!cameraTourFrameRef.current) return;
    cancelAnimationFrame(cameraTourFrameRef.current);
    cameraTourFrameRef.current = 0;
    cameraTourLastTimeRef.current = 0;
  }, []);

  const setCameraOrbit = useCallback((theta, phi, radius) => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const nextOrbit = { theta, phi, radius };
    cameraOrbitRef.current = nextOrbit;
    viewer.cameraOrbit = `${theta.toFixed(2)}deg ${phi.toFixed(
      2,
    )}deg ${radius.toFixed(2)}%`;
  }, []);

  const animateCameraTo = useCallback(
    ({ theta, phi, radius }, durationMs = 700) => {
      const viewer = viewerRef.current;
      if (!viewer) return;

      stopCameraTween();
      const start = cameraOrbitRef.current;

      const deltaTheta = ((theta - start.theta + 540) % 360) - 180;
      const deltaPhi = phi - start.phi;
      const deltaRadius = radius - start.radius;
      let startTime = 0;

      const tick = (time) => {
        if (!startTime) startTime = time;
        const progress = Math.min((time - startTime) / durationMs, 1);
        const eased = 1 - Math.pow(1 - progress, 3);

        setCameraOrbit(
          start.theta + deltaTheta * eased,
          start.phi + deltaPhi * eased,
          start.radius + deltaRadius * eased,
        );

        if (progress < 1) {
          cameraTweenFrameRef.current = requestAnimationFrame(tick);
          return;
        }

        cameraTweenFrameRef.current = 0;
      };

      cameraTweenFrameRef.current = requestAnimationFrame(tick);
    },
    [setCameraOrbit, stopCameraTween],
  );

  const applyCameraPreset = useCallback(
    (presetId, immediate = false) => {
      const preset = CAMERA_PRESETS.find((item) => item.id === presetId);
      if (!preset) return;

      setActiveCameraPreset(presetId);
      stopCameraTour();
      setIsCameraTouring(false);

      if (immediate) {
        setCameraOrbit(preset.theta, preset.phi, preset.radius);
        return;
      }

      animateCameraTo(preset, 700);
    },
    [animateCameraTo, setCameraOrbit, stopCameraTour],
  );

  useEffect(() => {
    return () => {
      stopSound();
      stopCameraTween();
      stopCameraTour();
    };
  }, [stopCameraTour, stopCameraTween, stopSound]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const timerId = setInterval(() => {
      setSensorClock(Date.now());
    }, 1000);

    return () => {
      clearInterval(timerId);
    };
  }, []);

  useEffect(() => {
    setIsLoadingModel(true);
    setAvailableAnimations([]);
    setActiveAnimation("");
    setHealth({
      ...(PET_BASE_HEALTH[activePetId] ?? PET_BASE_HEALTH[PETS[0].id]),
    });
    stopSound();
  }, [activePetId, stopSound]);

  useEffect(() => {
    if (!isClient || !isSensorSyncEnabled) return;

    let isActive = true;

    const pullSensorData = async () => {
      try {
        const response = await fetch("/api/health/live?petId=dog", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Sensor endpoint unavailable");

        const payload = await response.json();
        if (!isActive) return;

        setSensorSnapshot(payload.reading ?? null);
        setSensorError("");

        if (isDogSensorMode && payload.reading) {
          const mapped = mapSensorReadingToHealth(payload.reading);
          if (mapped) {
            setHealth((prev) => ({
              energy: clampMetric(blendMetric(prev.energy, mapped.energy, 0.68)),
              mood: clampMetric(blendMetric(prev.mood, mapped.mood, 0.68)),
              fitness: clampMetric(blendMetric(prev.fitness, mapped.fitness, 0.68)),
              hydration: clampMetric(
                blendMetric(prev.hydration, mapped.hydration, 0.68),
              ),
            }));
          }
        }
      } catch {
        if (!isActive) return;
        setSensorError("Cannot pull live sensor data");
      }
    };

    pullSensorData();
    const intervalId = setInterval(pullSensorData, SENSOR_POLL_MS);

    return () => {
      isActive = false;
      clearInterval(intervalId);
    };
  }, [isClient, isDogSensorMode, isSensorSyncEnabled]);

  useEffect(() => {
    const timerId = setInterval(() => {
      if (isLoadingModel) return;
      if (isDogSensorMode && isSensorFresh) return;

      const delta = getHealthDeltaFromAnimation(activeAnimation);

      setHealth((prev) => ({
        energy: clampMetric(prev.energy + delta.energy),
        mood: clampMetric(prev.mood + delta.mood),
        fitness: clampMetric(prev.fitness + delta.fitness),
        hydration: clampMetric(prev.hydration + delta.hydration),
      }));
    }, 2500);

    return () => {
      clearInterval(timerId);
    };
  }, [activeAnimation, isDogSensorMode, isLoadingModel, isSensorFresh]);

  useEffect(() => {
    if (isSensorSyncEnabled) return;
    setSensorError("");
  }, [isSensorSyncEnabled]);

  useEffect(() => {
    if (!isCameraTouring) {
      stopCameraTour();
      return;
    }

    stopCameraTween();

    const tick = (time) => {
      if (!cameraTourLastTimeRef.current) {
        cameraTourLastTimeRef.current = time;
      }

      const deltaSeconds = (time - cameraTourLastTimeRef.current) / 1000;
      cameraTourLastTimeRef.current = time;

      const current = cameraOrbitRef.current;
      setCameraOrbit(current.theta + 24 * deltaSeconds, current.phi, current.radius);
      cameraTourFrameRef.current = requestAnimationFrame(tick);
    };

    cameraTourFrameRef.current = requestAnimationFrame(tick);

    return () => {
      stopCameraTour();
    };
  }, [isCameraTouring, setCameraOrbit, stopCameraTour, stopCameraTween]);

  useEffect(() => {
    if (!isClient) return;

    const viewer = viewerRef.current;
    if (!viewer) return;

    const handleModelLoad = () => {
      const rawAnimations = Array.isArray(viewer.availableAnimations)
        ? viewer.availableAnimations
        : [];
      const orderedAnimations = orderAnimations(rawAnimations);
      const essentialAnimations = pickEssentialAnimations(orderedAnimations);

      setAvailableAnimations(essentialAnimations);

      if (essentialAnimations.length > 0) {
        const nextAnimation = essentialAnimations[0];
        viewer.animationName = nextAnimation;
        viewer.play();
        setActiveAnimation(nextAnimation);
      } else {
        setActiveAnimation("");
      }

      const orbit = cameraOrbitRef.current;
      setCameraOrbit(orbit.theta, orbit.phi, orbit.radius);
      setIsLoadingModel(false);
    };

    const handleModelError = () => {
      setIsLoadingModel(false);
      setAvailableAnimations([]);
      setActiveAnimation("");
    };
    const handleArStatus = (event) => {
      if (event?.detail?.status === "session-started") {
        const nextAnimation = viewer.animationName || activeAnimation;
        if (nextAnimation) {
          viewer.animationName = nextAnimation;
        }
        viewer.play();
      }
    };

    viewer.addEventListener("load", handleModelLoad);
    viewer.addEventListener("error", handleModelError);
    viewer.addEventListener("ar-status", handleArStatus);

    if (viewer.loaded) {
      handleModelLoad();
    }

    return () => {
      viewer.removeEventListener("load", handleModelLoad);
      viewer.removeEventListener("error", handleModelError);
      viewer.removeEventListener("ar-status", handleArStatus);
    };
  }, [activeAnimation, isClient, setCameraOrbit]);

  const playAnimation = useCallback((animationName) => {
    if (!viewerRef.current || !animationName) return;
    viewerRef.current.animationName = animationName;
    viewerRef.current.play();
    setActiveAnimation(animationName);
  }, []);

  const toggleSound = useCallback(async () => {
    if (isPlayingSound) {
      stopSound();
      return;
    }

    stopSound();

    const audio = new Audio(activePet.soundPath);
    audioRef.current = audio;

    audio.onended = () => {
      audioRef.current = null;
      setIsPlayingSound(false);
    };

    try {
      await audio.play();
      setIsPlayingSound(true);
      setHealth((prev) => ({
        ...prev,
        mood: clampMetric(prev.mood + 2.5),
      }));
    } catch {
      setIsPlayingSound(false);
    }
  }, [activePet.soundPath, isPlayingSound, stopSound]);

  const toggleCameraTour = useCallback(() => {
    setIsCameraTouring((prev) => !prev);
  }, []);
  const applyHealthAction = useCallback((actionId) => {
    const action = HEALTH_ACTIONS.find((item) => item.id === actionId);
    if (!action) return;

    setHealth((prev) => ({
      energy: clampMetric(prev.energy + (action.delta.energy ?? 0)),
      mood: clampMetric(prev.mood + (action.delta.mood ?? 0)),
      fitness: clampMetric(prev.fitness + (action.delta.fitness ?? 0)),
      hydration: clampMetric(prev.hydration + (action.delta.hydration ?? 0)),
    }));
  }, []);
  const ensureAnimationIsPlaying = useCallback(
    (preferredAnimation) => {
      const viewer = viewerRef.current;
      if (!viewer) return;

      const nextAnimation = preferredAnimation || activeAnimation;
      if (nextAnimation) {
        viewer.animationName = nextAnimation;
      }
      viewer.play();
    },
    [activeAnimation],
  );
  const openArCamera = useCallback(async () => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    ensureAnimationIsPlaying();
    try {
      await viewer.activateAR();
    } catch {
      // No-op: unsupported browsers simply stay in 3D mode.
    }
  }, [ensureAnimationIsPlaying]);

  return (
    <main className="page-shell">
      <section className="hero reveal reveal-1">
        <p className="eyebrow">WebXR Playground</p>
        <h1>AR Pet Studio</h1>
        <p className="subtitle">
          เลือกสัตว์ ดูโมเดล 3D/AR และติดตามสุขภาพในหน้าเดียว
        </p>
        <div className="quick-overview">
          <article className="quick-card">
            <p>Active Pet</p>
            <strong>{activePet.label}</strong>
          </article>
          <article className="quick-card">
            <p>Health Score</p>
            <strong>{healthScore}/100</strong>
          </article>
          <article className="quick-card">
            <p>Sensor</p>
            <strong>{activePetId === "dog" ? sensorLabel : "Dog only"}</strong>
          </article>
        </div>
      </section>

      {PETS.length > 1 && (
        <section className="panel reveal reveal-2">
          <h2>Choose a pet</h2>
          <div className="pet-grid">
            {PETS.map((pet) => (
              <button
                key={pet.id}
                type="button"
                className={`pet-card ${
                  activePetId === pet.id ? "is-active" : ""
                } accent-${pet.accent}`}
                onClick={() => setActivePetId(pet.id)}
                aria-pressed={activePetId === pet.id}
              >
                <img src={pet.iconPath} alt={pet.label} />
                <span>{pet.label}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="panel reveal reveal-3">
        <div className="viewer-header">
          <h2>{activePet.label} Model Viewer</h2>
          <div className="viewer-actions">
            <span className="status-chip">
              {isLoadingModel ? "Loading model..." : "Model ready"}
            </span>
            <button
              type="button"
              className="chip chip-soft"
              onClick={openArCamera}
              disabled={isLoadingModel}
            >
              Open AR Camera
            </button>
          </div>
        </div>

        <div className="viewer-wrapper">
          {isLoadingModel && (
            <div className="loading-overlay">
              <p>Preparing 3D asset...</p>
            </div>
          )}

          {isClient ? (
            <model-viewer
              ref={viewerRef}
              src={activePet.modelPath}
              ar
              ar-modes="scene-viewer webxr quick-look"
              autoplay
              animation-loop
              animation-name={activeAnimation || undefined}
              camera-controls
              shadow-intensity="1"
              exposure="1"
              environment-image="neutral"
              alt={`${activePet.label} 3D model`}
            />
          ) : (
            <div className="viewer-fallback" aria-hidden="true" />
          )}
        </div>
      </section>

      <section className="panel reveal reveal-4">
        <div className="health-head">
          <h2>Wellness Tracker</h2>
          <div className="health-head-actions">
            <span className={`health-badge health-${healthStatus.tone}`}>
              {healthStatus.label}
            </span>
            <button
              type="button"
              className={`chip chip-soft chip-sensor-toggle ${
                isSensorSyncEnabled ? "is-active" : ""
              }`}
              onClick={() => setIsSensorSyncEnabled((prev) => !prev)}
            >
              {isSensorSyncEnabled ? "Sensor Sync On" : "Sensor Sync Off"}
            </button>
          </div>
        </div>
        {activePetId === "dog" && (
          <div className="sensor-card">
            <div className="sensor-status-row">
              <span
                className={`sensor-pill ${
                  sensorLabel === "Sensor Live"
                    ? "sensor-live"
                    : sensorLabel === "Sensor Stale"
                      ? "sensor-stale"
                      : sensorLabel === "Sensor Error"
                        ? "sensor-error"
                        : "sensor-wait"
                }`}
              >
                {sensorLabel}
              </span>
              <span className="sensor-updated">
                {formatSensorTime(sensorSnapshot?.timestamp)}
              </span>
            </div>
            <div className="sensor-grid">
              <div>
                <p>Heart Rate</p>
                <strong>{sensorSnapshot?.heartRate ?? "--"} bpm</strong>
              </div>
              <div>
                <p>Temp</p>
                <strong>{sensorSnapshot?.temperatureC ?? "--"} C</strong>
              </div>
              <div>
                <p>SpO2</p>
                <strong>{sensorSnapshot?.spo2 ?? "--"}%</strong>
              </div>
              <div>
                <p>Activity</p>
                <strong>{sensorSnapshot?.activityLevel ?? "--"}%</strong>
              </div>
            </div>
            {sensorError && <p className="sensor-error-copy">{sensorError}</p>}
            <p className="sensor-hint">
              Feed sensor data by POSTing to <code>/api/health/ingest</code> from
              your device gateway.
            </p>
          </div>
        )}
        <p className="health-score">
          Health Score <strong>{healthScore}</strong>/100
        </p>
        <div className="health-grid">
          {HEALTH_METRICS.map((metric) => (
            <div key={metric.key} className="health-row">
              <div className="health-row-head">
                <span>{metric.label}</span>
                <span>{Math.round(health[metric.key])}%</span>
              </div>
              <div className="health-track">
                <span
                  className="health-fill"
                  style={{
                    width: `${health[metric.key]}%`,
                    background: metric.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="button-row health-action-row">
          {HEALTH_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              className="chip chip-health"
              onClick={() => applyHealthAction(action.id)}
            >
              {action.label}
            </button>
          ))}
        </div>
        <p className="health-note">
          Simulation metric for the AR pet experience, not a medical system.
        </p>
      </section>

      <section className="panel reveal reveal-5">
        <h2>Controls</h2>
        <p className="empty-copy">รวมปุ่มควบคุมสำคัญไว้ในแผงเดียว</p>
        <div className="control-stack">
          <div className="control-block">
            <div className="camera-head">
              <h3 className="control-head">Camera Motion</h3>
              <button
                type="button"
                className={`chip chip-soft ${isCameraTouring ? "is-active" : ""}`}
                onClick={toggleCameraTour}
              >
                {isCameraTouring ? "Stop Auto Tour" : "Start Auto Tour"}
              </button>
            </div>
            <div className="button-row">
              {CAMERA_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`chip ${
                    !isCameraTouring && activeCameraPreset === preset.id
                      ? "is-active"
                      : ""
                  }`}
                  onClick={() => applyCameraPreset(preset.id)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="control-block">
            <h3 className="control-head">Animations</h3>
            {availableAnimations.length > 0 ? (
              <div className="button-row">
                {availableAnimations.map((animationName) => (
                  <button
                    key={animationName}
                    type="button"
                    className={`chip ${activeAnimation === animationName ? "is-active" : ""}`}
                    onClick={() => playAnimation(animationName)}
                  >
                    {animationName}
                  </button>
                ))}
              </div>
            ) : (
              <p className="empty-copy">No embedded animations detected for this model.</p>
            )}
            {availableAnimations.length > 0 && (
              <p className="control-tip">แสดงเฉพาะท่าหลักที่จำเป็น</p>
            )}
          </div>

          <div className="control-block">
            <h3 className="control-head">Sound</h3>
            <button
              type="button"
              className={`sound-btn ${isPlayingSound ? "is-playing" : ""}`}
              onClick={toggleSound}
            >
              {isPlayingSound ? "Stop Sound" : "Play Sound"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
