// 页面自重构特效 —— 改编自 https://github.com/DhvanilPatel/swarm-cursors
// （其动作设计来自 Joel Califa 的 Swarm 站点）。
// 这里只保留“无光标”的构建过程：选框描边、尺寸徽标、文字揭示、整体淡入。
// 节奏为原版 2×，页面本身结构、样式与交互完全不变。
"use strict";

(() => {
  const HIZ = 2; // 2× 速度
  const ADIM = 110 / HIZ; // 相邻元素起手间隔
  const CIZGI = 160 / HIZ; // 选框描边
  const DOLDUR = 100 / HIZ; // 色块填充
  const METIN = 220 / HIZ; // 文字揭示基准
  const SON_BEKLE = 380 / HIZ; // 收尾停顿

  const MAVI = "#0d99ff";

  const stil = `
#swarm-rebuild{position:fixed;inset:0;z-index:9999;overflow:hidden;pointer-events:none;background-repeat:repeat}
#swarm-rebuild>.shell{height:100svh}
#swarm-rebuild .sb{position:absolute;pointer-events:none;will-change:opacity}
#swarm-rebuild .sb-l{position:absolute;background:${MAVI}}
#swarm-rebuild .sb-u{position:absolute;height:1.5px;background:${MAVI};transform-origin:left center}
#swarm-rebuild .sb-h{position:absolute;width:7px;height:7px;background:#fff;border:1px solid ${MAVI};box-sizing:border-box}
#swarm-rebuild .sb-b{position:absolute;transform:translateX(-50%);background:${MAVI};color:#fff;
  font:600 10px/15px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;padding:1px 5px;border-radius:2px;
  white-space:nowrap;font-variant-numeric:tabular-nums}
`;

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const kabuk = document.querySelector(".shell");
  if (!kabuk) return;

  const basla = () => {
    if (document.getElementById("swarm-rebuild")) return;
    try {
      kur();
    } catch {
      // 特效失败绝不影响页面本身
      document.getElementById("swarm-rebuild")?.remove();
      kabuk.inert = false;
    }
  };

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => requestAnimationFrame(basla));
  } else {
    requestAnimationFrame(basla);
  }

  function kur() {
    const kat = document.createElement("div");
    kat.id = "swarm-rebuild";
    kat.setAttribute("aria-hidden", "true");

    const s = document.createElement("style");
    s.textContent = stil;
    kat.appendChild(s);

    // 与 body 相同的底色，遮住下面的真实页面
    const g = getComputedStyle(document.body);
    kat.style.backgroundColor = g.backgroundColor;
    kat.style.backgroundImage = g.backgroundImage;
    kat.style.backgroundSize = g.backgroundSize;

    const kopya = kabuk.cloneNode(true);
    kopya.removeAttribute("id");
    kopya.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    kopya.setAttribute("aria-hidden", "true");
    kopya.inert = true;
    kat.appendChild(kopya);

    kabuk.inert = true; // 遮挡期间不响应键盘与指针
    document.body.appendChild(kat);

    const hedefler = topla(kopya);
    for (const t of hedefler) t.el.style.opacity = "0";

    let enSon = 0;
    hedefler.forEach((t, i) => {
      const gecikme = i * ADIM;
      enSon = Math.max(enSon, gecikme + 520);
      setTimeout(() => sahne(t, kat), gecikme);
    });

    setTimeout(() => kapat(kat), enSon + SON_BEKLE);
  }

  function kapat(kat) {
    kabuk.inert = false;
    kat.querySelectorAll(".sb").forEach((n) => n.remove());
    const anim = kat.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease", fill: "both" });
    anim.onfinish = () => kat.remove();
  }

  /** 收集需要“构建”的元素：有底色/边框/阴影的块，或直接承载文字的元素。 */
  function topla(kok) {
    const liste = [];
    const gez = (el) => {
      if (el.namespaceURI !== "http://www.w3.org/1999/xhtml") return; // 跳过内联 SVG 子树
      if (el.hasAttribute("hidden")) return;
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden") return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      let metin = false;
      for (const n of el.childNodes) {
        if (n.nodeType === 3 && n.textContent.trim() !== "") {
          metin = true;
          break;
        }
      }
      const kutu = kutuMu(st);
      if (metin || kutu) liste.push({ el, r, metin, kutu, st, sira: liste.length });
      for (const c of el.children) gez(c);
    };
    for (const c of kok.children) gez(c);

    liste.sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left || a.sira - b.sira);
    return liste;
  }

  function kutuMu(st) {
    const bg = st.backgroundColor;
    if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") return true;
    for (const k of ["Top", "Right", "Bottom", "Left"]) {
      const w = parseFloat(st[`border${k}Width`]) || 0;
      if (w > 0 && st[`border${k}Style`] !== "none" && st[`border${k}Color`] !== "rgba(0, 0, 0, 0)") return true;
    }
    return st.boxShadow !== "none";
  }

  function sahne(t, kat) {
    const { el, r, metin, kutu, st } = t;
    const sadeceMetin = metin && !kutu;
    const satirIci = st.display.startsWith("inline");
    const buyuk = (parseFloat(st.fontSize) || 0) >= 28;
    const w = r.width;
    const h = r.height;

    const sb = document.createElement("div");
    sb.className = "sb";
    sb.style.left = r.left + "px";
    sb.style.top = r.top + "px";
    sb.style.width = w + "px";
    sb.style.height = h + "px";
    kat.appendChild(sb);

    const cizgi = (css, kareler, gecikme) => {
      const d = document.createElement("div");
      d.className = "sb-l";
      Object.assign(d.style, css);
      sb.appendChild(d);
      d.animate(kareler, {
        duration: Math.max(40, CIZGI),
        easing: "cubic-bezier(.2,.8,.2,1)",
        delay: gecikme,
        fill: "both",
      });
    };

    let sure;
    if (sadeceMetin) {
      // 文字：只画一条基线扫过，像在“落笔”
      const u = document.createElement("div");
      u.className = "sb-u";
      u.style.left = "0px";
      u.style.top = Math.max(0, h - 2) + "px";
      u.style.width = w + "px";
      sb.appendChild(u);
      u.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
        duration: CIZGI,
        easing: "cubic-bezier(.2,.8,.2,1)",
        fill: "both",
      });
      sure = CIZGI;
    } else {
      // 色块/边框：四边依次拉出选框
      const ince = "1.5px";
      cizgi(
        { left: "0px", top: "0px", width: w + "px", height: ince, transformOrigin: "left center" },
        [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
        0,
      );
      cizgi(
        { left: "0px", top: Math.max(0, h - 1.5) + "px", width: w + "px", height: ince, transformOrigin: "right center" },
        [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
        CIZGI * 0.24,
      );
      cizgi(
        { left: "0px", top: "0px", width: ince, height: h + "px", transformOrigin: "top center" },
        [{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }],
        CIZGI * 0.12,
      );
      cizgi(
        { left: Math.max(0, w - 1.5) + "px", top: "0px", width: ince, height: h + "px", transformOrigin: "bottom center" },
        [{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }],
        CIZGI * 0.36,
      );
      sure = CIZGI;

      if (w >= 24 && h >= 18) {
        for (const [hx, hy] of [[0, 0], [w, 0], [0, h], [w, h]]) {
          const n = document.createElement("div");
          n.className = "sb-h";
          n.style.left = hx - 3.5 + "px";
          n.style.top = hy - 3.5 + "px";
          sb.appendChild(n);
          n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: CIZGI * 0.5, delay: CIZGI * 0.7, fill: "both" });
        }
      }
    }

    // 尺寸徽标
    if ((!sadeceMetin && w >= 34 && h >= 14) || (sadeceMetin && buyuk && !satirIci)) {
      const b = document.createElement("div");
      b.className = "sb-b";
      b.textContent = `${Math.round(w)} × ${Math.round(h)}`;
      b.style.left = "50%";
      b.style.top = h + 6 + "px";
      sb.appendChild(b);
      b.animate(
        [
          { opacity: 0, transform: "translateX(-50%) translateY(-3px)" },
          { opacity: 1, transform: "translateX(-50%) translateY(0)" },
        ],
        { duration: CIZGI * 0.5, delay: CIZGI * 0.55, fill: "both" },
      );
    }

    // 元素自身的浮现
    const gec = sure * 0.45;
    if (sadeceMetin && !satirIci) {
      el.style.transition = "none";
      el.style.clipPath = "inset(0 100% 0 0)";
      el.style.opacity = "1";
      const karakter = (el.textContent || "").trim().length || 6;
      const ms = Math.min(METIN * 2.2, METIN * 0.5 + karakter * (5 / HIZ));
      setTimeout(() => {
        el.style.transition = `clip-path ${ms}ms cubic-bezier(.25,.8,.25,1)`;
        el.style.clipPath = "inset(0 0 0 0)";
      }, gec);
      sure = Math.max(sure, gec + ms);
    } else if (sadeceMetin) {
      el.style.transition = `opacity ${METIN}ms ease`;
      el.style.opacity = "1";
      sure = Math.max(sure, gec + METIN);
    } else {
      el.style.transition = `opacity ${DOLDUR}ms ease`;
      setTimeout(() => {
        el.style.opacity = "1";
      }, gec);
      sure = Math.max(sure, gec + DOLDUR);
    }

    // 选框淡出
    const omur = sure + 110;
    setTimeout(() => {
      const a = sb.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: "ease", fill: "both" });
      a.onfinish = () => sb.remove();
    }, omur);

    return omur + 110;
  }
})();
