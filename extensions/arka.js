// 官网 → 扩展通道。externally_connectable 只允许官网域名。
//
// 暂时关闭：扩展 ID 尚未确定，官网暂不探测、也不自动传递。
// ping / exte-import 监听与 manifest 的 externally_connectable 先保留，
// 等 ID 填好后打开 site.js 的 UZANTI_AKTARIMI_ACIK 即可启用。
// `exte-import` 只把密文写入 chrome.storage.session；密码和明文不会到这里。
"use strict";

const BEKLEYEN_ANAHTAR = "bekleyenIceAktarim";
const b64UrlGecerli = (s, min) =>
  typeof s === "string" && new RegExp(`^[A-Za-z0-9_-]{${min},}$`).test(s);

chrome.runtime.onMessageExternal.addListener((mesaj, _gonderen, yanit) => {
  if (mesaj?.tip === "exte-ping") {
    yanit({ ok: true, ad: "EXTE SE", surum: chrome.runtime.getManifest().version });
    return false;
  }

  if (mesaj?.tip === "exte-import") {
    const surum = String(mesaj.v ?? "");
    const yineleme = String(mesaj.i ?? "");
    const tuz = String(mesaj.s ?? "");
    const veri = String(mesaj.d ?? "");
    // Sürümü burada eleyip reddetmiyoruz: yüksek sürümü ayarlar sayfası
    // "desteklenmiyor" diye göstermeli. Yalnızca biçim ve KDF sınırları denetlenir.
    const gecerli =
      /^\d{1,3}$/.test(surum) &&
      /^\d{5,7}$/.test(yineleme) &&
      Number(yineleme) >= 100000 &&
      b64UrlGecerli(tuz, 20) &&
      b64UrlGecerli(veri, 24);
    if (!gecerli) {
      yanit({ ok: false, hata: "BOZUK" });
      return false;
    }

    chrome.storage.session
      .set({
        [BEKLEYEN_ANAHTAR]: {
          surum,
          yineleme,
          tuz,
          veri,
          kaynak: mesaj.kaynak === "site" ? "site" : "baglanti",
          zaman: Date.now(),
        },
      })
      .then(() => {
        yanit({ ok: true });
        chrome.runtime.openOptionsPage().catch(() => {});
      })
      .catch(() => yanit({ ok: false, hata: "DEPO" }));
    return true; // yanıt asenkron
  }

  return false;
});
