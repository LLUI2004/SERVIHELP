// =========================================================================
// VARIABLES DE ESTADO GLOBAL
// =========================================================================
let ticketsGlobales = [];
let usuariosGlobales = [];
let charts = { estado: null, prioridad: null };

// =========================================================================
// ORQUESTADOR PRINCIPAL
// =========================================================================
document.addEventListener("DOMContentLoaded", () => {
    cargarDatosDesdeServidor();

    // Eventos Dashboard
    document.getElementById('btnFiltrar')?.addEventListener('click', renderizarTablasDashboard);
    document.getElementById('busqueda')?.addEventListener('input', renderizarTablasDashboard);
    document.getElementById('filtroEstado')?.addEventListener('change', renderizarTablasDashboard);
    document.getElementById('filtroPrioridad')?.addEventListener('change', renderizarTablasDashboard);
    document.getElementById('filtroTipo')?.addEventListener('change', renderizarTablasDashboard);
    
    // Eventos Gestión Usuarios
    document.getElementById('input-buscar')?.addEventListener('input', filtrarUsuarios);
    document.getElementById('filtro-rol')?.addEventListener('change', filtrarUsuarios);
    
    // Evento Selector Dinámico Pestaña Designar
    document.getElementById('filtro-prioridad-designar')?.addEventListener('change', renderizarTicketsADesignar);

    // Modales y Navegación
    const modalTicket = document.getElementById('modal-ticket-tecnico');
    document.getElementById('btn-cerrar-modal-tecnico-footer')?.addEventListener('click', () => { modalTicket?.classList.remove('active'); });
    document.getElementById('close-modal-ticket-x')?.addEventListener('click', () => { modalTicket?.classList.remove('active'); });
    document.getElementById('logout-btn')?.addEventListener('click', async () => { const res = await fetch('/logout', { method: 'POST' }); if(res.ok) window.location.href = '/'; });

    // Navegación Sidebar
    const navs = { dash: document.getElementById('nav-dashboard'), des: document.getElementById('nav-designar'), ges: document.getElementById('nav-gestion'), ana: document.getElementById('nav-analisis') };
    const secs = { dash: document.getElementById('sec-dashboard'), des: document.getElementById('sec-designar'), ges: document.getElementById('sec-gestion'), ana: document.getElementById('sec-analisis') };

    function desactivarTodosLosMenus() {
        Object.values(navs).forEach(m => m?.classList.remove('active'));
        Object.values(secs).forEach(s => s?.classList.add('hidden'));
    }

    if(navs.dash) navs.dash.addEventListener('click', () => { desactivarTodosLosMenus(); navs.dash.classList.add('active'); secs.dash.classList.remove('hidden'); inicializarPanelAdmin(); });
    if(navs.des) navs.des.addEventListener('click', () => { desactivarTodosLosMenus(); navs.des.classList.add('active'); secs.des.classList.remove('hidden'); renderizarTicketsADesignar(); });
    if(navs.ges) navs.ges.addEventListener('click', () => { desactivarTodosLosMenus(); navs.ges.classList.add('active'); secs.ges.classList.remove('hidden'); actualizarVistasGestion(); });
    if(navs.ana) navs.ana.addEventListener('click', () => { desactivarTodosLosMenus(); navs.ana.classList.add('active'); secs.ana.classList.remove('hidden'); renderizarCentroAnalisis(); });

    // Modal Usuario
    const modalUser = document.getElementById('modal-nuevo-usuario');
    document.getElementById('btn-nuevo-usuario')?.addEventListener('click', () => modalUser?.classList.add('active'));
    document.getElementById('close-modal-user')?.addEventListener('click', () => modalUser?.classList.remove('active'));
    document.getElementById('btn-cancelar-user')?.addEventListener('click', () => modalUser?.classList.remove('active'));

    document.getElementById('form-registro-usuario')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const valorRol = document.getElementById('reg-rol').value;
        
        const body = { 
            username: document.getElementById('reg-username').value.trim(), 
            password: document.getElementById('reg-password').value, 
            role: valorRol, 
            rol: valorRol,
            id_rol: valorRol,
            nombre: "Usuario Nuevo", 
            area: "General" 
        };
        
        try {
            const res = await fetch('/register', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(body) 
            });
            if (!res.ok) throw new Error('Error al guardar la cuenta');
            alert('Usuario creado correctamente.');
            document.getElementById('form-registro-usuario').reset();
            modalUser?.classList.remove('active');
            await cargarDatosDesdeServidor();
        } catch (e) { alert(e.message); }
    });
});

