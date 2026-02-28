import { IncomingMessage, ServerResponse } from "node:http";
import * as mime from "mime-types";
import { isBlockedOsFile } from "@warpfs/utils";
import { VirtualNode, VirtualFolder, VirtualFile } from "./virtual-node.js";

/**
 * Pure HTTP handler implementing WebDAV subset:
 * OPTIONS, PROPFIND, GET, PUT, DELETE, MKCOL
 *
 * This avoids heavy dependencies and gives full control over the protocol.
 */
export class WebDAVHandler {
  constructor(
    private root: VirtualFolder,
    private blockOsFiles: boolean = true,
  ) {}

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method?.toUpperCase() ?? "GET";
    const urlPath = decodeURIComponent(req.url ?? "/");

    if (this.blockOsFiles) {
      const basename = urlPath.split("/").pop() ?? "";
      if (isBlockedOsFile(basename)) {
        if (method === "GET" || method === "PROPFIND") {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200);
        res.end();
        return;
      }
    }

    try {
      switch (method) {
        case "OPTIONS":
          return this.handleOptions(res);
        case "PROPFIND":
          return await this.handlePropfind(urlPath, req, res);
        case "GET":
          return await this.handleGet(urlPath, res);
        case "PUT":
          return await this.handlePut(urlPath, req, res);
        case "DELETE":
          return await this.handleDelete(urlPath, res);
        case "MKCOL":
          return await this.handleMkcol(urlPath, res);
        case "HEAD":
          return await this.handleHead(urlPath, res);
        case "LOCK":
          return this.handleLock(urlPath, res);
        case "UNLOCK":
          return this.handleUnlock(res);
        default:
          res.writeHead(405);
          res.end();
      }
    } catch (err) {
      console.error(`[WarpFS] Error handling ${method} ${urlPath}:`, err);
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  }

  private handleOptions(res: ServerResponse): void {
    res.writeHead(200, {
      Allow: "OPTIONS, PROPFIND, GET, PUT, DELETE, MKCOL, HEAD, LOCK, UNLOCK",
      DAV: "1, 2",
      "MS-Author-Via": "DAV",
    });
    res.end();
  }

  private async resolvePath(
    urlPath: string,
  ): Promise<{ node: VirtualNode; parent: VirtualFolder } | null> {
    const segments = urlPath.split("/").filter(Boolean);
    if (segments.length === 0) {
      return { node: this.root, parent: this.root };
    }

    let current: VirtualNode = this.root;
    let parent: VirtualFolder = this.root;

    for (const seg of segments) {
      if (!current.isFolder()) return null;
      parent = current as VirtualFolder;
      const child = await (current as VirtualFolder).findChild(seg);
      if (!child) return null;
      current = child;
    }

    return { node: current, parent };
  }

