INSERT INTO dbo.Historial_Tickets
    (id_ticket, id_usuario_cambio, estado_anterior, estado_nuevo, comentario, fecha_cambio)
SELECT
    t.id_ticket,
    t.id_usuario_creador,
    'Registro inicial',
    t.estado,
    'Historial inicial generado para tickets existentes.',
    SYSDATETIME()
FROM dbo.Tickets t
WHERE t.fecha_eliminacion IS NULL
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.Historial_Tickets h
      WHERE h.id_ticket = t.id_ticket
  );
GO
