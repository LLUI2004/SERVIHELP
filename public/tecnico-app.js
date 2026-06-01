let ticketsGlobales = [];

const $ = id => document.getElementById(id);
const detail = window.ServiHelpTicketDetail;
const swalEstilo = {
    buttonsStyling: false, // Desactiva los estilos intrusivos de Swal
    customClass: {
        popup: 'mi-swal-popup',
        confirmButton: 'btn-enviar', // Usa tu clase de CSS
        cancelButton: 'btn-cancelar', // Usa tu clase de CSS
        textarea: 'mi-swal-textarea'
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
  
const askResolution = () => window.Swal
  ? themedSwal({
      ...swalEstilo,
      title: "Registrar solución",
      html: `
        <label class="swal-label">Comentario para el usuario</label>
        <textarea id="swal-solucion-comentario" class="mi-swal-textarea" placeholder="Describe la atención realizada"></textarea>
        
        <label class="swal-label">Evidencia de solución</label>
        <input id="swal-solucion-evidencias" type="file" accept="image/*" multiple style="display: none;">
        <label for="swal-solucion-evidencias" class="btn-subir-archivo">
            <i class="fa-solid fa-cloud-arrow-up"></i> Subir máximo 5 imágenes
        </label>
        
        <div id="preview-solucion"></div>
      `,
      didOpen: () => {
        // Usamos exactamente los mismos nombres y lógica que en Poner en Espera
        const input = document.getElementById("swal-solucion-evidencias");
        const preview = document.getElementById("preview-solucion");

        input.addEventListener("change", () => {
          const archivos = [...input.files].slice(0, 5).map(file => URL.createObjectURL(file));
          // LLAMADA EXACTAMENTE IGUAL A LA QUE YA TE FUNCIONA
          window.ServiHelpTicketDetail.renderCarousel(preview, archivos, "Sin evidencias");
        });
      },
      preConfirm: () => {
        const comentario = document.getElementById("swal-solucion-comentario").value.trim();
        const files = [...document.getElementById("swal-solucion-evidencias").files];
        if (!comentario) {
          Swal.showValidationMessage("Escribe un comentario");
          return false;
        }
        if (files.length > 5) {
          Swal.showValidationMessage("Solo puedes adjuntar máximo 5 imágenes");
          return false;
        }
        return { comentario, files };
      },
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar"
    })
  : Promise.resolve({ isConfirmed: true, value: { comentario: prompt("Describe la atención realizada"), files: [] } });
  
const askHoldReason = () => window.Swal
  ? themedSwal({
      ...swalEstilo,
      title: "Poner atención en espera",
      html: `
        <label class="swal-label">Motivo de espera</label>
        <textarea id="swal-espera-motivo" class="mi-swal-textarea" placeholder="Ej. Falta pieza, falta autorización..."></textarea>
        
        <label class="swal-label">Evidencia de espera</label>
        <input id="swal-espera-evidencias" type="file" accept="image/*" multiple style="display: none;">
        <label for="swal-espera-evidencias" class="btn-subir-archivo">
           <i class="fa-solid fa-cloud-arrow-up"></i> Subir máximo 5 imágenes
        </label>
        <div id="preview-espera"></div>
      `,
      didOpen: () => {
        const input = document.getElementById("swal-espera-evidencias");
        const preview = document.getElementById("preview-espera");

        input.addEventListener("change", () => {
          const archivos = [...input.files].slice(0, 5).map(file => URL.createObjectURL(file));
          window.ServiHelpTicketDetail.renderCarousel(preview, archivos, "Sin evidencias");
        });
      },
      preConfirm: () => {
        const motivo = document.getElementById("swal-espera-motivo").value.trim();
        const files = [...document.getElementById("swal-espera-evidencias").files];
        
        if (!motivo) {
          Swal.showValidationMessage("El motivo es obligatorio");
          return false;
        }
        return { motivo, files };
      },
      showCancelButton: true,
      confirmButtonText: "Guardar espera",
      cancelButtonText: "Cancelar"
    })
  : Promise.resolve({ isConfirmed: true, value: { motivo: prompt("Motivo de espera"), files: [] } });
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));
const urlArchivo = archivo => archivo?.startsWith("/uploads/") ? archivo : `/uploads/${archivo}`;

