import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Server } from "node:http";
import { MemoryFolder, MemoryFile } from "./memory-nodes.js";
import { createProviderServer } from "./provider-server.js";
import { ProviderClient } from "./provider-client.js";

describe("Provider Protocol (server ↔ client)", () => {
  let server: Server;
  let client: ProviderClient;

  beforeAll(async () => {
    const root = new MemoryFolder("TestRoot");
    root.addChild(new MemoryFile("hello.txt", "Hello Provider!"));
    root.addChild(new MemoryFile("data.md", "# Data\nSome content."));

    const sub = new MemoryFolder("subdir");
    sub.addChild(new MemoryFile("nested.txt", "Nested content"));
    root.addChild(sub);

    server = createProviderServer(root);

    await new Promise<void>((resolve, reject) => {
      server.on("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as { port: number };
        client = new ProviderClient(`http://127.0.0.1:${addr.port}`);
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // stat
  it("stat returns root info", async () => {
    const info = await client.stat("/");
    expect(info).not.toBeNull();
    expect(info!.isFolder).toBe(true);
    expect(info!.name).toBe("TestRoot");
  });

  it("stat returns file info", async () => {
    const info = await client.stat("/hello.txt");
    expect(info).not.toBeNull();
    expect(info!.isFolder).toBe(false);
    expect(info!.name).toBe("hello.txt");
    expect(info!.size).toBe(Buffer.byteLength("Hello Provider!"));
  });

  it("stat returns null for non-existent path", async () => {
    const info = await client.stat("/no-such-file.txt");
    expect(info).toBeNull();
  });

  // list
  it("list returns children", async () => {
    const items = await client.list("/");
    expect(items).toHaveLength(3);
    const names = items.map((i) => i.name).sort();
    expect(names).toEqual(["data.md", "hello.txt", "subdir"]);
  });

  it("list returns nested children", async () => {
    const items = await client.list("/subdir");
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("nested.txt");
  });

  it("list returns empty for non-existent folder", async () => {
    const items = await client.list("/nonexistent");
    expect(items).toEqual([]);
  });

  // read
  it("read returns file content", async () => {
    const buf = await client.read("/hello.txt");
    expect(buf.toString()).toBe("Hello Provider!");
  });

  it("read returns nested file content", async () => {
    const buf = await client.read("/subdir/nested.txt");
    expect(buf.toString()).toBe("Nested content");
  });

  // write
  it("write updates existing file", async () => {
    await client.write("/hello.txt", Buffer.from("Updated!"));
    const buf = await client.read("/hello.txt");
    expect(buf.toString()).toBe("Updated!");
  });

  it("write creates new file if parent exists", async () => {
    await client.write("/new-file.txt", Buffer.from("Brand new"));
    const buf = await client.read("/new-file.txt");
    expect(buf.toString()).toBe("Brand new");
  });

  // create
  it("create file creates an empty file", async () => {
    const ok = await client.create("/created.txt", "file");
    expect(ok).toBe(true);
    const info = await client.stat("/created.txt");
    expect(info).not.toBeNull();
    expect(info!.isFolder).toBe(false);
  });

  it("create folder creates a directory", async () => {
    const ok = await client.create("/new-folder", "folder");
    expect(ok).toBe(true);
    const info = await client.stat("/new-folder");
    expect(info).not.toBeNull();
    expect(info!.isFolder).toBe(true);
  });

  // delete
  it("delete removes a file", async () => {
    await client.create("/to-delete.txt", "file");
    const removed = await client.remove("/to-delete.txt");
    expect(removed).toBe(true);
    const info = await client.stat("/to-delete.txt");
    expect(info).toBeNull();
  });

  it("delete returns false for non-existent", async () => {
    const removed = await client.remove("/nothing-here.txt");
    expect(removed).toBe(false);
  });
});
