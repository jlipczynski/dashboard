import { NextResponse } from "next/server";
import { GarminConnect } from "@gooin/garmin-connect";

export const dynamic = "force-dynamic";

const ACTIVITY_TYPES = {
  running: ['running', 'trail_running', 'treadmill_running', 'track_running', 'ultra_running', 'indoor_running'],
  cycling: ['cycling', 'road_cycling', 'indoor_cycling', 'mountain_biking', 'virtual_ride', 'gravel_cycling'],
  strength: ['strength_training', 'fitness_equipment', 'indoor_cardio', 'gym_and_fitness_equipment', 'strength'],
};

function classifyActivity(typeKey: string): 'running' | 'cycling' | 'strength' | null {
  const key = typeKey.toLowerCase();
  for (const [category, types] of Object.entries(ACTIVITY_TYPES)) {
    if (types.some((t) => key === t || key.includes(t))) {
      return category as 'running' | 'cycling' | 'strength';
    }
  }
  return null;
}

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

async function getGarminClient(): Promise<GarminConnect> {
  const tokenB64 = process.env.GARMIN_TOKEN;

  if (tokenB64) {
    // Token-based auth (after MFA flow)
    const tokenData = JSON.parse(Buffer.from(tokenB64, "base64").toString());
    const client = new GarminConnect({
      username: process.env.GARMIN_EMAIL || "token-auth",
      password: process.env.GARMIN_PASSWORD || "token-auth",
    });
    client.loadToken(tokenData.oauth1, tokenData.oauth2);
    return client;
  }

  // Fallback: username/password (works only without MFA)
  const email = process.env.GARMIN_EMAIL;
  const password = process.env.GARMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Brak GARMIN_TOKEN ani GARMIN_EMAIL/GARMIN_PASSWORD");
  }
  const client = new GarminConnect({ username: email, password });
  await client.login();
  return client;
}

export async function GET() {
  try {
    const client = await getGarminClient();

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

    const sumByCategory = (
      list: typeof activities,
      category: 'running' | 'cycling' | 'strength',
      field: "distanceKm" | "durationMin" | "calories"
    ) =>
      list
        .filter((a) => classifyActivity(a.type) === category)
        .reduce((sum, a) => sum + a[field], 0);

    const countByCategory = (
      list: typeof activities,
      category: 'running' | 'cycling' | 'strength'
    ) => list.filter((a) => classifyActivity(a.type) === category).length;

    const summary = {
      month: {
        cyclingKm: Math.round(sumByCategory(monthActivities, "cycling", "distanceKm") * 100) / 100,
        runningKm: Math.round(sumByCategory(monthActivities, "running", "distanceKm") * 100) / 100,
        activeCalories: Math.round(
          monthActivities.reduce((s, a) => s + a.calories, 0)
        ),
        gymSessions: countByCategory(monthActivities, "strength"),
      },
      week: {
        cyclingKm: Math.round(sumByCategory(weekActivities, "cycling", "distanceKm") * 100) / 100,
        runningKm: Math.round(sumByCategory(weekActivities, "running", "distanceKm") * 100) / 100,
        activeCalories: Math.round(
          weekActivities.reduce((s, a) => s + a.calories, 0)
        ),
        gymSessions: countByCategory(weekActivities, "strength"),
        // Daily breakdown for charts (Mon-Sun)
        dailyRunning: getDailyBreakdown(weekActivities, "running", weekStart),
        dailyCycling: getDailyBreakdown(weekActivities, "cycling", weekStart),
        dailyGym: getDailyGymBreakdown(weekActivities, weekStart),
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
  category: 'running' | 'cycling',
  weekStart: Date
): number[] {
  const days = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun
  for (const a of activities) {
    if (classifyActivity(a.type) !== category) continue;
    const d = new Date(a.date);
    let dayIdx = d.getDay() - 1; // 0=Mon
    if (dayIdx < 0) dayIdx = 6; // Sunday = 6
    days[dayIdx] += a.distanceKm;
  }
  return days.map((v) => Math.round(v * 100) / 100);
}

function getDailyGymBreakdown(
  activities: { type: string; date: string }[],
  weekStart: Date
): boolean[] {
  const days = [false, false, false, false, false, false, false]; // Mon-Sun
  for (const a of activities) {
    if (classifyActivity(a.type) !== 'strength') continue;
    const d = new Date(a.date);
    let dayIdx = d.getDay() - 1;
    if (dayIdx < 0) dayIdx = 6;
    days[dayIdx] = true;
  }
  return days;
}
