// --- GLOBAL STATE ---
let currentUser = null; 
let appData = {}; 
let currentMainView = 'dashboard'; 
let workspacePath = { semester: null, subject: null };
let pinnedResources = JSON.parse(localStorage.getItem('pinnedResources')) || []; 
let activeCharts = {}; 
let qrScanner = null; 
let qrGeneratorInterval = null;

// --- CRITICAL SECURITY: String Escapers ---
const esc = (str) => String(str || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
const jsEsc = (str) => String(str || '').replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, "&quot;").replace(/\n/g, ' ').replace(/\r/g, '');

// --- TOAST NOTIFICATIONS ---
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

// --- GLOBAL ROUTING FUNCTIONS ---
window.navEcosystem = function() {
    workspacePath.semester = null; 
    workspacePath.subject = null; 
    renderCanvas();
};
window.navSemester = function(sem) {
    workspacePath.semester = sem; 
    workspacePath.subject = null; 
    renderCanvas();
};
window.navSubject = function(sub) {
    workspacePath.subject = sub; 
    renderCanvas();
};

// --- UI & THEME HELPERS ---
function toggleTheme() { 
    document.documentElement.classList.toggle('dark'); 
    localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light'); 
    if(currentMainView === 'admin') setTimeout(renderAdminCharts, 100); 
}
function toggleSidebar() { 
    document.getElementById('sidebar').classList.toggle('-translate-x-full'); 
    document.getElementById('mobile-overlay').classList.toggle('hidden'); 
}
function switchAuthView(viewId) { 
    ['login-view', 'forgot-view'].forEach(id => document.getElementById(id).classList.add('hidden')); 
    document.getElementById(viewId).classList.remove('hidden'); 
}
function togglePassword(inputId, iconId) {
    const input = document.getElementById(inputId); const icon = document.getElementById(iconId);
    if (input.type === 'password') { 
        input.type = 'text'; 
        icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"></path>`; 
    } else { 
        input.type = 'password'; 
        icon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>`; 
    }
}
function togglePin(type, title, link, subject) {
    const existingIndex = pinnedResources.findIndex(p => p.link === link);
    if(existingIndex > -1) { 
        pinnedResources.splice(existingIndex, 1); showToast('Removed from Quick Pins'); 
    } else { 
        pinnedResources.push({ type, title, link, subject }); showToast('Saved to Quick Pins', 'success'); 
    }
    localStorage.setItem('pinnedResources', JSON.stringify(pinnedResources)); renderCanvas();
}
function requestPushPermissions() {
    if (!("Notification" in window)) { showToast("Notifications not supported in this browser.", "error"); return; }
    Notification.requestPermission().then(perm => {
        if (perm === "granted") { showToast("Alerts Enabled!", "success"); document.getElementById('notify-btn').classList.add('hidden'); }
        else { showToast("Permission denied.", "error"); }
    });
}
function checkPushPerm() { 
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") { 
        document.getElementById('notify-btn').classList.remove('hidden'); 
    } 
}

// --- SMART LINK DETECTOR ---
function openQuickPeek(title, url) {
    if (!url) { showToast('Invalid Link', 'error'); return; }
    let embedUrl = url;
    let canEmbed = false; 

    if (url.includes('drive.google.com/file/d/')) { 
        embedUrl = url.replace(/\/view.*$/, '/preview'); 
        canEmbed = true;
    } else if (url.includes('docs.google.com')) {
        embedUrl = url.replace(/\/edit.*$/, '/preview');
        canEmbed = true;
    } else if (url.includes('youtube.com/watch')) {
        const videoId = new URL(url).searchParams.get('v');
        embedUrl = `https://www.youtube.com/embed/${videoId}`;
        canEmbed = true;
    } else if (url.includes('youtu.be/')) {
        const videoId = url.split('youtu.be/')[1].split('?')[0];
        embedUrl = `https://www.youtube.com/embed/${videoId}`;
        canEmbed = true;
    }

    if (url.includes('drive.google.com/drive/folders') || url.includes('onedrive.live.com') || url.includes('sharepoint.com') || url.includes('dropbox.com') || url.includes('box.com')) {
        canEmbed = false;
    }
    
    if (!canEmbed) {
        showToast('Opening secure external link...', 'success');
        setTimeout(() => window.open(url, '_blank'), 500);
        return;
    }

    document.getElementById('peek-title').innerText = title;
    document.getElementById('peek-external').href = url;
    document.getElementById('peek-loader').classList.remove('hidden');
    document.getElementById('peek-iframe').src = embedUrl;
    document.getElementById('quick-peek-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('quick-peek-modal').classList.remove('opacity-0'), 10);
}
function closeQuickPeek() {
    document.getElementById('quick-peek-modal').classList.add('opacity-0');
    setTimeout(() => { document.getElementById('quick-peek-modal').classList.add('hidden'); document.getElementById('peek-iframe').src = ''; }, 300);
}

// --- AUTH LOGIC ---
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = document.getElementById('loginBtn'); const status = document.getElementById('login-status');
    btn.classList.add('hidden'); status.classList.remove('hidden');
    const res = await apiCall('login', { rollNumber: document.getElementById('rollNumber').value, password: document.getElementById('password').value });
    if (res && res.success) {
        currentUser = res.user; localStorage.setItem('session', JSON.stringify(currentUser));
        if (res.adminToken) localStorage.setItem('adminToken', res.adminToken);
        apiCall('logActivity', { rollNumber: currentUser.rollNumber, name: currentUser.name, role: currentUser.role });
        setTimeout(initApp, 300);
    } else { 
        showToast(res ? res.message : 'Authentication failed', 'error'); 
        btn.classList.remove('hidden'); status.classList.add('hidden'); 
    }
});

function resetForgotFlow() { 
    document.getElementById('forgotFormStep1').classList.remove('hidden'); 
    document.getElementById('forgotFormStep2').classList.add('hidden'); 
    document.getElementById('resetRoll').value = ''; document.getElementById('resetAnswer').value = ''; 
    switchAuthView('login-view'); 
}

document.getElementById('forgotFormStep1')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = document.getElementById('getQBtn'); btn.innerText = 'Searching...'; btn.disabled = true;
    const res = await apiCall('getSecurityQuestion', { rollNumber: document.getElementById('resetRoll').value });
    if (res && res.success) { 
        document.getElementById('display-sec-q').innerText = res.question; 
        document.getElementById('forgotFormStep1').classList.add('hidden'); document.getElementById('forgotFormStep2').classList.remove('hidden'); 
    } else { showToast(res ? res.message : 'Error finding account', 'error'); } 
    btn.innerText = 'Find Account'; btn.disabled = false;
});

document.getElementById('forgotFormStep2')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = document.getElementById('resetBtn'); btn.innerText = 'Requesting...'; btn.disabled = true;
    const res = await apiCall('requestReset', { rollNumber: document.getElementById('resetRoll').value, answer: document.getElementById('resetAnswer').value });
    showToast(res ? res.message : 'Error requesting reset', res && res.success ? 'success' : 'error'); 
    btn.innerText = 'Request Reset'; btn.disabled = false; 
    if(res && res.success) resetForgotFlow();
});

function logout() { localStorage.clear(); location.reload(); }

// --- INIT & SYNC ---
async function initApp() {
    document.getElementById('auth-layout').classList.add('opacity-0');
    setTimeout(() => { document.getElementById('auth-layout').classList.add('hidden'); document.getElementById('app-layout').classList.remove('hidden'); }, 500);
    
    document.getElementById('ui-username').innerText = currentUser.name;
    document.getElementById('ui-role').innerText = currentUser.role === 'Admin' ? 'Administrator' : 'Student Access';
    document.getElementById('ui-avatar').innerText = currentUser.name.charAt(0).toUpperCase();
    
    if(currentUser.role === 'Admin') { document.getElementById('nav-admin').classList.remove('hidden'); document.getElementById('admin-nav-title').classList.remove('hidden'); }
    if (localStorage.getItem('appCache')) { appData = JSON.parse(localStorage.getItem('appCache')); checkSystemStatus(); } 
    else { document.getElementById('workspace-canvas').innerHTML = `<div class="animate-pulse space-y-4"><div class="h-8 bg-slate-200 dark:bg-white/5 rounded w-1/4"></div><div class="h-48 bg-slate-200 dark:bg-white/5 rounded-3xl w-full"></div></div>`; }
    
    checkPushPerm(); forceSync();
}

async function forceSync() {
    const icon = document.getElementById('sync-icon'); if(icon) icon.classList.add('animate-spin');
    try {
        const res = await apiCall('fetchData');
        if (res && res.success) { 
            appData = res; 
            const validLinks = [...(appData.notes || []), ...(appData.excels || [])].map(x => x.link);
            pinnedResources = pinnedResources.filter(p => validLinks.includes(p.link)); 
            localStorage.setItem('pinnedResources', JSON.stringify(pinnedResources));
            localStorage.setItem('appCache', JSON.stringify(res)); 
            checkSystemStatus();
        }
    } catch(err) { console.error('Sync failed', err); }
    if(icon) icon.classList.remove('animate-spin');
}

function checkSystemStatus() {
    if (appData.systemStatus === 'Offline' && currentUser.role === 'Student') { document.getElementById('shutdown-screen').classList.remove('hidden'); } 
    else { document.getElementById('shutdown-screen').classList.add('hidden'); renderCanvas(); }
}

