// ============================================================
// FateRead - Constants (天干地支常量表)
// ============================================================

import type { TianGan, DiZhi, WuXing, YinYang, ShiShen } from './types.js';

/** 十天干 */
export const TIAN_GAN: TianGan[] = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

/** 十二地支 */
export const DI_ZHI: DiZhi[] = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/** 天干对应五行 */
export const STEM_ELEMENT: Record<TianGan, WuXing> = {
  '甲': '木', '乙': '木',
  '丙': '火', '丁': '火',
  '戊': '土', '己': '土',
  '庚': '金', '辛': '金',
  '壬': '水', '癸': '水',
};

/** 地支对应五行 */
export const BRANCH_ELEMENT: Record<DiZhi, WuXing> = {
  '子': '水', '丑': '土',
  '寅': '木', '卯': '木',
  '辰': '土', '巳': '火',
  '午': '火', '未': '土',
  '申': '金', '酉': '金',
  '戌': '土', '亥': '水',
};

/** 天干阴阳 */
export const STEM_YIN_YANG: Record<TianGan, YinYang> = {
  '甲': '阳', '乙': '阴',
  '丙': '阳', '丁': '阴',
  '戊': '阳', '己': '阴',
  '庚': '阳', '辛': '阴',
  '壬': '阳', '癸': '阴',
};

/** 地支阴阳 */
export const BRANCH_YIN_YANG: Record<DiZhi, YinYang> = {
  '子': '阳', '丑': '阴',
  '寅': '阳', '卯': '阴',
  '辰': '阳', '巳': '阴',
  '午': '阳', '未': '阴',
  '申': '阳', '酉': '阴',
  '戌': '阳', '亥': '阴',
};

/** 地支藏干表 */
export const HIDDEN_STEMS: Record<DiZhi, TianGan[]> = {
  '子': ['癸'],
  '丑': ['己', '癸', '辛'],
  '寅': ['甲', '丙', '戊'],
  '卯': ['乙'],
  '辰': ['戊', '乙', '癸'],
  '巳': ['丙', '戊', '庚'],
  '午': ['丁', '己'],
  '未': ['己', '丁', '乙'],
  '申': ['庚', '壬', '戊'],
  '酉': ['辛'],
  '戌': ['戊', '辛', '丁'],
  '亥': ['壬', '甲'],
};

/** 五行相生 */
export const WUXING_SHENG: Record<WuXing, WuXing> = {
  '木': '火',  // 木生火
  '火': '土',  // 火生土
  '土': '金',  // 土生金
  '金': '水',  // 金生水
  '水': '木',  // 水生木
};

/** 五行相克 */
export const WUXING_KE: Record<WuXing, WuXing> = {
  '木': '土',  // 木克土
  '土': '水',  // 土克水
  '水': '火',  // 水克火
  '火': '金',  // 火克金
  '金': '木',  // 金克木
};

/** 五行被生（生我者） */
export const WUXING_SHENG_WO: Record<WuXing, WuXing> = {
  '木': '水',  // 水生木
  '火': '木',  // 木生火
  '土': '火',  // 火生土
  '金': '土',  // 土生金
  '水': '金',  // 金生水
};

/** 五行被克（克我者） */
export const WUXING_KE_WO: Record<WuXing, WuXing> = {
  '木': '金',  // 金克木
  '火': '水',  // 水克火
  '土': '木',  // 木克土
  '金': '火',  // 火克金
  '水': '土',  // 土克水
};

/** 六十甲子纳音 */
export const JIAZI_NAYIN: string[] = [
  '海中金', '海中金', '炉中火', '炉中火', '大林木', '大林木',
  '路旁土', '路旁土', '剑锋金', '剑锋金', '山头火', '山头火',
  '涧下水', '涧下水', '城头土', '城头土', '白蜡金', '白蜡金',
  '杨柳木', '杨柳木', '泉中水', '泉中水', '屋上土', '屋上土',
  '霹雳火', '霹雳火', '松柏木', '松柏木', '长流水', '长流水',
  '沙中金', '沙中金', '山下火', '山下火', '平地木', '平地木',
  '壁上土', '壁上土', '金箔金', '金箔金', '覆灯火', '覆灯火',
  '天河水', '天河水', '大驿土', '大驿土', '钗钏金', '钗钏金',
  '桑拓木', '桑拓木', '大溪水', '大溪水', '沙中土', '沙中土',
  '天上火', '天上火', '石榴木', '石榴木', '大海水', '大海水',
];

