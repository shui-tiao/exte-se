// exte ayarlar sayfası — yedekleme, GA aktarımı, parola kilidi, tema, dil.
"use strict";

import * as depo from "./src/depo.js";
import { sifreliYedekUret, sifreliYedekCoz, txtUret, txtCoz, dosyaIndir, YEDEK_TIPI } from "./src/yedek.js";
import { resimdenCoz } from "./src/qr.js";
import { gocCoz } from "./src/goc.js";
import { baglantiUret, baglantiCoz, BAGLANTI_SURUMU } from "./src/baglanti.js";
import { $, toast, duyur, temayiUygula, t, diliBaslat, sayfayiCevir, panoyaKopyala } from "./src/ui.js";

const durum = (secici, mesaj, tur = "") => {
  const el = $(secici);
  el.textContent = mesaj;
  const sinif = tur === "hata" ? "hata-metin" : tur === "ok" ? "ok-metin" : tur === "uyari" ? "uyari-metin" : "";
  el.className = `durum ${sinif}`;
  duyur(mesaj);
};

/** Otomatik kilit açılır kutusundaki seçenek metinlerini diline göre yazar. */
function otoKilitSecenekleri() {
  const secim = $("#otoKilit");
  for (const secenek of secim.options) {
    const dk = Number(secenek.value);
    secenek.textContent = dk === 0 ? t("otoKapali") : dk === 60 ? t("otoSaat") : t("otoDk", dk);
  }
}

/* ---------------- bekleme sayacı ---------------- */

const sayaclar = new Map();

function sayacDurdur(ad) {
  const id = sayaclar.get(ad);
  if (id) {
    clearInterval(id);
    sayaclar.delete(ad);
  }
}

/** Bitiş zamanına göre saniye saniye geri sayar; süre dolunca uygula(0) çağırır. */
function sayimBaslat(ad, bitis, kalanSn, uygula) {
  sayacDurdur(ad);
  if (!bitis || bitis <= Date.now()) {
    uygula(0);
    return;
  }
  const yaz = () => {
    const kalan = Math.ceil((bitis - Date.now()) / 1000);
    if (kalan <= 0) {
      sayacDurdur(ad);
      uygula(0);
      return;
    }
    uygula(kalan);
  };
  yaz();
  sayaclar.set(ad, setInterval(yaz, 1000));
}

/** Kilit bölümündeki bekleme satırını günceller. */
function kilitBeklemeGoster(bekleme) {
  const el = $("#kilitBekle");
  sayimBaslat("bolum", bekleme.kilitli ? bekleme.bitis : 0, bekleme.kalanSn, (kalan) => {
    el.hidden = kalan <= 0;
    el.textContent = kalan > 0 ? t("denemeBekle", kalan) : "";
  });
}

/** Kilit ekranında (kasa kilitliyken) girişi soğuma boyunca kapatır. */
function kilitEkraniBekleme(bekleme) {
  const giris = $("#kilitParola");
  const dugme = $("#kilitForm button[type='submit']");
  const hata = $("#kilitHata");
  sayimBaslat("giris", bekleme.kilitli ? bekleme.bitis : 0, bekleme.kalanSn, (kalan) => {
    giris.disabled = kalan > 0;
    dugme.disabled = kalan > 0;
    if (kalan > 0) {
      hata.textContent = t("denemeBekle", kalan);
      hata.dataset.sayim = "1";
    } else if (hata.dataset.sayim) {
      hata.textContent = "";
      delete hata.dataset.sayim;
    }
  });
}

function kilitAnahtariniGuncelle(acik) {
  const el = $("#kilitAnahtar");
  el.setAttribute("aria-checked", acik ? "true" : "false");
  const anahtar = acik ? "kilitAnahtarKapat" : "kilitAnahtarAc";
  el.setAttribute("data-i18n-aria", anahtar);
  el.setAttribute("data-i18n-title", anahtar);
  el.setAttribute("aria-label", t(anahtar));
  el.title = t(anahtar);
}

