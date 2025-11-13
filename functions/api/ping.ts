// functions/api/ping.ts

// Add the proper Cloudflare Pages Function type
interface Env {
  KAVA_TOURNAMENTS: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  return new Response(
    JSON.stringify({ 
      ok: true, 
      ts: Date.now() 
    }), 
    {
      headers: { 
        "content-type": "application/json", 
        "cache-control": "no-store" 
      },
    }
  );
};