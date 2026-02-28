import { Client } from "@notionhq/client";

export interface NotionPageInfo {
  id: string;
  title: string;
  lastEditedTime: string;
}

/**
 * Thin wrapper over the official Notion client.
 * Encapsulates API calls so they can be easily mocked in tests.
 */
export class NotionAPI {
  private client: Client;

  constructor(apiKey: string) {
    this.client = new Client({ auth: apiKey });
  }

  async queryDatabase(databaseId: string): Promise<NotionPageInfo[]> {
    const response = await this.client.databases.query({
      database_id: databaseId,
    });

    return response.results.map((page: any) => {
      const titleProp = Object.values(page.properties).find(
        (p: any) => p.type === "title",
      ) as any;

      const title =
        titleProp?.title?.[0]?.plain_text ?? `Untitled-${page.id.slice(0, 8)}`;

      return {
        id: page.id,
        title,
        lastEditedTime: page.last_edited_time,
      };
    });
  }

  async getPageBlocks(pageId: string): Promise<any[]> {
    const response = await this.client.blocks.children.list({
      block_id: pageId,
      page_size: 100,
    });
    return response.results;
  }

  async updateBlock(blockId: string, content: any): Promise<void> {
    await this.client.blocks.update({
      block_id: blockId,
      ...content,
    });
  }

  async appendBlocks(pageId: string, children: any[]): Promise<void> {
    await this.client.blocks.children.append({
      block_id: pageId,
      children,
    });
  }

  async deleteBlock(blockId: string): Promise<void> {
    await this.client.blocks.update({
      block_id: blockId,
      archived: true,
    });
  }
}
