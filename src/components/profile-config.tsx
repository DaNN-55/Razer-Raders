"use client";

import { useState } from "react";
import type { RadarConnector } from "@/lib/radar/brief";
import type { RadarProfile, RadarProfileConfig } from "@/lib/radar/radar-profile";

const ADMIN_TOKEN_KEY = "razer-raders.admin-token.v1";
const CONNECTORS: { id: RadarProfileConfig["enabledConnectorIds"][number]; label: string }[] = [
  { id: "github-trending", label: "GitHub Trending" },
  { id: "hugging-face-trending", label: "Hugging Face" },
  { id: "show-hn", label: "Show HN" },
];

type ProfilePayload = { active: RadarProfile | null; draft?: RadarProfileConfig; versions: readonly RadarProfile[] };
type ManualCollectionPayload = { connectorResults?: readonly { status: "failed" | "succeeded" }[]; status: "already-running" | "failed" | "succeeded" };

function configuration(profile: RadarProfileConfig): RadarProfileConfig {
  return {
    collectionIntervalMs: profile.collectionIntervalMs,
    enabledConnectorIds: profile.enabledConnectorIds,
    excludeTerms: profile.excludeTerms,
    includeTerms: profile.includeTerms,
    runtime: profile.runtime,
  };
}

function responseError(value: unknown) {
  return value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : "配置请求失败。";
}

