import { createServer, Server } from "node:http";
import { VirtualFolder } from "./virtual-node.js";
import { WebDAVHandler } from "./webdav-handler.js";

export interface WarpFSServerOptions {
  port?: number;
  host?: string;
  rootFolder: VirtualFolder;
  blockOsFiles?: boolean;
}

export class WarpFSServer {
  private server: Server;
  private handler: WebDAVHandler;
  readonly port: number;
  readonly host: string;

  constructor(options: WarpFSServerOptions) {
    this.port = options.port ?? 8080;
    this.host = options.host ?? "127.0.0.1";
    this.handler = new WebDAVHandler(options.rootFolder, options.blockOsFiles ?? true);

    this.server = createServer((req, res) => {
      this.handler.handle(req, res);
    });
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.on("error", reject);
      this.server.listen(this.port, this.host, () => {
        console.log(`[WarpFS] WebDAV server listening on http://${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  get address(): string {
    return `http://${this.host}:${this.port}`;
  }
}
