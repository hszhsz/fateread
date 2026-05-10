# FateRead

AI-powered Chinese BaZi (Four Pillars of Destiny) fortune reading agent.

基于 LLM 的中国命理学八字排盘解读 Agent。默认使用 DeepSeek V4 Pro 模型。

## Features

- **精确排盘**：纯算法驱动的四柱八字排盘（年柱、月柱、日柱、时柱）
- **真太阳时**：根据出生地经度自动校正真太阳时
- **完整分析**：十神、藏干、大运、流年、神煞一步到位
- **AI 解读**：基于 LLM 的智能命理解读，支持多轮对话
- **命之书**：AI 深度撰写先天特质分析长文（性格、事业、财运、婚姻、健康等十大维度）
- **运之书**：AI 逐步解析大运流年运势走向（逐运逐年点评，关键年份提醒）
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
npm start
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
npm start
```

在对话中输入出生信息即可：

```
你> 帮我看看命，1990年3月15日14:30出生，男，北京
你> 我今年财运如何？
你> 分析一下我2025到2030年的运势
你> 帮我生成命之书
你> 帮我生成运之书
```

### 命之书 & 运之书

在排盘后，可以请求 AI 生成两种深度分析报告：

- **命之书**：约 5000-8000 字的 Markdown 长文，从日主论命、格局层次、十神星曜、五行禀赋、性格画像、事业天赋、财富格局、情感婚姻、健康体质、神煞点评等十个维度全面解读先天特质
- **运之书**：约 5000-10000 字的 Markdown 长文，逐步解析每步大运的运势基调，逐年点评流年吉凶，标注关键年份的趋吉避凶建议

### 离线模式（纯排盘，无需 API Key）

```bash
npm start -- --offline
```

## Architecture

```
.env.example       # 环境变量模板
.env               # 本地环境变量（不入库）
src/
├── core/          # 排盘核心引擎（纯算法）
│   ├── types.ts        # 类型定义
│   ├── constants.ts    # 天干地支等常量
│   ├── calendar.ts     # 农历/节气计算
│   ├── solar-time.ts   # 真太阳时计算
│   ├── pillars.ts      # 四柱排盘
│   ├── ten-gods.ts     # 十神推算
│   ├── hidden-stems.ts # 藏干
│   ├── dayun.ts        # 大运排盘
│   ├── shensha.ts      # 神煞计算
│   └── analysis.ts     # 五行分析/格局判定
├── skills/        # 深度分析技能
│   ├── ming-book.ts    # 命之书（先天特质深度分析）
│   ├── yun-book.ts     # 运之书（大运流年运势分析）
│   └── index.ts        # Skills 入口
├── agent/         # Agent 运行时
│   ├── tools.ts        # 工具定义（OpenAI Function Calling）
│   ├── prompt.ts       # System Prompt（命理大师人设）
│   └── agent.ts        # Agent 核心（对话+工具调用循环）
└── cli.ts         # CLI 入口（加载 .env + 交互界面）
```

## Development

```bash
npm install          # 安装依赖
npm run build        # 编译
npm run dev          # 开发模式（tsx 直接运行）
npm start            # 运行编译后版本
```

## License

MIT
