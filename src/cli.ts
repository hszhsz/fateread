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
config({ path: envPath, quiet: true });

import { createInterface, emitKeypressEvents } from 'readline';
import chalk from 'chalk';
import { search } from '@inquirer/prompts';
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
  /new           开始新会话（自动保存当前会话）
  /persona <流派> 切换人设: ziping / ziwei / mangpai
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

// ============================================================
// Command menu
// ============================================================

interface Command {
  name: string;
  value: string;
  description: string;
}

const COMMANDS: Command[] = [
  { name: '⚙️  /paipan', value: '/paipan', description: '直接排盘（无需 AI，快速查看命盘）' },
  { name: '🆕 /new', value: '/new', description: '开始新会话（自动保存当前会话）' },
  { name: '🎭 /persona', value: '/persona', description: '切换人设: ziping / ziwei / mangpai' },
  { name: '🔄 /reset', value: '/reset', description: '重置对话' },
  { name: '💾 /save', value: '/save', description: '保存当前会话' },
  { name: '📂 /load', value: '/load', description: '加载之前保存的会话' },
  { name: '📋 /sessions', value: '/sessions', description: '列出所有保存的会话' },
  { name: '📊 /tokens', value: '/tokens', description: '查看 Token 使用统计' },
  { name: '📡 /stream', value: '/stream', description: '切换流式输出模式' },
  { name: '❓ /help', value: '/help', description: '显示帮助信息' },
  { name: '🚪 /quit', value: '/quit', description: '退出程序' },
];

async function showCommandMenu(): Promise<string | null> {
  try {
    const cmd = await search({
      message: '选择命令',
      source: (term) => {
        if (!term) return COMMANDS;
        const t = term.toLowerCase();
        return COMMANDS.filter(
          (c) =>
            c.value.toLowerCase().includes(t) ||
            c.description.toLowerCase().includes(t) ||
            c.name.toLowerCase().includes(t),
        );
      },
      pageSize: 9,
    });
    return cmd;
  } catch {
    // User cancelled (Ctrl+C)
    return null;
  }
}

// ============================================================
// Stream event display
// ============================================================

function displayStreamEvent(event: StreamEvent, thinkingShown: boolean): boolean {
  switch (event.type) {
    case 'reasoning':
      if (!thinkingShown) {
        process.stdout.write(chalk.gray('\n💭 思考中...\n'));
        thinkingShown = true;
      }
      break;
    case 'tool_start':
      process.stdout.write(chalk.blue(`\n⚙️  ${event.content}...`));
      break;
    case 'tool_end':
      if (event.data?.formatted) {
        process.stdout.write(`\n${event.data.formatted}\n`);
      } else if (event.data?.agreementRate !== undefined) {
        if (event.data.debateMode) {
          process.stdout.write(chalk.yellow(`\n🎭 三派会诊完成 | 一致率: ${event.data.agreementRate}%\n`));
        } else {
          process.stdout.write(chalk.green(`\n✅ 单流派分析完成\n`));
        }
      } else if (event.data?.progress) {
        const progress = event.data.progress as Record<string, unknown>;
        process.stdout.write(chalk.green(`\n📋 ${progress.completeness || '更新完成'}\n`));
      } else if (event.data?.filepath) {
        process.stdout.write(chalk.green(`\n💾 已保存: ${event.data.filepath}\n`));
      }
      break;
    case 'text':
      process.stdout.write(event.content);
      break;
    case 'progress':
      // Real-time analysis progress — show immediately without extra newlines
      process.stdout.write(chalk.cyan(`${event.content}\n`));
      break;
    case 'error':
      process.stdout.write(chalk.red(`\n❌ ${event.content}\n`));
      break;
  }
  return thinkingShown;
}

// ============================================================
// Command separator
// ============================================================

function sep() {
  console.log(chalk.dim('─'.repeat(50)));
}

// ============================================================
// Keypress-based input loop — intercepts "/" immediately
// ============================================================

const PROMPT_TEXT = '你 ❯ ';

