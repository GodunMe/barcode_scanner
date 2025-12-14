// app.js - barcode scanning and lookup
const codeReader = new ZXing.BrowserMultiFormatReader();
let selectedDeviceId = null;
let scanning = false;
let products = {};
let mode = 'price'; // 'price' or 'cart'
let cart = {}; // barcode -> { product, qty }
let currentStream = null;
let scanningStopper = null;
let barcodeDetector = null;
let lastDetected = { code: null, time: 0 };
// imageCapture and torch support removed per user request

// Format numeric price values using '.' as thousand separator and no decimals
function formatPrice(n){
  try{
    const num = (typeof n === 'number') ? n : (parseFloat((n||'').toString().replace(/[^0-9.-]+/g,'')) || 0);
    return num.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }catch(e){ return String(n); }
}

const video = document.getElementById('video');
const videoSelect = document.getElementById('videoSelect');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const barcodeValue = document.getElementById('barcodeValue');
const productBox = document.getElementById('product');
const productImage = document.getElementById('productImage');
const productName = document.getElementById('productName');
const productPrice = document.getElementById('productPrice');
const productBarcode = document.getElementById('productBarcode');
// fileInput removed per user request (no manual image upload)
const modePrice = document.getElementById('modePrice');
const modeCart = document.getElementById('modeCart');
const cartArea = document.getElementById('cartArea');
const cartTableBody = document.querySelector('#cartTable tbody');
const cartTotalEl = document.getElementById('cartTotal');
const clearCartBtn = document.getElementById('clearCart');
const checkoutBtn = document.getElementById('checkout');
const videoWrap = document.getElementById('videoWrap');
const compactBtn = document.getElementById('compactBtn');
const manualBarcodeInput = document.getElementById('manualBarcode');
const manualLookupBtn = document.getElementById('manualLookup');

// Load product database (from API if server present, otherwise fallback to local JSON)
fetch('/api/products').then(r=>{
  if(!r.ok) throw new Error('no api');
  return r.json();
}).then(arr=>{
  // convert array to map by barcode
  products = arr.reduce((m,p)=>{ m[p.barcode]=p; return m; }, {});
}).catch(()=>{
  // fallback to local file for purely-static usage
  fetch('products.json').then(r=>r.json()).then(j=>{
    try{
      if(Array.isArray(j)){
        // convert array to map by barcode (same shape as API response)
        products = j.reduce((m,p)=>{ if(p && p.barcode) m[p.barcode]=p; return m; }, {});
      }else if(j && typeof j === 'object'){
        products = j;
      }else{
        products = {};
      }
    }catch(e){ products = {}; /* products.json parse error */ }
  }).catch(e=>{ });
});

function listDevices(){
  codeReader.listVideoInputDevices().then(videoInputDevices => {
    videoSelect.innerHTML = '';
    videoInputDevices.forEach(device => {
      const opt = document.createElement('option');
      opt.value = device.deviceId;
      opt.text = device.label || `Camera ${videoSelect.length+1}`;
      videoSelect.appendChild(opt);
    });
    // Try to pick a rear/back camera by default when available
    let rear = null;
    try{
      rear = videoInputDevices.find(d=>/back|rear|environment|rear camera/i.test(d.label));
    }catch(e){}
    if(rear) selectedDeviceId = rear.deviceId;
    else if(videoInputDevices.length) selectedDeviceId = videoInputDevices[0].deviceId;
    // For this mobile web app we want to default to the rear camera only; prevent accidental switching
    try{ videoSelect.disabled = true; }catch(e){}
  }).catch(err=>{
    const opt=document.createElement('option'); opt.text = 'No camera found'; videoSelect.appendChild(opt);
  });
}

videoSelect.addEventListener('change', ()=>{ selectedDeviceId = videoSelect.value; });

startBtn.addEventListener('click', async ()=>{
  if(scanning) return;
  scanning = true;
  barcodeValue.textContent = '(quét...)';
  try{
    scanningStopper = await startScanner();
  }catch(e){
    alert('Không thể khởi tạo camera: ' + (e && e.message));
    scanning = false;
  }
});

stopBtn.addEventListener('click', ()=>{
  if(typeof scanningStopper === 'function') scanningStopper();
  if(currentStream){ try{ currentStream.getTracks().forEach(t=>t.stop()); }catch(e){} currentStream = null; }
  scanning = false;
  barcodeValue.textContent = '(đã dừng)';
});

