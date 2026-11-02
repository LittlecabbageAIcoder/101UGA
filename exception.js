(() => {
  const form = document.getElementById("exception-form");
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
    const reason = form.querySelector("#reason")?.value || "";
    const password = form.querySelector("#password")?.value || "";
    const confirm = form.querySelector("#password-confirm")?.value || "";
    const submitBtn = form.querySelector('button[type="submit"]');

    if (password !== confirm) {
      showStatus("Passwords do not match.", "error");
      return;
    }

    submitBtn.disabled = true;
    try {
      const result = await window.HKACCAuth.submitExceptionRequest({
        username,
        email,
        password,
        displayName,
        reason,
      });

      if (!result.ok) {
        showStatus(result.error, "error");
        if (result.redirectRegister) {
          window.setTimeout(() => {
            window.location.href = "register.html";
          }, 1400);
        }
        return;
      }

      showStatus(result.message, "ok");
      form.reset();
    } catch {
      showStatus("Could not submit the request securely in this browser.", "error");
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
