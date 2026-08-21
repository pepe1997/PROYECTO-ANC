const USUARIO_RF = "SCANER";
const PASSWORD_RF = "1234";
const SESION_RF_KEY = "anc_rf_usuario";
const DURACION_SESION_MS = 12 * 60 * 60 * 1000;

let scannerStream = null;
let scannerDetector = null;
let scannerActivo = false;

function htmlSeguro(valor) {
  return limpiar(valor).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function cargarSesionRf() {
  try {
    const sesion = JSON.parse(localStorage.getItem(SESION_RF_KEY) || "null");
    if (!sesion || Date.now() > sesion.expira) return null;
    return sesion;
  } catch {
    return null;
  }
}

function mostrarApp() {
  document.getElementById("loginView").hidden = true;
  document.getElementById("appView").hidden = false;
  recargarDatos();
}

function mostrarLogin() {
  document.getElementById("loginView").hidden = false;
  document.getElementById("appView").hidden = true;
  setTimeout(() => document.getElementById("usuario")?.focus(), 80);
}

function login(event) {
  event.preventDefault();
  const user = normalizar(document.getElementById("usuario").value);
  const pass = limpiar(document.getElementById("password").value);
  if (user !== USUARIO_RF || pass !== PASSWORD_RF) {
    document.getElementById("loginError").textContent = "Usuario o contrasena incorrecta.";
    return;
  }
  localStorage.setItem(SESION_RF_KEY, JSON.stringify({ user: USUARIO_RF, expira: Date.now() + DURACION_SESION_MS }));
  mostrarApp();
}

function logout() {
  detenerCamara();
  localStorage.removeItem(SESION_RF_KEY);
  document.getElementById("password").value = "";
  mostrarLogin();
}

function enfocarLpn() {
  setTimeout(() => {
    const input = document.getElementById("lpnInput");
    if (input) {
      input.focus();
      input.select();
    }
  }, 80);
}

function buscarLpnManual(event) {
  event.preventDefault();
  buscarLpn(document.getElementById("lpnInput").value);
}

function buscarLpn(valor) {
  const lpn = normalizar(valor);
  if (!lpn) return enfocarLpn();
  if (!datosListos) {
    mostrarMensaje("Data aun cargando", "Espera unos segundos y vuelve a escanear.");
    return;
  }
  const rows = dataLPN.filter(row => normalizar(row.lpn) === lpn);
  if (!rows.length) {
    mostrarMensaje("LPN no encontrado", lpn, true);
    document.getElementById("lpnInput").value = "";
    return enfocarLpn();
  }
  renderLpn(rows);
  document.getElementById("lpnInput").value = "";
  enfocarLpn();
}

function tonoEstado(estado, ubicacion) {
  const e = normalizar(estado);
  const u = normalizar(ubicacion);
  if (e.includes("UBIC") && u.startsWith("MASS")) return "ok";
  if (!u) return "warn";
  if (u.includes("PLUS") || u.includes("DROP")) return "warn";
  return "";
}

function renderLpn(rows) {
  const first = rows[0];
  const totalBultos = rows.reduce((a, b) => a + b.bultos, 0);
  const totalUnidades = rows.reduce((a, b) => a + (b.unidades || b.bultos), 0);
  const codigos = new Set(rows.map(r => r.codigo).filter(Boolean)).size;
  const ubicacion = first.ubicacion || "SIN UBICACION";
  const estadoLpn = first.estado || "SIN ESTADO";
  const tono = tonoEstado(estadoLpn, ubicacion);

  document.getElementById("resultado").innerHTML = `
    <article class="resultado-card">
      <div class="result-head">
        <span>LPN consultado</span>
        <strong>${htmlSeguro(first.lpn)}</strong>
      </div>
      <div class="status-row">
        <div class="mini-kpi ${tono}">
          <span>Ubicacion</span>
          <strong>${htmlSeguro(ubicacion)}</strong>
        </div>
        <div class="mini-kpi ${tono}">
          <span>Estado</span>
          <strong>${htmlSeguro(estadoLpn)}</strong>
        </div>
        <div class="mini-kpi">
          <span>Bultos</span>
          <strong>${fmt(totalBultos)}</strong>
        </div>
        <div class="mini-kpi">
          <span>Codigos</span>
          <strong>${fmt(codigos)}</strong>
        </div>
      </div>
      <div class="product-list">
        ${rows.map(row => `
          <div class="product-row">
            <h3>${htmlSeguro(row.codigo || "-")} ${row.codigoAlt ? `| ${htmlSeguro(row.codigoAlt)}` : ""}</h3>
            <p>${htmlSeguro(row.descripcion || "Sin descripcion")}</p>
            <div class="product-metrics">
              <b>${fmt(row.bultos)}<small>Bultos</small></b>
              <b>${fmt(row.unidades || row.bultos)}<small>Unidades</small></b>
              <b>${htmlSeguro(row.fecha || "-")}<small>Fecha</small></b>
            </div>
          </div>
        `).join("")}
        <div class="product-row">
          <h3>Total LPN</h3>
          <div class="product-metrics">
            <b>${fmt(totalBultos)}<small>Bultos</small></b>
            <b>${fmt(totalUnidades)}<small>Unidades</small></b>
            <b>${fmt(rows.length)}<small>Lineas</small></b>
          </div>
        </div>
      </div>
    </article>
  `;
}

function mostrarMensaje(titulo, detalle = "", alerta = false) {
  document.getElementById("resultado").innerHTML = `
    <div class="empty-state ${alerta ? "not-found" : ""}">
      <strong>${htmlSeguro(titulo)}</strong>
      <span>${htmlSeguro(detalle)}</span>
    </div>
  `;
}

async function alternarCamara() {
  if (scannerActivo) {
    detenerCamara();
    return;
  }
  await iniciarCamara();
}

async function iniciarCamara() {
  const estado = document.getElementById("scannerEstado");
  if (!("BarcodeDetector" in window)) {
    estado.textContent = "Este navegador no soporta lectura por camara. Usa pistola RF o digita el LPN.";
    return;
  }
  try {
    scannerDetector = new BarcodeDetector({ formats: ["code_128", "code_39", "ean_13", "qr_code"] });
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    const video = document.getElementById("scannerVideo");
    video.srcObject = scannerStream;
    await video.play();
    document.getElementById("cameraBox").hidden = false;
    document.getElementById("btnCamara").textContent = "Cerrar";
    estado.textContent = "Apunta al codigo de barras del LPN.";
    scannerActivo = true;
    detectarLoop();
  } catch (error) {
    estado.textContent = "No se pudo abrir la camara. Usa el campo de busqueda.";
  }
}

async function detectarLoop() {
  if (!scannerActivo || !scannerDetector) return;
  const video = document.getElementById("scannerVideo");
  try {
    const codes = await scannerDetector.detect(video);
    const valor = codes[0]?.rawValue || "";
    if (valor) {
      buscarLpn(valor);
      detenerCamara();
      return;
    }
  } catch (error) {}
  requestAnimationFrame(detectarLoop);
}

function detenerCamara() {
  scannerActivo = false;
  if (scannerStream) {
    scannerStream.getTracks().forEach(track => track.stop());
    scannerStream = null;
  }
  document.getElementById("cameraBox").hidden = true;
  document.getElementById("btnCamara").textContent = "Camara";
  document.getElementById("scannerEstado").textContent = "La pistola RF tambien funciona en el campo de busqueda.";
  enfocarLpn();
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) detenerCamara();
});

if (cargarSesionRf()) mostrarApp();
else mostrarLogin();
