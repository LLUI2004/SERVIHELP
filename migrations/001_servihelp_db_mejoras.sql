/*
  ServiHelp - Migracion base de datos v2
  Azure SQL / SQL Server

  Notas:
  - No borra datos.
  - Mantiene columnas legacy: Tickets.archivo y Tickets.id_tecnico_asignado.
  - Ejecutar primero:
      IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
      GO
*/

/* =========================================================
   1. Usuarios, areas de especialidad y recuperacion
   ========================================================= */

IF COL_LENGTH('dbo.Usuarios', 'correo') IS NULL
BEGIN
    ALTER TABLE dbo.Usuarios ADD correo NVARCHAR(255) NULL;
END;
GO

IF COL_LENGTH('dbo.Usuarios', 'id_area') IS NULL
BEGIN
    ALTER TABLE dbo.Usuarios ADD id_area INT NULL;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Usuarios_Areas')
BEGIN
    ALTER TABLE dbo.Usuarios
    ADD CONSTRAINT FK_Usuarios_Areas
    FOREIGN KEY (id_area) REFERENCES dbo.Areas(id_area);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_Usuarios_correo'
      AND object_id = OBJECT_ID('dbo.Usuarios')
)
BEGIN
    CREATE UNIQUE INDEX UX_Usuarios_correo
    ON dbo.Usuarios(correo)
    WHERE correo IS NOT NULL;
END;
GO

IF OBJECT_ID('dbo.Usuario_Area', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Usuario_Area (
        id_usuario_area INT IDENTITY(1,1) NOT NULL,
        id_usuario INT NOT NULL,
        id_area INT NOT NULL,
        es_principal BIT NOT NULL,
        fecha_registro DATETIME2(0) NOT NULL,
        activo BIT NOT NULL,
        CONSTRAINT PK_Usuario_Area PRIMARY KEY (id_usuario_area)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE name = 'DF_Usuario_Area_es_principal'
)
BEGIN
    ALTER TABLE dbo.Usuario_Area
    ADD CONSTRAINT DF_Usuario_Area_es_principal DEFAULT 0 FOR es_principal;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE name = 'DF_Usuario_Area_fecha'
)
BEGIN
    ALTER TABLE dbo.Usuario_Area
    ADD CONSTRAINT DF_Usuario_Area_fecha DEFAULT SYSDATETIME() FOR fecha_registro;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE name = 'DF_Usuario_Area_activo'
)
BEGIN
    ALTER TABLE dbo.Usuario_Area
    ADD CONSTRAINT DF_Usuario_Area_activo DEFAULT 1 FOR activo;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Usuario_Area_Usuarios')
BEGIN
    ALTER TABLE dbo.Usuario_Area
    ADD CONSTRAINT FK_Usuario_Area_Usuarios
    FOREIGN KEY (id_usuario) REFERENCES dbo.Usuarios(id_usuario);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Usuario_Area_Areas')
BEGIN
    ALTER TABLE dbo.Usuario_Area
    ADD CONSTRAINT FK_Usuario_Area_Areas
    FOREIGN KEY (id_area) REFERENCES dbo.Areas(id_area);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_Usuario_Area_activa'
      AND object_id = OBJECT_ID('dbo.Usuario_Area')
)
BEGIN
    CREATE UNIQUE INDEX UX_Usuario_Area_activa
    ON dbo.Usuario_Area(id_usuario, id_area)
    WHERE activo = 1;
END;
GO

