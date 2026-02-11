const monthTitle = document.getElementById("monthTitle");
const pageName = document.getElementById("pageName");
const calendarGrid = document.getElementById("calendarGrid");
const weekdays = document.getElementById("weekdays");
const selectionHint = document.getElementById("selectionHint");
const statusMessage = document.getElementById("statusMessage");

const prevMonthBtn = document.getElementById("prevMonth");
const todayMonthBtn = document.getElementById("todayMonth");
const nextMonthBtn = document.getElementById("nextMonth");

const colorModal = document.getElementById("colorModal");
const modalTitle = document.getElementById("modalTitle");
const closeModal = document.getElementById("closeModal");

const clearAllBtn = document.getElementById("clearAll");
const pageTabs = document.getElementById("pageTabs");
const addPageBtn = document.getElementById("addPage");
const renamePageBtn = document.getElementById("renamePage");
const deletePageBtn = document.getElementById("deletePage");

const multiSelectToggle = document.getElementById("multiSelectToggle");
const applyColorBtn = document.getElementById("applyColor");
const clearSelectionBtn = document.getElementById("clearSelection");

const pageModal = document.getElementById("pageModal");
const pageModalTitle = document.getElementById("pageModalTitle");
const pageModalHint = document.getElementById("pageModalHint");
const pageNameInput = document.getElementById("pageNameInput");
const pageModalConfirm = document.getElementById("pageModalConfirm");
const pageModalCancel = document.getElementById("pageModalCancel");

const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STORAGE_DATA_VERSION_KEY = "calendar-data-version";
const STORAGE_DATA_VERSION = "2";

const now = new Date();
let viewYear = now.getFullYear();
let viewMonth = now.getMonth();

let activeDateKey = null;
let focusedDateKey = null;
let activePageId = null;
let pageModalMode = "rename";
let multiSelectEnabled = false;
let lastSelectedDateKey = null;
let lastModalTrigger = null;
let statusTimer = null;
let trappedModal = null;
let modalKeydownHandler = null;

const selectedDates = new Set();
let visibleDateKeys = [];

