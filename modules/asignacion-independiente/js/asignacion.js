const UBICACIONES_RESERVA = ["Mass-"];
const UBICACIONES_OTRAS = ["DROP-BUFR", "RAMPA", "DROP-STOCK"];
const ESTADOS_VALIDOS = new Set(["Ubicado", "Recibido"]);

let mapaLPN = new Map();
let cacheAsignacion = null;
let vistaActual = "reserva";
let estadoOperarios = JSON.parse(localStorage.getItem("asignacion_estadoOperarios") || "{}");
let fechaPedidoSeleccionada = "";

function limpiarCodigo(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

function htmlSeguro(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, caracter => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[caracter]));
}

function atributoSeguro(valor) {
  return htmlSeguro(valor);
}

function argumentoSeguro(valor) {
  const argumento = JSON.stringify(String(valor ?? ""))
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return atributoSeguro(argumento);
}

function numeroReal(valor) {
  if (valor === null || valor === undefined) return 0;
  let txt = String(valor).trim().replace(",", ".");
  if (txt === "") return 0;
  let n = Number(txt);
  return Number.isFinite(n) ? n : 0;
}

function formatoDecimal(valor) {
  const n = Number(valor || 0);
  if (!Number.isFinite(n)) return "0";
  // Para valores muy pequeños como 0.000000000008
  if (n > 0 && n < 0.001) {
    return n.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
  }
  // Para decimales normales como 7.5
  return n.toLocaleString("es-PE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
}

function fechaActualTexto() {
  return new Date().toLocaleDateString("es-PE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function esQuiebre(codigo) {
  return (dataQuiebre || []).some(x => limpiarCodigo(x.CODIGO) === limpiarCodigo(codigo));
}

function normalizarCodigoAlt(valor) {
  const limpio = limpiarCodigo(valor);
  if (!limpio) return "";
  const soloDigitos = limpio.replace(/\D/g, "");
  if (!soloDigitos) return limpio;
  return soloDigitos.padStart(11, "0");
}

function obtenerCodigoAlt(row) {
  return normalizarCodigoAlt(campo(row, [
    "CODIGO_ALT",
    "CODIGO ALT",
    "CODIGO_ALTERNO",
    "CODIGO ALTERNO",
    "CODIGO_ALTERNATIVO",
    "CODIGO ALTERNATIVO",
    "Cod Alternat",
    "COD ALTERNAT",
    "COD_ALT",
    "COD ALT"
  ]));
}

function construirMapaLPN() {
  mapaLPN = new Map();

  for (const lpn of dataLPN || []) {
    const codigo = limpiarCodigo(lpn.CODIGO);
    if (!codigo) continue;
    if (!mapaLPN.has(codigo)) mapaLPN.set(codigo, []);
    mapaLPN.get(codigo).push(lpn);
  }
}

function obtenerPedido() {
  const mapa = new Map();

  for (const row of dataPedido || []) {
    const codigo = limpiarCodigo(row.PRODUCTO);
    if (!codigo) continue;

    const cantidad = numeroReal(campo(row, ["BULTOS_NO_ASIGNADO", "BULTO_NO_ASIGANDO", "BULTOS_NO_ASIGANDO"]));
    if (cantidad <= 0) continue;

    if (!mapa.has(codigo)) {
      mapa.set(codigo, {
        codigo,
        desc: row.DESCRIPCION || "",
        codigoAlt: obtenerCodigoAlt(row),
        total: 0
      });
    }

    if (!mapa.get(codigo).codigoAlt) mapa.get(codigo).codigoAlt = obtenerCodigoAlt(row);
    mapa.get(codigo).total += cantidad;
  }

  return Array.from(mapa.values());
}

function calcularResumenPedido() {
  return (dataPedido || []).reduce((acc, row) => {
    acc.pedido += numeroReal(campo(row, ["BULTOS_PEDIDO"]));
    acc.asignado += numeroReal(campo(row, ["BULTOS_ASIGNADOS", "BULTOS_ASIGANDOS"]));
    acc.noAsignado += numeroReal(campo(row, ["BULTOS_NO_ASIGNADO", "BULTO_NO_ASIGANDO", "BULTOS_NO_ASIGANDO"]));
    return acc;
  }, {
    pedido: 0,
    asignado: 0,
    noAsignado: 0
  });
}

function campo(row, nombres) {
  for (const nombre of nombres) {
    if (row[nombre] !== undefined && row[nombre] !== null && row[nombre] !== "") return row[nombre];
  }
  return 0;
}

function obtenerCs(lpn) {
  return numeroReal(campo(lpn || {}, ["CS", "CASE", "CAJAS", "BULTOS"]));
}

function ubicacionTipo(ubicacion) {
  const ubi = String(ubicacion || "").trim();
  if (UBICACIONES_RESERVA.some(x => ubi.startsWith(x))) return "reserva";
  if (UBICACIONES_OTRAS.some(x => ubi.startsWith(x)) || ubi === "") return "otras";
  return "ignorar";
}

function ordenarReserva(a, b) {
  const extraer = ubi => {
    const p = String(ubi || "").trim().split("-");
    return {
      pasillo: Number(p[1]) || 0,
      bahia: Number(p[2]) || 0,
      nivel: Number(p[3]) || 0,
      columna: Number(p[4]) || 0
    };
  };

  const ua = extraer(a.ubicacion);
  const ub = extraer(b.ubicacion);
  return (
    ua.pasillo - ub.pasillo ||
    ua.bahia - ub.bahia ||
    ua.nivel - ub.nivel ||
    ua.columna - ub.columna
  );
}

function elegirLpns(lpns, requerido) {
  const utiles = lpns
    .map(lpn => ({ lpn, stock: numeroReal(lpn.BULTOS) }))
    .filter(x => x.stock > 0);

  let restante = requerido;
  const usados = [];
  let bestFit = null;

  for (const item of utiles) {
    if (item.stock >= requerido && (!bestFit || item.stock < bestFit.stock)) {
      bestFit = item;
    }
  }

  if (bestFit) {
    return [{ lpn: bestFit.lpn, tomar: requerido, stock: bestFit.stock, highlight: true }];
  }

  utiles.sort((a, b) => b.stock - a.stock);

  for (const item of utiles) {
    if (restante <= 0) break;
    const tomar = Math.min(restante, item.stock);
    usados.push({ lpn: item.lpn, tomar, stock: item.stock, highlight: false });
    restante -= tomar;
  }

  return usados;
}

function procesarDatos() {
  if (cacheAsignacion) {
    window.reservaData = cacheAsignacion.reserva;
    window.otrasData = cacheAsignacion.otras;
    window.sinStockData = cacheAsignacion.sinStock;
    window.resumenAsignacion = cacheAsignacion.resumen;
    return cacheAsignacion;
  }

  construirMapaLPN();

  const pedido = obtenerPedido();
  const tablaReserva = [];
  const tablaOtras = [];
  const sinStock = [];
  const productos = [];

  for (const item of pedido) {
    const lpnsValidos = (mapaLPN.get(item.codigo) || []).filter(lpn =>
      ESTADOS_VALIDOS.has(String(lpn.ESTADO || "").trim())
    );

    const reserva = [];
    const otras = [];

    for (const lpn of lpnsValidos) {
      const tipo = ubicacionTipo(lpn.UBICACION);
      if (tipo === "reserva") reserva.push(lpn);
      if (tipo === "otras") otras.push(lpn);
    }

    const stockReserva = reserva.reduce((a, b) => a + numeroReal(b.BULTOS), 0);
    const stockOtras = otras.reduce((a, b) => a + numeroReal(b.BULTOS), 0);
    let restante = item.total;
    let asignadoReserva = 0;
    let asignadoOtras = 0;
    const pedidoReserva = Math.min(item.total, stockReserva);

    const usadosReserva = elegirLpns(reserva, restante);
    for (const usado of usadosReserva) {
      const tomar = Math.min(restante, usado.tomar);
      if (tomar <= 0) continue;

      tablaReserva.push({
        codigo: item.codigo,
        desc: item.desc,
        lpn: usado.lpn.LPN || "",
        ubicacion: usado.lpn.UBICACION || "",
        requerido: pedidoReserva,
        requerimientoTotal: item.total,
        cs: obtenerCs(usado.lpn),
        bultos: usado.stock,
        asignar: tomar,
        restante: usado.stock - tomar,
        highlight: usado.highlight,
        origen: "reserva"
      });

      asignadoReserva += tomar;
      restante -= tomar;
    }

    const pedidoOtras = restante;
    const usadosOtras = restante > 0 ? elegirLpns(otras, restante) : [];
    for (const usado of usadosOtras) {
      const tomar = Math.min(restante, usado.tomar);
      if (tomar <= 0) continue;

      tablaOtras.push({
        codigo: item.codigo,
        desc: item.desc,
        lpn: usado.lpn.LPN || "",
        ubicacion: usado.lpn.UBICACION || "",
        requerido: pedidoOtras,
        requerimientoTotal: item.total,
        cs: obtenerCs(usado.lpn),
        bultos: usado.stock,
        asignar: tomar,
        restante: usado.stock - tomar,
        highlight: usado.highlight,
        origen: "otras"
      });

      asignadoOtras += tomar;
      restante -= tomar;
    }

    if (stockReserva + stockOtras <= 0) {
      const prod = (dataProductos || []).find(x => limpiarCodigo(x.CODIGO) === item.codigo);
      sinStock.push({
        codigoAlt: item.codigoAlt || (prod ? obtenerCodigoAlt(prod) : ""),
        codigo: item.codigo,
        desc: item.desc,
        bultos: item.total,
        estado: "SIN STOCK"
      });
    }

    productos.push({
      ...item,
      stockReserva,
      stockOtras,
      asignadoReserva,
      asignadoOtras,
      sinCobertura: Math.max(0, restante)
    });
  }

  const resumenPedido = calcularResumenPedido();
  const resumen = productos.reduce((acc, p) => {
    acc.requerido += p.total;
    acc.reserva += p.asignadoReserva;
    acc.otras += p.asignadoOtras;
    acc.sinCobertura += p.sinCobertura;
    acc.productos += 1;
    if (p.sinCobertura > 0) acc.productosSinCobertura += 1;
    if (p.stockReserva + p.stockOtras <= 0) acc.productosSinStock += 1;
    return acc;
  }, {
    requerido: 0,
    reserva: 0,
    otras: 0,
    sinCobertura: 0,
    productos: 0,
    productosSinCobertura: 0,
    productosSinStock: 0
  });

  resumen.pedido = resumenPedido.pedido;
  resumen.asignado = resumenPedido.asignado;
  resumen.noAsignado = resumenPedido.noAsignado;
  resumen.asignable = Math.max(0, resumenPedido.pedido - resumenPedido.asignado);
  resumen.stockAsignable = resumen.reserva + resumen.otras;
  resumen.cobertura = resumen.noAsignado > 0 ? (resumen.stockAsignable / resumen.noAsignado) * 100 : 0;

  window.reservaData = tablaReserva.sort(ordenarReserva);
  window.otrasData = tablaOtras.sort((a, b) => b.asignar - a.asignar);
  window.sinStockData = sinStock.sort((a, b) => b.bultos - a.bultos);
  window.resumenAsignacion = resumen;

  cacheAsignacion = {
    reserva: window.reservaData,
    otras: window.otrasData,
    sinStock: window.sinStockData,
    productos,
    resumen
  };

  return cacheAsignacion;
}

function abrirAsignacion() {
  if (!datosListos) {
    document.getElementById("modulo").innerHTML = `<div class="loading">Cargando datos...</div>`;
    return;
  }

  const { resumen } = procesarDatos();
  const prog = calcularProgresoReal();
  const quiebres = obtenerPedido().filter(p => esQuiebre(p.codigo));

  document.getElementById("modulo").innerHTML = `
    <div class="module-head">
      <div>
        <h1>Asignacion operacional</h1>
        <p>ANC Logistica | Lectura operativa de pedido pendiente, cobertura y ubicaciones disponibles.</p>
      </div>
      <button class="soft" onclick="exportarNoAsignados()">Exportar no asignados</button>
    </div>

    ${quiebres.length ? `<div class="notice danger">${quiebres.length} productos en quiebre.</div>` : ""}

    <div class="kpi-grid">
      <div class="kpi date-kpi"><span>Fecha de hoy</span><strong>${fechaActualTexto()}</strong></div>
      <div class="kpi"><span>Bultos pedido</span><strong>${formatoDecimal(resumen.pedido)}</strong></div>
      <div class="kpi"><span>Bultos asignados</span><strong>${formatoDecimal(resumen.asignado)}</strong></div>
      <div class="kpi"><span>Asignable</span><strong>${formatoDecimal(resumen.asignable)}</strong></div>
      <div class="kpi alert"><span>No asignado</span><strong>${formatoDecimal(resumen.noAsignado)}</strong></div>
      <div class="kpi"><span>Reserva</span><strong>${formatoDecimal(resumen.reserva)}</strong></div>
      <div class="kpi"><span>Otras</span><strong>${formatoDecimal(resumen.otras)}</strong></div>
      <div class="kpi alert"><span>Sin cobertura</span><strong>${formatoDecimal(resumen.sinCobertura)}</strong></div>
      <div class="kpi"><span>Cobertura</span><strong>${resumen.cobertura.toFixed(1)}%</strong></div>
      <div class="kpi"><span>Productos</span><strong>${resumen.productos}</strong></div>
      <div class="kpi"><span>Avance</span><strong id="kpiAvancePorcentaje">${prog.porcentaje.toFixed(1)}%</strong><small id="kpiAvanceDetalle">${prog.productosCompletados} / ${prog.totalProductos}</small></div>
    </div>

    <div class="toolbar module-tabs">
      <button onclick="verDashboard()">Dashboard</button>
      <button onclick="verDashboardPedido()">Dashboard pedido</button>
      <button onclick="verReserva()">Reserva</button>
      <button onclick="verOtras()">Otras ubicaciones</button>
      <button onclick="verFormatoTablas()">Formato de tablas</button>
      <button onclick="verSinStock()">Sin stock</button>
      <button onclick="verAnalisisRapido()">Analisis rapido</button>
      <button onclick="verBuscadorLPN()">Buscador LPN</button>
    </div>

    <div id="contenido"></div>
    <div id="modal"></div>
  `;

  verDashboard();
}

function estadoInfo(key) {
  const estado = estadoOperarios[key] || "pendiente";
  if (estado === "completo") return { texto: "Completado", clase: "ok", accion: "Reabrir" };
  if (estado === "proceso") return { texto: "En proceso", clase: "warn", accion: "Completar" };
  return { texto: "Pendiente", clase: "bad", accion: "Completar" };
}

function calcularProgreso(data = [...(window.reservaData || []), ...(window.otrasData || [])]) {
  const progreso = {};

  for (const r of data) {
    const key = `${r.lpn}_${r.codigo}`;
    if (!progreso[r.codigo]) progreso[r.codigo] = { requerido: r.requerido, completado: 0, totalLpns: 0, completos: 0 };
    progreso[r.codigo].totalLpns += 1;
    if (estadoOperarios[key] === "completo") progreso[r.codigo].completado += numeroReal(r.asignar);
    if (estadoOperarios[key] === "completo") progreso[r.codigo].completos += 1;
  }

  for (const p of Object.values(progreso)) {
    p.porcentaje = p.requerido > 0 ? Math.min(100, (p.completado / p.requerido) * 100) : 0;
  }

  return progreso;
}

function calcularProgresoReal() {
  let totalAsignar = 0;
  let totalCompletado = 0;
  let totalTareas = 0;
  let tareasCompletadas = 0;

  for (const r of [...(window.reservaData || []), ...(window.otrasData || [])]) {
    const key = `${r.lpn}_${r.codigo}`;
    const asignar = numeroReal(r.asignar);
    totalAsignar += asignar;
    totalTareas += 1;

    if (estadoOperarios[key] === "completo") {
      totalCompletado += asignar;
      tareasCompletadas += 1;
    }
  }

  const porcentaje = totalAsignar > 0 ? (totalCompletado / totalAsignar) * 100 : 0;

  return {
    porcentaje,
    totalProductos: totalTareas,
    productosCompletados: tareasCompletadas,
    totalAsignar,
    totalCompletado
  };
}

function calcularProgresoProducto(codigo, tipo = "") {
  const origen = tipo === "reserva"
    ? (window.reservaData || [])
    : tipo === "otras"
      ? (window.otrasData || [])
      : [...(window.reservaData || []), ...(window.otrasData || [])];
  const filas = origen.filter(r => r.codigo === codigo);
  const totalAsignado = filas.reduce((acc, r) => acc + numeroReal(r.asignar), 0);
  const requerido = Math.max(...filas.map(r => numeroReal(r.requerido)), 0);
  const total = tipo === "otras" && requerido > 0 ? requerido : totalAsignado;
  const completado = filas.reduce((acc, r) => {
    const key = `${r.lpn}_${r.codigo}`;
    return acc + (estadoOperarios[key] === "completo" ? numeroReal(r.asignar) : 0);
  }, 0);

  return {
    total,
    totalAsignado,
    completado,
    porcentaje: total > 0 ? Math.min(100, (completado / total) * 100) : 0,
    estado: total > 0 && completado >= total ? "Completado" : completado > 0 ? "En proceso" : "Pendiente"
  };
}

function barraProgreso(porcentaje) {
  const valor = Math.max(0, Math.min(100, porcentaje || 0));
  return `
    <div class="progress">
      <div style="width:${valor}%">${valor.toFixed(0)}%</div>
    </div>
  `;
}

function crearBloqueTabla(titulo, data, tipo, id) {
  return `
    <section class="tabla-bloque" id="${atributoSeguro(id)}">
      <div class="subsection-head">
        <h3>${htmlSeguro(titulo)}</h3>
        <button class="compact" onclick="descargarImagenId(${argumentoSeguro(id)}, ${argumentoSeguro(id)})">Imagen</button>
      </div>
      ${crearTabla(data, tipo)}
    </section>
  `;
}

function crearTabla(data, tipo) {
  const progreso = calcularProgreso(data);

  if (!data.length) {
    return `<div class="empty">Sin datos para mostrar.</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>LPN</th>
            <th>Codigo</th>
            <th>Quiebre</th>
            <th>Descripcion</th>
            <th>Ubicacion</th>
            <th>Req total</th>
            <th>Stock LPN</th>
            <th>Asignar</th>
            <th>Restante</th>
            <th>Progreso</th>
            <th>Estado</th>
            <th>Accion</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(r => {
            const key = `${r.lpn}_${r.codigo}`;
            const estado = estadoInfo(key);
            const p = progreso[r.codigo] || {};
            const quiebre = esQuiebre(r.codigo);

            return `
              <tr class="${atributoSeguro(estado.clase)} ${quiebre ? "quiebre" : ""}" data-key="${atributoSeguro(key)}" data-codigo="${atributoSeguro(r.codigo)}" data-tipo="${atributoSeguro(tipo)}">
                <td><strong>${htmlSeguro(r.lpn)}</strong></td>
                <td>${htmlSeguro(r.codigo)}</td>
                <td>${quiebre ? "SI" : ""}</td>
                <td>${htmlSeguro(r.desc)}</td>
                <td><strong>${htmlSeguro(r.ubicacion || "VACIO")}</strong></td>
                <td><strong>${formatoDecimal(r.requerido)}</strong></td>
                <td>${formatoDecimal(r.bultos)}</td>
                <td class="number">${formatoDecimal(r.asignar)}</td>
                <td>${formatoDecimal(r.restante)}</td>
                <td class="progreso-cell">${barraProgreso(p.porcentaje || 0)}</td>
                <td class="estado-cell"><strong>${estado.texto}</strong></td>
                <td><button class="compact accion-estado" onclick="cambiarEstadoOperario(${argumentoSeguro(key)}, ${argumentoSeguro(tipo)}, ${argumentoSeguro(r.codigo)})">${estado.accion}</button></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function verDashboard() {
  const { resumen, productos } = procesarDatos();
  const progreso = calcularProgresoReal();
  const coberturaReserva = resumen.noAsignado > 0 ? (resumen.reserva / resumen.noAsignado) * 100 : 0;
  const coberturaOtras = resumen.noAsignado > 0 ? (resumen.otras / resumen.noAsignado) * 100 : 0;
  const sinCoberturaPct = resumen.noAsignado > 0 ? (resumen.sinCobertura / resumen.noAsignado) * 100 : 0;
  const criticos = productos.filter(p => p.sinCobertura > 0).sort((a, b) => b.sinCobertura - a.sinCobertura).slice(0, 10);
  const mixtos = productos.filter(p => p.asignadoReserva > 0 && p.asignadoOtras > 0).length;
  const soloReserva = productos.filter(p => p.asignadoReserva > 0 && p.asignadoOtras === 0).length;
  const soloOtras = productos.filter(p => p.asignadoOtras > 0 && p.asignadoReserva === 0).length;

  document.getElementById("contenido").innerHTML = `
    <section class="dashboard-grid-pro">
      <div class="metric-panel">
        <span>Cobertura total</span>
        <strong>${resumen.cobertura.toFixed(1)}%</strong>
        ${barraProgreso(resumen.cobertura)}
      </div>
      <div class="metric-panel">
        <span>Avance operativo</span>
        <strong>${progreso.porcentaje.toFixed(1)}%</strong>
        ${barraProgreso(progreso.porcentaje)}
      </div>
      <div class="metric-panel">
        <span>Productos mixtos</span>
        <strong>${mixtos}</strong>
        <small>Usan reserva y otras ubicaciones</small>
      </div>
      <div class="metric-panel danger">
        <span>Productos con brecha</span>
        <strong>${resumen.productosSinCobertura}</strong>
        <small>${formatoDecimal(resumen.sinCobertura)} bultos sin cobertura</small>
      </div>
    </section>

    <section class="dashboard-layout">
      <div class="insight-card">
        <div class="section-head">
          <h2>Distribucion de cobertura</h2>
        </div>
        <div class="stack-bar">
          <div style="width:${Math.min(100, coberturaReserva)}%" title="Reserva"></div>
          <div style="width:${Math.min(100, coberturaOtras)}%" title="Otras"></div>
          <div style="width:${Math.min(100, sinCoberturaPct)}%" title="Sin cobertura"></div>
        </div>
        <div class="legend">
          <span><b class="dot reserva"></b>Reserva ${coberturaReserva.toFixed(1)}%</span>
          <span><b class="dot otras"></b>Otras ${coberturaOtras.toFixed(1)}%</span>
          <span><b class="dot brecha"></b>Brecha ${sinCoberturaPct.toFixed(1)}%</span>
        </div>
        <div class="mini-kpis">
          <div><span>Reserva</span><strong>${formatoDecimal(resumen.reserva)}</strong></div>
          <div><span>Otras</span><strong>${formatoDecimal(resumen.otras)}</strong></div>
          <div><span>Sin cobertura</span><strong>${formatoDecimal(resumen.sinCobertura)}</strong></div>
        </div>
      </div>

      <div class="insight-card">
        <div class="section-head">
          <h2>Lectura operacional</h2>
        </div>
        <div class="insight-list">
          <div><strong>${soloReserva}</strong><span>productos salen solo de reserva.</span></div>
          <div><strong>${soloOtras}</strong><span>productos salen solo de otras ubicaciones.</span></div>
          <div><strong>${mixtos}</strong><span>productos requieren trabajo mixto.</span></div>
          <div><strong>${resumen.productosSinStock}</strong><span>productos sin stock utilizable.</span></div>
        </div>
      </div>
    </section>

    <section class="insight-card">
      <div class="section-head">
        <h2>Top productos a revisar</h2>
        <button class="compact" onclick="verAnalisisRapido()">Ver analisis completo</button>
      </div>
      <div class="table-wrap table-wrap-compact">
        <table>
          <thead>
            <tr>
              <th>Codigo</th>
              <th>Descripcion</th>
              <th>Pedido</th>
              <th>Reserva</th>
              <th>Otras</th>
              <th>Brecha</th>
            </tr>
          </thead>
          <tbody>
            ${criticos.map(p => `
              <tr class="bad">
                <td><strong>${htmlSeguro(p.codigo)}</strong></td>
                <td>${htmlSeguro(p.desc)}</td>
                <td>${formatoDecimal(p.total)}</td>
                <td>${formatoDecimal(p.asignadoReserva)}</td>
                <td>${formatoDecimal(p.asignadoOtras)}</td>
                <td class="number">${formatoDecimal(p.sinCobertura)}</td>
              </tr>
            `).join("") || `<tr><td colspan="6">No hay productos con brecha.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function porcentaje(a, b) {
  return b > 0 ? (a / b) * 100 : 0;
}

function agruparPedidoPorFecha() {
  const mapa = new Map();

  for (const row of dataPedido || []) {
    const fecha = limpiarCodigo(row.FECHA_ORDEN) || "(sin fecha)";
    if (!mapa.has(fecha)) {
      mapa.set(fecha, {
        fecha,
        solicitado: 0,
        asignable: 0,
        asignado: 0,
        empacado: 0,
        enviado: 0,
        noAsignado: 0
      });
    }

    const item = mapa.get(fecha);
    item.solicitado += numeroReal(campo(row, ["BULTOS_REAL"]));
    item.asignable += numeroReal(campo(row, ["BULTOS_PEDIDO"]));
    item.asignado += numeroReal(campo(row, ["BULTOS_ASIGNADOS", "BULTOS_ASIGANDOS"]));
    item.empacado += numeroReal(campo(row, ["BULTOS_EMPACADOS"]));
    item.enviado += numeroReal(campo(row, ["BULTOS_ENVIADOS"]));
    item.noAsignado += numeroReal(campo(row, ["BULTOS_NO_ASIGNADO", "BULTO_NO_ASIGANDO", "BULTOS_NO_ASIGANDO"]));
  }

  return Array.from(mapa.values()).sort((a, b) => {
    const fechaA = fechaOrdenable(a.fecha);
    const fechaB = fechaOrdenable(b.fecha);
    return fechaA - fechaB;
  });
}

function fechaOrdenable(fecha) {
  const partes = String(fecha || "").split("/");
  if (partes.length !== 3) return 0;
  return new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0])).getTime();
}

function totalizarPedido(resumen) {
  return resumen.reduce((acc, r) => {
    acc.solicitado += r.solicitado;
    acc.asignable += r.asignable;
    acc.asignado += r.asignado;
    acc.empacado += r.empacado;
    acc.enviado += r.enviado;
    acc.noAsignado += r.noAsignado;
    return acc;
  }, {
    solicitado: 0,
    asignable: 0,
    asignado: 0,
    empacado: 0,
    enviado: 0,
    noAsignado: 0
  });
}

function cambiarFechaDashboardPedido(fecha) {
  fechaPedidoSeleccionada = fechaPedidoSeleccionada === fecha ? "" : fecha;
  verDashboardPedido();
}

function limpiarFechaDashboardPedido() {
  fechaPedidoSeleccionada = "";
  verDashboardPedido();
}

function crearLineaSvg(resumen, nombreCampo, color, maxCompartido) {
  const width = 520;
  const height = 210;
  const pad = 26;
  const valores = resumen.map(r => r[nombreCampo]);
  const max = Math.max(maxCompartido, 1);
  const step = resumen.length > 1 ? (width - pad * 2) / (resumen.length - 1) : 0;
  const puntos = valores.map((v, i) => {
    const x = pad + (i * step);
    const y = height - pad - ((v / max) * (height - pad * 2));
    return `${x},${y}`;
  }).join(" ");

  const circulos = valores.map((v, i) => {
    const x = pad + (i * step);
    const y = height - pad - ((v / max) * (height - pad * 2));
    return `<circle cx="${x}" cy="${y}" r="3.5"><title>${htmlSeguro(resumen[i].fecha)} - ${nombreCampo === "asignado" ? "Asignado" : "No asignado"}: ${formatoDecimal(v)}</title></circle>`;
  }).join("");

  return `
    <g class="line-series" style="--line-color:${color}">
      <polyline points="${puntos}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
      ${circulos}
    </g>
  `;
}

function crearTendenciaPedido(resumen) {
  if (!resumen.length) return "";

  const width = 520;
  const height = 210;
  const max = Math.max(
    ...resumen.map(r => Math.max(numeroReal(r.asignado), numeroReal(r.noAsignado))),
    1
  );
  const yTicks = [1, 0.75, 0.5, 0.25, 0].map((ratio, i) => {
    const y = 26 + i * 39.5;
    return `
      <text x="18" y="${y + 4}" text-anchor="end">${formatoDecimal(max * ratio)}</text>
      <line x1="26" y1="${y}" x2="494" y2="${y}"></line>
    `;
  }).join("");
  const labels = resumen.map((r, i) => {
    const x = 26 + (resumen.length > 1 ? i * ((width - 52) / (resumen.length - 1)) : 0);
    return `<text x="${x}" y="202" text-anchor="middle">${htmlSeguro(String(r.fecha).slice(0, 5))}</text>`;
  }).join("");

  return `
    <svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img">
      <g class="grid-lines">
        ${yTicks}
        <line x1="26" y1="26" x2="26" y2="184"></line>
      </g>
      ${crearLineaSvg(resumen, "asignado", "#2f6f4e", max)}
      ${crearLineaSvg(resumen, "noAsignado", "#a33d3d", max)}
      <g class="chart-labels">${labels}</g>
    </svg>
  `;
}

function donutPedido(asignado, noAsignado) {
  asignado = numeroReal(asignado);
  noAsignado = numeroReal(noAsignado);
  const total = asignado + noAsignado;
  const pAsignado = total > 0 ? (asignado / total) * 100 : 0;
  const pNoAsignado = total > 0 ? (noAsignado / total) * 100 : 0;
  return `
    <div class="donut-wrap">
      <div class="donut" style="--p:${pAsignado};"></div>
      <div class="donut-center">
        <strong>${pAsignado.toFixed(2)}%</strong>
        <span>Asignado</span>
      </div>
    </div>

    <div class="legend center">
      <span><b class="dot reserva"></b>Asignado ${pAsignado.toFixed(2)}% (${formatoDecimal(asignado)})</span>
      <span><b class="dot brecha"></b>No asignado ${pNoAsignado.toFixed(2)}% (${formatoDecimal(noAsignado)})</span>
    </div>
  `;
}

function barrasDistribucionNoAsignado(resumenAsignacion) {
  const reserva = resumenAsignacion.reserva;
  const otras = resumenAsignacion.otras;
  const sinStock = resumenAsignacion.productosSinStock > 0
    ? (window.sinStockData || []).reduce((a, b) => a + numeroReal(b.bultos), 0)
    : 0;
  const base = reserva + otras + sinStock;

  const items = [
    { label: "Reserva", valor: reserva, clase: "reserva" },
    { label: "Otras", valor: otras, clase: "otras" },
    { label: "Sin stock", valor: sinStock, clase: "brecha" }
  ];

  return `
    <div class="distribution-bars">
      ${items.map(i => `
        <div>
          <span>${i.label}</span>
          <strong>${formatoDecimal(i.valor)}</strong>
          <div class="bar-track"><div class="${i.clase}" style="width:${Math.min(100, porcentaje(i.valor, base))}%"></div></div>
          <small>${porcentaje(i.valor, base).toFixed(1)}%</small>
        </div>
      `).join("")}
    </div>
  `;
}

function verDashboardPedido() {
  const resumenFechas = agruparPedidoPorFecha();
  const resumenFiltrado = fechaPedidoSeleccionada
    ? resumenFechas.filter(r => r.fecha === fechaPedidoSeleccionada)
    : resumenFechas;
  const total = totalizarPedido(resumenFiltrado);
  const asignacion = procesarDatos().resumen;
  const pAsignacion = porcentaje(total.asignado, total.asignable);
  const pEmpaque = porcentaje(total.empacado, total.asignado);
  const pEnvio = porcentaje(total.enviado, total.empacado);
  const brechaOperativa = Math.max(0, total.asignable - total.asignado);

  document.getElementById("contenido").innerHTML = `
    <section class="pedido-dashboard">
      <div class="section-head">
        <div>
          <h2>Dashboard pedido</h2>
          <p>${fechaPedidoSeleccionada ? `Vista filtrada por ${htmlSeguro(fechaPedidoSeleccionada)}.` : "Seguimiento por fecha del flujo solicitado, asignado, empacado y enviado."}</p>
        </div>
        <div class="actions-inline">
          ${fechaPedidoSeleccionada ? `<button class="compact ghost" onclick="limpiarFechaDashboardPedido()">Ver total</button>` : ""}
          <button class="compact" onclick="descargarImagenId('contenido', 'dashboard-pedido')">Imagen</button>
        </div>
      </div>

      <div class="pedido-kpis">
        <div><span>Solicitado</span><strong>${formatoDecimal(total.solicitado)}</strong></div>
        <div><span>Asignable</span><strong>${formatoDecimal(total.asignable)}</strong></div>
        <div><span>Asignado</span><strong>${formatoDecimal(total.asignado)}</strong><small>${pAsignacion.toFixed(1)}%</small></div>
        <div><span>Empacado</span><strong>${pEmpaque.toFixed(1)}%</strong><small>${formatoDecimal(total.empacado)}</small></div>
        <div><span>Enviado</span><strong>${pEnvio.toFixed(1)}%</strong><small>${formatoDecimal(total.enviado)}</small></div>
        <div class="danger"><span>No asignado</span><strong>${formatoDecimal(total.noAsignado)}</strong></div>
      </div>

      <div class="dashboard-layout pedido-layout">
        <div class="insight-card">
          <div class="section-head">
            <h2>Resumen por fecha</h2>
          </div>
          <div class="table-wrap table-wrap-compact">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Solicitado</th>
                  <th>Asignable</th>
                  <th>Asignado</th>
                  <th>Empacado</th>
                  <th>Enviado</th>
                  <th>No asignado</th>
                </tr>
              </thead>
              <tbody>
                ${resumenFechas.map(r => `
                  <tr class="clickable-row ${fechaPedidoSeleccionada === r.fecha ? "selected-row" : ""}" onclick="cambiarFechaDashboardPedido(${argumentoSeguro(r.fecha)})">
                    <td><strong>${htmlSeguro(r.fecha)}</strong></td>
                    <td>${formatoDecimal(r.solicitado)}</td>
                    <td>${formatoDecimal(r.asignable)}</td>
                    <td>${formatoDecimal(r.asignado)}</td>
                    <td>${formatoDecimal(r.empacado)}</td>
                    <td>${formatoDecimal(r.enviado)}</td>
                    <td class="number">${formatoDecimal(r.noAsignado)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>

        <div class="insight-card">
          <div class="section-head">
            <h2>Asignado vs no asignado</h2>
          </div>
          ${donutPedido(total.asignado, total.noAsignado)}
        </div>
      </div>

      <div class="dashboard-layout pedido-layout">
        <div class="insight-card">
          <div class="section-head">
            <h2>Tendencia diaria</h2>
            <div class="legend">
              <span><b class="dot reserva"></b>Asignado</span>
              <span><b class="dot brecha"></b>No asignado</span>
            </div>
          </div>
          ${crearTendenciaPedido(resumenFiltrado)}
        </div>

        <div class="insight-card">
          <div class="section-head">
            <h2>Distribucion no asignado</h2>
          </div>
          ${barrasDistribucionNoAsignado(asignacion)}
        </div>
      </div>

      <div class="dashboard-grid-pro">
        <div class="metric-panel">
          <span>Brecha asignable</span>
          <strong>${formatoDecimal(brechaOperativa)}</strong>
          <small>Asignable pendiente de asignar</small>
        </div>
        <div class="metric-panel">
          <span>Pedidos con fecha</span>
          <strong>${resumenFiltrado.length}</strong>
          <small>${fechaPedidoSeleccionada ? "Fecha seleccionada" : "Dias detectados en FECHA_ORDEN"}</small>
        </div>
        <div class="metric-panel">
          <span>Reserva sugerida</span>
          <strong>${formatoDecimal(asignacion.reserva)}</strong>
          <small>Desde ubicaciones Mass</small>
        </div>
        <div class="metric-panel danger">
          <span>Sin cobertura</span>
          <strong>${formatoDecimal(asignacion.sinCobertura)}</strong>
          <small>Revisar reposicion o ubicaciones</small>
        </div>
      </div>
    </section>
  `;
}

function verReserva() {
  vistaActual = "reserva";
  const data = window.reservaData || [];
  const mayores = data.filter(r => r.requerido >= 30);
  const menores = data.filter(r => r.requerido < 30);

  let html = `
    <div class="section-head">
      <h2>Reserva operacional</h2>
      <div class="section-actions">
        <button onclick="descargarExcelResumenAsignacion()">Excel resumen</button>
        <button onclick="descargarExcel('reserva')">Excel detalle</button>
      </div>
    </div>
  `;

  html += crearBloqueTabla("Mayores o iguales a 30", mayores, "reserva", "reserva-mayores");

  for (let i = 1; i <= 12; i++) {
    const nro = String(i).padStart(2, "0");
    const pasillo = menores.filter(r => String(r.ubicacion || "").startsWith(`Mass-${nro}`));
    if (pasillo.length) html += crearBloqueTabla(`Pasillo ${i}`, pasillo, "reserva", `reserva-pasillo-${i}`);
  }

  document.getElementById("contenido").innerHTML = html;
}

function requerimientoFormato(row) {
  return numeroReal(row.asignar);
}

function ordenarFormatoTabla(a, b) {
  return ordenarReserva(a, b) ||
    String(a.ubicacion || "").localeCompare(String(b.ubicacion || ""), "es", { numeric: true }) ||
    String(a.desc || "").localeCompare(String(b.desc || ""), "es");
}

function datosFormatoDesdeExcel(tipo) {
  return datosExportacion(tipo)
    .filter(row => numeroReal(row.asignar) > 0)
    .map(row => ({ ...row, bultosRequerido: numeroReal(row.asignar) }));
}

function crearTablaFormatoImagen(data) {
  if (!data.length) return `<div class="empty">Sin datos para mostrar.</div>`;

  return `
    <div class="formato-imagen-wrap">
      <table class="formato-imagen-tabla">
        <thead>
          <tr>
            <th>PRODUCTO</th>
            <th>DESCRIPCION</th>
            <th>LPN</th>
            <th>UBICACION</th>
            <th>BULTOS_REQUERIDO</th>
            <th>CS</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(r => `
            <tr>
              <td>${htmlSeguro(r.codigo)}</td>
              <td>${htmlSeguro(r.desc)}</td>
              <td>${htmlSeguro(r.lpn)}</td>
              <td>${htmlSeguro(r.ubicacion || "VACIO")}</td>
              <td>${formatoDecimal(r.bultosRequerido ?? requerimientoFormato(r))}</td>
              <td>${formatoDecimal(r.cs || r.bultos)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function crearBloqueFormatoImagen(titulo, data, id) {
  return `
    <section class="formato-imagen-bloque">
      <div class="subsection-head">
        <div>
          <h3>${htmlSeguro(titulo)}</h3>
          <span>${data.length} LPN seleccionados por la asignacion</span>
        </div>
        <button onclick="descargarImagenTabla(${argumentoSeguro(id)}, ${argumentoSeguro(id)})">Descargar imagen</button>
      </div>
      <div id="${atributoSeguro(id)}" class="formato-imagen-captura">
        <h3>${htmlSeguro(titulo)}</h3>
        ${crearTablaFormatoImagen(data)}
      </div>
    </section>
  `;
}

function verFormatoTablas() {
  vistaActual = "formatoTablas";
  procesarDatos();

  const reserva = datosFormatoDesdeExcel("reserva").sort(ordenarFormatoTabla);
  const otras = datosFormatoDesdeExcel("otras").sort(ordenarFormatoTabla);
  const gruposReserva = {
    mayores: reserva.filter(r => r.bultosRequerido >= 30),
    menores: reserva.filter(r => r.bultosRequerido < 30)
  };

  document.getElementById("contenido").innerHTML = `
    <div class="section-head">
      <div>
        <h2>Formato de tablas para imagen</h2>
        <p>Mismos LPN y cantidades ASIGNAR del Excel detalle. Orden desde Mass-01 en adelante.</p>
      </div>
    </div>
    <div class="formato-imagen-grid">
      ${crearBloqueFormatoImagen("RESERVA - MAYORES O IGUALES A 30", gruposReserva.mayores, "formato-reserva-mayores-30")}
      ${crearBloqueFormatoImagen("RESERVA - MENORES A 30", gruposReserva.menores, "formato-reserva-menores-30")}
      ${crearBloqueFormatoImagen("OTRAS UBICACIONES", otras, "formato-otras-ubicaciones")}
    </div>
  `;
}

function textoLpn(lpn) {
  return [
    lpn.LPN,
    lpn.CODIGO,
    lpn.DESCRIPCION,
    lpn.UBICACION
  ].map(x => limpiarCodigo(x).toLowerCase()).join(" ");
}

function lpnNormalizado(lpn) {
  return {
    lpn: limpiarCodigo(lpn.LPN),
    codigo: limpiarCodigo(lpn.CODIGO),
    desc: lpn.DESCRIPCION || "",
    ubicacion: limpiarCodigo(lpn.UBICACION) || "VACIO",
    stock: numeroReal(lpn.BULTOS),
    estado: limpiarCodigo(lpn.ESTADO)
  };
}

function obtenerLpnFiltrados() {
  const q = limpiarCodigo(document.getElementById("buscadorLpn")?.value || "").toLowerCase();
  return (dataLPN || [])
    .filter(l => !q || textoLpn(l).includes(q))
    .map(lpnNormalizado)
    .filter(l => l.codigo || l.lpn);
}

function pasilloDeUbicacion(ubicacion) {
  const p = String(ubicacion || "").split("-");
  const n = Number(p[1]);
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : null;
}

function renderBuscadorGeneral() {
  const data = obtenerLpnFiltrados();
  const totalStock = data.reduce((a, b) => a + b.stock, 0);
  const productos = new Set(data.map(x => x.codigo).filter(Boolean)).size;
  const lpns = data.length;

  document.getElementById("buscadorKpis").innerHTML = `
    <div class="mini-kpis">
      <div><span>LPNs</span><strong>${lpns}</strong></div>
      <div><span>Productos</span><strong>${productos}</strong></div>
      <div><span>Stock</span><strong>${formatoDecimal(totalStock)}</strong></div>
    </div>
  `;

  let html = "";
  for (let i = 1; i <= 12; i++) {
    const pasillo = data
      .filter(x => pasilloDeUbicacion(x.ubicacion) === i)
      .sort((a, b) => a.ubicacion.localeCompare(b.ubicacion, "es"));

    html += crearBloqueBusqueda(`Pasillo ${i}`, pasillo, `busqueda-pasillo-${i}`);
  }

  const otros = data.filter(x => pasilloDeUbicacion(x.ubicacion) === null);
  if (otros.length) html += crearBloqueBusqueda("Otras ubicaciones", otros, "busqueda-otras");

  document.getElementById("buscadorResultado").innerHTML = html || `<div class="empty">Sin resultados.</div>`;
}

function crearBloqueBusqueda(titulo, data, id) {
  if (!data.length) return "";

  return `
    <section class="tabla-bloque" id="${atributoSeguro(id)}">
      <div class="subsection-head">
        <h3>${htmlSeguro(titulo)}</h3>
        <button class="compact" onclick="descargarImagenId(${argumentoSeguro(id)}, ${argumentoSeguro(id)})">Imagen</button>
      </div>
      <div class="table-wrap table-wrap-compact">
        <table>
          <thead>
            <tr>
              <th>Codigo</th>
              <th>Descripcion</th>
              <th>Ubicacion</th>
              <th>LPN</th>
              <th>Stock</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(r => `
              <tr>
                <td><strong>${htmlSeguro(r.codigo)}</strong></td>
                <td>${htmlSeguro(r.desc)}</td>
                <td>${htmlSeguro(r.ubicacion)}</td>
                <td>${htmlSeguro(r.lpn)}</td>
                <td class="number">${formatoDecimal(r.stock)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderBuscadorDetalle() {
  const data = obtenerLpnFiltrados();
  const mapa = new Map();

  data.forEach(l => {
    if (!mapa.has(l.codigo)) {
      mapa.set(l.codigo, {
        codigo: l.codigo,
        desc: l.desc,
        stock: 0,
        lpns: []
      });
    }

    const item = mapa.get(l.codigo);
    item.stock += l.stock;
    item.lpns.push(l);
  });

  const productos = Array.from(mapa.values()).sort((a, b) => b.stock - a.stock);

  document.getElementById("buscadorResultado").innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Descripcion</th>
            <th>Cantidad LPNs</th>
            <th>Stock general</th>
            <th>Ver</th>
          </tr>
        </thead>
        <tbody>
          ${productos.map(p => `
            <tr>
              <td><strong>${htmlSeguro(p.codigo)}</strong></td>
              <td>${htmlSeguro(p.desc)}</td>
              <td>${p.lpns.length}</td>
              <td class="number">${formatoDecimal(p.stock)}</td>
              <td><button class="compact" onclick="abrirDetalleProductoLpn(${argumentoSeguro(p.codigo)})">Ver</button></td>
            </tr>
          `).join("") || `<tr><td colspan="5">Sin resultados.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function cambiarVistaBuscador(vista) {
  document.getElementById("vistaBuscador").value = vista;
  vista === "detalle" ? renderBuscadorDetalle() : renderBuscadorGeneral();
}

function filtrarBuscadorLPN() {
  const vista = document.getElementById("vistaBuscador")?.value || "general";
  vista === "detalle" ? renderBuscadorDetalle() : renderBuscadorGeneral();
}

function verBuscadorLPN() {
  document.getElementById("contenido").innerHTML = `
    <section class="search-module">
      <div class="section-head">
        <div>
          <h2>Buscador LPN</h2>
          <p>Busca en vivo por LPN, codigo, descripcion o ubicacion.</p>
        </div>
        <div class="section-actions">
          <button onclick="cambiarVistaBuscador('general')">Vista general</button>
          <button onclick="cambiarVistaBuscador('detalle')">Vista detalle</button>
        </div>
      </div>
      <input type="hidden" id="vistaBuscador" value="general">
      <input class="search-input" id="buscadorLpn" type="search" placeholder="Buscar LPN, codigo o descripcion..." oninput="filtrarBuscadorLPN()">
      <div id="buscadorKpis"></div>
      <div id="buscadorResultado"></div>
      <div id="modalBusqueda"></div>
    </section>
  `;

  renderBuscadorGeneral();
}

function abrirDetalleProductoLpn(codigo) {
  const data = obtenerLpnFiltrados().filter(x => x.codigo === codigo);
  const stock = data.reduce((a, b) => a + b.stock, 0);
  const desc = data[0]?.desc || "";

  document.getElementById("modal").innerHTML = `
    <div class="modal-backdrop">
      <div class="modal-card">
        <div class="section-head">
          <div>
            <h2>${htmlSeguro(codigo)}</h2>
            <p>${htmlSeguro(desc)}</p>
          </div>
          <button onclick="cerrarModal()">Cerrar</button>
        </div>
        <div class="mini-kpis">
          <div><span>LPNs</span><strong>${data.length}</strong></div>
          <div><span>Stock general</span><strong>${formatoDecimal(stock)}</strong></div>
        </div>
        <input class="search-input" type="search" placeholder="Buscar dentro del producto..." oninput="filtrarDetalleProductoModal(this.value, ${argumentoSeguro(codigo)})">
        <div id="detalleProductoModal">
          ${tablaDetalleProducto(data)}
        </div>
      </div>
    </div>
  `;
}

function filtrarDetalleProductoModal(valor, codigo) {
  const q = limpiarCodigo(valor).toLowerCase();
  const data = obtenerLpnFiltrados().filter(x =>
    x.codigo === codigo &&
    (!q || [x.lpn, x.ubicacion, x.estado].join(" ").toLowerCase().includes(q))
  );

  document.getElementById("detalleProductoModal").innerHTML = tablaDetalleProducto(data);
}

function tablaDetalleProducto(data) {
  return `
    <div class="table-wrap table-wrap-compact">
      <table>
        <thead>
          <tr>
            <th>LPN</th>
            <th>Ubicacion</th>
            <th>Estado</th>
            <th>Stock</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(l => `
            <tr>
              <td><strong>${htmlSeguro(l.lpn)}</strong></td>
              <td>${htmlSeguro(l.ubicacion)}</td>
              <td>${htmlSeguro(l.estado)}</td>
              <td class="number">${formatoDecimal(l.stock)}</td>
            </tr>
          `).join("") || `<tr><td colspan="4">Sin LPNs.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function verOtras() {
  vistaActual = "otras";
  const data = window.otrasData || [];
  const mapa = new Map();

  for (const r of data) {
    if (!mapa.has(r.codigo)) mapa.set(r.codigo, { codigo: r.codigo, desc: r.desc, requerido: r.requerido, lpns: [] });
    mapa.get(r.codigo).lpns.push(r);
  }

  const filas = Array.from(mapa.values()).sort((a, b) => b.requerido - a.requerido);

  document.getElementById("contenido").innerHTML = `
    <div class="section-head">
      <h2>Otras ubicaciones</h2>
      <div class="section-actions">
        <button onclick="descargarExcel('otras')">Excel</button>
        <button onclick="descargarImagenId('contenido', 'otras-ubicaciones')">Imagen</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Descripcion</th>
            <th>No asignado</th>
            <th>LPNs</th>
            <th>Ubicaciones</th>
            <th>Progreso</th>
            <th>Estado</th>
            <th>Ver</th>
          </tr>
        </thead>
        <tbody>
          ${filas.map(r => {
            const ubicaciones = [...new Set(r.lpns.map(l => l.ubicacion || "VACIO"))].join(", ");
            const progreso = calcularProgresoProducto(r.codigo, "otras");

            return `
              <tr data-codigo="${atributoSeguro(r.codigo)}" data-tipo="otras" data-resumen-producto="otras">
                <td><strong>${htmlSeguro(r.codigo)}</strong></td>
                <td>${htmlSeguro(r.desc)}</td>
                <td class="number">${formatoDecimal(r.requerido)}</td>
                <td>${r.lpns.length}</td>
                <td>${htmlSeguro(ubicaciones)}</td>
                <td class="progreso-cell">${barraProgreso(progreso.porcentaje)}</td>
                <td class="estado-producto-cell"><strong>${progreso.estado}</strong></td>
                <td><button class="compact" onclick="verDetalleOtras(${argumentoSeguro(r.codigo)})">Ver</button></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function verDetalleOtras(codigo) {
  const data = (window.otrasData || []).filter(o => o.codigo === codigo).sort((a, b) => b.bultos - a.bultos);
  if (!data.length) return;

  document.getElementById("modal").innerHTML = `
    <div class="modal-backdrop">
      <div class="modal-card">
        <div class="section-head">
          <h2>${htmlSeguro(codigo)}</h2>
          <button onclick="cerrarModal()">Cerrar</button>
        </div>
        ${crearTabla(data, "otras")}
      </div>
    </div>
  `;
}

function cerrarModal() {
  document.getElementById("modal").innerHTML = "";
}

function obtenerSinStockFiltrado() {
  const q = limpiarCodigo(document.getElementById("buscadorSinStock")?.value || "").toLowerCase();
  const filtro = document.getElementById("filtroQuiebreSinStock")?.value || "todos";

  return (window.sinStockData || []).filter(r => {
    const quiebre = esQuiebre(r.codigo);
    const coincideFiltro = filtro === "todos" || (filtro === "quiebre" ? quiebre : !quiebre);
    const texto = [r.codigoAlt, r.codigo, r.desc, r.estado].map(x => limpiarCodigo(x).toLowerCase()).join(" ");
    return coincideFiltro && (!q || texto.includes(q));
  });
}

function filasSinStock(data) {
  return data.map(r => {
    const quiebre = esQuiebre(r.codigo);
    return `
      <tr class="bad ${quiebre ? "quiebre" : ""}">
        <td>${htmlSeguro(r.codigoAlt || "")}</td>
        <td>${htmlSeguro(r.codigo)}</td>
        <td>${quiebre ? "SI" : ""}</td>
        <td>${htmlSeguro(r.desc)}</td>
        <td class="number">${formatoDecimal(r.bultos)}</td>
        <td><strong>${htmlSeguro(r.estado)}</strong></td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="6">Sin productos sin stock.</td></tr>`;
}

function renderSinStock() {
  const data = obtenerSinStockFiltrado();
  const tbody = document.getElementById("sinStockBody");
  const contador = document.getElementById("sinStockContador");

  if (tbody) tbody.innerHTML = filasSinStock(data);
  if (contador) contador.textContent = `${data.length} registros visibles`;
}

async function copiarSinStockVisible() {
  const data = obtenerSinStockFiltrado();
  if (!data.length) {
    alert("No hay filas visibles para copiar");
    return;
  }

  const filas = [
    ["Codigo alt", "Codigo", "Quiebre", "Descripcion", "Bultos", "Estado"],
    ...data.map(r => [
      r.codigoAlt || "",
      r.codigo || "",
      esQuiebre(r.codigo) ? "SI" : "",
      r.desc || "",
      formatoDecimal(r.bultos),
      r.estado || ""
    ])
  ];
  const texto = filas.map(fila => fila.join("\t")).join("\n");

  try {
    await navigator.clipboard.writeText(texto);
    alert("Tabla copiada al portapapeles");
  } catch (error) {
    const area = document.createElement("textarea");
    area.value = texto;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    alert("Tabla copiada al portapapeles");
  }
}

function verSinStock() {
  document.getElementById("contenido").innerHTML = `
    <div class="section-head">
      <div>
        <h2>Sin stock</h2>
        <p id="sinStockContador"></p>
      </div>
      <div class="section-actions">
        <button onclick="copiarSinStockVisible()">Copiar tabla</button>
        <button onclick="descargarExcel('sinStock')">Excel</button>
        <button onclick="descargarImagenId('contenido', 'sin-stock')">Imagen</button>
      </div>
    </div>
    <div class="filter-row">
      <input class="search-input" id="buscadorSinStock" type="search" placeholder="Buscar codigo, codigo alt o descripcion..." oninput="renderSinStock()">
      <select class="filter-select" id="filtroQuiebreSinStock" onchange="renderSinStock()">
        <option value="todos">Todos</option>
        <option value="quiebre">Solo quiebre</option>
        <option value="sinQuiebre">Sin quiebre</option>
      </select>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Codigo alt</th>
            <th>Codigo</th>
            <th>Quiebre</th>
            <th>Descripcion</th>
            <th>Bultos</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody id="sinStockBody">
        </tbody>
      </table>
    </div>
  `;

  renderSinStock();
}

function verAnalisisRapido() {
  const data = cacheAsignacion.productos.slice().sort((a, b) => b.sinCobertura - a.sinCobertura || b.total - a.total);

  document.getElementById("contenido").innerHTML = `
    <div class="section-head">
      <h2>Analisis rapido</h2>
      <div class="section-actions">
        <button onclick="descargarExcel('analisis')">Excel</button>
        <button onclick="descargarImagenId('contenido', 'analisis-rapido')">Imagen</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Codigo</th>
            <th>Descripcion</th>
            <th>Requerido</th>
            <th>Stock reserva</th>
            <th>Stock otras</th>
            <th>Asignado reserva</th>
            <th>Asignado otras</th>
            <th>Sin cobertura</th>
            <th>Decision</th>
          </tr>
        </thead>
        <tbody>
          ${data.map(r => {
            const decision = r.sinCobertura > 0
              ? "Revisar compra/traslado"
              : r.asignadoOtras > 0 && r.asignadoReserva > 0
                ? "Mixto"
                : r.asignadoReserva > 0
                  ? "Reserva"
                  : "Otras";

            return `
              <tr class="${r.sinCobertura > 0 ? "bad" : ""}">
                <td><strong>${htmlSeguro(r.codigo)}</strong></td>
                <td>${htmlSeguro(r.desc)}</td>
                <td class="number">${formatoDecimal(r.total)}</td>
                <td>${formatoDecimal(r.stockReserva)}</td>
                <td>${formatoDecimal(r.stockOtras)}</td>
                <td>${formatoDecimal(r.asignadoReserva)}</td>
                <td>${formatoDecimal(r.asignadoOtras)}</td>
                <td class="number">${formatoDecimal(r.sinCobertura)}</td>
                <td><strong>${htmlSeguro(decision)}</strong></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function actualizarKpiAvance() {
  const prog = calcularProgresoReal();
  const porcentaje = document.getElementById("kpiAvancePorcentaje");
  const detalle = document.getElementById("kpiAvanceDetalle");

  if (porcentaje) porcentaje.textContent = `${prog.porcentaje.toFixed(1)}%`;
  if (detalle) detalle.textContent = `${prog.productosCompletados} / ${prog.totalProductos}`;
}

function actualizarFilaEstado(key) {
  const estado = estadoInfo(key);
  const filas = document.querySelectorAll(`tr[data-key="${CSS.escape(key)}"]`);

  filas.forEach(fila => {
    fila.classList.remove("ok", "warn", "bad");
    fila.classList.add(estado.clase);

    const celda = fila.querySelector(".estado-cell strong");
    if (celda) celda.textContent = estado.texto;

    const boton = fila.querySelector(".accion-estado");
    if (boton) boton.textContent = estado.accion;
  });
}

function actualizarProgresoProducto(codigo) {
  const filas = document.querySelectorAll(`tr[data-codigo="${CSS.escape(codigo)}"]`);

  filas.forEach(fila => {
    const tipo = fila.dataset.tipo || "";
    const progreso = calcularProgresoProducto(codigo, tipo);
    const celda = fila.querySelector(".progreso-cell");
    if (!celda) return;

    celda.innerHTML = barraProgreso(progreso.porcentaje || 0);

    const estadoProducto = fila.querySelector(".estado-producto-cell strong");
    if (estadoProducto) estadoProducto.textContent = progreso.estado;
  });
}

function cambiarEstadoOperario(key, tipo, codigo) {
  const actual = estadoOperarios[key] || "pendiente";
  estadoOperarios[key] = actual === "completo" ? "pendiente" : "completo";
  localStorage.setItem("asignacion_estadoOperarios", JSON.stringify(estadoOperarios));

  actualizarFilaEstado(key);
  actualizarProgresoProducto(codigo);
  actualizarKpiAvance();
}

function resetOperarios() {
  if (!confirm("Reiniciar progreso?")) return;
  estadoOperarios = {};
  localStorage.removeItem("asignacion_estadoOperarios");
  abrirAsignacion();
}

function datosExportacion(tipo) {
  if (tipo === "reserva") return window.reservaData || [];
  if (tipo === "otras") return window.otrasData || [];
  if (tipo === "sinStock") return window.sinStockData || [];
  if (tipo === "analisis") return cacheAsignacion.productos || [];
  return [];
}

function descargarExcel(tipo) {
  const data = datosExportacion(tipo);
  if (!data.length) {
    alert("No hay datos para exportar");
    return;
  }

  let html = "<table border='1'>";

  if (tipo === "sinStock") {
    html += "<tr><th>CODIGO_ALT</th><th>CODIGO</th><th>DESCRIPCION</th><th>BULTOS</th><th>ESTADO</th></tr>";
    html += data.map(d => `<tr>${celdaExcelTexto(d.codigoAlt || "")}${celdaExcelTexto(d.codigo)}<td>${htmlSeguro(d.desc)}</td><td>${formatoDecimal(d.bultos)}</td><td>${htmlSeguro(d.estado)}</td></tr>`).join("");
  } else if (tipo === "analisis") {
    html += "<tr><th>CODIGO</th><th>DESCRIPCION</th><th>REQUERIDO</th><th>STOCK_RESERVA</th><th>STOCK_OTRAS</th><th>ASIG_RESERVA</th><th>ASIG_OTRAS</th><th>SIN_COBERTURA</th></tr>";
    html += data.map(d => `<tr>${celdaExcelTexto(d.codigo)}<td>${htmlSeguro(d.desc)}</td><td>${formatoDecimal(d.total)}</td><td>${formatoDecimal(d.stockReserva)}</td><td>${formatoDecimal(d.stockOtras)}</td><td>${formatoDecimal(d.asignadoReserva)}</td><td>${formatoDecimal(d.asignadoOtras)}</td><td>${formatoDecimal(d.sinCobertura)}</td></tr>`).join("");
  } else {
    html += "<tr><th>LPN</th><th>CODIGO</th><th>DESCRIPCION</th><th>UBICACION</th><th>REQ</th><th>STOCK</th><th>ASIGNAR</th><th>RESTANTE</th></tr>";
    html += data.map(d => `<tr>${celdaExcelTexto(d.lpn)}${celdaExcelTexto(d.codigo)}<td>${htmlSeguro(d.desc)}</td><td>${htmlSeguro(d.ubicacion || "")}</td><td>${formatoDecimal(d.requerido)}</td><td>${formatoDecimal(d.bultos)}</td><td>${formatoDecimal(d.asignar)}</td><td>${formatoDecimal(d.restante)}</td></tr>`).join("");
  }

  html += "</table>";

  const blob = new Blob([prepararHtmlExcel(html)], { type: "application/vnd.ms-excel" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${tipo}.xls`;
  a.click();
}

function filasResumenAsignacion() {
  const mapa = new Map();

  function agregar(ubicacion, codigo, desc, bultos) {
    const cod = limpiarCodigo(codigo);
    const descripcion = limpiarCodigo(desc);
    const valor = numeroReal(bultos);
    if (!cod || valor <= 0) return;
    const key = `${ubicacion}|${cod}|${descripcion}`;
    if (!mapa.has(key)) {
      mapa.set(key, {
        ubicacion,
        codigo: cod,
        desc: descripcion,
        bultos: 0
      });
    }
    mapa.get(key).bultos += valor;
  }

  (window.reservaData || []).forEach(r => agregar("RESERVA", r.codigo, r.desc, r.asignar));
  (window.sinStockData || []).forEach(r => agregar("SIN STOCK", r.codigo, r.desc, r.bultos));
  (window.otrasData || []).forEach(r => agregar("PALETERO", r.codigo, r.desc, r.asignar));

  const orden = { "RESERVA": 1, "SIN STOCK": 2, "PALETERO": 3 };
  return Array.from(mapa.values()).sort((a, b) =>
    (orden[a.ubicacion] || 99) - (orden[b.ubicacion] || 99) ||
    a.desc.localeCompare(b.desc, "es")
  );
}

function descargarExcelResumenAsignacion() {
  const data = filasResumenAsignacion();
  if (!data.length) {
    alert("No hay datos para exportar");
    return;
  }

  let html = `
    <table border="1" class="tabla-resumen-asignacion">
      <thead>
        <tr>
          <th>UBICACION</th>
          <th>CODIGO PRODUCTO</th>
          <th>DESCRIPCION</th>
          <th>BULTOS REQUERIDOS</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(r => `
          <tr>
            <td>${htmlSeguro(r.ubicacion)}</td>
            ${celdaExcelTexto(r.codigo)}
            <td>${htmlSeguro(r.desc)}</td>
            <td>${formatoDecimal(r.bultos)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  const blob = new Blob([prepararHtmlExcelResumen(html)], { type: "application/vnd.ms-excel" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "resumen-reserva-sin-stock-paletero.xls";
  a.click();
  URL.revokeObjectURL(a.href);
}

function celdaExcelTexto(valor) {
  return `<td style="mso-number-format:'\\@';">${htmlSeguro(valor)}</td>`;
}

function prepararHtmlExcelResumen(html) {
  return prepararHtmlExcel(`
    <style>
      .tabla-resumen-asignacion th {
        background: #0f6680;
        color: #ffffff;
        font-weight: 700;
        text-align: center;
      }
      .tabla-resumen-asignacion td {
        border: 1px solid #000000;
      }
      .tabla-resumen-asignacion tbody tr:nth-child(odd) td {
        background: #bfe5ef;
      }
      .tabla-resumen-asignacion tbody tr:nth-child(even) td {
        background: #ffffff;
      }
    </style>
    ${html}
  `);
}

function prepararHtmlExcel(html) {
  return `
    <meta charset="UTF-8">
    <style>.excel-text{mso-number-format:"\\@";}td.excel-text{mso-number-format:"\\@";}</style>
  ` + String(html || "").replace(/<td([^>]*)>([\s\S]*?)<\/td>/gi, (match, attrs, contenido) => {
    const texto = contenido.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
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

function exportarNoAsignados() {
  verAnalisisRapido();
  descargarExcel("analisis");
}

function descargarImagenId(id, nombre) {
  if (typeof html2canvas === "undefined") {
    alert("No se cargo la libreria de imagen");
    return;
  }

  const zona = document.getElementById(id);
  if (!zona) {
    alert("No se encontro la tabla");
    return;
  }

  html2canvas(zona).then(canvas => {
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${nombre}.png`;
    a.click();
  });
}

function descargarImagenTabla(id, nombre) {
  if (typeof html2canvas === "undefined") {
    alert("No se cargo la libreria de imagen");
    return;
  }

  const zona = document.getElementById(id);
  if (!zona) {
    alert("No se encontro la tabla");
    return;
  }

  html2canvas(zona, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    windowWidth: Math.max(zona.scrollWidth, zona.clientWidth)
  }).then(canvas => {
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${nombre}.png`;
    a.click();
  });
}
