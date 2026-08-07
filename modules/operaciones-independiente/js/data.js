const SHEET_ID = "1-v6vXjHpLlIn0-_lVZw0BtGopnxSHH0zqoOrW8aBwcg";
const TAREAS_ASIGNACION_SHEET_ID = "1h0nR2IYyWDdmjcE-lWuTsqueCXq3aHQ49v_nJsrug0U";
const RECEPCION_PROVEEDORES_SHEET_ID = "18iiFahjssG-2Or8HE9KjBer3DcuG0mDaMpxZj-rqycI";
const RECEPCION_PALETEROS_SHEET_ID = "18WCnUcTQUdMunHaazPT663x0CmAaE72TvUPRNQZm7ts";

let dataLPN = [];
let dataProductos = [];
let dataPedido = [];
let dataInventario = [];
let dataUbicaciones = [];
let dataBloqueo = [];
let dataAsignacionTareas = [];
let dataRecepcionProveedores = [];
let dataRecepcionPaleteros = [];
let datosListos = false;
let advertenciasCarga = [];

async function cargarHojaDesde(sheetId, nombre) {
  const url = `https://opensheet.elk.sh/${sheetId}/${encodeURIComponent(nombre)}`;
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
    return await cargarHojaCsvDesde(sheetId, nombre);
  } catch (error) {
    errores.push(`Google CSV: ${error.message || error}`);
  }

  throw new Error(`No se pudo cargar la hoja ${nombre}. Detalle: ${errores.join(" | ")}. Revisa que la pestana exista con ese nombre exacto, que el Google Sheet sea publico/visible y que la app este abierta desde server.js.`);
}

async function cargarHoja(nombre) {
  return cargarHojaDesde(SHEET_ID, nombre);
}

function detectarSeparadorCsv(texto) {
  const primeraLinea = String(texto || "").split(/\r?\n/)[0] || "";
  const comas = (primeraLinea.match(/,/g) || []).length;
  const puntoComas = (primeraLinea.match(/;/g) || []).length;
  return puntoComas > comas ? ";" : ",";
}

function parseCsv(texto, separador = ",") {
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
    } else if (char === separador && !quoted) {
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
  const rows = parseCsv(csv, detectarSeparadorCsv(csv));
  const headers = (rows.shift() || []).map(h => h.trim());
  return rows.map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? "";
    });
    return obj;
  });
}

