const habitList = document.querySelector("#habit-list");
const habitForm = document.querySelector("#habit-form");
const habitInput = document.querySelector("#habit-name");
const habitMessage = document.querySelector("#habit-message");
let habits = [];
let suggestions = [];

const today = new Date();
document.querySelector("#today-label").textContent = new Intl.DateTimeFormat(
  undefined,
  { weekday: "long", month: "short", day: "numeric" },
).format(today);

async function api(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(url, {
    ...options,
    headers,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Something went wrong. Please try again.");
  }
  return response.status === 204 ? null : response.json();
}

function showError(element, message) {
  element.textContent = message;
}

function renderHabits() {
  habitList.replaceChildren();
  document.querySelector("#empty-state").hidden = habits.length > 0;
  document.querySelector("#habit-count").textContent =
    `${habits.length} ${habits.length === 1 ? "habit" : "habits"}`;

  const completed = habits.filter((habit) => habit.completedToday).length;
  document.querySelector("#progress-value").innerHTML =
    `${completed} <span>/ ${habits.length}</span>`;
  const progress = habits.length ? (completed / habits.length) * 100 : 0;
  const progressTrack = document.querySelector(".progress-track");
  progressTrack.setAttribute("aria-valuenow", String(Math.round(progress)));
  document.querySelector("#progress-bar").style.width = `${progress}%`;
  const streak = Math.max(0, ...habits.map((habit) => habit.streak));
  document.querySelector("#streak-value").innerHTML =
    `${streak} <span>${streak === 1 ? "day" : "days"}</span>`;
  const weeklyCheckins = habits.reduce(
    (sum, habit) => sum + habit.completedThisWeek,
    0,
  );
  document.querySelector("#week-value").innerHTML =
    `${weeklyCheckins} <span>${weeklyCheckins === 1 ? "check-in" : "check-ins"}</span>`;

  for (const habit of habits) {
    const row = document.createElement("article");
    row.className = `habit-row${habit.completedToday ? " is-complete" : ""}`;

    const toggle = document.createElement("button");
    toggle.className = "habit-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-label", `${habit.completedToday ? "Unmark" : "Complete"} ${habit.name}`);
    toggle.setAttribute("aria-pressed", String(habit.completedToday));
    toggle.textContent = habit.completedToday ? "✓" : "";
    toggle.addEventListener("click", () => toggleHabit(habit.id));

    const details = document.createElement("div");
    details.className = "habit-details";
    const name = document.createElement("strong");
    name.textContent = habit.name;
    const meta = document.createElement("span");
    meta.textContent = habit.streak ? `🔥 ${habit.streak} day streak` : "Start your streak today";
    details.append(name, meta);

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.type = "button";
    deleteButton.setAttribute("aria-label", `Delete ${habit.name}`);
    deleteButton.textContent = "×";
    deleteButton.addEventListener("click", () => deleteHabit(habit.id));

    row.append(toggle, details, deleteButton);
    habitList.append(row);
  }
}

async function loadHabits() {
  try {
    habits = await api("/api/habits");
    renderHabits();
  } catch (error) {
    showError(habitMessage, error.message);
  }
}

async function toggleHabit(id) {
  try {
    await api(`/api/habits/${id}/toggle`, { method: "POST" });
    await loadHabits();
  } catch (error) {
    showError(habitMessage, error.message);
  }
}

async function deleteHabit(id) {
  try {
    await api(`/api/habits/${id}`, { method: "DELETE" });
    await loadHabits();
  } catch (error) {
    showError(habitMessage, error.message);
  }
}

habitForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  habitMessage.textContent = "";
  try {
    await api("/api/habits", {
      method: "POST",
      body: JSON.stringify({ name: habitInput.value }),
    });
    habitInput.value = "";
    await loadHabits();
    habitInput.focus();
  } catch (error) {
    showError(habitMessage, error.message);
  }
});

