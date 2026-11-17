const { guard } = require('../../utils/storage.js');
const store = require('../../utils/store.js');
const { MEALS } = require('../../data/dishes.js');

const IDLE_TIPS = [
  '饿了就摇，摇完就吃',
  '选择困难？交给命运',
  '今天吃点什么好呢…',
  '摇出什么就吃什么，不许反悔'
];

const LAND_QUIPS = [
  '就它了，别纠结！',
  '天选之饭已诞生 🎉',
  '这一餐，命中注定',
  '吃这个，准香！',
  '命运说了算，开炫！'
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

Page({
  data: {
    meals: MEALS.filter((meal) => meal.key !== 'restaurant'),
    mode: 'dishes',
    activeMeal: 'lunch',
    display: { emoji: '🍚', name: '今天吃什么？' },
    quipText: IDLE_TIPS[0],
    result: null,
    spinning: false,
    landing: false,
    poolEmpty: false,
    showAdd: false
  },

  onLoad() {
    this.setData({ activeMeal: store.defaultMealKey(new Date()) });
  },

  onShow() {
    this.checkPool();
    const result = this.data.result;
    if (result) {
      const current = store.getPool(this.data.activeMeal).find((dish) => dish.id === result.id);
      if (current) this.setData({ result: current });
      else this.setData({
        result: null,
        display: { name: this.data.mode === 'restaurant' ? '今天去哪吃？' : '今天吃什么？' },
        quipText: pick(IDLE_TIPS)
      });
    }
  },

  onHide() {
    this.stopSpin();
  },

  onUnload() {
    this.stopSpin();
  },

  stopSpin() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    const patch = { spinning: false, landing: false };
    if (this.data.spinning) {
      patch.display = { name: this.data.mode === 'restaurant' ? '今天去哪吃？' : '今天吃什么？' };
      patch.quipText = pick(IDLE_TIPS);
    }
    this.setData(patch);
  },

  checkPool() {
    const empty = store.getPool(this.data.activeMeal).length === 0;
    if (empty !== this.data.poolEmpty) this.setData({ poolEmpty: empty });
  },

  switchMode(e) {
    if (this.data.spinning) return;
    const mode = e.currentTarget.dataset.mode;
    if (!['dishes', 'restaurant'].includes(mode) || mode === this.data.mode) return;
    if (mode === 'restaurant') this._dishMeal = this.data.activeMeal;
    const key = mode === 'restaurant' ? 'restaurant' : (this._dishMeal || store.defaultMealKey(new Date()));
    this.stopSpin();
    this.setData({ mode, activeMeal: key, result: null,
      display: { name: mode === 'restaurant' ? '今天去哪吃？' : '今天吃什么？' },
      quipText: mode === 'restaurant' ? '选一家喜欢的店，出发吧' : pick(IDLE_TIPS),
      poolEmpty: store.getPool(key).length === 0 });
  },

  switchMeal(e) {
    if (this.data.spinning) return;
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activeMeal) return;
    this.stopSpin();
    this.setData({
      activeMeal: key,
      result: null,
      display: { emoji: '🍚', name: '今天吃什么？' },
      quipText: pick(IDLE_TIPS),
      poolEmpty: store.getPool(key).length === 0
    });
  },

  // 老虎机：先匀速快滚，再缓动减速，最后定格在结果上
  spin() {
    if (this.data.spinning) return;
    this.stopSpin();
    const pool = store.getPool(this.data.activeMeal);
    if (!pool.length) {
      this.setData({ poolEmpty: true });
      wx.showToast({ title: '暂无可选项，请先添加或恢复', icon: 'none' });
      return;
    }
    const chosen = store.randomDish(pool);
    const delays = [];
    for (let i = 0; i < 10; i++) delays.push(55);
    let d = 60;
    while (d < 300) {
      delays.push(d);
      d = Math.round(d * 1.3);
    }

    this.setData({ spinning: true, result: null, poolEmpty: false, quipText: '命运的齿轮开始转动…' });

    let k = 0;
    const step = () => {
      const isLast = k === delays.length;
      const dish = isLast ? chosen : pool[Math.floor(Math.random() * pool.length)];
      const patch = { display: { emoji: dish.emoji, name: dish.name } };
      if (isLast) {
        patch.spinning = false;
        patch.result = { ...chosen };
        patch.landing = true;
        patch.quipText = pick(LAND_QUIPS);
        this.setData(patch);
        guard(() => store.addHistory(chosen, this.data.activeMeal));
        if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' });
        this._timer = setTimeout(() => {
          this._timer = null;
          this.setData({ landing: false });
        }, 900);
        return;
      }
      this.setData(patch);
      this._timer = setTimeout(step, delays[k]);
      k++;
    };
    step();
  },

  favDish() {
      return guard(() => {
    const r = this.data.result;
    if (!r) return;
    const fav = !r.fav;
    store.setFlag(r.id, 'fav', fav);
    this.setData({ 'result.fav': fav });
    wx.showToast({ title: fav ? '已收藏，它更容易被摇中啦' : '取消收藏了', icon: 'none' });
  
      });
},

  // 不想吃：排除这道菜并立刻再摇
  skipDish() {
      return guard(() => {
    const r = this.data.result;
    if (!r) return;
    store.setFlag(r.id, 'excluded', true);
    wx.showToast({ title: '已暂停抽选「' + r.name + '」', icon: 'none' });
    if (!store.getPool(this.data.activeMeal).length) {
      this.setData({
        result: null,
        poolEmpty: true,
        display: { emoji: '🥲', name: '暂无参与抽选的项目' },
        quipText: '候选项全部暂停了，请添加或到菜库恢复'
      });
      return;
    }
    this.spin();
  
      });
},

  copyDish() {
    const r = this.data.result;
    if (!r) return;
    wx.setClipboardData({
      data: r.name,
      success: () => {
        wx.hideToast();
        wx.showToast({ title: '名称已复制', icon: 'none' });
      }
    });
  },

  openAdd() {
    this.setData({ showAdd: true });
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
    this.checkPool();
  },

  onShareAppMessage() {
    const r = this.data.result;
    return {
      title: r ? `我今天吃「${r.name}」，你吃啥？` : '今天吃什么？摇一摇就知道',
      path: '/pages/index/index'
    };
  }
});
