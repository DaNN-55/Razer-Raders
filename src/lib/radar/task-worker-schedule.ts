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
  getCollectionIntervalMs?: () => Promise<number>;
  onError?: (error: unknown) => void;
  publish: () => Promise<void>;
  timers: WorkerTimers<TimerHandle>;
}) {
  const { clock, collectionIntervalMs, collect, getCollectionIntervalMs, onError = console.error, publish, timers } = input;
  let collectionTimer: TimerHandle | undefined;
  let publicationTimer: TimerHandle | undefined;
  let stopped = false;

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
    if (stopped) return;
    const delay = createDailyPublicationSchedule(clock).getNextPublicationAt().getTime() - clock().getTime();
    publicationTimer = timers.setTimeout(() => {
      void publishSafely().then(() => { if (!stopped) scheduleNextPublication(); });
    }, delay);
  };

  const scheduleNextCollection = async () => {
    let delay = collectionIntervalMs;
    try {
      if (getCollectionIntervalMs) delay = await getCollectionIntervalMs();
    } catch (error) {
      onError(error);
    }
    if (stopped) return;
    collectionTimer = timers.setTimeout(() => {
      void collectSafely().then(() => { void scheduleNextCollection(); });
    }, delay);
  };

  return {
    runOnce: collectAtStartup,

    async start() {
      stopped = false;
      await collectAtStartup();
      await scheduleNextCollection();
      scheduleNextPublication();
    },

    stop() {
      stopped = true;
      if (collectionTimer !== undefined) timers.clearTimeout(collectionTimer);
      if (publicationTimer !== undefined) timers.clearTimeout(publicationTimer);
    },
  };
}
