document.addEventListener("DOMContentLoaded", () => {
    let ticketsData = []; 
    let avatarSeleccionadoTemporal = "fa-user"; 

    // =========================================================================
    // 0. FUNCIÓN MAESTRA DE SINCRONIZACIÓN
    // =========================================================================
    // Actualiza tu función refrescarDatos en usuario-app.js
async function refrescarDatos() {
    try {
        const res = await fetch('/api/tickets');
        if (!res.ok) throw new Error('Error al conectar');
        ticketsData = await res.json();
        
        // En lugar de renderizar todo, llamamos a la función que ya gestiona filtros
        aplicarFiltros(); 
        
        console.log("Datos sincronizados y filtrados:");
    } catch (err) { console.error(err); }
}

    // =========================================================================
    // 1. VINCULACIÓN SEMÁNTICA DE EVENTOS
    // =========================================================================
    document.getElementById('nav-inicio').addEventListener('click', mostrarInicio);
    document.getElementById('nav-formulario').addEventListener('click', mostrarFormulario);
    document.getElementById('nav-perfil').addEventListener('click', mostrarPerfil);
    document.getElementById('nav-ayuda').addEventListener('click', mostrarAyuda);
    
    document.getElementById('formPerfil').addEventListener('submit', guardarPerfil);
    document.getElementById('btn-cancelar-ticket').addEventListener('click', mostrarInicio);
    document.getElementById('btn-cancelar-perfil').addEventListener('click', mostrarInicio);
    
    document.getElementById('logout-btn').addEventListener('click', async () => {
        const res = await fetch('/logout', { method: 'POST' });
        if (res.ok) window.location.href = '/';
    });

    // =========================================================================
    // 2. CREAR TICKET (Lógica Completa)
    // =========================================================================
    document.getElementById('formTicket').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        try {
            const response = await fetch('/api/tickets', { method: 'POST', body: formData });
            if (response.ok) {
                alert('Ticket creado exitosamente');
                document.getElementById('formTicket').reset();
                document.getElementById('nArchivo').innerText = 'Haz clic para subir archivo';
                document.getElementById('iconoNube').className = "fa-solid fa-cloud-arrow-up fa-2xl cloud-icon-purple";
                await refrescarDatos();
                mostrarInicio();
            } else {
                const errorData = await response.json();
                alert('Error al crear el ticket: ' + (errorData.error || ''));
            }
        } catch (error) { console.error('Error:', error); }
    });

    // =========================================================================
    // 3. RENDERIZADO Y LÓGICA DE TABLA
    // =========================================================================
    async function mostrarInicio() {
        ocultarTodasLasSecciones();
        document.getElementById('inicio').classList.remove('hidden');
        document.getElementById('nav-inicio').classList.add('active');
        await refrescarDatos();
    }

