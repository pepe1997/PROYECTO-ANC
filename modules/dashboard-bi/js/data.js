const SHEET_ID = "1fMEnjNjCZf0c-9VPmeHOQnFERXy5jz7XJ2lY64tblRc";
const HOJAS = {
  picking: "PICKING",
  recepcion: "RECEPCION",
  despacho: "DESPACHO",
  pedido: "PEDIDO",
  ubicaciones: "UBICACIONES"
};

let dataBI = [];
let dataPicking = [];
let dataRecepcion = [];
let dataDespacho = [];
let dataPedido = [];
let dataUbicaciones = [];
let datosListos = false;

async function cargarHoja(nombre) {
  const url = `https://opensheet.elk.sh/${SHEET_ID}/${encodeURIComponent(nombre)}`;
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

function recepcionDemo() {
  return [
    { "CODIGO PROVEE": "", "NOM PROVEEDOR": "", "NRO ASN": "OS91700000693764", "LPN": "500000139788980006", "CODIGO": "2200205692873", "DESCRIPCION": "CLEAN LINE SUAV LIBRE ENJ PRIMAV DP200ML", "BULTOS PROGRAMADOS": "90", "BULTOS RECIBIDOS": "90", "USU RECEP": "SPO73483889", "Fe Recepcion": "2026-05-09 10:08:04" },
    { "CODIGO PROVEE": "", "NOM PROVEEDOR": "", "NRO ASN": "OS91700000693764", "LPN": "500000139788980006", "CODIGO": "7750885024938", "DESCRIPCION": "DUKE ALIM PERROS AD SB CARNES 25 KG", "BULTOS PROGRAMADOS": "4", "BULTOS RECIBIDOS": "4", "USU RECEP": "SPO73483889", "Fe Recepcion": "2026-05-09 10:09:04" },
    { "CODIGO PROVEE": "2041394056", "NOM PROVEEDOR": "EMBOTELLADORA SAN MIGUEL DEL SUR S", "NRO ASN": "OS204000001", "LPN": "500000139810980006", "CODIGO": "7750402004207", "DESCRIPCION": "BEBIDA DEMO", "BULTOS PROGRAMADOS": "120", "BULTOS RECIBIDOS": "120", "USU RECEP": "SP76148786", "Fe Recepcion": "2026-05-09 13:42:55" },
    { "CODIGO PROVEE": "2029718245", "NOM PROVEEDOR": "SNACKS AMERICA LATINA S.R.L.", "NRO ASN": "OS202000001", "LPN": "500000139830620008", "CODIGO": "7750885026369", "DESCRIPCION": "SNACK DEMO", "BULTOS PROGRAMADOS": "80", "BULTOS RECIBIDOS": "78", "USU RECEP": "SP77427752", "Fe Recepcion": "2026-05-09 13:43:00" },
    { "CODIGO PROVEE": "", "NOM PROVEEDOR": "", "NRO ASN": "ILE917000001", "LPN": "ILE00001", "CODIGO": "000", "DESCRIPCION": "EXCLUIDO DEMO", "BULTOS PROGRAMADOS": "10", "BULTOS RECIBIDOS": "10", "USU RECEP": "SP000", "Fe Recepcion": "2026-05-09 13:45:00" }
  ];
}

function despachoDemo() {
  return [
    { "NroPallet": "01PL96200297006", "Nro LPNs": "CT9620000602803", "Producto": "20138796", "Bultos": "24", "Nro Carga": "OS96200000695964", "Destino": "1263", "Nombre Destino": "BUENOS3 TRU MS", "Fe y Hr de Despacho": "2026-05-09 12:52:07", "Jerarq1": "BAZAR", "Hora": "12" },
    { "NroPallet": "01PL96200297006", "Nro LPNs": "CT9620000602803", "Producto": "29856", "Bultos": "17", "Nro Carga": "OS96200000695964", "Destino": "1263", "Nombre Destino": "BUENOS3 TRU MS", "Fe y Hr de Despacho": "2026-05-09 12:52:07", "Jerarq1": "BEBIDAS", "Hora": "12" },
    { "NroPallet": "01PL96200297361", "Nro LPNs": "CT9620000602864", "Producto": "20501355", "Bultos": "80", "Nro Carga": "OS96200000695965", "Destino": "1623", "Nombre Destino": "ALAMEDA 2 TRU MS", "Fe y Hr de Despacho": "2026-05-09 20:15:07", "Jerarq1": "BEBIDAS", "Hora": "20" },
    { "NroPallet": "01PL96200296082", "Nro LPNs": "CT9620000602900", "Producto": "20468442", "Bultos": "42", "Nro Carga": "OS96200000695966", "Destino": "2749", "Nombre Destino": "SPSA PETTION4 TRU MS", "Fe y Hr de Despacho": "2026-05-09 22:32:07", "Jerarq1": "COMESTIBLES", "Hora": "22" }
  ];
}

function pedidoDemo() {
  return [
    { "Fecha Orden": "2026-05-09", "Nro Orden": "TRF00108326211", "Estado": "Enviado", "Producto": "7750182000703", "Descripcion": "COCA COLA GASEOSA SIN AZUCAR BT 1 5 L", "Tienda": "ALAMEDA 2 TRU MS", "Bultos Ped": "120", "Bultos Asig": "120", "Bultos Emp": "100", "Bultos Env": "80", "Bultos No Asig": "0" },
    { "Fecha Orden": "2026-05-09", "Nro Orden": "TRF00108326212", "Estado": "Asignado", "Producto": "7754014007106", "Descripcion": "CLEAN POWER LEJIA TRADICIONAL", "Tienda": "SPSA PETTION4 TRU MS", "Bultos Ped": "90", "Bultos Asig": "82", "Bultos Emp": "40", "Bultos Env": "15", "Bultos No Asig": "8" },
    { "Fecha Orden": "2026-05-08", "Nro Orden": "TRF00108326213", "Estado": "Empacado", "Producto": "2200205687640", "Descripcion": "MISTRAL LAV LIQ LIMON BT 1L", "Tienda": "BUENOS3 TRU MS", "Bultos Ped": "60", "Bultos Asig": "60", "Bultos Emp": "60", "Bultos Env": "45", "Bultos No Asig": "0" }
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
    dataRecepcion = recepcionDemo();
    dataDespacho = despachoDemo();
    dataPedido = pedidoDemo();
    dataUbicaciones = ubicacionesDemo();
    datosListos = true;
    estado("Modo demo | Configura SHEET_ID");
    return;
  }

  try {
    dataPicking = await cargarHoja(HOJAS.picking);
  } catch (error) {
    console.warn("No se pudo cargar PICKING, usando demo.", error);
    dataPicking = pickingDemo();
  }

  try {
    dataRecepcion = await cargarHoja(HOJAS.recepcion);
  } catch (error) {
    console.warn("No se pudo cargar RECEPCION, usando demo.", error);
    dataRecepcion = recepcionDemo();
  }

  try {
    dataDespacho = await cargarHoja(HOJAS.despacho);
  } catch (error) {
    console.warn("No se pudo cargar DESPACHO, usando demo.", error);
    dataDespacho = despachoDemo();
  }

  try {
    dataPedido = await cargarHoja(HOJAS.pedido);
  } catch (error) {
    console.warn("No se pudo cargar PEDIDO, usando demo.", error);
    dataPedido = pedidoDemo();
  }

  try {
    dataUbicaciones = await cargarHoja(HOJAS.ubicaciones);
  } catch (error) {
    console.warn("No se pudo cargar UBICACIONES, usando demo.", error);
    dataUbicaciones = ubicacionesDemo();
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
  if (typeof modeloPedido === "function") {
    modeloPedido.cache = null;
    modeloPedido.firma = "";
  }
  if (typeof pedidoCache !== "undefined") pedidoCache = null;
  datosListos = true;
  estado(`PICKING ${dataPicking.length} | RECEPCION ${dataRecepcion.length} | DESPACHO ${dataDespacho.length} | PEDIDO ${dataPedido.length}`);
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
