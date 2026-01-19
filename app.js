// استيراد الدوال اللازمة من Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-analytics.js";
import { getDatabase, ref, set, push, onValue, update, remove, get, child } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

// إعدادات المشروع الخاص بك
const firebaseConfig = {
  apiKey: "AIzaSyASxglONJzsx3gh8rchr2He6CCzlZtTbUg",
  authDomain: "ll-2ce76.firebaseapp.com",
  projectId: "ll-2ce76",
  storageBucket: "ll-2ce76.firebasestorage.app",
  messagingSenderId: "786471601828",
  appId: "1:786471601828:web:5fcee7031c7537eb63c831",
  measurementId: "G-WM7PNBPF30"
};

// تهيئة التطبيق
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getDatabase(app);
const auth = getAuth(app);

window.db = db;
window.auth = auth;
console.log("Firebase Connected Successfully!");

// --- إعدادات التطبيق ---
const APP_PIN = "123321";
const LOCAL_STORAGE_KEY = "car_debt_v3_data";
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/dsh6xspyf/image/upload";
const UPLOAD_PRESET = "dfokfmdf";

let currentState = {
    customers: [],
    auditLog: []
};
let currentCustomerViewId = null;
let selectedCustomerIdForPay = null;
let selectedImagesForPrint = new Set(); // لتخزين الصور المختارة للطباعة
let currentEditingCustomerId = null;

// --- عند التشغيل ---
document.addEventListener('DOMContentLoaded', () => {
    const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (localData) {
        currentState = JSON.parse(localData);
        updateUI();
    }
    setupRealtimeListener();
    updateOnlineStatus();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
});

function setupRealtimeListener() {
    const dbRef = ref(db, 'debt_system_data');
    onValue(dbRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
            currentState = data;
            if (!currentState.customers) currentState.customers = [];
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(currentState));
            updateUI();
        }
    }, (error) => {
        console.error("Firebase Error:", error);
    });
}

function updateUI() {
    const activePage = document.querySelector('.page.active');
    if (activePage && activePage.id === 'page-customers') renderCustomers();
    if (activePage && activePage.id === 'page-payments') renderPaymentClients();
    if (activePage && activePage.id === 'page-details' && currentCustomerViewId) loadCustomerDetails(currentCustomerViewId);
}

function updateOnlineStatus() {
    const statusEl = document.getElementById('online-status');
    const syncText = document.getElementById('sync-status');
    if (navigator.onLine) {
        statusEl.className = 'status-indicator online';
        if(syncText) syncText.innerText = "✅ متصل بالسحابة (Online)";
    } else {
        statusEl.className = 'status-indicator offline';
        if(syncText) syncText.innerText = "⚠️ وضع عدم الاتصال (Offline)";
    }
}

// --- وظائف مساعدة ---
function showLoader(show) {
    const loader = document.getElementById('loader');
    if (show) loader.classList.remove('hidden');
    else loader.classList.add('hidden');
}

async function uploadFileToCloudinary(file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", UPLOAD_PRESET);

    try {
        const response = await fetch(CLOUDINARY_URL, {
            method: "POST",
            body: formData
        });
        const data = await response.json();
        return data.secure_url;
    } catch (error) {
        console.error("Upload Error:", error);
        return null;
    }
}

// --- الأمان ---
function fingerprintAction() {
    const msg = document.getElementById('fingerprint-msg');
    msg.classList.remove('hidden-msg');
    setTimeout(() => msg.classList.add('hidden-msg'), 3000);
}

function checkPin() {
    const input = document.getElementById('pin-input').value;
    if (input === APP_PIN) {
        document.getElementById('welcome-msg').classList.remove('hidden');
        setTimeout(() => {
            document.getElementById('welcome-msg').classList.add('hidden');
            document.getElementById('login-screen').classList.add('hidden');
            updateUI();
        }, 1200);
    } else {
        document.getElementById('login-error').innerText = "رمز خطأ! حاول مجدداً";
    }
}

function logout() { location.reload(); }

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(`page-${pageId}`).classList.add('active');
    
    const navLink = document.querySelector(`.nav-item[onclick*="'${pageId}'"]`);
    if(navLink) navLink.classList.add('active');

    if(pageId === 'customers') renderCustomers();
    if(pageId === 'payments') renderPaymentClients();
}

function saveData() {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(currentState));
    if (navigator.onLine) {
        set(ref(db, 'debt_system_data'), currentState).catch(console.error);
    }
}