function renderizarTabla(data) {
    const tbody = document.getElementById('listaTickets');
    if (!tbody) return;
    tbody.innerHTML = '';

   let contadores = { pendientes: 0, proceso: 0, resueltos: 0, cerrados: 0 };

    data.forEach((t) => {
        // Normalización
        const est = (t.estado || '').toLowerCase().trim();
        const prio = (t.prioridad || '').toLowerCase().trim();
        
        const badgeClase = est === 'en proceso' ? 'proc' : (est === 'cerrado' ? 'cerr' : (est === 'resuelto' ? 'resuel' : 'pend'));
        const icon = est === 'en proceso' ? 'fa-spinner fa-spin' : (est === 'resuelto' ? 'fa-circle-check' : (est === 'cerrado' ? 'fa-lock' : 'fa-circle-dot'));
        
        const tipoAutomatico = (prio === 'alta') ? 'INC' : 'REQ';
        const claseTipo = (tipoAutomatico === 'INC') ? 'inc' : 'req';

        // Lógica de contadores
       // Lógica de contadores
if (est === 'pendiente' || est === 'pendiente_asignacion') {
    contadores.pendientes++;
} else if (est === 'en proceso') {
    contadores.proceso++;
} else if (est === 'resuelto') {
    contadores.resueltos++; // Ahora suma a resueltos específicamente
} else if (est === 'cerrado') {
    contadores.cerrados++; // Ahora solo suma si es realmente 'cerrado'
}

        const esResuelto = est === 'resuelto' || est === 'Resuelto';

        const tr = document.createElement('tr');
        // NOTA: Quité el onclick de aquí
        tr.innerHTML = `
            <td>#${t.id_ticket}</td>
            <td>${new Date(t.fecha_creacion).toLocaleDateString()}</td>
            <td><span class="tag-ticket ${claseTipo}">${tipoAutomatico}</span></td>
            <td>${t.titulo}</td>
            <td><span class="badge ${prio}">${t.prioridad.toUpperCase()}</span></td>
            <td><span class="badge ${badgeClase}"><i class="fa-solid ${icon}"></i> ${t.estado}</span></td>
            <td class="acciones-cell">
                <div style="display: flex; gap: 5px; justify-content: flex-end;">
                    <button class="btn-ver" data-id="${t.id_ticket}"><i class="fa-solid fa-eye"></i></button>
                </div>
            </td>
        `;

        // Lógica de botones de Aprobar/Rechazar (asignados mediante addEventListener)
        if (esResuelto) {
            const contenedorAcciones = tr.querySelector('.acciones-cell div');
            
            const btnAprobar = document.createElement('button');
            btnAprobar.className = 'btn-aprobar';
            btnAprobar.innerHTML = '<i class="fa-solid fa-check"></i>';
            btnAprobar.title = 'Aprobar Solución';
            btnAprobar.addEventListener('click', () => cambiarEstadoTicket(t.id_ticket, 'aprobar'));
            
            const btnRechazar = document.createElement('button');
            btnRechazar.className = 'btn-rechazar';
            btnRechazar.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            btnRechazar.title = 'Rechazar Solución';
            btnRechazar.addEventListener('click', () => cambiarEstadoTicket(t.id_ticket, 'rechazar'));

            contenedorAcciones.appendChild(btnAprobar);
            contenedorAcciones.appendChild(btnRechazar);
        }

        // Evento para el botón de ver
        tr.querySelector('.btn-ver').addEventListener('click', () => verDetalle(t.id_ticket));
        tbody.appendChild(tr);
    });

    // Actualizar contadores
    if (document.getElementById('cPend')) document.getElementById('cPend').innerText = contadores.pendientes;
    if (document.getElementById('cProc')) document.getElementById('cProc').innerText = contadores.proceso;
    if (document.getElementById('cRes')) document.getElementById('cRes').innerText = contadores.resueltos; // ¡AQUÍ ESTÁ LA CLAVE!
    if (document.getElementById('cCer')) document.getElementById('cCer').innerText = contadores.cerrados;
}
    // =========================================================================
    // 4. FUNCIONES DE PERFIL, DETALLE Y LÓGICA DE ESTADOS
    // =========================================================================
