let seteoFilas = [];
let seteoVisibles = [];
let seteoUbicaciones = [];
let seteoSeleccion = null;
let seteoFiltro = { texto: '', tipoUbicacion: '', tipoAsignacion: '', pasillo: '' };

function seteoProducto(codigo) {
  const key = normalizar(codigo);
  return dataProductos.find(p => normalizar(campo(p, ['CODIGO', 'PRODUCTO'])) === key) || {};
}

function seteoUbicacion(row) {
  return limpiar(campo(row, ['MASCARA', 'Mascara', 'UBICACION', 'Ubicacion', 'Ubicación']));
}

function seteoTipoUbicacion(row) {
  return limpiar(campo(row, ['Tipo Ubicac', 'TIPO_UBICACION', 'Tipo Ubicacion', 'TIPO UBICACION', 'Tipo']));
}

function seteoPasillo(ubicacion) {
  const parts = limpiar(ubicacion).toUpperCase().split('-');
  return parts[0] === 'MASS' && parts[1] ? parts[1].replace(/^0+/, '') || '0' : '';
}

function seteoTipoAsignacion(row) {
  return limpiar(campo(row, ['TIPO_ASIGNACION', 'TIPO ASIGNACION', 'Tipo Asignacion', 'Tipo Asignac', 'ZONA ASIGNAC', 'Zona Asignac']));
}

function seteoMaxAprendido(codigo, alt) {
  try {
    const ctx = construirContextoRecepcionUca();
    return num(ctx.maxPalletPorProducto.get(claveProductoRecepcion(codigo, alt)));
  } catch (error) {
    return 0;
  }
}

function construirSeteo() {
  // Para Seteo basta que el producto exista en una ubicación de INV_ACTIVO;
  // el stock puede estar temporalmente en cero y la ubicación sigue seteada.
  const activos = new Set(dataInventario.map(row => {
    const codigo = normalizar(campo(row, ['PRODUCTO', 'CODIGO']));
    const ubicacion = limpiar(campo(row, ['UBICACION', 'Ubicacion']));
    return codigo && ubicacion ? codigo : '';
  }).filter(Boolean));
  const porProducto = new Map();
  dataLPN.forEach(row => {
    const codigo = normalizar(row.CODIGO);
    if (!codigo || activos.has(codigo)) return;
    const p = seteoProducto(codigo);
    const alt = limpiar(campo(p, ['CODIGO_ALT', 'COD_ALT', 'CODIGO ALTERNATIVO', 'Cod Alternat'])) || limpiar(row.CODIGO_ALT);
    if (!porProducto.has(codigo)) {
      porProducto.set(codigo, {
        codigo, alt, descripcion: limpiar(campo(p, ['DESCRIPCION', 'Descripcion'])) || limpiar(row.DESCRIPCION),
        uxb: num(campo(p, ['UXB', 'Uxb'])) || num(row.UXB), bultos: 0, unidades: 0,
        lpns: new Set(), max: seteoMaxAprendido(codigo, alt), tipoAsignacion: 'PRIME', ubicacion: '',
        ubicacionManual: false
      });
    }
    const item = porProducto.get(codigo);
    item.bultos += num(row.BULTOS);
    item.unidades += unidadesLpn(row);
    if (row.LPN) item.lpns.add(row.LPN);
  });
  return [...porProducto.values()].sort((a, b) => b.bultos - a.bultos || a.descripcion.localeCompare(b.descripcion));
}

function construirUbicacionesSeteo() {
  return (dataUbicacionesActivo || []).map(row => {
    const ubicacion = seteoUbicacion(row);
    const codigo = normalizar(campo(row, ['PRODUCTO', 'CODIGO']));
    const p = seteoProducto(codigo);
    return {
      ubicacion, codigo, descripcion: limpiar(campo(row, ['DESCRIPCION', 'Descripcion'])) || limpiar(campo(p, ['DESCRIPCION', 'Descripcion'])),
      tipoUbicacion: seteoTipoUbicacion(row), tipoAsignacion: seteoTipoAsignacion(row), pasillo: seteoPasillo(ubicacion),
      producto: limpiar(campo(row, ['PRODUCTO', 'CODIGO'])) || '-----------'
    };
  }).filter(r => r.ubicacion && r.pasillo !== '10').sort((a, b) => ordenarUbicacion(a.ubicacion, b.ubicacion));
}

