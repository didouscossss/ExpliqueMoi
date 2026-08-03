const $ = (id) => document.getElementById(id);

const state = {
  selectedFile: null,
  lastAnalysis: null,
  progressTimer: null,
  currentProgress: 0
};

const MAX_STANDARD_FILE_SIZE = 4 * 1024 * 1024;
const MAX_DISPLAYED_FILE_SIZE = 50 * 1024 * 1024;

document.addEventListener("DOMContentLoaded", initializeApp);

function initializeApp() {
  initializeTheme();
  initializeEvents();
  showScreen("homeScreen");
}

function initializeEvents() {
  $("cameraInput").addEventListener("change", handleFileSelection);
  $("fileInput").addEventListener("change", handleFileSelection);

  $("removeFileButton").addEventListener("click", removeSelectedFile);
  $("analyzeButton").addEventListener("click", analyzeSelectedFile);
  $("analyzeTextButton").addEventListener("click", analyzeManualText);

  $("newAnalysisButton").addEventListener("click", resetApplication);
  $("retryButton").addEventListener("click", retryAnalysis);
  $("errorNewDocumentButton").addEventListener("click", resetApplication);

  $("detailsButton").addEventListener("click", showDetails);
  $("closeDetailsButton").addEventListener("click", hideDetails);

  $("evidenceButton").addEventListener("click", showEvidence);
  $("closeEvidenceButton").addEventListener("click", hideEvidence);

  $("themeButton").addEventListener("click", toggleTheme);
}

/* =========================================================
   Navigation entre les écrans
========================================================= */

function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.remove("active");
  });

  const target = $(screenId);

  if (target) {
    target.classList.add("active");
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* =========================================================
   Sélection du fichier
========================================================= */

function handleFileSelection(event) {
  const file = event.target.files?.[0];

  if (!file) {
    return;
  }

  if (!isSupportedFile(file)) {
    showError(
      "Format non compatible",
      "Utilisez un fichier PDF, JPG, PNG ou WebP."
    );

    event.target.value = "";
    return;
  }

  if (file.size > MAX_DISPLAYED_FILE_SIZE) {
    showError(
      "Fichier trop volumineux",
      "Le fichier dépasse la limite maximale de 50 Mo."
    );

    event.target.value = "";
    return;
  }

  state.selectedFile = file;

  updateSelectedFileCard(file);
}

function isSupportedFile(file) {
  const supportedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  return supportedTypes.includes(file.type);
}

function updateSelectedFileCard(file) {
  $("fileName").textContent = file.name;

  $("fileDetails").textContent =
    `${getReadableFileType(file)} · ${formatFileSize(file.size)}`;

  $("fileTypeIcon").textContent =
    file.type === "application/pdf" ? "PDF" : "IMG";

  $("selectedFileCard").classList.remove("hidden");
}

function getReadableFileType(file) {
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

  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function removeSelectedFile() {
  state.selectedFile = null;

  $("cameraInput").value = "";
  $("fileInput").value = "";

  $("selectedFileCard").classList.add("hidden");
}

/* =========================================================
   Analyse d’un fichier
========================================================= */

async function analyzeSelectedFile() {
  if (!state.selectedFile) {
    showError(
      "Aucun document sélectionné",
      "Prenez une photo ou choisissez un fichier avant de lancer l’analyse."
    );

    return;
  }

  /*
   * L’envoi direct actuel vers une fonction Vercel reste limité.
   * L’upload jusqu’à 50 Mo sera ajouté dans l’étape suivante.
   */
  if (state.selectedFile.size > MAX_STANDARD_FILE_SIZE) {
    showError(
      "Upload lourd pas encore activé",
      `Ce document fait ${formatFileSize(state.selectedFile.size)}. ` +
      "La version actuelle accepte environ 4 Mo. " +
      "Le prochain fichier activera l’envoi jusqu’à 50 Mo."
    );

    return;
  }

  const formData = new FormData();
  formData.append("file", state.selectedFile);

  await sendAnalysisRequest(formData);
}

/* =========================================================
   Analyse d’un texte collé
========================================================= */

async function analyzeManualText() {
  const text = $("manualText").value.trim();

  if (text.length < 30) {
    showError(
      "Texte trop court",
      "Collez au moins quelques phrases du document."
    );

    return;
  }

  const formData = new FormData();
  formData.append("text", text);

  await sendAnalysisRequest(formData);
}

/* =========================================================
   Requête vers l’API
========================================================= */

async function sendAnalysisRequest(formData) {
  showScreen("loadingScreen");
  startProgressAnimation();

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
        data?.error ||
        "L’intelligence artificielle n’a pas pu analyser ce document."
      );
    }

    state.lastAnalysis = normalizeAnalysis(data);

    finishProgressAnimation();

    await wait(450);

    renderAnalysis(state.lastAnalysis);
    showScreen("resultScreen");
  } catch (error) {
    stopProgressAnimation();

    showError(
      "Impossible d’analyser ce document",
      getFriendlyErrorMessage(error)
    );
  }
}

