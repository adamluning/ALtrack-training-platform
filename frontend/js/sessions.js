// ===== Calendar =====
async function loadCalendar() {
    console.log("loadCalendar() called")

    if (isGuest) {
        calendarData = guestCalendarData
    } else {
        const res = await authFetch(`/api/calendar?year=${currentYear}&month=${currentMonth}`)
        if (!res) return
        calendarData = await res.json()
    }

    document.getElementById("month-label").innerText =
        `${MONTH_NAMES[currentMonth-1]} ${currentYear}`

    const visibleMonth = `${currentYear}-${String(currentMonth).padStart(2, "0")}`
    if (!selectedDate || !selectedDate.startsWith(`${visibleMonth}-`)) {
        const now = new Date()
        const isCurrentMonth = currentYear === now.getFullYear() && currentMonth === now.getMonth() + 1
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
        selectedDate = isCurrentMonth ? today : `${visibleMonth}-01`
    }

    if (currentYear === new Date().getFullYear() && currentMonth === new Date().getMonth() + 1) {
        updateCompletedSessionCount()
    }

    renderCalendar(currentYear, currentMonth)

    if (selectedDate) {
        selectDay(selectedDate)
    }
    if (isGuest) applyGuestReadOnlyUI()
}

function updateCompletedSessionCount() {
    const countEl = document.getElementById("overview-sessions")
    if (!countEl) return
    const completedCount = Object.values(calendarData)
        .flat()
        .filter(session => session.completed).length
    countEl.textContent = String(completedCount)
}

function formatDuration(totalMinutes) {
    const minutes = Math.round(Number(totalMinutes) || 0)
    const hours = Math.floor(minutes / 60)
    const remainder = minutes % 60
    if (hours === 0) return `${remainder} min`
    if (remainder === 0) return `${hours} h`
    return `${hours} h ${remainder} min`
}

async function renderCalendar(year, month) {
    const grid = document.getElementById("calendar-grid")
    grid.innerHTML = ""

    const firstDay = new Date(year, month-1, 1)
    const daysInMonth = new Date(year, month, 0).getDate()

    let startDay = firstDay.getDay()
    startDay = (startDay === 0) ? 6 : startDay - 1;

    for (let i = 0; i < startDay; i++) {
        const empty = document.createElement("div");
        grid.appendChild(empty);
    }

    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

    for(let day=1; day <= daysInMonth; day++) {
        const date = new Date(year, month-1, day)
        let weekday = date.getDay()
        weekday = (weekday === 0) ? 6 : weekday - 1

        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const cell = document.createElement("div")
        cell.className = "day"
        if (dateStr == selectedDate) {
            cell.className = "day-s"
        } else {
            cell.className = "day"
        }
        cell.onclick = () => {
            cell.className = "day-s"
            selectDay(dateStr)
        }

        cell.innerHTML = `
            <div class="day-number">${day}</div>
            <div class="day-name">${dayNames[weekday]}</div>
        `;

        if(calendarData[dateStr]) {
            calendarData[dateStr].forEach(s=>{
                const row = document.createElement("div")
                row.className = "session-dot-row"

                const dot = document.createElement("div")
                dot.className = s.completed ? "session-dot-c" : "session-dot"
                row.appendChild(dot)

                const title = document.createElement("span")
                title.className = "session-dot-title"
                title.innerText = s.title
                row.appendChild(title)

                cell.appendChild(row)
            })
        }

        grid.appendChild(cell)
    }
}

async function selectDay(dateStr) {
    selectedDate = dateStr
    renderCalendar(currentYear, currentMonth)

    document.getElementById("session-date").value = selectedDate

    document.getElementById("selected-day").innerText = dateStr
    const container = document.getElementById("day-sessions")
    container.innerHTML = ""

    const sessions = calendarData[dateStr] || []

    sessions.forEach(s => {
        const card = document.createElement("div")
        card.className = "session-card"
        card.id = `session-${s.id}`

        card.innerHTML = renderSessionCard(s)

        container.appendChild(card)
    });

    if (isGuest) applyGuestReadOnlyUI()
}

