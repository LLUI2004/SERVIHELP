const $ = id => document.getElementById(id);
let isLogin = true;

// Cambiar entre la interfaz de Login y de Registro
$('change-mode').addEventListener('click', () => {
  isLogin = !isLogin;
  $('form-title').innerText = isLogin ? 'Inicia sesión para continuar' : 'Crea una cuenta nueva';
  $('btn-text').innerText = isLogin ? 'Ingresar' : 'Registrarse';
  $('toggle-text').innerText = isLogin ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?';
  $('change-mode').innerText = isLogin ? 'Regístrate aquí' : 'Inicia sesión';
  
  $('msg').innerText = '';
  $('msg').classList.remove('msg-success', 'msg-error');
});

// Enviar el formulario (Login / Registro) hacia el Servidor
$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const endpoint = isLogin ? '/login' : '/register';
  const body = { 
    username: $('username').value, 
    password: $('password').value 
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    // SOLUCIÓN AL ERROR DE PARSEO: Validamos si la respuesta es JSON antes de leerla
    let data = {};
    const contentType = res.headers.get("content-type");
    
    if (contentType && contentType.includes("application/json")) {
      data = await res.json();
    } else {
      // Si el servidor responde con texto plano en caso de un error de validación
      const textError = await res.text();
      data = { error: textError };
    }

    if (res.ok) {
      if (isLogin) {
        // CORRECCIÓN: Redirección inteligente de triple vía alineada con index.js
        const userRole = data.user && data.user.role ? data.user.role.toLowerCase().trim() : 'user';

        if (userRole === 'admin') {
          window.location.href = '/panel-admin';
        } else if (userRole === 'tecnico') {
          window.location.href = '/panel-tecnico';
        } else {
          window.location.href = '/panel-usuario';
        }
        
      } else {
        $('msg').classList.remove('msg-error');
        $('msg').classList.add('msg-success');
        $('msg').innerText = '¡Registro exitoso! Ya puedes iniciar sesión.';
        $('auth-form').reset();
      }
    } else {
      // Manejo controlado de los errores lanzados por el backend
      $('msg').classList.remove('msg-success');
      $('msg').classList.add('msg-error');
      $('msg').innerText = data.error || 'Ocurrió un error con tus credenciales';
    }
  } catch (err) {
    $('msg').classList.remove('msg-success');
    $('msg').classList.add('msg-error');
    $('msg').innerText = 'Error de conexión con el servidor';
    console.error(err);
  }
});