  private async resolveParent(
    urlPath: string,
  ): Promise<{ parent: VirtualFolder; childName: string } | null> {
    const segments = urlPath.split("/").filter(Boolean);
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

  private async handlePropfind(
    urlPath: string,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const result = await this.resolvePath(urlPath);
    if (!result) {
      res.writeHead(404);
      res.end();
      return;
    }

    const depth = req.headers["depth"] ?? "1";
    const { node } = result;
    const entries: Array<{ href: string; node: VirtualNode }> = [];

    const href = urlPath.endsWith("/") ? urlPath : urlPath + "/";
    entries.push({ href: urlPath || "/", node });

    if (node.isFolder() && depth !== "0") {
      const children = await (node as VirtualFolder).listChildren();
      for (const child of children) {
        const childHref = `${href}${encodeURIComponent(child.name)}`;
        entries.push({ href: childHref, node: child });
      }
    }

    const xml = this.buildMultistatus(entries);
    res.writeHead(207, {
      "Content-Type": "application/xml; charset=utf-8",
    });
    res.end(xml);
  }

  private buildMultistatus(entries: Array<{ href: string; node: VirtualNode }>): string {
    const responses = entries.map(({ href, node }) => {
      const lastMod = new Date(node.lastModified).toUTCString();
      const isDir = node.isFolder();
      const contentType = isDir
        ? "httpd/unix-directory"
        : (mime.lookup(node.name) || "application/octet-stream");

      return `<D:response>
  <D:href>${this.escapeXml(href)}</D:href>
  <D:propstat>
    <D:prop>
      <D:displayname>${this.escapeXml(node.name)}</D:displayname>
      <D:getlastmodified>${lastMod}</D:getlastmodified>
      <D:getcontentlength>${node.getSize()}</D:getcontentlength>
      <D:getcontenttype>${contentType}</D:getcontenttype>
      ${isDir ? "<D:resourcetype><D:collection/></D:resourcetype>" : "<D:resourcetype/>"}
    </D:prop>
    <D:status>HTTP/1.1 200 OK</D:status>
  </D:propstat>
</D:response>`;
    });

    return `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
${responses.join("\n")}
</D:multistatus>`;
  }

  private async handleGet(urlPath: string, res: ServerResponse): Promise<void> {
    const result = await this.resolvePath(urlPath);
    if (!result) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    const { node } = result;
    if (node.isFolder()) {
      res.writeHead(200, { "Content-Type": "text/html" });
      const folder = node as VirtualFolder;
      const children = await folder.listChildren();
      const links = children
        .map((c) => {
          const href = `${urlPath}/${encodeURIComponent(c.name)}`;
          const suffix = c.isFolder() ? "/" : "";
          return `<li><a href="${href}">${c.name}${suffix}</a></li>`;
        })
        .join("\n");
      res.end(`<html><body><h1>${node.name}</h1><ul>${links}</ul></body></html>`);
      return;
    }

    const file = node as VirtualFile;
    const content = await file.read();
    const contentType = mime.lookup(node.name) || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": content.length.toString(),
      "Last-Modified": new Date(node.lastModified).toUTCString(),
    });
    res.end(content);
  }

  private async handleHead(urlPath: string, res: ServerResponse): Promise<void> {
    const result = await this.resolvePath(urlPath);
    if (!result) {
      res.writeHead(404);
      res.end();
      return;
    }
    const { node } = result;
    const contentType = node.isFolder()
      ? "httpd/unix-directory"
      : (mime.lookup(node.name) || "application/octet-stream");
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": node.getSize().toString(),
    });
    res.end();
  }

  private async handlePut(
    urlPath: string,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const body = await this.readBody(req);

    const existing = await this.resolvePath(urlPath);
    if (existing && !existing.node.isFolder()) {
      await (existing.node as VirtualFile).write(body);
      res.writeHead(204);
      res.end();
      return;
    }

    const parentInfo = await this.resolveParent(urlPath);
    if (!parentInfo) {
      res.writeHead(409);
      res.end("Conflict: parent folder does not exist");
      return;
    }

    const newFile = await parentInfo.parent.createChildFile(parentInfo.childName);
    await newFile.write(body);
    res.writeHead(201);
    res.end();
  }

  private async handleDelete(urlPath: string, res: ServerResponse): Promise<void> {
    const parentInfo = await this.resolveParent(urlPath);
    if (!parentInfo) {
      res.writeHead(404);
      res.end();
      return;
    }

    const removed = await parentInfo.parent.removeChild(parentInfo.childName);
    res.writeHead(removed ? 204 : 404);
    res.end();
  }

  private async handleMkcol(urlPath: string, res: ServerResponse): Promise<void> {
    const parentInfo = await this.resolveParent(urlPath);
    if (!parentInfo) {
      res.writeHead(409);
      res.end();
      return;
    }

    await parentInfo.parent.createChildFolder(parentInfo.childName);
    res.writeHead(201);
    res.end();
  }

  private handleLock(urlPath: string, res: ServerResponse): void {
    const token = `opaquelocktoken:${Date.now()}`;
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:prop xmlns:D="DAV:">
  <D:lockdiscovery>
    <D:activelock>
      <D:locktype><D:write/></D:locktype>
      <D:lockscope><D:exclusive/></D:lockscope>
      <D:depth>infinity</D:depth>
      <D:timeout>Second-3600</D:timeout>
      <D:locktoken><D:href>${token}</D:href></D:locktoken>
      <D:lockroot><D:href>${this.escapeXml(urlPath)}</D:href></D:lockroot>
    </D:activelock>
  </D:lockdiscovery>
</D:prop>`;
    res.writeHead(200, {
      "Content-Type": "application/xml; charset=utf-8",
      "Lock-Token": `<${token}>`,
    });
    res.end(xml);
  }

  private handleUnlock(res: ServerResponse): void {
    res.writeHead(204);
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

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
