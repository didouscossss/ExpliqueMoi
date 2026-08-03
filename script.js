const $ = (id) => document.getElementById(id);

let selectedFile = null;

$("camera").addEventListener("change", (event) => {
  selectedFile = event.target.files[0] || null;
  showSelectedFile();
});

$("file").addEventListener("change", (event) => {
  selectedFile = event.target.files[0] || null;
  showSelectedFile();
});

$("analyse").addEventListener("click", analyseDocument);
$("ask").addEventListener("click", answerSimpleQuestion);

function showSelectedFile() {
  if (!selectedFile) return;

  $("text").value =
    `Document sélectionné : ${selectedFile.name}\n\n` +
    "Appuie sur « Analyser le document ».";
}

async function analyseDocument() {
  const pastedText = $("text").value.trim();

  if (!selectedFile && pastedText.length < 20) {
    alert("Ajoute un document ou colle son texte.");
    return;
  }

  setLoading(true);

  try {
    const formData = new FormData();

    if (selectedFile) {
      formData.append("file", selectedFile);
    }

    if (!selectedFile || !pastedText.startsWith("Document sélectionné :")) {
      formData.append("text", pastedText);
    }

    const response = await fetch("/api/analyze", {
      method: "POST",
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "L’analyse a échoué.");
    }

    displayResult(data);
  } catch (error) {
    alert(error.message);
  } finally {
    setLoading(false);
  }
}

function displayResult(data) {
  window.currentAnalysis = data;

  $("resultats").classList.remove("hidden");

  $("type").textContent =
    data.document_type || "Document non identifié";

  $("stress").textContent =
    data.urgency?.message || "Niveau d’urgence non déterminé";

  $("stress").className = "";

  const urgencyLevel = data.urgency?.level;

  if (urgencyLevel === "urgent") {
    $("stress").classList.add("red");
  } else if (urgencyLevel === "soon") {
    $("stress").classList.add("orange");
  } else {
    $("stress").classList.add("green");
  }

  fillList(
    "todo",
    data.actions?.length
      ? data.actions.map((action) => {
          const detail = action.how ? ` — ${action.how}` : "";
          return `${action.action}${detail}`;
        })
      : ["Aucune action certaine n’a été identifiée."]
  );

  fillList(
    "dates",
    data.dates?.length
      ? data.dates.map((item) =>
          `${item.label} : ${item.date}` +
          (item.meaning ? ` — ${item.meaning}` : "")
        )
      : ["Aucune date importante clairement identifiée."]
  );

  $("why").textContent =
    data.why_received || "La raison n’est pas clairement indiquée.";

  $("proofs").innerHTML = "";

  const proofs = data.evidence || [];

  if (!proofs.length) {
    $("proofs").innerHTML =
      "<p>Aucun passage suffisamment clair n’a été trouvé.</p>";
  } else {
    proofs.forEach((proof) => {
      const block = document.createElement("div");
      block.className = "proof";

      const page = proof.page
        ? `<strong>${escapeHtml(proof.page)}</strong><br>`
        : "";

      block.innerHTML = `
        ${page}
        « ${escapeHtml(proof.quote || "")} »
        <br><br>
        <em>${escapeHtml(proof.explanation || "")}</em>
      `;

      $("proofs").appendChild(block);
    });
  }

  $("answer").style.display = "none";

  $("resultats").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function fillList(id, values) {
  const element = $(id);
  element.innerHTML = "";

  values.forEach((value) => {
    const li = document.createElement("li");
    li.textContent = value;
    element.appendChild(li);
  });
}

function answerSimpleQuestion() {
  const data = window.currentAnalysis;
  const question = $("question").value.trim().toLowerCase();

  if (!data) {
    alert("Analyse d’abord un document.");
    return;
  }

  let answer =
    "Cette question nécessite une future fonction de conversation avec l’IA.";

  if (/quoi|document|c'est quoi/.test(question)) {
    answer = `${data.document_type}. ${data.plain_summary}`;
  } else if (/faire|dois|action/.test(question)) {
    answer = data.actions?.length
      ? data.actions
          .map((item) =>
            `${item.action}${item.how ? ` : ${item.how}` : ""}`
          )
          .join(" ")
      : "Aucune action certaine n’a été identifiée.";
  } else if (/quand|date|délai|avant/.test(question)) {
    answer = data.dates?.length
      ? data.dates
          .map((item) => `${item.label} : ${item.date}.`)
          .join(" ")
      : "Aucune date importante n’a été clairement identifiée.";
  } else if (/urgent|grave|inquiéter/.test(question)) {
    answer =
      data.urgency?.message ||
      "Le niveau d’urgence n’a pas été déterminé.";
  }

  $("answer").textContent = answer;
  $("answer").style.display = "block";
}

function setLoading(active) {
  $("analyse").disabled = active;
  $("analyse").textContent = active
    ? "Analyse par l’IA en cours…"
    : "Analyser le document";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}