document.addEventListener("DOMContentLoaded", () => {
  detail?.initNotificationBell?.();
  $("nav-dashboard")?.addEventListener("click", mostrarDashboard);
  $("nav-disponibles")?.addEventListener("click", mostrarDisponibles);
  $("busqueda")?.addEventListener("input", renderizarTablasDashboard);
  $("filtroEstado")?.addEventListener("change", renderizarTablasDashboard);
  $("filtroTipo")?.addEventListener("change", renderizarTablasDashboard);
  $("filtroPrioridad")?.addEventListener("change", renderizarTablasDashboard);
  $("filtro-prioridad-disponibles")?.addEventListener("change", renderizarCardsDisponibles);
  $("btn-cerrar-modal-tecnico-footer")?.addEventListener("click", cerrarModalTecnico);
  $("logout-btn")?.addEventListener("click", async () => {
    const res = await fetch("/logout", { method: "POST" });
    if (res.ok) window.location.href = "/";
  });

  sincronizarConServidor();
  setInterval(sincronizarConServidor, 15000);
});

async function sincronizarConServidor() {
  try {
    const res = await fetch("/api/tickets");
    if (!res.ok) throw new Error("Error al conectar con la base de datos");
    ticketsGlobales = await res.json();
    inicializarPanelTecnico();
  } catch (err) {
    console.error("Error en sincronización:", err);
  }
}

function inicializarPanelTecnico() {
  const contadores = { espera: 0, asignados: 0, proceso: 0, resueltos: 0, cerrados: 0 };
  
  ticketsGlobales.forEach(t => {
    const est = (t.estado || "").toLowerCase().trim();
    const estAsignacion = (t.estado_asignacion || "").toLowerCase().trim();

    if (est === "cerrado") {
      contadores.cerrados++;
    } 
    else if (estAsignacion === "asignado") {
      contadores.asignados++;
    }
    else if (estAsignacion === "en espera") {
      contadores.espera++;
    }
    else if (estAsignacion === "en proceso" || est === "en proceso") {
      contadores.proceso++;
    }
    else if (estAsignacion === "resuelto" || est === "resuelto") {
      contadores.resueltos++;
    }
  });

  $("kpiAsignados").innerText = contadores.asignados;
  $("kpiProceso").innerText = contadores.proceso;
  $("kpiEspera").innerText = contadores.espera;
  $("kpiResueltos").innerText = contadores.resueltos;
  if ($("kpiCerrados")) $("kpiCerrados").innerText = contadores.cerrados;
  
  renderizarTablasDashboard();
  renderizarCardsDisponibles();
}

function renderizarTablasDashboard() {
  const tbody = $("tbody-resumen-mis-tickets");
  if (!tbody) return;

  const busqueda = ($("busqueda")?.value || "").toLowerCase();
  const filtroEstado = $("filtroEstado")?.value || "Todos";
  const filtroTipo = $("filtroTipo")?.value || "Todos";
  const filtroPrioridad = $("filtroPrioridad")?.value || "Todos";

  const misTickets = ticketsGlobales.filter(t => {
    const prioTexto = (t.prioridad || "media").toLowerCase().trim();
    const tipoAutomatico = ["alta", "critica"].includes(prioTexto) ? "INC" : "REQ";
    const est = (t.estado || "").toLowerCase().trim();
    const estAsignacion = (t.estado_asignacion || "").toLowerCase().trim();
    return (t.titulo || "").toLowerCase().includes(busqueda)
      && estAsignacion !== "asignado"
      && (filtroEstado === "Todos" || t.estado === filtroEstado)
      && (filtroPrioridad === "Todos" || t.prioridad === filtroPrioridad)
      && (filtroTipo === "Todos" || tipoAutomatico === filtroTipo);
  });

  tbody.innerHTML = misTickets.map(t => {
    const prioTexto = (t.prioridad || "media").toLowerCase().trim();
    const tipoAutomatico = ["alta", "critica"].includes(prioTexto) ? "INC" : "REQ";
    const claseTipo = tipoAutomatico === "INC" ? "inc" : "req";
  
    const estGlobal = (t.estado || "").toLowerCase().trim();
    const estAsignacion = (t.estado_asignacion || "").toLowerCase().trim();
  
const estadoFinal = estGlobal === "cerrado" ? "cerrado" : estAsignacion;

const badgeClase = estadoFinal === "en proceso" ? "proc" : 
                       (estadoFinal === "cerrado" ? "cerr" : 
                       (estadoFinal === "resuelto" ? "resuel" : 
                       (estadoFinal === "en espera" ? "espera" : "pend")));

const icon = estadoFinal === "en proceso" ? "fa-spinner fa-spin" : 
                 (estadoFinal === "resuelto" ? "fa-circle-check" : 
                 (estadoFinal === "cerrado" ? "fa-lock" : 
                 (estadoFinal === "en espera" ? "fa-clock" : "fa-circle-dot")));

    const totalTecnicos = Number(t.total_tecnicos || 0);
    const resueltosTecnicos = Number(t.tecnicos_resueltos || 0);
    const avanceTecnico = totalTecnicos > 1 ? `<div class="ticket-fecha-tabla">Avance tecnico: ${resueltosTecnicos}/${totalTecnicos}</div>` : "";

   return `<tr>
      <td data-label="ID"><span class="id-text">#${t.id_ticket}</span></td>
      <td data-label="Tipo"><span class="tag-ticket ${claseTipo}">${tipoAutomatico}</span></td>
      <td data-label="Asunto">
        <div class="ticket-asunto-principal">${escapeHtml(t.titulo)}</div>
        <div class="ticket-fecha-tabla"><i class="fa-solid fa-calendar-days"></i> ${t.fecha_creacion ? new Date(t.fecha_creacion).toLocaleString() : "S/F"}</div>
        ${avanceTecnico}
      </td>
      <td data-label="Solicitante"><strong class="solicitante-text">${escapeHtml(t.usuario_creador || "N/A")}</strong></td>
      <td data-label="Prioridad"><span class="badge ${prioTexto}">${escapeHtml(t.prioridad || "Media").toUpperCase()}</span></td>
      
      <td data-label="Estado"><span class="badge ${badgeClase}"><i class="fa-solid ${icon}"></i> ${escapeHtml(estadoFinal.charAt(0).toUpperCase() + estadoFinal.slice(1))}</span></td>
      
      <td data-label="Acciones">
        <button class="btn-ver-ticket" onclick="verDetalleTicketTecnico(${t.id_ticket})" title="Ver detalles">
          <i class="fa-solid fa-eye"></i>
        </button>
      </td>
    </tr>`;
  }).join("");

  if (misTickets.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty-message">No se encontraron tickets con esos filtros.</td></tr>`;
  }
}

