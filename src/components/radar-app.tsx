"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  ChevronIcon,
  ExternalIcon,
  FilterIcon,
  MenuIcon,
  MoonIcon,
  RadarIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
} from "@/components/icons";
import { getAssessmentBanner, getBriefCoverageLabel, getBriefFormatLabel, getBriefHeading, getBriefPage, getSignalCardSections } from "@/components/brief-presentation";
import { type Signal } from "@/components/radar-data";
import { ProfileConfig } from "@/components/profile-config";
import { type BriefCoverageConnector, type RadarBrief, type RadarConnector } from "@/lib/radar/brief";
import type { RadarRetrieval, RadarSignalDetail } from "@/lib/radar/retrieval-contract";

type View = "brief" | "archive" | "config";
type Theme = "dark" | "light";

const NAV_ITEMS: { id: View; label: string; Icon: typeof RadarIcon }[] = [
  { id: "brief", label: "今日简报", Icon: RadarIcon },
  { id: "archive", label: "信号档案", Icon: ArchiveIcon },
  { id: "config", label: "配置后台", Icon: SettingsIcon },
];

const stateTone = { "新出现": "lime", "持续升温": "amber", "重要更新": "blue" } as const;
const SAVED_SIGNALS_KEY = "razer-raders.saved-signals.v1";
const SAVED_SIGNALS_EVENT = "razer-raders:saved-signals-change";
const THEME_KEY = "razer-raders.theme.v1";
const THEME_EVENT = "razer-raders:theme-change";

function subscribeToSavedSignals(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SAVED_SIGNALS_KEY) onStoreChange();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(SAVED_SIGNALS_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SAVED_SIGNALS_EVENT, onStoreChange);
  };
}

function getSavedSignalsSnapshot() {
  return window.localStorage.getItem(SAVED_SIGNALS_KEY) ?? "[]";
}

function getSavedSignalsServerSnapshot() {
  return "[]";
}

function parseSavedSignals(snapshot: string) {
  try {
    const parsed = JSON.parse(snapshot);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === "string") ? parsed : [];
  } catch {
    return [];
  }
}

function subscribeToTheme(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_KEY) onStoreChange();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_EVENT, onStoreChange);
  };
}

function getThemeSnapshot(): Theme {
  return window.localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
}

function getThemeServerSnapshot(): Theme {
  return "dark";
}

