// ============================================================
// FateRead - Intake State Machine
// Mechanical enforcement of the step-by-step intake flow.
// Prevents the LLM from skipping ahead or asking multiple-step
// questions in a single response.
// ============================================================

import type { UserProfile } from '../core/types.js';

// ============================================================
// States
// ============================================================

export type IntakeStep =
  | 'greeting'       // Initial greeting, not yet started intake
  | 'basic_info'     // Step 1: birth date/time, gender, city
  | 'family_info'    // Step 2: parents, siblings
  | 'life_events'    // Step 3: major life events for calibration
  | 'concerns'       // Step 4: focus areas
  | 'complete';      // All steps done or user declined further

export interface IntakeState {
  step: IntakeStep;
  profile: UserProfile;
  /** Whether the user explicitly declined to continue at any step */
  declinedAt: IntakeStep | null;
}

// ============================================================
// Transitions
// ============================================================

const STEP_ORDER: IntakeStep[] = ['greeting', 'basic_info', 'family_info', 'life_events', 'concerns', 'complete'];

function getStepIndex(step: IntakeStep): number {
  return STEP_ORDER.indexOf(step);
}

/**
 * Check if the current step's required info is satisfied from the profile.
 */
function isStepSatisfied(step: IntakeStep, profile: UserProfile): boolean {
  switch (step) {
    case 'greeting':
      return true; // Always satisfied, greeting is just conversation start
    case 'basic_info':
      return !!(profile.birthYear && profile.birthMonth && profile.birthDay &&
                profile.birthHour !== undefined && profile.gender);
    case 'family_info':
      return !!(profile.parents || profile.siblings);
    case 'life_events':
      return !!(profile.lifeEvents && profile.lifeEvents.length > 0);
    case 'concerns':
      return !!(profile.concerns && profile.concerns.length > 0) || !!profile.specificQuestion;
    case 'complete':
      return true;
  }
}

/**
 * Get the minimum completeness for the current step.
 * Returns the minimum score (0-100) that must be met to advance.
 */
function getStepThreshold(step: IntakeStep): number {
  switch (step) {
    case 'basic_info': return 30;
    case 'family_info': return 30;
    case 'life_events': return 30;
    case 'concerns': return 30;
    default: return 0;
  }
}

// ============================================================
// Public API
// ============================================================

/**
 * Create a fresh intake state machine.
 */
export function createIntakeState(profile?: UserProfile): IntakeState {
  return {
    step: 'greeting',
    profile: profile || {
      birthYear: 0,
      birthMonth: 0,
      birthDay: 0,
      birthHour: 0,
      gender: 'male',
    },
    declinedAt: null,
  };
}

/**
 * Advance the intake state based on what information has been filled.
 * Called after each update_profile tool call.
 */
export function advanceIntake(state: IntakeState): IntakeState {
  if (state.step === 'complete') return state;

  const currentIdx = getStepIndex(state.step);

  // Check if current step is satisfied → advance
  for (let i = currentIdx; i < STEP_ORDER.length - 1; i++) {
    const nextStep = STEP_ORDER[i + 1];
    if (!isStepSatisfied(STEP_ORDER[i], state.profile)) {
      // Current step not yet satisfied, stay here
      state.step = STEP_ORDER[i];
      return state;
    }
    // Current step satisfied, can advance
    if (i === currentIdx) {
      state.step = nextStep;
    }
  }

  if (isStepSatisfied('concerns', state.profile)) {
    state.step = 'complete';
  }

  return state;
}

/**
 * Mark the user as declining further information at the current step.
 * Advances the state machine past this step.
 */
export function declineCurrentStep(state: IntakeState): IntakeState {
  if (state.step === 'complete') return state;
  state.declinedAt = state.step;
  const currentIdx = getStepIndex(state.step);
  if (currentIdx < STEP_ORDER.length - 1) {
    state.step = STEP_ORDER[currentIdx + 1];
  } else {
    state.step = 'complete';
  }
  return state;
}

/**
 * Check if the intake is minimally sufficient to start chart reading.
 * (birth date/time + gender is the minimum)
 */
export function canStartCharting(state: IntakeState): boolean {
  return isStepSatisfied('basic_info', state.profile);
}

/**
 * Get the prompt hint for the current step (injected into system prompt).
 * This tells the LLM which specific question to ask.
 */
export function getStepPromptHint(state: IntakeState): string {
  switch (state.step) {
    case 'greeting':
      return '缘主初次来访，请热情问候并引导提供出生信息。';
    case 'basic_info':
      return `当前处于【第一步：基础信息采集】。
请向缘主询问：出生年月日时、性别、出生城市。
**只问这一个问题，等待回答后再推进。**`;
    case 'family_info':
      return `当前处于【第二步：家庭背景采集】。
请向缘主询问：父母出生年份（或生肖），兄弟姐妹几人、排行第几。
**只问这一个问题，等待回答后再推进。**`;
    case 'life_events':
      return `当前处于【第三步：应期信息采集（核心定盘）】。
请向缘主询问：1-2件印象最深的人生大事（年份+事件类型）。
**只问这一个问题，等待回答后再推进。**`;
    case 'concerns':
      return `当前处于【第四步：关注领域采集】。
请向缘主询问：最想了解哪些方面？有什么具体问题？
**只问这一个问题，等待回答后再推进。**`;
    case 'complete':
      return '所有信息已采集完毕，可以排盘分析了。如果尚未排盘，请立即调用 paipan。';
  }
}

/**
 * Get a summary of what's been collected vs. missing.
 */
export function getIntakeSummary(state: IntakeState): string {
  const p = state.profile;
  const lines: string[] = ['📋 信息采集状态:', `当前步骤: ${state.step}`];

  if (p.birthYear) lines.push('  ✅ 出生时间');
  else lines.push('  ⬜ 出生时间');

  if (p.birthCity) lines.push('  ✅ 出生城市');
  else lines.push('  ⬜ 出生城市');

  if (p.parents?.fatherBirthYear || p.parents?.motherBirthYear) lines.push('  ✅ 父母信息');
  else lines.push('  ⬜ 父母信息');

  if (p.siblings?.rank) lines.push('  ✅ 排行信息');
  else lines.push('  ⬜ 排行信息');

  if (p.lifeEvents && p.lifeEvents.length > 0) lines.push('  ✅ 重大事件');
  else lines.push('  ⬜ 重大事件');

  if (p.concerns && p.concerns.length > 0) lines.push('  ✅ 关注领域');
  else lines.push('  ⬜ 关注领域');

  return lines.join('\n');
}
