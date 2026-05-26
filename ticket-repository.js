import { poolPromise } from './db.js';
import sql from 'mssql';

export class TicketRepository {

static async createTicket({ titulo, descripcion, prioridad, id_area, id_usuario_creador, archivo }) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('t', sql.NVarChar, titulo)
        .input('d', sql.NVarChar, descripcion)
        .input('p', sql.NVarChar, prioridad)
        .input('ida', sql.Int, id_area) // Recibimos el ID numérico
        .input('u', sql.Int, id_usuario_creador)
        .input('a', sql.NVarChar, archivo)
        .query(`INSERT INTO Tickets (titulo, descripcion, prioridad, id_area, id_usuario_creador, archivo, estado) 
                OUTPUT INSERTED.id_ticket
                VALUES (@t, @d, @p, @ida, @u, @a, 'Pendiente_Asignacion')`);
    return result.recordset[0].id_ticket;
}

 static async getTicketsByUserId(id_usuario) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('u', sql.Int, id_usuario)
        .query(`SELECT t.id_ticket, t.titulo, t.descripcion, t.prioridad, t.fecha_creacion, 
                       t.estado, t.archivo, t.id_tecnico_asignado,
                       a.nombre_area -- Añadido para consistencia
                FROM Tickets t
                LEFT JOIN Areas a ON t.id_area = a.id_area
                WHERE t.id_usuario_creador = @u
                ORDER BY t.fecha_creacion DESC`);
    return result.recordset;
}

    static async getTicketById(id) {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query(`SELECT id_ticket, titulo, descripcion, prioridad, fecha_creacion, estado, archivo, id_tecnico_asignado 
                    FROM Tickets 
                    WHERE id_ticket = @id`);
        return result.recordset[0];
    }
    
   // En ticket-repository.js
static async getAllTickets() {
    const pool = await poolPromise;
    const result = await pool.request()
        .query(`SELECT t.id_ticket, t.titulo, t.descripcion, t.prioridad, t.estado, 
                       t.id_tecnico_asignado, t.archivo, t.fecha_creacion,
                       u1.username as usuario_creador,
                       u2.username as tecnico_asignado,
                       a.nombre_area -- <--- Agregamos el nombre del área
                FROM Tickets t
                LEFT JOIN Usuarios u1 ON t.id_usuario_creador = u1.id_usuario
                LEFT JOIN Usuarios u2 ON t.id_tecnico_asignado = u2.id_usuario
                LEFT JOIN Areas a ON t.id_area = a.id_area -- <--- El JOIN clave
                ORDER BY t.fecha_creacion DESC`);
    return result.recordset;
}

// Método para Aprobar (Cerrar el ticket)
    static async aprobarTicket(id) {
        const pool = await poolPromise;
        await pool.request()
            .input('id', sql.Int, id)
            .query(`UPDATE Tickets SET estado = 'Cerrado' WHERE id_ticket = @id`);
    }

    // Método para Rechazar (Regresar a Pendiente_Asignacion y quitar técnico)
    static async rechazarTicket(id) {
        const pool = await poolPromise;
        await pool.request()
            .input('id', sql.Int, id)
            .query(`UPDATE Tickets SET estado = 'Pendiente_Asignacion', id_tecnico_asignado = NULL WHERE id_ticket = @id`);
    }

}