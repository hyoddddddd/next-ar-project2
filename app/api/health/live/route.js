import { NextResponse } from "next/server";
import { getLatestSensorReading } from "../../../../lib/health-sensor-store";

const SENSOR_STALE_MS = 15000;
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const petId = (searchParams.get("petId") ?? "dog").trim().toLowerCase();
  const reading = getLatestSensorReading(petId);

  if (!reading) {
    return NextResponse.json(
      {
        ok: true,
        petId,
        reading: null,
        isFresh: false,
      },
      { status: 200 },
    );
  }

  const isFresh = Date.now() - reading.timestamp <= SENSOR_STALE_MS;

  return NextResponse.json(
    {
      ok: true,
      petId,
      reading,
      isFresh,
    },
    { status: 200 },
  );
}
