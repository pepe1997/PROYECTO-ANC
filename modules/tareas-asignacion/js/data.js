const SHEET_ID = "1h0nR2IYyWDdmjcE-lWuTsqueCXq3aHQ49v_nJsrug0U";

let dataAsignacion = [];
let datosListos = false;
let hojaAsignacionUsada = "";

async function cargarHoja(nombre) {
  const url = `https://opensheet.elk.sh/${SHEET_ID}/${encodeURIComponent(nombre)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText || ""}`.trim());
    return await res.json();
  } catch (error) {
    throw new Error(`${nombre} via OpenSheet: ${error.message || error}`);
  }
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
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText || ""}`.trim());
    const csv = await res.text();
    const data = csvAObjetos(csv);
    if (!data.length) throw new Error("CSV sin filas");
    return data;
  } catch (error) {
    throw new Error(`${nombre} via Google CSV: ${error.message || error}`);
  }
}

async function cargarAsignacion() {
  const cache = sessionStorage.getItem("tareas_asignacion_cache");
  if (cache) {
    try {
      const parsed = JSON.parse(cache);
      if (Array.isArray(parsed.data) && parsed.data.length) {
        hojaAsignacionUsada = parsed.hoja || "ASIGNACION";
        estado("Cargando desde cache local...");
        return parsed.data;
      }
    } catch (error) {
      sessionStorage.removeItem("tareas_asignacion_cache");
    }
  }

  const candidatos = ["ASIGNACION"];
  const errores = [];

  for (const nombre of candidatos) {
    try {
      const data = await cargarHoja(nombre);
      hojaAsignacionUsada = nombre;
      sessionStorage.setItem("tareas_asignacion_cache", JSON.stringify({ hoja: nombre, data }));
      return data;
    } catch (error) {
      errores.push(error.message || String(error));
    }
  }

  for (const nombre of candidatos) {
    try {
      const data = await cargarHojaCsv(nombre);
      hojaAsignacionUsada = nombre;
      sessionStorage.setItem("tareas_asignacion_cache", JSON.stringify({ hoja: nombre, data }));
      return data;
    } catch (error) {
      errores.push(error.message || String(error));
    }
  }

  throw new Error(`No se pudo cargar la data principal. Probe estas pestanas: ${candidatos.join(", ")}. Detalle: ${errores.join(" | ")}. Revisa que el Sheet este compartido como publico o que la pestana tenga uno de esos nombres.`);
}

function estado(texto) {
  const el = document.getElementById("estadoCarga");
  if (el) el.textContent = texto;
}

async function cargarDatos() {
  datosListos = false;
  estado("Cargando ASIGNACION...");
  dataAsignacion = await cargarAsignacion();
  if (typeof tareasProcesadas !== "undefined") tareasProcesadas = null;
  datosListos = true;
  estado(`${hojaAsignacionUsada} ${dataAsignacion.length} registros`);
}

async function iniciarAplicacion() {
  document.getElementById("modulo").innerHTML = `<div class="loading">Cargando datos...</div>`;
  try {
    await cargarDatos();
    verResumen();
  } catch (error) {
    mostrarError(error);
  }
}

async function recargarDatos() {
  sessionStorage.removeItem("tareas_asignacion_cache");
  document.getElementById("modulo").innerHTML = `<div class="loading">Actualizando...</div>`;
  await iniciarAplicacion();
}

function mostrarError(error) {
  console.error(error);
  estado("Error de carga");
  document.getElementById("modulo").innerHTML = `
    <div class="error-box">
      <strong>No se pudieron cargar los datos.</strong>
      <p>${error.message || error}</p>
      <button onclick="recargarDatos()">Intentar nuevamente</button>
    </div>
  `;
}

