console.log("APP LOADED")

let AUTH_TOKEN = localStorage.getItem("auth_token") || null

let isGuest = localStorage.getItem("isGuest") === "true"

let currentYear = new Date().getFullYear()
let currentMonth = new Date().getMonth() + 1

let calendarData = {}
let selectedDate = null
let appMessageTimer = null

const MONTH_NAMES = [
  "January","February","Mars","April","May","June",
  "July","August","September","October","November","December"
]

let selectedYears = [
    new Date().getFullYear() - 7,
    new Date().getFullYear() - 6,
    new Date().getFullYear() - 5,
    new Date().getFullYear() - 4,
    new Date().getFullYear() - 3,
    new Date().getFullYear() - 2,
    new Date().getFullYear() - 1,
    new Date().getFullYear()
]

let guestCalendarData = {}
let guestGoals = []
let guestPBs = []
let guestYearlyStats = {}
let guestMonthlyStats = { monthly_distance_km: 0, monthly_duration_min: 0 }
let monthlyChart = null
let yearlyChart = null
let cachedMonthlyChartInputs = null // { safeDist, safeDur, distanceGoal, durationGoal }
let cachedYearlyStatsByYear = null // { year: [ {distance_km, duration_min} x12 ], ... }
let monthlyChartResizeObserver = null
let yearlyChartResizeObserver = null
let yearlyHiddenYears = new Set()

// ===== Utilities =====
function getDateString(date) {
    return date.toISOString().split("T")[0]
}

function prevMonth() {
    currentMonth--
    if (currentMonth === 0) {
        currentMonth = 12
        currentYear--
    }
    loadCalendar()
}

function nextMonth() {
    currentMonth++
    if (currentMonth === 13) {
        currentMonth = 1
        currentYear++
    }
    loadCalendar()
}

// ===== Guest sample data =====
function prepareGuestSampleData() {
    const now = new Date()
    const today = getDateString(now)
    const twoDaysAgo = new Date(now)
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
    const preDate = getDateString(twoDaysAgo)

    guestCalendarData = {}
    guestCalendarData[today] = [
        {
            id: "guest-1",
            title: "Recovery run",
            description: "Easy recovery run.",
            date: today,
            completed: false,
            notes: "Plan to finish after work",
        }
    ]
    guestCalendarData[preDate] = [
        {
            id: "guest-2",
            title: "Threshold session",
            description: "10 km tempo with steady pace.",
            date: preDate,
            completed: true,
            distance_km: 12.0,
            duration_min: 68,
            notes: "Strong finish, felt controlled.",
        }
    ]

    guestGoals = [
        { id: "goal-1", title: "Run 600 km this year", target: "600 km", end_date: `${now.getFullYear()}-12-31` },
        { id: "goal-2", title: "Hit 50 training hours", target: "50 h", end_date: `${now.getFullYear()}-12-31` },
        { id: "goal-3", title: "Set new PB at 5k race", target: "Sub 25 min", end_date: `${now.getFullYear()}-09-30` }
    ]

    guestPBs = [
        { id: "pb-1", distance: 5, time: "00:26:05" },
        { id: "pb-2", distance: 10, time: "00:54:30" },
        { id: "pb-3", distance: 21.1, time: "01:57:45" }
    ]

    const baseDistances = [32, 38, 44, 52, 61, 70, 76, 74, 66, 54, 44, 36]
    const baseDurations = [190, 220, 245, 285, 335, 390, 420, 410, 370, 305, 250, 200]

    function seededRng(seed) {
        let value = seed
        return () => {
            value = (value * 1664525 + 1013904223) % 4294967296
            return value / 4294967296
        }
    }

    guestYearlyStats = {}
    selectedYears.forEach(year => {
        const rng = seededRng(year * 1234567)
        guestYearlyStats[year] = baseDistances.map((distance, monthIndex) => {
            if (year > currentYear - 4) {
                const trend = 1 + (monthIndex - 1.5) * 0.1
                const seasonality = 0.5 + rng() * 0.4
                const yearShift = 1 - (currentYear - year) * 0.2

                const distance_km = Math.max(0, distance * trend * seasonality * yearShift + (rng() - 0.5) * 4)
                const duration_min = Math.max(0, baseDurations[monthIndex] * trend * seasonality * yearShift + (rng() - 0.5) * 12)

                return {
                    distance_km: Number(distance_km.toFixed(1)),
                    duration_min: Math.round(duration_min)
                }
            } else {
                return { distance_km: 0, duration_min: 0 }
            }
        })
    })

    const currentMonthIndex = now.getMonth()
    const currentMonthStats = guestYearlyStats[currentYear]?.[currentMonthIndex]
    guestMonthlyStats = {
        monthly_distance_km: currentMonthStats?.distance_km || 0,
        monthly_duration_min: currentMonthStats?.duration_min || 0
    }
}

