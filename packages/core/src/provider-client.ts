import type { ProviderNodeInfo } from "./provider-protocol.js";

/**
 * HTTP client that communicates with a WarpFS provider service.
 * Implements the provider protocol by calling the provider's REST endpoints.
 */
export class ProviderClient {
  private origin: string;

  constructor(origin: string) {
    // Strip trailing slash
    this.origin = origin.replace(/\/+$/, "");
  }

  /** Get info about a single node. */
  async stat(path: string): Promise<ProviderNodeInfo | null> {
    const url = `${this.origin}/stat?path=${encodeURIComponent(path)}`;
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Provider stat failed: ${res.status}`);
    return (await res.json()) as ProviderNodeInfo;
  }

  /** List children of a folder. */
  async list(path: string): Promise<ProviderNodeInfo[]> {
    const url = `${this.origin}/list?path=${encodeURIComponent(path)}`;
    const res = await fetch(url);
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`Provider list failed: ${res.status}`);
    return (await res.json()) as ProviderNodeInfo[];
  }

  /** Read file content. */
  async read(path: string): Promise<Buffer> {
    const url = `${this.origin}/read?path=${encodeURIComponent(path)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Provider read failed: ${res.status}`);
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  /** Write file content. */
  async write(path: string, content: Buffer): Promise<void> {
    const url = `${this.origin}/write?path=${encodeURIComponent(path)}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: content,
    });
    if (!res.ok) throw new Error(`Provider write failed: ${res.status}`);
  }

  /** Create a file or folder. Returns true if created. */
  async create(path: string, type: "file" | "folder"): Promise<boolean> {
    const url = `${this.origin}/create?path=${encodeURIComponent(path)}&type=${type}`;
    const res = await fetch(url, { method: "POST" });
    return res.ok;
  }

  /** Delete a node. Returns true if deleted. */
  async remove(path: string): Promise<boolean> {
    const url = `${this.origin}/delete?path=${encodeURIComponent(path)}`;
    const res = await fetch(url, { method: "DELETE" });
    return res.ok;
  }
}
