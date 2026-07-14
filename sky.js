/* 地面观星模式 · sky.js — 站在地球表面看天空的天文馆视角, 全离线自含。
 * 天文引擎: JD/GMST/LST · Standish J2000 根数 → of-date 行星/太阳 RA/Dec(黄经加岁差 p_A)
 *          · Meeus 第47章月球全历表(60+60 项, 移植自 app.js, 直接用瞬时黄道配瞬时春分点)
 *          · 月球视差校正(地心→站心), 大气折射简式, 日食遮蔽率。
 * 渲染: canvas2D 立体投影(stereographic), 拖拽方位/高度, 滚轮视场 30°~120°。
 * 依赖全局(缺失自动降级): SOLAR_DATA / STAR_CATALOG / STAR_NAMES / CONSTELLATIONS。
 * node VM 可加载: 引擎经 window.__sky 暴露, DOM 部分自动跳过。 */
(function () {
  "use strict";
  const W = (typeof window !== "undefined") ? window : globalThis;

  /* ================================ 天文引擎 ================================ */
  const D2R = Math.PI / 180, R2D = 180 / Math.PI, TAU = Math.PI * 2;
  const J2000 = 2451545.0, AU_KM = 149597870.7;
  const SUN_R_KM = 695700, MOON_R_KM = 1737.4, EARTH_R_KM = 6378.137;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function norm360(d) { d %= 360; return d < 0 ? d + 360 : d; }
  function normPi(a) {
    a %= TAU;
    return a < -Math.PI ? a + TAU : a > Math.PI ? a - TAU : a;
  }

  /* ---------- 时间: 儒略日 / ΔT / 恒星时 ---------- */
  function jdFromUnixMs(ms) { return ms / 86400000 + 2440587.5; }
  function unixMsFromJd(jd) { return (jd - 2440587.5) * 86400000; }
  function deltaTSec(jdUt) {                       // NASA 2005-2050 多项式, 邻域外平滑延用
    const t = (jdUt - J2000) / 365.25;             // 年 - 2000
    return 62.92 + 0.32217 * t + 0.005589 * t * t;
  }
  function jdTT(jdUt) { return jdUt + deltaTSec(jdUt) / 86400; }
  function gmstDeg(jdUt) {                         // IAU 简式(度)
    const d = jdUt - J2000, T = d / 36525;
    return norm360(280.46061837 + 360.98564736629 * d + 0.000387933 * T * T - T * T * T / 38710000);
  }
  function lstDeg(jdUt, lonDeg) { return norm360(gmstDeg(jdUt) + lonDeg); }

  /* ---------- 黄赤转换(of-date)与岁差 ---------- */
  function eclObliqDeg(jdTt) {                     // 瞬时平黄赤交角
    const T = (jdTt - J2000) / 36525;
    return 23.43929111 - 0.01300417 * T - 1.6389e-7 * T * T;
  }
  function precessLonDeg(jdTt) {                   // 黄经总岁差 p_A(J2000 → of-date)
    const T = (jdTt - J2000) / 36525;
    return (5029.0966 * T + 1.11113 * T * T) / 3600;
  }
  function eclToEq(lonDeg, latDeg, jdTt) {         // 瞬时黄道 → 瞬时赤道 (Meeus 13.3/13.4)
    const eps = eclObliqDeg(jdTt) * D2R, l = lonDeg * D2R, b = latDeg * D2R;
    const sl = Math.sin(l), cl = Math.cos(l), se = Math.sin(eps), ce = Math.cos(eps);
    const ra = Math.atan2(sl * ce - Math.tan(b) * se, cl);
    const dec = Math.asin(clamp(Math.sin(b) * ce + Math.cos(b) * se * sl, -1, 1));
    return { ra: norm360(ra * R2D), dec: dec * R2D };
  }

  /* ---------- 行星: Standish 根数 → 日心黄道(J2000, AU) ---------- */
  let _els = null;
  function orbitEls() {
    if (!_els) {
      _els = {};
      const sd = W.SOLAR_DATA;
      if (sd && sd.bodies) for (const b of sd.bodies) if (b.orbit_j2000) _els[b.name] = b.orbit_j2000;
    }
    return _els;
  }
  function solveKepler(M, e) {
    let E = e > 0.8 ? (M < 0 ? -Math.PI : Math.PI) : M;
    for (let i = 0; i < 60; i += 1) {
      const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= d;
      if (Math.abs(d) <= 1e-12) break;
    }
    return E;
  }
  function helioEclJ2000Au(el, jdTt, out) {
    const T = (jdTt - J2000) / 36525;
    const a = el.a_au + el.a_rate * T, e = el.e + el.e_rate * T;
    const inc = (el.i_deg + el.i_rate * T) * D2R;
    const L = el.L_deg + el.L_rate * T;
    const peri = el.peri_deg + el.peri_rate * T;
    const node = el.node_deg + el.node_rate * T;
    const b = el.b || 0, c = el.c || 0, s = el.s || 0, f = el.f || 0;
    const M = normPi((L - peri + b * T * T + c * Math.cos(f * T * D2R) + s * Math.sin(f * T * D2R)) * D2R);
    const E = solveKepler(M, e);
    const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const w = (peri - node) * D2R, o = node * D2R;
    const cw = Math.cos(w), sw = Math.sin(w), co = Math.cos(o), so = Math.sin(o);
    const ci = Math.cos(inc), si = Math.sin(inc);
    out[0] = (cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp;
    out[1] = (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp;
    out[2] = (sw * si) * xp + (cw * si) * yp;
    return out;
  }
  const _he = [0, 0, 0], _hp = [0, 0, 0];
  /* 地心 of-date RA/Dec: 日心 J2000 黄道差矢量 → 黄经加 p_A → 瞬时赤道 */
  function bodyRaDec(name, jdUt) {
    const jt = jdTT(jdUt), els = orbitEls();
    if (!els.Earth) return { ra: 0, dec: 0, distAu: 1, rHelioAu: 1 };
    helioEclJ2000Au(els.Earth, jt, _he);
    let vx, vy, vz, rH = 0;
    if (name === "Sun") { vx = -_he[0]; vy = -_he[1]; vz = -_he[2]; }
    else {
      if (!els[name]) return { ra: 0, dec: 0, distAu: 1, rHelioAu: 1 };
      helioEclJ2000Au(els[name], jt, _hp);
      vx = _hp[0] - _he[0]; vy = _hp[1] - _he[1]; vz = _hp[2] - _he[2];
      rH = Math.hypot(_hp[0], _hp[1], _hp[2]);
    }
    const dist = Math.hypot(vx, vy, vz);
    const lon = norm360(Math.atan2(vy, vx) * R2D + precessLonDeg(jt));
    const lat = Math.asin(clamp(vz / dist, -1, 1)) * R2D;
    const eq = eclToEq(lon, lat, jt);
    return { ra: eq.ra, dec: eq.dec, distAu: dist, rHelioAu: rH };
  }
  function sunRaDec(jdUt) { return bodyRaDec("Sun", jdUt); }

  /* ---------- 月球: Meeus 47 章全历表(60+60 项) — 移植自 app.js ----------
   * 输出瞬时黄道黄经/黄纬/距离(of-date), 直接配瞬时春分点 — 地面观星正确框架。 */
  const MOON_LR = [
    [0,0,1,0,6288774,-20905355],[2,0,-1,0,1274027,-3699111],[2,0,0,0,658314,-2955968],
    [0,0,2,0,213618,-569925],[0,1,0,0,-185116,48888],[0,0,0,2,-114332,-3149],
    [2,0,-2,0,58793,246158],[2,-1,-1,0,57066,-152138],[2,0,1,0,53322,-170733],
    [2,-1,0,0,45758,-204586],[0,1,-1,0,-40923,-129620],[1,0,0,0,-34720,108743],
    [0,1,1,0,-30383,104755],[2,0,0,-2,15327,10321],[0,0,1,2,-12528,0],
    [0,0,1,-2,10980,79661],[4,0,-1,0,10675,-34782],[0,0,3,0,10034,-23210],
    [4,0,-2,0,8548,-21636],[2,1,-1,0,-7888,24208],[2,1,0,0,-6766,30824],
    [1,0,-1,0,-5163,-8379],[1,1,0,0,4987,-16675],[2,-1,1,0,4036,-12831],
    [2,0,2,0,3994,-10445],[4,0,0,0,3861,-11650],[2,0,-3,0,3665,14403],
    [0,1,-2,0,-2689,-7003],[2,0,-1,2,-2602,0],[2,-1,-2,0,2390,10056],
    [1,0,1,0,-2348,6322],[2,-2,0,0,2236,-9884],[0,1,2,0,-2120,5751],
    [0,2,0,0,-2069,0],[2,-2,-1,0,2048,-4950],[2,0,1,-2,-1773,4130],
    [2,0,0,2,-1595,0],[4,-1,-1,0,1215,-3958],[0,0,2,2,-1110,0],
    [3,0,-1,0,-892,3258],[2,1,1,0,-810,2616],[4,-1,-2,0,759,-1897],
    [0,2,-1,0,-713,-2117],[2,2,-1,0,-700,2354],[2,1,-2,0,691,0],
    [2,-1,0,-2,596,0],[4,0,1,0,549,-1423],[0,0,4,0,537,-1117],
    [4,-1,0,0,520,-1571],[1,0,-2,0,-487,-1739],[2,1,0,-2,-399,0],
    [0,0,2,-2,-381,-4421],[1,1,1,0,351,0],[3,0,-2,0,-340,0],
    [4,0,-3,0,330,0],[2,-1,2,0,327,0],[0,2,1,0,-323,1165],
    [1,1,-1,0,299,0],[2,0,3,0,294,0],[2,0,-1,-2,0,8752]
  ];
  const MOON_B = [
    [0,0,0,1,5128122],[0,0,1,1,280602],[0,0,1,-1,277693],[2,0,0,-1,173237],
    [2,0,-1,1,55413],[2,0,-1,-1,46271],[2,0,0,1,32573],[0,0,2,1,17198],
    [2,0,1,-1,9266],[0,0,2,-1,8822],[2,-1,0,-1,8216],[2,0,-2,-1,4324],
    [2,0,1,1,4200],[2,1,0,-1,-3359],[2,-1,-1,1,2463],[2,-1,0,1,2211],
    [2,-1,-1,-1,2065],[0,1,-1,-1,-1870],[4,0,-1,-1,1828],[0,1,0,1,-1794],
    [0,0,0,3,-1749],[0,1,-1,1,-1565],[1,0,0,1,-1491],[0,1,1,1,-1475],
    [0,1,1,-1,-1410],[0,1,0,-1,-1344],[1,0,0,-1,-1335],[0,0,3,1,1107],
    [4,0,0,-1,1021],[4,0,-1,1,833],[0,0,1,-3,777],[4,0,-2,1,671],
    [2,0,0,-3,607],[2,0,2,-1,596],[2,-1,1,-1,491],[2,0,-2,1,-451],
    [0,0,3,-1,439],[2,0,2,1,422],[2,0,-3,-1,421],[2,1,-1,1,-366],
    [2,1,0,1,-351],[4,0,0,1,331],[2,-1,1,1,315],[2,-2,0,-1,302],
    [0,0,1,3,-283],[2,1,1,-1,-229],[1,1,0,-1,223],[1,1,0,1,223],
    [0,1,-2,-1,-220],[2,1,-1,-1,-220],[1,0,1,1,-185],[2,-1,-2,-1,181],
    [0,1,2,1,-177],[4,0,-2,-1,176],[4,-1,-1,-1,166],[1,0,1,-1,-164],
    [4,0,1,-1,132],[1,0,-1,-1,-119],[4,-1,0,-1,115],[2,-2,0,1,107]
  ];
  function moonEclOfDate(jdTt) {
    const T = (jdTt - J2000) / 36525, T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    const Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000;
    const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000;
    const Ms = 357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000;
    const Mm = 134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000;
    const F = 93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000;
    const A1 = (119.75 + 131.849 * T) * D2R;
    const A2 = (53.09 + 479264.290 * T) * D2R;
    const A3 = (313.45 + 481266.484 * T) * D2R;
    const E = 1 - 0.002516 * T - 0.0000074 * T2, EE = [1, E, E * E];
    const Dr = D * D2R, Mr = Ms * D2R, Pr = Mm * D2R, Fr = F * D2R, Lr = Lp * D2R;
    let sl = 0, sr = 0, sb = 0;
    for (let i = 0; i < MOON_LR.length; i += 1) {
      const t = MOON_LR[i];
      const arg = t[0] * Dr + t[1] * Mr + t[2] * Pr + t[3] * Fr;
      const e = EE[t[1] < 0 ? -t[1] : t[1]];
      sl += t[4] * e * Math.sin(arg);
      sr += t[5] * e * Math.cos(arg);
    }
    sl += 3958 * Math.sin(A1) + 1962 * Math.sin(Lr - Fr) + 318 * Math.sin(A2);
    for (let i = 0; i < MOON_B.length; i += 1) {
      const t = MOON_B[i];
      sb += t[4] * EE[t[1] < 0 ? -t[1] : t[1]] *
        Math.sin(t[0] * Dr + t[1] * Mr + t[2] * Pr + t[3] * Fr);
    }
    sb += -2235 * Math.sin(Lr) + 382 * Math.sin(A3) + 175 * Math.sin(A1 - Fr)
      + 175 * Math.sin(A1 + Fr) + 127 * Math.sin(Lr - Pr) - 115 * Math.sin(Lr + Pr);
    return { lonDeg: norm360(Lp + sl / 1e6), latDeg: sb / 1e6, rKm: 385000.56 + sr / 1000 };
  }
  function moonRaDec(jdUt) {                       // 地心 of-date
    const jt = jdTT(jdUt);
    const m = moonEclOfDate(jt);
    const eq = eclToEq(m.lonDeg, m.latDeg, jt);
    return { ra: eq.ra, dec: eq.dec, distKm: m.rKm };
  }
  function moonTopo(jdUt, latDeg, lonDeg) {        // 站心(视差校正, 球形地球)
    const g = moonRaDec(jdUt);
    const ra = g.ra * D2R, de = g.dec * D2R, r = g.distKm;
    const cd = Math.cos(de);
    const gx = r * cd * Math.cos(ra), gy = r * cd * Math.sin(ra), gz = r * Math.sin(de);
    const lst = lstDeg(jdUt, lonDeg) * D2R, phi = latDeg * D2R;
    const cp = Math.cos(phi);
    const x = gx - EARTH_R_KM * cp * Math.cos(lst);
    const y = gy - EARTH_R_KM * cp * Math.sin(lst);
    const z = gz - EARTH_R_KM * Math.sin(phi);
    const d = Math.hypot(x, y, z);
    return { ra: norm360(Math.atan2(y, x) * R2D), dec: Math.asin(clamp(z / d, -1, 1)) * R2D, distKm: d };
  }

  /* ---------- 地平坐标 / 折射 / 角距 / 日食 ---------- */
  function altazDeg(raDeg, decDeg, jdUt, latDeg, lonDeg) {
    const H = (lstDeg(jdUt, lonDeg) - raDeg) * D2R;
    const phi = latDeg * D2R, de = decDeg * D2R;
    const sh = Math.sin(phi) * Math.sin(de) + Math.cos(phi) * Math.cos(de) * Math.cos(H);
    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(de) * Math.cos(phi));
    return { alt: Math.asin(clamp(sh, -1, 1)) * R2D, az: norm360(az * R2D + 180) };  // 方位北起顺时针
  }
  function refractionArcmin(altDeg) {              // Sæmundsson 简式(角分)
    const h = Math.max(altDeg, -1.9);
    return 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * D2R);
  }
  function angSepDeg(ra1, dec1, ra2, dec2) {
    const a1 = ra1 * D2R, d1 = dec1 * D2R, a2 = ra2 * D2R, d2 = dec2 * D2R;
    const c = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(a1 - a2);
    return Math.acos(clamp(c, -1, 1)) * R2D;
  }
  function obscurationFrac(d, rs, rm) {            // 圆盘重叠面积 / 日面
    if (d >= rs + rm) return 0;
    if (d <= Math.abs(rm - rs)) return rm >= rs ? 1 : (rm * rm) / (rs * rs);
    const d2 = d * d, rs2 = rs * rs, rm2 = rm * rm;
    const a1 = Math.acos(clamp((d2 + rs2 - rm2) / (2 * d * rs), -1, 1));
    const a2 = Math.acos(clamp((d2 + rm2 - rs2) / (2 * d * rm), -1, 1));
    const A = rs2 * a1 + rm2 * a2 -
      0.5 * Math.sqrt(Math.max(0, (-d + rs + rm) * (d + rs - rm) * (d - rs + rm) * (d + rs + rm)));
    return clamp(A / (Math.PI * rs2), 0, 1);
  }
  function sunAltAz(jdUt, latDeg, lonDeg) {
    const s = sunRaDec(jdUt);
    return altazDeg(s.ra, s.dec, jdUt, latDeg, lonDeg);
  }
  function moonAltAz(jdUt, latDeg, lonDeg) {
    const m = moonTopo(jdUt, latDeg, lonDeg);
    return altazDeg(m.ra, m.dec, jdUt, latDeg, lonDeg);
  }
  function eclipseState(jdUt, latDeg, lonDeg) {    // 站心日月圆盘几何
    const s = sunRaDec(jdUt), m = moonTopo(jdUt, latDeg, lonDeg);
    const sep = angSepDeg(s.ra, s.dec, m.ra, m.dec);
    const rs = Math.asin(SUN_R_KM / (s.distAu * AU_KM)) * R2D;
    const rm = Math.asin(MOON_R_KM / m.distKm) * R2D;
    return {
      sepDeg: sep, rsDeg: rs, rmDeg: rm,
      obsc: obscurationFrac(sep, rs, rm),
      mag: Math.max(0, (rs + rm - sep) / (2 * rs))
    };
  }

  /* node VM / 调试暴露 */
  W.__sky = {
    jdFromUnixMs, unixMsFromJd, deltaTSec, jdTT, gmstDeg, lstDeg,
    eclObliqDeg, precessLonDeg, eclToEq, bodyRaDec, sunRaDec,
    moonEclOfDate, moonRaDec, moonTopo,
    altaz: altazDeg, altazDeg, sunAltAz, moonAltAz,
    refractionArcmin, angSepDeg, obscurationFrac, eclipseState
  };

  /* ================================ 页面部分 ================================ */
  if (typeof document === "undefined") return;
  const cv = document.getElementById("skyCanvas");
  if (!cv) return;

  const ctx = cv.getContext("2d", { alpha: false });
  const labelsDiv = document.getElementById("labels");
  const $ = (id) => document.getElementById(id);

  /* ---------- 状态 ---------- */
  const PRESETS = [["北京", 39.90, 116.40], ["上海", 31.23, 121.47], ["广州", 23.13, 113.26], ["拉萨", 29.65, 91.14]];
  const loc = { name: "北京", lat: 39.90, lon: 116.40 };
  const view = { az: 180, alt: 28, fov: 70 };
  const state = { jd: jdFromUnixMs(Date.now()), mode: "real", speed: 0 };
  const opts = { lines: true, names: true, refr: true };

  try {
    const saved = JSON.parse(localStorage.getItem("sky_loc_v1") || "null");
    if (saved && isFinite(saved.lat) && isFinite(saved.lon)) {
      loc.name = saved.name || "自定义"; loc.lat = saved.lat; loc.lon = saved.lon;
    }
  } catch (e) { /* 忽略 */ }

  (function parseHash() {                          // 深链 #lat=..&lon=..&jd=..(&az=&alt=&fov=)
    const h = (location.hash || "").replace(/^#/, "");
    if (!h) return;
    const q = {};
    for (const kv of h.split("&")) {
      const i = kv.indexOf("=");
      if (i > 0) q[kv.slice(0, i)] = parseFloat(kv.slice(i + 1));
    }
    if (isFinite(q.lat) && isFinite(q.lon)) {
      loc.name = "深链位置"; loc.lat = clamp(q.lat, -89.9, 89.9); loc.lon = clamp(q.lon, -180, 180);
    }
    if (isFinite(q.jd) && q.jd > 2000000 && q.jd < 3000000) {
      state.jd = q.jd; state.mode = "speed"; state.speed = 0;   // 深链时刻: 暂停呈现
    }
    if (isFinite(q.az)) view.az = norm360(q.az);
    if (isFinite(q.alt)) view.alt = clamp(q.alt, -15, 85);
    if (isFinite(q.fov)) view.fov = clamp(q.fov, 30, 120);
  })();

  function saveLoc() {
    try { localStorage.setItem("sky_loc_v1", JSON.stringify(loc)); } catch (e) { /* 忽略 */ }
  }

  /* ---------- 星表预处理 ---------- */
  const CAT = W.STAR_CATALOG || [];
  const NS = (CAT.length / 7) | 0;
  const stRa = new Float64Array(NS), stSD = new Float64Array(NS),
        stCD = new Float64Array(NS), stTD = new Float64Array(NS);
  const stMag = new Float32Array(NS);
  const stCol = new Array(NS);
  function bvRgb(bv) {
    const K = [[-0.35, 155, 180, 255], [0, 195, 209, 255], [0.4, 252, 247, 255],
               [0.7, 255, 242, 222], [1.1, 255, 222, 180], [1.6, 255, 196, 138], [2.0, 255, 176, 110]];
    const v = clamp(bv, -0.35, 2.0);
    for (let i = 1; i < K.length; i += 1) {
      if (v <= K[i][0]) {
        const t = (v - K[i - 1][0]) / (K[i][0] - K[i - 1][0]);
        return [
          Math.round(K[i - 1][1] + (K[i][1] - K[i - 1][1]) * t),
          Math.round(K[i - 1][2] + (K[i][2] - K[i - 1][2]) * t),
          Math.round(K[i - 1][3] + (K[i][3] - K[i - 1][3]) * t)
        ];
      }
    }
    return [255, 176, 110];
  }
  const nameKey = (ra, dec) => ra.toFixed(2) + "_" + dec.toFixed(2);
  const catIdx = new Map();
  for (let i = 0; i < NS; i += 1) {
    const o = i * 7, ra = CAT[o], dec = CAT[o + 1], mag = CAT[o + 2], bv = CAT[o + 3];
    const dr = dec * D2R;
    stRa[i] = ra * D2R;
    stSD[i] = Math.sin(dr); stCD[i] = Math.cos(dr); stTD[i] = Math.tan(dr);
    stMag[i] = mag;
    const c = bvRgb(isFinite(bv) ? bv : 0.5);
    stCol[i] = c[0] + "," + c[1] + "," + c[2];
    catIdx.set(nameKey(ra, dec), i);
  }
  const starNames = [];                             // 亮星标签(与星表坐标全等绑定)
  for (const n of (W.STAR_NAMES || [])) {
    const i = catIdx.get(nameKey(n[0], n[1]));
    if (i !== undefined && stMag[i] <= 3.4) {
      starNames.push({ raR: stRa[i], sD: stSD[i], cD: stCD[i], tD: stTD[i], mag: stMag[i], name: n[2] });
    }
  }
  const segs = [];                                  // 星座连线端点(预转弧度)
  for (const c of (W.CONSTELLATIONS || [])) {
    for (const s of (c.seg || [])) {
      const d1 = s[1] * D2R, d2 = s[3] * D2R;
      segs.push({
        r1: s[0] * D2R, s1: Math.sin(d1), c1: Math.cos(d1), t1: Math.tan(d1),
        r2: s[2] * D2R, s2: Math.sin(d2), c2: Math.cos(d2), t2: Math.tan(d2)
      });
    }
  }

  const PLANETS = [
    { n: "Mercury", cn: "水星", H: -0.36, col: "#cabba4" },
    { n: "Venus",   cn: "金星", H: -4.38, col: "#f4ead0" },
    { n: "Mars",    cn: "火星", H: -1.52, col: "#ff9166" },
    { n: "Jupiter", cn: "木星", H: -9.40, col: "#ffd9a0" },
    { n: "Saturn",  cn: "土星", H: -8.88, col: "#f4e3ad" },
    { n: "Uranus",  cn: "天王星", H: -7.19, col: "#a9e4e4" },
    { n: "Neptune", cn: "海王星", H: -6.87, col: "#88a8ff" }
  ].filter(p => orbitEls()[p.n]);

  /* ---------- 投影(立体投影 stereographic) ---------- */
  let vw = 2, vh = 2, dpr = 1;
  let Fx = 0, Fy = 1, Fz = 0, Rx = 1, Ry = 0, Ux = 0, Uy = 0, Uz = 1, fpx = 500, cx = 0, cyv = 0;
  function updateBasis() {
    const aV = view.az * D2R, hV = view.alt * D2R;
    const ch = Math.cos(hV), sh = Math.sin(hV), ca = Math.cos(aV), sa = Math.sin(aV);
    Fx = ch * sa; Fy = ch * ca; Fz = sh;
    Rx = ca; Ry = -sa;                              // Rz = 0
    Ux = -sa * sh; Uy = -ca * sh; Uz = ch;
    fpx = (vw / 2) / (2 * Math.tan(view.fov * D2R / 4));
    cx = vw / 2; cyv = vh / 2;
  }
  const _p = { x: 0, y: 0, k: 0 };
  function projAA(altR, azR, cMin) {                // 高度/方位(弧度) → 屏幕
    const ch = Math.cos(altR);
    const dx = ch * Math.sin(azR), dy = ch * Math.cos(azR), dz = Math.sin(altR);
    const c = Fx * dx + Fy * dy + Fz * dz;
    if (c < cMin) return false;
    const k = 2 * fpx / (1 + Math.max(c, -0.92));
    _p.x = cx + k * (Rx * dx + Ry * dy);
    _p.y = cyv - k * (Ux * dx + Uy * dy + Uz * dz);
    _p.k = k;
    return true;
  }

  /* ---------- 程序化山脊(方位域值噪声, 周期 360°) ---------- */
  function hash1(n) { const s = Math.sin(n * 127.1 + 7 * 311.7) * 43758.5453; return s - Math.floor(s); }
  function ridgeAltDeg(azDeg) {
    const a = norm360(azDeg);
    let h = 0, amp = 2.3, grid = 24;                // 三倍频程: 24° / 8° / (8/3)°
    for (let o = 0; o < 3; o += 1) {
      const n = Math.round(360 / grid);
      const x = a / grid, i = Math.floor(x), fr = x - i;
      const u = fr * fr * (3 - 2 * fr);
      const v0 = hash1((i % n) + o * 97.13), v1 = hash1(((i + 1) % n) + o * 97.13);
      h += (v0 + (v1 - v0) * u) * amp;
      amp *= 0.42; grid /= 3;
    }
    return 0.4 + h;                                 // 约 0.4° ~ 4.4°
  }

  /* ---------- 天空颜色关键帧(按太阳高度) ---------- */
  const SKY_KEYS = [
    [20,  [70, 138, 224], [172, 208, 240]],
    [5,   [44, 98, 192],  [186, 196, 210]],
    [0,   [24, 50, 108],  [226, 142, 82]],
    [-6,  [11, 22, 52],   [86, 62, 84]],
    [-12, [5, 10, 28],    [24, 32, 60]],
    [-18, [2, 5, 14],     [9, 13, 26]]
  ];
  const NIGHT_ZEN = SKY_KEYS[5][1], NIGHT_HOR = SKY_KEYS[5][2];
  function lerp3(a, b, t, out) {
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    out[2] = a[2] + (b[2] - a[2]) * t;
  }
  const _zen = [0, 0, 0], _hor = [0, 0, 0];
  function skyCols(h, eDark) {
    const hh = clamp(h, -18, 20);
    let i = 1;
    while (i < SKY_KEYS.length - 1 && hh < SKY_KEYS[i][0]) i += 1;
    const A = SKY_KEYS[i - 1], B = SKY_KEYS[i];
    const t = clamp((A[0] - hh) / (A[0] - B[0]), 0, 1);
    lerp3(A[1], B[1], t, _zen); lerp3(A[2], B[2], t, _hor);
    if (eDark > 0) {                                // 日食压暗: 向纯夜色收敛
      lerp3(_zen, NIGHT_ZEN, eDark, _zen);
      lerp3(_hor, NIGHT_HOR, eDark, _hor);
    }
  }
  const rgb = (c) => "rgb(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + ")";

  /* ---------- 标签 DOM 池 ---------- */
  const pool = [];
  let poolUsed = 0;
  function putLabel(x, y, text, cls) {
    let el = pool[poolUsed];
    if (!el) { el = document.createElement("div"); labelsDiv.appendChild(el); pool.push(el); }
    if (el._t !== text) { el.textContent = text; el._t = text; }
    if (el._c !== cls) { el.className = "lbl " + cls; el._c = cls; }
    el.style.transform = "translate(" + Math.round(x + 7) + "px," + Math.round(y - 17) + "px)";
    if (el._h) { el.style.display = "block"; el._h = false; }
    poolUsed += 1;
  }
  function flushLabels() {
    for (let i = poolUsed; i < pool.length; i += 1) {
      if (!pool[i]._h) { pool[i].style.display = "none"; pool[i]._h = true; }
    }
    poolUsed = 0;
  }

  /* ---------- 主渲染 ---------- */
  let _lstR = 0, _sphi = 0, _cphi = 1;
  const _aa = { alt: 0, az: 0 };
  function altazFast(raR, sD, cD, tD, out) {
    const H = _lstR - raR;
    const cH = Math.cos(H), sH = Math.sin(H);
    const sh = _sphi * sD + _cphi * cD * cH;
    out.alt = Math.asin(sh < -1 ? -1 : sh > 1 ? 1 : sh);
    out.az = Math.atan2(sH, cH * _sphi - tD * _cphi) + Math.PI;
    return out;
  }
  function dispAltDeg(altDeg) {
    return (opts.refr && altDeg > -2.5 && altDeg < 89.9)
      ? altDeg + refractionArcmin(altDeg) / 60 : altDeg;
  }

  let frameNo = 0;
  function render() {
    frameNo += 1;
    updateBasis();
    const jd = state.jd;
    const lst = lstDeg(jd, loc.lon);
    _lstR = lst * D2R;
    const phiR = loc.lat * D2R;
    _sphi = Math.sin(phiR); _cphi = Math.cos(phiR);

    /* --- 天体位置 --- */
    const sun = sunRaDec(jd);
    const sunAA = altazDeg(sun.ra, sun.dec, jd, loc.lat, loc.lon);
    const moon = moonTopo(jd, loc.lat, loc.lon);
    const moonAA = altazDeg(moon.ra, moon.dec, jd, loc.lat, loc.lon);
    const psi = angSepDeg(sun.ra, sun.dec, moon.ra, moon.dec);   // 日月角距(视)
    const rsDeg = Math.asin(SUN_R_KM / (sun.distAu * AU_KM)) * R2D;
    const rmDeg = Math.asin(MOON_R_KM / moon.distKm) * R2D;
    const obsc = obscurationFrac(psi, rsDeg, rmDeg);
    const cosI = -Math.cos(psi * D2R);              // 月相角余弦(照亮比 = (1+cosI)/2)
    const h = sunAA.alt;

    /* --- 光照参数 --- */
    const eDark = (h > -3 && obsc > 0)
      ? (obsc < 0.75 ? obsc * 0.45 : 0.3375 + (obsc - 0.75) / 0.25 * 0.6625) : 0;
    let starA = h >= -2 ? 0 : h <= -14 ? 1 : (-2 - h) / 12;
    if (h > -2 && obsc > 0.88) starA = Math.max(starA, (obsc - 0.88) / 0.12 * 0.95);
    const magLim = 2.0 + starA * 3.6;
    const sizeK = clamp(Math.pow(75 / view.fov, 0.4), 0.8, 1.5);

    /* --- 1. 天空背景渐变 --- */
    skyCols(h, eDark);
    let yh = vh * 1.35;
    if (projAA(0, view.az * D2R, -0.5)) yh = _p.y;
    else if (view.alt < 0) yh = -vh * 0.35;
    if (yh > 30) {
      const g = ctx.createLinearGradient(0, Math.min(0, yh - vh), 0, clamp(yh, 30, vh * 1.6));
      g.addColorStop(0, rgb(_zen));
      g.addColorStop(1, rgb(_hor));
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = rgb(_hor);
    }
    ctx.fillRect(0, 0, vw, vh);

    /* --- 2. 晨昏太阳方向暖光 --- */
    const sunVisA = dispAltDeg(h);
    const sunP = { x: 0, y: 0, k: 0 };
    const sunOn = projAA(sunVisA * D2R, sunAA.az * D2R, -0.6);
    if (sunOn) { sunP.x = _p.x; sunP.y = _p.y; sunP.k = _p.k; }
    if (sunOn && h > -16 && eDark < 0.98) {
      const wA = clamp(1 - Math.abs(h) / 24, 0, 1) * 0.5 * (1 - eDark);
      if (wA > 0.01) {
        const t = clamp((6 - h) / 12, 0, 1);
        const r = Math.max(vw, vh) * 0.85;
        const g = ctx.createRadialGradient(sunP.x, sunP.y, 0, sunP.x, sunP.y, r);
        g.addColorStop(0, "rgba(255," + Math.round(214 - 100 * t) + "," + Math.round(130 - 76 * t) + "," + wA.toFixed(3) + ")");
        g.addColorStop(0.45, "rgba(255," + Math.round(190 - 90 * t) + "," + Math.round(110 - 66 * t) + "," + (wA * 0.32).toFixed(3) + ")");
        g.addColorStop(1, "rgba(255,160,60,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, vw, vh);
      }
    }

    /* --- 3. 恒星(地平预筛 + 屏幕裁剪) --- */
    if (starA > 0.02 && NS > 0) {
      const refrOn = opts.refr;
      for (let i = 0; i < NS; i += 1) {
        const m = stMag[i];
        if (m > magLim) continue;
        const H = _lstR - stRa[i];
        const cH = Math.cos(H);
        let sh = _sphi * stSD[i] + _cphi * stCD[i] * cH;
        if (sh < -0.015) continue;                  // 地平以下: 不再计算
        if (sh > 1) sh = 1;
        let altR = Math.asin(sh);
        let altD = altR * R2D;
        if (refrOn && altD < 12) { altD += refractionArcmin(altD) / 60; altR = altD * D2R; }
        const azR = Math.atan2(Math.sin(H), cH * _sphi - stTD[i] * _cphi) + Math.PI;
        if (!projAA(altR, azR, -0.5)) continue;
        const x = _p.x, y = _p.y;
        if (x < -24 || x > vw + 24 || y < -24 || y > vh + 24) continue;
        let a = starA * clamp((magLim - m) * 0.75, 0, 1);
        let col = stCol[i];
        if (altD < 10) {                            // 近地平消光: 变暗变红
          const e = clamp((altD + 1.5) / 11.5, 0, 1);
          a *= 0.18 + 0.82 * e;
          if (a < 0.03) continue;
          const parts = col.split(",");
          col = parts[0] + "," + Math.round(parts[1] * (0.55 + 0.45 * e)) + "," + Math.round(parts[2] * (0.38 + 0.62 * e));
        }
        if (a < 0.03) continue;
        const r = clamp((3.0 - 0.42 * m) * sizeK, 0.6, 5);
        ctx.fillStyle = "rgba(" + col + "," + a.toFixed(3) + ")";
        if (r < 1.0) {
          ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
        } else {
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
          if (m < 0.3) {                            // 极亮星淡晕
            ctx.fillStyle = "rgba(" + col + "," + (a * 0.2).toFixed(3) + ")";
            ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, TAU); ctx.fill();
          }
        }
      }
    }

    /* --- 4. 星座连线 --- */
    if (opts.lines && starA > 0.05 && segs.length) {
      ctx.strokeStyle = "rgba(110,168,255," + (0.30 * starA).toFixed(3) + ")";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < segs.length; i += 1) {
        const s = segs[i];
        altazFast(s.r1, s.s1, s.c1, s.t1, _aa);
        if (_aa.alt < -0.12) continue;
        if (!projAA(_aa.alt, _aa.az, -0.35)) continue;
        const x1 = _p.x, y1 = _p.y;
        altazFast(s.r2, s.s2, s.c2, s.t2, _aa);
        if (_aa.alt < -0.12) continue;
        if (!projAA(_aa.alt, _aa.az, -0.35)) continue;
        const x2 = _p.x, y2 = _p.y;
        if ((x1 < -30 && x2 < -30) || (x1 > vw + 30 && x2 > vw + 30) ||
            (y1 < -30 && y2 < -30) || (y1 > vh + 30 && y2 > vh + 30)) continue;
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      }
      ctx.stroke();
    }

    /* --- 5. 行星 --- */
    const planetHits = [];
    for (let i = 0; i < PLANETS.length; i += 1) {
      const P = PLANETS[i];
      const b = bodyRaDec(P.n, jd);
      const aa = altazDeg(b.ra, b.dec, jd, loc.lat, loc.lon);
      if (aa.alt < -1.5) continue;
      const mag = P.H + 5 * Math.log10(Math.max(1e-6, b.rHelioAu * b.distAu));
      const dayVis = clamp((-mag - 3.3), 0, 1) * 0.85;     // 金星级亮星白昼可见
      const a = Math.max(starA, dayVis);
      if (a < 0.04) continue;
      if (!projAA(dispAltDeg(aa.alt) * D2R, aa.az * D2R, -0.4)) continue;
      if (_p.x < -30 || _p.x > vw + 30 || _p.y < -30 || _p.y > vh + 30) continue;
      const r = clamp((2.6 - 0.32 * mag) * sizeK, 1.4, 5.4);
      ctx.globalAlpha = a * 0.25;
      ctx.fillStyle = P.col;
      ctx.beginPath(); ctx.arc(_p.x, _p.y, r * 2.1, 0, TAU); ctx.fill();
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(_p.x, _p.y, r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      planetHits.push({ x: _p.x, y: _p.y, cn: P.cn, a });
    }

    /* --- 6. 太阳(圆盘按真实视半径) --- */
    let sunScr = null;
    if (sunOn && sunVisA > -1.8 && sunP.x > -260 && sunP.x < vw + 260 && sunP.y > -260 && sunP.y < vh + 260) {
      const Rs = Math.max(rsDeg * D2R * sunP.k, 1.6);
      const glareA = 0.9 * (1 - obsc) * (1 - obsc);
      if (glareA > 0.01) {
        const gr = Rs * 7 + 46;
        const g = ctx.createRadialGradient(sunP.x, sunP.y, Rs * 0.4, sunP.x, sunP.y, gr);
        g.addColorStop(0, "rgba(255,246,214," + (glareA * 0.9).toFixed(3) + ")");
        g.addColorStop(0.35, "rgba(255,224,160," + (glareA * 0.35).toFixed(3) + ")");
        g.addColorStop(1, "rgba(255,200,120,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(sunP.x, sunP.y, gr, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = "#fff7dd";
      ctx.beginPath(); ctx.arc(sunP.x, sunP.y, Rs, 0, TAU); ctx.fill();
      sunScr = { x: sunP.x, y: sunP.y, Rs };
    }

    /* --- 7. 月亮(真实圆缺 + 视差大小; 日食时月盘遮日盘) --- */
    let moonScr = null;
    const moonVisA = dispAltDeg(moonAA.alt);
    if (moonVisA > -1.8 && projAA(moonVisA * D2R, moonAA.az * D2R, -0.4)) {
      const mx = _p.x, my = _p.y;
      if (mx > -220 && mx < vw + 220 && my > -220 && my < vh + 220) {
        const Rm = Math.max(rmDeg * D2R * _p.k, 1.4);
        const limbAng = Math.atan2(sunP.y - my, sunP.x - mx);   // 亮缘朝向太阳(屏幕系)
        const illum = (1 + cosI) / 2;
        const darkA = (obsc > 0 && h > -4) ? 0.985 : starA * 0.4;
        const brightA = 0.62 + 0.38 * starA;
        ctx.save();
        ctx.translate(mx, my);
        if (Rm < 2.8) {
          ctx.fillStyle = "rgba(244,241,232," + Math.max(brightA * Math.max(illum, 0.25), darkA).toFixed(3) + ")";
          ctx.beginPath(); ctx.arc(0, 0, Rm, 0, TAU); ctx.fill();
        } else {
          ctx.rotate(limbAng);
          if (darkA > 0.004) {                      // 暗面(夜: 地照; 日食: 遮挡剪影)
            ctx.fillStyle = "rgba(11,12,17," + darkA.toFixed(3) + ")";
            ctx.beginPath(); ctx.arc(0, 0, Rm, 0, TAU); ctx.fill();
          }
          if (illum > 0.002) {                      // 亮面: 半圆 + 椭圆明暗界线
            ctx.beginPath();
            ctx.arc(0, 0, Rm, -Math.PI / 2, Math.PI / 2, false);
            if (cosI >= 0) ctx.ellipse(0, 0, Rm * cosI, Rm, 0, Math.PI / 2, Math.PI * 1.5, false);
            else ctx.ellipse(0, 0, Rm * (-cosI), Rm, 0, Math.PI / 2, -Math.PI / 2, true);
            ctx.closePath();
            ctx.fillStyle = "rgba(246,243,234," + brightA.toFixed(3) + ")";
            ctx.fill();
            ctx.fillStyle = "rgba(180,178,190," + (brightA * 0.22).toFixed(3) + ")";  // 淡海影
            ctx.beginPath(); ctx.arc(Rm * 0.28, -Rm * 0.2, Rm * 0.34, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.arc(Rm * 0.05, Rm * 0.3, Rm * 0.26, 0, TAU); ctx.fill();
          }
        }
        ctx.restore();
        moonScr = { x: mx, y: my, Rm };
        /* 日冕: 全食前后浮现 */
        if (obsc > 0.965 && sunScr) {
          const cA = Math.pow((obsc - 0.965) / 0.035, 1.3);
          const g = ctx.createRadialGradient(sunScr.x, sunScr.y, Rm * 0.92, sunScr.x, sunScr.y, Rm * 4.2);
          g.addColorStop(0, "rgba(232,238,255," + (0.92 * cA).toFixed(3) + ")");
          g.addColorStop(0.28, "rgba(214,224,250," + (0.34 * cA).toFixed(3) + ")");
          g.addColorStop(1, "rgba(200,214,246,0)");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(sunScr.x, sunScr.y, Rm * 4.2, 0, TAU); ctx.fill();
        }
      }
    }

    /* --- 8. 地面山脊剪影 --- */
    const dayF = clamp((h + 6) / 14, 0, 1) * (1 - eDark);
    const gc = [10 + 34 * dayF, 14 + 44 * dayF, 12 + 36 * dayF];
    const half = clamp(view.fov * 0.75 + 18, 40, 108);
    const step = (half * 2) / 150;
    let first = -1, lastX = 0, firstX = 0;
    ctx.beginPath();
    for (let a = view.az - half; a <= view.az + half + 1e-6; a += step) {
      if (!projAA(ridgeAltDeg(a) * D2R, a * D2R, -0.25)) continue;
      if (first < 0) { ctx.moveTo(_p.x, _p.y); firstX = _p.x; first = 1; }
      else ctx.lineTo(_p.x, _p.y);
      lastX = _p.x;
    }
    if (first > 0) {
      ctx.lineTo(lastX, vh + 90); ctx.lineTo(firstX, vh + 90); ctx.closePath();
      const g = ctx.createLinearGradient(0, Math.max(0, yh - 40), 0, vh);
      g.addColorStop(0, rgb(gc));
      g.addColorStop(1, rgb([gc[0] * 0.45, gc[1] * 0.45, gc[2] * 0.45]));
      ctx.fillStyle = g;
      ctx.fill();
    } else if (view.alt < 2) {
      ctx.fillStyle = rgb(gc);
      ctx.fillRect(0, 0, vw, vh);
    }

    /* --- 9. 方位标注 --- */
    const CARD = [[0, "北", 1], [45, "东北", 0], [90, "东", 1], [135, "东南", 0],
                  [180, "南", 1], [225, "西南", 0], [270, "西", 1], [315, "西北", 0]];
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    for (let i = 0; i < CARD.length; i += 1) {
      const cAz = CARD[i][0];
      if (!projAA((ridgeAltDeg(cAz) + 1.1) * D2R, cAz * D2R, 0.05)) continue;
      if (_p.x < -30 || _p.x > vw + 30 || _p.y < -20 || _p.y > vh + 30) continue;
      const main = CARD[i][2] === 1;
      ctx.font = (main ? "600 14px" : "11px") + " 'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.fillStyle = main ? "rgba(207,224,255,0.92)" : "rgba(143,163,200,0.75)";
      ctx.fillText(CARD[i][1], _p.x, _p.y);
      ctx.fillStyle = "rgba(160,190,255,0.5)";
      ctx.fillRect(_p.x - 0.5, _p.y + 2, 1, 5);
    }

    /* --- 10. 标签(DOM 覆盖层) --- */
    if (opts.names && starA > 0.3) {
      for (let i = 0; i < starNames.length; i += 1) {
        const sN = starNames[i];
        altazFast(sN.raR, sN.sD, sN.cD, sN.tD, _aa);
        if (_aa.alt < 0.008) continue;
        if (!projAA(_aa.alt, _aa.az, 0.05)) continue;
        if (_p.x < 0 || _p.x > vw || _p.y < 0 || _p.y > vh) continue;
        putLabel(_p.x, _p.y, sN.name, "st");
      }
    }
    for (let i = 0; i < planetHits.length; i += 1) {
      const ph = planetHits[i];
      if (ph.x >= 0 && ph.x <= vw && ph.y >= 0 && ph.y <= vh && ph.a > 0.12) putLabel(ph.x, ph.y, ph.cn, "pl");
    }
    if (sunScr && sunScr.x >= 0 && sunScr.x <= vw && sunScr.y >= 0 && sunScr.y <= vh) putLabel(sunScr.x + sunScr.Rs, sunScr.y, "太阳", "sm");
    if (moonScr && moonScr.x >= 0 && moonScr.x <= vw && moonScr.y >= 0 && moonScr.y <= vh) putLabel(moonScr.x + moonScr.Rm, moonScr.y + 12, "月亮", "sm");
    flushLabels();

    /* --- 11. 面板信息(约 5Hz) --- */
    if (frameNo % 12 === 1) {
      const eq = eclipseState(jd, loc.lat, loc.lon);
      $("stLst").textContent = fmtHms(lst / 15);
      $("stSun").textContent = h.toFixed(1) + "° / " + sunAA.az.toFixed(0) + "°";
      $("stMoon").textContent = moonAA.alt.toFixed(1) + "° / " + moonAA.az.toFixed(0) + "°";
      $("stPhase").textContent = ((1 + cosI) / 2 * 100).toFixed(0) + "%";
      $("stSep").textContent = psi < 10 ? psi.toFixed(2) + "°" : psi.toFixed(1) + "°";
      const badge = $("eclipseBadge");
      if (eq.obsc > 0.001 && h > -2) {
        badge.style.display = "block";
        badge.textContent = (eq.obsc >= 0.999 ? "日全食 · 全食中" : "日食进行中") +
          " · 食分 " + eq.mag.toFixed(2) + " · 遮蔽 " + (eq.obsc * 100).toFixed(0) + "%";
      } else badge.style.display = "none";
    }
  }

  /* ---------- 时间格式化 ---------- */
  const pad2 = (n) => (n < 10 ? "0" : "") + n;
  function fmtHms(hours) {
    const t = ((hours % 24) + 24) % 24;
    const hh = Math.floor(t), mm = Math.floor((t - hh) * 60);
    return pad2(hh) + "h " + pad2(mm) + "m";
  }
  const WD = ["日", "一", "二", "三", "四", "五", "六"];
  function updateClock() {
    const d = new Date(unixMsFromJd(state.jd));
    if (isNaN(d.getTime())) return;
    $("dateText").textContent =
      d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + " " +
      pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds()) +
      " 周" + WD[d.getDay()];
    const tz = -d.getTimezoneOffset() / 60;
    $("jdText").textContent = "JD " + state.jd.toFixed(5) + " · UTC" + (tz >= 0 ? "+" : "") + tz;
  }

  /* ---------- UI 绑定 ---------- */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = window.innerWidth; vh = window.innerHeight;
    cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
    cv.style.width = vw + "px"; cv.style.height = vh + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  /* 拖拽视心 */
  let dragging = false, lx = 0, ly = 0;
  cv.addEventListener("pointerdown", (e) => {
    dragging = true; lx = e.clientX; ly = e.clientY;
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - lx, dy = e.clientY - ly;
    lx = e.clientX; ly = e.clientY;
    const sc = R2D / fpx;
    view.az = norm360(view.az - dx * sc / Math.max(0.35, Math.cos(view.alt * D2R)));
    view.alt = clamp(view.alt + dy * sc, -15, 85);
  });
  const endDrag = () => { dragging = false; };
  cv.addEventListener("pointerup", endDrag);
  cv.addEventListener("pointercancel", endDrag);

  /* 滚轮视场 */
  cv.addEventListener("wheel", (e) => {
    e.preventDefault();
    view.fov = clamp(view.fov * (e.deltaY > 0 ? 1.09 : 1 / 1.09), 30, 120);
    $("fovText").textContent = "视场 " + view.fov.toFixed(0) + "°";
  }, { passive: false });
  $("fovText").textContent = "视场 " + view.fov.toFixed(0) + "°";

  /* 键盘 */
  document.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const stepA = view.fov / 14;
    if (e.key === "ArrowLeft") view.az = norm360(view.az - stepA);
    else if (e.key === "ArrowRight") view.az = norm360(view.az + stepA);
    else if (e.key === "ArrowUp") view.alt = clamp(view.alt + stepA, -15, 85);
    else if (e.key === "ArrowDown") view.alt = clamp(view.alt - stepA, -15, 85);
    else if (e.key === "+" || e.key === "=") view.fov = clamp(view.fov / 1.09, 30, 120);
    else if (e.key === "-") view.fov = clamp(view.fov * 1.09, 30, 120);
    else if (e.key === " ") {
      e.preventDefault();
      if (state.mode === "speed" && state.speed === 0) setMode("real");
      else setMode("speed", 0);
    } else return;
    $("fovText").textContent = "视场 " + view.fov.toFixed(0) + "°";
  });

  /* 时间控制 */
  function setMode(mode, speed) {
    state.mode = mode;
    if (mode === "speed") state.speed = speed;
    document.querySelectorAll("#timeBar button[data-v]").forEach((b) => {
      const v = b.getAttribute("data-v");
      const on = (mode === "real" && v === "real") ||
                 (mode === "speed" && v !== "real" && parseFloat(v) === state.speed);
      b.classList.toggle("active", on);
    });
  }
  document.querySelectorAll("#timeBar button[data-v]").forEach((b) => {
    b.addEventListener("click", () => {
      const v = b.getAttribute("data-v");
      if (v === "real") { state.jd = jdFromUnixMs(Date.now()); setMode("real"); }
      else setMode("speed", parseFloat(v));
    });
  });
  $("btnNow").addEventListener("click", () => { state.jd = jdFromUnixMs(Date.now()); setMode("real"); });
  const dtInput = $("dtInput");
  $("dateText").addEventListener("click", () => {
    const d = new Date(unixMsFromJd(state.jd));
    dtInput.value = d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) +
      "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
    dtInput.style.display = dtInput.style.display === "inline-block" ? "none" : "inline-block";
  });
  dtInput.addEventListener("change", () => {
    const t = new Date(dtInput.value).getTime();
    if (isFinite(t)) { state.jd = jdFromUnixMs(t); setMode("speed", 0); }
    dtInput.style.display = "none";
  });

  /* 地点 */
  function applyLoc(name, lat, lon) {
    loc.name = name; loc.lat = clamp(lat, -89.9, 89.9); loc.lon = clamp(lon, -180, 180);
    $("latInput").value = loc.lat; $("lonInput").value = loc.lon;
    $("locName").textContent = loc.name + " " + loc.lat.toFixed(2) + "°, " + loc.lon.toFixed(2) + "°";
    saveLoc();
  }
  const presetWrap = $("presetWrap");
  PRESETS.forEach((p) => {
    const b = document.createElement("button");
    b.textContent = p[0];
    b.addEventListener("click", () => applyLoc(p[0], p[1], p[2]));
    presetWrap.appendChild(b);
  });
  $("btnApplyLoc").addEventListener("click", () => {
    const la = parseFloat($("latInput").value), lo = parseFloat($("lonInput").value);
    if (isFinite(la) && isFinite(lo)) applyLoc("自定义", la, lo);
  });
  applyLoc(loc.name, loc.lat, loc.lon);

  /* 显示开关 */
  const bindChk = (id, key) => {
    const el = $(id);
    el.checked = opts[key];
    el.addEventListener("change", () => { opts[key] = el.checked; });
  };
  bindChk("chkLines", "lines");
  bindChk("chkNames", "names");
  bindChk("chkRefr", "refr");

  /* 天象速览: 2035-09-02 北京日全食(最大食 00:33:45 UTC, 已按 NASA 贝塞尔元素核对) */
  $("btnEclipse2035").addEventListener("click", () => {
    applyLoc("北京", 39.90, 116.40);
    state.jd = jdFromUnixMs(Date.UTC(2035, 8, 2, 0, 20, 0));
    setMode("speed", 60);                           // 1 分钟/秒, 十余秒后入全食
    const s = sunRaDec(state.jd);
    const aa = altazDeg(s.ra, s.dec, state.jd, loc.lat, loc.lon);
    view.az = aa.az; view.alt = clamp(aa.alt, -15, 85); view.fov = 42;
    $("fovText").textContent = "视场 " + view.fov.toFixed(0) + "°";
  });

  /* 面板折叠 */
  $("panelToggle").addEventListener("click", () => $("panel").classList.toggle("collapsed"));

  setMode(state.mode, state.speed);

  /* ---------- 主循环: rAF + document.hidden 跳帧 ---------- */
  let lastPerf = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { lastPerf = now; return; }
    const dt = Math.min((now - lastPerf) / 1000, 0.5);
    lastPerf = now;
    if (state.mode === "real") state.jd = jdFromUnixMs(Date.now());
    else if (state.speed !== 0) state.jd += dt * state.speed / 86400;
    render();
    updateClock();
  }
  document.addEventListener("visibilitychange", () => { lastPerf = performance.now(); });
  requestAnimationFrame(frame);
})();
