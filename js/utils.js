// Utils module - utility functions
export const RATES = new Map(
  Object.entries({
    waste: ["плохая", "#f54242"],
    ok: ["ок", "#4287f5"],
    good: ["осознанная", "#42f58a"],
  })
);

export function countMapInc(map, object) {
  if (!map.has(object)) {
    map.set(object, 1);
    return;
  }
  map.set(object, map.get(object) + 1);
}

export function countMapDec(map, object) {
  if (map.get(object) === 1) {
    map.delete(object);
    return;
  }
  map.set(object, map.get(object) - 1);
}

export function formatDate(date, day = false) {
  let dd = date.getDate();
  if (dd < 10) dd = "0" + dd;
  let mm = date.getMonth() + 1;
  if (mm < 10) mm = "0" + mm;
  if (day) {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${dd}.${mm} ${hours}:${minutes}`;
  }
  const yy = date.getFullYear();
  return dd + "." + mm + "." + yy;
}

export function getDateRange(period = "day", date = new Date(), customStart = null, customEnd = null) {
  const result = { start: new Date(date), end: new Date(date) };

  switch (period) {
    case "day":
      result.start.setHours(0, 0, 0, 0);
      result.end.setHours(23, 59, 59, 999);
      break;

    case "week":
      const day = date.getDay();
      const diffToMonday = day === 0 ? -6 : 1 - day;
      result.start.setDate(date.getDate() + diffToMonday);
      result.start.setHours(0, 0, 0, 0);
      result.end = new Date(result.start);
      result.end.setDate(result.start.getDate() + 6);
      result.end.setHours(23, 59, 59, 999);
      break;

    case "month":
      result.start = new Date(date.getFullYear(), date.getMonth(), 1);
      result.end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      result.end.setHours(23, 59, 59, 999);
      break;

    case "year":
      result.start = new Date(date.getFullYear(), 0, 1);
      result.end = new Date(date.getFullYear(), 11, 31);
      result.end.setHours(23, 59, 59, 999);
      break;

    case "custom":
      if (customStart && customEnd) {
        result.start = new Date(customStart);
        result.start.setHours(0, 0, 0, 0);
        result.end = new Date(customEnd);
        result.end.setHours(23, 59, 59, 999);
      }
      break;
  }
  return result;
}

export function groupTransactions(transactions, target) {
  const result = {};
  transactions.forEach((t) => {
    if (Array.isArray(t[target])) {
      t[target].forEach((tag) => {
        if (!result[tag]) {
          result[tag] = 0;
        }
        result[tag] += t.amount;
      });
    } else {
      if (!result[t[target]]) {
        result[t[target]] = 0;
      }
      result[t[target]] += t.amount;
    }
  });
  return result;
}

export function capitalize(str) {
  if (!str) return "";
  return str[0].toUpperCase() + str.slice(1).toLowerCase();
}

export function unionStart(inputText, src) {
  if (inputText.length >= src.length || inputText.length == 0) {
    return -1;
  }
  let i = 0;
  while (i < inputText.length && i < src.length) {
    if (inputText[i] !== src[i]) {
      return -1;
    }
    i++;
  }
  return i;
}