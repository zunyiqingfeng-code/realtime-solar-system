/* 零依赖 GLB 解析器(离线原则, 自写)
 * 支持: 标准 f32 属性 + 本项目重打包的量化格式(extras.deq 位置/UV 反量化, extras.n8 法线 int8)
 * 不支持: Draco / KTX2 / 蒙皮 / 动画(本项目用不到)
 * parseGLBCore(bytes) → { json, bin, attr(i), indices(i) }   纯数据层, node 可测
 * buildGLBGroup(core, THREE) → { group, parts }               渲染层, 按 extras.part 分组
 */
(function () {
  "use strict";

  function b64ToBytes(b64) {
    if (typeof atob === "function") {
      const s = atob(b64);
      const out = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i);
      return out;
    }
    throw new Error("no atob");
  }

  function parseGLBCore(input) {
    const bytes = typeof input === "string" ? b64ToBytes(input) : new Uint8Array(input.buffer || input, input.byteOffset || 0, input.byteLength !== undefined ? input.byteLength : undefined);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("非 GLB");
    const jlen = dv.getUint32(12, true);
    let jsonText = "";
    const jStart = 20;
    // UTF-8 解码(避免依赖 TextDecoder 的桩环境问题: 手写)
    if (typeof TextDecoder !== "undefined") {
      jsonText = new TextDecoder().decode(bytes.subarray(jStart, jStart + jlen));
    } else {
      const chunk = [];
      for (let i = jStart; i < jStart + jlen; i += 1) chunk.push(String.fromCharCode(bytes[i]));
      jsonText = decodeURIComponent(escape(chunk.join("")));
    }
    const json = JSON.parse(jsonText);
    const bOff = jStart + jlen;
    const blen = dv.getUint32(bOff, true);
    const bin = bytes.subarray(bOff + 8, bOff + 8 + blen);
    const DT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
    const NCOMP = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
    function rawAcc(i) {
      const a = json.accessors[i];
      const v = json.bufferViews[a.bufferView];
      const off = (v.byteOffset || 0) + (a.byteOffset || 0);
      const n = a.count * NCOMP[a.type];
      const T = DT[a.componentType];
      // bin 可能非对齐: 拷贝一份保证 TypedArray 构造安全
      const slice = bin.slice(off, off + n * T.BYTES_PER_ELEMENT);
      return { arr: new T(slice.buffer), a };
    }
    function attr(i) {   // 位置/法线/UV → Float32Array(已反量化)
      const { arr, a } = rawAcc(i);
      const nc = NCOMP[a.type];
      const ex = a.extras || {};
      if (ex.deq) {
        const mn = ex.deq.slice(0, nc), sc = ex.deq.slice(nc);
        const out = new Float32Array(arr.length);
        for (let k = 0; k < arr.length; k += 1) {
          const c = k % nc;
          out[k] = mn[c] + (arr[k] / 65535) * sc[c];
        }
        return out;
      }
      if (ex.n8) {
        const out = new Float32Array(arr.length);
        for (let k = 0; k < arr.length; k += 1) out[k] = arr[k] / 127;
        return out;
      }
      if (arr instanceof Float32Array) return arr;
      return Float32Array.from(arr);
    }
    function indices(i) {
      const { arr } = rawAcc(i);
      return arr;
    }
    return { json, bin, attr, indices };
  }

  function buildGLBGroup(core, THREE) {
    const J = core.json;
    const group = new THREE.Group();
    const parts = {};
    const matCache = {};
    const texCache = {};
    function getTexture(ti) {
      if (ti in texCache) return texCache[ti];
      let tex = null;
      try {
        const img = J.images[J.textures[ti].source];
        const v = J.bufferViews[img.bufferView];
        const data = core.bin.slice(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
        if (typeof Blob !== "undefined" && typeof URL !== "undefined" && typeof Image !== "undefined") {
          const url = URL.createObjectURL(new Blob([data], { type: img.mimeType || "image/png" }));
          tex = new THREE.Texture();
          const el = new Image();
          el.onload = () => { tex.image = el; tex.needsUpdate = true; URL.revokeObjectURL(url); };
          el.src = url;
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.flipY = false;   // glTF UV 约定
        }
      } catch (e) { tex = null; }
      texCache[ti] = tex;
      return tex;
    }
    function getMat(mi) {
      if (mi === undefined || mi === null) mi = -1;
      if (mi in matCache) return matCache[mi];
      let m;
      if (mi < 0) {
        m = new THREE.MeshStandardMaterial({ color: 0xbfc4cc, roughness: 0.6, metalness: 0.2 });
      } else {
        const src = J.materials[mi];
        const pbr = src.pbrMetallicRoughness || {};
        const bc = pbr.baseColorFactor || [1, 1, 1, 1];
        m = new THREE.MeshStandardMaterial({
          color: new THREE.Color(bc[0], bc[1], bc[2]),
          roughness: pbr.roughnessFactor !== undefined ? pbr.roughnessFactor : 0.6,
          metalness: pbr.metallicFactor !== undefined ? pbr.metallicFactor : 0.2,
          side: src.doubleSided ? THREE.DoubleSide : THREE.FrontSide
        });
        if (bc[3] !== undefined && bc[3] < 1) { m.transparent = true; m.opacity = bc[3]; }
        if (src.emissiveFactor) m.emissive = new THREE.Color(...src.emissiveFactor);
        if (pbr.baseColorTexture) {
          const t = getTexture(pbr.baseColorTexture.index);
          if (t) m.map = t;
        }
      }
      matCache[mi] = m;
      return m;
    }
    for (const node of J.nodes) {
      if (node.mesh === undefined) continue;
      const part = (node.extras && node.extras.part) || "all";
      if (!parts[part]) {
        parts[part] = new THREE.Group();
        parts[part].name = part;
        group.add(parts[part]);
      }
      const mdef = J.meshes[node.mesh];
      for (const p of mdef.primitives) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(core.attr(p.attributes.POSITION), 3));
        if (p.attributes.NORMAL !== undefined) geo.setAttribute("normal", new THREE.BufferAttribute(core.attr(p.attributes.NORMAL), 3));
        if (p.attributes.TEXCOORD_0 !== undefined) geo.setAttribute("uv", new THREE.BufferAttribute(core.attr(p.attributes.TEXCOORD_0), 2));
        if (p.indices !== undefined) geo.setIndex(new THREE.BufferAttribute(core.indices(p.indices), 1));
        const mesh = new THREE.Mesh(geo, getMat(p.material));
        if (node.matrix) {
          mesh.matrix.fromArray(node.matrix);
          mesh.matrixAutoUpdate = false;
        }
        mesh.frustumCulled = false;   // 剧场近景大物体, 免剔除抖动
        parts[part].add(mesh);
      }
    }
    return { group, parts };
  }

  if (typeof window !== "undefined") {
    window.parseGLBCore = parseGLBCore;
    window.buildGLBGroup = buildGLBGroup;
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { parseGLBCore, buildGLBGroup };
})();
