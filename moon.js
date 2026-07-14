/* ============================================================
 * 月球车 · Lunar Rover v2.0 — 真·车辆动力学
 * - 物理/渲染同源: 两者共用同一张高程网格(双线性采样), 从根源消灭穿模
 * - 刚体模拟: 质心/速度/角速度/四元数姿态, 120Hz 子步半隐式积分
 * - 每轮独立弹簧-阻尼悬架(射线式), 摩擦圆(纵向驱动+侧向抓地, 上限 μ·N)
 * - 底盘角点防穿透约束 + 巨石碰撞 + 翻车自动扶正
 * - 地形: 月球真实凹凸图采样宏观高程 + 程序化陨石坑/噪声/石块
 * - 玩法: 四大着陆区 × 各 5 个真实地标打卡; 2D 雷达小地图
 * ============================================================ */
(function () {
  "use strict";
  const { THREE } = window.VENDOR;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------------- 配置 ---------------- */
  const SIZE = 2400;              // 可驾驶区域边长(米)
  const HALF = SIZE / 2;
  const SEG = 512;                // 高程网格分辨率(物理与渲染共用)
  const GRAV = 1.62;              // 月面重力 m/s²

  const REGIONS = [
    { id: "tranq", name: "静海 · 阿波罗11", latLon: [0.67, 23.47], mare: 0.85, seed: 11,
      desc: "人类第一个足迹所在的玄武岩平原, 地势平缓, 适合新手驾驶",
      marks: [["鹰号下降级", "阿波罗11号着陆器残留在月面的部分"],
        ["小西坑", "阿姆斯特朗徒步考察过的最远的坑"],
        ["静海基地纪念牌", "『我们为全人类和平而来』"],
        ["双子坑", "着陆前跨过的最后一对撞击坑"],
        ["休斯敦石", "训练时代号相同的一块标志岩"]] },
    { id: "imbrium", name: "雨海 · 玉兔落月", latLon: [44.12, -19.51], mare: 0.8, seed: 33,
      desc: "嫦娥三号与玉兔号的家, 熔岩平原上散布着年轻的溅射坑",
      marks: [["嫦娥三号着陆器", "2013 年 12 月 14 日软着陆于此"],
        ["玉兔号休眠点", "玉兔最后发回信号的位置"],
        ["龙岩", "玉兔考察过的玄武岩巨石"],
        ["紫微撞击坑", "着陆点旁以星官命名的坑"],
        ["广寒宫", "着陆区的正式地名, 2015 年 IAU 批准"]] },
    { id: "copernicus", name: "哥白尼环形山", latLon: [9.62, -20.08], mare: 0.35, seed: 55,
      desc: "93 公里宽的年轻大坑, 中央峰与阶地地形起伏剧烈, 驾驶挑战高",
      marks: [["中央峰群", "从坑底隆起 1200 米的深部月幔样本"],
        ["东壁阶地", "坑壁塌陷形成的巨型台阶"],
        ["溅射纹起点", "向四周辐射数百公里的亮线"],
        ["次生坑链", "溅射物砸出的一串小坑"],
        ["坑底熔融池", "撞击热熔化的平坦区域"]] },
    { id: "tycho", name: "第谷环形山", latLon: [-43.31, -11.36], mare: 0.2, seed: 77,
      desc: "满月夜最亮的射纹中心, 1.08 亿年前的撞击遗迹, 地形最年轻锋利",
      marks: [["中央峰之巅", "海拔 2 公里, 顶上蹲着一块著名巨石"],
        ["第谷之眼", "中央峰顶那块 120 米宽的神秘巨石"],
        ["熔岩池底", "玻璃质撞击熔岩铺成的坑底"],
        ["环壁大阶地", "教科书级的坑壁滑塌构造"],
        ["射纹观景台", "回望亮纹延伸向地平线"]] }
  ];
  /* 车辆物理参数: mass(kg) / accel(m/s²) / maxSpeed(m/s) / invI(转动惯量倒数) */
  const ROVERS = [
    { id: "yutu", name: "玉兔号", desc: "六轮摇臂 · 双太阳翼",
      mass: 260, accel: 3.2, maxSpeed: 6.5, brake: 4.5, invI: 1 / 145 },
    { id: "lrv", name: "阿波罗 LRV", desc: "四轮载人 · 伞状天线",
      mass: 420, accel: 4.2, maxSpeed: 9.5, brake: 5.0, invI: 1 / 235 }
  ];
  const MU_LONG = 2.2;            // 纵向摩擦系数(齿钉轮, 略高于真实以保手感)
  const MU_LAT = 1.1;             // 侧向摩擦系数(低重力下自然偏漂移)

  /* ---------------- 确定性随机与噪声 ---------------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hash2(ix, iy, seed) {
    let h = (ix * 374761393 + iy * 668265263 + seed * 144665) | 0;
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177);
    return (((h ^ (h >>> 16)) >>> 0) / 4294967296);
  }
  function vnoise(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
    const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
    return lerp(lerp(a, b, sx), lerp(c, d, sx), sy) * 2 - 1;
  }
  function fbm(x, y, seed) {
    return vnoise(x, y, seed) * 0.6 + vnoise(x * 2.7, y * 2.7, seed + 7) * 0.28 + vnoise(x * 7.1, y * 7.1, seed + 19) * 0.12;
  }

  /* ---------------- 全局状态 ---------------- */
  let region = REGIONS[0];
  let roverCfg = ROVERS[0];
  let macroData = null, macroW = 0, macroH = 0;
  let craters = [];
  let bigRocks = [];
  let marks = [];
  let started = false;

  /* ---------------- 高程: 解析生成 → 统一网格 ---------------- */
  const MACRO_AMP = 90;
  function macroAt(u, v) {
    if (!macroData) return 0;
    const x = clamp(u, 0, 1) * (macroW - 1), y = clamp(v, 0, 1) * (macroH - 1);
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const i2 = Math.min(ix + 1, macroW - 1), j2 = Math.min(iy + 1, macroH - 1);
    const a = macroData[iy * macroW + ix], b = macroData[iy * macroW + i2];
    const c = macroData[j2 * macroW + ix], d = macroData[j2 * macroW + i2];
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
  }
  function craterAt(x, z) {
    let h = 0;
    for (let i = 0; i < craters.length; i += 1) {
      const c = craters[i];
      const dx = x - c.x, dz = z - c.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > c.r14sq) continue;
      const d = Math.sqrt(d2) / c.r;
      if (d < 1) h += -c.depth * (1 - d * d);
      const rim = (d - 1) / 0.22;
      h += c.depth * 0.32 * Math.exp(-rim * rim);
    }
    return h;
  }
  function heightRaw(x, z) {
    const u = (x + HALF) / SIZE, v = (z + HALF) / SIZE;
    const macro = (macroAt(u, v) - 0.5) * 2 * MACRO_AMP;
    const mid = fbm(x * 0.004, z * 0.004, region.seed) * 9 * (1.4 - region.mare);
    const fine = fbm(x * 0.028, z * 0.028, region.seed + 101) * 0.6;   // 波长 ≥ 网格 4 格, 可被网格表达
    return macro + craterAt(x, z) + mid + fine;
  }
  /* 统一高程网格: 物理与渲染唯一真相源 */
  let HF = null;
  const CELL = SIZE / SEG;
  function buildHeightfield() {
    HF = new Float32Array((SEG + 1) * (SEG + 1));
    for (let j = 0; j <= SEG; j += 1) {
      const z = -HALF + j * CELL;
      for (let i = 0; i <= SEG; i += 1) {
        HF[j * (SEG + 1) + i] = heightRaw(-HALF + i * CELL, z);
      }
    }
  }
  function getHeight(x, z) {
    const gx = clamp((x + HALF) / CELL, 0, SEG - 1e-6);
    const gz = clamp((z + HALF) / CELL, 0, SEG - 1e-6);
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const W1 = SEG + 1;
    const a = HF[j * W1 + i], b = HF[j * W1 + i + 1];
    const c = HF[(j + 1) * W1 + i], d = HF[(j + 1) * W1 + i + 1];
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
  }
  const _nrm = new THREE.Vector3();
  function terrainNormal(x, z, out) {
    const e = CELL;
    const dhx = getHeight(x + e, z) - getHeight(x - e, z);
    const dhz = getHeight(x, z + e) - getHeight(x, z - e);
    out.set(-dhx / (2 * e), 1, -dhz / (2 * e)).normalize();
    return out;
  }
  function slopeDegAt(x, z) {
    terrainNormal(x, z, _nrm);
    return Math.acos(clamp(_nrm.y, -1, 1)) * 180 / Math.PI;
  }

  /* ---------------- 渲染器与场景 ---------------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 12000);

  const sun = new THREE.DirectionalLight(0xfff8ef, 2.7);
  sun.position.set(-1400, 700, 900);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x2a323e, 0.5));
  const SUN_DIR = sun.position.clone().normalize();   // 地形着色器与贴图烘焙共用的太阳方向

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* ---------------- 星空与地球 ---------------- */
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
    const nStars = Math.round(2400 * K);
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
    attribute float aSize;
    attribute vec3 aColor;
    varying vec3 vC;
    void main() {
      vC = aColor;
      gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      gl_PointSize = aSize;
    }`;
  const STAR_FRAG = `
    varying vec3 vC;
    void main() {
      vec2 c = gl_PointCoord - 0.5;
      float r2 = dot(c, c);
      if (r2 > 0.25) discard;
      float a = smoothstep(0.25, 0.02, r2);
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
  function buildCatalogStars() {
    const D = window.STAR_CATALOG;
    if (!D) return;
    const S = (window.STAR_CATALOG_V || 1) >= 2 ? 7 : 4;   // v2 星表每星 7 值(含自行/视差)
    const n = Math.floor(D.length / S);
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const siz = new Float32Array(n);
    const R = 7200;
        const c = new THREE.Color();
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    const brightest = [];
    for (let i = 0; i < n; i += 1) {
      const ra = D[i * S] * D2R, dec = D[i * S + 1] * D2R, mag = D[i * S + 2], bv = D[i * S + 3];
      const xq = Math.cos(dec) * Math.cos(ra), yq = Math.cos(dec) * Math.sin(ra), zq = Math.sin(dec);
      pos[i * 3] = xq * R;
      pos[i * 3 + 1] = zq * R;    // 赤道系直挂 y-up 场景(月面装饰性天空)
      pos[i * 3 + 2] = yq * R;
      bvColor(bv, c);
      const bright = clamp(1.35 - mag * 0.17, 0.3, 1.5);
      col[i * 3] = c.r * bright; col[i * 3 + 1] = c.g * bright; col[i * 3 + 2] = c.b * bright;
      siz[i] = clamp(6.4 - mag * 0.95, 1.1, 9.5) * pr;
      if (mag < 1.3) brightest.push([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], mag]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));
    const pts = new THREE.Points(geo, new THREE.ShaderMaterial({
      vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
      transparent: true, depthWrite: false, depthTest: false
    }));
    pts.renderOrder = -9;
    pts.frustumCulled = false;
    scene.add(pts);
    // 最亮十余颗(天狼/老人/织女…): 哈勃式衍射十字
    const spikeTex = makeSpikeTexture();
    for (const b of brightest) {
      const sc = clamp(0.05 * (1.5 - b[3] * 0.35), 0.028, 0.1);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: spikeTex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, depthTest: false, sizeAttenuation: false, opacity: 0.8
      }));
      sp.scale.set(sc, sc, 1);
      sp.position.set(b[0], b[1], b[2]);
      sp.renderOrder = -8;
      scene.add(sp);
    }
  }

  async function buildSky() {
    // 真实星空: 复用主站内嵌的 NASA SVS 全天星图(含银河), 与太阳系主页同源
    const img = await loadImage(window.TEXTURE_DATA.sky);
    const tex = enhanceSky(img);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(8000, 48, 24),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false }));
    sky.material.color.setScalar(0.62);   // 无大气星空透亮, 但不喧宾夺主
    sky.rotation.y = 1.3;                 // 转到银河横跨天际的方位
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    scene.add(sky);
    buildCatalogStars();
  }
  let earthMesh = null;
  function makeGlowTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(64, 64, 20, 64, 64, 64);
    g.addColorStop(0, "rgba(140,180,255,0.5)");
    g.addColorStop(1, "rgba(140,180,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  function buildEarth(img) {
    const tex = new THREE.CanvasTexture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    earthMesh = new THREE.Mesh(new THREE.SphereGeometry(240, 56, 36),
      new THREE.MeshBasicMaterial({ map: tex }));
    earthMesh.material.color.setScalar(1.0);
    earthMesh.position.set(2500, 2600, -3200);
    earthMesh.rotation.z = 0.41;   // 地轴倾斜观感
    scene.add(earthMesh);
    // 大气辉圈: 内圈亮蓝紧贴, 外圈柔光
    const rim = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85
    }));
    rim.scale.set(560, 560, 1);
    rim.position.copy(earthMesh.position);
    scene.add(rim);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeGlowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.4
    }));
    glow.scale.set(980, 980, 1);
    glow.position.copy(earthMesh.position);
    scene.add(glow);
  }

  /* ---------------- 月壤着色(参数经离线渲染 3 轮迭代定稿) ----------------
   * 依据查阅: 月壤为炭灰色(albedo~0.07-0.12), 高日角微棕; 无大气 → 阴影近黑仅地照;
   * 对置效应 = 宽瓣(阴影隐藏 α<20°) + 窄瓣(相干背散射 α<2°, 圣光)。 */
  function makeNoiseTexture() {
    const S = 256, C = 64;
    const g1 = new Float32Array(C * C), g2 = new Float32Array(C * C);
    const rand = mulberry32(90210);
    for (let i = 0; i < C * C; i += 1) { g1[i] = rand(); g2[i] = rand(); }
    const cvs = document.createElement("canvas");
    cvs.width = cvs.height = S;
    const ctx = cvs.getContext("2d");
    const img = ctx.createImageData(S, S);
    for (let j = 0; j < S; j += 1) {
      for (let i = 0; i < S; i += 1) {
        const gx = i / S * C, gy = j / S * C;
        const ix = Math.floor(gx), iy = Math.floor(gy);
        const fx = gx - ix, fy = gy - iy;
        const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
        const i1 = (ix + 1) % C, j1 = (iy + 1) % C;   // 周期化 → 无缝平铺
        const v1 = lerp(lerp(g1[iy * C + ix], g1[iy * C + i1], sx), lerp(g1[j1 * C + ix], g1[j1 * C + i1], sx), sy);
        const v2 = lerp(lerp(g2[iy * C + ix], g2[iy * C + i1], sx), lerp(g2[j1 * C + ix], g2[j1 * C + i1], sx), sy);
        const k = (j * S + i) * 4;
        img.data[k] = Math.round(v1 * 255);
        img.data[k + 1] = Math.round(v2 * 255);
        img.data[k + 2] = Math.round(rand() * 255);   // 白噪声: 亮碎屑/暗石粒
        img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cvs);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
  const REGO_VERT = `
    varying vec3 vW; varying vec3 vN; varying vec2 vUv;
    void main() {
      vUv = uv;
      vN = normalize(mat3(modelMatrix) * normal);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vW = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  const REGO_FRAG = `
    uniform sampler2D uMap; uniform sampler2D uNoise; uniform vec3 uSunDir;
    varying vec3 vW; varying vec3 vN; varying vec2 vUv;
    void main() {
      // 区域贴图只取亮度(去饱和 → 告别泥地棕), 保留月海/高地明暗分布
      float lum = dot(texture2D(uMap, vUv).rgb, vec3(0.299, 0.587, 0.114));
      // 双尺度颗粒 + 宏观斑块
      float d1 = texture2D(uNoise, vW.xz * 0.094).r * 2.0 - 1.0;
      float d1b = texture2D(uNoise, vW.xz * 0.33).g * 2.0 - 1.0;
      float grain = d1 * 0.55 + d1b * 0.45;
      float d2n = texture2D(uNoise, vW.xz * 0.00071).g * 2.0 - 1.0;
      float alb = 0.34 * (0.40 + 1.25 * lum) * (1.0 + 0.14 * d2n) * (1.0 + 0.28 * grain);
      // 亮碎屑(玻璃珠/新鲜溅射)与暗石粒
      float sp = texture2D(uNoise, vW.xz * 1.7).b;
      if (sp > 0.985) alb *= 1.75;
      else if (sp < 0.012) alb *= 0.5;
      // 粉末颗粒法线扰动
      vec2 pe = vec2(0.05, 0.0);
      float g0 = texture2D(uNoise, vW.xz * 0.094).r + texture2D(uNoise, vW.xz * 0.33).g * 0.5;
      float gxx = texture2D(uNoise, (vW.xz + pe.xy) * 0.094).r + texture2D(uNoise, (vW.xz + pe.xy) * 0.33).g * 0.5 - g0;
      float gzz = texture2D(uNoise, (vW.xz + pe.yx) * 0.094).r + texture2D(uNoise, (vW.xz + pe.yx) * 0.33).g * 0.5 - g0;
      vec3 n = normalize(normalize(vN) + vec3(-gxx, 0.0, -gzz) * 1.1);
      float diff = max(dot(n, uSunDir), 0.0);
      // 对置效应: 宽瓣 + 窄瓣(圣光)
      vec3 V = normalize(cameraPosition - vW);
      float cosA = max(dot(V, uSunDir), 0.0);
      float surge = 0.44 * pow(cosA, 8.0) + 0.75 * pow(cosA, 160.0);
      // 阳光(极轻微暖) + 地照(微蓝, 阴影不死黑)
      vec3 col = vec3(alb * 1.03, alb, alb * 0.952) * (diff * (1.0 + surge))
               + vec3(0.011, 0.013, 0.019) * (alb * 3.0);
      col *= 2.45;
      col = col / (1.0 + col);   // Reinhard
      gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
    }`;

  /* ---------------- 地形与石块 ---------------- */
  let terrainMesh = null;
  function loadImage(dataUrl) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => res(img);
      img.src = dataUrl;
    });
  }
  async function buildTerrain() {
    const rand = mulberry32(region.seed);
    const bumpImg = await loadImage(window.TEXTURE_DATA.moon_bump || window.TEXTURE_DATA.moon);
    const win = 0.02;
    const u0 = 0.5 + region.latLon[1] / 360 - win, v0 = 0.5 - region.latLon[0] / 180 - win;
    const S = 128;
    const c1 = document.createElement("canvas");
    c1.width = c1.height = S;
    const x1 = c1.getContext("2d");
    x1.drawImage(bumpImg, u0 * bumpImg.width, v0 * bumpImg.height, win * 2 * bumpImg.width, win * 2 * bumpImg.height, 0, 0, S, S);
    const d1 = x1.getImageData(0, 0, S, S).data;
    macroW = macroH = S;
    macroData = new Float32Array(S * S);
    for (let i = 0; i < S * S; i += 1) macroData[i] = d1[i * 4] / 255;
    craters = [];
    const nC = region.mare > 0.5 ? 40 : 60;
    for (let i = 0; i < nC; i += 1) {
      const r = 14 + Math.pow(rand(), 2.2) * (region.mare > 0.5 ? 110 : 180);
      const x = (rand() * 2 - 1) * (HALF - 80), z = (rand() * 2 - 1) * (HALF - 80);
      if (Math.hypot(x, z) < 90) continue;
      craters.push({ x, z, r, depth: r * (0.14 + rand() * 0.1), r14sq: (r * 1.4) * (r * 1.4) });
    }
    buildHeightfield();   // ★ 统一高程网格: 之后物理/渲染/小地图全部只认它
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      p.setY(i, getHeight(p.getX(i), p.getZ(i)));
    }
    geo.computeVertexNormals();
    const moonImg = await loadImage(window.TEXTURE_DATA.moon);
    const c2 = document.createElement("canvas");
    c2.width = c2.height = 1024;
    const x2 = c2.getContext("2d");
    x2.drawImage(moonImg, u0 * moonImg.width, v0 * moonImg.height, win * 2 * moonImg.width, win * 2 * moonImg.height, 0, 0, 1024, 1024);
    for (let i = 0; i < 9000; i += 1) {
      const g = Math.round((0.25 + rand() * 0.75) * 118);
      x2.fillStyle = `rgba(${g},${g},${g},${(0.05 + rand() * 0.09).toFixed(3)})`;
      const rr = 1 + rand() * 6;
      x2.beginPath();
      x2.arc(rand() * 1024, rand() * 1024, rr, 0, Math.PI * 2);
      x2.fill();
    }
    // 烘焙小陨石坑(几何网格容不下的 3~50 米级): 阴影在向阳侧, 亮缘在背阳侧, 与场景太阳方位一致
    const lxz = Math.hypot(SUN_DIR.x, SUN_DIR.z);
    const lx = SUN_DIR.x / lxz, lz = SUN_DIR.z / lxz;
    for (let i = 0; i < 1300; i += 1) {
      const cx = rand() * 1024, cy = rand() * 1024;
      const r = 1.5 + Math.pow(rand(), 2.5) * 11;
      const gS = x2.createRadialGradient(cx + lx * r * 0.35, cy + lz * r * 0.35, 0, cx + lx * r * 0.35, cy + lz * r * 0.35, r * 0.8);
      gS.addColorStop(0, "rgba(0,0,0,0.30)");
      gS.addColorStop(1, "rgba(0,0,0,0)");
      x2.fillStyle = gS;
      x2.beginPath(); x2.arc(cx + lx * r * 0.35, cy + lz * r * 0.35, r * 0.8, 0, Math.PI * 2); x2.fill();
      const gR = x2.createRadialGradient(cx - lx * r * 0.55, cy - lz * r * 0.55, 0, cx - lx * r * 0.55, cy - lz * r * 0.55, r * 0.55);
      gR.addColorStop(0, "rgba(255,255,255,0.22)");
      gR.addColorStop(1, "rgba(255,255,255,0)");
      x2.fillStyle = gR;
      x2.beginPath(); x2.arc(cx - lx * r * 0.55, cy - lz * r * 0.55, r * 0.55, 0, Math.PI * 2); x2.fill();
    }
    const groundTex = new THREE.CanvasTexture(c2);
    groundTex.colorSpace = THREE.SRGBColorSpace;
    groundTex.anisotropy = 8;
    terrainMesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { uMap: { value: groundTex }, uNoise: { value: makeNoiseTexture() }, uSunDir: { value: SUN_DIR } },
      vertexShader: REGO_VERT, fragmentShader: REGO_FRAG
    }));
    scene.add(terrainMesh);
    buildRocks(rand);
  }
  /* 岩石: 噪声变形二十面体(5 套外形), 底部压平半埋, 只绕竖轴旋转 → 不悬浮不穿地 */
  function makeRockGeo(seed) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const p = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 1) {
      v.fromBufferAttribute(p, i);
      const k = 1 + 0.38 * vnoise(v.x * 1.7 + seed * 11, v.y * 1.9 + v.z * 1.3, seed)
              + 0.15 * vnoise(v.x * 4.3 + seed * 5, v.z * 4.1 - v.y * 2.2, seed + 7);
      v.multiplyScalar(k);
      if (v.y < -0.32) v.y = -0.32 - (v.y + 0.32) * 0.22;   // 底部压平(半埋于月壤)
      p.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    return geo;
  }
  function buildRocks(rand) {
    bigRocks = [];
    const VAR = 5, BIG = 44, PEB = 60;   // 5 套外形 × (大石 44 + 碎石 60)
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), pos = new THREE.Vector3();
    const eul = new THREE.Euler(), col = new THREE.Color();
    for (let g = 0; g < VAR; g += 1) {
      const inst = new THREE.InstancedMesh(makeRockGeo(g * 17 + 3),
        new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.97, metalness: 0.02, flatShading: true }),
        BIG + PEB);
      for (let i = 0; i < BIG + PEB; i += 1) {
        const x = (rand() * 2 - 1) * (HALF - 60), z = (rand() * 2 - 1) * (HALF - 60);
        const isPeb = i >= BIG;
        const sBase = isPeb ? 0.07 + rand() * 0.24 : 0.35 + Math.pow(rand(), 2.6) * 3.6;
        if (Math.hypot(x, z) < 40) { m4.makeScale(0, 0, 0); inst.setMatrixAt(i, m4); continue; }
        pos.set(x, getHeight(x, z) + sBase * (isPeb ? 0.25 : 0.06), z);
        eul.set((rand() - 0.5) * 0.24, rand() * 6.28, (rand() - 0.5) * 0.24);   // 主要绕竖轴, 微倾
        q.setFromEuler(eul);
        s3.set(sBase * (0.8 + rand() * 0.45), sBase * (0.55 + rand() * 0.4), sBase * (0.8 + rand() * 0.45));
        m4.compose(pos, q, s3);
        inst.setMatrixAt(i, m4);
        const sh = 0.40 + rand() * 0.22;   // 逐块明暗差 + 极轻微冷暖差
        inst.setColorAt(i, col.setRGB(sh * (0.98 + rand() * 0.05), sh, sh * (0.95 + rand() * 0.05)));
        if (!isPeb && sBase > 1.2) bigRocks.push({ x, z, r: sBase * 1.05 });
      }
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
      scene.add(inst);
    }
  }

  /* ---------------- 地标 ---------------- */
  function buildMarks() {
    const rand = mulberry32(region.seed + 500);
    marks = [];
    for (let i = 0; i < region.marks.length; i += 1) {
      const ang = (i / region.marks.length) * Math.PI * 2 + rand() * 0.7;
      const dist = 280 + rand() * (HALF - 430);
      const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
      const y = getHeight(x, z);
      const group = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 8),
        new THREE.MeshStandardMaterial({ color: 0xd8dde8, roughness: 0.5, metalness: 0.5 }));
      pole.position.y = 3.5;
      group.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffc966 }));
      lamp.position.y = 7.3;
      group.add(lamp);
      const ring = new THREE.Mesh(new THREE.RingGeometry(4.5, 6, 40),
        new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.25;
      group.add(ring);
      const cvs = document.createElement("canvas");
      cvs.width = 512; cvs.height = 128;
      const ctx = cvs.getContext("2d");
      ctx.font = "600 52px 'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.textAlign = "center";
      ctx.shadowColor = "rgba(0,0,0,.9)";
      ctx.shadowBlur = 12;
      ctx.fillStyle = "#ffd9a0";
      ctx.fillText(region.marks[i][0], 256, 78);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(cvs), transparent: true, depthTest: false
      }));
      spr.scale.set(26, 6.5, 1);
      spr.position.y = 11;
      group.add(spr);
      group.position.set(x, y, z);
      scene.add(group);
      marks.push({ x, z, name: region.marks[i][0], desc: region.marks[i][1], done: false, group, lamp, ring, spr });
    }
  }

  /* ---------------- 月球车模型(含物理几何参数) ---------------- */
  function buildYutu() {
    const g = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a545, roughness: 0.45, metalness: 0.7 });
    const grey = new THREE.MeshStandardMaterial({ color: 0xb8bec8, roughness: 0.6, metalness: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.9 });
    const cell = new THREE.MeshStandardMaterial({ color: 0x2b4a8c, roughness: 0.35, metalness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 1.1), gold);
    body.position.y = 1.05;
    g.add(body);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.05, 0.95), cell);
      wing.position.set(side * 1.45, 1.42, 0);
      wing.rotation.z = side * -0.28;
      g.add(wing);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.05, 8), grey);
    mast.position.set(0.35, 2.0, 0);
    g.add(mast);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.24), grey);
    head.position.set(0.35, 2.6, 0);
    g.add(head);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.06, 10), dark);
      eye.rotation.x = Math.PI / 2;
      eye.position.set(0.35 + 0.14 * side, 2.6, 0.14);
      g.add(eye);
    }
    const wheels = [];
    const wGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.22, 18);
    for (let i = 0; i < 6; i += 1) {
      const side = i < 3 ? -1 : 1;
      const zi = (i % 3 - 1) * 0.95;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.1), grey);
      arm.position.set(side * 0.85, 0.85, zi);
      arm.rotation.z = side * 0.5;
      g.add(arm);
      const w = new THREE.Mesh(wGeo, dark);
      w.rotation.z = Math.PI / 2;
      const holder = new THREE.Group();
      holder.position.set(side * 1.02, 0.34, zi);
      holder.add(w);
      g.add(holder);
      wheels.push({ holder, mesh: w, steer: zi > 0.5, anchor: new THREE.Vector3(side * 1.02, 0.66, zi), comp: 0, compVis: 0, spinV: 0 });
    }
    g.userData = {
      wheels, wheelR: 0.32, comH: 1.0,
      susp: { rest: 0.34, travel: 0.34, k: 620, c: 195 },
      chassis: [
        new THREE.Vector3(0.8, 0.55, 1.05), new THREE.Vector3(-0.8, 0.55, 1.05),
        new THREE.Vector3(0.8, 0.55, -1.05), new THREE.Vector3(-0.8, 0.55, -1.05),
        new THREE.Vector3(2.05, 1.3, 0), new THREE.Vector3(-2.05, 1.3, 0),
        new THREE.Vector3(0, 0.55, 0)
      ]
    };
    return g;
  }
  function buildLRV() {
    const g = new THREE.Group();
    const frame = new THREE.MeshStandardMaterial({ color: 0xd8d8d2, roughness: 0.5, metalness: 0.55 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.9 });
    const orange = new THREE.MeshStandardMaterial({ color: 0xc57a3a, roughness: 0.7 });
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 2.4), frame);
    chassis.position.y = 0.72;
    g.add(chassis);
    for (const side of [-1, 1]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.55), orange);
      seat.position.set(side * 0.34, 1.02, 0.15);
      g.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.1), orange);
      back.position.set(side * 0.34, 1.32, 0.44);
      g.add(back);
    }
    const console_ = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.14), dark);
    console_.position.set(0, 1.1, -0.9);
    g.add(console_);
    const dishHolder = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), frame);
    dishHolder.position.set(-0.4, 1.65, -1.0);
    g.add(dishHolder);
    const dish = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.22, 20, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide }));
    dish.position.set(-0.4, 2.1, -1.0);
    dish.rotation.x = 0.35;
    g.add(dish);
    const wheels = [];
    const wGeo = new THREE.CylinderGeometry(0.41, 0.41, 0.26, 18);
    for (let i = 0; i < 4; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const zi = i < 2 ? -0.95 : 0.95;
      const fender = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12, 1, true, Math.PI, Math.PI), orange);
      fender.rotation.z = Math.PI / 2;
      fender.position.set(side * 0.78, 0.86, zi);
      g.add(fender);
      const w = new THREE.Mesh(wGeo, dark);
      w.rotation.z = Math.PI / 2;
      const holder = new THREE.Group();
      holder.position.set(side * 0.78, 0.43, zi);
      holder.add(w);
      g.add(holder);
      wheels.push({ holder, mesh: w, steer: zi > 0, anchor: new THREE.Vector3(side * 0.78, 0.79, zi), comp: 0, compVis: 0, spinV: 0 });
    }
    g.userData = {
      wheels, wheelR: 0.41, comH: 1.0,
      susp: { rest: 0.38, travel: 0.36, k: 1400, c: 470 },
      chassis: [
        new THREE.Vector3(0.7, 0.6, 1.25), new THREE.Vector3(-0.7, 0.6, 1.25),
        new THREE.Vector3(0.7, 0.6, -1.25), new THREE.Vector3(-0.7, 0.6, -1.25),
        new THREE.Vector3(0, 0.6, 0)
      ]
    };
    return g;
  }
  function makeBlobShadow() {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    const grd = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    grd.addColorStop(0, "rgba(0,0,0,0.55)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 128, 128);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = 3;
    return m;
  }

  /* ---------------- 扬尘 ---------------- */
  const DUST_N = 260;
  const dust = { idx: 0, arr: [] };
  let dustPoints = null;
  function buildDust() {
    const geo = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(DUST_N * 3), 3);
    pos.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("position", pos);
    dustPoints = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x9d9a95, size: 2.6, sizeAttenuation: false, transparent: true, opacity: 0.5, depthWrite: false
    }));
    dustPoints.frustumCulled = false;
    scene.add(dustPoints);
    for (let i = 0; i < DUST_N; i += 1) dust.arr.push({ x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: 0 });
  }
  function spawnDust(x, y, z, vx, vz) {
    const d = dust.arr[dust.idx];
    dust.idx = (dust.idx + 1) % DUST_N;
    d.x = x; d.y = y; d.z = z;
    d.vx = vx * 0.35 + (Math.random() - 0.5) * 1.2;
    d.vy = 0.8 + Math.random() * 1.6;
    d.vz = vz * 0.35 + (Math.random() - 0.5) * 1.2;
    d.life = 1.1 + Math.random() * 0.7;
  }
  function updateDust(dt) {
    const arr = dustPoints.geometry.attributes.position.array;
    for (let i = 0; i < DUST_N; i += 1) {
      const d = dust.arr[i];
      if (d.life > 0) {
        d.life -= dt;
        d.x += d.vx * dt; d.z += d.vz * dt;
        d.vy -= GRAV * dt;
        d.y += d.vy * dt;
        if (d.life <= 0) d.y = -999;
      }
      arr[i * 3] = d.x; arr[i * 3 + 1] = d.y; arr[i * 3 + 2] = d.z;
    }
    dustPoints.geometry.attributes.position.needsUpdate = true;
  }

  /* ================= 车辆刚体动力学 =================
   * 状态: 质心位置/速度 + 四元数姿态/角速度
   * 每轮: 沿世界竖直的射线悬架(弹簧+阻尼, 力沿地面法向),
   *       纵向驱动/制动 + 侧向抓地, 都以摩擦圆 μ·N 封顶
   * 底盘角点硬约束防穿透; 半隐式欧拉, 子步 ≤1/120s          */
  const veh = {
    pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    quat: new THREE.Quaternion(), omg: new THREE.Vector3(),
    steer: 0, groundedN: 0, upsideT: 0, odo: 0,
    outer: null, inner: null, shadow: null, cfg: null
  };
  const keys = new Set();
  window.addEventListener("keydown", (e) => {
    mAudioInit();
    if (e.code === "KeyP") mSetPhoto(!document.body.classList.contains("photo"));
    if (e.code === "Escape") mSetPhoto(false);
    keys.add(e.code);
    if (e.code === "KeyR" && started) switchRover((ROVERS.indexOf(roverCfg) + 1) % ROVERS.length);
    if (e.code === "Space") e.preventDefault();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));

  function setRoverModel(keepState) {
    if (veh.outer) scene.remove(veh.outer);
    const inner = roverCfg.id === "yutu" ? buildYutu() : buildLRV();
    const outer = new THREE.Group();
    inner.position.y = -inner.userData.comH;   // 模型以质心为原点挂载
    outer.add(inner);
    scene.add(outer);
    veh.outer = outer;
    veh.inner = inner;
    veh.cfg = inner.userData;
    if (!keepState) {
      veh.pos.set(0, getHeight(0, 40) + veh.cfg.comH + 0.4, 40);
      veh.quat.setFromEuler(new THREE.Euler(0, Math.PI, 0));
      veh.vel.set(0, 0, 0);
      veh.omg.set(0, 0, 0);
    }
    if (!veh.shadow) {
      veh.shadow = makeBlobShadow();
      scene.add(veh.shadow);
    }
  }
  function switchRover(i) {
    roverCfg = ROVERS[i];
    setRoverModel(true);
    refreshSwitchRow();
    toast(`已换乘 ${roverCfg.name}`, roverCfg.desc);
  }

  /* 预分配临时向量(零 GC) */
  const _up = new THREE.Vector3(), _fwd = new THREE.Vector3(), _lft = new THREE.Vector3();
  const _F = new THREE.Vector3(), _T = new THREE.Vector3();
  const _a = new THREE.Vector3(), _rArm = new THREE.Vector3(), _vP = new THREE.Vector3();
  const _n = new THREE.Vector3(), _wf = new THREE.Vector3(), _wl = new THREE.Vector3();
  const _fc = new THREE.Vector3(), _tq = new THREE.Vector3(), _dq = new THREE.Quaternion();
  const _cp = new THREE.Vector3();

  function substep(dt, throttle, brake) {
    const cfg = veh.cfg, susp = cfg.susp, m = roverCfg.mass;
    _up.set(0, 1, 0).applyQuaternion(veh.quat);
    _fwd.set(0, 0, 1).applyQuaternion(veh.quat);
    _lft.set(1, 0, 0).applyQuaternion(veh.quat);
    _F.set(0, -GRAV * m, 0);
    _T.set(0, 0, 0);
    const nW = cfg.wheels.length;
    veh.groundedN = 0;
    const speedH = Math.hypot(veh.vel.x, veh.vel.z);

    for (let i = 0; i < nW; i += 1) {
      const w = cfg.wheels[i];
      // 锚点世界坐标(锚点存于地面系, 转质心系: -comH)
      _a.copy(w.anchor);
      _a.y -= cfg.comH;
      _rArm.copy(_a).applyQuaternion(veh.quat);
      _a.copy(_rArm).add(veh.pos);
      const gY = getHeight(_a.x, _a.z);
      const comp = clamp(gY - (_a.y - (susp.rest + cfg.wheelR)), 0, susp.travel);
      w.comp = comp;
      if (comp <= 0) { w.spinV *= 0.98; continue; }
      veh.groundedN += 1;
      // 悬架力: 弹簧 + 阻尼, 沿地面法向
      _vP.crossVectors(veh.omg, _rArm).add(veh.vel);   // 接触点速度
      terrainNormal(_a.x, _a.z, _n);
      const relVn = _vP.dot(_n);
      let Fs = susp.k * comp - susp.c * relVn;
      Fs = clamp(Fs, 0, susp.k * susp.travel * 4);
      _fc.copy(_n).multiplyScalar(Fs);
      _F.add(_fc);
      _T.add(_tq.crossVectors(_rArm, _fc));
      // 轮系方向(前轮含转向角), 投影到地面切平面
      const st = w.steer ? veh.steer : 0;
      _wf.copy(_fwd).multiplyScalar(Math.cos(st)).addScaledVector(_lft, Math.sin(st));
      _wf.addScaledVector(_n, -_wf.dot(_n)).normalize();
      _wl.crossVectors(_n, _wf).normalize();
      const vLong = _vP.dot(_wf), vLat = _vP.dot(_wl);
      // 驱动/制动/滚阻, 摩擦圆封顶
      let drive = throttle * m * roverCfg.accel / nW;
      if (throttle > 0 && vLong > roverCfg.maxSpeed) drive = 0;
      if (throttle < 0 && vLong < -roverCfg.maxSpeed * 0.45) drive = 0;
      if (brake) drive = -Math.sign(vLong) * m * roverCfg.brake / nW;
      drive = clamp(drive, -MU_LONG * Fs, MU_LONG * Fs);
      const flat = clamp(-vLat * m * 2.0, -MU_LAT * Fs, MU_LAT * Fs);
      const roll = -vLong * 0.06 * m / nW * GRAV / 9.81;
      _fc.copy(_wf).multiplyScalar(drive + roll).addScaledVector(_wl, flat);
      _F.add(_fc);
      _T.add(_tq.crossVectors(_rArm, _fc));
      w.spinV = vLong;
    }
    // 低速转向助力(轮距短+低重力下纯摩擦转向偏迟钝)
    if (veh.groundedN > 0) {
      _T.addScaledVector(_up, veh.steer * clamp(speedH, 0.4, 5) * m * 0.28);
    }
    // 积分(半隐式欧拉)
    veh.vel.addScaledVector(_F, dt / m);
    veh.omg.addScaledVector(_T, dt * roverCfg.invI);
    veh.omg.multiplyScalar(Math.pow(0.5, dt));           // 角速度阻尼(稳定性)
    if (veh.vel.length() > 30) veh.vel.setLength(30);
    if (veh.omg.length() > 5) veh.omg.setLength(5);
    veh.pos.addScaledVector(veh.vel, dt);
    const h = dt * 0.5;
    _dq.set(veh.omg.x * h, veh.omg.y * h, veh.omg.z * h, 0).multiply(veh.quat);
    veh.quat.x += _dq.x; veh.quat.y += _dq.y; veh.quat.z += _dq.z; veh.quat.w += _dq.w;
    veh.quat.normalize();
    // 底盘角点硬约束: 任何标注点都不允许进入地面
    for (let i = 0; i < cfg.chassis.length; i += 1) {
      _cp.copy(cfg.chassis[i]);
      _cp.y -= cfg.comH;
      _cp.applyQuaternion(veh.quat).add(veh.pos);
      const g = getHeight(_cp.x, _cp.z);
      if (_cp.y < g + 0.06) {
        veh.pos.y += (g + 0.06 - _cp.y);
        if (veh.vel.y < 0) veh.vel.y *= -0.2;
        veh.omg.multiplyScalar(0.82);
      }
    }
    // 巨石碰撞(水平圆推离)
    for (let i = 0; i < bigRocks.length; i += 1) {
      const rk = bigRocks[i];
      const dx = veh.pos.x - rk.x, dz = veh.pos.z - rk.z;
      const d = Math.hypot(dx, dz);
      if (d < rk.r + 1.0 && d > 1e-4) {
        const push = rk.r + 1.0 - d;
        veh.pos.x += (dx / d) * push;
        veh.pos.z += (dz / d) * push;
        const vn = (veh.vel.x * dx + veh.vel.z * dz) / d;
        if (vn < 0) { veh.vel.x -= (dx / d) * vn * 1.4; veh.vel.z -= (dz / d) * vn * 1.4; }
      }
    }
    // 边界软墙
    const B = HALF - 30;
    if (Math.abs(veh.pos.x) > B || Math.abs(veh.pos.z) > B) {
      veh.pos.x = clamp(veh.pos.x, -B, B);
      veh.pos.z = clamp(veh.pos.z, -B, B);
      veh.vel.multiplyScalar(0.9);
      if (!substep._edgeT || performance.now() - substep._edgeT > 5000) {
        substep._edgeT = performance.now();
        toast("已到测绘区边缘", "掉头继续探索吧");
      }
    }
  }

  function physics(dtFull) {
    const throttle = ((keys.has("KeyW") || keys.has("ArrowUp")) ? 1 : 0) - ((keys.has("KeyS") || keys.has("ArrowDown")) ? 0.7 : 0);
    const trn = ((keys.has("KeyA") || keys.has("ArrowLeft")) ? 1 : 0) - ((keys.has("KeyD") || keys.has("ArrowRight")) ? 1 : 0);
    const boost = (keys.has("ShiftLeft") || keys.has("ShiftRight")) ? 1.4 : 1;
    const brake = keys.has("Space");
    veh.steer = lerp(veh.steer, trn * 0.42, 1 - Math.pow(0.002, dtFull));
    const saveMax = roverCfg.maxSpeed;
    roverCfg.maxSpeed *= boost;
    const NS = clamp(Math.ceil(dtFull / 0.00834), 1, 6);
    const dt = dtFull / NS;
    for (let s = 0; s < NS; s += 1) substep(dt, throttle, brake);
    roverCfg.maxSpeed = saveMax;
    // NaN 看门狗
    if (!isFinite(veh.pos.x) || !isFinite(veh.pos.y)) {
      setRoverModel(false);
      toast("系统重置", "检测到数值异常, 已回到出生点");
    }
    // 翻车自动扶正
    _up.set(0, 1, 0).applyQuaternion(veh.quat);
    if (_up.y < 0.25) veh.upsideT += dtFull; else veh.upsideT = 0;
    if (veh.upsideT > 2) {
      veh.upsideT = 0;
      _fwd.set(0, 0, 1).applyQuaternion(veh.quat);
      const yaw = Math.atan2(_fwd.x, _fwd.z);
      veh.quat.setFromEuler(new THREE.Euler(0, yaw, 0));
      veh.pos.y = getHeight(veh.pos.x, veh.pos.z) + veh.cfg.comH + 0.6;
      veh.vel.set(0, 0, 0);
      veh.omg.set(0, 0, 0);
      toast("已自动扶正", "低重力下翻车在所难免");
    }
    veh.odo += Math.hypot(veh.vel.x, veh.vel.z) * dtFull;
    // 车辙轨迹(雷达用)
    if (!veh.trail) veh.trail = [];
    const lastT = veh.trail[veh.trail.length - 1];
    if (!lastT || Math.hypot(veh.pos.x - lastT[0], veh.pos.z - lastT[1]) > 3) {
      veh.trail.push([veh.pos.x, veh.pos.z]);
      if (veh.trail.length > 600) veh.trail.shift();
    }
    // 视觉应用
    veh.outer.position.copy(veh.pos);
    veh.outer.quaternion.copy(veh.quat);
    const cfg = veh.cfg;
    for (const w of cfg.wheels) {
      w.compVis = lerp(w.compVis, w.comp, 1 - Math.pow(0.0005, dtFull));
      // 悬架视觉: 轮心随压缩量上下(满压时抬升 travel, 悬空时垂到最低)
      w.holder.position.set(w.anchor.x, w.anchor.y - cfg.susp.rest + w.compVis, w.anchor.z);
      w.holder.rotation.y = w.steer ? veh.steer : 0;
      w.mesh.rotation.x += w.spinV * dtFull / cfg.wheelR;
      if (w.comp > 0 && Math.abs(w.spinV) > 1) {
        _a.copy(w.anchor);
        _a.y -= cfg.comH;
        _a.applyQuaternion(veh.quat).add(veh.pos);
        if (Math.random() < 0.5) spawnDust(_a.x, _a.y - 0.2, _a.z, -veh.vel.x, -veh.vel.z);
      }
    }
    veh.shadow.position.set(veh.pos.x, getHeight(veh.pos.x, veh.pos.z) + 0.12, veh.pos.z);
    return slopeDegAt(veh.pos.x, veh.pos.z);
  }

  /* ---------------- 相机 ---------------- */
  const cam = { dist: 11, pitch: 0.32, yawOff: 0, drag: null };
  renderer.domElement.addEventListener("pointerdown", (e) => { cam.drag = { x: e.clientX, y: e.clientY }; });
  window.addEventListener("pointerup", () => { cam.drag = null; });
  window.addEventListener("pointermove", (e) => {
    if (!cam.drag) return;
    cam.yawOff -= (e.clientX - cam.drag.x) * 0.005;
    cam.pitch = clamp(cam.pitch + (e.clientY - cam.drag.y) * 0.004, 0.05, 1.25);
    cam.drag = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener("wheel", (e) => {
    cam.dist = clamp(cam.dist * (e.deltaY > 0 ? 1.12 : 0.9), 4.5, 42);
  }, { passive: true });
  function vehYaw() {
    _fwd.set(0, 0, 1).applyQuaternion(veh.quat);
    return Math.atan2(_fwd.x, _fwd.z);
  }
  function updateCamera(dt) {
    cam.yawOff = lerp(cam.yawOff, 0, 1 - Math.pow(0.25, dt));
    const a = vehYaw() + Math.PI + cam.yawOff;
    const cx = veh.pos.x + Math.sin(a) * cam.dist * Math.cos(cam.pitch);
    const cz = veh.pos.z + Math.cos(a) * cam.dist * Math.cos(cam.pitch);
    let cy = veh.pos.y + cam.dist * Math.sin(cam.pitch) + 1.6;
    const gy = getHeight(cx, cz) + 1.4;
    if (cy < gy) cy = gy;
    camera.position.lerp(_cp.set(cx, cy, cz), 1 - Math.pow(0.0008, dt));
    camera.lookAt(veh.pos.x, veh.pos.y + 1.0, veh.pos.z);
  }

  /* ---------------- 小地图(2D 雷达) ---------------- */
  const mini = $("minimap").getContext("2d");
  const MS = $("minimap").width;
  let miniBase = null;
  function prerenderMinimap() {
    const c = document.createElement("canvas");
    c.width = c.height = MS;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(MS, MS);
    for (let j = 0; j < MS; j += 1) {
      for (let i = 0; i < MS; i += 1) {
        const x = (i / (MS - 1) - 0.5) * SIZE, z = (j / (MS - 1) - 0.5) * SIZE;
        const h = getHeight(x, z);
        const hx = getHeight(x + 14, z) - h;
        let g = 74 + h * 0.5 - hx * 5;
        g = clamp(g, 20, 168);
        const k = (j * MS + i) * 4;
        img.data[k] = g; img.data[k + 1] = g; img.data[k + 2] = Math.min(255, g * 1.03); img.data[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // 方位标与比例尺(烙进底图)
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(200,220,255,0.8)";
    ctx.fillText("N", MS / 2, 10);
    ctx.fillText("S", MS / 2, MS - 3);
    ctx.fillText("E", MS - 6, MS / 2 + 3);
    ctx.fillText("W", 6, MS / 2 + 3);
    const sw = 500 / SIZE * MS;
    ctx.strokeStyle = "rgba(200,220,255,0.7)";
    ctx.beginPath();
    ctx.moveTo(8, MS - 8);
    ctx.lineTo(8 + sw, MS - 8);
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.font = "8px sans-serif";
    ctx.fillText("500 m", 8, MS - 12);
    miniBase = c;
  }
  const COMPASS8 = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  function drawMinimap(t) {
    mini.clearRect(0, 0, MS, MS);
    mini.drawImage(miniBase, 0, 0);
    const rx = (veh.pos.x / SIZE + 0.5) * MS, rz = (veh.pos.z / SIZE + 0.5) * MS;
    // 车辙轨迹
    if (veh.trail && veh.trail.length > 1) {
      mini.strokeStyle = "rgba(110,168,255,0.5)";
      mini.lineWidth = 1.2;
      mini.beginPath();
      for (let i = 0; i < veh.trail.length; i += 1) {
        const px = (veh.trail[i][0] / SIZE + 0.5) * MS, py = (veh.trail[i][1] / SIZE + 0.5) * MS;
        if (i === 0) mini.moveTo(px, py); else mini.lineTo(px, py);
      }
      mini.lineTo(rx, rz);
      mini.stroke();
      mini.lineWidth = 1;
    }
    // 绕车测距圈 250/500/1000m
    mini.strokeStyle = "rgba(140,175,230,0.22)";
    for (const rM of [250, 500, 1000]) {
      mini.beginPath();
      mini.arc(rx, rz, rM / SIZE * MS, 0, Math.PI * 2);
      mini.stroke();
    }
    // 相机视野扇形
    const vd = vehYaw() + cam.yawOff;
    mini.save();
    mini.translate(rx, rz);
    mini.rotate(-vd);
    const grd = mini.createLinearGradient(0, 0, 0, 40);
    grd.addColorStop(0, "rgba(110,168,255,0.28)");
    grd.addColorStop(1, "rgba(110,168,255,0)");
    mini.fillStyle = grd;
    mini.beginPath();
    mini.moveTo(0, 0);
    mini.arc(0, 0, 40, Math.PI / 2 - 0.48, Math.PI / 2 + 0.48);
    mini.closePath();
    mini.fill();
    mini.restore();
    // 雷达扫描线(绕车旋转)
    const sweep = (t * 0.7) % (Math.PI * 2);
    mini.save();
    mini.translate(rx, rz);
    mini.rotate(sweep);
    const lg = mini.createLinearGradient(0, 0, MS / 2, 0);
    lg.addColorStop(0, "rgba(110,220,180,0.22)");
    lg.addColorStop(1, "rgba(110,220,180,0)");
    mini.fillStyle = lg;
    mini.beginPath();
    mini.moveTo(0, 0);
    mini.arc(0, 0, MS * 0.7, -0.4, 0);
    mini.closePath();
    mini.fill();
    mini.restore();
    // 地标: 未打卡金色菱形+呼吸光晕, 已打卡绿色
    let bestD = Infinity, bestMk = null;
    for (let i = 0; i < marks.length; i += 1) {
      const mk = marks[i];
      const px = (mk.x / SIZE + 0.5) * MS, py = (mk.z / SIZE + 0.5) * MS;
      const d = Math.hypot(veh.pos.x - mk.x, veh.pos.z - mk.z);
      if (!mk.done && d < bestD) { bestD = d; bestMk = mk; }
      if (!mk.done) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 3 + i);
        mini.fillStyle = `rgba(255,201,102,${(0.14 + 0.2 * pulse).toFixed(3)})`;
        mini.beginPath();
        mini.arc(px, py, 6 + pulse * 3, 0, Math.PI * 2);
        mini.fill();
      }
      mini.fillStyle = mk.done ? "#7be0a8" : "#ffc966";
      mini.save();
      mini.translate(px, py);
      mini.rotate(Math.PI / 4);
      mini.fillRect(-3, -3, 6, 6);
      mini.restore();
    }
    // 车辆箭头(画布 Y 朝下 → rotate 取负)
    mini.save();
    mini.translate(rx, rz);
    mini.rotate(-vehYaw());
    mini.fillStyle = "#8ec3ff";
    mini.strokeStyle = "rgba(255,255,255,.85)";
    mini.beginPath();
    mini.moveTo(0, 7);
    mini.lineTo(-4.5, -4.5);
    mini.lineTo(0, -2.2);
    mini.lineTo(4.5, -4.5);
    mini.closePath();
    mini.fill();
    mini.stroke();
    mini.restore();
    // 最近未打卡地标读数
    const capEl = $("miniCap");
    if (capEl) {
      if (bestMk) {
        const ang = Math.atan2(bestMk.x - veh.pos.x, -(bestMk.z - veh.pos.z));
        const oct = COMPASS8[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8];
        capEl.textContent = `${bestMk.name} · ${bestD > 999 ? (bestD / 1000).toFixed(1) + " km" : Math.round(bestD) + " m"} · ${oct}`;
      } else {
        capEl.textContent = "全部地标已打卡";
      }
    }
  }

  /* ---------------- 成就(与主页共用 localStorage 图鉴) ---------------- */
  function award(id, cn) {
    try {
      const a = JSON.parse(localStorage.getItem("ss_ach") || "{}");
      if (a[id]) return;
      a[id] = Date.now();
      localStorage.setItem("ss_ach", JSON.stringify(a));
      setTimeout(() => toast("成就解锁", cn), 1200);
    } catch (e) { /* localStorage 不可用则静默 */ }
  }
  /* ---------------- 音效(与主页共享 ss_sound 开关) + 摄影模式 ---------------- */
  let mAudio = null, mGain = null, mOsc = null, mSoundOn = true;
  try { mSoundOn = localStorage.getItem("ss_sound") !== "0"; } catch (e) { /* 默认开 */ }
  function mAudioInit() {
    if (mAudio || !mSoundOn) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      mAudio = new AC();
      mGain = mAudio.createGain();
      mGain.gain.value = 0;
      mOsc = mAudio.createOscillator();
      mOsc.type = "triangle";
      mOsc.frequency.value = 42;
      const lp = mAudio.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 220;
      mOsc.connect(lp).connect(mGain).connect(mAudio.destination);
      mOsc.start();
    } catch (e) { mAudio = null; }
  }
  function mEngine(speedKmh, throttle) {
    if (!mAudio || !mSoundOn) return;
    if (mAudio.state === "suspended") mAudio.resume();
    mOsc.frequency.value = 40 + Math.min(speedKmh, 30) * 2.2;
    const target = 0.02 + Math.min(Math.abs(throttle), 1) * 0.05 + Math.min(speedKmh / 30, 1) * 0.03;
    mGain.gain.value += (target - mGain.gain.value) * 0.08;
  }
  function mChime() {
    if (!mAudio || !mSoundOn) return;
    const t = mAudio.currentTime;
    for (const [f, d] of [[660, 0], [990, 0.09]]) {
      const o = mAudio.createOscillator(), g = mAudio.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.13, t + d + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.55);
      o.connect(g).connect(mAudio.destination);
      o.start(t + d);
      o.stop(t + d + 0.6);
    }
  }
  let mSnapReq = false;
  function mSetPhoto(on) { document.body.classList.toggle("photo", on); }
  function mSaveSnap(renderer) {
    mSnapReq = false;
    try {
      const a = document.createElement("a");
      const d = new Date(), pad = (n) => String(n).padStart(2, "0");
      a.download = `月球车_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.png`;
      a.href = renderer.domElement.toDataURL("image/png");
      a.click();
    } catch (e) { /* 忽略 */ }
  }
  /* ---------------- 打卡与 HUD ---------------- */
  let toastTimer = null;
  function toast(title, sub) {
    const el = $("toast");
    el.innerHTML = `${title}${sub ? `<div class="sub">${sub}</div>` : ""}`;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }
  function refreshCheckList() {
    $("checkList").innerHTML = marks.map((m, i) =>
      `<div class="ck ${m.done ? "done" : ""}" id="ck${i}"><b>${m.done ? "✓ " : "◇ "}${m.name}</b><span class="dist">—</span></div>`
    ).join("");
  }
  function refreshSwitchRow() {
    $("switchRow").innerHTML = "";
    ROVERS.forEach((r, i) => {
      const b = document.createElement("button");
      b.textContent = r.name;
      if (r === roverCfg) b.classList.add("active");
      b.addEventListener("click", () => switchRover(i));
      $("switchRow").appendChild(b);
    });
  }
  function updateChecks(t) {
    for (let i = 0; i < marks.length; i += 1) {
      const mk = marks[i];
      const d = Math.hypot(veh.pos.x - mk.x, veh.pos.z - mk.z);
      const el = $("ck" + i);
      if (el) el.querySelector(".dist").textContent = mk.done ? "已打卡" : (d > 999 ? (d / 1000).toFixed(1) + " km" : Math.round(d) + " m");
      const pulse = 0.5 + 0.5 * Math.sin(t * 3 + i);
      mk.ring.material.opacity = mk.done ? 0.22 : 0.3 + 0.35 * pulse;
      mk.ring.scale.setScalar(mk.done ? 1 : 1 + pulse * 0.25);
      if (!mk.done && d < 26) {
        mk.done = true;
        mk.lamp.material.color.set(0x7be0a8);
        mk.spr.material.opacity = 0.55;
        toast(`打卡 · ${mk.name}`, mk.desc);
        mChime();
        award("moon_first_mark", "月面初探 —— 打卡第一个地标");
        refreshCheckList();
        if (marks.every((m) => m.done)) {
          setTimeout(() => toast("全部地标打卡完成", `${region.name} 探索完毕 — 换个着陆区再来一圈?`), 2800);
          award("moon_region_all", "区域制霸 —— 集齐一个着陆区全部地标");
        }
      }
    }
  }

  /* ---------------- 出发面板 ---------------- */
  let selRegion = 0, selRover = 0;
  function buildStartUi() {
    REGIONS.forEach((r, i) => {
      const b = document.createElement("button");
      b.innerHTML = `<b>${r.name}</b><span>${r.desc}</span>`;
      if (i === selRegion) b.classList.add("active");
      b.addEventListener("click", () => {
        selRegion = i;
        for (const x of $("regionGrid").children) x.classList.remove("active");
        b.classList.add("active");
      });
      $("regionGrid").appendChild(b);
    });
    ROVERS.forEach((r, i) => {
      const b = document.createElement("button");
      b.innerHTML = `<b>${r.name}</b><br><span style="font-size:11px;color:var(--text-dim)">${r.desc} · 极速 ${(r.maxSpeed * 3.6).toFixed(0)} km/h</span>`;
      if (i === selRover) b.classList.add("active");
      b.addEventListener("click", () => {
        selRover = i;
        for (const x of $("roverRow").children) x.classList.remove("active");
        b.classList.add("active");
      });
      $("roverRow").appendChild(b);
    });
    $("goBtn").addEventListener("click", startGame);
    $("mPhotoBtn").addEventListener("click", () => { mAudioInit(); mSetPhoto(true); });
    $("mPhotoExit").addEventListener("click", () => mSetPhoto(false));
    $("mSnapBtn").addEventListener("click", () => { mSnapReq = true; });
    $("exitBtn").addEventListener("click", () => { location.href = "index.html"; });
  }


  /* ---------------- 首次驾驶迷你引导(可跳过) ---------------- */
  const MG_STEPS = [
    ["驾驶月球车", "<b>W/S</b> 油门与倒车 · <b>A/D</b> 转向 · <b>Shift</b> 加速 · <b>空格</b> 手刹 · <b>R</b> 换车。这里是 1/6 重力: 刹车距离比地球长得多, 高速转向会甩尾——真实刚体物理, 请温柔驾驶。"],
    ["雷达与地标打卡", "右上角雷达: 亮色扇形是你的朝向, 金色圆点是待打卡地标, 左侧列表显示实时距离。开到地标附近会自动打卡, 集齐全部地标即完成本区探索。"],
    ["抬头看看", "拖拽鼠标环顾四周, 滚轮调整距离。地平线上那颗蓝色亮星是<b>真实方位的地球</b>, 星空也是真实星表——这里的一切和主页太阳系同一套数据。祝驾驶愉快!"]
  ];
  let mgI = 0;
  function mgShow(i) {
    mgI = i;
    $("mgTitle").textContent = MG_STEPS[i][0];
    $("mgText").innerHTML = MG_STEPS[i][1];
    $("mgDots").textContent = `${i + 1} / ${MG_STEPS.length}`;
    $("mgNext").textContent = i === MG_STEPS.length - 1 ? "出发!" : "下一条";
    $("mgCard").style.display = "flex";
  }
  function mgEnd() {
    $("mgCard").style.display = "none";
    try { localStorage.setItem("moon_guide_done", "1"); } catch (e) { /* 忽略 */ }
  }
  function maybeShowGuide() {
    try { if (localStorage.getItem("moon_guide_done")) return; } catch (e) { return; }
    mgShow(0);
    $("mgNext").onclick = () => { mgI + 1 >= MG_STEPS.length ? mgEnd() : mgShow(mgI + 1); };
    $("mgSkip").onclick = mgEnd;
  }
  async function startGame() {
    if (started) return;
    $("goBtn").style.display = "none";
    $("loadingText").style.display = "block";
    region = REGIONS[selRegion];
    roverCfg = ROVERS[selRover];
    await new Promise((r) => setTimeout(r, 30));
    await buildSky();
    const earthImg = await loadImage(window.TEXTURE_DATA.earth_day);
    buildEarth(earthImg);
    await buildTerrain();
    buildMarks();
    buildDust();
    setRoverModel(false);
    refreshCheckList();
    refreshSwitchRow();
    $("regionName").textContent = region.name;
    $("startOverlay").style.display = "none";
    award("moon_land", "登月 —— 首次驾驶月球车");
    maybeShowGuide();
    $("topBar").style.display = "flex";
    $("checkPanel").style.display = "flex";
    $("miniWrap").style.display = "block";
    $("helpBar").style.display = "block";
    prerenderMinimap();
    started = true;
    toast(`欢迎来到 ${region.name}`, "WASD 驾驶 · 找到 5 个信标打卡");
  }

  /* ---------------- 主循环 ---------------- */
  let last = performance.now();
  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!started) { renderer.render(scene, camera); return; }
    const t = now / 1000;
    const slope = physics(dt);
    updateCamera(dt);
    updateDust(dt);
    updateChecks(t);
    if (earthMesh) earthMesh.rotation.y = t * 0.008;
    drawMinimap(t);
    const speedH = Math.hypot(veh.vel.x, veh.vel.z);
    $("hudSpeed").textContent = (speedH * 3.6).toFixed(1);
    mEngine(speedH * 3.6, (keys.has("KeyW") || keys.has("KeyS")) ? 1 : 0);
    $("hudSlope").textContent = `${slope.toFixed(0)}°`;
    $("hudOdo").textContent = veh.odo > 999 ? `${(veh.odo / 1000).toFixed(2)} km` : `${Math.round(veh.odo)} m`;
    $("hudAlt").textContent = `${veh.pos.y.toFixed(0)} m`;
    renderer.render(scene, camera);
    if (mSnapReq) mSaveSnap(renderer);
  }

  buildStartUi();
  camera.position.set(0, 60, 120);
  camera.lookAt(0, 0, 0);
  animate(performance.now());
}());
