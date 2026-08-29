/*
 * FirstRunService.gs
 * İlk kurulumda kullanıcıya kod ekletmeden ilk yönetici hesabını oluşturur.
 */

function getFirstRunState() {
  ensureSystem_();
  const admins = rows_('users').filter(r => String(r.role || '').toUpperCase() === 'ADMIN' && truthy_(r.active));
  return {ok:true, configured:admins.length > 0};
}

function createFirstAdmin(fullName, email, password) {
  ensureSystem_();
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const existingAdmin = rows_('users').find(r => String(r.role || '').toUpperCase() === 'ADMIN' && truthy_(r.active));
    if (existingAdmin) return fail_('İlk kurulum daha önce tamamlanmış. Üye Girişi ile giriş yapın.');

    fullName = clean_(fullName);
    email = clean_(email).toLowerCase();
    password = String(password || '');
    if (fullName.length < 3) return fail_('Ad Soyad girin.');
    if (!validEmail_(email)) return fail_('Geçerli e-posta girin.');
    if (password.length < 8) return fail_('Parola en az 8 karakter olmalıdır.');

    let user = findOne_('users', r => clean_(r.email).toLowerCase() === email);
    if (!user) {
      const id = uuid_();
      append_('users', {
        id:id,
        email:email,
        full_name:fullName,
        password_hash:makePassword_(password),
        role:'ADMIN',
        plan:'FULL',
        active:true,
        created_at:nowIso_(),
        trial_ends_at:'',
        record_limit:0,
        records_created:0
      });
      user = findOne_('users', r => String(r.id) === String(id));
    } else {
      updateById_('users', user.id, {
        full_name:fullName,
        password_hash:makePassword_(password),
        role:'ADMIN',
        plan:'FULL',
        active:true,
        trial_ends_at:'',
        record_limit:0
      });
      user = findOne_('users', r => String(r.id) === String(user.id));
    }

    // Ağır Drive klasörü / varsayılan ayar kurulumları burada bekletilmez.
    // İlgili ekran veya dosya işlemi ilk kez açıldığında mevcut lazy yardımcılar bunları oluşturur.
    const token = uuid_() + uuid_();
    append_('sessions', {
      token:token,
      user_id:user.id,
      created_at:nowIso_(),
      expires_at:new Date(Date.now()+SESSION_HOURS*3600000).toISOString()
    });
    return {ok:true, token:token, user:safeUser_(user), message:'İlk yönetici hesabı oluşturuldu.'};
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}
