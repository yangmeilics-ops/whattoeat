const { guard } = require('../../utils/storage.js');
const store = require('../../utils/store.js');

Page({
  data: {
    groups: [],
    total: 0
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    this.setData({
      groups: store.getHistoryGroups(),
      total: store.getHistory().length
    });
  },

  clearAll() {
    wx.showModal({
      title: '清空历史',
      content: '记录清空后找不回来，确定吗？',
      confirmText: '清空',
      confirmColor: '#E8553D',
      success: (res) => {
        if (res.confirm) {
          guard(() => { store.clearHistory(); this.refresh(); });
        }
      }
    });
  }
});
