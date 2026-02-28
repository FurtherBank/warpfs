import * as Diff from "diff";

export interface PatchOp {
  type: "add" | "remove" | "modify";
  /** 0-based line index in the original content */
  lineIndex: number;
  oldValue?: string;
  newValue?: string;
}

/**
 * Computes a line-level diff between old and new text content.
 * Returns a list of patch operations that can be translated to
 * platform-specific API calls (e.g. Notion Block updates).
 */
export function computeLineDiff(oldText: string, newText: string): PatchOp[] {
  const changes = Diff.diffLines(oldText, newText);
  const ops: PatchOp[] = [];
  let lineIndex = 0;

  for (const change of changes) {
    const lines = (change.value.endsWith("\n") ? change.value.slice(0, -1) : change.value).split(
      "\n",
    );

    if (change.removed) {
      for (const line of lines) {
        ops.push({ type: "remove", lineIndex, oldValue: line });
        lineIndex++;
      }
    } else if (change.added) {
      for (const line of lines) {
        ops.push({ type: "add", lineIndex, newValue: line });
      }
    } else {
      lineIndex += lines.length;
    }
  }

  return ops;
}

/**
 * Computes a structured Markdown diff suitable for block-based APIs.
 * Groups consecutive line changes into block-level operations.
 */
export function markdownDiff(oldMd: string, newMd: string): PatchOp[] {
  if (oldMd === newMd) return [];
  return computeLineDiff(oldMd, newMd);
}

/**
 * Returns true if two text contents are semantically identical
 * (ignoring trailing whitespace differences).
 */
export function isContentEqual(a: string, b: string): boolean {
  return a.trimEnd() === b.trimEnd();
}
