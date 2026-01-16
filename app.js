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
const LOCAL_STORAGE_KEY = "car_debt_v3_data"; // مفتاح جديد للنسخة الجديدة

let currentState = {
    customers: [],
    auditLog: []
};
let currentCustomerViewId = null;
let selectedCustomerIdForPay = null;

// --- عند التشغيل ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. تحميل محلي
    const localData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (localData) {
        currentState = JSON.parse(localData);
        updateUI();
    }

    // 2. ربط Firebase
    setupRealtimeListener();

    // 3. حالة الشبكة
    updateOnlineStatus();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
});

// --- وظيفة الاستماع المباشر ---
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

// --- الأمان ---
function fingerprintAction() {
    const msg = document.getElementById('fingerprint-msg');
    msg.classList.remove('hidden-msg');
    setTimeout(() => msg.classList.add('hidden-msg'), 3000);
}

function checkPin() {
    const input = document.getElementById('pin-input').value;
    if (input === APP_PIN) {
        const welcome = document.getElementById('welcome-msg');
        welcome.classList.remove('hidden');
        setTimeout(() => {
            welcome.classList.add('hidden');
            document.getElementById('login-screen').classList.add('hidden');
            updateUI();
        }, 1200);
    } else {
        document.getElementById('login-error').innerText = "رمز خطأ! حاول مجدداً";
    }
}

function logout() { location.reload(); }

// --- التنقل ---
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(`page-${pageId}`).classList.add('active');
    
    const navLink = document.querySelector(`.nav-item[onclick*="'${pageId}'"]`);
    if(navLink) navLink.classList.add('active');

    if(pageId === 'customers') renderCustomers();
    if(pageId === 'payments') renderPaymentClients();
}

// --- الحفظ ---
function saveData() {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(currentState));
    if (navigator.onLine) {
        set(ref(db, 'debt_system_data'), currentState)
            .catch((err) => console.error("Cloud Error", err));
    }
}

function showToast(msg) {
    const x = document.getElementById("toast");
    x.innerText = msg;
    x.className = "toast show";
    setTimeout(() => { x.className = x.className.replace("show", ""); }, 3000);
}

