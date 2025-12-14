async function checkAuth(){
  const r = await fetch('/admin/status', { credentials: 'include' });
  return r.json();
}

// mini stop handler: stop mini preview and hide controls
const miniStopBtn = document.getElementById('miniStop');
if(miniStopBtn){
  miniStopBtn.addEventListener('click', ()=>{
    if(_stream){ _stream.getTracks().forEach(t=>t.stop()); _stream = null; }
    const miniWrap = document.getElementById('miniCap'); if(miniWrap) miniWrap.style.display = 'none';
    const miniVid = document.getElementById('miniVideo'); if(miniVid) try{ miniVid.srcObject = null; }catch(e){}
    miniStopBtn.style.display = 'none';
    const miniTakeBtn = document.getElementById('miniTake'); if(miniTakeBtn) miniTakeBtn.style.display = 'none';
  });
}

async function loadProducts(){
  const r = await fetch('/api/products');
  const data = await r.json();
  // cache products for client-side filtering
  window._productsCache = data;
  renderProducts();
}

// Render products from `window._productsCache`, optionally filtered by #searchInput
function renderProducts(){
  const tbody = document.querySelector('#productsTable tbody');
  tbody.innerHTML = '';
  const qInput = document.getElementById('searchInput');
  const q = qInput && qInput.value ? qInput.value.trim().toLowerCase() : '';
  // prepare items: filter then sort newest-first
  let items = (window._productsCache || []).filter(p=>{
    if(!q) return true;
    const b = (p.barcode||'').toString().toLowerCase();
    const n = (p.name||'').toString().toLowerCase();
    return b.includes(q) || n.includes(q);
  });
  // sort: prefer updatedAt, then createdAt, then numeric id fallback
  items.sort((a,b)=>{
    const ta = a.updatedAt || a.createdAt || a.id || 0;
    const tb = b.updatedAt || b.createdAt || b.id || 0;
    // if values are ISO strings, compare as dates
    const pa = (typeof ta === 'string' && !isNaN(Date.parse(ta))) ? Date.parse(ta) : Number(ta);
    const pb = (typeof tb === 'string' && !isNaN(Date.parse(tb))) ? Date.parse(tb) : Number(tb);
    return pb - pa;
  });

  // pagination
  const perPage = 10;
  window._productsPage = window._productsPage || 1;
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if(window._productsPage > totalPages) window._productsPage = totalPages;
  const start = (window._productsPage - 1) * perPage;
  const pageItems = items.slice(start, start + perPage);

  pageItems.forEach(p=>{
    const tr = document.createElement('tr');
    const imgHtml = p.image ? `<img src="${p.image}" style="width:64px;height:64px;object-fit:cover;border:1px solid #ddd">` : '';
    tr.innerHTML = `<td>${imgHtml}</td><td>${p.barcode}</td><td class="product-name">${escapeHtml(p.name)}</td><td>${escapeHtml(p.price)}</td><td><button data-id="${p.id}" class="edit">Sửa</button> <button data-id="${p.id}" class="del">Xóa</button></td>`;
    tbody.appendChild(tr);
  });

  // render pagination controls
  const pager = document.getElementById('pagination');
  if(pager){
    pager.innerHTML = '';
    const info = document.createElement('div');
    info.style.color = '#666';
    info.style.fontSize = '13px';
    info.textContent = `Hiển thị ${start+1}-${Math.min(start+pageItems.length, total)} trên ${total}`;
    pager.appendChild(info);

    const controls = document.createElement('div');
    controls.style.display = 'flex'; controls.style.gap = '6px'; controls.style.marginLeft = '12px'; controls.style.alignItems = 'center';

    const prev = document.createElement('button'); prev.className='btn ghost'; prev.textContent='‹ Trước'; prev.disabled = window._productsPage<=1;
    prev.addEventListener('click', ()=>{ window._productsPage = Math.max(1, window._productsPage-1); renderProducts(); });
    controls.appendChild(prev);

    // simple page numbers (show up to 7 pages centered)
    const maxPagesToShow = 7;
    const half = Math.floor(maxPagesToShow/2);
    let startPage = Math.max(1, window._productsPage - half);
    let endPage = Math.min(totalPages, startPage + maxPagesToShow -1);
    if(endPage - startPage < maxPagesToShow -1) startPage = Math.max(1, endPage - maxPagesToShow +1);
    for(let i=startPage;i<=endPage;i++){
      const b = document.createElement('button'); b.className = (i===window._productsPage)?'btn':'btn ghost'; b.textContent = i.toString();
      b.addEventListener('click', ((p)=>()=>{ window._productsPage = p; renderProducts(); })(i));
      controls.appendChild(b);
    }

    const next = document.createElement('button'); next.className='btn ghost'; next.textContent='Sau ›'; next.disabled = window._productsPage>=totalPages;
    next.addEventListener('click', ()=>{ window._productsPage = Math.min(totalPages, window._productsPage+1); renderProducts(); });
    controls.appendChild(next);

    pager.appendChild(controls);
  }
}

