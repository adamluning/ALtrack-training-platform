console.log("APP LOADED")

let AUTH_TOKEN = localStorage.getItem("auth_token") || null

let isGuest = localStorage.getItem("isGuest") === "true"

let currentYear = new Date().getFullYear()
let currentMonth = new Date().getMonth() + 1

let calendarData = {}
let selectedDate = null

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

function getDateString(date) {
    return date.toISOString().split("T")[0]
}

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

    const statYears = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3]

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

document.getElementById("toggle-volume-type").addEventListener("change", statsYear)

function bootApp(){
    document.getElementById("auth-panel").style.display = "none"
    document.getElementById("register-panel").style.display = "none"
    document.getElementById("app-root").style.display = "block"

    document.getElementById("session-date").value = ""

    if (isGuest) {
        prepareGuestSampleData()
    }

    updateTopbar()
    loadCalendar()
    loadGoals()
    loadStats()
    loadPBs()
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

window.addEventListener("resize", () => {
    loadStats()
})

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

function togglePassword(show, inputId) {
    const input = document.getElementById(inputId)
    if (!input) return
    input.type = show ? "text" : "password"
}

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
}

function renderSessionCard(s){
    const leftActions = []
    if (!s.completed) {
        leftActions.push(`<button onclick="complete_s(${s.id})">Complete</button>`)
    }
    if (!s.notes) {
        leftActions.push(`<input id="note-${s.id}" placeholder="Add note"><button onclick="addNote(${s.id})">Save note</button>`)
    }

    return `
    <div class="session-card">
        <div class="session-header">
        <div class="session-title">${s.title}</div>
            <div>
                ${s.completed 
                ? `✅ <span class="session-volume">🏃 ${s.distance_km.toFixed(1)} km · ⏱ ${s.duration_min} min</span>`
                : `⏳`
                }
            </div>
        </div>

        <div class="session-desc">${s.description}</div>

        ${s.notes ? `<div class="session-notes">📝 ${s.notes}</div>` : ""}

        <div class="session-actions">
            ${leftActions.length ? `<div class="session-left-actions">${leftActions.join('')}</div>` : ""}
            <div class="session-right-actions">
                <button class="edit-session-button" onclick="editSession(${s.id})">Edit session</button>
                <button class="delete-session-button" onclick="delete_s(${s.id})">Delete session</button>
            </div>
        </div>
    </div>
    `
}

