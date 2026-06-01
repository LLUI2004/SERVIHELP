import { poolPromise } from './db.js';
import sql from 'mssql';

export class TicketRepository {
  static async createTicket({ titulo, descripcion, prioridad, id_area, id_usuario_creador, archivo, evidencias = [] }) {
    const pool = await poolPromise;
    const prioridadFinal = prioridad || 'Sin evaluar';
    const archivos = [...(archivo ? [archivo] : []), ...evidencias].filter(Boolean).slice(0, 5);

    const result = await pool.request()
      .input('t', sql.NVarChar, titulo)
      .input('d', sql.NVarChar, descripcion)
      .input('p', sql.NVarChar, prioridadFinal)
      .input('ida', sql.Int, id_area || null)
      .input('u', sql.Int, id_usuario_creador)
      .input('a', sql.NVarChar, archivo || null)
      .query(`INSERT INTO Tickets (titulo, descripcion, prioridad, id_area, id_area_solicitada, id_usuario_creador, archivo, estado)
              OUTPUT INSERTED.id_ticket
              VALUES (@t, @d, @p, @ida, @ida, @u, @a, 'Pendiente_Asignacion')`);

    const idTicket = result.recordset[0].id_ticket;
    await this.addEvidencias(idTicket, archivos);
    await this.addHistory({
      id_ticket: idTicket,
      id_usuario: id_usuario_creador,
      estado_anterior: 'Nuevo',
      estado_nuevo: 'Pendiente_Asignacion',
      comentario: 'Ticket creado por el usuario.'
    });
    return idTicket;
  }

  static async addHistory({ id_ticket, id_usuario, estado_anterior, estado_nuevo, comentario }) {
    const pool = await poolPromise;
    await pool.request()
      .input('id_ticket', sql.Int, id_ticket)
      .input('id_usuario', sql.Int, id_usuario)
      .input('estado_anterior', sql.NVarChar, estado_anterior || 'Sin estado')
      .input('estado_nuevo', sql.NVarChar, estado_nuevo || 'Sin estado')
      .input('comentario', sql.NVarChar, comentario || null)
      .query(`INSERT INTO Historial_Tickets
              (id_ticket, id_usuario_cambio, estado_anterior, estado_nuevo, comentario, fecha_cambio)
              VALUES (@id_ticket, @id_usuario, @estado_anterior, @estado_nuevo, @comentario, SYSDATETIME())`);
  }

  static async notifyUser({ id_usuario, id_ticket, titulo, mensaje }) {
    if (!id_usuario) return;
    const pool = await poolPromise;
    await pool.request()
      .input('id_usuario', sql.Int, id_usuario)
      .input('id_ticket', sql.Int, id_ticket || null)
      .input('titulo', sql.NVarChar, titulo)
      .input('mensaje', sql.NVarChar, mensaje)
      .query(`INSERT INTO Notificaciones (id_usuario, id_ticket, titulo, mensaje)
              VALUES (@id_usuario, @id_ticket, @titulo, @mensaje)`);
  }

  static async notifyAdmins({ id_ticket, titulo, mensaje }) {
    const pool = await poolPromise;
    await pool.request()
      .input('id_ticket', sql.Int, id_ticket || null)
      .input('titulo', sql.NVarChar, titulo)
      .input('mensaje', sql.NVarChar, mensaje)
      .query(`INSERT INTO Notificaciones (id_usuario, id_ticket, titulo, mensaje)
              SELECT u.id_usuario, @id_ticket, @titulo, @mensaje
              FROM Usuarios u
              JOIN Roles r ON u.id_rol = r.id_rol
              WHERE r.nombre_rol = 'admin'`);
  }

