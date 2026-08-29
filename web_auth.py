import os, re, hmac, hashlib, secrets, sqlite3, shutil
from pathlib import Path
from datetime import datetime, timedelta, timezone
import streamlit as st

DATA_ROOT = Path(os.environ.get("WEB_DATA_ROOT", "/data")).resolve()
AUTH_DB = DATA_ROOT / "auth.db"
APP_ROOT = Path(__file__).resolve().parent
TRIAL_DAYS = int(os.environ.get("WEB_TRIAL_DAYS", "7"))
TRIAL_RECORD_LIMIT = int(os.environ.get("WEB_TRIAL_RECORD_LIMIT", "10"))
SESSION_DAYS = int(os.environ.get("WEB_SESSION_DAYS", "7"))


def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def _parse(v):
    try:
        return datetime.fromisoformat(v)
    except Exception:
        return _now() - timedelta(days=1)


def _hash(password, salt):
    return hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        bytes.fromhex(salt),
        260000,
    ).hex()


def _conn():
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(AUTH_DB, timeout=30)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA busy_timeout=30000")
    c.executescript(
        """
        CREATE TABLE IF NOT EXISTS users(
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          full_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'USER',
          plan TEXT NOT NULL DEFAULT 'TRIAL',
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          trial_ends_at TEXT,
          record_limit INTEGER,
          records_created INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS sessions(
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
        );
        """
    )
    c.commit()
    _ensure_admin(c)
    return c


def _ensure_admin(c):
    email = os.environ.get("WEB_ADMIN_EMAIL", "").strip().lower()
    password = os.environ.get("WEB_ADMIN_PASSWORD", "")
    if not email or not password:
        return
    if c.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
        return
    salt = secrets.token_hex(16)
    c.execute(
        "INSERT INTO users(id,email,full_name,password_hash,password_salt,role,plan,active,created_at,trial_ends_at,record_limit) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (
            secrets.token_hex(12),
            email,
            "Sistem Yöneticisi",
            _hash(password, salt),
            salt,
            "ADMIN",
            "FULL",
            1,
            _iso(_now()),
            None,
            None,
        ),
    )
    c.commit()


def _workspace(uid):
    return DATA_ROOT / "users" / uid


def _ensure_workspace(user):
    """Her üyeye orijinal masaüstü programının kendi çalışma alanını verir.

    app.py değişmeden bu klasör üzerinde çalışır; dolayısıyla fotoğraf, imza,
    şablon, yedek, veritabanı ve PDF akışı kullanıcılar arasında karışmaz.
    """
    w = _workspace(user["id"])
    w.mkdir(parents=True, exist_ok=True)
    for d in ("Fotograflar", "Yedekler", "Imzalar"):
        (w / d).mkdir(exist_ok=True)
    for d in ("Sablonlar", "Kurumsal"):
        target = w / d
        source = APP_ROOT / d
        if not target.exists() and source.exists():
            shutil.copytree(source, target)
    x = w / "basari_belgesi_excel_sablonu.xlsx"
    source_excel = APP_ROOT / "basari_belgesi_excel_sablonu.xlsx"
    if not x.exists() and source_excel.exists():
        shutil.copy2(source_excel, x)
    return w


def _session_user():
    token = str(st.query_params.get("oturum", "") or "")
    if not token:
        return None
    c = _conn()
    row = c.execute(
        "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>?",
        (token, _iso(_now())),
    ).fetchone()
    c.close()
    return dict(row) if row else None


def _login(email, password):
    c = _conn()
    row = c.execute(
        "SELECT * FROM users WHERE email=?",
        (email.strip().lower(),),
    ).fetchone()
    if not row or not hmac.compare_digest(
        _hash(password, row["password_salt"]),
        row["password_hash"],
    ):
        c.close()
        return None, "E-posta veya parola hatalı."
    if not row["active"] or row["plan"] == "BLOCKED":
        c.close()
        return None, "Bu üyelik kullanıma kapatılmıştır."
    if row["plan"] == "TRIAL" and _parse(row["trial_ends_at"]) < _now():
        c.close()
        return None, "Deneme süreniz sona ermiştir."
    token = secrets.token_urlsafe(32)
    now = _now()
    c.execute(
        "INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)",
        (
            token,
            row["id"],
            _iso(now),
            _iso(now + timedelta(days=SESSION_DAYS)),
        ),
    )
    c.commit()
    c.close()
    st.query_params["oturum"] = token
    return dict(row), ""


