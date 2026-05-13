/**
 * OpenRouter Provisioning API — create/delete per-user subkeys.
 *
 * Requires OPENROUTER_PROVISIONING_KEY env var (separate from the shared
 * OPENROUTER_API_KEY). If not set, all functions no-op gracefully.
 */

const PROVISIONING_KEY = process.env.OPENROUTER_PROVISIONING_KEY ?? "";
const PROVISIONING_LIMIT_USD = parseFloat(
  process.env.OPENROUTER_GUEST_LIMIT_USD ?? "2.0"
);

interface ProvisioningKeyResponse {
  data: {
    key: string;
    hash: string;
    name?: string;
    label?: string;
  };
}

/**
 * Create a per-user OpenRouter subkey with a spending limit.
 * Returns the key string ("sk-or-v1-...") or null on failure/misconfiguration.
 */
export async function createGuestSubKey(
  userId: number,
  label: string
): Promise<string | null> {
  if (!PROVISIONING_KEY) return null;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/keys", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PROVISIONING_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `guest-${userId}`,
        label,
        limit: PROVISIONING_LIMIT_USD,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "(unreadable)");
      console.error(
        `[openrouter-provisioning] createGuestSubKey failed for ${userId}: HTTP ${res.status} — ${body}`
      );
      return null;
    }

    const json = (await res.json()) as ProvisioningKeyResponse;
    const key = json?.data?.key;
    if (!key) {
      console.error(
        `[openrouter-provisioning] createGuestSubKey: unexpected response shape for ${userId}:`,
        JSON.stringify(json)
      );
      return null;
    }

    console.log(
      `[openrouter-provisioning] Created subkey for user ${userId} (limit $${PROVISIONING_LIMIT_USD})`
    );
    return key;
  } catch (err) {
    console.error(
      `[openrouter-provisioning] createGuestSubKey error for ${userId}:`,
      err
    );
    return null;
  }
}

/**
 * Delete a previously created subkey by its hash.
 * For future use when removing a guest. No-ops if provisioning key is absent.
 */
export async function deleteGuestSubKey(keyHash: string): Promise<void> {
  if (!PROVISIONING_KEY) return;

  try {
    const res = await fetch(
      `https://openrouter.ai/api/v1/keys/${encodeURIComponent(keyHash)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${PROVISIONING_KEY}`,
        },
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "(unreadable)");
      console.error(
        `[openrouter-provisioning] deleteGuestSubKey failed for hash ${keyHash}: HTTP ${res.status} — ${body}`
      );
    } else {
      console.log(
        `[openrouter-provisioning] Deleted subkey hash=${keyHash}`
      );
    }
  } catch (err) {
    console.error(
      `[openrouter-provisioning] deleteGuestSubKey error for hash ${keyHash}:`,
      err
    );
  }
}