IF OBJECT_ID('dbo.Password_Reset_Tokens', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Password_Reset_Tokens (
        id_reset INT IDENTITY(1,1) NOT NULL,
        id_usuario INT NOT NULL,
        token_hash NVARCHAR(255) NOT NULL,
        fecha_creacion DATETIME2(0) NOT NULL,
        fecha_expiracion DATETIME2(0) NOT NULL,
        fecha_uso DATETIME2(0) NULL,
        usado BIT NOT NULL,
        solicitado_por_ip NVARCHAR(45) NULL,
        user_agent NVARCHAR(255) NULL,
        CONSTRAINT PK_Password_Reset_Tokens PRIMARY KEY (id_reset)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_Password_Reset_Tokens_fecha_creacion')
BEGIN
    ALTER TABLE dbo.Password_Reset_Tokens
    ADD CONSTRAINT DF_Password_Reset_Tokens_fecha_creacion DEFAULT SYSDATETIME() FOR fecha_creacion;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_Password_Reset_Tokens_usado')
BEGIN
    ALTER TABLE dbo.Password_Reset_Tokens
    ADD CONSTRAINT DF_Password_Reset_Tokens_usado DEFAULT 0 FOR usado;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Password_Reset_Tokens_Usuarios')
BEGIN
    ALTER TABLE dbo.Password_Reset_Tokens
    ADD CONSTRAINT FK_Password_Reset_Tokens_Usuarios
    FOREIGN KEY (id_usuario) REFERENCES dbo.Usuarios(id_usuario);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Password_Reset_Tokens_usuario_activo'
      AND object_id = OBJECT_ID('dbo.Password_Reset_Tokens')
)
BEGIN
    CREATE INDEX IX_Password_Reset_Tokens_usuario_activo
    ON dbo.Password_Reset_Tokens(id_usuario, usado, fecha_expiracion);
END;
GO

/* =========================================================
   2. Tickets: areas, fechas y auditoria CRUD
   ========================================================= */

IF COL_LENGTH('dbo.Tickets', 'id_area_solicitada') IS NULL
BEGIN
    ALTER TABLE dbo.Tickets ADD id_area_solicitada INT NULL;
END;
GO

IF COL_LENGTH('dbo.Tickets', 'id_area_admin') IS NULL
BEGIN
    ALTER TABLE dbo.Tickets ADD id_area_admin INT NULL;
END;
GO

IF COL_LENGTH('dbo.Tickets', 'fecha_asignacion') IS NULL
BEGIN
    ALTER TABLE dbo.Tickets ADD fecha_asignacion DATETIME2(0) NULL;
END;
GO

IF COL_LENGTH('dbo.Tickets', 'fecha_resolucion') IS NULL
BEGIN
    ALTER TABLE dbo.Tickets ADD fecha_resolucion DATETIME2(0) NULL;
END;
GO

IF COL_LENGTH('dbo.Tickets', 'fecha_cierre') IS NULL
BEGIN
    ALTER TABLE dbo.Tickets ADD fecha_cierre DATETIME2(0) NULL;
END;
GO

IF COL_LENGTH('dbo.Tickets', 'fecha_rechazo') IS NULL
BEGIN
    ALTER TABLE dbo.Tickets ADD fecha_rechazo DATETIME2(0) NULL;
END;
GO

IF COL_LENGTH('dbo.Tickets', 'fecha_edicion') IS NULL
BEGIN
    ALTER TABLE dbo.Tickets ADD fecha_edicion DATETIME2(0) NULL;
END;
GO

IF COL_LENGTH('dbo.Tickets', 'editado_por') IS NULL
BEGIN
    ALTER TABLE dbo.Tickets ADD editado_por INT NULL;
END;
GO

IF COL_LENGTH('dbo.Tickets', 'fecha_eliminacion') IS NULL
BEGIN
    ALTER TABLE dbo.Tickets ADD fecha_eliminacion DATETIME2(0) NULL;
END;
GO

IF COL_LENGTH('dbo.Tickets', 'eliminado_por') IS NULL
BEGIN
    ALTER TABLE dbo.Tickets ADD eliminado_por INT NULL;
END;
GO

IF COL_LENGTH('dbo.Tickets', 'motivo_eliminacion') IS NULL
BEGIN
    ALTER TABLE dbo.Tickets ADD motivo_eliminacion NVARCHAR(500) NULL;
END;
GO

UPDATE dbo.Tickets
SET id_area_solicitada = id_area
WHERE id_area_solicitada IS NULL
  AND id_area IS NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Tickets_Areas_Solicitada')
BEGIN
    ALTER TABLE dbo.Tickets
    ADD CONSTRAINT FK_Tickets_Areas_Solicitada
    FOREIGN KEY (id_area_solicitada) REFERENCES dbo.Areas(id_area);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Tickets_Areas_Admin')
BEGIN
    ALTER TABLE dbo.Tickets
    ADD CONSTRAINT FK_Tickets_Areas_Admin
    FOREIGN KEY (id_area_admin) REFERENCES dbo.Areas(id_area);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Tickets_EditadoPor')
BEGIN
    ALTER TABLE dbo.Tickets
    ADD CONSTRAINT FK_Tickets_EditadoPor
    FOREIGN KEY (editado_por) REFERENCES dbo.Usuarios(id_usuario);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Tickets_EliminadoPor')
BEGIN
    ALTER TABLE dbo.Tickets
    ADD CONSTRAINT FK_Tickets_EliminadoPor
    FOREIGN KEY (eliminado_por) REFERENCES dbo.Usuarios(id_usuario);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.Tickets')
      AND parent_column_id = COLUMNPROPERTY(OBJECT_ID('dbo.Tickets'), 'prioridad', 'ColumnId')
)
BEGIN
    ALTER TABLE dbo.Tickets
    ADD CONSTRAINT DF_Tickets_prioridad DEFAULT 'Media' FOR prioridad;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Tickets_estado_area'
      AND object_id = OBJECT_ID('dbo.Tickets')
)
BEGIN
    CREATE INDEX IX_Tickets_estado_area
    ON dbo.Tickets(estado, id_area, fecha_creacion)
    WHERE fecha_eliminacion IS NULL;
