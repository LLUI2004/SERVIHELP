let ticketsGlobales = [];
let usuariosGlobales = [];
let areasGlobales = [];
let charts = { estado: null, prioridad: null };

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
const confirmBox = (title, text) => window.Swal
  ? themedSwal({ icon: "warning", title, text, showCancelButton: true, confirmButtonText: "Confirmar", cancelButtonText: "Cancelar" })
  : Promise.resolve({ isConfirmed: confirm(`${title}\n${text || ""}`) });
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));
const urlArchivo = archivo => archivo?.startsWith("/uploads/") ? archivo : `/uploads/${archivo}`;
const PRIORIDADES_ADMIN = ["Baja", "Media", "Alta", "Critica"];
const prioridadKey = value => String(value || "Sin evaluar").toLowerCase().trim();
const prioridadLabel = value => {
  const key = prioridadKey(value);
  if (key === "critica") return "CRITICA";
  if (key === "sin evaluar") return "SIN EVALUAR";
  return String(value || "Sin evaluar").toUpperCase();
};
const prioridadOptions = selected => `<option value="">-- Evaluar prioridad --</option>${PRIORIDADES_ADMIN.map(p => `<option value="${p}" ${prioridadKey(selected) === prioridadKey(p) ? "selected" : ""}>${p === "Critica" ? "Crítica" : p}</option>`).join("")}`;
const tipoPorPrioridad = prioridad => ["alta", "critica"].includes(prioridadKey(prioridad)) ? "inc" : "req";

document.addEventListener("DOMContentLoaded", () => {
  detail?.initNotificationBell?.();
  cargarDatosDesdeServidor();

  $("btnFiltrar")?.addEventListener("click", renderizarTablasDashboard);
  $("busqueda")?.addEventListener("input", renderizarTablasDashboard);
  $("filtroEstado")?.addEventListener("change", renderizarTablasDashboard);
  $("filtroPrioridad")?.addEventListener("change", renderizarTablasDashboard);
  $("filtroTipo")?.addEventListener("change", renderizarTablasDashboard);
  $("input-buscar")?.addEventListener("input", filtrarUsuarios);
  $("filtro-rol")?.addEventListener("change", filtrarUsuarios);
  $("filtro-prioridad-designar")?.addEventListener("change", renderizarTicketsADesignar);
  $("btn-cerrar-modal-tecnico-footer")?.addEventListener("click", () => $("modal-ticket-tecnico")?.classList.remove("active"));
  $("logout-btn")?.addEventListener("click", async () => {
    const res = await fetch("/logout", { method: "POST" });
    if (res.ok) window.location.href = "/";
  });

  const navs = { dash: $("nav-dashboard"), des: $("nav-designar"), ges: $("nav-gestion"), ana: $("nav-analisis") };
  const secs = { dash: $("sec-dashboard"), des: $("sec-designar"), ges: $("sec-gestion"), ana: $("sec-analisis") };
  const show = key => {
    Object.values(navs).forEach(m => m?.classList.remove("active"));
    Object.values(secs).forEach(s => s?.classList.add("hidden"));
    navs[key]?.classList.add("active");
    secs[key]?.classList.remove("hidden");
  };
  navs.dash?.addEventListener("click", () => { show("dash"); inicializarPanelAdmin(); });
  navs.des?.addEventListener("click", () => { show("des"); renderizarTicketsADesignar(); });
  navs.ges?.addEventListener("click", () => { show("ges"); actualizarVistasGestion(); });
  navs.ana?.addEventListener("click", () => { show("ana"); renderizarCentroAnalisis(); });

  const modalUser = $("modal-nuevo-usuario");
  $("btn-nuevo-usuario")?.addEventListener("click", () => modalUser?.classList.add("active"));
  $("close-modal-user")?.addEventListener("click", () => modalUser?.classList.remove("active"));
  $("btn-cancelar-user")?.addEventListener("click", () => modalUser?.classList.remove("active"));

  $("form-registro-usuario")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const valorRol = $("reg-rol").value;
    const correo = $("reg-correo")?.value.trim();
    if (!correo) {
      themedSwal({
        icon: "warning",
        title: "Correo obligatorio",
        text: "Debes ingresar un correo electrónico para crear la cuenta."
      });
      return;
    }

    const body = {
      username: $("reg-username").value.trim(),
      password: $("reg-password").value,
      role: valorRol,
      rol: valorRol,
      nombre: $("reg-username").value.trim(),
      correo: correo,
      area: "sistemas"
    };

    try {
      const res = await fetch("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al guardar la cuenta");
      }
      toast("success", "Usuario creado correctamente");
      e.target.reset();
      modalUser?.classList.remove("active");
      await cargarDatosDesdeServidor();
    } catch (e) {
      toast("error", e.message);
    }
  });
});

