// chrome.storage katmanı — hesap CRUD + opsiyonel parola kilidi.
//
// Şema (chrome.storage.local):
//   surum:    1
//   kilit:    {acik:false} | {acik:true, tuz:b64, yineleme:n, kontrol:b64(iv+ct)}
//   hesaplar: [...]        ← kilit KAPALIYKEN
//   kasa:     b64(iv+ct)   ← kilit AÇIKKEN (hesaplar JSON'u şifreli)
//   ayarlar:  {tema, otoKilitDk}
//
// Oturum anahtarı chrome.storage.session'da tutulur: tarayıcı kapanınca silinir,
// content script'ler göremez (TRUSTED_CONTEXTS). Service worker belleği MV3'te
// 30 sn'de öldüğü için bellekte tutmak işe yaramaz.
"use strict";

import { anahtarTurte, anahtarDisaAktar, anahtarIceAktar, sifrele, coz, rastgele, b64Kodla, b64Coz, PBKDF2_YINELEME } from "./kripto.js";

import { t } from "./metinler.js";
import { base32Coz } from "./otp.js";

const SURUM = 1;
const OTURUM_ANAHTAR = "oturumAnahtari";
const OTURUM_DAMGA = "sonKullanim";
export const VARSAYILAN_AYARLAR = { tema: "auto", otoKilitDk: 15, dil: "auto" };

// Parola doğrulama kilidi: 5 hatalı denemeden sonra 60 sn bekleme.
// yerel.depo'da tutulur (chrome.storage.local) → sayfa kapatılsa / tarayıcı
// yeniden açılsa da sayaç ve bitiş zamanı korunur.
const DENEME_ANAHTAR = "kilitDeneme";
export const DENEME_SINIRI = 5;
export const DENEME_COOLDOWN_MS = 60_000;

const yerel = {
  oku: (anahtarlar) => chrome.storage.local.get(anahtarlar),
  yaz: (nesne) => chrome.storage.local.set(nesne),
  sil: (anahtarlar) => chrome.storage.local.remove(anahtarlar),
};

/* ---------- ayarlar ---------- */

export async function ayarlariOku() {
  const { ayarlar } = await yerel.oku("ayarlar");
  return { ...VARSAYILAN_AYARLAR, ...(ayarlar || {}) };
}

export async function ayarlariYaz(yama) {
  const yeni = { ...(await ayarlariOku()), ...yama };
  await yerel.yaz({ ayarlar: yeni });
  return yeni;
}

/* ---------- kilit durumu ---------- */

export async function kilitDurumu() {
  const { kilit } = await yerel.oku("kilit");
  return kilit && kilit.acik ? kilit : { acik: false };
}

/** Kilit açıksa ve oturum anahtarı yoksa/süresi dolduysa true. */
export async function kilitliMi() {
  const kilit = await kilitDurumu();
  if (!kilit.acik) return false;
  return (await oturumAnahtari()) === null;
}

async function oturumAnahtari() {
  const veri = await chrome.storage.session.get([OTURUM_ANAHTAR, OTURUM_DAMGA]);
  if (!veri[OTURUM_ANAHTAR]) return null;

  const { otoKilitDk } = await ayarlariOku();
  const gecen = Date.now() - (veri[OTURUM_DAMGA] || 0);
  if (otoKilitDk > 0 && gecen > otoKilitDk * 60_000) {
    await kilitle();
    return null;
  }
  await chrome.storage.session.set({ [OTURUM_DAMGA]: Date.now() });
  return anahtarIceAktar(veri[OTURUM_ANAHTAR]);
}

/* ---------- parola denemesi sayacı ---------- */

/**
 * Kayıtlı deneme durumunu okur. Bitiş zamanı geçmişse kaydı temizler.
 * → {hatali, bitis, kalanSn, kilitli}
 */
export async function denemeDurumu() {
  const { [DENEME_ANAHTAR]: kayit } = await yerel.oku(DENEME_ANAHTAR);
  const hatali = Math.max(0, Number(kayit?.hatali) || 0);
  const bitis = Number(kayit?.bitis) || 0;
  if (bitis && bitis <= Date.now()) {
    await yerel.sil(DENEME_ANAHTAR);
    return { hatali: 0, bitis: 0, kalanSn: 0, kilitli: false };
  }
  const kalanSn = bitis ? Math.ceil((bitis - Date.now()) / 1000) : 0;
  return { hatali, bitis, kalanSn, kilitli: kalanSn > 0 };
}