function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toDateKey(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function parseDateKey(dateKey) {
  const parts = String(dateKey).split("-");
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function isDateKeyInView(dateKey) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return false;
  return parsed.year === viewYear && parsed.month === viewMonth;
}

function getPageStorageKey(pageId) {
  return `calendar-color-${pageId}`;
}

function getPages() {
  const pages = safeParse(localStorage.getItem("calendar-pages"), []);
  return Array.isArray(pages) ? pages : [];
}

function savePages(pages) {
  localStorage.setItem("calendar-pages", JSON.stringify(pages));
}

function getActivePageId() {
  return localStorage.getItem("calendar-active-page");
}

function setActivePageId(pageId) {
  localStorage.setItem("calendar-active-page", pageId);
}

function loadState(pageId) {
  const state = safeParse(localStorage.getItem(getPageStorageKey(pageId)), {});
  return state && typeof state === "object" && !Array.isArray(state) ? state : {};
}

function saveState(pageId, state) {
  localStorage.setItem(getPageStorageKey(pageId), JSON.stringify(state));
}

function ensurePages() {
  let pages = getPages();
  if (pages.length === 0) {
    pages = [{ id: crypto.randomUUID(), name: "Page 1" }];
    savePages(pages);
    setActivePageId(pages[0].id);
  }

  const storedActive = getActivePageId();
  if (!storedActive || !pages.some((page) => page.id === storedActive)) {
    setActivePageId(pages[0].id);
  }
}

function migrateLegacyData() {
  if (localStorage.getItem(STORAGE_DATA_VERSION_KEY) === STORAGE_DATA_VERSION) return;

  const pages = getPages();
  const daysInViewMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  pages.forEach((page) => {
    const state = loadState(page.id);
    const keys = Object.keys(state);
    let changed = false;

    keys.forEach((key) => {
      if (!/^\d{1,2}$/.test(key)) return;
      const day = Number(key);
      if (day >= 1 && day <= daysInViewMonth) {
        const dateKey = toDateKey(viewYear, viewMonth, day);
        if (!Object.prototype.hasOwnProperty.call(state, dateKey)) {
          state[dateKey] = state[key];
        }
      }
      delete state[key];
      changed = true;
    });

    if (changed) {
      saveState(page.id, state);
    }
  });

  localStorage.setItem(STORAGE_DATA_VERSION_KEY, STORAGE_DATA_VERSION);
}

function setStatus(message) {
  statusMessage.textContent = message;
  if (statusTimer) {
    clearTimeout(statusTimer);
    statusTimer = null;
  }
  if (!message) return;
  statusTimer = setTimeout(() => {
    statusMessage.textContent = "";
  }, 2400);
}

function clearSelection() {
  selectedDates.clear();
  lastSelectedDateKey = null;
  activeDateKey = null;
}

function updateSelectionHint() {
  if (!multiSelectEnabled) {
    selectionHint.textContent = "Turn on multi-select to color multiple dates at once.";
    return;
  }

  if (selectedDates.size === 0) {
    selectionHint.textContent = "Select dates, then use Color selection. Tip: Shift+Click selects a range.";
    return;
  }

  const label = selectedDates.size === 1 ? "date" : "dates";
  selectionHint.textContent = `${selectedDates.size} ${label} selected.`;
}

function getDayButton(dateKey) {
  return calendarGrid.querySelector(`.day[data-date-key="${dateKey}"]`);
}

function setActiveDate(dateKey) {
  if (activeDateKey && activeDateKey !== dateKey) {
    const previous = getDayButton(activeDateKey);
    if (previous) {
      previous.classList.remove("active");
    }
  }

  activeDateKey = dateKey;
  const next = getDayButton(dateKey);
  if (next) {
    next.classList.add("active");
  }
}

function setDateSelection(dateKey, shouldSelect) {
  const cell = getDayButton(dateKey);
  if (shouldSelect) {
    selectedDates.add(dateKey);
    if (cell) {
      cell.classList.add("selected");
    }
    return;
  }

  selectedDates.delete(dateKey);
  if (cell) {
    cell.classList.remove("selected");
  }
}

function syncToolState() {
  multiSelectToggle.textContent = `Multi-select: ${multiSelectEnabled ? "On" : "Off"}`;
  multiSelectToggle.classList.toggle("active", multiSelectEnabled);
  multiSelectToggle.setAttribute("aria-pressed", String(multiSelectEnabled));

  const canApplySelection = multiSelectEnabled && selectedDates.size > 0;
  applyColorBtn.disabled = !canApplySelection;
  applyColorBtn.title = canApplySelection
    ? "Apply a color to selected dates"
    : "Select one or more dates while multi-select is on";

  clearSelectionBtn.disabled = selectedDates.size === 0;
  clearSelectionBtn.title =
    selectedDates.size > 0 ? "Clear selected dates" : "No selected dates";

  updateSelectionHint();
}

function renderPages() {
  const pages = getPages();
  activePageId = getActivePageId();
  const activePage = pages.find((page) => page.id === activePageId) || pages[0];

  if (!activePage) {
    pageName.textContent = "";
    pageTabs.innerHTML = "";
    return;
  }

  activePageId = activePage.id;
  setActivePageId(activePage.id);
  pageName.textContent = activePage.name;

  pageTabs.innerHTML = "";
  const fragment = document.createDocumentFragment();

  pages.forEach((page) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "page-tab";
    tab.textContent = page.name;
    tab.dataset.pageId = page.id;
    if (page.id === activePageId) {
      tab.classList.add("active");
      tab.setAttribute("aria-current", "page");
    }
    fragment.appendChild(tab);
  });

  pageTabs.appendChild(fragment);
}

function renderWeekdays() {
  weekdays.innerHTML = "";
  const fragment = document.createDocumentFragment();
  weekdayNames.forEach((name) => {
    const span = document.createElement("span");
    span.textContent = name;
    fragment.appendChild(span);
  });
  weekdays.appendChild(fragment);
}

