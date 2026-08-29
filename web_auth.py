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

def _now(): return datetime.now(timezone.utc)
def _iso(dt): return dt.astimezone(timezone.utc).isoformat(timespec="seconds")
def _parse(v):
    try: return datetime.fromisoformat(v)
    except Exception: return _now() - timedelta(days=1)

def _hash(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 260000).hex()

def _conn():
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(AUTH_DB, timeout=30)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA busy_timeout=30000")
    c.executescript("""
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
    """)
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
        (secrets.token_hex(12), email, "Sistem Yöneticisi", _hash(password, salt), salt, "ADMIN", "FULL", 1, _iso(_now()), None, None),
    )
    c.commit()

def _workspace(uid): return DATA_ROOT / "users" / uid

def _ensure_workspace(user):
    w = _workspace(user["id"])
    w.mkdir(parents=True, exist_ok=True)
    for d in ("Fotograflar", "Yedekler", "Imzalar"):
        (w / d).mkdir(exist_ok=True)
    for d in ("Sablonlar", "Kurumsal"):
        target = w / d
        if not target.exists():
            shutil.copytree(APP_ROOT / d, target)
    x = w / "basari_belgesi_excel_sablonu.xlsx"
    if not x.exists():
        shutil.copy2(APP_ROOT / "basari_belgesi_excel_sablonu.xlsx", x)
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
    row = c.execute("SELECT * FROM users WHERE email=?", (email.strip().lower(),)).fetchone()
    if not row or not hmac.compare_digest(_hash(password, row["password_salt"]), row["password_hash"]):
        c.close(); return None, "E-posta veya parola hatalı."
    if not row["active"] or row["plan"] == "BLOCKED":
        c.close(); return None, "Bu üyelik kullanıma kapatılmıştır."
    token = secrets.token_urlsafe(32)
    now = _now()
    c.execute("INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)", (token, row["id"], _iso(now), _iso(now + timedelta(days=SESSION_DAYS))))
    c.commit(); c.close()
    st.query_params["oturum"] = token
    return dict(row), ""

def _register(name, email, password):
    name, email = name.strip(), email.strip().lower()
    if len(name) < 3: return False, "Ad Soyad girin."
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email): return False, "Geçerli bir e-posta girin."
    if len(password) < 8: return False, "Parola en az 8 karakter olmalıdır."
    c = _conn()
    if c.execute("SELECT 1 FROM users WHERE email=?", (email,)).fetchone():
        c.close(); return False, "Bu e-posta zaten kayıtlı."
    salt = secrets.token_hex(16)
    now = _now()
    c.execute(
        "INSERT INTO users(id,email,full_name,password_hash,password_salt,role,plan,active,created_at,trial_ends_at,record_limit) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        (secrets.token_hex(12), email, name, _hash(password, salt), salt, "USER", "TRIAL", 1, _iso(now), _iso(now + timedelta(days=TRIAL_DAYS)), TRIAL_RECORD_LIMIT),
    )
    c.commit(); c.close()
    return True, "Üyeliğiniz oluşturuldu. Deneme hesabınızla giriş yapabilirsiniz."

def require_user():
    user = _session_user()
    if user:
        if not user["active"] or user["plan"] == "BLOCKED":
            st.error("Üyeliğiniz kullanıma kapatılmıştır."); st.stop()
        if user["plan"] == "TRIAL" and _parse(user["trial_ends_at"]) < _now():
            st.error("Deneme süreniz sona ermiştir."); st.stop()
        os.environ["BASARI_BELGESI_DIR"] = str(_ensure_workspace(user))
        st.session_state["_web_user"] = user
        return user

    st.markdown("## 🏅 Kamu Kurumları Başarı Belgeleri")
    st.caption("Üyelik ile çalışan çevrim içi tam sürüm")
    login_tab, register_tab = st.tabs(["🔐 Giriş Yap", "📝 Üye Ol / Deneme Başlat"])
    with login_tab:
        with st.form("login_form"):
            email = st.text_input("E-posta")
            pw = st.text_input("Parola", type="password")
            submit = st.form_submit_button("Giriş Yap", use_container_width=True)
        if submit:
            u, msg = _login(email, pw)
            if u: st.rerun()
            st.error(msg)
    with register_tab:
        st.info(f"Yeni üyeler {TRIAL_DAYS} gün ve en fazla {TRIAL_RECORD_LIMIT} yeni kayıt ile denemeye başlar.")
        with st.form("register_form"):
            name = st.text_input("Ad Soyad")
            email = st.text_input("E-posta", key="reg_email")
            pw = st.text_input("Parola", type="password", key="reg_pw")
            pw2 = st.text_input("Parola Tekrar", type="password")
            submit = st.form_submit_button("Üye Ol", use_container_width=True)
        if submit:
            if pw != pw2: st.error("Parolalar aynı değil.")
            else:
                ok, msg = _register(name, email, pw)
                (st.success if ok else st.error)(msg)
    st.stop()

