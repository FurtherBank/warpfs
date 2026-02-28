/**
 * Converts Notion blocks to Markdown text.
 * Supports the most common block types.
 */
export function blocksToMarkdown(blocks: any[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    const type = block.type;

    switch (type) {
      case "paragraph":
        lines.push(richTextToPlain(block.paragraph?.rich_text) + "\n");
        break;
      case "heading_1":
        lines.push("# " + richTextToPlain(block.heading_1?.rich_text) + "\n");
        break;
      case "heading_2":
        lines.push("## " + richTextToPlain(block.heading_2?.rich_text) + "\n");
        break;
      case "heading_3":
        lines.push("### " + richTextToPlain(block.heading_3?.rich_text) + "\n");
        break;
      case "bulleted_list_item":
        lines.push("- " + richTextToPlain(block.bulleted_list_item?.rich_text));
        break;
      case "numbered_list_item":
        lines.push("1. " + richTextToPlain(block.numbered_list_item?.rich_text));
        break;
      case "to_do": {
        const checked = block.to_do?.checked ? "x" : " ";
        lines.push(`- [${checked}] ` + richTextToPlain(block.to_do?.rich_text));
        break;
      }
      case "code":
        lines.push(
          "```" +
            (block.code?.language ?? "") +
            "\n" +
            richTextToPlain(block.code?.rich_text) +
            "\n```\n",
        );
        break;
      case "quote":
        lines.push("> " + richTextToPlain(block.quote?.rich_text) + "\n");
        break;
      case "divider":
        lines.push("---\n");
        break;
      default:
        lines.push(`<!-- unsupported block type: ${type} -->`);
    }
  }

  return lines.join("\n");
}

function richTextToPlain(richText: any[] | undefined): string {
  if (!richText) return "";
  return richText.map((rt: any) => rt.plain_text ?? "").join("");
}
