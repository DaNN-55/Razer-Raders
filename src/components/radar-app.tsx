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
  PulseIcon,
  RadarIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
} from "@/components/icons";
import { getAssessmentBanner, getBriefCoverageLabel, getBriefFormatLabel, getBriefHeading, getBriefPage, getSignalCardSections } from "@/components/brief-presentation";
import { type Signal } from "@/components/radar-data";
import { ProfileConfig } from "@/components/profile-config";
import { type BriefCoverageConnector, type RadarBrief, type RadarConnector } from "@/lib/radar/brief";

type View = "brief" | "archive" | "health" | "config";
type Theme = "dark" | "light";

const NAV_ITEMS: { id: View; label: string; Icon: typeof RadarIcon }[] = [
  { id: "brief", label: "今日简报", Icon: RadarIcon },
  { id: "archive", label: "信号档案", Icon: ArchiveIcon },
  { id: "health", label: "来源健康", Icon: PulseIcon },
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
        {view === "archive" && <ArchiveView onSelect={(id) => { setSelectedId(id); setView("brief"); }} saved={saved} signals={signals} topicOptions={topicOptions} />}
        {view === "health" && <HealthView connectors={connectors} />}
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

function SignalDetail({ isSaved, mode, onToggleSaved, provenance, signal }: { isSaved: boolean; mode: RadarBrief["mode"]; onToggleSaved: () => void; provenance?: RadarBrief["provenance"]; signal: Signal }) {
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
            {signal.evidence.map((evidence) => (
              <a className="evidence-link" href={evidence.url} key={evidence.label} rel="noreferrer" target="_blank">
                <span><small>{evidence.source}</small>{evidence.label}</span><ExternalIcon size={15} />
              </a>
            ))}
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

function ConnectorHealth({ compact = false, connectors }: { compact?: boolean; connectors: readonly RadarConnector[] }) {
  return <div className={`connector-list ${compact ? "is-compact" : ""}`}>
    {connectors.map((connector) => <div className="connector-row" key={connector.name}><span><i className={`connector-dot ${connector.tone}`} />{connector.name}{!compact && <small>{connector.detail ?? connector.caption}</small>}</span><b className={connector.tone}>{connector.status}</b></div>)}
  </div>;
}

function ArchiveView({ onSelect, saved, signals, topicOptions }: { onSelect: (id: string) => void; saved: string[]; signals: readonly Signal[]; topicOptions: readonly string[] }) {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("全部主题");
  const results = useMemo(() => signals.filter((signal) => {
    const candidate = `${signal.title} ${signal.summary} ${signal.topics.join(" ")}`.toLowerCase();
    return candidate.includes(query.toLowerCase()) && (topic === "全部主题" || signal.topics.includes(topic));
  }), [query, signals, topic]);

  return <section className="simple-page archive-page">
    <header className="page-header"><p className="eyeline">Radar Archive · 示例档案</p><h1>在信号与证据中回看</h1><p>按关键词、时间与主题定位过往判断。MVP 使用结构化筛选与全文检索。</p></header>
    <div className="archive-tools"><label><SearchIcon size={17} /><input onChange={(event) => setQuery(event.target.value)} placeholder="搜索模型、工具、概念…" value={query} /></label><select onChange={(event) => setTopic(event.target.value)} value={topic}>{topicOptions.map((option) => <option key={option}>{option}</option>)}</select></div>
    <div className="archive-results">{results.map((signal) => <button className="archive-row" key={signal.id} onClick={() => onSelect(signal.id)} type="button"><span className="archive-date">08·12</span><span><strong>{signal.title}</strong><small>{signal.topics.join(" · ")} · {signal.state} · {signal.evidence.length} 条证据</small></span><span className="archive-right">{saved.includes(signal.id) ? "已保存" : signal.priority}<ChevronIcon size={16} /></span></button>)}</div>
  </section>;
}

function HealthView({ connectors }: { connectors: readonly RadarConnector[] }) {
  const unavailable = connectors.filter((connector) => connector.status !== "新鲜");

  return <section className="simple-page health-page">
    <header className="page-header"><p className="eyeline">Connector Health · 实例状态</p><h1>每一面雷达，都应说明新鲜度</h1><p>来源不可用时仍可发布简报，但会明确显示采集状态与最近成功时间。</p></header>
    <ConnectorHealth connectors={connectors} />
    <section className="health-note"><h2>当前状态说明</h2><p>{unavailable.length ? `尚未就绪的来源：${unavailable.map(({ name, status }) => `${name}（${status}）`).join("、")}。这些来源不会被当作已完整扫描。` : "所有已配置来源均已完成最近一次采集。"}</p></section>
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
