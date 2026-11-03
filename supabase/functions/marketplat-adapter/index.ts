import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { Client } from "jsr:@db/postgres@0.19.5";

const rawUrl = Deno.env.get("AIVEN_DATABASE_URL")!;
const caCert = Deno.env.get("AIVEN_CA_CERT")!;

// 3. استخراج المعلمات بشكل منفصل لتجنب مشكلة "socket"
const urlObj = new URL(rawUrl);
const dbConfig = {
  hostname: urlObj.hostname,
  port: parseInt(urlObj.port) || 5432,
  user: decodeURIComponent(urlObj.username),
  password: decodeURIComponent(urlObj.password),
  database: urlObj.pathname.slice(1) || 'defaultdb',
  tls: {
    enabled: true,
    caCertificates: [caCert],
  },
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = new URL(req.url);
  const path = url.pathname.replace('/marketplat-adapter', '');

  const client = new Client(dbConfig);
  try {
    await client.connect();

    if (path === '/api/v1/categories') {
      const result = await client.queryObject`SELECT * FROM "Category" LIMIT 20`;
      return new Response(
        JSON.stringify({ success: true, message: "Categories fetched from Edge", data: result.rows }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    return new Response(JSON.stringify({ success: false, message: "Route not found" }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("DB Error:", msg);
    return new Response(JSON.stringify({ success: false, message: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } finally {
    try { await client.end(); } catch { /* ignore */ }
  }
});