async function cargarDatosDesdeServidor() {
  try {
    const [resT, resU, resA] = await Promise.all([fetch("/api/admin/tickets"), fetch("/api/usuarios"), fetch("/api/areas")]);
    if (resT.ok) ticketsGlobales = await resT.json();
    if (resU.ok) usuariosGlobales = await resU.json();
    if (resA.ok) areasGlobales = await resA.json();

    inicializarPanelAdmin();
    actualizarVistasGestion();
    renderizarTicketsADesignar();
    cargarTecnicosEnSelect();
    renderizarCentroAnalisis();
  } catch (e) {
    console.error("Error en carga global:", e);
  }
}

function estadoClean(ticket) {
  return (ticket.estado || "").toLowerCase().trim();
}

function inicializarPanelAdmin() {
  const stats = { p: 0, sin: 0, ep: 0, esp: 0, r: 0, c: 0 };
  ticketsGlobales.forEach(t => {
    const est = estadoClean(t);
    if (est === "pendiente") stats.p++;
    if ((est === "pendiente" || est === "pendiente_asignacion") && (!t.total_tecnicos || Number(t.total_tecnicos) === 0)) stats.sin++;
    else if (est === "en proceso") stats.ep++;
    else if (est === "en espera") stats.esp++;
    else if (est === "resuelto") stats.r++;
    else if (est === "cerrado") stats.c++;
  });

  [["kpiAsignados", stats.p], ["kpiSinAsignar", stats.sin], ["kpiProceso", stats.ep], ["kpiEspera", stats.esp], ["kpiResueltos", stats.r], ["kpiCerrados", stats.c]]
    .forEach(([id, val]) => { if ($(id)) $(id).innerText = val; });
  renderizarTablasDashboard();
}

function renderizarTablasDashboard() {
  const tbody = $("tbody-resumen-mis-tickets");
  if (!tbody) return;

  const busqueda = ($("busqueda")?.value || "").toLowerCase();
  const filtro = {
    est: ($("filtroEstado")?.value || "todos").toLowerCase().trim(),
    tipo: ($("filtroTipo")?.value || "todos").toLowerCase().trim(),
    prio: ($("filtroPrioridad")?.value || "todos").toLowerCase().trim()
  };

  const filtrados = ticketsGlobales.filter(t => {
    const tEstado = estadoClean(t);
    const tPrioridad = prioridadKey(t.prioridad);
    const tipoCalculado = tipoPorPrioridad(t.prioridad);
    const fecha = t.fecha_creacion ? new Date(t.fecha_creacion).toLocaleDateString().toLowerCase() : "s/f";
    const creador = (t.usuario_creador || t.username_creador || "").toLowerCase();
    const coincideBusqueda = (t.titulo || "").toLowerCase().includes(busqueda) || fecha.includes(busqueda) || creador.includes(busqueda);
    return coincideBusqueda
      && (filtro.est === "todos" || tEstado === filtro.est)
      && (filtro.tipo === "todos" || tipoCalculado === filtro.tipo)
      && (filtro.prio === "todos" || tPrioridad === filtro.prio);
  });

  tbody.innerHTML = filtrados.map(t => {
    const est = estadoClean(t);
    const badgeClase = est === "pendiente_asignacion" ? "sin-asig" : (est === "en proceso" ? "proc"  : (est === "en espera" ? "espera" : (est === "cerrado" ? "cerr"  : (est === "resuelto" ? "resuel" : "pend"))));
    const icon = est === "pendiente_asignacion" ? "fa-user-clock" : (est === "en proceso" ? "fa-spinner fa-spin"  : (est === "en espera" ? "fa-clock" : (est === "resuelto" ? "fa-circle-check"  : (est === "cerrado" ? "fa-lock" : "fa-circle-dot"))));
    const prio = prioridadKey(t.prioridad);
    const tipoAutomatico = tipoPorPrioridad(t.prioridad) === "inc" ? "INC" : "REQ";
    const claseTipo = tipoAutomatico === "INC" ? "inc" : "req";
    const fecha = t.fecha_creacion ? new Date(t.fecha_creacion).toLocaleString() : "S/F";
    const nombreTecnico = t.tecnicos_asignados || (usuariosGlobales.find(u => u.id_usuario == t.id_tecnico_asignado)?.username) || "Sin asignar";
    const totalTecnicos = Number(t.total_tecnicos || 0);
    const resueltosTecnicos = Number(t.tecnicos_resueltos || 0);
    const avanceTecnico = totalTecnicos > 1 ? `<div class="ticket-fecha-tabla">Avance tecnico: ${resueltosTecnicos}/${totalTecnicos}</div>` : "";

    const puedeAsignar = ["pendiente", "pendiente_asignacion", "en proceso"].includes(est);

    return `<tr>
      <td data-label="ID"><span class="id-text">#${t.id_ticket}</span></td>
      <td data-label="Tipo"><span class="tag-ticket ${claseTipo}">${tipoAutomatico}</span></td>
      <td data-label="Asunto"><div class="ticket-titulo-tabla">${escapeHtml(t.titulo)}</div><div class="ticket-fecha-tabla"><i class="fa-solid fa-calendar-days"></i> ${fecha}</div></td>
      <td data-label="Solicitante">${escapeHtml(t.usuario_creador || "N/A")}</td>
      <td data-label="Prioridad"><span class="badge ${prio.replace(/\s+/g, "-")}">${escapeHtml(prioridadLabel(t.prioridad))}</span></td>
      <td data-label="Estado"><span class="badge ${badgeClase}"><i class="fa-solid ${icon}"></i> ${escapeHtml(t.estado)}</span></td>
      <td data-label="Asignado a"><strong class="tech-assigned-text">${escapeHtml(nombreTecnico)}</strong>${avanceTecnico}</td>
      <td data-label="Acciones">
        <div class="flex-gap-8">
          <button class="btn-ver" onclick="verDetalleTicketAdmin(${t.id_ticket})" title="Ver detalle"><i class="fa-solid fa-eye"></i></button>
          ${puedeAsignar ? `<button class="btn-ver" onclick="abrirAsignacionAdmin(${t.id_ticket})" title="Gestionar técnicos"><i class="fa-solid fa-user-plus"></i></button>` : ""}
        </div>
      </td>
    </tr>`;
  }).join("");

  if (filtrados.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty-message">No hay tickets con esos filtros.</td></tr>`;
  }
}

