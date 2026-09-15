// A finished cohort can keep sharing without reopening its challenge or settlement.
export function isVoluntarySharingChallenge(
  challenge: { is_active: boolean; end_date: string },
  today: string,
): boolean {
  return !challenge.is_active && challenge.end_date < today;
}