/** Soğuma süresi dolmuşsa sayacı sıfırlar (başarılı doğrulamada da çağrılır). */
async function denemeSifirla() {
  await yerel.sil(DENEME_ANAHTAR);
}

/** Hatalı denemeyi kaydeder; sınıra ulaşınca soğuma başlatır. → güncel durum */
async function denemeHatasiKaydet() {
  const { [DENEME_ANAHTAR]: kayit } = await yerel.oku(DENEME_ANAHTAR);
  const hatali = (Number(kayit?.hatali) || 0) + 1;
  if (hatali >= DENEME_SINIRI) {
    const bitis = Date.now() + DENEME_COOLDOWN_MS;
    await yerel.yaz({ [DENEME_ANAHTAR]: { hatali: DENEME_SINIRI, bitis } });
    return { hatali: DENEME_SINIRI, bitis, kalanSn: Math.ceil(DENEME_COOLDOWN_MS / 1000), kilitli: true };
  }
  await yerel.yaz({ [DENEME_ANAHTAR]: { hatali, bitis: 0 } });
  return { hatali, bitis: 0, kalanSn: 0, kilitli: false };
}

/**
 * Parolayı doğrular. Soğuma sürüyorsa doğrulamayı reddeder; yanlış parolada
 * sayacı artırır, doğru parolada sayacı temizler.
 */
async function parolayiDogrula(parola, kilit) {
  const bekleme = await denemeDurumu();
  if (bekleme.kilitli) throw new Error(t("denemeBekle", bekleme.kalanSn));

  let anahtar;
  try {
    anahtar = await anahtarTurte(parola, b64Coz(kilit.tuz), kilit.yineleme || PBKDF2_YINELEME);
    await coz(anahtar, kilit.kontrol); // parola yanlışsa burada patlar
  } catch (err) {
    const son = await denemeHatasiKaydet();
    if (son.kilitli) throw new Error(t("denemeBekle", son.kalanSn));
    throw err;
  }
  await denemeSifirla();
  return anahtar;
}

/** Parolayı doğrular ve oturum anahtarını açar. Yanlışsa hata fırlatır. */
export async function kilidiAc(parola) {
  const kilit = await kilitDurumu();
  if (!kilit.acik) return;
  const anahtar = await parolayiDogrula(parola, kilit);
  await chrome.storage.session.set({
    [OTURUM_ANAHTAR]: await anahtarDisaAktar(anahtar),
    [OTURUM_DAMGA]: Date.now(),
  });
}

export async function kilitle() {
  await chrome.storage.session.remove([OTURUM_ANAHTAR, OTURUM_DAMGA]);
}

/** Kilidi kurar: mevcut hesaplar şifrelenip `kasa`ya taşınır. */
export async function kilitKur(parola) {
  if (!parola || parola.length < 6) throw new Error(t("parolaKisa"));
  if ((await kilitDurumu()).acik) throw new Error(t("kilitZatenAcik"));

  const hesaplar = await hesaplariOku();
  const tuz = rastgele(16);
  const anahtar = await anahtarTurte(parola, tuz);
  await yerel.yaz({
    surum: SURUM,
    kilit: { acik: true, tuz: b64Kodla(tuz), yineleme: PBKDF2_YINELEME, kontrol: await sifrele(anahtar, "exte") },
    kasa: await sifrele(anahtar, JSON.stringify(hesaplar)),
  });
  await yerel.sil("hesaplar");
  await denemeSifirla();
  await chrome.storage.session.set({
    [OTURUM_ANAHTAR]: await anahtarDisaAktar(anahtar),
    [OTURUM_DAMGA]: Date.now(),
  });
}

/** Kilidi kaldırır: hesaplar düz olarak geri yazılır. Parola doğrulaması ister. */
export async function kilidiKaldir(parola) {
  const kilit = await kilitDurumu();
  if (!kilit.acik) return;
  const anahtar = await parolayiDogrula(parola, kilit);
  const { kasa } = await yerel.oku("kasa");
  const hesaplar = kasa ? JSON.parse(await coz(anahtar, kasa)) : [];
  await yerel.yaz({ surum: SURUM, kilit: { acik: false }, hesaplar });
  await yerel.sil("kasa");
  await kilitle();
}

