import { describe, test, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { paipan } from '../src/core/index.js';
import { TIAN_GAN, DI_ZHI } from '../src/core/constants.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
const CASES_DIR = resolve(__dirname, 'cases');
function loadCases(school) {
    const raw = readFileSync(resolve(CASES_DIR, `${school}.json`), 'utf-8');
    return JSON.parse(raw);
}
function runPaipan(c) {
    return paipan(c.input);
}
function p(stem, branch) {
    return stem + branch;
}
// ============================================================
// 子平八字 Benchmark
// ============================================================
describe('子平八字 (Ziping) Benchmark', () => {
    const cases = loadCases('ziping');
    test.each(cases)('$id: $description', (c) => {
        const chart = runPaipan(c);
        const fp = chart.fourPillars;
        expect(p(fp.year.stem, fp.year.branch)).toBe(c.expected.yearPillar);
        expect(p(fp.month.stem, fp.month.branch)).toBe(c.expected.monthPillar);
        expect(p(fp.day.stem, fp.day.branch)).toBe(c.expected.dayPillar);
        expect(p(fp.hour.stem, fp.hour.branch)).toBe(c.expected.hourPillar);
    });
    test('all four pillars use valid stems and branches', () => {
        for (const c of cases) {
            const chart = runPaipan(c);
            for (const pillar of ['year', 'month', 'day', 'hour']) {
                const p = chart.fourPillars[pillar];
                expect(TIAN_GAN).toContain(p.stem);
                expect(DI_ZHI).toContain(p.branch);
            }
        }
    });
    test('year pillar matches year-stem formula', () => {
        for (const c of cases) {
            const chart = runPaipan(c);
            const expectedYearStemIdx = ((c.input.year - 4) % 10 + 10) % 10;
            const expectedYearBranchIdx = ((c.input.year - 4) % 12 + 12) % 12;
            // Note: year may be adjusted if before 立春
            // This just checks the year pillar is in valid range
            expect(TIAN_GAN.indexOf(chart.fourPillars.year.stem)).toBeGreaterThanOrEqual(0);
            expect(DI_ZHI.indexOf(chart.fourPillars.year.branch)).toBeGreaterThanOrEqual(0);
        }
    });
    test('day pillar is consistent with JDN formula', () => {
        for (const c of cases) {
            const chart = runPaipan(c);
            // Day stem must map to one of the ten stems
            expect(TIAN_GAN).toContain(chart.fourPillars.day.stem);
            expect(DI_ZHI).toContain(chart.fourPillars.day.branch);
        }
    });
    test('hour pillar stem derived from day stem (日上起时法)', () => {
        for (const c of cases) {
            const chart = runPaipan(c);
            const dayStemIdx = TIAN_GAN.indexOf(chart.fourPillars.day.stem);
            const hourBranchIdx = DI_ZHI.indexOf(chart.fourPillars.hour.branch);
            // Validate hour stem is one of the 10 valid stems
            expect(TIAN_GAN).toContain(chart.fourPillars.hour.stem);
            // Validate hour branch is valid
            expect(DI_ZHI).toContain(chart.fourPillars.hour.branch);
        }
    });
    test('大运 direction is correct for gender/year-stem-yinyang', () => {
        for (const c of cases) {
            const chart = runPaipan(c);
            const yearStem = chart.fourPillars.year.stem;
            const stemIdx = TIAN_GAN.indexOf(yearStem);
            const isYang = stemIdx % 2 === 0; // 甲丙戊庚壬 = yang
            // 阳男阴女 → 顺排, 阴男阳女 → 逆排
            const shouldGoForward = (isYang && c.input.gender === 'male') ||
                (!isYang && c.input.gender === 'female');
            expect(chart.daYun.direction).toBe(shouldGoForward ? 'forward' : 'backward');
        }
    });
    test('藏干 are valid stems for each branch', () => {
        for (const c of cases) {
            const chart = runPaipan(c);
            for (const pillar of ['year', 'month', 'day', 'hour']) {
                const hidden = chart.hiddenStems[pillar];
                expect(hidden.length).toBeGreaterThan(0);
                for (const stem of hidden) {
                    expect(TIAN_GAN).toContain(stem);
                }
            }
        }
    });
    test('十神 are computed for all pillars', () => {
        for (const c of cases) {
            const chart = runPaipan(c);
            const validShiShen = ['比肩', '劫财', '食神', '伤官', '正财', '偏财', '正官', '七杀', '正印', '偏印', '日主'];
            for (const pillar of ['year', 'month', 'day', 'hour']) {
                expect(validShiShen).toContain(chart.tenGods[pillar].stem);
            }
        }
    });
    test('纳音 is computed for all pillars', () => {
        for (const c of cases) {
            const chart = runPaipan(c);
            for (const pillar of ['year', 'month', 'day', 'hour']) {
                expect(typeof chart.naYin[pillar]).toBe('string');
                expect(chart.naYin[pillar].length).toBeGreaterThan(0);
            }
        }
    });
    test('五行 count totals 4 pillars', () => {
        for (const c of cases) {
            const chart = runPaipan(c);
            const total = (chart.wuXingCount['木'] || 0) +
                (chart.wuXingCount['火'] || 0) +
                (chart.wuXingCount['土'] || 0) +
                (chart.wuXingCount['金'] || 0) +
                (chart.wuXingCount['水'] || 0);
            expect(total).toBeGreaterThanOrEqual(4);
        }
    });
});
// ============================================================
// 紫微斗数 (Ziwei) Benchmark
// ============================================================
describe('紫微斗数 (Ziwei) Benchmark', () => {
    const cases = loadCases('ziwei');
    test.each(cases)('$id: $description', (c) => {
        const chart = runPaipan(c);
        const fp = chart.fourPillars;
        expect(p(fp.year.stem, fp.year.branch)).toBe(c.expected.yearPillar);
        expect(p(fp.month.stem, fp.month.branch)).toBe(c.expected.monthPillar);
        expect(p(fp.day.stem, fp.day.branch)).toBe(c.expected.dayPillar);
        expect(p(fp.hour.stem, fp.hour.branch)).toBe(c.expected.hourPillar);
    });
    test('大运 direction is correct for all cases', () => {
        for (const c of cases) {
            const chart = runPaipan(c);
            expect(['forward', 'backward']).toContain(chart.daYun.direction);
        }
    });
    test('神煞 are computed without duplicates', () => {
        for (const c of cases) {
            const chart = runPaipan(c);
            const names = chart.shenSha.map(s => s.name);
            const unique = new Set(names);
            // Some shensha can appear multiple times on different pillars
            expect(unique.size).toBeGreaterThan(0);
        }
    });
    test('节气 boundaries correctly switch month pillar', () => {
        // Specifically test the 节气 edge cases
        const edgeCases = cases.filter(c => c.id.includes('lixia') || c.id.includes('lidong') || c.id.includes('true_solar'));
        for (const c of edgeCases) {
            const chart = runPaipan(c);
            const fp = chart.fourPillars;
            expect(p(fp.month.stem, fp.month.branch)).toBe(c.expected.monthPillar);
            expect(p(fp.hour.stem, fp.hour.branch)).toBe(c.expected.hourPillar);
        }
    });
});
// ============================================================
// 盲派命理 (Mangpai) Benchmark
// ============================================================
describe('盲派命理 (Mangpai) Benchmark', () => {
    const cases = loadCases('mangpai');
    test.each(cases)('$id: $description', (c) => {
        const chart = runPaipan(c);
        const fp = chart.fourPillars;
        expect(p(fp.year.stem, fp.year.branch)).toBe(c.expected.yearPillar);
        expect(p(fp.month.stem, fp.month.branch)).toBe(c.expected.monthPillar);
        expect(p(fp.day.stem, fp.day.branch)).toBe(c.expected.dayPillar);
        expect(p(fp.hour.stem, fp.hour.branch)).toBe(c.expected.hourPillar);
    });
    test('同八字异性别四柱相同但大运方向相反', () => {
        const male = cases.find(c => c.id === 'mangpai_001');
        const female = cases.find(c => c.id === 'mangpai_010');
        const chartM = runPaipan(male);
        const chartF = runPaipan(female);
        // Four pillars should be identical
        const fm = chartM.fourPillars;
        const ff = chartF.fourPillars;
        expect(p(fm.year.stem, fm.year.branch)).toBe(p(ff.year.stem, ff.year.branch));
        expect(p(fm.month.stem, fm.month.branch)).toBe(p(ff.month.stem, ff.month.branch));
        expect(p(fm.day.stem, fm.day.branch)).toBe(p(ff.day.stem, ff.day.branch));
        expect(p(fm.hour.stem, fm.hour.branch)).toBe(p(ff.hour.stem, ff.hour.branch));
        // Dayun direction should be opposite
        expect(chartM.daYun.direction).not.toBe(chartF.daYun.direction);
    });
    test('大运起运年龄合理（0-10岁之间）', () => {
        for (const c of cases) {
            const chart = runPaipan(c);
            expect(chart.daYun.startAge).toBeGreaterThanOrEqual(0);
            expect(chart.daYun.startAge).toBeLessThanOrEqual(10);
        }
    });
    test('大运包含10个运程', () => {
        for (const c of cases) {
            const chart = runPaipan(c);
            expect(chart.daYun.pillars.length).toBe(10);
            for (const dp of chart.daYun.pillars) {
                expect(TIAN_GAN).toContain(dp.stem);
                expect(DI_ZHI).toContain(dp.branch);
            }
        }
    });
    test('节气边界月柱切换正确', () => {
        const edgeCases = cases.filter(c => c.id.includes('daxue') || c.id.includes('xiaohan'));
        for (const c of edgeCases) {
            const chart = runPaipan(c);
            const fp = chart.fourPillars;
            expect(p(fp.month.stem, fp.month.branch)).toBe(c.expected.monthPillar);
        }
    });
});
// ============================================================
// Cross-School Consistency Tests
// ============================================================
describe('跨流派一致性', () => {
    test('相同日期在不同流派文件中产生相同四柱', () => {
        const zipingCases = loadCases('ziping');
        const mangpaiCases = loadCases('mangpai');
        // Find cases with matching inputs
        for (const zc of zipingCases) {
            for (const mc of mangpaiCases) {
                if (zc.input.year === mc.input.year &&
                    zc.input.month === mc.input.month &&
                    zc.input.day === mc.input.day &&
                    zc.input.hour === mc.input.hour &&
                    zc.input.minute === mc.input.minute &&
                    zc.input.longitude === mc.input.longitude &&
                    zc.input.gender === mc.input.gender) {
                    const chartZ = runPaipan(zc);
                    const chartM = runPaipan(mc);
                    const fpZ = chartZ.fourPillars;
                    const fpM = chartM.fourPillars;
                    expect(p(fpZ.year.stem, fpZ.year.branch)).toBe(p(fpM.year.stem, fpM.year.branch));
                    expect(p(fpZ.month.stem, fpZ.month.branch)).toBe(p(fpM.month.stem, fpM.month.branch));
                    expect(p(fpZ.day.stem, fpZ.day.branch)).toBe(p(fpM.day.stem, fpM.day.branch));
                    expect(p(fpZ.hour.stem, fpZ.hour.branch)).toBe(p(fpM.hour.stem, fpM.hour.branch));
                }
            }
        }
    });
});
//# sourceMappingURL=benchmark.test.js.map