UPDATE s
SET visible_usuario = 0
FROM dbo.Ticket_Soluciones s
WHERE EXISTS (
    SELECT 1
    FROM dbo.Ticket_Rechazos r
    WHERE r.id_ticket = s.id_ticket
      AND s.fecha_solucion <= r.fecha_rechazo
);

SELECT @@ROWCOUNT AS soluciones_ocultadas;
