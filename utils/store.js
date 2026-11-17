// 数据与随机逻辑：全部基于本地存储，无后端。
const storage = require('./storage');
const { BUILT_IN_DISHES, MEAL_NAME } = require('../data/dishes.js');

const KEYS = {
  custom: 'wte_custom_dishes',
  flags: 'wte_dish_flags',
  history: 'wte_history'
};
const HISTORY_LIMIT = 100;

// Legacy restaurant meal values are normalized at the read boundary; subsequent
// writes persist version 2 without changing the UI's restaurant routing key.
function normalizeEntry(entry) {
  const type = entry.type === 'restaurant' || (!entry.type && entry.meal === 'restaurant') ? 'restaurant' : 'dish';
  return { ...entry, type, meal: type === 'restaurant' ? null : entry.meal, schemaVersion: 2 };
}

function entryMatch(entry, key) {
  const item = normalizeEntry(entry);
  return key === 'restaurant' ? item.type === 'restaurant' : item.type === 'dish' && mealMatch(item.meal, key);
}

// ---------- 基础读写 ----------

function getCustomDishes() {
  return (storage.read(KEYS.custom, [])).map((dish) => ({ ...normalizeEntry(dish), emoji: dish.emoji || '🍽️' }));
}

function getFlags() {
  return storage.read(KEYS.flags, {});
}

function getFlag(id) {
  const f = getFlags()[id] || {};
  return { fav: !!f.fav, excluded: !!(f.excluded || f.hidden), hidden: !!f.hidden };
}

function setFlag(id, key, val) {
  const flags = getFlags();
  if (flags[id] && flags[id].deleted) return;
  if (!flags[id]) flags[id] = {};
  flags[id][key] = !!val;
  if (key === 'excluded') flags[id].hidden = false;
  storage.write(KEYS.flags, flags);
}

function deleteCustom(id) {
  const list = getCustomDishes().filter((d) => d.id !== id);
  storage.write(KEYS.custom, list);
  const flags = getFlags();
  if (flags[id]) {
    delete flags[id];
    storage.write(KEYS.flags, flags);
  }
}

function deleteEntry(id) {
  if (BUILT_IN_DISHES.some((dish) => dish.id === id)) {
    // 内置菜来自随包数据，用本地删除标记防止重新加载后出现。
    const flags = getFlags();
    flags[id] = { deleted: true };
    storage.write(KEYS.flags, flags);
    return;
  }
  deleteCustom(id);
}

function getBuiltInDishes(flags = getFlags()) {
  return BUILT_IN_DISHES.filter(({ id }) => !(flags[id] && flags[id].deleted));
}

// ---------- 餐次 ----------

// main 池同时属于午餐和晚餐；其余按 key 相等匹配。
function mealMatch(dishMeal, mealKey) {
  if (dishMeal === 'main') return mealKey === 'lunch' || mealKey === 'dinner';
  return dishMeal === mealKey;
}

// 按当前时间给出默认餐次。
function defaultMealKey(now) {
  const h = now.getHours();
  if (h >= 21 || h < 6) return 'night';
  if (h < 10) return 'breakfast';
  if (h < 15) return 'lunch';
  return 'dinner';
}

// ---------- 自定义菜 ----------