/* ---------------- parola kilidi diyalogu ---------------- */

const diyalog = $("#kilitDiyalog");
let diyalogModu = "kur"; // "kur" | "dogrula"

function diyalogBekleme(bekleme) {
  const girdi = $("#diyalogParola");
  const girdi2 = $("#diyalogParola2");
  const onay = $("#diyalogOnay");
  const bilgi = $("#diyalogBekle");
  sayimBaslat("diyalog", bekleme.kilitli ? bekleme.bitis : 0, bekleme.kalanSn, (kalan) => {
    const kapali = kalan > 0;
    girdi.disabled = kapali;
    girdi2.disabled = kapali;
    onay.disabled = kapali;
    bilgi.hidden = !kapali;
    bilgi.textContent = kapali ? t("denemeBekle", kalan) : "";
    if (!kapali && diyalog.open) girdi.focus();
  });
}

async function diyaloguAc(mod) {
  diyalogModu = mod;
  $("#kilitDiyalogBaslik").textContent = mod === "kur" ? t("diyalogKurBaslik") : t("diyalogDogrulaBaslik");
  $("#kilitDiyalogAciklama").textContent = mod === "kur" ? t("diyalogKurAciklama") : t("diyalogDogrulaAciklama");
  $("#diyalogOnay").textContent = mod === "kur" ? t("kilidiKur") : t("diyalogOnayla");
  $("#diyalogParolaEtiket").setAttribute("data-i18n", mod === "kur" ? "yeniParola" : "mevcutParola");
  $("#diyalogParola").autocomplete = mod === "kur" ? "new-password" : "current-password";
  $("#diyalogUyari").hidden = mod !== "kur";
  $("#diyalogParola2Alan").hidden = mod !== "kur";
  $("#diyalogParola").value = "";
  $("#diyalogParola2").value = "";
  $("#diyalogDurum").textContent = "";
  sayfayiCevir(diyalog);

  const bekleme = await depo.denemeDurumu();
  diyalogBekleme(bekleme);

  if (!diyalog.open) diyalog.showModal();
  if (!$("#diyalogParola").disabled) $("#diyalogParola").focus();
}

/* ---------------- ekran tazeleme ---------------- */

async function tazele() {
  const kilitli = await depo.kilitliMi();
  $("#kilitKart").hidden = !kilitli;
  $("#anaIcerik").hidden = kilitli;
  const bekleme = await depo.denemeDurumu();
  if (kilitli) {
    $("#ozet").textContent = t("kilitliOzet");
    kilitEkraniBekleme(bekleme);
    if (!$("#kilitParola").disabled) $("#kilitParola").focus();
    return;
  }

  const hesaplar = await depo.hesaplariOku();
  const kilit = await depo.kilitDurumu();
  const ayarlar = await depo.ayarlariOku();

  $("#ozet").textContent = t("ozet", hesaplar.length, kilit.acik ? t("kilitAcikDurum") : t("kilitKapaliDurum"));
  $("#kilitAciklama").textContent = kilit.acik ? t("kilitAcikAciklama") : t("kilitKapaliAciklama");
  $("#kilitRozet").textContent = kilit.acik ? "ENABLED" : "DISABLED";
  kilitAnahtariniGuncelle(kilit.acik);
  kilitBeklemeGoster(bekleme);
  $("#otoKilit").value = String(ayarlar.otoKilitDk);
  $("#otoKilit").disabled = !kilit.acik;
  $("#tema").value = ayarlar.tema;
  $("#dil").value = ayarlar.dil;

  const govde = $("#hesapTablo tbody");
  govde.replaceChildren(
    ...hesaplar.map((h) => {
      const tr = document.createElement("tr");
      for (const metin of [h.issuer || "—", h.ad, (h.tip || "totp").toUpperCase()]) {
        const td = document.createElement("td");
        td.textContent = metin;
        tr.append(td);
      }
      const td = document.createElement("td");
      const sil = document.createElement("button");
      sil.type = "button";
      sil.className = "duz tehlike";
      sil.textContent = t("sil");
      const etiket = `${h.issuer ? h.issuer + " · " : ""}${h.ad}`;
      sil.setAttribute("aria-label", t("silAria", etiket));
      sil.addEventListener("click", async () => {
        if (!confirm(t("silOnay", etiket))) return;
        await depo.hesapSil(h.id);
        toast(t("hesapSilindi"));
        await tazele();
      });
      td.append(sil);
      tr.append(td);
      return tr;
    }),
  );
  $("#hesapTablo").hidden = hesaplar.length === 0;
  $("#hesapBos").hidden = hesaplar.length > 0;
}

