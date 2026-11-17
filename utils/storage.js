// Reads never replace damaged data. A write is blocked until the original can be backed up.
const damaged = new Map();
const unreadable = new Set();
function report(title) { if (wx.showToast) wx.showToast({ title, icon: 'none' }); }
function object(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function read(key, fallback) {
  let value;
  try { value = wx.getStorageSync(key); unreadable.delete(key); }
  catch (error) { unreadable.add(key); report('读取本地数据失败，请重试'); return fallback; }
  if (value === undefined || value === null || value === '') return fallback;
  let clean = value;
  if (key === 'wte_custom_dishes' || key === 'wte_history') {
    clean = Array.isArray(value) ? value.filter(v => object(v) && typeof v.name === 'string' && v.name.trim() &&
      (key === 'wte_history' ? Number.isFinite(v.ts) && !Number.isNaN(new Date(v.ts).getTime()) : typeof v.id === 'string' && v.id && (v.type === 'restaurant' || ['restaurant','breakfast','lunch','dinner','night','main'].includes(v.meal)))) : [];
  } else if (key === 'wte_dish_flags') {
    clean = {};
    if (object(value)) Object.keys(value).filter(k => !['__proto__','constructor','prototype'].includes(k)).forEach(k => {
      if (object(value[k])) {
        clean[k] = value[k].deleted === true
          ? { deleted: true }
          : { fav: value[k].fav === true, excluded: value[k].excluded === true, hidden: value[k].hidden === true };
      }
    });
  }
  if (JSON.stringify(clean) !== JSON.stringify(value)) damaged.set(key, value);
  return clean;
}
function write(key, value) {
  try {
    if (unreadable.has(key)) throw new Error('Storage read failed; refusing overwrite');
    if (damaged.has(key)) {
      wx.setStorageSync(key + '_recovery_' + Date.now(), damaged.get(key));
      damaged.delete(key);
    }
    wx.setStorageSync(key, value);
  } catch (error) { report('保存失败，请检查存储空间后重试'); throw error; }
}
function remove(key) { write(key, []); }
function guard(fn) { try { return fn(); } catch (error) { report('操作未完成，请重试'); return undefined; } }
module.exports = { read, write, remove, guard };