async function startKeypressLoop(ctx: CommandContext) {
  process.stdin.setRawMode(true);
  process.stdin.resume();

  let lineBuffer = '';

  const drawPrompt = () => {
    process.stdout.write('\r\x1b[K' + chalk.green(PROMPT_TEXT) + lineBuffer);
  };

  drawPrompt();

  const onKeypress = async (str: string, key: { name: string; ctrl: boolean; sequence: string }) => {
    // Ctrl+C
    if (key.ctrl && key.name === 'c') {
      process.stdout.write('\n');
      process.stdin.setRawMode(false);
      console.log(chalk.yellow('\n再见！祝您好运！\n'));
      process.exit(0);
    }

    // Ctrl+D on empty line
    if (key.name === 'd' && key.ctrl && lineBuffer === '') {
      process.stdout.write('\n');
      process.stdin.setRawMode(false);
      console.log(chalk.yellow('\n再见！祝您好运！\n'));
      process.exit(0);
    }

    // Enter
    if (key.name === 'return') {
      process.stdout.write('\n');
      const input = lineBuffer.trim();
      lineBuffer = '';

      // Exit raw mode before processing
      process.stdin.setRawMode(false);
      process.stdin.pause();

      if (input) {
        // Direct slash commands
        if (input.startsWith('/')) {
          await handleCommand(input, ctx);
        } else {
          // AI conversation
          await handleChat(input, ctx.agent, ctx.streamMode);
        }
      }

      // Re-enter raw mode
      process.stdin.setRawMode(true);
      process.stdin.resume();
      drawPrompt();
      return;
    }

    // Backspace
    if (key.name === 'backspace') {
      if (lineBuffer.length > 0) {
        lineBuffer = lineBuffer.slice(0, -1);
        drawPrompt();
      }
      return;
    }

    // Printable character — intercept "/" at start of line
    if (str && str.length === 1 && str >= ' ') {
      if (lineBuffer === '' && str === '/') {
        // Show the "/" then immediately trigger command menu
        process.stdout.write('/');
        process.stdout.write('\n');
        lineBuffer = '';

        // Exit raw mode for inquirer
        process.stdin.setRawMode(false);
        process.stdin.pause();

        const cmd = await showCommandMenu();
        if (cmd) {
          await handleCommand(cmd, ctx);
        }

        // Re-enter raw mode
        process.stdin.setRawMode(true);
        process.stdin.resume();
        drawPrompt();
        return;
      }

      lineBuffer += str;
      drawPrompt();
      return;
    }

    // Ignore other control characters
  };

  process.stdin.on('keypress', onKeypress);
}

async function startReadlineLoop(ctx: CommandContext) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.green(PROMPT_TEXT),
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (input.startsWith('/')) {
      await handleCommand(input, ctx);
    } else {
      await handleChat(input, ctx.agent, ctx.streamMode);
    }
    rl.prompt();
  });

  rl.on('close', () => {
    console.log(chalk.yellow('\n再见！祝您好运！\n'));
    process.exit(0);
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--offline') || args.includes('-o')) {
    await offlineMode();
    return;
  }

  const useStream = !args.includes('--no-stream');
  const debateMode = args.includes('--debate');

  const schoolIdx = args.indexOf('--school');
  let school: SchoolId = 'ziping';
  if (schoolIdx !== -1 && schoolIdx + 1 < args.length) {
    const schoolArg = args[schoolIdx + 1].toLowerCase();
    if (schoolArg === 'ziping' || schoolArg === 'ziwei' || schoolArg === 'mangpai') {
      school = schoolArg;
    } else {
      console.log(chalk.yellow(`⚠️  未知流派: ${schoolArg}，使用默认流派 子平八字`));
      console.log(`   可用流派: ziping(子平八字), ziwei(紫微斗数), mangpai(盲派命理)\n`);
    }
  }

  const resumeIdx = args.indexOf('--resume');
  let resumeId: string | null = null;
  if (resumeIdx !== -1 && resumeIdx + 1 < args.length) {
    resumeId = args[resumeIdx + 1];
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log(chalk.cyan(BANNER));
    console.log(chalk.yellow('⚠️  未设置 OPENAI_API_KEY。'));
    console.log('   请在项目根目录创建 .env 文件并配置（参考 .env.example）：');
    console.log('   OPENAI_API_KEY=your_deepseek_api_key\n');
    console.log('   或使用 --offline 模式仅进行排盘（无 AI 解读）：');
    console.log('   $ fateread --offline\n');
    await offlineMode();
    return;
  }

  console.log(chalk.cyan(BANNER));
  const schoolName = SCHOOL_NAMES[school];
  const modeLabel = debateMode ? `多流派辩论模式` : `${schoolName}`;
  console.log(chalk.green(`✨ AI 模式已启用 | 流派: ${modeLabel}`));
  console.log(chalk.dim(`   输入 ${chalk.white('/')} 打开命令菜单，输入 ${chalk.white('/help')} 查看帮助\n`));

  const agent = new FateReadAgent({
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL,
    model: process.env.FATEREAD_MODEL,
    school,
    debate: debateMode,
  });

  if (resumeId) {
    const loaded = agent.loadSession(resumeId);
    if (loaded) {
      console.log(chalk.green(`📂 已恢复会话: ${resumeId}\n`));
    } else {
      console.log(chalk.yellow(`⚠️  未找到会话: ${resumeId}，开始新会话\n`));
    }
  }

  let streamMode = useStream;

  const ctx: CommandContext = {
    agent,
    streamMode,
    setStreamMode: (v) => { streamMode = v; },
  };

  if (process.stdin.isTTY) {
    // Keypress-based input loop — intercepts "/" immediately
    emitKeypressEvents(process.stdin);
    await startKeypressLoop(ctx);
  } else {
    // Fallback to readline for non-TTY (piped) input
    await startReadlineLoop(ctx);
  }
}

