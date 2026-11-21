// ===== Personal Bests =====
async function loadPersonalBests() {
    console.log("loadPersonalBests() called")

    let pbs = []
    if (isGuest) {
        pbs = guestPBs
    } else {
        const res = await authFetch(`/api/pbs`)
        if (!res) return
        pbs = await res.json()
    }

    const container = document.getElementById("pb-list")
    container.innerHTML = ""
    const header = document.createElement("div")
    header.className = "pb-list-header"
    header.innerHTML = `
        <div class="pb-col pb-col-distance">Distance</div>
        <div class="pb-col pb-col-time">Time</div>
        <div class="pb-col pb-col-actions"></div>
    `
    container.appendChild(header)

    if (pbs) {
        pbs.sort((a, b) => a.distance - b.distance)
        pbs.forEach(pb => {
            const div = document.createElement("div")
            div.id = `pb-row-${pb.id}`
            div.innerHTML = renderPBCard(pb)
            container.appendChild(div)
        });
    }
}

function renderPBCard(pb) {
    const disabledAttr = isGuest ? "disabled" : ""
    const menuId = `pb-menu-${pb.id}`

    return `
    <div class="pb-card">
        <div class="pb-col pb-col-distance"><b>${pb.distance} km</b></div>
        <div class="pb-col pb-col-time">${pb.time}</div>
        <div class="pb-col pb-col-actions">
            <div class="row-menu">
                <button class="row-menu-trigger" onclick="toggleRowMenu(event, '${menuId}')" aria-label="PB options">${kebabIcon}</button>
                <div class="row-menu-dropdown" id="${menuId}">
                    <button ${disabledAttr} onclick="editPersonalBest(${pb.id})">${editIcon} Edit</button>
                    <button class="danger" ${disabledAttr} onclick="deletePersonalBest(${pb.id})">${trashIcon} Delete</button>
                </div>
            </div>
        </div>
    </div>
    `
}

function editPersonalBest(id) {
    closeAllRowMenus()
    if (isGuest) {
        setAppMessage("Preview mode is read-only.")
        return
    }

    const row = document.getElementById(`pb-row-${id}`)
    if (!row) return

    ;(async () => {
        let pb
        if (isGuest) {
            pb = guestPBs.find(p => p.id === id)
        } else {
            const res = await authFetch(`/api/pbs`)
            if (!res) return
            const list = await res.json()
            pb = list.find(p => p.id === id)
        }
        if (!pb) return

        row.innerHTML = `
        <div class="pb-edit-row">
            <div class="pb-edit-fields">
                <div class="session-edit-field">
                    <label>Distance (km)</label>
                    <input id="edit-pb-distance-${id}" type="number" min="0" step="0.1" value="${pb.distance}">
                </div>
                <div class="session-edit-field">
                    <label>Time (hh:mm:ss)</label>
                    <input id="edit-pb-time-${id}" type="text" value="${htmlEscape(pb.time)}">
                </div>
            </div>
            <div class="pb-edit-actions">
                <button class="btn-secondary" onclick="cancelEditPersonalBest()">Cancel</button>
                <button class="btn-primary" onclick="savePersonalBestEdit(${id})">Save</button>
            </div>
        </div>
        `
    })()
}

function cancelEditPersonalBest() {
    loadPersonalBests()
}

async function savePersonalBestEdit(id) {
    const distance = parseFloat(document.getElementById(`edit-pb-distance-${id}`)?.value)
    const time = document.getElementById(`edit-pb-time-${id}`)?.value || ''

    if (!distance || !time) {
        setAppMessage("Fill both PB distance and time.")
        return
    }
    if (!isValidTime(time)) {
        setAppMessage("Time must be in hh:mm:ss format.")
        return
    }

    await authFetch(`/api/pbs/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ distance, time })
    })

    loadPersonalBests()
}

function isValidTime(t) {
    return /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.test(t);
}

async function addPersonalBest() {
    if (isGuest) {
        setAppMessage("Preview mode is read-only.")
        document.getElementById("pb-distance").value = ""
        document.getElementById("pb-time").value = ""
        return
    }

    const distance = parseFloat(document.getElementById("pb-distance").value)
    let time = document.getElementById("pb-time").value

    if(!distance || !time){
        setAppMessage("Fill both PB distance and time.")
        return
    }

    if (!isValidTime(time)) {
        setAppMessage("Time must be in hh:mm:ss format.")
        return;
    }

    await authFetch("/api/pbs", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
            distance: distance,
            time: time,
        })
    })

    hideAddPBForm()
    loadPersonalBests()
}

async function deletePersonalBest(id) {
    closeAllRowMenus()
    if (isGuest) {
        setAppMessage("Preview mode is read-only.")
        return
    }

    await authFetch(`/api/pbs/${id}`, {
        method: "DELETE"
    })
    loadPersonalBests()
}
