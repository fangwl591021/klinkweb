const IMPORT_FIELDS = [
  ['', '略過此欄'], ['name', '客戶姓名'], ['phone', '行動電話'], ['email', 'Email'],
  ['lineName', 'LINE 名稱'], ['companyName', '公司名稱'], ['jobTitle', '職稱'], ['address', '地址'],
  ['birthday', '生日'], ['category', '客戶分類'], ['tags', '標籤'], ['relationshipStatus', '客戶狀態'],
  ['lastContactDate', '最後聯絡日'], ['nextFollowUpDate', '下次追蹤日'], ['notes', '備註'], ['externalId', '外部客戶編號'],
];

const ALIASES = new Map([
  ['姓名','name'],['客戶姓名','name'],['name','name'],['手機','phone'],['電話','phone'],['行動電話','phone'],['mobile','phone'],['phone','phone'],
  ['email','email'],['電子郵件','email'],['line','lineName'],['line名稱','lineName'],['公司','companyName'],['公司名稱','companyName'],['company','companyName'],
  ['職稱','jobTitle'],['title','jobTitle'],['地址','address'],['address','address'],['生日','birthday'],['birthday','birthday'],
  ['分類','category'],['客戶分類','category'],['標籤','tags'],['tags','tags'],['狀態','relationshipStatus'],['客戶狀態','relationshipStatus'],
  ['最後聯絡日','lastContactDate'],['下次追蹤日','nextFollowUpDate'],['備註','notes'],['notes','notes'],['客戶編號','externalId'],['外部客戶編號','externalId'],['id','externalId'],
]);

const EDITOR_FIELDS = [
  ['name','客戶姓名','text',true],['phone','行動電話','tel'],['email','Email','email'],['lineName','LINE 名稱','text'],
  ['companyName','公司名稱','text'],['jobTitle','職稱','text'],['address','地址','text'],['birthday','生日','date'],
  ['category','客戶分類','text'],['tags','標籤（逗號分隔）','text'],['relationshipStatus','客戶狀態','text'],
  ['lastContactDate','最後聯絡日','date'],['nextFollowUpDate','下次追蹤日','date'],['externalId','外部客戶編號','text'],['notes','備註','textarea'],
];

