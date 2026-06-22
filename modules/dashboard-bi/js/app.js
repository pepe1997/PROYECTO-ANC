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
  const partes = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!partes) return null;
  return new Date(Number(partes[3]), Number(partes[2]) - 1, Number(partes[1]), Number(partes[4] || 0), Number(partes[5] || 0));
}

function fechaValorPedido(valor) {
  const texto = limpiar(valor);
  if (!texto) return null;
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(texto)) return fechaValor(texto);

  const partes = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!partes) return fechaValor(texto);

  const primero = Number(partes[1]);
  const segundo = Number(partes[2]);
  const anio = Number(partes[3]);
  const hora = Number(partes[4] || 0);
  const minuto = Number(partes[5] || 0);
  const candidatos = [];

  if (primero >= 1 && primero <= 12 && segundo >= 1 && segundo <= 31) {
    candidatos.push(new Date(anio, primero - 1, segundo, hora, minuto));
  }
  if (segundo >= 1 && segundo <= 12 && primero >= 1 && primero <= 31) {
    candidatos.push(new Date(anio, segundo - 1, primero, hora, minuto));
  }

  const validos = candidatos.filter(fecha =>
    fecha.getFullYear() === anio &&
    fecha.getHours() === hora &&
    fecha.getMinutes() === minuto
  );
  if (!validos.length) return fechaValor(texto);

  const hoy = new Date();
  hoy.setHours(23, 59, 59, 999);
  const noFuturos = validos.filter(fecha => fecha <= hoy);
  const base = noFuturos.length ? noFuturos : validos;
  return base.sort((a, b) => Math.abs(hoy - a) - Math.abs(hoy - b))[0];
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

function descripcionIniciaConFruta(descripcion) {
  const texto = normalizar(descripcion).replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const frutas = [
    "FRUTA", "FRUTAS", "PLATANO", "BANANO", "BANANA", "PERA", "PERAS", "MANZANA", "MANZANAS",
    "NARANJA", "NARANJAS", "MANDARINA", "MANDARINAS", "LIMON", "LIMONES", "FRESA", "FRESAS",
    "UVA", "UVAS", "MANGO", "MANGOS", "PINA", "PINIA", "PALTA", "PALTAS", "SANDIA",
    "MELON", "PAPAYA", "DURAZNO", "GRANADILLA", "MARACUYA", "KIWI", "CIRUELA", "CHIRIMOYA"
  ].map(normalizar);
  return frutas.some(fruta => texto === fruta || texto.startsWith(`${fruta} `));
}

