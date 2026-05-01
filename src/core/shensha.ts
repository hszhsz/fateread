// ============================================================
// FateRead - ShenSha Calculator (神煞计算)
// ============================================================

import type { TianGan, DiZhi, FourPillars, ShenShaItem } from './types.js';
import { TIAN_GAN, DI_ZHI } from './constants.js';

/**
 * 计算四柱中的神煞
 * 神煞是命理学中用来辅助判断命运吉凶的特殊标志
 */
export function calculateShenSha(fourPillars: FourPillars): ShenShaItem[] {
  const result: ShenShaItem[] = [];
  const dayStem = fourPillars.day.stem;
  const yearBranch = fourPillars.year.branch;

  // 收集所有地支
  const allBranches: { branch: DiZhi; pos: string }[] = [
    { branch: fourPillars.year.branch, pos: '年支' },
    { branch: fourPillars.month.branch, pos: '月支' },
    { branch: fourPillars.day.branch, pos: '日支' },
    { branch: fourPillars.hour.branch, pos: '时支' },
  ];

  // 收集所有天干
  const allStems: { stem: TianGan; pos: string }[] = [
    { stem: fourPillars.year.stem, pos: '年干' },
    { stem: fourPillars.month.stem, pos: '月干' },
    { stem: fourPillars.hour.stem, pos: '时干' },
  ];

  // ── 天乙贵人 ──
  const tianyiMap: Record<TianGan, DiZhi[]> = {
    '甲': ['丑', '未'], '戊': ['丑', '未'],
    '乙': ['子', '申'], '己': ['子', '申'],
    '丙': ['酉', '亥'], '丁': ['酉', '亥'],
    '庚': ['丑', '未'], '辛': ['寅', '午'],
    '壬': ['卯', '巳'], '癸': ['卯', '巳'],
  };
  const tianyiBranches = tianyiMap[dayStem];
  for (const { branch, pos } of allBranches) {
    if (tianyiBranches.includes(branch)) {
      result.push({ name: '天乙贵人', description: '逢凶化吉，遇难呈祥', position: pos });
    }
  }

  // ── 文昌贵人 ──
  const wenchangMap: Record<TianGan, DiZhi> = {
    '甲': '巳', '乙': '午', '丙': '申', '丁': '酉', '戊': '申',
    '己': '酉', '庚': '亥', '辛': '子', '壬': '寅', '癸': '卯',
  };
  const wenchangBranch = wenchangMap[dayStem];
  for (const { branch, pos } of allBranches) {
    if (branch === wenchangBranch) {
      result.push({ name: '文昌贵人', description: '聪明好学，利考试科举', position: pos });
    }
  }

  // ── 驿马 ──
  // 以年支或日支查驿马
  const yimaMap: Record<DiZhi, DiZhi> = {
    '寅': '申', '午': '申', '戌': '申',
    '申': '寅', '子': '寅', '辰': '寅',
    '巳': '亥', '酉': '亥', '丑': '亥',
    '亥': '巳', '卯': '巳', '未': '巳',
  };
  const yimaBranch = yimaMap[yearBranch];
  if (yimaBranch) {
    for (const { branch, pos } of allBranches) {
      if (branch === yimaBranch) {
        result.push({ name: '驿马', description: '主奔波、迁移、出行', position: pos });
      }
    }
  }

  // ── 桃花（咸池） ──
  const taohuaMap: Record<DiZhi, DiZhi> = {
    '寅': '卯', '午': '卯', '戌': '卯',
    '申': '酉', '子': '酉', '辰': '酉',
    '巳': '午', '酉': '午', '丑': '午',
    '亥': '子', '卯': '子', '未': '子',
  };
  const taohuaBranch = taohuaMap[yearBranch];
  if (taohuaBranch) {
    for (const { branch, pos } of allBranches) {
      if (branch === taohuaBranch) {
        result.push({ name: '桃花', description: '主人缘、异性缘、艺术才华', position: pos });
      }
    }
  }

  // ── 华盖 ──
  const huagaiMap: Record<DiZhi, DiZhi> = {
    '寅': '戌', '午': '戌', '戌': '戌',
    '申': '辰', '子': '辰', '辰': '辰',
    '巳': '丑', '酉': '丑', '丑': '丑',
    '亥': '未', '卯': '未', '未': '未',
  };
  const huagaiBranch = huagaiMap[yearBranch];
  if (huagaiBranch) {
    for (const { branch, pos } of allBranches) {
      if (branch === huagaiBranch) {
        result.push({ name: '华盖', description: '主孤高、艺术、宗教缘', position: pos });
      }
    }
  }

  // ── 天德贵人 ──
  const tiandeMonthMap: Record<DiZhi, TianGan> = {
    '寅': '丁', '卯': '申' as unknown as TianGan, // 简化处理
    '辰': '壬', '巳': '辛',
    '午': '甲', '未': '癸',
    '申': '壬', '酉': '辛', // 简化
    '戌': '丁', '亥': '甲',
    '子': '癸', '丑': '庚',
  };
  // 简化版：以月支查天德
  const tiandeStem = tiandeMonthMap[fourPillars.month.branch];
  if (tiandeStem) {
    for (const { stem, pos } of allStems) {
      if (stem === tiandeStem) {
        result.push({ name: '天德贵人', description: '逢凶化吉，德行深厚', position: pos });
      }
    }
  }

  // ── 羊刃 ──
  const yangrenMap: Record<TianGan, DiZhi> = {
    '甲': '卯', '乙': '辰', '丙': '午', '丁': '未', '戊': '午',
    '己': '未', '庚': '酉', '辛': '戌', '壬': '子', '癸': '丑',
  };
  const yangrenBranch = yangrenMap[dayStem];
  for (const { branch, pos } of allBranches) {
    if (branch === yangrenBranch) {
      result.push({ name: '羊刃', description: '主刚强、果断，过旺则有灾', position: pos });
    }
  }

  // ── 将星 ──
  const jiangxingMap: Record<DiZhi, DiZhi> = {
    '寅': '午', '午': '午', '戌': '午',
    '申': '子', '子': '子', '辰': '子',
    '巳': '酉', '酉': '酉', '丑': '酉',
    '亥': '卯', '卯': '卯', '未': '卯',
  };
  const jiangxingBranch = jiangxingMap[yearBranch];
  if (jiangxingBranch) {
    for (const { branch, pos } of allBranches) {
      if (branch === jiangxingBranch) {
        result.push({ name: '将星', description: '主权威、领导才能', position: pos });
      }
    }
  }

  // ── 孤辰寡宿 ──
  const guchenMap: Record<DiZhi, DiZhi> = {
    '寅': '巳', '卯': '巳', '辰': '巳',
    '巳': '申', '午': '申', '未': '申',
    '申': '亥', '酉': '亥', '戌': '亥',
    '亥': '寅', '子': '寅', '丑': '寅',
  };
  const guasuMap: Record<DiZhi, DiZhi> = {
    '寅': '丑', '卯': '丑', '辰': '丑',
    '巳': '辰', '午': '辰', '未': '辰',
    '申': '未', '酉': '未', '戌': '未',
    '亥': '戌', '子': '戌', '丑': '戌',
  };
  const guchenBranch = guchenMap[yearBranch];
  const guasuBranch = guasuMap[yearBranch];
  for (const { branch, pos } of allBranches) {
    if (branch === guchenBranch) {
      result.push({ name: '孤辰', description: '主孤独、独立', position: pos });
    }
    if (branch === guasuBranch) {
      result.push({ name: '寡宿', description: '主清高、寡合', position: pos });
    }
  }

  return result;
}