function renderizarCardsDisponibles() {
  const contenedorCards = $("contenedor-cards-disponibles");
  const badgeContador = $("badge-contador-disponibles");
  if (!contenedorCards) return;

  const filtroPrioridad = $("filtro-prioridad-disponibles")?.value || "todos";
  const ticketsParaTi = ticketsGlobales.filter(t => (t.estado_asignacion || "").toLowerCase().trim() === "asignado");
  if (badgeContador) badgeContador.innerText = `${ticketsParaTi.length} tickets en asignación`;

  const visibles = ticketsParaTi.filter(t => filtroPrioridad === "todos" || (t.prioridad || "media").toLowerCase().trim() === filtroPrioridad);
  contenedorCards.innerHTML = visibles.map(t => {
    const prioLower = (t.prioridad || "media").toLowerCase().trim();
    return `<div class="ticket-card-tecnico ${prioLower}">
      <div class="ticket-card-header">
        <span class="id-box">#${t.id_ticket}</span>
        <span class="badge ${prioLower}">${escapeHtml(t.prioridad || "Media").toUpperCase()}</span>
      </div>
      <div class="ticket-card-body">
        <h3>${escapeHtml(t.titulo || "Sin Asunto")}</h3>
        <div class="ticket-card-meta">
          <div><i class="fa-solid fa-user"></i> <span><strong>Solicitante:</strong> ${escapeHtml(t.usuario_creador || "Cliente General")}</span></div>
          <div><i class="fa-solid fa-building"></i> <span><strong>Área:</strong> ${escapeHtml(t.nombre_area_admin || t.nombre_area || "General")}</span></div>
          <div><i class="fa-solid fa-calendar-days"></i> <span><strong>Creado: </strong> ${t.fecha_creacion ? new Date(t.fecha_creacion).toLocaleString() : "S/F"}</span></div>
        </div>
      </div>
      <div class="ticket-card-footer footer-asignar">
        <button class="btn-tomar-ticket action-accept-btn" onclick="aceptarTicket(${t.id_ticket})" title="Aceptar Ticket">
          <i class="fa-solid fa-check"></i>
        </button>
        <button class="btn-ver-ticket action-preview-btn" onclick="verDetalleTicketTecnico(${t.id_ticket})" title="Ver detalles">
          <i class="fa-solid fa-eye"></i>
        </button>
      </div>
    </div>`;
  }).join("");

  if (visibles.length === 0) {
    contenedorCards.innerHTML = `<div class="no-tickets-alert">Tu bandeja está limpia. No tienes tickets en asignación.</div>`;
  }
}

async function aceptarTicket(idTicket) {
  const res = await fetch(`/api/tecnico/tickets/${idTicket}/aceptar-asignacion`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" }
  });
  if (!res.ok) return toast("error", "Error al intentar aceptar el ticket");
  await sincronizarConServidor();
  toast("success", "Ticket aceptado");
}

