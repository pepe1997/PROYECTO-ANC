const usuarios = [
  { user: "admin", pass: "1234", nombre: "Administrador" },
  { user: "operador", pass: "1234", nombre: "Operador" }
];
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

function login(event) {
  event.preventDefault();
  const user = document.getElementById("usuario").value.trim();
  const pass = document.getElementById("password").value.trim();
  const valido = usuarios.find(x => x.user === user && x.pass === pass);

  if (!valido) {
    document.getElementById("loginError").textContent = "Usuario o contrasena incorrecta.";
    return;
  }

  localStorage.setItem("dashboard_bi_usuario", JSON.stringify({ user: valido.user, nombre: valido.nombre }));
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
  localStorage.removeItem("dashboard_bi_usuario");
  mostrarLogin();
}

function cargarSesion() {
  const sesionPrincipal = cargarSesionPrincipal();
  if (sesionPrincipal) {
    mostrarApp(sesionPrincipal);
    iniciarAplicacion();
    return;
  }

  const raw = localStorage.getItem("dashboard_bi_usuario");
  if (!raw) return mostrarLogin();

  try {
    const usuario = JSON.parse(raw);
    mostrarApp(usuario);
    iniciarAplicacion();
  } catch (error) {
    localStorage.removeItem("dashboard_bi_usuario");
    mostrarLogin();
  }
}

cargarSesion();