// ===== App lifecycle =====
function bootApp(){
    document.getElementById("auth-panel").style.display = "none"
    document.getElementById("register-panel").style.display = "none"
    document.getElementById("app-root").style.display = "block"

    document.getElementById("session-date").value = ""
    setAppMessage("")

    if (isGuest) {
        prepareGuestSampleData()
    }

    updateTopbar()
    loadCalendar()
    loadGoals()
    loadStats()
    setupChartResizeObservers()
    const toggle = document.getElementById("toggle-volume-type")
    if (toggle) toggle.onchange = () => renderYearlyChart()
    loadPersonalBests()
}

// ===== UI helpers =====
function applyGuestReadOnlyUI() {
    const selectors = [
        "#add-goal-panel input",
        "#add-goal-panel button",
        "#add-session-panel input",
        "#add-session-panel button",
        "#manual-volume input",
        "#manual-volume button",
        "#pb-panel input",
        "#pb-panel button",
        "#goals-list button",
        "#pb-list button",
        "#day-sessions input",
        "#day-sessions button"
    ]

    selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            if (el.tagName === "BUTTON" || el.tagName === "INPUT") {
                el.disabled = true
            }
        })
    })
}

async function authFetch(url, options = {}) {
    if (!AUTH_TOKEN) {
        forceLogout()
        return
    }

    options.headers = options.headers || {}
    options.headers["Authorization"] = `Bearer ${AUTH_TOKEN}`

    const res = await fetch(url, options)

    if (res.status === 401) {
        forceLogout()
        return
    }

    return res
}

window.onload = () => {
    if(AUTH_TOKEN){
        bootApp()
    } else {
        document.getElementById("auth-panel").style.display = "block"
    }
}

function updateTopbar() {
    const topBar = document.getElementById("topbar")

    let guestLabel = isGuest 
        ? `<span style="margin-right:10px;">Guest mode</span>` 
        : ""

    topBar.innerHTML = `
        <div id="logo">ALtrack Training Platform</div>

        <div id="topbar-actions">
            ${guestLabel}
            <button onclick="logout()">Logout</button>
        </div>
    `
}

function setError(elementId, message) {
    const errorEl = document.getElementById(elementId)
    if (!errorEl) return

    if (message) {
        errorEl.innerText = message
        errorEl.style.display = "block"
    } else {
        errorEl.innerText = ""
        errorEl.style.display = "none"
    }
}

function setAuthError(message) {
    setError("auth-error", message)
}

function setRegisterError(message) {
    setError("register-error", message)
}

function setAppMessage(message) {
    clearTimeout(appMessageTimer)
    setError("app-message", message)

    if (!message) {
        return
    }

    appMessageTimer = setTimeout(() => {
        setError("app-message", "")
        appMessageTimer = null
    }, 5000)
}

function togglePassword(show, inputId) {
    const input = document.getElementById(inputId)
    if (!input) return
    input.type = show ? "text" : "password"
}

let openRowMenuId = null

function toggleRowMenu(event, menuId) {
    event.stopPropagation()
    const menu = document.getElementById(menuId)
    if (!menu) return

    const isOpen = menu.classList.contains('open')
    closeAllRowMenus()

    if (!isOpen) {
        menu.classList.add('open')
        openRowMenuId = menuId
    }
}

function closeAllRowMenus() {
    document.querySelectorAll('.row-menu-dropdown.open').forEach(el => el.classList.remove('open'))
    openRowMenuId = null
}

document.addEventListener('click', () => closeAllRowMenus())

function showAddGoalForm() {
    document.getElementById("add-goal-panel").style.display = "block"
    document.getElementById("show-add-goal-button").style.display = "none"
}

function hideAddGoalForm() {
    document.getElementById("add-goal-panel").style.display = "none"
    document.getElementById("show-add-goal-button").style.display = "inline-flex"
    document.getElementById("goal-title").value = ""
    document.getElementById("goal-target").value = ""
    document.getElementById("goal-date").value = ""
}

function showAddPBForm() {
    document.getElementById("add-pb-panel").style.display = "block"
    document.getElementById("show-add-pb-button").style.display = "none"
}

function hideAddPBForm() {
    document.getElementById("add-pb-panel").style.display = "none"
    document.getElementById("show-add-pb-button").style.display = "inline-flex"
    document.getElementById("pb-distance").value = ""
    document.getElementById("pb-time").value = ""
}