window.verDetalleTicketAdmin = async function (id) {
  const t = ticketsGlobales.find(ticket => ticket.id_ticket == id);
  if (!t) return;

  $("m-id-ticket").innerText = `Detalle: #${id}`;
  $("m-descripcion-ticket").innerText = t.descripcion || "Sin descripción.";

  const evidencias = await fetch(`/api/tickets/${id}/evidencias`).then(r => r.ok ? r.json() : []).catch(() => []);
  const archivos = evidencias.length ? evidencias.map(e => e.ruta_archivo) : (t.archivo ? [t.archivo] : []);
  detail.renderCarousel($("m-evidencia-contenedor"), archivos, "No hay archivos adjuntos.");

  const asignaciones = await fetch(`/api/tickets/${id}/asignaciones`).then(r => r.ok ? r.json() : []).catch(() => []);
  $("m-asignaciones-contenedor").innerHTML = asignaciones.length
    ? `<h4 class="modal-subtitle">Asignaciones</h4>${asignaciones.map(a => `<div class="solution-note"><strong>${escapeHtml(a.tecnico)}</strong><p>${escapeHtml(a.area_asignada || "Sin área")} · ${escapeHtml(a.estado_asignacion)}</p><span>${a.fecha_asignacion ? new Date(a.fecha_asignacion).toLocaleString() : "S/F"}</span></div>`).join("")}`
    : "";

  detail.renderAssignments($("m-asignaciones-contenedor"), asignaciones, "Asignaciones");

  const rechazos = await fetch(`/api/tickets/${id}/rechazos`).then(r => r.ok ? r.json() : []).catch(() => []);
  $("m-rechazos-contenedor").innerHTML = rechazos.length
    ? `<h4 class="modal-subtitle modal-subtitle-warning">Motivo de devolución</h4>${rechazos.map(r => `<div class="solution-note rejection-note"><div class="solution-note-head"><strong>${escapeHtml(r.usuario || "Usuario")}</strong><span>${r.fecha_rechazo ? new Date(r.fecha_rechazo).toLocaleString() : "S/F"}</span></div><p>${escapeHtml(r.comentario || "Sin comentario.")}</p></div>`).join("")}`
    : "";

  const soluciones = await fetch(`/api/tickets/${id}/soluciones`).then(r => r.ok ? r.json() : []).catch(() => []);
  detail.renderSolutions($("m-soluciones-contenedor"), soluciones, "Observaciones del técnico");

  $("modal-ticket-tecnico").classList.add("active");
};

