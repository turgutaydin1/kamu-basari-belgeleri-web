# Kamu Kurumları Başarı Belgeleri — Google Sites / Apps Script

Bu depo artık **ücretli sunucu gerektirmeyen Google-only web düzenini** içerir.

## Kullanılan servisler
- Google Sites — vitrin / gömme sayfası
- Google Apps Script — web uygulaması ve üyelik mantığı
- Google Sheets — kullanıcı ve kayıt verileri
- Google Drive — kullanıcıya özel dosya alanları
- GitHub — kaynak kod deposu

Yeni Railway, Google Cloud VM veya başka bir hosting hesabı gerekmez.

## Üyelik sistemi
Yeni kullanıcı varsayılan olarak:
- 7 gün
- 10 yeni kayıt

ile `TRIAL` hesabı açar.

Yönetici kullanıcıyı `TRIAL`, `FULL` veya `BLOCKED` yapabilir; deneme günü ve kayıt limitini değiştirebilir.

## Kullanılacak dosyalar
Google Sites'te çalışacak yeni sürüm:
- `apps-script/Code.gs`
- `apps-script/Index.html`
- `apps-script/appsscript.json`

Kurulum:
- `apps-script/KURULUM.md`
- `ADIM_ADIM_KURULUM.txt`

## Eski Python sürümü
Kök dizindeki `app.py`, `web_auth.py`, `requirements.txt` ve ilgili dosyalar eski Streamlit sürümünün kaynak referansı olarak şimdilik korunmaktadır. Google Sites üzerinde bunlar çalıştırılmaz.

## Önemli not
Google Apps Script ücretsiz kullanım kotalarına tabidir. Bu mimari kısıtlı demo ve düşük/orta hacimli kullanım için uygundur. Çok yüksek eşzamanlı kullanıcı veya yoğun dosya/PDF işleme ihtiyacı olursa ileride sunucu mimarisi ayrıca değerlendirilir.
