// Proxies Google Cloud Vision so the API key never ships in the app, and caps
// total scans per month (supabase/migrations/*_scan_quota.sql) as a cost safety net.
//
// Deploy:  supabase functions deploy ocr
// Secrets: supabase secrets set GOOGLE_CLOUD_VISION_API_KEY=<key>
//          supabase secrets set SCAN_MONTHLY_LIMIT=1000   (optional, default 1000)

import { createClient } from 'npm:@supabase/supabase-js@2';

const VISION_URL = 'https://vision.googleapis.com/v1/images:annotate';
// Matches Cloud Vision's free tier of 1,000 text-detection units per month.
const DEFAULT_MONTHLY_LIMIT = 1000;
// Vision rejects images over 10 MB; base64 inflates size by 4/3.
const MAX_BASE64_LENGTH = Math.floor((10 * 1024 * 1024 * 4) / 3);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');
  if (!apiKey) return json({ error: 'GOOGLE_CLOUD_VISION_API_KEY is not set' }, 500);

  const { image } = await req.json().catch(() => ({}));
  if (typeof image !== 'string' || image.length === 0) {
    return json({ error: 'Body must be { "image": "<base64 JPEG>" }' }, 400);
  }
  if (image.length > MAX_BASE64_LENGTH) return json({ error: 'Image too large' }, 413);

  // SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to every Edge Function.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const limit = Number(Deno.env.get('SCAN_MONTHLY_LIMIT') ?? DEFAULT_MONTHLY_LIMIT);
  const { data, error: quotaError } = await supabase.rpc('consume_scan_quota', { p_limit: limit }).single();
  const quota = data as { allowed: boolean; used: number } | null;
  if (quotaError || !quota) {
    console.error('Quota check failed', quotaError);
    return json({ error: 'Quota check failed' }, 500);
  }
  if (!quota.allowed) {
    return json({ error: 'quota_exhausted', used: quota.used, limit }, 429);
  }

  const visionRes = await fetch(`${VISION_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [
        {
          image: { content: image },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          imageContext: { languageHints: ['ar'] },
        },
      ],
    }),
  });
  const result = await visionRes.json();
  const response = result.responses?.[0];
  if (!visionRes.ok || response?.error) {
    console.error('Vision error', visionRes.status, JSON.stringify(result.error ?? response?.error));
    return json({ error: 'OCR failed' }, 502);
  }

  return json({ text: response?.fullTextAnnotation?.text ?? '' });
});