export function createCustomerDataUi({ api, layout, esc, withActionFeedback, setTab, showCards }) {
  let records = [];
  let workbook = null;
  let importFile = null;
  const $ = (selector) => document.querySelector(selector);
  const tabs = (active) => `<nav class="customer-area-tabs" aria-label="人脈資料分類"><button type="button" data-customer-area="cards" class="${active === 'cards' ? 'active' : ''}">名片收藏</button><button type="button" data-customer-area="customers" class="${active === 'customers' ? 'active' : ''}">我的客戶</button></nav>`;
  const bindTabs = () => {
    $('[data-customer-area="cards"]')?.addEventListener('click', showCards);
    $('[data-customer-area="customers"]')?.addEventListener('click', () => showList());
  };

  function form(customer = {}) {
    return `<form id="customerForm" class="customer-form">${EDITOR_FIELDS.map(([key,label,type,required]) => `<label class="${type === 'textarea' || ['address','notes'].includes(key) ? 'full' : ''}">${label}${type === 'textarea' ? `<textarea id="customer-${key}" rows="4">${esc(customer[key] || '')}</textarea>` : `<input id="customer-${key}" type="${type}" value="${esc(key === 'tags' ? (customer.tags || []).join(',') : customer[key] || '')}" ${required ? 'required' : ''}>`}</label>`).join('')}<div class="customer-form-actions full"><button type="button" class="btn alt" id="cancelCustomerEdit">取消</button><button type="submit" class="btn">${customer.id ? '儲存修改' : '新增客戶'}</button></div>${customer.id ? '<button type="button" class="btn danger full" id="archiveCustomer">封存客戶</button>' : ''}</form>`;
  }

  function readForm() {
    return Object.fromEntries(EDITOR_FIELDS.map(([key]) => [key, $(`#customer-${key}`)?.value || '']));
  }

  function openEditor(customer = null) {
    setTab('myCustomers');
    layout(`${tabs('customers')}<section class="card customer-editor"><div class="customer-editor-title"><button class="back-card" id="cancelCustomerTop" aria-label="返回">←</button><div><small>${customer ? 'CUSTOMER PROFILE' : 'NEW CUSTOMER'}</small><h2>${customer ? esc(customer.name) : '手動新增客戶'}</h2></div></div>${form(customer || {})}</section>`);
    bindTabs();
    const cancel = () => showList();
    $('#cancelCustomerTop').onclick = cancel;
    $('#cancelCustomerEdit').onclick = cancel;
    $('#customerForm').onsubmit = async (event) => {
      event.preventDefault();
      try {
        await withActionFeedback(event.submitter, () => api(customer ? `/v1/customers/${encodeURIComponent(customer.id)}` : '/v1/customers', {
          method: customer ? 'PATCH' : 'POST', body: JSON.stringify(readForm()),
        }), { busy:'儲存中…', success:'已儲存' });
        await showList();
      } catch (error) { alert(error.message); }
    };
    $('#archiveCustomer')?.addEventListener('click', async () => {
      if (!confirm(`確定封存「${customer.name}」？`)) return;
      try { await api(`/v1/customers/${encodeURIComponent(customer.id)}`, { method:'DELETE' }); await showList(); }
      catch (error) { alert(error.message); }
    });
  }

  function downloadTemplate() {
    const csv = '\ufeff客戶姓名,行動電話,Email,LINE名稱,公司名稱,職稱,地址,生日,客戶分類,標籤,客戶狀態,最後聯絡日,下次追蹤日,備註,外部客戶編號\r\n王小明,0912345678,example@email.com,,範例公司,負責人,,1980-01-01,潛在客戶,"北區,活動名單",待追蹤,,,首次匯入,C001\r\n';
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
    link.download = '康立客戶匯入範本.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function sheetData(sheetName, headerRow = 1) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = window.XLSX.utils.sheet_to_json(sheet, { header:1, defval:'', raw:false });
    const headerIndex = Math.max(0, Math.min(Number(headerRow) - 1, matrix.length - 1));
    const headers = (matrix[headerIndex] || []).map((value, index) => String(value || `未命名欄位 ${index + 1}`).trim()).slice(0, 80);
    const rows = matrix.slice(headerIndex + 1)
      .filter((row) => row.some((value) => String(value || '').trim()))
      .slice(0, 5000)
      .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
    return { headers, rows };
  }

  function renderMapping() {
    const { headers, rows } = sheetData($('#customerSheetName').value, $('#customerHeaderRow').value);
    $('#customerImportMeta').textContent = `${rows.length} 筆資料，${headers.length} 個欄位；正式寫入前會先預覽。`;
    $('#customerMappingRows').innerHTML = headers.map((header) => {
      const suggested = ALIASES.get(header.toLowerCase().replace(/\s+/g, '')) || '';
      const example = rows.slice(0, 3).map((row) => row[header]).filter(Boolean).join('、');
      return `<label><span><strong>${esc(header)}</strong><small>${esc(example || '無範例資料')}</small></span><select data-customer-map="${esc(header)}">${IMPORT_FIELDS.map(([value,label]) => `<option value="${value}" ${value === suggested ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
    }).join('');
  }

  async function openImport(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return alert('檔案不可超過 5MB');
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return alert('只支援 XLSX、XLS 或 CSV');
    if (!window.XLSX) return alert('Excel 解析元件尚未載入，請重新整理後再試');
    try {
      importFile = file;
      workbook = window.XLSX.read(await file.arrayBuffer(), { type:'array', cellFormula:false, cellHTML:false });
      setTab('myCustomers');
      layout(`${tabs('customers')}<section class="card customer-import-card"><div class="customer-editor-title"><button class="back-card" id="cancelCustomerImport" aria-label="返回">←</button><div><small>IMPORT PREVIEW</small><h2>設定匯入欄位</h2></div></div><div class="customer-import-source"><label>工作表<select id="customerSheetName">${workbook.SheetNames.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join('')}</select></label><label>標題列<input id="customerHeaderRow" type="number" min="1" max="20" value="1"></label></div><p id="customerImportMeta" class="muted"></p><div id="customerMappingRows" class="customer-mapping-rows"></div><label class="customer-authority"><input id="customerImportAuthority" type="checkbox">我確認有權將這份客戶資料匯入自己的私人客戶名單。</label><button class="btn" id="previewCustomerImport">建立匯入預覽</button></section>`);
      bindTabs();
      $('#cancelCustomerImport').onclick = () => showList();
      $('#customerSheetName').onchange = renderMapping;
      $('#customerHeaderRow').onchange = renderMapping;
      renderMapping();
      $('#previewCustomerImport').onclick = async () => {
        if (!$('#customerImportAuthority').checked) return alert('請先確認你有權匯入這份客戶資料');
        const mapping = Object.fromEntries(Array.from(document.querySelectorAll('[data-customer-map]')).map((select) => [select.dataset.customerMap, select.value]).filter(([, value]) => value));
        if (!Object.values(mapping).includes('name')) return alert('請指定客戶姓名欄位');
        const duplicateTargets = Object.values(mapping).filter((value, index, values) => value && values.indexOf(value) !== index);
        if (duplicateTargets.length) return alert('同一個目標欄位只能對應一次');
        const { rows } = sheetData($('#customerSheetName').value, $('#customerHeaderRow').value);
        const lowerName = importFile.name.toLowerCase();
        const sourceType = lowerName.endsWith('.csv') ? 'csv' : lowerName.endsWith('.xls') ? 'xls' : 'xlsx';
        try {
          const result = await withActionFeedback($('#previewCustomerImport'), () => api('/v1/customer-imports/preview', {
            method:'POST', body:JSON.stringify({ sourceType, sourceName:importFile.name, mapping, rows }),
          }), { busy:'分析中…', success:'預覽完成' });
          renderImportPreview(result);
        } catch (error) { alert(error.message); }
      };
    } catch (error) { alert(error.message || '檔案解析失敗'); }
  }

  function renderImportPreview(result) {
    const batch = result.batch;
    const actionLabels = { create:'新增', update:'補齊', skip:'略過', error:'錯誤' };
    layout(`${tabs('customers')}<section class="card customer-import-card"><div class="customer-editor-title"><button class="back-card" id="cancelImportPreview" aria-label="返回">←</button><div><small>CONFIRM IMPORT</small><h2>確認匯入結果</h2></div></div><div class="customer-import-counts"><span><b>${batch.createCount}</b>新增</span><span><b>${batch.updateCount}</b>補齊</span><span><b>${batch.skipCount}</b>略過</span><span class="${batch.errorCount ? 'error' : ''}"><b>${batch.errorCount}</b>錯誤</span></div><p class="muted">既有人工資料不會被覆蓋；相同手機、Email 或外部編號只補齊空白欄位。</p><div class="customer-import-preview-list">${result.rows.map((row) => `<div><span><strong>${esc(row.name || `第 ${row.rowNumber} 列`)}</strong><small>${esc([row.companyName,row.phone].filter(Boolean).join('／') || row.error)}</small></span><b data-import-action="${row.action}">${actionLabels[row.action]}</b></div>`).join('')}</div>${result.previewTruncated ? '<p class="muted small">畫面只顯示前 100 筆，所有資料仍會依統計結果處理。</p>' : ''}<button class="btn" id="confirmCustomerImport">確認匯入 ${batch.createCount + batch.updateCount} 筆</button></section>`);
    bindTabs();
    $('#cancelImportPreview').onclick = () => showList();
    $('#confirmCustomerImport').onclick = async () => {
      try {
        const committed = await withActionFeedback($('#confirmCustomerImport'), () => api(`/v1/customer-imports/${encodeURIComponent(batch.id)}/confirm`, { method:'POST', body:'{}' }), { busy:'匯入中…', success:'匯入完成' });
        alert(`匯入完成：新增 ${committed.batch.createCount}、補齊 ${committed.batch.updateCount}、略過 ${committed.batch.skipCount}、錯誤 ${committed.batch.errorCount}`);
        await showList();
      } catch (error) { alert(error.message); }
    };
  }

  async function showList(search = '') {
    setTab('myCustomers');
    layout(`${tabs('customers')}<section class="customer-actions"><button type="button" id="addCustomerManual"><b>＋</b><span>手動新增<small>建立單一客戶</small></span></button><label><b>⇧</b><span>Excel／CSV<small>先預覽再匯入</small></span><input id="customerImportFile" type="file" accept=".xlsx,.xls,.csv" hidden></label><button type="button" id="connectCustomerGoogle" disabled><b>G</b><span>Google Sheet<small>下一階段開放</small></span></button><button type="button" id="downloadCustomerTemplate"><b>↓</b><span>下載範本<small>取得標準欄位</small></span></button></section><section class="collection-search"><input id="customerSearch" value="${esc(search)}" placeholder="搜尋姓名、公司、電話或 Email…"><button class="mini-btn" id="runCustomerSearch">搜尋</button></section><section class="card collection-list customer-list"><div class="collection-list-head"><h2>我的客戶名單</h2><span id="customerCount">載入中…</span></div><p class="muted customer-private-note">此區為你的私人客戶資料，不會自動公開，也不會混入名片收藏與配對排名。</p><div id="customerRows"><p class="muted">正在載入客戶資料…</p></div></section>`);
    bindTabs();
    $('#addCustomerManual').onclick = () => openEditor();
    $('#customerImportFile').onchange = (event) => openImport(event.target.files?.[0]);
    $('#downloadCustomerTemplate').onclick = downloadTemplate;
    const run = () => showList($('#customerSearch').value.trim());
    $('#runCustomerSearch').onclick = run;
    $('#customerSearch').onkeydown = (event) => { if (event.key === 'Enter') run(); };
    try {
      records = (await api(`/v1/customers?search=${encodeURIComponent(search)}`)).customers || [];
      $('#customerCount').textContent = `${records.length} 位`;
      $('#customerRows').innerHTML = records.length ? records.map((customer) => `<button class="contact-row customer-row" data-customer-id="${esc(customer.id)}"><span class="contact-thumb">${esc(customer.name.slice(0,1))}</span><span><strong>${esc(customer.name)}</strong><small>${esc([customer.companyName,customer.jobTitle,customer.phone].filter(Boolean).join('／') || '客戶資料')}</small><span class="customer-source-tags"><i>${esc(({manual:'手動',xlsx:'Excel',xls:'Excel',csv:'CSV',google_sheet:'Google Sheet'})[customer.sourceType] || customer.sourceType)}</i>${customer.nextFollowUpDate ? `<i>追蹤 ${esc(customer.nextFollowUpDate)}</i>` : ''}</span></span><b>›</b></button>`).join('') : '<div class="collection-empty">尚未建立客戶，可手動新增或匯入既有名單。</div>';
      document.querySelectorAll('[data-customer-id]').forEach((button) => button.onclick = () => openEditor(records.find((customer) => customer.id === button.dataset.customerId)));
    } catch (error) { $('#customerRows').innerHTML = `<p class="muted">${esc(error.message)}</p>`; }
  }

  return { tabs, bindTabs, showList };
}