// ============================================================
// Command handler
// ============================================================

interface CommandContext {
  agent: FateReadAgent;
  streamMode: boolean;
  setStreamMode: (v: boolean) => void;
}

async function handleCommand(input: string, ctx: CommandContext): Promise<void> {
  const { agent, setStreamMode } = ctx;
  const parts = input.split(/\s+/);
  const cmd = parts[0];

  if (cmd === '/quit' || cmd === '/exit' || cmd === '/q') {
    sep();
    console.log(chalk.yellow('\n再见！祝您好运！\n'));
    process.exit(0);
  }

  if (cmd === '/help' || cmd === '/h') {
    sep();
    console.log(chalk.cyan(HELP));
    return;
  }

  if (cmd === '/reset') {
    agent.reset();
    sep();
    console.log(chalk.green('\n对话已重置。\n'));
    return;
  }

  if (cmd === '/new') {
    const oldId = agent.newSession();
    sep();
    console.log(chalk.green(`\n🆕 已开始新会话 (旧会话已保存: ${oldId})\n`));
    return;
  }

  if (cmd === '/persona') {
    const schoolArg = parts[1]?.toLowerCase();
    if (schoolArg && ['ziping', 'ziwei', 'mangpai'].includes(schoolArg)) {
      // Direct switch with argument
      agent.switchPersona(schoolArg as SchoolId);
      sep();
      console.log(chalk.green(`\n🎭 已切换人设: ${SCHOOL_NAMES[schoolArg as SchoolId]}\n`));
      return;
    }

    // No valid arg — pop up interactive menu
    const personaChoices = [
      { name: '📐 注重逻辑的子平学者', value: 'ziping', description: '严谨理性，深入浅出，以经典依据给出逻辑清晰的解读' },
      { name: '🌸 温婉知心紫薇先生', value: 'ziwei', description: '温雅知性，先共情后解读，以星曜之美化解人生困惑' },
      { name: '⚔️ 铁口直断盲派大师', value: 'mangpai', description: '直率果敢，一针见血，每断必附化解之法' },
    ];
    const choice = await search({
      message: '选择人设',
      source: (term) => {
        if (!term) return personaChoices;
        const t = term.toLowerCase();
        return personaChoices.filter(
          (c) => c.value.includes(t) || c.description.toLowerCase().includes(t) || c.name.toLowerCase().includes(t),
        );
      },
      pageSize: 3,
    });
    if (choice) {
      agent.switchPersona(choice as SchoolId);
      sep();
      console.log(chalk.green(`\n🎭 已切换人设: ${SCHOOL_NAMES[choice as SchoolId]}\n`));
    }
    return;
  }

  if (cmd === '/tokens') {
    sep();
    console.log('\n' + agent.getTokenReport() + '\n');
    return;
  }

  if (cmd === '/save') {
    const customId = parts[1] || undefined;
    const id = agent.saveSession(customId);
    sep();
    console.log(chalk.green(`\n💾 会话已保存 (ID: ${id})\n`));
    return;
  }

  if (cmd === '/load') {
    const sessionId = parts[1];
    if (!sessionId) {
      console.log(chalk.yellow('\n⚠️  用法: /load <会话ID>\n'));
      return;
    }
    const loaded = agent.loadSession(sessionId);
    sep();
    console.log(
      loaded
        ? chalk.green(`\n📂 已恢复会话: ${sessionId}\n`)
        : chalk.yellow(`\n⚠️  未找到会话: ${sessionId}\n`),
    );
    return;
  }

  if (cmd === '/sessions') {
    const sessions = listSessions();
    sep();
    if (sessions.length === 0) {
      console.log(chalk.dim('\n📭 没有保存的会话\n'));
    } else {
      console.log(chalk.cyan('\n📂 已保存的会话:\n'));
      for (const s of sessions) {
        console.log(
          `  ${chalk.white(s.id)}  ${chalk.dim('—')}  ${chalk.green(String(s.messageCount))} 条消息  ${chalk.dim('—')}  ${chalk.gray(s.updatedAt)}`,
        );
      }
      console.log('');
    }
    return;
  }

  if (cmd === '/stream') {
    const newMode = !ctx.streamMode;
    setStreamMode(newMode);
    sep();
    console.log(chalk.cyan(`\n📡 流式输出: ${newMode ? chalk.green('开启') : chalk.yellow('关闭')}\n`));
    return;
  }

  if (cmd === '/paipan') {
    await interactivePaipan();
    return;
  }

  console.log(chalk.yellow(`\n未知命令: ${input}，输入 / 打开命令菜单\n`));
}

