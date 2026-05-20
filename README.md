# FateRead

AI-powered Chinese BaZi (Four Pillars of Destiny) fortune reading agent.

基于 LLM 的中国命理学八字排盘解读 Agent。默认使用 DeepSeek V4 Pro 模型。

## Features

- **精确排盘**：纯算法驱动的四柱八字排盘（年柱、月柱、日柱、时柱）
- **真太阳时**：根据出生地经度自动校正真太阳时
- **完整分析**：十神、藏干、大运、流年、神煞一步到位
- **交互式采集**：像真正的命理师一样逐步采集缘主的"纬线"信息（父母年命、排行、重大事件），实现"命同而人生各异"的个性化分析
- **AI 解读**：基于 LLM 的智能命理解读，支持多轮对话
- **积极心理学疏导**：现代命理咨询的本质是心理陪伴——当命盘出现"凶运"时，严格遵循四步疏导流程（验证→解释→出路→赋能），拒绝宿命论断言
- **三大人设**：SOUL.md 定义的人格化命理师 — 铁口直断盲派大师、温婉知心紫薇先生、注重逻辑的子平学者
- **人设动态切换**：会话中随时通过 `/persona` 命令切换人设，立即生效
- **SQLite 持久化**：所有会话自动保存到 SQLite，支持断点续聊和新旧会话管理
- **命之书 / 运之书**：AI 深度撰写长文分析报告（Markdown 输出）
- **Skill 系统**：deer-flow 风格的技能架构，SKILL.md 定义方法论，LLM 按流程执行
- **多流派分析**：三大命理流派独立 Agent — 子平八字、紫微斗数、盲派命理
- **辩论模式**：可选开启的三派会诊 + 辩论协调

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

# 最大 Token 数（默认 262144 即 256k）
# FATEREAD_MAX_TOKENS=262144

# SQLite 数据库路径（可选，默认项目根目录 fateread.db）
# FATEREAD_DB_PATH=./fateread.db
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

#### 流派选择

通过 `--school` 参数选择命理流派，默认为子平八字：

```bash
npm run start -- --school ziping    # 子平八字 — 注重逻辑的子平学者（默认）
npm run start -- --school ziwei     # 紫微斗数 — 温婉知心紫薇先生
npm run start -- --school mangpai   # 盲派命理 — 铁口直断盲派大师
```

#### 辩论模式

`--debate` 开启三派会诊辩论模式（默认关闭，仅单流派执行以节省 Token）：

```bash
npm run start -- --debate                      # 辩论模式（默认子平八字为主视角）
npm run start -- --school ziwei --debate       # 辩论模式（紫微斗数为主视角）
```

### 会话内命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助信息 |
| `/paipan` | 直接排盘（快速查看命盘） |
| `/persona` | 弹出菜单选择切换人设，或 `/persona <流派>` 直接切换 |
| `/new` | 保存当前会话并开始新会话 |
| `/reset` | 重置对话 |
| `/save [id]` | 保存当前会话 |
| `/load <id>` | 加载历史会话 |
| `/sessions` | 列出所有已保存的会话 |
| `/tokens` | 查看 Token 用量统计 |
| `/stream` | 切换流式输出 |
| `/quit` | 退出程序 |

FateRead 会以命理师的身份与你对话，**逐步引导**你提供信息：

```
命理师 ❯ 缘主您好，请先告诉我您的出生信息……
你 ❯ 1990年4月17日晚上8点半，男，北京
命理师 ❯ 收到。为了更准确地分析，能否告诉我父母的大致出生年份和您的排行？
你 ❯ 父亲1962年，母亲1965年，我排行老二，上面有个姐姐
命理师 ❯ 接下来是最重要的定盘问题——能否告诉我一两件印象深的人生大事？
你 ❯ 2012年考上研究生，2018年升了部门经理
命理师 ❯ 最后，您这次最想了解哪些方面？
你 ❯ 想看看今年适不适合跳槽
```

采集完毕后 FateRead 会自动排盘并给出融合"纬线信息"的个性化分析。

### 人设切换

会话内输入 `/persona` 弹出交互式菜单：

```
> /persona

? 选择人设
  📐 注重逻辑的子平学者    — 严谨理性，深入浅出
  🌸 温婉知心紫薇先生      — 温雅知性，先共情后解读
  ⚔️ 铁口直断盲派大师      — 直率果敢，一针见血
```

也支持直接指定：`/persona mangpai` 立即切换。人设切换后立即生效，影响后续对话的语气风格、分析视角和心理疏导方式。

### 深度报告

在排盘后，可以请求生成深度分析 Markdown 文档：

