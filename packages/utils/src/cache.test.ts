import { describe, it, expect, vi } from "vitest";
import { createCachedFn } from "./cache.js";

describe("createCachedFn", () => {
  it("caches results within TTL window", async () => {
    let callCount = 0;
    const fn = createCachedFn(async () => {
      callCount++;
      return `result-${callCount}`;
    }, { ttl: 500 });

    const r1 = await fn();
    const r2 = await fn();
    expect(r1).toBe("result-1");
    expect(r2).toBe("result-1");
    expect(callCount).toBe(1);
  });

  it("refreshes after TTL expires", async () => {
    let callCount = 0;
    const fn = createCachedFn(async () => {
      callCount++;
      return callCount;
    }, { ttl: 100 });

    await fn();
    expect(callCount).toBe(1);

    await new Promise((r) => setTimeout(r, 150));

    const result = await fn();
    expect(callCount).toBe(2);
    expect(result).toBe(2);
  });

  it("protects upstream from burst reads", async () => {
    const upstream = vi.fn().mockResolvedValue("data");
    const fn = createCachedFn(upstream, { ttl: 1000 });

    await Promise.all(Array.from({ length: 50 }, () => fn()));

    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