// =========================================================================
// LÓGICA DE RENDERIZADO CON DISEÑO UNIFICADO
// =========================================================================

async function cargarDatosDesdeServidor() {
    try {
        const [resT, resU] = await Promise.all([fetch('/api/admin/tickets'), fetch('/api/usuarios')]);
        
        if (resT.ok) {
            ticketsGlobales = await resT.json();
            // Pégalo aquí abajo:
            console.log("Primer ticket recibido:", ticketsGlobales[0]); 
        }
        
        if (resU.ok) usuariosGlobales = await resU.json();
        
        inicializarPanelAdmin();
        actualizarVistasGestion();
        renderizarTicketsADesignar();
        renderizarCentroAnalisis(); 
        cargarTecnicosEnSelect();
        
    } catch (e) { console.error("Error en carga global:", e); }
}

function inicializarPanelAdmin() {
    let p = 0, ep = 0, r = 0, c = 0;
    
    ticketsGlobales.forEach(t => {
        const est = (t.estado || '').toLowerCase().trim();
        if(est === 'pendiente') p++; 
        else if(est === 'en proceso') ep++; 
        else if(est === 'resuelto') r++; 
        else if(est === 'cerrado') c++;
    });
    
    const setKpi = (id, val) => { if(document.getElementById(id)) document.getElementById(id).innerText = val; };
    setKpi('kpiAsignados', p); 
    setKpi('kpiProceso', ep); 
    setKpi('kpiResueltos', r); 
    setKpi('kpiCerrados', c);
    
    renderizarTablasDashboard();
}