/* ---------------- içe aktarma ortak ---------------- */

async function birlestirVeBildir(gelen, secici) {
  const { eklenen, atlanan } = await depo.hesaplariBirlestir(gelen);
  durum(secici, t("iceAktarildi", eklenen, atlanan ? t("iceAktarildiAtlanan", atlanan) : ""), "ok");
  await tazele();
}

/* ---------------- yapılandırma bağlantısı içe aktarma ---------------- */

const iceDiyalog = $("#iceDiyalog");
let iceAsama = "parola"; // "parola" | "onizleme"
let iceKayit = null;     // session'daki bekleyen (şifreli) kayıt
let iceVeri = null;      // çözülen yapılandırma
let iceMevcut = [];      // işlem öncesi mevcut hesaplar
let iceYaziyor = false;

function iceDurum(mesaj = "") {
  $("#iceDiyalogDurum").textContent = mesaj;
}

function iceModlar() {
  return [...document.querySelectorAll('input[name="iceMod"]')];
}

/** Formu ilk (parola) adıma döndürür; kayıt ve çözülen veri silinir. */
function iceSifirla() {
  iceAsama = "parola";
  iceKayit = null;
  iceVeri = null;
  iceMevcut = [];
  iceYaziyor = false;
  $("#iceDiyalogParola").value = "";
  $("#iceDiyalogParola").disabled = false;
  $("#iceParolaAdim").hidden = false;
  $("#iceOnizleme").hidden = true;
  $("#iceDiyalogGeri").hidden = true;
  $("#iceDiyalogOnay").textContent = t("iceCoz");
  $("#iceDiyalogOnay").disabled = false;
  $("#iceHesaplar").replaceChildren();
  $("#iceAdet").textContent = "";
  $("#iceBirlestirOzet").textContent = "";
  $("#iceUzerineYazEtiket").textContent = "";
  for (const r of iceModlar()) r.checked = false;
  $("#iceDiyalogKaynak").textContent = "";
  $("#iceDiyalogSurum").textContent = "";
  iceDurum();
}

function iceOnizlemeyiDoldur() {
  const hesaplar = iceVeri.hesaplar;
  $("#iceAdet").textContent = t("iceHesaplar", hesaplar.length);
  $("#iceHesaplar").replaceChildren(
    ...hesaplar.map((h) => {
      const li = document.createElement("li");
      const servis = document.createElement("span");
      servis.className = "ice-liste__servis";
      servis.textContent = String(h.issuer || "").trim() || "—";
      const ad = document.createElement("span");
      ad.textContent = String(h.ad || "").trim() || "—";
      li.append(servis, ad);
      return li;
    }),
  );

  // Birleştirme önizlemesi: aynı ad (hizmet + hesap) olanlar atlanır.
  let yeni = 0;
  let atlanan = 0;
  const biriken = [...iceMevcut];
  for (const h of hesaplar) {
    if (biriken.some((m) => depo.ayniAdMi(m, h))) {
      atlanan++;
      continue;
    }
    biriken.push(h);
    yeni++;
  }
  $("#iceBirlestirOzet").textContent = t("iceBirlestirOzet", yeni, atlanan);
  $("#iceUzerineYazEtiket").textContent = t("iceUzerineYaz", iceMevcut.length);
  $("#iceDiyalogOnay").textContent = t("iceUygula", hesaplar.length);
  $("#iceDiyalogOnay").disabled = true; // mod seçilene kadar kapalı
}

