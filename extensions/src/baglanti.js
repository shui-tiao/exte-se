// 配置链接 — mevcut kripto.js (PBKDF2 + AES-GCM) ile şifreli yapılandırmayı
// URL fragment'ına gömer. Bağlantıda yalnızca sürüm, KDF parametreleri (tuz,
// yineleme) ve şifreli veri bulunur; parola, anahtar veya düz metin girmez.
"use strict";

import "./site.js";
import { anahtarTurte, sifrele, coz, rastgele, b64Kodla, b64Coz, PBKDF2_YINELEME } from "./kripto.js";
import { t } from "./metinler.js";

export const BAGLANTI_SURUMU = 1;
export const BAGLANTI_ONEK = "exte?";
/** Sohbet uygulamalarının güvenle taşıdığı pratik üst sınır. */
export const BAGLANTI_MAKS_UZUNLUK = 2000;

/** Standart base64 → URL-güvenli base64 (dolgu atılır). */
function b64Url(metin) {
  return String(metin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Yapılandırmayı parola ile şifreleyip mutlak bir URL üretir.
 * → {url, uzunluk, sinir, asiri}
 */
export async function baglantiUret(yapilandirma, parola, taban = globalThis.EXTE_SITE.origin) {
  if (!parola || parola.length < 6) throw new Error(t("yedekParolaKisa"));

  const tuz = rastgele(16);
  const anahtar = await anahtarTurte(parola, tuz, PBKDF2_YINELEME);
  const parametreler = new URLSearchParams({
    v: String(BAGLANTI_SURUMU),
    i: String(PBKDF2_YINELEME),
    s: b64Url(b64Kodla(tuz)),
    d: b64Url(await sifrele(anahtar, JSON.stringify(yapilandirma))),
  });
  const url = `${String(taban).replace(/\/+$/, "")}/#${BAGLANTI_ONEK}${parametreler}`;
  return { url, uzunluk: url.length, sinir: BAGLANTI_MAKS_UZUNLUK, asiri: url.length > BAGLANTI_MAKS_UZUNLUK };
}

/** URL-güvenli base64'e eksik dolguyu ekler (b64Coz ham base64 bekliyor). */
function b64UrlDolgu(metin) {
  const s = String(metin ?? "").replace(/-/g, "+").replace(/_/g, "/");
  const kalan = s.length % 4;
  return kalan ? s + "=".repeat(4 - kalan) : s;
}

const b64UrlGecerli = (metin, min) =>
  typeof metin === "string" && new RegExp(`^[A-Za-z0-9_-]{${min},}$`).test(metin);

/**
 * Yapıştırılan metni bağlantı kaydına çevirir. Tam URL, `#exte?…` veya
 * `exte?…` biçimlerinin hepsi kabul edilir. Biçim bozuksa `iceParolaYanlis`
 * fırlatır; sürüm yüksek olsa bile kayıt döner (diyalog engeli gösterir).
 * → {v, i, s, d, surum, kaynak:"link"}
 */
export function baglantiAyikla(metin) {
  const ham = String(metin ?? "").trim();
  if (!ham) throw new Error(t("iceLinkBos"));

  const kes = ham.indexOf(`#${BAGLANTI_ONEK}`);
  const parca = kes >= 0 ? ham.slice(kes + 1) : ham.replace(/^#/, "");
  if (!parca.startsWith(BAGLANTI_ONEK)) throw new Error(t("iceParolaYanlis"));

  const p = new URLSearchParams(parca.slice(BAGLANTI_ONEK.length));
  const v = p.get("v") || "";
  const i = p.get("i") || "";
  const s = p.get("s") || "";
  const d = p.get("d") || "";
  const gecerli =
    /^\d{1,3}$/.test(v) &&
    /^\d{5,7}$/.test(i) &&
    Number(i) >= 100_000 &&
    b64UrlGecerli(s, 20) &&
    b64UrlGecerli(d, 24);
  if (!gecerli) throw new Error(t("iceParolaYanlis"));

  return { v, i, s, d, surum: v, kaynak: "link" };
}

/**
 * Bağlantı kaydı (`v`, `i`, `s`, `d`) + parola → çözülen yapılandırma.
 * Sürüm yüksekse şifre çözülmeden hata verir. Parola yanlışı ile bozuk
 * bağlantı ayırt edilmez; ikisi de `iceParolaYanlis` fırlatır.
 * → {hesaplar, ayarlar?}
 */
export async function baglantiCoz(kayit, parola) {
  const surum = Number(kayit?.v ?? kayit?.surum);
  if (!Number.isInteger(surum) || surum < 1) throw new Error(t("iceSurumGecersiz"));
  if (surum > BAGLANTI_SURUMU) throw new Error(t("iceSurumYuksek", surum, BAGLANTI_SURUMU));

  const yineleme = Number(kayit?.i ?? kayit?.yineleme);
  if (!Number.isInteger(yineleme) || yineleme < 100_000 || yineleme > 9_999_999) {
    throw new Error(t("iceParolaYanlis"));
  }

  let duz;
  try {
    const tuz = b64Coz(b64UrlDolgu(kayit?.s ?? kayit?.tuz));
    if (!tuz.length || tuz.length > 64) throw new Error("TUZ");
    const anahtar = await anahtarTurte(parola, tuz, yineleme);
    duz = await coz(anahtar, b64UrlDolgu(kayit?.d ?? kayit?.veri));
  } catch {
    throw new Error(t("iceParolaYanlis"));
  }

  let veri;
  try {
    veri = JSON.parse(duz);
  } catch {
    throw new Error(t("iceBozukVeri"));
  }
  if (!veri || !Array.isArray(veri.hesaplar)) throw new Error(t("iceBozukVeri"));
  return veri;
}