/**
 * 月支固定对应表（正月=寅, 二月=卯, ...）
 * 注意：以节气为界，不是农历月份
 */
export const MONTH_BRANCHES: DiZhi[] = [
  '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'
];

/**
 * 年干推月干口诀（年上起月法）:
 * 甲己之年丙作首，乙庚之岁戊为头
 * 丙辛必定寻庚上，丁壬壬寅顺水流
 * 若问戊癸何处起，甲寅之上好追求
 */
export const YEAR_STEM_TO_MONTH_STEM_START: Record<number, number> = {
  0: 2, // 甲/己年 → 丙寅月起
  1: 4, // 乙/庚年 → 戊寅月起
  2: 6, // 丙/辛年 → 庚寅月起
  3: 8, // 丁/壬年 → 壬寅月起
  4: 0, // 戊/癸年 → 甲寅月起
};

/**
 * 日干推时干口诀（日上起时法）:
 * 甲己还加甲，乙庚丙作初
 * 丙辛从戊起，丁壬庚子居
 * 戊癸何方发，壬子是真途
 */
export const DAY_STEM_TO_HOUR_STEM_START: Record<number, number> = {
  0: 0, // 甲/己日 → 甲子时起
  1: 2, // 乙/庚日 → 丙子时起
  2: 4, // 丙/辛日 → 戊子时起
  3: 6, // 丁/壬日 → 庚子时起
  4: 8, // 戊/癸日 → 壬子时起
};

/**
 * 十二时辰对应的小时范围
 * 子时: 23:00 - 00:59
 * 丑时: 01:00 - 02:59
 * ...
 */
export const HOUR_TO_BRANCH_INDEX: (hour: number) => number = (hour: number) => {
  // 23:00-00:59 → 子(0), 01:00-02:59 → 丑(1), ...
  if (hour === 23) return 0;
  return Math.floor((hour + 1) / 2);
};

/**
 * 推算十神关系
 * @param dayStem 日干（我）
 * @param targetStem 目标天干
 * @returns 十神名称
 */
export function getShiShen(dayStem: TianGan, targetStem: TianGan): ShiShen | '日主' {
  if (dayStem === targetStem) return '日主';

  const myElement = STEM_ELEMENT[dayStem];
  const targetElement = STEM_ELEMENT[targetStem];
  const myYinYang = STEM_YIN_YANG[dayStem];
  const targetYinYang = STEM_YIN_YANG[targetStem];
  const samePolarity = myYinYang === targetYinYang;

  // 同我者
  if (myElement === targetElement) {
    return samePolarity ? '比肩' : '劫财';
  }
  // 我生者
  if (WUXING_SHENG[myElement] === targetElement) {
    return samePolarity ? '食神' : '伤官';
  }
  // 我克者
  if (WUXING_KE[myElement] === targetElement) {
    return samePolarity ? '偏财' : '正财';
  }
  // 克我者
  if (WUXING_KE_WO[myElement] === targetElement) {
    return samePolarity ? '七杀' : '正官';
  }
  // 生我者
  if (WUXING_SHENG_WO[myElement] === targetElement) {
    return samePolarity ? '偏印' : '正印';
  }

  return '比肩'; // fallback (should not reach here)
}

/** 获取干支序号（0-59），用于纳音等计算 */
export function getJiaZiIndex(stem: TianGan, branch: DiZhi): number {
  const stemIdx = TIAN_GAN.indexOf(stem);
  const branchIdx = DI_ZHI.indexOf(branch);
  // 六十甲子表中的位置
  // 天干和地支都是偶数或都是奇数才能配对
  for (let i = 0; i < 60; i++) {
    if (i % 10 === stemIdx && i % 12 === branchIdx) {
      return i;
    }
  }
  return 0;
}

/** 获取纳音 */
export function getNaYin(stem: TianGan, branch: DiZhi): string {
  const index = getJiaZiIndex(stem, branch);
  return JIAZI_NAYIN[index];
}