function verSeteo() {
  if (!datosListos) { alert('Espera a que termine la carga de datos.'); return; }
  seteoFilas = construirSeteo();
  seteoUbicaciones = construirUbicacionesSeteo();
  seteoFiltro = { texto: '', tipoUbicacion: '', tipoAsignacion: '', pasillo: '' };
  document.getElementById('modulo').innerHTML = `<div class="seteo-dashboard">
    <div class="section-head"><div><h2>Seteo de productos</h2><span class="seteo-muted">Productos en LPN sin ubicación activa</span></div><div class="filters"><button onclick="verSeteo()">Actualizar</button><button onclick="exportarSeteo()">Excel</button></div></div>
    <div class="seteo-kpis" id="seteoKpis"></div>
    <div class="filters seteo-filters"><input id="seteoBuscar" class="search" placeholder="Buscar código, descripción o código alternativo" oninput="filtrarSeteo(this.value)"><select id="seteoFiltroTipo" onchange="seteoFiltro.tipoUbicacion=this.value;filtrarSeteo()"><option value="">Tipo ubicación sugerida</option></select><select id="seteoFiltroAsignacion" onchange="seteoFiltro.tipoAsignacion=this.value;filtrarSeteo()"><option value="">Tipo asignación</option><option>PRIME</option><option>BALDA</option><option>UNIDAD</option></select></div>
    <div id="seteoTabla"></div><div id="seteoModal" hidden></div></div>`;
  const tipos = [...new Set(seteoUbicaciones.map(r => r.tipoUbicacion).filter(Boolean))].sort();
  document.getElementById('seteoFiltroTipo').innerHTML += tipos.map(t => `<option>${htmlSeguro(t)}</option>`).join('');
  filtrarSeteo();
}

function filtrarSeteo(texto) {
  if (typeof texto === 'string') seteoFiltro.texto = texto;
  const q = normalizar(seteoFiltro.texto);
  seteoVisibles = seteoFilas.filter(r => (!q || [r.codigo, r.alt, r.descripcion].join(' ').toUpperCase().includes(q)) && (!seteoFiltro.tipoAsignacion || r.tipoAsignacion === seteoFiltro.tipoAsignacion));
  document.getElementById('seteoKpis').innerHTML = [['Productos', seteoVisibles.length], ['Bultos LPN', seteoVisibles.reduce((s,r) => s+r.bultos,0)], ['Sin máximo aprendido', seteoVisibles.filter(r => !r.max).length], ['Con ubicación sugerida', seteoVisibles.filter(r => r.ubicacion).length]].map((x,i) => `<div class="seteo-kpi k${i}"><span>${x[0]}</span><strong>${fmt(x[1])}</strong></div>`).join('');
  document.getElementById('seteoTabla').innerHTML = `<div class="seteo-table-wrap"><table class="seteo-table"><thead><tr><th>COD-ALTERNO</th><th>CODIGO</th><th>DESCRIPCION</th><th>UXB</th><th>MAX</th><th>TIPO ASIGNACION</th><th>UBICACION SUGERIDA</th><th>ACCION</th></tr></thead><tbody>${seteoVisibles.map(r => `<tr><td>${htmlSeguro(r.alt)}</td><td><strong>${htmlSeguro(r.codigo)}</strong><small>${fmt(r.lpns.size)} LPN · ${fmt(r.bultos)} bultos</small></td><td>${htmlSeguro(r.descripcion)}</td><td>${fmt(r.uxb)}</td><td><input class="seteo-cell-input" type="number" min="0" value="${r.max || ''}" onchange='actualizarSeteo(${JSON.stringify(r.codigo)}, "max", this.value)'></td><td><select class="seteo-cell-input" onchange='actualizarSeteo(${JSON.stringify(r.codigo)}, "tipoAsignacion", this.value)'>${['PRIME','BALDA','UNIDAD'].map(t => `<option ${r.tipoAsignacion === t ? 'selected' : ''}>${t}</option>`).join('')}</select></td><td><input class="seteo-cell-input seteo-ubi-input" value="${htmlSeguro(r.ubicacion)}" placeholder="Elegir ubicación" onchange='actualizarSeteo(${JSON.stringify(r.codigo)}, "ubicacion", this.value)'></td><td><button class="seteo-action" onclick='abrirSelectorUbicacion(${JSON.stringify(r.codigo)})'>Buscar</button></td></tr>`).join('')}</tbody></table></div>`;
}

