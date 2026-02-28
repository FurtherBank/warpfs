import { describe, it, expect, vi } from "vitest";
import { createDebouncedWrite } from "./debounce.js";

describe("createDebouncedWrite", () => {
  it("collapses rapid writes into one", async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined);
    const handle = createDebouncedWrite(writeFn, 100);

    handle.push(Buffer.from("v1"));
    handle.push(Buffer.from("v2"));
    handle.push(Buffer.from("v3"));

    await new Promise((r) => setTimeout(r, 200));

    expect(writeFn).toHaveBeenCalledTimes(1);
    expect(writeFn).toHaveBeenCalledWith(Buffer.from("v3"));
  });

  it("flush() forces immediate write", async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined);
    const handle = createDebouncedWrite(writeFn, 5000);

    handle.push(Buffer.from("immediate"));
    await handle.flush();

    expect(writeFn).toHaveBeenCalledTimes(1);
    expect(writeFn).toHaveBeenCalledWith(Buffer.from("immediate"));
  });

  it("cancel() prevents pending write", async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined);
    const handle = createDebouncedWrite(writeFn, 100);

    handle.push(Buffer.from("cancelled"));
    handle.cancel();

    await new Promise((r) => setTimeout(r, 200));
    expect(writeFn).not.toHaveBeenCalled();
  });

  it("handles sequential debounce cycles independently", async () => {
    const writeFn = vi.fn().mockResolvedValue(undefined);
    const handle = createDebouncedWrite(writeFn, 50);

    handle.push(Buffer.from("cycle1"));
    await new Promise((r) => setTimeout(r, 100));
    expect(writeFn).toHaveBeenCalledWith(Buffer.from("cycle1"));

    handle.push(Buffer.from("cycle2"));
    await new Promise((r) => setTimeout(r, 100));
    expect(writeFn).toHaveBeenCalledTimes(2);
    expect(writeFn).toHaveBeenLastCalledWith(Buffer.from("cycle2"));
  });
});
