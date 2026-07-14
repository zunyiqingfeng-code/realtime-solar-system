/* 名星真实系外行星名录 exoplanets.js — 2026-07-12(依 2025 年前已发表的真实发现编纂)
 * 字段: mStar 恒星质量(M☉); a_au 半长轴(AU); p_d 轨道周期(天); mclass 质量类别;
 *       disc 发现年; hz 是否位于居住带; note 备注(争议/存疑条目必注)。
 * 内部一致性校验(开普勒第三定律 P_calc = 365.25·sqrt(a_au³/mStar), 与 p_d 比较):
 *   11 个系统 / 15 颗行星全部通过, 阈值 8%; 最大偏差 3.63%(毕宿五 b, 巨星质量不确定所致),
 *   次大 2.73%(天苑四 b), 其余 <0.4%。
 * 约定与说明:
 *   - 轩辕十四(Regulus): 截至 2024 无确认行星, 按约定跳过。
 *   - 北落师门 b (Dagon): 2008 直接成像"行星", 2020 年研究(Gáspár & Rieke)认定更可能是
 *     行星际碰撞尘埃云, 2023 JWST 未见点源 — 争议条目, 按要求保留并注明。
 *   - 毕宿五 b: Hatzes 2015 提出, Reichert 2019 质疑其存在 — 存疑条目。
 *   - 巴纳德星 b: 2024 ESPRESSO 确认(P=3.15 天); 2018 年 233 天候选已被否定, 勿混淆。
 *   - 印第安座ε Ab: 2019 RV 提示, 2024 JWST 直接成像确认; 轨道尚欠约束, p_d 为开普勒推算值。
 *   - 天仓五取 e/f 两颗(g/h 略), 均为 2012 提出、2017 再确认。 */
window.EXOPLANETS = {
"比邻星": { mStar: 0.122, planets: [
  { name: "b", a_au: 0.04857, p_d: 11.187, mclass: "类地(≥1.07M⊕)", disc: 2016, hz: true },
  { name: "d", a_au: 0.02885, p_d: 5.122, mclass: "亚地球(≥0.26M⊕)", disc: 2022, hz: false }
]},
"巴纳德星": { mStar: 0.162, planets: [
  { name: "b", a_au: 0.0229, p_d: 3.1533, mclass: "亚地球(≥0.37M⊕)", disc: 2024, hz: false,
    note: "ESPRESSO 2024; 2018年233天旧候选已被否定" }
]},
"拉兰德21185": { mStar: 0.39, planets: [
  { name: "b", a_au: 0.0788, p_d: 12.9394, mclass: "超级地球(≥2.7M⊕)", disc: 2017, hz: false },
  { name: "c", a_au: 2.94, p_d: 2946.1, mclass: "类海王星(≥13M⊕)", disc: 2021, hz: false }
]},
"罗斯128": { mStar: 0.168, planets: [
  { name: "b", a_au: 0.0496, p_d: 9.8658, mclass: "类地(≥1.35M⊕)", disc: 2017, hz: true }
]},
"拉卡伊9352": { mStar: 0.489, planets: [
  { name: "b", a_au: 0.068, p_d: 9.262, mclass: "超级地球(≥4.2M⊕)", disc: 2020, hz: false },
  { name: "c", a_au: 0.12, p_d: 21.789, mclass: "超级地球(≥7.6M⊕)", disc: 2020, hz: false }
]},
"印第安座ε": { mStar: 0.762, planets: [
  { name: "Ab", a_au: 28.4, p_d: 63330, mclass: "超级木星(~6.3MJup)", disc: 2024, hz: false,
    note: "JWST 2024 成像确认; 轨道欠约束, p_d 为开普勒推算" }
]},
"天苑四": { mStar: 0.82, planets: [
  { name: "b", a_au: 3.48, p_d: 2692, mclass: "类木星(~0.7MJup)", disc: 2000, hz: false }
]},
"天仓五": { mStar: 0.783, planets: [
  { name: "e", a_au: 0.538, p_d: 162.87, mclass: "超级地球(≥3.9M⊕)", disc: 2012, hz: true,
    note: "乐观居住带内缘" },
  { name: "f", a_au: 1.334, p_d: 636.13, mclass: "超级地球(≥3.9M⊕)", disc: 2012, hz: true }
]},
"北落师门": { mStar: 1.92, planets: [
  { name: "b", a_au: 177, p_d: 620700, mclass: "尘埃云/争议行星(Dagon)", disc: 2008, hz: false,
    note: "2020 研究认为是碰撞尘埃云, 2023 JWST 未见点源; 争议条目" }
]},
"北河三": { mStar: 1.7, planets: [
  { name: "b", a_au: 1.64, p_d: 589.64, mclass: "巨行星(≥2.3MJup)", disc: 2006, hz: false }
]},
"毕宿五": { mStar: 1.13, planets: [
  { name: "b", a_au: 1.46, p_d: 628.96, mclass: "巨行星(~6.5MJup)", disc: 2015, hz: false,
    note: "Reichert 2019 质疑, 存疑条目" }
]}
};
