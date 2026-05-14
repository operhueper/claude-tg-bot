/**
 * Consent gate UI — shows the legal documents acceptance screen.
 */

import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";

const GATE_TEXT =
  `📜 <b>Перед началом работы</b>\n\n` +
  `Чтобы пользоваться Proboi, пожалуйста, ознакомьтесь с тремя документами и подтвердите согласие.\n\n` +
  `• <a href="https://proboi.site/oferta">Публичная оферта</a> — условия платной подписки\n` +
  `• <a href="https://proboi.site/privacy">Политика конфиденциальности</a> — какие данные мы обрабатываем и как защищаем\n` +
  `• <a href="https://proboi.site/terms">Пользовательское соглашение</a> — правила использования бота\n\n` +
  `Нажимая кнопку ниже, вы подтверждаете, что прочитали и принимаете все три документа.`;

export async function sendConsentGate(ctx: Context): Promise<void> {
  const kb = new InlineKeyboard().text("✅ Принимаю условия", "consent_accept");
  await ctx.reply(GATE_TEXT, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: kb,
  });
}
