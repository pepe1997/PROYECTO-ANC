const usuarios = [
  { user: "admin", passHash: "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4", nombre: "Administrador" },
  { user: "operador", passHash: "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4", nombre: "Operador" }
];

const DURACION_SESION_MS = 12 * 60 * 60 * 1000;
const MODO_INTEGRADO = new URLSearchParams(location.search).get("integrado") === "1";

function cargarSesionPrincipal() {
  if (!MODO_INTEGRADO) return null;
  try {
    const usuario = JSON.parse(localStorage.getItem("anc_panel_usuario"));
    if (!usuario || !usuario.expira || Date.now() > usuario.expira) return null;
    return usuario;
  } catch (error) {
    return null;
  }
}

async function sha256(texto) {
  const bytes = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function login(event) {
  event.preventDefault();
  const user = document.getElementById("usuario").value.trim();
  const pass = document.getElementById("password").value;
  const passHash = await sha256(pass);
  const valido = usuarios.find(x => x.user === user && x.passHash === passHash);

  if (!valido) {
    document.getElementById("loginError").textContent = "Usuario o contrasena incorrecta.";
    return;
  }

  localStorage.setItem("operaciones_usuario", JSON.stringify({
    user: valido.user,
    nombre: valido.nombre,
    expira: Date.now() + DURACION_SESION_MS
  }));
  mostrarApp(valido);
  iniciarAplicacion();
}

function mostrarApp(usuario) {
  document.getElementById("loginView").hidden = true;
  document.getElementById("appView").hidden = false;
  document.getElementById("usuarioActivo").textContent = usuario.nombre || usuario.user;
}

function mostrarLogin() {
  document.getElementById("loginView").hidden = false;
  document.getElementById("appView").hidden = true;
}

function logout() {
  if (MODO_INTEGRADO) {
    parent.postMessage("anc-panel-logout", location.origin);
    return;
  }
  localStorage.removeItem("operaciones_usuario");
  mostrarLogin();
}

function cargarSesion() {
  const sesionPrincipal = cargarSesionPrincipal();
  if (sesionPrincipal) {
    mostrarApp(sesionPrincipal);
    iniciarAplicacion();
    return;
  }

  const raw = localStorage.getItem("operaciones_usuario");
  if (!raw) return mostrarLogin();

  try {
    const usuario = JSON.parse(raw);
    if (!usuario.expira || Date.now() > usuario.expira) {
      localStorage.removeItem("operaciones_usuario");
      mostrarLogin();
      return;
    }

    mostrarApp(usuario);
    iniciarAplicacion();
  } catch (error) {
    localStorage.removeItem("operaciones_usuario");
    mostrarLogin();
  }
}

cargarSesion();
