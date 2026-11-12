import { describe, expect, it } from "vitest";
import { getSubmissionUrlError, getWebsitePreviewSandbox, isDeploymentUrl, SHARED_LINK_REQUIRED_MESSAGE } from "./url";

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
    "https://notebooklm.google.com/notebook/example-id",
    " https://notebooklm.google.com/notebook/example-id?authuser=0 ",
    "https://example.com/NOTEBOOK/example",
    "http://example.com/notebook/example",
    "https://example.com/chat?redirect=/notebook/example",
    "https://example.com/chat#/notebook/example",
  ])("accepts /notebook/ anywhere in an HTTP(S) URL: %s", (url) => {
    expect(getSubmissionUrlError(url)).toBeNull();
  });

  it.each([
    "https://my-site.netlify.app/",
    "https://deploy-preview-42--my-site.netlify.app/path?x=1",
    "https://my-site.pages.dev/",
    "https://prompt-homework-aicrew.antae98.workers.dev/",
    "https://my-site.vercel.app/",
    "https://user.github.io/project/",
    "https://my-site.onrender.com/",
    " HTTPS://MY-SITE.NETLIFY.APP./path ",
  ])("accepts deployment URLs: %s", (url) => {
    expect(getSubmissionUrlError(url)).toBeNull();
    expect(isDeploymentUrl(url)).toBe(true);
  });

  it.each([
    "https://chatgpt.com/share/example",
    "https://my-site.netlify.app.example.com/",
    "https://my-site.netlify.app@evil.example/",
    "https://user:password@my-site.netlify.app/",
    "javascript:alert('netlify.app')",
    "/api/submissions/1/html",
  ])("does not embed unrelated or unsafe URLs: %s", (url) => {
    expect(isDeploymentUrl(url)).toBe(false);
  });

  it("isolates same-origin previews while allowing cross-origin sites to render", () => {
    const origin = "https://prompt-homework-aicrew.antae98.workers.dev";
    expect(getWebsitePreviewSandbox(`${origin}/`, origin)).toBe("allow-scripts");
    expect(getWebsitePreviewSandbox("https://my-site.vercel.app/", origin)).toBe("allow-scripts allow-same-origin");
  });

  it.each([
    "https://chatgpt.com/c/private-chat",
    "https://chatgpt.com/c/private-chat/../private-chat",
    "https://chatgpt.com/s/t_example",
    "https://netlify.app/",
    "https://my-site.netlify.app.example.com/",
    "https://notnetlify.app/",
    "https://my-site.netlify.app@evil.example/",
    "https://example.com/my-site.netlify.app",
    "https://notebooklm.google.com/",
    "https://example.com/notebook",
    "https://example.com/notebooks/example",
  ])("rejects links without share or /notebook/: %s", (url) => {
    expect(getSubmissionUrlError(url)).toBe(SHARED_LINK_REQUIRED_MESSAGE);
  });

  it.each(["not-a-url", "javascript:alert('/share/')", "ftp://example.com/share/x", "javascript:alert('/notebook/')", "ftp://example.com/notebook/x"])("rejects invalid URL schemes: %s", (url) => {
    expect(getSubmissionUrlError(url)).not.toBeNull();
  });
});
