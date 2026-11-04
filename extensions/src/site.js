// 官网地址 / 扩展 ID / 安装入口的唯一来源。
//
// 网页以经典脚本加载：<script src="extensions/src/site.js"></script>
// 扩展侧通过 `import "./site.js"` 的副作用加载；两边都读 globalThis.EXTE_SITE。
//
// 注意：manifest.json 无法引用 JS，origin 改动必须同步
//       externally_connectable.matches（当前为 https://shui-tiao.github.io/exte-se/*）。
// TODO(发布后): 填写扩展 ID。为空时官网按“未安装扩展”处理。
// TODO(发布前): 填写扩展安装入口（商店或 Releases）。
"use strict";

(() => {
  globalThis.EXTE_SITE = Object.freeze({
    // GitHub Pages 发布的官网根地址；生成链接时拼接 /#exte?…，故末尾不带斜杠。
    origin: "https://shui-tiao.github.io/exte-se",
    uzantiKimlik: "",
    kurulum: "",
  });
})();
