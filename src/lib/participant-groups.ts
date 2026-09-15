import type { ParticipantGroup } from "./types";
import { isVoluntarySharingChallenge } from "./participation";
import { kstDateKey } from "./time";

export function groupParticipants(
  challenges: Array<{ id: number | string; name: string; is_active: boolean; start_date: string; end_date: string }>,
  participants: Array<{ id: number | string; challenge_id: number | string; name: string; affiliation: string; is_active: boolean }>,
  today = kstDateKey(new Date()),
): ParticipantGroup[] {
  return [...challenges]
    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || b.start_date.localeCompare(a.start_date))
    .map((challenge) => ({
      id: String(challenge.id),
      name: challenge.name,
      isActive: challenge.is_active,
      members: participants
        .filter((person) => String(person.challenge_id) === String(challenge.id))
        .sort((a, b) => a.name.localeCompare(b.name, "ko"))
        .map((person) => ({
          id: String(person.id),
          name: person.name,
          affiliation: person.affiliation,
          selectable: (challenge.is_active && person.is_active) || isVoluntarySharingChallenge(challenge, today),
        })),
    }));
}
