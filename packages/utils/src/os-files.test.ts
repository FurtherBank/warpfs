import { describe, it, expect } from "vitest";
import { isBlockedOsFile } from "./os-files.js";

describe("isBlockedOsFile", () => {
  it("blocks .DS_Store", () => {
    expect(isBlockedOsFile(".DS_Store")).toBe(true);
  });

  it("blocks ._ prefixed resource forks", () => {
    expect(isBlockedOsFile("._myfile.txt")).toBe(true);
  });

  it("blocks Thumbs.db", () => {
    expect(isBlockedOsFile("Thumbs.db")).toBe(true);
  });

  it("allows normal files", () => {
    expect(isBlockedOsFile("readme.md")).toBe(false);
    expect(isBlockedOsFile("notes.txt")).toBe(false);
    expect(isBlockedOsFile("image.png")).toBe(false);
  });
});