END;
GO

/* =========================================================
   3. Multi-asignacion
   ========================================================= */

IF OBJECT_ID('dbo.Ticket_Tecnico', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Ticket_Tecnico (
        id_ticket_tecnico INT IDENTITY(1,1) NOT NULL,
        id_ticket INT NOT NULL,
        id_tecnico INT NOT NULL,
        id_area_asignada INT NULL,
        asignado_por INT NULL,
        estado_asignacion NVARCHAR(30) NOT NULL,
        comentario_asignacion NVARCHAR(500) NULL,
        fecha_asignacion DATETIME2(0) NOT NULL,
        fecha_aceptacion DATETIME2(0) NULL,
        fecha_inicio DATETIME2(0) NULL,
        fecha_resolucion DATETIME2(0) NULL,
        activo BIT NOT NULL,
        CONSTRAINT PK_Ticket_Tecnico PRIMARY KEY (id_ticket_tecnico)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_Ticket_Tecnico_estado')
BEGIN
    ALTER TABLE dbo.Ticket_Tecnico
    ADD CONSTRAINT DF_Ticket_Tecnico_estado DEFAULT 'Asignado' FOR estado_asignacion;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_Ticket_Tecnico_fecha_asignacion')
BEGIN
    ALTER TABLE dbo.Ticket_Tecnico
    ADD CONSTRAINT DF_Ticket_Tecnico_fecha_asignacion DEFAULT SYSDATETIME() FOR fecha_asignacion;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_Ticket_Tecnico_activo')
BEGIN
    ALTER TABLE dbo.Ticket_Tecnico
    ADD CONSTRAINT DF_Ticket_Tecnico_activo DEFAULT 1 FOR activo;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Ticket_Tecnico_estado')
BEGIN
    ALTER TABLE dbo.Ticket_Tecnico
    ADD CONSTRAINT CK_Ticket_Tecnico_estado
    CHECK (estado_asignacion IN ('Asignado', 'Aceptado', 'En Proceso', 'Resuelto', 'Rechazado', 'Cancelado'));
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Ticket_Tecnico_Tickets')
BEGIN
    ALTER TABLE dbo.Ticket_Tecnico
    ADD CONSTRAINT FK_Ticket_Tecnico_Tickets
    FOREIGN KEY (id_ticket) REFERENCES dbo.Tickets(id_ticket);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Ticket_Tecnico_Tecnico')
BEGIN
    ALTER TABLE dbo.Ticket_Tecnico
    ADD CONSTRAINT FK_Ticket_Tecnico_Tecnico
    FOREIGN KEY (id_tecnico) REFERENCES dbo.Usuarios(id_usuario);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Ticket_Tecnico_Area')
BEGIN
    ALTER TABLE dbo.Ticket_Tecnico
    ADD CONSTRAINT FK_Ticket_Tecnico_Area
    FOREIGN KEY (id_area_asignada) REFERENCES dbo.Areas(id_area);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Ticket_Tecnico_AsignadoPor')
BEGIN
    ALTER TABLE dbo.Ticket_Tecnico
    ADD CONSTRAINT FK_Ticket_Tecnico_AsignadoPor
    FOREIGN KEY (asignado_por) REFERENCES dbo.Usuarios(id_usuario);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'UX_Ticket_Tecnico_activo'
      AND object_id = OBJECT_ID('dbo.Ticket_Tecnico')
)
BEGIN
    CREATE UNIQUE INDEX UX_Ticket_Tecnico_activo
    ON dbo.Ticket_Tecnico(id_ticket, id_tecnico)
    WHERE activo = 1;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Ticket_Tecnico_tecnico_estado'
      AND object_id = OBJECT_ID('dbo.Ticket_Tecnico')
)
BEGIN
    CREATE INDEX IX_Ticket_Tecnico_tecnico_estado
    ON dbo.Ticket_Tecnico(id_tecnico, estado_asignacion, activo, fecha_asignacion);
