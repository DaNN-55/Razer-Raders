import type { AssessmentEvidence, AssessmentWithContent, EvidenceFirstAssessment, GroundedAssessment, ModelRuntime } from "./assessment-contract.ts";
import type { Priority, SignalState } from "../../components/radar-data.ts";
import { getCstDay, type PublicationSlot } from "./daily-publication-schedule.ts";
import { MAX_DAILY_BRIEF_SIGNALS, type BriefProvenance } from "./brief-contract.ts";

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
  builderValue: AssessmentWithContent["builderValue"];
  candidateId: string;
  evidence: readonly { excerpts?: readonly string[]; label: string; source: string; url: string }[];
  happened: string;
  priority: Priority;
  productOpportunity: AssessmentWithContent["productOpportunity"];
  risk: string;
  sectionCitations: AssessmentWithContent["citations"];
  sources: readonly string[];
  state: SignalState;
  summary: string;
  technicalBasis: string;
  title: string;
  topics: readonly string[];
  whyInBrief: string;
  whyNow: string;
};

export type PipelineStage = "assessment" | "collection" | "validation" | "publication";
export type PipelineStageStatus = "failed" | "started" | "succeeded";

type PublishBriefInput = {
  id: string;
  provenance: BriefProvenance;
  publicationDay: string;
  publicationSlot: PublicationSlot;
  publishedAt: string;
  signals: readonly PublishedSignalInput[];
};

export type PublicationArchive = {
  getCandidatesForPublication: (limit?: number) => Promise<readonly PublicationCandidate[]>;
  getReadyAssessments?: (limit?: number) => Promise<readonly ReadyPublicationAssessment[]>;
  hasPublishedBrief: (publicationDay: string, publicationSlot?: PublicationSlot) => Promise<boolean>;
  markCandidateAssessmentDelayed: (input: { candidateId: string; detail: string }) => Promise<void>;
  publishBrief: (input: PublishBriefInput) => Promise<"already-published" | "published">;
  recordPipelineStage: (input: { collectionRunId?: string; detail?: string; publicationDay: string; stage: PipelineStage; status: PipelineStageStatus }) => Promise<void>;
};

export type ReadyPublicationAssessment = {
  assessment: EvidenceFirstAssessment;
  candidate: PublicationCandidate;
  configurationVersion: string;
  ranking?: {
    crossSourceCount: number;
    lastCollectedAt?: string;
    observationCount: number;
    primaryEvidenceCount: number;
  };
  runtimeId: string;
};

export type PublicationResult =
  | { briefId: string; signalCount: number; status: "published" }
  | { reason: string; status: "delayed" }
  | { reason: string; status: "rejected" }
  | { status: "already-published" };

type CitationAccessibility = (url: string) => Promise<boolean>;
type AssessmentResult = { assessment: AssessmentWithContent; candidate: PublicationCandidate } | { candidate: PublicationCandidate; reason: string };

const citationSections = ["happened", "whyNow", "technicalBasis"] as const;
const evidenceFirstCitationSections = ["summary", "happened", "whyNow", "technicalBasis"] as const;
const runtimeAttemptLimit = 3;

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function containsChinese(value: string) {
  return /\p{Script=Han}/u.test(value);
}

function hasAssessmentContent(assessment: GroundedAssessment): assessment is AssessmentWithContent {
  return assessment.assessmentOutcome !== "insufficient-evidence" && assessment.assessmentOutcome !== "outside-radar-scope";
}

function validateAssessmentContent(candidate: PublicationCandidate, assessment: AssessmentWithContent, requiredSections: readonly (keyof AssessmentWithContent["citations"])[]): string | null {
  if (!assessment.citations || typeof assessment.citations !== "object") return "评估结构无效。";
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
  if ((assessment as EvidenceFirstAssessment).assessmentOutcome === "sufficient-for-ranking" && /(热度|排名|重复收集|被收集)/.test(assessment.whyNow)) return "为什么值得关注不能以热度或重复收集作为主要理由。";

  const citationKeys = Object.keys(assessment.citations);
  if (citationKeys.length !== requiredSections.length || citationKeys.some((key) => !requiredSections.includes(key as never))) {
    return "评估结构无效。";
  }

  const evidenceUrls = new Set(candidate.evidence.map((evidence) => evidence.sourceUrl));
  for (const section of requiredSections) {
    const citations = assessment.citations[section];
    if (!Array.isArray(citations) || citations.length === 0) return `缺少 ${section} 的事实引用。`;
    if (!citations.every(isNonEmptyText)) return `${section} 的事实引用结构无效。`;
    if (!citations.every((citation) => evidenceUrls.has(citation))) return `${section} 包含未保留的事实引用。`;
  }
  return null;
}

