import express from 'express'
import cookieParser from 'cookie-parser'
import jwt from 'jsonwebtoken'
import multer from 'multer' 
import path from 'path'
import sql from 'mssql' 
import { PORT, SECRET_JWT_KEY } from './config.js'
import { poolPromise } from './db.js' 
import { UserRepository } from './user-repository.js'
import { TicketRepository } from './ticket-repository.js'
import fs from 'fs';
import cors from 'cors';

if (!fs.existsSync('./uploads')){
    fs.mkdirSync('./uploads');
}

const app = express()
app.use(cors({
    origin: '*', // Esto permite que cualquier origen te consulte (CUIDADO: cámbialo a tu dominio real en producción)
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname))
  }
})
const upload = multer({ storage: storage })

app.set('view engine', 'ejs')
app.use(express.static('public'))
app.use('/uploads', express.static('uploads')) 
app.use(express.json())
app.use(cookieParser())

// MIDDLEWARE JWT
app.use((req, res, next) => {
  const token = req.cookies.access_token
  req.session = { user: null }
  if (token) {
    try {
      const data = jwt.verify(token, SECRET_JWT_KEY)
      req.session.user = data
    } catch (e) {
      res.clearCookie('access_token')
    }
  }
  next()
})

async function canAccessTicket(req, res, next) {
    try {
        if (!req.session.user) return res.status(401).json({ error: 'No autorizado' });
        const allowed = await TicketRepository.canAccessTicket({
            id_ticket: req.params.id,
            user: req.session.user
        });
        if (!allowed) return res.status(403).json({ error: 'No tienes permiso para ver este ticket' });
        next();
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

// --- VISTAS ---
app.get('/', (req, res) => {
  if (req.session.user) {
    if (req.session.user.role === 'tecnico') return res.redirect('/panel-tecnico')
    if (req.session.user.role === 'admin') return res.redirect('/panel-admin')
    return res.redirect('/panel-usuario')
  }
  res.render('index', { user: req.session.user })
})

app.get('/panel-usuario', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'usuario') return res.redirect('/')
  res.render('usuario', { user: req.session.user })
})

app.get('/panel-tecnico', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'tecnico') return res.redirect('/')
  res.render('tecnico', { user: req.session.user })
})

app.get('/panel-admin', (req, res) => {
  if (!req.session.user || req.session.user.role !== 'admin') return res.redirect('/')
  res.render('admin', { user: req.session.user })
})

// --- AUTENTICACION ---
app.post('/register', async (req, res) => {
    const { username, password, nombre, area, correo } = req.body;
    
    // 1. Definimos el rol por defecto
    let rol = 'usuario';

    // 2. Si se intenta asignar un rol superior, verificamos quién lo pide
    if (req.body.role && req.body.role !== 'usuario') {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.status(403).json({ error: 'No tienes permiso para crear usuarios con ese rol' });
        }
        rol = req.body.role; // Solo el admin puede cambiar esto
    }

    try {
        const id = await UserRepository.create({ username, password, nombre, rol, area, correo });
        res.json({ id });
    } catch (e) { 
        res.status(400).json({ error: e.message }); 
    }
});

app.post('/login', async (req, res) => {
  try {
    const user = await UserRepository.login(req.body)
    const token = jwt.sign({ id: user.id_usuario, username: user.username, role: user.role, avatar: user.avatar }, SECRET_JWT_KEY, { expiresIn: '1h' });
    res.cookie('access_token', token, { httpOnly: true, secure: false, sameSite: 'lax', path: '/', maxAge: 1000 * 60 * 60 }).json({ user }) 
  } catch (e) { 
    // AGREGA ESTA LÍNEA PARA VER EL ERROR EN TU TERMINAL
    console.error("ERROR EN LOGIN:", e.message); 
    res.status(401).json({ error: e.message }); 
  }
})

app.post('/logout', (req, res) => { res.clearCookie('access_token').redirect('/') })