END;
GO

INSERT INTO dbo.Ticket_Tecnico (
    id_ticket,
    id_tecnico,
    id_area_asignada,
    asignado_por,
    estado_asignacion,
    fecha_asignacion,
    fecha_aceptacion,
    fecha_inicio,
    fecha_resolucion,
    activo
)
SELECT
    t.id_ticket,
    t.id_tecnico_asignado,
    t.id_area,
    NULL,
    CASE
        WHEN t.estado = 'Pendiente' THEN 'Asignado'
        WHEN t.estado = 'En Proceso' THEN 'En Proceso'
        WHEN t.estado = 'Resuelto' THEN 'Resuelto'
        WHEN t.estado = 'Cerrado' THEN 'Resuelto'
        ELSE 'Asignado'
    END,
    COALESCE(CONVERT(DATETIME2(0), t.fecha_asignacion), CONVERT(DATETIME2(0), t.fecha_actualizacion), SYSDATETIME()),
    CASE WHEN t.estado IN ('En Proceso', 'Resuelto', 'Cerrado') THEN CONVERT(DATETIME2(0), t.fecha_actualizacion) ELSE NULL END,
    CASE WHEN t.estado IN ('En Proceso', 'Resuelto', 'Cerrado') THEN CONVERT(DATETIME2(0), t.fecha_actualizacion) ELSE NULL END,
    CASE WHEN t.estado IN ('Resuelto', 'Cerrado') THEN CONVERT(DATETIME2(0), t.fecha_actualizacion) ELSE NULL END,
    1
FROM dbo.Tickets t
WHERE t.id_tecnico_asignado IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.Ticket_Tecnico tt
      WHERE tt.id_ticket = t.id_ticket
        AND tt.id_tecnico = t.id_tecnico_asignado
        AND tt.activo = 1
  );
GO

/* =========================================================
   4. Soluciones y rechazos
   ========================================================= */

