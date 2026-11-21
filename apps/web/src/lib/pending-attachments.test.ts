import { describe, expect, it, vi } from "vitest";
import { isFileDrag, isFilePaste, revokePendingAttachmentPreviews } from "./pending-attachments.js";

function fileList(length: number) {
  return { length } as unknown as FileList;
}

function pasteData(files: number, itemKinds: string[] = []) {
  return {
    files: fileList(files),
    items: itemKinds.map((kind) => ({ kind })),
  } as unknown as DataTransfer;
}

function dragData(types: string[], itemKinds: string[] = []) {
  return {
    types,
    items: itemKinds.map((kind) => ({ kind })),
  } as unknown as DataTransfer;
}

describe("isFileDrag", () => {
  it("recognizes dragged files by type or item kind", () => {
    expect(isFileDrag(dragData(["Files"]))).toBe(true);
    expect(isFileDrag(dragData([], ["file"]))).toBe(true);
    expect(isFileDrag(dragData(["text/plain"], ["string"]))).toBe(false);
    expect(isFileDrag(null)).toBe(false);
  });
});

describe("isFilePaste", () => {
  it("recognizes pasted files and ignores text-only pastes", () => {
    expect(isFilePaste(pasteData(1))).toBe(true);
    expect(isFilePaste(pasteData(0, ["file"]))).toBe(false);
    expect(isFilePaste(pasteData(0, ["string"]))).toBe(false);
    expect(isFilePaste(null)).toBe(false);
  });
});

describe("revokePendingAttachmentPreviews", () => {
  it("revokes each preview URL and skips entries without one", () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    revokePendingAttachmentPreviews([{ previewUrl: "blob:a" }, {}, { previewUrl: "blob:b" }]);
    expect(revoke).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenCalledWith("blob:a");
    expect(revoke).toHaveBeenCalledWith("blob:b");
    revoke.mockRestore();
  });
});