async function addSession() {
    if (isGuest) {
        alert("Guest mode: cannot add sessions")
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

async function complete_s(id) {
    if (isGuest) {
        alert("Guest mode: cannot complete sessions")
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
        alert("Guest mode: cannot add sessions")
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
        alert("Guest mode: cannot add notes")
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
        alert("Guest mode: cannot edit sessions")
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
        alert("Guest mode: cannot edit sessions")
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

async function delete_s(id) {
    if (isGuest) {
        alert("Guest mode: cannot delete sessions")
        return
    }

    await authFetch(`/api/sessions/${id}/delete`, {
        method: "DELETE"
    })

    await loadCalendar()
    if (selectedDate) selectDay(selectedDate)
}

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
    if (goals) {
        goals.forEach(g => {
            const div = document.createElement("div")
            div.innerHTML = `
                <b>${g.title} </b> — ${g.target} — ${g.end_date}
                <button onclick="delete_g(${g.id})">Delete</button>
            `
            container.appendChild(div)
        });
    }
}

async function addGoal() {
    if (isGuest) {
        alert("Guest mode: cannot add goals")
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

    await authFetch("/api/goals", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
            title: title,
            target: target,
            end_date: date
        })
    })

    document.getElementById("goal-title").value = ""
    document.getElementById("goal-target").value = ""
    document.getElementById("goal-date").value = ""

    loadGoals()
}

async function delete_g(id) {
    if (isGuest) {
        alert("Guest mode: cannot delete goals")
        return
    }

    await authFetch(`/api/goals/${id}/delete`, {
        method: "DELETE"
    })
    loadGoals()
}

async function loadStats(){
    statsMonth()
    statsYear()
}

async function statsMonth() {
    let data = { monthly_distance_km: 0, monthly_duration_min: 0 }
    if (isGuest) {
        data = guestMonthlyStats
    } else {
        const res = await authFetch(`/api/stats/month?year=${currentYear}&month=${currentMonth}`)
        if (!res) return
        data = await res.json()
    }

    const canvas = document.getElementById("statsChart")
    const ctx = canvas.getContext("2d")
    canvas.width = canvas.clientWidth
    canvas.height = canvas.clientHeight

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.font = "14px Inter"

    const dist = data.monthly_distance_km || 0
    const dur = data.monthly_duration_min || 0

    const baseX = 160
    const barY1 = 20
    const barY2 = 70
    const maxWidth = canvas.width - baseX - 40

    const MAX_DISTANCE = 150
    const MAX_DURATION = 1500

    const distScale = maxWidth / MAX_DISTANCE
    const durScale  = maxWidth / MAX_DURATION

    const distWidth = Math.min(dist, MAX_DISTANCE) * distScale
    const durWidth = Math.min(dur, MAX_DURATION) * durScale

    // Distance bar
    ctx.fillStyle = "#22c55e"
    ctx.fillRect(baseX, barY1, distWidth, 30)

    // Time bar
    ctx.fillStyle = "#60a5fa"
    ctx.fillRect(baseX, barY2, durWidth, 30)

    // labels
    ctx.fillStyle = "#e5e7eb"
    ctx.fillText("Distance (km)", 20, barY1+20)
    ctx.fillText("Time (min)", 20, barY2+20)

    ctx.fillText(dist.toFixed(1), baseX + distWidth + 8, barY1+20)
    ctx.fillText(dur.toString(), baseX + durWidth+ 8, barY2+20)
}

async function statsYear() {
    const canvas = document.getElementById("yearlyChart")
    const ctx = canvas.getContext("2d")

    const rect = canvas.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1

    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio

    canvas.style.width = rect.width + "px"
    canvas.style.height = rect.height + "px"

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.clearRect(0, 0, rect.width, rect.height)

    const toggle = document.getElementById("toggle-volume-type")
    const metric = toggle && toggle.checked ? "duration" : "distance"

    const labelEl = document.getElementById("toggle-label")
    if (labelEl) {
        labelEl.textContent =
            metric === "distance" ? "Show by Duration" : "Show by Distance"
    }

    const colors = ["#eb41ac","#a78bfa","#f59e0b","#60a5fa","#d6e723","#ef4444","#22c55e","#2f0a9d"]

    let allData = []

    if (isGuest) {
        const guestYears = Object.keys(guestYearlyStats).map(Number)//.sort()
        guestYears.forEach((year, i) => {
            const data = guestYearlyStats[year]
            const hasData = data.some(m => (metric === "distance" ? m.distance_km : m.duration_min) > 0)
            if (hasData) {
                allData.push({ year, data, color: colors[i % colors.length] })
            }
        })
    } else {
        for (let i = 0; i < selectedYears.length; i++) {
            const year = selectedYears[i]
            const res = await authFetch(`/api/stats/year?year=${year}`)
            if (!res) return
            const data = await res.json()

            let hasData = false
            for (let m = 0; m < 12; m++) {
                const val = metric === "distance"
                    ? data[m].distance_km
                    : data[m].duration_min

                if (val > 0) hasData = true
            }

            if (hasData) {
                allData.push({ year, data, color: colors[i % colors.length] })
            }
        }
    }

    // Update yearly totals table
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
            if (metric === "distance") {
                total += monthData.distance_km
            } else {
                total += monthData.duration_min
            }
        })
        
        const row = document.createElement("tr")
        const unit = metric === "distance" ? "km" : "min"
        row.innerHTML = `
            <td>${item.year}</td>
            <td>${total.toFixed(metric === "distance" ? 1 : 0)} ${unit}</td>
        `
        tableBody.appendChild(row)
    })

    const width = rect.width
    const height = rect.height

    const padding = 50
    const baseY = height - padding
    const chartHeight = height - padding * 2
    const chartWidth = width - padding * 2

    const maxVal = Math.max(
        ...allData.flatMap(y =>
            y.data.map(m =>
                metric === "distance" ? m.distance_km : m.duration_min
            )
        ),
        1
    )

    const scaleY = chartHeight / maxVal
    const stepX = chartWidth / 11

    // axes
    ctx.strokeStyle = "#94a3b8"
    ctx.beginPath()
    ctx.moveTo(padding, padding)
    ctx.lineTo(padding, baseY)
    ctx.lineTo(width - padding, baseY)
    ctx.stroke()

    // y-axis ticks
    ctx.fillStyle = "#e5e7eb"
    ctx.font = "12px Inter"

    const steps = 5
    for (let i = 0; i <= steps; i++) {
        const val = (maxVal / steps) * i
        const y = baseY - val * scaleY

        ctx.fillText(val.toFixed(0), 30, y + 4)

        ctx.strokeStyle = "#334155"
        ctx.beginPath()
        ctx.moveTo(padding, y)
        ctx.lineTo(width - padding, y)
        ctx.stroke()
    }

    // month labels
    ctx.fillStyle = "#e5e7eb"
    for (let m = 0; m < 12; m++) {
        const x = padding + m * stepX
        ctx.fillText(MONTH_NAMES[m].substring(0, 3), x - 8, baseY + 20)
    }

    // draw lines
    allData.forEach(y => {
        ctx.strokeStyle = y.color
        ctx.fillStyle = y.color
        ctx.lineWidth = 2
        ctx.beginPath()

        y.data.forEach((m, i) => {
            const value = metric === "distance"
                ? m.distance_km
                : m.duration_min

            const x = padding + i * stepX
            const yPos = baseY - value * scaleY

            if (i === 0) ctx.moveTo(x, yPos)
            else ctx.lineTo(x, yPos)
        })

        ctx.stroke()

        // markers
        y.data.forEach((m, i) => {
            const value = metric === "distance"
                ? m.distance_km
                : m.duration_min

            const x = padding + i * stepX
            const yPos = baseY - value * scaleY

            ctx.beginPath()
            ctx.arc(x, yPos, 4, 0, Math.PI * 2)
            ctx.fill()
        })

        // legend
        ctx.fillText(
            y.year,
            width - selectedYears.length * 30 + selectedYears.indexOf(y.year) * 30,
            20
        )
    })

    // axis labels
    ctx.fillStyle = "#e5e7eb"
    ctx.font = "14px Inter"
    ctx.fillText("Month", width / 2 - 30, height - 10)

    ctx.save()
    ctx.translate(15, height / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = "center"

    ctx.fillText(
        metric === "distance" ? "Distance (km)" : "Duration (min)",
        0,
        0
    )

    ctx.restore()

    ctx.textAlign = "left"
}