function renderizarTablasDashboard() {
    const tbody = document.getElementById('tbody-resumen-mis-tickets');
    if (!tbody) return;

    const busqueda = document.getElementById('busqueda').value.toLowerCase();
    const filtro = { 
        est: document.getElementById('filtroEstado').value.toLowerCase().trim(), 
        tipo: document.getElementById('filtroTipo').value.toLowerCase().trim(), 
        prio: document.getElementById('filtroPrioridad').value.toLowerCase().trim() 
    };

    tbody.innerHTML = ticketsGlobales.filter(t => {
        const tEstado = (t.estado || '').toLowerCase().trim();
        const tPrioridad = (t.prioridad || '').toLowerCase().trim();
        const tTitulo = (t.titulo || '').toLowerCase();
        
        const tFechaTxt = t.fecha_creacion ? new Date(t.fecha_creacion).toLocaleDateString().toLowerCase() : 's/f';

        let creadorNombre = 'n/a';
        if (t.usuario_creador) {
            creadorNombre = t.usuario_creador;
        } else if (t.username_creador) {
            creadorNombre = t.username_creador;
        } else {
            const idBuscar = t.id_usuario_creador || t.id_usuario;
            if (idBuscar) {
                const uEncontrado = usuariosGlobales.find(u => u.id_usuario == idBuscar);
                if (uEncontrado) creadorNombre = uEncontrado.username;
            }
        }
        const tCreador = creadorNombre.toLowerCase();

        const prioTexto = (t.prioridad || '').toLowerCase().trim();
        const tipoCalculado = (prioTexto === 'alta') ? 'inc' : 'req';

        const coincideBusqueda = tTitulo.includes(busqueda) || 
                                 tFechaTxt.includes(busqueda) || 
                                 tCreador.includes(busqueda);

        return coincideBusqueda && 
               (filtro.est === 'todos' || tEstado === filtro.est) &&
               (filtro.tipo === 'todos' || tipoCalculado === filtro.tipo) &&
               (filtro.prio === 'todos' || tPrioridad === filtro.prio);
    }).map(t => {
        const est = (t.estado || '').toLowerCase().trim();
        const badgeClase = est === 'en proceso' ? 'proc' : (est === 'cerrado' ? 'cerr' : (est === 'resuelto' ? 'resuel' : 'pend'));
        const icon = est === 'en proceso' ? 'fa-spinner fa-spin' : 
                     (est === 'resuelto' ? 'fa-circle-check' : 
                     (est === 'cerrado' ? 'fa-lock' : 'fa-circle-dot'));
        
        const prioTexto = (t.prioridad || '').toLowerCase().trim();
        const tipoAutomatico = (prioTexto === 'alta') ? 'INC' : 'REQ';
        const claseTipo = (tipoAutomatico === 'INC') ? 'inc' : 'req';

        const fechaFormateada = t.fecha_creacion ? new Date(t.fecha_creacion).toLocaleDateString() : 'S/F';

        let creadorNombre = 'N/A';
        if (t.usuario_creador) {
            creadorNombre = t.usuario_creador;
        } else if (t.username_creador) {
            creadorNombre = t.username_creador;
        } else {
            const idBuscar = t.id_usuario_creador || t.id_usuario;
            if (idBuscar) {
                const uEncontrado = usuariosGlobales.find(u => u.id_usuario == idBuscar);
                if (uEncontrado) creadorNombre = uEncontrado.username;
            }
        }
        
        const tecnicoAsignado = usuariosGlobales.find(u => u.id_usuario == t.id_tecnico_asignado);
        const nombreTecnicoMostrar = tecnicoAsignado ? tecnicoAsignado.username : 'Sin Asignar';
        
        return `<tr>
            <td><span class="id-text">#${t.id_ticket}</span></td>
            <td><span class="tag-ticket ${claseTipo}">${tipoAutomatico}</span></td>
            <td>
                <div class="ticket-titulo-tabla">${t.titulo}</div>
                <div class="ticket-fecha-tabla">
                    <i class="fa-solid fa-calendar-days"></i> ${fechaFormateada}
                </div>
            </td>
            <td>${creadorNombre}</td>
            <td><span class="badge ${t.prioridad.toLowerCase().trim()}">${t.prioridad.toUpperCase()}</span></td>
            <td><span class="badge ${badgeClase}"><i class="fa-solid ${icon}"></i> ${t.estado}</span></td>
            <td><strong class="tech-assigned-text">${nombreTecnicoMostrar}</strong></td>
            <td><button class="btn-ver" onclick="verDetalleTicketAdmin(${t.id_ticket})"><i class="fa-solid fa-eye"></i></button></td>
        </tr>`;
    }).join('');
}

window.verDetalleTicketAdmin = function(id) {
    const t = ticketsGlobales.find(t => t.id_ticket == id);
    if(t) {
        document.getElementById('m-id-ticket').innerText = `Detalle: #${id}`;
        document.getElementById('m-descripcion-ticket').innerText = t.descripcion || "Sin descripción.";

        const contenedorEvidencia = document.getElementById('m-evidencia-contenedor');
        contenedorEvidencia.innerHTML = ''; 
        contenedorEvidencia.className = "modal-evidencia-box";

        if (t.archivo) {
            const rutaImagen = t.archivo.startsWith('/uploads/') ? t.archivo : `/uploads/${t.archivo}`;
            contenedorEvidencia.innerHTML = `<img src="${rutaImagen}" class="modal-evidencia-img" alt="Evidencia">`;
            contenedorEvidencia.onclick = () => window.open(rutaImagen, '_blank');
        } else {
            contenedorEvidencia.innerHTML = `<p class="modal-evidencia-vacio">No hay archivos adjuntos.</p>`;
            contenedorEvidencia.onclick = null;
        }

        document.getElementById('modal-ticket-tecnico').classList.add('active');
    }
};

window.procesarAsignacionAdmin = async function(id) {
    const id_tecnico = document.getElementById(`sel-${id}`)?.value;
    if(!id_tecnico) return alert("Selecciona un técnico.");

    try {
        const res = await fetch(`/api/admin/tickets/${id}/asignar`, { 
            method: 'PUT', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ id_tecnico })
        });
        
        if(res.ok) { 
            await cargarDatosDesdeServidor(); 
            alert('Ticket asignado correctamente.'); 
        }
    } catch (e) { console.error(e); }
}; 

