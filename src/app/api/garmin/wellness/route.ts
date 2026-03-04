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

async function getGarminClient(): Promise<GarminConnect> {
  const tokenB64 = process.env.GARMIN_TOKEN;

  if (tokenB64) {
    const tokenData = JSON.parse(Buffer.from(tokenB64, "base64").toString());
    const client = new GarminConnect({
      username: process.env.GARMIN_EMAIL || "token-auth",
      password: process.env.GARMIN_PASSWORD || "token-auth",
    });
    client.loadToken(tokenData.oauth1, tokenData.oauth2);
    return client;
  }

  const email = process.env.GARMIN_EMAIL;
  const password = process.env.GARMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Brak GARMIN_TOKEN ani GARMIN_EMAIL/GARMIN_PASSWORD");
  }
  const client = new GarminConnect({ username: email, password });
  await client.login();
  return client;
}

export async function GET(req: Request) {
  try {
    const client = await getGarminClient();

    const { searchParams } = new URL(req.url);
    const days = Math.min(parseInt(searchParams.get("days") || "1", 10), 14);

    const today = new Date();
    const dateStr = formatDate(today);

    // ── Fetch daily calorie summaries sequentially (Garmin session doesn't support parallel) ──
    const dailyCalories: { date: string; activeCalories: number | null; totalCalories: number | null }[] = [];
    let dailySummary: DailySummary | null = null;

    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = formatDate(d);
      try {
        const url = `${client.url.GC_API}/usersummary-service/usersummary/daily/${ds}`;
        const summary = await client.get<DailySummary>(url);
        dailyCalories.push({
          date: ds,
          activeCalories: summary?.activeKilocalories ?? null,
          totalCalories: summary?.totalKilocalories ?? null,
        });
        // Reuse today's summary for the rest of the wellness response
        if (i === 0) dailySummary = summary;
      } catch {
        try {
          const url = `${client.url.GC_API}/usersummary-service/usersummary/daily?calendarDate=${ds}`;
          const summary = await client.get<DailySummary>(url);
          dailyCalories.push({
            date: ds,
            activeCalories: summary?.activeKilocalories ?? null,
            totalCalories: summary?.totalKilocalories ?? null,
          });
          if (i === 0) dailySummary = summary;
        } catch {
          dailyCalories.push({ date: ds, activeCalories: null, totalCalories: null });
        }
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
      dailyCalories,
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
