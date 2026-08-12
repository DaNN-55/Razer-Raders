const chinaStandardTimeOffsetMs = 8 * 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;
const publicationHourUtc = 1;

export function getCstDay(value: Date) {
  return new Date(value.getTime() + chinaStandardTimeOffsetMs).toISOString().slice(0, 10);
}

function publicationAtForCstDay(day: string) {
  return new Date(`${day}T${String(publicationHourUtc).padStart(2, "0")}:00:00.000Z`);
}

export function createDailyPublicationSchedule(clock: () => Date) {
  return {
    getDuePublicationDay() {
      const now = clock();
      const today = getCstDay(now);
      return now >= publicationAtForCstDay(today) ? today : null;
    },

    getNextPublicationAt() {
      const now = clock();
      const today = getCstDay(now);
      const todayPublication = publicationAtForCstDay(today);
      return now < todayPublication ? todayPublication : new Date(todayPublication.getTime() + dayMs);
    },
  };
}