async function cargarHojaCsvDesde(sheetId, nombre) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(nombre)}`;
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

async function cargarHojaCsv(nombre) {
  return cargarHojaCsvDesde(SHEET_ID, nombre);
}

async function cargarHojaCsvPrincipalDesde(sheetId) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
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

function cargarHojaGvizPrincipalDesde(sheetId) {
  return new Promise((resolve, reject) => {
    const callback = `ancGviz_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const limpiarScript = () => {
      delete window[callback];
      script.remove();
    };
    const timer = setTimeout(() => {
      limpiarScript();
      reject(new Error("Google GViz sin respuesta"));
    }, 20000);

    window[callback] = payload => {
      clearTimeout(timer);
      limpiarScript();
      try {
        const table = payload?.table;
        const headers = (table?.cols || []).map(col => limpiar(col.label || col.id));
        const data = (table?.rows || []).map(row => {
          const obj = {};
          headers.forEach((header, index) => {
            const cell = row.c?.[index];
            obj[header] = cell ? (cell.f ?? cell.v ?? "") : "";
          });
          return obj;
        });
        if (!data.length) throw new Error("GViz sin filas");
        resolve(data);
      } catch (error) {
        reject(error);
      }
    };

    script.onerror = () => {
      clearTimeout(timer);
      limpiarScript();
      reject(new Error("No se pudo cargar Google GViz"));
    };
    script.src = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=responseHandler:${callback}`;
    document.head.appendChild(script);
  });
}

async function cargarOpcional(nombre) {
  try {
    return await cargarHoja(nombre);
  } catch (error) {
    console.warn(error.message);
    return [];
  }
}

async function cargarOpcionalDesde(sheetId, nombre) {
  try {
    return await cargarHojaDesde(sheetId, nombre);
  } catch (error) {
    console.warn(error.message);
    return [];
  }
}

async function cargarOpcionalPrincipalDesde(sheetId, etiqueta) {
  const errores = [];

  try {
    return await cargarHojaGvizPrincipalDesde(sheetId);
  } catch (error) {
    errores.push(`GViz: ${error.message || error}`);
  }

  try {
    return await cargarHojaCsvPrincipalDesde(sheetId);
  } catch (error) {
    errores.push(`CSV: ${error.message || error}`);
  }

  console.warn(`No se pudo cargar ${etiqueta}: ${errores.join(" | ")}`);
  return [];
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

function campoHoja(row, nombres) {
  for (const nombre of nombres) {
    if (row[nombre] !== undefined && row[nombre] !== null && row[nombre] !== "") return row[nombre];
  }
  return "";
}

function cantidadLpn(valor) {
  const texto = String(valor ?? "").trim();
  if (!texto) return "";
  const limpio = texto.replace(/\s/g, "");
  if (/^-?\d{1,3}([.,])\d{3}$/.test(limpio)) return limpio.replace(/[.,]/g, "");
  if (/^-?\d{1,3}([.,]\d{3})+([.,]\d+)?$/.test(limpio)) {
    const separadorDecimal = limpio.match(/[.,](\d+)$/);
    if (separadorDecimal && separadorDecimal[1].length !== 3) {
      const decimal = separadorDecimal[0].replace(",", ".");
      return limpio.slice(0, -separadorDecimal[0].length).replace(/[.,]/g, "") + decimal;
    }
    return limpio.replace(/[.,]/g, "");
  }
  return limpio.replace(",", ".");
}

function normalizarFilaLpn(row) {
  const lpn = campoHoja(row, ["LPN", "Nro LPN", "NRO LPN", "NRO_LPN", "Nbr LPN", "NBR LPN"]);
  const estado = campoHoja(row, ["ESTADO", "Estado"]);
  const codigo = campoHoja(row, ["CODIGO", "Codigo", "PRODUCTO", "Producto"]);
  const codigoAlt = campoHoja(row, ["CODIGO_ALT", "COD_ALT", "CODIGO ALTERNATIVO", "Codigo Alternativo", "Cod Alternat", "Codigo alternativo"]);
  const descripcion = campoHoja(row, ["DESCRIPCION", "Descripcion", "Descripción"]);
  const ubicacion = campoHoja(row, ["UBICACION", "Ubicacion", "Ubicación"]);
  const bultos = cantidadLpn(campoHoja(row, ["BULTOS", "Bultos"]));
  const unidades = cantidadLpn(campoHoja(row, ["UnAct", "UNACT", "Un Act", "UN ACT", "UNIDADES", "Unidades", "Un Rcb", "UN RCB"]));
  const asignado = cantidadLpn(campoHoja(row, ["UN_ASIG", "Un Asig", "UN ASIG", "UNI_ASIG", "UnAsig"]));
  const uxb = cantidadLpn(campoHoja(row, ["UXB", "Uxb", "Und x Caja", "UND X CAJA", "Und x Inner", "UND X INNER"]));
  const fecha = campoHoja(row, ["FECHA ANTIGÜEDAD", "FECHA ANTIGUEDAD", "FECHA", "Fecha", "Fe y Hr Almacena", "Fe Y Hr Modif", "Fe Hr Recibo", "Fe y Hr Creac", "Fecha Priorid"]);

  return {
    ...row,
    LPN: lpn,
    ESTADO: estado,
    CODIGO: codigo,
    CODIGO_ALT: codigoAlt,
    DESCRIPCION: descripcion,
    UBICACION: ubicacion,
    BULTOS: bultos,
    UNIDADES: unidades || bultos,
    UNACT: unidades || bultos,
    UN_ASIG: asignado,
    UXB: uxb,
    FECHA: fecha,
    JERARQUIA: campoHoja(row, ["JERARQUIA", "Jerarq2", "JERARQ2"])
  };
}

function validarDatosBase() {
  advertenciasCarga = [];
  validarColumnas("LPNS", dataLPN, [
    ["LPN", "Nro LPN", "NRO LPN", "NRO_LPN", "Nbr LPN", "NBR LPN"],
    ["CODIGO", "Codigo", "PRODUCTO", "Producto"],
    ["DESCRIPCION", "Descripcion", "Descripción"],
    ["UBICACION", "Ubicacion", "Ubicación"],
    ["ESTADO", "Estado"],
    ["BULTOS", "Bultos"],
    ["UnAct", "UNACT", "Un Act", "UN ACT"]
  ]);
  validarColumnas("PRODUCTOS", dataProductos, ["CODIGO", ["CODIGO_ALT", "COD_ALT", "CODIGO ALTERNATIVO", "Cod Alternat"]]);
  validarColumnas("PEDIDO", dataPedido, ["PRODUCTO"]);
  validarColumnas("INV_ACTIVO", dataInventario, ["PRODUCTO", "UBICACION", "UNACT"]);
}

async function cargarDatos() {
  datosListos = false;
  estado("Cargando hojas base...");

  const [lpns, productos, pedido, inventario, ubicaciones, bloqueo, asignacionTareas, recepcionProveedores, recepcionPaleteros] = await Promise.all([
    cargarHoja("LPNS"),
    cargarHoja("PRODUCTOS"),
    cargarHoja("PEDIDO"),
    cargarHoja("INV_ACTIVO"),
    cargarOpcional("UBICACION"),
    cargarOpcional("BLOQUEO"),
    cargarOpcionalDesde(TAREAS_ASIGNACION_SHEET_ID, "ASIGNACION"),
    cargarOpcionalPrincipalDesde(RECEPCION_PROVEEDORES_SHEET_ID, "recepcion proveedores"),
    cargarOpcionalPrincipalDesde(RECEPCION_PALETEROS_SHEET_ID, "recepcion paleteros")
  ]);

  dataLPN = lpns.map(normalizarFilaLpn);
  dataProductos = productos;
  dataPedido = pedido;
  dataInventario = inventario;
  dataUbicaciones = ubicaciones;
  dataBloqueo = bloqueo;
  dataAsignacionTareas = asignacionTareas;
  dataRecepcionProveedores = recepcionProveedores;
  dataRecepcionPaleteros = recepcionPaleteros;
  validarDatosBase();
  datosListos = true;

  estado(`LPNS ${lpns.length} | Productos ${productos.length} | Pedido ${pedido.length} | INV ${inventario.length} | Recepcion ${recepcionProveedores.length + recepcionPaleteros.length}${advertenciasCarga.length ? " | Revisar columnas" : ""}`);
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