export function validateAssessment(candidate: PublicationCandidate, assessment: GroundedAssessment): string | null {
  if (!assessment || typeof assessment !== "object" || !hasAssessmentContent(assessment)) return "评估结构无效。";
  return validateAssessmentContent(candidate, assessment, (assessment as EvidenceFirstAssessment).assessmentOutcome === "sufficient-for-ranking" ? evidenceFirstCitationSections : citationSections);
}

export function validateEvidenceFirstAssessment(candidate: PublicationCandidate, assessment: GroundedAssessment): string | null {
  if (assessment.assessmentOutcome === "insufficient-evidence" || assessment.assessmentOutcome === "outside-radar-scope") {
    return isNonEmptyText(assessment.assessmentReason) ? null : "缺少 assessmentReason。";
  }
  if (assessment.assessmentOutcome !== "sufficient-for-ranking") return "缺少或无效 assessmentOutcome。";
  return validateAssessmentContent(candidate, assessment, evidenceFirstCitationSections);
}

const builderValueOrder: Record<AssessmentWithContent["builderValue"], number> = {
  "试用": 0,
  "学习": 1,
  "跟进": 2,
  "跳过": 3,
};

export function rankReadyAssessments(ready: readonly ReadyPublicationAssessment[]) {
  return [...ready].sort((left, right) => {
    const actionDifference = builderValueOrder[left.assessment.builderValue] - builderValueOrder[right.assessment.builderValue];
    if (actionDifference) return actionDifference;
    const primaryEvidenceDifference = (right.ranking?.primaryEvidenceCount ?? right.candidate.evidence.length) - (left.ranking?.primaryEvidenceCount ?? left.candidate.evidence.length);
    if (primaryEvidenceDifference) return primaryEvidenceDifference;
    const attentionDifference = right.candidate.rankingScore - left.candidate.rankingScore;
    if (attentionDifference) return attentionDifference;
    const recencyDifference = (right.ranking?.lastCollectedAt ?? "").localeCompare(left.ranking?.lastCollectedAt ?? "");
    if (recencyDifference) return recencyDifference;
    const observationDifference = (right.ranking?.observationCount ?? 0) - (left.ranking?.observationCount ?? 0);
    if (observationDifference) return observationDifference;
    return (right.ranking?.crossSourceCount ?? 0) - (left.ranking?.crossSourceCount ?? 0);
  });
}

export function toPublishedSignal(candidate: PublicationCandidate, assessment: AssessmentWithContent): PublishedSignalInput {
  return {
    builderValue: assessment.builderValue,
    candidateId: candidate.canonicalIdentifier,
    evidence: candidate.evidence.map((evidence) => ({
      ...(evidence.excerpts?.length ? { excerpts: evidence.excerpts } : {}),
      label: evidence.sourceTitle,
      source: evidence.sourceName,
      url: evidence.sourceUrl,
    })),
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
    whyInBrief: candidate.selectionReason,
    whyNow: assessment.whyNow,
  };
}

export function createReadyBriefPublisher(input: {
  archive: PublicationArchive;
  clock: () => Date;
  createBriefId: () => string;
  isCitationAccessible: CitationAccessibility;
  maxAssessments?: number;
  publicationSlot?: PublicationSlot;
  pipelineVersion: string;
}) {
  const { archive, clock, createBriefId, isCitationAccessible, pipelineVersion } = input;
  const maxAssessments = Math.min(input.maxAssessments ?? MAX_DAILY_BRIEF_SIGNALS, MAX_DAILY_BRIEF_SIGNALS);
  const publicationSlot = input.publicationSlot ?? "morning";
  return {
    async publishDailyBrief(): Promise<PublicationResult> {
      const publishedAt = clock();
      const publicationDay = getCstDay(publishedAt);
      if (await archive.hasPublishedBrief(publicationDay, publicationSlot)) return { status: "already-published" };
      const ready = rankReadyAssessments(await archive.getReadyAssessments?.(maxAssessments) ?? []);
      if (!ready.length) return { reason: "Observation Window 内没有已评估待发布的 Candidate。", status: "rejected" };
      const first = ready[0]!;
      const publishable = ready.filter((item) => item.configurationVersion === first.configurationVersion
        && item.runtimeId === first.runtimeId
        && item.candidate.rankingPolicyVersion === first.candidate.rankingPolicyVersion);
      const signals: PublishedSignalInput[] = [];
      for (const { assessment, candidate } of publishable) {
        const validationError = validateEvidenceFirstAssessment(candidate, assessment);
        if (validationError) return { reason: `${candidate.title}：${validationError}`, status: "rejected" };
        for (const section of evidenceFirstCitationSections) {
          for (const citation of assessment.citations[section] ?? []) {
            if (!await isCitationAccessible(citation)) return { reason: `引用链接不可访问：${citation}`, status: "rejected" };
          }
        }
        signals.push(toPublishedSignal(candidate, assessment));
      }
      const id = createBriefId();
      const published = await archive.publishBrief({
        id,
        provenance: { configurationVersion: first.configurationVersion, modelRuntimeId: first.runtimeId, pipelineVersion, rankingPolicyVersion: first.candidate.rankingPolicyVersion },
        publicationDay,
        publicationSlot,
        publishedAt: publishedAt.toISOString(),
        signals,
      });
      return published === "already-published" ? { status: "already-published" } : { briefId: id, signalCount: signals.length, status: "published" };
    },
  };
}

