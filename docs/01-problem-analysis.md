# SealTender: Problem Analizi

## Kamu İhale Dolandırıcılığı — Küresel Ölçek

Kamu ihaleleri, dünya genelinde **$13 trilyon**luk bir pazar oluşturmaktadır (OECD, 2023). Bu pazarın tahmini **%10-25**'i yolsuzluk ve dolandırıcılığa kaybolmaktadır — yani yıllık **$1.3 - $3.25 trilyon** zarar (World Bank, Transparency International).

### Kaynak Verileri

| Kaynak | Tahmin | Yıl |
|--------|--------|-----|
| OECD Government at a Glance | Kamu harcamalarının %12-15'i ihale | 2023 |
| World Bank | Gelişmekte olan ülkelerde %25 kayıp | 2022 |
| Transparency International CPI | Sektörel rüşvet %10-30 arası | 2023 |
| EU Anti-Fraud Office (OLAF) | AB ihalelerinde %1.2B+ yıllık tespit | 2022 |

### Gerçek Dünya Örnekleri

- **Japonya — Dango:** İnşaat firmalarının onlarca yıldır sürdürdüğü sistematik ihale paylaşımı. Firmalar sırayla "kazanan" belirlenir, diğerleri bilerek yüksek teklif verir. 2005'te Adalet Bakanlığı soruşturmasında 26 firma mahkum edildi.
- **Brezilya — Lava Jato (Araba Yıkama):** Petrobras'ın $5.3 milyarlık ihale yolsuzluğu skandalı. İnşaat firmaları, petrol şirketi yöneticilerine rüşvet vererek milyarlarca dolarlık ihaleleri paylaştı. 2014-2021 arasında 400+ kişi tutuklandı.
- **İngiltere — NHS İnşaat:** 2023'te ortaya çıkan hastane inşaat ihalelerinde, altı firma 10 yıl boyunca teklif fiyatlarını koordine etti. Competition and Markets Authority (CMA) toplam £60M ceza verdi.
- **Türkiye — EKAP İhlalleri:** 2019-2023 arası Sayıştay raporlarında, çeşitli belediyelerde ihale komisyonu üyelerinin teklif zarflarını açmadan önce bilgi sızdırdığı vakalar tespit edildi.

Türkiye özelinde, EKAP (Elektronik Kamu Alımları Platforması) üzerinden yürütülen ihaleler hala ciddi manipülasyon risklerine açıktır: teklif sızıntısı, hayalet firmaların katılımı, değerlendirme sürecinde kayırma ve ihale sonrası sözleşme manipülasyonu en yaygın sorunlardır.

---

## Sorun Kategorileri ve Çözüm Kapasitesi

### Tam Çözüm (9-10/10)

#### Teklif Sızıntısı (Bid Leakage) — 9/10

**Sorun:** İhale komisyonu üyeleri veya sistem yöneticileri, teklif sürecinde rakip teklifleri sızdırarak belirli firmalara avantaj sağlar.

**SealTender Çözümü:** Teklifler **Fully Homomorphic Encryption (FHE)** ile şifrelenir. Hiç kimse — ihale sahibi, sistem yöneticisi, hatta blokzincir doğrulayıcıları dahil — teklifleri düz metin olarak göremez. Değerlendirme tamamen şifreli veriler üzerinde yapılır.

- Fiyat: `euint64` ile şifrelenir
- Deneyim yılı: `euint32` ile şifrelenir
- Tamamlanan proje sayısı: `euint32` ile şifrelenir
- Teminat kapasitesi: `euint64` ile şifrelenir

**Neden 10/10 değil:** Gateway decryption mekanizması, Zama'nın KMS altyapısına güven gerektirir. Tam trustless decryption için threshold decryption gereklidir (henüz üretimde yok).

---

#### Değerlendirici Tarafgirliği (Evaluator Bias) — 7/10

**Sorun:** İhale komisyonu, teklifleri sübjektif kriterlere göre değerlendirerek belirli firmaları kayırır.