async function iceDiyalogAc(kayit) {
  iceSifirla();
  iceKayit = kayit;
  $("#iceDiyalogKaynak").textContent =
    kayit.kaynak === "site" ? t("iceKaynakSite") : t("baglantiBaslik");
  $("#iceDiyalogSurum").textContent = `v${kayit.surum ?? "—"}`;

  const surum = Number(kayit.surum);
  if (!Number.isInteger(surum) || surum < 1) {
    iceDurum(t("iceSurumGecersiz"));
    $("#iceDiyalogParola").disabled = true;
    $("#iceDiyalogOnay").disabled = true;
  } else if (surum > BAGLANTI_SURUMU) {
    iceDurum(t("iceSurumYuksek", surum, BAGLANTI_SURUMU));
    $("#iceDiyalogParola").disabled = true;
    $("#iceDiyalogOnay").disabled = true;
  }

  if (!iceDiyalog.open) iceDiyalog.showModal();
  if (!$("#iceDiyalogParola").disabled) $("#iceDiyalogParola").focus();
}

/** Bekleyen aktarım varsa ve sayfa kilitli değilse içe aktarma diyalogunu açar. */
async function iceBekleyenKontrol() {
  if (iceDiyalog.open || diyalog.open) return;
  const kayit = await depo.bekleyenIceAktarimOku();
  if (!kayit) return;
  if (await depo.kilitliMi()) return; // kilit açılınca yeniden denenecek
  await iceDiyalogAc(kayit);
}

function iceParolaAdiminaDon() {
  iceAsama = "parola";
  iceVeri = null;
  iceMevcut = [];
  $("#iceDiyalogParola").value = "";
  $("#iceDiyalogParola").disabled = false;
  $("#iceParolaAdim").hidden = false;
  $("#iceOnizleme").hidden = true;
  $("#iceDiyalogGeri").hidden = true;
  $("#iceDiyalogOnay").textContent = t("iceCoz");
  $("#iceDiyalogOnay").disabled = false;
  $("#iceHesaplar").replaceChildren();
  $("#iceAdet").textContent = "";
  for (const r of iceModlar()) r.checked = false;
  iceDurum();
  $("#iceDiyalogParola").focus();
}

iceDiyalog.addEventListener("close", () => {
  const bekleyenVardi = Boolean(iceKayit);
  iceSifirla();
  if (bekleyenVardi) depo.bekleyenIceAktarimSil();
});

$("#iceDiyalogIptal").addEventListener("click", () => iceDiyalog.close());
$("#iceDiyalogGeri").addEventListener("click", iceParolaAdiminaDon);

for (const r of iceModlar()) {
  r.addEventListener("change", () => {
    $("#iceDiyalogOnay").disabled = !iceModlar().some((x) => x.checked);
  });
}

$("#iceDiyalogForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!iceKayit || iceYaziyor) return;

  if (iceAsama === "parola") {
    const parola = $("#iceDiyalogParola").value;
    if (!parola) {
      iceDurum(t("iceParolaYanlis"));
      return;
    }
    $("#iceDiyalogOnay").disabled = true;
    iceDurum();
    try {
      const veri = await baglantiCoz(iceKayit, parola);
      if (!veri.hesaplar.length) throw new Error(t("iceBos"));
      iceVeri = veri;
      iceMevcut = await depo.hesaplariOku();
      iceAsama = "onizleme";
      $("#iceDiyalogParola").value = "";
      $("#iceParolaAdim").hidden = true;
      $("#iceOnizleme").hidden = false;
      $("#iceDiyalogGeri").hidden = false;
      iceOnizlemeyiDoldur();
    } catch (err) {
      iceDurum(err?.message === "KILITLI" ? t("iceKilitli") : err.message);
      $("#iceDiyalogOnay").disabled = false;
    }
    return;
  }

  const mod = iceModlar().find((x) => x.checked)?.value;
  if (!mod) return;
  iceYaziyor = true;
  $("#iceDiyalogOnay").disabled = true;
  try {
    const sonuc = await depo.iceAktarimYaz(iceVeri.hesaplar, mod);
    await depo.bekleyenIceAktarimSil();
    iceDiyalog.close();
    toast(t("iceTamam", sonuc.yazilan, sonuc.atlanan));
    await tazele();
  } catch (err) {
    iceDurum(err?.message === "KILITLI" ? t("iceKilitli") : err.message);
    $("#iceDiyalogOnay").disabled = false;
  } finally {
    iceYaziyor = false;
  }
});

