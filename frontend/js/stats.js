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

    hideManualVolumeForm()
    loadStats()
}

