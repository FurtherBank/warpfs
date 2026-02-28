import { describe, it, expect, afterAll } from "vitest";
import { WarpFSServer, MemoryFolder, MemoryFile } from "@warpfs/core";

describe("CLI: start command integration", () => {
  let server: WarpFSServer;
  let baseUrl: string;

  it("starts server and serves virtual files", async () => {
    const root = new MemoryFolder("WarpFS");
    root.addChild(new MemoryFile("welcome.md", "# Welcome to WarpFS\n"));

    server = new WarpFSServer({ port: 0, rootFolder: root, blockOsFiles: true });

    await new Promise<void>((resolve, reject) => {
      const s = (server as any).server;
      s.on("error", reject);
      s.listen(0, "127.0.0.1", () => {
        const addr = s.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    const res = await fetch(`${baseUrl}/welcome.md`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Welcome to WarpFS");
  });

  it("serves directory listing for root", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("welcome.md");
  });

  it("supports WebDAV PROPFIND", async () => {
    const res = await fetch(`${baseUrl}/`, {
      method: "PROPFIND",
      headers: { Depth: "1" },
    });
    expect(res.status).toBe(207);
    const xml = await res.text();
    expect(xml).toContain("welcome.md");
  });

  afterAll(async () => {
    if (server) await server.stop();
  });
});
