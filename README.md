# Razer-Raders

Razer-Raders 是面向独立开发者和 AI 产品 Builder 的自托管 AI Radar：从公开开发者来源中发现值得关注的 AI 发展，保留可追溯的 Source Evidence，经过后台评估后生成中文 Daily Brief，帮助你决定一个信号应该「试用、学习、跟进，还是跳过」。

项目免费、开源，不依赖中心化 SaaS。每个 Self-Hosted Instance 使用自己的数据库、来源配置和模型运行时；默认不向中心服务发送使用数据、采集证据、Prompt 或模型输出。

## 能做什么

- 从 GitHub Trending、Hugging Face Trending、Hacker News Show HN 采集公开内容。
- 在滚动七天 Observation Window 内合并、去重、筛选并排名 Radar Signal。
- 对候选信号执行证据优先的后台 Assessment Workflow，保留来源、摘要和评估溯源。
- 每天 09:00 和 17:00（Asia/Shanghai）发布 Brief Snapshot；评估延迟会透明展示，不会静默替换模型或改写已发布 Brief。
- 提供 Public Brief、Radar Archive、主题筛选、优先级筛选、收藏和深色/浅色模式。
- 提供响应式 Mobile Reading Experience，支持通过 URL 保留 Archive View State。
- 提供 Profile Configuration Console，可配置来源连接器、包含/排除词、评估并发和模型运行时。
- 支持 Ollama 本地模型，以及部署者自己提供的 OpenAI-compatible Chat Completions API。
- 通过 PostgreSQL 保存 Radar Archive、证据摘要、配置版本、评估任务和 Brief Provenance。

## 工作流

```text
Source Connectors
        ↓
Candidates → Candidate Filter → Evidence Enrichment
                                      ↓
                              Task Worker / Model Runtime
                                      ↓
                         Publication Validation / Ranking
                                      ↓
                            Immutable Brief Snapshot
                                      ↓
                           Web Brief / Radar Archive
```

外部页面、仓库、模型卡和社区讨论都被当作 Untrusted Evidence。采集和证据补充统一经过受限 Fetch Gateway，内容不能向系统发出指令，也不能访问凭据或扩大抓取范围。

## 快速开始

### 前置条件

- Docker Desktop 或支持 Docker Compose 的 Docker 环境
- Node.js 22+、Corepack 和 pnpm 11（仅在本地开发或直接运行脚本时需要）
- 一个模型运行时：本机 Ollama，或一个可访问的 HTTPS OpenAI-compatible API

### 使用 Docker Compose 启动

先在项目根目录准备环境变量。下面的示例使用 Docker Desktop 宿主机上的 Ollama：

```bash
export POSTGRES_PASSWORD='change-this-password'
export RADAR_ADMIN_TOKEN='change-this-admin-token'
export RADAR_MODEL_RUNTIME='ollama'
export RADAR_OLLAMA_BASE_URL='http://host.docker.internal:11434'
export RADAR_OLLAMA_MODEL='qwen3:8b'

docker compose up -d --build
```

启动流程会依次准备 PostgreSQL、执行数据库迁移、启动 Web Service 和 Task Worker。打开 <http://localhost:3000> 查看 Public Brief；配置后台位于页面中的「配置后台」入口。

如果使用外部 OpenAI-compatible API，将模型运行时替换为：

```bash
export RADAR_MODEL_RUNTIME='compatible'
export RADAR_COMPATIBLE_RUNTIME_BASE_URL='https://your-provider.example/v1'
export RADAR_COMPATIBLE_RUNTIME_MODEL='your-model'
export RADAR_COMPATIBLE_RUNTIME_API_KEY='your-api-key'

docker compose up -d --build
```

Compatible API 的密钥只从部署环境读取，不会写入 Radar Profile，也不会发送给模型服务以外的地方。生产环境请使用强密码和强管理员 Token，不要继续使用示例值。

常用运维命令：

```bash
docker compose ps
docker compose logs -f web worker
docker compose down
```

### 本地开发

```bash
pnpm install

export DATABASE_URL='postgresql://razer_raders:local-development-only@127.0.0.1:5432/razer_raders'
export RADAR_ADMIN_TOKEN='local-development-admin-token'

docker compose up -d postgres
pnpm db:migrate
pnpm dev
```

