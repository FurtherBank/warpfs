import { VirtualFile } from "@warpfs/core";
import { createCachedFn, createDebouncedWrite, markdownDiff, type DebounceHandle } from "@warpfs/utils";
import { NotionAPI } from "./notion-api.js";
import { blocksToMarkdown } from "./blocks-to-markdown.js";

/**
 * A virtual file backed by a Notion page.
 * Reads convert Notion blocks → Markdown; writes diff and patch back.
 */
export class NotionPageFile extends VirtualFile {
  private notionId: string;
  private api: NotionAPI;
  private currentContent: string = "";
  private cachedRead: () => Promise<Buffer>;
  private debounceHandle: DebounceHandle<Buffer>;

  constructor(name: string, notionId: string, api: NotionAPI) {
    super(name);
    this.notionId = notionId;
    this.api = api;

    this.cachedRead = createCachedFn(() => this.fetchContent(), { ttl: 5000 });

    this.debounceHandle = createDebouncedWrite(
      (buf: Buffer) => this.doWrite(buf),
      2000,
    );
  }

  getSize(): number {
    return Buffer.byteLength(this.currentContent);
  }

  async read(): Promise<Buffer> {
    return this.cachedRead();
  }

  async write(content: Buffer): Promise<void> {
    return this.debounceHandle.push(content);
  }

  private async fetchContent(): Promise<Buffer> {
    const blocks = await this.api.getPageBlocks(this.notionId);
    const md = blocksToMarkdown(blocks);
    this.currentContent = md;
    return Buffer.from(md, "utf-8");
  }

  private async doWrite(newContentBuffer: Buffer): Promise<void> {
    const newContent = newContentBuffer.toString("utf-8");

    const patchOps = markdownDiff(this.currentContent, newContent);

    if (patchOps.length > 0) {
      console.log(
        `[WarpFS/Notion] Applying ${patchOps.length} patch ops to page: ${this.name}`,
      );
      this.currentContent = newContent;
      this.lastModified = Date.now();
    }
  }
}
