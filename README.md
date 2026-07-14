# 实时太阳系

浏览器里跑的实时太阳系。真实历表驱动的行星轨道、月球车驾驶、地面观星、火箭发射场。

纯前端：零依赖、零构建、零后端。所有资产内嵌，断网可用，双击就跑。

## 四个页面

| 页面 | 内容 |
| --- | --- |
| `index.html` | 太阳系主视图：行星与卫星轨道、彗星、小行星带、深空天体、航天器轨迹、天象事件 |
| `moon.html` | 月球车：在真实月面地形数据还原的着陆区上驾驶 |
| `sky.html` | 地面观星：从地表任意位置、任意时刻看天 |
| `launch_site.html` | 火箭发射场：GLB 单文件场景预览 |

## 运行

双击 `index.html` 即可。`file://` 协议下所有功能正常，没有任何跨域资源加载。

想体验 PWA（离线缓存 + 安装成桌面/手机应用），起一个本地服务器：

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000
```

Service Worker 只在 `http(s)` 和 `localhost` 下注册——浏览器安全策略不允许 `file://` 页面注册 SW。这不是故障，页面功能不受影响。

## 部署

任何静态托管都能直接放：把仓库内容传到站点根目录即可。

GitHub Pages：Settings → Pages → Source 选 Deploy from a branch，分支 `main`，目录 `/ (root)`。

自建服务器建议开 gzip（js/html/json），首访传输量从约 41MB 降到约 12MB；HTML 设 `no-cache`，js/png 设 `max-age=86400`。HTTPS 是硬性要求，否则 Service Worker 和 PWA 安装不生效。

## 更新缓存

Service Worker 全量预缓存 25 项资产，采用缓存优先 + 后台静默更新。改动任何资产后发新版，必须同步修改 `sw.js` 顶部的版本号：

```js
const VER = "v27-1";   // 改成 v27-2、v27-3……
```

否则访客拿到的仍是旧缓存。新 SW 会在 activate 阶段清除旧版本缓存，刷新一次即得新版。

## 数据来源

- 行星、彗星、小行星轨道根数：JPL HORIZONS 与 JPL SBDB
- 全天星图：NASA SVS Tycho Sky Map
- 月面地形与贴图：LRO
- 3D 渲染：three.js（MIT）

## 许可

代码采用 MIT，见 [LICENSE](LICENSE)。

内嵌贴图不适用 MIT，各自保留原始授权（NASA 公有领域 / CC BY 4.0 / 需署名的第三方素材），详见 [ATTRIBUTION.md](ATTRIBUTION.md)。使用本项目时请一并遵守这些素材的原始条款。
