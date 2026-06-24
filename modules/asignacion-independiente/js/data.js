const SHEET_ID = "1-v6vXjHpLlIn0-_lVZw0BtGopnxSHH0zqoOrW8aBwcg";

let dataPedido = [];
let dataLPN = [];
let dataQuiebre = [];
let dataProductos = [];
let dataInventario = [];
let datosListos = false;

async function cargarHoja(nombre) {
  const errores = [];
  try {
    const url = `https://opensheet.elk.sh/${SHEET_ID}/${encodeURIComponent(nombre)}`;
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
    errores.push(`OpenSheet: ${error.message || error}`);
  }

  try {
    return await cargarHojaCsv(nombre);
  } catch (error) {
    errores.push(`Google CSV: ${error.message || error}`);
  }

  throw new Error(`No se pudo cargar la hoja ${nombre}. Detalle: ${errores.join(" | ")}. Revisa que la pestana exista con ese nombre exacto, que el Google Sheet sea publico/visible y que abras la app desde server.js.`);
}

function parseCsv(texto) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < texto.length; i += 1) {
    const char = texto[i];
    const next = texto[i + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      if (row.some(c => c !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value);
  if (row.some(c => c !== "")) rows.push(row);
  return rows;
}

function csvAObjetos(csv) {
  const rows = parseCsv(csv);
  const headers = (rows.shift() || []).map(h => h.trim());
  return rows.map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? "";
    });
    return obj;
  });
}

async function cargarHojaCsv(nombre) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(nombre)}`;
  let csv = "";

  try {
    if (location.protocol === "file:") throw new Error("carga local");
    if (window.parent !== window && typeof window.parent.ancCargarTexto === "function") {
      csv = await window.parent.ancCargarTexto(url);
    }
  } catch (error) {}

  if (!csv) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText || ""}`.trim());
    csv = await res.text();
  }

  const data = csvAObjetos(csv);
  if (!data.length) throw new Error("CSV sin filas");
  return data;
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
