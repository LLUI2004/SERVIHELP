window.ServiHelpTicketDetail = (() => {
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  const fileUrl = archivo => {
    const value = String(archivo || "");
    if (/^(blob:|data:|https?:\/\/|\/uploads\/)/i.test(value)) return value;
    return `/uploads/${value}`;
  };

  function renderCarousel(container, archivos = [], emptyText = "No hay evidencias.") {
    if (!container) return;
    const clean = archivos.filter(Boolean).slice(0, 5);
    if (clean.length === 0) {
      container.innerHTML = `<p class="evidence-empty">${escapeHtml(emptyText)}</p>`;
      return;
    }

    container.innerHTML = `
      <div class="ticket-detail-carousel">
        <button type="button" class="carousel-btn" data-dir="-1" aria-label="Anterior">
          <i class="fa-solid fa-chevron-left"></i>
        </button>
        <button type="button" class="carousel-image-btn" aria-label="Abrir evidencia">
          <img src="${fileUrl(clean[0])}" class="evidence-img-fluid" data-index="0" alt="Evidencia" loading="lazy" decoding="async">
        </button>
        <button type="button" class="carousel-btn" data-dir="1" aria-label="Siguiente">
          <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>
      <div class="carousel-counter">1 / ${clean.length}</div>
      <div class="evidence-grid">
        ${clean.map((a, i) => `<button type="button" class="evidence-thumb-btn ${i === 0 ? "active" : ""}" data-index="${i}" aria-label="Evidencia ${i + 1}"><i class="fa-solid fa-image"></i><span>${i + 1}</span></button>`).join("")}
      </div>`;

    const main = container.querySelector(".evidence-img-fluid");
    const imageButton = container.querySelector(".carousel-image-btn");
    const counter = container.querySelector(".carousel-counter");
    const thumbs = [...container.querySelectorAll(".evidence-thumb-btn")];
    const setImage = index => {
      const next = (index + clean.length) % clean.length;
      main.src = fileUrl(clean[next]);
      main.dataset.index = next;
      counter.innerText = `${next + 1} / ${clean.length}`;
      thumbs.forEach(t => t.classList.toggle("active", Number(t.dataset.index) === next));
    };

    container.querySelectorAll(".carousel-btn").forEach(btn => {
      btn.addEventListener("click", () => setImage(Number(main.dataset.index) + Number(btn.dataset.dir)));
    });
    thumbs.forEach(btn => btn.addEventListener("click", () => setImage(Number(btn.dataset.index))));
    imageButton.addEventListener("click", () => window.open(main.src, "_blank"));
  }

  function renderAssignments(container, asignaciones = [], title = "Asignaciones") {
    if (!container) return;
    const active = asignaciones.filter(Boolean);
    if (!active.length) {
      container.innerHTML = "";
      return;
    }
    const pendientes = active
      .filter(a => !["resuelto", "rechazado", "cancelado"].includes(String(a.estado_asignacion || "").toLowerCase().trim()))
      .map(a => `${a.tecnico || "Tecnico"} (${a.estado_asignacion || "Asignado"})`);
    const summary = pendientes.length
      ? `<div class="pending-reason"><i class="fa-solid fa-circle-info"></i><span>Falta resolver: ${escapeHtml(pendientes.join(", "))}</span></div>`
      : "";

    container.innerHTML = `
      <h4 class="modal-subtitle">${escapeHtml(title)}</h4>
      ${summary}
      <div class="assignment-list">
        ${active.map(a => {
          const estado = String(a.estado_asignacion || "Asignado");
          const isWaiting = estado.toLowerCase().trim() === "en espera";
          const motivo = String(a.comentario_asignacion || "").replace(/^\[ESPERA\]\s*/, "");
          return `<article class="solution-note assignment-note ${isWaiting ? "assignment-waiting" : ""}">
            <div class="solution-note-head">
              <strong>${escapeHtml(a.tecnico || "Tecnico")}</strong>
              <span>${a.fecha_asignacion ? new Date(a.fecha_asignacion).toLocaleString() : "S/F"}</span>
            </div>
            <p>${escapeHtml(a.area_asignada || "Sin area")} - ${escapeHtml(estado)}</p>
            ${isWaiting && motivo ? `<div class="wait-reason"><i class="fa-solid fa-hourglass-half"></i><span><strong>Motivo de espera:</strong> ${escapeHtml(motivo)}</span></div>` : ""}
          </article>`;
        }).join("")}
      </div>`;
  }

  function renderSolutions(container, soluciones = [], title = "Comentarios y evidencias del tecnico") {
    if (!container) return;
    if (!soluciones.length) {
      container.innerHTML = "";
      return;
    }

    container.innerHTML = `
      <h4 class="modal-subtitle">${escapeHtml(title)}</h4>
      ${soluciones.map((solucion, i) => {
        const rawComment = String(solucion.comentario || "");
        const isHold = rawComment.startsWith("[ESPERA]");
        const comment = isHold ? rawComment.replace(/^\[ESPERA\]\s*/, "") : rawComment;
        const evidenceTitle = isHold ? "Evidencia de espera" : "Evidencia de la solucion";

        return `
        <article class="solution-note">
          <div class="solution-note-head">
            <strong>${escapeHtml(solucion.tecnico || "Tecnico")}</strong>
            <span>${solucion.fecha_solucion ? new Date(solucion.fecha_solucion).toLocaleString() : "S/F"}</span>
          </div>
          ${isHold ? `<div class="wait-reason"><i class="fa-solid fa-hourglass-half"></i><span><strong>Motivo de espera:</strong> ${escapeHtml(comment)}</span></div>` : `<p>${escapeHtml(comment)}</p>`}
          <div class="solution-evidence-title">${escapeHtml(evidenceTitle)}</div>
          <div id="solution-evidence-${solucion.id_solucion || i}" class="solution-evidence-box"></div>
        </article>
      `;
      }).join("")}`;

    soluciones.forEach((solucion, i) => {
      const isHold = String(solucion.comentario || "").startsWith("[ESPERA]");
      const evidencias = (solucion.evidencias || []).map(e => e.ruta_archivo);
      const box = container.querySelector(`#solution-evidence-${solucion.id_solucion || i}`);
      renderCarousel(box, evidencias, isHold ? "Sin evidencia de espera." : "Sin evidencia de solucion.");
    });
  }

  async function loadNotifications() {
    const list = document.getElementById("notif-list");
    const count = document.getElementById("notif-count");
    if (!list || !count) return;

    try {
      const res = await fetch("/api/notificaciones");
      if (!res.ok) return;
      const notifications = await res.json();
      const unread = notifications.filter(n => !n.leida).length;
      count.textContent = unread > 9 ? "9+" : unread;
      count.classList.toggle("hidden", unread === 0);
      list.innerHTML = notifications.length
        ? notifications.slice(0, 8).map(n => `
            <div class="notif-item ${n.leida ? "" : "unread"}">
              <div class="notif-title">${escapeHtml(n.titulo || "Notificacion")}</div>
              <p>${escapeHtml(n.mensaje || "")}</p>
              <span>${n.fecha_creacion ? new Date(n.fecha_creacion).toLocaleString() : ""}</span>
            </div>
          `).join("")
        : `<div class="notif-empty">Sin notificaciones por ahora.</div>`;
    } catch {
      list.innerHTML = `<div class="notif-empty">No se pudieron cargar.</div>`;
    }
  }

  function initNotificationBell() {
    const toggle = document.getElementById("notif-toggle");
    const dropdown = document.getElementById("notif-dropdown");
    const count = document.getElementById("notif-count");
    if (!toggle || !dropdown) return;

    toggle.addEventListener("click", async (event) => {
      event.stopPropagation();
      dropdown.classList.toggle("hidden");
      if (!dropdown.classList.contains("hidden")) {
        await fetch("/api/notificaciones/leer", { method: "PUT" }).catch(() => {});
        count?.classList.add("hidden");
      }
    });
    document.addEventListener("click", event => {
      if (!dropdown.contains(event.target) && !toggle.contains(event.target)) dropdown.classList.add("hidden");
    });

    loadNotifications();
    setInterval(() => { if (!document.hidden) loadNotifications(); }, 30000);
  }

  function initResponsiveShell() {
    const sidebar = document.querySelector(".sidebar");
    const main = document.querySelector(".main");
    if (!sidebar || !main || document.querySelector(".sidebar-toggle")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "sidebar-toggle";
    button.setAttribute("aria-label", "Mostrar u ocultar menu");
    button.setAttribute("title", "Menu");
    button.innerHTML = '<i class="fa-solid fa-bars"></i>';

    const backdrop = document.createElement("div");
    backdrop.className = "sidebar-backdrop";

    document.body.prepend(backdrop);
    const logo = sidebar.querySelector(".logo");
    if (logo) {
      const header = document.createElement("div");
      header.className = "sidebar-head";
      sidebar.insertBefore(header, logo);
      header.appendChild(logo);
      header.appendChild(button);
    } else {
      sidebar.prepend(button);
    }

    const isMobile = () => window.matchMedia("(max-width: 900px)").matches;
    const saved = localStorage.getItem("servihelp-sidebar-collapsed");

    if (saved === "1" || (saved === null && isMobile())) {
      document.body.classList.add("sidebar-collapsed");
    }

    const sync = () => {
      const collapsed = document.body.classList.contains("sidebar-collapsed");
      button.setAttribute("aria-expanded", String(!collapsed));
      button.innerHTML = collapsed
        ? '<i class="fa-solid fa-bars"></i>'
        : '<i class="fa-solid fa-xmark"></i>';
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    };

    button.addEventListener("click", () => {
      document.body.classList.toggle("sidebar-collapsed");
      localStorage.setItem("servihelp-sidebar-collapsed", document.body.classList.contains("sidebar-collapsed") ? "1" : "0");
      sync();
    });

    backdrop.addEventListener("click", () => {
      document.body.classList.add("sidebar-collapsed");
      localStorage.setItem("servihelp-sidebar-collapsed", "1");
      sync();
    });

    sidebar.querySelectorAll("a, button").forEach(control => {
      if (control === button) return;
      control.addEventListener("click", () => {
        document.body.classList.add("sidebar-collapsed");
        localStorage.setItem("servihelp-sidebar-collapsed", "1");
        sync();
      });
    });

    window.addEventListener("resize", () => {
      if (isMobile() && localStorage.getItem("servihelp-sidebar-collapsed") === null) {
        document.body.classList.add("sidebar-collapsed");
      }
      sync();
    });

    sync();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initResponsiveShell);
  } else {
    initResponsiveShell();
  }

  return { escapeHtml, fileUrl, renderCarousel, renderAssignments, renderSolutions, initNotificationBell, loadNotifications, initResponsiveShell };
})();
