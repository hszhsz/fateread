# FateRead

AI-powered Chinese BaZi (Four Pillars of Destiny) fortune reading agent.

基于 LLM 的中国命理学八字排盘解读 Agent。默认使用 DeepSeek V4 Pro 模型。

## Features

- **精确排盘**：纯算法驱动的四柱八字排盘（年柱、月柱、日柱、时柱）
- **真太阳时**：根据出生地经度自动校正真太阳时
- **完整分析**：十神、藏干、大运、流年、神煞一步到位
- **交互式采集**：像真正的命理师一样逐步采集缘主的"纬线"信息（父母年命、排行、重大事件），实现"命同而人生各异"的个性化分析
- **AI 解读**：基于 LLM 的智能命理解读，支持多轮对话
- **命之书**：AI 深度撰写先天特质分析长文（性格、事业、财运、婚姻、健康等十大维度）
- **运之书**：AI 逐步解析大运流年运势走向（逐运逐年点评，关键年份提醒）
- **Skill 系统**：deer-flow 风格的技能架构，SKILL.md 定义方法论，LLM 按流程执行
- **多流派**：可扩展的规则库，支持不同命理流派

## Quick Start

```bash
# 1. 克隆项目
git clone https://github.com/hszhsz/fateread.git
cd fateread

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的 DeepSeek API Key

# 4. 编译 & 运行
npm run build
npm run start
```

## 配置说明

所有配置通过项目根目录的 `.env` 文件管理。首次使用请复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

`.env` 文件内容：

```env
# DeepSeek API Key（必填）
# 申请地址：https://platform.deepseek.com/
OPENAI_API_KEY=sk-your-deepseek-api-key-here

# API 基础地址（默认 DeepSeek）
OPENAI_BASE_URL=https://api.deepseek.com

# 模型名称（默认 deepseek-v4-pro）
FATEREAD_MODEL=deepseek-v4-pro

# 多流派子 Agent 模型（可选，默认同 FATEREAD_MODEL）
# FATEREAD_SCHOOL_MODEL=deepseek-v4-pro

# 辩论裁判模型（可选，默认同 FATEREAD_MODEL）
# FATEREAD_JUDGE_MODEL=deepseek-v4-pro

# 四柱验证模型（可选，默认同 FATEREAD_MODEL）
# FATEREAD_VERIFY_MODEL=deepseek-v4-pro
```

### 切换其他模型

FateRead 兼容所有支持 OpenAI API 格式 + Function Calling 的模型：

```env
# OpenAI GPT-4o
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.openai.com/v1
FATEREAD_MODEL=gpt-4o

# 智谱 GLM-4
OPENAI_API_KEY=your-zhipu-key
OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
FATEREAD_MODEL=glm-4

# 本地 Ollama
OPENAI_API_KEY=ollama
OPENAI_BASE_URL=http://localhost:11434/v1
FATEREAD_MODEL=qwen2.5:72b
```

## 使用方式

### AI 模式（默认）

配置好 `.env` 后直接运行：

```bash
npm run start
```

FateRead 会以命理师的身份与你对话，**逐步引导**你提供信息：

```
FateRead> 缘主您好，请先告诉我您的出生信息……
你> 1990年4月17日晚上8点半，男，北京
FateRead> 收到。为了更准确地分析，能否告诉我父母的大致出生年份和您的排行？
你> 父亲1962年，母亲1965年，我排行老二，上面有个姐姐
FateRead> 接下来是最重要的定盘问题——能否告诉我一两件印象深的人生大事？
你> 2012年考上研究生，2018年升了部门经理
FateRead> 最后，您这次最想了解哪些方面？
你> 想看看今年适不适合跳槽
```

采集完毕后 FateRead 会自动排盘并给出融合"纬线信息"的个性化分析。

### 深度报告

在排盘后，可以请求生成深度分析 Markdown 文档：

```
你> 帮我生成命之书
你> 帮我生成运之书
```

- **命之书**：约 5000-8000 字，十大维度全面解读先天特质
- **运之书**：约 5000-10000 字，逐运逐年点评吉凶

文档保存在项目 `outputs/` 目录下。

### 开发模式

```bash
npm run dev    # tsx 直接运行，无需编译
```

### 离线模式（纯排盘，无需 API Key）

```bash
npm run start -- --offline
```

## Architecture