function escapeHtml(s){ return (s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

document.getElementById('loginForm').addEventListener('submit', async (ev)=>{
  ev.preventDefault();
  const u = document.getElementById('username').value;
  const p = document.getElementById('password').value;
  const r = await fetch('/admin/login', { method:'POST', credentials:'include', headers:{'content-type':'application/json'}, body: JSON.stringify({ username: u, password: p }) });
  if(r.ok){
    document.getElementById('auth').style.display='none';
    document.getElementById('adminPanel').style.display='block';
    await loadProducts();
  }else{
    const j = await r.json().catch(()=>({}));
    document.getElementById('loginMsg').textContent = j.error || 'Login failed';
  }
});

document.getElementById('logoutBtn').addEventListener('click', async ()=>{
  await fetch('/admin/logout', { method:'POST', credentials:'include' });
  location.reload();
});

document.getElementById('addForm').addEventListener('submit', async (ev)=>{
  ev.preventDefault();
  const id = document.getElementById('editingId').value;
  const b = document.getElementById('addBarcode').value.trim();
  const n = document.getElementById('addName').value.trim();
  const pr = document.getElementById('addPrice').value.trim();
  const img = document.getElementById('addImage').value.trim();

  // clear previous field errors
  clearFieldError('addBarcode'); clearFieldError('addName'); clearFieldError('addPrice'); clearFieldError('addImage');

  // Client-side validations
  let hasError = false;
  // barcode required
  if(!b){ showFieldError('addBarcode', 'Barcode là bắt buộc'); hasError = true; }
  // check duplicate barcode (ignore current editing id)
  const cache = window._productsCache || [];
  const dup = cache.find(p => (p.barcode||'').toString() === b && (!id || p.id != id));
  if(dup){ showFieldError('addBarcode', 'Barcode đã tồn tại trong danh sách'); hasError = true; }
  // name required
  if(!n){ showFieldError('addName', 'Tên sản phẩm là bắt buộc'); hasError = true; }
  // price optional; if provided it must be a positive integer
  if(pr){
    if(!/^[0-9]+$/.test(pr) || Number(pr) <= 0){ showFieldError('addPrice', 'Giá phải là số nguyên dương'); hasError = true; }
  }

  if(hasError){ return; }

  // Obtain CSRF only when validations passed
  const tR = await fetch('/admin/csrf-token', { credentials:'include' });
  const t = (await tR.json()).csrfToken;

  // If image is a data URL, compress and upload it first to avoid huge JSON payloads.
  // Prefer captured data if present and input shows 'Đã chụp ảnh'
  let imageToSend = (typeof window._capturedImageData === 'string' && (document.getElementById('addImage').value || '').startsWith('Đã chụp'))
    ? window._capturedImageData
    : img;
  try{
    if(imageToSend && imageToSend.startsWith('data:')){
      imageToSend = await uploadDataUrl(imageToSend, t);
    }
  }catch(e){
    
    showFieldError('addImage', 'Không thể upload ảnh');
    return;
  }

  try{
    if(id){
      // edit
      const payload = { barcode: b, name: n, image: imageToSend };
      if(pr) payload.price = pr;
      const r = await fetch('/api/products/'+id, { method:'PUT', credentials:'include', headers:{'content-type':'application/json','csrf-token':t}, body: JSON.stringify(payload) });
      const j = await r.json().catch(()=>({}));
      if(r.ok){
        // ensure updated product moves to top page
        window._productsPage = 1;
        // update in-memory cache: replace existing and move updated entry to front
        try{
          const updated = j && j.id ? j : { id: id, barcode: b, name: n, price: pr, image: imageToSend, updatedAt: new Date().toISOString() };
          window._productsCache = window._productsCache || [];
          // remove any existing with same id
          window._productsCache = window._productsCache.filter(p=>p.id != updated.id);
          // add to front
          window._productsCache.unshift(updated);
        }catch(e){  }
        resetForm(); renderProducts(); showToast('Cập nhật sản phẩm thành công', 3000, 'success');
      }
      else {
        
        if(j && Array.isArray(j.errors)){
          j.errors.forEach(err => {
            const fld = err.param || '';
            const map = { barcode: 'addBarcode', name: 'addName', price: 'addPrice', image: 'addImage' };
            const fid = map[fld] || null;
            if(fid) showFieldError(fid, err.msg || 'Invalid');
          });
        }
        showToast('Lỗi khi cập nhật: ' + (j && j.error ? j.error : r.status), 4000, 'error');
      }
    }else{
      // create
      const payload = { barcode: b, name: n, image: imageToSend };
      if(pr) payload.price = pr;
      const r = await fetch('/api/products', { method:'POST', credentials:'include', headers:{'content-type':'application/json','csrf-token':t}, body: JSON.stringify(payload) });
      const j = await r.json().catch(()=>({}));
      if(r.ok){
        window._productsPage = 1;
        try{
          // prefer server-returned product object
          const created = j && j.id ? j : { id: (j && j.id) || Math.random().toString(36).slice(2), barcode: b, name: n, price: pr, image: imageToSend, createdAt: new Date().toISOString() };
          window._productsCache = window._productsCache || [];
          // remove any existing with same id/barcode then add to front
          window._productsCache = window._productsCache.filter(p=>p.id != created.id && (p.barcode||'') !== created.barcode);
          window._productsCache.unshift(created);
        }catch(e){  }
        resetForm(); renderProducts(); showToast('Thêm sản phẩm thành công', 3000, 'success');
      }
      else {
        
        if(j && Array.isArray(j.errors)){
          j.errors.forEach(err => {
            const fld = err.param || '';
            const map = { barcode: 'addBarcode', name: 'addName', price: 'addPrice', image: 'addImage' };
            const fid = map[fld] || null;
            if(fid) showFieldError(fid, err.msg || 'Invalid');
          });
        }
        // show first validation message prominently if available
        if(j && Array.isArray(j.errors) && j.errors.length){
          showToast(j.errors[0].msg || 'Lỗi dữ liệu', 5000, 'error');
        }else{
          showToast('Không thể thêm: ' + (j && j.error ? j.error : r.status), 4000, 'error');
        }
      }
    }
  }catch(e){
    
    showToast('Lỗi mạng hoặc máy chủ', 4000, 'error');
  }
});

// show a transient toast message (keeps form open)
function showToast(message, timeout = 3000, type = ''){
  try{
    const wrap = document.getElementById('toastWrap');
    if(!wrap) return;
    const t = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '');
    t.textContent = message;
    wrap.appendChild(t);
    // force reflow then show
    requestAnimationFrame(()=> t.classList.add('show'));
    setTimeout(()=>{
      t.classList.remove('show');
      setTimeout(()=> t.remove(), 300);
    }, timeout);
  }catch(e){  }
}

// Field-level error helpers
function showFieldError(fieldId, message){
  try{
    const el = document.getElementById(fieldId);
    if(el){ el.classList.add('input-invalid'); }
    const err = document.getElementById('err_'+fieldId);
    if(err){ err.textContent = message; err.style.display = 'block'; }
  }catch(e){  }
}
function clearFieldError(fieldId){
  try{
    const el = document.getElementById(fieldId);
    if(el){ el.classList.remove('input-invalid'); }
    const err = document.getElementById('err_'+fieldId);
    if(err){ err.textContent = ''; err.style.display = 'none'; }
  }catch(e){ /* ignore */ }
}

// wire up realtime clearing of errors and minimal input normalization
['addBarcode','addName','addImage'].forEach(id=>{
  const el = document.getElementById(id);
  if(el) el.addEventListener('input', ()=> clearFieldError(id));
});
const priceEl = document.getElementById('addPrice');
if(priceEl){
  priceEl.addEventListener('input', (ev)=>{
    // allow only digits; strip others
    const v = priceEl.value || '';
    const cleaned = v.replace(/[^0-9]/g,'');
    if(cleaned !== v) priceEl.value = cleaned;
    clearFieldError('addPrice');
  });
}

// focus helper: focus the barcode input after opening form
function focusAddBarcode(){
  try{
    const el = document.getElementById('addBarcode');
    if(!el) return;
    // wait a tick for animation to complete enough
    setTimeout(()=>{
      try{ el.focus({ preventScroll: true }); }catch(e){ el.focus(); }
      el.select && el.select();
    }, 220);
  }catch(e){ /* ignore */ }
}

// Upload helper: compress a dataURL to a reasonable max dimension and POST as multipart/form-data
async function uploadDataUrl(dataUrl, csrfToken){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = ()=>{
      try{
        const maxDim = 800;
        let w = img.width, h = img.height;
        if(w > maxDim || h > maxDim){
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        c.toBlob(async (blob)=>{
          if(!blob) return reject('compress_failed');
          try{
            const fd = new FormData();
            fd.append('image', blob, 'upload.jpg');
            const res = await fetch('/api/uploads', { method: 'POST', credentials: 'include', headers: { 'csrf-token': csrfToken }, body: fd });
            if(!res.ok){ const j = await res.json().catch(()=>({})); return reject(j.error || res.status); }
            const j = await res.json();
            resolve(j.url);
          }catch(e){ reject(e); }
        }, 'image/jpeg', 0.8);
      }catch(e){ reject(e); }
    };
    img.onerror = ()=> reject('image_load_failed');
    img.src = dataUrl;
  });
}

