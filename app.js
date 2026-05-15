const STORAGE_KEY = "timecard-tracker-v1";

const state = loadState();

const statusText = document.querySelector("#statusText");
const statusSubtext = document.querySelector("#statusSubtext");
const todayHours = document.querySelector("#todayHours");
const todayRange = document.querySelector("#todayRange");
const weekHours = document.querySelector("#weekHours");
const weekRange = document.querySelector("#weekRange");
const activeSessionText = document.querySelector("#activeSessionText");
const sessionList = document.querySelector("#sessionList");
const weeklyTotalsList = document.querySelector("#weeklyTotalsList");
const sessionRowTemplate = document.querySelector("#sessionRowTemplate");
const clockInBtn = document.querySelector("#clockInBtn");
const clockOutBtn = document.querySelector("#clockOutBtn");
const exportBtn = document.querySelector("#exportBtn");
const importInput = document.querySelector("#importInput");
const installBtn = document.querySelector("#installBtn");
const checkUpdatesBtn = document.querySelector("#checkUpdatesBtn");
const installHelp = document.querySelector("#installHelp");
const updateBanner = document.querySelector("#updateBanner");
const refreshAppBtn = document.querySelector("#refreshAppBtn");
const manualEntryForm = document.querySelector("#manualEntryForm");
const entryDate = document.querySelector("#entryDate");
const entryStart = document.querySelector("#entryStart");
const entryEnd = document.querySelector("#entryEnd");
const entryNotes = document.querySelector("#entryNotes");
const entryWorkTypeInputs = document.querySelectorAll('input[name="entryWorkType"]');
let deferredInstallPrompt = null;
let waitingServiceWorker = null;
let serviceWorkerRegistration = null;
const editState = new Map();

entryDate.value = formatDateInput(new Date());

clockInBtn.addEventListener("click", handleClockIn);
clockOutBtn.addEventListener("click", handleClockOut);
exportBtn.addEventListener("click", handleExport);
importInput.addEventListener("change", handleImport);
manualEntryForm.addEventListener("submit", handleManualEntry);
installBtn.addEventListener("click", handleInstall);
checkUpdatesBtn.addEventListener("click", handleCheckForUpdates);
refreshAppBtn.addEventListener("click", handleAppRefresh);

render();
window.setInterval(render, 30000);

