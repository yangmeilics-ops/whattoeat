const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
let storage;
global.wx = {
  getStorageSync: key => structuredClone(storage[key]),
  setStorageSync: (key, value) => { storage[key] = structuredClone(value); }
};
const store = require('../utils/store');
beforeEach(() => { storage = {}; });

test('legacy restaurants normalize without changing ids or leaking into dish pools', () => {
  storage.wte_custom_dishes = [{ id: 'old', name: '老店', meal: 'restaurant' }];
  const entry = store.getCustomDishes()[0];
  assert.equal(entry.type, 'restaurant');
  assert.equal(entry.meal, null);
  assert.equal(entry.schemaVersion, 2);
  assert.equal(entry.id, 'old');
  assert.equal(store.getPool('restaurant')[0].id, 'old');
  assert.equal(store.getPool('lunch').some(d => d.id === 'old'), false);
  assert.equal(store.addCustomDishes(['老店'], 'restaurant').skipped, 1);
});

test('new restaurants and dishes persist distinct versioned types', () => {
  store.addCustomDishes(['同名项目'], 'restaurant');
  store.addCustomDishes(['同名项目'], 'lunch');
  const [restaurant, dish] = storage.wte_custom_dishes;
  assert.equal(restaurant.type, 'restaurant');
  assert.equal(restaurant.meal, null);
  assert.equal(dish.type, 'dish');
  assert.equal(dish.meal, 'lunch');
  assert.equal(restaurant.schemaVersion, 2);
  assert.equal(dish.schemaVersion, 2);
  assert.equal(store.getPool('restaurant').length, 1);
});

test('legacy and newly written histories retain restaurant identity', () => {
  storage.wte_history = [{ name: '老店', meal: 'restaurant', ts: Date.now() }];
  assert.equal(store.getHistory()[0].meal, null);
  assert.equal(store.getHistory()[0].type, 'restaurant');
  assert.equal(store.getHistoryGroups()[0].items[0].mealName, '饭店');
  store.addHistory({ name: '新店', type: 'restaurant', meal: null }, 'restaurant');
  assert.ok(storage.wte_history.every(entry => entry.type === 'restaurant' && entry.meal === null && entry.schemaVersion === 2));
});
