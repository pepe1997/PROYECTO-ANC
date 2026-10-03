function limpiar(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

function normalizar(valor) {
  return limpiar(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function num(valor) {
  const limpio = String(valor || "").trim().replace(/\s/g, "");
  const normal = limpio.includes(",") && limpio.includes(".")
    ? limpio.replace(/,/g, "")
    : limpio.replace(",", ".");
  const n = parseFloat(normal);
  return Number.isFinite(n) ? n : 0;
}

function fmt(valor) {
  return Number(valor || 0).toLocaleString("es-PE", { maximumFractionDigits: 2 });
}

function corto(valor, max = 18) {
  const texto = limpiar(valor);
  return texto.length > max ? `${texto.slice(0, max)}...` : texto;
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

let cacheUsuariosPorDni = { firma: "", mapa: new Map() };

function clavesUsuarioDni(valor) {
  const texto = limpiar(valor);
  if (!texto) return [];
  const exacta = normalizar(texto);
  const sinDecimalCero = texto.replace(/[,.]0+$/, "");
  const digitos = sinDecimalCero.replace(/\D/g, "");
  return Array.from(new Set([exacta, digitos].filter(Boolean)));
}

function claveDniUsuario(valor) {
  return clavesUsuarioDni(valor)[0] || "";
}

function mapaUsuariosPorDni() {
  const data = Array.isArray(dataUsuarios) ? dataUsuarios : [];
  const firma = `${data.length}|${data[0] ? Object.keys(data[0]).join(",") : ""}|${limpiar(campo(data[0] || {}, ["DNI"]))}|${limpiar(campo(data[data.length - 1] || {}, ["DNI"]))}`;
  if (cacheUsuariosPorDni.firma === firma) return cacheUsuariosPorDni.mapa;

  const mapa = new Map();
  data.forEach(row => {
    const claves = clavesUsuarioDni(campo(row, ["DNI", "Documento", "DOCUMENTO", "Codigo", "CODIGO"]));
    const nombre = limpiar(campo(row, ["Nombre", "NOMBRE", "Nombres", "NOMBRES"]));
    if (nombre) claves.forEach(clave => mapa.set(clave, nombre));
  });
  cacheUsuariosPorDni = { firma, mapa };
  return mapa;
}

function nombreUsuarioPorDni(usuario) {
  const codigo = limpiar(usuario);
  if (!codigo) return "";
  const mapa = mapaUsuariosPorDni();
  for (const clave of clavesUsuarioDni(codigo)) {
    const nombre = mapa.get(clave);
    if (nombre) return nombre;
  }
  return codigo;
}

function pct(a, b) {
  return b > 0 ? (a / b) * 100 : 0;
}

function pctCumplimiento(a, b) {
  return Math.min(100, pct(a, b));
}

function fechaValor(valor) {
  const texto = limpiar(valor);
  if (!texto) return null;
  const iso = texto.replace(" ", "T");
  const fecha = new Date(iso);
  if (!Number.isNaN(fecha.getTime())) return fecha;
  const partes = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!partes) return null;
  const year = Number(partes[3]) < 100 ? 2000 + Number(partes[3]) : Number(partes[3]);
  return new Date(year, Number(partes[2]) - 1, Number(partes[1]), Number(partes[4] || 0), Number(partes[5] || 0));
}

function fechaCorta(fecha) {
  if (!fecha) return "";
  return fecha.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function horaFecha(fecha) {
  return fecha ? fecha.getHours() : null;
}

function turnoPorHora(hora) {
  if (hora === null || hora === undefined) return "SIN TURNO";
  if (hora >= 7 && hora < 16) return "DIA";
  if (hora >= 16 && hora < 21) return "TARDE";
  return "NOCHE";
}

function pickingEsValido(row) {
  return Number.isFinite(row.bultos) && row.bultos > 0;
}

function modeloPicking() {
  return (dataPicking || []).map((r, index) => {
    const fecha = fechaValor(campo(r, ["FECHA PICK", "FECHA_PICK", "Fecha Pick", "FECHA"]));
    const hora = horaFecha(fecha);
    const destino = limpiar(campo(r, ["DESTINO", "Cod Destino"]));
    const local = limpiar(campo(r, ["LOCAL", "TIENDA", "Nombre Destino"])) || "SIN LOCAL";
    return {
      index,
      centro: limpiar(campo(r, ["CENTRO DISTRIBUCION", "CD"])),
      destino,
      local,
      tiendaKey: destino ? `${destino} | ${local}` : local,
      orden: limpiar(campo(r, ["NRO ORDEN", "ORDEN"])),
      tipo: limpiar(campo(r, ["TIPO ASGIN", "TIPO ASIGN", "TIPO_ASGIN"])) || "SIN TIPO",
      lpn: limpiar(campo(r, ["NRO LPN", "LPN"])),
      carton: limpiar(campo(r, ["NRO CARTON", "CARTON"])),
      codigo: limpiar(campo(r, ["CODIGO", "PRODUCTO"])),
      codAlterno: limpiar(campo(r, ["COD ALTERN", "COD ALTER", "COD_ALTERN"])),
      descripcion: limpiar(campo(r, ["DESCRIPCION", "Descripcion"])),
      usuario: limpiar(campo(r, ["USUARIO PICKING", "USUARIO", "OPERADOR"])) || "SIN USUARIO",
      bultos: num(campo(r, ["BULTOS", "Bultos"])),
      fecha,
      fechaTexto: fechaCorta(fecha),
      hora,
      turno: turnoPorHora(hora),
      raw: r
    };
  }).filter(pickingEsValido);
}

function modeloCase() {
  return (dataCase || [])
    .map((r, index) => {
      const tipo = limpiar(campo(r, ["Tipo Asignac", "TIPO ASIGNAC", "Tipo Asignac  - Interno Bulk Pick", "TIPO ASGIN", "Tipo Asign"]));
      const estado = normalizar(campo(r, ["Estado", "ESTADO"]));
      const fecha = fechaValor(campo(r, ["Fe Y Hr Modif", "Fe y Hr Modif", "FE Y HR MODIF", "Fecha Modif", "FECHA"]));
      const hora = horaFecha(fecha);
      const destino = limpiar(campo(r, ["Destino", "DESTINO", "Cod Destino", "Tienda", "TIENDA"]));
      const local = limpiar(campo(r, ["Local", "LOCAL", "Nombre Destino", "NOMBRE DESTINO"]));
      return {
        index,
        tipo,
        estado,
        estadoLabel: esCaseTerminado({ estado }) ? "Terminado" : estado === "ASIGNADOS" || estado === "ASIGNADO" ? "Asignado" : estado === "CANCELADO" ? "Cancelado" : estado || "Sin estado",
        bultos: num(campo(r, ["QtyAsgn Cases", "QTYASGN CASES", "Qty Asgn Cases", "QTY ASGN CASES", "Bultos", "BULTOS"])),
        usuario: limpiar(campo(r, ["Usua Pick", "USUA PICK", "Usuario Pick", "USUARIO PICKING", "USUARIO"])) || "SIN USUARIO",
        fecha,
        fechaTexto: fechaCorta(fecha),
        hora,
        turno: turnoPorHora(hora),
        destino,
        local,
        tiendaKey: destino && local ? `${destino} | ${local}` : destino || local || "SIN TIENDA",
        lpn: limpiar(campo(r, ["Nro LPN", "NRO LPN", "LPN", "Nro LPNs"])),
        raw: r
      };
    })
    .filter(r => {
      const tipo = normalizar(r.tipo);
      return tipo.includes("INTERNO") && tipo.includes("BULK") && tipo.includes("PICK") && r.bultos > 0;
    });
}

function filtrosCase(data) {
  return data;
}

function esCaseTerminado(row) {
  return row.estado === "TERMINADO" || row.estado === "FINALIZADA";
}

function esPickActivoTerminado(row) {
  return row.estado === "TERMINADO" || row.estado === "FINALIZADA";
}

function estadoPickActivoLabel(estado) {
  const normal = normalizar(estado);
  if (normal === "TERMINADO") return "Terminado";
  if (normal === "FINALIZADA") return "Finalizada";
  if (normal === "LISTO") return "Listo";
  if (normal.includes("PROCESAM")) return "Procesam Iniciado";
  if (normal === "ASIGNADOS" || normal === "ASIGNADO") return "Asignados";
  return limpiar(estado) || "Sin estado";
}

function modeloTareasPickActivo() {
  const mapa = new Map();
  (dataTareas || []).forEach((r, index) => {
    const tarea = limpiar(campo(r, ["Nro Tarea", "NRO TAREA", "NroTarea", "Tarea", "TAREA"]));
    if (!tarea) return;
    const fecha = fechaValor(campo(r, ["Fe Y Hr Modif", "Fe y Hr Modif", "FE Y HR MODIF", "Fecha Modif", "FECHA"]));
    const estado = normalizar(campo(r, ["Estado", "ESTADO"]));
    const item = {
      index,
      tarea,
      estado,
      estadoLabel: estadoPickActivoLabel(estado),
      fecha,
      fechaTexto: fechaCorta(fecha),
      hora: horaFecha(fecha),
      turno: turnoPorHora(horaFecha(fecha)),
      raw: r
    };
    const actual = mapa.get(tarea);
    const actualTime = actual?.fecha?.getTime() || 0;
    const itemTime = item.fecha?.getTime() || 0;
    if (!actual || itemTime > actualTime || (itemTime === actualTime && item.estado === "TERMINADO")) {
      mapa.set(tarea, item);
    }
  });
  return Array.from(mapa.values());
}

function modeloAsignacionPickActivo() {
  return (dataAsignacion || [])
    .map((r, index) => {
      const tareaId = limpiar(campo(r, ["Nro Tarea", "NRO TAREA", "NroTarea", "Tarea", "TAREA"]));
      const estado = normalizar(campo(r, ["Estado", "ESTADO"]));
      const fecha = fechaValor(campo(r, ["Fe Y Hr Modif", "Fe y Hr Modif", "FE Y HR MODIF", "Fecha Modif", "FECHA"]));
      const hora = horaFecha(fecha);
      return {
        index,
        tarea: tareaId,
        estado,
        estadoLabel: estadoPickActivoLabel(estado),
        unidades: num(campo(r, ["Un Asig", "UN ASIG", "Unidades Asig", "Unidades", "UNIDADES"])),
        usuario: limpiar(campo(r, ["Usua Pick", "USUA PICK", "Usuario Pick", "USUARIO PICKING", "USUARIO"])) || "SIN USUARIO",
        fecha,
        fechaTexto: fechaCorta(fecha),
        hora,
        turno: turnoPorHora(hora),
        raw: r
      };
    })
    .filter(r => r.unidades > 0);
}

function resumenPickActivo() {
  const tareas = modeloTareasPickActivo();
  const asignacion = modeloAsignacionPickActivo();
  const tareasTerminadas = tareas.filter(esPickActivoTerminado);
  const tareasPendientes = tareas.filter(t => t.estado === "LISTO" || t.estado.includes("PROCESAM"));
  const unidadesTerminadas = asignacion.filter(esPickActivoTerminado);
  const unidadesPendientes = asignacion.filter(r => r.estado === "ASIGNADOS" || r.estado === "ASIGNADO");
  const totalUnidades = asignacion.reduce((sum, row) => sum + row.unidades, 0);
  const totalTerminadas = unidadesTerminadas.reduce((sum, row) => sum + row.unidades, 0);
  const totalPendientes = unidadesPendientes.reduce((sum, row) => sum + row.unidades, 0);
  const horasUnidades = promedioPickActivoPorHora(unidadesTerminadas, "unidades");
  const horasTareas = promedioPickActivoPorHora(tareasTerminadas, "tareas");
  return {
    tareas,
    asignacion,
    tareasTerminadas,
    tareasPendientes,
    unidadesTerminadas,
    unidadesPendientes,
    totalTareas: tareas.length,
    totalUnidades,
    totalTerminadas,
    totalPendientes,
    avanceTareas: pct(tareasTerminadas.length, tareas.length),
    avanceUnidades: pct(totalTerminadas, totalUnidades),
    horasUnidades,
    horasTareas,
    promedioUnidadesHora: horasUnidades.length ? totalTerminadas / horasUnidades.length : 0
  };
}

function pickActivoGauge(label, value, max, icon, color = "#2563eb") {
  const p = Math.max(0, Math.min(100, pct(value, max)));
  return `
    <article class="pick-active-gauge">
      <div>
        <i class="visual-title-icon">${iconoPicking(icon)}</i>
        <span>${label}</span>
      </div>
      <strong>${p.toFixed(1)}%</strong>
      <small>${fmt(value)} de ${fmt(max)}</small>
      <b><u style="width:${p}%;background:${color}"></u></b>
    </article>
  `;
}

function pickActivoUsuariosCompacto(usuarios, total) {
  const top = usuarios.slice(0, 5);
  const max = Math.max(...top.map(x => x.valor), 1);
  const palette = caseUserPalette();
  return `
    <article class="visual-panel pick-active-user-compact">
      <div class="visual-panel-head">
        <div>
          <h3><i class="visual-title-icon">${iconoPicking("usuarios")}</i>TOP USUARIOS PICK ACTIVO</h3>
          <span>Unidades terminadas y participacion</span>
        </div>
      </div>
      <div class="pick-active-user-compact-grid">
        <div class="pick-active-user-rows">
          ${top.map((x, index) => `
            <article style="--active-color:${palette[index % palette.length]}">
              <b>${index + 1}</b>
              <div>
                <strong>${corto(nombreUsuarioPorDni(x.label), 16)}</strong>
                <small>${fmt(x.valor)} unid. | pico ${x.horaPico} con ${fmt(x.bultosPico)}</small>
              </div>
              <em>${pct(x.valor, total).toFixed(1)}%</em>
              <i><u style="width:${Math.max(2, pct(x.valor, max))}%"></u></i>
            </article>
          `).join("") || `<div class="empty-state">Sin usuarios terminados.</div>`}
        </div>
        ${caseUserDonutVisible(top, total, "Unidades")}
      </div>
    </article>
  `;
}

function promedioPickActivoPorHora(data, tipo) {
  const mapa = new Map();
  data.forEach(r => {
    if (r.hora === null || r.hora === undefined) return;
    const key = String(r.hora).padStart(2, "0");
    if (!mapa.has(key)) mapa.set(key, { label: `${key}:00`, valor: 0, registros: 0 });
    const item = mapa.get(key);
    item.valor += tipo === "tareas" ? 1 : r.unidades;
    item.registros += 1;
  });
  return Array.from(mapa.values())
    .sort((a, b) => Number(a.label.slice(0, 2)) - Number(b.label.slice(0, 2)));
}

function rankingPickActivoUsuarios(data, asignacionTotal) {
  const totalPorUsuario = new Map();
  asignacionTotal.forEach(row => {
    const actual = totalPorUsuario.get(row.usuario) || { total: 0, pendiente: 0 };
    actual.total += row.unidades;
    if (row.estado === "ASIGNADOS" || row.estado === "ASIGNADO") actual.pendiente += row.unidades;
    totalPorUsuario.set(row.usuario, actual);
  });

  return rankingPickingDetalle(data.map(row => ({ ...row, bultos: row.unidades })), r => r.usuario).map(item => {
    const totals = totalPorUsuario.get(item.label) || { total: item.valor, pendiente: 0 };
    return {
      ...item,
      totalAsignado: totals.total,
      pendiente: totals.pendiente,
      cumplimiento: pct(item.valor, totals.total)
    };
  });
}

let paginaShelvyUsuarios = 0;
function cambiarPaginaShelvy(delta) {
  paginaShelvyUsuarios = Math.max(0, paginaShelvyUsuarios + delta);
  renderPickActivo();
}
function verPickActivo() {
  document.getElementById("modulo").innerHTML = '<div id="pickActivoVista"></div>';
  renderPickActivo();
}
function renderPickActivo() {
  const resumen = resumenPickActivo();
  const usuarios = rankingPickActivoUsuarios(resumen.unidadesTerminadas, resumen.asignacion);
  document.getElementById("pickActivoVista").innerHTML = `
    <section class="visual-sheet case-redesign shelvy-report shelvy-units-only">
      <div class="visual-header case">
        <h2>REPORTE SHELVY</h2>
        <div class="visual-kpi-row">
          ${visualKpi("TOTAL DE UNIDADES", fmt(resumen.totalTerminadas), "", "recibido")}
        </div>
      </div>
      <div class="case-summary">
        ${pickActivoGauge("Avance unidades", resumen.totalTerminadas, resumen.totalUnidades, "recibido", "#16365f")}
        ${pickActivoGauge("Pendiente unidades", resumen.totalPendientes, resumen.totalUnidades, "programado", "#16365f")}
      </div>
      <article class="case-trend-main"><h3>TENDENCIA UNIDADES</h3>${tendenciaCaseRecta(resumen.horasUnidades,false,"Unidades terminadas por hora")}</article>
      ${tablaUsuariosCase(usuarios, resumen.horasUnidades, rows => promedioPickActivoPorHora(rows, "unidades"))}
    </section>`;
  const visor=document.getElementById("visorReporte");
  if(visor&&!visor.hidden)prepararContenidoReporte();
}

function pickActivoUserBars(data, total) {
  const max = Math.max(...data.map(x => x.valor), 1);
  const palette = caseUserPalette();
  return `
    <div class="case-user-layout pick-active-user-layout">
      <div class="case-user-bars">
        ${data.slice(0, 8).map((x, index) => `
          <article style="--case-user-color:${palette[index % palette.length]}">
            <div class="case-user-head">
              <span>${index + 1}</span>
              <div>
                <strong>${nombreUsuarioPorDni(x.label)}</strong>
                <small>${fmt(x.valor)} unidades · pico ${x.horaPico} con ${fmt(x.bultosPico)} · ${x.cumplimiento.toFixed(1)}% avance</small>
              </div>
              <b>${pct(x.valor, total).toFixed(1)}%</b>
            </div>
            <i><u style="width:${Math.max(2, pct(x.valor, max))}%"></u></i>
          </article>
        `).join("") || `<div class="empty-state">Sin usuarios terminados.</div>`}
      </div>
      ${caseUserDonutVisible(data, total, "Unidades")}
    </div>
  `;
}

function tablaPickActivo(resumen) {
  const rows = resumen.tareas
    .slice()
    .sort((a, b) => (b.fecha?.getTime() || 0) - (a.fecha?.getTime() || 0))
    .slice(0, 300)
    .map(tarea => {
      const asignadas = resumen.asignacion.filter(a => a.tarea === tarea.tarea);
      const unidades = asignadas.reduce((sum, row) => sum + row.unidades, 0);
      const terminadas = asignadas.filter(esPickActivoTerminado).reduce((sum, row) => sum + row.unidades, 0);
      const usuarios = Array.from(new Set(asignadas.map(row => nombreUsuarioPorDni(row.usuario)).filter(Boolean))).slice(0, 3).join(", ") || "-";
      return `
        <tr>
          <td><strong>${tarea.tarea}</strong></td>
          <td>${tarea.fechaTexto}<small>${tarea.hora !== null && tarea.hora !== undefined ? `${String(tarea.hora).padStart(2, "0")}:00` : ""}</small></td>
          <td><strong>${tarea.estadoLabel}</strong></td>
          <td>${usuarios}</td>
          <td class="number">${fmt(unidades)}</td>
          <td class="number">${fmt(terminadas)}</td>
          <td><strong>${pct(terminadas, unidades).toFixed(1)}%</strong></td>
        </tr>
      `;
    });
  return tabla(["Nro Tarea", "Fecha", "Estado tarea", "Usuarios", "Un asignadas", "Un terminadas", "Avance"], rows, "Sin tareas.");
}

function resumenCase(data) {
  const terminados = data.filter(esCaseTerminado);
  const pendientes = data.filter(r => r.estado === "ASIGNADOS" || r.estado === "ASIGNADO");
  const cancelados = data.filter(r => r.estado === "CANCELADO");
  const bultosTerminados = terminados.reduce((a, b) => a + b.bultos, 0);
  const bultosPendientes = pendientes.reduce((a, b) => a + b.bultos, 0);
  const bultosCancelados = cancelados.reduce((a, b) => a + b.bultos, 0);
  const totalOperativo = bultosTerminados + bultosPendientes;
  return {
    terminados,
    pendientes,
    cancelados,
    bultosTerminados,
    bultosPendientes,
    bultosCancelados,
    totalOperativo,
    avance: pct(bultosTerminados, totalOperativo)
  };
}

function horasCase(data, estado = "") {
  const filtrado = estado === "TERMINADO" ? data.filter(esCaseTerminado) : estado ? data.filter(r => r.estado === estado) : data;
  return promedioPickingPorHora(filtrado);
}

function verCase() {
  document.getElementById("modulo").innerHTML = `
    

    <div id="caseVista"></div>
  `;
  renderCase();
}

let vistaCase = "GENERAL";
let paginaUsuariosCase = 0;

function seleccionarVistaCase(vista) {
  vistaCase = vista === "USUARIOS" ? "USUARIOS" : "GENERAL";
  paginaUsuariosCase = 0;
  renderCase();
}

function cambiarPaginaUsuariosCase(delta) {
  paginaUsuariosCase = Math.max(0, paginaUsuariosCase + delta);
  renderCase();
}

function tendenciaCaseRecta(horas, mini = false, chartLabel = "Bultos CASE terminados por hora") {
  if (!horas.length) return '<div class="empty-state">Sin actividad terminada.</div>';
  const width = Math.max(mini ? 600 : 1100, horas.length * 72);
  const height = mini ? 240 : 300, bottom = height - 42;
  const max = Math.max(1, ...horas.map(h => h.valor));
  const points = horas.map((h, i) => ({
    ...h, x: horas.length === 1 ? width / 2 : 55 + i * (width - 110) / Math.max(1, horas.length - 1),
    y: bottom - h.valor / max * (bottom - 48)
  }));
  const path = points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
  const area = `${path} L ${points.at(-1).x} ${bottom} L ${points[0].x} ${bottom} Z`;
  return `<div class="case-trend-scroll"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="${chartLabel.includes("CASE") ? "xMidYMid meet" : "none"}" style="min-width:${mini ? Math.max(500,horas.length*60) : 1000}px" role="img" aria-label="${chartLabel}">
    ${[0,1,2,3].map(i=>`<line x1="55" x2="${width-55}" y1="${48+i*(bottom-48)/3}" y2="${48+i*(bottom-48)/3}" stroke="#dce3ed"/>`).join("")}
    <path class="case-trend-area" d="${area}" fill="#16365f" opacity=".1"/>
    <path class="case-trend-path" d="${path}" fill="none" stroke="#16365f" stroke-width="3"/>
    ${points.map(p=>`<g><circle cx="${p.x}" cy="${p.y}" r="4" fill="#16365f" stroke="#fff" stroke-width="2"/><text class="case-trend-value" x="${p.x}" y="${p.y-14}" text-anchor="middle">${fmt(p.valor)}</text><text x="${p.x}" y="${height-12}" text-anchor="middle">${p.label}</text></g>`).join("")}
  </svg></div>`;
}

function tablaUsuariosCase(usuarios, horasGenerales, agruparHoras = rows => horasCase(rows, "TERMINADO")) {
  const escape = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const colores = ["#16365f", "#00857d", "#bf5700", "#8c409b", "#c12f52", "#467629"];
  const horas = horasGenerales.map(h => h.label);
  const filas = usuarios.map((u,i) => ({...u, color:colores[i % colores.length], valores:new Map(agruparHoras(u.rows).map(h=>[h.label,h.valor]))}));
  return `<div class="case-hourly-scroll"><table class="case-hourly-table">
    <thead><tr><th>Usuario</th>${horas.map(h=>`<th>${escape(h)}</th>`).join("")}<th>Total</th></tr></thead>
    <tbody>${filas.map(u=>`<tr><th scope="row"><i style="background:${u.color}"></i>${escape(nombreUsuarioPorDni(u.label))}</th>${horas.map(h=>`<td style="color:${u.color}">${u.valores.has(h)?fmt(u.valores.get(h)):"—"}</td>`).join("")}<td class="case-user-sum">${fmt(u.valor)}</td></tr>`).join("")}</tbody>
    <tfoot><tr><th>Total</th>${horas.map(h=>`<td>${fmt(filas.reduce((s,u)=>s+(u.valores.get(h)||0),0))}</td>`).join("")}<td>${fmt(filas.reduce((s,u)=>s+u.valor,0))}</td></tr></tfoot>
  </table></div>`;
}

function renderCase() {
  const data = filtrosCase(modeloCase());
  const resumen = resumenCase(data);
  const usuariosDetalle = rankingPickingDetalle(data.filter(esCaseTerminado), r => r.usuario);
  const horasTerminadas = horasCase(data, "TERMINADO");
  const promedioHora = horasTerminadas.length ? resumen.bultosTerminados / horasTerminadas.length : 0;
  document.getElementById("caseVista").innerHTML = `
    <section class="visual-sheet case-compact case-redesign">
      <div class="visual-header case">
        <div><h2>REPORTE CASE</h2></div>
        <div class="visual-kpi-row">
          ${visualKpi("TOTAL CASE", fmt(resumen.totalOperativo), "", "caja")}
          ${visualKpi("TRABAJADO", fmt(resumen.bultosTerminados), "", "check")}
          ${visualKpi("PENDIENTE", fmt(resumen.bultosPendientes), "", "programado")}
          ${visualKpi("PROM. HORA", fmt(promedioHora), "", "reloj")}
        </div>
      </div>

        <div class="case-summary">
          ${pickActivoGauge("Avance case", resumen.bultosTerminados, resumen.totalOperativo, "check", "#16365f")}
          ${pickActivoGauge("Pendiente case", resumen.bultosPendientes, resumen.totalOperativo, "programado", "#16365f")}
        </div>
        <article class="case-trend-main"><h3>TENDENCIA CASE</h3>${tendenciaCaseRecta(horasTerminadas)}</article>
      ${tablaUsuariosCase(usuariosDetalle, horasTerminadas)}
    </section>`;
  const visor = document.getElementById("visorReporte");
  if (visor && !visor.hidden) prepararContenidoReporte();
}

function caseUserPalette() {
  return ["#2563eb", "#22c55e", "#f59e0b", "#7c3aed", "#0f766e", "#db2777"];
}

function caseUserDonutVisible(data, total, label = "Bultos") {
  const top = data.slice(0, 5);
  const palette = caseUserPalette();
  let cursor = 0;
  const segments = top.map((item, index) => {
    const start = cursor;
    const end = cursor + pct(item.valor, total);
    cursor = end;
    return `${palette[index]} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
  });
  const otros = Math.max(0, total - top.reduce((sum, item) => sum + item.valor, 0));
  if (otros > 0) segments.push(`#cbd5e1 ${cursor.toFixed(2)}% 100%`);
  return `
    <div class="case-user-donut-panel">
      <div class="case-user-donut" style="--segments:${segments.length ? segments.join(", ") : "#e2e8f0 0% 100%"}">
        <strong>${fmt(total)}</strong>
        <span>${label}</span>
      </div>
    </div>
  `;
}

function tablaCase(data) {
  const rows = data
    .slice()
    .sort((a, b) => (b.fecha?.getTime() || 0) - (a.fecha?.getTime() || 0))
    .slice(0, 500)
    .map(r => `
      <tr>
        <td>${r.fechaTexto || ""}</td>
        <td>${r.hora !== null && r.hora !== undefined ? `${String(r.hora).padStart(2, "0")}:00` : ""}</td>
        <td><strong>${r.estadoLabel}</strong></td>
        <td>${nombreUsuarioPorDni(r.usuario)}</td>
        <td>${r.tiendaKey}</td>
        <td>${r.lpn}</td>
        <td><strong>${fmt(r.bultos)}</strong></td>
      </tr>
    `);
  return tabla(["Fecha", "Hora", "Estado", "Usuario", "Tienda", "LPN", "Bultos"], rows, "Sin data CASE.");
}

function exportarCaseCsv() {
  const data = filtrosCase(modeloCase());
  const headers = ["Fecha", "Turno", "Hora", "Estado", "Usuario", "Tienda", "LPN", "Tipo", "Bultos"];
  const rows = data.map(r => [r.fechaTexto, r.turno, r.hora !== null ? `${r.hora}:00` : "", r.estadoLabel, nombreUsuarioPorDni(r.usuario), r.tiendaKey, r.lpn, r.tipo, r.bultos]);
  descargarCsv("case.csv", headers, rows);
}

function agruparSum(data, fn, valueFn) {
  const mapa = new Map();
  data.forEach(r => {
    const key = fn(r) || "SIN DATO";
    if (!mapa.has(key)) mapa.set(key, { label: key, registros: 0, valor: 0 });
    const item = mapa.get(key);
    item.registros += 1;
    item.valor += valueFn(r);
  });
  return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor || b.registros - a.registros);
}

function opcionesFiltro(data, fn) {
  return Array.from(new Set(data.map(fn).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
}

function selectFiltro(id, label, opciones, valor, labelFn = op => op) {
  return `
    <label class="filter-label">${label}
      <select id="${id}" onchange="renderPicking()">
        <option value="">Todos</option>
        ${opciones.map(op => `<option value="${htmlAttr(op)}" ${op === valor ? "selected" : ""}>${htmlAttr(labelFn(op))}</option>`).join("")}
      </select>
    </label>
  `;
}

function filtrosPicking(data) {
  const turno = limpiar(document.getElementById("filtroTurnoPicking")?.value);
  const usuario = limpiar(document.getElementById("filtroUsuarioPicking")?.value);
  const local = limpiar(document.getElementById("filtroLocalPicking")?.value);
  return data.filter(r => {
    if (turno && r.turno !== turno) return false;
    if (usuario && r.usuario !== usuario) return false;
    if (local && r.tiendaKey !== local) return false;
    return true;
  });
}

function lineaHoras(data) {
  const porHora = new Map();
  for (let h = 0; h < 24; h++) porHora.set(h, 0);
  data.forEach(r => {
    if (r.hora !== null && r.hora !== undefined) porHora.set(r.hora, (porHora.get(r.hora) || 0) + r.bultos);
  });
  const puntos = Array.from(porHora.entries()).filter(([, valor]) => valor > 0);
  const max = Math.max(...puntos.map(([, valor]) => valor), 1);
  const coords = puntos.map(([hora, valor], i) => {
    const x = puntos.length === 1 ? 50 : (i / (puntos.length - 1)) * 100;
    const y = 88 - (valor / max) * 76;
    return { hora, valor, x, y };
  });
  const poly = coords.map(p => `${p.x},${p.y}`).join(" ");
  return `
    <div class="line-chart">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <line x1="0" y1="88" x2="100" y2="88"></line>
        <line x1="0" y1="62" x2="100" y2="62"></line>
        <line x1="0" y1="36" x2="100" y2="36"></line>
        <polyline points="${poly}"></polyline>
      </svg>
      <div class="line-axis">
        ${coords.map(p => `<span><b>${p.hora}</b><small>${fmt(p.valor)}</small></span>`).join("")}
      </div>
    </div>
  `;
}

function verPicking() {
  const data = modeloPicking();
  const filtros = {
    turno: limpiar(document.getElementById("filtroTurnoPicking")?.value),
    usuario: limpiar(document.getElementById("filtroUsuarioPicking")?.value),
    local: limpiar(document.getElementById("filtroLocalPicking")?.value)
  };

  document.getElementById("modulo").innerHTML = `
    <section class="hero picking-hero">
      <div>
        <span>Reporte operativo</span>
        <h2>Picking</h2>
      </div>
      <div class="hero-metric">
        <strong id="pickingHeroTotal">0</strong>
        <span>Bultos picking</span>
      </div>
    </section>

    <section class="filter-panel picking-filter-panel">
      ${selectFiltro("filtroTurnoPicking", "Turno", opcionesFiltro(data, r => r.turno), filtros.turno)}
      ${selectFiltro("filtroUsuarioPicking", "Usuario", opcionesFiltro(data, r => r.usuario), filtros.usuario, nombreUsuarioPorDni)}
      ${selectFiltro("filtroLocalPicking", "Local", opcionesFiltro(data, r => r.tiendaKey), filtros.local)}
    </section>

    <div id="pickingVista"></div>
  `;
  renderPicking();
}

function renderPicking() {
  const data = filtrosPicking(modeloPicking());
  const total = data.reduce((a, b) => a + b.bultos, 0);
  const turnos = agruparSum(data, r => r.turno, r => r.bultos);
  const horas = promedioPickingPorHora(data);
  const horaPico = [...horas].sort((a, b) => b.valor - a.valor)[0];
  const promedioPorHora = horas.length ? total / horas.length : 0;
  const usuariosDetalle = rankingPickingDetalle(data, r => r.usuario).slice(0, 12);
  const localesDetalle = rankingPickingDetalle(data, r => r.tiendaKey).slice(0, 8);
  const productosDetalle = rankingPickingDetalle(data, r => `${r.codigo} | ${r.descripcion || "SIN DESCRIPCION"}`).slice(0, 10);
  const hero = document.getElementById("pickingHeroTotal");
  if (hero) hero.textContent = fmt(total);

  document.getElementById("pickingVista").innerHTML = `
    <section class="picking-main-kpis">
      <article class="picking-main-kpi primary">
        <span>Bultos procesados</span>
        <strong>${fmt(total)}</strong>
        <small>${fmt(data.length)} registros filtrados</small>
      </article>
      <article class="picking-main-kpi peak">
        <span>Hora pico</span>
        <strong>${horaPico?.label || "-"}</strong>
        <small>${fmt(horaPico?.valor || 0)} bultos | ${fmt(horaPico?.registros || 0)} registros</small>
      </article>
      <article class="picking-main-kpi average">
        <span>Promedio por hora</span>
        <strong>${fmt(promedioPorHora)}</strong>
        <small>${fmt(horas.length)} horas activas</small>
      </article>
    </section>

    <section class="dashboard-grid picking-dashboard-grid">
      <div class="card wide picking-trend-card">
        <div class="card-title">
          <h2>Tendencia por hora</h2>
          <span>${fmt(data.length)} registros</span>
        </div>
        ${lineaPickingVisible(horas)}
      </div>

      <div class="card wide picking-turn-card">
        <h2>Picking por turno</h2>
        ${turnoPickingVisible(turnos, total)}
      </div>

      <div class="card picking-rank-card">
          <h2>Ranking usuarios</h2>
          ${rankingPickingVisible(usuariosDetalle, total)}
      </div>

      <div class="card picking-rank-card">
        <h2>Tiendas clave</h2>
        ${tilesPickingVisible(localesDetalle, total)}
      </div>

      <div class="card wide picking-products-card">
        <div class="card-title">
          <h2>Top productos con mas demanda</h2>
          <span>Bultos, hora pico y tiempo activo</span>
        </div>
        ${productosPickingVisible(productosDetalle, total)}
      </div>

      <div class="card wide picking-hour-card">
        <div class="card-title">
          <h2>Avance de picking por hora</h2>
          <span>Bultos por hora vs promedio general</span>
        </div>
        ${barrasPromedioHoraVisible(horas)}
      </div>
    </section>
  `;
}

function exportarPickingCsv() {
  const data = filtrosPicking(modeloPicking());
  const headers = ["Fecha", "Turno", "Hora", "Usuario", "LPN", "Orden", "Destino", "Local", "Tipo", "Codigo", "Cod alterno", "Descripcion", "Bultos"];
  const rows = data.map(r => [r.fechaTexto, r.turno, r.hora !== null ? `${r.hora}:00` : "", nombreUsuarioPorDni(r.usuario), r.lpn, r.orden, r.destino, r.local, r.tipo, r.codigo, r.codAlterno, r.descripcion, r.bultos]);
  descargarCsv("picking.csv", headers, rows);
}

function modeloRecepcion() {
  return (dataRecepcion || []).map((r, index) => {
    const asn = limpiar(campo(r, ["NRO ASN", "ASN", "Nro ASN"]));
    const codigoProveedorBase = limpiar(campo(r, ["CODIGO PROVEE", "CODIGO PROVEEDOR", "COD PROVEEDOR"]));
    const codigoProveedor = codigoProveedorBase || "917";
    const nombreBase = limpiar(campo(r, ["NOM PROVEEDOR", "NOMBRE PROVEEDOR", "Proveedor"]));
    const proveedor = nombreBase || (codigoProveedor === "917" ? "PUNTA NEGRA" : "SIN PROVEEDOR");
    const fecha = fechaValor(campo(r, ["Fe Recepcion", "FE RECEPCION", "FECHA RECEPCION", "FECHA"]));
    const horaRaw = campo(r, ["HORA RECEPCION", "HORA", "Hora"]);
    const hora = horaRaw !== "" ? Math.trunc(num(horaRaw)) : horaFecha(fecha);
    return {
      index,
      codigoProveedor,
      proveedor,
      proveedorKey: `${codigoProveedor} | ${proveedor}`,
      oc: limpiar(campo(r, ["NRO OC", "Nro OC", "OC", "ORDEN COMPRA", "Orden Compra"])),
      asn,
      lpn: limpiar(campo(r, ["LPN", "NRO LPN", "PALLET", "NroPallet"])),
      codigo: limpiar(campo(r, ["CODIGO", "PRODUCTO"])),
      codAlterno: limpiar(campo(r, ["COD ALTER", "COD ALTERN", "COD_ALTER"])),
      descripcion: limpiar(campo(r, ["DESCRIPCION", "Descripcion"])),
      programado: num(campo(r, ["BULTOS PROGRAMADOS", "BULTOS PROG", "PROGRAMADO"])),
      recibido: num(campo(r, ["BULTOS RECIBIDOS", "BULTOS REC", "RECIBIDO"])),
      unidadesProgramadas: num(campo(r, ["UND PROGRAMADAS", "UNIDADES PROGRAMADAS", "UND PROG"])),
      unidadesRecibidas: num(campo(r, ["UND RECIBIDAS", "UNIDADES RECIBIDAS", "UND REC"])),
      usuario: limpiar(campo(r, ["USU RECEP", "USUARIO RECEPCION", "USUARIO"])) || "SIN USUARIO",
      fecha,
      fechaTexto: fechaCorta(fecha),
      hora,
      turno: turnoPorHora(hora),
      raw: r
    };
  }).filter(r => !normalizar(r.asn).startsWith("ILE"));
}

function filtroTurnoRecepcion(data) {
  const turno = limpiar(document.getElementById("filtroTurnoRecepcion")?.value);
  return data.filter(r => !turno || r.turno === turno);
}

function palletsRecepcion(data) {
  const mapa = new Map();
  data.forEach(r => {
    const key = r.lpn || `SIN LPN ${r.index}`;
    if (!mapa.has(key)) {
      mapa.set(key, {
        lpn: r.lpn || "SIN LPN",
        codigoProveedor: r.codigoProveedor,
        proveedor: r.proveedor,
        asns: new Set(),
        codigos: new Set(),
        recibido: 0,
        programado: 0
      });
    }
    const item = mapa.get(key);
    if (r.asn) item.asns.add(r.asn);
    if (r.codigo) item.codigos.add(r.codigo);
    item.recibido += r.recibido;
    item.programado += r.programado;
  });
  return Array.from(mapa.values()).map(x => ({
    ...x,
    tipo: x.codigos.size > 1 ? "MULTI" : "MONOPALLET",
    totalCodigos: x.codigos.size,
    totalAsn: x.asns.size
  }));
}

function esPuntaNegraRecepcion(codigo) {
  return normalizar(codigo) === "917";
}

function codigoProveedorResumenRecepcion(row) {
  return normalizar(campo(row, [
    "Proveedor",
    "CODIGO PROVEE",
    "CODIGO PROVEEDOR",
    "COD PROVEEDOR",
    "Codigo Proveedor",
    "CODIGO_PROVEEDOR"
  ]));
}

function bultosResumenProveedorRecepcion(row) {
  const requerido = num(campo(row, ["Un Req", "UN REQ", "UN_REQ", "Unidades Requeridas"]));
  if (requerido > 0) return requerido;
  const bultos = num(campo(row, ["BULTOS", "Bultos", "BULTOS PROGRAMADOS", "PROGRAMADO"]));
  if (bultos > 0) return bultos;
  return num(campo(row, ["Un Env", "UN ENV", "UN_ENV", "Unidades Enviadas"]));
}

function ocResumenProveedorRecepcion(row) {
  return normalizar(campo(row, ["Nro OC", "NRO OC", "OC", "Orden Compra", "ORDEN COMPRA"]));
}

function programadoProveedoresResumenRecepcion(ocsRecepcionPorProveedor) {
  const mapa = new Map();
  (dataRecepcionProveedoresResumen || []).forEach(row => {
    const codigo = codigoProveedorResumenRecepcion(row);
    if (!codigo || esPuntaNegraRecepcion(codigo)) return;
    const oc = ocResumenProveedorRecepcion(row);
    const ocsRecepcion = ocsRecepcionPorProveedor?.get(codigo);
    if (ocsRecepcion?.size && (!oc || !ocsRecepcion.has(oc))) return;
    const bultos = bultosResumenProveedorRecepcion(row);
    if (bultos <= 0) return;
    mapa.set(codigo, (mapa.get(codigo) || 0) + bultos);
  });
  return mapa;
}

function resumenProveedoresRecepcionDesdeData(data) {
  const mapa = new Map();
  const ocsRecepcionPorProveedor = new Map();
  data.forEach(r => {
    const codigoKey = normalizar(r.codigoProveedor);
    const ocKey = normalizar(r.oc);
    if (codigoKey && ocKey) {
      if (!ocsRecepcionPorProveedor.has(codigoKey)) ocsRecepcionPorProveedor.set(codigoKey, new Set());
      ocsRecepcionPorProveedor.get(codigoKey).add(ocKey);
    }
    const key = r.proveedorKey;
    if (!mapa.has(key)) {
      mapa.set(key, {
        codigo: r.codigoProveedor,
        proveedor: r.proveedor,
        programadoReporte: 0,
        recibido: 0,
        recibidoUnidades: 0,
        registros: 0,
        asns: new Set()
      });
    }
    const item = mapa.get(key);
    item.programadoReporte += r.programado;
    item.recibido += r.recibido;
    item.recibidoUnidades += r.unidadesRecibidas;
    item.registros += 1;
    if (r.asn) item.asns.add(r.asn);
  });
  const programadoResumen = programadoProveedoresResumenRecepcion(ocsRecepcionPorProveedor);
  return Array.from(mapa.values()).map(x => {
    const codigo = normalizar(x.codigo);
    const programadoProveedor = programadoResumen.get(codigo) || 0;
    const usaResumenProveedor = !esPuntaNegraRecepcion(codigo) && programadoProveedor > 0;
    const programado = usaResumenProveedor ? programadoProveedor : x.programadoReporte;
    const recibido = usaResumenProveedor ? x.recibidoUnidades : x.recibido;
    return {
      ...x,
      programado,
      recibido,
      programadoProveedor,
      fuenteProgramado: usaResumenProveedor ? "PROVEEDORES RESUMEN" : "REPORTE RECEPCION",
      diferencia: programado - recibido,
      cumplimiento: pctCumplimiento(recibido, programado),
      asnUnicos: x.asns.size
    };
  }).sort((a, b) => b.recibido - a.recibido);
}

function resumenRecepcion(data) {
  const pallets = palletsRecepcion(data);
  const proveedores = resumenProveedoresRecepcionDesdeData(data);
  const totalProgramado = proveedores.reduce((a, b) => a + b.programado, 0);
  const totalRecibido = proveedores.reduce((a, b) => a + b.recibido, 0);
  const asnUnicos = new Set(data.map(r => r.asn).filter(Boolean)).size;
  const pallets917 = pallets.filter(p => p.codigoProveedor === "917");
  const data917 = data.filter(r => r.codigoProveedor === "917");
  const paleterosRecibidos = new Set(
    data
      .map(r => r.asn)
      .filter(asn => asn && normalizar(asn).startsWith("OS917"))
      .map(asn => normalizar(asn))
  ).size;
  return {
    pallets,
    totalProgramado,
    totalRecibido,
    diferencia: totalProgramado - totalRecibido,
    cumplimiento: pctCumplimiento(totalRecibido, totalProgramado),
    asnUnicos,
    palletsTotal: pallets.length,
    mono: pallets.filter(p => p.tipo === "MONOPALLET").length,
    multi: pallets.filter(p => p.tipo === "MULTI").length,
    asn917: new Set(data917.map(r => r.asn).filter(Boolean)).size,
    paleterosRecibidos,
    pallets917: pallets917.length,
    mono917: pallets917.filter(p => p.tipo === "MONOPALLET").length,
    multi917: pallets917.filter(p => p.tipo === "MULTI").length,
    recibido917: data917.reduce((a, b) => a + b.recibido, 0)
  };
}

function ajustesRecepcion() {
  try {
    return JSON.parse(localStorage.getItem("dashboard_bi_recepcion_ajustes") || "{}");
  } catch {
    return {};
  }
}

function valorAjustado(ajustes, key, calculado) {
  const valor = num(ajustes[key]);
  return valor > 0 ? valor : calculado;
}

function resumenRecepcionVisual(resumen) {
  const ajustes = ajustesRecepcion();
  const mono917 = valorAjustado(ajustes, "mono917", resumen.mono917);
  const multi917 = valorAjustado(ajustes, "multi917", resumen.multi917);
  return { ...resumen, mono917, multi917, ajustes };
}

function inputAjusteRecepcion(id, label, valor, calculado) {
  return `
    <label class="manual-field">${label}
      <input id="${id}" type="number" min="0" step="1" value="${valor || ""}" placeholder="${fmt(calculado)}">
    </label>
  `;
}

function panelAjustesRecepcion(resumen) {
  const ajustes = ajustesRecepcion();
  return `
    <section class="manual-panel">
      <div>
        <h2>Ajuste 917 / Punta Negra</h2>
      </div>
      <div class="manual-grid">
        ${inputAjusteRecepcion("ajMono917", "917 monopallet", ajustes.mono917, resumen.mono917)}
        ${inputAjusteRecepcion("ajMulti917", "917 multi", ajustes.multi917, resumen.multi917)}
      </div>
      <div class="manual-actions">
        <button onclick="guardarAjustesRecepcion()">Aplicar</button>
        <button class="ghost" onclick="limpiarAjustesRecepcion()">Usar calculado</button>
      </div>
    </section>
  `;
}

function guardarAjustesRecepcion() {
  const ajustes = {
    mono917: limpiar(document.getElementById("ajMono917")?.value),
    multi917: limpiar(document.getElementById("ajMulti917")?.value)
  };
  localStorage.setItem("dashboard_bi_recepcion_ajustes", JSON.stringify(ajustes));
  verRecepcion();
}

function limpiarAjustesRecepcion() {
  localStorage.removeItem("dashboard_bi_recepcion_ajustes");
  verRecepcion();
}

function resumenProveedoresRecepcion(data) {
  return resumenProveedoresRecepcionDesdeData(data);
}

function tablaProveedoresRecepcion(proveedores, totalRecibido) {
  const max = Math.max(...proveedores.map(x => x.recibido), 1);
  return `
    <div class="provider-summary">
      ${proveedores.map(p => `
        <article class="provider-row">
          <div>
            <strong>${p.codigo} | ${p.proveedor}</strong>
            <span>${fmt(p.asnUnicos)} ASN | ${fmt(p.registros)} registros</span>
          </div>
          <div class="provider-values">
            <b>${fmt(p.recibido)}</b>
            <span>Recibido</span>
          </div>
          <div class="provider-values">
            <b>${fmt(p.programado)}</b>
            <span>Programado</span>
          </div>
          <div class="provider-values ${p.diferencia ? "warn-text" : ""}">
            <b>${fmt(p.diferencia)}</b>
            <span>Diferencia</span>
          </div>
          <div class="provider-progress">
            <div><i style="width:${pct(p.recibido, max)}%"></i></div>
            <span>${p.cumplimiento.toFixed(1)}% cump. | ${pct(p.recibido, totalRecibido).toFixed(1)}% part.</span>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function verRecepcion() {
  const dataBase = modeloRecepcion();
  const turnoSeleccionado = limpiar(document.getElementById("filtroTurnoRecepcion")?.value);
  const data = filtroTurnoRecepcion(dataBase);
  const resumenCalculado = resumenRecepcion(data);
  const resumen = resumenRecepcionVisual(resumenCalculado);
  const proveedoresDetalle = resumenProveedoresRecepcion(data);
  const proveedores = proveedoresDetalle.map(p => ({ label: `${p.codigo} | ${p.proveedor}`, valor: p.recibido, registros: p.registros }));
  const usuarios = agruparSum(data, r => r.usuario, r => r.recibido);
  const tipoPallets917 = [
    { label: "917 MONOPALLET", valor: resumen.mono917, registros: resumen.mono917 },
    { label: "917 MULTI", valor: resumen.multi917, registros: resumen.multi917 }
  ];

  document.getElementById("modulo").innerHTML = `
    <section class="hero recepcion-hero">
      <div>
        <span>Reporte operativo</span>
        <h2>Recepcion</h2>
      </div>
      <div class="hero-metric">
        <strong>${fmt(resumen.totalRecibido)}</strong>
        <span>Bultos recibidos</span>
      </div>
    </section>

    <section class="kpi-grid">
      ${kpi("Total recibido", fmt(resumen.totalRecibido), "General", "accent")}
      ${kpi("Total programado", fmt(resumen.totalProgramado), "General")}
      ${kpi("Diferencia", fmt(resumen.diferencia), "Programado - recibido", resumen.diferencia ? "warn" : "")}
      ${kpi("Cumplimiento", `${resumen.cumplimiento.toFixed(1)}%`, "General")}
      ${kpi("ASN 917", fmt(resumen.asn917), "PUNTA NEGRA")}
      ${kpi("Paleteros 917", fmt(resumen.pallets917), "Calculado por LPN")}
      ${kpi("917 mono", fmt(resumen.mono917), "PUNTA NEGRA")}
      ${kpi("917 multi", fmt(resumen.multi917), "PUNTA NEGRA", "warn")}
    </section>

    ${panelAjustesRecepcion(resumenCalculado)}

    <section class="filter-panel recepcion-filter-panel">
      <label class="filter-label">Turno
        <select id="filtroTurnoRecepcion" onchange="verRecepcion()">
          <option value="">Todos los turnos</option>
          ${opcionesFiltro(dataBase, r => r.turno).map(op => `<option value="${op}" ${op === turnoSeleccionado ? "selected" : ""}>${op}</option>`).join("")}
        </select>
      </label>
    </section>

    <section class="dashboard-grid">
      <div class="card wide visual-suite recepcion-visual-suite">
        <div class="card-title">
          <h2>Vista grafica Recepcion</h2>
          <span>${turnoSeleccionado || "General"} y proveedor 917</span>
        </div>
        <div class="visual-combo">
          <div class="visual-box">
            <h3>Bultos por proveedor</h3>
            ${pieChart(proveedores, resumen.totalRecibido, fmt(resumen.totalRecibido))}
          </div>
          <div class="visual-box">
            <h3>Cumplimiento general</h3>
            ${pieChart([
              { label: "Recibido", valor: resumen.totalRecibido, registros: data.length },
              { label: "Pendiente", valor: Math.max(0, resumen.diferencia), registros: 0 }
            ], Math.max(resumen.totalProgramado, resumen.totalRecibido), `${resumen.cumplimiento.toFixed(1)}%`)}
          </div>
          <div class="visual-box">
            <h3>917 mono/multi</h3>
            ${pieChart(tipoPallets917, resumen.pallets917, fmt(resumen.pallets917))}
          </div>
        </div>
      </div>

      <div class="card wide">
        <div class="card-title">
          <h2>Resumen visual por proveedor</h2>
          <span>Programado, recibido, diferencia y cumplimiento</span>
        </div>
        ${tablaProveedoresRecepcion(proveedoresDetalle, resumen.totalRecibido)}
      </div>

      <div class="card">
        <h2>Usuarios recepcion</h2>
        ${barras(usuarios.slice(0, 8), resumen.totalRecibido)}
      </div>
    </section>
  `;
}

function verRecepcionRanking() {
  const data = modeloRecepcion();
  const resumen = resumenRecepcion(data);
  const proveedores = agruparSum(data, r => r.proveedorKey, r => r.recibido);
  const usuarios = agruparSum(data, r => r.usuario, r => r.recibido);
  const productos = agruparSum(data, r => `${r.codigo} | ${r.descripcion || "SIN DESCRIPCION"}`, r => r.recibido);
  const pallets = resumen.pallets
    .sort((a, b) => b.recibido - a.recibido)
    .slice(0, 10)
    .map(p => ({ label: `${p.lpn} | ${p.tipo}`, valor: p.recibido, registros: p.totalCodigos }));

  document.getElementById("modulo").innerHTML = `
    <section class="hero recepcion-hero">
      <div>
        <span>Ranking operativo</span>
        <h2>Recepcion</h2>
      </div>
      <div class="hero-metric">
        <strong>${fmt(resumen.totalRecibido)}</strong>
        <span>Bultos recibidos</span>
      </div>
    </section>

    <section class="dashboard-grid">
      <div class="card">
        <h2>Ranking proveedores</h2>
        ${barras(proveedores.slice(0, 10), resumen.totalRecibido)}
      </div>
      <div class="card">
        <h2>Ranking usuarios</h2>
        ${barras(usuarios.slice(0, 10), resumen.totalRecibido)}
      </div>
      <div class="card wide">
        <div class="card-title">
          <h2>Productos recibidos con mas volumen</h2>
          <span>Top 10 por bultos</span>
        </div>
        ${barrasHorizontales(productos.slice(0, 10), resumen.totalRecibido)}
      </div>
      <div class="card wide">
        <div class="card-title">
          <h2>Pallets con mayor volumen</h2>
          <span>Incluye tipo mono/multi</span>
        </div>
        ${barrasHorizontales(pallets, resumen.totalRecibido)}
      </div>
    </section>
  `;
}

function turnoDespachoPorHora(hora) {
  if (hora === null || hora === undefined) return "SIN TURNO";
  if (hora >= 7 && hora < 19) return "DIA";
  if (hora >= 21 || hora < 7) return "NOCHE";
  return "SIN TURNO";
}

function codigoKey(valor) {
  return normalizar(valor).replace(/\s+/g, "").replace(/\.0+$/, "");
}

function catalogoProductosDespacho() {
  const mapa = new Map();
  (dataProductos || []).forEach(row => {
    const codigos = [
      campo(row, ["Cod Barra", "Cod. Barra", "CodBarra", "COD BARRA", "COD. BARRA", "Codigo", "CODIGO", "Codigo Producto", "CODIGO PRODUCTO"]),
      campo(row, ["CODIGO_ALT", "COD_ALT", "CODIGO ALTERNATIVO", "Cod Alternat", "Cod Altern", "COD ALTERN"])
    ].map(codigoKey).filter(Boolean);
    if (!codigos.length) return;
    const producto = {
      codigo: codigos[0],
      descripcion: limpiar(campo(row, ["Descripcion", "DESCRIPCION", "Descrip Artic", "Descrip ArtÃ­c", "Producto", "PRODUCTO"])),
      undCaja: num(campo(row, ["Std Case Qty", "STD CASE QTY", "StdCaseQty", "STDCASEQTY", "Und x Caja", "UND X CAJA", "Und Caja", "UxC", "UNIDADES CAJA"])),
      costoUnidad: num(campo(row, ["Costo Unidad", "Costo unidad", "Costo Unitario", "Costo", "Precio", "PRECIO"])),
      jerarquia: limpiar(campo(row, ["Jerarq1", "JERARQ1", "Jerarquia", "JERARQUIA", "Familia", "FAMILIA"])) || "SIN JERARQUIA"
    };
    codigos.forEach(codigo => {
      if (!mapa.has(codigo)) mapa.set(codigo, producto);
    });
  });
  return mapa;
}

function capacidadCamion(paletas) {
  const valor = num(paletas);
  if (valor <= 0) return 0;
  if (valor <= 5) return 6;
  return [6, 8, 10, 12].reduce((mejor, actual) => {
    const diffActual = Math.abs(valor - actual);
    const diffMejor = Math.abs(valor - mejor);
    return diffActual < diffMejor || (diffActual === diffMejor && actual > mejor) ? actual : mejor;
  }, 6);
}

function cargasDespachoMap() {
  const mapa = new Map();
  (dataCarga || []).forEach(row => {
    const carga = limpiar(campo(row, ["Nro Carga", "NRO CARGA", "Carga", "CARGA", "Nro Ola", "OLA"]));
    const key = normalizar(carga);
    if (!key || mapa.has(key)) return;
    const fecha = fechaValor(campo(row, ["Fe Y Hr Modif", "Fe y Hr Modif", "FE Y HR MODIF", "Fecha de Envio", "Fecha Envio", "FECHA ENVIO", "Fecha"]));
    const paletas = num(campo(row, ["No-LPN Paletas", "NO-LPN PALETAS", "No LPN Paletas", "Nro Paletas", "Paletas", "PALETAS"]));
    mapa.set(key, {
      carga,
      fecha,
      hora: horaFecha(fecha),
      placa: limpiar(campo(row, ["Nro Camión", "Nro Camion", "Nro CamiÃ³n", "NRO CAMION", "NRO CAMIÓN", "Placa", "PLACA"])),
      paradas: num(campo(row, ["Paradas", "PARADAS", "Nro Paradas", "NRO PARADAS"])),
      paletasDeclaradas: paletas,
      capacidad: capacidadCamion(paletas),
      raw: row
    });
  });
  return mapa;
}

let turnoDespachoReporte = "TODOS";

function seleccionarTurnoDespacho(turno, vista = "principal") {
  turnoDespachoReporte = turno;
  if (vista === "compacto") verDespachoCompacto();
  else verDespacho();
}

function cargasDespachoLista(turno = "TODOS") {
  const cargas = Array.from(cargasDespachoMap().values());
  return turno === "TODOS" ? cargas : cargas.filter(carga => turnoDespachoPorHora(carga.hora) === turno);
}

function filtrarDespachoPorTurno(data, turno = turnoDespachoReporte) {
  return turno === "TODOS" ? data : data.filter(row => row.turno === turno);
}

function viajesDespachoPorHora(turno = "TODOS") {
  const mapa = new Map();
  cargasDespachoLista(turno).forEach(carga => {
    if (carga.hora === null || carga.hora === undefined) return;
    const key = String(carga.hora).padStart(2, "0");
    if (!mapa.has(key)) mapa.set(key, { label: `${key}:00`, valor: 0, registros: 0 });
    const item = mapa.get(key);
    item.valor += 1;
    item.registros += 1;
  });
  return Array.from(mapa.values())
    .sort((a, b) => Number(a.label.slice(0, 2)) - Number(b.label.slice(0, 2)));
}

function modeloDespacho() {
  const cargas = cargasDespachoMap();
  const productos = catalogoProductosDespacho();
  return (dataCartones || []).map((r, index) => {
    const carga = limpiar(campo(r, ["Nro Carga", "NRO CARGA", "Carga", "CARGA", "Nro Ola", "OLA"]));
    const cargaInfo = cargas.get(normalizar(carga));
    const fecha = cargaInfo?.fecha || fechaValor(campo(r, ["Fe Y Hr Modif", "Fe y Hr Modif", "FE Y HR MODIF", "Fecha", "FECHA"]));
    const hora = horaFecha(fecha);
    const destino = limpiar(campo(r, ["Destino", "DESTINO", "Cod Destino", "COD DESTINO", "Tienda", "TIENDA"]));
    const local = limpiar(campo(r, ["Nombre Destino", "NOMBRE DESTINO", "LOCAL", "TIENDA"])) || "SIN DESTINO";
    const productoCodigo = codigoKey(campo(r, ["Cod Barra", "Cod. Barra", "CodBarra", "COD BARRA", "COD. BARRA", "Codigo", "CODIGO", "Codigo Producto", "CODIGO PRODUCTO", "Producto", "PRODUCTO"]));
    const producto = productos.get(productoCodigo);
    const unidades = num(campo(r, ["UnAct", "UNACT", "Un Act", "UN ACT", "Unidades", "UNIDADES", "Un Rcb", "UN RCB"]));
    const undCaja = producto?.undCaja || num(campo(r, ["Std Case Qty", "STD CASE QTY", "StdCaseQty", "STDCASEQTY", "Und x Caja", "UND X CAJA", "Und Caja", "UxC"]));
    const bultos = undCaja > 0 ? unidades / undCaja : 0;
    const costoUnidad = producto?.costoUnidad || 0;
    return {
      index,
      sucursal: limpiar(campo(r, ["Sucursal", "CENTRO DISTRIBUCION", "CD"])),
      pallet: limpiar(campo(r, ["Nro Pallet", "NroPallet", "NRO PALLET", "PALLET", "Pallet"])),
      lpn: limpiar(campo(r, ["Nro LPNs", "Nro LPN", "NRO LPNS", "LPN"])),
      estado: limpiar(campo(r, ["Estado LPN", "ESTADO LPN"])) || "SIN ESTADO",
      producto: productoCodigo,
      descripcion: producto?.descripcion || limpiar(campo(r, ["Descripcion", "DESCRIPCION", "Descrip Artic", "Descrip ArtÃ­c"])),
      unidades,
      undCaja,
      bultos,
      costoUnidad,
      costo: unidades * costoUnidad,
      carga,
      destino,
      local,
      destinoKey: destino ? `${destino} | ${local}` : local,
      fecha,
      fechaTexto: fechaCorta(fecha),
      hora,
      turno: turnoDespachoPorHora(hora),
      placa: cargaInfo?.placa || "",
      paradas: cargaInfo?.paradas || 0,
      paletasDeclaradas: cargaInfo?.paletasDeclaradas || 0,
      capacidadCamion: cargaInfo?.capacidad || 0,
      jerarquia: producto?.jerarquia || limpiar(campo(r, ["Jerarq1", "JERARQ1", "JERARQUIA"])) || "SIN JERARQUIA",
      tipoDistribucion: limpiar(campo(r, ["Tipo Distribucion", "TIPO DISTRIBUCION"])),
      orden: limpiar(campo(r, ["Nro Orden", "NRO ORDEN"]))
    };
  }).filter(r => r.pallet && r.carga && (r.bultos > 0 || r.unidades > 0));
}

function palletsDespacho(data) {
  const mapa = new Map();
  data.forEach(r => {
    if (!r.pallet) return;
    const key = `${normalizar(r.carga)}|${normalizar(r.pallet)}`;
    if (!mapa.has(key)) {
      mapa.set(key, { pallet: r.pallet, bultos: 0, unidades: 0, costo: 0, productos: new Set(), destinos: new Set(), cargas: new Set(), turno: r.turno, placa: r.placa });
    }
    const item = mapa.get(key);
    item.bultos += r.bultos;
    item.unidades += r.unidades || 0;
    item.costo += r.costo || 0;
    if (r.producto) item.productos.add(r.producto);
    if (r.destinoKey) item.destinos.add(r.destinoKey);
    if (r.carga) item.cargas.add(r.carga);
  });
  return Array.from(mapa.values()).map(p => ({
    ...p,
    tipo: p.productos.size > 1 ? "MULTISKU" : "MONOPALLET",
    totalProductos: p.productos.size,
    totalDestinos: p.destinos.size
  }));
}

function resumenDespacho(data, turnoFiltro = "TODOS") {
  const cargasBase = cargasDespachoLista(turnoFiltro);
  const pallets = palletsDespacho(data);
  const totalBultos = data.reduce((a, b) => a + b.bultos, 0);
  const totalUnidades = data.reduce((a, b) => a + (b.unidades || 0), 0);
  const costoTotal = data.reduce((a, b) => a + (b.costo || 0), 0);
  const cargas = cargasBase.length || new Set(data.map(r => r.carga).filter(Boolean)).size;
  const tiendas = new Set(data.map(r => r.destino).filter(Boolean)).size;
  const placas = new Set(cargasBase.map(r => r.placa).filter(Boolean)).size || new Set(data.map(r => r.placa).filter(Boolean)).size;
  const paradas = cargasBase.reduce((a, b) => a + (b.paradas || 0), 0) || data.reduce((a, b) => a + (b.paradas || 0), 0);
  const capacidadTotal = cargasBase.reduce((a, b) => a + (b.capacidad || 0), 0);
  const ocupacion = pct(cargasBase.reduce((a, b) => a + (b.paletasDeclaradas || 0), 0), capacidadTotal);
  const turnos = agruparSum(data, r => r.turno, r => r.bultos);
  const porTurno = {};
  ["DIA", "NOCHE"].forEach(turno => {
    const rows = data.filter(r => r.turno === turno);
    const palletsTurno = palletsDespacho(rows);
    const cargasTurno = cargasBase.filter(c => turnoDespachoPorHora(c.hora) === turno);
    const capacidadTurno = cargasTurno.reduce((a, b) => a + (b.capacidad || 0), 0);
    porTurno[turno] = {
      bultos: rows.reduce((a, b) => a + b.bultos, 0),
      unidades: rows.reduce((a, b) => a + (b.unidades || 0), 0),
      costo: rows.reduce((a, b) => a + (b.costo || 0), 0),
      pallets: palletsTurno.length,
      viajes: cargasTurno.length || new Set(rows.map(r => r.carga).filter(Boolean)).size,
      placas: new Set(cargasTurno.map(r => r.placa).filter(Boolean)).size || new Set(rows.map(r => r.placa).filter(Boolean)).size,
      paradas: cargasTurno.reduce((a, b) => a + (b.paradas || 0), 0),
      capacidad: capacidadTurno,
      ocupacion: pct(cargasTurno.reduce((a, b) => a + (b.paletasDeclaradas || 0), 0), capacidadTurno),
      bultosPallet: rows.reduce((a, b) => a + b.bultos, 0) / Math.max(palletsTurno.length, 1)
    };
  });
  return {
    pallets,
    totalBultos,
    totalUnidades,
    costoTotal,
    palletsTotal: pallets.length,
    viajes: cargas,
    tiendas,
    placas,
    paradas,
    capacidadTotal,
    ocupacion,
    bultosPallet: totalBultos / Math.max(pallets.length, 1),
    mono: pallets.filter(p => p.tipo === "MONOPALLET").length,
    multi: pallets.filter(p => p.tipo === "MULTISKU").length,
    turnos,
    porTurno
  };
}

function turnoDespachoCards(resumen) {
  return `
    <div class="shift-grid">
      ${["DIA", "NOCHE"].map(turno => {
        const x = resumen.porTurno[turno];
        return `
          <article class="shift-card">
            <span>${turno}</span>
            <strong>${fmt(x.bultos)}</strong>
            <div class="shift-metrics">
              <b>${fmt(x.pallets)}<small>Pallets</small></b>
              <b>${fmt(x.viajes)}<small>Viajes</small></b>
              <b>S/ ${fmt(x.costo)}<small>Costo</small></b>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function verDespacho() {
  const dataGeneral = modeloDespacho();
  const data = filtrarDespachoPorTurno(dataGeneral);
  const resumen = resumenDespacho(data, turnoDespachoReporte);
  const viajesHora = viajesDespachoPorHora(turnoDespachoReporte);
  const horaPico = viajesHora.slice().sort((a, b) => b.valor - a.valor)[0];

  document.getElementById("modulo").innerHTML = `
    <section class="hero despacho-hero">
      <div>
        <span>Reporte operativo</span>
        <h2>Despacho</h2>
      </div>
      <div class="hero-metric">
        <strong>S/ ${fmt(resumen.costoTotal)}</strong>
        <span>Costo despachado</span>
      </div>
    </section>

    <section class="kpi-grid">
      ${kpi("Viajes", fmt(resumen.viajes), "Nro Carga sin duplicar", "accent")}
      ${kpi("Pallets", fmt(resumen.palletsTotal), "Nro Pallet sin duplicar")}
      ${kpi("Tiendas", fmt(resumen.tiendas), "Destinos despachados")}
      ${kpi("Costo total", `S/ ${fmt(resumen.costoTotal)}`, "UnAct x Costo Unidad")}
      ${kpi("Bultos x pallet", fmt(resumen.bultosPallet))}
      ${kpi("Unidades", fmt(resumen.totalUnidades), "UnAct total", "warn")}
    </section>

    <div class="picking-turn-control despacho-turn-control">
      <div class="picking-turn-buttons">
        ${["TODOS", "DIA", "NOCHE"].map(turno => `
          <button class="${turnoDespachoReporte === turno ? "active" : ""}" onclick="seleccionarTurnoDespacho('${turno}')">${turno}</button>
        `).join("")}
      </div>
      <div class="picking-turn-highlights">
        <div><span>Turno evaluado</span><strong>${turnoDespachoReporte}</strong></div>
        <div><span>Hora pico viajes</span><strong>${horaPico?.label || "-"}</strong><small>${fmt(horaPico?.valor || 0)} viajes</small></div>
        <div><span>Placas</span><strong>${fmt(resumen.placas)}</strong><small>${fmt(resumen.paradas)} paradas</small></div>
        <div><span>Unidades</span><strong>${fmt(resumen.totalUnidades)}</strong><small>${fmt(resumen.totalBultos)} bultos</small></div>
      </div>
    </div>

    <section class="dashboard-grid">
      <div class="card wide picking-trend-card">
        <div class="card-title">
          <h2>Tendencia viajes despachados</h2>
          <span>Por hora desde CARGA.Fe Y Hr Modif</span>
        </div>
        ${lineaPickingVisible(viajesHora)}
      </div>
    </section>

    ${turnoDespachoCards(resumen)}
  `;
}

function verDespachoRanking() {
  const data = modeloDespacho();
  const resumen = resumenDespacho(data);
  const destinos = agruparSum(data, r => r.destinoKey, r => r.bultos);
  const jerarquias = agruparSum(data, r => r.jerarquia, r => r.bultos);
  const cargas = agruparSum(data, r => r.carga || "SIN CARGA", r => r.bultos);
  const pallets = resumen.pallets
    .sort((a, b) => b.bultos - a.bultos)
    .slice(0, 10)
    .map(p => ({ label: `${p.pallet} | ${p.tipo}`, valor: p.bultos, registros: p.totalProductos }));

  document.getElementById("modulo").innerHTML = `
    <section class="hero despacho-hero">
      <div>
        <span>Ranking operativo</span>
        <h2>Despacho</h2>
      </div>
      <div class="hero-metric">
        <strong>${fmt(resumen.totalBultos)}</strong>
        <span>Bultos despachados</span>
      </div>
    </section>

    <section class="dashboard-grid">
      <div class="card">
        <h2>Ranking destinos</h2>
        ${barras(destinos.slice(0, 12), resumen.totalBultos)}
      </div>
      <div class="card">
        <h2>Ranking jerarquias</h2>
        ${barras(jerarquias.slice(0, 12), resumen.totalBultos)}
      </div>
      <div class="card wide">
        <div class="card-title">
          <h2>Cargas con mayor volumen</h2>
          <span>Top por bultos</span>
        </div>
        ${barrasHorizontales(cargas.slice(0, 10), resumen.totalBultos)}
      </div>
      <div class="card wide">
        <div class="card-title">
          <h2>Pallets con mayor volumen</h2>
          <span>Incluye mono/multisku</span>
        </div>
        ${barrasHorizontales(pallets, resumen.totalBultos)}
      </div>
    </section>
  `;
}

function descargarCsv(nombre, headers, rows) {
  const clean = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.map(clean).join(";"), ...rows.map(row => row.map(clean).join(";"))].join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}

function miniBar(label, valor, total) {
  return `
    <div class="exec-mini-bar">
      <span>${label}</span>
      <div><i style="width:${Math.min(100, pct(valor, total))}%"></i></div>
      <b>${fmt(valor)}</b>
    </div>
  `;
}

function executiveMetric(label, value, note = "") {
  return `
    <article class="exec-metric">
      <span>${label}</span>
      <strong>${value}</strong>
      ${note ? `<small>${note}</small>` : ""}
    </article>
  `;
}

let proveedoresRecepcionEjecutivoSeleccionados = null;

function proveedoresRecepcionEjecutivoVisibles(proveedores) {
  if (proveedoresRecepcionEjecutivoSeleccionados === null) return proveedores;
  return proveedores.filter(p => proveedoresRecepcionEjecutivoSeleccionados.has(`${p.codigo} | ${p.proveedor}`));
}

function alternarProveedorRecepcionEjecutivo(valorCodificado, seleccionado) {
  const proveedorKey = decodeURIComponent(valorCodificado);
  if (proveedoresRecepcionEjecutivoSeleccionados === null) {
    proveedoresRecepcionEjecutivoSeleccionados = new Set(
      resumenProveedoresRecepcion(modeloRecepcion()).map(p => `${p.codigo} | ${p.proveedor}`)
    );
  }
  if (seleccionado) proveedoresRecepcionEjecutivoSeleccionados.add(proveedorKey);
  else proveedoresRecepcionEjecutivoSeleccionados.delete(proveedorKey);
}

function seleccionarProveedoresRecepcionEjecutivo(modo) {
  proveedoresRecepcionEjecutivoSeleccionados = modo === "todos" ? null : new Set();
  verResumenEjecutivo();
}

function filtroProveedoresRecepcionEjecutivo(proveedores) {
  return `
    <div class="executive-provider-filter">
      <details class="provider-filter">
        <summary>Escoger proveedores</summary>
        <div class="provider-filter-menu">
          <div class="provider-filter-actions">
            <button type="button" onclick="verResumenEjecutivo()">Aplicar seleccion</button>
            <button type="button" onclick="seleccionarProveedoresRecepcionEjecutivo('todos')">Todos</button>
            <button type="button" class="ghost" onclick="seleccionarProveedoresRecepcionEjecutivo('ninguno')">Ninguno</button>
          </div>
          <div class="provider-filter-options">
            ${proveedores.map(p => {
              const key = `${p.codigo} | ${p.proveedor}`;
              const checked = proveedoresRecepcionEjecutivoSeleccionados === null || proveedoresRecepcionEjecutivoSeleccionados.has(key);
              return `
                <label>
                  <input type="checkbox" value="${encodeURIComponent(key)}" ${checked ? "checked" : ""}
                    onchange="alternarProveedorRecepcionEjecutivo(this.value, this.checked)">
                  <span>${key}</span>
                </label>
              `;
            }).join("")}
          </div>
        </div>
      </details>
    </div>
  `;
}

function pickingEjecutivoPanel(turnos, total) {
  const valorTurno = turno => turnos.find(x => x.label === turno)?.valor || 0;
  return `
    <div class="executive-picking-summary">
      <div class="executive-total-card">
        <span>Total picking</span>
        <strong>${fmt(total)}</strong>
      </div>
      <div class="executive-summary-cards">
        ${executiveMetric("DIA", fmt(valorTurno("DIA")))}
        ${executiveMetric("TARDE", fmt(valorTurno("TARDE")))}
        ${executiveMetric("NOCHE", fmt(valorTurno("NOCHE")))}
      </div>
    </div>
  `;
}

function despachoEjecutivoPanel(resumen) {
  return `
    <div class="executive-dispatch-totals">
      ${executiveMetric("PALLETS", fmt(resumen.palletsTotal))}
      ${executiveMetric("VIAJES", fmt(resumen.viajes))}
      ${executiveMetric("BULTOS / PALLET", fmt(resumen.bultosPallet))}
      ${executiveMetric("COSTO TOTAL", `S/ ${fmt(resumen.costoTotal)}`)}
    </div>
    ${despachoTurnoPanel(resumen)}
  `;
}

function verResumenEjecutivo() {
  const picking = modeloPicking();
  const recepcion = modeloRecepcion();
  const despacho = modeloDespacho();
  const pedido = pedidoEjecutivoAnterior();

  const totalPicking = picking.reduce((a, b) => a + b.bultos, 0);
  const pickTurnos = agruparSum(picking, r => r.turno, r => r.bultos);

  const recepProveedores = resumenProveedoresRecepcion(recepcion);
  const recepProveedoresVisibles = proveedoresRecepcionEjecutivoVisibles(recepProveedores);
  const clavesRecepcionVisibles = new Set(recepProveedoresVisibles.map(p => `${p.codigo} | ${p.proveedor}`));
  const recepcionVisible = recepcion.filter(r => clavesRecepcionVisibles.has(r.proveedorKey));
  const resRecep = resumenRecepcion(recepcionVisible);

  const resDesp = resumenDespacho(despacho, "TODOS");

  document.getElementById("modulo").innerHTML = `
    <section class="visual-sheet executive-main">
      <div class="executive-title-only"><h2>SPSA CD MASS TRUJILLO - 962</h2></div>

      <div class="executive-visual-grid">
        <article class="visual-panel executive-column executive-order">
          <div class="visual-panel-head"><h3>PEDIDO</h3></div>
          ${pedidoEjecutivoPanel(pedido)}
        </article>

        <article class="visual-panel executive-column executive-picking">
          <div class="visual-panel-head">
            <h3>PICKING</h3>
          </div>
          ${pickingEjecutivoPanel(pickTurnos, totalPicking)}
        </article>

        <article class="visual-panel executive-column executive-reception">
          <div class="visual-panel-head">
            <h3>RECEPCION</h3>
          </div>
          ${filtroProveedoresRecepcionEjecutivo(recepProveedores)}
          <div class="executive-provider-list">
            ${recepProveedoresVisibles.map(p => `<div class="executive-provider-simple"><span>${p.proveedor}</span><strong>${fmt(p.recibido)}</strong></div>`).join("") || `<div class="executive-empty">Sin proveedores visibles.</div>`}
          </div>
        </article>

        <article class="visual-panel executive-column executive-dispatch">
          <div class="visual-panel-head">
            <h3>DESPACHO</h3>
          </div>
          ${despachoEjecutivoPanel(resDesp)}
        </article>
      </div>
    </section>
  `;
}

function keyFecha(fecha) {
  if (!fecha) return "";
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fechaDesdeKey(key) {
  const partes = limpiar(key).split("-").map(Number);
  if (partes.length !== 3 || partes.some(n => !Number.isFinite(n))) return null;
  return new Date(partes[0], partes[1] - 1, partes[2]);
}

function diaNombre(fecha) {
  return fecha ? fecha.toLocaleDateString("es-PE", { weekday: "long" }) : "";
}

function asistenciaDefault() {
  const hoy = new Date();
  const lunes = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const offset = (lunes.getDay() + 6) % 7;
  lunes.setDate(lunes.getDate() - offset);
  return Array.from({ length: 6 }, (_, i) => {
    const fecha = new Date(lunes);
    fecha.setDate(lunes.getDate() + i);
    return { fecha: keyFecha(fecha), asistencia: "" };
  });
}

function asistenciaGeneral() {
  try {
    const guardado = JSON.parse(localStorage.getItem("dashboard_bi_asistencia_general") || "[]");
    if (Array.isArray(guardado) && guardado.length) return guardado.slice(0, 6);
  } catch {
    return asistenciaDefault();
  }
  return asistenciaDefault();
}

function guardarAsistenciaGeneral(actualizarTabla = false) {
  const rows = Array.from(document.querySelectorAll("[data-asistencia-row]")).map((row, index) => ({
    fecha: limpiar(document.getElementById(`asistenciaFecha${index}`)?.value),
    asistencia: limpiar(document.getElementById(`asistenciaValor${index}`)?.value)
  }));
  localStorage.setItem("dashboard_bi_asistencia_general", JSON.stringify(rows));
  if (actualizarTabla) {
    const tabla = document.getElementById("asistenciaGeneralTabla");
    if (tabla) tabla.innerHTML = asistenciaRows(rows);
  }
}

function asistenciaRows(rows) {
  return rows.map((row, index) => {
    const fecha = fechaDesdeKey(row.fecha);
    return `
      <tr data-asistencia-row>
        <td><input id="asistenciaFecha${index}" type="date" value="${row.fecha || ""}" onchange="guardarAsistenciaGeneral(true)"></td>
        <td><strong>${diaNombre(fecha)}</strong></td>
        <td><input id="asistenciaValor${index}" type="number" min="0" step="1" value="${row.asistencia || ""}" oninput="guardarAsistenciaGeneral()" placeholder="0"></td>
      </tr>
    `;
  }).join("");
}

function asistenciaEditable() {
  const rows = asistenciaGeneral();
  return `
    <table class="general-mini-table editable-assistance">
      <thead><tr><th>FECHA</th><th>DIA</th><th>ASISTENCIA</th></tr></thead>
      <tbody id="asistenciaGeneralTabla">${asistenciaRows(rows)}</tbody>
    </table>
  `;
}

function generalValueBox(valor, label, note = "", tone = "blue") {
  return `
    <article class="general-value-box ${tone}">
      <strong>${valor}</strong>
      <span>${label}</span>
      ${note ? `<small>${note}</small>` : ""}
    </article>
  `;
}

let proveedoresRecepcionGeneralSeleccionados = null;

function proveedoresRecepcionGeneralVisibles(proveedores) {
  if (proveedoresRecepcionGeneralSeleccionados === null) return proveedores;
  return proveedores.filter(p => proveedoresRecepcionGeneralSeleccionados.has(`${p.codigo} | ${p.proveedor}`));
}

function alternarProveedorRecepcionGeneral(valorCodificado, seleccionado) {
  const key = decodeURIComponent(valorCodificado);
  if (proveedoresRecepcionGeneralSeleccionados === null) {
    proveedoresRecepcionGeneralSeleccionados = new Set(
      resumenProveedoresRecepcion(modeloRecepcion()).map(p => `${p.codigo} | ${p.proveedor}`)
    );
  }
  if (seleccionado) proveedoresRecepcionGeneralSeleccionados.add(key);
  else proveedoresRecepcionGeneralSeleccionados.delete(key);
}

function seleccionarProveedoresRecepcionGeneral(modo) {
  proveedoresRecepcionGeneralSeleccionados = modo === "todos" ? null : new Set();
  verReporteGeneral();
}

function filtroProveedoresRecepcionGeneral(proveedores) {
  const visibles = proveedoresRecepcionGeneralVisibles(proveedores);
  return `
    <details class="general-provider-filter">
      <summary>PROVEEDOR <span>${fmt(visibles.length)} de ${fmt(proveedores.length)}</span></summary>
      <div class="general-provider-menu provider-filter-menu">
        <div class="provider-filter-actions">
          <button type="button" onclick="verReporteGeneral()">Aplicar</button>
          <button type="button" onclick="seleccionarProveedoresRecepcionGeneral('todos')">Todos</button>
          <button type="button" class="ghost" onclick="seleccionarProveedoresRecepcionGeneral('ninguno')">Ninguno</button>
        </div>
        <div class="provider-filter-options">
          ${proveedores.map(p => {
            const key = `${p.codigo} | ${p.proveedor}`;
            const checked = proveedoresRecepcionGeneralSeleccionados === null || proveedoresRecepcionGeneralSeleccionados.has(key);
            return `
              <label>
                <input type="checkbox" value="${encodeURIComponent(key)}" ${checked ? "checked" : ""}
                  onchange="alternarProveedorRecepcionGeneral(this.value, this.checked)">
                <span>${key}</span>
              </label>
            `;
          }).join("")}
        </div>
      </div>
    </details>
  `;
}

function tablaRecepcionGeneral(proveedores) {
  const rows = proveedores.map(p => `
    <tr>
      <td>${p.codigo}</td>
      <td><strong>${p.proveedor}</strong></td>
      <td class="number">${fmt(p.programado)}</td>
      <td class="number">${fmt(p.recibido)}</td>
      <td class="general-progress">
        <b>${p.cumplimiento.toFixed(1)}%</b>
        <i><span style="width:${Math.min(100, p.cumplimiento)}%"></span></i>
      </td>
    </tr>
  `).join("");
  return `
    <div class="general-reception-table-wrap">
      <table class="general-mini-table">
        <thead><tr><th>CODIGO</th><th>PROVEEDOR</th><th>PROGRAMADO</th><th>RECIBIDO</th><th>% CUMP.</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5" class="provider-empty">Selecciona proveedores desde el filtro.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function tablaDespachoGeneral(resumen) {
  const dia = resumen.porTurno.DIA || { bultos: 0, pallets: 0, viajes: 0, bultosPallet: 0, costo: 0, ocupacion: 0 };
  const noche = resumen.porTurno.NOCHE || { bultos: 0, pallets: 0, viajes: 0, bultosPallet: 0, costo: 0, ocupacion: 0 };
  return `
    <table class="general-mini-table despacho-general-table">
      <thead><tr><th></th><th>Dia</th><th>Noche</th><th>Total</th></tr></thead>
      <tbody>
        <tr><td>Viajes</td><td>${fmt(dia.viajes)}</td><td>${fmt(noche.viajes)}</td><td><strong>${fmt(resumen.viajes)}</strong></td></tr>
        <tr><td>Pallets</td><td>${fmt(dia.pallets)}</td><td>${fmt(noche.pallets)}</td><td><strong>${fmt(resumen.palletsTotal)}</strong></td></tr>
        <tr><td>Costo despachado</td><td>S/ ${fmt(dia.costo)}</td><td>S/ ${fmt(noche.costo)}</td><td><strong>S/ ${fmt(resumen.costoTotal)}</strong></td></tr>
        <tr><td>Bultos total</td><td>${fmt(dia.bultos)}</td><td>${fmt(noche.bultos)}</td><td><strong>${fmt(resumen.totalBultos)}</strong></td></tr>
        <tr><td>Bultos x Pallet</td><td>${fmt(dia.bultosPallet)}</td><td>${fmt(noche.bultosPallet)}</td><td><strong>${fmt(resumen.bultosPallet)}</strong></td></tr>
      </tbody>
    </table>
  `;
}

function verReporteGeneral() {
  window.scrollTo({ left: 0, top: 0 });
  const picking = modeloPicking();
  const recepcion = modeloRecepcion();
  const despacho = modeloDespacho();
  const totalPicking = picking.reduce((a, b) => a + b.bultos, 0);
  const resRecep = resumenRecepcionVisual(resumenRecepcion(recepcion));
  const proveedores = resumenProveedoresRecepcion(recepcion);
  const proveedoresVisibles = proveedoresRecepcionGeneralVisibles(proveedores);
  const resDesp = resumenDespacho(despacho);

  document.getElementById("modulo").innerHTML = `
    <section class="general-report-sheet">
      <h2>REPORTE GENERAL</h2>
      <div class="general-report-grid">
        <article class="general-block asistencia-block">
          <h3>ASISTENCIA</h3>
          ${asistenciaEditable()}
        </article>

        <article class="general-block recepcion-block">
          <div class="general-block-title">
            <h3>RECEPCION</h3>
            ${filtroProveedoresRecepcionGeneral(proveedores)}
          </div>
          ${tablaRecepcionGeneral(proveedoresVisibles)}
        </article>

        <aside class="general-side-kpis">
          ${generalValueBox(fmt(resRecep.asn917), "ASN UNICOS 917", "Punta Negra", "green")}
          ${generalValueBox(fmt(resRecep.mono917), "MONOPALLET", "917", "gold")}
          ${generalValueBox(fmt(resRecep.multi917), "MULTISKU", "917", "red")}
        </aside>

        <article class="general-block despacho-block">
          <h3>DESPACHO</h3>
          ${tablaDespachoGeneral(resDesp)}
        </article>

        <article class="general-block picking-operativo-block">
          <h3>PICKING</h3>
          <div class="general-stack-card">
            ${generalValueBox(fmt(totalPicking), "TOTAL PICKING", "Data PICKING", "blue")}
            ${generalValueBox(fmt(new Set(picking.map(r => r.usuario).filter(Boolean)).size), "USUARIOS", "Data PICKING", "green")}
            ${generalValueBox(fmt(new Set(picking.map(r => r.lpn).filter(Boolean)).size), "LPNS", "Data PICKING", "gold")}
          </div>
        </article>
      </div>
    </section>
  `;
}

function compactHeader(titulo, subtitulo, total, label) {
  return `
    <div class="exec-header">
      <div>
        <span>Reporte compacto</span>
        <h2>${titulo}</h2>
      </div>
      <div class="exec-date"><strong>${fmt(total)}</strong><span>${label}</span></div>
    </div>
  `;
}

function compactTopList(titulo, data, total) {
  return `
    <article class="exec-card">
      <div class="exec-card-head">
        <h3>${titulo}</h3>
        <b>${fmt(data[0]?.valor || 0)}</b>
      </div>
      ${data.slice(0, 6).map(x => miniBar(corto(x.label, 28), x.valor, total)).join("")}
    </article>
  `;
}

function iconoPicking(tipo) {
  const iconos = {
    caja: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v13H4z"></path><path d="M7 7V4h10v3"></path><path d="M9 11h6"></path></svg>`,
    usuarios: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
    barras: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5v14"></path><path d="M6 5v14"></path><path d="M9 5v14"></path><path d="M12 5v14"></path><path d="M15 5v14"></path><path d="M18 5v14"></path><path d="M21 5v14"></path></svg>`,
    reloj: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v6l4 2"></path></svg>`,
    linea: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18"></path><path d="m7 15 4-4 3 3 5-7"></path></svg>`,
    recibido: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8"></path><path d="M3 8l9-5 9 5"></path><path d="M12 3v18"></path><path d="m8 13 3 3 5-6"></path></svg>`,
    programado: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"></rect><path d="M8 2v4"></path><path d="M16 2v4"></path><path d="M3 10h18"></path><path d="M8 15h4"></path><path d="M8 18h8"></path></svg>`,
    check: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m8 12 3 3 5-6"></path></svg>`,
    paletero: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20V8"></path><path d="M18 20V8"></path><path d="M4 20h16"></path><path d="M7 8h10l-1-4H8z"></path><path d="M8 12h8"></path><path d="M8 16h8"></path></svg>`,
    proveedor: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V8l9-5 9 5v13"></path><path d="M9 21v-7h6v7"></path><path d="M7 10h2"></path><path d="M15 10h2"></path></svg>`,
    camion: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11v9H3z"></path><path d="M14 10h4l3 3v3h-7z"></path><circle cx="7" cy="18" r="2"></circle><circle cx="18" cy="18" r="2"></circle></svg>`,
    pallet: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v5H4z"></path><path d="M4 14h16v5H4z"></path><path d="M8 10v4"></path><path d="M16 10v4"></path><path d="M8 19v2"></path><path d="M16 19v2"></path></svg>`,
    tienda: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16"></path><path d="M5 10l1-6h12l1 6"></path><path d="M6 10v10h12V10"></path><path d="M9 20v-6h6v6"></path></svg>`,
    moneda: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"></path></svg>`,
    ruta: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6" r="3"></circle><circle cx="18" cy="18" r="3"></circle><path d="M9 6h4a5 5 0 0 1 0 10h-2"></path></svg>`,
    dia: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v3"></path><path d="M12 19v3"></path><path d="M4.93 4.93l2.12 2.12"></path><path d="M16.95 16.95l2.12 2.12"></path><path d="M2 12h3"></path><path d="M19 12h3"></path><path d="M4.93 19.07l2.12-2.12"></path><path d="M16.95 7.05l2.12-2.12"></path></svg>`,
    tarde: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18h16"></path><path d="M7 15a5 5 0 0 1 10 0"></path><path d="M12 6v3"></path><path d="M5 10l2 2"></path><path d="M19 10l-2 2"></path></svg>`,
    noche: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 13.2A8 8 0 1 1 10.8 3a6 6 0 0 0 10.2 10.2z"></path><path d="M18 5h.01"></path><path d="M20 8h.01"></path></svg>`
  };
  return iconos[tipo] || "";
}

function visualKpi(label, value, tone = "", icon = "") {
  return `
    <article class="visual-kpi ${tone} ${icon ? "with-icon" : ""}">
      ${icon ? `<i class="visual-kpi-icon">${iconoPicking(icon)}</i>` : ""}
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function visualGauge(label, value, max, color = "#2563eb", icon = "") {
  const p = Math.max(0, Math.min(100, pct(value, max)));
  const radio = 42;
  const circ = Math.PI * radio;
  const largo = (p / 100) * circ;
  const restante = Math.max(0, circ - largo);
  return `
    <article class="visual-gauge">
      <h3>${icon ? `<i class="visual-title-icon">${iconoPicking(icon)}</i>` : ""}${label}</h3>
      <div class="gauge-svg-wrap">
        <svg class="gauge-svg" viewBox="0 0 100 58" aria-hidden="true">
          <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#e5e7eb" stroke-width="14" stroke-linecap="butt"></path>
          <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="${color}" stroke-width="14" stroke-dasharray="${largo} ${restante}" stroke-linecap="butt"></path>
        </svg>
        <strong>${p.toFixed(1)}%</strong>
      </div>
      <span>${fmt(value)} de ${fmt(max)}</span>
    </article>
  `;
}

function visualColumns(title, data, total, color = "#6d28d9") {
  const max = Math.max(...data.map(x => x.valor), 1);
  return `
    <article class="visual-panel main-chart">
      <div class="visual-panel-head">
        <h3>${title}</h3>
        <span>${fmt(total)}</span>
      </div>
      <div class="visual-columns">
        ${data.slice(0, 10).map(x => `
          <div class="visual-col">
            <div><i style="height:${pct(x.valor, max)}%;background:${color}"></i></div>
            <b>${fmt(x.valor)}</b>
            <span>${corto(x.label, 10)}</span>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function visualLine(title, data, total, color = "#2563eb", destacado = false, totalLabel = "BULTOS TOTALES") {
  const isViajes = totalLabel === "VIAJES";
  const isCase = title.toUpperCase().includes("CASE");
  const isPickActiveTrend = totalLabel === "TAREAS" || totalLabel === "UNIDADES";
  const max = Math.max(...data.map(x => x.valor), 1);
  const points = data.map((x, i) => {
    const xPos = data.length === 1 ? 500 : 20 + (i / (data.length - 1)) * 960;
    const yPos = 220 - (x.valor / max) * 190;
    return { ...x, x: xPos, y: yPos };
  });
  const path = points.length
    ? points.reduce((d, point, index) => {
        if (index === 0) return `M ${point.x} ${point.y}`;
        const anterior = points[index - 1];
        const mitad = (anterior.x + point.x) / 2;
        return `${d} C ${mitad} ${anterior.y}, ${mitad} ${point.y}, ${point.x} ${point.y}`;
      }, "")
    : "";
  const labelX = point => Math.min(925, Math.max(75, point.x));
  return `
    <article class="visual-panel main-chart ${destacado ? "visual-line-highlighted" : ""} ${isViajes ? "viajes-line" : ""} ${isCase ? "case-line" : ""} ${isPickActiveTrend ? "pick-active-line" : ""}">
      <div class="visual-panel-head">
        <div>
          <h3>${destacado ? `<i class="visual-title-icon">${iconoPicking("linea")}</i>` : ""}${title}</h3>
          ${destacado ? `<strong class="visual-line-total">${fmt(total)} <small>${totalLabel}</small></strong>` : ""}
        </div>
        ${destacado ? "" : `<span>${fmt(total)}</span>`}
      </div>
      <div class="visual-line">
        <svg viewBox="0 0 1000 240" preserveAspectRatio="none">
          <line x1="20" y1="220" x2="980" y2="220"></line>
          <line x1="20" y1="157" x2="980" y2="157"></line>
          <line x1="20" y1="94" x2="980" y2="94"></line>
          <line x1="20" y1="31" x2="980" y2="31"></line>
          <path d="${path}" style="stroke:${color}"></path>
          ${isCase || isPickActiveTrend ? points.map(p => `<text class="visual-line-value" x="${labelX(p)}" y="${Math.max(20, p.y - 12)}" text-anchor="middle">${fmt(p.valor)}</text>`).join("") : ""}
          ${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="5" style="fill:${color}"></circle>`).join("")}
          ${isViajes ? points.map(p => `<text x="${p.x}" y="${Math.max(18, p.y - 16)}" text-anchor="middle">${fmt(p.valor)}</text>`).join("") : ""}
        </svg>
        <div class="visual-line-axis">
          ${points.map(p => (isViajes || isCase || isPickActiveTrend) ? `<span><small>${p.label}</small></span>` : `<span><b>${fmt(p.valor)}</b><small>${p.label}</small></span>`).join("")}
        </div>
      </div>
    </article>
  `;
}

function visualDonut(title, data, total) {
  return `
    <article class="visual-panel visual-donut-panel">
      <div class="visual-panel-head">
        <h3>${title}</h3>
      </div>
      ${pieChart(data, total, fmt(total))}
    </article>
  `;
}

function visualDonutInterno(title, data, total) {
  const colores = ["#4b66e6", "#55a35a", "#f59e0b", "#ef4444"];
  const radio = 39;
  const centro = 50;
  const circ = 2 * Math.PI * radio;
  let acumulado = 0;
  const segmentos = data.map((x, i) => {
    const valorPct = Math.max(0, pct(x.valor, total));
    const largo = (valorPct / 100) * circ;
    const offset = -((acumulado / 100) * circ);
    acumulado += valorPct;
    return `<circle cx="${centro}" cy="${centro}" r="${radio}" fill="none" stroke="${colores[i]}" stroke-width="20" stroke-dasharray="${largo} ${Math.max(0, circ - largo)}" stroke-dashoffset="${offset}" transform="rotate(-90 ${centro} ${centro})"></circle>`;
  }).join("");
  return `
    <article class="visual-panel dispatch-donut-panel">
      <div class="visual-panel-head"><h3>${title}</h3></div>
      <div class="dispatch-donut">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r="${radio}" fill="none" stroke="#e2e8f0" stroke-width="20"></circle>
          ${segmentos}
        </svg>
        <div class="dispatch-donut-center"><strong>${fmt(total)}</strong><span>Bultos totales</span></div>
      </div>
      <div class="dispatch-donut-values">
        ${data.map((x, i) => `<div style="--tone:${colores[i]}"><span>${x.label}</span><strong>${fmt(x.valor)}</strong><b>${pct(x.valor, total).toFixed(1)}%</b></div>`).join("")}
      </div>
    </article>
  `;
}

function visualTurnoResumen(title, data, total) {
  return `
    <article class="visual-gauge visual-turno-card">
      <h3>${title}</h3>
      <div class="turno-stack">
        ${data.map(x => `
          <div class="turno-line">
            <span>${x.label}</span>
            <div><i style="width:${Math.min(100, pct(x.valor, total))}%"></i></div>
            <b>${pct(x.valor, total).toFixed(1)}%</b>
          </div>
        `).join("")}
      </div>
      <span>${fmt(total)} bultos total</span>
    </article>
  `;
}

let proveedoresRecepcionSeleccionados = null;

function proveedoresRecepcionVisibles(proveedores) {
  if (proveedoresRecepcionSeleccionados === null) return proveedores;
  return proveedores.filter(p => proveedoresRecepcionSeleccionados.has(`${p.codigo} | ${p.proveedor}`));
}

function alternarProveedorRecepcion(valorCodificado, seleccionado) {
  const proveedorKey = decodeURIComponent(valorCodificado);
  if (proveedoresRecepcionSeleccionados === null) {
    proveedoresRecepcionSeleccionados = new Set(
      resumenProveedoresRecepcion(modeloRecepcion()).map(p => `${p.codigo} | ${p.proveedor}`)
    );
  }
  if (seleccionado) proveedoresRecepcionSeleccionados.add(proveedorKey);
  else proveedoresRecepcionSeleccionados.delete(proveedorKey);
}

function seleccionarProveedoresRecepcion(modo) {
  proveedoresRecepcionSeleccionados = modo === "todos" ? null : new Set();
  verRecepcionCompacto();
}

function filtroProveedoresRecepcion(proveedores) {
  const visibles = proveedoresRecepcionVisibles(proveedores);
  return `
    <div class="provider-filter-bar">
      <div>
        <strong>Proveedores visibles</strong>
        <span>${fmt(visibles.length)} de ${fmt(proveedores.length)} seleccionados.</span>
      </div>
      <details class="provider-filter">
        <summary>Escoger proveedores</summary>
        <div class="provider-filter-menu">
          <div class="provider-filter-actions">
            <button type="button" onclick="verRecepcionCompacto()">Aplicar seleccion</button>
            <button type="button" onclick="seleccionarProveedoresRecepcion('todos')">Todos</button>
            <button type="button" class="ghost" onclick="seleccionarProveedoresRecepcion('ninguno')">Ninguno</button>
          </div>
          <div class="provider-filter-options">
            ${proveedores.map(p => {
              const key = `${p.codigo} | ${p.proveedor}`;
              const checked = proveedoresRecepcionSeleccionados === null || proveedoresRecepcionSeleccionados.has(key);
              return `
                <label>
                  <input type="checkbox" value="${encodeURIComponent(key)}" ${checked ? "checked" : ""}
                    onchange="alternarProveedorRecepcion(this.value, this.checked)">
                  <span>${key}</span>
                </label>
              `;
            }).join("")}
          </div>
        </div>
      </details>
    </div>
  `;
}

function providerCompactPanel(proveedores) {
  return `
    <article class="visual-panel main-chart">
      <div class="visual-panel-head">
        <h3><i class="visual-title-icon">${iconoPicking("proveedor")}</i>PROVEEDORES</h3>
        <span>Programado vs recibido</span>
      </div>
      <div class="provider-compact">
        ${proveedores.map(p => {
          const estado = p.diferencia === 0 ? "COMPLETO" : p.diferencia > 0 ? "FALTO" : "DE MAS";
          return `
            <div class="provider-compact-row ${estado === "COMPLETO" ? "ok" : "alert"}">
              <div>
                <strong>${p.codigo} | ${p.proveedor}</strong>
                <span>${estado} | ${p.cumplimiento.toFixed(1)}%</span>
              </div>
              <b>${fmt(p.recibido)}</b>
              <small>Prog. ${fmt(p.programado)} | Dif. ${fmt(p.diferencia)}</small>
            </div>
          `;
        }).join("") || `<div class="provider-empty">Selecciona al menos un proveedor para mostrarlo.</div>`}
      </div>
    </article>
  `;
}

function tarjetasProveedoresRecepcion(proveedores, totalRecibido) {
  return `
    <div class="reception-provider-cards">
      ${proveedores.map(p => {
        const estado = p.diferencia === 0 ? "COMPLETO" : p.diferencia > 0 ? "FALTA RECIBIR" : "RECIBIDO DE MAS";
        return `
          <article class="reception-provider-card ${p.diferencia === 0 ? "ok" : "alert"}">
            <div class="reception-provider-card-head">
              <span>${p.codigo}</span>
              <b>${estado}</b>
            </div>
            <h3>${p.proveedor}</h3>
            <strong>${fmt(p.recibido)}</strong>
            <em>Bultos recibidos</em>
            <div>
              <b>${fmt(p.programado)}<small>Programado</small></b>
              <b>${fmt(p.diferencia)}<small>Diferencia</small></b>
              <b>${p.cumplimiento.toFixed(1)}%<small>Cumplimiento</small></b>
              <b>${pct(p.recibido, totalRecibido).toFixed(1)}%<small>Participacion</small></b>
              <b>${fmt(p.asnUnicos)}<small>ASN</small></b>
            </div>
          </article>
        `;
      }).join("") || `<div class="provider-empty">Selecciona al menos un proveedor para mostrar sus indicadores.</div>`}
    </div>
  `;
}

function despachoTurnoPanel(resumen) {
  return `
    <article class="visual-panel main-chart">
      <div class="visual-panel-head">
        <h3>DIA VS NOCHE</h3>
        <span>Costo, viajes, pallets y capacidad</span>
      </div>
      <div class="dispatch-shifts">
        ${["DIA", "NOCHE"].map(turno => {
          const x = resumen.porTurno[turno];
          return `
            <div class="dispatch-shift-card">
              <strong>${turno}</strong>
              <div class="dispatch-big">S/ ${fmt(x.costo)}</div>
              <div class="dispatch-mini">
                <b>${fmt(x.viajes)}<small>Viajes</small></b>
                <b>${fmt(x.pallets)}<small>Pallets</small></b>
                <b>${fmt(x.bultosPallet)}<small>Bultos/Pallet</small></b>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </article>
  `;
}

let turnoPickingCompacto = "DIA";

function seleccionarTurnoPickingCompacto(turno) {
  turnoPickingCompacto = turnoPickingCompacto === turno ? "TODOS" : turno;
  verPickingCompacto();
}

function fechaPedidoEjecutivo(valor) {
  const texto = limpiar(valor);
  const partes = texto.includes("/") ? texto.split("/").map(Number) : texto.split("-").map(Number);
  if (partes.length !== 3 || partes.some(n => !Number.isFinite(n))) return null;
  return texto.includes("/") ? new Date(partes[2], partes[1] - 1, partes[0]) : new Date(partes[0], partes[1] - 1, partes[2]);
}

function pedidoEjecutivoAnterior() {
  const agrupado = new Map();
  (dataPedido || []).forEach(row => {
    const fecha = fechaPedidoEjecutivo(campo(row, ["FECHA_ORDEN", "FECHA", "Fecha"]));
    if (!fecha || !Number.isFinite(fecha.getTime())) return;
    const key = fecha.toISOString().slice(0, 10);
    if (!agrupado.has(key)) agrupado.set(key, { fecha, asignable: 0, asignado: 0 });
    const item = agrupado.get(key);
    item.asignable += num(campo(row, ["BULTOS_PEDIDO"]));
    item.asignado += num(campo(row, ["BULTOS_ASIGNADOS", "BULTOS_ASIGANDOS", "BULTOS_ASIGNADO", "BULTO_ASIGNADO", "ASIGNADO"]));
  });
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Array.from(agrupado.values()).filter(item => item.fecha < hoy).sort((a, b) => b.fecha - a.fecha)[0] || null;
}

function pedidoEjecutivoPanel(resumen) {
  if (!resumen) return `<div class="executive-empty">No hay una fecha anterior disponible en la hoja PEDIDO.</div>`;
  return `<div class="executive-order-metrics">${executiveMetric("ASIGNABLE", fmt(resumen.asignable))}${executiveMetric("ASIGNADO", fmt(resumen.asignado))}</div>`;
}

function tarjetaDestajoTurno(turno, data, totalGeneral) {
  const filas = data.filter(r => r.turno === turno);
  const bultos = filas.reduce((a, b) => a + b.bultos, 0);
  const usuarios = new Set(filas.map(r => r.usuario).filter(Boolean)).size;
  const lpns = new Set(filas.map(r => r.lpn).filter(Boolean)).size;
  const horas = promedioPickingPorHora(filas);
  const porHora = horas.length ? bultos / horas.length : 0;
  const iconos = { DIA: "dia", TARDE: "tarde", NOCHE: "noche" };
  const inicio = horas[0]?.label || "-";
  const fin = horas[horas.length - 1]?.label || "-";
  return `
    <button class="picking-shift-card ${turnoPickingCompacto === turno ? "active" : ""}" aria-pressed="${turnoPickingCompacto === turno}" onclick="seleccionarTurnoPickingCompacto('${turno}')">
      <div class="picking-shift-top">
        <i class="picking-shift-icon">${iconoPicking(iconos[turno])}</i>
        <div class="picking-shift-title">
          <span>${turno}</span>
          <em>BULTOS TOTALES</em>
          <strong>${fmt(bultos)}</strong>
        </div>
        <div class="picking-shift-stats">
          <b>${fmt(usuarios)}<small>USUARIOS</small></b>
          <b>${fmt(lpns)}<small>LPNS</small></b>
          <b>${fmt(porHora)}<small>PROM. HORA</small></b>
        </div>
      </div>
      <div class="picking-shift-bottom">
        <b>${inicio}<small>INICIO</small></b>
        <b>${fin}<small>FIN</small></b>
        <b>${fmt(horas.length)}<small>HORAS</small></b>
        <b>${fmt(pct(bultos, totalGeneral))}%<small>PARTICIPACION</small></b>
      </div>
    </button>
  `;
}

let vistaPickingCompacto = "GENERAL";

function seleccionarVistaPickingCompacto(vista) {
  vistaPickingCompacto = vista === "DIARIA" ? "DIARIA" : "GENERAL";
  verPickingCompacto();
}

function tendenciaPicking(horas, total) {
  const width = Math.max(1000, horas.length * 70);
  const max = Math.max(1, ...horas.map(h => h.valor));
  const points = horas.map((h, i) => ({
    ...h, x: horas.length === 1 ? width / 2 : 65 + i * (width - 130) / Math.max(1, horas.length - 1),
    y: 245 - h.valor / max * 175
  }));
  const path = points.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" ");
  return `<article class="picking-trend">
    <h3>AVANCE POR HORA - ${turnoPickingCompacto}</h3>
    <div class="picking-trend-scroll">
      ${points.length ? `<svg viewBox="0 0 ${width} 300" style="min-width:1000px" role="img" aria-label="Bultos de picking por hora">
      ${[70,128,187,245].map(y=>`<line x1="65" x2="${width-65}" y1="${y}" y2="${y}" stroke="#dce3ed"/>`).join("")}
      <path d="${path}" fill="none" stroke="#16365f" stroke-width="3"/>
      ${points.map(p=>`<g><circle cx="${p.x}" cy="${p.y}" r="5" fill="#16365f" stroke="white" stroke-width="2"/><text x="${p.x}" y="${p.y-16}" text-anchor="middle" class="picking-point-value">${fmt(p.valor)}</text><text x="${p.x}" y="282" text-anchor="middle">${p.label}</text></g>`).join("")}
      </svg>` : '<div class="empty-state">Sin datos para este turno.</div>'}
    </div>
  </article>`;
}

function verPickingCompacto() {
  const source = modeloPicking();
  prepararFiltroPickers(source);
  const dataGeneral = pickingUsersSelected === null ? source : source.filter(r => pickingUsersSelected.has(limpiar(r.usuario)));
  const data = turnoPickingCompacto === "TODOS" ? dataGeneral : dataGeneral.filter(r => r.turno === turnoPickingCompacto);
  const totalGeneral = dataGeneral.reduce((a, b) => a + b.bultos, 0);
  const total = data.reduce((a, b) => a + b.bultos, 0);
  const horas = promedioPickingPorHora(data);
  const usuarios = new Set(data.map(r => r.usuario).filter(Boolean)).size;

  document.getElementById("modulo").innerHTML = `
    <section class="visual-sheet picking-compact">
      <div class="visual-header">
        <div><h2>REPORTE DE PICKING</h2>
          <div class="picking-view-switch" role="group" aria-label="Tipo de reporte">
            <button type="button" aria-pressed="${vistaPickingCompacto === "DIARIA"}" onclick="seleccionarVistaPickingCompacto('DIARIA')">Diaria</button>
            <button type="button" aria-pressed="${vistaPickingCompacto === "GENERAL"}" onclick="seleccionarVistaPickingCompacto('GENERAL')">General</button>
          </div>
        </div>
        <div class="visual-kpi-row">
          ${visualKpi("TOTAL PICKING", fmt(total), "", "caja")}
          ${visualKpi("USUARIOS", fmt(usuarios), "", "usuarios")}
          ${visualKpi("PROMEDIO X HORA", fmt(horas.length ? total / horas.length : 0), "", "reloj")}
        </div>
      </div>
      <div class="picking-report-main">${tendenciaPicking(horas, total)}</div>
      ${vistaPickingCompacto === "GENERAL" ? `<div class="picking-shift-grid">
        ${["DIA", "TARDE", "NOCHE"].map(turno => tarjetaDestajoTurno(turno, dataGeneral, totalGeneral)).join("")}
      </div>` : ""}
    </section>`;
  const visor = document.getElementById("visorReporte");
  if (visor && !visor.hidden) prepararContenidoReporte();
}

function verRecepcionCompacto() {
  const data = modeloRecepcion();
  const proveedoresDetalle = resumenProveedoresRecepcion(data);
  const proveedoresVisibles = proveedoresRecepcionVisibles(proveedoresDetalle);
  const clavesVisibles = new Set(proveedoresVisibles.map(p => `${p.codigo} | ${p.proveedor}`));
  const dataVisible = data.filter(r => clavesVisibles.has(r.proveedorKey));
  const resumen = resumenRecepcion(dataVisible);

  document.getElementById("modulo").innerHTML = `
    <section class="visual-sheet reception-compact">
      <div class="visual-header green">
        <div><h2>REPORTE DE RECEPCION</h2></div>
        <div class="visual-kpi-row">
          ${visualKpi("RECIBIDO", fmt(resumen.totalRecibido), "", "recibido")}
          ${visualKpi("PROGRAMADO", fmt(resumen.totalProgramado), "", "programado")}
          ${visualKpi("CUMPLIMIENTO", `${resumen.cumplimiento.toFixed(1)}%`, "", "check")}
          ${visualKpi("PALETEROS", fmt(resumen.paleterosRecibidos), "", "paletero")}
          ${visualKpi("PROVEEDORES", fmt(proveedoresVisibles.length), "", "proveedor")}
        </div>
      </div>
      ${filtroProveedoresRecepcion(proveedoresDetalle)}
      <div class="reception-provider-main">
        ${providerCompactPanel(proveedoresVisibles)}
      </div>
    </section>
  `;
}

function tarjetaDespachoTurnoVisual(turno, resumen, totalGeneral) {
  const x = resumen.porTurno[turno] || { bultos: 0, pallets: 0, viajes: 0, tiendas: 0, placas: 0, costo: 0, bultosPallet: 0, ocupacion: 0 };
  const tonos = { DIA: "green", NOCHE: "purple" };
  const iconos = { DIA: "dia", NOCHE: "noche" };
  const horarios = { DIA: ["07:00", "18:59"], NOCHE: ["21:00", "06:59"] };
  return `
    <article class="dispatch-shift-visual ${tonos[turno]}">
      <div class="dispatch-shift-top">
        <i class="dispatch-shift-icon">${iconoPicking(iconos[turno])}</i>
        <div>
          <span>${turno}</span>
          <em>COSTO DESPACHADO</em>
          <strong>S/ ${fmt(x.costo)}</strong>
        </div>
        <div class="dispatch-shift-stats">
          <b>${fmt(x.viajes)}<small>VIAJES</small></b>
          <b>${fmt(x.pallets)}<small>PALLETS</small></b>
          <b>${fmt(x.bultosPallet)}<small>BULTOS/PALLET</small></b>
        </div>
      </div>
      <div class="dispatch-shift-meter"><i style="width:${pct(x.costo, Math.max(totalGeneral, 1))}%"></i></div>
      <div class="dispatch-shift-bottom">
        <b>${horarios[turno][0]}<small>INICIO</small></b>
        <b>${horarios[turno][1]}<small>FIN</small></b>
        <b>${fmt(x.placas)}<small>PLACAS</small></b>
        <b>${pct(x.costo, totalGeneral).toFixed(1)}%<small>PARTICIPACION</small></b>
      </div>
    </article>
  `;
}

function panelImpactoDespacho(resumen) {
  const dia = resumen.porTurno.DIA || {};
  const noche = resumen.porTurno.NOCHE || {};
  const pctDia = pct(dia.costo || 0, Math.max(resumen.costoTotal, 1));
  const pctNoche = pct(noche.costo || 0, Math.max(resumen.costoTotal, 1));
  const turnoFuerte = pctDia >= pctNoche ? "DIA" : "NOCHE";
  const pctFuerte = Math.max(pctDia, pctNoche);
  return `
    <article class="visual-panel dispatch-impact-panel">
      <div class="visual-panel-head">
        <div>
          <h3><i class="visual-title-icon">${iconoPicking("ruta")}</i>RESUMEN LOGISTICO</h3>
          <span>Dia 07:00-18:59 | Noche 21:00-06:59</span>
        </div>
      </div>
      <div class="dispatch-impact-hero">
        <div class="dispatch-donut-mini" style="--dia:${pctDia}; --noche:${pctNoche}">
          <strong>S/ ${fmt(resumen.costoTotal)}</strong>
          <span>Costo total</span>
        </div>
        <div class="dispatch-impact-badges">
          <b><span>${fmt(resumen.viajes)}</span>Viajes</b>
          <b><span>${fmt(resumen.palletsTotal)}</span>Pallets</b>
          <b><span>${fmt(resumen.bultosPallet)}</span>Bultos/Pallet</b>
        </div>
      </div>
      <div class="dispatch-impact-legend">
        <span><i class="dia"></i>Dia <strong>${pctDia.toFixed(1)}%</strong></span>
        <span><i class="noche"></i>Noche <strong>${pctNoche.toFixed(1)}%</strong></span>
      </div>
      <div class="dispatch-impact-focus">
        <span>Turno dominante</span>
        <strong>${turnoFuerte}</strong>
        <b>${pctFuerte.toFixed(1)}% del costo despachado</b>
      </div>
    </article>
  `;
}

function tarjetaResumenLogistico(turno, data, participacion, icono) {
  return `
    <article class="dispatch-impact-shift ${turno.toLowerCase()}">
      <div>
        <i class="dispatch-shift-icon">${iconoPicking(icono)}</i>
        <span>${turno}</span>
        <strong>${participacion.toFixed(1)}%</strong>
      </div>
      <small>S/ ${fmt(data.costo || 0)} despachado</small>
      <section>
        <b>${fmt(data.viajes || 0)}<em>Viajes</em></b>
        <b>${fmt(data.pallets || 0)}<em>Pallets</em></b>
        <b>${fmt(data.tiendas || 0)}<em>Tiendas</em></b>
      </section>
      <u><i style="width:${Math.max(2, participacion)}%"></i></u>
    </article>
  `;
}

let vistaDespachoCompacto = "GENERAL";
function seleccionarVistaDespachoCompacto(vista) {
  vistaDespachoCompacto = vista === "DIARIA" ? "DIARIA" : "GENERAL";
  verDespachoCompacto();
}
function verDespachoCompacto() {
  const dataGeneral = modeloDespacho();
  const data = filtrarDespachoPorTurno(dataGeneral);
  const resumen = resumenDespacho(data, turnoDespachoReporte);
  const resumenGeneral = resumenDespacho(dataGeneral, "TODOS");
  const viajesHora = viajesDespachoPorHora(turnoDespachoReporte);
  const horaPico = viajesHora.slice().sort((a, b) => b.valor - a.valor)[0];

  document.getElementById("modulo").innerHTML = `
    <section class="visual-sheet dispatch-compact case-redesign dispatch-redesign">
      <div class="visual-header blue">
        <div>
          <h2>REPORTE DE DESPACHO</h2>
          <div class="case-view-switch" role="group" aria-label="Vista Despacho"><button type="button" aria-pressed="${vistaDespachoCompacto === 'DIARIA'}" onclick="seleccionarVistaDespachoCompacto('DIARIA')">Diaria</button><button type="button" aria-pressed="${vistaDespachoCompacto === 'GENERAL'}" onclick="seleccionarVistaDespachoCompacto('GENERAL')">General</button></div>
        </div>
        <div class="visual-kpi-row">
          ${visualKpi("VIAJES", fmt(resumen.viajes), "", "camion")}
          ${visualKpi("PALLETS", fmt(resumen.palletsTotal), "", "pallet")}
          ${visualKpi("TIENDAS", fmt(resumen.tiendas), "", "tienda")}
          ${visualKpi("COSTO", `S/ ${fmt(resumen.costoTotal)}`, "", "moneda")}
          ${visualKpi("BULTOS/PALLET", fmt(resumen.bultosPallet), "", "barras")}
        </div>
      </div>
      <div class="picking-turn-control despacho-turn-control">
        <div class="picking-turn-buttons">
          ${["TODOS", "DIA", "NOCHE"].map(turno => `
            <button class="${turnoDespachoReporte === turno ? "active" : ""}" onclick="seleccionarTurnoDespacho('${turno}', 'compacto')">${turno}</button>
          `).join("")}
        </div>
        <div class="picking-turn-highlights">
          <div><span>Turno evaluado</span><strong>${turnoDespachoReporte}</strong></div>
          <div><span>Hora pico viajes</span><strong>${horaPico?.label || "-"}</strong><small>${fmt(horaPico?.valor || 0)} viajes</small></div>
          <div><span>Placas</span><strong>${fmt(resumen.placas)}</strong><small>${fmt(resumen.paradas)} paradas</small></div>
        </div>
      </div>
      <div class="dispatch-report-main">
        <div class="picking-main-chart">
          ${viajesHora.length ? tendenciaCaseRecta(viajesHora, false, "Viajes despachados por hora") : '<div class="empty-state">Sin viajes para este turno.</div>'}
        </div>
      </div>
      ${vistaDespachoCompacto === "GENERAL" ? `<div class="dispatch-shift-grid">
        ${["DIA", "NOCHE"].map(turno => tarjetaDespachoTurnoVisual(turno, resumenGeneral, Math.max(resumenGeneral.costoTotal, 1))).join("")}
      </div>` : ""}
    </section>
  `;
  const visor = document.getElementById("visorReporte");
  if (visor && !visor.hidden) prepararContenidoReporte();
}

function modeloBI() {
  return dataBI.map((r, index) => ({
    index,
    fecha: limpiar(campo(r, ["FECHA", "Fecha", "DATE"])),
    area: limpiar(campo(r, ["AREA", "MODULO", "TIPO", "PROCESO"])) || "SIN AREA",
    estado: limpiar(campo(r, ["ESTADO", "STATUS", "ESTADO_TAREA"])) || "SIN ESTADO",
    usuario: limpiar(campo(r, ["USUARIO", "RESPONSABLE", "OPERADOR"])) || "SIN USUARIO",
    categoria: limpiar(campo(r, ["CATEGORIA", "JERARQUIA", "FAMILIA", "TIPO_PRODUCTO"])) || "SIN CATEGORIA",
    destino: limpiar(campo(r, ["DESTINO", "TIENDA", "SUCURSAL"])) || "SIN DESTINO",
    valor: num(campo(r, ["VALOR", "BULTOS", "UNIDADES", "CANTIDAD", "TOTAL", "QTY"])),
    raw: r
  }));
}

function kpi(label, value, note = "", clase = "") {
  return `<article class="kpi ${clase}"><span>${label}</span><strong>${value}</strong>${note ? `<small>${note}</small>` : ""}</article>`;
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

function agrupar(data, fn) {
  const mapa = new Map();
  data.forEach(r => {
    const key = fn(r);
    if (!mapa.has(key)) mapa.set(key, { label: key, registros: 0, valor: 0 });
    const item = mapa.get(key);
    item.registros += 1;
    item.valor += r.valor;
  });
  return Array.from(mapa.values()).sort((a, b) => b.valor - a.valor || b.registros - a.registros);
}

function barras(data, total) {
  return `
    <div class="bar-list">
      ${data.map(x => `
        <div class="bar-item">
          <div><strong>${x.label}</strong><span>${fmt(x.valor)} | ${fmt(x.registros)} reg.</span></div>
          <div class="bar"><div style="width:${Math.min(100, pct(x.valor, total))}%"></div></div>
          <b>${pct(x.valor, total).toFixed(1)}%</b>
        </div>
      `).join("")}
    </div>
  `;
}

function donut(valor, total, label) {
  const p = Math.min(100, pct(valor, total));
  return `
    <div class="donut-card">
      <div class="donut" style="--p:${p}"></div>
      <div>
        <strong>${p.toFixed(1)}%</strong>
        <span>${label}</span>
        <small>${fmt(valor)} de ${fmt(total)}</small>
      </div>
    </div>
  `;
}

function pieChart(data, total, tituloCentro = "") {
  const colores = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2"];
  const radio = 42;
  const centro = 50;
  const circ = 2 * Math.PI * radio;
  let acumulado = 0;
  const segmentos = data.slice(0, 6).map((x, i) => {
    const valorPct = Math.max(0, pct(x.valor, total));
    const largo = (valorPct / 100) * circ;
    const gap = Math.max(0, circ - largo);
    const offset = -((acumulado / 100) * circ);
    acumulado += valorPct;
    return `<circle cx="${centro}" cy="${centro}" r="${radio}" fill="none" stroke="${colores[i]}" stroke-width="16" stroke-dasharray="${largo} ${gap}" stroke-dashoffset="${offset}" transform="rotate(-90 ${centro} ${centro})"></circle>`;
  }).join("");

  return `
    <div class="pie-layout">
      <div class="pie-svg-wrap">
        <svg class="pie-svg" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="${centro}" cy="${centro}" r="${radio}" fill="none" stroke="#e2e8f0" stroke-width="16"></circle>
          ${segmentos}
        </svg>
        <div class="pie-center"><strong>${tituloCentro || fmt(total)}</strong><span>Total</span></div>
      </div>
      <div class="legend-list">
        ${data.slice(0, 6).map((x, i) => `
          <div class="legend-item">
            <i style="background:${colores[i]}"></i>
            <span>${x.label}</span>
            <b>${pct(x.valor, total).toFixed(1)}%</b>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function verticalBars(data, total) {
  const max = Math.max(...data.map(x => x.valor), 1);
  return `
    <div class="vertical-bars">
      ${data.map(x => `
        <div class="vbar-item">
          <div class="vbar-track"><div style="height:${pct(x.valor, max)}%"></div></div>
          <strong>${fmt(x.valor)}</strong>
          <span>${x.label}</span>
          <small>${pct(x.valor, total).toFixed(1)}%</small>
        </div>
      `).join("")}
    </div>
  `;
}

function metricTiles(data, total) {
  return `
    <div class="mini-tile-grid">
      ${data.slice(0, 6).map(x => `
        <article class="mini-tile">
          <span>${x.label}</span>
          <strong>${fmt(x.valor)}</strong>
          <div class="mini-progress"><div style="width:${Math.min(100, pct(x.valor, total))}%"></div></div>
          <small>${pct(x.valor, total).toFixed(1)}% del total</small>
        </article>
      `).join("")}
    </div>
  `;
}

function barrasHorizontales(data, total) {
  const max = Math.max(...data.map(x => x.valor), 1);
  return `
    <div class="product-demand-grid">
      ${data.map((x, index) => `
        <div class="demand-row">
          <span class="rank-badge">${index + 1}</span>
          <div>
            <strong>${x.label}</strong>
            <span>${fmt(x.valor)} bultos | ${fmt(x.registros)} reg.</span>
          </div>
          <div class="demand-track"><div style="width:${pct(x.valor, max)}%"></div></div>
          <b>${pct(x.valor, total).toFixed(1)}%</b>
        </div>
      `).join("")}
    </div>
  `;
}

function resumenPorDestino(data) {
  const mapa = new Map();
  data.forEach(r => {
    const key = r.tiendaKey || "SIN DESTINO";
    if (!mapa.has(key)) {
      mapa.set(key, {
        destino: r.destino,
        local: r.local,
        bultos: 0,
        registros: 0,
        lpns: new Set(),
        productos: new Set()
      });
    }
    const item = mapa.get(key);
    item.bultos += r.bultos;
    item.registros += 1;
    if (r.lpn) item.lpns.add(r.lpn);
    if (r.codigo) item.productos.add(r.codigo);
  });
  return Array.from(mapa.values())
    .map(x => ({ ...x, totalLpns: x.lpns.size, totalProductos: x.productos.size }))
    .sort((a, b) => b.bultos - a.bultos || b.totalLpns - a.totalLpns);
}

function promedioPickingPorHora(data) {
  const mapa = new Map();
  data.forEach(r => {
    if (r.hora === null || r.hora === undefined) return;
    const key = String(r.hora).padStart(2, "0");
    if (!mapa.has(key)) mapa.set(key, { label: `${key}:00`, valor: 0, registros: 0 });
    const item = mapa.get(key);
    item.valor += r.bultos;
    item.registros += 1;
  });
  return Array.from(mapa.values())
    .sort((a, b) => Number(a.label.slice(0, 2)) - Number(b.label.slice(0, 2)));
}

function rankingPickingDetalle(data, keyFn) {
  const mapa = new Map();
  data.forEach(r => {
    const key = keyFn(r) || "SIN DATO";
    if (!mapa.has(key)) mapa.set(key, { label: key, registros: 0, valor: 0, rows: [] });
    const item = mapa.get(key);
    item.registros += 1;
    item.valor += r.bultos;
    item.rows.push(r);
  });

  return Array.from(mapa.values()).map(item => {
    const horas = promedioPickingPorHora(item.rows);
    const pico = [...horas].sort((a, b) => b.valor - a.valor)[0] || { label: "-", valor: 0, registros: 0 };
    return {
      ...item,
      horaPico: pico.label,
      bultosPico: pico.valor,
      registrosPico: pico.registros,
      horasActivas: horas.length
    };
  }).sort((a, b) => b.valor - a.valor || b.registros - a.registros);
}

function lineaPickingVisible(data) {
  if (!data.length) return `<div class="empty-state">Sin datos para la tendencia.</div>`;
  const width = 1200;
  const height = 350;
  const left = 54;
  const right = 28;
  const top = 32;
  const bottom = 78;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const max = Math.max(...data.map(x => x.valor), 1);
  const puntos = data.map((x, index) => {
    const xPos = data.length === 1 ? left + (plotW / 2) : left + (plotW * index / (data.length - 1));
    const yPos = top + plotH - ((x.valor / max) * plotH);
    return { ...x, x: xPos, y: yPos };
  });
  const path = puntos.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const pico = [...puntos].sort((a, b) => b.valor - a.valor)[0];
  const grid = [0, 1, 2, 3].map(i => {
    const y = top + (plotH * i / 3);
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"></line>`;
  }).join("");

  return `
    <div class="picking-line-visible">
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Tendencia por hora">
        <g class="picking-line-grid">${grid}</g>
        <path d="${path}"></path>
        ${puntos.map(p => `
          <g class="${p === pico ? "peak" : ""}">
            <circle cx="${p.x}" cy="${p.y}" r="${p === pico ? 8 : 6}"></circle>
            <text x="${p.x}" y="${Math.max(18, p.y - 13)}" text-anchor="middle">${fmt(p.valor)}</text>
            <text class="hour-label" x="${p.x}" y="${height - 34}" text-anchor="middle">${p.label}</text>
          </g>
        `).join("")}
      </svg>
      <div class="picking-line-foot">
        <strong>Hora pico ${pico.label}</strong>
        <span>${fmt(pico.valor)} bultos en ${fmt(pico.registros)} registros</span>
      </div>
    </div>
  `;
}

function turnoPickingVisible(turnos, total) {
  const orden = [
    { label: "DIA", clase: "green", rango: "07:00 a 15:59" },
    { label: "TARDE", clase: "gold", rango: "16:00 a 20:59" },
    { label: "NOCHE", clase: "purple", rango: "21:00 a 06:59" }
  ];
  return `
    <div class="picking-turn-summary">
      ${orden.map(t => {
        const item = turnos.find(x => x.label === t.label) || { valor: 0, registros: 0 };
        return `
          <article class="picking-turn-mini ${t.clase}">
            <span>${t.label}</span>
            <strong>${fmt(item.valor)}</strong>
            <small>${pct(item.valor, total).toFixed(1)}% del total</small>
            <em>${t.rango} | ${fmt(item.registros)} registros</em>
            <div><i style="width:${Math.min(100, pct(item.valor, total))}%"></i></div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function rankingPickingVisible(data, total) {
  const max = Math.max(...data.map(x => x.valor), 1);
  return `
    <div class="picking-rank-list">
      ${data.map((x, index) => `
        <article class="picking-rank-row">
          <b>${index + 1}</b>
          <div>
            <strong>${nombreUsuarioPorDni(x.label)}</strong>
            <span>${fmt(x.valor)} bultos | pico ${x.horaPico} con ${fmt(x.bultosPico)} | ${fmt(x.horasActivas)} h activas</span>
          </div>
          <strong>${pct(x.valor, total).toFixed(1)}%</strong>
          <i style="width:${pct(x.valor, max)}%"></i>
        </article>
      `).join("") || `<div class="empty-state">Sin datos.</div>`}
    </div>
  `;
}

function tilesPickingVisible(data, total) {
  return `
    <div class="picking-tile-grid">
      ${data.map(x => `
        <article class="picking-tile">
          <span>${x.label}</span>
          <strong>${fmt(x.valor)}</strong>
          <small>${pct(x.valor, total).toFixed(1)}% del total</small>
          <em>Pico ${x.horaPico}: ${fmt(x.bultosPico)} bultos | ${fmt(x.horasActivas)} h activas</em>
        </article>
      `).join("") || `<div class="empty-state">Sin datos.</div>`}
    </div>
  `;
}

function productosPickingVisible(data, total) {
  const max = Math.max(...data.map(x => x.valor), 1);
  return `
    <div class="picking-product-list">
      ${data.map((x, index) => `
        <article class="picking-product-row">
          <span>${index + 1}</span>
          <div>
            <strong>${x.label}</strong>
            <small>${fmt(x.valor)} bultos | ${fmt(x.registros)} registros</small>
          </div>
          <b>${x.horaPico}</b>
          <em>${fmt(x.bultosPico)} pico</em>
          <i><u style="width:${pct(x.valor, max)}%"></u></i>
          <mark>${pct(x.valor, total).toFixed(1)}%</mark>
        </article>
      `).join("") || `<div class="empty-state">Sin datos.</div>`}
    </div>
  `;
}

function barrasPromedioHoraVisible(data) {
  if (!data.length) return `<div class="empty-state">Sin datos por hora.</div>`;
  const total = data.reduce((a, b) => a + b.valor, 0);
  const promedio = data.length ? total / data.length : 0;
  const max = Math.max(...data.map(x => x.valor), promedio, 1);
  return `
    <div class="picking-hour-summary">
      <strong>${fmt(promedio)}</strong>
      <span>Promedio por hora activa</span>
    </div>
    <div class="picking-hour-bars" style="--avg:${pct(promedio, max)}%">
      ${data.map(x => `
        <article>
          <div><i style="height:${pct(x.valor, max)}%"></i></div>
          <strong>${fmt(x.valor)}</strong>
          <span>${x.label}</span>
        </article>
      `).join("")}
    </div>
  `;
}

function barrasPromedioHora(data) {
  const total = data.reduce((a, b) => a + b.valor, 0);
  const promedio = data.length ? total / data.length : 0;
  const max = Math.max(...data.map(x => x.valor), promedio, 1);
  return `
    <div class="hour-summary">
      <strong>${fmt(promedio)}</strong>
      <span>Promedio bultos por hora activa</span>
    </div>
    <div class="hour-average" style="--avg:${pct(promedio, max)}%">
      ${data.map(x => `
        <div class="hour-average-item">
          <div class="hour-bar"><div style="height:${pct(x.valor, max)}%"></div></div>
          <strong>${fmt(x.valor)}</strong>
          <span>${x.label}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function verResumen() {
  const data = modeloBI();
  const total = data.reduce((a, b) => a + b.valor, 0);
  const areas = agrupar(data, r => r.area);
  const estados = agrupar(data, r => r.estado);
  const destinos = agrupar(data, r => r.destino);
  const categorias = agrupar(data, r => r.categoria);
  const principal = areas[0];
  const alerta = estados.find(e => normalizar(e.label).includes("ALERTA") || normalizar(e.label).includes("PEND")) || estados[0];

  document.getElementById("modulo").innerHTML = `
    <section class="hero">
      <div>
        <span>Vista ejecutiva</span>
        <h2>Resumen BI</h2>
      </div>
      <div class="hero-metric">
        <strong>${fmt(total)}</strong>
        <span>Total valor</span>
      </div>
    </section>

    <section class="kpi-grid">
      ${kpi("Registros", fmt(data.length))}
      ${kpi("Areas", fmt(areas.length))}
      ${kpi("Estados", fmt(estados.length))}
      ${kpi("Destinos", fmt(destinos.length))}
      ${kpi("Mayor carga", principal?.label || "-", fmt(principal?.valor || 0), "accent")}
      ${kpi("Atencion", alerta?.label || "-", fmt(alerta?.valor || 0), "warn")}
    </section>

    <section class="dashboard-grid">
      <div class="card wide">
        <h2>Carga por area</h2>
        ${barras(areas.slice(0, 8), total)}
      </div>
      <div class="card">
        <h2>Estado principal</h2>
        ${donut(estados[0]?.valor || 0, total, estados[0]?.label || "Sin estado")}
      </div>
      <div class="card">
        <h2>Ranking destino</h2>
        ${tabla(["Destino", "Registros", "Valor"], destinos.slice(0, 8).map(x => filaGrupo(x)))}
      </div>
      <div class="card">
        <h2>Categorias</h2>
        ${tabla(["Categoria", "Registros", "Valor"], categorias.slice(0, 8).map(x => filaGrupo(x)))}
      </div>
    </section>
  `;
}

function filaGrupo(x) {
  return `
    <tr>
      <td><strong>${x.label}</strong></td>
      <td>${fmt(x.registros)}</td>
      <td class="number">${fmt(x.valor)}</td>
    </tr>
  `;
}

function verExplorador() {
  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <h2>Explorador</h2>
      <input class="search" id="filtroExplorador" placeholder="Buscar area, estado, destino, usuario..." oninput="renderExplorador()">
    </div>
    <div id="exploradorVista"></div>
  `;
  renderExplorador();
}

function renderExplorador() {
  const q = limpiar(document.getElementById("filtroExplorador")?.value).toLowerCase();
  const data = modeloBI().filter(r => !q || [r.fecha, r.area, r.estado, r.usuario, r.categoria, r.destino].join(" ").toLowerCase().includes(q));
  document.getElementById("exploradorVista").innerHTML = tabla(["Fecha", "Area", "Estado", "Usuario", "Categoria", "Destino", "Valor"], data.slice(0, 1200).map(r => `
    <tr>
      <td>${r.fecha}</td>
      <td><strong>${r.area}</strong></td>
      <td>${r.estado}</td>
      <td>${r.usuario}</td>
      <td>${r.categoria}</td>
      <td>${r.destino}</td>
      <td class="number">${fmt(r.valor)}</td>
    </tr>
  `));
}

function verRanking() {
  const data = modeloPicking();

  document.getElementById("modulo").innerHTML = `
    <section class="hero ranking-hero">
      <div>
        <span>Ranking operativo</span>
        <h2>Picking</h2>
      </div>
      <div class="hero-metric">
        <strong id="rankingHeroTotal">0</strong>
        <span>Bultos analizados</span>
      </div>
    </section>

    <section class="filter-panel ranking-filter-panel">
      <label class="filter-label">Turno
        <select id="filtroTurnoRanking" onchange="renderRankingPicking()">
          <option value="">Todos</option>
          ${opcionesFiltro(data, r => r.turno).map(op => `<option value="${op}">${op}</option>`).join("")}
        </select>
      </label>
    </section>

    <div id="rankingVista"></div>
  `;
  renderRankingPicking();
}

function aliasesRankingPicking() {
  try {
    return JSON.parse(localStorage.getItem("ranking_picking_alias_usuarios") || "{}");
  } catch {
    return {};
  }
}

function nombreUsuarioRanking(usuario, aliases = aliasesRankingPicking()) {
  const desdeHoja = nombreUsuarioPorDni(usuario);
  if (desdeHoja && desdeHoja !== limpiar(usuario)) return desdeHoja;
  return limpiar(aliases[usuario]) || usuario;
}

function guardarAliasRanking(usuario, valor) {
  const aliases = aliasesRankingPicking();
  const nombre = limpiar(valor);
  if (nombre) aliases[usuario] = nombre;
  else delete aliases[usuario];
  localStorage.setItem("ranking_picking_alias_usuarios", JSON.stringify(aliases));
  renderRankingPicking();
}

function rankingUsuariosProductividad(data) {
  return rankingPickingDetalle(data, r => r.usuario).map(x => ({
    ...x,
    promedioHora: x.horasActivas ? x.valor / x.horasActivas : 0
  }));
}

function renderRankingPicking() {
  const turno = limpiar(document.getElementById("filtroTurnoRanking")?.value);
  const data = modeloPicking().filter(r => !turno || r.turno === turno);
  const total = data.reduce((a, b) => a + b.bultos, 0);
  const ranking = rankingUsuariosProductividad(data);
  const aliases = aliasesRankingPicking();
  const hero = document.getElementById("rankingHeroTotal");
  if (hero) hero.textContent = fmt(total);

  document.getElementById("rankingVista").innerHTML = `
    <section class="ranking-leaderboard card wide">
      <div class="card-title">
        <h2>Leaderboard usuarios</h2>
        <span>${turno || "Todos los turnos"} | ${fmt(ranking.length)} usuarios</span>
      </div>
      ${leaderboardPicking(ranking.slice(0, 3), total, aliases)}
    </section>

    <section class="ranking-grid">
      <div class="card ranking-top10-card">
        <div class="card-title">
          <h2>Top 10 productividad</h2>
          <span>Bultos y promedio por hora</span>
        </div>
        ${tablaTopRanking(ranking.slice(0, 10), aliases)}
      </div>

      <div class="card ranking-alias-card">
        <div class="card-title">
          <h2>Nombres de usuarios</h2>
          <span>Edita el nombre visible del picker</span>
        </div>
        ${tablaAliasRanking(ranking, aliases)}
      </div>
    </section>

    <section class="card wide">
      <div class="card-title">
        <h2>Ranking usuarios completo</h2>
        <span>Tabla con scroll para no ocupar toda la pantalla</span>
      </div>
      ${tablaRankingCompleto(ranking, total, aliases)}
    </section>
  `;
}

function leaderboardPicking(data, total, aliases) {
  const orden = [data[1], data[0], data[2]];
  const clases = ["second", "first", "third"];
  return `
    <div class="leaderboard-podium">
      ${orden.map((x, index) => x ? `
        <article class="leader-card ${clases[index]}">
          <span>${clases[index] === "first" ? "1" : clases[index] === "second" ? "2" : "3"}</span>
          <div class="leader-avatar">${(nombreUsuarioRanking(x.label, aliases)[0] || "U").toUpperCase()}</div>
          <strong>${nombreUsuarioRanking(x.label, aliases)}</strong>
          <small>${x.label}</small>
          <b>${fmt(x.valor)}</b>
          <em>Bultos | ${fmt(x.promedioHora)} prom/h | ${pct(x.valor, total).toFixed(1)}%</em>
        </article>
      ` : `
        <article class="leader-card empty">
          <span>-</span>
          <strong>Sin usuario</strong>
          <b>0</b>
          <em>Bultos</em>
        </article>
      `).join("")}
    </div>
  `;
}

function tablaTopRanking(data, aliases) {
  return `
    <div class="ranking-top-list">
      ${data.map((x, index) => `
        <article>
          <span>${index + 1}</span>
          <div>
            <strong>${nombreUsuarioRanking(x.label, aliases)}</strong>
            <small>${x.label}</small>
          </div>
          <b>${fmt(x.valor)}</b>
          <em>${fmt(x.promedioHora)} prom/h</em>
        </article>
      `).join("") || `<div class="empty-state">Sin datos.</div>`}
    </div>
  `;
}

function htmlAttr(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function tablaAliasRanking(data, aliases) {
  return `
    <div class="ranking-alias-table">
      <table>
        <thead><tr><th>Usuario</th><th>Nombre visible</th></tr></thead>
        <tbody>
          ${data.map(x => `
            <tr>
              <td><strong>${x.label}</strong></td>
              <td><input value="${htmlAttr(nombreUsuarioRanking(x.label, aliases))}" data-usuario="${htmlAttr(x.label)}" onchange="guardarAliasRanking(this.dataset.usuario, this.value)" placeholder="Nombre del picker"></td>
            </tr>
          `).join("") || `<tr><td colspan="2">Sin datos</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function tablaRankingCompleto(data, total, aliases) {
  return `
    <div class="ranking-scroll-table">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Usuario</th>
            <th>Nombre</th>
            <th>Bultos pickados</th>
            <th>Promedio/hora</th>
            <th>Hora pico</th>
            <th>Horas activas</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          ${data.map((x, index) => `
            <tr>
              <td><strong>${index + 1}</strong></td>
              <td>${x.label}</td>
              <td><strong>${nombreUsuarioRanking(x.label, aliases)}</strong></td>
              <td class="number"><strong>${fmt(x.valor)}</strong></td>
              <td class="number">${fmt(x.promedioHora)}</td>
              <td>${x.horaPico} | ${fmt(x.bultosPico)}</td>
              <td>${fmt(x.horasActivas)}</td>
              <td>${pct(x.valor, total).toFixed(1)}%</td>
            </tr>
          `).join("") || `<tr><td colspan="8">Sin datos</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function verBase() {
  const headers = Object.keys(dataBI[0] || {});
  document.getElementById("modulo").innerHTML = `
    <div class="section-head">
      <h2>Base</h2>
      <input class="search" id="filtroBase" placeholder="Buscar en la base..." oninput="renderBase()">
    </div>
    <div id="baseVista"></div>
  `;
  renderBase(headers);
}

function renderBase(headersParam) {
  const q = limpiar(document.getElementById("filtroBase")?.value).toLowerCase();
  const headers = headersParam || Object.keys(dataBI[0] || {});
  const data = dataBI.filter(r => !q || Object.values(r).join(" ").toLowerCase().includes(q));
  document.getElementById("baseVista").innerHTML = tabla(headers, data.slice(0, 1500).map(r => `
    <tr>${headers.map(h => `<td>${limpiar(r[h])}</td>`).join("")}</tr>
  `));
}

function prepararContenidoReporte() {
  const origen = document.getElementById("modulo");
  const destino = document.getElementById("visorReporteContenido");
  if (!origen || !destino) return false;
  destino.innerHTML = origen.innerHTML;
  destino.querySelectorAll("[id]").forEach((el, index) => {
    el.id = `visor_${el.id}_${index}`;
  });
  return true;
}

function abrirVistaReporte() {
  const visor = document.getElementById("visorReporte");
  if (!visor || !prepararContenidoReporte()) return;
  visor.classList.remove("maximized");
  visor.hidden = false;
  actualizarBotonMaximizarReporte();
  document.body.classList.add("report-viewer-open");
}

function actualizarBotonMaximizarReporte() {
  const visor = document.getElementById("visorReporte");
  const boton = document.getElementById("btnMaximizarReporte");
  if (!visor || !boton) return;
  const maximizado = visor.classList.contains("maximized") || document.fullscreenElement === visor;
  boton.textContent = maximizado ? "Restaurar" : "Maximizar";
}

async function alternarMaximizarReporte() {
  const visor = document.getElementById("visorReporte");
  if (!visor || visor.hidden) return;
  const maximizado = visor.classList.contains("maximized") || document.fullscreenElement === visor;
  if (maximizado) {
    visor.classList.remove("maximized");
    if (document.fullscreenElement && document.exitFullscreen) {
      try { await document.exitFullscreen(); } catch {}
    }
  } else {
    visor.classList.add("maximized");
    if (visor.requestFullscreen) {
      try { await visor.requestFullscreen(); } catch {}
    }
  }
  actualizarBotonMaximizarReporte();
}

async function cerrarVistaReporte() {
  const visor = document.getElementById("visorReporte");
  const destino = document.getElementById("visorReporteContenido");
  if (document.fullscreenElement && document.exitFullscreen) {
    try { await document.exitFullscreen(); } catch {}
  }
  if (visor) {
    visor.hidden = true;
    visor.classList.remove("maximized");
  }
  if (destino) destino.innerHTML = "";
  actualizarBotonMaximizarReporte();
  document.body.classList.remove("report-viewer-open");
}

document.addEventListener("fullscreenchange", () => {
  const visor = document.getElementById("visorReporte");
  if (visor && !document.fullscreenElement) {
    visor.classList.remove("maximized");
  }
  actualizarBotonMaximizarReporte();
});

function exportarPdfReporte() {
  const visor = document.getElementById("visorReporte");
  const estabaAbierto = Boolean(visor && !visor.hidden);
  if (!estabaAbierto) abrirVistaReporte();
  document.body.classList.add("report-printing");
  const restaurar = () => {
    document.body.classList.remove("report-printing");
    if (!estabaAbierto) cerrarVistaReporte();
    window.removeEventListener("afterprint", restaurar);
  };
  window.addEventListener("afterprint", restaurar);
  setTimeout(() => window.print(), 120);
}

function exportarImagen(id, nombre) {
  if (typeof html2canvas === "undefined") return alert("No se cargo html2canvas");
  const el = document.getElementById(id);
  if (!el) return alert("No se encontro la seccion");
  const ancho = Math.max(el.scrollWidth, el.offsetWidth);
  html2canvas(el, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    width: ancho,
    windowWidth: ancho,
    onclone: documento => {
      documento.querySelectorAll(".provider-compact").forEach(panel => {
        panel.style.maxHeight = "none";
        panel.style.overflow = "visible";
      });
      documento.querySelectorAll("details").forEach(detalle => {
        detalle.removeAttribute("open");
      });
      documento.querySelectorAll(".provider-filter-menu").forEach(menu => {
        menu.style.display = "none";
      });
    }
  }).then(canvas => {
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${nombre}.png`;
    a.click();
  });
}