// ===== Authentication =====
async function login() {
    const email = document.getElementById("auth-email").value.trim()
    const password = document.getElementById("auth-password").value

    if (!email) {
        setAuthError("Email cannot be empty")
        return
    }
    if (!password) {
        setAuthError("Password cannot be empty")
        return
    }

    try {
        const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ email, password })
        })

        const data = await res.json()

        if (data.token) {
            AUTH_TOKEN = data.token
            localStorage.setItem("auth_token", AUTH_TOKEN)
            setAuthError("")
            bootApp()
        } else {
            setAuthError(data.error || `Login failed (${res.status})`)
        }
    } catch (err) {
        setAuthError("Login failed: unable to reach server.")
    }
}

async function guestLogin() {
    const email = "guest@guest.com"
    const password = "guestadmin"

    try {
        const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ email, password })
        })

        const data = await res.json()

        if (data.token) {
            AUTH_TOKEN = data.token
            localStorage.setItem("auth_token", AUTH_TOKEN)
            localStorage.setItem("isGuest", "true")
            isGuest = true
            prepareGuestSampleData()
            setAuthError("")
            bootApp()
        } else {
            setAuthError(data.error || `Login failed (${res.status})`)
        }
    } catch (err) {
        setAuthError("Guest login failed: unable to reach server.")
        return
    }
}

function logout(){
    AUTH_TOKEN = null
    localStorage.removeItem("auth_token")
    isGuest = false
    localStorage.removeItem("isGuest")
    location.reload()
}

function forceLogout(){
    AUTH_TOKEN = null
    localStorage.removeItem("auth_token")

    // Hide app, show login
    document.getElementById("app-root").style.display = "none"
    document.getElementById("register-panel").style.display = "none"
    document.getElementById("auth-panel").style.display = "block"
    setAuthError("")
}

async function register() {
    const email = document.getElementById("reg-email").value.trim()
    const password = document.getElementById("reg-password").value

    if (!email) {
        setRegisterError("Email cannot be empty")
        return
    }
    if (!password) {
        setRegisterError("Password cannot be empty")
        return
    }
    if(!email.includes("@")){
        setRegisterError("Enter a valid email")
        return
    }
    if(password.length < 8){
        setRegisterError("Password must be at least 8 characters")
        return
    }

    try {
        const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({ email, password })
        })

        const data = await res.json()

        if(data.token){
            AUTH_TOKEN = data.token
            localStorage.setItem("auth_token", AUTH_TOKEN)
            setRegisterError("")
            bootApp()
        } else {
            setRegisterError(data.error || `Registration failed (${res.status})`)
        }
    } catch (err) {
        setRegisterError("Registration failed: unable to reach server.")
    }
}

function showRegister(){
    document.getElementById("auth-panel").style.display = "none"
    document.getElementById("register-panel").style.display = "block"
    setAuthError("")
    setRegisterError("")
}

function showLogin(){
    document.getElementById("register-panel").style.display = "none"
    document.getElementById("auth-panel").style.display = "block"
    setAuthError("")
    setRegisterError("")
}

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

    if (!selectedDate && isGuest) {
        const today = getDateString(new Date())
        if (calendarData[today]) {
            selectedDate = today
        }
    }

    renderCalendar(currentYear, currentMonth)
    loadStats()

    if (selectedDate && calendarData[selectedDate]) {
        selectDay(selectedDate)
    }
    if (isGuest) applyGuestReadOnlyUI()
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
        leftActions.push(`<button class="btn-primary" ${disabledAttr} ${canEditSession ? `onclick="completeSession(${s.id})"` : ""}>Complete</button>`)
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
    <div class="session-card">
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
    </div>
    `
}

// ===== Session actions =====
async function addSession() {
    if (isGuest) {
        setAppMessage("Guest mode is read-only.")
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
    document.getElementById("session-date").value = selectedDate || ""  

    loadCalendar()
}

async function completeSession(id) {
    if (isGuest) {
        setAppMessage("Guest mode is read-only.")
        return
    }

    const card = document.getElementById(`session-${id}`)
    if(!card) return
    if(card.querySelector(".volume-box")) return

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
        setAppMessage("Guest mode is read-only.")
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
    if (selectedDate) selectDay(selectedDate)
}

async function addNote(id) {
    if (isGuest) {
        setAppMessage("Guest mode is read-only.")
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
        setAppMessage("Guest mode is read-only.")
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
        setAppMessage("Guest mode is read-only.")
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
        setAppMessage("Guest mode is read-only.")
        return
    }

    await authFetch(`/api/sessions/${id}/delete`, {
        method: "DELETE"
    })

    await loadCalendar()
    if (selectedDate) selectDay(selectedDate)
}

// ===== Goals =====
async function loadGoals() {
    console.log("loadGoals() called")
    const now = new Date()
    const year = now.getFullYear()

    let goals = []
    if (isGuest) {
        goals = guestGoals.filter(g => g.end_date.startsWith(`${year}-`))
    } else {
        const res = await authFetch(`/api/goals?year=${year}`)
        if (!res) return
        goals = await res.json()
    }

    const container = document.getElementById("goals-list")
    container.innerHTML = ""
    const header = document.createElement("div")
    header.className = "goal-list-header"
    header.innerHTML = `
        <div class="goal-col goal-col-title">Title</div>
        <div class="goal-col goal-col-target">Target</div>
        <div class="goal-col goal-col-end">End date</div>
        <div class="goal-col goal-col-actions"></div>
    `
    container.appendChild(header)

    if (goals) {
        goals.forEach(g => {
            const div = document.createElement("div")
            div.id = `goal-row-${g.id}`
            div.innerHTML = renderGoalCard(g)
            container.appendChild(div)
        });
    }
}

const kebabIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>`
const editIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`
const trashIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z"/></svg>`

