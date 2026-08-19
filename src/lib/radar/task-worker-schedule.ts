import { createDailyPublicationSchedule } from "./daily-publication-schedule.ts";

type WorkerTimers<TimerHandle> = {
  clearTimeout: (handle: TimerHandle) => void;
  setTimeout: (callback: () => void, delay: number) => TimerHandle;
};

export function createTaskWorkerSchedule<TimerHandle>(input: {
  clock: () => Date;
  collect: () => Promise<"failed" | "succeeded">;
  getNextCycleAt: () => Date;
  onError?: (error: unknown) => void;
  publish: () => Promise<void>;
  timers: WorkerTimers<TimerHandle>;
}) {
  const { clock, collect, getNextCycleAt, onError = console.error, publish, timers } = input;
  let cycleTimer: TimerHandle | undefined;
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

  const runCycle = async () => {
    const collectionStatus = await collectSafely();
    if (collectionStatus === "succeeded" && createDailyPublicationSchedule(clock).getDuePublicationDay() && !await publishSafely()) {
      return "failed" as const;
    }
    return collectionStatus;
  };

  const scheduleNextCycle = () => {
    if (stopped) return;
    const delay = Math.max(0, getNextCycleAt().getTime() - clock().getTime());
    cycleTimer = timers.setTimeout(() => {
      void runCycle().then(() => { if (!stopped) scheduleNextCycle(); });
    }, delay);
  };

  return {
    runOnce: runCycle,

    async start() {
      stopped = false;
      await runCycle();
      scheduleNextCycle();
    },

    stop() {
      stopped = true;
      if (cycleTimer !== undefined) timers.clearTimeout(cycleTimer);
    },
  };
}
