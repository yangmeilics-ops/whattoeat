const { test } = require('node:test');
const assert = require('node:assert/strict');
const storage = require('../utils/storage');
test('invalid containers and records cannot crash reads; originals backed up before repair', () => {
 const data = { wte_custom_dishes: [null, {id:'r', name:'A B',type:'restaurant',meal:null}], wte_history:'broken', wte_dish_flags:42 };
 global.wx = { getStorageSync:k=>data[k], setStorageSync:(k,v)=>{data[k]=v;} };
 assert.equal(storage.read('wte_custom_dishes',[]).length,1);
 assert.deepEqual(storage.read('wte_history',[]),[]);
 assert.deepEqual(storage.read('wte_dish_flags',{}),{});
 storage.write('wte_history',[]);
 assert.ok(Object.keys(data).some(k=>k.startsWith('wte_history_recovery_') && data[k]==='broken'));
});
test('failed reads forbid destructive replacement; failed writes propagate to caller', () => {
 global.wx={getStorageSync:()=>{throw Error('read');},setStorageSync:()=>{throw Error('write');}};
 assert.deepEqual(storage.read('unreadable',[]),[]);
 assert.throws(()=>storage.write('unreadable',[]));
 assert.throws(()=>storage.write('other',[]));
 let success=false;
 storage.guard(()=>{storage.write('other',[]);success=true;});
 assert.equal(success,false);
});
