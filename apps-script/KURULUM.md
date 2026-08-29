# Kamu Kurumları Başarı Belgeleri — Google Sites + Apps Script

Bu sürüm yalnız mevcut Google hesabı ve GitHub hesabıyla çalışmak üzere hazırlanmıştır. Railway, Google Cloud VM, Docker veya ücretli barındırma gerekmez.

## 1) Apps Script projesi oluştur
1. https://script.google.com adresine mevcut Google hesabınızla girin.
2. **Yeni proje** oluşturun.
3. Proje adını `Kamu Başarı Belgeleri Web` yapın.

## 2) Kod dosyalarını ekle
GitHub deposundaki `apps-script` klasörünü açın.

### Code.gs
1. Apps Script editöründeki varsayılan `Code.gs` dosyasını açın.
2. İçeriğini tamamen silin.
3. GitHub'daki `apps-script/Code.gs` içeriğini yapıştırın.

### Index.html
1. Soldaki **+** düğmesi > **HTML** seçin.
2. Dosya adı: `Index`
3. GitHub'daki `apps-script/Index.html` içeriğini yapıştırın.

### appsscript.json
1. Apps Script > **Proje Ayarları**.
2. `appsscript.json manifest dosyasını düzenleyicide göster` seçeneğini açın.
3. `appsscript.json` dosyasını açın.
4. GitHub'daki `apps-script/appsscript.json` içeriğiyle değiştirin.

## 3) İlk sistemi kur
1. Apps Script editöründe fonksiyon listesinden `setupSystem` seçin.
2. Bu fonksiyon parametre istediği için doğrudan Çalıştır yerine Code.gs dosyasının en altına GEÇİCİ olarak şu fonksiyonu ekleyin:

```javascript
function ilkKurulum() {
  setupSystem('KENDI_EPOSTA_ADRESINIZ');
}
```

3. E-posta adresini kendi Google/Gmail adresinizle değiştirin.
4. Fonksiyon listesinden `ilkKurulum` seçip **Çalıştır** deyin.
5. Google izin ekranında uygulamanın Google Sheets ve Drive erişimine izin verin.
6. İşlem tamamlandıktan sonra `ilkKurulum` geçici fonksiyonunu silebilirsiniz.

Bu işlem Google Drive'ınızda otomatik olarak:
- `Kamu Başarı Belgeleri - Sistem Veritabanı` adlı Google Sheets dosyası,
- `Kamu Başarı Belgeleri - Kullanıcı Verileri` adlı Drive klasörü
oluşturur.

## 4) Yönetici hesabı parolası
Yönetici e-postası `setupSystem` ile oluşturulur fakat ilk sürümde yönetici parolası kullanıcı kaydı üzerinden ayarlanır.

En kolay yöntem:
1. Web uygulamasını yayımladıktan sonra aynı e-posta ile **Üye Ol** ekranında kayıt açın.
2. Sonra Apps Script'te `ilkKurulum()` fonksiyonunu tekrar bir kez çalıştırın.
3. Mevcut hesabınız ADMIN + FULL olarak yükseltilir.

## 5) Web uygulamasını yayımla
1. Sağ üstte **Dağıt > Yeni dağıtım**.
2. Tür: **Web uygulaması**.
3. Açıklama: `İlk sürüm`.
4. **Şu kullanıcı olarak çalıştır:** Ben.
5. **Erişimi olanlar:** Herkes.
6. **Dağıt** deyin.
7. Google size `https://script.google.com/macros/s/.../exec` biçiminde bir URL verir.
8. Bu URL'yi saklayın.

## 6) Test
1. Web uygulaması URL'sini gizli sekmede açın.
2. Yeni bir deneme hesabı oluşturun.
3. Giriş yapın.
4. Ana sayfada `Deneme`, kayıt hakkı ve bitiş tarihi görünmelidir.
5. Yeni belge kaydı oluşturun.
6. `Kayıtlar` bölümünde aynı kaydı görün.
7. Çıkış yapıp yeniden giriş yapın; kayıt kalıcı olmalıdır.

Varsayılan yeni üyelik:
- 7 gün
- 10 kayıt

## 7) Üye yönetimi
Yönetici hesabıyla giriş yapınca **Üye Yönetimi** sekmesi görünür.

Buradan kullanıcıyı:
- `TRIAL` — kısıtlı deneme,
- `FULL` — tam sürüm,
- `BLOCKED` — engelli
olarak değiştirebilirsiniz.

Kayıt limiti ve deneme gününü de değiştirebilirsiniz.

## 8) Google Sites'e göm
1. https://sites.google.com adresinde sitenizi açın.
2. Sağ menü > **Ekle** > **Yerleştir**.
3. **URL** seçin.
4. Apps Script web uygulaması `/exec` URL'sini yapıştırın.
5. Ekle deyin.
6. Çerçeveyi sayfada genişletin.
7. Siteyi yayınlayın.

Google Sites yalnızca görünüm katmanıdır; üyelikler, kayıtlar ve kullanıcı dosyaları Apps Script + Sheets + Drive üzerinde çalışır.

## Ücret
Bu düzen Google Apps Script, Google Sheets, Google Drive, Google Sites ve GitHub'ın mevcut ücretsiz kullanım kotaları içinde çalışır. Yoğun/kamu ölçekli kullanımda Google Apps Script günlük kota sınırlarına ulaşılabilir; ilk demo ve sınırlı kullanıcı denemesi için tasarlanmıştır.

## Mevcut Streamlit kaynakları
Depo kökündeki `app.py`, `web_auth.py` ve Python dosyaları önceki Streamlit sürümünün kaynak referansı olarak korunmaktadır. Google Sites'te çalıştırılan sürüm `apps-script` klasöründeki dosyalardır.
