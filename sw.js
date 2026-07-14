/* =========================================================================
 * 实时太阳系 · Service Worker
 * 策略:install 全量预缓存 → fetch 缓存优先 + 后台静默更新(stale-while-revalidate)
 * 更新方式:每次发布只需改动下方 VER 版本号,旧缓存会在 activate 阶段自动清除。
 * 离线原则:仅处理同源请求,不涉及任何外部 URL。
 * ========================================================================= */
"use strict";

const VER = "v27-1";                    // ← 发布新版本时,改这里
const CACHE_PREFIX = "rt-solar-";
const CACHE_NAME = CACHE_PREFIX + VER;

/* 预缓存清单:web/ 下全部运行所需资产(真实文件写死)。
 * 排除项:export/(Blender 导出物,运行时未引用)、stage5_browser_screenshot.png(开发截图)。
 * 注意:asteroids_real.js / visitors_data.js 由并行任务生成,可能暂缺——
 *       install 采用单项容错,个别文件抓取失败不会阻塞整体安装。 */
const PRECACHE = [
  // —— 页面 ——
  "./",
  "./index.html",
  "./moon.html",
  "./sky.html",
  "./launch_site.html",
  // —— 脚本 ——
  "./app.js",
  "./assets_textures.js",
  "./asteroids_real.js",
  "./constellations.js",
  "./deepsky.js",
  "./deepsky_data.js",
  "./exoplanets.js",
  "./moon.js",
  "./sky.js",
  "./solar_system_data.js",
  "./spacecraft_data.js",
  "./star_catalog.js",
  "./star_names.js",
  "./star_rv.js",
  "./visitors_data.js",
  "./vendor/three-bundle.min.js",
  // —— 清单与图像 ——
  "./manifest.json",
  "./og.png",
  "./icon-192.png",
  "./icon-512.png"
];

/* ---------- install:逐项预缓存,单项失败容错 ---------- */
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(PRECACHE.map(async (url) => {
      try {
        // cache: "no-cache" 绕过 HTTP 缓存,确保拿到当前线上版本
        const resp = await fetch(new Request(url, { cache: "no-cache" }));
        if (resp && resp.ok) {
          await cache.put(url, resp);
        }
      } catch (err) {
        // 单项容错:如 asteroids_real.js 尚未生成时 404/失败,不阻塞其余资产
      }
    }));
    await self.skipWaiting();
  })());
});

/* ---------- activate:清理旧版本缓存 ---------- */
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

/* ---------- fetch:缓存优先,命中后后台静默更新 ---------- */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 离线原则:只接管同源请求

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req, { ignoreSearch: req.mode === "navigate" });

    // 后台更新:成功则写回缓存,失败静默(离线时属正常)
    const refresh = fetch(req).then((resp) => {
      if (resp && resp.ok && resp.type === "basic") {
        cache.put(req, resp.clone()).catch(() => {});
      }
      return resp;
    }).catch(() => undefined);

    if (cached) {
      refresh.catch(() => {});   // 不等待,静默后台刷新
      return cached;
    }

    const fresh = await refresh;
    if (fresh) return fresh;

    // 离线兜底:页面导航回退到主页
    if (req.mode === "navigate") {
      const home = await cache.match("./index.html");
      if (home) return home;
    }
    return new Response("离线且未缓存该资源", {
      status: 503,
      statusText: "Offline",
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  })());
});
