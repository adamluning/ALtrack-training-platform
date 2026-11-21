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
        <div class="goal-col goal-col-status">Status</div>
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
    const status = g.status || (g.completed ? "completed" : "in_progress")
    const statusText = status === "completed" ? "Completed" : status === "closed" ? "Not completed" : "In progress"
    const statusActions = status === "in_progress"
        ? `<div class="goal-close-control">
               <button class="btn-secondary goal-complete-button" ${disabledAttr} onclick="toggleGoalCloseChoices(${g.id})">Close</button>
               <div class="goal-close-choices" id="goal-close-choices-${g.id}" hidden>
                   <button class="goal-outcome-completed" ${disabledAttr} onclick="setGoalStatus(${g.id}, 'completed')">Completed</button>
                   <button class="goal-outcome-not-completed" ${disabledAttr} onclick="setGoalStatus(${g.id}, 'closed')">Not completed</button>
               </div>
           </div>`
        : ""

    return `
    <div class="goal-card">
        <div class="goal-col goal-col-title"><b>${htmlEscape(g.title)}</b></div>
        <div class="goal-col goal-col-target">${htmlEscape(g.target)}</div>
        <div class="goal-col goal-col-end">${htmlEscape(g.end_date)}</div>
        <div class="goal-col goal-col-status"><span class="goal-status${status === "completed" ? " is-completed" : status === "closed" ? " is-not-completed" : ""}">${statusText}</span></div>
        <div class="goal-col goal-col-actions">
            ${statusActions}
            <div class="row-menu">
                <button class="row-menu-trigger" onclick="toggleRowMenu(event, '${menuId}')" aria-label="Goal options">${kebabIcon}</button>
                <div class="row-menu-dropdown" id="${menuId}">
                    <button ${disabledAttr} onclick="editGoal(${g.id})">${editIcon} Edit</button>
                    ${status !== "in_progress" ? `<button ${disabledAttr} onclick="setGoalStatus(${g.id}, 'in_progress')">Reopen</button>` : ""}
                    <button class="danger" ${disabledAttr} onclick="deleteGoal(${g.id})">${trashIcon} Delete</button>
                </div>
            </div>
        </div>
    </div>
    `
}

function toggleGoalCloseChoices(id) {
    const choices = document.getElementById(`goal-close-choices-${id}`)
    if (choices) choices.hidden = !choices.hidden
}

async function setGoalStatus(id, status) {
    if (isGuest) {
        setAppMessage("Preview mode is read-only.")
        return
    }
    const res = await authFetch(`/api/goals/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
    })
    if (res?.ok) await loadGoals()
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