function actualizarSeteo(codigo, campoActual, valor) {
  const row = seteoFilas.find(r => r.codigo === codigo);
  if (!row) return;
  if (campoActual === 'max') row.max = num(valor);
  if (campoActual === 'tipoAsignacion') row.tipoAsignacion = limpiar(valor).toUpperCase();
  if (campoActual === 'ubicacion') { row.ubicacion = limpiar(valor); row.ubicacionManual = true; }
}

function abrirSelectorUbicacion(codigo) {
  seteoSeleccion = codigo;
  const modal = document.getElementById('seteoModal');
  modal.hidden = false;
  modal.innerHTML = `<div class="seteo-modal-backdrop" onclick="cerrarSelectorUbicacion(event)"><div class="seteo-modal" onclick="event.stopPropagation()"><div class="section-head"><h2>Seleccionar ubicación</h2><button onclick="cerrarSelectorUbicacion()">Cerrar</button></div><div class="filters"><input id="seteoUbicBuscar" class="search" placeholder="Buscar ubicación, código o descripción" oninput="filtrarUbicacionesSeteo()"><select id="seteoUbicTipo" onchange="filtrarUbicacionesSeteo()"><option value="">Todos los tipos</option></select><select id="seteoUbicAsignacion" onchange="filtrarUbicacionesSeteo()"><option value="">Todos los tipos de asignación</option>${['PRIME','BALDA','UNIDAD'].map(t => `<option>${t}</option>`).join('')}</select><select id="seteoUbicPasillo" onchange="filtrarUbicacionesSeteo()"><option value="">Todos los pasillos</option>${[1,2,3,4,5,6,7,8,9,11,12].map(p => `<option value="${p}">P${p}</option>`).join('')}</select></div><div id="seteoUbicTabla"></div></div></div>`;
  const tipos = [...new Set(seteoUbicaciones.map(r => r.tipoUbicacion).filter(Boolean))].sort();
  document.getElementById('seteoUbicTipo').innerHTML += tipos.map(t => `<option>${htmlSeguro(t)}</option>`).join('');
  filtrarUbicacionesSeteo();
}

function filtrarUbicacionesSeteo() {
  const q = normalizar(document.getElementById('seteoUbicBuscar')?.value);
  const tipo = document.getElementById('seteoUbicTipo')?.value;
  const asignacion = document.getElementById('seteoUbicAsignacion')?.value;
  const pasillo = document.getElementById('seteoUbicPasillo')?.value;
  const filas = seteoUbicaciones.filter(r => (!q || [r.ubicacion,r.codigo,r.descripcion].join(' ').toUpperCase().includes(q)) && (!tipo || r.tipoUbicacion === tipo) && (!asignacion || r.tipoAsignacion.toUpperCase() === asignacion) && (!pasillo || r.pasillo === pasillo));
  document.getElementById('seteoUbicTabla').innerHTML = tablaConId('tablaSelectorSeteo', ['Ubicacion','Codigo seteado','Descripcion','Tipo asignacion','Tipo ubicacion','Accion'], filas.map(r => `<tr><td><strong>${htmlSeguro(r.ubicacion)}</strong></td><td>${htmlSeguro(r.producto)}</td><td>${htmlSeguro(r.descripcion)}</td><td>${htmlSeguro(r.tipoAsignacion || 'Sin dato')}</td><td>${htmlSeguro(r.tipoUbicacion || 'Sin dato')}</td><td><button class="seteo-action" onclick='usarUbicacionSeteo(${JSON.stringify(r.ubicacion)})'>Usar ubicación</button></td></tr>`), 'No hay ubicaciones para este filtro.');
}

function usarUbicacionSeteo(ubicacion) {
  const row = seteoFilas.find(r => r.codigo === seteoSeleccion);
  if (row) { row.ubicacion = ubicacion; row.ubicacionManual = true; }
  cerrarSelectorUbicacion();
  filtrarSeteo();
}

function cerrarSelectorUbicacion(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('seteoModal'); if (modal) { modal.hidden = true; modal.innerHTML = ''; }
  seteoSeleccion = null;
}

function exportarSeteo() {
  descargarExcelHojas('seteo_productos', [{ nombre:'Seteo', filas: [['COD_ALT','CODIGO','DESCRIPCION','UXB','BULTOS_LPN','UNIDADES_LPN','LPNS','MAX','TIPO_ASIGNACION','UBICACION_SUGERIDA'], ...seteoVisibles.map(r => [r.alt,r.codigo,r.descripcion,r.uxb,r.bultos,r.unidades,[...r.lpns].join(', '),r.max,r.tipoAsignacion,r.ubicacion])] }]);
}
