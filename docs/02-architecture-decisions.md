# SealTender: Mimari Kararlar

Bu belge, SealTender protokolünün tasarımında alınan 10 temel mimari kararı, gerekçeleriyle birlikte açıklamaktadır.

---

## Karar 1: Fiyat + 3 Yeterlilik Parametresi Şifreleme

**Karar:** Fiyatın yanı sıra deneyim yılı, tamamlanan proje sayısı ve teminat kapasitesi de FHE ile şifrelenir.

**Gerekçe:**
- Sadece fiyat şifrelenirse, yeterlilik parametreleri açık kalır ve rakip analizi mümkün olur
- 4 parametre, FHE Homomorphic Computation Unit (HCU) maliyeti açısından kabul edilebilir seviyededir
- `euint64` (fiyat, teminat) + `euint32` (yıl, proje) kullanımı HCU optimize eder

**Alternatif:** Tüm parametreleri (10+) şifrelemek HCU maliyetini 10x artırır, gas limitlerine takılır.

**Trade-off:** Daha fazla parametre = daha iyi gizlilik, ama daha yüksek maliyet. 4 parametre doğru denge noktasıdır.

---

## Karar 2: Ağırlıklar Herkese Açık

**Karar:** Değerlendirme ağırlıkları (weightYears, weightProjects, weightBond) ihale oluşturulurken açık olarak belirlenir ve herkese görünür.

**Gerekçe:**
- **Yasal zorunluluk:** Türk Kamu İhale Kanunu (4734 sayılı) ve AB İhale Direktifleri, değerlendirme kriterlerinin ve ağırlıklarının ihale ilanında açıkça belirtilmesini zorunlu kılar
- Şeffaflık, ihalenin adaletini doğrulamanın tek yoludur
- Firmalar, ağırlıklara göre stratejik teklif verebilmelidir (bu adil rekabettir)

**Alternatif:** Ağırlıkları da şifrelemek teknik olarak mümkün ama hukuken geçersiz.

---

## Karar 3: Gate + Price Ranking (İki Aşamalı Değerlendirme)

**Karar:** Değerlendirme iki aşamada yapılır:
1. **Gate (Eşik):** Minimum gereksinimler kontrolü (minYears, minProjects, minBond)
2. **Price Ranking:** Eşiği geçen teklifler arasında en düşük fiyat kazanır

**Gerekçe:**
- FHE'de `division` operasyonu desteklenmez — weighted average hesaplaması imkansız
- Gate + Rank yaklaşımı sadece `comparison` (FHE.lt, FHE.min) gerektirir
- Gerçek dünyada da "en düşük fiyat" hala en yaygın ihale metodudur

**FHE İşlemleri:**
```
Gate:  FHE.lt(encYears, minYears) → disqualify
       FHE.lt(encProjects, minProjects) → disqualify
       FHE.lt(encBond, minBond) → disqualify
Rank:  FHE.min(encPrice_1, encPrice_2, ...) → winner
```

**Alternatif:** Weighted scoring + FHE.mul mümkün ama division olmadan normalize edilemez. Gate + Rank daha temiz.

---

## Karar 4: Maksimum 10 Firma

**Karar:** Her ihaleye en fazla 10 firma katılabilir (`maxBidders <= 10`).

**Gerekçe:**
- FHE pairwise karşılaştırma O(n^2): 10 firma = 45 FHE.lt çağrısı
- Her FHE.lt ~200K gas. 45 * 200K = ~9M gas (blok limitine yakın)
- CollisionDetector: 10 firma = 45 FHE.eq çağrısı
- Gerçek dünyada büyük altyapı ihalelerine genellikle 5-8 firma katılır

**HCU Maliyet Analizi:**

| Firma Sayısı | Gate HCU | Ranking HCU | Collision HCU | Toplam Gas |
|-------------|----------|-------------|---------------|------------|
| 3 | 33 | 14 | 12 | ~5M |
| 5 | 55 | 28 | 40 | ~10M |
| 7 | 77 | 42 | 84 | ~16M |
| 10 | 110 | 63 | 180 | ~23M |
| 20 | 220 | 133 | 760 | ~95M (imkansız) |

**Alternatif:** Turnuva stili (round-robin) ile daha fazla firma desteklenebilir ama karmaşıklık artar. `evaluateBatch()` fonksiyonu batch processing destekler, ama toplam gas hala O(n^2) kalır.

---

## Karar 5: Sadece Kazanan Adres + Fiyat Açığa Çıkar

**Karar:** İhale sonucunda sadece kazananın adresi ve fiyatı açıklanır. Diğer teklifler şifreli kalır.

**Gerekçe:**
- **Yasal zorunluluk:** İhale sonucu kamuya açık olmalıdır
- **Gizlilik:** Kaybeden firmaların teklifleri ticari sır olarak korunur
- Gelecek ihalelerde stratejik bilgi sızıntısı önlenir
- `WinnerRevealed(address winner, uint256 price)` event yayınlanır

**Alternatif:** Tüm teklifleri açmak mümkün ama gereksiz bilgi sızıntısı yaratır.

---

## Karar 6: Mock KYC Whitelist

**Karar:** Hackathon scope'unda BidderRegistry, owner tarafından yönetilen bir whitelist olarak çalışır.

**Gerekçe:**
- Gerçek KYC entegrasyonu (WorldID, Polygon ID, Galxe) hackathon süresinde mümkün değil
- `registerBidder()` → `isVerified()` akışı, KYC adaptörü için hazır arayüz sağlar
- İtibar sistemi (reputation score) whitelist üzerine inşa edilmiştir