function renderGoalCard(g) {
    const disabledAttr = isGuest ? "disabled" : ""
    const menuId = `goal-menu-${g.id}`

    return `
    <div class="goal-card">
        <div class="goal-col goal-col-title"><b>${htmlEscape(g.title)}</b></div>
        <div class="goal-col goal-col-target">${htmlEscape(g.target)}</div>
        <div class="goal-col goal-col-end">${htmlEscape(g.end_date)}</div>
        <div class="goal-col goal-col-actions">
            <div class="row-menu">
                <button class="row-menu-trigger" onclick="toggleRowMenu(event, '${menuId}')" aria-label="Goal options">${kebabIcon}</button>
                <div class="row-menu-dropdown" id="${menuId}">
                    <button ${disabledAttr} onclick="editGoal(${g.id})">${editIcon} Edit</button>
                    <button class="danger" ${disabledAttr} onclick="deleteGoal(${g.id})">${trashIcon} Delete</button>
                </div>
            </div>
        </div>
    </div>
    `
}

function editGoal(id) {
    closeAllRowMenus()
    if (isGuest) {
        setAppMessage("Guest mode is read-only.")
        return
    }

    const row = document.getElementById(`goal-row-${id}`)
    if (!row) return

    const now = new Date()
    const year = now.getFullYear()
    const goals = isGuest ? guestGoals : window.__lastLoadedGoals
    // We don't keep a separate goals cache. Simplest approach: refetch.
    ;(async () => {
        let goal
        if (isGuest) {
            goal = guestGoals.find(g => g.id === id)
        } else {
            const res = await authFetch(`/api/goals?year=${year}`)
            if (!res) return
            const list = await res.json()
            goal = list.find(g => g.id === id)
        }
        if (!goal) return

        row.innerHTML = `
        <div class="goal-edit-row">
            <div class="goal-edit-fields">
                <div class="session-edit-field">
                    <label>Title</label>
                    <input id="edit-goal-title-${id}" value="${htmlEscape(goal.title)}">
                </div>
                <div class="session-edit-field">
                    <label>Target</label>
                    <input id="edit-goal-target-${id}" value="${htmlEscape(goal.target)}">
                </div>
                <div class="session-edit-field">
                    <label>End date</label>
                    <input id="edit-goal-date-${id}" type="date" value="${htmlEscape(goal.end_date)}">
                </div>
            </div>
            <div class="goal-edit-actions">
                <button class="btn-secondary" onclick="cancelEditGoal()">Cancel</button>
                <button class="btn-primary" onclick="saveGoalEdit(${id})">Save</button>
            </div>
        </div>
        `
    })()
}

function cancelEditGoal() {
    loadGoals()
}

