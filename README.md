# Teknoloji Bülteni

Teknoloji Bülteni, Türkiye ve dünyadaki teknoloji gelişmelerini Türkçe ve İngilizce takip edebileceğin bir haber arşivi. Yapay zekâ, yazılım, donanım, siber güvenlik, girişimler ve teknoloji sektöründeki kariyer gelişmelerini tek yerde toplar.

**[Canlı siteyi aç →](https://teknolojibulteni.com.tr/)**

## Sitede neler var?

- Haberleri tarihe, kategoriye ve içerik türüne göre filtreleyebilirsin.
- Başlık veya kaynak adıyla arama yapabilirsin.
- Haberlerin kısa özetlerini okuyabilir ve ilgili kaynaklara gidebilirsin.
- Araştırma yazılarını ve yazılım sürümlerini ayrı sekmelerde inceleyebilirsin.
- Üst menüden Türkçe ve İngilizce arasında geçiş yapabilirsin.

## Bülten nasıl güncelleniyor?

Otomatik tarama her sabah Türkiye saatiyle **09.00’da** çalışır. Kaynak listesinde **546 haber kanalı ve 67 bülten** bulunur. Tarama, kaynaklardan okuyabildiği tarihli içerikleri toplar ve aynı haberin tekrarlarını birleştirir.

Bir önceki gün yayımlanıp sabah taramasında ilk kez bulunan haberler, yeni bültende **Dünden eklenenler** bölümünde görünür. Her kartta haberin gerçek yayın tarihi yazılıdır.

## Proje dosyaları

- `site.html`, `site.css` ve `headline-feed.js` — Site arayüzü, filtreler ve arama.
- `archive-collector.mjs` — Kaynak taraması ve haberlerin toplanması.
- `archive-localize.py` — Başlık ve özetlerin dil desteği.
- `worker.mjs` — Haber arşivini sunan API.
- `sources.txt` — Taramada kullanılan kaynak listesi.

---

## English · Technology Brief

Technology Brief is a bilingual news site covering technology in Türkiye and around the world. It brings together news on AI, software, hardware, cybersecurity, startups, and careers in tech.

**[Visit the live site](https://teknolojibulteni.com.tr/)**

### Features

- Switch between Turkish and English from the top menu.
- Search by headline or source and filter by date, topic, or content type.
- Read short summaries and follow links to the original sources.
- Browse research papers and software releases in dedicated tabs.

### How it updates

The automated scan runs every morning at **9:00 a.m. Türkiye time**. It checks **613 sources**, including 546 news outlets and feeds and 67 newsletters. It collects dated entries it can access and merges duplicate coverage.

Stories published the previous day and first found in the morning scan appear in **Added from yesterday**. Each story keeps its original publication date.
