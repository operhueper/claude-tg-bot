import { InlineKeyboard } from "grammy";

/** Inline keyboard shown when free-tier limit is reached. */
export function upgradeKeyboard(): InlineKeyboard {
  return new InlineKeyboard().url(
    "⭐ Оформить Профи — 250 Stars",
    "https://t.me/proboiAI_bot?start=pay"
  );
}