chrome.storage.onChanged.addListener((degisim, alan) => {
  if (alan !== "session") return;
  if (!(depo.BEKLEYEN_ANAHTAR in degisim)) return;
  if (degisim[depo.BEKLEYEN_ANAHTAR].newValue) iceBekleyenKontrol();
});

/* ---------------- olaylar ---------------- */

$("#kilitForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#kilitHata").textContent = "";
  delete $("#kilitHata").dataset.sayim;
  try {
    await depo.kilidiAc($("#kilitParola").value);
    $("#kilitParola").value = "";
    await tazele();
    await iceBekleyenKontrol();
  } catch (err) {
    $("#kilitHata").textContent = err.message;
    kilitEkraniBekleme(await depo.denemeDurumu());
  }
});

// --- dışa aktar ---
$("#disaForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const hesaplar = await depo.hesaplariOku();
    if (!hesaplar.length) throw new Error(t("disaAktarilacakYok"));
    const yedek = await sifreliYedekUret(hesaplar, $("#disaParola").value);
    dosyaIndir("json", JSON.stringify(yedek, null, 2), "application/json");
    $("#disaParola").value = "";
    durum("#disaDurum", t("sifreliIndirildi", hesaplar.length), "ok");
  } catch (err) {
    durum("#disaDurum", err.message, "hata");
  }
});

$("#disaTxt").addEventListener("click", async () => {
  try {
    const hesaplar = await depo.hesaplariOku();
    if (!hesaplar.length) throw new Error(t("disaAktarilacakYok"));
    if (!confirm(t("txtOnay"))) return;
    dosyaIndir("txt", txtUret(hesaplar), "text/plain");
    durum("#disaDurum", t("sifresizIndirildi", hesaplar.length), "ok");
  } catch (err) {
    durum("#disaDurum", err.message, "hata");
  }
});

$("#disaBaglanti").addEventListener("click", async () => {
  try {
    const hesaplar = await depo.hesaplariOku();
    if (!hesaplar.length) throw new Error(t("disaAktarilacakYok"));
    const ayarlar = await depo.ayarlariOku();
    const sonuc = await baglantiUret({ hesaplar, ayarlar }, $("#disaParola").value);

    $("#baglantiMetin").value = sonuc.url;
    $("#baglantiSonuc").hidden = false;
    durum(
      "#baglantiDurum",
      sonuc.asiri ? t("baglantiUzun", sonuc.uzunluk) : t("baglantiOlusturuldu", sonuc.uzunluk),
      sonuc.asiri ? "uyari" : "ok",
    );
    try {
      await panoyaKopyala(sonuc.url);
      toast(t("baglantiKopyalandi"));
    } catch {
      $("#baglantiMetin").select();
      toast(t("kopyalanamadi"), "hata");
    }
  } catch (err) {
    durum("#baglantiDurum", err.message, "hata");
  }
});

// --- içe aktar ---
$("#iceDosyaAc").addEventListener("click", () => $("#iceDosya").click());
$("#iceDosya").addEventListener("change", async (e) => {
  const dosya = e.target.files?.[0];
  e.target.value = "";
  if (!dosya) return;
  try {
    const icerik = await dosya.text();
    let gelen;
    if (icerik.trim().startsWith("{")) {
      const nesne = JSON.parse(icerik);
      if (nesne.tip !== YEDEK_TIPI) throw new Error(t("yedekDegil"));
      if (!$("#iceParola").value) throw new Error(t("sifreliIcinParola"));
      gelen = await sifreliYedekCoz(nesne, $("#iceParola").value);
    } else {
      const { hesaplar, hatalar } = txtCoz(icerik);
      if (hatalar.length) toast(t("satirOkunamadi", hatalar.length), "hata");
      gelen = hesaplar;
    }
    if (!gelen.length) throw new Error(t("dosyadaHesapYok"));
    $("#iceParola").value = "";
    await birlestirVeBildir(gelen, "#iceDurum");
  } catch (err) {
    durum("#iceDurum", err.message, "hata");
  }
});

