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

function clampMetric(value) {
  return Math.max(0, Math.min(100, value));
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
    setIsLoadingModel(true);
    setAvailableAnimations([]);
    setActiveAnimation("");
    setHealth({
      ...(PET_BASE_HEALTH[activePetId] ?? PET_BASE_HEALTH[PETS[0].id]),
    });
    stopSound();
  }, [activePetId, stopSound]);

  useEffect(() => {
    const timerId = setInterval(() => {
      if (isLoadingModel) return;

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
  }, [activeAnimation, isLoadingModel]);

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

      setAvailableAnimations(orderedAnimations);

      if (orderedAnimations.length > 0) {
        const nextAnimation = orderedAnimations[0];
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

    viewer.addEventListener("load", handleModelLoad);
    viewer.addEventListener("error", handleModelError);

    if (viewer.loaded) {
      handleModelLoad();
    }

    return () => {
      viewer.removeEventListener("load", handleModelLoad);
      viewer.removeEventListener("error", handleModelError);
    };
  }, [isClient, setCameraOrbit]);

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

  return (
    <main className="page-shell">
      <div className="bg-orb orb-1" aria-hidden="true" />
      <div className="bg-orb orb-2" aria-hidden="true" />

      <section className="hero reveal reveal-1">
        <p className="eyebrow">WebXR Playground</p>
        <h1>AR Pet Studio</h1>
        <p className="subtitle">
          Tap a pet, inspect the model in 3D, then launch it in AR. Animation
          buttons are auto-generated from each GLB file.
        </p>
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
          <span className="status-chip">
            {isLoadingModel ? "Loading model..." : "Model ready"}
          </span>
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
          <span className={`health-badge health-${healthStatus.tone}`}>
            {healthStatus.label}
          </span>
        </div>
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
        <div className="camera-head">
          <h2>Camera Motion</h2>
          <button
            type="button"
            className={`chip chip-soft ${isCameraTouring ? "is-active" : ""}`}
            onClick={toggleCameraTour}
          >
            {isCameraTouring ? "Stop Auto Tour" : "Start Auto Tour"}
          </button>
        </div>
        <p className="empty-copy">
          ใช้ปุ่มมุมกล้องสำหรับช็อตนิ่ง หรือเปิด Auto Tour เพื่อหมุนกล้องรอบโมเดล
        </p>
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
      </section>

      <section className="panel reveal reveal-6">
        <h2>Animations</h2>
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
          <p className="empty-copy">
            No embedded animations detected for this model.
          </p>
        )}
      </section>

      <section className="panel reveal reveal-7">
        <h2>Sound</h2>
        <button
          type="button"
          className={`sound-btn ${isPlayingSound ? "is-playing" : ""}`}
          onClick={toggleSound}
        >
          {isPlayingSound ? "Stop Sound" : "Play Sound"}
        </button>
      </section>
    </main>
  );
}