window.procesarAsignacionAdmin = async function (id) {
  const id_tecnicos = [...document.querySelectorAll(`[data-ticket-tecnico="${id}"]:checked`)].map(input => input.value);
  const id_area_admin = $(`area-${id}`)?.value;
  const prioridad = $(`prioridad-${id}`)?.value;
  if (id_tecnicos.length === 0) return toast("warning", "Selecciona al menos un técnico");
  if (!id_area_admin) return toast("warning", "Selecciona el área");

  if (!prioridad) return toast("warning", "Selecciona la prioridad");

  const res = await fetch(`/api/admin/tickets/${id}/asignar-multiple`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_tecnicos, id_area_admin, prioridad })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return toast("error", data.error || "No se pudo asignar el ticket");
  }
  await cargarDatosDesdeServidor();
  toast("success", "Ticket asignado correctamente");
};

async function renderizarTicketsADesignar() {
  const contenedor = $("contenedor-cards-designar");
  if (!contenedor) return;
  const tecnicos = usuariosGlobales.filter(u => (u.role || u.rol || "").toLowerCase() === "tecnico");
  const pFiltro = $("filtro-prioridad-designar")?.value || "todos";
  const asignables = ticketsGlobales.filter(t => {
    const est = estadoClean(t);
    const prio = prioridadKey(t.prioridad);
    return (!t.total_tecnicos || Number(t.total_tecnicos) === 0)
      && (est === "pendiente" || est === "pendiente_asignacion")
      && (pFiltro === "todos" || prio === pFiltro);
  });

  $("badge-contador-designar").innerText = `${asignables.length} tickets sin designar`;
  if (asignables.length === 0) {
    contenedor.innerHTML = `<div class="no-tickets-alert">No hay órdenes de soporte para asignar con estos criterios.</div>`;
    return;
  }

  contenedor.innerHTML = asignables.map(t => {
    const prio = prioridadKey(t.prioridad);
    const selectedIds = String(t.tecnicos_asignados_ids || "").split(",").filter(Boolean);
    const opcionesTecnicos = tecnicos.map(tec => {
      const checked = selectedIds.includes(String(tec.id_usuario)) ? "checked" : "";
      return `<label class="tech-check ${checked ? "selected" : ""}">
        <input type="checkbox" data-ticket-tecnico="${t.id_ticket}" value="${tec.id_usuario}" ${checked}>
        <span><i class="fa-solid fa-user-gear"></i> ${escapeHtml(tec.username)}</span>
      </label>`;
    }).join("");
    const opcionesAreas = areasGlobales.map(area => `<option value="${area.id_area}" ${String(area.id_area) === String(t.id_area_admin || t.id_area || "") ? "selected" : ""}>${escapeHtml(area.nombre_area)}</option>`).join("");
    return `<div class="ticket-card-tecnico ${prio.replace(/\s+/g, "-")}">
      <div class="ticket-card-header"><span class="id-box">#${t.id_ticket}</span><span class="badge ${prio.replace(/\s+/g, "-")}">${escapeHtml(prioridadLabel(t.prioridad))}</span></div>
      <div class="ticket-card-body">
        <h3>${escapeHtml(t.titulo)}</h3>
        <div class="ticket-card-meta">
          <div><i class="fa-solid fa-user"></i> <span><strong>Solicitante:</strong> ${escapeHtml(t.usuario_creador || "N/A")}</span></div>
          <div><i class="fa-solid fa-building"></i> <span><strong>Área admin:</strong> ${escapeHtml(t.nombre_area_admin || t.nombre_area || "Sin definir")}</span></div>
          <div><i class="fa-solid fa-users-gear"></i> <span><strong>Técnicos:</strong> ${escapeHtml(t.tecnicos_asignados || "Sin asignar")}</span></div>
          ${Number(t.total_tecnicos || 0) > 1 ? `<div><i class="fa-solid fa-list-check"></i> <span><strong>Avance:</strong> ${Number(t.tecnicos_resueltos || 0)}/${Number(t.total_tecnicos || 0)} resueltos</span></div>` : ""}
          <div><i class="fa-solid fa-calendar-days"></i> <span><strong>Fecha:</strong> ${t.fecha_creacion ? new Date(t.fecha_creacion).toLocaleString() : "S/F"}</span></div>
        </div>
      </div>
      <div class="footer-asignar">
        <label class="lbl-asignar">Área definida por el administrador:</label>
        <select id="area-${t.id_ticket}" class="select-tech-custom select-designar"><option value="">-- Seleccionar Área --</option>${opcionesAreas}</select>
        <label class="lbl-asignar">Prioridad evaluada por el administrador:</label>
        <select id="prioridad-${t.id_ticket}" class="select-tech-custom select-designar">${prioridadOptions(t.prioridad)}</select>
        <label class="lbl-asignar">Asignar técnico(s):</label>
        <div class="tech-picker">${opcionesTecnicos}</div>
        <div class="flex-gap-8 assign-actions">
          <button class="btn-enviar btn-assign-wide" title="Asignar técnicos" onclick="procesarAsignacionAdmin(${t.id_ticket})"><i class="fa-solid fa-user-check"></i> Asignar</button>
          <button class="btn-ver-ticket" title="Ver detalle" onclick="verDetalleTicketAdmin(${t.id_ticket})"><i class="fa-solid fa-eye"></i></button>
        </div>
      </div>
    </div>`;
  }).join("");
}

