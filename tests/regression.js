// Run with: node --test tests/regression.js
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
let storage;
global.wx = {
  getStorageSync: (key) => structuredClone(storage[key]),
  setStorageSync: (key, value) => { storage[key] = structuredClone(value); },
  removeStorageSync: (key) => { delete storage[key]; }
};
const store = require('../utils/store');
beforeEach(() => { storage = {}; });

test('shared meals reject built-in and overlapping custom duplicates', () => {
  assert.equal(store.addCustomDishes(['宫保鸡丁'], 'main').added, 0);
  assert.equal(store.addCustomDishes(['测试菜'], 'main').added, 1);
  assert.equal(store.addCustomDishes(['测试菜'], 'main').added, 0);
  assert.equal(store.addCustomDishes(['测试菜'], 'lunch').added, 0);
  store.addCustomDishes(['单餐菜'], 'dinner');
  assert.equal(store.addCustomDishes(['单餐菜'], 'main').added, 0);
  assert.equal(store.addCustomDishes(['单餐菜'], 'breakfast').added, 1);
});

test('batch normalization deduplicates truncated names and preserves Unicode', () => {
  const prefix = '一'.repeat(16);
  assert.deepEqual(store.parseBatch(prefix + '甲,' + prefix + '乙'), [prefix]);
  assert.deepEqual(store.parseBatch('一'.repeat(15) + '🍚'), ['一'.repeat(15) + '🍚']);
});

test('legacy custom dishes and history receive a display icon', () => {
  storage.wte_custom_dishes = [{ id: 'c1', name: '测试菜', meal: 'lunch' }];
  const dish = store.getPool('lunch').find(d => d.id === 'c1');
  assert.equal(dish.emoji, '🍽️');
  store.addHistory(dish, 'lunch');
  assert.equal(store.getHistoryGroups()[0].items[0].emoji, '🍽️');
});

test('history respects calendar yesterday at DST boundaries and distinguishes years', () => {
  const OriginalDate = Date;
  process.env.TZ = 'America/Los_Angeles';
  try {
    for (const [now, yesterday] of [
      ['2026-03-09T00:30:00-07:00', '2026-03-08T12:00:00-07:00'],
      ['2026-11-01T23:30:00-08:00', '2026-10-31T12:00:00-07:00']
    ]) {
      global.Date = class extends OriginalDate {
        constructor(...args) { super(...(args.length ? args : [now])); }
      };
      storage.wte_history = [{ name: '测试', meal: 'lunch', ts: new OriginalDate(yesterday).getTime() }];
      assert.match(store.getHistoryGroups()[0].label, /^昨天/);
    }
    storage.wte_history = [2025, 2024].map(year => ({ name: '测试', meal: 'lunch', ts: new OriginalDate(year, 0, 1).getTime() }));
    const groups = store.getHistoryGroups();
    assert.notEqual(groups[0].key, groups[1].key);
    assert.match(groups[0].label, /2025年/);
  } finally { global.Date = OriginalDate; }
});

function makePage() {
  let definition;
  let nextId = 0;
  const timers = new Map();
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../pages/index/index.js'), 'utf8'), {
    require: name => name.includes('storage') ? require('../utils/storage') : name.includes('store') ? store : require('../data/dishes'),
    Page: value => { definition = value; },
    wx: { showToast() {}, vibrateShort() {} },
    setTimeout: fn => { timers.set(++nextId, fn); return nextId; },
    clearTimeout: id => timers.delete(id)
  });
  const page = { ...definition, data: structuredClone(definition.data), setData(patch) {
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'result.fav') this.data.result.fav = value;
      else this.data[key] = value;
    }
  } };
  function tick() {
    const [id, fn] = timers.entries().next().value;
    timers.delete(id);
    fn();
  }
  return { page, timers, tick };
}

test('returning home synchronizes favorite state and discards unavailable results', () => {
  const { page } = makePage();
  page.data.result = store.getPool('lunch')[0];
  const id = page.data.result.id;
  store.setFlag(id, 'fav', true);
  page.onShow();
  assert.equal(page.data.result.fav, true);
  page.favDish();
  assert.equal(store.getFlag(id).fav, false);
  store.setFlag(id, 'hidden', true);
  page.onShow();
  assert.equal(page.data.result, null);
});

