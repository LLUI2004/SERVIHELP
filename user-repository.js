import { poolPromise, sql } from './db.js';
import bcrypt from 'bcrypt';
import { SALT_ROUND } from './config.js';
import crypto from 'crypto';

export class UserRepository {
  
  static async create({ username, password, nombre, rol, area, correo }) {
    // Definimos valores por defecto si rol o area llegan como undefined/null/vacíos
    const rolFinal = (rol || 'usuario').toLowerCase();
   const areaFinal = area && String(area).trim().toLowerCase() !== 'general'
      ? String(area).trim().toLowerCase()
      : 'sistemas';
    const nombreFinal = nombre && String(nombre).trim() ? String(nombre).trim() : username;
    const pool = await poolPromise;
    const hashedPassword = await bcrypt.hash(password, SALT_ROUND);
    
    // 1. Obtenemos los IDs primero para asegurar que existen
    const resultIds = await pool.request()
        .input('r', sql.NVarChar, rolFinal)
        .input('a', sql.NVarChar, areaFinal)
        .query(`
            SELECT 
                (SELECT id_rol FROM dbo.Roles WHERE LOWER(nombre_rol) = @r) as id_rol,
                (SELECT id_area FROM dbo.Areas WHERE LOWER(nombre_area) = @a) as id_area
        `);

    const { id_rol, id_area } = resultIds.recordset[0];

    if (!id_rol) throw new Error(`El rol '${rolFinal}' no existe en la base de datos.`);
    if (!id_area) throw new Error(`El área '${areaFinal}' no existe en la base de datos.`);

    // 2. Insertamos con los IDs ya validados
    const result = await pool.request()
        .input('u', sql.NVarChar, username)
        .input('p', sql.NVarChar, hashedPassword)
           .input('n', sql.NVarChar, nombreFinal)
        .input('id_rol', sql.Int, id_rol)
        .input('id_area', sql.Int, id_area)
        .input('correo', sql.NVarChar, correo || null)
        .query(`INSERT INTO dbo.Usuarios (username, password_hash, nombre_completo, id_rol, id_area, correo)
                OUTPUT INSERTED.id_usuario
                VALUES (@u, @p, @n, @id_rol, @id_area, @correo)`);
    
    return result.recordset[0].id_usuario;
  }

  static async login ({ username, password }) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('u', sql.NVarChar, username)
      .query(`SELECT u.id_usuario, u.username, u.password_hash, u.avatar, r.nombre_rol as role 
              FROM dbo.Usuarios u 
              JOIN dbo.Roles r ON u.id_rol = r.id_rol 
              WHERE (u.username = @u OR u.correo = @u)
                AND u.username NOT LIKE 'eliminado[_]%'`);
    
    const user = result.recordset[0];
    if (!user) throw new Error('Usuario o correo no encontrado');
    
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) throw new Error('Contraseña incorrecta');
    return { id_usuario: user.id_usuario, username: user.username, role: user.role, avatar: user.avatar };
  }