export function RadarApp({ brief }: { brief: RadarBrief }) {
  const { assessmentDelay, availability, connectors, coverage, mode, pendingCandidateCount, provenance, publishedAt, signals, topicOptions } = brief;
  const [view, setView] = useState<View>("brief");
  const [selectedId, setSelectedId] = useState<string | null>(signals[0]?.id ?? null);
  const [topic, setTopic] = useState("全部主题");
  const [showPriority, setShowPriority] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const savedSnapshot = useSyncExternalStore(subscribeToSavedSignals, getSavedSignalsSnapshot, getSavedSignalsServerSnapshot);
  const saved = useMemo(() => parseSavedSignals(savedSnapshot), [savedSnapshot]);
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getThemeServerSnapshot);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  const toggleSaved = (id: string) => {
    const current = parseSavedSignals(getSavedSignalsSnapshot());
    const next = current.includes(id) ? current.filter((savedId) => savedId !== id) : [...current, id];
    window.localStorage.setItem(SAVED_SIGNALS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(SAVED_SIGNALS_EVENT));
  };

  const toggleTheme = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem(THEME_KEY, nextTheme);
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  const visibleSignals = useMemo(() => {
    return signals.filter((signal) => {
      const matchesTopic = topic === "全部主题" || signal.topics.includes(topic);
      const matchesPriority = !showPriority || signal.priority === "高优先级";
      return matchesTopic && matchesPriority;
    });
  }, [showPriority, signals, topic]);

  const selectedSignal = signals.find((signal) => signal.id === selectedId) ?? visibleSignals[0] ?? signals[0];

  return (
    <main className="app-shell" data-theme={theme}>
      <AmbientRadar />
      <aside className="sidebar" aria-label="主导航">
        <button className="brand" onClick={() => setView("brief")} type="button">
          <RadarIcon size={22} />
          <span>Razer-Raders</span>
        </button>
        <nav className="nav-list">
          {NAV_ITEMS.map(({ id, label, Icon }) => (
            <button className={`nav-item ${view === id ? "is-active" : ""}`} key={id} onClick={() => setView(id)} type="button">
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="runtime-status"><span className="status-dot" /><span>系统就绪</span></div>
          <small>Asia/Shanghai · 09:00 发布</small>
          <ThemeToggle onToggle={toggleTheme} theme={theme} />
        </div>
      </aside>

      <section className="mobile-header">
        <button className="mobile-brand" onClick={() => setView("brief")} type="button"><RadarIcon size={20} /> Razer-Raders</button>
        <div className="mobile-actions">
          <ThemeToggle compact onToggle={toggleTheme} theme={theme} />
          {view === "brief" && <button aria-label="打开筛选条件" className="icon-button" onClick={() => setFilterOpen(true)} type="button"><MenuIcon /></button>}
        </div>
      </section>

      <nav className="mobile-nav" aria-label="移动端主导航">
        {NAV_ITEMS.map(({ id, label, Icon }) => <button className={view === id ? "is-active" : ""} key={id} onClick={() => setView(id)} type="button"><Icon size={15} /><span>{label}</span></button>)}
      </nav>

      <section className="main-content">
        {view === "brief" && (
          <BriefView
            availability={availability}
            assessmentDelay={assessmentDelay}
            coverage={coverage}
            filterOpen={filterOpen}
            hasAnySignals={signals.length > 0}
            mode={mode}
            onCloseFilter={() => setFilterOpen(false)}
            onSelectSignal={(id) => setSelectedId(id)}
            onPageChange={(nextPageIndex) => {
              const page = getBriefPage(visibleSignals, nextPageIndex);
              setPageIndex(page.pageIndex);
              setSelectedId(page.signals[0]?.id ?? null);
            }}
            onToggleSaved={toggleSaved}
            pendingCandidateCount={pendingCandidateCount}
            provenance={provenance}
            publishedAt={publishedAt}
            saved={saved}
            selectedSignal={selectedSignal}
            showPriority={showPriority}
            pageIndex={pageIndex}
            signals={visibleSignals}
            topic={topic}
            onTogglePriority={() => { setShowPriority((value) => !value); setPageIndex(0); }}
            onTopicChange={(nextTopic) => { setTopic(nextTopic); setPageIndex(0); }}
            topicOptions={topicOptions}
          />
        )}
        {view === "archive" && <ArchiveView onToggleSaved={toggleSaved} saved={saved} />}
        {view === "config" && <ConfigView connectors={connectors} />}
      </section>
    </main>
  );
}

function formatPublishedAt(value: string) {
  const publishedAt = new Date(value);
  if (Number.isNaN(publishedAt.getTime())) return "等待首份简报发布";

  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "long",
    timeZone: "Asia/Shanghai",
    year: "numeric",
  }).format(publishedAt).replace(",", " ·") + " CST";
}

function ThemeToggle({ compact = false, onToggle, theme }: { compact?: boolean; onToggle: () => void; theme: Theme }) {
  const isDark = theme === "dark";
  const targetLabel = isDark ? "浅色" : "深色";

  return (
    <button aria-label={`切换至${targetLabel}模式`} className={`theme-toggle ${compact ? "is-compact" : ""}`} onClick={onToggle} type="button">
      {isDark ? <MoonIcon size={compact ? 18 : 16} /> : <SunIcon size={compact ? 18 : 16} />}
      {!compact && <><span>界面模式</span><strong>{isDark ? "深色" : "浅色"}</strong></>}
    </button>
  );
}

