const { guard } = require('../../utils/storage.js');
const store = require('../../utils/store.js');
const { MEALS } = require('../../data/dishes.js');

Page({
  data: {
    meals: MEALS,
    activeMeal: 'lunch',
    group: null,
    showAdd: false,
    defaultMeal: 'lunch'
  },

  onLoad() {
    this.setData({ activeMeal: store.defaultMealKey(new Date()) });
  },

  onShow() {
    this.refresh();
  },

  switchMeal(e) {
    const { key } = e.currentTarget.dataset;
    if (key !== this.data.activeMeal) this.refresh(key);
  },

  refresh(activeMeal = this.data.activeMeal) {
    const meal = MEALS.find((g) => g.key === activeMeal);
    if (!meal) return;
    const custom = store.getCustomDishes();
    const items = store.getBuiltInDishes().concat(custom)
      .filter((d) => store.entryMatch(d, activeMeal))
      .map((d) => {
        const { fav, excluded } = store.getFlag(d.id);
        const isCustom = custom.includes(d);
        return {
          id: d.id,
          name: d.name,
          isCustom,
          tag: d.meal === 'main' ? '午晚通用' : '',
          fav,
          excluded
        };
      });
    this.setData({ activeMeal, group: { ...meal, items } });
  },

  onFav(e) {
      return guard(() => {
    const it = e.currentTarget.dataset.item;
    store.setFlag(it.id, 'fav', !it.fav);
    this.refresh();
  
      });
},

  onExclude(e) {
      return guard(() => {
    const it = e.currentTarget.dataset.item;
    store.setFlag(it.id, 'excluded', !it.excluded);
    this.refresh();
  
      });
},

  onDelete(e) {
    const it = e.currentTarget.dataset.item;
    wx.showModal({
      title: '删除项目',
      content: it.tag === '午晚通用'
        ? `确定从午餐和晚餐中删除「${it.name}」？`
        : `确定删除「${it.name}」？删除后将不再参与抽选。`,
      confirmText: '删除',
      confirmColor: '#E8553D',
      success: (res) => {
        if (res.confirm) {
          guard(() => {
            store.deleteEntry(it.id);
            this.refresh();
          });
        }
      }
    });
  },

  openAdd() {
    this.setData({ showAdd: true, defaultMeal: this.data.activeMeal });
  },

  onAddClose() {
    this.setData({ showAdd: false });
  },

  onAdded(e) {
    this.setData({ showAdd: false });
    const { added, skipped } = e.detail;
    if (added > 0) {
      wx.showToast({ title: `已加入 ${added} 项${skipped ? `，${skipped} 项已存在` : ''}`, icon: 'none' });
    } else {
      wx.showToast({ title: '这些名称已经存在啦', icon: 'none' });
    }
    this.refresh();
  }
});
