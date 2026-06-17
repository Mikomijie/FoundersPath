document.addEventListener("DOMContentLoaded", () => {
    const API_BASE_URL = window.location.protocol.startsWith("http") ? "" : "http://127.0.0.1:8000";

    // ── Pages ──────────────────────────────────────────────────────
    const landingPage = document.getElementById("landing-page");
    const appPage     = document.getElementById("app-page");

    // ── Landing elements ───────────────────────────────────────────
    const heroIdeaInput  = document.getElementById("hero-idea-input");
    const btnHeroAnalyse = document.getElementById("btn-hero-analyse");
    const navCta         = document.getElementById("nav-cta");
    const navSignIn      = document.getElementById("nav-sign-in");
    const toastContainer = document.getElementById("toast-container");

    // ── Chat elements ──────────────────────────────────────────────
    const chatSidebar    = document.getElementById("chat-sidebar");
    const chatHome       = document.getElementById("chat-home");
    const chatScroll     = document.getElementById("chat-scroll");
    const chatThread     = document.getElementById("chat-thread");
    const chatInput      = document.getElementById("chat-input");
    const btnSend        = document.getElementById("btn-send");
    const btnNewAnalysis = document.getElementById("btn-new-analysis");
    const historyList    = document.getElementById("cs-history-list");
    const btnCsCollapse  = document.getElementById("btn-cs-collapse");
    const btnCsExpand    = document.getElementById("btn-cs-expand");
    const appLogoHome    = document.getElementById("app-logo-home");

    // ── Auth modal elements ────────────────────────────────────────
    const authOverlay    = document.getElementById("auth-overlay");
    const authClose      = document.getElementById("auth-close");
    const authTabs       = document.querySelectorAll(".auth-tab");
    const loginForm      = document.getElementById("auth-form-login");
    const registerForm   = document.getElementById("auth-form-register");
    const loginEmailEl   = document.getElementById("auth-login-email");
    const loginPassEl    = document.getElementById("auth-login-password");
    const loginErrorEl   = document.getElementById("auth-login-error");
    const loginSubmitBtn = document.getElementById("auth-login-submit");
    const regNameEl      = document.getElementById("auth-reg-name");
    const regEmailEl     = document.getElementById("auth-reg-email");
    const regPassEl      = document.getElementById("auth-reg-password");
    const regErrorEl     = document.getElementById("auth-reg-error");
    const regSubmitBtn   = document.getElementById("auth-reg-submit");

    // ── Auth state ─────────────────────────────────────────────────
    let currentUser = null;
    let authToken   = localStorage.getItem("fp_token") || null;

    // ── Chat state ─────────────────────────────────────────────────
    let currentIdea      = "";
    let currentQuestions = [];
    let chatState        = "idle"; // 'idle' | 'loading' | 'awaiting-answers' | 'done'
    let chatHistory      = [];
    let activeChatId     = null;
    let typingBubbleEl   = null;

    // ── Helpers ────────────────────────────────────────────────────
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
        );
    }

    function relativeTime(ts) {
        const d = (Date.now() - ts) / 1000;
        if (d < 60)    return "Just now";
        if (d < 3600)  return Math.floor(d / 60)   + "m ago";
        if (d < 86400) return Math.floor(d / 3600)  + "h ago";
        return new Date(ts).toLocaleDateString();
    }

    // ── Auth HTTP helpers ──────────────────────────────────────────
    function authHeaders() {
        const h = { "Content-Type": "application/json" };
        if (authToken) h["Authorization"] = `Bearer ${authToken}`;
        return h;
    }

    // ── Auth: load on start ────────────────────────────────────────
    async function loadAuth() {
        if (!authToken) { renderSidebarAccount(); updateNavAuth(); return; }
        try {
            const res = await fetch(`${API_BASE_URL}/auth/me`, { headers: authHeaders() });
            if (!res.ok) { clearAuth(false); updateNavAuth(); return; }
            const data  = await res.json();
            currentUser = data.user;
            await loadConversationsFromServer();
        } catch {
            clearAuth(false);
        }
        renderSidebarAccount();
        updateNavAuth();
        renderHistory();
    }

    function setAuth(token, user) {
        authToken   = token;
        currentUser = user;
        localStorage.setItem("fp_token", token);
        renderSidebarAccount();
        updateNavAuth();
    }

    function clearAuth(rerender = true) {
        authToken   = null;
        currentUser = null;
        localStorage.removeItem("fp_token");
        chatHistory = JSON.parse(localStorage.getItem("fp_history") || "[]");
        if (rerender) { renderSidebarAccount(); renderHistory(); updateNavAuth(); }
    }

    // ── Conversation API ───────────────────────────────────────────
    async function loadConversationsFromServer() {
        try {
            const res  = await fetch(`${API_BASE_URL}/conversations`, { headers: authHeaders() });
            if (!res.ok) return;
            const data = await res.json();
            chatHistory = data.conversations.map(c => ({
                id:        c.id,
                idea:      c.idea,
                analysis:  c.analysis,
                timestamp: new Date(c.created_at).getTime(),
            }));
        } catch {}
    }

    async function saveConversationToServer(conv) {
        if (!currentUser) return;
        try {
            await fetch(`${API_BASE_URL}/conversations`, {
                method:  "POST",
                headers: authHeaders(),
                body:    JSON.stringify({
                    id:         conv.id,
                    idea:       conv.idea,
                    analysis:   conv.analysis,
                    created_at: new Date(conv.timestamp).toISOString(),
                }),
            });
        } catch {}
    }

    // ── Sidebar account area ───────────────────────────────────────
    function renderSidebarAccount() {
        const area = document.getElementById("cs-account-area");
        if (!area) return;

        if (currentUser) {
            const initial = currentUser.name.charAt(0).toUpperCase();
            area.innerHTML = `
                <div class="cs-account-menu" id="cs-acct-menu">
                    <div class="cs-acct-email">${escapeHtml(currentUser.email)}</div>
                    <div class="cs-menu-divider"></div>
                    <button class="cs-menu-item" id="cs-logout-btn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                        Sign out
                    </button>
                </div>
                <button class="cs-account-btn" id="cs-acct-btn">
                    <div class="cs-avatar">${initial}</div>
                    <div class="cs-acct-info">
                        <div class="cs-acct-name">${escapeHtml(currentUser.name)}</div>
                    </div>
                    <svg class="cs-acct-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 15 12 20 17 15"/><polyline points="7 9 12 4 17 9"/></svg>
                </button>
            `;
            document.getElementById("cs-acct-btn").addEventListener("click", e => {
                e.stopPropagation();
                const menu = document.getElementById("cs-acct-menu");
                menu.classList.toggle("open");
                if (menu.classList.contains("open")) {
                    document.addEventListener("click", () => menu.classList.remove("open"), { once: true });
                }
            });
            document.getElementById("cs-logout-btn").addEventListener("click", async () => {
                try { await fetch(`${API_BASE_URL}/auth/logout`, { method: "POST", headers: authHeaders() }); }
                catch {}
                clearAuth();
            });
        } else {
            area.innerHTML = `
                <button class="cs-sign-in-btn" id="cs-sign-in-btn">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                    Sign In
                </button>
            `;
            document.getElementById("cs-sign-in-btn").addEventListener("click", () => openAuthModal("login"));
        }
    }

    // ── Nav auth state ─────────────────────────────────────────────
    function updateNavAuth() {
        if (!navSignIn) return;
        if (currentUser) {
            navSignIn.textContent = currentUser.name.split(" ")[0]; // first name only
            navSignIn.style.color = "var(--text-primary)";
        } else {
            navSignIn.textContent = "Sign In";
            navSignIn.style.color = "";
        }
    }

    // ── Auth modal ─────────────────────────────────────────────────
    function openAuthModal(tab = "login") {
        authOverlay.classList.add("open");
        switchAuthTab(tab);
        loginErrorEl.textContent = "";
        regErrorEl.textContent   = "";
    }

    function closeAuthModal() {
        authOverlay.classList.remove("open");
    }

    function switchAuthTab(tab) {
        authTabs.forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
        loginForm.style.display    = tab === "login"    ? "flex" : "none";
        registerForm.style.display = tab === "register" ? "flex" : "none";
    }

    authClose.addEventListener("click", closeAuthModal);
    authOverlay.addEventListener("click", e => { if (e.target === authOverlay) closeAuthModal(); });
    authTabs.forEach(tab => tab.addEventListener("click", () => switchAuthTab(tab.dataset.tab)));

    if (navSignIn) {
        navSignIn.addEventListener("click", e => { e.preventDefault(); openAuthModal("login"); });
    }

    // ── Login submit ───────────────────────────────────────────────
    loginSubmitBtn.addEventListener("click", async () => {
        const email    = loginEmailEl.value.trim();
        const password = loginPassEl.value;
        loginErrorEl.textContent = "";

        if (!email || !password) { loginErrorEl.textContent = "Please fill in all fields."; return; }

        loginSubmitBtn.textContent = "Signing in…";
        loginSubmitBtn.disabled    = true;

        try {
            const res  = await fetch(`${API_BASE_URL}/auth/login`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();
            if (!res.ok) { loginErrorEl.textContent = data.detail || "Login failed."; return; }
            setAuth(data.token, data.user);
            await loadConversationsFromServer();
            renderHistory();
            closeAuthModal();
            showToast(`Welcome back, ${data.user.name}!`);
            showApp();
            showHome();
        } catch {
            loginErrorEl.textContent = "Connection error. Make sure the server is running.";
        } finally {
            loginSubmitBtn.textContent = "Sign In";
            loginSubmitBtn.disabled    = false;
        }
    });

    loginPassEl.addEventListener("keydown", e => { if (e.key === "Enter") loginSubmitBtn.click(); });
    loginEmailEl.addEventListener("keydown", e => { if (e.key === "Enter") loginPassEl.focus(); });

    // ── Register submit ────────────────────────────────────────────
    regSubmitBtn.addEventListener("click", async () => {
        const name     = regNameEl.value.trim();
        const email    = regEmailEl.value.trim();
        const password = regPassEl.value;
        regErrorEl.textContent = "";

        if (!name || !email || !password) { regErrorEl.textContent = "Please fill in all fields."; return; }
        if (name.length < 3) { regErrorEl.textContent = "Name must be at least 3 characters."; return; }
        if (password.length < 6) { regErrorEl.textContent = "Password must be at least 6 characters."; return; }

        regSubmitBtn.textContent = "Creating account…";
        regSubmitBtn.disabled    = true;

        try {
            const res  = await fetch(`${API_BASE_URL}/auth/register`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password }),
            });
            const data = await res.json();
            if (!res.ok) { regErrorEl.textContent = data.detail || "Registration failed."; return; }
            setAuth(data.token, data.user);
            chatHistory = [];
            renderHistory();
            closeAuthModal();
            showToast(`Account created! Welcome, ${data.user.name}.`);
            showApp();
            showHome();
        } catch {
            regErrorEl.textContent = "Connection error. Make sure the server is running.";
        } finally {
            regSubmitBtn.textContent = "Create Account";
            regSubmitBtn.disabled    = false;
        }
    });

    regPassEl.addEventListener("keydown", e => { if (e.key === "Enter") regSubmitBtn.click(); });

    // ── History persistence ────────────────────────────────────────
    function loadLocalHistory() {
        try { chatHistory = JSON.parse(localStorage.getItem("fp_history") || "[]"); }
        catch { chatHistory = []; }
    }

    function saveLocalHistory() {
        localStorage.setItem("fp_history", JSON.stringify(chatHistory));
    }

    // ── Page navigation ────────────────────────────────────────────
    function showLanding() {
        landingPage.classList.remove("hidden");
        landingPage.classList.add("active");
        appPage.classList.remove("active");
        appPage.classList.add("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function showApp() {
        landingPage.classList.add("hidden");
        landingPage.classList.remove("active");
        appPage.classList.add("active");
        appPage.classList.remove("hidden");
    }

    function launchChatbot(idea) {
        landingPage.classList.add("leaving");
        setTimeout(() => {
            landingPage.classList.remove("leaving");
            showApp();
            if (idea && idea.trim()) {
                startNewAnalysis(idea.trim());
            } else {
                showHome();
            }
        }, 340);
    }

    // ── Chat view toggles ──────────────────────────────────────────
    function showHome() {
        chatHome.style.display    = "flex";
        chatScroll.style.display  = "none";
        chatThread.innerHTML      = "";
        currentIdea               = "";
        currentQuestions          = [];
        chatState                 = "idle";
        activeChatId              = null;
        chatInput.value           = "";
        chatInput.style.height    = "";
        chatInput.placeholder     = "Describe your startup idea...";
        btnSend.disabled          = false;
    }

    function showThread() {
        chatHome.style.display   = "none";
        chatScroll.style.display = "flex";
    }

    // ── Toast ──────────────────────────────────────────────────────
    function showToast(message) {
        const toast = document.createElement("div");
        toast.className = "toast";
        const icon = document.createElement("i");
        icon.className = "fa-solid fa-circle-info";
        const text = document.createElement("span");
        text.textContent = message;
        toast.appendChild(icon);
        toast.appendChild(text);
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = "slideInRight 0.3s reverse forwards";
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // ── Chat bubbles ───────────────────────────────────────────────
    function appendBubble(type, content) {
        const bubble = document.createElement("div");
        bubble.className = `chat-bubble ${type}`;

        const avatar = document.createElement("div");
        avatar.className = "chat-bubble-avatar";
        if (type === "ai") {
            const img = document.createElement("img");
            img.src = "assets/logo.svg";
            img.alt = "FP";
            img.style.cssText = "width:22px;height:22px;border-radius:5px";
            avatar.appendChild(img);
        } else {
            avatar.textContent = currentUser ? currentUser.name.charAt(0).toUpperCase() : "U";
        }

        const body = document.createElement("div");
        body.className = "chat-bubble-body";
        body.appendChild(content); // always a DOM node — never a string

        bubble.appendChild(avatar);
        bubble.appendChild(body);
        chatThread.appendChild(bubble);
        scrollToBottom();
        return bubble;
    }

    function appendUserBubble(text) {
        const span = document.createElement("span");
        span.textContent = text; // textContent never parses HTML
        appendBubble("user", span);
    }

    function appendTypingIndicator() {
        const dots = document.createElement("div");
        dots.className = "typing-dots";
        for (let i = 0; i < 3; i++) dots.appendChild(document.createElement("span"));
        const b = appendBubble("ai", dots);
        typingBubbleEl = b;
        return b;
    }

    function removeTypingIndicator() {
        if (typingBubbleEl) { typingBubbleEl.remove(); typingBubbleEl = null; }
    }

    function scrollToBottom() {
        chatScroll.scrollTop = chatScroll.scrollHeight;
    }

    // ── Start new analysis ─────────────────────────────────────────
    async function startNewAnalysis(idea) {
        currentIdea  = idea;
        activeChatId = "fp_" + Date.now();
        chatState    = "loading";

        showThread();
        chatThread.innerHTML    = "";
        appendUserBubble(idea);

        btnSend.disabled        = true;
        chatInput.value         = "";
        chatInput.style.height  = "";
        chatInput.placeholder   = "Waiting for questions…";

        appendTypingIndicator();

        try {
            const res  = await fetch(`${API_BASE_URL}/generate-questions`, {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ idea: currentIdea }),
            });
            const data = await res.json();
            removeTypingIndicator();

            if (data.status === "success" && data.questions && data.questions.length >= 3) {
                currentQuestions  = data.questions;
                chatState         = "awaiting-answers";
                chatInput.placeholder = "Fill in the answers above…";
                appendQuestionsForm(data.questions);
            } else {
                chatState         = "idle";
                btnSend.disabled  = false;
                chatInput.placeholder = "Describe your startup idea...";
                showToast(data.message || "Failed to generate questions. Please try again.");
            }
        } catch {
            removeTypingIndicator();
            chatState         = "idle";
            btnSend.disabled  = false;
            chatInput.placeholder = "Describe your startup idea...";
            showToast("Server connection error. Make sure the backend is running.");
        }
    }

    // ── Questions + answer form ────────────────────────────────────
    function appendQuestionsForm(questions) {
        const wrapper = document.createElement("div");

        const intro = document.createElement("p");
        intro.style.cssText = "color:#c4c4c4;margin-bottom:16px;font-size:14px;";
        intro.textContent = "Here are 3 critical questions to challenge your assumptions:";
        wrapper.appendChild(intro);

        const form = document.createElement("div");
        form.className = "answer-form";

        questions.forEach((q, i) => {
            const item  = document.createElement("div");
            item.className = "answer-item";

            const label = document.createElement("label");
            label.className  = "answer-label";
            label.htmlFor    = `answer-${i + 1}`;
            label.textContent = q;

            const ta = document.createElement("textarea");
            ta.className   = "answer-input";
            ta.id          = `answer-${i + 1}`;
            ta.placeholder = "Your answer…";
            ta.rows        = 2;
            ta.addEventListener("input", () => ta.classList.remove("invalid"));

            item.appendChild(label);
            item.appendChild(ta);
            form.appendChild(item);
        });

        const submitBtn = document.createElement("button");
        submitBtn.className = "btn-submit-answers";
        submitBtn.id        = "btn-submit-answers";
        submitBtn.innerHTML = 'Analyze My Idea <i class="fa-solid fa-brain" style="margin-left:6px"></i>';
        submitBtn.addEventListener("click", handleSubmitAnswers);
        form.appendChild(submitBtn);

        wrapper.appendChild(form);
        appendBubble("ai", wrapper);
    }

    // ── Submit answers ─────────────────────────────────────────────
    async function handleSubmitAnswers() {
        const a1 = (document.getElementById("answer-1")?.value || "").trim();
        const a2 = (document.getElementById("answer-2")?.value || "").trim();
        const a3 = (document.getElementById("answer-3")?.value || "").trim();

        let hasError = false;
        if (!a1) { document.getElementById("answer-1").classList.add("invalid"); hasError = true; }
        if (!a2) { document.getElementById("answer-2").classList.add("invalid"); hasError = true; }
        if (!a3) { document.getElementById("answer-3").classList.add("invalid"); hasError = true; }
        if (hasError) { showToast("Please answer all three questions."); return; }

        const submitBtn = document.getElementById("btn-submit-answers");
        if (submitBtn) submitBtn.disabled = true;
        document.querySelectorAll(".answer-input").forEach(el => el.disabled = true);

        chatState = "loading";
        appendUserBubble(`${a1}\n\n${a2}\n\n${a3}`);
        appendTypingIndicator();
        btnSend.disabled      = true;
        chatInput.placeholder = "Analyzing your startup…";

        try {
            const res  = await fetch(`${API_BASE_URL}/analyze`, {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body:    JSON.stringify({ idea: currentIdea, answer1: a1, answer2: a2, answer3: a3 }),
            });
            const data = await res.json();
            removeTypingIndicator();

            if (data.status === "success" && data.analysis) {
                chatState = "done";
                appendAnalysisBubble(data.analysis);

                const conv = {
                    id:        activeChatId,
                    idea:      currentIdea,
                    analysis:  data.analysis,
                    timestamp: Date.now(),
                };
                chatHistory.unshift(conv);
                saveLocalHistory();
                saveConversationToServer(conv);
                renderHistory();

                chatInput.placeholder = "Validate another idea…";
                btnSend.disabled      = false;
            } else {
                chatState = "awaiting-answers";
                if (submitBtn) submitBtn.disabled = false;
                document.querySelectorAll(".answer-input").forEach(el => el.disabled = false);
                showToast(data.message || "Failed to analyze startup.");
            }
        } catch {
            removeTypingIndicator();
            chatState = "awaiting-answers";
            if (submitBtn) submitBtn.disabled = false;
            document.querySelectorAll(".answer-input").forEach(el => el.disabled = false);
            showToast("Server connection error. Make sure the backend is running.");
        }
    }

    // ── Analysis bubble ────────────────────────────────────────────
    function appendAnalysisBubble(analysisText) {
        const confidence = extractConfidence(analysisText);
        const container  = document.createElement("div");

        const confRow = document.createElement("div");
        confRow.className = "chat-confidence-row";
        confRow.innerHTML = `
            <span class="chat-confidence-label">Confidence:</span>
            <span class="chat-confidence-badge ${confidence.toLowerCase()}">${confidence}</span>
        `;
        container.appendChild(confRow);

        const content = document.createElement("div");
        content.innerHTML = parseMarkdownToHtml(analysisText);
        container.appendChild(content);

        const restartRow = document.createElement("div");
        restartRow.className = "chat-restart-row";
        restartRow.innerHTML = '<span class="chat-restart-text">Ready to validate another idea?</span>';

        const restartBtn = document.createElement("button");
        restartBtn.className   = "btn-chat-restart";
        restartBtn.textContent = "New Analysis";
        restartBtn.addEventListener("click", () => { showHome(); renderHistory(); });
        restartRow.appendChild(restartBtn);
        container.appendChild(restartRow);

        appendBubble("ai", container);
    }

    // ── History rendering ──────────────────────────────────────────
    function renderHistory() {
        historyList.innerHTML = "";
        if (chatHistory.length === 0) {
            const empty = document.createElement("div");
            empty.className   = "cs-recents-empty";
            empty.textContent = currentUser ? "No analyses yet" : "Sign in to save history";
            historyList.appendChild(empty);
            return;
        }
        chatHistory.forEach(item => {
            const el = document.createElement("div");
            el.className = "cs-history-item" + (item.id === activeChatId ? " active" : "");

            const idea = document.createElement("div");
            idea.className   = "cs-history-idea";
            idea.textContent = item.idea;

            const time = document.createElement("div");
            time.className   = "cs-history-time";
            time.textContent = relativeTime(item.timestamp);

            el.appendChild(idea);
            el.appendChild(time);
            el.addEventListener("click", () => openHistoryItem(item));
            historyList.appendChild(el);
        });
    }

    function openHistoryItem(item) {
        activeChatId   = item.id;
        currentIdea    = item.idea;
        chatState      = "done";

        showThread();
        chatThread.innerHTML = "";
        appendUserBubble(item.idea);
        appendAnalysisBubble(item.analysis);
        renderHistory();

        chatInput.placeholder = "Validate another idea…";
        btnSend.disabled      = false;
    }

    // ── Send logic ─────────────────────────────────────────────────
    function handleSend() {
        const text = chatInput.value.trim();
        if (!text || chatState === "loading" || chatState === "awaiting-answers") return;
        startNewAnalysis(text);
    }

    btnSend.addEventListener("click", handleSend);

    chatInput.addEventListener("keydown", e => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });

    chatInput.addEventListener("input", () => {
        chatInput.style.height = "auto";
        chatInput.style.height = Math.min(chatInput.scrollHeight, 200) + "px";
    });

    // ── Example pills ──────────────────────────────────────────────
    document.querySelectorAll(".chat-example-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            const idea = pill.dataset.idea;
            if (idea) startNewAnalysis(idea);
        });
    });

    // ── Landing page CTAs ──────────────────────────────────────────
    btnHeroAnalyse.addEventListener("click", () => {
        const idea = heroIdeaInput.value.trim();
        if (!idea) { heroIdeaInput.style.borderBottom = "2px solid #f43f5e"; heroIdeaInput.focus(); return; }
        launchChatbot(idea);
    });

    heroIdeaInput.addEventListener("input", () => { heroIdeaInput.style.borderBottom = ""; });

    navCta.addEventListener("click", e => { e.preventDefault(); launchChatbot(""); });

    document.querySelectorAll(".example-card").forEach(card => {
        card.addEventListener("click", () => {
            const idea = card.dataset.idea;
            if (idea) launchChatbot(idea);
        });
    });

    if (appLogoHome) appLogoHome.addEventListener("click", showLanding);

    // ── Sidebar collapse ───────────────────────────────────────────
    if (btnCsCollapse) {
        btnCsCollapse.addEventListener("click", () => {
            chatSidebar.classList.toggle("collapsed");
            if (btnCsExpand) btnCsExpand.style.display = chatSidebar.classList.contains("collapsed") ? "flex" : "none";
        });
    }
    if (btnCsExpand) {
        btnCsExpand.addEventListener("click", () => {
            chatSidebar.classList.remove("collapsed");
            btnCsExpand.style.display = "none";
        });
    }

    btnNewAnalysis.addEventListener("click", () => {
        if (chatState === "loading") return;
        showHome();
        renderHistory();
    });

    // ── Analysis helpers ───────────────────────────────────────────
    function extractConfidence(text) {
        let confidence = "Medium";
        const clean    = text.replace(/[\*\_\#\-\[\]]/g, "");
        const idx      = clean.toUpperCase().indexOf("CONFIDENCE");
        if (idx !== -1) {
            const snip = clean.substring(idx, idx + 60).toUpperCase();
            if (snip.includes("LOW"))    confidence = "Low";
            else if (snip.includes("HIGH"))   confidence = "High";
            else if (snip.includes("MEDIUM")) confidence = "Medium";
        }
        return confidence;
    }

    function parseMarkdownToHtml(markdown) {
        // Escape raw HTML first so AI output can never inject tags or scripts.
        // Our markdown transforms below then produce controlled <strong>/<em> tags only.
        let html = markdown
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");

        html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

        const lines = html.split("\n");
        let out     = "";
        let inList  = false, inTable = false;
        let tHead   = [], tRows = [];
        let secOpen = false;

        const closeSection = () => { if (secOpen) { out += "</div>"; secOpen = false; } };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) { if (inList) { out += "</ul>"; inList = false; } continue; }

            if (line === "---" || line === "___" || line === "***") {
                if (inList)  { out += "</ul>"; inList = false; }
                if (inTable) { out += renderTable(tHead, tRows); inTable = false; tHead = []; tRows = []; }
                closeSection();
                continue;
            }

            if (
                line.startsWith("#") ||
                line.startsWith("<strong>HIDDEN ASSUMPTIONS") ||
                line.startsWith("<strong>DAY ONE ACTION") ||
                line.startsWith("<strong>REASONING") ||
                line.startsWith("<strong>CONFIDENCE")
            ) {
                if (inList)  { out += "</ul>"; inList = false; }
                if (inTable) { out += renderTable(tHead, tRows); inTable = false; tHead = []; tRows = []; }
                closeSection();

                let headingText  = "";
                let headingLevel = 3;
                let secClass     = "report-section";

                if (line.startsWith("#")) {
                    const match  = line.match(/^(#+)/);
                    headingLevel = match ? match[0].length : 3;
                    headingText  = line.replace(/#+\s*/, "");
                } else {
                    headingText = line.replace(/<strong>(.*?)<\/strong>/, "$1").replace(/:$/, "");
                }

                const upper = headingText.toUpperCase();
                let icon    = '<i class="fa-solid fa-lightbulb"></i>';

                if (upper.includes("ASSUMPTION")) { icon = '<i class="fa-solid fa-magnifying-glass-chart"></i>'; secClass += " assumptions-section"; }
                else if (upper.includes("ACTION")) { icon = '<i class="fa-solid fa-route"></i>'; secClass += " day-one-section"; }
                else if (upper.includes("REASONING")) { icon = '<i class="fa-solid fa-chart-line"></i>'; secClass += " reasoning-section"; }
                else if (upper.includes("CONFIDENCE")) { if (i + 1 < lines.length && lines[i + 1].trim()) i++; continue; }

                out += `<div class="${secClass}"><h${headingLevel}>${icon}<span>${headingText}</span></h${headingLevel}>`;
                secOpen = true;
                continue;
            }

            if (line.startsWith("|")) {
                if (inList) { out += "</ul>"; inList = false; }
                inTable = true;
                if (line.includes("---")) continue;
                const cells = line.split("|").map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
                if (tHead.length === 0) tHead = cells; else tRows.push(cells);
                continue;
            } else if (inTable) {
                out += renderTable(tHead, tRows); inTable = false; tHead = []; tRows = [];
            }

            const listMatch = line.match(/^([*\-+]|\d+\.)\s+(.*)/);
            if (listMatch) {
                if (!inList) { out += "<ul>"; inList = true; }
                out += `<li>${listMatch[2]}</li>`;
                continue;
            } else if (inList) { out += "</ul>"; inList = false; }

            out += `<p>${line}</p>`;
        }

        if (inList)  out += "</ul>";
        if (inTable) out += renderTable(tHead, tRows);
        closeSection();
        return out;
    }

    function renderTable(headers, rows) {
        let t = "<table><thead><tr>";
        headers.forEach(h => { t += `<th>${h}</th>`; });
        t += "</tr></thead><tbody>";
        rows.forEach(row => { t += "<tr>"; row.forEach(cell => { t += `<td>${cell}</td>`; }); t += "</tr>"; });
        t += "</tbody></table>";
        return t;
    }

    // ── Init ───────────────────────────────────────────────────────
    loadLocalHistory();
    renderHistory();
    loadAuth(); // async — updates account area + nav + loads server history if logged in
});

// ── Scroll-reveal + stat counters ─────────────────────────────
(function () {
    function animateCounter(el) {
        const target   = parseInt(el.dataset.count, 10);
        const suffix   = el.dataset.suffix || "";
        const duration = 1400;
        const start    = performance.now();
        function tick(now) {
            const p     = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(eased * target).toLocaleString() + suffix;
            if (p < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el    = entry.target;
            const delay = parseInt(el.dataset.delay || "0", 10);
            setTimeout(() => {
                el.classList.add("visible");
                const counter = el.querySelector("[data-count]");
                if (counter) animateCounter(counter);
            }, delay);
            observer.unobserve(el);
        });
    }, { threshold: 0.18 });

    document.querySelectorAll("[data-animate]").forEach(el => observer.observe(el));
}());