static async findAll() {
    const pool = await poolPromise;
    const result = await pool.request()
      .query(`SELECT u.id_usuario, u.username, u.correo, r.nombre_rol as role 
              FROM dbo.Usuarios u
              LEFT JOIN dbo.Roles r ON u.id_rol = r.id_rol
              WHERE u.username NOT LIKE 'eliminado[_]%'`);
    return result.recordset;
}

  static async deleteById({ id_usuario, deletedBy }) {
    const id = Number(id_usuario);
    const adminId = Number(deletedBy);

    if (!Number.isInteger(id) || id <= 0) throw new Error('Usuario invalido');
    if (id === adminId) throw new Error('No puedes eliminar tu propia cuenta mientras estas usando el panel.');

    const pool = await poolPromise;
    const user = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT TOP 1 id_usuario, username
              FROM dbo.Usuarios
              WHERE id_usuario = @id`);

    if (!user.recordset[0]) throw new Error('El usuario no existe o ya fue eliminado.');

    const activeUsage = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT
                (SELECT COUNT(*)
                 FROM dbo.Tickets
                 WHERE fecha_eliminacion IS NULL
                   AND estado NOT IN ('Resuelto', 'Cerrado')
                   AND (id_usuario_creador = @id OR id_tecnico_asignado = @id)) as tickets_activos,
                (SELECT COUNT(*)
                 FROM dbo.Ticket_Tecnico tt
                 JOIN dbo.Tickets t ON t.id_ticket = tt.id_ticket
                 WHERE t.fecha_eliminacion IS NULL
                   AND t.estado NOT IN ('Resuelto', 'Cerrado')
                   AND tt.activo = 1
                   AND tt.id_tecnico = @id) as asignaciones_activas`);

    const activeRefs = activeUsage.recordset[0] || {};
    const totalActiveRefs = Number(activeRefs.tickets_activos || 0)
      + Number(activeRefs.asignaciones_activas || 0);

    if (totalActiveRefs > 0) {
      throw new Error('No se puede eliminar este usuario porque tiene tickets pendientes o en proceso.');
    }

    const usage = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT
                (SELECT COUNT(*) FROM dbo.Tickets
                 WHERE id_usuario_creador = @id
                    OR id_tecnico_asignado = @id
                    OR editado_por = @id
                    OR eliminado_por = @id) as tickets,
                (SELECT COUNT(*) FROM dbo.Ticket_Tecnico
                 WHERE id_tecnico = @id OR asignado_por = @id) as asignaciones,
                (SELECT COUNT(*) FROM dbo.Ticket_Soluciones
                 WHERE id_tecnico = @id) as soluciones,
                (SELECT COUNT(*) FROM dbo.Ticket_Rechazos
                 WHERE id_usuario = @id) as rechazos,
                (SELECT COUNT(*) FROM dbo.Historial_Tickets
                 WHERE id_usuario_cambio = @id) as historial`);

    const refs = usage.recordset[0] || {};
    const totalRefs = Number(refs.tickets || 0)
      + Number(refs.asignaciones || 0)
      + Number(refs.soluciones || 0)
      + Number(refs.rechazos || 0)
      + Number(refs.historial || 0);

    await pool.request()
      .input('id', sql.Int, id)
      .query(`IF OBJECT_ID('dbo.Notificaciones', 'U') IS NOT NULL
                  DELETE FROM dbo.Notificaciones WHERE id_usuario = @id;
              IF OBJECT_ID('dbo.Password_Reset_Tokens', 'U') IS NOT NULL
                  DELETE FROM dbo.Password_Reset_Tokens WHERE id_usuario = @id;
              IF OBJECT_ID('dbo.Usuario_Area', 'U') IS NOT NULL
                  DELETE FROM dbo.Usuario_Area WHERE id_usuario = @id;`);

    if (totalRefs > 0) {
      const deletedUsername = `eliminado_${id}`;
      const deletedPassword = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), SALT_ROUND);

      const result = await pool.request()
        .input('id', sql.Int, id)
        .input('username', sql.NVarChar, deletedUsername)
        .input('password_hash', sql.NVarChar, deletedPassword)
        .query(`UPDATE dbo.Usuarios
                SET username = @username,
                    correo = NULL,
                    password_hash = @password_hash,
                    nombre_completo = 'Usuario eliminado',
                    avatar = 'fa-user-slash'
                WHERE id_usuario = @id`);

      if ((result.rowsAffected[0] || 0) === 0) {
        throw new Error('No se pudo eliminar el usuario.');
      }

      return { deleted: true, mode: 'deactivated' };
    }

    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`DELETE FROM dbo.Usuarios WHERE id_usuario = @id;`);

    if ((result.rowsAffected[0] || 0) === 0) {
      throw new Error('No se pudo eliminar el usuario.');
    }

    return { deleted: true, mode: 'deleted' };
  }

  static async updateAvatar(id_usuario, avatar) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, id_usuario)
        .input('avatar', sql.NVarChar, avatar)
        .query(`UPDATE dbo.Usuarios SET avatar = @avatar WHERE id_usuario = @id`); 
  }

  static async findAllByRole(role) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('role', sql.NVarChar, role)
      .query(`SELECT u.id_usuario, u.username, u.nombre_completo as nombre 
                FROM dbo.Usuarios u 
                JOIN dbo.Roles r ON u.id_rol = r.id_rol 
                WHERE r.nombre_rol = @role
                  AND u.username NOT LIKE 'eliminado[_]%'`); 
    return result.recordset;
  }

  static async findByUsernameOrEmail(identifier) {
    const pool = await poolPromise;
    const cleanIdentifier = String(identifier || '').trim();

    if (!cleanIdentifier) throw new Error('Ingresa tu usuario o correo');

    const result = await pool.request()
      .input('identifier', sql.NVarChar, cleanIdentifier)
      .query(`SELECT TOP 1 id_usuario, username, correo
              FROM dbo.Usuarios
              WHERE (username = @identifier OR correo = @identifier)
                AND username NOT LIKE 'eliminado[_]%'`);

    return result.recordset[0] || null;
  }

  static async createPasswordResetToken({ identifier, ip, userAgent }) {
    const user = await this.findByUsernameOrEmail(identifier);

    if (!user) return { user: null, resetToken: null };

    const pool = await poolPromise;
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    await pool.request()
      .input('id_usuario', sql.Int, user.id_usuario)
      .input('token_hash', sql.NVarChar, tokenHash)
      .input('fecha_expiracion', sql.DateTime2, new Date(Date.now() + 1000 * 60 * 30))
      .input('ip', sql.NVarChar, ip || null)
      .input('user_agent', sql.NVarChar, userAgent || null)
      .query(`UPDATE dbo.Password_Reset_Tokens
              SET usado = 1, fecha_uso = SYSDATETIME()
              WHERE id_usuario = @id_usuario
                AND usado = 0
                AND fecha_uso IS NULL;

              INSERT INTO dbo.Password_Reset_Tokens
              (id_usuario, token_hash, fecha_expiracion, solicitado_por_ip, user_agent)
              VALUES (@id_usuario, @token_hash, @fecha_expiracion, @ip, @user_agent)`);

    return { user, resetToken };
  }

  static async updatePasswordByUserId(id_usuario, newPassword) {
    if (!newPassword || String(newPassword).length < 4) {
      throw new Error('La nueva contraseña debe tener al menos 4 caracteres');
    }

    const pool = await poolPromise;
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUND);

    await pool.request()
      .input('id_usuario', sql.Int, id_usuario)
      .input('password_hash', sql.NVarChar, hashedPassword)
      .query(`UPDATE dbo.Usuarios
              SET password_hash = @password_hash
              WHERE id_usuario = @id_usuario`);
  }

  static async resetPasswordWithToken({ token, newPassword }) {
    const cleanToken = String(token || '').trim();
    if (!cleanToken) throw new Error('Token requerido');

    const pool = await poolPromise;
    const tokenHash = crypto.createHash('sha256').update(cleanToken).digest('hex');

    const result = await pool.request()
      .input('token_hash', sql.NVarChar, tokenHash)
      .query(`SELECT TOP 1 id_reset, id_usuario
              FROM dbo.Password_Reset_Tokens
              WHERE token_hash = @token_hash
                AND usado = 0
                AND fecha_uso IS NULL
                AND fecha_expiracion > SYSDATETIME()
              ORDER BY fecha_creacion DESC`);

    const reset = result.recordset[0];
    if (!reset) throw new Error('El enlace de recuperación es inválido o expiró');

    await this.updatePasswordByUserId(reset.id_usuario, newPassword);

    await pool.request()
      .input('id_reset', sql.Int, reset.id_reset)
      .query(`UPDATE dbo.Password_Reset_Tokens
              SET usado = 1, fecha_uso = SYSDATETIME()
              WHERE id_reset = @id_reset`);

    return true;
  }
}
