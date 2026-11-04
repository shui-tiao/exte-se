// metinler.js sözleşme testleri: 10 dil, aynı anahtar kümesi, boş değer yok,
// İngilizce artığı yok ve tarayıcı dili algılama doğru.
import test from "node:test";
import assert from "node:assert/strict";

import { METINLER, diliAyarla, etkinDil, t } from "../src/metinler.js";

const DILLER = ["en", "tr", "zh", "ja", "ko", "ru", "es", "fr", "it", "de"];
const YENI_DILLER = ["ja", "ko", "ru", "es", "fr", "it", "de"];

// İngilizceyle aynı kalması meşru olan anahtarlar. ORTAK: dil adları ve "QR".
// Diğerleri o dilde gerçekten İngilizceyle aynı yazılan ortak sözcüklerdir
// (fr "Source"/"Version"/"Service"/"Type", it "Account"/"Password", de "Link"/"Version", es "Manual").
const ORTAK = ["dilEn", "dilTr", "dilZh", "sekmeQr"];
const AYNI_KALABILIR = {
  ja: new Set(ORTAK),
  ko: new Set(ORTAK),
  ru: new Set(ORTAK),
  es: new Set([...ORTAK, "sekmeElle"]),
  fr: new Set([...ORTAK, "tabloServis", "tabloTur", "tur", "iceKaynak", "iceSurum"]),
  it: new Set([...ORTAK, "parola", "tabloHesap"]),
  de: new Set([...ORTAK, "sekmeBaglanti", "iceSurum"]),
};

const yerTutuculari = (metin) =>
  [...metin.matchAll(/\$(\d)/g)]
    .map((eslesme) => eslesme[1])
    .sort()
    .join(",");

/** Test süresince globalThis.navigator.language değerini taklit eder. */
function tarayiciDili(kod) {
  const onceki = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    value: { language: kod },
    configurable: true,
  });
  return () => {
    if (onceki) Object.defineProperty(globalThis, "navigator", onceki);
    else delete globalThis.navigator;
  };
}

test("her dil en ile aynı anahtar kümesine sahip", () => {
  const beklenen = Object.keys(METINLER.en).sort();
  assert.equal(beklenen.length, 192, "İngilizce sözlük 192 anahtar olmalı");
  for (const dil of DILLER) {
    assert.deepEqual(
      Object.keys(METINLER[dil]).sort(),
      beklenen,
      `${dil}: anahtar kümesi en ile aynı olmalı`,
    );
  }
});

test("hiçbir dilde boş değer yok", () => {
  for (const dil of DILLER) {
    for (const [anahtar, metin] of Object.entries(METINLER[dil])) {
      assert.equal(typeof metin, "string", `${dil}.${anahtar}: metin olmalı`);
      assert.ok(metin.trim().length > 0, `${dil}.${anahtar}: boş olmamalı`);
    }
  }
});

test("yeni dillerde İngilizce artığı yok", () => {
  const artiklar = [];
  for (const dil of YENI_DILLER) {
    for (const [anahtar, metin] of Object.entries(METINLER[dil])) {
      if (AYNI_KALABILIR[dil].has(anahtar)) continue;
      if (metin === METINLER.en[anahtar]) artiklar.push(`${dil}.${anahtar}`);
    }
  }
  assert.deepEqual(artiklar, [], `İngilizce metin kalmış: ${artiklar.join(", ")}`);
});

test("yer tutucular ($1, $2) her dilde en ile aynı", () => {
  for (const dil of DILLER) {
    for (const [anahtar, metin] of Object.entries(METINLER[dil])) {
      assert.equal(
        yerTutuculari(metin),
        yerTutuculari(METINLER.en[anahtar]),
        `${dil}.${anahtar}: yer tutucu uyuşmuyor`,
      );
    }
  }
});

test("auto, tarayıcı dilinin birincil alt etiketini tanır", () => {
  const durumlar = [
    ["zh-CN", "zh"],
    ["zh-TW", "zh"],
    ["ja-JP", "ja"],
    ["ko-KR", "ko"],
    ["ru-RU", "ru"],
    ["es-419", "es"],
    ["fr-CA", "fr"],
    ["it-IT", "it"],
    ["de-AT", "de"],
    ["tr-TR", "tr"],
    ["en-US", "en"],
    ["pt-BR", "en"],
    ["nl-NL", "en"],
  ];
  for (const [tarayici, beklenen] of durumlar) {
    const geriAl = tarayiciDili(tarayici);
    try {
      assert.equal(diliAyarla("auto"), beklenen, `${tarayici} → ${beklenen}`);
    } finally {
      geriAl();
    }
  }
});

test("elle seçilen dil ve bilinmeyen kod", () => {
  for (const dil of DILLER) assert.equal(diliAyarla(dil), dil);
  assert.equal(diliAyarla("xx"), "en");
  assert.equal(etkinDil(), "en");
});

test("t() yeni dillerde yer tutucuları doldurur", () => {
  diliAyarla("ja");
  assert.match(t("iceHesaplar", 7), /7/);
  diliAyarla("de");
  assert.match(t("ozet", 2, "an"), /2/);
  diliAyarla("fr");
  assert.match(t("iceSurumYuksek", 2, 1), /v2/);
});
