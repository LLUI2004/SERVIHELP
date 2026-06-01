SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('dbo.Ticket_Solucion_Evidencias', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Ticket_Solucion_Evidencias (
        id_solucion_evidencia INT IDENTITY(1,1) NOT NULL,
        id_solucion INT NOT NULL,
        ruta_archivo NVARCHAR(500) NOT NULL,
        nombre_original NVARCHAR(255) NULL,
        mime_type NVARCHAR(100) NULL,
        tamano_bytes BIGINT NULL,
        orden INT NOT NULL CONSTRAINT DF_Ticket_Solucion_Evidencias_orden DEFAULT 1,
        fecha_subida DATETIME2(0) NOT NULL CONSTRAINT DF_Ticket_Solucion_Evidencias_fecha DEFAULT SYSDATETIME(),
        fecha_eliminacion DATETIME2(0) NULL,
        CONSTRAINT PK_Ticket_Solucion_Evidencias PRIMARY KEY (id_solucion_evidencia),
        CONSTRAINT FK_Ticket_Solucion_Evidencias_Soluciones
            FOREIGN KEY (id_solucion) REFERENCES dbo.Ticket_Soluciones(id_solucion)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_Ticket_Solucion_Evidencias_solucion_orden'
      AND object_id = OBJECT_ID('dbo.Ticket_Solucion_Evidencias')
)
BEGIN
    CREATE INDEX IX_Ticket_Solucion_Evidencias_solucion_orden
    ON dbo.Ticket_Solucion_Evidencias(id_solucion, orden, fecha_subida)
    WHERE fecha_eliminacion IS NULL;
END;
GO

;WITH EvidenciasTecnico AS (
    SELECT
        s.id_solucion,
        te.id_evidencia,
        te.ruta_archivo,
        te.nombre_original,
        te.mime_type,
        te.tamano_bytes,
        ROW_NUMBER() OVER (
            PARTITION BY s.id_solucion
            ORDER BY te.fecha_subida, te.id_evidencia
        ) AS orden
    FROM dbo.Ticket_Soluciones s
    JOIN dbo.Tickets_Evidencias te
      ON te.id_ticket = s.id_ticket
     AND te.fecha_eliminacion IS NULL
     AND te.fecha_subida >= DATEADD(MINUTE, -2, s.fecha_solucion)
     AND te.fecha_subida <= DATEADD(MINUTE, 10, s.fecha_solucion)
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.Ticket_Solucion_Evidencias se
        WHERE se.id_solucion = s.id_solucion
          AND se.ruta_archivo = te.ruta_archivo
          AND se.fecha_eliminacion IS NULL
    )
)
INSERT INTO dbo.Ticket_Solucion_Evidencias
    (id_solucion, ruta_archivo, nombre_original, mime_type, tamano_bytes, orden)
SELECT id_solucion, ruta_archivo, nombre_original, mime_type, tamano_bytes, orden
FROM EvidenciasTecnico;
GO

UPDATE te
SET fecha_eliminacion = SYSDATETIME()
FROM dbo.Tickets_Evidencias te
WHERE te.fecha_eliminacion IS NULL
  AND EXISTS (
      SELECT 1
      FROM dbo.Ticket_Soluciones s
      WHERE s.id_ticket = te.id_ticket
        AND te.fecha_subida >= DATEADD(MINUTE, -2, s.fecha_solucion)
        AND te.fecha_subida <= DATEADD(MINUTE, 10, s.fecha_solucion)
  );
GO
