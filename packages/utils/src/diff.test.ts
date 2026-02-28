import { describe, it, expect } from "vitest";
import { computeLineDiff, markdownDiff, isContentEqual } from "./diff.js";

describe("computeLineDiff", () => {
  it("returns empty array for identical content", () => {
    const ops = computeLineDiff("hello\nworld", "hello\nworld");
    expect(ops).toEqual([]);
  });

  it("detects added lines", () => {
    const ops = computeLineDiff("line1\nline2", "line1\nline2\nline3");
    const adds = ops.filter((o) => o.type === "add");
    expect(adds.length).toBeGreaterThan(0);
    expect(adds.some((a) => a.newValue === "line3")).toBe(true);
  });

  it("detects removed lines", () => {
    const ops = computeLineDiff("line1\nline2\nline3", "line1\nline3");
    const removes = ops.filter((o) => o.type === "remove");
    expect(removes.length).toBeGreaterThan(0);
    expect(removes.some((r) => r.oldValue === "line2")).toBe(true);
  });

  it("handles complete replacement", () => {
    const ops = computeLineDiff("old content", "new content");
    expect(ops.length).toBeGreaterThan(0);
  });
});

describe("markdownDiff", () => {
  it("returns empty for identical markdown", () => {
    const md = "# Title\n\nParagraph text.";
    expect(markdownDiff(md, md)).toEqual([]);
  });

  it("detects heading change", () => {
    const old = "# Old Title\n\nBody.";
    const newMd = "# New Title\n\nBody.";
    const ops = markdownDiff(old, newMd);
    expect(ops.length).toBeGreaterThan(0);
  });
});

describe("isContentEqual", () => {
  it("treats trailing whitespace as equal", () => {
    expect(isContentEqual("hello\n", "hello")).toBe(true);
    expect(isContentEqual("hello  \n", "hello")).toBe(true);
  });

  it("detects real differences", () => {
    expect(isContentEqual("hello", "world")).toBe(false);
  });
});
