// ============================================================
// FateRead - Core Type Definitions
// 命理学核心类型定义
// ============================================================

/** 天干 */
export type TianGan = '甲' | '乙' | '丙' | '丁' | '戊' | '己' | '庚' | '辛' | '壬' | '癸';

/** 地支 */
export type DiZhi = '子' | '丑' | '寅' | '卯' | '辰' | '巳' | '午' | '未' | '申' | '酉' | '戌' | '亥';

/** 五行 */
export type WuXing = '金' | '木' | '水' | '火' | '土';

/** 阴阳 */
export type YinYang = '阳' | '阴';

/** 十神 */
export type ShiShen =
  | '比肩' | '劫财'
  | '食神' | '伤官'
  | '偏财' | '正财'
  | '七杀' | '正官'
  | '偏印' | '正印';

/** 柱（天干 + 地支） */
export interface Pillar {
  stem: TianGan;
  branch: DiZhi;
}

/** 四柱 */
export interface FourPillars {
  year: Pillar;
  month: Pillar;
  day: Pillar;
  hour: Pillar;
}

/** 大运信息 */
export interface DaYun {
  startAge: number;
  direction: 'forward' | 'backward';
  pillars: DaYunPillar[];
}

/** 单步大运 */
export interface DaYunPillar {
  pillar: Pillar;
  startAge: number;
  endAge: number;
}

/** 流年 */
export interface LiuNian {
  year: number;
  pillar: Pillar;
}

/** 神煞 */
export interface ShenShaItem {
  name: string;
  description: string;
  position: string; // 出现在哪一柱
}

/** 五行统计 */
export interface WuXingCount {
  金: number;
  木: number;
  水: number;
  火: number;
  土: number;
}

/** 日元旺衰 */
export type DayMasterStrength = 'very_strong' | 'strong' | 'neutral' | 'weak' | 'very_weak';

/** 格局类型 */
export type GeJu =
  | '正官格' | '七杀格'
  | '正印格' | '偏印格'
  | '正财格' | '偏财格'
  | '食神格' | '伤官格'
  | '建禄格' | '羊刃格'
  | '从强格' | '从弱格'
  | '杂气格';

/** 十神分布 */
export interface TenGodsMap {
  year: { stem: ShiShen; branch: ShiShen[] };
  month: { stem: ShiShen; branch: ShiShen[] };
  day: { stem: string; branch: ShiShen[] }; // 日干为"我"
  hour: { stem: ShiShen; branch: ShiShen[] };
}

/** 完整命盘 */
export interface BaziChart {
  // 基础信息
  birthInfo: {
    solarDate: string;        // 公历日期
    lunarDate: string;        // 农历日期
    trueSolarTime: string;    // 真太阳时
    gender: 'male' | 'female';
    longitude?: number;
  };

  // 四柱
  fourPillars: FourPillars;

  // 藏干
  hiddenStems: {
    year: TianGan[];
    month: TianGan[];
    day: TianGan[];
    hour: TianGan[];
  };

  // 十神
  tenGods: TenGodsMap;

  // 纳音
  naYin: {
    year: string;
    month: string;
    day: string;
    hour: string;
  };

  // 大运
  daYun: DaYun;

  // 当前流年
  currentLiuNian?: LiuNian;

  // 神煞
  shenSha: ShenShaItem[];

  // 五行统计
  wuXingCount: WuXingCount;

  // 分析结论
  analysis: {
    dayMaster: TianGan;
    dayMasterElement: WuXing;
    dayMasterStrength: DayMasterStrength;
    usefulGod: WuXing;       // 用神
    harmfulGod: WuXing;      // 忌神
    pattern: GeJu;           // 格局
    seasonalAdjust: string;  // 调候建议
  };
}

/** 排盘输入 */
export interface PaipanInput {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  gender: 'male' | 'female';
  longitude?: number;  // 出生地经度（用于真太阳时校正）
}

// ============================================================
// 缘主画像（Intake System）
// 命同而人生各异 —— 八字是"经线"，以下信息是"纬线"
// ============================================================

/** 父母年命信息 */
export interface ParentInfo {
  fatherBirthYear?: number;   // 父亲出生年份
  motherBirthYear?: number;   // 母亲出生年份
  fatherGanZhi?: string;      // 父亲年命干支（如"甲子"）
  motherGanZhi?: string;      // 母亲年命干支
  notes?: string;             // 补充说明（如父母健在/离异等）
}

/** 兄弟姐妹信息 */
export interface SiblingInfo {
  rank: number;               // 排行（第几个）
  totalSiblings: number;      // 兄弟姐妹总数
  siblingBirthYears?: number[]; // 兄弟姐妹出生年份
  isTwin?: boolean;           // 是否为双胞胎
  twinBirthMinuteDiff?: number; // 双胞胎出生时间差（分钟）
  notes?: string;
}

/** 重大人生事件（用于定盘和应期验证） */
export interface LifeEvent {
  year: number;               // 事件发生年份
  category: 'career' | 'education' | 'marriage' | 'health' | 'wealth' | 'family' | 'other';
  description: string;        // 事件描述
  isPositive?: boolean;       // 吉/凶
}

/** 缘主画像：八字之外的"纬线"信息 */
export interface UserProfile {
  // ---- 基础八字信息（必填） ----
  birthYear: number;
  birthMonth: number;
  birthDay: number;
  birthHour: number;
  birthMinute?: number;
  gender: 'male' | 'female';
  birthCity?: string;         // 出生城市
  birthLongitude?: number;    // 出生地经度

  // ---- 第一类：根源信息（定根基） ----
  parents?: ParentInfo;

  // ---- 第二类：结构信息（定太极点） ----
  siblings?: SiblingInfo;

  // ---- 第三类：应期信息（定刻度） ----
  lifeEvents?: LifeEvent[];

  // ---- 缘主关注的问题 ----
  concerns?: string[];        // 最关心的领域（事业/财运/感情/健康/学业等）
  specificQuestion?: string;  // 具体想问的问题

  // ---- 采集状态 ----
  intakeComplete?: boolean;   // 信息采集是否完成
}
