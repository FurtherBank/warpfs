import { getCookiesPromised } from "chrome-cookies-secure";

/**
 * Default headers that mimic a Chrome browser request.
 */
const CHROME_DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Sec-Ch-Ua":
    '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"macOS"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

/**
 * Get Chrome cookies for a given URL from the local Chrome database.
 *
 * This reads the current user's Chrome cookie store and returns the cookies
 * associated with the given URL as a header string (e.g. "name=value; name2=value2").
 *
 * @param url - The target URL to retrieve cookies for (e.g. "https://example.com")
 * @param profile - Chrome profile to use. Defaults to 'Default'.
 *   Use 'Profile 1', 'Profile 2', etc. for additional Chrome profiles.
 * @returns A promise that resolves to the cookie header string.
 */
export async function getChromeCookie(
  url: string,
  profile = "Default",
): Promise<string> {
  return getCookiesPromised(url, "header", profile);
}

/**
 * A fetch wrapper that automatically injects Chrome cookies and
 * Chrome-like default request headers.
 *
 * Works identically to the global `fetch`, but:
 * 1. Reads cookies from the local Chrome cookie store via `getChromeCookie(url)`.
 * 2. Sets a Chrome User-Agent and other standard browser headers.
 * 3. User-supplied headers in `init` take precedence over defaults.
 *
 * @param input - The URL or Request object (same as `fetch`).
 * @param init - Optional request init options (same as `fetch`).
 * @param profile - Chrome profile to read cookies from. Defaults to 'Default'.
 * @returns A promise that resolves to the fetch Response.
 */
export async function chromeFetch(
  input: string | URL | Request,
  init?: RequestInit,
  profile = "Default",
): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  const cookie = await getChromeCookie(url, profile);

  const mergedHeaders = new Headers(CHROME_DEFAULT_HEADERS);

  if (cookie) {
    mergedHeaders.set("Cookie", cookie);
  }

  // User-supplied headers override defaults
  const userHeaders = new Headers(init?.headers);
  userHeaders.forEach((value, key) => {
    mergedHeaders.set(key, value);
  });

  return fetch(input, {
    ...init,
    headers: mergedHeaders,
  });
}