// Torch UI removed per user request

// file input removed; users will scan live or enter barcode manually

function showProductForBarcode(code){
  const p = products[code];
  if(p){
    productImage.src = p.image;
    productName.textContent = p.name;
    productPrice.textContent = 'Giá: ' + p.price;
    productBarcode.textContent = 'Barcode: ' + code;
    productBox.style.display = 'flex';
  }else{
    productBox.style.display = 'none';
    alert('Không tìm thấy sản phẩm trong cơ sở dữ liệu: ' + code);
  }
}

// CART MODE
function addToCartByBarcode(code){
  const p = products[code];
  if(!p){
    alert('Sản phẩm không có trong cơ sở dữ liệu: ' + code);
    return;
  }
  // Add product only once on scan. To change quantity, use the +/- controls in the cart.
  if(!cart[code]){
    cart[code] = { product: p, qty: 1 };
    renderCart();
  }else{
    // if already in cart, highlight the row to indicate it's present
    const row = cartTableBody.querySelector(`tr[data-code="${code}"]`);
    if(row){
      row.style.transition = 'background-color 0.15s';
      const orig = row.style.backgroundColor;
      row.style.backgroundColor = '#fffbcc';
      setTimeout(()=>{ row.style.backgroundColor = orig; }, 350);
    }
  }
}

function renderCart(){
  cartTableBody.innerHTML = '';
  let total = 0;
  Object.keys(cart).forEach(code => {
    const item = cart[code];
    const p = item.product;
    const priceNum = parseFloat((p.price||'0').toString().replace(/[^0-9.-]+/g,'')) || 0;
    const line = priceNum * item.qty;
    total += line;
    const tr = document.createElement('tr');

    // Product cell: include thumbnail (hidden on desktop) and product name
    const nameTd = document.createElement('td');
    nameTd.setAttribute('data-label','Sản phẩm');
    const productInner = document.createElement('div'); productInner.className = 'product-inner';
    const thumb = document.createElement('img'); thumb.className = 'cart-thumb';
    try{ thumb.src = p.image || ''; }catch(e){ thumb.src = ''; }
    const nameSpan = document.createElement('span'); nameSpan.className = 'product-name'; nameSpan.textContent = p.name; nameSpan.title = p.name;
    productInner.appendChild(thumb);
    productInner.appendChild(nameSpan);
    nameTd.appendChild(productInner);

    // Price cell
    const priceTd = document.createElement('td'); priceTd.setAttribute('data-label','Giá');
    const priceVal = document.createElement('span'); priceVal.className = 'value'; priceVal.textContent = formatPrice(priceNum);
    priceTd.appendChild(priceVal);

    // Quantity cell
    const qtyTd = document.createElement('td'); qtyTd.setAttribute('data-label','Số lượng');
    qtyTd.className = 'qty-controls';
    const dec = document.createElement('button'); dec.textContent='-'; dec.className='qty-btn';
    const qtySpan = document.createElement('span'); qtySpan.textContent = item.qty;
    const inc = document.createElement('button'); inc.textContent='+'; inc.className='qty-btn';
    dec.addEventListener('click', ()=>{ if(item.qty>1){ item.qty--; renderCart(); } });
    inc.addEventListener('click', ()=>{ item.qty++; renderCart(); });
    const qtyWrap = document.createElement('div'); qtyWrap.className = 'qty-wrap'; qtyWrap.appendChild(dec); qtyWrap.appendChild(qtySpan); qtyWrap.appendChild(inc);
    qtyTd.appendChild(qtyWrap);

    // Line total cell
    const lineTd = document.createElement('td'); lineTd.setAttribute('data-label','Thành tiền');
    const lineVal = document.createElement('span'); lineVal.className = 'value'; lineVal.textContent = formatPrice(line);
    lineTd.appendChild(lineVal);

    // Action cell
    const remTd = document.createElement('td'); remTd.setAttribute('data-label','Hành động');
    const remBtn = document.createElement('button'); remBtn.textContent='Xóa'; remBtn.addEventListener('click', ()=>{ delete cart[code]; renderCart(); });
    remTd.appendChild(remBtn);

    // Append cells in order: product | price | qty | total | action
    tr.appendChild(nameTd);
    tr.appendChild(priceTd);
    tr.appendChild(qtyTd);
    tr.appendChild(lineTd);
    tr.appendChild(remTd);
    tr.dataset.code = code;
    cartTableBody.appendChild(tr);
  });
  cartTotalEl.textContent = formatPrice(total);
}