function showToast(msg) {
    const x = document.getElementById("toast");
    x.innerText = msg;
    x.className = "toast show";
    setTimeout(() => { x.className = x.className.replace("show", ""); }, 3000);
}

// --- إضافة زبون جديد (مع صور) ---
async function addCustomer() {
    const name = document.getElementById('cust-name').value;
    const car = document.getElementById('cust-car').value;
    const phone = document.getElementById('cust-phone').value;
    const total = parseFloat(document.getElementById('cust-total').value);
    const paid = parseFloat(document.getElementById('cust-paid').value) || 0;
    const checker = document.getElementById('cust-checker').value;
    const notes = document.getElementById('cust-notes').value;
    const currency = document.querySelector('input[name="currency"]:checked').value; 
    const imageInput = document.getElementById('cust-images');

    if (!name || !phone || isNaN(total) || !car) {
        alert("يرجى ملء الحقول الإجبارية");
        return;
    }

    showLoader(true);

    // رفع الصور
    let uploadedImages = [];
    if (imageInput.files.length > 0) {
        for (let file of imageInput.files) {
            const url = await uploadFileToCloudinary(file);
            if (url) uploadedImages.push(url);
        }
    }

    const newCustomer = {
        id: Date.now(),
        name: name,
        carName: car,
        whatsapp: phone,
        currency: currency, 
        totalDebt: total,
        paidTotal: paid,
        remaining: total - paid,
        checkedBy: checker,
        notes: notes,
        images: uploadedImages, // تخزين الروابط
        createdAt: new Date().toISOString(),
        payments: []
    };

    if (paid > 0) {
        newCustomer.payments.push({
            id: Date.now() + 1,
            amount: paid,
            note: "دفعة أولية عند التسجيل",
            date: new Date().toISOString()
        });
    }

    if (!currentState.customers) currentState.customers = [];
    currentState.customers.push(newCustomer);
    
    saveData();
    showLoader(false);
    showToast("تمت الإضافة بنجاح ✅");
    
    // تنظيف
    document.getElementById('cust-name').value = '';
    document.getElementById('cust-car').value = '';
    document.getElementById('cust-phone').value = '';
    document.getElementById('cust-total').value = '';
    document.getElementById('cust-paid').value = '0';
    document.getElementById('cust-notes').value = '';
    document.getElementById('cust-images').value = '';
    
    showPage('customers');
}

function renderCustomers() {
    const list = document.getElementById('customers-list');
    const query = document.getElementById('search-customers').value.toLowerCase();
    list.innerHTML = '';

    if(!currentState.customers) currentState.customers = [];
    const sorted = [...currentState.customers].reverse();
    const filtered = sorted.filter(c => c.name.toLowerCase().includes(query) || c.carName.toLowerCase().includes(query));

    if(filtered.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:30px; color:#64748b;">لا توجد بيانات مطابقة</div>';
        return;
    }

    filtered.forEach(c => {
        const item = document.createElement('div');
        item.className = `list-item ${c.remaining <= 0 ? 'clear' : 'debt'}`;
        item.onclick = () => loadCustomerDetails(c.id);
        
        item.innerHTML = `
            <div class="item-info">
                <h4>${c.name}</h4>
                <small><i class="fas fa-car"></i> ${c.carName}</small>
                <small><i class="fab fa-whatsapp"></i> ${c.whatsapp}</small>
            </div>
            <div class="price-tag">
                ${formatMoney(c.remaining, c.currency)}<br>
                <span>متبقي</span>
            </div>
        `;
        list.appendChild(item);
    });
}

