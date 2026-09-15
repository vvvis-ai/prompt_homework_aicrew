import { describe, expect, it } from "vitest";
import { getSubmissionUrlError, SHARED_LINK_REQUIRED_MESSAGE } from "./url";

describe("submission share link requirement", () => {
  it.each([
    "https://chatgpt.com/share/conversation-id",
    "https://chatgpt.com/share/conversation-id?ogimg=plain",
    " https://gemini.google.com/share/example ",
    "https://claude.ai/share/example",
    "https://share.gemini.google/example",
    "https://example.com/shared/example",
    "https://example.com/SHARE/example",
    "https://chatgpt.com/c/private-chat?redirect=/share/example",
    "https://chatgpt.com/c/private-chat#/share/example",
    "https://chatgpt.com/share/../c/private-chat",
  ])("accepts share anywhere in the URL: %s", (url) => {
    expect(getSubmissionUrlError(url)).toBeNull();
  });

  it.each([
    "https://chatgpt.com/c/private-chat",
    "https://chatgpt.com/c/private-chat/../private-chat",
    "https://chatgpt.com/s/t_example",
    "https://prompt-homework-aicrew.antae98.workers.dev/",
  ])("rejects links without share: %s", (url) => {
    expect(getSubmissionUrlError(url)).toBe(SHARED_LINK_REQUIRED_MESSAGE);
  });

  it.each(["not-a-url", "javascript:alert('/share/')", "ftp://example.com/share/x"])("rejects invalid URL schemes: %s", (url) => {
    expect(getSubmissionUrlError(url)).not.toBeNull();
  });
});