document.querySelector("#goal-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  const errorElement = document.querySelector("#plan-error");
  const result = document.querySelector("#plan-result");
  errorElement.textContent = "";
  button.disabled = true;
  button.textContent = "…";
  try {
    const data = await api("/api/ai/plan", {
      method: "POST",
      body: JSON.stringify({ goal: document.querySelector("#goal-input").value }),
    });
    suggestions = data.habits;
    renderSuggestions();
    result.hidden = false;
  } catch (error) {
    showError(errorElement, error.message);
  } finally {
    button.disabled = false;
    button.textContent = "→";
  }
});

function renderSuggestions() {
  const list = document.querySelector("#suggestion-list");
  list.replaceChildren();
  suggestions.forEach((suggestion, index) => {
    const label = document.createElement("label");
    label.className = "suggestion";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.dataset.index = String(index);
    const text = document.createElement("span");
    text.textContent = suggestion;
    label.append(checkbox, text);
    list.append(label);
  });
}

document.querySelector("#dismiss-plan").addEventListener("click", () => {
  document.querySelector("#plan-result").hidden = true;
});

document.querySelector("#add-suggestions").addEventListener("click", async (event) => {
  const selected = [...document.querySelectorAll("#suggestion-list input:checked")]
    .map((checkbox) => suggestions[Number(checkbox.dataset.index)]);
  const button = event.currentTarget;
  const errorElement = document.querySelector("#plan-error");
  errorElement.textContent = "";
  if (!selected.length) {
    showError(errorElement, "Select at least one habit to add.");
    return;
  }
  button.disabled = true;
  try {
    await api("/api/habits/bulk", {
      method: "POST",
      body: JSON.stringify({ names: selected }),
    });
    document.querySelector("#plan-result").hidden = true;
    document.querySelector("#goal-input").value = "";
    await loadHabits();
  } catch (error) {
    showError(errorElement, error.message);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#coach-button").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const errorElement = document.querySelector("#coach-error");
  errorElement.textContent = "";
  button.disabled = true;
  button.classList.add("is-loading");
  try {
    const data = await api("/api/ai/coach", { method: "POST" });
    document.querySelector("#coach-text").textContent = data.coaching;
    document.querySelector("#coach-response").hidden = false;
  } catch (error) {
    showError(errorElement, error.message);
  } finally {
    button.disabled = false;
    button.classList.remove("is-loading");
  }
});

const imageInput = document.querySelector("#habit-image");
let imagePreviewUrl;
imageInput.addEventListener("change", () => {
  const preview = document.querySelector("#image-preview");
  const previewWrap = document.querySelector("#image-preview-wrap");
  if (imagePreviewUrl) {
    URL.revokeObjectURL(imagePreviewUrl);
    imagePreviewUrl = undefined;
  }
  const [file] = imageInput.files;
  if (!file) {
    previewWrap.hidden = true;
    preview.removeAttribute("src");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    showError(document.querySelector("#image-error"), "Images must be 5 MB or smaller.");
    imageInput.value = "";
    previewWrap.hidden = true;
    return;
  }
  document.querySelector("#image-error").textContent = "";
  imagePreviewUrl = URL.createObjectURL(file);
  preview.src = imagePreviewUrl;
  previewWrap.hidden = false;
  document.querySelector("#image-insight").hidden = true;
});

document.querySelector("#image-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#analyze-image");
  const errorElement = document.querySelector("#image-error");
  const file = imageInput.files[0];
  errorElement.textContent = "";
  if (!file) {
    showError(errorElement, "Choose an image to analyze.");
    return;
  }
  button.disabled = true;
  button.textContent = "Looking closely…";
  try {
    const formData = new FormData();
    formData.append("image", file);
    formData.append("context", document.querySelector("#image-context").value);
    const insight = await api("/api/ai/image-insight", {
      method: "POST",
      body: formData,
    });
    document.querySelector("#insight-summary").textContent = insight.image_summary;
    document.querySelector("#insight-habit").textContent = insight.possible_habit;
    document.querySelector("#insight-importance").textContent = insight.why_it_matters;
    document.querySelector("#insight-step").textContent = insight.tiny_first_step;
    document.querySelector("#image-insight").hidden = false;
  } catch (error) {
    showError(errorElement, error.message);
  } finally {
    button.disabled = false;
    button.textContent = "✦ Understand this habit";
  }
});

loadHabits();