```
.env.example           # 环境变量模板
.env                   # 本地环境变量（不入库）
skills/                # Skill 定义（YAML frontmatter + Markdown 方法论）
├── ming-book/
│   └── SKILL.md       # 命之书技能方法论
└── yun-book/
    └── SKILL.md       # 运之书技能方法论
outputs/               # 生成的文档输出目录（不入库）
src/
├── core/              # 排盘核心引擎（纯算法）
│   ├── types.ts            # 类型定义（含 UserProfile 画像）
│   ├── constants.ts        # 天干地支等常量
│   ├── calendar.ts         # 农历/节气计算
│   ├── solar-time.ts       # 真太阳时计算
│   ├── pillars.ts          # 四柱排盘
│   ├── ten-gods.ts         # 十神推算
│   ├── hidden-stems.ts     # 藏干
│   ├── dayun.ts            # 大运排盘
│   ├── shensha.ts          # 神煞计算
│   └── analysis.ts         # 五行分析/格局判定
├── skills/            # Skill 运行时
│   ├── loader.ts           # Skill 发现/加载/目录注入
│   ├── ming-book.ts        # 命之书上下文构建
│   ├── yun-book.ts         # 运之书上下文构建
│   └── index.ts            # Skills 入口
├── agent/             # Agent 运行时
│   ├── tools.ts            # 工具定义（含 intake 画像采集 + 多流派分析）
│   ├── prompt.ts           # System Prompt（命理师人设 + 采集流程 + 三派协调）
│   ├── agent.ts            # Agent 核心（对话+工具调用循环）
│   ├── verify-pillars.ts   # LLM 四柱验证模块
│   └── schools/            # 多流派子 Agent 系统
│       ├── types.ts             # 流派间通信协议类型定义
│       ├── base-school.ts       # 子 Agent 抽象基类
│       ├── ziping-agent.ts      # 子平八字子 Agent
│       ├── ziwei-agent.ts       # 紫微斗数子 Agent
│       ├── mangpai-agent.ts     # 盲派命理子 Agent
│       ├── debate.ts            # 辩论协调机制
│       ├── orchestrator.ts      # 主 Agent 协调器
│       └── index.ts             # 模块入口
└── cli.ts             # CLI 入口（加载 .env + 交互界面）
```

### 核心设计

**一主三辅多流派架构 (Multi-School Agent System)**

FateRead 采用"一主三辅 + 辩论协调"的 Agent 架构，三大命理流派各自独立分析后通过辩论达成共识：

```
                        ┌─────────────┐
                        │  Orchestrator │  主 Agent（协调器）
                        │  （主持人）   │
                        └──────┬──────┘
               ┌───────────────┼───────────────┐
               ▼               ▼               ▼
        ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
        │  子平八字     │ │  紫微斗数    │ │  盲派命理    │  三个子 Agent
        │  ZipingAgent │ │  ZiweiAgent │ │ MangpaiAgent│  并行分析
        └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
               │               │               │
               └───────────────┼───────────────┘
                               ▼
                     ┌──────────────────┐
                     │  Debate Protocol  │  分歧维度辩论
                     │  （辩论协调器）    │
                     └────────┬─────────┘
                              ▼
                     ┌──────────────────┐
                     │  Synthesized      │  三派共识报告
                     │  Report           │
                     └──────────────────┘
```

| 流派 | 核心理论 | 视角特色 |
|---|---|---|
| 子平八字 | 格局法 + 十神体系 + 调候取用 | 日主为中心，论生克制化 |
| 紫微斗数 | 星曜 + 十二宫 + 四化飞星 | 命宫为中心，论星曜组合 |
| 盲派命理 | 做功论 + 象法 + 宾主体系 | 做功为核心，精准应期 |

**辩论协调机制 (Debate Protocol)**

当三个流派的分析出现分歧时，自动触发辩论：
1. **识别分歧**：对比各维度的关键词重叠度和信心度差异
2. **两轮辩论**：各流派看到对方立场后给出反驳或让步
3. **裁判综合**：独立的裁判 LLM 综合多方观点，达成最终共识
4. **透明输出**：辩论过程和少数派保留意见一并展示

**Intake System（缘主画像采集）**

八字是"经线"，以下信息是"纬线"——交织定位独一无二的人生图景：

| 类别 | 采集内容 | 命理作用 |
|---|---|---|
| 根源信息 | 父母出生年份 | 同种子不同土壤，六亲缘法差异 |
| 结构信息 | 兄弟姐妹排行 | 长幼有序，气禀有殊 |
| 应期信息 | 重大人生事件 | 反推验证用神，将共性拉回个性 |

**Skill System（deer-flow 架构）**

```
LLM → read_skill（加载方法论）→ get_chart_context（获取数据+画像）→ 撰写文档 → save_document
```

## Development

```bash
npm install          # 安装依赖
npm run build        # 编译 TypeScript
npm run dev          # 开发模式（tsx 直接运行）
npm run start        # 运行编译后版本
npm test             # 运行测试
npm run lint         # 代码检查
```

## License

MIT