IF OBJECT_ID('dbo.Ticket_Soluciones', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Ticket_Soluciones (
        id_solucion INT IDENTITY(1,1) NOT NULL,
        id_ticket INT NOT NULL,
        id_ticket_tecnico INT NULL,
        id_tecnico INT NOT NULL,
        comentario NVARCHAR(MAX) NOT NULL,
        visible_usuario BIT NOT NULL,
        fecha_solucion DATETIME2(0) NOT NULL,
        CONSTRAINT PK_Ticket_Soluciones PRIMARY KEY (id_solucion)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_Ticket_Soluciones_visible_usuario')
BEGIN
    ALTER TABLE dbo.Ticket_Soluciones
    ADD CONSTRAINT DF_Ticket_Soluciones_visible_usuario DEFAULT 1 FOR visible_usuario;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_Ticket_Soluciones_fecha')
BEGIN
    ALTER TABLE dbo.Ticket_Soluciones
    ADD CONSTRAINT DF_Ticket_Soluciones_fecha DEFAULT SYSDATETIME() FOR fecha_solucion;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Ticket_Soluciones_Tickets')
BEGIN
    ALTER TABLE dbo.Ticket_Soluciones
    ADD CONSTRAINT FK_Ticket_Soluciones_Tickets
    FOREIGN KEY (id_ticket) REFERENCES dbo.Tickets(id_ticket);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Ticket_Soluciones_TicketTecnico')
BEGIN
    ALTER TABLE dbo.Ticket_Soluciones
    ADD CONSTRAINT FK_Ticket_Soluciones_TicketTecnico
    FOREIGN KEY (id_ticket_tecnico) REFERENCES dbo.Ticket_Tecnico(id_ticket_tecnico);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Ticket_Soluciones_Tecnico')
BEGIN
    ALTER TABLE dbo.Ticket_Soluciones
    ADD CONSTRAINT FK_Ticket_Soluciones_Tecnico
    FOREIGN KEY (id_tecnico) REFERENCES dbo.Usuarios(id_usuario);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Ticket_Soluciones_ticket_fecha'
      AND object_id = OBJECT_ID('dbo.Ticket_Soluciones')
)
BEGIN
    CREATE INDEX IX_Ticket_Soluciones_ticket_fecha
    ON dbo.Ticket_Soluciones(id_ticket, fecha_solucion DESC);
END;
GO

IF OBJECT_ID('dbo.Ticket_Rechazos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Ticket_Rechazos (
        id_rechazo INT IDENTITY(1,1) NOT NULL,
        id_ticket INT NOT NULL,
        id_usuario INT NOT NULL,
        comentario NVARCHAR(MAX) NOT NULL,
        fecha_rechazo DATETIME2(0) NOT NULL,
        atendido BIT NOT NULL,
        CONSTRAINT PK_Ticket_Rechazos PRIMARY KEY (id_rechazo)
    );
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_Ticket_Rechazos_fecha')
BEGIN
    ALTER TABLE dbo.Ticket_Rechazos
    ADD CONSTRAINT DF_Ticket_Rechazos_fecha DEFAULT SYSDATETIME() FOR fecha_rechazo;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = 'DF_Ticket_Rechazos_atendido')
BEGIN
    ALTER TABLE dbo.Ticket_Rechazos
    ADD CONSTRAINT DF_Ticket_Rechazos_atendido DEFAULT 0 FOR atendido;
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Ticket_Rechazos_Tickets')
BEGIN
    ALTER TABLE dbo.Ticket_Rechazos
    ADD CONSTRAINT FK_Ticket_Rechazos_Tickets
    FOREIGN KEY (id_ticket) REFERENCES dbo.Tickets(id_ticket);
END;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Ticket_Rechazos_Usuarios')
BEGIN
    ALTER TABLE dbo.Ticket_Rechazos
    ADD CONSTRAINT FK_Ticket_Rechazos_Usuarios
    FOREIGN KEY (id_usuario) REFERENCES dbo.Usuarios(id_usuario);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Ticket_Rechazos_ticket_fecha'
      AND object_id = OBJECT_ID('dbo.Ticket_Rechazos')
)
BEGIN
    CREATE INDEX IX_Ticket_Rechazos_ticket_fecha
    ON dbo.Ticket_Rechazos(id_ticket, fecha_rechazo DESC);
END;
GO

/* =========================================================
   5. Evidencias multiples
   ========================================================= */

IF COL_LENGTH('dbo.Tickets_Evidencias', 'nombre_original') IS NULL
BEGIN
    ALTER TABLE dbo.Tickets_Evidencias ADD nombre_original NVARCHAR(255) NULL;
END;
GO

IF COL_LENGTH('dbo.Tickets_Evidencias', 'mime_type') IS NULL
BEGIN
    ALTER TABLE dbo.Tickets_Evidencias ADD mime_type NVARCHAR(100) NULL;
