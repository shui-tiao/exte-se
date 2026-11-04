import test from "node:test";
import assert from "node:assert/strict";

import { baglantiUret, baglantiCoz, BAGLANTI_SURUMU, BAGLANTI_MAKS_UZUNLUK } from "../src/baglanti.js";

const YAPILANDIRMA = {
  hesaplar: [
    {
      id: "a1",
      ad: "muslu@makdos.com",
      yayinci: "MAKDOS",
      gizli: "GEZDGNBVGY3TQOJQ",
      tip: "totp",
      algoritma: "SHA1",
      hane: 6,
      periyot: 30,
    },
  ],
  ayarlar: { tema: "dark", dil: "zh", otoKilitDk: 15 },
};

test("配置链接带版本号，且只有密文", async () => {
  const sonuc = await baglantiUret(YAPILANDIRMA, "cokgizli");

  const url = new URL(sonuc.url);
  assert.equal(url.hash.startsWith("#exte?"), true);

  const p = new URLSearchParams(url.hash.slice(6));
  assert.equal(p.get("v"), String(BAGLANTI_SURUMU));
  assert.ok(p.get("i"));
  assert.ok(p.get("s").length >= 20);
  assert.ok(p.get("d").length >= 24);

  const metin = decodeURIComponent(sonuc.url);
  assert.ok(!metin.includes("GEZDGNBVGY3TQOJQ"), "密钥不得出现在链接里");
  assert.ok(!metin.includes("muslu@makdos.com"), "账户名不得出现在链接里");
  assert.ok(!metin.includes("cokgizli"), "密码不得出现在链接里");

  assert.equal(sonuc.uzunluk, sonuc.url.length);
  assert.equal(sonuc.asiri, sonuc.uzunluk > BAGLANTI_MAKS_UZUNLUK);
});

test("密码过短时拒绝生成", async () => {
  await assert.rejects(() => baglantiUret(YAPILANDIRMA, "kisa"));
});

test("超长链接会被标记为需要提示", async () => {
  const hesaplar = Array.from({ length: 120 }, (_, i) => ({
    id: `h${i}`,
    ad: `user${i}@example.com`,
    yayinci: "Example",
    gizli: "JBSWY3DPEHPK3PXP",
    tip: "totp",
    algoritma: "SHA1",
    hane: 6,
    periyot: 30,
  }));

  const sonuc = await baglantiUret({ hesaplar, ayarlar: { tema: "auto" } }, "cokgizli");
  assert.ok(sonuc.asiri, `beklenen > ${BAGLANTI_MAKS_UZUNLUK}, gelen ${sonuc.uzunluk}`);
});

async function kayitUret() {
  const sonuc = await baglantiUret(YAPILANDIRMA, "cokgizli");
  const p = new URLSearchParams(new URL(sonuc.url).hash.slice(6));
  return { v: p.get("v"), i: p.get("i"), s: p.get("s"), d: p.get("d") };
}

test("bağlantı çözme doğru parola ile yapılandırmayı veriyor", async () => {
  const kayit = await kayitUret();
  const veri = await baglantiCoz(kayit, "cokgizli");
  assert.equal(veri.hesaplar.length, 1);
  assert.equal(veri.hesaplar[0].ad, "muslu@makdos.com");
  assert.equal(veri.ayarlar.dil, "zh");
});

test("yanlış parola ile bozuk bağlantı aynı mesajı veriyor", async () => {
  const kayit = await kayitUret();
  const yanlis = await baglantiCoz(kayit, "yanlisparola").catch((e) => e.message);
  const bozuk = await baglantiCoz({ ...kayit, d: `A${kayit.d.slice(1)}` }, "cokgizli").catch(
    (e) => e.message,
  );
  assert.equal(yanlis, bozuk);
  assert.match(yanlis, /incorrect or the link is damaged|yanlış|不正确/);
});

test("sürüm yüksekse şifre çözülmeden reddediliyor", async () => {
  const kayit = await kayitUret();
  await assert.rejects(
    () => baglantiCoz({ ...kayit, v: String(BAGLANTI_SURUMU + 1) }, "cokgizli"),
    /v2|v1/,
  );
});