function loadCustomerDetails(id) {
    const customer = currentState.customers.find(c => c.id === id);
    if (!customer) return;

    currentCustomerViewId = id;
    const container = document.getElementById('details-container');
    const payments = customer.payments || [];
    const curr = customer.currency || 'IQD';

    // عرض الصور في التفاصيل
    let imagesHtml = '';
    if (customer.images && customer.images.length > 0) {
        imagesHtml = `<div style="display:flex; gap:10px; overflow-x:auto; margin-top:10px; padding-bottom:5px;">
            ${customer.images.map(url => `<img src="${url}" style="height:60px; border-radius:8px; border:1px solid #334155;">`).join('')}
        </div>`;
    }

    container.innerHTML = `
        <h2>${customer.name}</h2>
        <div class="details-row"><strong>السيارة:</strong> <span>${customer.carName}</span></div>
        <div class="details-row"><strong>الهاتف:</strong> <a href="https://wa.me/${customer.whatsapp.replace('+','')}" style="color:var(--primary)">${customer.whatsapp}</a></div>
        ${imagesHtml}
        <br>
        <div class="details-row"><span>أصل الدين:</span> <strong>${formatMoney(customer.totalDebt, curr)}</strong></div>
        <div class="details-row"><span>مجموع واصل:</span> <strong class="highlight-val">${formatMoney(customer.paidTotal, curr)}</strong></div>
        <div class="details-row"><span>الباقي بذمته:</span> <strong class="danger-val">${formatMoney(customer.remaining, curr)}</strong></div>
        <br>
        <p style="font-size:0.9rem; color:#94a3b8; background:#0f172a; padding:10px; border-radius:8px;">
            <strong>📝 ملاحظات:</strong> ${customer.notes || 'لا يوجد'}<br>
            <strong>👤 المدقق:</strong> ${customer.checkedBy || '-'}
        </p>
    `;

    const transList = document.getElementById('transactions-list');
    transList.innerHTML = '';
    
    [...payments].reverse().forEach(p => {
        const row = document.createElement('div');
        row.className = 'list-item';
        row.style.cursor = 'default';
        row.innerHTML = `
            <div>
                <strong style="color:var(--primary)">${formatMoney(p.amount, curr)}</strong>
                <div style="font-size:0.8rem; color:#94a3b8">${p.note}</div>
            </div>
            <div style="font-size:0.75rem; text-align:left; color:#64748b">
                ${new Date(p.date).toLocaleDateString('ar-IQ')}<br>
                ${new Date(p.date).toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'})}
            </div>
        `;
        transList.appendChild(row);
    });

    showPage('details');
}

// --- قسم التسديد والطباعة (المعدل) ---
function renderPaymentClients() {
    const list = document.getElementById('payment-clients-list');
    const query = document.getElementById('search-payment-client').value.toLowerCase();
    list.innerHTML = '';
    
    if(!currentState.customers) return;

    const filtered = currentState.customers.filter(c => c.remaining > 0 && c.name.toLowerCase().includes(query));

    filtered.forEach(c => {
        const item = document.createElement('div');
        item.className = 'list-item debt';
        item.onclick = () => openPaymentModal(c.id);
        const curr = c.currency || 'IQD';
        item.innerHTML = `
            <div class="item-info">
                <h4>${c.name}</h4>
                <small>${c.carName}</small>
            </div>
            <div class="price-tag">${formatMoney(c.remaining, curr)}</div>
        `;
        list.appendChild(item);
    });
}

function openPaymentModal(id) {
    selectedCustomerIdForPay = id;
    selectedImagesForPrint = new Set(); // تصفير التحديد
    const c = currentState.customers.find(x => x.id === id);
    const curr = c.currency || 'IQD';
    
    document.getElementById('pay-modal-info').innerHTML = `
        الزبون: <b style="color:white">${c.name}</b><br>
        الباقي الحالي: <span style="color:var(--danger)">${formatMoney(c.remaining, curr)}</span>
    `;
    
    // إعادة تعيين الواجهة
    document.getElementById('payment-inputs-area').classList.remove('hidden');
    document.getElementById('print-options-area').classList.add('hidden');
    document.getElementById('pay-amount').value = '';
    document.getElementById('pay-note').value = '';
    
    document.getElementById('payment-form-modal').classList.remove('hidden');
    document.getElementById('pay-amount').focus();
}

function closePaymentModal() {
    document.getElementById('payment-form-modal').classList.add('hidden');
    selectedCustomerIdForPay = null;
}

function submitPayment() {
    const amount = parseFloat(document.getElementById('pay-amount').value);
    const note = document.getElementById('pay-note').value;
    
    if (!amount || amount <= 0) {
        alert("يرجى إدخال مبلغ صحيح");
        return;
    }

    const cIndex = currentState.customers.findIndex(x => x.id === selectedCustomerIdForPay);
    if (cIndex === -1) return;

    const c = currentState.customers[cIndex];
    c.paidTotal += amount;
    c.remaining = c.totalDebt - c.paidTotal;
    
    if(!c.payments) c.payments = [];
    c.payments.push({
        id: Date.now(),
        amount: amount,
        note: note || "تسديد نقدي",
        date: new Date().toISOString()
    });

    saveData();
    showToast("تم حفظ التسديد 💰");
    renderPaymentClients();
    
    // التحول لوضع الطباعة بدلاً من إغلاق النافذة
    setupPrintModeInModal(c);
}

