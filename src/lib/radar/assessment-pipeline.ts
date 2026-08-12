import type { Candidate, CollectionResult, ConnectorId, SourceEvidence } from "./connectors/types.ts";

export type ModelRuntime = {
  id: string;
};

export type SourceConnector = {
  collect: () => Promise<CollectionResult>;
  id: ConnectorId;
};

export type AssessmentPipelineArchive = {
  failCollectionRun: (input: { errorMessage: string; finishedAt: string; runId: string }) => Promise<void>;
  markConnectorFailed: (input: { connectorId: ConnectorId; detail: string }) => Promise<void>;
  markConnectorFresh: (input: { collectedAt: string; connectorId: ConnectorId }) => Promise<void>;
  startCollectionRun: (input: { connectorId: ConnectorId; runId: string; startedAt: string }) => Promise<void>;
  succeedCollectionRun: (input: { candidateCount: number; finishedAt: string; runId: string }) => Promise<void>;
  upsertCandidate: (candidate: Candidate) => Promise<{ id: string }>;
  upsertSourceEvidence: (input: { association: "primary" | "related"; candidateId: string; evidence: SourceEvidence }) => Promise<void>;
};

export type AssessmentPipelineDependencies = {
  archive: AssessmentPipelineArchive;
  candidateFilter?: (candidate: Candidate) => boolean;
  clock: () => Date;
  createRunId: () => string;
  modelRuntime: ModelRuntime;
  sourceConnectors: readonly SourceConnector[];
};

export type CollectionCycleResult =
  | { candidateCount: number; connectorId: ConnectorId; runId: string; status: "succeeded" }
  | { connectorId: ConnectorId; errorMessage: string; runId: string; status: "failed" };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知采集错误";
}

export function createAssessmentPipeline(dependencies: AssessmentPipelineDependencies) {
  const { archive, candidateFilter = () => true, clock, createRunId, sourceConnectors } = dependencies;
  const connectors = new Map(sourceConnectors.map((connector) => [connector.id, connector]));

  return {
    async runCollectionCycle(connectorId: ConnectorId): Promise<CollectionCycleResult> {
      const connector = connectors.get(connectorId);
      if (!connector) throw new Error(`未配置 Source Connector：${connectorId}`);

      const runId = createRunId();
      await archive.startCollectionRun({ connectorId, runId, startedAt: clock().toISOString() });

      try {
        const collection = await connector.collect();
        if (collection.connectorId !== connectorId) {
          throw new Error(`Source Connector 返回了不匹配的标识：${collection.connectorId}`);
        }

        const retainedCandidates = collection.candidates.filter(candidateFilter);
        for (const candidate of retainedCandidates) {
          const storedCandidate = await archive.upsertCandidate(candidate);

          for (const evidence of candidate.evidence) {
            await archive.upsertSourceEvidence({
              association: evidence.canonicalIdentifier === candidate.canonicalIdentifier ? "primary" : "related",
              candidateId: storedCandidate.id,
              evidence,
            });
          }
        }

        await archive.succeedCollectionRun({
          candidateCount: retainedCandidates.length,
          finishedAt: clock().toISOString(),
          runId,
        });
        await archive.markConnectorFresh({ collectedAt: collection.collectedAt, connectorId });

        return { candidateCount: retainedCandidates.length, connectorId, runId, status: "succeeded" };
      } catch (error) {
        const message = errorMessage(error);
        await archive.failCollectionRun({ errorMessage: message, finishedAt: clock().toISOString(), runId });
        await archive.markConnectorFailed({ connectorId, detail: message });
        return { connectorId, errorMessage: message, runId, status: "failed" };
      }
    },
  };
}
