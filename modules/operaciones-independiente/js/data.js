const SHEET_ID = "1-v6vXjHpLlIn0-_lVZw0BtGopnxSHH0zqoOrW8aBwcg";

let dataLPN = [];
let dataProductos = [];
let dataPedido = [];
let dataInventario = [];
let dataUbicaciones = [];
let dataBloqueo = [];
let datosListos = false;
let advertenciasCarga = [];

async function cargarHoja(nombre) {
  const url = `https://opensheet.elk.sh/${SHEET_ID}/${nombre}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText || ""}`.trim());
    return await res.json();
  } catch (error) {
    throw new Error(`No se pudo cargar la hoja ${nombre}. Detalle: ${error.message || error}. URL: ${url}. Revisa que la pestana exista con ese nombre exacto, que el Google Sheet sea publico/visible y que la app este abierta desde server.js.`);
  }
}

async function cargarOpcional(nombre) {
  try {
    return await cargarHoja(nombre);
  } catch (error) {
    console.warn(error.message);
    return [];
  }
}

function estado(texto) {
  const el = document.getElementById("estadoCarga");
  if (el) el.textContent = texto;
}

function validarColumnas(nombre, data, columnas) {
  if (!data.length) {
    advertenciasCarga.push(`${nombre}: hoja vacia o no cargada.`);
    return;
  }

  const disponibles = new Set(Object.keys(data[0] || {}));
  const faltantes = columnas.filter(col => {
    const alternativas = Array.isArray(col) ? col : [col];
    return !alternativas.some(alt => disponibles.has(alt));
  }).map(col => Array.isArray(col) ? col[0] : col);
  if (faltantes.length) advertenciasCarga.push(`${nombre}: faltan columnas ${faltantes.join(", ")}.`);
}

function validarDatosBase() {
  advertenciasCarga = [];
  validarColumnas("LPNS", dataLPN, ["LPN", "CODIGO", "DESCRIPCION", "UBICACION", "ESTADO", "BULTOS"]);
  validarColumnas("PRODUCTOS", dataProductos, ["CODIGO", ["CODIGO_ALT", "COD_ALT", "CODIGO ALTERNATIVO", "Cod Alternat"]]);
  validarColumnas("PEDIDO", dataPedido, ["PRODUCTO"]);
  validarColumnas("INV_ACTIVO", dataInventario, ["PRODUCTO", "UBICACION", "UNACT"]);
}

async function cargarDatos() {
  datosListos = false;
  estado("Cargando hojas base...");

  const [lpns, productos, pedido, inventario, ubicaciones, bloqueo] = await Promise.all([
    cargarHoja("LPNS"),
    cargarHoja("PRODUCTOS"),
    cargarHoja("PEDIDO"),
    cargarHoja("INV_ACTIVO"),
    cargarOpcional("UBICACION"),
    cargarOpcional("BLOQUEO")
  ]);

  dataLPN = lpns;
  dataProductos = productos;
  dataPedido = pedido;
  dataInventario = inventario;
  dataUbicaciones = ubicaciones;
  dataBloqueo = bloqueo;
  validarDatosBase();
  datosListos = true;

  estado(`LPNS ${lpns.length} | Productos ${productos.length} | Pedido ${pedido.length} | INV ${inventario.length}${advertenciasCarga.length ? " | Revisar columnas" : ""}`);
}

async function iniciarAplicacion() {
  document.getElementById("modulo").innerHTML = `<div class="loading">Cargando datos...</div>`;
  try {
    await cargarDatos();
    verDashboard();
  } catch (error) {
    mostrarError(error);
  }
}

async function recargarDatos() {
  document.getElementById("modulo").innerHTML = `<div class="loading">Actualizando...</div>`;
  await iniciarAplicacion();
}

function mostrarError(error) {
  console.error(error);
  estado("Error de carga");
  const mensaje = typeof htmlSeguro === "function"
    ? htmlSeguro(error.message || error)
    : String(error.message || error || "");
  document.getElementById("modulo").innerHTML = `
    <div class="error-box">
      <strong>No se pudieron cargar los datos.</strong>
      <p>${mensaje}</p>
      <button onclick="recargarDatos()">Intentar nuevamente</button>
    </div>
  `;
}