function formatReadableDate(dateKey) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return dateKey;
  const date = new Date(parsed.year, parsed.month, parsed.day);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function renderCalendar() {
  const monthStart = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startWeekday = monthStart.getDay();
  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const state = loadState(activePageId);

  monthTitle.textContent = monthStart.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  if (activeDateKey && !isDateKeyInView(activeDateKey)) {
    activeDateKey = null;
  }

  if (focusedDateKey && !isDateKeyInView(focusedDateKey)) {
    focusedDateKey = null;
  }

  visibleDateKeys = [];
  calendarGrid.innerHTML = "";
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < startWeekday; i += 1) {
    const empty = document.createElement("div");
    empty.className = "day empty";
    empty.setAttribute("aria-hidden", "true");
    fragment.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = toDateKey(viewYear, viewMonth, day);
    visibleDateKeys.push(dateKey);

    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "day";
    cell.dataset.dateKey = dateKey;
    cell.setAttribute("aria-label", formatReadableDate(dateKey));

    if (dateKey === todayKey) {
      cell.classList.add("today");
    }

    const currentStatus = state[dateKey];
    if (currentStatus) {
      cell.classList.add(currentStatus);
    }

    if (dateKey === activeDateKey) {
      cell.classList.add("active");
    }

    if (selectedDates.has(dateKey)) {
      cell.classList.add("selected");
    }

    const dateLabel = document.createElement("div");
    dateLabel.className = "date";
    dateLabel.textContent = String(day);
    cell.appendChild(dateLabel);

    const status = document.createElement("div");
    status.className = "status";
    status.textContent = currentStatus ? currentStatus : "";
    cell.appendChild(status);

    fragment.appendChild(cell);
  }

  calendarGrid.appendChild(fragment);

  if (!focusedDateKey || !visibleDateKeys.includes(focusedDateKey)) {
    focusedDateKey = activeDateKey && visibleDateKeys.includes(activeDateKey) ? activeDateKey : visibleDateKeys[0] || null;
  }

  calendarGrid.querySelectorAll(".day").forEach((cell) => {
    if (cell.classList.contains("empty")) return;
    cell.tabIndex = -1;
  });

  if (focusedDateKey) {
    const focusedCell = calendarGrid.querySelector(`.day[data-date-key="${focusedDateKey}"]`);
    if (focusedCell) {
      focusedCell.tabIndex = 0;
    }
  }

  syncToolState();
}

function focusDateButton(dateKey) {
  const button = calendarGrid.querySelector(`.day[data-date-key="${dateKey}"]`);
  if (!button) return;
  button.focus();
}

function releaseTrapFocus() {
  if (!trappedModal || !modalKeydownHandler) return;
  trappedModal.removeEventListener("keydown", modalKeydownHandler);
  trappedModal = null;
  modalKeydownHandler = null;
}

function trapFocus(modalElement, onEscape) {
  releaseTrapFocus();
  trappedModal = modalElement;

  modalKeydownHandler = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape();
      return;
    }

    if (event.key !== "Tab") return;

    const focusable = Array.from(
      modalElement.querySelectorAll(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
      )
    ).filter((el) => !el.hasAttribute("hidden"));

    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  modalElement.addEventListener("keydown", modalKeydownHandler);
}

function restoreModalTriggerFocus() {
  if (lastModalTrigger && typeof lastModalTrigger.focus === "function") {
    lastModalTrigger.focus();
  }
  lastModalTrigger = null;
}

function openModal(dateKey, triggerElement = document.activeElement) {
  activeDateKey = dateKey;
  lastModalTrigger = triggerElement;

  if (multiSelectEnabled && selectedDates.size > 0) {
    modalTitle.textContent = `Choose a color for ${selectedDates.size} days`;
  } else {
    modalTitle.textContent = `Choose a color for ${formatReadableDate(dateKey)}`;
  }

  colorModal.classList.add("open");
  colorModal.setAttribute("aria-hidden", "false");
  trapFocus(colorModal, closeModalDialog);

  const firstAction = colorModal.querySelector(".pick[data-color]");
  if (firstAction) {
    firstAction.focus();
  }
}

function closeModalDialog() {
  colorModal.classList.remove("open");
  colorModal.setAttribute("aria-hidden", "true");
  releaseTrapFocus();
  restoreModalTriggerFocus();
}

function openPageModal(mode, triggerElement = document.activeElement) {
  const pages = getPages();
  const activePage = pages.find((page) => page.id === activePageId);
  if (!activePage) return;

  pageModalMode = mode;
  lastModalTrigger = triggerElement;

  pageModal.classList.add("open");
  pageModal.setAttribute("aria-hidden", "false");

  if (mode === "rename") {
    pageModalTitle.textContent = "Rename page";
    pageModalHint.textContent = "";
    pageNameInput.value = activePage.name;
    pageNameInput.disabled = false;
    pageModalConfirm.textContent = "Save";
    pageModalConfirm.classList.remove("danger");
    pageModalConfirm.classList.add("green");
    pageNameInput.focus();
    pageNameInput.select();
  } else {
    pageModalTitle.textContent = "Delete page";
    pageModalHint.textContent = "This deletes the page and its marks. This cannot be undone.";
    pageNameInput.value = activePage.name;
    pageNameInput.disabled = true;
    pageModalConfirm.textContent = "Delete";
    pageModalConfirm.classList.remove("green");
    pageModalConfirm.classList.add("danger");
    pageModalConfirm.focus();
  }

  trapFocus(pageModal, closePageModal);
}

