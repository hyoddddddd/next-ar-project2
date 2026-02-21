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

  const [isClient, setIsClient] = useState(false);
  const [activePetId, setActivePetId] = useState(PETS[0].id);
  const [isLoadingModel, setIsLoadingModel] = useState(true);
  const [availableAnimations, setAvailableAnimations] = useState([]);
  const [activeAnimation, setActiveAnimation] = useState("");
  const [isPlayingSound, setIsPlayingSound] = useState(false);

  const activePet = useMemo(
    () => PETS.find((pet) => pet.id === activePetId) ?? PETS[0],
    [activePetId],
  );

  const stopSound = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    audioRef.current = null;
    setIsPlayingSound(false);
  }, []);

  useEffect(() => {
    return () => {
      stopSound();
    };
  }, [stopSound]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    setIsLoadingModel(true);
    setAvailableAnimations([]);
    setActiveAnimation("");
    stopSound();
  }, [activePetId, stopSound]);

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
  }, [isClient]);

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
    } catch {
      setIsPlayingSound(false);
    }
  }, [activePet.soundPath, isPlayingSound, stopSound]);

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

      <section className="panel reveal reveal-5">
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
