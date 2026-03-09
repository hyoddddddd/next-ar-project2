# AR Pet Studio (Next.js)

Interactive 3D pet viewer with AR, animation controls, camera motion, and a wellness tracker that can ingest live sensor data from a real dog.

## Run (Dev)

```bash
npm install
npm run dev
```

Open `http://localhost:3000` (or the port shown in terminal).

## Run (Production)

```bash
npm run build
npm run start
```

## Features

- 3D model viewer with AR (`scene-viewer`, `webxr`, `quick-look`)
- Animation buttons generated from each model's embedded animation names
- Camera presets + auto tour
- Wellness tracker with Energy / Mood / Fitness / Hydration
- Live sensor sync for real dog telemetry (heart rate, temperature, SpO2, activity, hydration)

## Live Sensor Integration

### 1) Configure sensor key

```bash
cp .env.example .env.local
```

Set your own key:

```bash
SENSOR_API_KEY=your-strong-secret
```

### 2) Sensor gateway pushes data

Send from ESP32/Raspberry Pi/phone bridge to:

- `POST /api/health/ingest`
- Header: `x-sensor-key: <SENSOR_API_KEY>`
- JSON body:

```json
{
  "petId": "dog",
  "heartRate": 102,
  "temperatureC": 38.4,
  "spo2": 97,
  "activityLevel": 63,
  "hydrationPct": 74
}
```

Quick local test:

```bash
curl -X POST http://localhost:3000/api/health/ingest \
  -H "Content-Type: application/json" \
  -H "x-sensor-key: your-strong-secret" \
  -d '{"petId":"dog","heartRate":102,"temperatureC":38.4,"spo2":97,"activityLevel":63,"hydrationPct":74}'
```

### 3) UI pulls latest reading

The app polls:

- `GET /api/health/live?petId=dog`

When fresh data exists, the wellness tracker automatically blends health score with sensor values.

### Storage note

Current implementation stores latest sensor reading in memory on the Next.js server process.
For multi-instance or long-term persistence on Vercel, replace it with Redis/Postgres.

## Asset Paths

- Models: `public/models`
- Icons: `public/assets/icons`
- Sounds: `public/assets/sounds`
