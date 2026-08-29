from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'apps-script'
OUT = ROOT / 'apps-script-deploy'
OUT.mkdir(exist_ok=True)

SERVER_ORDER = [
    'Code.gs',
    'FirstRunService.gs',
    'RecordService.gs',
    'ExcelService.gs',
    'BulkService.gs',
    'SettingsService.gs',
    'PdfService.gs',
    'PdfGuardService.gs',
    'BackupService.gs',
    'BulkExportService.gs',
    'ParityService.gs',
]

code_parts = []
for name in SERVER_ORDER:
    path = SRC / name
    if not path.exists():
        raise SystemExit(f'Missing server source: {name}')
    code_parts.append(f'\n/* ===== {name} ===== */\n' + path.read_text(encoding='utf-8').strip() + '\n')
(OUT / 'Code.gs').write_text('\n'.join(code_parts), encoding='utf-8')

index = (SRC / 'Index.html').read_text(encoding='utf-8')
styles = (SRC / 'Styles.html').read_text(encoding='utf-8')
styles = re.sub(
    r'<script>\s*window\.addEventListener\(\'load\',[\s\S]*?</script>\s*$',
    '',
    styles,
    flags=re.I,
)
portfolio_styles = (SRC / 'PortfolioStyles.html').read_text(encoding='utf-8')
portfolio = (SRC / 'PortfolioLanding.html').read_text(encoding='utf-8')
core = (SRC / 'ClientCore.html').read_text(encoding='utf-8')
pdf = (SRC / 'ClientPdf.html').read_text(encoding='utf-8')
parity = (SRC / 'ClientParity.html').read_text(encoding='utf-8')
setup = (SRC / 'ClientSetup.html').read_text(encoding='utf-8')
lifecycle = (SRC / 'ClientLifecycle.html').read_text(encoding='utf-8')

# SABİT MİMARİ KURALI:
# Ana sayfa tek bir ürün landing page'i değildir. Genel proje vitrini her derlemede
# zorunlu olarak PortfolioLanding.html'den alınır. Başarı Belgeleri bu vitrindeki
# projelerden yalnızca biridir.
landing_pattern = r'<!-- TANITIM / ÜYELİK -->[\s\S]*?(?=<div id="authModal")'
if not re.search(landing_pattern, index):
    raise SystemExit('Portfolio insertion point not found in Index.html')
index = re.sub(
    landing_pattern,
    '<!-- GENEL PROJE VİTRİNİ — PORTFOLIO_ARCHITECTURE_LOCK.md ile sabittir -->\n' + portfolio + '\n\n',
    index,
    count=1,
)

index = index.replace("<?!= include('Styles'); ?>", styles + '\n' + portfolio_styles)
index = index.replace("<?!= include('ClientCore'); ?>", core)
index = index.replace("<?!= include('ClientPdf'); ?>", pdf + '\n' + parity + '\n' + setup + '\n' + lifecycle)
if '<?!=' in index:
    raise SystemExit('Unresolved Apps Script include remains in deployment Index.html')

# Eski tek-ürün pazarlama katmanının tekrar girmesini derleme aşamasında engelle.
if 'Başarı Belgesi işlemlerini mevcut programdaki iş akışıyla yönetin' in index:
    raise SystemExit('Legacy single-product landing detected; portfolio architecture must remain locked.')
if 'id="projeler"' not in index or 'Havaalanı Geçiş İzin Yönetim Sistemi' not in index:
    raise SystemExit('Multi-project portfolio landing is missing from deployment Index.html')

(OUT / 'Index.html').write_text(index, encoding='utf-8')

manifest = SRC / 'appsscript.json'
if manifest.exists():
    (OUT / 'appsscript.json').write_text(manifest.read_text(encoding='utf-8'), encoding='utf-8')

readme = '''# Apps Script Dağıtım Paketi\n\nBu klasör otomatik üretilir. Google Apps Script'e yalnız şu dosyaları aktarın:\n\n- `Code.gs`\n- `Index.html`\n- gerekirse `appsscript.json`\n\n## SABİT ANA MİMARİ\n\nİlk ekran **genel proje vitrini**dir; tek bir Başarı Belgeleri landing page'i değildir.\nBaşarı Belgeleri, HGİYS ve Hanut Takip gibi projeler bu vitrinde ayrı ürün kartları olarak yer alır.\nYeni projeler mevcut vitrin bozulmadan yeni kart olarak eklenir.\nBu kural `docs/PORTFOLIO_ARCHITECTURE_LOCK.md` dosyasında sabitlenmiştir.\n\nİlk açılışta yönetici hesabı web ekranından oluşturulur; ayrıca kod eklemeniz gerekmez.\nGeliştirme kaynakları `apps-script/` klasöründedir. Bu klasördeki dağıtım çıktısını elle düzenlemeyin.\n'''
(OUT / 'README.md').write_text(readme, encoding='utf-8')
print('Apps Script deployment package built successfully with locked multi-project portfolio.')