function switchMainView(view) {
    if(qrScanner) { qrScanner.clear(); qrScanner = null; }
    if(qrGeneratorInterval) { clearInterval(qrGeneratorInterval); qrGeneratorInterval = null; }
    
    currentMainView = view; workspacePath = { semester: null, subject: null }; document.getElementById('workspace-scroll').scrollTop = 0;
    if(window.innerWidth < 768) toggleSidebar();
    
    document.querySelectorAll('.nav-btn').forEach(btn => { 
        btn.classList.remove('active', 'bg-slate-100', 'dark:bg-white/10', 'text-slate-900', 'dark:text-white'); 
        btn.classList.add('text-slate-500', 'dark:text-gray-400'); 
    });
    
    const activeBtn = event.currentTarget || document.querySelector(`[onclick="switchMainView('${view}')"]`); 
    if(activeBtn) { 
        activeBtn.classList.remove('text-slate-500', 'dark:text-gray-400'); 
        activeBtn.classList.add('bg-slate-100', 'dark:bg-white/10', 'text-slate-900', 'dark:text-white'); 
    } 
    renderCanvas();
}

// --- MASTER RENDER ENGINE ---
function renderCanvas() {
    const canvas = document.getElementById('workspace-canvas');
    if (!appData.students) return;

    const allAnns = appData.announcements ? appData.announcements.filter(a => a.title).slice().reverse() : [];
    const validNotes = appData.notes ? appData.notes.filter(n => n.title && String(n.title).trim() !== '') : [];
    const validExcels = appData.excels ? appData.excels.filter(e => e.title && String(e.title).trim() !== '') : [];
    const totalResources = validNotes.length + validExcels.length;

    const offlineBanner = (appData.systemStatus === 'Offline' && currentUser.role === 'Admin') 
        ? `<div class="bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 p-4 rounded-2xl mb-8 text-sm font-bold flex items-center justify-center gap-2 shadow-sm"><svg class="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg> SYSTEM IS OFFLINE TO STUDENTS</div>` 
        : '';

    if (currentMainView === 'dashboard') {
        document.getElementById('breadcrumb').innerHTML = '<span class="text-slate-900 dark:text-white font-black tracking-wide text-lg">Dashboard</span>';
        
        let addAnnBtn = currentUser.role === 'Admin' ? `<button onclick="openAnnModal()" class="ml-auto bg-slate-900 dark:bg-white text-white dark:text-black text-xs font-bold px-5 py-2.5 rounded-xl transition-transform hover:scale-[0.98] shadow-md flex items-center gap-2 outline-none">+ Notice</button>` : '';
        const firstName = currentUser.name.split(' ')[0];
        const welcomeHeader = `<div class="mb-10"><h1 class="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight mb-2">Welcome back, <span class="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-purple-500">${esc(firstName)}</span> 👋</h1><p class="text-slate-500 font-medium text-sm md:text-base">Here is your academic overview for today.</p></div>`;

        let pinsHtml = '';
        if (pinnedResources.length > 0) {
            let pinsList = pinnedResources.map(p => {
                const iconPath = p.type === 'Note' ? 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' : 'M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z';
                const colorClass = p.type === 'Note' ? 'text-brand' : 'text-green-500';
                return `
                    <div onclick="openQuickPeek('${jsEsc(p.title)}', '${jsEsc(p.link)}')" class="glass-card p-4 rounded-2xl flex items-center justify-between group hover:border-brand/50 transition-colors cursor-pointer relative overflow-hidden select-none">
                        <div class="flex items-center gap-4 truncate relative z-0 pointer-events-none">
                            <div class="w-12 h-12 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center ${colorClass} shrink-0 shadow-sm"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${iconPath}"></path></svg></div>
                            <div class="truncate"><h4 class="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:underline">${esc(p.title)}</h4><p class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-0.5">${esc(p.subject)}</p></div>
                        </div>
                        <button onclick="event.stopPropagation(); togglePin('${jsEsc(p.type)}', '${jsEsc(p.title)}', '${jsEsc(p.link)}', '${jsEsc(p.subject)}')" class="text-yellow-400 hover:scale-110 transition-transform text-2xl drop-shadow-md ml-2 outline-none relative z-20" title="Unpin">★</button>
                    </div>
                `;
            }).join('');
            pinsHtml = `<div class="mb-12"><h2 class="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2 mb-4">⭐ Quick Pins</h2><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${pinsList}</div></div>`;
        }

        let noticesHtml = allAnns.length > 0 ? allAnns.map(a => {
            let prioColor = 'border-brand text-brand'; let prioBg = 'bg-brand/10 anim-normal';
            if(a.priority === 'High') { prioColor = 'border-red-500 text-red-600 dark:text-red-400'; prioBg = 'bg-red-500/10 anim-high'; }
            if(a.priority === 'Low') { prioColor = 'border-slate-400 text-slate-600 dark:text-gray-400'; prioBg = 'bg-slate-200 dark:bg-white/5'; }
            const expText = a.validUntil ? `<span class="text-[10px] bg-slate-100 dark:bg-black/50 px-2.5 py-1 rounded-md text-slate-500 font-bold border border-slate-200 dark:border-borderDark">Ends: ${new Date(a.validUntil).toLocaleDateString()}</span>` : '';
            let editBtns = currentUser.role === 'Admin' ? `
                <button onclick="openAnnModal('${jsEsc(a.date)}', '${jsEsc(a.title)}')" class="text-brand hover:bg-brand/10 p-2 rounded-xl transition-colors outline-none" title="Edit"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>
                <button onclick="deleteRecord('Announcements', '${jsEsc(a.date)}', '${jsEsc(a.title)}')" class="text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 p-2 rounded-xl transition-colors outline-none" title="Delete"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
            ` : '';

            return `
            <div class="glass-card p-6 md:p-8 rounded-3xl border-l-8 ${prioColor}">
                <div class="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-3">
                    <div>
                        <div class="flex flex-wrap items-center gap-3 mb-4 mt-1">
                            <span class="text-[10px] uppercase tracking-widest font-black ${prioColor} ${prioBg} px-3 py-1.5 rounded-lg inline-block">${esc(a.priority) || 'Normal'}</span>
                            <span class="text-[10px] uppercase tracking-widest font-bold text-slate-500 bg-slate-100 dark:bg-white/5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-borderDark shadow-sm">${esc(a.semester)} • ${esc(a.subject)}</span>
                        </div>
                        <h3 class="text-xl font-bold text-slate-900 dark:text-white">${esc(a.title)}</h3>
                    </div>
                    <div class="flex flex-row md:flex-col items-center md:items-end justify-between w-full md:w-auto gap-2">
                        <div class="flex gap-2">${editBtns}</div>
                        <div class="flex flex-col items-end gap-1 text-right">
                            <span class="text-[10px] text-slate-400 font-mono font-bold">${new Date(a.date).toLocaleDateString()}</span>
                            ${expText}
                        </div>
                    </div>
                </div>
                <p class="text-sm text-slate-700 dark:text-gray-300 leading-relaxed">${esc(a.description)}</p>
            </div>
            `;
        }).join('') : '<div class="glass-card p-10 rounded-3xl text-center text-slate-500 font-medium border border-dashed border-slate-200 dark:border-borderDark">No active announcements.</div>';

        canvas.innerHTML = `
            ${offlineBanner}
            ${welcomeHeader}
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
                <div class="glass-card p-6 md:p-8 rounded-3xl flex flex-col justify-center items-start"><h3 class="text-xs font-bold text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-2">Total Students</h3><p class="text-5xl font-black text-slate-900 dark:text-white tracking-tight drop-shadow-sm">${appData.students.length}</p></div>
                <div class="glass-card p-6 md:p-8 rounded-3xl flex flex-col justify-center items-start"><h3 class="text-xs font-bold text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-2">Total Resources</h3><p class="text-5xl font-black text-slate-900 dark:text-white tracking-tight drop-shadow-sm">${totalResources}</p></div>
                <div class="glass-card p-6 md:p-8 rounded-3xl flex flex-col justify-center items-start"><h3 class="text-xs font-bold text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-2">System Status</h3><p class="text-3xl font-black ${appData.systemStatus === 'Offline' ? 'text-red-500' : 'text-green-500'} mt-1 flex items-center gap-3 drop-shadow-sm"><span class="w-3.5 h-3.5 rounded-full bg-current shadow-[0_0_15px_currentColor] animate-pulse"></span> ${appData.systemStatus === 'Offline' ? 'Offline' : 'Online'}</p></div>
            </div>
            ${pinsHtml}
            <div class="flex flex-col md:flex-row md:justify-between md:items-center mb-6 w-full gap-4"><h2 class="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">Notice Board</h2>${addAnnBtn}</div>
            <div class="space-y-4">${noticesHtml}</div>
        `;
    }

    else if (currentMainView === 'workspace') {
        let bc = `<button onclick="navEcosystem()" class="hover:text-brand font-black tracking-wide text-lg ${!workspacePath.semester ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-gray-500'} outline-none">Ecosystem</button>`;
        if (workspacePath.semester) bc += ` <span class="text-slate-300 dark:text-slate-700 mx-2">/</span> <button onclick="navSemester('${jsEsc(workspacePath.semester)}')" class="hover:text-brand font-black tracking-wide text-lg ${!workspacePath.subject ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-gray-500'} outline-none">${esc(workspacePath.semester)}</button>`;
        if (workspacePath.subject) bc += ` <span class="text-slate-300 dark:text-slate-700 mx-2">/</span> <span class="text-slate-900 dark:text-white font-black tracking-wide text-lg truncate max-w-[150px] md:max-w-none block md:inline">${esc(workspacePath.subject)}</span>`;
        document.getElementById('breadcrumb').innerHTML = `<div class="flex items-center truncate">${bc}</div>`;

        if (!workspacePath.semester) {
            const semesters = [...new Set(appData.modules.filter(m => String(m.semester).trim() !== '').map(m => String(m.semester).trim()))];
            let addFolderCard = currentUser.role === 'Admin' ? `<div onclick="openModuleModal('Semester')" class="eco-card glass-card p-6 rounded-3xl cursor-pointer hover:-translate-y-2 transition-all group flex flex-col justify-center items-center text-center h-48 md:h-56 border border-dashed border-brand/50 shadow-sm hover:shadow-brand/20 bg-brand/5"><div class="w-14 h-14 rounded-2xl bg-brand text-white flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg></div><h3 class="text-sm font-bold text-brand uppercase tracking-widest">Add Semester</h3></div>` : '';

            let semHtml = semesters.map(sem => {
                let deleteBtn = currentUser.role === 'Admin' ? `<button onclick="event.stopPropagation(); deleteModule('${jsEsc(sem)}', null)" class="absolute top-4 right-4 p-2 text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/20 rounded-xl opacity-0 group-hover:opacity-100 transition-all z-20 outline-none"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : '';
                return `
                    <div onclick="navSemester('${jsEsc(sem)}')" class="eco-card glass-card p-6 rounded-3xl cursor-pointer hover:-translate-y-2 hover:border-brand/50 transition-all group shadow-sm hover:shadow-xl relative flex flex-col justify-center items-center text-center h-48 md:h-56 select-none overflow-hidden">
                        ${deleteBtn}
                        <div class="w-full h-full flex flex-col justify-center items-center relative z-0 pointer-events-none">
                            <svg class="w-16 h-16 mb-4 text-brand opacity-90 group-hover:scale-110 transition-transform drop-shadow-md" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path></svg>
                            <h3 class="text-xl font-black text-slate-900 dark:text-white w-full truncate px-2">${esc(sem)}</h3>
                        </div>
                    </div>
                `;
            }).join('');

            canvas.innerHTML = `
                ${offlineBanner}
                <div class="flex flex-col md:flex-row md:justify-between md:items-center mb-10 gap-4">
                    <h1 class="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Ecosystem</h1>
                    <input type="text" id="eco-search" placeholder="Search folders..." class="bg-white dark:bg-black/50 border border-slate-300 dark:border-borderDark rounded-xl px-5 py-3.5 text-sm outline-none focus:border-brand w-full md:w-72 text-slate-900 dark:text-white font-medium shadow-sm">
                </div>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-8">${addFolderCard}${semHtml}</div>
            `;
        }
        else if (workspacePath.semester && !workspacePath.subject) {
            const subjects = [...new Set(appData.modules.filter(m => String(m.semester).trim() === String(workspacePath.semester).trim() && String(m.subject).trim() !== 'General' && String(m.subject).trim() !== '').map(m => String(m.subject).trim()))];
            let addFolderCard = currentUser.role === 'Admin' ? `<div onclick="openModuleModal('Subject')" class="eco-card glass-card p-6 rounded-3xl cursor-pointer hover:-translate-y-2 transition-all group flex flex-col justify-center items-center text-center h-48 md:h-56 border border-dashed border-indigo-400/50 shadow-sm hover:shadow-indigo-500/20 bg-indigo-500/5"><div class="w-14 h-14 rounded-2xl bg-indigo-500 text-white flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg></div><h3 class="text-sm font-bold text-indigo-500 uppercase tracking-widest">Add Subject</h3></div>` : '';

            let subHtml = subjects.map(sub => {
                let deleteBtn = currentUser.role === 'Admin' ? `<button onclick="event.stopPropagation(); deleteModule('${jsEsc(workspacePath.semester)}', '${jsEsc(sub)}')" class="absolute top-4 right-4 p-2 text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl opacity-0 group-hover:opacity-100 transition-all z-20 outline-none"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : '';
                return `
                    <div onclick="navSubject('${jsEsc(sub)}')" class="eco-card glass-card p-6 rounded-3xl cursor-pointer hover:-translate-y-2 hover:border-indigo-500/50 transition-all group shadow-sm hover:shadow-xl relative flex flex-col justify-center items-center text-center h-48 md:h-56 select-none overflow-hidden">
                        ${deleteBtn}
                        <div class="w-full h-full flex flex-col justify-center items-center relative z-0 pointer-events-none">
                            <svg class="w-16 h-16 mb-4 text-indigo-500 opacity-90 group-hover:scale-110 transition-transform drop-shadow-md" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path></svg>
                            <h3 class="text-base md:text-lg font-black text-slate-900 dark:text-white w-full truncate px-2">${esc(sub)}</h3>
                        </div>
                    </div>
                `;
            }).join('');

            canvas.innerHTML = `
                ${offlineBanner}
                <div class="flex flex-col md:flex-row md:justify-between md:items-center mb-10 gap-4">
                    <div class="flex items-center gap-4">
                        <button onclick="navEcosystem()" class="w-12 h-12 rounded-full bg-white dark:bg-white/5 border border-slate-300 dark:border-borderDark flex items-center justify-center text-slate-900 dark:text-white shrink-0 hover:scale-105 transition-transform shadow-sm outline-none">←</button>
                        <h1 class="text-4xl font-black text-slate-900 dark:text-white tracking-tight">${esc(workspacePath.semester)}</h1>
                    </div>
                    <input type="text" id="eco-search" placeholder="Search subjects..." class="bg-white dark:bg-black/50 border border-slate-300 dark:border-borderDark rounded-xl px-5 py-3.5 text-sm outline-none focus:border-brand w-full md:w-72 text-slate-900 dark:text-white font-medium shadow-sm">
                </div>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-8">${addFolderCard}${subHtml}</div>
            `;
        }
        else if (workspacePath.subject) {
            const notes = validNotes.filter(n => String(n.subject).trim() === String(workspacePath.subject).trim() && String(n.semester).trim() === String(workspacePath.semester).trim());
            const excels = validExcels.filter(e => String(e.subject).trim() === String(workspacePath.subject).trim() && String(e.semester).trim() === String(workspacePath.semester).trim());
            let adminBtn = currentUser.role === 'Admin' ? `<button onclick="openResourceModal('create')" class="bg-slate-900 dark:bg-white text-white dark:text-black px-6 py-3 rounded-xl font-bold hover:scale-[0.98] transition-transform shadow-lg flex items-center gap-2 w-full md:w-auto justify-center outline-none">+ Publish Content</button>` : '';

            let generateResourceHTML = (items, typeColor, typeBg, typeName) => items.map(item => {
                const isPinned = pinnedResources.some(p => p.link === item.link);
                const starClass = isPinned ? 'text-yellow-400 drop-shadow-md' : 'text-slate-300 hover:text-yellow-400';
                const icon = typeName === 'Note' ? `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>` : `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>`;
                return `
                    <div onclick="openQuickPeek('${jsEsc(item.title)}', '${jsEsc(item.link)}')" class="glass-card p-5 md:p-6 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between group gap-4 border border-transparent shadow-sm hover:border-${typeName==='Note'?'brand':'green-500'}/30 relative overflow-hidden cursor-pointer select-none">
                        <div class="flex items-center gap-4 overflow-hidden w-full relative z-0 pointer-events-none">
                            <div class="w-12 h-12 rounded-2xl ${typeBg} flex items-center justify-center ${typeColor} shrink-0 shadow-sm">${icon}</div>
                            <span class="text-base font-bold text-slate-900 dark:text-white truncate group-hover:underline">${esc(item.title)}</span>
                        </div>
                        <div class="flex items-center justify-end gap-2 shrink-0 relative z-20">
                            <button onclick="event.stopPropagation(); togglePin('${jsEsc(typeName)}', '${jsEsc(item.title)}', '${jsEsc(item.link)}', '${jsEsc(item.subject)}')" class="${starClass} text-2xl transition-transform hover:scale-110 mr-1 outline-none">★</button>
                            ${currentUser.role === 'Admin' ? `<button onclick="event.stopPropagation(); openResourceModal('edit', '${typeName}s', '${jsEsc(item.title)}', '${jsEsc(item.link)}', '${jsEsc(item.date)}')" class="text-slate-400 hover:${typeColor} p-2 rounded-xl transition-colors font-bold outline-none" title="Edit"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button><button onclick="event.stopPropagation(); deleteRecord('${typeName}s', '${jsEsc(item.date)}', '${jsEsc(item.title)}')" class="text-slate-400 hover:text-red-500 p-2 rounded-xl transition-colors font-bold outline-none" title="Delete"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : ''}
                            <button onclick="event.stopPropagation(); openQuickPeek('${jsEsc(item.title)}', '${jsEsc(item.link)}')" class="text-xs text-white bg-slate-900 dark:bg-white/20 px-5 py-2.5 rounded-xl font-bold uppercase tracking-wider transition-transform hover:scale-95 ml-1 outline-none">View</button>
                        </div>
                    </div>`;
            }).join('');

            canvas.innerHTML = `
                ${offlineBanner}
                <div class="flex flex-col md:flex-row md:justify-between md:items-center mb-10 gap-4">
                    <div class="flex items-center gap-4 overflow-hidden">
                        <button onclick="navSemester('${jsEsc(workspacePath.semester)}')" class="w-12 h-12 rounded-full bg-white dark:bg-white/5 border border-slate-300 dark:border-borderDark flex items-center justify-center text-slate-900 dark:text-white shrink-0 hover:scale-105 transition-transform shadow-sm outline-none">←</button>
                        <h1 class="text-3xl md:text-4xl font-black text-slate-900 dark:text-white truncate leading-tight pb-1">${esc(workspacePath.subject)}</h1>
                    </div>
                    ${adminBtn}
                </div>
                <div class="grid grid-cols-1 xl:grid-cols-2 gap-8 md:gap-10">
                    <div class="space-y-4">
                        <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><div class="w-2 h-2 rounded-full bg-brand"></div> Documentation</h3>
                        ${notes.length > 0 ? generateResourceHTML(notes, 'text-brand', 'bg-brand/10', 'Note') : '<div class="glass-card p-8 rounded-3xl text-center text-slate-500 font-medium border border-dashed border-slate-300 dark:border-borderDark">No documents indexed.</div>'}
                    </div>
                    <div class="space-y-4">
                        <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><div class="w-2 h-2 rounded-full bg-green-500"></div> Data Sheets</h3>
                        ${excels.length > 0 ? generateResourceHTML(excels, 'text-green-600 dark:text-green-400', 'bg-green-500/10', 'Excel') : '<div class="glass-card p-8 rounded-3xl text-center text-slate-500 font-medium border border-dashed border-slate-300 dark:border-borderDark">No datasets indexed.</div>'}
                    </div>
                </div>
            `;
        }
        document.getElementById('eco-search')?.addEventListener('input', (e) => { 
            const term = e.target.value.toLowerCase(); 
            document.querySelectorAll('.eco-card').forEach(card => { card.style.display = card.innerText.toLowerCase().includes(term) ? '' : 'none'; }); 
        });
    }

    else if (currentMainView === 'attendance') {
        document.getElementById('breadcrumb').innerHTML = '<span class="text-slate-900 dark:text-white font-black tracking-wide text-lg">Attendance</span>';
        let tabUI = `
            <div class="flex gap-4 mb-8 border-b border-slate-200 dark:border-borderDark pb-4">
                <button onclick="renderAttendanceTabs('manual')" id="tab-btn-manual" class="px-6 py-2.5 rounded-full font-bold text-sm bg-brand text-white shadow-md transition-colors outline-none">Manual Logging</button>
                <button onclick="renderAttendanceTabs('qr')" id="tab-btn-qr" class="px-6 py-2.5 rounded-full font-bold text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors outline-none">QR Scanning System</button>
            </div>
            <div id="attendance-content-area"></div>
        `;
        canvas.innerHTML = `${offlineBanner}<div class="mb-6"><h1 class="text-4xl font-black text-slate-900 dark:text-white tracking-tight mb-2">Attendance Console</h1></div>${tabUI}`;
        renderAttendanceTabs('manual');
    }

    else if (currentMainView === 'directory') {
        document.getElementById('breadcrumb').innerHTML = '<span class="text-slate-900 dark:text-white font-black tracking-wide text-lg">Directory</span>';
        let csvBtn = currentUser.role === 'Admin' ? `<button onclick="exportCSV()" class="bg-green-600/10 text-green-700 dark:text-green-400 hover:bg-green-600 hover:text-white px-5 py-3.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shadow-sm outline-none"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg> Export CSV</button>` : '';

        let tableRows = appData.students.map((s, idx) => {
            let actionBtns = '';
            if (currentUser.role === 'Admin') {
                if (s.rollNumber !== currentUser.rollNumber) {
                    actionBtns = `
                        <button onclick="toggleUserRole('${jsEsc(s.rollNumber)}', '${jsEsc(s.role)}')" class="px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase bg-slate-200 dark:bg-white/10 text-slate-900 dark:text-white hover:bg-brand hover:text-white transition-colors mr-2 outline-none">Toggle</button>
                        <button onclick="deleteUser('${jsEsc(s.rollNumber)}')" class="px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white transition-colors outline-none">Del</button>
                    `;
                } else {
                    actionBtns = '<span class="text-xs text-slate-400 font-bold px-3 py-1.5 rounded-lg">Current User</span>';
                }
            }
            
            return `
                <tr class="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors eco-card">
                    <td class="py-4 px-6 text-slate-400 font-mono text-xs">${idx + 1}</td>
                    <td class="py-4 px-6 text-slate-900 dark:text-white font-bold">${esc(s.name)}</td>
                    <td class="py-4 px-6 text-slate-500 font-mono text-xs">${esc(s.rollNumber)}</td>
                    ${currentUser.role === 'Admin' ? `<td class="py-4 px-6 text-slate-500 font-mono text-xs">${esc(s.phone) || '-'}</td>` : ''}
                    <td class="py-4 px-6 text-slate-500">${esc(s.email)}</td>
                    <td class="py-4 px-6"><span class="px-3 py-1.5 rounded-lg text-[10px] uppercase font-black tracking-wider ${s.role === 'Admin' ? 'bg-brand/10 text-brand' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-gray-400'}">${esc(s.role)}</span></td>
                    ${currentUser.role === 'Admin' ? `<td class="py-4 px-6 text-right">${actionBtns}</td>` : ''}
                </tr>
            `;
        }).join('');

        canvas.innerHTML = `
            ${offlineBanner}
            <div class="mb-10 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <h1 class="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Class Roster</h1>
                <div class="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
                    <input type="text" id="dir-search" placeholder="Search roster..." class="bg-white dark:bg-black/50 border border-slate-300 dark:border-borderDark rounded-xl px-5 py-3.5 text-sm outline-none focus:border-brand w-full md:w-72 text-slate-900 dark:text-white font-medium shadow-sm">
                    ${csvBtn}
                </div>
            </div>
            <div class="glass-card rounded-3xl overflow-hidden overflow-x-auto shadow-md">
                <table class="w-full text-left text-sm whitespace-nowrap">
                    <thead class="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-borderDark text-slate-500 dark:text-gray-400">
                        <tr>
                            <th class="py-5 px-6 font-bold uppercase tracking-widest text-[10px] w-16">S.No</th>
                            <th class="py-5 px-6 font-bold uppercase tracking-widest text-[10px]">Student Name</th>
                            <th class="py-5 px-6 font-bold uppercase tracking-widest text-[10px]">Roll Number</th>
                            ${currentUser.role === 'Admin' ? `<th class="py-5 px-6 font-bold uppercase tracking-widest text-[10px]">Phone</th>` : ''}
                            <th class="py-5 px-6 font-bold uppercase tracking-widest text-[10px]">Email ID</th>
                            <th class="py-5 px-6 font-bold uppercase tracking-widest text-[10px]">Privilege</th>
                            ${currentUser.role === 'Admin' ? `<th class="py-5 px-6 font-bold uppercase tracking-widest text-[10px] text-right">Actions</th>` : ''}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-200 dark:divide-borderDark text-slate-800 dark:text-white font-medium" id="dir-table">
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        `;
        document.getElementById('dir-search')?.addEventListener('input', (e) => { 
            const term = e.target.value.toLowerCase(); 
            document.querySelectorAll('.eco-card').forEach(row => { row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none'; }); 
        });
    }

    else if (currentMainView === 'profile') {
        document.getElementById('breadcrumb').innerHTML = '<span class="text-slate-900 dark:text-white font-black tracking-wide text-lg">Settings</span>';
        canvas.innerHTML = `
            ${offlineBanner}
            <div class="max-w-4xl mx-auto">
                <h1 class="text-4xl font-black text-slate-900 dark:text-white tracking-tight mb-10">Your Profile</h1>
                <div class="glass-card p-8 rounded-3xl mb-10 flex flex-col md:flex-row items-center gap-8 shadow-md">
                    <div class="w-28 h-28 rounded-2xl bg-gradient-to-tr from-slate-700 to-slate-900 flex items-center justify-center text-5xl font-black text-white shadow-inner shadow-black/50">${esc(currentUser.name).charAt(0)}</div>
                    <div class="text-center md:text-left">
                        <h2 class="text-3xl font-black text-slate-900 dark:text-white">${esc(currentUser.name)}</h2>
                        <p class="text-slate-500 font-mono text-base mt-2">${esc(currentUser.rollNumber)} ${currentUser.phone && currentUser.phone !== '-' ? `• ${esc(currentUser.phone)}` : ''}</p>
                        <span class="inline-block mt-4 px-4 py-2 rounded-xl text-xs uppercase font-black tracking-widest ${currentUser.role === 'Admin' ? 'bg-brand/10 text-brand border border-brand/20' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-gray-400 border border-slate-200 dark:border-borderDark'}">${esc(currentUser.role)} PRIVILEGES</span>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div class="glass-card p-8 rounded-3xl shadow-sm">
                        <h3 class="text-xl font-black text-slate-900 dark:text-white mb-2">Security Key</h3>
                        <p class="text-sm text-slate-500 mb-8 font-medium">Update your access password.</p>
                        <form id="change-pass-form" class="space-y-4 mt-6">
                            <div class="relative flex items-center">
                                <input type="password" id="new-profile-pass" placeholder="New Password" required class="w-full pl-5 pr-12 py-4 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand text-slate-900 dark:text-white font-medium shadow-sm">
                                <button type="button" onclick="togglePassword('new-profile-pass', 'eye-profile')" class="absolute right-4 text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 focus:outline-none">
                                    <svg id="eye-profile" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                                </button>
                            </div>
                            <button type="submit" id="save-pass-btn" class="bg-slate-900 dark:bg-white text-white dark:text-black font-bold py-4 px-6 rounded-xl hover:scale-[0.98] transition-transform w-full shadow-lg outline-none">Update Password</button>
                        </form>
                    </div>
                    <div class="glass-card p-8 rounded-3xl shadow-sm">
                        <h3 class="text-xl font-black text-slate-900 dark:text-white mb-2">Account Recovery</h3>
                        <p class="text-sm text-slate-500 mb-8 font-medium">Setup in case you forget your password.</p>
                        <form id="update-sec-form" class="space-y-4">
                            <input type="text" id="sec-q" placeholder="Custom Security Question" required class="w-full px-5 py-4 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand text-slate-900 dark:text-white font-medium shadow-sm">
                            <input type="text" id="sec-a" placeholder="Secret Answer" required class="w-full px-5 py-4 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand text-slate-900 dark:text-white font-medium shadow-sm">
                            <button type="submit" id="save-sec-btn" class="bg-brand text-white font-bold py-4 px-6 rounded-xl text-sm hover:bg-blue-600 hover:scale-[0.98] transition-transform w-full shadow-lg shadow-brand/30 outline-none">Save Recovery Info</button>
                        </form>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('change-pass-form')?.addEventListener('submit', async (e) => { 
            e.preventDefault(); 
            const res = await apiCall('changePassword', { rollNumber: currentUser.rollNumber, newPassword: document.getElementById('new-profile-pass').value }); 
            showToast(res.message, res.success ? 'success' : 'error'); 
        });
        document.getElementById('update-sec-form')?.addEventListener('submit', async (e) => {
            e.preventDefault(); 
            const res = await apiCall('updateSecurity', { rollNumber: currentUser.rollNumber, question: document.getElementById('sec-q').value, answer: document.getElementById('sec-a').value });
            showToast(res.message, res.success ? 'success' : 'error'); 
        });
    }

    else if (currentMainView === 'feedback') {
        document.getElementById('breadcrumb').innerHTML = '<span class="text-slate-900 dark:text-white font-black tracking-wide text-lg">Feedback Hub</span>';
        if (currentUser.role === 'Student') {
            canvas.innerHTML = `
                ${offlineBanner}
                <div class="max-w-3xl mx-auto">
                    <h1 class="text-4xl font-black text-slate-900 dark:text-white tracking-tight mb-2">Have an Idea?</h1>
                    <p class="text-slate-500 font-medium mb-10">Report bugs or request new features directly to the developer.</p>
                    <div class="glass-card p-8 rounded-3xl shadow-md border-t-4 border-brand">
                        <form id="submit-fb-form" class="space-y-6">
                            <textarea id="fb-message" placeholder="Describe your feature idea or report a bug here..." required class="w-full bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-borderDark rounded-2xl px-6 py-5 text-sm outline-none focus:border-brand text-slate-900 dark:text-white font-medium h-48 resize-none"></textarea>
                            <button type="submit" id="fbBtn" class="w-full bg-brand text-white font-bold py-4 rounded-xl hover:bg-blue-600 hover:scale-[0.98] transition-transform shadow-xl shadow-brand/30 outline-none">Submit to Admin</button>
                        </form>
                    </div>
                </div>
            `;
            document.getElementById('submit-fb-form')?.addEventListener('submit', async (e) => {
                e.preventDefault(); const btn = document.getElementById('fbBtn'); btn.innerText = 'Sending...'; btn.disabled = true;
                const res = await apiCall('submitFeedback', { name: currentUser.name, rollNumber: currentUser.rollNumber, message: document.getElementById('fb-message').value });
                if(res.success) { showToast('Feedback Sent!', 'success'); e.target.reset(); await forceSync(); } else { showToast('Failed to send', 'error'); }
                btn.innerText = 'Submit to Admin'; btn.disabled = false;
            });
        } else {
            const fbs = appData.feedbacks ? [...appData.feedbacks].reverse() : [];
            let fbHtml = fbs.length === 0 ? '<div class="col-span-full p-10 text-center text-slate-500 font-medium border border-dashed rounded-3xl border-slate-300 dark:border-borderDark">No feedback yet.</div>' : fbs.map((f, i) => `
                <div class="glass-card p-6 md:p-8 rounded-3xl flex flex-col justify-between shadow-sm transition-transform hover:-translate-y-1" style="animation: fadeInUp 0.5s ease-out forwards; animation-delay: ${i * 0.05}s">
                    <div>
                        <div class="flex justify-between items-start mb-4">
                            <div class="flex items-center gap-3"><div class="w-10 h-10 rounded-full bg-brand/10 text-brand font-black flex items-center justify-center">${esc(f.name).charAt(0)}</div><div><h4 class="text-sm font-bold text-slate-900 dark:text-white">${esc(f.name)}</h4><p class="text-[10px] text-slate-500 font-mono">${esc(f.rollNumber)}</p></div></div>
                            <span class="text-[10px] text-slate-400 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded">${new Date(f.timestamp).toLocaleDateString()}</span>
                        </div>
                        <p class="text-sm text-slate-700 dark:text-gray-300 leading-relaxed font-medium mb-6 whitespace-pre-wrap">${esc(f.message)}</p>
                    </div>
                    <button onclick="resolveFeedback('${jsEsc(f.timestamp)}', '${jsEsc(f.rollNumber)}')" class="text-xs font-bold text-green-600 bg-green-50 dark:bg-green-500/10 hover:bg-green-100 dark:hover:bg-green-500/20 py-2.5 rounded-xl transition-colors w-full outline-none">Mark Resolved</button>
                </div>
            `).join('');
            canvas.innerHTML = `${offlineBanner}<h1 class="text-4xl font-black text-slate-900 dark:text-white tracking-tight mb-10">Feedback Inbox <span class="text-lg bg-brand text-white px-3 py-1 rounded-full ml-2">${fbs.length}</span></h1><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">${fbHtml}</div>`;
        }
    }

    else if (currentMainView === 'admin' && currentUser.role === 'Admin') {
        document.getElementById('breadcrumb').innerHTML = '<span class="text-brand font-black tracking-wide text-lg">Admin Console</span>';
        const isOffline = appData.systemStatus === 'Offline';
        const pendingResets = appData.resets ? appData.resets.filter(r => r.status === 'Pending') : [];
        const today = new Date().toISOString().split('T')[0];
        const allLogs = appData.logs || [];
        const todayLogs = allLogs.filter(l => l.timestamp && l.timestamp.startsWith(today));
        const uniqueLoginsToday = new Set(todayLogs.map(l => l.rollNumber)).size;
        const recentActivity = [...allLogs].reverse().slice(0, 10); 
        
        let resetHtml = pendingResets.map(r => `
            <div class="flex justify-between items-center p-5 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-borderDark rounded-2xl shadow-sm">
                <span class="font-mono text-slate-900 dark:text-gray-300 font-bold">${esc(r.rollNumber)}</span>
                <button onclick="approveReset('${jsEsc(r.rollNumber)}')" class="text-xs bg-slate-900 dark:bg-white text-white dark:text-black px-6 py-2.5 rounded-lg font-bold hover:scale-[0.98] transition-transform shadow-md outline-none">Authorize</button>
            </div>
        `).join('');

        canvas.innerHTML = `
            ${offlineBanner}
            <div class="flex justify-between items-end mb-10"><h1 class="text-4xl font-black text-slate-900 dark:text-white tracking-tight">System Ops</h1></div>
            
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                <div class="glass-card p-6 md:p-8 rounded-3xl shadow-md border-t-4 border-t-brand">
                    <h3 class="text-sm font-black text-slate-500 uppercase tracking-widest mb-6">Login Telemetry (Past 24h)</h3>
                    <div class="relative h-64 w-full"><canvas id="loginChart"></canvas></div>
                </div>
                <div class="glass-card p-6 md:p-8 rounded-3xl shadow-md border-t-4 border-t-indigo-500">
                    <h3 class="text-sm font-black text-slate-500 uppercase tracking-widest mb-6">Class Attendance Ratio</h3>
                    <div class="relative h-64 w-full flex justify-center"><canvas id="attendanceChart"></canvas></div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                <div class="glass-card p-8 rounded-3xl lg:col-span-2 shadow-sm flex flex-col">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-xl font-black text-slate-900 dark:text-white">Live Activity Feed</h3>
                        <button onclick="openLogsModal()" class="text-xs bg-slate-900 dark:bg-white text-white dark:text-black px-4 py-2.5 rounded-xl font-bold shadow-md hover:scale-95 transition-transform outline-none">View & Flush Logs</button>
                    </div>
                    <div class="space-y-3 flex-1 overflow-hidden h-64 overflow-y-auto pr-2">
                        ${recentActivity.length > 0 ? recentActivity.map(l => `
                            <div class="flex justify-between items-center p-4 bg-slate-50 dark:bg-white/5 rounded-xl border border-transparent hover:border-slate-200 dark:hover:border-borderDark transition-colors">
                                <span class="text-sm text-slate-800 dark:text-gray-300 font-bold">${esc(l.name)} <span class="text-slate-400 font-mono font-medium text-xs">(${esc(l.rollNumber)})</span></span>
                                <span class="text-slate-500 font-mono text-[10px] bg-slate-200 dark:bg-black/50 px-2.5 py-1 rounded-md shadow-sm">${new Date(l.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
                        `).join('') : '<p class="text-sm text-slate-500 font-medium">No activity recorded yet.</p>'}
                    </div>
                </div>

                <div class="glass-card p-8 rounded-3xl border border-red-500/30 shadow-sm flex flex-col justify-center">
                    <h3 class="text-xl font-black text-red-600 dark:text-red-500 mb-2">Danger Zone</h3>
                    <p class="text-sm text-slate-600 dark:text-gray-400 mb-8 font-medium">Block student access globally.</p>
                    <button onclick="toggleSystemState('${isOffline ? 'Online' : 'Offline'}')" class="w-full ${isOffline ? 'bg-green-600 shadow-green-500/30' : 'bg-red-600 shadow-red-500/30'} shadow-lg hover:scale-[0.98] transition-transform text-white py-4 rounded-xl font-bold outline-none">${isOffline ? 'Reactivate System' : 'Shutdown System'}</button>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div class="glass-card p-8 rounded-3xl shadow-sm">
                    <h3 class="text-xl font-black text-slate-900 dark:text-white mb-6">Provision User</h3>
                    <form id="cms-student-form" class="space-y-4">
                        <input type="text" id="cms-stu-name" placeholder="Full Name" required class="w-full px-5 py-3.5 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand text-slate-900 dark:text-white font-medium shadow-sm">
                        <input type="text" id="cms-stu-roll" placeholder="Roll Number" required class="w-full px-5 py-3.5 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand uppercase text-slate-900 dark:text-white font-mono shadow-sm">
                        <input type="tel" id="cms-stu-phone" placeholder="Phone Number" class="w-full px-5 py-3.5 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand text-slate-900 dark:text-white font-medium shadow-sm">
                        <input type="email" id="cms-stu-email" placeholder="Email Address" required class="w-full px-5 py-3.5 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand text-slate-900 dark:text-white font-medium shadow-sm">
                        <select id="cms-stu-role" class="w-full px-5 py-3.5 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand text-slate-700 dark:text-white font-bold shadow-sm">
                            <option value="Student">Student Privilege</option>
                            <option value="Admin">Administrator Privilege</option>
                        </select>
                        <button type="submit" class="w-full bg-slate-900 dark:bg-white text-white dark:text-black py-4 rounded-xl font-bold hover:scale-[0.98] transition-transform shadow-lg mt-2 outline-none">Create Profile</button>
                    </form>
                </div>
                
                <div class="glass-card p-8 rounded-3xl shadow-sm">
                    <h3 class="text-xl font-black text-slate-900 dark:text-white mb-6 flex justify-between items-center">Security Alerts <span class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg text-xs tracking-widest uppercase">${pendingResets.length} Pending</span></h3>
                    <div class="space-y-3 max-h-64 overflow-y-auto pr-2">
                        ${pendingResets.length === 0 ? '<p class="text-sm text-slate-500 font-medium p-6 border border-dashed border-slate-300 dark:border-borderDark rounded-2xl text-center">No alerts.</p>' : resetHtml}
                    </div>
                </div>
            </div>
        `;
        setTimeout(renderAdminCharts, 100);

        document.getElementById('cms-student-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const role = document.getElementById('cms-stu-role').value; const roll = document.getElementById('cms-stu-roll').value.toUpperCase();
            const rowData = [document.getElementById('cms-stu-name').value, roll, document.getElementById('cms-stu-phone').value || '-', document.getElementById('cms-stu-email').value, roll, role, 'Not Set', 'Not Set'];
            showToast('Provisioning...', 'success');
            const res = await apiCall('addData', { role: currentUser.role, tabName: 'Users', rowData });
            if (res.success) { showToast('Account Active!'); await forceSync(); }
        });
    }
}

// --- ATTENDANCE TABS & FORCED QR CAMERA ---
function renderAttendanceTabs(tab) {
    document.getElementById('tab-btn-manual').className = tab === 'manual' ? 'px-6 py-2.5 rounded-full font-bold text-sm bg-brand text-white shadow-md transition-colors outline-none' : 'px-6 py-2.5 rounded-full font-bold text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors outline-none';
    document.getElementById('tab-btn-qr').className = tab === 'qr' ? 'px-6 py-2.5 rounded-full font-bold text-sm bg-indigo-600 text-white shadow-md transition-colors outline-none' : 'px-6 py-2.5 rounded-full font-bold text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors outline-none';
    
    const area = document.getElementById('attendance-content-area');
    if(qrScanner) { qrScanner.clear(); qrScanner = null; }
    if(qrGeneratorInterval) { clearInterval(qrGeneratorInterval); qrGeneratorInterval = null; }

    if(tab === 'manual') {
        const todayStr = new Date().toDateString();
        const todaysAtt = (appData.attendance || []).filter(a => new Date(a.date).toDateString() === todayStr);
        let adminControls = '';
        
        if (currentUser.role === 'Admin') {
            let optionsHtml = appData.students.map(s => {
                return `<label class="flex items-center gap-4 p-3 rounded-xl hover:bg-white dark:hover:bg-white/5 cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-borderDark transition-colors shadow-sm">
                            <input type="checkbox" class="att-checkbox w-5 h-5 accent-brand shrink-0" value="${jsEsc(s.rollNumber)}">
                            <div class="truncate">
                                <p class="text-sm font-bold text-slate-900 dark:text-white truncate">${esc(s.name)}</p>
                                <p class="text-[10px] text-slate-500 font-mono">${esc(s.rollNumber)}</p>
                            </div>
                        </label>`;
            }).join('');
            
            adminControls = `
                <div class="flex flex-col md:flex-row gap-4 mb-8">
                    <button onclick="document.getElementById('attendance-form').classList.toggle('hidden')" class="bg-slate-900 dark:bg-white text-white dark:text-black font-bold px-6 py-3.5 rounded-xl hover:scale-[0.98] transition-transform shadow-lg flex-1 md:flex-none outline-none">+ Record New Hour</button>
                    <button onclick="clearTodaysAttendance()" class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 font-bold px-6 py-3.5 rounded-xl hover:bg-red-500 hover:text-white transition-colors flex-1 md:flex-none outline-none">Clear Today's Logs</button>
                </div>
                <div id="attendance-form" class="glass-card p-6 md:p-8 rounded-3xl mb-10 hidden border-t-4 border-t-brand">
                    <h3 class="text-xl font-black text-slate-900 dark:text-white mb-6">Log Manual Attendance</h3>
                    <form id="save-att-form" class="space-y-6">
                        <input type="text" id="att-hour" placeholder="Session / Hour Name (e.g. Hour 1)" required class="w-full md:w-96 px-5 py-4 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand text-slate-900 dark:text-white font-bold">
                        <div class="bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-borderDark rounded-2xl p-4 max-h-96 overflow-y-auto">
                            <div class="flex justify-between items-center mb-4 px-2">
                                <span class="text-xs font-black text-slate-500 uppercase tracking-widest">Select Present Students</span>
                                <button type="button" onclick="document.querySelectorAll('.att-checkbox').forEach(c=>c.checked=true)" class="text-xs text-brand font-bold hover:underline outline-none">Select All</button>
                            </div>
                            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" id="att-student-list">${optionsHtml}</div>
                        </div>
                        <button type="submit" id="saveAttBtn" class="w-full bg-brand text-white font-bold py-4 rounded-xl hover:bg-blue-600 hover:scale-[0.98] transition-transform shadow-xl shadow-brand/30 outline-none">Submit & Generate Codes</button>
                    </form>
                </div>
            `;
        }

        let cardsHtml = todaysAtt.map(a => {
            let sHtml = '';
            if (currentUser.role === 'Student') {
                const presentArr = a.present ? a.present.split(',') : [];
                sHtml = presentArr.includes(currentUser.rollNumber) 
                    ? `<div class="mt-4 bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 font-black text-lg p-4 rounded-2xl text-center border border-green-200 dark:border-green-500/30">✓ PRESENT</div>` 
                    : `<div class="mt-4 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 font-black text-lg p-4 rounded-2xl text-center border border-red-200 dark:border-red-500/30">✕ ABSENT</div>`;
            }
            
            const safePresent = String(a.present || '');
            const safeAbsent = String(a.absent || '');
            
            let viewBtn = currentUser.role === 'Admin' ? `<button onclick="showAttOutput('${jsEsc(safePresent)}','${jsEsc(safeAbsent)}')" class="mt-auto w-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white py-3 rounded-xl text-sm font-bold transition-colors mt-6 shadow-sm outline-none">View Roll Codes</button>` : '';
            
            return `
                <div class="glass-card p-6 md:p-8 rounded-3xl flex flex-col">
                    <div class="flex justify-between items-start mb-6">
                        <h3 class="text-2xl font-black text-slate-900 dark:text-white">${esc(a.hour)}</h3>
                        <span class="text-[10px] text-slate-500 font-mono font-bold bg-slate-100 dark:bg-white/5 px-2.5 py-1 rounded-md border border-slate-200 dark:border-borderDark">${new Date(a.date).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                    </div>
                    <div class="flex gap-6 text-xs font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-2">
                        <span class="flex flex-col gap-1">Present <span class="text-2xl text-slate-900 dark:text-white">${a.present ? a.present.split(',').length : 0}</span></span>
                        <span class="flex flex-col gap-1">Absent <span class="text-2xl text-slate-900 dark:text-white">${a.absent ? a.absent.split(',').length : 0}</span></span>
                    </div>
                    ${sHtml}${viewBtn}
                </div>
            `;
        }).join('');
        
        area.innerHTML = `${adminControls}<h2 class="text-xl font-bold text-slate-900 dark:text-white mb-6">Today's Sessions</h2><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">${cardsHtml || '<div class="col-span-full p-10 text-center text-slate-500 font-medium border border-dashed border-slate-300 dark:border-borderDark rounded-3xl">No attendance logged yet for today.</div>'}</div>`;
        
        if(currentUser.role === 'Admin') {
            document.getElementById('save-att-form')?.addEventListener('submit', async (e) => {
                e.preventDefault(); const btn = document.getElementById('saveAttBtn'); btn.innerText = 'Processing...'; btn.disabled = true;
                const checkboxes = document.querySelectorAll('.att-checkbox'); const p = []; const a = [];
                checkboxes.forEach(c => { if(c.checked) p.push(c.value); else a.push(c.value); });
                const res = await apiCall('logAttendance', { role: currentUser.role, hour: document.getElementById('att-hour').value, present: p.join(','), absent: a.join(',') });
                if(res.success) { showToast('Logged!', 'success'); await forceSync(); showAttOutput(p.join(','), a.join(',')); } 
                else { showToast('Error', 'error'); btn.innerText = 'Submit & Generate Codes'; btn.disabled = false; }
            });
        }
    } 
    else if (tab === 'qr') {
        if (currentUser.role === 'Admin') {
            area.innerHTML = `
                <div class="glass-card p-8 rounded-3xl flex flex-col items-center text-center max-w-2xl mx-auto border-t-4 border-t-indigo-600 shadow-2xl">
                    <h3 class="text-2xl font-black text-slate-900 dark:text-white mb-2">Dynamic QR Projector</h3>
                    <p class="text-slate-500 font-medium mb-8">This code refreshes automatically. Students must scan to be marked Present.</p>
                    <input type="text" id="qr-session-name" placeholder="Session Name (e.g. Lab 1)" class="w-64 px-5 py-3.5 mb-6 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-borderDark rounded-xl text-center font-bold outline-none focus:border-indigo-500 text-slate-900 dark:text-white">
                    <div id="qr-wrapper" class="bg-white p-6 rounded-3xl shadow-inner border border-slate-200 mb-8 hidden">
                        <div id="qrcode"></div>
                    </div>
                    <button id="startQrBtn" onclick="startQRGenerator()" class="bg-indigo-600 text-white font-black px-10 py-4 rounded-xl shadow-lg shadow-indigo-600/30 hover:scale-[0.98] transition-transform outline-none">Start Projection</button>
                    <button id="stopQrBtn" onclick="switchMainView('attendance')" class="bg-red-500 text-white font-black px-10 py-4 rounded-xl shadow-lg hidden hover:scale-[0.98] transition-transform outline-none">Stop Session</button>
                </div>
            `;
        } else {
            area.innerHTML = `
                <div class="glass-card p-8 rounded-3xl flex flex-col items-center text-center max-w-xl mx-auto border-t-4 border-t-indigo-600 shadow-xl">
                    <h3 class="text-2xl font-black text-slate-900 dark:text-white mb-2">Scan to Register</h3>
                    <p class="text-slate-500 font-medium mb-8">Point your camera at the projector screen.</p>
                    <div id="qr-reader" class="w-full max-w-md bg-black rounded-2xl overflow-hidden shadow-inner border border-slate-200 mb-6"></div>
                    <button onclick="startStudentScanner()" class="bg-indigo-600 text-white font-black px-10 py-4 rounded-xl shadow-lg shadow-indigo-600/30 hover:scale-[0.98] transition-transform w-full outline-none">Open Camera</button>
                </div>
            `;
        }
    }
}

function startQRGenerator() {
    const session = document.getElementById('qr-session-name').value.trim();
    if(!session) { showToast('Enter a session name first.', 'error'); return; }
    document.getElementById('startQrBtn').classList.add('hidden');
    document.getElementById('qr-session-name').classList.add('hidden');
    document.getElementById('stopQrBtn').classList.remove('hidden');
    document.getElementById('qr-wrapper').classList.remove('hidden');
    
    const qrDiv = document.getElementById("qrcode");
    const qrcode = new QRCode(qrDiv, { width: 300, height: 300, colorDark : "#0f172a", colorLight : "#ffffff", correctLevel : QRCode.CorrectLevel.H });
    
    function updateQR() {
        qrcode.clear();
        const payload = JSON.stringify({ session: session, time: new Date().getTime(), secret: Math.random().toString(36).substring(7) });
        qrcode.makeCode(payload);
    }
    updateQR();
    qrGeneratorInterval = setInterval(updateQR, 15000); 
    showToast('Projection Live. Tell students to scan.', 'success');
}

async function startStudentScanner() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        stream.getTracks().forEach(track => track.stop());
    } catch (err) {
        showToast('Camera Permission Denied! Allow camera in browser settings.', 'error');
        return;
    }

    document.getElementById('qr-reader').innerHTML = ''; 
    qrScanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: {width: 250, height: 250}, aspectRatio: 1.0, rememberLastUsedCamera: true });
    
    qrScanner.render(async (decodedText) => {
        if(qrScanner) qrScanner.clear();
        showToast('Processing Scan...', 'success');
        const res = await apiCall('qrAttendance', { qrText: decodedText, rollNumber: currentUser.rollNumber });
        if(res && res.success) { showToast('Attendance Registered! ✅', 'success'); setTimeout(()=>switchMainView('dashboard'), 1500); }
        else { showToast(res ? res.message : 'Error scanning', 'error'); setTimeout(startStudentScanner, 3000); }
    }, (err) => {});
}

// --- ADMIN CHARTS ENGINE ---
function renderAdminCharts() {
    if(!document.getElementById('loginChart')) return;
    const themeColor = document.documentElement.classList.contains('dark') ? '#ffffff' : '#0f172a';
    const gridColor = document.documentElement.classList.contains('dark') ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

    const logs = appData.logs || [];
    const now = new Date(); const labels = []; const dataPoints = [];
    for(let i=23; i>=0; i--) {
        const d = new Date(now.getTime() - (i*60*60*1000));
        labels.push(`${d.getHours()}:00`);
        const count = logs.filter(l => { const lt = new Date(l.timestamp); return lt.getHours() === d.getHours() && lt.getDate() === d.getDate(); }).length;
        dataPoints.push(count);
    }

    if(activeCharts.login) activeCharts.login.destroy();
    activeCharts.login = new Chart(document.getElementById('loginChart'), {
        type: 'line',
        data: { labels: labels, datasets: [{ label: 'Logins', data: dataPoints, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderWidth: 3, tension: 0.4, fill: true, pointRadius: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: {display: false} }, scales: { x: { ticks: {maxTicksLimit: 6, color: themeColor}, grid: {display:false} }, y: { ticks: {color: themeColor, stepSize: 1}, grid: {color: gridColor} } } }
    });

    let totalPresent = 0; let totalAbsent = 0;
    (appData.attendance || []).forEach(a => { totalPresent += (a.present?a.present.split(',').length:0); totalAbsent += (a.absent?a.absent.split(',').length:0); });
    
    if(activeCharts.att) activeCharts.att.destroy();
    activeCharts.att = new Chart(document.getElementById('attendanceChart'), {
        type: 'doughnut',
        data: { labels: ['Present', 'Absent'], datasets: [{ data: [totalPresent, totalAbsent], backgroundColor: ['#10b981', '#ef4444'], borderWidth: 0, hoverOffset: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { position: 'bottom', labels: { color: themeColor, padding: 20, font: {family: 'Inter', weight: 'bold'} } } } }
    });
}

// --- MODALS & ACTIONS ---
function openModuleModal(type) { document.getElementById('mod-type').value = type; document.getElementById('mod-modal-title').innerText = type === 'Semester' ? 'Create Semester' : `Add Subject`; document.getElementById('module-modal').classList.remove('hidden'); setTimeout(() => document.getElementById('module-modal').classList.remove('opacity-0'), 10); }
function closeModuleModal() { document.getElementById('module-modal').classList.add('opacity-0'); setTimeout(() => document.getElementById('module-modal').classList.add('hidden'), 300); }
document.getElementById('add-module-form')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = document.getElementById('addModuleBtn'); btn.innerText = 'Deploying...'; btn.disabled = true;
    const type = document.getElementById('mod-type').value; const inputName = document.getElementById('mod-input-name').value;
    const rowData = type === 'Semester' ? [inputName, 'General'] : [workspacePath.semester, inputName];
    const res = await apiCall('addData', { role: currentUser.role, tabName: 'Modules', rowData });
    if (res && res.success) { showToast('Folder Live!', 'success'); closeModuleModal(); e.target.reset(); await forceSync(); } else { showToast('Failed', 'error'); }
    btn.innerText = 'Create Folder'; btn.disabled = false;
});

async function toggleSystemState(newState) { if(!confirm(`Turn the system ${newState}?`)) return; showToast(`Initiating...`, 'success'); const res = await apiCall('toggleSystemStatus', { role: currentUser.role, status: newState }); if (res && res.success) await forceSync(); }
async function deleteUser(rollNumber) { if (!confirm(`Permanently delete student ${rollNumber}?`)) return; showToast('Deleting user...', 'success'); const res = await apiCall('deleteData', { role: currentUser.role, tabName: 'Users', conditions: { 1: rollNumber } }); if (res && res.success) await forceSync(); }
async function toggleUserRole(rollNumber, currentRole) { const newRole = currentRole === 'Admin' ? 'Student' : 'Admin'; if (!confirm(`Change privilege to ${newRole}?`)) return; const res = await apiCall('updateRole', { role: currentUser.role, targetRoll: rollNumber, newRole: newRole }); if (res && res.success) await forceSync(); }
async function deleteModule(semester, subject) { if (!confirm(`WARNING: Deleting will permanently erase all contents inside. Continue?`)) return; const res = await apiCall('deleteModule', { role: currentUser.role, semester, subject }); if (res && res.success) await forceSync(); }
async function deleteRecord(tabName, dateStr, title) { if (!confirm(`Permanently delete this item?`)) return; const res = await apiCall('deleteData', { role: currentUser.role, tabName, conditions: { 1: title, 3: dateStr } }); if (res && res.success) await forceSync(); }
async function resolveFeedback(timestamp, roll) { if(!confirm('Mark this feedback as resolved and delete it?')) return; const res = await apiCall('deleteFeedback', { role: currentUser.role, timestamp, rollNumber: roll }); if(res && res.success) { showToast('Resolved!', 'success'); await forceSync(); switchMainView('feedback'); } }

// --- LOGS FLUSH LOGIC ---
function openLogsModal() {
    const container = document.getElementById('logs-container'); const logs = appData.logs ? [...appData.logs].reverse() : [];
    if (logs.length === 0) { container.innerHTML = '<div class="p-10 text-center text-slate-500 font-medium">No logs available.</div>'; } 
    else {
        let html = `<table class="w-full text-left text-sm whitespace-nowrap"><thead class="bg-slate-100 dark:bg-white/5 border-b border-slate-200 dark:border-borderDark text-slate-500 dark:text-gray-400 sticky top-0 z-10"><tr><th class="py-4 px-6 font-bold uppercase tracking-widest text-[10px]">Date & Time</th><th class="py-4 px-6 font-bold uppercase tracking-widest text-[10px]">User</th><th class="py-4 px-6 font-bold uppercase tracking-widest text-[10px]">Roll No</th><th class="py-4 px-6 font-bold uppercase tracking-widest text-[10px]">Role</th></tr></thead><tbody class="divide-y divide-slate-100 dark:divide-borderDark text-slate-800 dark:text-gray-200">`;
        logs.forEach(l => { html += `<tr class="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"><td class="py-3 px-6 font-mono text-xs">${new Date(l.timestamp).toLocaleString()}</td><td class="py-3 px-6 font-bold">${esc(l.name)}</td><td class="py-3 px-6 font-mono text-xs text-slate-500">${esc(l.rollNumber)}</td><td class="py-3 px-6"><span class="px-2.5 py-1 rounded-md text-[9px] uppercase font-black bg-slate-200 dark:bg-white/10">${esc(l.role)}</span></td></tr>`; });
        html += `</tbody></table>`; container.innerHTML = html;
    }
    document.getElementById('logs-modal').classList.remove('hidden'); setTimeout(() => document.getElementById('logs-modal').classList.remove('opacity-0'), 10);
}
function closeLogsModal() { document.getElementById('logs-modal').classList.add('opacity-0'); setTimeout(() => document.getElementById('logs-modal').classList.add('hidden'), 300); }
async function executeLogFlush() {
    const rangeSelect = document.getElementById('log-flush-range'); const val = rangeSelect.value;
    if (!confirm(`WARNING: Permanently delete logs?`)) return;
    const btn = document.getElementById('flushLogsBtn'); btn.innerText = 'Clearing...'; btn.disabled = true;
    const res = await apiCall('flushLogs', { role: currentUser.role, timeRange: val });
    if (res && res.success) { showToast(res.message, 'success'); await forceSync(); openLogsModal(); } 
    btn.innerText = 'Clear Data'; btn.disabled = false;
}

// Attendance Manual Output
async function clearTodaysAttendance() {
    if(!confirm("Clear all attendance logs recorded today?")) return;
    showToast('Clearing logs...', 'success');
    const res = await apiCall('clearAttendance', { role: currentUser.role });
    if(res && res.success) { showToast(res.message, 'success'); await forceSync(); } else { showToast('Failed to clear', 'error'); }
}
function showAttOutput(present, absent) {
    document.getElementById('att-present-text').value = present ? present.split(',').map(r => r.slice(-2)).join(', ') : 'None';
    document.getElementById('att-absent-text').value = absent ? absent.split(',').map(r => r.slice(-2)).join(', ') : 'None';
    document.getElementById('att-output-modal').classList.remove('hidden'); setTimeout(() => document.getElementById('att-output-modal').classList.remove('opacity-0'), 10);
}
function closeAttOutput() { document.getElementById('att-output-modal').classList.add('opacity-0'); setTimeout(() => document.getElementById('att-output-modal').classList.add('hidden'), 300); }
function copyToClip(elemId) { document.getElementById(elemId).select(); document.execCommand("copy"); showToast('Copied!', 'success'); }

// EDIT & CREATE RESOURCE LOGIC
document.getElementById('res-type')?.addEventListener('change', (e) => { document.getElementById('res-link').placeholder = e.target.value === 'Notes' ? "Paste URL Link" : "Paste Spreadsheet URL"; });
function openResourceModal(mode = 'create', type = 'Notes', title = '', link = '', date = '') { 
    document.getElementById('res-mode').value = mode;
    if(mode === 'edit') {
        document.getElementById('res-modal-title').innerText = `Edit Document`; document.getElementById('res-type').value = type; document.getElementById('res-type').disabled = true;
        document.getElementById('res-title').value = title; document.getElementById('res-link').value = link;
        document.getElementById('res-orig-type').value = type; document.getElementById('res-orig-title').value = title; document.getElementById('res-orig-date').value = date;
        document.getElementById('addResourceBtn').innerText = 'Save Changes';
    } else {
        document.getElementById('res-modal-title').innerText = `Publish Content`; document.getElementById('add-resource-form').reset(); document.getElementById('res-type').disabled = false; document.getElementById('addResourceBtn').innerText = 'Publish to Ecosystem';
    }
    document.getElementById('resource-modal').classList.remove('hidden'); setTimeout(() => document.getElementById('resource-modal').classList.remove('opacity-0'), 10); 
}
function closeModal() { document.getElementById('resource-modal').classList.add('opacity-0'); setTimeout(() => document.getElementById('resource-modal').classList.add('hidden'), 300); }

document.getElementById('add-resource-form')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = document.getElementById('addResourceBtn'); btn.innerText = 'Processing...'; btn.disabled = true;
    const isEdit = document.getElementById('res-mode').value === 'edit'; let res;
    if(isEdit) {
        const rowData = [workspacePath.semester, document.getElementById('res-title').value, workspacePath.subject, document.getElementById('res-orig-date').value, document.getElementById('res-link').value];
        res = await apiCall('editData', { role: currentUser.role, tabName: document.getElementById('res-orig-type').value, conditions: { 1: document.getElementById('res-orig-title').value, 3: document.getElementById('res-orig-date').value }, newData: rowData });
    } else {
        res = await apiCall('addData', { role: currentUser.role, tabName: document.getElementById('res-type').value, rowData: [workspacePath.semester, document.getElementById('res-title').value, workspacePath.subject, new Date().toISOString(), document.getElementById('res-link').value] });
    }
    if (res && res.success) { showToast('Saved Successfully!', 'success'); closeModal(); await forceSync(); } 
    btn.disabled = false;
});