export async function parolaDegistir(eski, yeni) {
  await kilidiKaldir(eski);
  await kilitKur(yeni);
}

/* ---------- hesap CRUD ---------- */

export async function hesaplariOku() {
  const kilit = await kilitDurumu();
  if (!kilit.acik) {
    const { hesaplar } = await yerel.oku("hesaplar");
    return Array.isArray(hesaplar) ? hesaplar : [];
  }
  const anahtar = await oturumAnahtari();
  if (!anahtar) throw new Error("KILITLI");
  const { kasa } = await yerel.oku("kasa");
  if (!kasa) return [];
  return JSON.parse(await coz(anahtar, kasa));
}

export async function hesaplariYaz(hesaplar) {
  const liste = hesaplar.map((h, i) => ({ ...h, sira: i }));
  const kilit = await kilitDurumu();
  if (!kilit.acik) {
    await yerel.yaz({ surum: SURUM, hesaplar: liste });
    return liste;
  }
  const anahtar = await oturumAnahtari();
  if (!anahtar) throw new Error("KILITLI");
  await yerel.yaz({ surum: SURUM, kasa: await sifrele(anahtar, JSON.stringify(liste)) });
  return liste;
}

export function yeniKimlik() {
  return b64Kodla(rastgele(9)).replace(/[+/=]/g, "").slice(0, 12);
}

export async function hesapEkle(hesap) {
  const liste = await hesaplariOku();
  const kayit = { id: yeniKimlik(), sayac: 0, algo: "SHA1", hane: 6, periyot: 30, tip: "totp", ...hesap };
  liste.push(kayit);
  await hesaplariYaz(liste);
  return kayit;
}

export async function hesapGuncelle(id, yama) {
  const liste = await hesaplariOku();
  const i = liste.findIndex((h) => h.id === id);
  if (i < 0) throw new Error(t("hesapYok"));
  liste[i] = { ...liste[i], ...yama };
  await hesaplariYaz(liste);
  return liste[i];
}

export async function hesapSil(id) {
  const liste = await hesaplariOku();
  await hesaplariYaz(liste.filter((h) => h.id !== id));
}

/** Aynı hesap zaten var mı? (issuer+ad+gizli üçlüsü) */
export function ayniMi(a, b) {
  const n = (s) => String(s || "").trim().toLowerCase();
  return n(a.issuer) === n(b.issuer) && n(a.ad) === n(b.ad) && n(a.gizli) === n(b.gizli);
}

/** Gelen hesapları mevcutlarla birleştirir. → {eklenen, atlanan} */
export async function hesaplariBirlestir(gelen) {
  const mevcut = await hesaplariOku();
  const eklenecek = [];
  let atlanan = 0;
  for (const h of gelen) {
    if (mevcut.some((m) => ayniMi(m, h)) || eklenecek.some((m) => ayniMi(m, h))) {
      atlanan++;
      continue;
    }
    eklenecek.push({ id: yeniKimlik(), sayac: 0, algo: "SHA1", hane: 6, periyot: 30, tip: "totp", ...h });
  }
  if (eklenecek.length) await hesaplariYaz([...mevcut, ...eklenecek]);
  return { eklenen: eklenecek.length, atlanan };
}

/* ---------- yapılandırma bağlantısı: bekleyen aktarım ---------- */

/** Site → eklenti aktarımı chrome.storage.session'da bu anahtarla bekler. */
export const BEKLEYEN_ANAHTAR = "bekleyenIceAktarim";

/** Bekleyen (yalnızca şifreli) aktarım kaydını okur; yoksa null. */
export async function bekleyenIceAktarimOku() {
  const { [BEKLEYEN_ANAHTAR]: kayit } = await chrome.storage.session.get(BEKLEYEN_ANAHTAR);
  if (!kayit || typeof kayit !== "object") return null;
  return kayit;
}

/** Aktarım başarılı, iptal edildi ya da penceresi kapandıysa kaydı siler. */
export async function bekleyenIceAktarimSil() {
  await chrome.storage.session.remove(BEKLEYEN_ANAHTAR);
}

