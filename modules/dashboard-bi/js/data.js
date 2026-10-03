const SHEET_ID = "1fMEnjNjCZf0c-9VPmeHOQnFERXy5jz7XJ2lY64tblRc";
const PEDIDO_SHEET_ID = "1-v6vXjHpLlIn0-_lVZw0BtGopnxSHH0zqoOrW8aBwcg";
const RECEPCION_PROVEEDORES_SHEET_ID = "18iiFahjssG-2Or8HE9KjBer3DcuG0mDaMpxZj-rqycI";
const HOJAS = {
  picking: "PICKING",
  case: "case",
  tareas: "tareas",
  asignacion: "asignacion",
  recepcion: "RECEPCION",
  carga: "CARGA",
  cartones: "CARTONES",
  productos: "PRODUCTOS",
  ubicaciones: "UBICACIONES",
  usuarios: "USUARIO",
  proveedoresResumen: "RESUMEN"
};

let dataBI = [];
let dataPicking = [];
let dataCase = [];
let dataTareas = [];
let dataAsignacion = [];
let dataRecepcion = [];
let dataCarga = [];
let dataCartones = [];
let dataProductos = [];
let dataUbicaciones = [];
let dataUsuarios = [];
let dataRecepcionProveedoresResumen = [];
let dataPedido = [];
let datosListos = false;

