import { createProviderServer } from "@warpfs/core";
import { NotionAPI } from "./notion-api.js";
import { NotionDatabaseFolder } from "./notion-folder.js";

export interface NotionProviderOptions {
  /** Notion API key. Defaults to NOTION_API_KEY env var. */
  apiKey?: string;
  /** Notion database ID to serve. */
  databaseId: string;
  /** Display name for the root folder. */
  name?: string;
  /** Port to listen on. Defaults to 3001. */
  port?: number;
  /** Host to bind to. Defaults to 127.0.0.1. */
  host?: string;
}

/**
 * Starts the Notion provider as a standalone HTTP service
 * implementing the WarpFS provider protocol.
 */
export async function startNotionProvider(options: NotionProviderOptions): Promise<void> {
  const apiKey = options.apiKey ?? process.env.NOTION_API_KEY;
  if (!apiKey) {
    throw new Error("NOTION_API_KEY is required (env var or apiKey option)");
  }

  const port = options.port ?? 3001;
  const host = options.host ?? "127.0.0.1";
  const name = options.name ?? "Notion";

  const api = new NotionAPI(apiKey);
  const rootFolder = new NotionDatabaseFolder(name, options.databaseId, api);
  const server = createProviderServer(rootFolder);

  return new Promise((resolve, reject) => {
    const onError = (err: Error) => reject(err);
    server.on("error", onError);
    server.listen(port, host, () => {
      server.removeListener("error", onError);
      console.log(`[WarpFS/Notion] Provider listening on http://${host}:${port}`);
      resolve();
    });
  });
}
