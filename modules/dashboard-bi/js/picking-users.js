const pickingUsersKey = "anc-picking-report-users-v1";
let pickingUsersSelected = null;
try {
  const saved = JSON.parse(localStorage.getItem(pickingUsersKey));
  if (Array.isArray(saved) && saved.every(v => typeof v === "string")) pickingUsersSelected = new Set(saved);
} catch {}

function prepararFiltroPickers(rows) {
  let host = document.getElementById("picking-users-filter");
  if (!host) {
    host = document.createElement("details");
    host.id = "picking-users-filter";
    host.setAttribute("data-html2canvas-ignore", "true");
    document.getElementById("modulo").before(host);
    host.innerHTML = '<summary></summary><div class="picking-users-controls"><input type="search" aria-label="Buscar picker" placeholder="Usuario, nombre o DNI"><button type="button" data-action="all">Seleccionar todos</button><button type="button" data-action="none">Limpiar</button><button type="button" data-action="apply">Aplicar</button><button type="button" data-action="cancel">Cancelar</button></div><div class="picking-users-list"></div><span class="picking-users-count" role="status"></span>';
    host.querySelector("input").addEventListener("input", () => {
      const q = normalizar(host.querySelector("input").value);
      host.querySelectorAll("label").forEach(label => { label.hidden = !normalizar(label.textContent).includes(q); });
    });
    const updateCount = () => {
      host.querySelector(".picking-users-count").textContent = host.querySelectorAll('input[type="checkbox"]:checked').length + " seleccionados";
    };
    host.addEventListener("change", updateCount);
    host.addEventListener("click", event => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (!action) return;
      if (action === "all" || action === "none") {
        host.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = action === "all"; });
        updateCount();
      }
      if (action === "apply") {
        pickingUsersSelected = new Set([...host.querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value));
        try { localStorage.setItem(pickingUsersKey, JSON.stringify([...pickingUsersSelected])); } catch {}
        host.open = false;
        verPickingCompacto();
      }
      if (action === "cancel") { host.open = false; verPickingCompacto(); }
    });
  }
  const users = new Set(rows.map(r => limpiar(r.usuario)).filter(Boolean));
  pickingUsersSelected?.forEach(user => users.add(user));
  const list = host.querySelector(".picking-users-list");
  list.replaceChildren();
  [...users].sort((a,b)=>nombreUsuarioPorDni(a).localeCompare(nombreUsuarioPorDni(b))).forEach(user => {
    const label = document.createElement("label"), input = document.createElement("input"), text = document.createElement("span");
    input.type = "checkbox"; input.value = user;
    input.checked = pickingUsersSelected === null || pickingUsersSelected.has(user);
    const name = nombreUsuarioPorDni(user);
    text.textContent = name === user ? user : user + " - " + name;
    label.append(input, text); list.append(label);
  });
  host.querySelector('input[type="search"]').value = "";
  host.querySelector("summary").textContent = pickingUsersSelected === null ? "Mis pickers: todos" : "Mis pickers: " + pickingUsersSelected.size + " seleccionados";
  host.querySelector(".picking-users-count").textContent = list.querySelectorAll("input:checked").length + " seleccionados";
}
