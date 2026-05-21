/**
 * Raw HTTP client — the only file that knows about API_BASE and fetch().
 * All other service modules call through these helpers.
 */

export const API_BASE =
  import.meta.env.VITE_API_BASE || "http://127.0.0.1:4000";

/**
 * Make an authenticated JSON request.
 * - Throws on 4xx (so callers can surface user-facing errors).
 * - Returns null on 5xx / network errors (graceful degradation).
 */
export async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE}${url}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });

    if (!response.ok) {
      if (response.status >= 400 && response.status < 500) {
        try {
          const errBody = await response.json();
          const msg =
            errBody?.error ||
            errBody?.message ||
            `Request failed with status ${response.status}`;
          throw new Error(msg);
        } catch (parseErr) {
          if (parseErr instanceof SyntaxError) {
            throw new Error(`Request failed with status ${response.status}`);
          }
          throw parseErr;
        }
      }
      return null;
    }

    if (response.status === 204) return null;
    return (await response.json()) as T;
  } catch (err) {
    if (
      err instanceof Error &&
      !err.message.startsWith("Failed to fetch") &&
      !err.message.startsWith("NetworkError")
    ) {
      throw err;
    }
    return null;
  }
}

/** Convenience wrapper for GET requests. */
export async function fetchJson<T>(url: string): Promise<T | null> {
  return requestJson<T>(url, { method: "GET" });
}
