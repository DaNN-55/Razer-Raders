import { randomUUID } from "node:crypto";
import { createAssessmentPipeline } from "./lib/radar/assessment-pipeline.ts";
import { postgresAssessmentPipelineArchive } from "./lib/radar/assessment-pipeline-archive.ts";
import { postgresBriefPublicationArchive } from "./lib/radar/brief-publication-archive.ts";
import { createBriefPublisher } from "./lib/radar/brief-publication.ts";
import { createEnvironmentCandidateFilter } from "./lib/radar/candidate-filter.ts";
import { createCitationAccessibilityCheck } from "./lib/radar/citation-accessibility.ts";
import { createCompatibleRuntimeFromEnvironment } from "./lib/radar/compatible-runtime.ts";
import { githubTrendingConnector } from "./lib/radar/connectors/github-trending.ts";
import { getDatabasePool } from "./lib/radar/database.ts";

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
  if (result.status === "succeeded") {
    console.log(`GitHub Trending 采集完成：${result.candidateCount} 个候选`);
  } else {
    console.error(`GitHub Trending 采集失败：${result.errorMessage}`);
  }
  return result;
}

async function publishFirstBriefIfConfigured() {
  const runtime = createCompatibleRuntimeFromEnvironment();
  if (!runtime) {
    console.log("Compatible Runtime 未配置，跳过首份日报发布。");
    return { reason: "Compatible Runtime 未配置。", status: "rejected" as const };
  }

  const candidates = await postgresBriefPublicationArchive.getCandidatesForPublication();
  const isCitationAccessible = createCitationAccessibilityCheck(
    candidates.flatMap((candidate) => candidate.evidence.map((evidence) => evidence.sourceUrl)),
  );
  const result = await createBriefPublisher({
    archive: postgresBriefPublicationArchive,
    clock: () => new Date(),
    createBriefId: randomUUID,
    isCitationAccessible,
    runtime,
  }).publishFirstBrief();
  if (result.status === "published") console.log(`首份日报已发布：${result.signalCount} 个信号`);
  if (result.status === "rejected") console.error(`首份日报未发布：${result.reason}`);
  return result;
}

async function runWorker() {
  const initialResult = await collectGitHubTrendingIntoArchive();
  if (initialResult.status === "succeeded" && process.env.RADAR_PUBLISH_FIRST_BRIEF === "true") {
    await publishFirstBriefIfConfigured();
  }
  if (process.env.RADAR_WORKER_ONCE === "true") {
    if (initialResult.status === "failed") process.exitCode = 1;
    await getDatabasePool().end();
    return;
  }

  const interval = setInterval(() => {
    void collectGitHubTrendingIntoArchive().catch((error: unknown) => console.error(error));
  }, getCollectionIntervalMs());

  const shutdown = async () => {
    clearInterval(interval);
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