function BriefView({
  availability,
  assessmentDelay,
  coverage,
  filterOpen,
  hasAnySignals,
  mode,
  onCloseFilter,
  onPageChange,
  onSelectSignal,
  onTogglePriority,
  onToggleSaved,
  pendingCandidateCount,
  provenance,
  publishedAt,
  saved,
  selectedSignal,
  showPriority,
  pageIndex,
  signals: visibleSignals,
  topic,
  onTopicChange,
  topicOptions,
}: {
  availability: RadarBrief["availability"];
  assessmentDelay?: RadarBrief["assessmentDelay"];
  coverage?: readonly BriefCoverageConnector[];
  filterOpen: boolean;
  hasAnySignals: boolean;
  mode: RadarBrief["mode"];
  onCloseFilter: () => void;
  onPageChange: (pageIndex: number) => void;
  onSelectSignal: (id: string) => void;
  onTogglePriority: () => void;
  onToggleSaved: (id: string) => void;
  pendingCandidateCount: number;
  provenance?: RadarBrief["provenance"];
  publishedAt: string;
  saved: string[];
  selectedSignal: Signal | null;
  showPriority: boolean;
  pageIndex: number;
  signals: Signal[];
  topic: string;
  onTopicChange: (topic: string) => void;
  topicOptions: readonly string[];
}) {
  const page = getBriefPage(visibleSignals, pageIndex);
  const presentation = { assessmentDelay, availability, hasPublishedSignals: hasAnySignals, pendingCandidateCount, visibleSignalCount: visibleSignals.length };
  const assessmentBanner = getAssessmentBanner(presentation);

  return (
    <div className="brief-layout">
      <section className="brief-column">
        <header className="page-header">
          <p className="eyeline brief-eyeline"><span>{formatPublishedAt(publishedAt)}</span>{provenance ? <span className="brief-format">{getBriefFormatLabel(provenance.pipelineVersion)}</span> : null}</p>
          <h1>{getBriefHeading(presentation)}</h1>
          <p>从 7 天观察窗口中筛出有证据、可行动的变化。未验证的判断会明确标注。</p>
          {assessmentBanner ? <p className="assessment-banner">{assessmentBanner}</p> : null}
        </header>
        {coverage?.length ? <div className="mobile-coverage"><BriefCoverageSummary coverage={coverage} /></div> : null}

        <div className="signal-list" aria-label="今日雷达短名单">
          {page.signals.length ? page.signals.map((signal) => (
            <div className="signal-cluster" key={signal.id}>
              <SignalRow
                isSelected={signal.id === selectedSignal?.id}
                onClick={() => onSelectSignal(signal.id)}
                signal={signal}
              />
              {signal.id === selectedSignal?.id && <div className="inline-detail"><SignalDetail isSaved={saved.includes(signal.id)} mode={mode} onToggleSaved={() => onToggleSaved(signal.id)} provenance={provenance} signal={signal} /></div>}
            </div>
          )) : <EmptySignals assessmentDelay={assessmentDelay} availability={availability} hasAnySignals={hasAnySignals} onReset={() => onTopicChange("全部主题")} pendingCandidateCount={pendingCandidateCount} />}
        </div>
        {page.pageCount > 1 ? <nav aria-label="日报分页" className="brief-pagination"><button disabled={page.pageIndex === 0} onClick={() => onPageChange(page.pageIndex - 1)} type="button">上一页</button><span>第 {page.pageIndex + 1} / {page.pageCount} 页</span><button disabled={page.pageIndex === page.pageCount - 1} onClick={() => onPageChange(page.pageIndex + 1)} type="button">下一页</button></nav> : null}
      </section>

      <aside className={`filter-drawer ${filterOpen ? "is-open" : ""}`} aria-label="主题筛选">
        <div className="drawer-header"><span>筛选与排序</span><button className="icon-button" onClick={onCloseFilter} type="button"><ArrowLeftIcon /></button></div>
        <FilterControls onTogglePriority={onTogglePriority} onTopicChange={onTopicChange} showPriority={showPriority} topic={topic} topicOptions={topicOptions} />
      </aside>

      <aside className="utility-rail">
        {coverage?.length ? <BriefCoverageSummary coverage={coverage} /> : null}
        <section className="utility-section today-note">
          <div className="rail-title"><span>今日快照</span></div>
          <p><strong>整体信号强度：</strong>适中偏强</p>
          <p>推理模型、Agent 工具链与评估方法出现连续变化。</p>
          <hr />
          <p><strong>注意噪声：</strong>工具发布的讨论速度上升，不等于生产可用。</p>
        </section>
        <section className="utility-section desktop-filter">
          <div className="rail-title"><span>主题过滤</span><FilterIcon size={16} /></div>
          <FilterControls onTogglePriority={onTogglePriority} onTopicChange={onTopicChange} showPriority={showPriority} topic={topic} topicOptions={topicOptions} />
        </section>
      </aside>
    </div>
  );
}

