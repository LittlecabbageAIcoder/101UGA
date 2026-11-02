(() => {
  const form = document.getElementById("register-form");
  const status = document.getElementById("form-status");
  if (!form || !status || !window.HKACCAuth) return;

  const showStatus = (message, type) => {
    status.hidden = false;
    status.textContent = message;
    status.dataset.type = type;
  };

  if (window.HKACCAuth.getSession()) {
    window.location.replace("members.html");
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const displayName = form.querySelector("#display-name")?.value || "";
    const username = form.querySelector("#username")?.value || "";
    const email = form.querySelector("#email")?.value || "";
    const password = form.querySelector("#password")?.value || "";
    const confirm = form.querySelector("#password-confirm")?.value || "";
    const submitBtn = form.querySelector('button[type="submit"]');

    if (password !== confirm) {
      showStatus("Passwords do not match.", "error");
      return;
    }

    submitBtn.disabled = true;
    try {
      const result = await window.HKACCAuth.registerAccount({
        username,
        email,
        password,
        displayName,
      });

      if (!result.ok) {
        showStatus(result.error, "error");
        if (result.redirectException) {
          window.setTimeout(() => {
            window.location.href = "exception.html";
          }, 1400);
        }
        return;
      }

      showStatus(result.message, "ok");
      window.setTimeout(() => {
        window.location.href = "login.html";
      }, 1200);
    } catch {
      showStatus("Could not create the account securely in this browser.", "error");
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
