import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const STORE_DIR = path.join(os.tmpdir(), "ar-pet-studio");
const STORE_FILE = path.join(STORE_DIR, "sensor-readings.json");
const VALID_PET_ID = /^[a-z0-9_-]{1,32}$/;

function normalizePetId(input) {
  const candidate = String(input ?? "dog").trim().toLowerCase();
  return VALID_PET_ID.test(candidate) ? candidate : "dog";
}

async function readStore() {
  try {
    const raw = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { readings: {} };
    if (!parsed.readings || typeof parsed.readings !== "object") {
      return { readings: {} };
    }
    return parsed;
  } catch (error) {
    if (error?.code === "ENOENT") return { readings: {} };
    return { readings: {} };
  }
}

async function writeStore(store) {
  await mkdir(STORE_DIR, { recursive: true });
  await writeFile(STORE_FILE, JSON.stringify(store), "utf8");
}

export async function getLatestSensorReading(petId) {
  const normalizedPetId = normalizePetId(petId);
  const store = await readStore();
  const reading = store.readings[normalizedPetId];
  return reading && typeof reading === "object" ? reading : null;
}

export async function setLatestSensorReading(petId, reading) {
  const normalizedPetId = normalizePetId(petId);
  const store = await readStore();
  const normalized = {
    petId: normalizedPetId,
    heartRate: Number(reading.heartRate),
    temperatureC: Number(reading.temperatureC),
    spo2: Number(reading.spo2),
    activityLevel: Number(reading.activityLevel),
    hydrationPct: Number(reading.hydrationPct),
    timestamp: Date.now(),
  };
  store.readings[normalizedPetId] = normalized;
  await writeStore(store);
  return normalized;
}
