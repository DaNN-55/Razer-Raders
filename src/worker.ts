import { randomUUID } from "node:crypto";
import { createAssessmentPipeline } from "./lib/radar/assessment-pipeline.ts";
import { postgresAssessmentPipelineArchive } from "./lib/radar/assessment-pipeline-archive.ts";
import { postgresBriefPublicationArchive } from "./lib/radar/brief-publication-archive.ts";
import { createBriefPublisher } from "./lib/radar/brief-publication.ts";
import { createEnvironmentCandidateFilter } from "./lib/radar/candidate-filter.ts";
import { createCitationAccessibilityCheck } from "./lib/radar/citation-accessibility.ts";
import { recordCollectionCycle } from "./lib/radar/collection-stage-recorder.ts";
import { createDailyPublicationSchedule } from "./lib/radar/daily-publication-schedule.ts";
import { githubTrendingConnector } from "./lib/radar/connectors/github-trending.ts";
import { getDatabasePool } from "./lib/radar/database.ts";
import { createModelRuntimeFromEnvironment } from "./lib/radar/model-runtime.ts";
import { createTaskWorkerSchedule } from "./lib/radar/task-worker-schedule.ts";

const defaultCollectionIntervalMs = 2 * 60 * 60 * 1000;

function getCollectionIntervalMs() {
  const configured = Number(process.env.RADAR_COLLECTION_INTERVAL_MS ?? defaultCollectionIntervalMs);
  return Number.isFinite(configured) && configured >= 60_000 ? configured : defaultCollectionIntervalMs;
}

const assessmentPipeline = createAssessmentPipeline({
  archive: postgresAssessmentPipelineArchive,
  candidateFilter: createEnvironmentCandidateFilter(),
  clock: () => new Date(),
  createRunId: randomUUID,
  modelRuntime: { id: process.env.RADAR_MODEL_RUNTIME_ID ?? "not-configured" },
  sourceConnectors: [githubTrendingConnector],
});

async function collectGitHubTrendingIntoArchive() {
  const result = await assessmentPipeline.runCollectionCycle("github-trending");
  await recordCollectionCycle({
    archive: postgresBriefPublicationArchive,
    clock: () => new Date(),
    result,
  });
  if (result.status === "succeeded") {
    console.log(`GitHub Trending 采集完成：${result.candidateCount} 个候选`);
  } else {
    console.error(`GitHub Trending 采集失败：${result.errorMessage}`);
  }
  return result;
}

async function publishDailyBriefIfConfigured() {
  const runtime = createModelRuntimeFromEnvironment();
  const runtimeName = process.env.RADAR_MODEL_RUNTIME ?? "compatible";
  if (!runtime) {
    const detail = `${runtimeName} Runtime 未配置或不受支持。`;
    console.log(`${detail} 跳过当日日报发布。`);
    const dueDay = createDailyPublicationSchedule(() => new Date()).getDuePublicationDay();
    if (dueDay) {
      await postgresBriefPublicationArchive.recordPipelineStage({
        detail,
        publicationDay: dueDay,
        stage: "assessment",
        status: "failed",
      });
    }
    return { reason: detail, status: "rejected" as const };
  }

  const candidates = await postgresBriefPublicationArchive.getCandidatesForPublication();
  const isCitationAccessible = createCitationAccessibilityCheck(
    candidates.flatMap((candidate) => candidate.evidence.map((evidence) => evidence.sourceUrl)),
  );
  const result = await createBriefPublisher({
    archive: postgresBriefPublicationArchive,
    clock: () => new Date(),
    configurationVersion: process.env.RADAR_CONFIGURATION_VERSION ?? "profile@v1",
    createBriefId: randomUUID,
    isCitationAccessible,
    pipelineVersion: process.env.RADAR_PIPELINE_VERSION ?? "assessment-pipeline@v1",
    runtime,
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
    collectionIntervalMs: getCollectionIntervalMs(),
    collect: async () => (await collectGitHubTrendingIntoArchive()).status,
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