// ============================================================
// AI chat handler
// ============================================================

async function handleChat(input: string, agent: FateReadAgent, streamMode: boolean): Promise<void> {
  try {
    process.stdout.write(chalk.white('\n命理师 ❯ '));

    if (streamMode) {
      let thinkingShown = false;
      let workingSpinner: NodeJS.Timeout | null = null;
      let spinnerFrame = 0;
      const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

      const startSpinner = () => {
        if (workingSpinner) return;
        workingSpinner = setInterval(() => {
          const char = spinnerChars[spinnerFrame % spinnerChars.length];
          process.stdout.write(`\r${chalk.yellow(char)} ${chalk.gray('正在分析中...')}`);
          spinnerFrame++;
        }, 100);
      };

      const stopSpinner = () => {
        if (workingSpinner) {
          clearInterval(workingSpinner);
          workingSpinner = null;
          process.stdout.write('\r\x1b[K'); // clear spinner line
        }
      };

      // Start spinner before streaming begins
      startSpinner();

      for await (const event of agent.chatStream(input)) {
        // Stop spinner as soon as any real output arrives
        if (event.type !== 'progress' || spinnerFrame > 0) {
          stopSpinner();
        }
        thinkingShown = displayStreamEvent(event, thinkingShown);
        // Restart spinner if we're entering a long-running tool
        if (event.type === 'tool_start' && event.content === 'multi_school_analyze') {
          startSpinner();
        }
      }

      stopSpinner();
      process.stdout.write('\n');
    } else {
      process.stdout.write(chalk.gray('思考中...\n'));
      const response = await agent.chat(input);
      process.stdout.write(`\n${response}\n`);
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`\n❌ 错误: ${msg}\n`));
  }
}

// ============================================================
// Offline Mode
// ============================================================

async function offlineMode() {
  console.log(chalk.cyan(BANNER));
  console.log(chalk.yellow('📋 离线排盘模式（无 AI 解读）'));
  console.log(chalk.dim('   输入 /help 查看帮助\n'));

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question: string): Promise<string> => {
    return new Promise(resolve => rl.question(chalk.green(question), resolve));
  };

  while (true) {
    try {
      console.log(chalk.cyan('─── 请输入出生信息 ───\n'));

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

      console.log(chalk.gray(`\n正在排盘... (经度: ${longitude}°E)\n`));

      const inputPaipan: PaipanInput = { year, month, day, hour, minute, gender, longitude };
      const chart = paipan(inputPaipan);
      const formatted = formatChart(chart);
      console.log(formatted);

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`\n❌ 排盘错误: ${msg}\n`));
    }

    const again = await ask('\n是否继续排盘？(y/n) ');
    if (again.toLowerCase() !== 'y' && again !== '') break;
    console.log('');
  }

  console.log(chalk.yellow('\n再见！\n'));
  rl.close();
  process.exit(0);
}

function interactivePaipan() {
  sep();
  console.log(chalk.yellow('\n此功能请使用 --offline 模式运行\n'));
}

main().catch(console.error);
