const SHEET_ID = "1-v6vXjHpLlIn0-_lVZw0BtGopnxSHH0zqoOrW8aBwcg";

let dataPedido = [];
let dataLPN = [];
let dataQuiebre = [];
let dataProductos = [];
let dataInventario = [];
let datosListos = false;

async function cargarHoja(nombre) {
  try {
    const url = `https://opensheet.elk.sh/${SHEET_ID}/${nombre}`;
    try {
      if (location.protocol === "file:") throw new Error("carga local");
      if (window.parent !== window && typeof window.parent.ancCargarJson === "function") {
        return await window.parent.ancCargarJson(url);
      }
    } catch (error) {}
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Respuesta ${res.status}`);
    return res.json();
  } catch (error) {
    throw new Error(`No se pudo cargar la hoja ${nombre}. Revisa internet, permisos del Google Sheet o abre la app desde el servidor local.`);
  }
}

async function cargarOpcional(nombre) {
  try {
    return await cargarHoja(nombre);
  } catch (error) {
    console.warn(`Hoja opcional no cargada: ${nombre}`, error);
    return [];
  }
}

async function cargarDatos() {
  datosListos = false;
  actualizarEstadoCarga("Cargando pedido y LPNs...");

  const [pedido, lpns, quiebres, productos, inventario] = await Promise.all([
    cargarHoja("PEDIDO"),
    cargarHoja("LPNS"),
    cargarOpcional("QUIEBRES"),
    cargarOpcional("PRODUCTOS"),
    cargarOpcional("INV_ACTIVO")
  ]);

  dataPedido = pedido;
  dataLPN = lpns;
  dataQuiebre = quiebres;
  dataProductos = productos;
  dataInventario = inventario;
  datosListos = true;

  actualizarEstadoCarga(`${dataPedido.length} pedidos | ${dataLPN.length} LPNs | ${dataInventario.length} activos`);
}

function actualizarEstadoCarga(texto) {
  const el = document.getElementById("estadoCarga");
  if (el) el.textContent = texto;
}

async function recargarDatos() {
  cacheAsignacion = null;
  mapaLPN = new Map();
  window.simulacionAsignacion = null;
  document.getElementById("modulo").innerHTML = `<div class="loading">Actualizando datos...</div>`;

  try {
    await cargarDatos();
    abrirAsignacion();
  } catch (error) {
    mostrarError(error);
  }
}

function mostrarError(error) {
  console.error(error);
  actualizarEstadoCarga("Error de carga");
  const mensaje = typeof htmlSeguro === "function"
    ? htmlSeguro(error.message || error)
    : String(error.message || error || "");
  document.getElementById("modulo").innerHTML = `
    <div class="error-box">
      <strong>No se pudieron cargar los datos.</strong>
      <p>${mensaje}</p>
      <button onclick="recargarDatos()">Intentar de nuevo</button>
    </div>
  `;
}

async function iniciarAplicacion() {
  document.getElementById("modulo").innerHTML = `<div class="loading">Cargando datos...</div>`;

  try {
    await cargarDatos();
    abrirAsignacion();
  } catch (error) {
    mostrarError(error);
  }
}
