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
const PROFILE_STORAGE_KEY = "ar_pet_profiles_v1";
const DEFAULT_PET_PROFILES = {
  dog: {
    name: "Bolt",
    age: 4,
    voiceStyle: "playful",
    storySeed: "ชอบวิ่งในสวนและเฝ้าบ้านช่วงเย็น",
  },
  cat: {
    name: "Luna",
    age: 3,
    voiceStyle: "gentle",
    storySeed: "ชอบนอนอาบแดดและเดินสำรวจบ้านตอนเช้า",
  },
};
const VOICE_STYLES = [
  {
    id: "playful",
    label: "Playful",
    dogBark: "โฮ่ง! โฮ่ง! พร้อมเล่นทันที",
    catVoice: "เหมียว~ เรามาเล่นกันเถอะ",
    playbackRate: 1.08,
  },
  {
    id: "gentle",
    label: "Gentle",
    dogBark: "โฮ่ง... โฮ่ง... อย่างสุภาพ",
    catVoice: "เหมียว... อย่างนุ่มนวล",
    playbackRate: 0.94,
  },
  {
    id: "guardian",
    label: "Guardian",
    dogBark: "โฮ่ง! ฉันเฝ้าบ้านอยู่ตรงนี้",
    catVoice: "เมี้ยว! ฉันคุมพื้นที่เรียบร้อย",
    playbackRate: 1.02,
  },
];
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

function pickArMotionAnimation(animations, fallbackAnimation = "") {
  if (!Array.isArray(animations) || animations.length === 0) {
    return fallbackAnimation || "";
  }

  const movementKeywords = ["run", "walk", "jump", "gallop", "trot", "attack"];
  const motion =
    animations.find((name) =>
      movementKeywords.some((keyword) => name.toLowerCase().includes(keyword)),
    ) || "";

  return motion || fallbackAnimation || animations[0] || "";
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
        typeof profile.voiceStyle === "string" && profile.voiceStyle.trim()
          ? profile.voiceStyle
          : nextProfiles[petId].voiceStyle,
      storySeed:
        typeof profile.storySeed === "string"
          ? profile.storySeed.slice(0, 160)
          : nextProfiles[petId].storySeed,
    };
  });

  return nextProfiles;
}

function getPrimaryAnimationByKeywords(animations, keywords) {
  return (
    animations.find((name) =>
      keywords.some((keyword) => name.toLowerCase().includes(keyword)),
    ) || ""
  );
}

