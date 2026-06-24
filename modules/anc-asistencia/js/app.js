const SHEET_ID = "1jpqLXLcqeNEdIlenSBv6uufqLGHP20KefqXzIpiVFM0";
const MAX_HOJAS_NUMERADAS = 100;
const CLIENTES_PRINCIPALES = new Set(["CD OSLO TRUJILLO", "OSLO TRUJILLO"]);
const CLIENTES_EXTRA = new Set(["MULTIFORMATO TRUJILLO"]);
const CARGOS_MULTIFORMATO_PRINCIPAL = ["MONTACARG"];
const TURNOS = {
  DIA: { nombre: "DIA", entrada: "07:00", salida: "16:00", inicio: 7 * 60 },
  TARDE: { nombre: "TARDE", entrada: "12:00", salida: "21:00", inicio: 12 * 60 },
  NOCHE: { nombre: "NOCHE", entrada: "21:00", salida: "06:00", inicio: 21 * 60 }
};
const TOLERANCIA_MIN = 20;
const TOLERANCIA_SALIDA_MIN = 10;

let filasRaw = [];
let filas = [];
let filasExtra = [];
let hojasNumeradasCargadas = 0;
let turnosAprendidos = new Map();
let historialTurnos = new Map();
let vistaDia = "";
let turnoInicioSeleccionado = "DIA";
let horaCorteInicio = "07:20";
let turnoRegularizacion = "TODOS";
let informeAsistenciaTipo = "GENERAL";
let informeAsistenciaTurno = "TODOS";
let regularizaciones = JSON.parse(localStorage.getItem("anc_asistencia_regularizaciones") || "{}");
let turnosManuales = JSON.parse(localStorage.getItem("anc_asistencia_turnos_manuales") || "{}");