// =========================================================================
// NUEVA RENDERIZACIÓN REFACTORIZADA TIPO KANBAN (VISTA TÉCNICO COMPATIBLE)
// =========================================================================
async function renderizarTicketsADesignar() {
    const contenedor = document.getElementById('contenedor-cards-designar');
    if (!contenedor) return;
    const tecnicos = usuariosGlobales.filter(u => (u.role || u.rol || '').toLowerCase() === 'tecnico');
    const pFiltro = document.getElementById('filtro-prioridad-designar')?.value || 'todos';
    const sinAsignar = ticketsGlobales.filter(t => {
        const est = (t.estado || '').toLowerCase().trim();
        return (!t.id_tecnico_asignado || t.id_tecnico_asignado === 'SIN_ASIGNAR' || t.id_tecnico_asignado == 0) && (est === 'pendiente' || est === 'pendiente_asignacion') && (pFiltro === 'todos' || t.prioridad.toLowerCase().trim() === pFiltro);
    });
    if (document.getElementById('badge-contador-designar')) document.getElementById('badge-contador-designar').innerText = `${sinAsignar.length} tickets sin designar`;
    if (sinAsignar.length === 0) { contenedor.innerHTML = `<div class="no-tickets-alert">No hay órdenes de soporte por designar con estos criterios.</div>`; return; }

    contenedor.innerHTML = sinAsignar.map(t => {
        const prio = (t.prioridad || '').toLowerCase().trim();
        const fechaFormateada = t.fecha_creacion ? new Date(t.fecha_creacion).toLocaleDateString() : 'S/F';
        
        // Buscamos el objeto completo del usuario en nuestra lista global para saber su área
        const idBuscar = t.id_usuario_creador || t.id_usuario;
        const uEncontrado = usuariosGlobales.find(u => u.id_usuario == idBuscar);
        
        // Si el ticket ya trae el nombre guardado lo usa, si no, lo saca del usuario encontrado
        const creadorNombre = t.usuario_creador || t.username_creador || (uEncontrado ? uEncontrado.username : 'N/A');
       // Ahora, gracias al JOIN en el Repository, el nombre viene directamente en el ticket
       const creadorArea = t.nombre_area || 'General';

        const opcionesTecnicos = tecnicos.map(tec => `<option value="${tec.id_usuario}">${tec.username}</option>`).join('');

        return `<div class="ticket-card-tecnico ${prio}">
            <div class="ticket-card-header">
                <span class="id-box">#${t.id_ticket}</span>
                <span class="badge ${prio}">${prio.toUpperCase()}</span>
            </div>
            <div class="ticket-card-body">
                <h3>${t.titulo}</h3>
                <div class="ticket-card-meta">
                    <div><i class="fa-solid fa-user"></i> <span><strong>Solicitante:</strong> ${creadorNombre}</span></div>
                    <div><i class="fa-solid fa-building"></i> <span><strong>Área:</strong> ${creadorArea}</span></div>
                    <div><i class="fa-solid fa-calendar-days"></i> <span><strong>Fecha:</strong> ${fechaFormateada}</span></div>
                </div>
            </div>
            <div class="footer-asignar">
                <label class="lbl-asignar">Asignar Técnico Responsable:</label>
                <div class="flex-gap-8">
                    <select id="sel-${t.id_ticket}" class="select-tech-custom select-designar">
                        <option value="">-- Seleccionar Técnico --</option>
                        ${opcionesTecnicos}
                    </select>
                    <button class="btn-tomar-ticket btn-confirm-assign" title="Confirmar Asignación" onclick="procesarAsignacionAdmin(${t.id_ticket})"><i class="fa-solid fa-check"></i></button>
                    <button class="btn-ver-ticket" title="Ver Detalles Completo" onclick="verDetalleTicketAdmin(${t.id_ticket})"><i class="fa-solid fa-eye"></i></button>
                </div>
            </div>
        </div>`;
    }).join('');
}