function getFriendlyErrorMessage(error) {
  const message = String(error?.message || "");

  if (/failed to fetch|network|connexion/i.test(message)) {
    return (
      "Impossible de contacter le serveur. " +
      "Vérifiez votre connexion Internet puis réessayez."
    );
  }

  if (/payload|too large|413|volumineux/i.test(message)) {
    return (
      "Ce document est trop volumineux pour le mode d’envoi actuel."
    );
  }

  if (/quota|429|resource exhausted/i.test(message)) {
    return (
      "Le quota temporaire de l’intelligence artificielle est atteint. " +
      "Réessayez dans quelques minutes."
    );
  }

  if (/api key|clé|unauthorized|permission/i.test(message)) {
    return (
      "La connexion à l’intelligence artificielle n’est pas correctement configurée."
    );
  }

  return message || "Une erreur inattendue est survenue.";
}

/* =========================================================
   Normalisation de la réponse Gemini
========================================================= */

function normalizeAnalysis(data) {
  const urgency = data?.urgency || {};
  const amount = data?.amount || {};

  return {
    documentType:
      cleanText(data?.document_type) ||
      "Document non identifié avec certitude",

    issuer:
      cleanText(data?.issuer || data?.organisme || ""),

    summary:
      cleanText(data?.plain_summary) ||
      "Je n’ai pas pu produire une explication suffisamment précise.",

    request:
      cleanText(data?.request) ||
      "Aucune demande certaine n’a été identifiée.",

    whyReceived:
      cleanText(data?.why_received) ||
      "La raison n’est pas clairement indiquée dans le document.",

    urgency: {
      level: normalizeUrgencyLevel(urgency.level),
      message:
        cleanText(urgency.message) ||
        "Le niveau d’attention n’a pas été déterminé."
    },

    actions:
      normalizeActions(data?.actions),

    dates:
      normalizeDates(data?.dates),

    amount: {
      value:
        cleanText(amount.value) ||
        "Non trouvé avec certitude",

      meaning:
        cleanText(amount.meaning) ||
        "Aucun montant principal clairement identifié."
    },

    evidence:
      normalizeEvidence(data?.evidence),

    confidence:
      normalizeConfidence(data?.confidence),

    fullExplanation:
      cleanText(
        data?.full_explanation ||
        data?.explication_complete ||
        ""
      )
  };
}

function cleanText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrgencyLevel(level) {
  const acceptedLevels = [
    "none",
    "soon",
    "urgent",
    "uncertain"
  ];

  return acceptedLevels.includes(level)
    ? level
    : "uncertain";
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
          action: cleanText(item),
          how: ""
        };
      }

      return {
        action:
          cleanText(item?.action) ||
          "Action à vérifier",

        how:
          cleanText(item?.how)
      };
    })
    .filter((item) => item.action);
}

function normalizeDates(dates) {
  if (!Array.isArray(dates)) {
    return [];
  }

  return dates
    .map((item) => ({
      date:
        cleanText(item?.date),

      label:
        cleanText(item?.label) ||
        "Date mentionnée",

      meaning:
        cleanText(item?.meaning) ||
        cleanText(item?.explication)
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
        cleanText(item?.page) ||
        "Emplacement non précisé",

      quote:
        cleanText(item?.quote || item?.texte),

      explanation:
        cleanText(
          item?.explanation ||
          item?.explication
        )
    }))
    .filter((item) => item.quote);
}

function normalizeConfidence(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(100, Math.round(number))
  );
}

/* =========================================================
   Affichage des résultats
========================================================= */