// Announcements Logic
function openAnnModal(dateStr = null, title = null) { 
    const modal = document.getElementById('announcement-modal'); const form = document.getElementById('global-ann-form');
    if(dateStr && title) {
        const ann = appData.announcements.find(a => a.date === dateStr && a.title === title);
        document.getElementById('ann-modal-title').innerText = "Edit Notice"; document.getElementById('g-ann-mode').value = 'edit';
        document.getElementById('g-ann-original-date').value = ann.date; document.getElementById('g-ann-title').value = ann.title;
        document.getElementById('g-ann-priority').value = ann.priority || 'Normal';
        if(ann.validUntil) document.getElementById('g-ann-valid').value = new Date(ann.validUntil).toISOString().split('T')[0];
        document.getElementById('g-ann-desc').value = ann.description; document.getElementById('postAnnBtn').innerText = "Save Changes";
    } else {
        document.getElementById('ann-modal-title').innerText = "Global Notice"; document.getElementById('g-ann-mode').value = 'create'; form.reset(); document.getElementById('postAnnBtn').innerText = "Publish Notice";
    }
    modal.classList.remove('hidden'); setTimeout(() => modal.classList.remove('opacity-0'), 10); 
}
function closeAnnModal() { document.getElementById('announcement-modal').classList.add('opacity-0'); setTimeout(() => document.getElementById('announcement-modal').classList.add('hidden'), 300); }

