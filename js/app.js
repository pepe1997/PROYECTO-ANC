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
const cacheDatosCompartidos = new Map();
let precargaProgramada = false;
let actualizacionGeneralActiva = false;

async function ancCargarRecurso(url, tipo = "json") {
  const key = `${tipo}:${url}`;
  if (!cacheDatosCompartidos.has(key)) {
    cacheDatosCompartidos.set(key, fetch(url, { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText || ""}`.trim());
      return tipo === "text" ? response.text() : response.json();
    }).catch(error => {
      cacheDatosCompartidos.delete(key);
      throw error;
    }));
  }
  return cacheDatosCompartidos.get(key);
}

window.ancCargarJson = async url => structuredClone(await ancCargarRecurso(url, "json"));
window.ancCargarTexto = url => ancCargarRecurso(url, "text");

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
  frame.addEventListener("load", () => {
    frame.dataset.loaded = "1";
  });
  frame.src = modulo.ruta;
  document.getElementById("moduleFrames").appendChild(frame);
  modulosCargados.add(modulo.id);
  return frame;
}

function esperarFrame(frame) {
  if (frame.dataset.loaded === "1") return Promise.resolve(frame);
  return new Promise(resolve => frame.addEventListener("load", () => resolve(frame), { once: true }));
}

async function actualizarTodo() {
  if (actualizacionGeneralActiva) return;
  actualizacionGeneralActiva = true;
  const boton = document.getElementById("globalRefreshButton");
  if (boton) {
    boton.disabled = true;
    boton.textContent = "Leyendo Google Sheets...";
  }

  // Solo renueva la data externa. No elimina avances, ajustes ni historial local.
  cacheDatosCompartidos.clear();
  const frames = MODULOS.map(obtenerFrame);
  await Promise.all(frames.map(esperarFrame));
  const resultados = await Promise.allSettled(frames.map(frame => {
    try {
      const win = frame.contentWindow;
      if (typeof win.recargarDatos === "function") return win.recargarDatos();
      if (typeof win.cargarDatos === "function") return win.cargarDatos();
    } catch (error) {
      const ruta = frame.getAttribute("src");
      frame.dataset.loaded = "";
      frame.src = ruta;
      return esperarFrame(frame);
    }
    return Promise.resolve();
  }));

  actualizacionGeneralActiva = false;
  if (boton) {
    boton.disabled = false;
    boton.textContent = resultados.some(x => x.status === "rejected") ? "Actualizar con errores" : "Datos actualizados";
    setTimeout(() => {
      if (boton && !actualizacionGeneralActiva) boton.textContent = "Actualizar datos";
    }, 2200);
  }
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