// Return numeric cart total (unformatted)
function getCartTotal(){
  let total = 0;
  Object.keys(cart).forEach(code => {
    const item = cart[code];
    const p = item.product;
    const priceNum = parseFloat((p.price||'0').toString().replace(/[^0-9.-]+/g,'')) || 0;
    total += priceNum * item.qty;
  });
  return total;
}

clearCartBtn.addEventListener('click', ()=>{ if(confirm('Xóa toàn bộ giỏ hàng?')){ cart = {}; renderCart(); } });
checkoutBtn.addEventListener('click', ()=>{
  // Show payment modal with QR only; do not clear the cart
  const total = getCartTotal();
  const formatted = formatPrice(total);
  const shop = 'Cửa hàng Thúy Dưỡng';
  const payload = `${shop}\nTổng: ${formatted} ₫`;
  const qrSrc = 'https://chart.googleapis.com/chart?chs=300x300&cht=qr&chl=' + encodeURIComponent(payload);
  const paymentModal = document.getElementById('paymentModal');
  const paymentQRCode = document.getElementById('paymentQRCode');
  const paymentAmount = document.getElementById('paymentAmount');
  // Prefer to show a local `QR.jpg` file if present; if it fails to load, fall back to generated QR.
  try{
    if(paymentQRCode){
      paymentQRCode.onerror = function(){
        /* Local QR.jpg failed to load, falling back to generated QR */
        paymentQRCode.onerror = null; // avoid loop
        paymentQRCode.src = qrSrc;
      };
      // set src to local file first (will trigger onerror if not served)
      paymentQRCode.src = '/public/uploads/QR.jpg';
    }
  }catch(e){
    if(paymentQRCode) paymentQRCode.src = qrSrc;
  }
  if(paymentAmount) paymentAmount.textContent = formatted + ' ₫';
  if(paymentModal) paymentModal.style.display = 'flex';
});

// Payment modal controls: close and copy content
const paymentModalEl = document.getElementById('paymentModal');
const paymentCloseBtn = document.getElementById('paymentCloseBtn');
if(paymentCloseBtn){ paymentCloseBtn.addEventListener('click', ()=>{ if(paymentModalEl) paymentModalEl.style.display='none'; }); }
if(paymentModalEl){ paymentModalEl.addEventListener('click', (ev)=>{ if(ev.target === paymentModalEl) paymentModalEl.style.display='none'; }); }

// Mode switch handling
modePrice.addEventListener('change', ()=>{ if(modePrice.checked){ mode='price'; cartArea.style.display='none'; productBox.style.display='none'; } });
modeCart.addEventListener('change', ()=>{ if(modeCart.checked){ mode='cart'; cartArea.style.display='block'; productBox.style.display='none'; } });

// init
listDevices();

// Compact toggle handler: keep video in a small floating box so page doesn't reflow
if(compactBtn && videoWrap){
  // compact/drag features removed — using expanded camera by default
}

// Try to refresh device list when user focuses the page (useful for mobile camera permissions)
window.addEventListener('focus', ()=>listDevices());

// Note: when decodeFromVideoDevice finds a code it automatically stops streaming via reset() above.

// --- Scanner helpers: preprocessing, BarcodeDetector & high-res loop ---
function preprocessCanvas(ctx, w, h){
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
    for(let i=0;i<data.length;i+=4){
      let v = data[i];
      v = Math.round((v - min) * 255 / range);
      data[i]=data[i+1]=data[i+2]=v;
    }
    ctx.putImageData(imgd, 0, 0);
  }catch(e){ /* preprocess failed */ }
}

function getBarcodeDetector(){
  if(typeof BarcodeDetector === 'undefined') return null;
  try{
    if(!barcodeDetector) barcodeDetector = new BarcodeDetector({ formats: [ 'ean_13','ean_8','upc_e','upc_a','code_128','code_39','qr_code' ] });
    return barcodeDetector;
  }catch(e){ return null; }
}

