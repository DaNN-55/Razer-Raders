const chinaStandardTimeOffsetMs = 8 * 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

export type PublicationSlot = "morning" | "afternoon";
export type DuePublication = { day: string; slot: PublicationSlot };

const publicationSlots: readonly { hourUtc: number; slot: PublicationSlot }[] = [
  { hourUtc: 1, slot: "morning" },
  { hourUtc: 9, slot: "afternoon" },
];

export function getCstDay(value: Date) {
  return new Date(value.getTime() + chinaStandardTimeOffsetMs).toISOString().slice(0, 10);
}

function publicationAtForCstDay(day: string, hourUtc: number) {
  return new Date(`${day}T${String(hourUtc).padStart(2, "0")}:00:00.000Z`);
}

export function createDailyPublicationSchedule(clock: () => Date) {
  const getToday = () => getCstDay(clock());
  const getDuePublications = (): readonly DuePublication[] => {
    const now = clock();
    const day = getCstDay(now);
    return publicationSlots
      .filter(({ hourUtc }) => now >= publicationAtForCstDay(day, hourUtc))
      .map(({ slot }) => ({ day, slot }));
  };

  return {
    getDuePublications,

    getDuePublication(): DuePublication | null {
      return getDuePublications().at(-1) ?? null;
    },

    getDuePublicationDay() {
      return this.getDuePublication()?.day ?? null;
    },

    getNextPublicationAt() {
      const now = clock();
      const today = getToday();
      const nextToday = publicationSlots
        .map(({ hourUtc }) => publicationAtForCstDay(today, hourUtc))
        .find((publicationAt) => now < publicationAt);
      if (nextToday) return nextToday;

      const tomorrow = new Date(publicationAtForCstDay(today, publicationSlots[0]!.hourUtc).getTime() + dayMs);
      return tomorrow;
    },
  };
}
