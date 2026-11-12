import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Submission } from "@/lib/types";
import { WebsiteSubmissionPreview } from "./website-submission-preview";

const submission: Submission = {
  id: "1", participantId: "1", participantName: "참가자", title: "내 작품",
  url: "https://my-project.netlify.app/", description: null,
  submittedAt: "2026-11-12T00:00:00Z", isFeatured: false,
};

describe("배포 웹사이트 미리보기", () => {
  it("배포 링크에 격리된 미리보기와 원본 열기를 제공한다", () => {
    const markup = renderToStaticMarkup(<WebsiteSubmissionPreview submission={submission} />);
    expect(markup).toContain('href="https://my-project.netlify.app/"');
    // The frame is assigned its source only after the browser can compare origins.
    expect(markup).not.toContain('src="https://my-project.netlify.app/"');
    expect(markup).toContain('sandbox="allow-scripts"');
    expect(markup).toContain('referrerPolicy="no-referrer"');
    expect(markup).toContain('loading="lazy"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain("미리보기가 표시되지 않으면 새 창에서 열어주세요.");
  });

  it("AI 공유 링크, 유사 도메인과 HTML 업로드에는 표시하지 않는다", () => {
    for (const entry of [
      { ...submission, url: "https://chatgpt.com/share/example" },
      { ...submission, url: "https://my-project.netlify.app.evil.example" },
      { ...submission, htmlFileName: "index.html" },
    ]) expect(renderToStaticMarkup(<WebsiteSubmissionPreview submission={entry} />)).toBe("");
  });
});
