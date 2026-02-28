import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotionPageFile } from "./notion-file.js";
import { NotionAPI } from "./notion-api.js";

vi.mock("./notion-api.js");

describe("NotionPageFile", () => {
  let mockApi: any;

  beforeEach(() => {
    mockApi = {
      getPageBlocks: vi.fn().mockResolvedValue([
        {
          type: "heading_1",
          heading_1: { rich_text: [{ plain_text: "Test Page" }] },
        },
        {
          type: "paragraph",
          paragraph: { rich_text: [{ plain_text: "Some content here." }] },
        },
      ]),
      updateBlock: vi.fn().mockResolvedValue(undefined),
      appendBlocks: vi.fn().mockResolvedValue(undefined),
      deleteBlock: vi.fn().mockResolvedValue(undefined),
    } satisfies Partial<NotionAPI>;
  });

  it("reads page content as markdown", async () => {
    const file = new NotionPageFile("test.md", "page-123", mockApi as NotionAPI);
    const content = await file.read();
    const text = content.toString("utf-8");

    expect(text).toContain("# Test Page");
    expect(text).toContain("Some content here.");
    expect(mockApi.getPageBlocks).toHaveBeenCalledWith("page-123");
  });

  it("caches reads within TTL", async () => {
    const file = new NotionPageFile("test.md", "page-123", mockApi as NotionAPI);

    await file.read();
    await file.read();
    await file.read();

    expect(mockApi.getPageBlocks).toHaveBeenCalledTimes(1);
  });

  it("reports size based on content", async () => {
    const file = new NotionPageFile("test.md", "page-123", mockApi as NotionAPI);
    expect(file.getSize()).toBe(0);

    await file.read();
    expect(file.getSize()).toBeGreaterThan(0);
  });

  it("write triggers debounced update", async () => {
    const file = new NotionPageFile("test.md", "page-123", mockApi as NotionAPI);
    await file.read();

    file.write(Buffer.from("# Updated\nNew content."));

    await new Promise((r) => setTimeout(r, 2500));
  });
});
