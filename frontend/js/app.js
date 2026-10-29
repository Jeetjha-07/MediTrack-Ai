const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const state = { medicines: [], saleMedicines: [], batches: [], sales: [], alerts: [], summary: null, forecast: null, salesChart: null, forecastChart: null, salesAnalyticsCharts: {}, page: 'dashboard' };
const money = n => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(n||0));
const date = d => d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const dateTime = d => d ? new Date(d).toLocaleString('en-IN',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = (name, className='icon') => `<svg class="${className}" aria-hidden="true" focusable="false"><use href="#icon-${name}"></use></svg>`;
async function api(path, options={}) {
  const res = await fetch('/api'+path,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
function toast(message, isError=false) {
  const el=$('#toast'); el.textContent=message; el.classList.remove('hidden','error'); if(isError) el.classList.add('error');
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.add('hidden'),4000);
}
function statusTag(text,type='neutral'){return `<span class="status ${type}">${esc(text)}</span>`;}
function showPage(page) {
  state.page=page;
  $$('.page').forEach(el=>el.classList.add('hidden'));
  $(`#page-${page}`)?.classList.remove('hidden');
  $$('.nav-item[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===page));
  const titles={dashboard:['Overview','YOUR PHARMACY AT A GLANCE'],medicines:['Medicines','CATALOGUE & PRODUCT DETAILS'],batches:['Inventory & batches','STOCK AND EXPIRY TRACKING'],sales:['Sales history','TRANSACTION MANAGEMENT'],alerts:['Inventory alerts','EXPIRY & REPLENISHMENT'],forecast:['AI demand forecast','HISTORICAL SALES → FUTURE ESTIMATES']};
  $('#pageTitle').textContent=titles[page][0]; $('#pageEyebrow').textContent=titles[page][1];
  if(page==='medicines') loadMedicines(); if(page==='batches') loadBatches(); if(page==='sales'){loadSales();loadSalesAnalytics();} if(page==='alerts') loadAlerts(); if(page==='forecast') loadLatestForecast();
}
function setLoggedIn(on) { $('#loginView').classList.toggle('hidden',on); $('#appView').classList.toggle('hidden',!on); }
async function bootstrap() {
  $('#todayLabel').textContent=new Date().toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
  try { const me=await api('/auth/me'); if(me.authenticated){setLoggedIn(true); await loadDashboard();} else setLoggedIn(false); } catch {setLoggedIn(false);}
}
$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault(); $('#loginError').textContent='';
  const fd=new FormData(e.currentTarget);
  try { await api('/auth/login',{method:'POST',body:JSON.stringify({email:fd.get('email'),password:fd.get('password')})}); setLoggedIn(true); await loadDashboard(); }
  catch(err){$('#loginError').textContent=err.message;}
});
$('#logoutBtn').addEventListener('click',async()=>{try{await api('/auth/logout',{method:'POST',body:'{}'});}catch{} setLoggedIn(false);});
$('#mainNav').addEventListener('click',e=>{const btn=e.target.closest('[data-page]');if(btn)showPage(btn.dataset.page);});
document.addEventListener('click',e=>{const btn=e.target.closest('[data-go]');if(btn)showPage(btn.dataset.go);});
$$('[data-close]').forEach(btn=>btn.addEventListener('click',()=>$('#'+btn.dataset.close).close()));
async function loadDashboard(){
  try {
    const [summary,alerts]=await Promise.all([api('/dashboard/summary'),api('/alerts')]); state.summary=summary;state.alerts=alerts;
    $('#metricMedicines').textContent=summary.medicineCount;$('#metricLow').textContent=summary.lowStockCount;$('#metricExpiring').textContent=summary.expiringSoonCount;$('#metricRevenue').textContent=money(summary.revenue30Days);$('#metricTransactions').textContent=`${summary.transactions30Days} completed sales in 30 days`;
    $('#alertBadge').textContent=alerts.length;
    $('#dashboardAlerts').innerHTML=summary.alerts.length?summary.alerts.map(a=>`<div class="alert-row"><span class="alert-symbol ${a.type==='expired'?'critical':'warning'}">${icon(a.type==='expired'?'alert':'clock')}</span><div class="alert-copy"><strong>${esc(a.medicine||'Medicine')} · ${a.type==='expired'?'Expired':'Expiring soon'}</strong><p>Batch ${esc(a.batch)} · ${a.quantity} units · ${date(a.expiryDate)}</p></div></div>`).join(''):'<div class="empty-state">No priority expiry alerts. Nice work.</div>';
    $('#recentSalesBody').innerHTML=summary.recentSales.length?summary.recentSales.map(s=>`<tr><td><strong>${esc(s.saleNumber)}</strong></td><td>${dateTime(s.soldAt)}</td><td>${s.items.length} line item(s)</td><td>${money(s.totalAmount)}</td><td>${statusTag(s.status,'healthy')}</td></tr>`).join(''):'<tr><td colspan="5" class="empty-state">No sales yet. Record your first sale.</td></tr>';
    renderSalesChart(summary.chart||[]);
  } catch(err){toast(err.message,true);}
}
function renderSalesChart(rows){
  const ctx=$('#salesChart'); if(!ctx||!window.Chart)return;
  const map=new Map(rows.map(r=>[r._id,Number(r.revenue)])); const labels=[],values=[];
  for(let i=6;i>=0;i--){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-i);const key=d.toISOString().slice(0,10);labels.push(d.toLocaleDateString('en-IN',{day:'numeric',month:'short'}));values.push(map.get(key)||0);}
  if(state.salesChart)state.salesChart.destroy();
  state.salesChart=new Chart(ctx,{type:'line',data:{labels,datasets:[{data:values,label:'Revenue',borderColor:'#2e8379',backgroundColor:'rgba(46,131,121,.10)',fill:true,tension:.35,pointRadius:3,pointBackgroundColor:'#2e8379'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>money(c.raw)}}},scales:{x:{grid:{display:false},ticks:{color:'#8995a3',font:{size:10}}},y:{beginAtZero:true,grid:{color:'#eef1f4'},ticks:{color:'#8995a3',font:{size:10},callback:v=>v>=1000?`₹${v/1000}k`:`₹${v}`}}}}});
}
async function loadMedicines(){
  try{const search=$('#medicineSearch')?.value||'';state.medicines=await api('/medicines?search='+encodeURIComponent(search));renderMedicines();}
  catch(err){toast(err.message,true);}
}
function renderMedicines(){
  $('#medicineCount').textContent=`${state.medicines.length} medicines`;
  $('#medicinesBody').innerHTML=state.medicines.length?state.medicines.map(m=>`<tr><td><strong>${esc(m.name)}</strong><br><span class="muted small-text">${esc(m.unit)}</span></td><td>${esc(m.medicineCode)}</td><td>${esc(m.category)}</td><td><strong>${m.totalStock}</strong></td><td>${money(m.sellingPrice)}</td><td>${m.totalStock<=m.reorderLevel?statusTag('Low stock','warning'):statusTag('In stock','healthy')}</td><td><button class="text-btn" data-archive="${m._id}">Archive</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty-state">No medicines found. Add your first medicine.</td></tr>';
  const options=state.medicines.map(m=>`<option value="${m._id}" data-price="${m.sellingPrice}">${esc(m.name)} · ${esc(m.medicineCode)} (stock ${m.totalStock})</option>`).join('');
  $('#batchMedicineSelect').innerHTML=options||'<option value="">Add a medicine first</option>';
}
async function loadSaleMedicines(){
  state.saleMedicines=await api('/medicines');
}
$('#medicineSearch').addEventListener('input',()=>{clearTimeout(loadMedicines.timer);loadMedicines.timer=setTimeout(loadMedicines,250);});
$('#medicinesBody').addEventListener('click',async e=>{const b=e.target.closest('[data-archive]');if(!b)return;if(!confirm('Archive this medicine? Historical sales will be preserved.'))return;try{await api('/medicines/'+b.dataset.archive,{method:'DELETE'});toast('Medicine archived.');loadMedicines();}catch(err){toast(err.message,true);}});
$('#addMedicineBtn').addEventListener('click',()=>{ $('#medicineForm').reset();$('#medicineFormError').textContent='';$('#medicineDialog').showModal();});
$('#medicineForm').addEventListener('submit',async e=>{
  e.preventDefault();const fd=new FormData(e.currentTarget);const d=Object.fromEntries(fd.entries());$('#medicineFormError').textContent='';
  if(d.batchNumber&&!d.expiryDate){$('#medicineFormError').textContent='Enter an expiry date for the initial batch.';return;}
  if(!d.batchNumber&&d.expiryDate){$('#medicineFormError').textContent='Enter a batch number or clear the expiry date.';return;}
  ['sellingPrice','reorderLevel','quantity','purchaseCost'].forEach(k=>d[k]=Number(d[k]||0));
  try{await api('/medicines',{method:'POST',body:JSON.stringify(d)});$('#medicineDialog').close();toast('Medicine saved.');await loadMedicines();await loadDashboard();}catch(err){$('#medicineFormError').textContent=err.message;}
});
async function loadBatches(){
  try{state.batches=await api('/batches');$('#batchesBody').innerHTML=state.batches.length?state.batches.map(b=>`<tr><td><strong>${esc(b.medicineId?.name||'Medicine')}</strong><br><span class="muted small-text">${esc(b.medicineId?.medicineCode||'')}</span></td><td>${esc(b.batchNumber)}</td><td>${date(b.expiryDate)}</td><td>${b.quantityReceived}</td><td><strong>${b.quantityAvailable}</strong></td><td>${money(b.purchaseCost)}</td><td>${b.expired?statusTag('Expired','critical'):b.expiringSoon?statusTag('Expiring soon','warning'):statusTag('Valid','healthy')}</td></tr>`).join(''):'<tr><td colspan="7" class="empty-state">No batches yet.</td></tr>';}
  catch(err){toast(err.message,true);}
}
$('#addBatchBtn').addEventListener('click',async()=>{await loadMedicines();$('#batchForm').reset();$('#batchFormError').textContent='';if(!state.medicines.length){toast('Add a medicine before creating a batch.',true);return;}$('#batchDialog').showModal();});
$('#batchForm').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget).entries());d.quantity=Number(d.quantity);d.purchaseCost=Number(d.purchaseCost);try{await api('/batches',{method:'POST',body:JSON.stringify(d)});$('#batchDialog').close();toast('Batch added.');await loadBatches();await loadMedicines();await loadDashboard();}catch(err){$('#batchFormError').textContent=err.message;}});
async function loadSales(){
  try{state.sales=await api('/sales');$('#salesBody').innerHTML=state.sales.length?state.sales.map(s=>`<tr><td><strong>${esc(s.saleNumber)}</strong></td><td>${dateTime(s.soldAt)}</td><td>${s.items.map(i=>esc(i.medicineName)).join(', ')}</td><td>${s.items.reduce((n,i)=>n+i.quantity,0)}</td><td>${money(s.totalAmount)}</td><td>${statusTag(s.status,s.status==='completed'?'healthy':'neutral')}</td></tr>`).join(''):'<tr><td colspan="6" class="empty-state">No sales recorded yet.</td></tr>';}
  catch(err){toast(err.message,true);}
}
$('#salesAnalyticsPeriod').addEventListener('change',loadSalesAnalytics);
async function loadSalesAnalytics(){
  try{
    const analytics=await api('/sales/analytics?days='+$('#salesAnalyticsPeriod').value);
    renderSalesAnalytics(analytics);
  }catch(err){toast(err.message,true);}
}
function renderSalesAnalytics(analytics){
  $('#salesAnalyticsRevenue').textContent=money(analytics.revenue);
  $('#salesAnalyticsTransactions').textContent=analytics.transactions;
  $('#salesAnalyticsAverage').textContent=money(analytics.averageTransaction);
  $('#salesAnalyticsUnits').textContent=analytics.unitsSold;
  if(analytics.previousRevenue>0){
    const change=(analytics.revenue-analytics.previousRevenue)/analytics.previousRevenue*100;
    $('#salesAnalyticsGrowth').textContent=`${change>0?'+':''}${change.toFixed(1)}% vs previous ${analytics.days} days`;
  }else{
    $('#salesAnalyticsGrowth').textContent=analytics.revenue>0?'No sales in previous period':'No revenue in either period';
  }
  renderSalesAnalyticsCharts(analytics);
}
function renderSalesAnalyticsCharts(analytics){
  if(!window.Chart)return;
  const colors=['#2e8379','#7894c4','#d9a441','#9b7ac4','#db7f65','#5e9bb5','#93ad67','#c16c91'];
  const trendMap=new Map((analytics.trend||[]).map(row=>[row._id,Number(row.revenue)]));
  const labels=[],revenues=[];
  for(let i=analytics.days-1;i>=0;i--){
    const day=new Date();
    day.setUTCHours(0,0,0,0);
    day.setUTCDate(day.getUTCDate()-i);
    const key=day.toISOString().slice(0,10);
    labels.push(day.toLocaleDateString('en-IN',{day:'numeric',month:'short',timeZone:'UTC'}));
    revenues.push(trendMap.get(key)||0);
  }
  const topProducts=analytics.topProducts||[];
  const categories=analytics.categories||[];
  const charts=[
    ['trend', '#salesAnalyticsTrend', {type:'line',data:{labels,datasets:[{data:revenues,label:'Revenue',borderColor:colors[0],backgroundColor:'rgba(46,131,121,.12)',fill:true,tension:.3,pointRadius:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>money(c.raw)}}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:10,color:'#8995a3'}},y:{beginAtZero:true,grid:{color:'#eef1f4'},ticks:{color:'#8995a3',callback:v=>v>=1000?`₹${v/1000}k`:`₹${v}`}}}}}],
    ['products', '#salesTopProducts', {type:'bar',data:{labels:topProducts.map(product=>product.name),datasets:[{label:'Units sold',data:topProducts.map(product=>product.quantity),backgroundColor:colors[0],borderRadius:5}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,grid:{color:'#eef1f4'},ticks:{precision:0,color:'#8995a3'}},y:{grid:{display:false},ticks:{color:'#758293'}}}}}],
    ['categories', '#salesCategoryChart', {type:'doughnut',data:{labels:categories.map(category=>category._id),datasets:[{data:categories.map(category=>category.revenue),backgroundColor:colors,borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:10,usePointStyle:true,color:'#758293'}},tooltip:{callbacks:{label:c=>`${c.label}: ${money(c.raw)}`}}}}}]
  ];
  for(const [key,selector,config] of charts){
    const canvas=$(selector);
    if(!canvas)continue;
    if(state.salesAnalyticsCharts[key])state.salesAnalyticsCharts[key].destroy();
    state.salesAnalyticsCharts[key]=new Chart(canvas,config);
  }
}
function getSaleRows(){
  return $$('.sale-item-row',$('#saleItems')).map(row=>({
    medicineId:$('.sale-medicine',row).value,
    quantity:$('.sale-quantity',row).value,
    unitPrice:$('.sale-price',row).value
  }));
}
function renderSaleItems(rows){
  const selectedIds=rows.map(row=>row.medicineId).filter(Boolean);
  $('#saleItems').innerHTML=rows.map((row,index)=>{
    const usedElsewhere=new Set(selectedIds.filter((id,i)=>i!==index));
    const options=state.saleMedicines.map(m=>{
      const disabled=m.totalStock<=0||usedElsewhere.has(m._id);
      return `<option value="${m._id}" data-price="${m.sellingPrice}" ${disabled?'disabled':''} ${row.medicineId===m._id?'selected':''}>${esc(m.name)} · ${esc(m.medicineCode)} (stock ${m.totalStock})</option>`;
    }).join('');
    return `<div class="sale-item-row"><label>Medicine<select class="sale-medicine" required><option value="">Choose medicine</option>${options}</select></label><label>Quantity<input class="sale-quantity" type="number" min="1" step="1" value="${esc(row.quantity||1)}" required></label><label>Selling price / unit (₹)<input class="sale-price" type="number" min="0" step="0.01" value="${esc(row.unitPrice??'')}" required></label><div class="sale-line-total"><span>Line total</span><strong>${money((Number(row.quantity)||0)*(Number(row.unitPrice)||0))}</strong></div><button type="button" class="sale-remove-btn" aria-label="Remove medicine ${index+1}" ${rows.length===1?'disabled':''}>${icon('trash')}</button></div>`;
  }).join('');
  updateSaleTotal();
}
function updateSaleTotal(){
  const total=getSaleRows().reduce((sum,row)=>sum+(Number(row.quantity)||0)*(Number(row.unitPrice)||0),0);
  $('#saleTotal').textContent=money(total);
  $$('.sale-item-row',$('#saleItems')).forEach(row=>{
    const quantity=Number($('.sale-quantity',row).value)||0;
    const price=Number($('.sale-price',row).value)||0;
    $('.sale-line-total strong',row).textContent=money(quantity*price);
  });
}
function startSale(){
  const first=state.saleMedicines.find(m=>m.totalStock>0);
  if(!first){toast('Add unexpired stock before recording a sale.',true);return false;}
  renderSaleItems([{medicineId:first._id,quantity:1,unitPrice:first.sellingPrice}]);
  $('#saleFormError').textContent='';
  return true;
}
$('#saleItems').addEventListener('change',e=>{
  if(!e.target.matches('.sale-medicine'))return;
  const row=e.target.closest('.sale-item-row');
  const price=e.target.selectedOptions[0]?.dataset.price||'';
  $('.sale-price',row).value=price;
  renderSaleItems(getSaleRows());
});
$('#saleItems').addEventListener('input',updateSaleTotal);
$('#saleItems').addEventListener('click',e=>{
  if(!e.target.closest('.sale-remove-btn'))return;
  const rows=getSaleRows();
  rows.splice($$('.sale-item-row',$('#saleItems')).indexOf(e.target.closest('.sale-item-row')),1);
  renderSaleItems(rows);
});
$('#addSaleItemBtn').addEventListener('click',()=>{
  const rows=getSaleRows();
  const selected=new Set(rows.map(row=>row.medicineId));
  const next=state.saleMedicines.find(m=>m.totalStock>0&&!selected.has(m._id));
  if(!next){toast('Every in-stock medicine is already in this sale.',true);return;}
  rows.push({medicineId:next._id,quantity:1,unitPrice:next.sellingPrice});
  renderSaleItems(rows);
});
$('#newSaleBtn').addEventListener('click',async()=>{
  $('#saleForm').reset();
  try{
    await loadSaleMedicines();
    if(!state.saleMedicines.length){toast('Add a medicine before recording sales.',true);return;}
    if(startSale())$('#saleDialog').showModal();
  }catch(err){toast(err.message,true);}
});
$('#saleForm').addEventListener('submit',async e=>{
  e.preventDefault();
  $('#saleFormError').textContent='';
  const items=getSaleRows().map(row=>({...row,quantity:Number(row.quantity),unitPrice:Number(row.unitPrice)}));
  if(!items.length||items.some(item=>!item.medicineId||!Number.isInteger(item.quantity)||item.quantity<1||!Number.isFinite(item.unitPrice)||item.unitPrice<0)){
    $('#saleFormError').textContent='Choose a medicine and enter a valid quantity and price for each item.';
    return;
  }
  try{
    const sale=await api('/sales',{method:'POST',body:JSON.stringify({items})});
    $('#saleDialog').close();
    toast(`Sale completed · ${money(sale.totalAmount)}`);
    await loadSales();await loadSalesAnalytics();await loadMedicines();await loadDashboard();
  }catch(err){$('#saleFormError').textContent=err.message;}
});
async function loadAlerts(){
  try{state.alerts=await api('/alerts');const expired=state.alerts.filter(a=>a.type==='expired'),expiring=state.alerts.filter(a=>a.type==='expiring'),low=state.alerts.filter(a=>a.type==='low_stock');
    $('#alertExpiredCount').textContent=expired.length;$('#alertExpiringCount').textContent=expiring.length;$('#alertLowCount').textContent=low.length;$('#alertBadge').textContent=state.alerts.length;
    $('#allAlerts').innerHTML=state.alerts.length?state.alerts.map(a=>`<article class="alert-card"><span class="alert-symbol ${a.severity==='critical'?'critical':a.type==='low_stock'?'info':'warning'}">${icon(a.type==='low_stock'?'package':a.type==='expired'?'alert':'clock')}</span><div class="alert-copy"><strong>${esc(a.medicine)} · ${a.type==='expired'?'Expired batch':a.type==='expiring'?'Expiring soon':'Low stock'}</strong><p>${a.type==='low_stock'?`Sellable stock ${a.quantity}; reorder threshold ${a.reorderLevel}.`:`Batch ${esc(a.batchNumber)} · expires ${date(a.expiryDate)} · ${a.quantity} units remaining.`}</p></div><div class="alert-right">${a.type==='low_stock'?statusTag('Reorder','warning'):statusTag(a.type==='expired'?'Expired':'Review',a.type==='expired'?'critical':'warning')}</div></article>`).join(''):'<div class="panel empty-state">All clear. No current inventory alerts.</div>';
  }catch(err){toast(err.message,true);}
}
$('#refreshAlertsBtn').addEventListener('click',loadAlerts);
$('#runForecastBtn').addEventListener('click',async()=>{
  const btn=$('#runForecastBtn');btn.disabled=true;btn.textContent='Working…';$('#forecastMeta').textContent='Preparing sales history and generating estimates…';
  try{state.forecast=await api('/forecasts/run',{method:'POST',body:JSON.stringify({horizonDays:Number($('#forecastHorizon').value)})});renderForecast(state.forecast);toast('Forecast generated.');}
  catch(err){$('#forecastMeta').textContent='Forecast unavailable.';toast(err.message,true);}
  finally{btn.disabled=false;btn.textContent='Run forecast ↗';}
});
async function loadLatestForecast(){
  try{const run=await api('/forecasts/latest?horizonDays='+$('#forecastHorizon').value);state.forecast=run;renderForecast(run);}
  catch(err){toast(err.message,true);}
}
$('#forecastHorizon').addEventListener('change',loadLatestForecast);
function renderForecast(run){
  const predictions=(run.predictions||[]).filter(p=>Number(p.suggestedReorder)>0);
  $('#forecastMeta').textContent=run.generatedAt?`Generated ${dateTime(run.generatedAt)} · Horizon ${run.horizonDays} days · Model ${run.modelName||'baseline'}`:(run.message||'No forecast generated yet.');
  $('#forecastBody').innerHTML=predictions.length?predictions.slice().sort((a,b)=>b.suggestedReorder-a.suggestedReorder).map(p=>{const ratio=p.totalDemand?Math.min(100,p.currentSellableStock/p.totalDemand*100):100;return `<tr><td><strong>${esc(p.medicineName)}</strong></td><td>${Math.round(p.totalDemand)} units</td><td>${p.currentSellableStock} units</td><td><strong>${p.suggestedReorder} units</strong></td><td><span class="demand-bar"><span style="width:${ratio}%"></span></span>Stockout risk</td></tr>`;}).join(''):'<tr><td colspan="5" class="empty-state">No projected stockouts for this forecast period.</td></tr>';
  renderForecastChart(predictions);
}
function renderForecastChart(predictions){
  const ctx=$('#forecastChart');if(!ctx||!window.Chart)return;if(state.forecastChart)state.forecastChart.destroy();
  const list=predictions.slice().sort((a,b)=>b.totalDemand-a.totalDemand).slice(0,10);
  state.forecastChart=new Chart(ctx,{type:'bar',data:{labels:list.map(p=>p.medicineName),datasets:[{label:'Forecast demand',data:list.map(p=>p.totalDemand),backgroundColor:'#3b8c81',borderRadius:5},{label:'Sellable stock',data:list.map(p=>p.currentSellableStock),backgroundColor:'#d8e4ee',borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{boxWidth:10,usePointStyle:true,font:{size:10},color:'#758293'}}},scales:{x:{grid:{display:false},ticks:{color:'#8995a3',font:{size:10}}},y:{beginAtZero:true,grid:{color:'#eef1f4'},ticks:{color:'#8995a3',font:{size:10}}}}}});
}
bootstrap();