// 把一段输入拆成菜名列表：支持空格 / 中英文逗号 / 顿号 / 分号 / 换行分隔。
function parseBatch(text, meal) {
  const parts = String(text || '')
    .split(meal === 'restaurant' ? /[，,、;；\n\r]+/ : /[，,、;；\n\r\t ]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const name = Array.from(p).slice(0, meal === 'restaurant' ? 80 : 16).join('');
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out.slice(0, 30);
}

function addCustomDishes(names, meal) {
  const custom = getCustomDishes();
  // 添加午晚通用菜时，也检查午餐与晚餐中已经存在的同名菜。
  const targetMeals = meal === 'main' ? ['lunch', 'dinner'] : [meal];
  const overlaps = (d) => targetMeals.some((key) => entryMatch(d, key));
  const existCustom = new Set(custom.filter(overlaps).map((d) => d.name));
  const existBuiltIn = new Set(getBuiltInDishes().filter(overlaps).map((d) => d.name));
  let added = 0;
  let skipped = 0;
  for (const name of names) {
    if (existCustom.has(name) || existBuiltIn.has(name)) {
      skipped++;
      continue;
    }
    custom.push({
      id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      type: meal === 'restaurant' ? 'restaurant' : 'dish',
      meal: meal === 'restaurant' ? null : meal,
      schemaVersion: 2
    });
    existCustom.add(name);
    added++;
  }
  if (added) storage.write(KEYS.custom, custom);
  return { added, skipped };
}

// ---------- 随机 ----------

// 候选池：当前餐次未被排除 / 隐藏的内置菜 + 自定义菜。
function getPool(mealKey) {
  const flags = getFlags();
  const custom = getCustomDishes();
  const pool = [];
  for (const d of getBuiltInDishes(flags)) {
    if (!entryMatch(d, mealKey)) continue;
    const f = flags[d.id] || {};
    if (f.excluded || f.hidden) continue;
    pool.push({ ...normalizeEntry(d), isCustom: false, fav: !!f.fav });
  }
  for (const d of custom) {
    if (!entryMatch(d, mealKey)) continue;
    const f = flags[d.id] || {};
    if (f.excluded || f.hidden) continue;
    pool.push({ ...d, isCustom: true, fav: !!f.fav });
  }
  return pool;
}

// 加权随机：收藏的菜权重 ×3。
function randomDish(pool) {
  const weight = (d) => (d.fav ? 3 : 1);
  let total = 0;
  for (const d of pool) total += weight(d);
  let r = Math.random() * total;
  for (const d of pool) {
    r -= weight(d);
    if (r < 0) return d;
  }
  return pool[pool.length - 1];
}

// ---------- 历史 ----------

function getHistory() {
  return (storage.read(KEYS.history, [])).map(normalizeEntry);
}

function addHistory(dish, mealKey) {
  const list = getHistory();
  list.unshift(normalizeEntry({ name: dish.name, emoji: dish.emoji, type: dish.type, meal: mealKey, ts: Date.now() }));
  if (list.length > HISTORY_LIMIT) list.length = HISTORY_LIMIT;
  storage.write(KEYS.history, list);
}

function clearHistory() {
  storage.remove(KEYS.history);
}

// 按天分组（今天 / 昨天 / 具体日期），供历史页直接渲染。
function getHistoryGroups() {
  const list = getHistory();
  const now = new Date();
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const todayKey = dayKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const ystKey = dayKey(yesterday);
  const groups = [];
  let cur = null;
  let curKey = '';
  let seq = 0;
  for (const it of list) {
    const d = new Date(it.ts);
    const key = dayKey(d);
    let label = `${d.getMonth() + 1}月${d.getDate()}日`;
    if (d.getFullYear() !== now.getFullYear()) label = `${d.getFullYear()}年` + label;
    if (key === todayKey) label = '今天 · ' + label;
    else if (key === ystKey) label = '昨天 · ' + label;
    if (key !== curKey) {
      cur = { key, label, items: [] };
      groups.push(cur);
      curKey = key;
    }
    const pad = (n) => String(n).padStart(2, '0');
    cur.items.push({
      _k: 'h' + seq,
      name: it.name,
      emoji: it.emoji || '🍽️',
      mealName: it.type === 'restaurant' ? '饭店' : MEAL_NAME[it.meal] || it.meal,
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
    });
    seq++;
  }
  return groups;
}

module.exports = {
  normalizeEntry,
  entryMatch,
  mealMatch,
  defaultMealKey,
  parseBatch,
  addCustomDishes,
  getCustomDishes,
  getBuiltInDishes,
  deleteEntry,
  deleteCustom,
  getFlag,
  setFlag,
  getPool,
  randomDish,
  getHistory,
  addHistory,
  clearHistory,
  getHistoryGroups
};
