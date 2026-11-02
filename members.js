(() => {
  if (!window.HKACCAuth) return;

  const welcome = document.getElementById("welcome");
  const logoutBtn = document.getElementById("logout-btn");
  const adminPanel = document.getElementById("admin-panel");
  const areaEyebrow = document.getElementById("area-eyebrow");
  const boardTitle = document.getElementById("board-title");
  const boardLede = document.getElementById("board-lede");
  const pendingList = document.getElementById("pending-list");
  const membersAdminList = document.getElementById("members-admin-list");
  const createForm = document.getElementById("admin-create-form");
  const createStatus = document.getElementById("create-status");

  const session = window.HKACCAuth.getSession();
  if (!session) {
    window.location.replace("login.html");
    return;
  }

  const escapeHtml = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const formatDate = (iso) => {
    try {
      return new Date(iso).toLocaleString("en-HK", {
        timeZone: "Asia/Hong_Kong",
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return iso || "";
    }
  };

  const alertError = (result) => {
    if (!result?.ok) window.alert(result?.error || "Action failed.");
    return Boolean(result?.ok);
  };

  const setCreateStatus = (type, message) => {
    if (!createStatus) return;
    if (!message) {
      createStatus.hidden = true;
      createStatus.textContent = "";
      createStatus.removeAttribute("data-type");
      return;
    }
    createStatus.hidden = false;
    createStatus.dataset.type = type;
    createStatus.textContent = message;
  };

  const renderAdminLists = async () => {
    if (!pendingList || !membersAdminList) return;

    const pending = await window.HKACCAuth.listPending();
    const members = await window.HKACCAuth.listMembers();

    if (pending.length === 0) {
      pendingList.innerHTML =
        '<p class="admin-empty">No pending exception requests.</p>';
    } else {
      pendingList.innerHTML = pending
        .map(
          (a) => `
        <article class="admin-row" data-id="${a.id}">
          <div>
            <strong>${escapeHtml(a.displayName || a.username)}</strong>
            <span class="admin-meta">@${escapeHtml(a.username)} · ${escapeHtml(a.email)}</span>
            <span class="admin-meta">Requested ${formatDate(a.createdAt)}</span>
            <span class="admin-meta admin-reason">Reason: ${escapeHtml(a.reason || "—")}</span>
          </div>
          <div class="admin-actions">
            <button type="button" class="btn btn-primary btn-small" data-action="approve">Approve</button>
            <button type="button" class="btn btn-danger btn-small" data-action="reject">Reject</button>
          </div>
        </article>`
        )
        .join("");
    }

    membersAdminList.innerHTML = members
      .map((a) => {
        const isSelf = a.username === session.memberId;
        const primary = window.HKACCAuth.isPrimaryAdmin(a);
        const suspended = a.status === "suspended";
        const origin = a.adminCreated
          ? " · admin-created"
          : a.emailStandard
            ? " · standard Gmail"
            : a.email
              ? " · exception Gmail"
              : "";
        return `
        <article class="admin-row ${suspended ? "is-suspended" : ""}" data-id="${a.id}">
          <div>
            <strong>${escapeHtml(a.displayName || a.username)}</strong>
            <span class="admin-meta">@${escapeHtml(a.username)}${
              a.email ? ` · ${escapeHtml(a.email)}` : ""
            }</span>
            <span class="admin-meta">${escapeHtml(
              window.HKACCAuth.roleLabel(a.role)
            )} · ${suspended ? "Suspended" : "Active"}${origin}${
              isSelf ? " · you" : ""
            }</span>
          </div>
          <div class="admin-actions">
            ${
              primary
                ? `<span class="admin-badge">Primary admin</span>`
                : `
              <button type="button" class="btn btn-ghost dark btn-small" data-action="rename">Rename</button>
              <button type="button" class="btn btn-ghost dark btn-small" data-action="displayname">Display name</button>
              <button type="button" class="btn btn-ghost dark btn-small" data-action="password">Reset password</button>
              ${
                a.role !== "cadet"
                  ? `<button type="button" class="btn btn-ghost dark btn-small" data-action="make-cadet">Set cadet</button>`
                  : ""
              }
              ${
                a.role !== "officer"
                  ? `<button type="button" class="btn btn-ghost dark btn-small" data-action="make-officer">Make officer</button>`
                  : ""
              }
              ${
                a.role !== "admin"
                  ? `<button type="button" class="btn btn-primary btn-small" data-action="make-admin">Make admin</button>`
                  : ""
              }
              ${
                suspended
                  ? `<button type="button" class="btn btn-primary btn-small" data-action="unsuspend">Unsuspend</button>`
                  : `<button type="button" class="btn btn-ghost dark btn-small" data-action="suspend">Suspend</button>`
              }
              <button type="button" class="btn btn-danger btn-small" data-action="remove">Remove</button>
              `
            }
          </div>
        </article>`;
      })
      .join("");
  };

  const start = async () => {
    const accounts = await window.HKACCAuth.ensureAccounts();
    const me = accounts.find((a) => a.username === session.memberId);
    const isAdmin = me?.role === "admin";
    const isOfficer = me?.role === "officer";
    const label = me?.displayName || session.displayName || session.memberId || "member";
    const roleName = window.HKACCAuth.roleLabel(me?.role || session.role);

    const tileHandin = document.getElementById("tile-handin");
    const tileAbsence = document.getElementById("tile-absence");
    const tileReview = document.getElementById("tile-review");

    if (welcome) {
      welcome.textContent = `${roleName} · ${isAdmin || isOfficer ? label : session.memberId || "member"}`;
    }

    // Cadets (+ admins) can hand in forms. Officers only review.
    if (window.HKACCAuth.canSubmitForms(me)) {
      if (tileHandin) tileHandin.hidden = false;
      if (tileAbsence) tileAbsence.hidden = false;
    }
    if (window.HKACCAuth.canReviewForms(me)) {
      if (tileReview) tileReview.hidden = false;
    }

    if (isOfficer && !isAdmin) {
      if (areaEyebrow) areaEyebrow.textContent = "Officer area · 教官專區";
      if (boardTitle) boardTitle.textContent = "Officer board";
      if (boardLede) {
        boardLede.textContent = `Welcome, ${label}. Review forms handed in by cadets. Officers do not submit forms.`;
      }
    }

    if (isAdmin) {
      if (adminPanel) adminPanel.hidden = false;
      if (areaEyebrow) areaEyebrow.textContent = "Admin area · 管理專區";
      if (boardTitle) boardTitle.textContent = "Admin dashboard";
      if (boardLede) {
        boardLede.textContent = `Welcome, ${label}. Create accounts (any email / role), approve exceptions, and manage members.`;
      }
      await renderAdminLists();

      createForm?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(createForm);
        const submitBtn = createForm.querySelector('[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        setCreateStatus("", "");

        try {
          const result = await window.HKACCAuth.adminCreateAccount({
            displayName: String(formData.get("displayName") || "").trim(),
            username: String(formData.get("username") || "").trim(),
            email: String(formData.get("email") || "").trim(),
            password: String(formData.get("password") || ""),
            role: String(formData.get("role") || "cadet"),
          });

          if (!result.ok) {
            setCreateStatus("error", result.error || "Could not create account.");
            return;
          }

          setCreateStatus("ok", result.message || "Account created.");
          createForm.reset();
          await renderAdminLists();
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });

      adminPanel?.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        const row = button.closest("[data-id]");
        const id = row?.getAttribute("data-id");
        if (!id) return;

        const action = button.getAttribute("data-action");
        const account = (await window.HKACCAuth.ensureAccounts()).find(
          (a) => a.id === id
        );

        button.disabled = true;
        try {
          if (action === "approve") {
            alertError(await window.HKACCAuth.approveAccount(id));
          } else if (action === "reject") {
            if (window.confirm("Reject and delete this exception request?")) {
              alertError(await window.HKACCAuth.rejectAccount(id));
            }
          } else if (action === "make-admin") {
            alertError(await window.HKACCAuth.setMemberRole(id, "admin"));
          } else if (action === "make-officer") {
            alertError(await window.HKACCAuth.setMemberRole(id, "officer"));
          } else if (action === "make-cadet") {
            alertError(await window.HKACCAuth.setMemberRole(id, "cadet"));
          } else if (action === "demote") {
            if (window.confirm("Set this member back to cadet?")) {
              alertError(await window.HKACCAuth.setMemberRole(id, "cadet"));
            }
          } else if (action === "rename") {
            const next = window.prompt("New username:", account?.username || "");
            if (next != null && next.trim()) {
              alertError(await window.HKACCAuth.renameAccount(id, next));
            }
          } else if (action === "displayname") {
            const next = window.prompt(
              "New display name:",
              account?.displayName || account?.username || ""
            );
            if (next != null && next.trim()) {
              alertError(await window.HKACCAuth.updateDisplayName(id, next));
            }
          } else if (action === "password") {
            const next = window.prompt("New password (min 6 characters):", "");
            if (next != null && next !== "") {
              alertError(await window.HKACCAuth.resetPassword(id, next));
            }
          } else if (action === "suspend") {
            if (
              window.confirm(
                "Suspend this account? They will not be able to sign in."
              )
            ) {
              alertError(await window.HKACCAuth.setSuspended(id, true));
            }
          } else if (action === "unsuspend") {
            alertError(await window.HKACCAuth.setSuspended(id, false));
          } else if (action === "remove") {
            if (
              window.confirm(
                `Remove account @${account?.username || id}? This cannot be undone.`
              )
            ) {
              const result = await window.HKACCAuth.removeAccount(id);
              if (!alertError(result)) return;
              if (account?.username === session.memberId) {
                window.HKACCAuth.clearSession();
                window.location.href = "login.html";
                return;
              }
            }
          }
          await renderAdminLists();
        } finally {
          button.disabled = false;
        }
      });
    }
  };

  logoutBtn?.addEventListener("click", () => {
    window.HKACCAuth.clearSession();
    window.location.href = "login.html";
  });

  start().catch(() => {
    window.alert("Could not open the secure account vault.");
    window.HKACCAuth.clearSession();
    window.location.href = "login.html";
  });
})();
