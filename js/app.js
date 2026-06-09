const MODULOS = [
  { id: "asistencia", nombre: "Asistencia Trujillo", descripcion: "Control diario, reportes y regularizacion de asistencia.", ruta: "modules/anc-asistencia/index.html?integrado=1", icono: "AS" },
  { id: "asignacion", nombre: "Asignacion Operacional", descripcion: "Cobertura, reserva, paletero y productos sin stock.", ruta: "modules/asignacion-independiente/index.html?integrado=1", icono: "AO" },
  { id: "bi", nombre: "Reporte Operacional", descripcion: "Indicadores ejecutivos de picking, recepcion, despacho y pedido.", ruta: "modules/dashboard-bi/index.html?integrado=1", icono: "BI" },
  { id: "operaciones", nombre: "Control Operativo", descripcion: "Inventario, LPNs, ubicaciones, slotting y bloqueo.", ruta: "modules/operaciones-independiente/index.html?integrado=1", icono: "CO" },
  { id: "tareas", nombre: "Tareas Asignacion", descripcion: "Seguimiento de tareas y reportes desde asignacion.", ruta: "modules/tareas-asignacion/index.html?integrado=1", icono: "TA" }
];

const USUARIOS = [
  { user: "admin", passHash: "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4", nombre: "Administrador" },
  { user: "operador", passHash: "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4", nombre: "Operador" }
];
const SESION_KEY = "anc_panel_usuario";
const DURACION_SESION_MS = 12 * 60 * 60 * 1000;
const modulosCargados = new Set();
let precargaProgramada = false;

async function sha256(texto) {
  const bytes = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function renderNavegacion() {
  const inicio = `<button id="navInicio" class="active" onclick="mostrarInicio()" title="Panel principal"><span class="nav-icon">IN</span><span class="nav-label">Panel principal</span></button>`;
  document.getElementById("moduleNav").innerHTML = inicio + MODULOS.map(modulo =>
    `<button id="nav-${modulo.id}" onclick="abrirModulo('${modulo.id}')" title="${modulo.nombre}"><span class="nav-icon">${modulo.icono}</span><span class="nav-label">${modulo.nombre}</span></button>`
  ).join("");

  document.getElementById("moduleGrid").innerHTML = MODULOS.map(modulo => `
    <button class="module-card" onclick="abrirModulo('${modulo.id}')">
      <span class="card-icon">${modulo.icono}</span>
      <strong>${modulo.nombre}</strong>
      <span>${modulo.descripcion}</span>
      <em>Abrir modulo</em>
    </button>
  `).join("");
}

function seleccionarNav(id) {
  document.querySelectorAll("#moduleNav button").forEach(button => button.classList.remove("active"));
  const activo = document.getElementById(id);
  if (activo) activo.classList.add("active");
}

function mostrarInicio() {
  document.getElementById("homeView").hidden = false;
  document.getElementById("moduleView").hidden = true;
  document.getElementById("homeButton").hidden = true;
  document.getElementById("pageTitle").textContent = "Panel principal";
  document.getElementById("pageSubtitle").textContent = "Selecciona un modulo para comenzar";
  seleccionarNav("navInicio");
}

function obtenerFrame(modulo) {
  let frame = document.getElementById(`frame-${modulo.id}`);
  if (frame) return frame;

  frame = document.createElement("iframe");
  frame.id = `frame-${modulo.id}`;
  frame.className = "module-frame";
  frame.title = modulo.nombre;
  frame.hidden = true;
  frame.src = modulo.ruta;
  document.getElementById("moduleFrames").appendChild(frame);
  modulosCargados.add(modulo.id);
  return frame;
}

function ocultarFrames() {
  document.querySelectorAll(".module-frame").forEach(frame => {
    frame.hidden = true;
  });
}

function abrirModulo(id) {
  const modulo = MODULOS.find(item => item.id === id);
  if (!modulo) return;
  ocultarFrames();
  obtenerFrame(modulo).hidden = false;
  document.getElementById("homeView").hidden = true;
  document.getElementById("moduleView").hidden = false;
  document.getElementById("homeButton").hidden = false;
  document.getElementById("pageTitle").textContent = modulo.nombre;
  document.getElementById("pageSubtitle").textContent = modulo.descripcion;
  seleccionarNav(`nav-${id}`);
}

function precargarModulos() {
  if (precargaProgramada) return;
  precargaProgramada = true;

  MODULOS.forEach((modulo, indice) => {
    setTimeout(() => {
      const sesionActiva = !document.getElementById("appView").hidden;
      if (sesionActiva && !modulosCargados.has(modulo.id)) obtenerFrame(modulo);
    }, 1200 + indice * 1800);
  });
}

async function login(event) {
  event.preventDefault();
  const user = document.getElementById("usuario").value.trim();
  const passHash = await sha256(document.getElementById("password").value);
  const valido = USUARIOS.find(item => item.user === user && item.passHash === passHash);
  if (!valido) {
    document.getElementById("loginError").textContent = "Usuario o contrasena incorrecta.";
    return;
  }
  const sesion = { user: valido.user, nombre: valido.nombre, expira: Date.now() + DURACION_SESION_MS };
  localStorage.setItem(SESION_KEY, JSON.stringify(sesion));
  mostrarApp(sesion);
}

function mostrarApp(usuario) {
  document.getElementById("loginView").hidden = true;
  document.getElementById("appView").hidden = false;
  document.getElementById("usuarioActivo").textContent = usuario.nombre || usuario.user;
  mostrarInicio();
  precargarModulos();
}

function logout() {
  localStorage.removeItem(SESION_KEY);
  document.getElementById("moduleFrames").innerHTML = "";
  modulosCargados.clear();
  precargaProgramada = false;
  document.getElementById("appView").hidden = true;
  document.getElementById("loginView").hidden = false;
  document.getElementById("password").value = "";
}

function cargarSesion() {
  const raw = localStorage.getItem(SESION_KEY);
  if (!raw) return;
  try {
    const usuario = JSON.parse(raw);
    if (!usuario.expira || Date.now() > usuario.expira) return logout();
    mostrarApp(usuario);
  } catch (error) {
    logout();
  }
}

window.addEventListener("message", event => {
  if (event.origin === location.origin && event.data === "anc-panel-logout") logout();
});

renderNavegacion();
cargarSesion();
