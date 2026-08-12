const $ = (id) => document.getElementById(id);

const state = {
  selectedFile: null,
  lastFormData: null,
  lastAnalysis: null,
  progressTimer: null
};

const MAX_FILE_SIZE = 4 * 1024 * 1024;

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  initializeTheme();
  showScreen("homeScreen");
});

function bindEvents() {
  bind("cameraInput", "change", handleFileSelection);
  bind("fileInput", "change", handleFileSelection);

  bind("removeFileButton", "click", removeSelectedFile);
  bind("analyzeButton", "click", analyzeSelectedFile);
  bind("analyzeTextButton", "click", analyzeManualText);

  bind("newAnalysisButton", "click", resetApplication);
  bind("retryButton", "click", retryAnalysis);
  bind("errorNewDocumentButton", "click", resetApplication);

  bind("detailsButton", "click", () => {
    $("detailsSection")?.classList.remove("hidden");
    $("detailsSection")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });

  bind("closeDetailsButton", "click", () => {
    $("detailsSection")?.classList.add("hidden");
  });

  bind("evidenceButton", "click", () => {
    $("evidenceSection")?.classList.remove("hidden");
    $("evidenceSection")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });

  bind("closeEvidenceButton", "click", () => {
    $("evidenceSection")?.classList.add("hidden");
  });

  bind("themeButton", "click", toggleTheme);
}

function bind(id, eventName, handler) {
  const element = $(id);

  if (!element) {
    console.warn(`Élément introuvable : #${id}`);
    return;
  }

  element.addEventListener(eventName, handler);
}

/* ÉCRANS */

function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.remove("active");
  });

  const screen = $(screenId);

  if (screen) {
    screen.classList.add("active");
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* SÉLECTION DU FICHIER */

function handleFileSelection(event) {
  const file = event.target.files?.[0];

  if (!file) {
    return;
  }

  const acceptedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!acceptedTypes.includes(file.type)) {
    event.target.value = "";

    showError(
      "Format non compatible",
      "Choisissez un PDF, une image JPG, PNG ou WebP."
    );

    return;
  }

  state.selectedFile = file;

  displaySelectedFile(file);

  showScreen("homeScreen");
}

function displaySelectedFile(file) {
  const card = $("selectedFileCard");
  const fileName = $("fileName");
  const fileDetails = $("fileDetails");
  const fileTypeIcon = $("fileTypeIcon");
  const analyzeButton = $("analyzeButton");

  if (fileName) {
    fileName.textContent = file.name;
  }

  if (fileDetails) {
    fileDetails.textContent =
      `${getFileLabel(file)} · ${formatFileSize(file.size)}`;
  }

  if (fileTypeIcon) {
    fileTypeIcon.textContent =
      file.type === "application/pdf" ? "PDF" : "IMG";
  }

  if (card) {
    card.classList.remove("hidden");
    card.style.display = "block";

    setTimeout(() => {
      card.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    }, 150);
  }

  if (analyzeButton) {
    analyzeButton.disabled = false;
    analyzeButton.innerHTML = `
      <span>Analyser le document</span>
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M5 12h14"></path>
        <path d="m13 6 6 6-6 6"></path>
      </svg>
    `;
  }
}

function removeSelectedFile() {
  state.selectedFile = null;

  if ($("cameraInput")) {
    $("cameraInput").value = "";
  }

  if ($("fileInput")) {
    $("fileInput").value = "";
  }

  $("selectedFileCard")?.classList.add("hidden");
}

function getFileLabel(file) {
  if (file.type === "application/pdf") {
    return "Document PDF";
  }

  if (file.type === "image/jpeg") {
    return "Photo JPG";
  }

  if (file.type === "image/png") {
    return "Image PNG";
  }

  if (file.type === "image/webp") {
    return "Image WebP";
  }

  return "Document";
}

function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} octets`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} Ko`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

/* ANALYSE */