END;
GO

IF COL_LENGTH('dbo.Tickets_Evidencias', 'tamano_bytes') IS NULL
BEGIN
    ALTER TABLE dbo.Tickets_Evidencias ADD tamano_bytes BIGINT NULL;
END;
GO

IF COL_LENGTH('dbo.Tickets_Evidencias', 'orden') IS NULL
BEGIN
    ALTER TABLE dbo.Tickets_Evidencias ADD orden INT NULL;
END;
GO

UPDATE dbo.Tickets_Evidencias
SET orden = 1
WHERE orden IS NULL;
GO

ALTER TABLE dbo.Tickets_Evidencias
ALTER COLUMN orden INT NOT NULL;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID('dbo.Tickets_Evidencias')
      AND parent_column_id = COLUMNPROPERTY(OBJECT_ID('dbo.Tickets_Evidencias'), 'orden', 'ColumnId')
)
BEGIN
    ALTER TABLE dbo.Tickets_Evidencias
    ADD CONSTRAINT DF_Tickets_Evidencias_orden DEFAULT 1 FOR orden;
END;
GO

IF COL_LENGTH('dbo.Tickets_Evidencias', 'fecha_eliminacion') IS NULL
BEGIN
    ALTER TABLE dbo.Tickets_Evidencias ADD fecha_eliminacion DATETIME2(0) NULL;
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Tickets_Evidencias_ticket_orden'
      AND object_id = OBJECT_ID('dbo.Tickets_Evidencias')
)
BEGIN
    CREATE INDEX IX_Tickets_Evidencias_ticket_orden
    ON dbo.Tickets_Evidencias(id_ticket, orden, fecha_subida)
    WHERE fecha_eliminacion IS NULL;
END;
GO

IF OBJECT_ID('dbo.TR_Tickets_Evidencias_Max5', 'TR') IS NOT NULL
BEGIN
    DROP TRIGGER dbo.TR_Tickets_Evidencias_Max5;
END;
GO

CREATE TRIGGER dbo.TR_Tickets_Evidencias_Max5
ON dbo.Tickets_Evidencias
AFTER INSERT, UPDATE
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (
        SELECT te.id_ticket
        FROM dbo.Tickets_Evidencias te
        WHERE te.fecha_eliminacion IS NULL
          AND te.id_ticket IN (SELECT DISTINCT id_ticket FROM inserted)
        GROUP BY te.id_ticket
        HAVING COUNT(*) > 5
    )
    BEGIN
        RAISERROR('Un ticket no puede tener mas de 5 evidencias activas.', 16, 1);
        ROLLBACK TRANSACTION;
        RETURN;
    END;
END;
GO

INSERT INTO dbo.Tickets_Evidencias (id_ticket, ruta_archivo, nombre_original, orden)
SELECT t.id_ticket, t.archivo, t.archivo, 1
FROM dbo.Tickets t
WHERE t.archivo IS NOT NULL
  AND LTRIM(RTRIM(t.archivo)) <> ''
  AND NOT EXISTS (
      SELECT 1
      FROM dbo.Tickets_Evidencias te
      WHERE te.id_ticket = t.id_ticket
        AND te.ruta_archivo = t.archivo
        AND te.fecha_eliminacion IS NULL
  );
GO

/* =========================================================
   6. Verificacion
   ========================================================= */

SELECT 'Ticket_Tecnico' AS tabla, COUNT(*) AS registros FROM dbo.Ticket_Tecnico
UNION ALL
SELECT 'Ticket_Soluciones', COUNT(*) FROM dbo.Ticket_Soluciones
UNION ALL
SELECT 'Ticket_Rechazos', COUNT(*) FROM dbo.Ticket_Rechazos
UNION ALL
SELECT 'Password_Reset_Tokens', COUNT(*) FROM dbo.Password_Reset_Tokens
UNION ALL
SELECT 'Tickets_Evidencias', COUNT(*) FROM dbo.Tickets_Evidencias;
GO
