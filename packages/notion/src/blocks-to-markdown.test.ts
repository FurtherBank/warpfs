import { describe, it, expect } from "vitest";
import { blocksToMarkdown } from "./blocks-to-markdown.js";

function makeBlock(type: string, richText: string, extra?: Record<string, any>) {
  const rt = [{ plain_text: richText }];
  const block: any = { type };
  block[type] = { rich_text: rt, ...extra };
  return block;
}

describe("blocksToMarkdown", () => {
  it("converts paragraph blocks", () => {
    const md = blocksToMarkdown([makeBlock("paragraph", "Hello world")]);
    expect(md).toContain("Hello world");
  });

  it("converts heading blocks", () => {
    const md = blocksToMarkdown([
      makeBlock("heading_1", "Title"),
      makeBlock("heading_2", "Subtitle"),
      makeBlock("heading_3", "Section"),
    ]);
    expect(md).toContain("# Title");
    expect(md).toContain("## Subtitle");
    expect(md).toContain("### Section");
  });

  it("converts list items", () => {
    const md = blocksToMarkdown([
      makeBlock("bulleted_list_item", "Bullet point"),
      makeBlock("numbered_list_item", "Numbered item"),
    ]);
    expect(md).toContain("- Bullet point");
    expect(md).toContain("1. Numbered item");
  });

  it("converts todo items", () => {
    const checked = { type: "to_do", to_do: { rich_text: [{ plain_text: "Done" }], checked: true } };
    const unchecked = { type: "to_do", to_do: { rich_text: [{ plain_text: "Todo" }], checked: false } };
    const md = blocksToMarkdown([checked, unchecked]);
    expect(md).toContain("- [x] Done");
    expect(md).toContain("- [ ] Todo");
  });

  it("converts code blocks", () => {
    const block = {
      type: "code",
      code: { rich_text: [{ plain_text: "console.log(1)" }], language: "javascript" },
    };
    const md = blocksToMarkdown([block]);
    expect(md).toContain("```javascript");
    expect(md).toContain("console.log(1)");
    expect(md).toContain("```");
  });

  it("converts quotes", () => {
    const md = blocksToMarkdown([makeBlock("quote", "Famous words")]);
    expect(md).toContain("> Famous words");
  });

  it("converts dividers", () => {
    const md = blocksToMarkdown([{ type: "divider", divider: {} }]);
    expect(md).toContain("---");
  });

  it("handles unsupported block types gracefully", () => {
    const md = blocksToMarkdown([{ type: "embed", embed: {} }]);
    expect(md).toContain("<!-- unsupported block type: embed -->");
  });

  it("handles empty blocks", () => {
    const md = blocksToMarkdown([]);
    expect(md).toBe("");
  });
});