/**
 * Aynı ad kuralı: hizmet + hesap adı; NFC normalize, baş/son boşluk kırpılır,
 * büyük/küçük harf yok sayılır. Gizli anahtar, tür ve algoritma dikkate alınmaz.
 */
export function ayniAdMi(a, b) {
  const n = (s) => String(s || "").normalize("NFC").trim().toLowerCase();
  return n(a.issuer) === n(b.issuer) && n(a.ad) === n(b.ad);
}

const ALGOLAR = new Set(["SHA1", "SHA256", "SHA512"]);
const TIPLER = new Set(["totp", "hotp"]);

function sayi(deger, varsayilan) {
  const n = Number(deger);
  return Number.isFinite(n) ? n : varsayilan;
}

/** Kaydı beklenen şemaya indirger; geçersizse null. Yeni kimlik ve sayaç korunur. */
function hesapTemizle(h) {
  if (!h || typeof h !== "object") return null;
  const ad = String(h.ad ?? "").trim();
  const issuer = String(h.issuer ?? "").trim();
  const gizli = String(h.gizli ?? "").replace(/\s/g, "").toUpperCase();
  if (!ad || !gizli) return null;
  try {
    base32Coz(gizli);
  } catch {
    return null;
  }
  const tip = TIPLER.has(h.tip) ? h.tip : "totp";
  const algoHam = String(h.algo ?? "").toUpperCase();
  const algo = ALGOLAR.has(algoHam) ? algoHam : "SHA1";
  const hane = Math.trunc(sayi(h.hane, 6));
  if (hane < 6 || hane > 10) return null;
  const periyot = sayi(h.periyot, 30);
  if (!(periyot > 0)) return null;
  const sayac = Math.max(0, Math.trunc(sayi(h.sayac, 0)));
  return { id: yeniKimlik(), ad, issuer, gizli, tip, algo, hane, periyot, sayac };
}

/** Yazma başarısız olduğunda depoyu işlem öncesi hâline döndürür. */
async function yazmayiGeriAl(anlik) {
  const geri = {};
  const silinecek = [];
  for (const [k, v] of Object.entries(anlik)) {
    if (v === undefined) silinecek.push(k);
    else geri[k] = v;
  }
  if (Object.keys(geri).length) await yerel.yaz(geri);
  if (silinecek.length) await yerel.sil(silinecek);
}

/**
 * Yapılandırma bağlantısındaki hesapları yazar.
 * mod: "birlestir" (mevcutlar korunur, aynı adlılar atlanır) | "uzerineYaz" (önce temizlenir).
 * Yazma tek bir storage.set çağrısıdır; herhangi bir adım hata verirse depo
 * işlem öncesi anlık görüntüsüne geri döner, yarım hesap listesi kalmaz.
 * → {yazilan, atlanan, toplam}
 */
export async function iceAktarimYaz(gelen, mod = "birlestir") {
  if (mod !== "birlestir" && mod !== "uzerineYaz") throw new Error("GECERSIZ_MOD");
  if (!Array.isArray(gelen)) throw new Error(t("iceBozukVeri"));

  const temiz = [];
  for (const h of gelen) {
    const kayit = hesapTemizle(h);
    if (kayit) temiz.push(kayit);
  }
  if (!temiz.length) throw new Error(t("iceBos"));

  let mevcut;
  try {
    mevcut = await hesaplariOku();
  } catch (err) {
    if (err?.message === "KILITLI") throw new Error(t("iceKilitli"));
    throw err;
  }

  const hedef = [];
  let atlanan = 0;
  if (mod === "uzerineYaz") {
    hedef.push(...temiz);
  } else {
    hedef.push(...mevcut);
    for (const h of temiz) {
      if (hedef.some((m) => ayniAdMi(m, h))) {
        atlanan++;
        continue;
      }
      hedef.push(h);
    }
  }

  const anlik = await yerel.oku(["hesaplar", "kasa", "surum"]);
  try {
    await hesaplariYaz(hedef);
  } catch {
    await yazmayiGeriAl(anlik);
    throw new Error(t("iceHataGeriAlindi"));
  }
  return { yazilan: temiz.length - atlanan, atlanan, toplam: hedef.length };
}