async function detectWithBarcodeDetector(source){
  const detector = getBarcodeDetector();
  if(!detector) return null;
  try{
    const result = await detector.detect(source);
    if(result && result.length) return result[0].rawValue || (result[0].raw && result[0].raw.value);
    return null;
  }catch(e){ return null; }
}

async function startScanner(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no_media');
  // Prefer using an explicit deviceId when available (we attempted to auto-select a rear camera in listDevices).
  // Otherwise ask for the environment (rear) camera.
  let stream;
  const baseVideoConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } };
  try{
    if(selectedDeviceId){
      stream = await navigator.mediaDevices.getUserMedia({ video: Object.assign({ deviceId: { exact: selectedDeviceId } }, baseVideoConstraints) });
    }else{
      // Try to request the environment camera; some browsers accept 'ideal', some accept 'exact'.
      try{
        stream = await navigator.mediaDevices.getUserMedia({ video: Object.assign({ facingMode: { exact: 'environment' } }, baseVideoConstraints) });
      }catch(e){
        stream = await navigator.mediaDevices.getUserMedia({ video: Object.assign({ facingMode: { ideal: 'environment' } }, baseVideoConstraints) });
      }
    }
  }catch(err){
    // If everything fails, bubble up the error
    throw err;
  }
  currentStream = stream;
  video.srcObject = stream;
  await video.play();

  // Torch support removed; no torch UI shown

  const canvas = document.getElementById('canvas') || document.createElement('canvas');
  // When repeatedly reading pixels (getImageData) set willReadFrequently for better performance
  // and to avoid the browser warning about multiple readbacks.
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let stopped = false;

  async function loop(){
    if(stopped) return;
    try{
      const w = video.videoWidth || 1280;
      const h = video.videoHeight || 720;
      canvas.width = w; canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);

      // try native detector first
      const nativeResult = await detectWithBarcodeDetector(canvas);
      if(nativeResult){
        const now = Date.now();
        if(!(lastDetected.code === nativeResult && (now - lastDetected.time) < 800)){
          lastDetected.code = nativeResult; lastDetected.time = now;
          handleDetected(nativeResult);
        }
        // continue scanning without stopping the stream
      }

      // preprocess and try ZXing
      preprocessCanvas(ctx, w, h);
      try{
        const zres = await codeReader.decodeFromImage(canvas);
        if(zres && zres.text){
          const now = Date.now();
          if(!(lastDetected.code === zres.text && (now - lastDetected.time) < 800)){
            lastDetected.code = zres.text; lastDetected.time = now;
            handleDetected(zres.text);
          }
          // continue scanning without stopping the stream
        }
      }catch(e){ /* ignore not found */ }
    }catch(e){ /* scan loop error */ }
    setTimeout(loop, 350);
  }
  loop();

  return ()=>{ stopped=true; try{ stream.getTracks().forEach(t=>t.stop()); }catch(e){} currentStream=null; scanning=false; scanningStopper = null; };
}

// Torch feature removed

// Torch helpers removed per request

function handleDetected(code){
  barcodeValue.textContent = code;
  if(mode === 'price') showProductForBarcode(code); else addToCartByBarcode(code);
}

// Manual lookup handler (for when scanning fails)
if(manualLookupBtn){
  manualLookupBtn.addEventListener('click', (ev)=>{
    try{
      if(ev && typeof ev.preventDefault === 'function') ev.preventDefault();
      const code = (manualBarcodeInput && manualBarcodeInput.value || '').trim();
      if(!code){ alert('Vui lòng nhập mã vạch'); if(manualBarcodeInput) manualBarcodeInput.focus(); return; }
      /* manual lookup for code */
      if(mode === 'price') showProductForBarcode(code); else addToCartByBarcode(code);
      if(manualBarcodeInput) manualBarcodeInput.value = '';
    }catch(e){ alert('Lỗi khi tra mã: ' + (e && e.message)); }
  });
  if(manualBarcodeInput){
    manualBarcodeInput.addEventListener('keydown', (ev)=>{ if(ev.key === 'Enter' || ev.keyCode === 13){ ev.preventDefault(); manualLookupBtn.click(); } });
  }
}else{
  /* manual lookup button not found */
}