// =========================================================================
// GESTIÓN DE USUARIOS
// =========================================================================
function actualizarVistasGestion() { 
    if(document.getElementById('count-usuarios')) document.getElementById('count-usuarios').innerText = usuariosGlobales.length; 
    renderizarTablaUsuarios(usuariosGlobales); 
}

function filtrarUsuarios() {
    const txt = document.getElementById('input-buscar').value.toLowerCase();
    const rol = document.getElementById('filtro-rol').value;
    renderizarTablaUsuarios(usuariosGlobales.filter(u => u.username.toLowerCase().includes(txt) && (rol === 'todos' || (u.role || u.rol || '').toLowerCase() === rol)));
}

function renderizarTablaUsuarios(lista) {
    const tbody = document.getElementById('tbody-usuarios');
    if(!tbody) return;
    tbody.innerHTML = lista.map(u => {
        const uRol = (u.role || u.rol || 'usuario').toLowerCase();
        const badgeClass = uRol === 'admin' ? 'pend' : (uRol === 'tecnico' ? 'cerr' : 'proc');
        
        return `<tr>
            <td class="td-usuario-nombre">
                <h4 style="margin:0">${u.username}</h4>
            </td>
            <td class="td-usuario-rol">
                <span class="badge ${badgeClass}">${uRol.toUpperCase()}</span>
            </td>
            <td class="td-usuario-acciones">
                <button class="btn-ver btn-rechazar" onclick="eliminarUsuario('${u.id_usuario}')">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

window.eliminarUsuario = async function(id) {
    if(confirm('¿Eliminar usuario?')) { await fetch(`/api/usuarios/${id}`, { method: 'DELETE' }); cargarDatosDesdeServidor(); }
};

function cargarTecnicosEnSelect() {
    const select = document.getElementById('select-filtro-tecnico');
    if (!select) return;
    select.innerHTML = '<option value="todos">Todos los técnicos</option>' + usuariosGlobales.filter(u => (u.role || u.rol || '').toLowerCase() === 'tecnico').map(t => `<option value="${t.id_usuario}">${t.username}</option>`).join('');
}

// =========================================================================
// CENTRO DE ANÁLISIS (DASHBOARD AVANZADO)
// =========================================================================
function renderizarCentroAnalisis() { 
    const idTec = document.getElementById('select-filtro-tecnico').value;
    const data = idTec === 'todos' ? ticketsGlobales : ticketsGlobales.filter(t => t.id_tecnico_asignado == idTec);
    const stats = { 
        pend: data.filter(t => (t.estado || '').toLowerCase().trim() === 'pendiente').length, 
        proc: data.filter(t => (t.estado || '').toLowerCase().trim() === 'en proceso').length, 
        resu: data.filter(t => (t.estado || '').toLowerCase().trim() === 'resuelto').length, 
        cerr: data.filter(t => (t.estado || '').toLowerCase().trim() === 'cerrado').length 
    };
    
    ['kpiAsignados-analisis', 'kpiProceso-analisis', 'kpiResueltos-analisis', 'kpiCerrados-analisis'].forEach((id, i) => { if(document.getElementById(id)) document.getElementById(id).innerText = [stats.pend, stats.proc, stats.resu, stats.cerr][i]; });
    
    if (charts.estado) charts.estado.destroy();
    if (charts.prioridad) charts.prioridad.destroy();

    charts.estado = new Chart(document.getElementById('chartEstados').getContext('2d'), { type: 'pie', data: { labels: ['Pendiente', 'En Proceso', 'Resuelto', 'Cerrado'], datasets: [{ data: [stats.pend, stats.proc, stats.resu, stats.cerr], backgroundColor: ['#f39c12', '#3498db', '#2ecc71', '#95a5a6'] }] } });
charts.prioridad = new Chart(document.getElementById('chartPrioridades').getContext('2d'), { type: 'bar', data: { labels: ['Alta', 'Media', 'Baja'], datasets: [{ label: 'Prioridad', data: ['Alta', 'Media', 'Baja'].map(p => data.filter(t => (t.prioridad || '').toLowerCase().trim() === p.toLowerCase()).length), backgroundColor: ['#e74c3c', '#f1c40f', '#0bdaad'] }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } });
}

setInterval(cargarDatosDesdeServidor, 30000);