// --- إضافة زبون جديد ---
function addCustomer() {
    const name = document.getElementById('cust-name').value;
    const car = document.getElementById('cust-car').value;
    const phone = document.getElementById('cust-phone').value;
    const total = parseFloat(document.getElementById('cust-total').value);
    const paid = parseFloat(document.getElementById('cust-paid').value) || 0;
    const checker = document.getElementById('cust-checker').value;
    const notes = document.getElementById('cust-notes').value;
    
    // جلب العملة المختارة
    const currency = document.querySelector('input[name="currency"]:checked').value; 

    if (!name || !phone || isNaN(total) || !car) {
        alert("يرجى ملء الحقول الإجبارية");
        return;
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
    showToast("تمت الإضافة بنجاح ✅");
    
    // تنظيف
    document.getElementById('cust-name').value = '';
    document.getElementById('cust-car').value = '';
    document.getElementById('cust-phone').value = '';
    document.getElementById('cust-total').value = '';
    document.getElementById('cust-paid').value = '0';
    document.getElementById('cust-notes').value = '';
    
    showPage('customers');
}

// --- عرض الزبائن ---
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

// --- تفاصيل الزبون ---
function loadCustomerDetails(id) {
    const customer = currentState.customers.find(c => c.id === id);
    if (!customer) return;

    currentCustomerViewId = id;
    const container = document.getElementById('details-container');
    const payments = customer.payments || [];
    const curr = customer.currency || 'IQD';

    container.innerHTML = `
        <h2>${customer.name}</h2>
        <div class="details-row"><strong>السيارة:</strong> <span>${customer.carName}</span></div>
        <div class="details-row"><strong>الهاتف:</strong> <a href="https://wa.me/${customer.whatsapp.replace('+','')}" style="color:var(--primary)">${customer.whatsapp}</a></div>
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

// --- قسم التسديد والطباعة ---
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
    const c = currentState.customers.find(x => x.id === id);
    const curr = c.currency || 'IQD';
    
    document.getElementById('pay-modal-info').innerHTML = `
        الزبون: <b style="color:white">${c.name}</b><br>
        الباقي الحالي: <span style="color:var(--danger)">${formatMoney(c.remaining, curr)}</span>
    `;
    document.getElementById('payment-form-modal').classList.remove('hidden');
    document.getElementById('pay-amount').value = '';
    document.getElementById('pay-note').value = '';
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
    closePaymentModal();
    showToast("تم التسديد بنجاح 💰");
    renderPaymentClients(); 
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

// --- التنسيق المالي ---
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

// --- الطباعة (مربوطة الآن بنافذة التسديد) ---
function openPrintModalFromPayment() {
    if(!selectedCustomerIdForPay) return;
    
    // نغلق مودال التسديد ونفتح مودال إعدادات الطباعة
    document.getElementById('payment-form-modal').classList.add('hidden');
    document.getElementById('print-modal').classList.remove('hidden');
    
    const savedOffice = localStorage.getItem('office_name_pref') || '';
    document.getElementById('print-office-input').value = savedOffice;
}

function executePrint() {
    // الطباعة تأخذ بيانات الزبون المحدد في نافذة التسديد
    const officeName = document.getElementById('print-office-input').value;
    const note = document.getElementById('print-note-input').value;
    
    if(officeName) localStorage.setItem('office_name_pref', officeName);

    // نستخدم selectedCustomerIdForPay لأنه يأتي من زر التسديد
    const c = currentState.customers.find(x => x.id === selectedCustomerIdForPay);
    
    // في حال حصل خطأ وكان المتغير فارغ، نحاول استخدام currentCustomerViewId كاحتياط
    const targetCustomer = c || currentState.customers.find(x => x.id === currentCustomerViewId);

    if (!targetCustomer) {
        alert("خطأ: لم يتم تحديد زبون للطباعة");
        return;
    }

    const payments = targetCustomer.payments || [];
    const curr = targetCustomer.currency || 'IQD';

    const printArea = document.getElementById('print-area');
    
    let tableRows = '';
    // عرض كل الدفعات بالتفصيل
    [...payments].reverse().forEach(p => {
        tableRows += `
            <tr>
                <td style="direction:ltr; font-weight:bold">${formatMoney(p.amount, curr)}</td>
                <td>${p.note}</td>
                <td style="direction:ltr">${new Date(p.date).toLocaleDateString('en-GB')}</td>
            </tr>
        `;
    });

    printArea.innerHTML = `
        <div class="invoice-header">
            <h2>${officeName || 'كشف حساب'}</h2>
            <p>تاريخ الطباعة: ${new Date().toLocaleString('ar-IQ')}</p>
        </div>

        <div class="info-grid">
            <div>
                <strong>الاسم:</strong> ${targetCustomer.name} <br>
                <strong>الهاتف:</strong> ${targetCustomer.whatsapp}
            </div>
            <div>
                <strong>السيارة:</strong> ${targetCustomer.carName} <br>
                <strong>رقم الملف:</strong> #${targetCustomer.id.toString().slice(-6)}
            </div>
        </div>

        <div class="summary-box">
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <span>المبلغ الكلي (الدين):</span> <strong>${formatMoney(targetCustomer.totalDebt, curr)}</strong>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <span>مجموع المسدد (الواصل):</span> <strong>${formatMoney(targetCustomer.paidTotal, curr)}</strong>
            </div>
            <hr style="border-top:1px dashed #000; margin:10px 0">
            <div style="display:flex; justify-content:space-between; font-size:1.3em; font-weight:bold">
                <span>الباقي بذمته:</span> <span>${formatMoney(targetCustomer.remaining, curr)}</span>
            </div>
        </div>

        <h3 style="text-align:center; margin-bottom:10px; border-bottom:1px solid #000; display:inline-block">تفاصيل الدفعات</h3>
        <table class="print-table">
            <thead>
                <tr>
                    <th>المبلغ الواصل</th>
                    <th>ملاحظة / نوع الدفعة</th>
                    <th>التاريخ</th>
                </tr>
            </thead>
            <tbody>${tableRows}</tbody>
        </table>

        <div class="print-footer">
            <p>${note}</p>
            <br>
            <p><strong>توقيع المستلم</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <strong>توقيع الحسابات</strong></p>
        </div>
    `;

    document.getElementById('print-modal').classList.add('hidden');
    window.print();
    
    // إعادة فتح مودال التسديد بعد الطباعة (اختياري)
    // selectedCustomerIdForPay = null; // تفريغ المتغير
}

// --- المزامنة والأدوات ---
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
window.deleteCustomerConfirm = deleteCustomerConfirm;
window.openPrintModalFromPayment = openPrintModalFromPayment; // الدالة الجديدة
window.executePrint = executePrint;
window.forceSync = forceSync;
