// public/tecnico-app.js

let ticketsGlobales = [];

document.addEventListener("DOMContentLoaded", () => {
    // 1. EVENTOS DE NAVEGACIÓN
    document.getElementById('nav-dashboard')?.addEventListener('click', mostrarDashboard);
    document.getElementById('nav-disponibles')?.addEventListener('click', mostrarDisponibles);
    
    // --- CAMBIO AQUÍ: ELIMINAMOS btnFiltrar Y ACTIVAMOS LOS SELECTS ---
    
    // Input de búsqueda: responde al escribir
    document.getElementById('busqueda')?.addEventListener('input', renderizarTablasDashboard);
    
    // Selects: responden al cambiar (change)
    document.getElementById('filtroEstado')?.addEventListener('change', renderizarTablasDashboard);
    document.getElementById('filtroTipo')?.addEventListener('change', renderizarTablasDashboard);
    document.getElementById('filtroPrioridad')?.addEventListener('change', renderizarTablasDashboard);
    
    // Filtro de disponibles: responde al cambiar
    document.getElementById('filtro-prioridad-disponibles')?.addEventListener('change', renderizarCardsDisponibles);
    
    // Otros eventos
    document.getElementById('btn-cerrar-modal-tecnico-footer')?.addEventListener('click', cerrarModalTecnico);
    
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        const res = await fetch('/logout', { method: 'POST' });
        if (res.ok) window.location.href = '/';
    });

    sincronizarConServidor();

    setInterval(() => {
        sincronizarConServidor();
    }, 15000);
});

async function sincronizarConServidor() {
    try {
        const res = await fetch('/api/tickets');
        if (!res.ok) throw new Error('Error al conectar con la base de datos');
        ticketsGlobales = await res.json();
        inicializarPanelTecnico();
    } catch (err) {
        console.error("Error en sincronización:", err);
    }
}

function inicializarPanelTecnico() {
    const miId = String(window.currentUserId || '').trim();
    if (!miId) return;

    let contadores = { asignados: 0, proceso: 0, resueltos: 0, cerrados: 0 };

    ticketsGlobales.forEach(t => {
        const estClean = (t.estado || '').toLowerCase().trim();
        const idTecnico = String(t.id_tecnico_asignado || '').trim();
        
        // --- AQUÍ ESTÁ EL CAMBIO ---
        // Contamos como "Asignado" TODO ticket que tenga TU ID
        // y que aún esté en estado 'pendiente' (que el Admin te mandó pero aún no tocas)
        if (idTecnico === miId && estClean === 'pendiente') {
            contadores.asignados++;
        }

        // Tus tickets que ya estás trabajando
        if (idTecnico === miId) {
            if (estClean === 'en proceso') contadores.proceso++;
            else if (estClean === 'resuelto') contadores.resueltos++;
            else if (estClean === 'cerrado') contadores.cerrados++;
        }
    });

    // Actualizar el DOM
    if (document.getElementById('kpiAsignados')) document.getElementById('kpiAsignados').innerText = contadores.asignados;
    if (document.getElementById('kpiProceso')) document.getElementById('kpiProceso').innerText = contadores.proceso;
    if (document.getElementById('kpiResueltos')) document.getElementById('kpiResueltos').innerText = contadores.resueltos;
    if (document.getElementById('kpiCerrados')) document.getElementById('kpiCerrados').innerText = contadores.cerrados;

    renderizarTablasDashboard();
    renderizarCardsDisponibles();
}

// --- RENDERIZADO ESTILIZADO ---

