#!/usr/bin/env bun
/**
 * fitcoach-morning.ts
 * Morning nudge: if today is a rest day, remind to move.
 * Run via cron at 10:00 every day.
 */

import { readFileSync, existsSync } from "fs";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_ID = 292228713;
const DASHBOARD_PATH = "/opt/vault/292228713/fitcoach/dashboard-today.json";
const PROGRAM_PATH = "/opt/vault/292228713/fitcoach/programs/current.md";

if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN not set");
  process.exit(1);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
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

async function main() {
  // Check if today's log already exists and has a training day type
  if (existsSync(DASHBOARD_PATH)) {
    let data: any;
    try {
      data = JSON.parse(readFileSync(DASHBOARD_PATH, "utf-8"));
    } catch {}

    if (data?.date === today()) {
      const isTraining =
        data.type?.includes("тренировочн") && !data.type?.includes("не");
      if (isTraining) {
        // Training day — no nudge needed
        console.log("Training day, no morning nudge needed.");
        return;
      }
    }
  }

  // Rest day nudge
  const msgs = [
    "Доброе утро! Сегодня день отдыха 😴\n\nМышцы восстанавливаются — это важно. Но постарайся набрать хотя бы <b>7–8 тысяч шагов</b>: прогулка, поход в магазин, просто пройтись. Лёгкое движение ускоряет восстановление и не мешает росту. 🚶",
    "Привет! Сегодня без зала 🔋\n\nДень отдыха — не значит лежать. <b>Прогуляйся 30–40 минут</b> в любом темпе. Это поддержит метаболизм и кровоток. Завтра на тренировку придёшь живее. 🌳",
    "Сегодня нетренировочный день 💤\n\nПланируй хотя бы <b>лёгкую активность</b> — пешком вместо такси, подняться по лестнице, короткая прогулка. Суммарно 6–8 тыс. шагов — отличная цель. 👟",
    "Отдыхаем сегодня! 🛌\n\nНо помни: <b>полный покой — не лучший отдых</b>. 20–30 минут неспешной ходьбы улучшат самочувствие и не нагрузят мышцы. Плюс солнце, воздух — это тоже восстановление. ☀️",
  ];

  const idx = new Date().getDay() % msgs.length;
  await sendMessage(msgs[idx]!);
  console.log("Morning rest-day nudge sent.");
}

main().catch((e) => {
  console.error("Error:", e);
  process.exit(1);
});
