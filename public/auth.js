const $ = id => document.getElementById(id);
let isLogin = true;
let resetStep = "request";
let resetTokenTemporal = "";

const swalEstilo = {
  buttonsStyling: false,
  customClass: {
    popup: "mi-swal-popup",
    confirmButton: "btn-enviar",
    cancelButton: "btn-cancelar",
    textarea: "mi-swal-textarea",
    input: "mi-swal-input"
  }
};
const themedSwal = opts => Swal.fire({
  ...swalEstilo,
  ...opts,
  customClass: { ...swalEstilo.customClass, ...(opts.customClass || {}) }
});
const notify = (icon, title, text) => window.Swal
  ? themedSwal({ icon, title, text })
  : alert([title, text].filter(Boolean).join("\n"));

function setAuthMode(loginMode) {
  isLogin = loginMode;
  $("auth-form").classList.remove("hidden");
  $("reset-form").classList.add("hidden");
  $("change-mode").classList.remove("hidden");
  $("toggle-text").classList.remove("hidden");
  $("forgot-password").classList.remove("hidden");
  $("back-login").classList.add("hidden");
  $("form-title").innerText = isLogin ? "Inicia sesión para continuar" : "Crea una cuenta nueva";
  $("btn-text").innerText = isLogin ? "Ingresar" : "Registrarse";
  $("toggle-text").innerText = isLogin ? "¿No tienes cuenta?" : "¿Ya tienes cuenta?";
  $("change-mode").innerText = isLogin ? "Regístrate aquí" : "Inicia sesión";
  $("username").placeholder = isLogin ? "Nombre o correo" : "Nombre";
  $("correo").classList.toggle("hidden", isLogin);
  $("correo").required = !isLogin;
  $("msg").innerText = "";
  $("msg").classList.remove("msg-success", "msg-error");
}

function setResetMode() {
  resetStep = "request";
  resetTokenTemporal = "";
  $("auth-form").classList.add("hidden");
  $("reset-form").classList.remove("hidden");
  $("change-mode").classList.add("hidden");
  $("toggle-text").classList.add("hidden");
  $("forgot-password").classList.add("hidden");
  $("back-login").classList.remove("hidden");
  $("form-title").innerText = "Recuperar contraseña";
  $("reset-identifier").disabled = false;
  $("reset-token").classList.add("hidden");
  $("reset-token").value = "";
  $("reset-new-password").classList.add("hidden");
  $("reset-confirm-password").classList.add("hidden");
  $("reset-help").classList.add("hidden");
  $("reset-help").innerText = "";
  $("reset-btn-text").innerText = "Solicitar verificación";
  $("msg").innerText = "";
}

$("change-mode").addEventListener("click", () => setAuthMode(!isLogin));
$("forgot-password").addEventListener("click", setResetMode);
$("back-login").addEventListener("click", () => setAuthMode(true));

$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const endpoint = isLogin ? "/login" : "/register";
  const body = {
    username: $("username").value,
    password: $("password").value,
    correo: $("correo").value || null
  };

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const contentType = res.headers.get("content-type");
    const data = contentType?.includes("application/json") ? await res.json() : { error: await res.text() };

    if (!res.ok) throw new Error(data.error || "Ocurrió un error con tus credenciales");

    if (isLogin) {
      const userRole = data.user?.role?.toLowerCase().trim() || "user";
      if (userRole === "admin") window.location.href = "/panel-admin";
      else if (userRole === "tecnico") window.location.href = "/panel-tecnico";
      else window.location.href = "/panel-usuario";
      return;
    }

    $("msg").classList.remove("msg-error");
    $("msg").classList.add("msg-success");
    $("msg").innerText = "Registro exitoso. Ya puedes iniciar sesión.";
    $("auth-form").reset();
  } catch (err) {
    $("msg").classList.remove("msg-success");
    $("msg").classList.add("msg-error");
    $("msg").innerText = err.message || "Error de conexión con el servidor";
  }
});

$("reset-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    if (resetStep === "request") {
      const res = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: $("reset-identifier").value })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo crear la verificación");

      resetStep = "confirm";
      resetTokenTemporal = data.resetToken || "";
      $("reset-identifier").disabled = true;
      $("reset-token").value = resetTokenTemporal;
      $("reset-token").classList.toggle("hidden", Boolean(resetTokenTemporal));
      $("reset-new-password").classList.remove("hidden");
      $("reset-confirm-password").classList.remove("hidden");
      $("reset-help").classList.remove("hidden");
      $("reset-help").innerText = resetTokenTemporal
        ? "Verificación creada. Escribe tu nueva contraseña para terminar."
        : "Verificación creada. Ingresa el token recibido y tu nueva contraseña.";
      $("reset-btn-text").innerText = "Cambiar contraseña";
      notify("success", "Verificación creada", data.message);
      return;
    }

    if ($("reset-new-password").value !== $("reset-confirm-password").value) {
      throw new Error("Las contraseñas no coinciden");
    }

    const res = await fetch("/api/auth/password-reset/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: resetTokenTemporal || $("reset-token").value,
        newPassword: $("reset-new-password").value
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "No se pudo cambiar la contraseña");

    notify("success", "Contraseña actualizada", "Ya puedes iniciar sesión con tu nueva contraseña.");
    $("reset-form").reset();
    setAuthMode(true);
  } catch (err) {
    notify("error", "Recuperación fallida", err.message);
  }
});