function renderAnalysis(analysis) {
  $("documentType").textContent =
    analysis.documentType;

  if (analysis.issuer) {
    $("documentIssuer").textContent =
      `Organisme : ${analysis.issuer}`;

    $("documentIssuer").classList.remove("hidden");
  } else {
    $("documentIssuer").textContent = "";
    $("documentIssuer").classList.add("hidden");
  }

  $("plainSummary").textContent =
    analysis.summary;

  $("documentRequest").textContent =
    analysis.request;

  renderActions(analysis.actions);
  renderMainDate(analysis.dates);

  $("mainAmount").textContent =
    analysis.amount.value;

  $("mainAmountMeaning").textContent =
    analysis.amount.meaning;

  renderUrgency(analysis.urgency);

  $("whyReceived").textContent =
    analysis.whyReceived;

  renderConfidence(analysis.confidence);
  renderFullExplanation(analysis);
  renderEvidence(analysis.evidence);

  hideDetails();
  hideEvidence();
}

function renderActions(actions) {
  const list = $("actionsList");
  list.innerHTML = "";

  if (!actions.length) {
    const item = document.createElement("li");

    item.textContent =
      "Aucune action certaine n’a été identifiée.";

    list.appendChild(item);
    return;
  }

  actions.forEach((action) => {
    const item = document.createElement("li");

    item.textContent = action.how
      ? `${action.action} — ${action.how}`
      : action.action;

    list.appendChild(item);
  });
}

function renderMainDate(dates) {
  if (!dates.length) {
    $("mainDate").textContent =
      "Non trouvée";

    $("mainDateMeaning").textContent =
      "Aucune échéance certaine.";
    return;
  }

  const mainDate =
    dates.find((item) =>
      /limite|échéance|paiement|réponse|avant/i.test(
        `${item.label} ${item.meaning}`
      )
    ) || dates[0];

  $("mainDate").textContent =
    mainDate.date;

  $("mainDateMeaning").textContent =
    mainDate.meaning ||
    mainDate.label;
}

function renderUrgency(urgency) {
  const card = $("urgencyCard");

  card.dataset.level = urgency.level;

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

  $("urgencyTitle").textContent =
    titles[urgency.level];

  $("urgencyIcon").textContent =
    icons[urgency.level];

  $("urgencyMessage").textContent =
    urgency.message;
}

function renderConfidence(confidence) {
  const badge = $("confidenceBadge");

  badge.classList.remove(
    "confidence-medium",
    "confidence-low"
  );

  if (confidence >= 80) {
    badge.textContent =
      `Confiance élevée · ${confidence} %`;

    return;
  }

  if (confidence >= 55) {
    badge.textContent =
      `Confiance moyenne · ${confidence} %`;

    badge.classList.add("confidence-medium");
    return;
  }

  badge.textContent =
    `À vérifier · ${confidence} %`;

  badge.classList.add("confidence-low");
}

function renderFullExplanation(analysis) {
  let explanation =
    analysis.fullExplanation;

  if (!explanation) {
    explanation = [
      analysis.summary,
      "",
      `Pourquoi vous l’avez reçu : ${analysis.whyReceived}`,
      "",
      `Ce que le document demande : ${analysis.request}`
    ].join("\n");
  }

  $("fullExplanation").textContent =
    explanation;
}

function renderEvidence(evidence) {
  const container = $("evidenceList");
  container.innerHTML = "";

  if (!evidence.length) {
    const empty = document.createElement("p");

    empty.textContent =
      "Aucun passage suffisamment clair n’a été identifié.";

    container.appendChild(empty);
    return;
  }

  evidence.forEach((proof) => {
    const item = document.createElement("article");
    item.className = "evidence-item";

    const location = document.createElement("strong");
    location.textContent = proof.page;

    const quote = document.createElement("blockquote");
    quote.textContent = `« ${proof.quote} »`;

    item.appendChild(location);
    item.appendChild(quote);

    if (proof.explanation) {
      const explanation = document.createElement("p");
      explanation.textContent = proof.explanation;
      item.appendChild(explanation);
    }

    container.appendChild(item);
  });
}

/* =========================================================
   Sections dépliables
========================================================= */

