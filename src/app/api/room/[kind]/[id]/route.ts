// ...inside PUT after you've computed nextV and saved the body...
// (You already have: await env.KAVA_TOURNAMENTS.put(LKEY(id), JSON.stringify(body)); await setV(env, id, nextV);)

try {
  // Publish fresh doc to the DO room so all clients update instantly
  const pubUrl = new URL(`https://dummy/`); // host doesn’t matter; we call stub via fetch below
  pubUrl.pathname = `/publish`;
  const objId = (getRequestContext() as any).env.KAVA_ROOM_DO.idFromName(`list:${id}`);
  const stub = (getRequestContext() as any).env.KAVA_ROOM_DO.get(objId);
  await stub.fetch(pubUrl.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      version: nextV,
      payload: coerceOut(body), // send normalized doc (what GET returns)
    }),
  });
} catch {}
