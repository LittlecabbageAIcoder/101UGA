(() => {
  if (!window.HKACCAuth) return;

  const welcome = document.getElementById("welcome");
  const logoutBtn = document.getElementById("logout-btn");
  const tabEvent = document.getElementById("tab-event");
  const tabAbsence = document.getElementById("tab-absence");
  const eventForm = document.getElementById("event-form");
  const absenceForm = document.getElementById("absence-form");
  const handinSection = document.getElementById("handin-section");
  const formsList = document.getElementById("forms-list");
  const formsScope = document.getElementById("forms-scope");
  const formsEyebrow = document.getElementById("forms-eyebrow");
  const formsTitle = document.getElementById("forms-title");
  const formsLede = document.getElementById("forms-lede");
  const formsInboxKicker = document.getElementById("forms-inbox-kicker");
  const submittedHeading = document.getElementById("submitted-heading");

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

  const showStatus = (el, message, type) => {
    if (!el) return;
    el.hidden = false;
    el.textContent = message;
    el.dataset.type = type;
  };

  const setActiveTab = (type) => {
    if (!eventForm || !absenceForm || !tabEvent || !tabAbsence) return;
    const isEvent = type === "event";
    eventForm.hidden = !isEvent;
    absenceForm.hidden = isEvent;
    tabEvent.classList.toggle("is-active", isEvent);
    tabAbsence.classList.toggle("is-active", !isEvent);
    tabEvent.classList.toggle("btn-primary", isEvent);
    tabEvent.classList.toggle("btn-ghost", !isEvent);
    tabEvent.classList.toggle("dark", !isEvent);
    tabAbsence.classList.toggle("btn-primary", !isEvent);
    tabAbsence.classList.toggle("btn-ghost", isEvent);
    tabAbsence.classList.toggle("dark", isEvent);
  };

  let canReview = false;
  let canSubmit = false;

  const renderForms = async () => {
    const forms = await window.HKACCAuth.listMemberForms({
      mineOnly: !canReview,
    });

    if (formsScope) {
      formsScope.textContent = canReview
        ? "All cadet submissions — approve, mark reviewed, or reject."
        : "Your recent submissions.";
    }

    if (!forms.length) {
      formsList.innerHTML = canReview
        ? '<p class="admin-empty">No forms handed in by cadets yet.</p>'
        : '<p class="admin-empty">No forms handed in yet.</p>';
      return;
    }

    formsList.innerHTML = forms
      .map((f) => {
        const title =
          f.type === "event"
            ? `Event · ${f.fields.eventName || "Untitled"}`
            : `Parents letter of absence · ${f.fields.cadetName || "Cadet"}`;
        const summary =
          f.type === "event"
            ? `${f.fields.eventDate || ""} — ${f.fields.details || ""}`
            : `${f.fields.absenceDate || ""} — ${f.fields.reason || ""} (Parent: ${
                f.fields.parentName || ""
              }, ${f.fields.parentContact || ""})`;
        const reviewActions = canReview
          ? `
          <div class="admin-actions">
            <button type="button" class="btn btn-primary btn-small" data-action="approved" data-id="${f.id}">Approve</button>
            <button type="button" class="btn btn-ghost dark btn-small" data-action="reviewed" data-id="${f.id}">Mark reviewed</button>
            <button type="button" class="btn btn-danger btn-small" data-action="rejected" data-id="${f.id}">Reject</button>
          </div>`
          : "";
        return `
        <article class="admin-row" data-id="${f.id}">
          <div>
            <strong>${escapeHtml(title)}</strong>
            <span class="admin-meta">By @${escapeHtml(f.submittedBy)} · ${formatDate(
              f.submittedAt
            )} · Status: ${escapeHtml(f.status)}</span>
            <span class="admin-meta admin-reason">${escapeHtml(summary)}</span>
          </div>
          ${reviewActions}
        </article>`;
      })
      .join("");
  };

  const start = async () => {
    const accounts = await window.HKACCAuth.ensureAccounts();
    const me = accounts.find((a) => a.username === session.memberId);
    canReview = window.HKACCAuth.canReviewForms(me);
    canSubmit = window.HKACCAuth.canSubmitForms(me);
    const roleName = window.HKACCAuth.roleLabel(me?.role || session.role);
    const label = me?.displayName || session.displayName || session.memberId;

    if (welcome) welcome.textContent = `${roleName} · ${label}`;

    if (!canSubmit && handinSection) {
      handinSection.hidden = true;
    }

    if (canReview && !canSubmit) {
      // Officer: review-only
      if (formsEyebrow) formsEyebrow.textContent = "Form review · 表格審核";
      if (formsTitle) formsTitle.textContent = "Check submitted forms";
      if (formsLede) {
        formsLede.textContent =
          "Officers can review event forms and parents letters handed in by cadets. Hand-in is for cadets only.";
      }
      if (formsInboxKicker) formsInboxKicker.textContent = "Review";
      if (submittedHeading) submittedHeading.textContent = "Cadet submissions";
    } else if (canReview && canSubmit) {
      // Admin
      if (formsEyebrow) formsEyebrow.textContent = "Forms · admin";
      if (formsLede) {
        formsLede.textContent =
          "Hand in forms if needed, or review all cadet submissions below.";
      }
      if (formsInboxKicker) formsInboxKicker.textContent = "All submissions";
    }

    if (canSubmit) {
      setActiveTab("event");
      const display = session.displayName || session.memberId || "";
      if (document.getElementById("event-cadet")) {
        document.getElementById("event-cadet").value = display;
      }
      if (document.getElementById("absence-cadet")) {
        document.getElementById("absence-cadet").value = display;
      }

      tabEvent?.addEventListener("click", () => setActiveTab("event"));
      tabAbsence?.addEventListener("click", () => setActiveTab("absence"));

      if (window.location.hash === "#absence") {
        setActiveTab("absence");
      }

      eventForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        const status = document.getElementById("event-status");
        const result = window.HKACCAuth.submitMemberForm({
          type: "event",
          fields: {
            eventName: document.getElementById("event-name")?.value,
            eventDate: document.getElementById("event-date")?.value,
            cadetName: document.getElementById("event-cadet")?.value,
            details: document.getElementById("event-details")?.value,
          },
        });
        if (!result.ok) {
          showStatus(status, result.error, "error");
          return;
        }
        showStatus(status, "Event form handed in.", "ok");
        eventForm.reset();
        document.getElementById("event-cadet").value = display;
        renderForms();
      });

      absenceForm?.addEventListener("submit", (event) => {
        event.preventDefault();
        const status = document.getElementById("absence-status");
        const ack = document.getElementById("parent-ack");
        if (!ack?.checked) {
          showStatus(
            status,
            "Parent / guardian acknowledgement is required.",
            "error"
          );
          return;
        }
        const result = window.HKACCAuth.submitMemberForm({
          type: "absence",
          fields: {
            cadetName: document.getElementById("absence-cadet")?.value,
            absenceDate: document.getElementById("absence-date")?.value,
            reason: document.getElementById("absence-reason")?.value,
            parentName: document.getElementById("parent-name")?.value,
            parentContact: document.getElementById("parent-contact")?.value,
            parentAck: "yes",
          },
        });
        if (!result.ok) {
          showStatus(status, result.error, "error");
          return;
        }
        showStatus(status, "Parents letter of absence handed in.", "ok");
        absenceForm.reset();
        document.getElementById("absence-cadet").value = display;
        renderForms();
      });
    }

    formsList?.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const id = button.getAttribute("data-id");
      const action = button.getAttribute("data-action");
      button.disabled = true;
      try {
        const result = await window.HKACCAuth.setFormStatus(id, action);
        if (!result.ok) {
          window.alert(result.error);
          return;
        }
        await renderForms();
      } finally {
        button.disabled = false;
      }
    });

    await renderForms();
  };

  logoutBtn?.addEventListener("click", () => {
    window.HKACCAuth.clearSession();
    window.location.href = "login.html";
  });

  start().catch(() => {
    window.alert("Could not open forms.");
    window.location.href = "login.html";
  });
})();
