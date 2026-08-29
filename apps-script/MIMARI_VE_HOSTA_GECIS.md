# MİA Başarı Belgeleri — Taşınabilir Web Mimarisi

Bu klasördeki web sürümünün referansı `BasariProgrami.zip` içindeki güncel çalışan `app.py` ve `basari_belgesi.db` yapısıdır. Amaç önce Google Apps Script / Sheets / Drive üzerinde ücretsiz demo yayını, daha sonra normal bir hostta PHP + MySQL/MariaDB ortamına geçiştir.

## Değişmeyecek uygulama sözleşmesi

Durum akışı:

`TASLAK -> OLUR_LISTESINDE -> PDF HAZIRLA / tarih-sayı ver -> TESLIM_EDILDI`

İptal ayrı durumdur. Olur listesine geçişte fotoğraf zorunludur. Olur aşamasında tarih/sayı verilmez. Tarih ve sayı PDF hazırlama sırasında, belge türü + yıl sayacı üzerinden atomik olarak ayrılır. Olur'a girişten sonraki ilk 3 gün kontrollü düzenleme/Taslağa dönüş süresidir. Aktif bir Üstün Başarı kaydında dayanak olarak kullanılan Başarı Belgesi Taslağa döndürülemez. Normal Üstün Başarı akışında tam 3 geçerli Başarı Belgesi dayanağı gerekir; sistem dışı/eski belgeler için gerekçeli manuel devam ayrı tutulur.

## Masaüstü SQLite -> Web tablo eşlemesi

Masaüstündeki tablolar webde aynı kavramsal isimlerle korunur:

- `records`
- `approval_lists`
- `approval_list_items`
- `counters`
- `superior_basis`
- `achievement_history`
- `audit_log`

Web sürümünde çoklu üyelik gerektiği için bu tablolara `user_id` eklenir. Böylece her demo/tam sürüm kullanıcısı kendi veri alanında çalışır.

Ek web tabloları:

- `users`
- `sessions`
- `config`

## Şimdiki altyapı

- Google Sites: tanıtım/vitrin
- Google Apps Script: uygulama ve servis katmanı
- Google Sheets: ilişkisel veri tablolarının geçici web karşılığı
- Google Drive: fotoğraf, imza, PDF ve yedek dosyaları
- GitHub: tek kaynak deposu

## Sonraki host altyapısı

Arayüz ve iş akışları korunur. Değişen katmanlar:

- Apps Script servisleri -> PHP servis/controller sınıfları
- Google Sheets -> MySQL/MariaDB
- Google Drive yolları -> host dosya alanı veya nesne depolama
- Apps Script oturumu -> PHP session/token sistemi

Tablo ve alan isimleri mümkün olduğunca aynı tutulduğu için veri taşıma `Sheets -> CSV/JSON -> MySQL` şeklinde yapılabilir. Uygulama yeniden tasarlanmaz; backend adaptörü değiştirilir.

## Birebirlik kuralı

Web sürümünde masaüstünde olmayan özellik uydurulmaz; masaüstündeki özellik de bilinçli karar olmadan atılmaz. Menü ve işlem isimleri kaynak uygulamadan alınır:

- Ana Sayfa
- Yeni Belge Kaydı
- Excel’den Yeni Toplu Kayıt Ekle
- Taslak Kayıtlar
- Olur Listesindeki Kayıtlar
- Belge Arşivi
- Toplu Olur Listesine Ekle
- Toplu İmzalandı ve Teslim Edildi
- Toplu Taslağa Döndür
- Toplu PDF İndir
- Toplu Yedekleme
- Fotoğrafları Eşleştir
- Toplu Sil
- Toplu İptal
- Sistem Ayarları
- Yedekleme ve Dışa Aktarım

PDF tarafında masaüstündeki dört gerçek şablon (`dikey_1`, `dikey_2`, `yatay_1`, `yatay_2`) ve `system_config.json` yerleşim değerleri referanstır. Basit/genel bir PDF tasarımı kullanılmayacaktır.