function closePageModal() {
  pageModal.classList.remove("open");
  pageModal.setAttribute("aria-hidden", "true");
  pageModalHint.textContent = "";
  releaseTrapFocus();
  restoreModalTriggerFocus();
}

function selectRange(fromDateKey, toDateKey) {
  const startIndex = visibleDateKeys.indexOf(fromDateKey);
  const endIndex = visibleDateKeys.indexOf(toDateKey);

  if (startIndex < 0 || endIndex < 0) {
    setDateSelection(toDateKey, true);
    return;
  }

  const lower = Math.min(startIndex, endIndex);
  const upper = Math.max(startIndex, endIndex);
  for (let i = lower; i <= upper; i += 1) {
    setDateSelection(visibleDateKeys[i], true);
  }
}

function updateDateColor(color) {
  if (!activeDateKey && !(multiSelectEnabled && selectedDates.size > 0)) return;

  const state = loadState(activePageId);
  const targets = multiSelectEnabled && selectedDates.size > 0 ? Array.from(selectedDates) : [activeDateKey];

  let affected = 0;

  targets.forEach((dateKey) => {
    if (!dateKey) return;
    if (color === "clear") {
      if (Object.prototype.hasOwnProperty.call(state, dateKey)) {
        delete state[dateKey];
        affected += 1;
      }
      return;
    }

    state[dateKey] = color;
    affected += 1;
  });

  saveState(activePageId, state);
  renderCalendar();
  closeModalDialog();

  if (affected > 0) {
    const verb = color === "clear" ? "Cleared" : `Applied ${color}`;
    const label = affected === 1 ? "day" : "days";
    setStatus(`${verb} on ${affected} ${label}.`);
  }

  if (targets[0]) {
    focusedDateKey = targets[0];
    focusDateButton(targets[0]);
  }
}

function shiftMonth(delta) {
  const next = new Date(viewYear, viewMonth + delta, 1);
  viewYear = next.getFullYear();
  viewMonth = next.getMonth();
  clearSelection();
  focusedDateKey = toDateKey(viewYear, viewMonth, 1);
  renderCalendar();
}

function jumpToTodayMonth() {
  viewYear = now.getFullYear();
  viewMonth = now.getMonth();
  clearSelection();
  focusedDateKey = toDateKey(viewYear, viewMonth, now.getDate());
  renderCalendar();
}

function clearCurrentMonth() {
  const state = loadState(activePageId);
  const prefix = `${viewYear}-${pad2(viewMonth + 1)}-`;
  let removed = 0;

  Object.keys(state).forEach((dateKey) => {
    if (dateKey.startsWith(prefix)) {
      delete state[dateKey];
      removed += 1;
    }
  });

  if (removed > 0) {
    saveState(activePageId, state);
  }

  renderCalendar();
  setStatus(removed > 0 ? `Cleared ${removed} marks for this month.` : "No marks to clear in this month.");
}

calendarGrid.addEventListener("click", (event) => {
  const target = event.target.closest(".day");
  if (!target || target.classList.contains("empty")) return;

  const dateKey = target.dataset.dateKey;
  focusedDateKey = dateKey;

  if (multiSelectEnabled) {
    if (event.shiftKey && lastSelectedDateKey) {
      selectRange(lastSelectedDateKey, dateKey);
    } else if (selectedDates.has(dateKey)) {
      setDateSelection(dateKey, false);
    } else {
      setDateSelection(dateKey, true);
    }

    lastSelectedDateKey = dateKey;
    setActiveDate(dateKey);
    syncToolState();
    focusDateButton(dateKey);
    return;
  }

  openModal(dateKey, target);
});

calendarGrid.addEventListener("keydown", (event) => {
  if (colorModal.classList.contains("open") || pageModal.classList.contains("open")) return;

  if (!visibleDateKeys.length) return;

  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();

    let index = visibleDateKeys.indexOf(focusedDateKey);
    if (index < 0) index = 0;

    let delta = 0;
    if (event.key === "ArrowLeft") delta = -1;
    if (event.key === "ArrowRight") delta = 1;
    if (event.key === "ArrowUp") delta = -7;
    if (event.key === "ArrowDown") delta = 7;

    const nextIndex = Math.max(0, Math.min(visibleDateKeys.length - 1, index + delta));
    const nextDateKey = visibleDateKeys[nextIndex];

    if (multiSelectEnabled && event.shiftKey) {
      selectRange(lastSelectedDateKey || focusedDateKey || nextDateKey, nextDateKey);
      lastSelectedDateKey = nextDateKey;
    }

    focusedDateKey = nextDateKey;
    activeDateKey = nextDateKey;
    renderCalendar();
    focusDateButton(nextDateKey);
    return;
  }

  if ((event.key === "Enter" || event.key === " ") && focusedDateKey) {
    event.preventDefault();
    const trigger = calendarGrid.querySelector(`.day[data-date-key="${focusedDateKey}"]`);
    openModal(focusedDateKey, trigger || document.activeElement);
  }
});