function limpiar(valor) {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

function normalizar(valor) {
  return limpiar(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function esCargoMultiformatoPrincipal(row) {
  const cargo = normalizar(row.Cargo);
  return CARGOS_MULTIFORMATO_PRINCIPAL.some(texto => cargo.includes(texto));
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

function fmt(valor) {
  return Number(valor || 0).toLocaleString("es-PE", { maximumFractionDigits: 2 });
}

function estado(texto) {
  const el = document.getElementById("estadoCarga");
  if (el) el.textContent = texto;
}

function parseFechaLatina(valor) {
  const texto = limpiar(valor);
  const partes = texto.split(/[\/-]/);
  if (partes.length !== 3) return null;
  const [d, m, y] = partes.map(Number);
  if (!d || !m || !y) return null;
  return new Date(y, m - 1, d);
}

function fechaIso(valor) {
  const fecha = parseFechaLatina(valor);
  if (!fecha) return "";
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function fechaCorta(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function nombreDia(iso) {
  const fecha = new Date(`${iso}T00:00:00`);
  return ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"][fecha.getDay()] || "";
}

function parseHoraMin(valor) {
  const texto = limpiar(valor);
  const partes = texto.split(":").map(Number);
  if (partes.length < 2 || !Number.isFinite(partes[0]) || !Number.isFinite(partes[1])) return null;
  return partes[0] * 60 + partes[1] + ((partes[2] || 0) / 60);
}

function horasEntre(entrada, salida, turno) {
  const ini = parseHoraMin(entrada);
  const fin = parseHoraMin(salida);
  if (ini === null || fin === null) return 0;
  let diff = fin - ini;
  if (diff < 0 || turno === "NOCHE") diff += 1440;
  return diff / 60;
}

function finEsperadoTurno(row) {
  const fecha = new Date(`${row.fecha}T00:00:00`);
  if (Number.isNaN(fecha.getTime()) || !TURNOS[row.turno]) return null;
  const [hora, minuto] = TURNOS[row.turno].salida.split(":").map(Number);
  if (row.turno === "NOCHE") fecha.setDate(fecha.getDate() + 1);
  fecha.setHours(hora, minuto, 0, 0);
  return fecha;
}

function turnoEnCurso(row, ahora = new Date()) {
  const fin = finEsperadoTurno(row);
  return Boolean(row.asistio && fin && ahora < fin);
}

function parseHorasTrabajadas(valor) {
  const texto = limpiar(valor);
  if (!texto) return 0;
  const partes = texto.split(":").map(Number);
  if (partes.length >= 2 && Number.isFinite(partes[0]) && Number.isFinite(partes[1])) {
    return partes[0] + partes[1] / 60 + ((partes[2] || 0) / 3600);
  }
  const n = parseFloat(texto.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function esSinMarcaFecha(valor) {
  return limpiar(valor) === "31/12/1969" || fechaIso(valor).startsWith("1969-");
}

async function cargarHoja(nombre) {
  const url = `https://opensheet.elk.sh/${SHEET_ID}/${encodeURIComponent(nombre)}`;
  try {
    if (location.protocol === "file:") throw new Error("carga local");
    if (window.parent !== window && typeof window.parent.ancCargarJson === "function") {
      const data = await window.parent.ancCargarJson(url);
      return Array.isArray(data) ? data.map(r => ({ ...r, __hoja: nombre })) : [];
    }
  } catch (error) {}
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo cargar hoja ${nombre}`);
  const data = await res.json();
  return Array.isArray(data) ? data.map(r => ({ ...r, __hoja: nombre })) : [];
}

async function cargarHojasNumeradas() {
  const resultados = [];
  for (let numero = 1; numero <= MAX_HOJAS_NUMERADAS; numero += 1) {
    estado(`Cargando hoja ${numero}...`);
    try {
      resultados.push(await cargarHoja(String(numero)));
    } catch (error) {
      if (numero === 1) throw error;
      break;
    }
  }
  hojasNumeradasCargadas = resultados.length;
  return resultados;
}

async function cargarDatos() {
  estado("Cargando Google Sheet...");
  document.getElementById("app").innerHTML = `<div class="loading">Cargando asistencia...</div>`;
  const resultados = await cargarHojasNumeradas();
  filasRaw = resultados.flat();
  prepararData();
  estado(`Hojas ${hojasNumeradasCargadas} | Trujillo ${filas.length} registros | ${new Set(filas.map(r => r.fecha)).size} dias cargados`);
  verDashboard();
}

function prepararData() {
  const trujilloPrincipal = filasRaw.filter(r => CLIENTES_PRINCIPALES.has(normalizar(r.Cliente)));
  const trujilloExtra = filasRaw.filter(r => CLIENTES_EXTRA.has(normalizar(r.Cliente)));
  const multiformatoPrincipal = trujilloExtra.filter(esCargoMultiformatoPrincipal);
  const multiformatoExtra = trujilloExtra.filter(r => !esCargoMultiformatoPrincipal(r));
  const trujillo = [...trujilloPrincipal, ...trujilloExtra];
  turnosAprendidos = aprenderTurnos(trujillo);
  historialTurnos = construirHistorialTurnos(trujillo);
  filas = [...trujilloPrincipal, ...multiformatoPrincipal].map(normalizarFila).sort(ordenarFila);
  filasExtra = multiformatoExtra.map(normalizarFila).sort(ordenarFila);
  vistaDia = fechasDisponibles()[0] || "";
}

function ordenarFila(a, b) {
  return a.fecha.localeCompare(b.fecha) || a.turno.localeCompare(b.turno) || a.apellido.localeCompare(b.apellido) || a.nombre.localeCompare(b.nombre);
}

function aprenderTurnos(data) {
  const conteo = new Map();
  data.forEach(r => {
    const dni = limpiar(r.DNI);
    const turno = normalizar(r["Turno Automatico"]);
    if (!dni || !TURNOS[turno] || esSinMarcaFecha(r["Fecha Entrada"])) return;
    if (!conteo.has(dni)) conteo.set(dni, {});
    conteo.get(dni)[turno] = (conteo.get(dni)[turno] || 0) + 1;
  });
  const aprendido = new Map();
  conteo.forEach((items, dni) => {
    const ganador = Object.entries(items).sort((a, b) => b[1] - a[1])[0];
    if (ganador) aprendido.set(dni, ganador[0]);
  });
  return aprendido;
}

function construirHistorialTurnos(data) {
  const historial = new Map();
  data.forEach(r => {
    const dni = limpiar(r.DNI);
    const fecha = fechaIso(r.Fecha);
    const turno = normalizar(r["Turno Automatico"]);
    if (!dni || !fecha || !TURNOS[turno] || esSinMarcaFecha(r["Fecha Entrada"])) return;
    if (!historial.has(dni)) historial.set(dni, []);
    historial.get(dni).push({ fecha, turno });
  });
  historial.forEach(items => items.sort((a, b) => a.fecha.localeCompare(b.fecha)));
  return historial;
}

function turnoAnteriorDni(dni, fecha) {
  const anteriores = (historialTurnos.get(dni) || []).filter(r => r.fecha < fecha);
  if (!anteriores.length) return "";
  const conteo = {};
  anteriores.forEach(r => {
    conteo[r.turno] = (conteo[r.turno] || 0) + 1;
  });
  return Object.entries(conteo).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function turnoPosteriorDni(dni, fecha) {
  const posterior = (historialTurnos.get(dni) || []).find(r => r.fecha > fecha);
  return posterior?.turno || "";
}

function inferirTurnoPorHora(horaMin) {
  if (horaMin === null) return "";
  const opciones = Object.values(TURNOS).map(t => {
    let diff = Math.abs(horaMin - t.inicio);
    diff = Math.min(diff, 1440 - diff);
    return { turno: t.nombre, diff };
  });
  return opciones.sort((a, b) => a.diff - b.diff)[0]?.turno || "";
}

function turnoManualDni(dni) {
  const turno = normalizar(turnosManuales[dni]);
  return TURNOS[turno] || turno === "SIN TURNO" ? turno : "";
}

function normalizarFila(r) {
  const dni = limpiar(r.DNI);
  const fecha = fechaIso(r.Fecha);
  const turnoOriginal = normalizar(r["Turno Automatico"]);
  const fechaEntrada = limpiar(r["Fecha Entrada"]);
  const horaEntrada = limpiar(r["Hora Entrada"]);
  const horaMin = parseHoraMin(horaEntrada);
  const sinMarca = esSinMarcaFecha(fechaEntrada);
  const turnoAnterior = turnoAnteriorDni(dni, fecha);
  const turnoPosterior = turnoPosteriorDni(dni, fecha);
  const turnoManual = turnoManualDni(dni);
  const turno = turnoManual || (sinMarca
    ? turnoAnterior || turnoPosterior || "SIN TURNO"
    : TURNOS[turnoOriginal]
      ? turnoOriginal
      : turnoAnterior || turnoPosterior || turnosAprendidos.get(dni) || inferirTurnoPorHora(horaMin) || "SIN TURNO");
  const turnoInfo = TURNOS[turno];
  const limite = turnoInfo ? turnoInfo.inicio + TOLERANCIA_MIN : null;
  const estadoLaboral = normalizar(r.Estado) || "SIN ESTADO";
  const justificado = sinMarca && estadoLaboral !== "ACTIVO";
  const tarde = !sinMarca && turnoInfo && horaMin > limite;
  const puntual = !sinMarca && turnoInfo && horaMin <= limite;
  const minutosTarde = tarde ? Math.max(0, Math.round(horaMin - limite)) : 0;
  const key = `${fecha}|${dni}|${limpiar(r.__hoja)}|${horaEntrada}|${limpiar(r["Hora Salida"])}`;
  const horasSistema = parseHorasTrabajadas(r["Hora Trabajadas"]);
  const horasCalculadas = horasEntre(horaEntrada, limpiar(r["Hora Salida"]), turno);

  const base = {
    key,
    hoja: limpiar(r.__hoja),
    fecha,
    fechaTexto: limpiar(r.Fecha),
    dni,
    nombre: limpiar(r.Nombre),
    apellido: limpiar(r.Apellidos),
    personal: `${limpiar(r.Nombre)} ${limpiar(r.Apellidos)}`.trim(),
    cliente: limpiar(r.Cliente),
    area: limpiar(r.Area),
    cargo: limpiar(r.Cargo),
    estadoLaboral,
    turno,
    turnoOrigen: turnoManual
      ? "MANUAL"
      : sinMarca
      ? turnoAnterior ? "HISTORIAL ANTERIOR" : turnoPosterior ? "HISTORIAL POSTERIOR" : "SIN HISTORIAL"
      : TURNOS[turnoOriginal] ? "DATA" : turnoAnterior ? "HISTORIAL ANTERIOR" : turnoPosterior ? "HISTORIAL POSTERIOR" : turnosAprendidos.has(dni) ? "APRENDIDO" : "HORA",
    horaEntrada,
    fechaEntrada,
    horaSalida: limpiar(r["Hora Salida"]),
    fechaSalida: limpiar(r["Fecha Salida"]),
    horasTrabajadas: limpiar(r["Hora Trabajadas"]),
    horasSistema,
    horasCalculadas,
    sinMarca,
    puntual,
    tarde,
    justificado,
    asistio: !sinMarca,
    minutosTarde,
    resultado: justificado
      ? estadoLaboral
      : sinMarca
        ? "NO MARCO"
        : tarde
          ? "TARDANZA"
          : puntual
            ? "PUNTUAL"
            : "REVISAR TURNO"
  };
  return aplicarRegularizacion(base);
}

function aplicarRegularizacion(row) {
  const reg = regularizaciones[row.key];
  if (!reg) return row;
  const asistio = reg.asistio === "SI";
  const horaEntrada = limpiar(reg.horaEntrada) || row.horaEntrada;
  const horaSalida = limpiar(reg.horaSalida) || row.horaSalida;
  const horasRegularizadas = horasEntre(horaEntrada, horaSalida, row.turno);
  return {
    ...row,
    asistio,
    sinMarca: !asistio,
    horaEntrada,
    horaSalida,
    horasCalculadas: horasRegularizadas || row.horasCalculadas,
    resultado: asistio ? "REGULARIZADO ASISTIO" : "REGULARIZADO NO ASISTIO",
    regularizado: true,
    comentarioRegularizacion: limpiar(reg.comentario)
  };
}

function detectarIrregularidades(row, duplicados = new Set()) {
  const problemas = [];
  const jornadaMinima = 9;
  const jornadaMaxima = 9 + (TOLERANCIA_SALIDA_MIN / 60);
  const tieneEntrada = row.asistio && row.horaEntrada && row.horaEntrada !== "19:00:00";
  const tieneSalida = row.horaSalida && !esSinMarcaFecha(row.fechaSalida);
  const enCurso = turnoEnCurso(row);
  if (!row.asistio) problemas.push(row.justificado ? "SIN MARCA JUSTIFICADA" : "SIN MARCA");
  if (row.asistio && !tieneSalida && !enCurso) problemas.push("SOLO MARCO ENTRADA");
  if (!row.asistio && tieneSalida) problemas.push("SOLO MARCO SALIDA");
  if (row.asistio && !enCurso && row.horasCalculadas > 0 && row.horasCalculadas < jornadaMinima) problemas.push("MENOS DE 9 HORAS");
  if (row.asistio && !enCurso && row.horasCalculadas > jornadaMaxima) problemas.push("MAS DE 9 HORAS");
  if (duplicados.has(`${row.fecha}|${row.dni}`)) problemas.push("DNI DUPLICADO EN EL DIA");
  if (row.turno === "SIN TURNO" || row.resultado === "REVISAR TURNO") problemas.push("TURNO NO IDENTIFICADO");
  return problemas;
}

function keysDuplicadas(data) {
  const conteo = new Map();
  data.forEach(r => {
    const key = `${r.fecha}|${r.dni}`;
    conteo.set(key, (conteo.get(key) || 0) + 1);
  });
  return new Set(Array.from(conteo.entries()).filter(([, n]) => n > 1).map(([k]) => k));
}

function fechasDisponibles() {
  return Array.from(new Set(filas.map(r => r.fecha).filter(Boolean))).sort();
}

function resumen(data) {
  return {
    total: data.length,
    asistieron: data.filter(r => r.asistio).length,
    inasistencias: data.filter(r => !r.asistio).length,
    marcaron: data.filter(r => !r.sinMarca).length,
    puntual: data.filter(r => r.puntual).length,
    tardanza: data.filter(r => r.tarde).length,
    noMarco: data.filter(r => r.resultado === "NO MARCO").length,
    justificado: data.filter(r => r.justificado).length,
    revisar: data.filter(r => r.resultado === "REVISAR TURNO").length,
    personal: new Set(data.map(r => r.dni).filter(Boolean)).size
  };
}

function horaLimiteTurno(turno) {
  const info = TURNOS[turno];
  if (!info) return "";
  const minutos = info.inicio + TOLERANCIA_MIN;
  return `${String(Math.floor(minutos / 60) % 24).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}

function clasificarInicioTurno(row, horaCorte) {
  const turnoInfo = TURNOS[row.turno];
  const corte = parseHoraMin(horaCorte);
  const limite = turnoInfo ? turnoInfo.inicio + TOLERANCIA_MIN : null;
  const entrada = parseHoraMin(row.horaEntrada);
  const sinMarca = !row.asistio;

  if (row.justificado) return "JUSTIFICADO";
  if (!turnoInfo || corte === null) return "REVISAR";
  if (!sinMarca && entrada !== null) return entrada <= limite ? "ASISTIO" : "TARDANZA";
  return corte < limite ? "PENDIENTE" : "FALTA AL INICIO";
}

function datosInicioTurno() {
  return filas
    .filter(r => r.fecha === vistaDia && r.turno === turnoInicioSeleccionado)
    .map(r => ({ ...r, estadoInicio: clasificarInicioTurno(r, horaCorteInicio) }))
    .sort((a, b) => a.estadoInicio.localeCompare(b.estadoInicio) || a.apellido.localeCompare(b.apellido));
}

function kpi(label, value, note = "", clase = "") {
  return `<div class="kpi ${htmlSeguro(clase)}"><span>${htmlSeguro(label)}</span><strong>${htmlSeguro(value)}</strong>${note ? `<small>${htmlSeguro(note)}</small>` : ""}</div>`;
}

function tablaConId(id, headers, rows, empty = "Sin datos") {
  return `
    <div class="table-wrap">
      <table id="${htmlSeguro(id)}">
        <thead><tr>${headers.map(h => `<th>${htmlSeguro(h)}</th>`).join("")}</tr></thead>
        <tbody>${rows.join("") || `<tr><td colspan="${headers.length}">${htmlSeguro(empty)}</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function tablaDetalle(id, data) {
  return tablaConId(id, ["Fecha", "DNI", "Personal", "Cliente", "Turno", "Entrada", "Salida", "Estado laboral", "Resultado", "Min tarde", "Origen turno"], data.map(r => `
    <tr class="${r.resultado === "NO MARCO" || r.resultado === "REVISAR TURNO" ? "bad" : r.tarde ? "warn" : ""}">
      <td>${htmlSeguro(fechaCorta(r.fecha))}</td>
      <td>${htmlSeguro(r.dni)}</td>
      <td>${htmlSeguro(r.nombre)}</td>
      <td>${htmlSeguro(r.cliente)}</td>
      <td><strong>${htmlSeguro(r.turno)}</strong></td>
      <td>${htmlSeguro(r.sinMarca ? "SIN MARCA" : r.horaEntrada)}</td>
      <td>${htmlSeguro(r.horaSalida)}</td>
      <td>${htmlSeguro(r.estadoLaboral)}</td>
      <td><strong>${htmlSeguro(r.resultado)}</strong></td>
      <td class="number">${fmt(r.minutosTarde)}</td>
      <td>${htmlSeguro(r.turnoOrigen)}</td>
    </tr>
  `));
}

function tablaAsistenciaBase(id, data, empty = "Sin datos") {
  return tablaConId(id, ["Dia", "DNI", "Nombre", "Apellido", "Turno", "Asistio", "Cargo", "Entrada", "Salida", "Horas"], data.map(r => `
    <tr class="${r.asistio ? "" : "bad"}">
      <td>${htmlSeguro(`${nombreDia(r.fecha)} ${fechaCorta(r.fecha)}`)}</td>
      <td>${htmlSeguro(r.dni)}</td>
      <td>${htmlSeguro(r.nombre)}</td>
      <td>${htmlSeguro(r.apellido)}</td>
      <td><strong>${htmlSeguro(r.turno)}</strong></td>
      <td><strong>${htmlSeguro(r.asistio ? "SI" : "NO")}</strong></td>
      <td>${htmlSeguro(r.cargo)}</td>
      <td>${htmlSeguro(r.asistio ? r.horaEntrada : "SIN MARCA")}</td>
      <td>${htmlSeguro(r.horaSalida)}</td>
      <td class="number">${fmt(r.horasCalculadas || r.horasSistema)}</td>
    </tr>
  `), empty);
}

function tablaInasistenciaPorTurno(id, data) {
  const inasistencias = data
    .filter(r => !r.asistio)
    .sort((a, b) => a.turno.localeCompare(b.turno) || a.apellido.localeCompare(b.apellido));
  return tablaConId(id, ["Dia", "DNI", "Turno", "Nombre", "Apellido", "Asistio", "Cargo", "Estado", "Entrada", "Salida"], inasistencias.map(r => `
    <tr class="bad">
      <td>${htmlSeguro(`${nombreDia(r.fecha)} ${fechaCorta(r.fecha)}`)}</td>
      <td>${htmlSeguro(r.dni)}</td>
      <td><strong>${htmlSeguro(r.turno)}</strong></td>
      <td>${htmlSeguro(r.nombre)}</td>
      <td>${htmlSeguro(r.apellido)}</td>
      <td><strong>NO</strong></td>
      <td>${htmlSeguro(r.cargo)}</td>
      <td>${htmlSeguro(r.resultado)}</td>
      <td>${htmlSeguro(r.horaEntrada || "SIN MARCA")}</td>
      <td>${htmlSeguro(r.horaSalida)}</td>
    </tr>
  `), "Sin inasistencias para mostrar.");
}

function resumenPorTurno(data) {
  return Object.keys(TURNOS).map(turno => {
    const base = data.filter(r => r.turno === turno);
    return { turno, ...resumen(base) };
  });
}

function tablaResumenTurnos(id, data) {
  return tablaConId(id, ["Turno", "Personal", "Asistieron", "Inasistencias", "Tardanzas", "Horas prom."], resumenPorTurno(data).map(r => {
    const base = data.filter(x => x.turno === r.turno && x.asistio);
    const horasProm = base.reduce((a, b) => a + (b.horasCalculadas || b.horasSistema), 0) / (base.length || 1);
    return `
      <tr class="${r.inasistencias ? "warn" : ""}">
        <td><strong>${htmlSeguro(r.turno)}</strong></td>
        <td>${fmt(r.personal)}</td>
        <td>${fmt(r.asistieron)}</td>
        <td>${fmt(r.inasistencias)}</td>
        <td>${fmt(r.tardanza)}</td>
        <td class="number">${fmt(horasProm)}</td>
      </tr>
    `;
  }));
}

function graficoAsistencia(data, titulo = "Asistencia") {
  const r = resumen(data);
  const porcentaje = r.total ? (r.asistieron / r.total) * 100 : 0;
  return `
    <div class="visual-card">
      <div>
        <span class="visual-label">${htmlSeguro(titulo)}</span>
        <strong>${porcentaje.toFixed(1)}%</strong>
        <small>${fmt(r.asistieron)} asistieron de ${fmt(r.total)}</small>
      </div>
      <div class="donut" style="--pct:${porcentaje.toFixed(1)}">
        <span>${fmt(r.inasistencias)}<small>faltas</small></span>
      </div>
    </div>
  `;
}

function graficoTurnos(data, titulo = "Asistencia por turno") {
  const turnos = resumenPorTurno(data);
  const max = Math.max(...turnos.map(t => t.personal), 1);
  return `
    <div class="chart-block">
      <span class="visual-label">${htmlSeguro(titulo)}</span>
      ${turnos.map(t => `
        <div class="bar-item">
          <strong>${htmlSeguro(t.turno)}</strong>
          <div class="bar-track"><span style="width:${(t.asistieron / max) * 100}%"></span></div>
          <b>${fmt(t.asistieron)}</b>
          <small>${fmt(t.inasistencias)} faltas</small>
        </div>
      `).join("")}
    </div>
  `;
}

function graficoDias(diarios) {
  const max = Math.max(...diarios.map(d => d.personal), 1);
  return `
    <div class="chart-block">
      <span class="visual-label">Asistencia por dia</span>
      ${diarios.map(d => `
        <div class="bar-item">
          <strong>${htmlSeguro(nombreDia(d.fecha).slice(0, 3))}</strong>
          <div class="bar-track"><span style="width:${(d.asistieron / max) * 100}%"></span></div>
          <b>${fmt(d.asistieron)}</b>
          <small>${fmt(d.inasistencias)} faltas</small>
        </div>
      `).join("")}
    </div>
  `;
}

function consolidarPersonal() {
  const todo = [...filas, ...filasExtra];
  const mapa = new Map();
  todo.forEach(r => {
    if (!r.dni) return;
    if (!mapa.has(r.dni)) {
      mapa.set(r.dni, {
        dni: r.dni,
        nombre: r.nombre,
        apellido: r.apellido,
        cargo: r.cargo,
        area: r.area,
        cliente: r.cliente,
        estado: r.estadoLaboral,
        ultimaFecha: r.fecha,
        dias: 0,
        asistencias: 0,
        inasistencias: 0,
        turnos: {}
      });
    }
    const p = mapa.get(r.dni);
    p.dias += 1;
    if (r.asistio) p.asistencias += 1;
    else p.inasistencias += 1;
    if (TURNOS[r.turno] && r.asistio) p.turnos[r.turno] = (p.turnos[r.turno] || 0) + 1;
    if (r.fecha >= p.ultimaFecha) {
      p.nombre = r.nombre;
      p.apellido = r.apellido;
      p.cargo = r.cargo;
      p.area = r.area;
      p.cliente = r.cliente;
      p.estado = r.estadoLaboral;
      p.ultimaFecha = r.fecha;
    }
  });
  return Array.from(mapa.values()).map(p => ({
    ...p,
    turno: turnoManualDni(p.dni) || Object.entries(p.turnos).sort((a, b) => b[1] - a[1])[0]?.[0] || turnosAprendidos.get(p.dni) || "SIN TURNO",
    grupo: CLIENTES_EXTRA.has(normalizar(p.cliente)) ? "MULTIFORMATO EXTRA" : "PRINCIPAL"
  })).sort((a, b) => a.apellido.localeCompare(b.apellido) || a.nombre.localeCompare(b.nombre));
}

function restaurarCursorBusqueda(id, posicion) {
  const input = document.getElementById(id);
  if (!input) return;
  input.focus({ preventScroll: true });
  const cursor = Math.min(Number.isFinite(posicion) ? posicion : input.value.length, input.value.length);
  input.setSelectionRange(cursor, cursor);
}

function guardarTurnoManual(dni, turno) {
  const limpio = normalizar(turno);
  if (TURNOS[limpio] || limpio === "SIN TURNO") turnosManuales[dni] = limpio;
  else delete turnosManuales[dni];
  localStorage.setItem("anc_asistencia_turnos_manuales", JSON.stringify(turnosManuales));
  prepararData();
  verPersonal();
}

function selectorTurnoPersonal(p) {
  const manual = turnoManualDni(p.dni);
  const actual = manual || p.turno;
  return `
    <select class="mini" onchange="guardarTurnoManual('${htmlSeguro(p.dni)}', this.value)">
      ${["DIA", "TARDE", "NOCHE", "SIN TURNO"].map(turno => `<option value="${turno}" ${actual === turno ? "selected" : ""}>${turno}</option>`).join("")}
    </select>
  `;
}

function verPersonal() {
  const filtroActivo = document.getElementById("filtroPersonal");
  const cursorFiltro = filtroActivo?.selectionStart;
  const q = normalizar(filtroActivo?.value || "");
  const turno = document.getElementById("turnoPersonal")?.value || "TODOS";
  const grupo = document.getElementById("grupoPersonal")?.value || "TODOS";
  const base = consolidarPersonal();
  const data = base.filter(p =>
    (!q || [p.dni, p.nombre, p.apellido, p.cargo, p.area, p.cliente, p.estado, p.turno].map(normalizar).join(" ").includes(q)) &&
    (turno === "TODOS" || p.turno === turno) &&
    (grupo === "TODOS" || p.grupo === grupo)
  );

  document.getElementById("app").innerHTML = `
    <div class="section-head">
      <h2>Personal registrado</h2>
      <div class="filters">
        <input class="search" id="filtroPersonal" placeholder="Buscar DNI, nombre, cargo, area o cliente..." value="${htmlSeguro(document.getElementById("filtroPersonal")?.value || "")}" oninput="verPersonal()">
        <select id="turnoPersonal" onchange="verPersonal()">
          ${["TODOS", "DIA", "TARDE", "NOCHE", "SIN TURNO"].map(t => `<option value="${t}" ${t === turno ? "selected" : ""}>${t === "TODOS" ? "Todos los turnos" : t}</option>`).join("")}
        </select>
        <select id="grupoPersonal" onchange="verPersonal()">
          ${["TODOS", "PRINCIPAL", "MULTIFORMATO EXTRA"].map(g => `<option value="${g}" ${g === grupo ? "selected" : ""}>${g === "TODOS" ? "Todos los grupos" : g}</option>`).join("")}
        </select>
        <button onclick="exportarTablaVisible('tablaPersonal', 'personal_registrado')">Excel</button>
      </div>
    </div>
    <section class="kpi-grid daily-kpis">
      ${kpi("Personal visible", fmt(data.length))}
      ${kpi("Principal", fmt(data.filter(p => p.grupo === "PRINCIPAL").length))}
      ${kpi("Multiformato", fmt(data.filter(p => p.grupo === "MULTIFORMATO EXTRA").length))}
      ${kpi("Sin turno", fmt(data.filter(p => p.turno === "SIN TURNO").length), "", data.some(p => p.turno === "SIN TURNO") ? "warn" : "")}
      ${kpi("Activos", fmt(data.filter(p => p.estado === "ACTIVO").length))}
    </section>
    <section class="card report-card">
      ${tablaConId("tablaPersonal", ["DNI", "Nombre", "Apellido", "Turno", "Cargo", "Cliente", "Grupo", "Estado", "Dias registrados", "Asistencias", "Inasistencias", "Ultima fecha"], data.map(p => `
        <tr class="${p.turno === "SIN TURNO" ? "warn" : ""}">
          <td>${htmlSeguro(p.dni)}</td>
          <td>${htmlSeguro(p.nombre)}</td>
          <td>${htmlSeguro(p.apellido)}</td>
          <td>${selectorTurnoPersonal(p)}</td>
          <td>${htmlSeguro(p.cargo)}</td>
          <td>${htmlSeguro(p.cliente)}</td>
          <td>${htmlSeguro(p.grupo)}</td>
          <td>${htmlSeguro(p.estado)}</td>
          <td class="number">${fmt(p.dias)}</td>
          <td class="number">${fmt(p.asistencias)}</td>
          <td class="number">${fmt(p.inasistencias)}</td>
          <td>${htmlSeguro(fechaCorta(p.ultimaFecha))}</td>
        </tr>
      `), "Sin personal para los filtros seleccionados.")}
    </section>
  `;
  if (filtroActivo) restaurarCursorBusqueda("filtroPersonal", cursorFiltro);
}

function verDashboard() {
  const extra = resumen(filasExtra);
  const dias = fechasDisponibles();
  if (!vistaDia && dias.length) vistaDia = dias[0];
  const dataDia = filas.filter(r => r.fecha === vistaDia);
  const rDia = resumen(dataDia);
  const diarios = dias.map(d => ({ fecha: d, ...resumen(filas.filter(r => r.fecha === d)) }));
  document.getElementById("app").innerHTML = `
    <section class="hero compact-hero">
      <div>
        <span>ANC Logistica</span>
        <h2>Control diario de asistencia</h2>
      </div>
      <div class="day-picker">
        <label>Dia laborado</label>
        <select onchange="vistaDia=this.value;verDashboard()">
          ${dias.map(f => `<option value="${htmlSeguro(f)}" ${f === vistaDia ? "selected" : ""}>${htmlSeguro(nombreDia(f))} ${htmlSeguro(fechaCorta(f))}</option>`).join("")}
        </select>
      </div>
    </section>
    <section class="kpi-grid daily-kpis">
      ${kpi("Personal del dia", fmt(rDia.personal), "principal")}
      ${kpi("Asistieron", fmt(rDia.asistieron), `${fmt(rDia.total)} registros`)}
      ${kpi("Inasistencias", fmt(rDia.inasistencias), "sin marca", rDia.inasistencias ? "danger" : "")}
      ${kpi("Puntuales", fmt(rDia.puntual))}
      ${kpi("Tardanzas", fmt(rDia.tardanza), "20 min tolerancia", rDia.tardanza ? "warn" : "")}
      ${kpi("Multiformato", fmt(extra.total), "dato extra")}
    </section>
    <section class="dashboard-layout">
      <div class="card">
        ${graficoAsistencia(dataDia, `${nombreDia(vistaDia)} ${fechaCorta(vistaDia)}`)}
      </div>
      <div class="card">
        ${graficoTurnos(dataDia)}
      </div>
      <div class="card">
        ${graficoDias(diarios)}
      </div>
      <div class="card">
        ${graficoTurnos(filasExtra, "Multiformato extra")}
      </div>
    </section>
  `;
}

function cambiarTurnoInicio(turno) {
  turnoInicioSeleccionado = turno;
  horaCorteInicio = horaLimiteTurno(turno);
  verInicioTurno();
}

function verInicioTurno() {
  const fechas = fechasDisponibles();
  if (!vistaDia && fechas.length) vistaDia = fechas[0];
  const data = datosInicioTurno();
  const contar = estado => data.filter(r => r.estadoInicio === estado).length;
  const asistieron = contar("ASISTIO") + contar("TARDANZA");

  document.getElementById("app").innerHTML = `
    <div class="section-head">
      <h2>Inicio de turno</h2>
      <div class="filters">
        <select onchange="vistaDia=this.value;verInicioTurno()">
          ${fechas.map(f => `<option value="${htmlSeguro(f)}" ${f === vistaDia ? "selected" : ""}>${htmlSeguro(nombreDia(f))} ${htmlSeguro(fechaCorta(f))}</option>`).join("")}
        </select>
        <select onchange="cambiarTurnoInicio(this.value)">
          ${Object.keys(TURNOS).map(t => `<option value="${t}" ${t === turnoInicioSeleccionado ? "selected" : ""}>${t} ${TURNOS[t].entrada}</option>`).join("")}
        </select>
        <input class="time-input" type="time" value="${htmlSeguro(horaCorteInicio)}" onchange="horaCorteInicio=this.value;verInicioTurno()">
        <button onclick="exportarTablaVisible('tablaInicioTurno', 'inicio_turno_${turnoInicioSeleccionado.toLowerCase()}')">Excel inicio</button>
      </div>
    </div>
    <section class="kpi-grid daily-kpis">
      ${kpi("Programados", fmt(data.length), turnoInicioSeleccionado)}
      ${kpi("Asistieron", fmt(asistieron))}
      ${kpi("Puntuales", fmt(contar("ASISTIO")))}
      ${kpi("Tardanzas", fmt(contar("TARDANZA")), "", contar("TARDANZA") ? "warn" : "")}
      ${kpi("Faltas inicio", fmt(contar("FALTA AL INICIO")), "", contar("FALTA AL INICIO") ? "danger" : "")}
      ${kpi("Pendientes", fmt(contar("PENDIENTE")))}
      ${kpi("Justificados", fmt(contar("JUSTIFICADO")))}
    </section>
    <section class="dashboard-layout">
      <div class="card">
        ${graficoAsistenciaInicio(data)}
      </div>
      <div class="card">
        <div class="start-summary">
          <span class="visual-label">Corte del reporte</span>
          <strong>${htmlSeguro(horaCorteInicio)}</strong>
          <small>Limite con tolerancia: ${htmlSeguro(horaLimiteTurno(turnoInicioSeleccionado))}</small>
        </div>
      </div>
    </section>
    <section class="card report-card">
      ${tablaConId("tablaInicioTurno", ["DNI", "Nombre", "Apellido", "Cargo", "Turno", "Hora entrada", "Estado inicio"], data.map(r => `
        <tr class="${r.estadoInicio === "FALTA AL INICIO" ? "bad" : r.estadoInicio === "TARDANZA" ? "warn" : ""}">
          <td>${htmlSeguro(r.dni)}</td>
          <td>${htmlSeguro(r.nombre)}</td>
          <td>${htmlSeguro(r.apellido)}</td>
          <td>${htmlSeguro(r.cargo)}</td>
          <td><strong>${htmlSeguro(r.turno)}</strong></td>
          <td>${htmlSeguro(r.asistio ? r.horaEntrada : "SIN MARCA")}</td>
          <td><strong>${htmlSeguro(r.estadoInicio)}</strong></td>
        </tr>
      `), "Sin personal para el turno seleccionado.")}
    </section>
  `;
}

function graficoAsistenciaInicio(data) {
  const asistieron = data.filter(r => ["ASISTIO", "TARDANZA"].includes(r.estadoInicio)).length;
  const faltas = data.filter(r => r.estadoInicio === "FALTA AL INICIO").length;
  const porcentaje = data.length ? (asistieron / data.length) * 100 : 0;
  return `
    <div class="visual-card">
      <div>
        <span class="visual-label">Cobertura al inicio</span>
        <strong>${porcentaje.toFixed(1)}%</strong>
        <small>${fmt(asistieron)} presentes de ${fmt(data.length)}</small>
      </div>
      <div class="donut" style="--pct:${porcentaje.toFixed(1)}">
        <span>${fmt(faltas)}<small>faltas</small></span>
      </div>
    </div>
  `;
}

function verDiario() {
  const fechas = fechasDisponibles();
  if (!vistaDia && fechas.length) vistaDia = fechas[0];
  const data = filas.filter(r => r.fecha === vistaDia);
  const r = resumen(data);
  const asistencias = data.filter(r => r.asistio);
  document.getElementById("app").innerHTML = `
    <div class="section-head">
      <div>
        <h2>Reporte diario</h2>
      </div>
      <div class="filters">
        <select id="selectorDia" onchange="vistaDia=this.value;verDiario()">
          ${fechas.map(f => `<option value="${htmlSeguro(f)}" ${f === vistaDia ? "selected" : ""}>${htmlSeguro(nombreDia(f))} ${htmlSeguro(fechaCorta(f))}</option>`).join("")}
        </select>
        <button onclick="exportarTablaVisible('tablaAsistenciaDiaria', 'asistencia_diaria')">Excel asistencia</button>
        <button onclick="exportarTablaVisible('tablaInasistenciaDiaria', 'inasistencia_diaria')">Excel inasistencia</button>
      </div>
    </div>
    <section class="kpi-grid">
      ${kpi("Personal", fmt(r.personal))}
      ${kpi("Asistieron", fmt(r.asistieron))}
      ${kpi("Inasistencias", fmt(r.inasistencias), "", r.inasistencias ? "danger" : "")}
      ${kpi("Puntuales", fmt(r.puntual))}
      ${kpi("Tardanzas", fmt(r.tardanza), "", r.tardanza ? "warn" : "")}
      ${kpi("Justificados", fmt(r.justificado))}
    </section>
    <section class="report-stack">
      <div class="card report-card">
        <div class="section-head">
          <h2>Asistencia del dia</h2>
          <span class="badge">${fmt(asistencias.length)} asistieron</span>
        </div>
        ${tablaAsistenciaBase("tablaAsistenciaDiaria", asistencias, "Sin asistencia para este dia.")}
      </div>
      <div class="card report-card">
        <div class="section-head">
          <h2>Inasistencia por turno</h2>
          <span class="badge">${fmt(r.inasistencias)} no asistieron</span>
        </div>
        ${tablaInasistenciaPorTurno("tablaInasistenciaDiaria", data)}
      </div>
    </section>
  `;
}

function estadoInformeInicio(row) {
  const limite = horaLimiteTurno(row.turno);
  return clasificarInicioTurno(row, limite);
}

function filaInformeAsistencia(row, estado) {
  return `
    <tr>
      <td>${htmlSeguro(row.dni)}</td>
      <td>${htmlSeguro(row.nombre)}</td>
      <td>${htmlSeguro(row.apellido)}</td>
      <td><strong>${htmlSeguro(estado)}</strong></td>
      <td>${htmlSeguro(row.cargo)}</td>
      <td><strong>${htmlSeguro(row.turno)}</strong></td>
    </tr>
  `;
}

function resumenAsistenciaPorCargo(asistencias) {
  const mapa = new Map();
  asistencias.forEach(row => {
    const turno = row.turno || "SIN TURNO";
    const cargo = row.cargo || "SIN CARGO";
    const key = `${turno}|${cargo}`;
    if (!mapa.has(key)) mapa.set(key, { turno, cargo, asistencia: 0, puntuales: 0, tardanzas: 0 });
    const item = mapa.get(key);
    item.asistencia += 1;
    if (row.tarde || row.estadoInforme === "TARDANZA") item.tardanzas += 1;
    else item.puntuales += 1;
  });
  const ordenTurno = { DIA: 1, TARDE: 2, NOCHE: 3, "SIN TURNO": 4 };
  return Array.from(mapa.values()).sort((a, b) =>
    (ordenTurno[a.turno] || 9) - (ordenTurno[b.turno] || 9) ||
    b.asistencia - a.asistencia ||
    a.cargo.localeCompare(b.cargo)
  );
}

function tablaAsistenciaPorCargo(asistencias) {
  const cargos = resumenAsistenciaPorCargo(asistencias);
  const turnos = [...new Set(cargos.map(item => item.turno))];
  const filas = turnos.map(turno => {
    const grupo = cargos.filter(item => item.turno === turno);
    const subtotal = grupo.reduce((total, item) => total + item.asistencia, 0);
    return `
      ${grupo.map((item, index) => `
        <tr>
          <td><strong>${index === 0 ? htmlSeguro(fechaCorta(vistaDia)) : ""}</strong></td>
          <td><strong>${index === 0 ? htmlSeguro(turno) : ""}</strong></td>
          <td>${htmlSeguro(item.cargo)}</td>
          <td class="number"><strong>${fmt(item.asistencia)}</strong></td>
          <td>${htmlSeguro(`${fmt(item.puntuales)} puntuales | ${fmt(item.tardanzas)} tardanzas`)}</td>
        </tr>
      `).join("")}
      <tr class="attendance-turn-subtotal">
        <td colspan="3">SUBTOTAL ${htmlSeguro(turno)}</td>
        <td>${fmt(subtotal)}</td>
        <td>${fmt(grupo.length)} cargos</td>
      </tr>
    `;
  }).join("");
  return `
    <div class="table-wrap">
      <table id="tablaInformeAsistencia" class="attendance-summary-table">
        <thead><tr><th>Fecha</th><th>Turno</th><th>Cargo</th><th>Asistencia</th><th>Observacion</th></tr></thead>
        <tbody>
          ${filas || `<tr><td colspan="5">Sin asistencias para los filtros seleccionados.</td></tr>`}
        </tbody>
        <tfoot>
          <tr><th colspan="3">TOTAL ASISTENCIA</th><th>${fmt(asistencias.length)}</th><th>${fmt(cargos.length)} combinaciones turno/cargo</th></tr>
        </tfoot>
      </table>
    </div>
  `;
}

function verInformeAsistencia() {
  const fechas = fechasDisponibles();
  if (!vistaDia && fechas.length) vistaDia = fechas[fechas.length - 1];

  const base = filas
    .filter(r => r.fecha === vistaDia)
    .filter(r => informeAsistenciaTurno === "TODOS" || r.turno === informeAsistenciaTurno);

  const data = base.map(r => ({
    ...r,
    estadoInforme: informeAsistenciaTipo === "INICIO" ? estadoInformeInicio(r) : r.resultado
  }));

  const esAsistencia = row => informeAsistenciaTipo === "INICIO"
    ? ["ASISTIO", "TARDANZA"].includes(row.estadoInforme)
    : row.asistio;
  const esInasistencia = row => informeAsistenciaTipo === "INICIO"
    ? ["FALTA AL INICIO", "JUSTIFICADO"].includes(row.estadoInforme)
    : !row.asistio;

  const asistencias = data.filter(esAsistencia).sort((a, b) => a.turno.localeCompare(b.turno) || a.apellido.localeCompare(b.apellido));
  const inasistencias = data.filter(esInasistencia).sort((a, b) => a.turno.localeCompare(b.turno) || a.apellido.localeCompare(b.apellido));
  const pendientes = data.length - asistencias.length - inasistencias.length;

  document.getElementById("app").innerHTML = `
    <div class="section-head">
      <div>
        <h2>Informe diario de asistencia</h2>
      </div>
      <div class="filters">
        <select onchange="vistaDia=this.value;verInformeAsistencia()">
          ${fechas.map(f => `<option value="${htmlSeguro(f)}" ${f === vistaDia ? "selected" : ""}>${htmlSeguro(nombreDia(f))} ${htmlSeguro(fechaCorta(f))}</option>`).join("")}
        </select>
        <select onchange="informeAsistenciaTipo=this.value;verInformeAsistencia()">
          <option value="GENERAL" ${informeAsistenciaTipo === "GENERAL" ? "selected" : ""}>Informe general</option>
          <option value="INICIO" ${informeAsistenciaTipo === "INICIO" ? "selected" : ""}>Inicio de turno</option>
        </select>
        <select onchange="informeAsistenciaTurno=this.value;verInformeAsistencia()">
          ${["TODOS", "DIA", "TARDE", "NOCHE"].map(turno => `<option value="${turno}" ${turno === informeAsistenciaTurno ? "selected" : ""}>${turno === "TODOS" ? "Todos los turnos" : turno}</option>`).join("")}
        </select>
        <button onclick="exportarTablaVisible('tablaInformeAsistencia', 'informe_asistencia_por_cargo_${vistaDia}')">Excel asistencia</button>
        <button onclick="exportarElementoImagen('informeAsistenciaCargo', 'informe_asistencia_por_cargo_${vistaDia}')">Imagen asistencia</button>
        <button onclick="exportarTablaVisible('tablaInformeInasistencia', 'informe_inasistencia_${vistaDia}')">Excel inasistencia</button>
      </div>
    </div>
    <section class="kpi-grid daily-kpis">
      ${kpi("Personal evaluado", fmt(data.length), informeAsistenciaTurno)}
      ${kpi("Asistencias", fmt(asistencias.length))}
      ${kpi("Inasistencias", fmt(inasistencias.length), "", inasistencias.length ? "danger" : "")}
      ${kpi("Pendientes", fmt(pendientes), informeAsistenciaTipo === "INICIO" ? "Turno aun no evaluado" : "")}
      ${kpi("Fecha", fechaCorta(vistaDia), nombreDia(vistaDia))}
      ${kpi("Tipo informe", informeAsistenciaTipo === "INICIO" ? "Inicio turno" : "General")}
    </section>
    <section class="report-stack attendance-report-stack">
      <article class="card report-card" id="informeAsistenciaCargo">
        <div class="section-head">
          <div><h2>Asistencia agrupada por cargo</h2><p class="muted">${htmlSeguro(informeAsistenciaTurno)} | ${htmlSeguro(fechaCorta(vistaDia))}</p></div>
          <span class="badge">${fmt(asistencias.length)} personas</span>
        </div>
        ${tablaAsistenciaPorCargo(asistencias)}
      </article>
      <article class="card report-card">
        <div class="section-head">
          <div><h2>Inasistencia</h2><p class="muted">${htmlSeguro(informeAsistenciaTurno)} | ${htmlSeguro(fechaCorta(vistaDia))}</p></div>
          <span class="badge danger-badge">${fmt(inasistencias.length)} personas</span>
        </div>
        ${tablaConId("tablaInformeInasistencia", ["DNI", "Nombre", "Apellido", "Estado", "Cargo", "Turno"], inasistencias.map(r => filaInformeAsistencia(r, r.estadoInforme)), "Sin inasistencias para los filtros seleccionados.")}
      </article>
    </section>
  `;
}

function verGlobal() {
  const filtroActivo = document.getElementById("filtroGlobal");
  const cursorFiltro = filtroActivo?.selectionStart;
  const q = normalizar(filtroActivo?.value || "");
  const data = filas.filter(r => !q || [r.dni, r.nombre, r.apellido, r.cliente, r.turno, r.resultado, r.cargo].map(normalizar).join(" ").includes(q));
  const r = resumen(data);
  document.getElementById("app").innerHTML = `
    <div class="section-head">
      <div>
        <h2>Reporte global</h2>
      </div>
      <div class="filters">
        <input class="search" id="filtroGlobal" placeholder="Buscar DNI, nombre, apellido, cargo, turno o estado..." value="${htmlSeguro(document.getElementById("filtroGlobal")?.value || "")}" oninput="verGlobal()">
        <button onclick="exportarTablaVisible('tablaGlobal', 'asistencia_global')">Excel general</button>
        <button onclick="exportarTablaVisible('tablaInasistenciaGlobal', 'inasistencia_global')">Excel inasistencia</button>
      </div>
    </div>
    <section class="kpi-grid">
      ${kpi("Registros", fmt(r.total))}
      ${kpi("Asistieron", fmt(r.asistieron))}
      ${kpi("Inasistencias", fmt(r.inasistencias), "", r.inasistencias ? "danger" : "")}
      ${kpi("Tardanzas", fmt(r.tardanza), "", r.tardanza ? "warn" : "")}
    </section>
    <section class="dashboard-layout">
      <div class="card">
        ${graficoAsistencia(data, "Asistencia principal")}
      </div>
      <div class="card">
        ${graficoTurnos(data, "Principal por turno")}
      </div>
      <div class="card">
        ${graficoTurnos(filasExtra, "Multiformato extra")}
      </div>
    </section>
    <section class="card">
      <div class="section-head">
        <h2>Reporte general asistencia</h2>
        <span class="badge">${fmt(data.length)} registros</span>
      </div>
      ${tablaAsistenciaBase("tablaGlobal", data, "Sin resultados.")}
    </section>
    <section class="card">
      <div class="section-head">
        <h2>Reporte general inasistencia por turno</h2>
        <span class="badge">${fmt(r.inasistencias)} inasistencias</span>
      </div>
      ${tablaInasistenciaPorTurno("tablaInasistenciaGlobal", data)}
    </section>
  `;
  if (filtroActivo) restaurarCursorBusqueda("filtroGlobal", cursorFiltro);
}

function filasRegularizacion(fecha = "", turno = "TODOS") {
  const base = fecha ? filas.filter(r => r.fecha === fecha) : filas;
  const duplicados = keysDuplicadas(base);
  return filas
    .map(r => ({ ...r, irregularidades: detectarIrregularidades(r, duplicados) }))
    .filter(r =>
      (!fecha || r.fecha === fecha) &&
      (turno === "TODOS" || r.turno === turno) &&
      (r.irregularidades.length || r.regularizado)
    )
    .sort((a, b) => b.irregularidades.length - a.irregularidades.length || ordenarFila(a, b));
}

function guardarRegularizacion(key, campo, valor) {
  if (!regularizaciones[key]) regularizaciones[key] = {};
  regularizaciones[key][campo] = valor;
  localStorage.setItem("anc_asistencia_regularizaciones", JSON.stringify(regularizaciones));
  prepararData();
  verRegularizacion();
}

function limpiarRegularizacion(key) {
  delete regularizaciones[key];
  localStorage.setItem("anc_asistencia_regularizaciones", JSON.stringify(regularizaciones));
  prepararData();
  verRegularizacion();
}

function verRegularizacion() {
  const fechas = fechasDisponibles();
  if (!vistaDia && fechas.length) vistaDia = fechas[0];
  const data = filasRegularizacion(vistaDia, turnoRegularizacion);
  const duplicados = keysDuplicadas(filas.filter(r => r.fecha === vistaDia && (turnoRegularizacion === "TODOS" || r.turno === turnoRegularizacion)));
  document.getElementById("app").innerHTML = `
    <div class="section-head">
      <div>
        <h2>Regularizacion de asistencia</h2>
      </div>
      <div class="filters">
        <select onchange="vistaDia=this.value;verRegularizacion()">
          ${fechas.map(f => `<option value="${htmlSeguro(f)}" ${f === vistaDia ? "selected" : ""}>${htmlSeguro(nombreDia(f))} ${htmlSeguro(fechaCorta(f))}</option>`).join("")}
        </select>
        <select onchange="turnoRegularizacion=this.value;verRegularizacion()">
          ${["TODOS", "DIA", "TARDE", "NOCHE", "SIN TURNO"].map(t => `<option value="${t}" ${t === turnoRegularizacion ? "selected" : ""}>${t === "TODOS" ? "Todos los turnos" : t}</option>`).join("")}
        </select>
        <button onclick="exportarRegularizacionExcel()">Excel regularizacion</button>
      </div>
    </div>
    <section class="kpi-grid">
      ${kpi("Casos", fmt(data.length), "", data.length ? "warn" : "")}
      ${kpi("Regularizados", fmt(data.filter(x => x.regularizado).length))}
      ${kpi("Sin marca", fmt(data.filter(x => x.irregularidades.includes("SIN MARCA")).length), "", "danger")}
      ${kpi("Menos 9 horas", fmt(data.filter(x => x.irregularidades.includes("MENOS DE 9 HORAS")).length), "", "warn")}
      ${kpi("Mas 9 horas", fmt(data.filter(x => x.irregularidades.includes("MAS DE 9 HORAS")).length), "", "warn")}
      ${kpi("Solo entrada", fmt(data.filter(x => x.irregularidades.includes("SOLO MARCO ENTRADA")).length), "", "warn")}
      ${kpi("Duplicados", fmt(duplicados.size), "DNI por dia", duplicados.size ? "danger" : "")}
    </section>
    <section class="card report-card">
      ${tablaConId("tablaRegularizacion", ["Dia", "DNI", "Nombre", "Apellido", "Turno", "Cargo", "Entrada sistema", "Salida sistema", "Horas", "Irregularidad", "Asistio real", "Entrada real", "Salida real", "Comentario", "Accion"], data.map(rowRegularizacion))}
    </section>
  `;
}

function rowRegularizacion(r) {
  const reg = regularizaciones[r.key] || {};
  return `
    <tr class="${r.regularizado ? "warn" : "bad"}">
      <td>${htmlSeguro(`${nombreDia(r.fecha)} ${fechaCorta(r.fecha)}`)}</td>
      <td>${htmlSeguro(r.dni)}</td>
      <td>${htmlSeguro(r.nombre)}</td>
      <td>${htmlSeguro(r.apellido)}</td>
      <td><strong>${htmlSeguro(r.turno)}</strong></td>
      <td>${htmlSeguro(r.cargo)}</td>
      <td>${htmlSeguro(r.horaEntrada || "SIN MARCA")}</td>
      <td>${htmlSeguro(r.horaSalida)}</td>
      <td class="number">${fmt(r.horasCalculadas || r.horasSistema)}</td>
      <td>${htmlSeguro(r.irregularidades.join(" / ") || "REGULARIZADO")}</td>
      <td>
        <select onchange="guardarRegularizacion('${htmlSeguro(r.key)}','asistio',this.value)">
          <option value="NO" ${((reg.asistio || (r.asistio ? "SI" : "NO")) === "NO") ? "selected" : ""}>NO</option>
          <option value="SI" ${((reg.asistio || (r.asistio ? "SI" : "NO")) === "SI") ? "selected" : ""}>SI</option>
        </select>
      </td>
      <td><input class="mini" value="${htmlSeguro(reg.horaEntrada || r.horaEntrada || "")}" placeholder="HH:MM" onchange="guardarRegularizacion('${htmlSeguro(r.key)}','horaEntrada',this.value)"></td>
      <td><input class="mini" value="${htmlSeguro(reg.horaSalida || r.horaSalida || "")}" placeholder="HH:MM" onchange="guardarRegularizacion('${htmlSeguro(r.key)}','horaSalida',this.value)"></td>
      <td><input class="comment" value="${htmlSeguro(reg.comentario || r.comentarioRegularizacion || "")}" placeholder="Motivo / sustento" onchange="guardarRegularizacion('${htmlSeguro(r.key)}','comentario',this.value)"></td>
      <td><button onclick="limpiarRegularizacion('${htmlSeguro(r.key)}')">Limpiar</button></td>
    </tr>
  `;
}

function exportarRegularizacionExcel() {
  const duplicados = keysDuplicadas(filas.filter(r => r.fecha === vistaDia && (turnoRegularizacion === "TODOS" || r.turno === turnoRegularizacion)));
  const data = filasRegularizacion(vistaDia, turnoRegularizacion);
  if (!data.length) return alert("No hay casos de regularizacion para exportar");
  const html = `
    <table border="1">
      <tr>
        <th>DIA</th>
        <th>DNI</th>
        <th>NOMBRE</th>
        <th>APELLIDO</th>
        <th>TURNO</th>
        <th>CARGO</th>
        <th>ASISTIO REAL</th>
        <th>ENTRADA SISTEMA</th>
        <th>SALIDA SISTEMA</th>
        <th>ENTRADA REAL</th>
        <th>SALIDA REAL</th>
        <th>HORAS</th>
        <th>IRREGULARIDAD</th>
        <th>COMENTARIO</th>
      </tr>
      ${data.map(r => {
        const reg = regularizaciones[r.key] || {};
        const asistioReal = reg.asistio || (r.asistio ? "SI" : "NO");
        return `
          <tr>
            <td>${htmlSeguro(`${nombreDia(r.fecha)} ${fechaCorta(r.fecha)}`)}</td>
            <td>${htmlSeguro(r.dni)}</td>
            <td>${htmlSeguro(r.nombre)}</td>
            <td>${htmlSeguro(r.apellido)}</td>
            <td>${htmlSeguro(r.turno)}</td>
            <td>${htmlSeguro(r.cargo)}</td>
            <td>${htmlSeguro(asistioReal)}</td>
            <td>${htmlSeguro(r.asistio ? r.horaEntrada : "SIN MARCA")}</td>
            <td>${htmlSeguro(r.horaSalida)}</td>
            <td>${htmlSeguro(reg.horaEntrada || r.horaEntrada || "")}</td>
            <td>${htmlSeguro(reg.horaSalida || r.horaSalida || "")}</td>
            <td>${fmt(r.horasCalculadas || r.horasSistema)}</td>
            <td>${htmlSeguro(detectarIrregularidades(r, duplicados).join(" / ") || "REGULARIZADO")}</td>
            <td>${htmlSeguro(reg.comentario || r.comentarioRegularizacion || "")}</td>
          </tr>
        `;
      }).join("")}
    </table>
  `;
  descargarExcel("reporte_regularizacion_asistencia", html);
}

function verTurnos() {
  const filasTurnos = Array.from(turnosAprendidos.entries()).map(([dni, turno]) => {
    const persona = filas.find(r => r.dni === dni);
    const historial = filas.filter(r => r.dni === dni);
    return { dni, turno, nombre: persona?.personal || "", cliente: persona?.cliente || "", dias: historial.length };
  }).sort((a, b) => a.turno.localeCompare(b.turno) || a.nombre.localeCompare(b.nombre));
  document.getElementById("app").innerHTML = `
    <div class="section-head">
      <div>
        <h2>Turnos aprendidos</h2>
      </div>
      <button onclick="exportarTablaVisible('tablaTurnos', 'turnos_aprendidos')">Excel</button>
    </div>
    ${tablaConId("tablaTurnos", ["DNI", "Personal", "Cliente", "Turno aprendido", "Dias vistos"], filasTurnos.map(r => `
      <tr>
        <td>${htmlSeguro(r.dni)}</td>
        <td>${htmlSeguro(r.nombre)}</td>
        <td>${htmlSeguro(r.cliente)}</td>
        <td><strong>${htmlSeguro(r.turno)}</strong></td>
        <td class="number">${fmt(r.dias)}</td>
      </tr>
    `))}
  `;
}

function prepararHtmlExcel(html) {
  const css = `<meta charset="UTF-8"><style>td{mso-number-format:"\\@";}</style>`;
  return css + String(html || "");
}

function descargarExcel(nombre, html) {
  const blob = new Blob([prepararHtmlExcel(html)], { type: "application/vnd.ms-excel" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${nombre}.xls`;
  a.click();
}

function exportarTablaVisible(id, nombre) {
  const table = document.getElementById(id);
  if (!table) return alert("No hay tabla para exportar");
  descargarExcel(nombre, table.outerHTML);
}

async function exportarElementoImagen(id, nombre) {
  const elemento = document.getElementById(id);
  if (!elemento) return alert("No hay contenido para exportar");
  if (typeof html2canvas !== "function") return alert("No se pudo iniciar la exportacion de imagen");
  const contenedores = [elemento, ...elemento.querySelectorAll(".table-wrap")];
  const estilos = contenedores.map(contenedor => ({
    contenedor,
    height: contenedor.style.height,
    maxHeight: contenedor.style.maxHeight,
    overflow: contenedor.style.overflow,
    overflowX: contenedor.style.overflowX,
    overflowY: contenedor.style.overflowY
  }));

  contenedores.forEach(contenedor => {
    contenedor.style.height = "auto";
    contenedor.style.maxHeight = "none";
    contenedor.style.overflow = "visible";
    contenedor.style.overflowX = "visible";
    contenedor.style.overflowY = "visible";
  });

  try {
    const canvas = await html2canvas(elemento, {
      backgroundColor: "#ffffff",
      scale: 2,
      width: elemento.scrollWidth,
      height: elemento.scrollHeight,
      windowWidth: Math.max(document.documentElement.clientWidth, elemento.scrollWidth),
      windowHeight: Math.max(document.documentElement.clientHeight, elemento.scrollHeight)
    });
    const enlace = document.createElement("a");
    enlace.download = `${nombre}.png`;
    enlace.href = canvas.toDataURL("image/png");
    enlace.click();
  } finally {
    estilos.forEach(item => {
      item.contenedor.style.height = item.height;
      item.contenedor.style.maxHeight = item.maxHeight;
      item.contenedor.style.overflow = item.overflow;
      item.contenedor.style.overflowX = item.overflowX;
      item.contenedor.style.overflowY = item.overflowY;
    });
  }
}

cargarDatos().catch(error => {
  console.error(error);
  estado("Error de carga");
  document.getElementById("app").innerHTML = `
    <div class="notice">
      No se pudo cargar la data desde Google Sheets. Revisa que el archivo este publicado o compartido.
      <button onclick="cargarDatos()">Intentar nuevamente</button>
    </div>
  `;
});