test('leaving during rolling cancels timers without recording a result', () => {
  const { page, timers } = makePage();
  page.spin();
  page.onHide();
  assert.equal(timers.size, 0);
  assert.equal(page.data.spinning, false);
  assert.equal(page.data.display.name, '今天吃什么？');
  assert.equal(store.getHistory().length, 0);
});

test('landing timers are cleared on restart and page hide', () => {
  const { page, timers, tick } = makePage();
  page.spin();
  while (page.data.spinning) tick();
  assert.equal(page.data.landing, true);
  assert.equal(store.getHistory().length, 1);
  page.spin();
  assert.equal(timers.size, 1);
  assert.equal(page.data.landing, false);
  while (page.data.spinning) tick();
  page.onHide();
  assert.equal(timers.size, 0);
  assert.equal(page.data.landing, false);
});

test('pool honors flags and history remains capped at 100', () => {
  const dish = store.getPool('lunch')[0];
  store.setFlag(dish.id, 'excluded', true);
  assert.equal(store.getPool('lunch').some(d => d.id === dish.id), false);
  for (let i = 0; i < 105; i++) store.addHistory(dish, 'lunch');
  assert.equal(store.getHistory().length, 100);
});

test('custom restaurants stay separate from dishes and support management and history', () => {
  assert.equal(store.getPool('restaurant').length, 0);
  assert.equal(store.addCustomDishes(['街角饭店'], 'restaurant').added, 1);
  assert.equal(store.addCustomDishes(['街角饭店'], 'restaurant').skipped, 1);
  const restaurant = store.getPool('restaurant')[0];
  assert.equal(store.getPool('lunch').some(d => d.id === restaurant.id), false);
  store.setFlag(restaurant.id, 'fav', true);
  assert.equal(store.getPool('restaurant')[0].fav, true);
  store.addHistory(restaurant, 'restaurant');
  assert.equal(store.getHistoryGroups()[0].items[0].mealName, '饭店');
  store.setFlag(restaurant.id, 'excluded', true);
  assert.equal(store.getPool('restaurant').length, 0);
  store.setFlag(restaurant.id, 'excluded', false);
  assert.equal(store.getPool('restaurant').length, 1);
  store.deleteCustom(restaurant.id);
  assert.equal(store.getPool('restaurant').length, 0);
});

test('restaurant names preserve spaces and truncate at 80 Unicode characters', () => {
  assert.deepEqual(store.parseBatch('  海底捞 火锅，Pizza House\n街角 饭店  ', 'restaurant'), ['海底捞 火锅', 'Pizza House', '街角 饭店']);
  const name = '店'.repeat(79) + '🍜';
  assert.deepEqual(store.parseBatch(name + '分店', 'restaurant'), [name]);
});

test('legacy hidden dishes can be restored by clearing excluded', () => {
  const dish = store.getPool('lunch')[0];
  storage.wte_dish_flags = { [dish.id]: { hidden: true } };
  assert.equal(store.getFlag(dish.id).excluded, true);
  assert.equal(store.getPool('lunch').some(d => d.id === dish.id), false);
  store.setFlag(dish.id, 'excluded', false);
  assert.equal(store.getFlag(dish.id).excluded, false);
  assert.equal(store.getPool('lunch').some(d => d.id === dish.id), true);
});

test('switching restaurant mode preserves the selected dish meal', () => {
  const { page } = makePage();
  assert.equal(page.data.meals.some(meal => meal.key === 'restaurant'), false);
  page.switchMeal({ currentTarget: { dataset: { key: 'dinner' } } });
  page.switchMode({ currentTarget: { dataset: { mode: 'restaurant' } } });
  assert.equal(page.data.mode, 'restaurant');
  page.switchMode({ currentTarget: { dataset: { mode: 'dishes' } } });
  assert.equal(page.data.mode, 'dishes');
  assert.equal(page.data.activeMeal, 'dinner');
});
