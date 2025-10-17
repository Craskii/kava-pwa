// src/lib/push.ts
import { getRequestContext } from "@cloudflare/next-on-pages";

type EnvMaybe = { ONESIGNAL_APP_ID?: string; ONESIGNAL_REST_API_KEY?: string };

/** Call OneSignal REST API to push to players by external_user_id (playerId) */
export async function sendPushToPlayers(
  playerIds: string[],
  title: string,
  body: string,
  url?: string
) {
  if (!playerIds || playerIds.length === 0) return;

  const ctx: any = getRequestContext?.();
  const env = (ctx?.env as EnvMaybe) || (process.env as unknown as EnvMaybe);

  const appId = env?.ONESIGNAL_APP_ID || process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
  const restKey = env?.ONESIGNAL_REST_API_KEY;

  if (!appId || !restKey) {
    // silently skip if not configured
    return;
  }

  try {
    await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${restKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: appId,
        include_external_user_ids: playerIds,
        headings: { en: title },
        contents: { en: body },
        url,
      })
    });
  } catch {
    // ignore to avoid breaking the main flow
  }
}