colorModal.addEventListener("click", (event) => {
  if (event.target === colorModal) {
    closeModalDialog();
  }
});

pageModal.addEventListener("click", (event) => {
  if (event.target === pageModal) {
    closePageModal();
  }
});

closeModal.addEventListener("click", closeModalDialog);

colorModal.querySelectorAll(".pick[data-color]").forEach((button) => {
  button.addEventListener("click", () => {
    updateDateColor(button.dataset.color);
  });
});

clearAllBtn.addEventListener("click", clearCurrentMonth);

multiSelectToggle.addEventListener("click", () => {
  multiSelectEnabled = !multiSelectEnabled;

  if (!multiSelectEnabled) {
    clearSelection();
    renderCalendar();
    setStatus("Multi-select disabled.");
    return;
  }

  syncToolState();
  setStatus("Multi-select enabled.");
});

applyColorBtn.addEventListener("click", () => {
  if (applyColorBtn.disabled) return;
  const fallbackKey = lastSelectedDateKey || Array.from(selectedDates)[0];
  if (!fallbackKey) return;
  const trigger = calendarGrid.querySelector(`.day[data-date-key="${fallbackKey}"]`) || applyColorBtn;
  openModal(fallbackKey, trigger);
});

clearSelectionBtn.addEventListener("click", () => {
  clearSelection();
  renderCalendar();
  setStatus("Selection cleared.");
});

pageTabs.addEventListener("click", (event) => {
  const target = event.target.closest(".page-tab");
  if (!target) return;

  const nextPageId = target.dataset.pageId;
  if (!nextPageId || nextPageId === activePageId) return;

  setActivePageId(nextPageId);
  clearSelection();
  renderPages();
  renderCalendar();
  setStatus("Switched page.");
});

addPageBtn.addEventListener("click", () => {
  const pages = getPages();
  const newPage = { id: crypto.randomUUID(), name: `Page ${pages.length + 1}` };
  pages.push(newPage);
  savePages(pages);
  setActivePageId(newPage.id);

  clearSelection();
  renderPages();
  renderCalendar();
  setStatus("Page added.");
});

renamePageBtn.addEventListener("click", () => {
  openPageModal("rename", renamePageBtn);
});

deletePageBtn.addEventListener("click", () => {
  openPageModal("delete", deletePageBtn);
});

pageModalCancel.addEventListener("click", closePageModal);

pageModalConfirm.addEventListener("click", () => {
  const pages = getPages();
  const activePage = pages.find((page) => page.id === activePageId);
  if (!activePage) return;

  if (pageModalMode === "rename") {
    const nextName = pageNameInput.value.trim();
    if (!nextName) {
      pageModalHint.textContent = "Please enter a page name.";
      return;
    }

    activePage.name = nextName;
    savePages(pages);
    renderPages();
    closePageModal();
    setStatus("Page renamed.");
    return;
  }

  if (pages.length <= 1) {
    pageModalHint.textContent = "You need at least one page.";
    return;
  }

  const nextPages = pages.filter((page) => page.id !== activePageId);
  savePages(nextPages);
  localStorage.removeItem(getPageStorageKey(activePageId));
  setActivePageId(nextPages[0].id);

  clearSelection();
  renderPages();
  renderCalendar();
  closePageModal();
  setStatus("Page deleted.");
});

pageNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && pageModal.classList.contains("open") && pageModalMode === "rename") {
    event.preventDefault();
    pageModalConfirm.click();
  }
});

prevMonthBtn.addEventListener("click", () => {
  shiftMonth(-1);
});

todayMonthBtn.addEventListener("click", () => {
  jumpToTodayMonth();
});

nextMonthBtn.addEventListener("click", () => {
  shiftMonth(1);
});

renderWeekdays();
ensurePages();
activePageId = getActivePageId();
migrateLegacyData();
renderPages();
focusedDateKey = toDateKey(viewYear, viewMonth, 1);
renderCalendar();