function renderizarTablasDashboard() {
    const tbody = document.getElementById('tbody-resumen-mis-tickets');
    if (!tbody) return;
    tbody.innerHTML = '';

    // 1. Captura de filtros
    const busqueda = document.getElementById('busqueda')?.value.toLowerCase() || '';
    const filtroEstado = document.getElementById('filtroEstado')?.value || 'Todos';
    const filtroTipo = document.getElementById('filtroTipo')?.value || 'Todos';
    const filtroPrioridad = document.getElementById('filtroPrioridad')?.value || 'Todos';

    // 2. Procesamiento (Filtramos solo lo que te pertenece a ti)
// ... dentro de la función renderizarTablasDashboard ...

// 2. Procesamiento (Filtramos solo lo que te pertenece a ti)
const misTickets = ticketsGlobales.filter(t => {
    // 1. Solo tus tickets
    const esMio = String(t.id_tecnico_asignado) === String(window.currentUserId);
    
    // 2. Calculamos el tipo tal cual lo hacemos al renderizar (INC si es alta, sino REQ)
    const prioTexto = (t.prioridad || '').toLowerCase().trim();
    const tipoAutomatico = (prioTexto === 'alta') ? 'INC' : 'REQ';

    // 3. Filtros
    const busqueda = document.getElementById('busqueda')?.value.toLowerCase() || '';
    const filtroEstado = document.getElementById('filtroEstado')?.value || 'Todos';
    const filtroTipo = document.getElementById('filtroTipo')?.value || 'Todos'; // Este es el que viene de tu select
    const filtroPrioridad = document.getElementById('filtroPrioridad')?.value || 'Todos';

    const coincideBusqueda = (t.titulo || '').toLowerCase().includes(busqueda);
    const coincideEstado = (filtroEstado === 'Todos' || t.estado === filtroEstado);
    const coincidePrioridad = (filtroPrioridad === 'Todos' || t.prioridad === filtroPrioridad);
    
    // --- AQUÍ ESTÁ LA CLAVE: Comparamos el tipo calculado con la selección ---
    const coincideTipo = (filtroTipo === 'Todos' || tipoAutomatico === filtroTipo);

    return esMio && coincideBusqueda && coincideEstado && coincidePrioridad && coincideTipo;
});

    // 3. Renderizado (Usando el diseño que tienes en el Admin)
// ... dentro del map de renderizarTablasDashboard ...
tbody.innerHTML = misTickets.map(t => {
    // --- COPIA ESTO ---
    const prioTexto = (t.prioridad || '').toLowerCase().trim();
    const tipoAutomatico = (prioTexto === 'alta') ? 'INC' : 'REQ';
    const claseTipo = (tipoAutomatico === 'INC') ? 'inc' : 'req';
    // ------------------

    const est = (t.estado || '').toLowerCase().trim();
    const badgeClase = est === 'en proceso' ? 'proc' : 
                       (est === 'cerrado' ? 'cerr' : 
                       (est === 'resuelto' ? 'resuel' : 'pend'));
    
    const icon = est === 'en proceso' ? 'fa-spinner fa-spin' : 
                 (est === 'resuelto' ? 'fa-circle-check' : 
                 (est === 'cerrado' ? 'fa-lock' : 'fa-circle-dot'));

    return `<tr>
        <td><span class="id-text">#${t.id_ticket}</span></td>
        <td><span class="tag-ticket ${claseTipo}">${tipoAutomatico}</span></td>
        <td>
            <div class="ticket-asunto-principal">${t.titulo}</div>
            <div class="ticket-fecha-tabla"><i class="fa-solid fa-calendar-days"></i> ${new Date(t.fecha_creacion).toLocaleDateString()}</div>
        </td>
        <td><strong class="solicitante-text">${t.usuario_creador || 'N/A'}</strong></td>
        <td><span class="badge ${t.prioridad.toLowerCase()}">${t.prioridad.toUpperCase()}</span></td>
        <td>
            <span class="badge ${badgeClase}">
                <i class="fa-solid ${icon}"></i> ${t.estado}
            </span>
        </td>
        <td>
            <div class="flex-gap-8">
                <button class="btn-ver-ticket" onclick="verDetalleTicketTecnico(${t.id_ticket})" title="Ver detalles">
                    <i class="fa-solid fa-eye"></i>
                </button>
                ${est === 'en proceso' ? `
                <button class="btn-aprobar" onclick="marcarComoResuelto(${t.id_ticket})" title="Marcar como Resuelto">
                    <i class="fa-solid fa-check"></i>
                </button>` : ''}
            </div>
        </td>
    </tr>`;
}).join('');

    if (misTickets.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No se encontraron tickets con esos filtros.</td></tr>`;
    }
}

// =========================================================================
// RENDERIZADO DE CARDS DISPONIBLES (DISEÑO IGUAL AL CÓDIGO DE REFERENCIA)
// =========================================================================
function renderizarCardsDisponibles() {
    const contenedorCards = document.getElementById('contenedor-cards-disponibles');
    const badgeContador = document.getElementById('badge-contador-disponibles');
    if (!contenedorCards) return;
    
    contenedorCards.innerHTML = '';

    const filtroPrioridad = document.getElementById('filtro-prioridad-disponibles')?.value || 'todos';
    let contadorVisibles = 0;

    const ticketsParaTi = ticketsGlobales.filter(t => {
        const estClean = (t.estado || '').toLowerCase().trim();
        const idTecnico = String(t.id_tecnico_asignado || '').trim();
        return idTecnico === String(window.currentUserId) && estClean === 'pendiente';
    });

    if (badgeContador) {
        badgeContador.innerText = `${ticketsParaTi.length} tickets en asignación`;
    }

    ticketsParaTi.forEach(t => {
        const prioLower = (t.prioridad || 'baja').toLowerCase().trim();
        if (filtroPrioridad !== 'todos' && prioLower !== filtroPrioridad) return;

        contadorVisibles++;
        
        const fechaFormateada = t.fecha_creacion ? new Date(t.fecha_creacion).toLocaleDateString() : 'N/A';
        const areaMostrada = t.nombre_area || 'General';

        const card = document.createElement('div');
        card.className = `ticket-card-tecnico ${prioLower}`;
        
        // HTML LIMPIO Y SIN COMENTARIOS DENTRO
        card.innerHTML = `
            <div class="ticket-card-header">
                <span class="id-box">#${t.id_ticket}</span>
                <span class="badge ${prioLower}">${t.prioridad.toUpperCase()}</span>
            </div>
            <div class="ticket-card-body">
                <h3>${t.titulo || 'Sin Asunto'}</h3>
                <div class="ticket-card-meta">
                    <div><i class="fa-solid fa-user"></i> <span><strong>Solicitante:</strong> ${t.usuario_creador || 'Cliente General'}</span></div>
                    <div><i class="fa-solid fa-building"></i> <span><strong>Área:</strong> ${areaMostrada}</span></div>
                    <div><i class="fa-solid fa-calendar-days"></i> <span><strong>Fecha:</strong> ${fechaFormateada}</span></div>
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
        `;
        contenedorCards.appendChild(card);
    });

    if (contadorVisibles === 0) {
        contenedorCards.innerHTML = `<div class="no-tickets-alert">🔍 Tu bandeja está limpia. No tienes tickets en asignación.</div>`;
    }
}

async function aceptarTicket(idTicket) {
    try {
        const res = await fetch(`/api/tecnico/tickets/${idTicket}/aceptar-asignacion`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' }
        });

        if (res.ok) {
            // 1. Recargamos los datos desde la BD para que el ticket
            // ya no aparezca como "pendiente" en los disponibles
            await sincronizarConServidor(); 
            
            // 2. Opcional: avisar al usuario
            console.log("Ticket aceptado correctamente");
        } else {
            alert("Error al intentar aceptar el ticket.");
        }
    } catch (error) {
        console.error("Error de conexión:", error);
    }
}

async function marcarComoResuelto(idTicket) {
    try {
        const res = await fetch(`/api/tecnico/tickets/${idTicket}/estado`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nuevoEstado: 'Resuelto' })
        });
        
        if (res.ok) {
            cerrarModalTecnico();
            // Esto fuerza a que se vuelvan a pedir los datos al servidor
            await sincronizarConServidor(); 
            // Opcional: mostrar un mensaje de éxito
            console.log("Ticket actualizado correctamente");
        } else {
            console.error("El servidor no pudo actualizar el estado");
        }
    } catch (error) {
        console.error("Error de conexión:", error);
    }
}

// --- MODAL ESTILIZADO ---

function verDetalleTicketTecnico(idTicket) {
    const ticket = ticketsGlobales.find(t => t.id_ticket === idTicket);
    if (!ticket) return;

    document.getElementById('m-id-ticket').innerText = `Detalle: #${ticket.id_ticket}`;
    document.getElementById('m-descripcion-ticket').innerText = ticket.descripcion;
    
    const contenedorImagen = document.getElementById('m-evidencia-contenedor');
    contenedorImagen.innerHTML = ticket.archivo ? 
        `<img src="${ticket.archivo.startsWith('/uploads/') ? ticket.archivo : '/uploads/'+ticket.archivo}" class="evidence-img-fluid" style="cursor:pointer" onclick="window.open(this.src, '_blank')">` :
        `<p class="evidence-empty">No hay evidencia.</p>`;
    
    const footer = document.getElementById('modal-ticket-tecnico-footer');
    footer.querySelectorAll('.btn-resuelto').forEach(b => b.remove());
    
    if (ticket.estado === 'En Proceso') {
        const btnResuelto = document.createElement('button');
        btnResuelto.innerText = "Marcar como Resuelto";
        btnResuelto.className = "btn-resuelto";
        btnResuelto.onclick = () => marcarComoResuelto(ticket.id_ticket);
        footer.insertBefore(btnResuelto, document.getElementById('btn-cerrar-modal-tecnico-footer'));
    }
    document.getElementById('modal-ticket-tecnico').classList.add('active');
}

function cerrarModalTecnico() { document.getElementById('modal-ticket-tecnico').classList.remove('active'); }

function mostrarDashboard() {
    document.getElementById('sec-dashboard')?.classList.remove('hidden');
    document.getElementById('sec-disponibles')?.classList.add('hidden');
    document.getElementById('nav-dashboard')?.classList.add('active');
    document.getElementById('nav-disponibles')?.classList.remove('active');
}

function mostrarDisponibles() {
    document.getElementById('sec-dashboard')?.classList.add('hidden');
    document.getElementById('sec-disponibles')?.classList.remove('hidden');
    document.getElementById('nav-dashboard')?.classList.remove('active');
    document.getElementById('nav-disponibles')?.classList.add('active');
}