document.querySelector('#productsTable').addEventListener('click', async (ev)=>{
  const id = ev.target.dataset.id;
  if(ev.target.classList.contains('del')){
    if(!confirm('Xóa sản phẩm?')) return;
    const tR = await fetch('/admin/csrf-token', { credentials:'include' });
    const t = (await tR.json()).csrfToken;
    const r = await fetch('/api/products/'+id, { method:'DELETE', credentials:'include', headers:{'csrf-token':t} });
    if(r.ok) loadProducts(); else showToast('Lỗi khi xóa', 3000, 'error');
  }
  if(ev.target.classList.contains('edit')){
    // Open the form populated for editing
    const r = await fetch('/api/products/id/'+id, { credentials:'include' });
    if(!r.ok){ showToast('Không lấy được sản phẩm', 3000, 'error'); return; }
    const p = await r.json();
    document.getElementById('addBarcode').value = p.barcode || '';
    document.getElementById('addName').value = p.name || '';
    document.getElementById('addPrice').value = p.price || '';
    document.getElementById('addImage').value = p.image || '';
    document.getElementById('editingId').value = p.id;
    document.getElementById('formTitle').textContent = 'Sửa sản phẩm';
    document.getElementById('submitBtn').textContent = 'Lưu';
    document.getElementById('cancelEdit').style.display = 'inline-block';
    showPreview(p.image);
    // ensure add form is visible when editing (use animated collapsible)
    const addCard = document.getElementById('addCard');
    if(addCard){
      addCard.classList.add('open');
      // do not scroll into view when opening — user requested no automatic scroll
      focusAddBarcode();
    }
    const toggle = document.getElementById('toggleAddBtn');
    if(toggle) toggle.textContent = 'Đóng';
  }
  });

