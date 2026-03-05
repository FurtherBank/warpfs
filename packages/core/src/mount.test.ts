import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Server } from "node:http";
import { MemoryFolder, MemoryFile } from "./memory-nodes.js";
import { WarpFSServer } from "./server.js";
import { createProviderServer } from "./provider-server.js";

describe("Mount-based WarpFSServer", () => {
  let providerServer: Server;
  let warpfsServer: WarpFSServer;
  let providerPort: number;
  let baseUrl: string;

  beforeAll(async () => {
    // Start a provider service (in-memory)
    const providerRoot = new MemoryFolder("MockProvider");
    providerRoot.addChild(new MemoryFile("page1.md", "# Page 1\nHello from provider."));
    providerRoot.addChild(new MemoryFile("page2.md", "# Page 2\nAnother page."));

    const sub = new MemoryFolder("drafts");
    sub.addChild(new MemoryFile("draft1.md", "Draft content"));
    providerRoot.addChild(sub);

    providerServer = createProviderServer(providerRoot);

    await new Promise<void>((resolve, reject) => {
      providerServer.on("error", reject);
      providerServer.listen(0, "127.0.0.1", () => {
        const addr = providerServer.address() as { port: number };
        providerPort = addr.port;
        resolve();
      });
    });

    // Start WarpFS server with mount config pointing to the provider
    warpfsServer = new WarpFSServer({
      port: 0,
      mounts: [{ name: "docs", origin: `http://127.0.0.1:${providerPort}` }],
      blockOsFiles: true,
    });

    await new Promise<void>((resolve, reject) => {
      const s = (warpfsServer as any).server;
      s.on("error", reject);
      s.listen(0, "127.0.0.1", () => {
        const addr = s.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await warpfsServer.stop();
    await new Promise<void>((resolve, reject) => {
      providerServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("PROPFIND on root lists mounted directories", async () => {
    const res = await fetch(`${baseUrl}/`, {
      method: "PROPFIND",
      headers: { Depth: "1" },
    });
    expect(res.status).toBe(207);
    const body = await res.text();
    expect(body).toContain("docs");
  });

  it("PROPFIND on mount lists provider files", async () => {
    const res = await fetch(`${baseUrl}/docs/`, {
      method: "PROPFIND",
      headers: { Depth: "1" },
    });
    expect(res.status).toBe(207);
    const body = await res.text();
    expect(body).toContain("page1.md");
    expect(body).toContain("page2.md");
    expect(body).toContain("drafts");
  });

  it("GET reads file from provider via mount", async () => {
    const res = await fetch(`${baseUrl}/docs/page1.md`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("# Page 1\nHello from provider.");
  });

  it("GET reads nested file from provider", async () => {
    const res = await fetch(`${baseUrl}/docs/drafts/draft1.md`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("Draft content");
  });

  it("PUT writes file via provider mount", async () => {
    const putRes = await fetch(`${baseUrl}/docs/page1.md`, {
      method: "PUT",
      body: "Updated via mount",
    });
    expect(putRes.status).toBe(204);

    const getRes = await fetch(`${baseUrl}/docs/page1.md`);
    expect(await getRes.text()).toBe("Updated via mount");
  });

  it("PUT creates new file via provider mount", async () => {
    const putRes = await fetch(`${baseUrl}/docs/new-doc.md`, {
      method: "PUT",
      body: "New document",
    });
    expect(putRes.status).toBe(201);

    const getRes = await fetch(`${baseUrl}/docs/new-doc.md`);
    expect(await getRes.text()).toBe("New document");
  });

  it("DELETE removes file via provider mount", async () => {
    // Create a file first
    await fetch(`${baseUrl}/docs/to-delete.md`, {
      method: "PUT",
      body: "temp",
    });
    const delRes = await fetch(`${baseUrl}/docs/to-delete.md`, {
      method: "DELETE",
    });
    expect(delRes.status).toBe(204);

    const getRes = await fetch(`${baseUrl}/docs/to-delete.md`);
    expect(getRes.status).toBe(404);
  });

  it("MKCOL creates folder via provider mount", async () => {
    const mkRes = await fetch(`${baseUrl}/docs/new-folder`, {
      method: "MKCOL",
    });
    expect(mkRes.status).toBe(201);

    const propRes = await fetch(`${baseUrl}/docs/`, {
      method: "PROPFIND",
      headers: { Depth: "1" },
    });
    const body = await propRes.text();
    expect(body).toContain("new-folder");
  });

  it("returns 404 for non-existent mount", async () => {
    const res = await fetch(`${baseUrl}/nonexistent/file.txt`);
    expect(res.status).toBe(404);
  });
});