export function createBriefPublisher(input: {
  archive: PublicationArchive;
  assessmentBudgetMs?: number;
  assessmentConcurrency?: number;
  clock: () => Date;
  configurationVersion: string;
  createBriefId: () => string;
  isCitationAccessible: CitationAccessibility;
  maxAssessments?: number;
  publicationSlot?: PublicationSlot;
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
  const publicationSlot = input.publicationSlot ?? "morning";
  const assessmentBudgetMs = input.assessmentBudgetMs ?? 30 * 60 * 1000;
  const assessmentConcurrency = input.assessmentConcurrency ?? 1;
  const maxAssessments = input.maxAssessments ?? 10;

  async function publishDailyBrief(): Promise<PublicationResult> {
    const publishedAt = clock();
    const publicationDay = getCstDay(publishedAt);
    if (await archive.hasPublishedBrief(publicationDay, publicationSlot)) {
      await archive.recordPipelineStage({ detail: "当日 Brief 已发布，跳过重复发布。", publicationDay, stage: "publication", status: "succeeded" });
      return { status: "already-published" };
    }

    await archive.recordPipelineStage({ publicationDay, stage: "assessment", status: "started" });
    const candidates = await archive.getCandidatesForPublication(maxAssessments);
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

    const deadline = Date.now() + assessmentBudgetMs;
    const assessCandidate = async (candidate: PublicationCandidate): Promise<AssessmentResult> => {
      if (Date.now() >= deadline) return { candidate, reason: "本轮评估时间预算已耗尽。" };
      let assessment: GroundedAssessment | null = null;
      let latestError = "Compatible Runtime 评估失败。";
      for (let attempt = 1; attempt <= runtimeAttemptLimit; attempt += 1) {
        if (Date.now() >= deadline) return { candidate, reason: "本轮评估时间预算已耗尽。" };
        try {
          assessment = await runtime.assess(candidate, { signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) });
          break;
        } catch (error) {
          latestError = error instanceof Error ? error.message : "Compatible Runtime 评估失败。";
        }
      }
      if (!assessment) {
        return { candidate, reason: `${latestError}（已重试 ${runtimeAttemptLimit} 次）` };
      }
      if (!hasAssessmentContent(assessment)) return { candidate, reason: assessment.assessmentReason };
      return { assessment, candidate };
    };
    const results: AssessmentResult[] = new Array(candidates.length);
    let nextCandidateIndex = 0;
    const workers = Array.from({ length: Math.min(assessmentConcurrency, candidates.length) }, async () => {
      while (nextCandidateIndex < candidates.length) {
        const candidateIndex = nextCandidateIndex;
        nextCandidateIndex += 1;
        const candidate = candidates[candidateIndex];
        if (candidate) results[candidateIndex] = await assessCandidate(candidate);
      }
    });
    await Promise.all(workers);
    const failure = results.find((result) => "reason" in result);
    if (failure && "reason" in failure) {
      await archive.markCandidateAssessmentDelayed({ candidateId: failure.candidate.canonicalIdentifier, detail: failure.reason });
      await archive.recordPipelineStage({ detail: failure.reason, publicationDay, stage: "assessment", status: "failed" });
      return { reason: `${failure.candidate.title}：${failure.reason}`, status: "delayed" };
    }
    const assessments = results as { assessment: AssessmentWithContent; candidate: PublicationCandidate }[];

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
        publicationSlot,
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
