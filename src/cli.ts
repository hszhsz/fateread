#!/usr/bin/env node
// ============================================================
// FateRead - CLI Entry Point
// Supports: AI mode, offline mode, session resume, streaming
// ============================================================

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '..', '.env');
config({ path: envPath });

import { createInterface } from 'readline';
import { FateReadAgent } from './agent/agent.js';
import type { StreamEvent } from './agent/agent.js';
import { paipan, formatChart } from './core/index.js';
import type { PaipanInput } from './core/types.js';
import { CITY_LONGITUDE } from './core/solar-time.js';
import { listSessions, deleteSession } from './shared/session-store.js';
import type { SchoolId } from './agent/schools/types.js';
import { SCHOOL_NAMES } from './agent/schools/types.js';

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
║     AI 八字命理排盘解读系统 v0.2.0                     ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
`;

const HELP = `
可用命令：
  /help          显示帮助信息
  /paipan        直接排盘（无需 AI，快速查看命盘）
  /reset         重置对话
  /save [id]     保存当前会话（可选指定会话名）
  /load <id>     加载之前保存的会话
  /sessions      列出所有保存的会话
  /tokens        查看 Token 使用统计
  /stream        切换流式输出模式（默认开启）
  /quit          退出程序

启动参数：
  --school <流派>  选择命理流派: ziping(子平八字,默认) / ziwei(紫微斗数) / mangpai(盲派命理)
  --debate         启用多流派辩论模式（默认关闭，仅单流派执行）
  --offline, -o    离线排盘模式（无 AI 解读）
  --resume <id>    恢复保存的会话
  --no-stream      禁用流式输出

使用方式：
  直接输入出生信息即可开始，例如：
  > 帮我看看命，1990年3月15日14:30出生，男，北京
  > 我今年财运如何？
  > 分析一下我2025到2030年的运势
`;

async function main() {
  const args = process.argv.slice(2);

  // --offline mode
  if (args.includes('--offline') || args.includes('-o')) {
    await offlineMode();
    return;
  }

  // --stream / --no-stream flags
  const useStream = !args.includes('--no-stream');

  // --debate flag
  const debateMode = args.includes('--debate');

  // --school flag
  const schoolIdx = args.indexOf('--school');
  let school: SchoolId = 'ziping';
  if (schoolIdx !== -1 && schoolIdx + 1 < args.length) {
    const schoolArg = args[schoolIdx + 1].toLowerCase();
    if (schoolArg === 'ziping' || schoolArg === 'ziwei' || schoolArg === 'mangpai') {
      school = schoolArg;
    } else {
      console.log(`⚠️  未知流派: ${schoolArg}，使用默认流派 子平八字`);
      console.log(`   可用流派: ziping(子平八字), ziwei(紫微斗数), mangpai(盲派命理)\n`);
    }
  }

  // --resume flag
  const resumeIdx = args.indexOf('--resume');
  let resumeId: string | null = null;
  if (resumeIdx !== -1 && resumeIdx + 1 < args.length) {
    resumeId = args[resumeIdx + 1];
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log(BANNER);
    console.log('⚠️  未设置 OPENAI_API_KEY。');
    console.log('   请在项目根目录创建 .env 文件并配置（参考 .env.example）：');
    console.log('   OPENAI_API_KEY=your_deepseek_api_key\n');
    console.log('   或使用 --offline 模式仅进行排盘（无 AI 解读）：');
    console.log('   $ fateread --offline\n');
    await offlineMode();
    return;
  }

  console.log(BANNER);
  const schoolName = SCHOOL_NAMES[school];
  const modeLabel = debateMode ? `多流派辩论模式` : `${schoolName}`;
  console.log(`✨ AI 模式已启用 | 流派: ${modeLabel}`);
  console.log(`   输入 /help 查看帮助\n`);

  const agent = new FateReadAgent({
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.FATEREAD_MODEL,
    school,
    debate: debateMode,
  });

  // Resume session if requested
  if (resumeId) {
    const loaded = agent.loadSession(resumeId);
    if (loaded) {
      console.log(`📂 已恢复会话: ${resumeId}\n`);
    } else {
      console.log(`⚠️  未找到会话: ${resumeId}，开始新会话\n`);
    }
  }

  let streamMode = useStream;

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

    // Commands
    if (input === '/quit' || input === '/exit' || input === '/q') {
      console.log('\n再见！祝您好运！\n');
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

    if (input === '/tokens') {
      console.log('\n' + agent.getTokenReport() + '\n');
      rl.prompt();
      return;
    }

    if (input.startsWith('/save')) {
      const customId = input.split(/\s+/)[1] || undefined;
      const filepath = agent.saveSession(customId);
      console.log(`\n💾 会话已保存: ${filepath}\n`);
      rl.prompt();
      return;
    }

    if (input.startsWith('/load')) {
      const sessionId = input.split(/\s+/)[1];
      if (!sessionId) {
        console.log('\n⚠️  用法: /load <会话ID>\n');
        rl.prompt();
        return;
      }
      const loaded = agent.loadSession(sessionId);
      console.log(loaded ? `\n📂 已恢复会话: ${sessionId}\n` : `\n⚠️  未找到会话: ${sessionId}\n`);
      rl.prompt();
      return;
    }

    if (input === '/sessions') {
      const sessions = listSessions();
      if (sessions.length === 0) {
        console.log('\n📭 没有保存的会话\n');
      } else {
        console.log('\n📂 已保存的会话:\n');
        for (const s of sessions) {
          console.log(`  ${s.id} — ${s.messageCount} 条消息 — ${s.updatedAt}`);
        }
        console.log('');
      }
      rl.prompt();
      return;
    }

    if (input === '/stream') {
      streamMode = !streamMode;
      console.log(`\n📡 流式输出: ${streamMode ? '开启' : '关闭'}\n`);
      rl.prompt();
      return;
    }

    if (input === '/paipan') {
      await interactivePaipan();
      rl.prompt();
      return;
    }

    // AI conversation
    try {
      process.stdout.write('\n命理师> ');

      if (streamMode) {
        let thinkingShown = false;
        for await (const event of agent.chatStream(input)) {
          switch (event.type) {
            case 'reasoning':
              if (!thinkingShown) {
                process.stdout.write('\n💭 思考中...\n');
                thinkingShown = true;
              }
              break;
            case 'tool_start':
              process.stdout.write(`\n⚙️  ${event.content}...`);
              break;
            case 'tool_end':
              if (event.data?.formatted) {
                process.stdout.write(`\n${event.data.formatted}\n`);
              } else if (event.data?.agreementRate !== undefined) {
                process.stdout.write(`\n🎭 三派会诊完成 | 一致率: ${event.data.agreementRate}%\n`);
              } else if (event.data?.progress) {
                const progress = event.data.progress as Record<string, unknown>;
                process.stdout.write(`\n📋 ${progress.completeness || '更新完成'}\n`);
              } else if (event.data?.filepath) {
                process.stdout.write(`\n💾 已保存: ${event.data.filepath}\n`);
              }
              break;
            case 'text':
              process.stdout.write(event.content);
              break;
            case 'progress':
              process.stdout.write(`\n${event.content}\n`);
              break;
            case 'error':
              process.stdout.write(`\n❌ ${event.content}\n`);
              break;
          }
        }
        process.stdout.write('\n');
      } else {
        process.stdout.write('思考中...\n');
        const response = await agent.chat(input);
        process.stdout.write(`\n${response}\n`);
      }
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

// ============================================================
// Offline Mode
// ============================================================

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

function interactivePaipan() {
  console.log('\n此功能请使用 --offline 模式运行\n');
}

main().catch(console.error);
