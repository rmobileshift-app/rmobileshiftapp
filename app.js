const SHIFT_TYPES = ["早", "中", "遅", "休", "法休", "公休", "空"];

const state = {
  yearMonth: "2026-06",
  activeTab: "staff",
  storeName: "",
  minWeekday: 2,
  minWeekend: 3,
  minEarly: 1,
  minLate: 1,
  maxLate: 2,
  monthEndDays: 3,
  monthEndMin: 3,
  weekendMode: true,
  monthEndMode: true,
  staffs: [],
  shifts: {},
  monthlyShifts: {},
  monthlyLastGeneratedShifts: {},
  monthlyStaffSettings: {},
  monthlyHolidayLimits: {},
  holidayLimitDefaultVersion: 2,
  confirmedShifts: {},
  confirmModalOpen: false,
  unconfirmModalOpen: false,
  modalOpen: false,
  modalMode: "add",
  editingStaffId: null,
  draftStaff: null
};

const app = document.getElementById("app");

function getCurrentYearMonth() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function cloneShifts(shifts) {
  return JSON.parse(JSON.stringify(shifts || {}));
}

function createBlankShiftsForCurrentMonth() {
  const days = daysInMonth();
  const blankShifts = {};

  state.staffs.forEach(staff => {
    blankShifts[staff.id] = {};

    for (let d = 1; d <= days; d++) {
      blankShifts[staff.id][d] = "空";
    }
  });

  return blankShifts;
}

function saveCurrentMonthShifts() {
  if (!state.yearMonth) return;

  state.monthlyShifts = state.monthlyShifts || {};

  ensureShiftData();

  state.monthlyShifts[state.yearMonth] = cloneShifts(state.shifts);
}

function loadMonthShifts() {
  state.monthlyShifts = state.monthlyShifts || {};

  const savedMonthShifts = state.monthlyShifts[state.yearMonth];

  if (savedMonthShifts) {
    state.shifts = cloneShifts(savedMonthShifts);
  } else {
    state.shifts = createBlankShiftsForCurrentMonth();
  }

  ensureShiftData();
}

function removeStaffFromAllMonthlyShifts(staffId) {
  state.monthlyShifts = state.monthlyShifts || {};
  state.monthlyLastGeneratedShifts =
    state.monthlyLastGeneratedShifts || {};
  state.monthlyStaffSettings = state.monthlyStaffSettings || {};

  Object.keys(state.monthlyShifts).forEach(month => {
    if (state.monthlyShifts[month]?.[staffId]) {
      delete state.monthlyShifts[month][staffId];
    }
  });

  Object.keys(state.monthlyStaffSettings).forEach(month => {
    if (state.monthlyStaffSettings[month]?.[staffId]) {
      delete state.monthlyStaffSettings[month][staffId];
    }
  });

  Object.keys(state.monthlyLastGeneratedShifts).forEach(month => {
    if (state.monthlyLastGeneratedShifts[month]?.[staffId]) {
      delete state.monthlyLastGeneratedShifts[month][staffId];
    }
  });
}

function saveCurrentMonthStaffSettings() {
  if (!state.yearMonth) return;

  state.monthlyStaffSettings = state.monthlyStaffSettings || {};
  state.monthlyStaffSettings[state.yearMonth] = {};

  state.staffs.forEach(staff => {
    state.monthlyStaffSettings[state.yearMonth][staff.id] = {
      workDays: Number(staff.workDays),
      holidayDays: Number(staff.holidayDays)
    };
  });
}

function loadMonthStaffSettings(referenceSettings = null) {
  state.monthlyStaffSettings = state.monthlyStaffSettings || {};
  const saved = state.monthlyStaffSettings[state.yearMonth];

  // 未登録の新しい月は、前月の休日数に近づけながら
  // 新しい月の日数に合うよう出勤日数を調整する。
  if (!saved) {
    const days = daysInMonth();

    state.staffs.forEach(staff => {
      const reference =
        referenceSettings?.[staff.id] || {
          workDays: Number(staff.workDays),
          holidayDays: Number(staff.holidayDays)
        };
      const ruleHolidayDays =
        staff.holidayRule && staff.holidayRule !== "個別設定"
          ? calculateHolidayDaysByStaffRule(staff)
          : null;
      const holidayDays =
        ruleHolidayDays !== null
          ? ruleHolidayDays
          : Math.max(
              0,
              Math.min(days, Number(reference.holidayDays) || 0)
            );

      staff.holidayDays = holidayDays;
      staff.workDays = days - holidayDays;
    });

    saveCurrentMonthStaffSettings();
    return;
  }

  state.staffs.forEach(staff => {
    const setting = saved[staff.id];
    if (!setting) return;

    staff.workDays = Number(setting.workDays);
    staff.holidayDays = Number(setting.holidayDays);
  });
}

function ensureCurrentMonthHolidayLimits() {
  state.monthlyHolidayLimits = state.monthlyHolidayLimits || {};
  const month = state.yearMonth;
  const days = daysInMonth();

  if (!state.monthlyHolidayLimits[month]) {
    state.monthlyHolidayLimits[month] = {};
  }

  for (let day = 1; day <= days; day++) {
    const current = Number(state.monthlyHolidayLimits[month][day]);
    if (!Number.isFinite(current) || current < 0) {
      state.monthlyHolidayLimits[month][day] = 1;
    }
  }

  Object.keys(state.monthlyHolidayLimits[month]).forEach(day => {
    if (Number(day) > days) delete state.monthlyHolidayLimits[month][day];
  });
}

function getHolidayLimitOnDay(day) {
  ensureCurrentMonthHolidayLimits();
  return Number(state.monthlyHolidayLimits[state.yearMonth][day]);
}

function updateHolidayLimit(day, value) {
  ensureCurrentMonthHolidayLimits();
  const parsed = Math.max(0, Math.min(state.staffs.length, Number(value) || 0));
  state.monthlyHolidayLimits[state.yearMonth][day] = parsed;
  save();
  render();
}

function adjustHolidayLimit(day, diff) {
  updateHolidayLimit(day, getHolidayLimitOnDay(day) + Number(diff));
}

function setAllHolidayLimits(value) {
  ensureCurrentMonthHolidayLimits();
  const parsed = Math.max(0, Number(value) || 0);

  for (let day = 1; day <= daysInMonth(); day++) {
    state.monthlyHolidayLimits[state.yearMonth][day] = parsed;
  }

  save();
  render();
}

function save() {
  saveCurrentMonthShifts();
  saveCurrentMonthStaffSettings();
  localStorage.setItem("rakutenShiftMobileMvp", JSON.stringify(state));
}

function load() {
  const currentYearMonth = getCurrentYearMonth();
  const saved = localStorage.getItem("rakutenShiftMobileMvp");
  if (!saved) {
    state.yearMonth = currentYearMonth;
    ensureCurrentMonthHolidayLimits();
    return;
  }

  try {
    const data = JSON.parse(saved);
    Object.assign(state, data);
    const previouslyOpenYearMonth = state.yearMonth || currentYearMonth;
    state.yearMonth = currentYearMonth;

    state.confirmedShifts = state.confirmedShifts || {};
    state.monthlyShifts = state.monthlyShifts || {};
    state.monthlyLastGeneratedShifts =
      state.monthlyLastGeneratedShifts || {};
    state.monthlyStaffSettings = state.monthlyStaffSettings || {};
    state.monthlyHolidayLimits = state.monthlyHolidayLimits || {};

    if (data.holidayLimitDefaultVersion !== 2) {
      Object.values(state.monthlyHolidayLimits).forEach(monthLimits => {
        if (!monthLimits) return;
        Object.keys(monthLimits).forEach(day => {
          if (Number(monthLimits[day]) === state.staffs.length) {
            monthLimits[day] = 1;
          }
        });
      });
      state.holidayLimitDefaultVersion = 2;
    }
    state.confirmModalOpen = false;
    state.unconfirmModalOpen = false;
    state.minEarly = state.minEarly ?? 1;
    state.minLate = state.minLate ?? 1;
    state.maxLate = state.maxLate ?? Math.max(Number(state.minLate), 2);
    state.storeName = state.storeName || "";

    state.modalOpen = false;
    state.modalMode = "add";
    state.editingStaffId = null;
    state.draftStaff = null;

    state.staffs = state.staffs.map(staff => ({
      ...staff,
      desiredHolidays: staff.desiredHolidays || [],
      unavailableDays: staff.unavailableDays || [],
      holidayRule: staff.holidayRule || "個別設定",
      weekStart: staff.weekStart || "月曜起算",
      maxConsecutiveWorkDays: staff.maxConsecutiveWorkDays ?? 5,
      canEarly: staff.canEarly ?? true,
      canMiddle: staff.canMiddle ?? true,
      canLate: staff.canLate ?? true,
      workDays: Number(staff.workDays ?? 21),
      holidayDays: Number(staff.holidayDays ?? Math.max(daysInMonth() - 21, 0))
    }));

    // 旧修正版で全員が「早番のみ可」に壊れた保存データだけを一度復旧する
    const allStaffsAreEarlyOnly =
      state.staffs.length >= 2 &&
      state.staffs.every(staff => staff.canEarly && !staff.canMiddle && !staff.canLate);

    if (allStaffsAreEarlyOnly && !data.earlyOnlyRecoveryApplied) {
      state.staffs = state.staffs.map(staff => ({
        ...staff,
        canMiddle: true,
        canLate: true
      }));
      state.earlyOnlyRecoveryApplied = true;
    }
    if (
      !state.monthlyShifts[previouslyOpenYearMonth] &&
      state.shifts &&
      Object.keys(state.shifts).length > 0
    ) {
      state.monthlyShifts[previouslyOpenYearMonth] = cloneShifts(state.shifts);
    }

    if (!state.monthlyStaffSettings[state.yearMonth]) {
      saveCurrentMonthStaffSettings();
    }
    loadMonthStaffSettings();
    loadMonthShifts();
    ensureCurrentMonthHolidayLimits();
  } catch {
    console.warn("保存データの読み込みに失敗しました");
  }
}

