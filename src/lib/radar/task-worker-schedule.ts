import { createDailyPublicationSchedule } from "./daily-publication-schedule.ts";

type WorkerTimers<TimerHandle> = {
  clearInterval: (handle: TimerHandle) => void;
  clearTimeout: (handle: TimerHandle) => void;
  setInterval: (callback: () => void, delay: number) => TimerHandle;
  setTimeout: (callback: () => void, delay: number) => TimerHandle;
};

export function createTaskWorkerSchedule<TimerHandle>(input: {
  clock: () => Date;
  collectionIntervalMs: number;
  collect: () => Promise<"failed" | "succeeded">;
  onError?: (error: unknown) => void;
  publish: () => Promise<void>;
  timers: WorkerTimers<TimerHandle>;
}) {
  const { clock, collectionIntervalMs, collect, onError = console.error, publish, timers } = input;
  let collectionInterval: TimerHandle | undefined;
  let publicationTimer: TimerHandle | undefined;

  const collectSafely = async () => {
    try {
      return await collect();
    } catch (error) {
      onError(error);
      return "failed" as const;
    }
  };

  const publishSafely = async () => {
    try {
      await publish();
      return true;
    } catch (error) {
      onError(error);
      return false;
    }
  };

  const collectAtStartup = async () => {
    const collectionStatus = await collectSafely();
    if (collectionStatus === "succeeded" && createDailyPublicationSchedule(clock).getDuePublicationDay() && !await publishSafely()) {
      return "failed" as const;
    }
    return collectionStatus;
  };

  const scheduleNextPublication = () => {
    const delay = createDailyPublicationSchedule(clock).getNextPublicationAt().getTime() - clock().getTime();
    publicationTimer = timers.setTimeout(() => {
      void publishSafely().then(scheduleNextPublication);
    }, delay);
  };

  return {
    runOnce: collectAtStartup,

    async start() {
      await collectAtStartup();
      collectionInterval = timers.setInterval(() => { void collectSafely(); }, collectionIntervalMs);
      scheduleNextPublication();
    },

    stop() {
      if (collectionInterval !== undefined) timers.clearInterval(collectionInterval);
      if (publicationTimer !== undefined) timers.clearTimeout(publicationTimer);
    },
  };
}