window.abrirAsignacionAdmin = async function (id) {
  const ticket = ticketsGlobales.find(t => Number(t.id_ticket) === Number(id));
  if (!ticket) return;

  const tecnicos = usuariosGlobales.filter(u => (u.role || u.rol || "").toLowerCase() === "tecnico");
  const selectedIds = String(ticket.tecnicos_asignados_ids || "").split(",").filter(Boolean);
  const areasHtml = areasGlobales.map(area => `<option value="${area.id_area}" ${String(area.id_area) === String(ticket.id_area_admin || ticket.id_area || "") ? "selected" : ""}>${escapeHtml(area.nombre_area)}</option>`).join("");
  const tecnicosHtml = tecnicos.map(tec => `
    <label class="swal-tech-check">
      <input type="checkbox" value="${tec.id_usuario}" ${selectedIds.includes(String(tec.id_usuario)) ? "checked" : ""}>
      <span>${escapeHtml(tec.username)}</span>
    </label>`).join("");

  const result = await themedSwal({
    title: `Asignar técnicos #${id}`,
    width: 500,
    html: `
      <label class="swal-label">Área definida por el administrador</label>
      <select id="swal-area-admin" class="swal2-select">${areasHtml}</select>
      <label class="swal-label">Prioridad evaluada por el administrador</label>
      <select id="swal-prioridad-admin" class="swal2-select">${prioridadOptions(ticket.prioridad)}</select>
      <label class="swal-label">Técnicos</label>
      <div class="swal-tech-grid">${tecnicosHtml}</div>
    `,
    showCancelButton: true,
    confirmButtonText: "Asignar",
    cancelButtonText: "Cancelar",
    preConfirm: () => {
      const id_area_admin = document.getElementById("swal-area-admin").value;
      const prioridad = document.getElementById("swal-prioridad-admin").value;
      const id_tecnicos = [...document.querySelectorAll(".swal-tech-check input:checked")].map(input => input.value);
      if (!id_area_admin) {
        Swal.showValidationMessage("Selecciona el área");
        return false;
      }
      if (id_tecnicos.length === 0) {
        Swal.showValidationMessage("Selecciona al menos un técnico");
        return false;
      }
      if (!prioridad) {
        Swal.showValidationMessage("Selecciona la prioridad");
        return false;
      }
      return { id_area_admin, id_tecnicos, prioridad };
    }
  });

  if (!result.isConfirmed) return;

  const res = await fetch(`/api/admin/tickets/${id}/asignar-multiple`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result.value)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return toast("error", data.error || "No se pudo asignar el ticket");
  }
  await cargarDatosDesdeServidor();
  toast("success", "Técnicos actualizados");
};

function actualizarVistasGestion() {
  if ($("count-usuarios")) $("count-usuarios").innerText = usuariosGlobales.length;
  renderizarTablaUsuarios(usuariosGlobales);
}

function filtrarUsuarios() {
  const txt = ($("input-buscar")?.value || "").toLowerCase();
  const rol = $("filtro-rol")?.value || "todos";
  renderizarTablaUsuarios(usuariosGlobales.filter(u => (u.username || "").toLowerCase().includes(txt) && (rol === "todos" || (u.role || u.rol || "").toLowerCase() === rol)));
}

