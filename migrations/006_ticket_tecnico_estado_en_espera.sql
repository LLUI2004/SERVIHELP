IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = 'CK_Ticket_Tecnico_estado'
      AND parent_object_id = OBJECT_ID('dbo.Ticket_Tecnico')
)
BEGIN
    ALTER TABLE dbo.Ticket_Tecnico DROP CONSTRAINT CK_Ticket_Tecnico_estado;
END;
GO

ALTER TABLE dbo.Ticket_Tecnico
ADD CONSTRAINT CK_Ticket_Tecnico_estado
CHECK (estado_asignacion IN (
    'Asignado',
    'Aceptado',
    'En Proceso',
    'En Espera',
    'Resuelto',
    'Rechazado',
    'Cancelado'
));
GO