async function cargarHojaDesde(sheetId, nombre) {
  const url = `https://opensheet.elk.sh/${sheetId}/${encodeURIComponent(nombre)}`;
  try {
    if (location.protocol === "file:") throw new Error("carga local");
    if (window.parent !== window && typeof window.parent.ancCargarJson === "function") {
      return await window.parent.ancCargarJson(url);
    }
  } catch (error) {}
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText || ""}`.trim());
  return await res.json();
}

function cargarHoja(nombre) {
  return cargarHojaDesde(SHEET_ID, nombre);
}

function estado(texto) {
  const el = document.getElementById("estadoCarga");
  if (el) el.textContent = texto;
}

function dataDemo() {
  return [
    { FECHA: "2026-05-20", AREA: "Picking", ESTADO: "Completado", USUARIO: "Equipo A", CATEGORIA: "Bultos", VALOR: 1280, DESTINO: "1304" },
    { FECHA: "2026-05-20", AREA: "Slotting", ESTADO: "Pendiente", USUARIO: "Equipo B", CATEGORIA: "Productos", VALOR: 84, DESTINO: "1834" },
    { FECHA: "2026-05-21", AREA: "Inventario", ESTADO: "Alerta", USUARIO: "Equipo C", CATEGORIA: "Ubicaciones", VALOR: 42, DESTINO: "2529" },
    { FECHA: "2026-05-21", AREA: "Picking", ESTADO: "Completado", USUARIO: "Equipo A", CATEGORIA: "Bultos", VALOR: 1460, DESTINO: "2287" },
    { FECHA: "2026-05-22", AREA: "Bloqueo", ESTADO: "Pendiente", USUARIO: "Equipo B", CATEGORIA: "Productos", VALOR: 31, DESTINO: "2596" },
    { FECHA: "2026-05-22", AREA: "Puntos control", ESTADO: "Alerta", USUARIO: "Equipo C", CATEGORIA: "Bultos", VALOR: 590, DESTINO: "1304" }
  ];
}

function pickingDemo() {
  return [
    { "DESTINO": "1623", "LOCAL": "ALAMEDA 2 TRU MS", "NRO ORDEN": "ORDSPSA9170001955504", "TIPO ASGIN": "FULL-CONTAINER", "NRO LPN": "FCEH2605043614", "CODIGO": "2200201831764", "COD ALTERN": "20183176", "DESCRIPCION": "SENSOFLUOR CR DENT REGULAR 3UN 75G", "USUARIO PICKING": "SP76148786", "BULTOS": "2", "FECHA PICK": "2026-05-09 13:48:24" },
    { "DESTINO": "2749", "LOCAL": "SPSA BOLIVAR26 TRU MS", "NRO ORDEN": "TRF00108381001", "TIPO ASGIN": "DISTRIBUTE-LPN", "NRO LPN": "IC96200516128", "CODIGO": "7750020541177", "COD ALTERN": "32738", "DESCRIPCION": "BELL S GALLETAS SALADITAS UN6UN", "USUARIO PICKING": "SP70686369", "BULTOS": "80", "FECHA PICK": "2026-05-09 08:29:39" },
    { "DESTINO": "2346", "LOCAL": "RIVERA5 TRU MS", "NRO ORDEN": "TRF00108380942", "TIPO ASGIN": "DISTRIBUTE-LPN", "NRO LPN": "IC96200516128", "CODIGO": "7750020541177", "COD ALTERN": "32738", "DESCRIPCION": "BELL S GALLETAS SALADITAS UN6UN", "USUARIO PICKING": "SP74283955", "BULTOS": "64", "FECHA PICK": "2026-05-09 09:18:07" },
    { "DESTINO": "1583", "LOCAL": "JESUSX1 TRU MS", "NRO ORDEN": "TRF00108380829", "TIPO ASGIN": "DISTRIBUTE-LPN", "NRO LPN": "IC96200516129", "CODIGO": "7750243062282", "COD ALTERN": "20501355", "DESCRIPCION": "PRODUCTO DEMO OPERATIVO", "USUARIO PICKING": "SP71203243", "BULTOS": "42", "FECHA PICK": "2026-05-09 10:01:05" },
    { "DESTINO": "1723", "LOCAL": "SPSA HUANUCO21 CHB MS", "NRO ORDEN": "TRF00108380842", "TIPO ASGIN": "ORDER-PICK", "NRO LPN": "CT9620000602942", "CODIGO": "7750182000703", "COD ALTERN": "2007003", "DESCRIPCION": "COCA COLA GASEOSA SIN AZUCAR BT 1 5 L", "USUARIO PICKING": "SP75251577", "BULTOS": "18.5", "FECHA PICK": "2026-05-09 14:02:36" },
    { "DESTINO": "1870", "LOCAL": "BELLA CHB MS", "NRO ORDEN": "TRF00108380843", "TIPO ASGIN": "DISTRIBUTE-LPN", "NRO LPN": "CT9620000604035", "CODIGO": "2200205687640", "COD ALTERN": "20568764", "DESCRIPCION": "MISTRAL LAV LIQ LIMON BT 1L", "USUARIO PICKING": "SP77370908", "BULTOS": "33", "FECHA PICK": "2026-05-09 15:06:32" }
  ];
}

function caseDemo() {
  return [
    { "Tipo Asignac": "Interno Bulk Pick", "Estado": "terminado", "QtyAsgn Cases": "120", "Usua Pick": "SP76148786", "Fe Y Hr Modif": "2026-05-09 08:30", "Destino": "1263", "Nro LPN": "CT962CASE001" },
    { "Tipo Asignac": "Interno Bulk Pick", "Estado": "asignados", "QtyAsgn Cases": "80", "Usua Pick": "SP70686369", "Fe Y Hr Modif": "2026-05-09 10:15", "Destino": "1405", "Nro LPN": "CT962CASE002" },
    { "Tipo Asignac": "Interno Bulk Pick", "Estado": "terminado", "QtyAsgn Cases": "95", "Usua Pick": "SP74283955", "Fe Y Hr Modif": "2026-05-09 11:20", "Destino": "2265", "Nro LPN": "CT962CASE003" },
    { "Tipo Asignac": "Interno Bulk Pick", "Estado": "cancelado", "QtyAsgn Cases": "12", "Usua Pick": "SP77370908", "Fe Y Hr Modif": "2026-05-09 12:10", "Destino": "1300", "Nro LPN": "CT962CASE004" }
  ];
}

function tareasDemo() {
  return [
    { "Nro Tarea": "T-1001", "Estado": "Terminado", "Fe Y Hr Modif": "2026-05-09 08:20" },
    { "Nro Tarea": "T-1002", "Estado": "Terminado", "Fe Y Hr Modif": "2026-05-09 09:10" },
    { "Nro Tarea": "T-1003", "Estado": "Listo", "Fe Y Hr Modif": "2026-05-09 10:15" },
    { "Nro Tarea": "T-1004", "Estado": "Procesam Iniciado", "Fe Y Hr Modif": "2026-05-09 11:25" },
    { "Nro Tarea": "T-1005", "Estado": "Terminado", "Fe Y Hr Modif": "2026-05-09 12:40" }
  ];
}

function asignacionDemo() {
  return [
    { "Nro Tarea": "T-1001", "Estado": "Terminado", "Un Asig": "420", "Usua Pick": "CT7HKQ9WMR", "Fe Y Hr Modif": "2026-05-09 08:30" },
    { "Nro Tarea": "T-1002", "Estado": "Finalizada", "Un Asig": "385", "Usua Pick": "TK6QXPR7MV", "Fe Y Hr Modif": "2026-05-09 09:15" },
    { "Nro Tarea": "T-1003", "Estado": "Asignados", "Un Asig": "220", "Usua Pick": "HV8TKQ6PMX", "Fe Y Hr Modif": "2026-05-09 10:20" },
    { "Nro Tarea": "T-1004", "Estado": "Asignados", "Un Asig": "180", "Usua Pick": "CT7HKQ9WMR", "Fe Y Hr Modif": "2026-05-09 11:35" },
    { "Nro Tarea": "T-1005", "Estado": "Terminado", "Un Asig": "310", "Usua Pick": "HV8TKQ6PMX", "Fe Y Hr Modif": "2026-05-09 12:45" }
  ];
}

function recepcionDemo() {
  return [
    { "CODIGO PROVEE": "", "NOM PROVEEDOR": "", "NRO ASN": "OS91700000693764", "LPN": "500000139788980006", "CODIGO": "2200205692873", "DESCRIPCION": "CLEAN LINE SUAV LIBRE ENJ PRIMAV DP200ML", "BULTOS PROGRAMADOS": "90", "BULTOS RECIBIDOS": "90", "USU RECEP": "SPO73483889", "Fe Recepcion": "2026-05-09 10:08:04" },
    { "CODIGO PROVEE": "", "NOM PROVEEDOR": "", "NRO ASN": "OS91700000693764", "LPN": "500000139788980006", "CODIGO": "7750885024938", "DESCRIPCION": "DUKE ALIM PERROS AD SB CARNES 25 KG", "BULTOS PROGRAMADOS": "4", "BULTOS RECIBIDOS": "4", "USU RECEP": "SPO73483889", "Fe Recepcion": "2026-05-09 10:09:04" },
    { "CODIGO PROVEE": "2041394056", "NOM PROVEEDOR": "EMBOTELLADORA SAN MIGUEL DEL SUR S", "NRO ASN": "OS204000001", "LPN": "500000139810980006", "CODIGO": "7750402004207", "DESCRIPCION": "BEBIDA DEMO", "BULTOS PROGRAMADOS": "120", "BULTOS RECIBIDOS": "120", "USU RECEP": "SP76148786", "Fe Recepcion": "2026-05-09 13:42:55" },
    { "CODIGO PROVEE": "2029718245", "NOM PROVEEDOR": "SNACKS AMERICA LATINA S.R.L.", "NRO ASN": "OS202000001", "LPN": "500000139830620008", "CODIGO": "7750885026369", "DESCRIPCION": "SNACK DEMO", "BULTOS PROGRAMADOS": "80", "BULTOS RECIBIDOS": "78", "USU RECEP": "SP77427752", "Fe Recepcion": "2026-05-09 13:43:00" },
    { "CODIGO PROVEE": "", "NOM PROVEEDOR": "", "NRO ASN": "ILE917000001", "LPN": "ILE00001", "CODIGO": "000", "DESCRIPCION": "EXCLUIDO DEMO", "BULTOS PROGRAMADOS": "10", "BULTOS RECIBIDOS": "10", "USU RECEP": "SP000", "Fe Recepcion": "2026-05-09 13:45:00" }
  ];
}

function proveedoresResumenDemo() {
  return [
    { "Proveedor": "2041394056", "Nombre Proveedor": "EMBOTELLADORA SAN MIGUEL DEL SUR S", "Un Req": "120" },
    { "Proveedor": "2029718245", "Nombre Proveedor": "SNACKS AMERICA LATINA S.R.L.", "Un Req": "80" }
  ];
}

function cargaDemo() {
  return [
    { "Nro Carga": "OS96200000695964", "No-LPN Paletas": "10", "Nro CamiÃ³n": "ABC-123", "Paradas": "2", "Fe Y Hr Modif": "2026-05-09 12:52:07" },
    { "Nro Carga": "OS96200000695965", "No-LPN Paletas": "8", "Nro CamiÃ³n": "DEF-456", "Paradas": "1", "Fe Y Hr Modif": "2026-05-09 20:15:07" },
    { "Nro Carga": "OS96200000695966", "No-LPN Paletas": "6", "Nro CamiÃ³n": "GHI-789", "Paradas": "3", "Fe Y Hr Modif": "2026-05-09 22:32:07" }
  ];
}

function cartonesDemo() {
  return [
    { "Nro Carga": "OS96200000695964", "Nro Pallet": "01PL96200297006", "Codigo": "20138796", "Destino": "1263", "UnAct": "240" },
    { "Nro Carga": "OS96200000695964", "Nro Pallet": "01PL96200297006", "Codigo": "29856", "Destino": "1263", "UnAct": "204" },
    { "Nro Carga": "OS96200000695965", "Nro Pallet": "01PL96200297361", "Codigo": "20501355", "Destino": "1623", "UnAct": "960" },
    { "Nro Carga": "OS96200000695966", "Nro Pallet": "01PL96200296082", "Codigo": "20468442", "Destino": "2749", "UnAct": "504" }
  ];
}

function productosDemo() {
  return [
    { "Cod Barra": "20138796", "Descripcion": "PRODUCTO DEMO BAZAR", "Std Case Qty": "10", "Costo Unidad": "1.20", "Jerarq1": "BAZAR" },
    { "Cod Barra": "29856", "Descripcion": "PRODUCTO DEMO BEBIDAS", "Std Case Qty": "12", "Costo Unidad": "0.95", "Jerarq1": "BEBIDAS" },
    { "Cod Barra": "20501355", "Descripcion": "PRODUCTO DEMO OPERATIVO", "Std Case Qty": "12", "Costo Unidad": "1.65", "Jerarq1": "BEBIDAS" },
    { "Cod Barra": "20468442", "Descripcion": "PRODUCTO DEMO COMESTIBLES", "Std Case Qty": "12", "Costo Unidad": "1.35", "Jerarq1": "COMESTIBLES" }
  ];
}

function ubicacionesDemo() {
  return [
    { "UBICACION": "RESERVA", "CODIGO PRODUCTO": "7750182000703", "DESCRIPCION": "COCA COLA GASEOSA SIN AZUCAR BT 1 5 L", "BULTOS REQUERIDOS": "12" },
    { "UBICACION": "SIN STOCK", "CODIGO PRODUCTO": "7754014007106", "DESCRIPCION": "CLEAN POWER LEJIA TRADICIONAL", "BULTOS REQUERIDOS": "8" }
  ];
}

async function cargarDatos() {
  datosListos = false;
  estado("Cargando data...");

  if (!SHEET_ID) {
    dataBI = dataDemo();
    dataPicking = pickingDemo();
    dataCase = caseDemo();
    dataTareas = tareasDemo();
    dataAsignacion = asignacionDemo();
    dataRecepcion = recepcionDemo();
    dataCarga = cargaDemo();
    dataCartones = cartonesDemo();
    dataProductos = productosDemo();
    dataUbicaciones = ubicacionesDemo();
    dataUsuarios = [];
    dataRecepcionProveedoresResumen = proveedoresResumenDemo();
    dataPedido = [];
    datosListos = true;
    estado("Modo demo | Configura SHEET_ID");
    return;
  }

  try {
    dataPedido = await cargarHojaDesde(PEDIDO_SHEET_ID, "PEDIDO");
  } catch (error) {
    console.warn("No se pudo cargar PEDIDO para el panel ejecutivo.", error);
    dataPedido = [];
  }

  try {
    dataPicking = await cargarHoja(HOJAS.picking);
  } catch (error) {
    console.warn("No se pudo cargar PICKING, usando demo.", error);
    dataPicking = pickingDemo();
  }

  try {
    dataCase = await cargarHoja(HOJAS.case);
  } catch (error) {
    console.warn("No se pudo cargar CASE, usando demo.", error);
    dataCase = caseDemo();
  }

  try {
    dataTareas = await cargarHoja(HOJAS.tareas);
  } catch (error) {
    console.warn("No se pudo cargar tareas, usando demo.", error);
    dataTareas = tareasDemo();
  }

  try {
    dataAsignacion = await cargarHoja(HOJAS.asignacion);
  } catch (error) {
    console.warn("No se pudo cargar asignacion, usando demo.", error);
    dataAsignacion = asignacionDemo();
  }

  try {
    dataRecepcion = await cargarHoja(HOJAS.recepcion);
  } catch (error) {
    console.warn("No se pudo cargar RECEPCION, usando demo.", error);
    dataRecepcion = recepcionDemo();
  }

  try {
    dataCarga = await cargarHoja(HOJAS.carga);
  } catch (error) {
    console.warn("No se pudo cargar CARGA, usando demo.", error);
    dataCarga = cargaDemo();
  }

  try {
    dataCartones = await cargarHoja(HOJAS.cartones);
  } catch (error) {
    console.warn("No se pudo cargar CARTONES, usando demo.", error);
    dataCartones = cartonesDemo();
  }

  try {
    dataProductos = await cargarHoja(HOJAS.productos);
  } catch (error) {
    console.warn("No se pudo cargar PRODUCTOS, usando demo.", error);
    dataProductos = productosDemo();
  }

  try {
    dataUbicaciones = await cargarHoja(HOJAS.ubicaciones);
  } catch (error) {
    console.warn("No se pudo cargar UBICACIONES, usando demo.", error);
    dataUbicaciones = ubicacionesDemo();
  }

  try {
    dataUsuarios = await cargarHoja(HOJAS.usuarios);
  } catch (error) {
    console.warn("No se pudo cargar USUARIO, se mostrara el codigo.", error);
    dataUsuarios = [];
  }

  try {
    dataRecepcionProveedoresResumen = await cargarHojaDesde(RECEPCION_PROVEEDORES_SHEET_ID, HOJAS.proveedoresResumen);
  } catch (error) {
    console.warn("No se pudo cargar RESUMEN de proveedores, usando programado de recepcion.", error);
    dataRecepcionProveedoresResumen = [];
  }

  dataBI = dataPicking.map(r => ({
    FECHA: r["FECHA PICK"],
    AREA: "PICKING",
    ESTADO: r["TIPO ASGIN"],
    USUARIO: r["USUARIO PICKING"],
    CATEGORIA: r["TIPO ASGIN"],
    VALOR: r["BULTOS"],
    DESTINO: r["LOCAL"]
  }));
  datosListos = true;
  estado(`PICKING ${dataPicking.length} | CASE ${dataCase.length} | PICK ACTIVO ${dataTareas.length}/${dataAsignacion.length} | USUARIO ${dataUsuarios.length} | RECEPCION ${dataRecepcion.length} | DESPACHO ${dataCarga.length}/${dataCartones.length}`);
}

async function iniciarAplicacion() {
  document.getElementById("modulo").innerHTML = `<div class="loading">Cargando dashboard...</div>`;
  try {
    await cargarDatos();
    verResumenEjecutivo();
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
  document.getElementById("modulo").innerHTML = `
    <div class="error-box">
      <strong>No se pudieron cargar los datos.</strong>
      <p>${error.message || error}</p>
      <button onclick="recargarDatos()">Intentar nuevamente</button>
    </div>
  `;
}