document.getElementById('global-ann-form')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = document.getElementById('postAnnBtn'); btn.innerText = 'Processing...'; btn.disabled = true;
    const isEdit = document.getElementById('g-ann-mode').value === 'edit';
    const rowData = ['Global', document.getElementById('g-ann-title').value, 'Campus Notice', isEdit ? document.getElementById('g-ann-original-date').value : new Date().toISOString(), document.getElementById('g-ann-desc').value, document.getElementById('g-ann-priority').value, document.getElementById('g-ann-valid').value];
    
    if (document.getElementById('push-notify-check').checked && "Notification" in window && Notification.permission === "granted") {
        new Notification(`New Notice: ${document.getElementById('g-ann-title').value}`, { body: document.getElementById('g-ann-desc').value, icon: 'images/icon-192x192.png' });
    }

    let res;
    if (isEdit) res = await apiCall('editData', { role: currentUser.role, tabName: 'Announcements', conditions: { 1: document.getElementById('g-ann-title').defaultValue || document.getElementById('g-ann-title').value, 3: document.getElementById('g-ann-original-date').value }, newData: rowData });
    else res = await apiCall('addData', { role: currentUser.role, tabName: 'Announcements', rowData });
    if (res && res.success) { showToast('Success!', 'success'); closeAnnModal(); await forceSync(); } 
    btn.disabled = false;
});

async function approveReset(rollNumber) { showToast('Authorizing...', 'success'); const res = await apiCall('approveReset', { role: currentUser.role, rollNumber }); if (res && res.success) { showToast('Clearance Granted'); await forceSync(); } }

function exportCSV() {
    let csvContent = "data:text/csv;charset=utf-8,S.No,Student Name,Roll Number,Email ID\n";
    appData.students.forEach((s, idx) => { csvContent += `${idx + 1},${s.name},${s.rollNumber},${s.email}\n`; });
    const link = document.createElement("a"); link.setAttribute("href", encodeURI(csvContent)); link.setAttribute("download", "Class_Directory.csv"); document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

// BOOT
if (localStorage.getItem('session')) { currentUser = JSON.parse(localStorage.getItem('session')); initApp(); } 
else { document.getElementById('auth-layout').classList.remove('opacity-0'); }