async function addMonthlyVolume() {
    if (isGuest) {
        alert("Guest mode: cannot add sessions")
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
        alert("Fill all fields")
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

async function loadPBs() {
    console.log("loadPBs() called")

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
    if (pbs) {
        pbs.sort((a, b) => a.distance - b.distance)
        pbs.forEach(pb => {
            const div = document.createElement("div")
            div.className = "pb-card"
            div.innerHTML = `
                <b>${pb.distance} km </b> ${pb.time}</b>
                <button onclick="delete_pb(${pb.id})">Delete</button>
            `
            container.appendChild(div)
        });
    }
}

function isValidTime(t) {
    return /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.test(t);
}

async function addPB() {
    if (isGuest) {
        alert("Guest mode: cannot add PB")
        document.getElementById("pb-distance").value = ""
        document.getElementById("pb-time").value = ""
        return
    }

    const distance = parseFloat(document.getElementById("pb-distance").value)
    let time = document.getElementById("pb-time").value

    if(!distance || !time){
        alert("Fill distance and time")
        return
    }

    if (!isValidTime(time)) {
        alert("Time must be in hh:mm:ss format");
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

    document.getElementById("pb-distance").value = ""
    document.getElementById("pb-time").value = ""

    loadPBs()
}

async function delete_pb(id) {
    if (isGuest) {
        alert("Guest mode: cannot delete PB")
        return
    }

    await authFetch(`/api/pbs/${id}/delete`, {
        method: "DELETE"
    })
    loadPBs()
}