const monthTitle = document.getElementById("monthTitle");
const pageName = document.getElementById("pageName");
const calendarGrid = document.getElementById("calendarGrid");
const weekdays = document.getElementById("weekdays");
const selectionHint = document.getElementById("selectionHint");
const statusMessage = document.getElementById("statusMessage");
const calendarSection = document.querySelector(".calendar");

const prevMonthBtn = document.getElementById("prevMonth");
const todayMonthBtn = document.getElementById("todayMonth");
const nextMonthBtn = document.getElementById("nextMonth");
const monthViewBtn = document.getElementById("monthViewBtn");
const yearViewBtn = document.getElementById("yearViewBtn");

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
const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const STORAGE_DATA_VERSION_KEY = "calendar-data-version";
const STORAGE_DATA_VERSION = "2";

const now = new Date();
let viewYear = now.getFullYear();
let viewMonth = now.getMonth();
let viewMode = "month";

let activeDateKey = null;
let focusedDateKey = null;
let focusedYearDateKey = null;
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

function isDateKeyInViewYear(dateKey) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return false;
  return parsed.year === viewYear;
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
  if (viewMode === "year") {
    selectionHint.textContent = "Year view is overview-only. Select a date to jump into month view.";
    return;
  }

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

function getYearDayButton(dateKey) {
  return calendarGrid.querySelector(`.year-day[data-date-key="${dateKey}"]`);
}