async function analyzeSelectedFile() {
  if (!state.selectedFile) {
    showError(
      "Aucun document sélectionné",
      "Choisissez d’abord un document ou prenez une photo."
    );

    return;
  }

  if (state.selectedFile.size > MAX_FILE_SIZE) {
    showError(
      "Document trop volumineux",
      `Ce document fait ${formatFileSize(state.selectedFile.size)}. ` +
      "Pour le moment, la limite est d’environ 4 Mo. " +
      "L’envoi jusqu’à 50 Mo sera ajouté ensuite."
    );

    return;
  }

  const formData = new FormData();
  formData.append("file", state.selectedFile);

  state.lastFormData = formData;

  await sendAnalysis(formData);
}

async function analyzeManualText() {
  const text = $("manualText")?.value.trim() || "";

  if (text.length < 30) {
    showError(
      "Texte trop court",
      "Collez au moins quelques phrases du document."
    );

    return;
  }

  const formData = new FormData();
  formData.append("text", text);

  state.lastFormData = formData;

  await sendAnalysis(formData);
}

async function sendAnalysis(formData) {
  showScreen("loadingScreen");
  showDidouState("thinking");
  startProgress();

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData
    });

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error(
        "Le serveur a renvoyé une réponse illisible."
      );
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
        "L’intelligence artificielle n’a pas pu analyser ce document."
      );
    }

    state.lastAnalysis = normalizeAnalysis(data);

    finishProgress();

    await wait(500);

    renderAnalysis(state.lastAnalysis);
    showScreen("resultScreen");
  } catch (error) {
    stopProgress();

    showError(
      "Impossible d’analyser ce document",
      getFriendlyError(error)
    );
  }
}

function getFriendlyError(error) {
  const message = String(error?.message || "");

  if (/failed to fetch|network|connexion/i.test(message)) {
    return "Vérifiez votre connexion Internet puis réessayez.";
  }

  if (/too large|payload|413|volumineux/i.test(message)) {
    return "Ce document dépasse la taille actuellement acceptée.";
  }

  if (/quota|429|resource exhausted/i.test(message)) {
    return "Le quota de l’IA est temporairement atteint. Réessayez plus tard.";
  }

  if (/model|not found|404/i.test(message)) {
    return "Le modèle Gemini configuré n’est pas disponible.";
  }

  return message || "Une erreur inattendue est survenue.";
}

/* DONNÉES */

function normalizeAnalysis(data) {
  const urgency = data.urgency || {};
  const amount = data.amount || {};

  return {
    documentType:
      clean(data.document_type) ||
      "Document non identifié",

    issuer:
      clean(data.issuer || data.organisme),

    summary:
      clean(data.plain_summary) ||
      "L’explication principale n’a pas pu être produite.",

    request:
      clean(data.request) ||
      "Aucune demande certaine n’a été identifiée.",

    whyReceived:
      clean(data.why_received) ||
      "La raison n’est pas clairement indiquée.",

    actions:
      normalizeActions(data.actions),

    dates:
      normalizeDates(data.dates),

    amount: {
      value:
        clean(amount.value) ||
        "Non trouvé",

      meaning:
        clean(amount.meaning) ||
        "Aucun montant principal identifié."
    },

    urgency: {
      level:
        ["none", "soon", "urgent", "uncertain"].includes(
          urgency.level
        )
          ? urgency.level
          : "uncertain",

      message:
        clean(urgency.message) ||
        "Le niveau d’attention reste à vérifier."
    },

    evidence:
      normalizeEvidence(data.evidence),

    confidence:
      Math.max(
        0,
        Math.min(100, Number(data.confidence) || 0)
      ),

    fullExplanation:
      clean(
        data.full_explanation ||
        data.explication_complete
      )
  };
}

function clean(value) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim()
    : "";
}

function normalizeActions(actions) {
  if (!Array.isArray(actions)) {
    return [];
  }

  return actions
    .slice(0, 3)
    .map((item) => {
      if (typeof item === "string") {
        return {
          action: clean(item),
          how: ""
        };
      }

      return {
        action:
          clean(item.action) ||
          "Action à vérifier",

        how:
          clean(item.how)
      };
    });
}

function normalizeDates(dates) {
  if (!Array.isArray(dates)) {
    return [];
  }

  return dates
    .map((item) => ({
      date: clean(item.date),
      label:
        clean(item.label) ||
        "Date mentionnée",
      meaning:
        clean(item.meaning || item.explication)
    }))
    .filter((item) => item.date);
}