// --- Google Authenticator aktarımı ---
$("#gocDosyaAc").addEventListener("click", () => $("#gocDosya").click());
$("#gocDosya").addEventListener("change", async (e) => {
  const dosya = e.target.files?.[0];
  e.target.value = "";
  if (!dosya) return;
  try {
    durum("#gocDurum", t("qrOkunuyor"));
    const metin = await resimdenCoz(dosya);
    if (!metin) throw new Error(t("qrResimdeYok"));
    await gocIsle(metin);
  } catch (err) {
    durum("#gocDurum", err.message, "hata");
  }
});

$("#gocEkle").addEventListener("click", async () => {
  try {
    await gocIsle($("#gocMetin").value.trim());
    $("#gocMetin").value = "";
  } catch (err) {
    durum("#gocDurum", err.message, "hata");
  }
});

async function gocIsle(metin) {
  const { hesaplar, parca } = gocCoz(metin);
  await birlestirVeBildir(hesaplar, "#gocDurum");
  if (parca.adet > 1) {
    durum("#gocDurum", $("#gocDurum").textContent + t("gocParca", parca.adet, parca.indeks + 1), "ok");
  }
}

// --- parola kilidi ---
$("#kilitAnahtar").addEventListener("click", async () => {
  const kilit = await depo.kilitDurumu();
  await diyaloguAc(kilit.acik ? "dogrula" : "kur");
});

$("#diyalogIptal").addEventListener("click", () => diyalog.close());
diyalog.addEventListener("close", () => {
  sayacDurdur("diyalog");
  iceBekleyenKontrol();
});

$("#kilitDiyalogForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const hataEl = $("#diyalogDurum");
  hataEl.textContent = "";
  try {
    if (diyalogModu === "kur") {
      const parola = $("#diyalogParola").value;
      if (parola !== $("#diyalogParola2").value) throw new Error(t("parolalarEslesmiyor"));
      await depo.kilitKur(parola);
      durum("#kilitAyarDurum", t("kilitKuruldu"), "ok");
    } else {
      await depo.kilidiKaldir($("#diyalogParola").value);
      durum("#kilitAyarDurum", t("kilitKaldirildi"), "ok");
    }
    diyalog.close();
    await tazele();
  } catch (err) {
    hataEl.textContent = err.message;
    const bekleme = await depo.denemeDurumu();
    diyalogBekleme(bekleme);
    kilitBeklemeGoster(bekleme);
  }
});

$("#otoKilit").addEventListener("change", async (e) => {
  await depo.ayarlariYaz({ otoKilitDk: Number(e.target.value) });
  durum("#kilitAyarDurum", t("otoGuncellendi"), "ok");
});

$("#tema").addEventListener("change", async (e) => {
  await depo.ayarlariYaz({ tema: e.target.value });
  await temayiUygula();
});

$("#dil").addEventListener("change", async (e) => {
  await depo.ayarlariYaz({ dil: e.target.value });
  await diliBaslat();
  sayfayiCevir();
  otoKilitSecenekleri();
  await tazele();
});

/* ---------------- başlangıç ---------------- */

await diliBaslat();
sayfayiCevir();
otoKilitSecenekleri();
await temayiUygula();
await tazele();
await iceBekleyenKontrol();

// Sekme kapanırken bekleyen şifreli kayıt bırakılmaz.
window.addEventListener("pagehide", () => {
  if (iceKayit) depo.bekleyenIceAktarimSil();
});
