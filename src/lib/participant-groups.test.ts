import { describe, expect, it } from "vitest";
import { groupParticipants } from "./participant-groups";

describe("기수별 참가자 명단", () => {
  it("DB ID가 기수와 달라도 활성 2기를 먼저 보여주고 1기 전원을 보존한다", () => {
    const participants = [
      { id: 11, challenge_id: 2, name: "김하나", affiliation: "교육지원과", is_active: false, paid_amount: 80000 },
      { id: 12, challenge_id: 1, name: "이둘", affiliation: "", is_active: true },
    ];
    const groups = groupParticipants([
      { id: 2, name: "1기", is_active: false, start_date: "2026-01-07" },
      { id: 1, name: "2기", is_active: true, start_date: "2026-09-01" },
    ], participants);
    expect(groups.map((group) => group.name)).toEqual(["2기", "1기"]);
    expect(groups[0].members[0]).toEqual({ id: "12", name: "이둘", affiliation: "", selectable: true });
    expect(groups[1].members[0]).toEqual({ id: "11", name: "김하나", affiliation: "교육지원과", selectable: false });
  });

  it("빈 기수와 비활성 참가자를 처리하고 다른 기수 멤버를 섞지 않는다", () => {
    const groups = groupParticipants([
      { id: 1, name: "2기", is_active: true, start_date: "2026-09-01" },
      { id: 2, name: "1기", is_active: false, start_date: "2026-01-07" },
    ], [
      { id: 1, challenge_id: 1, name: "가", affiliation: "", is_active: false },
      { id: 3, challenge_id: 3, name: "다", affiliation: "", is_active: true },
    ]);
    expect(groups[0].members).toHaveLength(1);
    expect(groups[0].members[0].selectable).toBe(false);
    expect(groups[1].members).toEqual([]);
  });
});
