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

const PROFILE_STORAGE_KEY = "ar_pet_profiles_v2";
const DEFAULT_PET_PROFILES = {
  dog: {
    name: "Bolt",
    age: 4,
    voiceStyle: "playful",
    storySeed: "ชอบวิ่งในสวนและเฝ้าบ้าน",
  },
  cat: {
    name: "Luna",
    age: 3,
    voiceStyle: "gentle",
    storySeed: "ชอบนอนอาบแดดและเดินสำรวจบ้าน",
  },
};

const VOICE_STYLES = [
  {
    id: "playful",
    label: "Playful",
    dogVoice: "โฮ่ง! โฮ่ง! พร้อมลุย",
    catVoice: "เหมียว~ มาเล่นกัน",
    playbackRate: 1.08,
  },
  {
    id: "gentle",
    label: "Gentle",
    dogVoice: "โฮ่ง... อย่างสุภาพ",
    catVoice: "เหมียว... อย่างนุ่มนวล",
    playbackRate: 0.95,
  },
  {
    id: "guardian",
    label: "Guardian",
    dogVoice: "โฮ่ง! พื้นที่นี้ปลอดภัย",
    catVoice: "เมี้ยว! คุมพื้นที่แล้ว",
    playbackRate: 1.02,
  },
];
const VOICE_STYLE_IDS = new Set(VOICE_STYLES.map((style) => style.id));

const ANIMATION_PRIORITY = ["Idle", "Walk", "Run", "Jump", "Survey"];
const MAX_VISIBLE_ANIMATIONS = 3;
const ANIMATION_MODES = {
  MANUAL: "manual",
  AUTO: "auto",
};
const ANIMATION_KEEPALIVE_MS = 500;
const ANIMATION_AUTO_STEP_MS = 3200;
const SENSOR_POLL_MS = 3000;
const SENSOR_STALE_MS = 15000;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampMetric(value) {
  return clamp(value, 0, 100);
}

function blendMetric(current, target, weight) {
  return current + (target - current) * weight;
}

function formatSensorTime(timestamp) {
  if (!timestamp) return "No live data";
  const deltaSec = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (deltaSec < 3) return "Updated just now";
  return `Updated ${deltaSec}s ago`;
}

function formatAnimationLabel(animationName) {
  if (!animationName) return "";
  const cleaned = animationName
    .split(/[|:/]/)
    .pop()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 18 ? `${cleaned.slice(0, 18)}...` : cleaned;
}

