let rotacionFuente = null;
let rotacionCarga = null;
let rotacionFilas = [];
let rotacionVisibles = [];
let rotacionBase = 'bultos';
let rotacionLimites = [80, 95];
let rotacionProductos = [], rotacionInventario = [], rotacionUbicaciones = [], rotacionShipTo = [];

function codigoRotacion(value) {
  return String(value ?? '').trim().replace(/^'+/, '').toUpperCase();
}

function calcularRotacion(fuente, productos, inventario, ubicaciones, alta = 80, media = 95, shipTo = [], base = 'bultos') {
  const maestro = new Map();
  const alias = new Map();
  productos.forEach(p => {
    const codigo = codigoRotacion(p.CODIGO);
    if (!codigo) return;
    maestro.set(codigo, p);
    alias.set(codigo, codigo);
    const alterno = codigoRotacion(p.CODIGO_ALT);
    if (alterno) alias.set(alterno, codigo);
  });
  const mapa = new Map();
  function obtener(valor, descripcion = '') {
    const raw = codigoRotacion(valor);
    if (!raw || /^-+$/.test(raw)) return null;
    const codigo = alias.get(raw) || raw;
    if (!mapa.has(codigo)) {
      const p = maestro.get(codigo) || {};
      mapa.set(codigo, { codigo, alterno: p.CODIGO_ALT || '', descripcion: p.DESCRIPCION || descripcion,
        uxb: num(p.UXB), unidades: 0, stock: 0, tieneDato: false,
        ubicaciones: new Set(), seteadas: new Set(), tipos: new Map(), shipTo: false, categoria: 'SIN DATO' });
    }
    return mapa.get(codigo);
  }
  fuente.forEach(r => {
    const item = obtener(r.Codigo ?? r.CODIGO ?? r.PRODUCTO, r.DESCRIPCION);
    if (!item) return;
    item.unidades += num(r.UNIDADES);
    item.tieneDato = true;
  });
  const buscar = valor => mapa.get(alias.get(codigoRotacion(valor)) || codigoRotacion(valor));
  shipTo.forEach(r => { const item = buscar(r.CODIGO); if (item) item.shipTo = true; });
  inventario.forEach(r => {
    if (esMassPasillo10(r.UBICACION)) return;
    const item = buscar(r.PRODUCTO);
    if (!item) return;
    item.stock += num(r.UNACT);
    if (num(r.UNACT) > 0 && r.UBICACION) item.ubicaciones.add(r.UBICACION);
  });
  ubicaciones.forEach(r => {
    const ubicacion = r.Mascara ?? r.MASCARA ?? r.UBICACION;
    if (!ubicacion || esMassPasillo10(ubicacion)) return;
    const item = buscar(r.Producto ?? r.PRODUCTO);
    if (item) {
      item.seteadas.add(ubicacion);
      item.tipos.set(ubicacion, r['Tipo Ubicac'] || r.TIPO_UBICACION || 'Sin tipo');
    }
  });
  const filas = [...mapa.values()];
  filas.forEach(r => {
    r.bultos = r.uxb > 0 ? r.unidades / r.uxb : null;
    r.stockBultos = r.uxb > 0 ? r.stock / r.uxb : null;
    r.volumen = base === 'bultos' ? r.bultos : r.unidades;
  });
  filas.sort((a,b) => (b.volumen ?? -Infinity) - (a.volumen ?? -Infinity) || a.codigo.localeCompare(b.codigo));
  const total = filas.reduce((s, r) => s + Math.max(0, r.volumen || 0), 0);
  let acumulado = 0;
  filas.forEach(r => {
    // El producto que cruza el umbral permanece en el grupo que completa.
    const previo = total ? acumulado / total * 100 : 0;
    r.categoria = r.unidades < 0 ? 'REVISAR' : r.volumen === null ? 'SIN UXB' : r.volumen === 0 ? 'SIN MOVIMIENTO' : previo < alta ? 'ALTA' : previo < media ? 'MEDIA' : 'BAJA';
    acumulado += Math.max(0, r.volumen || 0);
    r.participacion = total ? Math.max(0, r.volumen || 0) / total * 100 : 0;
    r.acumulado = total ? acumulado / total * 100 : 0;
  });
  return filas;
}

async function verRotacion(actualizar = false) {
  if (!datosListos) { alert('Espera a que termine la carga de datos.'); return; }
  const modulo = document.getElementById('modulo');
  modulo.innerHTML = '<div id="rotacionVista"><div class="loading">Cargando rotacion...</div></div>';
  const vista = document.getElementById('rotacionVista');
  try {
    if (!rotacionFuente || actualizar) {
      if (!rotacionCarga) rotacionCarga = Promise.all([
        cargarHoja('ROTACION'), cargarHoja('PRODUCTOS'), cargarHoja('INV_ACTIVO'), cargarHoja('UBI_ACTIVO'),
        cargarHojaDesde(RECEPCION_PALETEROS_SHEET_ID, 'CODIGO')
      ]).finally(() => { rotacionCarga = null; });
      const fuentes = await rotacionCarga;
      [rotacionFuente, rotacionProductos, rotacionInventario, rotacionUbicaciones, rotacionShipTo] = fuentes;
      if (!Array.isArray(rotacionFuente) || !rotacionFuente.length || !('UNIDADES' in rotacionFuente[0])) {
        rotacionFuente = null;
        throw new Error('La hoja ROTACION no contiene datos con la columna UNIDADES.');
      }
    }
    if (!vista.isConnected) return;
    vista.className = 'rot-dashboard';
    vista.innerHTML = `<div class="section-head"><div><h2>Rotacion de mercaderia</h2><span class="rot-muted">Despachos y cobertura de ubicaciones</span></div><div class="filters"><button onclick="verRotacion(true)">Actualizar</button><button onclick="exportarRotacion()">Excel</button></div></div>
      <div class="filters"><input id="rotacionBuscar" class="search" placeholder="Codigo, descripcion o ubicacion" oninput="filtrarRotacion()">
      <select id="rotacionCategoria" onchange="filtrarRotacion()" aria-label="Rotacion"><option value="">Todos los niveles</option>${['ALTA','MEDIA','BAJA','SIN MOVIMIENTO','SIN UXB','REVISAR'].map(c => `<option>${c}</option>`).join('')}</select>
      <select id="rotacionSeteo" onchange="filtrarRotacion()" aria-label="Ubicacion activo"><option value="">Todas las ubicaciones</option><option value="SI">Con ubicacion activo</option><option value="NO">Sin ubicacion activo</option></select>
      <select id="rotacionStock" onchange="filtrarRotacion()" aria-label="Flujo"><option value="">Todos los flujos</option><option value="SI">Ship To</option><option value="NO">Activo / almacen</option></select>
      <select id="rotacionBase" onchange="recalcularRotacion()" aria-label="Base ABC"><option value="bultos">ABC por bultos</option><option value="unidades">ABC por unidades</option></select></div>
      <details class="rot-method"><summary>Criterio ABC por volumen despachado</summary><div class="filters"><label>Alta hasta (%) <input id="rotacionAlta" type="number" min="1" max="99" value="80" onchange="recalcularRotacion()"></label><label>Media hasta (%) <input id="rotacionMedia" type="number" min="2" max="100" value="95" onchange="recalcularRotacion()"></label></div><p>Alta completa el primer 80% del volumen; media hasta el 95%; baja el resto. Cortes ajustables. Bultos = UNIDADES / UXB de Productos. Se usa todo el periodo disponible en ROTACION, sin estimar frecuencia diaria. Pasillo 10 excluido del activo.</p></details>
      <div id="rotacionError" role="alert"></div><div id="rotacionResumen"></div><div id="rotacionGraficos"></div><div id="rotacionTabla"></div>`;
    recalcularRotacion();
  } catch (error) {
    if (vista.isConnected) vista.innerHTML = `<div class="error-box">${htmlSeguro(error.message)} <button onclick="verRotacion(true)">Reintentar</button></div>`;
  }
}

function recalcularRotacion() {
  const alta = Number(document.getElementById('rotacionAlta').value);
  const media = Number(document.getElementById('rotacionMedia').value);
  const error = document.getElementById('rotacionError');
  if (!(alta > 0 && alta < media && media <= 100)) {
    error.textContent = 'Los porcentajes deben cumplir: 0 < alta < media <= 100.';
    return;
  }
  error.textContent = '';
  rotacionBase = document.getElementById('rotacionBase').value;
  rotacionLimites = [alta, media];
  rotacionFilas = calcularRotacion(rotacionFuente, rotacionProductos, rotacionInventario, rotacionUbicaciones, alta, media, rotacionShipTo, rotacionBase);
  filtrarRotacion();
}

function filtrarRotacion() {
  const buscar = document.getElementById('rotacionBuscar').value.trim().toUpperCase();
  const categoria = document.getElementById('rotacionCategoria').value;
  const seteo = document.getElementById('rotacionSeteo').value;
  const stock = document.getElementById('rotacionStock').value;
  rotacionVisibles = rotacionFilas.filter(r => (!categoria || r.categoria === categoria)
    && (!seteo || (r.seteadas.size > 0) === (seteo === 'SI'))
    && (!stock || r.shipTo === (stock === 'SI'))
    && (!buscar || [r.codigo, r.alterno, r.descripcion, ...r.ubicaciones, ...r.seteadas].join(' ').toUpperCase().includes(buscar)));
  renderResumenRotacion();
  const mostrar = value => value === null ? 'Sin UXB' : fmt(value);
  document.getElementById('rotacionTabla').innerHTML = `<h3>Detalle de productos <small>${rotacionVisibles.length}</small></h3>` + tablaConId('tablaRotacion', ['Codigo / producto', 'Nivel', 'UXB', 'Despacho UND', 'Despacho BUL', 'Flujo', 'Ubicacion activo / tipo', 'Stock UND', 'Stock BUL'], rotacionVisibles.map(r => `<tr><td><strong>${htmlSeguro(r.codigo)}</strong><span class="rot-desc">${htmlSeguro(r.descripcion)}</span></td><td><span class="rot-badge ${r.categoria.toLowerCase().replaceAll(' ', '-')}">${r.categoria}</span></td><td>${r.uxb > 0 ? fmt(r.uxb) : 'Sin UXB'}</td><td>${fmt(r.unidades)}</td><td><strong>${mostrar(r.bultos)}</strong></td><td>${r.shipTo ? '<span class="rot-badge ship">SHIP TO</span>' : 'Activo'}</td><td>${r.seteadas.size ? [...r.seteadas].sort(ordenarUbicacion).map(u => `${htmlSeguro(u)}<span class="rot-desc">${htmlSeguro(r.tipos.get(u))}</span>`).join('<br>') : r.shipTo ? 'No requiere ubicacion (Ship To)' : '<span class="rot-warning">No cuenta con ubicacion</span>'}</td><td>${fmt(r.stock)}</td><td>${mostrar(r.stockBultos)}</td></tr>`));
}

function exportarRotacion() {
  if (document.getElementById('rotacionError').textContent) return;
  descargarExcelHojas('rotacion', [{ nombre: 'Rotacion', filas: [
    ['CODIGO', 'CODIGO_ALT', 'DESCRIPCION', 'ROTACION', 'UXB', 'UNIDADES_DESPACHADAS', 'BULTOS_DESPACHADOS', 'PARTICIPACION_%', 'STOCK_UNIDADES', 'STOCK_BULTOS', 'CON_UBICACION', 'UBICACION_Y_TIPO', 'UBICACIONES_STOCK', 'SHIP_TO', 'ESTADO_UBICACION'],
    ...rotacionVisibles.map(r => [r.codigo, String(r.alterno), r.descripcion, r.categoria, r.uxb > 0 ? r.uxb : 'SIN UXB', r.unidades, r.bultos ?? 'SIN UXB', r.participacion, r.stock, r.stockBultos ?? 'SIN UXB', r.seteadas.size ? 'SI' : 'NO', [...r.tipos].map(([u,t]) => `${u}: ${t}`).join('; '), [...r.ubicaciones].join(', '), r.shipTo ? 'SI' : 'NO', r.seteadas.size ? 'CON UBICACION' : r.shipTo ? 'NO REQUIERE UBICACION - SHIP TO' : 'NO CUENTA CON UBICACION'])
  ] }, { nombre: 'Criterio', filas: [['PARAMETRO','VALOR'], ['Base ABC',rotacionBase], ['Alta hasta %',rotacionLimites[0]], ['Media hasta %',rotacionLimites[1]], ['Universo','Productos de ROTACION; clasificacion anterior a filtros'], ['Periodo','Todo el contenido disponible de ROTACION'], ['UXB','PRODUCTOS'], ['Ship To','Paletero / CODIGO'], ['Activo','UBI_ACTIVO, excluye pasillo 10'], ['Exportacion','Productos del filtro actual']] }]);
}

function renderResumenRotacion() {
  const rows = rotacionVisibles;
  const sum = key => rows.reduce((s,r) => s + (r[key] || 0), 0);
  const pendientes = rows.filter(r => !r.shipTo && !r.seteadas.size);
  const kpis = [
    ['Productos',rows.length,'En el filtro actual'],
    ['Bultos despachados',sum('bultos'),`${rows.filter(r => !(r.uxb > 0)).length} sin UXB`],
    ['Unidades despachadas',sum('unidades'),'Volumen del periodo'],
    ['Con ubicacion',rows.filter(r => r.seteadas.size).length,'Seteados en activo'],
    ['Sin ubicacion',pendientes.length,`${pendientes.filter(r => r.categoria === 'ALTA').length} de alta rotacion`],
    ['Ship To',rows.filter(r => r.shipTo).length,'No requiere seteo']
  ];
  document.getElementById('rotacionResumen').innerHTML = `<div class="rot-kpis">${kpis.map(([label,value,sub],i) => `<div class="rot-kpi k${i}"><span>${label}</span><strong>${fmt(value)}</strong><small>${sub}</small></div>`).join('')}</div>`;
  const colors = ['#167d8d','#d39428','#828b9a','#b9c1cb','#b44747','#b44747'];
  const categories = ['ALTA','MEDIA','BAJA','SIN MOVIMIENTO','SIN UXB','REVISAR'];
  let start = 0;
  const segments = categories.map((c,i) => {
    const count = rows.filter(r => r.categoria === c).length;
    const end = start + (rows.length ? count / rows.length * 100 : 0);
    const part = `${colors[i]} ${start}% ${end}%`; start = end; return part;
  });
  const top = rows.filter(r => r.volumen > 0).slice(0,6);
  const max = top[0]?.volumen || 1;
  const bars = top.map(r => `<div class="rot-bar-row" title="${htmlSeguro(r.descripcion)}"><div><span>${htmlSeguro(r.descripcion)}</span><strong>${fmt(r.volumen)}</strong></div><div class="rot-track"><i style="width:${r.volumen / max * 100}%"></i></div></div>`).join('');
  const coverage = ['ALTA','MEDIA','BAJA'].map((c,i) => {
    const grupo = rows.filter(r => r.categoria === c);
    const ship = grupo.filter(r => r.shipTo).length;
    const set = grupo.filter(r => !r.shipTo && r.seteadas.size).length;
    const missing = grupo.length - ship - set;
    const width = n => grupo.length ? n / grupo.length * 100 : 0;
    return `<div class="rot-cover-row"><div><b>${c}</b><span>${grupo.length} productos</span></div><div class="rot-stacked" aria-label="${c}: ${set} con ubicacion, ${missing} sin ubicacion, ${ship} Ship To"><i style="width:${width(set)}%;background:#167d8d"></i><i style="width:${width(missing)}%;background:#b44747"></i><i style="width:${width(ship)}%;background:#d39428"></i></div><small>${set} con ubicacion · ${missing} sin ubicacion · ${ship} Ship To</small></div>`;
  }).join('');
  document.getElementById('rotacionGraficos').innerHTML = `<div class="rot-charts">
    <section><h3>Distribucion por nivel</h3><div class="rot-distribution"><div class="rot-donut" role="img" aria-label="Distribucion de ${rows.length} productos por nivel" style="background:conic-gradient(${rows.length ? segments.join(',') : '#e5e9ee 0% 100%'})"><div><strong>${fmt(rows.length)}</strong><small>productos</small></div></div><div class="rot-legend">${categories.map((c,i) => { const n = rows.filter(r => r.categoria === c).length; return n ? `<div><i style="background:${colors[i]}"></i><span>${c}</span><b>${n}</b></div>` : ''; }).join('')}</div></div></section>
    <section><h3>Mayor despacho <small>${rotacionBase}</small></h3>${bars || '<p>Sin despachos para este filtro.</p>'}</section>
    <section><h3>Cobertura de activo</h3>${coverage}</section></div>`;
}