function resetForm(){
  document.getElementById('addForm').reset();
  document.getElementById('editingId').value = '';
  document.getElementById('formTitle').textContent = 'Thêm sản phẩm';
  document.getElementById('submitBtn').textContent = 'Thêm';
  document.getElementById('cancelEdit').style.display = 'none';
  document.getElementById('preview').innerHTML = '';
}

document.getElementById('cancelEdit').addEventListener('click', ()=>{ resetForm(); });

// Toggle add form visibility from top button
const toggleBtn = document.getElementById('toggleAddBtn');
if(toggleBtn){
  toggleBtn.addEventListener('click', ()=>{
    const addCard = document.getElementById('addCard');
    if(!addCard) return;
    const isOpen = addCard.classList.contains('open');
      if(isOpen){
      addCard.classList.remove('open');
      toggleBtn.textContent = 'Thêm sản phẩm';
      // when closing, reset form to clear editing state
      resetForm();
        // hide mini preview and controls if visible
        const miniWrap = document.getElementById('miniCap'); if(miniWrap) miniWrap.style.display = 'none';
        const miniVid = document.getElementById('miniVideo'); if(miniVid) try{ miniVid.srcObject = null; }catch(e){}
        const mt = document.getElementById('miniTake'); if(mt) mt.style.display = 'none';
        const ms = document.getElementById('miniStop'); if(ms) ms.style.display = 'none';
    }else{
      addCard.classList.add('open');
      toggleBtn.textContent = 'Đóng';
      // avoid auto-scrolling; only focus without scrolling
      focusAddBarcode();
    }
  });
}

// when cancelling edit, also hide the add card
const cancelBtn = document.getElementById('cancelEdit');
if(cancelBtn){
  cancelBtn.addEventListener('click', ()=>{
    const addCard = document.getElementById('addCard'); if(addCard) addCard.classList.remove('open');
    const toggle = document.getElementById('toggleAddBtn'); if(toggle) toggle.textContent = 'Thêm sản phẩm';
    // hide mini preview and controls
    const miniWrap = document.getElementById('miniCap'); if(miniWrap) miniWrap.style.display = 'none';
    const miniVid = document.getElementById('miniVideo'); if(miniVid) try{ miniVid.srcObject = null; }catch(e){}
    const mt = document.getElementById('miniTake'); if(mt) mt.style.display = 'none';
    const ms = document.getElementById('miniStop'); if(ms) ms.style.display = 'none';
  });
}