function renderizarTablaUsuarios(lista) {
  const tbody = $("tbody-usuarios");
  if (!tbody) return;
  tbody.innerHTML = lista.map(u => {
    const uRol = (u.role || u.rol || "usuario").toLowerCase();
    const badgeClass = uRol === "admin" ? "pend" : (uRol === "tecnico" ? "cerr" : "proc");
    return `<tr>
      <td class="td-usuario-nombre"><h4 style="margin:0">${escapeHtml(u.username)}</h4></td>
      <td class="td-usuario-correo">${escapeHtml(u.correo || "Sin correo")}</td>
      <td class="td-usuario-rol"><span class="badge ${badgeClass}">${uRol.toUpperCase()}</span></td>
      <td class="td-usuario-acciones"><button class="btn-ver btn-rechazar" onclick="eliminarUsuario('${u.id_usuario}')" title="Eliminar"><i class="fa-solid fa-trash"></i></button></td>
    </tr>`;
  }).join("");
}

window.eliminarUsuario = async function (id) {
  const result = await confirmBox("Eliminar usuario", "Esta acción borrará la cuenta seleccionada.");
  if (!result.isConfirmed) return;
  try {
    const res = await fetch(`/api/usuarios/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "No se pudo eliminar el usuario");

    usuariosGlobales = usuariosGlobales.filter(u => String(u.id_usuario) !== String(id));
    actualizarVistasGestion();
    cargarTecnicosEnSelect();
    toast("success", "Usuario eliminado");
  } catch (err) {
    if (window.Swal) themedSwal({ icon: "error", title: "No se pudo eliminar", text: err.message });
    else alert(err.message);
  }
};

function cargarTecnicosEnSelect() {
  const select = $("select-filtro-tecnico");
  if (!select) return;
  select.innerHTML = '<option value="todos">Todos los técnicos</option>'
    + usuariosGlobales.filter(u => (u.role || u.rol || "").toLowerCase() === "tecnico").map(t => `<option value="${t.id_usuario}">${escapeHtml(t.username)}</option>`).join("");
}

function renderizarCentroAnalisis() {
  const selectTecnico = $("select-filtro-tecnico");
  const idTec = selectTecnico?.value || "todos";
  const data = idTec === "todos"
    ? ticketsGlobales
    : ticketsGlobales.filter(t => String(t.id_tecnico_asignado) === String(idTec) || (t.tecnicos_asignados || "").includes(usuariosGlobales.find(u => String(u.id_usuario) === String(idTec))?.username || "\u0000"));
  const stats = {
    pend: data.filter(t => estadoClean(t) === "pendiente").length,
    proc: data.filter(t => estadoClean(t) === "en proceso").length,
    esp: data.filter(t => estadoClean(t) === "en espera").length,
    resu: data.filter(t => estadoClean(t) === "resuelto").length,
    cerr: data.filter(t => estadoClean(t) === "cerrado").length
  };

  [["kpiAsignados-analisis", stats.pend], ["kpiProceso-analisis", stats.proc], ["kpiEspera-analisis", stats.esp], ["kpiResueltos-analisis", stats.resu], ["kpiCerrados-analisis", stats.cerr]]
    .forEach(([id, val]) => { if ($(id)) $(id).innerText = val; });

  if (!$("chartEstados") || !$("chartPrioridades") || !window.Chart) return;
  if (charts.estado) charts.estado.destroy();
  if (charts.prioridad) charts.prioridad.destroy();
  charts.estado = new Chart($("chartEstados").getContext("2d"), {
    type: "pie",
    data: { labels: ["Pendiente", "En Proceso", "Resuelto", "Cerrado"], datasets: [{ data: [stats.pend, stats.proc, stats.resu, stats.cerr], backgroundColor: ["#f39c12", "#3498db", "#2ecc71", "#95a5a6"] }] }
  });
  charts.prioridad = new Chart($("chartPrioridades").getContext("2d"), {
    type: "bar",
    data: { labels: ["Critica", "Alta", "Media", "Baja", "Sin evaluar"], datasets: [{ label: "Prioridad", data: ["critica", "alta", "media", "baja", "sin evaluar"].map(p => data.filter(t => prioridadKey(t.prioridad) === p).length), backgroundColor: ["#ff4d4d", "#e74c3c", "#f1c40f", "#0bdaad", "#8e94a9"] }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}

window.renderizarTablasDashboard = renderizarTablasDashboard;
window.renderizarCentroAnalisis = renderizarCentroAnalisis;
setInterval(cargarDatosDesdeServidor, 30000);
