import { VirtualFolder, VirtualFile, VirtualNode } from "@warpfs/core";
import { createCachedFn } from "@warpfs/utils";
import { NotionAPI } from "./notion-api.js";
import { NotionPageFile } from "./notion-file.js";

/**
 * A virtual folder backed by a Notion database.
 * Each page in the database becomes a .md file.
 */
export class NotionDatabaseFolder extends VirtualFolder {
  private api: NotionAPI;
  private databaseId: string;
  private cachedList: () => Promise<VirtualNode[]>;

  constructor(name: string, databaseId: string, api: NotionAPI) {
    super(name);
    this.api = api;
    this.databaseId = databaseId;

    this.cachedList = createCachedFn(() => this.fetchChildren(), { ttl: 10000 });
  }

  async listChildren(): Promise<VirtualNode[]> {
    return this.cachedList();
  }

  private async fetchChildren(): Promise<VirtualNode[]> {
    const pages = await this.api.queryDatabase(this.databaseId);
    return pages.map(
      (page) => new NotionPageFile(`${page.title}.md`, page.id, this.api),
    );
  }

  async createChildFile(_name: string): Promise<VirtualFile> {
    throw new Error("Creating Notion pages via file system not yet implemented");
  }

  async createChildFolder(_name: string): Promise<VirtualFolder> {
    throw new Error("Creating sub-databases not supported");
  }

  async removeChild(_name: string): Promise<boolean> {
    throw new Error("Deleting Notion pages via file system not yet implemented");
  }
}
