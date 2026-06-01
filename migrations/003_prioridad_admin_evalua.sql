DECLARE @constraintName SYSNAME;
DECLARE @sql NVARCHAR(MAX);

SELECT @constraintName = cc.name
FROM sys.check_constraints cc
JOIN sys.tables t ON cc.parent_object_id = t.object_id
JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE s.name = 'dbo'
  AND t.name = 'Tickets'
  AND cc.definition LIKE '%prioridad%';

IF @constraintName IS NOT NULL
BEGIN
    SET @sql = N'ALTER TABLE dbo.Tickets DROP CONSTRAINT ' + QUOTENAME(@constraintName) + N';';
    EXEC sp_executesql @sql;
END;
GO

ALTER TABLE dbo.Tickets
ADD CONSTRAINT CK_Tickets_prioridad
CHECK (prioridad IN ('Sin evaluar', 'Baja', 'Media', 'Alta', 'Critica'));
GO