function getHealthDeltaFromAnimation(animationName) {
  const name = (animationName || "").toLowerCase();

  if (
    name.includes("run") ||
    name.includes("jump") ||
    name.includes("attack") ||
    name.includes("gallop")
  ) {
    return { energy: -2.4, mood: 0.7, fitness: 1.3, hydration: -1.1 };
  }

  if (name.includes("walk") || name.includes("survey")) {
    return { energy: -1.3, mood: 0.5, fitness: 0.8, hydration: -0.6 };
  }

  if (name.includes("idle") || name.includes("rest") || name.includes("sleep")) {
    return { energy: 1.0, mood: 0.3, fitness: 0.1, hydration: -0.2 };
  }

  return { energy: -0.6, mood: 0.2, fitness: 0.4, hydration: -0.4 };
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

function orderAnimations(rawAnimations) {
  const unique = [...new Set((rawAnimations || []).filter(Boolean))];
  const byLower = new Map(unique.map((name) => [name.toLowerCase(), name]));

  const prioritized = ANIMATION_PRIORITY.map((name) =>
    byLower.get(name.toLowerCase()),
  ).filter(Boolean);

  const used = new Set(prioritized.map((name) => name.toLowerCase()));
  const extras = unique.filter((name) => !used.has(name.toLowerCase()));

  return [...prioritized, ...extras];
}

function pickVisibleAnimations(animations) {
  if (!animations.length) return [];
  return animations.slice(0, MAX_VISIBLE_ANIMATIONS);
}

function findAnimationByKeywords(animations, keywords) {
  return (
    animations.find((name) =>
      keywords.some((keyword) => name.toLowerCase().includes(keyword)),
    ) || ""
  );
}

function pickAutoAnimation(animations, { healthScore, isDogSensorMode, isSensorFresh }) {
  if (!animations.length) return "";

  const active = findAnimationByKeywords(animations, [
    "run",
    "walk",
    "jump",
    "gallop",
    "survey",
  ]);
  const rest = findAnimationByKeywords(animations, ["idle", "rest", "sleep"]);
  const stable = findAnimationByKeywords(animations, ["walk", "survey", "idle"]);

  if (healthScore >= 78 && (!isDogSensorMode || isSensorFresh)) {
    return active || stable || animations[0];
  }

  if (healthScore <= 55) {
    return rest || stable || animations[0];
  }

  return stable || active || rest || animations[0];
}

function pickArMotionAnimation(animations, fallbackAnimation = "") {
  if (!animations.length) return fallbackAnimation;

  return (
    findAnimationByKeywords(animations, [
      "run",
      "walk",
      "jump",
      "gallop",
      "attack",
      "survey",
    ]) || fallbackAnimation || animations[0]
  );
}

function normalizeProfilesFromStorage(input) {
  const nextProfiles = { ...DEFAULT_PET_PROFILES };
  if (!input || typeof input !== "object") return nextProfiles;

  Object.keys(nextProfiles).forEach((petId) => {
    const profile = input[petId];
    if (!profile || typeof profile !== "object") return;

    const age = Number(profile.age);
    nextProfiles[petId] = {
      ...nextProfiles[petId],
      name:
        typeof profile.name === "string" && profile.name.trim()
          ? profile.name.trim()
          : nextProfiles[petId].name,
      age: Number.isFinite(age) ? clamp(Math.round(age), 0, 30) : nextProfiles[petId].age,
      voiceStyle:
        typeof profile.voiceStyle === "string" &&
        VOICE_STYLE_IDS.has(profile.voiceStyle.trim())
          ? profile.voiceStyle.trim()
          : nextProfiles[petId].voiceStyle,
      storySeed:
        typeof profile.storySeed === "string"
          ? profile.storySeed.slice(0, 160)
          : nextProfiles[petId].storySeed,
    };
  });

  return nextProfiles;
}

export default function Home() {
  const viewerRef = useRef(null);
  const audioRef = useRef(null);
  const arTimeoutsRef = useRef([]);
  const animationKeepAliveRef = useRef(0);
  const availableAnimationsRef = useRef([]);
  const activeAnimationRef = useRef("");
  const isAnimationPausedRef = useRef(false);
  const runAnimationRef = useRef(() => {});
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
  const [modelError, setModelError] = useState("");
  const [availableAnimations, setAvailableAnimations] = useState([]);
  const [activeAnimation, setActiveAnimation] = useState("");
  const [animationMode, setAnimationMode] = useState(ANIMATION_MODES.MANUAL);
  const [animationSpeed, setAnimationSpeed] = useState(1);
  const [isAnimationPaused, setIsAnimationPaused] = useState(false);
  const [isPlayingSound, setIsPlayingSound] = useState(false);

  const [health, setHealth] = useState({ ...PET_BASE_HEALTH[PETS[0].id] });
  const [sensorSnapshot, setSensorSnapshot] = useState(null);
  const [sensorError, setSensorError] = useState("");
  const [isSensorSyncEnabled, setIsSensorSyncEnabled] = useState(true);
  const [sensorClock, setSensorClock] = useState(Date.now());

  const [activeCameraPreset, setActiveCameraPreset] = useState(CAMERA_PRESETS[0].id);
  const [isCameraTouring, setIsCameraTouring] = useState(false);
  const [isArPresenting, setIsArPresenting] = useState(false);

  const [petProfiles, setPetProfiles] = useState(DEFAULT_PET_PROFILES);

  const activePet = useMemo(
    () => PETS.find((pet) => pet.id === activePetId) ?? PETS[0],
    [activePetId],
  );

  const activeProfile = useMemo(
    () => petProfiles[activePetId] ?? DEFAULT_PET_PROFILES[activePetId],
    [activePetId, petProfiles],
  );

  const activeVoiceStyle = useMemo(
    () =>
      VOICE_STYLES.find((item) => item.id === activeProfile.voiceStyle) ?? VOICE_STYLES[0],
    [activeProfile.voiceStyle],
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

  const animationStatusLabel = useMemo(() => {
    if (!activeAnimation) return "No animation";

    const playState = isAnimationPaused ? "Paused" : "Playing";
    const modeState =
      animationMode === ANIMATION_MODES.AUTO ? "Auto Mode" : "Manual Mode";
    return `${playState} • ${modeState}`;
  }, [activeAnimation, animationMode, isAnimationPaused]);

  const autoSuggestedAnimation = useMemo(
    () =>
      pickAutoAnimation(availableAnimations, {
        healthScore,
        isDogSensorMode,
        isSensorFresh,
      }),
    [availableAnimations, healthScore, isDogSensorMode, isSensorFresh],
  );

  const soundPlaybackRate = useMemo(() => {
    const healthMod = healthScore >= 85 ? 1.05 : healthScore <= 55 ? 0.92 : 1;
    return clamp(activeVoiceStyle.playbackRate * healthMod, 0.72, 1.28);
  }, [activeVoiceStyle.playbackRate, healthScore]);

  const profileInsight = useMemo(() => {
    const petName = activeProfile.name || activePet.label;
    const age = clamp(Number(activeProfile.age) || 0, 0, 30);
    const ageLabel = age <= 1 ? "วัยเด็ก" : age <= 7 ? "วัย active" : "วัยผู้ใหญ่";

    const personality =
      healthScore >= 85
        ? "พลังสูง มั่นใจ และพร้อมทำกิจกรรม"
        : healthScore >= 70
          ? "นิ่ง สมดุล และโฟกัสดี"
          : healthScore >= 50
            ? "ต้องการดูแลเพิ่มและพักเป็นช่วง"
            : "อ่อนล้า ควรเน้นพักและติดตามสัญญาณ";

    const story = `${petName} (${ageLabel}) ชอบ ${activeProfile.storySeed}. ขณะนี้ท่าหลักคือ ${
      activeAnimation || "Idle"
    } และ Health อยู่ที่ ${healthScore}/100.`;

    return {
      petName,
      age,
      personality,
      story,
      voiceLine: activePet.id === "dog" ? activeVoiceStyle.dogVoice : activeVoiceStyle.catVoice,
    };
  }, [
    activeAnimation,
    activePet.id,
    activePet.label,
    activeProfile.age,
    activeProfile.name,
    activeProfile.storySeed,
    activeVoiceStyle.catVoice,
    activeVoiceStyle.dogVoice,
    healthScore,
  ]);

  const clearArTimeouts = useCallback(() => {
    arTimeoutsRef.current.forEach((id) => clearTimeout(id));
    arTimeoutsRef.current = [];
  }, []);

  const stopSound = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    audioRef.current = null;
    setIsPlayingSound(false);
  }, []);

  const stopAnimationKeepAlive = useCallback(() => {
    if (!animationKeepAliveRef.current) return;
    clearInterval(animationKeepAliveRef.current);
    animationKeepAliveRef.current = 0;
  }, []);

  const runAnimation = useCallback(
    (requestedAnimation, options = {}) => {
      const viewer = viewerRef.current;
      if (!viewer) return;

      const targetAnimation = requestedAnimation || activeAnimation || viewer.animationName;
      if (!targetAnimation) return;

      const restart = Boolean(options.restart);
      const manualSelection = Boolean(options.manualSelection);

      viewer.animationLoop = true;
      if (viewer.animationName !== targetAnimation) {
        viewer.animationName = targetAnimation;
      }
      if (typeof viewer.timeScale === "number") {
        viewer.timeScale = animationSpeed;
      }
      if (restart) {
        viewer.currentTime = 0;
      }

      viewer.play();
      setActiveAnimation(targetAnimation);
      setIsAnimationPaused(false);
      if (manualSelection) {
        setAnimationMode(ANIMATION_MODES.MANUAL);
      }
    },
    [activeAnimation, animationSpeed],
  );

  useEffect(() => {
    availableAnimationsRef.current = availableAnimations;
  }, [availableAnimations]);

  useEffect(() => {
    activeAnimationRef.current = activeAnimation;
  }, [activeAnimation]);

  useEffect(() => {
    isAnimationPausedRef.current = isAnimationPaused;
  }, [isAnimationPaused]);

  useEffect(() => {
    runAnimationRef.current = runAnimation;
  }, [runAnimation]);

  const pauseAnimation = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.pause();
    setIsAnimationPaused(true);
  }, []);

  const resumeAnimation = useCallback(() => {
    runAnimation(activeAnimation || availableAnimations[0], { restart: false });
  }, [activeAnimation, availableAnimations, runAnimation]);

  const toggleAnimationPlayback = useCallback(() => {
    if (isAnimationPaused) {
      resumeAnimation();
      return;
    }
    pauseAnimation();
  }, [isAnimationPaused, pauseAnimation, resumeAnimation]);

  const cycleAnimation = useCallback(
    (direction) => {
      if (!availableAnimations.length) return;
      const currentIndex = Math.max(0, availableAnimations.indexOf(activeAnimation));
      const nextIndex =
        (currentIndex + direction + availableAnimations.length) % availableAnimations.length;
      runAnimation(availableAnimations[nextIndex], {
        restart: true,
        manualSelection: true,
      });
    },
    [activeAnimation, availableAnimations, runAnimation],
  );

  const setCameraOrbit = useCallback((theta, phi, radius) => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    cameraOrbitRef.current = { theta, phi, radius };
    viewer.cameraOrbit = `${theta.toFixed(2)}deg ${phi.toFixed(2)}deg ${radius.toFixed(2)}%`;
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

  const updateProfile = useCallback(
    (field, value) => {
      setPetProfiles((prev) => {
        const current = prev[activePetId] ?? DEFAULT_PET_PROFILES[activePetId];
        let nextValue = value;

        if (field === "age") {
          if (value === "") {
            return prev;
          }
          const parsed = Number(value);
          if (!Number.isFinite(parsed)) {
            return prev;
          }
          nextValue = clamp(Math.round(parsed), 0, 30);
        }

        if (field === "voiceStyle") {
          if (!VOICE_STYLE_IDS.has(String(value))) {
            return prev;
          }
        }

        return {
          ...prev,
          [activePetId]: {
            ...current,
            [field]: nextValue,
          },
        };
      });
    },
    [activePetId],
  );

  const playAnimation = useCallback(
    (animationName) => {
      if (!animationName) return;
      runAnimation(animationName, { restart: true, manualSelection: true });
    },
    [runAnimation],
  );

  const applyAutoSuggestionNow = useCallback(() => {
    if (!autoSuggestedAnimation) return;
    runAnimation(autoSuggestedAnimation, { restart: false });
  }, [autoSuggestedAnimation, runAnimation]);

  const toggleSound = useCallback(async () => {
    if (isPlayingSound) {
      stopSound();
      return;
    }

    stopSound();

    const audio = new Audio(activePet.soundPath);
    audio.playbackRate = soundPlaybackRate;
    audio.volume = activePet.id === "dog" ? 0.96 : 0.9;
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
        energy: clampMetric(prev.energy + 0.6),
      }));
    } catch {
      setIsPlayingSound(false);
    }
  }, [activePet.id, activePet.soundPath, isPlayingSound, soundPlaybackRate, stopSound]);

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

  const openArCamera = useCallback(async () => {
    const viewer = viewerRef.current;
    if (!viewer || isLoadingModel || modelError) return;

    const arAnimation = pickArMotionAnimation(
      availableAnimations,
      activeAnimation || autoSuggestedAnimation,
    );
    runAnimation(arAnimation, { restart: false });

    try {
      await viewer.activateAR();
    } catch {
      // Unsupported browsers remain in 3D mode.
    }
  }, [
    activeAnimation,
    autoSuggestedAnimation,
    availableAnimations,
    isLoadingModel,
    modelError,
    runAnimation,
  ]);

  useEffect(() => {
    return () => {
      stopSound();
      stopAnimationKeepAlive();
      stopCameraTween();
      stopCameraTour();
      clearArTimeouts();
    };
  }, [clearArTimeouts, stopAnimationKeepAlive, stopCameraTour, stopCameraTween, stopSound]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;

    try {
      const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setPetProfiles(normalizeProfilesFromStorage(parsed));
    } catch {
      // Ignore invalid profile JSON and keep defaults.
    }
  }, [isClient]);

  useEffect(() => {
    if (!isClient) return;
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(petProfiles));
  }, [isClient, petProfiles]);

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
    setModelError("");
    setAvailableAnimations([]);
    setActiveAnimation("");
    setAnimationMode(ANIMATION_MODES.MANUAL);
    setAnimationSpeed(1);
    setIsAnimationPaused(false);
    setIsArPresenting(false);
    setHealth({ ...(PET_BASE_HEALTH[activePetId] ?? PET_BASE_HEALTH[PETS[0].id]) });
    clearArTimeouts();
    stopSound();
  }, [activePetId, clearArTimeouts, stopSound]);

  useEffect(() => {
    if (!isClient || !isSensorSyncEnabled) return;

    let isActive = true;

    const pullSensorData = async () => {
      try {
        const response = await fetch("/api/health/live?petId=dog", { cache: "no-store" });
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
              hydration: clampMetric(blendMetric(prev.hydration, mapped.hydration, 0.68)),
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
      if (!activeAnimation) return;
      if (isAnimationPaused) return;
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
  }, [activeAnimation, isAnimationPaused, isDogSensorMode, isLoadingModel, isSensorFresh]);

  useEffect(() => {
    if (isSensorSyncEnabled) return;
    setSensorError("");
  }, [isSensorSyncEnabled]);

  useEffect(() => {
    stopAnimationKeepAlive();
    if (!isClient || !activeAnimation || isAnimationPaused) return;

    animationKeepAliveRef.current = setInterval(() => {
      const viewer = viewerRef.current;
      if (!viewer) return;

      viewer.animationLoop = true;
      if (typeof viewer.timeScale === "number") {
        viewer.timeScale = animationSpeed;
      }
      if (viewer.animationName !== activeAnimation) {
        viewer.animationName = activeAnimation;
      }
      if (viewer.paused) {
        viewer.play();
      }
    }, ANIMATION_KEEPALIVE_MS);

    return () => {
      stopAnimationKeepAlive();
    };
  }, [activeAnimation, animationSpeed, isAnimationPaused, isClient, stopAnimationKeepAlive]);

  useEffect(() => {
    if (!isClient) return;
    if (animationMode !== ANIMATION_MODES.AUTO) return;
    if (isAnimationPaused) return;
    if (!availableAnimations.length) return;

    const playAuto = () => {
      const next = pickAutoAnimation(availableAnimations, {
        healthScore,
        isDogSensorMode,
        isSensorFresh,
      });
      if (!next) return;
      runAnimation(next, { restart: false });
    };

    playAuto();
    const intervalId = setInterval(playAuto, ANIMATION_AUTO_STEP_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [
    animationMode,
    availableAnimations,
    healthScore,
    isAnimationPaused,
    isClient,
    isDogSensorMode,
    isSensorFresh,
    runAnimation,
  ]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    if (typeof viewer.timeScale === "number") {
      viewer.timeScale = animationSpeed;
    }
  }, [animationSpeed, isClient]);

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

      const deltaSec = (time - cameraTourLastTimeRef.current) / 1000;
      cameraTourLastTimeRef.current = time;

      const current = cameraOrbitRef.current;
      setCameraOrbit(current.theta + 24 * deltaSec, current.phi, current.radius);
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
      setModelError("");
      const rawAnimations = Array.isArray(viewer.availableAnimations)
        ? viewer.availableAnimations
        : [];

      const ordered = orderAnimations(rawAnimations);
      const visible = pickVisibleAnimations(ordered);

      setAvailableAnimations(visible);
      if (visible.length > 0) {
        runAnimationRef.current(visible[0], { restart: false });
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
      setModelError("Model failed to load. Check /public/models and try again.");
    };

    const handleArStatus = (event) => {
      const status = event?.detail?.status;

      if (status === "session-started") {
        setIsArPresenting(true);
        const target = pickArMotionAnimation(
          availableAnimationsRef.current,
          activeAnimationRef.current,
        );
        clearArTimeouts();

        [120, 600, 1500].forEach((delay, index) => {
          const timeoutId = setTimeout(() => {
            runAnimationRef.current(target, { restart: index === 0 });
          }, delay);
          arTimeoutsRef.current.push(timeoutId);
        });
        return;
      }

      if (
        status === "not-presenting" ||
        status === "session-ended" ||
        status === "failed"
      ) {
        setIsArPresenting(false);
        clearArTimeouts();
      }
    };

    const handleAnimationFinished = () => {
      if (isAnimationPausedRef.current) return;
      if (!viewer.animationName) return;
      viewer.play();
    };

    viewer.addEventListener("load", handleModelLoad);
    viewer.addEventListener("error", handleModelError);
    viewer.addEventListener("ar-status", handleArStatus);
    viewer.addEventListener("finished", handleAnimationFinished);

    if (viewer.loaded) {
      handleModelLoad();
    }

    return () => {
      viewer.removeEventListener("load", handleModelLoad);
      viewer.removeEventListener("error", handleModelError);
      viewer.removeEventListener("ar-status", handleArStatus);
      viewer.removeEventListener("finished", handleAnimationFinished);
    };
  }, [clearArTimeouts, isClient, setCameraOrbit]);

  return (
    <main className="page-shell">
      <section className="hero reveal reveal-1">
        <p className="eyebrow">WebXR Playground</p>
        <h1>AR Pet Studio</h1>
        <p className="subtitle">ระบบใหม่ที่รีเซ็ตให้เสถียรขึ้นสำหรับ AR + Animation + Health</p>
        <div className="quick-overview">
          <article className="quick-card">
            <p>Active Pet</p>
            <strong>{activePet.label}</strong>
          </article>
          <article className="quick-card">
            <p>Profile Name</p>
            <strong>{profileInsight.petName}</strong>
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
          <h2>Choose A Pet</h2>
          <div className="pet-grid">
            {PETS.map((pet) => (
              <button
                key={pet.id}
                type="button"
                className={`pet-card ${activePetId === pet.id ? "is-active" : ""} accent-${
                  pet.accent
                }`}
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
        <div className="profile-head">
          <h2>Pet Profile</h2>
          <span className="status-chip">Stable Profile Engine</span>
        </div>
        <div className="profile-grid">
          <div className="profile-card">
            <label className="profile-field">
              <span>Name</span>
              <input
                type="text"
                maxLength={28}
                value={activeProfile.name}
                onChange={(event) => updateProfile("name", event.target.value)}
                placeholder="Pet name"
              />
            </label>
            <label className="profile-field">
              <span>Age</span>
              <input
                type="number"
                min={0}
                max={30}
                value={activeProfile.age}
                onChange={(event) => updateProfile("age", event.target.value)}
              />
            </label>
            <label className="profile-field">
              <span>Voice Style</span>
              <select
                value={activeProfile.voiceStyle}
                onChange={(event) => updateProfile("voiceStyle", event.target.value)}
              >
                {VOICE_STYLES.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="profile-field">
              <span>Story Hint</span>
              <textarea
                rows={3}
                maxLength={160}
                value={activeProfile.storySeed}
                onChange={(event) => updateProfile("storySeed", event.target.value)}
              />
            </label>
          </div>

          <div className="profile-card">
            <p className="profile-ai-line">
              <strong>Personality:</strong> {profileInsight.personality}
            </p>
            <p className="profile-ai-line">
              <strong>Story:</strong> {profileInsight.story}
            </p>
            <p className="profile-ai-line">
              <strong>Voice:</strong> {profileInsight.voiceLine}
            </p>
          </div>
        </div>
      </section>

      <section className="panel reveal reveal-4">
        <div className="viewer-header">
          <h2>{activePet.label} Model Viewer</h2>
          <div className="viewer-actions">
            <span className="status-chip">
              {isLoadingModel
                ? "Loading model..."
                : modelError
                  ? "Model error"
                  : "Model ready"}
            </span>
            <span className="status-chip">{isArPresenting ? "AR Live" : "AR Standby"}</span>
            <button
              type="button"
              className="chip chip-soft"
              onClick={openArCamera}
              disabled={isLoadingModel || Boolean(modelError)}
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

          {!!modelError && (
            <div className="loading-overlay loading-overlay-error">
              <p>{modelError}</p>
            </div>
          )}

          {isClient ? (
            <model-viewer
              ref={viewerRef}
              src={activePet.modelPath}
              ar
              ar-modes="webxr scene-viewer quick-look"
              autoplay
              animation-loop
              animation-name={activeAnimation || undefined}
              animation-crossfade-duration="280"
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

      <section className="panel reveal reveal-5">
        <div className="health-head">
          <h2>Wellness Tracker</h2>
          <div className="health-head-actions">
            <span className={`health-badge health-${healthStatus.tone}`}>{healthStatus.label}</span>
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
              <span className="sensor-updated">{formatSensorTime(sensorSnapshot?.timestamp)}</span>
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
              Feed sensor data by POSTing to <code>/api/health/ingest</code> from your device.
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

        <p className="health-note">Simulation metric for AR pet experience, not medical advice.</p>
      </section>

      <section className="panel reveal reveal-6">
        <h2>Controls</h2>
        <p className="empty-copy">แผงควบคุมใหม่ ลดโค้ดซ้ำและเน้นความเสถียร</p>

        <div className="control-stack">
          <div className="control-block">
            <div className="camera-head">
              <h3 className="control-head">Camera Motion</h3>
              <button
                type="button"
                className={`chip chip-soft ${isCameraTouring ? "is-active" : ""}`}
                onClick={() => setIsCameraTouring((prev) => !prev)}
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
                    !isCameraTouring && activeCameraPreset === preset.id ? "is-active" : ""
                  }`}
                  onClick={() => applyCameraPreset(preset.id)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="control-block">
            <div className="animation-head">
              <h3 className="control-head">Animation System</h3>
              <span className="status-chip">{animationStatusLabel}</span>
            </div>

            {availableAnimations.length > 0 ? (
              <>
                <div className="animation-toolbar">
                  <button
                    type="button"
                    className={`chip chip-soft ${
                      animationMode === ANIMATION_MODES.MANUAL ? "is-active" : ""
                    }`}
                    onClick={() => setAnimationMode(ANIMATION_MODES.MANUAL)}
                  >
                    Manual
                  </button>
                  <button
                    type="button"
                    className={`chip chip-soft ${
                      animationMode === ANIMATION_MODES.AUTO ? "is-active" : ""
                    }`}
                    onClick={() => {
                      setAnimationMode(ANIMATION_MODES.AUTO);
                      setIsAnimationPaused(false);
                    }}
                  >
                    Auto
                  </button>
                  <button type="button" className="chip chip-soft" onClick={() => cycleAnimation(-1)}>
                    Prev
                  </button>
                  <button
                    type="button"
                    className={`chip chip-soft ${!isAnimationPaused ? "is-active" : ""}`}
                    onClick={toggleAnimationPlayback}
                  >
                    {isAnimationPaused ? "Play" : "Pause"}
                  </button>
                  <button type="button" className="chip chip-soft" onClick={() => cycleAnimation(1)}>
                    Next
                  </button>
                  <button
                    type="button"
                    className="chip chip-soft"
                    onClick={applyAutoSuggestionNow}
                    disabled={!autoSuggestedAnimation}
                  >
                    Apply Auto Suggestion
                  </button>
                </div>

                <label className="animation-speed">
                  <span>Speed {animationSpeed.toFixed(2)}x</span>
                  <input
                    type="range"
                    min="0.6"
                    max="1.6"
                    step="0.05"
                    value={animationSpeed}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (!Number.isFinite(value)) return;
                      setAnimationSpeed(clamp(value, 0.6, 1.6));
                    }}
                  />
                </label>

                <div className="button-row">
                  {availableAnimations.map((animationName) => (
                    <button
                      key={animationName}
                      type="button"
                      className={`chip ${activeAnimation === animationName ? "is-active" : ""}`}
                      onClick={() => playAnimation(animationName)}
                      title={animationName}
                    >
                      {formatAnimationLabel(animationName)}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="empty-copy">No embedded animations detected for this model.</p>
            )}

            {availableAnimations.length > 0 && (
              <p className="control-tip">
                Manual = เลือกท่าเอง, Auto = ระบบเลือกท่าตามสุขภาพและเซ็นเซอร์
              </p>
            )}
          </div>

          <div className="control-block">
            <h3 className="control-head">Sound</h3>
            <button
              type="button"
              className={`sound-btn ${isPlayingSound ? "is-playing" : ""}`}
              onClick={toggleSound}
            >
              {isPlayingSound
                ? "Stop Voice"
                : activePetId === "dog"
                  ? "Play Bark Voice"
                  : "Play Pet Voice"}
            </button>
            <p className="control-tip">
              {profileInsight.voiceLine} ({activeVoiceStyle.label}, {soundPlaybackRate.toFixed(2)}x)
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