function showPreview(src){
  const p = document.getElementById('preview');
  p.innerHTML = '';
  if(!src) return;
  // If data URI or same-origin path, show image directly.
  try{
    const isData = src.startsWith('data:');
    let isSameOrigin = false;
    try{
      const url = new URL(src, window.location.href);
      isSameOrigin = (url.origin === window.location.origin);
    }catch(e){ isSameOrigin = false; }

    if(isData || isSameOrigin){
      const wrap = document.createElement('div');
      wrap.style.position='relative';
      wrap.style.display='inline-block';
      const img = document.createElement('img');
      img.src = src;
      img.style.width='128px'; img.style.height='128px'; img.style.objectFit='cover'; img.style.border='1px solid #ddd'; borderRadius='6px';
      // delete button
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '×';
      del.title = 'Xóa ảnh';
      del.style.position='absolute'; del.style.right='4px'; del.style.top='4px'; del.style.background='rgba(0,0,0,0.6)'; del.style.color='#fff'; del.style.border='none'; del.style.width='24px'; del.style.height='24px'; del.style.borderRadius='12px'; del.style.cursor='pointer';
      del.addEventListener('click', ()=>{
        // clear captured data and reset input
        window._capturedImageData = '';
        const imgInput = document.getElementById('addImage');
        imgInput.readOnly = false;
        imgInput.value = '';
        p.innerHTML='';
      });
      // graceful fallback if image fails to load
      img.onerror = ()=>{
        wrap.remove();
        const msg = document.createElement('div');
        msg.textContent = 'Không thể hiển thị ảnh';
        msg.style.color = '#666';
        p.appendChild(msg);
      };
      wrap.appendChild(img);
      wrap.appendChild(del);
      p.appendChild(wrap);
      return;
    }
    // External URL: avoid automatically loading it (prevents DNS/network errors in console).
    const wrap = document.createElement('div');
    wrap.style.display = 'flex'; wrap.style.alignItems = 'center'; wrap.style.gap = '8px';
    const placeholder = document.createElement('div');
    placeholder.style.width = '64px'; placeholder.style.height = '64px'; placeholder.style.background = '#efefef'; placeholder.style.display='flex'; placeholder.style.alignItems='center'; placeholder.style.justifyContent='center'; placeholder.style.color='#999'; placeholder.style.border='1px solid #ddd';
    placeholder.textContent = 'EX';
    const a = document.createElement('a');
    a.href = src;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'External image (click to open)';
    a.style.color = '#0666cc';
    wrap.appendChild(placeholder);
    wrap.appendChild(a);
    // (Removed explicit "Tải ảnh (thử)" button per user request.)
    p.appendChild(wrap);
  }catch(e){
    // fallback: just show text
    p.textContent = 'Preview unavailable';
  }
}

// Capture logic
let _stream = null;
const captureArea = document.getElementById('captureArea');
const capVideo = document.getElementById('capVideo');
const capCanvas = document.getElementById('capCanvas');
const takePhoto = document.getElementById('takePhoto');
const stopCapture = document.getElementById('stopCapture');
const fileInput = document.getElementById('fileInput');

// Barcode scan logic (uses ZXing)
let codeReader = null;
let scanningBarcode = false;
const scanArea = document.getElementById('scanArea');
const scanVideo = document.getElementById('scanVideo');
const stopScanBtn = document.getElementById('stopScan');
// embedded buttons in inputs
const addBarcodeCameraBtn = document.getElementById('addBarcodeCameraBtn');
const addImageCameraBtn = document.getElementById('addImageCameraBtn');
const addImageUploadBtn = document.getElementById('addImageUploadBtn');

// removed standalone captureBtn; mini camera starts via input icon handlers

takePhoto.addEventListener('click', ()=>{
  if(!capVideo.videoWidth){ showToast('Camera chưa sẵn sàng',2000,'error'); return; }
  capCanvas.width = capVideo.videoWidth;
  capCanvas.height = capVideo.videoHeight;
  const ctx = capCanvas.getContext('2d');
  ctx.drawImage(capVideo, 0, 0);
  const data = capCanvas.toDataURL('image/jpeg', 0.9);
  // store captured data separately to avoid user edits
  window._capturedImageData = data;
  const imgInput = document.getElementById('addImage');
  imgInput.value = 'Đã chụp ảnh';
  try{ imgInput.readOnly = true; }catch(e){}
  showPreview(data);
  // stop stream
  if(_stream){ _stream.getTracks().forEach(t=>t.stop()); _stream = null; }
  captureArea.style.display = 'none';
  // hide mini preview
  const miniWrap = document.getElementById('miniCap'); if(miniWrap) miniWrap.style.display = 'none';
  const miniVid = document.getElementById('miniVideo'); if(miniVid) try{ miniVid.srcObject = null; }catch(e){}
});

// mini take handler: capture photo from mini preview
const miniTakeBtn = document.getElementById('miniTake');
// mini take handler: capture photo from mini preview (portrait)
const miniTakeBtn = document.getElementById('miniTake');
if(miniTakeBtn){
  miniTakeBtn.addEventListener('click', ()=>{
    const miniVid = document.getElementById('miniVideo');
    if(!miniVid || !miniVid.videoWidth){ showToast('Camera chưa sẵn sàng',2000,'error'); return; }
    capCanvas.width = miniVid.videoWidth;
    capCanvas.height = miniVid.videoHeight;
    const ctx = capCanvas.getContext('2d');
    ctx.drawImage(miniVid, 0, 0, capCanvas.width, capCanvas.height);
    const data = capCanvas.toDataURL('image/jpeg', 0.9);
    window._capturedImageData = data;
    const imgInput = document.getElementById('addImage');
    imgInput.value = 'Đã chụp ảnh';
    try{ imgInput.readOnly = true; }catch(e){}
    showPreview(data);
    // stop stream and hide mini UI
    if(_stream){ _stream.getTracks().forEach(t=>t.stop()); _stream = null; }
    const miniWrap = document.getElementById('miniCap'); if(miniWrap) miniWrap.style.display = 'none';
    try{ miniVid.srcObject = null; }catch(e){}
    miniTakeBtn.style.display = 'none';
    const miniStopBtnEl = document.getElementById('miniStop'); if(miniStopBtnEl) miniStopBtnEl.style.display = 'none';
  });
}

