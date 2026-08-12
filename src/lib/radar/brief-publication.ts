import type { AssessmentEvidence, GroundedAssessment, ModelRuntime } from "./assessment-contract.ts";
import type { Priority, SignalState } from "../../components/radar-data.ts";
import { getCstDay } from "./daily-publication-schedule.ts";
import type { BriefProvenance } from "./brief-contract.ts";

export type PublicationCandidate = {
  canonicalIdentifier: string;
  evidence: readonly AssessmentEvidence[];
  priority: Priority;
  rankingPolicyVersion: string;
  rankingScore: number;
  selectionReason: string;
  signalState: SignalState;
  title: string;
};

export type PublishedSignalInput = {
  builderValue: GroundedAssessment["builderValue"];
  candidateId: string;
  evidence: readonly { label: string; source: string; url: string }[];
  happened: string;
  priority: Priority;
  productOpportunity: GroundedAssessment["productOpportunity"];
  risk: string;
  sectionCitations: GroundedAssessment["citations"];
  sources: readonly string[];
  state: SignalState;
  summary: string;
  technicalBasis: string;
  title: string;
  topics: readonly string[];
  whyNow: string;
};

export type PipelineStage = "assessment" | "collection" | "validation" | "publication";
export type PipelineStageStatus = "failed" | "started" | "succeeded";

type PublishBriefInput = {
  id: string;
  provenance: BriefProvenance;
  publicationDay: string;
  publishedAt: string;
  signals: readonly PublishedSignalInput[];
};

export type PublicationArchive = {
  getCandidatesForPublication: () => Promise<readonly PublicationCandidate[]>;
  hasPublishedBrief: (publicationDay: string) => Promise<boolean>;
  publishBrief: (input: PublishBriefInput) => Promise<"already-published" | "published">;
  recordPipelineStage: (input: { collectionRunId?: string; detail?: string; publicationDay: string; stage: PipelineStage; status: PipelineStageStatus }) => Promise<void>;
};

export type PublicationResult =
  | { briefId: string; signalCount: number; status: "published" }
  | { reason: string; status: "rejected" }
  | { status: "already-published" };

type CitationAccessibility = (url: string) => Promise<boolean>;

const citationSections = ["happened", "whyNow", "technicalBasis"] as const;

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function containsChinese(value: string) {
  return /\p{Script=Han}/u.test(value);
}

function validateAssessment(candidate: PublicationCandidate, assessment: GroundedAssessment): string | null {
  if (!assessment || typeof assessment !== "object" || !assessment.citations || typeof assessment.citations !== "object") return "评估结构无效。";
  const requiredText = [
    ["summary", assessment.summary],
    ["happened", assessment.happened],
    ["whyNow", assessment.whyNow],
    ["technicalBasis", assessment.technicalBasis],
    ["risk", assessment.risk],
  ] as const;
  const missing = requiredText.find(([, value]) => !isNonEmptyText(value));
  if (missing) return `缺少必填字段：${missing[0]}`;
  if (!requiredText.every(([, value]) => containsChinese(value))) return "Grounded Assessment 必须使用中文。";
  if (!Array.isArray(assessment.topics) || assessment.topics.length === 0 || !assessment.topics.every(isNonEmptyText)) return "缺少必填字段：topics";
  if (!(["试用", "学习", "跟进", "跳过"] as const).includes(assessment.builderValue)) return "无效 Builder Value。";
  if (!(["无", "待验证", "值得探索"] as const).includes(assessment.productOpportunity)) return "无效 Product Opportunity。";

  const citationKeys = Object.keys(assessment.citations);
  if (citationKeys.length !== citationSections.length || citationKeys.some((key) => !citationSections.includes(key as typeof citationSections[number]))) {
    return "评估结构无效。";
  }

  const evidenceUrls = new Set(candidate.evidence.map((evidence) => evidence.sourceUrl));
  for (const section of citationSections) {
    const citations = assessment.citations[section];
    if (!Array.isArray(citations) || citations.length === 0) return `缺少 ${section} 的事实引用。`;
    if (!citations.every(isNonEmptyText)) return `${section} 的事实引用结构无效。`;
    if (!citations.every((citation) => evidenceUrls.has(citation))) return `${section} 包含未保留的事实引用。`;
  }
  return null;
}

function toPublishedSignal(candidate: PublicationCandidate, assessment: GroundedAssessment): PublishedSignalInput {
  return {
    builderValue: assessment.builderValue,
    candidateId: candidate.canonicalIdentifier,
    evidence: candidate.evidence.map((evidence) => ({ label: evidence.sourceTitle, source: evidence.sourceName, url: evidence.sourceUrl })),
    happened: assessment.happened,
    priority: candidate.priority,
    productOpportunity: assessment.productOpportunity,
    risk: assessment.risk,
    sectionCitations: assessment.citations,
    sources: [...new Set(candidate.evidence.map((evidence) => evidence.sourceName))],
    state: candidate.signalState,
    summary: assessment.summary,
    technicalBasis: assessment.technicalBasis,
    title: candidate.title,
    topics: assessment.topics,
    whyNow: assessment.whyNow,
  };
}