def _register(name, email, password):
    name, email = name.strip(), email.strip().lower()
    if len(name) < 3:
        return False, "Ad Soyad girin."
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return False, "Geçerli bir e-posta girin."
    if len(password) < 8:
        return False, "Parola en az 8 karakter olmalıdır."
    c = _conn()
    if c.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
        c.close()
        return False, "Bu e-posta zaten kayıtlı."
    salt = secrets.token_hex(16)
    now = _now()
    c.execute(
        "INSERT INTO users(id,email,full_name,password_hash,password_salt,role,plan,active,created_at,trial_ends_at,record_limit) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (
            secrets.token_hex(12),
            email,
            name,
            _hash(password, salt),
            salt,
            "USER",
            "TRIAL",
            1,
            _iso(now),
            _iso(now + timedelta(days=TRIAL_DAYS)),
            TRIAL_RECORD_LIMIT,
        ),
    )
    c.commit()
    c.close()
    return True, "Üyeliğiniz oluşturuldu. Deneme hesabınızla giriş yapabilirsiniz."


def _landing_css():
    st.markdown(
        """
        <style>
        [data-testid="stSidebar"]{display:none!important}
        .stApp{background:#f5f7fa}
        .block-container{max-width:1240px;padding-top:1.25rem;padding-bottom:4rem}
        .demo-nav{display:flex;align-items:center;justify-content:space-between;gap:16px;
          padding:13px 18px;background:#12365A;color:#fff;border-radius:14px;margin-bottom:22px;
          box-shadow:0 8px 26px rgba(18,54,90,.16)}
        .demo-brand{font-size:1.05rem;font-weight:800;letter-spacing:.1px}
        .demo-brand span{display:block;font-size:.77rem;font-weight:500;opacity:.82;margin-top:2px}
        .hero{background:linear-gradient(135deg,#fff 0%,#f5f9fd 60%,#eef4f9 100%);
          border:1px solid #d8e1e8;border-radius:18px;padding:42px 42px 34px;margin-bottom:18px;
          box-shadow:0 14px 42px rgba(30,55,80,.08)}
        .hero-badge{display:inline-block;background:#eef3f7;color:#12365A;border:1px solid #cbd9e5;
          border-radius:999px;padding:7px 12px;font-size:.78rem;font-weight:800;margin-bottom:18px}
        .hero h1{font-size:2.55rem;line-height:1.12;color:#12365A;margin:.1rem 0 1rem;font-weight:850}
        .hero p{font-size:1.05rem;line-height:1.72;color:#536779;max-width:900px;margin:0}
        .product-title{font-size:1.35rem;color:#12365A;font-weight:850;margin-bottom:5px}
        .product-desc{color:#617386;line-height:1.55;font-size:.92rem}
        .feature-card{height:100%;background:#fff;border:1px solid #dce4eb;border-radius:13px;
          padding:17px 18px;box-shadow:0 5px 18px rgba(20,45,70,.04)}
        .feature-card b{color:#12365A;display:block;margin-bottom:5px}
        .trial-note{background:#fff8e9;border:1px solid #ead6aa;color:#6e551d;border-radius:11px;
          padding:12px 14px;font-size:.88rem;margin-top:14px}
        div[data-testid="stForm"]{background:#fff;border:1px solid #d8e1e8;border-radius:14px;padding:20px 20px 8px}
        </style>
        """,
        unsafe_allow_html=True,
    )


