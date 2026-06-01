IF OBJECT_ID('dbo.Notificaciones', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Notificaciones (
        id_notificacion INT IDENTITY(1,1) NOT NULL,
        id_usuario INT NOT NULL,
        id_ticket INT NULL,
        titulo NVARCHAR(120) NOT NULL,
        mensaje NVARCHAR(500) NOT NULL,
        leida BIT NOT NULL CONSTRAINT DF_Notificaciones_leida DEFAULT 0,
        fecha_creacion DATETIME2(0) NOT NULL CONSTRAINT DF_Notificaciones_fecha DEFAULT SYSDATETIME(),
        CONSTRAINT PK_Notificaciones PRIMARY KEY (id_notificacion),
        CONSTRAINT FK_Notificaciones_Usuarios FOREIGN KEY (id_usuario) REFERENCES dbo.Usuarios(id_usuario),
        CONSTRAINT FK_Notificaciones_Tickets FOREIGN KEY (id_ticket) REFERENCES dbo.Tickets(id_ticket)
    );
END;
GO

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IX_Notificaciones_usuario_leida_fecha'
      AND object_id = OBJECT_ID('dbo.Notificaciones')
)
BEGIN
    CREATE INDEX IX_Notificaciones_usuario_leida_fecha
    ON dbo.Notificaciones(id_usuario, leida, fecha_creacion DESC);
END;
GO