async function marcarComoResuelto(idTicket) {
  const result = await askResolution();
  if (!result.isConfirmed) return;

  const body = new FormData();
  body.append("nuevoEstado", "Resuelto");
  body.append("comentario", result.value.comentario);
  result.value.files.forEach(file => body.append("evidencias", file));

  const res = await fetch(`/api/tecnico/tickets/${idTicket}/estado`, {
    method: "PUT",
    body
  });

  if (!res.ok) return toast("error", "El servidor no pudo actualizar el estado");
  cerrarModalTecnico();
  await sincronizarConServidor();
  toast("success", "Solución registrada");
}

async function ponerEnEspera(idTicket) {
  const result = await askHoldReason();
  if (!result.isConfirmed) return;

  const body = new FormData();
  body.append("nuevoEstado", "En Espera");
  body.append("motivo", result.value.motivo); // Usamos el motivo del objeto
  result.value.files.forEach(file => body.append("evidencias", file)); // Adjuntamos archivos

  const res = await fetch(`/api/tecnico/tickets/${idTicket}/estado`, {
    method: "PUT",
    body // Ahora enviamos FormData
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return toast("error", data.error || "No se pudo poner en espera");
  }
  cerrarModalTecnico();
  await sincronizarConServidor();
  toast("success", "Atencion puesta en espera");
}

async function cargarEvidencias(ticket, contenedor) {
  const evidencias = await fetch(`/api/tickets/${ticket.id_ticket}/evidencias`).then(r => r.ok ? r.json() : []).catch(() => []);
  const archivos = evidencias.length ? evidencias.map(e => e.ruta_archivo) : (ticket.archivo ? [ticket.archivo] : []);
  detail.renderCarousel(contenedor, archivos, "No hay evidencia.");
}

async function cargarSoluciones(ticketId, contenedor) {
  const soluciones = await fetch(`/api/tickets/${ticketId}/soluciones`).then(r => r.ok ? r.json() : []).catch(() => []);
  detail.renderSolutions(contenedor, soluciones, "Observaciones registradas");
}

async function cargarAsignaciones(ticketId, contenedor) {
  const asignaciones = await fetch(`/api/tickets/${ticketId}/asignaciones`).then(r => r.ok ? r.json() : []).catch(() => []);
  detail.renderAssignments(contenedor, asignaciones, "Estado de asignaciones");
}

window.verDetalleTicketTecnico = async function (idTicket) {
  const ticket = ticketsGlobales.find(t => t.id_ticket === idTicket);
  if (!ticket) return;

  $("m-id-ticket").innerText = `Detalle: #${ticket.id_ticket}`;
  $("m-descripcion-ticket").innerText = ticket.descripcion || "Sin descripción";
  await cargarEvidencias(ticket, $("m-evidencia-contenedor"));
  await cargarAsignaciones(ticket.id_ticket, $("m-asignaciones-contenedor"));
  await cargarSoluciones(ticket.id_ticket, $("m-soluciones-contenedor"));
  const footer = $("modal-ticket-tecnico-footer");
  footer.querySelectorAll(".btn-resuelto, .btn-espera").forEach(b => b.remove());
  const estadoAsignacion = (ticket.estado_asignacion || "").toLowerCase().trim();
  if (["en proceso", "en espera"].includes(estadoAsignacion)) {
    const btnEspera = document.createElement("button");
    btnEspera.innerText = "Poner en espera";
    btnEspera.className = "btn-espera btn-cancelar";
    btnEspera.onclick = () => ponerEnEspera(ticket.id_ticket);
    if (estadoAsignacion !== "en espera") footer.insertBefore(btnEspera, $("btn-cerrar-modal-tecnico-footer"));

    const btnResuelto = document.createElement("button");
    btnResuelto.innerText = "Registrar solución";
    btnResuelto.className = "btn-resuelto btn-enviar";
    btnResuelto.onclick = () => marcarComoResuelto(ticket.id_ticket);
    footer.insertBefore(btnResuelto, $("btn-cerrar-modal-tecnico-footer"));
  }
  $("modal-ticket-tecnico").classList.add("active");
};

function cerrarModalTecnico() {
  $("modal-ticket-tecnico")?.classList.remove("active");
}

function mostrarDashboard() {
  $("sec-dashboard")?.classList.remove("hidden");
  $("sec-disponibles")?.classList.add("hidden");
  $("nav-dashboard")?.classList.add("active");
  $("nav-disponibles")?.classList.remove("active");
}

function mostrarDisponibles() {
  $("sec-dashboard")?.classList.add("hidden");
  $("sec-disponibles")?.classList.remove("hidden");
  $("nav-dashboard")?.classList.remove("active");
  $("nav-disponibles")?.classList.add("active");
}

window.aceptarTicket = aceptarTicket;
window.renderizarTablasDashboard = renderizarTablasDashboard;
