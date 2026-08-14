export type SignalState = "新出现" | "持续升温" | "重要更新";
export type Priority = "高优先级" | "值得关注" | "持续观察";

export type Evidence = {
  label: string;
  source: string;
  url: string;
};

export type Signal = {
  id: string;
  index: string;
  state: SignalState;
  priority: Priority;
  title: string;
  summary: string;
  topics: string[];
  sources: string[];
  builderValue: "试用" | "学习" | "跟进" | "跳过";
  productOpportunity: "无" | "待验证" | "值得探索";
  happened: string;
  whyNow: string;
  technicalBasis: string;
  risk: string;
  whyInBrief?: string;
  sectionCitations?: Partial<Record<"happened" | "summary" | "technicalBasis" | "whyNow", string[]>>;
  evidence: Evidence[];
};

export const signals: Signal[] = [
  {
    id: "qwen3",
    index: "01",
    state: "新出现",
    priority: "高优先级",
    title: "Qwen3 开源：推理模型在多语言与 Agent 任务上拉齐一线能力",
    summary: "一组可切换思考模式的开放权重模型，给本地部署与 Agent 编排提供了更可控的选择。",
    topics: ["模型与推理", "Agent 与自动化"],
    sources: ["GitHub Trending", "Hugging Face", "Official release"],
    builderValue: "试用",
    productOpportunity: "待验证",
    happened: "Qwen 团队发布 Qwen3 系列开放权重模型，覆盖不同尺寸，并强调推理、代码与多语言任务的统一能力。",
    whyNow: "推理模型正从“单独调用”进入真实工作流。开放权重降低了 Builder 在成本、延迟与私有部署之间做取舍的门槛。",
    technicalBasis: "模型采用混合专家与可控推理模式；具体能力范围应以模型卡、技术报告与后续复现结果为准。",
    risk: "基准结果与真实 Agent 工作流表现未必一致；需要用目标任务、显存占用与吞吐测试验证。",
    evidence: [
      { label: "Qwen3 Technical Report", source: "Official release", url: "https://qwenlm.github.io/" },
      { label: "Qwen on Hugging Face", source: "Hugging Face", url: "https://huggingface.co/Qwen" },
      { label: "Qwen organization", source: "GitHub", url: "https://github.com/QwenLM" },
    ],
  },
  {
    id: "mcp",
    index: "02",
    state: "持续升温",
    priority: "高优先级",
    title: "MCP 工具链加速落地，模型连接外部世界的标准正在形成",
    summary: "从桌面客户端到开发工具，越来越多项目把 MCP 作为模型调用外部工具与数据的共同接口。",
    topics: ["Agent 与自动化", "开发工具"],
    sources: ["GitHub Trending", "Show HN", "Official release"],
    builderValue: "学习",
    productOpportunity: "值得探索",
    happened: "围绕 Model Context Protocol 的服务端、调试器与集成项目在开发者社区持续出现。",
    whyNow: "可复用的工具接口会显著降低 Agent 产品的集成成本，也让分发与安全模型更值得被提前理解。",
    technicalBasis: "MCP 为模型、客户端与工具服务端定义了标准化的上下文与调用交互；每种实现的权限边界仍需单独审查。",
    risk: "生态规范还在演进。将 MCP 当作安全边界或忽略工具授权，都会导致产品设计失真。",
    evidence: [
      { label: "Model Context Protocol", source: "Official release", url: "https://modelcontextprotocol.io/" },
      { label: "MCP GitHub organization", source: "GitHub", url: "https://github.com/modelcontextprotocol" },
    ],
  },
  {
    id: "browser-use",
    index: "03",
    state: "持续升温",
    priority: "值得关注",
    title: "Browser-use 类项目把网页操作推向可观测的 Agent 工作流",
    summary: "网页自动化不再只是脚本录制；新一波项目开始强调 Agent 轨迹、失败恢复与真实环境评测。",
    topics: ["Agent 与自动化", "开发工具"],
    sources: ["GitHub Trending", "Show HN"],
    builderValue: "跟进",
    productOpportunity: "待验证",
    happened: "多个开源浏览器 Agent 项目持续获得社区关注，并开始将运行轨迹与评测作为一等产物。",
    whyNow: "对 Builder 而言，差异化可能不在“能否点网页”，而在可观测、受限执行和可复用任务的可靠性。",
    technicalBasis: "常见方案会把页面结构提取、动作选择、浏览器执行和轨迹记录拆开；具体可靠性取决于网页兼容性与评测集。",
    risk: "高热度不代表生产可用。涉及登录、支付或敏感数据的网页自动化必须有明确的人工确认与权限策略。",
    evidence: [
      { label: "browser-use repository", source: "GitHub", url: "https://github.com/browser-use/browser-use" },
      { label: "Show HN archive", source: "Hacker News", url: "https://news.ycombinator.com/show" },
    ],
  },
  {
    id: "reasoning-update",
    index: "04",
    state: "重要更新",
    priority: "持续观察",
    title: "推理模型的产品评估，正在从基准分数转向任务完成成本",
    summary: "越来越多发布开始同时谈延迟、工具调用与任务成功率，Builder 的评估框架需要随之改变。",
    topics: ["模型与推理", "企业应用"],
    sources: ["Official release", "Hugging Face"],
    builderValue: "学习",
    productOpportunity: "无",
    happened: "近期模型与推理产品更新集中强调真实任务表现、token 预算与调用成本。",
    whyNow: "如果产品价值来自完成一段链路，就不能只比较单轮问答分数；成本、可恢复性与工具质量会共同决定可用性。",
    technicalBasis: "这是对评估对象的调整，而非单一技术发布。需要结合实际任务集持续记录成功率、时延与成本。",
    risk: "目前证据主要来自发布材料与社区反馈，尚不足以形成统一的行业结论。",
    evidence: [
      { label: "Hugging Face model cards", source: "Hugging Face", url: "https://huggingface.co/models" },
      { label: "AI model announcements", source: "Official release", url: "https://openai.com/news/" },
    ],
  },
];

export const connectors = [
  { name: "GitHub Trending", caption: "公开趋势页 + 仓库补证", status: "新鲜", tone: "fresh" },
  { name: "Hugging Face", caption: "模型与 Spaces 热度", status: "新鲜", tone: "fresh" },
  { name: "Show HN", caption: "开发者首次展示", status: "轻度延迟", tone: "delayed" },
  { name: "Official Release", caption: "已登记官方 Watchlist", status: "新鲜", tone: "fresh" },
] as const;

export const topicOptions = ["全部主题", "Agent 与自动化", "模型与推理", "开发工具", "创作工具", "数据与基础设施", "研究", "企业应用"];