app.post('/api/auth/password-reset/request', async (req, res) => {
    try {
        const { identifier, username, correo } = req.body;
        const userIdentifier = identifier || username || correo;

        const result = await UserRepository.createPasswordResetToken({
            identifier: userIdentifier,
            ip: req.ip,
            userAgent: req.get('user-agent')
        });

        const response = {
            message: 'Si el usuario existe, se generó una solicitud de recuperación.'
        };

        if (process.env.NODE_ENV !== 'production' && result.resetToken) {
            response.resetToken = result.resetToken;
            response.expiresInMinutes = 30;
        }

        res.json(response);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/auth/password-reset/confirm', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        await UserRepository.resetPasswordWithToken({ token, newPassword });
        res.json({ success: true, message: 'Contraseña actualizada correctamente.' });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// --- API TICKETS ---
app.get('/api/areas', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'No autorizado' });
    try {
        res.json(await TicketRepository.getAreas());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/notificaciones', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'No autorizado' });
    try {
        res.json(await TicketRepository.getNotificationsByUserId(req.session.user.id));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/notificaciones/leer', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'No autorizado' });
    try {
        await TicketRepository.markNotificationsRead(req.session.user.id);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tickets', upload.fields([
    { name: 'archivo', maxCount: 1 },
    { name: 'evidencias', maxCount: 5 },
    { name: 'archivos', maxCount: 5 }
]), async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'No autorizado' });
    
    // Cambiamos 'area' por 'id_area' para que coincida con lo que envías en el select
    const { titulo, descripcion, id_area } = req.body;
    const archivoPrincipal = req.files?.archivo?.[0]?.filename || null;
    const evidencias = [
        ...(req.files?.evidencias || []),
        ...(req.files?.archivos || [])
    ].map(file => file.filename);
    const archivo = archivoPrincipal || evidencias[0] || null;
    
    try {
        // Pasamos id_area al repositorio
        const idTicket = await TicketRepository.createTicket({ 
            titulo, 
            descripcion, 
            prioridad: 'Sin evaluar',
            id_area, // Esto enviará el número (1, 2, 4...)
            id_usuario_creador: req.session.user.id, 
            archivo,
            evidencias
        });
        res.json({ id: idTicket, message: 'Ticket creado exitosamente' });
    } catch (e) { 
        console.error("Error al crear ticket:", e); // Muy útil para depurar
        res.status(500).json({ error: e.message }); 
    }
});

