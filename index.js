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

// --- AUTENTICACIÓN ---
app.post('/register', async (req, res) => {
    const { username, password, nombre, area } = req.body;
    
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
        const id = await UserRepository.create({ username, password, nombre, rol, area });
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

// --- API TICKETS ---
app.post('/api/tickets', upload.single('archivo'), async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'No autorizado' });
    
    // Cambiamos 'area' por 'id_area' para que coincida con lo que envías en el select
    const { titulo, descripcion, prioridad, id_area } = req.body; 
    const archivo = req.file ? req.file.filename : null; 
    
    try {
        // Pasamos id_area al repositorio
        const idTicket = await TicketRepository.createTicket({ 
            titulo, 
            descripcion, 
            prioridad, 
            id_area, // Esto enviará el número (1, 2, 4...)
            id_usuario_creador: req.session.user.id, 
            archivo 
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
        const all = await TicketRepository.getAllTickets();
        
        if (req.session.user.role === 'admin') {
            res.json(all);
        } 
        else if (req.session.user.role === 'tecnico') {
    const filtrados = all.filter(t => {
        // 1. CONDICIÓN DE ASIGNACIÓN: 
        // Si el ticket tiene MI ID y está 'Pendiente', el Admin me lo acaba de asignar.
        const esNuevoParaMi = (t.id_tecnico_asignado === req.session.user.id && t.estado === 'Pendiente');

        // 2. CONDICIÓN DE GESTIÓN:
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

app.get('/api/tickets/:id', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'No autorizado' });
    try {
        const ticket = await TicketRepository.getTicketById(req.params.id);
        res.json(ticket);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API ADMIN ---
app.get('/api/admin/tickets', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json([]);
    try {
        // CAMBIA LA LÓGICA POR ESTO:
        const tickets = await TicketRepository.getAllTickets();
        res.json(tickets);
    } catch (e) { 
        res.status(500).json({ error: e.message }); 
    }
});

app.put('/api/admin/tickets/:id/asignar', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'No autorizado' });
    try {
        const pool = await poolPromise;
        // El admin asigna el dueño, pero pone el ticket en espera de confirmación
        await pool.request()
            .input('id_tec', sql.Int, req.body.id_tecnico)
            .input('id_tic', sql.Int, req.params.id)
            // En lugar de estado = 'Pendiente_Aceptacion', usa 'Pendiente'
.query(`UPDATE Tickets 
        SET id_tecnico_asignado = @id_tec, 
            estado = 'Pendiente' 
        WHERE id_ticket = @id_tic`);
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

// --- API TÉCNICO ---
app.put('/api/tecnico/tickets/:id/estado', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'tecnico') return res.status(403).json({ error: 'No autorizado' });
    try {
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
    if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json([]);
    try {
        const pool = await poolPromise;
        await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM Usuarios WHERE id_usuario = @id');
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
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
        if (accion === 'aprobar') await TicketRepository.aprobarTicket(id);
        else if (accion === 'rechazar') await TicketRepository.rechazarTicket(id);
        
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
        const pool = await poolPromise;
        // Agregamos: AND id_tecnico_asignado = @id_tec
        const result = await pool.request()
            .input('id_tic', sql.Int, req.params.id)
            .input('id_tec', sql.Int, req.session.user.id)
            .query("UPDATE Tickets SET estado = 'En Proceso' WHERE id_ticket = @id_tic AND id_tecnico_asignado = @id_tec");
        
        if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Ticket no encontrado o no asignado a ti' });
        
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`))