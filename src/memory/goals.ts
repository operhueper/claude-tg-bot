import * as fs from "fs";
import type { GoalsFile, Goal, Achievement, GoalStatus, GoalType } from "./types";
import { goalsFilePath, ensureMemoryStructure } from "./paths";

function ulid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export class GoalsStore {
  constructor(private workingDir: string, private userId?: number) {}

  load(): GoalsFile {
    const file = goalsFilePath(this.workingDir, this.userId);
    if (!fs.existsSync(file)) {
      return { version: 1, goals: {}, achievements: {}, updated_at: new Date().toISOString() };
    }
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as GoalsFile;
    } catch {
      return { version: 1, goals: {}, achievements: {}, updated_at: new Date().toISOString() };
    }
  }

  save(g: GoalsFile): void {
    ensureMemoryStructure(this.workingDir, this.userId);
    const file = goalsFilePath(this.workingDir, this.userId);
    const tmp = file + ".tmp";
    g.updated_at = new Date().toISOString();
    fs.writeFileSync(tmp, JSON.stringify(g, null, 2), "utf8");
    fs.renameSync(tmp, file);
  }

  addGoal(g: GoalsFile, partial: Omit<Goal, "id" | "created_at" | "updated_at" | "status">): Goal {
    const now = new Date().toISOString();
    const goal: Goal = {
      id: ulid(),
      status: "active",
      created_at: now,
      updated_at: now,
      ...partial,
    };
    g.goals[goal.id] = goal;
    return goal;
  }

  updateGoal(g: GoalsFile, id: string, patch: Partial<Goal>): Goal {
    const goal = g.goals[id];
    if (!goal) throw new Error(`Goal ${id} not found`);
    Object.assign(goal, patch, { updated_at: new Date().toISOString() });
    if (patch.status === "done" && !goal.completed_at) {
      goal.completed_at = new Date().toISOString();
    }
    return goal;
  }

  addAchievement(g: GoalsFile, partial: Omit<Achievement, "id" | "created_at">): Achievement {
    const achievement: Achievement = {
      id: ulid(),
      created_at: new Date().toISOString(),
      ...partial,
    };
    g.achievements[achievement.id] = achievement;
    return achievement;
  }

  formatGoalsList(g: GoalsFile, filter?: { status?: GoalStatus; type?: GoalType }): string {
    const goals = Object.values(g.goals).filter(goal => {
      if (filter?.status && goal.status !== filter.status) return false;
      if (filter?.type && goal.type !== filter.type) return false;
      return true;
    });

    if (goals.length === 0) return "Целей пока нет.";

    const byType: Record<string, Goal[]> = {};
    for (const goal of goals) {
      if (!byType[goal.type]) byType[goal.type] = [];
      byType[goal.type]!.push(goal);
    }

    const typeLabels: Record<GoalType, string> = {
      daily: "📅 На день",
      weekly: "📆 На неделю",
      monthly: "🗓 На месяц",
      yearly: "📊 На год",
      lifetime: "🌟 Жизненные",
    };

    const statusEmoji: Record<GoalStatus, string> = {
      active: "🔵",
      done: "✅",
      paused: "⏸",
      abandoned: "❌",
    };

    let result = "";
    for (const [type, typeGoals] of Object.entries(byType)) {
      result += `\n<b>${typeLabels[type as GoalType] ?? type}</b>\n`;
      for (const goal of typeGoals) {
        const emoji = statusEmoji[goal.status];
        const deadline = goal.deadline ? ` (до ${goal.deadline})` : "";
        result += `${emoji} ${goal.title}${deadline}\n`;
      }
    }

    const achievements = Object.values(g.achievements);
    if (achievements.length > 0) {
      result += `\n<b>🏆 Достижения (${achievements.length})</b>\n`;
      achievements.slice(-3).forEach(a => {
        result += `• ${a.title} — ${a.date}\n`;
      });
    }

    return result.trim();
  }
}