**SealTender Çözümü:**
- Ağırlıklar (weight) ihale oluşturulurken **kamuya açık** olarak belirlenir
- Değerlendirme formülü akıllı sözleşmede **sabit ve deterministik**
- Gate + Price Ranking iki aşamalı değerlendirme: önce minimum eşik kontrolü, sonra fiyat sıralaması
- Tüm değerlendirme adımları on-chain ve denetlenebilir

**Limitasyon:** Ağırlık seçimi hala ihale sahibinin kontrolünde. Kötü niyetli ağırlıklar (ör. %99 deneyim yılı) belirli firmayı favori edebilir — ama bu **herkes tarafından görülebilir**.

---

#### Hayalet Teklif (Ghost Bidding) — 7/10

**Sorun:** Gerçekte var olmayan veya yeterlilik koşullarını sağlamayan firmalar, rekabeti simüle etmek için sahte teklifler sunar.

**SealTender Çözümü:**
- **BidderRegistry** ile KYC doğrulaması (whitelist modeli)
- `minReputation` eşiği ile minimum itibar puanı zorunluluğu
- `isVerified()` kontrolü `submitBid()` içinde zorunlu
- Escrow depozitosu gerçek mali taahhüt gerektirir

**Limitasyon:** Mock KYC (hackathon scope) — üretimde gerçek KYC entegrasyonu gerekir. Sahte kimlik oluşturma riski devam eder.

---

### Kısmi Çözüm (6-7/10)

#### İhale Sonrası Manipülasyon (Post-Award) — 6/10

**Sorun:** İhaleyi kazanan firma, sözleşme sürecinde fiyat artışı, kalite düşüşü veya süre uzatması talep eder.

**SealTender Çözümü:**
- **PriceEscalation** modülü ile oracle-bazlı fiyat ayarlaması
- Eşik ve tavan limitleri kontrat düzeyinde tanımlı
- `MAX_PRICE_CHANGE_BPS = 5000` (50%) sanity check
- Dispute mekanizması ile şikayet ve slash

**Limitasyon:** Off-chain iş performansı (kalite, süre) tamamen ölçülemez. Oracle manipülasyonu riski mevcut.

---

#### Fiyat Sabitleme (Price Fixing) — 4/10

**Sorun:** Firmalar gizlice anlaşarak fiyatları yapay olarak yüksek tutar.

**SealTender Çözümü:**
- **CollisionDetector** ile FHE üzerinde fiyat çakışma kontrolü
- `FHE.eq()` ile şifreli fiyat karşılaştırması (O(n^2) pairwise)
- Çakışma tespit edildiğinde ihale sahibi uyarılır

**Limitasyon:** Aynı fiyat = kartel kanıtı **değildir**. Firmalar farklı fiyatlarla da koordine edebilir. Sadece tespit mekanizması, önleme değil.

---

#### Danışıklı Döğüş / Cover Bidding — 3/10

**Sorun:** Firmalar, bir firmanın kazanmasını garantilemek için kasıtlı olarak yüksek teklif verir.

**SealTender Çözümü:**
- Collision detection aynı fiyat vakalarını tespit eder
- İtibar sistemi tekrarlayan kalıpları cezalandırır
- Escrow mekanizması mali caydırıcılık sağlar

**Limitasyon:** Cover bidding'in FHE ile tespiti çok zordur. Firmalar farklı ama kasıtlı yüksek fiyatlar verdiğinde, algoritmik tespit mümkün değildir.

---

### Çözemediğimiz Sorunlar

#### Rotasyon Yolsuzluğu (Rotation) — 2/10

**Sorun:** Firmalar sırayla ihale kazanır, her dönem farklı firma "kazanır".

SealTender bunu **tespit edemez** — her ihale bağımsız bir sözleşmedir. Çapraz ihale analizi off-chain yapılmalıdır. Tek katkı: on-chain kayıtlar (BidderRegistry) bu analizi kolaylaştırır.

#### Şartname Manipülasyonu (Specification Tailoring) — 1/10

**Sorun:** İhale şartnamesi, belirli bir firmanın kazanmasını garantileyecek şekilde yazılır.

Bu tamamen off-chain bir sorundur. SealTender şartnamenin **adil olup olmadığını** değerlendiremez. Tek katkı: şartname (description) ve ağırlıklar on-chain'de **şeffaf** olduğu için kamuoyu denetimi mümkündür.

