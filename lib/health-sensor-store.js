const STORE_KEY = "__ar_pet_sensor_store__";

function getStore() {
  if (!globalThis[STORE_KEY]) {
    globalThis[STORE_KEY] = {
      readings: new Map(),
    };
  }
  return globalThis[STORE_KEY];
}

export function getLatestSensorReading(petId) {
  const store = getStore();
  return store.readings.get(petId) ?? null;
}

export function setLatestSensorReading(petId, reading) {
  const store = getStore();
  const normalized = {
    petId,
    heartRate: reading.heartRate,
    temperatureC: reading.temperatureC,
    spo2: reading.spo2,
    activityLevel: reading.activityLevel,
    hydrationPct: reading.hydrationPct,
    timestamp: Date.now(),
  };
  store.readings.set(petId, normalized);
  return normalized;
}
