import { randomUUID } from "node:crypto";
import { createAssessmentPipeline } from "./lib/radar/assessment-pipeline.ts";
import { postgresAssessmentPipelineArchive } from "./lib/radar/assessment-pipeline-archive.ts";
import { githubTrendingConnector } from "./lib/radar/connectors/github-trending.ts";
import { getDatabasePool } from "./lib/radar/database.ts";

const defaultCollectionIntervalMs = 2 * 60 * 60 * 1000;

function getCollectionIntervalMs() {
  const configured = Number(process.env.RADAR_COLLECTION_INTERVAL_MS ?? defaultCollectionIntervalMs);
  return Number.isFinite(configured) && configured >= 60_000 ? configured : defaultCollectionIntervalMs;
}

const assessmentPipeline = createAssessmentPipeline({
  archive: postgresAssessmentPipelineArchive,
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

async function runWorker() {
  const initialResult = await collectGitHubTrendingIntoArchive();
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