function BriefCoverageSummary({ coverage }: { coverage: readonly BriefCoverageConnector[] }) {
  return <section aria-label="本期来源覆盖度" className="utility-section">
    <div className="rail-title"><span>来源覆盖度</span><small>发布时快照</small></div>
    <p className="coverage-summary">{getBriefCoverageLabel(coverage)}</p>
    <small className="coverage-note">未启用来源不计入本期覆盖。</small>
    <details aria-label="查看本期来源状态" className="coverage-details">
      <summary>查看来源状态</summary>
      <div className="coverage-list">
        {coverage.map((connector) => <div className="coverage-row" key={connector.connectorId}><span><i className={`connector-dot ${connector.tone}`} />{connector.name}</span><b className={connector.tone}>{connector.status}</b></div>)}
      </div>
    </details>
  </section>;
}

function SignalRow({ isSelected, onClick, signal }: { isSelected: boolean; onClick: () => void; signal: Signal }) {
  return (
    <article className={`signal-row ${isSelected ? "is-selected" : ""}`}>
      <button className="signal-main" onClick={onClick} type="button">
        <span className="signal-index">{signal.index}</span>
        <span className="signal-tags">
          <span className={`state-label ${stateTone[signal.state]}`}>{signal.state}</span>
          <span className={`priority-label ${signal.priority === "高优先级" ? "high" : ""}`}>{signal.priority}</span>
        </span>
        <span className="signal-copy">
          <strong>{signal.title}</strong>
          <span>{signal.summary}</span>
          <span className="source-line">{signal.sources.map((source) => <em key={source}>{source}</em>)}</span>
          <span className="signal-insights">
            <span><b>Builder</b><strong>{signal.builderValue}</strong></span>
            <span><b>产品机会</b><strong>{signal.productOpportunity}</strong></span>
          </span>
        </span>
      </button>
    </article>
  );
}

function SignalDetail({ isSaved, mode, onToggleSaved, provenance, showEvidenceExcerpts = false, signal }: { isSaved: boolean; mode: RadarBrief["mode"]; onToggleSaved: () => void; provenance?: RadarBrief["provenance"]; showEvidenceExcerpts?: boolean; signal: Signal }) {
  return (
    <div className="detail-inner">
      <div className="detail-grid">
        <div className="assessment-column">
          {getSignalCardSections(signal).map((section) => <AssessmentSection {...section} key={section.title} />)}
        </div>
        <div className="evidence-column">
          <div className="detail-verdicts">
            <div><small>Builder 价值</small><strong>{signal.builderValue}</strong></div>
            <div><small>产品机会</small><strong>{signal.productOpportunity}</strong></div>
          </div>
          <section className="evidence-section">
            <div className="section-heading"><span>来源与证据</span><span className="evidence-actions"><small>一手资料优先</small><button aria-label={isSaved ? "取消保存" : "保存信号"} className={`detail-save ${isSaved ? "is-saved" : ""}`} onClick={onToggleSaved} type="button">{isSaved ? "已保存" : "保存"}</button></span></div>
            {signal.evidence.map((evidence) => <div className="evidence-record" key={`${evidence.url}:${evidence.label}`}>
              <a className="evidence-link" href={evidence.url} rel="noreferrer" target="_blank">
                <span><small>{evidence.source}</small>{evidence.label}</span><ExternalIcon size={15} />
              </a>
              {showEvidenceExcerpts ? evidence.excerpts?.map((excerpt, index) => <blockquote className="evidence-excerpt" key={`${evidence.url}:${index}`}>{excerpt}</blockquote>) : null}
            </div>)}
          </section>
          <p className="provenance">评估依据：{provenance ? `${provenance.configurationVersion} · ${provenance.rankingPolicyVersion} · ${provenance.modelRuntimeId} · ${provenance.pipelineVersion} · 已发布 Brief Snapshot` : mode === "archive" ? "等待已发布 Snapshot 的 Pipeline Provenance" : "示例数据"}</p>
        </div>
      </div>
    </div>
  );
}