function pickingEsValido(row) {
  const orden = normalizar(row.orden);
  const descripcion = normalizar(row.descripcion);
  if (normalizar(row.tipo) === "FULL-CONTAINER") return false;
  if (normalizar(row.lpn).startsWith("ILE")) return false;
  if (orden.startsWith("TFC")) return false;
  if (orden.startsWith("TRF") && descripcion.startsWith("JABA")) return false;
  if (descripcionIniciaConFruta(row.descripcion)) return false;
  return true;
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

function selectFiltro(id, label, opciones, valor) {
  return `
    <label class="filter-label">${label}
      <select id="${id}" onchange="renderPicking()">
        <option value="">Todos</option>
        ${opciones.map(op => `<option value="${op}" ${op === valor ? "selected" : ""}>${op}</option>`).join("")}
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
      ${selectFiltro("filtroUsuarioPicking", "Usuario", opcionesFiltro(data, r => r.usuario), filtros.usuario)}
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
  const rows = data.map(r => [r.fechaTexto, r.turno, r.hora !== null ? `${r.hora}:00` : "", r.usuario, r.lpn, r.orden, r.destino, r.local, r.tipo, r.codigo, r.codAlterno, r.descripcion, r.bultos]);
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
      asn,
      lpn: limpiar(campo(r, ["LPN", "NRO LPN", "PALLET", "NroPallet"])),
      codigo: limpiar(campo(r, ["CODIGO", "PRODUCTO"])),
      codAlterno: limpiar(campo(r, ["COD ALTER", "COD ALTERN", "COD_ALTER"])),
      descripcion: limpiar(campo(r, ["DESCRIPCION", "Descripcion"])),
      programado: num(campo(r, ["BULTOS PROGRAMADOS", "BULTOS PROG", "PROGRAMADO"])),
      recibido: num(campo(r, ["BULTOS RECIBIDOS", "BULTOS REC", "RECIBIDO"])),
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

function resumenRecepcion(data) {
  const pallets = palletsRecepcion(data);
  const totalProgramado = data.reduce((a, b) => a + b.programado, 0);
  const totalRecibido = data.reduce((a, b) => a + b.recibido, 0);
  const asnUnicos = new Set(data.map(r => r.asn).filter(Boolean)).size;
  const pallets917 = pallets.filter(p => p.codigoProveedor === "917");
  const data917 = data.filter(r => r.codigoProveedor === "917");
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
  const mapa = new Map();
  data.forEach(r => {
    const key = r.proveedorKey;
    if (!mapa.has(key)) {
      mapa.set(key, {
        codigo: r.codigoProveedor,
        proveedor: r.proveedor,
        programado: 0,
        recibido: 0,
        registros: 0,
        asns: new Set()
      });
    }
    const item = mapa.get(key);
    item.programado += r.programado;
    item.recibido += r.recibido;
    item.registros += 1;
    if (r.asn) item.asns.add(r.asn);
  });
  return Array.from(mapa.values()).map(x => ({
    ...x,
    diferencia: x.programado - x.recibido,
    cumplimiento: pctCumplimiento(x.recibido, x.programado),
    asnUnicos: x.asns.size
  })).sort((a, b) => b.recibido - a.recibido);
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
  return hora >= 7 && hora < 21 ? "DIA" : "NOCHE";
}

function modeloDespacho() {
  return (dataDespacho || []).map((r, index) => {
    const fecha = fechaValor(campo(r, ["Fe y Hr de Despacho", "FECHA DESPACHO", "Fecha Despacho", "Fecha Modif"]));
    const horaRaw = campo(r, ["Hora", "HORA"]);
    const hora = horaRaw !== "" ? Math.trunc(num(horaRaw)) : horaFecha(fecha);
    const destino = limpiar(campo(r, ["Destino", "DESTINO", "Cod Destino"]));
    const local = limpiar(campo(r, ["Nombre Destino", "LOCAL", "TIENDA"])) || "SIN DESTINO";
    return {
      index,
      sucursal: limpiar(campo(r, ["Sucursal", "CENTRO DISTRIBUCION", "CD"])),
      pallet: limpiar(campo(r, ["NroPallet", "NRO PALLET", "PALLET"])),
      lpn: limpiar(campo(r, ["Nro LPNs", "NRO LPNS", "LPN"])),
      estado: limpiar(campo(r, ["Estado LPN", "ESTADO LPN"])) || "SIN ESTADO",
      producto: limpiar(campo(r, ["Producto", "CODIGO", "PRODUCTO"])),
      bultos: num(campo(r, ["Bultos", "BULTOS"])),
      carga: limpiar(campo(r, ["Nro Carga", "NRO CARGA", "CARGA"])),
      destino,
      local,
      destinoKey: destino ? `${destino} | ${local}` : local,
      fecha,
      fechaTexto: fechaCorta(fecha),
      hora,
      turno: turnoDespachoPorHora(hora),
      jerarquia: limpiar(campo(r, ["Jerarq1", "JERARQ1", "JERARQUIA"])) || "SIN JERARQUIA",
      tipoDistribucion: limpiar(campo(r, ["Tipo Distribucion", "TIPO DISTRIBUCION"])),
      orden: limpiar(campo(r, ["Nro Orden", "NRO ORDEN"]))
    };
  }).filter(r => r.bultos > 0);
}

function palletsDespacho(data) {
  const mapa = new Map();
  data.forEach(r => {
    if (!r.pallet) return;
    const key = r.pallet;
    if (!mapa.has(key)) {
      mapa.set(key, { pallet: r.pallet, bultos: 0, productos: new Set(), destinos: new Set(), cargas: new Set(), turno: r.turno });
    }
    const item = mapa.get(key);
    item.bultos += r.bultos;
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

function resumenDespacho(data) {
  const pallets = palletsDespacho(data);
  const totalBultos = data.reduce((a, b) => a + b.bultos, 0);
  const cargas = new Set(data.map(r => r.carga).filter(Boolean)).size;
  const turnos = agruparSum(data, r => r.turno, r => r.bultos);
  const porTurno = {};
  ["DIA", "NOCHE"].forEach(turno => {
    const rows = data.filter(r => r.turno === turno);
    const palletsTurno = palletsDespacho(rows);
    porTurno[turno] = {
      bultos: rows.reduce((a, b) => a + b.bultos, 0),
      pallets: palletsTurno.length,
      viajes: new Set(rows.map(r => r.carga).filter(Boolean)).size,
      bultosPallet: rows.reduce((a, b) => a + b.bultos, 0) / Math.max(palletsTurno.length, 1)
    };
  });
  return {
    pallets,
    totalBultos,
    palletsTotal: pallets.length,
    viajes: cargas,
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
              <b>${fmt(x.bultosPallet)}<small>Bultos x pallet</small></b>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function verDespacho() {
  const data = modeloDespacho();
  const resumen = resumenDespacho(data);
  const destinos = agruparSum(data, r => r.destinoKey, r => r.bultos);
  const jerarquias = agruparSum(data, r => r.jerarquia, r => r.bultos);
  const cargas = agruparSum(data, r => r.carga || "SIN CARGA", r => r.bultos);
  const destinosUnicos = new Set(data.map(r => r.destinoKey).filter(Boolean)).size;
  const cargaPrincipal = cargas[0];

  document.getElementById("modulo").innerHTML = `
    <section class="hero despacho-hero">
      <div>
        <span>Reporte operativo</span>
        <h2>Despacho</h2>
      </div>
      <div class="hero-metric">
        <strong>${fmt(resumen.totalBultos)}</strong>
        <span>Bultos despachados</span>
      </div>
    </section>

    <section class="kpi-grid">
      ${kpi("Bultos total", fmt(resumen.totalBultos), "General", "accent")}
      ${kpi("Pallets", fmt(resumen.palletsTotal))}
      ${kpi("Viajes", fmt(resumen.viajes))}
      ${kpi("Bultos x pallet", fmt(resumen.bultosPallet))}
      ${kpi("Destinos", fmt(destinosUnicos))}
      ${kpi("Carga principal", fmt(cargaPrincipal?.valor || 0), corto(cargaPrincipal?.label || "-"), "warn")}
    </section>

    ${turnoDespachoCards(resumen)}

    <section class="dashboard-grid">
      <div class="card wide visual-suite">
        <div class="card-title">
          <h2>Vista grafica Despacho</h2>
          <span>Turno, pallets y principales destinos</span>
        </div>
        <div class="visual-combo">
          <div class="visual-box">
            <h3>Bultos por turno</h3>
            ${pieChart(resumen.turnos, resumen.totalBultos, fmt(resumen.totalBultos))}
          </div>
          <div class="visual-box">
            <h3>Bultos por jerarquia</h3>
            ${pieChart(jerarquias.slice(0, 6), resumen.totalBultos, fmt(resumen.totalBultos))}
          </div>
          <div class="visual-box bars-box">
            <h3>Top destinos</h3>
            ${verticalBars(destinos.slice(0, 8), resumen.totalBultos)}
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Jerarquias</h2>
        ${barras(jerarquias.slice(0, 8), resumen.totalBultos)}
      </div>

      <div class="card">
        <h2>Destinos clave</h2>
        ${metricTiles(destinos.slice(0, 6), resumen.totalBultos)}
      </div>
    </section>
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

function modeloPedido() {
  const base = dataPedido || [];
  const firma = `${base.length}:${JSON.stringify(base[0] || {})}:${JSON.stringify(base[base.length - 1] || {})}`;
  if (modeloPedido.cache && modeloPedido.firma === firma) return modeloPedido.cache;

  modeloPedido.firma = firma;
  const rows = base.map((r, index) => {
    const fecha = fechaValorPedido(campo(r, ["Fecha Orden", "FECHA ORDEN", "Fecha", "FECHA"]));
    return {
      index,
      fecha,
      fechaTexto: fechaCorta(fecha),
      orden: limpiar(campo(r, ["Nro Orden", "NRO ORDEN", "ORDEN"])),
      estado: limpiar(campo(r, ["Estado", "ESTADO"])) || "SIN ESTADO",
      producto: limpiar(campo(r, ["Producto", "CODIGO", "CODIGO PRODUCTO"])),
      codAlterno: limpiar(campo(r, ["Cod Alternat", "COD ALTERNAT", "COD ALTER"])),
      descripcion: limpiar(campo(r, ["Descripcion", "DESCRIPCION"])),
      tienda: limpiar(campo(r, ["Tienda", "LOCAL", "Nombre Destino"])) || "SIN TIENDA",
      pedido: num(campo(r, ["Bultos Ped", "BULTOS_PEDIDO", "BULTOS PED", "UniOrden"])),
      asignado: num(campo(r, ["Bultos Asig", "BULTOS_ASIGNADOS", "BULTOS ASIG", "Un Asig"])),
      picking: num(campo(r, ["Bultos Emp", "BULTOS_EMP", "BULTOS PICKING", "Un Emp"])),
      despacho: num(campo(r, ["Bultos Env", "BULTOS_ENV", "BULTOS DESPACHO", "Un Env"])),
      noAsignadoFuente: num(campo(r, ["Bultos No Asig", "BULTOS_NO_ASIGNADO", "BULTOS NO ASIG", "Un No asignadas"]))
    };
  }).filter(r => r.pedido || r.asignado || r.picking || r.despacho || r.noAsignadoFuente);

  const asignadoPorFecha = new Map();
  rows.forEach(r => {
    const key = r.fechaTexto || "SIN FECHA";
    asignadoPorFecha.set(key, (asignadoPorFecha.get(key) || 0) + r.asignado);
  });

  modeloPedido.cache = rows.map(r => ({
    ...r,
    noAsignado: (asignadoPorFecha.get(r.fechaTexto || "SIN FECHA") || 0) > 0 ? r.noAsignadoFuente : 0
  }));
  pedidoCache = null;
  return modeloPedido.cache;
}

let pedidoFechaSeleccionada = "";
let pedidoCache = null;

function modeloUbicacionesNoAsignado() {
  return (dataUbicaciones || []).map(r => ({
    ubicacion: limpiar(campo(r, ["UBICACION", "Ubicacion"])) || "SIN UBICACION",
    codigo: limpiar(campo(r, ["CODIGO PRODUCTO", "CODIGO", "PRODUCTO"])),
    descripcion: limpiar(campo(r, ["DESCRIPCION", "Descripcion"])),
    bultos: num(campo(r, ["BULTOS REQUERIDOS", "BULTOS", "Bultos"]))
  })).filter(r => r.bultos > 0);
}

function resumenPedido(data) {
  const pedido = data.reduce((a, b) => a + b.pedido, 0);
  const asignado = data.reduce((a, b) => a + b.asignado, 0);
  const picking = data.reduce((a, b) => a + b.picking, 0);
  const despacho = data.reduce((a, b) => a + b.despacho, 0);
  const noAsignado = data.reduce((a, b) => a + b.noAsignado, 0);
  return {
    pedido,
    asignado,
    picking,
    despacho,
    noAsignado,
    asignable: pedido - noAsignado,
    pctAsignacion: pct(asignado, pedido),
    pctPicking: pct(picking, pedido),
    pctDespacho: pct(despacho, pedido),
    ordenes: new Set(data.map(r => r.orden).filter(Boolean)).size,
    tiendas: new Set(data.map(r => r.tienda).filter(Boolean)).size,
    productos: new Set(data.map(r => r.producto).filter(Boolean)).size
  };
}

function pedidoPorFecha(data) {
  const mapa = new Map();
  data.forEach(r => {
    const key = r.fechaTexto || "SIN FECHA";
    if (!mapa.has(key)) mapa.set(key, { label: key, pedido: 0, asignado: 0, picking: 0, despacho: 0, noAsignado: 0, valor: 0, registros: 0 });
    const x = mapa.get(key);
    x.pedido += r.pedido;
    x.asignado += r.asignado;
    x.picking += r.picking;
    x.despacho += r.despacho;
    x.noAsignado += r.noAsignado;
    x.valor += r.pedido;
    x.registros += 1;
  });
  return Array.from(mapa.values()).sort((a, b) => {
    const [da, ma, ya] = a.label.split("/").map(Number);
    const [db, mb, yb] = b.label.split("/").map(Number);
    return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
  });
}

function cachePedido() {
  const data = modeloPedido();
  if (pedidoCache && pedidoCache.rows === data) return pedidoCache;

  const porFecha = new Map();
  data.forEach(r => {
    const key = r.fechaTexto || "SIN FECHA";
    if (!porFecha.has(key)) porFecha.set(key, []);
    porFecha.get(key).push(r);
  });

  const fechas = pedidoPorFecha(data);
  const resumenGeneral = resumenPedido(data);
  const resumenPorFecha = new Map();
  const estadosPorFecha = new Map();
  const tiendasPorFecha = new Map();
  porFecha.forEach((rows, fecha) => {
    resumenPorFecha.set(fecha, resumenPedido(rows));
    estadosPorFecha.set(fecha, agruparSum(rows, r => r.estado, r => r.pedido));
    tiendasPorFecha.set(fecha, agruparSum(rows, r => r.tienda, r => r.pedido));
  });

  pedidoCache = {
    rows: data,
    porFecha,
    fechas,
    resumenGeneral,
    resumenPorFecha,
    estadosGeneral: agruparSum(data, r => r.estado, r => r.pedido),
    tiendasGeneral: agruparSum(data, r => r.tienda, r => r.pedido),
    estadosPorFecha,
    tiendasPorFecha,
    noAsignadoUbi: agruparSum(modeloUbicacionesNoAsignado(), r => r.ubicacion, r => r.bultos)
  };
  return pedidoCache;
}

function filtrarPedidoPorFecha(data) {
  if (!pedidoFechaSeleccionada) return data;
  return cachePedido().porFecha.get(pedidoFechaSeleccionada) || [];
}

function seleccionarFechaPedido(fecha) {
  pedidoFechaSeleccionada = pedidoFechaSeleccionada === fecha ? "" : fecha;
  renderPedidoOperacional();
}

function flujoPedidoPanel(resumen) {
  const pasos = [
    { label: "Pedido", valor: resumen.pedido },
    { label: "Asignado", valor: resumen.asignado },
    { label: "Picking", valor: resumen.picking },
    { label: "Despacho", valor: resumen.despacho },
    { label: "No asignado", valor: resumen.noAsignado }
  ];
  return `
    <article class="visual-panel main-chart">
      <div class="visual-panel-head">
        <h3>FLUJO DEL PEDIDO</h3>
        <span>${fmt(resumen.pedido)}</span>
      </div>
      <div class="pedido-flow">
        ${pasos.map((p, i) => `
          <div class="pedido-step ${i === pasos.length - 1 ? "warn" : ""}">
            <strong>${fmt(p.valor)}</strong>
            <span>${p.label}</span>
            <div><i style="width:${Math.min(100, pct(p.valor, resumen.pedido))}%"></i></div>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function verPedidoCompacto() {
  const cache = cachePedido();
  const data = cache.rows;
  const dataVista = filtrarPedidoPorFecha(data);
  const resumen = pedidoFechaSeleccionada ? (cache.resumenPorFecha.get(pedidoFechaSeleccionada) || resumenPedido(dataVista)) : cache.resumenGeneral;
  const resumenGeneral = cache.resumenGeneral;
  const fechas = cache.fechas.map(x => ({ label: x.label.slice(0, 5), valor: x.pedido }));
  const noAsignadoUbi = cache.noAsignadoUbi;
  const fechasTabla = cache.fechas;

  document.getElementById("modulo").innerHTML = `
    <section class="visual-sheet pedido-compact">
      <div class="visual-header pedido">
        <div><h2>INDICADORES DE PEDIDO ${pedidoFechaSeleccionada ? pedidoFechaSeleccionada : ""}</h2><span>Control de asignacion, picking, despacho y pendientes</span></div>
        <div class="visual-kpi-row">
          ${visualKpi("PEDIDO", fmt(resumen.pedido))}
          ${visualKpi("ASIGNADO", fmt(resumen.asignado))}
          ${visualKpi("DESPACHO", fmt(resumen.despacho))}
          ${visualKpi("NO ASIGNADO", fmt(resumen.noAsignado))}
        </div>
      </div>
      <div class="pedido-highlights">
        <div><span>Ordenes</span><strong>${fmt(resumen.ordenes)}</strong></div>
        <div><span>Tiendas</span><strong>${fmt(resumen.tiendas)}</strong></div>
        <div><span>Productos</span><strong>${fmt(resumen.productos)}</strong></div>
        <div class="alert"><span>No asignado</span><strong>${fmt(resumen.noAsignado)}</strong><small>${pct(resumen.noAsignado, resumen.pedido).toFixed(1)}% del pedido</small></div>
      </div>
      <div class="pedido-main-grid">
        ${visualLine("TENDENCIA DEL PEDIDO", fechas, resumen.pedido, "#2563eb", true)}
        <article class="visual-panel pedido-pending-card">
          <span>NO ASIGNADO</span>
          <strong>${fmt(resumen.noAsignado)}</strong>
          <em>Bultos pendientes</em>
          <div><b>${pct(resumen.noAsignado, resumen.pedido).toFixed(1)}%</b><small>del pedido seleccionado</small></div>
        </article>
      </div>
      <div class="visual-gauge-row pedido-gauges">
        ${visualGauge("ASIGNACION", resumen.asignado, resumen.pedido, "#22c55e")}
        ${visualGauge("PICKING", resumen.picking, resumen.pedido, "#2563eb")}
        ${visualGauge("DESPACHO", resumen.despacho, resumen.pedido, "#6d28d9")}
        ${visualGauge("NO ASIG.", resumen.noAsignado, resumen.pedido, "#ef4444")}
      </div>
      <div class="pedido-bottom-grid">
        <article class="visual-panel main-chart">
          <div class="visual-panel-head">
            <h3>RESUMEN POR FECHA</h3>
            <span>${pedidoFechaSeleccionada ? "Filtro activo" : "Clic para filtrar"}</span>
          </div>
          ${tabla(["Fecha", "Pedido", "Asignado", "Picking", "Despacho", "No asignado"], fechasTabla.map(f => `
            <tr class="clickable-row ${pedidoFechaSeleccionada === f.label ? "selected-row" : ""}" onclick="pedidoFechaSeleccionada = pedidoFechaSeleccionada === '${f.label}' ? '' : '${f.label}'; verPedidoCompacto();">
              <td><strong>${f.label}</strong></td>
              <td class="number">${fmt(f.pedido)}</td>
              <td>${fmt(f.asignado)}</td>
              <td>${fmt(f.picking)}</td>
              <td>${fmt(f.despacho)}</td>
              <td>${fmt(f.noAsignado)}</td>
            </tr>
          `))}
        </article>
        ${noAsignadoPorFechaPanel(fechasTabla.map(x => ({ label: x.label.slice(0, 5), valor: x.noAsignado })), Math.max(resumenGeneral.noAsignado, 1))}
      </div>
    </section>
  `;
}

function verPedido() {
  pedidoFechaSeleccionada = "";
  document.getElementById("modulo").innerHTML = `<div id="pedidoOperacionalVista"></div>`;
  renderPedidoOperacional();
}

function renderPedidoOperacional() {
  const cache = cachePedido();
  const data = cache.rows;
  const dataVista = filtrarPedidoPorFecha(data);
  const resumen = pedidoFechaSeleccionada ? (cache.resumenPorFecha.get(pedidoFechaSeleccionada) || resumenPedido(dataVista)) : cache.resumenGeneral;
  const fechas = cache.fechas;
  const estados = pedidoFechaSeleccionada ? (cache.estadosPorFecha.get(pedidoFechaSeleccionada) || []) : cache.estadosGeneral;
  const tiendas = pedidoFechaSeleccionada ? (cache.tiendasPorFecha.get(pedidoFechaSeleccionada) || []) : cache.tiendasGeneral;
  const noAsignadoUbi = cache.noAsignadoUbi;

  document.getElementById("pedidoOperacionalVista").innerHTML = `
    <section class="hero pedido-hero">
      <div>
        <span>Dashboard operacional</span>
        <h2>Pedido ${pedidoFechaSeleccionada ? pedidoFechaSeleccionada : ""}</h2>
      </div>
      <div class="hero-metric">
        <strong>${fmt(resumen.pedido)}</strong>
        <span>Bultos pedido</span>
      </div>
    </section>
    <section class="kpi-grid">
      ${kpi("Pedido", fmt(resumen.pedido), "Total", "accent")}
      ${kpi("Asignado", fmt(resumen.asignado), `${resumen.pctAsignacion.toFixed(1)}%`)}
      ${kpi("Picking", fmt(resumen.picking), `${resumen.pctPicking.toFixed(1)}%`)}
      ${kpi("Despacho", fmt(resumen.despacho), `${resumen.pctDespacho.toFixed(1)}%`)}
      ${kpi("No asignado", fmt(resumen.noAsignado), "Pendiente", "warn")}
      ${kpi("Ordenes", fmt(resumen.ordenes))}
    </section>
    <section class="dashboard-grid">
      <div class="card wide">
        <div class="card-title"><h2>Resumen por fecha</h2><span>${fmt(fechas.length)} dias</span></div>
        ${tabla(["Fecha", "Pedido", "Asignado", "Picking", "Despacho", "No asignado"], fechas.map(f => `
          <tr class="clickable-row ${pedidoFechaSeleccionada === f.label ? "selected-row" : ""}" onclick="seleccionarFechaPedido('${f.label}')">
            <td><strong>${f.label}</strong></td>
            <td class="number">${fmt(f.pedido)}</td>
            <td>${fmt(f.asignado)}</td>
            <td>${fmt(f.picking)}</td>
            <td>${fmt(f.despacho)}</td>
            <td>${fmt(f.noAsignado)}</td>
          </tr>
        `))}
      </div>
      <div class="card">
        <h2>Estado pedido</h2>
        ${pieChart(estados.slice(0, 6), resumen.pedido, fmt(resumen.pedido))}
      </div>
      <div class="card">
        <h2>Ubicacion no asignado</h2>
        ${pieChart(noAsignadoUbi, Math.max(resumen.noAsignado, noAsignadoUbi.reduce((a, b) => a + b.valor, 0)), fmt(resumen.noAsignado))}
      </div>
      <div class="card wide">
        <h2>Top tiendas pedido</h2>
        ${barrasHorizontales(tiendas.slice(0, 10), resumen.pedido)}
      </div>
    </section>
  `;
}

function verPedidoRanking() {
  const data = modeloPedido();
  const resumen = resumenPedido(data);
  const tiendas = agruparSum(data, r => r.tienda, r => r.pedido);
  const productos = agruparSum(data, r => `${r.producto} | ${r.descripcion || "SIN DESCRIPCION"}`, r => r.pedido);
  const noAsignadoProductos = agruparSum(data.filter(r => r.noAsignado > 0), r => `${r.producto} | ${r.descripcion || "SIN DESCRIPCION"}`, r => r.noAsignado);
  const estados = agruparSum(data, r => r.estado, r => r.pedido);

  document.getElementById("modulo").innerHTML = `
    <section class="hero pedido-hero">
      <div>
        <span>Ranking operativo</span>
        <h2>Pedido</h2>
      </div>
      <div class="hero-metric">
        <strong>${fmt(resumen.pedido)}</strong>
        <span>Bultos pedido</span>
      </div>
    </section>
    <section class="dashboard-grid">
      <div class="card">
        <h2>Estados</h2>
        ${barras(estados.slice(0, 10), resumen.pedido)}
      </div>
      <div class="card">
        <h2>Top tiendas</h2>
        ${barras(tiendas.slice(0, 10), resumen.pedido)}
      </div>
      <div class="card wide">
        <div class="card-title"><h2>Productos con mas pedido</h2><span>Top 10</span></div>
        ${barrasHorizontales(productos.slice(0, 10), resumen.pedido)}
      </div>
      <div class="card wide">
        <div class="card-title"><h2>Productos no asignados</h2><span>Top 10</span></div>
        ${barrasHorizontales(noAsignadoProductos.slice(0, 10), Math.max(resumen.noAsignado, 1))}
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
  const visibles = proveedoresRecepcionEjecutivoVisibles(proveedores);
  return `
    <div class="executive-provider-filter">
      <div>
        <strong>${fmt(visibles.length)} proveedores visibles</strong>
        <span>Los indicadores de recepcion se calculan con la seleccion.</span>
      </div>
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

function pickingEjecutivoPanel(turnos, total, promedioHora) {
  const valorTurno = turno => turnos.find(x => x.label === turno)?.valor || 0;
  return `
    <div class="executive-picking-summary">
      <div class="executive-total-card">
        <span>Total picking</span>
        <strong>${fmt(total)}</strong>
        <small>Bultos procesados</small>
      </div>
      <div class="executive-summary-cards">
        ${executiveMetric("DIA", fmt(valorTurno("DIA")), `${pct(valorTurno("DIA"), total).toFixed(1)}% del total`)}
        ${executiveMetric("TARDE", fmt(valorTurno("TARDE")), `${pct(valorTurno("TARDE"), total).toFixed(1)}% del total`)}
        ${executiveMetric("NOCHE", fmt(valorTurno("NOCHE")), `${pct(valorTurno("NOCHE"), total).toFixed(1)}% del total`)}
        ${executiveMetric("PROMEDIO / HORA", fmt(promedioHora), "Por hora activa")}
      </div>
    </div>
  `;
}

function despachoEjecutivoPanel(resumen) {
  return `
    <div class="executive-dispatch-totals">
      ${executiveMetric("BULTOS TOTALES", fmt(resumen.totalBultos))}
      ${executiveMetric("PALLETS TOTALES", fmt(resumen.palletsTotal))}
      ${executiveMetric("VIAJES TOTALES", fmt(resumen.viajes))}
      ${executiveMetric("BULTOS / PALLET", fmt(resumen.bultosPallet))}
    </div>
    ${despachoTurnoPanel(resumen)}
  `;
}

function verResumenEjecutivo() {
  const picking = modeloPicking();
  const recepcion = modeloRecepcion();
  const despacho = modeloDespacho();

  const totalPicking = picking.reduce((a, b) => a + b.bultos, 0);
  const pickTurnos = agruparSum(picking, r => r.turno, r => r.bultos);
  const pickHoras = promedioPickingPorHora(picking);
  const pickPromedioHora = totalPicking / Math.max(pickHoras.length, 1);

  const recepProveedores = resumenProveedoresRecepcion(recepcion);
  const recepProveedoresVisibles = proveedoresRecepcionEjecutivoVisibles(recepProveedores);
  const clavesRecepcionVisibles = new Set(recepProveedoresVisibles.map(p => `${p.codigo} | ${p.proveedor}`));
  const recepcionVisible = recepcion.filter(r => clavesRecepcionVisibles.has(r.proveedorKey));
  const resRecep = resumenRecepcion(recepcionVisible);

  const resDesp = resumenDespacho(despacho);

  document.getElementById("modulo").innerHTML = `
    <section class="visual-sheet executive-main">
      <div class="visual-header executive">
        <h2>PANEL EJECUTIVO OPERACIONAL</h2>
        <div class="visual-kpi-row">
          ${visualKpi("PICKING", fmt(totalPicking))}
          ${visualKpi("RECEPCION", fmt(resRecep.totalRecibido))}
          ${visualKpi("DESPACHO", fmt(resDesp.totalBultos))}
          ${visualKpi("FECHA", new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" }))}
        </div>
      </div>

      <div class="executive-visual-grid">
        <article class="visual-panel executive-column executive-picking">
          <div class="visual-panel-head">
            <h3>PICKING</h3>
            <span>Cantidades por turno</span>
          </div>
          ${pickingEjecutivoPanel(pickTurnos, totalPicking, pickPromedioHora)}
        </article>

        <article class="visual-panel executive-column executive-reception">
          <div class="visual-panel-head">
            <h3>RECEPCION</h3>
            <span>${resRecep.cumplimiento.toFixed(1)}% cumplimiento</span>
          </div>
          ${filtroProveedoresRecepcionEjecutivo(recepProveedores)}
          ${providerCompactPanel(recepProveedoresVisibles)}
        </article>

        <article class="visual-panel executive-column executive-dispatch">
          <div class="visual-panel-head">
            <h3>DESPACHO</h3>
            <span>Totales y detalle por turno</span>
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

function pedidoFechaResumenes() {
  const data = modeloPedido();
  const porFecha = new Map();
  data.forEach(r => {
    const key = keyFecha(r.fecha);
    if (!key) return;
    if (!porFecha.has(key)) porFecha.set(key, []);
    porFecha.get(key).push(r);
  });
  const keys = Array.from(porFecha.keys()).sort((a, b) => fechaDesdeKey(a) - fechaDesdeKey(b));
  const ultimoKey = keys[keys.length - 1] || "";
  const fechaAnterior = fechaDesdeKey(ultimoKey);
  if (fechaAnterior) fechaAnterior.setDate(fechaAnterior.getDate() - 1);
  const anteriorKeyCalendario = keyFecha(fechaAnterior);
  const anteriorKey = porFecha.has(anteriorKeyCalendario) ? anteriorKeyCalendario : (keys[keys.length - 2] || "");
  const dataSinUltimaFecha = data.filter(r => keyFecha(r.fecha) !== ultimoKey);
  return {
    general: resumenPedido(data),
    generalSinUltimaFecha: resumenPedido(dataSinUltimaFecha),
    ultimoKey,
    anteriorKey,
    ultimo: resumenPedido(porFecha.get(ultimoKey) || []),
    anterior: resumenPedido(porFecha.get(anteriorKey) || [])
  };
}

function fechaReporteLabel(key) {
  const fecha = fechaDesdeKey(key);
  if (!fecha) return "-";
  return `${String(fecha.getDate()).padStart(2, "0")}/${String(fecha.getMonth() + 1).padStart(2, "0")}/${fecha.getFullYear()}`;
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
  const dia = resumen.porTurno.DIA || { bultos: 0, pallets: 0, viajes: 0, bultosPallet: 0 };
  const noche = resumen.porTurno.NOCHE || { bultos: 0, pallets: 0, viajes: 0, bultosPallet: 0 };
  return `
    <table class="general-mini-table despacho-general-table">
      <thead><tr><th></th><th>Dia</th><th>Noche</th><th>Total</th></tr></thead>
      <tbody>
        <tr><td>Viajes</td><td>${fmt(dia.viajes)}</td><td>${fmt(noche.viajes)}</td><td><strong>${fmt(resumen.viajes)}</strong></td></tr>
        <tr><td>Pallets</td><td>${fmt(dia.pallets)}</td><td>${fmt(noche.pallets)}</td><td><strong>${fmt(resumen.palletsTotal)}</strong></td></tr>
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
  const pedido = pedidoFechaResumenes();
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

        <article class="general-block pedido-operativo-block">
          <h3>PICKING</h3>
          <div class="general-stack-card">
            ${generalValueBox(fmt(totalPicking), "TOTAL PICKING", "Data PICKING", "blue")}
            ${generalValueBox(fmt(pedido.anterior.pedido), "BULTOS PEDIDO", `Fecha ${fechaReporteLabel(pedido.anteriorKey)}`, "blue")}
            ${generalValueBox(fmt(pedido.anterior.asignado), "ASIGNADO", `Fecha ${fechaReporteLabel(pedido.anteriorKey)}`, "green")}
          </div>
        </article>

        <article class="general-block pedido-block">
          <h3>PEDIDO</h3>
          <div class="general-date-line"><span>FECHA :</span><strong>${fechaCorta(new Date())}</strong></div>
          <div class="general-pedido-boxes">
            ${generalValueBox(fmt(pedido.ultimo.pedido), "BULTOS PEDIDO", "Ultima fecha", "blue")}
            ${generalValueBox(fmt(pedido.generalSinUltimaFecha.noAsignado), "NO ASIGNADO", "Sin considerar la ultima fecha", "red")}
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

function visualKpi(label, value, tone = "") {
  return `
    <article class="visual-kpi ${tone}">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `;
}

function visualGauge(label, value, max, color = "#2563eb") {
  const p = Math.max(0, Math.min(100, pct(value, max)));
  const radio = 42;
  const circ = Math.PI * radio;
  const largo = (p / 100) * circ;
  const restante = Math.max(0, circ - largo);
  return `
    <article class="visual-gauge">
      <h3>${label}</h3>
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

function noAsignadoPorFechaPanel(data, total) {
  const max = Math.max(...data.map(x => x.valor), 1);
  return `
    <article class="visual-panel main-chart pedido-no-asignado-chart">
      <div class="visual-panel-head">
        <div><h3>NO ASIGNADO POR FECHA</h3><span>Comparativo diario de bultos pendientes</span></div>
        <strong>${fmt(total)} <small>Total pendiente</small></strong>
      </div>
      <div class="pedido-pending-bars">
        ${data.map(x => {
          const porcentaje = Math.max(x.valor > 0 ? 3 : 1, pct(x.valor, max));
          return `
            <div class="pedido-pending-bar ${x.valor > 0 ? "active" : ""}">
              <strong>${fmt(x.valor)}</strong>
              <div><i style="height:${porcentaje}%"></i></div>
              <span>${x.label}</span>
              <small>${pct(x.valor, total).toFixed(1)}% del pendiente</small>
            </div>
          `;
        }).join("")}
      </div>
    </article>
  `;
}

function visualLine(title, data, total, color = "#2563eb", destacado = false) {
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
  return `
    <article class="visual-panel main-chart ${destacado ? "visual-line-highlighted" : ""}">
      <div class="visual-panel-head">
        <div>
          <h3>${title}</h3>
          ${destacado ? `<strong class="visual-line-total">${fmt(total)} <small>BULTOS TOTALES</small></strong>` : ""}
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
          ${points.map(p => `<circle cx="${p.x}" cy="${p.y}" r="5" style="fill:${color}"></circle>`).join("")}
        </svg>
        <div class="visual-line-axis">
          ${points.map(p => `<span><b>${fmt(p.valor)}</b><small>${p.label}</small></span>`).join("")}
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
        <span>${fmt(visibles.length)} de ${fmt(proveedores.length)} seleccionados. Los totales generales no cambian.</span>
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
        <h3>PROVEEDORES</h3>
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
        <span>Bultos, pallets, viajes y productividad</span>
      </div>
      <div class="dispatch-shifts">
        ${["DIA", "NOCHE"].map(turno => {
          const x = resumen.porTurno[turno];
          return `
            <div class="dispatch-shift-card">
              <strong>${turno}</strong>
              <div class="dispatch-big">${fmt(x.bultos)}</div>
              <span>Bultos</span>
              <div class="dispatch-mini">
                <b>${fmt(x.pallets)}<small>Pallets</small></b>
                <b>${fmt(x.viajes)}<small>Viajes</small></b>
                <b>${fmt(x.bultosPallet)}<small>Bultos/Pallet</small></b>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </article>
  `;
}

let turnoPickingCompacto = "TODOS";

function seleccionarTurnoPickingCompacto(turno) {
  turnoPickingCompacto = turno;
  verPickingCompacto();
}

function tarjetaDestajoTurno(turno, data, totalGeneral) {
  const filas = data.filter(r => r.turno === turno);
  const bultos = filas.reduce((a, b) => a + b.bultos, 0);
  const usuarios = new Set(filas.map(r => r.usuario).filter(Boolean)).size;
  const lpns = new Set(filas.map(r => r.lpn).filter(Boolean)).size;
  const horas = promedioPickingPorHora(filas);
  const porHora = horas.length ? bultos / horas.length : 0;
  const porUsuario = usuarios ? bultos / usuarios : 0;
  const tonos = { DIA: "green", TARDE: "gold", NOCHE: "purple" };
  return `
    <button class="picking-shift-card ${tonos[turno]} ${turnoPickingCompacto === turno ? "active" : ""}" onclick="seleccionarTurnoPickingCompacto('${turno}')">
      <span>${turno}</span>
      <strong>${fmt(bultos)}</strong>
      <em>Bultos pickeados</em>
      <div>
        <b>${fmt(porHora)}<small>Bultos / hora</small></b>
        <b>${fmt(porUsuario)}<small>Bultos / usuario</small></b>
        <b>${fmt(lpns)}<small>LPNs</small></b>
        <b>${pct(bultos, totalGeneral).toFixed(1)}%<small>Participacion</small></b>
      </div>
    </button>
  `;
}

function verPickingCompacto() {
  const dataGeneral = modeloPicking();
  const data = turnoPickingCompacto === "TODOS"
    ? dataGeneral
    : dataGeneral.filter(r => r.turno === turnoPickingCompacto);
  const totalGeneral = dataGeneral.reduce((a, b) => a + b.bultos, 0);
  const total = data.reduce((a, b) => a + b.bultos, 0);
  const horas = promedioPickingPorHora(data);
  const lpns = new Set(data.map(r => r.lpn).filter(Boolean)).size;
  const usuarios = agruparSum(data, r => r.usuario, r => r.bultos);
  const horaPico = horas.slice().sort((a, b) => b.valor - a.valor)[0];

  document.getElementById("modulo").innerHTML = `
    <section class="visual-sheet picking-compact">
      <div class="visual-header">
        <div>
          <h2>INDICADORES DE PICKING</h2>
          <span>Evaluacion de destajo: ${turnoPickingCompacto}</span>
        </div>
        <div class="visual-kpi-row">
          ${visualKpi(turnoPickingCompacto === "TODOS" ? "TOTAL PICKING" : `BULTOS ${turnoPickingCompacto}`, fmt(total))}
          ${visualKpi("USUARIOS", fmt(usuarios.length))}
          ${visualKpi("LPNS", fmt(lpns))}
          ${visualKpi("PROM. HORA", fmt(horas.length ? total / horas.length : 0))}
        </div>
      </div>
      <div class="picking-turn-control">
        <div class="picking-turn-buttons">
          ${["TODOS", "DIA", "TARDE", "NOCHE"].map(turno => `
            <button class="${turnoPickingCompacto === turno ? "active" : ""}" onclick="seleccionarTurnoPickingCompacto('${turno}')">${turno}</button>
          `).join("")}
        </div>
        <div class="picking-turn-highlights">
          <div><span>Turno evaluado</span><strong>${turnoPickingCompacto}</strong></div>
          <div><span>Top usuario</span><strong>${corto(usuarios[0]?.label || "-", 24)}</strong><small>${fmt(usuarios[0]?.valor || 0)} bultos</small></div>
          <div><span>Hora pico</span><strong>${horaPico?.label || "-"}</strong><small>${fmt(horaPico?.valor || 0)} bultos</small></div>
          <div><span>Participacion</span><strong>${pct(total, totalGeneral).toFixed(1)}%</strong><small>del picking general</small></div>
        </div>
      </div>
      <div class="picking-main-chart">
        ${visualLine(`AVANCE POR HORA - ${turnoPickingCompacto}`, horas.map(x => ({ label: x.label, valor: x.valor })), total, "#2563eb", true)}
      </div>
      <div class="picking-shift-grid">
        ${["DIA", "TARDE", "NOCHE"].map(turno => tarjetaDestajoTurno(turno, dataGeneral, totalGeneral)).join("")}
      </div>
    </section>
  `;
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
        <div><h2>INDICADORES DE RECEPCION</h2><span>Control general por proveedor</span></div>
        <div class="visual-kpi-row">
          ${visualKpi("RECIBIDO", fmt(resumen.totalRecibido))}
          ${visualKpi("PROGRAMADO", fmt(resumen.totalProgramado))}
          ${visualKpi("CUMPLIMIENTO", `${resumen.cumplimiento.toFixed(1)}%`)}
          ${visualKpi("PROVEEDORES", fmt(proveedoresVisibles.length))}
        </div>
      </div>
      ${filtroProveedoresRecepcion(proveedoresDetalle)}
      <div class="reception-provider-main">
        ${providerCompactPanel(proveedoresVisibles)}
      </div>
      <div class="reception-indicator-head">
        <div><h2>Indicadores de proveedores seleccionados</h2><span>Los calculos corresponden solamente a los proveedores visibles.</span></div>
      </div>
      <div class="visual-gauge-row reception-gauges">
        ${visualGauge("CUMPLIMIENTO", resumen.totalRecibido, resumen.totalProgramado, "#22c55e")}
        ${visualGauge("PUNTA NEGRA", resumen.recibido917, Math.max(resumen.totalRecibido, 1), "#2563eb")}
        ${visualGauge("MONO 917", resumen.mono917, Math.max(resumen.pallets917, 1), "#f59e0b")}
        ${visualGauge("MULTI 917", resumen.multi917, Math.max(resumen.pallets917, 1), "#ef4444")}
      </div>
    </section>
  `;
}

function verDespachoCompacto() {
  const data = modeloDespacho();
  const resumen = resumenDespacho(data);
  const turnos = resumen.turnos;
  const destinos = agruparSum(data, r => r.destinoKey, r => r.bultos);
  const jerarquias = agruparSum(data, r => r.jerarquia, r => r.bultos);
  const dia = turnos.find(x => x.label === "DIA")?.valor || 0;
  const noche = turnos.find(x => x.label === "NOCHE")?.valor || 0;

  document.getElementById("modulo").innerHTML = `
    <section class="visual-sheet">
      <div class="visual-header blue">
        <h2>INDICADORES DE DESPACHO</h2>
        <div class="visual-kpi-row">
          ${visualKpi("BULTOS", fmt(resumen.totalBultos))}
          ${visualKpi("PALLETS", fmt(resumen.palletsTotal))}
          ${visualKpi("VIAJES", fmt(resumen.viajes))}
          ${visualKpi("BULTOS/PALLET", fmt(resumen.bultosPallet))}
        </div>
      </div>
      <div class="dispatch-highlights">
        <div><span>Destinos</span><strong>${fmt(destinos.length)}</strong></div>
        <div><span>Top destino</span><strong>${corto(destinos[0]?.label || "-", 28)}</strong><small>${fmt(destinos[0]?.valor || 0)} bultos</small></div>
        <div><span>Top jerarquia</span><strong>${corto(jerarquias[0]?.label || "-", 28)}</strong><small>${fmt(jerarquias[0]?.valor || 0)} bultos</small></div>
      </div>
      <div class="dispatch-main-grid">
        ${despachoTurnoPanel(resumen)}
        ${visualDonutInterno("DISTRIBUCION POR TURNO", turnos, resumen.totalBultos)}
      </div>
      <div class="visual-gauge-row dispatch-gauges">
        ${visualGauge("DIA", dia, resumen.totalBultos, "#22c55e")}
        ${visualGauge("NOCHE", noche, resumen.totalBultos, "#6d28d9")}
        ${visualGauge("VIAJES DIA", resumen.porTurno.DIA?.viajes || 0, Math.max(resumen.viajes, 1), "#f59e0b")}
        ${visualGauge("VIAJES NOCHE", resumen.porTurno.NOCHE?.viajes || 0, Math.max(resumen.viajes, 1), "#ef4444")}
      </div>
    </section>
  `;
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
            <strong>${x.label}</strong>
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