function daysInMonth() {
  const [year, month] = state.yearMonth.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

function getDayOfWeek(day) {
  const [year, month] = state.yearMonth.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

function isWeekend(day) {
  const w = getDayOfWeek(day);
  return w === 0 || w === 6;
}

function formatMonth() {
  const [year, month] = state.yearMonth.split("-");
  return `${Number(year)}年${Number(month)}月`;
}

function formatShiftTitle() {
  const store = state.storeName?.trim();

  if (store) {
    return `${formatMonth()} シフト表｜${store}`;
  }

  return `${formatMonth()} シフト表`;
}

function getSafeStoreFileName() {
  const store = state.storeName?.trim();

  if (!store) return "";

  return `_${store.replace(/[\\/:*?"<>|]/g, "")}`;
}

function getWeekKeyForDate(date, weekStart) {
  const copied = new Date(date);

  const currentDay = copied.getDay();
  const startDay = weekStart === "日曜起算" ? 0 : 1;

  let diff = currentDay - startDay;
  if (diff < 0) diff += 7;

  copied.setDate(copied.getDate() - diff);

  const y = copied.getFullYear();
  const m = String(copied.getMonth() + 1).padStart(2, "0");
  const d = String(copied.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function getWeekKey(day, weekStart) {
  const [year, month] = state.yearMonth.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return getWeekKeyForDate(date, weekStart);
}

function getWeekKeysInMonth(weekStart) {
  const keys = new Set();

  for (let d = 1; d <= daysInMonth(); d++) {
    keys.add(getWeekKey(d, weekStart || "月曜起算"));
  }

  return Array.from(keys);
}

function getPrevYearMonth() {
  const [year, month] = state.yearMonth.split("-").map(Number);
  const date = new Date(year, month - 2, 1);

  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");

  return `${y}-${m}`;
}

function countConfirmedPreviousMonthHolidaysInWeek(staff, weekKey) {
  const prevMonth = getPrevYearMonth();
  const confirmed = state.confirmedShifts?.[prevMonth];

  if (!confirmed) return 0;

  const prevStaff = confirmed.staffs.find(s => s.name === staff.name);
  if (!prevStaff) return 0;

  const prevShifts = confirmed.shifts?.[prevStaff.id];
  if (!prevShifts) return 0;

  const [year, month] = prevMonth.split("-").map(Number);
  const prevDays = new Date(year, month, 0).getDate();

  let count = 0;

  for (let d = 1; d <= prevDays; d++) {
    const date = new Date(year, month - 1, d);
    const currentWeekKey = getWeekKeyForDate(date, staff.weekStart || "月曜起算");

    if (currentWeekKey !== weekKey) continue;

    const shift = prevShifts[d];

    if (["休", "法休", "公休"].includes(shift)) {
      count++;
    }
  }

  return count;
}

function calculateHolidayDaysByStaffRule(staffLike) {
  const days = daysInMonth();
  const rule = staffLike.holidayRule || "個別設定";
  const weekStart = staffLike.weekStart || "月曜起算";

  if (rule === "週休2日" || rule === "完全週休2日") {
    let total = 0;

    getWeekKeysInMonth(weekStart).forEach(weekKey => {
      const prevCount = countConfirmedPreviousMonthHolidaysInWeek(staffLike, weekKey);
      total += Math.max(2 - prevCount, 0);
    });

    return total;
  }

  if (rule === "4週8休") {
    return Math.round(days * 8 / 28);
  }

  if (rule === "4週9休") {
    return Math.round(days * 9 / 28);
  }

  return null;
}

function applyHolidayRuleToDraft() {
  if (!state.draftStaff) return;

  const holidayDays = calculateHolidayDaysByStaffRule(state.draftStaff);

  if (holidayDays !== null) {
    state.draftStaff.holidayDays = holidayDays;
    state.draftStaff.workDays = daysInMonth() - holidayDays;
  }
}

function syncStaffDaysByRule() {
  state.staffs.forEach(staff => {
    if (staff.holidayRule && staff.holidayRule !== "個別設定") {
      const holidayDays = calculateHolidayDaysByStaffRule(staff);

      if (holidayDays !== null) {
        staff.holidayDays = holidayDays;
        staff.workDays = daysInMonth() - holidayDays;
      }
    }
  });
}

function changeMonth(diff) {
  // 現在月のシフトと出勤・休日数を保存してから月を切り替える
  saveCurrentMonthShifts();
  saveCurrentMonthStaffSettings();
  const previousMonthSettings = {};

  state.staffs.forEach(staff => {
    previousMonthSettings[staff.id] = {
      workDays: Number(staff.workDays),
      holidayDays: Number(staff.holidayDays)
    };
  });

  const [year, month] = state.yearMonth.split("-").map(Number);
  const date = new Date(year, month - 1 + diff, 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");

  state.yearMonth = `${y}-${m}`;

  // 保存済みの月ならその月の数値を復元。
  // 初めて開く月なら、前月の休日数を基準に新しい月の日数へ調整。
  loadMonthStaffSettings(previousMonthSettings);
  loadMonthShifts();
  ensureCurrentMonthHolidayLimits();

  save();
  render();
}

function setTab(tab) {
  state.activeTab = tab;
  save();
  render();
}

function openStaffModal() {
  state.modalOpen = true;
  state.modalMode = "add";
  state.editingStaffId = null;
  state.draftStaff = {
    name: "",
    employmentType: "正社員",
    canEarly: true,
    canMiddle: true,
    canLate: true,
    desiredHolidays: [],
    unavailableDays: [],
    workDays: 21,
    holidayDays: Math.max(daysInMonth() - 21, 0),
    holidayRule: "個別設定",
    weekStart: "月曜起算",
    maxConsecutiveWorkDays: 5
  };

  render();
}

function openEditStaffModal(id) {
  const staff = state.staffs.find(s => s.id === id);
  if (!staff) return;

  state.modalOpen = true;
  state.modalMode = "edit";
  state.editingStaffId = id;
  state.draftStaff = {
    name: staff.name,
    employmentType: staff.employmentType,
    canEarly: staff.canEarly,
    canMiddle: staff.canMiddle,
    canLate: staff.canLate,
    desiredHolidays: [...(staff.desiredHolidays || [])],
    unavailableDays: [...(staff.unavailableDays || [])],
    workDays: Number(staff.workDays),
    holidayDays: Number(staff.holidayDays),
    holidayRule: staff.holidayRule || "個別設定",
    weekStart: staff.weekStart || "月曜起算",
    maxConsecutiveWorkDays: staff.maxConsecutiveWorkDays ?? 5
  };

  render();
}

function closeStaffModal() {
  state.modalOpen = false;
  state.modalMode = "add";
  state.editingStaffId = null;
  state.draftStaff = null;
  render();
}

function updateDraft(key, value) {
  if (!state.draftStaff) return;

  if (key === "workDays") {
    const workDays = value === "" ? 0 : Number(value);
    state.draftStaff.workDays = workDays;
    state.draftStaff.holidayDays = Math.max(daysInMonth() - workDays, 0);
    return;
  }

  if (key === "holidayDays") {
    const holidayDays = value === "" ? 0 : Number(value);
    state.draftStaff.holidayDays = holidayDays;
    state.draftStaff.workDays = Math.max(daysInMonth() - holidayDays, 0);
    return;
  }

  if (key === "maxConsecutiveWorkDays") {
    state.draftStaff.maxConsecutiveWorkDays = value === "" ? null : Number(value);
    return;
  }

  if (key === "canEarly" || key === "canMiddle" || key === "canLate") {
    state.draftStaff[key] = Boolean(value);
    render();
    return;
  }

  state.draftStaff[key] = value;

  if (key === "holidayRule") {
    applyHolidayRuleToDraft();
    render();
    return;
  }

  if (key === "weekStart") {
    // 起算日の変更だけでは、設定済みの出勤日数・休日数を上書きしない
    render();
    return;
  }

  if (key === "employmentType") {
    render();
    return;
  }
}

function toggleDraftHoliday(day) {
  if (!state.draftStaff) return;

  const list = state.draftStaff.desiredHolidays;

  if (list.includes(day)) {
    state.draftStaff.desiredHolidays = list.filter(d => d !== day);
  } else {
    state.draftStaff.desiredHolidays.push(day);
    state.draftStaff.desiredHolidays.sort((a, b) => a - b);
  }

  render();
}

function toggleDraftUnavailableDay(day) {
  if (!state.draftStaff) return;

  if (!state.draftStaff.unavailableDays) {
    state.draftStaff.unavailableDays = [];
  }

  const list = state.draftStaff.unavailableDays;

  if (list.includes(day)) {
    state.draftStaff.unavailableDays = list.filter(d => d !== day);
  } else {
    state.draftStaff.unavailableDays.push(day);
    state.draftStaff.unavailableDays.sort((a, b) => a - b);
  }

  render();
}

function saveStaffFromModal() {
  const s = state.draftStaff;
  if (!s) return;

  if (!s.name.trim()) {
    alert("氏名を入力してください");
    return;
  }

  if (Number(s.workDays) + Number(s.holidayDays) !== daysInMonth()) {
    alert(`出勤日数 + 休日数を ${daysInMonth()}日にしてください`);
    return;
  }

  const fixedHolidays = [...new Set([...(s.desiredHolidays || []), ...(s.unavailableDays || [])])];

  if (fixedHolidays.length > Number(s.holidayDays)) {
    alert("希望休・勤務不可日が休日数より多いです");
    return;
  }

  if (!s.canEarly && !s.canMiddle && !s.canLate) {
    alert("勤務区分を最低1つ選択してください");
    return;
  }

  if (state.modalMode === "add") {
    const staff = {
      id: crypto.randomUUID(),
      name: s.name.trim(),
      employmentType: s.employmentType,
      canEarly: s.canEarly,
      canMiddle: s.canMiddle,
      canLate: s.canLate,
      desiredHolidays: [...(s.desiredHolidays || [])],
      unavailableDays: [...(s.unavailableDays || [])],
      workDays: Number(s.workDays),
      holidayDays: Number(s.holidayDays),
      holidayRule: s.holidayRule,
      weekStart: s.weekStart,
      maxConsecutiveWorkDays: s.maxConsecutiveWorkDays
    };

    state.staffs.push(staff);
    state.shifts[staff.id] = {};
  }

  if (state.modalMode === "edit") {
    const staff = state.staffs.find(staff => staff.id === state.editingStaffId);
    if (!staff) return;

    staff.name = s.name.trim();
    staff.employmentType = s.employmentType;
    staff.canEarly = s.canEarly;
    staff.canMiddle = s.canMiddle;
    staff.canLate = s.canLate;
    staff.desiredHolidays = [...(s.desiredHolidays || [])];
    staff.unavailableDays = [...(s.unavailableDays || [])];
    staff.workDays = Number(s.workDays);
    staff.holidayDays = Number(s.holidayDays);
    staff.holidayRule = s.holidayRule;
    staff.weekStart = s.weekStart;
    staff.maxConsecutiveWorkDays = s.maxConsecutiveWorkDays;
  }

  ensureShiftData();

  state.modalOpen = false;
  state.modalMode = "add";
  state.editingStaffId = null;
  state.draftStaff = null;

  save();
  render();
}

function deleteStaff(id) {
  if (!confirm("このスタッフを削除しますか？")) return;

    state.staffs = state.staffs.filter(s => s.id !== id);
  delete state.shifts[id];
  removeStaffFromAllMonthlyShifts(id);

  save();
  render();
}

function ensureShiftData() {
  const days = daysInMonth();

  state.staffs.forEach(staff => {
    if (!state.shifts[staff.id]) {
      state.shifts[staff.id] = {};
    }

    for (let d = 1; d <= days; d++) {
      if (!state.shifts[staff.id][d]) {
        state.shifts[staff.id][d] = "空";
      }
    }

    Object.keys(state.shifts[staff.id]).forEach(day => {
      if (Number(day) > days) {
        delete state.shifts[staff.id][day];
      }
    });
  });

}

function availableWorkTypes(staff) {
  const types = [];

  if (staff.canEarly) types.push("早");
  if (staff.canMiddle) types.push("中");
  if (staff.canLate) types.push("遅");

  return types;
}

function isNewStaffOnlyWorkShift(value) {
  return ["早", "中", "遅"].includes(value);
}

function isNewStaffOnlyHolidayShift(value) {
  return ["休", "法休", "公休"].includes(value);
}

function isNewStaffShiftEmpty(staffId) {
  ensureShiftData();

  for (let d = 1; d <= daysInMonth(); d++) {
    const shift = state.shifts[staffId]?.[d];

    if (shift && shift !== "空") {
      return false;
    }
  }

  return true;
}

function getDefaultShiftForNewStaff(staff) {
  const allowed = availableWorkTypes(staff);

  if (allowed.includes("中")) return "中";
  if (allowed.includes("早")) return "早";
  if (allowed.includes("遅")) return "遅";

  return "空";
}

function validateNewStaffBeforeGenerate(staff) {
  const days = daysInMonth();
  const desired = staff.desiredHolidays || [];
  const unavailable = staff.unavailableDays || [];
  const fixedHolidays = [...new Set([...desired, ...unavailable])];

  if (Number(staff.workDays) + Number(staff.holidayDays) !== days) {
    return `${staff.name} の出勤日数 + 休日数が月の日数と一致していません`;
  }

  if (fixedHolidays.length > Number(staff.holidayDays)) {
    return `${staff.name} の希望休・勤務不可日が休日数より多いです`;
  }

  if (availableWorkTypes(staff).length === 0) {
    return `${staff.name} の勤務可能区分がありません`;
  }

  return "";
}

function applyFixedHolidaysForNewStaff(staff) {
  const desired = staff.desiredHolidays || [];
  const unavailable = staff.unavailableDays || [];
  const fixedHolidays = [...new Set([...desired, ...unavailable])];

  fixedHolidays.forEach(day => {
    state.shifts[staff.id][day] = staff.employmentType === "正社員" ? "公休" : "休";
  });
}

function normalizeHolidayLabelsForNewStaff(staff) {
  const holidayDays = [];

  for (let d = 1; d <= daysInMonth(); d++) {
    if (isNewStaffOnlyHolidayShift(state.shifts[staff.id]?.[d])) {
      holidayDays.push(d);
    }
  }

  if (staff.employmentType === "正社員") {
    holidayDays.forEach((day, index) => {
      state.shifts[staff.id][day] = index === 0 ? "法休" : "公休";
    });
  } else {
    holidayDays.forEach(day => {
      state.shifts[staff.id][day] = "休";
    });
  }
}

function autoGenerateNewStaffOnly() {
  ensureShiftData();
  const generationWarnings = [];

  if (state.staffs.length === 0) {
    alert("スタッフが登録されていません");
    return;
  }

  const targetStaffs = state.staffs.filter(staff => isNewStaffShiftEmpty(staff.id));

  if (targetStaffs.length === 0) {
    alert("シフトが空の新規スタッフがいません。\nスタッフを追加した直後にこのボタンを押してください。");
    return;
  }

  for (const staff of targetStaffs) {
    const error = validateNewStaffBeforeGenerate(staff);

    if (error) {
      alert(error);
      return;
    }
  }

  const days = daysInMonth();

  targetStaffs.forEach(staff => {
    const defaultShift = getDefaultShiftForNewStaff(staff);

    for (let d = 1; d <= days; d++) {
      state.shifts[staff.id][d] = defaultShift;
    }

    applyFixedHolidaysForNewStaff(staff);
  });

  for (let d = 1; d <= days; d++) {
    const holidays = getHolidayCountOnDay(d);
    const limit = getHolidayLimitOnDay(d);
    if (holidays > limit) {
      alert(`${d}日は希望休・勤務不可日などの固定休だけで${holidays}人が休みです。休み上限${limit}人を超えています。`);
      return;
    }
  }

  for (const staff of targetStaffs) {
    let currentHolidayCount = countHolidayForStaff(staff.id);
    let needHoliday = Number(staff.holidayDays) - currentHolidayCount;

    while (needHoliday > 0) {
      const candidate = findBestHolidayDay(staff);

      if (!candidate) {
        generationWarnings.push(
          `${staff.name}：休日をあと${needHoliday}日配置できませんでした。`
        );
        break;
      }

      state.shifts[staff.id][candidate] = "休";
      needHoliday--;
    }
  }

  targetStaffs.forEach(staff => {
    normalizeHolidayLabelsForNewStaff(staff);
  });

  const assigned = assignNewStaffWorkTypesOnly(targetStaffs);

  if (!assigned.ok) {
    alert(assigned.message);
    return;
  }

  save();
  render();

  const warningMessage = generationWarnings.length > 0
    ? `\n\n休みをすべて配置できなかったスタッフがあります。\n${generationWarnings.join("\n")}\n検証パネルで不足内容を確認してください。`
    : "";

  alert(
    `新規スタッフ ${targetStaffs.length}名分のシフトを追加生成しました。\n既存スタッフのシフトは変更していません。` +
    warningMessage
  );
}

function assignNewStaffWorkTypesOnly(targetStaffs) {
  const days = daysInMonth();

  const counts = {};
  targetStaffs.forEach(staff => {
    counts[staff.id] = {
      early: 0,
      middle: 0,
      late: 0,
      total: 0
    };
  });

  for (let d = 1; d <= days; d++) {
    const targetWorkers = targetStaffs.filter(staff => {
      const shift = state.shifts[staff.id]?.[d];
      return isNewStaffOnlyWorkShift(shift);
    });

    targetWorkers.forEach(staff => {
      state.shifts[staff.id][d] = getDefaultShiftForNewStaff(staff);
    });

    const assignedOnDay = new Set();

    let earlyCount = getShiftCountOnDay(d, "早");

    while (earlyCount < Number(state.minEarly)) {
      const candidate = pickLowestScoreRandom(
        targetWorkers
          .filter(staff => staff.canEarly)
          .filter(staff => !assignedOnDay.has(staff.id)),
        staff => counts[staff.id].early * 100 + counts[staff.id].total
      );

      if (!candidate) {
        return {
          ok: false,
          message: `${d}日に早番可能な新規スタッフが足りません。`
        };
      }

      state.shifts[candidate.id][d] = "早";
      counts[candidate.id].early++;
      counts[candidate.id].total++;
      assignedOnDay.add(candidate.id);
      earlyCount++;
    }

    let lateCount = getShiftCountOnDay(d, "遅");

    if (lateCount > Number(state.maxLate)) {
      return {
        ok: false,
        message: `${d}日は既存シフトの遅番が${lateCount}人で、最大${state.maxLate}人を超えています。`
      };
    }

    while (lateCount < Number(state.minLate)) {
      if (lateCount >= Number(state.maxLate)) {
        return {
          ok: false,
          message: `${d}日は遅番の最低人数${state.minLate}人と最大人数${state.maxLate}人を両立できません。`
        };
      }
      const candidate = pickLowestScoreRandom(
        targetWorkers
          .filter(staff => staff.canLate)
          .filter(staff => !assignedOnDay.has(staff.id)),
        staff => counts[staff.id].late * 100 + counts[staff.id].total
      );

      if (!candidate) {
        return {
          ok: false,
          message: `${d}日に遅番可能な新規スタッフが足りません。`
        };
      }

      state.shifts[candidate.id][d] = "遅";
      counts[candidate.id].late++;
      counts[candidate.id].total++;
      assignedOnDay.add(candidate.id);
      lateCount++;
    }

    targetWorkers.forEach(staff => {
      if (assignedOnDay.has(staff.id)) return;

      const allowed = availableWorkTypes(staff);

      if (allowed.includes("中")) {
        state.shifts[staff.id][d] = "中";
        counts[staff.id].middle++;
        counts[staff.id].total++;
        return;
      }

      if (allowed.includes("早") && allowed.includes("遅")) {
        if (
          counts[staff.id].early <= counts[staff.id].late ||
          getShiftCountOnDay(d, "遅") >= Number(state.maxLate)
        ) {
          state.shifts[staff.id][d] = "早";
          counts[staff.id].early++;
        } else {
          state.shifts[staff.id][d] = "遅";
          counts[staff.id].late++;
        }

        counts[staff.id].total++;
        return;
      }

      if (allowed.includes("早")) {
        state.shifts[staff.id][d] = "早";
        counts[staff.id].early++;
        counts[staff.id].total++;
        return;
      }

      if (allowed.includes("遅")) {
        if (getShiftCountOnDay(d, "遅") >= Number(state.maxLate)) {
          state.shifts[staff.id][d] = "空";
          return;
        }
        state.shifts[staff.id][d] = "遅";
        counts[staff.id].late++;
        counts[staff.id].total++;
        return;
      }

      state.shifts[staff.id][d] = "空";
    });
  }

  return {
    ok: true,
    message: ""
  };
}

function shuffleList(list) {
  const result = [...list];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function pickLowestScoreRandom(list, scoreFn) {
  if (list.length === 0) return null;

  return list
    .map(item => ({
      item,
      score: scoreFn(item),
      random: Math.random()
    }))
    .sort((a, b) => a.score - b.score || a.random - b.random)[0].item;
}

function getActualMaxConsecutiveWorkDays(staffId) {
  let current = 0;
  let maximum = 0;

  for (let day = 1; day <= daysInMonth(); day++) {
    const shift = state.shifts[staffId]?.[day];

    if (["早", "中", "遅"].includes(shift)) {
      current++;
      maximum = Math.max(maximum, current);
    } else {
      current = 0;
    }
  }

  return maximum;
}

function evaluateHolidayPlacement() {
  const warnings = [];
  let missingHolidayCount = 0;
  let consecutiveExcess = 0;
  let holidayLimitExcess = 0;

  state.staffs.forEach(staff => {
    const holidays = countHolidayForStaff(staff.id);
    const missing = Math.max(0, Number(staff.holidayDays) - holidays);

    if (missing > 0) {
      missingHolidayCount += missing;
      warnings.push(`${staff.name}：休日をあと${missing}日配置できませんでした。`);
    }

    const configuredMax = Number(staff.maxConsecutiveWorkDays);
    const actualMax = getActualMaxConsecutiveWorkDays(staff.id);

    if (configuredMax > 0 && actualMax > configuredMax) {
      consecutiveExcess += actualMax - configuredMax;
      warnings.push(`${staff.name}：最大${configuredMax}連勤の設定に対して${actualMax}連勤があります。`);
    }
  });

  for (let day = 1; day <= daysInMonth(); day++) {
    const holidays = getHolidayCountOnDay(day);
    const limit = getHolidayLimitOnDay(day);

    if (holidays > limit) {
      const excess = holidays - limit;
      holidayLimitExcess += excess;
      warnings.push(`${day}日：休み人数が上限${limit}人を${excess}人超えています。`);
    }
  }

  return {
    warnings,
    missingHolidayCount,
    consecutiveExcess,
    holidayLimitExcess,
    score:
      missingHolidayCount * 100000 +
      consecutiveExcess * 10000 +
      holidayLimitExcess * 100
  };
}

function repairLegacyEarlyOnlyWorkTypes() {
  const allStaffsAreEarlyOnly =
    state.staffs.length >= 2 &&
    state.staffs.every(
      staff => staff.canEarly && !staff.canMiddle && !staff.canLate
    );

  if (!allStaffsAreEarlyOnly) return false;

  state.staffs.forEach(staff => {
    staff.canMiddle = true;
    staff.canLate = true;
  });

  return true;
}

function canStaffWorkShift(staff, shift) {
  if (shift === "早") return Boolean(staff.canEarly);
  if (shift === "中") return Boolean(staff.canMiddle);
  if (shift === "遅") return Boolean(staff.canLate);
  return false;
}

function isFixedHolidayForStaff(staff, day) {
  return (
    (staff.desiredHolidays || []).includes(day) ||
    (staff.unavailableDays || []).includes(day)
  );
}

function tryCreateDifferentSchedulePattern(previousSignature) {
  if (!previousSignature || state.staffs.length < 2) return false;

  const days = Array.from(
    { length: daysInMonth() },
    (_, index) => index + 1
  );
  const staffs = shuffleList(state.staffs);

  for (const firstStaff of staffs) {
    for (const secondStaff of shuffleList(staffs)) {
      if (firstStaff.id === secondStaff.id) continue;

      const firstWeeklyErrorsBefore =
        validateWeeklyHolidayRule(firstStaff).length;
      const secondWeeklyErrorsBefore =
        validateWeeklyHolidayRule(secondStaff).length;

      const firstRestDays = shuffleList(days).filter(day => {
        const firstShift = state.shifts[firstStaff.id]?.[day];
        const secondShift = state.shifts[secondStaff.id]?.[day];
        return (
          ["休", "法休", "公休"].includes(firstShift) &&
          !isFixedHolidayForStaff(firstStaff, day) &&
          canStaffWorkShift(firstStaff, secondShift)
        );
      });

      const secondRestDays = shuffleList(days).filter(day => {
        const firstShift = state.shifts[firstStaff.id]?.[day];
        const secondShift = state.shifts[secondStaff.id]?.[day];
        return (
          ["休", "法休", "公休"].includes(secondShift) &&
          !isFixedHolidayForStaff(secondStaff, day) &&
          canStaffWorkShift(secondStaff, firstShift)
        );
      });

      for (const firstRestDay of firstRestDays) {
        for (const secondRestDay of secondRestDays) {
          if (firstRestDay === secondRestDay) continue;

          const originalFirstRest =
            state.shifts[firstStaff.id][firstRestDay];
          const originalSecondWork =
            state.shifts[secondStaff.id][firstRestDay];
          const originalFirstWork =
            state.shifts[firstStaff.id][secondRestDay];
          const originalSecondRest =
            state.shifts[secondStaff.id][secondRestDay];

          state.shifts[firstStaff.id][firstRestDay] =
            originalSecondWork;
          state.shifts[secondStaff.id][firstRestDay] = "休";
          state.shifts[firstStaff.id][secondRestDay] = "休";
          state.shifts[secondStaff.id][secondRestDay] =
            originalFirstWork;

          const firstMax = Number(
            firstStaff.maxConsecutiveWorkDays
          );
          const secondMax = Number(
            secondStaff.maxConsecutiveWorkDays
          );
          const consecutiveOk =
            (!firstMax ||
              getActualMaxConsecutiveWorkDays(firstStaff.id) <=
                firstMax) &&
            (!secondMax ||
              getActualMaxConsecutiveWorkDays(secondStaff.id) <=
                secondMax);
          const weeklyRulesOk =
            validateWeeklyHolidayRule(firstStaff).length <=
              firstWeeklyErrorsBefore &&
            validateWeeklyHolidayRule(secondStaff).length <=
              secondWeeklyErrorsBefore;

          if (
            consecutiveOk &&
            weeklyRulesOk &&
            JSON.stringify(state.shifts) !== previousSignature
          ) {
            normalizeHolidayLabelsForNewStaff(firstStaff);
            normalizeHolidayLabelsForNewStaff(secondStaff);
            return true;
          }

          state.shifts[firstStaff.id][firstRestDay] =
            originalFirstRest;
          state.shifts[secondStaff.id][firstRestDay] =
            originalSecondWork;
          state.shifts[firstStaff.id][secondRestDay] =
            originalFirstWork;
          state.shifts[secondStaff.id][secondRestDay] =
            originalSecondRest;
        }
      }
    }
  }

  return false;
}

function autoGenerate() {
  ensureShiftData();

  const days = daysInMonth();
  const recoveredWorkTypes = repairLegacyEarlyOnlyWorkTypes();
  state.monthlyLastGeneratedShifts =
    state.monthlyLastGeneratedShifts || {};
  const existingHasShiftData = state.staffs.some(staff => {
    for (let day = 1; day <= days; day++) {
      const shift = state.shifts[staff.id]?.[day];
      if (shift && shift !== "空") return true;
    }
    return false;
  });
  const previousGeneratedShifts = existingHasShiftData
    ? cloneShifts(state.shifts)
    : cloneShifts(
        state.monthlyLastGeneratedShifts[state.yearMonth]
      );
  const previousGeneratedSignature = JSON.stringify(
    previousGeneratedShifts
  );

  for (const staff of state.staffs) {
    const desired = staff.desiredHolidays || [];
    const unavailable = staff.unavailableDays || [];
    const fixedHolidays = [...new Set([...desired, ...unavailable])];

    if (Number(staff.workDays) + Number(staff.holidayDays) !== days) {
      alert(`${staff.name} の出勤日数 + 休日数が月の日数と一致していません`);
      return;
    }

    if (fixedHolidays.length > Number(staff.holidayDays)) {
      alert(`${staff.name} の希望休・勤務不可日が休日数より多いです`);
      return;
    }

    if (availableWorkTypes(staff).length === 0) {
      alert(`${staff.name} の勤務可能区分がありません`);
      return;
    }
  }

  const prepareBaseSchedule = () => {
    state.staffs.forEach(staff => {
      const allowed = availableWorkTypes(staff);
      const defaultShift = allowed.includes("中") ? "中" : allowed[0];

      for (let day = 1; day <= days; day++) {
        state.shifts[staff.id][day] = defaultShift;
      }

      const desired = staff.desiredHolidays || [];
      const unavailable = staff.unavailableDays || [];
      const fixedHolidays = [...new Set([...desired, ...unavailable])];

      fixedHolidays.forEach(day => {
        state.shifts[staff.id][day] =
          staff.employmentType === "正社員" ? "公休" : "休";
      });
    });
  };

  prepareBaseSchedule();

  for (let day = 1; day <= days; day++) {
    const holidays = getHolidayCountOnDay(day);
    const limit = getHolidayLimitOnDay(day);

    if (holidays > limit) {
      alert(`${day}日は希望休・勤務不可日などの固定休だけで${holidays}人が休みです。休み上限${limit}人を超えています。`);
      return;
    }

    const workers = getWorkerCountOnDay(day);
    const required = getRequiredPeople(day);

    if (workers < required) {
      alert(`${day}日は希望休・勤務不可日だけで必要人数を下回ります。`);
      return;
    }
  }

  let bestShifts = null;
  let bestResult = null;
  const attemptCount = Math.max(60, Math.min(180, state.staffs.length * 18));
  const totalRequestedHolidays = state.staffs.reduce(
    (total, staff) => total + Number(staff.holidayDays),
    0
  );
  const totalHolidayCapacityWithinLimits = Array.from(
    { length: days },
    (_, index) => {
      const day = index + 1;
      const staffingCapacity = Math.max(
        0,
        state.staffs.length - getRequiredPeople(day)
      );
      return Math.min(getHolidayLimitOnDay(day), staffingCapacity);
    }
  ).reduce((total, capacity) => total + capacity, 0);
  const minimumNecessaryHolidayLimitOverflow = Math.max(
    0,
    totalRequestedHolidays - totalHolidayCapacityWithinLimits
  );

  const runGenerationAttempts = (
    allowHolidayLimitOverflow,
    attempts,
    acceptableHolidayLimitOverflow
  ) => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      prepareBaseSchedule();

      const staffOrder = shuffleList(state.staffs).sort((a, b) => {
        const aMax = Number(a.maxConsecutiveWorkDays) || 999;
        const bMax = Number(b.maxConsecutiveWorkDays) || 999;
        return aMax - bMax;
      });

      for (const staff of staffOrder) {
        let needHoliday =
          Number(staff.holidayDays) - countHolidayForStaff(staff.id);

        while (needHoliday > 0) {
          const candidate = findBestHolidayDay(staff, {
            allowHolidayLimitOverflow
          });
          if (!candidate) break;

          state.shifts[staff.id][candidate] = "休";
          needHoliday--;
        }
      }

      const result = evaluateHolidayPlacement();

      if (!bestResult || result.score < bestResult.score) {
        bestResult = result;
        bestShifts = cloneShifts(state.shifts);
      }

      if (
        result.missingHolidayCount === 0 &&
        result.consecutiveExcess === 0 &&
        result.holidayLimitExcess <= acceptableHolidayLimitOverflow
      ) {
        bestResult = result;
        bestShifts = cloneShifts(state.shifts);
        return true;
      }
    }

    return false;
  };

  const generatedWithinHolidayLimits =
    minimumNecessaryHolidayLimitOverflow === 0 &&
    runGenerationAttempts(false, attemptCount, 0);

  if (
    !generatedWithinHolidayLimits &&
    (
      !bestResult ||
      bestResult.missingHolidayCount > 0 ||
      bestResult.consecutiveExcess > 0
    )
  ) {
    runGenerationAttempts(
      true,
      Math.max(50, Math.floor(attemptCount * 0.75)),
      minimumNecessaryHolidayLimitOverflow
    );
  }

  if (bestShifts) {
    state.shifts = bestShifts;
  }

  state.staffs.forEach(staff => {
    const holidayDays = [];

    for (let day = 1; day <= days; day++) {
      if (["休", "法休", "公休"].includes(state.shifts[staff.id][day])) {
        holidayDays.push(day);
      }
    }

    if (staff.employmentType === "正社員") {
      holidayDays.forEach((day, index) => {
        state.shifts[staff.id][day] = index === 0 ? "法休" : "公休";
      });
    } else {
      holidayDays.forEach(day => {
        state.shifts[staff.id][day] = "休";
      });
    }
  });

  const assigned = assignBalancedWorkShifts();

  if (!assigned.ok) {
    alert(assigned.message);
    return;
  }

  if (
    previousGeneratedSignature !== "{}" &&
    JSON.stringify(state.shifts) === previousGeneratedSignature
  ) {
    tryCreateDifferentSchedulePattern(previousGeneratedSignature);
  }

  state.monthlyLastGeneratedShifts[state.yearMonth] =
    cloneShifts(state.shifts);

  save();
  render();

  const generationWarnings = bestResult?.warnings || [];

  if (generationWarnings.length > 0) {
    alert(
      `条件を満たす候補を探し、最も近いシフトを仮生成しました。\n` +
      `遅番を含む勤務区分は配置されています。\n\n` +
      `${generationWarnings.join("\n")}\n\n` +
      `日別の休み上限・必要人数・休日数の組み合わせを確認してください。`
    );
  } else if (recoveredWorkTypes) {
    alert(
      `保存済みデータが全員「早番のみ可」になっていたため、` +
      `通常勤務・遅番も可能な状態へ復旧して生成しました。`
    );
  }
}

function assignBalancedWorkShifts() {
  const days = daysInMonth();

  const counts = {};
  state.staffs.forEach(staff => {
    counts[staff.id] = {
      early: 0,
      middle: 0,
      late: 0,
      total: 0
    };
  });

  for (let d = 1; d <= days; d++) {
    const workers = state.staffs.filter(staff => {
      const shift = state.shifts[staff.id]?.[d];
      return ["早", "中", "遅"].includes(shift);
    });

    if (Number(state.maxLate) < Number(state.minLate)) {
      return {
        ok: false,
        message: `遅番最大人数は、遅番最低人数${state.minLate}人以上に設定してください。`
      };
    }

    if (workers.length < Number(state.minEarly) + Number(state.minLate)) {
      return {
        ok: false,
        message: `${d}日は出勤人数が少なく、早番${state.minEarly}人・遅番${state.minLate}人を配置できません。`
      };
    }

    workers.forEach(staff => {
      const allowed = availableWorkTypes(staff);
      state.shifts[staff.id][d] = allowed.includes("中") ? "中" : allowed[0];
    });

    const mandatoryLateCount = getShiftCountOnDay(d, "遅");
    if (mandatoryLateCount > Number(state.maxLate)) {
      return {
        ok: false,
        message: `${d}日は遅番のみ可能なスタッフが${mandatoryLateCount}人おり、遅番最大${state.maxLate}人を超えます。`
      };
    }

    const earlyAssigned = [];

    for (let i = 0; i < Number(state.minEarly); i++) {
      const candidate = pickLowestScoreRandom(
        workers
          .filter(staff => staff.canEarly)
          .filter(staff => !earlyAssigned.includes(staff.id)),
        staff => counts[staff.id].early * 100 + counts[staff.id].total
      );

      if (!candidate) {
        return {
          ok: false,
          message: `${d}日に早番可能なスタッフが足りません。`
        };
      }

      state.shifts[candidate.id][d] = "早";
      counts[candidate.id].early++;
      counts[candidate.id].total++;
      earlyAssigned.push(candidate.id);
    }

    const lateAssigned = [];

    for (let i = 0; i < Number(state.minLate); i++) {
      const candidate = pickLowestScoreRandom(
        workers
          .filter(staff => staff.canLate)
          .filter(staff => !earlyAssigned.includes(staff.id))
          .filter(staff => !lateAssigned.includes(staff.id)),
        staff => counts[staff.id].late * 100 + counts[staff.id].total
      );

      if (!candidate) {
        return {
          ok: false,
          message: `${d}日に遅番可能なスタッフが足りません。`
        };
      }

      state.shifts[candidate.id][d] = "遅";
      counts[candidate.id].late++;
      counts[candidate.id].total++;
      lateAssigned.push(candidate.id);
    }

    workers.forEach(staff => {
      if (earlyAssigned.includes(staff.id) || lateAssigned.includes(staff.id)) return;

      const allowed = availableWorkTypes(staff);

      if (allowed.includes("中")) {
        state.shifts[staff.id][d] = "中";
        counts[staff.id].middle++;
        counts[staff.id].total++;
        return;
      }

      if (allowed.includes("早") && allowed.includes("遅")) {
        if (
          counts[staff.id].early <= counts[staff.id].late ||
          getShiftCountOnDay(d, "遅") >= Number(state.maxLate)
        ) {
          state.shifts[staff.id][d] = "早";
          counts[staff.id].early++;
        } else {
          state.shifts[staff.id][d] = "遅";
          counts[staff.id].late++;
        }

        counts[staff.id].total++;
        return;
      }

      if (allowed.includes("早")) {
        state.shifts[staff.id][d] = "早";
        counts[staff.id].early++;
        counts[staff.id].total++;
        return;
      }

      if (allowed.includes("遅")) {
        if (getShiftCountOnDay(d, "遅") >= Number(state.maxLate)) {
          state.shifts[staff.id][d] = "空";
          return;
        }
        state.shifts[staff.id][d] = "遅";
        counts[staff.id].late++;
        counts[staff.id].total++;
        return;
      }

      state.shifts[staff.id][d] = "空";
    });
  }

  return {
    ok: true,
    message: ""
  };
}

function getWorkerCountOnDay(day) {
  let count = 0;

  state.staffs.forEach(staff => {
    const shift = state.shifts[staff.id]?.[day];

    if (["早", "中", "遅"].includes(shift)) {
      count++;
    }
  });

  return count;
}

function getShiftCountOnDay(day, targetShift) {
  let count = 0;

  state.staffs.forEach(staff => {
    const shift = state.shifts[staff.id]?.[day];

    if (shift === targetShift) {
      count++;
    }
  });

  return count;
}

function countHolidayForStaff(staffId) {
  let count = 0;

  for (let d = 1; d <= daysInMonth(); d++) {
    const shift = state.shifts[staffId]?.[d];

    if (["休", "法休", "公休"].includes(shift)) {
      count++;
    }
  }

  return count;
}

function getHolidayCountOnDay(day) {
  let count = 0;

  state.staffs.forEach(staff => {
    const shift = state.shifts[staff.id]?.[day];

    if (["休", "法休", "公休"].includes(shift)) {
      count++;
    }
  });

  return count;
}

function isWeeklyTwoHolidayRule(staff) {
  return staff.holidayRule === "週休2日" || staff.holidayRule === "完全週休2日";
}

function getRequiredWeeklyHolidays(staff) {
  if (isWeeklyTwoHolidayRule(staff)) {
    return 2;
  }

  return 0;
}

function getWeekHolidayCountForStaff(staff, weekKey) {
  let count = 0;

  count += countConfirmedPreviousMonthHolidaysInWeek(staff, weekKey);

  for (let d = 1; d <= daysInMonth(); d++) {
    const key = getWeekKey(d, staff.weekStart || "月曜起算");

    if (key !== weekKey) continue;

    const shift = state.shifts[staff.id]?.[d];

    if (["休", "法休", "公休"].includes(shift)) {
      count++;
    }
  }

  return count;
}

function countHolidayStreakIfRest(staff, targetDay) {
  const days = daysInMonth();
  let streak = 0;
  let maxStreak = 0;

  for (let d = 1; d <= days; d++) {
    const shift = d === targetDay ? "休" : state.shifts[staff.id]?.[d];

    if (["休", "法休", "公休"].includes(shift)) {
      streak++;
      maxStreak = Math.max(maxStreak, streak);
    } else {
      streak = 0;
    }
  }

  return maxStreak;
}

function findBestHolidayDay(staff, options = {}) {
  const days = daysInMonth();
  const candidates = [];
  const beforePenalty = calculateStaffConstraintPenalty(staff);
  const allowHolidayLimitOverflow =
    Boolean(options.allowHolidayLimitOverflow);

  for (let d = 1; d <= days; d++) {
    const current = state.shifts[staff.id][d];

    if (["休", "法休", "公休"].includes(current)) {
      continue;
    }

    const workers = getWorkerCountOnDay(d);
    const required = getRequiredPeople(d);

    if (workers - 1 < required) {
      continue;
    }

    const currentHolidayCount = getHolidayCountOnDay(d);
    const holidayLimit = getHolidayLimitOnDay(d);

    if (
      !allowHolidayLimitOverflow &&
      currentHolidayCount >= holidayLimit
    ) {
      continue;
    }

    const weekKey = getWeekKey(d, staff.weekStart || "月曜起算");
    const weekHolidayCount = getWeekHolidayCountForStaff(staff, weekKey);

    if (isWeeklyTwoHolidayRule(staff) && weekHolidayCount >= 2) {
      continue;
    }

    state.shifts[staff.id][d] = "休";
    const afterPenalty = calculateStaffConstraintPenalty(staff);
    state.shifts[staff.id][d] = current;

    let score = 0;

    score += (beforePenalty - afterPenalty) * 100;

    if (isWeeklyTwoHolidayRule(staff)) {
      const shortage = 2 - weekHolidayCount;
      score += shortage * 80;
    }

    score -= currentHolidayCount * 5;

    if (allowHolidayLimitOverflow && currentHolidayCount >= holidayLimit) {
      score -= (currentHolidayCount - holidayLimit + 1) * 5000;
    }

    const holidayStreak = countHolidayStreakIfRest(staff, d);

    if (holidayStreak === 2) score -= 20;
    if (holidayStreak >= 3) score -= 120;
    if (holidayStreak >= 4) score -= 300;

    const totalDays = daysInMonth();
    const isEnd = d > totalDays - Number(state.monthEndDays);

    if (state.monthEndMode && isEnd) {
      score -= 3;
    }

    candidates.push({
      day: d,
      score,
      random: Math.random()
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => b.score - a.score || a.random - b.random);

  const bestScore = candidates[0].score;
  const topCandidates = candidates
    .filter(candidate => candidate.score >= bestScore - 40)
    .slice(0, 8);
  const selected =
    topCandidates[Math.floor(Math.random() * topCandidates.length)];

  return selected.day;
}

function calculateStaffConstraintPenalty(staff) {
  let penalty = 0;
  const days = daysInMonth();

  const maxConsecutive = Number(staff.maxConsecutiveWorkDays);

  if (maxConsecutive) {
    let consecutive = 0;

    for (let d = 1; d <= days; d++) {
      const shift = state.shifts[staff.id]?.[d];

      if (["早", "中", "遅"].includes(shift)) {
        consecutive++;

        if (consecutive > maxConsecutive) {
          penalty += (consecutive - maxConsecutive) * 30;
        }
      } else {
        consecutive = 0;
      }
    }
  }

  const weeks = {};

  for (let d = 1; d <= days; d++) {
    const key = getWeekKey(d, staff.weekStart || "月曜起算");

    if (!weeks[key]) {
      weeks[key] = {
        holiday: countConfirmedPreviousMonthHolidaysInWeek(staff, key)
      };
    }

    const shift = state.shifts[staff.id]?.[d];

    if (["休", "法休", "公休"].includes(shift)) {
      weeks[key].holiday++;
    }
  }

  Object.values(weeks).forEach(week => {
    const required = getRequiredWeeklyHolidays(staff);

    if (required > 0) {
      if (week.holiday < required) {
        penalty += (required - week.holiday) * 30;
      }

      if (week.holiday > required) {
        penalty += (week.holiday - required) * 30;
      }
    }
  });

  return penalty;
}

function cycleShift(staffId, day) {
  const current = state.shifts[staffId][day] || "空";
  const index = SHIFT_TYPES.indexOf(current);

  state.shifts[staffId][day] = SHIFT_TYPES[(index + 1) % SHIFT_TYPES.length];

  save();
  render();

  const next = state.shifts[staffId][day];
  if (next === "遅" && getShiftCountOnDay(day, "遅") > Number(state.maxLate)) {
    alert(`${day}日の遅番が最大${state.maxLate}人を超えています。検証パネルを確認してください。`);
  }
  if (["休", "法休", "公休"].includes(next) && getHolidayCountOnDay(day) > getHolidayLimitOnDay(day)) {
    alert(`${day}日の休み人数が上限${getHolidayLimitOnDay(day)}人を超えています。検証パネルを確認してください。`);
  }
}

function countStaff(staffId) {
  const days = daysInMonth();

  const result = {
    work: 0,
    holiday: 0,
    legal: 0,
    publicHoliday: 0,
    early: 0,
    middle: 0,
    late: 0
  };

  for (let d = 1; d <= days; d++) {
    const v = state.shifts[staffId]?.[d];

    if (["早", "中", "遅"].includes(v)) result.work++;
    if (["休", "法休", "公休"].includes(v)) result.holiday++;
    if (v === "法休") result.legal++;
    if (v === "公休") result.publicHoliday++;
    if (v === "早") result.early++;
    if (v === "中") result.middle++;
    if (v === "遅") result.late++;
  }

  return result;
}

function getRequiredPeople(day) {
  const totalDays = daysInMonth();
  const isEnd = day > totalDays - Number(state.monthEndDays);

  if (state.monthEndMode && isEnd) {
    return Number(state.monthEndMin);
  }

  if (state.weekendMode && isWeekend(day)) {
    return Number(state.minWeekend);
  }

  return Number(state.minWeekday);
}

function validateWeeklyHolidayRule(staff) {
  const errors = [];
  const weeks = {};

  for (let d = 1; d <= daysInMonth(); d++) {
    const key = getWeekKey(d, staff.weekStart || "月曜起算");

    if (!weeks[key]) {
      weeks[key] = {
        holiday: countConfirmedPreviousMonthHolidaysInWeek(staff, key)
      };
    }

    const shift = state.shifts[staff.id]?.[d];

    if (["休", "法休", "公休"].includes(shift)) {
      weeks[key].holiday++;
    }
  }

  Object.entries(weeks).forEach(([week, count]) => {
    if (staff.holidayRule === "週休2日" && count.holiday !== 2) {
      errors.push(`${staff.name}：${week}週の休日が${count.holiday}日です。前月確定分を含めて週2日必要です。`);
    }

    if (staff.holidayRule === "完全週休2日" && count.holiday !== 2) {
      errors.push(`${staff.name}：${week}週の休日が${count.holiday}日です。前月確定分を含めて週2日必要です。`);
    }
  });

  return errors;
}

function validate() {
  const errors = [];
  const days = daysInMonth();

  state.staffs.forEach(staff => {
    const c = countStaff(staff.id);

    if (c.work !== staff.workDays) {
      errors.push(`${staff.name}：出勤日数が${c.work}日です。設定は${staff.workDays}日です。`);
    }

    if (c.holiday !== staff.holidayDays) {
      errors.push(`${staff.name}：休日数が${c.holiday}日です。設定は${staff.holidayDays}日です。`);
    }

    if (staff.workDays + staff.holidayDays !== days) {
      errors.push(`${staff.name}：出勤日数 + 休日数が${days}日になっていません。`);
    }

    (staff.desiredHolidays || []).forEach(day => {
      const shift = state.shifts[staff.id]?.[day];

      if (!["休", "法休", "公休"].includes(shift)) {
        errors.push(`${staff.name}：${day}日の希望休が反映されていません。`);
      }
    });

    (staff.unavailableDays || []).forEach(day => {
      const shift = state.shifts[staff.id]?.[day];

      if (!["休", "法休", "公休"].includes(shift)) {
        errors.push(`${staff.name}：${day}日の勤務不可日が休みになっていません。`);
      }
    });

    for (let d = 1; d <= days; d++) {
      const shift = state.shifts[staff.id]?.[d];

      if (shift === "早" && !staff.canEarly) {
        errors.push(`${staff.name}：${d}日に早番不可なのに早番が入っています。`);
      }

      if (shift === "中" && !staff.canMiddle) {
        errors.push(`${staff.name}：${d}日に通常勤務不可なのに通常勤務が入っています。`);
      }

      if (shift === "遅" && !staff.canLate) {
        errors.push(`${staff.name}：${d}日に遅番不可なのに遅番が入っています。`);
      }
    }

    const maxConsecutive = staff.maxConsecutiveWorkDays;

    if (maxConsecutive) {
      let consecutive = 0;

      for (let d = 1; d <= days; d++) {
        const shift = state.shifts[staff.id]?.[d];

        if (["早", "中", "遅"].includes(shift)) {
          consecutive++;

          if (consecutive > maxConsecutive) {
            errors.push(`${staff.name}：${d}日時点で${consecutive}連勤です。最大連勤は${maxConsecutive}日です。`);
          }
        } else {
          consecutive = 0;
        }
      }
    }

    errors.push(...validateWeeklyHolidayRule(staff));

    if (staff.employmentType === "正社員" && c.legal === 0 && c.holiday > 0) {
      errors.push(`${staff.name}：正社員ですが法休がありません。`);
    }
  });

  for (let d = 1; d <= days; d++) {
    const workers = getWorkerCountOnDay(d);
    const required = getRequiredPeople(d);
    const early = getShiftCountOnDay(d, "早");
    const late = getShiftCountOnDay(d, "遅");

    if (workers < required) {
      errors.push(`${d}日：出勤人数が${workers}人です。必要人数は${required}人です。`);
    }

    if (workers > 0 && early < Number(state.minEarly)) {
      errors.push(`${d}日：早番が${early}人です。最低${state.minEarly}人必要です。`);
    }

    if (workers > 0 && late < Number(state.minLate)) {
      errors.push(`${d}日：遅番が${late}人です。最低${state.minLate}人必要です。`);
    }

    if (late > Number(state.maxLate)) {
      errors.push(`${d}日：遅番が${late}人です。最大${state.maxLate}人までです。`);
    }

    const holidays = getHolidayCountOnDay(d);
    const holidayLimit = getHolidayLimitOnDay(d);
    if (holidays > holidayLimit) {
      errors.push(`${d}日：休みが${holidays}人です。この日の上限は${holidayLimit}人です。`);
    }
  }

  return errors;
}

function printShiftTable() {
  document.body.classList.add("print-shift-only");
  window.print();

  setTimeout(() => {
    document.body.classList.remove("print-shift-only");
  }, 500);
}

async function saveShiftImage() {
  const area = document.querySelector(".print-area");

  if (!area) {
    alert("保存できるシフト表がありません");
    return;
  }

  if (typeof html2canvas === "undefined") {
    alert("画像保存ライブラリの読み込みに失敗しました。index.htmlにhtml2canvasのscriptを追加してください。");
    return;
  }

  try {
    document.body.classList.add("image-save-mode");

    const clone = area.cloneNode(true);

    clone.querySelectorAll(".no-print").forEach(el => el.remove());

    const tableWrap = clone.querySelector(".shift-table-wrap.improved");
    const table = clone.querySelector(".improved-table");

    if (tableWrap) {
      tableWrap.style.overflow = "visible";
      tableWrap.style.width = "max-content";
      tableWrap.style.minWidth = "max-content";
      tableWrap.style.maxWidth = "none";
    }

    if (table) {
      table.style.width = "max-content";
      table.style.minWidth = "max-content";
      table.style.maxWidth = "none";
      table.style.tableLayout = "auto";
      table.style.borderCollapse = "collapse";
    }

    clone.querySelectorAll(".sticky-name").forEach(cell => {
      cell.style.position = "static";
      cell.style.left = "auto";
      cell.style.boxShadow = "none";
    });

    clone.style.width = "max-content";
    clone.style.minWidth = "max-content";
    clone.style.maxWidth = "none";
    clone.style.overflow = "visible";
    clone.style.boxShadow = "none";
    clone.style.background = "#ffffff";

    const wrapper = document.createElement("div");
    wrapper.className = "image-capture-wrapper";
    wrapper.style.position = "fixed";
    wrapper.style.left = "0";
    wrapper.style.top = "0";
    wrapper.style.zIndex = "-1";
    wrapper.style.background = "#ffffff";
    wrapper.style.padding = "24px";
    wrapper.style.overflow = "visible";
    wrapper.style.width = "max-content";
    wrapper.style.minWidth = "max-content";

    wrapper.appendChild(clone);
    document.body.appendChild(wrapper);

    await new Promise(resolve => setTimeout(resolve, 150));

    const rect = wrapper.getBoundingClientRect();
    const captureWidth = Math.ceil(rect.width) + 60;
    const captureHeight = Math.ceil(rect.height) + 60;

    const canvas = await html2canvas(wrapper, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
      scrollX: 0,
      scrollY: 0,
      width: captureWidth,
      height: captureHeight,
      windowWidth: captureWidth + 120,
      windowHeight: captureHeight + 120
    });

    document.body.removeChild(wrapper);
    document.body.classList.remove("image-save-mode");

    const url = canvas.toDataURL("image/png");

    const a = document.createElement("a");
    a.href = url;
    a.download = `Rmobile_シフト表_${state.yearMonth}${getSafeStoreFileName()}.png`;
    a.click();
  } catch (error) {
    const wrapper = document.querySelector(".image-capture-wrapper");
    if (wrapper) wrapper.remove();

    document.body.classList.remove("image-save-mode");
    console.error(error);
    alert("画像保存に失敗しました");
  }
}

function confirmCurrentShift() {
  if (state.staffs.length === 0) {
    alert("スタッフが登録されていません");
    return;
  }

  state.confirmModalOpen = true;
  render();
}

function closeConfirmModal() {
  state.confirmModalOpen = false;
  render();
}

function executeConfirmShift() {
  const errors = validate();

  state.confirmedShifts[state.yearMonth] = {
    yearMonth: state.yearMonth,
    confirmedAt: new Date().toISOString(),
    staffs: JSON.parse(JSON.stringify(state.staffs)),
    shifts: JSON.parse(JSON.stringify(state.shifts)),
    errorCount: errors.length
  };

  state.confirmModalOpen = false;

  save();

  alert(`${formatMonth()}のシフトを確定保存しました。\n翌月生成時に月またぎ週の休日数を参考にします。`);

  render();
}

function openUnconfirmModal() {
  if (!state.confirmedShifts?.[state.yearMonth]) {
    alert("この月はまだ確定されていません");
    return;
  }

  state.unconfirmModalOpen = true;
  render();
}

function closeUnconfirmModal() {
  state.unconfirmModalOpen = false;
  render();
}

function executeUnconfirmShift() {
  if (state.confirmedShifts?.[state.yearMonth]) {
    delete state.confirmedShifts[state.yearMonth];
  }

  state.unconfirmModalOpen = false;

  save();

  alert(`${formatMonth()}の確定を解除しました。`);

  render();
}

function exportCSV() {
  const days = daysInMonth();

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function shiftClass(shift) {
    if (shift === "早") return "early";
    if (shift === "中") return "middle";
    if (shift === "遅") return "late";
    if (["休", "法休", "公休"].includes(shift)) return "holiday";
    return "blank";
  }

  const staffRows = state.staffs.map(staff => {
    const c = countStaff(staff.id);

    return `
      <tr>
        <td>${escapeHtml(staff.name)}</td>
        <td>${escapeHtml(staff.employmentType)}</td>
        <td>${escapeHtml(staff.holidayRule || "個別設定")}</td>
        <td>${escapeHtml(staff.weekStart || "月曜起算")}</td>
        <td>${escapeHtml(staff.maxConsecutiveWorkDays || "")}</td>
        <td>${escapeHtml(staff.workDays)}</td>
        <td>${escapeHtml(staff.holidayDays)}</td>
        <td>${escapeHtml((staff.desiredHolidays || []).join("・"))}</td>
        <td>${escapeHtml((staff.unavailableDays || []).join("・"))}</td>
        <td>${escapeHtml(c.work)}</td>
        <td>${escapeHtml(c.holiday)}</td>
        <td>${escapeHtml(c.early)}</td>
        <td>${escapeHtml(c.late)}</td>
      </tr>
    `;
  }).join("");

  const dateHeader = Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    const w = "日月火水木金土"[getDayOfWeek(day)];
    const weekend = isWeekend(day) ? "weekend" : "";

    return `
      <th class="${weekend}">
        ${day}日<br>${w}
      </th>
    `;
  }).join("");

  const shiftRows = state.staffs.map(staff => {
    const c = countStaff(staff.id);

    const cells = Array.from({ length: days }, (_, i) => {
      const day = i + 1;
      const shift = state.shifts[staff.id]?.[day] || "空";
      const cls = shiftClass(shift);

      return `<td class="${cls}">${escapeHtml(shift)}</td>`;
    }).join("");

    return `
      <tr>
        <td class="staff-name">${escapeHtml(staff.name)}</td>
        <td>${escapeHtml(staff.employmentType)}</td>
        ${cells}
        <td class="count">${c.work}</td>
        <td class="count">${c.holiday}</td>
        <td class="count">${c.early}</td>
        <td class="count">${c.late}</td>
      </tr>
    `;
  }).join("");

  const workerRow = Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    const workers = getWorkerCountOnDay(day);
    const required = getRequiredPeople(day);
    const cls = workers < required ? "shortage" : "ok";

    return `<td class="${cls}">${workers}</td>`;
  }).join("");

  const earlyRow = Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    const early = getShiftCountOnDay(day, "早");
    const cls = early < Number(state.minEarly) ? "shortage" : "ok";

    return `<td class="${cls}">${early}</td>`;
  }).join("");

  const lateRow = Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    const late = getShiftCountOnDay(day, "遅");
    const cls = late < Number(state.minLate) ? "shortage" : "ok";

    return `<td class="${cls}">${late}</td>`;
  }).join("");

  const holidayRow = Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    const holidays = getHolidayCountOnDay(day);
    const limit = getHolidayLimitOnDay(day);
    const cls = holidays > limit ? "shortage" : "ok";

    return `<td class="${cls}">${holidays}</td>`;
  }).join("");

  const requiredRow = Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    return `<td>${getRequiredPeople(day)}</td>`;
  }).join("");

  const html = `
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: "Yu Gothic", "Meiryo", sans-serif; }
          h1 { font-size: 20px; margin-bottom: 6px; }
          .sub { margin-bottom: 18px; color: #666; }
          table { border-collapse: collapse; margin-bottom: 24px; }
          th, td {
            border: 1px solid #999;
            padding: 6px;
            text-align: center;
            font-size: 12px;
            white-space: nowrap;
          }
          th { background: #f2f4f7; font-weight: bold; }
          .section-title {
            background: #e6007e;
            color: #ffffff;
            font-weight: bold;
            text-align: left;
            font-size: 14px;
          }
          .staff-name {
            background: #f8fafc;
            font-weight: bold;
            text-align: left;
            min-width: 90px;
          }
          .early { background: #d98c9a; color: #000000; font-weight: bold; }
          .middle { background: #c9d98a; color: #000000; font-weight: bold; }
          .late { background: #8fc6d3; color: #000000; font-weight: bold; }
          .holiday { background: #ffffff; color: #000000; font-weight: bold; }
          .blank { background: #ffffff; color: #000000; font-weight: bold; }
          .weekend { background: #fff1f7; color: #e6007e; }
          .ok { background: #dff1ff; color: #1769aa; font-weight: bold; }
          .shortage { background: #ffe5e5; color: #bf0000; font-weight: bold; }
          .count { background: #f8fafc; font-weight: bold; }
        </style>
      </head>

      <body>
        <h1>Rmobile ${formatShiftTitle()}</h1>
        <div class="sub">
          ${days}日間 / ${state.staffs.length}名 / 平日必要人数 ${state.minWeekday}名 / 土日必要人数 ${state.minWeekend}名 / 早番最低${state.minEarly}名 / 遅番最低${state.minLate}名
        </div>

        <table>
          <tr>
            <td class="section-title" colspan="13">スタッフ設定一覧</td>
          </tr>
          <tr>
            <th>スタッフ名</th>
            <th>雇用区分</th>
            <th>休日ルール</th>
            <th>週の起算日</th>
            <th>最大連勤</th>
            <th>設定出勤日数</th>
            <th>設定休日数</th>
            <th>希望休</th>
            <th>勤務不可日</th>
            <th>実出勤</th>
            <th>実休日</th>
            <th>早番回数</th>
            <th>遅番回数</th>
          </tr>
          ${staffRows}
        </table>

        <table>
          <tr>
            <td class="section-title" colspan="${days + 6}">月間シフト表</td>
          </tr>
          <tr>
            <th>スタッフ名</th>
            <th>雇用区分</th>
            ${dateHeader}
            <th>出勤</th>
            <th>休日</th>
            <th>早番</th>
            <th>遅番</th>
          </tr>
          ${shiftRows}
          <tr>
            <td class="staff-name" colspan="2">出勤人数</td>
            ${workerRow}
            <td colspan="4"></td>
          </tr>
          <tr>
            <td class="staff-name" colspan="2">早番人数</td>
            ${earlyRow}
            <td colspan="4"></td>
          </tr>
          <tr>
            <td class="staff-name" colspan="2">遅番人数</td>
            ${lateRow}
            <td colspan="4"></td>
          </tr>
          <tr>
            <td class="staff-name" colspan="2">休み人数</td>
            ${holidayRow}
            <td colspan="4"></td>
          </tr>
          <tr>
            <td class="staff-name" colspan="2">必要人数</td>
            ${requiredRow}
            <td colspan="4"></td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const blob = new Blob(["\uFEFF" + html], {
    type: "application/vnd.ms-excel;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `Rmobile_シフト表_${state.yearMonth}${getSafeStoreFileName()}.xls`;
  a.click();

  URL.revokeObjectURL(url);
}

function resetAll() {
  if (!confirm("すべてのデータを削除しますか？")) return;

  localStorage.removeItem("rakutenShiftMobileMvp");
  location.reload();
}

function resetCurrentMonthShifts() {
  if (state.confirmedShifts?.[state.yearMonth]) {
    alert(`${formatMonth()}のシフトは確定済みのためリセットできません。\nリセットする場合は、先に確定を解除してください。`);
    return;
  }

  const hasShiftData = state.staffs.some(staff => {
    for (let day = 1; day <= daysInMonth(); day++) {
      const shift = state.shifts[staff.id]?.[day];
      if (shift && shift !== "空") return true;
    }
    return false;
  });

  if (!hasShiftData) {
    alert(`${formatMonth()}のシフトはすでに空です。`);
    return;
  }

  if (!confirm(
    `${formatMonth()}のシフトをすべて空にしますか？\n\nスタッフ情報・店舗設定・他の月のシフトは削除されません。`
  )) return;

  state.monthlyLastGeneratedShifts =
    state.monthlyLastGeneratedShifts || {};
  state.monthlyLastGeneratedShifts[state.yearMonth] =
    cloneShifts(state.shifts);
  state.shifts = createBlankShiftsForCurrentMonth();
  state.monthlyShifts[state.yearMonth] = cloneShifts(state.shifts);

  save();
  render();

  alert(`${formatMonth()}のシフトをリセットしました。`);
}

function render() {
  ensureShiftData();

  app.innerHTML = `
    <div class="app-shell">
      ${renderHeader()}
      ${renderTopBar()}
      ${renderTabs()}
      <main class="content">
        ${renderPage()}
      </main>
      ${state.modalOpen ? renderStaffModal() : ""}
      ${state.confirmModalOpen ? renderConfirmModal() : ""}
      ${state.unconfirmModalOpen ? renderUnconfirmModal() : ""}
    </div>
  `;
}

function renderHeader() {
  return "";
}

function renderTopBar() {
  return `
    <div class="top-bar">
      <div class="logo-box">R</div>
      <div class="system-title">Rmobile シフト作成アプリ</div>
      <div class="month-control">
        <button onclick="changeMonth(-1)">◀</button>
        <span>${formatMonth()}</span>
        <button onclick="changeMonth(1)">▶</button>
      </div>
    </div>
  `;
}

function renderTabs() {
  const tabs = [
    { key: "shift", label: "📋 シフト表" },
    { key: "staff", label: "👤 スタッフ" },
    { key: "employment", label: "📘 休日ルール" },
    { key: "settings", label: "⚙️ 店舗設定" }
  ];

  return `
    <nav class="tabs">
      ${tabs.map(tab => `
        <button
          class="tab ${state.activeTab === tab.key ? "active" : ""}"
          onclick="setTab('${tab.key}')"
        >
          ${tab.label}
        </button>
      `).join("")}
    </nav>
  `;
}

function renderPage() {
  if (state.activeTab === "staff") return renderStaffPage();
  if (state.activeTab === "shift") return renderShiftPage();
  if (state.activeTab === "employment") return renderEmploymentPage();
  if (state.activeTab === "settings") return renderSettingsPage();

  return renderStaffPage();
}

function renderStaffPage() {
  return `
    <div class="page-title-row">
      <div class="page-title">
        <h2>スタッフ一覧</h2>
        <p>${state.staffs.length}名登録済み</p>
      </div>
      <button class="primary-btn" onclick="openStaffModal()">＋スタッフ追加</button>
    </div>

    ${
      state.staffs.length === 0
        ? `<div class="empty-box">スタッフが登録されていません。<br>「スタッフ追加」から登録を開始してください。</div>`
        : `<div class="staff-list">${state.staffs.map(renderStaffCard).join("")}</div>`
    }
  `;
}

function renderStaffCard(staff) {
  const works = [];

  if (staff.canEarly) works.push("早番");
  if (staff.canLate) works.push("遅番");
  if (staff.canMiddle) works.push("通常勤務");

  const c = countStaff(staff.id);

  return `
    <div class="staff-card">
      <div class="staff-card-top">
        <div>
          <div class="staff-name">${staff.name}</div>
          <div class="staff-meta">
            ${staff.employmentType} / ${staff.holidayRule || "個別設定"} / ${staff.weekStart || "月曜起算"} / 最大連勤${staff.maxConsecutiveWorkDays || "-"}日
          </div>
          <div class="staff-meta">
            出勤${staff.workDays}日 / 休日${staff.holidayDays}日 / 早番${c.early}回 / 遅番${c.late}回
          </div>
        </div>

        <div class="card-actions">
          <button class="edit-btn" onclick="openEditStaffModal('${staff.id}')">編集</button>
          <button class="delete-btn" onclick="deleteStaff('${staff.id}')">削除</button>
        </div>
      </div>

      <div class="staff-tags">
        ${works.map(w => `<span class="tag ${w === "早番" ? "tag-blue" : w === "遅番" ? "tag-purple" : "tag-green"}">${w}</span>`).join("")}

        ${
          (staff.desiredHolidays || []).length
            ? `<span class="tag tag-red">希望休 ${(staff.desiredHolidays || []).join("・")}日</span>`
            : `<span class="tag">希望休なし</span>`
        }

        ${
          (staff.unavailableDays || []).length
            ? `<span class="tag tag-red">勤務不可 ${(staff.unavailableDays || []).join("・")}日</span>`
            : ""
        }
      </div>
    </div>
  `;
}

function renderStaffModal() {
  const s = state.draftStaff;
  const selectedCount = s.desiredHolidays.length;
  const unavailableCount = (s.unavailableDays || []).length;
  const title = state.modalMode === "edit" ? "スタッフ編集" : "スタッフ追加";
  const saveLabel = state.modalMode === "edit" ? "更新" : "保存";

  return `
    <div class="modal-backdrop">
      <div class="modal">
        <div class="modal-header">
          <h2>${title}</h2>
          <button class="close-btn" onclick="closeStaffModal()">×</button>
        </div>

        <div class="modal-body">
          <div class="form-grid">
            <div class="form-field">
              <label>氏名</label>
              <input
                value="${s.name}"
                placeholder="山田 太郎"
                oninput="updateDraft('name', this.value)"
              />
            </div>

            <div class="form-field">
              <label>雇用区分</label>
              <select onchange="updateDraft('employmentType', this.value)">
                ${["正社員", "契約社員", "派遣社員", "アルバイト"].map(type => `
                  <option value="${type}" ${s.employmentType === type ? "selected" : ""}>${type}</option>
                `).join("")}
              </select>
            </div>

            <div class="form-field">
              <label>休日ルール</label>
              <select onchange="updateDraft('holidayRule', this.value)">
                ${["個別設定", "週休2日", "完全週休2日", "4週8休", "4週9休"].map(rule => `
                  <option value="${rule}" ${s.holidayRule === rule ? "selected" : ""}>${rule}</option>
                `).join("")}
              </select>
            </div>

            <div class="form-field">
              <label>週の起算日</label>
              <select onchange="updateDraft('weekStart', this.value)">
                ${["月曜起算", "日曜起算"].map(start => `
                  <option value="${start}" ${s.weekStart === start ? "selected" : ""}>${start}</option>
                `).join("")}
              </select>
            </div>

            <div class="form-field">
              <label>最大連勤</label>
              <input
                type="number"
                value="${s.maxConsecutiveWorkDays ?? ""}"
                oninput="updateDraft('maxConsecutiveWorkDays', this.value)"
              />
            </div>

            <div class="form-field">
              <label>出勤日数</label>
              <input
                id="workDaysInput"
                type="number"
                value="${s.workDays}"
                oninput="
                  updateDraft('workDays', this.value);
                  document.getElementById('holidayDaysInput').value = state.draftStaff.holidayDays;
                "
              />
            </div>

            <div class="form-field">
              <label>休日数</label>
              <input
                id="holidayDaysInput"
                type="number"
                value="${s.holidayDays}"
                oninput="
                  updateDraft('holidayDays', this.value);
                  document.getElementById('workDaysInput').value = state.draftStaff.workDays;
                "
              />
            </div>

            <div class="form-field">
              <label>勤務区分可否</label>
              <div class="work-type-row">
                ${renderWorkCheck("canEarly", "早番", "tag-blue")}
                ${renderWorkCheck("canLate", "遅番", "tag-purple")}
                ${renderWorkCheck("canMiddle", "通常勤務", "tag-green")}
              </div>
            </div>
          </div>

          <div class="holiday-title">希望休（${selectedCount}日選択中）</div>

          <div class="day-grid">
            ${Array.from({ length: daysInMonth() }, (_, i) => {
              const day = i + 1;
              const selected = s.desiredHolidays.includes(day);

              return `
                <button
                  class="day-btn ${selected ? "selected" : ""} ${isWeekend(day) ? "weekend" : ""}"
                  onclick="toggleDraftHoliday(${day})"
                >
                  ${day}
                </button>
              `;
            }).join("")}
          </div>

          <div class="holiday-title">勤務不可日（${unavailableCount}日選択中）</div>

          <div class="day-grid">
            ${Array.from({ length: daysInMonth() }, (_, i) => {
              const day = i + 1;
              const selected = (s.unavailableDays || []).includes(day);

              return `
                <button
                  class="day-btn unavailable ${selected ? "selected-unavailable" : ""} ${isWeekend(day) ? "weekend" : ""}"
                  onclick="toggleDraftUnavailableDay(${day})"
                >
                  ${day}
                </button>
              `;
            }).join("")}
          </div>
        </div>

        <div class="modal-footer">
          <button class="cancel-btn" onclick="closeStaffModal()">キャンセル</button>
          <button class="save-btn" onclick="saveStaffFromModal()">${saveLabel}</button>
        </div>
      </div>
    </div>
  `;
}

function renderConfirmModal() {
  const errors = validate();
  const isConfirmed = Boolean(state.confirmedShifts?.[state.yearMonth]);

  return `
    <div class="confirm-backdrop">
      <div class="confirm-card">
        <div class="confirm-icon">!</div>

        <h2>シフトを確定しますか？</h2>

        <p>
          ${formatMonth()}のシフトを確定保存します。<br>
          確定後は、翌月のシフト生成時に月またぎ週の休日数として参照されます。
        </p>

        ${
          isConfirmed
            ? `<div class="confirm-warning">この月はすでに確定済みです。もう一度確定すると上書き保存されます。</div>`
            : ""
        }

        ${
          errors.length > 0
            ? `<div class="confirm-warning">検証エラーが ${errors.length} 件あります。それでも確定できます。</div>`
            : `<div class="confirm-ok">検証OKです。このまま確定できます。</div>`
        }

        <div class="confirm-actions">
          <button class="confirm-no-btn" onclick="closeConfirmModal()">いいえ</button>
          <button class="confirm-yes-btn" onclick="executeConfirmShift()">はい、確定する</button>
        </div>
      </div>
    </div>
  `;
}

function renderUnconfirmModal() {
  return `
    <div class="confirm-backdrop">
      <div class="confirm-card">
        <div class="confirm-icon unconfirm-icon">−</div>

        <h2>確定を解除しますか？</h2>

        <p>
          ${formatMonth()}の確定状態を解除します。<br>
          シフト表の内容は消えませんが、翌月生成時の前月確定データとしては使われなくなります。
        </p>

        <div class="confirm-warning">
          確定解除後も、現在表示中のシフトはそのまま残ります。
        </div>

        <div class="confirm-actions">
          <button class="confirm-no-btn" onclick="closeUnconfirmModal()">いいえ</button>
          <button class="unconfirm-yes-btn" onclick="executeUnconfirmShift()">はい、解除する</button>
        </div>
      </div>
    </div>
  `;
}

function renderWorkCheck(key, label, colorClass) {
  const checked = state.draftStaff[key];

  return `
    <div class="work-check" onclick="updateDraft('${key}', ${!checked})">
      <span class="fake-check">${checked ? "✓" : ""}</span>
      <span class="work-chip ${colorClass}">${label}</span>
    </div>
  `;
}

function renderShiftPage() {
  const isConfirmed = Boolean(state.confirmedShifts?.[state.yearMonth]);

  return `
    <div class="page-title-row">
      <div class="page-title">
        <h2>${formatShiftTitle()}</h2>
        <p>${daysInMonth()}日間 / ${state.staffs.length}名 ${isConfirmed ? " / 確定済み" : ""}</p>
      </div>
    </div>

    <div class="shift-summary-grid">
      <div class="summary-card">
        <span>総スタッフ数</span>
        <strong>${state.staffs.length}名</strong>
      </div>

      <div class="summary-card">
        <span>最低出勤人数</span>
        <strong>${state.minWeekday}名〜</strong>
      </div>

      <div class="summary-card">
        <span>早番/遅番</span>
        <strong>${state.minEarly}/${state.minLate}名</strong>
      </div>

      <div class="summary-card">
        <span>確定状態</span>
        <strong>${isConfirmed ? "確定済" : "未確定"}</strong>
      </div>
    </div>

    <div class="card">
      <div class="actions shift-actions no-print">
        <button class="red-btn" onclick="autoGenerate()">自動生成</button>
