# Kamu Kurumları Başarı Belgeleri — Web Sürümü

Bu depo, üyelik ve kısıtlı deneme sistemi bulunan web sürümünü içerir.

## Dağıtım modeli

- Google hesabı ile Google Cloud Compute Engine
- Docker ile uygulama çalıştırma
- Kalıcı kullanıcı verileri: `/opt/basari-data`
- HTTPS: Caddy
- Google Sites: uygulamayı sayfa içine gömme
- GitHub yalnız kaynak kod deposudur; kullanıcı verileri GitHub'a yazılmaz.

## Üyelik

Yeni kullanıcı varsayılan olarak `TRIAL` hesabı açar. Varsayılan sınır 7 gün / 10 yeni kayıttır. Yönetici kullanıcıyı `TRIAL`, `FULL` veya `BLOCKED` yapabilir.

## Kurulum

Ayrıntılı ve adım adım anlatım için:

- `GOOGLE_CLOUD_KURULUM.md`
- `ADIM_ADIM_KURULUM.txt`

Railway kullanılmaz.
