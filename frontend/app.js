console.log("APP LOADED")

let AUTH_TOKEN = localStorage.getItem("auth_token") || null

let isGuest = localStorage.getItem("isGuest") === "true"

let currentYear = new Date().getFullYear()
let currentMonth = new Date().getMonth() + 1

let calendarData = {}
let selectedDate = null
let appMessageTimer = null

const MONTH_NAMES = [
  "January","February","March","April","May","June",
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
let yearlyStatsRequestId = 0
let monthlyChartResizeObserver = null
let yearlyHiddenYears = new Set()

// ===== Utilities =====
function getDateString(date) {
    return date.toISOString().split("T")[0]
}

function getLocalDateString(date = new Date()) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

function isFutureSession(session) {
    return Boolean(session?.date && session.date > getLocalDateString())
}

function prevMonth() {
    currentMonth--
    if (currentMonth === 0) {
        currentMonth = 12
        currentYear--
    }
    loadCalendar()
    loadMonthlyStats()
}

function nextMonth() {
    currentMonth++
    if (currentMonth === 13) {
        currentMonth = 1
        currentYear++
    }
    loadCalendar()
    loadMonthlyStats()
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

function getIsoWeekNumber(year, monthIndex, day) {
    const date = new Date(Date.UTC(year, monthIndex, day))
    const weekday = (date.getUTCDay() + 6) % 7
    date.setUTCDate(date.getUTCDate() - weekday + 3)

    const isoYear = date.getUTCFullYear()
    const firstThursday = new Date(Date.UTC(isoYear, 0, 4))
    const firstWeekday = (firstThursday.getUTCDay() + 6) % 7
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstWeekday + 3)

    return 1 + Math.round((date - firstThursday) / 604800000)
}

function buildGuestWeeklyStats(year) {
    const months = guestYearlyStats[year] || []
    const weeks = Array.from({ length: 53 }, (_, index) => ({
        year,
        week: index + 1,
        distance_km: 0,
        duration_min: 0
    }))

    months.forEach((monthData, monthIndex) => {
        const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
        const daysByWeek = new Map()

        for (let day = 1; day <= daysInMonth; day++) {
            const week = getIsoWeekNumber(year, monthIndex, day)
            if (week >= 1 && week <= weeks.length) {
                daysByWeek.set(week, (daysByWeek.get(week) || 0) + 1)
            }
        }

        daysByWeek.forEach((dayCount, week) => {
            const weekData = weeks[week - 1]
            weekData.distance_km += (Number(monthData.distance_km) || 0) * dayCount / daysInMonth
            weekData.duration_min += (Number(monthData.duration_min) || 0) * dayCount / daysInMonth
        })
    })

    weeks.forEach(week => {
        week.distance_km = Number(week.distance_km.toFixed(1))
        week.duration_min = Math.round(week.duration_min)
    })
    return weeks
}

// ===== App lifecycle =====
function bootApp(){
    document.getElementById("landing-page").style.display = "none"
    document.getElementById("auth-panel").style.display = "none"
    document.getElementById("register-panel").style.display = "none"
    document.getElementById("app-root").style.display = "block"

    document.getElementById("session-date").value = ""
    setAppMessage("")
    document.getElementById("overview-month").innerText =
        `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`

    if (isGuest) {
        prepareGuestSampleData()
    }

    updateTopbar()
    loadCalendar()
    loadGoals()
    loadStats()
    loadOverviewStats()
    setupChartResizeObservers()
    bindYearlySegmentedControl("[data-metric]", () => renderYearlyChart())
    bindYearlySegmentedControl("[data-resolution]", () => loadYearlyStats())
    loadPersonalBests()
}

function bindYearlySegmentedControl(optionSelector, onChange) {
    const options = [...document.querySelectorAll(`.yearly-segmented-option${optionSelector}`)]
    options.forEach(button => {
        button.onclick = () => {
            options.forEach(option => {
                const selected = option === button
                option.classList.toggle("is-active", selected)
                option.setAttribute("aria-pressed", String(selected))
            })
            onChange()
        }
    })
}

// ===== UI helpers =====
function applyGuestReadOnlyUI() {
    const selectors = [
        "#show-add-goal-button",
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
    document.querySelectorAll(".current-year").forEach(element => {
        element.textContent = new Date().getFullYear()
    })

    if(AUTH_TOKEN){
        bootApp()
    } else {
        document.getElementById("landing-page").style.display = "block"
    }
}

// ===== Landing page navigation =====
function showLandingPage(){
    document.getElementById("auth-panel").style.display = "none"
    document.getElementById("register-panel").style.display = "none"
    document.getElementById("app-root").style.display = "none"
    document.getElementById("landing-page").style.display = "block"
    setAuthError("")
    setRegisterError("")
}

function showLoginFromLanding(){
    document.getElementById("landing-page").style.display = "none"
    document.getElementById("register-panel").style.display = "none"
    document.getElementById("auth-panel").style.display = "block"
}

function showRegisterFromLanding(){
    document.getElementById("landing-page").style.display = "none"
    document.getElementById("auth-panel").style.display = "none"
    document.getElementById("register-panel").style.display = "block"
    setRegisterBackDestination(true)
    setAuthError("")
    setRegisterError("")
}

function updateTopbar() {
    const topBar = document.getElementById("topbar")

    let guestLabel = isGuest 
        ? `<span style="margin-right:10px;">Preview mode</span>` 
        : ""
    const logoutLabel = isGuest ? "Back to home" : "Logout"

    topBar.innerHTML = `
        <div id="logo">ALtrack Training Platform</div>

        <div id="topbar-actions">
            ${guestLabel}
            <button onclick="logout()">${logoutLabel}</button>
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

function showAddSessionForm() {
    const panel = document.getElementById("add-session-panel")
    panel.style.display = "block"
    document.getElementById("session-date").value = selectedDate || getDateString(new Date())
    panel.scrollIntoView({ behavior: "smooth", block: "center" })
    document.getElementById("session-title").focus({ preventScroll: true })
}

function hideAddSessionForm() {
    document.getElementById("add-session-panel").style.display = "none"
    document.getElementById("session-title").value = ""
    document.getElementById("session-desc").value = ""
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

    // Hide app, show landing page
    document.getElementById("app-root").style.display = "none"
    document.getElementById("register-panel").style.display = "none"
    document.getElementById("auth-panel").style.display = "none"
    document.getElementById("landing-page").style.display = "block"
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
    setRegisterBackDestination(false)
    setAuthError("")
    setRegisterError("")
}

function setRegisterBackDestination(isLandingPage){
    const backButton = document.getElementById("register-back-button")
    backButton.textContent = isLandingPage ? "Back to home" : "Back to login"
    backButton.setAttribute("onclick", isLandingPage ? "showLandingPage()" : "showLogin()")
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
        setAppMessage("Preview mode is read-only.")
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
        setAppMessage("Preview mode is read-only.")
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
        setAppMessage("Preview mode is read-only.")
        return
    }

    await authFetch(`/api/goals/${id}`, {
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
    if (monthlyContainer && !monthlyChartResizeObserver) {
        let rafId = null
        monthlyChartResizeObserver = new ResizeObserver(() => {
            if (rafId) cancelAnimationFrame(rafId)
            rafId = requestAnimationFrame(() => renderMonthlyChart())
        })
        monthlyChartResizeObserver.observe(monthlyContainer)
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

        if (isGuest) {
            const monthData = guestYearlyStats[year]?.[month - 1]
            const d = Number(monthData?.distance_km) || 0
            const t = Number(monthData?.duration_min) || 0
            if (d > 0) distances.push(d)
            if (t > 0) durations.push(t)
            continue
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
        const monthData = guestYearlyStats[currentYear]?.[currentMonth - 1]
        data = {
            monthly_distance_km: Number(monthData?.distance_km) || 0,
            monthly_duration_min: Number(monthData?.duration_min) || 0
        }
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

async function loadOverviewStats() {
    let data = { monthly_distance_km: 0, monthly_duration_min: 0 }
    if (isGuest) {
        data = guestMonthlyStats
    } else {
        const today = new Date()
        const year = today.getFullYear()
        const month = today.getMonth() + 1
        const res = await authFetch(`/api/stats/month?year=${year}&month=${month}`)
        if (!res) return
        data = await res.json()
    }

    const distance = Number(data.monthly_distance_km) || 0
    const duration = Number(data.monthly_duration_min) || 0
    document.getElementById("overview-distance").textContent = `${distance.toFixed(1)} km`
    document.getElementById("overview-duration").textContent = formatDuration(duration)
}

function renderMonthlyChart() {
    if (!cachedMonthlyChartInputs) return
    const { safeDist, safeDur, distanceGoal, durationGoal } = cachedMonthlyChartInputs

    const canvas = document.getElementById("statsChart")
    const container = document.getElementById("monthly-panel")
    const ctx = canvas.getContext("2d")

    if (monthlyChart) {
        monthlyChart.destroy()
        monthlyChart = null
    }

    const chartData = {
        labels: ["Distance", "Time"],
        datasets: [{
            label: "Monthly progress",
            data: [0, 0],
            backgroundColor: "transparent",
            barThickness: 76
        }]
    }

    const maxCanvasSize = 4096
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2))
    const widthPx = getContentWidth(container) || canvas.clientWidth || 400
    const heightPx = 292

    canvas.width = Math.min(Math.round(widthPx * dpr), maxCanvasSize)
    canvas.height = Math.min(Math.round(heightPx * dpr), maxCanvasSize)
    canvas.style.width = widthPx + 'px'
    canvas.style.height = heightPx + 'px'

    const options = {
        responsive: false,
        maintainAspectRatio: false,
        layout: { padding: { top: 42, bottom: 40, left: 8, right: 8 } },
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
                        return context.dataIndex === 0 ? `${safeDist.toFixed(1)} km` : `${safeDur.toFixed(0)} min`
                    }
                }
            }
        },
        scales: {
            x: { display: false, grid: { display: false }, border: { display: false } },
            y: { display: false, min: 0, max: 1, grid: { display: false }, border: { display: false } }
        },
        datasets: { bar: { categoryPercentage: 0.7, barPercentage: 1 } }
    }

    const customBarsPlugin = {
        id: 'customBarsPlugin',
        afterDatasetsDraw(chart) {
            const { ctx, chartArea } = chart
            if (!chartArea) return
            const meta = chart.getDatasetMeta(0)
            const distanceBar = meta.data[0]
            const durationBar = meta.data[1]
            if (!distanceBar || !durationBar) return

            const plotHeight = chartArea.bottom - chartArea.top
            const targetHeight = plotHeight * 0.72
            const goalY = chartArea.bottom - targetHeight

            ctx.save()
            ctx.strokeStyle = 'rgba(184, 201, 226, 0.7)'
            ctx.lineWidth = 1.25
            ctx.setLineDash([5, 4])
            ctx.beginPath()
            ctx.moveTo(chartArea.left, goalY)
            ctx.lineTo(chartArea.right, goalY)
            ctx.stroke()
            ctx.setLineDash([])

            const drawColumn = (bar, value, goal, title, valueText, goalText, colors) => {
                const width = 76
                const left = bar.x - width / 2
                const ratio = goal > 0 ? Math.max(0, value / goal) : 0
                const height = Math.min(plotHeight * 0.96, targetHeight * ratio)
                const top = chartArea.bottom - height

                ctx.fillStyle = 'rgba(15, 23, 42, 0.68)'
                ctx.beginPath()
                ctx.roundRect(left, chartArea.top, width, plotHeight, 10)
                ctx.fill()

                if (height > 0) {
                    const gradient = ctx.createLinearGradient(left, chartArea.bottom, left + width, top)
                    gradient.addColorStop(0, colors[0])
                    gradient.addColorStop(1, colors[1])
                    ctx.fillStyle = gradient
                    ctx.shadowColor = 'rgba(15, 23, 42, 0.32)'
                    ctx.shadowBlur = 12
                    ctx.shadowOffsetY = 4
                    ctx.beginPath()
                    ctx.roundRect(left, top, width, height, 10)
                    ctx.fill()
                    ctx.shadowColor = 'transparent'
                    ctx.shadowBlur = 0
                    ctx.shadowOffsetY = 0
                }

                ctx.fillStyle = '#e2e8f0'
                ctx.font = '600 12px Inter'
                ctx.textAlign = 'center'
                ctx.textBaseline = 'bottom'
                ctx.fillText(title, bar.x, chartArea.top - 14)

                ctx.font = '700 12px Inter'
                ctx.textBaseline = height > 34 ? 'top' : 'bottom'
                ctx.fillStyle = height > 34 ? '#ffffff' : '#f8fafc'
                ctx.fillText(valueText, bar.x, height > 34 ? top + 10 : Math.max(chartArea.top + 18, top - 8))

                ctx.fillStyle = '#94a3b8'
                ctx.font = '11px Inter'
                ctx.textBaseline = 'top'
                ctx.fillText(goalText, bar.x, chartArea.bottom + 14)
            }

            drawColumn(distanceBar, safeDist, distanceGoal, 'Distance (km)', `${safeDist.toFixed(1)} km`, `${distanceGoal.toFixed(1)} km goal`, ['#16a34a', '#4ade80'])
            drawColumn(durationBar, safeDur, durationGoal, 'Time (min)', `${safeDur.toFixed(0)} min`, `${durationGoal.toFixed(0)} min goal`, ['#2563eb', '#60a5fa'])
            ctx.restore()
        }
    }

    monthlyChart = new Chart(ctx, { type: 'bar', data: chartData, options, plugins: [customBarsPlugin] })
}

async function loadYearlyStats() {
    const requestId = ++yearlyStatsRequestId
    const resolution = getYearlyResolution()
    let statsByYear = {}

    if (isGuest) {
        statsByYear = Object.fromEntries(Object.keys(guestYearlyStats).map(year => [
            year,
            resolution === "week" ? buildGuestWeeklyStats(Number(year)) : guestYearlyStats[year]
        ]))
    } else {
        for (let i = 0; i < selectedYears.length; i++) {
            const year = selectedYears[i]
            const endpoint = resolution === "week" ? "/api/stats/year/weeks" : "/api/stats/year"
            const res = await authFetch(`${endpoint}?year=${year}`)
            if (!res) return
            statsByYear[year] = await res.json()
        }
    }

    if (requestId !== yearlyStatsRequestId) return
    cachedYearlyStatsByYear = statsByYear
    renderYearlyChart()
}

function getYearlyResolution() {
    return document.querySelector(".yearly-segmented-option.is-active[data-resolution]")?.dataset.resolution || "month"
}

function getYearlyMetric() {
    return document.querySelector(".yearly-segmented-option.is-active[data-metric]")?.dataset.metric || "distance"
}

function renderYearlyChart() {
    if (!cachedYearlyStatsByYear) return

    const metric = getYearlyMetric()
    const resolution = getYearlyResolution()

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

    const labels = resolution === "week"
        ? Array.from({ length: 53 }, (_, index) => `W${String(index + 1).padStart(2, "0")}`)
        : MONTH_NAMES.map(m => m.substring(0,3))
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
    const ctx = canvas.getContext("2d")

    if (yearlyChart) {
        yearlyChart.destroy()
        yearlyChart = null
    }

    const optionsY = {
        responsive: true,
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
            tooltip: { mode: 'index', axis: 'x', intersect: false }
        },
        interaction: { mode: 'index', axis: 'x', intersect: false },
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
                    callback: v => {
                        if (metric === 'distance') return Number(v).toFixed(1)
                        const totalMinutes = Math.round(Number(v) || 0)
                        const hours = Math.floor(totalMinutes / 60)
                        const minutes = totalMinutes % 60
                        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
                    },
                    color: '#d3d6da',
                    padding: 6,
                    font: { size: 12, family: 'Inter', weight: '400' }
                },
                grid: { color: 'rgba(148, 163, 184, 0.35)', drawTicks: false },
                border: { display: false },
                title: { display: true, text: metric === 'distance' ? 'Distance (km)' : 'Duration (hh:mm)', color: '#d3d6da', font: { size: 14, family: 'Inter', weight: '600' } }
            }
        }
    }

    yearlyChart = new Chart(ctx, { type: 'line', data: chartData, options: optionsY })
}

async function addMonthlyVolume() {
    if (isGuest) {
        setAppMessage("Preview mode is read-only.")
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
