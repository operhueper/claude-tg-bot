#!/usr/bin/env bun
/**
 * fitcoach-evening.ts
 * Sends evening summary to the owner via Telegram.
 * Run via cron at 21:00 every day.
 */

import { readFileSync, existsSync } from "fs";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_ID = 292228713;
const DASHBOARD_PATH = "/opt/vault/292228713/fitcoach/dashboard-today.json";

if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN not set");
  process.exit(1);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function bar(actual: number, goal: number, width = 10): string {
  const filled = Math.min(width, Math.round((actual / goal) * width));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function pct(actual: number, goal: number): string {
  return `${Math.round((actual / goal) * 100)}%`;
}

async function sendMessage(text: string) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: OWNER_ID,
      text,
      parse_mode: "HTML",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram API error: ${err}`);
  }
}

function buildSummary(data: any): string {
  const date = today();
  const isTraining = data.type?.includes("тренировочн") && !data.type?.includes("не");
  const g = data.goal || { kcal: 2200, protein: 190, fat: 65, carbs: 200 };
  const a = data.actual || { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  const meals: any[] = data.meals || [];
  const workout = data.workout || { planned: null, day_label: null, exercises: [] };

  const kcalOk = a.kcal >= g.kcal * 0.9 && a.kcal <= g.kcal * 1.1;
  const protOk = a.protein >= g.protein * 0.9;

  // Header
  let msg = `🌙 <b>Итог дня — ${date}</b>\n`;
  msg += isTraining ? "🏋️ Тренировочный день\n" : "😴 Нетренировочный день\n";
  msg += "\n";

  // Nutrition block
  msg += `<b>🥗 Питание</b>\n`;
  msg += `Калории:  ${bar(a.kcal, g.kcal)} ${a.kcal} / ${g.kcal} ккал (${pct(a.kcal, g.kcal)})\n`;
  msg += `Белок:    ${bar(a.protein, g.protein)} ${a.protein} / ${g.protein}г\n`;
  msg += `Жиры:     ${bar(a.fat, g.fat)} ${a.fat} / ${g.fat}г\n`;
  msg += `Углеводы: ${bar(a.carbs, g.carbs)} ${a.carbs} / ${g.carbs}г\n`;

  if (meals.length > 0) {
    msg += `\nЧто ел:\n`;
    for (const m of meals) {
      msg += `  • ${m.name} — ${m.kcal} ккал\n`;
    }
  }

  // Nutrition verdict
  msg += "\n";
  if (kcalOk && protOk) {
    msg += "✅ По питанию всё чётко, план выполнен.\n";
  } else {
    const issues = [];
    if (a.kcal < g.kcal * 0.9) issues.push(`недобор по калориям (−${g.kcal - a.kcal} ккал)`);
    if (a.kcal > g.kcal * 1.1) issues.push(`перебор по калориям (+${a.kcal - g.kcal} ккал)`);
    if (!protOk) issues.push(`белка не хватило (${a.protein}г из ${g.protein}г)`);
    msg += `⚠️ ${issues.join(", ")}.\n`;
  }

  // Workout block
  msg += `\n<b>💪 Тренировка</b>\n`;
  if (isTraining && workout.planned) {
    if (workout.exercises.length > 0) {
      msg += `День ${workout.planned} — ${workout.day_label || ""}\n`;
      for (const ex of workout.exercises) {
        const done = ex.sets_done?.filter((s: any) => s.done).length || 0;
        const w = ex.weight ? ` (${ex.weight}кг)` : "";
        msg += `  ✓ ${ex.name}${w} — ${done} подх.\n`;
      }
      msg += "✅ Тренировка выполнена.\n";
    } else {
      msg += "❓ Тренировка не записана.\n";
    }
  } else if (!isTraining) {
    msg += "Сегодня отдых — мышцы восстанавливаются. 🔋\n";
  } else {
    msg += "Тренировки не было.\n";
  }

  // Footer tip
  msg += `\n💬 Завтра ${nextDayTip(isTraining, workout)}`;

  return msg;
}

function nextDayTip(wasTraining: boolean, workout: any): string {
  if (wasTraining) {
    return "день отдыха — побольше ходи пешком, 7-8 тыс. шагов минимум.";
  } else {
    const nextDay = workout.planned
      ? `следующая тренировка (День ${nextWorkoutDay(workout.planned)}).`
      : "можно выйти на тренировку.";
    return nextDay;
  }
}

function nextWorkoutDay(current: string): string {
  const map: Record<string, string> = { A: "B", B: "C", C: "A" };
  return map[current?.toUpperCase()] || "A";
}

function buildRestDayMessage(): string {
  const tips = [
    "Сегодня нет тренировки — хороший повод пройтись пешком хотя бы 7-8 тыс. шагов. Лёгкое движение ускоряет восстановление. 🚶",
    "День отдыха — не значит лежать весь день. 30 минут пешком или лёгкая прогулка поддержат метаболизм. 🌳",
    "Нетренировочный день: мышцы растут, пока ты отдыхаешь. Но небольшая прогулка не помешает — лучше кровоток, лучше восстановление. 🔄",
    "Сегодня отдыхаем. Если сидишь весь день — постарайся вставать каждый час и немного двигаться. Суммарно набери хотя бы 5 тыс. шагов. 👟",
  ];
  const idx = new Date().getDay() % tips.length;
  return `🚶 <b>Напоминание</b>\n\n${tips[idx]}`;
}

async function main() {
  if (!existsSync(DASHBOARD_PATH)) {
    console.log("No dashboard file found, skipping");
    return;
  }

  let data: any;
  try {
    data = JSON.parse(readFileSync(DASHBOARD_PATH, "utf-8"));
  } catch (e) {
    console.error("Failed to read dashboard JSON:", e);
    return;
  }

  // Only send if data is for today
  if (data.date !== today()) {
    console.log(`Dashboard is from ${data.date}, not today — skipping`);
    return;
  }

  const summary = buildSummary(data);
  await sendMessage(summary);
  console.log("Evening summary sent.");
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
