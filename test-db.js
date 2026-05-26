import sql from 'mssql';

const config = {
    user: 'LuisMLF',
    password: 'AdminProyec2026!', // Usa la contraseña que resetearon
    server: 'proyec.database.windows.net',
    database: 'master',
    options: { encrypt: true, trustServerCertificate: false }
};

async function testConnection() {
    try {
        let pool = await sql.connect(config);
        console.log("¡ÉXITO! Conexión establecida.");
        pool.close();
    } catch (err) {
        console.log("DETALLE DEL ERROR:", err.message);
        console.log("CÓDIGO DE ERROR:", err.code);
    }
}

testConnection();