import { NextResponse } from "next/server";
import { setLatestSensorReading } from "../../../../lib/health-sensor-store";

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateMetric(name, value, min, max) {
  const num = toNumber(value);
  if (num === null) return `${name} is required and must be numeric`;
  if (num < min || num > max) return `${name} must be between ${min} and ${max}`;
  return null;
}

export async function POST(request) {
  const sensorApiKey = process.env.SENSOR_API_KEY;
  if (sensorApiKey) {
    const inputKey = request.headers.get("x-sensor-key");
    if (inputKey !== sensorApiKey) {
      return NextResponse.json({ ok: false, error: "Unauthorized sensor key" }, { status: 401 });
    }
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const petId = (payload.petId ?? "dog").toString().trim().toLowerCase();
  if (!petId) {
    return NextResponse.json({ ok: false, error: "petId is required" }, { status: 400 });
  }

  const errors = [
    validateMetric("heartRate", payload.heartRate, 35, 240),
    validateMetric("temperatureC", payload.temperatureC, 34, 43),
    validateMetric("spo2", payload.spo2, 70, 100),
    validateMetric("activityLevel", payload.activityLevel, 0, 100),
  ].filter(Boolean);

  const hydrationPctRaw = toNumber(payload.hydrationPct);
  if (hydrationPctRaw !== null && (hydrationPctRaw < 0 || hydrationPctRaw > 100)) {
    errors.push("hydrationPct must be between 0 and 100");
  }

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, error: errors.join(", ") }, { status: 400 });
  }

  const reading = setLatestSensorReading(petId, {
    heartRate: Number(payload.heartRate),
    temperatureC: Number(payload.temperatureC),
    spo2: Number(payload.spo2),
    activityLevel: Number(payload.activityLevel),
    hydrationPct: hydrationPctRaw === null ? 72 : hydrationPctRaw,
  });

  return NextResponse.json({ ok: true, reading }, { status: 200 });
}
