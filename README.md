# FateRead

AI-powered Chinese BaZi (Four Pillars of Destiny) fortune reading agent.

基于 LLM 的中国命理学八字排盘解读 Agent。

## Features

- **精确排盘**：纯算法驱动的四柱八字排盘（年柱、月柱、日柱、时柱）
- **真太阳时**：根据出生地经度自动校正真太阳时
- **完整分析**：十神、藏干、大运、流年、神煞一步到位
- **AI 解读**：基于 LLM 的智能命理解读，支持多轮对话
- **多流派**：可扩展的规则库，支持不同命理流派

## Quick Start

```bash
npm install
npm run build
export OPENAI_API_KEY=your_key
npm start
```

## Architecture

```
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
├── agent/         # Agent 运行时
│   ├── tools.ts        # 工具定义
│   ├── prompt.ts       # System Prompt
│   └── agent.ts        # Agent 核心
└── cli.ts         # CLI 入口
```

## License

MIT
