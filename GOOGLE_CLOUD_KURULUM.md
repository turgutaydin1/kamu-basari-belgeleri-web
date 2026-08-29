# Kamu Kurumları Başarı Belgeleri — Google Cloud + Google Sites

Bu sürüm Railway kullanmaz. Uygulama Google Cloud Compute Engine üzerinde Docker ile çalışır; kullanıcı verileri VM'nin kalıcı diskinde `/opt/basari-data` altında tutulur. Google Sites yalnızca uygulamayı sayfa içine gömer.

## 1. Google Cloud projesini aç

1. https://console.cloud.google.com adresine mevcut Google hesabınızla girin.
2. Üstteki proje seçiciden **Yeni Proje** oluşturun. Örnek ad: `kamu-basari-belgeleri`.
3. Google Cloud ilk kullanımda faturalandırma hesabı bağlamanızı isteyebilir. Bu yeni bir üçüncü taraf hesabı değildir; Google hesabınızın Cloud hizmetidir.

## 2. Sabit IP ayır

1. Google Cloud Console > **VPC network > IP addresses** bölümüne girin.
2. **Reserve external static IP address** seçin.
3. Ad: `basari-web-ip`
4. Tür: IPv4 / Regional.
5. Kullanacağınız bölgeyi seçin ve **Reserve** deyin.
6. Oluşan IP adresini bir yere not edin.

## 3. VM oluştur

1. Google Cloud Console > **Compute Engine > VM instances > Create instance**.
2. Ad: `basari-web`.
3. Bölge/zone: Sabit IP ile aynı bölge.
4. İşletim sistemi: **Ubuntu 24.04 LTS** veya **Debian 12**.
5. Başlangıç için `e2-small` yeterlidir; kullanım arttıkça büyütülebilir.
6. Networking bölümünde External IPv4 olarak biraz önce ayırdığınız `basari-web-ip` adresini seçin.
7. Firewall bölümünde **Allow HTTP traffic** ve **Allow HTTPS traffic** seçeneklerini işaretleyin.
8. VM'yi oluşturun.

## 4. VM'ye bağlan ve uygulamayı kur

VM satırındaki **SSH** düğmesine basın. Açılan siyah ekranda sırayla:

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2 git
sudo systemctl enable --now docker
cd /opt
sudo git clone https://github.com/turgutaydin1/kamu-basari-belgeleri-web.git basari-web
sudo chown -R $USER:$USER /opt/basari-web
cd /opt/basari-web
cp .env.example .env
```

Sonra `.env` dosyasını açın:

```bash
nano .env
```

Şunları kendi bilgilerinizle değiştirin:

```text
WEB_ADMIN_EMAIL=kendi_eposta_adresiniz
WEB_ADMIN_PASSWORD=guclu_yonetici_parolaniz
WEB_TRIAL_DAYS=7
WEB_TRIAL_RECORD_LIMIT=10
WEB_SESSION_DAYS=7
APP_DOMAIN=SABIT_IP_ADRESINIZ.sslip.io
```

Örnek IP `34.123.45.67` ise:

```text
APP_DOMAIN=34.123.45.67.sslip.io
```

Nano'da kaydetmek için `Ctrl+O`, Enter; çıkmak için `Ctrl+X`.

Veri klasörünü ve uygulamayı başlatın:

```bash
sudo mkdir -p /opt/basari-data
sudo chown -R $USER:$USER /opt/basari-data
docker compose up -d --build
```

İlk kurulum birkaç dakika sürebilir.

## 5. Uygulamayı test et

Tarayıcıda şunu açın:

```text
https://SABIT_IP_ADRESINIZ.sslip.io
```

Caddy otomatik HTTPS sertifikası almaya çalışır. İlk açılışta sertifikanın oluşması kısa süre alabilir.

Beklenen ekran:

- Giriş Yap
- Üye Ol / Deneme Başlat

`.env` dosyasına yazdığınız yönetici e-posta/parolasıyla giriş yaptığınızda yönetici hesabı açılır.

## 6. Deneme üyeliğini kontrol et

1. Gizli tarayıcı penceresi açın.
2. Uygulama adresine girin.
3. **Üye Ol / Deneme Başlat** bölümünden farklı e-posta ile kullanıcı oluşturun.
4. Varsayılan hak: **7 gün / 10 yeni kayıt**.
5. Yönetici hesabından **Üye Yönetimi** bölümünde kullanıcıyı `TRIAL`, `FULL` veya `BLOCKED` yapabilirsiniz.

## 7. Google Sites'e göm

1. https://sites.google.com adresinde sitenizi düzenleyin.
2. Sağ panel > **Ekle > Yerleştir (Embed)**.
3. URL olarak uygulama adresini girin:

```text
https://SABIT_IP_ADRESINIZ.sslip.io
```

4. Ekle deyin.
5. Uygulama çerçevesini sayfada genişletin.
6. Siteyi yayınlayın.

## 8. GitHub'a yeni sürüm yüklediğinizde sunucuyu güncelle

VM'ye SSH ile bağlanıp:

```bash
cd /opt/basari-web
git pull
docker compose up -d --build
```

Kullanıcı verileri `/opt/basari-data` altında olduğu için kod güncellemesi sırasında silinmez.

## 9. Yedekleme

Önemli veri klasörü:

```text
/opt/basari-data
```

Bu klasörü Google Cloud disk snapshot ile veya ayrıca yedekleyebilirsiniz.

## Not

Bu mimaride GitHub yalnızca kaynak kod deposudur. Kullanıcı verileri GitHub'a yazılmaz. Gerçek kullanıcı verileri Google Cloud VM'nin kalıcı diskinde tutulur.