---

## Caydırıcılık Mekanizmaları

### Stake/Slash Sistemi

| Mekanizma | Detay |
|-----------|-------|
| Escrow Depozitosu | Her teklif sahibi ihale öncesi ETH yatırır |
| Şirket Şikayeti | 0.01 ETH stake gerektirir (dismiss edilirse municipality'ye yanar) |
| Vatandaş Şikayeti | Stake gerektirmez (spam riski var) |
| Slash | Suçlu bulunan firmanın escrow'u belediyeye gider |
| İtibar | recordSlash() ile kalıcı itibar kaydı |

### On-Chain İtibar

```
Puan = (kazanma + zamanında tamamlama) * 100 / (toplam teklif + slash * 2)
```

- Yeni kayıtlılar: 50 puan (varsayılan)
- Slash: -2x ağırlıkla cezalandırılır
- Minimum itibar eşiği ihale başına ayarlanabilir

---

## Neden Ethereum?

| Özellik | Ethereum | Alternatifler |
|---------|----------|---------------|
| Trustless Execution | Akıllı sözleşmeler, kod = kural | Merkezi sistemler değiştirilebilir |
| Transparency | Tüm işlemler kamuya açık | EKAP verileri kapalı |
| Immutability | Teklifler değiştirilemez (deadline sonrası) | Veritabanı kayıtları silinebilir |
| Composability | Dispute + Escrow + Registry entegrasyonu | Silo sistemler |
| Censorship Resistance | Hiçbir otorite teklifi engelleyemez | Merkezi sistemlerde mümkün |
| Global Access | İnternet olan herkes katılabilir | Coğrafi/bürokratik engeller |
| Deterministic Execution | Aynı girdi her zaman aynı çıktı | İnsan kararları özneldir |
| Audit Trail | Her işlem block explorer'da görünür | Kapalı sunucu logları |

## Zama FHE Avantajları

| Özellik | Açıklama |
|---------|----------|
| Encrypted Computation | Şifreli veri üzerinde toplama, karşılaştırma, min/max |
| On-chain Privacy | Veriler düz metin olarak hiçbir zaman görünmez |
| Composability | FHE sonuçları diğer sözleşmelerde kullanılabilir |
| Deterministic | Aynı girdi her zaman aynı sonucu verir |
| No Trusted Setup | Groth16/PLONK gibi trusted setup gerektirmez |

---

## Tasarım Kararları Özeti

| Karar | Gerekçe |
|-------|---------|
| 4 parametre şifreleme | HCU maliyeti dengelemesi |
| Ağırlıklar açık | Yasal gereklilik (şeffaflık) |
| Gate + Price Ranking | FHE.div gerekmez |
| Max 10 firma | HCU limitleri |
| Mock KYC | Hackathon scope |
| Oracle fiyat ayarı | Gerçek dünya ihtiyacı |
| Stake/Slash | Caydırıcılık |
| First-submitter tiebreak | Basitlik + teşvik |
| Deadline öncesi güncelleme | Esneklik |
| Winner address + price açık | Yasal zorunluluk |

---

## Dürüst Değerlendirme

SealTender, ihale yolsuzluğunun **en büyük ve en yaygın** biçimlerini — teklif sızıntısı ve değerlendirici tarafgirliği — kriptografik olarak çözer. Ancak:

1. **Tamamen trustless değil:** KMS/Gateway güven gerektirir
2. **Off-chain sorunları çözemez:** Şartname manipülasyonu, rotasyon, kalite
3. **Ölçek limiti var:** Max 10 firma/ihale (HCU maliyeti)
4. **KYC mock:** Gerçek dünya dağıtımı için WorldID/Polygon ID gerekir
5. **Tek zincir:** Cross-chain ihale desteği yok

Bu limitasyonlara rağmen, SealTender mevcut elektronik ihale sistemlerine kıyasla **büyüklük sırasıyla** daha güvenli ve şeffaf bir alternatif sunmaktadır. $13 trilyon pazarın %10'unun kurtarılması bile **$1.3 trilyon** tasarruf anlamına gelir.