def _render_landing():
    _landing_css()
    st.markdown(
        """
        <div class="demo-nav">
          <div class="demo-brand">Kurumsal Yazılım Çözümleri
            <span>Kamu kurumları için geliştirilen uygulamalar</span>
          </div>
          <div>🏅 Kamu Kurumları Başarı Belgeleri</div>
        </div>
        <div class="hero">
          <div class="hero-badge">KAMU KURUMLARI BAŞARI BELGELERİ SİSTEMİ</div>
          <h1>Başarı ve Üstün Başarı Belgesi süreçlerini tek sistemden yönetin.</h1>
          <p>Personel kaydından fotoğraf ve imzaya; Taslak, Olur ve kesinleştirme süreçlerinden PDF üretimi, toplu işlemler, Excel aktarımı ve belge arşivine kadar masaüstü uygulamadaki gerçek iş akışını çevrim içi olarak deneyin.</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

    c1, c2, c3 = st.columns([1.1, 1.1, 2.5], gap="small")
    with c1:
        if st.button("🚀 Demoyu Dene", type="primary", use_container_width=True):
            st.session_state["_auth_view"] = "register"
            st.rerun()
    with c2:
        if st.button("🔐 Üye Girişi", use_container_width=True):
            st.session_state["_auth_view"] = "login"
            st.rerun()
    with c3:
        st.markdown(
            f'<div class="trial-note">Demo hesabı varsayılan olarak <b>{TRIAL_DAYS} gün</b> ve <b>{TRIAL_RECORD_LIMIT} yeni kayıt</b> hakkıyla açılır. Özellikler temsili değildir; orijinal sistem açılır.</div>',
            unsafe_allow_html=True,
        )

    st.markdown("### Sistemde deneyebilecekleriniz")
    cols = st.columns(4, gap="small")
    features = [
        ("Yeni Belge Kaydı", "Başarı ve Üstün Başarı kayıtlarını orijinal alan ve kontrollerle oluşturun."),
        ("Fotoğraf ve İmza", "Personel fotoğrafı, imza sahibi ve imza seçeneklerini gerçek akışta kullanın."),
        ("Taslak ve Olur", "Taslak kayıtları yönetin, Olur listeleri oluşturun ve işlemleri kesinleştirin."),
        ("PDF ve Arşiv", "Belge şablonlarından PDF üretin, teslim sürecini tamamlayın ve arşivleyin."),
    ]
    for col, (title, text) in zip(cols, features):
        with col:
            st.markdown(
                f'<div class="feature-card"><b>{title}</b><div class="product-desc">{text}</div></div>',
                unsafe_allow_html=True,
            )

    st.markdown("### Çözümlerimiz")
    st.markdown(
        """
        <div class="feature-card">
          <div class="product-title">🏅 Kamu Kurumları Başarı Belgeleri Düzenleme ve Takip Sistemi</div>
          <div class="product-desc">Başarı Belgesi ve Üstün Başarı Belgesi hazırlama, Olur, toplu işlem, imza, PDF, arşiv ve takip süreçlerini tek uygulamada yürütür. Bu alan ileride diğer kurumsal yazılımların tanıtımı için de genişletilebilir.</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def _render_auth(view):
    _landing_css()
    back_col, title_col = st.columns([1, 5])
    with back_col:
        if st.button("← Tanıtıma Dön", use_container_width=True):
            st.session_state["_auth_view"] = "landing"
            st.rerun()
    with title_col:
        st.markdown("## 🏅 Kamu Kurumları Başarı Belgeleri")

    if view == "login":
        st.caption("Mevcut üyeliğinizle giriş yapın.")
        with st.form("login_form"):
            email = st.text_input("E-posta")
            pw = st.text_input("Parola", type="password")
            submit = st.form_submit_button("Giriş Yap", type="primary", use_container_width=True)
        if submit:
            u, msg = _login(email, pw)
            if u:
                st.rerun()
            st.error(msg)
        st.divider()
        if st.button("Üyeliğim yok — Demoyu Dene", use_container_width=True):
            st.session_state["_auth_view"] = "register"
            st.rerun()
        return

    st.caption("Kısıtlı demo üyeliğinizi oluşturun; ardından orijinal Başarı Belgeleri sistemi açılacaktır.")
    st.info(
        f"Yeni üyeler {TRIAL_DAYS} gün ve en fazla {TRIAL_RECORD_LIMIT} yeni kayıt ile denemeye başlar. "
        "Kayıt, fotoğraf, Olur, toplu işlemler, imza, PDF ve arşiv akışı gerçek sistemdir."
    )
    with st.form("register_form"):
        name = st.text_input("Ad Soyad")
        email = st.text_input("E-posta", key="reg_email")
        pw = st.text_input("Parola", type="password", key="reg_pw")
        pw2 = st.text_input("Parola Tekrar", type="password")
        submit = st.form_submit_button("Demo Hesabımı Oluştur", type="primary", use_container_width=True)
    if submit:
        if pw != pw2:
            st.error("Parolalar aynı değil.")
        else:
            ok, msg = _register(name, email, pw)
            if ok:
                st.success(msg)
                st.session_state["_auth_view"] = "login"
            else:
                st.error(msg)


def require_user():
    user = _session_user()
    if user:
        if not user["active"] or user["plan"] == "BLOCKED":
            st.error("Üyeliğiniz kullanıma kapatılmıştır.")
            st.stop()
        if user["plan"] == "TRIAL" and _parse(user["trial_ends_at"]) < _now():
            st.error("Deneme süreniz sona ermiştir.")
            st.stop()
        os.environ["BASARI_BELGESI_DIR"] = str(_ensure_workspace(user))
        st.session_state["_web_user"] = user
        return user

    view = st.session_state.get("_auth_view", "landing")
    if view == "landing":
        _render_landing()
    else:
        _render_auth(view)
    st.stop()


def assert_can_create_record():
    user = st.session_state.get("_web_user")
    if not user or user["plan"] == "FULL":
        return
    if user["plan"] != "TRIAL":
        raise ValueError("Üyeliğiniz yeni kayıt oluşturmaya uygun değil.")
    if _parse(user["trial_ends_at"]) < _now():
        raise ValueError("Deneme süreniz sona ermiştir.")
    if int(user["records_created"] or 0) >= int(user["record_limit"] or 0):
        raise ValueError("Deneme hesabınızın kayıt limiti dolmuştur.")


def note_record_created(_record_id=None):
    user = st.session_state.get("_web_user")
    if not user or user["plan"] == "FULL":
        return
    c = _conn()
    c.execute(
        "UPDATE users SET records_created=records_created+1 WHERE id=?",
        (user["id"],),
    )
    c.commit()
    row = c.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    c.close()
    st.session_state["_web_user"] = dict(row)


def _logout():
    token = str(st.query_params.get("oturum", "") or "")
    if token:
        c = _conn()
        c.execute("DELETE FROM sessions WHERE token=?", (token,))
        c.commit()
        c.close()
    st.query_params.clear()
    st.session_state.clear()
    st.rerun()


def render_member_bar():
    user = st.session_state.get("_web_user")
    if not user:
        return
    with st.sidebar:
        st.markdown(f"**👤 {user['full_name']}**")
        st.caption(user["email"])
        if user["plan"] == "FULL":
            st.success("Tam Sürüm")
        else:
            remaining = max(
                0,
                int(user["record_limit"] or 0) - int(user["records_created"] or 0),
            )
            days = max(
                0,
                (_parse(user["trial_ends_at"]).date() - _now().date()).days + 1,
            )
            st.info(f"Deneme • {days} gün • {remaining} kayıt hakkı")
        if user["role"] == "ADMIN":
            _admin_panel()
        if st.button("Çıkış Yap", use_container_width=True):
            _logout()


def _admin_panel():
    with st.expander("🛡️ Üye Yönetimi", expanded=False):
        c = _conn()
        rows = c.execute("SELECT * FROM users ORDER BY created_at DESC").fetchall()
        c.close()
        for row in rows:
            if row["role"] == "ADMIN":
                continue
            st.markdown(f"**{row['full_name']}**  \n{row['email']}")
            c1, c2 = st.columns(2)
            with c1:
                opts = ["TRIAL", "FULL", "BLOCKED"]
                plan = st.selectbox(
                    "Üyelik",
                    opts,
                    index=opts.index(row["plan"]) if row["plan"] in opts else 0,
                    key="p_" + row["id"],
                )
                limit = st.number_input(
                    "Kayıt limiti",
                    min_value=1,
                    max_value=100000,
                    value=int(row["record_limit"] or TRIAL_RECORD_LIMIT),
                    key="l_" + row["id"],
                )
            with c2:
                days = st.number_input(
                    "Bugünden itibaren deneme günü",
                    min_value=1,
                    max_value=3650,
                    value=TRIAL_DAYS,
                    key="d_" + row["id"],
                )
                st.caption(f"Kullanılan kayıt: {row['records_created']}")
            if st.button(
                "Üyeliği Güncelle",
                key="u_" + row["id"],
                use_container_width=True,
            ):
                end = _iso(_now() + timedelta(days=int(days))) if plan == "TRIAL" else None
                cc = _conn()
                cc.execute(
                    "UPDATE users SET plan=?,active=?,trial_ends_at=?,record_limit=? WHERE id=?",
                    (
                        plan,
                        0 if plan == "BLOCKED" else 1,
                        end,
                        int(limit),
                        row["id"],
                    ),
                )
                cc.commit()
                cc.close()
                st.success("Güncellendi.")
                st.rerun()
            st.divider()
