(() => {
  const VAULT_KEY = "hkacc101_vault_v2";
  const LEGACY_ACCOUNTS_KEY = "hkacc101_accounts";
  const FORMS_KEY = "hkacc101_forms_v1";
  const SESSION_KEY = "hkacc101_session";
  const ATTEMPTS_KEY = "hkacc101_login_attempts";

  // Client-side vault pepper (raises the bar for casual localStorage tampering).
  // A real production app must use a server-side database instead.
  const VAULT_PEPPER = "hkacc-101-sqn-vault-pepper-v2-ean";

  const STANDARD_EMAIL = /^101sqn\.[mf]\d+@gmail\.com$/i;
  const PBKDF2_ITERATIONS = 120000;
  const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes

  let memoryAccounts = null;
  let bootPromise = null;

  const te = new TextEncoder();

  const bufToB64 = (buf) => {
    const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
    let s = "";
    bytes.forEach((b) => {
      s += String.fromCharCode(b);
    });
    return btoa(s);
  };

  const b64ToBuf = (b64) => {
    const s = atob(b64);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i += 1) bytes[i] = s.charCodeAt(i);
    return bytes.buffer;
  };

  const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

  const deriveVaultKey = async () => {
    const base = await crypto.subtle.importKey(
      "raw",
      te.encode(VAULT_PEPPER),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: te.encode("hkacc101-vault-salt"),
        iterations: 100000,
        hash: "SHA-256",
      },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  };

  const sealAccounts = async (accounts) => {
    const key = await deriveVaultKey();
    const iv = randomBytes(12);
    const plaintext = te.encode(JSON.stringify(accounts));
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      plaintext
    );
    localStorage.setItem(
      VAULT_KEY,
      JSON.stringify({
        schema: 2,
        iv: bufToB64(iv),
        data: bufToB64(ciphertext),
        updatedAt: new Date().toISOString(),
      })
    );
    try {
      localStorage.removeItem(LEGACY_ACCOUNTS_KEY);
    } catch {
      /* ignore */
    }
    memoryAccounts = accounts;
  };

  const openVault = async () => {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.iv || !parsed?.data) return null;
      const key = await deriveVaultKey();
      const plainBuf = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(b64ToBuf(parsed.iv)) },
        key,
        b64ToBuf(parsed.data)
      );
      const accounts = JSON.parse(new TextDecoder().decode(plainBuf));
      return Array.isArray(accounts) ? accounts : null;
    } catch {
      return null;
    }
  };

  const hashPassword = async (password, saltB64) => {
    const salt = saltB64
      ? new Uint8Array(b64ToBuf(saltB64))
      : randomBytes(16);
    const baseKey = await crypto.subtle.importKey(
      "raw",
      te.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      baseKey,
      256
    );
    return {
      salt: bufToB64(salt),
      hash: bufToB64(bits),
      algo: "PBKDF2-SHA256",
      iterations: PBKDF2_ITERATIONS,
    };
  };

  const verifyPassword = async (password, account) => {
    if (account.passwordHash && account.passwordSalt) {
      const hashed = await hashPassword(password, account.passwordSalt);
      return timingSafeEqual(hashed.hash, account.passwordHash);
    }
    // Legacy plaintext (should be migrated away)
    if (typeof account.password === "string") {
      return account.password === password;
    }
    return false;
  };

  const timingSafeEqual = (a, b) => {
    const aa = String(a || "");
    const bb = String(b || "");
    const len = Math.max(aa.length, bb.length);
    let out = aa.length === bb.length ? 0 : 1;
    for (let i = 0; i < len; i += 1) {
      out |= (aa.charCodeAt(i) || 0) ^ (bb.charCodeAt(i) || 0);
    }
    return out === 0;
  };

  const sanitizeAccount = (account) => {
    const copy = { ...account };
    delete copy.password;
    return copy;
  };

  const migrateAccountSecrets = async (account) => {
    if (account.passwordHash && account.passwordSalt) {
      return sanitizeAccount(account);
    }
    if (typeof account.password === "string" && account.password) {
      const hashed = await hashPassword(account.password);
      return sanitizeAccount({
        ...account,
        passwordHash: hashed.hash,
        passwordSalt: hashed.salt,
        passwordAlgo: hashed.algo,
        passwordIterations: hashed.iterations,
      });
    }
    return sanitizeAccount(account);
  };

  const seedAdmin = async () => {
    const hashed = await hashPassword("admin_ean");
    return {
      id: "admin",
      username: "admin",
      email: "",
      passwordHash: hashed.hash,
      passwordSalt: hashed.salt,
      passwordAlgo: hashed.algo,
      passwordIterations: hashed.iterations,
      role: "admin",
      status: "active",
      emailStandard: false,
      displayName: "Administrator",
      reason: "",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
  };

  const ensureAccounts = async () => {
    if (memoryAccounts) return memoryAccounts;
    if (bootPromise) return bootPromise;

    bootPromise = (async () => {
      let accounts = await openVault();

      if (!accounts) {
        const legacy = (() => {
          try {
            const raw = localStorage.getItem(LEGACY_ACCOUNTS_KEY);
            return raw ? JSON.parse(raw) : null;
          } catch {
            return null;
          }
        })();
        accounts = Array.isArray(legacy) ? legacy : [];
      }

      accounts = await Promise.all(accounts.map((a) => migrateAccountSecrets(a)));

      const hasAdmin = accounts.some(
        (a) => a.username === "admin" && a.role === "admin" && a.status === "active"
      );
      if (!hasAdmin) {
        accounts.unshift(await seedAdmin());
      } else {
        // Keep primary admin password aligned to known credential after hash migrate
        accounts = await Promise.all(
          accounts.map(async (a) => {
            if (a.username !== "admin") return a;
            const hashed = await hashPassword("admin_ean");
            return {
              ...sanitizeAccount(a),
              passwordHash: hashed.hash,
              passwordSalt: hashed.salt,
              passwordAlgo: hashed.algo,
              passwordIterations: hashed.iterations,
              role: "admin",
              status: "active",
            };
          })
        );
      }

      await sealAccounts(accounts);
      return accounts;
    })();

    try {
      return await bootPromise;
    } finally {
      bootPromise = null;
    }
  };

  const saveAccounts = async (accounts) => {
    const cleaned = accounts.map(sanitizeAccount);
    await sealAccounts(cleaned);
  };

  const normalizeUsername = (value) => String(value || "").trim().toLowerCase();
  const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
  const isStandardGmail = (email) => STANDARD_EMAIL.test(normalizeEmail(email));
  const isPrimaryAdmin = (account) => account && account.username === "admin";
  const normalizeRole = (role) => {
    const r = String(role || "cadet").toLowerCase();
    if (r === "admin" || r === "officer" || r === "cadet") return r;
    return "cadet";
  };
  const canManageAccounts = (account) =>
    account && account.role === "admin" && account.status === "active";
  const canReviewForms = (account) =>
    account &&
    account.status === "active" &&
    (account.role === "admin" || account.role === "officer");
  const canSubmitForms = (account) =>
    account &&
    account.status === "active" &&
    (account.role === "cadet" || account.role === "admin");
  const roleLabel = (role) => {
    const r = normalizeRole(role);
    if (r === "admin") return "Admin";
    if (r === "officer") return "Officer";
    return "Cadet";
  };

  const validateUsername = (user, { allowAdmin = false } = {}) => {
    if (!user || user.length < 3) return "Username must be at least 3 characters.";
    if (!/^[a-z0-9._-]+$/.test(user)) {
      return "Username may only use letters, numbers, . _ -";
    }
    if (user === "admin" && !allowAdmin) return "That username is reserved.";
    return "";
  };

  const findAccount = async (usernameOrEmail) => {
    const key = normalizeUsername(usernameOrEmail);
    const emailKey = normalizeEmail(usernameOrEmail);
    const accounts = await ensureAccounts();
    return accounts.find(
      (a) => a.username === key || (a.email && a.email === emailKey)
    );
  };

  const findById = async (id) =>
    (await ensureAccounts()).find((a) => a.id === id);

  const getAttemptState = () => {
    try {
      return JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || "{}") || {};
    } catch {
      return {};
    }
  };

  const setAttemptState = (state) => {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(state));
  };

  const checkLockout = () => {
    const state = getAttemptState();
    if (state.lockedUntil && Date.now() < state.lockedUntil) {
      const mins = Math.ceil((state.lockedUntil - Date.now()) / 60000);
      return {
        locked: true,
        error: `Too many failed sign-in attempts. Try again in about ${mins} minute(s).`,
      };
    }
    return { locked: false };
  };

  const registerFailure = () => {
    const state = getAttemptState();
    const fails = (state.fails || 0) + 1;
    const next = { fails, lockedUntil: null };
    if (fails >= MAX_ATTEMPTS) {
      next.lockedUntil = Date.now() + LOCKOUT_MS;
      next.fails = 0;
    }
    setAttemptState(next);
  };

  const clearFailures = () => {
    localStorage.removeItem(ATTEMPTS_KEY);
  };

  const getSession = () => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session?.exp || Date.now() > session.exp) {
        clearSession();
        return null;
      }
      if (!session.token || !session.memberId) {
        clearSession();
        return null;
      }
      return session;
    } catch {
      return null;
    }
  };

  const setSession = (account, remember) => {
    const tokenBytes = randomBytes(24);
    const payload = JSON.stringify({
      token: bufToB64(tokenBytes),
      memberId: account.username,
      email: account.email || "",
      role: account.role,
      displayName: account.displayName || account.username,
      signedInAt: new Date().toISOString(),
      exp: Date.now() + SESSION_TTL_MS,
    });
    sessionStorage.setItem(SESSION_KEY, payload);
    if (remember) localStorage.setItem(SESSION_KEY, payload);
    else localStorage.removeItem(SESSION_KEY);
  };

  const clearSession = () => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  };

  const registerAccount = async ({ username, email, password, displayName }) => {
    const accounts = await ensureAccounts();
    const user = normalizeUsername(username);
    const mail = normalizeEmail(email);
    const userError = validateUsername(user);
    if (userError) return { ok: false, error: userError };

    if (!mail.endsWith("@gmail.com")) {
      return { ok: false, error: "Please use a Gmail address (@gmail.com)." };
    }
    if (!isStandardGmail(mail)) {
      return {
        ok: false,
        redirectException: true,
        error:
          "That Gmail is not in the standard 101sqn.(m/f) + digits format. Please use the Exception request page.",
      };
    }
    if (!password || password.length < 6) {
      return { ok: false, error: "Password must be at least 6 characters." };
    }
    if (accounts.some((a) => a.username === user)) {
      return { ok: false, error: "That username is already taken." };
    }
    if (accounts.some((a) => a.email && a.email === mail)) {
      return { ok: false, error: "That Gmail is already registered." };
    }

    const hashed = await hashPassword(password);
    const account = {
      id: `u_${Date.now().toString(36)}`,
      username: user,
      email: mail,
      passwordHash: hashed.hash,
      passwordSalt: hashed.salt,
      passwordAlgo: hashed.algo,
      passwordIterations: hashed.iterations,
      role: "cadet",
      status: "active",
      emailStandard: true,
      displayName: String(displayName || user).trim() || user,
      reason: "",
      createdAt: new Date().toISOString(),
    };

    accounts.push(account);
    await saveAccounts(accounts);

    return {
      ok: true,
      account: { ...account, passwordHash: undefined, passwordSalt: undefined },
      message:
        "Account created. Your Gmail matches the 101 Sqn format — you can sign in now.",
    };
  };

  const submitExceptionRequest = async ({
    username,
    email,
    password,
    displayName,
    reason,
  }) => {
    const accounts = await ensureAccounts();
    const user = normalizeUsername(username);
    const mail = normalizeEmail(email);
    const note = String(reason || "").trim();
    const userError = validateUsername(user);
    if (userError) return { ok: false, error: userError };

    if (!mail.endsWith("@gmail.com")) {
      return { ok: false, error: "Please use a Gmail address (@gmail.com)." };
    }
    if (isStandardGmail(mail)) {
      return {
        ok: false,
        redirectRegister: true,
        error:
          "That Gmail already matches the standard format. Please create a normal account instead.",
      };
    }
    if (!password || password.length < 6) {
      return { ok: false, error: "Password must be at least 6 characters." };
    }
    if (note.length < 8) {
      return {
        ok: false,
        error: "Please explain why you need an exception (at least 8 characters).",
      };
    }
    if (accounts.some((a) => a.username === user)) {
      return { ok: false, error: "That username is already taken." };
    }
    if (accounts.some((a) => a.email && a.email === mail)) {
      return { ok: false, error: "That Gmail is already registered or pending." };
    }

    const hashed = await hashPassword(password);
    const account = {
      id: `u_${Date.now().toString(36)}`,
      username: user,
      email: mail,
      passwordHash: hashed.hash,
      passwordSalt: hashed.salt,
      passwordAlgo: hashed.algo,
      passwordIterations: hashed.iterations,
      role: "cadet",
      status: "pending",
      emailStandard: false,
      displayName: String(displayName || user).trim() || user,
      reason: note,
      createdAt: new Date().toISOString(),
    };

    accounts.push(account);
    await saveAccounts(accounts);

    return {
      ok: true,
      account: { ...account, passwordHash: undefined, passwordSalt: undefined },
      pending: true,
      message:
        "Exception request submitted. An admin must approve it before you can sign in.",
    };
  };

  const authenticate = async (usernameOrEmail, password) => {
    const lock = checkLockout();
    if (lock.locked) return { ok: false, error: lock.error };

    const account = await findAccount(usernameOrEmail);
    const valid = account ? await verifyPassword(password, account) : false;

    if (!account || !valid) {
      registerFailure();
      return { ok: false, error: "Sign-in failed. Check your username and password." };
    }
    if (account.status === "pending") {
      return {
        ok: false,
        error: "This account is waiting for admin approval (exception request).",
      };
    }
    if (account.status === "suspended") {
      return { ok: false, error: "This account has been suspended by an admin." };
    }
    if (account.status !== "active") {
      return { ok: false, error: "This account is not active." };
    }

    clearFailures();
    return { ok: true, account: sanitizeAccount(account) };
  };

  const listPending = async () =>
    (await ensureAccounts()).filter((a) => a.status === "pending");

  const listMembers = async () =>
    (await ensureAccounts()).filter(
      (a) => a.status === "active" || a.status === "suspended"
    );

  const approveAccount = async (id) => {
    const accounts = await ensureAccounts();
    const idx = accounts.findIndex((a) => a.id === id);
    if (idx < 0) return { ok: false, error: "Account not found." };
    accounts[idx] = { ...accounts[idx], status: "active" };
    await saveAccounts(accounts);
    return { ok: true, account: sanitizeAccount(accounts[idx]) };
  };

  const rejectAccount = async (id) => {
    const target = await findById(id);
    if (!target) return { ok: false, error: "Account not found." };
    if (isPrimaryAdmin(target)) {
      return { ok: false, error: "Cannot remove the primary admin." };
    }
    await saveAccounts((await ensureAccounts()).filter((a) => a.id !== id));
    return { ok: true };
  };

  const removeAccount = async (id) => {
    const target = await findById(id);
    if (!target) return { ok: false, error: "Account not found." };
    if (isPrimaryAdmin(target)) {
      return { ok: false, error: "Cannot remove the primary admin." };
    }
    await saveAccounts((await ensureAccounts()).filter((a) => a.id !== id));
    return { ok: true };
  };

  const renameAccount = async (id, newUsername) => {
    const accounts = await ensureAccounts();
    const idx = accounts.findIndex((a) => a.id === id);
    if (idx < 0) return { ok: false, error: "Account not found." };
    if (isPrimaryAdmin(accounts[idx])) {
      return { ok: false, error: "Cannot rename the primary admin." };
    }

    const user = normalizeUsername(newUsername);
    const userError = validateUsername(user);
    if (userError) return { ok: false, error: userError };
    if (accounts.some((a) => a.username === user && a.id !== id)) {
      return { ok: false, error: "That username is already taken." };
    }

    accounts[idx] = { ...accounts[idx], username: user };
    await saveAccounts(accounts);
    return { ok: true, account: sanitizeAccount(accounts[idx]) };
  };

  const updateDisplayName = async (id, displayName) => {
    const accounts = await ensureAccounts();
    const idx = accounts.findIndex((a) => a.id === id);
    if (idx < 0) return { ok: false, error: "Account not found." };
    const name = String(displayName || "").trim();
    if (!name) return { ok: false, error: "Display name cannot be empty." };
    accounts[idx] = { ...accounts[idx], displayName: name };
    await saveAccounts(accounts);
    return { ok: true, account: sanitizeAccount(accounts[idx]) };
  };

  const resetPassword = async (id, newPassword) => {
    const accounts = await ensureAccounts();
    const idx = accounts.findIndex((a) => a.id === id);
    if (idx < 0) return { ok: false, error: "Account not found." };
    if (isPrimaryAdmin(accounts[idx])) {
      return { ok: false, error: "Primary admin password is fixed." };
    }
    if (!newPassword || newPassword.length < 6) {
      return { ok: false, error: "Password must be at least 6 characters." };
    }
    const hashed = await hashPassword(newPassword);
    accounts[idx] = {
      ...sanitizeAccount(accounts[idx]),
      passwordHash: hashed.hash,
      passwordSalt: hashed.salt,
      passwordAlgo: hashed.algo,
      passwordIterations: hashed.iterations,
    };
    await saveAccounts(accounts);
    return { ok: true, account: sanitizeAccount(accounts[idx]) };
  };

  const setSuspended = async (id, suspended) => {
    const accounts = await ensureAccounts();
    const idx = accounts.findIndex((a) => a.id === id);
    if (idx < 0) return { ok: false, error: "Account not found." };
    if (isPrimaryAdmin(accounts[idx])) {
      return { ok: false, error: "Cannot suspend the primary admin." };
    }
    accounts[idx] = {
      ...accounts[idx],
      status: suspended ? "suspended" : "active",
    };
    await saveAccounts(accounts);
    return { ok: true, account: sanitizeAccount(accounts[idx]) };
  };

  const assignAdmin = async (id) => setMemberRole(id, "admin");

  const demoteAdmin = async (id) => setMemberRole(id, "cadet");

  const setMemberRole = async (id, role) => {
    const accounts = await ensureAccounts();
    const idx = accounts.findIndex((a) => a.id === id);
    if (idx < 0) return { ok: false, error: "Account not found." };
    if (isPrimaryAdmin(accounts[idx])) {
      return { ok: false, error: "Cannot change the primary admin role." };
    }
    const nextRole = normalizeRole(role);
    if (accounts[idx].status === "pending") {
      return { ok: false, error: "Approve the account before assigning a role." };
    }
    if (accounts[idx].role === nextRole) {
      return { ok: false, error: `This member is already a ${roleLabel(nextRole)}.` };
    }
    accounts[idx] = { ...accounts[idx], role: nextRole };
    await saveAccounts(accounts);
    return { ok: true, account: sanitizeAccount(accounts[idx]) };
  };

  /** Admin-only create: skips 101sqn.(m/f)+digits Gmail rules; account is active immediately. */
  const adminCreateAccount = async ({
    username,
    email,
    password,
    displayName,
    role = "cadet",
  }) => {
    const session = getSession();
    if (!session) return { ok: false, error: "Please sign in first." };

    const accounts = await ensureAccounts();
    const me = accounts.find((a) => a.username === session.memberId);
    if (!canManageAccounts(me)) {
      return { ok: false, error: "Only admins can create accounts." };
    }

    const user = normalizeUsername(username);
    const mail = normalizeEmail(email);
    const nextRole = normalizeRole(role);
    const userError = validateUsername(user);
    if (userError) return { ok: false, error: userError };

    if (!mail || !mail.includes("@") || mail.startsWith("@") || mail.endsWith("@")) {
      return { ok: false, error: "Please enter a valid email address." };
    }
    if (!password || password.length < 6) {
      return { ok: false, error: "Password must be at least 6 characters." };
    }
    if (accounts.some((a) => a.username === user)) {
      return { ok: false, error: "That username is already taken." };
    }
    if (accounts.some((a) => a.email && a.email === mail)) {
      return { ok: false, error: "That email is already registered." };
    }

    const hashed = await hashPassword(password);
    const account = {
      id: `u_${Date.now().toString(36)}`,
      username: user,
      email: mail,
      passwordHash: hashed.hash,
      passwordSalt: hashed.salt,
      passwordAlgo: hashed.algo,
      passwordIterations: hashed.iterations,
      role: nextRole,
      status: "active",
      emailStandard: isStandardGmail(mail),
      adminCreated: true,
      displayName: String(displayName || user).trim() || user,
      reason: "Created by admin (format requirements waived).",
      createdAt: new Date().toISOString(),
      createdBy: session.memberId,
    };

    accounts.push(account);
    await saveAccounts(accounts);

    return {
      ok: true,
      account: { ...account, passwordHash: undefined, passwordSalt: undefined },
      message: `Account @${user} created and ready to sign in.`,
    };
  };

  const readForms = () => {
    try {
      const raw = localStorage.getItem(FORMS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const writeForms = (forms) => {
    localStorage.setItem(FORMS_KEY, JSON.stringify(forms));
  };

  const submitMemberForm = ({ type, fields }) => {
    const session = getSession();
    if (!session) return { ok: false, error: "Please sign in first." };

    // Officers review forms only — they cannot hand forms in.
    if (session.role === "officer") {
      return {
        ok: false,
        error: "Officer accounts can review forms but cannot hand them in.",
      };
    }

    const formType = String(type || "").trim();
    if (formType !== "event" && formType !== "absence") {
      return { ok: false, error: "Unknown form type." };
    }

    const clean = {};
    Object.entries(fields || {}).forEach(([key, value]) => {
      clean[key] = String(value || "").trim();
    });

    if (formType === "event") {
      if (!clean.eventName || !clean.eventDate || !clean.details) {
        return { ok: false, error: "Please fill in event name, date, and details." };
      }
    } else {
      if (
        !clean.cadetName ||
        !clean.absenceDate ||
        !clean.reason ||
        !clean.parentName ||
        !clean.parentContact
      ) {
        return {
          ok: false,
          error: "Please complete all parents letter of absence fields.",
        };
      }
    }

    const entry = {
      id: `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      type: formType,
      status: "submitted",
      submittedBy: session.memberId,
      submittedName: session.displayName || session.memberId,
      submittedAt: new Date().toISOString(),
      fields: clean,
    };

    const forms = readForms();
    forms.unshift(entry);
    writeForms(forms);
    return { ok: true, form: entry };
  };

  const listMemberForms = async ({ mineOnly = false } = {}) => {
    const session = getSession();
    if (!session) return [];
    const forms = readForms();
    const accounts = await ensureAccounts();
    const me = accounts.find((a) => a.username === session.memberId);
    if (mineOnly || !canReviewForms(me)) {
      return forms.filter((f) => f.submittedBy === session.memberId);
    }
    return forms;
  };

  const setFormStatus = async (id, status) => {
    const session = getSession();
    if (!session) return { ok: false, error: "Please sign in first." };
    const accounts = await ensureAccounts();
    const me = accounts.find((a) => a.username === session.memberId);
    if (!canReviewForms(me)) {
      return { ok: false, error: "Only officers and admins can review forms." };
    }
    const allowed = ["submitted", "reviewed", "approved", "rejected"];
    if (!allowed.includes(status)) return { ok: false, error: "Invalid status." };

    const forms = readForms();
    const idx = forms.findIndex((f) => f.id === id);
    if (idx < 0) return { ok: false, error: "Form not found." };

    forms[idx] = {
      ...forms[idx],
      status,
      reviewedAt: new Date().toISOString(),
      reviewedBy: session.memberId,
    };
    writeForms(forms);
    return { ok: true, form: forms[idx] };
  };

  window.HKACCAuth = {
    SESSION_KEY,
    STANDARD_EMAIL,
    isStandardGmail,
    isPrimaryAdmin,
    normalizeRole,
    canManageAccounts,
    canReviewForms,
    canSubmitForms,
    roleLabel,
    ensureAccounts,
    registerAccount,
    submitExceptionRequest,
    authenticate,
    getSession,
    setSession,
    clearSession,
    listPending,
    listMembers,
    approveAccount,
    rejectAccount,
    removeAccount,
    renameAccount,
    updateDisplayName,
    resetPassword,
    setSuspended,
    assignAdmin,
    demoteAdmin,
    setMemberRole,
    adminCreateAccount,
    submitMemberForm,
    listMemberForms,
    setFormStatus,
  };
})();