function AssessmentSection({ body, citations = [], isRisk = false, isSelectionReason = false, title }: { body: string; citations?: readonly string[]; isRisk?: boolean; isSelectionReason?: boolean; title: string }) {
  return <section className={`assessment-section ${isRisk ? "risk" : ""} ${isSelectionReason ? "selection-reason" : ""}`}><h3>{title}</h3><p>{body}</p>{citations.length > 0 ? <span className="section-citations">证据 {citations.map((citation) => <a href={citation} key={citation} rel="noreferrer" target="_blank">↗</a>)}</span> : null}</section>;
}

function FilterControls({ onTogglePriority, onTopicChange, showPriority, topic, topicOptions }: { onTogglePriority: () => void; onTopicChange: (topic: string) => void; showPriority: boolean; topic: string; topicOptions: readonly string[] }) {
  return <div className="filter-controls">
    <label>
      <span>主题</span>
      <select onChange={(event) => onTopicChange(event.target.value)} value={topic}>
        {topicOptions.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
    <button className={`switch-row ${showPriority ? "is-on" : ""}`} onClick={onTogglePriority} type="button"><span>只看高优先级</span><i /></button>
  </div>;
}

type ArchiveFilters = {
  from: string;
  query: string;
  signalType: string;
  subject: string;
  to: string;
  topic: string;
};

const ARCHIVE_PAGE_SIZE = 10;
const emptyArchiveFilters: ArchiveFilters = { from: "", query: "", signalType: "", subject: "", to: "", topic: "" };
const signalTypeOptions = [
  { label: "全部类型", value: "" },
  { label: "工具", value: "tool" },
  { label: "模型", value: "model" },
  { label: "概念", value: "concept" },
  { label: "项目", value: "project" },
  { label: "趋势", value: "trend" },
] as const;

function buildArchiveSearchParams(filters: ArchiveFilters, offset: number) {
  const params = new URLSearchParams({ limit: String(ARCHIVE_PAGE_SIZE), offset: String(offset) });
  if (filters.query.trim()) params.set("query", filters.query.trim());
  if (filters.from) params.set("from", new Date(`${filters.from}T00:00:00.000+08:00`).toISOString());
  if (filters.to) params.set("to", new Date(`${filters.to}T23:59:59.999+08:00`).toISOString());
  if (filters.topic) params.set("topic", filters.topic);
  if (filters.signalType) params.set("signalType", filters.signalType);
  if (filters.subject.trim()) params.set("subject", filters.subject.trim());
  return params;
}

function isRadarRetrieval(value: unknown): value is RadarRetrieval {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RadarRetrieval>;
  return (candidate.availability === "empty" || candidate.availability === "results")
    && Array.isArray(candidate.results)
    && typeof candidate.pagination?.hasMore === "boolean"
    && typeof candidate.pagination?.limit === "number"
    && typeof candidate.pagination?.offset === "number";
}

function isRadarSignalDetail(value: unknown): value is RadarSignalDetail {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RadarSignalDetail>;
  return typeof candidate.id === "string"
    && typeof candidate.title === "string"
    && typeof candidate.publishedAt === "string"
    && Array.isArray(candidate.evidence)
    && !!candidate.provenance
    && typeof candidate.provenance === "object";
}

function archiveSignalToSignal(signal: RadarSignalDetail): Signal {
  return {
    ...signal,
    index: "",
    sources: [...new Set(signal.evidence.map((evidence) => evidence.source))],
  };
}

function formatArchiveDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知日期";
  return new Intl.DateTimeFormat("zh-CN", { day: "2-digit", month: "2-digit", timeZone: "Asia/Shanghai", year: "numeric" }).format(date);
}

