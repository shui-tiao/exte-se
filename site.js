// 官网脚本 — 营销页 toast + 配置链接导入落地视图。
// 经典脚本（非 module），因为本页也可能直接用 file:// 打开。
"use strict";

(() => {
  /* ---------- toast ---------- */
  const toastEl = document.getElementById("toast");
  let toastTimer;
  const bildir = (metin) => {
    if (!toastEl) return;
    toastEl.textContent = metin;
    toastEl.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("on"), 2600);
  };
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-todo]");
    if (el) bildir(el.dataset.todo);
  });

  /* ---------- config link view ---------- */
  const ONEK = "exte?";
  const SAHNE = document.getElementById("sahne");
  const ICEV = document.getElementById("iceAktarma");
  const KART = document.getElementById("icevKart");
  const BAR_YOK = document.getElementById("barYok");
  const BAR_BOZUK = document.getElementById("barBozuk");
  const SURUM = document.getElementById("icevSurum");
  const KAPAT = document.getElementById("icevKapat");
  const ONAY = document.getElementById("icevOnay");
  const BASLIK = document.title;
  if (!SAHNE || !ICEV) return;

  const pazar = [...document.querySelectorAll(".copy, .preview")];
  const b64Url = (s, min) => new RegExp(`^[A-Za-z0-9_-]{${min},}$`).test(s || "");
  let AKTARIM = null;

  /** #exte?v=1&i=…&s=…&d=… → {ok, surum, v, i, s, d}；未命中返回 null。 */
  function coz() {
    const ham = location.hash.replace(/^#/, "");
    if (ham !== "exte" && !ham.startsWith(ONEK)) return null;
    const p = new URLSearchParams(ham.startsWith(ONEK) ? ham.slice(ONEK.length) : "");
    const v = p.get("v") || "";
    const i = p.get("i") || "";
    const s = p.get("s") || "";
    const d = p.get("d") || "";
    // Sürümü burada elemiyoruz: yüksek sürümü eklenti "desteklenmiyor" diye
    // göstermeli. Yalnızca biçim ve KDF sınırları doğrulanır.
    const ok =
      /^\d{1,3}$/.test(v) && Number(v) >= 1 &&
      /^\d{5,7}$/.test(i) && Number(i) >= 100000 &&
      b64Url(s, 20) && b64Url(d, 24);
    return { ok, surum: v || "—", v, i, s, d };
  }

  /** 通过 externally_connectable 探测扩展；ID 未填时按未安装处理。 */
  function uzantiVarMi() {
    return new Promise((resolve) => {
      const kimlik = globalThis.EXTE_SITE?.uzantiKimlik;
      if (!kimlik || !globalThis.chrome?.runtime?.sendMessage) return resolve(false);
      try {
        chrome.runtime.sendMessage(kimlik, { tip: "exte-ping" }, (yanit) => {
          void chrome.runtime.lastError;
          resolve(Boolean(yanit));
        });
      } catch {
        resolve(false);
      }
    });
  }

  function goster(veri) {
    SAHNE.dataset.view = "icev";
    for (const el of pazar) el.hidden = true;
    ICEV.hidden = false;
    KART.hidden = !veri.ok;
    BAR_BOZUK.hidden = veri.ok;
    BAR_YOK.hidden = true;
    AKTARIM = veri;
    if (SURUM) SURUM.textContent = `v${veri.surum}`;
    document.title = "导入配置链接 — EXTE SE";
    if (!veri.ok) return;
    uzantiVarMi().then((varMi) => {
      BAR_YOK.hidden = varMi;
    });
  }

  /** 把密文与公开 KDF 参数交给扩展；不传密码，也不传明文。 */
  function iletiGonder(veri) {
    return new Promise((resolve) => {
      const kimlik = globalThis.EXTE_SITE?.uzantiKimlik;
      if (!kimlik || !globalThis.chrome?.runtime?.sendMessage) return resolve(false);
      try {
        chrome.runtime.sendMessage(
          kimlik,
          { tip: "exte-import", v: veri.v, i: veri.i, s: veri.s, d: veri.d, kaynak: "site" },
          (yanit) => {
            void chrome.runtime.lastError;
            resolve(Boolean(yanit?.ok));
          },
        );
      } catch {
        resolve(false);
      }
    });
  }

  async function icevOnayla() {
    if (!AKTARIM?.ok) return;
    const gonderildi = await iletiGonder(AKTARIM);
    if (!gonderildi) {
      BAR_YOK.hidden = false;
      bildir("请先安装扩展后再导入。");
      return;
    }
    bildir("已发送到扩展，请在设置页完成导入。");
    kapat();
  }

  /** 清掉 hash（不新增历史记录），回到营销页。 */
  function kapat() {
    if (ICEV.hidden) return;
    AKTARIM = null;
    try {
      history.replaceState(null, "", location.pathname + location.search);
    } catch {
      location.hash = "";
    }
    ICEV.hidden = true;
    SAHNE.removeAttribute("data-view");
    for (const el of pazar) el.hidden = false;
    document.title = BASLIK;
  }

  function bak() {
    const veri = coz();
    if (veri) goster(veri);
    else kapat();
  }

  KAPAT?.addEventListener("click", kapat);
  ONAY?.addEventListener("click", icevOnayla);
  window.addEventListener("hashchange", bak);
  bak();
})();
