(() => {
  const form = document.getElementById("login-form");
  const status = document.getElementById("form-status");
  if (!form || !status || !window.HKACCAuth) return;

  const showStatus = (message, type) => {
    status.hidden = false;
    status.textContent = message;
    status.dataset.type = type;
  };

  const boot = async () => {
    await window.HKACCAuth.ensureAccounts();
    if (window.HKACCAuth.getSession()) {
      window.location.replace("members.html");
    }
  };

  boot().catch(() => {
    showStatus("Could not open the secure account vault in this browser.", "error");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const memberId = form.querySelector("#member-id")?.value || "";
    const password = form.querySelector("#password")?.value || "";
    const remember = Boolean(form.querySelector('input[name="remember"]')?.checked);
    const submitBtn = form.querySelector('button[type="submit"]');

    if (!memberId.trim() || !password) {
      showStatus("Please enter your username and password.", "error");
      return;
    }

    submitBtn.disabled = true;
    try {
      const result = await window.HKACCAuth.authenticate(memberId, password);
      if (!result.ok) {
        showStatus(result.error, "error");
        return;
      }

      window.HKACCAuth.setSession(result.account, remember);
      showStatus("Signed in. Redirecting…", "ok");
      window.location.href = "members.html";
    } catch {
      showStatus("Sign-in failed due to a browser security error.", "error");
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
