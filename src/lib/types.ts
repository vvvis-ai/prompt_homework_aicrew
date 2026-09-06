export type DailyStatus =
  | "completed"
  | "pending"
  | "missed"
  | "exempt"
  | "excluded"
  | "future"
  | "not_enrolled";

export type Challenge = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

export type Participant = {
  id: string;
  name: string;
  joinedAt: string;
  leftAt: string | null;
};

export type Submission = {
  id: string;
  participantId: string;
  participantName: string;
  title: string | null;
  url: string;
  description: string | null;
  submittedAt: string;
  isFeatured: boolean;
};

export type CalendarDay = {
  date: string;
  day: number;
  status: DailyStatus;
  submissions: Submission[];
};

export type RankingEntry = {
  rank: number;
  participantId: string;
  name: string;
  completedDays: number;
  totalLinks: number;
  streak: number;
};

export type AppData = {
  demo: boolean;
  now: string;
  challenge: Challenge | null;
  participants: Participant[];
  selectedParticipant: Participant | null;
  todayStatus: DailyStatus;
  month: string;
  summary: {
    completedDays: number;
    missedDays: number;
    exemptDays: number;
    totalLinks: number;
    streak: number;
  };
  calendar: CalendarDay[];
  feed: Submission[];
  ranking: RankingEntry[];
  notices: Array<{
    id: string;
    title: string;
    content: string;
    isPinned: boolean;
    createdAt: string;
  }>;
};

export type AdminSessionView = {
  authenticated: boolean;
  operatorId: string | null;
  operatorName: string | null;
};

export type AdminParticipant = Participant & {
  paidAmount: number;
  isActive: boolean;
  completedDays: number;
  missedDays: number;
  exemptDays: number;
  totalLinks: number;
  penaltyAmount: number;
  expectedRefund: number;
};

export type AdminData = {
  demo: boolean;
  session: AdminSessionView;
  challenge: (Challenge & {
    defaultFee: number;
    defaultPenalty: number;
    isActive: boolean;
  }) | null;
  challenges: Array<Challenge & {
    defaultFee: number;
    defaultPenalty: number;
    isActive: boolean;
  }>;
  operators: Array<{ id: string; name: string; isActive: boolean }>;
  participants: AdminParticipant[];
  today: Array<{
    participantId: string;
    name: string;
    status: DailyStatus;
    linkCount: number;
  }>;
  metrics: {
    totalParticipants: number;
    todayCompleted: number;
    todayPending: number;
    todayMissed: number;
    monthMissed: number;
    monthPenalty: number;
    monthLinks: number;
  };
  matrix: Array<{ participantId: string; name: string; days: Record<string, DailyStatus> }>;
  submissions: Submission[];
  exemptions: Array<{ id: string; participantId: string; participantName: string; date: string; reason: string }>;
  excludedDates: Array<{ id: string; date: string; reason: string; source: "holiday" | "admin" }>;
  penaltyRates: Array<{ id: string; amount: number; effectiveFrom: string }>;
  notices: AppData["notices"];
  auditLogs: Array<{
    id: string;
    operatorName: string;
    action: string;
    entityType: string;
    entityId: string | null;
    createdAt: string;
  }>;
  month: string;
};