```
你 ❯ 帮我生成命之书
你 ❯ 帮我生成运之书
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
fateread.db            # SQLite 持久化存储（不入库）
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
├── shared/            # 共享基础设施
│   ├── database.ts         # SQLite 数据库层（WAL 模式，sessions + messages）
│   ├── session-store.ts    # 会话持久化（自动保存、增量写入）
│   ├── llm-client.ts       # LLM 客户端工厂、Token 追踪、重试
│   ├── intake-state.ts     # 逐步采集状态机
│   ├── json-utils.ts       # JSON 安全解析工具
│   └── index.ts            # 桶导出
├── skills/            # Skill 运行时
│   ├── loader.ts           # Skill 发现/加载/目录注入
│   ├── ming-book.ts        # 命之书上下文构建
│   ├── yun-book.ts         # 运之书上下文构建
│   └── index.ts            # Skills 入口
├── agent/             # Agent 运行时
│   ├── persona.ts          # 人设加载/缓存/注入系统
│   ├── tools.ts            # 工具定义（含 intake 画像采集 + 多流派分析）
│   ├── prompt.ts           # System Prompt（命理师人设 + 心理疏导 + 采集流程）
│   ├── agent.ts            # Agent 核心（对话循环 + 自动持久化）
│   ├── verify-pillars.ts   # LLM 四柱验证模块
│   ├── souls/              # SOUL.md 人设定义
│   │   ├── ziping-scholar.soul.md  # 注重逻辑的子平学者
│   │   ├── ziwei-teacher.soul.md   # 温婉知心紫薇先生
│   │   └── mangpai-master.soul.md  # 铁口直断盲派大师
│   └── schools/            # 多流派子 Agent 系统
│       ├── types.ts             # 流派间通信协议类型定义
│       ├── base-school.ts       # 子 Agent 抽象基类
│       ├── ziping-agent.ts      # 子平八字子 Agent
│       ├── ziwei-agent.ts       # 紫微斗数子 Agent
│       ├── mangpai-agent.ts     # 盲派命理子 Agent
│       ├── debate.ts            # 辩论协调机制
│       ├── orchestrator.ts      # 主 Agent 协调器
│       └── index.ts             # 模块入口
└── cli.ts             # CLI 入口（加载 .env + 交互界面 + 命令处理）
```

### 核心设计

**人设系统 (Persona System)**

借鉴 OpenClaw 的 SOUL.md 模式，三个流派各有一个完整的人格定义文件，定义身份认同、性格特质、说话风格、情绪智慧、心理疏导心法和禁忌。

```
/persona (切换人设)
     │
     ├── ziping  → SOUL: 注重逻辑的子平学者
     │           严谨理性，深入浅出，以经典依据给出逻辑清晰的解读
     │           心理疏导：格物→穷理→解法→赋能
     │
     ├── ziwei   → SOUL: 温婉知心紫薇先生
     │           温雅知性，先共情后解读，以星曜之美化解人生困惑
     │           心理疏导：映照→解构→转化→赋能
     │
     └── mangpai → SOUL: 铁口直断盲派大师
                 直率果敢，一针见血，每断必附化解之法
                 心理疏导：一针见血→给出路→借力打力→赋能
```

**积极心理学疏导（正向转译法则）**

命理分析的现代本质是心理陪伴。当命盘出现不利信息时，严格禁止宿命论断言，必须将"凶运"转译为成长课题：

| 禁用断言 | 积极转译 |
|---------|---------|
| "你这步运很凶" | "这步运有挑战，也是你成长的加速期" |
| "你命里注定..." | "根据你的命盘配置，你的课题是..." |
| "你运气不好" | "当前能量周期处于低谷，是蓄力的时机" |
| "你这是破财的命" | "财富有起伏周期，关键是在高峰期做好储备" |

**四步心理疏导流程**：验证共情 → 理性解释 → 出路建议 → 赋能希望

**SQLite 持久化**

所有会话自动增量保存到 SQLite（`fateread.db`），无需手动 `/save`：

- `sessions` 表：会话 ID、时间戳、命盘 JSON、用户画像 JSON
- `messages` 表：每条消息（system / user / assistant / tool）实时写入
- 支持 `/new` 起新会话、`/load` 恢复旧会话、`/sessions` 列出全部

**多流派 Agent 架构 (Multi-School Agent System)**

FateRead 内置三大命理流派的独立 Agent。**默认单流派执行**以节省 Token，可通过 `--debate` 开启三派会诊辩论模式。

```
默认模式（--school ziping）：          辩论模式（--debate）：

        ┌─────────────┐              ┌─────────────┐
        │  Orchestrator │             │  Orchestrator │
        │  （协调器）   │             │  （主持人）   │
        └──────┬──────┘              └──────┬──────┘
               │                  ┌─────────┼─────────┐
               ▼                  ▼         ▼         ▼
        ┌─────────────┐    ┌──────────┐┌──────────┐┌──────────┐
        │  子平八字     │    │ 子平八字  ││ 紫微斗数  ││ 盲派命理  │
        │  (单流派)    │    │          ││          ││          │
        └─────────────┘    └──────────┘└──────────┘└──────────┘
                                     │         │         │
                                     └─────────┼─────────┘
                                               ▼
                                     ┌──────────────────┐
                                     │  Debate Protocol  │
                                     │  （辩论协调器）    │
                                     └────────┬─────────┘
                                              ▼
                                     ┌──────────────────┐
                                     │  Synthesized      │
                                     │  Report           │
                                     └──────────────────┘
```

| 流派 | 核心理论 | 视角特色 | 人设 |
|---|---|---|---|
| 子平八字 | 格局法 + 十神体系 + 调候取用 | 日主为中心，论生克制化 | 注重逻辑的子平学者 |
| 紫微斗数 | 星曜 + 十二宫 + 四化飞星 | 命宫为中心，论星曜组合 | 温婉知心紫薇先生 |
| 盲派命理 | 做功论 + 象法 + 宾主体系 | 做功为核心，精准应期 | 铁口直断盲派大师 |

**辩论协调机制 (Debate Protocol)**（仅 `--debate` 模式下触发）

当三个流派的分析出现分歧时，自动触发辩论：
1. **识别分歧**：对比各维度的关键词重叠度和信心度差异
2. **批量辩论**：各流派看到对方立场后给出反驳或让步
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
npm run benchmark    # 运行 benchmark
npm run lint         # 代码检查
```

## License

MIT
