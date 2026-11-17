const { guard } = require('../../utils/storage.js');
const store = require('../../utils/store.js');

const MEAL_OPTIONS = [
  { key: 'restaurant', name: '饭店' },
  { key: 'breakfast', name: '早餐' },
  { key: 'lunch', name: '午餐' },
  { key: 'dinner', name: '晚餐' },
  { key: 'night', name: '夜宵' },
  { key: 'main', name: '午晚通用' }
];

Component({
  properties: {
    visible: { type: Boolean, value: false },
    defaultMeal: { type: String, value: 'lunch' }
  },

  data: {
    name: '',
    meal: 'lunch',
    meals: MEAL_OPTIONS
  },

  observers: {
    visible(v) {
      if (v) this.setData({ name: '', meal: this.data.defaultMeal || 'lunch' });
    }
  },

  methods: {
    noop() {},

    onInput(e) {
      this.setData({ name: e.detail.value });
    },

    pickMeal(e) {
      this.setData({ meal: e.currentTarget.dataset.key });
    },

    close() {
      this.triggerEvent('close');
    },

    confirm() {
      return guard(() => {
      if (this.data.meal === 'restaurant' && this.data.name.split(/[，,、;；\n\r]+/).some((name) => Array.from(name.trim()).length > 80)) {
        wx.showToast({ title: '每家饭店名称最多80个字符，请缩短后添加', icon: 'none' });
        return;
      }
      const names = store.parseBatch(this.data.name, this.data.meal);
      if (!names.length) {
        wx.showToast({ title: '先输入名称哦', icon: 'none' });
        return;
      }
      const { added, skipped } = store.addCustomDishes(names, this.data.meal);
      // 由父页面在 onAdded 里关闭弹窗并提示
      this.triggerEvent('added', { added, skipped });
    
      });
}
  }
});