function showDetails() {
  $("detailsSection").classList.remove("hidden");

  $("detailsSection").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function hideDetails() {
  $("detailsSection").classList.add("hidden");
}

function showEvidence() {
  $("evidenceSection").classList.remove("hidden");

  $("evidenceSection").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function hideEvidence() {
  $("evidenceSection").classList.add("hidden");
}

/* =========================================================
   Progression visuelle
========================================================= */

function startProgressAnimation() {
  stopProgressAnimation();

  state.currentProgress = 8;

  updateProgress(
    8,
    "Identification du document…",
    0
  );

  const progressSequence = [
    {
      progress: 28,
      message: "Identification du document…",
      step: 0
    },
    {
      progress: 48,
      message: "Recherche de ce qu’on vous demande…",
      step: 1
    },
    {
      progress: 68,
      message: "Vérification des dates et montants…",
      step: 2
    },
    {
      progress: 84,
      message: "Recherche des passages importants…",
      step: 3
    }
  ];

  let index = 0;

  state.progressTimer = setInterval(() => {
    if (index >= progressSequence.length) {
      clearInterval(state.progressTimer);
      state.progressTimer = null;
      return;
    }

    const item = progressSequence[index];

    updateProgress(
      item.progress,
      item.message,
      item.step
    );

    index += 1;
  }, 1050);
}

function updateProgress(progress, message, activeStep) {
  state.currentProgress = progress;

  $("progressBar").style.width =
    `${progress}%`;

  $("loadingMessage").textContent =
    message;

  const steps =
    [...document.querySelectorAll(".analysis-step")];

  steps.forEach((step, index) => {
    step.classList.remove("active", "complete");

    if (index < activeStep) {
      step.classList.add("complete");

      const icon = step.querySelector(".step-icon");

      if (icon) {
        icon.textContent = "✓";
      }

      return;
    }

    if (index === activeStep) {
      step.classList.add("active");

      const icon = step.querySelector(".step-icon");

      if (icon) {
        icon.textContent = String(index + 1);
      }

      return;
    }

    const icon = step.querySelector(".step-icon");

    if (icon) {
      icon.textContent = String(index + 1);
    }
  });
}

function finishProgressAnimation() {
  stopProgressAnimation();

  $("progressBar").style.width = "100%";

  $("loadingMessage").textContent =
    "Analyse terminée.";

  document
    .querySelectorAll(".analysis-step")
    .forEach((step) => {
      step.classList.remove("active");
      step.classList.add("complete");

      const icon = step.querySelector(".step-icon");

      if (icon) {
        icon.textContent = "✓";
      }
    });
}

function stopProgressAnimation() {
  if (state.progressTimer) {
    clearInterval(state.progressTimer);
    state.progressTimer = null;
  }
}

/* =========================================================
   Erreurs et réinitialisation
========================================================= */

function showError(title, message) {
  stopProgressAnimation();

  $("errorTitle").textContent = title;
  $("errorMessage").textContent = message;

  showScreen("errorScreen");
}

function retryAnalysis() {
  if (state.selectedFile) {
    analyzeSelectedFile();
    return;
  }

  const text = $("manualText").value.trim();

  if (text.length >= 30) {
    analyzeManualText();
    return;
  }

  resetApplication();
}

function resetApplication() {
  stopProgressAnimation();

  state.selectedFile = null;
  state.lastAnalysis = null;
  state.currentProgress = 0;

  $("cameraInput").value = "";
  $("fileInput").value = "";
  $("manualText").value = "";

  $("selectedFileCard").classList.add("hidden");

  hideDetails();
  hideEvidence();

  resetProgressDisplay();

  showScreen("homeScreen");
}

function resetProgressDisplay() {
  $("progressBar").style.width = "8%";

  $("loadingMessage").textContent =
    "Identification du document…";

  document
    .querySelectorAll(".analysis-step")
    .forEach((step, index) => {
      step.classList.remove("complete", "active");

      if (index === 0) {
        step.classList.add("active");
      }

      const icon = step.querySelector(".step-icon");

      if (icon) {
        icon.textContent = String(index + 1);
      }
    });
}

/* =========================================================
   Thème sombre
========================================================= */

function initializeTheme() {
  const savedTheme =
    localStorage.getItem("expliqueMoiTheme");

  const systemPrefersDark =
    window.matchMedia?.(
      "(prefers-color-scheme: dark)"
    ).matches;

  if (
    savedTheme === "dark" ||
    (!savedTheme && systemPrefersDark)
  ) {
    document.body.classList.add("dark-theme");
  }

  updateThemeIcon();
}

function toggleTheme() {
  document.body.classList.toggle("dark-theme");

  const theme =
    document.body.classList.contains("dark-theme")
      ? "dark"
      : "light";

  localStorage.setItem(
    "expliqueMoiTheme",
    theme
  );

  updateThemeIcon();
}

function updateThemeIcon() {
  const isDark =
    document.body.classList.contains("dark-theme");

  $("themeIcon").textContent =
    isDark ? "☀" : "☾";
}

/* =========================================================
   Utilitaire
========================================================= */

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