async function verDetalle(ticketId) {
    try {
        const res = await fetch(`/api/tickets/${ticketId}`);
        const t = await res.json();
        
        // 1. Rellenar textos
        document.getElementById('mTitulo').innerText = `Detalle del Ticket: #${t.id_ticket}`;
        document.getElementById('mDescripcion').innerText = t.descripcion || "Sin descripción.";
        
        // 2. Lógica de Imagen con estilo uniforme
        const contenedorImagen = document.getElementById('mImagen');
        // Limpiamos contenido previo
        contenedorImagen.innerHTML = ''; 
        contenedorImagen.style.marginTop = "10px";
        
        if (t.archivo) {
            const rutaImagen = t.archivo.startsWith('/uploads/') ? t.archivo : `/uploads/${t.archivo}`;
            contenedorImagen.innerHTML = `<img src="${rutaImagen}" style="max-width: 100%; border-radius: 8px; cursor: pointer; display: block;" alt="Evidencia">`;
            contenedorImagen.onclick = () => window.open(rutaImagen, '_blank');
        } else {
            contenedorImagen.innerHTML = `<p style="color: #6c757d; font-style: italic; background: #25263a; padding: 10px; border-radius: 5px;">No se subió evidencia para este reporte.</p>`;
            contenedorImagen.onclick = null;
        }
        
    // 3. Lógica de botones
        const btnAprobar = document.getElementById('btn-aprobar');
        const btnRechazar = document.getElementById('btn-rechazar');
        const btnCerrar = document.getElementById('btn-cerrar-modal');

        const esResuelto = t.estado.toLowerCase().trim() === 'resuelto';
        
        // Controlamos visibilidad de botones
        // Se muestran juntos en el mismo footer
        btnAprobar.style.display = esResuelto ? 'inline-block' : 'none';
        btnRechazar.style.display = esResuelto ? 'inline-block' : 'none';
        
        // Asignar eventos
        btnAprobar.onclick = () => cambiarEstadoTicket(t.id_ticket, 'aprobar');
        btnRechazar.onclick = () => cambiarEstadoTicket(t.id_ticket, 'rechazar');
        btnCerrar.onclick = () => {
            document.getElementById('modalTicket').classList.remove('active');
        };

        document.getElementById('modalTicket').classList.add('active');
    } catch (err) { 
        console.error("Error al cargar detalle:", err); 
    }
}

    async function guardarPerfil(e) {
        e.preventDefault();
        try {
            const response = await fetch('/api/perfil', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ avatar: avatarSeleccionadoTemporal })
            });
            if (response.ok) {
                alert('Perfil actualizado');
                document.getElementById('sidebarAvatar').innerHTML = `<i class="fa-solid ${avatarSeleccionadoTemporal}"></i>`;
                mostrarInicio();
            }
        } catch (error) { console.error('Error:', error); }
    }


    function ocultarTodasLasSecciones() {
        ['inicio', 'formulario', 'perfil', 'ayuda'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
        ['nav-inicio', 'nav-formulario', 'nav-perfil', 'nav-ayuda'].forEach(id => document.getElementById(id)?.classList.remove('active'));
    }

    function mostrarFormulario() { ocultarTodasLasSecciones(); document.getElementById('formulario').classList.remove('hidden'); document.getElementById('nav-formulario').classList.add('active'); }
    function mostrarPerfil() { ocultarTodasLasSecciones(); document.getElementById('perfil').classList.remove('hidden'); document.getElementById('nav-perfil').classList.add('active'); }
    function mostrarAyuda() { ocultarTodasLasSecciones(); document.getElementById('ayuda').classList.remove('hidden'); document.getElementById('nav-ayuda').classList.add('active'); }

    document.querySelectorAll('.avatar-option').forEach(opcion => {
        opcion.addEventListener('click', function() {
            document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
            this.classList.add('selected');
            avatarSeleccionadoTemporal = this.getAttribute('data-avatar');
        });
    });

    // =========================================================================
    // 5. FILTROS AUTOMÁTICOS (Sustituye al botón)
    // =========================================================================
    document.getElementById('busqueda').addEventListener('input', aplicarFiltros);
    document.getElementById('filtroEstado').addEventListener('change', aplicarFiltros);
    document.getElementById('filtroTipo').addEventListener('change', aplicarFiltros);
    document.getElementById('filtroPrioridad').addEventListener('change', aplicarFiltros);

function aplicarFiltros() {
        const estado = document.getElementById('filtroEstado').value;
        const tipo = document.getElementById('filtroTipo').value;
        const prioridad = document.getElementById('filtroPrioridad').value;
        const busqueda = document.getElementById('busqueda').value.toLowerCase();

        const filtrados = ticketsData.filter(t => {
            const tEst = (t.estado || '').toLowerCase().trim();
            const tPrio = (t.prioridad || '').toLowerCase().trim();
            const tipoTicket = (tPrio === 'alta') ? 'INC' : 'REQ';

            // --- AQUÍ ESTÁ EL CAMBIO ---
            // 1. Convertimos la fecha a texto legible igual que en el admin
            const tFechaTxt = t.fecha_creacion ? new Date(t.fecha_creacion).toLocaleDateString().toLowerCase() : 's/f';
            
            // 2. Ahora la coincidencia de búsqueda (mB) verifica el título O la fecha
            const mB = t.titulo.toLowerCase().includes(busqueda) || tFechaTxt.includes(busqueda);
            // ---------------------------

            const mE = (estado === 'Todos' || (estado === 'Pendiente' ? (tEst === 'pendiente' || tEst === 'pendiente_asignacion') : tEst === estado.toLowerCase()));
            const mT = (tipo === 'Todos' || tipo === tipoTicket);
            const mP = (prioridad === 'Todos' || tPrio === prioridad.toLowerCase());
            
            return mE && mT && mP && mB;
        });
        
        renderizarTabla(filtrados);
    }
    
// Lógica FAQ Acordeón
    document.querySelectorAll('.faq-pregunta').forEach(boton => {
        boton.addEventListener('click', () => {
            const itemActual = boton.parentElement;
            document.querySelectorAll('.faq-item.abierto').forEach(itemAbierto => {
                if (itemAbierto !== itemActual) {
                    itemAbierto.classList.remove('abierto');
                }
            });
            itemActual.classList.toggle('abierto');
        });
    });

    // Sincronización en tiempo real
    setInterval(async () => {
    if (!document.hidden) {
        await refrescarDatos(); // Asegúrate de que espere a que termine
    }
}, 30000);

    // Carga inicial
    mostrarInicio();
});


async function cambiarEstadoTicket(ticketId, accion) {
    // 1. Cerramos el modal inmediatamente para que la interfaz se libere
    const modal = document.getElementById('modalTicket');
    if (modal) modal.classList.remove('active');

    try {
        const response = await fetch(`/api/tickets/${ticketId}/${accion}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
            // 2. Refrescamos ANTES de cualquier aviso, para que los contadores cambien YA
            await refrescarDatos(); 
            
            // 3. Opcional: Feedback no bloqueante (puedes usar un toast o un simple log)
            console.log(`Ticket ${accion} ejecutada correctamente.`);
        } else {
            alert('Error al cambiar el estado del ticket.');
        }
    } catch (error) {
        console.error('Error al cambiar estado:', error);
    }
}