function setActiveDate(dateKey) {
  if (viewMode !== "month") return;

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

function syncViewModeButtons() {
  const isMonthView = viewMode === "month";

  monthViewBtn.classList.toggle("active", isMonthView);
  monthViewBtn.setAttribute("aria-pressed", String(isMonthView));

  yearViewBtn.classList.toggle("active", !isMonthView);
  yearViewBtn.setAttribute("aria-pressed", String(!isMonthView));
}

function syncToolState() {
  const isMonthView = viewMode === "month";

  multiSelectToggle.textContent = `Multi-select: ${multiSelectEnabled ? "On" : "Off"}`;
  multiSelectToggle.classList.toggle("active", multiSelectEnabled);
  multiSelectToggle.setAttribute("aria-pressed", String(multiSelectEnabled));
  multiSelectToggle.disabled = !isMonthView;

  const canApplySelection = isMonthView && multiSelectEnabled && selectedDates.size > 0;
  applyColorBtn.disabled = !canApplySelection;
  applyColorBtn.title = canApplySelection
    ? "Apply a color to selected dates"
    : "Select one or more dates while multi-select is on";

  clearSelectionBtn.disabled = !isMonthView || selectedDates.size === 0;
  clearSelectionBtn.title =
    selectedDates.size > 0 ? "Clear selected dates" : "No selected dates";

  clearAllBtn.disabled = !isMonthView;
  clearAllBtn.title = isMonthView
    ? "Clear marks for this visible month"
    : "Switch to month view to clear a month";

  if (!isMonthView) {
    multiSelectToggle.title = "Switch to month view to use multi-select";
  } else {
    multiSelectToggle.title = "Select multiple dates in month view";
  }

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

function renderMonthView() {
  const monthStart = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const startWeekday = monthStart.getDay();
  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const state = loadState(activePageId);

  monthTitle.textContent = monthStart.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  weekdays.hidden = false;
  weekdays.style.display = "";
  calendarSection.classList.remove("year-view");
  calendarGrid.classList.remove("year-grid");
  calendarGrid.classList.add("grid");
  calendarGrid.setAttribute("role", "grid");
  calendarGrid.setAttribute("aria-label", "Calendar days");

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
    status.textContent = "";
    cell.appendChild(status);

    fragment.appendChild(cell);
  }

  calendarGrid.appendChild(fragment);

  if (!focusedDateKey || !visibleDateKeys.includes(focusedDateKey)) {
    focusedDateKey =
      activeDateKey && visibleDateKeys.includes(activeDateKey) ? activeDateKey : visibleDateKeys[0] || null;
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
}

function renderYearView() {
  const state = loadState(activePageId);
  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate());

  monthTitle.textContent = String(viewYear);

  weekdays.hidden = true;
  weekdays.style.display = "none";
  calendarSection.classList.add("year-view");
  calendarGrid.classList.remove("grid");
  calendarGrid.classList.add("year-grid");
  calendarGrid.setAttribute("role", "grid");
  calendarGrid.setAttribute("aria-label", "Calendar year days");

  activeDateKey = null;
  focusedDateKey = null;
  visibleDateKeys = [];
  calendarGrid.innerHTML = "";

  const yearFragment = document.createDocumentFragment();

  for (let month = 0; month < 12; month += 1) {
    const monthCard = document.createElement("section");
    monthCard.className = "year-month-card";

    const monthHeading = document.createElement("h3");
    monthHeading.className = "year-month-title";
    monthHeading.textContent = monthNames[month];
    monthCard.appendChild(monthHeading);

    const daysContainer = document.createElement("div");
    daysContainer.className = "year-days";

    const monthStart = new Date(viewYear, month, 1);
    const startWeekday = monthStart.getDay();
    const daysInMonth = new Date(viewYear, month + 1, 0).getDate();

    for (let i = 0; i < startWeekday; i += 1) {
      const empty = document.createElement("div");
      empty.className = "year-day empty";
      empty.setAttribute("aria-hidden", "true");
      daysContainer.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateKey = toDateKey(viewYear, month, day);
      visibleDateKeys.push(dateKey);

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "year-day";
      cell.dataset.dateKey = dateKey;
      cell.setAttribute("aria-label", formatReadableDate(dateKey));

      if (dateKey === todayKey) {
        cell.classList.add("today");
      }

      const currentStatus = state[dateKey];
      if (currentStatus) {
        cell.classList.add(currentStatus);
      }

      daysContainer.appendChild(cell);
    }

    monthCard.appendChild(daysContainer);
    yearFragment.appendChild(monthCard);
  }

  calendarGrid.appendChild(yearFragment);

  if (!focusedYearDateKey || !isDateKeyInViewYear(focusedYearDateKey)) {
    focusedYearDateKey = now.getFullYear() === viewYear ? todayKey : visibleDateKeys[0] || null;
  }

  calendarGrid.querySelectorAll(".year-day").forEach((cell) => {
    if (cell.classList.contains("empty")) return;
    cell.tabIndex = -1;
    cell.classList.remove("focused");
  });

  if (focusedYearDateKey) {
    const focusedCell = getYearDayButton(focusedYearDateKey);
    if (focusedCell) {
      focusedCell.tabIndex = 0;
      focusedCell.classList.add("focused");
    }
  }
}

function renderCalendar() {
  if (viewMode === "year") {
    renderYearView();
  } else {
    renderMonthView();
  }

  syncViewModeButtons();
  syncToolState();
}

function focusDateButton(dateKey) {
  const button = calendarGrid.querySelector(`.day[data-date-key="${dateKey}"]`);
  if (!button) return;
  button.focus();
}

function focusYearDateButton(dateKey) {
  const button = calendarGrid.querySelector(`.year-day[data-date-key="${dateKey}"]`);
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
  if (viewMode !== "month") return;

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
  if (!activePage && mode !== "add") return;

  pageModalMode = mode;
  lastModalTrigger = triggerElement;

  pageModal.classList.add("open");
  pageModal.setAttribute("aria-hidden", "false");

  if (mode === "add") {
    pageModalTitle.textContent = "Add page";
    pageModalHint.textContent = "";
    pageNameInput.value = `Page ${pages.length + 1}`;
    pageNameInput.disabled = false;
    pageModalConfirm.textContent = "Create";
    pageModalConfirm.classList.remove("danger");
    pageModalConfirm.classList.add("green");
    pageNameInput.focus();
    pageNameInput.select();
  } else if (mode === "rename") {
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

  const usedMultiSelection = multiSelectEnabled && selectedDates.size > 0;
  const state = loadState(activePageId);
  const targets = usedMultiSelection ? Array.from(selectedDates) : [activeDateKey];

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
  if (usedMultiSelection) {
    clearSelection();
  }
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
  if (viewMode === "year") {
    viewYear += delta;
    focusedYearDateKey = toDateKey(viewYear, viewMonth, 1);
    clearSelection();
    renderCalendar();
    return;
  }

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

  if (viewMode === "year") {
    focusedYearDateKey = toDateKey(viewYear, viewMonth, now.getDate());
    renderCalendar();
    return;
  }

  focusedDateKey = toDateKey(viewYear, viewMonth, now.getDate());
  renderCalendar();
}

function clearCurrentMonth() {
  if (viewMode !== "month") {
    setStatus("Switch to month view to clear a month.");
    return;
  }

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

function openYearDateInMonthView(dateKey, triggerElement = document.activeElement) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return;

  clearSelection();
  viewYear = parsed.year;
  viewMonth = parsed.month;
  viewMode = "month";
  focusedDateKey = dateKey;
  activeDateKey = dateKey;
  renderCalendar();
  focusDateButton(dateKey);
  lastModalTrigger = triggerElement;
}

calendarGrid.addEventListener("click", (event) => {
  if (viewMode === "year") {
    const target = event.target.closest(".year-day");
    if (!target || target.classList.contains("empty")) return;
    const dateKey = target.dataset.dateKey;
    if (!dateKey) return;
    focusedYearDateKey = dateKey;
    openYearDateInMonthView(dateKey, target);
    return;
  }

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

  if (viewMode === "year") {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();

      let index = visibleDateKeys.indexOf(focusedYearDateKey);
      if (index < 0) index = 0;

      let delta = 0;
      if (event.key === "ArrowLeft") delta = -1;
      if (event.key === "ArrowRight") delta = 1;
      if (event.key === "ArrowUp") delta = -7;
      if (event.key === "ArrowDown") delta = 7;

      const nextIndex = Math.max(0, Math.min(visibleDateKeys.length - 1, index + delta));
      const nextDateKey = visibleDateKeys[nextIndex];
      focusedYearDateKey = nextDateKey;
      renderCalendar();
      focusYearDateButton(nextDateKey);
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && focusedYearDateKey) {
      event.preventDefault();
      const trigger = getYearDayButton(focusedYearDateKey);
      openYearDateInMonthView(focusedYearDateKey, trigger || document.activeElement);
    }

    return;
  }

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
  if (viewMode !== "month") {
    setStatus("Switch to month view to use multi-select.");
    return;
  }

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
  if (viewMode !== "month" || applyColorBtn.disabled) return;
  const fallbackKey = lastSelectedDateKey || Array.from(selectedDates)[0];
  if (!fallbackKey) return;
  const trigger = calendarGrid.querySelector(`.day[data-date-key="${fallbackKey}"]`) || applyColorBtn;
  openModal(fallbackKey, trigger);
});

clearSelectionBtn.addEventListener("click", () => {
  if (viewMode !== "month") return;
  clearSelection();
  renderCalendar();
  setStatus("Selection cleared.");
});

monthViewBtn.addEventListener("click", () => {
  if (viewMode === "month") return;
  viewMode = "month";
  focusedDateKey = toDateKey(viewYear, viewMonth, 1);
  renderCalendar();
});

yearViewBtn.addEventListener("click", () => {
  if (viewMode === "year") return;
  viewMode = "year";
  clearSelection();

  if (focusedDateKey && isDateKeyInViewYear(focusedDateKey)) {
    focusedYearDateKey = focusedDateKey;
  } else {
    focusedYearDateKey = toDateKey(viewYear, 0, 1);
  }

  renderCalendar();
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
  openPageModal("add", addPageBtn);
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

  if (pageModalMode === "add") {
    const nextName = pageNameInput.value.trim();
    if (!nextName) {
      pageModalHint.textContent = "Please enter a page name.";
      return;
    }

    const newPage = { id: crypto.randomUUID(), name: nextName };
    pages.push(newPage);
    savePages(pages);
    setActivePageId(newPage.id);

    clearSelection();
    renderPages();
    renderCalendar();
    closePageModal();
    setStatus("Page added.");
    return;
  }

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
focusedYearDateKey = toDateKey(viewYear, 0, 1);
renderCalendar();