function setupPrintModeInModal(customer) {
    document.getElementById('payment-inputs-area').classList.add('hidden');
    document.getElementById('print-options-area').classList.remove('hidden');

    const imgContainer = document.getElementById('payment-images-container');
    imgContainer.innerHTML = '';

    if (customer.images && customer.images.length > 0) {
        customer.images.forEach((imgUrl, idx) => {
            const div = document.createElement('div');
            div.className = 'img-thumb-container';
            div.innerHTML = `<img src="${imgUrl}">`;
            div.onclick = function() {
                if (div.classList.contains('selected')) {
                    div.classList.remove('selected');
                    selectedImagesForPrint.delete(imgUrl);
                } else {
                    div.classList.add('selected');
                    selectedImagesForPrint.add(imgUrl);
                }
            };
            imgContainer.appendChild(div);
        });
    } else {
        imgContainer.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:#64748b">لا توجد صور لهذا الزبون</p>';
    }
}

function executePrint() {
    const customer = currentState.customers.find(x => x.id === selectedCustomerIdForPay);
    if (!customer) return;

    const curr = customer.currency || 'IQD';
    const lastPayment = customer.payments[customer.payments.length - 1]; // آخر تسديد تم حفظه الآن
    const printArea = document.getElementById('print-area');
    
    // تحضير الصور المختارة
    let imagesHtml = '';
    if (selectedImagesForPrint.size > 0) {
        imagesHtml = `<div class="print-images-area">
            ${Array.from(selectedImagesForPrint).map(url => `
                <div class="print-img-box"><img src="${url}"></div>
            `).join('')}
        </div>`;
    }

    // تصميم ورقة الطباعة
    printArea.innerHTML = `
        <div class="invoice-header">
            <h2>وصل تسديد نقد</h2>
            <p>تاريخ: ${new Date().toLocaleString('ar-IQ')}</p>
        </div>

        <div class="info-grid">
            <div>
                <strong>الزبون:</strong> ${customer.name} <br>
                <strong>السيارة:</strong> ${customer.carName}
            </div>
            <div>
                <strong>رقم الوصل:</strong> #${lastPayment.id} <br>
                <strong>الهاتف:</strong> ${customer.whatsapp}
            </div>
        </div>

        <div class="summary-box">
             <div style="font-size:1.4rem; text-align:center; margin-bottom:10px;">
                المبلغ الواصل: <strong>${formatMoney(lastPayment.amount, curr)}</strong>
            </div>
            <div style="text-align:center;">
                فقط وقدره: ${lastPayment.note}
            </div>
        </div>

        <table class="print-table">
            <tr>
                <th>أصل الدين</th>
                <th>مجموع المسدد سابقاً وحالياً</th>
                <th>الباقي الحالي بذمته</th>
            </tr>
            <tr>
                <td>${formatMoney(customer.totalDebt, curr)}</td>
                <td>${formatMoney(customer.paidTotal, curr)}</td>
                <td style="font-weight:bold">${formatMoney(customer.remaining, curr)}</td>
            </tr>
        </table>

        ${imagesHtml}

        <div class="print-footer">
            <p>شكراً لتعاملكم معنا</p>
            <br><br>
            <div style="display:flex; justify-content:space-around">
                <span>توقيع المستلم</span>
                <span>توقيع الحسابات</span>
            </div>
        </div>
    `;

    window.print();
    closePaymentModal();
}

// --- نظام التعديل الجديد ---
function openEditModal() {
    if (!currentCustomerViewId) return;
    const customer = currentState.customers.find(c => c.id === currentCustomerViewId);
    if (!customer) return;

    currentEditingCustomerId = customer.id;

    // ملء البيانات
    document.getElementById('edit-name').value = customer.name;
    document.getElementById('edit-car').value = customer.carName;
    document.getElementById('edit-phone').value = customer.whatsapp;
    document.getElementById('edit-total').value = customer.totalDebt;
    document.getElementById('edit-paid').value = customer.paidTotal;
    document.getElementById('edit-notes').value = customer.notes;
    document.getElementById('edit-new-images').value = '';

    // عرض الصور الحالية للحذف
    const imgContainer = document.getElementById('edit-images-list');
    imgContainer.innerHTML = '';
    if (customer.images) {
        customer.images.forEach((url) => {
            const div = document.createElement('div');
            div.className = 'img-thumb-container';
            div.innerHTML = `
                <img src="${url}">
                <button class="delete-img-btn" onclick="deleteImageFromEdit('${url}')">×</button>
            `;
            imgContainer.appendChild(div);
        });
    }

    document.getElementById('edit-modal').classList.remove('hidden');
}