function normalizeEvidence(evidence) {
  if (!Array.isArray(evidence)) {
    return [];
  }

  return evidence
    .slice(0, 8)
    .map((item) => ({
      page:
        clean(item.page) ||
        "Emplacement non précisé",

      quote:
        clean(item.quote || item.texte),

      explanation:
        clean(item.explanation || item.explication)
    }))
    .filter((item) => item.quote);
}

/* AFFICHAGE DU RÉSULTAT */

function renderAnalysis(analysis) {
  setText("documentType", analysis.documentType);
  setText("plainSummary", analysis.summary);
  setText("documentRequest", analysis.request);
  setText("whyReceived", analysis.whyReceived);

  if (analysis.issuer) {
    setText("documentIssuer", `Organisme : ${analysis.issuer}`);
    $("documentIssuer")?.classList.remove("hidden");
  } else {
    $("documentIssuer")?.classList.add("hidden");
  }

  renderActions(analysis.actions);
  renderMainDate(analysis.dates);

  setText("mainAmount", analysis.amount.value);
  setText("mainAmountMeaning", analysis.amount.meaning);

  renderUrgency(analysis.urgency);
  renderConfidence(analysis.confidence);
  renderExplanation(analysis);
  renderEvidence(analysis.evidence);

  $("detailsSection")?.classList.add("hidden");
  $("evidenceSection")?.classList.add("hidden");
}

function setText(id, value) {
  const element = $(id);

  if (element) {
    element.textContent = value;
  }
}

function renderActions(actions) {
  const list = $("actionsList");

  if (!list) {
    return;
  }

  list.innerHTML = "";

  const values = actions.length
    ? actions
    : [{
        action: "Aucune action certaine n’a été identifiée.",
        how: ""
      }];

  values.forEach((action) => {
    const item = document.createElement("li");

    item.textContent = action.how
      ? `${action.action} — ${action.how}`
      : action.action;

    list.appendChild(item);
  });
}

function renderMainDate(dates) {
  if (!dates.length) {
    setText("mainDate", "Non trouvée");
    setText("mainDateMeaning", "Aucune échéance certaine.");
    return;
  }

  const mainDate =
    dates.find((item) =>
      /limite|échéance|paiement|réponse|avant/i.test(
        `${item.label} ${item.meaning}`
      )
    ) || dates[0];

  setText("mainDate", mainDate.date);
  setText(
    "mainDateMeaning",
    mainDate.meaning || mainDate.label
  );
}

function renderUrgency(urgency) {
  const titles = {
    none: "Rien d’urgent",
    soon: "À faire prochainement",
    urgent: "À traiter rapidement",
    uncertain: "À vérifier"
  };

  const icons = {
    none: "✓",
    soon: "!",
    urgent: "!",
    uncertain: "?"
  };

  const card = $("urgencyCard");

  if (card) {
    card.dataset.level = urgency.level;
  }

  setText("urgencyTitle", titles[urgency.level]);
  setText("urgencyIcon", icons[urgency.level]);
  setText("urgencyMessage", urgency.message);
}

function renderConfidence(confidence) {
  const badge = $("confidenceBadge");

  if (!badge) {
    return;
  }

  if (confidence >= 80) {
    badge.textContent =
      `Confiance élevée · ${confidence} %`;
  } else if (confidence >= 55) {
    badge.textContent =
      `Confiance moyenne · ${confidence} %`;
  } else {
    badge.textContent =
      `À vérifier · ${confidence} %`;
  }
}

function renderExplanation(analysis) {
  const text =
    analysis.fullExplanation ||
    [
      analysis.summary,
      "",
      `Pourquoi vous l’avez reçu : ${analysis.whyReceived}`,
      "",
      `Ce qui est demandé : ${analysis.request}`
    ].join("\n");

  setText("fullExplanation", text);
}