另开一个终端，在同样的环境变量下启动 Worker：

```bash
pnpm worker
```

开发服务器默认运行在 <http://localhost:3001>。如果只需要执行一次采集和评估周期，可以使用：

```bash
RADAR_WORKER_ONCE=true pnpm worker
```

## 配置说明

首次启动后，在「配置后台」输入 `RADAR_ADMIN_TOKEN`，加载并配置当前 Radar Profile。可配置内容包括：

- 启用的 Source Connector
- Candidate 的包含词和排除词
- 每轮评估上限、模型并发和周期预算
- Ollama 或 Compatible API 的地址和模型
- 真实连接测试、Ollama 模型发现、立即采集和延迟 Candidate 重试

配置保存为新的不可变版本，并从下一次 Collection Cycle 起生效。手动采集只更新候选和评估队列，不改写当前已发布 Brief。

### 主要环境变量

| 变量 | 作用 |
| --- | --- |
| `DATABASE_URL` | Web、迁移和 Worker 连接 PostgreSQL 的连接串 |
| `POSTGRES_PASSWORD` | Docker Compose 创建 PostgreSQL 的密码 |
| `POSTGRES_PORT` | Docker Compose 暴露 PostgreSQL 的宿主机端口，默认 `5432` |
| `RADAR_ADMIN_TOKEN` | 配置后台的 Bearer Token；未配置时写操作会禁用 |
| `RADAR_MODEL_RUNTIME` | `ollama` 或 `compatible`，默认 `compatible` |
| `RADAR_OLLAMA_BASE_URL` | Ollama 服务地址 |
| `RADAR_OLLAMA_MODEL` | Ollama 模型名称 |
| `RADAR_COMPATIBLE_RUNTIME_BASE_URL` | OpenAI-compatible API 地址 |
| `RADAR_COMPATIBLE_RUNTIME_MODEL` | 外部 API 使用的模型名称 |
| `RADAR_COMPATIBLE_RUNTIME_API_KEY` | 外部 API 密钥，仅在服务端环境使用 |
| `RADAR_INCLUDE_TERMS` / `RADAR_EXCLUDE_TERMS` | 初始化 Profile 时使用的逗号分隔筛选词 |
| `RADAR_PIPELINE_VERSION` | Assessment Pipeline 版本标识，用于发布溯源 |

## 测试与检查

```bash
pnpm lint
pnpm test
pnpm build
```

端到端测试会自动创建独立的 PostgreSQL 容器，并验证 Brief Publication 与浏览器流程：

```bash
pnpm test:e2e
```

还可以运行浏览器测试或 HTTPS 反向代理测试：

```bash
pnpm test:e2e:browser
pnpm test:https-edge
```

## 项目结构

```text
src/
├── app/                 Next.js 页面与 API Route
├── components/          Brief、Archive、配置后台和 UI 组件
├── db/migrations/       PostgreSQL 迁移
├── lib/radar/           采集、筛选、证据、评估、发布和检索领域逻辑
└── worker.ts            定时采集、评估和 Brief 发布 Worker
test/                    单元、集成、E2E 和浏览器测试
compose*.yaml            本地、生产式和 HTTPS Compose 配置
scripts/                 E2E 与 HTTPS 边缘测试脚本
docs/adr/                架构决策记录
```

技术栈为 Next.js、React、TypeScript、Node.js、PostgreSQL 和 Docker Compose。

## 当前范围

- 当前产品是单一 Self-Hosted Instance 和单一 Radar Profile，不是 Hosted Multi-Tenant Platform。
- MVP 仅包含 GitHub Trending、Hugging Face Trending 和 Show HN 三个 Source Connector。
- Public Brief 展示已发布的 Brief Snapshot，不是未经评估的实时原始信息流。
- Grounded Assessment 依赖可用且正确配置的模型运行时；运行时不可用时会显示评估延迟。
- Source Connector 受外部站点访问规则、网络状况和 rate limit 影响，Connector Health 会在 Brief 中公开摘要。
- 第三方内容和链接仍受其各自许可证及服务条款约束；本项目只保留必要的证据摘要，不存储完整第三方作品。

## 许可证

本项目使用 [Apache License 2.0](LICENSE)。
