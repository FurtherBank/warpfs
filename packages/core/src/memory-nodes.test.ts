import { describe, it, expect } from "vitest";
import { MemoryFile, MemoryFolder } from "./memory-nodes.js";

describe("MemoryFile", () => {
  it("stores and reads content", async () => {
    const file = new MemoryFile("test.txt", "Hello WarpFS");
    const content = await file.read();
    expect(content.toString()).toBe("Hello WarpFS");
  });

  it("writes new content", async () => {
    const file = new MemoryFile("test.txt", "old");
    await file.write(Buffer.from("new"));
    const content = await file.read();
    expect(content.toString()).toBe("new");
  });

  it("reports correct size", () => {
    const file = new MemoryFile("test.txt", "abc");
    expect(file.getSize()).toBe(3);
  });

  it("is not a folder", () => {
    const file = new MemoryFile("test.txt");
    expect(file.isFolder()).toBe(false);
  });
});

describe("MemoryFolder", () => {
  it("starts empty", async () => {
    const folder = new MemoryFolder("root");
    expect(await folder.listChildren()).toEqual([]);
  });

  it("creates child files", async () => {
    const folder = new MemoryFolder("root");
    const file = await folder.createChildFile("hello.txt");
    await file.write(Buffer.from("content"));

    const children = await folder.listChildren();
    expect(children).toHaveLength(1);
    expect(children[0].name).toBe("hello.txt");
  });

  it("creates child folders", async () => {
    const folder = new MemoryFolder("root");
    await folder.createChildFolder("subfolder");

    const children = await folder.listChildren();
    expect(children).toHaveLength(1);
    expect(children[0].isFolder()).toBe(true);
  });

  it("removes children by name", async () => {
    const folder = new MemoryFolder("root");
    await folder.createChildFile("a.txt");
    await folder.createChildFile("b.txt");

    const removed = await folder.removeChild("a.txt");
    expect(removed).toBe(true);
    expect(await folder.listChildren()).toHaveLength(1);
  });

  it("findChild returns correct node", async () => {
    const folder = new MemoryFolder("root");
    await folder.createChildFile("target.md");

    const found = await folder.findChild("target.md");
    expect(found).toBeDefined();
    expect(found!.name).toBe("target.md");
  });

  it("findChild returns undefined for missing", async () => {
    const folder = new MemoryFolder("root");
    expect(await folder.findChild("nope")).toBeUndefined();
  });
});