<button class="primary-btn" onclick="autoGenerateNewStaffOnly()">新規スタッフ追加生成</button>
        <button class="dark-btn" onclick="exportCSV()">Excel出力</button>
        <button class="print-btn" onclick="printShiftTable()">印刷</button>
        <button class="image-btn" onclick="saveShiftImage()">画像保存</button>
        <button class="confirm-btn" onclick="confirmCurrentShift()">シフト確定</button>
        ${isConfirmed ? `<button class="unconfirm-btn" onclick="openUnconfirmModal()">確定解除</button>` : ""}
        <button
          class="reset-shift-btn"
          onclick="resetCurrentMonthShifts()"
          ${isConfirmed ? `disabled title="確定済みのため、先に確定を解除してください"` : ""}
        >
          ${isConfirmed ? "確定済み・リセット不可" : "今月のシフトをリセット"}
        </button>
        <button class="light-btn" onclick="resetAll()">全リセット</button>
      </div>
    </div>

    ${
      state.staffs.length === 0
        ? `<div class="empty-box">スタッフを追加するとシフト表を作成できます。</div>`
        : `
          <div class="desktop-shift-card print-area">
            <div class="desktop-shift-header">
              <div>
                <h3>${formatShiftTitle()}</h3>
                <p>${daysInMonth()}日間 / 早番・遅番は最低1名ずつ配置します</p>
              </div>
            </div>

            <div class="shift-table-wrap improved">
              ${renderShiftTable()}
            </div>
          </div>
        `
    }

    <div class="card" style="margin-top:14px;">
      <h3>検証パネル</h3>
      <div class="error-list">
        ${renderValidation()}
      </div>
    </div>
  `;
}

function renderShiftTable() {
  const days = daysInMonth();

  const header = `
    <tr>
      <th class="sticky-name">スタッフ名</th>
      ${Array.from({ length: days }, (_, i) => {
        const day = i + 1;
        const w = "日月火水木金土"[getDayOfWeek(day)];
        const weekendClass = isWeekend(day) ? "weekend-header" : "";

        return `
          <th class="day-header ${weekendClass}">
            <div>${day}</div>
            <small>${w}</small>
          </th>
        `;
      }).join("")}
      <th class="count-header">出勤</th>
      <th class="count-header">休日</th>
      <th class="count-header">早</th>
      <th class="count-header">遅</th>
      <th class="count-header">警告</th>
    </tr>
  `;

  const errors = validate();

  const body = state.staffs.map(staff => {
    const c = countStaff(staff.id);
    const staffErrors = errors.filter(error => error.startsWith(`${staff.name}：`));

    return `
      <tr>
        <td class="staff-name-cell sticky-name">
          <strong>${staff.name}</strong>
          <small>${staff.employmentType}</small>
        </td>

        ${Array.from({ length: days }, (_, i) => {
          const day = i + 1;
          const value = state.shifts[staff.id]?.[day] || "空";
          const desired = (staff.desiredHolidays || []).includes(day);
          const unavailable = (staff.unavailableDays || []).includes(day);
          const weekend = isWeekend(day);

          return `
            <td
              class="shift-cell improved-cell shift-${value} ${desired ? "desired-mark" : ""} ${unavailable ? "unavailable-mark" : ""} ${weekend ? "weekend-cell" : ""}"
              onclick="cycleShift('${staff.id}', ${day})"
              title="${desired ? "希望休" : unavailable ? "勤務不可" : ""}"
            >
              ${value}
            </td>
          `;
        }).join("")}

        <td class="count-cell">${c.work}</td>
        <td class="count-cell">${c.holiday}</td>
        <td class="count-cell">${c.early}</td>
        <td class="count-cell">${c.late}</td>
        <td class="warning-cell">${staffErrors.length}</td>
      </tr>
    `;
  }).join("");

  const dailyCountRow = `
    <tr class="daily-count-row">
      <td class="sticky-name daily-label">出勤人数</td>
      ${Array.from({ length: days }, (_, i) => {
        const day = i + 1;
        const workers = getWorkerCountOnDay(day);
        const required = getRequiredPeople(day);
        const shortage = workers < required;

        return `
          <td class="${shortage ? "shortage-cell" : "ok-cell"}">
            ${workers}
          </td>
        `;
      }).join("")}
      <td colspan="5" class="daily-note">日別合計</td>
    </tr>
  `;

  const earlyCountRow = `
    <tr class="daily-count-row">
      <td class="sticky-name daily-label">早番人数</td>
      ${Array.from({ length: days }, (_, i) => {
        const day = i + 1;
        const early = getShiftCountOnDay(day, "早");
        const shortage = early < Number(state.minEarly);

        return `
          <td class="${shortage ? "shortage-cell" : "ok-cell"}">
            ${early}
          </td>
        `;
      }).join("")}
      <td colspan="5" class="daily-note">最低${state.minEarly}名</td>
    </tr>
  `;

  const lateCountRow = `
    <tr class="daily-count-row">
      <td class="sticky-name daily-label">遅番人数</td>
      ${Array.from({ length: days }, (_, i) => {
        const day = i + 1;
        const late = getShiftCountOnDay(day, "遅");
        const shortage = late < Number(state.minLate);

        return `
          <td class="${shortage ? "shortage-cell" : "ok-cell"}">
            ${late}
          </td>
        `;
      }).join("")}
      <td colspan="5" class="daily-note">最低${state.minLate}名</td>
    </tr>
  `;

  const holidayCountRow = `
    <tr class="daily-count-row">
      <td class="sticky-name daily-label">休み人数</td>
      ${Array.from({ length: days }, (_, i) => {
        const day = i + 1;
        const holidays = getHolidayCountOnDay(day);
        const limit = getHolidayLimitOnDay(day);
        const overLimit = holidays > limit;

        return `
          <td class="${overLimit ? "shortage-cell" : "ok-cell"}" title="上限${limit}人">
            ${holidays}
          </td>
        `;
      }).join("")}
      <td colspan="5" class="daily-note">日別休み上限と比較</td>
    </tr>
  `;

  return `
    <table class="shift-table improved-table">
      <thead>${header}</thead>
      <tbody>
        ${body}
        ${dailyCountRow}
        ${earlyCountRow}
        ${lateCountRow}
        ${holidayCountRow}
      </tbody>
    </table>
  `;
}

function renderValidation() {
  const errors = validate();

  if (errors.length === 0) {
    return `<div class="success">検証OKです。</div>`;
  }

  return errors.map(e => `<div class="error">${e}</div>`).join("");
}

function renderEmploymentPage() {
  return `
    <div class="page-title">
      <h2>休日ルール</h2>
      <p>スタッフごとに選択できます</p>
    </div>

    <div class="card">
      <h3>利用できる休日ルール</h3>
      <div class="staff-tags">
        <span class="tag tag-blue">個別設定</span>
        <span class="tag tag-green">週休2日</span>
        <span class="tag tag-purple">完全週休2日</span>
        <span class="tag tag-red">4週8休</span>
        <span class="tag">4週9休</span>
      </div>
    </div>

    <div class="card">
      <h3>週の起算日</h3>
      <p>スタッフごとに「月曜起算」または「日曜起算」を選択できます。</p>
    </div>

    <div class="card">
      <h3>月またぎ週の扱い</h3>
      <p>前月のシフトを確定すると、翌月生成時に前月末の休日数も含めて週休2日を判定します。</p>
    </div>
  `;
}

function renderSettingsPage() {
  return `
    <div class="page-title">
      <h2>店舗設定</h2>
      <p>店舗名、必要人数、モード設定</p>
    </div>

    <div class="card">
      <div class="form-grid">
        <div class="form-field">
          <label>店舗名</label>
          <input
            type="text"
            value="${state.storeName || ""}"
            placeholder="例：〇〇〇店"
            oninput="updateSetting('storeName', this.value)"
          />
        </div>

        <div class="form-field">
          <label>平日必要人数</label>
          <input
            type="number"
            value="${state.minWeekday}"
            oninput="updateSetting('minWeekday', this.value)"
          />
        </div>

        <div class="form-field">
          <label>土日必要人数</label>
          <input
            type="number"
            value="${state.minWeekend}"
            oninput="updateSetting('minWeekend', this.value)"
          />
        </div>

        <div class="form-field">
          <label>最低早番人数</label>
          <input
            type="number"
            value="${state.minEarly}"
            oninput="updateSetting('minEarly', this.value)"
          />
        </div>

        <div class="form-field">
          <label>最低遅番人数</label>
          <input
            type="number"
            value="${state.minLate}"
            oninput="updateSetting('minLate', this.value)"
          />
        </div>

        <div class="form-field">
          <label>最大遅番人数（1日あたり）</label>
          <input
            type="number"
            min="${state.minLate}"
            step="1"
            value="${state.maxLate}"
            oninput="updateSetting('maxLate', this.value)"
          />
          <small>店舗の人数に合わせて自由に設定できます</small>
        </div>

        <div class="form-field">
          <label>月末対象日数</label>
          <input
            type="number"
            value="${state.monthEndDays}"
            oninput="updateSetting('monthEndDays', this.value)"
          />
        </div>

        <div class="form-field">
          <label>月末必要人数</label>
          <input
            type="number"
            value="${state.monthEndMin}"
            oninput="updateSetting('monthEndMin', this.value)"
          />
        </div>

        <div class="actions">
          <button class="dark-btn" onclick="toggleSetting('weekendMode')">
            土日モード：${state.weekendMode ? "ON" : "OFF"}
          </button>

          <button class="dark-btn" onclick="toggleSetting('monthEndMode')">
            月末モード：${state.monthEndMode ? "ON" : "OFF"}
          </button>
        </div>
      </div>
    </div>

    <div class="card holiday-limit-card">
      <div class="holiday-limit-header">
        <div>
          <span class="holiday-limit-kicker">MONTHLY HOLIDAY LIMIT</span>
          <h3>${formatMonth()} 日別の休み人数上限</h3>
          <p class="settings-help">希望休・勤務不可日・休・法休・公休を含む、1日あたりの最大人数です。</p>
        </div>
        <div class="holiday-limit-quick">
          <span>一括設定</span>
          <button type="button" onclick="setAllHolidayLimits(1)">1人</button>
          <button type="button" onclick="setAllHolidayLimits(2)">2人</button>
          <button type="button" onclick="setAllHolidayLimits(3)">3人</button>
        </div>
      </div>

      <div class="weekday-row" aria-hidden="true">
        ${["日", "月", "火", "水", "木", "金", "土"].map((weekday, index) => `
          <span class="${index === 0 ? "sun" : index === 6 ? "sat" : ""}">${weekday}</span>
        `).join("")}
      </div>

      <div class="daily-limit-grid calendar-grid">
        ${Array.from({ length: getDayOfWeek(1) }, () => `<div class="daily-limit-spacer"></div>`).join("")}
        ${Array.from({ length: daysInMonth() }, (_, index) => {
          const day = index + 1;
          const weekday = getDayOfWeek(day);
          const weekdayLabel = ["日", "月", "火", "水", "木", "金", "土"][weekday];
          const weekendClass = weekday === 0 ? "sunday" : weekday === 6 ? "saturday" : "";
          return `
            <div class="daily-limit-item ${weekendClass}">
              <div class="daily-limit-date">
                <strong>${day}</strong>
                <span>${weekdayLabel}</span>
              </div>
              <div class="daily-limit-stepper">
                <button type="button" aria-label="${day}日の上限を1人減らす" onclick="adjustHolidayLimit(${day}, -1)">−</button>
                <label>
                  <input
                    type="number"
                    min="0"
                    value="${getHolidayLimitOnDay(day)}"
                    onchange="updateHolidayLimit(${day}, this.value)"
                    aria-label="${day}日の休み人数上限"
                  />
                  <small>人</small>
                </label>
                <button type="button" aria-label="${day}日の上限を1人増やす" onclick="adjustHolidayLimit(${day}, 1)">＋</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

function updateSetting(key, value) {
  if (key === "storeName") {
    state.storeName = value;
    save();
    return;
  }

  state[key] = Math.max(0, Number(value) || 0);
  if (key === "minLate" && Number(state.maxLate) < state.minLate) {
    state.maxLate = state.minLate;
  }
  if (key === "maxLate" && state.maxLate < Number(state.minLate)) {
    state.maxLate = Number(state.minLate);
  }
  save();
  render();
}

function toggleSetting(key) {
  state[key] = !state[key];
  save();
  render();
}

load();
render();
