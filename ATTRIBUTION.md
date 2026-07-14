# 素材来源与授权

本项目代码采用 MIT（见 LICENSE）。以下第三方素材与库不适用 MIT，各自保留原始授权条款。
使用、修改或再分发本项目时，必须一并遵守下列条款。

贴图以 base64 data URI 内嵌于 `assets_textures.js`，目的是让 `file://` 协议下双击即可离线运行
（规避浏览器对 `file://` 图片的跨域限制）。内嵌不改变其授权性质。

## NASA（公有领域）

可自由使用，无需授权。

- 地球日面：NASA Visible Earth, Blue Marble
  https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_2048.jpg
- 地球云层：NASA Visible Earth, cloud map
  https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg
- 地球夜面：NASA Earth Observatory, Black Marble
  https://eoimages.gsfc.nasa.gov/images/imagerecords/79000/79765/dnb_land_ocean_ice.2012.3600x1800.jpg
- 全天星图：NASA SVS, Tycho Sky Map
  https://svs.gsfc.nasa.gov/vis/a000000/a003500/a003572/TychoSkymapII.t5_16384x08192.jpg

## Solar System Scope（CC BY 4.0）

太阳、木星、土星、土星环、天王星、海王星贴图。

https://www.solarsystemscope.com/textures/

CC BY 4.0：允许再分发与商用，但必须署名。https://creativecommons.org/licenses/by/4.0/

## Planet Pixel Emporium — James Hastings-Trew（需署名，禁止单独转售贴图）

水星、金星、火星贴图（含凹凸图）。

https://planetpixelemporium.com/planets.html

原作者条款：可自由用于个人与项目用途，需署名；不得将贴图本身单独转售或作为素材产品再分发。
本仓库的 MIT 许可不覆盖这些贴图——你可以在自己的项目中使用它们，但不能把它们当作可转售的素材包分发。

上述行星贴图集合经由开源项目 KyleGough/solar-system（MIT）整理获取，原始出处如上。

## 轨道与天体数据

- 行星、彗星、小行星轨道根数：JPL HORIZONS、JPL Small-Body Database
- 月面地形与贴图：Lunar Reconnaissance Orbiter (LRO)

NASA/JPL 数据为公有领域。

## 第三方库

- three.js（`vendor/three-bundle.min.js`）— MIT
  https://github.com/mrdoob/three.js
