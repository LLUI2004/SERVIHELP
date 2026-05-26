import sql from 'mssql';

const config = {
    user: 'LuisMLF@proyec', // <--- Prueba añadiendo @nombre-de-tu-servidor
    password: 'AdminProyec2026!',
    server: 'proyec.database.windows.net',
    database: 'ServiHelp',
    options: {
        encrypt: true,
        instanceName: '',
        trustServerCertificate: false
   
    }
};

export const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log('¡Conectado exitosamente a la base de datos en Azure!');
        return pool;
    })
    .catch(err => {
        console.error('Error de conexión:', err);
    });
    export { sql };