window.deleteImageFromEdit = function(urlToDelete) {
    if(!confirm('حذف الصورة؟')) return;
    const customer = currentState.customers.find(c => c.id === currentEditingCustomerId);
    if(customer && customer.images) {
        customer.images = customer.images.filter(url => url !== urlToDelete);
        openEditModal(); // إعادة رسم المودال
    }
};

async function saveEditCustomer() {
    const customer = currentState.customers.find(c => c.id === currentEditingCustomerId);
    if (!customer) return;

    // تحديث البيانات النصية
    customer.name = document.getElementById('edit-name').value;
    customer.carName = document.getElementById('edit-car').value;
    customer.whatsapp = document.getElementById('edit-phone').value;
    customer.totalDebt = parseFloat(document.getElementById('edit-total').value) || 0;
    customer.paidTotal = parseFloat(document.getElementById('edit-paid').value) || 0;
    customer.notes = document.getElementById('edit-notes').value;
    
    // إعادة حساب المتبقي
    customer.remaining = customer.totalDebt - customer.paidTotal;

    // رفع صور جديدة إن وجدت
    const newImagesInput = document.getElementById('edit-new-images');
    if (newImagesInput.files.length > 0) {
        showLoader(true);
        for (let file of newImagesInput.files) {
            const url = await uploadFileToCloudinary(file);
            if (url) {
                if(!customer.images) customer.images = [];
                customer.images.push(url);
            }
        }
        showLoader(false);
    }

    saveData();
    document.getElementById('edit-modal').classList.add('hidden');
    showToast("تم تعديل البيانات بنجاح ✏️");
    loadCustomerDetails(currentEditingCustomerId); // تحديث الواجهة
}

function deleteCustomerConfirm() {
    if(!currentCustomerViewId) return;
    if(confirm("هل أنت متأكد من حذف هذا السجل؟ لا يمكن التراجع!")) {
        currentState.customers = currentState.customers.filter(c => c.id !== currentCustomerViewId);
        saveData();
        showToast("تم الحذف 🗑️");
        showPage('customers');
    }
}

function formatMoney(amount, currency = 'IQD') {
    if (currency === 'USD') {
        return new Intl.NumberFormat('en-US', { 
            style: 'currency', currency: 'USD',
            minimumFractionDigits: 0, maximumFractionDigits: 2
        }).format(amount);
    } else {
        return new Intl.NumberFormat('ar-IQ', { 
            style: 'currency', currency: 'IQD', maximumFractionDigits: 0 
        }).format(amount);
    }
}

function forceSync() {
    if(navigator.onLine) {
        saveData();
        showToast("جاري المزامنة...");
    } else {
        alert("لا يوجد إنترنت");
    }
}

window.exportData = function() {
    const dataStr = JSON.stringify(currentState);
    const link = document.createElement('a');
    link.href = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    link.download = `backup_${new Date().toISOString().slice(0,10)}.json`;
    link.click();
};

window.importData = function(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if(data.customers) {
                currentState = data;
                saveData();
                alert("تم استعادة البيانات بنجاح");
                location.reload();
            } else {
                alert("ملف غير صالح");
            }
        } catch(err) { alert("خطأ في الملف"); }
    };
    reader.readAsText(file);
};

// ربط الدوال
window.fingerprintAction = fingerprintAction;
window.checkPin = checkPin;
window.logout = logout;
window.showPage = showPage;
window.addCustomer = addCustomer;
window.renderCustomers = renderCustomers;
window.loadCustomerDetails = loadCustomerDetails;
window.renderPaymentClients = renderPaymentClients;
window.openPaymentModal = openPaymentModal;
window.closePaymentModal = closePaymentModal;
window.submitPayment = submitPayment;
window.executePrint = executePrint;
window.openEditModal = openEditModal;
window.saveEditCustomer = saveEditCustomer;
window.deleteCustomerConfirm = deleteCustomerConfirm;
window.forceSync = forceSync;
