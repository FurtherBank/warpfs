import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { WarpFSServer } from "./server.js";
import { MemoryFolder, MemoryFile } from "./memory-nodes.js";

describe("WarpFSServer (WebDAV integration)", () => {
  let server: WarpFSServer;
  let baseUrl: string;

  beforeAll(async () => {
    const root = new MemoryFolder("WarpFS");
    root.addChild(new MemoryFile("hello.txt", "Hello WarpFS!"));
    root.addChild(new MemoryFile("readme.md", "# WarpFS\nVirtual file system."));

    const sub = new MemoryFolder("notes");
    sub.addChild(new MemoryFile("note1.md", "Note 1 content"));
    root.addChild(sub);

    server = new WarpFSServer({
      port: 0,
      rootFolder: root,
      blockOsFiles: true,
    });

    await new Promise<void>((resolve, reject) => {
      const s = (server as any).server;
      s.on("error", reject);
      s.listen(0, "127.0.0.1", () => {
        const addr = s.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        console.log(`Test server on ${baseUrl}`);
        resolve();
      });
    });
  });

  afterAll(async () => {
    await server.stop();
  });

  it("OPTIONS returns DAV headers", async () => {
    const res = await fetch(`${baseUrl}/`, { method: "OPTIONS" });
    expect(res.status).toBe(200);
    expect(res.headers.get("dav")).toContain("1");
  });

  it("PROPFIND on root lists files", async () => {
    const res = await fetch(`${baseUrl}/`, {
      method: "PROPFIND",
      headers: { Depth: "1" },
    });
    expect(res.status).toBe(207);
    const body = await res.text();
    expect(body).toContain("hello.txt");
    expect(body).toContain("readme.md");
    expect(body).toContain("notes");
  });

  it("GET reads file content", async () => {
    const res = await fetch(`${baseUrl}/hello.txt`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("Hello WarpFS!");
  });

  it("GET reads nested file", async () => {
    const res = await fetch(`${baseUrl}/notes/note1.md`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("Note 1 content");
  });

  it("PUT creates a new file", async () => {
    const res = await fetch(`${baseUrl}/new-file.txt`, {
      method: "PUT",
      body: "Created via PUT",
    });
    expect(res.status).toBe(201);

    const readRes = await fetch(`${baseUrl}/new-file.txt`);
    expect(await readRes.text()).toBe("Created via PUT");
  });

  it("PUT updates existing file", async () => {
    await fetch(`${baseUrl}/hello.txt`, {
      method: "PUT",
      body: "Updated content",
    });

    const res = await fetch(`${baseUrl}/hello.txt`);
    expect(await res.text()).toBe("Updated content");
  });

  it("DELETE removes a file", async () => {
    await fetch(`${baseUrl}/new-file.txt`, { method: "DELETE" });

    const res = await fetch(`${baseUrl}/new-file.txt`);
    expect(res.status).toBe(404);
  });

  it("MKCOL creates a folder", async () => {
    const res = await fetch(`${baseUrl}/new-folder`, { method: "MKCOL" });
    expect(res.status).toBe(201);

    const propfind = await fetch(`${baseUrl}/`, {
      method: "PROPFIND",
      headers: { Depth: "1" },
    });
    const body = await propfind.text();
    expect(body).toContain("new-folder");
  });

  it("blocks .DS_Store silently", async () => {
    const putRes = await fetch(`${baseUrl}/.DS_Store`, {
      method: "PUT",
      body: "junk",
    });
    expect(putRes.status).toBe(200);

    const getRes = await fetch(`${baseUrl}/.DS_Store`);
    expect(getRes.status).toBe(404);
  });

  it("HEAD returns headers without body", async () => {
    const res = await fetch(`${baseUrl}/readme.md`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
  });

  it("LOCK returns lock token", async () => {
    const res = await fetch(`${baseUrl}/readme.md`, { method: "LOCK" });
    expect(res.status).toBe(200);
    expect(res.headers.get("lock-token")).toBeTruthy();
  });

  it("UNLOCK returns 204", async () => {
    const res = await fetch(`${baseUrl}/readme.md`, { method: "UNLOCK" });
    expect(res.status).toBe(204);
  });

  it("returns 404 for non-existent paths", async () => {
    const res = await fetch(`${baseUrl}/does-not-exist.txt`);
    expect(res.status).toBe(404);
  });
});
