import bcrypt from 'bcrypt';

const password = '4321';
const saltRounds = 10; // Asegúrate de que coincida con tu SALT_ROUND

bcrypt.hash(password, saltRounds, (err, hash) => {
    if (err) throw err;
    console.log('✅ ESTE ES EL HASH QUE DEBES COPIAR:', hash);
});