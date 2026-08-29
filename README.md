# Kurumsal Yazılım Çözümleri — Proje Vitrini ve Başarı Belgeleri Web

Bu depo artık yalnız tek bir Başarı Belgeleri landing page'i değildir. Web giriş ekranı, geliştirilen **birden fazla kurumsal yazılım projesini tanıtan genel proje vitrini** olarak tasarlanmıştır.

## SABİT ANA MİMARİ

Bu karar geri alınmayacaktır:

**Genel Proje Vitrini → Proje Kartı / Proje Detayı → Demo veya Üye Girişi → İlgili Gerçek Uygulama**

Başarı Belgeleri sistemi, ana vitrindeki projelerden yalnızca biridir.

Ana vitrin hiçbir geliştirmede tekrar yalnız Başarı Belgeleri tanıtımına çevrilmemelidir. Ayrıntılı sabit karar:

`docs/PORTFOLIO_ARCHITECTURE_LOCK.md`

Derleme sistemi de bu kuralı teknik olarak kontrol eder.

## Vitrindeki başlangıç projeleri

- **Kamu Kurumları Başarı Belgeleri Düzenleme ve Takip Sistemi** — aktif web demo
- **Havaalanı Geçiş İzin Yönetim Sistemi (HGİYS)** — portföyde, demo daha sonra
- **İstanbul Havalimanı Hanut Takip Sistemi** — portföyde, demo daha sonra
- Yeni projeler — mevcut grid bozulmadan yeni kart olarak eklenir

## Bugünkü yayın mimarisi

Şu anda hedeflenen ücretsiz/geçiş dönemi mimarisi:

**Google Sites → genel tanıtım/portal → Google Apps Script web uygulaması → Google Sheets / Google Drive**

Apps Script geliştirme kaynakları:

`apps-script/`

Google Apps Script'e aktarılacak otomatik hazırlanmış paket:

`apps-script-deploy/`

Bu klasörde temel olarak:

- `Code.gs`
- `Index.html`
- `appsscript.json`

bulunur.

`tools/build_apps_script_deploy.py`, kaynak dosyalardan dağıtım paketini otomatik üretir.

## Portföy vitrini nasıl sabitleniyor?

Ana vitrin iki kaynak dosyada tutulur:

- `apps-script/PortfolioLanding.html`
- `apps-script/PortfolioStyles.html`

Derleme sırasında bu içerik zorunlu olarak dağıtım `Index.html`ine yerleştirilir.

Eski tek-ürün Başarı Belgeleri landing metni tekrar dağıtıma girerse derleme hata verir. Böylece uygulama içindeki düzeltmeler ana vitrini geriye döndüremez.

## Başarı Belgeleri sistemi

Başarı Belgeleri web demosu masaüstündeki gerçek iş kurallarını temel alır. Amaç temsili bir demo değil, gerçek özellikleri çalışan web sürümüdür.

Ana bölümler:

1. Ana Sayfa
2. Yeni Belge Kaydı
3. Excel’den Yeni Toplu Kayıt Ekle
4. Taslak Kayıtlar
5. Olur Listesindeki Kayıtlar
6. Belge Arşivi
7. Toplu İşlemler
8. Sistem Ayarları
9. Yedekleme ve Dışa Aktarım

Temel belge akışı:

**TASLAK → OLUR LİSTESİNDE → PDF HAZIRLA / TARİH-SAYI → İMZALANDI VE TESLİM EDİLDİ**

Üstün Başarı tarafında geçerli Başarı Belgeleri dayanak ilişkileri, fotoğraf/imza, Excel, toplu işlemler, arşiv ve PDF şablonları korunur.

## Demo üyeliği

Yeni demo kullanıcıları varsayılan olarak:

- 7 gün
- 10 yeni kayıt

hakkıyla açılır.

Demo limiti yalnız kullanım sınırıdır; özellikler temsili ekranlara dönüştürülmez.

## Açılış / oturum davranışı

Apps Script sürümünde açılış çağrılarının ekranı sonsuza kadar kilitlememesi, sekmeye geri dönüldüğünde görünümün toparlanması ve kullanıcı çıkışında Ctrl+F5 gerekmemesi hedeflenen zorunlu davranıştır.

Bu davranış `ClientLifecycle.html` katmanında tutulur; vitrin tasarımıyla karıştırılmamalıdır.

## Daha sonra normal hosta geçiş

Uzun vadede normal hosta geçildiğinde backend PHP/MySQL veya seçilecek başka bir sunucu teknolojisine taşınabilir.

Ancak şu iki şey değişmez:

1. Ana ürün mimarisi: **genel proje vitrini → proje → demo/üyelik → uygulama**
2. Başarı Belgeleri iş kuralları ve gerçek ekran/işlem kapsamı

Bugünden tablo ve servis mantığı mümkün olduğunca bu taşınabilirliğe göre ayrılmaktadır.
