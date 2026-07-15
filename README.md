<p align="center">
  <img src="docs/screenshots/hero-banner.jpg" width="460" alt="实时太阳系">
</p>

# 实时太阳系

浏览器里跑的实时太阳系。真实历表驱动的行星轨道、月球车驾驶、地面观星、火箭发射场。

纯前端：零依赖、零构建、零后端。所有资产内嵌，断网可用，双击就跑。

在线体验：https://zunyiqingfeng-code.github.io/realtime-solar-system/

## 四个页面

| 页面 | 内容 |
| --- | --- |
| `index.html` | 太阳系主视图：行星与卫星轨道、彗星、小行星带、深空天体、航天器轨迹、天象事件 |
| `moon.html` | 月球车：在真实月面地形数据还原的着陆区上驾驶 |
| `sky.html` | 地面观星：从地表任意位置、任意时刻看天 |
| `launch_site.html` | 火箭发射场：GLB 单文件场景预览 |

## 预览

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/01-solar-overview.jpg" alt="太阳系全景"><br><sub><b>太阳系全景</b> · J2000 历表驱动的开普勒轨道，行星 / 卫星 / 彗星 / 小行星带 / 航天器同框</sub></td>
    <td width="50%"><img src="docs/screenshots/02-nearby-stars.jpg" alt="邻近恒星"><br><sub><b>邻近恒星</b> · 悬停查看光行时与实际距离，如南门二「此刻看到的光出发于 4.3 年前」</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/03-earth-sun-closeup.jpg" alt="日地特写"><br><sub><b>观感尺度</b> · 日、地、月、水、金同框特写，一键在真实尺度与观感尺度间切换</sub></td>
    <td><img src="docs/screenshots/04-magnetosphere.jpg" alt="地球磁层"><br><sub><b>磁层剧场</b> · 太阳风 vs 地球磁场，Shue 经验模型实时成形，可播放 CME 风暴</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/05-astro-calendar.jpg" alt="天象日历"><br><sub><b>天象日历</b> · 1900–2100 的日食 / 月食 / 流星雨 / 合冲，可导出 .ics</sub></td>
    <td><img src="docs/screenshots/06-photography-mode.jpg" alt="摄影模式"><br><sub><b>摄影模式</b> · 隐藏 UI 的干净画面，快门存图</sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/07-ground-sky.jpg" alt="地面观星"><br><sub><b>地面观星</b> · 站在地表任意经纬度、任意时刻的天文馆视角，含星座连线与大气折射</sub></td>
    <td><img src="docs/screenshots/08-deep-time.jpg" alt="深时星际"><br><sub><b>深时 · 星际</b> · 恒星按真实自行漂移，滚轮拉远看太阳缩成群星中的一颗黄矮星</sub></td>
  </tr>
</table>

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
