import ExcelJS from "exceljs";
import { z } from "zod";
import { getAdminData } from "@/server/admin-data";
import { getAdminSession } from "@/server/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  challengeId: z.string().regex(/^\d+$/),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  format: z.enum(["csv", "xlsx"]),
});

const statusLabel = {
  completed: "완료",
  pending: "대기",
  missed: "미제출",
  exempt: "면제",
  excluded: "제외일",
  future: "예정",
  not_enrolled: "미참여",
} as const;

const paymentStatusLabel = {
  paid: "납부 완료",
  partial: "부분 납부",
  unpaid: "미납",
  unconfirmed: "확인 필요",
} as const;

function safeFilename(value: string) {
  return value.replace(/[^0-9A-Za-z가-힣_-]+/g, "_").slice(0, 80);
}

function csvCell(value: string | number | null) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session.authenticated || !session.operatorId) return Response.json({ error: "관리자 인증이 필요합니다." }, { status: 401 });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return Response.json({ error: "내보내기 조건이 올바르지 않습니다." }, { status: 400 });
  try {
    const data = await getAdminData(parsed.data.month, parsed.data.challengeId, session);
    if (!data.challenge) return Response.json({ error: "선택한 기수를 찾을 수 없습니다." }, { status: 404 });
    const headers = ["기수", "기준월", "참가자", "참여 시작일", "하차일", "완료일 수", "미제출일 수", "면제일 수", "전체 링크 수", "실제 입금액", "납부 상태", "납부 확인일", "누적 차감액", "예상 반환액", "환급 완료액", "환급 상태"];
    const rows = data.participants.map((person) => [data.challenge!.name, data.month, person.name, person.joinedAt, person.leftAt ?? "", person.completedDays, person.missedDays, person.exemptDays, person.totalLinks, person.paidAmount, paymentStatusLabel[person.paymentStatus], person.paidAt ?? "", person.penaltyAmount, person.expectedRefund, person.refundedAmount ?? "", person.refundedAmount !== null ? "환급 완료" : "미기록"]);
    const baseName = safeFilename(`${data.challenge.name}_${data.month}_정산`);

    if (parsed.data.format === "csv") {
      const csv = "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
      return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(baseName + ".csv")}`, "Cache-Control": "no-store" } });
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "AI 러닝크루";
    workbook.created = new Date();
    const summary = workbook.addWorksheet("월별 정산", { views: [{ state: "frozen", ySplit: 1 }] });
    summary.addRow(headers);
    rows.forEach((row) => summary.addRow(row));
    summary.columns = [20, 12, 14, 14, 14, 12, 12, 12, 14, 15, 13, 14, 15, 15, 15, 14].map((width) => ({ width }));
    summary.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    summary.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2457E6" } };
    summary.autoFilter = { from: "A1", to: `P${Math.max(1, rows.length + 1)}` };
    [10, 13, 14, 15].forEach((column) => { summary.getColumn(column).numFmt = "#,##0\"원\""; });

    const detail = workbook.addWorksheet("날짜별 상세", { views: [{ state: "frozen", xSplit: 2, ySplit: 1 }] });
    detail.addRow(["기수", "참가자", "날짜", "상태"]);
    data.matrix.forEach((person) => Object.entries(person.days).forEach(([date, status]) => detail.addRow([data.challenge!.name, person.name, date, statusLabel[status]])));
    detail.columns = [{ width: 20 }, { width: 14 }, { width: 14 }, { width: 12 }];
    detail.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    detail.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2457E6" } };
    detail.autoFilter = { from: "A1", to: `D${Math.max(1, detail.rowCount)}` };

    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(baseName + ".xlsx")}`, "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("admin export error", error);
    return Response.json({ error: "정산 파일을 만들지 못했습니다." }, { status: 500 });
  }
}
