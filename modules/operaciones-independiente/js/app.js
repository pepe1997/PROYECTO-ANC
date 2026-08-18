let ubicacionReservaActiva = "";
let detallePuntosControl = new Map();
let detalleOptimizacionReserva = new Map();
let detalleReservaActivo = new Map();
let detalleLpnsSinActivo = new Map();
let detalleControlPiso = new Map();
let detallePlanMultiPiso = new Map();
let detalleSimulacionCincoPallets = new Map();
let detallePaquetesInteligentes = new Map();
let detalleUnificacionProductoPiso = new Map();
let detalleDestinoPiso = new Map();
let cachePlanMultiPiso = { key: "", data: null };
let cacheUbicacionesActivas = { key: "", data: null };
let cacheLpnsOperativos = { key: "", data: [] };
let cacheCapacidadCd = { key: "", data: null };
let cachePrediccionPts = { key: "", data: null };
let cacheContextoRecepcion = { key: "", data: null };
let cacheAsnPaleteroRecepcion = { key: "", data: null };
let cacheRecepcionUca = { key: "", data: null };
let cacheMapaLpnsRecepcionUbicados = { key: "", data: null };
let cacheDetalleRecepcionUbicados = { key: "", data: null };
let prediccionPtsVista = { total: { ubicaciones: 0, bultos: 0, tareas: new Set(), lpns: new Set() }, resumen: [], ubicaciones: [] };
let pasilloPrediccionPtsActivo = "";
let recepcionUcaVista = { resumen: [], proveedores: [], proveedoresAsn: [], paleteros: [], paleterosAsn: [], total: {}, detalleAsnPasillo: [] };
let cacheLpnsUbicacion = { key: "", control: [], activo: new Map(), reserva: new Map() };
let cacheProductosPorCodigo = { key: "", mapa: new Map() };
let detalleBusquedaShipTo = new Map();
let timerRenderLpnsUbicacion = null;
let timerControlPiso = null;
let timerPlanMultiPiso = null;
let filtrosPlanMultiPiso = { lpn: "", producto: "" };
let timerUbicacionesActivas = null;
let filtrosUbicacionesActivas = { pasillo: "", zona: "", tipo: "", busqueda: "" };
let filtrosRecepcionProyeccion = { asn: "", placa: "", proveedor: "" };
let filtrosRecepcionUbicados = { asns: [], placas: [] };
let recepcionSubmoduloActivo = "proveedores";
let filtroRecepcionProveedorNombre = "";
let filtrosShipToY = { asn: "", placa: "" };

function invalidarCacheOperaciones() {
  cacheLpnsOperativos = { key: "", data: [] };
  cacheCapacidadCd = { key: "", data: null };
  cachePrediccionPts = { key: "", data: null };
  cacheContextoRecepcion = { key: "", data: null };
  cacheAsnPaleteroRecepcion = { key: "", data: null };
  cacheRecepcionUca = { key: "", data: null };
  cacheMapaLpnsRecepcionUbicados = { key: "", data: null };
  cacheDetalleRecepcionUbicados = { key: "", data: null };
  cacheLpnsUbicacion = { key: "", control: [], activo: new Map(), reserva: new Map() };
  cacheProductosPorCodigo = { key: "", mapa: new Map() };
  cachePlanMultiPiso = { key: "", data: null };
  cacheUbicacionesActivas = { key: "", data: null };
}

function limpiar(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

function htmlSeguro(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function atributoSeguro(valor) {
  return htmlSeguro(valor);
}

function argumentoSeguro(valor) {
  return atributoSeguro(JSON.stringify(String(valor ?? ""))
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026"));
}

function normalizar(valor) {
  return limpiar(valor).replace(/'/g, "").replace(/\.0$/, "").replace(/\s/g, "").toUpperCase();
}

function firmaFilas(rows, campos = []) {
  const lista = Array.isArray(rows) ? rows : [];
  const indices = [0, Math.floor(lista.length / 2), lista.length - 1].filter((idx, pos, arr) => idx >= 0 && arr.indexOf(idx) === pos);
  const muestra = indices.map(idx => {
    const row = lista[idx] || {};
    const keys = campos.length ? campos : Object.keys(row).slice(0, 6);
    return keys.map(key => `${key}:${limpiar(row[key])}`).join(",");
  }).join("|");
  return `${lista.length}:${muestra}`;
}

function palabrasClave(texto) {
  return limpiar(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(p => p.length >= 4)
    .filter(p => !["PRODUCTO", "UNIDAD", "CAJA", "PACK", "BOLSA", "COLOR", "TALLA"].includes(p));
}

function similitudTexto(a, b) {
  const pa = new Set(palabrasClave(a));
  const pb = new Set(palabrasClave(b));
  if (!pa.size || !pb.size) return 0;
  let comunes = 0;
  pa.forEach(p => {
    if (pb.has(p)) comunes += 1;
  });
  return comunes / Math.max(pa.size, pb.size);
}

function num(valor) {
  const n = parseFloat(String(valor || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function fmt(valor) {
  return Number(valor || 0).toLocaleString("es-PE", { maximumFractionDigits: 2 });
}

const CAPACIDAD_DINAMICA_UND = 99999999;

function esCapacidadDinamica(uniMax) {
  const valor = num(uniMax);
  return valor <= 0 || valor >= 999999;
}

function disponibilidadPorCapacidad(uniMax, unact, transito, uxb) {
  const dinamica = esCapacidadDinamica(uniMax);
  const disponibleUnd = dinamica ? CAPACIDAD_DINAMICA_UND : Math.max(0, num(uniMax) - (num(unact) + num(transito)));
  return {
    dinamica,
    disponibleUnd,
    disponibleBul: uxb ? disponibleUnd / uxb : disponibleUnd
  };
}

function fmtDisponibilidad(valor, dinamica) {
  return dinamica ? "SIN LIMITE" : fmt(valor);
}

function pct(a, b) {
  return b > 0 ? (a / b) * 100 : 0;
}

function pctLimitado(a, b) {
  return Math.max(0, Math.min(100, pct(a, b)));
}

function parseFecha(valor) {
  const txt = limpiar(valor).split(/\s+/)[0];
  if (!txt) return null;
  const partes = txt.split(/[\/-]/);
  if (partes.length !== 3) return null;

  if (partes[0].length === 4) return new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
  return new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]));
}

function diasLaboralesSinDomingos(fechaTexto, hasta = new Date()) {
  const inicio = parseFecha(fechaTexto);
  if (!inicio) return 0;

  const actual = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
  const fin = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  let dias = 0;

  while (actual < fin) {
    actual.setDate(actual.getDate() + 1);
    if (actual.getDay() !== 0) dias += 1;
  }

  return dias;
}

function campo(row, nombres) {
  for (const nombre of nombres) {
    if (row[nombre] !== undefined && row[nombre] !== null && row[nombre] !== "") return row[nombre];
  }
  return "";
}

function ordenarUbicacion(a, b) {
  const parse = u => {
    const p = limpiar(u).split("-");
    return [num(p[1]), num(p[2]), num(p[3]), num(p[4])];
  };
  const pa = parse(a);
  const pb = parse(b);
  return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2] || pa[3] - pb[3];
}

function pasilloMass(ubicacion) {
  const partes = limpiar(ubicacion).toUpperCase().split("-");
  if (partes[0] !== "MASS" || !partes[1]) return "";
  return limpiar(partes[1]).padStart(2, "0");
}

function esMassPasillo10(ubicacion) {
  return pasilloMass(ubicacion) === "10";
}

function kpi(label, value, note = "", clase = "") {
  return `<div class="kpi ${atributoSeguro(clase)}"><span>${htmlSeguro(label)}</span><strong>${htmlSeguro(value)}</strong>${note ? `<small>${htmlSeguro(note)}</small>` : ""}</div>`;
}

function tabla(headers, rows, empty = "Sin datos") {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${headers.map(h => `<th>${htmlSeguro(h)}</th>`).join("")}</tr></thead>
        <tbody>${rows.join("") || `<tr><td colspan="${headers.length}">${htmlSeguro(empty)}</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function esPasilloCapacidadValido(pasillo) {
  return ["01", "02", "03", "04", "05", "06", "07", "08", "09", "11", "12"].includes(pasillo);
}

function ubicacionMassValidaCapacidad(ubicacion) {
  const ubi = limpiar(ubicacion);
  const pasillo = pasilloMass(ubi);
  return ubi.toUpperCase().startsWith("MASS-") && esPasilloCapacidadValido(pasillo);
}

function tipoCapacidadUbicacion(row) {
  const tipo = normalizar(campo(row, ["TIPO", "Tipo", "tipo"]));
  if (tipo.includes("ACTIVO")) return "ACTIVO";
  if (tipo.includes("RESERVA")) return "RESERVA";
  return "";
}

function tipoSeteoUbicacion(row) {
  const tipo = normalizar(campo(row, [
    "TIPO_UBICACION",
    "TIPO UBICACION",
    "TIPOUBICACION",
    "Tipo ubicacion",
    "Tipo Ubicacion"
  ]));
  if (tipo.includes("DIN")) return "DINAMICA";
  if (tipo.includes("PER")) return "PERMANENTE";
  return tipoUbicacion(row);
}

function parseUbicacionMassCapacidad(ubicacion) {
  const partes = limpiar(ubicacion).toUpperCase().split("-");
  if (partes.length < 5 || partes[0] !== "MASS") return null;
  return {
    pasillo: limpiar(partes[1]).padStart(2, "0"),
    bahia: Number(partes[2]),
    nivel: Number(partes[3]),
    columna: Number(partes[4])
  };
}

function enRangoCapacidad(valor, inicio, fin) {
  return valor >= inicio && valor <= fin;
}

function esUbicacionReservaOcupadaPorRegla(ubicacion) {
  const pos = parseUbicacionMassCapacidad(ubicacion);
  if (!pos || !esPasilloCapacidadValido(pos.pasillo)) return false;
  const { pasillo, bahia, nivel, columna } = pos;
  const colValida = columna === 1 || columna === 2;

  if (pasillo === "03") {
    return (bahia === 6 && enRangoCapacidad(nivel, 1, 5) && columna === 2) ||
      (bahia === 14 && enRangoCapacidad(nivel, 1, 5) && columna === 2) ||
      ([12, 20, 28, 34].includes(bahia) && enRangoCapacidad(nivel, 1, 5) && columna === 1);
  }
  if (pasillo === "04") {
    return bahia === 7 && enRangoCapacidad(nivel, 2, 5) && colValida;
  }
  if (pasillo === "07") {
    return [5, 7].includes(bahia) && enRangoCapacidad(nivel, 1, 4) && colValida;
  }
  if (pasillo === "09") {
    return true;
  }
  if (pasillo === "11") {
    return (bahia >= 1 && bahia <= 33 && bahia % 2 === 1 && nivel === 7 && colValida) ||
      (bahia >= 22 && bahia <= 34 && bahia % 2 === 0 && nivel === 4 && colValida);
  }
  if (pasillo === "12") {
    return bahia >= 20 && bahia <= 34 && bahia % 2 === 0 && enRangoCapacidad(nivel, 2, 4) && colValida;
  }
  return false;
}

function ocupacionManualReservaCapacidad(base) {
  if (!esUbicacionReservaOcupadaPorRegla(base.ubicacion)) return null;
  return {
    ubicacion: base.ubicacion,
    pasillo: base.pasillo,
    estado: "OCUPADA MANUAL",
    origen: "REGLA OPERATIVA",
    lpns: new Set(),
    productos: new Set(),
    bultos: 0,
    unidades: 0,
    detalle: []
  };
}

function ubicacionesMaestroCapacidad(tipo = "") {
  const mapa = new Map();
  dataUbicaciones.forEach(row => {
    const ubicacion = limpiar(campo(row, ["MASCARA", "UBICACION", "Ubicacion"]));
    if (!ubicacionMassValidaCapacidad(ubicacion)) return;
    const tipoCapacidad = tipoCapacidadUbicacion(row);
    if (tipo && tipoCapacidad && tipoCapacidad !== tipo) return;
    const key = normalizar(ubicacion);
    if (!mapa.has(key)) {
      mapa.set(key, {
        ubicacion,
        pasillo: pasilloMass(ubicacion),
        tipo: tipoUbicacion(row),
        tipoCapacidad: tipoCapacidad || tipo || "SIN TIPO",
        origen: "MAESTRO",
        productoSeteado: normalizar(campo(row, ["PRODUCTO", "Codigo", "CODIGO"])),
        descripcionSeteada: limpiar(campo(row, ["DESCRIPCION", "Descripcion"]))
      });
    }
  });
  return mapa;
}

function detalleOcupacionReservaCapacidad() {
  const porUbicacion = new Map();
  lpnsOperativos().forEach(row => {
    const ubicacion = limpiar(row.UBICACION);
    const bultos = num(row.BULTOS);
    if (!ubicacionMassValidaCapacidad(ubicacion) || bultos <= 0) return;
    const key = normalizar(ubicacion);
    if (!porUbicacion.has(key)) {
      porUbicacion.set(key, {
        ubicacion,
        pasillo: pasilloMass(ubicacion),
        estado: "OCUPADA",
        origen: "LPNS",
        lpns: new Set(),
        productos: new Set(),
        bultos: 0,
        unidades: 0,
        detalle: []
      });
    }
    const item = porUbicacion.get(key);
    const codigo = normalizar(row.CODIGO);
    const unidades = num(row.UNACT || row.UNIDADES || row.BULTOS);
    item.lpns.add(limpiar(row.LPN));
    item.productos.add(codigo);
    item.bultos += bultos;
    item.unidades += unidades;
    item.detalle.push({
      ubicacion,
      pasillo: item.pasillo,
      lpn: limpiar(row.LPN),
      codigo,
      descripcion: limpiar(row.DESCRIPCION),
      bultos,
      unidades
    });
  });
  return porUbicacion;
}

function detalleOcupacionActivoCapacidad() {
  const porUbicacion = new Map();
  consolidarInventario().forEach(row => {
    if (!ubicacionMassValidaCapacidad(row.ubicacion) || num(row.unact) <= 0) return;
    const key = normalizar(row.ubicacion);
    if (!porUbicacion.has(key)) {
      porUbicacion.set(key, {
        ubicacion: row.ubicacion,
        pasillo: pasilloMass(row.ubicacion),
        estado: "OCUPADA",
        origen: "INV_ACTIVO",
        productos: new Set(),
        bultos: 0,
        unidades: 0,
        detalle: []
      });
    }
    const item = porUbicacion.get(key);
    const bultos = num(row.unact) / (num(row.uxb) || 1);
    item.productos.add(row.codigo);
    item.unidades += num(row.unact);
    item.bultos += bultos;
    item.detalle.push({
      ubicacion: row.ubicacion,
      pasillo: item.pasillo,
      codigo: row.codigo,
      descripcion: row.desc,
      bultos,
      unidades: num(row.unact)
    });
  });
  return porUbicacion;
}

function esLpnPendienteParaActivoCapacidad(ubicacion) {
  const ubi = limpiar(ubicacion).toUpperCase();
  return !ubi ||
    ubicacionMassValidaCapacidad(ubi) ||
    ubi.startsWith("DROP-BUFR") ||
    ubi.startsWith("DROP-STOCK-DESBLOQ-962");
}

function stockPendienteActivoPorProductoCapacidad() {
  const mapa = new Map();
  lpnsOperativos().forEach(row => {
    const codigo = normalizar(row.CODIGO);
    const bultos = num(row.BULTOS);
    if (!codigo || bultos <= 0 || !esLpnPendienteParaActivoCapacidad(row.UBICACION)) return;
    if (!mapa.has(codigo)) {
      mapa.set(codigo, {
        codigo,
        descripcion: descripcionProducto(codigo, row),
        lpns: new Set(),
        bultos: 0,
        unidades: 0,
        detalle: []
      });
    }
    const item = mapa.get(codigo);
    const unidades = num(row.UNACT || row.UNIDADES || row.BULTOS);
    item.lpns.add(limpiar(row.LPN));
    item.bultos += bultos;
    item.unidades += unidades;
    item.detalle.push({
      ubicacion: limpiar(row.UBICACION) || "SIN UBICACION",
      lpn: limpiar(row.LPN),
      codigo,
      descripcion: descripcionProducto(codigo, row),
      bultos,
      unidades
    });
  });
  return mapa;
}

function aplicarSeteosPendientesActivoCapacidad(ocupadasMap) {
  const pendientes = stockPendienteActivoPorProductoCapacidad();
  dataUbicaciones.forEach(row => {
    const ubicacion = limpiar(campo(row, ["MASCARA", "UBICACION", "Ubicacion"]));
    const tipoCapacidad = tipoCapacidadUbicacion(row);
    if (!ubicacionMassValidaCapacidad(ubicacion) || (tipoCapacidad && tipoCapacidad !== "ACTIVO") || tipoSeteoUbicacion(row) !== "PERMANENTE") return;
    const codigo = normalizar(campo(row, ["PRODUCTO", "Codigo", "CODIGO"]));
    if (!codigo || codigo === "-----------") return;
    const pendiente = pendientes.get(codigo);
    if (!pendiente || pendiente.bultos <= 0) return;
    const key = normalizar(ubicacion);
    if (ocupadasMap.has(key)) return;

    ocupadasMap.set(key, {
      ubicacion,
      pasillo: pasilloMass(ubicacion),
      estado: "OCUPADA",
      origen: "SETEO PENDIENTE",
      productos: new Set([codigo]),
      bultos: pendiente.bultos,
      unidades: pendiente.unidades,
      detalle: pendiente.detalle.map(det => ({
        ...det,
        ubicacionActivo: ubicacion,
        descripcion: det.descripcion || descripcionProducto(codigo, row)
      }))
    });
  });
}

function construirCapacidadPorTipo(tipo, ocupadasMap) {
  const universo = ubicacionesMaestroCapacidad(tipo);
  if (tipo === "ACTIVO") aplicarSeteosPendientesActivoCapacidad(ocupadasMap);
  ocupadasMap.forEach(item => {
    const key = normalizar(item.ubicacion);
    if (!universo.has(key)) {
      universo.set(key, {
        ubicacion: item.ubicacion,
        pasillo: item.pasillo,
        tipo: "SIN MAESTRO",
        tipoCapacidad: tipo,
        origen: "STOCK"
      });
    }
  });

  const resumen = new Map();
  const detalle = [];
  const pasillos = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "11", "12"];
  pasillos.forEach(pasillo => resumen.set(pasillo, { tipo, pasillo, total: 0, ocupadas: 0, libres: 0, pct: 0 }));

  Array.from(universo.values())
    .sort((a, b) => ordenarUbicacion(a.ubicacion, b.ubicacion))
    .forEach(base => {
      const ocupado = ocupadasMap.get(normalizar(base.ubicacion)) || (tipo === "RESERVA" ? ocupacionManualReservaCapacidad(base) : null);
      const item = resumen.get(base.pasillo);
      if (!item) return;
      item.total += 1;
      if (ocupado) item.ocupadas += 1;
      else item.libres += 1;

      detalle.push({
        tipo,
        pasillo: base.pasillo,
        ubicacion: base.ubicacion,
        estado: ocupado ? (ocupado.estado || "OCUPADA") : "LIBRE",
        tipoUbicacion: base.tipo,
        origenMaestro: base.origen,
        origen: ocupado?.origen || base.origen,
        lpns: ocupado?.lpns?.size || 0,
        productos: ocupado?.productos?.size || 0,
        bultos: ocupado?.bultos || 0,
        unidades: ocupado?.unidades || 0,
        detalle: ocupado?.detalle || []
      });
    });

  const filasResumen = Array.from(resumen.values()).map(row => ({ ...row, pct: pct(row.ocupadas, row.total) }));
  const total = filasResumen.reduce((acc, row) => {
    acc.total += row.total;
    acc.ocupadas += row.ocupadas;
    acc.libres += row.libres;
    return acc;
  }, { tipo, total: 0, ocupadas: 0, libres: 0, pct: 0 });
  total.pct = pct(total.ocupadas, total.total);

  return { total, resumen: filasResumen, detalle };
}

function calcularCapacidadCd() {
  const key = [
    firmaFilas(dataLPN, ["LPN", "ESTADO", "UBICACION", "CODIGO", "BULTOS"]),
    firmaFilas(dataInventario, ["PRODUCTO", "UBICACION", "UNACT", "UXB"]),
    firmaFilas(dataUbicaciones, ["MASCARA", "UBICACION", "TIPO"])
  ].join("::");
  if (cacheCapacidadCd.key === key && cacheCapacidadCd.data) return cacheCapacidadCd.data;
  cacheCapacidadCd = { key, data: {
    reserva: construirCapacidadPorTipo("RESERVA", detalleOcupacionReservaCapacidad()),
    activo: construirCapacidadPorTipo("ACTIVO", detalleOcupacionActivoCapacidad())
  } };
  return cacheCapacidadCd.data;
}

function pertenecePtsAsignacion(row) {
  const texto = [
    campo(row, ["ASIGNACION", "ASIGNACION_TAREA"]),
    campo(row, ["TIPO_ASIGANCION", "TIPO ASIGNACION", "Tipo Asignac", "TIPO", "TIPO_TAREA", "MODULO"]),
    campo(row, ["ESTADO TAREA", "ESTADO_TAREA", "Estado Tarea2", "STATUS", "ESTADO", "Estado"]),
    campo(row, ["NRO_TAREA", "Nro Tarea", "TAREA"]),
    campo(row, ["DESCRIPCION", "DESC", "PRODUCTO_DESC"])
  ].join(" ");
  return normalizar(texto).includes("PTS");
}

function estadoPtsAsignacion(row) {
  const tarea = limpiar(campo(row, ["NRO_TAREA", "Nro Tarea", "TAREA"]));
  const lpnEntrada = limpiar(campo(row, ["Nbr LPN Entrada", "LPN_ENTRADA", "LPN", "LPN_ID"]));
  const ubicLpn = limpiar(campo(row, ["ubic LPN", "UBIC LPN", "UBIC_LPN", "UBICACION_LPN", "DESDE_UBICACION", "Desde Ubicacion", "Desde Ubicación"]));
  const ubicPallet = limpiar(campo(row, ["Ubic Pallet", "UBIC PALLET", "UBIC_PALLET", "UBICACION PALLET", "UBICACION_PALLET"]));
  const estadoFuente = normalizar(campo(row, ["ESTADO TAREA", "ESTADO_TAREA", "Estado Tarea2", "STATUS", "ESTADO", "Estado"]));

  if (normalizar(ubicPallet) === "DROPPICKINGMASS962") return "Terminado / Distribucion";
  if (tarea && lpnEntrada && normalizar(ubicLpn).startsWith("MASS")) return "Listo";
  if (estadoFuente === "LISTO") return "Listo";
  if (estadoFuente.includes("PROCES")) return "Proceso iniciado";
  if (estadoFuente.includes("TERMIN") || estadoFuente === "DISTRIBUCION") return "Terminado / Distribucion";
  return campo(row, ["ESTADO TAREA", "ESTADO_TAREA", "Estado Tarea2", "STATUS", "ESTADO", "Estado"]) || "SIN ESTADO";
}

function ubicacionPtsAsignacion(row) {
  return limpiar(campo(row, [
    "ubic LPN",
    "UBIC LPN",
    "UBIC_LPN",
    "UBICACION_LPN",
    "DESDE_UBICACION",
    "Desde Ubicacion",
    "Desde Ubicación",
    "UBICACION",
    "UBICACION_ORIGEN",
    "UBI"
  ]));
}

function prediccionLiberacionPts() {
  const key = firmaFilas(dataAsignacionTareas, ["NRO_TAREA", "LPN", "LPN_ENTRADA", "UBICACION", "ESTADO", "BULTOS"]);
  if (cachePrediccionPts.key === key && cachePrediccionPts.data) return cachePrediccionPts.data;
  const mapa = new Map();
  (dataAsignacionTareas || []).forEach(row => {
    if (!pertenecePtsAsignacion(row) || estadoPtsAsignacion(row) !== "Listo") return;
    const ubicacion = ubicacionPtsAsignacion(row);
    if (!ubicacionMassValidaCapacidad(ubicacion)) return;
    const pasillo = pasilloMass(ubicacion);
    const key = normalizar(ubicacion);
    const tarea = limpiar(campo(row, ["NRO_TAREA", "Nro Tarea", "TAREA"]));
    const lpn = limpiar(campo(row, ["Nbr LPN Entrada", "LPN_ENTRADA", "LPN", "LPN_ID"]));
    const codigo = normalizar(campo(row, ["CODIGO", "PRODUCTO", "SKU", "COD_PRODUCTO"]));
    const descripcion = limpiar(campo(row, ["DESCRIPCION", "DESC", "PRODUCTO_DESC"]));
    const bultos = num(campo(row, ["BULTOS", "QtyAsgn Cases", "BULTOS_PEDIDO", "CASES", "CS"]));

    if (!mapa.has(key)) {
      mapa.set(key, {
        pasillo,
        ubicacion,
        tareas: new Set(),
        lpns: new Set(),
        productos: new Set(),
        bultos: 0,
        detalle: []
      });
    }
    const item = mapa.get(key);
    if (tarea) item.tareas.add(tarea);
    if (lpn) item.lpns.add(lpn);
    if (codigo) item.productos.add(codigo);
    item.bultos += bultos;
    item.detalle.push({ pasillo, ubicacion, tarea, lpn, codigo, descripcion, bultos });
  });

  const ubicaciones = Array.from(mapa.values()).sort((a, b) => ordenarUbicacion(a.ubicacion, b.ubicacion));
  const porPasillo = new Map();
  ["01", "02", "03", "04", "05", "06", "07", "08", "09", "11", "12"].forEach(pasillo => {
    porPasillo.set(pasillo, { pasillo, ubicaciones: 0, tareas: new Set(), lpns: new Set(), bultos: 0 });
  });
  ubicaciones.forEach(row => {
    const item = porPasillo.get(row.pasillo);
    if (!item) return;
    item.ubicaciones += 1;
    row.tareas.forEach(x => item.tareas.add(x));
    row.lpns.forEach(x => item.lpns.add(x));
    item.bultos += row.bultos;
  });

  const resumen = Array.from(porPasillo.values());
  const total = resumen.reduce((acc, row) => {
    acc.ubicaciones += row.ubicaciones;
    acc.bultos += row.bultos;
    row.tareas.forEach(x => acc.tareas.add(x));
    row.lpns.forEach(x => acc.lpns.add(x));
    return acc;
  }, { ubicaciones: 0, bultos: 0, tareas: new Set(), lpns: new Set() });

  cachePrediccionPts = { key, data: { total, resumen, ubicaciones } };
  return cachePrediccionPts.data;
}

function verCapacidadCd() {
  const data = calcularCapacidadCd();
  const prediccionPts = prediccionLiberacionPts();
  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <div>
        <h2>UCA</h2>
        <p class="muted-note">Utilizacion de la Capacidad de Almacenamiento: ubicaciones ocupadas frente al total disponible del CD.</p>
      </div>
      <div class="filters">
        <button onclick="exportarCapacidadCd('reserva')">Excel reserva</button>
        <button onclick="exportarCapacidadCd('activo')">Excel activo</button>
      </div>
    </div>

    <section class="kpi-grid compact capacity-kpis">
      ${kpi("Reserva total", fmt(data.reserva.total.total), "ubicaciones Mass sin pasillo 10")}
      ${kpi("Reserva ocupadas", fmt(data.reserva.total.ocupadas), `${data.reserva.total.pct.toFixed(1)}% ocupado`, "warn")}
      ${kpi("Reserva libres", fmt(data.reserva.total.libres), "capacidad teorica")}
      ${kpi("Activo total", fmt(data.activo.total.total), "ubicaciones Mass sin pasillo 10")}
      ${kpi("Activo ocupadas", fmt(data.activo.total.ocupadas), `${data.activo.total.pct.toFixed(1)}% ocupado`, "warn")}
      ${kpi("Activo libres", fmt(data.activo.total.libres), "capacidad teorica")}
    </section>

    <section class="capacity-dashboard">
      ${graficoCapacidad("Reserva", data.reserva)}
      ${graficoCapacidad("Activo", data.activo)}
    </section>

    ${bloquePrediccionPts(prediccionPts)}

    <section class="dashboard-layout">
      <div class="card">
        <div class="section-head">
          <h2>Resumen reserva por pasillo</h2>
          <button onclick="exportarCapacidadCd('reserva')">Excel</button>
        </div>
        ${tablaConId("tablaCapacidadReserva", ["Pasillo", "Total ubicaciones", "Ocupadas", "Libres", "% ocupacion"], filasTablaCapacidadResumen(data.reserva.resumen))}
      </div>
      <div class="card">
        <div class="section-head">
          <h2>Resumen activo por pasillo</h2>
          <button onclick="exportarCapacidadCd('activo')">Excel</button>
        </div>
        ${tablaConId("tablaCapacidadActivo", ["Pasillo", "Total ubicaciones", "Ocupadas", "Libres", "% ocupacion"], filasTablaCapacidadResumen(data.activo.resumen))}
      </div>
    </section>

    <section class="dashboard-layout">
      <div class="card">
        <div class="section-head">
          <h2>Detalle reserva</h2>
          <span class="muted-note">${fmt(data.reserva.detalle.length)} ubicaciones</span>
        </div>
        ${tablaConId("tablaCapacidadReservaDetalle", ["Pasillo", "Ubicacion", "Estado", "LPNs", "Productos", "Bultos", "Unidades", "Origen"], filasTablaCapacidadDetalle(data.reserva.detalle, true))}
      </div>
      <div class="card">
        <div class="section-head">
          <h2>Detalle activo</h2>
          <span class="muted-note">${fmt(data.activo.detalle.length)} ubicaciones</span>
        </div>
        ${tablaConId("tablaCapacidadActivoDetalle", ["Pasillo", "Ubicacion", "Estado", "Productos", "Bultos", "Unidades", "Origen"], filasTablaCapacidadDetalle(data.activo.detalle, false))}
      </div>
    </section>
  `;
}

function verRecepcionProyectada() {
  verRecepcionProveedores();
}

function verRecepcionProveedores() {
  if (recepcionSubmoduloActivo !== "proveedores") filtrosRecepcionProyeccion = { asn: "", placa: "", proveedor: "" };
  recepcionSubmoduloActivo = "proveedores";
  const capacidad = calcularCapacidadCd();
  const prediccionPts = prediccionLiberacionPts();
  const recepcion = calcularRecepcionUca(capacidad, prediccionPts);
  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <div>
        <h2>Recepcion - Proveedores</h2>
        <p class="muted-note">Pallets de proveedores y pasillo sugerido. La validacion de espacio queda en Proyeccion.</p>
      </div>
      <button type="button" onclick="exportarRecepcionDetalleProveedores()">Excel proveedores</button>
    </div>
    ${navRecepcionInterna("proveedores")}

    ${bloqueRecepcionProveedores(recepcion)}
  `;
}

function verRecepcionPaleteros() {
  if (recepcionSubmoduloActivo !== "paleteros") filtrosRecepcionProyeccion = { asn: "", placa: "", proveedor: "" };
  recepcionSubmoduloActivo = "paleteros";
  const capacidad = calcularCapacidadCd();
  const prediccionPts = prediccionLiberacionPts();
  const recepcion = calcularRecepcionUca(capacidad, prediccionPts);
  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <div>
        <h2>Recepcion - Paleteros</h2>
        <p class="muted-note">Pallets de paleteros, placa, tipo mono/multi y pasillo sugerido. La validacion de espacio queda en Proyeccion.</p>
      </div>
      <button type="button" onclick="exportarRecepcionDetallePaleteros()">Excel paleteros</button>
    </div>
    ${navRecepcionInterna("paleteros")}

    ${bloqueRecepcionPaleteros(recepcion)}
  `;
}

function verRecepcionUbicadosLpns() {
  recepcionSubmoduloActivo = "ubicados";
  const capacidad = calcularCapacidadCd();
  const prediccionPts = prediccionLiberacionPts();
  const recepcion = calcularRecepcionUca(capacidad, prediccionPts);
  recepcionUcaVista = recepcion;
  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <div>
        <h2>Recepcion - Ubicados LPN</h2>
        <p class="muted-note">Validacion de monopalets de paleteros contra LPNs ubicados en reserva MASS y estado UBICADO.</p>
      </div>
      <button type="button" onclick="exportarRecepcionUbicadosLpns()">Excel ubicados</button>
    </div>
    ${navRecepcionInterna("ubicados")}
    <div id="recepcionUbicadosContenido">${bloqueRecepcionUbicadosLpns(recepcion)}</div>
  `;
}

function verRecepcionProyeccionEspacio() {
  if (recepcionSubmoduloActivo !== "proyeccion") filtrosRecepcionProyeccion = { asn: "", placa: "", proveedor: "" };
  recepcionSubmoduloActivo = "proyeccion";
  const capacidad = calcularCapacidadCd();
  const prediccionPts = prediccionLiberacionPts();
  const recepcion = calcularRecepcionUca(capacidad, prediccionPts);
  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <div>
        <h2>Recepcion - Proyeccion</h2>
        <p class="muted-note">Validacion de espacio: pallets por recibir contra ubicaciones libres y liberacion PTS.</p>
      </div>
      <button type="button" onclick="exportarRecepcionUca()">Excel proyeccion</button>
    </div>
    ${navRecepcionInterna("proyeccion")}

    ${bloqueRecepcionUca(recepcion, false, "todos")}
  `;
}

function navRecepcionInterna(activo = "proveedores") {
  return `
    <div class="subtabs recepcion-subtabs">
      <button type="button" class="${activo === "proveedores" ? "active" : ""}" onclick="verRecepcionProveedores()">Proveedores</button>
      <button type="button" class="${activo === "paleteros" ? "active" : ""}" onclick="verRecepcionPaleteros()">Paleteros</button>
      <button type="button" class="${activo === "shipto" ? "active" : ""}" onclick="verRecepcionShipToY()">SHIP TO</button>
      <button type="button" class="${activo === "ubicados" ? "active" : ""}" onclick="verRecepcionUbicadosLpns()">Ubicados</button>
      <button type="button" class="${activo === "proyeccion" ? "active" : ""}" onclick="verRecepcionProyeccionEspacio()">Proyeccion</button>
    </div>
  `;
}

function verRecepcionShipToY() {
  recepcionSubmoduloActivo = "shipto";
  const capacidad = calcularCapacidadCd();
  const prediccionPts = prediccionLiberacionPts();
  const recepcion = calcularRecepcionUca(capacidad, prediccionPts);
  recepcionUcaVista = recepcion;
  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <div>
        <h2>Recepcion - SHIP TO Y</h2>
        <p class="muted-note">Validacion de ASN, camion, fecha de creacion, pallets mono/multi y codigos a separar.</p>
      </div>
      <button type="button" onclick="exportarValidacionPaleteroRecepcion()">Excel SHIP TO Y</button>
    </div>
    ${navRecepcionInterna("shipto")}
    ${bloqueValidacionPaleteroRecepcion(recepcion, true)}
  `;
}

function graficoCapacidad(titulo, data) {
  return `
    <article class="card capacity-card">
      <div class="capacity-head">
        <div>
          <h3>${htmlSeguro(titulo)}</h3>
          <strong>${data.total.pct.toFixed(1)}%</strong>
          <span>${fmt(data.total.ocupadas)} ocupadas de ${fmt(data.total.total)} ubicaciones</span>
        </div>
        <div class="capacity-ring" style="--p:${Math.min(100, data.total.pct)}">
          <b>${data.total.pct.toFixed(0)}%</b>
        </div>
      </div>
      <div class="capacity-mini-kpis">
        <div>
          <span>Total</span>
          <strong>${fmt(data.total.total)}</strong>
        </div>
        <div>
          <span>Ocupadas</span>
          <strong>${fmt(data.total.ocupadas)}</strong>
        </div>
        <div>
          <span>Libres</span>
          <strong>${fmt(data.total.libres)}</strong>
        </div>
      </div>
      <div class="capacity-bars">
        ${data.resumen.map(row => {
          const ocupado = Math.max(0, Math.min(100, row.pct));
          const libre = Math.max(0, 100 - ocupado);
          return `
            <div class="capacity-aisle">
              <div class="capacity-aisle-title">
                <span>Pasillo ${htmlSeguro(row.pasillo)}</span>
                <strong>${row.pct.toFixed(1)}%</strong>
              </div>
              <div class="capacity-stack" title="${row.pct.toFixed(1)}% ocupado">
                <i class="occupied" style="width:${ocupado}%"></i>
                <i class="free" style="width:${libre}%"></i>
              </div>
              <div class="capacity-aisle-values">
                <b>${fmt(row.ocupadas)}</b><small>ocupadas</small>
                <b>${fmt(row.libres)}</b><small>libres</small>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </article>
  `;
}

function bloquePrediccionPts(data) {
  prediccionPtsVista = data;
  pasilloPrediccionPtsActivo = "";
  const maxUbicaciones = Math.max(1, ...data.resumen.map(row => row.ubicaciones));
  return `
    <section class="card pts-release-card">
      <div class="section-head">
        <div>
          <h2>Prediccion de liberacion PTS</h2>
          <p class="muted-note">Tareas PTS en estado Listo ubicadas en reserva. Son posiciones que deberian liberarse durante el dia al trabajar pallets completos.</p>
        </div>
      </div>
      <div class="capacity-mini-kpis pts-release-kpis">
        <div>
          <span>Ubicaciones por liberar</span>
          <strong>${fmt(data.total.ubicaciones)}</strong>
        </div>
        <div>
          <span>Tareas PTS listas</span>
          <strong>${fmt(data.total.tareas.size)}</strong>
        </div>
        <div>
          <span>Bultos comprometidos</span>
          <strong>${fmt(data.total.bultos)}</strong>
        </div>
        <div>
          <span>LPNs entrada</span>
          <strong>${fmt(data.total.lpns.size)}</strong>
        </div>
      </div>
      <div class="pts-release-grid">
        <div class="pts-release-bars">
          ${data.resumen.map(row => {
            const ancho = Math.max(0, Math.min(100, (row.ubicaciones / maxUbicaciones) * 100));
            return `
              <button class="pts-release-row" type="button" data-pasillo="${atributoSeguro(row.pasillo)}" onclick="filtrarPrediccionPts('${atributoSeguro(row.pasillo)}')">
                <span>Pasillo ${htmlSeguro(row.pasillo)}</span>
                <div class="pts-release-track"><i style="width:${ancho}%"></i></div>
                <strong>${fmt(row.ubicaciones)}</strong>
                <small>${fmt(row.bultos)} bultos</small>
              </button>
            `;
          }).join("")}
        </div>
        <div class="pts-release-detail-card">
          <div class="section-head compact-head">
            <h3 id="tituloPrediccionPts">Detalle todos los pasillos</h3>
            <button type="button" onclick="filtrarPrediccionPts('')">Ver todos</button>
          </div>
          <div id="detallePrediccionPts">
            ${tablaPrediccionPts(data.ubicaciones)}
          </div>
        </div>
      </div>
    </section>
  `;
}

function tablaPrediccionPts(rows) {
  return tabla(["Pasillo", "Ubicacion", "Tareas", "LPNs", "Productos", "Bultos"], rows.map(row => `
    <tr>
      <td><strong>${htmlSeguro(row.pasillo)}</strong></td>
      <td>${htmlSeguro(row.ubicacion)}</td>
      <td class="number">${fmt(row.tareas.size)}</td>
      <td class="number">${fmt(row.lpns.size)}</td>
      <td class="number">${fmt(row.productos.size)}</td>
      <td class="number"><strong>${fmt(row.bultos)}</strong></td>
    </tr>
  `), "Sin tareas PTS listas en reserva");
}

function filtrarPrediccionPts(pasillo) {
  pasilloPrediccionPtsActivo = limpiar(pasillo);
  const rows = pasilloPrediccionPtsActivo
    ? prediccionPtsVista.ubicaciones.filter(row => row.pasillo === pasilloPrediccionPtsActivo)
    : prediccionPtsVista.ubicaciones;
  const titulo = document.getElementById("tituloPrediccionPts");
  const detalle = document.getElementById("detallePrediccionPts");
  if (titulo) titulo.textContent = pasilloPrediccionPtsActivo ? `Detalle Pasillo ${pasilloPrediccionPtsActivo}` : "Detalle todos los pasillos";
  if (detalle) detalle.innerHTML = tablaPrediccionPts(rows);
  document.querySelectorAll(".pts-release-row").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.pasillo === pasilloPrediccionPtsActivo);
  });
}

function canonColumnaRecepcion(valor) {
  return limpiar(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
}

function campoRecepcion(row, nombres) {
  const directo = campo(row, nombres);
  if (directo !== "") return directo;
  const objetivos = new Set(nombres.map(canonColumnaRecepcion));
  const key = Object.keys(row || {}).find(k => objetivos.has(canonColumnaRecepcion(k)));
  return key ? row[key] : "";
}

function codigoRecepcion(row) {
  return normalizar(campoRecepcion(row, ["Codigo", "CODIGO", "Producto", "PRODUCTO"]));
}

function codigoAltRecepcion(row) {
  return normalizar(campoRecepcion(row, ["Codigo Alternativo", "CODIGO ALTERNATIVO", "CODIGO_ALT", "Cod Alternat", "Artic Padre", "COD ALTERNATIVO"]));
}

function descripcionRecepcion(row) {
  return limpiar(campoRecepcion(row, ["Descrip Artic", "Descrip Artíc", "Descrip ArtÃ­c", "Descripcion", "DESCRIPCION", "Descripcion Producto"]));
}

function bultosRecepcion(row) {
  const bultos = num(campoRecepcion(row, ["BULTOS", "Bultos", "Cases", "CS"]));
  if (bultos > 0) return bultos;
  const unidades = [
    campoRecepcion(row, ["Un Rcb", "UN RCB"]),
    campoRecepcion(row, ["Un Env", "UN ENV"]),
    campoRecepcion(row, ["UnPreRcb", "UN PRERCB", "Un CodHijo PreRcb"])
  ].map(num).find(v => v > 0) || 0;
  const std = num(campoRecepcion(row, ["Std Case Qty", "STD CASE QTY", "STD_CASE_QTY"]));
  return std > 0 ? unidades / std : unidades;
}

function numRecepcion(valor) {
  const texto = limpiar(valor).replace(/\s/g, "");
  if (!texto) return 0;
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(texto)) return Number(texto.replace(/[.,]/g, ""));
  if (/^-?\d{1,3}([.,]\d{3})+[.,]\d+$/.test(texto)) {
    const decimal = texto.match(/[.,](\d+)$/);
    if (decimal && decimal[1].length !== 3) {
      return Number(texto.slice(0, -decimal[0].length).replace(/[.,]/g, "") + "." + decimal[1]);
    }
    return Number(texto.replace(/[.,]/g, ""));
  }
  const normal = Number(texto.replace(",", "."));
  return Number.isFinite(normal) ? normal : 0;
}

function bultosProveedorRecepcion(row) {
  const bultos = numRecepcion(campoRecepcion(row, ["BULTOS", "Bultos", "Cases", "CS"]));
  if (bultos > 0) return bultos;
  const unidades = numRecepcion(campoRecepcion(row, ["Un Env", "UN ENV"]));
  const caseQty = numRecepcion(campoRecepcion(row, ["Std Case Qty", "STD CASE QTY", "STD_CASE_QTY", "Case Qty", "CASE QTY"]));
  return caseQty > 0 ? unidades / caseQty : unidades;
}

function parseFechaHoraRecepcion(valor) {
  const txt = limpiar(valor);
  if (!txt) return null;
  const partes = txt.split(/\s+/);
  const fecha = partes[0] || "";
  const hora = partes.find(p => p.includes(":")) || "00:00:00";
  const f = fecha.split(/[\/-]/).map(Number);
  const h = hora.split(":").map(Number);
  if (f.length !== 3 || f.some(n => !Number.isFinite(n))) return null;
  const horaPartes = [h[0] || 0, h[1] || 0, h[2] || 0];
  const normalizarAnio = anio => anio < 100 ? 2000 + anio : anio;
  const crearFecha = (anio, mes, dia) => {
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    const fechaObj = new Date(normalizarAnio(anio), mes - 1, dia, ...horaPartes);
    return Number.isNaN(fechaObj.getTime()) ? null : fechaObj;
  };
  const candidatos = String(f[0]).length === 4
    ? [crearFecha(f[0], f[1], f[2])]
    : [crearFecha(f[2], f[1], f[0]), crearFecha(f[2], f[0], f[1])];
  const validos = candidatos.filter(Boolean);
  if (!validos.length) return null;
  const ahora = new Date();
  const pasados = validos.filter(fechaObj => fechaObj <= ahora);
  const base = pasados.length ? pasados : validos;
  return base.sort((a, b) => Math.abs(ahora - a) - Math.abs(ahora - b))[0];
}

function estadoCincoDiasRecepcion(fechaTexto) {
  const fecha = parseFechaHoraRecepcion(fechaTexto);
  if (!fecha) return { dias: 0, horas: 0, faltanDias: 0, estado: "SIN FECHA", clase: "warn", mensaje: "Sin fecha de creacion para validar." };
  const ahora = new Date();
  const horas = Math.max(0, (ahora - fecha) / 36e5);
  const dias = horas / 24;
  const faltanHoras = Math.max(0, 120 - horas);
  if (horas >= 120) {
    return {
      dias,
      horas,
      faltanDias: 0,
      estado: "VENCIDO",
      clase: "danger",
      mensaje: `Ya pasaron ${dias.toFixed(1)} dias desde la creacion. Supero los 5 dias.`
    };
  }
  return {
    dias,
    horas,
    faltanDias: faltanHoras / 24,
    estado: horas >= 96 ? "CRITICO" : horas >= 72 ? "ALERTA" : "EN TIEMPO",
    clase: horas >= 96 ? "danger" : horas >= 72 ? "warn" : "ok",
    mensaje: `Van ${dias.toFixed(1)} dias. Faltan ${(faltanHoras / 24).toFixed(1)} dias para cumplir 5 dias.`
  };
}

function mapaAsnPaleteroRecepcion() {
  const mapa = new Map();
  (dataRecepcionPaleterosAsn || []).forEach(row => {
    const asn = limpiar(campoRecepcion(row, ["ASN Entrada", "ASN", "ASN_ENTRADA"]));
    if (!asn) return;
    mapa.set(asn, {
      asn,
      camion: limpiar(campoRecepcion(row, ["Nro CamiÃ³n", "Nro CamiÃƒÂ³n", "Nro Camion", "NRO CAMION", "Camion"])),
      fechaCreacion: limpiar(campoRecepcion(row, ["Fe y Hr Creac", "FE Y HR CREAC", "Fecha Creacion", "Fecha CreaciÃ³n"]))
    });
  });
  return mapa;
}

function codigosSepararPaleteroRecepcion() {
  const codigos = new Set();
  (dataRecepcionPaleterosCodigo || []).forEach(row => {
    const codigo = normalizar(campoRecepcion(row, ["CODIGO", "Codigo", "Producto", "PRODUCTO"]));
    if (codigo) codigos.add(codigo);
  });
  return codigos;
}

function valorPorCanonParcial(row, patrones) {
  const canonPatrones = patrones.map(canonColumnaRecepcion);
  const key = Object.keys(row || {}).find(nombre => {
    const canon = canonColumnaRecepcion(nombre);
    return canonPatrones.some(patron => canon === patron || canon.includes(patron));
  });
  return key ? row[key] : "";
}

function mapaAsnPaleteroRecepcionSeguro() {
  const key = firmaFilas(dataRecepcionPaleterosAsn, ["Nro ASN", "NRO ASN", "ASN", "Nro Camion", "NRO CAMION"]);
  if (cacheAsnPaleteroRecepcion.key === key && cacheAsnPaleteroRecepcion.data) return cacheAsnPaleteroRecepcion.data;
  const mapa = new Map();
  (dataRecepcionPaleterosAsn || []).forEach(row => {
    const asn = limpiar(campoRecepcion(row, ["Nro ASN", "NRO ASN", "ASN Entrada", "ASN", "ASN_ENTRADA"]) || valorPorCanonParcial(row, ["Nro ASN", "ASN"]));
    if (!asn) return;
    mapa.set(asn, {
      asn,
      camion: limpiar(campoRecepcion(row, ["Nro CamiÃ³n", "Nro CamiÃƒÂ³n", "Nro Camion", "NRO CAMION", "Camion"]) || valorPorCanonParcial(row, ["Nro Camion", "Camion"])),
      fechaCreacion: limpiar(campoRecepcion(row, ["Fe y Hr Creac", "FE Y HR CREAC", "Fecha Creacion"]) || valorPorCanonParcial(row, ["Fe Hr Creac", "Fecha Creacion"]))
    });
  });
  cacheAsnPaleteroRecepcion = { key, data: mapa };
  return mapa;
}

function validacionPaleteroAsnCodigo() {
  const asnInfo = mapaAsnPaleteroRecepcionSeguro();
  const codigosValidar = codigosSepararPaleteroRecepcion();
  const pallets = new Map();
  const lpns = new Map();

  (dataRecepcionPaleteros || []).forEach(row => {
    if (!recepcionPendienteAlmacenaje(row)) return;
    const asn = limpiar(campoRecepcion(row, ["ASN Entrada", "ASN", "ASN_ENTRADA"]));
    const pallet = limpiar(campoRecepcion(row, ["Nro Pallet", "NRO PALLET", "Pallet", "PALLET"]));
    const lpn = limpiar(campoRecepcion(row, ["Nro LPN", "LPN", "NRO LPN"]));
    const codigo = codigoRecepcion(row) || codigoAltRecepcion(row);
    if (!asn || !pallet) return;
    const info = asnInfo.get(asn) || {};
    const key = `${asn}|${pallet}`;
    if (!pallets.has(key)) {
      pallets.set(key, {
        asn,
        camion: info.camion || "SIN CAMION",
        fechaCreacion: info.fechaCreacion || "",
        pallet,
        lpnsSet: new Set(),
        codigosSet: new Set(),
        codigosSepararSet: new Set(),
        productosShipTo: new Map(),
        bultos: 0,
        unidades: 0
      });
    }
    const item = pallets.get(key);
    if (lpn) item.lpnsSet.add(lpn);
    if (codigo) {
      item.codigosSet.add(codigo);
      if (codigosValidar.has(codigo)) item.codigosSepararSet.add(codigo);
    }
    item.bultos += bultosRecepcion(row);
    item.unidades += numRecepcion(campoRecepcion(row, ["Un Env", "UN ENV", "Un Rcb", "UN RCB"]));
    if (codigo && codigosValidar.has(codigo)) {
      const prodKey = `${lpn}|${codigo}`;
      if (!item.productosShipTo.has(prodKey)) {
        item.productosShipTo.set(prodKey, {
          asn,
          camion: info.camion || "SIN CAMION",
          fechaCreacion: info.fechaCreacion || "",
          pallet,
          lpn,
          producto: codigo,
          descripcion: descripcionRecepcion(row),
          bultos: 0,
          unidades: 0
        });
      }
      const prod = item.productosShipTo.get(prodKey);
      prod.bultos += bultosRecepcion(row);
      prod.unidades += numRecepcion(campoRecepcion(row, ["Un Env", "UN ENV", "Un Rcb", "UN RCB"]));
    }

    if (lpn) {
      const lpnKey = `${asn}|${pallet}|${lpn}`;
      if (!lpns.has(lpnKey)) {
        lpns.set(lpnKey, {
          asn,
          camion: info.camion || "SIN CAMION",
          fechaCreacion: info.fechaCreacion || "",
          pallet,
          lpn,
          codigosSet: new Set(),
          codigosSepararSet: new Set(),
          bultos: 0,
          unidades: 0
        });
      }
      const lpnItem = lpns.get(lpnKey);
      if (codigo) {
        lpnItem.codigosSet.add(codigo);
        if (codigosValidar.has(codigo)) lpnItem.codigosSepararSet.add(codigo);
      }
      lpnItem.bultos += bultosRecepcion(row);
      lpnItem.unidades += numRecepcion(campoRecepcion(row, ["Un Env", "UN ENV", "Un Rcb", "UN RCB"]));
    }
  });

  const detalle = Array.from(pallets.values()).map(item => {
    const tiempo = estadoCincoDiasRecepcion(item.fechaCreacion);
    const codigos = Array.from(item.codigosSet);
    const codigosSeparar = Array.from(item.codigosSepararSet);
    return {
      asn: item.asn,
      camion: item.camion,
      fechaCreacion: item.fechaCreacion,
      pallet: item.pallet,
      lpns: item.lpnsSet.size,
      lpnsTxt: Array.from(item.lpnsSet).join(" | "),
      codigos: codigos.length,
      codigosTxt: codigos.join(" | "),
      codigosSeparar: codigosSeparar.length,
      codigosSepararTxt: codigosSeparar.join(" | "),
      tipo: codigos.length > 1 ? "MULTI" : "MONO",
      bultos: item.bultos,
      unidades: item.unidades,
      tieneCodigoSeparar: codigosSeparar.length > 0,
      productosShipTo: Array.from(item.productosShipTo.values()),
      ...tiempo
    };
  }).sort((a, b) => String(a.camion).localeCompare(String(b.camion)) || String(a.asn).localeCompare(String(b.asn)) || String(a.pallet).localeCompare(String(b.pallet)));

  const resumenPlaca = new Map();
  detalle.filter(row => row.tieneCodigoSeparar).forEach(row => {
    const placa = row.camion || "SIN CAMION";
    if (!resumenPlaca.has(placa)) {
      resumenPlaca.set(placa, {
        placa,
        asnSet: new Set(),
        palletSet: new Set(),
        mono: 0,
        multi: 0,
        codigosSepararSet: new Set(),
        bultos: 0
      });
    }
    const item = resumenPlaca.get(placa);
    item.asnSet.add(row.asn);
    item.palletSet.add(`${row.asn}|${row.pallet}`);
    if (row.tipo === "MONO") item.mono += 1;
    if (row.tipo === "MULTI") item.multi += 1;
    item.bultos += row.bultos;
    row.codigosSepararTxt.split(" | ").map(limpiar).filter(Boolean).forEach(codigo => item.codigosSepararSet.add(codigo));
  });

  const resumenPlacaShipTo = Array.from(resumenPlaca.values()).map(item => ({
    placa: item.placa,
    asns: Array.from(item.asnSet).join(" | "),
    asnSet: item.asnSet,
    palletsShipTo: item.palletSet.size,
    mono: item.mono,
    multi: item.multi,
    codigos: item.codigosSepararSet.size,
    codigosTxt: Array.from(item.codigosSepararSet).join(" | "),
    bultos: item.bultos
  })).sort((a, b) => b.palletsShipTo - a.palletsShipTo || a.placa.localeCompare(b.placa));

  const detalleProductoShipTo = detalle
    .filter(row => row.tieneCodigoSeparar)
    .flatMap(row => (row.productosShipTo || []).map(prod => ({
      ...prod,
      tipo: row.tipo,
      codigosPallet: row.codigos,
      codigosSepararTxt: row.codigosSepararTxt
    })));

  const asn = new Map();
  detalle.forEach(row => {
    if (!asn.has(row.asn)) {
      asn.set(row.asn, {
        asn: row.asn,
        camion: row.camion,
        fechaCreacion: row.fechaCreacion,
        pallets: 0,
        mono: 0,
        multi: 0,
        palletsSeparar: 0,
        codigosSepararSet: new Set(),
        bultos: 0,
        unidades: 0,
        tiempo: estadoCincoDiasRecepcion(row.fechaCreacion)
      });
    }
    const item = asn.get(row.asn);
    item.pallets += 1;
    item.bultos += row.bultos;
    item.unidades += row.unidades;
    if (row.tipo === "MONO") item.mono += 1;
    if (row.tipo === "MULTI") item.multi += 1;
    if (row.tieneCodigoSeparar) item.palletsSeparar += 1;
    row.codigosSepararTxt.split(" | ").map(limpiar).filter(Boolean).forEach(codigo => item.codigosSepararSet.add(codigo));
  });

  const resumenAsn = Array.from(asn.values()).map(item => ({
    ...item,
    codigosSeparar: item.codigosSepararSet.size,
    codigosSepararTxt: Array.from(item.codigosSepararSet).join(" | ")
  })).sort((a, b) => b.palletsSeparar - a.palletsSeparar || b.pallets - a.pallets);

  const detalleLpn = Array.from(lpns.values()).map(item => {
    const codigos = Array.from(item.codigosSet);
    const codigosSeparar = Array.from(item.codigosSepararSet);
    const tiempo = estadoCincoDiasRecepcion(item.fechaCreacion);
    return {
      asn: item.asn,
      camion: item.camion,
      fechaCreacion: item.fechaCreacion,
      pallet: item.pallet,
      lpn: item.lpn,
      codigos: codigos.length,
      codigosTxt: codigos.join(" | "),
      codigosSeparar: codigosSeparar.length,
      codigosSepararTxt: codigosSeparar.join(" | "),
      tipo: codigos.length > 1 ? "MULTI" : "MONO",
      observacion: codigosSeparar.length ? "SEPARAR POR CODIGO" : "NO SEPARAR",
      bultos: item.bultos,
      unidades: item.unidades,
      tieneCodigoSeparar: codigosSeparar.length > 0,
      ...tiempo
    };
  }).sort((a, b) => String(a.camion).localeCompare(String(b.camion)) || String(a.asn).localeCompare(String(b.asn)) || String(a.pallet).localeCompare(String(b.pallet)) || String(a.lpn).localeCompare(String(b.lpn)));

  return {
    resumenAsn,
    resumenPlacaShipTo,
    detalle,
    detalleLpn,
    detalleProductoShipTo,
    total: {
      asn: resumenAsn.length,
      camiones: new Set(resumenAsn.map(row => row.camion).filter(Boolean)).size,
      pallets: detalle.length,
      mono: detalle.filter(row => row.tipo === "MONO").length,
      multi: detalle.filter(row => row.tipo === "MULTI").length,
      palletsSeparar: detalle.filter(row => row.tieneCodigoSeparar).length,
      codigosBase: codigosValidar.size,
      vencidos: resumenAsn.filter(row => row.tiempo.estado === "VENCIDO").length,
      alertas: resumenAsn.filter(row => ["ALERTA", "CRITICO"].includes(row.tiempo.estado)).length
    }
  };
}

function claveProductoRecepcion(codigo, alternativo) {
  return normalizar(codigo) || normalizar(alternativo);
}

function productoContextoRecepcion() {
  const porCodigo = new Map();
  const porAlt = new Map();
  dataProductos.forEach(row => {
    const codigo = normalizar(campoRecepcion(row, ["CODIGO", "Codigo", "PRODUCTO"]));
    const alt = normalizar(campoRecepcion(row, ["CODIGO_ALT", "COD_ALT", "CODIGO ALTERNATIVO", "Codigo Alternativo", "Cod Alternat"]));
    if (codigo && !porCodigo.has(codigo)) porCodigo.set(codigo, row);
    if (alt && !porAlt.has(alt)) porAlt.set(alt, row);
  });
  return { porCodigo, porAlt };
}

function productoRecepcion(ctx, codigo, alternativo) {
  return ctx.productos.porCodigo.get(normalizar(codigo)) || ctx.productos.porAlt.get(normalizar(alternativo));
}

function jerarquiaRecepcion(ctx, codigo, alternativo, row = {}) {
  const producto = productoRecepcion(ctx, codigo, alternativo) || {};
  return limpiar(campoRecepcion(producto, [
    "JERARQUIA 2",
    "JERARQUIA2",
    "JERARQ2",
    "Jerarq2",
    "Jerarquia 2",
    "JERARQUIA"
  ]) || campoRecepcion(row, ["JERARQUIA 2", "JERARQUIA2", "JERARQ2", "Jerarq2", "Jerarquia 2", "JERARQUIA"]));
}

function sumarNestedMapa(mapa, clave, subclave, valor) {
  if (!clave || !subclave || !valor) return;
  if (!mapa.has(clave)) mapa.set(clave, new Map());
  const inner = mapa.get(clave);
  inner.set(subclave, (inner.get(subclave) || 0) + valor);
}

function ganadorMapa(mapa) {
  let mejor = "";
  let mayor = -1;
  (mapa || new Map()).forEach((valor, clave) => {
    if (valor > mayor) {
      mayor = valor;
      mejor = clave;
    }
  });
  return mejor;
}

function construirContextoRecepcionUca() {
  const key = [
    firmaFilas(dataProductos, ["CODIGO", "CODIGO_ALT", "JERARQUIA 2"]),
    firmaFilas(dataLPN, ["LPN", "ESTADO", "UBICACION", "CODIGO", "CODIGO_ALT", "BULTOS"])
  ].join("::");
  if (cacheContextoRecepcion.key === key && cacheContextoRecepcion.data) return cacheContextoRecepcion.data;
  const productos = productoContextoRecepcion();
  const porProductoPasillo = new Map();
  const porJerarquiaPasillo = new Map();
  const palletsPorProducto = new Map();

  lpnsOperativos().forEach(row => {
    const ubicacion = limpiar(row.UBICACION);
    if (!ubicacionMassValidaCapacidad(ubicacion)) return;
    const codigo = normalizar(row.CODIGO);
    const alternativo = normalizar(row.CODIGO_ALT);
    const keyProducto = claveProductoRecepcion(codigo, alternativo);
    const bultos = num(row.BULTOS);
    if (!keyProducto || bultos <= 0) return;
    const pasillo = pasilloMass(ubicacion);
    sumarNestedMapa(porProductoPasillo, keyProducto, pasillo, bultos);

    const jerarquia = jerarquiaRecepcion({ productos }, codigo, alternativo, row);
    if (jerarquia) sumarNestedMapa(porJerarquiaPasillo, normalizar(jerarquia), pasillo, bultos);

    const lpn = limpiar(row.LPN);
    const clavePallet = `${keyProducto}|${lpn || ubicacion}`;
    if (!palletsPorProducto.has(clavePallet)) {
      palletsPorProducto.set(clavePallet, { keyProducto, bultos: 0 });
    }
    palletsPorProducto.get(clavePallet).bultos += bultos;
  });

  const repeticionesPallet = new Map();
  palletsPorProducto.forEach(item => {
    const cantidad = Math.round(item.bultos * 100) / 100;
    if (cantidad <= 15) return;
    sumarNestedMapa(repeticionesPallet, item.keyProducto, String(cantidad), 1);
  });

  const maxPalletPorProducto = new Map();
  repeticionesPallet.forEach((cantidades, keyProducto) => {
    let mejor = 0;
    cantidades.forEach((repeticiones, cantidadTexto) => {
      const cantidad = num(cantidadTexto);
      if (repeticiones > 1 && cantidad > mejor) mejor = cantidad;
    });
    if (mejor > 0) maxPalletPorProducto.set(keyProducto, mejor);
  });

  cacheContextoRecepcion = { key, data: { productos, porProductoPasillo, porJerarquiaPasillo, maxPalletPorProducto } };
  return cacheContextoRecepcion.data;
}

function resolverPasilloRecepcion(ctx, codigo, alternativo, row = {}) {
  const keyProducto = claveProductoRecepcion(codigo, alternativo);
  const porProducto = ganadorMapa(ctx.porProductoPasillo.get(keyProducto));
  if (porProducto) return { pasillo: porProducto, metodo: "HISTORICO PRODUCTO" };

  const jerarquia = jerarquiaRecepcion(ctx, codigo, alternativo, row);
  const porJerarquia = ganadorMapa(ctx.porJerarquiaPasillo.get(normalizar(jerarquia)));
  if (porJerarquia) return { pasillo: porJerarquia, metodo: `JERARQUIA ${jerarquia}` };

  return { pasillo: "SIN CLASIFICAR", metodo: jerarquia ? `VALIDAR ${jerarquia}` : "SIN HISTORICO" };
}

function detalleProductoRecepcion(ctx, row) {
  const codigo = codigoRecepcion(row);
  const alternativo = codigoAltRecepcion(row);
  const producto = productoRecepcion(ctx, codigo, alternativo) || {};
  return {
    codigo,
    alternativo,
    descripcion: descripcionRecepcion(row) || limpiar(campoRecepcion(producto, ["DESCRIPCION", "Descripcion", "Descrip Artic"]))
  };
}

function recepcionPendienteAlmacenaje(row) {
  const estado = normalizar(campoRecepcion(row, ["Estado de LPN", "Estado LPN", "ESTADO", "Estado"]));
  const ubicacion = limpiar(campoRecepcion(row, ["Ubicacion", "UBICACION", "Ubicación"]));
  return !(estado.includes("UBICADO") && ubicacionMassValidaCapacidad(ubicacion));
}

function diagnosticoGrupoRecepcion(rows) {
  return (rows || []).reduce((acc, row) => {
    acc.total += 1;
    const ubicadoMass = !recepcionPendienteAlmacenaje(row);
    if (ubicadoMass) acc.ubicadosMass += 1;
    else acc.pendientes += 1;
    const codigo = codigoRecepcion(row) || codigoAltRecepcion(row);
    const cantidad = bultosRecepcion(row);
    if (!codigo || cantidad <= 0) acc.sinDato += 1;
    return acc;
  }, { total: 0, pendientes: 0, ubicadosMass: 0, sinDato: 0 });
}

function diagnosticoRecepcionProyectada() {
  const proveedorCreado = (dataRecepcionProveedores || []).filter(esDetalleOcCreado).length;
  const proveedorOc = new Set((dataRecepcionProveedores || []).map(ocProveedorRecepcion).filter(Boolean)).size;
  return {
    proveedores: { ...diagnosticoGrupoRecepcion(dataRecepcionProveedores), creados: proveedorCreado, oc: proveedorOc, resumenOc: dataRecepcionProveedoresResumen.length },
    paleteros: diagnosticoGrupoRecepcion(dataRecepcionPaleteros)
  };
}

function bloqueDatosTomadosRecepcion(diagnostico) {
  const proveedorEjemplo = (dataRecepcionProveedores || []).find(row => codigoRecepcion(row) || codigoAltRecepcion(row)) || {};
  const paleteroEjemplo = (dataRecepcionPaleteros || []).find(row => codigoRecepcion(row) || codigoAltRecepcion(row)) || {};
  return `
    <section class="dashboard-layout recepcion-reglas">
      <div class="card">
        <h3>Datos tomados de proveedores</h3>
        <p class="muted-note">No es la misma logica que paleteros: aca se usa DETALLE_OC por Orden Compra y cada producto arma pallets mono producto.</p>
        ${tabla(["Dato", "Columna usada", "Ejemplo"], [
          filaDatoRecepcion("OC", "Orden Compra", ocProveedorRecepcion(proveedorEjemplo)),
          filaDatoRecepcion("Estado", "Estado = CREADO", campoRecepcion(proveedorEjemplo, ["Estado", "ESTADO"])),
          filaDatoRecepcion("Producto", "Producto / Codigo Alternativo", codigoRecepcion(proveedorEjemplo) || codigoAltRecepcion(proveedorEjemplo)),
          filaDatoRecepcion("Descripcion", "Descrip Artic", descripcionRecepcion(proveedorEjemplo)),
          filaDatoRecepcion("Cantidad", "BULTOS", fmt(bultosProveedorRecepcion(proveedorEjemplo))),
          filaDatoRecepcion("Cruce resumen", "Nro OC", `${diagnostico.proveedores.oc} OC detalle / ${diagnostico.proveedores.resumenOc} filas resumen`),
          filaDatoRecepcion("Filtro", "Estado", `${diagnostico.proveedores.creados} filas creadas`)
        ])}
      </div>
      <div class="card">
        <h3>Datos tomados de paleteros</h3>
        <p class="muted-note">Aca se agrupa por Nro Pallet. Si un pallet tiene mas de un producto se marca como MULTI.</p>
        ${tabla(["Dato", "Columna usada", "Ejemplo"], [
          filaDatoRecepcion("ASN", "ASN Entrada", campoRecepcion(paleteroEjemplo, ["ASN Entrada", "ASN"])),
          filaDatoRecepcion("Paletero", "Nombre de instalacion", campoRecepcion(paleteroEjemplo, ["Nombre de instalacion", "Nombre de instalación", "Nombre de instalaciÃ³n"])),
          filaDatoRecepcion("Producto", "Codigo / Codigo Alternativo", codigoRecepcion(paleteroEjemplo) || codigoAltRecepcion(paleteroEjemplo)),
          filaDatoRecepcion("Descripcion", "Descrip Artic", descripcionRecepcion(paleteroEjemplo)),
          filaDatoRecepcion("Pallet", "Nro Pallet", campoRecepcion(paleteroEjemplo, ["Nro Pallet", "Pallet"])),
          filaDatoRecepcion("LPN detalle", "Nro LPN", campoRecepcion(paleteroEjemplo, ["Nro LPN", "LPN"])),
          filaDatoRecepcion("Filtro", "Estado de LPN + Ubicacion", `${diagnostico.paleteros.pendientes} pendientes / ${diagnostico.paleteros.ubicadosMass} ya ubicados Mass`)
        ])}
      </div>
    </section>
  `;
}

function filaDatoRecepcion(dato, columna, ejemplo) {
  return `
    <tr>
      <td><strong>${htmlSeguro(dato)}</strong></td>
      <td>${htmlSeguro(columna)}</td>
      <td>${htmlSeguro(limpiar(ejemplo) || "SIN DATO")}</td>
    </tr>
  `;
}

function ocProveedorRecepcion(row) {
  return limpiar(campoRecepcion(row, ["Orden Compra", "ORDEN COMPRA", "Orden de Compra", "OC", "Nro OC", "NRO OC", "NRO_OC"]));
}

function estadoDetalleOcProveedor(row) {
  return normalizar(campoRecepcion(row, ["Estado", "ESTADO"]));
}

function esDetalleOcCreado(row) {
  return estadoDetalleOcProveedor(row) === "CREADO";
}

function resumenProveedorPorOc() {
  const mapa = new Map();
  (dataRecepcionProveedoresResumen || []).forEach(row => {
    const oc = ocProveedorRecepcion(row);
    if (!oc) return;
    const unEnv = numRecepcion(campoRecepcion(row, ["Un Env", "UN ENV"]));
    mapa.set(oc, {
      oc,
      proveedor: limpiar(campoRecepcion(row, ["Nombre Proveedor", "NOMBRE PROVEEDOR", "Proveedor", "PROVEEDOR"])),
      tipoOc: limpiar(campoRecepcion(row, ["Tipo OC", "TIPO OC", "Tipo", "TIPO"])),
      unEnv,
      packingList: unEnv > 0,
      row
    });
  });
  return mapa;
}

function cuentaPackingListProveedor(infoOc) {
  return Boolean(infoOc?.packingList) || num(infoOc?.unEnv) > 0;
}

function validacionesPalletProveedor() {
  try {
    return JSON.parse(localStorage.getItem("operaciones_validacion_pallet_proveedor") || "{}");
  } catch {
    return {};
  }
}

function guardarValidacionPalletProveedor() {
  const codigo = normalizar(document.getElementById("validacionProveedorCodigo")?.value);
  const maxPallet = num(document.getElementById("validacionProveedorMax")?.value);
  const observacion = limpiar(document.getElementById("validacionProveedorObs")?.value);
  if (!codigo) return alert("Ingresa el codigo del producto.");
  if (maxPallet <= 0) return alert("Ingresa cuantos bultos trae el pallet fisico.");

  const validaciones = validacionesPalletProveedor();
  validaciones[codigo] = { maxPallet, observacion, actualizado: new Date().toISOString() };
  localStorage.setItem("operaciones_validacion_pallet_proveedor", JSON.stringify(validaciones));
  invalidarCacheOperaciones();
  verRecepcionProyectada();
}

function prepararValidacionPalletProveedor(codigo, descripcion = "") {
  const inputCodigo = document.getElementById("validacionProveedorCodigo");
  const inputObs = document.getElementById("validacionProveedorObs");
  if (inputCodigo) inputCodigo.value = normalizar(codigo);
  if (inputObs && descripcion) inputObs.value = descripcion;
  document.getElementById("validacionProveedorMax")?.focus();
}

function calcularPalletsProveedor(bultos, maxPallet) {
  const maximo = num(maxPallet);
  const cantidad = num(bultos);
  if (maximo <= 0 || cantidad <= 0) return { pallets: 0, completos: 0, saldo: cantidad, cuentaSaldo: false };
  const completos = Math.floor(cantidad / maximo);
  const saldo = cantidad - completos * maximo;
  const cuentaSaldo = saldo >= maximo / 2;
  const pallets = completos + (cuentaSaldo ? 1 : 0);
  return { pallets, completos, saldo, cuentaSaldo };
}

function maxPalletReferenciaProveedor(ctx, producto) {
  const validaciones = validacionesPalletProveedor();
  const codigos = [producto.codigo, producto.alternativo].map(normalizar).filter(Boolean);
  const codigoValidado = codigos.find(codigo => validaciones[codigo]?.maxPallet > 0);
  if (codigoValidado) {
    const validacion = validaciones[codigoValidado];
    return { maxPallet: num(validacion.maxPallet), metodo: `VALIDADO FISICO ${fmt(validacion.maxPallet)} BUL`, origen: "VALIDADO", observacion: validacion.observacion || "" };
  }

  const maxProducto = ctx.maxPalletPorProducto.get(claveProductoRecepcion(producto.codigo, producto.alternativo)) || 0;
  if (maxProducto > 0) return { maxPallet: maxProducto, metodo: `MAX APRENDIDO ${fmt(maxProducto)} BUL`, origen: "APRENDIDO" };

  const aprendidos = Array.from(ctx.maxPalletPorProducto.values()).map(num).filter(v => v > 0);
  if (aprendidos.length) {
    const promedio = aprendidos.reduce((a, b) => a + b, 0) / aprendidos.length;
    return { maxPallet: promedio, metodo: `PROMEDIO APRENDIDO ${fmt(promedio)} BUL`, origen: "PROMEDIO" };
  }

  return { maxPallet: 60, metodo: "APROX 60 BUL SIN REFERENCIA", origen: "APROXIMADO" };
}

function gruposProveedorRecepcion(ctx) {
  const porOc = resumenProveedorPorOc();
  const porProducto = new Map();

  (dataRecepcionProveedores || []).forEach(row => {
    if (!esDetalleOcCreado(row)) return;
    const oc = ocProveedorRecepcion(row);
    if (!oc) return;
    const infoOc = porOc.get(oc) || { oc, proveedor: "", tipoOc: "", unEnv: 0, packingList: false };
    const producto = detalleProductoRecepcion(ctx, row);
    const bultos = bultosProveedorRecepcion(row);
    if (!producto.codigo && !producto.alternativo && bultos <= 0) return;
    const keyProducto = claveProductoRecepcion(producto.codigo, producto.alternativo);
    const key = `${oc}|${keyProducto}`;
    if (!porProducto.has(key)) {
      porProducto.set(key, {
        tipo: "PROVEEDOR",
        asn: oc,
        oc,
        proveedor: infoOc.proveedor || "SIN PROVEEDOR",
        tipoOc: infoOc.tipoOc || "SIN TIPO OC",
        packingList: cuentaPackingListProveedor(infoOc),
        lpn: "",
        productos: new Map(),
        bultos: 0,
        unidades: 0,
        pallets: 0,
        metodoPallet: "OC + PRODUCTO MONO PALLET"
      });
    }
    const item = porProducto.get(key);
    if (!item.productos.has(keyProducto)) item.productos.set(keyProducto, { ...producto, bultos: 0, unidades: 0, row });
    item.productos.get(keyProducto).bultos += bultos;
    item.productos.get(keyProducto).unidades += bultos;
    item.bultos += bultos;
    item.unidades += bultos;
  });

  porProducto.forEach(item => {
    const prod = Array.from(item.productos.values())[0] || {};
    const ref = maxPalletReferenciaProveedor(ctx, prod);
    const maxPallet = ref.maxPallet;
    const calculo = calcularPalletsProveedor(item.bultos, maxPallet);
    item.maxPallet = maxPallet;
    item.palletsCompletos = calculo.completos;
    item.saldoBultos = calculo.saldo;
    item.saldoCuentaPallet = calculo.cuentaSaldo;
    item.pallets = calculo.pallets;
    item.referenciaPallet = ref.origen;
    item.codigoValidacion = prod.codigo || prod.alternativo || "";
    item.descripcionValidacion = prod.descripcion || "";
    item.metodoPallet = `${ref.metodo} | ${fmt(calculo.completos)} completos + ${fmt(calculo.saldo)} saldo ${calculo.cuentaSaldo ? "CUENTA" : "NO CUENTA"} | MONO PRODUCTO`;
  });

  return Array.from(porProducto.values());
}

function gruposPaleteroRecepcion(ctx) {
  const mapa = new Map();
  (dataRecepcionPaleteros || []).forEach(row => {
    if (!recepcionPendienteAlmacenaje(row)) return;
    const asn = limpiar(campoRecepcion(row, ["ASN Entrada", "ASN", "ASN_ENTRADA"]));
    const proveedor = limpiar(campoRecepcion(row, ["Nombre de instalacion", "Nombre de instalación", "Nombre de instalaciÃ³n", "Proveedor", "PROVEEDOR"]));
    const nroPallet = limpiar(campoRecepcion(row, ["Nro Pallet", "NRO PALLET", "Pallet", "PALLET"]));
    const lpn = limpiar(campoRecepcion(row, ["Nro LPN", "LPN", "NRO LPN"]));
    const producto = detalleProductoRecepcion(ctx, row);
    const unidades = numRecepcion(campoRecepcion(row, ["Un Env", "UN ENV"]));
    const bultos = bultosRecepcion(row);
    const key = `${asn}|${nroPallet || lpn || claveProductoRecepcion(producto.codigo, producto.alternativo)}`;
    if (!mapa.has(key)) {
      mapa.set(key, { tipo: "PALETERO", asn, proveedor, nroPallet: nroPallet || lpn, lpn: nroPallet || lpn, lpnsSet: new Set(), productos: new Map(), bultos: 0, unidades: 0, pallets: 1, metodoPallet: "ASN + NRO PALLET" });
    }
    const item = mapa.get(key);
    if (lpn) item.lpnsSet.add(lpn);
    const keyProducto = claveProductoRecepcion(producto.codigo, producto.alternativo);
    if (!item.productos.has(keyProducto)) item.productos.set(keyProducto, { ...producto, bultos: 0, unidades: 0, row });
    item.productos.get(keyProducto).bultos += bultos;
    item.productos.get(keyProducto).unidades += unidades;
    item.bultos += bultos;
    item.unidades += unidades;
  });
  return Array.from(mapa.values());
}

function completarGrupoRecepcion(ctx, grupo) {
  const productos = Array.from(grupo.productos.values());
  const dominante = productos.slice().sort((a, b) => b.bultos - a.bultos)[0] || {};
  const pasilloInfo = resolverPasilloRecepcion(ctx, dominante.codigo, dominante.alternativo, dominante.row || {});
  const productosTxt = productos.map(p => p.codigo || p.alternativo).filter(Boolean).join(" | ");
  const descripciones = productos.map(p => p.descripcion).filter(Boolean).slice(0, 3).join(" | ");
  return {
    ...grupo,
    pasillo: pasilloInfo.pasillo,
    metodo: pasilloInfo.metodo,
    productos: productos.length,
    lpns: grupo.lpnsSet ? grupo.lpnsSet.size : (grupo.lpn ? 1 : 0),
    lpnsTxt: grupo.lpnsSet ? Array.from(grupo.lpnsSet).join(" | ") : (grupo.lpn || ""),
    productosTxt,
    productosDetalle: productos.map(p => ({
      codigo: p.codigo || "",
      alternativo: p.alternativo || "",
      descripcion: p.descripcion || "",
      bultos: p.bultos || 0,
      unidades: p.unidades || 0
    })),
    descripcion: descripciones,
    clasePallet: productos.length <= 1 ? "MONO" : "MULTI"
  };
}

function resumenAsnProveedores(proveedores) {
  const mapa = new Map();
  (proveedores || []).forEach(row => {
    const asn = row.asn || "SIN ASN";
    if (!mapa.has(asn)) {
      mapa.set(asn, {
        asn,
        proveedor: row.proveedor || "SIN PROVEEDOR",
        tipoOc: row.tipoOc || "SIN TIPO OC",
        packingList: row.packingList,
        pallets: 0,
        ocSet: new Set(),
        lpnsSet: new Set(),
        productosSet: new Set(),
        bultos: 0,
        unidades: 0,
        pasillosSet: new Set()
      });
    }
    const item = mapa.get(asn);
    if (row.oc) item.ocSet.add(row.oc);
    item.pallets += Number(row.pallets) || 0;
    item.bultos += Number(row.bultos) || 0;
    item.unidades += Number(row.unidades) || 0;
    if (row.lpn) item.lpnsSet.add(row.lpn);
    if (row.pasillo) item.pasillosSet.add(row.pasillo);
    String(row.productosTxt || "").split(" | ").map(limpiar).filter(Boolean).forEach(codigo => item.productosSet.add(codigo));
  });
  return Array.from(mapa.values()).map(item => ({
    asn: item.asn,
    proveedor: item.proveedor,
    tipoOc: item.tipoOc,
    packingList: item.packingList,
    ocCount: item.ocSet.size || 1,
    pallets: item.pallets,
    lpns: item.lpnsSet.size,
    productos: item.productosSet.size,
    bultos: item.bultos,
    unidades: item.unidades,
    pasillos: Array.from(item.pasillosSet).sort((a, b) => a.localeCompare(b)).join(" | ")
  })).sort((a, b) => b.pallets - a.pallets || String(a.asn).localeCompare(String(b.asn)));
}

function resumenProveedorTipoPacking(proveedores) {
  const mapa = new Map();
  (proveedores || []).forEach(row => {
    const proveedor = row.proveedor || "SIN PROVEEDOR";
    const tipoOc = row.tipoOc || "SIN TIPO OC";
    const key = `${tipoOc}|${proveedor}`;
    if (!mapa.has(key)) {
      mapa.set(key, {
        tipoOc,
        proveedor,
        ocSet: new Set(),
        ocPackingSet: new Set(),
        productosSet: new Set(),
        bultos: 0,
        pallets: 0
      });
    }
    const item = mapa.get(key);
    const oc = row.oc || row.asn;
    if (oc) {
      item.ocSet.add(oc);
      if (row.packingList) item.ocPackingSet.add(oc);
    }
    item.bultos += Number(row.bultos) || 0;
    item.pallets += Number(row.pallets) || 0;
    String(row.productosTxt || "").split(" | ").map(limpiar).filter(Boolean).forEach(codigo => item.productosSet.add(codigo));
  });
  return Array.from(mapa.values()).map(item => ({
    ...item,
    ocCount: item.ocSet.size,
    packingOc: item.ocPackingSet.size,
    sinPackingOc: Math.max(0, item.ocSet.size - item.ocPackingSet.size),
    packingCompleto: item.ocSet.size > 0 && item.ocPackingSet.size === item.ocSet.size,
    packingParcial: item.ocPackingSet.size > 0 && item.ocPackingSet.size < item.ocSet.size,
    packingList: item.ocSet.size && item.ocPackingSet.size === item.ocSet.size
      ? "CON PACKING LIST"
      : item.ocPackingSet.size
        ? `${fmt(item.ocPackingSet.size)}/${fmt(item.ocSet.size)} CON PACKING LIST`
        : "SIN PACKING LIST",
    productos: item.productosSet.size
  })).sort((a, b) => a.tipoOc.localeCompare(b.tipoOc) || a.proveedor.localeCompare(b.proveedor));
}

function resumenAsnPaleteros(paleteros) {
  const mapa = new Map();
  (paleteros || []).forEach(row => {
    const asn = row.asn || "SIN ASN";
    if (!mapa.has(asn)) {
      mapa.set(asn, {
        asn,
        pallets: 0,
        lpns: 0,
        productosSet: new Set(),
        mono: 0,
        multi: 0,
        bultos: 0,
        camion: row.camion || "",
        pasillosSet: new Set()
      });
    }
    const item = mapa.get(asn);
    if (!item.camion && row.camion) item.camion = row.camion;
    item.pallets += Number(row.pallets) || 0;
    item.lpns += Number(row.lpns) || 0;
    item.bultos += Number(row.bultos) || 0;
    if (row.clasePallet === "MONO") item.mono += 1;
    if (row.clasePallet === "MULTI") item.multi += 1;
    if (row.pasillo) item.pasillosSet.add(row.pasillo);
    String(row.productosTxt || "").split(" | ").map(limpiar).filter(Boolean).forEach(codigo => item.productosSet.add(codigo));
  });
  return Array.from(mapa.values()).map(item => ({
    asn: item.asn,
    camion: item.camion || "",
    pallets: item.pallets,
    lpns: item.lpns,
    productos: item.productosSet.size,
    mono: item.mono,
    multi: item.multi,
    bultos: item.bultos,
    pasillos: Array.from(item.pasillosSet).sort((a, b) => a.localeCompare(b)).join(" | ")
  })).sort((a, b) => b.pallets - a.pallets || String(a.asn).localeCompare(String(b.asn)));
}

function totalPaleterosRecibidos(paleterosAsn) {
  const asns = new Set();
  (paleterosAsn || []).forEach(row => {
    const asn = limpiar(row.asn);
    if (asn && normalizar(asn).startsWith("OS917")) asns.add(normalizar(asn));
  });
  return asns.size;
}

function detalleRecepcionPorAsnPasillo(proveedores, paleterosAlmacenables, resumenPasillo) {
  const capacidadPorPasillo = new Map((resumenPasillo || []).map(row => [row.pasillo, row]));
  const mapa = new Map();
  const agregar = (row, origen) => {
    const pasillo = row.pasillo || "SIN CLASIFICAR";
    const asn = row.asn || "SIN ASN";
    const key = `${pasillo}|${asn}|${origen}`;
    if (!mapa.has(key)) {
      mapa.set(key, { pasillo, asn, origen, pallets: 0, lpns: 0, productosSet: new Set(), bultos: 0 });
    }
    const item = mapa.get(key);
    item.pallets += Number(row.pallets) || 0;
    item.lpns += Number(row.lpns) || (row.lpn ? 1 : 0);
    item.bultos += Number(row.bultos) || 0;
    String(row.productosTxt || "").split(" | ").map(limpiar).filter(Boolean).forEach(codigo => item.productosSet.add(codigo));
  };
  (proveedores || []).forEach(row => agregar(row, "PROVEEDOR"));
  (paleterosAlmacenables || []).forEach(row => agregar(row, "PALETERO MONO"));
  return Array.from(mapa.values()).map(item => {
    const capacidad = capacidadPorPasillo.get(item.pasillo);
    const capProyectada = capacidad?.capacidadProyectada || 0;
    const llegadaPasillo = capacidad?.llegada || 0;
    return {
      ...item,
      productos: item.productosSet.size,
      capacidad: capProyectada,
      llegadaPasillo,
      estadoPasillo: capacidad?.estado || "VALIDAR"
    };
  }).sort((a, b) => a.pasillo.localeCompare(b.pasillo) || a.origen.localeCompare(b.origen) || b.pallets - a.pallets);
}

function calcularRecepcionUca(capacidad, prediccionPts) {
  const key = [
    firmaFilas(dataRecepcionProveedores, ["Orden Compra", "Estado", "Producto", "Codigo Alternativo", "BULTOS"]),
    firmaFilas(dataRecepcionProveedoresResumen, ["Nro OC", "Nombre Proveedor", "Tipo OC", "Un Env"]),
    firmaFilas(dataRecepcionPaleteros, ["ASN Entrada", "Nro Pallet", "Nro LPN", "Producto", "BULTOS"]),
    firmaFilas(dataRecepcionPaleterosAsn, ["Nro ASN", "NRO ASN", "ASN", "Nro Camion", "NRO CAMION"]),
    firmaFilas(dataProductos, ["CODIGO", "CODIGO_ALT", "JERARQUIA 2"]),
    firmaFilas(dataLPN, ["LPN", "ESTADO", "UBICACION", "CODIGO", "CODIGO_ALT", "BULTOS"]),
    firmaFilas(dataInventario, ["PRODUCTO", "UBICACION", "UNACT", "UXB"]),
    firmaFilas(dataUbicaciones, ["MASCARA", "UBICACION", "TIPO"]),
    firmaFilas(dataAsignacionTareas, ["NRO_TAREA", "LPN", "UBICACION", "ESTADO", "BULTOS"]),
    localStorage.getItem("operaciones_validacion_pallet_proveedor") || ""
  ].join("::");
  if (cacheRecepcionUca.key === key && cacheRecepcionUca.data) return cacheRecepcionUca.data;
  const ctx = construirContextoRecepcionUca();
  const proveedores = gruposProveedorRecepcion(ctx).map(g => completarGrupoRecepcion(ctx, g));
  const proveedoresAsn = resumenAsnProveedores(proveedores);
  const proveedoresResumen = resumenProveedorTipoPacking(proveedores);
  const infoAsnPaletero = mapaAsnPaleteroRecepcionSeguro();
  const paleteros = gruposPaleteroRecepcion(ctx).map(g => {
    const row = completarGrupoRecepcion(ctx, g);
    const infoAsn = infoAsnPaletero.get(row.asn) || {};
    return { ...row, camion: infoAsn.camion || "", fechaCreacion: infoAsn.fechaCreacion || "" };
  });
  const paleterosMono = paleteros.filter(row => row.clasePallet === "MONO");
  const paleterosMulti = paleteros.filter(row => row.clasePallet === "MULTI");
  const paleterosAsn = resumenAsnPaleteros(paleteros);
  const todosAlmacenables = [...proveedores, ...paleterosMono];
  const ptsPorPasillo = new Map((prediccionPts?.resumen || []).map(row => [row.pasillo, row.ubicaciones]));
  const reservaPorPasillo = new Map((capacidad?.reserva?.resumen || []).map(row => [row.pasillo, row]));
  const pasillos = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "11", "12"];
  const resumen = pasillos.map(pasillo => {
    const libres = reservaPorPasillo.get(pasillo)?.libres || 0;
    const pts = ptsPorPasillo.get(pasillo) || 0;
    const prov = proveedores.filter(row => row.pasillo === pasillo).reduce((a, b) => a + b.pallets, 0);
    const pal = paleterosMono.filter(row => row.pasillo === pasillo).reduce((a, b) => a + b.pallets, 0);
    const palMulti = paleterosMulti.filter(row => row.pasillo === pasillo).reduce((a, b) => a + b.pallets, 0);
    const llegada = prov + pal;
    const capacidadProyectada = libres + pts;
    const diferencia = capacidadProyectada - llegada;
    const diferenciaActual = libres - llegada;
    const estadoActual = llegada <= libres ? "ALCANZA" : "LIBERAR ESPACIO";
    const estado = llegada <= libres ? "ALCANZA" : llegada <= capacidadProyectada ? "DEPENDE PTS" : "FALTA ESPACIO";
    return { pasillo, libres, pts, capacidadActual: libres, capacidadProyectada, proveedores: prov, paleteros: pal, paleterosMulti: palMulti, llegada, diferencia, diferenciaActual, estadoActual, estado };
  });
  const sinClasificar = todosAlmacenables.filter(row => row.pasillo === "SIN CLASIFICAR").reduce((a, b) => a + b.pallets, 0);
  const total = resumen.reduce((acc, row) => {
    acc.libres += row.libres;
    acc.pts += row.pts;
    acc.capacidadProyectada += row.capacidadProyectada;
    acc.proveedores += row.proveedores;
    acc.paleteros += row.paleteros;
    acc.paleterosMulti += row.paleterosMulti;
    acc.llegada += row.llegada;
    acc.deficitActual += Math.max(0, -row.diferenciaActual);
    acc.deficit += Math.max(0, -row.diferencia);
    return acc;
  }, { libres: 0, pts: 0, capacidadProyectada: 0, proveedores: 0, paleteros: 0, paleterosMulti: 0, llegada: 0, deficitActual: 0, deficit: 0, sinClasificar });
  total.paleterosMulti = paleterosMulti.reduce((acc, row) => acc + (Number(row.pallets) || 0), 0);
  total.paleterosTotal = total.paleteros + total.paleterosMulti;

  const detalleAsnPasillo = detalleRecepcionPorAsnPasillo(proveedores, paleterosMono, resumen);
  const validacionPaletero = validacionPaleteroAsnCodigo();

  cacheRecepcionUca = { key, data: { total, resumen, proveedores, proveedoresAsn, proveedoresResumen, paleteros, paleterosMono, paleterosMulti, paleterosAsn, detalleAsnPasillo, validacionPaletero } };
  return cacheRecepcionUca.data;
}

function claseEstadoRecepcion(estado) {
  if (estado === "ALCANZA") return "ok";
  if (estado === "DEPENDE PTS") return "warn";
  return "danger";
}

function resumenVisualRecepcion(data, proveedoresAsn, paleterosAsn) {
  const capacidad = data.total.libres || 0;
  const llegada = data.total.llegada || 0;
  const pctUso = pct(llegada, Math.max(capacidad, llegada, 1));
  const estado = data.total.deficitActual > 0 ? "LIBERAR ESPACIO" : "ALCANZA";
  const estadoClase = data.total.deficitActual > 0 ? "warn" : "ok";
  return `
    <div class="recepcion-hero-dashboard ${estadoClase}">
      <article class="recepcion-main-card">
        <span>Resumen general</span>
        <strong>${htmlSeguro(estado)}</strong>
        <p>${fmt(llegada)} pallets por recibir contra ${fmt(capacidad)} ubicaciones libres reales.</p>
        <div class="recepcion-main-track"><i style="width:${Math.min(100, pctUso)}%"></i></div>
        <small>${pctUso.toFixed(1)}% de uso real | faltan ${fmt(data.total.deficitActual)} antes de PTS</small>
      </article>
      <article>
        <span>Proveedores</span>
        <strong>${fmt(data.total.proveedores)}</strong>
        <p>${fmt(proveedoresAsn.length)} ASN unicos</p>
      </article>
      <article>
        <span>Paleteros mono</span>
        <strong>${fmt(data.total.paleteros)}</strong>
        <p>${fmt(data.total.paleterosMulti)} multi no almacenan en reserva</p>
      </article>
      <article>
        <span>Liberacion PTS</span>
        <strong>${fmt(data.total.pts)}</strong>
        <p>ubicaciones que deberian liberarse en el dia</p>
      </article>
    </div>
  `;
}

function tarjetasPasilloRecepcion(rows) {
  return `
    <div class="recepcion-aisle-board">
      ${rows.map(row => {
        const pctUso = pct(row.llegada, Math.max(row.capacidadProyectada, row.llegada, 1));
        return `
          <article class="recepcion-aisle-card ${claseEstadoRecepcion(row.estado)}">
            <div>
              <span>Pasillo ${htmlSeguro(row.pasillo)}</span>
              <strong>${fmt(row.llegada)} / ${fmt(row.capacidadProyectada)}</strong>
            </div>
            <div class="recepcion-track"><i style="width:${Math.min(100, pctUso)}%"></i></div>
            <div class="recepcion-aisle-mini">
              <b>Prov. ${fmt(row.proveedores)}</b>
              <b>Palet. ${fmt(row.paleteros)}</b>
              <b>Dif. ${fmt(row.diferencia)}</b>
            </div>
            <em>${htmlSeguro(row.estado)}</em>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function tableroPasilloRecepcion(rows) {
  return `
    <div class="recepcion-capacity-board">
      ${rows.map(row => {
        const pctReal = pct(row.llegada, Math.max(row.libres, row.llegada, 1));
        const necesitaPts = row.diferenciaActual < 0 && row.diferencia >= 0;
        const clase = row.diferenciaActual >= 0 ? "ok" : necesitaPts ? "warn" : "danger";
        return `
          <article class="recepcion-capacity-tile ${clase}">
            <div class="recepcion-tile-head">
              <span>Pasillo ${htmlSeguro(row.pasillo)}</span>
              <strong>${htmlSeguro(row.estadoActual)}</strong>
            </div>
            <div class="recepcion-tile-main">
              <b>${fmt(row.llegada)}</b>
              <small>pallets llegada</small>
            </div>
            <div class="recepcion-tile-metrics">
              <div><span>Libre</span><b>${fmt(row.libres)}</b></div>
              <div><span>PTS</span><b>${fmt(row.pts)}</b></div>
              <div><span>Prov.</span><b>${fmt(row.proveedores)}</b></div>
              <div><span>Mono</span><b>${fmt(row.paleteros)}</b></div>
            </div>
            <div class="recepcion-tile-progress">
              <i style="width:${Math.min(100, pctReal)}%"></i>
            </div>
            <div class="recepcion-tile-foot">
              <span>Dif. real <b>${fmt(row.diferenciaActual)}</b></span>
              <span>Con PTS <b>${fmt(row.diferencia)}</b></span>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function compactoOrigenPasilloRecepcion(rows) {
  const conMovimiento = rows.filter(row => row.llegada > 0 || row.pts > 0);
  return `
    <div class="recepcion-origin-strip">
      ${conMovimiento.map(row => {
        const total = Math.max(row.llegada, 1);
        return `
          <div class="recepcion-origin-row">
            <strong>P${htmlSeguro(row.pasillo)}</strong>
            <div>
              <i class="prov" style="width:${Math.min(100, pct(row.proveedores, total))}%"></i>
              <i class="pal" style="width:${Math.min(100, pct(row.paleteros, total))}%"></i>
            </div>
            <span>${fmt(row.llegada)} pallets</span>
          </div>
        `;
      }).join("") || `<p class="muted-note">Sin llegada por pasillo.</p>`}
      <div class="recepcion-chart-legend">
        <span><i class="prov"></i>Proveedor</span>
        <span><i class="pal"></i>Paletero mono</span>
      </div>
    </div>
  `;
}

function graficoBarrasPasilloRecepcion(rows) {
  return `
    <div class="recepcion-board-layout">
      <div>
        <div class="recepcion-board-title">
          <strong>Pasillos</strong>
          <span>Libre real, llegada y PTS proyectado</span>
        </div>
        ${tableroPasilloRecepcion(rows)}
      </div>
      <div>
        <div class="recepcion-board-title">
          <strong>Origen</strong>
          <span>Proveedor / paletero</span>
        </div>
        ${compactoOrigenPasilloRecepcion(rows)}
      </div>
    </div>
  `;
}

function alertaPtsRecepcion(data) {
  const cubrePts = data.total.deficitActual > 0 && data.total.deficit === 0;
  return `
    <div class="recepcion-pts-alert ${cubrePts ? "warn" : data.total.deficit > 0 ? "danger" : "ok"}">
      <div>
        <span>Liberacion PTS estimada</span>
        <strong>${fmt(data.total.pts)} ubicaciones</strong>
      </div>
      <p>
        Capacidad libre actual: <b>${fmt(data.total.libres)}</b> |
        Pallets por llegar: <b>${fmt(data.total.llegada)}</b> |
        Falta antes de PTS: <b>${fmt(data.total.deficitActual)}</b> |
        Falta si se libera PTS: <b>${fmt(data.total.deficit)}</b>
      </p>
    </div>
  `;
}

function tarjetasAsnRecepcion(titulo, rows, tipo) {
  return `
    <div class="recepcion-asn-block">
      <div class="section-head compact-head">
        <h3>${htmlSeguro(titulo)}</h3>
        <span class="muted-note">${fmt(rows.length)} ASN unicos</span>
      </div>
      <div class="recepcion-asn-grid">
        ${rows.map(row => `
          <article class="recepcion-asn-card ${tipo}">
            <span>${htmlSeguro(row.asn)}</span>
            <strong>${fmt(row.pallets)} pallets</strong>
            <div>
              <b>${fmt(row.lpns)}</b><small>LPNs</small>
              <b>${fmt(row.productos)}</b><small>Codigos</small>
              <b>${fmt(row.bultos)}</b><small>Bultos</small>
            </div>
            ${tipo === "paletero" ? `<p>Mono ${fmt(row.mono)} almacenan | Multi ${fmt(row.multi)} no reserva</p>` : `<p>Un Env ${fmt(row.unidades)}</p>`}
            ${tipo === "proveedor" ? `<small>${htmlSeguro(row.tipoOc || "SIN TIPO OC")} | ${htmlSeguro(row.proveedor || "SIN PROVEEDOR")}</small>` : ""}
            ${tipo === "paletero" ? `<small>${htmlSeguro(row.camion || "SIN PLACA")}</small>` : ""}
            <em>${htmlSeguro(row.pasillos || "SIN CLASIFICAR")}</em>
          </article>
        `).join("") || `<p class="muted-note">Sin ASN cargados.</p>`}
      </div>
    </div>
  `;
}

function tarjetasPasilloAsnRecepcion(rows) {
  return `
    <div class="recepcion-matrix-grid">
      ${rows.map(row => {
        const pctUso = pct(row.pallets, Math.max(row.capacidad, row.llegadaPasillo, row.pallets, 1));
        return `
          <article class="recepcion-matrix-card ${claseEstadoRecepcion(row.estadoPasillo)}">
            <div>
              <span>Pasillo ${htmlSeguro(row.pasillo)} | ${htmlSeguro(row.origen)}</span>
              <strong>${htmlSeguro(row.asn)}</strong>
            </div>
            <div class="recepcion-track"><i style="width:${Math.min(100, pctUso)}%"></i></div>
            <div class="recepcion-aisle-mini">
              <b>${fmt(row.pallets)} pallets</b>
              <b>${fmt(row.lpns)} LPNs</b>
              <b>${fmt(row.bultos)} bultos</b>
            </div>
            <small>${fmt(row.llegadaPasillo)} llegada pasillo / ${fmt(row.capacidad)} capacidad | ${htmlSeguro(row.estadoPasillo)}</small>
          </article>
        `;
      }).join("") || `<p class="muted-note">Sin resumen por pasillo y ASN.</p>`}
    </div>
  `;
}

function cuadroPasilloAsnRecepcion(rows) {
  const ordenPasillos = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "11", "12", "SIN CLASIFICAR"];
  const porPasillo = new Map();
  rows.forEach(row => {
    const pasillo = row.pasillo || "SIN CLASIFICAR";
    if (!porPasillo.has(pasillo)) porPasillo.set(pasillo, []);
    porPasillo.get(pasillo).push(row);
  });
  return `
    <div class="recepcion-asn-summary">
      ${ordenPasillos.filter(pasillo => porPasillo.has(pasillo)).map(pasillo => {
        const items = porPasillo.get(pasillo).sort((a, b) => a.origen.localeCompare(b.origen) || b.pallets - a.pallets);
        const totalPallets = items.reduce((acc, row) => acc + row.pallets, 0);
        const estado = items[0]?.estadoPasillo || "VALIDAR";
        const capacidad = items[0]?.capacidad || 0;
        return `
          <section class="recepcion-asn-group ${claseEstadoRecepcion(estado)}">
            <div class="recepcion-asn-group-head">
              <strong>Pasillo ${htmlSeguro(pasillo)}</strong>
              <span>${fmt(totalPallets)} pallets llegada | ${fmt(capacidad)} capacidad proyectada | ${htmlSeguro(estado)}</span>
            </div>
            <div class="recepcion-asn-lines">
              ${items.map(row => `
                <div class="recepcion-asn-line">
                  <div>
                    <b>${htmlSeguro(row.asn)}</b>
                    <span>${htmlSeguro(row.origen)}</span>
                  </div>
                  <em>${fmt(row.pallets)} pallets</em>
                  <small>${fmt(row.lpns)} LPNs</small>
                  <small>${fmt(row.productos)} cod.</small>
                  <small>${fmt(row.bultos)} bultos</small>
                </div>
              `).join("")}
            </div>
          </section>
        `;
      }).join("") || `<p class="muted-note">Sin resumen por pasillo y ASN.</p>`}
    </div>
  `;
}

function bloqueValidacionPaleteroRecepcion(data, vistaCompleta = false) {
  const validacion = data.validacionPaletero || {};
  const resumenBase = validacion.resumenAsn || [];
  const resumenPlacaBase = validacion.resumenPlacaShipTo || [];
  const detalleBase = validacion.detalle || [];
  const detalleLpnBase = validacion.detalleLpn || [];
  const resumen = filtrarShipToY(resumenBase);
  const resumenPlaca = filtrarResumenPlacaShipToY(resumenPlacaBase);
  const detalle = filtrarShipToY(detalleBase);
  const detalleLpn = filtrarShipToY(detalleLpnBase);
  const detalleSeparar = detalle.filter(row => row.tieneCodigoSeparar);
  const total = {
    asn: new Set(resumen.map(row => row.asn)).size,
    camiones: new Set(resumen.map(row => row.camion).filter(Boolean)).size,
    pallets: detalle.length,
    mono: detalle.filter(row => row.tipo === "MONO").length,
    multi: detalle.filter(row => row.tipo === "MULTI").length,
    palletsSeparar: detalle.filter(row => row.tieneCodigoSeparar).length,
    codigosBase: validacion.total?.codigosBase || 0,
    vencidos: resumen.filter(row => row.tiempo?.estado === "VENCIDO").length,
    alertas: resumen.filter(row => ["ALERTA", "CRITICO"].includes(row.tiempo?.estado)).length
  };
  return `
    <section class="recepcion-validation-card ${vistaCompleta ? "shipto-view" : ""}">
      <div class="section-head">
        <div>
          <h3>Validacion ASN paletero</h3>
          <p class="muted-note">Cruza Hoja1 con ASN y CODIGO para separar pallets por camion, fecha de creacion y codigos involucrados.</p>
        </div>
        <button type="button" onclick="exportarValidacionPaleteroRecepcion()">Excel validacion</button>
      </div>
      ${vistaCompleta ? filtrosShipToYHtml(resumenBase) : ""}
      <div class="kpi-grid compact recepcion-validation-kpis">
        ${kpi("ASN", fmt(total.asn || 0), "unidades logisticas")}
        ${kpi("Camiones", fmt(total.camiones || 0), "segun Nro Camion")}
        ${kpi("Pallets", fmt(total.pallets || 0), `${fmt(total.mono || 0)} mono | ${fmt(total.multi || 0)} multi`)}
        ${kpi("Codigos a separar", fmt(total.palletsSeparar || 0), `${fmt(total.codigosBase || 0)} codigos base`)}
        ${kpi("Alertas 5 dias", fmt((total.alertas || 0) + (total.vencidos || 0)), `${fmt(total.vencidos || 0)} vencidos`)}
      </div>
      <div class="section-head compact-head">
        <h3>Resumen placas con SHIP TO</h3>
        <span class="muted-note">${fmt(resumenPlaca.length)} placas | Corte actual ${htmlSeguro(horaCorteRecepcion())}</span>
      </div>
      ${tabla(["Placa", "ASN", "Pallets SHIP TO", "Mono pallets", "Multi pallets", "Codigos", "Bultos", "Ver"], resumenPlaca.map(row => `
        <tr>
          <td><strong>${htmlSeguro(row.placa || "SIN CAMION")}</strong></td>
          <td>${htmlSeguro(row.asns || "")}</td>
          <td class="number"><strong>${fmt(row.palletsShipTo)}</strong></td>
          <td class="number">${fmt(row.mono)}</td>
          <td class="number">${fmt(row.multi)}</td>
          <td><strong>${fmt(row.codigos)}</strong><small>${htmlSeguro(row.codigosTxt || "")}</small></td>
          <td class="number">${fmt(row.bultos)}</td>
          <td><button type="button" class="compact" onclick="abrirDetallePlacaShipToY(${argumentoSeguro(row.placa)})">Ver</button></td>
        </tr>
      `), "Sin placas con SHIP TO")}
      <div class="section-head compact-head subhead">
        <h3>Resumen por ASN / camion</h3>
        <span class="muted-note">${fmt(resumen.length)} ASN evaluados</span>
      </div>
      ${tabla(["ASN", "Camion", "Fe y Hr Creac", "Estado 5 dias", "Pallets", "Mono", "Multi", "Pallets codigo", "Ver"], resumen.map(row => {
        const tiempo = row.tiempo || {};
        return `
          <tr class="${htmlSeguro(tiempo.clase || "")}">
            <td><strong>${htmlSeguro(row.asn)}</strong></td>
            <td>${htmlSeguro(row.camion || "SIN CAMION")}</td>
            <td>${htmlSeguro(row.fechaCreacion || "SIN FECHA")}</td>
            <td><strong>${htmlSeguro(tiempo.estado || "SIN FECHA")}</strong><small>${htmlSeguro(tiempo.mensaje || "")}</small></td>
            <td class="number">${fmt(row.pallets)}</td>
            <td class="number">${fmt(row.mono)}</td>
            <td class="number">${fmt(row.multi)}</td>
            <td class="number"><strong>${fmt(row.palletsSeparar)}</strong></td>
            <td><button type="button" class="compact" onclick="abrirDetalleAsnShipToY(${argumentoSeguro(row.asn)})">Ver</button></td>
          </tr>
        `;
      }), "Sin ASN para validar")}
      ${!vistaCompleta ? `
        <div class="dashboard-layout recepcion-validation-layout">
          <div>
            <div class="section-head compact-head">
              <h3>Pallets con codigos a separar</h3>
              <span class="muted-note">${fmt(detalleSeparar.length)} pallets involucrados</span>
            </div>
            ${tabla(["ASN", "Camion", "Pallet", "LPNs", "Codigos", "Tipo", "Bultos", "Codigos separar"], detalleSeparar.map(row => `
              <tr class="${htmlSeguro(row.clase || "")}">
                <td><strong>${htmlSeguro(row.asn)}</strong></td>
                <td>${htmlSeguro(row.camion || "SIN CAMION")}</td>
                <td>${htmlSeguro(row.pallet)}</td>
                <td class="number">${fmt(row.lpns)}</td>
                <td class="number">${fmt(row.codigos)}</td>
                <td><strong>${htmlSeguro(row.tipo)}</strong></td>
                <td class="number">${fmt(row.bultos)}</td>
                <td>${htmlSeguro(row.codigosSepararTxt)}</td>
              </tr>
            `), "Sin pallets con codigos de la hoja CODIGO")}
          </div>
        </div>
      ` : `<div id="modalShipToAsn" class="modal-backdrop" hidden></div>`}
    </section>
  `;
}

function filtrarShipToY(rows) {
  const asn = limpiar(filtrosShipToY.asn);
  const placa = limpiar(filtrosShipToY.placa);
  return (rows || []).filter(row => (!asn || row.asn === asn) && (!placa || row.camion === placa));
}

function filtrarResumenPlacaShipToY(rows) {
  const asn = limpiar(filtrosShipToY.asn);
  const placa = limpiar(filtrosShipToY.placa);
  return (rows || []).filter(row => {
    const asns = row.asnSet instanceof Set ? row.asnSet : new Set(String(row.asns || "").split(" | ").map(limpiar).filter(Boolean));
    return (!placa || row.placa === placa) && (!asn || asns.has(asn));
  });
}

function horaCorteRecepcion() {
  return new Date().toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function detalleShipToPorAsn(asn) {
  const validacion = recepcionUcaVista?.validacionPaletero || {};
  const key = normalizar(asn);
  return {
    resumen: (validacion.resumenAsn || []).find(row => normalizar(row.asn) === key) || {},
    detalle: (validacion.detalle || []).filter(row => normalizar(row.asn) === key),
    detalleLpn: (validacion.detalleLpn || []).filter(row => normalizar(row.asn) === key)
  };
}

function detalleShipToPorPlaca(placa) {
  const validacion = recepcionUcaVista?.validacionPaletero || {};
  return (validacion.detalleProductoShipTo || []).filter(row => row.camion === placa);
}

function htmlDetallePlacaShipToY(placa) {
  const rows = detalleShipToPorPlaca(placa);
  const pallets = new Set(rows.map(row => `${row.asn}|${row.pallet}`));
  const lpns = new Set(rows.map(row => row.lpn).filter(Boolean));
  const codigos = new Set(rows.map(row => row.producto).filter(Boolean));
  const bultos = rows.reduce((a, b) => a + num(b.bultos), 0);
  return `
    <div class="section-head">
      <div>
        <h2>${htmlSeguro(placa || "SIN CAMION")}</h2>
        <p class="muted-note">${fmt(pallets.size)} pallets SHIP TO | ${fmt(lpns.size)} LPNs | ${fmt(codigos.size)} codigos</p>
      </div>
      <div class="filters">
        <button class="ghost" onclick="cerrarDetallePlacaShipToY()">Cerrar</button>
      </div>
    </div>
    <section class="kpi-grid compact">
      ${kpi("Pallets SHIP TO", fmt(pallets.size))}
      ${kpi("LPNs", fmt(lpns.size))}
      ${kpi("Codigos", fmt(codigos.size))}
      ${kpi("Bultos", fmt(bultos))}
    </section>
    ${tabla(["ASN", "Pallet", "LPN", "Producto", "Descripcion", "Bultos", "Tipo"], rows.map(row => `
      <tr class="${row.tipo === "MULTI" ? "warn" : ""}">
        <td>${htmlSeguro(row.asn)}</td>
        <td><strong>${htmlSeguro(row.pallet)}</strong></td>
        <td>${htmlSeguro(row.lpn || "")}</td>
        <td><strong>${htmlSeguro(row.producto)}</strong></td>
        <td>${htmlSeguro(row.descripcion || "")}</td>
        <td class="number">${fmt(row.bultos)}</td>
        <td><strong>${htmlSeguro(row.tipo || "")}</strong></td>
      </tr>
    `), "Sin detalle de pallets SHIP TO.")}
  `;
}

function abrirDetallePlacaShipToY(placa) {
  const modal = document.getElementById("modalShipToAsn");
  if (!modal) return;
  modal.innerHTML = `<div class="modal-card wide">${htmlDetallePlacaShipToY(placa)}</div>`;
  modal.hidden = false;
}

function cerrarDetallePlacaShipToY() {
  const modal = document.getElementById("modalShipToAsn");
  if (!modal) return;
  modal.hidden = true;
  modal.innerHTML = "";
}

function htmlDetalleAsnShipToY(asn) {
  const data = detalleShipToPorAsn(asn);
  const resumen = data.resumen || {};
  const detalle = data.detalle || [];
  const detalleLpn = data.detalleLpn || [];
  const tiempo = resumen.tiempo || estadoCincoDiasRecepcion(resumen.fechaCreacion);
  const totalBultos = detalle.reduce((a, b) => a + num(b.bultos), 0);
  const totalUnidades = detalle.reduce((a, b) => a + num(b.unidades), 0);
  return `
    <div class="section-head">
      <div>
        <h2>${htmlSeguro(asn)}</h2>
        <p class="muted-note">${htmlSeguro(resumen.camion || "SIN CAMION")} | Corte actual ${htmlSeguro(horaCorteRecepcion())}</p>
      </div>
      <div class="filters">
        <button class="ghost" onclick="cerrarDetalleAsnShipToY()">Cerrar</button>
      </div>
    </div>
    <section class="kpi-grid compact">
      ${kpi("Estado tiempo", tiempo.estado || "SIN FECHA", tiempo.mensaje || "")}
      ${kpi("Pallets", fmt(resumen.pallets || detalle.length), `${fmt(resumen.mono || 0)} mono | ${fmt(resumen.multi || 0)} multi`)}
      ${kpi("Codigos separar", fmt(resumen.palletsSeparar || 0), htmlSeguro(resumen.codigosSepararTxt || "Sin codigos"))}
      ${kpi("Bultos", fmt(totalBultos), `${fmt(totalUnidades)} unidades`)}
    </section>
    <section class="recepcion-provider-modal-grid">
      <div class="detail-box">
        <h3>Tiempo del ASN</h3>
        ${tabla(["Fecha creacion", "Dias", "Horas", "Faltan dias", "Estado"], [`
          <tr class="${htmlSeguro(tiempo.clase || "")}">
            <td>${htmlSeguro(resumen.fechaCreacion || "SIN FECHA")}</td>
            <td class="number">${fmt(tiempo.dias || 0)}</td>
            <td class="number">${fmt(tiempo.horas || 0)}</td>
            <td class="number">${fmt(tiempo.faltanDias || 0)}</td>
            <td><strong>${htmlSeguro(tiempo.estado || "SIN FECHA")}</strong><small>${htmlSeguro(tiempo.mensaje || "")}</small></td>
          </tr>
        `], "Sin fecha.")}
      </div>
      <div class="detail-box">
        <h3>Mono / Multi</h3>
        ${tabla(["Tipo", "Pallets", "Criterio"], [
          `<tr><td><strong>MONO</strong></td><td class="number">${fmt(resumen.mono || 0)}</td><td>Un codigo en el pallet</td></tr>`,
          `<tr class="${resumen.multi ? "warn" : ""}"><td><strong>MULTI</strong></td><td class="number">${fmt(resumen.multi || 0)}</td><td>Mas de un codigo en el pallet</td></tr>`
        ], "Sin resumen.")}
      </div>
    </section>
    ${bloqueValidacionLpnShipToY(detalleLpn)}
    ${bloqueDetalleShipToY({ detalle })}
  `;
}

function abrirDetalleAsnShipToY(asn) {
  const modal = document.getElementById("modalShipToAsn");
  if (!modal) return;
  modal.innerHTML = `<div class="modal-card wide">${htmlDetalleAsnShipToY(asn)}</div>`;
  modal.hidden = false;
}

function cerrarDetalleAsnShipToY() {
  const modal = document.getElementById("modalShipToAsn");
  if (!modal) return;
  modal.hidden = true;
  modal.innerHTML = "";
}

function filtrosShipToYHtml(resumen) {
  const asns = Array.from(new Set((resumen || []).map(row => row.asn).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const placas = Array.from(new Set((resumen || []).map(row => row.camion).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  return `
    <div class="filters shipto-filters">
      <label>
        ASN
        <select class="select-filter" onchange="actualizarFiltroShipToY('asn', this.value)">
          <option value="">Todos los ASN</option>
          ${asns.map(asn => `<option value="${atributoSeguro(asn)}" ${filtrosShipToY.asn === asn ? "selected" : ""}>${htmlSeguro(asn)}</option>`).join("")}
        </select>
      </label>
      <label>
        Placa / camion
        <select class="select-filter" onchange="actualizarFiltroShipToY('placa', this.value)">
          <option value="">Todas las placas</option>
          ${placas.map(placa => `<option value="${atributoSeguro(placa)}" ${filtrosShipToY.placa === placa ? "selected" : ""}>${htmlSeguro(placa)}</option>`).join("")}
        </select>
      </label>
      <button type="button" class="soft" onclick="limpiarFiltrosShipToY()">Limpiar filtros</button>
    </div>
  `;
}

function actualizarFiltroShipToY(campo, valor) {
  filtrosShipToY[campo] = valor;
  verRecepcionShipToY();
}

function limpiarFiltrosShipToY() {
  filtrosShipToY = { asn: "", placa: "" };
  verRecepcionShipToY();
}

function bloqueValidacionLpnShipToY(detalleLpn) {
  const palletsContados = new Set();
  const rows = (detalleLpn || []).map(row => {
    const key = `${row.asn}|${row.pallet}`;
    const cuentaPallet = palletsContados.has(key) ? 0 : 1;
    palletsContados.add(key);
    return { ...row, cuentaPallet };
  });
  const totalPallets = palletsContados.size;
  return `
    <div class="section-head compact-head subhead">
      <h3>Validacion por LPN / pallet</h3>
      <span class="muted-note">${fmt(totalPallets)} pallets en total</span>
    </div>
    ${tabla(["ASN", "Placa", "LPN", "Numero pallet", "Valores", "Observacion", "Cuenta pallets", "Tipo"], rows.map(row => `
      <tr class="${row.tieneCodigoSeparar ? "warn" : ""}">
        <td><strong>${htmlSeguro(row.asn)}</strong></td>
        <td>${htmlSeguro(row.camion || "SIN CAMION")}</td>
        <td>${htmlSeguro(row.lpn)}</td>
        <td>${htmlSeguro(row.pallet)}</td>
        <td class="number">${fmt(row.codigos)}</td>
        <td><strong>${htmlSeguro(row.observacion)}</strong><small>${htmlSeguro(row.codigosSepararTxt || "")}</small></td>
        <td class="number">${fmt(row.cuentaPallet)}</td>
        <td><strong>${htmlSeguro(row.tipo)}</strong></td>
      </tr>
    `).concat([`
      <tr class="ok">
        <td colspan="6"><strong>TOTAL PALLETS</strong></td>
        <td class="number"><strong>${fmt(totalPallets)}</strong></td>
        <td></td>
      </tr>
    `]), "Sin validacion por LPN")}
  `;
}

function bloqueDetalleShipToY(validacion) {
  const detalle = validacion.detalle || [];
  return `
    <div class="section-head compact-head subhead">
      <h3>Detalle general de pallets por ASN</h3>
      <span class="muted-note">${fmt(detalle.length)} pallets evaluados</span>
    </div>
    ${tabla(["ASN", "Camion", "Fe y Hr Creac", "Pallet", "LPNs", "Codigos", "Tipo", "Bultos", "Unidades", "Codigos separar", "Estado 5 dias"], detalle.map(row => `
      <tr class="${htmlSeguro(row.clase || "")}">
        <td><strong>${htmlSeguro(row.asn)}</strong></td>
        <td>${htmlSeguro(row.camion || "SIN CAMION")}</td>
        <td>${htmlSeguro(row.fechaCreacion || "SIN FECHA")}</td>
        <td>${htmlSeguro(row.pallet)}</td>
        <td class="number">${fmt(row.lpns)}</td>
        <td class="number">${fmt(row.codigos)}</td>
        <td><strong>${htmlSeguro(row.tipo)}</strong></td>
        <td class="number">${fmt(row.bultos)}</td>
        <td class="number">${fmt(row.unidades)}</td>
        <td>${htmlSeguro(row.codigosSepararTxt || "-")}</td>
        <td><strong>${htmlSeguro(row.estado || "SIN FECHA")}</strong><small>${htmlSeguro(row.mensaje || "")}</small></td>
      </tr>
    `), "Sin detalle de pallets")}
  `;
}

function filtrarRecepcionProyeccionRows(rows, tipo, modo = "todos") {
  const asn = limpiar(filtrosRecepcionProyeccion.asn);
  const placa = limpiar(filtrosRecepcionProyeccion.placa);
  const proveedor = limpiar(filtrosRecepcionProyeccion.proveedor);
  return (rows || []).filter(row => {
    if (modo === "proveedores" && tipo !== "proveedor") return false;
    if (modo === "paleteros" && tipo !== "paletero") return false;
    if (asn && row.asn !== asn) return false;
    if (placa && tipo === "paletero" && row.camion !== placa) return false;
    if (placa && tipo === "proveedor") return false;
    if (proveedor && tipo === "proveedor" && row.proveedor !== proveedor) return false;
    if (proveedor && tipo === "paletero") return false;
    return true;
  });
}

function recalcularRecepcionProyeccion(data, modo = "todos") {
  const proveedores = filtrarRecepcionProyeccionRows(data.proveedores || [], "proveedor", modo);
  const paleteros = filtrarRecepcionProyeccionRows(data.paleteros || [], "paletero", modo);
  const paleterosMono = paleteros.filter(row => row.clasePallet === "MONO");
  const paleterosMulti = paleteros.filter(row => row.clasePallet === "MULTI");
  const proveedoresAsn = resumenAsnProveedores(proveedores);
  const proveedoresResumen = resumenProveedorTipoPacking(proveedores);
  const paleterosAsn = resumenAsnPaleteros(paleteros);
  const capacidadPorPasillo = new Map((data.resumen || []).map(row => [row.pasillo, row]));
  const ordenPasillos = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "11", "12"];
  const resumen = ordenPasillos.map(pasillo => {
    const base = capacidadPorPasillo.get(pasillo) || {};
    const libres = base.libres || 0;
    const pts = base.pts || 0;
    const prov = proveedores.filter(row => row.pasillo === pasillo).reduce((a, b) => a + b.pallets, 0);
    const pal = paleterosMono.filter(row => row.pasillo === pasillo).reduce((a, b) => a + b.pallets, 0);
    const palMulti = paleterosMulti.filter(row => row.pasillo === pasillo).reduce((a, b) => a + b.pallets, 0);
    const llegada = prov + pal;
    const capacidadProyectada = libres + pts;
    const diferencia = capacidadProyectada - llegada;
    const diferenciaActual = libres - llegada;
    const estadoActual = llegada <= libres ? "ALCANZA" : "LIBERAR ESPACIO";
    const estado = llegada <= libres ? "ALCANZA" : llegada <= capacidadProyectada ? "DEPENDE PTS" : "FALTA ESPACIO";
    return { ...base, pasillo, libres, pts, capacidadActual: libres, capacidadProyectada, proveedores: prov, paleteros: pal, paleterosMulti: palMulti, llegada, diferencia, diferenciaActual, estadoActual, estado };
  });
  const todosAlmacenables = [...proveedores, ...paleterosMono];
  const sinClasificar = todosAlmacenables.filter(row => row.pasillo === "SIN CLASIFICAR").reduce((a, b) => a + b.pallets, 0);
  const total = resumen.reduce((acc, row) => {
    acc.libres += row.libres;
    acc.pts += row.pts;
    acc.capacidadProyectada += row.capacidadProyectada;
    acc.proveedores += row.proveedores;
    acc.paleteros += row.paleteros;
    acc.paleterosMulti += row.paleterosMulti;
    acc.llegada += row.llegada;
    acc.deficitActual += Math.max(0, -row.diferenciaActual);
    acc.deficit += Math.max(0, -row.diferencia);
    return acc;
  }, { libres: 0, pts: 0, capacidadProyectada: 0, proveedores: 0, paleteros: 0, paleterosMulti: 0, llegada: 0, deficitActual: 0, deficit: 0, sinClasificar });
  total.paleterosMulti = paleterosMulti.reduce((acc, row) => acc + (Number(row.pallets) || 0), 0);
  total.paleterosTotal = total.paleteros + total.paleterosMulti;

  return {
    ...data,
    total,
    resumen,
    proveedores,
    proveedoresAsn,
    proveedoresResumen,
    paleteros,
    paleterosMono,
    paleterosMulti,
    paleterosAsn,
    detalleAsnPasillo: detalleRecepcionPorAsnPasillo(proveedores, paleterosMono, resumen),
    sinFiltro: data
  };
}

function filtrosRecepcionProyeccionHtml(data, modo = "todos") {
  const asnsBase = modo === "proveedores"
    ? (data.proveedoresAsn || []).map(row => row.asn)
    : modo === "paleteros"
      ? (data.paleterosAsn || []).map(row => row.asn)
      : [...(data.proveedoresAsn || []).map(row => row.asn), ...(data.paleterosAsn || []).map(row => row.asn)];
  const asns = Array.from(new Set(asnsBase.filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const placas = Array.from(new Set((data.paleteros || []).map(row => row.camion).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const proveedores = Array.from(new Set((data.proveedores || []).map(row => row.proveedor).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  return `
    <div class="filters shipto-filters">
      ${modo === "todos" ? `
        <label>
          Proveedor
          <select class="select-filter" onchange="actualizarFiltroRecepcionProyeccion('proveedor', this.value)">
            <option value="">Todos los proveedores</option>
            ${proveedores.map(proveedor => `<option value="${atributoSeguro(proveedor)}" ${filtrosRecepcionProyeccion.proveedor === proveedor ? "selected" : ""}>${htmlSeguro(proveedor)}</option>`).join("")}
          </select>
        </label>
        <label>
          Placa / camion
          <select class="select-filter" onchange="actualizarFiltroRecepcionProyeccion('placa', this.value)">
            <option value="">Todas las placas</option>
            ${placas.map(placa => `<option value="${atributoSeguro(placa)}" ${filtrosRecepcionProyeccion.placa === placa ? "selected" : ""}>${htmlSeguro(placa)}</option>`).join("")}
          </select>
        </label>
      ` : ""}
      <label>
        ${modo === "proveedores" ? "OC" : "ASN"}
        <select class="select-filter" onchange="actualizarFiltroRecepcionProyeccion('asn', this.value)">
          <option value="">${modo === "proveedores" ? "Todas las OC" : "Todos los ASN"}</option>
          ${asns.map(asn => `<option value="${atributoSeguro(asn)}" ${filtrosRecepcionProyeccion.asn === asn ? "selected" : ""}>${htmlSeguro(asn)}</option>`).join("")}
        </select>
      </label>
      ${modo === "paleteros" ? `
        <label>
          Placa / camion
          <select class="select-filter" onchange="actualizarFiltroRecepcionProyeccion('placa', this.value)">
            <option value="">Todas las placas</option>
            ${placas.map(placa => `<option value="${atributoSeguro(placa)}" ${filtrosRecepcionProyeccion.placa === placa ? "selected" : ""}>${htmlSeguro(placa)}</option>`).join("")}
          </select>
        </label>
      ` : ""}
      <button type="button" class="soft" onclick="limpiarFiltrosRecepcionProyeccion()">Limpiar filtros</button>
    </div>
  `;
}

function actualizarFiltroRecepcionProyeccion(campo, valor) {
  filtrosRecepcionProyeccion[campo] = valor;
  if (recepcionSubmoduloActivo === "shipto") return verRecepcionShipToY();
  if (recepcionSubmoduloActivo === "proyeccion") return verRecepcionProyeccionEspacio();
  if (recepcionSubmoduloActivo === "paleteros") verRecepcionPaleteros();
  else verRecepcionProveedores();
}

function limpiarFiltrosRecepcionProyeccion() {
  filtrosRecepcionProyeccion = { asn: "", placa: "", proveedor: "" };
  if (recepcionSubmoduloActivo === "shipto") return verRecepcionShipToY();
  if (recepcionSubmoduloActivo === "proyeccion") return verRecepcionProyeccionEspacio();
  if (recepcionSubmoduloActivo === "paleteros") verRecepcionPaleteros();
  else verRecepcionProveedores();
}

function bloqueValidacionPalletProveedor(rows) {
  const pendientes = (rows || []).filter(row => ["PROMEDIO", "APROXIMADO"].includes(row.referenciaPallet));
  const validaciones = validacionesPalletProveedor();
  const guardadas = Object.entries(validaciones).map(([codigo, item]) => ({ codigo, ...item }));
  return `
    <div class="card subcard">
      <div class="section-head compact-head">
        <div>
          <h3>Validacion fisica pallet proveedor</h3>
          <p class="muted-note">Si el producto no tiene referencia aprendida en reserva, ingresa cuantos bultos trae su pallet fisico y se recalcula la proyeccion.</p>
        </div>
      </div>
      <div class="filters">
        <label>Codigo producto<input id="validacionProveedorCodigo" class="search small" placeholder="Codigo"></label>
        <label>Bultos por pallet<input id="validacionProveedorMax" class="search small" type="number" min="1" step="1" placeholder="80"></label>
        <label>Observacion<input id="validacionProveedorObs" class="search" placeholder="Validado en recepcion / proveedor"></label>
        <button type="button" onclick="guardarValidacionPalletProveedor()">Guardar y recalcular</button>
      </div>
      ${pendientes.length ? `
        <div class="detail-box">
          <h3>Productos por validar</h3>
          ${tabla(["Codigo", "Descripcion", "Bultos", "Referencia actual", "Max usado", "Pallets", "Validar"], pendientes.slice(0, 20).map(row => `
            <tr class="warn">
              <td><strong>${htmlSeguro(row.codigoValidacion)}</strong></td>
              <td>${htmlSeguro(row.descripcionValidacion)}</td>
              <td class="number">${fmt(row.bultos)}</td>
              <td>${htmlSeguro(row.referenciaPallet)}</td>
              <td class="number">${fmt(row.maxPallet)}</td>
              <td class="number">${fmt(row.pallets)}</td>
              <td><button class="compact" onclick="prepararValidacionPalletProveedor(${argumentoSeguro(row.codigoValidacion)}, ${argumentoSeguro(row.descripcionValidacion)})">Usar</button></td>
            </tr>
          `), "Todos los productos tienen max pallet aprendido o validado.")}
        </div>
      ` : ""}
      ${guardadas.length ? `
        <div class="detail-box">
          <h3>Validaciones guardadas</h3>
          ${tabla(["Codigo", "Bultos por pallet", "Observacion", "Actualizado"], guardadas.map(row => `
            <tr>
              <td><strong>${htmlSeguro(row.codigo)}</strong></td>
              <td class="number">${fmt(row.maxPallet)}</td>
              <td>${htmlSeguro(row.observacion || "")}</td>
              <td>${htmlSeguro(row.actualizado || "")}</td>
            </tr>
          `), "Sin validaciones manuales.")}
        </div>
      ` : ""}
    </div>
  `;
}

function actualizarFiltroRecepcionProveedor(valor) {
  filtroRecepcionProveedorNombre = limpiar(valor);
  filtrarProveedorRecepcionVista(valor);
}

function filtrarProveedorRecepcionVista(valor) {
  const q = normalizar(valor);
  document.querySelectorAll("[data-proveedor-recepcion]").forEach(el => {
    el.style.display = !q || normalizar(el.dataset.proveedorRecepcion).includes(q) ? "" : "none";
  });
}

function topProveedoresRecepcion(rows) {
  return resumenProveedorTipoPacking(rows)
    .slice()
    .sort((a, b) => b.pallets - a.pallets || b.bultos - a.bultos)
    .slice(0, 8);
}

function bloqueKpisProveedoresVisual(rows) {
  const resumen = resumenProveedorTipoPacking(rows);
  const totalProveedores = new Set((rows || []).map(row => row.proveedor).filter(Boolean)).size;
  const totalOc = new Set((rows || []).map(row => row.oc || row.asn).filter(Boolean)).size;
  const totalPallets = (rows || []).reduce((a, b) => a + num(b.pallets), 0);
  const totalBultos = (rows || []).reduce((a, b) => a + num(b.bultos), 0);
  const conPacking = resumen.reduce((a, b) => a + num(b.packingOc), 0);
  const sinPacking = resumen.reduce((a, b) => a + num(b.sinPackingOc), 0);
  const top = resumen.slice().sort((a, b) => b.pallets - a.pallets)[0];
  return `
    <section class="recepcion-bi-kpis">
      <article>
        <span>Proveedores</span>
        <strong>${fmt(totalProveedores)}</strong>
        <small>${fmt(totalOc)} OC activas</small>
      </article>
      <article>
        <span>Pallets</span>
        <strong>${fmt(totalPallets)}</strong>
        <small>${fmt(totalBultos)} bultos</small>
      </article>
      <article class="${sinPacking ? "warn" : "ok"}">
        <span>Packing list</span>
        <strong>${fmt(conPacking)}/${fmt(totalOc)}</strong>
        <small>${fmt(sinPacking)} OC pendientes</small>
      </article>
      <article>
        <span>Mayor volumen</span>
        <strong>${htmlSeguro(top ? fmt(top.pallets) : "0")}</strong>
        <small>${htmlSeguro(top?.proveedor || "Sin proveedor")}</small>
      </article>
    </section>
  `;
}

function bloqueReporteProveedoresVisual(rows) {
  const top = topProveedoresRecepcion(rows);
  const maxPallets = Math.max(...top.map(row => row.pallets), 1);
  return `
    <section class="recepcion-bi-panel">
      <div class="section-head compact-head">
        <h3>Ranking proveedores</h3>
        <span class="muted-note">Top por pallets estimados</span>
      </div>
      <div class="recepcion-provider-ranking">
        ${top.map((row, index) => `
          <button type="button" class="recepcion-provider-rank" data-proveedor-recepcion="${atributoSeguro(row.proveedor)}" onclick="abrirDetalleProveedorRecepcion(${argumentoSeguro(row.proveedor)})">
            <span>${index + 1}</span>
            <div>
              <strong>${htmlSeguro(row.proveedor)}</strong>
              <small>${htmlSeguro(row.tipoOc)} | ${fmt(row.ocCount)} OC | ${htmlSeguro(row.packingList)}</small>
              <i><b style="width:${Math.min(100, pct(row.pallets, maxPallets))}%"></b></i>
            </div>
            <em>${fmt(row.pallets)}</em>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function filasResumenProveedoresRecepcion(rows) {
  const maxPallets = Math.max(...(rows || []).map(row => row.pallets), 1);
  return (rows || []).map(row => `
    <tr class="${row.sinPackingOc ? "warn" : ""}" data-proveedor-recepcion="${atributoSeguro(row.proveedor)}">
      <td><strong>${htmlSeguro(row.tipoOc)}</strong></td>
      <td>
        <strong>${htmlSeguro(row.proveedor)}</strong>
        <div class="table-mini-track"><i style="width:${Math.min(100, pct(row.pallets, maxPallets))}%"></i></div>
      </td>
      <td><strong>${htmlSeguro(row.packingList)}</strong></td>
      <td class="number">${fmt(row.ocCount)}</td>
      <td class="number">${fmt(row.packingOc)}</td>
      <td class="number">${fmt(row.sinPackingOc)}</td>
      <td class="number">${fmt(row.productos)}</td>
      <td class="number">${fmt(row.bultos)}</td>
      <td class="number"><strong>${fmt(row.pallets)}</strong></td>
      <td><button class="compact" onclick="abrirAjusteProveedorRecepcion(${argumentoSeguro(row.proveedor)})">Ajustar</button></td>
    </tr>
  `);
}

function bloquePaleterosVisual(vista) {
  const rows = vista.paleterosAsn || [];
  const totalPallets = (vista.paleteros || []).reduce((a, b) => a + num(b.pallets), 0);
  const totalBultos = (vista.paleteros || []).reduce((a, b) => a + num(b.bultos), 0);
  const mono = (vista.paleterosMono || []).reduce((a, b) => a + num(b.pallets), 0);
  const multi = (vista.paleterosMulti || []).reduce((a, b) => a + num(b.pallets), 0);
  const pctMono = pct(mono, Math.max(1, mono + multi));
  const placas = new Set((vista.paleteros || []).map(row => row.camion).filter(Boolean)).size;
  const maxPallets = Math.max(...rows.map(row => row.pallets), 1);
  const paleterosRecibidos = totalPaleterosRecibidos(rows);
  return `
    <section class="recepcion-bi-kpis paleteros-kpis">
      <article class="ok received-kpi">
        <span>Paleteros recibidos</span>
        <strong>${fmt(paleterosRecibidos)}</strong>
        <small>ASN OS917 unicos</small>
      </article>
      <article>
        <span>ASN</span>
        <strong>${fmt(rows.length)}</strong>
        <small>${fmt(placas)} placas</small>
      </article>
      <article>
        <span>Pallets</span>
        <strong>${fmt(totalPallets)}</strong>
        <small>${fmt(totalBultos)} bultos</small>
      </article>
      <article class="${vista.paleterosMulti?.length ? "warn" : "ok"}">
        <span>Multi</span>
        <strong>${fmt(vista.paleterosMulti?.length || 0)}</strong>
        <small>no reserva</small>
      </article>
      <article>
        <span>Mono</span>
        <strong>${fmt(vista.paleterosMono?.length || 0)}</strong>
        <small>almacenables</small>
      </article>
    </section>
    <section class="recepcion-bi-panel">
      <div class="recepcion-paletero-report">
        <div>
          <div class="section-head compact-head">
            <h3>Ranking ASN / placa</h3>
            <span class="muted-note">Top por pallets</span>
          </div>
          <div class="recepcion-provider-ranking compact">
            ${rows.slice().sort((a, b) => b.pallets - a.pallets).slice(0, 6).map((row, index) => `
              <button type="button" class="recepcion-provider-rank" onclick="abrirDetallePaleteroRecepcion(${argumentoSeguro(row.asn)})">
                <span>${index + 1}</span>
                <div>
                  <strong>${htmlSeguro(row.asn)}</strong>
                  <small>${htmlSeguro(row.camion || "SIN PLACA")} | Mono ${fmt(row.mono)} | Multi ${fmt(row.multi)}</small>
                  <i><b style="width:${Math.min(100, pct(row.pallets, maxPallets))}%"></b></i>
                </div>
                <em>${fmt(row.pallets)}</em>
              </button>
            `).join("")}
          </div>
        </div>
        <aside class="recepcion-donut-card">
          <div class="section-head compact-head">
            <h3>Tipo de pallet</h3>
            <span class="muted-note">${fmt(mono + multi)} pallets</span>
          </div>
          <div class="recepcion-donut-wrap">
            <div class="recepcion-donut" style="--mono:${pctMono}">
              <strong>${fmt(Math.round(pctMono))}%</strong>
              <small>mono</small>
            </div>
            <div class="recepcion-donut-legend">
              <div><i class="mono"></i><span>Mono pallet</span><strong>${fmt(mono)}</strong></div>
              <div><i class="multi"></i><span>Multi</span><strong>${fmt(multi)}</strong></div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  `;
}

function bloqueRecepcionProveedores(data) {
  const proveedores = data.proveedores || [];
  const proveedoresResumen = resumenProveedorTipoPacking(proveedores);
  const proveedoresAsn = resumenAsnProveedores(proveedores);
  const totalPallets = proveedores.reduce((a, b) => a + num(b.pallets), 0);
  const totalBultos = proveedores.reduce((a, b) => a + num(b.bultos), 0);
  const totalOc = new Set(proveedores.map(row => row.oc || row.asn).filter(Boolean)).size;
  recepcionUcaVista = { ...data, proveedores, proveedoresAsn, proveedoresResumen, paleteros: [], paleterosAsn: [], paleterosMono: [], paleterosMulti: [] };
  return `
    ${bloqueKpisProveedoresVisual(proveedores)}
    <section class="card subcard">
      <div class="section-head">
        <div>
          <h2>Proveedores</h2>
          <p class="muted-note">Filtro por nombre de proveedor. Puede incluir una o mas OC.</p>
        </div>
        <div class="filters">
          <input class="search" id="filtroRecepcionProveedorNombre" value="${atributoSeguro(filtroRecepcionProveedorNombre)}" placeholder="Buscar proveedor..." oninput="filtrarProveedorRecepcionVista(this.value)">
          <button type="button" onclick="exportarRecepcionDetalleProveedores()">Excel</button>
        </div>
      </div>
      ${bloqueReporteProveedoresVisual(proveedores)}
      ${tablaConId("tablaResumenProveedoresOc", ["Tipo OC", "Proveedor", "Packing list", "OC", "OC PL", "OC pend.", "Codigos", "Bultos", "Pallets", "Acciones"], filasResumenProveedoresRecepcion(proveedoresResumen), "Sin proveedores para mostrar.")}
    </section>
    <div id="modalProveedorRecepcion" class="modal-backdrop" hidden></div>
  `;
}

function filasProveedorRecepcion(proveedor) {
  const key = normalizar(proveedor);
  return (recepcionUcaVista?.proveedores || []).filter(row => normalizar(row.proveedor) === key);
}

function resumenPasillosProveedorRecepcion(rows) {
  const mapa = new Map();
  (rows || []).forEach(row => {
    const pasillo = row.pasillo || "SIN CLASIFICAR";
    if (!mapa.has(pasillo)) mapa.set(pasillo, { pasillo, pallets: 0, bultos: 0, productos: new Set() });
    const item = mapa.get(pasillo);
    item.pallets += num(row.pallets);
    item.bultos += num(row.bultos);
    String(row.productosTxt || "").split(" | ").map(limpiar).filter(Boolean).forEach(codigo => item.productos.add(codigo));
  });
  return Array.from(mapa.values()).map(row => ({ ...row, productosCount: row.productos.size })).sort((a, b) => b.pallets - a.pallets);
}

function htmlDetalleProveedorRecepcion(proveedor, modo = "ver") {
  const rows = filasProveedorRecepcion(proveedor);
  const resumen = resumenProveedorTipoPacking(rows);
  const pasillos = resumenPasillosProveedorRecepcion(rows);
  const totalPallets = rows.reduce((a, b) => a + num(b.pallets), 0);
  const totalBultos = rows.reduce((a, b) => a + num(b.bultos), 0);
  const totalOc = new Set(rows.map(row => row.oc || row.asn).filter(Boolean)).size;
  const pendientes = rows.filter(row => ["PROMEDIO", "APROXIMADO"].includes(row.referenciaPallet));
  return `
    <div class="section-head">
      <div>
        <h2>${htmlSeguro(proveedor)}</h2>
        <p class="muted-note">${fmt(totalOc)} OC | ${fmt(rows.length)} productos | ${fmt(totalPallets)} pallets | ${fmt(totalBultos)} bultos</p>
      </div>
      <div class="filters">
        <button onclick="exportarTablaVisible('tablaDetalleProveedorRecepcion', 'detalle_proveedor_recepcion')">Excel detalle</button>
        <button class="ghost" onclick="cerrarModalProveedorRecepcion()">Cerrar</button>
      </div>
    </div>
    <section class="kpi-grid compact">
      ${kpi("OC", fmt(totalOc))}
      ${kpi("Productos", fmt(rows.length))}
      ${kpi("Pallets", fmt(totalPallets))}
      ${kpi("Bultos", fmt(totalBultos))}
    </section>
    <section class="recepcion-provider-modal-grid">
      <div class="detail-box">
        <h3>Pasillos sugeridos</h3>
        ${tabla(["Pasillo", "Pallets", "Bultos", "Codigos"], pasillos.map(row => `
          <tr>
            <td><strong>${htmlSeguro(row.pasillo)}</strong></td>
            <td class="number">${fmt(row.pallets)}</td>
            <td class="number">${fmt(row.bultos)}</td>
            <td class="number">${fmt(row.productosCount)}</td>
          </tr>
        `), "Sin pasillos sugeridos.")}
      </div>
      <div class="detail-box">
        <h3>Resumen OC</h3>
        ${tabla(["Tipo OC", "Packing", "OC", "OC PL", "OC pend.", "Pallets"], resumen.map(row => `
          <tr>
            <td>${htmlSeguro(row.tipoOc)}</td>
            <td><strong>${htmlSeguro(row.packingList)}</strong></td>
            <td class="number">${fmt(row.ocCount)}</td>
            <td class="number">${fmt(row.packingOc)}</td>
            <td class="number">${fmt(row.sinPackingOc)}</td>
            <td class="number">${fmt(row.pallets)}</td>
          </tr>
        `), "Sin resumen.")}
      </div>
    </section>
    ${modo === "ajustar" ? `
      <div class="detail-box">
        <h3>Ajustar pallet fisico</h3>
        <div class="filters">
          <label>Codigo producto<input id="validacionProveedorCodigo" class="search small" placeholder="Codigo"></label>
          <label>Bultos por pallet<input id="validacionProveedorMax" class="search small" type="number" min="1" step="1" placeholder="80"></label>
          <label>Observacion<input id="validacionProveedorObs" class="search" placeholder="Validado en recepcion / proveedor"></label>
          <button type="button" onclick="guardarValidacionPalletProveedor()">Guardar y recalcular</button>
        </div>
        ${tabla(["Codigo", "Descripcion", "Bultos", "Referencia", "Max usado", "Usar"], (pendientes.length ? pendientes : rows).slice(0, 20).map(row => `
          <tr class="${["PROMEDIO", "APROXIMADO"].includes(row.referenciaPallet) ? "warn" : ""}">
            <td><strong>${htmlSeguro(row.codigoValidacion)}</strong></td>
            <td>${htmlSeguro(row.descripcionValidacion)}</td>
            <td class="number">${fmt(row.bultos)}</td>
            <td>${htmlSeguro(row.referenciaPallet)}</td>
            <td class="number">${fmt(row.maxPallet)}</td>
            <td><button class="compact" onclick="prepararValidacionPalletProveedor(${argumentoSeguro(row.codigoValidacion)}, ${argumentoSeguro(row.descripcionValidacion)})">Usar</button></td>
          </tr>
        `), "Sin productos para ajustar.")}
      </div>
    ` : ""}
    ${tablaConId("tablaDetalleProveedorRecepcion", ["OC", "Tipo OC", "Producto", "Descripcion", "Pasillo", "Pallets", "Bultos", "Max pallet", "Pucho", "Referencia"], rows.map(row => `
      <tr>
        <td>${htmlSeguro(row.asn)}</td>
        <td>${htmlSeguro(row.tipoOc)}</td>
        <td><strong>${htmlSeguro(row.productosTxt)}</strong></td>
        <td>${htmlSeguro(row.descripcion)}</td>
        <td><strong>${htmlSeguro(row.pasillo)}</strong></td>
        <td class="number">${fmt(row.pallets)}</td>
        <td class="number">${fmt(row.bultos)}</td>
        <td class="number">${fmt(row.maxPallet)}</td>
        <td class="number">${fmt(row.saldoBultos)}</td>
        <td>${htmlSeguro(row.referenciaPallet)}</td>
      </tr>
    `), "Sin detalle del proveedor.")}
  `;
}

function abrirDetalleProveedorRecepcion(proveedor) {
  const modal = document.getElementById("modalProveedorRecepcion");
  if (!modal) return;
  modal.innerHTML = `<div class="modal-card wide">${htmlDetalleProveedorRecepcion(proveedor, "ver")}</div>`;
  modal.hidden = false;
}

function abrirAjusteProveedorRecepcion(proveedor) {
  const modal = document.getElementById("modalProveedorRecepcion");
  if (!modal) return;
  modal.innerHTML = `<div class="modal-card wide">${htmlDetalleProveedorRecepcion(proveedor, "ajustar")}</div>`;
  modal.hidden = false;
}

function cerrarModalProveedorRecepcion() {
  const modal = document.getElementById("modalProveedorRecepcion");
  if (!modal) return;
  modal.hidden = true;
  modal.innerHTML = "";
}

function filasPaleteroRecepcion(asn) {
  const key = normalizar(asn);
  return (recepcionUcaVista?.paleteros || []).filter(row => normalizar(row.asn) === key);
}

function resumenPasillosPaleteroRecepcion(rows) {
  const mapa = new Map();
  (rows || []).forEach(row => {
    const pasillo = row.pasillo || "SIN CLASIFICAR";
    if (!mapa.has(pasillo)) mapa.set(pasillo, { pasillo, pallets: 0, bultos: 0, mono: 0, multi: 0, productos: new Set() });
    const item = mapa.get(pasillo);
    item.pallets += num(row.pallets);
    item.bultos += num(row.bultos);
    if (row.clasePallet === "MULTI") item.multi += num(row.pallets);
    else item.mono += num(row.pallets);
    String(row.productosTxt || "").split(" | ").map(limpiar).filter(Boolean).forEach(codigo => item.productos.add(codigo));
  });
  return Array.from(mapa.values()).map(row => ({ ...row, productosCount: row.productos.size })).sort((a, b) => b.pallets - a.pallets);
}

function productosDetallePalletPaletero(row) {
  if (row?.productosDetalle?.length) return row.productosDetalle;
  const codigos = String(row?.productosTxt || "").split(" | ").map(limpiar).filter(Boolean);
  const descripciones = String(row?.descripcion || "").split(" | ").map(limpiar);
  if (!codigos.length) return [];
  return codigos.map((codigo, index) => ({
    codigo,
    alternativo: "",
    descripcion: descripciones[index] || descripciones[0] || "",
    bultos: "",
    unidades: ""
  }));
}

function htmlDetallePalletMultiPaletero(asn, pallet) {
  const row = filasPaleteroRecepcion(asn).find(item => normalizar(item.lpn) === normalizar(pallet)) || {};
  const productos = productosDetallePalletPaletero(row);
  return `
    <div class="modal-card">
      <div class="section-head">
        <div>
          <h2>${htmlSeguro(pallet)}</h2>
          <p class="muted-note">${htmlSeguro(asn)} | ${htmlSeguro(row.camion || "SIN PLACA")} | ${fmt(row.bultos)} bultos</p>
        </div>
        <button class="ghost" onclick="cerrarDetallePalletMultiPaletero()">Cerrar</button>
      </div>
      ${tabla(["Codigo", "Cod alterno", "Descripcion", "Bultos", "Unidades"], productos.map(prod => `
        <tr>
          <td><strong>${htmlSeguro(prod.codigo)}</strong></td>
          <td>${htmlSeguro(prod.alternativo || "")}</td>
          <td>${htmlSeguro(prod.descripcion || "")}</td>
          <td class="number">${prod.bultos === "" ? "" : fmt(prod.bultos)}</td>
          <td class="number">${prod.unidades === "" ? "" : fmt(prod.unidades)}</td>
        </tr>
      `), "Sin detalle de productos.")}
    </div>
  `;
}

function abrirDetallePalletMultiPaletero(asn, pallet) {
  const modal = document.getElementById("modalPalletMultiRecepcion");
  if (!modal) return;
  modal.innerHTML = htmlDetallePalletMultiPaletero(asn, pallet);
  modal.hidden = false;
}

function cerrarDetallePalletMultiPaletero() {
  const modal = document.getElementById("modalPalletMultiRecepcion");
  if (!modal) return;
  modal.hidden = true;
  modal.innerHTML = "";
}

function celdaDetallePalletPaletero(row) {
  if (row.clasePallet === "MULTI") {
    return `<button type="button" class="compact" onclick="abrirDetallePalletMultiPaletero(${argumentoSeguro(row.asn)}, ${argumentoSeguro(row.lpn)})">Ver</button>`;
  }
  return `<strong>${htmlSeguro(row.productosTxt)}</strong>${row.descripcion ? `<small>${htmlSeguro(row.descripcion)}</small>` : ""}`;
}

function htmlDetallePaleteroRecepcion(asn) {
  const rows = filasPaleteroRecepcion(asn);
  const pasillos = resumenPasillosPaleteroRecepcion(rows);
  const resumen = (recepcionUcaVista?.paleterosAsn || []).find(row => normalizar(row.asn) === normalizar(asn)) || {};
  const totalPallets = rows.reduce((a, b) => a + num(b.pallets), 0);
  const totalBultos = rows.reduce((a, b) => a + num(b.bultos), 0);
  const totalLpns = rows.reduce((a, b) => a + num(b.lpns), 0);
  const totalProductos = rows.reduce((acc, row) => {
    String(row.productosTxt || "").split(" | ").map(limpiar).filter(Boolean).forEach(codigo => acc.add(codigo));
    return acc;
  }, new Set()).size;
  return `
    <div class="section-head">
      <div>
        <h2>${htmlSeguro(asn)}</h2>
        <p class="muted-note">${htmlSeguro(resumen.camion || "SIN PLACA")} | ${fmt(rows.length)} pallets/grupos | ${fmt(totalBultos)} bultos</p>
      </div>
      <div class="filters">
        <button onclick="exportarTablaVisible('tablaDetallePaleteroRecepcion', 'detalle_paletero_recepcion')">Excel detalle</button>
        <button class="ghost" onclick="cerrarModalPaleteroRecepcion()">Cerrar</button>
      </div>
    </div>
    <section class="kpi-grid compact">
      ${kpi("Pallets", fmt(totalPallets))}
      ${kpi("LPNs", fmt(totalLpns))}
      ${kpi("Codigos", fmt(totalProductos))}
      ${kpi("Bultos", fmt(totalBultos))}
    </section>
    <section class="recepcion-provider-modal-grid">
      <div class="detail-box">
        <h3>Pasillos sugeridos</h3>
        ${tabla(["Pasillo", "Pallets", "Mono", "Multi", "Bultos", "Codigos"], pasillos.map(row => `
          <tr class="${row.multi ? "warn" : ""}">
            <td><strong>${htmlSeguro(row.pasillo)}</strong></td>
            <td class="number"><strong>${fmt(row.pallets)}</strong></td>
            <td class="number">${fmt(row.mono)}</td>
            <td class="number">${fmt(row.multi)}</td>
            <td class="number">${fmt(row.bultos)}</td>
            <td class="number">${fmt(row.productosCount)}</td>
          </tr>
        `), "Sin pasillos sugeridos.")}
      </div>
      <div class="detail-box">
        <h3>Resumen pallet</h3>
        ${tabla(["Tipo", "Pallets", "Detalle"], [
          `<tr><td><strong>MONO</strong></td><td class="number">${fmt(resumen.mono || rows.filter(row => row.clasePallet === "MONO").length)}</td><td>Almacenable en reserva</td></tr>`,
          `<tr class="${resumen.multi ? "warn" : ""}"><td><strong>MULTI</strong></td><td class="number">${fmt(resumen.multi || rows.filter(row => row.clasePallet === "MULTI").length)}</td><td>No suma a reserva</td></tr>`
        ], "Sin resumen.")}
      </div>
    </section>
    ${tablaConId("tablaDetallePaleteroRecepcion", ["ASN", "Placa", "Pallet", "LPNs", "Codigos", "Tipo", "Pasillo", "Bultos", "Detalle", "Metodo"], rows.map(row => `
      <tr class="${row.clasePallet === "MULTI" ? "warn" : ""}">
        <td>${htmlSeguro(row.asn)}</td>
        <td>${htmlSeguro(row.camion || "SIN PLACA")}</td>
        <td><strong>${htmlSeguro(row.lpn)}</strong></td>
        <td class="number">${fmt(row.lpns)}</td>
        <td class="number">${fmt(row.productos)}</td>
        <td><strong>${htmlSeguro(row.clasePallet)}</strong></td>
        <td><strong>${htmlSeguro(row.pasillo)}</strong></td>
        <td class="number">${fmt(row.bultos)}</td>
        <td>${celdaDetallePalletPaletero(row)}</td>
        <td>${htmlSeguro(row.metodo)}</td>
      </tr>
    `), "Sin detalle del ASN.")}
    <div id="modalPalletMultiRecepcion" class="modal-backdrop modal-child" hidden></div>
  `;
}

function abrirDetallePaleteroRecepcion(asn) {
  const modal = document.getElementById("modalPaleteroRecepcion");
  if (!modal) return;
  modal.innerHTML = `<div class="modal-card wide">${htmlDetallePaleteroRecepcion(asn)}</div>`;
  modal.hidden = false;
}

function cerrarModalPaleteroRecepcion() {
  const modal = document.getElementById("modalPaleteroRecepcion");
  if (!modal) return;
  modal.hidden = true;
  modal.innerHTML = "";
}

function bloqueRecepcionPaleteros(data) {
  const vista = recalcularRecepcionProyeccion(data, "paleteros");
  const paleteros = vista.paleteros || [];
  const paleterosAsn = vista.paleterosAsn || [];
  recepcionUcaVista = vista;
  return `
    ${filtrosRecepcionProyeccionHtml(data, "paleteros")}
    ${bloquePaleterosVisual(vista)}
    <section class="card subcard">
      <div class="section-head">
        <div>
          <h2>Paleteros</h2>
          <p class="muted-note">Pallets que traen y pasillo sugerido segun historico de producto o jerarquia.</p>
        </div>
        <button type="button" onclick="exportarRecepcionDetallePaleteros()">Excel paletero</button>
      </div>
      ${tablaConId("tablaRecepcionPaleterosResumen", ["ASN", "Placa", "Pallets", "LPNs", "Codigos", "Mono", "Multi", "Bultos", "Pasillos"], paleterosAsn.map(row => `
        <tr>
          <td><strong>${htmlSeguro(row.asn)}</strong></td>
          <td>${htmlSeguro(row.camion || "SIN PLACA")}</td>
          <td class="number">${fmt(row.pallets)}</td>
          <td class="number">${fmt(row.lpns)}</td>
          <td class="number">${fmt(row.productos)}</td>
          <td class="number">${fmt(row.mono)}</td>
          <td class="number">${fmt(row.multi)}</td>
          <td class="number">${fmt(row.bultos)}</td>
          <td>${htmlSeguro(row.pasillos || "SIN CLASIFICAR")}</td>
        </tr>
      `), "Sin paleteros para mostrar.")}
    </section>
    <div id="modalPaleteroRecepcion" class="modal-backdrop" hidden></div>
  `;
}

function mapaLpnsRecepcionUbicados() {
  const key = firmaFilas(dataLPN, ["LPN", "ESTADO", "UBICACION", "CODIGO", "CODIGO_ALT", "BULTOS"]);
  if (cacheMapaLpnsRecepcionUbicados.key === key && cacheMapaLpnsRecepcionUbicados.data) return cacheMapaLpnsRecepcionUbicados.data;
  const mapa = new Map();
  (dataLPN || []).forEach(row => {
    const lpn = normalizar(campo(row, ["LPN", "NRO LPN", "Nro LPN"]));
    if (!lpn) return;
    if (!mapa.has(lpn)) {
      mapa.set(lpn, {
        lpn,
        ubicacion: limpiar(campo(row, ["UBICACION", "Ubicacion"])),
        estado: limpiar(campo(row, ["ESTADO", "Estado"])),
        bultos: 0,
        unidades: 0,
        codigos: new Set(),
        descripciones: new Set(),
        rows: []
      });
    }
    const item = mapa.get(lpn);
    if (!item.ubicacion && limpiar(campo(row, ["UBICACION", "Ubicacion"]))) item.ubicacion = limpiar(campo(row, ["UBICACION", "Ubicacion"]));
    if (!item.estado && limpiar(campo(row, ["ESTADO", "Estado"]))) item.estado = limpiar(campo(row, ["ESTADO", "Estado"]));
    item.bultos += num(campo(row, ["BULTOS", "Bultos", "CS"]));
    item.unidades += num(campo(row, ["UNIDADES", "Unidades", "UNACT"]));
    const codigo = normalizar(campo(row, ["CODIGO", "PRODUCTO"]));
    const descripcion = limpiar(campo(row, ["DESCRIPCION", "Descripcion"]));
    if (codigo) item.codigos.add(codigo);
    if (descripcion) item.descripciones.add(descripcion);
    item.rows.push(row);
  });
  cacheMapaLpnsRecepcionUbicados = { key, data: mapa };
  return mapa;
}

function lpnsDePalletPaletero(row) {
  const lpns = String(row.lpnsTxt || "")
    .split("|")
    .map(limpiar)
    .filter(Boolean);
  if (lpns.length) return Array.from(new Set(lpns));
  return row.lpn ? [row.lpn] : [];
}

function estadoUbicacionLpnRecepcion(info) {
  if (!info) return { estado: "NO EN DATA LPN", clase: "bad" };
  const ubicacion = limpiar(info.ubicacion);
  const estado = normalizar(info.estado);
  const esMass = ubicacion.toUpperCase().startsWith("MASS");
  if (esMass && estado === "UBICADO") return { estado: "UBICADO RESERVA", clase: "ok" };
  if (!ubicacion) return { estado: "SIN UBICACION SISTEMA", clase: "warn" };
  if (!esMass) return { estado: "OTRA UBICACION", clase: "bad" };
  return { estado: "MASS SIN ESTADO UBICADO", clase: "warn" };
}

function detalleRecepcionUbicadosLpns(data) {
  const key = [
    cacheRecepcionUca.key || firmaFilas(data?.paleterosMono || [], ["asn", "camion", "nroPallet", "lpnsTxt", "lpn", "bultos"]),
    firmaFilas(dataLPN, ["LPN", "ESTADO", "UBICACION", "CODIGO", "CODIGO_ALT", "BULTOS"])
  ].join("::");
  if (cacheDetalleRecepcionUbicados.key === key && cacheDetalleRecepcionUbicados.data) return cacheDetalleRecepcionUbicados.data;
  const mapaLpn = mapaLpnsRecepcionUbicados();
  const rows = [];
  (data.paleterosMono || []).forEach(pallet => {
    const lpns = lpnsDePalletPaletero(pallet);
    const bultosPorLpn = num(pallet.bultos) / Math.max(1, lpns.length);
    lpns.forEach(lpn => {
      const info = mapaLpn.get(normalizar(lpn));
      const validacion = estadoUbicacionLpnRecepcion(info);
      rows.push({
        asn: pallet.asn || "SIN ASN",
        placa: pallet.camion || "SIN PLACA",
        pallet: pallet.nroPallet || pallet.lpn || "",
        lpn,
        codigo: pallet.productosTxt || "",
        descripcion: pallet.descripcion || "",
        bultos: info?.bultos || bultosPorLpn,
        ubicacion: info?.ubicacion || "",
        estadoLpn: info?.estado || "",
        resultado: validacion.estado,
        clase: validacion.clase
      });
    });
  });
  cacheDetalleRecepcionUbicados = { key, data: rows.sort((a, b) =>
    String(a.placa).localeCompare(String(b.placa), "es", { numeric: true }) ||
    String(a.asn).localeCompare(String(b.asn), "es", { numeric: true }) ||
    String(a.lpn).localeCompare(String(b.lpn), "es", { numeric: true })
  ) };
  return cacheDetalleRecepcionUbicados.data;
}

function aplicarFiltrosRecepcionUbicados(rows) {
  const asns = new Set((filtrosRecepcionUbicados.asns || []).map(normalizar));
  const placas = new Set((filtrosRecepcionUbicados.placas || []).map(normalizar));
  return (rows || []).filter(row => {
    if (asns.size && !asns.has(normalizar(row.asn))) return false;
    if (placas.size && !placas.has(normalizar(row.placa))) return false;
    return true;
  });
}

function resumenRecepcionUbicadosLpns(rows) {
  const mapa = new Map();
  (rows || []).forEach(row => {
    const key = `${row.placa}|${row.asn}`;
    if (!mapa.has(key)) {
      mapa.set(key, { placa: row.placa, asn: row.asn, total: 0, ubicados: 0, sinUbicacion: 0, otras: 0, estadoPendiente: 0, noData: 0, ubicaciones: new Set() });
    }
    const item = mapa.get(key);
    item.total += 1;
    if (row.resultado === "UBICADO RESERVA") item.ubicados += 1;
    else if (row.resultado === "SIN UBICACION SISTEMA") item.sinUbicacion += 1;
    else if (row.resultado === "OTRA UBICACION") item.otras += 1;
    else if (row.resultado === "NO EN DATA LPN") item.noData += 1;
    else item.estadoPendiente += 1;
    if (row.ubicacion) item.ubicaciones.add(row.ubicacion);
  });
  return Array.from(mapa.values()).map(row => ({
    ...row,
    pct: pct(row.ubicados, row.total),
    faltan: row.total - row.ubicados,
    estado: row.total && row.ubicados === row.total ? "100% UBICADO" : "FALTAN LPNs",
    ubicacionesTxt: Array.from(row.ubicaciones).slice(0, 8).join(" | ")
  })).sort((a, b) => a.estado.localeCompare(b.estado) || b.faltan - a.faltan || String(a.placa).localeCompare(String(b.placa), "es", { numeric: true }));
}

function actualizarFiltroRecepcionUbicados(tipo, valor, activo) {
  const actual = new Set(filtrosRecepcionUbicados[tipo] || []);
  if (activo) actual.add(valor);
  else actual.delete(valor);
  filtrosRecepcionUbicados[tipo] = Array.from(actual);
  refrescarRecepcionUbicadosContenido();
}

function limpiarFiltrosRecepcionUbicados() {
  filtrosRecepcionUbicados = { asns: [], placas: [] };
  refrescarRecepcionUbicadosContenido();
}

function refrescarRecepcionUbicadosContenido() {
  const destino = document.getElementById("recepcionUbicadosContenido");
  if (!destino) return verRecepcionUbicadosLpns();
  destino.innerHTML = bloqueRecepcionUbicadosLpns(recepcionUcaVista);
}

function filtrosRecepcionUbicadosHtml(rows) {
  const asns = Array.from(new Set(rows.map(row => row.asn).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  const placas = Array.from(new Set(rows.map(row => row.placa).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  const checked = (tipo, valor) => (filtrosRecepcionUbicados[tipo] || []).includes(valor) ? "checked" : "";
  const resumenFiltro = (tipo, total) => {
    const cantidad = (filtrosRecepcionUbicados[tipo] || []).length;
    return cantidad ? `${cantidad} seleccionados` : `Todos (${fmt(total)})`;
  };
  const opciones = (tipo, lista) => lista.map(valor => {
    const total = rows.filter(row => normalizar(row[tipo === "placas" ? "placa" : "asn"]) === normalizar(valor)).length;
    return `
      <label class="check-pill">
        <input type="checkbox" ${checked(tipo, valor)} onchange="actualizarFiltroRecepcionUbicados('${tipo}', ${argumentoSeguro(valor)}, this.checked)">
        <span>${htmlSeguro(valor)}</span>
        <strong>${fmt(total)}</strong>
      </label>
    `;
  }).join("");
  return `
    <div class="filters ubicados-filters">
      <details class="check-filter-box dropdown-filter">
        <summary>
          <span>Placas</span>
          <strong>${htmlSeguro(resumenFiltro("placas", placas.length))}</strong>
        </summary>
        <div class="check-filter-list">${opciones("placas", placas) || `<span class="muted-note">Sin placas</span>`}</div>
      </details>
      <details class="check-filter-box dropdown-filter">
        <summary>
          <span>ASN</span>
          <strong>${htmlSeguro(resumenFiltro("asns", asns.length))}</strong>
        </summary>
        <div class="check-filter-list">${opciones("asns", asns) || `<span class="muted-note">Sin ASN</span>`}</div>
      </details>
      <button type="button" onclick="limpiarFiltrosRecepcionUbicados()">Limpiar filtros</button>
    </div>
  `;
}

function graficoRecepcionUbicadosLpns(resumen, total, ubicados, sinUbicacion, otras, pendientesEstado) {
  const porcentaje = pct(ubicados, total);
  const top = resumen.slice().sort((a, b) => b.faltan - a.faltan || a.pct - b.pct).slice(0, 5);
  return `
    <section class="ubicados-report-grid">
      <div class="ubicados-donut-card">
        <div class="section-head compact-head">
          <h3>Estado de ubicacion</h3>
          <span class="muted-note">${fmt(total)} LPNs mono</span>
        </div>
        <div class="ubicados-donut-row">
          <div class="ubicados-donut" style="--pct:${porcentaje};">
            <strong>${porcentaje.toFixed(1)}%</strong>
            <span>Reserva</span>
          </div>
          <div class="ubicados-legend">
            <div><span class="dot ok"></span>Ubicados MASS <strong>${fmt(ubicados)}</strong></div>
            <div><span class="dot warn"></span>Sin ubicacion <strong>${fmt(sinUbicacion)}</strong></div>
            <div><span class="dot bad"></span>Otras ubicaciones <strong>${fmt(otras)}</strong></div>
            <div><span class="dot neutral"></span>Pendiente estado/data <strong>${fmt(pendientesEstado)}</strong></div>
          </div>
        </div>
      </div>
      <div class="ubicados-ranking-card">
        <div class="section-head compact-head">
          <h3>Placas / ASN con faltantes</h3>
          <span class="muted-note">Prioridad para reporte</span>
        </div>
        ${top.length ? top.map((row, idx) => `
          <button type="button" class="ubicados-rank-row" onclick="abrirDetalleRecepcionUbicados(${argumentoSeguro(row.placa)}, ${argumentoSeguro(row.asn)})">
            <span>${idx + 1}</span>
            <div>
              <strong>${htmlSeguro(row.placa)}</strong>
              <small>${htmlSeguro(row.asn)} | ${fmt(row.ubicados)} de ${fmt(row.total)}</small>
              <i><b style="width:${Math.min(100, row.pct)}%"></b></i>
            </div>
            <em>${fmt(row.faltan)}</em>
          </button>
        `).join("") : `<p class="muted-note">No hay faltantes visibles.</p>`}
      </div>
    </section>
  `;
}

function tarjetasResumenRecepcionUbicados(resumen) {
  if (!resumen.length) return `<div class="empty-state">Sin monopalets para validar.</div>`;
  return `
    <section class="ubicados-group-grid">
      ${resumen.map(row => `
        <article class="ubicados-group-card ${row.estado === "100% UBICADO" ? "ok" : "warn"}">
          <div>
            <span>${htmlSeguro(row.placa)}</span>
            <strong>${htmlSeguro(row.asn)}</strong>
          </div>
          <div class="ubicados-group-main">
            <strong>${row.pct.toFixed(1)}%</strong>
            <small>${fmt(row.ubicados)} de ${fmt(row.total)} ubicados</small>
          </div>
          <div class="ubicados-mini-stats">
            <span>Faltan <b>${fmt(row.faltan)}</b></span>
            <span>Sin ubic. <b>${fmt(row.sinUbicacion)}</b></span>
            <span>Otras <b>${fmt(row.otras)}</b></span>
          </div>
          <div class="ubicados-progress"><b style="width:${Math.min(100, row.pct)}%"></b></div>
          <button type="button" class="compact" onclick="abrirDetalleRecepcionUbicados(${argumentoSeguro(row.placa)}, ${argumentoSeguro(row.asn)})">Ver detalle</button>
        </article>
      `).join("")}
    </section>
  `;
}

function bloqueRecepcionUbicadosLpns(data) {
  const detalle = detalleRecepcionUbicadosLpns(data);
  const filtrado = aplicarFiltrosRecepcionUbicados(detalle);
  const resumen = resumenRecepcionUbicadosLpns(filtrado);
  const total = filtrado.length;
  const ubicados = filtrado.filter(row => row.resultado === "UBICADO RESERVA").length;
  const sinUbicacion = filtrado.filter(row => row.resultado === "SIN UBICACION SISTEMA").length;
  const otras = filtrado.filter(row => row.resultado === "OTRA UBICACION").length;
  const pendientesEstado = filtrado.filter(row => row.resultado === "MASS SIN ESTADO UBICADO" || row.resultado === "NO EN DATA LPN").length;
  return `
    <section class="recepcion-validation-card ubicados-view">
      ${filtrosRecepcionUbicadosHtml(detalle)}
      <section class="kpi-grid compact">
        ${kpi("Monopalets/LPN", fmt(total), "solo paleteros mono")}
        ${kpi("Ubicados reserva", fmt(ubicados), `${pct(ubicados, total).toFixed(1)}%`, "ok")}
        ${kpi("Sin ubicacion", fmt(sinUbicacion), "en blanco / paletero", sinUbicacion ? "warn" : "")}
        ${kpi("Otras ubicaciones", fmt(otras), "no MASS", otras ? "danger" : "")}
        ${kpi("Estado pendiente", fmt(pendientesEstado), "no ubicado / sin data", pendientesEstado ? "warn" : "")}
      </section>
      ${graficoRecepcionUbicadosLpns(resumen, total, ubicados, sinUbicacion, otras, pendientesEstado)}
      <div class="subhead">
        <h3>Resumen compacto por ASN / placa</h3>
        <span class="muted-note">${fmt(resumen.length)} grupos visibles</span>
      </div>
      ${tarjetasResumenRecepcionUbicados(resumen)}
      <div id="modalRecepcionUbicadosLpns" class="modal-backdrop" hidden></div>
    </section>
  `;
}

function htmlDetalleRecepcionUbicados(placa, asn) {
  const data = recepcionUcaVista?.paleterosMono ? recepcionUcaVista : calcularRecepcionUca(calcularCapacidadCd(), prediccionLiberacionPts());
  const detalle = aplicarFiltrosRecepcionUbicados(detalleRecepcionUbicadosLpns(data))
    .filter(row => normalizar(row.placa) === normalizar(placa) && normalizar(row.asn) === normalizar(asn));
  const ubicados = detalle.filter(row => row.resultado === "UBICADO RESERVA").length;
  const faltan = detalle.length - ubicados;
  return `
    <div class="section-head">
      <div>
        <h2>${htmlSeguro(placa)} | ${htmlSeguro(asn)}</h2>
        <p class="muted-note">${fmt(ubicados)} ubicados en MASS / ${fmt(faltan)} por revisar</p>
      </div>
      <button class="ghost" onclick="cerrarDetalleRecepcionUbicados()">Cerrar</button>
    </div>
    <section class="kpi-grid compact">
      ${kpi("LPN mono", fmt(detalle.length), "total")}
      ${kpi("Ubicados reserva", fmt(ubicados), `${pct(ubicados, detalle.length).toFixed(1)}%`, "ok")}
      ${kpi("Por revisar", fmt(faltan), "sin ubicacion / otra / estado", faltan ? "warn" : "")}
    </section>
    ${tablaConId("tablaRecepcionUbicadosDetalleModal", ["Pallet", "LPN", "Codigo", "Descripcion", "Bultos", "Ubicacion sistema", "Estado LPN", "Resultado"], detalle.map(row => `
      <tr class="${row.clase}">
        <td><strong>${htmlSeguro(row.pallet)}</strong></td>
        <td><strong>${htmlSeguro(row.lpn)}</strong></td>
        <td>${htmlSeguro(row.codigo)}</td>
        <td>${htmlSeguro(row.descripcion || "-")}</td>
        <td class="number">${fmt(row.bultos)}</td>
        <td><strong>${htmlSeguro(row.ubicacion || "SIN UBICACION")}</strong></td>
        <td>${htmlSeguro(row.estadoLpn || "-")}</td>
        <td><strong>${htmlSeguro(row.resultado)}</strong></td>
      </tr>
    `), "Sin detalle de LPNs monopalets.")}
  `;
}

function abrirDetalleRecepcionUbicados(placa, asn) {
  const modal = document.getElementById("modalRecepcionUbicadosLpns");
  if (!modal) return;
  modal.innerHTML = `<div class="modal-card wide">${htmlDetalleRecepcionUbicados(placa, asn)}</div>`;
  modal.hidden = false;
}

function cerrarDetalleRecepcionUbicados() {
  const modal = document.getElementById("modalRecepcionUbicadosLpns");
  if (!modal) return;
  modal.hidden = true;
  modal.innerHTML = "";
}

function bloqueRecepcionUca(data, mostrarBotonExcel = true, modo = "todos") {
  const dataCompleta = data.sinFiltro || data;
  const vista = recalcularRecepcionProyeccion(dataCompleta, modo);
  recepcionUcaVista = vista;
  const proveedoresAsn = vista.proveedoresAsn || [];
  const paleterosAsn = vista.paleterosAsn || [];
  const detalleAsnPasillo = vista.detalleAsnPasillo || [];
  const ordenPasillos = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "11", "12"];
  const resumenOrdenado = vista.resumen.slice().sort((a, b) => ordenPasillos.indexOf(a.pasillo) - ordenPasillos.indexOf(b.pasillo));
  return `
    <section class="card uca-recepcion-card">
      <div class="section-head">
        <div>
          <h2>Recepcion proyectada</h2>
          <p class="muted-note">Cruce de pallets por recibir contra ubicaciones libres y liberacion PTS estimada.</p>
        </div>
        ${mostrarBotonExcel ? `<button type="button" onclick="exportarRecepcionUca()">Excel recepcion</button>` : ""}
      </div>
      ${filtrosRecepcionProyeccionHtml(dataCompleta, modo)}
      ${resumenVisualRecepcion(vista, proveedoresAsn, paleterosAsn)}
      <div class="recepcion-summary-card">
        <div class="section-head compact-head">
          <h3>Capacidad vs llegada por pasillo</h3>
          <span class="muted-note">Comparativo para decidir si ingresa o falta liberar espacio</span>
        </div>
        ${graficoBarrasPasilloRecepcion(resumenOrdenado)}
        ${alertaPtsRecepcion(vista)}
        ${vista.total.sinClasificar ? `<p class="muted-note">Pallets sin clasificar por pasillo: <strong>${fmt(vista.total.sinClasificar)}</strong>. Requieren validar jerarquia o historico.</p>` : ""}
      </div>
      ${modo === "paleteros" && vista.total.paleterosMulti ? `<div class="notice">Paleteros MULTI detectados: <strong>${fmt(vista.total.paleterosMulti)}</strong> pallets. Se muestran en el detalle, pero no se suman a la llegada de reserva porque no se almacenan.</div>` : ""}
      <div class="recepcion-asn-layout">
        ${modo !== "paleteros" ? tarjetasAsnRecepcion("Proveedores por OC", proveedoresAsn, "proveedor") : ""}
        ${modo !== "proveedores" ? tarjetasAsnRecepcion("Paleteros por ASN", paleterosAsn, "paletero") : ""}
      </div>
      <div class="section-head compact-head subhead">
        <h3>Resumen por pasillo y ASN</h3>
        <span class="muted-note">Pallets por origen contra capacidad proyectada</span>
      </div>
      ${cuadroPasilloAsnRecepcion(detalleAsnPasillo)}
    </section>
  `;
}

function exportarRecepcionUca() {
  const data = recepcionUcaVista;
  if (!data || !data.resumen) return alert("No hay data de recepcion para exportar");
  descargarExcelHojas("uca_recepcion_proyectada", [
    {
      nombre: "Resumen pasillo",
      filas: [
        ["PASILLO", "LIBRE ACTUAL", "LIBERACION PTS", "CAPACIDAD CON PTS", "PALLETS PROVEEDORES", "PALETEROS MONO ALMACENABLES", "PALETEROS MULTI NO RESERVA", "LLEGADA A RESERVA", "DIF. ACTUAL", "DIF. CON PTS", "ESTADO ACTUAL", "ESTADO CON PTS"],
        ...data.resumen.map(row => [row.pasillo, row.libres, row.pts, row.capacidadProyectada, row.proveedores, row.paleteros, row.paleterosMulti, row.llegada, row.diferenciaActual, row.diferencia, row.estadoActual, row.estado])
      ]
    },
    {
      nombre: "Proveedores ASN",
      filas: [
        ["OC", "TIPO OC", "PROVEEDOR", "PACKING LIST", "PALLETS", "PRODUCTOS", "BULTOS", "PASILLOS"],
        ...(data.proveedoresAsn || []).map(row => [row.asn, row.tipoOc, row.proveedor, row.packingList ? "SI" : "NO", row.pallets, row.productos, row.bultos, row.pasillos])
      ]
    },
    {
      nombre: "Resumen proveedores",
      filas: [
        ["TIPO OC", "PROVEEDOR", "PACKING LIST", "OC", "OC CON PACKING", "OC SIN PACKING", "CODIGOS", "BULTOS", "PALLETS APROX"],
        ...(data.proveedoresResumen || []).map(row => [row.tipoOc, row.proveedor, row.packingList, row.ocCount, row.packingOc, row.sinPackingOc, row.productos, row.bultos, row.pallets])
      ]
    },
    {
      nombre: "Detalle proveedores",
      filas: [
        ["OC", "TIPO OC", "PROVEEDOR", "PACKING LIST", "PASILLO", "MAX PALLET", "PALLETS COMPLETOS", "PUCHO BULTOS", "PUCHO CUENTA", "PALLETS", "BULTOS", "PRODUCTOS", "DESCRIPCION", "REFERENCIA", "METODO PALLET", "METODO PASILLO"],
        ...data.proveedores.map(row => [row.asn, row.tipoOc, row.proveedor, row.packingList ? "SI" : "NO", row.pasillo, row.maxPallet, row.palletsCompletos, row.saldoBultos, row.saldoCuentaPallet ? "SI" : "NO", row.pallets, row.bultos, row.productosTxt, row.descripcion, row.referenciaPallet, row.metodoPallet, row.metodo])
      ]
    },
    {
      nombre: "Paleteros ASN",
      filas: [
        ["ASN", "PLACA", "PALLETS", "LPNS", "CODIGOS", "MONO", "MULTI", "BULTOS", "PASILLOS"],
        ...(data.paleterosAsn || []).map(row => [row.asn, row.camion || "", row.pallets, row.lpns, row.productos, row.mono, row.multi, row.bultos, row.pasillos])
      ]
    },
    {
      nombre: "Pasillo ASN",
      filas: [
        ["PASILLO", "ASN", "ORIGEN", "PALLETS", "LPNS", "PRODUCTOS", "BULTOS", "CAPACIDAD PASILLO", "LLEGADA PASILLO", "ESTADO"],
        ...(data.detalleAsnPasillo || []).map(row => [row.pasillo, row.asn, row.origen, row.pallets, row.lpns, row.productos, row.bultos, row.capacidad, row.llegadaPasillo, row.estadoPasillo])
      ]
    },
    {
      nombre: "Paleteros",
      filas: [
        ["ASN", "PLACA", "PALLET", "LPNS", "CODIGOS", "TIPO", "ALMACENA EN RESERVA", "PASILLO", "PALLETS", "BULTOS", "PRODUCTOS", "DESCRIPCION", "METODO PASILLO"],
        ...data.paleteros.map(row => [row.asn, row.camion || "", row.lpn, row.lpns, row.productos, row.clasePallet, row.clasePallet === "MONO" ? "SI" : "NO", row.pasillo, row.pallets, row.bultos, row.productosTxt, row.descripcion, row.metodo])
      ]
    },
    {
      nombre: "Validacion ASN",
      filas: [
        ["ASN", "CAMION", "FE Y HR CREAC", "ESTADO 5 DIAS", "DIAS TRANSCURRIDOS", "DIAS FALTANTES", "PALLETS", "MONO", "MULTI", "PALLETS CON CODIGO", "CODIGOS INVOLUCRADOS"],
        ...((data.validacionPaletero?.resumenAsn || []).map(row => [row.asn, row.camion, row.fechaCreacion, row.tiempo?.estado || "", row.tiempo?.dias || 0, row.tiempo?.faltanDias || 0, row.pallets, row.mono, row.multi, row.palletsSeparar, row.codigosSepararTxt]))
      ]
    },
    {
      nombre: "Pallets codigos",
      filas: [
        ["ASN", "CAMION", "FE Y HR CREAC", "PALLET", "LPNS", "LPN DETALLE", "CODIGOS", "TIPO", "BULTOS", "UNIDADES", "TRAE CODIGO", "CODIGOS A SEPARAR", "ESTADO 5 DIAS", "MENSAJE"],
        ...((data.validacionPaletero?.detalle || []).map(row => [row.asn, row.camion, row.fechaCreacion, row.pallet, row.lpns, row.lpnsTxt, row.codigos, row.tipo, row.bultos, row.unidades, row.tieneCodigoSeparar ? "SI" : "NO", row.codigosSepararTxt, row.estado, row.mensaje]))
      ]
    }
  ]);
}

function exportarValidacionPaleteroRecepcion() {
  const data = recepcionUcaVista?.validacionPaletero;
  if (!data) return alert("No hay validacion de paleteros para exportar");
  const resumen = filtrarShipToY(data.resumenAsn || []);
  const detalle = filtrarShipToY(data.detalle || []);
  const detalleLpnBase = filtrarShipToY(data.detalleLpn || []);
  const detalleSeparar = detalle.filter(row => row.tieneCodigoSeparar);
  const palletsContados = new Set();
  const detalleLpn = detalleLpnBase.map(row => {
    const key = `${row.asn}|${row.pallet}`;
    const cuentaPallet = palletsContados.has(key) ? 0 : 1;
    palletsContados.add(key);
    return { ...row, cuentaPallet };
  });
  const asns = Array.from(new Set(detalleLpn.map(row => row.asn).filter(Boolean)));
  const placas = Array.from(new Set(detalleLpn.map(row => row.camion).filter(Boolean)));
  const fechas = Array.from(new Set(detalleLpn.map(row => row.fechaCreacion).filter(Boolean)));
  const subtitulo = [
    "ASN", filtrosShipToY.asn || (asns.length === 1 ? asns[0] : "TODOS"),
    "PLACA", filtrosShipToY.placa || (placas.length === 1 ? placas[0] : "TODAS"),
    "FECHA", fechas.length === 1 ? fechas[0] : "VARIAS"
  ];
  descargarExcelHojas("recepcion_validacion_asn_paletero", [
    {
      nombre: "Validacion LPN",
      filas: [
        subtitulo,
        [],
        ["ASN", "PLACA", "FECHA", "LPN", "PALLET", "VALORES", "OBSERVACION", "CUENTA PALLETS", "TIPO", "CODIGOS", "CODIGOS A SEPARAR", "BULTOS", "UNIDADES"],
        ...detalleLpn.map(row => [row.asn, row.camion, row.fechaCreacion, row.lpn, row.pallet, row.codigos, row.observacion, row.cuentaPallet, row.tipo, row.codigosTxt, row.codigosSepararTxt, row.bultos, row.unidades]),
        ["", "", "", "", "", "", "TOTAL PALLETS", palletsContados.size, "", "", "", "", ""]
      ]
    },
    {
      nombre: "Resumen ASN",
      filas: [
        subtitulo,
        [],
        ["ASN", "CAMION", "FE Y HR CREAC", "ESTADO 5 DIAS", "DIAS TRANSCURRIDOS", "DIAS FALTANTES", "PALLETS", "MONO", "MULTI", "PALLETS CON CODIGO", "CODIGOS INVOLUCRADOS", "BULTOS", "UNIDADES"],
        ...resumen.map(row => [row.asn, row.camion, row.fechaCreacion, row.tiempo?.estado || "", row.tiempo?.dias || 0, row.tiempo?.faltanDias || 0, row.pallets, row.mono, row.multi, row.palletsSeparar, row.codigosSepararTxt, row.bultos, row.unidades])
      ]
    },
    {
      nombre: "Pallets a separar",
      filas: [
        subtitulo,
        [],
        ["ASN", "CAMION", "FE Y HR CREAC", "PALLET", "LPNS", "LPN DETALLE", "CODIGOS", "TIPO", "BULTOS", "UNIDADES", "CODIGOS A SEPARAR", "ESTADO 5 DIAS", "MENSAJE"],
        ...detalleSeparar.map(row => [row.asn, row.camion, row.fechaCreacion, row.pallet, row.lpns, row.lpnsTxt, row.codigos, row.tipo, row.bultos, row.unidades, row.codigosSepararTxt, row.estado, row.mensaje])
      ]
    },
    {
      nombre: "Detalle pallets",
      filas: [
        subtitulo,
        [],
        ["ASN", "CAMION", "FE Y HR CREAC", "PALLET", "LPNS", "LPN DETALLE", "CODIGOS", "CODIGOS DETALLE", "TIPO", "BULTOS", "UNIDADES", "TRAE CODIGO", "CODIGOS A SEPARAR", "ESTADO 5 DIAS", "MENSAJE"],
        ...detalle.map(row => [row.asn, row.camion, row.fechaCreacion, row.pallet, row.lpns, row.lpnsTxt, row.codigos, row.codigosTxt, row.tipo, row.bultos, row.unidades, row.tieneCodigoSeparar ? "SI" : "NO", row.codigosSepararTxt, row.estado, row.mensaje])
      ]
    }
  ]);
}

function filasDetalleProductosPaletero(rows) {
  return (rows || []).flatMap(row => {
    const productos = row.productosDetalle?.length ? row.productosDetalle : [{
      codigo: row.productosTxt || "",
      alternativo: "",
      descripcion: row.descripcion || "",
      bultos: row.bultos || 0,
      unidades: row.unidades || 0
    }];
    return productos.map(prod => [
      row.asn,
      row.lpn,
      row.lpnsTxt || "",
      row.lpns,
      row.productos,
      row.clasePallet,
      row.clasePallet === "MONO" ? "SI" : "NO",
      row.pasillo,
      row.metodo,
      prod.codigo,
      prod.alternativo,
      prod.descripcion,
      prod.bultos,
      prod.unidades
    ]);
  });
}

function exportarRecepcionDetalleProveedores() {
  const data = recepcionUcaVista;
  if (!data?.proveedores) return alert("No hay detalle de proveedores para exportar");
  descargarExcelHojas("recepcion_detalle_proveedores", [
    {
      nombre: "Resumen proveedores",
      filas: [
        ["TIPO OC", "PROVEEDOR", "PACKING LIST", "OC", "OC CON PACKING", "OC SIN PACKING", "CODIGOS", "BULTOS", "PALLETS APROX"],
        ...(data.proveedoresResumen || []).map(row => [row.tipoOc, row.proveedor, row.packingList, row.ocCount, row.packingOc, row.sinPackingOc, row.productos, row.bultos, row.pallets])
      ]
    },
    {
      nombre: "Detalle proveedores",
      filas: [
        ["OC", "TIPO OC", "PROVEEDOR", "PACKING LIST", "PASILLO", "MAX PALLET", "PALLETS COMPLETOS", "PUCHO BULTOS", "PUCHO CUENTA", "PALLETS", "BULTOS", "PRODUCTOS", "DESCRIPCION", "REFERENCIA", "METODO PALLET", "METODO PASILLO"],
        ...data.proveedores.map(row => [row.asn, row.tipoOc, row.proveedor, row.packingList ? "SI" : "NO", row.pasillo, row.maxPallet, row.palletsCompletos, row.saldoBultos, row.saldoCuentaPallet ? "SI" : "NO", row.pallets, row.bultos, row.productosTxt, row.descripcion, row.referenciaPallet, row.metodoPallet, row.metodo])
      ]
    }
  ]);
}

function exportarRecepcionDetallePaleteros() {
  const data = recepcionUcaVista;
  if (!data?.paleteros) return alert("No hay detalle de paleteros para exportar");
  descargarExcelHojas("recepcion_detalle_paleteros", [
    {
      nombre: "Resumen pallets",
      filas: [
        ["ASN", "PALLET", "LPNS", "LPNS DETALLE", "CODIGOS", "TIPO", "ALMACENA EN RESERVA", "PASILLO", "PALLETS", "BULTOS", "PRODUCTOS", "DESCRIPCION", "METODO PASILLO"],
        ...data.paleteros.map(row => [row.asn, row.lpn, row.lpns, row.lpnsTxt || "", row.productos, row.clasePallet, row.clasePallet === "MONO" ? "SI" : "NO", row.pasillo, row.pallets, row.bultos, row.productosTxt, row.descripcion, row.metodo])
      ]
    },
    {
      nombre: "Detalle productos",
      filas: [
        ["ASN", "PALLET", "LPNS DETALLE", "CANTIDAD LPNS", "CANTIDAD CODIGOS", "TIPO", "ALMACENA EN RESERVA", "PASILLO", "METODO PASILLO", "CODIGO", "CODIGO ALTERNATIVO", "DESCRIPCION", "BULTOS", "UNIDADES"],
        ...filasDetalleProductosPaletero(data.paleteros)
      ]
    }
  ]);
}

function exportarRecepcionPaleterosMulti() {
  const data = recepcionUcaVista;
  const multi = data?.paleterosMulti || [];
  if (!multi.length) return alert("No hay pallets multi para exportar");
  descargarExcelHojas("recepcion_paleteros_multi_no_reserva", [
    {
      nombre: "Multi resumen",
      filas: [
        ["ASN", "PALLET", "LPNS", "LPNS DETALLE", "CODIGOS", "PASILLO REFERENCIAL", "PALLETS", "BULTOS", "PRODUCTOS", "DESCRIPCION", "METODO PASILLO", "ALMACENA EN RESERVA"],
        ...multi.map(row => [row.asn, row.lpn, row.lpns, row.lpnsTxt || "", row.productos, row.pasillo, row.pallets, row.bultos, row.productosTxt, row.descripcion, row.metodo, "NO"])
      ]
    },
    {
      nombre: "Multi productos",
      filas: [
        ["ASN", "PALLET", "LPNS DETALLE", "CANTIDAD LPNS", "CANTIDAD CODIGOS", "TIPO", "ALMACENA EN RESERVA", "PASILLO REFERENCIAL", "METODO PASILLO", "CODIGO", "CODIGO ALTERNATIVO", "DESCRIPCION", "BULTOS", "UNIDADES"],
        ...filasDetalleProductosPaletero(multi)
      ]
    }
  ]);
}

function exportarRecepcionUbicadosLpns() {
  const data = recepcionUcaVista?.paleterosMono ? recepcionUcaVista : calcularRecepcionUca(calcularCapacidadCd(), prediccionLiberacionPts());
  const detalle = aplicarFiltrosRecepcionUbicados(detalleRecepcionUbicadosLpns(data));
  const resumen = resumenRecepcionUbicadosLpns(detalle);
  if (!detalle.length) return alert("No hay LPNs monopalets para exportar");
  descargarExcelHojas("recepcion_ubicados_lpn", [
    {
      nombre: "Resumen",
      filas: [
        ["PLACA", "ASN", "MONO LPN", "UBICADOS RESERVA", "FALTAN", "PORCENTAJE", "SIN UBICACION", "OTRAS UBICACIONES", "ESTADO PENDIENTE", "NO EN DATA LPN", "ESTADO", "UBICACIONES"],
        ...resumen.map(row => [row.placa, row.asn, row.total, row.ubicados, row.faltan, `${row.pct.toFixed(1)}%`, row.sinUbicacion, row.otras, row.estadoPendiente, row.noData, row.estado, row.ubicacionesTxt || ""])
      ]
    },
    {
      nombre: "Detalle LPN",
      filas: [
        ["PLACA", "ASN", "PALLET", "LPN", "CODIGO", "DESCRIPCION", "BULTOS", "UBICACION SISTEMA", "ESTADO LPN", "RESULTADO"],
        ...detalle.map(row => [row.placa, row.asn, row.pallet, row.lpn, row.codigo, row.descripcion, row.bultos, row.ubicacion || "SIN UBICACION", row.estadoLpn || "", row.resultado])
      ]
    }
  ]);
}

function filasTablaCapacidadResumen(data) {
  return data.map(row => `
    <tr>
      <td><strong>${htmlSeguro(row.pasillo)}</strong></td>
      <td class="number">${fmt(row.total)}</td>
      <td class="number">${fmt(row.ocupadas)}</td>
      <td class="number">${fmt(row.libres)}</td>
      <td class="number"><strong>${row.pct.toFixed(1)}%</strong></td>
    </tr>
  `);
}

function filasTablaCapacidadDetalle(data, incluyeLpns) {
  return data.map(row => `
    <tr class="${row.estado === "LIBRE" ? "ok" : "warn"}">
      <td><strong>${htmlSeguro(row.pasillo)}</strong></td>
      <td>${htmlSeguro(row.ubicacion)}</td>
      <td><strong>${htmlSeguro(row.estado)}</strong></td>
      ${incluyeLpns ? `<td class="number">${fmt(row.lpns)}</td>` : ""}
      <td class="number">${fmt(row.productos)}</td>
      <td class="number">${fmt(row.bultos)}</td>
      <td class="number">${fmt(row.unidades)}</td>
      <td>${htmlSeguro(row.origen)}</td>
    </tr>
  `);
}

function productosExcelCapacidad(row) {
  const codigos = new Set();
  const descripciones = new Set();
  (row.detalle || []).forEach(det => {
    const codigo = normalizar(det.codigo);
    const descripcion = limpiar(det.descripcion);
    if (codigo) codigos.add(codigo);
    if (descripcion) descripciones.add(descripcion);
  });
  return {
    codigos: Array.from(codigos).join(" | "),
    descripciones: Array.from(descripciones).join(" | ")
  };
}

function exportarCapacidadCd(tipo) {
  const data = calcularCapacidadCd()[tipo];
  if (!data) return alert("Tipo de capacidad no encontrado");
  const nombre = tipo === "reserva" ? "capacidad_reserva_detalle" : "capacidad_activo_detalle";
  const headers = tipo === "reserva"
    ? ["PASILLO", "UBICACION", "ESTADO", "CODIGO", "DESCRIPCION", "LPNS", "PRODUCTOS", "BULTOS", "UNIDADES", "ORIGEN"]
    : ["PASILLO", "UBICACION", "ESTADO", "CODIGO", "DESCRIPCION", "PRODUCTOS", "BULTOS", "UNIDADES", "ORIGEN"];
  const filas = data.detalle.map(row => {
    const producto = productosExcelCapacidad(row);
    return tipo === "reserva"
      ? [row.pasillo, row.ubicacion, row.estado, producto.codigos, producto.descripciones, row.lpns || 0, row.productos || 0, row.bultos || 0, row.unidades || 0, row.origen]
      : [row.pasillo, row.ubicacion, row.estado, producto.codigos, producto.descripciones, row.productos || 0, row.bultos || 0, row.unidades || 0, row.origen];
  });

  descargarExcelHojas(nombre, [
    {
      nombre: "Detalle ubicaciones",
      filas: [headers, ...filas]
    }
  ]);
}

function tablaConId(id, headers, rows, empty = "Sin datos") {
  return `
    <div class="table-wrap">
      <table id="${atributoSeguro(id)}">
        <thead><tr>${headers.map(h => `<th>${htmlSeguro(h)}</th>`).join("")}</tr></thead>
        <tbody>${rows.join("") || `<tr><td colspan="${headers.length}">${htmlSeguro(empty)}</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function exportarImagen(id, nombre) {
  if (typeof html2canvas === "undefined") return alert("No se cargo html2canvas");
  const el = document.getElementById(id);
  if (!el) return alert("No se encontro la seccion");

  html2canvas(el).then(canvas => {
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${nombre}.png`;
    a.click();
  });
}

function descargarExcel(nombre, html) {
  const blob = new Blob([prepararHtmlExcel(html)], { type: "application/vnd.ms-excel" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${nombre}.xls`;
  a.click();
}

function descargarExcelHojas(nombre, hojas) {
  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#243047" ss:Pattern="Solid"/></Style>
  <Style ss:ID="text"><NumberFormat ss:Format="@"/></Style>
  <Style ss:ID="number"><NumberFormat ss:Format="#,##0.00"/></Style>
 </Styles>
 ${hojas.map(hoja => `
 <Worksheet ss:Name="${xmlSeguro(nombreHojaExcel(hoja.nombre))}">
  <Table>
   ${hoja.filas.map((fila, index) => `<Row>${fila.map(valor => celdaExcelXml(valor, index === 0)).join("")}</Row>`).join("")}
  </Table>
 </Worksheet>`).join("")}
</Workbook>`;
  const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${nombre}.xls`;
  a.click();
}

function xmlSeguro(valor) {
  return String(valor ?? "").replace(/[<>&'"]/g, char => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    "'": "&apos;",
    '"': "&quot;"
  }[char]));
}

function nombreHojaExcel(nombre) {
  return limpiar(nombre).replace(/[:\\/?*\[\]]/g, " ").slice(0, 31) || "Hoja";
}

function celdaExcelXml(valor, header = false) {
  const esNumero = typeof valor === "number" && Number.isFinite(valor);
  const tipo = esNumero ? "Number" : "String";
  const estilo = header ? "header" : esNumero ? "number" : "text";
  return `<Cell ss:StyleID="${estilo}"><Data ss:Type="${tipo}">${xmlSeguro(esNumero ? valor : valor ?? "")}</Data></Cell>`;
}

async function copiarTablaVisible(id) {
  const table = document.getElementById(id);
  if (!table) return alert("No se encontro la tabla");

  const filas = Array.from(table.querySelectorAll("tr"))
    .filter(tr => tr.offsetParent !== null)
    .map(tr => Array.from(tr.children).map(cell => cell.innerText.trim()).join("\t"))
    .filter(Boolean);

  if (!filas.length) return alert("No hay filas visibles para copiar");

  const texto = filas.join("\n");
  try {
    await navigator.clipboard.writeText(texto);
  } catch (error) {
    const area = document.createElement("textarea");
    area.value = texto;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  alert("Tabla copiada al portapapeles");
}

function exportarTablaVisible(id, nombre) {
  const table = document.getElementById(id);
  if (!table) return alert("No se encontro la tabla");

  const clone = table.cloneNode(true);
  Array.from(clone.querySelectorAll("tr")).forEach((tr, index) => {
    const original = table.querySelectorAll("tr")[index];
    if (original && original.style.display === "none") tr.remove();
  });
  descargarExcel(nombre, clone.outerHTML);
}

function prepararHtmlExcel(html) {
  const css = `
    <meta charset="UTF-8">
    <style>
      .excel-text { mso-number-format:"\\@"; }
      td.excel-text { mso-number-format:"\\@"; }
    </style>
  `;

  return css + String(html || "").replace(/<td([^>]*)>([\s\S]*?)<\/td>/gi, (match, attrs, contenido) => {
    const texto = contenido
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim();

    const esCodigoLargo = /^[0-9]{10,}$/.test(texto);
    const esCientifico = /^[0-9]+(?:\.[0-9]+)?E\+[0-9]+$/i.test(texto);

    if (!esCodigoLargo && !esCientifico) return match;
    const attrsTexto = /style\s*=/.test(attrs)
      ? attrs.replace(/style\s*=\s*["']([^"']*)["']/i, `style="$1;mso-number-format:'\\@';"`)
      : `${attrs} style="mso-number-format:'\\@';"`;
    if (/class\s*=/.test(attrsTexto)) {
      return `<td${attrsTexto.replace(/class\s*=\s*["']([^"']*)["']/i, `class="$1 excel-text"`)}>${contenido}</td>`;
    }
    return `<td${attrsTexto} class="excel-text">${contenido}</td>`;
  });
}

function lpnsOperativos() {
  const key = firmaFilas(dataLPN, ["LPN", "ESTADO", "UBICACION", "CODIGO", "BULTOS"]);
  if (cacheLpnsOperativos.key === key) return cacheLpnsOperativos.data;
  cacheLpnsOperativos = { key, data: dataLPN.filter(r => ["UBICADO", "RECIBIDO"].includes(normalizar(r.ESTADO))) };
  return cacheLpnsOperativos.data;
}

function resumenLpn() {
  const base = lpnsOperativos();
  const stock = base.reduce((a, b) => a + num(b.BULTOS), 0);
  return {
    lpns: base.length,
    productos: new Set(base.map(r => normalizar(r.CODIGO)).filter(Boolean)).size,
    stock,
    paletero: base.filter(r => limpiar(r.UBICACION) === "").length,
    buffer: base.filter(r => limpiar(r.UBICACION).startsWith("DROP-BUFR")).length,
    mass: base.filter(r => limpiar(r.UBICACION).toUpperCase().startsWith("MASS-")).length
  };
}

function consolidarInventario() {
  const mapa = new Map();
  dataInventario.forEach(r => {
    const codigo = normalizar(r.PRODUCTO);
    const ubicacion = limpiar(r.UBICACION);
    if (!codigo || !ubicacion) return;
    const key = `${codigo}|${ubicacion}`;
    if (!mapa.has(key)) {
      mapa.set(key, {
        codigo,
        desc: r.DESCRIPCION || "",
        ubicacion,
        unact: 0,
        uniAsig: 0,
        transito: 0,
        uniMax: num(r.UNI_MAX),
        uniMin: num(r.UNI_MIN),
        uxb: num(r.UXB) || 1
      });
    }
    const item = mapa.get(key);
    item.unact += num(r.UNACT);
    item.uniAsig += num(r.UNI_ASIG);
    item.transito += num(r["En las Unidades de TrÃ¡nsito"]);
  });

  return Array.from(mapa.values()).map(r => {
    const actual = disponibilidadPorCapacidad(r.uniMax, r.unact, r.transito, r.uxb);
    const futuro = disponibilidadPorCapacidad(r.uniMax, Math.max(0, r.unact - r.uniAsig), r.transito, r.uxb);
    r.capacidadDinamica = actual.dinamica;
    r.disponible = actual.disponibleUnd;
    r.futuro = futuro.disponibleUnd;
    r.estado = r.disponible <= 0 ? "Saturado" : r.uniAsig > 0 ? "Libera" : r.unact === 0 ? "Vacio" : "Disponible";
    return r;
  }).sort((a, b) => ordenarUbicacion(a.ubicacion, b.ubicacion));
}

function inventarioComparable() {
  return consolidarInventario().filter(r => !esMassPasillo10(r.ubicacion));
}

function inventarioPasillo10() {
  return consolidarInventario().filter(r => esMassPasillo10(r.ubicacion) && r.unact > 0);
}

function estadoSemaforo(valor, amarillo, rojo, inverso = false) {
  if (inverso) {
    if (valor >= rojo) return "ok";
    if (valor >= amarillo) return "warn";
    return "danger";
  }
  if (valor >= rojo) return "danger";
  if (valor >= amarillo) return "warn";
  return "ok";
}

function semaforo(label, valor, nota, clase) {
  return `
    <article class="signal-card ${clase}">
      <span>${label}</span>
      <strong>${valor}</strong>
      <small>${nota}</small>
    </article>
  `;
}

function resumenOperaciones() {
  const lpn = resumenLpn();
  const antiguos = calcularLpnsAntiguos();
  const puntos = calcularPuntosControl().filter(r => r.zona !== "MASS");
  const inv = inventarioComparable();
  const saturadas = inv.filter(x => x.estado === "Saturado").length;
  const libera = inv.filter(x => x.estado === "Libera").length;
  const dinamicasLibres = dataUbicaciones.filter(x => tipoUbicacion(x) === "DINAMICA" && (!normalizar(x.PRODUCTO) || normalizar(x.PRODUCTO) === "-----------")).length;
  const dinamicasOcupadas = dataUbicaciones.filter(x => tipoUbicacion(x) === "DINAMICA" && normalizar(x.PRODUCTO) && normalizar(x.PRODUCTO) !== "-----------").length;
  const slotting = calcularSlotting();
  const bloqueados = codigosProductoBloqueados();
  const puntosCriticos = puntos.filter(x => x.antiguedad >= 7);
  const antiguosCriticos = antiguos.filter(x => x.antiguedad >= 7);
  const avanceAntiguos = pct(antiguos.filter(x => x.estado === "HECHO").length, antiguos.length);

  return {
    lpn,
    antiguos,
    antiguosCriticos,
    puntos,
    puntosCriticos,
    inv,
    saturadas,
    libera,
    dinamicasLibres,
    dinamicasOcupadas,
    slotting: slotting.resultado,
    pasillos: slotting.pasillos,
    bloqueados: bloqueados.size,
    avanceAntiguos
  };
}

function topProductosAntiguos(data) {
  const mapa = new Map();
  data.forEach(r => {
    if (!mapa.has(r.codigo)) mapa.set(r.codigo, { codigo: r.codigo, desc: r.desc, bultos: 0, lpns: 0, maxDias: 0 });
    const item = mapa.get(r.codigo);
    item.bultos += r.bultos;
    item.lpns += 1;
    item.maxDias = Math.max(item.maxDias, r.antiguedad);
  });
  return Array.from(mapa.values()).sort((a, b) => b.maxDias - a.maxDias || b.bultos - a.bultos).slice(0, 8);
}

function cargaPasillosOperativa(resumen) {
  const mapa = new Map();
  lpnsOperativos().forEach(r => {
    const ubi = limpiar(r.UBICACION);
    if (!ubi.toUpperCase().startsWith("MASS-")) return;
    const pasillo = limpiar(ubi.split("-")[1]).padStart(2, "0");
    if (!mapa.has(pasillo)) mapa.set(pasillo, { pasillo, lpns: 0, bultos: 0, dinamicas: 0, slotting: 0, antiguos: 0 });
    const item = mapa.get(pasillo);
    item.lpns += 1;
    item.bultos += num(r.BULTOS);
  });
  resumen.pasillos.forEach(p => {
    if (!mapa.has(p.pasillo)) mapa.set(p.pasillo, { pasillo: p.pasillo, lpns: 0, bultos: 0, dinamicas: 0, slotting: 0, antiguos: 0 });
    mapa.get(p.pasillo).dinamicas = p.libres;
  });
  resumen.slotting.forEach(s => {
    const pasillo = s.top1?.pasillo || "SIN";
    if (!mapa.has(pasillo)) mapa.set(pasillo, { pasillo, lpns: 0, bultos: 0, dinamicas: 0, slotting: 0, antiguos: 0 });
    mapa.get(pasillo).slotting += 1;
  });
  resumen.antiguosCriticos.forEach(a => {
    const ubi = limpiar(a.ubicacion);
    const pasillo = ubi.toUpperCase().startsWith("MASS-") ? limpiar(ubi.split("-")[1]).padStart(2, "0") : a.ubicacion;
    if (!mapa.has(pasillo)) mapa.set(pasillo, { pasillo, lpns: 0, bultos: 0, dinamicas: 0, slotting: 0, antiguos: 0 });
    mapa.get(pasillo).antiguos += 1;
  });
  return Array.from(mapa.values()).sort((a, b) => String(a.pasillo).localeCompare(String(b.pasillo))).slice(0, 16);
}

function codigoAltBloqueo(row) {
  return normalizar(row.COD_ALT || row.COD_ALTERNATIVO || row.CODIGO_ALT || row.ALTERNATIVO);
}

function codigosBloqueoDetallados() {
  const porAlt = new Map(dataProductos.map(p => [
    normalizar(p.CODIGO_ALT || p.COD_ALT || p.COD_ALTERNATIVO || p["CODIGO ALTERNATIVO"] || p["Cod Alternat"]),
    p
  ]));

  return dataBloqueo.map(b => {
    const alt = codigoAltBloqueo(b);
    const prod = porAlt.get(alt);
    return {
      alt,
      codigo: normalizar(prod?.CODIGO),
      desc: prod?.DESCRIPCION || limpiar(b.DESCRIPCION),
      encontrado: Boolean(prod)
    };
  });
}

function alertasGenerales() {
  const antiguosCriticos = calcularLpnsAntiguos().filter(r => r.antiguedad >= 7 && r.estado !== "HECHO");
  const puntosCriticos = calcularPuntosControl().filter(r => r.zona !== "MASS" && r.antiguedad >= 7);
  const bultosPuntosCriticos = puntosCriticos.reduce((a, b) => a + b.bultos, 0);
  const pasillo10Stock = inventarioPasillo10();
  const pasillo10 = reportePasillo10NoOperativo();
  const bloqueados = codigosProductoBloqueados();
  const bloqueadosActivo = inventarioComparable().filter(r => bloqueados.has(r.codigo) && r.unact > 0);
  const bloqueadosSeteados = ubicacionesSeteadasBloqueadas(bloqueados);
  const sinUbicacion = productosSinUbicacionActivo();
  const noEncontradosBloqueo = codigosBloqueoDetallados().filter(r => r.alt && !r.encontrado);
  const filas = [];

  (advertenciasCarga || []).forEach(msg => filas.push({
    prioridad: "ALTA",
    alerta: "Carga de datos",
    detalle: msg,
    cantidad: 1,
    accion: "Revisar Diagnostico",
    modulo: "Diagnostico",
    clase: "bad"
  }));

  if (bloqueadosActivo.length) filas.push({
    prioridad: "ALTA",
    alerta: "Bloqueados con stock activo",
    detalle: `${fmt(new Set(bloqueadosActivo.map(r => r.codigo)).size)} productos tienen stock en activo`,
    cantidad: bloqueadosActivo.reduce((a, b) => a + b.unact / (b.uxb || 1), 0),
    accion: "Revisar Bloqueo",
    modulo: "Bloqueo",
    clase: "bad"
  });

  if (bloqueadosSeteados.length) filas.push({
    prioridad: "ALTA",
    alerta: "Bloqueados seteados",
    detalle: "Productos bloqueados aun figuran seteados en ubicaciones activas",
    cantidad: bloqueadosSeteados.length,
    accion: "Descargar detalle en Bloqueo",
    modulo: "Bloqueo",
    clase: "bad"
  });

  if (pasillo10.length) filas.push({
    prioridad: "ALTA",
    alerta: "MASS-10 no operativo",
    detalle: `${fmt(pasillo10Stock.length)} ubicaciones con stock y/o ubicaciones seteadas`,
    cantidad: pasillo10.length,
    accion: "Exportar MASS-10",
    modulo: "Inventario/Bloqueo",
    clase: "bad"
  });

  if (antiguosCriticos.length) filas.push({
    prioridad: "MEDIA",
    alerta: "LPNs sin activo +7",
    detalle: "LPNs sin ubicacion activa con antiguedad critica",
    cantidad: antiguosCriticos.length,
    accion: "Atender LPNs sin activo",
    modulo: "LPNs sin activo",
    clase: "warn"
  });

  if (bultosPuntosCriticos) filas.push({
    prioridad: "MEDIA",
    alerta: "Puntos control +7",
    detalle: "Bultos en ubicaciones de control con antiguedad critica",
    cantidad: bultosPuntosCriticos,
    accion: "Revisar puntos control",
    modulo: "Puntos control",
    clase: "warn"
  });

  if (sinUbicacion.length) filas.push({
    prioridad: "MEDIA",
    alerta: "Productos sin activo",
    detalle: "Productos operativos sin ubicacion activa/permanente util",
    cantidad: sinUbicacion.length,
    accion: "Revisar Slotting",
    modulo: "Slotting",
    clase: "warn"
  });

  if (noEncontradosBloqueo.length) filas.push({
    prioridad: "MEDIA",
    alerta: "Bloqueo no encontrado",
    detalle: "Codigos alternativos bloqueados sin match en PRODUCTOS",
    cantidad: noEncontradosBloqueo.length,
    accion: "Corregir maestro PRODUCTOS",
    modulo: "Bloqueo",
    clase: "warn"
  });

  return filas;
}

function panelAlertasGenerales() {
  const data = alertasGenerales();
  return `
    <section class="card">
      <div class="section-head">
        <div>
          <h2>Alertas generales</h2>
          <span class="muted-note">${fmt(data.length)} alertas accionables detectadas</span>
        </div>
        <div class="filters">
          <button onclick="verDiagnostico()">Diagnostico</button>
          <button onclick="exportarTablaVisible('tablaAlertasGenerales', 'alertas_generales')">Excel</button>
        </div>
      </div>
      ${tablaConId("tablaAlertasGenerales", ["Prioridad", "Alerta", "Detalle", "Cantidad", "Accion", "Modulo"], data.map(r => `
        <tr class="${r.clase}">
          <td><strong>${htmlSeguro(r.prioridad)}</strong></td>
          <td>${htmlSeguro(r.alerta)}</td>
          <td>${htmlSeguro(r.detalle)}</td>
          <td class="number">${fmt(r.cantidad)}</td>
          <td>${htmlSeguro(r.accion)}</td>
          <td>${htmlSeguro(r.modulo)}</td>
        </tr>
      `), "Sin alertas criticas con la data actual.")}
    </section>
  `;
}

function barrasPasillo(data) {
  const max = Math.max(...data.map(x => Math.max(x.bultos, x.slotting, x.antiguos, x.dinamicas)), 1);
  return `
    <div class="aisle-map">
      ${data.map(p => `
        <div class="aisle-row">
          <strong>${p.pasillo}</strong>
          <span class="aisle-track stock" style="width:${pct(p.bultos, max)}%"></span>
          <span class="aisle-track slot" style="width:${pct(p.slotting, max)}%"></span>
          <span class="aisle-track old" style="width:${pct(p.antiguos, max)}%"></span>
          <small>${fmt(p.bultos)} bul | ${p.slotting} slot | ${p.antiguos} ant</small>
        </div>
      `).join("")}
    </div>
  `;
}

function verDashboard() {
  const r = resumenOperaciones();
  const topAntiguos = topProductosAntiguos(r.antiguosCriticos);
  const pasillos = cargaPasillosOperativa(r);
  const totalDinamicas = r.dinamicasLibres + r.dinamicasOcupadas;
  const ocupacionDinamica = pct(r.dinamicasOcupadas, totalDinamicas);

  document.getElementById("modulo").innerHTML = `
    ${(advertenciasCarga || []).length ? `
      <section class="notice danger">
        <strong>Revisar datos:</strong>
        ${(advertenciasCarga || []).map(msg => `<span>${htmlSeguro(msg)}</span>`).join("")}
      </section>
    ` : ""}
    <section class="hero-dashboard">
      <div>
        <span>ANC Logistica</span>
        <h2>Torre de control operativa</h2>
      </div>
      <button onclick="verGerencia()">Resumen gerencia</button>
    </section>

    <section class="signal-grid">
      ${semaforo("Paletero", fmt(r.lpn.paletero), "LPNs sin ubicacion", estadoSemaforo(r.lpn.paletero, 20, 60))}
      ${semaforo("Antiguos +7", fmt(r.antiguosCriticos.length), "LPNs con antiguedad critica", estadoSemaforo(r.antiguosCriticos.length, 15, 40))}
      ${semaforo("Puntos control", fmt(r.puntosCriticos.reduce((a, b) => a + b.bultos, 0)), "bultos +7 dias", estadoSemaforo(r.puntosCriticos.length, 10, 30))}
      ${semaforo("Slotting", fmt(r.slotting.length), "productos con sugerencia", estadoSemaforo(r.slotting.length, 5, 20))}
      ${semaforo("Dinamicas libres", fmt(r.dinamicasLibres), `${ocupacionDinamica.toFixed(1)}% ocupadas`, estadoSemaforo(r.dinamicasLibres, 10, 25, true))}
      ${semaforo("Bloqueo", fmt(r.bloqueados), "productos bloqueados", estadoSemaforo(r.bloqueados, 5, 15))}
    </section>

    <section class="quick-actions">
      <button onclick="verDiagnostico()">Diagnostico data</button>
      <button onclick="verLpnsSinActivo()">Ver LPNs sin activo +7</button>
      <button onclick="verPuntosControl()">Ver puntos control</button>
      <button onclick="verBloqueo()">Ver bloqueo</button>
      <button onclick="verSlotting()">Ver slotting</button>
      <button onclick="verInventario()">Ver inventario</button>
    </section>

    ${panelAlertasGenerales()}

    <section class="dashboard-layout">
      <div class="card">
        <h2>Mapa por pasillo</h2>
        <div class="legend">
          <span><b class="dot green"></b>Stock</span>
          <span><b class="dot blue"></b>Slotting</span>
          <span><b class="dot red"></b>Antiguos</span>
        </div>
        ${barrasPasillo(pasillos)}
      </div>
      <div class="card">
        <h2>Flujo de atencion</h2>
        ${barra("Avance antiguos", r.antiguos.filter(x => x.estado === "HECHO").length, r.antiguos.length)}
        ${barra("Dinamicas libres", r.dinamicasLibres, totalDinamicas)}
        ${barra("Slotting usable", r.slotting.filter(x => x.accionSlotting === "USAR LIBRE").length, r.slotting.length)}
        ${barra("Inventario saturado", r.saturadas, r.inv.length)}
      </div>
    </section>

    <section class="dashboard-layout">
      <div class="card">
        <h2>Top productos antiguos</h2>
        ${tabla(["Codigo", "Descripcion", "LPNs", "Bultos", "Max dias"], topAntiguos.map(p => `
          <tr class="${p.maxDias >= 10 ? "bad" : "warn"}">
            <td><strong>${p.codigo}</strong></td>
            <td>${p.desc}</td>
            <td>${fmt(p.lpns)}</td>
            <td class="number">${fmt(p.bultos)}</td>
            <td>${fmt(p.maxDias)}</td>
          </tr>
        `))}
      </div>
      <div class="card">
        <h2>Acciones recomendadas</h2>
        <div class="action-list">
          <div><strong>1</strong><span>Atacar primero ${fmt(r.antiguosCriticos.length)} LPNs sin activo +7.</span></div>
          <div><strong>2</strong><span>Usar ${fmt(r.dinamicasLibres)} dinamicas libres para slotting.</span></div>
          <div><strong>3</strong><span>Revisar ${fmt(r.saturadas)} ubicaciones saturadas y ${fmt(r.libera)} con liberacion.</span></div>
          <div><strong>4</strong><span>Separar bloqueo: ${fmt(r.bloqueados)} productos no aptos.</span></div>
        </div>
      </div>
    </section>
  `;
}

function verGerencia() {
  const r = resumenOperaciones();
  const pasillos = cargaPasillosOperativa(r).slice(0, 10);
  const topAntiguos = topProductosAntiguos(r.antiguosCriticos).slice(0, 5);
  document.getElementById("modulo").innerHTML = `
    <section class="executive-view" id="gerenciaView">
      <div class="section-head">
        <div>
          <h2>Resumen gerencia</h2>
        </div>
        <button onclick="exportarImagen('gerenciaView', 'resumen-gerencia')">Imagen</button>
      </div>
      <section class="signal-grid executive">
        ${semaforo("LPNs operativos", fmt(r.lpn.lpns), `${fmt(r.lpn.stock)} bultos`, "ok")}
        ${semaforo("Antiguos +7", fmt(r.antiguosCriticos.length), "requieren accion", estadoSemaforo(r.antiguosCriticos.length, 15, 40))}
        ${semaforo("Puntos control", fmt(r.puntosCriticos.reduce((a, b) => a + b.bultos, 0)), "bultos criticos", estadoSemaforo(r.puntosCriticos.length, 10, 30))}
        ${semaforo("Slotting", fmt(r.slotting.length), "productos sugeridos", estadoSemaforo(r.slotting.length, 5, 20))}
      </section>
      <section class="dashboard-layout">
        <div class="card">
          <h2>Pasillos con carga</h2>
          ${barrasPasillo(pasillos)}
        </div>
        <div class="card">
          <h2>Productos mas antiguos</h2>
          ${tabla(["Codigo", "LPNs", "Bultos", "Dias"], topAntiguos.map(p => `
            <tr>
              <td><strong>${p.codigo}</strong></td>
              <td>${fmt(p.lpns)}</td>
              <td class="number">${fmt(p.bultos)}</td>
              <td>${fmt(p.maxDias)}</td>
            </tr>
          `))}
        </div>
      </section>
    </section>
  `;
}

function columnasData(data) {
  return Array.from(new Set((data || []).flatMap(r => Object.keys(r || {})))).sort();
}

function contarDuplicados(valores) {
  const vistos = new Set();
  const duplicados = new Set();
  valores.filter(Boolean).forEach(v => {
    if (vistos.has(v)) duplicados.add(v);
    vistos.add(v);
  });
  return duplicados.size;
}

function filasDiagnosticoData() {
  const bloqueadosDet = codigosBloqueoDetallados();
  const problemas = [];
  const agregar = (origen, tipo, detalle, cantidad, severidad = "MEDIA") => {
    if (!cantidad) return;
    problemas.push({ origen, tipo, detalle, cantidad, severidad, clase: severidad === "ALTA" ? "bad" : "warn" });
  };

  (advertenciasCarga || []).forEach(msg => agregar("Carga", "Columnas/hojas", msg, 1, "ALTA"));
  agregar("LPNS", "LPN vacio", "Filas sin LPN", dataLPN.filter(r => !limpiar(r.LPN)).length, "ALTA");
  agregar("LPNS", "Codigo vacio", "Filas sin CODIGO", dataLPN.filter(r => !normalizar(r.CODIGO)).length, "ALTA");
  agregar("LPNS", "Ubicacion vacia", "LPNs operativos en paletero o sin ubicacion", lpnsOperativos().filter(r => !limpiar(r.UBICACION)).length, "MEDIA");
  agregar("LPNS", "Bultos invalidos", "Filas con BULTOS menor o igual a cero", dataLPN.filter(r => num(r.BULTOS) <= 0).length, "MEDIA");
  agregar("PRODUCTOS", "Codigo duplicado", "Codigos repetidos en maestro de productos", contarDuplicados(dataProductos.map(r => normalizar(r.CODIGO))), "MEDIA");
  agregar("PRODUCTOS", "Codigo vacio", "Filas sin CODIGO", dataProductos.filter(r => !normalizar(r.CODIGO)).length, "ALTA");
  agregar("PEDIDO", "Producto vacio", "Filas sin PRODUCTO", dataPedido.filter(r => !normalizar(r.PRODUCTO)).length, "MEDIA");
  agregar("INV_ACTIVO", "Codigo vacio", "Filas sin PRODUCTO", dataInventario.filter(r => !normalizar(r.PRODUCTO)).length, "ALTA");
  agregar("INV_ACTIVO", "Ubicacion vacia", "Filas sin UBICACION", dataInventario.filter(r => !limpiar(r.UBICACION)).length, "ALTA");
  agregar("INV_ACTIVO", "Stock MASS-10", "Stock ubicado en pasillo no operativo MASS-10", inventarioPasillo10().length, "ALTA");
  agregar("UBICACION", "MASS-10 seteado", "Ubicaciones seteadas o con producto en pasillo no operativo", reportePasillo10NoOperativo().filter(r => r.origen === "MAESTRO UBICACIONES").length, "ALTA");
  agregar("BLOQUEO", "Alternativo no encontrado", "Codigos alternativos de bloqueo sin match en PRODUCTOS", bloqueadosDet.filter(r => r.alt && !r.encontrado).length, "MEDIA");
  agregar("BLOQUEO", "Alternativo vacio", "Filas de bloqueo sin codigo alternativo", bloqueadosDet.filter(r => !r.alt).length, "ALTA");

  return problemas;
}

function verDiagnostico() {
  const hojas = [
    { nombre: "LPNS", data: dataLPN, clave: "LPN" },
    { nombre: "PRODUCTOS", data: dataProductos, clave: "CODIGO" },
    { nombre: "PEDIDO", data: dataPedido, clave: "PRODUCTO" },
    { nombre: "INV_ACTIVO", data: dataInventario, clave: "PRODUCTO" },
    { nombre: "UBICACION", data: dataUbicaciones, clave: "MASCARA" },
    { nombre: "BLOQUEO", data: dataBloqueo, clave: "COD_ALT" }
  ];
  const problemas = filasDiagnosticoData();
  const totalFilas = hojas.reduce((a, b) => a + b.data.length, 0);
  const altas = problemas.filter(p => p.severidad === "ALTA").length;

  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <div>
        <h2>Diagnostico de data</h2>
      </div>
      <div class="filters">
        <button onclick="exportarTablaVisible('tablaDiagnosticoProblemas', 'diagnostico_problemas')">Excel problemas</button>
      </div>
    </div>
    <section class="kpi-grid compact">
      ${kpi("Filas totales", fmt(totalFilas))}
      ${kpi("Hojas", fmt(hojas.length))}
      ${kpi("Problemas", fmt(problemas.length), "", problemas.length ? "warn" : "")}
      ${kpi("Criticos", fmt(altas), "", altas ? "danger" : "")}
      ${kpi("Advertencias carga", fmt((advertenciasCarga || []).length), "", (advertenciasCarga || []).length ? "danger" : "")}
    </section>
    <section class="dashboard-layout">
      <div class="card">
        <div class="section-head">
          <h2>Hojas cargadas</h2>
          <button onclick="exportarTablaVisible('tablaDiagnosticoHojas', 'diagnostico_hojas')">Excel</button>
        </div>
        ${tablaConId("tablaDiagnosticoHojas", ["Hoja", "Filas", "Columnas", "Columna clave", "Vacios clave"], hojas.map(h => {
          const cols = columnasData(h.data);
          const vacios = h.data.filter(r => !limpiar(r[h.clave])).length;
          return `
            <tr class="${!h.data.length || vacios ? "warn" : ""}">
              <td><strong>${htmlSeguro(h.nombre)}</strong></td>
              <td>${fmt(h.data.length)}</td>
              <td>${fmt(cols.length)}</td>
              <td>${htmlSeguro(h.clave)}</td>
              <td>${fmt(vacios)}</td>
            </tr>
          `;
        }))}
      </div>
      <div class="card">
        <div class="section-head">
          <h2>Problemas detectados</h2>
          <button onclick="copiarTablaVisible('tablaDiagnosticoProblemas')">Copiar</button>
        </div>
        ${tablaConId("tablaDiagnosticoProblemas", ["Severidad", "Origen", "Tipo", "Detalle", "Cantidad"], problemas.map(p => `
          <tr class="${p.clase}">
            <td><strong>${htmlSeguro(p.severidad)}</strong></td>
            <td>${htmlSeguro(p.origen)}</td>
            <td>${htmlSeguro(p.tipo)}</td>
            <td>${htmlSeguro(p.detalle)}</td>
            <td class="number">${fmt(p.cantidad)}</td>
          </tr>
        `), "No se detectaron problemas relevantes.")}
      </div>
    </section>
  `;
}

function codigoBusqueda(valor) {
  const limpio = normalizar(valor);
  const sinCeros = limpio.replace(/^0+/, "");
  return sinCeros || limpio;
}

function codigosProducto(row) {
  return [
    campo(row, ["CODIGO", "PRODUCTO"]),
    campo(row, ["CODIGO_ALT", "COD_ALT", "CODIGO ALTERNATIVO", "Cod Alternat"])
  ].map(limpiar).filter(Boolean);
}

function parseCodigosPegados(texto) {
  return Array.from(new Set(limpiar(texto)
    .split(/[\s,;]+/)
    .map(codigoBusqueda)
    .filter(Boolean)));
}

function maestroProductoPorCodigo() {
  const mapa = new Map();
  dataProductos.forEach(p => {
    codigosProducto(p).forEach(cod => {
      const key = codigoBusqueda(cod);
      if (key && !mapa.has(key)) mapa.set(key, p);
    });
  });
  return mapa;
}

function clavesProducto(row) {
  return [
    campo(row, ["PRODUCTO", "CODIGO"]),
    campo(row, ["CODIGO", "PRODUCTO"]),
    campo(row, ["COD_ALT", "CODIGO_ALT", "COD ALTERNATIVO", "CODIGO ALTERNATIVO", "Cod Alternat"])
  ].map(codigoBusqueda).filter(Boolean);
}

function productoCoincide(row, buscados, campos) {
  return campos.some(nombre => buscados.has(codigoBusqueda(campo(row, nombre))));
}

function uxbProducto(row, maestro) {
  return num(campo(row, ["UXB", "Uxb", "UNIDADES X BULTO"])) || num(campo(maestro || {}, ["UXB", "Uxb", "UNIDADES X BULTO"]));
}

function bultosDesdeUnidades(unidades, uxb) {
  return uxb > 0 ? fmt(unidades / uxb) : "Sin UXB";
}

function observacionStock(actual, asignado, disponible, parcialTexto = "Pendiente por asignar") {
  if (actual - asignado < 0) return "Revisar data negativa";
  if (asignado === 0) return "Disponible total";
  if (disponible === 0) return "Totalmente asignado";
  if (disponible > 0 && asignado > 0) return parcialTexto;
  return "Revisar";
}

function claseObservacion(texto) {
  const t = normalizar(texto);
  if (t.includes("TOTALMENTE") || t.includes("NEGATIVA") || t.includes("SIN UXB")) return "bad";
  if (t.includes("PENDIENTE") || t.includes("PARCIAL")) return "warn";
  return "";
}

function grupoUbicacionLpn(ubicacion) {
  const ubi = normalizar(ubicacion);
  if (!ubi) return "UBICACION EN BLANCO";
  if (ubi.startsWith("MASS-")) return "MASS";
  if (ubi.startsWith("DROP-BUFR")) return "DROP-BUFR";
  if (ubi.startsWith("DROP-STOCK-DESBLOQ-962")) return "DROP-STOCK-DESBLOQ-962";
  if (ubi.startsWith("RAMPA-")) return "RAMPA";
  return "Otras ubicaciones";
}

function normalizarActivo(row, maestro) {
  const codigo = limpiar(campo(row, ["PRODUCTO", "CODIGO"]));
  const codigoAlt = limpiar(campo(row, ["COD_ALT", "CODIGO_ALT", "COD ALTERNATIVO"]));
  const descripcion = limpiar(campo(row, ["DESCRIPCION", "Descripcion"])) || limpiar(campo(maestro || {}, ["DESCRIPCION", "Descripcion"]));
  const unact = num(campo(row, ["UNACT", "UnAct", "UN ACT"]));
  const uniAsig = num(campo(row, ["UNI_ASIG", "UNI ASIG", "Un Asig", "UN ASIG"]));
  const disponibleRaw = unact - uniAsig;
  const disponible = Math.max(0, disponibleRaw);
  const uxb = uxbProducto(row, maestro);
  const observacion = uxb > 0
    ? observacionStock(unact, uniAsig, disponible, "Pendiente por asignar")
    : "Sin UXB";
  return {
    codigo,
    codigoAlt,
    descripcion,
    ubicacion: limpiar(campo(row, ["UBICACION", "Ubicacion"])),
    tipoUbicacion: limpiar(campo(row, ["TIPO_UBICACION", "TIPO UBICACION", "Tipo ubicacion"])),
    unact,
    uniAsig,
    disponible,
    uxb,
    bultos: bultosDesdeUnidades(disponible, uxb),
    observacion
  };
}

function normalizarLpnBusqueda(row, maestro) {
  const codigo = limpiar(campo(row, ["CODIGO", "PRODUCTO"]));
  const codigoAlt = limpiar(campo(row, ["COD_ALT", "CODIGO_ALT", "COD ALTERNATIVO"]));
  const descripcion = limpiar(campo(row, ["DESCRIPCION", "Descripcion"])) || limpiar(campo(maestro || {}, ["DESCRIPCION", "Descripcion"]));
  const unact = num(campo(row, ["UnAct", "UNACT", "UN ACT", "BULTOS"]));
  const unAsig = num(campo(row, ["Un Asig", "UN ASIG", "UN_ASIG", "UNI_ASIG"]));
  const disponibleRaw = unact - unAsig;
  const disponible = Math.max(0, disponibleRaw);
  const uxb = uxbProducto(row, maestro);
  const observacion = uxb > 0
    ? observacionStock(unact, unAsig, disponible, "Asignacion parcial")
    : "Sin UXB";
  const ubicacion = limpiar(campo(row, ["UBICACION", "Ubicacion"]));
  return {
    codigo,
    codigoAlt,
    descripcion,
    lpn: limpiar(campo(row, ["LPN", "NRO LPN", "NRO_LPN"])),
    estado: limpiar(campo(row, ["ESTADO", "Estado"])),
    ubicacion,
    grupo: grupoUbicacionLpn(ubicacion),
    unact,
    unAsig,
    disponible,
    uxb,
    bultos: bultosDesdeUnidades(disponible, uxb),
    observacion
  };
}

function datosBusquedaProducto(codigos) {
  const maestro = maestroProductoPorCodigo();
  const encontrados = new Set();
  const productoPorKey = new Map();
  const buscadosExpandidos = new Set(codigos);

  codigos.forEach(key => {
    const prod = maestro.get(key);
    if (prod) {
      encontrados.add(key);
      codigosProducto(prod).forEach(c => {
        const productoKey = codigoBusqueda(c);
        if (productoKey) {
          buscadosExpandidos.add(productoKey);
          productoPorKey.set(productoKey, prod);
        }
      });
    }
  });

  const invRows = dataInventario.filter(r => productoCoincide(r, buscadosExpandidos, [["PRODUCTO", "CODIGO"], ["COD_ALT", "CODIGO_ALT", "COD ALTERNATIVO", "CODIGO ALTERNATIVO", "Cod Alternat"]]));
  const lpnRows = dataLPN.filter(r => productoCoincide(r, buscadosExpandidos, [["CODIGO", "PRODUCTO"], ["COD_ALT", "CODIGO_ALT", "COD ALTERNATIVO", "CODIGO ALTERNATIVO", "Cod Alternat"]]));

  invRows.forEach(r => {
    clavesProducto(r).forEach(key => {
      if (buscadosExpandidos.has(key)) {
        codigos.forEach(original => {
          if (original === key || codigosProducto(maestro.get(original) || {}).map(codigoBusqueda).includes(key)) encontrados.add(original);
        });
      }
    });
  });
  lpnRows.forEach(r => {
    clavesProducto(r).forEach(key => {
      if (buscadosExpandidos.has(key)) {
        codigos.forEach(original => {
          if (original === key || codigosProducto(maestro.get(original) || {}).map(codigoBusqueda).includes(key)) encontrados.add(original);
        });
      }
    });
  });

  const maestroPara = row => {
    const keys = clavesProducto(row);
    return keys.map(k => maestro.get(k) || productoPorKey.get(k)).find(Boolean) || {};
  };

  const activo = invRows.map(r => normalizarActivo(r, maestroPara(r)));
  const lpns = lpnRows.map(r => normalizarLpnBusqueda(r, maestroPara(r)));
  const pendienteActivo = activo.filter(r => r.uniAsig > 0 && r.disponible > 0);
  const reservaMass = lpns.filter(r => normalizar(r.estado) === "UBICADO" && r.grupo === "MASS" && r.disponible > 0)
    .sort((a, b) => ordenarUbicacion(a.ubicacion, b.ubicacion) || a.descripcion.localeCompare(b.descripcion));
  const especiales = lpns.filter(r => ["DROP-BUFR", "DROP-STOCK-DESBLOQ-962", "UBICACION EN BLANCO", "RAMPA"].includes(r.grupo) && r.disponible > 0);
  const pendienteLpn = lpns.filter(r => r.unAsig > 0 && r.disponible > 0);
  const noEncontrados = codigos.filter(c => !encontrados.has(c));

  const resumen = new Map();
  const asegurar = item => {
    const codigo = item.codigo || item.codigoAlt || "SIN CODIGO";
    if (!resumen.has(codigo)) {
      resumen.set(codigo, {
        codigo,
        codigoAlt: item.codigoAlt,
        descripcion: item.descripcion,
        uxb: item.uxb,
        activo: 0,
        reserva: 0,
        especiales: 0
      });
    }
    const r = resumen.get(codigo);
    if (!r.codigoAlt && item.codigoAlt) r.codigoAlt = item.codigoAlt;
    if (!r.descripcion && item.descripcion) r.descripcion = item.descripcion;
    if (!r.uxb && item.uxb) r.uxb = item.uxb;
    return r;
  };

  activo.forEach(item => asegurar(item).activo += item.disponible);
  reservaMass.forEach(item => asegurar(item).reserva += item.disponible);
  especiales.forEach(item => asegurar(item).especiales += item.disponible);

  return { resumen: Array.from(resumen.values()), activo, pendienteActivo, reservaMass, especiales, pendienteLpn, noEncontrados };
}

function tablaBusquedaProductoActivos(data, id = "", incluirAccion = false) {
  const headers = ["Codigo", "Codigo alt", "Descripcion", "Ubicacion", "Tipo ubicacion", "UNACT", "UNI_ASIG", "Disponible", "UXB", "Bultos", "Observacion"];
  if (incluirAccion) headers.push("Accion sugerida");
  return tablaConId(id, headers, data.map(r => `
    <tr class="${claseObservacion(r.observacion)}">
      <td><strong>${htmlSeguro(r.codigo)}</strong></td><td>${htmlSeguro(r.codigoAlt)}</td><td>${htmlSeguro(r.descripcion)}</td><td>${htmlSeguro(r.ubicacion)}</td><td>${htmlSeguro(r.tipoUbicacion)}</td>
      <td>${fmt(r.unact)}</td><td>${fmt(r.uniAsig)}</td><td class="number">${fmt(r.disponible)}</td><td>${r.uxb ? fmt(r.uxb) : "Sin UXB"}</td><td>${htmlSeguro(r.bultos)}</td><td><strong>${htmlSeguro(r.observacion)}</strong></td>
      ${incluirAccion ? "<td><strong>Solicitar asignacion del saldo</strong></td>" : ""}
    </tr>
  `));
}

function tablaBusquedaProductoLpns(data, id = "", incluirGrupo = false, pendiente = false) {
  const headers = incluirGrupo
    ? ["Codigo", "Codigo alt", "Descripcion", "LPN", "Estado", "Ubicacion", "Grupo", "UnAct", "Un Asig", pendiente ? "Pendiente" : "Disponible", "UXB", "Bultos", "Observacion"]
    : ["Codigo", "Codigo alt", "Descripcion", "LPN", "Estado", "Ubicacion", "UnAct", "Un Asig", pendiente ? "Pendiente" : "Disponible", "UXB", "Bultos", "Observacion"];
  return tablaConId(id, headers, data.map(r => `
    <tr class="${claseObservacion(r.observacion)}">
      <td><strong>${htmlSeguro(r.codigo)}</strong></td><td>${htmlSeguro(r.codigoAlt)}</td><td>${htmlSeguro(r.descripcion)}</td><td>${htmlSeguro(r.lpn)}</td><td>${htmlSeguro(r.estado)}</td><td>${htmlSeguro(r.ubicacion)}</td>
      ${incluirGrupo ? `<td><strong>${htmlSeguro(r.grupo)}</strong></td>` : ""}
      <td>${fmt(r.unact)}</td><td>${fmt(r.unAsig)}</td><td class="number">${fmt(r.disponible)}</td><td>${r.uxb ? fmt(r.uxb) : "Sin UXB"}</td><td>${htmlSeguro(r.bultos)}</td><td><strong>${htmlSeguro(r.observacion)}</strong></td>
    </tr>
  `));
}

function verBusquedaProducto() {
  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <div>
        <h2>Busqueda operativa de productos</h2>
      </div>
      <div class="filters">
        <button onclick="renderBusquedaProducto()">Buscar productos</button>
      </div>
    </div>
    <section class="card product-search-panel">
      <textarea id="codigosBusquedaProducto" class="product-search-input" placeholder="00020472175&#10;7750243079815&#10;00020568780"></textarea>
    </section>
    <div id="resultadoBusquedaProducto"></div>
  `;
}

function renderBusquedaProducto() {
  const codigos = parseCodigosPegados(document.getElementById("codigosBusquedaProducto")?.value || "");
  const destino = document.getElementById("resultadoBusquedaProducto");
  if (!destino) return;
  if (!codigos.length) {
    destino.innerHTML = `<div class="notice">Pega al menos un codigo para buscar.</div>`;
    return;
  }

  const datos = datosBusquedaProducto(codigos);
  destino.innerHTML = `
    <section class="kpi-grid compact">
      ${kpi("Codigos buscados", fmt(codigos.length))}
      ${kpi("Resumen", fmt(datos.resumen.length))}
      ${kpi("Activo", fmt(datos.activo.length))}
      ${kpi("Reserva Mass", fmt(datos.reservaMass.length))}
      ${kpi("Especiales", fmt(datos.especiales.length))}
      ${kpi("No encontrados", fmt(datos.noEncontrados.length), "", datos.noEncontrados.length ? "danger" : "")}
    </section>
    <section class="card subcard">
      <div class="section-head"><h2>Resumen por producto</h2><button onclick="exportarTablaVisible('tablaResumenProductoOperativo', 'resumen_producto_operativo')">Excel</button></div>
      ${tablaConId("tablaResumenProductoOperativo", ["Codigo", "Codigo alt", "Descripcion", "UXB", "UND activo", "Bultos activo", "UND reserva Mass", "Bultos reserva", "UND especiales", "Bultos especiales", "Total UND", "Total bultos"], datos.resumen.map(r => {
        const total = r.activo + r.reserva + r.especiales;
        return `<tr><td><strong>${htmlSeguro(r.codigo)}</strong></td><td>${htmlSeguro(r.codigoAlt)}</td><td>${htmlSeguro(r.descripcion)}</td><td>${r.uxb ? fmt(r.uxb) : "Sin UXB"}</td><td>${fmt(r.activo)}</td><td>${bultosDesdeUnidades(r.activo, r.uxb)}</td><td>${fmt(r.reserva)}</td><td>${bultosDesdeUnidades(r.reserva, r.uxb)}</td><td>${fmt(r.especiales)}</td><td>${bultosDesdeUnidades(r.especiales, r.uxb)}</td><td class="number">${fmt(total)}</td><td>${bultosDesdeUnidades(total, r.uxb)}</td></tr>`;
      }))}
    </section>
    <section class="card subcard"><div class="section-head"><h2>Inventario activo</h2><button onclick="exportarTablaVisible('tablaProductoActivo', 'inventario_activo_producto')">Excel</button></div>${tablaBusquedaProductoActivos(datos.activo, "tablaProductoActivo")}</section>
    <section class="card subcard"><div class="section-head"><h2>Pendiente por asignar en activo</h2><button onclick="exportarTablaVisible('tablaPendienteActivo', 'pendiente_activo_producto')">Excel</button></div>${tablaBusquedaProductoActivos(datos.pendienteActivo, "tablaPendienteActivo", true)}</section>
    <section class="card subcard"><div class="section-head"><h2>Reserva MASS</h2><button onclick="exportarTablaVisible('tablaReservaMassProducto', 'reserva_mass_producto')">Excel</button></div>${tablaBusquedaProductoLpns(datos.reservaMass, "tablaReservaMassProducto")}</section>
    <section class="card subcard"><div class="section-head"><h2>DROP-BUFR / DROP-STOCK-DESBLOQ-962 / BLANCO / RAMPA</h2><button onclick="exportarTablaVisible('tablaEspecialProducto', 'especiales_producto')">Excel</button></div>${tablaBusquedaProductoLpns(datos.especiales, "tablaEspecialProducto", true)}</section>
    <section class="card subcard"><div class="section-head"><h2>Pendiente parcial en LPNs</h2><span class="muted-note">LPN con asignacion parcial y saldo disponible.</span></div>${tablaBusquedaProductoLpns(datos.pendienteLpn, "tablaPendienteLpnProducto", false, true)}</section>
    <section class="card subcard"><div class="section-head"><h2>No encontrados</h2></div>${tablaConId("tablaNoEncontradosProducto", ["Codigo buscado", "Observacion"], datos.noEncontrados.map(c => `<tr class="bad"><td><strong>${htmlSeguro(c)}</strong></td><td>No encontrado</td></tr>`), "Todos los codigos fueron encontrados.")}</section>
  `;
}

function codigosBaseShipTo() {
  const mapa = new Map();
  (dataRecepcionPaleterosCodigo || []).forEach(row => {
    const codigo = codigoBusqueda(campoRecepcion(row, ["CODIGO", "Codigo", "Producto", "PRODUCTO"]));
    const codigoAlt = codigoBusqueda(campoRecepcion(row, ["CODIGO_ALT", "COD_ALT", "CODIGO ALTERNATIVO", "Codigo Alternativo", "Cod Alternat", "Artic Padre"]));
    const clave = codigo || codigoAlt;
    if (!clave || mapa.has(clave)) return;
    mapa.set(clave, {
      codigo,
      codigoAlt,
      descripcion: descripcionRecepcion(row) || limpiar(campoRecepcion(row, ["Descripcion", "DESCRIPCION", "Descrip Artic"]))
    });
  });
  return Array.from(mapa.values());
}

function codigosBusquedaShipTo() {
  const base = codigosBaseShipTo();
  const pegados = parseCodigosPegados(document.getElementById("codigosExtraShipTo")?.value || "");
  const mapa = new Map(base.map(row => [row.codigo || row.codigoAlt, row]));
  pegados.forEach(codigo => {
    if (!mapa.has(codigo)) mapa.set(codigo, { codigo, codigoAlt: "", descripcion: "" });
  });
  return Array.from(mapa.values());
}

function indicesProductoMaestroCompletos() {
  const mapa = maestroProductoPorCodigo();
  dataProductos.forEach(prod => {
    codigosProducto(prod).forEach(cod => {
      const key = codigoBusqueda(cod);
      if (key && !mapa.has(key)) mapa.set(key, prod);
    });
  });
  return mapa;
}

function expandirCodigosShipTo(base) {
  const maestro = indicesProductoMaestroCompletos();
  const keys = new Set();
  const porKeyBase = new Map();
  base.forEach(item => {
    const codigos = [item.codigo, item.codigoAlt].map(codigoBusqueda).filter(Boolean);
    const prod = codigos.map(c => maestro.get(c)).find(Boolean);
    const expandidos = new Set(codigos);
    if (prod) codigosProducto(prod).map(codigoBusqueda).filter(Boolean).forEach(c => expandidos.add(c));
    expandidos.forEach(key => {
      keys.add(key);
      if (!porKeyBase.has(key)) porKeyBase.set(key, item);
    });
  });
  return { keys, porKeyBase, maestro };
}

function productoCoincideShipTo(row, keys, gruposCampos) {
  return gruposCampos.some(nombres => keys.has(codigoBusqueda(campo(row, nombres))));
}

function pedidoShipToPorProducto(keys, porKeyBase, maestro) {
  const mapa = new Map();
  (dataPedido || []).forEach(row => {
    if (!productoCoincideShipTo(row, keys, [["PRODUCTO", "Producto", "CODIGO", "Codigo"], ["COD_ALT", "CODIGO_ALT", "COD ALTERNATIVO", "CODIGO ALTERNATIVO", "Cod Alternat"]])) return;
    const key = clavesProducto(row).find(k => keys.has(k)) || codigoBusqueda(campo(row, ["PRODUCTO", "Producto", "CODIGO", "Codigo"]));
    const base = porKeyBase.get(key) || {};
    const prod = maestro.get(key) || productoPorCodigo(key) || {};
    const codigo = normalizar(campo(row, ["PRODUCTO", "Producto", "CODIGO", "Codigo"])) || normalizar(base.codigo) || normalizar(campo(prod, ["CODIGO", "PRODUCTO"]));
    const codigoAlt = limpiar(campo(row, ["COD_ALT", "CODIGO_ALT", "COD ALTERNATIVO", "CODIGO ALTERNATIVO", "Cod Alternat"])) || limpiar(base.codigoAlt) || codigoAlternativoProducto(codigo, row);
    const descripcion = limpiar(campo(row, ["DESCRIPCION", "Descripcion", "Descripcion Producto"])) || limpiar(base.descripcion) || descripcionProducto(codigo, row);
    const uxb = uxbProducto(row, prod) || 1;
    const unidades = num(campo(row, ["UNIDADES", "Unidades", "UN_PEDIDO", "UN PEDIDO", "UN SOLICITADAS", "Un Solicitadas", "CANTIDAD", "Cantidad"]));
    const bultosAsignable = num(campo(row, ["BULTOS_ASIGNABLE", "BULTOS_ASIGNABLES", "BULTO_ASIGNABLE", "ASIGNABLE", "BULTOS ASIGNABLE", "BULTOS ASIGNABLES"]));
    const bultosNoAsignado = num(campo(row, ["BULTOS_NO_ASIGNADO", "BULTOS_NO_ASIGNADOS", "BULTO_NO_ASIGNADO", "BULTO_NO_ASIGANDO", "BULTOS_NO_ASIGANDO", "NO_ASIGNADO", "NO ASIGNADO"]));
    const bultos = bultosAsignable + bultosNoAsignado || (uxb ? unidades / uxb : unidades);
    const item = {
      origen: "PEDIDO",
      resumenCodigo: normalizar(base.codigo) || normalizar(base.codigoAlt) || codigo || key,
      codigo,
      codigoAlt,
      descripcion,
      unidades,
      bultos,
      bultosAsignable,
      bultosNoAsignado,
      ubicacion: limpiar(campo(row, ["UBICACION", "Ubicacion", "DESTINO", "Destino"])),
      estadoLpn: "",
      lpn: "",
      observacion: bultosNoAsignado > 0 ? "NO ASIGNADO: separar si o si" : bultosAsignable > 0 ? "ASIGNABLE" : "PEDIDO"
    };
    const resumenKey = codigo || codigoAlt || key;
    if (!mapa.has(resumenKey)) mapa.set(resumenKey, []);
    mapa.get(resumenKey).push(item);
  });
  return Array.from(mapa.values()).flat();
}

function filasInventarioShipTo(keys, porKeyBase, maestro) {
  return (dataInventario || [])
    .filter(row => productoCoincideShipTo(row, keys, [["PRODUCTO", "Producto", "CODIGO", "Codigo"], ["COD_ALT", "CODIGO_ALT", "COD ALTERNATIVO", "CODIGO ALTERNATIVO", "Cod Alternat"]]))
    .map(row => {
      const key = clavesProducto(row).find(k => keys.has(k)) || codigoBusqueda(campo(row, ["PRODUCTO", "Codigo", "CODIGO"]));
      const base = porKeyBase.get(key) || {};
      const prod = maestro.get(key) || {};
      const codigo = normalizar(campo(row, ["PRODUCTO", "Producto", "CODIGO", "Codigo"])) || normalizar(base.codigo) || normalizar(campo(prod, ["CODIGO", "PRODUCTO"]));
      const uxb = uxbProducto(row, prod) || 1;
      const unidades = num(campo(row, ["UNACT", "UnAct", "UN ACT", "UNIDADES", "Unidades"]));
      const asignado = num(campo(row, ["UNI_ASIG", "Un Asig", "UN ASIG", "UNIDADES ASIGNADAS"]));
      return {
        origen: "INV_ACTIVO",
        resumenCodigo: normalizar(base.codigo) || normalizar(base.codigoAlt) || codigo || key,
        codigo,
        codigoAlt: limpiar(campo(row, ["COD_ALT", "CODIGO_ALT", "COD ALTERNATIVO", "CODIGO ALTERNATIVO", "Cod Alternat"])) || limpiar(base.codigoAlt) || codigoAlternativoProducto(codigo, row),
        descripcion: limpiar(campo(row, ["DESCRIPCION", "Descripcion"])) || limpiar(base.descripcion) || descripcionProducto(codigo, row),
        unidades,
        bultos: uxb ? unidades / uxb : unidades,
        bultosAsignable: uxb ? Math.max(0, unidades - asignado) / uxb : Math.max(0, unidades - asignado),
        bultosNoAsignado: 0,
        ubicacion: limpiar(campo(row, ["UBICACION", "Ubicacion"])),
        estadoLpn: "",
        lpn: "",
        observacion: asignado > 0 ? "Stock activo parcialmente asignado" : "Stock activo"
      };
    });
}

function filasLpnShipTo(keys, porKeyBase, maestro) {
  return (dataLPN || [])
    .filter(row => productoCoincideShipTo(row, keys, [["CODIGO", "Producto", "PRODUCTO"], ["COD_ALT", "CODIGO_ALT", "COD ALTERNATIVO", "CODIGO ALTERNATIVO", "Cod Alternat"]]))
    .map(row => {
      const key = clavesProducto(row).find(k => keys.has(k)) || codigoBusqueda(campo(row, ["CODIGO", "PRODUCTO"]));
      const base = porKeyBase.get(key) || {};
      const prod = maestro.get(key) || {};
      const codigo = normalizar(campo(row, ["CODIGO", "PRODUCTO"])) || normalizar(base.codigo) || normalizar(campo(prod, ["CODIGO", "PRODUCTO"]));
      const unidades = unidadesLpn(row);
      const bultos = num(campo(row, ["BULTOS", "Bultos"]));
      const asignado = num(campo(row, ["UN_ASIG", "Un Asig", "UN ASIG", "UNI_ASIG"]));
      return {
        origen: "LPNS",
        resumenCodigo: normalizar(base.codigo) || normalizar(base.codigoAlt) || codigo || key,
        codigo,
        codigoAlt: limpiar(campo(row, ["COD_ALT", "CODIGO_ALT", "COD ALTERNATIVO", "CODIGO ALTERNATIVO", "Cod Alternat"])) || limpiar(base.codigoAlt) || codigoAlternativoProducto(codigo, row),
        descripcion: limpiar(campo(row, ["DESCRIPCION", "Descripcion"])) || limpiar(base.descripcion) || descripcionProducto(codigo, row),
        unidades,
        bultos,
        bultosAsignable: bultos,
        bultosNoAsignado: 0,
        ubicacion: limpiar(campo(row, ["UBICACION", "Ubicacion"])) || "SIN UBICACION",
        estadoLpn: limpiar(campo(row, ["ESTADO", "Estado"])),
        lpn: limpiar(campo(row, ["LPN", "NRO LPN", "NRO_LPN"])),
        observacion: "LPN encontrado"
      };
    });
}

function datosBusquedaShipTo() {
  const base = codigosBusquedaShipTo();
  const { keys, porKeyBase, maestro } = expandirCodigosShipTo(base);
  const detalle = [
    ...pedidoShipToPorProducto(keys, porKeyBase, maestro),
    ...filasInventarioShipTo(keys, porKeyBase, maestro),
    ...filasLpnShipTo(keys, porKeyBase, maestro)
  ];

  const resumen = new Map();
  base.forEach(item => {
    const codigo = normalizar(item.codigo) || normalizar(item.codigoAlt);
    if (!codigo) return;
    resumen.set(codigo, {
      codigo,
      codigoAlt: limpiar(item.codigoAlt),
      descripcion: limpiar(item.descripcion),
      pedidoAsignable: 0,
      pedidoNoAsignado: 0,
      inventarioBultos: 0,
      lpnBultos: 0,
      ubicaciones: new Set(),
      estados: new Set(),
      fuentes: new Set(),
      detalle: []
    });
  });

  detalle.forEach(row => {
    const codigo = normalizar(row.resumenCodigo) || normalizar(row.codigo) || normalizar(row.codigoAlt);
    if (!codigo) return;
    if (!resumen.has(codigo)) {
      resumen.set(codigo, {
        codigo,
        codigoAlt: row.codigoAlt,
        descripcion: row.descripcion,
        pedidoAsignable: 0,
        pedidoNoAsignado: 0,
        inventarioBultos: 0,
        lpnBultos: 0,
        ubicaciones: new Set(),
        estados: new Set(),
        fuentes: new Set(),
        detalle: []
      });
    }
    const item = resumen.get(codigo);
    if (!item.codigoAlt && row.codigoAlt) item.codigoAlt = row.codigoAlt;
    if (!item.descripcion && row.descripcion) item.descripcion = row.descripcion;
    if (row.origen === "PEDIDO") {
      item.pedidoAsignable += row.bultosAsignable;
      item.pedidoNoAsignado += row.bultosNoAsignado;
    }
    if (row.origen === "INV_ACTIVO") item.inventarioBultos += row.bultos;
    if (row.origen === "LPNS") {
      item.lpnBultos += row.bultos;
      if (row.estadoLpn) item.estados.add(row.estadoLpn);
    }
    if (row.ubicacion) item.ubicaciones.add(row.ubicacion);
    item.fuentes.add(row.origen);
    item.detalle.push(row);
  });

  const resumenRows = Array.from(resumen.values())
    .map(item => ({
      ...item,
      totalSeparar: item.pedidoNoAsignado + item.lpnBultos,
      ubicacionesTxt: Array.from(item.ubicaciones).filter(Boolean).slice(0, 8).join(" | "),
      estadosTxt: Array.from(item.estados).filter(Boolean).join(" | "),
      fuentesTxt: Array.from(item.fuentes).sort().join(" | ")
    }))
    .sort((a, b) => b.totalSeparar - a.totalSeparar || b.pedidoNoAsignado - a.pedidoNoAsignado || a.codigo.localeCompare(b.codigo));

  detalleBusquedaShipTo = new Map();
  resumenRows.forEach(row => detalleBusquedaShipTo.set(row.codigo, row));
  const noEncontrados = base.filter(item => {
    const codigo = normalizar(item.codigo) || normalizar(item.codigoAlt);
    const row = resumen.get(codigo);
    return !row || !row.detalle.length;
  });
  return { base, detalle, resumen: resumenRows, noEncontrados };
}

function verBusquedaShipTo() {
  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <div>
        <h2>Busqueda ship to</h2>
        <p class="muted-note">Base automatica: hoja CODIGO de paleteros. Cruza PEDIDO, INV_ACTIVO y LPNS para separar mercaderia critica.</p>
      </div>
      <div class="filters">
        <button onclick="renderBusquedaShipTo()">Actualizar cruce</button>
        <button onclick="exportarBusquedaShipTo()">Excel completo</button>
      </div>
    </div>
    <section class="card product-search-panel">
      <textarea id="codigosExtraShipTo" class="product-search-input" placeholder="Opcional: pega codigos extra para sumar a la hoja CODIGO"></textarea>
    </section>
    <div id="resultadoBusquedaShipTo"></div>
    <div id="modalBusquedaShipTo" class="modal-backdrop" hidden></div>
  `;
  renderBusquedaShipTo();
}

function renderBusquedaShipTo() {
  const destino = document.getElementById("resultadoBusquedaShipTo");
  if (!destino) return;
  const datos = datosBusquedaShipTo();
  const totalNoAsignado = datos.resumen.reduce((a, b) => a + b.pedidoNoAsignado, 0);
  const totalLpns = datos.resumen.reduce((a, b) => a + b.lpnBultos, 0);
  destino.innerHTML = `
    <section class="kpi-grid compact">
      ${kpi("Codigos CODIGO", fmt(codigosBaseShipTo().length))}
      ${kpi("Productos encontrados", fmt(datos.resumen.filter(r => r.detalle.length).length))}
      ${kpi("Pedido no asignado", fmt(totalNoAsignado), "bultos", totalNoAsignado ? "danger" : "")}
      ${kpi("LPNs ubicados", fmt(totalLpns), "bultos")}
      ${kpi("No encontrados", fmt(datos.noEncontrados.length), "", datos.noEncontrados.length ? "danger" : "")}
    </section>
    <section class="card subcard">
      <div class="section-head">
        <div><h2>Tabla general</h2><p class="muted-note">Prioriza pedido no asignado y LPNs encontrados para separar.</p></div>
        <div class="filters">
          <input class="search" id="filtroShipToGeneral" placeholder="Buscar codigo, descripcion, ubicacion..." oninput="filtrarTabla('tablaShipToGeneral', this.value)">
          <button onclick="exportarTablaVisible('tablaShipToGeneral', 'busqueda_ship_to_general')">Excel general</button>
        </div>
      </div>
      ${tablaConId("tablaShipToGeneral", ["Codigo", "Codigo alt", "Descripcion", "Bultos asignable", "Bultos no asignado", "Bultos inventario", "Bultos LPN", "Ubicaciones", "Estado LPN", "Fuentes", "Accion", "Ver"], datos.resumen.map(r => `
        <tr class="${r.pedidoNoAsignado > 0 || r.lpnBultos > 0 ? "bad" : r.detalle.length ? "warn" : ""}">
          <td><strong>${htmlSeguro(r.codigo)}</strong></td>
          <td>${htmlSeguro(r.codigoAlt)}</td>
          <td>${htmlSeguro(r.descripcion)}</td>
          <td class="number">${fmt(r.pedidoAsignable)}</td>
          <td class="number"><strong>${fmt(r.pedidoNoAsignado)}</strong></td>
          <td class="number">${fmt(r.inventarioBultos)}</td>
          <td class="number">${fmt(r.lpnBultos)}</td>
          <td>${htmlSeguro(r.ubicacionesTxt)}</td>
          <td>${htmlSeguro(r.estadosTxt)}</td>
          <td>${htmlSeguro(r.fuentesTxt || "SIN DATA")}</td>
          <td><strong>${htmlSeguro(r.pedidoNoAsignado > 0 || r.lpnBultos > 0 ? "SEPARAR SI O SI" : r.detalle.length ? "VALIDAR" : "NO ENCONTRADO")}</strong></td>
          <td><button class="compact" onclick="abrirDetalleBusquedaShipTo(${argumentoSeguro(r.codigo)})">Ver</button></td>
        </tr>
      `), "Sin productos para mostrar.")}
    </section>
    <section class="card subcard">
      <div class="section-head">
        <div><h2>Tabla especifica</h2><p class="muted-note">Detalle por cada data: PEDIDO, INV_ACTIVO y LPNS.</p></div>
        <div class="filters">
          <input class="search" id="filtroShipToDetalle" placeholder="Filtrar detalle..." oninput="filtrarTabla('tablaShipToDetalle', this.value)">
          <button onclick="exportarTablaVisible('tablaShipToDetalle', 'busqueda_ship_to_especifica')">Excel especifica</button>
        </div>
      </div>
      ${tablaShipToDetalle("tablaShipToDetalle", datos.detalle)}
    </section>
    <section class="card subcard">
      <div class="section-head"><h2>No encontrados</h2></div>
      ${tablaConId("tablaShipToNoEncontrados", ["Codigo", "Codigo alt", "Descripcion", "Observacion"], datos.noEncontrados.map(r => `
        <tr class="bad"><td><strong>${htmlSeguro(r.codigo)}</strong></td><td>${htmlSeguro(r.codigoAlt)}</td><td>${htmlSeguro(r.descripcion)}</td><td>No aparece en PEDIDO, INV_ACTIVO ni LPNS</td></tr>
      `), "Todos los codigos tienen cruce.")}
    </section>
  `;
}

function tablaShipToDetalle(id, rows) {
  return tablaConId(id, ["Data", "Codigo", "Cod alterno", "Descripcion", "Unidades", "Bultos", "Bultos asignable", "Bultos no asignado", "Ubicacion", "LPN", "Estado LPN", "Observacion"], rows.map(r => `
    <tr class="${r.bultosNoAsignado > 0 ? "bad" : r.origen === "LPNS" ? "warn" : ""}">
      <td><strong>${htmlSeguro(r.origen)}</strong></td>
      <td>${htmlSeguro(r.codigo)}</td>
      <td>${htmlSeguro(r.codigoAlt)}</td>
      <td>${htmlSeguro(r.descripcion)}</td>
      <td class="number">${fmt(r.unidades)}</td>
      <td class="number">${fmt(r.bultos)}</td>
      <td class="number">${fmt(r.bultosAsignable)}</td>
      <td class="number"><strong>${fmt(r.bultosNoAsignado)}</strong></td>
      <td>${htmlSeguro(r.ubicacion)}</td>
      <td>${htmlSeguro(r.lpn)}</td>
      <td>${htmlSeguro(r.estadoLpn)}</td>
      <td>${htmlSeguro(r.observacion)}</td>
    </tr>
  `), "Sin detalle para mostrar.");
}

function abrirDetalleBusquedaShipTo(codigo) {
  const row = detalleBusquedaShipTo.get(String(codigo));
  const destino = document.getElementById("modalBusquedaShipTo");
  if (!destino) return;
  if (!row) {
    destino.innerHTML = `<div class="modal-card"><button class="ghost" onclick="cerrarDetalleBusquedaShipTo()">Cerrar</button><p>Sin detalle.</p></div>`;
  } else {
    destino.innerHTML = `
      <div class="modal-card wide">
        <div class="section-head">
          <div>
            <h2>${htmlSeguro(row.codigo)} | ${htmlSeguro(row.descripcion)}</h2>
            <p class="muted-note">${fmt(row.pedidoNoAsignado)} bultos no asignados | ${fmt(row.lpnBultos)} bultos LPN | ${fmt(row.inventarioBultos)} bultos inventario</p>
          </div>
          <div class="filters">
            <button onclick="exportarTablaVisible('tablaDetalleBusquedaShipTo', 'detalle_ship_to_${normalizar(row.codigo)}')">Excel detalle</button>
            <button class="ghost" onclick="cerrarDetalleBusquedaShipTo()">Cerrar</button>
          </div>
        </div>
        ${tablaShipToDetalle("tablaDetalleBusquedaShipTo", row.detalle)}
      </div>
    `;
  }
  destino.hidden = false;
}

function cerrarDetalleBusquedaShipTo() {
  const destino = document.getElementById("modalBusquedaShipTo");
  if (!destino) return;
  destino.hidden = true;
  destino.innerHTML = "";
}

function filasExcelShipToResumen(rows) {
  return [
    ["CODIGO", "COD ALTERNO", "DESCRIPCION", "BULTOS ASIGNABLE", "BULTOS NO ASIGNADO", "BULTOS INVENTARIO", "BULTOS LPN", "UBICACIONES", "ESTADO LPN", "FUENTES", "ACCION"],
    ...rows.map(r => [
      r.codigo,
      r.codigoAlt,
      r.descripcion,
      r.pedidoAsignable,
      r.pedidoNoAsignado,
      r.inventarioBultos,
      r.lpnBultos,
      r.ubicacionesTxt,
      r.estadosTxt,
      r.fuentesTxt || "SIN DATA",
      r.pedidoNoAsignado > 0 || r.lpnBultos > 0 ? "SEPARAR SI O SI" : r.detalle.length ? "VALIDAR" : "NO ENCONTRADO"
    ])
  ];
}

function filasExcelShipToDetalle(rows) {
  return [
    ["DATA", "CODIGO", "COD ALTERNO", "DESCRIPCION", "UNIDADES", "BULTOS", "BULTOS ASIGNABLE", "BULTOS NO ASIGNADO", "UBICACION", "LPN", "ESTADO LPN", "OBSERVACION"],
    ...rows.map(r => [r.origen, r.codigo, r.codigoAlt, r.descripcion, r.unidades, r.bultos, r.bultosAsignable, r.bultosNoAsignado, r.ubicacion, r.lpn, r.estadoLpn, r.observacion])
  ];
}

function exportarBusquedaShipTo() {
  const datos = datosBusquedaShipTo();
  descargarExcelHojas("busqueda_ship_to", [
    { nombre: "General", filas: filasExcelShipToResumen(datos.resumen) },
    { nombre: "Especifica", filas: filasExcelShipToDetalle(datos.detalle) },
    { nombre: "No encontrados", filas: [["CODIGO", "COD ALTERNO", "DESCRIPCION"], ...datos.noEncontrados.map(r => [r.codigo, r.codigoAlt, r.descripcion])] }
  ]);
}

function barra(label, value, total) {
  const p = Math.min(100, pct(value, total));
  return `
    <div class="bar-row">
      <div><strong>${label}</strong><span>${fmt(value)} / ${fmt(total)}</span></div>
      <div class="bar"><div style="width:${p}%"></div></div>
      <b>${p.toFixed(1)}%</b>
    </div>
  `;
}

function verLpns() {
  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <h2>LPNs</h2>
      <input class="search" id="filtroLpn" placeholder="Buscar LPN, codigo, descripcion o ubicacion..." oninput="renderLpns()">
    </div>
    <div id="lpnsKpis"></div>
    <div id="reservaMass"></div>
    <div id="lpnsTabla"></div>
    <div id="modalReservaMass" class="modal-backdrop" hidden></div>
    <div id="modalReservaActivo" class="modal-backdrop" hidden></div>
  `;
  renderLpns();
}

function renderLpns() {
  const q = limpiar(document.getElementById("filtroLpn")?.value).toLowerCase();
  const data = dataLPN.filter(r => !q || [r.LPN, r.CODIGO, r.DESCRIPCION, r.UBICACION, r.ESTADO].join(" ").toLowerCase().includes(q));
  const stock = data.reduce((a, b) => a + num(b.BULTOS), 0);
  const dataMass = data.filter(r => limpiar(r.UBICACION).toUpperCase().startsWith("MASS"));
  const dataOtras = data.filter(r => !limpiar(r.UBICACION).toUpperCase().startsWith("MASS"));
  document.getElementById("lpnsKpis").innerHTML = `<section class="kpi-grid compact">${kpi("LPNs", fmt(data.length))}${kpi("Productos", fmt(new Set(data.map(r => normalizar(r.CODIGO))).size))}${kpi("Stock", fmt(stock))}</section>`;
  renderResumenReservaMass();
  document.getElementById("lpnsTabla").innerHTML = `
    <section class="card subcard">
      <div class="section-head">
        <h2>Ubicacion MASS</h2>
        <span class="muted-note">${fmt(dataMass.length)} LPNs</span>
      </div>
      ${tablaLpns(dataMass)}
    </section>
    <section class="card subcard">
      <div class="section-head">
        <h2>Otras ubicaciones</h2>
        <span class="muted-note">${fmt(dataOtras.length)} LPNs</span>
      </div>
      ${tablaLpns(dataOtras)}
    </section>
    ${seccionReservaActivo(q)}
  `;
}

function tablaLpns(data) {
  return tabla(["LPN", "Codigo", "Descripcion", "Ubicacion", "Estado", "Bultos", "Fecha"], data.slice(0, 1000).map(r => `
    <tr>
      <td><strong>${htmlSeguro(limpiar(r.LPN))}</strong></td>
      <td>${htmlSeguro(limpiar(r.CODIGO))}</td>
      <td>${htmlSeguro(limpiar(r.DESCRIPCION))}</td>
      <td>${htmlSeguro(limpiar(r.UBICACION) || "PALETERO")}</td>
      <td>${htmlSeguro(limpiar(r.ESTADO))}</td>
      <td class="number">${fmt(num(r.BULTOS))}</td>
      <td>${htmlSeguro(limpiar(r.FECHA))}</td>
    </tr>
  `));
}

function productosReservaActivo(q = "") {
  const reserva = new Map();
  lpnsOperativos()
    .filter(r => limpiar(r.UBICACION).toUpperCase().startsWith("MASS-"))
    .forEach(r => {
      const codigo = normalizar(r.CODIGO);
      if (!codigo) return;
      if (!reserva.has(codigo)) {
        const prod = productoPorCodigo(codigo);
        const uxb = num(prod?.UXB) || num(r.UXB) || 1;
        reserva.set(codigo, {
          codigo,
          desc: limpiar(r.DESCRIPCION),
          ubicacionesReserva: new Set(),
          lpns: new Set(),
          bultosReserva: 0,
          unidadesReserva: 0,
          asignadoReserva: 0,
          pendienteReserva: 0,
          detalleReserva: [],
          uxb
        });
      }
      const item = reserva.get(codigo);
      const bultos = num(r.BULTOS);
      const uxb = item.uxb || num(r.UXB) || 1;
      const unidadesStock = num(campo(r, ["UnAct", "UNACT", "UN ACT", "Un Act"])) || (bultos * uxb);
      const unidadesAsignadas = num(campo(r, ["Un Asig", "UN ASIG", "UN_ASIG", "UNI_ASIG"]));
      const unidadesPendientes = Math.max(0, unidadesStock - unidadesAsignadas);
      item.ubicacionesReserva.add(limpiar(r.UBICACION));
      item.lpns.add(limpiar(r.LPN));
      item.bultosReserva += bultos;
      item.unidadesReserva += unidadesStock;
      item.asignadoReserva += unidadesAsignadas;
      item.pendienteReserva += unidadesPendientes;
      item.detalleReserva.push({
        ubicacion: limpiar(r.UBICACION),
        lpn: limpiar(r.LPN),
        bultos,
        unidades: unidadesStock,
        asignado: unidadesAsignadas,
        pendiente: unidadesPendientes,
        uxb
      });
    });

  const activo = new Map();
  inventarioComparable().forEach(r => {
    if (!r.codigo || r.unact <= 0) return;
    if (!activo.has(r.codigo)) {
      activo.set(r.codigo, {
        ubicacionesActivo: new Set(),
        unidadesActivo: 0,
        bultosActivo: 0,
        asignadoActivo: 0,
        pendienteActivo: 0,
        detalleActivo: []
      });
    }
    const item = activo.get(r.codigo);
    const uxb = r.uxb || 1;
    const pendiente = Math.max(0, r.unact - r.uniAsig);
    item.ubicacionesActivo.add(r.ubicacion);
    item.unidadesActivo += r.unact;
    item.bultosActivo += r.unact / uxb;
    item.asignadoActivo += r.uniAsig;
    item.pendienteActivo += pendiente;
    item.detalleActivo.push({
      ubicacion: r.ubicacion,
      unidades: r.unact,
      bultos: r.unact / uxb,
      asignado: r.uniAsig,
      asignadoBultos: r.uniAsig / uxb,
      pendiente,
      pendienteBultos: pendiente / uxb,
      uxb,
      estado: r.estado
    });
  });

  return Array.from(reserva.values())
    .filter(r => activo.has(r.codigo))
    .map(r => ({
      ...r,
      ...activo.get(r.codigo)
    }))
    .filter(r => {
      const texto = [
        r.codigo,
        r.desc,
        Array.from(r.ubicacionesReserva).join(" "),
        Array.from(r.ubicacionesActivo).join(" ")
      ].join(" ").toLowerCase();
      return !q || texto.includes(q);
    })
    .sort((a, b) => b.bultosReserva - a.bultosReserva || b.bultosActivo - a.bultosActivo);
}

function seccionReservaActivo(q = "") {
  const data = productosReservaActivo(q);
  detalleReservaActivo = new Map(data.map(r => [r.codigo, r]));
  return `
    <section class="card subcard">
      <div class="section-head">
        <div>
          <h2>Productos en reserva y activo</h2>
          <span class="muted-note">${fmt(data.length)} productos encontrados en ambos origenes</span>
        </div>
        <div class="filters">
          <button onclick="copiarTablaVisible('tablaReservaActivo')">Copiar</button>
          <button onclick="exportarTablaVisible('tablaReservaActivo', 'productos_reserva_activo')">Excel visible</button>
        </div>
      </div>
      ${tablaConId("tablaReservaActivo", ["Codigo", "Descripcion", "Ubicaciones reserva", "LPNs", "Bultos reserva", "Ubicaciones activo", "Unidades activo", "Bultos activo", "Ver"], data.map(r => `
        <tr>
          <td><strong>${htmlSeguro(r.codigo)}</strong></td>
          <td>${htmlSeguro(r.desc)}</td>
          <td class="number">${fmt(r.ubicacionesReserva.size)}</td>
          <td>${fmt(r.lpns.size)}</td>
          <td class="number">${fmt(r.bultosReserva)}</td>
          <td class="number">${fmt(r.ubicacionesActivo.size)}</td>
          <td>${fmt(r.unidadesActivo)}</td>
          <td class="number">${fmt(r.bultosActivo)}</td>
          <td><button class="soft" onclick="abrirDetalleReservaActivo(${argumentoSeguro(r.codigo)})">Ver</button></td>
        </tr>
      `), "No se encontraron productos presentes en reserva y activo.")}
    </section>
  `;
}

function abrirDetalleReservaActivo(codigo) {
  const item = detalleReservaActivo.get(String(codigo));
  const destino = document.getElementById("modalReservaActivo");
  if (!destino) return;
  if (!item) {
    destino.innerHTML = `<div class="modal-card"><button class="ghost" onclick="cerrarDetalleReservaActivo()">Cerrar</button><p>Sin detalle.</p></div>`;
  } else {
    destino.innerHTML = `
      <div class="modal-card">
        <div class="section-head">
          <div>
            <h2>${htmlSeguro(item.codigo)} | ${htmlSeguro(item.desc)}</h2>
            <p class="muted-note">${fmt(item.lpns.size)} LPNs | ${fmt(item.bultosReserva)} bultos reserva | ${fmt(item.unidadesActivo)} unidades activo</p>
          </div>
          <div class="filters">
            <button onclick="exportarTablaVisible('tablaDetalleReservaProducto', 'detalle_reserva_${htmlSeguro(item.codigo)}')">Excel reserva</button>
            <button onclick="exportarTablaVisible('tablaDetalleActivoProducto', 'detalle_activo_${htmlSeguro(item.codigo)}')">Excel activo</button>
            <button class="ghost" onclick="cerrarDetalleReservaActivo()">Cerrar</button>
          </div>
        </div>
        <section class="card subcard detail-full-width">
          <div class="section-head">
            <div>
              <h2>Ubicaciones reserva</h2>
            </div>
            <button onclick="exportarTablaVisible('tablaDetalleReservaProducto', 'detalle_reserva_${htmlSeguro(item.codigo)}')">Excel</button>
          </div>
          ${tablaConId("tablaDetalleReservaProducto", ["Ubicacion", "LPN", "Bultos", "Unidades", "Asignado", "Pendiente"], item.detalleReserva.sort((a, b) => ordenarUbicacion(a.ubicacion, b.ubicacion)).map(r => `
              <tr>
                <td><strong>${htmlSeguro(r.ubicacion)}</strong></td>
                <td>${htmlSeguro(r.lpn)}</td>
                <td class="number">${fmt(r.bultos)}</td>
                <td>${fmt(r.unidades)}</td>
                <td>${fmt(r.asignado)}</td>
                <td class="number">${fmt(r.pendiente)}</td>
              </tr>
            `))}
        </section>
        <section class="card subcard detail-full-width">
          <div class="section-head">
            <div>
              <h2>Ubicaciones activo</h2>
            </div>
            <button onclick="exportarTablaVisible('tablaDetalleActivoProducto', 'detalle_activo_${htmlSeguro(item.codigo)}')">Excel</button>
          </div>
          ${tablaConId("tablaDetalleActivoProducto", ["Ubicacion", "Stock UND", "Stock BUL", "Asignado UND", "Asignado BUL", "Pendiente UND", "Pendiente BUL", "Estado"], item.detalleActivo.sort((a, b) => ordenarUbicacion(a.ubicacion, b.ubicacion)).map(r => `
              <tr class="${r.pendiente > 0 ? "warn" : ""}">
                <td><strong>${htmlSeguro(r.ubicacion)}</strong></td>
                <td>${fmt(r.unidades)}</td>
                <td class="number">${fmt(r.bultos)}</td>
                <td>${fmt(r.asignado)}</td>
                <td>${fmt(r.asignadoBultos)}</td>
                <td>${fmt(r.pendiente)}</td>
                <td class="number">${fmt(r.pendienteBultos)}</td>
                <td>${htmlSeguro(r.estado)}</td>
              </tr>
            `))}
        </section>
      </div>
    `;
  }
  destino.hidden = false;
}

function cerrarDetalleReservaActivo() {
  const destino = document.getElementById("modalReservaActivo");
  if (!destino) return;
  destino.hidden = true;
  destino.innerHTML = "";
}

function calcularReservaMassIncidencias() {
  const unicos = new Map();
  lpnsOperativos()
    .filter(r => limpiar(r.UBICACION).toUpperCase().startsWith("MASS"))
    .forEach(r => {
      const lpn = limpiar(r.LPN);
      const codigo = normalizar(r.CODIGO);
      const ubicacion = limpiar(r.UBICACION);
      if (!lpn || !codigo || !ubicacion) return;
      const key = `${lpn}|${codigo}|${ubicacion}`;
      if (!unicos.has(key)) {
        unicos.set(key, {
          lpn,
          codigo,
          desc: limpiar(r.DESCRIPCION),
          ubicacion,
          bultos: num(r.BULTOS)
        });
      }
    });

  const porUbicacion = new Map();
  unicos.forEach(r => {
    if (!porUbicacion.has(r.ubicacion)) {
      porUbicacion.set(r.ubicacion, {
        ubicacion: r.ubicacion,
        lpns: new Set(),
        productos: new Set(),
        bultos: 0,
        filas: []
      });
    }
    const item = porUbicacion.get(r.ubicacion);
    item.lpns.add(r.lpn);
    item.productos.add(r.codigo);
    item.bultos += r.bultos;
    item.filas.push(r);
  });

  return Array.from(porUbicacion.values())
    .filter(r => r.lpns.size > 1 || r.productos.size > 1)
    .sort((a, b) => ordenarUbicacion(a.ubicacion, b.ubicacion));
}

function renderResumenReservaMass() {
  const incidencias = calcularReservaMassIncidencias();
  const totalBultos = incidencias.reduce((a, b) => a + b.bultos, 0);
  const totalLpns = incidencias.reduce((a, b) => a + b.lpns.size, 0);
  const totalProductos = incidencias.reduce((a, b) => a + b.productos.size, 0);

  document.getElementById("reservaMass").innerHTML = `
    <section class="card subcard">
      <div class="section-head">
        <div>
          <h2>Validacion reserva MASS</h2>
        </div>
        <button onclick="exportarReservaMassExcel()">Excel incidencias</button>
      </div>
      <section class="kpi-grid compact">
        ${kpi("Ubicaciones con alerta", fmt(incidencias.length), "", incidencias.length ? "danger" : "")}
        ${kpi("LPNs involucrados", fmt(totalLpns))}
        ${kpi("Productos distintos", fmt(totalProductos))}
        ${kpi("Bultos", fmt(totalBultos))}
      </section>
      ${tabla(["Ubicacion", "LPNs", "Productos", "Bultos", "Causa", "Ver"], incidencias.map(r => `
        <tr class="${r.productos.size > 1 ? "bad" : "warn"}">
          <td><strong>${r.ubicacion}</strong></td>
          <td>${fmt(r.lpns.size)}</td>
          <td>${fmt(r.productos.size)}</td>
          <td class="number">${fmt(r.bultos)}</td>
          <td>${[r.lpns.size > 1 ? "Mas de 1 LPN" : "", r.productos.size > 1 ? "Mas de 1 producto" : ""].filter(Boolean).join(" / ")}</td>
          <td><button class="soft" onclick="verDetalleReservaMass('${encodeURIComponent(r.ubicacion)}')">Ver</button></td>
        </tr>
      `), "Todas las ubicaciones MASS cumplen con 1 LPN y 1 producto.")}
    </section>
  `;
}

function detalleReservaMassHtml(item) {
  const porProducto = new Map();
  item.filas.forEach(r => {
    const key = `${r.codigo}|${r.desc}|${r.ubicacion}`;
    if (!porProducto.has(key)) porProducto.set(key, { codigo: r.codigo, desc: r.desc, ubicacion: r.ubicacion, bultos: 0, lpns: new Set() });
    const p = porProducto.get(key);
    p.bultos += r.bultos;
    p.lpns.add(r.lpn);
  });
  const rows = Array.from(porProducto.values()).sort((a, b) => b.bultos - a.bultos).map(r => `
    <tr>
      <td>${r.codigo}</td>
      <td>${r.desc}</td>
      <td>${r.ubicacion}</td>
      <td>${Array.from(r.lpns).join(" / ")}</td>
      <td class="number">${fmt(r.bultos)}</td>
    </tr>
  `);

  return `
    <div class="modal-card">
      <div class="section-head">
        <div>
          <h2>Detalle ${item.ubicacion}</h2>
          <span class="muted-note">${item.lpns.size} LPNs / ${item.productos.size} productos</span>
        </div>
        <button class="ghost" onclick="cerrarModalReservaMass()">Cerrar</button>
      </div>
      ${tabla(["Codigo", "Descripcion", "Ubicacion", "LPNs", "Bultos"], rows)}
    </div>
  `;
}

function verDetalleReservaMass(ubicacion) {
  ubicacionReservaActiva = decodeURIComponent(ubicacion);
  const item = calcularReservaMassIncidencias().find(r => r.ubicacion === ubicacionReservaActiva);
  const destino = document.getElementById("modalReservaMass");
  if (!destino) return;
  destino.innerHTML = item ? detalleReservaMassHtml(item) : `<div class="modal-card"><button class="ghost" onclick="cerrarModalReservaMass()">Cerrar</button><p>Sin detalle para mostrar.</p></div>`;
  destino.hidden = false;
}

function cerrarModalReservaMass() {
  const destino = document.getElementById("modalReservaMass");
  if (!destino) return;
  destino.hidden = true;
  destino.innerHTML = "";
}

function exportarReservaMassExcel() {
  const incidencias = calcularReservaMassIncidencias();
  const filas = [];
  incidencias.forEach(item => {
    const porProducto = new Map();
    item.filas.forEach(r => {
      const key = `${r.codigo}|${r.desc}|${r.ubicacion}`;
      if (!porProducto.has(key)) porProducto.set(key, { codigo: r.codigo, desc: r.desc, ubicacion: r.ubicacion, bultos: 0 });
      porProducto.get(key).bultos += r.bultos;
    });
    Array.from(porProducto.values()).forEach(r => filas.push(r));
  });

  const html = `
    <table>
      <thead><tr><th>Codigo</th><th>Descripcion</th><th>Ubicacion</th><th>Bultos</th></tr></thead>
      <tbody>
        ${filas.map(r => `
          <tr>
            <td>${r.codigo}</td>
            <td>${r.desc}</td>
            <td>${r.ubicacion}</td>
            <td>${fmt(r.bultos)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  descargarExcel("reserva_mass_incidencias", html);
}

function consolidarReservaParaOptimizar() {
  const lpns = new Map();
  lpnsOperativos()
    .filter(r => limpiar(r.UBICACION).toUpperCase().startsWith("MASS-"))
    .forEach(r => {
      const lpn = limpiar(r.LPN);
      const codigo = normalizar(r.CODIGO);
      const ubicacion = limpiar(r.UBICACION);
      if (!lpn || !codigo || !ubicacion) return;
      const key = `${lpn}|${codigo}|${ubicacion}`;
      if (!lpns.has(key)) {
        lpns.set(key, { lpn, codigo, desc: limpiar(r.DESCRIPCION), ubicacion, bultos: 0 });
      }
      lpns.get(key).bultos += num(r.BULTOS);
    });

  const ubicaciones = new Map();
  lpns.forEach(r => {
    const key = `${r.codigo}|${r.ubicacion}`;
    if (!ubicaciones.has(key)) {
      ubicaciones.set(key, {
        codigo: r.codigo,
        desc: r.desc,
        ubicacion: r.ubicacion,
        bultos: 0,
        lpns: new Set(),
        detalleLpns: []
      });
    }
    const item = ubicaciones.get(key);
    item.bultos += r.bultos;
    item.lpns.add(r.lpn);
    item.detalleLpns.push(r);
  });
  return Array.from(ubicaciones.values());
}

function registroPalletMaximo() {
  try {
    return JSON.parse(localStorage.getItem("operaciones_pallet_maximo") || "{}");
  } catch {
    return {};
  }
}

function validacionesPresencialesReserva() {
  try {
    return JSON.parse(localStorage.getItem("operaciones_validacion_reserva") || "{}");
  } catch {
    return {};
  }
}

function guardarValidacionPresencial(codigo) {
  const capacidad = num(document.getElementById("validacionCapacidadReserva")?.value);
  const observacion = limpiar(document.getElementById("validacionObservacionReserva")?.value);
  if (capacidad <= 15) return alert("Ingresa una capacidad total mayor a 15.");
  const validaciones = validacionesPresencialesReserva();
  validaciones[codigo] = { capacidad, observacion, actualizado: new Date().toISOString() };
  localStorage.setItem("operaciones_validacion_reserva", JSON.stringify(validaciones));
  invalidarCacheOperaciones();
  cerrarDetalleOptimizacion();
  verOptimizarReserva();
}

function calcularPalletMaximo(ubicaciones) {
  const guardado = registroPalletMaximo();
  const validados = validacionesPresencialesReserva();
  const porProducto = new Map();
  ubicaciones.forEach(r => {
    if (!porProducto.has(r.codigo)) porProducto.set(r.codigo, []);
    porProducto.get(r.codigo).push(r);
  });

  const aprendidos = {};
  porProducto.forEach((rows, codigo) => {
    const frecuencias = new Map();
    rows.filter(r => r.bultos > 15).forEach(r => {
      const valor = String(Number(r.bultos.toFixed(3)));
      frecuencias.set(valor, (frecuencias.get(valor) || 0) + 1);
    });
    const repetidos = Array.from(frecuencias.entries())
      .filter(([, veces]) => veces >= 2)
      .sort((a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]));
    if (repetidos.length) {
      aprendidos[codigo] = {
        maximo: Number(repetidos[0][0]),
        repeticiones: repetidos[0][1],
        desc: rows[0]?.desc || "",
        actualizado: new Date().toISOString()
      };
    }
  });
  Object.entries(validados).forEach(([codigo, r]) => {
    if (num(r.capacidad) > 15) {
      aprendidos[codigo] = {
        maximo: num(r.capacidad),
        repeticiones: 0,
        desc: porProducto.get(codigo)?.[0]?.desc || "",
        actualizado: r.actualizado,
        origen: "VALIDADO PRESENCIALMENTE",
        observacion: r.observacion || ""
      };
    }
  });
  const registro = { ...guardado, ...aprendidos };
  localStorage.setItem("operaciones_pallet_maximo", JSON.stringify(registro));
  return registro;
}

function inventarioActivoPorProducto() {
  const mapa = new Map();
  inventarioComparable().forEach(r => {
    if (!r.codigo || !r.ubicacion) return;
    if (!mapa.has(r.codigo)) mapa.set(r.codigo, []);
    mapa.get(r.codigo).push({
      ubicacion: r.ubicacion,
      disponibleUnd: r.disponible,
      disponibleBul: r.disponible / (r.uxb || 1),
      estado: r.estado
    });
  });
  return mapa;
}

function analizarOptimizacionReserva() {
  const ubicaciones = consolidarReservaParaOptimizar();
  const maximos = calcularPalletMaximo(ubicaciones);
  const activo = inventarioActivoPorProducto();
  const porProducto = new Map();
  ubicaciones.forEach(r => {
    if (!porProducto.has(r.codigo)) porProducto.set(r.codigo, []);
    porProducto.get(r.codigo).push(r);
  });

  const liberables = [];
  const noAcoplables = [];
  const criticos = [];
  detalleOptimizacionReserva = new Map();

  porProducto.forEach((rows, codigo) => {
    const maximo = num(maximos[codigo]?.maximo);
    const activas = activo.get(codigo) || [];
    const disponibleActivoBul = activas.reduce((a, b) => a + b.disponibleBul, 0);
    const proyectado = new Map(rows.map(r => [r.ubicacion, r.bultos]));
    const liberadas = new Set();
    const fuentes = rows.filter(r => r.bultos <= 15).sort((a, b) => a.bultos - b.bultos || ordenarUbicacion(a.ubicacion, b.ubicacion));

    if (rows.length === 1 && activas.length && disponibleActivoBul >= rows[0].bultos) {
      const origen = rows[0];
      liberadas.add(origen.ubicacion);
      liberables.push({
        ...origen,
        maximo,
        destino: activas.map(a => a.ubicacion).join(", "),
        stockDestino: 0,
        stockFinal: origen.bultos,
        accion: "INGRESAR A ACTIVO"
      });
    }

    if (maximo > 15) {
      fuentes.filter(origen => !liberadas.has(origen.ubicacion)).forEach(origen => {
        const destinosMayores = rows
          .filter(destino => destino.ubicacion !== origen.ubicacion && !liberadas.has(destino.ubicacion))
          .filter(destino => destino.bultos > 15);
        const destinos = destinosMayores
          .filter(destino => proyectado.get(destino.ubicacion) + origen.bultos <= maximo)
          .sort((a, b) => proyectado.get(b.ubicacion) - proyectado.get(a.ubicacion));
        const destino = destinos[0];
        if (!destino) {
          noAcoplables.push({
            ...origen,
            maximo,
            motivo: destinosMayores.length
              ? "SIN CAPACIDAD: superaria el maximo del pallet"
              : "SIN DESTINO: no existe otra ubicacion del producto con stock mayor a 15"
          });
          return;
        }
        const antes = proyectado.get(destino.ubicacion);
        proyectado.set(destino.ubicacion, antes + origen.bultos);
        liberadas.add(origen.ubicacion);
        liberables.push({
          ...origen,
          maximo,
          destino: destino.ubicacion,
          stockDestino: antes,
          stockFinal: antes + origen.bultos,
          accion: "ACOPLAR EN RESERVA"
        });
      });
    } else {
      fuentes.filter(origen => !liberadas.has(origen.ubicacion)).forEach(origen => {
        noAcoplables.push({
          ...origen,
          maximo: 0,
          motivo: "VALIDAR PRESENCIALMENTE: no hay un stock mayor a 15 repetido en dos o mas ubicaciones",
          requiereValidacion: true
        });
      });
    }

    rows.filter(r => r.bultos <= 5).forEach(r => {
      const disponibleBul = disponibleActivoBul;
      criticos.push({
        ...r,
        activas,
        disponibleBul,
        estado: !activas.length ? "SIN UBICACION ACTIVA" : disponibleBul >= r.bultos ? "INGRESAR A ACTIVO" : "ACTIVO SIN CAPACIDAD"
      });
    });

    detalleOptimizacionReserva.set(codigo, {
      codigo,
      desc: rows[0]?.desc || "",
      maximo,
      ubicaciones: rows.slice().sort((a, b) => ordenarUbicacion(a.ubicacion, b.ubicacion)),
      activas
    });
  });

  return {
    ubicaciones,
    maximos,
    liberables: liberables.sort((a, b) => ordenarUbicacion(a.ubicacion, b.ubicacion)),
    noAcoplables: noAcoplables.sort((a, b) => ordenarUbicacion(a.ubicacion, b.ubicacion)),
    criticos: criticos.sort((a, b) => a.bultos - b.bultos || ordenarUbicacion(a.ubicacion, b.ubicacion))
  };
}

function pasilloReservaOptimizar(ubicacion) {
  const pasillo = pasilloMass(ubicacion);
  return pasillo && pasillo !== "10" ? pasillo : "";
}

function productosMaximoPorPasillo(ubicaciones, maximos) {
  const mapa = new Map();
  Object.entries(maximos)
    .filter(([, r]) => num(r.maximo) > 15)
    .forEach(([codigo, registro]) => {
      const maximo = num(registro.maximo);
      ubicaciones
        .filter(u => u.codigo === codigo)
        .filter(u => pasilloReservaOptimizar(u.ubicacion))
        .filter(u => Math.abs(num(u.bultos) - maximo) < 0.001 || (registro.origen === "VALIDADO PRESENCIALMENTE" && num(u.bultos) > 15))
        .forEach(u => {
          const pasillo = pasilloReservaOptimizar(u.ubicacion);
          const key = `${pasillo}|${codigo}`;
          if (!mapa.has(key)) {
            mapa.set(key, {
              pasillo,
              codigo,
              desc: registro.desc || u.desc || "",
              maximo,
              origen: registro.origen || "APRENDIDO POR REPETICION",
              repeticiones: num(registro.repeticiones),
              pallets: 0
            });
          }
          mapa.get(key).pallets += 1;
        });
    });

  return Array.from(mapa.values())
    .sort((a, b) =>
      Number(a.pasillo) - Number(b.pasillo) ||
      b.pallets - a.pallets ||
      b.maximo - a.maximo ||
      a.desc.localeCompare(b.desc)
    );
}

function verOptimizarReserva() {
  const analisis = analizarOptimizacionReserva();
  const productosMaximo = productosMaximoPorPasillo(analisis.ubicaciones, analisis.maximos);
  const sinActivo = analisis.criticos.filter(r => r.estado === "SIN UBICACION ACTIVA");
  const conActivo = analisis.criticos.filter(r => r.estado === "INGRESAR A ACTIVO");
  const bultosLiberables = analisis.liberables.reduce((a, b) => a + b.bultos, 0);

  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <div>
        <h2>Optimizacion de reserva MASS</h2>
      </div>
    </div>
    <section class="kpi-grid compact">
      ${kpi("Ubicaciones liberables", fmt(analisis.liberables.length), `${fmt(bultosLiberables)} bultos`, analisis.liberables.length ? "warn" : "")}
      ${kpi("No acoplables <= 15", fmt(analisis.noAcoplables.length), "con motivo identificado", analisis.noAcoplables.length ? "danger" : "")}
      ${kpi("Criticos <= 5", fmt(analisis.criticos.length), "ubicaciones MASS", analisis.criticos.length ? "danger" : "")}
      ${kpi("Mover a activo", fmt(conActivo.length), "con capacidad disponible")}
      ${kpi("Sin activo", fmt(sinActivo.length), "requieren alerta", sinActivo.length ? "danger" : "")}
      ${kpi("Maximos aprendidos", fmt(productosMaximo.length), "productos con pallet completo")}
    </section>

    <section class="card subcard">
      <div class="section-head">
        <div><h2>Ubicaciones <= 15 que no pueden acoplarse</h2></div>
        <button onclick="exportarTablaVisible('tablaNoAcoplablesReserva', 'ubicaciones_no_acoplables_reserva')">Excel</button>
      </div>
      ${tablaConId("tablaNoAcoplablesReserva", ["Codigo", "Descripcion", "Ubicacion", "Stock", "Max pallet", "Motivo", "Accion"], analisis.noAcoplables.map(r => `
        <tr class="bad">
          <td><strong>${htmlSeguro(r.codigo)}</strong></td><td>${htmlSeguro(r.desc)}</td>
          <td>${htmlSeguro(r.ubicacion)}</td><td class="number">${fmt(r.bultos)}</td><td>${fmt(r.maximo)}</td>
          <td><strong>${htmlSeguro(r.motivo)}</strong></td>
          <td><button class="soft" onclick="abrirDetalleOptimizacion(${argumentoSeguro(r.codigo)}, ${r.requiereValidacion ? "true" : "false"})">${r.requiereValidacion ? "Validar" : "Ver"}</button></td>
        </tr>
      `), "Todas las ubicaciones con stock menor o igual a 15 pueden consolidarse.")}
    </section>

    <section class="card subcard">
      <div class="section-head">
        <div><h2>Ubicaciones que se pueden liberar</h2></div>
        <button onclick="exportarTablaVisible('tablaLiberarReserva', 'ubicaciones_liberables_reserva')">Excel</button>
      </div>
      ${tablaConId("tablaLiberarReserva", ["Accion", "Codigo", "Descripcion", "Ubicacion liberar", "Stock", "Mover a", "Stock destino", "Stock final", "Max pallet", "Ver"], analisis.liberables.map(r => `
        <tr class="warn">
          <td><strong>${htmlSeguro(r.accion || "ACOPLAR EN RESERVA")}</strong></td>
          <td><strong>${htmlSeguro(r.codigo)}</strong></td><td>${htmlSeguro(r.desc)}</td>
          <td>${htmlSeguro(r.ubicacion)}</td><td class="number">${fmt(r.bultos)}</td>
          <td><strong>${htmlSeguro(r.destino)}</strong></td><td>${fmt(r.stockDestino)}</td>
          <td>${fmt(r.stockFinal)}</td><td>${fmt(r.maximo)}</td>
          <td><button class="soft" onclick="abrirDetalleOptimizacion(${argumentoSeguro(r.codigo)})">Ver</button></td>
        </tr>
      `), "No se detectaron ubicaciones que puedan consolidarse de forma segura.")}
    </section>

    <section class="card subcard">
      <div class="section-head">
        <div><h2>Criticos de reserva <= 5</h2></div>
        <button onclick="exportarTablaVisible('tablaCriticosReserva', 'criticos_reserva')">Excel</button>
      </div>
      ${tablaConId("tablaCriticosReserva", ["Estado", "Codigo", "Descripcion", "Ubicacion MASS", "Stock", "Ubicaciones activo", "Capacidad activo BUL", "Ver"], analisis.criticos.map(r => `
        <tr class="${r.estado === "SIN UBICACION ACTIVA" ? "bad" : r.estado === "ACTIVO SIN CAPACIDAD" ? "warn" : ""}">
          <td><strong>${htmlSeguro(r.estado)}</strong></td><td>${htmlSeguro(r.codigo)}</td><td>${htmlSeguro(r.desc)}</td>
          <td>${htmlSeguro(r.ubicacion)}</td><td class="number">${fmt(r.bultos)}</td>
          <td>${htmlSeguro(r.activas.map(a => a.ubicacion).join(", ") || "SIN ACTIVO")}</td><td>${fmt(r.disponibleBul)}</td>
          <td><button class="soft" onclick="abrirDetalleOptimizacion(${argumentoSeguro(r.codigo)})">Ver</button></td>
        </tr>
      `), "No se detectaron ubicaciones criticas con stock menor o igual a 5.")}
    </section>

    <section class="card subcard">
      <div class="section-head">
        <div><h2>Registro de pallet completo aprendido</h2></div>
        <button onclick="exportarTablaVisible('tablaPalletMaximo', 'registro_pallet_maximo')">Excel</button>
      </div>
      ${tablaConId("tablaPalletMaximo", ["Pasillo", "Codigo", "Descripcion", "Max pallet", "Pallets", "Origen", "Repeticiones", "Ver"], productosMaximo.map(r => `
        <tr>
          <td><strong>${htmlSeguro(r.pasillo)}</strong></td>
          <td><strong>${htmlSeguro(r.codigo)}</strong></td>
          <td>${htmlSeguro(r.desc)}</td>
          <td class="number">${fmt(r.maximo)}</td>
          <td class="number">${fmt(r.pallets)}</td>
          <td>${htmlSeguro(r.origen || "APRENDIDO POR REPETICION")}</td>
          <td>${fmt(r.repeticiones || 0)}</td>
          <td><button class="soft" onclick="abrirDetalleOptimizacion(${argumentoSeguro(r.codigo)})">Ver</button></td>
        </tr>
      `), "Aun no hay productos con un pallet completo repetido.")}
    </section>
    <div id="modalOptimizacionReserva" class="modal-backdrop" hidden></div>
  `;
}

function abrirDetalleOptimizacion(codigo, mostrarValidacion = false) {
  const detalle = detalleOptimizacionReserva.get(String(codigo));
  const destino = document.getElementById("modalOptimizacionReserva");
  if (!destino) return;
  if (!detalle) {
    destino.innerHTML = `<div class="modal-card"><button class="ghost" onclick="cerrarDetalleOptimizacion()">Cerrar</button><p>Sin detalle.</p></div>`;
  } else {
    destino.innerHTML = `
      <div class="modal-card">
        <div class="section-head">
          <div><h2>${htmlSeguro(detalle.codigo)} | ${htmlSeguro(detalle.desc)}</h2><p class="muted-note">Max pallet aprendido: ${fmt(detalle.maximo || 0)}</p></div>
          <button class="ghost" onclick="cerrarDetalleOptimizacion()">Cerrar</button>
        </div>
        ${tabla(["Ubicacion MASS", "LPNs consolidados", "Stock"], detalle.ubicaciones.map(r => `
          <tr class="${r.bultos <= 5 ? "bad" : r.bultos <= 15 ? "warn" : ""}">
            <td><strong>${htmlSeguro(r.ubicacion)}</strong></td><td>${htmlSeguro(Array.from(r.lpns).join(", "))}</td><td class="number">${fmt(r.bultos)}</td>
          </tr>
        `))}
        <h3>Ubicaciones activas</h3>
        ${tabla(["Ubicacion", "Estado", "Capacidad UND", "Capacidad BUL"], detalle.activas.map(r => `
          <tr><td>${htmlSeguro(r.ubicacion)}</td><td>${htmlSeguro(r.estado)}</td><td>${fmt(r.disponibleUnd)}</td><td class="number">${fmt(r.disponibleBul)}</td></tr>
        `), "Producto sin ubicacion activa.")}
        ${mostrarValidacion ? `
          <section class="detail-box">
            <h3>Validacion presencial de capacidad</h3>
            <div class="filters">
              <label>Capacidad total pallet<input id="validacionCapacidadReserva" type="number" min="16" step="1" placeholder="Ejemplo: 60"></label>
              <label>Observacion<input id="validacionObservacionReserva" placeholder="Resultado de la validacion"></label>
              <button onclick="guardarValidacionPresencial(${argumentoSeguro(detalle.codigo)})">Guardar validacion</button>
            </div>
          </section>
        ` : ""}
      </div>
    `;
  }
  destino.hidden = false;
}

function cerrarDetalleOptimizacion() {
  const destino = document.getElementById("modalOptimizacionReserva");
  if (!destino) return;
  destino.hidden = true;
  destino.innerHTML = "";
}

function codigoAlternativoProducto(codigo, row = {}) {
  const prod = productoPorCodigo(codigo) || {};
  return limpiar(campo(prod, ["CODIGO_ALT", "COD_ALT", "CODIGO ALTERNATIVO", "Cod Alternat"])) ||
    limpiar(campo(row, ["COD_ALT", "CODIGO_ALT", "CODIGO ALTERNATIVO", "Cod Alternat"]));
}

function descripcionProducto(codigo, row = {}) {
  const prod = productoPorCodigo(codigo) || {};
  return limpiar(campo(row, ["DESCRIPCION", "Descripcion"])) ||
    limpiar(campo(prod, ["DESCRIPCION", "Descripcion"]));
}

function unidadesLpn(row) {
  const unidades = num(campo(row, ["UnAct", "UNACT", "UN ACT"]));
  if (unidades > 0) return unidades;
  const uxb = num(campo(row, ["UXB", "Uxb"])) || num(campo(productoPorCodigo(normalizar(row.CODIGO)) || {}, ["UXB", "Uxb"])) || 1;
  return num(row.BULTOS) * uxb;
}

function antiguedadLpn(row) {
  const antiguedad = num(campo(row, ["ANTIGUEDAD", "Antiguedad"]));
  return antiguedad || diasLaboralesSinDomingos(campo(row, ["FECHA", "Fecha", "Fe y Hr Creac", "Fe y Hr Almacena"]));
}

function grupoLpnSinActivo(ubicacion) {
  const ubi = limpiar(ubicacion).toUpperCase();
  if (!ubi) return "SIN UBICACION";
  if (ubi.startsWith("MASS-")) return "RESERVA MASS";
  if (ubi.startsWith("DROP-BUFR")) return "BUFFER";
  if (ubi.includes("BLOQUEO") || ubi.includes("BLOQUEADO")) return "EXCLUIR BLOQUEO";
  if (ubi.startsWith("DROP-STOCK-DESBLOQ-962")) return "DROP-STOCK DESBLOQUEO";
  if (ubi.startsWith("DROP-STOCK")) return "DROP-STOCK";
  if (ubi.startsWith("RAMPA-")) return "RAMPA";
  return "OTRAS UBICACIONES";
}

function esUbicacionControlSinActivo(ubicacion) {
  const grupo = grupoLpnSinActivo(ubicacion);
  return ["SIN UBICACION", "BUFFER", "DROP-STOCK DESBLOQUEO", "DROP-STOCK", "RAMPA"].includes(grupo);
}

function esGrupoControlSinActivo(grupo) {
  return ["SIN UBICACION", "BUFFER", "DROP-STOCK DESBLOQUEO", "DROP-STOCK", "RAMPA"].includes(grupo);
}

function mapaProductosConActivo() {
  const activos = new Set();

  dataInventario.forEach(row => {
    const codigo = normalizar(campo(row, ["PRODUCTO", "CODIGO"]));
    const ubicacion = limpiar(campo(row, ["UBICACION", "Ubicacion"]));
    const stock = num(campo(row, ["UNACT", "UnAct", "UN ACT", "BULTOS"]));
    if (codigo && ubicacion && stock > 0) activos.add(codigo);
  });

  return activos;
}

function normalizarLpnSinActivo(row) {
  const codigo = normalizar(campo(row, ["CODIGO", "PRODUCTO"]));
  const ubicacionRaw = limpiar(campo(row, ["UBICACION", "Ubicacion"]));
  return {
    lpn: limpiar(campo(row, ["LPN", "NRO LPN", "NRO_LPN"])),
    codigo,
    codigoAlt: codigoAlternativoProducto(codigo, row),
    descripcion: descripcionProducto(codigo, row),
    ubicacion: ubicacionRaw || "SIN UBICACION",
    grupo: grupoLpnSinActivo(ubicacionRaw),
    estado: limpiar(campo(row, ["ESTADO", "Estado"])),
    bultos: num(campo(row, ["BULTOS", "Bultos"])),
    unidades: unidadesLpn(row),
    fecha: limpiar(campo(row, ["FECHA", "Fecha"])),
    antiguedad: antiguedadLpn(row)
  };
}

function lpnsControlBase() {
  const activos = mapaProductosConActivo();
  const vistos = new Map();

  lpnsOperativos()
    .map(normalizarLpnSinActivo)
    .filter(r => r.codigo && esGrupoControlSinActivo(r.grupo))
    .forEach(r => {
      const key = `${r.lpn}|${r.codigo}|${r.ubicacion}`;
      r.tieneActivo = activos.has(r.codigo);
      if (!vistos.has(key)) vistos.set(key, { ...r });
      else {
        const actual = vistos.get(key);
        actual.bultos += r.bultos;
        actual.unidades += r.unidades;
        actual.antiguedad = Math.max(actual.antiguedad, r.antiguedad);
      }
    });

  return Array.from(vistos.values());
}

function lpnsSinActivoBase() {
  return lpnsControlBase().filter(r => !r.tieneActivo);
}

function resumenLpnsSinActivo(detalle, separarPorUbicacion = false) {
  const mapa = new Map();
  detalle.forEach(row => {
    const key = separarPorUbicacion ? `${row.codigo}|${row.grupo}|${row.ubicacion}` : row.codigo;
    if (!mapa.has(key)) {
      mapa.set(key, {
        key,
        codigo: row.codigo,
        codigoAlt: row.codigoAlt,
        descripcion: row.descripcion,
        grupo: separarPorUbicacion ? row.grupo : "",
        ubicacion: separarPorUbicacion ? row.ubicacion : "",
        lpns: new Set(),
        bultos: 0,
        unidades: 0,
        maxAntiguedad: 0,
        detalle: []
      });
    }
    const item = mapa.get(key);
    item.lpns.add(row.lpn);
    item.bultos += row.bultos;
    item.unidades += row.unidades;
    item.maxAntiguedad = Math.max(item.maxAntiguedad, row.antiguedad);
    item.detalle.push(row);
  });

  return Array.from(mapa.values())
    .map(item => ({ ...item, lpnsLista: Array.from(item.lpns).filter(Boolean).sort(), cantidadLpns: item.lpns.size }))
    .sort((a, b) => b.bultos - a.bultos || b.unidades - a.unidades || a.descripcion.localeCompare(b.descripcion));
}

function datosLpnsSinActivo() {
  const control = lpnsControlBase();
  const baseSinActivo = control.filter(r => !r.tieneActivo);
  const reserva = lpnsOperativos()
    .map(normalizarLpnSinActivo)
    .filter(r => r.codigo && r.grupo === "RESERVA MASS");
  const codigosConReserva = new Set(reserva.map(r => r.codigo));
  return {
    general: resumenLpnsSinActivo(control, true),
    sinReserva: resumenLpnsSinActivo(baseSinActivo.filter(r => !codigosConReserva.has(r.codigo))),
    conReserva: resumenLpnsSinActivo([...baseSinActivo, ...reserva].filter(r => codigosConReserva.has(r.codigo))),
    base: control,
    baseSinActivo
  };
}

function calcularLpnsAntiguos() {
  return lpnsControlBase()
    .filter(r => esGrupoControlSinActivo(r.grupo))
    .map(r => ({
      ...r,
      desc: r.descripcion,
      estado: "PENDIENTE"
    }));
}

function verLpnsAntiguos() {
  verLpnsSinActivo();
}

function verLpnsSinActivo() {
  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <h2>LPNs sin activo</h2>
      <div class="filters">
        <input class="search" id="filtroSinActivo" placeholder="Buscar LPN, codigo, descripcion o ubicacion..." oninput="renderLpnsSinActivo()">
      </div>
    </div>
    <div id="sinActivoKpis"></div>
    <div id="sinActivoTablas"></div>
    <div id="modalLpnsSinActivo" class="modal-backdrop" hidden></div>
  `;
  renderLpnsSinActivo();
}

function filtrarDetalleSinActivo(data, q) {
  if (!q) return data;
  return data.filter(r => [r.lpn, r.codigo, r.codigoAlt, r.descripcion, r.ubicacion, r.grupo].join(" ").toLowerCase().includes(q));
}

function filtrarResumenSinActivo(data, q) {
  if (!q) return data;
  return data
    .map(item => {
      const detalle = filtrarDetalleSinActivo(item.detalle, q);
      if (!detalle.length && ![item.codigo, item.codigoAlt, item.descripcion, item.grupo, item.ubicacion].join(" ").toLowerCase().includes(q)) return null;
      return detalle.length ? resumenLpnsSinActivo(detalle, Boolean(item.ubicacion))[0] : item;
    })
    .filter(Boolean);
}

function renderLpnsSinActivo() {
  const q = limpiar(document.getElementById("filtroSinActivo")?.value).toLowerCase();
  const datos = datosLpnsSinActivo();
  const general = filtrarResumenSinActivo(datos.general, q);
  const sinReserva = filtrarResumenSinActivo(datos.sinReserva, q);
  const conReserva = filtrarResumenSinActivo(datos.conReserva, q);
  const totalBultos = datos.base.reduce((a, b) => a + b.bultos, 0);
  const totalUnidades = datos.base.reduce((a, b) => a + b.unidades, 0);

  detalleLpnsSinActivo = new Map();
  [...general, ...sinReserva, ...conReserva].forEach(item => detalleLpnsSinActivo.set(item.key, item));

  document.getElementById("sinActivoKpis").innerHTML = `
    <section class="kpi-grid compact">
      ${kpi("Productos sin activo", fmt(new Set(datos.base.map(r => r.codigo)).size))}
      ${kpi("LPNs", fmt(new Set(datos.base.map(r => r.lpn)).size))}
      ${kpi("Bultos", fmt(totalBultos))}
      ${kpi("Unidades", fmt(totalUnidades))}
      ${kpi("Con reserva MASS", fmt(datos.conReserva.length))}
    </section>
  `;

  document.getElementById("sinActivoTablas").innerHTML = `
    ${seccionResumenSinActivo("Productos sin ubicacion activa", "tablaSinActivoGeneral", general, "sin_activo_general", true)}
    ${seccionResumenSinActivo("Sin activo y sin reserva MASS", "tablaSinActivoSinReserva", sinReserva, "sin_activo_sin_reserva")}
    ${seccionResumenSinActivo("Sin activo pero con reserva MASS", "tablaSinActivoConReserva", conReserva, "sin_activo_con_reserva")}
  `;
}

function seccionResumenSinActivo(titulo, tablaId, data, nombreExcel, mostrarGrupo = false) {
  const detalle = data.flatMap(r => r.detalle);
  return `
    <section class="card subcard">
      <div class="section-head">
        <div><h2>${htmlSeguro(titulo)}</h2></div>
        <div class="filters">
          <span class="badge">${fmt(data.length)} productos</span>
          <button onclick="exportarTablaVisible('${tablaId}', '${nombreExcel}_resumen')">Excel resumen</button>
          <button onclick="exportarDetalleLpnsSinActivo('${nombreExcel}_detalle', ${argumentoSeguro(JSON.stringify(detalle))})">Excel detalle</button>
        </div>
      </div>
      ${tablaResumenSinActivo(tablaId, data, mostrarGrupo)}
    </section>
  `;
}

function tablaResumenSinActivo(id, data, mostrarGrupo = false) {
  const headers = mostrarGrupo
    ? ["Grupo", "Ubicacion", "LPN analizado", "Cod alternativo", "Codigo", "Descripcion", "LPNs", "Bultos", "Unidades", "Max antiguedad", "Ver"]
    : ["LPN analizado", "Cod alternativo", "Codigo", "Descripcion", "LPNs", "Bultos", "Unidades", "Max antiguedad", "Ver"];
  return tablaConId(id, headers, data.map(item => {
    const key = item.key;
    const lpnsTexto = lpnsResumenTexto(item.lpnsLista);
    return `
      <tr class="${item.maxAntiguedad >= 7 ? "bad" : item.maxAntiguedad >= 3 ? "warn" : ""}">
        ${mostrarGrupo ? `<td><strong>${htmlSeguro(item.grupo)}</strong></td>` : ""}
        ${mostrarGrupo ? `<td>${htmlSeguro(item.ubicacion)}</td>` : ""}
        <td><strong title="${htmlSeguro((item.lpnsLista || []).join(", "))}">${htmlSeguro(lpnsTexto)}</strong></td>
        <td>${htmlSeguro(item.codigoAlt)}</td>
        <td>${htmlSeguro(item.codigo)}</td>
        <td>${htmlSeguro(item.descripcion)}</td>
        <td class="number">${fmt(item.cantidadLpns)}</td>
        <td class="number"><strong>${fmt(item.bultos)}</strong></td>
        <td class="number">${fmt(item.unidades)}</td>
        <td class="number">${fmt(item.maxAntiguedad)}</td>
        <td><button class="compact" onclick="abrirDetalleLpnsSinActivo(${argumentoSeguro(key)})">Ver</button></td>
      </tr>
    `;
  }), "Sin productos para mostrar.");
}

function lpnsResumenTexto(lpns) {
  const lista = Array.isArray(lpns) ? lpns.filter(Boolean) : [];
  if (!lista.length) return "";
  if (lista.length <= 3) return lista.join(", ");
  return `${lista.slice(0, 3).join(", ")} (+${lista.length - 3})`;
}

function tablaDetalleLpnsSinActivo(id, data) {
  return tablaConId(id, ["LPN", "Cod alternativo", "Codigo", "Descripcion", "Ubicacion", "Grupo", "Estado", "Bultos", "Unidades", "Fecha", "Antiguedad"], data
    .slice()
    .sort((a, b) => b.antiguedad - a.antiguedad || b.bultos - a.bultos || a.ubicacion.localeCompare(b.ubicacion))
    .map(r => `
      <tr class="${r.antiguedad >= 7 ? "bad" : r.antiguedad >= 3 ? "warn" : ""}">
        <td><strong>${htmlSeguro(r.lpn)}</strong></td>
        <td>${htmlSeguro(r.codigoAlt)}</td>
        <td>${htmlSeguro(r.codigo)}</td>
        <td>${htmlSeguro(r.descripcion)}</td>
        <td>${htmlSeguro(r.ubicacion)}</td>
        <td>${htmlSeguro(r.grupo)}</td>
        <td>${htmlSeguro(r.estado)}</td>
        <td class="number">${fmt(r.bultos)}</td>
        <td class="number">${fmt(r.unidades)}</td>
        <td>${htmlSeguro(r.fecha)}</td>
        <td class="number">${fmt(r.antiguedad)}</td>
      </tr>
    `), "Sin detalle para mostrar.");
}

function abrirDetalleLpnsSinActivo(key) {
  const detalle = detalleLpnsSinActivo.get(String(key));
  const destino = document.getElementById("modalLpnsSinActivo");
  if (!destino) return;
  if (!detalle) {
    destino.innerHTML = `<div class="modal-card"><button class="ghost" onclick="cerrarDetalleLpnsSinActivo()">Cerrar</button><p>Sin detalle.</p></div>`;
  } else {
    destino.innerHTML = `
      <div class="modal-card">
        <div class="section-head">
          <div>
            <h2>${htmlSeguro(detalle.descripcion)}</h2>
            <p class="muted-note">${htmlSeguro(detalle.codigo)} | ${fmt(detalle.cantidadLpns)} LPNs | ${fmt(detalle.bultos)} bultos | ${fmt(detalle.unidades)} unidades</p>
          </div>
          <div class="filters">
            <button onclick="exportarTablaVisible('tablaDetalleLpnsSinActivo', 'detalle_lpns_sin_activo')">Excel detalle</button>
            <button class="ghost" onclick="cerrarDetalleLpnsSinActivo()">Cerrar</button>
          </div>
        </div>
        ${tablaDetalleLpnsSinActivo("tablaDetalleLpnsSinActivo", detalle.detalle)}
      </div>
    `;
  }
  destino.hidden = false;
}

function cerrarDetalleLpnsSinActivo() {
  const destino = document.getElementById("modalLpnsSinActivo");
  if (!destino) return;
  destino.hidden = true;
  destino.innerHTML = "";
}

function exportarDetalleLpnsSinActivo(nombre, payload) {
  let data = [];
  try { data = JSON.parse(payload || "[]"); } catch {}
  if (!data.length) return alert("No hay detalle para exportar");
  const html = `
    <table border="1">
      <tr>
        <th>LPN</th>
        <th>COD ALTERNATIVO</th>
        <th>CODIGO</th>
        <th>DESCRIPCION</th>
        <th>UBICACION</th>
        <th>GRUPO</th>
        <th>ESTADO</th>
        <th>BULTOS</th>
        <th>UNIDADES</th>
        <th>FECHA</th>
        <th>ANTIGUEDAD</th>
      </tr>
      ${data.map(r => `
        <tr>
          ${excelCellText(r.lpn)}
          ${excelCellText(r.codigoAlt)}
          ${excelCellText(r.codigo)}
          <td>${htmlSeguro(r.descripcion)}</td>
          <td>${htmlSeguro(r.ubicacion)}</td>
          <td>${htmlSeguro(r.grupo)}</td>
          <td>${htmlSeguro(r.estado)}</td>
          <td>${fmt(r.bultos)}</td>
          <td>${fmt(r.unidades)}</td>
          <td>${htmlSeguro(r.fecha)}</td>
          <td>${fmt(r.antiguedad)}</td>
        </tr>
      `).join("")}
    </table>
  `;
  descargarExcel(nombre, html);
}

function grupoLpnControlUbicacion(ubicacion) {
  const ubi = limpiar(ubicacion).toUpperCase();
  if (!ubi) return "BLANCO";
  if (ubi.startsWith("DROP-BUFR")) return "BUFFER";
  if (ubi.startsWith("DROP-STOCK-DESBLOQ-962")) return "DROP-STOCK DESBLOQ";
  if (ubi.startsWith("DROP-STOCK")) return "DROP-STOCK";
  if (ubi.startsWith("RAMPA-")) return "RAMPA";
  if (ubi.startsWith("MASS-")) return "RESERVA MASS";
  return "";
}

function esGrupoPisoOperativo(grupo) {
  return ["BLANCO", "BUFFER", "DROP-STOCK DESBLOQ", "DROP-STOCK", "RAMPA"].includes(limpiar(grupo).toUpperCase());
}

function esGrupoLpnControl(ubicacion) {
  return esGrupoPisoOperativo(grupoLpnControlUbicacion(ubicacion));
}

function normalizarLpnControl(row) {
  const codigo = normalizar(campo(row, ["CODIGO", "PRODUCTO"]));
  const ubicacionRaw = limpiar(campo(row, ["UBICACION", "Ubicacion"]));
  return {
    lpn: limpiar(campo(row, ["LPN", "NRO LPN", "NRO_LPN"])),
    codigo,
    codigoAlt: codigoAlternativoProducto(codigo, row),
    descripcion: descripcionProducto(codigo, row),
    ubicacion: ubicacionRaw || "BLANCO",
    grupo: grupoLpnControlUbicacion(ubicacionRaw),
    estado: limpiar(campo(row, ["ESTADO", "Estado"])),
    stock: num(campo(row, ["BULTOS", "Bultos"])),
    unidades: unidadesLpn(row),
    antiguedad: antiguedadLpn(row)
  };
}

function lpnsControlOperativo() {
  const vistos = new Map();
  lpnsOperativos()
    .map(normalizarLpnControl)
    .filter(r => r.codigo && r.lpn && esGrupoPisoOperativo(r.grupo))
    .forEach(r => {
      const key = `${r.lpn}|${r.codigo}|${r.ubicacion}`;
      if (!vistos.has(key)) vistos.set(key, { ...r });
      else {
        const actual = vistos.get(key);
        actual.stock += r.stock;
        actual.unidades += r.unidades;
        actual.antiguedad = Math.max(actual.antiguedad, r.antiguedad);
      }
    });
  return Array.from(vistos.values())
    .sort((a, b) => a.grupo.localeCompare(b.grupo) || ordenarUbicacion(a.ubicacion, b.ubicacion) || b.stock - a.stock);
}

function detalleActivoProducto(codigo) {
  return dataInventario
    .filter(r => normalizar(campo(r, ["PRODUCTO", "CODIGO"])) === codigo)
    .map(r => {
      const uxb = num(campo(r, ["UXB", "Uxb"])) || num(campo(productoPorCodigo(codigo) || {}, ["UXB", "Uxb"])) || 1;
      const unidades = num(campo(r, ["UNACT", "UnAct", "UN ACT"]));
      const asignado = num(campo(r, ["UNI_ASIG", "Un Asig", "UN ASIG", "UNIDADES ASIGNADAS"]));
      const transito = num(r["En las Unidades de TrÃ¡nsito"]);
      const disponibleUnidades = Math.max(0, unidades - asignado - transito);
      const disponibleBultos = uxb ? disponibleUnidades / uxb : disponibleUnidades;
      const bultos = num(campo(r, ["BULTOS", "DISPONIBLE-BULTOS"])) || (uxb ? unidades / uxb : unidades);
      return {
        ubicacion: limpiar(campo(r, ["UBICACION", "Ubicacion"])) || "SIN UBICACION",
        codigo,
        codigoAlt: codigoAlternativoProducto(codigo, r),
        descripcion: descripcionProducto(codigo, r),
        asignado,
        transito,
        uxb,
        unidades,
        bultos,
        disponibleUnidades,
        disponibleBultos
      };
    })
    .filter(r => r.ubicacion && (r.unidades > 0 || r.bultos > 0))
    .sort((a, b) => ordenarUbicacion(a.ubicacion, b.ubicacion) || b.bultos - a.bultos);
}

function disponibilidadActivoRow(row) {
  const uxb = num(campo(row, ["UXB", "Uxb"])) || num(campo(productoPorCodigo(normalizar(campo(row, ["PRODUCTO", "CODIGO"]))) || {}, ["UXB", "Uxb"])) || 1;
  const unact = num(campo(row, ["UNACT", "UnAct", "UN ACT"]));
  const asignado = num(campo(row, ["UNI_ASIG", "Un Asig", "UN ASIG", "UNIDADES ASIGNADAS"]));
  const transito = num(row["En las Unidades de TrÃ¡nsito"]);
  const disponibleUnd = Math.max(0, uniMax - (unact + transito));
  return {
    unact,
    asignado,
    transito,
    uxb,
    disponibleUnd,
    disponibleBul: uxb ? disponibleUnd / uxb : disponibleUnd
  };
}

function detalleReservaProducto(codigo) {
  const vistos = new Map();
  lpnsOperativos()
    .map(normalizarLpnControl)
    .filter(r => r.codigo === codigo && r.grupo === "RESERVA MASS")
    .forEach(r => {
      const key = `${r.lpn}|${r.codigo}|${r.ubicacion}`;
      if (!vistos.has(key)) vistos.set(key, { ...r });
      else {
        const actual = vistos.get(key);
        actual.stock += r.stock;
        actual.unidades += r.unidades;
        actual.antiguedad = Math.max(actual.antiguedad, r.antiguedad);
      }
    });
  return Array.from(vistos.values())
    .sort((a, b) => ordenarUbicacion(a.ubicacion, b.ubicacion) || b.stock - a.stock);
}

function disponibilidadActivoRow(row) {
  const codigo = normalizar(campo(row, ["PRODUCTO", "CODIGO"]));
  const uxb = num(campo(row, ["UXB", "Uxb"])) || num(campo(productoPorCodigo(codigo) || {}, ["UXB", "Uxb"])) || 1;
  const uniMax = num(campo(row, ["UNI_MAX"]));
  const unact = num(campo(row, ["UNACT", "UnAct", "UN ACT"]));
  const asignado = num(campo(row, ["UNI_ASIG", "Un Asig", "UN ASIG", "UNIDADES ASIGNADAS"]));
  const transito = num(row["En las Unidades de TrÃ¡nsito"]);
  const disponibleUnd = Math.max(0, unact - asignado - transito);
  return {
    uniMax,
    unact,
    asignado,
    transito,
    uxb,
    disponibleUnd,
    disponibleBul: uxb ? disponibleUnd / uxb : disponibleUnd
  };
}

function disponibilidadActivoRow(row) {
  const codigo = normalizar(campo(row, ["PRODUCTO", "CODIGO"]));
  const uxb = num(campo(row, ["UXB", "Uxb"])) || num(campo(productoPorCodigo(codigo) || {}, ["UXB", "Uxb"])) || 1;
  const uniMax = num(campo(row, ["UNI_MAX"]));
  const unact = num(campo(row, ["UNACT", "UnAct", "UN ACT"]));
  const asignado = num(campo(row, ["UNI_ASIG", "Un Asig", "UN ASIG", "UNIDADES ASIGNADAS"]));
  const transito = num(row["En las Unidades de TrÃ¡nsito"]);
  const disponibleUnd = Math.max(0, uniMax - (unact + transito));
  return {
    uniMax,
    unact,
    asignado,
    transito,
    uxb,
    disponibleUnd,
    disponibleBul: uxb ? disponibleUnd / uxb : disponibleUnd
  };
}

function disponibilidadActivoRow(row) {
  const codigo = normalizar(campo(row, ["PRODUCTO", "CODIGO"]));
  const uxb = num(campo(row, ["UXB", "Uxb"])) || num(campo(productoPorCodigo(codigo) || {}, ["UXB", "Uxb"])) || 1;
  const uniMax = num(campo(row, ["UNI_MAX"]));
  const unact = num(campo(row, ["UNACT", "UnAct", "UN ACT"]));
  const asignado = num(campo(row, ["UNI_ASIG", "Un Asig", "UN ASIG", "UNIDADES ASIGNADAS"]));
  const transito = num(campo(row, ["En las Unidades de TrÃ¡nsito", "En las Unidades de TrÃƒÂ¡nsito"]));
  const disponible = disponibilidadPorCapacidad(uniMax, unact, transito, uxb);
  return {
    uniMax,
    capacidadDinamica: disponible.dinamica,
    unact,
    asignado,
    transito,
    uxb,
    disponibleUnd: disponible.disponibleUnd,
    disponibleBul: disponible.disponibleBul
  };
}

function keyCacheLpnsUbicacion() {
  return [
    dataLPN.length,
    limpiar(dataLPN[0]?.LPN),
    limpiar(dataLPN[dataLPN.length - 1]?.LPN),
    dataInventario.length,
    limpiar(dataInventario[0]?.PRODUCTO),
    limpiar(dataInventario[dataInventario.length - 1]?.PRODUCTO),
    dataProductos.length
  ].join("|");
}

function indicesLpnsUbicacion() {
  const key = keyCacheLpnsUbicacion();
  if (cacheLpnsUbicacion.key === key) return cacheLpnsUbicacion;

  const vistos = new Map();
  lpnsOperativos()
    .map(normalizarLpnControl)
    .filter(r => r.codigo && r.lpn && esGrupoPisoOperativo(r.grupo))
    .forEach(r => {
      const itemKey = `${r.lpn}|${r.codigo}|${r.ubicacion}`;
      if (!vistos.has(itemKey)) vistos.set(itemKey, { ...r });
      else {
        const actual = vistos.get(itemKey);
        actual.stock += r.stock;
        actual.unidades += r.unidades;
        actual.antiguedad = Math.max(actual.antiguedad, r.antiguedad);
      }
    });
  const control = Array.from(vistos.values())
    .sort((a, b) => a.grupo.localeCompare(b.grupo) || ordenarUbicacion(a.ubicacion, b.ubicacion) || b.stock - a.stock);

  const activo = new Map();
  const activoAgrupado = new Map();
  dataInventario.forEach(row => {
    const codigo = normalizar(campo(row, ["PRODUCTO", "CODIGO"]));
    if (!codigo) return;
    const ubicacion = limpiar(campo(row, ["UBICACION", "Ubicacion"]));
    if (!ubicacion) return;
    const disp = disponibilidadActivoRow(row);
    const bultos = num(campo(row, ["BULTOS", "DISPONIBLE-BULTOS"])) || (disp.uxb ? disp.unact / disp.uxb : disp.unact);
    const itemKey = `${codigo}|${ubicacion}`;
    if (!activoAgrupado.has(itemKey)) {
      activoAgrupado.set(itemKey, {
        ubicacion,
        codigo,
        codigoAlt: codigoAlternativoProducto(codigo, row),
        descripcion: descripcionProducto(codigo, row),
        uniMax: disp.uniMax,
        capacidadDinamica: disp.capacidadDinamica,
        asignado: 0,
        transito: 0,
        uxb: disp.uxb,
        unidades: 0,
        bultos: 0,
        disponibleUnidades: 0,
        disponibleBultos: 0
      });
    }
    const item = activoAgrupado.get(itemKey);
    item.uniMax = Math.max(item.uniMax, disp.uniMax);
    item.capacidadDinamica = item.capacidadDinamica || disp.capacidadDinamica;
    item.asignado += disp.asignado;
    item.transito += disp.transito;
    item.unidades += disp.unact;
    item.bultos += bultos;
  });
  activoAgrupado.forEach(item => {
    const disponible = disponibilidadPorCapacidad(item.capacidadDinamica ? 0 : item.uniMax, item.unidades, item.transito, item.uxb);
    item.disponibleUnidades = disponible.disponibleUnd;
    item.disponibleBultos = disponible.disponibleBul;
    if (!activo.has(item.codigo)) activo.set(item.codigo, []);
    activo.get(item.codigo).push(item);
  });
  activo.forEach(rows => rows.sort((a, b) => ordenarUbicacion(a.ubicacion, b.ubicacion) || b.bultos - a.bultos));

  const reservaVistos = new Map();
  lpnsOperativos()
    .map(normalizarLpnControl)
    .filter(r => r.codigo && r.grupo === "RESERVA MASS")
    .forEach(r => {
      const itemKey = `${r.lpn}|${r.codigo}|${r.ubicacion}`;
      if (!reservaVistos.has(itemKey)) reservaVistos.set(itemKey, { ...r });
      else {
        const actual = reservaVistos.get(itemKey);
        actual.stock += r.stock;
        actual.unidades += r.unidades;
        actual.antiguedad = Math.max(actual.antiguedad, r.antiguedad);
      }
    });
  const reserva = new Map();
  reservaVistos.forEach(row => {
    if (!reserva.has(row.codigo)) reserva.set(row.codigo, []);
    reserva.get(row.codigo).push(row);
  });
  reserva.forEach(rows => rows.sort((a, b) => ordenarUbicacion(a.ubicacion, b.ubicacion) || b.stock - a.stock));

  cacheLpnsUbicacion = { key, control, activo, reserva };
  return cacheLpnsUbicacion;
}

function lpnsControlOperativo() {
  return indicesLpnsUbicacion().control;
}

function detalleActivoProducto(codigo) {
  return indicesLpnsUbicacion().activo.get(codigo) || [];
}

function detalleReservaProducto(codigo) {
  return indicesLpnsUbicacion().reserva.get(codigo) || [];
}

function tieneActivoProducto(codigo) {
  return detalleActivoProducto(codigo).length > 0;
}

function tieneReservaProducto(codigo) {
  return detalleReservaProducto(codigo).length > 0;
}

function calcularLpnsAntiguos() {
  return lpnsControlOperativo().map(r => ({
    ...r,
    bultos: r.stock,
    desc: r.descripcion,
    estado: "PENDIENTE"
  }));
}

function verLpnsAntiguos() {
  verLpnsSinActivo();
}

function verLpnsSinActivo() {
  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <h2>LPNs operativos por ubicacion</h2>
      <div class="filters">
        <input class="search" id="filtroSinActivo" placeholder="Buscar LPN, codigo, descripcion o ubicacion..." oninput="programarRenderLpnsSinActivo()">
      </div>
    </div>
    <div id="sinActivoKpis"></div>
    <div id="sinActivoTablas"></div>
    <div id="modalLpnsSinActivo" class="modal-backdrop" hidden></div>
  `;
  renderLpnsSinActivo();
}

function programarRenderLpnsSinActivo() {
  clearTimeout(timerRenderLpnsUbicacion);
  timerRenderLpnsUbicacion = setTimeout(renderLpnsSinActivo, 120);
}

function filtrarLpnsControl(data, q) {
  if (!q) return data;
  return data.filter(r => [r.grupo, r.ubicacion, r.codigoAlt, r.codigo, r.descripcion, r.lpn].join(" ").toLowerCase().includes(q));
}

function renderLpnsSinActivo() {
  const q = limpiar(document.getElementById("filtroSinActivo")?.value).toLowerCase();
  const base = lpnsControlOperativo();
  const data = filtrarLpnsControl(base, q);
  const grupos = ["BLANCO", "BUFFER", "DROP-STOCK DESBLOQ", "DROP-STOCK", "RAMPA"];
  const sinActivoNiReserva = data.filter(r => !tieneActivoProducto(r.codigo) && !tieneReservaProducto(r.codigo));

  document.getElementById("sinActivoKpis").innerHTML = `
    <section class="kpi-grid compact">
      ${kpi("LPNs analizados", fmt(data.length))}
      ${kpi("Productos", fmt(new Set(data.map(r => r.codigo)).size))}
      ${kpi("Stock bultos", fmt(data.reduce((a, b) => a + b.stock, 0)))}
      ${kpi("Sin activo ni reserva", fmt(sinActivoNiReserva.length))}
    </section>
  `;

  document.getElementById("sinActivoTablas").innerHTML = `
    <section class="card subcard">
      <div class="section-head">
        <div>
          <h2>Exportes de analisis</h2>
        </div>
        <div class="filters">
          <button onclick="exportarLpnsControlTresHojas()">Excel 3 hojas</button>
        </div>
      </div>
    </section>
    ${grupos.map(grupo => tablaLpnControlPorGrupo(grupo, data.filter(r => r.grupo === grupo))).join("")}
    ${tablaLpnControlPorGrupo("SIN ACTIVO NI RESERVA", sinActivoNiReserva, "lpns_sin_activo_ni_reserva")}
  `;
}

function tablaLpnControlPorGrupo(titulo, data, nombreExcel = "") {
  const tablaId = `tablaLpnControl_${titulo.replace(/[^A-Z0-9]+/gi, "_")}`;
  return `
    <section class="card subcard">
      <div class="section-head">
        <div>
          <h2>${htmlSeguro(titulo)}</h2>
        </div>
        <div class="filters">
          <span class="badge">${fmt(data.length)} LPNs</span>
          <button onclick="exportarTablaVisible('${tablaId}', '${nombreExcel || titulo.toLowerCase().replace(/[^a-z0-9]+/g, "_")}')">Excel</button>
        </div>
      </div>
      ${tablaLpnControl(tablaId, data)}
    </section>
  `;
}

function tablaLpnControl(tablaId, data) {
  return tablaConId(tablaId, ["Ubicacion", "Cod alternativo", "Codigo", "Descripcion", "LPN", "Stock", "Unidades", "Antiguedad", "Activo", "Reserva"], data.map(r => `
    <tr class="${r.antiguedad >= 7 ? "bad" : r.antiguedad >= 3 ? "warn" : ""}">
      <td><strong>${htmlSeguro(r.ubicacion)}</strong></td>
      <td>${htmlSeguro(r.codigoAlt)}</td>
      <td>${htmlSeguro(r.codigo)}</td>
      <td>${htmlSeguro(r.descripcion)}</td>
      <td><strong>${htmlSeguro(r.lpn)}</strong></td>
      <td class="number"><strong>${fmt(r.stock)}</strong></td>
      <td class="number">${fmt(r.unidades)}</td>
      <td class="number">${fmt(r.antiguedad)}</td>
      <td><button class="compact" onclick="abrirDetalleProductoLpn(${argumentoSeguro(r.codigo)}, 'activo')">Activo</button></td>
      <td><button class="compact" onclick="abrirDetalleProductoLpn(${argumentoSeguro(r.codigo)}, 'reserva')">Reserva</button></td>
    </tr>
  `), "Sin LPNs para mostrar.");
}

function abrirDetalleProductoLpn(codigo, tipo) {
  const destino = document.getElementById("modalLpnsSinActivo");
  if (!destino) return;
  const prod = productoPorCodigo(codigo) || {};
  const descripcion = descripcionProducto(codigo, prod);
  const data = tipo === "activo" ? detalleActivoProducto(codigo) : detalleReservaProducto(codigo);
  const titulo = tipo === "activo" ? "Ubicaciones en activo" : "Ubicaciones en reserva MASS";

  destino.innerHTML = `
    <div class="modal-card">
      <div class="section-head">
        <div>
          <h2>${htmlSeguro(titulo)}</h2>
          <p class="muted-note">${htmlSeguro(codigo)} | ${htmlSeguro(descripcion)}</p>
        </div>
        <div class="filters">
          <button onclick="exportarTablaVisible('tablaDetalleProductoLpn', 'detalle_${tipo}_${codigo}')">Excel</button>
          <button class="ghost" onclick="cerrarDetalleLpnsSinActivo()">Cerrar</button>
        </div>
      </div>
      ${tipo === "activo" ? tablaDetalleActivoProducto(data) : tablaDetalleReservaProducto(data)}
    </div>
  `;
  destino.hidden = false;
}

function tablaDetalleActivoProducto(data) {
  return tablaConId("tablaDetalleProductoLpn", ["Ubicacion activo", "Cod alternativo", "Codigo", "Descripcion", "Bultos", "Unidades", "Asignado", "Transito", "Disp. unidades", "Disp. bultos"], data.map(r => `
    <tr>
      <td><strong>${htmlSeguro(r.ubicacion)}</strong></td>
      <td>${htmlSeguro(r.codigoAlt)}</td>
      <td>${htmlSeguro(r.codigo)}</td>
      <td>${htmlSeguro(r.descripcion)}</td>
      <td class="number"><strong>${fmt(r.bultos)}</strong></td>
      <td class="number">${fmt(r.unidades)}</td>
      <td class="number">${fmt(r.asignado)}</td>
      <td class="number">${fmt(r.transito)}</td>
      <td class="number"><strong>${fmtDisponibilidad(r.disponibleUnidades, r.capacidadDinamica)}</strong></td>
      <td class="number"><strong>${fmtDisponibilidad(r.disponibleBultos, r.capacidadDinamica)}</strong></td>
    </tr>
  `), "Este producto no tiene ubicacion activa con stock.");
}

function tablaDetalleReservaProducto(data) {
  return tablaConId("tablaDetalleProductoLpn", ["Ubicacion reserva", "LPN", "Cod alternativo", "Codigo", "Descripcion", "Stock", "Unidades", "Antiguedad"], data.map(r => `
    <tr class="${r.antiguedad >= 7 ? "bad" : r.antiguedad >= 3 ? "warn" : ""}">
      <td><strong>${htmlSeguro(r.ubicacion)}</strong></td>
      <td><strong>${htmlSeguro(r.lpn)}</strong></td>
      <td>${htmlSeguro(r.codigoAlt)}</td>
      <td>${htmlSeguro(r.codigo)}</td>
      <td>${htmlSeguro(r.descripcion)}</td>
      <td class="number"><strong>${fmt(r.stock)}</strong></td>
      <td class="number">${fmt(r.unidades)}</td>
      <td class="number">${fmt(r.antiguedad)}</td>
    </tr>
  `), "Este producto no tiene LPNs en reserva MASS.");
}

function lpnsControlFiltradosActuales() {
  const q = limpiar(document.getElementById("filtroSinActivo")?.value).toLowerCase();
  return filtrarLpnsControl(lpnsControlOperativo(), q);
}

function filasPrincipalLpnsControl(base) {
  return [
    ["UBICACION", "GRUPO", "COD ALTERNATIVO", "CODIGO", "DESCRIPCION", "LPN", "STOCK", "UNIDADES", "ANTIGUEDAD"],
    ...base.map(r => [
      r.ubicacion,
      r.grupo,
      r.codigoAlt,
      r.codigo,
      r.descripcion,
      r.lpn,
      r.stock,
      r.unidades,
      r.antiguedad
    ])
  ];
}

function filasActivoLpnsControl(base) {
  const filas = [[
    "UBICACION ORIGEN",
    "GRUPO ORIGEN",
    "LPN ORIGEN",
    "STOCK ORIGEN",
    "UNIDADES ORIGEN",
    "ANTIGUEDAD LPN",
    "COD ALTERNATIVO",
    "CODIGO",
    "DESCRIPCION",
    "UBICACION ACTIVO",
    "BULTOS ACTIVO",
    "UNIDADES ACTIVO",
    "ASIGNADO ACTIVO",
    "TRANSITO ACTIVO",
    "DISPONIBLE UNIDADES",
    "DISPONIBLE BULTOS"
  ]];

  base.forEach(origen => {
    detalleActivoProducto(origen.codigo).forEach(destino => {
      filas.push([
        origen.ubicacion,
        origen.grupo,
        origen.lpn,
        origen.stock,
        origen.unidades,
        origen.antiguedad,
        origen.codigoAlt,
        origen.codigo,
        origen.descripcion,
        destino.ubicacion,
        destino.bultos,
        destino.unidades,
        destino.asignado,
        destino.transito,
        fmtDisponibilidad(destino.disponibleUnidades, destino.capacidadDinamica),
        fmtDisponibilidad(destino.disponibleBultos, destino.capacidadDinamica)
      ]);
    });
  });

  return filas;
}

function filasReservaLpnsControl(base) {
  const filas = [[
    "UBICACION ORIGEN",
    "GRUPO ORIGEN",
    "LPN ORIGEN",
    "STOCK ORIGEN",
    "UNIDADES ORIGEN",
    "ANTIGUEDAD ORIGEN",
    "COD ALTERNATIVO",
    "CODIGO",
    "DESCRIPCION",
    "UBICACION RESERVA",
    "LPN RESERVA",
    "STOCK RESERVA",
    "UNIDADES RESERVA",
    "ANTIGUEDAD RESERVA"
  ]];

  base.forEach(origen => {
    detalleReservaProducto(origen.codigo).forEach(destino => {
      filas.push([
        origen.ubicacion,
        origen.grupo,
        origen.lpn,
        origen.stock,
        origen.unidades,
        origen.antiguedad,
        origen.codigoAlt,
        origen.codigo,
        origen.descripcion,
        destino.ubicacion,
        destino.lpn,
        destino.stock,
        destino.unidades,
        destino.antiguedad
      ]);
    });
  });

  return filas;
}

function exportarLpnsControlTresHojas() {
  const base = lpnsControlFiltradosActuales();
  if (!base.length) return alert("No hay LPNs visibles para exportar.");
  descargarExcelHojas("lpns_por_ubicacion_analisis", [
    { nombre: "Principal", filas: filasPrincipalLpnsControl(base) },
    { nombre: "Con activo", filas: filasActivoLpnsControl(base) },
    { nombre: "Con reserva", filas: filasReservaLpnsControl(base) }
  ]);
}

function consolidarControlPisoPorLpnProducto(data = lpnsControlOperativo()) {
  const mapa = new Map();
  data.forEach(r => {
    const key = `${normalizar(r.lpn)}|${normalizar(r.codigo)}`;
    if (!key || key === "|") return;
    if (!mapa.has(key)) {
      mapa.set(key, {
        ...r,
        ubicaciones: new Set([r.ubicacion].filter(Boolean)),
        grupos: new Set([r.grupo].filter(Boolean))
      });
      return;
    }
    const item = mapa.get(key);
    item.stock += num(r.stock);
    item.unidades += num(r.unidades);
    item.antiguedad = Math.max(item.antiguedad, num(r.antiguedad));
    item.ubicaciones.add(r.ubicacion);
    item.grupos.add(r.grupo);
    item.ubicacion = Array.from(item.ubicaciones).sort(ordenarUbicacion).join(", ");
    item.grupo = Array.from(item.grupos).sort().join(" / ");
  });
  return Array.from(mapa.values())
    .sort((a, b) => b.antiguedad - a.antiguedad || a.grupo.localeCompare(b.grupo) || ordenarUbicacion(a.ubicacion, b.ubicacion));
}

function activoDisponibleParaLpn(row) {
  return detalleActivoProducto(row.codigo)
    .map(a => ({
      ...a,
      ingresa: a.capacidadDinamica || num(a.disponibleUnidades) >= num(row.unidades),
      faltaUnidades: a.capacidadDinamica ? 0 : Math.max(0, num(row.unidades) - num(a.disponibleUnidades)),
      faltaBultos: a.capacidadDinamica ? 0 : Math.max(0, num(row.stock) - num(a.disponibleBultos))
    }))
    .sort((a, b) => Number(b.ingresa) - Number(a.ingresa) || b.disponibleUnidades - a.disponibleUnidades || ordenarUbicacion(a.ubicacion, b.ubicacion));
}

function reservaDisponibleParaLpn(row) {
  return detalleReservaProducto(row.codigo)
    .filter(r => normalizar(r.lpn) !== normalizar(row.lpn))
    .sort((a, b) => ordenarUbicacion(a.ubicacion, b.ubicacion) || b.stock - a.stock);
}

function decisionControlPiso(row) {
  const activo = activoDisponibleParaLpn(row);
  const reserva = reservaDisponibleParaLpn(row);
  if (activo.some(a => a.ingresa)) return "Ingresar a activo";
  if (activo.length) return "Activo sin capacidad completa";
  if (reserva.length) return "Acoplar en reserva";
  return "Sin activo ni reserva";
}

function enriquecerControlPiso(data = consolidarControlPisoPorLpnProducto()) {
  return data.map(r => {
    const activo = activoDisponibleParaLpn(r);
    const reserva = reservaDisponibleParaLpn(r);
    const decision = decisionControlPiso(r);
    return {
      ...r,
      activoCount: activo.length,
      activoIngresa: activo.filter(a => a.ingresa).length,
      reservaCount: reserva.length,
      decision,
      estadoAntiguedad: num(r.antiguedad) > 1 ? "CRITICO" : "OK"
    };
  });
}

function verControlPiso(tab = "plan") {
  detalleControlPiso = new Map();
  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <div>
        <h2>Control piso / LPN a dividir</h2>
      </div>
      <div class="filters">
        <button class="${tab === "plan" ? "" : "ghost"}" onclick="verControlPiso('plan')">Plan multi piso</button>
        <button class="${tab === "buscar" ? "" : "ghost"}" onclick="verControlPiso('buscar')">Buscar LPN</button>
        <button class="${tab === "reporte" ? "" : "ghost"}" onclick="verControlPiso('reporte')">Reporte piso</button>
      </div>
    </div>
    <div id="controlPisoContenido"></div>
    <div id="modalControlPiso" class="modal-backdrop" hidden></div>
  `;
  if (tab === "reporte") renderReporteControlPiso();
  else if (tab === "plan") renderPlanMultiPiso();
  else renderBuscadorControlPiso();
}

function canonColumnaUbicacion(valor) {
  return limpiar(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Ã³/g, "O")
    .replace(/Ã­/g, "I")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
}

function campoUbicacion(row, nombres) {
  const objetivos = new Set(nombres.map(canonColumnaUbicacion));
  const key = Object.keys(row || {}).find(k => objetivos.has(canonColumnaUbicacion(k)));
  return key ? row[key] : "";
}

function tipoCapacidadUbicacionActiva(row) {
  const tipo = normalizar(campoUbicacion(row, ["Tipo", "TIPO"]));
  if (tipo.includes("ACTIVO")) return "ACTIVO";
  if (tipo.includes("RESERVA")) return "RESERVA";
  return "";
}

function tipoUbicacionActivaDetalle(row) {
  const tipo = limpiar(campoUbicacion(row, [
    "Tipo Ubicac",
    "Tipo Ubicacion",
    "Tipo Ubicación",
    "Tipo UbicaciÃ³n",
    "TIPO_UBICACION",
    "TIPOUBICACION"
  ]));
  if (tipo) return tipo;
  return tipoUbicacion(row);
}

function columnasUbicacionesControl(row) {
  const mascara = limpiar(campoUbicacion(row, ["MASCARA", "Mascara", "Mascara ", "UBICACION", "Ubicacion"]));
  const pasilloRaw = limpiar(campoUbicacion(row, ["Pasi", "PASI", "Pasillo", "PASILLO"])) || pasilloMass(mascara);
  const pasillo = pasilloRaw ? limpiar(pasilloRaw).padStart(2, "0") : "";
  return {
    tipo: tipoCapacidadUbicacionActiva(row),
    zona: limpiar(campoUbicacion(row, [
      "Zona Asignac",
      "ZONA ASIGNAC",
      "Zona Asignacion",
      "Zona Asignación",
      "Zona AsignaciÃ³n",
      "ZONA_ASIGNAC",
      "ZonaAsignac"
    ])) || "SIN ZONA",
    tipoUbicac: tipoUbicacionActivaDetalle(row),
    area: limpiar(campoUbicacion(row, ["Area", "AREA"])),
    pasillo,
    bahia: limpiar(campoUbicacion(row, ["Bah", "BAH", "Bahia", "BAHIA"])),
    nivel: limpiar(campoUbicacion(row, ["Niv", "NIV", "Nivel", "NIVEL"])),
    posicion: limpiar(campoUbicacion(row, ["Posic", "POSIC", "Posicion", "POSICION"])),
    mascara
  };
}

function calcularUbicacionesActivasControl() {
  const key = `v2|${dataUbicaciones.length}|${dataUbicaciones[0] ? Object.keys(dataUbicaciones[0]).join("|") : ""}`;
  if (cacheUbicacionesActivas.key === key && cacheUbicacionesActivas.data) return cacheUbicacionesActivas.data;

  const filas = dataUbicaciones
    .map(columnasUbicacionesControl)
    .filter(row => row.tipo === "ACTIVO")
    .filter(row => row.pasillo && row.pasillo !== "10")
    .sort((a, b) => num(a.pasillo) - num(b.pasillo) || ordenarUbicacion(a.mascara, b.mascara));

  const porPasillo = new Map();
  filas.forEach(row => {
    if (!porPasillo.has(row.pasillo)) {
      porPasillo.set(row.pasillo, {
        pasillo: row.pasillo,
        total: 0,
        zonas: new Map(),
        tipos: new Map(),
        bahias: new Set(),
        niveles: new Set(),
        posiciones: new Set()
      });
    }
    const grupo = porPasillo.get(row.pasillo);
    grupo.total += 1;
    grupo.zonas.set(row.zona, (grupo.zonas.get(row.zona) || 0) + 1);
    grupo.tipos.set(row.tipoUbicac, (grupo.tipos.get(row.tipoUbicac) || 0) + 1);
    if (row.bahia) grupo.bahias.add(row.bahia);
    if (row.nivel) grupo.niveles.add(row.nivel);
    if (row.posicion) grupo.posiciones.add(row.posicion);
  });

  const resumen = Array.from(porPasillo.values())
    .sort((a, b) => num(a.pasillo) - num(b.pasillo))
    .map(grupo => ({
      pasillo: grupo.pasillo,
      total: grupo.total,
      zonas: Array.from(grupo.zonas.entries()).sort((a, b) => b[1] - a[1]),
      tipos: Array.from(grupo.tipos.entries()).sort((a, b) => b[1] - a[1]),
      bahias: grupo.bahias.size,
      niveles: grupo.niveles.size,
      posiciones: grupo.posiciones.size
    }));

  const data = {
    filas,
    resumen,
    total: {
      ubicaciones: filas.length,
      pasillos: resumen.length,
      zonas: new Set(filas.map(row => row.zona)).size,
      tipos: new Set(filas.map(row => row.tipoUbicac)).size
    }
  };
  cacheUbicacionesActivas = { key, data };
  return data;
}

function verUbicacionesControlOperativo() {
  filtrosUbicacionesActivas = { pasillo: "", zona: "", tipo: "", busqueda: "" };
  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <div>
        <h2>Ubicaciones</h2>
      </div>
    </div>
    <div id="controlPisoContenido"></div>
  `;
  renderUbicacionesActivasControl();
}

function renderUbicacionesActivasControl() {
  const contenedor = document.getElementById("controlPisoContenido");
  if (!contenedor) return;

  const data = calcularUbicacionesActivasControl();
  const filtroPasillo = filtrosUbicacionesActivas.pasillo;
  const filtroZona = filtrosUbicacionesActivas.zona;
  const filtroTipo = filtrosUbicacionesActivas.tipo;
  const busqueda = filtrosUbicacionesActivas.busqueda;

  const pasillos = data.resumen.map(row => row.pasillo);
  const zonas = Array.from(new Set(data.filas.map(row => row.zona))).sort();
  const tipos = Array.from(new Set(data.filas.map(row => row.tipoUbicac))).sort();

  const visibles = data.filas.filter(row => {
    if (filtroPasillo && row.pasillo !== filtroPasillo) return false;
    if (filtroZona && row.zona !== filtroZona) return false;
    if (filtroTipo && row.tipoUbicac !== filtroTipo) return false;
    if (busqueda && ![row.mascara, row.area, row.zona, row.tipoUbicac, row.pasillo, row.bahia, row.nivel, row.posicion].join(" ").toLowerCase().includes(busqueda)) return false;
    return true;
  });

  contenedor.innerHTML = `
    <section class="kpi-grid compact">
      ${kpi("Ubicaciones activas", fmt(data.total.ubicaciones))}
      ${kpi("Pasillos", fmt(data.total.pasillos), "sin pasillo 10")}
      ${kpi("Zonas asignac", fmt(data.total.zonas))}
      ${kpi("Tipos ubicac", fmt(data.total.tipos))}
    </section>
    <section class="card subcard">
      <div class="section-head">
        <div>
          <h2>Ubicaciones activas por pasillo</h2>
        </div>
        <div class="filters grow">
          <select id="filtroUbicacionesActivasPasillo" onchange="actualizarFiltrosUbicacionesActivas()">
            <option value="">Todos los pasillos</option>
            ${pasillos.map(p => `<option value="${atributoSeguro(p)}" ${p === filtroPasillo ? "selected" : ""}>Pasillo ${htmlSeguro(p)}</option>`).join("")}
          </select>
          <select id="filtroUbicacionesActivasZona" onchange="actualizarFiltrosUbicacionesActivas()">
            <option value="">Todas las zonas</option>
            ${zonas.map(z => `<option value="${atributoSeguro(z)}" ${z === filtroZona ? "selected" : ""}>${htmlSeguro(z)}</option>`).join("")}
          </select>
          <select id="filtroUbicacionesActivasTipo" onchange="actualizarFiltrosUbicacionesActivas()">
            <option value="">Todos los tipos</option>
            ${tipos.map(t => `<option value="${atributoSeguro(t)}" ${t === filtroTipo ? "selected" : ""}>${htmlSeguro(t)}</option>`).join("")}
          </select>
          <input class="search" id="filtroUbicacionesActivasTexto" value="${atributoSeguro(busqueda)}" placeholder="Buscar mascara, zona, bahia..." oninput="actualizarFiltrosUbicacionesActivasConPausa()">
          <button onclick="exportarUbicacionesActivasControl()">Excel</button>
        </div>
      </div>
      ${tablaResumenUbicacionesActivas(data.resumen)}
    </section>
    <section class="card subcard">
      <div class="section-head">
        <div>
          <h2>Detalle ubicaciones</h2>
        </div>
        <span class="badge">${fmt(visibles.length)} visibles</span>
      </div>
      ${tablaDetalleUbicacionesActivas(visibles)}
    </section>
  `;
}

function actualizarFiltrosUbicacionesActivas() {
  filtrosUbicacionesActivas = {
    pasillo: limpiar(document.getElementById("filtroUbicacionesActivasPasillo")?.value),
    zona: limpiar(document.getElementById("filtroUbicacionesActivasZona")?.value),
    tipo: limpiar(document.getElementById("filtroUbicacionesActivasTipo")?.value),
    busqueda: limpiar(document.getElementById("filtroUbicacionesActivasTexto")?.value).toLowerCase()
  };
  renderUbicacionesActivasControl();
}

function actualizarFiltrosUbicacionesActivasConPausa() {
  clearTimeout(timerUbicacionesActivas);
  filtrosUbicacionesActivas = {
    pasillo: limpiar(document.getElementById("filtroUbicacionesActivasPasillo")?.value),
    zona: limpiar(document.getElementById("filtroUbicacionesActivasZona")?.value),
    tipo: limpiar(document.getElementById("filtroUbicacionesActivasTipo")?.value),
    busqueda: limpiar(document.getElementById("filtroUbicacionesActivasTexto")?.value).toLowerCase()
  };
  timerUbicacionesActivas = setTimeout(renderUbicacionesActivasControl, 180);
}

function textoConteoUbicaciones(items) {
  return items.map(([nombre, cantidad]) => `${nombre}: ${fmt(cantidad)}`).join(" | ");
}

function tablaResumenUbicacionesActivas(resumen) {
  const rows = resumen.map(row => `
    <tr>
      <td><strong>Pasillo ${htmlSeguro(row.pasillo)}</strong></td>
      <td><strong>${fmt(row.total)}</strong></td>
      <td>${htmlSeguro(textoConteoUbicaciones(row.zonas))}</td>
      <td>${htmlSeguro(textoConteoUbicaciones(row.tipos))}</td>
      <td>${fmt(row.bahias)}</td>
      <td>${fmt(row.niveles)}</td>
      <td>${fmt(row.posiciones)}</td>
    </tr>
  `);
  return tablaConId("tablaResumenUbicacionesActivas", ["Pasillo", "Ubicaciones", "Zona Asignac", "Tipo Ubicac", "Bahias", "Niveles", "Posiciones"], rows);
}

function tablaDetalleUbicacionesActivas(filas) {
  const rows = filas.map(row => `
    <tr>
      <td><strong>${htmlSeguro(row.pasillo)}</strong></td>
      <td><strong>${htmlSeguro(row.mascara)}</strong></td>
      <td>${htmlSeguro(row.zona)}</td>
      <td>${htmlSeguro(row.tipoUbicac)}</td>
      <td>${htmlSeguro(row.area)}</td>
      <td>${htmlSeguro(row.bahia)}</td>
      <td>${htmlSeguro(row.nivel)}</td>
      <td>${htmlSeguro(row.posicion)}</td>
    </tr>
  `);
  return tablaConId("tablaDetalleUbicacionesActivas", ["Pasillo", "Mascara", "Zona Asignac", "Tipo Ubicac", "Area", "Bah", "Niv", "Posic"], rows);
}

function exportarUbicacionesActivasControl() {
  const data = calcularUbicacionesActivasControl();
  descargarExcelHojas("ubicaciones_activas", [
    {
      nombre: "Resumen",
      filas: [
        ["Pasillo", "Ubicaciones", "Zona Asignac", "Tipo Ubicac", "Bahias", "Niveles", "Posiciones"],
        ...data.resumen.map(row => [
          row.pasillo,
          row.total,
          textoConteoUbicaciones(row.zonas),
          textoConteoUbicaciones(row.tipos),
          row.bahias,
          row.niveles,
          row.posiciones
        ])
      ]
    },
    {
      nombre: "Detalle",
      filas: [
        ["Pasillo", "Mascara", "Zona Asignac", "Tipo Ubicac", "Area", "Bah", "Niv", "Posic"],
        ...data.filas.map(row => [row.pasillo, row.mascara, row.zona, row.tipoUbicac, row.area, row.bahia, row.nivel, row.posicion])
      ]
    }
  ]);
}

function renderBuscadorControlPiso() {
  document.getElementById("controlPisoContenido").innerHTML = `
    <section class="card subcard control-piso-search">
      <div class="section-head">
        <div>
          <h2>Buscar LPN a dividir</h2>
        </div>
        <div class="filters grow">
          <input class="search" id="buscarControlPisoLpn" placeholder="Ingresa o escanea LPN..." oninput="programarBusquedaControlPiso()">
          <button onclick="buscarControlPiso()">Buscar</button>
        </div>
      </div>
      <div id="resultadoControlPiso"></div>
    </section>
  `;
  document.getElementById("buscarControlPisoLpn")?.focus();
}

function programarBusquedaControlPiso() {
  clearTimeout(timerControlPiso);
  timerControlPiso = setTimeout(buscarControlPiso, 100);
}

function buscarControlPiso() {
  const q = normalizar(document.getElementById("buscarControlPisoLpn")?.value);
  const destino = document.getElementById("resultadoControlPiso");
  if (!destino) return;
  if (!q) {
    destino.innerHTML = `<div class="notice">Ingresa un LPN para ver su plan de ubicacion.</div>`;
    return;
  }

  const data = enriquecerControlPiso(consolidarControlPisoPorLpnProducto().filter(r => normalizar(r.lpn).includes(q)));
  if (!data.length) {
    destino.innerHTML = `<div class="notice danger">No se encontro el LPN en ubicaciones de piso/control.</div>`;
    return;
  }

  const totalBultos = data.reduce((a, b) => a + b.stock, 0);
  const totalUnidades = data.reduce((a, b) => a + b.unidades, 0);
  destino.innerHTML = `
    <section class="kpi-grid compact">
      ${kpi("Productos en LPN", fmt(data.length))}
      ${kpi("Bultos", fmt(totalBultos))}
      ${kpi("Unidades", fmt(totalUnidades))}
      ${kpi("Criticos +1 dia", fmt(data.filter(r => r.antiguedad > 1).length), "antiguedad")}
    </section>
    <section class="card subcard">
      <div class="section-head">
        <div>
          <h2>Plan sugerido</h2>
        </div>
        <div class="filters">
          <button onclick="exportarControlPisoBusqueda()">Excel plan</button>
        </div>
      </div>
      ${tablaControlPisoResumen("tablaControlPisoBusqueda", data)}
    </section>
  `;
}

function renderReporteControlPiso() {
  const base = enriquecerControlPiso();
  const grupos = ["BLANCO", "BUFFER", "DROP-STOCK DESBLOQ", "DROP-STOCK", "RAMPA"];
  const criticos = base.filter(r => r.antiguedad > 1);
  const conActivo = base.filter(r => r.activoIngresa > 0);
  const conReserva = base.filter(r => r.reservaCount > 0);
  const sinDestino = base.filter(r => r.decision === "Sin activo ni reserva");

  document.getElementById("controlPisoContenido").innerHTML = `
    <section class="kpi-grid compact">
      ${kpi("LPN/producto piso", fmt(base.length))}
      ${kpi("Bultos piso", fmt(base.reduce((a, b) => a + b.stock, 0)))}
      ${kpi("Con activo disponible", fmt(conActivo.length))}
      ${kpi("Con reserva", fmt(conReserva.length))}
      ${kpi("Sin destino", fmt(sinDestino.length), "", "danger")}
      ${kpi("Criticos +1 dia", fmt(criticos.length), "", criticos.length ? "danger" : "")}
    </section>
    <section class="card subcard">
      <div class="section-head">
        <div>
          <h2>Reporte general de piso</h2>
        </div>
        <div class="filters">
          <input class="search" id="filtroControlPiso" placeholder="Buscar LPN, codigo, descripcion o ubicacion..." oninput="programarRenderReporteControlPiso()">
          <button onclick="exportarControlPisoReporte()">Excel reporte</button>
        </div>
      </div>
      <div id="tablasReporteControlPiso"></div>
    </section>
  `;
  renderTablasReporteControlPiso();
}

function programarRenderReporteControlPiso() {
  clearTimeout(timerControlPiso);
  timerControlPiso = setTimeout(renderTablasReporteControlPiso, 120);
}

function filtrarControlPiso(data, q) {
  if (!q) return data;
  return data.filter(r => [r.grupo, r.ubicacion, r.lpn, r.codigoAlt, r.codigo, r.descripcion, r.decision].join(" ").toLowerCase().includes(q));
}

function renderTablasReporteControlPiso() {
  const contenedor = document.getElementById("tablasReporteControlPiso");
  if (!contenedor) return;
  const q = limpiar(document.getElementById("filtroControlPiso")?.value).toLowerCase();
  const data = filtrarControlPiso(enriquecerControlPiso(), q);
  const grupos = ["BLANCO", "BUFFER", "DROP-STOCK DESBLOQ", "DROP-STOCK", "RAMPA"];
  contenedor.innerHTML = grupos.map(grupo => {
    const rows = data.filter(r => r.grupos?.has?.(grupo) || r.grupo.split(" / ").includes(grupo));
    return `
      <section class="card subcard nested-card">
        <div class="section-head">
          <div>
            <h2>${htmlSeguro(grupo)}</h2>
          </div>
          <span class="badge">${fmt(rows.length)} LPN/producto</span>
        </div>
        ${tablaControlPisoResumen(`tablaControlPiso_${grupo.replace(/[^A-Z0-9]+/gi, "_")}`, rows)}
      </section>
    `;
  }).join("");
}

function tablaControlPisoResumen(tablaId, data) {
  return tablaConId(tablaId, ["Ubicacion", "LPN", "Cod alternativo", "Codigo", "Descripcion", "Bultos", "Unidades", "Antiguedad", "Decision", "Activo", "Reserva"], data.map(r => {
    const detalleKey = `${normalizar(r.lpn)}|${normalizar(r.codigo)}`;
    detalleControlPiso.set(detalleKey, r);
    return `
      <tr class="${r.antiguedad > 1 ? "bad" : "ok"}">
        <td><strong>${htmlSeguro(r.ubicacion)}</strong></td>
        <td><strong>${htmlSeguro(r.lpn)}</strong></td>
        <td>${htmlSeguro(r.codigoAlt)}</td>
        <td>${htmlSeguro(r.codigo)}</td>
        <td>${htmlSeguro(r.descripcion)}</td>
        <td class="number">${fmt(r.stock)}</td>
        <td class="number">${fmt(r.unidades)}</td>
        <td class="number">${fmt(r.antiguedad)}</td>
        <td><strong>${htmlSeguro(r.decision)}</strong></td>
        <td><button class="compact" onclick="abrirDetalleControlPiso(${argumentoSeguro(detalleKey)}, 'activo')">${fmt(r.activoIngresa)} / ${fmt(r.activoCount)}</button></td>
        <td><button class="compact" onclick="abrirDetalleControlPiso(${argumentoSeguro(detalleKey)}, 'reserva')">${fmt(r.reservaCount)}</button></td>
      </tr>
    `;
  }), "Sin LPNs para mostrar.");
}

function abrirDetalleControlPiso(detalleKey, tipo) {
  const row = detalleControlPiso.get(detalleKey);
  const destino = document.getElementById("modalControlPiso");
  if (!destino) return;
  if (!row) {
    destino.innerHTML = `<div class="modal-card"><button class="ghost" onclick="cerrarControlPisoModal()">Cerrar</button><p>Sin detalle para mostrar.</p></div>`;
    destino.hidden = false;
    return;
  }
  const activo = activoDisponibleParaLpn(row);
  const reserva = reservaDisponibleParaLpn(row);
  destino.innerHTML = `
    <div class="modal-card wide">
      <div class="section-head">
        <div>
          <h2>${tipo === "activo" ? "Activo disponible" : "Reserva para acople"}</h2>
          <p class="muted-note">${htmlSeguro(row.lpn)} | ${htmlSeguro(row.codigo)} | ${htmlSeguro(row.descripcion)}</p>
        </div>
        <div class="filters">
          <button onclick="exportarControlPisoDetalle(${argumentoSeguro(detalleKey)})">Excel detalle</button>
          <button class="ghost" onclick="cerrarControlPisoModal()">Cerrar</button>
        </div>
      </div>
      ${tipo === "activo" ? tablaControlPisoActivo(activo, row) : tablaControlPisoReserva(reserva)}
    </div>
  `;
  destino.hidden = false;
}

function tablaControlPisoActivo(data, origen) {
  return tablaConId("tablaDetalleControlPiso", ["Ubicacion activo", "Stock UND", "Stock BUL", "Asignado", "Transito", "Disp. UND", "Disp. BUL", "Ingresa", "Falta UND", "Falta BUL"], data.map(r => `
    <tr class="${r.ingresa ? "ok" : "warn"}">
      <td><strong>${htmlSeguro(r.ubicacion)}</strong></td>
      <td class="number">${fmt(r.unidades)}</td>
      <td class="number">${fmt(r.bultos)}</td>
      <td class="number">${fmt(r.asignado)}</td>
      <td class="number">${fmt(r.transito)}</td>
      <td class="number">${fmtDisponibilidad(r.disponibleUnidades, r.capacidadDinamica)}</td>
      <td class="number">${fmtDisponibilidad(r.disponibleBultos, r.capacidadDinamica)}</td>
      <td><strong>${r.ingresa ? "SI" : "NO"}</strong></td>
      <td class="number">${r.capacidadDinamica ? "" : fmt(r.faltaUnidades)}</td>
      <td class="number">${r.capacidadDinamica ? "" : fmt(r.faltaBultos)}</td>
    </tr>
  `), "Este producto no cuenta con ubicacion activa.");
}

function tablaControlPisoReserva(data) {
  return tablaConId("tablaDetalleControlPiso", ["Ubicacion reserva", "LPN reserva", "Cod alternativo", "Codigo", "Descripcion", "Stock", "Unidades", "Antiguedad"], data.map(r => `
    <tr class="${r.antiguedad > 1 ? "bad" : "warn"}">
      <td><strong>${htmlSeguro(r.ubicacion)}</strong></td>
      <td><strong>${htmlSeguro(r.lpn)}</strong></td>
      <td>${htmlSeguro(r.codigoAlt)}</td>
      <td>${htmlSeguro(r.codigo)}</td>
      <td>${htmlSeguro(r.descripcion)}</td>
      <td class="number">${fmt(r.stock)}</td>
      <td class="number">${fmt(r.unidades)}</td>
      <td class="number">${fmt(r.antiguedad)}</td>
    </tr>
  `), "Este producto no cuenta con reserva MASS para acople.");
}

function cerrarControlPisoModal() {
  const destino = document.getElementById("modalControlPiso");
  if (!destino) return;
  destino.hidden = true;
  destino.innerHTML = "";
}

function filasControlPisoDetalleLpn(base) {
  return [
    ["LPN", "CODIGO", "DESCRIPCION", "BULTOS", "UNIDADES"],
    ...base.map(r => [
      r.lpn,
      r.codigo,
      r.descripcion,
      r.stock,
      r.unidades
    ])
  ];
}

function filasControlPisoActivo(base) {
  const filas = [["LPN", "CODIGO", "DESCRIPCION", "BULTOS LPN", "UNIDADES LPN", "UBICACION ACTIVO", "DISPONIBLE UND", "DISPONIBLE BUL", "INGRESA EN ACTIVO", "FALTA UND", "FALTA BUL", "ACCION"]];
  base.forEach(origen => {
    const activos = activoDisponibleParaLpn(origen);
    if (!activos.length) {
      filas.push([
        origen.lpn,
        origen.codigo,
        origen.descripcion,
        origen.stock,
        origen.unidades,
        "SIN ACTIVO",
        0,
        0,
        "NO",
        origen.unidades,
        origen.stock,
        "Validar reserva para acople"
      ]);
      return;
    }
    activos.forEach(destino => {
      filas.push([
        origen.lpn,
        origen.codigo,
        origen.descripcion,
        origen.stock,
        origen.unidades,
        destino.ubicacion,
        destino.capacidadDinamica ? "SIN LIMITE" : destino.disponibleUnidades,
        destino.capacidadDinamica ? "SIN LIMITE" : destino.disponibleBultos,
        destino.ingresa ? "SI" : "NO",
        destino.capacidadDinamica ? "" : destino.faltaUnidades,
        destino.capacidadDinamica ? "" : destino.faltaBultos,
        destino.ingresa ? "Ingresar a activo" : "No completa activo; validar reserva"
      ]);
    });
  });
  return filas;
}

function filasControlPisoReserva(base) {
  const filas = [["LPN", "CODIGO", "DESCRIPCION", "BULTOS LPN", "UNIDADES LPN", "UBICACION RESERVA", "LPN RESERVA", "STOCK RESERVA", "UNIDADES RESERVA", "ANTIGUEDAD RESERVA", "ACCION"]];
  base.forEach(origen => {
    const ingresaActivo = activoDisponibleParaLpn(origen).some(destino => destino.ingresa);
    if (ingresaActivo) return;
    const reservas = reservaDisponibleParaLpn(origen);
    if (!reservas.length) {
      filas.push([
        origen.lpn,
        origen.codigo,
        origen.descripcion,
        origen.stock,
        origen.unidades,
        "SIN RESERVA",
        "",
        0,
        0,
        "",
        "Sin activo completo ni reserva para acople"
      ]);
      return;
    }
    reservas.forEach(destino => {
      filas.push([
        origen.lpn,
        origen.codigo,
        origen.descripcion,
        origen.stock,
        origen.unidades,
        destino.ubicacion,
        destino.lpn,
        destino.stock,
        destino.unidades,
        destino.antiguedad,
        "Acoplar en reserva"
      ]);
    });
  });
  return filas;
}

function exportarControlPisoBusqueda() {
  const q = normalizar(document.getElementById("buscarControlPisoLpn")?.value);
  const base = enriquecerControlPiso(consolidarControlPisoPorLpnProducto().filter(r => normalizar(r.lpn).includes(q)));
  if (!base.length) return alert("No hay datos para exportar.");
  descargarExcelHojas(`plan_lpn_${q || "control_piso"}`, [
    { nombre: "Detalle LPN", filas: filasControlPisoDetalleLpn(base) },
    { nombre: "Validacion activo", filas: filasControlPisoActivo(base) },
    { nombre: "Reserva acople", filas: filasControlPisoReserva(base) }
  ]);
}

function exportarControlPisoReporte() {
  const q = limpiar(document.getElementById("filtroControlPiso")?.value).toLowerCase();
  const base = filtrarControlPiso(enriquecerControlPiso(), q);
  if (!base.length) return alert("No hay datos para exportar.");
  descargarExcelHojas("control_piso_reporte", [
    { nombre: "Detalle LPN", filas: filasControlPisoDetalleLpn(base) },
    { nombre: "Validacion activo", filas: filasControlPisoActivo(base) },
    { nombre: "Reserva acople", filas: filasControlPisoReserva(base) }
  ]);
}

function exportarControlPisoDetalle(detalleKey) {
  const row = detalleControlPiso.get(detalleKey);
  if (!row) return alert("No hay detalle para exportar.");
  const base = [row];
  descargarExcelHojas(`detalle_${normalizar(row.lpn)}_${normalizar(row.codigo)}`, [
    { nombre: "Detalle LPN", filas: filasControlPisoDetalleLpn(base) },
    { nombre: "Validacion activo", filas: filasControlPisoActivo(base) },
    { nombre: "Reserva acople", filas: filasControlPisoReserva(base) }
  ]);
}

function keyCachePlanMultiPiso() {
  return [
    keyCacheLpnsUbicacion(),
    dataPedido.length,
    limpiar(dataPedido[0]?.PRODUCTO || dataPedido[0]?.Codigo || dataPedido[0]?.CODIGO),
    limpiar(dataPedido[dataPedido.length - 1]?.PRODUCTO || dataPedido[dataPedido.length - 1]?.Codigo || dataPedido[dataPedido.length - 1]?.CODIGO),
    localStorage.getItem("operaciones_pallet_maximo") || "",
    localStorage.getItem("operaciones_validacion_reserva") || ""
  ].join("|");
}

function pedidoNoAsignadoPorProducto() {
  const mapa = new Map();
  (dataPedido || []).forEach(row => {
    const codigo = normalizar(campo(row, ["PRODUCTO", "Producto", "CODIGO", "Codigo"]));
    if (!codigo) return;
    const bultos = num(campo(row, [
      "BULTOS_NO_ASIGNADO",
      "BULTOS_NO_ASIGNADOS",
      "BULTO_NO_ASIGNADO",
      "BULTO_NO_ASIGANDO",
      "BULTOS_NO_ASIGANDO",
      "NO_ASIGNADO",
      "NO ASIGNADO"
    ]));
    if (bultos <= 0) return;
    if (!mapa.has(codigo)) {
      mapa.set(codigo, {
        codigo,
        codigoAlt: codigoAlternativoProducto(codigo, row),
        descripcion: descripcionProducto(codigo, row),
        bultos: 0,
        fechas: new Set()
      });
    }
    const item = mapa.get(codigo);
    item.bultos += bultos;
    const fecha = limpiar(campo(row, ["FECHA_ORDEN", "FECHA", "Fecha", "Fecha Orden", "FECHA ORDEN"]));
    if (fecha) item.fechas.add(fecha);
  });
  return mapa;
}

function maxPalletAprendidoPlan() {
  const ubicaciones = consolidarReservaParaOptimizar();
  return calcularPalletMaximo(ubicaciones);
}

function productosPlanMultiDesdePiso() {
  const porProducto = new Map();
  lpnsControlOperativo().forEach(row => {
    if (!row.codigo || row.stock <= 0) return;
    if (!porProducto.has(row.codigo)) {
      porProducto.set(row.codigo, {
        codigo: row.codigo,
        codigoAlt: row.codigoAlt,
        descripcion: row.descripcion,
        bultos: 0,
        unidades: 0,
        lpns: new Set(),
        ubicaciones: new Set(),
        grupos: new Set(),
        antiguedad: 0,
        detalle: []
      });
    }
    const item = porProducto.get(row.codigo);
    item.bultos += num(row.stock);
    item.unidades += num(row.unidades);
    item.lpns.add(row.lpn);
    item.ubicaciones.add(row.ubicacion);
    item.grupos.add(row.grupo);
    item.antiguedad = Math.max(item.antiguedad, num(row.antiguedad));
    item.detalle.push(row);
  });
  return Array.from(porProducto.values());
}

function reservasIncompletasPlan(codigo, maximo) {
  return detalleReservaProducto(codigo)
    .map(r => ({
      ...r,
      faltantePallet: maximo > 0 ? Math.max(0, maximo - num(r.stock)) : 0,
      pctPallet: maximo > 0 ? pctLimitado(num(r.stock), maximo) : 0
    }))
    .filter(r => maximo <= 0 || num(r.stock) < maximo * 0.98)
    .sort((a, b) => b.stock - a.stock || ordenarUbicacion(a.ubicacion, b.ubicacion));
}

function activoSugeridoPlan(item) {
  return detalleActivoProducto(item.codigo)
    .map(a => ({
      ...a,
      ingresaTodo: a.capacidadDinamica || num(a.disponibleBultos) >= num(item.bultos),
      ingresa: a.capacidadDinamica || num(a.disponibleBultos) >= num(item.bultos),
      ingresaAlgo: a.capacidadDinamica || num(a.disponibleBultos) > 0,
      faltanteBultos: a.capacidadDinamica ? 0 : Math.max(0, num(item.bultos) - num(a.disponibleBultos)),
      faltanteUnidades: a.capacidadDinamica ? 0 : Math.max(0, num(item.unidades) - num(a.disponibleUnidades))
    }))
    .sort((a, b) => Number(b.ingresaTodo) - Number(a.ingresaTodo) || b.disponibleBultos - a.disponibleBultos || ordenarUbicacion(a.ubicacion, b.ubicacion));
}

function decidirPlanMultiPiso(item, contexto) {
  const maximo = num(contexto.maximos[item.codigo]?.maximo);
  const pedido = contexto.pedido.get(item.codigo);
  const activo = activoSugeridoPlan(item);
  const reserva = reservasIncompletasPlan(item.codigo, maximo);
  const disponibleActivo = activo.reduce((a, b) => a + (b.capacidadDinamica ? item.bultos : Math.max(0, num(b.disponibleBultos))), 0);
  const mejorReserva = reserva[0];
  const pctPallet = maximo > 0 ? pctLimitado(item.bultos, maximo) : 0;
  const acoplaReserva = mejorReserva && (maximo <= 0 || num(mejorReserva.stock) + num(item.bultos) <= maximo * 1.05);

  let accion = "Baja prioridad";
  let prioridad = "BAJA";
  let motivo = "Menor a 15 bultos sin pedido, activo o reserva clara.";
  let resultado = "Dejar al final y validar fisicamente.";
  let score = item.antiguedad;

  if (pedido?.bultos > 0) {
    accion = "Atacar pedido";
    prioridad = "ALTA";
    motivo = `Pedido no asignado solicita ${fmt(pedido.bultos)} bultos.`;
    resultado = "Separar primero para cubrir no asignado y evitar doble trabajo.";
    score += 1000 + pedido.bultos;
  } else if (maximo > 15 && item.bultos >= maximo * 0.5) {
    accion = "Unificar y rackear";
    prioridad = "ALTA";
    motivo = `Piso llega al ${pctPallet.toFixed(1)}% del pallet aprendido (${fmt(maximo)} bultos).`;
    resultado = "Formar pallet para reserva y retirar LPNs de piso.";
    score += 850 + item.bultos;
  } else if (acoplaReserva) {
    accion = "Acoplar a reserva";
    prioridad = item.bultos >= 15 ? "ALTA" : "MEDIA";
    motivo = `Existe reserva incompleta en ${mejorReserva.ubicacion}.`;
    resultado = "Unir con reserva para liberar piso sin crear pallet pequeño.";
    score += 700 + item.bultos + num(mejorReserva.stock);
  } else if (activo.some(a => a.ingresaTodo)) {
    accion = "Ingresar a activo";
    prioridad = item.bultos >= 15 ? "MEDIA" : "ALTA";
    motivo = "Activo disponible recibe todo el stock del piso.";
    resultado = "Mover a activo y cerrar el LPN de piso.";
    score += 650 + item.bultos;
  } else if (!maximo && item.bultos >= 30) {
    accion = "Validar fisico";
    prioridad = "MEDIA";
    motivo = "No hay max pallet aprendido, pero el volumen amerita validar rackeo.";
    resultado = "Validar fisicamente si puede subir a reserva.";
    score += 420 + item.bultos;
  } else if (item.bultos >= 15 && activo.some(a => a.ingresaAlgo)) {
    accion = "Parcial a activo";
    prioridad = "MEDIA";
    motivo = `Activo tiene ${fmt(disponibleActivo)} bultos disponibles, pero no completa todo.`;
    resultado = "Mover parcial a activo y revisar saldo.";
    score += 360 + item.bultos;
  } else if (item.bultos >= 15) {
    accion = "Validar destino";
    prioridad = "MEDIA";
    motivo = "Tiene 15+ bultos, pero no se detecto destino automatico.";
    resultado = "Validar con operacion para no dejarlo en piso.";
    score += 250 + item.bultos;
  }

  if (item.detalle.length <= 3) score += 80;
  if (item.antiguedad > 1) score += 120;

  return { accion, prioridad, motivo, resultado, score, maximo, pctPallet, pedido, activo, reserva, mejorReserva };
}

function calcularPlanMultiPiso() {
  const key = keyCachePlanMultiPiso();
  if (cachePlanMultiPiso.key === key && cachePlanMultiPiso.data) return cachePlanMultiPiso.data;

  const contexto = {
    maximos: maxPalletAprendidoPlan(),
    pedido: pedidoNoAsignadoPorProducto()
  };
  detallePlanMultiPiso = new Map();
  const filas = productosPlanMultiDesdePiso().map((item, index) => {
    const decision = decidirPlanMultiPiso(item, contexto);
    const id = `${item.codigo}|${index}`;
    const row = {
      ...item,
      id,
      ...decision,
      lpnsCount: item.lpns.size,
      ubicacionesTxt: Array.from(item.ubicaciones).sort(ordenarUbicacion).join(", "),
      gruposTxt: Array.from(item.grupos).sort().join(" / ")
    };
    detallePlanMultiPiso.set(id, row);
    return row;
  }).sort((a, b) => b.score - a.score || b.bultos - a.bultos || a.descripcion.localeCompare(b.descripcion));

  const data = {
    filas,
    total: {
      productos: filas.length,
      lpns: new Set(filas.flatMap(r => Array.from(r.lpns))).size,
      bultos: filas.reduce((a, b) => a + b.bultos, 0),
      alta: filas.filter(r => r.prioridad === "ALTA").length,
      media: filas.filter(r => r.prioridad === "MEDIA").length,
      baja: filas.filter(r => r.prioridad === "BAJA").length,
      pedido: filas.filter(r => r.accion === "Atacar pedido").length,
      rackear: filas.filter(r => r.accion === "Unificar y rackear").length,
      acoplar: filas.filter(r => r.accion === "Acoplar a reserva").length,
      activo: filas.filter(r => r.accion === "Ingresar a activo").length
    }
  };

  cachePlanMultiPiso = { key, data };
  return data;
}

function filtrarPlanMultiPiso(data) {
  const rows = Array.isArray(data) ? data : (data?.filas || []);
  const filtroLpn = limpiar(document.getElementById("filtroPlanMultiPisoLpn")?.value || filtrosPlanMultiPiso.lpn).toLowerCase();
  const filtroProducto = limpiar(document.getElementById("filtroPlanMultiPisoProducto")?.value || filtrosPlanMultiPiso.producto).toLowerCase();
  const accion = limpiar(document.getElementById("filtroAccionPlanMultiPiso")?.value);
  const prioridad = limpiar(document.getElementById("filtroPrioridadPlanMultiPiso")?.value);
  return rows
    .filter(r => !accion || r.accion === accion)
    .filter(r => !prioridad || r.prioridad === prioridad)
    .filter(r => {
      if (!filtroLpn) return true;
      const lpns = r.lpns ? Array.from(r.lpns) : [];
      const detalleLpns = (r.detalle || []).map(d => d.lpn);
      return [...lpns, ...detalleLpns].join(" ").toLowerCase().includes(filtroLpn);
    })
    .filter(r => {
      if (!filtroProducto) return true;
      const detalleProductos = (r.detalle || []).map(d => [d.codigo, d.codigoAlt, d.descripcion].join(" "));
      return [r.codigo, r.codigoAlt, r.descripcion, r.ubicacionesTxt, r.gruposTxt, r.accion, r.motivo, ...detalleProductos]
        .join(" ")
        .toLowerCase()
        .includes(filtroProducto);
    });
}

function filtrarPlanMultiPisoConPausa() {
  filtrosPlanMultiPiso = {
    lpn: limpiar(document.getElementById("filtroPlanMultiPisoLpn")?.value),
    producto: limpiar(document.getElementById("filtroPlanMultiPisoProducto")?.value)
  };
  clearTimeout(timerPlanMultiPiso);
  timerPlanMultiPiso = setTimeout(renderPlanMultiPiso, 180);
}

function destinoProductoSimulacionCinco(row, contexto) {
  const maximo = num(contexto.maximos[row.codigo]?.maximo);
  const pedido = contexto.pedido.get(row.codigo);
  const activo = activoDisponibleParaLpn(row);
  const activoOk = activo.find(a => a.ingresa);
  if (activoOk) {
    const disponible = activoOk.capacidadDinamica ? "SIN LIMITE" : fmt(activoOk.disponibleBultos);
    return {
      destino: "ACTIVO",
      estado: "DESAPARECE",
      ubicaciones: activo.slice(0, 3).map(a => a.ubicacion).join(", "),
      destinoUbicacion: activoOk.ubicacion,
      destinoLpn: "",
      destinoStock: activoOk.bultos,
      destinoDisponible: disponible,
      motivo: pedido?.bultos > 0
        ? `Ingresar ${fmt(row.stock)} bultos desde ${row.lpn}; activo ${activoOk.ubicacion} tiene ${disponible} bultos disponibles y pedido solicita ${fmt(pedido.bultos)}.`
        : `Ingresar ${fmt(row.stock)} bultos desde ${row.lpn}; activo ${activoOk.ubicacion} tiene ${disponible} bultos disponibles.`,
      pedido: pedido?.bultos || 0
    };
  }

  const reserva = reservasIncompletasPlan(row.codigo, maximo)
    .filter(r => normalizar(r.lpn) !== normalizar(row.lpn));
  const reservaOk = reserva.find(r => maximo <= 0 || num(r.stock) + num(row.stock) <= maximo * 1.05) || reserva[0];
  if (reservaOk) {
    const faltante = maximo > 0 ? Math.max(0, maximo - num(reservaOk.stock)) : "";
    return {
      destino: "RESERVA / ACOPLE",
      estado: "DESAPARECE",
      ubicaciones: reserva.slice(0, 3).map(r => r.ubicacion).join(", "),
      destinoUbicacion: reservaOk.ubicacion,
      destinoLpn: reservaOk.lpn,
      destinoStock: reservaOk.stock,
      destinoDisponible: faltante === "" ? "VALIDAR" : fmt(faltante),
      motivo: `Acoplar ${fmt(row.stock)} bultos del LPN ${row.lpn} con reserva ${reservaOk.lpn} en ${reservaOk.ubicacion}; reserva actual ${fmt(reservaOk.stock)} bultos${maximo > 0 ? `, max pallet ${fmt(maximo)}, espacio aprox. ${fmt(faltante)}` : ""}.`,
      pedido: pedido?.bultos || 0
    };
  }

  if (maximo > 15 && num(row.stock) >= maximo * 0.5) {
    return {
      destino: "RESERVA NUEVA",
      estado: "DESAPARECE",
      ubicaciones: "Validar ubicacion libre",
      destinoUbicacion: "Ubicacion libre reserva",
      destinoLpn: "",
      destinoStock: 0,
      destinoDisponible: fmt(maximo),
      motivo: `Rackear ${fmt(row.stock)} bultos del LPN ${row.lpn}; forma ${pctLimitado(row.stock, maximo).toFixed(1)}% del pallet aprendido (${fmt(maximo)} bultos).`,
      pedido: pedido?.bultos || 0
    };
  }

  return {
    destino: "PENDIENTE",
    estado: "VALIDAR",
    ubicaciones: "-",
    destinoUbicacion: "-",
    destinoLpn: "",
    destinoStock: "",
    destinoDisponible: "",
    motivo: "No se detecto activo completo, reserva para acoplar ni volumen suficiente para rackear.",
    pedido: pedido?.bultos || 0
  };
}

function calcularSimulacionCincoPallets() {
  const contexto = {
    maximos: maxPalletAprendidoPlan(),
    pedido: pedidoNoAsignadoPorProducto()
  };
  const porLpn = new Map();
  consolidarControlPisoPorLpnProducto()
    .filter(row => esGrupoPisoOperativo(row.grupo))
    .forEach(row => {
    if (!row.lpn || num(row.stock) <= 0) return;
    const key = normalizar(row.lpn);
    if (!porLpn.has(key)) {
      porLpn.set(key, {
        id: key,
        lpn: row.lpn,
        ubicaciones: new Set(),
        grupos: new Set(),
        productos: [],
        bultos: 0,
        unidades: 0,
        antiguedad: 0
      });
    }
    const item = porLpn.get(key);
    item.ubicaciones.add(row.ubicacion);
    item.grupos.add(row.grupo);
    item.productos.push(row);
    item.bultos += num(row.stock);
    item.unidades += num(row.unidades);
    item.antiguedad = Math.max(item.antiguedad, num(row.antiguedad));
  });

  detalleSimulacionCincoPallets = new Map();
  const candidatos = Array.from(porLpn.values()).map(item => {
    const detalle = item.productos.map(row => ({
      ...row,
      ...destinoProductoSimulacionCinco(row, contexto)
    }));
    const pendientes = detalle.filter(r => r.estado !== "DESAPARECE").length;
    const conPedido = detalle.filter(r => r.pedido > 0).length;
    const destinos = new Set(detalle.map(r => r.destino));
    const completos = pendientes === 0;
    const codigosCount = new Set(detalle.map(r => r.codigo)).size;
    const tipoLpn = normalizar(item.lpn).startsWith("IC962") ? "IC962" : "OTROS";
    const prioridad = completos && conPedido ? "ALTA" : completos ? "MEDIA" : "BAJA";
    const score = (completos ? 100000 : 0) + (conPedido * 5000) + (item.antiguedad * 250) + item.bultos - (codigosCount * 120) - (pendientes * 10000);
    const row = {
      ...item,
      detalle,
      pendientes,
      conPedido,
      completo: completos,
      prioridad,
      tipoLpn,
      score,
      productosCount: item.productos.length,
      codigosCount,
      ubicacionesTxt: Array.from(item.ubicaciones).sort(ordenarUbicacion).join(", "),
      gruposTxt: Array.from(item.grupos).sort().join(" / "),
      destinoTxt: Array.from(destinos).join(" + "),
      estado: completos ? "DESAPARECE DE PISO" : "VALIDAR"
    };
    detalleSimulacionCincoPallets.set(row.id, row);
    return row;
  }).sort((a, b) => b.score - a.score || a.productosCount - b.productosCount || b.bultos - a.bultos);

  const seleccion = filtrarSimulacionCincoPallets(candidatos);
  const grupos = agruparSimulacionCincoPallets(seleccion);
  return {
    filas: seleccion,
    grupos,
    total: {
      pallets: seleccion.length,
      completos: seleccion.filter(r => r.completo).length,
      pendientes: seleccion.reduce((a, b) => a + b.pendientes, 0),
      productos: seleccion.reduce((a, b) => a + b.productosCount, 0),
      bultos: seleccion.reduce((a, b) => a + b.bultos, 0),
      unidades: seleccion.reduce((a, b) => a + b.unidades, 0)
    }
  };
}

function filtrarSimulacionCincoPallets(data) {
  const antiguedad = limpiar(document.getElementById("filtroSimCincoAntiguedad")?.value);
  const codigos = limpiar(document.getElementById("filtroSimCincoCodigos")?.value);
  const estado = limpiar(document.getElementById("filtroSimCincoEstado")?.value) || "DESAPARECE";
  const prioridad = limpiar(document.getElementById("filtroSimCincoPrioridad")?.value);
  return data
    .filter(r => !antiguedad || (antiguedad === "0" ? r.antiguedad <= 0 : antiguedad === "1" ? r.antiguedad === 1 : r.antiguedad > 1))
    .filter(r => !codigos || (codigos === "1" ? r.codigosCount === 1 : codigos === "2" ? r.codigosCount === 2 : r.codigosCount >= 3))
    .filter(r => estado === "TODOS" || (estado === "DESAPARECE" ? r.completo : !r.completo))
    .filter(r => !prioridad || r.prioridad === prioridad);
}

function agruparSimulacionCincoPallets(data) {
  const grupos = [
    { tipo: "IC962", titulo: "LPNs IC962", filas: data.filter(r => r.tipoLpn === "IC962") },
    { tipo: "OTROS", titulo: "Otros LPNs", filas: data.filter(r => r.tipoLpn !== "IC962") }
  ];
  grupos.forEach(grupo => {
    grupo.bloques = [];
    for (let i = 0; i < grupo.filas.length; i += 5) {
      grupo.bloques.push({
        numero: Math.floor(i / 5) + 1,
        filas: grupo.filas.slice(i, i + 5)
      });
    }
  });
  return grupos;
}

function filasSimulacionConGrupo(data) {
  return data.flatMap(grupo => grupo.bloques.flatMap(bloque => bloque.filas.map((row, index) => ({
    ...row,
    grupoCinco: bloque.numero,
    ordenGrupo: index + 1
  }))));
}

function tablaSimulacionCincoPallets(data, tablaId = "tablaSimulacionCincoPallets") {
  return tablaConId(tablaId, ["Grupo 5", "Orden", "LPN", "Ubicacion piso", "Codigos", "Productos", "Bultos", "Unidades", "Antig.", "Prioridad", "Destino", "Estado", "Ver"], data.map(r => `
    <tr class="${r.completo ? "ok" : "warn"}">
      <td><strong>${fmt(r.grupoCinco)}</strong></td>
      <td><strong>${fmt(r.ordenGrupo)}</strong></td>
      <td><strong>${htmlSeguro(r.lpn)}</strong><br><small>${htmlSeguro(r.gruposTxt)}</small></td>
      <td>${htmlSeguro(r.ubicacionesTxt)}</td>
      <td class="number">${fmt(r.codigosCount)}</td>
      <td class="number">${fmt(r.productosCount)}</td>
      <td class="number"><strong>${fmt(r.bultos)}</strong></td>
      <td class="number">${fmt(r.unidades)}</td>
      <td class="number">${fmt(r.antiguedad)}</td>
      <td><strong>${htmlSeguro(r.prioridad)}</strong></td>
      <td>${htmlSeguro(r.destinoTxt)}</td>
      <td><strong>${htmlSeguro(r.estado)}</strong>${r.pendientes ? `<br><small>${fmt(r.pendientes)} pendientes</small>` : ""}</td>
      <td><button class="compact" onclick="abrirDetalleSimulacionCinco(${argumentoSeguro(r.id)})">Ver</button></td>
    </tr>
  `), "No hay LPNs de piso para simular.");
}

function bloqueSimulacionCincoPallets(simulacion) {
  const gruposCompletos = [
    { tipo: "IC962", titulo: "LPNs IC962 que desaparecen completos", filas: simulacion.filas.filter(r => r.completo && r.tipoLpn === "IC962") },
    { tipo: "OTROS", titulo: "Otros LPNs que desaparecen completos", filas: simulacion.filas.filter(r => r.completo && r.tipoLpn !== "IC962") }
  ].map(grupo => {
    const base = { ...grupo, bloques: [] };
    for (let i = 0; i < grupo.filas.length; i += 5) {
      base.bloques.push({
        numero: Math.floor(i / 5) + 1,
        filas: grupo.filas.slice(i, i + 5)
      });
    }
    return base;
  });

  return gruposCompletos.map(grupo => `
    <section class="card subcard sim-group-card">
      <div class="section-head">
        <div>
          <h3>${htmlSeguro(grupo.titulo)}</h3>
        </div>
        <span class="muted-note">${fmt(grupo.filas.length)} LPNs completos | grupos de 5</span>
      </div>
      <p class="muted-note">Solo aparecen LPNs donde todos sus productos tienen salida sugerida: activo, acople a reserva o reserva nueva.</p>
      <div class="sim-scroll-table">
        ${tablaSimulacionCincoPallets(filasSimulacionConGrupo([grupo]), `tablaSimulacionCincoPallets_${grupo.tipo}`)}
      </div>
    </section>
  `).join("");
}

function codigosDeLpnSimulado(row) {
  return new Set((row.detalle || []).map(d => normalizar(d.codigo)).filter(Boolean));
}

function scoreRelacionPaquete(row, paquete) {
  const codigosRow = codigosDeLpnSimulado(row);
  const codigosPaquete = paquete.codigos || new Set();
  let coincidencias = 0;
  codigosRow.forEach(codigo => {
    if (codigosPaquete.has(codigo)) coincidencias += 1;
  });
  const mezclaTipo = paquete.tipos?.has(row.tipoLpn) ? 0 : 350;
  return (coincidencias * 8000)
    + (row.conPedido * 2000)
    + (row.antiguedad * 180)
    + (row.bultos * 0.5)
    + mezclaTipo
    - (row.codigosCount * 80);
}

function calcularPaquetesInteligentes(simulacion) {
  const tamano = Math.max(1, num(document.getElementById("filtroSimInteligenteTamano")?.value) || 5);
  const filas = (simulacion?.filas || []);
  const baseOtros = filas
    .filter(r => r.tipoLpn !== "IC962")
    .sort((a, b) => b.conPedido - a.conPedido || b.score - a.score || b.antiguedad - a.antiguedad);
  const baseIc962 = filas
    .filter(r => r.tipoLpn === "IC962")
    .sort((a, b) => b.score - a.score || b.antiguedad - a.antiguedad);
  const pendientes = new Map(baseOtros.map(r => [r.id, r]));
  const paquetes = [];

  detallePaquetesInteligentes = new Map();

  while (pendientes.size) {
    const paquete = {
      id: `GRUPO-${String(paquetes.length + 1).padStart(2, "0")}`,
      numero: paquetes.length + 1,
      filas: [],
      complementos: [],
      codigos: new Set(),
      tipos: new Set()
    };

    const semilla = Array.from(pendientes.values())
      .sort((a, b) => b.conPedido - a.conPedido || b.score - a.score || a.codigosCount - b.codigosCount)[0];
    if (!semilla) break;

    paquete.filas.push(semilla);
    codigosDeLpnSimulado(semilla).forEach(c => paquete.codigos.add(c));
    paquete.tipos.add(semilla.tipoLpn);
    pendientes.delete(semilla.id);

    while (paquete.filas.length < tamano && pendientes.size) {
      const siguiente = Array.from(pendientes.values())
        .map(row => ({ row, score: scoreRelacionPaquete(row, paquete) }))
        .sort((a, b) => b.score - a.score || b.row.score - a.row.score)[0]?.row;
      if (!siguiente) break;
      paquete.filas.push(siguiente);
      codigosDeLpnSimulado(siguiente).forEach(c => paquete.codigos.add(c));
      paquete.tipos.add(siguiente.tipoLpn);
      pendientes.delete(siguiente.id);
    }

    paquete.complementos = baseIc962
      .filter(row => [...codigosDeLpnSimulado(row)].some(codigo => paquete.codigos.has(codigo)))
      .slice(0, tamano);

    const conteoCodigos = new Map();
    [...paquete.filas, ...paquete.complementos].forEach(row => {
      codigosDeLpnSimulado(row).forEach(codigo => conteoCodigos.set(codigo, (conteoCodigos.get(codigo) || 0) + 1));
    });
    const codigosComunes = [...conteoCodigos.entries()].filter(([, total]) => total > 1).length;
    const productos = evaluarProductosPaqueteInteligente(paquete);
    const destinos = new Set(productos.map(d => d.decision));
    const pendientesProductos = paquete.filas.reduce((a, b) => a + b.pendientes, 0);
    const conPedido = paquete.filas.reduce((a, b) => a + b.conPedido, 0);
    const palletsFormables = productos.reduce((a, b) => a + b.pallets, 0);
    const rackFisico = productos.filter(p => p.decision === "RACKEAR / VALIDAR FISICO").length;
    const activo = productos.filter(p => p.decision === "INGRESAR A ACTIVO").length;
    const acople = productos.filter(p => p.decision === "ACOPLAR A RESERVA").length;
    const pendientesDestino = productos.filter(p => p.decision.includes("PENDIENTE") || p.decision.includes("VALIDAR")).length;

    Object.assign(paquete, {
      lpnsCount: paquete.filas.length,
      complementosCount: paquete.complementos.length,
      ic962: paquete.complementos.length,
      otros: paquete.filas.filter(r => r.tipoLpn !== "IC962").length,
      codigosCount: paquete.codigos.size,
      codigosComunes,
      productos,
      productosCount: productos.length,
      bultos: paquete.filas.reduce((a, b) => a + b.bultos, 0),
      unidades: paquete.filas.reduce((a, b) => a + b.unidades, 0),
      antiguedad: Math.max(0, ...paquete.filas.map(r => num(r.antiguedad))),
      conPedido,
      palletsFormables,
      rackFisico,
      activo,
      acople,
      pendientesDestino,
      destinoTxt: [...destinos].join(" + "),
      estado: pendientesDestino ? "VALIDAR SALDOS" : "PLAN COMPLETO",
      motivo: codigosComunes
        ? `${codigosComunes} codigo(s) conectan estos LPNs. Primero formar pallet completo; luego activo o acople.`
        : "Grupo armado por prioridad y antiguedad. Validar porque la coincidencia de codigos es baja."
    });

    detallePaquetesInteligentes.set(paquete.id, paquete);
    paquetes.push(paquete);
  }

  return paquetes;
}

function evaluarProductosPaqueteInteligente(paquete) {
  const contexto = {
    maximos: maxPalletAprendidoPlan(),
    pedido: pedidoNoAsignadoPorProducto()
  };
  const porCodigo = new Map();
  [...paquete.filas, ...paquete.complementos].forEach(lpn => {
    (lpn.detalle || []).forEach(d => {
      if (!porCodigo.has(d.codigo)) {
        porCodigo.set(d.codigo, {
          codigo: d.codigo,
          codigoAlt: d.codigoAlt,
          descripcion: d.descripcion,
          lpns: new Set(),
          lpnsOtros: new Set(),
          lpnsIc962: new Set(),
          ubicaciones: new Set(),
          bultos: 0,
          unidades: 0,
          antiguedad: 0
        });
      }
      const item = porCodigo.get(d.codigo);
      item.lpns.add(lpn.lpn);
      if (lpn.tipoLpn === "IC962") item.lpnsIc962.add(lpn.lpn);
      else item.lpnsOtros.add(lpn.lpn);
      item.ubicaciones.add(d.ubicacion);
      item.bultos += num(d.stock);
      item.unidades += num(d.unidades);
      item.antiguedad = Math.max(item.antiguedad, num(d.antiguedad));
    });
  });

  return Array.from(porCodigo.values()).map(item => {
    const maximo = num(contexto.maximos[item.codigo]?.maximo);
    const pct = maximo > 0 ? pctLimitado(item.bultos, maximo) : 0;
    const pallets = maximo > 0 ? Math.floor(item.bultos / maximo) : 0;
    const saldo = maximo > 0 ? Math.max(0, item.bultos - (pallets * maximo)) : item.bultos;
    const reservaOk = reservasIncompletasPlan(item.codigo, maximo).find(r => maximo <= 0 || num(r.stock) + saldo <= maximo * 1.05);
    const activoOk = detalleActivoProducto(item.codigo).find(a => a.capacidadDinamica || num(a.disponibleBultos) >= saldo);
    let decision = "PENDIENTE / VALIDAR";
    let destino = "-";
    let motivo = "No alcanza maximo aprendido ni se encontro destino automatico.";

    if (maximo > 0 && pallets > 0) {
      decision = "FORMAR PALLET COMPLETO";
      destino = "Reserva nueva";
      motivo = `Forma ${fmt(pallets)} pallet(s) de ${fmt(maximo)} bultos${saldo > 0 ? ` y deja saldo ${fmt(saldo)}` : ""}.`;
    } else if (maximo > 0 && item.bultos >= maximo * 0.5) {
      decision = "RACKEAR / VALIDAR FISICO";
      destino = "Reserva nueva validada";
      motivo = `Llega al ${pct.toFixed(1)}% del max pallet (${fmt(maximo)} bultos).`;
    } else if (saldo > 0 && activoOk) {
      decision = "INGRESAR A ACTIVO";
      destino = activoOk.ubicacion;
      motivo = `Activo disponible recibe ${fmt(saldo)} bultos.`;
    } else if (saldo > 0 && reservaOk) {
      decision = "ACOPLAR A RESERVA";
      destino = `${reservaOk.ubicacion} / ${reservaOk.lpn}`;
      motivo = `Acoplar saldo ${fmt(saldo)} con reserva de ${fmt(reservaOk.stock)} bultos.`;
    }

    return {
      ...item,
      lpnsCount: item.lpns.size,
      lpnsOtrosCount: item.lpnsOtros.size,
      lpnsIc962Count: item.lpnsIc962.size,
      ubicacionesTxt: Array.from(item.ubicaciones).sort(ordenarUbicacion).join(", "),
      lpnsTxt: Array.from(item.lpns).sort().join(", "),
      maximo,
      pct,
      pallets,
      saldo,
      decision,
      destino,
      motivo
    };
  }).sort((a, b) => b.pallets - a.pallets || b.bultos - a.bultos || b.lpnsCount - a.lpnsCount);
}

function tablaPaquetesInteligentes(paquetes) {
  return tablaConId("tablaPaquetesInteligentes", ["Grupo", "LPNs OTROS", "Complemento IC962", "Codigos conectados", "Pallets completos", "Rack/validar", "Activo", "Acople", "Pendientes", "Bultos OTROS", "Estado", "Ver"], paquetes.map(p => `
    <tr class="${p.estado === "PLAN COMPLETO" ? "ok" : "warn"}">
      <td><strong>${htmlSeguro(p.id)}</strong><br><small>${fmt(p.lpnsCount)} LPNs base</small></td>
      <td>${p.filas.map(r => `<strong>${htmlSeguro(r.lpn)}</strong>`).join("<br>")}</td>
      <td class="number"><strong>${fmt(p.complementosCount)}</strong></td>
      <td class="number"><strong>${fmt(p.codigosComunes)}</strong></td>
      <td class="number"><strong>${fmt(p.palletsFormables)}</strong></td>
      <td class="number">${fmt(p.rackFisico)}</td>
      <td class="number">${fmt(p.activo)}</td>
      <td class="number">${fmt(p.acople)}</td>
      <td class="number">${fmt(p.pendientesDestino)}</td>
      <td class="number"><strong>${fmt(p.bultos)}</strong></td>
      <td><strong>${htmlSeguro(p.estado)}</strong><br><small>${htmlSeguro(p.motivo)}</small></td>
      <td><button class="compact" onclick="abrirDetallePaqueteInteligente(${argumentoSeguro(p.id)})">Ver</button></td>
    </tr>
  `), "No hay grupos por coincidencia para mostrar con los filtros actuales.");
}

function bloquePaquetesInteligentes(simulacion, paquetes, tamanoActual) {
  return `
    <section class="card subcard smart-package-wrap">
      <div class="section-head">
        <div>
          <h3>Grupos recomendados por coincidencia de productos</h3>
        </div>
        <div class="filters">
          <select class="select-filter" id="filtroSimInteligenteTamano" onchange="renderPlanMultiPiso()">
            <option value="5" ${tamanoActual !== "10" ? "selected" : ""}>Grupos de 5 LPNs</option>
            <option value="10" ${tamanoActual === "10" ? "selected" : ""}>Grupos de 10 LPNs</option>
          </select>
          <button onclick="exportarSimulacionCincoPallets()">Excel completo</button>
        </div>
      </div>
      <p class="muted-note">Primero escoge LPNs de piso que no son IC962. Luego busca IC962 solo si comparte codigos para completar pallet, rackear, ingresar a activo o acoplar en reserva.</p>
      <section class="kpi-grid compact">
        ${kpi("Grupos", fmt(paquetes.length), `base de ${fmt(simulacion.total.pallets)} LPNs`)}
        ${kpi("LPNs OTROS", fmt(paquetes.reduce((a, b) => a + b.lpnsCount, 0)), "seleccionados para trabajar")}
        ${kpi("Complemento IC962", fmt(paquetes.reduce((a, b) => a + b.complementosCount, 0)), "por coincidencia de producto")}
        ${kpi("Codigos comunes", fmt(paquetes.reduce((a, b) => a + b.codigosComunes, 0)), "productos repetidos entre LPNs")}
        ${kpi("Pallets completos", fmt(paquetes.reduce((a, b) => a + b.palletsFormables, 0)), "formables por max aprendido")}
      </section>
      <div class="sim-scroll-table">
        ${tablaPaquetesInteligentes(paquetes)}
      </div>
    </section>
  `;
}

function abrirDetallePaqueteInteligente(id) {
  const paquete = detallePaquetesInteligentes.get(id);
  const destino = document.getElementById("modalControlPiso");
  if (!destino) return;
  if (!paquete) {
    destino.innerHTML = `<div class="modal-card"><button class="ghost" onclick="cerrarControlPisoModal()">Cerrar</button><p>Sin detalle para mostrar.</p></div>`;
    destino.hidden = false;
    return;
  }

  const filasLpnDetalle = [...paquete.filas, ...paquete.complementos];
  const resumenLpns = tablaConId("tablaDetallePaqueteLpns", ["LPN", "Tipo", "Rol", "Ubicacion piso", "Codigos", "Productos", "Bultos", "Unidades", "Antig.", "Prioridad", "Estado"], filasLpnDetalle.map(r => `
    <tr class="${r.completo ? "ok" : "warn"}">
      <td><strong>${htmlSeguro(r.lpn)}</strong></td>
      <td>${htmlSeguro(r.tipoLpn)}</td>
      <td><strong>${r.tipoLpn === "IC962" ? "COMPLEMENTO" : "BASE OTROS"}</strong></td>
      <td>${htmlSeguro(r.ubicacionesTxt)}</td>
      <td class="number">${fmt(r.codigosCount)}</td>
      <td class="number">${fmt(r.productosCount)}</td>
      <td class="number"><strong>${fmt(r.bultos)}</strong></td>
      <td class="number">${fmt(r.unidades)}</td>
      <td class="number">${fmt(r.antiguedad)}</td>
      <td><strong>${htmlSeguro(r.prioridad)}</strong></td>
      <td>${htmlSeguro(r.estado)}</td>
    </tr>
  `), "Sin LPNs.");

  const detalleProductos = tablaConId("tablaDetallePaqueteProductos", ["Codigo", "Descripcion", "LPNs", "OTROS", "IC962", "Bultos", "Unidades", "Max pallet", "%", "Pallets", "Saldo", "Decision", "Destino", "Motivo"], paquete.productos.map(d => `
    <tr class="${d.decision.includes("PENDIENTE") ? "warn" : "ok"}">
      <td><strong>${htmlSeguro(d.codigo)}</strong><br><small>${htmlSeguro(d.codigoAlt)}</small></td>
      <td>${htmlSeguro(d.descripcion)}</td>
      <td>${htmlSeguro(d.lpnsTxt)}</td>
      <td class="number">${fmt(d.lpnsOtrosCount)}</td>
      <td class="number">${fmt(d.lpnsIc962Count)}</td>
      <td class="number"><strong>${fmt(d.bultos)}</strong></td>
      <td class="number">${fmt(d.unidades)}</td>
      <td class="number">${d.maximo ? fmt(d.maximo) : "VALIDAR"}</td>
      <td class="number">${d.maximo ? `${d.pct.toFixed(1)}%` : "-"}</td>
      <td class="number"><strong>${fmt(d.pallets)}</strong></td>
      <td class="number">${fmt(d.saldo)}</td>
      <td><strong>${htmlSeguro(d.decision)}</strong></td>
      <td>${htmlSeguro(d.destino)}</td>
      <td>${htmlSeguro(d.motivo)}</td>
    </tr>
  `), "Sin productos.");

  destino.innerHTML = `
    <div class="modal-card wide">
      <div class="section-head">
        <div>
          <h2>${htmlSeguro(paquete.id)} por coincidencia</h2>
          <p class="muted-note">${fmt(paquete.lpnsCount)} LPNs OTROS | ${fmt(paquete.complementosCount)} IC962 complemento | ${fmt(paquete.palletsFormables)} pallets formables.</p>
        </div>
        <div class="filters">
          <button onclick="exportarPaqueteInteligenteDetalle(${argumentoSeguro(paquete.id)})">Excel detalle</button>
          <button class="ghost" onclick="cerrarControlPisoModal()">Cerrar</button>
        </div>
      </div>
      <div class="smart-package-detail">
        <section>
          <h3>LPNs del paquete</h3>
          ${resumenLpns}
        </section>
        <section>
          <h3>Productos a resolver</h3>
          ${detalleProductos}
        </section>
      </div>
    </div>
  `;
  destino.hidden = false;
}

function calcularUnificacionProductoPiso() {
  const contexto = {
    maximos: maxPalletAprendidoPlan(),
    pedido: pedidoNoAsignadoPorProducto()
  };
  const porProducto = new Map();

  consolidarControlPisoPorLpnProducto()
    .filter(row => esGrupoPisoOperativo(row.grupo))
    .forEach(row => {
      if (!row.codigo || !row.lpn || num(row.stock) <= 0) return;
      if (!porProducto.has(row.codigo)) {
        porProducto.set(row.codigo, {
          id: row.codigo,
          codigo: row.codigo,
          codigoAlt: row.codigoAlt,
          descripcion: row.descripcion,
          lpns: new Set(),
          ubicaciones: new Set(),
          grupos: new Set(),
          bultos: 0,
          unidades: 0,
          antiguedad: 0,
          detalle: []
        });
      }
      const item = porProducto.get(row.codigo);
      item.lpns.add(row.lpn);
      item.ubicaciones.add(row.ubicacion);
      item.grupos.add(row.grupo);
      item.bultos += num(row.stock);
      item.unidades += num(row.unidades);
      item.antiguedad = Math.max(item.antiguedad, num(row.antiguedad));
      item.detalle.push({
        ...row,
        ...destinoProductoSimulacionCinco(row, contexto)
      });
    });

  detalleUnificacionProductoPiso = new Map();
  return Array.from(porProducto.values())
    .filter(item => item.lpns.size >= 2)
    .map(item => {
      const maximo = num(contexto.maximos[item.codigo]?.maximo);
      const pedido = contexto.pedido.get(item.codigo);
      const pctPallet = maximo > 0 ? pctLimitado(item.bultos, maximo) : 0;
      const reserva = reservasIncompletasPlan(item.codigo, maximo);
      const reservaOk = reserva.find(r => maximo <= 0 || num(r.stock) + num(item.bultos) <= maximo * 1.05);
      const activoOk = detalleActivoProducto(item.codigo).find(a => a.capacidadDinamica || num(a.disponibleBultos) >= num(item.bultos));

      let accion = "VALIDAR FISICO";
      let prioridad = "MEDIA";
      let motivo = "Producto repetido en piso, pero sin maximo aprendido suficiente.";
      let score = item.bultos + item.antiguedad * 100 + item.lpns.size * 250;

      if (maximo > 0 && item.bultos >= maximo) {
        accion = "FORMAR PALLET COMPLETO";
        prioridad = "ALTA";
        motivo = `Los LPNs de piso suman ${pctPallet.toFixed(1)}% del pallet aprendido.`;
        score += 12000;
      } else if (maximo > 0 && item.bultos >= maximo * 0.5) {
        accion = "FORMAR PALLET PARA RACK";
        prioridad = "ALTA";
        motivo = `Supera el 50% del pallet aprendido (${fmt(maximo)} bultos).`;
        score += 9000;
      } else if (reservaOk) {
        accion = "ACOPLAR A RESERVA";
        prioridad = "ALTA";
        motivo = `Puede acoplarse con reserva existente ${reservaOk.ubicacion}.`;
        score += 7000;
      } else if (activoOk) {
        accion = "INGRESAR A ACTIVO";
        prioridad = "MEDIA";
        motivo = `Activo disponible en ${activoOk.ubicacion}.`;
        score += 5000;
      } else if (item.bultos < 15) {
        prioridad = "BAJA";
        motivo = "Menor a 15 bultos; dejar al final si no existe coincidencia mejor.";
        score -= 3000;
      }

      const row = {
        ...item,
        lpnsCount: item.lpns.size,
        ubicacionesTxt: Array.from(item.ubicaciones).sort(ordenarUbicacion).join(", "),
        gruposTxt: Array.from(item.grupos).sort().join(" / "),
        maximo,
        pctPallet,
        pedido: pedido?.bultos || 0,
        accion,
        prioridad,
        motivo,
        score
      };
      detalleUnificacionProductoPiso.set(row.id, row);
      return row;
    })
    .filter(row => row.accion.includes("FORMAR") || row.accion === "ACOPLAR A RESERVA" || (row.bultos >= 15 && row.lpnsCount >= 2))
    .sort((a, b) => b.score - a.score || b.bultos - a.bultos || b.lpnsCount - a.lpnsCount);
}

function tablaUnificacionProductoPiso(data) {
  return tablaConId("tablaUnificacionProductoPiso", ["Prioridad", "Accion", "Codigo", "Descripcion", "LPNs piso", "Bultos", "Unidades", "Max pallet", "% pallet", "Pedido", "Ubicaciones piso", "Motivo", "Ver"], data.map(r => `
    <tr class="${r.prioridad === "ALTA" ? "warn" : ""}">
      <td><strong>${htmlSeguro(r.prioridad)}</strong></td>
      <td><strong>${htmlSeguro(r.accion)}</strong></td>
      <td><strong>${htmlSeguro(r.codigo)}</strong><br><small>${htmlSeguro(r.codigoAlt)}</small></td>
      <td>${htmlSeguro(r.descripcion)}</td>
      <td class="number"><strong>${fmt(r.lpnsCount)}</strong></td>
      <td class="number"><strong>${fmt(r.bultos)}</strong></td>
      <td class="number">${fmt(r.unidades)}</td>
      <td class="number">${r.maximo ? fmt(r.maximo) : "SIN MAX"}</td>
      <td class="number">${r.maximo ? `${r.pctPallet.toFixed(1)}%` : "-"}</td>
      <td class="number">${fmt(r.pedido)}</td>
      <td>${htmlSeguro(r.ubicacionesTxt)}</td>
      <td>${htmlSeguro(r.motivo)}</td>
      <td><button class="compact" onclick="abrirDetalleUnificacionProductoPiso(${argumentoSeguro(r.id)})">Ver</button></td>
    </tr>
  `), "No hay productos repetidos en piso que sumen prioridad.");
}

function bloqueUnificacionProductoPiso(data) {
  return `
    <section class="card subcard smart-package-wrap">
      <div class="section-head">
        <div>
          <h3>Sugerencia para formar pallet por coincidencia</h3>
        </div>
        <span class="muted-note">${fmt(data.length)} productos candidatos</span>
      </div>
      <p class="muted-note">Agrupa productos repetidos en LPNs de piso para formar un pallet valido, rackearlo o acoplarlo en reserva.</p>
      <div class="sim-scroll-table">
        ${tablaUnificacionProductoPiso(data)}
      </div>
    </section>
  `;
}

function resumenDestinoPiso(d) {
  if (d.destino === "RESERVA / ACOPLE") return `Acoplar en ${d.destinoUbicacion || d.ubicaciones}`;
  if (d.destino === "ACTIVO") return `Ingresar a ${d.destinoUbicacion || d.ubicaciones}`;
  if (d.destino === "RESERVA NUEVA") return "Formar pallet para reserva";
  if (d.destino === "PENDIENTE") return "Validar manual";
  return d.destino || "Ver detalle";
}

function registrarDetalleDestinoPiso(prefijo, parentId, index, d, extra = {}) {
  const id = `${prefijo}|${normalizar(parentId)}|${index}`;
  detalleDestinoPiso.set(id, { ...d, ...extra });
  return id;
}

function cerrarDetalleDestinoPiso() {
  document.getElementById("modalDestinoPisoDetalle")?.remove();
}

function abrirDetalleDestinoPiso(id) {
  const d = detalleDestinoPiso.get(id);
  const padre = document.getElementById("modalControlPiso");
  if (!padre) return;
  cerrarDetalleDestinoPiso();
  if (!d) {
    padre.insertAdjacentHTML("beforeend", `<div id="modalDestinoPisoDetalle" class="modal-child"><div class="modal-card"><button class="ghost" onclick="cerrarDetalleDestinoPiso()">Cerrar</button><p>Sin detalle para mostrar.</p></div></div>`);
    return;
  }
  padre.insertAdjacentHTML("beforeend", `
    <div id="modalDestinoPisoDetalle" class="modal-child">
    <div class="modal-card detail-modal">
      <div class="section-head">
        <div>
          <h2>${htmlSeguro(d.destino || d.accion || "Detalle operativo")}</h2>
          <p class="muted-note">${htmlSeguro(d.codigo || "")} | ${htmlSeguro(d.descripcion || "")}</p>
        </div>
        <button class="ghost" onclick="cerrarDetalleDestinoPiso()">Cerrar</button>
      </div>
      <section class="kpi-grid compact">
        ${kpi("LPN origen", htmlSeguro(d.lpn || ""), htmlSeguro(d.ubicacion || "sin ubicacion"))}
        ${kpi("Bultos origen", fmt(d.stock), `${fmt(d.unidades)} unidades`)}
        ${kpi("Destino", htmlSeguro(d.destino || ""), htmlSeguro(d.destinoUbicacion || d.ubicaciones || ""))}
        ${kpi("Disponible", htmlSeguro(d.destinoDisponible || ""), d.destinoLpn ? `LPN ${htmlSeguro(d.destinoLpn)}` : "destino sugerido")}
      </section>
      ${tablaConId("tablaMotivoDestinoPiso", ["Campo", "Detalle"], [
        ["Codigo", d.codigo],
        ["Cod alternativo", d.codigoAlt],
        ["Producto", d.descripcion],
        ["LPN origen", d.lpn],
        ["Ubicacion origen", d.ubicacion],
        ["Bultos origen", fmt(d.stock)],
        ["Unidades origen", fmt(d.unidades)],
        ["Antiguedad", fmt(d.antiguedad)],
        ["Destino sugerido", d.destino],
        ["Ubicacion destino", d.destinoUbicacion || d.ubicaciones],
        ["LPN destino", d.destinoLpn || ""],
        ["Stock destino", d.destinoStock === "" ? "" : fmt(d.destinoStock)],
        ["Disponible destino", d.destinoDisponible || ""],
        ["Pedido no asignado", fmt(d.pedido || 0)],
        ["Motivo", d.motivo]
      ].map(([campo, valor]) => `
        <tr>
          <td><strong>${htmlSeguro(campo)}</strong></td>
          <td>${htmlSeguro(valor)}</td>
        </tr>
      `), "Sin detalle.")}
    </div>
    </div>
  `);
}

function abrirDetalleUnificacionProductoPiso(id) {
  const row = detalleUnificacionProductoPiso.get(id);
  const destino = document.getElementById("modalControlPiso");
  if (!destino) return;
  if (!row) {
    destino.innerHTML = `<div class="modal-card"><button class="ghost" onclick="cerrarControlPisoModal()">Cerrar</button><p>Sin detalle para mostrar.</p></div>`;
    destino.hidden = false;
    return;
  }
  const planGrupo = planUnificacionProducto(row);
  const detalleVista = row.detalle.map(d => ({
    ...d,
    destino: planGrupo.destino,
    destinoUbicacion: planGrupo.ubicacion,
    destinoLpn: planGrupo.lpn,
    destinoStock: planGrupo.stock,
    destinoDisponible: planGrupo.disponible,
    motivo: planGrupo.motivo
  }));
  destino.innerHTML = `
    <div class="modal-card wide">
      <div class="section-head">
        <div>
          <h2>${htmlSeguro(row.codigo)} | ${htmlSeguro(row.descripcion)}</h2>
          <p class="muted-note">${fmt(row.lpnsCount)} LPNs en piso | ${fmt(row.bultos)} bultos | ${htmlSeguro(row.accion)}</p>
        </div>
        <div class="filters">
          <button onclick="exportarUnificacionProductoDetalle(${argumentoSeguro(row.id)})">Excel detalle</button>
          <button class="ghost" onclick="cerrarControlPisoModal()">Cerrar</button>
        </div>
      </div>
      ${tablaConId("tablaPlanGrupoUnificacion", ["Decision grupo", "Max pallet", "Bultos piso", "Pallets a formar", "Saldo", "Destino saldo", "Observacion"], [`
        <tr class="${planGrupo.saldo > 0 ? "warn" : "ok"}">
          <td><strong>${htmlSeguro(planGrupo.destino)}</strong></td>
          <td class="number">${row.maximo ? fmt(row.maximo) : "VALIDAR"}</td>
          <td class="number"><strong>${fmt(row.bultos)}</strong></td>
          <td class="number"><strong>${fmt(planGrupo.pallets)}</strong></td>
          <td class="number">${fmt(planGrupo.saldo)}</td>
          <td>${htmlSeguro(planGrupo.destinoSaldo)}</td>
          <td>${htmlSeguro(planGrupo.motivo)}</td>
        </tr>
      `], "Sin decision grupal.")}
      ${tablaConId("tablaDetalleUnificacionProducto", ["LPN origen", "Ubicacion piso", "Bultos", "Unidades", "Antig.", "Destino", "Ubicacion destino", "Disponible", "Resumen", "Ver"], detalleVista.map((d, index) => {
        const detalleId = registrarDetalleDestinoPiso("UNI", row.id, index, d);
        return `
          <tr class="${d.estado === "DESAPARECE" ? "ok" : "warn"}">
            <td><strong>${htmlSeguro(d.lpn)}</strong><br><small>${htmlSeguro(d.grupo)}</small></td>
            <td>${htmlSeguro(d.ubicacion)}</td>
            <td class="number"><strong>${fmt(d.stock)}</strong></td>
            <td class="number">${fmt(d.unidades)}</td>
            <td class="number">${fmt(d.antiguedad)}</td>
            <td><strong>${htmlSeguro(d.destino)}</strong></td>
            <td>${htmlSeguro(d.destinoUbicacion || d.ubicaciones)}</td>
            <td class="number">${htmlSeguro(d.destinoDisponible || "")}</td>
            <td>${htmlSeguro(resumenDestinoPiso(d))}</td>
            <td><button class="compact" onclick="abrirDetalleDestinoPiso(${argumentoSeguro(detalleId)})">Ver</button></td>
          </tr>
        `;
      }), "Sin LPNs de piso para este producto.")}
    </div>
  `;
  destino.hidden = false;
}

function planUnificacionProducto(row) {
  if (!row.accion.includes("FORMAR")) {
    const primero = row.detalle[0] || {};
    return {
      destino: primero.destino || row.accion,
      ubicacion: primero.destinoUbicacion || primero.ubicaciones || "",
      lpn: primero.destinoLpn || "",
      stock: primero.destinoStock ?? "",
      disponible: primero.destinoDisponible || "",
      pallets: 0,
      saldo: 0,
      destinoSaldo: row.accion,
      motivo: row.motivo
    };
  }

  const maximo = num(row.maximo);
  const pallets = maximo > 0 ? Math.max(1, Math.floor(num(row.bultos) / maximo)) : 1;
  const bultosRack = maximo > 0 ? pallets * maximo : num(row.bultos);
  const saldo = maximo > 0 ? Math.max(0, num(row.bultos) - bultosRack) : 0;
  const reservaSaldo = saldo > 0
    ? reservasIncompletasPlan(row.codigo, maximo).find(r => maximo <= 0 || num(r.stock) + saldo <= maximo * 1.05)
    : null;
  const activoSaldo = saldo > 0
    ? detalleActivoProducto(row.codigo).find(a => a.capacidadDinamica || num(a.disponibleBultos) >= saldo)
    : null;
  let destinoSaldo = "Sin saldo";
  if (saldo > 0 && reservaSaldo) destinoSaldo = `Acoplar saldo en ${reservaSaldo.ubicacion}`;
  else if (saldo > 0 && activoSaldo) destinoSaldo = `Ingresar saldo a activo ${activoSaldo.ubicacion}`;
  else if (saldo > 0) destinoSaldo = "Validar saldo fisicamente";

  const motivoSaldo = saldo > 0
    ? ` Queda saldo de ${fmt(saldo)} bultos: ${destinoSaldo}.`
    : " No queda saldo en piso.";

  return {
    destino: "JUNTAR Y FORMAR PALLET",
    ubicacion: "Pallet nuevo para reserva",
    lpn: reservaSaldo?.lpn || "",
    stock: reservaSaldo?.stock ?? "",
    disponible: maximo > 0 ? fmt(maximo) : "VALIDAR",
    pallets,
    saldo,
    destinoSaldo,
    motivo: `Juntar ${fmt(row.lpnsCount)} LPNs de piso y formar ${fmt(pallets)} pallet(s) de ${maximo > 0 ? fmt(maximo) : "maximo a validar"} bultos.${motivoSaldo}`
  };
}

function abrirDetalleSimulacionCinco(id) {
  const row = detalleSimulacionCincoPallets.get(id);
  const destino = document.getElementById("modalControlPiso");
  if (!destino) return;
  if (!row) {
    destino.innerHTML = `<div class="modal-card"><button class="ghost" onclick="cerrarControlPisoModal()">Cerrar</button><p>Sin detalle para mostrar.</p></div>`;
    destino.hidden = false;
    return;
  }
  destino.innerHTML = `
    <div class="modal-card wide">
      <div class="section-head">
        <div>
          <h2>Simulacion LPN ${htmlSeguro(row.lpn)}</h2>
          <p class="muted-note">${fmt(row.bultos)} bultos | ${fmt(row.productosCount)} productos | objetivo: no dejar nada en piso.</p>
        </div>
        <div class="filters">
          <button onclick="exportarSimulacionCincoDetalle(${argumentoSeguro(row.id)})">Excel detalle</button>
          <button class="ghost" onclick="cerrarControlPisoModal()">Cerrar</button>
        </div>
      </div>
      ${tablaConId("tablaDetalleSimulacionCinco", ["Codigo", "Descripcion", "Ubicacion piso", "Bultos", "Unidades", "Destino", "Ubicacion destino", "Disponible", "Pedido", "Resumen", "Ver"], row.detalle.map((d, index) => {
        const detalleId = registrarDetalleDestinoPiso("SIM", row.id, index, d);
        return `
          <tr class="${d.estado === "DESAPARECE" ? "ok" : "warn"}">
            <td><strong>${htmlSeguro(d.codigo)}</strong><br><small>${htmlSeguro(d.codigoAlt)}</small></td>
            <td>${htmlSeguro(d.descripcion)}</td>
            <td>${htmlSeguro(d.ubicacion)}</td>
            <td class="number"><strong>${fmt(d.stock)}</strong></td>
            <td class="number">${fmt(d.unidades)}</td>
            <td><strong>${htmlSeguro(d.destino)}</strong></td>
            <td>${htmlSeguro(d.destinoUbicacion || d.ubicaciones)}</td>
            <td class="number">${htmlSeguro(d.destinoDisponible || "")}</td>
            <td class="number">${fmt(d.pedido)}</td>
            <td>${htmlSeguro(resumenDestinoPiso(d))}</td>
            <td><button class="compact" onclick="abrirDetalleDestinoPiso(${argumentoSeguro(detalleId)})">Ver</button></td>
          </tr>
        `;
      }), "Sin detalle.")}
    </div>
  `;
  destino.hidden = false;
}

function renderPlanMultiPiso() {
  const contenedor = document.getElementById("controlPisoContenido");
  try {
    const data = calcularPlanMultiPiso();
    const simAntiguedadActual = limpiar(document.getElementById("filtroSimCincoAntiguedad")?.value);
    const simCodigosActual = limpiar(document.getElementById("filtroSimCincoCodigos")?.value);
    const simEstadoActual = limpiar(document.getElementById("filtroSimCincoEstado")?.value);
    const simPrioridadActual = limpiar(document.getElementById("filtroSimCincoPrioridad")?.value);
    const simTamanoInteligenteActual = limpiar(document.getElementById("filtroSimInteligenteTamano")?.value) || "5";
    const simulacion = calcularSimulacionCincoPallets();
    const unificacionProductos = calcularUnificacionProductoPiso();
    const paquetesInteligentes = calcularPaquetesInteligentes(simulacion);
    const acciones = [...new Set(data.filas.map(r => r.accion))];
    const lpnActual = limpiar(document.getElementById("filtroPlanMultiPisoLpn")?.value || filtrosPlanMultiPiso.lpn);
    const productoActual = limpiar(document.getElementById("filtroPlanMultiPisoProducto")?.value || filtrosPlanMultiPiso.producto);
    const accionActual = limpiar(document.getElementById("filtroAccionPlanMultiPiso")?.value);
    const prioridadActual = limpiar(document.getElementById("filtroPrioridadPlanMultiPiso")?.value);
    filtrosPlanMultiPiso = { lpn: lpnActual, producto: productoActual };
    const filtroActivo = ["filtroPlanMultiPisoLpn", "filtroPlanMultiPisoProducto"].includes(document.activeElement?.id)
      ? document.activeElement.id
      : "";
    const visible = filtrarPlanMultiPiso(data.filas);

    contenedor.innerHTML = `
      <section class="kpi-grid compact">
        ${kpi("Bultos piso", fmt(data.total.bultos), `${fmt(data.total.lpns)} LPNs`)}
        ${kpi("Productos", fmt(data.total.productos), "agrupado sin duplicidad")}
        ${kpi("Alta prioridad", fmt(data.total.alta), "pedido, rackeo o acople", data.total.alta ? "warn" : "")}
        ${kpi("Pedido detectado", fmt(data.total.pedido), "aparece en no asignado", data.total.pedido ? "danger" : "")}
        ${kpi("Rackear", fmt(data.total.rackear), ">= 50% pallet")}
        ${kpi("Acoplar", fmt(data.total.acoplar), "reserva incompleta")}
      </section>

      <section class="card subcard">
        <div class="section-head">
          <div>
            <h2>Sugerencias para limpiar piso</h2>
          </div>
          <div class="filters grow plan-multi-filters">
            <select class="select-filter" id="filtroSimCincoAntiguedad" onchange="renderPlanMultiPiso()">
              <option value="">Toda antiguedad</option>
              <option value="0" ${simAntiguedadActual === "0" ? "selected" : ""}>0 dias</option>
              <option value="1" ${simAntiguedadActual === "1" ? "selected" : ""}>1 dia</option>
              <option value="MAS_1" ${simAntiguedadActual === "MAS_1" ? "selected" : ""}>Mayor a 1 dia</option>
            </select>
            <select class="select-filter" id="filtroSimCincoCodigos" onchange="renderPlanMultiPiso()">
              <option value="">Todos los codigos</option>
              <option value="1" ${simCodigosActual === "1" ? "selected" : ""}>1 codigo</option>
              <option value="2" ${simCodigosActual === "2" ? "selected" : ""}>2 codigos</option>
              <option value="3" ${simCodigosActual === "3" ? "selected" : ""}>3+ codigos</option>
            </select>
            <select class="select-filter" id="filtroSimCincoEstado" onchange="renderPlanMultiPiso()">
              <option value="DESAPARECE" ${!simEstadoActual || simEstadoActual === "DESAPARECE" ? "selected" : ""}>Todo el LPN desaparece</option>
              <option value="TODOS" ${simEstadoActual === "TODOS" ? "selected" : ""}>Todo resultado</option>
              <option value="VALIDAR" ${simEstadoActual === "VALIDAR" ? "selected" : ""}>Con pendientes</option>
            </select>
            <select class="select-filter" id="filtroSimCincoPrioridad" onchange="renderPlanMultiPiso()">
              <option value="">Toda prioridad</option>
              ${["ALTA", "MEDIA", "BAJA"].map(p => `<option value="${p}" ${simPrioridadActual === p ? "selected" : ""}>${p}</option>`).join("")}
            </select>
            <button onclick="exportarSimulacionCincoPallets()">Excel simulacion</button>
          </div>
        </div>
        <section class="kpi-grid compact">
          ${kpi("LPNs evaluados", fmt(simulacion.total.pallets), `${fmt(simulacion.total.completos)} desaparecen completos`)}
          ${kpi("Productos", fmt(simulacion.total.productos), "dentro de LPNs de piso")}
          ${kpi("Bultos", fmt(simulacion.total.bultos), `${fmt(simulacion.total.unidades)} unidades`)}
          ${kpi("Pendientes", fmt(simulacion.total.pendientes), "deben validarse", simulacion.total.pendientes ? "warn" : "")}
        </section>
        ${bloqueUnificacionProductoPiso(unificacionProductos)}
        ${bloquePaquetesInteligentes(simulacion, paquetesInteligentes, simTamanoInteligenteActual)}
        ${bloqueSimulacionCincoPallets(simulacion)}
      </section>

      <section class="card subcard">
        <div class="section-head">
          <div>
            <h2>Plan multi piso</h2>
          </div>
          <div class="filters grow">
            <input class="search" id="filtroPlanMultiPisoLpn" value="${atributoSeguro(lpnActual)}" placeholder="Buscar por LPN..." oninput="filtrarPlanMultiPisoConPausa()">
            <input class="search" id="filtroPlanMultiPisoProducto" value="${atributoSeguro(productoActual)}" placeholder="Buscar codigo o descripcion..." oninput="filtrarPlanMultiPisoConPausa()">
            <select class="select-filter" id="filtroAccionPlanMultiPiso" onchange="renderPlanMultiPiso()">
              <option value="">Todas las acciones</option>
              ${acciones.map(a => `<option value="${atributoSeguro(a)}" ${accionActual === a ? "selected" : ""}>${htmlSeguro(a)}</option>`).join("")}
            </select>
            <select class="select-filter" id="filtroPrioridadPlanMultiPiso" onchange="renderPlanMultiPiso()">
              <option value="">Todas las prioridades</option>
              ${["ALTA", "MEDIA", "BAJA"].map(p => `<option value="${p}" ${prioridadActual === p ? "selected" : ""}>${p}</option>`).join("")}
            </select>
            <button onclick="exportarPlanMultiPiso()">Excel plan</button>
          </div>
        </div>
        <p class="muted-note">Regla: prioridad a no asignado, luego formar pallet desde 50% del max aprendido, acoplar reserva, activo disponible y al final menores a 15 sin match.</p>
        ${tablaPlanMultiPiso("tablaPlanMultiPiso", visible)}
      </section>
    `;
    const filtro = filtroActivo ? document.getElementById(filtroActivo) : null;
    if (filtro) {
      filtro.focus();
      filtro.setSelectionRange(filtro.value.length, filtro.value.length);
    }
  } catch (error) {
    console.error("No se pudo renderizar Plan multi piso", error);
    if (contenedor) {
      contenedor.innerHTML = `<section class="notice danger">No se pudo construir el Plan multi piso: ${htmlSeguro(error.message || error)}</section>`;
    }
  }
}

function clasePrioridadPlan(prioridad) {
  if (prioridad === "ALTA") return "bad";
  if (prioridad === "MEDIA") return "warn";
  return "";
}

function tablaPlanMultiPiso(tablaId, data) {
  return tablaConId(tablaId, ["Prioridad", "Accion", "Codigo", "Descripcion", "Bultos piso", "Unidades", "LPNs", "Antig.", "Max pallet", "% pallet", "Pedido", "Activo", "Reserva", "Motivo", "Ver"], data.map(r => `
    <tr class="${clasePrioridadPlan(r.prioridad)}">
      <td><strong>${htmlSeguro(r.prioridad)}</strong></td>
      <td><strong>${htmlSeguro(r.accion)}</strong></td>
      <td><strong>${htmlSeguro(r.codigo)}</strong><br><small>${htmlSeguro(r.codigoAlt)}</small></td>
      <td>${htmlSeguro(r.descripcion)}</td>
      <td class="number"><strong>${fmt(r.bultos)}</strong></td>
      <td class="number">${fmt(r.unidades)}</td>
      <td class="number">${fmt(r.lpnsCount)}</td>
      <td class="number">${fmt(r.antiguedad)}</td>
      <td class="number">${r.maximo ? fmt(r.maximo) : "Validar"}</td>
      <td class="number">${r.maximo ? `${r.pctPallet.toFixed(1)}%` : "-"}</td>
      <td class="number">${r.pedido ? fmt(r.pedido.bultos) : "0"}</td>
      <td class="number">${fmt(r.activo.filter(a => a.ingresaTodo).length)} / ${fmt(r.activo.length)}</td>
      <td class="number">${fmt(r.reserva.length)}</td>
      <td>${htmlSeguro(r.motivo)}</td>
      <td><button class="compact" onclick="abrirDetallePlanMultiPiso(${argumentoSeguro(r.id)})">Ver</button></td>
    </tr>
  `), "No hay productos de piso para planificar.");
}

function destinoOperativoPlan(row) {
  const activoOk = row.activo.find(a => a.ingresaTodo) || row.activo.find(a => a.ingresaAlgo);
  const reservaOk = row.mejorReserva || row.reserva[0];
  if (row.accion === "Ingresar a activo" && activoOk) {
    return {
      tipo: "ACTIVO",
      ubicacion: activoOk.ubicacion,
      lpn: "",
      stock: activoOk.bultos,
      disponible: activoOk.capacidadDinamica ? "SIN LIMITE" : fmt(activoOk.disponibleBultos),
      detalle: `Mover ${fmt(row.bultos)} bultos de piso al activo ${activoOk.ubicacion}.`
    };
  }
  if (row.accion === "Parcial a activo" && activoOk) {
    return {
      tipo: "ACTIVO PARCIAL",
      ubicacion: activoOk.ubicacion,
      lpn: "",
      stock: activoOk.bultos,
      disponible: activoOk.capacidadDinamica ? "SIN LIMITE" : fmt(activoOk.disponibleBultos),
      detalle: `Activo ${activoOk.ubicacion} recibe parte; validar saldo de ${fmt(activoOk.faltanteBultos)} bultos.`
    };
  }
  if (row.accion === "Acoplar a reserva" && reservaOk) {
    const faltante = row.maximo > 0 ? Math.max(0, row.maximo - num(reservaOk.stock)) : "";
    return {
      tipo: "RESERVA / ACOPLE",
      ubicacion: reservaOk.ubicacion,
      lpn: reservaOk.lpn,
      stock: reservaOk.stock,
      disponible: faltante === "" ? "VALIDAR" : fmt(faltante),
      detalle: `Acoplar ${fmt(row.bultos)} bultos de piso con ${reservaOk.lpn} en ${reservaOk.ubicacion}.`
    };
  }
  if (row.accion === "Unificar y rackear") {
    return {
      tipo: "RESERVA NUEVA",
      ubicacion: "Ubicacion libre reserva",
      lpn: "",
      stock: 0,
      disponible: row.maximo ? fmt(row.maximo) : "VALIDAR",
      detalle: `Unificar LPNs de piso y formar pallet para rackear (${row.maximo ? `${row.pctPallet.toFixed(1)}% del max` : "validar max"}).`
    };
  }
  if (row.accion === "Atacar pedido") {
    return {
      tipo: "PEDIDO NO ASIGNADO",
      ubicacion: row.pedido ? Array.from(row.pedido.fechas).join(", ") : "",
      lpn: "",
      stock: row.pedido?.bultos || 0,
      disponible: "",
      detalle: `Producto solicitado por no asignado: ${fmt(row.pedido?.bultos || 0)} bultos.`
    };
  }
  return {
    tipo: row.accion,
    ubicacion: "",
    lpn: "",
    stock: "",
    disponible: "",
    detalle: row.resultado || row.motivo
  };
}

function abrirDetallePlanMultiPiso(id) {
  const row = detallePlanMultiPiso.get(id);
  const destino = document.getElementById("modalControlPiso");
  if (!destino) return;
  if (!row) {
    destino.innerHTML = `<div class="modal-card"><button class="ghost" onclick="cerrarControlPisoModal()">Cerrar</button><p>Sin detalle para mostrar.</p></div>`;
    destino.hidden = false;
    return;
  }
  destino.innerHTML = `
    <div class="modal-card wide">
      <div class="section-head">
        <div>
          <h2>${htmlSeguro(row.accion)} | ${htmlSeguro(row.codigo)}</h2>
          <p class="muted-note">${htmlSeguro(row.descripcion)} | ${fmt(row.bultos)} bultos piso | ${htmlSeguro(row.resultado)}</p>
        </div>
        <div class="filters">
          <button onclick="exportarPlanMultiPisoDetalle(${argumentoSeguro(row.id)})">Excel detalle</button>
          <button class="ghost" onclick="cerrarControlPisoModal()">Cerrar</button>
        </div>
      </div>
      <section class="kpi-grid compact">
        ${kpi("Bultos piso", fmt(row.bultos), `${fmt(row.lpnsCount)} LPNs`)}
        ${kpi("Max pallet", row.maximo ? fmt(row.maximo) : "Validar", row.maximo ? `${row.pctPallet.toFixed(1)}% formado` : "sin aprendizaje")}
        ${kpi("Pedido", row.pedido ? fmt(row.pedido.bultos) : "0", row.pedido ? Array.from(row.pedido.fechas).join(", ") : "sin no asignado")}
        ${kpi("Activo", `${fmt(row.activo.filter(a => a.ingresaTodo).length)} / ${fmt(row.activo.length)}`, "ubicaciones")}
        ${kpi("Reserva", fmt(row.reserva.length), "opciones acople")}
      </section>
      <h3>Destino operativo sugerido</h3>
      ${tablaConId("tablaDestinoPlanMulti", ["Destino", "Ubicacion destino", "LPN destino", "Stock destino", "Disponible destino", "Detalle"], (() => {
        const d = destinoOperativoPlan(row);
        return [`
          <tr class="${row.prioridad === "ALTA" ? "warn" : ""}">
            <td><strong>${htmlSeguro(d.tipo)}</strong></td>
            <td>${htmlSeguro(d.ubicacion)}</td>
            <td>${htmlSeguro(d.lpn)}</td>
            <td class="number">${d.stock === "" ? "" : fmt(d.stock)}</td>
            <td class="number">${htmlSeguro(d.disponible)}</td>
            <td>${htmlSeguro(d.detalle)}</td>
          </tr>
        `];
      })(), "Sin destino sugerido.")}
      <h3>Detalle de LPNs en piso</h3>
      ${tablaDetallePlanPiso(row.detalle)}
      <h3>Activo sugerido</h3>
      ${tablaControlPisoActivo(row.activo, row)}
      <h3>Reserva sugerida</h3>
      ${tablaControlPisoReserva(row.reserva)}
    </div>
  `;
  destino.hidden = false;
}

function tablaDetallePlanPiso(data) {
  return tablaConId("tablaDetallePlanPiso", ["Ubicacion", "Grupo", "LPN", "Codigo", "Descripcion", "Bultos", "Unidades", "Antiguedad"], data.map(r => `
    <tr class="${r.antiguedad > 1 ? "bad" : ""}">
      <td><strong>${htmlSeguro(r.ubicacion)}</strong></td>
      <td>${htmlSeguro(r.grupo)}</td>
      <td><strong>${htmlSeguro(r.lpn)}</strong></td>
      <td>${htmlSeguro(r.codigo)}</td>
      <td>${htmlSeguro(r.descripcion)}</td>
      <td class="number">${fmt(r.stock)}</td>
      <td class="number">${fmt(r.unidades)}</td>
      <td class="number">${fmt(r.antiguedad)}</td>
    </tr>
  `), "Sin LPNs en piso.");
}

function filasPlanMultiResumen(base) {
  return [
    ["PRIORIDAD", "ACCION", "COD_ALT", "CODIGO", "DESCRIPCION", "BULTOS_PISO", "UNIDADES", "LPNS", "UBICACIONES", "GRUPOS", "ANTIGUEDAD", "MAX_PALLET", "PORC_PALLET", "PEDIDO_NO_ASIGNADO", "DESTINO", "UBICACION_DESTINO", "LPN_DESTINO", "STOCK_DESTINO", "DISPONIBLE_DESTINO", "ACTIVOS", "ACTIVOS_INGRESAN", "RESERVAS", "MOTIVO", "RESULTADO"],
    ...base.map(r => {
      const d = destinoOperativoPlan(r);
      return [
        r.prioridad,
        r.accion,
        r.codigoAlt,
        r.codigo,
        r.descripcion,
        r.bultos,
        r.unidades,
        r.lpnsCount,
        r.ubicacionesTxt,
        r.gruposTxt,
        r.antiguedad,
        r.maximo || "",
        r.maximo ? r.pctPallet : "",
        r.pedido?.bultos || 0,
        d.tipo,
        d.ubicacion,
        d.lpn,
        d.stock,
        d.disponible,
        r.activo.length,
        r.activo.filter(a => a.ingresaTodo).length,
        r.reserva.length,
        r.motivo,
        r.resultado
      ];
    })
  ];
}

function filasPlanMultiLpns(base) {
  const filas = [["ACCION", "PRIORIDAD", "CODIGO", "DESCRIPCION", "UBICACION_ORIGEN", "GRUPO", "LPN_ORIGEN", "BULTOS_ORIGEN", "UNIDADES", "ANTIGUEDAD", "DESTINO", "UBICACION_DESTINO", "LPN_DESTINO", "STOCK_DESTINO", "DISPONIBLE_DESTINO", "MOTIVO"]];
  base.forEach(r => {
    const destino = destinoOperativoPlan(r);
    r.detalle.forEach(d => filas.push([
      r.accion,
      r.prioridad,
      r.codigo,
      r.descripcion,
      d.ubicacion,
      d.grupo,
      d.lpn,
      d.stock,
      d.unidades,
      d.antiguedad,
      destino.tipo,
      destino.ubicacion,
      destino.lpn,
      destino.stock,
      destino.disponible,
      r.motivo
    ]));
  });
  return filas;
}

function filasPlanMultiActivo(base) {
  const filas = [["ACCION", "CODIGO", "DESCRIPCION", "BULTOS_PISO", "UNIDADES_PISO", "UBICACION_ACTIVO", "STOCK_UND", "STOCK_BUL", "DISP_UND", "DISP_BUL", "INGRESA_TODO", "FALTA_UND", "FALTA_BUL"]];
  base.forEach(r => {
    if (!r.activo.length) {
      filas.push([r.accion, r.codigo, r.descripcion, r.bultos, r.unidades, "SIN ACTIVO", 0, 0, 0, 0, "NO", r.unidades, r.bultos]);
      return;
    }
    r.activo.forEach(a => filas.push([r.accion, r.codigo, r.descripcion, r.bultos, r.unidades, a.ubicacion, a.unidades, a.bultos, a.capacidadDinamica ? "SIN LIMITE" : a.disponibleUnidades, a.capacidadDinamica ? "SIN LIMITE" : a.disponibleBultos, a.ingresaTodo ? "SI" : "NO", a.faltanteUnidades, a.faltanteBultos]));
  });
  return filas;
}

function filasPlanMultiReserva(base) {
  const filas = [["ACCION", "CODIGO", "DESCRIPCION", "BULTOS_PISO", "UNIDADES_PISO", "UBICACION_RESERVA", "LPN_RESERVA", "STOCK_RESERVA", "UNIDADES_RESERVA", "ANTIGUEDAD_RESERVA", "MAX_PALLET", "FALTANTE_PALLET", "PORC_PALLET"]];
  base.forEach(r => {
    if (!r.reserva.length) {
      filas.push([r.accion, r.codigo, r.descripcion, r.bultos, r.unidades, "SIN RESERVA", "", 0, 0, "", r.maximo || "", "", ""]);
      return;
    }
    r.reserva.forEach(res => filas.push([r.accion, r.codigo, r.descripcion, r.bultos, r.unidades, res.ubicacion, res.lpn, res.stock, res.unidades, res.antiguedad, r.maximo || "", res.faltantePallet || "", res.pctPallet || ""]));
  });
  return filas;
}

function filasPlanMultiPedido(base) {
  return [
    ["CODIGO", "DESCRIPCION", "BULTOS_PISO", "PEDIDO_NO_ASIGNADO", "FECHAS", "ACCION"],
    ...base.filter(r => r.pedido).map(r => [
      r.codigo,
      r.descripcion,
      r.bultos,
      r.pedido.bultos,
      Array.from(r.pedido.fechas).join(", "),
      r.accion
    ])
  ];
}

function exportarPlanMultiPiso() {
  const base = filtrarPlanMultiPiso(calcularPlanMultiPiso().filas);
  if (!base.length) return alert("No hay datos para exportar.");
  descargarExcelHojas("plan_multi_piso", [
    { nombre: "Plan operativo", filas: filasPlanMultiResumen(base) },
    { nombre: "Detalle LPNs", filas: filasPlanMultiLpns(base) },
    { nombre: "Activo sugerido", filas: filasPlanMultiActivo(base) },
    { nombre: "Reserva sugerida", filas: filasPlanMultiReserva(base) },
    { nombre: "No asignado", filas: filasPlanMultiPedido(base) },
    { nombre: "Validar fisico", filas: filasPlanMultiResumen(base.filter(r => r.accion.includes("Validar"))) },
    { nombre: "Baja prioridad", filas: filasPlanMultiResumen(base.filter(r => r.prioridad === "BAJA")) }
  ]);
}

function exportarPlanMultiPisoDetalle(id) {
  const row = detallePlanMultiPiso.get(id);
  if (!row) return alert("No hay detalle para exportar.");
  const base = [row];
  descargarExcelHojas(`plan_multi_${row.codigo}`, [
    { nombre: "Plan", filas: filasPlanMultiResumen(base) },
    { nombre: "Detalle LPNs", filas: filasPlanMultiLpns(base) },
    { nombre: "Activo", filas: filasPlanMultiActivo(base) },
    { nombre: "Reserva", filas: filasPlanMultiReserva(base) },
    { nombre: "No asignado", filas: filasPlanMultiPedido(base) }
  ]);
}

function filasSimulacionCincoResumen(base) {
  const ordenPorTipo = new Map();
  return [
    ["TIPO_LPN", "GRUPO_5", "ORDEN", "LPN", "UBICACION_PISO", "GRUPO", "CODIGOS", "PRODUCTOS", "BULTOS", "UNIDADES", "ANTIGUEDAD", "PRIORIDAD", "DESTINO", "ESTADO", "PENDIENTES"],
    ...base.map((r, index) => {
      const ordenTipo = (ordenPorTipo.get(r.tipoLpn) || 0) + 1;
      ordenPorTipo.set(r.tipoLpn, ordenTipo);
      return [
      r.tipoLpn,
      Math.ceil(ordenTipo / 5),
      index + 1,
      r.lpn,
      r.ubicacionesTxt,
      r.gruposTxt,
      r.codigosCount,
      r.productosCount,
      r.bultos,
      r.unidades,
      r.antiguedad,
      r.prioridad,
      r.destinoTxt,
      r.estado,
      r.pendientes
    ];
    })
  ];
}

function filasSimulacionCincoDetalle(base) {
  const ordenPorTipo = new Map();
  const grupoPorLpn = new Map();
  base.forEach(r => {
    const ordenTipo = (ordenPorTipo.get(r.tipoLpn) || 0) + 1;
    ordenPorTipo.set(r.tipoLpn, ordenTipo);
    grupoPorLpn.set(r.id, Math.ceil(ordenTipo / 5));
  });
  const filas = [["TIPO_LPN", "GRUPO_5", "LPN", "UBICACION_PISO", "GRUPO", "COD_ALT", "CODIGO", "DESCRIPCION", "BULTOS_ORIGEN", "UNIDADES", "ANTIGUEDAD", "DESTINO", "UBICACION_DESTINO", "LPN_DESTINO", "STOCK_DESTINO", "DISPONIBLE_DESTINO", "PEDIDO_NO_ASIGNADO", "MOTIVO", "ESTADO"]];
  base.forEach(r => {
    r.detalle.forEach(d => filas.push([
      r.tipoLpn,
      grupoPorLpn.get(r.id),
      r.lpn,
      d.ubicacion,
      d.grupo,
      d.codigoAlt,
      d.codigo,
      d.descripcion,
      d.stock,
      d.unidades,
      d.antiguedad,
      d.destino,
      d.destinoUbicacion || d.ubicaciones,
      d.destinoLpn || "",
      d.destinoStock ?? "",
      d.destinoDisponible || "",
      d.pedido,
      d.motivo,
      d.estado
    ]));
  });
  return filas;
}

function filasPaquetesInteligentes(paquetes) {
  return [
    ["GRUPO", "LPNS_OTROS", "COMPLEMENTO_IC962", "CODIGOS_CONECTADOS", "CODIGOS", "PRODUCTOS", "BULTOS_OTROS", "UNIDADES_OTROS", "ANTIGUEDAD", "PALLETS_COMPLETOS", "RACK_VALIDAR", "ACTIVO", "ACOPLE", "PENDIENTES", "DESTINO", "ESTADO", "MOTIVO"],
    ...paquetes.map(p => [
      p.id,
      p.lpnsCount,
      p.complementosCount,
      p.codigosComunes,
      p.codigosCount,
      p.productosCount,
      p.bultos,
      p.unidades,
      p.antiguedad,
      p.palletsFormables,
      p.rackFisico,
      p.activo,
      p.acople,
      p.pendientesDestino,
      p.destinoTxt,
      p.estado,
      p.motivo
    ])
  ];
}

function filasDetallePaquetesInteligentes(paquetes) {
  const filas = [["GRUPO", "CODIGO", "COD_ALT", "DESCRIPCION", "LPNS", "LPNS_OTROS", "LPNS_IC962", "UBICACIONES", "BULTOS", "UNIDADES", "ANTIGUEDAD", "MAX_PALLET", "PORC_PALLET", "PALLETS_FORMABLES", "SALDO", "DECISION", "DESTINO", "MOTIVO"]];
  paquetes.forEach(p => {
    (p.productos || []).forEach(d => filas.push([
      p.id,
      d.codigo,
      d.codigoAlt,
      d.descripcion,
      d.lpnsTxt,
      d.lpnsOtrosCount,
      d.lpnsIc962Count,
      d.ubicacionesTxt,
      d.bultos,
      d.unidades,
      d.antiguedad,
      d.maximo || "VALIDAR",
      d.maximo ? `${d.pct.toFixed(1)}%` : "",
      d.pallets,
      d.saldo,
      d.decision,
      d.destino,
      d.motivo
    ]));
  });
  return filas;
}

function filasLpnsPaquetesInteligentes(paquetes) {
  const filas = [["GRUPO", "ROL", "TIPO_LPN", "LPN", "UBICACION_PISO", "GRUPO_ORIGEN", "CODIGOS", "PRODUCTOS", "BULTOS", "UNIDADES", "ANTIGUEDAD", "PRIORIDAD", "ESTADO"]];
  paquetes.forEach(p => {
    [...(p.filas || []), ...(p.complementos || [])].forEach(row => filas.push([
      p.id,
      row.tipoLpn === "IC962" ? "COMPLEMENTO IC962" : "BASE OTROS",
      row.tipoLpn,
      row.lpn,
      row.ubicacionesTxt,
      row.gruposTxt,
      row.codigosCount,
      row.productosCount,
      row.bultos,
      row.unidades,
      row.antiguedad,
      row.prioridad,
      row.estado
    ]));
  });
  return filas;
}

function filasUnificacionProductoPiso(base) {
  return [
    ["PRIORIDAD", "ACCION", "COD_ALT", "CODIGO", "DESCRIPCION", "LPNS_PISO", "BULTOS", "UNIDADES", "MAX_PALLET", "PORC_PALLET", "PEDIDO_NO_ASIGNADO", "UBICACIONES_PISO", "MOTIVO"],
    ...base.map(r => [
      r.prioridad,
      r.accion,
      r.codigoAlt,
      r.codigo,
      r.descripcion,
      r.lpnsCount,
      r.bultos,
      r.unidades,
      r.maximo || "",
      r.maximo ? `${r.pctPallet.toFixed(1)}%` : "",
      r.pedido,
      r.ubicacionesTxt,
      r.motivo
    ])
  ];
}

function filasUnificacionProductoDetalle(base) {
  const filas = [["ACCION_PRODUCTO", "CODIGO", "DESCRIPCION", "LPN_ORIGEN", "UBICACION_PISO", "GRUPO", "BULTOS_ORIGEN", "UNIDADES", "ANTIGUEDAD", "DESTINO_SUGERIDO", "UBICACION_DESTINO", "LPN_DESTINO", "STOCK_DESTINO", "DISPONIBLE_DESTINO", "MOTIVO"]];
  base.forEach(r => {
    r.detalle.forEach(d => filas.push([
      r.accion,
      r.codigo,
      r.descripcion,
      d.lpn,
      d.ubicacion,
      d.grupo,
      d.stock,
      d.unidades,
      d.antiguedad,
      d.destino,
      d.destinoUbicacion || d.ubicaciones,
      d.destinoLpn || "",
      d.destinoStock ?? "",
      d.destinoDisponible || "",
      d.motivo
    ]));
  });
  return filas;
}

function exportarSimulacionCincoPallets() {
  const simulacion = calcularSimulacionCincoPallets();
  const base = simulacion.filas;
  if (!base.length) return alert("No hay simulacion para exportar.");
  const unificacionProductos = calcularUnificacionProductoPiso();
  const paquetesInteligentes = calcularPaquetesInteligentes(simulacion);
  const completos = base.filter(r => r.completo);
  const completosIc962 = completos.filter(r => r.tipoLpn === "IC962");
  const completosOtros = completos.filter(r => r.tipoLpn !== "IC962");
  descargarExcelHojas("simulacion_5_pallets_piso", [
    { nombre: "Sugerencia producto", filas: filasUnificacionProductoPiso(unificacionProductos) },
    { nombre: "Detalle sugerencia", filas: filasUnificacionProductoDetalle(unificacionProductos) },
    { nombre: "Grupos coincidencia", filas: filasPaquetesInteligentes(paquetesInteligentes) },
    { nombre: "Productos grupos", filas: filasDetallePaquetesInteligentes(paquetesInteligentes) },
    { nombre: "LPNs grupos", filas: filasLpnsPaquetesInteligentes(paquetesInteligentes) },
    { nombre: "LPNs completos", filas: filasSimulacionCincoResumen(completos) },
    { nombre: "Detalle completos", filas: filasSimulacionCincoDetalle(completos) },
    { nombre: "IC962 completos", filas: filasSimulacionCincoResumen(completosIc962) },
    { nombre: "IC962 detalle", filas: filasSimulacionCincoDetalle(completosIc962) },
    { nombre: "OTROS completos", filas: filasSimulacionCincoResumen(completosOtros) },
    { nombre: "OTROS detalle", filas: filasSimulacionCincoDetalle(completosOtros) },
    { nombre: "Plan general", filas: filasSimulacionCincoResumen(base) },
    { nombre: "Detalle general", filas: filasSimulacionCincoDetalle(base) }
  ]);
}

function exportarSimulacionCincoDetalle(id) {
  const row = detalleSimulacionCincoPallets.get(id);
  if (!row) return alert("No hay detalle para exportar.");
  descargarExcelHojas(`simulacion_${normalizar(row.lpn)}`, [
    { nombre: "Resumen LPN", filas: filasSimulacionCincoResumen([row]) },
    { nombre: "Detalle productos", filas: filasSimulacionCincoDetalle([row]) }
  ]);
}

function exportarUnificacionProductoDetalle(id) {
  const row = detalleUnificacionProductoPiso.get(id);
  if (!row) return alert("No hay producto para exportar.");
  descargarExcelHojas(`unificacion_producto_${normalizar(row.codigo)}`, [
    { nombre: "Resumen producto", filas: filasUnificacionProductoPiso([row]) },
    { nombre: "Detalle LPNs", filas: filasUnificacionProductoDetalle([row]) }
  ]);
}

function exportarPaqueteInteligenteDetalle(id) {
  const paquete = detallePaquetesInteligentes.get(id);
  if (!paquete) return alert("No hay paquete para exportar.");
  descargarExcelHojas(`paquete_inteligente_${normalizar(id)}`, [
    { nombre: "Resumen paquete", filas: filasPaquetesInteligentes([paquete]) },
    { nombre: "Productos paquete", filas: filasDetallePaquetesInteligentes([paquete]) },
    { nombre: "LPNs paquete", filas: filasLpnsPaquetesInteligentes([paquete]) }
  ]);
}

function exportarLpnsControlRelacion(tipo) {
  const base = lpnsControlFiltradosActuales();
  const filas = [];

  base.forEach(origen => {
    if (tipo === "activo" || tipo === "ambos") {
      detalleActivoProducto(origen.codigo).forEach(destino => {
        filas.push({
          tipo: "ACTIVO",
          origen,
          destino
        });
      });
    }
    if (tipo === "reserva" || tipo === "ambos") {
      detalleReservaProducto(origen.codigo).forEach(destino => {
        filas.push({
          tipo: "RESERVA",
          origen,
          destino
        });
      });
    }
  });

  if (!filas.length) return alert("No hay detalle para exportar con el filtro actual.");

  const html = `
    <table border="1">
      <tr>
        <th>TIPO DETALLE</th>
        <th>UBICACION ORIGEN</th>
        <th>GRUPO ORIGEN</th>
        <th>LPN ORIGEN</th>
        <th>COD ALTERNATIVO</th>
        <th>CODIGO</th>
        <th>DESCRIPCION</th>
        <th>STOCK ORIGEN</th>
        <th>UNIDADES ORIGEN</th>
        <th>ANTIGUEDAD LPN</th>
        <th>UBICACION DESTINO</th>
        <th>LPN RESERVA</th>
        <th>BULTOS DESTINO</th>
        <th>UNIDADES DESTINO</th>
        <th>ASIGNADO ACTIVO</th>
        <th>TRANSITO ACTIVO</th>
        <th>DISPONIBLE UNIDADES</th>
        <th>DISPONIBLE BULTOS</th>
      </tr>
      ${filas.map(({ tipo, origen, destino }) => `
        <tr>
          <td>${htmlSeguro(tipo)}</td>
          <td>${htmlSeguro(origen.ubicacion)}</td>
          <td>${htmlSeguro(origen.grupo)}</td>
          ${excelCellText(origen.lpn)}
          ${excelCellText(origen.codigoAlt)}
          ${excelCellText(origen.codigo)}
          <td>${htmlSeguro(origen.descripcion)}</td>
          <td>${fmt(origen.stock)}</td>
          <td>${fmt(origen.unidades)}</td>
          <td>${fmt(origen.antiguedad)}</td>
          <td>${htmlSeguro(destino.ubicacion)}</td>
          ${excelCellText(destino.lpn || "")}
          <td>${fmt(destino.bultos ?? destino.stock)}</td>
          <td>${fmt(destino.unidades)}</td>
          <td>${fmt(destino.asignado)}</td>
          <td>${fmt(destino.transito)}</td>
          <td>${fmtDisponibilidad(destino.disponibleUnidades, destino.capacidadDinamica)}</td>
          <td>${fmtDisponibilidad(destino.disponibleBultos, destino.capacidadDinamica)}</td>
        </tr>
      `).join("")}
    </table>
  `;
  descargarExcel(`lpns_${tipo}_analisis`, html);
}

function verPuntosControl() {
  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <h2>Puntos de control</h2>
      <div class="filters">
        <input class="search" id="filtroControl" placeholder="Buscar zona, ubicacion, producto, LPN o descripcion..." oninput="renderPuntosControl()">
        <button onclick="exportarControlExcel()">Excel</button>
        <button onclick="exportarDetallePuntosControlGeneral()">Excel detalle general</button>
      </div>
    </div>
    <div id="controlKpis"></div>
    <div id="controlDashboard"></div>
    <div id="modalPuntoControl" class="modal-backdrop" hidden></div>
  `;
  renderPuntosControl();
}

const bucketsControl = [
  { key: "mas7", label: "+7 dias" },
  { key: "d36", label: "3-6 dias" },
  { key: "d2", label: "2 Dias" },
  { key: "d1", label: "1 Dia" },
  { key: "hoy", label: "Hoy" }
];

function bucketControl(dias) {
  if (dias >= 7) return "mas7";
  if (dias >= 3) return "d36";
  if (dias === 2) return "d2";
  if (dias === 1) return "d1";
  return "hoy";
}

function clasificarZonaControl(ubicacion) {
  const ubi = limpiar(ubicacion).toUpperCase();
  if (!ubi) return "SIN UBICACION";
  if (ubi.startsWith("MASS")) return "MASS";
  if (ubi.startsWith("STAGING")) return "STAGING";
  if (ubi.includes("BLOQUEADO") || ubi.includes("BLOQUEO") || ubi.includes("CIRCUITO") || ubi.includes("PTS")) return "DROP CIRCUITO PTS";
  if (ubi.startsWith("DROP-BUFR") || ubi.includes("BUFFER")) return "BUFFER";
  if (ubi.startsWith("DROP")) return "DROP";
  return "OTRAS UBICACIONES";
}

function ordenZonaControl(zona) {
  const orden = ["STAGING", "SIN UBICACION", "DROP CIRCUITO PTS", "BUFFER", "DROP", "OTRAS UBICACIONES", "MASS"];
  const idx = orden.indexOf(zona);
  return idx === -1 ? 99 : idx;
}

function pasilloMass(ubicacion) {
  const partes = limpiar(ubicacion).split("-");
  return partes.length > 1 ? limpiar(partes[1]).padStart(2, "0") : "SIN PASILLO";
}

function calcularPuntosControl() {
  return lpnsOperativos().map(r => {
    const ubicacionRaw = limpiar(r.UBICACION);
    const ubicacion = ubicacionRaw || "SIN UBICACION";
    const antiguedad = diasLaboralesSinDomingos(r.FECHA);
    const zona = clasificarZonaControl(ubicacionRaw);
    const unidades = unidadesLpn(r);
    const codigo = normalizar(r.CODIGO);
    const precioUnitario = precioUnitarioProducto(codigo);
    return {
      zona,
      ubicacion,
      lpn: limpiar(r.LPN),
      codigo,
      desc: limpiar(r.DESCRIPCION),
      estadoLpn: limpiar(r.ESTADO),
      fecha: limpiar(r.FECHA),
      antiguedad,
      bucket: bucketControl(antiguedad),
      bultos: num(r.BULTOS),
      unidades,
      precioUnitario,
      precioTotal: unidades * precioUnitario
    };
  });
}

function precioUnitarioProducto(codigo) {
  const prod = productoPorCodigo(codigo) || {};
  return num(campo(prod, [
    "PRECIO",
    "Precio",
    "PRECIO UNITARIO",
    "Precio Unitario",
    "PRECIO_UND",
    "PRECIO UND",
    "PRECIO UNIDAD",
    "Precio unidad",
    "COSTO",
    "Costo",
    "COSTO UNIDAD",
    "Costo Unidad",
    "COSTO_UNIDAD",
    "COSTO UNITARIO",
    "Costo Unitario"
  ]));
}

function esUbicacionFaltanteAncPn(ubicacion) {
  const ubi = limpiar(ubicacion).toUpperCase();
  return ubi.startsWith("DROP-FALTANTE-ANC") || ubi.startsWith("DROP-FALTANTE-PN");
}

function claveLpnProductoControl(row) {
  return `${normalizar(row.lpn)}|${normalizar(row.codigo)}`;
}

function filasFaltantesUnicasPorLpnProducto(data, prefijo = "") {
  const vistos = new Set();
  const prefijoNormalizado = limpiar(prefijo).toUpperCase();
  return data.filter(r => {
    const ubicacion = limpiar(r.ubicacion).toUpperCase();
    if (prefijoNormalizado && !ubicacion.startsWith(prefijoNormalizado)) return false;
    if (!esUbicacionFaltanteAncPn(ubicacion)) return false;
    const clave = claveLpnProductoControl(r);
    if (!clave || clave === "|") return false;
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

function aplicarPrecioUnicoControl(rows) {
  const vistos = new Set();
  return rows.map(r => {
    const clave = claveLpnProductoControl(r);
    if (!clave || clave === "|" || vistos.has(clave)) {
      return { ...r, precioUnitarioUnico: "", precioTotalUnico: "" };
    }
    vistos.add(clave);
    return {
      ...r,
      precioUnitarioUnico: r.precioUnitario,
      precioTotalUnico: r.precioTotal
    };
  });
}

function valorFaltantePorPrefijo(data, prefijo) {
  return filasFaltantesUnicasPorLpnProducto(data, prefijo)
    .reduce((a, b) => a + b.precioTotal, 0);
}

function totalBucketControl(data, key) {
  return data.filter(r => r.bucket === key).reduce((a, b) => a + b.bultos, 0);
}

function filaControl(zona, ubicacion, data, clase = "", detalleKey = "") {
  const total = data.reduce((a, b) => a + b.bultos, 0);
  const botonDetalle = detalleKey
    ? `<button class="compact" onclick="abrirDetallePuntoControl(${argumentoSeguro(detalleKey)})">Ver</button>`
    : "";
  return `
    <tr class="${clase}">
      <td class="${zona ? "zone-cell" : ""}">${htmlSeguro(zona)}</td>
      <td>${htmlSeguro(ubicacion)}</td>
      ${bucketsControl.map(b => `<td class="number age-cell">${fmt(totalBucketControl(data, b.key))}</td>`).join("")}
      <td class="number age-total">${fmt(total)}</td>
      <td>${botonDetalle}</td>
    </tr>
  `;
}

function renderPuntosControl() {
  const q = limpiar(document.getElementById("filtroControl")?.value).toLowerCase();
  const base = calcularPuntosControl().filter(r =>
    !q || [r.zona, r.ubicacion, r.lpn, r.codigo, r.desc].join(" ").toLowerCase().includes(q)
  );
  const massExcluido = base.filter(r => r.zona === "MASS");
  const data = base.filter(r => r.zona !== "MASS");

  const totalBultos = data.reduce((a, b) => a + b.bultos, 0);
  const criticos = data.filter(r => r.antiguedad >= 7);
  const hoy = data.filter(r => r.bucket === "hoy");
  const faltanteAncValor = valorFaltantePorPrefijo(data, "DROP-FALTANTE-ANC");
  const faltantePnValor = valorFaltantePorPrefijo(data, "DROP-FALTANTE-PN");
  const zonasMap = new Map();
  data.forEach(r => {
    if (!zonasMap.has(r.zona)) zonasMap.set(r.zona, new Map());
    const porUbicacion = zonasMap.get(r.zona);
    if (!porUbicacion.has(r.ubicacion)) porUbicacion.set(r.ubicacion, []);
    porUbicacion.get(r.ubicacion).push(r);
  });

  const productoMap = new Map();
  data.forEach(r => {
    if (!productoMap.has(r.codigo)) productoMap.set(r.codigo, { codigo: r.codigo, desc: r.desc, lpns: 0, bultos: 0, maxDias: 0, zonas: new Set() });
    const p = productoMap.get(r.codigo);
    p.lpns += 1;
    p.bultos += r.bultos;
    p.maxDias = Math.max(p.maxDias, r.antiguedad);
    p.zonas.add(r.zona);
  });
  const productos = Array.from(productoMap.values()).sort((a, b) => b.bultos - a.bultos || b.maxDias - a.maxDias).slice(0, 20);

  const massPasillos = new Map();
  massExcluido.forEach(r => {
    const pasillo = pasilloMass(r.ubicacion);
    if (!massPasillos.has(pasillo)) massPasillos.set(pasillo, { pasillo, ubicaciones: new Set(), lpns: 0, bultos: 0 });
    const item = massPasillos.get(pasillo);
    item.ubicaciones.add(r.ubicacion);
    item.lpns += 1;
    item.bultos += r.bultos;
  });
  const resumenMass = Array.from(massPasillos.values()).sort((a, b) => Number(a.pasillo) - Number(b.pasillo));

  const rows = [];
  detallePuntosControl = new Map();
  Array.from(zonasMap.entries())
    .sort((a, b) => ordenZonaControl(a[0]) - ordenZonaControl(b[0]) || a[0].localeCompare(b[0]))
    .forEach(([zona, ubicaciones]) => {
      const ubicacionesOrdenadas = Array.from(ubicaciones.entries()).sort((a, b) => ordenarUbicacion(a[0], b[0]));
      let totalZona = [];
      ubicacionesOrdenadas.forEach(([ubicacion, arr], index) => {
        totalZona = totalZona.concat(arr);
        const detalleKey = `${zona}|${ubicacion}`;
        detallePuntosControl.set(detalleKey, { zona, ubicacion, data: arr });
        rows.push(filaControl(index === 0 ? zona : "", ubicacion, arr, "", detalleKey));
      });
      rows.push(filaControl("", "Total", totalZona, "total-row"));
    });
  rows.push(filaControl("Total", "", data, "grand-total-row"));

  document.getElementById("controlKpis").innerHTML = `
    <section class="kpi-grid compact">
      ${kpi("Bultos control", fmt(totalBultos))}
      ${kpi("LPNs control", fmt(data.length))}
      ${kpi("+7 dias", fmt(criticos.reduce((a, b) => a + b.bultos, 0)), `${criticos.length} LPNs`, "danger")}
      ${kpi("Hoy", fmt(hoy.reduce((a, b) => a + b.bultos, 0)), `${hoy.length} LPNs`)}
      ${kpi("Productos", fmt(productoMap.size))}
      ${kpi("Precio faltante ANC", fmt(faltanteAncValor), "DROP-FALTANTE-ANC", faltanteAncValor ? "danger" : "")}
      ${kpi("Precio faltante PN", fmt(faltantePnValor), "DROP-FALTANTE-PN", faltantePnValor ? "danger" : "")}
    </section>
  `;

  document.getElementById("controlDashboard").innerHTML = `
    <section class="card">
      <div class="section-head">
        <h2>Matriz de antiguedad por punto</h2>
        <button onclick="exportarImagen('controlDashboard', 'puntos-control')">Imagen</button>
      </div>
      <div class="table-wrap control-wrap">
        <table id="tablaPuntosControl" class="control-matrix">
          <thead>
            <tr>
              <th>Zona</th>
              <th>Ubicacion</th>
              ${bucketsControl.map(b => `<th>${b.label}</th>`).join("")}
              <th>Total</th>
              <th>Ver detalle</th>
            </tr>
          </thead>
          <tbody>${rows.join("")}</tbody>
        </table>
      </div>
    </section>
  `;
}

function detallePuntoControlFilas(data) {
  return data
    .slice()
    .sort((a, b) => b.antiguedad - a.antiguedad || b.bultos - a.bultos)
    .flatMap(r => {
      const activo = detalleActivoProducto(r.codigo)
        .slice()
        .sort((a, b) => ordenarUbicacion(a.ubicacion, b.ubicacion));
      if (!activo.length) {
        return [{
          ...r,
          ubicacionActivo: "SIN UBICACION ACTIVA",
          asignadoActivo: 0,
          transitoActivo: 0,
          capacidadDinamicaActivo: false,
          disponibleUnd: 0,
          disponibleBul: 0
        }];
      }
      return activo.map(a => ({
        ...r,
        ubicacionActivo: a.ubicacion,
        asignadoActivo: a.asignado,
        transitoActivo: a.transito,
        capacidadDinamicaActivo: a.capacidadDinamica,
        disponibleUnd: a.disponibleUnidades,
        disponibleBul: a.disponibleBultos
      }));
    });
}

function abrirDetallePuntoControl(detalleKey) {
  const detalle = detallePuntosControl.get(detalleKey);
  const destino = document.getElementById("modalPuntoControl");
  if (!destino) return;

  if (!detalle) {
    destino.innerHTML = `<div class="modal-card"><button class="ghost" onclick="cerrarDetallePuntoControl()">Cerrar</button><p>Sin detalle para mostrar.</p></div>`;
    destino.hidden = false;
    return;
  }

  const rows = aplicarPrecioUnicoControl(detallePuntoControlFilas(detalle.data));
  const totalBultos = detalle.data.reduce((a, b) => a + b.bultos, 0);
  const totalLpns = new Set(detalle.data.map(r => r.lpn)).size;
  destino.innerHTML = `
    <div class="modal-card">
      <div class="section-head">
        <div>
          <h2>${htmlSeguro(detalle.ubicacion)}</h2>
            <p class="muted-note">${htmlSeguro(detalle.zona)} | ${fmt(totalLpns)} LPNs | ${fmt(rows.length)} filas | ${fmt(totalBultos)} bultos</p>
        </div>
        <div class="filters">
          <button onclick="exportarTablaVisible('tablaDetallePuntoControl', 'detalle_punto_control')">Excel detalle</button>
          <button onclick="copiarTablaVisible('tablaDetallePuntoControl')">Copiar</button>
          <button class="ghost" onclick="cerrarDetallePuntoControl()">Cerrar</button>
        </div>
      </div>
      ${tablaConId("tablaDetallePuntoControl", ["Ubicacion", "LPN", "Estado LPN", "Codigo", "Descripcion", "Stock BUL", "Stock UND", "Precio UND", "Precio total", "Ubicacion activo", "Asignado activo", "Transito activo", "Disp activo UND", "Disp activo BUL", "Antiguedad dias"], rows.map(r => `
        <tr class="${r.antiguedad >= 7 ? "bad" : r.antiguedad >= 3 ? "warn" : ""}">
          <td>${htmlSeguro(r.ubicacion)}</td>
          <td><strong>${htmlSeguro(r.lpn)}</strong></td>
          <td><strong>${htmlSeguro(r.estadoLpn)}</strong></td>
          <td>${htmlSeguro(r.codigo)}</td>
          <td>${htmlSeguro(r.desc)}</td>
          <td class="number">${fmt(r.bultos)}</td>
          <td class="number">${fmt(r.unidades)}</td>
          <td class="number">${r.precioUnitarioUnico !== "" ? fmt(r.precioUnitarioUnico) : ""}</td>
          <td class="number">${r.precioTotalUnico !== "" ? fmt(r.precioTotalUnico) : ""}</td>
          <td>${htmlSeguro(r.ubicacionActivo || "SIN ACTIVO")}</td>
          <td>${fmt(r.asignadoActivo)}</td>
          <td>${fmt(r.transitoActivo)}</td>
          <td>${fmtDisponibilidad(r.disponibleUnd, r.capacidadDinamicaActivo)}</td>
          <td>${fmtDisponibilidad(r.disponibleBul, r.capacidadDinamicaActivo)}</td>
          <td>${fmt(r.antiguedad)}</td>
        </tr>
      `), "Sin LPNs para esta ubicacion.")}
    </div>
  `;
  destino.hidden = false;
}

function cerrarDetallePuntoControl() {
  const destino = document.getElementById("modalPuntoControl");
  if (!destino) return;
  destino.hidden = true;
  destino.innerHTML = "";
}

function exportarControlExcel() {
  const tablaControl = document.getElementById("tablaPuntosControl");
  if (!tablaControl) return alert("No hay tabla para exportar");
  descargarExcel("puntos-control", tablaControl.outerHTML);
}

function exportarDetallePuntosControlGeneral() {
  const q = limpiar(document.getElementById("filtroControl")?.value).toLowerCase();
  const data = calcularPuntosControl().filter(r =>
    r.zona !== "MASS" &&
    (!q || [r.zona, r.ubicacion, r.lpn, r.codigo, r.desc].join(" ").toLowerCase().includes(q))
  );
  const rows = aplicarPrecioUnicoControl(detallePuntoControlFilas(data));

  if (!rows.length) return alert("No hay detalle para exportar");

  const html = `
    <table border="1">
      <tr>
        <th>UBICACION</th>
        <th>LPN</th>
        <th>ESTADO LPN</th>
        <th>CODIGO</th>
        <th>DESCRIPCION</th>
        <th>STOCK BUL</th>
        <th>STOCK UND</th>
        <th>PRECIO UND</th>
        <th>PRECIO TOTAL LPN</th>
        <th>UBICACION ACTIVO</th>
        <th>ASIGNADO ACTIVO</th>
        <th>TRANSITO ACTIVO</th>
        <th>DISP ACTIVO UND</th>
        <th>DISP ACTIVO BUL</th>
        <th>ANTIGUEDAD DIAS</th>
      </tr>
      ${rows.map(r => `
        <tr>
          ${excelCellText(r.ubicacion)}
          ${excelCellText(r.lpn)}
          <td>${htmlSeguro(r.estadoLpn)}</td>
          ${excelCellText(r.codigo)}
          <td>${htmlSeguro(r.desc)}</td>
          <td>${fmt(r.bultos)}</td>
          <td>${fmt(r.unidades)}</td>
          <td>${r.precioUnitarioUnico !== "" ? fmt(r.precioUnitarioUnico) : ""}</td>
          <td>${r.precioTotalUnico !== "" ? fmt(r.precioTotalUnico) : ""}</td>
          <td>${htmlSeguro(r.ubicacionActivo)}</td>
          <td>${fmt(r.asignadoActivo)}</td>
          <td>${fmt(r.transitoActivo)}</td>
          <td>${fmtDisponibilidad(r.disponibleUnd, r.capacidadDinamicaActivo)}</td>
          <td>${fmtDisponibilidad(r.disponibleBul, r.capacidadDinamicaActivo)}</td>
          <td>${fmt(r.antiguedad)}</td>
        </tr>
      `).join("")}
    </table>
  `;

  descargarExcel("puntos_control_detalle_general", html);
}

function verProductos() {
  verInventario();
}

let modoInventario = "UND";
let filtroEstadoInventario = "TODOS";

function verInventario() {
  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <h2>Inventario</h2>
      <div class="filters">
        <input class="search" id="filtroInventario" placeholder="Buscar codigo, descripcion o ubicacion..." oninput="renderInventarioGeneral()">
        <button onclick="setFiltroInventario('TODOS')">Todo</button>
        <button onclick="setFiltroInventario('SATURADO')">Saturado</button>
        <button onclick="setFiltroInventario('LIBERA')">Libera</button>
        <button onclick="cambiarModoInventario('UND')">UND</button>
        <button onclick="cambiarModoInventario('BUL')">BUL</button>
      </div>
    </div>
    <div class="tabs slim">
      <button onclick="renderInventarioGeneral()">General</button>
      <button onclick="renderInventarioPasillos()">Pasillos</button>
      <button onclick="renderInventarioMulti()">Multiubicacion</button>
    </div>
    <div id="inventarioKpis"></div>
    <div id="inventarioVista"></div>
  `;
  renderInventarioGeneral();
}

function cambiarModoInventario(modo) {
  modoInventario = modo;
  renderInventarioGeneral();
}

function setFiltroInventario(filtro) {
  filtroEstadoInventario = filtro;
  renderInventarioGeneral();
}

function datosInventarioFiltrados() {
  const q = limpiar(document.getElementById("filtroInventario")?.value).toLowerCase();
  return consolidarInventario().filter(r => {
    const estadoOk =
      filtroEstadoInventario === "TODOS" ||
      (filtroEstadoInventario === "SATURADO" && r.estado === "Saturado") ||
      (filtroEstadoInventario === "LIBERA" && r.estado === "Libera");
    return estadoOk && (!q || [r.codigo, r.desc, r.ubicacion, r.estado].join(" ").toLowerCase().includes(q));
  });
}

function renderInventarioGeneral() {
  const data = datosInventarioFiltrados();
  const pasillo10 = inventarioPasillo10();
  const totalPasillo10Und = pasillo10.reduce((a, b) => a + b.unact, 0);
  const totalPasillo10Bul = pasillo10.reduce((a, b) => a + b.unact / (b.uxb || 1), 0);
  const saturadas = data.filter(r => r.estado === "Saturado").length;
  const libera = data.filter(r => r.estado === "Libera").length;
  const disponibles = data.filter(r => r.disponible > 0).length;
  const productos = new Set(data.map(r => r.codigo).filter(Boolean)).size;
  const dataCapacidadFija = data.filter(r => !r.capacidadDinamica);
  const ocupacionPromedio = dataCapacidadFija.length > 0
    ? dataCapacidadFija.reduce((a, b) => a + pct(b.unact, b.uniMax || b.unact), 0) / dataCapacidadFija.length
    : 0;

  document.getElementById("inventarioKpis").innerHTML = `<section class="kpi-grid compact">${kpi("Ubicaciones", fmt(data.length))}${kpi("Productos", fmt(productos))}${kpi("Disponibles", fmt(disponibles))}${kpi("Dinamicas", fmt(data.filter(r => r.capacidadDinamica).length))}${kpi("Saturadas", fmt(saturadas), "", "danger")}${kpi("Libera", fmt(libera), "", "warn")}${kpi("Pasillo 10 UND", fmt(totalPasillo10Und), "no operativo", totalPasillo10Und > 0 ? "danger" : "")}${kpi("Ocupacion prom.", `${ocupacionPromedio.toFixed(1)}%`, "sin dinamicas")}</section>`;
  const alertaPasillo10 = pasillo10.length ? `
    <div class="notice danger">
      MASS-10 no debe tener mercaderia. Se encontro stock en ${fmt(pasillo10.length)} ubicaciones: ${fmt(totalPasillo10Und)} unidades / ${fmt(totalPasillo10Bul)} bultos.
      <button onclick="exportarInventarioPasillo10()">Excel pasillo 10</button>
    </div>
  ` : "";
  document.getElementById("inventarioVista").innerHTML = alertaPasillo10 + tabla(["Codigo", "Descripcion", "Ubicacion", "UXB", "Actual", "Asignado", "Disponible", "Futuro", "Estado"], data.map(r => {
    const actual = modoInventario === "BUL" ? r.unact / (r.uxb || 1) : r.unact;
    const asignado = modoInventario === "BUL" ? r.uniAsig / (r.uxb || 1) : r.uniAsig;
    const disponible = modoInventario === "BUL" ? r.disponible / (r.uxb || 1) : r.disponible;
    const futuro = modoInventario === "BUL" ? r.futuro / (r.uxb || 1) : r.futuro;
    return `
      <tr class="${r.estado === "Saturado" ? "bad" : r.estado === "Libera" ? "warn" : ""}">
        <td><strong>${r.codigo}</strong></td>
        <td>${r.desc}</td>
        <td>${r.ubicacion}</td>
        <td>${fmt(r.uxb)}</td>
        <td>${fmt(actual)}</td>
        <td>${fmt(asignado)}</td>
        <td class="number">${fmtDisponibilidad(disponible, r.capacidadDinamica)}</td>
        <td>${fmtDisponibilidad(futuro, r.capacidadDinamica)}</td>
        <td><strong>${r.estado}</strong></td>
      </tr>
    `;
  }));
}

function exportarInventarioPasillo10() {
  const data = inventarioPasillo10();
  if (!data.length) return alert("No hay stock en MASS-10 para exportar");

  const html = `
    <table border="1">
      <tr>
        <th>CODIGO</th>
        <th>DESCRIPCION</th>
        <th>UBICACION</th>
        <th>UXB</th>
        <th>UNIDADES</th>
        <th>BULTOS</th>
        <th>ESTADO</th>
      </tr>
      ${data.map(r => `
        <tr>
          ${excelCellText(r.codigo)}
          <td>${htmlSeguro(r.desc)}</td>
          ${excelCellText(r.ubicacion)}
          <td>${fmt(r.uxb)}</td>
          <td>${fmt(r.unact)}</td>
          <td>${fmt(r.unact / (r.uxb || 1))}</td>
          <td>PASILLO NO OPERATIVO</td>
        </tr>
      `).join("")}
    </table>
  `;
  descargarExcel("inventario_mass_10_no_operativo", html);
}

function renderInventarioPasillos() {
  const data = datosInventarioFiltrados().filter(r => r.ubicacion.toUpperCase().startsWith("MASS-"));
  const html = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map(pasillo => {
    const filas = data.filter(r => limpiar(r.ubicacion.split("-")[1]).padStart(2, "0") === pasillo);
    if (!filas.length) return "";
    const saturadas = filas.filter(r => r.estado === "Saturado").length;
    const libera = filas.filter(r => r.estado === "Libera").length;
    return `
      <section class="card subcard">
        <div class="section-head">
          <h2>Pasillo ${Number(pasillo)}</h2>
          <span class="badge">Total ${filas.length} | Saturadas ${saturadas} | Libera ${libera}</span>
        </div>
        ${tabla(["Codigo", "Descripcion", "Ubicacion", "Disponible", "Estado"], filas.map(r => `
          <tr class="${r.estado === "Saturado" ? "bad" : r.estado === "Libera" ? "warn" : ""}">
            <td>${r.codigo}</td><td>${r.desc}</td><td>${r.ubicacion}</td><td class="number">${fmtDisponibilidad(modoInventario === "BUL" ? r.disponible / (r.uxb || 1) : r.disponible, r.capacidadDinamica)}</td><td>${r.estado}</td>
          </tr>
        `))}
      </section>
    `;
  }).join("");
  document.getElementById("inventarioVista").innerHTML = html || `<div class="loading">Sin datos por pasillo.</div>`;
}

function renderInventarioMulti() {
  const mapa = new Map();
  consolidarInventario().forEach(r => {
    if (!mapa.has(r.codigo)) mapa.set(r.codigo, { codigo: r.codigo, desc: r.desc, ubicaciones: [], total: 0 });
    const item = mapa.get(r.codigo);
    item.ubicaciones.push(r.ubicacion);
    item.total += r.unact;
  });
  const data = Array.from(mapa.values()).filter(r => r.ubicaciones.length > 1).sort((a, b) => b.ubicaciones.length - a.ubicaciones.length);
  document.getElementById("inventarioKpis").innerHTML = `<section class="kpi-grid compact">${kpi("Productos multi", fmt(data.length))}${kpi("Criticos >=5", fmt(data.filter(r => r.ubicaciones.length >= 5).length), "", "danger")}${kpi("Dispersos 3-4", fmt(data.filter(r => r.ubicaciones.length >= 3 && r.ubicaciones.length < 5).length), "", "warn")}</section>`;
  document.getElementById("inventarioVista").innerHTML = tabla(["Codigo", "Descripcion", "Cant ubicaciones", "Ubicaciones", "Total UND", "Alerta"], data.map(r => `
    <tr class="${r.ubicaciones.length >= 5 ? "bad" : r.ubicaciones.length >= 3 ? "warn" : ""}">
      <td><strong>${r.codigo}</strong></td>
      <td>${r.desc}</td>
      <td>${r.ubicaciones.length}</td>
      <td>${r.ubicaciones.join(" / ")}</td>
      <td>${fmt(r.total)}</td>
      <td>${r.ubicaciones.length >= 5 ? "CRITICO" : r.ubicaciones.length >= 3 ? "DISPERSO" : "NORMAL"}</td>
    </tr>
  `));
}

function verUbicaciones() {
  const inv = consolidarInventario();
  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <h2>Ubicaciones e inventario activo</h2>
      <input class="search" id="filtroUbi" placeholder="Buscar codigo, descripcion o ubicacion..." oninput="renderUbicaciones()">
    </div>
    <div id="ubicacionesKpis"></div>
    <div id="ubicacionesTabla"></div>
  `;
  renderUbicaciones(inv);
}

function renderUbicaciones(invBase) {
  const inv = invBase || consolidarInventario();
  const q = limpiar(document.getElementById("filtroUbi")?.value).toLowerCase();
  const data = inv.filter(r => !q || [r.codigo, r.desc, r.ubicacion, r.estado].join(" ").toLowerCase().includes(q));
  const saturadas = data.filter(r => r.estado === "Saturado").length;
  const libera = data.filter(r => r.estado === "Libera").length;
  const vacias = data.filter(r => r.estado === "Vacio").length;

  document.getElementById("ubicacionesKpis").innerHTML = `<section class="kpi-grid compact">${kpi("Ubicaciones", fmt(data.length))}${kpi("Disponibles", fmt(data.filter(r => r.disponible > 0).length))}${kpi("Saturadas", fmt(saturadas), "", "danger")}${kpi("Libera", fmt(libera), "", "warn")}${kpi("Vacias", fmt(vacias))}</section>`;
  document.getElementById("ubicacionesTabla").innerHTML = tabla(["Codigo", "Descripcion", "Ubicacion", "UNACT", "ASIG", "Disp", "Futuro", "Estado"], data.map(r => `
    <tr class="${r.estado === "Saturado" ? "bad" : r.estado === "Libera" ? "warn" : ""}">
      <td><strong>${r.codigo}</strong></td>
      <td>${r.desc}</td>
      <td>${r.ubicacion}</td>
      <td>${fmt(r.unact)}</td>
      <td>${fmt(r.uniAsig)}</td>
      <td class="number">${fmtDisponibilidad(r.disponible, r.capacidadDinamica)}</td>
      <td>${fmtDisponibilidad(r.futuro, r.capacidadDinamica)}</td>
      <td><strong>${r.estado}</strong></td>
    </tr>
  `));
}

function productosSinUbicacionActivo() {
  const productosLpn = new Map();
  const bloqueados = codigosProductoBloqueados();
  const invActivoPorProducto = new Map();

  dataInventario.forEach(i => {
    const codigo = normalizar(i.PRODUCTO);
    const ubicacion = limpiar(i.UBICACION);
    if (!codigo || !ubicacion || esMassPasillo10(ubicacion)) return;
    if (!invActivoPorProducto.has(codigo)) invActivoPorProducto.set(codigo, []);
    invActivoPorProducto.get(codigo).push(ubicacion);
  });

  lpnsOperativos().forEach(l => {
    const codigo = normalizar(l.CODIGO);
    const ubi = limpiar(l.UBICACION).toUpperCase();
    if (!codigo) return;
    if (bloqueados.has(codigo)) return;
    if (!ubi.startsWith("MASS") && !ubi.startsWith("BUFFER") && !ubi.startsWith("STOCK-DESBLOQUEO") && !ubi.startsWith("RAMPA") && ubi !== "") return;
    if (!productosLpn.has(codigo)) productosLpn.set(codigo, { codigo, desc: l.DESCRIPCION || "", bultos: 0 });
    productosLpn.get(codigo).bultos += num(l.BULTOS);
  });

  const ubicacionesPorProducto = new Map();
  dataUbicaciones.forEach(u => {
    const codigo = normalizar(u.PRODUCTO);
    const ubicacion = limpiar(u.MASCARA);
    const tipo = tipoUbicacion(u);
    if (!codigo || codigo === "-----------") return;
    if (esMassPasillo10(ubicacion)) return;
    if (!ubicacionesPorProducto.has(codigo)) ubicacionesPorProducto.set(codigo, []);
    ubicacionesPorProducto.get(codigo).push({ ubicacion, tipo });
  });

  return Array.from(productosLpn.values()).map(p => {
    const ubicacionesInvActivo = invActivoPorProducto.get(p.codigo) || [];
    const ubicaciones = ubicacionesPorProducto.get(p.codigo) || [];
    const permanentes = ubicaciones.filter(u => u.tipo === "PERMANENTE");
    const dinamicas = ubicaciones.filter(u => u.tipo === "DINAMICA");
    return {
      ...p,
      estaEnInvActivo: ubicacionesInvActivo.length > 0,
      ubicacionesInvActivo,
      ubicacionesActivas: ubicaciones,
      ubicacionesPermanentes: permanentes,
      ubicacionesDinamicas: dinamicas,
      estadoUbicacion: ubicacionesInvActivo.length > 0
        ? "TIENE UBICACION EN INV_ACTIVO"
        : permanentes.length > 0
          ? "TIENE PERMANENTE EN MAESTRO"
          : dinamicas.length > 0
            ? "SOLO DINAMICA EN MAESTRO"
            : "SIN UBICACION ACTIVA"
    };
  }).filter(p => p.ubicacionesInvActivo.length === 0 && p.ubicacionesPermanentes.length === 0);
}

function diagnosticoAptitudSlotting() {
  const bloqueados = codigosProductoBloqueados();
  const productosLpn = new Set();
  lpnsOperativos().forEach(l => {
    const codigo = normalizar(l.CODIGO);
    const ubi = limpiar(l.UBICACION).toUpperCase();
    if (!codigo) return;
    if (!ubi.startsWith("MASS") && !ubi.startsWith("BUFFER") && !ubi.startsWith("STOCK-DESBLOQUEO") && !ubi.startsWith("RAMPA") && ubi !== "") return;
    productosLpn.add(codigo);
  });

  const invActivo = new Set(dataInventario.filter(i => !esMassPasillo10(i.UBICACION)).map(i => normalizar(i.PRODUCTO)).filter(Boolean));
  const aptos = productosSinUbicacionActivo();

  return {
    baseLpn: productosLpn.size,
    bloqueados: Array.from(productosLpn).filter(c => bloqueados.has(c)).length,
    conInvActivo: Array.from(productosLpn).filter(c => invActivo.has(c)).length,
    conPedido: 0,
    aptosFinal: aptos.length
  };
}

function codigosProductoBloqueados() {
  const productosPorAlt = new Map();
  dataProductos.forEach(p => {
    const alt = normalizar(p.CODIGO_ALT || p.COD_ALT || p.COD_ALTERNATIVO || p["CODIGO ALTERNATIVO"] || p["Cod Alternat"]);
    const codigo = normalizar(p.CODIGO);
    if (alt && codigo) productosPorAlt.set(alt, codigo);
  });

  const bloqueados = new Set();
  (dataBloqueo || []).forEach(b => {
    const alt = normalizar(b.COD_ALTERNATIVO || b.COD_ALT || b.CODIGO_ALT || b.ALTERNATIVO);
    const codigo = productosPorAlt.get(alt);
    if (codigo) bloqueados.add(codigo);
  });

  return bloqueados;
}

function productosCriticosSlotting() {
  const sinUbi = productosSinUbicacionActivo();
  const promedio = sinUbi.reduce((a, b) => a + b.bultos, 0) / (sinUbi.length || 1);
  return sinUbi
    .map(p => ({ ...p, bultosBase: p.bultos, bultosPedido: p.bultos, demanda: p.bultos >= promedio ? "ALTO" : "BAJO" }))
    .sort((a, b) => b.bultosBase - a.bultosBase);
}

function tipoUbicacion(row) {
  const tipo = limpiar(row.TIPO_UBICACION || row.TIPO || row.TIPOUBICACION)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (tipo.includes("DIN")) return "DINAMICA";
  if (tipo.includes("PER")) return "PERMANENTE";
  return tipo || "SIN TIPO";
}

function productoPorCodigo(codigo) {
  const cod = normalizar(codigo);
  const key = String(dataProductos.length);
  if (cacheProductosPorCodigo.key !== key) {
    const mapa = new Map();
    dataProductos.forEach(p => {
      const codigoProducto = normalizar(p.CODIGO);
      if (codigoProducto && !mapa.has(codigoProducto)) mapa.set(codigoProducto, p);
    });
    cacheProductosPorCodigo = { key, mapa };
  }
  return cacheProductosPorCodigo.mapa.get(cod);
}

function reportePasillo10NoOperativo() {
  const filas = [];
  const maestroPorUbicacion = new Map();

  dataUbicaciones.forEach(u => {
    const ubicacion = limpiar(u.MASCARA || u.UBICACION);
    if (!esMassPasillo10(ubicacion)) return;

    const tipo = tipoUbicacion(u);
    const codigo = normalizar(u.PRODUCTO);
    const productoSeteado = codigo && codigo !== "-----------" ? codigo : "";
    const prod = productoPorCodigo(productoSeteado);
    maestroPorUbicacion.set(ubicacion, { tipo, productoSeteado });
    if (tipo !== "DINAMICA" && tipo !== "PERMANENTE" && !productoSeteado) return;

    filas.push({
      origen: "MAESTRO UBICACIONES",
      ubicacion,
      tipo,
      codigo: productoSeteado,
      descripcion: prod?.DESCRIPCION || limpiar(u.DESCRIPCION),
      unidades: 0,
      bultos: 0,
      alerta: productoSeteado
        ? "PRODUCTO SETEADO EN PASILLO NO OPERATIVO"
        : "UBICACION SETEADA EN PASILLO NO OPERATIVO"
    });
  });

  inventarioPasillo10().forEach(i => {
    const maestro = maestroPorUbicacion.get(i.ubicacion) || {};
    filas.push({
      origen: "INV_ACTIVO",
      ubicacion: i.ubicacion,
      tipo: maestro.tipo || "SIN MAESTRO",
      codigo: i.codigo,
      descripcion: i.desc,
      unidades: i.unact,
      bultos: i.unact / (i.uxb || 1),
      alerta: "STOCK EN PASILLO NO OPERATIVO"
    });
  });

  return filas.sort((a, b) => ordenarUbicacion(a.ubicacion, b.ubicacion) || a.origen.localeCompare(b.origen));
}

function exportarPasillo10NoOperativo() {
  const data = reportePasillo10NoOperativo();
  if (!data.length) return alert("No se encontraron ubicaciones seteadas ni stock en MASS-10");

  const html = `
    <table border="1">
      <tr>
        <th>ORIGEN</th>
        <th>UBICACION</th>
        <th>TIPO</th>
        <th>CODIGO SETEADO/STOCK</th>
        <th>DESCRIPCION</th>
        <th>UNIDADES</th>
        <th>BULTOS</th>
        <th>ALERTA</th>
      </tr>
      ${data.map(r => `
        <tr>
          <td>${htmlSeguro(r.origen)}</td>
          ${excelCellText(r.ubicacion)}
          <td>${htmlSeguro(r.tipo)}</td>
          ${excelCellText(r.codigo)}
          <td>${htmlSeguro(r.descripcion)}</td>
          <td>${fmt(r.unidades)}</td>
          <td>${fmt(r.bultos)}</td>
          <td>${htmlSeguro(r.alerta)}</td>
        </tr>
      `).join("")}
    </table>
  `;
  descargarExcel("mass_10_no_operativo", html);
}

function ubicacionesSeteadasBloqueadas(codigosBloqueados = codigosProductoBloqueados()) {
  const codigos = codigosBloqueados instanceof Set ? codigosBloqueados : new Set(codigosBloqueados || []);
  return dataUbicaciones
    .map(u => {
      const codigo = normalizar(u.PRODUCTO);
      const ubicacion = limpiar(u.MASCARA || u.UBICACION);
      if (!codigo || codigo === "-----------" || !codigos.has(codigo)) return null;
      const prod = productoPorCodigo(codigo);
      const tipo = tipoUbicacion(u);
      if (tipo !== "PERMANENTE") return null;
      return {
        codigo,
        descripcion: prod?.DESCRIPCION || limpiar(u.DESCRIPCION),
        ubicacion,
        tipo,
        pasillo: pasilloMass(ubicacion) || "-",
        estado: esMassPasillo10(ubicacion)
          ? "BLOQUEADO SETEADO EN MASS-10"
          : "BLOQUEADO SETEADO EN ACTIVO"
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.codigo.localeCompare(b.codigo) || ordenarUbicacion(a.ubicacion, b.ubicacion));
}

function exportarSeteadosBloqueados() {
  const data = ubicacionesSeteadasBloqueadas();
  if (!data.length) return alert("No hay productos bloqueados seteados en ubicaciones activas");

  const html = `
    <table border="1">
      <tr>
        <th>CODIGO</th>
        <th>DESCRIPCION</th>
        <th>UBICACION SETEADA</th>
        <th>TIPO UBICACION</th>
        <th>PASILLO</th>
        <th>ESTADO</th>
      </tr>
      ${data.map(r => `
        <tr>
          ${excelCellText(r.codigo)}
          <td>${htmlSeguro(r.descripcion)}</td>
          ${excelCellText(r.ubicacion)}
          <td>${htmlSeguro(r.tipo)}</td>
          <td>${htmlSeguro(r.pasillo)}</td>
          <td>${htmlSeguro(r.estado)}</td>
        </tr>
      `).join("")}
    </table>
  `;
  descargarExcel("bloqueo_productos_seteados_activo", html);
}

function mapaPasillosSlotting() {
  const mapa = new Map();
  dataInventario.forEach(i => {
    const ubi = limpiar(i.UBICACION);
    if (!ubi.toUpperCase().startsWith("MASS-")) return;
    const pasillo = limpiar(ubi.split("-")[1]).padStart(2, "0");
    if (pasillo === "10") return;
    const codigo = normalizar(i.PRODUCTO);
    const prod = dataProductos.find(p => normalizar(p.CODIGO) === codigo);
    const jerarquia = limpiar(prod?.JERARQUIA1) || "SIN_J1";
    if (!mapa.has(pasillo)) mapa.set(pasillo, { pasillo, total: 0, jerarquias: {}, productos: [], libres: 0, ocupadas: 0 });
    const item = mapa.get(pasillo);
    item.total += 1;
    item.jerarquias[jerarquia] = (item.jerarquias[jerarquia] || 0) + 1;
    item.productos.push({
      codigo,
      descripcion: i.DESCRIPCION || prod?.DESCRIPCION || "",
      jerarquia
    });
  });

  const ubicacionesLibres = [];
  const ubicacionesOcupadas = [];
  dataUbicaciones.forEach(u => {
    const ubi = limpiar(u.MASCARA);
    if (!ubi.toUpperCase().startsWith("MASS-")) return;
    const pasillo = limpiar(ubi.split("-")[1]).padStart(2, "0");
    if (pasillo === "10") return;
    const tipo = tipoUbicacion(u);
    if (tipo !== "DINAMICA") return;
    if (!mapa.has(pasillo)) mapa.set(pasillo, { pasillo, total: 0, jerarquias: {}, productos: [], libres: 0, ocupadas: 0 });
    const producto = normalizar(u.PRODUCTO);
    if (!producto || producto === "-----------") {
      ubicacionesLibres.push({ ubicacion: ubi, pasillo, tipo });
      mapa.get(pasillo).libres += 1;
    } else {
      const prod = productoPorCodigo(producto);
      ubicacionesOcupadas.push({ ubicacion: ubi, pasillo, tipo, producto, descripcion: prod?.DESCRIPCION || limpiar(u.DESCRIPCION) });
      mapa.get(pasillo).ocupadas += 1;
    }
  });

  const pasillos = Array.from(mapa.values()).map(p => {
    const top = Object.entries(p.jerarquias).sort((a, b) => b[1] - a[1])[0] || ["SIN_J1", 0];
    p.predominante = top[0];
    p.porcentaje = p.total > 0 ? (top[1] / p.total) * 100 : 0;
    return p;
  }).sort((a, b) => Number(a.pasillo) - Number(b.pasillo));

  return { pasillos, ubicacionesLibres, ubicacionesOcupadas };
}

function calcularSlotting() {
  const criticos = productosCriticosSlotting();
  const { pasillos, ubicacionesLibres, ubicacionesOcupadas } = mapaPasillosSlotting();
  const usadas = new Set();

  const resultado = criticos.map(p => {
    const prod = dataProductos.find(x => normalizar(x.CODIGO) === p.codigo);
    const jerarquia = limpiar(prod?.JERARQUIA1) || "SIN_J1";
    const uxb = num(prod?.UXB) || 1;
    const candidatos = pasillos.map(ps => {
      let score = 0;
      const detalle = [];
      const similares = ps.productos
        .map(prodPasillo => ({
          ...prodPasillo,
          similitud: similitudTexto(`${p.desc} ${jerarquia}`, `${prodPasillo.descripcion} ${prodPasillo.jerarquia}`)
        }))
        .filter(x => x.similitud > 0)
        .sort((a, b) => b.similitud - a.similitud);
      const similitud = similares[0]?.similitud || 0;
      if (ps.predominante === jerarquia) {
        score += 50;
        detalle.push("jerarquia");
      }
      if (similitud > 0) {
        const puntosSimilitud = Math.round(similitud * 30);
        score += puntosSimilitud;
        detalle.push(`similitud +${puntosSimilitud}`);
      }
      score += Math.min(ps.libres + ps.ocupadas, 20);
      if (ps.porcentaje >= 70) score += 20;
      if (p.demanda === "ALTO") score += 10;
      return { ...ps, score, detalle, similitud, similarTop: similares[0] || null };
    }).sort((a, b) => b.score - a.score);

    const top = candidatos[0];
    const buscarEnPasillos = lista => {
      for (const cand of candidatos) {
        const found = lista.find(u => u.pasillo === cand.pasillo && !usadas.has(u.ubicacion));
        if (found) return found;
      }
      return null;
    };
    const ubicacionLibre = buscarEnPasillos(ubicacionesLibres);
    const ubicacionOcupada = ubicacionLibre ? null : buscarEnPasillos(ubicacionesOcupadas);
    const ubicacion = ubicacionLibre || ubicacionOcupada;
    if (ubicacion) usadas.add(ubicacion.ubicacion);

    return {
      ...p,
      jerarquia,
      uxb,
      top1: top,
      top2: candidatos[1],
      top3: candidatos[2],
      ubicacionSugerida: ubicacion?.ubicacion || "-",
      accionSlotting: ubicacionLibre
        ? "USAR LIBRE"
        : ubicacionOcupada
          ? `LIBERAR DINAMICA (${ubicacionOcupada.producto})`
          : "SIN DINAMICA DISPONIBLE",
      ocupanteActual: ubicacionOcupada?.producto || ""
    };
  }).sort((a, b) => (b.top1?.score || 0) - (a.top1?.score || 0));

  return { resultado, pasillos, ubicacionesLibres, ubicacionesOcupadas };
}

function verSlotting() {
  const { resultado, pasillos, ubicacionesLibres, ubicacionesOcupadas } = calcularSlotting();
  const diag = diagnosticoAptitudSlotting();
  const altos = resultado.filter(x => x.demanda === "ALTO").length;
  const libresSugeridas = resultado.filter(x => x.accionSlotting === "USAR LIBRE").length;
  const liberarSugeridas = resultado.filter(x => x.accionSlotting.startsWith("LIBERAR")).length;
  const totalDinamicas = ubicacionesLibres.length + ubicacionesOcupadas.length;

  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <div>
        <h2>Slotting Inteligente</h2>
      </div>
      <div class="filters">
        <input class="search" id="filtroSlotting" placeholder="Buscar producto, descripcion o pasillo..." oninput="filtrarTabla('tablaSlotting', this.value)">
        <button onclick="copiarTablaVisible('tablaSlotting')">Copiar visible</button>
        <button onclick="exportarTablaVisible('tablaSlotting', 'slotting_visible')">Excel visible</button>
        <button onclick="exportarTablaVisible('tablaDinamicasLibres', 'slotting_dinamicas_libres')">Excel libres</button>
        <button onclick="exportarTablaVisible('tablaDinamicasSeteadas', 'slotting_dinamicas_seteadas')">Excel seteadas</button>
        <button onclick="exportarSlottingPasillos()">Excel pasillos</button>
        <button onclick="exportarSlottingSugerencias()">Excel sugerencias</button>
      </div>
    </div>
    <section class="kpi-grid compact">
      ${kpi("Productos criticos", fmt(resultado.length))}
      ${kpi("Demanda alta", fmt(altos), "", "danger")}
      ${kpi("Demanda baja", fmt(resultado.length - altos), "", "warn")}
      ${kpi("Dinamicas libres", fmt(ubicacionesLibres.length))}
      ${kpi("Dinamicas ocupadas", fmt(ubicacionesOcupadas.length), `${pct(ubicacionesOcupadas.length, totalDinamicas).toFixed(1)}%`)}
      ${kpi("Pasillos evaluados", fmt(pasillos.length))}
      ${kpi("Usar libres", fmt(libresSugeridas))}
      ${kpi("Liberar dinamicas", fmt(liberarSugeridas), "", "warn")}
      ${kpi("Excluidos bloqueo", fmt(diag.bloqueados), "", "danger")}
      ${kpi("Con INV activo", fmt(diag.conInvActivo))}
    </section>
    <section class="card slotting-visual">
      <div>
        <h2>Disponibilidad dinamica</h2>
        <div class="stack tall">
          <div style="width:${pct(ubicacionesLibres.length, totalDinamicas)}%"></div>
          <div style="width:${pct(ubicacionesOcupadas.length, totalDinamicas)}%"></div>
        </div>
        <div class="legend">
          <span><b class="dot green"></b>Libres ${ubicacionesLibres.length}</span>
          <span><b class="dot red"></b>Ocupadas ${ubicacionesOcupadas.length}</span>
        </div>
      </div>
      <div>
        <h2>Decision sugerida</h2>
        ${barra("Usar ubicacion libre", libresSugeridas, resultado.length)}
        ${barra("Liberar dinamica", liberarSugeridas, resultado.length)}
      </div>
    </section>
    <section class="dashboard-layout">
      <div class="card">
        <h2>Productos sugeridos</h2>
        ${tablaConId("tablaSlotting", ["Codigo", "Descripcion", "Stock reserva", "Max", "Min", "Estado ubicacion", "INV activo", "Demanda", "Top 1", "Similitud", "Ubicacion sugerida", "Accion", "Score", "Top 2", "Top 3"], resultado.map((r, index) => `
          <tr class="${r.demanda === "ALTO" ? "bad" : "warn"}">
            <td><strong>${r.codigo}</strong></td>
            <td>${r.desc}</td>
            <td>${fmt(r.bultosPedido)}</td>
            <td><input class="mini-input" id="slotMax_${index}" type="number" value="${Math.ceil(r.bultosPedido)}" oninput="actualizarMinSlotting(${index})"></td>
            <td><input class="mini-input readonly" id="slotMin_${index}" type="number" value="${Math.ceil(r.bultosPedido / 2)}" readonly></td>
            <td>${r.estadoUbicacion}</td>
            <td>${r.estaEnInvActivo ? "SI" : "NO"}</td>
            <td>${r.demanda}</td>
            <td>${r.top1?.pasillo || "-"}</td>
            <td>${r.top1?.similarTop ? `${r.top1.similarTop.codigo} (${Math.round(r.top1.similitud * 100)}%)` : "-"}</td>
            <td class="number">${r.ubicacionSugerida}</td>
            <td><strong>${r.accionSlotting}</strong></td>
            <td><strong>${r.top1?.score || 0}</strong></td>
            <td>${r.top2?.pasillo || "-"}</td>
            <td>${r.top3?.pasillo || "-"}</td>
          </tr>
        `))}
      </div>
      <div class="card">
        <h2>Resumen pasillos</h2>
        ${tabla(["Pasillo", "Predominante", "%", "Libres", "Ocupadas", "Estado"], pasillos.map(p => `
          <tr class="${p.libres <= 5 ? "bad" : p.libres <= 20 ? "warn" : ""}">
            <td><strong>${p.pasillo}</strong></td>
            <td>${p.predominante}</td>
            <td>${p.porcentaje.toFixed(1)}%</td>
            <td class="number">${p.libres}</td>
            <td>${p.ocupadas}</td>
            <td>${p.libres <= 5 ? "Critico" : p.libres <= 20 ? "Medio" : "Disponible"}</td>
          </tr>
        `))}
      </div>
    </section>
    <section class="dashboard-layout">
      <div class="card">
        <div class="section-head">
          <div>
            <h2>Dinamicas libres sin producto de seteo</h2>
          </div>
          <button onclick="exportarTablaVisible('tablaDinamicasLibres', 'slotting_dinamicas_libres')">Excel</button>
        </div>
        ${tablaConId("tablaDinamicasLibres", ["Ubicacion", "Pasillo", "Tipo", "Estado"], ubicacionesLibres.sort((a, b) => ordenarUbicacion(a.ubicacion, b.ubicacion)).map(r => `
          <tr><td><strong>${htmlSeguro(r.ubicacion)}</strong></td><td>${htmlSeguro(r.pasillo)}</td><td>${htmlSeguro(r.tipo)}</td><td>LIBRE SIN PRODUCTO SETEADO</td></tr>
        `))}
      </div>
      <div class="card">
        <div class="section-head">
          <div>
            <h2>Dinamicas con producto de seteo</h2>
          </div>
          <button onclick="exportarTablaVisible('tablaDinamicasSeteadas', 'slotting_dinamicas_seteadas')">Excel</button>
        </div>
        ${tablaConId("tablaDinamicasSeteadas", ["Ubicacion", "Pasillo", "Tipo", "Producto seteado", "Descripcion"], ubicacionesOcupadas.sort((a, b) => ordenarUbicacion(a.ubicacion, b.ubicacion)).map(r => `
          <tr><td><strong>${htmlSeguro(r.ubicacion)}</strong></td><td>${htmlSeguro(r.pasillo)}</td><td>${htmlSeguro(r.tipo)}</td><td>${htmlSeguro(r.producto)}</td><td>${htmlSeguro(r.descripcion)}</td></tr>
        `))}
      </div>
    </section>
  `;
}

function excelCellText(valor) {
  return `<td style="mso-number-format:'\\@';">${htmlSeguro(valor ?? "")}</td>`;
}

function exportarSlottingDinamicas() {
  const { ubicacionesLibres, ubicacionesOcupadas } = calcularSlotting();
  const filas = [
    ...ubicacionesLibres.map(u => ({ ...u, producto: "-----------", estado: "LIBRE" })),
    ...ubicacionesOcupadas.map(u => ({ ...u, estado: "OCUPADA" }))
  ].sort((a, b) => ordenarUbicacion(a.ubicacion, b.ubicacion));

  const html = `
    <table border="1">
      <tr>
        <th>UBICACION</th>
        <th>PASILLO</th>
        <th>TIPO</th>
        <th>PRODUCTO</th>
        <th>ESTADO</th>
      </tr>
      ${filas.map(r => `
        <tr>
          ${excelCellText(r.ubicacion)}
          <td>${r.pasillo}</td>
          <td>${r.tipo}</td>
          ${excelCellText(r.producto || "")}
          <td>${r.estado}</td>
        </tr>
      `).join("")}
    </table>
  `;

  descargarExcel("slotting_dinamicas", html);
}

function exportarSlottingPasillos() {
  const { pasillos } = calcularSlotting();
  const html = `
    <table border="1">
      <tr>
        <th>PASILLO</th>
        <th>PREDOMINANTE</th>
        <th>PREDOMINANCIA %</th>
        <th>LIBRES</th>
        <th>OCUPADAS</th>
        <th>TOTAL DINAMICAS</th>
        <th>TOP JERARQUIAS</th>
        <th>ESTADO</th>
      </tr>
      ${pasillos.map(p => {
        const topJerarquias = Object.entries(p.jerarquias)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([j, c]) => `${j}: ${c}`)
          .join(" | ");
        return `
          <tr>
            <td>${p.pasillo}</td>
            <td>${p.predominante}</td>
            <td>${p.porcentaje.toFixed(1)}%</td>
            <td>${p.libres}</td>
            <td>${p.ocupadas}</td>
            <td>${p.libres + p.ocupadas}</td>
            <td>${topJerarquias}</td>
            <td>${p.libres <= 5 ? "CRITICO" : p.libres <= 20 ? "MEDIO" : "DISPONIBLE"}</td>
          </tr>
        `;
      }).join("")}
    </table>
  `;

  descargarExcel("slotting_resumen_pasillos", html);
}

function exportarSlottingSugerencias() {
  const { resultado } = calcularSlotting();
  const html = `
    <table border="1">
      <tr>
        <th>CODIGO</th>
        <th>DESCRIPCION</th>
        <th>STOCK_RESERVA</th>
        <th>MAX</th>
        <th>MIN</th>
        <th>ESTADO_UBICACION</th>
        <th>INV_ACTIVO</th>
        <th>DEMANDA</th>
        <th>JERARQUIA</th>
        <th>TOP_1_PASILLO</th>
        <th>PRODUCTO_SIMILAR</th>
        <th>SIMILITUD</th>
        <th>UBICACION_SUGERIDA</th>
        <th>ACCION</th>
        <th>OCUPANTE_ACTUAL</th>
        <th>SCORE</th>
        <th>TOP_2</th>
        <th>TOP_3</th>
      </tr>
      ${resultado.map(r => `
        <tr>
          ${excelCellText(r.codigo)}
          <td>${r.desc}</td>
          <td>${r.bultosPedido}</td>
          <td>${Math.ceil(r.bultosPedido)}</td>
          <td>${Math.ceil(r.bultosPedido / 2)}</td>
          <td>${r.estadoUbicacion}</td>
          <td>${r.estaEnInvActivo ? "SI" : "NO"}</td>
          <td>${r.demanda}</td>
          <td>${r.jerarquia}</td>
          <td>${r.top1?.pasillo || ""}</td>
          ${excelCellText(r.top1?.similarTop?.codigo || "")}
          <td>${r.top1?.similitud ? `${Math.round(r.top1.similitud * 100)}%` : ""}</td>
          ${excelCellText(r.ubicacionSugerida)}
          <td>${r.accionSlotting}</td>
          ${excelCellText(r.ocupanteActual || "")}
          <td>${r.top1?.score || 0}</td>
          <td>${r.top2?.pasillo || ""}</td>
          <td>${r.top3?.pasillo || ""}</td>
        </tr>
      `).join("")}
    </table>
  `;

  descargarExcel("slotting_sugerencias", html);
}

function filtrarTabla(id, valor) {
  const q = limpiar(valor).toLowerCase();
  document.querySelectorAll(`#${id} tbody tr`).forEach(tr => {
    tr.style.display = tr.innerText.toLowerCase().includes(q) ? "" : "none";
  });
}

function actualizarMinSlotting(index) {
  const max = num(document.getElementById(`slotMax_${index}`)?.value);
  const min = document.getElementById(`slotMin_${index}`);
  if (min) min.value = Math.ceil(max / 2);
}

function filtrarBloqueo() {
  const q = limpiar(document.getElementById("filtroBloqueo")?.value).toLowerCase();
  document.querySelectorAll("#tablaBloqueoSeteados tbody tr, #tablaBloqueoActivo tbody tr, #tablaBloqueoReserva tbody tr, #tablaBloqueoOtras tbody tr, #tablaBloqueoSeparado tbody tr").forEach(tr => {
    tr.style.display = !q || tr.innerText.toLowerCase().includes(q) ? "" : "none";
  });
}

function esUbicacionReservaBloqueo(ubicacion) {
  return limpiar(ubicacion).toUpperCase().startsWith("MASS-");
}

function esUbicacionBloqueoSeparado(ubicacion) {
  const ubi = limpiar(ubicacion).toUpperCase();
  return ubi.startsWith("DROP-BLOQUEADOS");
}

function categoriaOtraUbicacionBloqueo(ubicacion) {
  const ubi = limpiar(ubicacion).toUpperCase();
  if (!ubi) return "PALETERO / BLANCO";
  if (ubi.startsWith("DROP-BUFR")) return "DROP-BUFR";
  if (ubi.startsWith("RAMPA-")) return "RAMPA";
  if (ubi.startsWith("DROP-STOCK-DESBLOQ-962")) return "DROP-STOCK-DESBLOQ-962";
  if (ubi.startsWith("SALDOS-MASS-TRUJ")) return "SALDOS-MASS-TRUJ";
  return "";
}

function esOtraUbicacionBloqueo(ubicacion) {
  return Boolean(categoriaOtraUbicacionBloqueo(ubicacion));
}

function unidadesLpnBloqueo(row) {
  return num(campo(row, ["UnAct", "UNACT", "UNIDADES", "Un Orig", "UN_ORIG"]));
}

function resumenOperativoBloqueado(codigo, activo, lpnsBloqueados) {
  const lpnProducto = lpnsBloqueados.filter(r => normalizar(r.CODIGO) === codigo);
  const activoProducto = activo.filter(r => r.codigo === codigo);
  const mass = lpnProducto.filter(r => esUbicacionReservaBloqueo(r.UBICACION));
  const separado = lpnProducto.filter(r => esUbicacionBloqueoSeparado(r.UBICACION));
  const otras = lpnProducto.filter(r => esOtraUbicacionBloqueo(r.UBICACION));
  const bultosMass = mass.reduce((a, b) => a + num(b.BULTOS), 0);
  const bultosSeparado = separado.reduce((a, b) => a + num(b.BULTOS), 0);
  const bultosOtras = otras.reduce((a, b) => a + num(b.BULTOS), 0);
  const bultosActivo = activoProducto.reduce((a, b) => a + b.unact / (b.uxb || 1), 0);
  const lpnsExtraer = [...mass, ...otras];
  const ubicacionesExtraer = [...new Set(lpnsExtraer.map(r => limpiar(r.UBICACION) || "PALETERO"))];

  return {
    bultosMass,
    bultosSeparado,
    bultosOtras,
    bultosActivo,
    lpnsExtraer,
    ubicacionesExtraer,
    estado: bultosMass > 0
      ? "RETIRAR DE MASS"
      : bultosOtras > 0
        ? "REVISAR OTRA UBICACION"
        : bultosActivo > 0
          ? "REVISAR ACTIVO"
          : bultosSeparado > 0
            ? "YA SEPARADO"
            : "SIN STOCK OPERATIVO"
  };
}

function filaLpnBloqueo(row, mostrarCategoria = false) {
  const ubicacion = limpiar(row.UBICACION);
  return `
    <tr>
      <td><strong>${htmlSeguro(normalizar(row.CODIGO))}</strong></td>
      <td>${htmlSeguro(limpiar(row.DESCRIPCION))}</td>
      <td>${htmlSeguro(limpiar(row.LPN))}</td>
      <td>${htmlSeguro(ubicacion || "PALETERO / BLANCO")}</td>
      ${mostrarCategoria ? `<td>${htmlSeguro(categoriaOtraUbicacionBloqueo(ubicacion))}</td>` : ""}
      <td class="number">${fmt(unidadesLpnBloqueo(row))}</td>
      <td class="number">${fmt(num(row.BULTOS))}</td>
    </tr>
  `;
}

function renderBloqueoReestructurado({ seteados, activo, reserva, otras, separado, indicadores }) {
  document.getElementById("modulo").innerHTML = `
    <section class="kpi-grid compact">
      ${kpi("Productos bloqueados", fmt(indicadores.productos))}
      ${kpi("Stock activo BUL", fmt(indicadores.activo))}
      ${kpi("Reserva MASS BUL", fmt(indicadores.reserva))}
      ${kpi("Otras ubicaciones BUL", fmt(indicadores.otras))}
      ${kpi("Separado DROP-BLOQUEADOS", fmt(indicadores.separado))}
    </section>
    <div class="card">
      <div class="section-head">
        <h2>Control de productos bloqueados</h2>
        <input class="search" id="filtroBloqueo" placeholder="Buscar codigo, descripcion, LPN o ubicacion..." oninput="filtrarBloqueo()">
      </div>
    </div>

    <div class="card">
      <div class="section-head">
        <h2>Productos bloqueados seteados en activo permanente</h2>
        <div class="filters">
          <button onclick="exportarTablaVisible('tablaBloqueoSeteados', 'bloqueados_seteados_activo_permanente')">Excel</button>
          <button onclick="copiarTablaVisible('tablaBloqueoSeteados')">Copiar</button>
        </div>
      </div>
      ${tablaConId("tablaBloqueoSeteados", ["Codigo", "Descripcion", "Ubicacion seteada", "Tipo ubicacion", "Pasillo"], seteados.map(r => `
        <tr class="bad"><td><strong>${htmlSeguro(r.codigo)}</strong></td><td>${htmlSeguro(r.descripcion)}</td><td>${htmlSeguro(r.ubicacion)}</td><td>${htmlSeguro(r.tipo)}</td><td>${htmlSeguro(r.pasillo)}</td></tr>
      `), "Ningun producto bloqueado esta seteado en una ubicacion PERMANENTE.")}
    </div>

    <div class="card">
      <div class="section-head">
        <h2>Inventario activo de productos bloqueados</h2>
        <div class="filters"><button onclick="exportarTablaVisible('tablaBloqueoActivo', 'bloqueados_inventario_activo')">Excel</button><button onclick="copiarTablaVisible('tablaBloqueoActivo')">Copiar</button></div>
      </div>
      ${tablaConId("tablaBloqueoActivo", ["Codigo", "Descripcion", "Ubicacion", "Unidades", "Bultos"], activo.map(r => `
        <tr><td><strong>${htmlSeguro(r.codigo)}</strong></td><td>${htmlSeguro(r.desc)}</td><td>${htmlSeguro(r.ubicacion)}</td><td class="number">${fmt(r.unact)}</td><td class="number">${fmt(r.unact/(r.uxb||1))}</td></tr>
      `), "Sin inventario activo para productos bloqueados.")}
    </div>

    <div class="card">
      <div class="section-head">
        <h2>Reserva MASS de productos bloqueados</h2>
        <div class="filters"><button onclick="exportarTablaVisible('tablaBloqueoReserva', 'bloqueados_reserva_mass')">Excel</button><button onclick="copiarTablaVisible('tablaBloqueoReserva')">Copiar</button></div>
      </div>
      ${tablaConId("tablaBloqueoReserva", ["Codigo", "Descripcion", "LPN", "Ubicacion", "Unidades", "Bultos"], reserva.map(r => filaLpnBloqueo(r)), "Sin LPNs bloqueados en reserva MASS.")}
    </div>

    <div class="card">
      <div class="section-head">
        <h2>Otras ubicaciones validas de productos bloqueados</h2>
        <div class="filters"><button onclick="exportarTablaVisible('tablaBloqueoOtras', 'bloqueados_otras_ubicaciones_validas')">Excel</button><button onclick="copiarTablaVisible('tablaBloqueoOtras')">Copiar</button></div>
      </div>
      ${tablaConId("tablaBloqueoOtras", ["Codigo", "Descripcion", "LPN", "Ubicacion", "Grupo", "Unidades", "Bultos"], otras.map(r => filaLpnBloqueo(r,true)), "Sin bloqueados en DROP-BUFR, RAMPA, DROP-STOCK-DESBLOQ-962, BLANCO o SALDOS-MASS-TRUJ.")}
    </div>

    <div class="card">
      <div class="section-head">
        <h2>Productos ya separados en DROP-BLOQUEADOS</h2>
        <div class="filters"><button onclick="exportarTablaVisible('tablaBloqueoSeparado', 'bloqueados_ya_separados')">Excel</button><button onclick="copiarTablaVisible('tablaBloqueoSeparado')">Copiar</button></div>
      </div>
      ${tablaConId("tablaBloqueoSeparado", ["Codigo", "Descripcion", "LPN", "Ubicacion", "Unidades", "Bultos"], separado.map(r => filaLpnBloqueo(r)), "Sin productos separados en DROP-BLOQUEADOS.")}
    </div>
  `;
}

function verBloqueo() {
  const codigos = new Set(dataBloqueo.map(r => normalizar(r.COD_ALT)).filter(Boolean));
  const porAlt = new Map(dataProductos.map(p => [normalizar(p.CODIGO_ALT || p.COD_ALT || p.COD_ALTERNATIVO || p["CODIGO ALTERNATIVO"] || p["Cod Alternat"]), p]));
  const productos = Array.from(codigos).map(alt => {
    const prod = porAlt.get(alt);
    return {
      alt,
      codigo: normalizar(prod?.CODIGO),
      desc: prod?.DESCRIPCION || dataBloqueo.find(b => normalizar(b.COD_ALT) === alt)?.DESCRIPCION || "No encontrado",
      encontrado: Boolean(prod)
    };
  });

  const codigoSet = new Set(productos.map(p => p.codigo).filter(Boolean));
  const activo = inventarioComparable().filter(r => codigoSet.has(r.codigo) && r.unact > 0);
  const lpnsBloqueados = lpnsOperativos().filter(r => codigoSet.has(normalizar(r.CODIGO)));
  productos.forEach(p => {
    p.operativo = p.codigo ? resumenOperativoBloqueado(p.codigo, activo, lpnsBloqueados) : null;
  });
  const reserva = lpnsBloqueados.filter(r => esUbicacionReservaBloqueo(r.UBICACION));
  const separado = lpnsBloqueados.filter(r => esUbicacionBloqueoSeparado(r.UBICACION));
  const otrasUbicaciones = lpnsBloqueados.filter(r => esOtraUbicacionBloqueo(r.UBICACION));
  const totalActivo = activo.reduce((a, b) => a + b.unact / (b.uxb || 1), 0);
  const totalReserva = reserva.reduce((a, b) => a + num(b.BULTOS), 0);
  const totalSeparado = separado.reduce((a, b) => a + num(b.BULTOS), 0);
  const totalOtras = otrasUbicaciones.reduce((a, b) => a + num(b.BULTOS), 0);
  const pasillo10 = reportePasillo10NoOperativo();
  const totalPasillo10Stock = pasillo10.reduce((a, b) => a + num(b.bultos), 0);
  const seteadosBloqueados = ubicacionesSeteadasBloqueadas(codigoSet);

  renderBloqueoReestructurado({
    seteados: seteadosBloqueados,
    activo,
    reserva,
    otras: otrasUbicaciones,
    separado,
    indicadores: {
      productos: productos.length,
      activo: totalActivo,
      reserva: totalReserva,
      otras: totalOtras,
      separado: totalSeparado
    }
  });
  return;

  document.getElementById("modulo").innerHTML = `
    <section class="kpi-grid compact">
      ${kpi("Bloqueados", fmt(productos.length))}
      ${kpi("Encontrados", fmt(productos.filter(p => p.encontrado).length))}
      ${kpi("Activo BUL", fmt(totalActivo))}
      ${kpi("Reserva MASS BUL", fmt(totalReserva))}
      ${kpi("Ya separado BUL", fmt(totalSeparado))}
      ${kpi("Otras ubic. BUL", fmt(totalOtras), "", totalOtras > 0 ? "warn" : "")}
      ${kpi("Por retirar", fmt(totalActivo + totalReserva + totalOtras), "activo + MASS + otras")}
      ${kpi("MASS-10 alertas", fmt(pasillo10.length), `${fmt(totalPasillo10Stock)} bultos`, pasillo10.length ? "danger" : "")}
      ${kpi("Seteados activo", fmt(seteadosBloqueados.length), "bloqueados", seteadosBloqueados.length ? "danger" : "")}
    </section>
    ${pasillo10.length ? `
      <div class="notice danger">
        MASS-10 no es operativo. Hay ubicaciones seteadas o stock en ese pasillo y no se considera como activo disponible.
        <button onclick="exportarPasillo10NoOperativo()">Detectar y descargar MASS-10</button>
      </div>
    ` : `
      <div class="notice">
        MASS-10 sin ubicaciones seteadas ni stock detectado.
        <button onclick="exportarPasillo10NoOperativo()">Detectar y descargar MASS-10</button>
      </div>
    `}
    <div class="card">
      <div class="section-head">
        <h2>Productos bloqueados</h2>
        <div class="filters">
          <input class="search" id="filtroBloqueo" placeholder="Buscar codigo alt, codigo o descripcion..." oninput="filtrarBloqueo()">
          <select class="select-filter" id="estadoBloqueo" onchange="filtrarBloqueo()">
            <option value="todos">Todos</option>
            <option value="encontrado">Encontrados</option>
            <option value="noEncontrado">No encontrados</option>
          </select>
          <button onclick="copiarTablaVisible('tablaBloqueo')">Copiar</button>
          <button onclick="exportarTablaVisible('tablaBloqueo', 'bloqueo_visible')">Excel visible</button>
        </div>
      </div>
      ${tablaConId("tablaBloqueo", ["Codigo alt", "Codigo", "Descripcion", "Estado", "LPNs extraer", "Ubicacion extraer", "Bultos extraer", "Separado"], productos.map(p => {
        const op = p.operativo;
        const bultosExtraer = op ? op.bultosMass + op.bultosOtras : 0;
        const clase = !p.encontrado ? "bad" : bultosExtraer > 0 ? "warn" : op?.bultosSeparado > 0 ? "" : "bad";
        return `
        <tr class="${clase}" data-estado="${p.encontrado ? "encontrado" : "noEncontrado"}">
          <td>${htmlSeguro(p.alt)}</td>
          <td><strong>${htmlSeguro(p.codigo || "-")}</strong></td>
          <td>${htmlSeguro(p.desc)}</td>
          <td><strong>${htmlSeguro(p.encontrado ? op.estado : "No encontrado")}</strong></td>
          <td>${op ? fmt(op.lpnsExtraer.length) : ""}</td>
          <td>${htmlSeguro(op ? op.ubicacionesExtraer.join(", ") : "")}</td>
          <td class="number">${op ? fmt(bultosExtraer) : ""}</td>
          <td>${op ? fmt(op.bultosSeparado) : ""}</td>
        </tr>
      `}))}
    </div>
    <div class="dashboard-layout">
      <div class="card">
        <div class="section-head">
          <h2>Bloqueados seteados en activo</h2>
          <div class="filters">
            <button onclick="exportarTablaVisible('tablaBloqueoSeteados', 'bloqueo_seteados_activo_visible')">Excel visible</button>
            <button onclick="exportarSeteadosBloqueados()">Excel completo</button>
            <button onclick="copiarTablaVisible('tablaBloqueoSeteados')">Copiar</button>
          </div>
        </div>
        ${tablaConId("tablaBloqueoSeteados", ["Codigo", "Descripcion", "Ubicacion seteada", "Tipo", "Pasillo", "Estado"], seteadosBloqueados.map(r => `
          <tr class="bad">
            <td><strong>${htmlSeguro(r.codigo)}</strong></td>
            <td>${htmlSeguro(r.descripcion)}</td>
            <td>${htmlSeguro(r.ubicacion)}</td>
            <td>${htmlSeguro(r.tipo)}</td>
            <td>${htmlSeguro(r.pasillo)}</td>
            <td><strong>${htmlSeguro(r.estado)}</strong></td>
          </tr>
        `), "Ningun producto bloqueado esta seteado en ubicaciones activas.")}
      </div>
      <div class="card">
        <div class="section-head">
          <h2>Inventario activo bloqueado</h2>
          <div class="filters">
            <button onclick="exportarTablaVisible('tablaBloqueoActivo', 'bloqueo_detalle_activo')">Excel detalle activo</button>
            <button onclick="copiarTablaVisible('tablaBloqueoActivo')">Copiar</button>
          </div>
        </div>
        ${tablaConId("tablaBloqueoActivo", ["Codigo", "Descripcion", "Ubicacion", "Unidades", "Bultos"], activo.map(r => `
          <tr>
            <td>${htmlSeguro(r.codigo)}</td>
            <td>${htmlSeguro(r.desc)}</td>
            <td>${htmlSeguro(r.ubicacion)}</td>
            <td>${fmt(r.unact)}</td>
            <td>${fmt(r.unact / (r.uxb || 1))}</td>
          </tr>
        `), "Sin inventario activo para productos bloqueados.")}
      </div>
      <div class="card">
        <div class="section-head">
          <h2>Reserva bloqueada MASS</h2>
          <div class="filters">
            <button onclick="exportarTablaVisible('tablaBloqueoLpns', 'bloqueo_detalle_lpns')">Excel detalle LPNs</button>
            <button onclick="copiarTablaVisible('tablaBloqueoLpns')">Copiar</button>
          </div>
        </div>
        ${tablaConId("tablaBloqueoLpns", ["Codigo", "Descripcion", "LPN", "Ubicacion", "Bultos"], reserva.map(r => `
          <tr>
            <td>${htmlSeguro(normalizar(r.CODIGO))}</td>
            <td>${htmlSeguro(limpiar(r.DESCRIPCION))}</td>
            <td>${htmlSeguro(limpiar(r.LPN))}</td>
            <td>${htmlSeguro(limpiar(r.UBICACION) || "PALETERO")}</td>
            <td>${fmt(num(r.BULTOS))}</td>
          </tr>
        `), "Sin LPNs en reserva MASS para productos bloqueados.")}
      </div>
    </div>
    <div class="dashboard-layout">
      <div class="card">
        <div class="section-head">
          <h2>Ya separado en bloqueo/control</h2>
          <div class="filters">
            <button onclick="exportarTablaVisible('tablaBloqueoSeparado', 'bloqueo_ya_separado')">Excel</button>
            <button onclick="copiarTablaVisible('tablaBloqueoSeparado')">Copiar</button>
          </div>
        </div>
        ${tablaConId("tablaBloqueoSeparado", ["Codigo", "Descripcion", "LPN", "Ubicacion", "Bultos"], separado.map(r => `
          <tr>
            <td>${htmlSeguro(normalizar(r.CODIGO))}</td>
            <td>${htmlSeguro(limpiar(r.DESCRIPCION))}</td>
            <td>${htmlSeguro(limpiar(r.LPN))}</td>
            <td>${htmlSeguro(limpiar(r.UBICACION))}</td>
            <td>${fmt(num(r.BULTOS))}</td>
          </tr>
        `), "Sin LPNs ya separados en ubicaciones de bloqueo/control.")}
      </div>
      <div class="card">
        <div class="section-head">
          <h2>Otras ubicaciones bloqueadas</h2>
          <div class="filters">
            <button onclick="exportarTablaVisible('tablaBloqueoOtras', 'bloqueo_otras_ubicaciones')">Excel</button>
            <button onclick="copiarTablaVisible('tablaBloqueoOtras')">Copiar</button>
          </div>
        </div>
        ${tablaConId("tablaBloqueoOtras", ["Codigo", "Descripcion", "LPN", "Ubicacion", "Bultos"], otrasUbicaciones.map(r => `
          <tr>
            <td>${htmlSeguro(normalizar(r.CODIGO))}</td>
            <td>${htmlSeguro(limpiar(r.DESCRIPCION))}</td>
            <td>${htmlSeguro(limpiar(r.LPN))}</td>
            <td>${htmlSeguro(limpiar(r.UBICACION) || "PALETERO")}</td>
            <td>${fmt(num(r.BULTOS))}</td>
          </tr>
        `), "Sin LPNs bloqueados en otras ubicaciones.")}
      </div>
    </div>
  `;
}
