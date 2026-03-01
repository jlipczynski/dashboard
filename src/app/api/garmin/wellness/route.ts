import { NextResponse } from "next/server";
import { GarminConnect } from "@gooin/garmin-connect";

export const dynamic = "force-dynamic";

export async function GET() {
  const email = process.env.GARMIN_EMAIL;
  const password = process.env.GARMIN_PASSWORD;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Brak GARMIN_EMAIL lub GARMIN_PASSWORD w zmiennych srodowiskowych" },
      { status: 500 }
    );
  }

  try {
    const client = new GarminConnect({
      username: email,
      password: password,
    });

    await client.login();

    const today = new Date();

    // Fetch user profile info
    let displayName = email.split("@")[0];
    try {
      const profile = await client.getUserProfile();
      displayName = profile?.displayName ?? displayName;
    } catch {
      // optional
    }

    // Fetch steps
    let steps: number | null = null;
    try {
      steps = await client.getSteps(today);
    } catch {
      // optional
    }

    // Fetch heart rate data
    let restingHR: number | null = null;
    try {
      const hr = await client.getHeartRate(today);
      restingHR = hr?.restingHeartRate ?? null;
    } catch {
      // optional
    }

    // Fetch sleep data
    let sleepHours: number | null = null;
    try {
      const sleep = await client.getSleepDuration(today);
      if (sleep) {
        sleepHours = Math.round((sleep.hours + sleep.minutes / 60) * 10) / 10;
      }
    } catch {
      // optional
    }

    // Fetch weight
    let weightKg: number | null = null;
    try {
      const weight = await client.getDailyWeightData(today);
      if (weight && typeof weight === "object" && "totalAverage" in weight) {
        const avg = (weight as { totalAverage?: { weight?: number } }).totalAverage;
        if (avg?.weight) {
          weightKg = Math.round((avg.weight / 1000) * 10) / 10; // grams to kg
        }
      }
    } catch {
      // optional
    }

    // Fetch hydration
    let hydrationMl: number | null = null;
    try {
      const hydration = await client.getDailyHydration(today);
      if (typeof hydration === "number" && hydration > 0) {
        hydrationMl = Math.round(hydration * 29.5735); // oz to ml
      }
    } catch {
      // optional
    }

    return NextResponse.json({
      profile: {
        displayName,
      },
      today: {
        date: today.toISOString().split("T")[0],
        steps,
        restingHR,
        sleepHours,
        weightKg,
        hydrationMl,
      },
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Garmin wellness sync failed: ${message}` },
      { status: 500 }
    );
  }
}
