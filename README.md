# AR Pet Studio (Next.js)

Interactive 3D/AR pet web app with:
- model viewer + AR camera
- animation engine (manual + auto mode)
- wellness dashboard
- live sensor ingest API for real dog telemetry
- profile + voice behavior controls

## Run

### Dev

```bash
npm install
npm run dev
```

Open `http://localhost:3000` (or the port shown in terminal).

### Production

```bash
npm run build
npm run start
```

## Current System Checklist

- Frontend: Next.js App Router single-page dashboard
- AR/3D engine: `<model-viewer>` with `webxr`, `scene-viewer`, `quick-look`
- Animation system:
  - Manual mode (prev / pause-play / next / direct clip buttons)
  - Auto mode (chooses clip by health + sensor freshness)
  - Speed control (0.6x - 1.6x)
  - Keep-alive loop to reduce unexpected pause
- Wellness system:
  - Energy / Mood / Fitness / Hydration
  - Health actions: feed, water, play, rest
  - Simulated drift from active animation
- Sensor system:
  - `POST /api/health/ingest` (validated + optional API key)
  - `GET /api/health/live?petId=dog`
  - UI polling + blend into wellness score
- Profile system:
  - Per-pet name/age/voice/story
  - Stored in browser localStorage
- Camera system:
  - Presets + auto tour

## Sensor Integration

### 1) Configure sensor key

```bash
cp .env.example .env.local
```

Set a key:

```bash
SENSOR_API_KEY=your-strong-secret
```

### 2) Push telemetry from gateway device

- Endpoint: `POST /api/health/ingest`
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

Quick test:

```bash
curl -X POST http://localhost:3000/api/health/ingest \
  -H "Content-Type: application/json" \
  -H "x-sensor-key: your-strong-secret" \
  -d '{"petId":"dog","heartRate":102,"temperatureC":38.4,"spo2":97,"activityLevel":63,"hydrationPct":74}'
```

### 3) UI read endpoint

- `GET /api/health/live?petId=dog`

When reading is fresh, the app blends sensor data into wellness.

## Release Notes

- Build pipeline currently passes with `npm run build`.
- Quick release gate: `npm run verify`
- `npm run lint` is a placeholder script (ESLint config not added yet).
- Sensor store now persists to temp file (`/tmp/ar-pet-studio/sensor-readings.json`) for better consistency in production workers.
- For multi-machine/cluster deployment, move sensor store to Redis/Postgres.

## Asset Paths

- Models: `public/models`
- Icons: `public/assets/icons`
- Sounds: `public/assets/sounds`