stopCapture.addEventListener('click', ()=>{
  if(_stream){ _stream.getTracks().forEach(t=>t.stop()); _stream = null; }
  captureArea.style.display = 'none';
  // hide mini preview
  const miniWrap = document.getElementById('miniCap'); if(miniWrap) miniWrap.style.display = 'none';
  const miniVid = document.getElementById('miniVideo'); if(miniVid) try{ miniVid.srcObject = null; }catch(e){}
});

// input-embedded actions
if(addBarcodeCameraBtn){
  addBarcodeCameraBtn.addEventListener('click', async ()=>{
    // Use mini camera box for scanning above inputs
    scanningBarcode = true;
    try{
      _stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const mini = document.getElementById('miniVideo');
      const miniWrap = document.getElementById('miniCap');
      if(mini) try{ mini.srcObject = _stream; }catch(e){}
      if(miniWrap) miniWrap.style.display = 'block';
      const miniTakeBtnEl = document.getElementById('miniTake'); if(miniTakeBtnEl) miniTakeBtnEl.style.display = 'none';
      const miniStopBtnEl = document.getElementById('miniStop'); if(miniStopBtnEl) miniStopBtnEl.style.display = 'inline-block';
      try{ if(mini) await mini.play(); }catch(e){}

      if(!codeReader){ codeReader = new ZXing.BrowserMultiFormatReader(); }
      const videoEl = mini;
      const tryDecode = async ()=>{
        if(!scanningBarcode) return;
        try{
          const result = await codeReader.decodeOnceFromVideoDevice(undefined, videoEl);
          if(result && result.text){
            document.getElementById('addBarcode').value = result.text;
            scanningBarcode = false;
            // stop camera and hide mini
            const s = videoEl.srcObject; if(s){ try{ s.getTracks().forEach(t=>t.stop()); }catch(e){} }
            if(miniWrap) miniWrap.style.display = 'none';
            try{ videoEl.srcObject = null; }catch(e){}
            clearFieldError('addBarcode');
            showToast('Đã quét barcode', 2000, 'success');
            return;
          }
        }catch(e){ /* keep trying until success */ }
        requestAnimationFrame(tryDecode);
      };
      requestAnimationFrame(tryDecode);
    }catch(e){ showToast('Không thể bật camera quét', 3000, 'error'); }
  });
}

if(addImageCameraBtn){
  addImageCameraBtn.addEventListener('click', async ()=>{
    // trigger mini camera in add form
    if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ showToast('Trình duyệt không hỗ trợ camera',3000,'error'); return; }
    try{
      _stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const mini = document.getElementById('miniVideo');
      if(mini) try{ mini.srcObject = _stream; }catch(e){}
      const miniWrap = document.getElementById('miniCap'); if(miniWrap) miniWrap.style.display = 'block';
      const miniTakeBtnEl = document.getElementById('miniTake'); if(miniTakeBtnEl) miniTakeBtnEl.style.display = 'inline-block';
      const miniStopBtnEl = document.getElementById('miniStop'); if(miniStopBtnEl) miniStopBtnEl.style.display = 'inline-block';
      try{ if(mini) mini.play(); }catch(e){}
    }catch(e){ showToast('Không thể truy cập camera',3000,'error'); }
  });
}

if(addImageUploadBtn && fileInput){
  addImageUploadBtn.addEventListener('click', ()=>{
    try{ fileInput.click(); }catch(e){}
  });
  fileInput.addEventListener('change', ()=>{
    const f = fileInput.files && fileInput.files[0];
    if(!f){ return; }
    const reader = new FileReader();
    reader.onload = ()=>{
      const data = reader.result;
      window._capturedImageData = data;
      const imgInput = document.getElementById('addImage');
      imgInput.value = 'Đã chụp ảnh';
      try{ imgInput.readOnly = true; }catch(e){}
      showPreview(data);
      clearFieldError('addImage');
    };
    reader.readAsDataURL(f);
  });
}

fileInput.addEventListener('change', (ev)=>{
  const f = ev.target.files[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    document.getElementById('addImage').value = reader.result;
    showPreview(reader.result);
  };
  reader.readAsDataURL(f);
});

// Initialize ZXing code reader when available
function ensureZXing(){
  if(typeof ZXing === 'undefined') return false;
  if(!codeReader) codeReader = new ZXing.BrowserMultiFormatReader();
  return true;
}

