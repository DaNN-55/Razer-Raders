import { randomUUID } from "node:crypto";
import { createAssessmentPipeline } from "./lib/radar/assessment-pipeline.ts";
import { postgresAssessmentPipelineArchive } from "./lib/radar/assessment-pipeline-archive.ts";
import { postgresBriefPublicationArchive } from "./lib/radar/brief-publication-archive.ts";
import { postgresEvidenceDigestArchive } from "./lib/radar/evidence-digest-archive.ts";
import { createEvidenceEnricher } from "./lib/radar/evidence-enrichment.ts";
import { createReadyBriefPublisher } from "./lib/radar/brief-publication.ts";
import { MAX_DAILY_BRIEF_SIGNALS } from "./lib/radar/brief-contract.ts";
import { createCitationAccessibilityCheck } from "./lib/radar/citation-accessibility.ts";
import { recordCollectionCycle } from "./lib/radar/collection-stage-recorder.ts";
import { createDailyPublicationSchedule } from "./lib/radar/daily-publication-schedule.ts";
import type { ConnectorId } from "./lib/radar/connectors/types.ts";
import { getDatabasePool } from "./lib/radar/database.ts";
import { createProfileCandidateFilter, createProfileSourceConnectors } from "./lib/radar/profile-collection.ts";
import { getRadarProfile, getRequiredRadarProfile } from "./lib/radar/profile-archive.ts";
import { createModelRuntimeFromProfile } from "./lib/radar/profile-runtime.ts";
import { createTaskWorkerSchedule } from "./lib/radar/task-worker-schedule.ts";
import { createCandidateTaskWorker, postgresCandidateTaskArchive } from "./lib/radar/task-queue.ts";

const defaultCollectionIntervalMs = 2 * 60 * 60 * 1000;

async function collectSourceIntoArchive(connectorId: ConnectorId, pipeline: ReturnType<typeof createAssessmentPipeline>) {
  const result = await pipeline.runCollectionCycle(connectorId);
  await recordCollectionCycle({
    archive: postgresBriefPublicationArchive,
    clock: () => new Date(),
    result,
  });
  if (result.status === "succeeded") {
    console.log(`${connectorId} 采集完成：${result.candidateCount} 个候选`);
  } else {
    console.error(`${connectorId} 采集失败：${result.errorMessage}`);
  }
  return result;
}

async function collectConfiguredSources() {
  const profile = await getRequiredRadarProfile();
  const sourceConnectors = createProfileSourceConnectors(profile);
  const evidenceEnricher = createEvidenceEnricher({
    archive: postgresEvidenceDigestArchive,
    clock: () => new Date(),
  });
  const pipeline = createAssessmentPipeline({
    archive: postgresAssessmentPipelineArchive,
    candidateFilter: createProfileCandidateFilter(profile),
    clock: () => new Date(),
    createRunId: randomUUID,
    enqueueCandidate: (candidate) => postgresCandidateTaskArchive.enqueueEnrichment({
      candidate,
      configurationVersion: profile.id,
      runtimeId: `${profile.runtime.kind}:${profile.runtime.model}`,
    }),
    modelRuntime: { id: profile.runtime.kind },
    sourceConnectors,
  });
  const results = await Promise.all(sourceConnectors.map((connector) => collectSourceIntoArchive(connector.id, pipeline)));
  await createCandidateTaskWorker({
    archive: postgresCandidateTaskArchive,
    clock: () => new Date(),
    concurrency: profile.runtime.modelConcurrency,
    enrich: async (candidate, configurationVersion) => {
      const taskProfile = configurationVersion === profile.id || configurationVersion === "legacy" ? profile : await getRadarProfile(configurationVersion);
      if (!taskProfile) return { candidateCanonicalIdentifier: candidate.canonicalIdentifier, errorMessage: "任务 Profile 已不存在。", digests: [], status: "failed" };
      return evidenceEnricher.enrich(candidate);
    },
    maxTasks: profile.runtime.maxAssessmentsPerCycle,
    getRuntime: async (configurationVersion) => {
      const taskProfile = configurationVersion === profile.id || configurationVersion === "legacy" ? profile : await getRadarProfile(configurationVersion);
      return taskProfile ? createModelRuntimeFromProfile(taskProfile) : null;
    },
    timeBudgetMs: profile.runtime.cycleBudgetSeconds * 1_000,
    workerId: randomUUID(),
  }).runCycle();
  return results.some((result) => result.status === "succeeded") ? "succeeded" as const : "failed" as const;
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
    collect: collectConfiguredSources,
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
