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

  if (/payload|too large