def assert_can_create_record():
    user = st.session_state.get("_web_user")
    if not user or user["plan"] == "FULL": return
    if user["plan"] != "TRIAL": raise ValueError("Üyeliğiniz yeni kayıt oluşturmaya uygun değil.")
    if _parse(user["trial_ends_at"]) < _now(): raise ValueError("Deneme süreniz sona ermiştir.")
    if int(user["records_created"] or 0) >= int(user["record_limit"] or 0):
        raise ValueError("Deneme hesabınızın kayıt limiti dolmuştur.")

def note_record_created(_record_id=None):
    user = st.session_state.get("_web_user")
    if not user or user["plan"] == "FULL": return
    c = _conn()
    c.execute("UPDATE users SET records_created=records_created+1 WHERE id=?", (user["id"],))
    c.commit()
    row = c.execute("SELECT * FROM users WHERE id=?", (user["id"],)).fetchone()
    c.close()
    st.session_state["_web_user"] = dict(row)

def _logout():
    token = str(st.query_params.get("oturum", "") or "")
    if token:
        c = _conn(); c.execute("DELETE FROM sessions WHERE token=?", (token,)); c.commit(); c.close()
    st.query_params.clear(); st.session_state.clear(); st.rerun()

def render_member_bar():
    user = st.session_state.get("_web_user")
    if not user: return
    with st.sidebar:
        st.markdown(f"**👤 {user['full_name']}**")
        st.caption(user["email"])
        if user["plan"] == "FULL":
            st.success("Tam Sürüm")
        else:
            remaining = max(0, int(user["record_limit"] or 0) - int(user["records_created"] or 0))
            days = max(0, (_parse(user["trial_ends_at"]).date() - _now().date()).days + 1)
            st.info(f"Deneme • {days} gün • {remaining} kayıt hakkı")
        if user["role"] == "ADMIN":
            _admin_panel()
        if st.button("Çıkış Yap", use_container_width=True):
            _logout()

def _admin_panel():
    with st.expander("🛡️ Üye Yönetimi", expanded=False):
        c = _conn(); rows = c.execute("SELECT * FROM users ORDER BY created_at DESC").fetchall(); c.close()
        for row in rows:
            if row["role"] == "ADMIN": continue
            st.markdown(f"**{row['full_name']}**  \n{row['email']}")
            c1, c2 = st.columns(2)
            with c1:
                opts = ["TRIAL", "FULL", "BLOCKED"]
                plan = st.selectbox("Üyelik", opts, index=opts.index(row["plan"]) if row["plan"] in opts else 0, key="p_"+row["id"])
                limit = st.number_input("Kayıt limiti", min_value=1, max_value=100000, value=int(row["record_limit"] or TRIAL_RECORD_LIMIT), key="l_"+row["id"])
            with c2:
                days = st.number_input("Bugünden itibaren deneme günü", min_value=1, max_value=3650, value=TRIAL_DAYS, key="d_"+row["id"])
                st.caption(f"Kullanılan kayıt: {row['records_created']}")
            if st.button("Üyeliği Güncelle", key="u_"+row["id"], use_container_width=True):
                end = _iso(_now() + timedelta(days=int(days))) if plan == "TRIAL" else None
                cc = _conn()
                cc.execute("UPDATE users SET plan=?,active=?,trial_ends_at=?,record_limit=? WHERE id=?", (plan, 0 if plan == "BLOCKED" else 1, end, int(limit), row["id"]))
                cc.commit(); cc.close(); st.success("Güncellendi."); st.rerun()
            st.divider()