  static async getNotificationsByUserId(id_usuario) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id_usuario', sql.Int, id_usuario)
      .query(`SELECT TOP 20 id_notificacion, id_ticket, titulo, mensaje, leida, fecha_creacion
              FROM Notificaciones
              WHERE id_usuario = @id_usuario
              ORDER BY fecha_creacion DESC`);
    return result.recordset;
  }

  static async markNotificationsRead(id_usuario) {
    const pool = await poolPromise;
    await pool.request()
      .input('id_usuario', sql.Int, id_usuario)
      .query(`UPDATE Notificaciones
              SET leida = 1
              WHERE id_usuario = @id_usuario
                AND leida = 0`);
  }

  static async getCurrentStatus(id_ticket) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id_ticket', sql.Int, id_ticket)
      .query(`SELECT CASE
                  WHEN EXISTS (
                      SELECT 1
                      FROM Ticket_Tecnico tt
                      WHERE tt.id_ticket = Tickets.id_ticket
                        AND tt.activo = 1
                        AND (
                            tt.estado_asignacion = 'En Espera'
                            OR tt.comentario_asignacion LIKE '[[]ESPERA[]] %'
                        )
                  ) THEN 'En Espera'
                  ELSE estado
              END AS estado
              FROM Tickets
              WHERE id_ticket = @id_ticket`);
    return result.recordset[0]?.estado || 'Sin estado';
  }

  static async getTicketOwnerId(id_ticket) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id_ticket', sql.Int, id_ticket)
      .query(`SELECT id_usuario_creador FROM Tickets WHERE id_ticket = @id_ticket`);
    return result.recordset[0]?.id_usuario_creador || null;
  }

  static async canAccessTicket({ id_ticket, user }) {
    if (!user) return false;
    if (user.role === 'admin') return true;

    const pool = await poolPromise;
    const request = pool.request()
      .input('id_ticket', sql.Int, id_ticket)
      .input('id_usuario', sql.Int, user.id);

    if (user.role === 'usuario') {
      const result = await request
        .query(`SELECT 1 as allowed
                FROM Tickets
                WHERE id_ticket = @id_ticket
                  AND id_usuario_creador = @id_usuario
                  AND fecha_eliminacion IS NULL`);
      return Boolean(result.recordset[0]);
    }

    if (user.role === 'tecnico') {
      const result = await request
        .query(`SELECT 1 as allowed
                FROM Ticket_Tecnico tt
                JOIN Tickets t ON t.id_ticket = tt.id_ticket
                WHERE tt.id_ticket = @id_ticket
                  AND tt.id_tecnico = @id_usuario
                  AND tt.activo = 1
                  AND t.fecha_eliminacion IS NULL`);
      return Boolean(result.recordset[0]);
    }

    return false;
  }

  static async getTicketsByUserId(id_usuario) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('u', sql.Int, id_usuario)
      .query(`SELECT t.id_ticket, t.titulo, t.descripcion, t.prioridad, t.fecha_creacion,
                     t.fecha_actualizacion, t.fecha_asignacion, t.fecha_resolucion,
                     CASE
                         WHEN EXISTS (
                             SELECT 1
                             FROM Ticket_Tecnico ttw
                             WHERE ttw.id_ticket = t.id_ticket
                               AND ttw.activo = 1
                               AND (
                                   ttw.estado_asignacion = 'En Espera'
                                   OR ttw.comentario_asignacion LIKE '[[]ESPERA[]] %'
                               )
                         ) THEN 'En Espera'
                         ELSE t.estado
                     END AS estado,
                     t.archivo, t.id_tecnico_asignado, t.id_area,
                     t.id_area_solicitada, t.id_area_admin,
                     a.nombre_area,
                     (SELECT COUNT(*) FROM Ticket_Tecnico tt WHERE tt.id_ticket = t.id_ticket AND tt.activo = 1) as total_tecnicos,
                     (SELECT COUNT(*) FROM Ticket_Tecnico tt WHERE tt.id_ticket = t.id_ticket AND tt.activo = 1 AND tt.estado_asignacion = 'Resuelto') as tecnicos_resueltos,
                     (SELECT TOP 1 s.comentario
                     FROM Ticket_Soluciones s
                      WHERE s.id_ticket = t.id_ticket AND s.visible_usuario = 1
                        AND s.fecha_solucion > ISNULL((
                            SELECT MAX(r.fecha_rechazo)
                            FROM Ticket_Rechazos r
                            WHERE r.id_ticket = t.id_ticket
                        ), CONVERT(DATETIME2, '19000101'))
                      ORDER BY s.fecha_solucion DESC) as ultima_solucion
              FROM Tickets t
              LEFT JOIN Areas a ON t.id_area = a.id_area
              WHERE t.id_usuario_creador = @u
                AND t.fecha_eliminacion IS NULL
              ORDER BY t.fecha_creacion DESC`);
    return result.recordset;
  }

  static async getTicketById(id) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT t.id_ticket, t.titulo, t.descripcion, t.prioridad, t.fecha_creacion,
                     t.fecha_actualizacion, t.fecha_asignacion, t.fecha_resolucion,
                     t.fecha_cierre, t.fecha_rechazo,
                     CASE
                         WHEN EXISTS (
                             SELECT 1
                             FROM Ticket_Tecnico ttw
                             WHERE ttw.id_ticket = t.id_ticket
                               AND ttw.activo = 1
                               AND (
                                   ttw.estado_asignacion = 'En Espera'
                                   OR ttw.comentario_asignacion LIKE '[[]ESPERA[]] %'
                               )
                         ) THEN 'En Espera'
                         ELSE t.estado
                     END AS estado,
                     t.archivo,
                     t.id_usuario_creador, t.id_tecnico_asignado, t.id_area,
                     t.id_area_solicitada, t.id_area_admin, t.notas_tecnico,
                     a.nombre_area,
                     aa.nombre_area as nombre_area_admin,
                     (SELECT COUNT(*) FROM Ticket_Tecnico tt WHERE tt.id_ticket = t.id_ticket AND tt.activo = 1) as total_tecnicos,
                     (SELECT COUNT(*) FROM Ticket_Tecnico tt WHERE tt.id_ticket = t.id_ticket AND tt.activo = 1 AND tt.estado_asignacion = 'Resuelto') as tecnicos_resueltos
              FROM Tickets t
              LEFT JOIN Areas a ON t.id_area = a.id_area
              LEFT JOIN Areas aa ON t.id_area_admin = aa.id_area
              WHERE t.id_ticket = @id
                AND t.fecha_eliminacion IS NULL`);
    return result.recordset[0];
  }

  static async getAllTickets() {
    const pool = await poolPromise;
    const result = await pool.request()
      .query(`SELECT t.id_ticket, t.titulo, t.descripcion, t.prioridad,
                     CASE
                         WHEN EXISTS (
                             SELECT 1
                             FROM Ticket_Tecnico ttw
                             WHERE ttw.id_ticket = t.id_ticket
                               AND ttw.activo = 1
                               AND (
                                   ttw.estado_asignacion = 'En Espera'
                                   OR ttw.comentario_asignacion LIKE '[[]ESPERA[]] %'
                               )
                         ) THEN 'En Espera'
                         ELSE t.estado
                     END AS estado,
                     t.id_tecnico_asignado, t.archivo, t.fecha_creacion,
                     t.fecha_actualizacion, t.fecha_asignacion, t.fecha_resolucion,
                     t.id_area, t.id_area_solicitada, t.id_area_admin,
                     u1.username as usuario_creador,
                     u2.username as tecnico_asignado,
                     a.nombre_area,
                     aa.nombre_area as nombre_area_admin,
                     (SELECT COUNT(*) FROM Ticket_Tecnico tt WHERE tt.id_ticket = t.id_ticket AND tt.activo = 1) as total_tecnicos
                     ,(SELECT COUNT(*) FROM Ticket_Tecnico tt WHERE tt.id_ticket = t.id_ticket AND tt.activo = 1 AND tt.estado_asignacion = 'Resuelto') as tecnicos_resueltos
                     ,(SELECT STRING_AGG(u.username, ', ')
                       FROM Ticket_Tecnico tt
                       JOIN Usuarios u ON tt.id_tecnico = u.id_usuario
                       WHERE tt.id_ticket = t.id_ticket AND tt.activo = 1) as tecnicos_asignados
                     ,(SELECT STRING_AGG(CONVERT(VARCHAR(20), tt.id_tecnico), ',')
                       FROM Ticket_Tecnico tt
                       WHERE tt.id_ticket = t.id_ticket AND tt.activo = 1) as tecnicos_asignados_ids
                     ,(SELECT TOP 1 s.comentario
                     FROM Ticket_Soluciones s
                     WHERE s.id_ticket = t.id_ticket
                       AND s.fecha_solucion > ISNULL((
                           SELECT MAX(r.fecha_rechazo)
                           FROM Ticket_Rechazos r
                           WHERE r.id_ticket = t.id_ticket
                       ), CONVERT(DATETIME2, '19000101'))
                      ORDER BY s.fecha_solucion DESC) as ultima_solucion
              FROM Tickets t
              LEFT JOIN Usuarios u1 ON t.id_usuario_creador = u1.id_usuario
              LEFT JOIN Usuarios u2 ON t.id_tecnico_asignado = u2.id_usuario
              LEFT JOIN Areas a ON t.id_area = a.id_area
              LEFT JOIN Areas aa ON t.id_area_admin = aa.id_area
              WHERE t.fecha_eliminacion IS NULL
              ORDER BY t.fecha_creacion DESC`);
    return result.recordset;
  }

  static async getAreas() {
    const pool = await poolPromise;
    const result = await pool.request()
      .query(`SELECT id_area, nombre_area FROM Areas ORDER BY nombre_area`);
    return result.recordset;
  }

  static async addEvidencias(id_ticket, archivos = []) {
    const pool = await poolPromise;
    const limpias = archivos.filter(Boolean).slice(0, 5);

    for (let index = 0; index < limpias.length; index++) {
      await pool.request()
        .input('id_ticket', sql.Int, id_ticket)
        .input('ruta', sql.NVarChar, limpias[index])
        .input('orden', sql.Int, index + 1)
        .query(`IF NOT EXISTS (
                    SELECT 1 FROM Tickets_Evidencias
                    WHERE id_ticket = @id_ticket
                      AND ruta_archivo = @ruta
                      AND fecha_eliminacion IS NULL
                )
                INSERT INTO Tickets_Evidencias (id_ticket, ruta_archivo, nombre_original, orden)
                VALUES (@id_ticket, @ruta, @ruta, @orden)`);
    }
  }

  static async replaceEvidencias(id_ticket, archivos = []) {
    const pool = await poolPromise;
    await pool.request()
      .input('id_ticket', sql.Int, id_ticket)
      .query(`DELETE FROM Tickets_Evidencias WHERE id_ticket = @id_ticket`);
    await this.addEvidencias(id_ticket, archivos);
  }

  static async getEvidenciasByTicketId(id_ticket) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id_ticket', sql.Int, id_ticket)
      .query(`SELECT id_evidencia, id_ticket, ruta_archivo, nombre_original, mime_type,
                     tamano_bytes, orden, fecha_subida
              FROM Tickets_Evidencias
              WHERE id_ticket = @id_ticket
                AND fecha_eliminacion IS NULL
              ORDER BY orden, fecha_subida`);
    return result.recordset;
  }

  static async getAssignmentsByTicketId(id_ticket) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id_ticket', sql.Int, id_ticket)
      .query(`SELECT tt.id_ticket_tecnico, tt.id_ticket, tt.id_tecnico,
                     u.username as tecnico,
                     tt.id_area_asignada,
                     a.nombre_area as area_asignada,
                     CASE
                         WHEN tt.estado_asignacion = 'En Espera'
                           OR tt.comentario_asignacion LIKE '[[]ESPERA[]] %' THEN 'En Espera'
                         ELSE tt.estado_asignacion
                     END AS estado_asignacion,
                     tt.fecha_asignacion,
                     tt.fecha_aceptacion, tt.fecha_inicio, tt.fecha_resolucion,
                     tt.comentario_asignacion
              FROM Ticket_Tecnico tt
              LEFT JOIN Usuarios u ON tt.id_tecnico = u.id_usuario
              LEFT JOIN Areas a ON tt.id_area_asignada = a.id_area
              WHERE tt.id_ticket = @id_ticket
                AND tt.activo = 1
              ORDER BY tt.fecha_asignacion DESC`);
    return result.recordset;
  }

  static async getRejectionsByTicketId(id_ticket) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id_ticket', sql.Int, id_ticket)
      .query(`SELECT r.*,
                     u.username as usuario
              FROM Ticket_Rechazos r
              LEFT JOIN Usuarios u ON r.id_usuario = u.id_usuario
              WHERE r.id_ticket = @id_ticket
              ORDER BY r.fecha_rechazo DESC`);
    return result.recordset;
  }

  static async getHistoryByTicketId(id_ticket) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id_ticket', sql.Int, id_ticket)
      .query(`SELECT h.id_historial, h.id_ticket, h.id_usuario_cambio,
                     u.username as usuario,
                     h.estado_anterior, h.estado_nuevo,
                     h.comentario, h.fecha_cambio
              FROM Historial_Tickets h
              LEFT JOIN Usuarios u ON h.id_usuario_cambio = u.id_usuario
              WHERE h.id_ticket = @id_ticket
              ORDER BY h.fecha_cambio DESC, h.id_historial DESC`);
    return result.recordset;
  }

  static async getTicketsByTechnicianId(id_tecnico) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id_tecnico', sql.Int, id_tecnico)
      .query(`SELECT t.id_ticket, t.titulo, t.descripcion, t.prioridad,
                     CASE
                         WHEN tt.estado_asignacion = 'En Espera'
                           OR tt.comentario_asignacion LIKE '[[]ESPERA[]] %' THEN 'En Espera'
                         WHEN EXISTS (
                             SELECT 1
                             FROM Ticket_Tecnico ttw
                             WHERE ttw.id_ticket = t.id_ticket
                               AND ttw.activo = 1
                               AND (
                                   ttw.estado_asignacion = 'En Espera'
                                   OR ttw.comentario_asignacion LIKE '[[]ESPERA[]] %'
                               )
                         ) THEN 'En Espera'
                         ELSE t.estado
                     END AS estado,
                     t.id_tecnico_asignado, t.archivo, t.fecha_creacion,
                     t.fecha_actualizacion, t.fecha_asignacion, t.fecha_resolucion,
                     t.id_area, t.id_area_solicitada, t.id_area_admin,
                     u1.username as usuario_creador,
                     u2.username as tecnico_asignado,
                     a.nombre_area,
                     aa.nombre_area as nombre_area_admin,
                     CASE
                         WHEN tt.estado_asignacion = 'En Espera'
                           OR tt.comentario_asignacion LIKE '[[]ESPERA[]] %' THEN 'En Espera'
                         ELSE tt.estado_asignacion
                     END AS estado_asignacion,
                     tt.fecha_asignacion as fecha_asignacion_tecnico,
                     tt.fecha_aceptacion, tt.fecha_inicio, tt.fecha_resolucion as fecha_resolucion_tecnico,
                     (SELECT COUNT(*) FROM Ticket_Tecnico ttc WHERE ttc.id_ticket = t.id_ticket AND ttc.activo = 1) as total_tecnicos,
                     (SELECT COUNT(*) FROM Ticket_Tecnico ttc WHERE ttc.id_ticket = t.id_ticket AND ttc.activo = 1 AND ttc.estado_asignacion = 'Resuelto') as tecnicos_resueltos,
                     (SELECT TOP 1 s.comentario
                      FROM Ticket_Soluciones s
                      WHERE s.id_ticket = t.id_ticket
                        AND s.fecha_solucion > ISNULL((
                            SELECT MAX(r.fecha_rechazo)
                            FROM Ticket_Rechazos r
                            WHERE r.id_ticket = t.id_ticket
                        ), CONVERT(DATETIME2, '19000101'))
                      ORDER BY s.fecha_solucion DESC) as ultima_solucion
              FROM Ticket_Tecnico tt
              JOIN Tickets t ON tt.id_ticket = t.id_ticket
              LEFT JOIN Usuarios u1 ON t.id_usuario_creador = u1.id_usuario
              LEFT JOIN Usuarios u2 ON t.id_tecnico_asignado = u2.id_usuario
              LEFT JOIN Areas a ON t.id_area = a.id_area
              LEFT JOIN Areas aa ON t.id_area_admin = aa.id_area
              WHERE tt.id_tecnico = @id_tecnico
                AND tt.activo = 1
                AND t.fecha_eliminacion IS NULL
              ORDER BY t.fecha_creacion DESC`);
    return result.recordset;
  }

  static async getSolutionsByTicketId(id_ticket, { onlyVisible = false } = {}) {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('id_ticket', sql.Int, id_ticket)
      .input('visible', sql.Bit, onlyVisible ? 1 : 0)
      .query(`SELECT s.id_solucion, s.id_ticket, s.id_tecnico, u.username as tecnico,
                     s.comentario, s.visible_usuario, s.fecha_solucion
              FROM Ticket_Soluciones s
              LEFT JOIN Usuarios u ON s.id_tecnico = u.id_usuario
              WHERE s.id_ticket = @id_ticket
                AND (@visible = 0 OR s.visible_usuario = 1)
                AND (
                    s.id_ticket_tecnico IS NULL
                    OR EXISTS (
                        SELECT 1
                        FROM Ticket_Tecnico tt
                        WHERE tt.id_ticket_tecnico = s.id_ticket_tecnico
                          AND tt.activo = 1
                    )
                )
                AND s.fecha_solucion > ISNULL((
                    SELECT MAX(r.fecha_rechazo)
                    FROM Ticket_Rechazos r
                    WHERE r.id_ticket = @id_ticket
                ), CONVERT(DATETIME2, '19000101'))
              ORDER BY s.fecha_solucion DESC`);

    const soluciones = result.recordset;
    for (const solucion of soluciones) {
      solucion.evidencias = await this.getSolutionEvidenciasBySolutionId(solucion.id_solucion);
    }

    return soluciones;
  }

  static async getSolutionEvidenciasBySolutionId(id_solucion) {
    const pool = await poolPromise;
    const tableName = await this.getSolutionEvidenceTableName();
    if (!tableName) return [];

    const result = await pool.request()
      .input('id_solucion', sql.Int, id_solucion)
      .query(`SELECT id_solucion_evidencia, id_solucion, ruta_archivo, nombre_original,
                     mime_type, tamano_bytes, orden, fecha_subida
              FROM dbo.${tableName}
              WHERE id_solucion = @id_solucion
                AND fecha_eliminacion IS NULL
              ORDER BY orden, fecha_subida`);
    return result.recordset;
  }

  static async addSolutionEvidencias(id_solucion, archivos = []) {
    const pool = await poolPromise;
    const limpias = archivos.filter(Boolean).slice(0, 5);
    const tableName = await this.getSolutionEvidenceTableName();

    if (limpias.length > 0 && !tableName) {
      throw new Error('Falta configurar la tabla de evidencias de solución del técnico.');
    }

    for (let index = 0; index < limpias.length; index++) {
      await pool.request()
        .input('id_solucion', sql.Int, id_solucion)
        .input('ruta', sql.NVarChar, limpias[index])
        .input('orden', sql.Int, index + 1)
        .query(`INSERT INTO dbo.${tableName} (id_solucion, ruta_archivo, nombre_original, orden)
                VALUES (@id_solucion, @ruta, @ruta, @orden)`);
    }
  }

  static async clearHoldNotesForAssignment(id_ticket_tecnico) {
    const pool = await poolPromise;
    const tableName = await this.getSolutionEvidenceTableName();

    if (tableName) {
      await pool.request()
        .input('id_ticket_tecnico', sql.Int, id_ticket_tecnico)
        .query(`DELETE se
                FROM dbo.${tableName} se
                JOIN Ticket_Soluciones s ON se.id_solucion = s.id_solucion
                WHERE s.id_ticket_tecnico = @id_ticket_tecnico
                  AND s.comentario LIKE '[[]ESPERA[]] %'`);
    }

    await pool.request()
      .input('id_ticket_tecnico', sql.Int, id_ticket_tecnico)
      .query(`DELETE FROM Ticket_Soluciones
              WHERE id_ticket_tecnico = @id_ticket_tecnico
                AND comentario LIKE '[[]ESPERA[]] %'`);
  }

  static async getSolutionEvidenceTableName() {
    const pool = await poolPromise;
    const candidates = [
      'Ticket_Solucion_Evidencias',
      'Ticket_Soluciones_Evidencias',
      'Ticket_Evidencias_Solucion'
    ];

    const result = await pool.request()
      .query(`SELECT name
              FROM sys.tables
              WHERE name IN (${candidates.map(name => `'${name}'`).join(',')})`);
    const found = result.recordset.map(row => row.name);
    return candidates.find(name => found.includes(name)) || null;
  }

  static async updateTicket({ id_ticket, id_usuario, role, titulo, descripcion, id_area, evidencias = [], replaceEvidencias = false }) {
    const pool = await poolPromise;
    const archivoPrincipal = evidencias[0] || null;
    const result = await pool.request()
      .input('id_ticket', sql.Int, id_ticket)
      .input('id_usuario', sql.Int, id_usuario)
      .input('titulo', sql.NVarChar, titulo || null)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('id_area', sql.Int, id_area || null)
      .input('archivo', sql.NVarChar, archivoPrincipal)
      .input('replace_evidencias', sql.Bit, replaceEvidencias ? 1 : 0)
      .input('is_admin', sql.Bit, role === 'admin' ? 1 : 0)
      .query(`UPDATE Tickets
              SET titulo = COALESCE(@titulo, titulo),
                  descripcion = COALESCE(@descripcion, descripcion),
                  id_area = COALESCE(@id_area, id_area),
                  id_area_solicitada = CASE WHEN @is_admin = 1 THEN COALESCE(@id_area, id_area_solicitada) ELSE id_area_solicitada END,
                  archivo = CASE WHEN @replace_evidencias = 1 THEN @archivo ELSE archivo END,
                  fecha_edicion = SYSDATETIME(),
                  editado_por = @id_usuario,
                  fecha_actualizacion = SYSDATETIME()
              WHERE id_ticket = @id_ticket
                AND fecha_eliminacion IS NULL
                AND (@is_admin = 1 OR id_usuario_creador = @id_usuario)
                AND (
                    @is_admin = 1
                    OR (
                        estado IN ('Pendiente_Asignacion', 'Pendiente')
                        AND NOT EXISTS (
                            SELECT 1
                            FROM Ticket_Tecnico
                            WHERE id_ticket = @id_ticket
                              AND activo = 1
                        )
                    )
                )`);

    if (result.rowsAffected[0] === 0) {
      throw new Error('No se pudo editar el ticket. Verifica permisos o estado del ticket.');
    }

    if (replaceEvidencias) {
      await this.replaceEvidencias(id_ticket, evidencias);
    }
  }

  static async deleteTicket({ id_ticket, id_usuario, role, motivo }) {
    const pool = await poolPromise;
    const permission = await pool.request()
      .input('id_ticket', sql.Int, id_ticket)
      .input('id_usuario', sql.Int, id_usuario)
      .input('is_admin', sql.Bit, role === 'admin' ? 1 : 0)
      .query(`SELECT id_ticket
              FROM Tickets
              WHERE id_ticket = @id_ticket
                AND fecha_eliminacion IS NULL
                AND (@is_admin = 1 OR id_usuario_creador = @id_usuario)
                AND (
                    @is_admin = 1
                    OR (
                        estado IN ('Pendiente_Asignacion', 'Pendiente')
                        AND NOT EXISTS (
                            SELECT 1
                            FROM Ticket_Tecnico
                            WHERE id_ticket = @id_ticket
                              AND activo = 1
                        )
                    )
                )`);

    if (!permission.recordset[0]) {
      throw new Error('No se pudo eliminar el ticket. Verifica permisos o estado del ticket.');
    }

    const solutionEvidenceTable = await this.getSolutionEvidenceTableName();
    if (solutionEvidenceTable) {
      await pool.request()
        .input('id_ticket', sql.Int, id_ticket)
        .query(`DELETE se
                FROM dbo.${solutionEvidenceTable} se
                JOIN Ticket_Soluciones s ON se.id_solucion = s.id_solucion
                WHERE s.id_ticket = @id_ticket`);
    }

    await pool.request()
      .input('id_ticket', sql.Int, id_ticket)
      .query(`DELETE FROM Ticket_Rechazos WHERE id_ticket = @id_ticket;
              IF OBJECT_ID('dbo.Notificaciones', 'U') IS NOT NULL
                  DELETE FROM Notificaciones WHERE id_ticket = @id_ticket;
              DELETE FROM Ticket_Soluciones WHERE id_ticket = @id_ticket;
              DELETE FROM Ticket_Tecnico WHERE id_ticket = @id_ticket;
              DELETE FROM Tickets_Evidencias WHERE id_ticket = @id_ticket;
              IF OBJECT_ID('dbo.Historial_Tickets', 'U') IS NOT NULL
                 AND COL_LENGTH('dbo.Historial_Tickets', 'id_ticket') IS NOT NULL
                  EXEC sp_executesql N'DELETE FROM Historial_Tickets WHERE id_ticket = @ticket',
                                     N'@ticket INT',
                                     @ticket = @id_ticket;
              DELETE FROM Tickets WHERE id_ticket = @id_ticket;`);
  }

  static async assignTechnicians({ id_ticket, tecnicoIds, id_area_admin, prioridad, asignado_por, comentario }) {
    const pool = await poolPromise;
    const estadoAnterior = await this.getCurrentStatus(id_ticket);
    const ids = [...new Set((Array.isArray(tecnicoIds) ? tecnicoIds : [tecnicoIds]).filter(Boolean).map(Number))];
    const prioridadesValidas = ['Baja', 'Media', 'Alta', 'Critica'];
    const prioridadFinal = String(prioridad || '').trim();

    if (ids.length === 0) throw new Error('Selecciona al menos un técnico');

    if (!prioridadesValidas.includes(prioridadFinal)) throw new Error('Selecciona la prioridad evaluada por el administrador');

    await pool.request()
      .input('id_ticket', sql.Int, id_ticket)
      .input('ids', sql.NVarChar, ids.join(','))
      .query(`UPDATE Ticket_Tecnico
              SET activo = 0,
                  estado_asignacion = CASE
                      WHEN estado_asignacion = 'Resuelto' THEN estado_asignacion
                      ELSE 'Rechazado'
                  END
              WHERE id_ticket = @id_ticket
                AND activo = 1
                AND id_tecnico NOT IN (
                    SELECT TRY_CAST(value AS INT)
                    FROM STRING_SPLIT(@ids, ',')
                    WHERE TRY_CAST(value AS INT) IS NOT NULL
                )`);

    for (const id_tecnico of ids) {
      await pool.request()
        .input('id_ticket', sql.Int, id_ticket)
        .input('id_tecnico', sql.Int, id_tecnico)
        .input('id_area', sql.Int, id_area_admin || null)
        .input('asignado_por', sql.Int, asignado_por)
        .input('comentario', sql.NVarChar, comentario || null)
        .query(`IF NOT EXISTS (
                    SELECT 1 FROM Ticket_Tecnico
                    WHERE id_ticket = @id_ticket
                      AND id_tecnico = @id_tecnico
                      AND activo = 1
                )
                INSERT INTO Ticket_Tecnico
                (id_ticket, id_tecnico, id_area_asignada, asignado_por, estado_asignacion, comentario_asignacion, fecha_asignacion, activo)
                VALUES (@id_ticket, @id_tecnico, @id_area, @asignado_por, 'Asignado', @comentario, SYSDATETIME(), 1)`);
    }

    await pool.request()
      .input('id_ticket', sql.Int, id_ticket)
      .input('id_tecnico_principal', sql.Int, ids[0])
      .input('id_area_admin', sql.Int, id_area_admin || null)
      .input('prioridad', sql.NVarChar, prioridadFinal)
      .query(`UPDATE Tickets
              SET id_tecnico_asignado = @id_tecnico_principal,
                  id_area_admin = COALESCE(@id_area_admin, id_area_admin),
                  id_area = COALESCE(@id_area_admin, id_area),
                  prioridad = @prioridad,
                  estado = CASE
                      WHEN estado IN ('Pendiente_Asignacion', 'Pendiente', 'En Espera') THEN 'Pendiente'
                      ELSE estado
                  END,
                  fecha_asignacion = COALESCE(fecha_asignacion, SYSDATETIME()),
                  fecha_actualizacion = SYSDATETIME()
              WHERE id_ticket = @id_ticket
                AND fecha_eliminacion IS NULL`);

    await pool.request()
      .input('id_ticket', sql.Int, id_ticket)
      .query(`UPDATE Ticket_Rechazos
              SET atendido = 1
              WHERE id_ticket = @id_ticket
                AND atendido = 0`);

    const estadoNuevo = await this.getCurrentStatus(id_ticket);
    await this.addHistory({
      id_ticket,
      id_usuario: asignado_por,
      estado_anterior: estadoAnterior,
      estado_nuevo: estadoNuevo,
      comentario: comentario || `Ticket asignado a ${ids.length} tecnico(s). Prioridad: ${prioridadFinal}.`
    });

    for (const id_tecnico of ids) {
      await this.notifyUser({
        id_usuario: id_tecnico,
        id_ticket,
        titulo: 'Ticket asignado',
        mensaje: `Se te asigno el ticket #${id_ticket}. Prioridad: ${prioridadFinal}.`
      });
    }
  }

  static async acceptAssignment({ id_ticket, id_tecnico }) {
    const pool = await poolPromise;
    const estadoAnterior = await this.getCurrentStatus(id_ticket);
    const result = await pool.request()
      .input('id_ticket', sql.Int, id_ticket)
      .input('id_tecnico', sql.Int, id_tecnico)
      .query(`UPDATE Ticket_Tecnico
              SET estado_asignacion = 'En Proceso',
                  fecha_aceptacion = COALESCE(fecha_aceptacion, SYSDATETIME()),
                  fecha_inicio = COALESCE(fecha_inicio, SYSDATETIME())
              WHERE id_ticket = @id_ticket
                AND id_tecnico = @id_tecnico
                AND activo = 1
                AND estado_asignacion IN ('Asignado', 'Aceptado');

              UPDATE Tickets
              SET estado = 'En Proceso',
                  id_tecnico_asignado = COALESCE(id_tecnico_asignado, @id_tecnico),
                  fecha_actualizacion = SYSDATETIME()
              WHERE id_ticket = @id_ticket
                AND fecha_eliminacion IS NULL;`);

    if (result.rowsAffected[0] === 0) {
      throw new Error('Ticket no encontrado o no asignado a ti');
    }

    await this.addHistory({
      id_ticket,
      id_usuario: id_tecnico,
      estado_anterior: estadoAnterior,
      estado_nuevo: 'En Proceso',
      comentario: 'El tecnico acepto la asignacion.'
    });
    await this.notifyAdmins({
      id_ticket,
      titulo: 'Tecnico acepto ticket',
      mensaje: `Un tecnico acepto el ticket #${id_ticket}.`
    });
  }

  static async resolveTicket({ id_ticket, id_tecnico, comentario, evidencias = [] }) {
    const pool = await poolPromise;
    const estadoAnterior = await this.getCurrentStatus(id_ticket);
    const texto = comentario && String(comentario).trim()
      ? String(comentario).trim()
      : 'Solución registrada por el técnico.';

    const assignment = await pool.request()
      .input('id_ticket', sql.Int, id_ticket)
      .input('id_tecnico', sql.Int, id_tecnico)
      .query(`SELECT TOP 1 id_ticket_tecnico, estado_asignacion
              FROM Ticket_Tecnico
              WHERE id_ticket = @id_ticket
                AND id_tecnico = @id_tecnico
                AND activo = 1`);

    const ticketTecnico = assignment.recordset[0];
    const idTicketTecnico = ticketTecnico?.id_ticket_tecnico;
    if (!idTicketTecnico) throw new Error('Ticket no asignado a este técnico.');

    if (String(ticketTecnico.estado_asignacion || '').toLowerCase().trim() === 'resuelto') {
      throw new Error('Ya registraste la solucion de este ticket.');
    }

    await this.clearHoldNotesForAssignment(idTicketTecnico);

    const solution = await pool.request()
      .input('id_ticket', sql.Int, id_ticket)
      .input('id_ticket_tecnico', sql.Int, idTicketTecnico)
      .input('id_tecnico', sql.Int, id_tecnico)
      .input('comentario', sql.NVarChar, texto)
      .query(`UPDATE Ticket_Tecnico
              SET estado_asignacion = 'Resuelto',
                  comentario_asignacion = NULL,
                  fecha_resolucion = SYSDATETIME()
              WHERE id_ticket_tecnico = @id_ticket_tecnico;

              INSERT INTO Ticket_Soluciones (id_ticket, id_ticket_tecnico, id_tecnico, comentario, visible_usuario, fecha_solucion)
              OUTPUT INSERTED.id_solucion
              VALUES (@id_ticket, @id_ticket_tecnico, @id_tecnico, @comentario, 1, SYSDATETIME());`);

    const idSolucion = solution.recordset[0]?.id_solucion;
    if (idSolucion && evidencias.length > 0) {
      const solutionEvidenceTable = await this.getSolutionEvidenceTableName();
      if (solutionEvidenceTable) await this.addSolutionEvidencias(idSolucion, evidencias);
      else throw new Error('Falta configurar la tabla de evidencias de solución del técnico.');
    }
    await this.recalculateTicketResolution(id_ticket, texto);
    const estadoNuevo = await this.getCurrentStatus(id_ticket);
    await this.addHistory({
      id_ticket,
      id_usuario: id_tecnico,
      estado_anterior: estadoAnterior,
      estado_nuevo: estadoNuevo,
      comentario: `Solucion registrada por tecnico: ${texto}`
    });
    const ownerId = await this.getTicketOwnerId(id_ticket);
    if (estadoNuevo === 'Resuelto') {
      await this.notifyUser({
        id_usuario: ownerId,
        id_ticket,
        titulo: 'Ticket resuelto',
        mensaje: `El ticket #${id_ticket} ya esta listo para que aceptes o rechaces la solucion.`
      });
    } else {
      await this.notifyAdmins({
        id_ticket,
        titulo: 'Solucion parcial registrada',
        mensaje: `Un tecnico registro solucion en el ticket #${id_ticket}, pero aun faltan tecnicos por resolver.`
      });
    }
  }

  static async putAssignmentOnHold({ id_ticket, id_tecnico, motivo, evidencias = [] }) {
    const pool = await poolPromise;
    const texto = motivo && String(motivo).trim()
      ? String(motivo).trim()
      : 'Atencion en espera.';
    const estadoAnterior = await this.getCurrentStatus(id_ticket);

    const assignment = await pool.request()
      .input('id_ticket', sql.Int, id_ticket)
      .input('id_tecnico', sql.Int, id_tecnico)
      .query(`SELECT TOP 1 id_ticket_tecnico
              FROM Ticket_Tecnico
              WHERE id_ticket = @id_ticket
                AND id_tecnico = @id_tecnico
                AND activo = 1
                AND estado_asignacion IN ('Asignado', 'En Proceso', 'En Espera')
              ORDER BY fecha_asignacion DESC`);

    const idTicketTecnico = assignment.recordset[0]?.id_ticket_tecnico;
    if (!idTicketTecnico) {
      throw new Error('Ticket no asignado a ti o no disponible para poner en espera.');
    }

    if (evidencias.length > 0 && !await this.getSolutionEvidenceTableName()) {
      throw new Error('Falta configurar la tabla de evidencias de espera del tecnico.');
    }

    let result;
    try {
      result = await pool.request()
        .input('id_ticket', sql.Int, id_ticket)
        .input('id_tecnico', sql.Int, id_tecnico)
        .input('motivo', sql.NVarChar, texto)
        .query(`UPDATE Ticket_Tecnico
                SET estado_asignacion = 'En Espera',
                    comentario_asignacion = @motivo
                WHERE id_ticket = @id_ticket
                  AND id_tecnico = @id_tecnico
                  AND activo = 1
                  AND estado_asignacion IN ('Asignado', 'En Proceso', 'En Espera');

                UPDATE Tickets
                SET fecha_actualizacion = SYSDATETIME()
                WHERE id_ticket = @id_ticket
                  AND fecha_eliminacion IS NULL;`);
    } catch (error) {
      result = await pool.request()
        .input('id_ticket', sql.Int, id_ticket)
        .input('id_tecnico', sql.Int, id_tecnico)
        .input('motivo', sql.NVarChar, `[ESPERA] ${texto}`)
        .query(`UPDATE Ticket_Tecnico
                SET comentario_asignacion = @motivo
                WHERE id_ticket = @id_ticket
                  AND id_tecnico = @id_tecnico
                  AND activo = 1
                  AND estado_asignacion IN ('Asignado', 'En Proceso');

                UPDATE Tickets
                SET fecha_actualizacion = SYSDATETIME()
                WHERE id_ticket = @id_ticket
                  AND fecha_eliminacion IS NULL;`);
    }

    if (result.rowsAffected[0] === 0) {
      throw new Error('Ticket no asignado a ti o no disponible para poner en espera.');
    }

    const hold = await pool.request()
      .input('id_ticket', sql.Int, id_ticket)
      .input('id_ticket_tecnico', sql.Int, idTicketTecnico)
      .input('id_tecnico', sql.Int, id_tecnico)
      .input('motivo', sql.NVarChar, `[ESPERA] ${texto}`)
      .query(`INSERT INTO Ticket_Soluciones (id_ticket, id_ticket_tecnico, id_tecnico, comentario, visible_usuario, fecha_solucion)
              OUTPUT INSERTED.id_solucion
              VALUES (@id_ticket, @id_ticket_tecnico, @id_tecnico, @motivo, 1, SYSDATETIME());`);

    const idSolucion = hold.recordset[0]?.id_solucion;
    if (!idSolucion) {
      throw new Error('No se pudo registrar el motivo de espera.');
    }

    if (evidencias.length > 0) {
      await this.addSolutionEvidencias(idSolucion, evidencias);
    }

    await this.addHistory({
      id_ticket,
      id_usuario: id_tecnico,
      estado_anterior: estadoAnterior,
      estado_nuevo: 'En Espera',
      comentario: `Atencion en espera: ${texto}`
    });
    await this.notifyAdmins({
      id_ticket,
      titulo: 'Ticket en espera',
      mensaje: `Un tecnico puso en espera el ticket #${id_ticket}: ${texto}`
    });
  }

  static async recalculateTicketResolution(id_ticket, notas_tecnico = null) {
    const pool = await poolPromise;
    await pool.request()
      .input('id_ticket', sql.Int, id_ticket)
      .input('notas_tecnico', sql.NVarChar, notas_tecnico)
      .query(`UPDATE Tickets
              SET estado = CASE
                      WHEN NOT EXISTS (
                          SELECT 1
                          FROM Ticket_Tecnico
                          WHERE id_ticket = @id_ticket
                            AND activo = 1
                            AND estado_asignacion <> 'Resuelto'
                      ) THEN 'Resuelto'
                      WHEN EXISTS (
                          SELECT 1
                          FROM Ticket_Tecnico
                          WHERE id_ticket = @id_ticket
                            AND activo = 1
                            AND estado_asignacion <> 'Resuelto'
                      ) THEN 'En Proceso'
                      ELSE estado
                  END,
                  fecha_resolucion = CASE
                      WHEN EXISTS (
                          SELECT 1
                          FROM Ticket_Tecnico
                          WHERE id_ticket = @id_ticket
                            AND activo = 1
                            AND estado_asignacion <> 'Resuelto'
                      ) THEN fecha_resolucion
                      ELSE COALESCE(fecha_resolucion, SYSDATETIME())
                  END,
                  notas_tecnico = COALESCE(@notas_tecnico, notas_tecnico),
                  fecha_actualizacion = SYSDATETIME()
              WHERE id_ticket = @id_ticket
                AND fecha_eliminacion IS NULL`);
  }

  static async rejectTicket({ id_ticket, id_usuario, comentario }) {
    const pool = await poolPromise;
    const estadoAnterior = await this.getCurrentStatus(id_ticket);
    if (estadoAnterior !== 'Resuelto') throw new Error('Solo puedes rechazar un ticket resuelto.');
    const texto = comentario && String(comentario).trim()
      ? String(comentario).trim()
      : 'El usuario rechazó la atención.';

    await pool.request()
      .input('id_ticket', sql.Int, id_ticket)
      .input('id_usuario', sql.Int, id_usuario)
      .input('comentario', sql.NVarChar, texto)
      .query(`INSERT INTO Ticket_Rechazos (id_ticket, id_usuario, comentario, fecha_rechazo, atendido)
              VALUES (@id_ticket, @id_usuario, @comentario, SYSDATETIME(), 0);

              UPDATE Tickets
              SET estado = 'Pendiente_Asignacion',
                  id_tecnico_asignado = NULL,
                  fecha_rechazo = SYSDATETIME(),
                  fecha_actualizacion = SYSDATETIME()
              WHERE id_ticket = @id_ticket
                AND fecha_eliminacion IS NULL;

              UPDATE Ticket_Tecnico
              SET activo = 0,
                  estado_asignacion = 'Rechazado'
              WHERE id_ticket = @id_ticket
                AND activo = 1;

              UPDATE Ticket_Soluciones
              SET visible_usuario = 0
              WHERE id_ticket = @id_ticket;`);

    await this.addHistory({
      id_ticket,
      id_usuario,
      estado_anterior: estadoAnterior,
      estado_nuevo: 'Pendiente_Asignacion',
      comentario: `Usuario rechazo la solucion: ${texto}`
    });
    await this.notifyAdmins({
      id_ticket,
      titulo: 'Solucion rechazada',
      mensaje: `El usuario rechazo la solucion del ticket #${id_ticket}: ${texto}`
    });
  }

  static async aprobarTicket(id, id_usuario) {
    const pool = await poolPromise;
    const estadoAnterior = await this.getCurrentStatus(id);
    if (estadoAnterior !== 'Resuelto') throw new Error('Solo puedes cerrar un ticket resuelto.');
    await pool.request()
      .input('id', sql.Int, id)
      .query(`UPDATE Tickets
              SET estado = 'Cerrado',
                  fecha_cierre = SYSDATETIME(),
                  fecha_actualizacion = SYSDATETIME()
              WHERE id_ticket = @id
                AND fecha_eliminacion IS NULL`);
    await this.addHistory({
      id_ticket: id,
      id_usuario,
      estado_anterior: estadoAnterior,
      estado_nuevo: 'Cerrado',
      comentario: 'El usuario acepto la solucion y cerro el ticket.'
    });
    await this.notifyAdmins({
      id_ticket: id,
      titulo: 'Ticket cerrado',
      mensaje: `El usuario acepto la solucion y cerro el ticket #${id}.`
    });
  }

  static async rechazarTicket(id, id_usuario, comentario) {
    await this.rejectTicket({ id_ticket: id, id_usuario, comentario });
  }
}
