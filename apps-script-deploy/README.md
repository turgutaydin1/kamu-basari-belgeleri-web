# Apps Script Dağıtım Paketi

Bu klasör otomatik üretilir. Google Apps Script'e yalnız şu dosyaları aktarın:

- `Code.gs`
- `Index.html`
- gerekirse `appsscript.json`

## SABİT ANA MİMARİ

İlk ekran **genel proje vitrini**dir; tek bir Başarı Belgeleri landing page'i değildir.
Başarı Belgeleri, HGİYS ve Hanut Takip gibi projeler bu vitrinde ayrı ürün kartları olarak yer alır.
Yeni projeler mevcut vitrin bozulmadan yeni kart olarak eklenir.
Bu kural `docs/PORTFOLIO_ARCHITECTURE_LOCK.md` dosyasında sabitlenmiştir.

İlk açılışta yönetici hesabı web ekranından oluşturulur; ayrıca kod eklemeniz gerekmez.
Geliştirme kaynakları `apps-script/` klasöründedir. Bu klasördeki dağıtım çıktısını elle düzenlemeyin.
