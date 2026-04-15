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
const sessionRowTemplate = document.querySelector("#sessionRowTemplate");
const clockInBtn = document.querySelector("#clockInBtn");
const clockOutBtn = document.querySelector("#clockOutBtn");
const exportBtn = document.querySelector("#exportBtn");
const importInput = document.querySelector("#importInput");
const installBtn = document.querySelector("#installBtn");
const installHelp = document.querySelector("#installHelp");
const manualEntryForm = document.querySelector("#manualEntryForm");
const entryDate = document.querySelector("#entryDate");
const entryStart = document.querySelector("#entryStart");
const entryEnd = document.querySelector("#entryEnd");
let deferredInstallPrompt = null;

entryDate.value = formatDateInput(new Date());

clockInBtn.addEventListener("click", handleClockIn);
clockOutBtn.addEventListener("click", handleClockOut);
exportBtn.addEventListener("click", handleExport);
importInput.addEventListener("change", handleImport);
manualEntryForm.addEventListener("submit", handleManualEntry);
installBtn.addEventListener("click", handleInstall);

render();
window.setInterval(render, 30000);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
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
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
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
  });

  state.sessions.sort((a, b) => new Date(b.start) - new Date(a.start));
  saveState();
  manualEntryForm.reset();
  entryDate.value = formatDateInput(new Date());
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
        .map((session) => ({
          id: session.id || crypto.randomUUID(),
          start: new Date(session.start).toISOString(),
          end: session.end ? new Date(session.end).toISOString() : null,
        }))
        .filter((session) => !Number.isNaN(new Date(session.start).getTime()))
        .filter((session) => !session.end || new Date(session.end) > new Date(session.start));

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

  renderSessionList(sessionRecords, now);
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

    node.querySelector(".session-date").textContent = formatDayHeading(start);
    node.querySelector(".session-duration").textContent = session.end
      ? formatDuration(end - start)
      : `${formatDuration(end - start)} so far`;

    const startInput = node.querySelector(".session-start");
    const endInput = node.querySelector(".session-end");

    startInput.value = formatDateTimeLocal(start);
    endInput.value = session.end ? formatDateTimeLocal(end) : "";
    endInput.placeholder = "Still clocked in";

    node.querySelector(".save-row").addEventListener("click", () => {
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
      saveState();
      render();
    });

    node.querySelector(".delete-row").addEventListener("click", () => {
      const confirmed = window.confirm("Delete this session?");
      if (!confirmed) {
        return;
      }

      state.sessions = state.sessions.filter((entry) => entry.id !== session.id);
      saveState();
      render();
    });

    sessionList.appendChild(node);
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

function formatShortDate(date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatFileDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