if ("serviceWorker" in navigator) {
  let refreshing = false;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").then((registration) => {
      serviceWorkerRegistration = registration;
      if (registration.waiting) {
        showUpdateReady(registration.waiting);
      }

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) {
          return;
        }

        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateReady(newWorker);
          }
        });
      });
    }).catch(() => {});
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) {
      return;
    }

    refreshing = true;
    window.location.reload();
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installBtn.hidden = false;
  installHelp.textContent = "Tap Install App to add it to your home screen.";
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  installBtn.hidden = true;
  installHelp.textContent = "Installed. You can launch Timecard from your home screen.";
});

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { sessions: [] };
    }

    const parsed = JSON.parse(raw);
    return {
      sessions: Array.isArray(parsed.sessions)
        ? parsed.sessions.map(normalizeSession).filter(Boolean)
        : [],
    };
  } catch {
    return { sessions: [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function handleClockIn() {
  if (getActiveSession()) {
    window.alert("You already have an active clock-in.");
    return;
  }

  state.sessions.push({
    id: crypto.randomUUID(),
    start: new Date().toISOString(),
    end: null,
    notes: "",
    workType: "Main Job",
  });
  saveState();
  render();
}

function handleClockOut() {
  const activeSession = getActiveSession();
  if (!activeSession) {
    window.alert("There is no active clock-in to close.");
    return;
  }

  activeSession.end = new Date().toISOString();
  saveState();
  render();
}

function handleManualEntry(event) {
  event.preventDefault();

  const dateValue = entryDate.value;
  const startValue = entryStart.value;
  const endValue = entryEnd.value;

  if (!dateValue || !startValue || !endValue) {
    return;
  }

  const start = new Date(`${dateValue}T${startValue}`);
  let end = new Date(`${dateValue}T${endValue}`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    window.alert("Please enter a valid date and time.");
    return;
  }

  if (end <= start) {
    end.setDate(end.getDate() + 1);
  }

  state.sessions.push({
    id: crypto.randomUUID(),
    start: start.toISOString(),
    end: end.toISOString(),
    notes: entryNotes.value.trim(),
    workType: getSelectedEntryWorkType(),
  });

  state.sessions.sort((a, b) => new Date(b.start) - new Date(a.start));
  saveState();
  manualEntryForm.reset();
  entryDate.value = formatDateInput(new Date());
  setEntryWorkType("Main Job");
  render();
}

function handleExport() {
  const payload = {
    exportedAt: new Date().toISOString(),
    sessions: sortedSessions(),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `timecard-export-${formatFileDate(new Date())}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function handleImport(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const incomingSessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
      const normalizedSessions = incomingSessions
        .filter((session) => session && session.start)
        .map(normalizeSession)
        .filter(Boolean);

      state.sessions = normalizedSessions.sort((a, b) => new Date(b.start) - new Date(a.start));
      saveState();
      render();
      window.alert("Import complete.");
    } catch {
      window.alert("That file could not be imported.");
    } finally {
      importInput.value = "";
    }
  };

  reader.readAsText(file);
}

async function handleInstall() {
  if (!deferredInstallPrompt) {
    installHelp.textContent = "If your phone does not show an install button, use Share or browser menu, then Add to Home Screen.";
    return;
  }

  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  if (choice.outcome === "accepted") {
    installBtn.hidden = true;
  }
  deferredInstallPrompt = null;
}

async function handleCheckForUpdates() {
  if (!("serviceWorker" in navigator) || !serviceWorkerRegistration) {
    installHelp.textContent = "Update checking is not available in this browser yet.";
    return;
  }

  checkUpdatesBtn.disabled = true;
  checkUpdatesBtn.textContent = "Checking...";
  installHelp.textContent = "Checking for a newer version now.";

  try {
    const previousWaiting = serviceWorkerRegistration.waiting;
    await serviceWorkerRegistration.update();

    if (serviceWorkerRegistration.waiting && serviceWorkerRegistration.waiting !== previousWaiting) {
      showUpdateReady(serviceWorkerRegistration.waiting);
      installHelp.textContent = "New version found. Tap Refresh App.";
    } else if (waitingServiceWorker) {
      installHelp.textContent = "New version found. Tap Refresh App.";
    } else {
      installHelp.textContent = "You already have the newest version.";
    }
  } catch {
    installHelp.textContent = "Update check failed. Try again in a moment.";
  } finally {
    checkUpdatesBtn.disabled = false;
    checkUpdatesBtn.textContent = "Check for Updates";
  }
}

function handleAppRefresh() {
  if (waitingServiceWorker) {
    waitingServiceWorker.postMessage({ type: "SKIP_WAITING" });
    return;
  }

  window.location.reload();
}

function render() {
  const now = new Date();
  const activeSession = getActiveSession();
  const sessionRecords = sortedSessions();
  const todayStart = startOfDay(now);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const weekStart = startOfWeek(now);
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);
  const todaySessions = sessionRecords.filter((session) => overlapsRange(session, todayStart, tomorrowStart, now));
  const todayMs = totalDurationInRange(sessionRecords, todayStart, tomorrowStart, now);
  const weekMs = totalDurationInRange(sessionRecords, weekStart, nextWeekStart, now);

  if (activeSession) {
    const started = new Date(activeSession.start);
    statusText.textContent = "Clocked in";
    statusSubtext.textContent = `Started ${formatTime(started)}`;
    activeSessionText.textContent = `Active since ${formatDateTime(started)}. Running total updates automatically.`;
  } else {
    statusText.textContent = "Off the clock";
    statusSubtext.textContent = "No active session";
    activeSessionText.textContent = "You are currently off the clock.";
  }

  todayHours.textContent = formatDuration(todayMs);
  weekHours.textContent = formatDuration(weekMs);
  todayRange.textContent = todaySessions.length
    ? `${todaySessions.length} session${todaySessions.length === 1 ? "" : "s"} today`
    : "No sessions yet";
  weekRange.textContent = `${weekLabel(now)} total`;

  renderWeeklyTotals(sessionRecords, now);
  renderSessionList(sessionRecords, now);
}

function showUpdateReady(serviceWorker) {
  waitingServiceWorker = serviceWorker;
  updateBanner.hidden = false;
  installHelp.textContent = "New version found. Tap Refresh App.";
}

function renderSessionList(sessionRecords, now) {
  sessionList.innerHTML = "";

  if (!sessionRecords.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Your saved sessions will appear here.";
    sessionList.appendChild(empty);
    return;
  }

  for (const session of sessionRecords) {
    const node = sessionRowTemplate.content.firstElementChild.cloneNode(true);
    const start = new Date(session.start);
    const end = session.end ? new Date(session.end) : now;
    const noteText = node.querySelector(".session-note-text");
    const editForm = node.querySelector(".session-edit-form");
    const editButton = node.querySelector(".edit-row");
    const saveButton = node.querySelector(".save-row");
    const cancelButton = node.querySelector(".cancel-row");

    node.querySelector(".session-date").textContent = formatDayHeading(start);
    node.querySelector(".session-duration").textContent = session.end
      ? formatDuration(end - start)
      : `${formatDuration(end - start)} so far`;
    node.querySelector(".session-type-text").textContent = session.workType || "Main Job";
    node.querySelector(".session-start-text").textContent = formatDateTime(start);
    node.querySelector(".session-end-text").textContent = session.end ? formatDateTime(end) : "Still clocked in";

    if (session.notes) {
      noteText.hidden = false;
      noteText.textContent = session.notes;
    }

    const startInput = node.querySelector(".session-start");
    const endInput = node.querySelector(".session-end");
    const notesInput = node.querySelector(".session-notes");
    const workTypeInputs = node.querySelectorAll(".session-work-type");
    const savedEditState = editState.get(session.id);

    workTypeInputs.forEach((input) => {
      input.name = `sessionWorkType-${session.id}`;
    });

    startInput.value = savedEditState?.start ?? formatDateTimeLocal(start);
    endInput.value = savedEditState?.end ?? (session.end ? formatDateTimeLocal(end) : "");
    endInput.placeholder = "Still clocked in";
    notesInput.value = savedEditState?.notes ?? (session.notes || "");
    setCheckedWorkType(workTypeInputs, savedEditState?.workType ?? session.workType ?? "Main Job");

    setEditMode(Boolean(savedEditState?.isEditing));

    editButton.addEventListener("click", () => {
      setEditMode(true);
      notesInput.focus();
    });

    cancelButton.addEventListener("click", () => {
      clearEditState(session.id);
      startInput.value = formatDateTimeLocal(new Date(session.start));
      endInput.value = session.end ? formatDateTimeLocal(new Date(session.end)) : "";
      notesInput.value = session.notes || "";
      setCheckedWorkType(workTypeInputs, session.workType || "Main Job");
      setEditMode(false);
    });

    startInput.addEventListener("input", captureDraftState);
    endInput.addEventListener("input", captureDraftState);
    notesInput.addEventListener("input", captureDraftState);
    workTypeInputs.forEach((input) => input.addEventListener("change", captureDraftState));

    saveButton.addEventListener("click", () => {
      const nextStart = new Date(startInput.value);
      const nextEnd = endInput.value ? new Date(endInput.value) : null;

      if (Number.isNaN(nextStart.getTime())) {
        window.alert("Please enter a valid clock-in time.");
        return;
      }

      if (nextEnd && Number.isNaN(nextEnd.getTime())) {
        window.alert("Please enter a valid clock-out time.");
        return;
      }

      if (nextEnd && nextEnd <= nextStart) {
        window.alert("Clock-out must be after clock-in.");
        return;
      }

      if (!nextEnd) {
        const otherActiveSession = state.sessions.find((entry) => entry.id !== session.id && !entry.end);
        if (otherActiveSession) {
          window.alert("Close the other active session before leaving this one open.");
          return;
        }
      }

      session.start = nextStart.toISOString();
      session.end = nextEnd ? nextEnd.toISOString() : null;
      session.notes = notesInput.value.trim();
      session.workType = getCheckedWorkType(workTypeInputs);
      clearEditState(session.id);
      saveState();
      render();
    });

    node.querySelector(".delete-row").addEventListener("click", () => {
      const confirmed = window.confirm("Delete this session?");
      if (!confirmed) {
        return;
      }

      state.sessions = state.sessions.filter((entry) => entry.id !== session.id);
      clearEditState(session.id);
      saveState();
      render();
    });

    sessionList.appendChild(node);

    function setEditMode(isEditing) {
      updateEditState(session.id, {
        isEditing,
        start: startInput.value,
        end: endInput.value,
        notes: notesInput.value,
        workType: getCheckedWorkType(workTypeInputs),
      });
      editForm.hidden = !isEditing;
      saveButton.hidden = !isEditing;
      cancelButton.hidden = !isEditing;
      editButton.hidden = isEditing;
    }

    function captureDraftState() {
      updateEditState(session.id, {
        isEditing: !editForm.hidden,
        start: startInput.value,
        end: endInput.value,
        notes: notesInput.value,
        workType: getCheckedWorkType(workTypeInputs),
      });
    }
  }
}

function renderWeeklyTotals(sessionRecords, now) {
  weeklyTotalsList.innerHTML = "";
  const totals = buildWeeklyTotals(sessionRecords, now);

  if (!totals.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Weekly totals will appear once you have saved sessions.";
    weeklyTotalsList.appendChild(empty);
    return;
  }

  for (const total of totals) {
    const row = document.createElement("article");
    row.className = "weekly-total-row";
    row.innerHTML = `
      <div class="weekly-total-cell">
        <span>Week</span>
        <strong>${total.label}</strong>
      </div>
      <div class="weekly-total-cell">
        <span>All Hours</span>
        <strong>${formatDuration(total.all)}</strong>
      </div>
      <div class="weekly-total-cell">
        <span>Main Job</span>
        <strong>${formatDuration(total.mainJob)}</strong>
      </div>
      <div class="weekly-total-cell">
        <span>Side Job</span>
        <strong>${formatDuration(total.sideJob)}</strong>
      </div>
    `;
    weeklyTotalsList.appendChild(row);
  }
}

function totalDurationInRange(sessions, rangeStart, rangeEnd, now) {
  return sessions.reduce((total, session) => {
    const start = new Date(session.start);
    const end = session.end ? new Date(session.end) : now;
    const overlapStart = Math.max(start.getTime(), rangeStart.getTime());
    const overlapEnd = Math.min(end.getTime(), rangeEnd.getTime());
    return total + Math.max(0, overlapEnd - overlapStart);
  }, 0);
}

function sortedSessions() {
  return [...state.sessions].sort((a, b) => new Date(b.start) - new Date(a.start));
}

function getActiveSession() {
  return state.sessions.find((session) => !session.end);
}

function formatDuration(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDayHeading(date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatTime(date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDateTimeLocal(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatDateInput(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function overlapsRange(session, rangeStart, rangeEnd, now) {
  const start = new Date(session.start);
  const end = session.end ? new Date(session.end) : now;
  return start < rangeEnd && end > rangeStart;
}

function startOfDay(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

function startOfWeek(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function weekLabel(date) {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${formatShortDate(start)} - ${formatShortDate(end)}`;
}

function weekLabelFromStart(start) {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${formatShortDate(start)} - ${formatShortDate(end)}`;
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatFileDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeSession(session) {
  if (!session || !session.start) {
    return null;
  }

  const start = new Date(session.start);
  const end = session.end ? new Date(session.end) : null;

  if (Number.isNaN(start.getTime())) {
    return null;
  }

  if (end && (Number.isNaN(end.getTime()) || end <= start)) {
    return null;
  }

  return {
    id: session.id || crypto.randomUUID(),
    start: start.toISOString(),
    end: end ? end.toISOString() : null,
    notes: typeof session.notes === "string" ? session.notes : "",
    workType: normalizeWorkType(session.workType),
  };
}

function buildWeeklyTotals(sessionRecords, now) {
  const bucketMap = new Map();
  const currentWeekStart = startOfWeek(now);

  for (const session of sessionRecords) {
    const start = new Date(session.start);
    const end = session.end ? new Date(session.end) : now;
    let cursor = new Date(startOfWeek(start));

    while (cursor < end) {
      const nextWeek = new Date(cursor);
      nextWeek.setDate(nextWeek.getDate() + 7);
      const overlapStart = Math.max(start.getTime(), cursor.getTime());
      const overlapEnd = Math.min(end.getTime(), nextWeek.getTime());
      const duration = Math.max(0, overlapEnd - overlapStart);

      if (duration > 0) {
        const key = cursor.toISOString();
        if (!bucketMap.has(key)) {
          bucketMap.set(key, {
            start: new Date(cursor),
            all: 0,
            mainJob: 0,
            sideJob: 0,
          });
        }

        const bucket = bucketMap.get(key);
        bucket.all += duration;
        if (session.workType === "Side Job") {
          bucket.sideJob += duration;
        } else {
          bucket.mainJob += duration;
        }
      }

      cursor = nextWeek;
    }
  }

  return [...bucketMap.values()]
    .sort((a, b) => b.start - a.start)
    .slice(0, 8)
    .map((bucket) => ({
      label: bucket.start.getTime() === currentWeekStart.getTime()
        ? `${weekLabelFromStart(bucket.start)} (Current)`
        : weekLabelFromStart(bucket.start),
      all: bucket.all,
      mainJob: bucket.mainJob,
      sideJob: bucket.sideJob,
    }));
}

function getSelectedEntryWorkType() {
  const selected = [...entryWorkTypeInputs].find((input) => input.checked);
  return selected ? selected.value : "Main Job";
}

function setEntryWorkType(value) {
  entryWorkTypeInputs.forEach((input) => {
    input.checked = input.value === value;
  });
}

function getCheckedWorkType(inputs) {
  const selected = [...inputs].find((input) => input.checked);
  return selected ? selected.value : "Main Job";
}

function setCheckedWorkType(inputs, value) {
  inputs.forEach((input) => {
    input.checked = input.value === value;
  });
}

function updateEditState(sessionId, nextState) {
  if (!nextState.isEditing) {
    editState.delete(sessionId);
    return;
  }

  editState.set(sessionId, nextState);
}

function clearEditState(sessionId) {
  editState.delete(sessionId);
}

function normalizeWorkType(workType) {
  if (workType === "Side Job" || workType === "State") {
    return "Side Job";
  }

  return "Main Job";
}
