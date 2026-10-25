const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export class OcrError extends Error {
  constructor(
    message: string,
    readonly reason: 'not-configured' | 'network' | 'server' | 'no-text' | 'quota'
  ) {
    super(message);
  }
}

export const isOcrConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Sends a base64 JPEG to the `ocr` Edge Function, which proxies Google Cloud Vision. */
export async function recognizeText(imageBase64: string): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new OcrError('EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set', 'not-configured');
  }

  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/ocr`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image: imageBase64 }),
    });
  } catch (e) {
    throw new OcrError(e instanceof Error ? e.message : String(e), 'network');
  }

  const body = (await res.json().catch(() => null)) as { text?: string; error?: string } | null;
  // The Edge Function caps total scans per month; see supabase/functions/ocr.
  if (res.status === 429) throw new OcrError('Monthly scan quota exhausted', 'quota');
  if (!res.ok) throw new OcrError(body?.error ?? `HTTP ${res.status}`, 'server');
  if (!body?.text?.trim()) throw new OcrError('No text detected', 'no-text');
  return body.text;
}