export function createBriefPublisher(input: {
  archive: PublicationArchive;
  clock: () => Date;
  configurationVersion: string;
  createBriefId: () => string;
  isCitationAccessible: CitationAccessibility;
  pipelineVersion: string;
  runtime: ModelRuntime;
}) {
  const {
    archive,
    clock,
    configurationVersion,
    createBriefId,
    isCitationAccessible,
    pipelineVersion,
    runtime,
  } = input;

  async function publishDailyBrief(): Promise<PublicationResult> {
    const publishedAt = clock();
    const publicationDay = getCstDay(publishedAt);
    if (await archive.hasPublishedBrief(publicationDay)) {
      await archive.recordPipelineStage({ detail: "当日 Brief 已发布，跳过重复发布。", publicationDay, stage: "publication", status: "succeeded" });
      return { status: "already-published" };
    }

    await archive.recordPipelineStage({ publicationDay, stage: "assessment", status: "started" });
    const candidates = await archive.getCandidatesForPublication();
    if (candidates.length === 0) {
      const reason = "Observation Window 内没有可发布的 Candidate。";
      await archive.recordPipelineStage({ publicationDay, stage: "assessment", status: "succeeded" });
      await archive.recordPipelineStage({ publicationDay, stage: "validation", status: "failed", detail: reason });
      return { reason, status: "rejected" };
    }

    const rankingPolicyVersions = [...new Set(candidates.map((candidate) => candidate.rankingPolicyVersion))];
    if (rankingPolicyVersions.length !== 1) {
      const reason = "Candidate 使用了多个 Ranking Policy，不能混合发布。";
      await archive.recordPipelineStage({ publicationDay, stage: "assessment", status: "succeeded" });
      await archive.recordPipelineStage({ detail: reason, publicationDay, stage: "validation", status: "failed" });
      return { reason, status: "rejected" };
    }

    const assessments: { assessment: GroundedAssessment; candidate: PublicationCandidate }[] = [];
    for (const candidate of candidates) {
      let assessment: GroundedAssessment;
      try {
        assessment = await runtime.assess(candidate);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Compatible Runtime 评估失败。";
        await archive.recordPipelineStage({ detail: reason, publicationDay, stage: "assessment", status: "failed" });
        return { reason: `${candidate.title}：${reason}`, status: "rejected" };
      }
      assessments.push({ assessment, candidate });
    }

    await archive.recordPipelineStage({ publicationDay, stage: "assessment", status: "succeeded" });
    await archive.recordPipelineStage({ publicationDay, stage: "validation", status: "started" });
    const signals: PublishedSignalInput[] = [];
    for (const { assessment, candidate } of assessments) {
      const validationError = validateAssessment(candidate, assessment);
      if (validationError) {
        await archive.recordPipelineStage({ detail: validationError, publicationDay, stage: "validation", status: "failed" });
        return { reason: `${candidate.title}：${validationError}`, status: "rejected" };
      }

      for (const section of citationSections) {
        for (const citation of assessment.citations[section]) {
          if (!await isCitationAccessible(citation)) {
            const reason = `引用链接不可访问：${citation}`;
            await archive.recordPipelineStage({ detail: reason, publicationDay, stage: "validation", status: "failed" });
            return { reason, status: "rejected" };
          }
        }
      }
      signals.push(toPublishedSignal(candidate, assessment));
    }

    await archive.recordPipelineStage({ publicationDay, stage: "validation", status: "succeeded" });

    const id = createBriefId();
    await archive.recordPipelineStage({ publicationDay, stage: "publication", status: "started" });
    let published: "already-published" | "published";
    try {
      published = await archive.publishBrief({
        id,
        provenance: {
          configurationVersion,
          modelRuntimeId: runtime.id,
          pipelineVersion,
          rankingPolicyVersion: rankingPolicyVersions[0]!,
        },
        publicationDay,
        publishedAt: publishedAt.toISOString(),
        signals,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Brief Snapshot 写入失败。";
      await archive.recordPipelineStage({ detail: reason, publicationDay, stage: "publication", status: "failed" });
      return { reason, status: "rejected" };
    }
    if (published === "already-published") {
      await archive.recordPipelineStage({ detail: "当日 Brief 已由另一个 Worker 发布，跳过重复写入。", publicationDay, stage: "publication", status: "succeeded" });
      return { status: "already-published" };
    }
    await archive.recordPipelineStage({ publicationDay, stage: "publication", status: "succeeded" });
    return { briefId: id, signalCount: signals.length, status: "published" };
  }

  return {
    publishDailyBrief,
  };
}
