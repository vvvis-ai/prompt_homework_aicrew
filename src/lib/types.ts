export type DailyStatus =
  | "completed"
  | "pending"
  | "missed"
  | "exempt"
  | "excluded"
  | "future"
  | "not_enrolled";

export type PaymentStatus = "paid" | "partial" | "unpaid" | "unconfirmed";

export type Challenge = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  penaltyStartDate: string;
};

export type Participant = {
  id: string;
  name: string;
  affiliation: string;
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

export type AppData = {
  progress: ChallengeProgress | null;
  sharingOnly: boolean;
  participantGroups: ParticipantGroup[];
  habit: { week: import("./habits").HabitDay[]; recentMisses: number };
  demo: boolean;
  now: string;
  challenge: Challenge | null;
  penaltyNotice: {
    phase: "before" | "first_day" | "running";
    startDate: string;
    daysUntilStart: number;
    dailyAmount: number;
  } | null;
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
    bestStreak: number;
    completionRate: number | null;
    previousMonthCompletionRate: number | null;
  };
  crewGrowth: {
    completionRate: number | null;
    completedDays: number;
    decidedDays: number;
    totalLinks: number;
    participantCount: number;
    goalRate: number;
  };
  calendar: CalendarDay[];
  feed: Submission[];
  notices: Array<{
    id: string;
    title: string;
    content: string;
    isPinned: boolean;
    createdAt: string;
  }>;
};

export type ActivityDay = {
  date: string;
  count: number;
  participantCount: number;
};

export type ChallengeProgress = {
  personal: {
    completedDays: number;
    completionRate: number | null;
    totalLinks: number;
    activeDays: number;
    streak: number;
  };
  crew: {
    activeDays: number;
    today: { completed: number; pending: number; missed: number; exempt: number; target: number };
    completionRate: number | null;
    completedDays: number;
    decidedDays: number;
    totalLinks: number;
    goalRate: number;
  };
  activity: ActivityDay[];
};

export type ParticipantGroup = {
  id: string;
  name: string;
  isActive: boolean;
  members: Array<{ id: string; name: string; affiliation: string; selectable: boolean }>;
};

export type AdminSessionView = {
  authenticated: boolean;
  operatorId: string | null;
  operatorName: string | null;
};

export type AdminParticipant = Participant & {
  refundedAmount: number | null;
  paidAmount: number;
  paidAt: string | null;
  paymentStatus: PaymentStatus;
  isActive: boolean;
  completedDays: number;
  missedDays: number;
  exemptDays: number;
  totalLinks: number;
  penaltyAmount: number;
  expectedRefund: number;
};

export type PushDeliveryStatus =
  | "sending"
  | "sent"
  | "failed"
  | "expired"
  | "test_sent"
  | "legacy_claimed";

export type AdminReminder = {
  deviceCount: number;
  time: string;
  lastAttemptAt: string | null;
  lastDeliveryStatus: PushDeliveryStatus | null;
  lastResponseStatus: number | null;
  lastError: string | null;
  lastSentDate: string | null;
};

export type AdminData = {
  habit: { week: import("./habits").HabitDay[]; participantId: string; name: string; recentMisses: number; active: boolean }[];
  weeklyPenalty: { missedCount: number; amount: number; participantCount: number };
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
    reminder: AdminReminder | null;
  }>;
  metrics: {
    totalParticipants: number;
    paidCount: number;
    unpaidCount: number;
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

