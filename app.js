document.addEventListener("DOMContentLoaded", () => {
    const API_BASE_URL = "";

    let currentStep = 1;
    let startupIdea = "";
    let questions = [];

    const step1El = document.getElementById("step-1");
    const step2El = document.getElementById("step-2");
    const step3El = document.getElementById("step-3");

    const ideaInput = document.getElementById("startup-idea-input");
    const answer1Input = document.getElementById("answer-1");
    const answer2Input = document.getElementById("answer-2");
    const answer3Input = document.getElementById("answer-3");
    
    const lblQuestion1 = document.getElementById("lbl-question-1");
    const lblQuestion2 = document.getElementById("lbl-question-2");
    const lblQuestion3 = document.getElementById("lbl-question-3");
    const charNumEl = document.getElementById("char-num");

    const btnGetQuestions = document.getElementById("btn-get-questions");
    const btnBackToStep1 = document.getElementById("btn-back-to-step-1");
    const btnGetAnalysis = document.getElementById("btn-get-analysis");
    const btnRestart = document.getElementById("btn-restart");

    const loadingOverlay = document.getElementById("loading-overlay");
    const loadingText = document.getElementById("loading-text");
    const toastContainer = document.getElementById("toast-container");

    const confidenceBadge = document.getElementById("confidence-badge-value");
    const confidenceGlow = document.getElementById("confidence-glow");
    const reportContentBody = document.getElementById("report-content-body");

    ideaInput.addEventListener("input", (e) => {
        const charCount = e.target.value.length;
        charNumEl.textContent = charCount.toLocaleString();
        if (charCount > 0) {
            ideaInput.classList.remove("invalid");
        }
    });

    [answer1Input, answer2Input, answer3Input].forEach((input) => {
        input.addEventListener("input", () => {
            input.classList.remove("invalid");
        });
    });

    function showLoading(text) {
        loadingText.textContent = text;
        loadingOverlay.classList.add("active");
    }

    function hideLoading() {
        loadingOverlay.classList.remove("active");
    }

    function showToast(message) {
        const toast = document.createElement("div");
        toast.className = "toast";
        toast.innerHTML = `
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>${message}</span>
        `;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = "slideInRight 0.3s reverse forwards";
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 4000);
    }

    function transitionToStep(targetStep) {
        step1El.classList.remove("active");
        step1El.classList.add("hidden");
        step2El.classList.remove("active");
        step2El.classList.add("hidden");
        step3El.classList.remove("active");
        step3El.classList.add("hidden");

        if (targetStep === 1) {
            step1El.classList.remove("hidden");
            step1El.classList.add("active");
            ideaInput.focus();
        } else if (targetStep === 2) {
            step2El.classList.remove("hidden");
            step2El.classList.add("active");
            answer1Input.focus();
        } else if (targetStep === 3) {
            step3El.classList.remove("hidden");
            step3El.classList.add("active");
        }
        currentStep = targetStep;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    btnGetQuestions.addEventListener("click", async () => {
        const idea = ideaInput.value.trim();
        if (!idea) {
            ideaInput.classList.add("invalid");
            showToast("Please enter your startup idea before proceeding.");
            return;
        }

        startupIdea = idea;
        showLoading("Generating smart questions...");

        try {
            const response = await fetch(`${API_BASE_URL}/generate-questions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ idea: startupIdea })
            });

            const data = await response.json();
            hideLoading();

            if (data.status === "success" && data.questions && data.questions.length >= 3) {
                questions = data.questions;
                lblQuestion1.textContent = questions[0];
                lblQuestion2.textContent = questions[1];
                lblQuestion3.textContent = questions[2];

                answer1Input.value = "";
                answer2Input.value = "";
                answer3Input.value = "";

                transitionToStep(2);
            } else {
                showToast(data.message || "Failed to generate questions. Please try again.");
            }
        } catch (error) {
            hideLoading();
            showToast("Server connection error. Please verify the backend is running.");
            console.error("Fetch Error:", error);
        }
    });

    btnBackToStep1.addEventListener("click", () => {
        transitionToStep(1);
    });

    btnGetAnalysis.addEventListener("click", async () => {
        const a1 = answer1Input.value.trim();
        const a2 = answer2Input.value.trim();
        const a3 = answer3Input.value.trim();

        let hasError = false;
        if (!a1) { answer1Input.classList.add("invalid"); hasError = true; }
        if (!a2) { answer2Input.classList.add("invalid"); hasError = true; }
        if (!a3) { answer3Input.classList.add("invalid"); hasError = true; }

        if (hasError) {
            showToast("Please answer all three questions to proceed.");
            return;
        }

        showLoading("Critiquing assumptions and validation plan...");

        try {
            const response = await fetch(`${API_BASE_URL}/analyze`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    idea: startupIdea,
                    answer1: a1,
                    answer2: a2,
                    answer3: a3
                })
            });

            const data = await response.json();
            hideLoading();

            if (data.status === "success" && data.analysis) {
                renderAnalysisDashboard(data.analysis);
                transitionToStep(3);
            } else {
                showToast(data.message || "Failed to get analysis. Please try again.");
            }
        } catch (error) {
            hideLoading();
            showToast("Server connection error. Please verify the backend is running.");
            console.error("Fetch Error:", error);
        }
    });

    btnRestart.addEventListener("click", () => {
        startupIdea = "";
        ideaInput.value = "";
        charNumEl.textContent = "0";
        transitionToStep(1);
    });

    function renderAnalysisDashboard(analysisText) {
        const confidence = extractConfidence(analysisText);
        confidenceBadge.textContent = confidence;
        confidenceBadge.className = `confidence-badge ${confidence.toLowerCase()}`;
        confidenceGlow.className = `pulsing-glow ${confidence.toLowerCase()}`;
        reportContentBody.innerHTML = parseMarkdownToHtml(analysisText);
    }

    function extractConfidence(text) {
        let confidence = "Medium";
        const clean = text.replace(/[\*\_\#\-\[\]]/g, '');
        const confIdx = clean.toUpperCase().indexOf("CONFIDENCE");
        if (confIdx !== -1) {
            const snippet = clean.substring(confIdx, confIdx + 60);
            if (snippet.toUpperCase().includes("LOW")) {
                confidence = "Low";
            } else if (snippet.toUpperCase().includes("HIGH")) {
                confidence = "High";
            } else if (snippet.toUpperCase().includes("MEDIUM")) {
                confidence = "Medium";
            }
        }
        return confidence;
    }

    function parseMarkdownToHtml(markdown) {
        let html = markdown.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
        html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

        const lines = html.split("\n");
        let parsedHtml = "";
        let inList = false;
        let inTable = false;
        let tableHeaders = [];
        let tableRows = [];
        let sectionOpened = false;

        const closeSection = () => {
            if (sectionOpened) {
                parsedHtml += "</div>";
                sectionOpened = false;
            }
        };

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();

            if (!line) {
                if (inList) {
                    parsedHtml += "</ul>";
                    inList = false;
                }
                continue;
            }

            if (line === "---" || line === "___" || line === "***") {
                if (inList) { parsedHtml += "</ul>"; inList = false; }
                if (inTable) { parsedHtml += renderHtmlTable(tableHeaders, tableRows); inTable = false; tableHeaders = []; tableRows = []; }
                closeSection();
                continue;
            }

            if (line.startsWith("#") || line.startsWith("<strong>HIDDEN ASSUMPTIONS") || line.startsWith("<strong>DAY ONE ACTION") || line.startsWith("<strong>REASONING") || line.startsWith("<strong>CONFIDENCE")) {
                if (inList) { parsedHtml += "</ul>"; inList = false; }
                if (inTable) { parsedHtml += renderHtmlTable(tableHeaders, tableRows); inTable = false; tableHeaders = []; tableRows = []; }
                closeSection();

                let headingText = "";
                let headingLevel = 3;
                let sectionClass = "report-section";

                if (line.startsWith("#")) {
                    const match = line.match(/^(#+)/);
                    headingLevel = match ? match[0].length : 3;
                    headingText = line.replace(/#+\s*/, "");
                } else {
                    headingText = line.replace(/<strong>(.*?)<\/strong>/, "$1").replace(/:$/, "");
                }

                const headingUpper = headingText.toUpperCase();
                let iconHtml = '<i class="fa-solid fa-lightbulb"></i>';

                if (headingUpper.includes("ASSUMPTION")) {
                    iconHtml = '<i class="fa-solid fa-magnifying-glass-chart"></i>';
                    sectionClass += " assumptions-section";
                } else if (headingUpper.includes("ACTION")) {
                    iconHtml = '<i class="fa-solid fa-route"></i>';
                    sectionClass += " day-one-section";
                } else if (headingUpper.includes("REASONING")) {
                    iconHtml = '<i class="fa-solid fa-chart-line"></i>';
                    sectionClass += " reasoning-section";
                } else if (headingUpper.includes("CONFIDENCE")) {
                    if (i + 1 < lines.length && lines[i + 1].trim()) {
                        i++;
                    }
                    continue;
                }

                parsedHtml += `<div class="${sectionClass}">`;
                parsedHtml += `<h${headingLevel}>${iconHtml}<span>${headingText}</span></h${headingLevel}>`;
                sectionOpened = true;
                continue;
            }

            if (line.startsWith("|")) {
                if (inList) { parsedHtml += "</ul>"; inList = false; }
                inTable = true;
                if (line.includes("---")) {
                    continue;
                }
                const cells = line.split("|").map(cell => cell.trim()).filter((cell, idx, arr) => idx > 0 && idx < arr.length - 1);
                if (tableHeaders.length === 0) {
                    tableHeaders = cells;
                } else {
                    tableRows.push(cells);
                }
                continue;
            } else {
                if (inTable) {
                    parsedHtml += renderHtmlTable(tableHeaders, tableRows);
                    inTable = false;
                    tableHeaders = [];
                    tableRows = [];
                }
            }

            const listMatch = line.match(/^([*\-+]|\d+\.)\s+(.*)/);
            if (listMatch) {
                if (!inList) {
                    parsedHtml += "<ul>";
                    inList = true;
                }
                parsedHtml += `<li>${listMatch[2]}</li>`;
                continue;
            } else {
                if (inList) {
                    parsedHtml += "</ul>";
                    inList = false;
                }
            }

            parsedHtml += `<p>${line}</p>`;
        }

        if (inList) parsedHtml += "</ul>";
        if (inTable) parsedHtml += renderHtmlTable(tableHeaders, tableRows);
        closeSection();

        return parsedHtml;
    }

    function renderHtmlTable(headers, rows) {
        let tableHtml = "<table><thead><tr>";
        headers.forEach(header => {
            tableHtml += `<th>${header}</th>`;
        });
        tableHtml += "</tr></thead><tbody>";
        rows.forEach(row => {
            tableHtml += "<tr>";
            row.forEach(cell => {
                tableHtml += `<td>${cell}</td>`;
            });
            tableHtml += "</tr>";
        });
        tableHtml += "</tbody></table>";
        return tableHtml;
    }
});
