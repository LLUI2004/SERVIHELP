import { poolPromise, sql } from './db.js';
import bcrypt from 'bcrypt';
import { SALT_ROUND } from './config.js';

export class UserRepository {
  
  static async create({ username, password, nombre, rol, area }) {
    // Definimos valores por defecto si rol o area llegan como undefined/null/vacíos
    const rolFinal = (rol || 'usuario').toLowerCase();
    const areaFinal = (area || 'General').toLowerCase();

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
        .input('n', sql.NVarChar, nombre)
        .input('id_rol', sql.Int, id_rol)
        .input('id_area', sql.Int, id_area)
        .query(`INSERT INTO dbo.Usuarios (username, password_hash, nombre_completo, id_rol, id_area) 
                OUTPUT INSERTED.id_usuario
                VALUES (@u, @p, @n, @id_rol, @id_area)`);
    
    return result.recordset[0].id_usuario;
  }

  static async login ({ username, password }) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('u', sql.NVarChar, username)
      .query(`SELECT u.id_usuario, u.username, u.password_hash, u.avatar, r.nombre_rol as role 
              FROM dbo.Usuarios u 
              JOIN dbo.Roles r ON u.id_rol = r.id_rol 
              WHERE u.username = @u`);
    
    const user = result.recordset[0];
    if (!user) throw new Error('Usuario no encontrado');
    
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) throw new Error('Contraseña incorrecta');
    return { id_usuario: user.id_usuario, username: user.username, role: user.role, avatar: user.avatar };
  }

static async findAll() {
    const pool = await poolPromise;
    const result = await pool.request()
      .query(`SELECT u.id_usuario, u.username, r.nombre_rol as role 
              FROM dbo.Usuarios u
              LEFT JOIN dbo.Roles r ON u.id_rol = r.id_rol`);
    return result.recordset;
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
                WHERE r.nombre_rol = @role`); 
    return result.recordset;
  }
}