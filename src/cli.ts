#!/usr/bin/env node
// ============================================================
// FateRead - CLI Entry Point
// ============================================================

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// 加载项目根目录的 .env 文件
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// 支持从 dist/ 或 src/ 运行，都能找到根目录的 .env
const envPath = resolve(__dirname, '..', '.env');
config({ path: envPath });

import { createInterface } from 'readline';
import { FateReadAgent } from './agent/agent.js';
import { paipan, formatChart } from './core/index.js';
import type { PaipanInput } from './core/types.js';
import { CITY_LONGITUDE } from './core/solar-time.js';

const BANNER = `
╔══════════════════════════════════════════════════════╗
║                                                      ║
║     ███████╗ █████╗ ████████╗███████╗                ║
║     ██╔════╝██╔══██╗╚══██╔══╝██╔════╝                ║
║     █████╗  ███████║   ██║   █████╗                  ║
║     ██╔══╝  ██╔══██║   ██║   ██╔══╝                  ║
║     ██║     ██║  ██║   ██║   ███████╗                ║
║     ╚═╝     ╚═╝  ╚═╝   ╚═╝   ╚══════╝                ║
║                                                      ║
║     ██████╗ ███████╗ █████╗ ██████╗                  ║
║     ██╔══██╗██╔════╝██╔══██╗██╔══██╗                 ║
║     ██████╔╝█████╗  ███████║██║  ██║                 ║
║     ██╔══██╗██╔══╝  ██╔══██║██║  ██║                 ║
║     ██║  ██║███████╗██║  ██║██████╔╝                 ║
║     ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═════╝                 ║
║                                                      ║
║     AI 八字命理排盘解读系统 v0.1.0                     ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
`;

const HELP = `
可用命令：
  /help          显示帮助信息
  /paipan        直接排盘（无需 AI，快速查看命盘）
  /reset         重置对话
  /quit          退出程序

使用方式：
  直接输入出生信息即可开始，例如：
  > 帮我看看命，1990年3月15日14:30出生，男，北京
  > 我今年财运如何？
  > 分析一下我2025到2030年的运势
`;

async function main() {
  const args = process.argv.slice(2);

  // --offline 模式：仅排盘，不需要 API
  if (args.includes('--offline') || args.includes('-o')) {
    await offlineMode();
    return;
  }

  // 检查 API Key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log(BANNER);
    console.log('⚠️  未设置 OPENAI_API_KEY。');
    console.log('   请在项目根目录创建 .env 文件并配置（参考 .env.example）：');
    console.log('   OPENAI_API_KEY=your_deepseek_api_key\n');
    console.log('   或使用 --offline 模式仅进行排盘（无 AI 解读）：');
    console.log('   $ fateread --offline\n');

    // 进入离线模式
    await offlineMode();
    return;
  }

  // 完整模式（含 AI 解读）
  console.log(BANNER);
  console.log('✨ AI 模式已启用，输入出生信息开始解读命盘');
  console.log('   输入 /help 查看帮助\n');

  const agent = new FateReadAgent({
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.FATEREAD_MODEL,
  });

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '你> ',
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    // 命令处理
    if (input === '/quit' || input === '/exit' || input === '/q') {
      console.log('\n再见！祝您好运！🙏\n');
      process.exit(0);
    }
    if (input === '/help' || input === '/h') {
      console.log(HELP);
      rl.prompt();
      return;
    }
    if (input === '/reset') {
      agent.reset();
      console.log('\n对话已重置。\n');
      rl.prompt();
      return;
    }
    if (input === '/paipan') {
      await interactivePaipan();
      rl.prompt();
      return;
    }

    // AI 对话
    try {
      console.log('\n命理师> 思考中...\n');
      const response = await agent.chat(input);
      console.log(`命理师> ${response}\n`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`\n❌ 错误: ${msg}\n`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\n再见！\n');
    process.exit(0);
  });
}

/**
 * 离线模式：纯排盘
 */
async function offlineMode() {
  console.log(BANNER);
  console.log('📋 离线排盘模式（无 AI 解读）');
  console.log('   输入 /help 查看帮助\n');

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question: string): Promise<string> => {
    return new Promise(resolve => rl.question(question, resolve));
  };

  while (true) {
    try {
      console.log('─── 请输入出生信息 ───\n');

      const yearStr = await ask('出生年份（公历，如 1990）: ');
      if (yearStr === '/quit' || yearStr === '/q') break;
      const year = parseInt(yearStr);

      const monthStr = await ask('出生月份（1-12）: ');
      const month = parseInt(monthStr);

      const dayStr = await ask('出生日期（1-31）: ');
      const day = parseInt(dayStr);

      const hourStr = await ask('出生时间（0-23点）: ');
      const hour = parseInt(hourStr);

      const minuteStr = await ask('出生分钟（0-59，直接回车默认0）: ');
      const minute = parseInt(minuteStr) || 0;

      const genderStr = await ask('性别（男/女）: ');
      const gender = genderStr.includes('女') ? 'female' as const : 'male' as const;

      const cityStr = await ask('出生城市（直接回车默认北京）: ');
      const city = cityStr || '北京';
      const longitude = CITY_LONGITUDE[city] || 116.4;

      console.log(`\n正在排盘... (经度: ${longitude}°E)\n`);

      const input: PaipanInput = { year, month, day, hour, minute, gender, longitude };
      const chart = paipan(input);
      const formatted = formatChart(chart);
      console.log(formatted);

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`\n❌ 排盘错误: ${msg}\n`);
    }

    const again = await ask('\n是否继续排盘？(y/n) ');
    if (again.toLowerCase() !== 'y' && again !== '') break;
    console.log('');
  }

  console.log('\n再见！\n');
  rl.close();
  process.exit(0);
}

/**
 * 交互式排盘
 */
async function interactivePaipan() {
  console.log('\n此功能请使用 --offline 模式运行\n');
}

main().catch(console.error);