function createAvatarDataUrl({ petName, petLabel, healthScore, healthTone }) {
  const initials = (petName || petLabel)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0])
    .join("")
    .toUpperCase();

  const toneColorMap = {
    excellent: "#22c55e",
    stable: "#2563eb",
    care: "#f59e0b",
    critical: "#ef4444",
  };
  const toneColor = toneColorMap[healthTone] ?? "#2563eb";
  const background = petLabel === "Dog" ? "#fde68a" : "#bae6fd";
  const safeName = petName.replace(/[<>&"]/g, "");
  const safeLabel = petLabel.replace(/[<>&"]/g, "");

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 360 360' role='img' aria-label='AI avatar'>
    <defs>
      <linearGradient id='bg' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0%' stop-color='${background}' />
        <stop offset='100%' stop-color='#ffffff' />
      </linearGradient>
    </defs>
    <rect x='0' y='0' width='360' height='360' rx='42' fill='url(#bg)' />
    <circle cx='180' cy='150' r='84' fill='${toneColor}' opacity='0.15' />
    <circle cx='180' cy='150' r='72' fill='white' />
    <text x='180' y='172' text-anchor='middle' font-family='Arial, sans-serif' font-size='58' font-weight='700' fill='${toneColor}'>${initials || "AI"}</text>
    <text x='180' y='262' text-anchor='middle' font-family='Arial, sans-serif' font-size='24' font-weight='700' fill='#172032'>${safeName || safeLabel}</text>
    <text x='180' y='294' text-anchor='middle' font-family='Arial, sans-serif' font-size='18' fill='#4f5d73'>Health ${healthScore}/100</text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildConnectedAiProfile({
  profile,
  activePet,
  healthScore,
  healthStatus,
  activeAnimation,
  sensorSnapshot,
  isSensorFresh,
  draftVersion,
}) {
  const voiceStyle =
    VOICE_STYLES.find((item) => item.id === profile.voiceStyle) ?? VOICE_STYLES[0];
  const petName = profile.name?.trim() || activePet.label;
  const age = clamp(Math.round(Number(profile.age) || 0), 0, 30);

  const ageStage =
    age <= 1
      ? "วัยเด็ก"
      : age <= 6
        ? "วัยกำลังแข็งแรง"
        : age <= 11
          ? "วัยผู้ใหญ่"
          : "วัย senior";

  const sensorLine =
    activePet.id === "dog" && sensorSnapshot
      ? `HR ${sensorSnapshot.heartRate ?? "--"} bpm, Temp ${sensorSnapshot.temperatureC ?? "--"}C`
      : "ยังไม่มีค่าเซ็นเซอร์สด";

  const temperament =
    healthScore >= 85
      ? "มั่นใจ กระตือรือร้น และพร้อมเรียนรู้คำสั่งใหม่"
      : healthScore >= 70
        ? "สมดุล อารมณ์นิ่ง และตอบสนองดี"
        : healthScore >= 50
          ? "ต้องการการดูแลเพิ่ม และควรลดกิจกรรมหนัก"
          : "อ่อนล้า ควรพักและติดตามอาการอย่างใกล้ชิด";

  const voiceLine = activePet.id === "dog" ? voiceStyle.dogBark : voiceStyle.catVoice;
  const movementLine = activeAnimation
    ? `ตอนนี้กำลังทำท่า ${activeAnimation}`
    : "ยังไม่มีท่าแอนิเมชันที่กำลังเล่น";
  const sensorStateLine =
    activePet.id === "dog"
      ? isSensorFresh
        ? "เซ็นเซอร์สดและกำลังอัปเดต"
        : "เซ็นเซอร์ยังไม่สด"
      : "โหมดเซ็นเซอร์เน้นเฉพาะสุนัข";
  const storySeed = profile.storySeed?.trim();
  const narrativeFlavors = [
    "เช้านี้เริ่มวันอย่างสดใส",
    "ช่วงบ่ายมีพลังสำหรับการฝึก",
    "ช่วงเย็นเหมาะกับกิจกรรมที่สงบ",
  ];
  const narrativeLead =
    narrativeFlavors[Math.abs(draftVersion || 0) % narrativeFlavors.length];
  const story = `${narrativeLead}. ${petName} (${ageStage}) มีบุคลิกแบบ ${temperament}. ${movementLine}. ${sensorStateLine} (${sensorLine}). ${storySeed ? `เรื่องราว: ${storySeed}.` : ""} AI แนะนำให้จัดกิจกรรมที่บาลานซ์กับค่า Health ${healthScore}/100 (${healthStatus.label}).`;

  const recommendedAnimation = healthScore >= 78 ? "active" : healthScore <= 55 ? "rest" : "steady";
  const aiMotionTip =
    recommendedAnimation === "active"
      ? "แนะนำใช้ท่าที่เคลื่อนไหว เช่น Walk/Run"
      : recommendedAnimation === "rest"
        ? "แนะนำใช้ท่าพัก เช่น Idle"
        : "แนะนำใช้ท่าคงที่ เช่น Walk หรือ Survey";

  return {
    voiceStyle,
    petName,
    age,
    temperament,
    story,
    voiceLine,
    avatarDataUrl: createAvatarDataUrl({
      petName,
      petLabel: activePet.label,
      healthScore,
      healthTone: healthStatus.tone,
    }),
    recommendedAnimation,
    aiMotionTip,
  };
}

export default function Home() {
  const viewerRef = useRef(null);
  const audioRef = useRef(null);
  const arKeepAliveTimeoutsRef = useRef([]);
  const animationKeepAliveIntervalRef = useRef(0);
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
  const [isArPresenting, setIsArPresenting] = useState(false);
  const [petProfiles, setPetProfiles] = useState(DEFAULT_PET_PROFILES);
  const [aiDraftVersion, setAiDraftVersion] = useState(0);

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
  const activeProfile = useMemo(
    () => petProfiles[activePetId] ?? DEFAULT_PET_PROFILES[activePetId],
    [activePetId, petProfiles],
  );
  const aiProfile = useMemo(
    () =>
      buildConnectedAiProfile({
        profile: activeProfile,
        activePet,
        healthScore,
        healthStatus,
        activeAnimation,
        sensorSnapshot,
        isSensorFresh,
        draftVersion: aiDraftVersion,
      }),
    [
      activeAnimation,
      activePet,
      activeProfile,
      aiDraftVersion,
      healthScore,
      healthStatus,
      isSensorFresh,
      sensorSnapshot,
    ],
  );
  const preferredAiAnimation = useMemo(() => {
    if (!availableAnimations.length) return "";
    if (aiProfile.recommendedAnimation === "rest") {
      return getPrimaryAnimationByKeywords(availableAnimations, ["idle", "rest", "sleep"]);
    }
    if (aiProfile.recommendedAnimation === "active") {
      return getPrimaryAnimationByKeywords(availableAnimations, ["run", "walk", "jump"]);
    }
    return getPrimaryAnimationByKeywords(availableAnimations, ["walk", "survey", "idle"]);
  }, [aiProfile.recommendedAnimation, availableAnimations]);
  const preferredArMotionAnimation = useMemo(
    () =>
      pickArMotionAnimation(
        availableAnimations,
        preferredAiAnimation || activeAnimation,
      ),
    [activeAnimation, availableAnimations, preferredAiAnimation],
  );
  const soundPlaybackRate = useMemo(() => {
    const healthMod = healthScore >= 85 ? 1.05 : healthScore <= 55 ? 0.9 : 1;
    return clamp(aiProfile.voiceStyle.playbackRate * healthMod, 0.72, 1.28);
  }, [aiProfile.voiceStyle.playbackRate, healthScore]);

  const stopSound = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    audioRef.current = null;
    setIsPlayingSound(false);
  }, []);
  const stopAnimationKeepAlive = useCallback(() => {
    if (!animationKeepAliveIntervalRef.current) return;
    clearInterval(animationKeepAliveIntervalRef.current);
    animationKeepAliveIntervalRef.current = 0;
  }, []);
  const ensureAnimationContinuity = useCallback(
    (preferredAnimation) => {
      const viewer = viewerRef.current;
      if (!viewer) return;

      const nextAnimation = preferredAnimation || activeAnimation || viewer.animationName;
      if (!nextAnimation) return;

      viewer.animationLoop = true;
      if (viewer.animationName !== nextAnimation) {
        viewer.animationName = nextAnimation;
      }
      viewer.currentTime = 0;
      viewer.play();
      setActiveAnimation(nextAnimation);
    },
    [activeAnimation],
  );
  const clearArKeepAlive = useCallback(() => {
    arKeepAliveTimeoutsRef.current.forEach((timerId) => clearTimeout(timerId));
    arKeepAliveTimeoutsRef.current = [];
  }, []);
  const forceAnimationInAr = useCallback(
    (preferredAnimation) => {
      const viewer = viewerRef.current;
      if (!viewer) return;

      const nextAnimation = preferredAnimation || activeAnimation;
      if (!nextAnimation) return;

      clearArKeepAlive();

      [0, 260, 900, 1700].forEach((delay) => {
        const timeoutId = setTimeout(() => {
          ensureAnimationContinuity(nextAnimation);
        }, delay);
        arKeepAliveTimeoutsRef.current.push(timeoutId);
      });
    },
    [activeAnimation, clearArKeepAlive, ensureAnimationContinuity],
  );
  const updateActiveProfile = useCallback(
    (field, value) => {
      setPetProfiles((prev) => {
        const current = prev[activePetId] ?? DEFAULT_PET_PROFILES[activePetId];
        let nextValue = value;

        if (field === "age") {
          const parsed = Number(value);
          nextValue = Number.isFinite(parsed) ? clamp(Math.round(parsed), 0, 30) : 0;
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
      stopAnimationKeepAlive();
      stopCameraTween();
      stopCameraTour();
      clearArKeepAlive();
    };
  }, [
    clearArKeepAlive,
    stopAnimationKeepAlive,
    stopCameraTour,
    stopCameraTween,
    stopSound,
  ]);

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
      // Ignore malformed storage and continue with defaults.
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
    setAvailableAnimations([]);
    setActiveAnimation("");
    setIsArPresenting(false);
    setHealth({
      ...(PET_BASE_HEALTH[activePetId] ?? PET_BASE_HEALTH[PETS[0].id]),
    });
    clearArKeepAlive();
    stopSound();
  }, [activePetId, clearArKeepAlive, stopSound]);

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
    stopAnimationKeepAlive();
    if (!isClient || !activeAnimation) return;

    animationKeepAliveIntervalRef.current = setInterval(() => {
      const viewer = viewerRef.current;
      if (!viewer) return;

      viewer.animationLoop = true;
      if (viewer.animationName !== activeAnimation) {
        viewer.animationName = activeAnimation;
      }
      if (viewer.paused) {
        viewer.play();
      }
    }, 420);

    return () => {
      stopAnimationKeepAlive();
    };
  }, [activeAnimation, isClient, stopAnimationKeepAlive]);

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
        ensureAnimationContinuity(nextAnimation);
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
      const status = event?.detail?.status;

      if (status === "session-started") {
        setIsArPresenting(true);
        forceAnimationInAr(preferredArMotionAnimation || activeAnimation);
        return;
      }

      if (
        status === "not-presenting" ||
        status === "session-ended" ||
        status === "failed"
      ) {
        setIsArPresenting(false);
        clearArKeepAlive();
      }
    };
    const handleAnimationFinished = () => {
      ensureAnimationContinuity(activeAnimation || viewer.animationName);
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
  }, [
    activeAnimation,
    clearArKeepAlive,
    ensureAnimationContinuity,
    forceAnimationInAr,
    isClient,
    preferredArMotionAnimation,
    setCameraOrbit,
  ]);

  const playAnimation = useCallback((animationName) => {
    if (!viewerRef.current || !animationName) return;
    ensureAnimationContinuity(animationName);
  }, [ensureAnimationContinuity]);

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
      ensureAnimationContinuity(preferredAnimation || activeAnimation);
    },
    [activeAnimation, ensureAnimationContinuity],
  );
  const applyAiAnimationSuggestion = useCallback(() => {
    if (!preferredAiAnimation) return;
    playAnimation(preferredAiAnimation);
  }, [playAnimation, preferredAiAnimation]);
  const openArCamera = useCallback(async () => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const motionAnimation =
      preferredArMotionAnimation || preferredAiAnimation || activeAnimation;

    ensureAnimationIsPlaying(motionAnimation);
    forceAnimationInAr(motionAnimation);
    try {
      await viewer.activateAR();
    } catch {
      // No-op: unsupported browsers simply stay in 3D mode.
    }
  }, [
    activeAnimation,
    ensureAnimationIsPlaying,
    forceAnimationInAr,
    preferredAiAnimation,
    preferredArMotionAnimation,
  ]);

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
            <p>Profile Name</p>
            <strong>{aiProfile.petName}</strong>
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
        <div className="profile-head">
          <h2>Connected Pet Profile</h2>
          <button
            type="button"
            className="chip chip-soft"
            onClick={() => setAiDraftVersion((prev) => prev + 1)}
          >
            AI Rewrite
          </button>
        </div>
        <p className="empty-copy">
          ชื่อ, อายุ, นิสัย, เรื่องราว, เสียง และภาพอวาตาร์เชื่อมกับ health/sensor/animation
          ทั้งหมด
        </p>
        <div className="profile-grid">
          <div className="profile-card">
            <label className="profile-field">
              <span>Name</span>
              <input
                type="text"
                value={activeProfile.name}
                maxLength={28}
                onChange={(event) => updateActiveProfile("name", event.target.value)}
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
                onChange={(event) => updateActiveProfile("age", event.target.value)}
              />
            </label>
            <label className="profile-field">
              <span>AI Voice Style</span>
              <select
                value={activeProfile.voiceStyle}
                onChange={(event) => updateActiveProfile("voiceStyle", event.target.value)}
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
                value={activeProfile.storySeed}
                maxLength={160}
                onChange={(event) => updateActiveProfile("storySeed", event.target.value)}
                placeholder="เช่น ชอบเดินเล่นตอนเย็น"
              />
            </label>
          </div>
          <div className="profile-card">
            <div className="avatar-wrap">
              <img src={aiProfile.avatarDataUrl} alt={`${aiProfile.petName} AI avatar`} />
            </div>
            <p className="profile-ai-line">
              <strong>AI Temperament:</strong> {aiProfile.temperament}
            </p>
            <p className="profile-ai-line">
              <strong>AI Story:</strong> {aiProfile.story}
            </p>
            <p className="profile-ai-line">
              <strong>AI Bark/Voice:</strong> {aiProfile.voiceLine}
            </p>
            <p className="profile-ai-line">
              <strong>AI Motion Tip:</strong> {aiProfile.aiMotionTip}
            </p>
            <button
              type="button"
              className="chip"
              onClick={applyAiAnimationSuggestion}
              disabled={!preferredAiAnimation || isLoadingModel}
            >
              Apply AI Motion
            </button>
          </div>
        </div>
      </section>

      <section className="panel reveal reveal-4">
        <div className="viewer-header">
          <h2>{activePet.label} Model Viewer</h2>
          <div className="viewer-actions">
            <span className="status-chip">
              {isLoadingModel ? "Loading model..." : "Model ready"}
            </span>
            <span className="status-chip">{isArPresenting ? "AR Live" : "AR Standby"}</span>
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
              ar-modes="webxr scene-viewer quick-look"
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

      <section className="panel reveal reveal-5">
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

      <section className="panel reveal reveal-6">
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
              {isPlayingSound
                ? "Stop Voice"
                : activePetId === "dog"
                  ? "Play Bark Voice"
                  : "Play Pet Voice"}
            </button>
            <p className="control-tip">
              {aiProfile.voiceLine} ({aiProfile.voiceStyle.label}, {soundPlaybackRate.toFixed(2)}x)
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