// ===== Session rendering =====
function renderSessionCard(s){
    const leftActions = []
    const canEditSession = !isGuest
    const disabledAttr = isGuest ? "disabled" : ""

    if (!s.completed) {
        if (isFutureSession(s)) {
            leftActions.push(`<button class="btn-primary" disabled title="This session can be completed on its scheduled date">Available ${htmlEscape(s.date)}</button>`)
        } else {
            leftActions.push(`<button class="btn-primary" ${disabledAttr} ${canEditSession ? `onclick="completeSession(${s.id})"` : ""}>Complete</button>`)
        }
    }
    if (!s.notes) {
        leftActions.push(`<input id="note-${s.id}" placeholder="Add note"><button class="btn-secondary" ${disabledAttr} ${canEditSession ? `onclick="addNote(${s.id})"` : ""}>Save note</button>`)
    }

    const rightActions = []
    rightActions.push(`<button class="edit-session-button" ${disabledAttr} ${canEditSession ? `onclick="editSession(${s.id})"` : ""}>Edit session</button>`)
    rightActions.push(`<button class="delete-session-button" ${disabledAttr} ${canEditSession ? `onclick="deleteSession(${s.id})"` : ""}>Delete session</button>`)

    const checkIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`
    const clockIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`
    const runIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="17" cy="5" r="2"/><path d="m14 22 2-9-3-3 1-6M9 15l3-3 4 1M6 22l3-6"/></svg>`
    const timerIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>`
    const noteIcon = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`

    const statusMarkup = s.completed
        ? `<span class="status-badge completed">${checkIcon} Done</span>
           <span class="session-volume">${runIcon} ${s.distance_km.toFixed(1)} km &nbsp;·&nbsp; ${timerIcon} ${s.duration_min} min</span>`
        : `<span class="status-badge pending">${clockIcon} Pending</span>`

    return `
        <div class="session-header">
            <div class="session-title">${htmlEscape(s.title)}</div>
            <div style="display:flex; align-items:center;">
                ${statusMarkup}
            </div>
        </div>

        <div class="session-desc">${htmlEscape(s.description)}</div>

        ${s.notes ? `<div class="session-notes">${noteIcon} ${htmlEscape(s.notes)}</div>` : ""}

        <div class="session-actions">
            ${leftActions.length ? `<div class="session-left-actions">${leftActions.join('')}</div>` : ""}
            <div class="session-right-actions">${rightActions.join('')}</div>
        </div>
    `
}

// ===== Session actions =====
async function addSession() {
    if (isGuest) {
        setAppMessage("Preview mode is read-only.")
        document.getElementById("session-title").value = ""
        document.getElementById("session-desc").value = ""
        document.getElementById("session-date").value = selectedDate || "" 
        return
    }

    const title = document.getElementById("session-title").value
    const desc = document.getElementById("session-desc").value
    let date = document.getElementById("session-date").value

    if (!date) {
        if (selectedDate) {
            date = selectedDate
        } else {
            const now = new Date()
            date = now.toISOString().split("T")[0]
        }
    }

    if(!title || !desc){
        setAppMessage("Fill both session title and description.")
        return
    }

    await authFetch("/api/sessions", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
            title: title,
            description: desc,
            date: date,
            completed: false,
            notes: ""
        })
    })

    document.getElementById("session-title").value = ""
    document.getElementById("session-desc").value = ""
    const [createdYear, createdMonth] = date.split("-").map(Number)
    currentYear = createdYear
    currentMonth = createdMonth
    selectedDate = date
    hideAddSessionForm()
    loadCalendar()
    loadMonthlyStats()
}

async function completeSession(id) {
    if (isGuest) {
        setAppMessage("Preview mode is read-only.")
        return
    }

    const card = document.getElementById(`session-${id}`)
    if(!card) return
    if(card.querySelector(".volume-box")) return
    const session = (calendarData[selectedDate] || []).find(item => Number(item.id) === Number(id))
    if (isFutureSession(session)) {
        setAppMessage("You can complete this session on its scheduled date.")
        return
    }

    const vol = document.createElement("div")
    vol.className = "volume-box"

    vol.innerHTML = `
        <input id="dist-${id}" placeholder="km" type="number" step="0.1">
        <input id="dur-${id}" placeholder="min" type="number">
        <button onclick="submitVolume(${id})">Save</button>
    `

    card.appendChild(vol)
}

async function submitVolume(id) {
    if (isGuest) {
        setAppMessage("Preview mode is read-only.")
        return
    }

    const session = (calendarData[selectedDate] || []).find(item => Number(item.id) === Number(id))
    if (isFutureSession(session)) {
        setAppMessage("You can complete this session on its scheduled date.")
        return
    }

    const distance = parseFloat(document.getElementById(`dist-${id}`).value || 0)
    const duration = parseInt(document.getElementById(`dur-${id}`).value || 0)


    await authFetch(`/api/sessions/${id}/complete`, {
        method: "PUT",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
            distance_km: distance,
            duration_min: duration
        })
    })

    await loadCalendar()
    loadStats()
    await loadOverviewStats()
    if (selectedDate) selectDay(selectedDate)
}

async function addNote(id) {
    if (isGuest) {
        setAppMessage("Preview mode is read-only.")
        document.getElementById(`note-${id}`).value = ""
        return
    }

    const note = document.getElementById(`note-${id}`).value

    await authFetch(`/api/sessions/${id}/note`, {
        method: "PUT",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
            note: note
        })
    })

    document.getElementById(`note-${id}`).value = ""

    await loadCalendar()
    if (selectedDate) selectDay(selectedDate)
}

function editSession(id) {
    if (isGuest) {
        setAppMessage("Preview mode is read-only.")
        return
    }

    const card = document.getElementById(`session-${id}`)
    if (!card) return

    const sessions = selectedDate ? calendarData[selectedDate] || [] : []
    const session = sessions.find(s => s.id === id)
    if (!session) return

    card.innerHTML = ""

    const form = document.createElement('div')
    form.className = 'session-edit-form'

    const titleField = document.createElement('div')
    titleField.className = 'session-edit-field'
    titleField.innerHTML = `<label>Title</label><input id="edit-title-${id}" value="${htmlEscape(session.title)}">`
    form.appendChild(titleField)

    const descField = document.createElement('div')
    descField.className = 'session-edit-field'
    descField.innerHTML = `<label>Description</label><input id="edit-desc-${id}" value="${htmlEscape(session.description)}">`
    form.appendChild(descField)

    if (session.completed) {
        const distField = document.createElement('div')
        distField.className = 'session-edit-field'
        distField.innerHTML = `<label>Distance (km)</label><input id="edit-dist-${id}" type="number" step="0.1" value="${session.distance_km.toFixed(1)}">`
        form.appendChild(distField)

        const durField = document.createElement('div')
        durField.className = 'session-edit-field'
        durField.innerHTML = `<label>Duration (min)</label><input id="edit-dur-${id}" type="number" value="${session.duration_min}">`
        form.appendChild(durField)
    }

    const noteField = document.createElement('div')
    noteField.className = 'session-edit-field'
    noteField.innerHTML = `<label>Notes</label><textarea id="edit-note-${id}">${htmlEscape(session.notes || '')}</textarea>`
    form.appendChild(noteField)

    const actions = document.createElement('div')
    actions.className = 'session-edit-actions'

    const saveButton = document.createElement('button')
    saveButton.textContent = 'Save'
    saveButton.onclick = () => saveSessionEdit(id)
    actions.appendChild(saveButton)

    const cancelButton = document.createElement('button')
    cancelButton.textContent = 'Cancel'
    cancelButton.onclick = () => cancelEditSession(id)
    actions.appendChild(cancelButton)

    form.appendChild(actions)
    card.appendChild(form)
}

function cancelEditSession(id) {
    const card = document.getElementById(`session-${id}`)
    if (!card || !selectedDate) return

    const session = calendarData[selectedDate].find(s => s.id === id)
    if (!session) return

    card.innerHTML = renderSessionCard(session)
}

async function saveSessionEdit(id) {
    if (isGuest) {
        setAppMessage("Preview mode is read-only.")
        return
    }

    const title = document.getElementById(`edit-title-${id}`)?.value || ''
    const description = document.getElementById(`edit-desc-${id}`)?.value || ''
    const note = document.getElementById(`edit-note-${id}`)?.value || ''
    const distance = parseFloat(document.getElementById(`edit-dist-${id}`)?.value || 0)
    const duration = parseInt(document.getElementById(`edit-dur-${id}`)?.value || 0)

    await authFetch(`/api/sessions/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            title,
            description,
            note,
            distance_km: distance,
            duration_min: duration
        })
    })

    await loadCalendar()
    loadStats()
    await loadOverviewStats()
    if (selectedDate) selectDay(selectedDate)
}

function htmlEscape(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

async function deleteSession(id) {
    if (isGuest) {
        setAppMessage("Preview mode is read-only.")
        return
    }

    await authFetch(`/api/sessions/${id}`, {
        method: "DELETE"
    })

    await loadCalendar()
    loadStats()
    await loadOverviewStats()
    if (selectedDate) selectDay(selectedDate)
}

