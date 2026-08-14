import { randomUUID } from "node:crypto";
import { createAssessmentPipeline, type CollectionCycleResult } from "./assessment-pipeline.ts";
import { postgresAssessmentPipelineArchive } from "./assessment-pipeline-archive.ts";
import { postgresBriefPublicationArchive } from "./brief-publication-archive.ts";
import { recordCollectionCycle } from "./collection-stage-recorder.ts";
import type { ConnectorId } from "./connectors/types.ts";
import { getDatabasePool } from "./database.ts";
import { postgresEvidenceDigestArchive } from "./evidence-digest-archive.ts";
import { createEvidenceEnricher } from "./evidence-enrichment.ts";
import { createProfileCandidateFilter, createProfileSourceConnectors } from "./profile-collection.ts";
import { getRadarProfile, getRequiredRadarProfile } from "./profile-archive.ts";
import { createModelRuntimeFromProfile } from "./profile-runtime.ts";
import { createCandidateTaskWorker, postgresCandidateTaskArchive } from "./task-queue.ts";

const collectionLockName = "razer-raders:configured-collection";

export type ConfiguredCollectionResult =
  | { status: "already-running" }
  | { connectorResults: readonly CollectionCycleResult[]; status: "failed" | "succeeded" };

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

export async function collectConfiguredSources(): Promise<ConfiguredCollectionResult> {
  const client = await getDatabasePool().connect();
  let acquired = false;

  try {
    const lock = await client.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock(hashtext($1)) AS acquired", [collectionLockName]);
    acquired = lock.rows[0]?.acquired === true;
    if (!acquired) return { status: "already-running" };

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
    const connectorResults = await Promise.all(sourceConnectors.map((connector) => collectSourceIntoArchive(connector.id, pipeline)));
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

    return {
      connectorResults,
      status: connectorResults.some((result) => result.status === "succeeded") ? "succeeded" : "failed",
    };
  } finally {
    if (acquired) await client.query("SELECT pg_advisory_unlock(hashtext($1))", [collectionLockName]);
    client.release();
  }
}
