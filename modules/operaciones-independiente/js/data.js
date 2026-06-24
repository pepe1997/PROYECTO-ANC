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
  const url = `https://opensheet.elk.sh/${SHEET_ID}/${encodeURIComponent(nombre)}`;
  const errores = [];

  try {
    try {
      if (location.protocol === "file:") throw new Error("carga local");
      if (window.parent !== window && typeof window.parent.ancCargarJson === "function") {
        return await window.parent.ancCargarJson(url);
      }
    } catch (error) {}
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText || ""}`.trim());
    return await res.json();
  } catch (error) {
    errores.push(`OpenSheet: ${error.message || error}`);
  }

  try {
    return await cargarHojaCsv(nombre);
  } catch (error) {
    errores.push(`Google CSV: ${error.message || error}`);
  }

  throw new Error(`No se pudo cargar la hoja ${nombre}. Detalle: ${errores.join(" | ")}. Revisa que la pestana exista con ese nombre exacto, que el Google Sheet sea publico/visible y que la app este abierta desde server.js.`);
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
    verLpns();
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
