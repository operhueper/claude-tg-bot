#!/usr/bin/env bun
/**
 * fitcoach-sync.ts
 * Reads today's markdown log and updates dashboard-today.json for all users.
 * Run via cron every 2 minutes.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";

interface Meal {
  time: string;
  name: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

interface SetDone {
  done: boolean;
  reps: number;
  note?: string;
}

interface Exercise {
  name: string;
  target_sets: number;
  target_reps: string;
  weight: number | null;
  sets_done: SetDone[];
}

interface DashboardJson {
  date: string;
  type: string;
  goal: { kcal: number; protein: number; fat: number; carbs: number };
  actual: { kcal: number; protein: number; fat: number; carbs: number };
  meals: { time: string; name: string; kcal: number }[];
  workout: {
    planned: string | null;
    day_label: string | null;
    exercises: Exercise[];
  };
}

const USERS: { userId: string; logDir: string; dashboardPath: string }[] = [
  {
    userId: "292228713",
    logDir: "/opt/vault/292228713/fitcoach/logs",
    dashboardPath: "/opt/vault/292228713/fitcoach/dashboard-today.json",
  },
  {
    userId: "893951298",
    logDir: "/opt/vault/893951298/fitcoach/logs",
    dashboardPath: "/opt/vault/893951298/fitcoach/dashboard-today.json",
  },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseNum(s: string): number {
  const n = parseInt(s.trim().replace(/[^\d]/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

function parseMdTable(lines: string[]): string[][] {
  return lines
    .filter((l) => l.startsWith("|") && !l.match(/^\|[-| ]+\|$/))
    .map((l) =>
      l
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim())
    );
}

function parseLog(content: string, date: string): DashboardJson {
  const lines = content.split("\n");

  // --- Day type and goals ---
  let type = "нетренировочный";
  let goal = { kcal: 2200, protein: 190, fat: 65, carbs: 200 };

  for (const line of lines) {
    const typeMatch = line.match(/^- Тип:\s*(.+)/);
    if (typeMatch) {
      type = typeMatch[1]!.trim();
    }
    // "- Цель: 2400 ккал | Б 190г / Ж 70г / У 220г"
    const goalMatch = line.match(
      /^- Цель:\s*(\d+)\s*ккал\s*\|\s*Б\s*(\d+)г\s*\/\s*Ж\s*(\d+)г\s*\/\s*У\s*(\d+)г/
    );
    if (goalMatch) {
      goal = {
        kcal: parseInt(goalMatch[1]!),
        protein: parseInt(goalMatch[2]!),
        fat: parseInt(goalMatch[3]!),
        carbs: parseInt(goalMatch[4]!),
      };
    }
  }

  // --- Nutrition section ---
  const meals: Meal[] = [];
  let inNutrition = false;
  let inNutrTable = false;

  for (const line of lines) {
    if (line.match(/^## Питание/)) {
      inNutrition = true;
      inNutrTable = false;
      continue;
    }
    if (inNutrition && line.match(/^## /)) {
      inNutrition = false;
      inNutrTable = false;
      continue;
    }
    if (inNutrition && line.startsWith("|")) {
      // Header row or separator
      if (line.match(/^\|[-| ]+\|$/)) continue;
      if (line.match(/Время\s*\|/)) {
        inNutrTable = true;
        continue;
      }
      if (!inNutrTable) continue;
      const cols = line.split("|").slice(1, -1).map((c) => c.trim());
      if (cols.length < 4) continue;
      const [time, name, kcalStr, protStr, fatStr, carbStr] = cols;
      const kcal = parseNum(kcalStr!);
      if (!name || kcal === 0) continue;
      meals.push({
        time: time || "—",
        name,
        kcal,
        protein: parseNum(protStr || "0"),
        fat: parseNum(fatStr || "0"),
        carbs: parseNum(carbStr || "0"),
      });
    }
  }

  // Actual totals (sum from parsed meals)
  const actual = meals.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      protein: acc.protein + m.protein,
      fat: acc.fat + m.fat,
      carbs: acc.carbs + m.carbs,
    }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0 }
  );

  // --- Workout section ---
  let planned: string | null = null;
  let day_label: string | null = null;
  const exercises: Exercise[] = [];
  let inWorkout = false;
  let inWorkoutTable = false;

  for (const line of lines) {
    if (line.match(/^## Тренировка/)) {
      inWorkout = true;
      inWorkoutTable = false;
      continue;
    }
    if (inWorkout && line.match(/^## /)) {
      inWorkout = false;
      continue;
    }
    if (inWorkout) {
      // "- Программа: День A — Грудь + Плечи"
      const progMatch = line.match(/^-\s*Программа:\s*(.+)/);
      if (progMatch) {
        const prog = progMatch[1]!.trim();
        // extract letter: "День A" or "A"
        const letterMatch = prog.match(/День\s+([A-Za-zА-Яа-я])/i) || prog.match(/^([A-Za-z])/);
        if (letterMatch) planned = letterMatch[1]!.toUpperCase();
        // extract label after "—"
        const dashMatch = prog.match(/[—–-]\s*(.+)/);
        if (dashMatch) day_label = dashMatch[1]!.trim();
        continue;
      }

      if (line.startsWith("|")) {
        if (line.match(/^\|[-| ]+\|$/)) continue;
        // Header row
        if (line.match(/Упражнение/)) {
          inWorkoutTable = true;
          continue;
        }
        if (!inWorkoutTable) continue;

        const cols = line.split("|").slice(1, -1).map((c) => c.trim());
        if (cols.length < 2) continue;
        const [exName, ...setCols] = cols;
        if (!exName || exName === "") continue;

        const sets_done: SetDone[] = [];
        for (const setStr of setCols) {
          if (!setStr || setStr === "—" || setStr === "") continue;
          // Remove emoji
          const clean = setStr.replace(/🏆/g, "").trim();
          // Patterns: "WU 50×12", "50×10", "14×12", "15×8" (weight×reps or just reps)
          const wuMatch = clean.match(/WU\s+\d+[×x](\d+)/i);
          const weightRepsMatch = clean.match(/(\d+)[×x](\d+)/);
          const repsOnly = clean.match(/^(\d+)$/);

          if (wuMatch) {
            sets_done.push({ done: true, reps: parseInt(wuMatch[1]!), note: "WU" });
          } else if (weightRepsMatch) {
            sets_done.push({ done: true, reps: parseInt(weightRepsMatch[2]!) });
          } else if (repsOnly) {
            sets_done.push({ done: true, reps: parseInt(repsOnly[1]!) });
          }
        }

        // Try to extract weight from exercise name or first set
        let weight: number | null = null;
        const weightInName = exName.match(/(\d+(?:\.\d+)?)\s*кг/);
        if (weightInName) weight = parseFloat(weightInName[1]!);
        // From first non-WU set col like "50×10"
        if (!weight) {
          for (const s of setCols) {
            const m = s.replace(/WU\s+/i, "").match(/^(\d+)[×x]/);
            if (m) { weight = parseInt(m[1]!); break; }
          }
        }

        exercises.push({
          name: exName,
          target_sets: sets_done.length || 3,
          target_reps: "10–12",
          weight,
          sets_done,
        });
      }
    }
  }

  return {
    date,
    type,
    goal,
    actual,
    meals: meals.map((m) => ({ time: m.time, name: m.name, kcal: m.kcal })),
    workout: { planned, day_label, exercises },
  };
}

function syncUser(user: (typeof USERS)[0]) {
  const date = today();
  const logPath = `${user.logDir}/${date}.md`;

  if (!existsSync(logPath)) {
    console.log(`[${user.userId}] No log for ${date}, skipping`);
    return;
  }

  const content = readFileSync(logPath, "utf-8");
  const dashboard = parseLog(content, date);

  // Preserve workout data from existing JSON if log has no workout yet
  // (so manually written workout details aren't lost if log parse finds nothing)
  if (dashboard.workout.exercises.length === 0 && existsSync(user.dashboardPath)) {
    try {
      const existing = JSON.parse(readFileSync(user.dashboardPath, "utf-8")) as DashboardJson;
      if (existing.date === date && existing.workout.exercises.length > 0) {
        dashboard.workout = existing.workout;
      }
    } catch {}
  }

  writeFileSync(user.dashboardPath, JSON.stringify(dashboard, null, 2) + "\n");
  console.log(
    `[${user.userId}] Synced ${date}: ${dashboard.actual.kcal} ккал, ${dashboard.meals.length} приёмов, ${dashboard.workout.exercises.length} упражнений`
  );
}

for (const user of USERS) {
  try {
    syncUser(user);
  } catch (e) {
    console.error(`[${user.userId}] Error:`, e);
  }
}
