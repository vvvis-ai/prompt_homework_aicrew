import { describe, expect, it } from "vitest";
import { weekDates, recentMisses, isPushEndpoint, starterMission } from "./habits";

describe("daily habit records", () => {
  it("keeps a single Monday-to-Sunday week across month and year boundaries", () => {
    expect(weekDates("2027-01-01")).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
    expect(weekDates("2026-09-13")[0]).toBe("2026-09-07");
  });
  it("counts consecutive confirmed misses across holidays but resets on completion", () => {
    expect(recentMisses([
      { date: "2026-09-04", status: "completed" }, { date: "2026-09-07", status: "missed" },
      { date: "2026-09-08", status: "exempt" }, { date: "2026-09-09", status: "excluded" },
      { date: "2026-09-10", status: "missed" }, { date: "2026-09-11", status: "pending" },
    ])).toBe(2);
    expect(recentMisses([{ date: "2026-09-07", status: "missed" }, { date: "2026-09-08", status: "completed" }])).toBe(0);
  });
  it("provides a deterministic fallback mission for every date", () => {
    expect(starterMission("2026-09-08")).toEqual(starterMission("2026-09-08"));
    expect(starterMission("2026-09-09").title).not.toEqual(starterMission("2026-09-08").title);
    expect(starterMission("").title).toBeTruthy();
  });
  it("only permits recognized HTTPS push services, preventing arbitrary outbound requests", () => {
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/token")).toBe(true);
    expect(isPushEndpoint("https://web.push.apple.com/token")).toBe(true);
    for (const endpoint of ["http://fcm.googleapis.com/x", "https://localhost/x", "https://fcm.googleapis.com.evil.test/x", "https://fcm.googleapis.com:8443/x", "https://user@fcm.googleapis.com/x"]) expect(isPushEndpoint(endpoint)).toBe(false);
  });
});
