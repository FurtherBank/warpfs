import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import type { ProviderNodeInfo } from "./provider-protocol.js";
import { VirtualFolder, VirtualFile, VirtualNode } from "./virtual-node.js";

/**
 * Creates an HTTP server that exposes a VirtualFolder tree via the WarpFS
 * provider protocol. This is how platform drivers (e.g. Notion) serve their
 * content as a standalone provider service.
 */
export function createProviderServer(rootFolder: VirtualFolder): Server {
  const handler = new ProviderHandler(rootFolder);
  return createServer((req, res) => {
    handler.handle(req, res).catch((err) => {
      console.error("[WarpFS Provider] Error:", err);
      res.writeHead(500);
      res.end("Internal Server Error");
    });
  });
}

class ProviderHandler {
  constructor(private root: VirtualFolder) {}

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const parsedUrl = new URL(req.url ?? "/", "http://localhost");
    const pathname = parsedUrl.pathname;
    const path = parsedUrl.searchParams.get("path") ?? "/";

    // CORS headers for local development
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    switch (pathname) {
      case "/stat":
        return this.handleStat(path, res);
      case "/list":
        return this.handleList(path, res);
      case "/read":
        return this.handleRead(path, res);
      case "/write":
        return this.handleWrite(path, req, res);
      case "/create":
        return this.handleCreate(path, parsedUrl.searchParams.get("type") ?? "file", res);
      case "/delete":
        return this.handleDelete(path, res);
      default:
        res.writeHead(404);
        res.end("Unknown endpoint");
    }
  }

  private async resolvePath(path: string): Promise<VirtualNode | null> {
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0) return this.root;

    let current: VirtualNode = this.root;
    for (const seg of segments) {
      if (!current.isFolder()) return null;
      const child = await (current as VirtualFolder).findChild(seg);
      if (!child) return null;
      current = child;
    }
    return current;
  }

  private async resolveParent(
    path: string,
  ): Promise<{ parent: VirtualFolder; childName: string } | null> {
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0) return null;

    const childName = segments.pop()!;
    let current: VirtualNode = this.root;

    for (const seg of segments) {
      if (!current.isFolder()) return null;
      const child = await (current as VirtualFolder).findChild(seg);
      if (!child) return null;
      current = child;
    }

    if (!current.isFolder()) return null;
    return { parent: current as VirtualFolder, childName };
  }

  private nodeToInfo(node: VirtualNode): ProviderNodeInfo {
    return {
      name: node.name,
      isFolder: node.isFolder(),
      size: node.getSize(),
      lastModified: node.lastModified,
    };
  }

  private async handleStat(path: string, res: ServerResponse): Promise<void> {
    const node = await this.resolvePath(path);
    if (!node) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(this.nodeToInfo(node)));
  }

  private async handleList(path: string, res: ServerResponse): Promise<void> {
    const node = await this.resolvePath(path);
    if (!node || !node.isFolder()) {
      res.writeHead(404);
      res.end();
      return;
    }
    const children = await (node as VirtualFolder).listChildren();
    const infos = children.map((c) => this.nodeToInfo(c));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(infos));
  }

  private async handleRead(path: string, res: ServerResponse): Promise<void> {
    const node = await this.resolvePath(path);
    if (!node || node.isFolder()) {
      res.writeHead(404);
      res.end();
      return;
    }
    const content = await (node as VirtualFile).read();
    res.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": content.length.toString(),
    });
    res.end(content);
  }

  private async handleWrite(
    path: string,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = await this.readBody(req);

    // Try to write to existing file
    const node = await this.resolvePath(path);
    if (node && !node.isFolder()) {
      await (node as VirtualFile).write(body);
      res.writeHead(204);
      res.end();
      return;
    }

    // Create new file and write
    const parentInfo = await this.resolveParent(path);
    if (!parentInfo) {
      res.writeHead(409);
      res.end();
      return;
    }
    const newFile = await parentInfo.parent.createChildFile(parentInfo.childName);
    await newFile.write(body);
    res.writeHead(201);
    res.end();
  }

  private async handleCreate(
    path: string,
    type: string,
    res: ServerResponse,
  ): Promise<void> {
    const parentInfo = await this.resolveParent(path);
    if (!parentInfo) {
      res.writeHead(409);
      res.end();
      return;
    }
    if (type === "folder") {
      await parentInfo.parent.createChildFolder(parentInfo.childName);
    } else {
      await parentInfo.parent.createChildFile(parentInfo.childName);
    }
    res.writeHead(201);
    res.end();
  }

  private async handleDelete(path: string, res: ServerResponse): Promise<void> {
    const parentInfo = await this.resolveParent(path);
    if (!parentInfo) {
      res.writeHead(404);
      res.end();
      return;
    }
    const removed = await parentInfo.parent.removeChild(parentInfo.childName);
    res.writeHead(removed ? 204 : 404);
    res.end();
  }

  private readBody(req: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }
}
