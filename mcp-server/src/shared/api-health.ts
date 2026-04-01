/**
 * API connectivity check — replaces process-manager.ts.
 * Does NOT spawn processes. Only verifies the API is reachable.
 */
import { getApiUrl, CONFIG_PATH_DISPLAY } from "./config.js";

export async function checkApiConnectivity(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const baseUrl = getApiUrl();
  try {
    const res = await fetch(`${baseUrl}/health`);
    if (res.ok) return { ok: true };
    return {
      ok: false,
      error:
        `API responded with status ${res.status} at ${baseUrl}.\n` +
        `Check that the LucidLink API is running and healthy.`,
    };
  } catch {
    return {
      ok: false,
      error:
        `Cannot connect to LucidLink API at ${baseUrl}.\n\n` +
        `To fix this, either:\n` +
        `  1. Start the LucidLink API Docker container:\n` +
        `     docker run -d -p 3003:3003 lucidlink/lucidlink-api\n\n` +
        `  2. Or point to your existing API instance:\n` +
        `     export LUCIDLINK_API_URL=http://your-api-host:3003/api/v1\n` +
        `     (or set apiUrl in ${CONFIG_PATH_DISPLAY})`,
    };
  }
}
