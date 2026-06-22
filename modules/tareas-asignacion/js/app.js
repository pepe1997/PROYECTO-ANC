let estadosLocales = JSON.parse(localStorage.getItem("tareas_asignacion_estados") || "{}");
let comentariosLocales = JSON.parse(localStorage.getItem("tareas_asignacion_comentarios") || "{}");
let tareasProcesadas = null;

const estadosTarea = ["PENDIENTE", "EN PROCESO", "BLOQUEADO", "COMPLETADO"];

function limpiar(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

function normalizar(valor) {
  return limpiar(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/'/g, "")
    .replace(/\.0$/, "")
    .replace(/[^A-Z0-9]+/gi, "")
    .toUpperCase();
}

function num(valor) {
  const n = parseFloat(String(valor || "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function fmt(valor) {
  return Number(valor || 0).toLocaleString("es-PE", { maximumFractionDigits: 2 });
}

function campo(row, nombres) {
  for (const nombre of nombres) {
    if (row[nombre] !== undefined && row[nombre] !== null && row[nombre] !== "") return row[nombre];
  }
  const keys = Object.keys(row);
  for (const nombre of nombres) {
    const found = keys.find(k => normalizar(k) === normalizar(nombre));
    if (found && row[found] !== undefined && row[found] !== null && row[found] !== "") return row[found];
  }
  return "";
}

function pct(a, b) {
  return b > 0 ? (a / b) * 100 : 0;
}

function cantidadAsignada(row) {
  return num(campo(row, [
    "QtyAsgn Cases",
    "Qty Asgn Cases",
    "QTY_ASGN_CASES",
    "BULTOS_ASIGNADOS",
    "BULTOS ASIGNADOS",
    "BULTOS ASIG",
    "BULTOS_ASIG",
    "BULTOS ASIGNADO",
    "CS_ASIGNADO",
    "CS ASIGNADO",
    "CANTIDAD_ASIGNADA_BULTOS",
    "CANTIDAD ASIGNADA BULTOS",
    "CANTIDAD_ASIGNADA_BUL",
    "CANTIDAD ASIGNADA BUL"
  ]));
}

function kpi(label, value, note = "", clase = "") {
  return `<div class="kpi ${clase}"><span>${label}</span><strong>${value}</strong>${note ? `<small>${note}</small>` : ""}</div>`;
}

function tabla(headers, rows, empty = "Sin datos") {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${rows.join("") || `<tr><td colspan="${headers.length}">${empty}</td></tr>`}</tbody>
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

function prepararHtmlExcel(html) {
  const css = `
    <meta charset="UTF-8">
    <style>.excel-text{mso-number-format:"\\@";}td.excel-text{mso-number-format:"\\@";}</style>
  `;
  return css + String(html || "").replace(/<td([^>]*)>([\s\S]*?)<\/td>/gi, (match, attrs, contenido) => {
    const texto = contenido.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    if (!/^[0-9]{10,}$/.test(texto) && !/^[0-9]+(?:\.[0-9]+)?E\+[0-9]+$/i.test(texto)) return match;
    const attrsTexto = /style\s*=/.test(attrs)
      ? attrs.replace(/style\s*=\s*["']([^"']*)["']/i, `style="$1;mso-number-format:'\\@';"`)
      : `${attrs} style="mso-number-format:'\\@';"`;
    return /class\s*=/.test(attrsTexto)
      ? `<td${attrsTexto.replace(/class\s*=\s*["']([^"']*)["']/i, `class="$1 excel-text"`)}>${contenido}</td>`
      : `<td${attrsTexto} class="excel-text">${contenido}</td>`;
  });
}

function estadoNormalizado(valor) {
  const e = normalizar(valor);
  if (["COMPLETADO", "COMPLETO", "HECHO", "FINALIZADO", "TERMINADO"].includes(e)) return "COMPLETADO";
  if (["LISTO", "DISTRIBUCION", "PENDIENTE"].includes(e)) return "PENDIENTE";
  if (["ENPROCESO", "PROCESO", "TRABAJANDO", "EN_CURSO", "PROCESAMINICIADO", "PROCESAMIENTO", "PROCESAMINICIADO"].includes(e)) return "EN PROCESO";
  if (["BLOQUEADO", "BLOQUEO", "PAUSADO", "DETENIDO"].includes(e)) return "BLOQUEADO";
  return "PENDIENTE";
}

function prioridadNormalizada(valor) {
  const p = normalizar(valor);
  if (["ALTA", "URGENTE", "CRITICA", "CRITICO"].includes(p)) return "ALTA";
  if (["BAJA"].includes(p)) return "BAJA";
  return "MEDIA";
}

function idTarea(row, index) {
  const id = campo(row, ["ID", "ID_TAREA", "TAREA_ID"]);
  if (id) return normalizar(id);
  return [
    campo(row, ["NRO_TAREA", "Nro Tarea", "TAREA"]),
    campo(row, ["OLA", "Numero Ejecuc"]),
    campo(row, ["CODIGO", "PRODUCTO", "SKU"]),
    campo(row, ["LPN", "LPN_ENTRADA", "Nbr LPN Entrada"]),
    campo(row, ["UBICACION", "UBICACION_ORIGEN", "UBICACION_LPN", "DESDE_UBICACION"]),
    campo(row, ["RESERVA", "CODIGO_RESERVA", "COD_RESERVA"]),
    index
  ].map(normalizar).join("|");
}

function tareasBase() {
  if (tareasProcesadas) return tareasProcesadas;
  tareasProcesadas = dataAsignacion.map((row, index) => {
    const id = idTarea(row, index);
    const estadoHoja = campo(row, ["ESTADO TAREA", "ESTADO_TAREA", "Estado Tarea2", "STATUS", "ESTADO", "Estado"]);
    const asignacion = limpiar(campo(row, ["ASIGNACION", "ASIGNACION_TAREA"])) || derivarAsignacion(campo(row, ["TIPO ASIGNACION", "TIPO_ASIGNACION"]));
    const estado = estadosLocales[id] || estadoNormalizado(estadoHoja);
    return {
      id,
      index,
      row,
      asignacion,
      codigo: limpiar(campo(row, ["CODIGO", "PRODUCTO", "SKU", "COD_PRODUCTO"])),
      descripcion: limpiar(campo(row, ["DESCRIPCION", "DESC", "PRODUCTO_DESC"])),
      lpn: limpiar(campo(row, ["LPN", "LPN_ID", "LPN_ENTRADA", "Nbr LPN Entrada"])),
      lpnEntrada: limpiar(campo(row, ["Nbr LPN Entrada", "LPN_ENTRADA", "LPN", "LPN_ID"])),
      reserva: limpiar(campo(row, ["RESERVA", "CODIGO_RESERVA", "COD_RESERVA"])),
      tarea: limpiar(campo(row, ["NRO_TAREA", "Nro Tarea", "TAREA"])),
      ola: limpiar(campo(row, ["OLA", "Numero Ejecuc"])),
      ubicacion: limpiar(campo(row, ["UBICACION", "UBICACION_ORIGEN", "UBICACION_LPN", "DESDE_UBICACION", "Desde Ubicación", "UBI"])),
      destino: limpiar(campo(row, ["DESTINO", "UBICACION_DESTINO", "Ubicación de destino", "UBICACION_SUGERIDA"])),
      pick: limpiar(campo(row, ["UBICACION_PICK", "Ubicación Pick"])),
      ubicacion: limpiar(campo(row, ["DESDE_UBICACION", "Desde Ubicación", "Desde Ubicacion", "UBICACION_LPN", "ubic LPN", "UBICACION", "UBICACION_ORIGEN", "UBI"])),
      destino: limpiar(campo(row, ["DESTINO", "Destino", "UBICACION_DESTINO", "Ubicación de destino", "Ubicacion de destino", "UBICACION_SUGERIDA"])),
      pick: limpiar(campo(row, ["UBICACION_PICK", "Ubicación Pick", "Ubicacion Pick"])),
      ubicActivo: limpiar(campo(row, ["Ubic Actvo", "UBIC ACTVO", "UBIC_ACTVO", "UBIC ACTIVO", "UBIC_ACTIVO"])),
      ubicLpn: limpiar(campo(row, ["ubic LPN", "UBIC LPN", "UBIC_LPN", "UBICACION_LPN"])),
      ubicPallet: limpiar(campo(row, ["Ubic Pallet", "UBIC PALLET", "UBIC_PALLET", "UBICACION PALLET", "UBICACION_PALLET"])),
      usuario: limpiar(campo(row, ["USUARIO", "OPERADOR", "RESPONSABLE", "ASIGNADO_A"])),
      usuario: limpiar(campo(row, ["Usuario Modificac", "Usuario creado", "USUARIO", "OPERADOR", "RESPONSABLE", "ASIGNADO_A"])),
      tipo: limpiar(campo(row, ["TIPO_ASIGANCION", "Tipo Asignac", "TIPO", "TIPO_TAREA", "MODULO"])) || "ASIGANCION",
      tipo: limpiar(campo(row, ["TIPO_ASIGANCION", "TIPO ASIGNACION", "Tipo Asignac", "TIPO", "TIPO_TAREA", "MODULO"])) || "ASIGNACION",
      estadoFuente: limpiar(estadoHoja),
      jerarquia2: limpiar(campo(row, ["JERARQUIA2", "Jerarq2", "Jerarquia2"])),
      prioridad: prioridadNormalizada(campo(row, ["PRIORIDAD", "NIVEL"])),
      fecha: limpiar(campo(row, ["FECHA", "FECHA_TAREA", "FECHA_ORDEN"])),
      fecha: limpiar(campo(row, ["Fe Y Hr Modif", "Fe y Hr Creac", "FECHA", "FECHA_TAREA", "FECHA_ORDEN"])),
      unidades: num(campo(row, ["UNI_ASIGNADA", "Un Asig", "UNIDADES", "CANTIDAD", "QTY"])),
      bultos: num(campo(row, ["BULTOS", "QtyAsgn Cases", "BULTOS_PEDIDO", "CASES"])),
      asignado: cantidadAsignada(row),
      estado,
      comentario: comentariosLocales[id] || limpiar(campo(row, ["COMENTARIO", "OBSERVACION", "OBSERVACIONES"]))
    };
  });
  return tareasProcesadas;
}

function derivarAsignacion(valor) {
  const txt = limpiar(valor);
  if (!txt) return "";
  if (normalizar(txt).startsWith("REA")) return txt;
  const idx = txt.indexOf("- ");
  return idx >= 0 ? txt.slice(idx + 2).trim() : txt;
}

function filtrarTareas() {
  const q = limpiar(document.getElementById("filtroTareas")?.value).toLowerCase();
  const estado = limpiar(document.getElementById("estadoFiltro")?.value);
  const prioridad = limpiar(document.getElementById("prioridadFiltro")?.value);
  return tareasBase().filter(t => {
    const texto = [t.codigo, t.descripcion, t.lpn, t.tarea, t.ola, t.reserva, t.ubicacion, t.destino, t.pick, t.usuario, t.tipo, t.estadoFuente, t.estado, t.comentario].join(" ").toLowerCase();
    return (!q || texto.includes(q)) && (!estado || t.estado === estado) && (!prioridad || t.prioridad === prioridad);
  });
}

function resumenTareas(data = tareasBase()) {
  const total = data.length;
  const completado = data.filter(t => t.estado === "COMPLETADO").length;
  const proceso = data.filter(t => t.estado === "EN PROCESO").length;
  const bloqueado = data.filter(t => t.estado === "BLOQUEADO").length;
  const pendiente = data.filter(t => t.estado === "PENDIENTE").length;
  const alta = data.filter(t => t.prioridad === "ALTA").length;
  const bultos = data.reduce((a, b) => a + b.bultos, 0);
  const unidades = data.reduce((a, b) => a + b.unidades, 0);
  const tareas = new Set(data.map(t => t.tarea).filter(Boolean)).size;
  const olas = new Set(data.map(t => t.ola).filter(Boolean)).size;
  return { total, completado, proceso, bloqueado, pendiente, alta, bultos, unidades, tareas, olas };
}

const modulosReporte = [
  { id: "CASE", nombre: "Tarea Case", detalle: "Activo case y bultos" },
  { id: "UNIDADES", nombre: "Picking Unitario", detalle: "Tareas unitarias y unidades asignadas" },
  { id: "DIGEMID", nombre: "Tarea Digemid", detalle: "Asignaciones DIGEMID" },
  { id: "REABASTO", nombre: "Tarea Prime / Reabasto", detalle: "Tareas Prime, reabasto y baldas" },
  { id: "CODPLUS", nombre: "Tarea CodPlus", detalle: "Consolidado plus" },
  { id: "EXTRACCIONES", nombre: "Tarea Extracciones", detalle: "Full LPN / extracciones" },
  { id: "PTS", nombre: "Tarea PTS", detalle: "PTS mass racks" }
];
const modulosVistaOperativa = new Set(["CASE", "UNIDADES", "DIGEMID", "REABASTO", "PTS"]);

function usaVistaOperativa(modulo) {
  return modulosVistaOperativa.has(modulo);
}

function textoReporte(t) {
  return [t.asignacion, t.tipo, t.estadoFuente, t.tarea, t.ola, t.ubicacion, t.pick, t.destino, t.descripcion].join(" ").toUpperCase();
}

function perteneceModulo(t, modulo) {
  const txt = normalizar(textoReporte(t));
  const asignacion = normalizar(t.asignacion);
  const tipo = normalizar(t.tipo);

  if (modulo === "DIGEMID") return txt.includes("DIGEMID");
  if (modulo === "REABASTO") return txt.includes("REABAST") || txt.includes("BALDA") || txt.includes("PRIME") || asignacion.startsWith("REA");
  if (modulo === "CODPLUS") return txt.includes("CODPLUS") || txt.includes("CONSOLIDADOPLUS") || txt.includes("CODPLUSALM");
  if (modulo === "EXTRACCIONES") return txt.includes("EXTRACC") || txt.includes("EXTRACION") || txt.includes("EXTRACCION") || asignacion.includes("EXTRACCIONES");
  if (modulo === "PTS") return txt.includes("PTSMASS") || txt.includes("PTSRACK") || txt.includes("PTS");
  if (modulo === "UNIDADES") return txt.includes("PICKINGUNITARIO") || txt.includes("UNITARIO") || (t.bultos === 0 && t.unidades > 0);
  if (modulo === "CASE") {
    const esEspecial = ["DIGEMID", "REABASTO", "CODPLUS", "EXTRACCIONES", "PTS", "UNIDADES"].some(m => perteneceModulo(t, m));
    return !esEspecial && (t.bultos > 0 || tipo.includes("DISTRIB") || asignacion.includes("CONSOLIDADOACT"));
  }
  return false;
}

function dataReporte(modulo) {
  return tareasBase().filter(t => perteneceModulo(t, modulo));
}

function agruparTareasOperativas(data, modulo = "") {
  const mapa = new Map();
  data.forEach(t => {
    const ubicacion = t.ubicacion || t.pick || "SIN UBICACION";
    const key = [estadoReporte(t), t.tarea || "SIN TAREA", t.lpn || "SIN LPN", ubicacion, t.codigo || "SIN CODIGO"].map(normalizar).join("|");
    if (!mapa.has(key)) {
      mapa.set(key, {
        ...t,
        ubicacion,
        destinos: new Set(),
        jerarquias2: new Set(),
        registros: 0,
        bultos: 0,
        unidades: 0,
        totalTrabajo: 0
      });
    }
    const item = mapa.get(key);
    item.destinos.add(t.destino || "SIN DESTINO");
    if (t.jerarquia2) item.jerarquias2.add(t.jerarquia2);
    item.registros += 1;
    item.bultos += t.bultos;
    item.unidades += t.unidades;
    item.totalTrabajo += medidaTrabajo(t, modulo);
  });
  return Array.from(mapa.values()).sort((a, b) =>
    estadoReporte(a).localeCompare(estadoReporte(b)) ||
    pasilloUbicacion(a.ubicacion).localeCompare(pasilloUbicacion(b.ubicacion)) ||
    b.totalTrabajo - a.totalTrabajo
  );
}

function estadoReporte(t) {
  const e = limpiar(t.estadoFuente);
  const n = normalizar(e);
  if (!n || n === "ASIGNADOS") return "DISTRIBUCION";
  if (n === "LISTO") return "Listo";
  if (n === "PROCESAMINICIADO" || n === "PROCESOINICIADO") return "Proceso iniciado";
  if (n === "TERMINADO") return "Terminado";
  if (n === "DISTRIBUCION") return "Distribucion";
  return e;
}

function estadoCase(t) {
  const ubicActivo = limpiar(t.ubicActivo);
  const ubicLpn = limpiar(t.ubicLpn);
  const lpnEntrada = limpiar(t.lpnEntrada);
  const tarea = limpiar(t.tarea);

  if (normalizar(ubicLpn) === "DROPPICKINGMASS962" && lpnEntrada) return "Terminado / Distribucion";
  if (ubicActivo && tarea) return "Listo";
  if (!ubicActivo && !tarea && lpnEntrada && !ubicLpn) return "Proceso iniciado";
  return estadoReporte(t);
}

function ubicacionCase(t) {
  const estado = estadoCase(t);
  if (estado === "Listo") return t.ubicActivo || "SIN UBICACION ACTIVA";
  if (estado === "Terminado / Distribucion") return t.ubicLpn || "DROP-PICKING-MASS-962";
  return t.ubicLpn || t.ubicActivo || "SIN UBICACION";
}

function claveTareaCase(t) {
  return limpiar(t.tarea) || limpiar(t.lpnEntrada) || "SIN IDENTIFICADOR";
}

function estadoPts(t) {
  const tarea = limpiar(t.tarea);
  const lpnEntrada = limpiar(t.lpnEntrada);
  const ubicLpn = limpiar(t.ubicLpn);
  const ubicPallet = limpiar(t.ubicPallet);

  if (normalizar(ubicPallet) === "DROPPICKINGMASS962") return "Terminado / Distribucion";
  if (tarea && lpnEntrada && normalizar(ubicLpn).startsWith("MASS")) return "Listo";
  if (!ubicLpn && !ubicPallet) return "Proceso iniciado";
  const estadoFuente = normalizar(estadoReporte(t));
  if (estadoFuente === "LISTO") return "Listo";
  if (estadoFuente.includes("PROCES")) return "Proceso iniciado";
  if (estadoFuente.includes("TERMIN") || estadoFuente === "DISTRIBUCION") return "Terminado / Distribucion";
  return "Proceso iniciado";
}

function ubicacionPts(t) {
  const estado = estadoPts(t);
  if (estado === "Listo") return t.ubicLpn || "SIN UBICACION LPN";
  if (estado === "Terminado / Distribucion") return t.ubicPallet || "DROP-PICKING-MASS-962";
  return t.ubicLpn || t.ubicPallet || "SIN UBICACION";
}

function estadoOperativo(t, modulo) {
  return modulo === "PTS" ? estadoPts(t) : estadoCase(t);
}

function ubicacionOperativa(t, modulo) {
  return modulo === "PTS" ? ubicacionPts(t) : ubicacionCase(t);
}

function pasilloOperativo(t, modulo) {
  const estado = estadoOperativo(t, modulo);
  if (estado === "Listo") return pasilloUbicacion(ubicacionOperativa(t, modulo));
  if (estado === "Proceso iniciado") return "PROCESO INICIADO";
  if (estado === "Terminado / Distribucion") return "DISTRIBUCION";
  return pasilloUbicacion(ubicacionOperativa(t, modulo));
}

function medidaTrabajo(t, modulo = "") {
  if (modulo === "PTS") return t.asignado;
  return modulo === "UNIDADES" ? t.unidades : t.bultos;
}

function etiquetaMedida(modulo = "") {
  return modulo === "UNIDADES" ? "Unidades" : "Bultos";
}

function agruparPor(data, fn, modulo = "") {
  const mapa = new Map();
  data.forEach(t => {
    const key = fn(t);
    if (!mapa.has(key)) mapa.set(key, { label: key, tareas: 0, bultos: 0, unidades: 0, valor: 0 });
    const item = mapa.get(key);
    item.tareas += 1;
    item.bultos += t.bultos;
    item.unidades += t.unidades;
    item.valor += medidaTrabajo(t, modulo);
  });
  return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor || b.tareas - a.tareas);
}

function resumenReporte(data, modulo = "") {
  const tareasAgrupadas = agruparTareasOperativas(data, modulo);
  const estados = agruparPor(data, estadoReporte, modulo);
  return {
    registros: data.length,
    tareas: tareasAgrupadas.length,
    lpns: new Set(data.map(t => t.lpn).filter(Boolean)).size,
    productos: new Set(data.map(t => t.codigo).filter(Boolean)).size,
    olas: new Set(data.map(t => t.ola).filter(Boolean)).size,
    bultos: data.reduce((a, b) => a + b.bultos, 0),
    unidades: data.reduce((a, b) => a + b.unidades, 0),
    valor: data.reduce((a, b) => a + medidaTrabajo(b, modulo), 0),
    activos: data.filter(t => normalizar(estadoReporte(t)) !== "DISTRIBUCION").length,
    distribucion: data.filter(t => normalizar(estadoReporte(t)) === "DISTRIBUCION").length,
    estados
  };
}

function verResumen() {
  const data = tareasBase();
  const total = resumenReporte(data);
  const porModulo = modulosReporte.map(m => ({ ...m, data: dataReporte(m.id) })).map(m => ({ ...m, resumen: resumenReporte(m.data, m.id) }));
  const porEstado = agruparPor(data, estadoReporte);
  const porAsignacion = agruparPor(data, t => t.asignacion || "SIN ASIGNACION");
  const porTarea = agruparPor(data, t => t.tarea || "SIN TAREA").slice(0, 12);
  const porLpn = agruparPor(data, t => t.lpnEntrada || t.lpn || "SIN LPN").slice(0, 12);
  const porUbicacion = agruparPor(data, t => t.ubicacion || t.ubicLpn || t.ubicActivo || "SIN UBICACION").slice(0, 12);
  const totalValor = porModulo.reduce((a, b) => a + b.resumen.valor, 0);

  document.getElementById("modulo").innerHTML = `
    <section class="kpi-grid compact">
      ${kpi("Registros", fmt(total.registros))}
      ${kpi("Tareas WMS", fmt(total.tareas))}
      ${kpi("LPNs", fmt(total.lpns))}
      ${kpi("Productos", fmt(total.productos))}
      ${kpi("Bultos", fmt(total.bultos))}
      ${kpi("Unidades", fmt(total.unidades))}
      ${kpi("Activas", fmt(total.activos), "", total.activos ? "warn" : "")}
      ${kpi("Distribucion", fmt(total.distribucion))}
    </section>
    <section class="report-grid">
      ${porModulo.map(m => `
        <article class="report-card" onclick="verModuloReporte('${m.id}')">
          <div>
            <h2>${m.nombre}</h2>
            <span>${m.detalle}</span>
          </div>
          <strong>${fmt(m.resumen.registros)}</strong>
          <small>${fmt(m.resumen.tareas)} tareas / ${fmt(m.resumen.valor)} ${etiquetaMedida(m.id).toLowerCase()}</small>
          <div class="mini-bar"><div style="width:${Math.min(100, pct(m.resumen.registros, total.registros))}%"></div></div>
        </article>
      `).join("")}
    </section>
    <section class="graphic-panel">
      <div class="card">
        <h2>Carga por tipo de tarea</h2>
        ${porModulo.map(m => barraResumen(m.nombre, m.resumen.valor, totalValor, etiquetaMedida(m.id))).join("")}
      </div>
      <div class="card">
        <h2>Lectura ejecutiva</h2>
        <div class="exec-grid">
          <div><strong>${porModulo[0]?.nombre || "-"}</strong><span>Modulo con mas registros</span></div>
          <div><strong>${porTarea[0]?.label || "-"}</strong><span>Tarea con mas asignacion</span></div>
          <div><strong>${porLpn[0]?.label || "-"}</strong><span>LPN con mas asignacion</span></div>
        </div>
      </div>
    </section>
    <section class="dashboard-layout">
      <div class="card">
        <h2>Estados</h2>
        ${tabla(["Estado", "Registros", "Bultos"], porEstado.map(x => filaGrupoValor(x)))}
      </div>
      <div class="card">
        <h2>Asignaciones</h2>
        ${tabla(["Asignacion", "Registros", "Bultos"], porAsignacion.slice(0, 12).map(x => filaGrupoValor(x)))}
      </div>
    </section>
    <section class="dashboard-layout collapsed-summary">
      <div class="card">
        <h2>LPNs con mas asignacion</h2>
        ${tabla(["LPN", "Registros", "Bultos"], porLpn.map(x => filaGrupoValor(x)))}
      </div>
      <div class="card">
        <h2>Ubicaciones con mas asignacion</h2>
        ${tabla(["Ubicacion", "Registros", "Bultos"], porUbicacion.map(x => filaGrupoValor(x)))}
      </div>
    </section>
  `;
}

function barraResumen(label, valor, total, medida) {
  const p = Math.min(100, pct(valor, total));
  return `
    <div class="summary-bar">
      <div><strong>${label}</strong><span>${fmt(valor)} ${medida.toLowerCase()}</span></div>
      <div class="bar"><div style="width:${p}%"></div></div>
      <b>${p.toFixed(1)}%</b>
    </div>
  `;
}

function verModuloReporte(modulo) {
  const config = modulosReporte.find(m => m.id === modulo) || modulosReporte[0];
  document.getElementById("modulo").innerHTML = `
    <div class="section-head report-header">
      <div class="report-heading">
        <h2>${config.nombre}</h2>
      </div>
      <div class="filters report-filters">
        <input class="search" id="filtroReporte" placeholder="Buscar tarea, codigo, LPN o ubicacion..." oninput="renderModuloReporte('${config.id}')">
        <select id="estadoReporteFiltro" onchange="renderModuloReporte('${config.id}')">
          <option value="">Todos los estados</option>
        ${usaVistaOperativa(config.id) ? "" : `
            <option>Distribucion</option>
            <option>Listo</option>
            <option>Terminado</option>
            <option>Proceso iniciado</option>
          `}
        </select>
        <select id="jerarquiaReporteFiltro" onchange="renderModuloReporte('${config.id}')"></select>
        <select id="pasilloReporteFiltro" onchange="renderModuloReporte('${config.id}')"></select>
        <button onclick="exportarReporteExcel('${config.id}')">Excel</button>
        <button class="image-button" onclick="exportarImagenFiltrada('${config.id}')">Imagen filtrada</button>
      </div>
    </div>
    <div id="reporteKpis"></div>
    <div id="reporteContenido"></div>
  `;
  renderModuloReporte(config.id);
}

function pasilloUbicacion(ubicacion) {
  const txt = limpiar(ubicacion).toUpperCase();
  const match = txt.match(/MASS-(\d{1,2})/);
  return match ? match[1].padStart(2, "0") : "SIN PASILLO";
}

function segmentoBultos(valor, promedio) {
  if (valor >= promedio * 1.4) return "ALTO";
  if (valor <= promedio * 0.65) return "BAJO";
  return "MEDIO";
}

function filtrarReporte(data, modulo = "") {
  const q = limpiar(document.getElementById("filtroReporte")?.value).toLowerCase();
  const estado = normalizar(document.getElementById("estadoReporteFiltro")?.value);
  const jerarquia = limpiar(document.getElementById("jerarquiaReporteFiltro")?.value);
  const pasillo = limpiar(document.getElementById("pasilloReporteFiltro")?.value);
  return data.filter(t => {
    const estadoActual = usaVistaOperativa(modulo) ? estadoOperativo(t, modulo) : estadoReporte(t);
    const ubic = usaVistaOperativa(modulo) ? ubicacionOperativa(t, modulo) : (t.ubicacion || t.pick);
    const pasilloActual = usaVistaOperativa(modulo) ? pasilloOperativo(t, modulo) : pasilloUbicacion(ubic);
    const texto = [t.asignacion, estadoActual, t.tarea, t.lpnEntrada, t.ola, t.codigo, t.descripcion, t.lpn, ubic, t.ubicActivo, t.ubicLpn, t.ubicPallet, t.pick, t.jerarquia2].join(" ").toLowerCase();
    return (!q || texto.includes(q)) &&
      (!estado || normalizar(estadoActual) === estado) &&
      (!jerarquia || normalizar(t.jerarquia2) === normalizar(jerarquia)) &&
      (!pasillo || pasilloActual === pasillo);
  });
}

function renderModuloReporte(modulo) {
  const baseModulo = dataReporte(modulo);
  renderFiltrosReporte(baseModulo, modulo);
  const data = filtrarReporte(baseModulo, modulo);
  if (usaVistaOperativa(modulo)) {
    renderVistaOperativa(data, modulo);
    return;
  }
  const r = resumenReporte(data, modulo);
  const foco = focosOperativos(data, modulo);
  const label = etiquetaMedida(modulo);

  document.getElementById("reporteKpis").innerHTML = `
    <section class="kpi-grid compact">
      ${kpi("Registros", fmt(r.registros))}
      ${kpi("Tareas WMS", fmt(r.tareas))}
      ${kpi("LPNs", fmt(r.lpns))}
      ${kpi("Productos", fmt(r.productos))}
      ${kpi("Bultos", fmt(r.bultos))}
      ${kpi("Unidades", fmt(r.unidades))}
      ${kpi(`Total ${label}`, fmt(r.valor))}
      ${kpi("Activas", fmt(r.activos), "", r.activos ? "warn" : "")}
      ${kpi("Distribucion", fmt(r.distribucion))}
    </section>
  `;

  document.getElementById("reporteContenido").innerHTML = `
    <section class="focus-grid">
      ${foco.map(f => `
        <article class="focus-card ${f.clase || ""}">
          <span>${f.label}</span>
          <strong>${f.valor}</strong>
          <small>${f.nota}</small>
        </article>
      `).join("")}
    </section>
    <section class="card" id="tablaReporteCompleta">
      <div class="section-head">
        <h2>Tabla operativa</h2>
        <button onclick="exportarTablaPorId('tablaReporteCompleta', 'tabla_operativa_${modulo.toLowerCase()}')">Excel</button>
      </div>
      ${tablaOperativa(data, modulo)}
    </section>
  `;
}

function ordenarPasilloCase(a, b) {
  if (a === "SIN PASILLO") return 1;
  if (b === "SIN PASILLO") return -1;
  return a.localeCompare(b, "es", { numeric: true });
}

function pasilloCase(t) {
  const estado = estadoCase(t);
  if (estado === "Listo") return pasilloUbicacion(t.ubicActivo);
  if (estado === "Proceso iniciado") return "PROCESO INICIADO";
  if (estado === "Terminado / Distribucion") return "DISTRIBUCION";
  return pasilloUbicacion(ubicacionCase(t));
}

function resumenEstadosCase(data, modulo = "CASE") {
  const mapa = new Map();
  data.forEach(t => {
    const estado = estadoOperativo(t, modulo) || "SIN ESTADO";
    if (!mapa.has(estado)) mapa.set(estado, { estado, tareas: new Set(), bultos: 0 });
    const item = mapa.get(estado);
    item.tareas.add(claveTareaCase(t));
    item.bultos += medidaTrabajo(t, modulo);
  });
  return Array.from(mapa.values()).sort((a, b) => ordenEstado(a.estado) - ordenEstado(b.estado) || a.estado.localeCompare(b.estado, "es"));
}

function tareasPorPasilloCase(data, modulo = "CASE") {
  const mapa = new Map();
  data.forEach(t => {
    const pasillo = pasilloOperativo(t, modulo);
    const estado = estadoOperativo(t, modulo) || "SIN ESTADO";
    const tarea = claveTareaCase(t);
    const ubicacion = ubicacionOperativa(t, modulo);
    const codigo = t.codigo || "SIN CODIGO";
    const producto = t.descripcion || "SIN PRODUCTO";
    const jerarquia = t.jerarquia2 || "SIN JERARQUIA";
    const key = [pasillo, estado, tarea, ubicacion, codigo, producto, jerarquia].map(normalizar).join("|");
    if (!mapa.has(key)) mapa.set(key, { pasillo, estado, tarea, ubicacion, codigo, producto, jerarquia, bultos: 0 });
    const item = mapa.get(key);
    item.bultos += medidaTrabajo(t, modulo);
  });
  return Array.from(mapa.values()).sort((a, b) =>
    ordenarPasilloCase(a.pasillo, b.pasillo) ||
    ordenEstado(a.estado) - ordenEstado(b.estado) ||
    a.tarea.localeCompare(b.tarea, "es", { numeric: true }) ||
    a.ubicacion.localeCompare(b.ubicacion, "es", { numeric: true }) ||
    a.producto.localeCompare(b.producto, "es")
  );
}

function detallePasilloCase(data, modulo = "CASE") {
  const mapa = new Map();
  data.forEach(t => {
    const ubicacion = ubicacionOperativa(t, modulo);
    const estado = estadoOperativo(t, modulo) || "SIN ESTADO";
    const tarea = limpiar(t.tarea) || "-";
    const lpnEntrada = limpiar(t.lpnEntrada) || "-";
    const key = [ubicacion, estado, tarea, lpnEntrada, t.codigo || "SIN CODIGO", t.descripcion || "SIN PRODUCTO"].map(normalizar).join("|");
    if (!mapa.has(key)) {
      mapa.set(key, {
        ubicacion,
        estado,
        tarea,
        lpnEntrada,
        codigo: t.codigo || "SIN CODIGO",
        producto: t.descripcion || "SIN PRODUCTO",
        bultos: 0
      });
    }
    mapa.get(key).bultos += medidaTrabajo(t, modulo);
  });
  return Array.from(mapa.values()).sort((a, b) =>
    a.ubicacion.localeCompare(b.ubicacion, "es", { numeric: true }) ||
    ordenEstado(a.estado) - ordenEstado(b.estado) ||
    a.tarea.localeCompare(b.tarea, "es", { numeric: true })
  );
}

function tablaPrincipalCase(data, modulo = "CASE") {
  const rows = tareasPorPasilloCase(data, modulo);
  const medida = etiquetaMedida(modulo);
  const pasillos = Array.from(new Set(rows.map(x => x.pasillo))).sort(ordenarPasilloCase);
  return `
    <div class="table-wrap case-master-wrap">
      <table class="case-master-table">
        <thead>
          <tr>
            <th>Pasillo / Grupo</th>
            <th>Estado de tarea</th>
            <th>Numero de tarea / LPN</th>
            <th>Ubicacion LPN</th>
            <th>Codigo</th>
            <th>Descripcion del producto</th>
            <th>Jerarquia</th>
            <th>${medida} asignados</th>
          </tr>
        </thead>
        <tbody>
          ${pasillos.map(pasillo => {
            const titulo = /^\d+$/.test(pasillo) ? `Pasillo ${pasillo}` : pasillo;
            const tareas = rows.filter(x => x.pasillo === pasillo);
            return tareas.map((x, index) => `
              <tr class="${normalizar(x.estado).includes("TERMINADO") ? "ok" : normalizar(x.estado).includes("PROCES") ? "warn" : ""}">
                ${index === 0 ? `<td class="case-group-cell" rowspan="${tareas.length}"><strong>${titulo}</strong><small>${tareas.length} registros</small></td>` : ""}
                <td><strong>${x.estado}</strong></td>
                <td>${x.tarea}</td>
                <td><strong>${x.ubicacion}</strong></td>
                <td>${x.codigo}</td>
                <td>${x.producto}</td>
                <td>${x.jerarquia}</td>
                <td class="number">${fmt(x.bultos)}</td>
              </tr>
            `).join("");
          }).join("") || `<tr><td colspan="8">Sin datos</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function filasDetalleGrupo(data, modulo, titulo, incluirEncabezado = true) {
  const medida = etiquetaMedida(modulo);
  const detalle = detallePasilloCase(data, modulo);
  const subtotal = detalle.reduce((total, x) => total + x.bultos, 0);
  return `
      ${incluirEncabezado ? `
      <tr class="case-detail-group">
        <td colspan="7"><strong>${titulo}</strong><span>${detalle.length} detalles</span></td>
      </tr>` : ""}
      ${detalle.map(x => `
      <tr class="${normalizar(x.estado).includes("TERMINADO") ? "ok" : normalizar(x.estado).includes("PROCES") ? "warn" : ""}">
        <td><strong>${x.ubicacion}</strong></td>
        <td>${x.estado}</td>
        <td>${x.tarea}</td>
        <td>${x.lpnEntrada}</td>
        <td>${x.codigo}</td>
        <td>${x.producto}</td>
        <td class="number">${fmt(x.bultos)}</td>
      </tr>
      `).join("")}
      <tr class="case-detail-subtotal">
        <td colspan="6"><strong>Subtotal ${titulo}</strong></td>
        <td class="number"><strong>${fmt(subtotal)}</strong></td>
      </tr>
  `;
}

function tablaDetalleOperativa(data, modulo, claseExtra = "") {
  const medida = etiquetaMedida(modulo);
  return `
    <div class="table-wrap case-detail-wrap ${claseExtra}">
      <table class="case-detail-table">
        <thead><tr><th>Ubicacion operativa</th><th>Estado</th><th>Numero de tarea</th><th>Nbr LPN Entrada</th><th>Codigo</th><th>Producto</th><th>${medida}</th></tr></thead>
        <tbody>${data}</tbody>
      </table>
    </div>
  `;
}

function detallesCasePorPasillo(data, modulo = "CASE") {
  const pasillos = Array.from(new Set(data.map(t => pasilloOperativo(t, modulo))))
    .filter(pasillo => /^\d+$/.test(pasillo))
    .sort(ordenarPasilloCase);
  const grupos = pasillos.map(pasillo => {
    const grupo = data.filter(t => pasilloOperativo(t, modulo) === pasillo);
    return filasDetalleGrupo(grupo, modulo, `Pasillo ${pasillo}`);
  }).join("");

  return `
    ${tablaDetalleOperativa(grupos || `<tr><td colspan="7">Sin datos de pasillos</td></tr>`, modulo)}
  `;
}

function tablaEstadoOperativoSeparada(data, modulo, grupo, titulo, id) {
  const filtrada = data.filter(t => pasilloOperativo(t, modulo) === grupo);
  if (!filtrada.length) return "";
  const filas = filasDetalleGrupo(filtrada, modulo, titulo, false);
  return `
    <section class="card case-state-table">
      <div class="section-head">
        <h2>${titulo}</h2>
        <button onclick="exportarTablaPorId('${id}', '${modulo.toLowerCase()}_${grupo.toLowerCase().replace(/\s+/g, "_")}')">Excel</button>
      </div>
      <div id="${id}">${tablaDetalleOperativa(filas, modulo, "case-state-wrap")}</div>
    </section>
  `;
}

function renderVistaOperativa(data, modulo = "CASE") {
  const config = modulosReporte.find(m => m.id === modulo) || modulosReporte[0];
  const medida = etiquetaMedida(modulo);
  const estados = resumenEstadosCase(data, modulo);
  const tareasTotal = new Set(data.map(claveTareaCase)).size;
  const bultosTotal = data.reduce((total, t) => total + medidaTrabajo(t, modulo), 0);

  document.getElementById("reporteKpis").innerHTML = `
    <div class="case-kpi-section">
      <h3>Numero de tareas por estado</h3>
      <section class="kpi-grid compact">
        ${kpi("Total general tareas", fmt(tareasTotal))}
        ${estados.map(x => kpi(x.estado, fmt(x.tareas.size))).join("")}
      </section>
    </div>
    <div class="case-kpi-section">
      <h3>Total de ${medida.toLowerCase()} por estado</h3>
      <section class="kpi-grid compact">
        ${kpi(`Total general ${medida.toLowerCase()}`, fmt(bultosTotal))}
        ${estados.map(x => kpi(x.estado, fmt(x.bultos))).join("")}
      </section>
    </div>
  `;

  document.getElementById("reporteContenido").innerHTML = `
    <section class="card" id="tablaReporteCompleta">
      <div class="section-head">
        <div>
          <h2>Estado general por pasillo</h2>
        </div>
        <button onclick="exportarTablaPorId('tablaReporteCompleta', '${modulo.toLowerCase()}_estado_por_pasillo')">Excel</button>
      </div>
      ${tablaPrincipalCase(data, modulo)}
    </section>
    <section class="case-detail-section">
      <div class="section-head">
        <div>
          <h2>Detalle por pasillo</h2>
        </div>
        <button onclick="exportarTablaPorId('detalleOperativoCompleto', '${modulo.toLowerCase()}_detalle_por_pasillo')">Excel</button>
      </div>
      <div id="detalleOperativoCompleto">${detallesCasePorPasillo(data, modulo)}</div>
    </section>
    <section class="case-state-tables">
      ${tablaEstadoOperativoSeparada(data, modulo, "PROCESO INICIADO", "Proceso iniciado", `detalleProceso-${modulo}`)}
      ${tablaEstadoOperativoSeparada(data, modulo, "DISTRIBUCION", "Terminado / Distribucion", `detalleDistribucion-${modulo}`)}
    </section>
  `;
}

function bloqueDesplegable(titulo, id, contenido, abierto = false) {
  return `
    <details class="table-toggle" ${abierto ? "open" : ""}>
      <summary>
        <span>${titulo}</span>
        <button onclick="event.preventDefault(); exportarTablaPorId('${id}', '${titulo.toLowerCase().replace(/\s+/g, "_")}')">Excel</button>
      </summary>
      <div id="${id}">${contenido}</div>
    </details>
  `;
}

function renderFiltrosReporte(data, modulo = "") {
  const estadoSelect = document.getElementById("estadoReporteFiltro");
  const jerarquiaSelect = document.getElementById("jerarquiaReporteFiltro");
  const pasilloSelect = document.getElementById("pasilloReporteFiltro");
  if (estadoSelect && estadoSelect.dataset.ready !== "1" && !estadoSelect.querySelector("option:nth-child(2)")) {
    const obtenerEstado = usaVistaOperativa(modulo) ? (t => estadoOperativo(t, modulo)) : estadoReporte;
    const estados = Array.from(new Set(data.map(obtenerEstado).filter(Boolean))).sort((a, b) => ordenEstado(a) - ordenEstado(b) || a.localeCompare(b, "es"));
    estadoSelect.innerHTML = `<option value="">Todos los estados</option>${estados.map(e => `<option value="${e}">${e}</option>`).join("")}`;
    estadoSelect.dataset.ready = "1";
  }
  if (jerarquiaSelect && jerarquiaSelect.dataset.ready !== "1") {
    const jerarquias = Array.from(new Set(data.map(t => t.jerarquia2).filter(Boolean))).sort();
    jerarquiaSelect.innerHTML = `<option value="">Todas las jerarquias</option>${jerarquias.map(j => `<option value="${j}">${j}</option>`).join("")}`;
    jerarquiaSelect.dataset.ready = "1";
  }
  if (pasilloSelect && pasilloSelect.dataset.ready !== "1") {
    const pasillos = Array.from(new Set(data.map(t => usaVistaOperativa(modulo) ? pasilloOperativo(t, modulo) : pasilloUbicacion(t.ubicacion || t.pick)))).sort(ordenarPasilloCase);
    pasilloSelect.innerHTML = `<option value="">Todos los pasillos</option>${pasillos.map(p => `<option value="${p}">${/^\d+$/.test(p) ? `Pasillo ${p}` : p}</option>`).join("")}`;
    pasilloSelect.dataset.ready = "1";
  }
}

function focosOperativos(data, modulo) {
  const porLpn = agruparPor(data, t => t.lpn || "SIN LPN", modulo);
  const porPasillo = agruparPor(data, t => pasilloUbicacion(t.ubicacion || t.pick), modulo);
  const pendientes = data.filter(t => normalizar(estadoReporte(t)) !== "TERMINADO");
  const topLpn = porLpn[0];
  const topPasillo = porPasillo.sort((a, b) => b.valor - a.valor)[0];
  const promedio = data.reduce((a, b) => a + medidaTrabajo(b, modulo), 0) / (data.length || 1);
  const alto = data.filter(t => segmentoBultos(medidaTrabajo(t, modulo), promedio) === "ALTO").length;
  const label = etiquetaMedida(modulo).toLowerCase();

  return [
    { label: "Primero atacar", valor: topPasillo?.label || "-", nota: `${fmt(topPasillo?.valor || 0)} ${label} concentrados`, clase: "primary" },
    { label: "LPN pesado", valor: topLpn?.label || "-", nota: `${fmt(topLpn?.valor || 0)} ${label}`, clase: "warn" },
    { label: "Pendiente operativo", valor: fmt(pendientes.length), nota: "registros no terminados" },
    { label: modulo === "PTS" ? "Segmento alto" : "Alta carga", valor: fmt(alto), nota: "registros sobre promedio" }
  ];
}

function tablaReporte(data, modulo = "", limit = 300) {
  const label = etiquetaMedida(modulo);
  const agrupada = agruparTareasOperativas(data, modulo);
  return tabla(["Estado", "Tarea", "LPN", "Ubicacion", "Codigo", "Descripcion", label], agrupada.slice(0, limit).map(t => `
    <tr class="${normalizar(estadoReporte(t)) === "TERMINADO" ? "ok" : normalizar(estadoReporte(t)).includes("PROCES") ? "warn" : ""}">
      <td><strong>${estadoReporte(t)}</strong></td>
      <td>${t.tarea}</td>
      <td>${t.lpn}</td>
      <td>${t.ubicacion}</td>
      <td>${t.codigo}</td>
      <td>${t.descripcion}</td>
      <td class="number">${fmt(t.totalTrabajo)}</td>
    </tr>
  `));
}

function ordenEstado(valor) {
  const n = normalizar(valor);
  if (n === "LISTO") return 1;
  if (n === "PROCESOINICIADO" || n === "PROCESAMINICIADO") return 2;
  if (n === "DISTRIBUCION" || n === "TERMINADODISTRIBUCION") return 3;
  if (n === "TERMINADO") return 3;
  return 9;
}

function tablaOperativa(data, modulo = "") {
  const label = etiquetaMedida(modulo);
  const agrupada = agruparTareasOperativas(data, modulo).sort((a, b) =>
    pasilloUbicacion(a.ubicacion).localeCompare(pasilloUbicacion(b.ubicacion)) ||
    a.ubicacion.localeCompare(b.ubicacion) ||
    ordenEstado(estadoReporte(a)) - ordenEstado(estadoReporte(b)) ||
    b.totalTrabajo - a.totalTrabajo
  );
  return tabla(["Estado", "Pasillo", "LPN", "Ubicacion", label, "Jerarquia 2", "Tarea", "Codigo", "Descripcion"], agrupada.map(t => `
    <tr class="${normalizar(estadoReporte(t)) === "TERMINADO" ? "ok" : normalizar(estadoReporte(t)).includes("PROCES") ? "warn" : ""}">
      <td><strong>${estadoReporte(t)}</strong></td>
      <td>${pasilloUbicacion(t.ubicacion)}</td>
      <td><strong>${t.lpn}</strong></td>
      <td>${t.ubicacion}</td>
      <td class="number">${fmt(t.totalTrabajo)}</td>
      <td>${Array.from(t.jerarquias2).join(" / ") || t.jerarquia2}</td>
      <td>${t.tarea}</td>
      <td>${t.codigo}</td>
      <td>${t.descripcion}</td>
    </tr>
  `));
}

function tablaPts(data) {
  const ordenada = agruparTareasOperativas(data, "PTS").sort((a, b) =>
    estadoReporte(a).localeCompare(estadoReporte(b)) ||
    pasilloUbicacion(a.ubicacion).localeCompare(pasilloUbicacion(b.ubicacion)) ||
    a.ubicacion.localeCompare(b.ubicacion) ||
    b.totalTrabajo - a.totalTrabajo
  );
  return tabla(["ESTADO TAREA", "Nro Tarea", "Nbr LPN Entrada", "Desde Ubicacion", "Codigo", "Descripcion", "CS"], ordenada.map(t => `
    <tr>
      <td><strong>${estadoReporte(t)}</strong></td>
      <td><strong>${t.tarea}</strong></td>
      <td>${t.lpn}</td>
      <td><strong>${t.ubicacion}</strong></td>
      <td>${t.codigo}</td>
      <td>${t.descripcion}</td>
      <td class="number">${fmt(t.totalTrabajo)}</td>
    </tr>
  `));
}

function exportarReporteExcel(modulo) {
  const el = document.getElementById("tablaReporteCompleta");
  if (!el) return alert("No hay reporte para exportar");
  descargarExcel(`reporte_${modulo.toLowerCase()}`, el.innerHTML);
}

function htmlReporteSeguro(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function tituloImagenModulo(modulo) {
  const nombres = {
    CASE: "TAREAS DE CASE",
    UNIDADES: "TAREAS DE PICKING UNITARIO",
    DIGEMID: "TAREAS DE DIGEMID",
    REABASTO: "TAREAS DE PRIME / REABASTO",
    CODPLUS: "TAREAS DE CODPLUS",
    EXTRACCIONES: "TAREAS DE EXTRACCIONES",
    PTS: "TAREAS DE PTS"
  };
  return nombres[modulo] || `TAREAS DE ${modulo}`;
}

function filtrosActivosImagen() {
  const valores = [
    limpiar(document.getElementById("estadoReporteFiltro")?.value),
    limpiar(document.getElementById("jerarquiaReporteFiltro")?.value),
    limpiar(document.getElementById("pasilloReporteFiltro")?.value)
  ].filter(Boolean);
  return valores.length ? valores.join(" | ") : "TODOS LOS REGISTROS";
}

function tablaImagenFiltrada(modulo) {
  const unicos = new Map();
  filtrarReporte(dataReporte(modulo), modulo).forEach((t, index) => {
    const ubicacion = limpiar(t.ubicLpn || t.ubicActivo || ubicacionOperativa(t, modulo));
    const pasillo = pasilloUbicacion(ubicacion);
    if (!/^\d{2}$/.test(pasillo) || Number(pasillo) < 1 || Number(pasillo) > 12) return;

    const tarea = limpiar(t.tarea) || "-";
    const lpnEntrada = limpiar(t.lpnEntrada || t.lpn) || "-";
    const identificador = tarea === "-" && lpnEntrada === "-"
      ? `sin-identificador-${index}`
      : `${normalizar(tarea)}|${normalizar(lpnEntrada)}`;

    if (!unicos.has(identificador)) {
      unicos.set(identificador, {
        pasillo,
        ubicacion,
        tarea,
        lpnEntrada,
        codigo: limpiar(t.codigo) || "-",
        descripcion: limpiar(t.descripcion) || "-",
        bultos: 0
      });
    }
    const item = unicos.get(identificador);
    item.bultos += medidaTrabajo(t, modulo);
  });

  const data = Array.from(unicos.values()).sort((a, b) =>
    ordenarPasilloCase(a.pasillo, b.pasillo) ||
    a.ubicacion.localeCompare(b.ubicacion, "es", { numeric: true }) ||
    a.tarea.localeCompare(b.tarea, "es", { numeric: true }) ||
    a.lpnEntrada.localeCompare(b.lpnEntrada, "es", { numeric: true })
  );

  let pasilloAnterior = "";
  const filas = data.map(row => {
    const mostrarPasillo = row.pasillo !== pasilloAnterior;
    pasilloAnterior = row.pasillo;
    return `
      <tr>
        <td>${mostrarPasillo ? Number(row.pasillo) : ""}</td>
        <td>${htmlReporteSeguro(row.tarea)}</td>
        <td>${htmlReporteSeguro(row.lpnEntrada)}</td>
        <td>${htmlReporteSeguro(row.ubicacion)}</td>
        <td>${htmlReporteSeguro(row.codigo)}</td>
        <td>${htmlReporteSeguro(row.descripcion)}</td>
        <td class="number">${fmt(row.bultos)}</td>
      </tr>
    `;
  }).join("");

  return `
    <section class="excel-image-report">
      <table>
        <thead>
          <tr>
            <th>PASILLO</th>
            <th>Nro Tarea</th>
            <th>Nbr LPN Entrada</th>
            <th>Desde Ubicacion</th>
            <th>Codigo</th>
            <th>Descripcion</th>
            <th>CS</th>
          </tr>
        </thead>
        <tbody>
          ${filas || `<tr><td colspan="7">Sin ubicaciones Mass de los pasillos 01 al 12 para los filtros seleccionados</td></tr>`}
        </tbody>
      </table>
    </section>
  `;
}

function exportarImagenFiltrada(modulo) {
  if (typeof html2canvas === "undefined") return alert("No se cargo html2canvas");
  const host = document.createElement("div");
  host.className = "filtered-image-host";
  host.innerHTML = tablaImagenFiltrada(modulo);
  document.body.appendChild(host);

  const reporte = host.firstElementChild;
  const ancho = Math.max(reporte.scrollWidth, reporte.offsetWidth);
  html2canvas(reporte, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    width: ancho,
    windowWidth: ancho
  }).then(canvas => {
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${modulo.toLowerCase()}_tabla_filtrada.png`;
    a.click();
  }).finally(() => host.remove());
}

function exportarTablaPorId(id, nombre) {
  const el = document.getElementById(id);
  if (!el) return alert("No hay tabla para exportar");
  descargarExcel(nombre, el.innerHTML);
}

function verTablero() {
  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <h2>Tablero de tareas</h2>
      <div class="filters">
        <input class="search" id="filtroTareas" placeholder="Buscar codigo, LPN, ubicacion, reserva o descripcion..." oninput="renderTablero()">
        <select id="prioridadFiltro" onchange="renderTablero()">
          <option value="">Todas las prioridades</option>
          <option>ALTA</option>
          <option>MEDIA</option>
          <option>BAJA</option>
        </select>
      </div>
    </div>
    <div id="tareasKpis"></div>
    <div id="tableroTareas"></div>
  `;
  renderTablero();
}

function renderTablero() {
  const data = filtrarTareas();
  const r = resumenTareas(data);
  document.getElementById("tareasKpis").innerHTML = `
    <section class="kpi-grid compact">
      ${kpi("Tareas", fmt(r.total))}
      ${kpi("Completadas", fmt(r.completado), `${pct(r.completado, r.total).toFixed(1)}%`)}
      ${kpi("Pendientes", fmt(r.pendiente), "", "warn")}
      ${kpi("Bloqueadas", fmt(r.bloqueado), "", r.bloqueado ? "danger" : "")}
      ${kpi("Prioridad alta", fmt(r.alta), "", r.alta ? "danger" : "")}
      ${kpi("Bultos", fmt(r.bultos))}
      ${kpi("Unidades", fmt(r.unidades))}
      ${kpi("Tareas WMS", fmt(r.tareas), `${fmt(r.olas)} olas`)}
    </section>
  `;
  document.getElementById("tableroTareas").innerHTML = `
    <section class="board">
      ${estadosTarea.map(estado => columnaTablero(estado, data.filter(t => t.estado === estado))).join("")}
    </section>
  `;
}

function columnaTablero(estado, data) {
  return `
    <div class="board-column">
      <div class="board-title">
        <strong>${estado}</strong>
        <span>${fmt(data.length)}</span>
      </div>
      <div class="task-list">
        ${data.slice(0, 80).map(t => tarjetaTarea(t)).join("") || `<div class="empty">Sin tareas</div>`}
      </div>
    </div>
  `;
}

function tarjetaTarea(t) {
  return `
    <article class="task-card ${t.prioridad.toLowerCase()}">
      <div class="task-head">
        <strong>${t.codigo || "Sin codigo"}</strong>
        <span>${t.prioridad}</span>
      </div>
      <p>${t.descripcion || "Sin descripcion"}</p>
      <small>${t.tarea || "Sin tarea"} / ${t.ola || "Sin ola"}</small>
      <small>${t.ubicacion || "Sin ubicacion"} / ${t.lpnEntrada || t.lpn || "Sin LPN"}</small>
      <div class="task-actions">
        <select onchange="guardarEstado('${t.id}', this.value)">
          ${estadosTarea.map(e => `<option ${t.estado === e ? "selected" : ""}>${e}</option>`).join("")}
        </select>
        <button class="ghost" onclick="abrirDetalle('${encodeURIComponent(t.id)}')">Ver</button>
      </div>
    </article>
  `;
}

function verTareas() {
  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <h2>Lista de tareas</h2>
      <div class="filters">
        <input class="search" id="filtroTareas" placeholder="Buscar en tareas..." oninput="renderTablaTareas()">
        <select id="estadoFiltro" onchange="renderTablaTareas()">
          <option value="">Todos los estados</option>
          ${estadosTarea.map(e => `<option>${e}</option>`).join("")}
        </select>
        <select id="prioridadFiltro" onchange="renderTablaTareas()">
          <option value="">Todas las prioridades</option>
          <option>ALTA</option>
          <option>MEDIA</option>
          <option>BAJA</option>
        </select>
        <button onclick="exportarTareasExcel()">Excel</button>
      </div>
    </div>
    <div id="tablaTareas"></div>
    <div id="modalTarea" class="modal-backdrop" hidden></div>
  `;
  renderTablaTareas();
}

function renderTablaTareas() {
  const data = filtrarTareas();
  document.getElementById("tablaTareas").innerHTML = tabla(["Estado", "Estado WMS", "Tarea", "OLA", "Codigo", "Descripcion", "LPN", "Ubicacion", "Pick", "Unidades", "Bultos", "Responsable", "Comentario"], data.map(t => `
    <tr class="${t.estado === "COMPLETADO" ? "ok" : t.estado === "BLOQUEADO" ? "bad" : t.prioridad === "ALTA" ? "warn" : ""}">
      <td>
        <select onchange="guardarEstado('${t.id}', this.value)">
          ${estadosTarea.map(e => `<option ${t.estado === e ? "selected" : ""}>${e}</option>`).join("")}
        </select>
      </td>
      <td><strong>${t.estadoFuente || "-"}</strong></td>
      <td>${t.tarea}</td>
      <td>${t.ola}</td>
      <td>${t.codigo}</td>
      <td>${t.descripcion}</td>
      <td>${t.lpn}</td>
      <td>${t.ubicacion}</td>
      <td>${t.pick}</td>
      <td class="number">${fmt(t.unidades)}</td>
      <td class="number">${fmt(t.bultos)}</td>
      <td>${t.usuario}</td>
      <td><input class="inline-input" value="${t.comentario}" onchange="guardarComentario('${t.id}', this.value)"></td>
    </tr>
  `));
}

function verAnalisis() {
  const data = tareasBase();
  const r = resumenTareas(data);
  const porTipo = agrupar(data, t => t.tipo || "SIN TIPO");
  const porUsuario = agrupar(data, t => t.usuario || "SIN RESPONSABLE");
  const porPrioridad = agrupar(data, t => t.prioridad);
  const porOla = agrupar(data, t => t.ola || "SIN OLA");

  document.getElementById("modulo").innerHTML = `
    <section class="kpi-grid compact">
      ${kpi("Avance", `${pct(r.completado, r.total).toFixed(1)}%`, `${fmt(r.completado)} / ${fmt(r.total)}`)}
      ${kpi("En proceso", fmt(r.proceso))}
      ${kpi("Bloqueadas", fmt(r.bloqueado), "", r.bloqueado ? "danger" : "")}
      ${kpi("Pendientes", fmt(r.pendiente), "", "warn")}
      ${kpi("Bultos", fmt(r.bultos))}
      ${kpi("Unidades", fmt(r.unidades))}
      ${kpi("Tareas WMS", fmt(r.tareas))}
      ${kpi("Olas", fmt(r.olas))}
    </section>
    <section class="dashboard-layout">
      <div class="card">
        <h2>Estado general</h2>
        ${barra("Completado", r.completado, r.total)}
        ${barra("En proceso", r.proceso, r.total)}
        ${barra("Bloqueado", r.bloqueado, r.total)}
        ${barra("Pendiente", r.pendiente, r.total)}
      </div>
      <div class="card">
        <h2>Prioridad</h2>
        ${tabla(["Prioridad", "Tareas", "Bultos"], porPrioridad.map(x => filaGrupo(x)))}
      </div>
    </section>
    <section class="dashboard-layout">
      <div class="card">
        <h2>Por tipo</h2>
        ${tabla(["Tipo", "Tareas", "Bultos"], porTipo.map(x => filaGrupo(x)))}
      </div>
      <div class="card">
        <h2>Por responsable</h2>
        ${tabla(["Responsable", "Tareas", "Bultos"], porUsuario.map(x => filaGrupo(x)))}
      </div>
    </section>
    <section class="card">
      <h2>Por OLA</h2>
      ${tabla(["OLA", "Registros", "Bultos"], porOla.map(x => filaGrupo(x)))}
    </section>
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

function agrupar(data, fn) {
  const mapa = new Map();
  data.forEach(t => {
    const key = fn(t);
    if (!mapa.has(key)) mapa.set(key, { label: key, tareas: 0, bultos: 0 });
    const item = mapa.get(key);
    item.tareas += 1;
    item.bultos += t.bultos;
  });
  return Array.from(mapa.values()).sort((a, b) => b.tareas - a.tareas);
}

function filaGrupo(x) {
  return `
    <tr>
      <td><strong>${x.label}</strong></td>
      <td>${fmt(x.tareas)}</td>
      <td class="number">${fmt(x.bultos)}</td>
    </tr>
  `;
}

function filaGrupoValor(x) {
  return `
    <tr>
      <td><strong>${x.label}</strong></td>
      <td>${fmt(x.tareas)}</td>
      <td class="number">${fmt(x.valor ?? x.bultos)}</td>
    </tr>
  `;
}

function verBase() {
  const headers = Object.keys(dataAsignacion[0] || {});
  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <h2>Base ASIGANCION</h2>
      <div class="filters">
        <input class="search" id="filtroBase" placeholder="Buscar en la base..." oninput="renderBase()">
        <button onclick="exportarBaseExcel()">Excel</button>
      </div>
    </div>
    <div id="baseTabla"></div>
  `;
  renderBase(headers);
}

function renderBase(headersParam) {
  const q = limpiar(document.getElementById("filtroBase")?.value).toLowerCase();
  const headers = headersParam || Object.keys(dataAsignacion[0] || {});
  const data = dataAsignacion.filter(r => !q || Object.values(r).join(" ").toLowerCase().includes(q));
  document.getElementById("baseTabla").innerHTML = tabla(headers, data.slice(0, 1500).map(r => `
    <tr>${headers.map(h => `<td>${limpiar(r[h])}</td>`).join("")}</tr>
  `));
}

function guardarEstado(id, estado) {
  estadosLocales[id] = estado;
  localStorage.setItem("tareas_asignacion_estados", JSON.stringify(estadosLocales));
  tareasProcesadas = null;
  if (document.getElementById("tableroTareas")) renderTablero();
  if (document.getElementById("tablaTareas")) renderTablaTareas();
}

function guardarComentario(id, comentario) {
  comentariosLocales[id] = comentario;
  localStorage.setItem("tareas_asignacion_comentarios", JSON.stringify(comentariosLocales));
  tareasProcesadas = null;
}

function abrirDetalle(idCodificado) {
  const id = decodeURIComponent(idCodificado);
  const t = tareasBase().find(x => x.id === id);
  if (!t) return;
  const modal = document.getElementById("modalTarea") || crearModalTemporal();
  modal.innerHTML = `
    <div class="modal-card">
      <div class="section-head">
        <div>
          <h2>${t.codigo || "Tarea sin codigo"}</h2>
          <span class="muted-note">${t.estado} / ${t.prioridad}</span>
        </div>
        <button class="ghost" onclick="cerrarDetalle()">Cerrar</button>
      </div>
      ${tabla(["Campo", "Valor"], [
        ["Descripcion", t.descripcion],
        ["Tarea", t.tarea],
        ["OLA", t.ola],
        ["Estado WMS", t.estadoFuente],
        ["LPN", t.lpn],
        ["Reserva", t.reserva],
        ["Ubicacion", t.ubicacion],
        ["Ubicacion Pick", t.pick],
        ["Unidades", fmt(t.unidades)],
        ["Bultos", fmt(t.bultos)],
        ["Responsable", t.usuario],
        ["Fecha", t.fecha],
        ["Comentario", t.comentario]
      ].map(([a, b]) => `<tr><td><strong>${a}</strong></td><td>${b}</td></tr>`))}
    </div>
  `;
  modal.hidden = false;
}

function crearModalTemporal() {
  const modal = document.createElement("div");
  modal.id = "modalTarea";
  modal.className = "modal-backdrop";
  document.body.appendChild(modal);
  return modal;
}

function cerrarDetalle() {
  const modal = document.getElementById("modalTarea");
  if (!modal) return;
  modal.hidden = true;
  modal.innerHTML = "";
}

function exportarTareasExcel() {
  descargarExcel("tareas_asignacion", document.getElementById("tablaTareas").innerHTML);
}

function exportarBaseExcel() {
  descargarExcel("base_asigancion", document.getElementById("baseTabla").innerHTML);
}
