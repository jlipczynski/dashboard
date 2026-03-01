import { NextResponse } from "next/server";
import { GarminConnect } from "@gooin/garmin-connect";

export const dynamic = "force-dynamic";

type ActivityRaw = {
  activityId: number;
  activityName: string;
  activityType: { typeKey: string };
  distance: number;
  duration: number;
  calories: number;
  startTimeLocal: string;
  averageHR?: number;
  maxHR?: number;
  averageSpeed?: number;
  elevationGain?: number;
};

export async function GET() {
  const email = process.env.GARMIN_EMAIL;
  const password = process.env.GARMIN_PASSWORD;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Brak GARMIN_EMAIL lub GARMIN_PASSWORD w zmiennych środowiskowych" },
      { status: 500 }
    );
  }

  try {
    const client = new GarminConnect({
      username: email,
      password: password,
    });

    await client.login();

    // Pull last 50 activities (covers ~1-2 months for active person)
    const raw = (await client.getActivities(0, 50)) as ActivityRaw[];

    // Get current month boundaries
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1); // Monday
    weekStart.setHours(0, 0, 0, 0);

    const activities = raw.map((a) => ({
      id: a.activityId,
      name: a.activityName,
      type: a.activityType?.typeKey ?? "unknown",
      distanceKm: Math.round((a.distance / 1000) * 100) / 100,
      durationMin: Math.round(a.duration / 60),
      calories: a.calories,
      date: a.startTimeLocal,
      avgHR: a.averageHR,
      maxHR: a.maxHR,
      avgSpeedKmh: a.averageSpeed
        ? Math.round(a.averageSpeed * 3.6 * 100) / 100
        : undefined,
      elevationGain: a.elevationGain,
    }));

    // Aggregate monthly stats
    const monthActivities = activities.filter(
      (a) => new Date(a.date) >= monthStart
    );
    const weekActivities = activities.filter(
      (a) => new Date(a.date) >= weekStart
    );

    const sumByType = (
      list: typeof activities,
      type: string,
      field: "distanceKm" | "durationMin" | "calories"
    ) =>
      list
        .filter((a) => a.type.toLowerCase().includes(type))
        .reduce((sum, a) => sum + a[field], 0);

    const summary = {
      month: {
        cyclingKm: Math.round(sumByType(monthActivities, "cycling", "distanceKm") * 100) / 100,
        cyclingHours: Math.round(sumByType(monthActivities, "cycling", "durationMin") / 6) / 10,
        runningKm: Math.round(sumByType(monthActivities, "running", "distanceKm") * 100) / 100,
        activeCalories: Math.round(
          monthActivities.reduce((s, a) => s + a.calories, 0)
        ),
        gymSessions: monthActivities.filter(
          (a) =>
            a.type.toLowerCase().includes("strength") ||
            a.type.toLowerCase().includes("training")
        ).length,
      },
      week: {
        cyclingKm: Math.round(sumByType(weekActivities, "cycling", "distanceKm") * 100) / 100,
        runningKm: Math.round(sumByType(weekActivities, "running", "distanceKm") * 100) / 100,
        activeCalories: Math.round(
          weekActivities.reduce((s, a) => s + a.calories, 0)
        ),
        gymSessions: weekActivities.filter(
          (a) =>
            a.type.toLowerCase().includes("strength") ||
            a.type.toLowerCase().includes("training")
        ).length,
        // Daily breakdown for charts (Mon-Sun)
        dailyRunning: getDailyBreakdown(weekActivities, "running", weekStart),
        dailyCycling: getDailyBreakdown(weekActivities, "cycling", weekStart),
      },
    };

    return NextResponse.json({
      summary,
      activities: activities.slice(0, 20), // Last 20 for display
      syncedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Garmin sync failed: ${message}` },
      { status: 500 }
    );
  }
}

function getDailyBreakdown(
  activities: { type: string; distanceKm: number; date: string }[],
  type: string,
  weekStart: Date
): number[] {
  const days = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun
  for (const a of activities) {
    if (!a.type.toLowerCase().includes(type)) continue;
    const d = new Date(a.date);
    let dayIdx = d.getDay() - 1; // 0=Mon
    if (dayIdx < 0) dayIdx = 6; // Sunday = 6
    days[dayIdx] += a.distanceKm;
  }
  return days.map((v) => Math.round(v * 100) / 100);
}