scanBtn.addEventListener('click', async ()=>{
  if(scanningBarcode) return;
  if(!ensureZXing()){ showToast('Thư viện quét chưa sẵn sàng',3000,'error'); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ showToast('Trình duyệt không hỗ trợ camera',3000,'error'); return; }
  // Start improved capture loop. If add form is open prefer mini preview, else use large scan area.
  let stream = null;
  let stopped = false;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const detector = (typeof BarcodeDetector !== 'undefined') ? new BarcodeDetector({ formats: [ 'ean_13','ean_8','upc_e','upc_a','code_128','code_39' ] }) : null;
  // decide target video element
  const addCard = document.getElementById('addCard');
  const useMini = !!(addCard && addCard.classList.contains('open'));
  const targetVideo = useMini ? document.getElementById('miniVideo') : scanVideo;
  try{
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } });
    // attach stream to chosen video
    if(targetVideo) try{ targetVideo.srcObject = stream; }catch(e){}
    if(useMini){
      // show mini preview and controls, hide large scan area
      const miniWrap = document.getElementById('miniCap'); if(miniWrap) miniWrap.style.display = 'block';
      const mt = document.getElementById('miniTake'); if(mt) mt.style.display = 'none';
      const ms = document.getElementById('miniStop'); if(ms) ms.style.display = 'inline-block';
    }else{
      scanArea.style.display = 'block';
    }
    if(targetVideo && targetVideo.play) try{ await targetVideo.play(); }catch(e){}
    scanningBarcode = true;

    let last = { code: null, time: 0 };

    async function loop(){
      if(stopped) return;
      try{
        const w = (targetVideo && targetVideo.videoWidth) || 640;
        const h = (targetVideo && targetVideo.videoHeight) || 480;
        canvas.width = w; canvas.height = h;
        ctx.drawImage(targetVideo, 0, 0, w, h);

        // native detector first
        if(detector){
          try{
            const res = await detector.detect(canvas);
            if(res && res.length){
              const code = res[0].rawValue || (res[0].raw && res[0].raw.value);
              if(code && !(last.code===code && (Date.now()-last.time)<800)){
                last.code = code; last.time = Date.now();
                document.getElementById('addBarcode').value = code;
                stopped = true;
                try{ stream.getTracks().forEach(t=>t.stop()); }catch(e){}
                if(useMini){ const miniWrap = document.getElementById('miniCap'); if(miniWrap) miniWrap.style.display = 'none'; const ms=document.getElementById('miniStop'); if(ms) ms.style.display='none'; }
                else { scanArea.style.display = 'none'; }
                scanningBarcode = false;
                return;
              }
            }
          }catch(e){ /* ignore native detector errors */ }
        }

        // preprocess grayscale + contrast
        try{
          const imgd = ctx.getImageData(0,0,w,h);
          const data = imgd.data;
          let min=255, max=0;
          for(let i=0;i<data.length;i+=4){
            const g = Math.round(0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2]);
            data[i]=data[i+1]=data[i+2]=g;
            if(g<min) min=g; if(g>max) max=g;
          }
          const range = Math.max(1, max-min);
          for(let i=0;i<data.length;i+=4){ let v = data[i]; v = Math.round((v - min) * 255 / range); data[i]=data[i+1]=data[i+2]=v; }
          ctx.putImageData(imgd,0,0);
        }catch(e){ /* ignore preprocess errors */ }

        try{
          const zres = await codeReader.decodeFromImage(canvas);
          if(zres && zres.text){
            const code = zres.text;
            if(!(last.code===code && (Date.now()-last.time)<800)){
              last.code = code; last.time = Date.now();
              document.getElementById('addBarcode').value = code;
              stopped = true;
              try{ stream.getTracks().forEach(t=>t.stop()); }catch(e){}
              if(useMini){ const miniWrap = document.getElementById('miniCap'); if(miniWrap) miniWrap.style.display = 'none'; const ms=document.getElementById('miniStop'); if(ms) ms.style.display='none'; }
              else { scanArea.style.display = 'none'; }
              scanningBarcode = false;
              return;
            }
          }
        }catch(e){ /* ignore not found */ }

      }catch(e){  }
      setTimeout(loop, 300);
    }
    loop();

  }catch(e){
    
    alert('Không thể khởi tạo camera: ' + (e && e.message));
    if(stream) try{ stream.getTracks().forEach(t=>t.stop()); }catch(e){}
    if(useMini){ const miniWrap = document.getElementById('miniCap'); if(miniWrap) miniWrap.style.display = 'none'; const ms=document.getElementById('miniStop'); if(ms) ms.style.display='none'; }
    else { scanArea.style.display = 'none'; }
    scanningBarcode = false;
  }
});

stopScanBtn.addEventListener('click', ()=>{
  // Stop scanning and stop any active tracks
  try{ if(codeReader) codeReader.reset(); }catch(e){}
  try{ const s = scanVideo.srcObject; if(s && s.getTracks) s.getTracks().forEach(t=>t.stop()); }catch(e){}
  scanVideo.srcObject = null;
  scanningBarcode = false;
  scanArea.style.display = 'none';
});