export function ProfileConfig({ connectors }: { connectors: readonly RadarConnector[] }) {
  const [token, setToken] = useState(() => typeof window === "undefined" ? "" : window.sessionStorage.getItem(ADMIN_TOKEN_KEY) ?? "");
  const [profile, setProfile] = useState<RadarProfileConfig | null>(null);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [versions, setVersions] = useState<readonly RadarProfile[]>([]);
  const [models, setModels] = useState<readonly string[]>([]);
  const [message, setMessage] = useState("请输入管理员 Token 后加载配置。");
  const [pending, setPending] = useState(false);

  const request = async (path: string, method: "GET" | "POST" | "PUT", body?: unknown) => {
    const response = await fetch(path, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      method,
    });
    const value = await response.json() as unknown;
    if (!response.ok) throw new Error(responseError(value));
    return value;
  };

  const load = async () => {
    setPending(true);
    try {
      window.sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
      const value = await request("/api/profile", "GET") as ProfilePayload;
      const editableProfile = value.active ?? value.draft;
      if (!editableProfile) throw new Error("未返回可编辑的 Radar Profile。");
      setProfile(editableProfile);
      setActiveProfileId(value.active?.id ?? null);
      setVersions(value.versions);
      setMessage(value.active ? `已加载 ${value.active.id}。` : "尚未启用 Profile：请完成真实连接测试后保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法加载配置。");
    } finally {
      setPending(false);
    }
  };

  const update = (change: (value: RadarProfileConfig) => RadarProfileConfig) => {
    setProfile((current) => current ? change(configuration(current)) : current);
  };

  const draft = () => profile ? configuration(profile) : null;

  const testRuntime = async (discover = false) => {
    const value = draft();
    if (!value) return;
    setPending(true);
    try {
      const result = await request(discover ? "/api/profile/models" : "/api/profile/test", "POST", value) as { models?: readonly string[] };
      if (result.models) setModels(result.models);
      setMessage(discover ? "已发现 Ollama 服务中的模型。" : "连接与模型校验通过，尚未保存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "运行时测试失败。");
    } finally {
      setPending(false);
    }
  };

  const save = async () => {
    const value = draft();
    if (!value) return;
    setPending(true);
    try {
      const result = await request("/api/profile", "PUT", value) as { active: RadarProfile };
      setProfile(result.active);
      setActiveProfileId(result.active.id);
      setVersions((current) => [result.active, ...current.filter((version) => version.id !== result.active.id)]);
      setMessage(`已保存 ${result.active.id}，下一 Collection Cycle 生效。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法保存配置。");
    } finally {
      setPending(false);
    }
  };

  const rollback = async (id: string) => {
    setPending(true);
    try {
      const result = await request("/api/profile/rollback", "POST", { id }) as { active: RadarProfile };
      setProfile(result.active);
      setActiveProfileId(result.active.id);
      setMessage(`已回滚 ${result.active.id}，下一 Collection Cycle 生效。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "无法回滚配置。");
    } finally {
      setPending(false);
    }
  };

  const collectNow = async () => {
    setPending(true);
    try {
      const result = await request("/api/profile/collect", "POST") as ManualCollectionPayload;
      if (result.status === "already-running") {
        setMessage("已有采集正在执行，未启动重复任务。");
      } else {
        const succeeded = result.connectorResults?.filter((connector) => connector.status === "succeeded").length ?? 0;
        setMessage(result.status === "succeeded" ? `手动采集完成：${succeeded} 个来源成功。结果将进入后续评估，不改写今日 Brief。` : "手动采集完成，但所有来源均失败。请查看服务日志。");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "手动采集失败。");
    } finally {
      setPending(false);
    }
  };

  return <section className="config-page">
    <header className="page-header config-header"><div><p className="eyeline">单一 Radar Profile</p><h1>Radar Profile</h1><p>保存后的设置会在下一次 Worker 执行时生效。密钥始终由部署环境保管。</p></div>{activeProfileId ? <span className="version-select">{activeProfileId}</span> : null}</header>
    <div className="config-layout"><div className="settings-form">
      <fieldset><legend><span>00</span>管理员认证</legend><div className="admin-token-row"><input autoComplete="current-password" onChange={(event) => setToken(event.target.value)} placeholder="RADAR_ADMIN_TOKEN" type="password" value={token} /><button className="secondary-button" disabled={pending || !token} onClick={() => { void load(); }} type="button">加载配置</button></div><p className="config-note">Token 仅保留在当前浏览器会话，不写入 Profile 或发送给模型服务。</p></fieldset>
      {profile ? <>
        <fieldset><legend><span>01</span>来源连接器</legend><div className="setting-stack">{CONNECTORS.map(({ id, label }) => <label className="toggle-row" key={id}><span><strong>{label}</strong><small>{connectors.find((connector) => connector.name === label)?.status ?? "等待下次采集"}</small></span><input checked={profile.enabledConnectorIds.includes(id)} className="toggle" onChange={(event) => update((value) => ({ ...value, enabledConnectorIds: event.target.checked ? [...value.enabledConnectorIds, id] : value.enabledConnectorIds.filter((connector) => connector !== id) }))} type="checkbox" /></label>)}</div></fieldset>
        <fieldset><legend><span>02</span>筛选与采集</legend><div className="dual-fields"><label>采集间隔（分钟）<input min="1" onChange={(event) => update((value) => ({ ...value, collectionIntervalMs: Number(event.target.value) * 60_000 }))} type="number" value={profile.collectionIntervalMs / 60_000} /></label><label>每轮评估上限<input min="1" onChange={(event) => update((value) => ({ ...value, runtime: { ...value.runtime, maxAssessmentsPerCycle: Number(event.target.value) } }))} type="number" value={profile.runtime.maxAssessmentsPerCycle} /></label><label>模型并发<input min="1" onChange={(event) => update((value) => ({ ...value, runtime: { ...value.runtime, modelConcurrency: Number(event.target.value) } }))} type="number" value={profile.runtime.modelConcurrency} /></label><label>每轮预算（秒）<input min="60" onChange={(event) => update((value) => ({ ...value, runtime: { ...value.runtime, cycleBudgetSeconds: Number(event.target.value) } }))} type="number" value={profile.runtime.cycleBudgetSeconds} /></label></div><div className="dual-fields"><label>包含词（逗号分隔）<input onChange={(event) => update((value) => ({ ...value, includeTerms: event.target.value.split(",").map((term) => term.trim()).filter(Boolean) }))} value={profile.includeTerms.join(", ")} /></label><label>排除词（逗号分隔）<input onChange={(event) => update((value) => ({ ...value, excludeTerms: event.target.value.split(",").map((term) => term.trim()).filter(Boolean) }))} value={profile.excludeTerms.join(", ")} /></label></div><div className="form-actions"><button className="secondary-button" disabled={pending} onClick={() => { void collectNow(); }} type="button">立即采集</button></div><p className="config-note">立即采集只更新候选与评估队列，不发布或改写当天 Daily Brief。</p></fieldset>
        <fieldset><legend><span>03</span>模型运行时</legend><div className="runtime-form"><label>运行时<select onChange={(event) => update((value) => ({ ...value, runtime: { ...value.runtime, kind: event.target.value as "compatible" | "ollama" } }))} value={profile.runtime.kind}><option value="ollama">Ollama（本机运行）</option><option value="compatible">Compatible API（证据片段将发送至配置服务）</option></select></label><label>服务地址<input onChange={(event) => update((value) => ({ ...value, runtime: { ...value.runtime, baseUrl: event.target.value } }))} value={profile.runtime.baseUrl} /></label><label>模型{profile.runtime.kind === "ollama" ? <select onChange={(event) => update((value) => ({ ...value, runtime: { ...value.runtime, model: event.target.value } }))} value={profile.runtime.model}>{models.length ? models.map((model) => <option key={model}>{model}</option>) : <option>{profile.runtime.model}</option>}</select> : <input onChange={(event) => update((value) => ({ ...value, runtime: { ...value.runtime, model: event.target.value } }))} value={profile.runtime.model} />}</label></div><div className="form-actions">{profile.runtime.kind === "ollama" ? <button className="secondary-button" disabled={pending} onClick={() => { void testRuntime(true); }} type="button">发现 Ollama 模型</button> : null}<button className="secondary-button" disabled={pending} onClick={() => { void testRuntime(); }} type="button">真实连接测试</button></div><p className="config-note">Compatible API Key 只读取部署环境；界面不会展示或保存它。</p></fieldset>
        <div className="form-actions"><button className="primary-button" disabled={pending} onClick={() => { void save(); }} type="button">校验并保存新版本</button></div>
      </> : null}
    </div><aside className="config-rail"><section className="config-rail-section"><h2>操作状态</h2><p className={message.includes("失败") || message.includes("错误") || message.includes("需要") ? "testing" : ""}>{message}</p></section>{versions.length ? <section className="config-rail-section"><h2>配置版本</h2><ol className="version-history">{versions.map((version) => <li className={version.id === activeProfileId ? "current" : ""} key={version.id}><span>{version.id}</span><small>{version.runtime.kind} · {version.runtime.model}</small>{version.id !== activeProfileId ? <button className="secondary-button" disabled={pending} onClick={() => { void rollback(version.id); }} type="button">回滚</button> : null}</li>)}</ol></section> : null}</aside></div>
  </section>;
}