async function saveGoalEdit(id) {
    const title = document.getElementById(`edit-goal-title-${id}`)?.value || ''
    const target = document.getElementById(`edit-goal-target-${id}`)?.value || ''
    const end_date = document.getElementById(`edit-goal-date-${id}`)?.value || ''

    if (!title || !target || !end_date) {
        setAppMessage("Fill all goal fields.")
        return
    }

    await authFetch(`/api/goals/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ title, target, end_date })
    })

    loadGoals()
}

async function addGoal() {
    if (isGuest) {
        setAppMessage("Guest mode is read-only.")
        document.getElementById("goal-title").value = ""
        document.getElementById("goal-target").value = ""
        document.getElementById("goal-date").value = ""
        return
    }

    const title = document.getElementById("goal-title").value
    const target = document.getElementById("goal-target").value
    let date = document.getElementById("goal-date").value

    if (!date) {
        const year = new Date().getFullYear()
        date = `${year}-12-31`
    }

    if(!title || !target){
        setAppMessage("Fill both goal title and target.")
        return
    }

    await authFetch("/api/goals", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
            title: title,
            target: target,
            end_date: date
        })
    })

    hideAddGoalForm()
    loadGoals()
}

async function deleteGoal(id) {
    closeAllRowMenus()
    if (isGuest) {
        setAppMessage("Guest mode is read-only.")
        return
    }

    await authFetch(`/api/goals/${id}/delete`, {
        method: "DELETE"
    })
    loadGoals()
}

// ===== Stats =====
async function loadStats(){
    loadMonthlyStats()
    loadYearlyStats()
}

function setupChartResizeObservers() {
    const monthlyContainer = document.getElementById("monthly-panel")
    const yearlyContainer = document.getElementById("yearly-panel")

    if (monthlyContainer && !monthlyChartResizeObserver) {
        let rafId = null
        monthlyChartResizeObserver = new ResizeObserver(() => {
            if (rafId) cancelAnimationFrame(rafId)
            rafId = requestAnimationFrame(() => renderMonthlyChart())
        })
        monthlyChartResizeObserver.observe(monthlyContainer)
    }

    if (yearlyContainer && !yearlyChartResizeObserver) {
        let rafId = null
        yearlyChartResizeObserver = new ResizeObserver(() => {
            if (rafId) cancelAnimationFrame(rafId)
            rafId = requestAnimationFrame(() => renderYearlyChart())
        })
        yearlyChartResizeObserver.observe(yearlyContainer)
    }
}

async function getPreviousMonthsAverage(monthsBack = 3) {
    let year = currentYear
    let month = currentMonth
    const distances = []
    const durations = []

    for (let i = 0; i < monthsBack; i++) {
        month -= 1
        if (month < 1) {
            month = 12
            year -= 1
        }
        const res = await authFetch(`/api/stats/month?year=${year}&month=${month}`)
        if (!res) continue
        const monthData = await res.json()
        const d = Number(monthData.monthly_distance_km) || 0
        const t = Number(monthData.monthly_duration_min) || 0
        if (d > 0) distances.push(d)
        if (t > 0) durations.push(t)
    }

    const avgDistance = distances.length ? distances.reduce((a, b) => a + b, 0) / distances.length : 0
    const avgDuration = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0

    return { avgDistance, avgDuration }
}

function getContentWidth(el) {
    const style = window.getComputedStyle(el)
    const paddingLeft = parseFloat(style.paddingLeft) || 0
    const paddingRight = parseFloat(style.paddingRight) || 0
    return el.clientWidth - paddingLeft - paddingRight
}

async function loadMonthlyStats() {
    let data = { monthly_distance_km: 0, monthly_duration_min: 0 }
    if (isGuest) {
        data = guestMonthlyStats
    } else {
        const res = await authFetch(`/api/stats/month?year=${currentYear}&month=${currentMonth}`)
        if (!res) return
        data = await res.json()
    }

    const safeDist = Number(data.monthly_distance_km) || 0
    const safeDur = Number(data.monthly_duration_min) || 0

    const { avgDistance, avgDuration } = await getPreviousMonthsAverage(3)
    const MIN_DISTANCE_GOAL_KM = 10
    const MIN_DURATION_GOAL_MIN = 60

    let distanceGoal = avgDistance
    let durationGoal = avgDuration
    if (!distanceGoal || distanceGoal < MIN_DISTANCE_GOAL_KM) distanceGoal = MIN_DISTANCE_GOAL_KM
    if (!durationGoal || durationGoal < MIN_DURATION_GOAL_MIN) durationGoal = MIN_DURATION_GOAL_MIN

    // Cache the resolved values so resize/redraw never needs the network again.
    cachedMonthlyChartInputs = { safeDist, safeDur, distanceGoal, durationGoal }

    renderMonthlyChart()
}

function renderMonthlyChart() {
    if (!cachedMonthlyChartInputs) return
    const { safeDist, safeDur, distanceGoal, durationGoal } = cachedMonthlyChartInputs

    const displayDist = safeDist * 6
    const displayDur = safeDur

    const canvas = document.getElementById("statsChart")
    const container = document.getElementById("monthly-panel")
    const ctx = canvas.getContext("2d")

    if (monthlyChart) {
        monthlyChart.destroy()
        monthlyChart = null
    }

    const chartData = {
        labels: ["Distance (km)", "Time (min)"],
        datasets: [{
            label: 'Volume',
            data: [0, 0],
            backgroundColor: 'transparent',
            borderRadius: 6,
            barThickness: 30
        }]
    }

    const maxCanvasSize = 4096
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2))
    const widthPx = getContentWidth(container) || canvas.clientWidth || 400
    const heightPx = 156 // fixed layout height, intentionally not measured (avoids any height-based feedback)

    canvas.width = Math.min(Math.round(widthPx * dpr), maxCanvasSize)
    canvas.height = Math.min(Math.round(heightPx * dpr), maxCanvasSize)
    canvas.style.width = widthPx + 'px'
    canvas.style.height = heightPx + 'px'

    const valueFontPx = 13
    const goalFontPx = 12
    const tickFontPx = 13

    const options = {
        indexAxis: 'y',
        responsive: false,
        maintainAspectRatio: false,
        layout: {
            padding: { top: 16, bottom: 16, left: 8, right: 24 }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(2, 6, 23, 0.95)',
                titleColor: '#f8fafc',
                bodyColor: '#e2e8f0',
                borderColor: 'rgba(148, 163, 184, 0.35)',
                borderWidth: 1,
                cornerRadius: 10,
                callbacks: {
                    label: (context) => {
                        return context.dataIndex === 0
                            ? `${safeDist.toFixed(1)} km`
                            : `${safeDur.toFixed(0)} min`
                    }
                }
            }
        },
        scales: {
            x: {
                display: false,
                min: 0,
                max: Math.max(1400, Math.max(displayDist, displayDur, distanceGoal * 6, durationGoal) + 220),
                ticks: { display: false },
                grid: { display: false, drawBorder: false }
            },
            y: {
                ticks: {
                    display: true,
                    color: '#cbd5e1',
                    font: { size: tickFontPx, family: 'Inter', weight: '600' }
                },
                grid: { display: false, drawBorder: false },
                border: { display: false }
            }
        },
        datasets: { bar: { categoryPercentage: 0.78, barPercentage: 0.9 } }
    }

    const GOAL_X_FRACTION = 0.72

    const customBarsPlugin = {
        id: 'customBarsPlugin',
        afterDatasetsDraw(chart) {
            const { ctx, chartArea } = chart
            if (!chartArea) return
            const meta = chart.getDatasetMeta(0)
            const distanceBar = meta.data[0]
            const durationBar = meta.data[1]
            if (!distanceBar || !durationBar) return

            const barHalfThickness = 30 / 2
            const plotWidth = chartArea.right - chartArea.left
            const goalPixelX = chartArea.left + plotWidth * GOAL_X_FRACTION

            const drawRow = (bar, value, goal, gradientColors, accentColor) => {
                const rowTop = bar.y - barHalfThickness
                const rowBottom = bar.y + barHalfThickness

                const ratio = goal > 0 ? value / goal : 0
                const rawBarWidth = ratio * plotWidth * GOAL_X_FRACTION
                const barWidth = Math.max(0, Math.min(rawBarWidth, plotWidth))

                const gradient = ctx.createLinearGradient(chartArea.left, rowTop, chartArea.left + Math.max(barWidth, 80), rowBottom)
                gradient.addColorStop(0, gradientColors[0])
                gradient.addColorStop(1, gradientColors[1])

                ctx.save()
                ctx.fillStyle = 'rgba(15, 23, 42, 0.55)'
                ctx.beginPath()
                ctx.roundRect(chartArea.left, rowTop - 4, plotWidth * GOAL_X_FRACTION + 8, rowBottom - rowTop + 8, 8)
                ctx.fill()

                ctx.shadowColor = 'rgba(15, 23, 42, 0.28)'
                ctx.shadowBlur = 10
                ctx.shadowOffsetY = 4
                ctx.fillStyle = gradient
                ctx.beginPath()
                ctx.roundRect(chartArea.left, rowTop, barWidth, rowBottom - rowTop, 6)
                ctx.fill()

                ctx.shadowBlur = 0
                ctx.shadowOffsetY = 0
                ctx.strokeStyle = accentColor
                ctx.lineWidth = 1
                ctx.stroke()
                ctx.restore()

                return { rowTop, rowBottom, barRight: chartArea.left + barWidth }
            }

            const distRow = drawRow(distanceBar, safeDist, distanceGoal, ['#4ade80', '#16a34a'], '#4ade80')
            const durRow = drawRow(durationBar, safeDur, durationGoal, ['#60a5fa', '#2563eb'], '#60a5fa')

            ctx.save()
            ctx.strokeStyle = 'rgba(184, 201, 226, 0.7)'
            ctx.lineWidth = 1.25
            ctx.setLineDash([5, 4])
            ctx.beginPath()
            ctx.moveTo(goalPixelX, distRow.rowTop - 10)
            ctx.lineTo(goalPixelX, distRow.rowBottom + 10)
            ctx.stroke()
            ctx.beginPath()
            ctx.moveTo(goalPixelX, durRow.rowTop - 10)
            ctx.lineTo(goalPixelX, durRow.rowBottom + 10)
            ctx.stroke()
            ctx.setLineDash([])
            ctx.restore()

            ctx.save()
            ctx.font = `600 ${valueFontPx}px Inter`
            ctx.textAlign = 'left'
            ctx.fillStyle = '#f8fafc'
            const distValueText = `${safeDist.toFixed(1)} km`
            const durValueText = `${safeDur.toFixed(0)} min`
            const distLabelX = Math.min(distRow.barRight + 8, chartArea.right - ctx.measureText(distValueText).width - 12)
            const durLabelX = Math.min(durRow.barRight + 8, chartArea.right - ctx.measureText(durValueText).width - 12)
            ctx.fillText(distValueText, distLabelX, distanceBar.y + 4)
            ctx.fillText(durValueText, durLabelX, durationBar.y + 4)

            ctx.font = `${goalFontPx}px Inter`
            ctx.fillStyle = '#94a3b8'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'bottom'
            ctx.fillText(`${distanceGoal.toFixed(1)} km goal`, goalPixelX, distRow.rowTop - 12)
            ctx.textBaseline = 'top'
            ctx.fillText(`${durationGoal.toFixed(0)} min goal`, goalPixelX, durRow.rowBottom + 12)
            ctx.restore()
        }
    }

    monthlyChart = new Chart(ctx, { type: 'bar', data: chartData, options, plugins: [customBarsPlugin] })
}

async function loadYearlyStats() {
    let statsByYear = {}

    if (isGuest) {
        statsByYear = guestYearlyStats
    } else {
        for (let i = 0; i < selectedYears.length; i++) {
            const year = selectedYears[i]
            const res = await authFetch(`/api/stats/year?year=${year}`)
            if (!res) return
            statsByYear[year] = await res.json()
        }
    }

    cachedYearlyStatsByYear = statsByYear
    renderYearlyChart()
}

function renderYearlyChart() {
    if (!cachedYearlyStatsByYear) return

    const toggle = document.getElementById("toggle-volume-type")
    const metric = toggle && toggle.checked ? "duration" : "distance"

    const labelEl = document.getElementById("toggle-label")
    if (labelEl) {
        labelEl.textContent =
            metric === "distance" ? "Show by Duration" : "Show by Distance"
    }

    const colors = ["#eb41ac","#a78bfa","#f59e0b","#60a5fa","#d6e723","#ef4444","#22c55e","#2f0a9d"]

    const years = Object.keys(cachedYearlyStatsByYear).map(Number).sort((a, b) => a - b)
    let allData = []

    years.forEach((year, i) => {
        const data = cachedYearlyStatsByYear[year]
        const hasData = data.some(m => (metric === "distance" ? m.distance_km : m.duration_min) > 0)
        if (hasData) {
            allData.push({ year, data, color: colors[i % colors.length] })
        }
    })

    allData.sort((a, b) => a.year - b.year)

    const visibleCount = Math.min(5, allData.length)
    const hideCount = allData.length - visibleCount

    const metricHeader = document.getElementById("yearly-metric-header")
    const tableBody = document.getElementById("yearly-totals-body")

    if (metricHeader) {
        metricHeader.textContent = metric === "distance"
            ? "Total Distance (km)"
            : "Total Duration (min)"
    }

    tableBody.innerHTML = ""
    allData.forEach(item => {
        let total = 0
        item.data.forEach(monthData => {
            total += metric === "distance" ? monthData.distance_km : monthData.duration_min
        })

        const row = document.createElement("tr")
        const unit = metric === "distance" ? "km" : "min"
        row.innerHTML = `
            <td>${item.year}</td>
            <td>${total.toFixed(metric === "distance" ? 1 : 0)} ${unit}</td>
        `
        tableBody.appendChild(row)
    })

    const labels = MONTH_NAMES.map(m => m.substring(0,3))
    const nextHiddenYears = new Set()

    allData.forEach((item, idx) => {
        const yearLabel = String(item.year)
        const hadPreviousState = yearlyHiddenYears.has(yearLabel)

        if (hadPreviousState) {
            nextHiddenYears.add(yearLabel)
        } else if (idx < hideCount) {
            nextHiddenYears.add(yearLabel)
        }
    })

    yearlyHiddenYears = nextHiddenYears

    const datasets = allData.map((item) => ({
        label: String(item.year),
        data: item.data.map(m => metric === 'distance' ? m.distance_km : m.duration_min),
        borderColor: item.color,
        backgroundColor: item.color,
        fill: false,
        tension: 0.2,
        pointRadius: 3,
        hidden: yearlyHiddenYears.has(String(item.year))
    }))

    const chartData = { labels, datasets }

    const canvas = document.getElementById("yearlyChart")
    const container = document.getElementById("yearly-panel")
    const ctx = canvas.getContext("2d")

    if (yearlyChart) {
        yearlyChart.destroy()
        yearlyChart = null
    }

    const maxCanvasSize = 4096
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2))
    const widthPx = getContentWidth(container) || canvas.clientWidth || 400
    const heightPx = 320 // fixed layout height

    canvas.width = Math.min(Math.round(widthPx * dpr), maxCanvasSize)
    canvas.height = Math.min(Math.round(heightPx * dpr), maxCanvasSize)
    canvas.style.width = widthPx + 'px'
    canvas.style.height = heightPx + 'px'

    const optionsY = {
        responsive: false,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                labels: { color: '#d3d6da' },
                onClick: (event, legendItem, legend) => {
                    const chart = legend.chart
                    const datasetIndex = legendItem.datasetIndex
                    const yearLabel = String(allData[datasetIndex]?.year)

                    if (!yearLabel) return

                    if (yearlyHiddenYears.has(yearLabel)) {
                        yearlyHiddenYears.delete(yearLabel)
                    } else {
                        yearlyHiddenYears.add(yearLabel)
                    }

                    chart.data.datasets[datasetIndex].hidden = yearlyHiddenYears.has(yearLabel)
                    chart.update()
                }
            },
            tooltip: { mode: 'index', intersect: false }
        },
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        scales: {
            x: {
                ticks: {
                    color: '#d3d6da',
                    font: { size: 12, family: 'Inter', weight: '400' }
                },
                border: { display: false }
            },
            y: {
                beginAtZero: true,
                ticks: {
                    callback: v => (metric === 'distance' ? Number(v).toFixed(1) : Number(v).toFixed(0)),
                    color: '#d3d6da',
                    padding: 6,
                    font: { size: 12, family: 'Inter', weight: '400' }
                },
                grid: { color: 'rgba(148, 163, 184, 0.35)', drawTicks: false },
                border: { display: false },
                title: { display: true, text: metric === 'distance' ? 'Distance (km)' : 'Duration (min)', color: '#d3d6da', font: { size: 14, family: 'Inter', weight: '600' } }
            }
        }
    }

    yearlyChart = new Chart(ctx, { type: 'line', data: chartData, options: optionsY })
}

async function addMonthlyVolume() {
    if (isGuest) {
        setAppMessage("Guest mode is read-only.")
        document.getElementById("mv-year").value = ""
        document.getElementById("mv-month").value = ""
        document.getElementById("mv-distance").value = ""
        document.getElementById("mv-duration").value = ""
        return
    }

    const year = parseInt(document.getElementById("mv-year").value)
    const month = parseInt(document.getElementById("mv-month").value)
    const distance = parseFloat(document.getElementById("mv-distance").value)
    const duration = parseInt(document.getElementById("mv-duration").value)

    if(!year || !month || !distance || !duration){
        setAppMessage("Fill all fields to add monthly volume.")
        document.getElementById("mv-year").value = ""
        document.getElementById("mv-month").value = ""
        document.getElementById("mv-distance").value = ""
        document.getElementById("mv-duration").value = ""
        return
    }

    await authFetch("/api/stats/manual", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
            year,
            month,
            distance_km:distance,
            duration_min:duration
        })
    })

    document.getElementById("mv-year").value = ""
    document.getElementById("mv-month").value = ""
    document.getElementById("mv-distance").value = ""
    document.getElementById("mv-duration").value = ""

    loadStats()
}

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
        setAppMessage("Guest mode is read-only.")
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
        setAppMessage("Guest mode is read-only.")
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
        setAppMessage("Guest mode is read-only.")
        return
    }

    await authFetch(`/api/pbs/${id}/delete`, {
        method: "DELETE"
    })
    loadPersonalBests()
}