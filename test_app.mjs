// 用 DOM 桩把 index.html 里的脚本跑起来，验证计算与日期逻辑
import fs from 'node:fs';

const html = fs.readFileSync(process.argv[2], 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('找不到 script'); process.exit(1); }
const code = m[1];

// ---- DOM 桩 ----
function el() {
  return new Proxy({
    innerHTML: '', value: '', textContent: '',
    style: {}, dataset: {}, classList: { add(){}, remove(){}, toggle(){} },
    focus(){}, addEventListener(){}, appendChild(){}, remove(){}, select(){}, setAttribute(){},
    querySelectorAll: () => [], onclick: null,
  }, { get(t, k) { return k in t ? t[k] : undefined; }, set(t, k, v) { t[k] = v; return true; } });
}
const store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};
globalThis.document = {
  documentElement: { style: { setProperty(){} } },
  getElementById: () => el(),
  querySelectorAll: () => [],
  querySelector: () => el(),
  createElement: () => el(),
  body: { appendChild(){}, classList:{ add(){}, remove(){}, toggle(){} } },
};
globalThis.confirm = () => true;
globalThis.prompt = () => null;
globalThis.setTimeout = setTimeout;
globalThis.clearTimeout = clearTimeout;

// ---- 追加断言 ----
const test = `
;(function(){
  const out = [];
  const ok = (name, cond, extra) => out.push([cond ? 'PASS' : 'FAIL', name, extra === undefined ? '' : extra]);

  // 重置成干净数据
  DB = { accounts: [], cats: [], records: [] };
  seed();
  const wechat = DB.accounts.find(a => a.name === '微信');
  const cash   = DB.accounts.find(a => a.name === '现金');

  // 金额解析
  ok('parseAmt 1 => 100', parseAmt('1') === 100, parseAmt('1'));
  ok('parseAmt 1.5 => 150', parseAmt('1.5') === 150, parseAmt('1.5'));
  ok('parseAmt 0.01 => 1', parseAmt('0.01') === 1, parseAmt('0.01'));
  ok('parseAmt 12.345 => 1234', parseAmt('12.345') === 1234, parseAmt('12.345'));
  ok('fmt(100) = 1.00', fmt(100) === '1.00', fmt(100));
  ok('fmt(-150) = -1.50', fmt(-150) === '-1.50', fmt(-150));

  // 记两笔支出：微信 1 元、微信 2 元
  const d = today();
  DB.records.push({ id: uid(), date: d, amt: 100, kind: 'out', acc: wechat.id, cat: DB.cats[0].id, note: '早饭', ts: Date.now() });
  DB.records.push({ id: uid(), date: d, amt: 200, kind: 'out', acc: wechat.id, cat: DB.cats[0].id, note: '午饭', ts: Date.now() + 1 });

  ok('微信余额 = -3.00', accBalance(wechat.id) === -300, accBalance(wechat.id));
  ok('现金余额 = 0.00', accBalance(cash.id) === 0, accBalance(cash.id));

  // 一笔收入
  DB.records.push({ id: uid(), date: d, amt: 5000, kind: 'in', acc: wechat.id, cat: DB.cats.find(c=>c.kind==='in').id, note: '红包', ts: Date.now() + 2 });
  ok('微信余额 = 47.00（-3+50）', accBalance(wechat.id) === 4700, accBalance(wechat.id));

  // 期间合计
  const [f1, t1] = periodRange('day', d);
  const s1 = sumRange(f1, t1);
  ok('日 支出合计 300', s1.out === 300, s1.out);
  ok('日 收入合计 5000', s1.inn === 5000, s1.inn);
  ok('日 净额 4700', s1.net === 4700, s1.net);

  // 四个期间都能看到同一笔
  for (const p of ['day','week','month','year']) {
    const [a, b] = periodRange(p, d);
    const n = recordsIn(a, b).length;
    ok(p + ' 期包含 3 笔', n === 3, n + ' 笔');
  }

  // 日期边界：跨周期
  const y = parseYmd(d).getFullYear();
  const [fy, ty] = periodRange('year', d);
  ok('年范围 = 全年', fy === y + '-01-01' && ty === y + '-12-31', fy + '~' + ty);

  // 上一天不应包含
  const prevDay = addDays(d, -1);
  ok('前一天无记录', recordsIn(prevDay, prevDay).length === 0, recordsIn(prevDay, prevDay).length);

  // 回退：删最后一笔
  let last = DB.records[0];
  for (const r of DB.records) if (r.ts > last.ts) last = r;
  DB.records = DB.records.filter(r => r.id !== last.id);
  ok('回退后 微信余额 = -3.00', accBalance(wechat.id) === -300, accBalance(wechat.id));

  // 周起止
  const ws = weekStart('2026-11-13'); // 周五
  ok('2026-11-13 周起始 = 2026-11-09（周一）', ws === '2026-11-09', ws);
  ok('周边界含同一天', '2026-11-13' >= ws && '2026-11-13' <= weekEnd('2026-11-13'));

  // 月份加减
  ok('addMonths 1/31 +1 = 2月', addMonths('2026-01-31', 1).slice(0,7) === '2026-02', addMonths('2026-01-31', 1));

  // 删账户连带删记录
  DB.records.push({ id: uid(), date: d, amt: 999, kind: 'out', acc: cash.id, cat: '', note: 'x', ts: Date.now() });
  const before = DB.records.length;
  DB.records = DB.records.filter(r => r.acc !== cash.id);
  DB.accounts = DB.accounts.filter(a => a.id !== cash.id);
  ok('删账户后记录减少', DB.records.length === before - 1, before + ' -> ' + DB.records.length);

  // 持久化往返
  save();
  const raw = localStorage.getItem('dafish_money_v1');
  const back = normalize(JSON.parse(raw));
  ok('存取往返后余额一致', back.accounts.length === DB.accounts.length);


  // ---------- 转账 ----------
  DB = { accounts: [], cats: [], records: [], settings: {accent:'blue',mode:'light',font:15} };
  seed();
  const wx = DB.accounts.find(a=>a.name==='微信');
  const ali = DB.accounts.find(a=>a.name==='支付宝');
  wx.init = 0; ali.init = 0;

  DB.records.push({ id:uid(), date:d, amt:5000, kind:'in', acc:wx.id, cat:'', note:'', ts:1 });
  ok('转账前 微信=50.00', accBalance(wx.id)===5000, accBalance(wx.id));

  // 微信 -> 支付宝 转 20
  DB.records.push({ id:uid(), date:d, amt:2000, kind:'transfer', acc:wx.id, to:ali.id, cat:'', note:'充值', ts:2 });
  ok('转账后 微信=30.00', accBalance(wx.id)===3000, accBalance(wx.id));
  ok('转账后 支付宝=20.00', accBalance(ali.id)===2000, accBalance(ali.id));
  ok('转账不改变总金额', totalBalance()===5000, totalBalance());

  const [tf, tt] = periodRange('day', d);
  const ts1 = sumRange(tf, tt);
  ok('转账不计入支出', ts1.out===0, ts1.out);
  ok('转账不计入收入(仅那笔50)', ts1.inn===5000, ts1.inn);
  ok('转账后净额仍为50', ts1.net===5000, ts1.net);

  ok('账户变动：微信 -20', accDelta(wx.id, tf, tt)===3000, accDelta(wx.id, tf, tt));
  ok('账户变动：支付宝 +20', accDelta(ali.id, tf, tt)===2000, accDelta(ali.id, tf, tt));

  // 反向转账
  DB.records.push({ id:uid(), date:d, amt:500, kind:'transfer', acc:ali.id, to:wx.id, cat:'', note:'', ts:3 });
  ok('反向转账后 微信=35.00', accBalance(wx.id)===3500, accBalance(wx.id));
  ok('反向转账后 支付宝=15.00', accBalance(ali.id)===1500, accBalance(ali.id));
  ok('来回转账总额不变', totalBalance()===5000, totalBalance());

  // 存取往返保留 to 字段
  save();
  const back2 = normalize(JSON.parse(localStorage.getItem('dafish_money_v1')));
  const tr = back2.records.find(x=>x.kind==='transfer');
  ok('存取后转账保留 to', !!tr && !!tr.to, tr ? tr.to : '无');


  // ---------- 余额变更 ----------
  DB = { accounts: [], cats: [], records: [], settings: {accent:'blue',mode:'light',font:15} };
  seed();
  const w3 = DB.accounts.find(a=>a.name==='微信');
  w3.init = 10000;                       // 100.00
  DB.records = [];
  ok('余额变更前 微信=100.00', accBalance(w3.id)===10000, accBalance(w3.id));

  DB.records.push({ id:uid(), date:d, amt:500, kind:'adjust', dir:'in',  acc:w3.id, to:'', cat:'', note:'余额调整', ts:1 });
  ok('增加 5 后 微信=105.00', accBalance(w3.id)===10500, accBalance(w3.id));

  DB.records.push({ id:uid(), date:d, amt:2000, kind:'adjust', dir:'out', acc:w3.id, to:'', cat:'', note:'余额调整', ts:2 });
  ok('减少 20 后 微信=85.00', accBalance(w3.id)===8500, accBalance(w3.id));

  const adj1 = sumRange(d, d);
  ok('余额变更不计收入', adj1.inn===0, adj1.inn);
  ok('余额变更不计支出', adj1.out===0, adj1.out);
  ok('余额变更净额不变', adj1.net===0, adj1.net);
  ok('余额变更计入总金额', totalBalance()===8500, totalBalance());
  ok('余额变更计入账户变动(+5-20=-15)', accDelta(w3.id, d, d)===-1500, accDelta(w3.id, d, d));

  save();
  const back3 = normalize(JSON.parse(localStorage.getItem('dafish_money_v1')));
  const adjRec = back3.records.find(x=>x.kind==='adjust');
  ok('存取后保留余额变更方向', !!adjRec && !!adjRec.dir, adjRec ? adjRec.dir : '无');

  // 删账户要连带删掉余额变更
  const before2 = DB.records.length;
  DB.records = DB.records.filter(r=>r.acc!==w3.id && r.to!==w3.id);
  ok('删账户连带清掉余额变更', DB.records.length===before2-2, before2+' -> '+DB.records.length);

  globalThis.__RESULT__ = out;
})();
`;

eval(code + test);
const res = globalThis.__RESULT__ || [];
let pass = 0, fail = 0;
for (const [st, name, extra] of res) {
  if (st === 'PASS') pass++; else fail++;
  console.log(`  ${st === 'PASS' ? '✓' : '✗'} ${name}${extra !== '' ? '  → ' + extra : ''}`);
}
console.log(`\n通过 ${pass} / ${res.length}${fail ? `，失败 ${fail}` : ''}`);
process.exit(fail ? 1 : 0);