function renderEvidence(evidence) {
  const container = $("evidenceList");

  if (!container) {
    return;
  }

  container.innerHTML = "";

  if (!evidence.length) {
    const message = document.createElement("p");

    message.textContent =
      "Aucun passage suffisamment clair n’a été identifié.";

    container.appendChild(message);
    return;
  }

  evidence.forEach((proof) => {
    const article = document.createElement("article");
    article.className = "evidence-item";

    const page = document.createElement("strong");
    page.textContent = proof.page;

    const quote = document.createElement("blockquote");
    quote.textContent = `« ${proof.quote} »`;

    article.appendChild(page);
    article.appendChild(quote);

    if (proof.explanation) {
      const explanation = document.createElement("p");
      explanation.textContent = proof.explanation;
      article.appendChild(explanation);
    }

    container.appendChild(article);
  });
}

/* PROGRESSION */

function startProgress() {
  stopProgress();

  const stages = [
    [18, "Identification du document…", 0],
    [42, "Recherche de ce qu’on vous demande…", 1],
    [67, "Vérification des dates et montants…", 2],
    [86, "Recherche des passages importants…", 3]
  ];

  let index = 0;

  updateProgress(...stages[index]);

  state.progressTimer = setInterval(() => {
    index += 1;

    if (index >= stages.length) {
      stopProgress();
      return;
    }

    updateProgress(...stages[index]);
  }, 1100);
}

function updateProgress(progress, message, activeStep) {
  if ($("progressBar")) {
    $("progressBar").style.width = `${progress}%`;
  }

  setText("loadingMessage", message);

  document.querySelectorAll(".analysis-step").forEach(
    (step, index) => {
      step.classList.remove("active", "complete");

      const icon = step.querySelector(".step-icon");

      if (index < activeStep) {
        step.classList.add("complete");

        if (icon) {
          icon.textContent = "✓";
        }
      } else if (index === activeStep) {
        step.classList.add("active");

        if (icon) {
          icon.textContent = String(index + 1);
        }
      }
    }
  );
}

function finishProgress() {
  stopProgress();

  if ($("progressBar")) {
    $("progressBar").style.width = "100%";
  }

  setText("loadingMessage", "Analyse terminée.");

  document.querySelectorAll(".analysis-step").forEach(
    (step) => {
      step.classList.remove("active");
      step.classList.add("complete");

      const icon = step.querySelector(".step-icon");

      if (icon) {
        icon.textContent = "✓";
      }
    }
  );
}

function stopProgress() {
  if (state.progressTimer) {
    clearInterval(state.progressTimer);
    state.progressTimer = null;
  }
}

/* ERREURS ET RETOUR */

function showError(title, message) {
  stopProgress();

  setText("errorTitle", title);
  setText("errorMessage", message);

  showScreen("errorScreen");
}

function retryAnalysis() {
  if (state.selectedFile) {
    analyzeSelectedFile();
    return;
  }

  if (($("manualText")?.value.trim() || "").length >= 30) {
    analyzeManualText();
    return;
  }

  resetApplication();
}

function resetApplication() {
  state.selectedFile = null;
  state.lastFormData = null;
  state.lastAnalysis = null;

  if ($("cameraInput")) {
    $("cameraInput").value = "";
  }

  if ($("fileInput")) {
    $("fileInput").value = "";
  }

  if ($("manualText")) {
    $("manualText").value = "";
  }

  $("selectedFileCard")?.classList.add("hidden");
  $("detailsSection")?.classList.add("hidden");
  $("evidenceSection")?.classList.add("hidden");

  showScreen("homeScreen");
}

/* THÈME */

function initializeTheme() {
  const savedTheme =
    localStorage.getItem("expliqueMoiTheme");

  if (savedTheme === "dark") {
    document.body.classList.add("dark-theme");
  }

  updateThemeIcon();
}

function toggleTheme() {
  document.body.classList.toggle("dark-theme");

  localStorage.setItem(
    "expliqueMoiTheme",
    document.body.classList.contains("dark-theme")
      ? "dark"
      : "light"
  );

  updateThemeIcon();
}

function updateThemeIcon() {
  setText(
    "themeIcon",
    document.body.classList.contains("dark-theme")
      ? "☀"
      : "☾"
  );
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
