import { NextResponse } from "next/server";
import { GarminConnect } from "@gooin/garmin-connect";

export const dynamic = "force-dynamic";

// Shape returned by Garmin's usersummary daily endpoint
type DailySummary = {
  totalKilocalories?: number;
  activeKilocalories?: number;
  bmrKilocalories?: number;
  totalSteps?: number;
  totalDistanceMeters?: number;
  floorsAscended?: number;
  minHeartRate?: number;
  maxHeartRate?: number;
  restingHeartRate?: number;
  averageStressLevel?: number;
  maxStressLevel?: number;
  bodyBatteryChargedValue?: number;
  bodyBatteryDrainedValue?: number;
  bodyBatteryHighestValue?: number;
  bodyBatteryLowestValue?: number;
  bodyBatteryMostRecentValue?: number;
  moderateIntensityMinutes?: number;
  vigorousIntensityMinutes?: number;
};

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

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
    const dateStr = formatDate(today);

    // ── 1. Daily Summary (active calories, body battery, stress, intensity) ──
    let dailySummary: DailySummary | null = null;
    try {
      // Call the Garmin usersummary API directly – not exposed by the library
      const url = `${client.url.GC_API}/usersummary-service/usersummary/daily/${dateStr}`;
      dailySummary = await client.get<DailySummary>(url);
    } catch {
      // fallback: try without date in path
      try {
        const url = `${client.url.GC_API}/usersummary-service/usersummary/daily?calendarDate=${dateStr}`;
        dailySummary = await client.get<DailySummary>(url);
      } catch {
        // daily summary unavailable
      }
    }

    // ── 2. Steps ──
    let steps: number | null = dailySummary?.totalSteps ?? null;
    if (steps === null) {
      try {
        steps = await client.getSteps(today);
      } catch {
        // optional
      }
    }

    // ── 3. Heart rate ──
    let restingHR: number | null = dailySummary?.restingHeartRate ?? null;
    if (restingHR === null) {
      try {
        const hr = await client.getHeartRate(today);
        restingHR = hr?.restingHeartRate ?? null;
      } catch {
        // optional
      }
    }

    // ── 4. Sleep ──
    let sleepHours: number | null = null;
    try {
      const sleep = await client.getSleepDuration(today);
      if (sleep) {
        sleepHours = Math.round((sleep.hours + sleep.minutes / 60) * 10) / 10;
      }
    } catch {
      // optional
    }

    // ── 5. Weight ──
    let weightKg: number | null = null;
    try {
      const weight = await client.getDailyWeightData(today);
      if (weight && typeof weight === "object" && "totalAverage" in weight) {
        const avg = (weight as { totalAverage?: { weight?: number } }).totalAverage;
        if (avg?.weight) {
          weightKg = Math.round((avg.weight / 1000) * 10) / 10; // grams → kg
        }
      }
    } catch {
      // optional
    }

    // ── 6. Today's activities (running, cycling, gym etc.) ──
    type ActivityEntry = {
      activityName: string;
      activityType: string;
      calories: number;
      duration: string;
      distance: string | null;
      startTime: string;
      averageHR: number | null;
    };
    let activities: ActivityEntry[] = [];
    try {
      const allActivities = await client.getActivities(0, 20);
      const todayActivities = allActivities.filter((a) => {
        const actDate = (a.startTimeLocal ?? "").slice(0, 10);
        return actDate === dateStr;
      });
      activities = todayActivities.map((a) => ({
        activityName: a.activityName ?? "Aktywnosc",
        activityType: a.activityType?.typeKey ?? "unknown",
        calories: a.calories ?? 0,
        duration: a.duration
          ? `${Math.floor(a.duration / 60)}min`
          : "—",
        distance: a.distance
          ? `${(a.distance / 1000).toFixed(2)} km`
          : null,
        startTime: a.startTimeLocal ?? "",
        averageHR: a.averageHR ?? null,
      }));
    } catch {
      // activities unavailable
    }

    return NextResponse.json({
      today: {
        date: dateStr,
        // ── Calories ──
        activeCalories: dailySummary?.activeKilocalories ?? null,
        totalCalories: dailySummary?.totalKilocalories ?? null,
        bmrCalories: dailySummary?.bmrKilocalories ?? null,
        // ── Vitals ──
        steps,
        restingHR,
        maxHR: dailySummary?.maxHeartRate ?? null,
        sleepHours,
        weightKg,
        // ── Body Battery & Stress ──
        bodyBattery: dailySummary?.bodyBatteryMostRecentValue ?? null,
        stressLevel: dailySummary?.averageStressLevel ?? null,
        // ── Intensity ──
        moderateMinutes: dailySummary?.moderateIntensityMinutes ?? null,
        vigorousMinutes: dailySummary?.vigorousIntensityMinutes ?? null,
        // ── Distance ──
        distanceKm: dailySummary?.totalDistanceMeters
          ? Math.round(dailySummary.totalDistanceMeters / 10) / 100
          : null,
        floorsClimbed: dailySummary?.floorsAscended ?? null,
      },
      activities,
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
