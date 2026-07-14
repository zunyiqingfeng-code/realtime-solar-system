/* ============================================================================
 * deepsky.js — 深空天体图鉴渲染 + 银河罗盘  阶段14 P3+P4
 * 自包含 IIFE:顶层不触碰 THREE/DOM, 载入即安全。
 * 首次 tick 且 window.__dsBridge 就绪时懒初始化;任何异常 → warn 一次后静默禁用。
 * 全部视觉程序化绘制(canvas), 零外部资源。
 * ========================================================================== */
(function () {
  'use strict';

  var GC_RA = 266.417, GC_DEC = -28.936;   // 银心 Sgr A* (J2000)
  var R_SHELL = 1.15e8;                    // 天空投影半径(camera.far=2.2e8 以内)
  var TEX = 256, MAP = 190;                // 天体纹理 / 罗盘画布尺寸
  var SUN_LY = 26000, GAL_LY = 50000;      // 太阳银心距 / 罗盘半径映射

  var built = false, dead = false;
  var bridge = null, group = null, tmpV = null;
  var mats = [], labelMats = [];
  var cur = 0;                             // 当前不透明度(缓动值)
  var azGal = 0;                           // 银心方向在黄道面上的方位角
  var compass = null;                      // 罗盘状态包

  /* ---------------- 确定性随机 / 噪声 ---------------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function strSeed(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function gauss(rng) {
    var u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function hash2(ix, iy, seed) {          // 简单值哈希 [0,1)
    var s = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  }
  function vnoise(x, y, seed) {           // 双线性值噪声
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    var sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    var a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
    var c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  function fbm(x, y, seed) {              // 3 倍频
    return 0.55 * vnoise(x, y, seed) + 0.3 * vnoise(x * 2.13, y * 2.13, seed + 5) +
           0.15 * vnoise(x * 4.7, y * 4.7, seed + 11);
  }
  function sstep(a, b, x) {
    var t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  /* ---------------- 程序化纹理模板 ---------------- */
  function makeCv(n) {
    var c = document.createElement('canvas');
    c.width = n; c.height = n;
    return c;
  }
  function softDot(ctx, x, y, r, rgb, a) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  }
  function sprinkleStars(ctx, rng, cnt, n) {
    for (var i = 0; i < cnt; i++) {
      var x = n * (0.15 + rng() * 0.7), y = n * (0.15 + rng() * 0.7);
      softDot(ctx, x, y, 1 + rng() * 2, '255,255,255', 0.5 + rng() * 0.4);
    }
  }

  /* emission: 红粉多层径向渐变 + 值噪声斑块, 边缘破碎 */
  function paintEmission(c, seed) {
    var n = c.width, ctx = c.getContext('2d'), cx = n / 2;
    var g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    g.addColorStop(0, 'rgba(255,222,214,0.95)');
    g.addColorStop(0.22, 'rgba(255,145,150,0.78)');
    g.addColorStop(0.5, 'rgba(224,72,116,0.45)');
    g.addColorStop(0.82, 'rgba(128,30,82,0.18)');
    g.addColorStop(1, 'rgba(90,20,60,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, n, n);
    var img = ctx.getImageData(0, 0, n, n), d = img.data;
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        var i = (y * n + x) * 4, a = d[i + 3];
        if (!a) continue;
        var u = (x - cx) / cx, v = (y - cx) / cx, r = Math.sqrt(u * u + v * v);
        var nz = fbm(x * 0.045, y * 0.045, seed);
        var frag = fbm(x * 0.02 + 9.7, y * 0.02 + 3.1, seed + 7);
        var edge = 1 - sstep(0.52 + 0.42 * (frag - 0.5), 1.0, r);   // 噪声扰动的破碎边缘
        var m = (0.3 + 0.9 * nz) * edge;
        d[i + 3] = Math.max(0, Math.min(255, a * m));
      }
    }
    ctx.putImageData(img, 0, 0);
    sprinkleStars(ctx, mulberry32(seed + 3), 12, n);
  }

  /* cluster: 20-40 个蓝白亮点高斯散布 */
  function paintCluster(c, seed) {
    var n = c.width, ctx = c.getContext('2d'), cx = n / 2;
    var rng = mulberry32(seed);
    var cnt = 20 + Math.floor(rng() * 21);
    for (var i = 0; i < cnt; i++) {
      var x = cx + gauss(rng) * n * 0.15, y = cx + gauss(rng) * n * 0.15;
      var big = rng() < 0.22;
      var r = big ? 3.5 + rng() * 3.5 : 1.4 + rng() * 2.2;
      softDot(ctx, x, y, r * 2.2, '150,185,255', 0.35);
      softDot(ctx, x, y, r, '235,242,255', 0.95);
      if (big) {                                     // 亮星十字芒
        ctx.strokeStyle = 'rgba(200,220,255,0.55)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(x - r * 2.6, y); ctx.lineTo(x + r * 2.6, y);
        ctx.moveTo(x, y - r * 2.6); ctx.lineTo(x, y + r * 2.6);
        ctx.stroke();
      }
    }
  }

  /* globular: 数百微点向心指数密集 + 中心泛光 */
  function paintGlobular(c, seed) {
    var n = c.width, ctx = c.getContext('2d'), cx = n / 2;
    var rng = mulberry32(seed);
    softDot(ctx, cx, cx, n * 0.34, '255,240,218', 0.5);
    softDot(ctx, cx, cx, n * 0.14, '255,248,235', 0.85);
    for (var i = 0; i < 430; i++) {
      var rr = Math.min(n * 0.46, -Math.log(1 - rng()) * n * 0.085);
      var th = rng() * 6.2832;
      var x = cx + Math.cos(th) * rr, y = cx + Math.sin(th) * rr;
      var a = 0.85 * (1 - rr / (n * 0.5)) + 0.1;
      var r = 0.5 + rng() * 1.1;
      ctx.fillStyle = 'rgba(255,243,224,' + a.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
    }
  }

  /* galaxy: 倾斜椭圆 + 对数螺旋臂 + 核球;edge=草帽侧向;companion=M51 伴星系 */
  function paintGalaxy(c, seed, opts) {
    opts = opts || {};
    var n = c.width, ctx = c.getContext('2d'), cx = n / 2;
    var rng = mulberry32(seed);
    ctx.save();
    ctx.translate(cx, cx);
    ctx.rotate(opts.tilt || 0);
    if (opts.edge) {                                  // —— M104 侧向 ——
      softDot(ctx, 0, 0, n * 0.3, '255,230,200', 0.5);         // 球状晕
      ctx.save(); ctx.scale(1, 0.2);                            // 扁盘
      softDot(ctx, 0, 0, n * 0.44, '255,236,210', 0.9);
      ctx.restore();
      ctx.globalCompositeOperation = 'source-atop';              // 暗尘埃带横线
      ctx.fillStyle = 'rgba(12,7,18,0.82)';
      ctx.fillRect(-n * 0.46, n * 0.012, n * 0.92, n * 0.035);
      ctx.globalCompositeOperation = 'source-over';
      softDot(ctx, 0, -n * 0.05, n * 0.1, '255,244,225', 0.95);  // 核球顶部露出
    } else {                                          // —— 常规旋涡 ——
      var flat = opts.flat || 0.6, arms = opts.arms || 2;
      ctx.scale(1, flat);
      softDot(ctx, 0, 0, n * 0.42, '150,170,230', 0.32);         // 盘面辉光
      var k = 0.24, r0 = n * 0.055;
      for (var a = 0; a < arms; a++) {
        var ph = a * 6.2832 / arms + rng() * 0.35;
        for (var t = 0.4; t < 4.2; t += 0.045) {
          var rr = r0 * Math.exp(k * t);
          if (rr > n * 0.44) break;
          var ang = t + ph;
          var x = Math.cos(ang) * rr, y = Math.sin(ang) * rr;
          var fade = (1 - rr / (n * 0.47)) * (0.55 + 0.45 * vnoise(t * 3.1, a * 7.7, seed));
          softDot(ctx, x + gauss(rng) * 2.2, y + gauss(rng) * 2.2,
                  1.6 + rng() * 2.4, '188,205,255', 0.34 * fade);
          if (rng() < 0.05) softDot(ctx, x, y, 1.6, '255,168,190', 0.5 * fade); // HII 区点缀
        }
      }
      softDot(ctx, 0, 0, n * 0.13, '255,232,200', 0.95);          // 核球
      if (opts.companion) {                                       // NGC5195
        softDot(ctx, n * 0.3, -n * 0.3 / flat, n * 0.07, '255,238,215', 0.8);
      }
    }
    ctx.restore();
  }

  /* irregular: 不规则棉絮(大小麦哲伦云) */
  function paintIrregular(c, seed) {
    var n = c.width, ctx = c.getContext('2d'), cx = n / 2;
    var rng = mulberry32(seed);
    for (var i = 0; i < 13; i++) {
      var x = cx + gauss(rng) * n * 0.13, y = cx + gauss(rng) * n * 0.11;
      var r = n * (0.07 + rng() * 0.13);
      var a = 0.1 + 0.16 * fbm(x * 0.05, y * 0.05, seed + i);
      softDot(ctx, x, y, r, '198,212,245', a);
    }
    softDot(ctx, cx - n * 0.06, cx + n * 0.03, n * 0.16, '225,232,250', 0.3);  // 恒星棒
    for (var j = 0; j < 4; j++) {                                  // HII 区(如蜘蛛星云)
      softDot(ctx, cx + gauss(rng) * n * 0.16, cx + gauss(rng) * n * 0.13,
              3 + rng() * 4, '255,150,165', 0.65);
    }
    for (var s = 0; s < 46; s++) {                                 // 散布恒星微点
      var sx = cx + gauss(rng) * n * 0.15, sy = cx + gauss(rng) * n * 0.13;
      ctx.fillStyle = 'rgba(240,245,255,' + (0.3 + rng() * 0.5).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(sx, sy, 0.5 + rng() * 0.8, 0, 6.2832); ctx.fill();
    }
  }

  /* planetary: 内暗外亮的环 + 中心白点 */
  function paintPlanetary(c, seed) {
    var n = c.width, ctx = c.getContext('2d'), cx = n / 2;
    ctx.save();
    ctx.translate(cx, cx); ctx.scale(1, 0.86); ctx.rotate(0.3);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, n * 0.42);
    g.addColorStop(0, 'rgba(60,110,110,0.05)');
    g.addColorStop(0.32, 'rgba(80,190,170,0.28)');
    g.addColorStop(0.55, 'rgba(140,240,210,0.9)');
    g.addColorStop(0.72, 'rgba(238,128,112,0.8)');
    g.addColorStop(0.86, 'rgba(170,62,86,0.25)');
    g.addColorStop(1, 'rgba(120,40,70,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, n * 0.42, 0, 6.2832); ctx.fill();
    ctx.restore();
    softDot(ctx, cx, cx, 4.5, '255,255,255', 0.95);                // 中心白矮星
    sprinkleStars(ctx, mulberry32(seed + 9), 6, n);
  }

  /* snr: 丝状网络(随机贝塞尔细丝) */
  function paintSNR(c, seed) {
    var n = c.width, ctx = c.getContext('2d'), cx = n / 2;
    var rng = mulberry32(seed);
    ctx.save();
    ctx.translate(cx, cx); ctx.scale(1, 0.82); ctx.rotate(-0.4);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, n * 0.36);
    g.addColorStop(0, 'rgba(255,205,160,0.4)');
    g.addColorStop(0.6, 'rgba(200,120,140,0.2)');
    g.addColorStop(1, 'rgba(120,80,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, n * 0.36, 0, 6.2832); ctx.fill();
    for (var i = 0; i < 18; i++) {
      var a0 = rng() * 6.2832, r0 = rng() * n * 0.28;
      var x0 = Math.cos(a0) * r0, y0 = Math.sin(a0) * r0;
      var x1 = x0 + gauss(rng) * n * 0.14, y1 = y0 + gauss(rng) * n * 0.14;
      var mx = (x0 + x1) / 2 + gauss(rng) * n * 0.09, my = (y0 + y1) / 2 + gauss(rng) * n * 0.09;
      var col = rng() < 0.6 ? '255,185,145' : '175,195,255';
      var al = 0.25 + rng() * 0.35;
      ctx.lineWidth = 2.2 + rng();                                  // 光晕层
      ctx.strokeStyle = 'rgba(' + col + ',' + (al * 0.35).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
      ctx.lineWidth = 0.7 + rng() * 0.8;                            // 细丝层
      ctx.strokeStyle = 'rgba(' + col + ',' + al.toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
    }
    ctx.restore();
  }

  var GALAXY_OPTS = {
    M31:  { arms: 2, flat: 0.38, tilt: 0.65 },
    M33:  { arms: 3, flat: 0.85, tilt: 0.2 },
    M51:  { arms: 2, flat: 0.92, tilt: -0.4, companion: true },
    M104: { edge: true, tilt: -0.1 }
  };

  function paintObject(cv, obj) {
    var seed = strSeed(obj.id);
    if (obj.type === 'emission') paintEmission(cv, seed);
    else if (obj.type === 'cluster') paintCluster(cv, seed);
    else if (obj.type === 'globular') paintGlobular(cv, seed);
    else if (obj.type === 'galaxy') paintGalaxy(cv, seed, GALAXY_OPTS[obj.id]);
    else if (obj.type === 'irregular') paintIrregular(cv, seed);
    else if (obj.type === 'planetary') paintPlanetary(cv, seed);
    else if (obj.type === 'snr') paintSNR(cv, seed);
    else paintCluster(cv, seed);
  }

  /* ---------------- 名字标签 ---------------- */
  function makeLabelCv(text) {
    var cv = document.createElement('canvas');
    var ctx = cv.getContext('2d');
    var fs = 22, pad = 10;
    ctx.font = fs + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
    var w = Math.ceil(ctx.measureText(text).width) + pad * 2;
    cv.width = Math.max(2, w); cv.height = fs + 14;
    ctx = cv.getContext('2d');
    ctx.font = fs + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 5;
    ctx.fillStyle = '#b8c8e8';
    ctx.fillText(text, cv.width / 2, cv.height / 2 + 1);
    return cv;
  }

  /* ---------------- 场景构建 ---------------- */
  function build() {
    bridge = window.__dsBridge;
    var THREE = bridge.THREE;
    tmpV = new THREE.Vector3();
    var gc = bridge.eq2ecl(GC_RA, GC_DEC);
    azGal = Math.atan2(gc[1], gc[0]);

    group = new THREE.Group();
    group.name = 'deepskyLayer';
    group.visible = false;

    var data = window.DEEPSKY || [];
    var lmin = Infinity, lmax = -Infinity;
    for (var i = 0; i < data.length; i++) {
      var L = Math.log(Math.max(0.1, data[i].sizeArcmin));
      if (L < lmin) lmin = L;
      if (L > lmax) lmax = L;
    }
    var span = (lmax - lmin) || 1;

    for (var j = 0; j < data.length; j++) {
      var obj = data[j];
      var cv = makeCv(TEX);
      paintObject(cv, obj);
      var tex = new THREE.CanvasTexture(cv);
      var mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0,
        depthTest: true, depthWrite: false, sizeAttenuation: false,
        blending: obj.type === 'galaxy' ? THREE.NormalBlending : THREE.AdditiveBlending
      });
      var sp = new THREE.Sprite(mat);
      sp.renderOrder = -6;
      var dir = bridge.eq2ecl(obj.ra, obj.dec);
      sp.position.set(dir[0] * R_SHELL, dir[1] * R_SHELL, dir[2] * R_SHELL);
      var s = 0.02 + 0.10 * ((Math.log(Math.max(0.1, obj.sizeArcmin)) - lmin) / span);
      sp.scale.set(s, s, 1);
      group.add(sp);
      mats.push(mat);

      // 名字标签(天体下方)
      var lcv = makeLabelCv(obj.cn.indexOf(obj.id) === -1 ? obj.id + ' ' + obj.cn : obj.cn);
      var ltex = new THREE.CanvasTexture(lcv);
      var lmat = new THREE.SpriteMaterial({
        map: ltex, transparent: true, opacity: 0,
        depthTest: true, depthWrite: false, sizeAttenuation: false
      });
      var lsp = new THREE.Sprite(lmat);
      lsp.renderOrder = -6;
      lsp.position.copy(sp.position);
      var lh = 0.016;
      lsp.scale.set(lh * lcv.width / lcv.height, lh, 1);
      lsp.center.set(0.5, 1 + (s * 0.5 + 0.006) / lh);   // 锚到天体底缘下方
      group.add(lsp);
      labelMats.push(lmat);
    }
    bridge.scene.add(group);
    buildCompass();
  }

  /* ---------------- 银河罗盘 (P4) ---------------- */
  function paintGalaxyMap() {                     // 静态底图: 只画一次(DPR 适配, 清晰版)
    var DPR = Math.min((window.devicePixelRatio || 1), 2);
    var cv = document.createElement('canvas');
    cv.width = cv.height = Math.round(MAP * DPR);
    var ctx = cv.getContext('2d');
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var cx = MAP / 2, px = (MAP * 0.46) / GAL_LY;
    var rng = mulberry32(20260711);
    softDot(ctx, cx, cx, GAL_LY * px, '96,116,178', 0.14);           // 盘面淡辉
    // 外缘参考圈
    ctx.strokeStyle = 'rgba(150,175,225,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cx, GAL_LY * 0.97 * px, 0, 6.2832); ctx.stroke();
    var k = 0.30, r0 = 3600;
    for (var a = 0; a < 4; a++) {                                    // 4 条对数螺旋臂
      var ph = a * Math.PI / 2 + 0.3;
      // 臂脊连续曲线(两遍: 宽淡 + 窄亮)
      for (var pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        var first = true;
        for (var t = 0.25; t < 9.6; t += 0.06) {
          var r = r0 * Math.exp(k * t);
          if (r > GAL_LY * 0.95) break;
          var x = cx + Math.cos(t + ph) * r * px;
          var y = cx + Math.sin(t + ph) * r * px;
          if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = pass ? 'rgba(196,214,255,0.30)' : 'rgba(140,165,235,0.16)';
        ctx.lineWidth = pass ? 1.1 : 3.4;
        ctx.stroke();
      }
      // 臂上恒星颗粒(紧贴脊线, 小而实)
      for (var t2 = 0.25; t2 < 9.6; t2 += 0.028) {
        var r2 = r0 * Math.exp(k * t2);
        if (r2 > GAL_LY * 0.95) break;
        var jr = gauss(rng) * (420 + r2 * 0.035);
        var x2 = cx + (Math.cos(t2 + ph) * r2 + gauss(rng) * (420 + r2 * 0.035)) * px;
        var y2 = cx + (Math.sin(t2 + ph) * r2 + jr) * px;
        var al = 0.5 * (1 - r2 / GAL_LY) + 0.1;
        ctx.fillStyle = 'rgba(210,224,255,' + (al * (0.5 + rng() * 0.5)).toFixed(3) + ')';
        ctx.fillRect(x2, y2, rng() < 0.2 ? 1.4 : 0.9, rng() < 0.2 ? 1.4 : 0.9);
        if (rng() < 0.045) {                                          // HII 区点缀
          ctx.fillStyle = 'rgba(255,170,190,' + (al * 0.8).toFixed(3) + ')';
          ctx.fillRect(x2, y2, 1.6, 1.6);
        }
      }
    }
    ctx.save();                                                      // 中心棒 + 核球(分层)
    ctx.translate(cx, cx); ctx.rotate(0.5); ctx.scale(1, 0.42);
    softDot(ctx, 0, 0, 8600 * px, '255,210,150', 0.5);
    ctx.restore();
    softDot(ctx, cx, cx, 5600 * px, '255,232,196', 0.8);
    softDot(ctx, cx, cx, 2600 * px, '255,246,226', 0.95);
    // 太阳改为动态绘制(深时下沿轨道真实前进 —— 2.3 亿年/圈, ±5 万年仅 0.078°)
    return cv;
  }

  function buildCompass() {
    var root = document.createElement('div');
    root.id = 'dsCompass';
    root.style.cssText =
      'position:fixed;left:16px;bottom:16px;z-index:9;display:none;opacity:0;' +
      'transition:opacity .6s ease;pointer-events:none;padding:10px 12px 8px;' +
      'border-radius:12px;background:rgba(10,16,32,0.55);' +
      'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);' +
      'border:1px solid rgba(140,170,220,0.22);box-shadow:0 4px 18px rgba(0,0,0,0.4);' +
      'font:12px/1.5 "Microsoft YaHei",system-ui,sans-serif;color:#b8c8e8;text-align:center;';
    var title = document.createElement('div');
    title.textContent = '银河系 · 你在这里';
    title.style.cssText = 'font-size:13px;letter-spacing:1px;color:#dce8ff;margin-bottom:6px;';
    var cnv = document.createElement('canvas');
    var DPR2 = Math.min((window.devicePixelRatio || 1), 2);
    cnv.width = cnv.height = Math.round(MAP * DPR2);
    cnv.style.cssText = 'display:block;width:' + MAP + 'px;height:' + MAP + 'px;';
    var sub = document.createElement('div');
    sub.textContent = '银心 ← 人马座方向';
    sub.style.cssText = 'font-size:10px;color:#8ea6cc;margin-top:4px;';
    var foot = document.createElement('div');
    foot.textContent = '太阳绕银心 ~230 km/s · 2.3 亿年/圈';
    foot.style.cssText = 'font-size:10px;color:#7288ad;margin-top:2px;';
    root.appendChild(title); root.appendChild(cnv);
    root.appendChild(sub); root.appendChild(foot);
    (document.body || document.documentElement).appendChild(root);
    var cctx = cnv.getContext('2d');
    cctx.setTransform(DPR2, 0, 0, DPR2, 0, 0);
    compass = {
      root: root, cnv: cnv, ctx: cctx, foot: foot,
      base: paintGalaxyMap(), lastRot: 1e9, lastTheta: 0, hideTimer: null
    };
  }

  function redrawCompass(rot, dTheta) {
    dTheta = dTheta || 0;
    var c = compass, ctx = c.ctx, cx = MAP / 2;
    var px = (MAP * 0.46) / GAL_LY;
    ctx.clearRect(0, 0, MAP, MAP);
    ctx.save();
    ctx.translate(cx, cx); ctx.rotate(rot);
    ctx.drawImage(c.base, -cx, -cx, MAP, MAP);
    ctx.restore();
    // "画面正前方" 固定朝上: 顶端小三角指示
    ctx.fillStyle = 'rgba(184,200,232,0.75)';
    ctx.beginPath();
    ctx.moveTo(cx, 3); ctx.lineTo(cx - 4, 11); ctx.lineTo(cx + 4, 11);
    ctx.closePath(); ctx.fill();
    // 太阳: 银河系坐标随图旋转 + 深时轨道角前进
    var rSun = SUN_LY * px;
    var aSun = rot + dTheta;
    var sx = cx - Math.sin(aSun) * rSun, sy = cx + Math.cos(aSun) * rSun;
    softDot(ctx, sx, sy, 7, '255,217,138', 0.55);
    ctx.strokeStyle = 'rgba(255,217,138,0.95)';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(sx, sy, 4.8, 0, 6.2832); ctx.stroke();
    ctx.fillStyle = '#ffe1a0';
    ctx.beginPath(); ctx.arc(sx, sy, 2.2, 0, 6.2832); ctx.fill();
    ctx.font = '600 10px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 2.6; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineJoin = 'round';
    ctx.strokeText('太阳系', Math.min(MAP - 40, Math.max(3, sx + 8)), Math.min(MAP - 8, Math.max(10, sy - 8)));
    ctx.fillStyle = '#ffd98a';
    var tx = Math.min(MAP - 40, Math.max(3, sx + 8));
    var ty = Math.min(MAP - 8, Math.max(10, sy - 8));
    ctx.fillText('太阳系', tx, ty);
  }

  function updateCompass(b) {
    var c = compass;
    if (!c) return;
    if (b > 0.5) {
      if (c.hideTimer) { clearTimeout(c.hideTimer); c.hideTimer = null; }
      if (c.root.style.display === 'none') {
        c.root.style.display = 'block';       // 本帧仅挂出(opacity 仍 0)
        c.lastRot = 1e9;                      // 强制首帧重绘
      } else {
        c.root.style.opacity = '1';           // 次帧渐显, 让 CSS 过渡生效
      }
    } else {
      if (c.root.style.display !== 'none') {
        c.root.style.opacity = '0';
        if (!c.hideTimer) {
          c.hideTimer = setTimeout(function () {
            c.root.style.display = 'none'; c.hideTimer = null;
          }, 650);
        }
      }
      return;
    }
    var cam = bridge.camera();
    if (!cam || !cam.getWorldDirection) return;
    cam.getWorldDirection(tmpV);
    var azCam = Math.atan2(tmpV.y, tmpV.x);   // 相机前向在黄道面(xy)的方位角
    var rot = azCam - azGal;                  // 底图太阳→银心朝上, 旋 rot 后正前方朝上
    var dd = Math.abs(rot - c.lastRot);
    if (dd > Math.PI) dd = Math.abs(dd - 2 * Math.PI);
    var yr = 0;
    try { yr = +bridge.yr() || 0; } catch (e) { yr = 0; }
    var dTheta = yr / 2.3e8 * 6.2832;         // 真实轨道角(±5 万年 ≈ 0.078°, 原理性前进)
    var moved = Math.abs(dTheta - (c.lastTheta || 0)) > 5e-6;
    if (!(dd > 0.008727) && !moved) { updateMotionText(yr); return; }
    c.lastRot = rot;
    c.lastTheta = dTheta;
    redrawCompass(rot, dTheta);
    updateMotionText(yr);
  }
  var lastYrTxt = null;
  function updateMotionText(yr) {
    if (!compass || !compass.foot) return;
    var key = Math.round(yr / 100);
    if (key === lastYrTxt) return;
    lastYrTxt = key;
    if (Math.abs(yr) < 300) {
      compass.foot.textContent = '太阳绕银心 ~230 km/s · 2.3 亿年/圈';
    } else {
      var ly = Math.abs(yr) * 7.67e-4;   // 230 km/s → 光年
      compass.foot.textContent = '深时 ' + (yr > 0 ? '+' : '−') + Math.round(Math.abs(yr)).toLocaleString() +
        ' 年 · 太阳沿银河轨道走了 ' + (ly < 10 ? ly.toFixed(2) : ly.toFixed(1)) + ' 光年(一圈 2.3 亿年)';
    }
  }

  /* ---------------- 每帧更新 ---------------- */
  var warm = 6;                                // 预热: 载入后以 0 透明度渲染数帧, 贴图/着色器提前上卡(消除首次进星际的卡顿)
  function update(dt) {
    var b = +bridge.blend(), d = +bridge.skyDim();
    if (!(b >= 0)) b = 0;
    if (!(d >= 0)) d = 0;
    if (d < 0.05) {                            // 黑寂: 直接全隐
      cur = 0;
      group.visible = false;
    } else {
      var target = (b > 0.3 ? Math.min((b - 0.3) / 0.4, 1) : 0) * Math.min(d, 1) * 0.9;
      cur += (target - cur) * Math.min(1, dt * 3.5);
      if (Math.abs(cur - target) < 0.003) cur = target;
      var vis = cur > 0.004;
      group.visible = vis || warm > 0;
      if (warm > 0) warm--;
      if (vis) {
        for (var i = 0; i < mats.length; i++) mats[i].opacity = cur;
        var lo = cur * 0.85;
        for (var j = 0; j < labelMats.length; j++) labelMats[j].opacity = lo;
      }
    }
    updateCompass(b);
  }

  function tick(dt) {
    if (dead) return;
    if (!built) {
      if (!window.__dsBridge) return;          // 桥未就绪: 静默等待
      try {
        build();
        if (group && group.traverse) {
          group.traverse(function (o2) { o2.frustumCulled = false; });   // 屏幕恒定尺寸精灵按中心点剔除会整团闪现/消失
        }
        built = true;
      } catch (e) {
        dead = true;
        try { console.warn('[deepsky] 初始化失败, 模块已禁用:', e); } catch (_) {}
        return;
      }
    }
    try {
      update(+dt > 0 ? +dt : 0.016);
    } catch (e) {
      dead = true;
      try {
        if (group) group.visible = false;
        if (compass && compass.root) compass.root.style.display = 'none';
        console.warn('[deepsky] 运行异常, 模块已禁用:', e);
      } catch (_) {}
    }
  }

  window.__DEEPSKY = {
    tick: tick,
    count: (window.DEEPSKY || []).length
  };
})();
