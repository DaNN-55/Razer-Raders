import { randomUUID } from "node:crypto";
import { postgresBriefPublicationArchive } from "./lib/radar/brief-publication-archive.ts";
import { createReadyBriefPublisher } from "./lib/radar/brief-publication.ts";
import { MAX_DAILY_BRIEF_SIGNALS } from "./lib/radar/brief-contract.ts";
import { createCitationAccessibilityCheck } from "./lib/radar/citation-accessibility.ts";
import { collectConfiguredSources } from "./lib/radar/configured-collection.ts";
import { createDailyPublicationSchedule } from "./lib/radar/daily-publication-schedule.ts";
import { getDatabasePool } from "./lib/radar/database.ts";
import { getRequiredRadarProfile } from "./lib/radar/profile-archive.ts";
import { createTaskWorkerSchedule } from "./lib/radar/task-worker-schedule.ts";

const defaultCollectionIntervalMs = 2 * 60 * 60 * 1000;

async function collectScheduledSources() {
  const result = await collectConfiguredSources();
  if (result.status === "already-running") {
    console.log("已有采集正在执行，跳过重复的定时采集。");
    return "succeeded" as const;
  }
  return result.status;
}

async function publishDailyBriefIfConfigured() {
  await getRequiredRadarProfile();
  const result = await createReadyBriefPublisher({
    archive: postgresBriefPublicationArchive,
    clock: () => new Date(),
    createBriefId: randomUUID,
    isCitationAccessible: (url) => createCitationAccessibilityCheck([url])(url),
    maxAssessments: MAX_DAILY_BRIEF_SIGNALS,
    pipelineVersion: process.env.RADAR_PIPELINE_VERSION ?? "evidence-first-assessment@v1",
  }).publishDailyBrief();
  if (result.status === "published") console.log(`日报已发布：${result.signalCount} 个信号`);
  if (result.status === "delayed") console.error(`日报评估延迟：${result.reason}`);
  if (result.status === "rejected") console.error(`日报未发布：${result.reason}`);
  return result;
}

async function publishDailyBriefWhenDue() {
  if (!createDailyPublicationSchedule(() => new Date()).getDuePublicationDay()) return;
  await publishDailyBriefIfConfigured();
}

async function runWorker() {
  const schedule = createTaskWorkerSchedule({
    clock: () => new Date(),
    collectionIntervalMs: defaultCollectionIntervalMs,
    getCollectionIntervalMs: async () => (await getRequiredRadarProfile()).collectionIntervalMs,
    collect: collectScheduledSources,
    onError: (error) => console.error("Task Worker 任务失败：", error),
    publish: publishDailyBriefWhenDue,
    timers: { clearInterval, clearTimeout, setInterval, setTimeout },
  });
  if (process.env.RADAR_WORKER_ONCE === "true") {
    if (await schedule.runOnce() === "failed") process.exitCode = 1;
    await getDatabasePool().end();
    return;
  }

  await schedule.start();

  const shutdown = async () => {
    schedule.stop();
    await getDatabasePool().end();
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

runWorker().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
