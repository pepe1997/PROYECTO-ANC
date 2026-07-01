let ubicacionReservaActiva = "";
let detallePuntosControl = new Map();
let detalleOptimizacionReserva = new Map();
let detalleReservaActivo = new Map();
let detalleLpnsSinActivo = new Map();
let cacheLpnsUbicacion = { key: "", control: [], activo: new Map(), reserva: new Map() };
let cacheProductosPorCodigo = { key: "", mapa: new Map() };
let timerRenderLpnsUbicacion = null;

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

function parseFecha(valor) {
  const txt = limpiar(valor);
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
  return dataLPN.filter(r => ["UBICADO", "RECIBIDO"].includes(normalizar(r.ESTADO)));
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

function verOptimizarReserva() {
  const analisis = analizarOptimizacionReserva();
  const productosMaximo = Object.entries(analisis.maximos)
    .filter(([, r]) => num(r.maximo) > 15)
    .sort((a, b) => num(b[1].maximo) - num(a[1].maximo));
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
      ${tablaConId("tablaPalletMaximo", ["Codigo", "Descripcion", "Max pallet", "Origen", "Repeticiones", "Ver"], productosMaximo.map(([codigo, r]) => `
        <tr><td><strong>${htmlSeguro(codigo)}</strong></td><td>${htmlSeguro(r.desc)}</td><td class="number">${fmt(r.maximo)}</td><td>${htmlSeguro(r.origen || "APRENDIDO POR REPETICION")}</td><td>${fmt(r.repeticiones || 0)}</td>
        <td><button class="soft" onclick="abrirDetalleOptimizacion(${argumentoSeguro(codigo)})">Ver</button></td></tr>
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

function esGrupoLpnControl(ubicacion) {
  return ["BLANCO", "BUFFER", "DROP-STOCK DESBLOQ", "DROP-STOCK", "RAMPA"].includes(grupoLpnControlUbicacion(ubicacion));
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
    .filter(r => r.codigo && r.lpn && ["BLANCO", "BUFFER", "DROP-STOCK DESBLOQ", "DROP-STOCK", "RAMPA"].includes(r.grupo))
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
    .filter(r => r.codigo && r.lpn && ["BLANCO", "BUFFER", "DROP-STOCK DESBLOQ", "DROP-STOCK", "RAMPA"].includes(r.grupo))
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
    return {
      zona,
      ubicacion,
      lpn: limpiar(r.LPN),
      codigo: normalizar(r.CODIGO),
      desc: limpiar(r.DESCRIPCION),
      estadoLpn: limpiar(r.ESTADO),
      fecha: limpiar(r.FECHA),
      antiguedad,
      bucket: bucketControl(antiguedad),
      bultos: num(r.BULTOS),
      unidades
    };
  });
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

  const rows = detallePuntoControlFilas(detalle.data);
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
      ${tablaConId("tablaDetallePuntoControl", ["Ubicacion", "LPN", "Estado LPN", "Codigo", "Descripcion", "Stock BUL", "Stock UND", "Ubicacion activo", "Asignado activo", "Transito activo", "Disp activo UND", "Disp activo BUL", "Antiguedad dias"], rows.map(r => `
        <tr class="${r.antiguedad >= 7 ? "bad" : r.antiguedad >= 3 ? "warn" : ""}">
          <td>${htmlSeguro(r.ubicacion)}</td>
          <td><strong>${htmlSeguro(r.lpn)}</strong></td>
          <td><strong>${htmlSeguro(r.estadoLpn)}</strong></td>
          <td>${htmlSeguro(r.codigo)}</td>
          <td>${htmlSeguro(r.desc)}</td>
          <td class="number">${fmt(r.bultos)}</td>
          <td class="number">${fmt(r.unidades)}</td>
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
  const rows = detallePuntoControlFilas(data);

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
