/* ============================================================
 * 实时太阳系 · 网页端 v2.4
 * - 真实贴图(NASA / Solar System Scope / Planet Pixel Emporium)
 * - J2000 开普勒历表(JPL Standish 六根数, 与 Blender 端同一数据脊柱)
 * - 双尺度: 真实(1BU=1000km) / 观感(对数压缩), 连续混合
 * - 太阳辉光 + Bloom, 地球昼夜/云层/大气, 土星环, 真实星空
 * - 深空细节: 矮行星(谷神星/冥王星+卡戎)、哈雷彗星(双彗尾)、
 *   柯伊伯带(冥族/经典带/离散盘)、火卫一/二、海卫一(逆行)
 * - 物理引擎 v2.4: 月球 Meeus 历表、地月/冥卫质心、卫星椭圆轨道、
 *   IAU 极轴真实指向、地球 ERA 自转相位、哈雷分段密切根数
 * - 完全离线: three.js 本地打包 + base64 内嵌贴图 + 程序化补充贴图
 * ============================================================ */
(function () {
  "use strict";
  const { THREE, OrbitControls, EffectComposer, RenderPass, UnrealBloomPass, OutputPass } = window.VENDOR;

  const AU_KM = 149597870.7;
  const J2000 = 2451545.0;
  const SCALE = {
    sceneUnitKm: 1000.0,      // 真实尺度: 1BU = 1000km
    cinDistScale: 30.0,       // 观感尺度: 距离对数压缩系数
    cinRadScale: 0.025,       // 观感尺度: 半径幂压缩系数
    minPlanetRadius: 0.42,
    maxSunRadius: 3.0
  };
  const CN = { Sun: "太阳", Mercury: "水星", Venus: "金星", Earth: "地球", Mars: "火星",
    Jupiter: "木星", Saturn: "土星", Uranus: "天王星", Neptune: "海王星",
    Ceres: "谷神星", Pluto: "冥王星" };
  const ACCENT = { Sun: "#ffd27d", Mercury: "#a9a4b0", Venus: "#e8c46a", Earth: "#5aa2ff",
    Mars: "#e0714a", Jupiter: "#d8a35f", Saturn: "#e3c883", Uranus: "#7fd6de", Neptune: "#6f8cf5",
    Ceres: "#b8b0a4", Pluto: "#d8b493" };

  const BLURB = {
    Sun: "G 型主序星, 占太阳系总质量的 99.86%",
    Mercury: "最小的行星, 昼夜温差接近 600°C",
    Venus: "浓密二氧化碳大气, 自转方向逆行",
    Earth: "目前已知唯一孕育生命的行星",
    Mars: "拥有太阳系最高的火山——奥林帕斯山",
    Jupiter: "最大的行星, 大红斑风暴已持续数百年",
    Saturn: "平均密度低于水, 环系跨度约 28 万公里",
    Uranus: "自转轴倾角 97.8°, “躺着”公转的冰巨星",
    Neptune: "已测得太阳系最快的风, 时速超 2000 公里",
    Ceres: "最大的主带天体, 也是唯一位于内太阳系的矮行星, 地壳下可能藏有卤水",
    Pluto: "柯伊伯带最著名的矮行星, 氮冰构成的斯普特尼克平原是它的“冰之心”"
  };

  /* 卫星系统: 椭圆轨道(真实半长轴/周期/偏心率), 观感尺度下按父行星显示半径放大轨道距离;
   * 月球单独使用 Meeus 简化历表 */
  const SATELLITES = [
    { name: "Moon", cn: "月球", parent: "Earth", radius_km: 1737.4, a_km: 384400, period_d: 27.322,
      plane: "ecliptic", incl_deg: 5.14, e: 0.0549, tex: "moon", bump: "moon_bump", cinFactor: 2.6,
      accent: "#c9ccd6", blurb: "潮汐锁定, 始终以同一面朝向地球; 位置由 Meeus 简化历表实时解算" },
    { name: "Phobos", cn: "火卫一", parent: "Mars", radius_km: 11.1, a_km: 9376, period_d: 0.3189,
      plane: "equatorial", e: 0.0151, tex: "phobos", cinFactor: 1.55, accent: "#b09a88",
      blurb: "每百年向火星逼近约 1.8 米, 数千万年后将解体成一圈火星环" },
    { name: "Deimos", cn: "火卫二", parent: "Mars", radius_km: 6.2, a_km: 23463, period_d: 1.2624,
      plane: "equatorial", tex: "deimos", cinFactor: 2.15, accent: "#c2ad97",
      blurb: "太阳系最小的卫星之一, 表面覆盖着厚厚的细尘" },
    { name: "Io", cn: "木卫一", parent: "Jupiter", radius_km: 1821.6, a_km: 421800, period_d: 1.769,
      plane: "equatorial", e: 0.0041, tex: "io", cinFactor: 1.75, accent: "#e8d27a", blurb: "太阳系火山活动最剧烈的天体" },
    { name: "Europa", cn: "木卫二", parent: "Jupiter", radius_km: 1560.8, a_km: 671100, period_d: 3.551,
      plane: "equatorial", e: 0.0094, tex: "europa", cinFactor: 2.2, accent: "#d8c9b8", blurb: "冰壳之下藏着全球性液态水海洋" },
    { name: "Ganymede", cn: "木卫三", parent: "Jupiter", radius_km: 2634.1, a_km: 1070400, period_d: 7.155,
      plane: "equatorial", e: 0.0013, tex: "ganymede", cinFactor: 2.7, accent: "#a99f92", blurb: "太阳系最大卫星, 体积超过水星" },
    { name: "Callisto", cn: "木卫四", parent: "Jupiter", radius_km: 2410.3, a_km: 1882700, period_d: 16.689,
      plane: "equatorial", e: 0.0074, tex: "callisto", cinFactor: 3.3, accent: "#8f867c", blurb: "太阳系陨击坑最密集的古老表面" },
    { name: "Titan", cn: "土卫六", parent: "Saturn", radius_km: 2574.7, a_km: 1221870, period_d: 15.945,
      plane: "equatorial", e: 0.0288, tex: "titan", cinFactor: 3.1, accent: "#d8a94f", blurb: "唯一拥有浓密大气的卫星, 地表有甲烷湖" },
    { name: "Enceladus", cn: "土卫二", parent: "Saturn", radius_km: 252.1, a_km: 238040, period_d: 1.370,
      plane: "equatorial", e: 0.0047, tex: "enceladus", cinFactor: 2.55, accent: "#e8f2f8",
      blurb: "太阳系反照率最高的天体, 南极虎纹裂缝喷出冰羽, 冰下海洋是找地外生命的热门地点" },
    { name: "Iapetus", cn: "土卫八", parent: "Saturn", radius_km: 734.5, a_km: 3560800, period_d: 79.32,
      plane: "equatorial", e: 0.0283, tex: "iapetus", cinFactor: 4.3, accent: "#c2ab8e",
      blurb: "阴阳脸卫星: 前导半球漆黑如碳, 后随半球洁白如雪, 还有一圈神秘的赤道脊" },
    { name: "Miranda", cn: "天卫五", parent: "Uranus", radius_km: 235.8, a_km: 129900, period_d: 1.413,
      plane: "equatorial", e: 0.0013, tex: "miranda", cinFactor: 1.55, accent: "#ccd2da",
      blurb: "像拼错的拼图: 混乱地形疑似曾被撞碎重组, 悬崖高达 20 公里" },
    { name: "Ariel", cn: "天卫一", parent: "Uranus", radius_km: 578.9, a_km: 190900, period_d: 2.520,
      plane: "equatorial", e: 0.0012, tex: "ariel", cinFactor: 1.95, accent: "#dde3e9",
      blurb: "天王星卫星中最亮的一颗, 峡谷纵横, 表面相对年轻" },
    { name: "Umbriel", cn: "天卫二", parent: "Uranus", radius_km: 584.7, a_km: 266000, period_d: 4.144,
      plane: "equatorial", e: 0.0039, tex: "umbriel", cinFactor: 2.4, accent: "#8e9096",
      blurb: "天王星卫星中最暗的一颗, 古老阴沉, 顶着一个亮环状的温达坑" },
    { name: "Titania", cn: "天卫三", parent: "Uranus", radius_km: 788.4, a_km: 435900, period_d: 8.706,
      plane: "equatorial", e: 0.0011, tex: "titania", cinFactor: 2.9, accent: "#c8c2bc",
      blurb: "天王星最大的卫星, 以仙后命名, 表面有巨大的断裂峡谷" },
    { name: "Oberon", cn: "天卫四", parent: "Uranus", radius_km: 761.4, a_km: 583500, period_d: 13.463,
      plane: "equatorial", e: 0.0014, tex: "oberon", cinFactor: 3.4, accent: "#b5aca4",
      blurb: "天王星最外侧的大卫星, 以仙王命名, 陨坑底部有神秘的暗色物质" },
    { name: "Triton", cn: "海卫一", parent: "Neptune", radius_km: 1353.4, a_km: 354759, period_d: -5.877,
      plane: "equatorial", tex: "triton", cinFactor: 2.9, accent: "#d8c8d2",
      blurb: "唯一逆行的大卫星, 疑似被俘获的柯伊伯带天体, 南极有氮冰喷泉" },
    { name: "Charon", cn: "卡戎", parent: "Pluto", radius_km: 606.0, a_km: 19591, period_d: 6.387,
      plane: "equatorial", tex: "charon", cinFactor: 2.0, accent: "#b8a898",
      blurb: "与冥王星互相潮汐锁定, 永远面对面共舞的双矮行星系统" }
  ];
  SATELLITES.forEach((s, i) => { s.phase0 = i * 2.39996; CN[s.name] = s.cn; ACCENT[s.name] = s.accent; });
  const satByName = Object.fromEntries(SATELLITES.map((s) => [s.name, s]));

  /* 彗星家族: JPL SBDB 密切根数(全精度), 以近日点时刻 tp 驱动平近点角。
   * 哈雷分三段(1910/1986/2061 回归全部对准); 其余单段。
   * actR/actP: 活动度随日距的标度; ionLen/dustLen: 彗尾最大长度(km)。 */
  const COMETS = [
    { name: "Halley", cn: "哈雷彗星", eng: "1P/Halley", accent: "#9fd8e8", radius_km: 5.5,
      qAu: 0.575, QAu: 35.28, periodText: "~76 年 (逆行)",
      actR: 1.9, actP: 2.3, ionLen: 3.4e7, dustLen: 2.1e7, comaK: 1.0,
      blurb: "最著名的周期彗星, 约 76 年回归一次。彗尾永远背向太阳: 离子尾笔直泛蓝, 尘埃尾弯曲泛白。上次回归 1986 年, 下次 2061 年。",
      segments: [
        { until: 2432626, a: 17.95538437, e: 0.96729625, i: 162.21887371, node: 58.56233779, w: 111.73658034, tp: 2418781.6785, n: 0.01295424224 },
        { until: 2460252, a: 17.92863505, e: 0.96793600, i: 162.19053004, node: 59.09894721, w: 112.24143146, tp: 2446469.9736, n: 0.01298324443 },
        { until: Infinity, a: 17.92863505, e: 0.96793600, i: 162.19053004, node: 59.09894721, w: 112.24143146, tp: 2474034.2, n: 0.01298324443 }
      ] },
    { name: "HaleBopp", cn: "海尔-波普", eng: "C/1995 O1", accent: "#e8c99f", radius_km: 30,
      qAu: 0.891, QAu: 354.0, periodText: "~2400 年",
      actR: 3.4, actP: 1.8, ionLen: 5.5e7, dustLen: 3.6e7, comaK: 1.6,
      blurb: "1997 年大彗星: 肉眼可见 18 个月创下纪录, 彗核直径约 60 公里是哈雷的十倍, 轨道近乎垂直黄道面(倾角 89.3°)。",
      segments: [{ until: Infinity, a: 177.43338391, e: 0.99498100, i: 89.28759425, node: 282.73342140, w: 130.41466707, tp: 2450537.1349, n: 0.00041701442 }] },
    { name: "Encke", cn: "恩克彗星", eng: "2P/Encke", accent: "#9fe8c3", radius_km: 2.4,
      qAu: 0.338, QAu: 4.10, periodText: "3.30 年",
      actR: 1.1, actP: 2.6, ionLen: 1.1e7, dustLen: 0.7e7, comaK: 0.6,
      blurb: "周期最短的彗星, 3.3 年一圈, 也是金牛座流星雨的母体; 千百次回归后挥发物渐尽, 彗尾短而微弱。",
      segments: [{ until: Infinity, a: 2.21968871, e: 0.84774970, i: 11.41227811, node: 334.19358460, w: 187.13424637, tp: 2460239.6495, n: 0.29803410 }] },
    { name: "Neowise", cn: "尼奥怀兹", eng: "C/2020 F3", accent: "#c9b9f5", radius_km: 2.5,
      qAu: 0.295, QAu: 717, periodText: "~6800 年",
      actR: 1.6, actP: 2.2, ionLen: 4.2e7, dustLen: 2.8e7, comaK: 1.1,
      blurb: "2020 年 7 月惊艳北半球黎明的大彗星, 近日点深入水星轨道内侧; 下次回归要等约 6800 年。",
      segments: [{ until: Infinity, a: 358.46795655, e: 0.99917803, i: 128.93750276, node: 61.01042819, w: 37.27865845, tp: 2459034.1789, n: 0.00014522071 }] },
    { name: "Apophis", cn: "阿波菲斯", eng: "99942 Apophis", accent: "#ff8a7a", radius_km: 0.185,
      qAu: 0.746, QAu: 1.099, periodText: "324 天",
      actR: 0, actP: 1, ionLen: 0, dustLen: 0, comaK: 0, noComa: true, cinR: 0.17, tex: "phobos",
      blurb: "PHA 危险名录小行星。2029-04-13 将从距地心约 3.2 万公里处掠过——比同步卫星更近, 东半球肉眼可见。此处为飞掠前轨道(JPL#220 两体近似), 飞掠本身会显著改变它的轨道。",
      segments: [{ until: Infinity, a: 0.92235922, e: 0.19114923, i: 3.34099688, node: 203.89365142, w: 126.67957069, tp: 2461042.9192, n: 1.11263812 }] }
  ];
  const cometByName = {};
  /* 星际访客: 双曲线轨道(e>1), 一段式根数, 骑行彗星全套管线(芯片/标签/雷达/搜索/信息卡) */
  if (typeof window !== "undefined" && window.VISITORS) {
    const VACC = { "1I": "#d8b48f", "2I": "#9fd0e8", "3I": "#b9f0cf" };
    const VRAD = { "1I": 0.12, "2I": 0.5, "3I": 1.4 };
    const VCFG = { "1I": [0, 0, 0.5, 0, 2.2], "2I": [1.6e7, 1.0e7, 1.0, 2.6, 2.2], "3I": [2.4e7, 1.6e7, 1.15, 2.9, 2.1] };  // ion,dust,comaK,actR,actP
    for (const v of window.VISITORS) {
      const aH = v.q / (1 - v.e);   // 负半长轴
      const cfg = VCFG[v.id] || [1e7, 6e6, 0.8, 2.2, 2.2];
      COMETS.push({
        name: v.id, cn: v.zh, eng: v.en, accent: VACC[v.id] || "#cccccc", radius_km: VRAD[v.id] || 1,
        qAu: v.q, QAu: null, periodText: "双曲线 · 一去不返", hyper: true, vinf: v.vinf, disc: v.disc,
        noComa: v.id === "1I", cinR: v.id === "1I" ? 0.035 : undefined,
        actR: cfg[3], actP: cfg[4], ionLen: cfg[0], dustLen: cfg[1], comaK: cfg[2],
        blurb: v.note + ` 发现于 ${v.disc}, 双曲超速 v∞ = ${v.vinf.toFixed(1)} km/s —— 太阳的引力永远留不住它。`,
        segments: [{ until: Infinity, a: aH, e: v.e, i: v.i, node: v.om, w: v.w, tp: v.tp, n: 0.9856076686 / Math.pow(-aH, 1.5) }]
      });
    }
  }
  for (const c of COMETS) { cometByName[c.name] = c; CN[c.name] = c.cn; ACCENT[c.name] = c.accent; }
  if (typeof window !== "undefined") window.__vis = {
    list: () => COMETS.filter((c) => c.hyper),
    posKm: (id, jdq) => cometKm(cometByName[id], jdq, [0, 0, 0])
  };

  /* 阶段6.4: IAU 自转极(J2000 RA/Dec)与绕极自转方向(照 IAU W 变率符号)。
   * 真实极轴指向让季节、土星环面、天王星"躺倒"方向都落在正确的黄经上。 */
  const POLES = {
    Sun: [286.13, 63.87, 1], Mercury: [281.0097, 61.4143, 1], Venus: [272.76, 67.16, -1],
    Earth: [0, 90, 1], Mars: [317.68143, 52.8865, 1], Jupiter: [268.056595, 64.495303, 1],
    Saturn: [40.589, 83.537, 1], Uranus: [257.311, -15.175, -1], Neptune: [299.36, 43.46, 1],
    Ceres: [291.418, 66.764, 1], Pluto: [132.993, -6.163, 1]
  };

  const data = window.SOLAR_DATA;
  const bodies = data.bodies;
  /* 阶段6.3 矮行星: 谷神星(HORIZONS J2000 当日密切根数, J2000 误差<0.001 AU)、
   * 冥王星(Standish 1992 Table 1 六根数+世纪变率, J2000 误差 0.009 AU), 与行星同一开普勒管线 */
  bodies.splice(bodies.findIndex((b) => b.name === "Jupiter"), 0, {
    name: "Ceres", type: "dwarf", radius_km: 469.7, semi_major_au: 2.7665,
    rotation_period_h: 9.074, axial_tilt_deg: 4.0,
    orbit_j2000: { a_au: 2.76649602, a_rate: 0, e: 0.07837563, e_rate: 0,
      i_deg: 10.58336046, i_rate: 0, L_deg: 160.59387473, L_rate: 7823.46643894,
      peri_deg: 154.41722022, peri_rate: 0, node_deg: 80.49435747, node_rate: 0 }
  });
  bodies.push({
    name: "Pluto", type: "dwarf", radius_km: 1188.3, semi_major_au: 39.482,
    rotation_period_h: -153.29, axial_tilt_deg: 122.53,
    orbit_j2000: { a_au: 39.48211675, a_rate: -0.00031596, e: 0.2488273, e_rate: 0.0000517,
      i_deg: 17.14001206, i_rate: 0.00004818, L_deg: 238.92903833, L_rate: 145.20780515,
      peri_deg: 224.06891629, peri_rate: -0.04062942, node_deg: 110.30393684, node_rate: -0.01183482 }
  });
  const bodyByName = Object.fromEntries(bodies.map((b) => [b.name, b]));
  const planetBodies = bodies.filter((b) => b.name !== "Sun");

  /* ---------------- 状态 ---------------- */
  let jd = J2000;
  let anchorName = "Sun";
  let selectedName = "Earth";
  let scaleBlend = 1.0;
  let daysPerSecond = 1.0;
  let timeDirection = 1;
  let playing = true;
  let focusTween = null;
  let hoverName = null;
  let draggingTimeline = false;
  const keys = new Set();
  const worldKm = {};      // 天体日心坐标(km)
  const scenePos = {};     // 场景坐标(BU)
  const sceneRadius = {};  // 场景半径(BU)

  /* ---------------- 渲染器与场景 ---------------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 2.2e8);
  camera.up.set(0, 0, 1);                       // 黄道坐标系: z 轴朝北
  camera.position.set(0, -88, 48);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.02;
  controls.maxDistance = 2.5e7;

  const composerTarget = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, {
    samples: 4, type: THREE.HalfFloatType
  });
  const composer = new EffectComposer(renderer, composerTarget);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.7, 0.92);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  scene.add(new THREE.AmbientLight(0x30405e, 0.28));
  const sunLight = new THREE.PointLight(0xfff4e0, 2.6, 0, 0);
  scene.add(sunLight);

  /* ---------------- 贴图加载 ---------------- */
  const texLoader = new THREE.TextureLoader();
  const TEX = {};
  const texNames = Object.keys(window.TEXTURE_DATA);
  let texLoaded = 0;
  const loadBar = document.getElementById("loadBar");
  const loadText = document.getElementById("loadText");
  function loadTex(name, srgb) {
    return new Promise((resolve) => {
      texLoader.load(window.TEXTURE_DATA[name], (t) => {
        if (srgb) t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        t.wrapS = THREE.RepeatWrapping;
        TEX[name] = t;
        texLoaded += 1;
        loadBar.style.width = `${Math.round(texLoaded / texNames.length * 100)}%`;
        loadText.textContent = `正在加载贴图 ${texLoaded}/${texNames.length}`;
        resolve(t);
      });
    });
  }

  /* ---------------- 开普勒轨道(与 Blender 端 kepler.py 同源) ---------------- */
  const D2R = Math.PI / 180;
  function normalizeRad(a) {
    let v = a % (Math.PI * 2);
    return v < -Math.PI ? v + Math.PI * 2 : v > Math.PI ? v - Math.PI * 2 : v;
  }
  const _elT = { a: 0, e: 0, i: 0, node: 0, argPeri: 0, M: 0 };
  function elementsAtJd(el, jdTt, out) {
    const t = (jdTt - J2000) / 36525.0;
    let eOv = null;
    if (el === (bodyByName.Earth && bodyByName.Earth.orbit_j2000) && Math.abs(t) > 20) {
      eOv = earthEccentricity(t * 100, el.e + el.e_rate * t);   // 深时: 偏心率十万年呼吸
    }
    const L = el.L_deg + el.L_rate * t;
    const peri = el.peri_deg + el.peri_rate * t;
    const node = el.node_deg + el.node_rate * t;
    const b = el.b || 0, c = el.c || 0, s = el.s || 0, f = el.f || 0;
    const M = L - peri + b * t * t + c * Math.cos(f * t * D2R) + s * Math.sin(f * t * D2R);
    const r = out || { a: 0, e: 0, i: 0, node: 0, argPeri: 0, M: 0 };
    r.a = el.a_au + el.a_rate * t;
    r.e = eOv !== null ? eOv : el.e + el.e_rate * t;
    r.i = (el.i_deg + el.i_rate * t) * D2R;
    r.node = node * D2R;
    r.argPeri = (peri - node) * D2R;
    r.M = normalizeRad(M * D2R);
    return r;
  }
  function solveKepler(M, e) {
    let E = e > 0.8 ? (M < 0 ? -Math.PI : Math.PI) : M;   // 高偏心率从 ±π 起步(按 M 符号取根所在侧, 否则牛顿法发散)
    for (let i = 0; i < 60; i += 1) {
      const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= d;
      if (Math.abs(d) <= 1e-12) break;
    }
    return E;
  }
  function planeToEclipticKm(xp, yp, o, out) {
    const cw = Math.cos(o.argPeri), sw = Math.sin(o.argPeri);
    const co = Math.cos(o.node), so = Math.sin(o.node);
    const ci = Math.cos(o.i), si = Math.sin(o.i);
    if (out) {
      out[0] = ((cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp) * AU_KM;
      out[1] = ((cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp) * AU_KM;
      out[2] = (sw * si * xp + cw * si * yp) * AU_KM;
      return out;
    }
    return [
      ((cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp) * AU_KM,
      ((cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp) * AU_KM,
      ((sw * si) * xp + (cw * si) * yp) * AU_KM
    ];
  }
  function heliocentricKm(el, jdTt, out) {
    const o = elementsAtJd(el, jdTt, _elT);
    const E = solveKepler(o.M, o.e);
    return planeToEclipticKm(o.a * (Math.cos(E) - o.e), o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E), o, out);
  }

  /* ---------------- 月球: Meeus 第47章全历表(60+60项) ----------------
   * 表 47.A/47.B 全部 60 项 + A1/A2/A3 行星摄动附加项 + E 离心率因子;
   * 输出前用里卡(Lieske)岁差(p_A, η, Π)从瞬时黄道归算到 J2000 黄道系,
   * 与行星 Standish 表同框。精度 ~4″ / ~5 km(原 14 项截断约 ±60 km)。
   * 验证基准: Meeus 例 47.a + HORIZONS 地心月矢量(1900/2000/2024/2100)。 */
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
  function moonGeoKm(jdTt, out) {
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
    const lon = (Lp + sl / 1e6) * D2R, lat = (sb / 1e6) * D2R;
    const rKm = 385000.56 + sr / 1000;
    /* 瞬时黄道 → J2000 黄道(岁差), 与行星表同参考框 */
    const pA = (5029.0966 * T + 1.11113 * T2) / 3600 * D2R;
    const eta = (47.0029 * T - 0.03302 * T2) / 3600 * D2R;
    const Pi = (174.876384 - 869.8089 * T / 3600) * D2R;
    const psi = Pi + pA - lon;
    const sE = Math.sin(eta), cE = Math.cos(eta);
    const sB = Math.sin(lat), cB = Math.cos(lat);
    const sP = Math.sin(psi), cP = Math.cos(psi);
    const lonJ = Pi - Math.atan2(cE * cB * sP + sE * sB, cB * cP);
    const latJ = Math.asin(clamp(cE * sB - sE * cB * sP, -1, 1));
    const cb = Math.cos(latJ);
    out[0] = rKm * cb * Math.cos(lonJ);
    out[1] = rKm * cb * Math.sin(lonJ);
    out[2] = rKm * Math.sin(latJ);
    return out;
  }
  const _mg = [0, 0, 0];
  const baryOff = { Earth: [0, 0, 0], Pluto: [0, 0, 0] };   // 质心摆动: 轨道线平移量, 保证线穿过天体
  const _olKm = [0, 0, 0];   // 轨道线顶点共享暂存(热路径零分配, 治 GC 卡顿)
  let transMoving = false;
  let lineSkip = false, _lastSB = -1, _lastS3 = -1, _lineParity = 0;
  function updateLineSkip() {   // 尺度/星际过渡期: 轨道线族隔帧重建, 消除过渡掉帧
    transMoving = Math.abs(scaleBlend - _lastSB) > 1e-4 || Math.abs(star3DBlend - _lastS3) > 1e-4;
    _lastSB = scaleBlend;
    _lastS3 = star3DBlend;
    _lineParity ^= 1;
    lineSkip = transMoving && _lineParity === 1;
  }
  const MU_MOON = 0.012150668;    // 月球/(地+月) 质量比 → 地月质心摆动
  const MU_CHARON = 0.1086;       // 卡戎/(冥+卡) 质量比
  /* ---------------- 米兰科维奇循环(深时示意, ±2000 年内严格零影响) ----------------
   * 黄赤交角: 22.1°~24.5°, 周期 ~41000 年(相位校准: 当前 23.44° 且正在减小, ~-47″/世纪);
   * 偏心率: ~0.000-0.058, 十万年 + 40.5 万年双周期近似(Laskar 级数的两项粗描)。 */
  function milankovitchBlend(yr) {
    return clamp((Math.abs(yr) - 2000) / 8000, 0, 1);   // ±2000 年内为 0 → 天象引擎精度不受扰
  }
  function obliquityDeg(yr) {
    const eps = 23.30 + 1.15 * Math.cos(Math.PI * 2 * (yr + 9450) / 41000);
    return lerp(23.4392911, eps, milankovitchBlend(yr));
  }
  function earthEccentricity(yr, e0) {
    const em = 0.028 + 0.017 * Math.sin(Math.PI * 2 * yr / 100000) + 0.013 * Math.sin(Math.PI * 2 * yr / 405000 + 1.1);
    return lerp(e0, clamp(em, 0.001, 0.058), milankovitchBlend(yr));
  }
  /* 减弱动态效果(系统偏好): 初始暂停时间流、镜头补间改跳切、流星视效停用、辉光减半 */
  let reducedMotion = false;
  try { reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { /* 桩环境 */ }
  /* ---------------- 深时模式 / 星际视角 ---------------- */
  let deepTime = false;               // ±5 万年: 恒星自行 + 地轴岁差
  let stars3D = false, star3DBlend = 0;   // 恒星三维化(视差真距离) + 飞离动画
  let skyModeN = 0, deepSkyBlend = 0;     // 星空三挡: 0全亮 1深空(弱化) 2黑寂(全部隐去)
  const SKY_DIM = [1, 0.38, 0], SKY_BG = [0.62, 0.15, 0], SKY_SPK = [1, 0.3, 0];
  let tlMin = -36525, tlMax = 36525;  // 时间轴当前挡位(天)
  const PRECESS_YR = 25772;           // 地轴岁差周期(年)
  function yearsFromJ2000() { return (jd - J2000) / 365.25; }
  /* 岁差后的地球极轴方向(黄道系单位矢量): 绕黄极以 25772 年周期西向回旋 */
  const _precQ2 = new THREE.Quaternion(), _zAxis = new THREE.Vector3(0, 0, 1);
  const _qRing = new THREE.Quaternion();
  function earthPrecessionQuat(yr, out) {
    out.setFromAxisAngle(_zAxis, -(yr / PRECESS_YR) * Math.PI * 2);
    return out;
  }

  /* ---------------- 双尺度映射 ---------------- */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  function mapPoint(km, out) {
    const d = Math.sqrt(km[0] * km[0] + km[1] * km[1] + km[2] * km[2]);
    const t = scaleBlend;
    let cx = 0, cy = 0, cz = 0;
    if (d > 0) {
      const cd = Math.log10(1 + d / AU_KM) * SCALE.cinDistScale;
      const k = cd / d;
      cx = km[0] * k; cy = km[1] * k; cz = km[2] * k;
    }
    const r = 1 / SCALE.sceneUnitKm;
    out[0] = lerp(km[0] * r, cx, t);
    out[1] = lerp(km[1] * r, cy, t);
    out[2] = lerp(km[2] * r, cz, t);
    return out;
  }
  function mapRadius(radiusKm, type) {
    const minR = type === "dwarf" ? 0.30 : SCALE.minPlanetRadius;   // 矮行星观感下限更小, 与行星区分体量
    const cin = type === "star"
      ? Math.min(Math.pow(radiusKm, 0.4) * SCALE.cinRadScale, SCALE.maxSunRadius)
      : Math.max(Math.pow(radiusKm, 0.4) * SCALE.cinRadScale, minR);
    return lerp(radiusKm / SCALE.sceneUnitKm, cin, scaleBlend);
  }

  /* ---------------- 着色器 ---------------- */
  const earthVert = `
    #include <common>
    #include <logdepthbuf_pars_vertex>
    varying vec2 vUv; varying vec3 vN; varying vec3 vP;
    void main() {
      vUv = uv;
      vN = normalize(mat3(modelMatrix) * normal);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vP = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
      #include <logdepthbuf_vertex>
    }`;
  const earthFrag = `
    #include <common>
    #include <logdepthbuf_pars_fragment>
    uniform sampler2D dayMap; uniform sampler2D nightMap; uniform vec3 sunDir;
    varying vec2 vUv; varying vec3 vN; varying vec3 vP;
    void main() {
      #include <logdepthbuf_fragment>
      vec3 n = normalize(vN);
      float d = dot(n, normalize(sunDir));
      vec3 day = texture2D(dayMap, vUv).rgb * (0.05 + 1.15 * max(d, 0.0));
      vec3 night = texture2D(nightMap, vUv).rgb * vec3(1.5, 1.35, 1.0);
      float mixer = smoothstep(-0.08, 0.22, d);
      vec3 color = mix(night, day, mixer);
      gl_FragColor = vec4(color, 1.0);
    }`;
  const atmoVert = `
    #include <common>
    #include <logdepthbuf_pars_vertex>
    varying vec3 vN; varying vec3 vP;
    void main() {
      vN = normalize(mat3(modelMatrix) * normal);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vP = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
      #include <logdepthbuf_vertex>
    }`;
  const atmoFrag = `
    #include <common>
    #include <logdepthbuf_pars_fragment>
    uniform vec3 sunDir; uniform vec3 glowColor;
    varying vec3 vN; varying vec3 vP;
    void main() {
      #include <logdepthbuf_fragment>
      vec3 n = normalize(vN);
      vec3 viewDir = normalize(cameraPosition - vP);
      float rim = pow(1.0 - abs(dot(viewDir, n)), 3.2);
      float lit = clamp(dot(n, normalize(sunDir)) * 0.75 + 0.45, 0.0, 1.0);
      gl_FragColor = vec4(glowColor * rim * lit * 1.35, rim * lit);
    }`;

  /* ---------------- 场景构建 ---------------- */
  const pickMeshes = [];
  const labels = {};
  const orbitLines = {};
  let earthMaterial = null;
  let atmoMaterial = null;
  let cloudMesh = null;
  let beltPoints = null;
  let beltMaterial = null;
  /* 点云历元重基: M0 属性定期(双精度)折算到新历元, uDt 恒为小量 → 任意年份零量化颤动 */
  const BELT_SETS = [];
  let beltEpochDt = 0, beltRebaseAt = 0;
  function registerBeltSet(attr, N) {
    const M0d = new Float64Array(N), nd = new Float64Array(N);
    for (let i = 0; i < N; i += 1) { M0d[i] = attr.array[i * 4 + 1]; nd[i] = attr.array[i * 4 + 2]; }
    BELT_SETS.push({ attr, M0d, nd, N });
  }
  let skyMesh = null;
  let kuiperPoints = null;
  // 彗星图形对象挂在各 COMETS 项的 .gfx 上

  /* 天体标签: DOM 覆盖层 —— 浏览器字体引擎直出(次像素渲染+hinting), 与面板文字同等锐利 */
  const labels2D = [];
  function makeLabel(name) {
    const el = document.createElement("div");
    el.className = "bLabel";
    el.textContent = CN[name];
    el.style.color = ACCENT[name] || "#dfe7f5";
    el.style.display = "none";
    const layer = document.getElementById("labelLayer");
    if (layer) layer.appendChild(el);
    const shim = new THREE.Object3D();     // 兼容壳: position/visible/scale 照旧, 渲染走 DOM
    shim.material = { opacity: 0.85 };
    labels2D.push({ shim, el, shown: false });
    return shim;
  }
  const _lproj = new THREE.Vector3();
  function flushLabels2D() {
    const W = window.innerWidth, Hh = window.innerHeight;
    for (const L of labels2D) {
      let show = L.shim.visible;
      if (show) {
        _lproj.copy(L.shim.position).project(camera);
        if (_lproj.z > 1 || _lproj.x < -1.15 || _lproj.x > 1.15 || _lproj.y < -1.15 || _lproj.y > 1.15) {
          show = false;
        } else if (show) {
          const x = Math.round((_lproj.x + 1) * 0.5 * W * 2) / 2;
          const y = Math.round((1 - _lproj.y) * 0.5 * Hh * 2) / 2;
          if (L.lx !== x || L.ly !== y) {
            L.lx = x; L.ly = y;
            L.el.style.transform = `translate3d(${x}px, ${y + (L.dy || 0)}px, 0) translate(-50%, -175%)`;
          }
          const op = Math.round(L.shim.material.opacity * 50) / 50;
          if (L.lop !== op) { L.lop = op; L.el.style.opacity = op; }
          const fs = L.star
            ? Math.round(11.5 * clamp(L.shim.scale.x, 0.8, 1.8))
            : (L.shim.scale.x !== 1 ? Math.round(13 * clamp(L.shim.scale.x / 0.088, 0.6, 1.2)) : 13);
          if (L.fs !== fs) { L.fs = fs; L.el.style.fontSize = `${fs}px`; }
        }
      }
      if (show !== L.shown) {
        L.shown = show;
        L.el.style.display = show ? "block" : "none";
      }
    }
  }
  function crispTex(canvas) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;                 // 标签屏占恒定 → 无需 mip, 消除三线性糊字
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }
  function labelDevH(scaleY) {
    // 画布高度 = 实际显示像素 1:1(纹素对齐像素, 零降采样), 随屏幕/DPR 自适应
    const devH = renderer && renderer.domElement ? renderer.domElement.height : 900;
    return Math.max(24, Math.round(scaleY * devH * 0.5));
  }

  /* 赤道坐标(RA/Dec) → J2000 黄道坐标的极轴向量 */
  const EPS0 = 23.4392911 * D2R;
  function poleVecEcl(raDeg, decDeg) {
    const ra = raDeg * D2R, dec = decDeg * D2R;
    const xq = Math.cos(dec) * Math.cos(ra), yq = Math.cos(dec) * Math.sin(ra), zq = Math.sin(dec);
    return new THREE.Vector3(xq, yq * Math.cos(EPS0) + zq * Math.sin(EPS0),
      -yq * Math.sin(EPS0) + zq * Math.cos(EPS0)).normalize();
  }
  const Z_UP = new THREE.Vector3(0, 0, 1);

  function buildBodies() {
    for (const body of bodies) {
      const posGroup = new THREE.Group();            // 位置 + 整体缩放
      const tiltGroup = new THREE.Group();           // 极轴姿态(IAU 真实指向)
      const poleGroup = new THREE.Group();           // 自转极轴对齐 z-up
      const pole = POLES[body.name];
      if (pole) {
        body.poleQuat = new THREE.Quaternion().setFromUnitVectors(Z_UP, poleVecEcl(pole[0], pole[1]));
        body.spinSign = pole[2];
      } else {
        body.poleQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (body.axial_tilt_deg || 0) * D2R);
        body.spinSign = body.rotation_period_h < 0 ? -1 : 1;
      }
      tiltGroup.quaternion.copy(body.poleQuat);
      body.tiltGroup = tiltGroup;
      poleGroup.rotation.x = Math.PI / 2;
      posGroup.add(tiltGroup);
      tiltGroup.add(poleGroup);

      const geo = new THREE.SphereGeometry(1, body.type === "star" ? 72 : 64, body.type === "star" ? 36 : 48);
      let mesh;
      if (body.name === "Sun") {
        mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: TEX.sun }));
        mesh.material.color.setRGB(1.9, 1.75, 1.5);   // HDR 亮度 → 触发 Bloom
        // 日冕辉光
        const corona = new THREE.Sprite(new THREE.SpriteMaterial({
          map: makeCoronaTexture(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false
        }));
        corona.scale.set(6.4, 6.4, 1);
        posGroup.add(corona);
        posGroup.add(sunLight);
      } else if (body.name === "Earth") {
        earthMaterial = new THREE.ShaderMaterial({
          uniforms: {
            dayMap: { value: TEX.earth_day },
            nightMap: { value: TEX.earth_night },
            sunDir: { value: new THREE.Vector3(1, 0, 0) }
          },
          vertexShader: earthVert, fragmentShader: earthFrag
        });
        mesh = new THREE.Mesh(geo, earthMaterial);
        // 云层
        cloudMesh = new THREE.Mesh(new THREE.SphereGeometry(1.012, 64, 48), new THREE.MeshLambertMaterial({
          color: 0xffffff, alphaMap: TEX.earth_clouds, transparent: true, depthWrite: false
        }));
        poleGroup.add(cloudMesh);
        // 大气
        atmoMaterial = new THREE.ShaderMaterial({
          uniforms: { sunDir: { value: new THREE.Vector3(1, 0, 0) }, glowColor: { value: new THREE.Color(0.35, 0.58, 1.0) } },
          vertexShader: atmoVert, fragmentShader: atmoFrag,
          transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false
        });
        const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.045, 64, 48), atmoMaterial);
        posGroup.add(atmo);
        body.atmoMesh = atmo;
      } else {
        const texKey = body.name.toLowerCase();
        const mat = new THREE.MeshStandardMaterial({
          map: TEX[texKey], roughness: 0.95, metalness: 0.0
        });
        if (TEX[`${texKey}_bump`]) { mat.bumpMap = TEX[`${texKey}_bump`]; mat.bumpScale = 0.015; }
        mesh = new THREE.Mesh(geo, mat);
      }
      poleGroup.add(mesh);
      body.spinMesh = mesh;

      if (body.name === "Saturn") {
        const ringGeo = new THREE.RingGeometry(1.149, 2.407, 192, 1);
        const rp = ringGeo.attributes.position, ruv = ringGeo.attributes.uv;
        const v = new THREE.Vector3();
        for (let i = 0; i < rp.count; i += 1) {
          v.fromBufferAttribute(rp, i);
          ruv.setXY(i, (v.length() - 1.149) / (2.407 - 1.149), 0.5);
        }
        const ringMat = new THREE.MeshBasicMaterial({
          map: TEX.saturn_ring, side: THREE.DoubleSide, transparent: true, depthWrite: false, opacity: 0.96
        });
        /* —— 土星环阴影(解析求交, 局部系): 环影落球面 + 球影咬掉环的一角 —— */
        const shadowU = { uSunT: { value: new THREE.Vector3(1, 0, 0) }, uSunP: { value: new THREE.Vector3(1, 0, 0) } };
        body._ringU = shadowU;
        const RING_D = `
          float ringDensity(float r) {
            if (r < 1.149 || r > 2.407) return 0.0;
            float d = 0.0;
            d += 0.22 * smoothstep(1.149, 1.24, r) * (1.0 - smoothstep(1.40, 1.45, r));
            d += 0.78 * smoothstep(1.44, 1.50, r) * (1.0 - smoothstep(1.86, 1.90, r));
            d += 0.45 * smoothstep(1.94, 1.99, r) * (1.0 - smoothstep(2.20, 2.27, r));
            d *= 1.0 - 0.85 * exp(-pow((r - 1.92) * 30.0, 2.0));
            return d;
          }`;
        mesh.material.onBeforeCompile = (sh) => {   // 球面: 沿日向投影到环面查密度
          sh.uniforms.uSunP = shadowU.uSunP;
          sh.vertexShader = sh.vertexShader
            .replace("#include <common>", "varying vec3 vSatLoc;\n#include <common>")
            .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSatLoc = position;");
          sh.fragmentShader = sh.fragmentShader
            .replace("#include <common>", "varying vec3 vSatLoc;\nuniform vec3 uSunP;\n" + RING_D + "\n#include <common>")
            .replace("#include <map_fragment>", `#include <map_fragment>
              { vec3 L = normalize(uSunP);
                if (abs(L.y) > 1e-4) {
                  float t = -vSatLoc.y / L.y;
                  if (t > 0.0) {
                    float rr = length(vSatLoc.xz + L.xz * t);
                    diffuseColor.rgb *= 1.0 - 0.62 * ringDensity(rr);
                  } } }`);
        };
        ringMat.onBeforeCompile = (sh) => {   // 环面: 朝日射线被行星球体遮挡则入影
          sh.uniforms.uSunT = shadowU.uSunT;
          sh.vertexShader = sh.vertexShader
            .replace("#include <common>", "varying vec3 vRingLoc;\n#include <common>")
            .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRingLoc = position;");
          sh.fragmentShader = sh.fragmentShader
            .replace("#include <common>", "varying vec3 vRingLoc;\nuniform vec3 uSunT;\n#include <common>")
            .replace("#include <map_fragment>", `#include <map_fragment>
              { vec3 L = normalize(uSunT);
                float b2 = dot(vRingLoc, L);
                float c2 = dot(vRingLoc, vRingLoc) - 1.0;
                float disc = b2 * b2 - c2;
                if (disc > 0.0 && -b2 - sqrt(disc) > 0.0) {
                  diffuseColor.rgb *= mix(1.0, 0.20, smoothstep(0.0, 0.035, disc));
                } }`);
        };
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.renderOrder = 2;
        tiltGroup.add(ring);
      }

      if (body.name === "Jupiter" || body.name === "Neptune") {
        // 暗弱环系: 木星尘埃环 / 海王星 Galle-LeVerrier-Adams 环
        const spec = body.name === "Jupiter"
          ? { inner: 1.3, outer: 1.85, rgb: [206, 188, 158], op: 0.16,
              bands: [[0.25, 0.2, 0.10], [0.62, 0.09, 0.22], [0.9, 0.1, 0.07]] }
          : { inner: 1.42, outer: 2.55, rgb: [186, 196, 214], op: 0.5,
              bands: [[0.1, 0.09, 0.09], [0.45, 0.03, 0.2], [0.94, 0.026, 0.4]] };
        const rc = document.createElement("canvas");
        rc.width = 512; rc.height = 8;
        const rctx = rc.getContext("2d");
        for (const [pos, width, alpha] of spec.bands) {
          rctx.fillStyle = `rgba(${spec.rgb[0]},${spec.rgb[1]},${spec.rgb[2]},${alpha})`;
          rctx.fillRect(Math.round(pos * 512), 0, Math.max(2, Math.round(width * 512)), 8);
        }
        const rtex = new THREE.CanvasTexture(rc);
        rtex.colorSpace = THREE.SRGBColorSpace;
        const ringGeo = new THREE.RingGeometry(spec.inner, spec.outer, 128, 1);
        const rp3 = ringGeo.attributes.position, ruv3 = ringGeo.attributes.uv;
        const v3 = new THREE.Vector3();
        for (let i = 0; i < rp3.count; i += 1) {
          v3.fromBufferAttribute(rp3, i);
          ruv3.setXY(i, (v3.length() - spec.inner) / (spec.outer - spec.inner), 0.5);
        }
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
          map: rtex, side: THREE.DoubleSide, transparent: true, depthWrite: false, opacity: spec.op
        }));
        ring.renderOrder = 2;
        tiltGroup.add(ring);
      }

      if (body.name === "Uranus") {
        // 天王星暗环: ζ/α/β/ε 主要环带的程序化近似
        const ringGeo = new THREE.RingGeometry(1.64, 2.06, 128, 1);
        const rp2 = ringGeo.attributes.position, ruv2 = ringGeo.attributes.uv;
        const v2 = new THREE.Vector3();
        for (let i = 0; i < rp2.count; i += 1) {
          v2.fromBufferAttribute(rp2, i);
          ruv2.setXY(i, (v2.length() - 1.64) / (2.06 - 1.64), 0.5);
        }
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
          map: makeUranusRingTexture(), side: THREE.DoubleSide, transparent: true, depthWrite: false, opacity: 0.55
        }));
        ring.renderOrder = 2;
        tiltGroup.add(ring);
      }

      // 拾取用放大球(透明)
      const pick = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8), new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, depthWrite: false, depthTest: false, colorWrite: false
      }));
      pick.userData.bodyName = body.name;
      posGroup.add(pick);
      pickMeshes.push(pick);

      scene.add(posGroup);
      body.group = posGroup;

      const label = makeLabel(body.name);
      scene.add(label);
      labels[body.name] = label;
    }

    // 轨道线(带渐变尾迹: 顶点色沿轨道从天体身后渐暗)
    for (const body of planetBodies) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((384 + 1) * 3), 3));
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array((384 + 1) * 3).fill(1), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: new THREE.Color(ACCENT[body.name]), vertexColors: true, transparent: true, opacity: 0.55
      }));
      line.frustumCulled = false;
      scene.add(line);
      orbitLines[body.name] = line;
    }
    buildSatellites();
    buildBelt();
    buildRealBelt();
    buildKuiper();
    initJupiterShadows();
    buildSiteBeacons();
    buildComets();
    buildLagrange();
    buildHeliopause();
    buildGalTrails();
    buildSunTrack();
    buildMagnetosphere();
    buildMeteorFx();
    buildSpacecraft();
    buildCatalogStars();
    buildEclipseFx();
    buildSky();
  }

  /* 拉格朗日点: 日地 L1~L5 + 日木 L4/L5(特洛伊群所在) */
  const LAG_DEFS = [
    { id: "L1", body: "Earth", kind: "radial", f: -0.01 },
    { id: "L2", body: "Earth", kind: "radial", f: 0.01 },
    { id: "L3", body: "Earth", kind: "opp" },
    { id: "L4", body: "Earth", kind: "rot", ang: 60 },
    { id: "L5", body: "Earth", kind: "rot", ang: -60 },
    { id: "木L4", body: "Jupiter", kind: "rot", ang: 60 },
    { id: "木L5", body: "Jupiter", kind: "rot", ang: -60 }
  ];
  let lagMarks = [];
  function makeLagSprite(text, color) {
    const cvs = document.createElement("canvas");
    cvs.width = 256; cvs.height = 128;
    const ctx = cvs.getContext("2d");
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.beginPath();   // 菱形标记
    ctx.moveTo(128, 34); ctx.lineTo(150, 56); ctx.lineTo(128, 78); ctx.lineTo(106, 56);
    ctx.closePath(); ctx.stroke();
    ctx.font = "600 40px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,.9)"; ctx.shadowBlur = 8;
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 122);
    const tex = new THREE.CanvasTexture(cvs);
    tex.colorSpace = THREE.SRGBColorSpace;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, sizeAttenuation: false, transparent: true, opacity: 0.9, depthTest: false
    }));
    spr.scale.set(0.05, 0.025, 1);
    spr.renderOrder = 19;
    spr.visible = false;
    return spr;
  }
  function buildLagrange() {
    lagMarks = LAG_DEFS.map((d) => {
      const sprite = makeLagSprite(d.id, d.body === "Earth" ? "#7db4ff" : "#e0b06a");
      scene.add(sprite);
      return Object.assign({ sprite }, d);
    });
  }
  function updateLagrange(anchor, dx, dy, dz) {
    const show = document.getElementById("tglLagrange").checked;
    for (const m of lagMarks) m.sprite.visible = show;
    if (!show) return;
    for (const m of lagMarks) {
      const wb = worldKm[m.body];
      let kx, ky, kz;
      if (m.kind === "radial") { kx = wb[0] * (1 + m.f); ky = wb[1] * (1 + m.f); kz = wb[2] * (1 + m.f); }
      else if (m.kind === "opp") { kx = -wb[0]; ky = -wb[1]; kz = -wb[2]; }
      else {
        const th = m.ang * D2R, ct = Math.cos(th), st = Math.sin(th);
        kx = wb[0] * ct - wb[1] * st;
        ky = wb[0] * st + wb[1] * ct;
        kz = wb[2];
      }
      _rel[0] = kx - anchor[0]; _rel[1] = ky - anchor[1]; _rel[2] = kz - anchor[2];
      mapPoint(_rel, _p);
      let px = _p[0] - dx, py = _p[1] - dy, pz = _p[2] - dz;
      if (m.kind === "radial" && scaleBlend > 0.02) {
        // 观感尺度: 1% 日地距的偏移会被对数压缩吞没, 改用行星显示半径外推示意
        const ep = scenePos[m.body], sp = scenePos.Sun;
        let ux = ep[0] - sp[0], uy = ep[1] - sp[1], uz = ep[2] - sp[2];
        const ul = Math.hypot(ux, uy, uz) || 1;
        ux /= ul; uy /= ul; uz /= ul;
        const off = sceneRadius[m.body] * 2.8 * Math.sign(m.f);
        px = lerp(px, ep[0] + ux * off, scaleBlend);
        py = lerp(py, ep[1] + uy * off, scaleBlend);
        pz = lerp(pz, ep[2] + uz * off, scaleBlend);
      }
      m.sprite.position.set(px, py, pz);
    }
  }

  function buildSatellites() {
    for (const sat of SATELLITES) {
      // 轨道平面姿态: 赤道面卫星继承父行星 IAU 极轴; 黄道面卫星(月球)用倾角
      sat.quat = sat.plane === "equatorial"
        ? bodyByName[sat.parent].poleQuat.clone()
        : new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (sat.incl_deg || 0) * D2R);
      const posGroup = new THREE.Group();
      const tiltGroup = new THREE.Group();
      const poleGroup = new THREE.Group();
      tiltGroup.quaternion.copy(sat.quat);
      poleGroup.rotation.x = Math.PI / 2;
      posGroup.add(tiltGroup);
      tiltGroup.add(poleGroup);
      const mat = new THREE.MeshStandardMaterial({ map: TEX[sat.tex], roughness: 0.96, metalness: 0.0 });
      if (sat.bump && TEX[sat.bump]) { mat.bumpMap = TEX[sat.bump]; mat.bumpScale = 0.02; }
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat);
      poleGroup.add(mesh);
      sat.spinMesh = mesh;
      const pick = new THREE.Mesh(new THREE.SphereGeometry(1.9, 12, 8), new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, depthWrite: false, depthTest: false, colorWrite: false
      }));
      pick.userData.bodyName = sat.name;
      posGroup.add(pick);
      pickMeshes.push(pick);
      scene.add(posGroup);
      sat.group = posGroup;
      // 环绕父行星的轨道圈
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((96 + 1) * 3), 3));
      const ring = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: new THREE.Color(sat.accent), transparent: true, opacity: 0.26
      }));
      ring.frustumCulled = false;
      scene.add(ring);
      sat.orbitLine = ring;
      const label = makeLabel(sat.name);
      label.scale.set(0.068, 0.017, 1);
      scene.add(label);
      labels[sat.name] = label;
    }
  }

  function makeUranusRingTexture() {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 8;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, 512, 8);
    const bands = [[0.06, 0.10, 0.10], [0.30, 0.05, 0.12], [0.55, 0.07, 0.13], [0.95, 0.028, 0.55]];
    for (const [pos, width, alpha] of bands) {
      ctx.fillStyle = `rgba(196, 208, 222, ${alpha})`;
      ctx.fillRect(Math.round(pos * 512), 0, Math.max(2, Math.round(width * 512)), 8);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function makeCoronaTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0.0, "rgba(255,252,240,1.0)");
    g.addColorStop(0.16, "rgba(255,238,196,0.88)");
    g.addColorStop(0.34, "rgba(255,196,120,0.34)");
    g.addColorStop(0.62, "rgba(255,150,70,0.10)");
    g.addColorStop(1.0, "rgba(255,120,50,0.0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* ---------- 阶段6.3 程序化贴图: 矮行星 / 小卫星 / 彗核 ----------
   * 按已知地貌特征在 Canvas 上生成, 不依赖外部素材, 保持完全离线。 */
  function makeProcTexture(w, h, painter) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    painter(c.getContext("2d"), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    return tex;
  }
  function paintSplotches(ctx, w, h, n, palette, rMin, rMax, aMin, aMax) {
    for (let i = 0; i < n; i += 1) {
      const x = Math.random() * w, y = Math.random() * h;
      const r = rMin + Math.random() * (rMax - rMin);
      const col = palette[(Math.random() * palette.length) | 0];
      const a = aMin + Math.random() * (aMax - aMin);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${a.toFixed(3)})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  function paintCraters(ctx, w, h, n, rMin, rMax) {
    for (let i = 0; i < n; i += 1) {
      const x = Math.random() * w, y = Math.random() * h;
      const r = rMin + Math.random() * (rMax - rMin);
      ctx.fillStyle = `rgba(0,0,0,${(0.10 + Math.random() * 0.16).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${(0.06 + Math.random() * 0.10).toFixed(3)})`;
      ctx.lineWidth = Math.max(1, r * 0.18);
      ctx.beginPath(); ctx.arc(x, y, r, -2.4, -0.6); ctx.stroke();   // 受光侧坑缘
    }
  }
  function buildProceduralTextures() {
    TEX.ceres = makeProcTexture(512, 256, (ctx, w, h) => {
      ctx.fillStyle = "#8b8680"; ctx.fillRect(0, 0, w, h);
      paintSplotches(ctx, w, h, 130, [[120, 113, 104], [150, 144, 136], [104, 99, 94]], 12, 55, 0.10, 0.30);
      paintCraters(ctx, w, h, 110, 2, 12);
      for (const [fx, fy, fr] of [[0.36, 0.38, 5], [0.375, 0.40, 2.6], [0.62, 0.55, 2.2]]) {   // 奥卡托坑亮斑
        const g = ctx.createRadialGradient(fx * w, fy * h, 0, fx * w, fy * h, fr);
        g.addColorStop(0, "rgba(255,252,238,0.95)");
        g.addColorStop(1, "rgba(255,252,238,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(fx * w, fy * h, fr, 0, Math.PI * 2); ctx.fill();
      }
    });
    TEX.pluto = makeProcTexture(512, 256, (ctx, w, h) => {
      ctx.fillStyle = "#c8a87e"; ctx.fillRect(0, 0, w, h);
      paintSplotches(ctx, w, h, 90, [[214, 188, 150], [188, 152, 112], [232, 214, 178]], 16, 70, 0.14, 0.34);
      ctx.fillStyle = "rgba(74, 42, 30, 0.78)";   // 克苏鲁暗斑: 赤道深红棕带
      ctx.beginPath();
      ctx.ellipse(0.18 * w, 0.55 * h, 0.20 * w, 0.14 * h, 0, 0, Math.PI * 2); ctx.fill();
      paintSplotches(ctx, w, h, 26, [[64, 36, 26]], 8, 30, 0.25, 0.5);
      ctx.fillStyle = "rgba(244, 234, 214, 0.94)";   // 斯普特尼克平原: 氮冰之心
      ctx.beginPath();
      ctx.ellipse(0.47 * w, 0.52 * h, 0.075 * w, 0.16 * h, -0.25, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0.52 * w, 0.47 * h, 0.06 * w, 0.12 * h, 0.35, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createLinearGradient(0, 0, 0, 0.22 * h);   // 北极淡霜
      g.addColorStop(0, "rgba(238, 228, 208, 0.55)");
      g.addColorStop(1, "rgba(238, 228, 208, 0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, 0.22 * h);
    });
    TEX.charon = makeProcTexture(384, 192, (ctx, w, h) => {
      ctx.fillStyle = "#96908a"; ctx.fillRect(0, 0, w, h);
      paintSplotches(ctx, w, h, 80, [[168, 162, 156], [122, 116, 110]], 10, 45, 0.12, 0.3);
      paintCraters(ctx, w, h, 60, 2, 9);
      const g = ctx.createLinearGradient(0, 0, 0, 0.3 * h);   // 魔多暗斑: 北极红棕
      g.addColorStop(0, "rgba(112, 62, 42, 0.85)");
      g.addColorStop(1, "rgba(112, 62, 42, 0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, 0.3 * h);
    });
    TEX.triton = makeProcTexture(384, 192, (ctx, w, h) => {
      ctx.fillStyle = "#cfbdb4"; ctx.fillRect(0, 0, w, h);
      paintSplotches(ctx, w, h, 90, [[226, 214, 208], [186, 168, 160], [212, 190, 176]], 8, 36, 0.12, 0.3);
      const g = ctx.createLinearGradient(0, 0.55 * h, 0, h);   // 南极氮冰冠
      g.addColorStop(0, "rgba(240, 232, 226, 0)");
      g.addColorStop(1, "rgba(246, 238, 230, 0.9)");
      ctx.fillStyle = g; ctx.fillRect(0, 0.55 * h, w, 0.45 * h);
      for (let i = 0; i < 46; i += 1) {   // 氮冰喷泉暗条纹
        const x = Math.random() * w, y = (0.68 + Math.random() * 0.28) * h;
        ctx.strokeStyle = "rgba(70, 60, 56, 0.28)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 6 + Math.random() * 10, y - 2 - Math.random() * 4); ctx.stroke();
      }
    });
    TEX.phobos = makeProcTexture(256, 128, (ctx, w, h) => {
      ctx.fillStyle = "#7c6f62"; ctx.fillRect(0, 0, w, h);
      paintSplotches(ctx, w, h, 70, [[104, 94, 84], [66, 58, 50]], 6, 26, 0.14, 0.34);
      paintCraters(ctx, w, h, 80, 2, 9);
      ctx.fillStyle = "rgba(30, 25, 20, 0.55)";   // 斯蒂克尼大坑
      ctx.beginPath(); ctx.ellipse(0.28 * w, 0.5 * h, 0.13 * w, 0.2 * h, 0, 0, Math.PI * 2); ctx.fill();
    });
    TEX.deimos = makeProcTexture(256, 128, (ctx, w, h) => {
      ctx.fillStyle = "#8d7f70"; ctx.fillRect(0, 0, w, h);
      paintSplotches(ctx, w, h, 60, [[122, 110, 98], [150, 138, 124]], 8, 30, 0.12, 0.28);
      paintCraters(ctx, w, h, 30, 2, 6);
    });
    TEX.enceladus = makeProcTexture(256, 128, (ctx, w, h) => {
      ctx.fillStyle = "#eef4f8"; ctx.fillRect(0, 0, w, h);
      paintSplotches(ctx, w, h, 40, [[224, 236, 244], [200, 216, 228]], 8, 30, 0.10, 0.22);
      for (let i = 0; i < 5; i += 1) {   // 南极虎纹裂缝
        ctx.strokeStyle = "rgba(90, 140, 160, 0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(w * (0.2 + i * 0.14), h * 0.82);
        ctx.quadraticCurveTo(w * (0.28 + i * 0.14), h * 0.9, w * (0.34 + i * 0.14), h * 0.84);
        ctx.stroke();
      }
    });
    TEX.iapetus = makeProcTexture(384, 192, (ctx, w, h) => {
      ctx.fillStyle = "#ded4c2"; ctx.fillRect(0, 0, w, h);
      const g = ctx.createLinearGradient(w * 0.16, 0, w * 0.34, 0);   // 阴阳脸: 前导半球漆黑
      g.addColorStop(0, "rgba(52, 38, 26, 0)");
      g.addColorStop(1, "rgba(52, 38, 26, 0.92)");
      ctx.fillStyle = g; ctx.fillRect(w * 0.16, 0, w * 0.18, h);
      ctx.fillStyle = "rgba(52, 38, 26, 0.92)"; ctx.fillRect(w * 0.34, 0, w * 0.32, h);
      const g2 = ctx.createLinearGradient(w * 0.66, 0, w * 0.84, 0);
      g2.addColorStop(0, "rgba(52, 38, 26, 0.92)");
      g2.addColorStop(1, "rgba(52, 38, 26, 0)");
      ctx.fillStyle = g2; ctx.fillRect(w * 0.66, 0, w * 0.18, h);
      paintCraters(ctx, w, h, 50, 2, 8);
      ctx.fillStyle = "rgba(120, 100, 76, 0.5)"; ctx.fillRect(0, h * 0.48, w, 2);   // 赤道脊
    });
    TEX.miranda = makeProcTexture(256, 128, (ctx, w, h) => {
      ctx.fillStyle = "#c8ccd2"; ctx.fillRect(0, 0, w, h);
      const rr = Math.random;
      for (let i = 0; i < 14; i += 1) {   // 拼图混乱地形
        const gr = Math.round(160 + rr() * 60);
        ctx.fillStyle = `rgba(${gr},${gr + 4},${gr + 10},0.5)`;
        ctx.fillRect(rr() * w, rr() * h, 20 + rr() * 60, 12 + rr() * 40);
      }
      for (let i = 0; i < 10; i += 1) {   // 冕状沟槽
        ctx.strokeStyle = "rgba(84, 90, 100, 0.5)";
        ctx.beginPath();
        const y0 = rr() * h;
        ctx.moveTo(rr() * w, y0);
        ctx.lineTo(rr() * w, y0 + (rr() - 0.5) * 30);
        ctx.stroke();
      }
      paintCraters(ctx, w, h, 30, 2, 7);
    });
    TEX.ariel = makeProcTexture(256, 128, (ctx, w, h) => {
      ctx.fillStyle = "#dde3e9"; ctx.fillRect(0, 0, w, h);
      paintSplotches(ctx, w, h, 50, [[196, 204, 212], [228, 234, 240]], 8, 30, 0.12, 0.26);
      paintCraters(ctx, w, h, 55, 2, 8);
      for (let i = 0; i < 6; i += 1) {   // 峡谷
        ctx.strokeStyle = "rgba(120, 128, 140, 0.45)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(Math.random() * w, Math.random() * h);
        ctx.lineTo(Math.random() * w, Math.random() * h);
        ctx.stroke();
      }
    });
    TEX.umbriel = makeProcTexture(256, 128, (ctx, w, h) => {
      ctx.fillStyle = "#6e7076"; ctx.fillRect(0, 0, w, h);
      paintSplotches(ctx, w, h, 60, [[92, 94, 100], [122, 124, 130]], 8, 30, 0.12, 0.26);
      paintCraters(ctx, w, h, 70, 2, 9);
      ctx.strokeStyle = "rgba(226, 226, 218, 0.6)";   // 温达坑亮环
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(w * 0.3, h * 0.12, 9, 0, Math.PI * 2); ctx.stroke();
    });
    TEX.titania = makeProcTexture(256, 128, (ctx, w, h) => {
      ctx.fillStyle = "#c2bab2"; ctx.fillRect(0, 0, w, h);
      paintSplotches(ctx, w, h, 55, [[170, 160, 150], [204, 196, 188]], 8, 32, 0.12, 0.26);
      paintCraters(ctx, w, h, 60, 2, 9);
      ctx.strokeStyle = "rgba(96, 88, 80, 0.5)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(w * 0.55, h * 0.15);
      ctx.quadraticCurveTo(w * 0.62, h * 0.5, w * 0.58, h * 0.85);   // 大峡谷
      ctx.stroke();
    });
    TEX.oberon = makeProcTexture(256, 128, (ctx, w, h) => {
      ctx.fillStyle = "#a89e94"; ctx.fillRect(0, 0, w, h);
      paintSplotches(ctx, w, h, 55, [[140, 130, 120], [180, 172, 162]], 8, 32, 0.12, 0.28);
      paintCraters(ctx, w, h, 90, 2, 10);
      for (let i = 0; i < 6; i += 1) {   // 坑底暗色物质
        ctx.fillStyle = "rgba(56, 48, 42, 0.6)";
        ctx.beginPath();
        ctx.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    TEX.halley = makeProcTexture(256, 128, (ctx, w, h) => {
      ctx.fillStyle = "#26221e"; ctx.fillRect(0, 0, w, h);
      paintSplotches(ctx, w, h, 60, [[56, 50, 44], [14, 12, 10], [70, 64, 54]], 5, 22, 0.2, 0.45);
    });
  }
  function makeComaTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0.0, "rgba(228, 244, 255, 1.0)");
    g.addColorStop(0.25, "rgba(190, 224, 250, 0.5)");
    g.addColorStop(0.6, "rgba(150, 200, 244, 0.14)");
    g.addColorStop(1.0, "rgba(120, 180, 240, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* 小行星带 v2: 轨道计算完全在 GPU 顶点着色器内进行。
   * 每颗小行星携带自己的开普勒根数(a,e,i,Ω,ω,M0,n), 逐帧只更新 uDt/uBlend/uAnchorKm 等几个 uniform。
   * 主带含柯克伍德空隙(与木星 3:1、5:2、7:3、2:1 共振), 外加木星 L4/L5 特洛伊群。 */
  const BELT_VERT = `
    #include <common>
    #include <logdepthbuf_pars_vertex>
    attribute vec4 orb1;   // a(AU), e, i(rad), node(rad)
    attribute vec4 orb2;   // argPeri(rad), M0(rad), n(rad/day), size(px)
    attribute vec3 tint;
    uniform float uDt;         // jd - J2000: 传小数量级保 float32 精度, 否则 uJd(~2.45e6)量化到 0.25 天导致点云集体颤动
    uniform float uBlend;
    uniform float uPixelRatio;
    uniform float uSizeK;      // 透视衰减参考距离(BU), 按尺度模式在 CPU 侧设定
    uniform float uKeep;       // 观感尺度抽稀比例(0~1), 真实尺度恒为全量
    uniform vec3 uAnchorKm;
    uniform vec3 uDeltaBu;
    varying vec3 vTint;
    varying float vFade;
    const float AU = 149597870.7;
    void main() {
      // 观感尺度抽稀: 对数压缩把整条带挤进窄环, 全量点数会糊成"雪墙"。
      // 用 M0 自带随机性做筛子, 观感模式只画 uKeep 比例的点; 真实尺度(uBlend→0)全量。
      float lodR = fract(orb2.y * 0.15915494);
      if (lodR > mix(1.0, uKeep, uBlend)) {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);   // 移出裁剪体
        gl_PointSize = 0.0;
        vFade = 0.0;
        vTint = vec3(0.0);
        return;
      }
      float e = orb1.y;
      float M = mod(orb2.y + orb2.z * uDt, 6.2831853);
      // 低偏心率快速开普勒解: 级数近似 + 一次牛顿迭代
      float E = M + e * sin(M) + 0.5 * e * e * sin(2.0 * M);
      E -= (E - e * sin(E) - M) / (1.0 - e * cos(E));
      float xp = orb1.x * (cos(E) - e);
      float yp = orb1.x * sqrt(1.0 - e * e) * sin(E);
      float cw = cos(orb2.x), sw = sin(orb2.x);
      float co = cos(orb1.w), so = sin(orb1.w);
      float ci = cos(orb1.z), si = sin(orb1.z);
      vec3 km = vec3(
        (cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp,
        (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp,
        (sw * si) * xp + (cw * si) * yp) * AU - uAnchorKm;
      // 双尺度映射(与 CPU 端 mapPoint 一致): 13.0288344 = cinDistScale(30) / ln(10)
      float d = length(km);
      vec3 cin = d > 0.0 ? km * (log(1.0 + d / AU) * 13.0288344 / d) : vec3(0.0);
      vec3 pos = mix(km / 1000.0, cin, uBlend) - uDeltaBu;
      gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
      // 透视衰减: 拉远时点变小变淡、近看恢复, 避免上万点堆叠成"白色泡沫"
      float att = clamp(uSizeK / max(gl_Position.w, 1e-6), 0.22, 1.5);
      gl_PointSize = clamp(orb2.w * uPixelRatio * att, 0.7, 3.8);
      vFade = clamp(att * 1.1, 0.35, 1.0);
      vTint = tint;
      #include <logdepthbuf_vertex>
    }`;
  const BELT_FRAG = `
    #include <common>
    #include <logdepthbuf_pars_fragment>
    varying vec3 vTint;
    varying float vFade;
    void main() {
      #include <logdepthbuf_fragment>
      vec2 c = gl_PointCoord - 0.5;
      float r2 = dot(c, c);
      if (r2 > 0.25) discard;
      float alpha = smoothstep(0.25, 0.04, r2) * 0.55 * vFade;
      gl_FragColor = vec4(vTint, alpha);
    }`;

  function buildBelt() {
    const hasReal = typeof window !== "undefined" && window.AST_REAL && typeof atob === "function";
    const MAIN = hasReal ? 0 : 22000, TROJAN = hasReal ? 0 : 2200;   // 真实带就位则程序化点云零构建(省 ~1MB + GPU 缓冲)
    const N = MAIN + TROJAN * 2;
    const orb1 = new Float32Array(N * 4);
    const orb2 = new Float32Array(N * 4);
    const tint = new Float32Array(N * 3);
    const TWO_PI = Math.PI * 2;
    const rand = Math.random;
    const gauss = () => (rand() + rand() + rand() + rand() - 2) / 2;      // 近似正态
    const rayleigh = (s) => s * Math.sqrt(-2 * Math.log(1 - rand() * 0.9999));
    // 柯克伍德空隙: [中心 a(AU), 宽度σ]
    const GAPS = [[2.502, 0.02], [2.825, 0.022], [2.958, 0.02], [3.279, 0.035]];
    function sampleMainA() {
      for (;;) {
        const a = 2.06 + Math.pow(rand(), 0.85) * 1.24;
        let keep = 1.0;
        for (const [g, w] of GAPS) keep *= 1 - 0.92 * Math.exp(-((a - g) * (a - g)) / (2 * w * w));
        if (rand() < keep) return a;
      }
    }
    const jup = bodyByName.Jupiter.orbit_j2000;
    const nJup = TWO_PI / (Math.pow(jup.a_au, 1.5) * 365.25);
    const lonJup0 = jup.L_deg * D2R;             // 木星 J2000 平黄经
    for (let i = 0; i < N; i += 1) {
      let a, e, inc, node, argPeri, M0, n, r, g, b2;
      if (i < MAIN) {
        a = sampleMainA();
        e = Math.min(rayleigh(0.07), 0.27);
        inc = Math.min(rayleigh(6 * D2R), 30 * D2R);
        node = rand() * TWO_PI;
        argPeri = rand() * TWO_PI;
        M0 = rand() * TWO_PI;
        n = TWO_PI / (Math.pow(a, 1.5) * 365.25);
        // 内带 S 型偏红亮, 外带 C 型暗灰
        const t = clamp((a - 2.1) / 1.2, 0, 1);
        const shade = 0.30 + rand() * 0.36;
        r = shade * lerp(1.0, 0.78, t);
        g = shade * lerp(0.88, 0.76, t);
        b2 = shade * lerp(0.72, 0.74, t);
      } else {
        // 特洛伊群: 与木星同周期, 平黄经在木星前后 60° 附近扩散
        const side = i < MAIN + TROJAN ? 1 : -1;
        a = jup.a_au + gauss() * 0.12;
        e = Math.min(rayleigh(0.055), 0.2);
        inc = Math.min(rayleigh(9 * D2R), 35 * D2R);
        node = rand() * TWO_PI;
        argPeri = rand() * TWO_PI;
        const lon0 = lonJup0 + side * (60 * D2R) + gauss() * (14 * D2R);
        M0 = lon0 - node - argPeri;              // 平黄经 λ = Ω + ω + M
        n = nJup;
        const shade = 0.26 + rand() * 0.30;      // D 型暗红棕
        r = shade * 0.95; g = shade * 0.8; b2 = shade * 0.68;
      }
      orb1[i * 4] = a; orb1[i * 4 + 1] = e; orb1[i * 4 + 2] = inc; orb1[i * 4 + 3] = node;
      orb2[i * 4] = argPeri; orb2[i * 4 + 1] = M0; orb2[i * 4 + 2] = n;
      orb2[i * 4 + 3] = 0.8 + Math.pow(rand(), 3) * 2.0;
      tint[i * 3] = r; tint[i * 3 + 1] = g; tint[i * 3 + 2] = b2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));  // 占位, 实际位置在着色器算
    geo.setAttribute("orb1", new THREE.BufferAttribute(orb1, 4));
    geo.setAttribute("orb2", new THREE.BufferAttribute(orb2, 4));
    registerBeltSet(geo.getAttribute("orb2"), N);
    geo.setAttribute("tint", new THREE.BufferAttribute(tint, 3));
    beltMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uDt: { value: 0 },
        uBlend: { value: scaleBlend },
        uPixelRatio: { value: renderer.getPixelRatio() },
        uSizeK: { value: 55 },
        uKeep: { value: 0.42 },
        uAnchorKm: { value: new THREE.Vector3() },
        uDeltaBu: { value: new THREE.Vector3() }
      },
      vertexShader: BELT_VERT, fragmentShader: BELT_FRAG,
      transparent: true, depthWrite: false
    });
    beltPoints = new THREE.Points(geo, beltMaterial);
    beltPoints.frustumCulled = false;
    // 材质与柯伊伯带共用, 各自绘制前设置自己的抽稀比例(观感尺度主带只画 42%)
    beltPoints.onBeforeRender = () => { beltMaterial.uniforms.uKeep.value = 0.42 * (window.__perfKeep || 1); };
    scene.add(beltPoints);
  }

  /* 柯伊伯带: 与小行星带共用同一 GPU 轨道着色器与 uniform, 额外一次 draw call。
   * 三个族群: 冥族小天体(与海王星 3:2 共振, a≈39.4)、经典带(冷红/热灰)、离散盘(高偏心)。 */
  /* 真实小行星带: 19,139 颗 JPL SBDB 编号小行星(主带 H≤13.3 + Hilda + 特洛伊),
   * base64 Float32 stride-7 (a,e,i,om,w,M@ref,H), 历元 2461200.5, 复用带着色器与历元重基。
   * 柯克伍德空隙 / L4L5 双营地 / Hilda 三角由真实数据自然显形。 */
  let realBeltPoints = null;
  function buildRealBelt() {
    if (realBeltPoints) return;   // 幂等: 懒加载到货后重入
    if (typeof window === "undefined" || !window.AST_REAL || typeof atob !== "function") return;
    let f;
    try {
      const bin = atob(window.AST_REAL.b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      f = new Float32Array(bytes.buffer);
    } catch (e) { return; }
    const N = window.AST_REAL.n;
    if (!N || f.length !== N * 7) return;
    const refDt = window.AST_REAL.ref - J2000;   // 参考历元相对 J2000 天数
    const orb1 = new Float32Array(N * 4);
    const orb2 = new Float32Array(N * 4);
    const tint = new Float32Array(N * 3);
    const TWO_PI = Math.PI * 2;
    let rnd = 987654321;
    const rand = () => { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd / 0x7fffffff; };
    for (let i = 0; i < N; i += 1) {
      const a = f[i * 7], e = f[i * 7 + 1], inc = f[i * 7 + 2] * D2R;
      const om = f[i * 7 + 3] * D2R, w = f[i * 7 + 4] * D2R, Mref = f[i * 7 + 5] * D2R, H = f[i * 7 + 6];
      const nDeg = 0.9856076686 / Math.pow(a, 1.5);
      let M0 = Mref - nDeg * D2R * refDt;   // 回推到 J2000(f64 计算后归一)
      M0 = ((M0 % TWO_PI) + TWO_PI) % TWO_PI;
      orb1[i * 4] = a; orb1[i * 4 + 1] = e; orb1[i * 4 + 2] = inc; orb1[i * 4 + 3] = om;
      orb2[i * 4] = w; orb2[i * 4 + 1] = M0; orb2[i * 4 + 2] = nDeg * D2R;
      orb2[i * 4 + 3] = clamp(3.0 - 0.22 * (H - 8), 0.75, 3.4) * (0.9 + 0.2 * rand());
      const q = a * (1 - e);
      let r, g, b;
      if (a > 4.8) { r = 0.72; g = 0.66; b = 0.92; }          // 特洛伊: 淡紫
      else if (a > 3.6) { r = 0.55; g = 0.85; b = 0.78; }     // Hilda: 青
      else if (q < 1.3) { r = 1.0; g = 0.62; b = 0.42; }      // 近地: 琥珀
      else if (a < 2.5) { r = 0.9; g = 0.84; b = 0.74; }      // 内带: 暖
      else { r = 0.72; g = 0.76; b = 0.84; }                  // 外带: 冷
      const j = 0.88 + 0.24 * rand();
      tint[i * 3] = r * j; tint[i * 3 + 1] = g * j; tint[i * 3 + 2] = b * j;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));   // 占位, 真位置着色器算
    geo.setAttribute("orb1", new THREE.BufferAttribute(orb1, 4));
    geo.setAttribute("orb2", new THREE.BufferAttribute(orb2, 4));
    registerBeltSet(geo.getAttribute("orb2"), N);
    geo.setAttribute("tint", new THREE.BufferAttribute(tint, 3));
    realBeltPoints = new THREE.Points(geo, beltMaterial);   // 共材质共 uniform
    realBeltPoints.frustumCulled = false;
    realBeltPoints.onBeforeRender = () => { beltMaterial.uniforms.uKeep.value = 0.55 * (window.__perfKeep || 1); };
    scene.add(realBeltPoints);
    if (typeof window !== "undefined") window.__belt = { realN: N };
  }

  function buildKuiper() {
    const N_PLUT = 2600, N_CLASS = 8400, N_SCAT = 1500;
    const N = N_PLUT + N_CLASS + N_SCAT;
    const orb1 = new Float32Array(N * 4);
    const orb2 = new Float32Array(N * 4);
    const tint = new Float32Array(N * 3);
    const TWO_PI = Math.PI * 2;
    const rand = Math.random;
    const gauss = () => (rand() + rand() + rand() + rand() - 2) / 2;
    const rayleigh = (s) => s * Math.sqrt(-2 * Math.log(1 - rand() * 0.9999));
    for (let i = 0; i < N; i += 1) {
      let a, e, inc, shade, r, g, b2;
      if (i < N_PLUT) {                       // 冥族小天体
        a = 39.45 + gauss() * 0.35;
        e = Math.min(rayleigh(0.15), 0.33);
        inc = Math.min(rayleigh(10 * D2R), 34 * D2R);
        shade = 0.20 + rand() * 0.26;
        r = shade * 0.92; g = shade * 0.86; b2 = shade * 0.82;
      } else if (i < N_PLUT + N_CLASS) {      // 经典带: 70% 冷(偏红) / 30% 热(偏灰)
        a = 42.0 + rand() * 5.6;
        if (rand() < 0.7) {
          e = Math.min(rayleigh(0.045), 0.14);
          inc = Math.min(rayleigh(2.2 * D2R), 7 * D2R);
          shade = 0.20 + rand() * 0.28;
          r = shade * 1.0; g = shade * 0.74; b2 = shade * 0.58;
        } else {
          e = Math.min(rayleigh(0.10), 0.24);
          inc = Math.min(rayleigh(13 * D2R), 36 * D2R);
          shade = 0.18 + rand() * 0.26;
          r = shade * 0.88; g = shade * 0.88; b2 = shade * 0.92;
        }
      } else {                                 // 离散盘: 近日点 30~38 AU
        a = 48 + Math.pow(rand(), 1.7) * 42;
        const q = 30 + rand() * 8;
        e = Math.min(Math.max(1 - q / a, 0.05), 0.52);
        inc = Math.min(rayleigh(15 * D2R), 42 * D2R);
        shade = 0.15 + rand() * 0.22;
        r = shade * 0.82; g = shade * 0.86; b2 = shade * 0.96;
      }
      const node = rand() * TWO_PI;
      const argPeri = rand() * TWO_PI;
      const M0 = rand() * TWO_PI;
      const n = TWO_PI / (Math.pow(a, 1.5) * 365.25);
      orb1[i * 4] = a; orb1[i * 4 + 1] = e; orb1[i * 4 + 2] = inc; orb1[i * 4 + 3] = node;
      orb2[i * 4] = argPeri; orb2[i * 4 + 1] = M0; orb2[i * 4 + 2] = n;
      orb2[i * 4 + 3] = 0.7 + Math.pow(rand(), 3) * 1.5;
      tint[i * 3] = r; tint[i * 3 + 1] = g; tint[i * 3 + 2] = b2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute("orb1", new THREE.BufferAttribute(orb1, 4));
    geo.setAttribute("orb2", new THREE.BufferAttribute(orb2, 4));
    registerBeltSet(geo.getAttribute("orb2"), N);
    geo.setAttribute("tint", new THREE.BufferAttribute(tint, 3));
    kuiperPoints = new THREE.Points(geo, beltMaterial);   // 共用材质 → 共用 uniform, 一次更新两带
    kuiperPoints.frustumCulled = false;
    kuiperPoints.onBeforeRender = () => { beltMaterial.uniforms.uKeep.value = 0.62 * (window.__perfKeep || 1); };   // 柯伊伯带留 62%
    scene.add(kuiperPoints);
  }

  /* ---------- 彗星: 分段密切根数传播(通用) ---------- */
  function cometActiveSeg(c, jdTt) {
    let k = 0;
    while (jdTt >= c.segments[k].until) k += 1;
    return c.segments[k];
  }
  const _csegO = { argPeri: 0, node: 0, i: 0 };
  function cometSegKm(seg, jdTt, out) {
    if (seg.e > 1) {   // 双曲线: M 无界, 牛顿解 M = e·sinh(H) − H
      const Mh = seg.n * (jdTt - seg.tp) * D2R;
      let Hh = Math.asinh(Mh / seg.e);
      for (let it = 0; it < 14; it += 1) {
        const f = seg.e * Math.sinh(Hh) - Hh - Mh;
        const d = seg.e * Math.cosh(Hh) - 1;
        Hh -= f / d;
        if (Math.abs(f) < 1e-13) break;
      }
      _csegO.argPeri = seg.w * D2R;
      _csegO.node = seg.node * D2R;
      _csegO.i = seg.i * D2R;
      return planeToEclipticKm(
        seg.a * (Math.cosh(Hh) - seg.e),
        -seg.a * Math.sqrt(seg.e * seg.e - 1) * Math.sinh(Hh),
        _csegO, out
      );
    }
    const M = normalizeRad(seg.n * (jdTt - seg.tp) * D2R);
    const E = solveKepler(M, seg.e);
    _csegO.argPeri = seg.w * D2R;
    _csegO.node = seg.node * D2R;
    _csegO.i = seg.i * D2R;
    return planeToEclipticKm(
      seg.a * (Math.cos(E) - seg.e),
      seg.a * Math.sqrt(1 - seg.e * seg.e) * Math.sin(E),
      _csegO, out
    );
  }
  const _ck0 = [0, 0, 0], _ck1 = [0, 0, 0];
  function cometKm(c, jdTt, out) {
    const segs = c.segments;
    let k = 0;
    while (jdTt >= segs[k].until) k += 1;
    const W = 730;   // 段界(远日点附近)前后 ±2 年平滑混合
    if (k > 0 && jdTt < segs[k - 1].until + W) {
      const s0 = (jdTt - (segs[k - 1].until - W)) / (2 * W);
      const sm = s0 * s0 * (3 - 2 * s0);
      const p0 = cometSegKm(segs[k - 1], jdTt, _ck0), p1 = cometSegKm(segs[k], jdTt, _ck1);
      const r = out || [0, 0, 0];
      r[0] = lerp(p0[0], p1[0], sm); r[1] = lerp(p0[1], p1[1], sm); r[2] = lerp(p0[2], p1[2], sm);
      return r;
    }
    if (segs[k].until !== Infinity && jdTt > segs[k].until - W) {
      const s0 = (jdTt - (segs[k].until - W)) / (2 * W);
      const sm = s0 * s0 * (3 - 2 * s0);
      const p0 = cometSegKm(segs[k], jdTt), p1 = cometSegKm(segs[k + 1], jdTt);
      return [lerp(p0[0], p1[0], sm), lerp(p0[1], p1[1], sm), lerp(p0[2], p1[2], sm)];
    }
    return cometSegKm(segs[k], jdTt, out);
  }
  function makeTailPoints(count, color, size) {
    const geo = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    pos.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", pos);
    const mat = new THREE.PointsMaterial({
      color, size, sizeAttenuation: false, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    const params = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      params[i * 3] = Math.pow(Math.random(), 0.8);   // 尾向参数 t
      params[i * 3 + 1] = (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;
      params[i * 3 + 2] = (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;
    }
    return { pts, params, count };
  }
  function buildComets() {
    for (const c of COMETS) {
      const group = new THREE.Group();
      const nucleus = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16),
        new THREE.MeshStandardMaterial({ map: TEX[c.tex] || TEX.halley, roughness: 1.0, metalness: 0.0 }));
      group.add(nucleus);
      const coma = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeComaTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      scene.add(coma);
      const pick = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, depthWrite: false, depthTest: false, colorWrite: false
      }));
      pick.userData.bodyName = c.name;
      scene.add(pick);
      pickMeshes.push(pick);
      const ion = makeTailPoints(430, new THREE.Color(0.55, 0.75, 1.0), 2.2);
      const dust = makeTailPoints(360, new THREE.Color(1.0, 0.93, 0.8), 2.6);
      scene.add(ion.pts);
      scene.add(dust.pts);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((256 + 1) * 3), 3));
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array((256 + 1) * 3).fill(1), 3));
      const orbitLine = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: new THREE.Color(c.accent), vertexColors: true, transparent: true, opacity: 0.45
      }));
      orbitLine.frustumCulled = false;
      scene.add(orbitLine);
      scene.add(group);
      const label = makeLabel(c.name);
      label.scale.set(0.078, 0.0195, 1);
      scene.add(label);
      labels[c.name] = label;
      c.gfx = { group, nucleus, coma, pick, ion, dust, orbitLine };
    }
  }
  const _antiSun = new THREE.Vector3();
  const _trailDir = new THREE.Vector3();
  const _basisU = new THREE.Vector3();
  const _basisW = new THREE.Vector3();
  const _tailKm = [0, 0, 0];
  function writeTail(tail, ckm, anchor, dx, dy, dz, lenKm, lateralKm, spreadBase) {
    const arr = tail.pts.geometry.attributes.position.array;
    for (let i = 0; i < tail.count; i += 1) {
      const t = tail.params[i * 3];
      const g1 = tail.params[i * 3 + 1];
      const g2 = tail.params[i * 3 + 2];
      const along = t * lenKm;
      const lat = lateralKm * t * t;
      const spread = (spreadBase + 0.13 * t) * lenKm;
      _tailKm[0] = ckm[0] + _antiSun.x * along + _trailDir.x * lat + _basisU.x * g1 * spread + _basisW.x * g2 * spread;
      _tailKm[1] = ckm[1] + _antiSun.y * along + _trailDir.y * lat + _basisU.y * g1 * spread + _basisW.y * g2 * spread;
      _tailKm[2] = ckm[2] + _antiSun.z * along + _trailDir.z * lat + _basisU.z * g1 * spread + _basisW.z * g2 * spread;
      _rel[0] = _tailKm[0] - anchor[0]; _rel[1] = _tailKm[1] - anchor[1]; _rel[2] = _tailKm[2] - anchor[2];
      mapPoint(_rel, _p);
      arr[i * 3] = _p[0] - dx; arr[i * 3 + 1] = _p[1] - dy; arr[i * 3 + 2] = _p[2] - dz;
    }
    tail.pts.geometry.attributes.position.needsUpdate = true;
  }
  function updateComets(anchor, dx, dy, dz) {
    if (!COMETS[0].gfx) return;
    const showOrbits = document.getElementById("tglOrbits").checked;
    const showLabels = document.getElementById("tglLabels").checked;
    const TWO_PI = Math.PI * 2;
    for (const c of COMETS) {
      const gfx = c.gfx;
      const ckm = worldKm[c.name];
      _rel[0] = ckm[0] - anchor[0]; _rel[1] = ckm[1] - anchor[1]; _rel[2] = ckm[2] - anchor[2];
      mapPoint(_rel, _p);
      const px = _p[0] - dx, py = _p[1] - dy, pz = _p[2] - dz;
      const rAu = Math.hypot(ckm[0], ckm[1], ckm[2]) / AU_KM;
      const act = c.actR ? clamp(Math.pow(c.actR / Math.max(rAu, 0.2), c.actP), 0, 1) : 0;   // 活动度: 距日越近越活跃(小行星恒 0)
      const rNuc = lerp(c.radius_km / SCALE.sceneUnitKm, c.cinR || (0.05 * Math.pow(c.radius_km / 5.5, 0.3)), scaleBlend);
      gfx.group.position.set(px, py, pz);
      gfx.group.scale.setScalar(rNuc);
      const comaScale = (rNuc * 7 + act * lerp(46, 0.85, scaleBlend) + lerp(0, 0.12, scaleBlend)) * c.comaK;
      gfx.coma.position.set(px, py, pz);
      gfx.coma.scale.set(comaScale, comaScale, 1);
      gfx.coma.visible = !c.noComa;
      gfx.coma.material.opacity = 0.14 + 0.62 * act;
      const rPick = Math.max(rNuc * 5, comaScale * 0.5);
      gfx.pick.position.set(px, py, pz);
      gfx.pick.scale.setScalar(rPick);
      scenePos[c.name] = [px, py, pz];
      sceneRadius[c.name] = c.noComa ? Math.max(rNuc, 0.1) : Math.max(rNuc, comaScale * 0.42);
      // 彗尾: 离子尾反日向笔直, 尘埃尾向轨道后方弯曲
      _antiSun.set(ckm[0], ckm[1], ckm[2]).normalize();
      const k2 = cometKm(c, jd + 0.4);
      _trailDir.set(ckm[0] - k2[0], ckm[1] - k2[1], ckm[2] - k2[2]).normalize();
      _basisU.set(0, 0, 1).cross(_antiSun);
      if (_basisU.lengthSq() < 1e-8) _basisU.set(1, 0, 0);
      _basisU.normalize();
      _basisW.crossVectors(_antiSun, _basisU).normalize();
      const tailsVisible = act > 0.02;
      gfx.ion.pts.visible = tailsVisible;
      gfx.dust.pts.visible = tailsVisible;
      if (tailsVisible) {
        writeTail(gfx.ion, ckm, anchor, dx, dy, dz, c.ionLen * act, 0.9e6 * act, 0.025);
        writeTail(gfx.dust, ckm, anchor, dx, dy, dz, c.dustLen * act, 7.2e6 * act, 0.05);
        gfx.ion.pts.material.opacity = 0.55 * act;
        gfx.dust.pts.material.opacity = 0.5 * act;
      }
      // 轨道线(渐变尾迹)
      gfx.orbitLine.visible = showOrbits;
      if (showOrbits && !lineSkip) {
        const seg = cometActiveSeg(c, jd);
        const arr = gfx.orbitLine.geometry.attributes.position.array;
        const colArr = gfx.orbitLine.geometry.attributes.color.array;
        const o = { argPeri: seg.w * D2R, node: seg.node * D2R, i: seg.i * D2R };
        if (seg.e > 1) {   // 双曲线轨迹: ±90 AU 弧段, 天体处最亮向两端渐隐
          const Mh0 = seg.n * (jd - seg.tp) * D2R;
          let H0 = Math.asinh(Mh0 / seg.e);
          for (let it = 0; it < 14; it += 1) H0 -= (seg.e * Math.sinh(H0) - H0 - Mh0) / (seg.e * Math.cosh(H0) - 1);
          const Hmax = Math.acosh(Math.max((1 + 90 / (-seg.a)) / seg.e, 1.0001));
          const H0c = clamp(H0, -Hmax * 0.98, Hmax * 0.98);
          for (let i = 0; i <= 256; i += 1) {
            const x = i / 128 - 1;
            const span = x < 0 ? H0c + Hmax : Hmax - H0c;
            const Hh = H0c + Math.sign(x) * span * Math.pow(Math.abs(x), 1.35);
            const km = planeToEclipticKm(seg.a * (Math.cosh(Hh) - seg.e),
              -seg.a * Math.sqrt(seg.e * seg.e - 1) * Math.sinh(Hh), o, _olKm);
            _rel[0] = km[0] - anchor[0]; _rel[1] = km[1] - anchor[1]; _rel[2] = km[2] - anchor[2];
            mapPoint(_rel, _p);
            arr[i * 3] = _p[0] - dx; arr[i * 3 + 1] = _p[1] - dy; arr[i * 3 + 2] = _p[2] - dz;
            const b = 0.12 + 0.88 * Math.pow(1 - Math.abs(x), 1.25);
            colArr[i * 3] = b; colArr[i * 3 + 1] = b; colArr[i * 3 + 2] = b;
          }
          gfx.orbitLine.geometry.attributes.position.needsUpdate = true;
          gfx.orbitLine.geometry.attributes.color.needsUpdate = true;
          gfx.orbitLine.material.opacity = selectedName === c.name ? 0.9 : 0.5;
        } else {
        const E0 = solveKepler(normalizeRad(seg.n * (jd - seg.tp) * D2R), seg.e);
        for (let i = 0; i <= 256; i += 1) {
          const x = i / 128 - 1;
          const dE = Math.sign(x) * Math.PI * Math.pow(Math.abs(x), 1.8);
          const E = E0 + dE;
          const km = planeToEclipticKm(seg.a * (Math.cos(E) - seg.e),
            seg.a * Math.sqrt(1 - seg.e * seg.e) * Math.sin(E), o, _olKm);
          _rel[0] = km[0] - anchor[0]; _rel[1] = km[1] - anchor[1]; _rel[2] = km[2] - anchor[2];
          mapPoint(_rel, _p);
          arr[i * 3] = _p[0] - dx; arr[i * 3 + 1] = _p[1] - dy; arr[i * 3 + 2] = _p[2] - dz;
          let behind = (-dE) % TWO_PI;
          if (behind < 0) behind += TWO_PI;
          const b = 0.15 + 0.85 * Math.pow(1 - behind / TWO_PI, 2.2);
          colArr[i * 3] = b; colArr[i * 3 + 1] = b; colArr[i * 3 + 2] = b;
        }
        gfx.orbitLine.geometry.attributes.position.needsUpdate = true;
        gfx.orbitLine.geometry.attributes.color.needsUpdate = true;
        gfx.orbitLine.material.opacity = selectedName === c.name ? 0.85 : 0.4;
        }
      }
      // 标签
      const label = labels[c.name];
      label.position.set(px, py, pz);
      const camDist = camera.position.distanceTo(label.position);
      label.visible = showLabels && star3DBlend <= 0.55 && !(anchorName === c.name && camDist < sceneRadius[c.name] * 14);
      label.material.opacity = hoverName === c.name ? 1.0 : 0.8;
    }
  }

  /* 星空增强: 以内嵌 NASA 星图为底, 亮度自掩膜让星云只生长在银河带上,
   * 再按真实星等/色温分布补远景恒星, 加少量哈勃式衍射十字亮星 */
  function enhanceSky(img) {
    const W = Math.min(img.width || 2048, 4096), H = Math.round(W / 2);
    const K = W / 2048;   // 分辨率缩放因子(叠加元素按此缩放, 保持锐度)
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = W !== img.width;
    ctx.drawImage(img, 0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    const m = document.createElement("canvas");
    m.width = 256; m.height = 128;
    const mx = m.getContext("2d");
    mx.filter = "blur(6px)";
    mx.drawImage(img, 0, 0, 256, 128);
    mx.filter = "none";
    const md = mx.getImageData(0, 0, 256, 128).data;
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 1500; i += 1) {   // 银河星云带(暖 H-α + 冷反射云): 只贴银河核心, 保持底图星点锐度
      const px = Math.random() * 256 | 0, py = Math.random() * 128 | 0;
      const lum = md[(py * 256 + px) * 4] / 255;
      if (lum < 0.17) continue;
      const X = px / 256 * W + (Math.random() - 0.5) * 12 * K, Y = py / 128 * H + (Math.random() - 0.5) * 12 * K;
      const r = (10 + Math.random() * 30) * K;
      const warm = Math.random() < 0.6;
      const a = Math.min(0.045, (0.008 + 0.035 * lum) * (0.5 + Math.random()));
      const g = ctx.createRadialGradient(X, Y, 0, X, Y, r);
      g.addColorStop(0, warm ? `rgba(212,148,120,${a.toFixed(3)})` : `rgba(120,150,220,${a.toFixed(3)})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(X - r, Y - r, r * 2, r * 2);
    }
    const nStars = Math.round(2400 * K);   // 真实亮星由星表点渲染接管, 此处只补暗背景
    for (let i = 0; i < nStars; i += 1) {   // 远景恒星: 暗星多亮星少, 黑体色温, 保持点状锐利
      const X = Math.random() * W, Y = Math.random() * H;
      const mag = Math.pow(Math.random(), 3.2);
      const T = Math.random();
      const col = T < 0.15 ? [170, 190, 255] : T < 0.4 ? [255, 244, 232] : T < 0.75 ? [255, 226, 190] : [255, 196, 158];
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${(0.3 + mag * 0.68).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(X, Y, (0.25 + mag * 1.3) * K, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }
  /* ---------- 真实亮星层: 依巴谷星表 GPU 点渲染(矢量星空, 任意缩放不糊) ---------- */
  const STAR_VERT = `
    uniform float uYr;    // 距 J2000 年数(深时: 恒星按真实空间速度移动)
    uniform float u3D;    // 0=天球壳  1=真实三维星图(对数压缩距离)
    uniform float uDim;   // 深空模式: 星点整体调暗
    attribute vec3 aPos0; // J2000 空间位置(pc, 黄道系)
    attribute vec3 aVel;  // 切向空间速度(pc/yr)
    attribute float aSize;
    attribute vec3 aColor;
    varying vec3 vC;
    varying float vA;
    void main() {
      vec3 p = aPos0 + aVel * uYr;
      float d = max(length(p), 0.6);
      vec3 dir = p / d;
      float r3 = 4.5e7 + 5.5e7 * (log(d / 1.3) / 7.339);   // 1.3pc→3.5e6, 2000pc→4.2e7
      float rr = mix(1.5e7, max(r3, 1.0e7), u3D);
      vec4 wp = modelMatrix * vec4(dir * rr, 1.0);
      gl_Position = projectionMatrix * viewMatrix * wp;
      float d0 = max(length(aPos0), 0.6);
      float att = pow(d0 / d, 0.75);                         // 深时: 恒星靠近变亮/远离变暗
      float vd = length((viewMatrix * wp).xyz);
      float near = mix(1.0, clamp(2.6e7 / vd, 0.55, 5.0), u3D);   // 星际: 飞近的星变大
      gl_PointSize = aSize * clamp(att, 0.25, 3.2) * near;
      vC = aColor;
      vA = clamp(att, 0.35, 1.25) * uDim;
    }`;
  const STAR_FRAG = `
    varying vec3 vC;
    varying float vA;
    void main() {
      vec2 c = gl_PointCoord - 0.5;
      float r2 = dot(c, c);
      if (r2 > 0.25) discard;
      float a = smoothstep(0.25, 0.02, r2) * vA;
      gl_FragColor = vec4(vC, a);
    }`;
  function bvColor(bv, out) {
    const t = clamp((bv + 0.3) / 2.3, 0, 1);   // B-V → 近似黑体色
    if (t < 0.35) { const k = t / 0.35; out.setRGB(0.62 + 0.38 * k, 0.72 + 0.26 * k, 1.0); }
    else if (t < 0.55) { const k = (t - 0.35) / 0.2; out.setRGB(1.0, 0.98 - 0.06 * k, 1.0 - 0.16 * k); }
    else { const k = (t - 0.55) / 0.45; out.setRGB(1.0, 0.92 - 0.35 * k, 0.84 - 0.5 * k); }
  }
  function makeSpikeTexture() {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const cx = cv.getContext("2d");
    const g = cx.createRadialGradient(64, 64, 0, 64, 64, 10);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    cx.fillStyle = g;
    cx.fillRect(0, 0, 128, 128);
    cx.strokeStyle = "rgba(235,242,255,0.75)";
    cx.lineWidth = 1.6;
    cx.beginPath();
    cx.moveTo(4, 64); cx.lineTo(124, 64);
    cx.moveTo(64, 4); cx.lineTo(64, 124);
    cx.stroke();
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  let catalogStarMat = null;
  const catalogSpikes = [];
  const MAS2RAD = 4.84813681e-9;
  function starDistPc(plx) { return plx > 0.5 ? 1000 / plx : 2000; }
  function buildCatalogStars() {
    let D = window.STAR_CATALOG;
    if (!D) return;
    const S = (window.STAR_CATALOG_V || 1) >= 2 ? 7 : 4;
    /* 并入著名暗近星(比邻星/巴纳德星…), 与亮星表按坐标去重 */
    if (S === 7 && window.STAR_EXTRA) {
      const add = [];
      for (const e of window.STAR_EXTRA) {
        let dup = false;
        for (let i = 0; i < D.length; i += 7) {
          if (Math.abs(D[i] - e[0]) < 0.01 && Math.abs(D[i + 1] - e[1]) < 0.01) { dup = true; break; }
        }
        if (!dup) add.push(e[0], e[1], e[2], e[3], e[4], e[5], e[6]);
      }
      if (add.length) D = D.concat(add);
    }
    const n = Math.floor(D.length / S);
    const pos = new Float32Array(n * 3);
    const pos0 = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const siz = new Float32Array(n);
    const R = 1.5e7;
    const ce = Math.cos(EPS0), se = Math.sin(EPS0);
    const c = new THREE.Color();
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    const brightest = [];
    for (let i = 0; i < n; i += 1) {
      const ra = D[i * S] * D2R, dec = D[i * S + 1] * D2R, mag = D[i * S + 2], bv = D[i * S + 3];
      const pmra = S === 7 ? D[i * S + 4] : 0, pmde = S === 7 ? D[i * S + 5] : 0;
      const dPc = starDistPc(S === 7 ? D[i * S + 6] : 0);
      const cd = Math.cos(dec), sd = Math.sin(dec), cr = Math.cos(ra), sr = Math.sin(ra);
      const xq = cd * cr, yq = cd * sr, zq = sd;
      // 赤道→黄道(场景系)
      const dx = xq, dy = yq * ce + zq * se, dz = -yq * se + zq * ce;
      pos[i * 3] = dx * R; pos[i * 3 + 1] = dy * R; pos[i * 3 + 2] = dz * R;
      pos0[i * 3] = dx * dPc; pos0[i * 3 + 1] = dy * dPc; pos0[i * 3 + 2] = dz * dPc;
      // 切向速度: pmRA*(含cosδ)/pmDE → 单位矢量基 → 黄道系, pc/yr
      const vra = pmra * MAS2RAD * dPc, vde = pmde * MAS2RAD * dPc;
      const vxq = -sr * vra - sd * cr * vde;
      const vyq = cr * vra - sd * sr * vde;
      const vzq = cd * vde;
      vel[i * 3] = vxq;
      vel[i * 3 + 1] = vyq * ce + vzq * se;
      vel[i * 3 + 2] = -vyq * se + vzq * ce;
      bvColor(bv, c);
      const bright = clamp(1.35 - mag * 0.17, 0.3, 1.5);
      col[i * 3] = c.r * bright; col[i * 3 + 1] = c.g * bright; col[i * 3 + 2] = c.b * bright;
      siz[i] = clamp(6.4 - mag * 0.95, mag > 6 ? 1.5 : 1.1, 9.5) * pr;   // 补录暗近星给微光, 靠标签指认
      if (mag < 1.3) brightest.push(i);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aPos0", new THREE.BufferAttribute(pos0, 3));
    geo.setAttribute("aVel", new THREE.BufferAttribute(vel, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));
    catalogStarMat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
      uniforms: { uYr: { value: 0 }, u3D: { value: 0 }, uDim: { value: 1 } },
      transparent: true, depthWrite: false, depthTest: true   // 行星必须遮住星星(否则"行星透明")
    });
    const pts = new THREE.Points(geo, catalogStarMat);
    pts.renderOrder = -9;
    pts.frustumCulled = false;
    scene.add(pts);
    // 最亮十余颗(天狼/老人/织女…): 哈勃式衍射十字, 深时/星际下 CPU 跟随
    const spikeTex = makeSpikeTexture();
    for (const i of brightest) {
      const mag = D[i * S + 2];
      const sc = clamp(0.05 * (1.5 - mag * 0.35), 0.028, 0.1);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: spikeTex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, depthTest: true, sizeAttenuation: false, opacity: 0.8
      }));
      sp.scale.set(sc, sc, 1);
      sp.frustumCulled = false;
      sp.position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      sp.renderOrder = -8;
      scene.add(sp);
      catalogSpikes.push({
        p0: [pos0[i * 3], pos0[i * 3 + 1], pos0[i * 3 + 2]],
        v: [vel[i * 3], vel[i * 3 + 1], vel[i * 3 + 2]], spr: sp, sc
      });
    }
    /* 径向速度并入(XHIP): 深时下恒星真实逼近/远离 —— 巴纳德星公元 ~11800 年成为最近邻居 */
    const rvByIdx = new Map();
    if (window.STAR_RV) {
      const KMS2PCYR = 1.02269e-6;
      for (const [ra0, de0, rv] of window.STAR_RV) {
        let best = -1, bd = 1e9;
        for (let i2 = 0; i2 < n; i2 += 1) {
          const dd2 = Math.abs(D[i2 * S] - ra0) + Math.abs(D[i2 * S + 1] - de0);
          if (dd2 < bd) { bd = dd2; best = i2; }
        }
        if (best < 0 || bd > 0.05) continue;
        rvByIdx.set(best, rv);
        const L2 = Math.hypot(pos0[best * 3], pos0[best * 3 + 1], pos0[best * 3 + 2]) || 1;
        const vr = rv * KMS2PCYR;
        vel[best * 3] += pos0[best * 3] / L2 * vr;
        vel[best * 3 + 1] += pos0[best * 3 + 1] / L2 * vr;
        vel[best * 3 + 2] += pos0[best * 3 + 2] / L2 * vr;
      }
    }
    buildNamedStars(pos0, vel, D, S, n, rvByIdx);
    buildStarBody();
    buildConstellations(pos0, vel, D, S, n);
    buildLyRings();
  }
  /* ---------------- 星座连线(深时随自行变形) + 奥尔特云 ---------------- */
  let constLines = null, constVerts = [], oortPts = null, oortLabel = null;
  function buildConstellations(pos0, vel, D, S, n) {
    if (!window.CONSTELLATIONS) return;
    const vts = [], cols = [];
    const cF = new THREE.Color(0x5c7cae), cA = new THREE.Color(0xb89a5c);
    const find = (ra, de) => {
      let best = -1, bd = 1e9;
      for (let i = 0; i < n; i += 1) {
        const d = Math.abs(D[i * S] - ra) + Math.abs(D[i * S + 1] - de);
        if (d < bd) { bd = d; best = i; }
      }
      return bd < 0.05 ? best : -1;
    };
    for (const cst of window.CONSTELLATIONS) {
      const col = cst.type === "asterism" ? cA : cF;
      for (const sg of cst.seg) {
        const a = find(sg[0], sg[1]), b = find(sg[2], sg[3]);
        if (a < 0 || b < 0) continue;
        for (const i of [a, b]) {
          constVerts.push({ p0: [pos0[i * 3], pos0[i * 3 + 1], pos0[i * 3 + 2]], v: [vel[i * 3], vel[i * 3 + 1], vel[i * 3 + 2]] });
          cols.push(col.r, col.g, col.b);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(constVerts.length * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(cols), 3));
    constLines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.34, depthWrite: false
    }));
    constLines.frustumCulled = false;
    constLines.renderOrder = -8;
    scene.add(constLines);
    // 奥尔特云示意壳层(0.09~0.46 pc ≈ 0.3~1.5 光年)
    const N_O = 2600;
    const op = new Float32Array(N_O * 3);
    const rnd = Math.random;
    for (let i = 0; i < N_O; i += 1) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
      const sq = Math.sqrt(1 - u * u);
      const dPc = 0.09 + 0.37 * Math.pow(rnd(), 0.6);
      const r = 4.5e7 + 5.5e7 * (Math.log(dPc / 1.3) / 7.339);
      op[i * 3] = sq * Math.cos(th) * r;
      op[i * 3 + 1] = sq * Math.sin(th) * r;
      op[i * 3 + 2] = u * r;
    }
    const og = new THREE.BufferGeometry();
    og.setAttribute("position", new THREE.BufferAttribute(op, 3));
    oortPts = new THREE.Points(og, new THREE.PointsMaterial({
      color: 0x7a8fb5, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false
    }));
    oortPts.frustumCulled = false;
    oortPts.renderOrder = -8;
    oortPts.visible = false;
    scene.add(oortPts);
    oortLabel = makeStarNameSprite("奥尔特云 · 彗星的故乡(示意)");
    oortLabel.position.set(0.7071 * 3.28e7, 0.7071 * 3.28e7, 0);
    oortLabel.visible = false;
    scene.add(oortLabel);
  }
  function updateConstellations(yr, blend, tDim) {
    if (!constLines) return;
    const on = document.getElementById("tglConst").checked && tDim > 0.05;
    constLines.visible = on;
    if (oortPts) {
      const oo = clamp((blend - 0.35) / 0.4, 0, 1) * 0.3 * Math.min(tDim * 2, 1);
      oortPts.visible = oo > 0.02;
      oortPts.material.opacity = oo;
      oortLabel.visible = oo > 0.1;
      oortLabel.material.opacity = oo * 1.8;
    }
    if (!on) return;
    constLines.material.opacity = 0.34 * Math.min(tDim * 1.6, 1);
    const arr = constLines.geometry.attributes.position.array;
    for (let i = 0; i < constVerts.length; i += 1) {
      const k = constVerts[i];
      const x = k.p0[0] + k.v[0] * yr, y = k.p0[1] + k.v[1] * yr, z = k.p0[2] + k.v[2] * yr;
      const d = Math.max(Math.hypot(x, y, z), 0.6);
      const r3 = 4.5e7 + 5.5e7 * (Math.log(d / 1.3) / 7.339);
      const rr = lerp(1.5e7, Math.max(r3, 1.0e7), blend);
      arr[i * 3] = x / d * rr; arr[i * 3 + 1] = y / d * rr; arr[i * 3 + 2] = z / d * rr;
    }
    constLines.geometry.attributes.position.needsUpdate = true;
  }

  /* ---------------- 日球层顶: 太阳系与星际之间的门(~120 AU) ---------------- */
  let helioLine = null, helioLabel = null;
  function buildHeliopause() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(129 * 3), 3));
    helioLine = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: 0x7aa8d8, transparent: true, opacity: 0.22, depthWrite: false
    }));
    helioLine.frustumCulled = false;
    scene.add(helioLine);
    helioLabel = makeStarNameSprite("日球层顶 · 120 AU —— 旅行者1号 2012 年在此进入星际空间");
    helioLabel.material.opacity = 0.6;
    scene.add(helioLabel);
  }
  const _hpKm = [0, 0, 0];
  function updateHeliopause(anchor, dx, dy, dz) {
    if (!helioLine) return;
    const showIt = star3DBlend < 0.65;
    helioLine.visible = showIt;
    helioLabel.visible = showIt && document.getElementById("tglLabels").checked;
    if (!showIt) return;
    const R120 = 120 * AU_KM;
    const arr = helioLine.geometry.attributes.position.array;
    for (let i = 0; i <= 128; i += 1) {
      const a = i / 128 * Math.PI * 2;
      _hpKm[0] = Math.cos(a) * R120 - anchor[0];
      _hpKm[1] = Math.sin(a) * R120 - anchor[1];
      _hpKm[2] = -anchor[2];
      mapPoint(_hpKm, _p);
      arr[i * 3] = _p[0] - dx; arr[i * 3 + 1] = _p[1] - dy; arr[i * 3 + 2] = _p[2] - dz;
      if (i === 16) helioLabel.position.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);
    }
    helioLine.geometry.attributes.position.needsUpdate = true;
  }

  /* ================= 阶段22 · 恒星实体 + 系外行星系统 =================
   * 物理推算: B-V→有效温度(Ballesteros), 视星等+视差→光度, 斯特藩-玻尔兹曼→半径。
   * 飞临命名恒星时点光过渡为真实比例感的恒星本体(米粒组织/临边昏暗/日冕),
   * 有已知系外行星的挂真实轨道(周期取文献, 与开普勒三定律自洽 <8%)+ 宜居带绿环。 */
  function starPhys(k) {
    const d = starDistPc(k.plx);
    const M = k.mag - 5 * (Math.log10(Math.max(d, 0.1)) - 1);
    const L = Math.pow(10, (4.83 - M) / 2.5);
    const T = 4600 * (1 / (0.92 * k.bv + 1.7) + 1 / (0.92 * k.bv + 0.62));
    const R = Math.sqrt(L) * Math.pow(5772 / Math.max(T, 1200), 2);
    return { L, T, R };
  }
  const STAR_COMPANIONS = {
    "南门二": { dm: 1.33, bv: 0.88, sep: 3.0, periodYr: 79.9 },
    "天狼星": { dm: 8.44, bv: 0.0, sep: 4.2, periodYr: 50.1, wd: true }
  };
  const SBODY_VERT = `
    varying vec3 vN;
    varying vec3 vP;
    void main() {
      vN = normal;
      vP = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
  const SBODY_FRAG = `
    uniform vec3 uCol;
    uniform float uTime;
    varying vec3 vN;
    varying vec3 vP;
    float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    float vn3(vec3 p) {
      vec3 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y);
      float b = mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y);
      return mix(a, b, f.z);
    }
    void main() {
      vec3 n = normalize(vN);
      float limb = pow(max(n.z, 0.0), 0.55);                 // 临边昏暗
      float g = vn3(vP * 9.0 + uTime * 0.07) * 0.55 + vn3(vP * 27.0 - uTime * 0.05) * 0.45;
      vec3 col = uCol * (0.62 + 0.5 * g) * (0.35 + 0.75 * limb);
      col += uCol * pow(max(n.z, 0.0), 5.0) * 0.35;          // 盘心增亮
      gl_FragColor = vec4(col, 1.0);
    }`;
  let starBody = null;
  const exoCache = {};
  function makeCoronaTex2() {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const cx = cv.getContext("2d");
    const g = cx.createRadialGradient(64, 64, 18, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(0.4, "rgba(255,255,255,0.16)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    cx.fillStyle = g;
    cx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  function buildStarBody() {
    const geo = new THREE.SphereGeometry(1, 48, 32);
    const mkMat = () => new THREE.ShaderMaterial({
      vertexShader: SBODY_VERT, fragmentShader: SBODY_FRAG,
      uniforms: { uCol: { value: new THREE.Color(1, 1, 1) }, uTime: { value: 0 } }
    });
    const mesh = new THREE.Mesh(geo, mkMat());
    const comp = new THREE.Mesh(geo, mkMat());
    const corona = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeCoronaTex2(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    const exoGroup = new THREE.Group();
    for (const o2 of [mesh, comp, corona, exoGroup]) {
      o2.visible = false;
      o2.frustumCulled = false;
      scene.add(o2);
    }
    starBody = { mesh, comp, corona, exoGroup, cur: null, exoCur: null, labels: [] };
  }
  /* 系外行星系统: 轨道圈 + 行星点 + 宜居带环(展示尺度: 恒星尺寸锚定的对数映射) */
  function exoDispR(aAu, S2) { return S2 * (2.3 + 1.75 * Math.log(1 + aAu / 0.03)); }
  function ensureExoSystem(cn, S2, L) {
    const key = `${cn}|${S2.toFixed(0)}`;
    if (exoCache[key]) return exoCache[key];
    const sys = window.EXOPLANETS && window.EXOPLANETS[cn];
    if (!sys) return null;
    const g = new THREE.Group();
    // 宜居带
    const hzIn = exoDispR(0.95 * Math.sqrt(L), S2), hzOut = exoDispR(1.37 * Math.sqrt(L), S2);
    const hz = new THREE.Mesh(new THREE.RingGeometry(hzIn, hzOut, 96),
      new THREE.MeshBasicMaterial({ color: 0x4fae7d, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false }));
    g.add(hz);
    const planets = [];
    for (const p of sys.planets) {
      const r = exoDispR(p.a_au, S2);
      const pts = [];
      for (let i = 0; i <= 96; i += 1) {
        const a = i / 96 * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
      }
      const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x8fb4e8, transparent: true, opacity: 0.3, depthWrite: false }));
      g.add(ring);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(Math.max(S2 * 0.055, 1), 12, 8),
        new THREE.MeshBasicMaterial({ color: p.hz ? 0x7de0a8 : 0xcfe0ff }));
      g.add(dot);
      const lab = makeStarNameSprite(`${cn}${p.name} · ${p.p_d < 100 ? p.p_d.toFixed(1) + " 天" : (p.p_d / 365.25).toFixed(1) + " 年"}${p.hz ? " · 宜居带" : ""}`);
      lab.material.opacity = 0.85;
      scene.add(lab);
      planets.push({ dot, lab, r, p });
    }
    g.visible = false;
    g.frustumCulled = false;
    scene.add(g);
    const rec = { g, planets, hz };
    exoCache[key] = rec;
    return rec;
  }
  const _sbCol = new THREE.Color();
  function starTempColor(T, out) {
    // 简化色温映射(3000K 红 → 6000K 白黄 → 10000K+ 蓝白)
    const t = clamp((T - 3000) / 9000, 0, 1);
    if (t < 0.35) out.setRGB(1.0, 0.55 + t * 1.1, 0.30 + t * 1.3);
    else if (t < 0.6) out.setRGB(1.0, 0.94, 0.78 + (t - 0.35) * 0.8);
    else out.setRGB(0.82 - (t - 0.6) * 0.2, 0.88, 1.0);
    return out;
  }
  function updateStarBody(dt) {
    if (!starBody) return;
    const sb = starBody;
    let show = null, showPos = null, showDist = 1e18;
    if (star3DBlend > 0.9 && namedStars.length) {
      const yr = yearsFromJ2000();
      for (const k of namedStars) {
        const x = k.p0[0] + k.v[0] * yr, y = k.p0[1] + k.v[1] * yr, z = k.p0[2] + k.v[2] * yr;
        const d = Math.max(Math.hypot(x, y, z), 0.6);
        const r3 = 4.5e7 + 5.5e7 * (Math.log(d / 1.3) / 7.339);
        const px2 = x / d * r3, py2 = y / d * r3, pz2 = z / d * r3;
        const cd = Math.hypot(camera.position.x - px2, camera.position.y - py2, camera.position.z - pz2);
        if (cd < showDist) { showDist = cd; show = k; showPos = [px2, py2, pz2]; }
      }
    }
    let vis = false;
    if (show) {
      const ph = starPhys(show);
      const S2 = 4e5 * (0.5 + 0.5 * Math.log10(1 + ph.R));
      if (showDist < S2 * 46) {
        vis = true;
        if (sb.cur !== show.cn) {
          sb.cur = show.cn;
          starTempColor(ph.T, sb.mesh.material.uniforms.uCol.value);
          sb.mesh.scale.setScalar(S2);
          sb.corona.scale.set(S2 * 5.2, S2 * 5.2, 1);
          sb.corona.material.color.copy(sb.mesh.material.uniforms.uCol.value);
          // 伴星
          const cp = STAR_COMPANIONS[show.cn];
          if (cp) {
            const phC = starPhys({ mag: show.mag + cp.dm, bv: cp.bv, plx: show.plx });
            const SC = cp.wd ? S2 * 0.09 : 4e5 * (0.5 + 0.5 * Math.log10(1 + phC.R));
            starTempColor(cp.wd ? 12000 : phC.T, sb.comp.material.uniforms.uCol.value);
            sb.comp.scale.setScalar(Math.max(SC, S2 * 0.05));
            sb._cp = cp;
            sb._cpS = Math.max(SC, S2 * 0.05);
          } else {
            sb._cp = null;
          }
          // 系外行星
          if (sb.exoCur && exoCache[sb.exoCur]) {
            exoCache[sb.exoCur].g.visible = false;
            for (const pl of exoCache[sb.exoCur].planets) pl.lab.visible = false;
          }
          const rec = ensureExoSystem(show.cn, S2, ph.L);
          sb.exoCur = rec ? `${show.cn}|${S2.toFixed(0)}` : null;
        }
        sb.mesh.position.set(showPos[0], showPos[1], showPos[2]);
        sb.mesh.material.uniforms.uTime.value += dt;
        sb.corona.position.copy(sb.mesh.position);
        if (sb._cp) {
          const ang = Math.PI * 2 * (yearsFromJ2000() / sb._cp.periodYr);
          const sep = sb.mesh.scale.x * sb._cp.sep;
          sb.comp.position.set(showPos[0] + Math.cos(ang) * sep, showPos[1] + Math.sin(ang) * sep, showPos[2]);
          sb.comp.material.uniforms.uTime.value += dt;
        }
        if (sb.exoCur && exoCache[sb.exoCur]) {
          const rec = exoCache[sb.exoCur];
          rec.g.position.copy(sb.mesh.position);
          rec.g.visible = true;
          for (let i = 0; i < rec.planets.length; i += 1) {
            const pl = rec.planets[i];
            const ang = Math.PI * 2 * ((jd - J2000) / pl.p.p_d) + i * 1.7;
            pl.dot.position.set(rec.g.position.x + Math.cos(ang) * pl.r, rec.g.position.y + Math.sin(ang) * pl.r, rec.g.position.z);
            pl.lab.position.copy(pl.dot.position);
            pl.lab.visible = true;
          }
        }
      }
    }
    sb.mesh.visible = vis;
    sb.corona.visible = vis;
    sb.comp.visible = vis && !!sb._cp;
    if (!vis && sb.exoCur && exoCache[sb.exoCur]) {
      exoCache[sb.exoCur].g.visible = false;
      for (const pl of exoCache[sb.exoCur].planets) pl.lab.visible = false;
      sb.cur = null;
      sb.exoCur = null;
    }
  }

  /* ---------------- 恒星身份: 中文名标签(限流防花眼) + 光年距离环 ---------------- */
  const namedStars = [];
  let lyRingGroup = null;
  function makeStarNameSprite(text) {
    const el = document.createElement("div");
    el.className = "bLabel";
    el.textContent = text;
    el.style.color = "#d5e2f8";
    el.style.fontSize = "11.5px";
    el.style.fontWeight = "500";
    el.style.display = "none";
    const layer = document.getElementById("labelLayer");
    if (layer) layer.appendChild(el);
    const shim = new THREE.Object3D();
    shim.material = { opacity: 0 };
    shim.visible = false;
    labels2D.push({ shim, el, shown: false, star: true });
    return shim;
  }
  function buildNamedStars(pos0, vel, D, S, n, rvByIdx) {
    if (!window.STAR_NAMES) return;
    for (const [ra0, de0, cn] of window.STAR_NAMES) {
      let best = -1, bd = 1e9;
      for (let i = 0; i < n; i += 1) {
        const d = Math.abs(D[i * S] - ra0) + Math.abs(D[i * S + 1] - de0);
        if (d < bd) { bd = d; best = i; }
      }
      if (best < 0 || bd > 0.05) continue;
      const spr = makeStarNameSprite(cn);
      scene.add(spr);
      namedStars.push({
        p0: [pos0[best * 3], pos0[best * 3 + 1], pos0[best * 3 + 2]],
        v: [vel[best * 3], vel[best * 3 + 1], vel[best * 3 + 2]],
        mag: D[best * S + 2], bv: D[best * S + 3], plx: S === 7 ? D[best * S + 6] : 0,
        rv: (rvByIdx && rvByIdx.get(best)) || 0, cn, spr
      });
    }
    namedStars.sort((a, b) => a.mag - b.mag);
  }
  /* 标签可见性: 仅星际/深时模式; 深时限流最亮 18 颗; 随黑寂挡位隐去 */
  function updateNamedStars(dt, skyDimTarget) {
    const yr = yearsFromJ2000();
    const modeOn = star3DBlend > 0.25 || deepTime;
    let shown = 0;
    for (const k of namedStars) {
      const cap = star3DBlend > 0.25 ? 60 : 18;
      const want = modeOn && shown < cap && skyModeN < 2;
      if (want) shown += 1;
      const target = want ? 0.85 * (skyModeN === 1 ? 0.6 : 1) : 0;
      const m = k.spr.material;
      m.opacity += (target - m.opacity) * Math.min(1, dt * 3);
      k.spr.visible = m.opacity > 0.02;
      if (!k.spr.visible) continue;
      const px = k.p0[0] + k.v[0] * yr, py = k.p0[1] + k.v[1] * yr, pz = k.p0[2] + k.v[2] * yr;
      const d = Math.max(Math.hypot(px, py, pz), 0.6);
      const r3 = 4.5e7 + 5.5e7 * (Math.log(d / 1.3) / 7.339);
      const rr = lerp(1.5e7, Math.max(r3, 1.0e7), star3DBlend);
      k.spr.position.set(px / d * rr, py / d * rr, pz / d * rr);
    }
  }
  function buildLyRings() {
    lyRingGroup = new THREE.Group();
    const LY2PC = 1 / 3.26156;
    for (const ly of [5, 10, 25, 50]) {
      const dPc = ly * LY2PC;
      const r = 4.5e7 + 5.5e7 * (Math.log(dPc / 1.3) / 7.339);
      const pts = [];
      for (let i = 0; i <= 128; i += 1) {
        const a = i / 128 * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x5578aa, transparent: true, opacity: 0.35, depthWrite: false })
      );
      line.userData.op = 0.35;
      lyRingGroup.add(line);
      const lab = makeStarNameSprite(`${ly} 光年`);
      lab.material.opacity = 0.55;
      lab.visible = true;
      lab.userData.op = 0.55;
      lab.position.set(r * 0.7071, r * 0.7071, 0);
      lyRingGroup.add(lab);
    }
    lyRingGroup.visible = false;
    lyRingGroup.renderOrder = -7;
    scene.add(lyRingGroup);
  }
  /* 深时/星际下每帧同步星点 uniforms 与衍射星位置 */
  function updateCatalogStars(yr, blend3d) {
    if (!catalogStarMat) return;
    catalogStarMat.uniforms.uYr.value = yr;
    catalogStarMat.uniforms.u3D.value = blend3d;
    for (const k of catalogSpikes) {
      const px = k.p0[0] + k.v[0] * yr, py = k.p0[1] + k.v[1] * yr, pz = k.p0[2] + k.v[2] * yr;
      const d = Math.max(Math.hypot(px, py, pz), 0.6);
      const r3 = 4.5e7 + 5.5e7 * (Math.log(d / 1.3) / 7.339);
      const rr = lerp(1.5e7, Math.max(r3, 1.0e7), blend3d);
      k.spr.position.set(px / d * rr, py / d * rr, pz / d * rr);
      const att = clamp(Math.pow(Math.max(Math.hypot(k.p0[0], k.p0[1], k.p0[2]), 0.6) / d, 0.75), 0.3, 2.2);
      k.spr.scale.set(k.sc * att, k.sc * att, 1);
    }
  }

  function buildSky() {
    const skyTex = TEX.sky && TEX.sky.image ? enhanceSky(TEX.sky.image) : TEX.sky;
    skyMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.6e7, 48, 24),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, depthWrite: false })
    );
    skyMesh.material.color.setScalar(0.62);          // 星空亮度
    skyMesh.rotation.x = Math.PI / 2 + 23.44 * D2R;  // 赤道坐标贴图对齐黄道场景
    skyMesh.frustumCulled = false;
    skyMesh.renderOrder = -10;
    scene.add(skyMesh);
  }

  /* ---------------- 每帧更新 ---------------- */
  const _p = [0, 0, 0];
  const _rel = [0, 0, 0];

  function satAngle(sat) {
    return (Math.PI * 2) * ((jd - J2000) / sat.period_d) + sat.phase0;
  }
  /* 卫星轨道平面内的方向(含椭圆: 真近点角+径向因子), 输出到 out(Vector3), 返回径向因子 r/a */
  const _v3a = new THREE.Vector3();
  const _v3b = new THREE.Vector3();
  function satLocalDir(sat, out) {
    const M = normalizeRad(satAngle(sat));
    const e = sat.e || 0;
    let rf = 1, th = M;
    if (e > 0) {
      const E = solveKepler(M, e);
      rf = 1 - e * Math.cos(E);
      th = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(E), Math.cos(E) - e);
    }
    sat._th = th;
    out.set(Math.cos(th), Math.sin(th), 0).applyQuaternion(sat.quat);
    return rf;
  }
  /* 卫星显示空间偏移(BU): 月球用 Meeus 实矢量, 其余用椭圆解; 双尺度连续混合 */
  function satDisplayVec(sat, out) {
    const pr = sceneRadius[sat.parent] || mapRadius(bodyByName[sat.parent].radius_km, "planet");
    if (sat.name === "Moon") {
      const r = Math.hypot(_mg[0], _mg[1], _mg[2]);
      const k = lerp(r / SCALE.sceneUnitKm, pr * sat.cinFactor * (r / 385000), scaleBlend) / r;
      out.set(_mg[0] * k, _mg[1] * k, _mg[2] * k);
      sat._th = Math.atan2(_mg[1], _mg[0]);
      return out;
    }
    const rf = satLocalDir(sat, out);
    out.multiplyScalar(lerp(sat.a_km * rf / SCALE.sceneUnitKm, pr * sat.cinFactor * rf, scaleBlend));
    return out;
  }
  function mapRadiusSat(radiusKm) {
    const cin = Math.max(Math.pow(radiusKm, 0.4) * SCALE.cinRadScale * 0.85, 0.12);   // 下限放宽以容纳火卫等微型卫星
    return lerp(radiusKm / SCALE.sceneUnitKm, cin, scaleBlend);
  }

  /* ---------------- 木卫影凌: 伽利略卫星影子实时投在木星盘面(km 空间真几何+本影锥收缩) ---------------- */
  let jshU = null, jshCount = 0;
  function jshadowGeom(mx, my, mz, sx, sy, sz, rMoon, RJ, dSun, out) {
    const mdots = mx * sx + my * sy + mz * sz;
    if (mdots <= 0) return false;   // 卫星在背日侧: 无影
    const m2 = mx * mx + my * my + mz * mz;
    const disc = mdots * mdots - m2 + RJ * RJ;
    if (disc <= 0) return false;    // 影锥掠过盘外
    const tHit = mdots - Math.sqrt(disc);
    if (tHit <= 0) return false;
    const px = mx - tHit * sx, py = my - tHit * sy, pz = mz - tHit * sz;   // |p| = RJ
    const rU = Math.max(rMoon - tHit * (696000 - rMoon) / dSun, rMoon * 0.12);   // 本影收缩
    const rP = rMoon + tHit * (696000 + rMoon) / dSun;                            // 半影扩张
    out.dx = px / RJ; out.dy = py / RJ; out.dz = pz / RJ;
    out.ang = Math.asin(Math.min(rU / RJ, 0.85));
    out.soft = Math.max((rP - rU) / RJ, 0.004);
    return true;
  }
  function initJupiterShadows() {
    const jb = bodyByName.Jupiter;
    if (!jb || !jb.spinMesh) return;
    const m = jb.spinMesh.material;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uJshDir = { value: [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1)] };
      sh.uniforms.uJshAng = { value: [0, 0, 0, 0] };
      sh.uniforms.uJshSoft = { value: [0.02, 0.02, 0.02, 0.02] };
      sh.vertexShader = "varying vec3 vJshPos;\n" + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n  vJshPos = position;");
      sh.fragmentShader = ("uniform vec3 uJshDir[4];\nuniform float uJshAng[4];\nuniform float uJshSoft[4];\nvarying vec3 vJshPos;\n" + sh.fragmentShader)
        .replace("#include <map_fragment>", "#include <map_fragment>\n  {\n    vec3 jshN = normalize(vJshPos);\n    for (int j = 0; j < 4; j++) {\n      if (uJshAng[j] > 0.0001) {\n        float jshC = dot(jshN, uJshDir[j]);\n        float jshS = smoothstep(cos(uJshAng[j] + uJshSoft[j]), cos(max(uJshAng[j] - uJshSoft[j], 0.0002)), jshC);\n        diffuseColor.rgb *= 1.0 - 0.85 * jshS;\n      }\n    }\n  }");
      jshU = sh.uniforms;
    };
    m.needsUpdate = true;
  }
  const _jshO = { dx: 0, dy: 0, dz: 0, ang: 0, soft: 0 };
  const _jshQ = new THREE.Quaternion();
  const _jshV = new THREE.Vector3();
  function updateJovianShadows() {
    if (!jshU) return;
    const jp = worldKm.Jupiter;
    const jb = bodyByName.Jupiter;
    if (!jp || !jb.spinMesh) return;
    const dSun = Math.hypot(jp[0], jp[1], jp[2]);
    const sx = -jp[0] / dSun, sy = -jp[1] / dSun, sz = -jp[2] / dSun;
    jb.spinMesh.getWorldQuaternion(_jshQ);
    _jshQ.invert();
    let n = 0;
    for (const nm of ["Io", "Europa", "Ganymede", "Callisto"]) {
      const w = worldKm[nm];
      const sat = satByName[nm];
      if (!w || !sat) continue;
      if (jshadowGeom(w[0] - jp[0], w[1] - jp[1], w[2] - jp[2], sx, sy, sz, sat.radius_km, jb.radius_km, dSun, _jshO)) {
        _jshV.set(_jshO.dx, _jshO.dy, _jshO.dz).applyQuaternion(_jshQ);
        jshU.uJshDir.value[n].copy(_jshV);
        jshU.uJshAng.value[n] = _jshO.ang;
        jshU.uJshSoft.value[n] = _jshO.soft;
        n += 1;
      }
    }
    for (let k2 = n; k2 < 4; k2 += 1) jshU.uJshAng.value[k2] = 0;
    jshCount = n;
    if (n >= 2 && selectedName === "Jupiter") award("shadowplay");
  }

  function updateSystem() {
    for (const body of bodies) {
      if (!worldKm[body.name]) worldKm[body.name] = [0, 0, 0];
      if (body.orbit_j2000) heliocentricKm(body.orbit_j2000, jd, worldKm[body.name]);
      else { const w0 = worldKm[body.name]; w0[0] = 0; w0[1] = 0; w0[2] = 0; }
    }
    for (const c of COMETS) {
      if (!worldKm[c.name]) worldKm[c.name] = [0, 0, 0];
      cometKm(c, jd, worldKm[c.name]);
    }
    // 地月质心: 行星表给出的是 EM 质心, 地球按质量比反向偏移(月球矢量来自 Meeus 历表)
    moonGeoKm(jd, _mg);
    const eW = worldKm.Earth;
    eW[0] -= _mg[0] * MU_MOON; eW[1] -= _mg[1] * MU_MOON; eW[2] -= _mg[2] * MU_MOON;
    baryOff.Earth[0] = -_mg[0] * MU_MOON; baryOff.Earth[1] = -_mg[1] * MU_MOON; baryOff.Earth[2] = -_mg[2] * MU_MOON;
    // 冥卫质心: 冥王星根数视作系统质心, 本体按质量比反向偏移(与卡戎构成双矮行星)
    const chSat = satByName.Charon;
    const rfC = satLocalDir(chSat, _v3a);
    const pW = worldKm.Pluto;
    pW[0] -= _v3a.x * chSat.a_km * rfC * MU_CHARON;
    pW[1] -= _v3a.y * chSat.a_km * rfC * MU_CHARON;
    pW[2] -= _v3a.z * chSat.a_km * rfC * MU_CHARON;
    baryOff.Pluto[0] = -_v3a.x * chSat.a_km * rfC * MU_CHARON;
    baryOff.Pluto[1] = -_v3a.y * chSat.a_km * rfC * MU_CHARON;
    baryOff.Pluto[2] = -_v3a.z * chSat.a_km * rfC * MU_CHARON;
    for (const sat of SATELLITES) {
      const p = worldKm[sat.parent];
      if (!worldKm[sat.name]) worldKm[sat.name] = [0, 0, 0];
      const wS = worldKm[sat.name];
      if (sat.name === "Moon") {
        wS[0] = p[0] + _mg[0]; wS[1] = p[1] + _mg[1]; wS[2] = p[2] + _mg[2];
        continue;
      }
      const rf = satLocalDir(sat, _v3a);
      const L = sat.a_km * rf;
      wS[0] = p[0] + _v3a.x * L; wS[1] = p[1] + _v3a.y * L; wS[2] = p[2] + _v3a.z * L;
    }
    updateJovianShadows();
    // 航天器坐标必须先于锚点提取刷新: 否则聚焦航天器时浮动原点用上一帧位置,
    // 高速时间挡下锚差随帧间波动 → 航天器/标签/轨迹整体抖动(用户实测 60AU 处跳动)
    for (const c of SPACECRAFT) {
      if (!worldKm[c.name]) worldKm[c.name] = [0, 0, 0];
      craftStateKm(c, jd, _cs);
      const wC = worldKm[c.name];
      wC[0] = _cs.r[0]; wC[1] = _cs.r[1]; wC[2] = _cs.r[2];
    }
    // 锚点为卫星时: km 锚取其父行星, 场景内再整体平移卫星的显示偏移(浮动原点)
    const anchorSat = satByName[anchorName];
    const anchor = anchorSat ? worldKm[anchorSat.parent] : (worldKm[anchorName] || [0, 0, 0]);
    let dx = 0, dy = 0, dz = 0;
    if (anchorSat) {
      satDisplayVec(anchorSat, _v3a);
      dx = _v3a.x; dy = _v3a.y; dz = _v3a.z;
    }
    for (const body of bodies) {
      const w = worldKm[body.name];
      _rel[0] = w[0] - anchor[0]; _rel[1] = w[1] - anchor[1]; _rel[2] = w[2] - anchor[2];
      mapPoint(_rel, _p);
      const r = mapRadius(body.radius_km, body.type);
      scenePos[body.name] = [_p[0] - dx, _p[1] - dy, _p[2] - dz];
      sceneRadius[body.name] = r;
      body.group.position.set(_p[0] - dx, _p[1] - dy, _p[2] - dz);
      body.group.scale.setScalar(r);
      let spin = 0;
      if (body.name === "Earth" && body.tiltGroup) {
        const yrNow = yearsFromJ2000();
        const mb = milankovitchBlend(yrNow);
        if (mb > 0) {
          // 深时: 极轴 = 黄经岁差(25772 年) + 黄赤交角摆动(41000 年)构造
          const lam = (Math.PI / 2) - (yrNow / PRECESS_YR) * Math.PI * 2;
          const eps = obliquityDeg(yrNow) * D2R;
          _v3b.set(Math.sin(eps) * Math.cos(lam), Math.sin(eps) * Math.sin(lam), Math.cos(eps));
          body.tiltGroup.quaternion.setFromUnitVectors(_zAxis, _v3b);
        } else {
          earthPrecessionQuat(yrNow, _precQ2);
          body.tiltGroup.quaternion.copy(_precQ2).multiply(body.poleQuat);
        }
      }
      if (body.name === "Earth") {
        // ERA(地球自转角): 真实自转相位, 使昼半球与实际日期时刻对应
        spin = Math.PI * 2 * (0.7790572732640 + 1.00273781191135448 * (jd - J2000));
      } else if (body.rotation_period_h) {
        spin = (jd - J2000) * 24 / Math.abs(body.rotation_period_h) * Math.PI * 2 * (body.spinSign || 1);
      }
      body.spinMesh.rotation.y = spin;
      if (body._ringU && body.tiltGroup) {
        const w = worldKm.Saturn;
        _v3a.set(-w[0], -w[1], -w[2]).normalize();          // 日向(km 系与场景黄道系同轴)
        body.tiltGroup.getWorldQuaternion(_qRing).invert();
        _v3a.applyQuaternion(_qRing);
        body._ringU.uSunT.value.copy(_v3a);
        body._ringU.uSunP.value.set(_v3a.x, _v3a.z, -_v3a.y);
      }
      if (body.name === "Earth" && cloudMesh) cloudMesh.rotation.y = spin + (jd - J2000) * 0.22;   // 云层相对地表缓慢漂移
    }
    for (const sat of SATELLITES) {
      satDisplayVec(sat, _v3a);
      const pp = scenePos[sat.parent];
      const px = pp[0] + _v3a.x, py = pp[1] + _v3a.y, pz = pp[2] + _v3a.z;
      const r = mapRadiusSat(sat.radius_km);
      scenePos[sat.name] = [px, py, pz];
      sceneRadius[sat.name] = r;
      sat.group.position.set(px, py, pz);
      sat.group.scale.setScalar(r);
      sat.spinMesh.rotation.y = sat._th + Math.PI;   // 潮汐锁定: 同一面朝向行星(椭圆下跟随真近点角)
      updateSatOrbitRing(sat, pp);
    }
    // 地球着色器太阳方向
    if (earthMaterial) {
      const e = scenePos.Earth, s = scenePos.Sun;
      const dir = new THREE.Vector3(s[0] - e[0], s[1] - e[1], s[2] - e[2]).normalize();
      earthMaterial.uniforms.sunDir.value.copy(dir);
      atmoMaterial.uniforms.sunDir.value.copy(dir);
    }
    stepProbes();
    updateMeteorFx(performance.now());
    updateComets(anchor, dx, dy, dz);
    updateProbes(anchor, dx, dy, dz);
    updateSpacecraft(anchor, dx, dy, dz);
    updateEclipseFx();
    updateLagrange(anchor, dx, dy, dz);
    updateGalTrails(anchor, dx, dy, dz);
    if (!lineSkip) updateHeliopause(anchor, dx, dy, dz);
    updateLineSkip();
    if (!lineSkip) updateOrbitLines(anchor, dx, dy, dz);
    updateBelt(anchor, dx, dy, dz);
    updateLabels();
  }

  function satNearParent(sat) {
    const pp = scenePos[sat.parent];
    if (!pp) return false;
    if (anchorName === sat.name || anchorName === sat.parent) return true;
    const ddx = camera.position.x - pp[0], ddy = camera.position.y - pp[1], ddz = camera.position.z - pp[2];
    return Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) < (sceneRadius[sat.parent] || 1) * lerp(300, 90, scaleBlend);   // 真实尺度下行星小, 触发半径放宽
  }

  const _moonRing = { jd: -1e9, at: 0, pts: new Float64Array(97 * 3), tmp: [0, 0, 0] };
  function updateSatOrbitRing(sat, center) {
    const arr = sat.orbitLine.geometry.attributes.position.array;
    const pr = sceneRadius[sat.parent] || 1;
    sat.orbitLine.material.opacity = (selectedName === sat.name || selectedName === sat.parent) ? 0.6 : 0.26;
    if (sat.name === "Moon") {
      /* 真实月轨: 恒星月区间 [jd-13.66, jd+13.66] 采样 Meeus 历表(第 48 点恰为当前时刻,
       * 线严格穿过月球本体), 含拱线 8.85 年/交点 18.6 年进动与全部摄动 — 修复"月球不在轨道上" */
      if (Math.abs(jd - _moonRing.jd) > 0.25 && performance.now() - _moonRing.at > 120) {
        const SID = 27.321661;
        for (let i = 0; i <= 96; i += 1) {
          moonGeoKm(jd + (i / 96 - 0.5) * SID, _moonRing.tmp);
          _moonRing.pts[i * 3] = _moonRing.tmp[0];
          _moonRing.pts[i * 3 + 1] = _moonRing.tmp[1];
          _moonRing.pts[i * 3 + 2] = _moonRing.tmp[2];
        }
        _moonRing.jd = jd;
        _moonRing.at = performance.now();
      }
      const k = lerp(1 / SCALE.sceneUnitKm, pr * sat.cinFactor / 385000, scaleBlend);
      for (let i = 0; i <= 96; i += 1) {
        arr[i * 3] = center[0] + _moonRing.pts[i * 3] * k;
        arr[i * 3 + 1] = center[1] + _moonRing.pts[i * 3 + 1] * k;
        arr[i * 3 + 2] = center[2] + _moonRing.pts[i * 3 + 2] * k;
      }
      sat.orbitLine.geometry.attributes.position.needsUpdate = true;
      return;
    }
    const e = sat.e || 0, se = Math.sqrt(1 - e * e);
    const aRef = sat.a_km;
    for (let i = 0; i <= 96; i += 1) {
      const E = Math.PI * 2 * i / 96;
      const rf = 1 - e * Math.cos(E);
      const th = Math.atan2(se * Math.sin(E), Math.cos(E) - e);
      const len = lerp(aRef * rf / SCALE.sceneUnitKm, pr * sat.cinFactor * rf, scaleBlend);
      _v3a.set(Math.cos(th) * len, Math.sin(th) * len, 0).applyQuaternion(sat.quat);
      arr[i * 3] = center[0] + _v3a.x;
      arr[i * 3 + 1] = center[1] + _v3a.y;
      arr[i * 3 + 2] = center[2] + _v3a.z;
    }
    sat.orbitLine.geometry.attributes.position.needsUpdate = true;
  }

  function updateOrbitLines(anchor, dx, dy, dz) {
    const visible = document.getElementById("tglOrbits").checked;
    const TWO_PI = Math.PI * 2;
    for (const body of planetBodies) {
      const line = orbitLines[body.name];
      line.visible = visible;
      if (!visible) continue;
      const o = elementsAtJd(body.orbit_j2000, jd, _elT);
      const E0 = solveKepler(o.M, o.e);
      const arr = line.geometry.attributes.position.array;
      const colArr = line.geometry.attributes.color.array;
      for (let i = 0; i <= 384; i += 1) {
        // 非均匀采样: 以行星当前 E0 为中心加密(x^1.8 扭曲), i=192 恰在行星本体上,
        // 真实尺度贴近看轨道线严格穿过行星中心(修复 384 段折线弓高: 冥王星弦弓高曾达 2.5 万 km)
        const x = i / 192 - 1;
        const dE = Math.sign(x) * Math.PI * Math.pow(Math.abs(x), 1.8);
        const E = E0 + dE;
        const km = planeToEclipticKm(o.a * (Math.cos(E) - o.e), o.a * Math.sqrt(1 - o.e * o.e) * Math.sin(E), o, _olKm);
        const bo = baryOff[body.name];
        if (bo) { km[0] += bo[0]; km[1] += bo[1]; km[2] += bo[2]; }
        _rel[0] = km[0] - anchor[0]; _rel[1] = km[1] - anchor[1]; _rel[2] = km[2] - anchor[2];
        mapPoint(_rel, _p);
        arr[i * 3] = _p[0] - dx; arr[i * 3 + 1] = _p[1] - dy; arr[i * 3 + 2] = _p[2] - dz;
        // 渐变尾迹: 天体刚经过处最亮, 向"过去"方向渐暗
        let behind = (-dE) % TWO_PI;
        if (behind < 0) behind += TWO_PI;
        const b = 0.15 + 0.85 * Math.pow(1 - behind / TWO_PI, 2.2);
        colArr[i * 3] = b; colArr[i * 3 + 1] = b; colArr[i * 3 + 2] = b;
      }
      line.geometry.attributes.position.needsUpdate = true;
      line.geometry.attributes.color.needsUpdate = true;
      line.material.opacity = body.name === selectedName ? 0.95 : 0.5;
    }
  }

  function updateBelt(anchor, dx, dy, dz) {
    const showBelt = document.getElementById("tglBelt").checked;
    const showKuiper = document.getElementById("tglKuiper").checked;
    beltPoints.visible = showBelt && !realBeltPoints;   // 真实带就位后程序化主带退役
    if (realBeltPoints) realBeltPoints.visible = showBelt;
    kuiperPoints.visible = showKuiper;
    if (!showBelt && !showKuiper) return;
    // GPU 驱动: 只更新 uniform(材质共用, 两带一次更新), CPU 零逐点计算
    {   // 历元重基: |rel|>2048 天时把相位折进 M0(双精度), 深时/大年份下丝滑; 200ms 限频防高速挡狂刷显存
      const dtNow = jd - J2000;
      let rel = dtNow - beltEpochDt;
      if (Math.abs(rel) > 2048 && performance.now() - beltRebaseAt > 200) {
        const TWO_PI = Math.PI * 2;
        for (const set of BELT_SETS) {
          const arr = set.attr.array;
          for (let i = 0; i < set.N; i += 1) {
            set.M0d[i] = (set.M0d[i] + set.nd[i] * rel) % TWO_PI;
            arr[i * 4 + 1] = set.M0d[i];
          }
          set.attr.needsUpdate = true;
        }
        beltEpochDt = dtNow;
        beltRebaseAt = performance.now();
        rel = 0;
      }
      beltMaterial.uniforms.uDt.value = rel;
    }
    beltMaterial.uniforms.uBlend.value = scaleBlend;
    beltMaterial.uniforms.uSizeK.value = lerp(2.5e5, 55, scaleBlend);   // 两种尺度各自的衰减参考距离
    beltMaterial.uniforms.uAnchorKm.value.set(anchor[0], anchor[1], anchor[2]);
    beltMaterial.uniforms.uDeltaBu.value.set(dx || 0, dy || 0, dz || 0);
  }

  let solarSysLabel = null;
  function updateLabels() {
    const lyr = document.getElementById("labelLayer");
    if (LNCH.state !== "off" && LNCH.state !== "load") { lyr.style.visibility = "hidden"; return; }
    lyr.style.visibility = "";
    const show = document.getElementById("tglLabels").checked;
    const inter = star3DBlend > 0.55;   // 星际视角: 各天体标签挤成一团小字 → 坍缩为「太阳系」
    if (!solarSysLabel) {
      CN.SolarSystem = "太阳系"; ACCENT.SolarSystem = "#ffd27a";
      solarSysLabel = makeLabel("SolarSystem");
      scene.add(solarSysLabel);
    }
    const sp = scenePos.Sun || [0, 0, 0];
    solarSysLabel.position.set(sp[0], sp[1], sp[2]);
    solarSysLabel.visible = show && inter;
    const showSats = document.getElementById("tglSats").checked;
    const showOrbits = document.getElementById("tglOrbits").checked;
    for (const body of bodies) {
      const label = labels[body.name];
      const p = scenePos[body.name];
      label.position.set(p[0], p[1], p[2]);
      const camDist = camera.position.distanceTo(label.position);
      label.visible = show && !inter && !(body.name === anchorName && camDist < sceneRadius[body.name] * 14);
      label.material.opacity = body.name === hoverName ? 1.0 : 0.8;
    }
    for (const sat of SATELLITES) {
      const near = satNearParent(sat);
      sat.group.visible = showSats;
      sat.orbitLine.visible = showSats && showOrbits && near;
      const label = labels[sat.name];
      const p = scenePos[sat.name];
      label.position.set(p[0], p[1], p[2]);
      const camDist = camera.position.distanceTo(label.position);
      label.visible = show && !inter && showSats && near &&
        !(sat.name === anchorName && camDist < sceneRadius[sat.name] * 14);
      label.material.opacity = sat.name === hoverName ? 1.0 : 0.8;
    }
  }

  /* ================= 阶段9 · 天象引擎 =================
   * 日月食: 矢量几何(影轴到地心/月心的垂距), Meeus 月球历表驱动;
   * 凌日/冲/大合: 地心角距扫描 + 黄金分割细化。全部实时推算, 无查表。 */
  const R_SUN_KM = 696000, R_EARTH_KM = 6371, R_MOON_KM = 1737.4;
  const R_DANJON = R_EARTH_KM * (1 + 1 / 85);   // 月食地影用 Danjon 增广(大气折射), NASA 食典口径
  const EVENTS = [];
  let eventsReady = false;
  const _eg = { e: [0, 0, 0], m: [0, 0, 0] };
  const _embT = [0, 0, 0];
  function eclState(jdTt) {
    const emb = heliocentricKm(bodyByName.Earth.orbit_j2000, jdTt, _embT);
    moonGeoKm(jdTt, _eg.m);
    _eg.e[0] = emb[0] - _eg.m[0] * MU_MOON;
    _eg.e[1] = emb[1] - _eg.m[1] * MU_MOON;
    _eg.e[2] = emb[2] - _eg.m[2] * MU_MOON;
    return _eg;
  }
  /* 日食: 月影轴(日→月延长线)到地心垂距; t>0 表示影子指向地球一侧 */
  function solarAxisGeom(st) {
    const sx = -st.e[0], sy = -st.e[1], sz = -st.e[2];
    let ux = st.m[0] - sx, uy = st.m[1] - sy, uz = st.m[2] - sz;
    const dms = Math.hypot(ux, uy, uz);
    ux /= dms; uy /= dms; uz /= dms;
    const t = -(st.m[0] * ux + st.m[1] * uy + st.m[2] * uz);
    const cx = st.m[1] * uz - st.m[2] * uy;
    const cy = st.m[2] * ux - st.m[0] * uz;
    const cz = st.m[0] * uy - st.m[1] * ux;
    return { dAxis: Math.hypot(cx, cy, cz), t, dms, ux, uy, uz };
  }
  /* 月食: 地影轴(反日方向)到月心垂距; t>0 表示月球在背日侧(望) */
  function lunarAxisGeom(st) {
    const dse = Math.hypot(st.e[0], st.e[1], st.e[2]);
    const ux = st.e[0] / dse, uy = st.e[1] / dse, uz = st.e[2] / dse;
    const t = st.m[0] * ux + st.m[1] * uy + st.m[2] * uz;
    const cx = st.m[1] * uz - st.m[2] * uy;
    const cy = st.m[2] * ux - st.m[0] * uz;
    const cz = st.m[0] * uy - st.m[1] * ux;
    return { dAxis: Math.hypot(cx, cy, cz), t, dse };
  }
  function goldenMin(f, a, b) {
    const GR = 0.6180339887;
    let x1 = b - GR * (b - a), x2 = a + GR * (b - a);
    let f1 = f(x1), f2 = f(x2);
    for (let i = 0; i < 20; i += 1) {  // 2.6d·0.618²⁰ ≈ 16s, 食甚时刻精度足够
      if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = b - GR * (b - a); f1 = f(x1); }
      else { a = x1; x1 = x2; f1 = f2; x2 = a + GR * (b - a); f2 = f(x2); }
    }
    const x = (a + b) / 2;
    return { x, f: f(x) };
  }
  const _ga = [0, 0, 0];
  function sepSunPlanet(name, jdTt) {   // 行星-太阳地心角距(度)
    const p = heliocentricKm(bodyByName[name].orbit_j2000, jdTt);
    const e = heliocentricKm(bodyByName.Earth.orbit_j2000, jdTt);
    _ga[0] = p[0] - e[0]; _ga[1] = p[1] - e[1]; _ga[2] = p[2] - e[2];
    const dot = -(_ga[0] * e[0] + _ga[1] * e[1] + _ga[2] * e[2]);
    return Math.acos(clamp(dot / (Math.hypot(_ga[0], _ga[1], _ga[2]) * Math.hypot(e[0], e[1], e[2])), -1, 1)) / D2R;
  }
  function sepPlanets(n1, n2, jdTt) {   // 两行星地心角距(度)
    const p1 = heliocentricKm(bodyByName[n1].orbit_j2000, jdTt);
    const p2 = heliocentricKm(bodyByName[n2].orbit_j2000, jdTt);
    const e = heliocentricKm(bodyByName.Earth.orbit_j2000, jdTt);
    const ax = p1[0] - e[0], ay = p1[1] - e[1], az = p1[2] - e[2];
    const bx = p2[0] - e[0], by = p2[1] - e[1], bz = p2[2] - e[2];
    return Math.acos(clamp((ax * bx + ay * by + az * bz) /
      (Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz)), -1, 1)) / D2R;
  }
  /* ---------------- 流星雨: 十大流星雨按太阳黄经用真历表解每年极大 ---------------- */
  const METEOR_SHOWERS = [
    { lam: 283.16, cn: "象限仪座流星雨", zhr: 110, parent: "小行星 2003 EH1" },
    { lam: 32.32, cn: "天琴座流星雨", zhr: 18, parent: "彗星 C/1861 G1" },
    { lam: 45.5, cn: "宝瓶座η流星雨", zhr: 50, parent: "哈雷彗星" },
    { lam: 126.9, cn: "宝瓶座δ南流星雨", zhr: 25, parent: "彗星 96P" },
    { lam: 140.0, cn: "英仙座流星雨", zhr: 100, parent: "彗星 109P/斯威夫特-塔特尔" },
    { lam: 208.0, cn: "猎户座流星雨", zhr: 20, parent: "哈雷彗星" },
    { lam: 223.0, cn: "金牛座南流星雨", zhr: 5, parent: "恩克彗星" },
    { lam: 235.27, cn: "狮子座流星雨", zhr: 15, parent: "彗星 55P/坦普尔-塔特尔" },
    { lam: 262.2, cn: "双子座流星雨", zhr: 150, parent: "小行星 3200 法厄同" },
    { lam: 270.7, cn: "小熊座流星雨", zhr: 10, parent: "彗星 8P/塔特尔" }
  ];
  const _metP = [0, 0, 0];
  function sunLonDeg(jdq) {
    heliocentricKm(bodyByName.Earth.orbit_j2000, jdq, _metP);
    return Math.atan2(-_metP[1], -_metP[0]) / D2R;   // 几何地心太阳黄经
  }
  function angDiffDeg(a, b) {
    let d = a - b;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }
  function meteorPeakJdFull(year, lam) {
    const j0 = 2440587.5 + Date.UTC(year, 0, 1) / 86400000;
    let prev = angDiffDeg(sunLonDeg(j0), lam);
    for (let d = 2; d <= 368; d += 2) {
      const cur = angDiffDeg(sunLonDeg(j0 + d), lam);
      if (prev < 0 && cur >= 0) {
        let lo = j0 + d - 2, hi = j0 + d;
        for (let it = 0; it < 34; it += 1) {
          const mid = (lo + hi) / 2;
          if (angDiffDeg(sunLonDeg(mid), lam) < 0) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
      }
      prev = cur;
    }
    return 0;
  }
  function meteorPeakRefine(seed, lam) {
    let lo = seed - 3, hi = seed + 3;
    let flo = angDiffDeg(sunLonDeg(lo), lam), fhi = angDiffDeg(sunLonDeg(hi), lam);
    if (flo > 0 || fhi < 0) {
      lo = seed - 6; hi = seed + 6;
      flo = angDiffDeg(sunLonDeg(lo), lam); fhi = angDiffDeg(sunLonDeg(hi), lam);
      if (flo > 0 || fhi < 0) return 0;
    }
    for (let it = 0; it < 34; it += 1) {
      const mid = (lo + hi) / 2;
      if (angDiffDeg(sunLonDeg(mid), lam) < 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /* 扫描任务队列: 同步路径(点击/测试)一口气跑完; 后台泵(开幕门内启动)每片 ≤11ms 不冻主线程 */
  let scanTasks = null, scanPumping = false, scanT0 = 0;
  function buildScanTasks() {
    const JD0 = J2000 - 36525, JD1 = J2000 + 36525;
    const SYN = 29.530588853, NM0 = 2451550.0966;
    const tasks = [];
    scanT0 = performance.now();
    // —— 日食/月食: 逐朔望月枚举(12 个月/片) ——
    const kLo = Math.ceil((JD0 - NM0) / SYN), kHi = Math.floor((JD1 - NM0) / SYN);
    for (let kc = kLo; kc <= kHi; kc += 12) {
      const ka = kc, kb = Math.min(kc + 11, kHi);
      tasks.push(() => {
        for (let k = ka; k <= kb; k += 1) {
          const jdN = NM0 + SYN * k;
          let r = goldenMin((j) => solarAxisGeom(eclState(j)).dAxis, jdN - 1.3, jdN + 1.3);
          let g = solarAxisGeom(eclState(r.x));
          if (g.t > 0) {
            const rPen = Math.tan(Math.asin((R_SUN_KM + R_MOON_KM) / g.dms)) * g.t + R_MOON_KM;
            if (r.f < R_EARTH_KM + rPen) {
              let cn = "日偏食";
              if (r.f < R_EARTH_KM) {
                const Lu = R_MOON_KM / Math.tan(Math.asin((R_SUN_KM - R_MOON_KM) / g.dms));
                cn = Lu > g.t - R_EARTH_KM ? "日全食" : "日环食";
              }
              EVENTS.push({ jd: r.x, type: "solar", cn, focus: "Earth" });
            }
          }
          const jdF = jdN + SYN / 2;
          r = goldenMin((j) => lunarAxisGeom(eclState(j)).dAxis, jdF - 1.3, jdF + 1.3);
          g = lunarAxisGeom(eclState(r.x));
          if (g.t > 0) {
            const rU = R_DANJON - g.t * (R_SUN_KM - R_DANJON) / g.dse;
            if (r.f < rU + R_MOON_KM) {
              EVENTS.push({ jd: r.x, type: "lunar", cn: r.f < rU - R_MOON_KM ? "月全食" : "月偏食", focus: "Moon" });
            }
          }
        }
      });
    }
    // —— 凌日(内行星下合 + 角距小于太阳视半径 + 位于日地之间) ——
    for (const [pn, cn] of [["Mercury", "水星凌日"], ["Venus", "金星凌日"]]) {
      tasks.push(() => {
        let prev2 = 1e9, prev1 = 1e9, jdPrev = 0;
        for (let j = JD0; j <= JD1; j += 2) {
          const sp = sepSunPlanet(pn, j);
          if (prev1 < prev2 && prev1 <= sp && prev1 < 3) {
            const r = goldenMin((x) => sepSunPlanet(pn, x), jdPrev - 3, jdPrev + 3);
            const p = heliocentricKm(bodyByName[pn].orbit_j2000, r.x);
            const e = heliocentricKm(bodyByName.Earth.orbit_j2000, r.x);
            const dp = Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]);
            const de = Math.hypot(e[0], e[1], e[2]);
            if (r.f < Math.asin(R_SUN_KM / de) / D2R && dp < de) {
              EVENTS.push({ jd: r.x, type: "transit", cn, focus: "Sun" });
            }
          }
          prev2 = prev1; prev1 = sp; jdPrev = j;
        }
      });
    }
    // —— 火星冲(近距者标大冲) ——
    tasks.push(() => {
      let prev2 = -1e9, prev1 = -1e9, jdPrev = 0;
      for (let j = JD0; j <= JD1; j += 4) {
        const sp = sepSunPlanet("Mars", j);
        if (prev1 > prev2 && prev1 >= sp && prev1 > 165) {
          const r = goldenMin((x) => -sepSunPlanet("Mars", x), jdPrev - 6, jdPrev + 6);
          const p = heliocentricKm(bodyByName.Mars.orbit_j2000, r.x);
          const e = heliocentricKm(bodyByName.Earth.orbit_j2000, r.x);
          const dAu = Math.hypot(p[0] - e[0], p[1] - e[1], p[2] - e[2]) / AU_KM;
          EVENTS.push({ jd: r.x, type: "opposition", cn: dAu < 0.62 ? `火星大冲 (${dAu.toFixed(3)} AU)` : "火星冲", focus: "Mars" });
        }
        prev2 = prev1; prev1 = sp; jdPrev = j;
      }
    });
    // —— 大合(地心角距极小) ——
    for (const [p1, p2, label, thr] of [["Jupiter", "Saturn", "木土大合", 1.3], ["Venus", "Jupiter", "金木相合", 0.6]]) {
      tasks.push(() => {
        let prev2 = 1e9, prev1 = 1e9, jdPrev = 0;
        for (let j = JD0; j <= JD1; j += 2) {
          const sp = sepPlanets(p1, p2, j);
          if (prev1 < prev2 && prev1 <= sp && prev1 < thr * 3) {
            const r = goldenMin((x) => sepPlanets(p1, p2, x), jdPrev - 4, jdPrev + 4);
            if (r.f < thr) {
              EVENTS.push({ jd: r.x, type: "conj", cn: `${label} (${(r.f * 60).toFixed(0)}′)`, focus: p1 });
            }
          }
          prev2 = prev1; prev1 = sp; jdPrev = j;
        }
      });
    }
    // —— 金牛座尘埃带 + 航天器 + 固定条目 ——
    tasks.push(() => {
      for (const mj of computeMeteorJds()) {
        EVENTS.push({ jd: mj, type: "meteor", cn: "金牛座流星雨 · 穿越恩克尘埃带", focus: "Earth" });
      }
      for (const c of SPACECRAFT) {
        EVENTS.push({ jd: c.launchJd, type: "craft", cn: `${c.cn}发射`, focus: c.name });
        for (const ev of c.events) EVENTS.push({ jd: ev[0], type: "craft", cn: `${c.cn} · ${ev[1]}`, focus: c.name });
      }
      EVENTS.push({ jd: 2462239.11, type: "asteroid", cn: "阿波菲斯掠地 · 距地约 3.2 万公里", focus: "Apophis" });
      for (const c of COMETS) {
        if (c.hyper) EVENTS.push({ jd: c.segments[0].tp, type: "asteroid", cn: `${c.cn}过近日点 · 星际访客 (v∞ ${c.vinf.toFixed(0)} km/s)`, focus: c.name });
      }
    });
    // —— 流星雨: 每雨一片(首年全扫 + 逐年精化) ——
    for (const ms of METEOR_SHOWERS) {
      tasks.push(() => {
        let pj = meteorPeakJdFull(1900, ms.lam);
        if (!pj) return;
        EVENTS.push({ jd: pj, type: "meteor", cn: `${ms.cn}极大 (ZHR~${ms.zhr}) · 母体 ${ms.parent}`, focus: "Earth" });
        for (let yy = 1901; yy <= 2100; yy += 1) {
          pj = meteorPeakRefine(pj + 365.2422, ms.lam);
          if (pj) EVENTS.push({ jd: pj, type: "meteor", cn: `${ms.cn}极大 (ZHR~${ms.zhr}) · 母体 ${ms.parent}`, focus: "Earth" });
        }
      });
    }
    // —— 收尾: 排序 + 就绪 ——
    tasks.push(() => {
      EVENTS.sort((a, b) => a.jd - b.jd);
      eventsReady = true;
      console.log(`天象扫描完成: ${EVENTS.length} 项, 耗时 ${(performance.now() - scanT0).toFixed(0)} ms`);
    });
    return tasks;
  }
  function scanAstroEvents() {
    if (eventsReady) return;
    if (!scanTasks) scanTasks = buildScanTasks();
    while (scanTasks.length) scanTasks.shift()();
  }
  function scanPump() {
    if (eventsReady || scanPumping) return;
    if (!scanTasks) scanTasks = buildScanTasks();
    scanPumping = true;
    const step = () => {
      const t0 = performance.now();
      while (scanTasks.length && performance.now() - t0 < 11) scanTasks.shift()();
      if (scanTasks.length) setTimeout(step, 32);
      else scanPumping = false;
    };
    setTimeout(step, 40);
  }
  /* —— 实时食效果: 血月着色 + 日食影斑 —— */
  let shadowSpot = null;
  function buildEclipseFx() {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const cx = cv.getContext("2d");
    const gr = cx.createRadialGradient(64, 64, 6, 64, 64, 64);
    gr.addColorStop(0, "rgba(0,0,0,0.85)");
    gr.addColorStop(0.55, "rgba(0,0,0,0.4)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    cx.fillStyle = gr;
    cx.fillRect(0, 0, 128, 128);
    shadowSpot = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false
    }));
    shadowSpot.visible = false;
    shadowSpot.renderOrder = 6;
    scene.add(shadowSpot);
  }
  function updateEclipseFx() {
    if (!shadowSpot) return;
    _eg.e[0] = worldKm.Earth[0]; _eg.e[1] = worldKm.Earth[1]; _eg.e[2] = worldKm.Earth[2];
    _eg.m[0] = _mg[0]; _eg.m[1] = _mg[1]; _eg.m[2] = _mg[2];
    // 血月: 按月心陷入本影深度着色
    const gl = lunarAxisGeom(_eg);
    let depth = 0;
    if (gl.t > 0) {
      const rU = R_DANJON - gl.t * (R_SUN_KM - R_DANJON) / gl.dse;
      depth = clamp((rU + R_MOON_KM - gl.dAxis) / (2 * R_MOON_KM), 0, 1);
    }
    const mMat = satByName.Moon.spinMesh.material;
    mMat.color.setRGB(1 - 0.08 * depth, 1 - 0.6 * depth, 1 - 0.7 * depth);
    // 日食影斑: 影轴垂足方向投到地球表面
    let show = false;
    const gs = solarAxisGeom(_eg);
    if (gs.t > 0) {
      const rPen = Math.tan(Math.asin((R_SUN_KM + R_MOON_KM) / gs.dms)) * gs.t + R_MOON_KM;
      if (gs.dAxis < R_EARTH_KM + rPen) {
        show = true;
        const px = _eg.m[0] + gs.t * gs.ux, py = _eg.m[1] + gs.t * gs.uy, pz = _eg.m[2] + gs.t * gs.uz;
        const pl = Math.hypot(px, py, pz) || 1;
        const er = sceneRadius.Earth, ep = scenePos.Earth;
        shadowSpot.position.set(ep[0] + px / pl * er * 1.03, ep[1] + py / pl * er * 1.03, ep[2] + pz / pl * er * 1.03);
        const frac = clamp(rPen / R_EARTH_KM, 0.18, 0.85);
        shadowSpot.scale.set(er * frac * 2.2, er * frac * 2.2, 1);
        shadowSpot.material.opacity = clamp(1 - gs.dAxis / (R_EARTH_KM + rPen), 0.2, 0.9);
      }
    }
    shadowSpot.visible = show;
  }
  /* —— 天象日历渲染 —— */
  let evtFilter = "all";
  function renderEvents() {
    const list = $("evtList");
    const rows = [];
    let nextMarked = false;
    for (let i = 0; i < EVENTS.length; i += 1) {
      const ev = EVENTS[i];
      if (evtFilter !== "all" && ev.type !== evtFilter) continue;
      const isNext = !nextMarked && ev.jd >= jd;
      if (isNext) nextMarked = true;
      rows.push(`<div class="evtRow${isNext ? " next" : ""}" data-i="${i}">` +
        `<span class="edate">${jdToDateText(ev.jd).slice(0, 10)}</span>` +
        `<span class="ename et-${ev.type}">${ev.cn}</span></div>`);
    }
    list.innerHTML = rows.join("") || "<div class='hintText'>此类别范围内无事件</div>";
    for (const el of list.querySelectorAll(".evtRow")) {
      el.addEventListener("click", () => {
        const ev = EVENTS[Number(el.dataset.i)];
        if (ev.type === "solar") award("eclipse");
        if (ev.type === "lunar") award("blood_moon");
        if (ev.focus === "Apophis") award("apophis");
        jd = ev.jd;
        playing = false;
        $("playBtn").textContent = "▶";
        stopTour();
        setFocus(ev.focus, false);
      });
    }
    const nx = list.querySelector(".next");
    if (nx) nx.scrollIntoView({ block: "center" });
  }

  /* 测试钩子: Node 挽具可直接调用扫描器比对权威星历 */
  if (typeof window !== "undefined") window.__astro = { scan: scanAstroEvents, EVENTS, moon: (j) => moonGeoKm(j, [0, 0, 0]) };
  if (typeof window !== "undefined") window.__probeLunar = (j) => lunarAxisGeom(eclState(j));

  /* ================= 阶段11 · 引力沙盒: 受摄限制性 N 体 =================
   * 探针为测试粒子, 在 太阳+八大行星 的时变引力场中做 RK4 自适应积分(日心系含间接项)。
   * 单位: km, km/s, 天。行星位置由 Standish 根数解析给出(与主渲染同一数据脊柱)。 */
  const GM_SUN_KM = 1.32712440018e11;   // km^3/s^2
  const SBX_GM = { Mercury: 2.2032e4, Venus: 3.24859e5, Earth: 4.035032e5,   // 地月系合并
    Mars: 4.282837e4, Jupiter: 1.26686534e8, Saturn: 3.7931187e7,
    Uranus: 5.793939e6, Neptune: 6.836529e6 };
  const SBX_NAMES = Object.keys(SBX_GM);
  const DAY_S = 86400;
  const probes = [];
  const PROBE_COLORS = ["#7ce0ff", "#ffd27a", "#c9a2ff", "#8effa8", "#ff9d8a", "#f5e663", "#7aa8ff", "#ff7ad5", "#9fe8d8", "#b9f57a"];
  let probeSeq = 0, probeTex = null;
  const TRAIL_N = 512;
  /* 行星位置缓存(按精确 jd 复用, RK4 各级共享) */
  let _sbxCacheJd = NaN;
  const _sbxPlanetPos = {};
  for (const nm of SBX_NAMES) _sbxPlanetPos[nm] = [0, 0, 0];   // 预分配: 追赶期每子步 8 次分配 → 0
  function sbxPlanets(jdT) {
    if (jdT === _sbxCacheJd) return _sbxPlanetPos;
    for (const nm of SBX_NAMES) heliocentricKm(bodyByName[nm].orbit_j2000, jdT, _sbxPlanetPos[nm]);
    _sbxCacheJd = jdT;
    return _sbxPlanetPos;
  }
  /* 日心系加速度(km/s^2): 太阳 + 行星直接项 + 间接项(非惯性系修正) */
  function sandboxAccel(jdT, r, out) {
    const d2 = r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
    const d = Math.sqrt(d2);
    const kS = -GM_SUN_KM / (d2 * d);
    out[0] = r[0] * kS; out[1] = r[1] * kS; out[2] = r[2] * kS;
    const P = sbxPlanets(jdT);
    for (const nm of SBX_NAMES) {
      const p = P[nm], mu = SBX_GM[nm];
      const rx = r[0] - p[0], ry = r[1] - p[1], rz = r[2] - p[2];
      const q2 = rx * rx + ry * ry + rz * rz;
      const qi = mu / (q2 * Math.sqrt(q2));
      const p2 = p[0] * p[0] + p[1] * p[1] + p[2] * p[2];
      const pi = mu / (p2 * Math.sqrt(p2));
      out[0] -= rx * qi + p[0] * pi;
      out[1] -= ry * qi + p[1] * pi;
      out[2] -= rz * qi + p[2] * pi;
    }
    return out;
  }
  /* 自适应步长(天): 距最近行星/太阳越近步长越小 */
  function sbxStepDays(p, hMax) {
    const P = sbxPlanets(p.jd);
    const v = Math.max(Math.hypot(p.v[0], p.v[1], p.v[2]), 0.5);
    let h = 0.008 * Math.hypot(p.r[0], p.r[1], p.r[2]) / (v * DAY_S);
    for (const nm of SBX_NAMES) {
      const q = P[nm];
      const d = Math.hypot(p.r[0] - q[0], p.r[1] - q[1], p.r[2] - q[2]);
      h = Math.min(h, 0.02 * d / (v * DAY_S) + 2e-4);
    }
    return clamp(h, 3.5e-4, hMax || 0.25);   // 30s ~ 6h(追赶时巡航段放宽)
  }
  const _k1 = [0,0,0], _k2 = [0,0,0], _k3 = [0,0,0], _k4 = [0,0,0];
  const _rt = [0,0,0], _a1 = [0,0,0], _a2 = [0,0,0], _a3 = [0,0,0], _a4 = [0,0,0];
  function rk4Step(p, hDays) {
    const h = hDays * DAY_S, r = p.r, v = p.v;
    sandboxAccel(p.jd, r, _a1);
    for (let i = 0; i < 3; i += 1) { _k1[i] = v[i]; _rt[i] = r[i] + 0.5 * h * _k1[i]; }
    const jm = p.jd + hDays * 0.5;
    sandboxAccel(jm, _rt, _a2);
    for (let i = 0; i < 3; i += 1) { _k2[i] = v[i] + 0.5 * h * _a1[i]; _rt[i] = r[i] + 0.5 * h * _k2[i]; }
    sandboxAccel(jm, _rt, _a3);
    for (let i = 0; i < 3; i += 1) { _k3[i] = v[i] + 0.5 * h * _a2[i]; _rt[i] = r[i] + h * _k3[i]; }
    sandboxAccel(p.jd + hDays, _rt, _a4);
    for (let i = 0; i < 3; i += 1) {
      _k4[i] = v[i] + h * _a3[i];
      r[i] += h / 6 * (_k1[i] + 2 * _k2[i] + 2 * _k3[i] + _k4[i]);
      v[i] += h / 6 * (_a1[i] + 2 * _a2[i] + 2 * _a3[i] + _a4[i]);
    }
    p.jd += hDays;
  }
  /* 轨迹环: 位移或转向足够时记一点 */
  function trailPush(p) {
    const t = p.trail, n = p.trailN;
    if (n > 0) {
      const lx = t[(n - 1) * 3], ly = t[(n - 1) * 3 + 1], lz = t[(n - 1) * 3 + 2];
      const dd = Math.hypot(p.r[0] - lx, p.r[1] - ly, p.r[2] - lz);
      if (dd < 1.6e6 && dd < Math.hypot(p.r[0], p.r[1], p.r[2]) * 0.012) return;
    }
    if (n === TRAIL_N) {
      t.copyWithin(0, 3);
      t[(TRAIL_N - 1) * 3] = p.r[0]; t[(TRAIL_N - 1) * 3 + 1] = p.r[1]; t[(TRAIL_N - 1) * 3 + 2] = p.r[2];
    } else {
      t[n * 3] = p.r[0]; t[n * 3 + 1] = p.r[1]; t[n * 3 + 2] = p.r[2];
      p.trailN = n + 1;
    }
  }
  function makeProbeTexture() {
    if (probeTex) return probeTex;
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const cx = cv.getContext("2d");
    const g = cx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.85)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    cx.fillStyle = g;
    cx.fillRect(0, 0, 64, 64);
    probeTex = new THREE.CanvasTexture(cv);
    return probeTex;
  }
  function launchProbe(rKm, vKmS, opts) {
    if (probes.length >= 10) removeProbe(probes[0]);
    const color = new THREE.Color(PROBE_COLORS[probeSeq % PROBE_COLORS.length]);
    probeSeq += 1;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(TRAIL_N * 3), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false
    }));
    line.frustumCulled = false;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeProbeTexture(), color, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, sizeAttenuation: false
    }));
    spr.scale.set(0.016, 0.016, 1);
    spr.frustumCulled = false;
    spr.renderOrder = 5;
    scene.add(line);
    scene.add(spr);
    const model = makeProbeModel(color);
    model.visible = false;
    scene.add(model);
    const plabel = makeStarNameSprite((opts && opts.name) || `探针 ${probeSeq}`);
    plabel.material.opacity = 0.8;
    plabel.visible = true;
    scene.add(plabel);
    const p = {
      id: probeSeq, name: (opts && opts.name) || `探针 ${probeSeq}`,
      r: rKm.slice(), v: vKmS.slice(), jd0: jd, jd,
      trail: new Float32Array(TRAIL_N * 3), trailN: 0,
      line: line, spr, color, model, label: plabel, suspend: false,
      hohmann: !!(opts && opts.hohmann), minMars: Infinity, minMarsJd: 0, result: null
    };
    trailPush(p);
    probes.push(p);
    probeGen += 1;
    award("probe");
    refreshProbeList();
    saveProbes();
    return p;
  }
  function disposeLabel2D(shim) {
    for (let i = labels2D.length - 1; i >= 0; i -= 1) {
      if (labels2D[i].shim === shim) {
        const el = labels2D[i].el;
        if (el && el.parentNode && el.parentNode.removeChild) el.parentNode.removeChild(el);
        labels2D.splice(i, 1);
        return;
      }
    }
  }
  function removeProbe(p) {
    scene.remove(p.line); scene.remove(p.spr); scene.remove(p.model); scene.remove(p.label);
    disposeLabel2D(p.label);
    if (p.model && p.model.traverse) {
      p.model.traverse((o2) => {
        if (o2.geometry && o2.geometry.dispose) o2.geometry.dispose();
        if (o2.material && o2.material.dispose) o2.material.dispose();
      });
    }
    p.line.geometry.dispose(); p.line.material.dispose(); p.spr.material.dispose();
    const i = probes.indexOf(p);
    if (i >= 0) probes.splice(i, 1);
    probeGen += 1;
    refreshProbeList();
    saveProbes();
  }
  // 雷达清单缓存随探针增删自动失效(签名含 probes.length)
  function saveProbes() {
    try {
      localStorage.setItem("ss_probes", JSON.stringify(probes.map((p) => ({
        r: p.r, v: p.v, jd: p.jd, name: p.name, h: p.hohmann
      }))));
    } catch (e) { /* 无 localStorage */ }
  }
  function restoreProbes() {
    try {
      const arr = JSON.parse(localStorage.getItem("ss_probes") || "[]");
      for (const q of arr.slice(0, 10)) {
        if (!q.r || !q.v) continue;
        const p = launchProbe(q.r, q.v, { name: q.name, hohmann: q.h });
        p.jd = q.jd || jd;
        p.jd0 = p.jd;
      }
    } catch (e) { /* 忽略 */ }
  }
  function clearProbes() { while (probes.length) removeProbe(probes[0]); }
  /* 把探针推进到全局 jd(前后向均可), 每帧限步数防卡 */
  function stepProbes() {
    /* 帧预算: 全局子步上限 + 5ms 看门狗——时间加速/多探针/积压追赶时保帧率 */
    let budget = 900;
    const t0 = performance.now();
    for (const p of probes) {
      if (Math.abs(jd - p.jd) > 36525) { p.suspend = true; continue; }   // 深时大步跳跃: 挂起
      p.suspend = false;
      while (Math.abs(jd - p.jd) > 1e-7 && budget > 0) {
        const gap = Math.abs(jd - p.jd);
        const dir = jd > p.jd ? 1 : -1;
        const h = Math.min(sbxStepDays(p, gap > 20 ? 1.0 : 0.25), gap);
        rk4Step(p, h * dir);
        trailPush(p);
        if (p.hohmann && !p.result) {
          const m = sbxPlanets(p.jd).Mars;
          const dM = Math.hypot(p.r[0] - m[0], p.r[1] - m[1], p.r[2] - m[2]);
          if (dM < p.minMars) { p.minMars = dM; p.minMarsJd = p.jd; }
          if (p.jd - p.jd0 > 520) finishHohmann(p);
        }
        budget -= 1;
        if ((budget & 63) === 0 && performance.now() - t0 > 5) budget = 0;
      }
    }
  }
  /* 轨道要素速览: 能量→椭圆/双曲线, 近日点 */
  function probeOrbitText(p) {
    const r = Math.hypot(p.r[0], p.r[1], p.r[2]);
    const v2 = p.v[0] * p.v[0] + p.v[1] * p.v[1] + p.v[2] * p.v[2];
    const eps = v2 / 2 - GM_SUN_KM / r;
    const hx = p.r[1] * p.v[2] - p.r[2] * p.v[1];
    const hy = p.r[2] * p.v[0] - p.r[0] * p.v[2];
    const hz = p.r[0] * p.v[1] - p.r[1] * p.v[0];
    const h2 = hx * hx + hy * hy + hz * hz;
    const e = Math.sqrt(Math.max(0, 1 + 2 * eps * h2 / (GM_SUN_KM * GM_SUN_KM)));
    if (p.suspend) return "深时挂起";
    if (eps >= 0) return `双曲线逃逸 e=${e.toFixed(2)}`;
    const a = -GM_SUN_KM / (2 * eps) / AU_KM;
    return `椭圆 a=${a.toFixed(2)}AU e=${e.toFixed(2)}`;
  }
  /* 每帧渲染: 探针点 + 轨迹(km→场景, 跟随双尺度/浮动原点) */
  const _sbxView = { anchor: [0, 0, 0], off: [0, 0, 0] };
  function updateProbes(anchor, dx, dy, dz) {
    _sbxView.anchor = anchor;
    _sbxView.off[0] = dx; _sbxView.off[1] = dy; _sbxView.off[2] = dz;
    for (const p of probes) {
      _rel[0] = p.r[0] - anchor[0]; _rel[1] = p.r[1] - anchor[1]; _rel[2] = p.r[2] - anchor[2];
      mapPoint(_rel, _p);
      p.spr.position.set(_p[0] - dx, _p[1] - dy, _p[2] - dz);
      p.label.position.copy(p.spr.position);
      p.label.visible = document.getElementById("tglLabels").checked;
      p.model.visible = !p.suspend;
      if (p.model.visible) {
        placeCraftModel(p.model, p.spr, 0.035, 0.012, 1.4);
        _mdlDir.set(p.v[0], p.v[1], p.v[2]).normalize();
        p.model.quaternion.setFromUnitVectors(_mdlZ, _mdlDir);
      }
      const arr = p.line.geometry.attributes.position.array;
      const colA = p.line.geometry.attributes.color.array;
      const n = p.trailN;
      for (let i = 0; i < n; i += 1) {
        _rel[0] = p.trail[i * 3] - anchor[0]; _rel[1] = p.trail[i * 3 + 1] - anchor[1]; _rel[2] = p.trail[i * 3 + 2] - anchor[2];
        mapPoint(_rel, _p);
        arr[i * 3] = _p[0] - dx; arr[i * 3 + 1] = _p[1] - dy; arr[i * 3 + 2] = _p[2] - dz;
        const b = 0.12 + 0.88 * Math.pow(i / Math.max(n - 1, 1), 1.6);
        colA[i * 3] = p.color.r * b; colA[i * 3 + 1] = p.color.g * b; colA[i * 3 + 2] = p.color.b * b;
      }
      p.line.geometry.setDrawRange(0, n);
      p.line.geometry.attributes.position.needsUpdate = true;
      p.line.geometry.attributes.color.needsUpdate = true;
    }
  }

  /* ---------------- 霍曼挑战: 地球→火星 ---------------- */
  function planetStateKm(name, jdT) {
    const r = heliocentricKm(bodyByName[name].orbit_j2000, jdT);
    const r1 = heliocentricKm(bodyByName[name].orbit_j2000, jdT - 0.01);
    const r2 = heliocentricKm(bodyByName[name].orbit_j2000, jdT + 0.01);
    const k = 1 / (0.02 * DAY_S);
    return { r, v: [(r2[0] - r1[0]) * k, (r2[1] - r1[1]) * k, (r2[2] - r1[2]) * k] };
  }
  function phaseAngleDeg(jdT) {   // 火星相对地球的日心经差(理想发射窗 ≈ +44°)
    const e = heliocentricKm(bodyByName.Earth.orbit_j2000, jdT);
    const m = heliocentricKm(bodyByName.Mars.orbit_j2000, jdT);
    let d = (Math.atan2(m[1], m[0]) - Math.atan2(e[1], e[0])) / D2R;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }
  /* 给定发射时刻的转移方案: 迭代求飞行时间/到达距离, miss=到达时火星偏离探针远拱点的经度差 */
  function hohmannPlan(jdT) {
    const e = planetStateKm("Earth", jdT);
    const r1 = Math.hypot(e.r[0], e.r[1], e.r[2]);
    let r2 = 1.52 * AU_KM, tof = 250, m = null;
    for (let it = 0; it < 3; it += 1) {
      const aT = (r1 + r2) / 2;
      tof = Math.PI * Math.sqrt(aT * aT * aT / GM_SUN_KM) / DAY_S;
      m = planetStateKm("Mars", jdT + tof);
      r2 = Math.hypot(m.r[0], m.r[1], m.r[2]);
    }
    const vE = Math.hypot(e.v[0], e.v[1], e.v[2]);
    const dv = Math.sqrt(GM_SUN_KM * (2 / r1 - 2 / (r1 + r2))) - vE;
    let miss = Math.atan2(m.r[1], m.r[0]) - (Math.atan2(e.r[1], e.r[0]) + Math.PI);
    while (miss > Math.PI) miss -= Math.PI * 2;
    while (miss < -Math.PI) miss += Math.PI * 2;
    return { tof, dv, missDeg: miss / D2R };
  }
  /* 真几何窗口: 解 miss(jd)=0(到达时火星恰好在探针远拱点), 比固定 44° 相位精确 */
  function nextHohmannWindow(fromJd) {
    let prev = hohmannPlan(fromJd).missDeg;
    for (let j = fromJd + 1.5; j < fromJd + 830; j += 1.5) {
      const cur = hohmannPlan(j).missDeg;
      if (prev * cur <= 0 && Math.abs(prev - cur) < 30) {
        let lo = j - 1.5, hi = j;
        for (let k = 0; k < 22; k += 1) {
          const mid = (lo + hi) / 2;
          if (hohmannPlan(mid).missDeg * hohmannPlan(lo).missDeg <= 0) hi = mid; else lo = mid;
        }
        return (lo + hi) / 2;
      }
      prev = cur;
    }
    return fromJd;
  }
  function launchHohmann(dvKmS) {
    const st = planetStateKm("Earth", jd);
    const plan = hohmannPlan(jd);
    const mArr = planetStateKm("Mars", jd + plan.tof).r;
    /* 发射方位角自动对准: 转移轨道面 = 过 出发点 与 到达时的火星(处理火星 1.85° 倾角,
     * 180° 转移无法靠出发侧向分量修正平面 —— 这是真实任务的发射方位角设计) */
    let nx = st.r[1] * mArr[2] - st.r[2] * mArr[1];
    let ny = st.r[2] * mArr[0] - st.r[0] * mArr[2];
    let nz = st.r[0] * mArr[1] - st.r[1] * mArr[0];
    const nn = Math.hypot(nx, ny, nz) || 1;
    nx /= nn; ny /= nn; nz /= nn;
    const rr = Math.hypot(st.r[0], st.r[1], st.r[2]);
    const rx = st.r[0] / rr, ry = st.r[1] / rr, rz = st.r[2] / rr;
    let tx = ny * rz - nz * ry, ty = nz * rx - nx * rz, tz = nx * ry - ny * rx;
    const tn = Math.hypot(tx, ty, tz) || 1;
    tx /= tn; ty /= tn; tz /= tn;
    const vE = Math.hypot(st.v[0], st.v[1], st.v[2]);
    const vmag = vE + dvKmS;                     // Δv 语义: 沿转移面切向的日心速度增量
    const OFF = 2.6e6;
    // 逃逸补偿: 爬出地球引力阱后净增量恰为 Δv
    const relx = tx * vmag - st.v[0], rely = ty * vmag - st.v[1], relz = tz * vmag - st.v[2];
    const relm = Math.hypot(relx, rely, relz) || 1e-9;
    const k = Math.sqrt(relm * relm + 2 * SBX_GM.Earth / OFF) / relm;
    sfxRumble();
    animateScaleTo(0);                  // 转移在真实尺度上飞
    const p = launchProbe(
      [st.r[0] + tx * OFF, st.r[1] + ty * OFF, st.r[2] + tz * OFF],
      [st.v[0] + relx * k, st.v[1] + rely * k, st.v[2] + relz * k],
      { name: `转移 Δv=${dvKmS.toFixed(2)}`, hohmann: true });
    $("hohmannStatus").innerHTML = `已发射 · Δv=${dvKmS.toFixed(2)} km/s · 飞行中, 跟踪与火星最近距离…`;
    award("hohmann");
    return p;
  }
  function finishHohmann(p) {
    const wKm = p.minMars / 1e4;
    let grade;
    if (p.minMars < 3e6) { grade = "★★★ 精准抵达火星引力圈走廊!"; award("hohmann3"); }
    else if (p.minMars < 9e6) grade = "★★ 接近成功 — 再微调 Δv 或换窗口";
    else grade = "未命中 — 注意 44° 相位窗口(会合周期 780 天)";
    p.result = `${grade}`;
    const days = Math.round(p.minMarsJd - p.jd0);
    $("hohmannStatus").innerHTML =
      `${grade}<br>最近 ${wKm.toFixed(0)} 万 km · 飞行 ${days} 天(教科书霍曼 ≈259 天, Δv₁≈2.94)`;
    refreshProbeList();
  }
  /* ---------------- 沙盒交互: 黄道面拖拽发射 ---------------- */
  let sbxMode = false, sbxDrag = null, sbxArrow = null;
  const _ray = new THREE.Raycaster();
  const _ndc = new THREE.Vector2();
  const _eclPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const _hit = new THREE.Vector3();
  /* 场景半径 → 日心距离 km(mapPoint 径向映射的数值反演) */
  function invMapDist(sceneDist) {
    let lo = 0, hi = 90 * AU_KM;
    for (let i = 0; i < 60; i += 1) {
      const mid = (lo + hi) / 2;
      const cd = Math.log10(1 + mid / AU_KM) * SCALE.cinDistScale;
      const m = lerp(mid / SCALE.sceneUnitKm, cd, scaleBlend);
      if (m < sceneDist) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  function screenToEclipticKm(clientX, clientY, anchor, offset) {
    _ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    _ray.setFromCamera(_ndc, camera);
    if (!_ray.ray.intersectPlane(_eclPlane, _hit)) return null;
    // 场景点(浮动原点系) → anchor 相对映射空间 → km
    const sx = _hit.x + offset[0], sy = _hit.y + offset[1], sz = 0;
    const sd = Math.hypot(sx, sy);
    if (sd < 1e-9) return [anchor[0], anchor[1], 0];
    const dKm = invMapDist(sd);
    return [anchor[0] + sx / sd * dKm, anchor[1] + sy / sd * dKm, anchor[2] * 0];
  }
  function setSandboxMode(on) {
    sbxMode = on;
    if (on) animateScaleTo(0);          // 沙盒在真实尺度下投放, 轨迹物理直观
    $("sbxBtn").classList.toggle("active", on);
    $("sbxHint").style.display = on ? "block" : "none";
    renderer.domElement.style.cursor = on ? "crosshair" : "";
    if (!on && sbxArrow) { scene.remove(sbxArrow); sbxArrow = null; sbxDrag = null; }
  }
  function refreshProbeList() {
    const el = $("probeList");
    if (!el) return;
    if (!probes.length) { el.innerHTML = "<div class='hintText'>尚无探针 — 开启投放模式, 或发射霍曼转移。</div>"; return; }
    el.innerHTML = probes.map((p) =>
      `<div class="probeRow"><span class="pdot" style="background:#${p.color.getHexString()}"></span>` +
      `<span class="pname">${p.name}</span><span class="pinfo">${p.result || probeOrbitText(p)}</span>` +
      `<button class="pdel" data-id="${p.id}">✕</button></div>`).join("");
    for (const b of el.querySelectorAll(".pdel")) {
      b.addEventListener("click", () => {
        const p = probes.find((q) => q.id === Number(b.dataset.id));
        if (p) removeProbe(p);
      });
    }
  }

  if (typeof window !== "undefined") window.__sbx = {
    launchProbe, probes, stepProbes, sandboxAccel, planetStateKm, phaseAngleDeg,
    nextHohmannWindow, launchHohmann, clearProbes, hohmannPlan,
    setJd: (v) => { jd = v; }, getJd: () => jd, _gm: SBX_GM
  };

  /* ---------------- 太阳系全景雷达(军用风: 扫描线/余辉/对数距离环) ---------------- */
  const RADAR = { on: true, full: false, size: 240, sweep: 0, glow: {}, static: null, hover: null };
  const RADAR_RMAX = 55, RADAR_RIN = 0.35;
  function radarR(au, R) { return R * Math.log(1 + au / RADAR_RIN) / Math.log(1 + RADAR_RMAX / RADAR_RIN); }
  const _rxy = [0, 0, 0, 0];
  function radarXY(km, cx2, cy2, R) {
    const au = Math.hypot(km[0], km[1]) / AU_KM;
    const rp = Math.min(radarR(au, R), R * 1.0);
    const a = Math.atan2(km[1], km[0]);
    _rxy[0] = cx2 + Math.cos(a) * rp;
    _rxy[1] = cy2 - Math.sin(a) * rp;
    _rxy[2] = a;
    _rxy[3] = au;
    return _rxy;
  }
  function radarBuildStatic() {
    const cv = document.createElement("canvas");
    const S = RADAR.size;
    const DPRs = RADAR.dpr || 1;
    cv.width = cv.height = Math.round(S * DPRs);
    const g = cv.getContext("2d");
    if (!g || !g.beginPath) return cv;
    if (g.setTransform) g.setTransform(DPRs, 0, 0, DPRs, 0, 0);
    const cx2 = S / 2, cy2 = S / 2, R = S / 2 - 8;
    // 深空底: 中心蓝紫星云染色 + 边缘渐晕
    let ng = g.createRadialGradient(cx2 * 0.85, cy2 * 0.8, 0, cx2, cy2, R * 1.15);
    ng.addColorStop(0, "rgba(58,72,140,0.28)");
    ng.addColorStop(0.55, "rgba(38,32,84,0.16)");
    ng.addColorStop(1, "rgba(4,7,16,0)");
    g.fillStyle = ng;
    g.fillRect(0, 0, S, S);
    // 星尘
    let sd = 7;
    const rnd2 = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
    for (let i = 0; i < Math.round(S * 0.55); i += 1) {
      const a = rnd2() * Math.PI * 2, rr = Math.sqrt(rnd2()) * R;
      const b = 0.12 + rnd2() * 0.4;
      g.fillStyle = rnd2() < 0.3 ? `rgba(255,232,190,${b})` : `rgba(190,208,255,${b})`;
      g.fillRect(cx2 + Math.cos(a) * rr, cy2 - Math.sin(a) * rr, 1, 1);
    }
    // 小行星带 / 柯伊伯带 环带
    for (const [a0, a1, al] of [[2.06, 3.3, 0.07], [30, 50, 0.05]]) {
      const r0 = radarR(a0, R), r1 = radarR(a1, R);
      g.beginPath();
      g.arc(cx2, cy2, (r0 + r1) / 2, 0, Math.PI * 2);
      g.strokeStyle = `rgba(150,190,230,${al})`;
      g.lineWidth = r1 - r0;
      g.stroke();
    }
    // 距离环 + 标注
    g.lineWidth = 1;
    g.font = "8px sans-serif";
    for (const au of [1, 5.2, 9.5, 19.2, 30]) {
      g.beginPath();
      g.arc(cx2, cy2, radarR(au, R), 0, Math.PI * 2);
      g.strokeStyle = "rgba(146,175,255,0.14)";
      g.stroke();
      g.fillStyle = "rgba(146,175,255,0.4)";
      g.fillText(au >= 5 ? `${Math.round(au)}` : `${au}AU`, cx2 + radarR(au, R) * 0.7071 + 2, cy2 - radarR(au, R) * 0.7071 - 2);
    }
    // 方位刻度(黄经, 春分向右)
    for (let d = 0; d < 360; d += 30) {
      const a = d * D2R;
      g.beginPath();
      g.moveTo(cx2 + Math.cos(a) * (R - 4), cy2 - Math.sin(a) * (R - 4));
      g.lineTo(cx2 + Math.cos(a) * R, cy2 - Math.sin(a) * R);
      g.strokeStyle = "rgba(146,175,255,0.35)";
      g.stroke();
    }
    g.fillStyle = "rgba(146,175,255,0.5)";
    g.fillText("♈0°", cx2 + R - 18, cy2 - 4);
    return cv;
  }
  let _rbCache = null, _rbSig = "";
  let probeGen = 0;
  function radarBodies() {
    const sig = `${probes.length}|${probeGen}|${SPACECRAFT.filter((c) => jd >= c.launchJd).length}`;
    if (_rbCache && sig === _rbSig) return _rbCache;
    _rbSig = sig;
    const list = [];
    for (const b of bodies) {
      if (!b.orbit_j2000) continue;
      list.push([b.name, worldKm[b.name], ACCENT[b.name] || "#cfe0ff", "dot"]);
    }
    for (const c of COMETS) list.push([c.name, worldKm[c.name], c.accent, "dia"]);
    for (const c of SPACECRAFT) if (jd >= c.launchJd) list.push([c.name, worldKm[c.name], c.color, "sq"]);
    for (const p of probes) {
      if (!p.colStr) p.colStr = `#${p.color.getHexString ? p.color.getHexString() : "7ce0ff"}`;
      list.push([p.name, p.r, p.colStr, "dot"]);
    }
    _rbCache = list;
    return list;
  }
  function updateRadar(dt) {
    const wrap = $("radarWrap");
    if (!RADAR.on) { wrap.classList.add("hidden"); return; }
    wrap.classList.remove("hidden");
    const cv = $("radarCv");
    const S = RADAR.full ? Math.min(Math.floor(Math.min(window.innerWidth * 0.92, window.innerHeight * 0.8)), 900) : 240;
    const DPR3 = Math.min(window.devicePixelRatio || 1, 2);
    if (S !== RADAR.size || RADAR.dpr !== DPR3 || !RADAR.static) {
      RADAR.size = S;
      RADAR.dpr = DPR3;
      cv.width = cv.height = Math.round(S * DPR3);
      cv.style.width = cv.style.height = `${S}px`;
      RADAR.static = radarBuildStatic();
    }
    const g = cv.getContext("2d");
    if (!g || !g.drawImage) return;
    if (g.setTransform) g.setTransform(DPR3, 0, 0, DPR3, 0, 0);
    const cx2 = S / 2, cy2 = S / 2, R = S / 2 - 8;
    g.clearRect(0, 0, S, S);
    /* —— 剧场任务视图: 发射剖面(高度 × 射程 + 分离事件 + 当前位置)—— 阶段38 用户需求 */
    if (LNCH.state !== "off" && LNCH.state !== "load" && LNCH.table && g.beginPath) {
      const tb = LNCH.table, last2 = tb[tb.length - 1];
      const mD = Math.max(last2.dr, 1), mH = Math.max(last2.h * 1.15, 1);
      const X = (d2) => 12 + (d2 / mD) * (S - 24);
      const Y = (h2) => S - 16 - (h2 / mH) * (S - 46);
      g.strokeStyle = "rgba(140,170,220,.25)";
      g.lineWidth = 1;
      g.strokeRect(12, 30, S - 24, S - 46);
      g.fillStyle = "rgba(200,220,250,.85)";
      g.font = "10px system-ui";
      g.fillText(`发射剖面 · ${LNCH.cfg ? LNCH.cfg.cn : ""}`, 12, 14);
      g.fillStyle = "rgba(160,185,225,.6)";
      g.fillText(`射程 ${(mD / 1000).toFixed(0)} km`, S - 74, S - 4);
      g.fillText(`高 ${(mH / 1000).toFixed(0)} km`, 12, 27);
      g.strokeStyle = "rgba(120,200,255,.7)";
      g.lineWidth = 1.6;
      g.beginPath();
      for (let i2 = 0; i2 < tb.length; i2 += 2) {
        const p2 = tb[i2];
        if (i2 === 0) g.moveTo(X(p2.dr), Y(p2.h)); else g.lineTo(X(p2.dr), Y(p2.h));
      }
      g.stroke();
      if (LNCH.cfg && LNCH.cfg.events) {
        g.fillStyle = "rgba(255,210,140,.9)";
        for (const ev2 of LNCH.cfg.events) {
          let bi2 = 0;
          while (bi2 < tb.length - 1 && tb[bi2].t < ev2.t) bi2 += 1;
          g.beginPath();
          g.arc(X(tb[bi2].dr), Y(tb[bi2].h), 2.4, 0, Math.PI * 2);
          g.fill();
        }
      }
      const q2 = { h: 0, dr: 0 };
      lnchTableAt(Math.min(LNCH.t, last2.t), q2);
      g.fillStyle = "#9fe8d8";
      g.beginPath();
      g.arc(X(q2.dr), Y(q2.h), 3.6, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(159,232,216,.5)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(X(q2.dr), Y(q2.h));
      g.lineTo(X(q2.dr), S - 16);
      g.stroke();
      g.fillStyle = "rgba(200,220,250,.8)";
      g.fillText(`T+${Math.max(LNCH.t, 0).toFixed(0)}s  h=${(q2.h / 1000).toFixed(1)}km  dr=${(q2.dr / 1000).toFixed(0)}km`, 12, S - 4);
      return;
    }
    g.drawImage(RADAR.static, 0, 0, S, S);
    // 扫描线 + 余辉扇区
    RADAR.sweep = (RADAR.sweep + dt * 0.9) % (Math.PI * 2);
    const grad = g.createConicGradient ? null : null;
    for (let i = 0; i < 26; i += 1) {
      const a = RADAR.sweep - i * 0.017;
      g.beginPath();
      g.moveTo(cx2, cy2);
      g.lineTo(cx2 + Math.cos(a) * R, cy2 - Math.sin(a) * R);
      g.strokeStyle = `rgba(159,123,255,${0.11 * (1 - i / 26)})`;
      g.lineWidth = i ? 2 : 1.2;
      g.stroke();
    }
    // 行星轨道圈(压缩后的当前半径近似圆, 每 90 帧重估)
    g.lineWidth = 1;
    for (const b of planetBodies) {
      const au = Math.hypot(worldKm[b.name][0], worldKm[b.name][1]) / AU_KM;
      g.beginPath();
      g.arc(cx2, cy2, radarR(au, R), 0, Math.PI * 2);
      g.strokeStyle = "rgba(160,190,235,0.10)";
      g.stroke();
    }
    // 航天器尾迹(取真实历史采样抽稀)
    for (const c of SPACECRAFT) {
      if (jd < c.launchJd || !c.d) continue;
      g.beginPath();
      let started = false;
      for (let i = 0; i < c.d.length / 7; i += 6) {
        if (c.d[i * 7] > jd) break;
        const [x, y] = radarXY([c.d[i * 7 + 1], c.d[i * 7 + 2]], cx2, cy2, R);
        if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
      }
      g.strokeStyle = c.color + "55";
      g.stroke();
    }
    // 探针尾迹
    for (const p of probes) {
      if (p.trailN < 2) continue;
      g.beginPath();
      for (let i = 0; i < p.trailN; i += 4) {
        const [x, y] = radarXY([p.trail[i * 3], p.trail[i * 3 + 1]], cx2, cy2, R);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      if (!p.colStr66) p.colStr66 = `#${p.color.getHexString ? p.color.getHexString() : "7ce0ff"}66`;
      g.strokeStyle = p.colStr66;
      g.stroke();
    }
    // 天体 + 扫描余辉高亮
    g.textAlign = "left";
    g.font = `600 ${RADAR.full ? 11.5 : 9.5}px 'PingFang SC','Microsoft YaHei',sans-serif`;
    const SMALL_LABELS = { Sun: 1, Earth: 1, Mars: 1, Jupiter: 1, Saturn: 1 };
    // 太阳
    g.beginPath();
    g.arc(cx2, cy2, 3.2, 0, Math.PI * 2);
    g.fillStyle = "#ffd27a";
    g.fill();
    for (const [name, km, col, shape] of radarBodies()) {
      if (!km) continue;
      const [x, y, ang, au] = radarXY(km, cx2, cy2, R);
      let dAng = Math.abs(((RADAR.sweep - ang) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      if (dAng < 0.05) RADAR.glow[name] = 1;
      const gl = RADAR.glow[name] = (RADAR.glow[name] || 0) * 0.965;
      if (gl > 0.03) {
        g.beginPath();
        g.arc(x, y, 6 + gl * 5, 0, Math.PI * 2);
        g.fillStyle = `rgba(146,175,255,${gl * 0.3})`;
        g.fill();
      }
      g.fillStyle = col;
      if (shape === "sq") g.fillRect(x - 2.4, y - 2.4, 4.8, 4.8);
      else if (shape === "dia") {
        g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-2.3, -2.3, 4.6, 4.6); g.restore();
      } else {
        g.beginPath(); g.arc(x, y, name === selectedName ? 3.4 : 2.4, 0, Math.PI * 2); g.fill();
      }
      if (name === selectedName) {
        g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2);
        g.strokeStyle = "#ffffffaa"; g.stroke();
      }
      if (RADAR.full || SMALL_LABELS[name] || name === selectedName) {
        g.fillStyle = "rgba(220,232,250,0.8)";
        g.fillText(CN[name] || name, x + 5, y + 3);
        g.fillStyle = col;
      }
    }
  }
  function radarPick(px, py) {
    const cv = $("radarCv");
    const rect = cv.getBoundingClientRect();
    const S = RADAR.size, cx2 = S / 2, cy2 = S / 2, R = S / 2 - 8;
    const mx = (px - rect.left) * (S / rect.width), my = (py - rect.top) * (S / rect.height);
    let best = null, bd = 14 * 14;
    for (const [name, km] of radarBodies()) {
      if (!km) continue;
      const [x, y, , au] = radarXY(km, cx2, cy2, R);
      const dd = (x - mx) ** 2 + (y - my) ** 2;
      if (dd < bd) { bd = dd; best = [name, au]; }
    }
    return best;
  }

  /* ================= 阶段29/30 · 发射剧场: 多火箭注册表 =================
   * 配置驱动: 物理(分级推质/俯仰程序/制导关机)、分离编排、羽流相位、时间压缩、发射场全参数化。
   * 长征五号(文昌·带场地GLB) / 泰坦IIIE-半人马(LC-41·旅行者史实座驾) / 土星五号(LC-39A·阿波罗11)。 */
  const ROCKETS = {
    cz5: {
      cn: "长征五号", glbKey: "CZ5_GLB", file: "cz5_glb.js", hasSite: true, satDrift: true,
      site: { lat: 19.6145, lon: 110.9510 }, az: 52.6, twr: [1.15, 1.35], inc: 41.5,
      phys: { m0: 849e3, targetVrot: 7480, tEnd: 552,
        stages: [
          { t0: 0, t1: 173, Fsl: 9593e3, Fvac: 10716e3, mdot: 3283.24, drop: 48e3 },
          { t0: 0, t1: 540, Fsl: 1020e3, Fvac: 1400e3, mdot: 325.93, drop: 0 }
        ],
        jett: [{ t: 227, m: 3e3 }],
        pitch: [[0, 90], [12, 90], [100, 35], [173, 11.5], [540, 0.05]] },
      events: [
        { t: 173, parts: ["booster1", "booster2", "booster3", "booster4"], mode: "radial", label: "助推器分离" },
        { t: 227, parts: ["fairing"], mode: "up", label: "整流罩分离 · 载荷见光", reveal: true }
      ],
      plume: [{ t0: 0, t1: 173, y: 1.6, s: 1.0, col: 0xffa040 }, { t0: 173, t1: 540, y: 1.6, s: 0.8, col: 0xd8e6ff }],
      tc: [[20, 4], [165, 12], [230, 8], [1e9, 16]] },
    titan3e: {
      cn: "泰坦IIIE·半人马", glbKey: "T3E_GLB", file: "t3e_glb.js",
      site: { lat: 28.5833, lon: -80.5831 }, az: 93, twr: [1.5, 1.9], inc: 28.7,
      phys: { m0: 632970, targetVrot: 7390, tEnd: 780,
        stages: [
          { t0: 0, t1: 115, Fsl: 10.6e6, Fvac: 11.2e6, mdot: 3346.7, drop: 67596, taper: 0.42 },
          { t0: 112, t1: 258, Fsl: 1.94e6, Fvac: 2.34e6, mdot: 773.97, drop: 6000 },
          { t0: 258, t1: 468, Fsl: 4.58e5, Fvac: 4.58e5, mdot: 135.3, drop: 2653, dropT: 486 },
          { t0: 496, t1: 780, Fsl: 1.334e5, Fvac: 1.334e5, mdot: 30.6, drop: 0 }
        ],
        jett: [{ t: 269, m: 4000 }],
        pitch: [[0, 90], [10, 90], [75, 40], [120, 24], [258, 9], [468, 2], [780, 0]] },
      events: [
        { t: 124, parts: ["booster1", "booster2"], mode: "radial", label: "固体助推抛离" },
        { t: 258, parts: ["core_stage1"], mode: "back", label: "芯一级分离(热分级)" },
        { t: 269, parts: ["fairing"], mode: "up", label: "抛整流罩 · 半人马见光", reveal: true },
        { t: 486, parts: ["core_stage2"], mode: "back", label: "泰坦/半人马分离 · RL10 点火" }
      ],
      plume: [
        { t0: 0, t1: 115, y: 0.4, s: 1.5, col: 0xe8c8a0 }, { t0: 112, t1: 258, y: 0.8, s: 0.8, col: 0xd9925a },
        { t0: 258, t1: 468, y: 22.9, s: 0.6, col: 0xd9925a }, { t0: 496, t1: 1e9, y: 32.9, s: 0.45, col: 0xcfe0ff }
      ],
      tc: [[18, 4], [110, 10], [280, 8], [500, 14], [1e9, 16]] },
    saturn5: {
      cn: "土星五号", glbKey: "S5_GLB", file: "s5_glb.js",
      site: { lat: 28.6083, lon: -80.6044 }, az: 72.058, twr: [1.08, 1.28], inc: 33.0,
      phys: { m0: 2938315, targetVrot: 7395, tEnd: 900,
        stages: [
          { t0: 0, t1: 161.6, Fsl: 33.7e6, Fvac: 38.7e6, mdot: 13278, drop: 130400 },
          { t0: 166, t1: 550, Fsl: 5.1e6, Fvac: 5.1e6, mdot: 1154, drop: 39900 },
          { t0: 554, t1: 900, Fsl: 1.03e6, Fvac: 1.03e6, mdot: 247.6, drop: 0 }
        ],
        jett: [{ t: 192.3, m: 5200 }, { t: 197.9, m: 4040 }],
        pitch: [[0, 90], [13, 90], [83, 56], [161, 34], [300, 15], [550, 4], [900, 0]] },
      events: [
        { t: 161.6, parts: ["core_stage1"], mode: "back", label: "S-IC 一级分离" },
        { t: 192.3, parts: ["interstage"], mode: "back", label: "级间环抛离" },
        { t: 197.9, parts: ["fairing"], mode: "up", label: "逃逸塔抛弃" },
        { t: 550, parts: ["core_stage2"], mode: "back", label: "S-II 二级分离 · S-IVB 点火" }
      ],
      plume: [
        { t0: 0, t1: 161.6, y: 0.2, s: 2.3, col: 0xffa040 }, { t0: 166, t1: 550, y: 44, s: 1.0, col: 0xcfe0ff },
        { t0: 554, t1: 1e9, y: 71, s: 0.7, col: 0xcfe0ff }
      ],
      tc: [[25, 4], [155, 13], [230, 8], [545, 16], [1e9, 18]] },
    falcon9: {
      cn: "猎鹰9号", glbKey: "F9_GLB", file: "f9_glb.js",
      site: { lat: 28.56194, lon: -80.57722 }, az: 90, twr: [1.3, 1.52], inc: 28.5, satDrift: true,
      phys: { m0: 549054, targetVrot: 7420, tEnd: 560,
        stages: [
          { t0: 0, t1: 132, Fsl: 7607e3, Fvac: 8227e3, mdot: 2442, drop: 101000 },
          { t0: 136, t1: 560, Fsl: 934e3, Fvac: 934e3, mdot: 273.6, drop: 0 }
        ],
        jett: [{ t: 178, m: 1900 }],
        pitch: [[0, 90], [10, 90], [70, 48], [132, 30], [510, 1], [560, 0]] },
      events: [
        { t: 132, parts: ["core_stage1"], mode: "back", label: "一级分离 · 开始返航" },
        { t: 178, parts: ["fairing"], mode: "up", label: "抛整流罩", reveal: true }
      ],
      plume: [{ t0: 0, t1: 132, y: 0.4, s: 1.2, col: 0xffa040 }, { t0: 136, t1: 1e9, y: 47.3, s: 0.55, col: 0xffb060 }],
      booster: { sepT: 132, lzDr: -3200, opts: { gp: 2700 } },
      tc: [[20, 4], [125, 12], [200, 8], [1e9, 14]] },
    n1: {
      cn: "N1 登月火箭", glbKey: "N1_GLB", file: "n1_glb.js",
      site: { lat: 45.9647, lon: 63.3049 }, az: 62.7, twr: [1.5, 1.8], inc: 51.8, satDrift: true,
      failT: 68.7, failLabel: "T+68.7 · KORD 切断全部三十台发动机", failElegy: "史实四射四败, N1 从未入轨。但没有它, 就没有后来的一切 —— 献给所有未竟之志。",
      phys: { m0: 2750e3, targetVrot: 7640, tEnd: 620, cutAfter: 245,
        stages: [
          { t0: 0, t1: 120, Fsl: 45e6, Fvac: 49e6, mdot: 15450, drop: 180800, taper: 0.25 },
          { t0: 120, t1: 230, Fsl: 14.04e6, Fvac: 14.04e6, mdot: 4325, drop: 52200 },
          { t0: 234, t1: 620, Fsl: 4.05e6, Fvac: 4.05e6, mdot: 1274, drop: 0 }
        ],
        jett: [{ t: 140, m: 5500 }],
        pitch: [[0, 90], [8, 90], [60, 44], [120, 22], [230, 6], [320, 0.3], [620, 0]] },
      events: [
        { t: 120, parts: ["core_stage1"], mode: "back", label: "Block A 热分级" },
        { t: 140, parts: ["fairing"], mode: "up", label: "抛逃逸塔与整流罩", reveal: true },
        { t: 230, parts: ["core_stage2"], mode: "back", label: "Block B 分离" }
      ],
      plume: [{ t0: 0, t1: 120, y: 0.3, s: 2.4, col: 0xffa040 }, { t0: 120, t1: 230, y: 30, s: 1.0, col: 0xffa040 }, { t0: 234, t1: 1e9, y: 50.5, s: 0.6, col: 0xffb060 }],
      tc: [[18, 4], [115, 12], [245, 8], [1e9, 15]] },
    exp1: {
      cn: "远征者一号", glbKey: "EXP1_GLB", file: "exp1_glb.js",
      site: { lat: 19.62, lon: 110.96 }, az: 95, twr: [1.35, 1.65], inc: 19.7, satDrift: true,
      phys: { m0: 420e3, targetVrot: 7405, tEnd: 520,
        stages: [
          { t0: 0, t1: 150, Fsl: 6.2e6, Fvac: 6.9e6, mdot: 1933, drop: 18e3 },
          { t0: 154, t1: 505, Fsl: 1.05e6, Fvac: 1.05e6, mdot: 250, drop: 0 }
        ],
        jett: [{ t: 185, m: 2000 }],
        pitch: [[0, 90], [10, 90], [75, 42], [150, 16], [505, 0.5], [520, 0]] },
      events: [
        { t: 150, parts: ["core_stage1"], mode: "back", label: "一级分离" },
        { t: 185, parts: ["fairing"], mode: "up", label: "抛整流罩", reveal: true }
      ],
      plume: [{ t0: 0, t1: 150, y: 0.3, s: 1.1, col: 0xaef0e8 }, { t0: 154, t1: 1e9, y: 34, s: 0.5, col: 0xaef0e8 }],
      tc: [[18, 4], [145, 12], [200, 8], [1e9, 14]] },
    starship: {
      cn: "星舰", glbKey: "SS_GLB", file: "ss_glb.js",
      site: { lat: 25.9972, lon: -97.1560 }, az: 93, twr: [1.4, 1.62], inc: 26.2,
      phys: { m0: 5175e3, targetVrot: 7420, tEnd: 560,
        stages: [
          { t0: 0, t1: 100, Fsl: 74.4e6, Fvac: 76e6, mdot: 21384, drop: 0 },
          { t0: 100, t1: 159, Fsl: 45e6, Fvac: 46e6, mdot: 13000, drop: 770e3 },   // 节流段(真实 throttle bucket)
          { t0: 163, t1: 560, Fsl: 14.2e6, Fvac: 14.2e6, mdot: 3810, drop: 0 }
        ],
        jett: [],
        pitch: [[0, 90], [12, 90], [75, 66], [159, 47], [320, 4], [478, 0.5], [560, 0]] },
      events: [
        { t: 159, parts: ["core_stage1"], mode: "back", label: "热分级 · 超重开始返航" }
      ],
      booster: { sepT: 159, lzDr: 18, catchH: 62,
        opts: { FE: 2.3e6, MD: 620, dry: 275e3, prop: 440e3, bbN: 13, enN: 13, bbFloor: 190e3, enFloor: 95e3, CdA: 500, catchH: 62, os: 0.75, ldMax: 13, gH: 48000, gp: 1050, gd: 14, gLim: 10, gK: 0.9, p4: 0.006, p4h: 200, p4L: 12 } },
      plume: [{ t0: 0, t1: 159, y: 0.4, s: 2.6, col: 0xb9d0ff }, { t0: 163, t1: 1e9, y: 69, s: 1.0, col: 0xb9d0ff }],
      tc: [[22, 4], [152, 12], [230, 8], [1e9, 15]] }
  };
  const LNCH = {
    state: "off", t: 0, wall: 0, rk: "cz5", cfg: null, builtMap: {},
    W: null, rocket: null, parts: null, plume: null, plumeCore: null, smoke: null, dome: null, ground: null, sat: null,
    table: null, sep: {}, evFired: [], skipReq: false, savedNear: 0.05, hist: false, chain: null,
    lat: 19.6145, lon: 110.9510, incAz: 52.6 * Math.PI / 180, axis: [0, 0, 1]
  };
  /* ---------------- 发射场常驻地标: 七站信标 + 标签 + 点击进剧场 ---------------- */
  const SITES = [
    { id: "cz5", row: 0, nm: "site_cz5", cn: "文昌航天发射场", lat: 19.6145, lon: 110.9510 },
    { id: "titan3e", row: 0, nm: "site_t3e", cn: "卡纳维拉尔 LC-41", lat: 28.5833, lon: -80.5831 },
    { id: "saturn5", row: 1, nm: "site_s5", cn: "肯尼迪 LC-39A", lat: 28.6083, lon: -80.6044 },
    { id: "falcon9", row: 2, nm: "site_f9", cn: "卡纳维拉尔 SLC-40", lat: 28.56194, lon: -80.57722 },
    { id: "n1", row: 0, nm: "site_n1", cn: "拜科努尔 110 工位", lat: 45.9647, lon: 63.3049 },
    { id: "starship", row: 0, nm: "site_ss", cn: "星舰基地 Starbase", lat: 25.9972, lon: -97.1560 },
    { id: "exp1", row: 1, nm: "site_x", cn: "文昌二号工位", lat: 19.62, lon: 110.96 }
  ];
  let siteBeacons = null;
  function buildSiteBeacons() {
    siteBeacons = [];
    for (const st of SITES) {
      CN[st.nm] = st.cn;
      ACCENT[st.nm] = "#9fe8d8";
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeProbeTexture(), color: 0x9fe8d8, transparent: true, opacity: 0.8,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: false
      }));
      spr.scale.set(0.012, 0.012, 1);
      spr.frustumCulled = false;
      spr.renderOrder = 4;
      spr.visible = false;
      scene.add(spr);
      const pick = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, depthWrite: false, depthTest: false, colorWrite: false
      }));
      pick.userData.bodyName = st.nm;
      pick.visible = false;
      scene.add(pick);
      pickMeshes.push(pick);
      const label = makeLabel(st.nm);
      labels2D[labels2D.length - 1].dy = (st.row || 0) * 13;   // 相邻站屏幕错行(文昌双站/卡角三站, 显式行号)
      label.scale.set(0.06, 0.015, 1);
      label.visible = false;
      scene.add(label);
      labels[st.nm] = label;
      siteBeacons.push({ idx: siteBeacons.length, st, spr, pick, label });
    }
  }
  const _sbD = [0, 0, 0, 0, 0, 1];
  function updateSiteBeacons() {
    if (!siteBeacons) return;
    const eS = scenePos.Earth;
    const Rbu = 6371 / SCALE.sceneUnitKm;
    let camD = 1e18;
    if (eS) camD = Math.hypot(camera.position.x - eS[0], camera.position.y - eS[1], camera.position.z - eS[2]);
    const near = eS ? clamp((Rbu * 60 - camD) / (Rbu * 40), 0, 1) : 0;
    const show = eS && scaleBlend < 0.3 && star3DBlend < 0.4 && LNCH.state === "off" && near > 0.02;
    const showLb = show && document.getElementById("tglLabels").checked;
    for (const b of siteBeacons) {
      if (!show) { b.spr.visible = false; b.label.visible = false; b.pick.visible = false; continue; }
      geoDirEcl(b.st.lat, b.st.lon, _sbD);
      const cx = (camera.position.x - eS[0]) / camD, cy = (camera.position.y - eS[1]) / camD, cz = (camera.position.z - eS[2]) / camD;
      /* 几何地平线: 有限视距下站点可见 ⇔ dot > R/camD(否则贴轮廓后侧的站会穿透地球显示) */
      const front = (_sbD[0] * cx + _sbD[1] * cy + _sbD[2] * cz) > Math.max(Rbu / camD * 0.98, 0.02);
      b.spr.visible = front;
      b.label.visible = front && showLb;
      b.pick.visible = front;
      if (!front) continue;
      b.spr.position.set(eS[0] + _sbD[0] * Rbu * 1.004, eS[1] + _sbD[1] * Rbu * 1.004, eS[2] + _sbD[2] * Rbu * 1.004);
      b.pick.position.copy(b.spr.position);
      b.pick.scale.setScalar(Rbu * 0.06);
      b.label.position.set(eS[0] + _sbD[0] * Rbu * 1.06, eS[1] + _sbD[1] * Rbu * 1.06, eS[2] + _sbD[2] * Rbu * 1.06);
      b.spr.material.opacity = 0.3 + 0.6 * near;
      b.label.material.opacity = 0.85 * near;
    }
  }
  /* ---------------- 阿波罗任务链: 停泊轨道(解析二体) → TLI 奔月 → 抵月深链月面 ----------------
   * 工程注记: N 体积分器步长下限 30s 为行际巡航设计, LEO 多圈停泊会数值发散;
   * 停泊轨道本就是二体问题 → 解析圆轨精确推进(每帧直写 p.r/p.v/p.jd, 积分器零 gap 自动让位),
   * TLI 点火后才交给 N 体。月球引力未单独建模(地月合并 GM), 抵月判据为几何交会 <6.6 万 km(≈影响球)。 */
  const APOLLO = { on: false, p: null, state: "", minMoon: 1e12, kep: null };
  const _tliT = [0, 0, 0], _apE = [0, 0, 0], _apEv = [0, 0, 0], _apM = [0, 0, 0];
  function earthStateKm(jdX, outR, outV) {   // 与渲染同源: EMB − μ·月矢量; 速度=中心差分
    const e1 = heliocentricKm(bodyByName.Earth.orbit_j2000, jdX + 0.005);
    const e0 = heliocentricKm(bodyByName.Earth.orbit_j2000, jdX - 0.005);
    moonGeoKm(jdX, _apM);
    const eC = heliocentricKm(bodyByName.Earth.orbit_j2000, jdX);
    outR[0] = eC[0] - _apM[0] * MU_MOON; outR[1] = eC[1] - _apM[1] * MU_MOON; outR[2] = eC[2] - _apM[2] * MU_MOON;
    outV[0] = (e1[0] - e0[0]) / 864; outV[1] = (e1[1] - e0[1]) / 864; outV[2] = (e1[2] - e0[2]) / 864;
  }
  function tliTofA(rp, aT, rm) {   // 椭圆从近地点到月球轨道半径的飞行时间(秒)
    const MU = 398600.4418, RM = rm || 384400;
    const e = 1 - rp / aT;
    const cosE = clamp((1 - RM / aT) / e, -1, 1);
    const E = Math.acos(cosE);
    return (E - e * Math.sin(E)) * Math.sqrt(aT * aT * aT / MU);
  }
  function tliSolve(rp, rm) {   // 求 aT 使近地点→月球真距飞行时间 ≈ 3.05 天(TOF 随 aT 单调递减)
    let lo = ((rm || 384400) + rp) / 2 * 1.0005, hi = 2.5e6;   // 下界: 远地点须够到月距
    for (let i = 0; i < 40; i += 1) {
      const mid = (lo + hi) / 2;
      if (tliTofA(rp, mid, rm) > 3.05 * 86400) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  function apolloStart(p) {   // 交棒时以当帧探针态建立解析停泊轨道基
    earthStateKm(jd, _apE, _apEv);
    const rx = p.r[0] - _apE[0], ry = p.r[1] - _apE[1], rz = p.r[2] - _apE[2];
    const R = Math.hypot(rx, ry, rz);
    const e1 = [rx / R, ry / R, rz / R];
    let vx = p.v[0] - _apEv[0], vy = p.v[1] - _apEv[1], vz = p.v[2] - _apEv[2];
    const dot = vx * e1[0] + vy * e1[1] + vz * e1[2];
    vx -= dot * e1[0]; vy -= dot * e1[1]; vz -= dot * e1[2];   // 去径向: 近圆化
    /* 发射窗口物理: 史实 TLI 窗口 = 停泊轨道面含点火后 3.05 天的月球位置。
     * 剧场入轨面由 ERA+方位角近似史实, 此处将面精确旋齐目标(等效于窗口微调), 出面误差归零 */
    moonGeoKm(jd + 3.05, _tliT);
    const mdot = _tliT[0] * e1[0] + _tliT[1] * e1[1] + _tliT[2] * e1[2];
    let wx = _tliT[0] - mdot * e1[0], wy = _tliT[1] - mdot * e1[1], wz = _tliT[2] - mdot * e1[2];
    const wl = Math.hypot(wx, wy, wz);
    if (wl > 1e4 && (wx * vx + wy * vy + wz * vz) !== 0) {   // 非退化: 用含月面基替代
      if (wx * vx + wy * vy + wz * vz < 0) { wx = -wx; wy = -wy; wz = -wz; }   // 保顺行
      vx = wx; vy = wy; vz = wz;
    }
    const vT = Math.hypot(vx, vy, vz) || 1;
    APOLLO.on = true; APOLLO.p = p; APOLLO.state = "coast"; APOLLO.minMoon = 1e12;
    APOLLO.kep = { jd0: jd, R, w: Math.sqrt(398600.4418 / (R * R * R)), e1, e2: [vx / vT, vy / vT, vz / vT] };
  }
  function tickApollo() {
    if (!APOLLO.on || !APOLLO.p) return;
    const p = APOLLO.p;
    if (probes.indexOf(p) < 0) { APOLLO.on = false; return; }
    if (APOLLO.state === "coast") {
      const K = APOLLO.kep;
      earthStateKm(jd, _apE, _apEv);
      const th = K.w * (jd - K.jd0) * 86400;
      const c = Math.cos(th), sn = Math.sin(th);
      const vC = K.w * K.R;   // 圆轨速度 km/s
      const ex = c * K.e1[0] + sn * K.e2[0], ey = c * K.e1[1] + sn * K.e2[1], ez = c * K.e1[2] + sn * K.e2[2];
      const tx = -sn * K.e1[0] + c * K.e2[0], ty = -sn * K.e1[1] + c * K.e2[1], tz = -sn * K.e1[2] + c * K.e2[2];
      p.r[0] = _apE[0] + K.R * ex; p.r[1] = _apE[1] + K.R * ey; p.r[2] = _apE[2] + K.R * ez;
      p.v[0] = _apEv[0] + vC * tx; p.v[1] = _apEv[1] + vC * ty; p.v[2] = _apEv[2] + vC * tz;
      p.jd = jd;   // 积分器零 gap → 解析层独占推进
      moonGeoKm(jd + 3.05, _tliT);
      const tl = Math.hypot(_tliT[0], _tliT[1], _tliT[2]) || 1;
      // 面已含目标(apolloStart 窗口对齐) → 对跖判据即相位判据
      const cosR = (ex * _tliT[0] + ey * _tliT[1] + ez * _tliT[2]) / tl;
      if (cosR < -0.9945) {   // 探针位于未来月球对跖点 ±6° → 近地点点火, 远地点正打月球
        const aT = tliSolve(K.R, tl);
        const vNew = Math.sqrt(398600.4418 * (2 / K.R - 1 / aT));
        APOLLO.dv = vNew - vC;
        p.v[0] = _apEv[0] + vNew * tx; p.v[1] = _apEv[1] + vNew * ty; p.v[2] = _apEv[2] + vNew * tz;
        /* 转移椭圆根数: 近地点=点火点; 跨月段解析推进(月球引力未建, 二体椭圆即该模型的精确解) */
        APOLLO.ell = { jd0: jd, aT, e: 1 - K.R / aT, P: [ex, ey, ez], Q: [tx, ty, tz] };
        APOLLO.tliJd = jd;
        APOLLO.state = "cruise";
        sfxRumble();
        $("hohmannStatus").innerHTML = `TLI 奔月点火 · Δv ${APOLLO.dv.toFixed(2)} km/s · 跨月约 3 天 <button id="apSpdBtn">加速: 时/秒 ▶</button>`;
      }
    } else if (APOLLO.state === "cruise") {
      earthStateKm(jd, _apE, _apEv);
      const EL = APOLLO.ell;
      if (EL && jd >= EL.jd0) {
        const MU = 398600.4418;
        const n = Math.sqrt(MU / (EL.aT * EL.aT * EL.aT));
        const M = n * (jd - EL.jd0) * 86400;
        if (M < Math.PI * 1.9) {   // 远地点后不再解析(交还 N 体)
          let E = M;
          for (let it = 0; it < 12; it += 1) E = E - (E - EL.e * Math.sin(E) - M) / (1 - EL.e * Math.cos(E));
          const cE = Math.cos(E), sE = Math.sin(E);
          const rr = EL.aT * (1 - EL.e * cE);
          const b = EL.aT * Math.sqrt(1 - EL.e * EL.e);
          const xw = EL.aT * (cE - EL.e), yw = b * sE;
          const dE = n * EL.aT / rr;   // dE/dt · aT = 视半径速率因子
          const vxw = -EL.aT * sE * dE, vyw = b * cE * dE;
          p.r[0] = _apE[0] + xw * EL.P[0] + yw * EL.Q[0];
          p.r[1] = _apE[1] + xw * EL.P[1] + yw * EL.Q[1];
          p.r[2] = _apE[2] + xw * EL.P[2] + yw * EL.Q[2];
          p.v[0] = _apEv[0] + vxw * EL.P[0] + vyw * EL.Q[0];
          p.v[1] = _apEv[1] + vxw * EL.P[1] + vyw * EL.Q[1];
          p.v[2] = _apEv[2] + vxw * EL.P[2] + vyw * EL.Q[2];
          p.jd = jd;
        } else { APOLLO.ell = null; }   // 之后 N 体接管(远域步长安全)
      }
      moonGeoKm(jd, _apM);
      const mx = _apE[0] + _apM[0] * (1 - MU_MOON), my = _apE[1] + _apM[1] * (1 - MU_MOON), mz = _apE[2] + _apM[2] * (1 - MU_MOON);
      const d = Math.hypot(p.r[0] - mx, p.r[1] - my, p.r[2] - mz);
      if (d < APOLLO.minMoon) APOLLO.minMoon = d;
      if (d < 66000) {
        APOLLO.state = "arrived";
        APOLLO.on = false;
        award("apollo_moon");
        sfxChime();
        $("hohmannStatus").innerHTML = `抵达月球影响球 · 距月 ${(d / 1e4).toFixed(1)} 万 km <button id="apolloMoonBtn">降落静海 · 开月球车 →</button>`;
      } else if (jd - (APOLLO.tliJd || jd) > 2.5 && d > APOLLO.minMoon * 3 && APOLLO.minMoon < 4e5) {   // 时间闸: 设计 TOF 3.05d, 中途月球路过的假接近不判脱靶
        APOLLO.state = "missed";
        APOLLO.on = false;
        $("hohmannStatus").innerHTML = `掠月而过, 最近 ${(APOLLO.minMoon / 1e4).toFixed(1)} 万 km —— 史实靠中途修正收窄, 一击版差了口气`;
      }
    }
  }

  /* ---------------- 时间偶遇: 时间轴扫过历史发射 ±30 分钟 ---------------- */
  const ENC_EPOCHS = [
    { jd: 2457696.03, rocket: "cz5", label: "长征五号首飞正在文昌点火" },
    { jd: 2440419.064, rocket: "saturn5", apollo: true, label: "阿波罗11 正离开 LC-39A" },
    { jd: 2440273.888, rocket: "n1", historical: true, label: "N1 首飞 —— 68 秒后成为历史" },
    { jd: 2443376.10, rocket: "titan3e", chain: "Voyager2", label: "旅行者2号正离开 LC-41" },
    { jd: 2460597.02, rocket: "starship", label: "星舰第五飞 · 筷子首捕即将上演" }
  ];
  const encSeen = {};
  let encCur = null;
  function checkEncounter(force) {
    const eligible = force || (LNCH.state === "off" && !(typeof CINEMA !== "undefined" && CINEMA.on) && selectedName === "Earth");
    if (!eligible) {
      if (encCur) { encCur = null; $("encHint").classList.remove("show"); }
      return null;
    }
    for (const e of ENC_EPOCHS) {
      if (Math.abs(jd - e.jd) < 0.021 && !encSeen[e.jd]) {
        if (encCur !== e) {
          encCur = e;
          $("encText").textContent = `此刻: ${e.label}`;
          $("encHint").classList.add("show");
        }
        return e;
      }
    }
    if (encCur) { encCur = null; $("encHint").classList.remove("show"); }
    return null;
  }
  function ascentTable(ph) {
    // 参数化质点上升: 分级推质 + 高度推力插值 + 可选推力衰减(固推) + 离心减重 + 制导关机
    const R = 6371e3, g0 = 9.80665;
    let m = ph.m0, h = 0, v = 0, dr = 0, cut = false, tCut = 0;
    const out = [];
    const dt = 0.25;
    const drops = ph.stages.map((st) => ({ t: st.dropT || st.t1, m: st.drop || 0 })).concat(ph.jett || []);
    const done = drops.map(() => false);
    for (let t = 0; t <= ph.tEnd; t += dt) {
      for (let i = 0; i < drops.length; i += 1) {
        if (!done[i] && t >= drops[i].t) { m -= drops[i].m; done[i] = true; }
      }
      const k = clamp(h / 45000, 0, 1);
      let F = 0, md = 0;
      if (!cut) {
        for (const st of ph.stages) {
          if (t >= st.t0 && t < st.t1) {
            let f = lerp(st.Fsl, st.Fvac, k);
            if (st.taper) f *= 1 - st.taper * (t - st.t0) / (st.t1 - st.t0);
            F += f; md += st.mdot;
          }
        }
        if (t > (ph.cutAfter || ph.tEnd * 0.55) && v >= ph.targetVrot) { cut = true; tCut = t; F = 0; md = 0; }
      }
      const P = ph.pitch;
      let pitch = P[P.length - 1][1];
      for (let i = 0; i < P.length - 1; i += 1) {
        if (t >= P[i][0] && t <= P[i + 1][0]) { pitch = lerp(P[i][1], P[i + 1][1], (t - P[i][0]) / (P[i + 1][0] - P[i][0] || 1)); break; }
      }
      pitch *= D2R;
      const geff = Math.max(g0 * Math.pow(R / (R + h), 2) - Math.pow(v * Math.cos(pitch), 2) / (R + h), 0);
      v += (F / m - geff * Math.sin(pitch)) * dt;
      if (v < 0) v = 0;
      h += v * Math.sin(pitch) * dt;
      dr += v * Math.cos(pitch) * dt;
      m -= md * dt;
      if (Math.round(t / dt) % 4 === 0) out.push({ t, h, v, dr, pitch, m, F });
    }
    out.tCut = cut ? tCut : 0;
    return out;
  }
  function f9BoosterTable(ascTb, sepT, lzDr, opts) {
    const LZ = lzDr || -3200;
    const O = opts || {};
    const CATCH = O.catchH || 0;   // 捕获高度(星舰回塔被夹); 0 = 落地
    // 猎鹰9 一级 RTLS: 分离状态起算, 二维分量积分(下航程 x / 高度 y)
    // 阶段: 0滑行翻转 → 1返航点火(3机) → 2/25再入 → 3气动减速(栅格舵) → 4着陆点火(1机) → 5触地
    const g0 = 9.80665, R = 6371e3;
    const s0 = ascTb[clamp(Math.round(sepT), 0, ascTb.length - 1)];
    let h = s0.h, dr = s0.dr;
    let vx = s0.v * Math.cos(s0.pitch), vy = s0.v * Math.sin(s0.pitch);
    let m = (O.dry || 27600) + (O.prop || 55000);
    const FE1 = O.FE || 914e3, MD1 = O.MD || 293;
    const CdA = O.CdA || 13.8;
    const nBB = O.bbN || 3, nEN = O.enN || 3;
    const rows = [];
    let phase = 0, t = sepT, prop = O.prop || 55000;
    let touchdown = 0;
    let lastPush = -9;
    for (let i = 0; i < 11000 && !touchdown; i += 1) {
      const dt = phase >= 4 ? 0.0625 : 0.25;
      t += dt;
      let F = 0, ax = 0, ay = 0;
      const g = g0 * Math.pow(R / (R + h), 2);
      if (phase === 0 && t >= sepT + 12) phase = 1;
      if (phase === 1) {
        F = 3 * FE1;
        const need = -(dr / 171) * 1.5;   // 过冲补偿再入反推的水平损耗
        if (vx <= need || prop < 12500) { phase = 2; }
        else { ax = -F / m; m -= 3 * MD1 * dt; prop -= 3 * MD1 * dt; }
      }
      if (m < (O.dry || 27600)) m = (O.dry || 27600);
      if (prop < 0) prop = 0;
      if (phase === 2 && h < 54000 && vy < 0) phase = 25;
      if (phase === 25) {
        const vv = Math.hypot(vx, vy) || 1;
        if (prop > 6800 && vv > 500 && h > 36000) {
          F = 3 * FE1;
          ax = -F / m * vx / vv; ay = -F / m * vy / vv;
          m -= 3 * MD1 * dt; prop -= 3 * MD1 * dt;
        } else phase = 3;
      }
      if (phase === 3 || phase === 2) {
        const rho = 1.225 * Math.exp(-h / 8500);
        const vv = Math.hypot(vx, vy) || 1;
        const ad = 0.5 * rho * vv * vv * CdA / m;
        ax += -ad * vx / vv; ay += -ad * vy / vv;
        if (phase === 3 && h < (O.gH || 34000)) ax += clamp(-((dr - LZ) / (O.gp || 2400) + (O.gd ? vx / O.gd : 0)), -(O.gLim || 9), O.gLim || 9) * (O.gK || 0.85);   // PD 导引(按箭参数化)
        const aNet = (O.ldMax || 3) * FE1 * 0.85 / m - g;   // 刹车距离按可并机上限估算
        if (phase === 3 && vy < 0 && h - CATCH < 9000 && h - CATCH < (vy * vy) / (2 * Math.max(aNet, 1)) * 1.26 + 50) phase = 4;
      }
      if (phase === 4) {
        const vv = Math.hypot(vx, vy) || 1;
        if (prop > 0) {
          // 1-3-1 着陆: 需求超单机上限自动并 3 机, 低空收尾回单机(真实猎鹰剖面)
          const ayC = (vy * vy) / (2 * Math.max(h - CATCH - 0.5, 0.5)) + g;
          const axC = clamp(-vx * 0.6 - (h - CATCH > (O.p4h || 250) ? (dr - LZ) * (O.p4 || 0.004) : 0), -(O.p4L || 10), O.p4L || 10);   // 高空带位置项, 低空纯垂直
          const aMag = Math.hypot(axC, ayC) || 1;
          const eng = clamp(Math.ceil(aMag * m / (FE1 * 0.92)), 1, O.ldMax || 3);
          F = eng * FE1;
          const k2 = Math.min(1, (F / m) / aMag);
          ax = axC * k2; ay = ayC * k2;
          const thr = clamp(aMag * m / F, 0.25, 1.0);
          m -= eng * MD1 * thr * dt; prop -= eng * MD1 * thr * dt;
        }
        const rho = 1.225 * Math.exp(-h / 8500);
        const ad = 0.5 * rho * vv * vv * CdA / m;
        ax += -ad * vx / vv; ay += -ad * vy / vv;
      }
      vy += (ay - g) * dt;
      vx += ax * dt;
      h += vy * dt;
      dr += vx * dt;
      if (h <= CATCH) { h = CATCH; touchdown = t; phase = 5; }
      if (t - lastPush >= 1 || touchdown) { rows.push({ t, h, vx, vy, dr, phase, F }); lastPush = t; }
    }
    rows.td = touchdown;
    return rows;
  }
  function cz5AscentTable() { return ascentTable(ROCKETS.cz5.phys); }
  function lnchTC(t) {
    const T = (LNCH.cfg || ROCKETS.cz5).tc;
    for (const seg of T) if (t < seg[0]) return seg[1];
    return 16;
  }
  function lnchTableAt(t, o) {
    const tb = LNCH.table;
    const i = clamp(Math.floor(t / 1.0), 0, tb.length - 2);
    const a = tb[i], b = tb[i + 1];
    const k = clamp((t - a.t) / (b.t - a.t || 1), 0, 1);
    o.h = lerp(a.h, b.h, k); o.v = lerp(a.v, b.v, k); o.dr = lerp(a.dr, b.dr, k);
    o.pitch = lerp(a.pitch, b.pitch, k); o.F = lerp(a.F, b.F, k);
    return o;
  }
  const _lnchQ = { h: 0, v: 0, dr: 0, pitch: 0, F: 0 };
  const _pfUp = [0, 0, 0], _pfE = [0, 0, 0], _pfN = [0, 0, 0];
  const _lnchQuat = typeof THREE !== "undefined" ? new THREE.Quaternion() : null;
  function geoDirEcl(latDeg, lonDeg, out) {   // 地理经纬 → 黄道系单位方向(out[0..2]=天顶, out[3..5]=地轴); 桩环境解析后备
    const jb = bodyByName.Earth;
    const phi = latDeg * D2R, lam = lonDeg * D2R;
    let ux = 0, uy = 0, uz = 0, sx = 0, sy = 0, sz = 1;
    if (jb.spinMesh && _lnchQuat) {
      /* three.js SphereGeometry UV: u=0 在 -X 且贴图左缘=180°W → 经度 λ 的局部方向 = (cosφcosλ, sinφ, -cosφsinλ)
       * (真机贴图级校验于阶段38: 修正此前 x,z 反号 = 经度错 180° 的潜伏缺陷) */
      _v3a.set(Math.cos(phi) * Math.cos(lam), Math.sin(phi), -Math.sin(lam) * Math.cos(phi));
      jb.spinMesh.getWorldQuaternion(_lnchQuat);
      _v3a.applyQuaternion(_lnchQuat);
      ux = Number(_v3a.x) || 0; uy = Number(_v3a.y) || 0; uz = Number(_v3a.z) || 0;
      _v3b.set(0, 1, 0);
      _v3b.applyQuaternion(_lnchQuat);
      sx = Number(_v3b.x) || 0; sy = Number(_v3b.y) || 0; sz = Number(_v3b.z) || 0;
    }
    if (Math.hypot(ux, uy, uz) < 0.5 || Math.hypot(sx, sy, sz) < 0.5) {
      const eps = 23.4393 * D2R;
      const era = Math.PI * 2 * (0.7790572732640 + 1.00273781191135448 * (jd - J2000));
      const spin = era + lam;
      const xq = Math.cos(phi) * Math.cos(spin), yq = Math.cos(phi) * Math.sin(spin), zq = Math.sin(phi);
      ux = xq; uy = yq * Math.cos(eps) + zq * Math.sin(eps); uz = -yq * Math.sin(eps) + zq * Math.cos(eps);
      sx = 0; sy = Math.sin(eps); sz = Math.cos(eps);
    }
    out[0] = ux; out[1] = uy; out[2] = uz;
    if (out.length >= 6) { out[3] = sx; out[4] = sy; out[5] = sz; }
    return out;
  }
  const _geo6 = [0, 0, 0, 0, 0, 1];
  function lnchPadFrame() {   // 发射场方向基: 复用 geoDirEcl
    geoDirEcl(LNCH.lat, LNCH.lon, _geo6);
    const ux = _geo6[0], uy = _geo6[1], uz = _geo6[2];
    const sx = _geo6[3], sy = _geo6[4], sz = _geo6[5];
    _pfUp[0] = ux; _pfUp[1] = uy; _pfUp[2] = uz;
    const ex = sy * uz - sz * uy, ey = sz * ux - sx * uz, ez = sx * uy - sy * ux;
    const eL = Math.hypot(ex, ey, ez) || 1;
    _pfE[0] = ex / eL; _pfE[1] = ey / eL; _pfE[2] = ez / eL;
    _pfN[0] = _pfUp[1] * _pfE[2] - _pfUp[2] * _pfE[1];
    _pfN[1] = _pfUp[2] * _pfE[0] - _pfUp[0] * _pfE[2];
    _pfN[2] = _pfUp[0] * _pfE[1] - _pfUp[1] * _pfE[0];
    LNCH.axis = [sx, sy, sz];
  }
  function lnchDownrangeDir(out) {
    const cA = Math.cos(LNCH.incAz), sA = Math.sin(LNCH.incAz);
    out[0] = _pfN[0] * cA + _pfE[0] * sA;
    out[1] = _pfN[1] * cA + _pfE[1] * sA;
    out[2] = _pfN[2] * cA + _pfE[2] * sA;
    return out;
  }
  function lnchInsertionState() {
    if (!LNCH.table) LNCH.table = ascentTable((LNCH.cfg || ROCKETS.cz5).phys);
    const tb = LNCH.table;
    const tC = tb.tCut || tb[tb.length - 1].t;
    const fin = tb[clamp(Math.round(tC), 0, tb.length - 1)];
    lnchPadFrame();
    const dd = lnchDownrangeDir([0, 0, 0]);
    const th = fin.dr / 6371e3;
    const R = 6371 + fin.h / 1000;
    const cT = Math.cos(th), sT = Math.sin(th);
    const rd = [_pfUp[0] * cT + dd[0] * sT, _pfUp[1] * cT + dd[1] * sT, _pfUp[2] * cT + dd[2] * sT];
    const tg = [dd[0] * cT - _pfUp[0] * sT, dd[1] * cT - _pfUp[1] * sT, dd[2] * cT - _pfUp[2] * sT];
    const g = fin.pitch;
    const vd = [tg[0] * Math.cos(g) + rd[0] * Math.sin(g), tg[1] * Math.cos(g) + rd[1] * Math.sin(g), tg[2] * Math.cos(g) + rd[2] * Math.sin(g)];
    const eW = worldKm.Earth;
    const e1 = heliocentricKm(bodyByName.Earth.orbit_j2000, jd + 0.005);
    const e0 = heliocentricKm(bodyByName.Earth.orbit_j2000, jd - 0.005);
    const vE = [(e1[0] - e0[0]) / 864, (e1[1] - e0[1]) / 864, (e1[2] - e0[2]) / 864];
    const vk = fin.v / 1000;
    const OME = 7.2921159e-5;
    const ax = LNCH.axis;
    const rx = rd[0] * R, ry = rd[1] * R, rz = rd[2] * R;
    const vRot = [OME * (ax[1] * rz - ax[2] * ry), OME * (ax[2] * rx - ax[0] * rz), OME * (ax[0] * ry - ax[1] * rx)];
    const vI = [vd[0] * vk + vRot[0], vd[1] * vk + vRot[1], vd[2] * vk + vRot[2]];
    return {
      r: [eW[0] + rx, eW[1] + ry, eW[2] + rz],
      v: [vE[0] + vI[0], vE[1] + vI[1], vE[2] + vI[2]],
      hKm: fin.h / 1000, vKmS: Math.hypot(vI[0], vI[1], vI[2])
    };
  }
  function lnchEnsureAssets(cb) {
    if (typeof window === "undefined") return;
    const cfg = LNCH.cfg;
    if (window[cfg.glbKey] && window.parseGLBCore) { cb(); return; }
    if (!window.parseGLBCore) { LNCH.state = "off"; return; }
    LNCH.state = "load";
    $("lnchPhase").textContent = "装载模型…";
    try {
      const sc = document.createElement("script");
      sc.src = cfg.file;
      sc.onload = () => { if (window[cfg.glbKey]) cb(); else LNCH.state = "off"; };
      sc.onerror = () => { LNCH.state = "off"; $("lnchHud").classList.remove("show"); };
      document.body.appendChild(sc);
    } catch (e) { LNCH.state = "off"; }
  }
  function lnchDispose(id) {
    const T = LNCH.builtMap[id];
    if (!T) return;
    T.W.traverse((oo) => {
      if (oo.geometry && oo.geometry.dispose) oo.geometry.dispose();
      if (oo.material && oo.material.dispose) oo.material.dispose();
    });
    scene.remove(T.W);
    delete LNCH.builtMap[id];
  }
  function lnchBuildTheater() {
    const id = LNCH.rk;
    if (LNCH.builtMap[id]) { LNCH.builtMap[id]._at = Date.now(); return true; }
    // LRU: 常驻 ≤2 座剧场, 逐出最旧的非活动项
    const ids = Object.keys(LNCH.builtMap);
    if (ids.length >= 2) {
      ids.sort((a, b) => (LNCH.builtMap[a]._at || 0) - (LNCH.builtMap[b]._at || 0));
      for (const old of ids) {
        if (old !== id && Object.keys(LNCH.builtMap).length >= 2) lnchDispose(old);
      }
    }
    const cfg = LNCH.cfg;
    const G = window[cfg.glbKey];
    let rc, siteGroup = null;
    try {
      rc = window.parseGLBCore(G.rocket);
      if (G.site) siteGroup = window.buildGLBGroup(window.parseGLBCore(G.site), THREE).group;
    } catch (e) { return false; }
    const W = new THREE.Group();
    W.scale.setScalar(1e-6);
    const rb = window.buildGLBGroup(rc, THREE);
    const rocket = new THREE.Group();
    rocket.add(rb.group);
    W.add(rocket);
    if (siteGroup) W.add(siteGroup);
    else {   // 通用发射台: 平台 + 四避雷塔
      const pad = new THREE.Mesh(new THREE.BoxGeometry(52, 3, 52), new THREE.MeshStandardMaterial({ color: 0x565a60, roughness: 0.9 }));
      pad.position.y = -1.6;
      W.add(pad);
      for (const [mx, mz] of [[-60, -60], [60, -60], [-60, 60], [60, 60]]) {
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 110, 8), new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.7 }));
        mast.position.set(mx, 55, mz);
        W.add(mast);
      }
    }
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60000, 48), new THREE.MeshStandardMaterial({ color: 0x2c3325, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.4;
    W.add(ground);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(70000, 24, 12),
      new THREE.MeshBasicMaterial({ color: 0x86b6e8, side: THREE.BackSide, transparent: true, opacity: 0.94, depthWrite: false }));
    W.add(dome);
    W.add(new THREE.HemisphereLight(0xdfe9ff, 0x40382c, 1.15));
    const fill = new THREE.PointLight(0xbfd0e8, 0.85, 2600, 1.6);   // 追拍补光: 夜窗/背光时近景可读(阶段38)
    fill.name = "fill";
    W.add(fill);
    const dl = new THREE.DirectionalLight(0xfff2dd, 1.6);
    dl.position.set(40000, 60000, 20000);
    W.add(dl);
    function mkPlume(n, colr, size) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const mtl = new THREE.PointsMaterial({ map: makeComaTexture(), color: colr, size, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, alphaTest: 0.02 });   // map 必带: 无贴图点精灵=实心方块(阶段38 真机定位)
      const p = new THREE.Points(g, mtl);
      p.frustumCulled = false;
      const seeds = new Float32Array(n * 3);
      for (let i = 0; i < n * 3; i += 1) seeds[i] = Math.random();
      p.userData.seeds = seeds;
      W.add(p);
      return p;
    }
    const plume = mkPlume(220, 0xff9a40, 18);
    const plumeCore = mkPlume(90, 0xfff3d8, 9);
    const smk = new THREE.Group();
    for (let i = 0; i < 36; i += 1) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeComaTexture(), color: 0xb9bcc2, transparent: true, opacity: 0, depthWrite: false }));
      sp.userData.a = Math.random() * Math.PI * 2;
      sp.userData.r = 14 + Math.random() * 20;
      sp.userData.k = 0.6 + Math.random() * 0.9;
      smk.add(sp);
    }
    W.add(smk);
    let bParts = null;
    if (cfg.booster) {   // 一级回收专属: 展开腿 + LZ 着陆区 + 独立羽流
      const legsOut = new THREE.Group();
      const legMat = new THREE.MeshStandardMaterial({ color: 0x181818, roughness: 0.6, metalness: 0.3 });
      for (let li = 0; li < 4; li += 1) {
        const a = li * Math.PI / 2 + Math.PI / 4;
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 11, 0.34), legMat);
        leg.position.set(Math.cos(a) * 4.4, 3.4, Math.sin(a) * 4.4);
        leg.rotation.z = Math.cos(a) * 0.62;
        leg.rotation.x = Math.sin(a) * 0.62;
        legsOut.add(leg);
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.2, 0.35, 10), legMat);
        foot.position.set(Math.cos(a) * 7.3, 0.15, Math.sin(a) * 7.3);
        legsOut.add(foot);
      }
      legsOut.visible = false;
      W.add(legsOut);
      const lz = new THREE.Group();
      const pad2 = new THREE.Mesh(new THREE.CylinderGeometry(32, 32, 0.5, 36), new THREE.MeshStandardMaterial({ color: 0x2e3134, roughness: 0.95 }));
      pad2.position.y = 0.1;
      lz.add(pad2);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(24, 0.9, 6, 40), new THREE.MeshStandardMaterial({ color: 0xdadfe4, roughness: 0.8 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.42;
      lz.add(ring);
      for (const rzz of [0, Math.PI / 2]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(34, 0.2, 3.2), new THREE.MeshStandardMaterial({ color: 0xdadfe4, roughness: 0.8 }));
        bar.rotation.y = rzz;
        bar.position.y = 0.42;
        lz.add(bar);
      }
      lz.position.set(cfg.booster.lzDr, 0, 60);
      W.add(lz);
      const bPlume = mkPlume(130, 0xffa040, 750);
      bParts = { legsOut, lz, bPlume, foldedLegs: [] };
      rb.parts.core_stage1.traverse((oo) => {
        if (oo.name && (oo.name.indexOf("_leg_") >= 0 || oo.name.indexOf("_foot_") >= 0)) bParts.foldedLegs.push(oo);
      });
    }
    let sat = rb.parts.payload || null;
    if (!sat) {
      sat = new THREE.Group();
      const bus = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.6, 3.2), new THREE.MeshStandardMaterial({ color: 0xc8a44a, roughness: 0.5, metalness: 0.6 }));
      sat.add(bus);
      sat.position.y = (G.meta.fairingY && G.meta.fairingY[1] > 1 ? G.meta.fairingY[0] + 8 : (G.meta.heightM || 60) - 16);
      rocket.add(sat);
    }
    W.visible = false;
    scene.add(W);
    LNCH.builtMap[id] = { W, rocket, parts: rb.parts, plume, plumeCore, smoke: smk, dome, ground, sat, satHome: sat.position.clone(), bParts, _at: Date.now() };
    return true;
  }
  function lnchSkipListener() { /* 阶段39: 单击跳过误触率高, 摘除 — 改 HUD 跳过按钮 + Esc */ }
  function lnchEscListener(e) { if (e.code === "Escape" && LNCH.state !== "off") LNCH.skipReq = true; }
  function lnchEnter(cfg0) {
    if (LNCH.state !== "off") return;
    stopTour(); endReplay(); endLightCruise();
    try { if (MAG.on) magExit(); } catch (e) { /* 未建 */ }
    if (typeof CINEMA !== "undefined" && CINEMA.on) cineStop(false);
    if (galFrame) setGalFrame(false);
    if (deepTime && setDeepTimeRef) setDeepTimeRef(false);
    if (stars3D) { stars3D = false; $("cosmoBtn").classList.remove("active"); $("cosmoHint").classList.remove("show"); }
    LNCH.rk = (cfg0 && cfg0.rocket && ROCKETS[cfg0.rocket]) ? cfg0.rocket : "cz5";
    LNCH.cfg = ROCKETS[LNCH.rk];
    LNCH.lat = LNCH.cfg.site.lat;
    LNCH.lon = LNCH.cfg.site.lon;
    LNCH.incAz = LNCH.cfg.az * D2R;
    LNCH.hist = !!(cfg0 && cfg0.hist);
    LNCH.chain = (cfg0 && cfg0.chain) || null;
    LNCH.spdMode = (cfg0 && (cfg0.hist || cfg0.chain)) ? "fast" : "real";
    LNCH.camMode = "auto";
    LNCH._spdIdx = 0; LNCH.spdMul = 1;
    $("lnchSpd") && ($("lnchSpd").textContent = (LNCH.spdMode === "fast") ? "导演节奏 ⏩" : "实时 1:1");
    $("lnchCamBtn") && ($("lnchCamBtn").textContent = "机位: 导播");
    const _sb2 = $("lnchSpd");
    if (_sb2) _sb2.textContent = LNCH.spdMode === "fast" ? "导演节奏 ⏩" : "实时 1:1";
    LNCH.apollo = !!(cfg0 && cfg0.apollo);
    /* 时间主权: 发射 8 分钟的节奏由剧场独占(压缩 12×), 全局挡位暂停; 退场恢复(阶段38 用户实测: 天/秒挡冲垮发射细节) */
    LNCH._tSave = { playing, dps: daysPerSecond };
    playing = false;
    $("playBtn").textContent = "▶";
    if (bodyByName.Earth.atmoMesh) bodyByName.Earth.atmoMesh.visible = false;   // 大气壳内视角曝白, 剧场内隐(阶段38)
    LNCH.failAt = (cfg0 && cfg0.historical && LNCH.cfg.failT) ? LNCH.cfg.failT : 0;
    LNCH.failed = 0;
    lnchEnsureAssets(() => {
      if (!lnchBuildTheater()) { LNCH.state = "off"; return; }
      const T = LNCH.builtMap[LNCH.rk];
      for (const k in LNCH.builtMap) LNCH.builtMap[k].W.visible = false;
      LNCH.W = T.W; LNCH.rocket = T.rocket; LNCH.parts = T.parts;
      LNCH.plume = T.plume; LNCH.plumeCore = T.plumeCore; LNCH.smoke = T.smoke;
      LNCH.dome = T.dome; LNCH.ground = T.ground; LNCH.sat = T.sat;
      LNCH.state = "pre";
      LNCH.t = 0; LNCH.wall = 0; LNCH.skipReq = false; LNCH.sep = {}; LNCH.evFired = LNCH.cfg.events.map(() => 0);
      LNCH.bTable = null; LNCH.bPhase = -1;
      if (T.bParts) {
        T.bParts.legsOut.visible = false;
        for (const fl of T.bParts.foldedLegs) fl.visible = true;
        T.bParts.bPlume.visible = false;
      }
      LNCH.table = ascentTable(LNCH.cfg.phys);
      playing = false;
      $("playBtn").textContent = "▶";
      animateScaleTo(0);
      setFocus("Earth", true);
      LNCH.savedNear = camera.near;
      camera.near = 2e-6;   // 2m: 细拉线对数深度撕裂消(阶段38); 最近机位 ~100m 充裕
      camera.updateProjectionMatrix();
      controls.enabled = false;
      for (const k in LNCH.parts) {
        LNCH.parts[k].visible = true;
        LNCH.parts[k].position.set(0, 0, 0);
        LNCH.parts[k].rotation.set(0, 0, 0);
      }
      if (LNCH.sat && T.satHome) { LNCH.sat.position.copy(T.satHome); }
      LNCH.rocket.position.set(0, 0, 0);
      LNCH.rocket.rotation.set(0, 0, 0);
      LNCH.W.visible = true;
      bodyByName.Earth.spinMesh.scale.setScalar(0.9975);
      $("lnchHud").classList.add("show");
      $("lnchPhase").textContent = `${LNCH.cfg.cn} · 倒计时`;
      if (typeof document.addEventListener === "function") {
        document.addEventListener("pointerdown", lnchSkipListener, true);
        document.addEventListener("keydown", lnchEscListener, true);
      }
      audioPoke();
      sfxRumble();
    });
  }
  function lnchExit() {
    if (LNCH.state === "off") return;
    LNCH.state = "off";
    if (LNCH._tSave) {
      playing = LNCH._tSave.playing;
      daysPerSecond = LNCH._tSave.dps;
      $("playBtn").textContent = playing ? "⏸" : "▶";
      if (window.__setSpeed) window.__setSpeed(daysPerSecond, playing);
      LNCH._tSave = null;
    }
    if (bodyByName.Earth.atmoMesh) bodyByName.Earth.atmoMesh.visible = true;
    if (LNCH.W) LNCH.W.visible = false;
    camera.near = LNCH.savedNear;
    camera.updateProjectionMatrix();
    camera.up.set(0, 0, 1);
    controls.enabled = true;
    bodyByName.Earth.spinMesh.scale.setScalar(1);
    $("lnchHud").classList.remove("show");
    if (typeof document.removeEventListener === "function") {
      document.removeEventListener("pointerdown", lnchSkipListener, true);
      document.removeEventListener("keydown", lnchEscListener, true);
    }
    if (!playing) togglePlay();
  }
  function lnchHandoff() {
    const st = lnchInsertionState();
    if (!LNCH.skipReq) award("launch");
    try {
      const fl = JSON.parse(localStorage.getItem("ss_fleet") || "{}");
      fl[LNCH.rk] = 1;
      localStorage.setItem("ss_fleet", JSON.stringify(fl));
      if (Object.keys(fl).length >= 3) award("fleet");
    } catch (e) { /* 桩 */ }
    const chain = LNCH.chain;
    lnchExit();
    if (chain) { startReplay(chain); return null; }
    let seq2 = 1;
    try { seq2 = parseInt(localStorage.getItem("ss_launchN") || "0", 10) + 1; localStorage.setItem("ss_launchN", String(seq2)); } catch (e) { /* 桩 */ }
    const siteCn = (SITES.find((x) => x.id === LNCH.rk) || {}).cn || "";
    const p = launchProbe(st.r, st.v, { name: `${LNCH.cfg.cn}载荷-${seq2}` });
    if (LNCH.apollo && p) {
      apolloStart(p);
      if (window.__setSpeed) window.__setSpeed(1 / 86400, true);   // 真实时间对应现实(阶段38 用户要求); 加速权交给用户
    }
    setFocus("Earth", false);
    $("hohmannStatus") && ($("hohmannStatus").innerHTML = `${LNCH.cfg.cn}载荷-${seq2} 入轨: ${st.hKm.toFixed(0)} km / ${st.vKmS.toFixed(2)} km/s · 发自${siteCn}${LNCH.apollo ? ' —— 实时等待 TLI 窗口(约1~3小时) <button id="apSpdBtn">加速: 时/秒 ▶</button>' : ""}`);
    return p;
  }
  const _lnchV1 = typeof THREE !== "undefined" ? new THREE.Vector3() : null;
  const _lnchV2 = typeof THREE !== "undefined" ? new THREE.Vector3() : null;
  const _lnchM4 = typeof THREE !== "undefined" ? new THREE.Matrix4() : null;
  function tickLaunch(dt) {
    if (LNCH.state === "off" || LNCH.state === "load") return;
    const cfg = LNCH.cfg;
    const meta = window[cfg.glbKey].meta;
    lnchPadFrame();
    const eS = scenePos.Earth || [0, 0, 0];
    const Rbu = 6371 / SCALE.sceneUnitKm;
    LNCH.W.position.set(eS[0] + _pfUp[0] * Rbu, eS[1] + _pfUp[1] * Rbu, eS[2] + _pfUp[2] * Rbu);
    const dd = lnchDownrangeDir([0, 0, 0]);
    _lnchV1.set(dd[0], dd[1], dd[2]);
    _lnchV2.set(_pfUp[0], _pfUp[1], _pfUp[2]);
    const zx = _lnchV1.y * _lnchV2.z - _lnchV1.z * _lnchV2.y;
    const zy = _lnchV1.z * _lnchV2.x - _lnchV1.x * _lnchV2.z;
    const zz = _lnchV1.x * _lnchV2.y - _lnchV1.y * _lnchV2.x;
    _lnchM4.makeBasis(_lnchV1, _lnchV2, new THREE.Vector3(zx, zy, zz).normalize());
    LNCH.W.quaternion.setFromRotationMatrix(_lnchM4);
    LNCH.W.updateMatrixWorld(true);
    camera.up.set(_pfUp[0], _pfUp[1], _pfUp[2]);
    const q = _lnchQ;
    const hScale = (meta.heightM || 57) / 57;
    if (LNCH.state === "pre") {
      LNCH.wall += dt;
      const tm = LNCH.wall - 5;
      $("lnchT").textContent = (tm < 0 ? "-" : "+") + new Date(Math.abs(tm) * 1000).toISOString().slice(14, 19);
      lnchCam(0, 0, hScale);
      lnchPlume(clamp((LNCH.wall - 2.4) / 2.6, 0, 1) * 0.5, 0, 0);
      lnchSmoke(clamp((LNCH.wall - 2.4) / 2.6, 0, 1), dt);
      if (LNCH.skipReq) { lnchHandoff(); return; }
      if (LNCH.wall >= 5) { LNCH.state = "fly"; LNCH.t = 0; sfxRumble(); }
      return;
    }
    if (LNCH.state === "fail") {   // N1 史实模式: 爆炸定格与挽歌
      LNCH.failed += dt;
      lnchPlume(clamp(2.2 - LNCH.failed, 0, 1) * 1.6, 2600, LNCH.t);
      if (LNCH.plume) LNCH.plume.material.color.setHex(0xffb060);
      if (LNCH.failed > 2.2 && LNCH.rocket.visible) LNCH.rocket.visible = false;
      if (LNCH.failed > 3 && $("lnchPhase").textContent !== LNCH.cfg.failElegy) $("lnchPhase").textContent = LNCH.cfg.failElegy;
      if (LNCH.skipReq || LNCH.failed > 9.5) {
        LNCH.rocket.visible = true;
        lnchExit();
        setFocus("Earth", false);
      }
      return;
    }
    if (LNCH.state === "fly") {
      const tc = LNCH.spdMode === "fast" ? lnchTC(LNCH.t) : (LNCH.spdMul || 1);   // 亲手发射默认真实 1:1(阶段38 用户要求); 历史/回放走导演节奏
      if (LNCH.failAt && LNCH.t + dt * tc >= LNCH.failAt && !LNCH.failed) {
        LNCH.t = LNCH.failAt;
        LNCH.state = "fail";
        $("lnchPhase").textContent = LNCH.cfg.failLabel;
        sfxRumble();
        sfxSnap();
        return;
      }
      LNCH.t += dt * tc;
      jd += dt * tc / 86400;
      lnchTableAt(LNCH.t, q);
      const Rm = 6371e3;
      const th = q.dr / Rm;
      const px = Math.sin(th) * (Rm + q.h);
      const py = Math.cos(th) * (Rm + q.h) - Rm;
      LNCH.rocket.position.set(px, py, 0);
      LNCH.rocket.rotation.z = -(th + (Math.PI / 2 - q.pitch));
      const _fl = LNCH.W.getObjectByName("fill");
      if (_fl) {
        const fg = (LNCH.bPhase >= 3 && LNCH.parts.core_stage1) ? LNCH.parts.core_stage1 : LNCH.rocket;
        fg.getWorldPosition(_v3a);
        LNCH.W.worldToLocal(_v3a);
        _fl.position.set(_v3a.x + 90, _v3a.y + 130, _v3a.z + 60);
      }
      lnchPlume(q.F > 0 ? 1 : 0, q.v, LNCH.t);
      lnchSmoke(LNCH.t < 30 ? 1 : 0, dt);
      LNCH.dome.material.opacity = 0.94 * clamp(1 - q.h / 90000, 0, 1);
      LNCH.ground.visible = q.h < 250000;
      // 配置化分离编排
      for (let i = 0; i < cfg.events.length; i += 1) {
        const ev = cfg.events[i];
        if (!LNCH.evFired[i] && LNCH.t >= ev.t) {
          LNCH.evFired[i] = LNCH.t;
          sfxSnap();
          $("lnchPhase").textContent = ev.label;
          if (ev.reveal && LNCH.sat) LNCH.sat.visible = true;
        }
        if (LNCH.evFired[i]) {
          const el = (LNCH.t - LNCH.evFired[i]) / 8;
          for (const pn of ev.parts) {
            if (cfg.booster && pn === "core_stage1") continue;   // 一级由返航弹道接管
            const g = LNCH.parts[pn];
            if (!g) continue;
            if (ev.mode === "radial") {
              const d = (meta.boosterDir && meta.boosterDir[pn]) || [pn.endsWith("2") ? -1 : 1, 0];
              g.position.set(d[0] * el * 30, -el * el * 14, d[1] * el * 30);
              g.rotation.z = el * 0.55 * (d[0] || 0.3);
              g.rotation.x = -el * 0.55 * (d[1] || 0);
            } else if (ev.mode === "up") {
              g.position.set(el * 26 * hScale, el * 40 * hScale, el * 9);
              g.rotation.z = -el * 0.8;
            } else {   // back: 沿速度反向落后 + 下坠
              g.position.set(-el * 55 * hScale, -el * el * 20, 0);
              g.rotation.z = el * 0.22;
            }
            if (el > 5) g.visible = false;
          }
        }
      }
      const tCut = LNCH.table.tCut || (cfg.phys.tEnd - 10);
      if (LNCH.t >= tCut && !LNCH.sep.m) {
        LNCH.sep.m = { t0: LNCH.t };
        $("lnchPhase").textContent = "制导关机 · 载荷分离";
      }
      if (LNCH.sep.m && cfg.satDrift && LNCH.sat) LNCH.sat.position.y += dt * 26;
      let chase = false;
      if (cfg.booster && LNCH.t >= cfg.booster.sepT) {
        if (!LNCH.bTable) LNCH.bTable = f9BoosterTable(LNCH.table, cfg.booster.sepT, cfg.booster.lzDr, cfg.booster.opts);
        const bt = LNCH.bTable;
        const last = bt[bt.length - 1];
        const bT = Math.min(LNCH.t, last.t);
        let bi = 0;
        while (bi < bt.length - 2 && bt[bi + 1].t < bT) bi += 1;
        const a2 = bt[bi], b2 = bt[bi + 1];
        const kk = clamp((bT - a2.t) / (b2.t - a2.t || 1), 0, 1);
        const bh = lerp(a2.h, b2.h, kk), bdr = lerp(a2.dr, b2.dr, kk);
        const bvx = lerp(a2.vx, b2.vx, kk), bvy = lerp(a2.vy, b2.vy, kk);
        const bph = b2.phase;
        const Rm2 = 6371e3;
        const thb = bdr / Rm2;
        let bpx = Math.sin(thb) * (Rm2 + bh), bpy = Math.cos(thb) * (Rm2 + bh) - Rm2;
        // 末段 800m 视觉混合到 LZ(物理表如实, 渲染补末端精确制导; 简化模型 km 级落点精度已在文档言明)
        const lzBlend = clamp(1 - bh / 800, 0, 1);
        if (lzBlend > 0) {
          const thL = cfg.booster.lzDr / Rm2;
          bpx = lerp(bpx, Math.sin(thL) * (Rm2 + bh), lzBlend);
          bpy = lerp(bpy, Math.cos(thL) * (Rm2 + bh) - Rm2, lzBlend);
        }
        const g1 = LNCH.parts.core_stage1;
        // 姿态: 翻转→返航水平反推→竖直下降
        let att;
        if (bph === 0) att = lerp(q.pitch, Math.PI * 0.92, clamp((bT - cfg.booster.sepT) / 12, 0, 1));
        else if (bph === 1) att = Math.PI * 0.94;
        else att = Math.PI / 2;
        const wantRot = -(thb + Math.PI / 2 - att);
        g1.position.set(bpx - LNCH.rocket.position.x, bpy - LNCH.rocket.position.y, 0);
        g1.rotation.z = wantRot - LNCH.rocket.rotation.z;
        const T2 = LNCH.builtMap[LNCH.rk];
        if (T2.bParts) {
          if (bh < 1600 && bph >= 3) {
            T2.bParts.legsOut.visible = true;
            for (const fl of T2.bParts.foldedLegs) fl.visible = false;
            T2.bParts.legsOut.position.set(bpx, bpy, 60);
            T2.bParts.legsOut.rotation.z = -thb;
          }
          const bp = T2.bParts.bPlume;
          const burning = a2.F > 0 && bph !== 5;
          bp.visible = burning;
          if (burning) {
            const arr2 = bp.geometry.attributes.position.array;
            const sd = bp.userData.seeds;
            const tt2 = performance.now() * 0.001;
            const dirx = Math.sin(att) * 0 + Math.cos(wantRot + Math.PI / 2);
            const diry = Math.sin(wantRot + Math.PI / 2);
            for (let ii = 0; ii < arr2.length / 3; ii += 1) {
              const fr = (sd[ii * 3] + tt2 * (1.6 + sd[ii * 3 + 2])) % 1;
              const rr2 = 2.2 * (0.3 + fr * 1.6);
              const aa = sd[ii * 3 + 1] * Math.PI * 2 + tt2;
              arr2[ii * 3] = bpx - dirx * fr * 26 + Math.cos(aa) * rr2;
              arr2[ii * 3 + 1] = bpy - diry * fr * 26 + Math.sin(aa) * rr2 * 0.5;
              arr2[ii * 3 + 2] = 60 + Math.sin(aa) * rr2;
            }
            bp.geometry.attributes.position.needsUpdate = true;
          }
        }
        if (bph !== LNCH.bPhase) {
          LNCH.bPhase = bph;
          const L2 = { 1: "一级返航点火", 25: "一级再入点火", 3: "栅格舵气动减速", 4: "着陆反推", 5: "一级着陆成功 · 二级继续入轨" };
          if (L2[bph]) { $("lnchPhase").textContent = L2[bph]; sfxSnap(); }
        }
        // 追拍窗口: 分离+8s 起, 触地+5s 止
        if (bT > cfg.booster.sepT + 8 && LNCH.t < last.t + 5 && bph !== 5 || (bph === 5 && LNCH.t < last.t + 5)) {
          chase = true;
          const d2 = 55 + bh * 0.10;
          _lnchV1.set(bpx - d2 * 0.5, bpy + d2 * 0.42, 60 + d2 * 0.85);
          LNCH.W.localToWorld(_lnchV1);
          camera.position.copy(_lnchV1);
          _lnchV2.set(bpx, bpy + 12, 60);
          LNCH.W.localToWorld(_lnchV2);
          controls.target.copy(_lnchV2);
          camera.lookAt(_lnchV2);
          $("lnchAlt").textContent = bh < 1000 ? bh.toFixed(0) + " m" : (bh / 1000).toFixed(1) + " km";
          $("lnchV").textContent = Math.hypot(bvx, bvy).toFixed(0) + " m/s";
        }
      }
      if (!chase) lnchCam(LNCH.t, q.h, hScale);
      $("lnchT").textContent = "+" + new Date(LNCH.t * 1000).toISOString().slice(14, 19);
      if (!chase) {
        $("lnchAlt").textContent = q.h < 1000 ? q.h.toFixed(0) + " m" : (q.h / 1000).toFixed(1) + " km";
        $("lnchV").textContent = q.v < 1000 ? q.v.toFixed(0) + " m/s" : (q.v / 1000).toFixed(2) + " km/s";
      }
      if (LNCH.t < (cfg.events[0] ? cfg.events[0].t : 173) && !LNCH.sep.m) {
        $("lnchPhase").textContent = LNCH.t < 15 ? `${cfg.cn} · 点火起飞` : "上升 · 重力转弯";
      }
      if (LNCH.skipReq || LNCH.t >= tCut + 16) { lnchHandoff(); return; }
    }
  }
  function lnchCam(t, alt, hs) {
    let cx, cy, cz, lx, ly, lz;
    const rp = LNCH.rocket.position;
    if (LNCH.camMode === "onboard") {   // 箭载: 侧后 26m 跟飞(米级贴身, 全程)
      cx = rp.x - 20 * hs; cy = rp.y + 34 * hs; cz = rp.z + 17 * hs;
      lx = rp.x; ly = rp.y + 22 * hs; lz = rp.z;
      _lnchV1.set(cx, cy, cz); LNCH.W.localToWorld(_lnchV1); camera.position.copy(_lnchV1);
      _lnchV2.set(lx, ly, lz); LNCH.W.localToWorld(_lnchV2); controls.target.copy(_lnchV2); camera.lookAt(_lnchV2);
      return;
    }
    if (LNCH.camMode === "top") {   // 上空: 箭正上方回望发射场/地面远去
      cx = rp.x + 8; cy = rp.y + 300 * hs; cz = rp.z + 8;
      lx = rp.x; ly = rp.y; lz = rp.z;
      _lnchV1.set(cx, cy, cz); LNCH.W.localToWorld(_lnchV1); camera.position.copy(_lnchV1);
      _lnchV2.set(lx, ly, lz); LNCH.W.localToWorld(_lnchV2); controls.target.copy(_lnchV2); camera.lookAt(_lnchV2);
      return;
    }
    if (t < 26) {
      cx = 118 * hs; cy = 22 * hs + t * 1.1 * hs; cz = 96 * hs;
      lx = rp.x; ly = rp.y + 30 * hs; lz = rp.z;
    } else if (t < 120) {
      cx = 420 * hs; cy = 8; cz = 300 * hs;
      lx = rp.x; ly = rp.y + 26 * hs; lz = rp.z;
    } else {
      const d = (260 + Math.min(alt * 0.55, 1400)) * (0.6 + 0.4 * hs);   // 伴飞封顶: 高空段跟到 ~1.7km 内, 箭体可辨(阶段38)
      // 侧下仰拍: 高空段地球占近半天球, 仰角让箭体衬星空(阶段38 真机构图)
      cx = rp.x - d * 0.85; cy = rp.y + d * 0.02; cz = rp.z + d * 0.52;
      lx = rp.x; ly = rp.y + d * 0.14; lz = rp.z;
    }
    _lnchV1.set(cx, cy, cz);
    LNCH.W.localToWorld(_lnchV1);
    camera.position.copy(_lnchV1);
    _lnchV2.set(lx, ly, lz);
    LNCH.W.localToWorld(_lnchV2);
    controls.target.copy(_lnchV2);
    camera.lookAt(_lnchV2);
  }
  function lnchPlumePhase(t) {
    const ph = LNCH.cfg.plume;
    for (const p of ph) if (t >= (p.t0 || 0) && t < p.t1) return p;
    return null;
  }
  function lnchPlume(throttle, v, t) {
    const phase = lnchPlumePhase(t) || { y: 1.6, s: 1 };
    for (const [p, len, rad] of [[LNCH.plume, 46, 4.2], [LNCH.plumeCore, 16, 1.7]]) {
      if (!p) continue;
      p.visible = throttle > 0.02;
      if (!p.visible) continue;
      const arr = p.geometry.attributes.position.array;
      const seeds = p.userData.seeds;
      const tt = performance.now() * 0.001;
      const L = len * phase.s * (1 + Math.min(v / 2600, 2.2)) * throttle;
      const n = arr.length / 3;
      for (let i = 0; i < n; i += 1) {
        const fr = (seeds[i * 3] + tt * (1.4 + seeds[i * 3 + 2])) % 1;
        const rr = rad * phase.s * (0.25 + fr * (1 + Math.min(v / 3200, 2.6))) * throttle;
        const a = seeds[i * 3 + 1] * Math.PI * 2 + tt * 0.6;
        arr[i * 3] = LNCH.rocket.position.x + Math.cos(a) * rr;
        arr[i * 3 + 1] = LNCH.rocket.position.y + phase.y - fr * L;
        arr[i * 3 + 2] = LNCH.rocket.position.z + Math.sin(a) * rr;
      }
      p.geometry.attributes.position.needsUpdate = true;
      p.material.opacity = (0.1 + 0.16 * throttle) * clamp(1.5 - v / 2400, 0.35, 1);   // 高空羽流稀薄化
      if (phase.col && p === LNCH.plume) p.material.color.setHex(phase.col);
    }
  }
  function lnchSmoke(k, dt) {
    if (!LNCH.smoke) return;
    LNCH.smoke.visible = k > 0.01;
    if (!LNCH.smoke.visible) return;
    const tt = performance.now() * 0.001;
    for (const sp of LNCH.smoke.children) {
      const u = sp.userData;
      const r = u.r + ((tt * 6 * u.k) % 55);
      sp.position.set(Math.cos(u.a) * r, 2.5 + ((tt * 2.2 * u.k) % 16), Math.sin(u.a) * r);
      const s2 = 12 + r * 0.8;
      sp.scale.set(s2, s2, 1);
      sp.material.opacity = 0.13 * k * clamp(1 - r / 68, 0, 1);
    }
  }

  /* ---------------- 历史名场面: 一键穿越(时刻均经引擎/文献双验) ---------------- */
  const HISTORY_SCENES = [
    { y: "1054", t: "天关客星 · 蟹状星云的诞生", d: "宋代天文学家记录『昼见如太白』二十三日 —— 那颗超新星的遗骸至今仍在膨胀, 就是蟹状星云 M1。", act: "m1" },
    { y: "1859-09-01", t: "卡林顿事件 · 史上最强磁暴", d: "英国天文学家卡林顿看见太阳上一道白光 —— 17 小时后, 电报机自燃, 极光照亮加勒比。进磁层剧场重演这场风暴。", act: "carrington" },
    { y: "1910-05-19", t: "地球穿过哈雷彗尾", d: "报纸预言氰气灭世, 商人卖出成千上万『防彗星药丸』。当晚, 地球安然穿过彗尾。", jd: 2418810.9, focus: "Halley", scale: 1 },
    { y: "1919-05-29", t: "爱丁顿的日全食 · 相对论封神", d: "普林西比岛, 食甚 6 分 51 秒。星光偏折 1.75 角秒 —— 广义相对论一战成名。站在他站过的地方看这场食。", sky: [1.614, 7.404, 2422108.094] },
    { y: "1969-02-21", t: "N1 首飞 · 苏联的月球梦(史实)", d: "30 台发动机, 4500 吨推力。剧场按史实重演: T+68.7 秒, KORD 系统切断全部发动机。想看它如果成功的样子, 去沙盒按下 N1。", act: "launch", rocket: "n1", historical: true, jd: 2440273.888 },
        { y: "1969-07-16", t: "阿波罗11 出发 · 土星五号", d: "5 台 F-1 同时点火, 3400 吨轰鸣离地——人类历史上最强的机器, 载着三个人和一面旗子去月球。从 LC-39A 塔架看这一幕。", act: "launch", rocket: "saturn5", apollo: true, jd: 2440419.064 },
        { y: "1969-07-20", t: "静海基地 · 人类的一小步", d: "阿波罗 11 号降落在静海。去月球车模式选『静海』着陆区, 亲自开过那片土地。", act: "moon" },
    { y: "1977-08-20", t: "旅行者 2 号启程", d: "一次 176 年一遇的行星排列窗口, 一台核动力唱片机, 一场至今未归的旅行。", act: "voyager" },
    { y: "1986-02-09", t: "哈雷彗星近日 · 乔托号迎击", d: "上一次哈雷回归。欧空局乔托号穿过彗发, 拍下人类第一张彗核照片。", jd: 2446471.3, focus: "Halley", scale: 1 },
    { y: "1997-04-01", t: "海尔-波普 · 世纪大彗星", d: "肉眼可见 18 个月, 彗核直径约 60 公里。北半球整个春天都在它的双尾下。", jd: 2450539.6, focus: "HaleBopp", scale: 1 },
    { y: "2012-06-06", t: "金星凌日 · 本世纪绝唱", d: "金星最后一次从日面爬过 —— 下一次是 2117 年 12 月。在北京的晨光里看那个小黑点。", sky: [39.90, 116.40, 2456084.5625] },
    { y: "2024-10-13", t: "筷子夹住火箭 · 星舰第五飞", d: "71 米高的超重助推器返回发射塔, 被两条机械臂在半空接住 —— 人类第一次'接住'一枚火箭。剧场按此剖面重演: 分离后跟随助推器直到入臂。", act: "launch", rocket: "starship", jd: 2460597.02 },
        { y: "2016-11-03", t: "长征五号首飞 · 文昌", d: "中国最强火箭的第一次点火。8 台 YF-100 与 2 台 YF-77 同时咆哮, 849 吨离开海南的海岸线。进发射剧场, 从塔架看到入轨。", act: "launch", jd: 2457696.03 },
        { y: "2017-08-21", t: "美国大日食", d: "横贯美国的全食带, 两亿人仰望。这里是怀俄明州卡斯珀的食甚时刻。", sky: [42.85, -106.32, 2457987.2394] },
    { y: "2017-10-14", t: "奥陌陌最近地球 · 第一位星际访客", d: "一根雪茄状的星际碎片以双曲线轨道掠过太阳后飞离 —— 人类第一次确认: 别的恒星系的东西, 真的会穿过我们家。它离去时的微弱加速至今没有定论。", jd: 2458040.9, focus: "1I", scale: 0 },
    { y: "2019-12-08", t: "鲍里索夫过近日点 · 第一颗星际彗星", d: "业余天文学家用自制望远镜逮到它。与奥陌陌不同, 它拖着标准的彗尾 —— 说明别的恒星系造彗星的配方, 和我们几乎一样。", jd: 2458826.05, focus: "2I", scale: 0 },
        { y: "2020-12-21", t: "木土大合 · 800 年最近", d: "冬至傍晚, 木星与土星在暮色中几乎贴成一颗星 —— 上一次这么近, 是 1226 年。", sky: [39.90, 116.40, 2459204.917] },
    { y: "2025-10-29", t: "3I/ATLAS 过近日点 · 迄今最快的访客", d: "v∞ ≈ 58 km/s —— 比任何人造探测器都快。它可能比太阳系还要古老, 在星际漂流了数十亿年, 只在我们的天空停留几个月。", jd: 2460977.99, focus: "3I", scale: 0 },
        { y: "2029-04-13", t: "阿波菲斯掠地", d: "距地心 3.2 万公里 —— 比同步卫星更近。东半球肉眼可见一颗小行星划过夜空。", jd: 2462239.11, focus: "Apophis", scale: 0 },
    { y: "2035-09-02", t: "北京日全食", d: "华北平原的正午黑夜。引擎推算食甚 08:33(北京时间), 与 NASA 贝塞尔元素逐秒吻合 —— 你可以活着看到这场。", sky: [39.90, 116.40, 2464572.5234] },
    { y: "2061-07-28", t: "哈雷再临", d: "哈雷彗星的下一次回归。今天看这页面的多数人, 都还来得及赴约。", jd: 2474033.5, focus: "Halley", scale: 1 }
  ];
  let histSeen = {};
  try { histSeen = JSON.parse(localStorage.getItem("ss_hist") || "{}"); } catch (e) { histSeen = {}; }
  function goHistory(i, noTheater) {
    const sc = HISTORY_SCENES[i];
    if (!sc) return;
    try { histSeen[sc.y] = 1; localStorage.setItem("ss_hist", JSON.stringify(histSeen)); } catch (e) { /* 忽略 */ }
    award("history");
    if (Object.keys(histSeen).length >= HISTORY_SCENES.length) award("historian");
    $("histModal").classList.remove("show");
    stopTour();
    endReplay();
    if (sc.sky) {
      window.open(`sky.html#lat=${sc.sky[0]}&lon=${sc.sky[1]}&jd=${sc.sky[2]}`, "_blank");
      return;
    }
    if (sc.act === "moon") { window.open("moon.html", "_blank"); return; }
    if (sc.act === "voyager") {
      if (noTheater || !window.parseGLBCore) { startReplay("Voyager2"); }
      else { jd = 2443376.10; lnchEnter({ hist: true, rocket: "titan3e", chain: "Voyager2" }); }
      return;
    }
    if (sc.act === "carrington") { magEnter(true); return; }
    if (sc.act === "launch") { if (sc.jd) jd = sc.jd; lnchEnter({ hist: true, rocket: sc.rocket, historical: sc.historical, apollo: sc.apollo }); return; }
    if (sc.act === "m1") {
      const d = window.DEEPSKY && window.DEEPSKY.find((x) => x.cn && x.cn.includes("蟹状"));
      if (d) aimAtDeepSky(d);
      return;
    }
    if (deepTime && setDeepTimeRef) setDeepTimeRef(false);
    if (stars3D) { stars3D = false; $("cosmoBtn").classList.remove("active"); $("cosmoHint").classList.remove("show"); }
    jd = sc.jd;
    playing = false;
    $("playBtn").textContent = "▶";
    if (sc.scale !== undefined) animateScaleTo(sc.scale);
    setFocus(sc.focus, false);
  }
  /* ---------------- 放映厅: 历史名场面连播(跳过需开新页的场景) ---------------- */
  const CINEMA = { on: false, k: 0, t: 0, dwell: 16, order: [] };
  function cineOrder() {
    const out = [];
    for (let i = 0; i < HISTORY_SCENES.length; i += 1) if (HISTORY_SCENES[i].act !== "launch") out.push(i);
    return out;   // 完全体: 除发射剧场(自有编排)外全收录, 地面观星/月面以嵌入放映
  }
  function cineShow(k) {
    const sc = HISTORY_SCENES[CINEMA.order[k]];
    const fr = $("cineFrame");
    if (sc.sky || sc.act === "moon") {   // 地面观星/月面: iframe 嵌入放映, 不跳页
      try { histSeen[sc.y] = 1; localStorage.setItem("ss_hist", JSON.stringify(histSeen)); } catch (e) { /* 忽略 */ }
      award("history");
      if (Object.keys(histSeen).length >= HISTORY_SCENES.length) award("historian");
      fr.src = sc.sky ? `sky.html#lat=${sc.sky[0]}&lon=${sc.sky[1]}&jd=${sc.sky[2]}` : "moon.html";
      fr.style.display = "block";
    } else {
      fr.style.display = "none";
      goHistory(CINEMA.order[k], true);
    }
    const bar = $("cineBar");
    bar.style.display = "block";
    $("cineTitle").textContent = `${sc.y} · ${sc.t}`;
    $("cineText").textContent = sc.d;
    CINEMA.t = 0;
    CINEMA.dwell = sc.act === "carrington" ? 48 : sc.act === "voyager" ? 26 : (sc.sky || sc.act === "moon") ? 20 : 16;
  }
  function cineCleanup(k) {
    const sc = HISTORY_SCENES[CINEMA.order[k]];
    if (!sc) return;
    if (sc.act === "voyager") endReplay();
    if (sc.act === "carrington") { try { if (MAG.on) magExit(); } catch (e) { /* 桩 */ } }
  }
  function cineStart() {
    CINEMA.order = cineOrder();
    if (!CINEMA.order.length) return;
    CINEMA.on = true;
    CINEMA.k = 0;
    $("histModal").classList.remove("show");
    audioPoke();
    sfxChime();
    cineShow(0);
  }
  function cineNext() {
    cineCleanup(CINEMA.k);
    CINEMA.k += 1;
    if (CINEMA.k >= CINEMA.order.length) { cineStop(true); return; }
    cineShow(CINEMA.k);
  }
  function cineStop(done) {
    if (!CINEMA.on) return;
    cineCleanup(CINEMA.k);
    CINEMA.on = false;
    $("cineBar").style.display = "none";
    const fr = $("cineFrame");
    fr.style.display = "none";
    fr.src = "about:blank";
    if (done) award("cinema");
  }
  function tickCinema(dt) {
    if (!CINEMA.on) return;
    CINEMA.t += dt;
    if (CINEMA.t >= CINEMA.dwell) cineNext();
  }

  /* ---------------- 天象日历导出 .ics(纯前端, 未来一年) ---------------- */
  function buildIcs() {
    const nowJd = 2440587.5 + Date.now() / 86400000;
    const evs = EVENTS.filter((ev) => ev.jd > nowJd && ev.jd < nowJd + 366);
    const p2 = (n) => String(n).padStart(2, "0");
    const fmt = (jdq) => {
      const d = new Date((jdq - 2440587.5) * 86400000);
      return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}00Z`;
    };
    const esc = (t) => t.replace(/([,;])/g, "\\$1");
    let out = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//实时太阳系//天象日历//CN\r\n";
    for (const ev of evs) {
      out += `BEGIN:VEVENT\r\nUID:ss-${ev.jd.toFixed(4)}@realtime-solar\r\nDTSTAMP:${fmt(nowJd)}\r\nDTSTART:${fmt(ev.jd)}\r\nSUMMARY:${esc(ev.cn)}\r\nDESCRIPTION:来自「实时太阳系」天象日历\r\nEND:VEVENT\r\n`;
    }
    return out + "END:VCALENDAR\r\n";
  }
  function exportIcs() {
    try {
      scanAstroEvents();
      const blob = new Blob([buildIcs()], { type: "text/calendar;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "实时太阳系天象.ics";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      sfxChime();
    } catch (e) { /* 桩环境无 Blob */ }
  }

  /* ---------------- 流星雨微爆: 极大 ±0.9 天时地球周围辐射状流星线 ---------------- */
  let metBurstObj = null;
  function updateMeteorBurst() {
    let hit = null;
    if (eventsReady && star3DBlend < 0.35) {
      for (const ev of EVENTS) {
        if (ev.jd > jd + 0.9) break;   // EVENTS 已排序
        if (ev.type === "meteor" && Math.abs(ev.jd - jd) < 0.9) { hit = ev; break; }
      }
    }
    if (!hit) { if (metBurstObj) metBurstObj.visible = false; return; }
    if (!metBurstObj) {
      const NSEG = 46;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(NSEG * 6), 3));
      metBurstObj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
        color: 0xcfe0ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      metBurstObj.frustumCulled = false;
      const dirs = new Float32Array(NSEG * 3);
      let rr = 13579;
      const rnd = () => { rr = (rr * 1103515245 + 12345) & 0x7fffffff; return rr / 0x7fffffff * 2 - 1; };
      for (let i = 0; i < NSEG * 3; i += 1) dirs[i] = rnd();
      metBurstObj.userData.dirs = dirs;
      scene.add(metBurstObj);
    }
    const p = scenePos.Earth;
    if (!p) { metBurstObj.visible = false; return; }
    metBurstObj.visible = true;
    const R = sceneRadius.Earth || 1;
    const dirs = metBurstObj.userData.dirs;
    const arr = metBurstObj.geometry.attributes.position.array;
    const tt = performance.now() * 0.001;
    for (let i = 0; i < 46; i += 1) {
      let dx = dirs[i * 3], dy = dirs[i * 3 + 1], dz = dirs[i * 3 + 2];
      const L = Math.hypot(dx, dy, dz) || 1;
      dx /= L; dy /= L; dz /= L;
      const k3 = 1 - ((tt * 0.55 + i * 0.37) % 1);   // 向内坠(流星入大气的方向感)
      const r1 = R * (2.0 + 6.8 * k3);
      const r2 = r1 + R * 1.7;
      arr[i * 6] = p[0] + dx * r1; arr[i * 6 + 1] = p[1] + dy * r1; arr[i * 6 + 2] = p[2] + dz * r1;
      arr[i * 6 + 3] = p[0] + dx * r2; arr[i * 6 + 4] = p[1] + dy * r2; arr[i * 6 + 5] = p[2] + dz * r2;
    }
    metBurstObj.geometry.attributes.position.needsUpdate = true;
    metBurstObj.material.opacity = 0.3 + 0.22 * Math.sin(tt * 2.6);
  }

  if (typeof window !== "undefined") {
    window.__lnch = { LNCH, ROCKETS, tick: tickLaunch, dispose: lnchDispose, builtCount: () => Object.keys(LNCH.builtMap).length, table: cz5AscentTable, tableFor: (id) => ascentTable(ROCKETS[id].phys), boosterFor: (id) => f9BoosterTable(ascentTable(ROCKETS[id].phys), ROCKETS[id].booster.sepT, ROCKETS[id].booster.lzDr, ROCKETS[id].booster.opts), setRocket: (id) => { LNCH.rk = id; LNCH.cfg = ROCKETS[id]; LNCH.lat = ROCKETS[id].site.lat; LNCH.lon = ROCKETS[id].site.lon; LNCH.incAz = ROCKETS[id].az * D2R; LNCH.table = null; }, insertion: lnchInsertionState, enter: lnchEnter, exit: lnchExit, tc: lnchTC };
    window.__sites = { SITES, dir: geoDirEcl, count: () => (siteBeacons ? siteBeacons.length : 0) };
    window.__apollo = { A: APOLLO, tick: tickApollo, solve: tliSolve, tof: tliTofA };
    window.__enc = { check: checkEncounter, EPOCHS: ENC_EPOCHS, seen: encSeen };
    window.__probeEarth = () => {
      const e1 = heliocentricKm(bodyByName.Earth.orbit_j2000, jd + 0.005);
      const e0 = heliocentricKm(bodyByName.Earth.orbit_j2000, jd - 0.005);
      return { r: worldKm.Earth ? worldKm.Earth.slice() : heliocentricKm(bodyByName.Earth.orbit_j2000, jd).slice(0, 3),
               v: [(e1[0] - e0[0]) / 864, (e1[1] - e0[1]) / 864, (e1[2] - e0[2]) / 864] };
    };
    window.__met = { peak: meteorPeakJdFull, refine: meteorPeakRefine, SHOWERS: METEOR_SHOWERS, sunLon: sunLonDeg };
    window.__ics = buildIcs;
    window.__cine = { CINEMA, start: cineStart, next: cineNext, stop: cineStop, order: cineOrder };
    window.__jsh = { geom: jshadowGeom, count: () => jshCount };
  }

  function renderHistory() {
    const el = $("histList");
    let seen = 0;
    el.innerHTML = HISTORY_SCENES.map((sc, i) => {
      const on = !!histSeen[sc.y] || !!histSeen[i];
      if (on) seen += 1;
      return `<div class="histRow${on ? " seen" : ""}"><span class="hy">${sc.y}</span><b>${sc.t}</b><p>${sc.d}</p>` +
        `<button data-hi="${i}">${sc.sky ? "去现场(地面观星)" : sc.act === "moon" ? "去月面" : "前往"}</button></div>`;
    }).join("");
    $("histCount").textContent = `${seen} / ${HISTORY_SCENES.length}`;
    for (const b of el.querySelectorAll("button[data-hi]")) {
      b.addEventListener("click", () => goHistory(Number(b.dataset.hi)));
    }
  }

  /* ================= 阶段26 · 开幕: 门与俯冲 =================
   * 门(音频解锁+今夜真话) → 群星 → 俯冲(星际混合退出+尺度切观感+日期翻到今天) → 抵达地球。
   * 深链无条件绕过;点击任意处/Esc 秒跳;三态记忆(首访全长/回访短俯冲/勾选永久直进)。 */
  const INTRO = { state: "off", t: 0, full: true, guideAfter: false, camA: null, camB: null, camC: null, jdTarget: 0, driving: false };
  function introBypass() {
    try {
      if (typeof location !== "undefined" && location.hash && location.hash.length > 2) return true;
      if (localStorage.getItem("ss_intro") === "off") return true;
    } catch (e) { return true; }   // 无 localStorage 环境(桩测)直接跳过
    return reducedMotion;
  }
  function introStart() {
    INTRO.full = (() => { try { return !localStorage.getItem("ss_intro_seen"); } catch (e) { return false; } })();
    INTRO.state = "gate";
    INTRO.driving = true;
    document.body.classList.add("intro");
    // 场景预置: 置身星场(真实尺度), 引擎顺带热身
    stars3D = true;
    star3DBlend = 1;
    scaleBlend = 0;
    refreshScaleButtons();
    playing = false;
    jd = J2000;
    INTRO.jdTarget = 2440587.5 + Date.now() / 86400000;
    camera.position.set(5.4e7, -1.6e7, 2.4e7);
    controls.target.set(0, 0, 0);
    // 门上的今夜真话
    try {
      const ph = moonPhaseNow(INTRO.jdTarget);
      $("gateTonight").textContent = `今夜 · ${ph.name}, 照亮 ${(ph.k * 100).toFixed(0)}% —— 进入后, 你看到的就是此刻真实的天空`;
    } catch (e) { $("gateTonight").textContent = "进入后, 你看到的就是此刻真实的天空"; }
    $("introGate").classList.add("show");
    if (typeof document.addEventListener === "function") {
      document.addEventListener("pointerdown", introSkipListener, true);
      document.addEventListener("keydown", introEscListener, true);
    }
  }
  function introSkipListener(e) {
    if (INTRO.state === "gate") return;   // 门内点击交给按钮
    introFinish(true);
  }
  function introEscListener(e) {
    if (e.code === "Escape" && INTRO.state !== "off") introFinish(true);
  }
  function introEnterClicked(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    audioPoke();
    sfxTone(220, 220, 1.6, "sine", 0.12);
    sfxTone(330, 330, 1.9, "sine", 0.09, 0.12);
    sfxTone(440, 440, 2.2, "sine", 0.07, 0.25);
    try {
      if ($("gateSkipChk").checked) localStorage.setItem("ss_intro", "off");
      localStorage.setItem("ss_intro_seen", "1");
    } catch (e2) { /* 忽略 */ }
    $("introGate").classList.add("fading");
    INTRO.state = "stars";
    INTRO.t = 0;
    // 相机路径三控制点: 星场 → 太阳上方全景(观感) → 地球端点由 setFocus 收尾
    INTRO.camA = camera.position.clone();
    INTRO.camB = new THREE.Vector3(900, -3400, 1900);
  }
  function introFinish(skipped) {
    if (INTRO.state === "off") return;
    INTRO.state = "off";
    INTRO.driving = false;
    jd = INTRO.jdTarget;
    stars3D = false;
    star3DBlend = 0;
    scaleBlend = 1;
    refreshScaleButtons();
    $("introGate").classList.remove("show");
    document.body.classList.remove("intro");
    if (typeof document.removeEventListener === "function") {
      document.removeEventListener("pointerdown", introSkipListener, true);
      document.removeEventListener("keydown", introEscListener, true);
    }
    updateSystem();
    setFocus("Earth", true);
    if (!playing) togglePlay();
    if (INTRO.guideAfter) {
      INTRO.guideAfter = false;
      setTimeout(startGuide, 900);
    }
  }
  function easeIO(k) { return k * k * (3 - 2 * k); }
  function tickIntro(dt) {
    if (INTRO.state === "off" || INTRO.state === "gate") return;
    INTRO.t += dt;
    const durStars = INTRO.full ? 2.6 : 1.0;
    const durDive = INTRO.full ? 6.5 : 2.2;
    if (INTRO.state === "stars") {
      star3DBlend = 1;
      scaleBlend = 0;
      const k = clamp(INTRO.t / durStars, 0, 1);
      jd = lerp(J2000, INTRO.jdTarget, easeIO(k * 0.45));   // 日期开始翻动
      camera.position.copy(INTRO.camA).multiplyScalar(1 - 0.06 * easeIO(k));
      if (INTRO.t >= durStars) { INTRO.state = "dive"; INTRO.t = 0; sfxWhoosh(); }
      return;
    }
    if (INTRO.state === "dive") {
      const k = clamp(INTRO.t / durDive, 0, 1);
      const e1 = easeIO(k);
      star3DBlend = 1 - e1;                       // 星场收拢
      scaleBlend = easeIO(clamp((k - 0.25) / 0.6, 0, 1));   // 中段切入观感尺度, 轨道圈显形
      jd = lerp(J2000, INTRO.jdTarget, 0.45 + 0.55 * easeIO(clamp(k / 0.7, 0, 1)));
      // 相机: 星场 → 太阳上方全景
      const kk = easeIO(clamp(k / 0.85, 0, 1));
      camera.position.set(
        lerp(INTRO.camA.x * 0.94, INTRO.camB.x, kk),
        lerp(INTRO.camA.y * 0.94, INTRO.camB.y, kk),
        lerp(INTRO.camA.z * 0.94, INTRO.camB.z, kk)
      );
      controls.target.set(0, 0, 0);
      if (INTRO.t >= durDive) {
        INTRO.state = "arrive";
        INTRO.t = 0;
        star3DBlend = 0;
        stars3D = false;
        scaleBlend = 1;
        refreshScaleButtons();
        jd = INTRO.jdTarget;
        updateSystem();
        setFocus("Earth", false);   // 末段交给既有聚焦补间
      }
      return;
    }
    if (INTRO.state === "arrive" && INTRO.t > 1.35) {
      introFinish(false);
    }
  }

  if (typeof window !== "undefined") window.__intro = {
    INTRO,
    enter: introEnterClicked,
    finish: introFinish,
    bypass: introBypass,
    get jd() { return jd; },
    get playing() { return playing; },
    get blends() { return { s3: star3DBlend, sb: scaleBlend, s3d: stars3D }; }
  };

  /* ================= 阶段25 · 磁层剧场: 太阳风 vs 地球磁场 =================
   * 全真实尺度(单位 R⊕, 组缩放=地球场景半径)。磁层顶: Shue 经验模型
   * r(θ)=r0·(2/(1+cosθ))^0.58, 驻点 r0 由太阳风动压六次方根定律实时解出
   * (宁静 400km/s·5cm⁻³ ⇒ 10 R⊕);弓激波 1.3 倍相似面;磁力线偶极族 r=L·cos²λ
   * 日侧受限于磁层顶、夜侧拉成磁尾;极光椭圆磁纬 ~67°, 随动压增亮扩张。 */
  const MAG = {
    on: false, v: 400, n: 5, r0: 10, storm: null, stormT: 0,
    group: null, mpMesh: null, bsMesh: null, lines: [], lineGroup: null,
    auroraN: null, auroraS: null, moonRing: null, parts: null, pData: null,
    hitGlow: 0, _lastR0: -1
  };
  function magR0(v, n) { return 10 * Math.pow((5 * 400 * 400) / (Math.max(n, 0.2) * v * v), 1 / 6); }
  function magShueR(theta, r0) { return r0 * Math.pow(2 / (1 + Math.cos(Math.min(theta, 2.7))), 0.58); }
  function magLatheFrom(rFn, segTheta, thetaMax, mat) {
    const pts = [];
    for (let i = 0; i <= segTheta; i += 1) {
      const th = i / segTheta * thetaMax;
      const r = rFn(th);
      pts.push(new THREE.Vector2(Math.max(r * Math.sin(th), 0.001), r * Math.cos(th)));
    }
    const geo = new THREE.LatheGeometry(pts, 40);
    geo.rotateZ(-Math.PI / 2);   // 车削轴 y → 对准 +x(日向)
    return new THREE.Mesh(geo, mat);
  }
  function magRebuildSurfaces() {
    const r0 = MAG.r0;
    if (Math.abs(r0 - MAG._lastR0) < 0.05) return;
    MAG._lastR0 = r0;
    if (MAG.mpMesh) { MAG.mpMesh.geometry.dispose(); MAG.group.remove(MAG.mpMesh); }
    if (MAG.bsMesh) { MAG.bsMesh.geometry.dispose(); MAG.group.remove(MAG.bsMesh); }
    MAG.mpMesh = magLatheFrom((th) => magShueR(th, r0), 40, 2.62,
      new THREE.MeshBasicMaterial({ color: 0x6ea8ff, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false }));
    MAG.bsMesh = magLatheFrom((th) => 1.3 * r0 * Math.pow(2 / (1 + Math.cos(Math.min(th, 2.6))), 0.55), 40, 2.45,
      new THREE.MeshBasicMaterial({ color: 0x9f7bff, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false }));
    MAG.group.add(MAG.mpMesh);
    MAG.group.add(MAG.bsMesh);
    magDeformLines();
  }
  /* 偶极磁力线: 昼侧受磁层顶约束, 夜侧拉尾 */
  function magFieldPolyline(L, lonRad, r0) {
    const lam0 = Math.acos(Math.sqrt(1 / L));
    const pts = [];
    for (let i = 0; i <= 48; i += 1) {
      const lam = -lam0 + (i / 48) * 2 * lam0;
      const r = Math.max(L * Math.cos(lam) * Math.cos(lam), 1.001);
      let x = r * Math.cos(lam) * Math.cos(lonRad);
      const y = r * Math.cos(lam) * Math.sin(lonRad);
      const z = r * Math.sin(lam);
      if (x > 0) {   // 昼侧: 限制在磁层顶内
        const th = Math.acos(clamp(x / Math.max(Math.hypot(x, y, z), 1e-6), -1, 1));
        const lim = magShueR(th, r0) * 0.92;
        const rr = Math.hypot(x, y, z);
        if (rr > lim) { const k = lim / rr; x *= k; }
      } else {       // 夜侧: 磁尾拉伸
        x *= 2.6 + (10 - r0) * 0.35;
      }
      pts.push(x, y, z);
    }
    return pts;
  }
  function magDeformLines() {
    for (const ln of MAG.lines) {
      const pts = magFieldPolyline(ln.L, ln.lon, MAG.r0);
      const arr = ln.line.geometry.attributes.position.array;
      for (let i = 0; i < pts.length; i += 1) arr[i] = pts[i];
      ln.line.geometry.attributes.position.needsUpdate = true;
    }
  }
  function buildMagnetosphere() {
    MAG.group = new THREE.Group();
    MAG.group.visible = false;
    scene.add(MAG.group);
    // 磁力线族(挂磁倾斜子组)
    MAG.lineGroup = new THREE.Group();
    MAG.group.add(MAG.lineGroup);
    for (const L of [2.5, 4, 6, 9]) {
      for (let m = 0; m < 12; m += 1) {
        const lon = m / 12 * Math.PI * 2;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(49 * 3), 3));
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
          color: 0x7fc4ff, transparent: true, opacity: L > 5 ? 0.16 : 0.24, depthWrite: false
        }));
        line.frustumCulled = false;
        MAG.lineGroup.add(line);
        MAG.lines.push({ L, lon, line });
      }
    }
    // 极光椭圆(磁纬 ~67°, 挂磁倾斜子组)
    const mkAurora = (south) => {
      const tor = new THREE.Mesh(new THREE.TorusGeometry(Math.sin(23 * D2R) * 1.06, 0.05, 8, 64),
        new THREE.MeshBasicMaterial({ color: 0x66ff9a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      tor.position.z = (south ? -1 : 1) * Math.cos(23 * D2R) * 1.06;
      MAG.lineGroup.add(tor);
      return tor;
    };
    MAG.auroraN = mkAurora(false);
    MAG.auroraS = mkAurora(true);
    // 月球轨道参考环(60.3 R⊕): 月球每月穿行磁尾
    const mr = [];
    for (let i = 0; i <= 96; i += 1) {
      const a = i / 96 * Math.PI * 2;
      mr.push(new THREE.Vector3(Math.cos(a) * 60.3, Math.sin(a) * 60.3, 0));
    }
    MAG.moonRing = new THREE.Line(new THREE.BufferGeometry().setFromPoints(mr),
      new THREE.LineBasicMaterial({ color: 0xc9ccd6, transparent: true, opacity: 0.18, depthWrite: false }));
    MAG.group.add(MAG.moonRing);
    // 太阳风粒子(CPU 动力学: 弓激波偏转/磁层顶滑行/极尖漏斗)
    const N = 2200;
    MAG.pData = new Float32Array(N * 6);
    for (let i = 0; i < N; i += 1) magSpawn(i, true);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    MAG.parts = new THREE.Points(pg, new THREE.PointsMaterial({
      color: 0xffd9a0, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false
    }));
    MAG.parts.frustumCulled = false;
    MAG.group.add(MAG.parts);
  }
  function magSpawn(i, randomX) {
    const d = MAG.pData;
    d[i * 6] = randomX ? 20 + Math.random() * 60 : 78 + Math.random() * 6;
    d[i * 6 + 1] = (Math.random() - 0.5) * 90;
    d[i * 6 + 2] = (Math.random() - 0.5) * 90;
    d[i * 6 + 3] = -1; d[i * 6 + 4] = 0; d[i * 6 + 5] = 0;
  }
  function updateMagParticles(dt) {
    const d = MAG.pData, N = d.length / 6;
    const spd = MAG.v / 400 * 26 * dt;   // 展示加速(粒子横越磁层秒级可见)
    const r0 = MAG.r0;
    const arr = MAG.parts.geometry.attributes.position.array;
    let hits = 0;
    for (let i = 0; i < N; i += 1) {
      let x = d[i * 6], y = d[i * 6 + 1], z = d[i * 6 + 2];
      let vx = d[i * 6 + 3], vy = d[i * 6 + 4], vz = d[i * 6 + 5];
      x += vx * spd; y += vy * spd; z += vz * spd;
      const r = Math.hypot(x, y, z);
      const th = Math.acos(clamp(x / Math.max(r, 1e-6), -1, 1));
      const mp = magShueR(th, r0);
      if (r < mp * 1.06 && x > -mp * 2) {
        const yz = Math.hypot(y, z);
        if (th < 0.5 && yz < r0 * 0.35 && Math.random() < 0.05) {
          hits += 1;              // 极尖漏斗 → 点亮极光
          magSpawn(i, false);
          continue;
        }
        // 沿磁层顶滑行: velocity 去掉法向分量(近似径向法线)
        const nx = x / r, ny = y / r, nz = z / r;
        const vn = vx * nx + vy * ny + vz * nz;
        vx -= vn * nx * 1.05; vy -= vn * ny * 1.05; vz -= vn * nz * 1.05;
        const vm = Math.hypot(vx, vy, vz) || 1;
        vx /= vm; vy /= vm; vz /= vm;
        const k = mp * 1.07 / r;
        x *= k; y *= k; z *= k;
      }
      if (x < -95 || Math.abs(y) > 100 || Math.abs(z) > 100) { magSpawn(i, false); continue; }
      d[i * 6] = x; d[i * 6 + 1] = y; d[i * 6 + 2] = z;
      d[i * 6 + 3] = vx; d[i * 6 + 4] = vy; d[i * 6 + 5] = vz;
      arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
    }
    MAG.hitGlow = Math.min(1.6, MAG.hitGlow * 0.97 + hits * 0.02);
    MAG.parts.geometry.attributes.position.needsUpdate = true;
  }

  /* 磁层模式生命周期 + CME 风暴剧本 */
  const MAG_STORM = [
    [0, 400, 5, "宁静太阳风 · 磁层顶稳在 10 R⊕, 极光只是极圈里的微光"],
    [8, 430, 6, "日冕物质抛射(CME)正在逼近 —— 一团十亿吨级的等离子体, 以 800 km/s 袭来"],
    [14, 800, 20, "冲击到达!动压跃升 12 倍, 磁层顶被压进 ~6.5 R⊕ —— 弓激波在燃烧"],
    [22, 750, 16, "磁尾重联 · 储存的磁能雪崩式释放, 极光爆发并向中纬度扩张 —— 卡林顿级夜空"],
    [34, 520, 8, "风暴衰退 · 磁层缓慢弹回 —— 这场仗, 地磁场每天都在打"],
    [46, 400, 5, null]
  ];
  function magSetWind(v, n) {
    MAG.v = clamp(v, 250, 1000);
    MAG.n = clamp(n, 0.5, 40);
    MAG.r0 = magR0(MAG.v, MAG.n);
    $("magV").value = MAG.v;
    $("magN").value = MAG.n;
    magReadout();
    magRebuildSurfaces();
  }
  function magReadout() {
    const pres = 1.6726e-6 * MAG.n * MAG.v * MAG.v;   // nPa (n[cm-3]·mp·v²)
    const kp = clamp(Math.round((pres - 1.5) / 2.2), 0, 9);
    $("magRead").innerHTML = `动压 <b>${pres.toFixed(1)} nPa</b> · 磁层顶驻点 <b>${MAG.r0.toFixed(1)} R⊕</b> · 地磁活动 ≈ <b>Kp ${kp}</b>`;
  }
  function magEnter(withStorm) {
    MAG.on = true;
    MAG.group.visible = true;
    $("magPanel").classList.add("show");
    stopTour();
    endReplay();
    endLightCruise();
    if (galFrame) setGalFrame(false);
    if (deepTime && setDeepTimeRef) setDeepTimeRef(false);
    if (stars3D) { stars3D = false; $("cosmoBtn").classList.remove("active"); $("cosmoHint").classList.remove("show"); }
    animateScaleTo(0);
    setFocus("Earth", false);
    daysPerSecond = 1 / 24;
    if (!playing) togglePlay();
    // 侧视机位: 看磁尾展开
    setTimeout(() => {
      const ep = scenePos.Earth;
      if (ep) {
        const eR = sceneRadius.Earth || 6.4;
        camera.position.set(ep[0] + eR * 26, ep[1] + eR * 62, ep[2] + eR * 22);
        controls.target.set(ep[0] - eR * 12, ep[1], ep[2]);
      }
    }, 40);
    magSetWind(400, 5);
    MAG.storm = withStorm ? 0 : null;
    MAG.stormT = 0;
    if (withStorm) sfxRumble();
  }
  function magExit() {
    MAG.on = false;
    MAG.group.visible = false;
    MAG.storm = null;
    $("magPanel").classList.remove("show");
  }
  const _qMagT = new THREE.Quaternion(), _qMagS = new THREE.Quaternion(), _vMagX = new THREE.Vector3();
  function updateMagnetosphere(dt) {
    if (!MAG.group) return;
    if (!MAG.on) { MAG.group.visible = false; return; }
    const ep = scenePos.Earth, eW = worldKm.Earth;
    if (!ep || !eW) return;
    MAG.group.visible = true;
    MAG.group.position.set(ep[0], ep[1], ep[2]);
    MAG.group.scale.setScalar(sceneRadius.Earth || 1);
    // 对准: +x 指向太阳(风来向), 结构轴随日地连线
    _vMagX.set(-eW[0], -eW[1], -eW[2]).normalize();
    _qMagT.setFromUnitVectors(new THREE.Vector3(1, 0, 0), _vMagX);
    MAG.group.quaternion.copy(_qMagT);
    // 磁力线/极光子组: 叠加磁轴倾角(11°)绕日地系摆动(随地球自转晃)
    const spinPh = Math.PI * 2 * (0.7790572732640 + 1.00273781191135448 * (jd - J2000));
    _qMagS.setFromAxisAngle(new THREE.Vector3(Math.cos(spinPh), Math.sin(spinPh), 0).normalize(), 11 * D2R);
    MAG.lineGroup.quaternion.copy(_qMagS);
    // 风暴剧本推进
    if (MAG.storm !== null) {
      MAG.stormT += dt;
      const st = MAG_STORM;
      while (MAG.storm < st.length - 1 && MAG.stormT >= st[MAG.storm + 1][0]) {
        MAG.storm += 1;
        const row = st[MAG.storm];
        if (row[3] === null) {
          MAG.storm = null;
          $("magCap").textContent = "风暴结束 —— 磁层完好如初。";
          award("guardian");
          break;
        }
        $("magCap").textContent = row[3];
        if (MAG.storm === 2) sfxRumble();
        if (MAG.storm === 3) sfxWhoosh();
      }
      if (MAG.storm !== null) {
        // 段间参数平滑
        const i2 = MAG.storm, nx = Math.min(i2 + 1, st.length - 1);
        const t0 = st[i2][0], t1 = Math.max(st[nx][0], t0 + 1);
        const k = clamp((MAG.stormT - t0) / (t1 - t0), 0, 1);
        magSetWind(lerp(st[i2][1], st[nx][1], k), lerp(st[i2][2], st[nx][2], k));
      }
    }
    // 极光响应: 动压 → 亮度/扩张; 极尖粒子命中 → 闪烁
    const pr = (MAG.n * MAG.v * MAG.v) / (5 * 400 * 400);
    const colat = clamp(23 + 9 * (pr - 1) / 11, 20, 34) * D2R;
    for (const [tor, sgn] of [[MAG.auroraN, 1], [MAG.auroraS, -1]]) {
      const rr = Math.sin(colat) * 1.06;
      tor.scale.setScalar(rr / (Math.sin(23 * D2R) * 1.06));
      tor.position.z = sgn * Math.cos(colat) * 1.06;
      tor.material.opacity = clamp(0.3 + 0.25 * (pr - 1) / 4 + MAG.hitGlow * 0.35, 0.25, 1);
    }
    updateMagParticles(dt);
  }

  /* ---------------- 星际视角: 太阳的银河轨迹(±5 万年, 穿过本地星场) ---------------- */
  let sunTrack = null, sunTrackMk = null, sunTrackLabels = [];
  function galDirPc(yr2) {   // 太阳相对本地静止标准的位移(pc, 黄道系)
    const k = 1.02269e-6;    // km/s → pc/yr
    return [GAL_V_ECL[0] * k * yr2, GAL_V_ECL[1] * k * yr2, GAL_V_ECL[2] * k * yr2];
  }
  function trackScenePos(yr2, out) {
    const p = galDirPc(yr2);
    const d = Math.max(Math.hypot(p[0], p[1], p[2]), 0.02);
    const r3 = Math.max(4.5e7 + 5.5e7 * (Math.log(d / 1.3) / 7.339), 1.0e7);
    out[0] = p[0] / d * r3; out[1] = p[1] / d * r3; out[2] = p[2] / d * r3;
    return out;
  }
  function buildSunTrack() {
    const N = 100;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((N + 1) * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array((N + 1) * 3), 3));
    const tmp = [0, 0, 0];
    const arr = geo.attributes.position.array, colA = geo.attributes.color.array;
    for (let i = 0; i <= N; i += 1) {
      const yr2 = (i / N - 0.5) * 100000;   // -5 万 → +5 万
      trackScenePos(yr2, tmp);
      arr[i * 3] = tmp[0]; arr[i * 3 + 1] = tmp[1]; arr[i * 3 + 2] = tmp[2];
      const future = yr2 >= 0;
      const b = 0.25 + 0.55 * Math.abs(i / N - 0.5) * 2 * 0 + 0.45;
      colA[i * 3] = future ? 1.0 * 0.9 : 0.55;
      colA[i * 3 + 1] = future ? 0.82 : 0.6;
      colA[i * 3 + 2] = future ? 0.45 : 0.75;
    }
    sunTrack = new THREE.Line(geo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0, depthWrite: false
    }));
    sunTrack.frustumCulled = false;
    sunTrack.visible = false;
    scene.add(sunTrack);
    // 当前位置滑标(深时拨到哪, 太阳就在轨迹上的哪)
    sunTrackMk = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeProbeTexture(), color: new THREE.Color("#ffd27a"), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, sizeAttenuation: false
    }));
    sunTrackMk.scale.set(0.03, 0.03, 1);
    sunTrackMk.frustumCulled = false;
    sunTrackMk.visible = false;
    scene.add(sunTrackMk);
    const mkLab = (txt, yr2) => {
      const sp = makeStarNameSprite(txt);
      const t2 = [0, 0, 0];
      trackScenePos(yr2, t2);
      sp.position.set(t2[0], t2[1], t2[2]);
      sunTrackLabels.push(sp);
      scene.add(sp);
    };
    mkLab("5 万年前 · 38.4 光年外", -50000);
    mkLab("2.5 万年前", -25000);
    mkLab("+2.5 万年", 25000);
    mkLab("太阳向点 → 天鹅座 · +5 万年", 50000);
  }
  const _stTmp = [0, 0, 0];
  function updateSunTrack(dt) {
    if (!sunTrack) return;
    const on = star3DBlend > 0.55 && skyModeN < 2;
    const target = on ? 0.4 : 0;
    sunTrack.material.opacity += (target - sunTrack.material.opacity) * Math.min(1, dt * 2.5);
    sunTrack.visible = sunTrack.material.opacity > 0.02;
    for (const L of sunTrackLabels) {
      L.visible = on;
      L.material.opacity += ((on ? 0.6 : 0) - L.material.opacity) * Math.min(1, dt * 2.5);
    }
    const yr2 = yearsFromJ2000();
    const showMk = on && Math.abs(yr2) > 400;
    sunTrackMk.visible = showMk;
    if (showMk) {
      trackScenePos(clamp(yr2, -50000, 50000), _stTmp);
      sunTrackMk.position.set(_stTmp[0], _stTmp[1], _stTmp[2]);
    }
  }

  /* ---------------- 太阳的螺旋 · 银河参考系 ----------------
   * 太阳系整体以 ~233 km/s 奔向天鹅座(银道 UVW=(11.1,232.24,7.25) 经赤道系转黄道系)。
   * 相对物理使本体渲染无感——运动经"尾迹"显形: 记录各天体日心历史位置,
   * 渲染时按 -V·Δt 回移, 过去便沿速度反方向滑出, 拧成真实的斜螺旋。 */
  const GAL_V_ECL = (() => {
    const U = 11.1, V = 232.24, W = 7.25;   // km/s, 银道系
    const AG = [   // 赤道(J2000)→银道 矩阵, 转置即逆
      [-0.0548755604, -0.8734370902, -0.4838350155],
      [0.4941094279, -0.4448296300, 0.7469822445],
      [-0.8676661490, -0.1980763734, 0.4559837762]
    ];
    const eq = [
      AG[0][0] * U + AG[1][0] * V + AG[2][0] * W,
      AG[0][1] * U + AG[1][1] * V + AG[2][1] * W,
      AG[0][2] * U + AG[1][2] * V + AG[2][2] * W
    ];
    const ce = Math.cos(23.4392911 * Math.PI / 180), se = Math.sin(23.4392911 * Math.PI / 180);
    return [eq[0], eq[1] * ce + eq[2] * se, -eq[1] * se + eq[2] * ce];   // → 黄道系 km/s
  })();
  let galFrame = false, galComp = 0.1;
  const GAL_BODIES = ["Sun", "Mercury", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"];
  const GAL_N = 560;
  let galTrails = null, galLastJd = null;
  function galWindowDays() { return 365.25 * (galComp >= 1 ? 4 : galComp >= 0.1 ? 14 : 45); }
  function buildGalTrails() {
    galTrails = GAL_BODIES.map((nm) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(GAL_N * 3), 3));
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(GAL_N * 3), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false
      }));
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      const col = new THREE.Color(nm === "Sun" ? "#ffd27a" : (ACCENT[nm] || "#cfe0ff"));
      return { nm, line, col, jds: new Float64Array(GAL_N), pts: new Float64Array(GAL_N * 3), n: 0 };
    });
  }
  function galReset() {
    if (!galTrails) return;
    for (const t of galTrails) { t.n = 0; t.line.geometry.setDrawRange(0, 0); }
    galLastJd = null;
  }
  function updateGalTrails(anchor, dx, dy, dz) {
    if (!galTrails) return;
    for (const t of galTrails) t.line.visible = galFrame;
    if (!galFrame) return;
    const win = galWindowDays();
    if (galLastJd === null || Math.abs(jd - galLastJd) > win) { galReset(); galLastJd = jd - 1e-6; }
    // 采样
    if (Math.abs(jd - galLastJd) >= win / (GAL_N - 20)) {
      galLastJd = jd;
      for (const t of galTrails) {
        const w = worldKm[t.nm] || [0, 0, 0];
        if (t.n === GAL_N) {
          t.jds.copyWithin(0, 1);
          t.pts.copyWithin(0, 3);
          t.n -= 1;
        }
        t.jds[t.n] = jd;
        t.pts[t.n * 3] = w[0]; t.pts[t.n * 3 + 1] = w[1]; t.pts[t.n * 3 + 2] = w[2];
        t.n += 1;
      }
    }
    // 渲染: 过去点按 -V·Δt 回移(银河参考系显形)
    const kc = 86400 * galComp;
    for (const t of galTrails) {
      const arr = t.line.geometry.attributes.position.array;
      const colA = t.line.geometry.attributes.color.array;
      for (let i = 0; i < t.n; i += 1) {
        const dtD = jd - t.jds[i];
        _rel[0] = t.pts[i * 3] - GAL_V_ECL[0] * dtD * kc - anchor[0];
        _rel[1] = t.pts[i * 3 + 1] - GAL_V_ECL[1] * dtD * kc - anchor[1];
        _rel[2] = t.pts[i * 3 + 2] - GAL_V_ECL[2] * dtD * kc - anchor[2];
        mapPoint(_rel, _p);
        arr[i * 3] = _p[0] - dx; arr[i * 3 + 1] = _p[1] - dy; arr[i * 3 + 2] = _p[2] - dz;
        const b = 0.1 + 0.9 * Math.pow(i / Math.max(t.n - 1, 1), 1.4);
        colA[i * 3] = t.col.r * b; colA[i * 3 + 1] = t.col.g * b; colA[i * 3 + 2] = t.col.b * b;
      }
      t.line.geometry.setDrawRange(0, t.n);
      t.line.geometry.attributes.position.needsUpdate = true;
      t.line.geometry.attributes.color.needsUpdate = true;
    }
  }
  function setGalFrame(on) {
    galFrame = on;
    $("galBtn").classList.toggle("active", on);
    $("galBtn").textContent = on ? "关闭银河参考系" : "开启 · 看太阳拖着全家狂奔";
    $("galHint").style.display = on ? "block" : "none";
    galReset();
    if (on) {
      if (deepTime && setDeepTimeRef) setDeepTimeRef(false);
      if (stars3D) { stars3D = false; $("cosmoBtn").classList.remove("active"); $("cosmoHint").classList.remove("show"); }
      animateScaleTo(0);
      setFocus("Sun", true);
      // 侧视机位: 垂直于运动方向, 螺旋展开最清楚
      const vL = Math.hypot(GAL_V_ECL[0], GAL_V_ECL[1], GAL_V_ECL[2]);
      const vx = GAL_V_ECL[0] / vL, vy = GAL_V_ECL[1] / vL, vz = GAL_V_ECL[2] / vL;
      let px2 = -vy, py2 = vx, pz2 = 0;
      const pL = Math.hypot(px2, py2, pz2) || 1;
      const D = (49.06 * galComp * galWindowDays() / 365.25 * 0.55 + 8) * AU_KM / SCALE.sceneUnitKm;
      camera.position.set(
        controls.target.x + (px2 / pL) * D + vx * D * 0.25,
        controls.target.y + (py2 / pL) * D + vy * D * 0.25,
        controls.target.z + 0.35 * D + vz * D * 0.25
      );
      if (!playing) togglePlay();
      award("helix");
    }
  }

  /* ---------------- 今夜天象(真实当前时刻, 与模拟时间无关) ---------------- */
  const _tm = [0, 0, 0];
  function moonPhaseNow(jdNow) {
    moonGeoKm(jdNow, _tm);
    const e = heliocentricKm(bodyByName.Earth.orbit_j2000, jdNow);
    const sx = -e[0], sy = -e[1], sz = -e[2];
    const cosPsi = (_tm[0] * sx + _tm[1] * sy + _tm[2] * sz) /
      (Math.hypot(_tm[0], _tm[1], _tm[2]) * Math.hypot(sx, sy, sz));
    const k = (1 - cosPsi) / 2;   // 照亮比
    // 盈亏: 月球黄经相对太阳黄经的去向
    const lm = Math.atan2(_tm[1], _tm[0]), ls = Math.atan2(sy, sx);
    let d = lm - ls;
    while (d < 0) d += Math.PI * 2;
    const waxing = d < Math.PI;
    let name;
    if (k < 0.03) name = "新月";
    else if (k > 0.97) name = "满月";
    else if (Math.abs(k - 0.5) < 0.06) name = waxing ? "上弦月" : "下弦月";
    else if (k < 0.5) name = waxing ? "娥眉月" : "残月";
    else name = waxing ? "盈凸月" : "亏凸月";
    return { k, name };
  }
  function refreshTonight() {
    const el = $("tonight");
    if (!el) return;
    const jdNow = 2440587.5 + Date.now() / 86400000;
    const ph = moonPhaseNow(jdNow);
    const e = heliocentricKm(bodyByName.Earth.orbit_j2000, jdNow);
    const ls = Math.atan2(-e[1], -e[0]);
    const vis = [];
    for (const nm of ["Mercury", "Venus", "Mars", "Jupiter", "Saturn"]) {
      const p = heliocentricKm(bodyByName[nm].orbit_j2000, jdNow);
      const gx = p[0] - e[0], gy = p[1] - e[1], gz = p[2] - e[2];
      const cosE2 = (gx * -e[0] + gy * -e[1] + gz * -e[2]) / (Math.hypot(gx, gy, gz) * Math.hypot(e[0], e[1], e[2]));
      const elong = Math.acos(clamp(cosE2, -1, 1)) / D2R;
      if (elong > 22) {
        let dl = Math.atan2(gy, gx) - ls;
        while (dl > Math.PI) dl -= Math.PI * 2;
        while (dl < -Math.PI) dl += Math.PI * 2;
        vis.push(`${CN[nm]}(${dl > 0 ? "昏" : "晨"})`);
      }
    }
    let ecl = "打开天象日历后显示";
    if (eventsReady) {
      const nx = EVENTS.find((ev) => (ev.type === "solar" || ev.type === "lunar") && ev.jd > jdNow);
      if (nx) ecl = `${jdToDateText(nx.jd).slice(0, 10)} ${nx.cn}(${Math.ceil(nx.jd - jdNow)} 天后)`;
    }
    let met = "";
    if (eventsReady) {
      const nx2 = EVENTS.find((ev) => ev.type === "meteor" && ev.jd > jdNow - 1.2);
      if (nx2) {
        const nm3 = nx2.cn.split("极大")[0];
        met = nx2.jd - jdNow < 1.2
          ? `<span>流星雨 <b>${nm3}正在极大!</b></span>`
          : `<span>下一场流星雨 <b>${nm3}(${Math.ceil(nx2.jd - jdNow)} 天后)</b></span>`;
      }
    }
    el.innerHTML = [
      `<span>月相 <b>${ph.name}</b> · 照亮 ${(ph.k * 100).toFixed(0)}%</span>`,
      `<span>今晚可见 <b>${vis.length ? vis.join(" · ") : "行星均近太阳, 不易见"}</b></span>`,
      `<span>下一场食 <b>${ecl}</b></span>`
    ].join("") + met;
  }

  /* ---------------- 光速巡航: 用身体感受 5.5 光时 ---------------- */
  const C_KM_S = 299792.458;
  let lightCruise = null;   // {mult, distKm, dir}
  const LC_MILESTONES = [
    [0.387, "掠过水星轨道 · 3.2 光分"], [0.723, "掠过金星轨道 · 6 光分"],
    [1.0, "掠过地球轨道 —— 你出发才 8.3 分钟"], [1.524, "掠过火星轨道 · 12.7 光分"],
    [2.7, "穿越小行星带"], [5.203, "掠过木星轨道 · 43 光分"],
    [9.54, "掠过土星轨道 · 1.3 光时"], [19.19, "掠过天王星轨道 · 2.7 光时"],
    [30.07, "掠过海王星轨道 · 4.2 光时"]
  ];
  function startLightCruise() {
    stopTour();
    endReplay();
    if (deepTime && setDeepTimeRef) setDeepTimeRef(false);
    setFocus("Sun", true);
    animateScaleTo(0);
    const pw = worldKm.Pluto || [35 * AU_KM, 0, 0];
    const L = Math.hypot(pw[0], pw[1], pw[2]);
    lightCruise = { mult: Number(document.querySelector("#lcMults .active")?.dataset.m || 60), distKm: 696340 * 2, dir: [pw[0] / L, pw[1] / L, pw[2] / L], done: {} };
    controls.enabled = false;
    $("lcHud").classList.add("show");
    $("lcStart").textContent = "结束巡航";
    sfxWhoosh();
    award("light_cruise");
  }
  function endLightCruise() {
    if (!lightCruise) return;
    lightCruise = null;
    controls.enabled = true;
    $("lcHud").classList.remove("show");
    $("lcStart").textContent = "从太阳出发 · 飞向冥王星";
    setFocus("Earth", false);
  }
  function tickLightCruise(dt) {
    if (!lightCruise) return;
    const lc = lightCruise;
    lc.distKm += C_KM_S * dt * lc.mult;
    const bu = lc.distKm / SCALE.sceneUnitKm;
    camera.position.set(lc.dir[0] * bu, lc.dir[1] * bu, lc.dir[2] * bu);
    controls.target.set(lc.dir[0] * (bu + 5e4), lc.dir[1] * (bu + 5e4), lc.dir[2] * (bu + 5e4));
    const au = lc.distKm / AU_KM;
    const lightMin = lc.distKm / C_KM_S / 60;
    let note = "";
    for (const [mA, txt] of LC_MILESTONES) {
      if (au >= mA && !lc.done[mA]) { lc.done[mA] = true; note = txt; sfxWhoosh(); }
      if (au >= mA) lc.lastNote = txt;
    }
    const pw = worldKm.Pluto;
    const pAu = pw ? Math.hypot(pw[0], pw[1], pw[2]) / AU_KM : 34;
    if (au >= pAu) {
      $("lcHud").innerHTML = `<b>抵达冥王星轨道</b> · 全程 ${(lc.distKm / C_KM_S / 3600).toFixed(1)} 光时 —— 这就是光的通勤, 而旅行者飞了 12 年`;
      setTimeout(endLightCruise, 5200);
      lightCruise = null;
      controls.enabled = true;
      $("lcStart").textContent = "从太阳出发 · 飞向冥王星";
      return;
    }
    $("lcHud").innerHTML = `光速 ×${lc.mult} · 已飞 <b>${au < 1 ? (lightMin).toFixed(1) + " 光分" : au.toFixed(2) + " AU"}</b>` +
      `(${lightMin < 60 ? lightMin.toFixed(1) + " 光分" : (lightMin / 60).toFixed(2) + " 光时"})` +
      (lc.lastNote ? `<br>${lc.lastNote}` : "<br>刚离开太阳 —— 第一站水星轨道 3.2 光分");
  }

  /* ---------------- 程序化音效层(WebAudio 合成, 零素材) ---------------- */
  let audioCtx = null, audioMaster = null;
  let soundOn = true;
  try { soundOn = localStorage.getItem("ss_sound") !== "0"; } catch (e) { /* 默认开 */ }
  function audioInit() {
    if (audioCtx || !soundOn || typeof window === "undefined") return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
      audioMaster = audioCtx.createGain();
      audioMaster.gain.value = 0.32;
      audioMaster.connect(audioCtx.destination);
    } catch (e) { audioCtx = null; }
  }
  function audioPoke() {
    audioInit();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }
  function sfxTone(f0, f1, dur, type, vol, delay) {
    if (!audioCtx || !soundOn) return;
    const t = audioCtx.currentTime + (delay || 0);
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(audioMaster);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function sfxNoise(dur, fType, fr0, fr1, vol) {
    if (!audioCtx || !soundOn) return;
    const t = audioCtx.currentTime;
    const n = Math.floor(audioCtx.sampleRate * dur);
    const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i += 1) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const f = audioCtx.createBiquadFilter();
    f.type = fType;
    f.Q.value = 1.05;
    f.frequency.setValueAtTime(fr0, t);
    f.frequency.exponentialRampToValueAtTime(fr1, t + dur * 0.65);
    const g = audioCtx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(audioMaster);
    src.start(t);
  }
  const sfxChime = () => { sfxTone(660, 660, 0.5, "sine", 0.16); sfxTone(990, 990, 0.75, "sine", 0.12, 0.1); };
  const sfxWhoosh = () => sfxNoise(0.85, "bandpass", 210, 1500, 0.15);
  const sfxRumble = () => { sfxNoise(2.4, "lowpass", 130, 55, 0.3); sfxTone(46, 30, 2.2, "sine", 0.1); };
  const sfxSnap = () => sfxTone(1250, 880, 0.07, "square", 0.05);

  /* ---------------- 金牛座流星雨: 地球穿越恩克彗星尘埃带 ---------------- */
  let meteorJds = null, meteorFx = null;
  function computeMeteorJds() {
    if (meteorJds) return meteorJds;
    meteorJds = [];
    const enk = cometByName.Encke;
    if (!enk) return meteorJds;
    const seg = enk.segments[enk.segments.length - 1];
    const o = { argPeri: seg.w * D2R, node: seg.node * D2R, i: seg.i * D2R };
    const pts = [];   // 恩克轨道 96 点(km)
    for (let k = 0; k < 96; k += 1) {
      const E = Math.PI * 2 * k / 96;
      pts.push(planeToEclipticKm(seg.a * (Math.cos(E) - seg.e), seg.a * Math.sqrt(1 - seg.e * seg.e) * Math.sin(E), o));
    }
    const dMin = (jdT) => {
      const e = heliocentricKm(bodyByName.Earth.orbit_j2000, jdT);
      let m = 1e18;
      for (const q of pts) {
        const dd = (e[0] - q[0]) ** 2 + (e[1] - q[1]) ** 2 + (e[2] - q[2]) ** 2;
        if (dd < m) m = dd;
      }
      return Math.sqrt(m);
    };
    for (let y = 1900; y <= 2100; y += 1) {
      // 每年 10-15 → 11-30 粗扫 + 黄金分割细化(尘埃带在恩克降交点附近, 历年 11 月上旬)
      const j0 = 2451545 + (y - 2000) * 365.25 - 55;
      let bj = j0, bv = 1e18;
      for (let j = j0; j <= j0 + 46; j += 1.5) {
        const v = dMin(j);
        if (v < bv) { bv = v; bj = j; }
      }
      const r = goldenMin(dMin, bj - 2, bj + 2);
      meteorJds.push(r.x);
    }
    return meteorJds;
  }
  function buildMeteorFx() {
    const N = 64;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 6), 3));
    meteorFx = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: 0xcfe8b8, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    meteorFx.frustumCulled = false;
    meteorFx.renderOrder = 7;
    meteorFx.visible = false;
    scene.add(meteorFx);
    meteorFx.userData.seed = new Float32Array(N * 4).map(() => Math.random());
  }
  const _radiant = (() => {   // 金牛座辐射点 RA≈52° Dec≈+21° → 黄道系方向
    const ra = 52 * D2R, de = 21 * D2R;
    const x = Math.cos(de) * Math.cos(ra), y = Math.cos(de) * Math.sin(ra), z = Math.sin(de);
    const ce = Math.cos(EPS0), se = Math.sin(EPS0);
    return [x, y * ce + z * se, -y * se + z * ce];
  })();
  function updateMeteorFx(now) {
    if (!meteorFx) return;
    computeMeteorJds();
    let near = 1e9;
    for (const mj of meteorJds) {
      const d = Math.abs(jd - mj);
      if (d < near) near = d;
      if (mj > jd + 3) break;
    }
    const k = clamp(1 - near / 2.2, 0, 1);   // 事件 ±2.2 天内渐显
    meteorFx.visible = k > 0.02 && !reducedMotion;
    if (!meteorFx.visible) return;
    const ep = scenePos.Earth, er = Math.max(sceneRadius.Earth || 1, 0.02);
    const arr = meteorFx.geometry.attributes.position.array;
    const sd = meteorFx.userData.seed;
    const t = now * 0.001;
    for (let i = 0; i < 64; i += 1) {
      const ph = (t * (0.5 + sd[i * 4] * 0.9) + sd[i * 4 + 1] * 7) % 1;   // 各自闪现节奏
      const R0 = er * (1.6 + sd[i * 4 + 2] * 4.5);
      const a = sd[i * 4 + 3] * Math.PI * 2, b = (sd[i * 4] - 0.5) * Math.PI;
      const off = [Math.cos(b) * Math.cos(a) * R0, Math.cos(b) * Math.sin(a) * R0, Math.sin(b) * R0];
      const L = er * (0.5 + sd[i * 4 + 1]) * ph;   // 划过中拉长
      arr[i * 6] = ep[0] + off[0];
      arr[i * 6 + 1] = ep[1] + off[1];
      arr[i * 6 + 2] = ep[2] + off[2];
      arr[i * 6 + 3] = ep[0] + off[0] - _radiant[0] * L;
      arr[i * 6 + 4] = ep[1] + off[1] - _radiant[1] * L;
      arr[i * 6 + 5] = ep[2] + off[2] - _radiant[2] * L;
    }
    meteorFx.geometry.attributes.position.needsUpdate = true;
    meteorFx.material.opacity = 0.55 * k;
  }

  /* ---------------- 阶段17 · 成就图鉴 / URL 深链 / 摄影模式 ---------------- */
  const ACH_DEFS = [
    ["eclipse", "追日者", "从天象日历跳转观看任意一次日食"],
    ["blood_moon", "血月", "从天象日历跳转观看任意一次月食"],
    ["apophis", "有惊无险", "查看阿波菲斯 2029 掠地"],
    ["visitor", "星际访客", "亲眼见过一位闯入太阳系的系外天体"],
    ["cinema", "放映厅", "连播看完全部历史名场面"],
    ["launch", "点火起飞", "完整看完一次火箭发射入轨"],
    ["fleet", "一支舰队", "看过三型不同火箭的发射"],
    ["apollo_moon", "奔月", "把阿波罗载荷经 TLI 送进月球引力圈"],
    ["shadowplay", "双影凌木", "看到两枚卫星影子同时落在木星盘面"],
    ["probe", "第一推动", "在引力沙盒发射第一枚探针"],
    ["hohmann", "转移窗口", "发射一次霍曼转移"],
    ["hohmann3", "轨道艺术家", "霍曼挑战三星命中(最近距离 <300 万 km)"],
    ["replay_v2", "大巡游", "完整看完旅行者2号四连弹弓回放"],
    ["replay_all", "舰队史官", "三艘航天器的全程回放各启动一次"],
    ["interstellar", "离家", "开启星际视角"],
    ["star_fly", "星际旅人", "搜索并飞临任意一颗恒星"],
    ["deeptime", "深时行者", "深时模式拨到一万年之外"],
    ["deepsky", "深空猎手", "查看任意深空天体图鉴"],
    ["light_cruise", "光的通勤", "光速巡航飞向冥王星"],
    ["helix", "螺旋行者", "在银河参考系里看太阳拖着全家狂奔"],
    ["guardian", "守护者", "在磁层剧场看地球扛住一次 CME"],
    ["history", "时间旅人", "造访任意一个历史名场面"],
    ["historian", "编年史官", "十三个历史名场面全部走遍"],
    ["moon_land", "登月", "首次驾驶月球车"],
    ["moon_first_mark", "月面初探", "打卡第一个月面地标"],
    ["moon_region_all", "区域制霸", "集齐一个着陆区全部地标"]
  ];
  let achData = {};
  try { achData = JSON.parse(localStorage.getItem("ss_ach") || "{}"); } catch (e) { achData = {}; }
  let achToastTimer = 0;
  const replaySeen = {};
  function award(id) {
    if (achData[id]) return;
    achData[id] = Date.now();
    try { localStorage.setItem("ss_ach", JSON.stringify(achData)); } catch (e) { /* 静默 */ }
    const def = ACH_DEFS.find((d) => d[0] === id);
    if (def) {
      sfxChime();
      $("achToastText").textContent = `${def[1]} —— ${def[2]}`;
      $("achToast").classList.add("show");
      clearTimeout(achToastTimer);
      achToastTimer = setTimeout(() => $("achToast").classList.remove("show"), 3600);
    }
    renderAch();
  }
  const MISSIONS = [
    { ach: "eclipse", t: "追一场日全食(2027-08-02)", go: () => { jd = 2461624.5; playing = false; $("playBtn").textContent = "▶"; setFocus("Earth", false); scanAstroEvents(); } },
    { ach: "blood_moon", t: "看一场血月(2026-03-03)", go: () => { jd = 2461102.5; playing = false; $("playBtn").textContent = "▶"; setFocus("Moon", false); scanAstroEvents(); } },
    { ach: "star_fly", t: "飞临织女星", go: () => { const k = namedStars.find((x) => x.cn === "织女星"); if (k) flyToStar(k); } },
    { ach: "replay_v2", t: "看完旅行者2号大巡游", go: () => startReplay("Voyager2") },
    { ach: "hohmann3", t: "霍曼挑战三星命中", go: () => { jd = nextHohmannWindow(jd + 2); const plan = hohmannPlan(jd); $("dvSlider").value = clamp(plan.dv, 2.5, 4.5).toFixed(2); $("dvVal").textContent = Number($("dvSlider").value).toFixed(2); } },
    { ach: "light_cruise", t: "以光速丈量太阳系", go: startLightCruise },
    { ach: "moon_land", t: "登陆月球开一圈车", go: () => { window.open("moon.html", "_blank"); } },
    { ach: "deeptime", t: "深时行者: 去一万年后", go: () => { if (setDeepTimeRef) setDeepTimeRef(true); jd = J2000 + 12000 * 365.25; } }
  ];
  function renderMissions() {
    const el = $("missionList");
    if (!el) return;
    el.innerHTML = "<div class='gtitle'>任务</div>" + MISSIONS.map((m, i) => {
      const on = !!achData[m.ach];
      return `<div class="missionRow${on ? " on" : ""}"><b>${on ? "◆" : "◇"} ${m.t}</b>` +
        (on ? "" : `<button data-mi="${i}">前往</button>`) + `</div>`;
    }).join("");
    for (const b of el.querySelectorAll("button[data-mi]")) {
      b.addEventListener("click", () => {
        const m = MISSIONS[Number(b.dataset.mi)];
        $("achModal").classList.remove("show");
        if (m) m.go();
      });
    }
  }
  function renderAch() {
    const el = $("achList");
    if (!el) return;
    let got = 0;
    el.innerHTML = ACH_DEFS.map((d) => {
      const on = !!achData[d[0]];
      if (on) got += 1;
      return `<div class="achRow ${on ? "on" : "off"}"><b>${on ? "◆" : "◇"} ${d[1]}</b><span>${d[2]}</span></div>`;
    }).join("");
    $("achCount").textContent = `${got} / ${ACH_DEFS.length}`;
  }
  /* ---------------- URL 深链 ---------------- */
  function buildShareHash() {
    const p = new URLSearchParams();
    p.set("jd", jd.toFixed(3));
    p.set("f", selectedName || "Earth");
    p.set("s", scaleBlend.toFixed(2));
    if (deepTime) p.set("deep", "1");
    if (stars3D) p.set("cosmo", "1");
    if (skyModeN) p.set("sky", String(skyModeN));
    return "#" + p.toString();
  }
  function applyShareHash() {
    if (typeof location === "undefined" || !location.hash || location.hash.length < 3) return;
    try {
      const p = new URLSearchParams(location.hash.slice(1));
      if (p.get("deep") === "1" && setDeepTimeRef) setDeepTimeRef(true);
      const j = Number(p.get("jd"));
      if (Number.isFinite(j) && j > 2000000) jd = clamp(j, J2000 + tlMin, J2000 + tlMax);
      const sv = Number(p.get("s"));
      if (Number.isFinite(sv)) {
        scaleBlend = clamp(sv, 0, 1);
        $("scaleBlend").value = scaleBlend;
        refreshScaleButtons();
      }
      const sky = Number(p.get("sky") || 0);
      if (sky === 1 || sky === 2) {
        skyModeN = sky;
        for (const b of $("skyModeGroup").children) b.classList.toggle("active", Number(b.dataset.m) === sky);
      }
      if (p.get("cosmo") === "1") {
        stars3D = true;
        $("cosmoBtn").classList.add("active");
      }
      if (p.get("pause") === "1") { playing = false; $("playBtn").textContent = "▶"; }
      const f = p.get("f");
      updateSystem();
      if (f && scenePos[f]) setFocus(f, true);
      /* 贴地相机距(千 km): 信标/近地验收与分享 */
      const dKm = Number(p.get("d"));
      if (f && Number.isFinite(dKm) && dKm > 0) {
        setTimeout(() => {
          const t = controls.target;
          const dir = camera.position.clone().sub(t).normalize();
          camera.position.copy(t).addScaledVector(dir, dKm / 1000);
          controls.update();
        }, 600);
      }
      /* 调试: #dbg=sitecam&site=cz5 → 相机置于该站天顶望地心(经纬校验) */
      if (p.get("dbg") === "sitecam") {
        setTimeout(() => {
          const st2 = SITES.find((x) => x.id === (p.get("site") || "cz5")) || SITES[0];
          geoDirEcl(st2.lat, st2.lon, _geo6);
          const eS2 = scenePos.Earth, R2 = 6371 / SCALE.sceneUnitKm;
          camera.position.set(eS2[0] + _geo6[0] * R2 * 8, eS2[1] + _geo6[1] * R2 * 8, eS2[2] + _geo6[2] * R2 * 8);
          controls.target.set(eS2[0], eS2[1], eS2[2]);
          controls.update();
        }, 1500);
      }
      /* 调试: #dbg=sites 附加站点自证面板(dot/显隐/屏幕坐标) */
      if ((p.get("dbg") || "").indexOf("site") === 0) {
        window.__errs = [];
        window.addEventListener("error", (e) => { if (window.__errs.length < 4) window.__errs.push((e.message || "?") + " @" + (e.lineno || 0)); });
        window.addEventListener("unhandledrejection", (e) => { if (window.__errs.length < 4) window.__errs.push("promise: " + e.reason); });
        const dv = document.createElement("div");
        dv.style.cssText = "position:fixed;right:8px;top:120px;z-index:9999;background:rgba(0,0,0,.82);color:#9fe8d8;font:11px/1.5 monospace;padding:8px 10px;border-radius:6px;white-space:pre";
        document.body.appendChild(dv);
        setInterval(() => {
          const eS2 = scenePos.Earth;
          if (!eS2 || !siteBeacons) { dv.textContent = "no beacons"; return; }
          const cd = Math.hypot(camera.position.x - eS2[0], camera.position.y - eS2[1], camera.position.z - eS2[2]);
          let tx = "站点自证 camD(R⊕)=" + (cd / (6371 / SCALE.sceneUnitKm)).toFixed(1) + " scale=" + scaleBlend.toFixed(2) + "\n";
          if (APOLLO.on || APOLLO.state) tx += "阿波罗 " + APOLLO.state + (APOLLO.dv ? " dv=" + APOLLO.dv.toFixed(2) : "") + (APOLLO.minMoon < 1e12 ? " 月距min=" + (APOLLO.minMoon / 1e4).toFixed(1) + "万" : "") + "\n";
          if (location.hash.indexOf("lnch2") > 0) {
            const els = document.querySelectorAll("body *");
            let dm = "";
            for (const el of els) {
              if (el.offsetWidth > 250 && el.offsetHeight > 250) {
                const st = getComputedStyle(el);
                if (st.display !== "none" && st.visibility !== "hidden" && (st.position === "fixed" || st.position === "absolute" || el.tagName === "IFRAME" || el.tagName === "CANVAS")) {
                  dm += el.tagName + "#" + (el.id || el.className.toString().slice(0, 16)) + " " + el.offsetWidth + "x" + el.offsetHeight + " bg=" + st.backgroundColor.slice(0, 18) + " z=" + st.zIndex + "\n";
                }
              }
            }
            window.__domDump = dm;
          }
          if (LNCH.state !== "off" && LNCH.W && (location.hash.indexOf("lnch5") > 0)) {
            let hits = "";
            const camW = camera.position;
            LNCH.W.updateWorldMatrix(true, true);
            LNCH.W.traverse((ob) => {
              if (!ob.isMesh || !ob.visible) return;
              if (!ob.geometry.boundingSphere) { try { ob.geometry.computeBoundingSphere(); } catch (e) { return; } }
              const bs = ob.geometry.boundingSphere;
              _v3a.copy(bs.center).applyMatrix4(ob.matrixWorld);
              const dC = _v3a.distanceTo(camW);
              const sc = ob.getWorldScale(_v3b).x;
              const rW = bs.radius * sc;
              if (dC < rW * 1.6) {   // 相机在包围球附近/内部 → 盖屏候选
                let nm = ob.name || "";
                let pp = ob.parent;
                while (pp && pp !== LNCH.W && !nm) { nm = pp.name || ""; pp = pp.parent; }
                const col = ob.material && ob.material.color ? ob.material.color.getHexString() : "?";
                hits += (nm || "anon") + " r=" + rW.toFixed(3) + " d=" + dC.toFixed(3) + " col=" + col + "\n";
              }
            });
            window.__lnchHits = hits || "(无盖屏物)";
            const cand = [];
            const camW2 = camera.position;
            _v3b.set(0, 0, -1).applyQuaternion(camera.quaternion);   // 视线
            scene.traverse((ob) => {
              if (!ob.visible || (!ob.isSprite && !ob.isMesh && !ob.isPoints)) return;
              ob.getWorldPosition(_v3a);
              const d2 = Math.max(_v3a.distanceTo(camW2), 1e-12);
              _v3a.sub(camW2).normalize();
              const fwd = _v3a.dot(_v3b);
              let sz = 0;
              if (ob.isSprite) sz = ob.getWorldScale(_lnchV1).x;
              else if (ob.isPoints) sz = (ob.material && ob.material.sizeAttenuation) ? ob.material.size * (ob.getWorldScale(_lnchV1).x || 1) : 0;
              else { if (!ob.geometry.boundingSphere) { try { ob.geometry.computeBoundingSphere(); } catch (e) { return; } } sz = (ob.geometry.boundingSphere ? ob.geometry.boundingSphere.radius : 0) * (ob.getWorldScale(_lnchV1).x || 1); }
              const ang = sz / d2;
              if (fwd > 0.2 && ang > 0.15) cand.push({ ang, t: (ob.isSprite ? "SPR" : ob.isPoints ? "PTS" : "M") + " " + (ob.name || "") + " c=" + (ob.material && ob.material.color ? ob.material.color.getHexString() : "?") + " a=" + ang.toFixed(1) + " d=" + d2.toExponential(1) });
            });
            cand.sort((x, y) => y.ang - x.ang);
            hits = "calls=" + renderer.info.render.calls + " 前视大物:\n" + cand.slice(0, 10).map((c) => c.t).join("\n") + "\n";
            window.__lnchHits += hits;
          }
          if (LNCH.state !== "off" && LNCH.W) {
            tx += "剧场 state=" + LNCH.state + " t=" + LNCH.t.toFixed(0) + "\n";
            tx += "dome.op=" + (LNCH.dome ? LNCH.dome.material.opacity.toFixed(3) : "-") + " grd=" + (LNCH.ground ? LNCH.ground.visible : "-") + "\n";
            const cp = camera.position;
            tx += "cam=(" + cp.x.toFixed(0) + "," + cp.y.toFixed(0) + "," + cp.z.toFixed(0) + ") near=" + camera.near + "\n";
            let big = "";
            LNCH.W.traverse((ob) => {
              if (ob.visible && ob.geometry && ob.geometry.boundingSphere === null) { try { ob.geometry.computeBoundingSphere(); } catch (e) {} }
              if (ob.visible && ob.geometry && ob.geometry.boundingSphere && ob.geometry.boundingSphere.radius > 30000) {
                big += (ob.name || ob.type) + ":" + ob.geometry.boundingSphere.radius.toFixed(0) + " op=" + (ob.material && ob.material.opacity !== undefined ? ob.material.opacity.toFixed(2) : "?") + " vis=" + ob.visible + "\n";
              }
            });
            tx += big;
          if (window.__domDump) tx += window.__domDump;
          if (window.__lnchHits) tx += "盖屏候选:\n" + window.__lnchHits;
          if (window.__errs && window.__errs.length) tx += "JS异常:\n" + window.__errs.join("\n") + "\n";
          }
          for (const b of siteBeacons) {
            geoDirEcl(b.st.lat, b.st.lon, _sbD);
            const dot = (_sbD[0] * (camera.position.x - eS2[0]) + _sbD[1] * (camera.position.y - eS2[1]) + _sbD[2] * (camera.position.z - eS2[2])) / cd;
            _v3a.set(b.spr.position.x, b.spr.position.y, b.spr.position.z).project(camera);
            tx += b.st.id.padEnd(9) + " dot=" + dot.toFixed(2).padStart(5) + " vis=" + (b.spr.visible ? 1 : 0) + " scr=" + _v3a.x.toFixed(2) + "," + _v3a.y.toFixed(2) + "\n";
          }
          dv.textContent = tx;
        }, 1000);
      }
      /* 深链直进发射剧场: #lnch=saturn5&apollo=1&hist=1&lt=90(进场后快进到 T+lt 秒) */
      const lr = p.get("lnch");
      if (lr && ROCKETS[lr]) {
        setTimeout(() => {
          lnchEnter({ rocket: lr, apollo: p.get("apollo") === "1", historical: p.get("hist") === "1" });
          const lt = Number(p.get("lt"));
          if (Number.isFinite(lt) && lt > 0) {
            const fwd = setInterval(() => {
              if (LNCH.state === "off") { clearInterval(fwd); return; }
              if (LNCH.state !== "load") {
                if (LNCH.t >= lt) { clearInterval(fwd); return; }
                tickLaunch(0.5 / (LNCH.tc || 1));
              }
            }, 8);
          }
        }, 900);
      }
    } catch (e) { console.warn("深链解析失败", e); }
  }
  /* ---------------- 摄影模式 ---------------- */
  let photoMode = false, snapRequest = false;
  function setPhotoMode(on) {
    photoMode = on;
    document.body.classList.toggle("photo", on);
  }
  function doSnapshot() { snapRequest = true; }
  function saveSnapshot() {
    snapRequest = false;
    sfxSnap();
    try {
      const a = document.createElement("a");
      const d = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      a.download = `太阳系_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
      a.href = renderer.domElement.toDataURL("image/png");
      a.click();
    } catch (e) { console.warn("存图失败", e); }
  }

  /* ---------------- 搜索直达: 任意东西, 一键前往 ---------------- */
  let starFlyGoal = null;
  function ensureInterstellar() {
    if (!stars3D) {
      stars3D = true;
      $("cosmoBtn").classList.add("active");
      $("cosmoHint").classList.add("show");
      animateScaleTo(0);
    }
  }
  function flyToStar(k) {
    ensureInterstellar();
    const yr = yearsFromJ2000();
    const x = k.p0[0] + k.v[0] * yr, y = k.p0[1] + k.v[1] * yr, z = k.p0[2] + k.v[2] * yr;
    const d = Math.max(Math.hypot(x, y, z), 0.6);
    const r3 = 4.5e7 + 5.5e7 * (Math.log(d / 1.3) / 7.339);
    starFlyGoal = { p: [x / d * r3, y / d * r3, z / d * r3], k };
  }
  function aimAtDeepSky(d) {
    ensureInterstellar();
    const v = window.__dsBridge.eq2ecl(d.ra, d.dec);
    const dist = Math.max(camera.position.distanceTo(controls.target), 5e6);
    camera.position.copy(controls.target).addScaledVector(_v3a.set(v[0], v[1], v[2]), -dist);
    controls.update();
    showDeepSkyCard(d);
  }
  function tickStarFly(dt) {
    if (!starFlyGoal) return;
    const g = starFlyGoal.p;
    const k = Math.min(1, dt * 2.2);
    controls.target.lerp(_v3a.set(g[0], g[1], g[2]), k);
    // 相机停在恒星"跟前"(朝太阳一侧退开一段)
    const back = 1 - 8e6 / Math.max(Math.hypot(g[0], g[1], g[2]), 1);
    _v3b.set(g[0] * back, g[1] * back, g[2] * back);
    camera.position.lerp(_v3b, k);
    if (camera.position.distanceTo(_v3b) < 5e4 && star3DBlend > 0.97) {
      showHoverTip(starTipHtml(starFlyGoal.k), window.innerWidth / 2 - 110, 100);
      award("star_fly");
      starFlyGoal = null;
    }
  }
  let searchIndex = null;
  function buildSearchIndex() {
    const idx = [];
    for (const b of bodies) idx.push({ n: CN[b.name] || b.name, sub: b.name, t: b.type === "dwarf" ? "矮行星" : "行星", act: () => { stopTour(); setFocus(b.name, false); } });
    for (const sat of SATELLITES) idx.push({ n: sat.cn, sub: sat.name, t: "卫星", act: () => { stopTour(); setFocus(sat.name, false); } });
    for (const c of COMETS) idx.push({ n: c.cn, sub: c.eng || c.name, t: "彗星", act: () => { stopTour(); setFocus(c.name, false); } });
    for (const c of SPACECRAFT) idx.push({ n: c.cn, sub: c.name, t: "航天器", act: () => { stopTour(); setFocus(c.name, false); } });
    for (const st of SITES) idx.push({ n: st.cn, sub: ROCKETS[st.id].cn + " · 点击进发射剧场", t: "发射场", act: () => { stopTour(); lnchEnter({ rocket: st.id }); } });
    for (const k of namedStars) {
      const ly = (starDistPc(k.plx) * 3.26156);
      idx.push({ n: k.cn, sub: `${ly < 100 ? ly.toFixed(1) : Math.round(ly)} 光年`, t: "恒星", act: () => flyToStar(k) });
    }
    if (window.DEEPSKY) {
      for (const d of window.DEEPSKY) idx.push({ n: d.cn, sub: d.id, t: "深空", act: () => aimAtDeepSky(d) });
    }
    return idx;
  }
  function runSearch(q) {
    if (!searchIndex) searchIndex = buildSearchIndex();
    q = q.trim().toLowerCase();
    if (!q) return [];
    return searchIndex.filter((it) =>
      it.n.toLowerCase().includes(q) || String(it.sub).toLowerCase().includes(q) || it.t.includes(q)
    ).slice(0, 12);
  }

  /* ---------------- 群星悬停简介 ---------------- */
  function spectralText(bv) {
    if (bv < 0) return "蓝白色 · B 型";
    if (bv < 0.3) return "白色 · A 型";
    if (bv < 0.6) return "黄白色 · F 型";
    if (bv < 1.0) return "黄色 · G 型(类太阳)";
    if (bv < 1.4) return "橙色 · K 型";
    return "红色 · M 型";
  }
  const _htV = new THREE.Vector3();
  function pickNamedStar(px, py) {
    if (!namedStars.length || (catalogStarMat && catalogStarMat.uniforms.uDim.value < 0.05)) return null;
    const yr = yearsFromJ2000();
    let best = null, bd = 19 * 19;
    for (const k of namedStars) {
      const x = k.p0[0] + k.v[0] * yr, y = k.p0[1] + k.v[1] * yr, z = k.p0[2] + k.v[2] * yr;
      const d = Math.max(Math.hypot(x, y, z), 0.6);
      const r3 = 4.5e7 + 5.5e7 * (Math.log(d / 1.3) / 7.339);
      const rr = lerp(1.5e7, Math.max(r3, 1.0e7), star3DBlend);
      _htV.set(x / d * rr, y / d * rr, z / d * rr).project(camera);
      if (_htV.z > 1) continue;
      const sx = (_htV.x + 1) / 2 * window.innerWidth;
      const sy = (1 - _htV.y) / 2 * window.innerHeight;
      const dd = (sx - px) * (sx - px) + (sy - py) * (sy - py);
      if (dd < bd) { bd = dd; best = k; }
    }
    return best;
  }
  const STAR_NOTES = {
    "南门二": "三合星系统 —— A/B 互绕约 80 年, 还带着最近的邻居比邻星",
    "比邻星": "距我们最近的恒星, 南门二三合星系统成员, 有一颗宜居带行星 b",
    "天狼星": "有一颗白矮星伴星(天狼 B), 互绕约 50 年",
    "北河二": "六合星系统 —— 三对双星共舞",
    "天鹅座61A": "与 B 星互绕约 678 年, 历史上第一颗被测出视差的恒星",
    "天鹅座61B": "与 A 星互绕约 678 年",
    "开阳": "肉眼双星 —— 与辅(开阳增一)是古代的视力测试",
    "心宿二": "红超巨星, 直径约为太阳 700 倍, 终将超新星爆发",
    "参宿四": "红超巨星, 随时可能超新星爆发(天文尺度上的\u201c随时\u201d)",
    "织女星": "1.2 万年后的北极星",
    "右枢": "公元前 2800 年的北极星, 金字塔时代的\u201c天极\u201d"
  };
  function starTipHtml(k) {
    const ly = starDistPc(k.plx) * 3.26156;
    const lyText = ly < 100 ? ly.toFixed(1) : Math.round(ly).toLocaleString();
    return `<b>${k.cn}</b><br><span class="dim">${spectralText(k.bv)} · ${k.mag.toFixed(1)} 等</span><br>` +
      `距离 <b>${lyText} 光年</b> —— 此刻看到的光出发于 ${lyText} 年前` +
      (k.rv ? `<br><span class="dim">${k.rv < 0 ? "正在接近" : "正在远离"} · ${Math.abs(k.rv).toFixed(1)} km/s</span>` : "") +
      (STAR_NOTES[k.cn] ? `<br><span class="dim">${STAR_NOTES[k.cn]}</span>` : "");
  }
  function showHoverTip(html, px, py) {
    const t = $("hoverTip");
    t.innerHTML = html;
    t.style.display = "block";
    t.style.left = `${Math.min(px + 16, window.innerWidth - 300)}px`;
    t.style.top = `${Math.min(py + 14, window.innerHeight - 90)}px`;
  }
  function hideHoverTip() { $("hoverTip").style.display = "none"; }

  /* ---------------- 深空天体点击图鉴 ---------------- */
  const DS_TYPE_CN = { emission: "发射星云", cluster: "疏散星团", globular: "球状星团",
    galaxy: "星系", irregular: "不规则星系", planetary: "行星状星云", snr: "超新星遗迹" };
  const _dsV = new THREE.Vector3();
  function pickDeepSky(px, py) {
    if (!window.DEEPSKY || !window.__dsBridge) return null;
    let best = null, bd = 34 * 34;   // 34px 拾取半径
    for (const d of window.DEEPSKY) {
      const v = window.__dsBridge.eq2ecl(d.ra, d.dec);
      _dsV.set(v[0], v[1], v[2]).multiplyScalar(1.15e8).project(camera);
      if (_dsV.z > 1) continue;   // 背向
      const sx = (_dsV.x + 1) / 2 * window.innerWidth;
      const sy = (1 - _dsV.y) / 2 * window.innerHeight;
      const dd = (sx - px) * (sx - px) + (sy - py) * (sy - py);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }
  function showStarCard(k) {
    starSelected = k;
    dsSelected = null;
    const ly = starDistPc(k.plx) * 3.26156;
    const lyText = ly < 100 ? ly.toFixed(1) : Math.round(ly).toLocaleString();
    $("infoCard").innerHTML = [
      `<div class="iname" style="color:#d5e2f8">${k.cn}<small>恒星</small></div>`,
      `<div class="irow"><span>光谱色</span><b>${spectralText(k.bv)}</b></div>`,
      `<div class="irow"><span>视星等</span><b>${k.mag.toFixed(2)}</b></div>`,
      `<div class="irow"><span>距离</span><b>${lyText} 光年</b></div>`,
      `<div class="irow"><span>此刻的光</span><b>出发于 ${lyText} 年前</b></div>`,
      STAR_NOTES[k.cn] ? `<div class="blurb">${STAR_NOTES[k.cn]}</div>` : "",
      (() => {   // 星际旅行规划: 旅行者速度 / 光速 / 1g 相对论飞船(双曲运动)
        const ph = starPhys(k);
        const gp = 1.0323, x = ly / 2;
        const tEarth = 2 * Math.sqrt(x * x + 2 * x / gp);
        const tShip = (2 / gp) * Math.acosh(gp * x + 1);
        const voy = ly * 17636;
        return `<div class="irow"><span>恒星半径</span><b>≈${ph.R < 10 ? ph.R.toFixed(2) : Math.round(ph.R)} R☉ · ${Math.round(ph.T)} K</b></div>` +
          (window.EXOPLANETS && window.EXOPLANETS[k.cn] ? `<div class="irow"><span>已知行星</span><b>${window.EXOPLANETS[k.cn].planets.length} 颗 —— 飞临可见</b></div>` : "") +
          `<div class="blurb">去这里要多久:旅行者号速度 ${voy >= 1e6 ? (voy / 1e4).toFixed(0) + " 万" : Math.round(voy).toLocaleString()} 年;光速 ${lyText} 年;` +
          `1g 恒加速飞船 —— 船上仅 <b>${tShip.toFixed(1)} 年</b>, 而地球已过 ${tEarth.toFixed(1)} 年(狭义相对论)。</div>`;
      })(),
      `<button style="margin-top:8px;width:100%" id="starFlyBtn">✦ 飞临这颗恒星</button>`
    ].join("");
    const b = document.getElementById("starFlyBtn");
    if (b) b.addEventListener("click", () => flyToStar(k));
  }
  function showDeepSkyCard(d) {
    if (dsSelected !== d) award("deepsky");
    starSelected = null;
    dsSelected = d;
    const distText = d.distLy >= 1e4 ? `${(d.distLy / 1e4).toFixed(d.distLy >= 1e6 ? 0 : 1)} 万光年` : `${d.distLy.toLocaleString()} 光年`;
    $("infoCard").innerHTML = [
      `<div class="iname" style="color:#b8c8e8">${d.cn}<small>${d.id}</small></div>`,
      `<div class="irow"><span>类型</span><b>${DS_TYPE_CN[d.type] || d.type}</b></div>`,
      `<div class="irow"><span>距离</span><b>${distText}</b></div>`,
      `<div class="irow"><span>视直径</span><b>${d.sizeArcmin >= 60 ? (d.sizeArcmin / 60).toFixed(1) + "°" : d.sizeArcmin + "′"}</b></div>`,
      `<div class="irow"><span>此刻看到的光</span><b>出发于 ${d.distLy >= 1e4 ? (d.distLy / 1e4).toFixed(1) + " 万" : d.distLy.toLocaleString()} 年前</b></div>`,
      `<div class="blurb">${d.blurb}</div>`
    ].join("");
  }

  /* ---------------- 回放编排引擎: 分幕状态机(发射→逃逸→巡航→弹弓→出走) ---------------- */
  const REPLAY_SCRIPTS = {
    Voyager2: [
      { jd: 2443376.17, speed: 1 / 24, focus: "Earth", cap: "<b>1977-08-20 · 卡纳维拉尔角</b> —— 泰坦IIIE-半人马座火箭点火。看那个亮点离开地球: 大巡游开始了。" },
      { jd: 2443376.75, speed: 1, focus: "self", cap: "<b>逃离地球引力</b> · 双曲线超越轨道。第三宇宙速度还不够? 没关系, 木星会补上。" },
      { jd: 2443396.0, speed: 30, focus: "self", cap: "<b>巡航</b> · 穿越小行星带, 22 个月后抵达木星。(此刻的轨迹全部来自 JPL 实测)" },
      { jd: 2444038.5, speed: 2.5, focus: "self", cap: "<b>1979-07-09 · 木星弹弓</b> —— 从木星公转动能里\u201c偷\u201d走约 +7 km/s, 右下角速度曲线看它跃升。" },
      { jd: 2444088.5, speed: 30, focus: "self", cap: "<b>奔向土星</b> · 两年航程。" },
      { jd: 2444817.5, speed: 2.5, focus: "self", cap: "<b>1981-08-26 · 土星弹弓</b> —— 再借一程, 顺访土星环与土卫六。" },
      { jd: 2444867.5, speed: 60, focus: "self", cap: "<b>奔向天王星</b> · 四年半的寂静。" },
      { jd: 2446429.5, speed: 2.5, focus: "self", cap: "<b>1986-01-24 · 天王星弹弓</b> —— 人类唯一一次到访这颗侧躺的行星。" },
      { jd: 2446479.5, speed: 60, focus: "self", cap: "<b>最后一程</b> · 海王星。" },
      { jd: 2447738.5, speed: 2.5, focus: "self", cap: "<b>1989-08-25 · 海王星</b> —— 大巡游终点站, 顺访海卫一的氮冰喷泉。" },
      { jd: 2447823.5, speed: 365.25, focus: "self", cap: "<b>四连弹弓完成</b> · 以第三宇宙速度离开太阳系。再见, 旅行者。", endAt: 2450000 }
    ],
    Voyager1: [
      { jd: 2443392.08, speed: 1 / 24, focus: "Earth", cap: "<b>1977-09-05 · 卡纳维拉尔角</b> —— 比旅行者2号晚发射 16 天, 却先到木星: 它走的是更快的内侧航线。" },
      { jd: 2443392.7, speed: 1, focus: "self", cap: "<b>逃离地球</b> · 直奔木星的快车道。" },
      { jd: 2443412.0, speed: 30, focus: "self", cap: "<b>巡航</b> · 18 个月抵达木星。" },
      { jd: 2443912.5, speed: 2.5, focus: "self", cap: "<b>1979-03-05 · 木星弹弓</b> —— 顺手拍下木卫一正在喷发的火山: 地外火山活动的第一个证据。" },
      { jd: 2443962.5, speed: 30, focus: "self", cap: "<b>奔向土星</b>。" },
      { jd: 2444530.5, speed: 2.5, focus: "self", cap: "<b>1980-11-12 · 土星</b> —— 为近观土卫六, 它放弃了继续巡游: 弹弓把轨道折向黄道面以北。" },
      { jd: 2444615.5, speed: 365.25, focus: "self", cap: "<b>一路向北</b> · 人类飞得最远的造物。1990-02-14, 它在 60 亿公里外回望, 拍下「暗淡蓝点」。", endAt: 2448500 }
    ],
    NewHorizons: [
      { jd: 2453755.33, speed: 1 / 24, focus: "Earth", cap: "<b>2006-01-19 · 卡纳维拉尔角</b> —— 史上最快发射: 9 小时掠过月球轨道。" },
      { jd: 2453755.9, speed: 1, focus: "self", cap: "<b>逃离地球</b> · 直接以太阳系逃逸速度出发。" },
      { jd: 2453770.0, speed: 30, focus: "self", cap: "<b>巡航</b> · 13 个月抵达木星, 顺路借一脚。" },
      { jd: 2454139.5, speed: 2.5, focus: "self", cap: "<b>2007-02-28 · 木星弹弓</b> —— +4 km/s, 航程缩短三年。" },
      { jd: 2454179.5, speed: 120, focus: "self", cap: "<b>沉睡巡航 8 年</b> · 依次穿越土星、天王星、海王星轨道。" },
      { jd: 2457197.5, speed: 2.5, focus: "self", cap: "<b>2015-07-14 · 冥王星!</b> 半个世纪行星探索的最后一块拼图 —— 冰川心形平原、蓝色薄雾。" },
      { jd: 2457237.5, speed: 120, focus: "self", cap: "<b>深入柯伊伯带</b>。" },
      { jd: 2458469.5, speed: 2.5, focus: "self", cap: "<b>2019-01-01 · 天涯海角</b>(Arrokoth)—— 人类探访过的最远天体, 一个雪人形状的原始星子。" },
      { jd: 2458514.5, speed: 365.25, focus: "self", cap: "<b>驶向星际空间</b> —— 下一站, 未知。", endAt: 2461000 }
    ]
  };
  let replay = null;
  let replayView = "local";   // local=跟随航天器  global=俯瞰全局(自动拉远框住全程)
  function replayGlobalWant() {
    const w = worldKm[replay && replay.name];
    if (!w) return 2e6;
    return clamp(Math.hypot(w[0], w[1], w[2]) / SCALE.sceneUnitKm * 1.75, 4.5e5, 8.5e6);
  }
  function focusSunGlobal() {
    // 切锚到太阳但保持广角: 不走常规聚焦补间(那会先拉到 7 倍太阳半径 → "太阳放大一下")
    _v3b.copy(camera.position).sub(controls.target);
    if (_v3b.lengthSq() < 1e-8) _v3b.set(0, -1, 0.45);
    _v3b.normalize();
    setFocus("Sun", true);
    camera.position.copy(controls.target).addScaledVector(_v3b, replayGlobalWant());
  }
  function replaySetView(v) {
    replayView = v;
    $("repLocal").classList.toggle("active", v === "local");
    $("repGlobal").classList.toggle("active", v === "global");
    if (!replay) return;
    if (v === "global") {
      focusSunGlobal();
    } else {
      const st = replay.stages[replay.i];
      setFocus(st.focus === "self" ? replay.name : st.focus, false);
    }
  }
  function replayAdvance(i, jumpJd) {
    const st = replay.stages[i];
    replay.i = i;
    if (i === 0) sfxRumble(); else sfxWhoosh();
    if (jumpJd) jd = st.jd;
    daysPerSecond = st.speed;
    if (replayView === "global") {
      if (anchorName !== "Sun") focusSunGlobal();   // 已在全局广角则不动镜头
    } else {
      setFocus(st.focus === "self" ? replay.name : st.focus, false);
    }
    $("repText").innerHTML = st.cap;
    $("repStage").textContent = `第 ${i + 1} / ${replay.stages.length} 幕 · ${jdToDateText(st.jd).slice(0, 10)}`;
    $("repNext").style.display = i + 1 < replay.stages.length ? "" : "none";
  }
  function startReplay(name) {
    const sc = REPLAY_SCRIPTS[name];
    if (!sc) return;
    stopTour();
    if (deepTime) setDeepTime(false);
    if (stars3D) { stars3D = false; $("cosmoBtn").classList.remove("active"); $("cosmoHint").classList.remove("show"); }
    replay = { name, stages: sc, i: -1 };
    replaySeen[name] = true;
    if (replaySeen.Voyager1 && replaySeen.Voyager2 && replaySeen.NewHorizons) award("replay_all");
    timeDirection = 1;
    $("dirBtn").textContent = "▶";
    playing = true;
    $("playBtn").textContent = "⏸";
    animateScaleTo(0);            // 真实尺度上回放
    vgCraftName = name;
    $("vgTitle").textContent = `${craftByName[name].cn} · 日心速度曲线`;
    vgActive = true;
    $("vgPanel").classList.add("show");
    $("repCap").classList.add("show");
    replayAdvance(0, true);
  }
  function endReplay() {
    replay = null;
    $("repCap").classList.remove("show");
  }
  function tickReplay() {
    if (!replay) return;
    if (replayView === "global") {
      const w = worldKm[replay.name];
      if (w) {
        const rBu = Math.hypot(w[0], w[1], w[2]) / SCALE.sceneUnitKm;
        const want = clamp(rBu * 1.75, 4.5e5, 8.5e6);   // 框住 日-航天器 连线, 近段不小于 3AU 视野
        const cur = camera.position.distanceTo(controls.target);
        const k2 = 1 + (want / Math.max(cur, 1) - 1) * 0.04;
        camera.position.sub(controls.target).multiplyScalar(k2).add(controls.target);
      }
    }
    const cur = replay.stages[replay.i];
    const next = replay.stages[replay.i + 1];
    if (next) {
      if (jd >= next.jd) replayAdvance(replay.i + 1, false);
    } else if (cur.endAt && jd >= cur.endAt) {
      if (replay.name === "Voyager2") award("replay_v2");
      endReplay();
    }
    if (jd < replay?.stages[0].jd - 30) endReplay();   // 用户手动倒回: 退出编排
  }

  /* ---------------- 旅行者2号 · 引力弹弓回放 ---------------- */
  let vgActive = false;
  function startVoyagerReplay() {
    startReplay("Voyager2");
    drawVoyagerChart();
  }
  let vgCraftName = "Voyager2";
  function drawVoyagerChart() {
    const cv = $("vgCanvas");
    const cx = cv.getContext("2d");
    const c = craftByName[vgCraftName];
    if (!cx || !c) return;
    const W = cv.width, H = cv.height;
    const lastEv = c.events[c.events.length - 1][0];
    const J0 = c.launchJd - 120, J1 = lastEv + (vgCraftName === "NewHorizons" ? 900 : 2400);
    const V0 = 0, V1 = vgCraftName === "NewHorizons" ? 50 : 45;
    const X = (j) => (j - J0) / (J1 - J0) * (W - 34) + 30;
    const Y = (v) => H - 18 - (v - V0) / (V1 - V0) * (H - 30);
    cx.clearRect(0, 0, W, H);
    cx.strokeStyle = "rgba(140,170,220,0.25)";
    cx.fillStyle = "rgba(160,185,225,0.75)";
    cx.font = "9px sans-serif";
    cx.lineWidth = 1;
    for (const v of [10, 20, 30, 40]) {
      cx.beginPath(); cx.moveTo(30, Y(v)); cx.lineTo(W - 4, Y(v)); cx.stroke();
      cx.fillText(v, 8, Y(v) + 3);
    }
    const y0 = Math.ceil((J0 - 2451545) / 365.25 + 2000), y1 = Math.floor((J1 - 2451545) / 365.25 + 2000);
    const yStep = Math.max(2, Math.round((y1 - y0) / 6));
    for (let y = y0 + 1; y <= y1; y += yStep) {
      const j = 2451545 + (y - 2000) * 365.25;
      cx.fillText(y, X(j) - 9, H - 5);
    }
    // 飞掠标记(取事件名首字)
    const FB = c.events.map((ev) => [ev[1][0], ev[0]]);
    cx.strokeStyle = "rgba(255,190,120,0.45)";
    for (const [lab, j] of FB) {
      cx.beginPath(); cx.moveTo(X(j), Y(V1)); cx.lineTo(X(j), H - 16); cx.stroke();
      cx.fillStyle = "rgba(255,205,140,0.9)";
      cx.fillText(lab, X(j) - 4, 10);
      cx.fillStyle = "rgba(160,185,225,0.75)";
    }
    // 速度曲线(采样点直接连线)
    cx.strokeStyle = "#9fe8ff";
    cx.lineWidth = 1.6;
    cx.beginPath();
    let started = false;
    const d = c.d;
    for (let i = 0; i < d.length / 7; i += 1) {
      const j = d[i * 7];
      if (j > J1) break;
      const v = Math.hypot(d[i * 7 + 4], d[i * 7 + 5], d[i * 7 + 6]);
      if (!started) { cx.moveTo(X(j), Y(v)); started = true; } else cx.lineTo(X(j), Y(v));
    }
    cx.stroke();
    // 当前时刻游标
    if (jd >= J0 && jd <= J1) {
      craftStateKm(c, jd, _cs);
      const v = Math.hypot(_cs.v[0], _cs.v[1], _cs.v[2]);
      cx.strokeStyle = "rgba(255,255,255,0.55)";
      cx.beginPath(); cx.moveTo(X(jd), Y(V1)); cx.lineTo(X(jd), H - 16); cx.stroke();
      cx.fillStyle = "#ffffff";
      cx.beginPath(); cx.arc(X(jd), Y(v), 3, 0, Math.PI * 2); cx.fill();
      cx.font = "10px sans-serif";
      cx.fillText(`${v.toFixed(1)} km/s`, Math.min(X(jd) + 6, W - 56), Y(v) - 6);
    }
  }
  let deepTimeActiveOff = null;   // setupUi 注入(避免前向引用)
  let setDeepTimeRef = null;      // 深链解析用(setDeepTime 定义于 setupUi 作用域)

  /* ---------------- 航天器/探针 程序化实体建模 ---------------- */
  function _mGold() { return new THREE.MeshStandardMaterial({ color: 0xc9a64b, metalness: 0.85, roughness: 0.4, emissive: 0x2a2113, emissiveIntensity: 0.55 }); }
  function _mWhite() { return new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 0.25, roughness: 0.5, emissive: 0x23272e, emissiveIntensity: 0.5 }); }
  function _mDark() { return new THREE.MeshStandardMaterial({ color: 0x4b5058, metalness: 0.6, roughness: 0.55, emissive: 0x14161a, emissiveIntensity: 0.5 }); }
  /* 抛物面天线: LatheGeometry */
  function makeDish(radius, depth, mat) {
    const pts = [];
    for (let i = 0; i <= 12; i += 1) {
      const x = i / 12 * radius;
      pts.push(new THREE.Vector2(x, depth * (x / radius) * (x / radius)));
    }
    const dish = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), mat);
    dish.rotation.x = Math.PI / 2;   // 碟口朝 -z(组内前向 +z 为指地方向, 碟背对)
    return dish;
  }
  /* 旅行者号: 3.7m 高增益天线 + 十边形舱体 + RTG 杆 + 磁强计长杆 + 金唱片 */
  function makeVoyagerModel() {
    const g = new THREE.Group();
    const dish = makeDish(1, 0.34, _mWhite());
    dish.position.z = 0.18;
    g.add(dish);
    const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), _mDark());
    feed.rotation.x = Math.PI / 2;
    feed.position.z = -0.12;
    g.add(feed);
    const bus = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.26, 10), _mGold());
    bus.rotation.x = Math.PI / 2;
    bus.position.z = 0.5;
    g.add(bus);
    const record = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 20),
      new THREE.MeshStandardMaterial({ color: 0xe8c96a, metalness: 1, roughness: 0.25, emissive: 0x4a3a12, emissiveIntensity: 0.7 }));
    record.position.set(0.28, 0.42, 0.5);
    record.rotation.x = Math.PI / 2;
    g.add(record);
    const rtg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 10), _mDark());
    rtg.position.set(-1.05, -0.35, 0.55);
    rtg.rotation.z = 0.5;
    g.add(rtg);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 3.4, 6), _mWhite());
    boom.position.set(1.75, 0.42, 0.55);
    boom.rotation.z = -1.08;
    g.add(boom);
    const mag = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), _mWhite());
    mag.position.set(3.25, 1.05, 0.55);
    g.add(mag);
    return g;
  }
  /* 新视野号: 三角舱体 + 2.1m 天线 + RTG */
  function makeNewHorizonsModel() {
    const g = new THREE.Group();
    const bus = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.4, 3), _mGold());
    bus.rotation.x = Math.PI / 2;
    bus.position.z = 0.42;
    g.add(bus);
    const dish = makeDish(0.75, 0.22, _mWhite());
    dish.position.z = 0.1;
    g.add(dish);
    const rtg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.0, 10), _mDark());
    rtg.position.set(-0.95, 0, 0.45);
    rtg.rotation.z = Math.PI / 2;
    g.add(rtg);
    return g;
  }
  /* 沙盒探针: 八面体核 + 双太阳翼 + 小天线 */
  function makeProbeModel(color) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.3),
      new THREE.MeshStandardMaterial({ color: 0xb9c2cf, metalness: 0.7, roughness: 0.35, emissive: color, emissiveIntensity: 0.35 }));
    g.add(core);
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x2a4a8a, metalness: 0.4, roughness: 0.4, emissive: 0x14264a, emissiveIntensity: 0.8, side: THREE.DoubleSide });
    for (const sgn of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.42, 0.02), wingMat);
      wing.position.x = sgn * 0.88;
      g.add(wing);
    }
    const dish = makeDish(0.2, 0.06, _mWhite());
    dish.position.z = -0.28;
    g.add(dish);
    return g;
  }
  const _mdlDir = new THREE.Vector3(), _mdlZ = new THREE.Vector3(0, 0, 1);
  /* 模型三段式尺度: 近处停缩(拉近自然放大, 可"抵达");中距恒定屏占;远处封顶, 由光点+标签接管 */
  function placeCraftModel(model, spr, refScale, sMin, sMax) {
    model.position.copy(spr.position);
    const camDist = camera.position.distanceTo(spr.position);
    const sc = clamp(camDist * refScale, sMin, sMax);
    model.scale.setScalar(sc);
    spr.material.opacity = camDist * refScale < sMin ? 0.25 : 0.6;   // 贴近实体时光点让位
    return camDist;
  }

  /* ================= 阶段12 · 航天器时代(HORIZONS 真实轨迹) ================= */
  const SPACECRAFT = window.SPACECRAFT || [];
  const craftByName = {};
  for (const c of SPACECRAFT) craftByName[c.name] = c;
  const _cs = { r: [0, 0, 0], v: [0, 0, 0] };
  /* 采样点间三次 hermite 插值(位置+速度端点), 网格外线性外推 */
  function craftStateKm(c, jdT, out) {
    const d = c.d, n = d.length / 7;
    if (jdT <= d[0]) {
      // 发射前不存在: 钳制在首采样点(此前曾反向外推 → 1956 年"旅行者在 173AU"的幽灵 bug)
      for (let i = 0; i < 3; i += 1) { out.r[i] = d[1 + i]; out.v[i] = d[4 + i]; }
      return out;
    }
    const L = (n - 1) * 7;
    if (jdT >= d[L]) {
      const h = (jdT - d[L]) * DAY_S;
      for (let i = 0; i < 3; i += 1) { out.r[i] = d[L + 1 + i] + d[L + 4 + i] * h; out.v[i] = d[L + 4 + i]; }
      return out;
    }
    let lo = c._i || 0, hi = n - 1;
    if (!(d[lo * 7] <= jdT && jdT < d[(lo + 1) * 7])) {
      lo = 0;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (d[mid * 7] <= jdT) lo = mid; else hi = mid;
      }
    }
    c._i = lo;
    const a = lo * 7, b = a + 7;
    const h = (d[b] - d[a]) * DAY_S;
    const t = (jdT - d[a]) * DAY_S / h;
    const t2 = t * t, t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    const g00 = (6 * t2 - 6 * t) / h, g01 = (6 * t - 6 * t2) / h;
    for (let i = 0; i < 3; i += 1) {
      const p0 = d[a + 1 + i], p1 = d[b + 1 + i], m0 = d[a + 4 + i] * h, m1 = d[b + 4 + i] * h;
      out.r[i] = h00 * p0 + h10 * m0 + h01 * p1 + h11 * m1;
      // 速度 = dP/dτ(km/s): 归一化导数 / h, 端点处严格回到采样速度
      out.v[i] = g00 * p0 + (3 * t2 - 4 * t + 1) * d[a + 4 + i] + g01 * p1 + (3 * t2 - 2 * t) * d[b + 4 + i];
    }
    return out;
  }
  function buildSpacecraft() {
    for (const c of SPACECRAFT) {
      const n = c.d.length / 7;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false
      }));
      line.frustumCulled = false;
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeProbeTexture(), color: new THREE.Color(c.color), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, sizeAttenuation: false
      }));
      spr.scale.set(0.02, 0.02, 1);
      spr.frustumCulled = false;
      spr.renderOrder = 5;
      scene.add(line);
      scene.add(spr);
      const model = c.name === "NewHorizons" ? makeNewHorizonsModel() : makeVoyagerModel();
      model.visible = false;
      scene.add(model);
      CN[c.name] = c.cn; ACCENT[c.name] = c.color;
      const DEST = { Voyager1: "旅行者1号 → 4 万年后掠过恒星 Gliese 445", Voyager2: "旅行者2号 → 4 万年后掠过恒星 Ross 248" };
      if (DEST[c.name]) {
        const dg = new THREE.BufferGeometry();
        dg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
        c.gfx0_dest = new THREE.Line(dg, new THREE.LineBasicMaterial({
          color: new THREE.Color(c.color), transparent: true, opacity: 0.3, depthWrite: false
        }));
        c.gfx0_dest.frustumCulled = false;
        scene.add(c.gfx0_dest);
        c.gfx0_destLabel = makeStarNameSprite(DEST[c.name]);
        c.gfx0_destLabel.scale.multiplyScalar(1.45);
        scene.add(c.gfx0_destLabel);
      }
      const label = makeLabel(c.name);
      label.visible = false;
      scene.add(label);
      c.gfx = { line, spr, col: new THREE.Color(c.color), model, label };
    }
  }
  function updateSpacecraft(anchor, dx, dy, dz) {
    const showOrbits = document.getElementById("tglOrbits").checked;
    const showLabelsCraft = document.getElementById("tglLabels").checked;
    for (const c of SPACECRAFT) {
      if (!c.gfx) continue;
      const alive = jd >= c.launchJd;
      c.gfx.spr.visible = alive;
      c.gfx.line.visible = alive && showOrbits;
      c.gfx.label.visible = alive && showLabelsCraft && star3DBlend <= 0.55;
      craftStateKm(c, jd, _cs);   // 速度仍需(姿态/信息卡); 位置用与锚点同帧的 worldKm
      const ckm = worldKm[c.name] || _cs.r;
      _rel[0] = ckm[0] - anchor[0]; _rel[1] = ckm[1] - anchor[1]; _rel[2] = ckm[2] - anchor[2];
      mapPoint(_rel, _p);
      c.gfx.spr.position.set(_p[0] - dx, _p[1] - dy, _p[2] - dz);
      c.gfx.label.position.copy(c.gfx.spr.position);
      c.gfx.model.visible = alive;
      if (alive) {
        placeCraftModel(c.gfx.model, c.gfx.spr, 0.05, 0.02, 2.2);
        const ep = scenePos.Earth;
        if (ep) {   // 高增益天线实时指向地球(真实姿态约束)
          _mdlDir.set(ep[0] - c.gfx.spr.position.x, ep[1] - c.gfx.spr.position.y, ep[2] - c.gfx.spr.position.z).normalize();
          c.gfx.model.quaternion.setFromUnitVectors(_mdlZ, _mdlDir);
        }
      }
      scenePos[c.name] = [_p[0] - dx, _p[1] - dy, _p[2] - dz];
      sceneRadius[c.name] = 0.12;
      if (c.gfx0_dest) {   // 星际视角: 去向延长线(它正飞向哪颗星)
        const show = alive && star3DBlend > 0.5;
        c.gfx0_dest.visible = show;
        c.gfx0_destLabel.visible = show;
        if (show) {
          const vm2 = Math.max(Math.hypot(_cs.v[0], _cs.v[1], _cs.v[2]), 1e-6);
          const sp2 = c.gfx.spr.position;
          const L2 = 1.15e8;
          const da = c.gfx0_dest.geometry.attributes.position.array;
          da[0] = sp2.x; da[1] = sp2.y; da[2] = sp2.z;
          da[3] = sp2.x + _cs.v[0] / vm2 * L2; da[4] = sp2.y + _cs.v[1] / vm2 * L2; da[5] = sp2.z + _cs.v[2] / vm2 * L2;
          c.gfx0_dest.geometry.attributes.position.needsUpdate = true;
          c.gfx0_destLabel.position.set(da[3] * 0.82, da[4] * 0.82, da[5] * 0.82);
          c.gfx0_destLabel.material.opacity = clamp((star3DBlend - 0.5) * 2, 0, 0.8);
        }
      }
      if (!c.gfx.line.visible) continue;
      const d = c.d, nSeg = d.length / 7;
      const arr = c.gfx.line.geometry.attributes.position.array;
      for (let i = 0; i < nSeg; i += 1) {
        _rel[0] = d[i * 7 + 1] - anchor[0]; _rel[1] = d[i * 7 + 2] - anchor[1]; _rel[2] = d[i * 7 + 3] - anchor[2];
        mapPoint(_rel, _p);
        arr[i * 3] = _p[0] - dx; arr[i * 3 + 1] = _p[1] - dy; arr[i * 3 + 2] = _p[2] - dz;
      }
      c.gfx.line.geometry.attributes.position.needsUpdate = true;
      // 颜色只依赖"已飞/未来"分界索引, 分界不动就不重写(GPU 上传减半)
      let split = 0;
      while (split < nSeg && d[split * 7] <= jd) split += 1;
      if (c.gfx._split !== split) {
        c.gfx._split = split;
        const colA = c.gfx.line.geometry.attributes.color.array;
        for (let i = 0; i < nSeg; i += 1) {
          const b = i < split ? 0.85 : 0.13;
          colA[i * 3] = c.gfx.col.r * b; colA[i * 3 + 1] = c.gfx.col.g * b; colA[i * 3 + 2] = c.gfx.col.b * b;
        }
        c.gfx.line.geometry.attributes.color.needsUpdate = true;
      }
    }
  }

/* 深空图鉴/银河罗盘 外挂模块桥: deepsky.js 仅通过此接口读主程序状态 */
  if (typeof window !== "undefined") window.__dsBridge = {
    THREE, scene,
    camera: () => camera,
    blend: () => star3DBlend,
    yr: () => yearsFromJ2000(),
    skyDim: () => (catalogStarMat ? catalogStarMat.uniforms.uDim.value : 1),
    eq2ecl: (raDeg, decDeg) => {
      const ra = raDeg * D2R, de = decDeg * D2R;
      const x = Math.cos(de) * Math.cos(ra), y = Math.cos(de) * Math.sin(ra), z = Math.sin(de);
      return [x, y * Math.cos(EPS0) + z * Math.sin(EPS0), -y * Math.sin(EPS0) + z * Math.cos(EPS0)];
    }
  };
  if (typeof window !== "undefined") window.__replay = {
    start: startReplay, tick: tickReplay, get: () => replay, speed: () => daysPerSecond
  };
  if (typeof window !== "undefined") window.__mag = { r0: magR0, shue: magShueR, line: magFieldPolyline };
  if (typeof window !== "undefined") window.__gal = { v: GAL_V_ECL };
  if (typeof window !== "undefined") window.__hist = {
    scenes: HISTORY_SCENES,
    cometR: (name, j) => { const c = cometByName[name]; if (!c) return -1; const k = cometKm(c, j); return Math.hypot(k[0], k[1], k[2]) / AU_KM; },
    cometEarthDist: (name, j) => {
      const c = cometByName[name]; if (!c) return -1;
      const k = cometKm(c, j); const e = heliocentricKm(bodyByName.Earth.orbit_j2000, j);
      return Math.hypot(k[0] - e[0], k[1] - e[1], k[2] - e[2]) / AU_KM;
    }
  };
  if (typeof window !== "undefined") window.__isx = {
    phys: (cn) => { const k = namedStars.find((x) => x.cn === cn); return k ? { ...starPhys(k), rv: k.rv, plx: k.plx } : null; },
    named: () => namedStars.map((k) => ({ cn: k.cn, p0: k.p0, v: k.v, rv: k.rv }))
  };
  if (typeof window !== "undefined") window.__craft = {
    list: SPACECRAFT,
    state: (name, jdT) => { const c = craftByName[name]; const o2 = { r: [0, 0, 0], v: [0, 0, 0] }; return c ? craftStateKm(c, jdT, o2) : null; }
  };

  /* ---------------- 新手引导(可跳过, 首次自动) ---------------- */
  const GUIDE_STEPS = [
    { el: null, t: "欢迎来到实时太阳系", x: "这里没有一帧是摆拍——行星、卫星、彗星、探测器的每个位置都由真实历表与实测数据推算。花一分钟了解玩法, 随时可跳过。" },
    { el: "timeBar", t: "时间是核心玩具", x: "播放/倒放/变速。<b>天象</b>=1900—2100 全事件日历(日食月食一键跳);<b>深时</b>=±5 万年看星座变形与北极星更替;<b>星际</b>=恒星展开真实距离, 飞出太阳系。" },
    { el: "timelineWrap", t: "时间轴", x: "拖动滑块穿越两百年。彩色圆点是大事件: 哈雷回归、阿波菲斯 2029 掠地、旅行者 1977 出发…悬停可看说明。" },
    { el: "panel", t: "聚焦·信息·显示", x: "点击任意天体按钮聚焦跟随, 信息卡显示实时数据;<b>真实/观感尺度</b>随时切换。显示选项里可关掉<b>小行星带/柯伊伯带</b>, 「星空」三挡里选<b>无星</b>即一片黑寂。悬停任意亮星可看它的简介。" },
    { el: "sbxBtn", t: "引力沙盒 · 玩法", x: "开启<b>投放模式</b>后: 在黄道面<b>按下</b>=定位置, <b>拖拽</b>=给速度(实时显示圆轨道/逃逸参考), <b>松开</b>=发射;轻点=直接圆轨道。探针受太阳+八大行星真实引力——扔到木星旁试试引力弹弓。" },
    { el: "launchBtn", t: "霍曼挑战 · 规则", x: "把探针送到火星: ①点<b>下个窗口</b>(自动对相位并代入理论 Δv) ②微调 Δv ③<b>发射</b>。按与火星最近距离评星, ★★★<300 万 km。窗口不对, 怎么加速都到不了——会合周期 780 天。" },
    { el: "vgBtn", t: "人类足迹", x: "旅行者与新视野号的 JPL 实测轨迹已内置。点这里回放 1977—1989 <b>四连引力弹弓</b>, 右下角速度曲线看它如何从行星公转里「偷」动能。" },
    { el: null, t: "发射场就在地球上", x: "切到<b>真实尺度</b>贴近地球: 七座发射场信标常驻球面正确经纬度, 随地球自转。<b>点信标直接进发射剧场</b>;土星五号入轨后还会等 TLI 窗口奔月——抵月后一键开月球车。时间轴拨到历史发射时刻(如 1969-07-16), 还会有偶遇提示。" },
    { el: "helpBtn", t: "开始探索!", x: "快捷键与操作说明都在「?」里, 想重看引导也从那里打开。别忘了月球信息卡里还有一辆月球车等你开。" }
  ];
  let gdStep = 0, gdActive = false;
  function guideShow(i) {
    gdStep = i;
    const st = GUIDE_STEPS[i];
    const spot = $("gdSpot"), card = $("gdCard");
    $("gdTitle").textContent = st.t;
    $("gdText").innerHTML = st.x;
    $("gdDots").innerHTML = GUIDE_STEPS.map((_, k) => `<span${k === i ? ' class="on"' : ""}></span>`).join("");
    $("gdNext").textContent = i === GUIDE_STEPS.length - 1 ? "开始探索" : "下一步";
    const target = st.el && document.getElementById(st.el);
    if (target && target.scrollIntoView) target.scrollIntoView({ block: "nearest" });
    requestAnimationFrame(() => {
      const W = window.innerWidth, H = window.innerHeight;
      let r = { left: W / 2, top: H / 2, width: 0, height: 0 };
      if (target && target.getBoundingClientRect) r = target.getBoundingClientRect();
      const pad = 7;
      spot.style.left = `${r.left - pad}px`;
      spot.style.top = `${r.top - pad}px`;
      spot.style.width = `${r.width + pad * 2}px`;
      spot.style.height = `${r.height + pad * 2}px`;
      const cw = 330, ch = 190;
      let cx2 = r.left + r.width + 22, cy2 = r.top;
      if (!st.el) { cx2 = W / 2 - cw / 2; cy2 = H / 2 - ch / 2; }
      else {
        if (cx2 + cw > W - 12) cx2 = r.left - cw - 22;                 // 右边放不下 → 左侧
        if (cx2 < 12) cx2 = clamp(r.left + r.width / 2 - cw / 2, 12, W - cw - 12);
        if (r.top > H * 0.62) cy2 = r.top - ch - 18;                   // 底栏目标 → 上方
        cy2 = clamp(cy2, 12, H - ch - 12);
      }
      card.style.left = `${cx2}px`;
      card.style.top = `${cy2}px`;
    });
  }
  function startGuide() {
    $("panel").classList.remove("collapsed");
    $("helpCard").classList.remove("show");
    gdActive = true;
    $("guide").classList.add("show");
    guideShow(0);
  }
  function endGuide() {
    gdActive = false;
    $("guide").classList.remove("show");
    try { localStorage.setItem("ss_guide_done", "1"); } catch (e) { /* file:// 环境可能禁用 */ }
  }

  /* ---------------- 聚焦 ---------------- */
  function setFocus(name, jump) {
    selectedName = name;
    dsSelected = null;
    starSelected = null;
    starFlyGoal = null;
    anchorName = name;
    if (cometByName[name] && cometByName[name].hyper) award("visitor");
    updateSystem();
    const target = new THREE.Vector3(...scenePos[name]);
    const radius = sceneRadius[name] || 1;
    const offset = camera.position.clone().sub(controls.target);
    if (offset.length() < 1e-4) offset.set(0, -1, 0.5);
    offset.normalize();
    const dist = Math.max(radius * (scaleBlend < 0.5 ? 7.0 : 5.5), scaleBlend < 0.5 ? radius * 7.0 : 2.2);
    const endPos = target.clone().add(offset.multiplyScalar(dist));
    if (jump) {
      controls.target.copy(target);
      camera.position.copy(endPos);
      focusTween = null;
    } else {
      focusTween = { t: 0, dur: reducedMotion ? 0.001 : 1.0, sT: controls.target.clone(), sP: camera.position.clone(), eT: target, eP: endPos };
    }
    refreshChips();
    refreshInfo();
  }

  function tickTween(dt) {
    if (!focusTween) return;
    focusTween.t += dt;
    const k = clamp(focusTween.t / focusTween.dur, 0, 1);
    const e = k * k * (3 - 2 * k);
    controls.target.lerpVectors(focusTween.sT, focusTween.eT, e);
    camera.position.lerpVectors(focusTween.sP, focusTween.eP, e);
    if (k >= 1) focusTween = null;
  }

  /* ---------------- 飞行相机 ---------------- */
  function tickFlight(dt) {
    const f = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
    const r = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
    const u = (keys.has("KeyE") ? 1 : 0) - (keys.has("KeyQ") ? 1 : 0);
    if (!f && !r && !u) return;
    stopTour();
    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
    const move = fwd.multiplyScalar(f).add(right.multiplyScalar(r)).add(camera.up.clone().multiplyScalar(u));
    if (move.lengthSq() === 0) return;
    const dist = Math.max(camera.position.distanceTo(controls.target), 0.5);
    move.normalize().multiplyScalar(dist * (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 3.0 : 0.9) * dt);
    camera.position.add(move);
    controls.target.add(move);
    focusTween = null;
  }

  /* ---------------- 拾取 ---------------- */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerDownAt = null;
  function pickAt(cx, cy) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((cx - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((cy - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickMeshes, false);
    return hits.length ? hits[0].object.userData.bodyName : null;
  }
  renderer.domElement.addEventListener("pointerdown", (e) => {
    audioPoke();
    stopTour();
    starFlyGoal = null;   // 用户接管镜头: 终止恒星飞临
    if (sbxMode && e.button === 0) {
      const rKm = screenToEclipticKm(e.clientX, e.clientY, _sbxView.anchor, _sbxView.off);
      if (rKm) {
        sbxDrag = { rKm, x0: e.clientX, y0: e.clientY, scene0: _hit.clone(), v: 0, dir: null };
        controls.enabled = false;
        pointerDownAt = null;
        return;
      }
    }
    pointerDownAt = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (sbxDrag) {
      const d = sbxDrag;
      controls.enabled = true;
      if (sbxArrow) { scene.remove(sbxArrow); sbxArrow = null; }
      const rr = Math.hypot(d.rKm[0], d.rKm[1], d.rKm[2]);
      let v;
      if (d.v < 0.8 || !d.dir) {           // 轻点: 该处顺行圆轨道
        const vc = Math.sqrt(GM_SUN_KM / rr);
        v = [-d.rKm[1] / rr * vc, d.rKm[0] / rr * vc, 0];
      } else {
        v = [d.dir[0] * d.v, d.dir[1] * d.v, 0];
      }
      launchProbe(d.rKm, v);
      sbxDrag = null;
      return;
    }
    if (!pointerDownAt) return;
    const dx = e.clientX - pointerDownAt.x, dy = e.clientY - pointerDownAt.y;
    pointerDownAt = null;
    if (dx * dx + dy * dy < 20) {
      const hit = pickAt(e.clientX, e.clientY);
      if (hit && hit.indexOf("site_") === 0) {
        const st2 = SITES.find((x) => x.nm === hit);
        if (st2) { lnchEnter({ rocket: st2.id }); return; }
      }
      if (hit) { setFocus(hit, false); return; }
      if (star3DBlend > 0.3) {
        const ds = pickDeepSky(e.clientX, e.clientY);
        if (ds) { showDeepSkyCard(ds); return; }
      }
      const nsc = pickNamedStar(e.clientX, e.clientY);
      if (nsc) showStarCard(nsc);
    }
  });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (sbxDrag) {
      const cur = screenToEclipticKm(e.clientX, e.clientY, _sbxView.anchor, _sbxView.off);
      const px = Math.hypot(e.clientX - sbxDrag.x0, e.clientY - sbxDrag.y0);
      sbxDrag.v = clamp(px / 14, 0, 65);
      if (cur) {
        const dxk = cur[0] - sbxDrag.rKm[0], dyk = cur[1] - sbxDrag.rKm[1];
        const L = Math.hypot(dxk, dyk);
        if (L > 1e4) sbxDrag.dir = [dxk / L, dyk / L, 0];
      }
      if (!sbxArrow) {
        sbxArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), sbxDrag.scene0, 1, 0x7ce0ff, 0.3, 0.18);
        scene.add(sbxArrow);
      }
      const sceneLen = Math.max(_hit.distanceTo(sbxDrag.scene0), 1e-4);
      sbxArrow.position.copy(sbxDrag.scene0);
      sbxArrow.setDirection(_hit.clone().sub(sbxDrag.scene0).normalize());
      sbxArrow.setLength(sceneLen, sceneLen * 0.22, sceneLen * 0.1);
      const rAu = Math.hypot(sbxDrag.rKm[0], sbxDrag.rKm[1], sbxDrag.rKm[2]) / AU_KM;
      $("sbxHint").innerHTML = `r = ${rAu.toFixed(2)} AU · 速度 <b>${sbxDrag.v.toFixed(1)} km/s</b>` +
        `(该处圆轨道 ${Math.sqrt(GM_SUN_KM / (rAu * AU_KM)).toFixed(1)}, 逃逸 ${Math.sqrt(2 * GM_SUN_KM / (rAu * AU_KM)).toFixed(1)})`;
      return;
    }
    hoverName = pickAt(e.clientX, e.clientY);
    if (hoverName) {
      hideHoverTip();
    } else {
      const ns = pickNamedStar(e.clientX, e.clientY);
      if (ns) {
        showHoverTip(starTipHtml(ns), e.clientX, e.clientY);
      } else if (star3DBlend > 0.3 && window.DEEPSKY) {
        const ds = pickDeepSky(e.clientX, e.clientY);
        if (ds) {
          const dl = ds.distLy >= 1e4 ? (ds.distLy / 1e4).toFixed(1) + " 万光年" : ds.distLy.toLocaleString() + " 光年";
          showHoverTip(`<b>${ds.cn}</b><br><span class="dim">${DS_TYPE_CN[ds.type] || ds.type} · ${dl}</span><br>点击查看图鉴`, e.clientX, e.clientY);
        } else {
          hideHoverTip();
        }
      } else {
        hideHoverTip();
      }
    }
    renderer.domElement.style.cursor = hoverName ? "pointer" : (sbxMode ? "crosshair" : "default");
  });

  /* ---------------- 时间与日期 ---------------- */
  function jdToDateText(jdTt) {
    const ms = (jdTt - 2440587.5) * 86400000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return "----";
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
  }

  /* ---------------- UI ---------------- */
  const $ = (id) => document.getElementById(id);
  const SPEEDS = [
    { label: "实时", v: 1 / 86400 },
    { label: "时/秒", v: 1 / 24 },
    { label: "天/秒", v: 1 },
    { label: "月/秒", v: 30 },
    { label: "年/秒", v: 365.25 }
  ];
  function refreshChips() {
    for (const btn of document.querySelectorAll(".bgrid button")) {
      btn.classList.toggle("active", btn.dataset.name === selectedName);
    }
  }
  /* 实时日心轨道速度(km/s): 中心差分 */
  function heliocentricSpeed(name) {
    const cf = craftByName[name];
    if (cf) { craftStateKm(cf, jd, _cs); return Math.hypot(_cs.v[0], _cs.v[1], _cs.v[2]); }
    let p1, p2;
    const cmt = cometByName[name];
    if (cmt) { p1 = cometKm(cmt, jd - 0.5); p2 = cometKm(cmt, jd + 0.5); }
    else {
      const b = bodyByName[name];
      if (!b || !b.orbit_j2000) return 0;
      p1 = heliocentricKm(b.orbit_j2000, jd - 0.5);
      p2 = heliocentricKm(b.orbit_j2000, jd + 0.5);
    }
    return Math.hypot(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]) / 86400;
  }
  let dsSelected = null;   // 深空图鉴选中态: 优先渲染, 点选常规天体时清除
  let starSelected = null; // 恒星图鉴选中态
  function refreshInfo() {
    if (starSelected) { showStarCard(starSelected); return; }
    if (dsSelected) { showDeepSkyCard(dsSelected); return; }
    const cf2 = craftByName[selectedName];
    if (cf2) {
      craftStateKm(cf2, jd, _cs);
      const flown = jd - cf2.launchJd;
      if (flown < 0) {
        $("infoCard").innerHTML = [
          `<div class="iname" style="color:${cf2.color}">${cf2.cn}<small>${cf2.name}</small></div>`,
          `<div class="irow"><span>状态</span><b>尚未发射</b></div>`,
          `<div class="irow"><span>发射日期</span><b>${jdToDateText(cf2.launchJd).slice(0, 10)}</b></div>`,
          `<div class="irow"><span>距发射还有</span><b>${(-flown / 365.25).toFixed(1)} 年</b></div>`,
          `<div class="blurb">${cf2.blurb}(把时间拨到发射日之后, 它就会从地球出发)</div>`
        ].join("");
        return;
      }
      const rAu = Math.hypot(_cs.r[0], _cs.r[1], _cs.r[2]) / AU_KM;
      const eW2 = worldKm.Earth || [0, 0, 0];
      const dE = Math.hypot(_cs.r[0] - eW2[0], _cs.r[1] - eW2[1], _cs.r[2] - eW2[2]);
      const lightH = dE / (299792.458 * 3600);
      $("infoCard").innerHTML = [
        `<div class="iname" style="color:${cf2.color}">${cf2.cn}<small>${cf2.name}</small></div>`,
        `<div class="irow"><span>距太阳</span><b>${rAu.toFixed(2)} AU</b></div>`,
        `<div class="irow"><span>距地球</span><b>${(dE / AU_KM).toFixed(2)} AU</b></div>`,
        `<div class="irow"><span>单程无线电</span><b>${lightH >= 1 ? lightH.toFixed(1) + " 小时" : (lightH * 60).toFixed(0) + " 分钟"}</b></div>`,
        `<div class="irow"><span>日心速度</span><b>${Math.hypot(_cs.v[0], _cs.v[1], _cs.v[2]).toFixed(2)} km/s</b></div>`,
        `<div class="irow"><span>已飞行</span><b>${(flown / 365.25).toFixed(1)} 年</b></div>`,
        `<div class="blurb">${cf2.blurb}(轨迹: JPL HORIZONS 实测)</div>`,
        REPLAY_SCRIPTS[cf2.name] ? `<button style="margin-top:8px;width:100%" id="repBtnCard">▶ 飞行全程回放(发射 → 星际)</button>` : ""
      ].join("");
      const rb = document.getElementById("repBtnCard");
      if (rb) rb.addEventListener("click", () => startReplay(cf2.name));
      return;
    }
    const cSel = cometByName[selectedName];
    if (cSel) {
      const rAu = Math.hypot(...(worldKm[cSel.name] || [0, 0, 0])) / AU_KM;
      $("infoCard").innerHTML = [
        `<div class="iname" style="color:${cSel.accent}">${cSel.cn}<small>${cSel.eng}</small></div>`,
        `<div class="irow"><span>彗核半径</span><b>~${cSel.radius_km} km</b></div>`,
        `<div class="irow"><span>近日点</span><b>${cSel.qAu.toFixed(3)} AU</b></div>`,
        cSel.hyper
          ? `<div class="irow"><span>轨道</span><b>双曲线 e = ${cSel.segments[0].e.toFixed(2)}</b></div>`
          : `<div class="irow"><span>远日点</span><b>${cSel.QAu.toFixed(1)} AU</b></div>`,
        cSel.hyper
          ? `<div class="irow"><span>双曲超速 v∞</span><b>${cSel.vinf.toFixed(1)} km/s</b></div>`
          : `<div class="irow"><span>公转周期</span><b>${cSel.periodText}</b></div>`,
        `<div class="irow"><span>距太阳</span><b>${rAu.toFixed(3)} AU</b></div>`,
        `<div class="irow"><span>轨道速度</span><b>${heliocentricSpeed(cSel.name).toFixed(2)} km/s</b></div>`,
        `<div class="irow"><span>阳光到达</span><b>${(rAu * 8.3167).toFixed(1)} 分钟</b></div>`,
        `<div class="blurb">${cSel.blurb}</div>`
      ].join("");
      return;
    }
    const sat = satByName[selectedName];
    if (sat) {
      const distSunAu = Math.hypot(...(worldKm[sat.name] || [0, 0, 0])) / AU_KM;
      $("infoCard").innerHTML = [
        `<div class="iname" style="color:${sat.accent}">${sat.cn}<small>${sat.name}</small></div>`,
        `<div class="irow"><span>所属行星</span><b>${CN[sat.parent]}</b></div>`,
        `<div class="irow"><span>半径</span><b>${sat.radius_km.toLocaleString()} km</b></div>`,
        `<div class="irow"><span>轨道半径</span><b>${sat.a_km.toLocaleString()} km</b></div>`,
        `<div class="irow"><span>公转周期</span><b>${Math.abs(sat.period_d).toFixed(2)} 天${sat.period_d < 0 ? " (逆行)" : ""}</b></div>`,
        `<div class="irow"><span>距太阳</span><b>${distSunAu.toFixed(4)} AU</b></div>`,
        `<div class="blurb">${sat.blurb}</div>`,
        sat.name === "Moon" ? `<button style="margin-top:8px;width:100%" onclick="location.href='moon.html'">驾驶月球车 · 登陆月球</button>` : ""
      ].join("");
      return;
    }
    const b = bodyByName[selectedName];
    const distSunAu = selectedName === "Sun" ? 0 :
      Math.hypot(...(worldKm[selectedName] || [0, 0, 0])) / AU_KM;
    const periodYr = b.semi_major_au ? Math.pow(b.semi_major_au, 1.5) : 0;
    const periodText = !periodYr ? "—" : periodYr < 2 ? `${(periodYr * 365.25).toFixed(1)} 天` : `${periodYr.toFixed(2)} 年`;
    const rotH = Math.abs(b.rotation_period_h || 0);
    const rotText = !rotH ? "—" : rotH > 48 ? `${(rotH / 24).toFixed(1)} 天${b.rotation_period_h < 0 ? " (逆行)" : ""}` : `${rotH.toFixed(1)} 小时${b.rotation_period_h < 0 ? " (逆行)" : ""}`;
    $("infoCard").innerHTML = [
      `<div class="iname" style="color:${ACCENT[b.name]}">${CN[b.name]}<small>${b.name}</small></div>`,
      `<div class="irow"><span>半径</span><b>${b.radius_km.toLocaleString()} km</b></div>`,
      b.semi_major_au ? `<div class="irow"><span>半长轴</span><b>${b.semi_major_au.toFixed(4)} AU</b></div>` : "",
      b.semi_major_au ? `<div class="irow"><span>距太阳</span><b>${distSunAu.toFixed(4)} AU</b></div>` : "",
      b.semi_major_au ? `<div class="irow"><span>轨道速度</span><b>${heliocentricSpeed(b.name).toFixed(2)} km/s</b></div>` : "",
      b.semi_major_au ? `<div class="irow"><span>阳光到达</span><b>${(distSunAu * 8.3167).toFixed(1)} 分钟</b></div>` : "",
      `<div class="irow"><span>公转周期</span><b>${periodText}</b></div>`,
      `<div class="irow"><span>自转周期</span><b>${rotText}</b></div>`,
      `<div class="irow"><span>轴倾角</span><b>${(b.axial_tilt_deg || 0).toFixed(2)}°</b></div>`,
      selectedName === "Jupiter" && jshCount > 0 ? `<div class="irow"><span>此刻影凌</span><b>${jshCount} 枚卫星影子投在盘面</b></div>` : "",
      selectedName === "Earth" ? `<button style="margin-top:8px;width:100%" id="magBtnCard">⛨ 磁层剧场 · 太阳风 vs 地球磁场</button>` : "",
      `<div class="blurb">${BLURB[b.name] || ""}</div>`
    ].join("");
  }
  function refreshScaleButtons() {
    $("scaleReal").classList.toggle("active", scaleBlend < 0.5);
    $("scaleShow").classList.toggle("active", scaleBlend >= 0.5);
  }

  /* ---------------- 自动漫游 ---------------- */
  let tour = null;
  const TOUR_SEQ = ["Sun", "Mercury", "Venus", "Earth", "Moon", "Mars", "Phobos", "Ceres",
    "Jupiter", "Io", "Europa", "Ganymede", "Callisto", "Saturn", "Enceladus", "Titan",
    "Uranus", "Titania", "Neptune", "Triton", "Pluto", "Charon", "Halley", "HaleBopp"];
  function startTour() {
    tour = { idx: 0, timer: 999 };
    $("tourBtn").classList.add("active");
    $("tourBtn").textContent = "■ 停止漫游";
  }
  function stopTour() {
    if (!tour) return;
    tour = null;
    $("tourBtn").classList.remove("active");
    $("tourBtn").textContent = "▶ 自动漫游";
  }
  function tickTour(dt) {
    if (!tour) return;
    tour.timer += dt;
    if (tour.timer >= 8) {
      tour.timer = 0;
      setFocus(TOUR_SEQ[tour.idx % TOUR_SEQ.length], false);
      tour.idx += 1;
    }
  }

  function setupUi() {
    // 天体按钮(分类分组: 恒星·行星 / 矮行星·彗星 / 卫星)
    const addFocusBtn = (gridId, name, cn, accent, small) => {
      const btn = document.createElement("button");
      btn.dataset.name = name;
      if (small) btn.classList.add("sat");
      btn.innerHTML = `<span class="dot" style="color:${accent};background:${accent}"></span>${cn}`;
      btn.addEventListener("click", () => { stopTour(); setFocus(name, false); });
      $(gridId).appendChild(btn);
    };
    for (const body of bodies) {
      addFocusBtn(body.type === "dwarf" ? "gridDwarfs" : "gridPlanets", body.name, CN[body.name], ACCENT[body.name], false);
    }
    for (const c of COMETS) addFocusBtn("gridDwarfs", c.name, c.cn, c.accent, false);
    for (const sat of SATELLITES) addFocusBtn("gridMoons", sat.name, sat.cn, sat.accent, true);
    for (const c of SPACECRAFT) addFocusBtn("gridCraft", c.name, c.cn, c.color, true);
    $("vgBtn").addEventListener("click", startVoyagerReplay);
    $("vgClose").addEventListener("click", () => { vgActive = false; $("vgPanel").classList.remove("show"); });
    $("repNext").addEventListener("click", () => { if (replay && replay.i + 1 < replay.stages.length) replayAdvance(replay.i + 1, true); });
    $("repStop").addEventListener("click", endReplay);
    $("repLocal").addEventListener("click", () => replaySetView("local"));
    $("repGlobal").addEventListener("click", () => replaySetView("global"));
    deepTimeActiveOff = () => { if (deepTime) setDeepTime(false); };
    $("tourBtn").addEventListener("click", () => { tour ? stopTour() : startTour(); });
    window.__setSpeed = (v, play) => {   // 程序化设挡: 剧场/任务链节奏管理
      daysPerSecond = v;
      if (play !== undefined) { playing = play; $("playBtn").textContent = play ? "⏸" : "▶"; }
      for (const b of $("speedGroup").children) b.classList.toggle("active", Number(b.dataset.v) === v);
    };
    // 速度按钮(深时挡位追加 百年/千年每秒)
    function buildSpeedButtons() {
      const list = deepTime
        ? SPEEDS.concat([{ label: "百年/秒", v: 36525 }, { label: "千年/秒", v: 365250 }])
        : SPEEDS;
      const g = $("speedGroup");
      g.innerHTML = "";
      list.forEach((sp, i) => {
        const btn = document.createElement("button");
        btn.textContent = sp.label;
        btn.dataset.v = sp.v;
        if (sp.v === daysPerSecond || (daysPerSecond === undefined && i === 2)) btn.classList.add("active");
        btn.addEventListener("click", () => {
          daysPerSecond = sp.v;
          for (const b of g.children) b.classList.remove("active");
          btn.classList.add("active");
        });
        g.appendChild(btn);
      });
      let hasActive = false;
      for (const b of g.children) if (b.className && String(b.className).includes("active")) hasActive = true;
      if (!hasActive && g.children[2]) g.children[2].classList.add("active");
    }
    buildSpeedButtons();
    // 深时模式: 时间轴换挡 ±5 万年
    function setDeepTime(on) {
      deepTime = on;
      $("deepBtn").classList.toggle("active", on);
      document.getElementById("timelineWrap").classList.toggle("deep", on);
      if (on) animateScaleTo(0);        // 深时基于真实尺度运转
      tlMin = on ? -18262500 : -36525;
      tlMax = on ? 18262500 : 36525;
      const sl = $("timeSlider");
      sl.min = tlMin; sl.max = tlMax; sl.step = on ? 100 : 0.25;
      $("tlLabels").innerHTML = on
        ? "<span>-48000</span><span>-23000</span><span>公元2000</span><span>+27000</span><span>+52000</span>"
        : "<span>1900</span><span>1950</span><span>2000</span><span>2050</span><span>2100</span>";
      if (!on) {
        jd = clamp(jd, J2000 + tlMin, J2000 + tlMax);
        if (daysPerSecond > 365.25) daysPerSecond = 365.25;
      }
      buildSpeedButtons();
      $("deepHint").classList.toggle("show", on);
    }
    setDeepTimeRef = setDeepTime;
    $("deepBtn").addEventListener("click", () => setDeepTime(!deepTime));
    // 星际视角: 恒星按视差展开为真实三维, 相机飞离太阳系
    $("sbxBtn").addEventListener("click", () => setSandboxMode(!sbxMode));
    $("sbxClear").addEventListener("click", clearProbes);
    $("dvSlider").addEventListener("input", () => { $("dvVal").textContent = Number($("dvSlider").value).toFixed(2); });
    $("launchBtn").addEventListener("click", () => launchHohmann(Number($("dvSlider").value)));
    $("windowBtn").addEventListener("click", () => {
      jd = nextHohmannWindow(jd + 2);
      const plan = hohmannPlan(jd);
      $("dvSlider").value = clamp(plan.dv, 2.5, 4.5).toFixed(2);
      $("dvVal").textContent = Number($("dvSlider").value).toFixed(2);
      $("hohmannStatus").innerHTML = `窗口 ${jdToDateText(jd).slice(0, 10)} · 本窗理论 Δv≈<b>${plan.dv.toFixed(2)}</b> km/s, 飞行≈${plan.tof.toFixed(0)} 天(已代入滑杆)—— 发射!`;
    });
    refreshProbeList();
    $("cosmoBtn").addEventListener("click", () => {
      stars3D = !stars3D;
      if (stars3D) { animateScaleTo(0); award("interstellar"); }
      $("cosmoBtn").classList.toggle("active", stars3D);
      $("cosmoHint").classList.toggle("show", stars3D);
    });
    $("playBtn").addEventListener("click", togglePlay);
    $("dirBtn").addEventListener("click", () => {
      timeDirection *= -1;
      $("dirBtn").textContent = timeDirection > 0 ? "▶" : "◀";
    });
    $("resetBtn").addEventListener("click", () => { jd = J2000; });
    $("todayBtn").addEventListener("click", () => { jd = 2440587.5 + Date.now() / 86400000; });
    $("evtBtn").addEventListener("click", () => {
      const modal = $("evtModal");
      if (modal.classList.contains("show")) { modal.classList.remove("show"); return; }
      $("achModal").classList.remove("show");
      $("histModal").classList.remove("show");
      modal.classList.add("show");
      if (!eventsReady) {
        $("evtList").innerHTML = "<div class='hintText'>正在推算 1900—2100 全部天象(日月食矢量几何 + 行星角距扫描)…</div>";
        setTimeout(() => { scanAstroEvents(); renderEvents(); refreshTonight(); }, 30);   // 先绘制回执再计算
      } else {
        renderEvents();
      }
    });
    $("evtClose").addEventListener("click", () => $("evtModal").classList.remove("show"));
    for (const b of $("evtFilters").children) {
      b.addEventListener("click", () => {
        evtFilter = b.dataset.t;
        for (const x of $("evtFilters").children) x.classList.remove("active");
        b.classList.add("active");
        renderEvents();
      });
    }
    // 时间轴
    const slider = $("timeSlider");
    slider.addEventListener("pointerdown", () => { draggingTimeline = true; });
    window.addEventListener("pointerup", () => { draggingTimeline = false; });
    slider.addEventListener("input", () => { jd = J2000 + Number(slider.value); });
    // 尺度
    $("scaleBlend").addEventListener("input", () => {
      scaleBlend = Number($("scaleBlend").value);
      refreshScaleButtons();
      setFocus(selectedName, true);
    });
    $("scaleReal").addEventListener("click", () => animateScaleTo(0));
    $("scaleShow").addEventListener("click", () => animateScaleTo(1));
    // 显示选项
    $("tglBloom").addEventListener("change", () => { bloomPass.enabled = $("tglBloom").checked; });
    let perfMode = false;
    try { perfMode = localStorage.getItem("ss_perf") === "1"; } catch (e) { /* 默认关 */ }
    function applyPerfMode() {
      renderer.setPixelRatio(perfMode ? 1 : Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
      bloomPass.enabled = perfMode ? false : $("tglBloom").checked;
      window.__perfKeep = perfMode ? 0.45 : 1;   // 点云稀释系数(onBeforeRender 读取)
    }
    $("tglPerf").checked = perfMode;
    applyPerfMode();
    $("tglPerf").addEventListener("change", () => {
      perfMode = $("tglPerf").checked;
      try { localStorage.setItem("ss_perf", perfMode ? "1" : "0"); } catch (e) { /* 忽略 */ }
      applyPerfMode();
    });
    $("tglSound").checked = soundOn;
    $("tglSound").addEventListener("change", () => {
      soundOn = $("tglSound").checked;
      try { localStorage.setItem("ss_sound", soundOn ? "1" : "0"); } catch (e) { /* 忽略 */ }
      if (soundOn) { audioPoke(); sfxChime(); }
    });
    for (const b of $("skyModeGroup").children) {
      b.addEventListener("click", () => {
        skyModeN = Number(b.dataset.m);
        for (const x of $("skyModeGroup").children) x.classList.remove("active");
        b.classList.add("active");
      });
    }
    $("siteBtn").addEventListener("click", () => { window.open("launch_site.html", "_blank"); });
    $("histBtn").addEventListener("click", () => {
      $("evtModal").classList.remove("show");
      $("achModal").classList.remove("show");
      renderHistory();
      $("histModal").classList.toggle("show");
    });
    $("histClose").addEventListener("click", () => $("histModal").classList.remove("show"));
    $("achBtn").addEventListener("click", () => {
      $("evtModal").classList.remove("show");
      $("histModal").classList.remove("show");
      renderAch();
      renderMissions();
      $("achModal").classList.toggle("show");
    });
    $("achClose").addEventListener("click", () => $("achModal").classList.remove("show"));
    $("lcStart").addEventListener("click", () => { lightCruise ? endLightCruise() : startLightCruise(); });
    for (const b of $("lcMults").children) {
      b.addEventListener("click", () => {
        for (const x of $("lcMults").children) x.classList.remove("active");
        b.classList.add("active");
        if (lightCruise) lightCruise.mult = Number(b.dataset.m);
      });
    }
    $("radarX").addEventListener("click", () => {
      RADAR.full = !RADAR.full;
      $("radarWrap").classList.toggle("full", RADAR.full);
      $("radarX").textContent = RADAR.full ? "⤡" : "⤢";
    });
    $("radarCv").addEventListener("pointerup", (e) => {
      const hit = radarPick(e.clientX, e.clientY);
      if (hit) { stopTour(); setFocus(hit[0], false); }
    });
    $("radarCv").addEventListener("pointermove", (e) => {
      const hit = radarPick(e.clientX, e.clientY);
      if (hit) showHoverTip(`<b>${CN[hit[0]] || hit[0]}</b><br><span class="dim">距太阳 ${hit[1].toFixed(2)} AU · 点击聚焦</span>`, e.clientX, e.clientY);
      else hideHoverTip();
    });
    $("tglRadar").addEventListener("change", () => { RADAR.on = $("tglRadar").checked; });
    $("infoCard").addEventListener("click", (e) => {   // 动态卡片按钮事件委托
      const id2 = e.target && e.target.id;
      if (id2 === "magBtnCard") magEnter(false);
    });
    $("magExit").addEventListener("click", magExit);
    $("magV").addEventListener("input", () => { MAG.storm = null; magSetWind(Number($("magV").value), MAG.n); });
    $("magN").addEventListener("input", () => { MAG.storm = null; magSetWind(MAG.v, Number($("magN").value)); });
    $("magQuiet").addEventListener("click", () => { MAG.storm = null; magSetWind(400, 5); $("magCap").textContent = "宁静太阳风 —— 拖动滑杆, 看磁层实时变形。"; });
    $("magFast").addEventListener("click", () => { MAG.storm = null; magSetWind(700, 9); $("magCap").textContent = "冕洞高速流 —— 磁层顶被压近, 极光增强。"; });
    $("magCme").addEventListener("click", () => { MAG.storm = 0; MAG.stormT = 0; $("magCap").textContent = MAG_STORM[0][3]; });
    $("galBtn").addEventListener("click", () => setGalFrame(!galFrame));
    for (const b of $("galMults").children) {
      b.addEventListener("click", () => {
        for (const x of $("galMults").children) x.classList.remove("active");
        b.classList.add("active");
        galComp = Number(b.dataset.c);
        galReset();
      });
    }
    $("skyBtn").addEventListener("click", () => {
      window.open(`sky.html#lat=39.90&lon=116.40&jd=${jd.toFixed(4)}`, "_blank");
    });
    refreshTonight();
    if (typeof setInterval !== "undefined") setInterval(refreshTonight, 600000);
    $("shareBtn").addEventListener("click", () => {
      const url = location.href.split("#")[0] + buildShareHash();
      history.replaceState(null, "", buildShareHash());
      const done = () => { $("achToastText").textContent = "链接已复制 —— 时刻/聚焦/模式全部在网址里"; $("achToast").classList.add("show"); clearTimeout(achToastTimer); achToastTimer = setTimeout(() => $("achToast").classList.remove("show"), 3000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, done);
      else done();
    });
    $("photoBtn").addEventListener("click", () => setPhotoMode(true));
    $("photoExit").addEventListener("click", () => setPhotoMode(false));
    $("snapBtn").addEventListener("click", doSnapshot);
    // 面板
    $("panelToggle").addEventListener("click", () => $("panel").classList.toggle("collapsed"));
    // 分区折叠: 点击区标题收起/展开到下一个区标题为止
    for (const gt of document.querySelectorAll("#panel .gtitle")) {
      gt.style.cursor = "pointer";
      gt.setAttribute("title", "点击折叠/展开此区");
      gt.addEventListener("click", () => {
        const fold = !gt.classList.contains("folded");
        gt.classList.toggle("folded", fold);
        let el = gt.nextElementSibling;
        while (el && !el.classList.contains("gtitle")) {
          el.style.display = fold ? "none" : "";
          el = el.nextElementSibling;
        }
      });
    }
    $("helpBtn").addEventListener("click", () => $("helpCard").classList.toggle("show"));
    $("gdNext").addEventListener("click", () => { gdStep + 1 >= GUIDE_STEPS.length ? endGuide() : guideShow(gdStep + 1); });
    $("gdSkip").addEventListener("click", endGuide);
    $("gdOpen").addEventListener("click", startGuide);
    const sBox = $("searchBox"), sList = $("searchList");
    let sResults = [];
    function renderSearch() {
      if (!sResults.length) { sList.classList.remove("show"); return; }
      sList.innerHTML = sResults.map((r, i) =>
        `<div class="srow${i === 0 ? " sel" : ""}" data-i="${i}"><span class="stype">${r.t}</span>${r.n}<span class="ssub">${r.sub}</span></div>`).join("");
      sList.classList.add("show");
      for (const el of sList.children) {
        el.addEventListener("pointerdown", (ev) => {
          ev.preventDefault();
          const r = sResults[Number(el.dataset.i)];
          if (r) { r.act(); sBox.value = ""; sResults = []; renderSearch(); sBox.blur(); }
        });
      }
    }
    sBox.addEventListener("input", () => { sResults = runSearch(sBox.value); renderSearch(); });
    sBox.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && sResults.length) {
        sResults[0].act();
        sBox.value = ""; sResults = []; renderSearch(); sBox.blur();
      } else if (e.key === "Escape") { sBox.value = ""; sResults = []; renderSearch(); sBox.blur(); }
      e.stopPropagation();
    });
    sBox.addEventListener("blur", () => setTimeout(() => { sList.classList.remove("show"); }, 160));
    window.addEventListener("resize", () => { if (gdActive) guideShow(gdStep); });
    setTimeout(() => {
      try {
        if (!localStorage.getItem("ss_guide_done")) {
          if (INTRO.state !== "off") INTRO.guideAfter = true;
          else startGuide();
        }
      } catch (e) { /* 无 localStorage 则不自动弹 */ }
    }, 1400);
    $("gateEnter").addEventListener("click", introEnterClicked);
    $("evtIcs").addEventListener("click", exportIcs);
    $("histPlayAll").addEventListener("click", cineStart);
    $("lnchBtn").addEventListener("click", () => lnchEnter());
    $("lnchBtnT").addEventListener("click", () => lnchEnter({ rocket: "titan3e" }));
    $("lnchBtnS").addEventListener("click", () => lnchEnter({ rocket: "saturn5", apollo: true }));
    $("lnchBtnF").addEventListener("click", () => lnchEnter({ rocket: "falcon9" }));
    $("lnchBtnN").addEventListener("click", () => lnchEnter({ rocket: "n1" }));
    $("lnchBtnX").addEventListener("click", () => lnchEnter({ rocket: "exp1" }));
    $("lnchBtnSS").addEventListener("click", () => lnchEnter({ rocket: "starship" }));
    $("hohmannStatus").addEventListener("click", (e) => {
      if (e.target && e.target.id === "apolloMoonBtn") window.open("moon.html", "_blank");
      if (e.target && e.target.id === "apSpdBtn" && window.__setSpeed) {
        window.__setSpeed(1 / 24, true);
        e.target.textContent = "已加速: 时/秒";
      }
    });
    $("lnchSpd").addEventListener("click", (e) => {
      e.stopPropagation();
      const seq2 = [["real", 1, "实时 1:1"], ["real", 2, "剧场 2×"], ["real", 4, "剧场 4×"], ["real", 8, "剧场 8×"], ["fast", 1, "导演节奏 ⏩"]];
      LNCH._spdIdx = ((LNCH._spdIdx || 0) + 1) % seq2.length;
      const c2 = seq2[LNCH._spdIdx];
      LNCH.spdMode = c2[0]; LNCH.spdMul = c2[1];
      $("lnchSpd").textContent = c2[2];
    });
    $("lnchSkipBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      if (LNCH.state === "fly" || LNCH.state === "pre") LNCH.skipReq = true;
    });
    $("lnchCamBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      const seq = ["auto", "onboard", "top"];
      const nm2 = { auto: "机位: 导播", onboard: "机位: 箭载", top: "机位: 上空" };
      LNCH.camMode = seq[(seq.indexOf(LNCH.camMode || "auto") + 1) % 3];
      $("lnchCamBtn").textContent = nm2[LNCH.camMode];
    });
    $("encGo").addEventListener("click", () => {
      if (!encCur) return;
      const e = encCur;
      encSeen[e.jd] = 1;
      $("encHint").classList.remove("show");
      jd = e.jd;
      lnchEnter({ hist: true, rocket: e.rocket, historical: e.historical, chain: e.chain, apollo: e.apollo });
    });
    $("encClose").addEventListener("click", () => {
      if (encCur) encSeen[encCur.jd] = 1;
      $("encHint").classList.remove("show");
      encCur = null;
    });
    if (typeof window.addEventListener === "function") window.addEventListener("keydown", (e) => {
      if (!CINEMA.on) return;
      if (e.code === "Space") { e.preventDefault(); cineNext(); }
      else if (e.code === "Escape") cineStop(false);
    });
    // 键盘
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      audioPoke();
      keys.add(e.code);
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      if (e.key === "/") { e.preventDefault(); $("panel").classList.remove("collapsed"); $("searchBox").focus(); }
      if (e.code === "KeyP") setPhotoMode(!photoMode);
      if (e.code === "Escape" && photoMode) setPhotoMode(false);
      if (e.code === "Escape" && RADAR.full) {
        RADAR.full = false;
        $("radarWrap").classList.remove("full");
        $("radarX").textContent = "⤢";
      }
      const num = Number(e.key);
      if (num >= 1 && num <= bodies.length) { stopTour(); setFocus(bodies[num - 1].name, false); }
    });
    window.addEventListener("keyup", (e) => keys.delete(e.code));
    window.addEventListener("resize", () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    });
    refreshScaleButtons();
    refreshInfo();
    refreshChips();
  }
  function togglePlay() {
    playing = !playing;
    $("playBtn").textContent = playing ? "⏸" : "▶";
  }
  let scaleAnim = null;
  function animateScaleTo(target) {
    scaleAnim = { from: scaleBlend, to: target, t: 0, dur: 1.2 };
  }
  function tickScaleAnim(dt) {
    if (!scaleAnim) return;
    scaleAnim.t += dt;
    const k = clamp(scaleAnim.t / scaleAnim.dur, 0, 1);
    const e = k * k * (3 - 2 * k);
    scaleBlend = lerp(scaleAnim.from, scaleAnim.to, e);
    $("scaleBlend").value = scaleBlend.toFixed(3);
    setFocus(selectedName, true);
    refreshScaleButtons();
    if (k >= 1) scaleAnim = null;
  }

  /* ---------------- 主循环 ---------------- */
  let fpsFrames = 0;
  let fpsClock = performance.now();
  let hudClock = 0;
  function animate(now) {
    if (typeof document !== "undefined" && document.hidden) {   // 页面失焦: 跳过全部计算与渲染
      requestAnimationFrame(animate);
      return;
    }
    requestAnimationFrame(animate);
    const dt = Math.min((now - (animate.last || now)) / 1000, 0.05);
    animate.last = now;

    if (playing && !draggingTimeline) {
      jd += daysPerSecond * timeDirection * dt;
      jd = clamp(jd, J2000 + tlMin, J2000 + tlMax);   // 钳制跟随挡位(深时 ±5 万年)
    }
    tickScaleAnim(dt);
    tickTour(dt);
    updateSystem();
    // 深时/星际: 星点与衍射星同步; 星际混合缓动 + 天空背景外扩 + 相机缓推
    {
      const target3d = stars3D ? 1 : 0;
      if (!INTRO.driving) star3DBlend += (target3d - star3DBlend) * Math.min(1, dt * 2.2);
      if (Math.abs(star3DBlend - target3d) < 0.002) star3DBlend = target3d;
      const tDim = SKY_DIM[skyModeN], tBg = SKY_BG[skyModeN], tSpk = SKY_SPK[skyModeN];
      deepSkyBlend += ((skyModeN ? 1 : 0) - deepSkyBlend) * Math.min(1, dt * 2.5);
      updateCatalogStars(yearsFromJ2000(), star3DBlend);
      if (catalogStarMat) {
        const u = catalogStarMat.uniforms.uDim;
        u.value += (tDim - u.value) * Math.min(1, dt * 2.5);
      }
      for (const k of catalogSpikes) {
        k.spr.material.opacity += (0.8 * tSpk - k.spr.material.opacity) * Math.min(1, dt * 2.5);
      }
      if (skyMesh) {
        const c0 = skyMesh.material.color.r;
        skyMesh.material.color.setScalar(c0 + (tBg - c0) * Math.min(1, dt * 2.5));
        skyMesh.scale.setScalar(1 + 7 * star3DBlend);
      }
      updateNamedStars(dt, tDim);
      updateSunTrack(dt);
      updateStarBody(dt);
      updateConstellations(yearsFromJ2000(), star3DBlend, tDim);
      if (window.__DEEPSKY) window.__DEEPSKY.tick(dt);
      if (lyRingGroup) {
        lyRingGroup.visible = star3DBlend > 0.25;
        for (const m of lyRingGroup.children) m.material.opacity = (m.userData.op || 0.35) * star3DBlend;
      }
      controls.maxDistance = lerp(2.5e7, 1.55e8, star3DBlend);
      if (stars3D && star3DBlend < 0.98) {
        const len = camera.position.distanceTo(controls.target);
        if (len < 5.6e7) {
          let k = 1 + Math.min(1, dt * 1.4) * (6e7 / Math.max(len, 1) - 1);
          k = clamp(k, 0.92, 1.22);   // 步进比封顶: 平滑指数逼近, 不瞬移不猛跳
          camera.position.sub(controls.target).multiplyScalar(k).add(controls.target);
        }
      }
    }
    tickIntro(dt);
    updateSiteBeacons();
    tickLaunch(dt);
    tickApollo();
    tickCinema(dt);
    updateMeteorBurst();
    tickReplay();
    updateMagnetosphere(dt);
    tickLightCruise(dt);
    tickStarFly(dt);
    if (vgActive) drawVoyagerChart();
    tickFlight(dt);
    tickTween(dt);
    if (LNCH.state === "off" || LNCH.state === "load") controls.update();   // 剧场接管相机时 OrbitControls 让位(阶段38: 机位被 update 覆盖 → 高空白盘)
    if (!(transMoving && _lineParity === 1)) {
      updateRadar(dt);
      flushLabels2D();
    }
    bloomPass.strength = (LNCH.state !== "off" && LNCH.state !== "load") ? 0.1 : 0.55;   // 剧场压 bloom: 羽流白棚(阶段38)
    composer.render();
    if (snapRequest) saveSnapshot();

    // HUD
    $("dateText").textContent = jdToDateText(jd);
    $("jdText").textContent = `JD ${jd.toFixed(2)} TT`;
    if (!draggingTimeline) $("timeSlider").value = clamp(jd - J2000, tlMin, tlMax);
    fpsFrames += 1;
    hudClock += dt;
    if (now - fpsClock >= 1000) {
      $("fpsText").textContent = fpsFrames;
      if (star3DBlend > 0.35) {
        const sp0 = scenePos.Sun || [0, 0, 0];
        const rr2 = Math.hypot(camera.position.x - sp0[0], camera.position.y - sp0[1], camera.position.z - sp0[2]);
        let txt;
        if (rr2 < 4.2e7) {
          txt = `${(rr2 * SCALE.sceneUnitKm / AU_KM).toFixed(0)} AU`;
        } else {
          const dPc = 1.3 * Math.exp((rr2 - 4.5e7) * 7.339 / 5.5e7);
          txt = dPc > 2100 ? "≳6,500 光年 · 星场边缘" : `${(dPc * 3.26156).toFixed(2)} 光年`;
        }
        $("lyText").textContent = txt;
        $("lyWrap").style.display = "";
      } else {
        $("lyWrap").style.display = "none";
      }
      if (deepTime && Math.abs(yearsFromJ2000()) > 10000) award("deeptime");
      {  // 行星大气渐变: 凑近金星/火星/土卫六时的雾感色调
        const ATMO = { Venus: "232,220,178", Mars: "205,124,82", Titan: "214,152,64" };
        let ak = 0, acol = null;
        for (const nm in ATMO) {
          const p = scenePos[nm];
          if (!p) continue;
          const d = Math.hypot(camera.position.x - p[0], camera.position.y - p[1], camera.position.z - p[2]);
          const rr3 = (sceneRadius[nm] || 1) * 10;
          const k3 = clamp(1 - d / rr3, 0, 0.42);
          if (k3 > ak) { ak = k3; acol = ATMO[nm]; }
        }
        const at = $("atmoTint");
        if (acol && ak > 0.01) {
          at.style.background = `radial-gradient(ellipse at 50% 50%, transparent 52%, rgba(${acol},0.85) 130%)`;
          at.style.opacity = ak;
        } else {
          at.style.opacity = 0;
        }
      }
      $("phaseNow").textContent = `${phaseAngleDeg(jd) >= 0 ? "+" : ""}${phaseAngleDeg(jd).toFixed(1)}°`;
      if (probes.length) refreshProbeList();
      $("callsText").textContent = renderer.info.render.calls;
      fpsFrames = 0;
      fpsClock = now;
    }
    if (hudClock > 0.5) { hudClock = 0; refreshInfo(); checkEncounter(); }
  }

  /* ---------------- 启动 ---------------- */
  async function init() {
    const srgbSet = new Set(["sun", "mercury", "venus", "earth_day", "earth_night", "mars",
      "jupiter", "saturn", "saturn_ring", "uranus", "neptune", "sky",
      "moon", "io", "europa", "ganymede", "callisto", "titan"]);
    await Promise.all(texNames.map((n) => loadTex(n, srgbSet.has(n))));
    buildProceduralTextures();
    buildBodies();
    setupUi();
    updateSystem();
    setFocus("Earth", true);
    // 初始给一个纵览视角再聚焦地球
    camera.position.set(scenePos.Earth[0], scenePos.Earth[1] - 26, scenePos.Earth[2] + 13);
    controls.target.set(...scenePos.Earth);
    setFocus("Earth", false);
    if (reducedMotion) {
      playing = false;
      $("playBtn").textContent = "▶";
      if (bloomPass) bloomPass.strength *= 0.45;
    }
    if (window.innerWidth < 821) $("panel").classList.add("collapsed");   // 小屏默认收起面板
    applyShareHash();
    restoreProbes();
    if (!introBypass()) introStart();
    if (typeof location !== "undefined" && !eventsReady) scanPump();   // 门内/进场即后台推算天象
    if (typeof location !== "undefined" && !window.AST_REAL) {   // 分层加载: 程序化带先亮场, 19139 颗真实带后台到货热替换
      setTimeout(() => {
        try {
          const sc2 = document.createElement("script");
          sc2.src = "asteroids_real.js";
          sc2.onload = () => { try { buildRealBelt(); } catch (e2) { /* 忽略 */ } };
          document.body.appendChild(sc2);
        } catch (e2) { /* 桩 */ }
      }, 1500);
    }
    if (window.addEventListener) window.addEventListener("beforeunload", saveProbes);
    try { renderer.compile(scene, camera); } catch (e) { /* 预编译尽力而为 */ }
    requestAnimationFrame(animate);
    setTimeout(() => document.getElementById("loader").classList.add("done"), 400);
  }
  init();
}());
/* v2.4 物理引擎: 月球 Meeus 历表 + 地月/冥卫质心 + 卫星椭圆轨道 + IAU 极轴 + ERA 自转相位 + 哈雷分段根数 + 轨道渐变尾迹 + 轨道速度 */
