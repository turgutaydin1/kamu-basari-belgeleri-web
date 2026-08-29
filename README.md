# Kamu Kurumları Başarı Belgeleri — Web Demo

Bu depo, masaüstünde tamamlanan **Kamu Kurumları Başarı Belgeleri Düzenleme ve Takip Sistemi'nin orijinal `app.py` sürümünü** web demosunda doğrudan çalıştırır.

## Temel ilke

Web demosu için Başarı Belgeleri sistemi yeniden yazılmamıştır ve sadeleştirilmiş bir taklit arayüz kullanılmaz.

- `app.py` → orijinal ve tam Başarı Belgeleri sistemi
- `web_auth.py` → tanıtım sayfası, üyelik, giriş, demo limiti ve kullanıcı çalışma alanı
- `web_app.py` → web giriş noktası; `BASARI_WEB_MODE=1` ile doğrudan orijinal `app.py`yi açar

Kullanıcı akışı:

**Tanıtım → Demoyu Dene → Üyelik → Orijinal Başarı Belgeleri Sistemi**

Üye giriş yaptıktan sonra gördüğü kayıt, fotoğraf, imza, Excel aktarımı, Taslak, Olur, toplu işlemler, kesinleştirme, tarih/sayı, PDF, Üstün Başarı dayanakları, arşiv, sistem ayarları ve yedekleme ekranları `app.py`deki gerçek sistemdir.

## Demo üyeliği

Yeni kullanıcı varsayılan olarak:

- 7 gün
- 10 yeni kayıt

ile `TRIAL` hesabı açar. Demo sınırı yalnız üyelik/kullanım sınırıdır; program özellikleri temsili ekranlara dönüştürülmez.

Yönetici üyeyi `TRIAL`, `FULL` veya `BLOCKED` yapabilir ve kayıt limitini değiştirebilir.

## Kullanıcı verileri

Her üyeye ayrı çalışma klasörü açılır. Orijinal uygulamanın SQLite veritabanı, fotoğrafları, imzaları, belgeleri, şablonları ve yedekleri bu kullanıcı alanında tutulur; kullanıcı verileri birbirine karışmaz.

Kalıcı bir sunucuda `/data` dizini kalıcı disk/volume olarak bağlanmalıdır.

## Çalıştırma

Gerekli Python paketleri `requirements.txt` içindedir.

Web demosunun giriş dosyası:

`web_app.py`

Çalıştırma komutu:

`streamlit run web_app.py`

İsteğe bağlı ortam değişkenleri:

- `WEB_DATA_ROOT` — kalıcı veri dizini; varsayılan `/data`
- `WEB_TRIAL_DAYS` — varsayılan `7`
- `WEB_TRIAL_RECORD_LIMIT` — varsayılan `10`
- `WEB_SESSION_DAYS` — oturum süresi; varsayılan `7`
- `WEB_ADMIN_EMAIL` — ilk yönetici e-postası
- `WEB_ADMIN_PASSWORD` — ilk yönetici parolası

## Google Sites

Google Sites tanıtım/portal katmanı olarak kullanılabilir. Gerçek program Python/Streamlit çalıştırabildiği bir web adresinde yayınlanır; bu adres Google Sites'e bağlantı veya uygun olduğunda gömme yoluyla eklenebilir.

Google Apps Script ile hazırlanmış eski sadeleştirilmiş prototip kaldırılmıştır; çünkü orijinal sistemi birebir göstermiyordu.

## Durum

Repo tarafındaki doğru mimari hazırdır. İnternete açık gerçek kullanım için sonraki adım, `web_app.py`yi **kalıcı `/data` alanı bulunan bir Python/Streamlit sunucusunda** yayınlamaktır.