app.get('/api/tickets', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'No autorizado' });
    
    try {
        if (req.session.user.role === 'tecnico') {
            return res.json(await TicketRepository.getTicketsByTechnicianId(req.session.user.id));
        }

        const all = await TicketRepository.getAllTickets();
        
        if (req.session.user.role === 'admin') {
            res.json(all);
        } 
        else if (req.session.user.role === 'tecnico') {
    const filtrados = all.filter(t => {
        // 1. CONDICION DE ASIGNACION: 
        // Si el ticket tiene MI ID y está 'Pendiente', el Admin me lo acaba de asignar.
        const esNuevoParaMi = (t.id_tecnico_asignado === req.session.user.id && t.estado === 'Pendiente');

        // 2. CONDICION DE GESTION:
        // Si tiene MI ID y está en proceso o resuelto, es lo que estoy trabajando.
        const estoyTrabajando = (t.id_tecnico_asignado === req.session.user.id && 
                                (t.estado === 'En Proceso' || t.estado === 'Resuelto'));

        return esNuevoParaMi || estoyTrabajando;
    });
    res.json(filtrados);
}else {
            res.json(await TicketRepository.getTicketsByUserId(req.session.user.id));
        }
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

app.get('/api/tickets/:id', canAccessTicket, async (req, res) => {
    try {
        const ticket = await TicketRepository.getTicketById(req.params.id);
        res.json(ticket);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tickets/:id/evidencias', canAccessTicket, async (req, res) => {
    try {
        res.json(await TicketRepository.getEvidenciasByTicketId(req.params.id));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tickets/:id/asignaciones', canAccessTicket, async (req, res) => {
    try {
        res.json(await TicketRepository.getAssignmentsByTicketId(req.params.id));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tickets/:id/soluciones', canAccessTicket, async (req, res) => {
    try {
        const onlyVisible = req.session.user.role === 'usuario';
        res.json(await TicketRepository.getSolutionsByTicketId(req.params.id, { onlyVisible }));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tickets/:id/rechazos', canAccessTicket, async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'No autorizado' });
    if (req.session.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });
    try {
        res.json(await TicketRepository.getRejectionsByTicketId(req.params.id));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tickets/:id/historial', canAccessTicket, async (req, res) => {
    try {
        res.json(await TicketRepository.getHistoryByTicketId(req.params.id));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/tickets/:id', upload.fields([
    { name: 'evidencias', maxCount: 5 },
    { name: 'archivos', maxCount: 5 }
]), async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'No autorizado' });
    try {
        const allowed = await TicketRepository.canAccessTicket({ id_ticket: req.params.id, user: req.session.user });
        if (!allowed) return res.status(403).json({ error: 'No tienes permiso para editar este ticket' });
        const evidencias = [
            ...(req.files?.evidencias || []),
            ...(req.files?.archivos || [])
        ].map(file => file.filename);

        await TicketRepository.updateTicket({
            id_ticket: req.params.id,
            id_usuario: req.session.user.id,
            role: req.session.user.role,
            titulo: req.body.titulo,
            descripcion: req.body.descripcion,
            id_area: req.body.id_area,
            evidencias,
            replaceEvidencias: req.body.replaceEvidencias === '1' || req.body.replaceEvidencias === 'true' || evidencias.length > 0
        });
        res.json({ success: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/tickets/:id', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'No autorizado' });
    try {
        const allowed = await TicketRepository.canAccessTicket({ id_ticket: req.params.id, user: req.session.user });
        if (!allowed) return res.status(403).json({ error: 'No tienes permiso para eliminar este ticket' });
        await TicketRepository.deleteTicket({
            id_ticket: req.params.id,
            id_usuario: req.session.user.id,
            role: req.session.user.role,
            motivo: req.body?.motivo
        });
        res.json({ success: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
});

// --- API ADMIN ---
app.get('/api/admin/tickets', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json([]);
    try {
        // CAMBIA LA LOGICA POR ESTO:
        const tickets = await TicketRepository.getAllTickets();
        res.json(tickets);
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

app.put('/api/admin/tickets/:id/asignar', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });
    try {
        if (!req.body.prioridad) return res.status(400).json({ error: 'Selecciona la prioridad evaluada por el administrador' });
        await TicketRepository.assignTechnicians({
            id_ticket: req.params.id,
            tecnicoIds: req.body.id_tecnico,
            id_area_admin: req.body.id_area_admin || req.body.id_area,
            prioridad: req.body.prioridad,
            asignado_por: req.session.user.id,
            comentario: req.body.comentario
        });
        return res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/tickets/:id/asignar-multiple', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });
    try {
        if (!req.body.prioridad) return res.status(400).json({ error: 'Selecciona la prioridad evaluada por el administrador' });
        await TicketRepository.assignTechnicians({
            id_ticket: req.params.id,
            tecnicoIds: req.body.id_tecnicos || req.body.tecnicos || req.body.id_tecnico,
            id_area_admin: req.body.id_area_admin || req.body.id_area,
            prioridad: req.body.prioridad,
            asignado_por: req.session.user.id,
            comentario: req.body.comentario
        });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tecnicos', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json([]);
    try {
        const tecnicos = await UserRepository.findAllByRole('tecnico');
        res.json(tecnicos);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API TECNICO ---
app.put('/api/tecnico/tickets/:id/estado', upload.fields([
    { name: 'evidencias', maxCount: 5 },
    { name: 'archivos', maxCount: 5 }
]), async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'tecnico') return res.status(403).json({ error: 'No autorizado' });
    try {
        if (req.body.nuevoEstado === 'Resuelto') {
            const evidencias = [
                ...(req.files?.evidencias || []),
                ...(req.files?.archivos || [])
            ].map(file => file.filename);

            await TicketRepository.resolveTicket({
                id_ticket: req.params.id,
                id_tecnico: req.session.user.id,
                comentario: req.body.comentario || req.body.solucion || req.body.notas,
                evidencias
            });
            return res.json({ success: true });
        }

        if (req.body.nuevoEstado === 'En Espera') {
            const evidencias = [
                ...(req.files?.evidencias || []),
                ...(req.files?.archivos || [])
            ].map(file => file.filename);

            await TicketRepository.putAssignmentOnHold({
                id_ticket: req.params.id,
                id_tecnico: req.session.user.id,
                motivo: req.body.motivo || req.body.comentario,
                evidencias
            });
            return res.json({ success: true });
        }

        const pool = await poolPromise;
        await pool.request()
            .input('est', sql.NVarChar, req.body.nuevoEstado)
            .input('id_tec', sql.Int, req.session.user.id)
            .input('id_tic', sql.Int, req.params.id)
            .query(`UPDATE Tickets 
                    SET estado = @est, id_tecnico_asignado = @id_tec 
                    WHERE id_ticket = @id_tic 
                    AND (id_tecnico_asignado IS NULL OR id_tecnico_asignado = @id_tec)`); // <--- ESTO ES EL CAMBIO
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
// --- OTRAS RUTAS ---
app.delete('/api/usuarios/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });
    try {
        await UserRepository.deleteById({
            id_usuario: req.params.id,
            deletedBy: req.session.user.id
        });
        res.json({ success: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
});



app.get('/api/usuarios', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json([]);
    try {
        const usuarios = await UserRepository.findAll();
        res.json(usuarios);
    } catch (e) { res.status(500).json({ error: e.message }); }
});


app.put('/api/tickets/:id/:accion', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'No autorizado' });
    try {
        const { id, accion } = req.params;
        if (req.session.user.role !== 'usuario') return res.status(403).json({ error: 'Solo el usuario solicitante puede aprobar o rechazar la solución' });
        const allowed = await TicketRepository.canAccessTicket({ id_ticket: id, user: req.session.user });
        if (!allowed) return res.status(403).json({ error: 'No tienes permiso para este ticket' });
        if (accion === 'aprobar') await TicketRepository.aprobarTicket(id, req.session.user.id);
        else if (accion === 'rechazar') await TicketRepository.rechazarTicket(id, req.session.user.id, req.body.comentario || req.body.motivo);
        
        res.json({ success: true });
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

app.put('/api/perfil', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'No autorizado' });
    try {
        await UserRepository.updateAvatar(req.session.user.id, req.body.avatar);
        req.session.user.avatar = req.body.avatar;
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});
//////////// COSA NUEVA 
app.put('/api/tecnico/tickets/:id/aceptar-asignacion', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'tecnico') return res.status(403).json({ error: 'No autorizado' });
    try {
        await TicketRepository.acceptAssignment({
            id_ticket: req.params.id,
            id_tecnico: req.session.user.id
        });
        res.json({ success: true });
    } catch (e) { res.status(404).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`))
