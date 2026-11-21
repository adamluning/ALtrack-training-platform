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

