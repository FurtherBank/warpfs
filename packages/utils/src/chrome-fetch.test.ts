import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("chrome-cookies-secure", () => ({
  getCookiesPromised: vi.fn(),
}));

import { getCookiesPromised } from "chrome-cookies-secure";
import { getChromeCookie, chromeFetch } from "./chrome-fetch.js";

const mockGetCookies = vi.mocked(getCookiesPromised);

describe("getChromeCookie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls getCookiesPromised with correct arguments", async () => {
    mockGetCookies.mockResolvedValue("session=abc; token=xyz");

    const result = await getChromeCookie("https://example.com");

    expect(mockGetCookies).toHaveBeenCalledWith(
      "https://example.com",
      "header",
      "Default",
    );
    expect(result).toBe("session=abc; token=xyz");
  });

  it("passes custom profile", async () => {
    mockGetCookies.mockResolvedValue("id=123");

    await getChromeCookie("https://example.com", "Profile 1");

    expect(mockGetCookies).toHaveBeenCalledWith(
      "https://example.com",
      "header",
      "Profile 1",
    );
  });
});

describe("chromeFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("ok", { status: 200 })),
    );
  });

  it("injects Chrome cookies into request headers", async () => {
    mockGetCookies.mockResolvedValue("session=abc");

    await chromeFetch("https://example.com");

    expect(fetch).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get("Cookie")).toBe("session=abc");
  });

  it("sets Chrome-like User-Agent header", async () => {
    mockGetCookies.mockResolvedValue("");

    await chromeFetch("https://example.com");

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get("User-Agent")).toContain("Chrome/");
  });

  it("user-supplied headers override defaults", async () => {
    mockGetCookies.mockResolvedValue("");

    await chromeFetch("https://example.com", {
      headers: { "User-Agent": "custom-agent" },
    });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get("User-Agent")).toBe("custom-agent");
  });

  it("passes through other fetch init options", async () => {
    mockGetCookies.mockResolvedValue("");

    await chromeFetch("https://example.com", { method: "POST", body: "data" });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe("data");
  });

  it("works with URL objects", async () => {
    mockGetCookies.mockResolvedValue("k=v");
    const url = new URL("https://example.com/path");

    await chromeFetch(url);

    expect(mockGetCookies).toHaveBeenCalledWith(
      "https://example.com/path",
      "header",
      "Default",
    );
  });

  it("passes custom profile for cookie retrieval", async () => {
    mockGetCookies.mockResolvedValue("k=v");

    await chromeFetch("https://example.com", undefined, "Profile 2");

    expect(mockGetCookies).toHaveBeenCalledWith(
      "https://example.com",
      "header",
      "Profile 2",
    );
  });

  it("does not set Cookie header when cookie string is empty", async () => {
    mockGetCookies.mockResolvedValue("");

    await chromeFetch("https://example.com");

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.has("Cookie")).toBe(false);
  });
});
