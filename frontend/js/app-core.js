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
        "#show-manual-volume-button",
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

function showManualVolumeForm() {
    document.getElementById("manual-volume").style.display = "block"
    document.getElementById("show-manual-volume-button").style.display = "none"
}

function hideManualVolumeForm() {
    document.getElementById("manual-volume").style.display = "none"
    document.getElementById("show-manual-volume-button").style.display = "inline-flex"
    document.getElementById("mv-year").value = ""
    document.getElementById("mv-month").value = ""
    document.getElementById("mv-distance").value = ""
    document.getElementById("mv-duration").value = ""
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