checkAuth().then(s=>{
  if(s.authenticated){ document.getElementById('auth').style.display='none'; document.getElementById('adminPanel').style.display='block'; loadProducts(); }
});

// Wire up search input to re-render filtering as user types
const sInput = document.getElementById('searchInput');
if(sInput){
  sInput.addEventListener('input', ()=>{
    // simple debounce
    if(window._searchTimer) clearTimeout(window._searchTimer);
    window._searchTimer = setTimeout(()=>{ renderProducts(); }, 180);
  });
}

// Search scan button handler
const searchScanBtn = document.getElementById('searchScanBtn');
const searchScanModal = document.getElementById('searchScanModal');
const searchScanVideo = document.getElementById('searchScanVideo');
const stopSearchScanBtn = document.getElementById('stopSearchScan');
let searchScanStream = null;
let searchScanning = false;

if(searchScanBtn && searchScanModal && searchScanVideo){
  searchScanBtn.addEventListener('click', async ()=>{
    if(!ensureZXing()){ showToast('Thư viện quét chưa sẵn sàng',3000,'error'); return; }
    searchScanModal.style.display = 'flex';
    searchScanning = true;
    
    try{
      searchScanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'environment' } });
      searchScanVideo.srcObject = searchScanStream;
      
      // Try native BarcodeDetector first, fallback to ZXing
      const detector = (typeof BarcodeDetector !== 'undefined') ? new BarcodeDetector({ formats: [ 'ean_13','ean_8','upc_e','upc_a','code_128','code_39' ] }) : null;
      
      // Create canvas for processing frames
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const last = { code: '', time: 0 };
      
      const scanFrame = async ()=>{
        if(!searchScanning) return;
        
        try{
          // Set canvas size to match video
          const vw = searchScanVideo.videoWidth;
          const vh = searchScanVideo.videoHeight;
          if(vw && vh){
            canvas.width = vw;
            canvas.height = vh;
            ctx.drawImage(searchScanVideo, 0, 0, vw, vh);
            
            // Try BarcodeDetector first if available
            if(detector){
              try{
                const barcodes = await detector.detect(canvas);
                if(barcodes && barcodes.length > 0){
                  const code = barcodes[0].rawValue;
                  if(!(last.code===code && (Date.now()-last.time)<800)){
                    last.code = code; last.time = Date.now();
                    // Stop camera immediately
                    stopSearchScan();
                    // Fill search input and trigger search
                    if(sInput){
                      sInput.value = code;
                      window._productsPage = 1;
                      renderProducts();
                    }
                    showToast('Đã quét: ' + code, 2000, 'success');
                    return;
                  }
                }
              }catch(e){}
            }
            
            // Fallback to ZXing with canvas
            try{
              // Apply contrast enhancement for better detection
              const imgd = ctx.getImageData(0,0,canvas.width,canvas.height);
              const data = imgd.data;
              let min=255, max=0;
              for(let i=0;i<data.length;i+=4){ const v=data[i]; if(v<min)min=v; if(v>max)max=v; }
              const range = max-min || 1;
              for(let i=0;i<data.length;i+=4){ let v = data[i]; v = Math.round((v - min) * 255 / range); data[i]=data[i+1]=data[i+2]=v; }
              ctx.putImageData(imgd,0,0);
              
              const zres = await codeReader.decodeFromImage(canvas);
              if(zres && zres.text){
                const code = zres.text;
                if(!(last.code===code && (Date.now()-last.time)<800)){
                  last.code = code; last.time = Date.now();
                  // Stop camera immediately
                  stopSearchScan();
                  // Fill search input and trigger search
                  if(sInput){
                    sInput.value = code;
                    window._productsPage = 1;
                    renderProducts();
                  }
                  showToast('Đã quét: ' + code, 2000, 'success');
                  return;
                }
              }
            }catch(e){}
          }
        }catch(e){}
        
        setTimeout(scanFrame, 300);
      };
      
      scanFrame();
    }catch(e){
      showToast('Không thể bật camera: ' + e.message, 3000, 'error');
      stopSearchScan();
    }
  });
}

function stopSearchScan(){
  searchScanning = false;
  if(searchScanStream){
    searchScanStream.getTracks().forEach(t => t.stop());
    searchScanStream = null;
  }
  if(searchScanVideo) searchScanVideo.srcObject = null;
  if(searchScanModal) searchScanModal.style.display = 'none';
  try{ if(codeReader) codeReader.reset(); }catch(e){}
}

if(stopSearchScanBtn){
  stopSearchScanBtn.addEventListener('click', stopSearchScan);
}

// Close modal on background click
if(searchScanModal){
  searchScanModal.addEventListener('click', (e)=>{
    if(e.target === searchScanModal) stopSearchScan();
  });
}
