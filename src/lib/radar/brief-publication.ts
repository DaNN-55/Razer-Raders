import type { AssessmentEvidence, GroundedAssessment, ModelRuntime } from "./assessment-contract.ts";
import type { Priority, SignalState } from "../../components/radar-data.ts";

export type PublicationCandidate = {
  canonicalIdentifier: string;
  evidence: readonly AssessmentEvidence[];
  priority: Priority;
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

export type PublicationArchive = {
  getCandidatesForPublication: () => Promise<readonly PublicationCandidate[]>;
  hasPublishedBrief: () => Promise<boolean>;
  publishBrief: (input: { id: string; publishedAt: string; signals: readonly PublishedSignalInput[] }) => Promise<void>;
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
  createBriefId: () => string;
  isCitationAccessible: CitationAccessibility;
  runtime: ModelRuntime;
}) {
  const { archive, clock, createBriefId, isCitationAccessible, runtime } = input;

  return {
    async publishFirstBrief(): Promise<PublicationResult> {
      if (await archive.hasPublishedBrief()) return { status: "already-published" };

      const candidates = await archive.getCandidatesForPublication();
      if (candidates.length === 0) return { reason: "Observation Window 内没有可发布的 Candidate。", status: "rejected" };

      const signals: PublishedSignalInput[] = [];
      for (const candidate of candidates) {
        let assessment: GroundedAssessment;
        try {
          assessment = await runtime.assess(candidate);
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Compatible Runtime 评估失败。";
          return { reason: `${candidate.title}：${reason}`, status: "rejected" };
        }
        const validationError = validateAssessment(candidate, assessment);
        if (validationError) return { reason: `${candidate.title}：${validationError}`, status: "rejected" };

        for (const section of citationSections) {
          for (const citation of assessment.citations[section]) {
            if (!await isCitationAccessible(citation)) return { reason: `引用链接不可访问：${citation}`, status: "rejected" };
          }
        }
        signals.push(toPublishedSignal(candidate, assessment));
      }

      const id = createBriefId();
      await archive.publishBrief({ id, publishedAt: clock().toISOString(), signals });
      return { briefId: id, signalCount: signals.length, status: "published" };
    },
  };
}
