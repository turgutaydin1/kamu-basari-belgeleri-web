# PORTFOLIO ARCHITECTURE LOCK

Bu dosya, web projesinin ana giriş mimarisini sabitler. Bu karar görsel tercih değil, ürün mimarisi kuralıdır.

## Değiştirilemez ana kural

İlk `Index` ekranı **tek bir projeye ait landing page değildir**.

Ana ekranın görevi, geliştirilen **birden fazla yazılım projesini tanıtan genel proje vitrini** olmaktır.

Başarı Belgeleri sistemi bu vitrindeki projelerden yalnızca biridir.

Doğru akış:

**Genel Proje Vitrini → Proje Kartı / Proje Detayı → Demo veya Üye Girişi → İlgili Gerçek Uygulama**

Yanlış akış:

**Başarı Belgeleri Landing Page → Demo → Uygulama**

Ana vitrin hiçbir geliştirmede tekrar yalnız Başarı Belgeleri tanıtımına çevrilmeyecektir.

## Ana vitrinde proje modeli

Her proje ayrı kart olarak yer alır. Kart yapısı yeni projeler eklenecek şekilde genişleyebilir kalmalıdır.

Mevcut portföy başlangıcı:

1. **Kamu Kurumları Başarı Belgeleri Düzenleme ve Takip Sistemi** — aktif demo
2. **Havaalanı Geçiş İzin Yönetim Sistemi (HGİYS)** — portföy kartı, demo daha sonra
3. **İstanbul Havalimanı Hanut Takip Sistemi** — portföy kartı, demo daha sonra
4. Yeni projeler — aynı grid yapısına yeni kart olarak eklenir

Bir projenin demo hazır olmaması kartın kaldırılması anlamına gelmez; kart `Yakında` / `Demo Hazırlanıyor` durumunda kalabilir.

## Başarı Belgeleri özel kuralı

Başarı Belgeleri kartından açılan demo, temsili/sadeleştirilmiş ekran değildir. Web sürümü masaüstündeki gerçek iş kurallarını korur.

Ana modüller:

- Ana Sayfa
- Yeni Belge Kaydı
- Excel’den Yeni Toplu Kayıt Ekle
- Taslak Kayıtlar
- Olur Listesindeki Kayıtlar
- Belge Arşivi
- Toplu İşlemler
- Sistem Ayarları
- Yedekleme ve Dışa Aktarım

Gerçek akış:

**TASLAK → OLUR LİSTESİNDE → PDF HAZIRLA / TARİH-SAYI → İMZALANDI VE TESLİM EDİLDİ**

## Teknik sabitleme

`tools/build_apps_script_deploy.py` her dağıtımda `apps-script/PortfolioLanding.html` ve `apps-script/PortfolioStyles.html` dosyalarını zorunlu olarak dağıtım `Index.html`ine yerleştirir.

Derleyici ayrıca eski tek-ürün landing metnini tespit ederse hata verir. Böylece Başarı Belgeleri içinde yapılacak bir düzeltme ana proje vitrininin yanlışlıkla geriye dönmesine neden olamaz.

## Gelecekte hosta geçiş

Bugünkü yayın katmanı Google Apps Script / Google Sites olabilir. Daha sonra normal hosta ve PHP/MySQL benzeri altyapıya geçildiğinde de **genel proje vitrini → proje detayı → üyelik/demo → uygulama** yapısı korunacaktır.

Backend teknolojisi değişebilir; bu ana ürün mimarisi değişmez.