function ArchiveView({ onToggleSaved, saved }: { onToggleSaved: (id: string) => void; saved: string[] }) {
  const [draftFilters, setDraftFilters] = useState<ArchiveFilters>(emptyArchiveFilters);
  const [filters, setFilters] = useState<ArchiveFilters>(emptyArchiveFilters);
  const [filterError, setFilterError] = useState("");
  const [offset, setOffset] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);
  const [retrieval, setRetrieval] = useState<RadarRetrieval | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RadarSignalDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<"error" | "idle" | "loading" | "ready">("idle");
  const [detailError, setDetailError] = useState("");
  const [detailRetryNonce, setDetailRetryNonce] = useState(0);
  const [status, setStatus] = useState<"error" | "initial-loading" | "loading" | "ready">("initial-loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    void fetch(`/api/retrieval?${buildArchiveSearchParams(filters, offset)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const detail = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : "Archive 暂时无法读取。";
          throw new Error(detail);
        }
        if (!isRadarRetrieval(payload)) throw new Error("Archive 返回了无法识别的数据。");
        setRetrieval(payload);
        setSelectedId(null);
        setDetail(null);
        setDetailStatus("idle");
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setErrorMessage(error instanceof Error ? error.message : "Archive 暂时无法读取。");
        setStatus("error");
      });

    return () => controller.abort();
  }, [filters, offset, retryNonce]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();

    void fetch(`/api/retrieval/detail?id=${encodeURIComponent(selectedId)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : "历史 Signal Card 暂时无法读取。";
          throw new Error(message);
        }
        if (!isRadarSignalDetail(payload) || payload.id !== selectedId) throw new Error("历史 Signal Card 返回了无法识别的数据。");
        setDetail(payload);
        setDetailStatus("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setDetailError(error instanceof Error ? error.message : "历史 Signal Card 暂时无法读取。");
        setDetailStatus("error");
      });

    return () => controller.abort();
  }, [detailRetryNonce, selectedId]);

  const closeDetail = () => {
    setSelectedId(null);
    setDetail(null);
    setDetailError("");
    setDetailStatus("idle");
  };
  const openDetail = (signalId: string) => {
    if (selectedId === signalId) {
      closeDetail();
      return;
    }
    setSelectedId(signalId);
    setDetail(null);
    setDetailError("");
    setDetailStatus("loading");
  };

  const updateFilter = (name: keyof ArchiveFilters, value: string) => {
    setDraftFilters((current) => ({ ...current, [name]: value }));
  };
  const submitFilters = () => {
    if (draftFilters.from && draftFilters.to && draftFilters.from > draftFilters.to) {
      setFilterError("开始日期不能晚于结束日期。");
      return;
    }
    setFilterError("");
    setFilters({ ...draftFilters });
    setOffset(0);
    closeDetail();
    setStatus("loading");
  };
  const resetFilters = () => {
    setDraftFilters(emptyArchiveFilters);
    setFilters(emptyArchiveFilters);
    setFilterError("");
    setOffset(0);
    closeDetail();
    setStatus("loading");
    setRetryNonce((value) => value + 1);
  };

  const resultStart = offset + 1;
  const resultEnd = offset + (retrieval?.results.length ?? 0);

  return <section className="simple-page archive-page">
    <header className="page-header"><p className="eyeline">Radar Archive · 已发布历史</p><h1>在信号与证据中回看</h1><p>从已发布 Brief Snapshot 检索历史 Radar Signal，并按日期与领域条件缩小结果。</p></header>
    <form className="archive-filter" onSubmit={(event) => { event.preventDefault(); submitFilters(); }}>
      <label className="archive-search"><span>搜索</span><span className="archive-input"><SearchIcon size={17} /><input onChange={(event) => updateFilter("query", event.target.value)} placeholder="搜索模型、工具、概念…" value={draftFilters.query} /></span></label>
      <div className="archive-filter-grid">
        <label><span>开始日期</span><input max={draftFilters.to || undefined} onChange={(event) => updateFilter("from", event.target.value)} type="date" value={draftFilters.from} /></label>
        <label><span>结束日期</span><input min={draftFilters.from || undefined} onChange={(event) => updateFilter("to", event.target.value)} type="date" value={draftFilters.to} /></label>
        <label><span>Topic Tag</span><input onChange={(event) => updateFilter("topic", event.target.value)} placeholder="如 开发工具" value={draftFilters.topic} /></label>
        <label><span>Signal Type</span><select onChange={(event) => updateFilter("signalType", event.target.value)} value={draftFilters.signalType}>{signalTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="archive-subject"><span>Radar Subject</span><input onChange={(event) => updateFilter("subject", event.target.value)} placeholder="如 github:openai/codex" value={draftFilters.subject} /></label>
      </div>
      {filterError ? <p className="archive-filter-error" role="alert">{filterError}</p> : null}
      <div className="archive-filter-actions"><button className="secondary-button" onClick={resetFilters} type="button">清除条件</button><button className="primary-button" type="submit">检索 Archive</button></div>
    </form>

    <div aria-live="polite" className="archive-status">
      {status === "initial-loading" ? <div className="empty-state archive-state"><RadarIcon size={28} /><h2>正在读取 Radar Archive</h2><p>正在载入已发布的历史 Radar Signal…</p></div> : null}
      {status === "loading" ? <div className="empty-state archive-state"><RadarIcon size={28} /><h2>正在更新检索结果</h2><p>正在应用搜索、筛选与分页条件…</p></div> : null}
      {status === "error" ? <div className="empty-state archive-state is-error"><RadarIcon size={28} /><h2>无法读取 Radar Archive</h2><p>{errorMessage}</p><button className="secondary-button" onClick={() => { setStatus("loading"); setRetryNonce((value) => value + 1); }} type="button">重新读取</button></div> : null}
      {status === "ready" && retrieval?.availability === "empty" ? <div className="empty-state archive-state"><ArchiveIcon size={28} /><h2>没有匹配的历史信号</h2><p>调整关键词、日期或分类条件后再试。</p><button className="secondary-button" onClick={resetFilters} type="button">清除筛选</button></div> : null}
    </div>

    {status === "ready" && retrieval?.availability === "results" ? <>
      <p className="archive-result-summary">当前显示第 {resultStart}–{resultEnd} 项历史结果</p>
      <div className="archive-results">{retrieval.results.map((signal) => {
        const isSelected = selectedId === signal.id;
        return <div className="archive-result" key={signal.id}>
          <button aria-expanded={isSelected} className={`archive-row ${isSelected ? "is-selected" : ""}`} onClick={() => openDetail(signal.id)} type="button">
            <span className="archive-date">{formatArchiveDate(signal.publishedAt)}</span>
            <span className="archive-copy"><strong>{signal.title}</strong><span>{signal.summary}</span><small>{signal.subject.title} · {signal.signalType} · {signal.topics.join(" · ")} · {signal.state} · {signal.evidence.length} 条证据</small></span>
            <span className="archive-right">{saved.includes(signal.id) ? "已保存" : signal.priority}<ChevronIcon size={16} /></span>
          </button>
          {isSelected ? <div aria-live="polite" className="archive-detail">
            {detailStatus === "loading" ? <div className="archive-detail-state"><RadarIcon size={22} /><h2>正在读取历史 Signal Card</h2><p>正在从已发布 Brief Snapshot 载入冻结详情…</p></div> : null}
            {detailStatus === "error" ? <div className="archive-detail-state is-error"><RadarIcon size={22} /><h2>无法读取历史 Signal Card</h2><p>{detailError}</p><div className="archive-detail-actions"><button className="secondary-button" onClick={closeDetail} type="button">返回结果列表</button><button className="primary-button" onClick={() => { setDetailStatus("loading"); setDetailError(""); setDetailRetryNonce((value) => value + 1); }} type="button">重新读取</button></div></div> : null}
            {detailStatus === "ready" && detail ? <>
              <header className="archive-detail-header"><div><span>{formatArchiveDate(detail.publishedAt)} · 已发布快照</span><h2>{detail.title}</h2><p>{detail.summary}</p></div><button className="secondary-button" onClick={closeDetail} type="button"><ArrowLeftIcon size={15} />返回结果列表</button></header>
              <SignalDetail isSaved={saved.includes(detail.id)} mode="archive" onToggleSaved={() => onToggleSaved(detail.id)} provenance={detail.provenance} showEvidenceExcerpts signal={archiveSignalToSignal(detail)} />
            </> : null}
          </div> : null}
        </div>;
      })}</div>
      <nav aria-label="Radar Archive 分页" className="brief-pagination"><button disabled={offset === 0} onClick={() => { closeDetail(); setStatus("loading"); setOffset(Math.max(0, offset - ARCHIVE_PAGE_SIZE)); }} type="button">上一页</button><span>第 {Math.floor(offset / ARCHIVE_PAGE_SIZE) + 1} 页</span><button disabled={!retrieval.pagination.hasMore} onClick={() => { closeDetail(); setStatus("loading"); setOffset(offset + ARCHIVE_PAGE_SIZE); }} type="button">下一页</button></nav>
    </> : null}
  </section>;
}

function ConfigView({ connectors }: { connectors: readonly RadarConnector[] }) {
  return <ProfileConfig connectors={connectors} />;
}

function EmptySignals({ assessmentDelay, availability, hasAnySignals, onReset, pendingCandidateCount }: { assessmentDelay?: RadarBrief["assessmentDelay"]; availability: RadarBrief["availability"]; hasAnySignals: boolean; onReset: () => void; pendingCandidateCount: number }) {
  if (!hasAnySignals) {
    if (availability === "assessment-delayed") {
      return <div className="empty-state"><RadarIcon size={30} /><h2>评估暂时延迟</h2><p>{assessmentDelay?.detail ?? "配置的 Model Runtime 暂不可用。"}</p><p>不会切换到其他模型，也不会发布没有依据的半成品日报。</p></div>;
    }
    if (availability === "evaluating") {
      return <div className="empty-state"><RadarIcon size={30} /><h2>正在评估 {pendingCandidateCount} 个候选</h2><p>这些 Candidate 已进入 Radar Archive；完成证据补充、排序和发布校验后，才会出现在 Daily Brief。</p></div>;
    }

    return <div className="empty-state"><RadarIcon size={30} /><h2>首份日报尚未发布</h2><p>完成采集、筛选和发布后，值得关注的 AI 信号会显示在这里。</p></div>;
  }

  return <div className="empty-state"><RadarIcon size={30} /><h2>没有匹配的高价值信号</h2><p>当前筛选没有保留候选；这比为了凑数展示低质量内容更可信。</p><button className="secondary-button" onClick={onReset} type="button">清除主题筛选</button></div>;
}

function AmbientRadar() { return <div className="ambient-radar" aria-hidden="true"><i /><i /><i /><span /><span /><span /></div>; }
