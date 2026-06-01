document.addEventListener("DOMContentLoaded", () => {
  let ticketsData = [];
  let avatarSeleccionadoTemporal = "fa-user";
  let ticketEditando = null;
  let uploadPreviewUrls = [];

const $ = id => document.getElementById(id);
  const detail = window.ServiHelpTicketDetail;
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
  const toast = (icon, title) => window.Swal
    ? themedSwal({ icon, title, timer: 1800, showConfirmButton: false })
    : alert(title);
  const ask = (opts) => window.Swal ? themedSwal(opts) : Promise.resolve({
    isConfirmed: confirm(opts.title || opts.text || "Confirmar"),
    value: opts.input ? prompt(opts.inputLabel || opts.title || "") : true
  });
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
  const urlArchivo = archivo => archivo?.startsWith("/uploads/") ? archivo : `/uploads/${archivo}`;

  function limpiarPreviewCarga() {
    uploadPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    uploadPreviewUrls = [];
    const preview = $("preview-evidencias");
    if (preview) preview.innerHTML = "";
  }

  function renderPreviewCarga() {
    limpiarPreviewCarga();
    const input = $("archivo");
    const preview = $("preview-evidencias");
    if (!input || !preview || input.files.length === 0) return;
    uploadPreviewUrls = [...input.files].slice(0, 5).map(file => URL.createObjectURL(file));
    detail.renderCarousel(preview, uploadPreviewUrls, "Selecciona imagenes para previsualizar.");
  }

  async function refrescarDatos() {
    try {
      const res = await fetch("/api/tickets");
      if (!res.ok) throw new Error("Error al conectar");
      ticketsData = await res.json();
      aplicarFiltros();
    } catch (err) {
      console.error(err);
      toast("error", "No se pudieron cargar los tickets");
    }
  }

  function ocultarTodasLasSecciones() {
    ["inicio", "formulario", "perfil", "ayuda"].forEach(id => $(id)?.classList.add("hidden"));
    ["nav-inicio", "nav-formulario", "nav-perfil", "nav-ayuda"].forEach(id => $(id)?.classList.remove("active"));
  }

  async function mostrarInicio() {
    ocultarTodasLasSecciones();
    $("inicio")?.classList.remove("hidden");
    $("nav-inicio")?.classList.add("active");
    await refrescarDatos();
  }

  function mostrarFormulario(ticket = null) {
    ocultarTodasLasSecciones();
    $("formulario")?.classList.remove("hidden");
    $("nav-formulario")?.classList.add("active");
    ticketEditando = ticket;
    $("formTicket").reset();
    limpiarPreviewCarga();
    $("titulo").value = ticket?.titulo || "";
    $("descripcion").value = ticket?.descripcion || "";
    $("formulario").querySelector("h3").innerText = ticket ? `Editar Ticket #${ticket.id_ticket}` : "Nuevo Reporte de Incidencia";
    $("formTicket").querySelector(".btn-enviar").innerText = ticket ? "Guardar Cambios" : "Enviar Ticket";
    $("nArchivo").innerText = ticket ? "Sube nuevas imágenes para reemplazar las anteriores" : "Maximo 5 imágenes";
  }

  function mostrarPerfil() {
    ocultarTodasLasSecciones();
    $("perfil")?.classList.remove("hidden");
    $("nav-perfil")?.classList.add("active");
  }

  function mostrarAyuda() {
    ocultarTodasLasSecciones();
    $("ayuda")?.classList.remove("hidden");
    $("nav-ayuda")?.classList.add("active");
  }

  $("nav-inicio")?.addEventListener("click", mostrarInicio);
  $("nav-formulario")?.addEventListener("click", () => mostrarFormulario());
  $("nav-perfil")?.addEventListener("click", mostrarPerfil);
  $("nav-ayuda")?.addEventListener("click", mostrarAyuda);
  $("btn-cancelar-ticket")?.addEventListener("click", mostrarInicio);
  $("btn-cancelar-perfil")?.addEventListener("click", mostrarInicio);
  $("logout-btn")?.addEventListener("click", async () => {
    const res = await fetch("/logout", { method: "POST" });
    if (res.ok) window.location.href = "/";
  });
  $("archivo")?.addEventListener("change", renderPreviewCarga);
  $("btn-evidencias")?.addEventListener("click", () => {
    console.log("Botón presionado");
    $("archivo").click();
  });
  detail?.initNotificationBell?.();


  $("formTicket")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData(e.target);
      const endpoint = ticketEditando ? `/api/tickets/${ticketEditando.id_ticket}` : "/api/tickets";
      const options = ticketEditando
        ? { method: "PUT", body: formData }
        : { method: "POST", body: formData };

      if (ticketEditando && $("archivo").files.length > 0) {
        formData.append("replaceEvidencias", "1");
      }

      const response = await fetch(endpoint, options);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "No se pudo guardar el ticket");
      }

      toast("success", ticketEditando ? "Ticket actualizado" : "Ticket creado exitosamente");
      ticketEditando = null;
      e.target.reset();
      limpiarPreviewCarga();
      await refrescarDatos();
      mostrarInicio();
    } catch (error) {
      console.error(error);
      toast("error", error.message);
    }
  });

  function renderizarTabla(data) {
    const tbody = $("listaTickets");
    if (!tbody) return;
    tbody.innerHTML = "";

   const contadores = { sinAsignar: 0, pendientes: 0, proceso: 0, espera: 0, resueltos: 0, cerrados: 0 };

    data.forEach(t => {
      const est = (t.estado || "").toLowerCase().trim();
      const prio = (t.prioridad || "media").toLowerCase().trim();
      const badgeClase = est === "pendiente_asignacion" ? "sin-asig" : (est === "en proceso" ? "proc" : (est === "en espera" ? "espera" : (est === "cerrado" ? "cerr" : (est === "resuelto" ? "resuel" : "pend"))));
      const icon = est === "pendiente_asignacion" ? "fa-user-clock" : (est === "en proceso" ? "fa-spinner fa-spin" : (est === "en espera" ? "fa-clock" : (est === "resuelto" ? "fa-circle-check" : (est === "cerrado" ? "fa-lock" : "fa-circle-dot"))));
      const tipoAutomatico = ["alta", "critica"].includes(prio) ? "INC" : "REQ";
      const claseTipo = tipoAutomatico === "INC" ? "inc" : "req";
      const totalTecnicos = Number(t.total_tecnicos || 0);
      const puedeEditar = est === "pendiente_asignacion" && totalTecnicos === 0;
      const resueltosTecnicos = Number(t.tecnicos_resueltos || 0);
      const avance = totalTecnicos > 1 && est === "en proceso"
        ? `<div class="ticket-fecha-tabla">Avance técnico: ${resueltosTecnicos}/${totalTecnicos}</div>`
        : "";

     if (est === "pendiente_asignacion") contadores.sinAsignar++;
    else if (est === "pendiente") contadores.pendientes++;
    else if (est === "en proceso") contadores.proceso++;
    else if (est === "en espera") contadores.espera++;
    else if (est === "resuelto") contadores.resueltos++;
    else if (est === "cerrado") contadores.cerrados++;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td data-label="ID">#${t.id_ticket}</td>
        <td data-label="Fecha">${t.fecha_creacion ? new Date(t.fecha_creacion).toLocaleString() : "S/F"}</td>
        <td data-label="Tipo"><span class="tag-ticket ${claseTipo}">${tipoAutomatico}</span></td>
        <td data-label="Asunto">${escapeHtml(t.titulo)}${avance}</td>
        <td data-label="Prioridad"><span class="badge ${prio.replace(/\s+/g, "-")}">${escapeHtml((t.prioridad || "Sin evaluar").toUpperCase())}</span></td>
        <td data-label="Estado"><span class="badge ${badgeClase}"><i class="fa-solid ${icon}"></i> ${escapeHtml(t.estado)}</span></td>
        <td data-label="Acciones" class="acciones-cell">
          <div class="flex-gap-8">
            <button class="btn-ver" data-action="ver" title="Ver detalle"><i class="fa-solid fa-eye"></i></button>
            ${puedeEditar ? `<button class="btn-ver" data-action="editar" title="Editar"><i class="fa-solid fa-pen"></i></button>
            <button class="btn-rechazar" data-action="eliminar" title="Eliminar"><i class="fa-solid fa-trash"></i></button>` : ""}
            ${est === "resuelto" ? `<button class="btn-aprobar" data-action="aprobar" title="Aprobar solución"><i class="fa-solid fa-check"></i></button>
            <button class="btn-rechazar" data-action="rechazar" title="Rechazar solución"><i class="fa-solid fa-xmark"></i></button>` : ""}
          </div>
        </td>`;

      tr.querySelector('[data-action="ver"]')?.addEventListener("click", () => verDetalle(t.id_ticket));
      tr.querySelector('[data-action="editar"]')?.addEventListener("click", () => mostrarFormulario(t));
      tr.querySelector('[data-action="eliminar"]')?.addEventListener("click", () => eliminarTicket(t.id_ticket));
      tr.querySelector('[data-action="aprobar"]')?.addEventListener("click", () => cambiarEstadoTicket(t.id_ticket, "aprobar"));
      tr.querySelector('[data-action="rechazar"]')?.addEventListener("click", () => cambiarEstadoTicket(t.id_ticket, "rechazar"));
      tbody.appendChild(tr);
    });

    $("cSinAsig").innerText = contadores.sinAsignar;
    $("cPend").innerText = contadores.pendientes;
    $("cProc").innerText = contadores.proceso;
    if ($("cEsp")) $("cEsp").innerText = contadores.espera;
    $("cRes").innerText = contadores.resueltos;
    $("cCer").innerText = contadores.cerrados;
  }

  async function pintarEvidencias(ticketId, fallbackArchivo, contenedor) {
    const evidencias = await fetch(`/api/tickets/${ticketId}/evidencias`).then(r => r.ok ? r.json() : []).catch(() => []);
    const archivos = evidencias.length ? evidencias.map(e => e.ruta_archivo) : (fallbackArchivo ? [fallbackArchivo] : []);
    detail.renderCarousel(contenedor, archivos, "No se subió evidencia para este reporte.");
  }

  async function pintarSoluciones(ticketId, contenedor) {
    const soluciones = await fetch(`/api/tickets/${ticketId}/soluciones`).then(r => r.ok ? r.json() : []).catch(() => []);
    detail.renderSolutions(contenedor, soluciones, "Retroalimentación del técnico");
  }

  async function pintarAsignaciones(ticketId, contenedor) {
    const asignaciones = await fetch(`/api/tickets/${ticketId}/asignaciones`).then(r => r.ok ? r.json() : []).catch(() => []);
    detail.renderAssignments(contenedor, asignaciones, "Estado de atencion");
  }

  async function verDetalle(ticketId) {
    try {
      const res = await fetch(`/api/tickets/${ticketId}`);
      if (!res.ok) throw new Error("No se pudo cargar el ticket");
      const t = await res.json();
      $("mTitulo").innerText = `Detalle del Ticket: #${t.id_ticket}`;
      $("mDescripcion").innerText = t.descripcion || "Sin descripción.";
      const totalTecnicos = Number(t.total_tecnicos || 0);
      const resueltosTecnicos = Number(t.tecnicos_resueltos || 0);
      if (totalTecnicos > 0) {
        $("mDescripcion").innerText += `\n\nAvance tecnico: ${resueltosTecnicos}/${totalTecnicos} resueltos`;
      }
      await pintarEvidencias(ticketId, t.archivo, $("mImagen"));
      await pintarAsignaciones(ticketId, $("mAsignaciones"));
      await pintarSoluciones(ticketId, $("mSoluciones"));

      const esResuelto = (t.estado || "").toLowerCase().trim() === "resuelto";
      $("btn-aprobar").style.display = esResuelto ? "inline-block" : "none";
      $("btn-rechazar").style.display = esResuelto ? "inline-block" : "none";
      $("btn-aprobar").onclick = () => cambiarEstadoTicket(t.id_ticket, "aprobar");
      $("btn-rechazar").onclick = () => cambiarEstadoTicket(t.id_ticket, "rechazar");
      $("btn-cerrar-modal").onclick = () => $("modalTicket").classList.remove("active");
      $("modalTicket").classList.add("active");
    } catch (err) {
      console.error(err);
      toast("error", err.message);
    }
  }

  async function cambiarEstadoTicket(ticketId, accion) {
    const body = {};
    if (accion === "rechazar") {
      const result = await ask({
        title: "Motivo del rechazo",
        input: "textarea",
        inputLabel: "Indica por qué rechazas la atención",
        inputValidator: value => !value?.trim() && "Escribe el motivo del rechazo",
        showCancelButton: true,
        confirmButtonText: "Rechazar",
        cancelButtonText: "Cancelar"
      });
      if (!result.isConfirmed) return;
      body.comentario = result.value;
    }

    $("modalTicket")?.classList.remove("active");
    const response = await fetch(`/api/tickets/${ticketId}/${accion}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) return toast("error", "Error al cambiar el estado del ticket");
    await refrescarDatos();
    toast("success", accion === "aprobar" ? "Solución aprobada" : "Atención rechazada");
  }

  async function eliminarTicket(ticketId) {
    const result = await ask({
      title: "Eliminar ticket",
      text: "Esta acción eliminará el ticket de tus reportes.",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar"
    });
    if (!result.isConfirmed) return;

    const res = await fetch(`/api/tickets/${ticketId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo: "Eliminado por el usuario" })
    });
    if (!res.ok) return toast("error", "No se pudo eliminar el ticket");
    await refrescarDatos();
    toast("success", "Ticket eliminado");
  }

  async function guardarPerfil(e) {
    e.preventDefault();
    const response = await fetch("/api/perfil", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar: avatarSeleccionadoTemporal })
    });
    if (response.ok) {
      toast("success", "Perfil actualizado");
      $("sidebarAvatar").innerHTML = `<i class="fa-solid ${avatarSeleccionadoTemporal}"></i>`;
      mostrarInicio();
    }
  }

  $("formPerfil")?.addEventListener("submit", guardarPerfil);
  document.querySelectorAll(".avatar-option").forEach(opcion => {
    opcion.addEventListener("click", function () {
      document.querySelectorAll(".avatar-option").forEach(o => o.classList.remove("selected"));
      this.classList.add("selected");
      avatarSeleccionadoTemporal = this.getAttribute("data-avatar");
    });
  });

  ["busqueda", "filtroEstado", "filtroTipo", "filtroPrioridad"].forEach(id => {
    $(id)?.addEventListener(id === "busqueda" ? "input" : "change", aplicarFiltros);
  });

  function aplicarFiltros() {
    const estado = $("filtroEstado")?.value || "Todos";
    const tipo = $("filtroTipo")?.value || "Todos";
    const prioridad = $("filtroPrioridad")?.value || "Todos";
    const busqueda = ($("busqueda")?.value || "").toLowerCase();

    const filtrados = ticketsData.filter(t => {
      const tEst = (t.estado || "").toLowerCase().trim();
      const tPrio = (t.prioridad || "media").toLowerCase().trim();
      const tipoTicket = ["alta", "critica"].includes(tPrio) ? "INC" : "REQ";
      const tFechaTxt = t.fecha_creacion ? new Date(t.fecha_creacion).toLocaleDateString().toLowerCase() : "s/f";
      const mB = (t.titulo || "").toLowerCase().includes(busqueda) || tFechaTxt.includes(busqueda);
      const mE = estado === "Todos" || tEst === estado.toLowerCase();
      return mE && (tipo === "Todos" || tipo === tipoTicket) && (prioridad === "Todos" || tPrio === prioridad.toLowerCase()) && mB;
    });

    renderizarTabla(filtrados);
  }

  document.querySelectorAll(".faq-pregunta").forEach(boton => {
    boton.addEventListener("click", () => {
      const itemActual = boton.parentElement;
      document.querySelectorAll(".faq-item.abierto").forEach(item => item !== itemActual && item.classList.remove("abierto"));
      itemActual.classList.toggle("abierto");
    });
  });

  setInterval(() => { if (!document.hidden) refrescarDatos(); }, 30000);
  mostrarInicio();
});