**Üretim Planı:**
1. WorldID integration (Sybil resistance)
2. Polygon ID (verifiable credentials)
3. Off-chain KYC oracle (merkezi ama doğrulanabilir)

---

## Karar 7: Oracle-Bazlı Fiyat Ayarlaması + Otomatik Ödeme

**Karar:** Uzun süreli sözleşmelerde malzeme fiyat değişimleri, oracle-bazlı `PriceEscalation` modülü ile yönetilir. Chainlink AggregatorV3Interface entegre edilmiştir.

**Gerekçe:**
- İnşaat ihaleleri 1-5 yıl sürebilir; çelik, çimento fiyatları %50+ değişebilir
- **Chainlink oracle entegrasyonu tamamlandı:** `setPriceFeed(materialId, feedAddress)` ile Chainlink feed bağlanır
- `getLatestPrice()` önce Chainlink feed kontrol eder, yoksa manuel `latestPrices` fallback kullanır
- Chainlink verisinde staleness check: `block.timestamp - updatedAt < 1 days`
- Threshold + cap sistemi hem firmayı hem belediyeyi korur
- `MAX_PRICE_CHANGE_BPS = 5000` (50%) sanity check, oracle manipülasyonunu sınırlar

**Otomatik Ödeme Mekanizması (YENİ):**
- `setTenderWinner(tenderId, winnerAddress)` ile kazanan belirlenir
- `depositEscalationBudget(tenderId)` ile belediye eskalasyon bütçesi yatırır
- `evaluateEscalation()` tetiklendiğinde, ek ödeme otomatik olarak kazanana gönderilir
- Yetersiz bütçe durumunda `InsufficientEscalationBudget` revert eder

**Parametreler:**
| Parametre | Açıklama |
|-----------|----------|
| baselinePrice | Sözleşme anındaki fiyat |
| thresholdPercent | Tetikleme eşiği (bps) |
| capPercent | Maksimum ayarlama (bps) |
| periodSeconds | Minimum değerlendirme periyodu |
| priceFeeds[materialId] | Chainlink feed adresi |
| escalationBudget[tenderId] | Belediyenin yatırdığı eskalasyon bütçesi |
| tenderWinner[tenderId] | Kazanan firma adresi |

---

## Karar 8: Stake/Slash Mekanizması

**Karar:** Şirket şikayetleri 0.01 ETH stake gerektirir. Dismiss edilirse stake belediyeye yanar.

**Gerekçe:**
- **Spam önleme:** Rakiplerin frivolous şikayet bombardımanını önler
- **Caydırıcılık:** Asılsız şikayetin maliyeti var
- **Gelir:** Belediye, dismiss edilen şikayetlerden gelir elde eder (perverse incentive riski kabul)
- **Asimetri:** Vatandaş şikayetleri ücretsiz (erişim hakkı)

**Slash Akışı:**
```
Company Complaint → Stake 0.01 ETH
├── Slashed: Accused'ın escrow'u → Municipality, Stake → Complainant'e geri
└── Dismissed: Stake → Municipality'ye yanar (StakeBurned event)
```

**Alternatif:** Stake'i yakmak yerine iade etmek — ama bu spam teşvik eder.

---

## Karar 9: First-Submitter Tiebreak

**Karar:** Aynı fiyatta birden fazla teklif varsa, ilk gönderen kazanır.

**Gerekçe:**
- FHE'de tam eşitlik kontrolü yapılır (CollisionDetector)
- Deterministik kural: block.timestamp + tx index
- Basit ve tarafsız
- Firmalara erken teklif teşviki sağlar

**Alternatif:** Random tiebreak (VRF), ek yeterlilik parametreleri ile tiebreak. Ama basitlik > karmaşıklık.

---

## Karar 10: Deadline Öncesi Teklif Güncelleme

**Karar:** Firmalar, deadline'a kadar tekliflerini güncelleyebilir (`updateBid()`).

**Gerekçe:**
- Gerçek dünyada firmalar son dakika fiyat güncellemesi yapabilir
- FHE şifreleme sayesinde güncellemeler de gizlidir
- `version` counter ile güncelleme sayısı takip edilir
- `BidUpdated(address bidder, uint256 version)` event yayınlanır

**Güvenlik:**
- Güncelleme sadece Bidding state'inde ve deadline öncesinde mümkün
- Her güncelleme yeni FHE encryption gerektirir (replay attack imkansız)

---

## Hackathon vs Üretim Kapsamı

| Özellik | Hackathon | Üretim |
|---------|-----------|--------|
| KYC | Mock whitelist | WorldID / Polygon ID |
| Oracle | Chainlink + manual fallback | Chainlink + TWAP + multi-oracle |
| Max Bidders | 10 | 50+ (turnuva stili) |
| Token | ConfidentialUSDC (ERC7984 wrap/unwrap + faucet) | USDC (Circle) + ConfidentialUSDC |
| Decryption | Gateway (trusted) | Threshold (trustless) |
| Frontend | Basic Next.js + RainbowKit + wagmi | Full dApp + mobile |
| Audit | Self-audit (90/100) | Professional (Trail of Bits) |
| Chain | Sepolia | Mainnet + L2 |
| Gas | viaIR + 800 runs optimizer | Assembly + batch + L2 |
| Governance | Owner (Ownable2Step) | DAO / Multi-sig + Timelock |
| Legal | N/A | Regulatory compliance |
| Escalation | Auto-payment to winner | Escrow-funded multi-material |
| Testing | 367 tests (unit + integration + edge) | Formal verification + fuzzing |
