// --- GLOBAL STATE ---
let currentUser = null;
let appData = {};
let currentMainView = 'dashboard'; 
let workspacePath = { semester: null, subject: null };
let pinnedResources = JSON.parse(localStorage.getItem('pinnedResources')) || []; 

// --- UI & AUTH HELPERS ---
function toggleTheme() {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('-translate-x-full');
    document.getElementById('mobile-overlay').classList.toggle('hidden');
}

function switchAuthView(viewId) {
    ['login-view', 'forgot-view'].forEach(id => document.getElementById(id).classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');
}

// PASSWORD EYE ICON LOGIC FIX
function togglePassword(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
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
        pinnedResources.splice(existingIndex, 1);
        showToast('Removed from Quick Pins');
    } else {
        pinnedResources.push({ type, title, link, subject });
        showToast('Saved to Quick Pins', 'success');
    }
    localStorage.setItem('pinnedResources', JSON.stringify(pinnedResources));
    renderCanvas();
}

document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn'); const status = document.getElementById('login-status');
    btn.classList.add('hidden'); status.classList.remove('hidden');
    
    const res = await apiCall('login', { rollNumber: document.getElementById('rollNumber').value, password: document.getElementById('password').value });
    if (res && res.success) {
        currentUser = res.user; localStorage.setItem('session', JSON.stringify(currentUser));
        if (res.adminToken) localStorage.setItem('adminToken', res.adminToken);
        apiCall('logActivity', { rollNumber: currentUser.rollNumber, name: currentUser.name, role: currentUser.role });
        setTimeout(initApp, 300);
    } else {
        showToast(res ? res.message : 'Authentication failed', 'error'); btn.classList.remove('hidden'); status.classList.add('hidden');
    }
});

function resetForgotFlow() { document.getElementById('forgotFormStep1').classList.remove('hidden'); document.getElementById('forgotFormStep2').classList.add('hidden'); document.getElementById('resetRoll').value = ''; document.getElementById('resetAnswer').value = ''; switchAuthView('login-view'); }
document.getElementById('forgotFormStep1')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = document.getElementById('getQBtn'); btn.innerText = 'Searching...'; btn.disabled = true;
    const res = await apiCall('getSecurityQuestion', { rollNumber: document.getElementById('resetRoll').value });
    if (res && res.success) { document.getElementById('display-sec-q').innerText = res.question; document.getElementById('forgotFormStep1').classList.add('hidden'); document.getElementById('forgotFormStep2').classList.remove('hidden'); } 
    else { showToast(res.message, 'error'); }
    btn.innerText = 'Find Account'; btn.disabled = false;
});
document.getElementById('forgotFormStep2')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = document.getElementById('resetBtn'); btn.innerText = 'Requesting...'; btn.disabled = true;
    const res = await apiCall('requestReset', { rollNumber: document.getElementById('resetRoll').value, answer: document.getElementById('resetAnswer').value });
    showToast(res.message, res.success ? 'success' : 'error'); btn.innerText = 'Request Reset'; btn.disabled = false; if(res.success) resetForgotFlow();
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
    
    forceSync();
}

async function forceSync() {
    const icon = document.getElementById('sync-icon'); if(icon) icon.classList.add('animate-spin');
    const res = await apiCall('fetchData');
    if (res && res.success) { 
        appData = res; 
        const validLinks = [...(appData.notes || []), ...(appData.excels || [])].map(x => x.link);
        const originalPinCount = pinnedResources.length;
        pinnedResources = pinnedResources.filter(p => validLinks.includes(p.link));
        if(pinnedResources.length !== originalPinCount) localStorage.setItem('pinnedResources', JSON.stringify(pinnedResources));
        localStorage.setItem('appCache', JSON.stringify(res)); 
        checkSystemStatus();
    }
    if(icon) icon.classList.remove('animate-spin');
}

function checkSystemStatus() {
    const isOffline = appData.systemStatus === 'Offline';
    if (isOffline && currentUser.role === 'Student') document.getElementById('shutdown-screen').classList.remove('hidden');
    else { document.getElementById('shutdown-screen').classList.add('hidden'); renderCanvas(); }
}

function switchMainView(view) {
    currentMainView = view; workspacePath = { semester: null, subject: null }; 
    if(window.innerWidth < 768) toggleSidebar();
    document.querySelectorAll('.nav-btn').forEach(btn => { btn.classList.remove('active', 'bg-slate-100', 'dark:bg-white/10', 'text-slate-900', 'dark:text-white'); btn.classList.add('text-slate-500', 'dark:text-gray-400'); });
    const activeBtn = event.currentTarget || document.querySelector(`[onclick="switchMainView('${view}')"]`); if(activeBtn) { activeBtn.classList.remove('text-slate-500', 'dark:text-gray-400'); activeBtn.classList.add('bg-slate-100', 'dark:bg-white/10', 'text-slate-900', 'dark:text-white'); } 
    renderCanvas();
}

// --- RENDER ENGINE ---
function renderCanvas() {
    const canvas = document.getElementById('workspace-canvas');
    if (!appData.students) return;

    const themeBtn = `<button onclick="toggleTheme()" class="text-xs text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-borderDark bg-white dark:bg-white/5 transition-colors mr-2">🌓 Theme</button>`;
    document.getElementById('breadcrumb').parentElement.nextElementSibling.innerHTML = themeBtn + `<button onclick="forceSync()" class="text-xs text-slate-600 dark:text-gray-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-borderDark bg-white dark:bg-white/5 transition-colors"><svg id="sync-icon" class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Sync</button><button onclick="logout()" title="Secure Logout" class="text-slate-500 hover:text-red-500 p-1.5 bg-white dark:bg-white/5 rounded-lg border border-slate-300 dark:border-borderDark transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg></button>`;

    const offlineBanner = (appData.systemStatus === 'Offline' && currentUser.role === 'Admin') 
        ? `<div class="bg-red-500/20 border border-red-500/50 text-red-500 p-3 rounded-xl mb-6 text-sm font-bold flex items-center justify-center gap-2 animate-pulse">SYSTEM IS CURRENTLY OFFLINE TO STUDENTS</div>` : '';

    const validNotes = appData.notes ? appData.notes.filter(n => n.title && String(n.title).trim() !== '') : [];
    const validExcels = appData.excels ? appData.excels.filter(e => e.title && String(e.title).trim() !== '') : [];
    const totalResources = validNotes.length + validExcels.length;

    // 1. DASHBOARD
    if (currentMainView === 'dashboard') {
        document.getElementById('breadcrumb').innerHTML = '<span class="text-slate-900 dark:text-white font-bold">Overview</span>';
        const allAnns = appData.announcements ? appData.announcements.filter(a => { if(!a.title) return false; if(a.validUntil && new Date(a.validUntil).setHours(23,59,59,999) < new Date().getTime()) return false; return true; }).slice().reverse() : [];
        let addAnnBtn = currentUser.role === 'Admin' ? `<button onclick="openAnnModal()" class="ml-auto bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-900 dark:text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors active:scale-95 flex items-center gap-2">+ Notice</button>` : '';

        const firstName = currentUser.name.split(' ')[0];
        const welcomeHeader = `<div class="mb-10"><h1 class="text-4xl md:text-5xl font-black text-slate-900 dark:text-white tracking-tight mb-2">Welcome back, <span class="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-purple-500">${firstName}</span> 👋</h1><p class="text-slate-500 font-medium text-sm md:text-base">Here is your academic overview for today.</p></div>`;

        let pinsHtml = '';
        if (pinnedResources.length > 0) {
            let pinsList = pinnedResources.map(p => {
                const iconPath = p.type === 'Note' ? 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' : 'M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z';
                const colorClass = p.type === 'Note' ? 'text-brand' : 'text-green-500';
                const safeTitle = p.title.replace(/'/g, "\\'");
                return `
                    <div class="glass-card p-4 rounded-2xl flex items-center justify-between group hover:border-brand/50 transition-colors cursor-pointer" onclick="window.open('${p.link}', '_blank')">
                        <div class="flex items-center gap-4 truncate">
                            <div class="w-12 h-12 rounded-xl bg-slate-100 dark:bg-white/5 flex items-center justify-center ${colorClass} shrink-0 shadow-sm">
                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${iconPath}"></path></svg>
                            </div>
                            <div class="truncate">
                                <h4 class="text-sm font-bold text-slate-900 dark:text-white truncate">${p.title}</h4>
                                <p class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-0.5">${p.subject}</p>
                            </div>
                        </div>
                        <button onclick="event.stopPropagation(); togglePin('${p.type}', '${safeTitle}', '${p.link}', '${p.subject}')" class="text-yellow-400 hover:scale-110 transition-transform text-2xl drop-shadow-md ml-2" title="Unpin">★</button>
                    </div>
                `;
            }).join('');
            
            pinsHtml = `
            <div class="mb-12">
                <h2 class="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2 mb-4">⭐ Quick Pins</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${pinsList}
                </div>
            </div>`;
        }

        canvas.innerHTML = offlineBanner + welcomeHeader + `
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-12">
                <div class="glass-card p-6 md:p-8 rounded-3xl flex flex-col justify-center items-start"><h3 class="text-xs font-bold text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-2">Total Students</h3><p class="text-5xl font-black text-slate-900 dark:text-white tracking-tight drop-shadow-sm">${appData.students.length}</p></div>
                <div class="glass-card p-6 md:p-8 rounded-3xl flex flex-col justify-center items-start"><h3 class="text-xs font-bold text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-2">Total Resources</h3><p class="text-5xl font-black text-slate-900 dark:text-white tracking-tight drop-shadow-sm">${totalResources}</p></div>
                <div class="glass-card p-6 md:p-8 rounded-3xl flex flex-col justify-center items-start"><h3 class="text-xs font-bold text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-2">System Status</h3><p class="text-3xl font-black ${appData.systemStatus === 'Offline' ? 'text-red-500' : 'text-green-500'} mt-1 flex items-center gap-3 drop-shadow-sm"><span class="w-3.5 h-3.5 rounded-full bg-current shadow-[0_0_15px_currentColor] animate-pulse"></span> ${appData.systemStatus === 'Offline' ? 'Offline' : 'Online'}</p></div>
            </div>
            ${pinsHtml}
            <div class="flex flex-col md:flex-row md:justify-between md:items-center mb-6 w-full gap-4">
                <h2 class="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">Notice Board</h2>
                ${addAnnBtn}
            </div>
            <div class="space-y-4">
                ${allAnns.length > 0 ? allAnns.map(a => {
                    let prioColor = 'border-brand text-brand'; let prioBg = 'bg-brand/10';
                    if(a.priority === 'High') { prioColor = 'border-red-500 text-red-600 dark:text-red-400'; prioBg = 'bg-red-500/10'; }
                    if(a.priority === 'Low') { prioColor = 'border-slate-400 text-slate-600 dark:text-gray-400'; prioBg = 'bg-slate-200 dark:bg-white/5'; }
                    const expText = a.validUntil ? `<span class="text-[10px] bg-slate-100 dark:bg-black/50 px-2.5 py-1 rounded-md text-slate-500 font-bold border border-slate-200 dark:border-borderDark">Ends: ${new Date(a.validUntil).toLocaleDateString()}</span>` : '';
                    
                    const safeTitle = a.title.replace(/'/g, "\\'");
                    let editBtns = '';
                    if (currentUser.role === 'Admin') {
                        editBtns = `
                            <button onclick="openAnnModal('${a.date}', '${safeTitle}')" class="text-brand hover:bg-brand/10 p-2 rounded-xl transition-colors" title="Edit"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>
                            <button onclick="deleteRecord('Announcements', '${a.date}', '${safeTitle}')" class="text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 p-2 rounded-xl transition-colors" title="Delete"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                        `;
                    }

                    return `
                    <div class="glass-card p-6 md:p-8 rounded-3xl border-l-8 ${prioColor}">
                        <div class="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-3">
                            <div>
                                <div class="flex flex-wrap items-center gap-2 mb-3">
                                    <span class="text-[10px] uppercase tracking-widest font-black ${prioColor} ${prioBg} px-2.5 py-1 rounded-md">${a.priority || 'Normal'}</span>
                                    <span class="text-[10px] uppercase tracking-widest font-bold text-slate-500 bg-slate-100 dark:bg-white/5 px-2.5 py-1 rounded-md border border-slate-200 dark:border-borderDark shadow-sm">${a.semester} • ${a.subject}</span>
                                </div>
                                <h3 class="text-xl font-bold text-slate-900 dark:text-white">${a.title}</h3>
                            </div>
                            <div class="flex flex-row md:flex-col items-center md:items-end justify-between w-full md:w-auto gap-2">
                                <div class="flex gap-2">${editBtns}</div>
                                <div class="flex flex-col items-end gap-1 text-right">
                                    <span class="text-[10px] text-slate-400 font-mono font-bold">${new Date(a.date).toLocaleDateString()}</span>
                                    ${expText}
                                </div>
                            </div>
                        </div>
                        <p class="text-sm text-slate-700 dark:text-gray-300 leading-relaxed">${a.description}</p>
                    </div>
                `}).join('') : '<div class="glass-card p-10 rounded-3xl text-center text-slate-500 font-medium">No active announcements. You\'re all caught up!</div>'}
            </div>
        `;
    }

    // 2. ATTENDANCE MODULE
    else if (currentMainView === 'attendance') {
        document.getElementById('breadcrumb').innerHTML = '<span class="text-slate-900 dark:text-white font-black tracking-wide text-lg">Attendance</span>';
        const todayStr = new Date().toDateString();
        const todaysAtt = (appData.attendance || []).filter(a => new Date(a.date).toDateString() === todayStr);
        
        let adminControls = '';
        if (currentUser.role === 'Admin') {
            let optionsHtml = appData.students.map(s => {
                return `<label class="flex items-center gap-4 p-3 rounded-xl hover:bg-white dark:hover:bg-white/5 cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-borderDark transition-colors shadow-sm">
                            <input type="checkbox" class="att-checkbox w-5 h-5 accent-brand shrink-0" value="${s.rollNumber}">
                            <div class="truncate">
                                <p class="text-sm font-bold text-slate-900 dark:text-white truncate">${s.name}</p>
                                <p class="text-[10px] text-slate-500 font-mono">${s.rollNumber}</p>
                            </div>
                        </label>`;
            }).join('');

            adminControls = `
                <div class="flex flex-col md:flex-row gap-4 mb-8">
                    <button onclick="document.getElementById('attendance-form').classList.toggle('hidden')" class="bg-slate-900 dark:bg-white text-white dark:text-black font-bold px-6 py-3.5 rounded-xl hover:scale-[0.98] transition-transform shadow-lg flex-1 md:flex-none">+ Record New Hour</button>
                    <button onclick="clearTodaysAttendance()" class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 font-bold px-6 py-3.5 rounded-xl hover:bg-red-500 hover:text-white transition-colors flex-1 md:flex-none">Clear Today's Logs</button>
                </div>
                
                <div id="attendance-form" class="glass-card p-6 md:p-8 rounded-3xl mb-10 hidden border-t-4 border-t-brand">
                    <h3 class="text-xl font-black text-slate-900 dark:text-white mb-6">Log New Attendance</h3>
                    <form id="save-att-form" class="space-y-6">
                        <input type="text" id="att-hour" placeholder="Session / Hour Name (e.g. Hour 1)" required class="w-full md:w-96 px-5 py-4 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand text-slate-900 dark:text-white font-bold">
                        
                        <div class="bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-borderDark rounded-2xl p-4 max-h-96 overflow-y-auto">
                            <div class="flex justify-between items-center mb-4 px-2">
                                <span class="text-xs font-black text-slate-500 uppercase tracking-widest">Select Present Students</span>
                                <button type="button" onclick="document.querySelectorAll('.att-checkbox').forEach(c=>c.checked=true)" class="text-xs text-brand font-bold hover:underline">Select All</button>
                            </div>
                            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" id="att-student-list">
                                ${optionsHtml}
                            </div>
                        </div>
                        <button type="submit" id="saveAttBtn" class="w-full bg-brand text-white font-bold py-4 rounded-xl hover:bg-blue-600 hover:scale-[0.98] transition-transform shadow-xl shadow-brand/30">Submit & Generate Codes</button>
                    </form>
                </div>
            `;
        }

        let loggedHtml = '<div class="text-center p-10 text-slate-500 font-medium border border-dashed border-slate-300 dark:border-gray-700 rounded-3xl">No attendance logged yet for today.</div>';
        if (todaysAtt.length > 0) {
            let cardsHtml = todaysAtt.map(a => {
                let studentStatusHtml = '';
                if (currentUser.role === 'Student') {
                    const presentArr = a.present ? a.present.split(',') : [];
                    const isPresent = presentArr.includes(currentUser.rollNumber);
                    studentStatusHtml = isPresent 
                        ? `<div class="mt-4 bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 font-black text-lg p-4 rounded-2xl text-center border border-green-200 dark:border-green-500/30">✓ PRESENT</div>`
                        : `<div class="mt-4 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 font-black text-lg p-4 rounded-2xl text-center border border-red-200 dark:border-red-500/30">✕ ABSENT</div>`;
                }

                let viewBtn = currentUser.role === 'Admin' ? `<button onclick="showAttOutput('${a.present}','${a.absent}')" class="mt-auto w-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white py-3 rounded-xl text-sm font-bold transition-colors mt-6 shadow-sm">View Roll Codes</button>` : '';

                return `
                    <div class="glass-card p-6 md:p-8 rounded-3xl flex flex-col">
                        <div class="flex justify-between items-start mb-6">
                            <h3 class="text-2xl font-black text-slate-900 dark:text-white">${a.hour}</h3>
                            <span class="text-[10px] text-slate-500 font-mono font-bold bg-slate-100 dark:bg-white/5 px-2.5 py-1 rounded-md border border-slate-200 dark:border-borderDark">${new Date(a.date).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                        </div>
                        <div class="flex gap-6 text-xs font-black text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-2">
                            <span class="flex flex-col gap-1">Present <span class="text-2xl text-slate-900 dark:text-white">${a.present ? a.present.split(',').length : 0}</span></span>
                            <span class="flex flex-col gap-1">Absent <span class="text-2xl text-slate-900 dark:text-white">${a.absent ? a.absent.split(',').length : 0}</span></span>
                        </div>
                        ${studentStatusHtml}
                        ${viewBtn}
                    </div>
                `;
            }).join('');
            loggedHtml = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">${cardsHtml}</div>`;
        }

        canvas.innerHTML = offlineBanner + `
            <div class="mb-10">
                <h1 class="text-4xl font-black text-slate-900 dark:text-white tracking-tight mb-2">Daily Attendance</h1>
                <p class="text-slate-500 font-medium">${new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            ${adminControls}
            <h2 class="text-xl font-bold text-slate-900 dark:text-white mb-6">Today's Sessions</h2>
            ${loggedHtml}

            <div id="att-output-modal" class="modal-overlay fixed inset-0 z-[100] hidden opacity-0 flex items-center justify-center p-4">
                <div class="modal-content w-full max-w-2xl glass-card rounded-3xl p-6 md:p-8 relative shadow-2xl flex flex-col max-h-[90vh]">
                    <button onclick="closeAttOutput()" class="absolute top-6 right-6 text-slate-500 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-white/5 rounded-full p-2 transition-colors">✕</button>
                    <h2 class="text-2xl font-black text-slate-900 dark:text-white mb-6">Attendance Codes</h2>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto">
                        <div>
                            <h3 class="text-xs font-black text-green-600 dark:text-green-400 uppercase tracking-widest mb-3 flex justify-between items-center">Present <button onclick="copyToClip('att-present-text')" class="text-[10px] bg-slate-200 dark:bg-white/10 px-3 py-1.5 rounded-lg text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-white/20 transition-colors">Copy</button></h3>
                            <textarea id="att-present-text" readonly class="w-full h-48 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-borderDark rounded-xl p-4 text-sm font-mono text-slate-800 dark:text-gray-300 resize-none focus:outline-none"></textarea>
                        </div>
                        <div>
                            <h3 class="text-xs font-black text-red-600 dark:text-red-400 uppercase tracking-widest mb-3 flex justify-between items-center">Absent <button onclick="copyToClip('att-absent-text')" class="text-[10px] bg-slate-200 dark:bg-white/10 px-3 py-1.5 rounded-lg text-slate-900 dark:text-white hover:bg-slate-300 dark:hover:bg-white/20 transition-colors">Copy</button></h3>
                            <textarea id="att-absent-text" readonly class="w-full h-48 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-borderDark rounded-xl p-4 text-sm font-mono text-slate-800 dark:text-gray-300 resize-none focus:outline-none"></textarea>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (currentUser.role === 'Admin') {
            document.getElementById('save-att-form')?.addEventListener('submit', async (e) => {
                e.preventDefault(); const btn = document.getElementById('saveAttBtn'); btn.innerText = 'Processing...'; btn.disabled = true;
                const checkboxes = document.querySelectorAll('.att-checkbox');
                const presentArr = []; const absentArr = [];
                checkboxes.forEach(c => { if(c.checked) presentArr.push(c.value); else absentArr.push(c.value); });
                const hourName = document.getElementById('att-hour').value;
                const res = await apiCall('logAttendance', { role: currentUser.role, hour: hourName, present: presentArr.join(','), absent: absentArr.join(',') });
                if(res.success) { showToast('Attendance Logged!', 'success'); await forceSync(); showAttOutput(presentArr.join(','), absentArr.join(',')); } 
                else { showToast('Failed to log', 'error'); btn.innerText = 'Submit & Generate Codes'; btn.disabled = false; }
            });
        }
    }

    // 3. DIRECTORY
    else if (currentMainView === 'directory') {
        document.getElementById('breadcrumb').innerHTML = '<span class="text-slate-900 dark:text-white font-black tracking-wide text-lg">Directory</span>';
        let csvBtn = currentUser.role === 'Admin' ? `<button onclick="exportCSV()" class="bg-green-600/10 text-green-700 dark:text-green-400 hover:bg-green-600 hover:text-white px-5 py-3.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors border border-green-500/20 shadow-sm"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg> Export CSV</button>` : '';

        let tableRows = appData.students.map((s, idx) => {
            let actionBtns = '';
            if (currentUser.role === 'Admin') {
                if (s.rollNumber !== currentUser.rollNumber) {
                    actionBtns = `
                        <button onclick="toggleUserRole('${s.rollNumber}', '${s.role}')" class="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-brand hover:text-white border border-slate-200 dark:border-borderDark transition-colors mr-2">Toggle Role</button>
                        <button onclick="deleteUser('${s.rollNumber}')" class="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500 hover:text-white border border-red-500/20 transition-colors">Delete</button>
                    `;
                } else {
                    actionBtns = '<span class="text-xs text-slate-400 font-bold bg-slate-100 dark:bg-white/5 px-3 py-1.5 rounded-lg">Current User</span>';
                }
            }
            
            return `
                <tr class="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors eco-card">
                    <td class="py-4 px-6 text-slate-400 font-mono text-xs">${idx + 1}</td>
                    <td class="py-4 px-6 text-slate-900 dark:text-white font-bold">${s.name}</td>
                    <td class="py-4 px-6 text-slate-500 font-mono text-xs">${s.rollNumber}</td>
                    ${currentUser.role === 'Admin' ? `<td class="py-4 px-6 text-slate-500 font-mono text-xs">${s.phone || '-'}</td>` : ''}
                    <td class="py-4 px-6 text-slate-500">${s.email}</td>
                    <td class="py-4 px-6"><span class="px-3 py-1.5 rounded-lg text-[10px] uppercase font-black tracking-wider ${s.role === 'Admin' ? 'bg-brand/10 text-brand border border-brand/20' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-gray-400 border border-slate-200 dark:border-borderDark'}">${s.role}</span></td>
                    ${currentUser.role === 'Admin' ? `<td class="py-4 px-6 text-right">${actionBtns}</td>` : ''}
                </tr>
            `;
        }).join('');

        canvas.innerHTML = offlineBanner + `
            <div class="mb-10 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <h1 class="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Class Roster</h1>
                <div class="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
                    <input type="text" id="dir-search" placeholder="Search by name or roll..." class="bg-white dark:bg-black/50 border border-slate-300 dark:border-borderDark rounded-xl px-5 py-3.5 text-sm outline-none focus:border-brand w-full md:w-72 text-slate-900 dark:text-white font-medium shadow-sm">
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
                    <tbody id="dir-table" class="divide-y divide-slate-200 dark:divide-borderDark text-slate-800 dark:text-white font-medium">
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

    // 4. PROFILE
    else if (currentMainView === 'profile') {
        document.getElementById('breadcrumb').innerHTML = '<span class="text-slate-900 dark:text-white font-black tracking-wide text-lg">Settings</span>';
        canvas.innerHTML = offlineBanner + `
            <div class="max-w-4xl mx-auto">
                <h1 class="text-4xl font-black text-slate-900 dark:text-white tracking-tight mb-10">Your Profile</h1>
                <div class="glass-card p-8 rounded-3xl mb-10 flex flex-col md:flex-row items-center gap-8 shadow-md">
                    <div class="w-28 h-28 rounded-2xl bg-gradient-to-tr from-slate-700 to-slate-900 flex items-center justify-center text-5xl font-black text-white shadow-inner shadow-black/50">${currentUser.name.charAt(0)}</div>
                    <div class="text-center md:text-left">
                        <h2 class="text-3xl font-black text-slate-900 dark:text-white">${currentUser.name}</h2>
                        <p class="text-slate-500 font-mono text-base mt-2">${currentUser.rollNumber} ${currentUser.phone && currentUser.phone !== '-' ? `• ${currentUser.phone}` : ''}</p>
                        <span class="inline-block mt-4 px-4 py-2 rounded-xl text-xs uppercase font-black tracking-widest ${currentUser.role === 'Admin' ? 'bg-brand/10 text-brand border border-brand/20' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-gray-400 border border-slate-200 dark:border-borderDark'}">${currentUser.role} PRIVILEGES</span>
                    </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div class="glass-card p-8 rounded-3xl shadow-sm">
                        <h3 class="text-xl font-black text-slate-900 dark:text-white mb-2">Security Key</h3>
                        <p class="text-sm text-slate-500 mb-8 font-medium">Update your access password.</p>
                        <form id="change-pass-form" class="space-y-4">
                            <div class="relative flex items-center">
                                <input type="password" id="new-profile-pass" placeholder="New Password" required class="w-full pl-5 pr-12 py-4 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand text-slate-900 dark:text-white font-medium shadow-sm">
                                <button type="button" onclick="togglePassword('new-profile-pass', 'eye-profile')" class="absolute right-4 text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 focus:outline-none">
                                    <svg id="eye-profile" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                                    </svg>
                                </button>
                            </div>
                            <button type="submit" id="save-pass-btn" class="bg-slate-900 dark:bg-white text-white dark:text-black font-bold py-4 px-6 rounded-xl text-sm hover:scale-[0.98] transition-transform w-full shadow-lg">Update Password</button>
                        </form>
                    </div>
                    <div class="glass-card p-8 rounded-3xl shadow-sm">
                        <h3 class="text-xl font-black text-slate-900 dark:text-white mb-2">Account Recovery</h3>
                        <p class="text-sm text-slate-500 mb-8 font-medium">Setup in case you forget your password.</p>
                        <form id="update-sec-form" class="space-y-4">
                            <input type="text" id="sec-q" placeholder="Custom Security Question" required class="w-full px-5 py-4 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand text-slate-900 dark:text-white font-medium shadow-sm">
                            <input type="text" id="sec-a" placeholder="Secret Answer" required class="w-full px-5 py-4 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand text-slate-900 dark:text-white font-medium shadow-sm">
                            <button type="submit" id="save-sec-btn" class="bg-brand text-white font-bold py-4 px-6 rounded-xl text-sm hover:bg-blue-600 hover:scale-[0.98] transition-transform w-full shadow-lg shadow-brand/30">Save Recovery Info</button>
                        </form>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('change-pass-form')?.addEventListener('submit', async (e) => {
            e.preventDefault(); const btn = document.getElementById('save-pass-btn'); btn.innerText = 'Encrypting...'; btn.disabled = true;
            const res = await apiCall('changePassword', { rollNumber: currentUser.rollNumber, newPassword: document.getElementById('new-profile-pass').value });
            if(res && res.success) { showToast('Password updated!', 'success'); e.target.reset(); } else { showToast('Update failed', 'error'); }
            btn.innerText = 'Update Password'; btn.disabled = false;
        });

        document.getElementById('update-sec-form')?.addEventListener('submit', async (e) => {
            e.preventDefault(); const btn = document.getElementById('save-sec-btn'); btn.innerText = 'Saving...'; btn.disabled = true;
            const res = await apiCall('updateSecurity', { rollNumber: currentUser.rollNumber, question: document.getElementById('sec-q').value, answer: document.getElementById('sec-a').value });
            if(res && res.success) { showToast('Recovery info saved!', 'success'); e.target.reset(); } else { showToast('Update failed', 'error'); }
            btn.innerText = 'Save Recovery Info'; btn.disabled = false;
        });
    }

    // 5. ADMIN CMS PANEL
    else if (currentMainView === 'admin' && currentUser.role === 'Admin') {
        document.getElementById('breadcrumb').innerHTML = '<span class="text-brand font-black tracking-wide text-lg">Admin Console</span>';
        
        const pendingResets = appData.resets ? appData.resets.filter(r => r.status === 'Pending') : [];
        const isOffline = appData.systemStatus === 'Offline';
        const today = new Date().toISOString().split('T')[0];
        const allLogs = appData.logs || [];
        const todayLogs = allLogs.filter(l => l.timestamp && l.timestamp.startsWith(today));
        const uniqueLoginsToday = new Set(todayLogs.map(l => l.rollNumber)).size;
        const recentActivity = [...allLogs].reverse().slice(0, 5); 

        let activityHtml = recentActivity.map(l => `
            <div class="flex justify-between items-center text-sm">
                <span class="text-slate-800 dark:text-gray-300 font-bold">${l.name} <span class="text-slate-400 font-mono font-medium text-xs">(${l.rollNumber})</span> logged in</span>
                <span class="text-slate-500 font-mono text-xs bg-slate-200 dark:bg-white/5 px-2.5 py-1 rounded-md border border-slate-300 dark:border-borderDark">${new Date(l.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
        `).join('');

        let resetHtml = pendingResets.map(r => `
            <div class="flex justify-between items-center p-5 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-borderDark rounded-2xl shadow-sm"><span class="font-mono text-slate-900 dark:text-gray-300 font-bold">${r.rollNumber}</span><button onclick="approveReset('${r.rollNumber}')" class="text-xs bg-slate-900 dark:bg-white text-white dark:text-black px-6 py-2.5 rounded-lg font-bold hover:scale-[0.98] transition-transform shadow-md">Authorize</button></div>
        `).join('');

        canvas.innerHTML = offlineBanner + `
            <h1 class="text-4xl font-black text-slate-900 dark:text-white tracking-tight mb-10">System Ops</h1>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div class="glass-card p-8 rounded-3xl col-span-1 lg:col-span-2 border-t-4 border-t-brand shadow-md">
                    <h3 class="text-xl font-black text-slate-900 dark:text-white mb-6 flex items-center gap-3">📊 Telemetry & Analytics</h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div class="bg-slate-50 dark:bg-black/50 p-6 rounded-2xl border border-slate-200 dark:border-borderDark shadow-sm">
                            <h4 class="text-xs uppercase tracking-widest text-slate-500 font-bold mb-2">Unique Logins Today</h4>
                            <p class="text-5xl font-black text-brand drop-shadow-sm">${uniqueLoginsToday}</p>
                        </div>
                        <div class="col-span-1 md:col-span-2 bg-slate-50 dark:bg-black/50 p-6 rounded-2xl border border-slate-200 dark:border-borderDark shadow-sm">
                            <h4 class="text-xs uppercase tracking-widest text-slate-500 font-bold mb-4">Live Activity Feed</h4>
                            <div class="space-y-3">
                                ${recentActivity.length > 0 ? activityHtml : '<p class="text-sm text-slate-500 font-medium">No activity recorded yet.</p>'}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="glass-card p-8 rounded-3xl border border-red-500/30 shadow-sm">
                    <h3 class="text-xl font-black text-red-600 dark:text-red-500 mb-2">Danger Zone</h3>
                    <p class="text-sm text-slate-600 dark:text-gray-400 mb-8 font-medium">Shutting down the system blocks Student access.</p>
                    <button onclick="toggleSystemState('${isOffline ? 'Online' : 'Offline'}')" class="w-full ${isOffline ? 'bg-green-600 shadow-green-500/30' : 'bg-red-600 shadow-red-500/30'} shadow-lg hover:scale-[0.98] transition-transform text-white py-4 rounded-xl font-bold">${isOffline ? 'Reactivate System' : 'Shutdown System'}</button>
                </div>
                
                <div class="glass-card p-8 rounded-3xl shadow-sm">
                    <h3 class="text-xl font-black text-slate-900 dark:text-white mb-6">Provision User</h3>
                    <form id="cms-student-form" class="space-y-4">
                        <input type="text" id="cms-stu-name" placeholder="Full Name" required class="w-full px-5 py-3.5 bg-white dark:bg-black/50 border border-slate-300 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand text-slate-900 dark:text-white font-medium shadow-sm">
                        <input type="text" id="cms-stu-roll" placeholder="Roll Number" required class="w-full px-5 py-3.5 bg-white dark:bg-black/50 border border-slate-300 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand uppercase text-slate-900 dark:text-white font-mono shadow-sm">
                        <input type="tel" id="cms-stu-phone" placeholder="Phone Number" class="w-full px-5 py-3.5 bg-white dark:bg-black/50 border border-slate-300 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand text-slate-900 dark:text-white font-medium shadow-sm">
                        <input type="email" id="cms-stu-email" placeholder="Email Address" required class="w-full px-5 py-3.5 bg-white dark:bg-black/50 border border-slate-300 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand text-slate-900 dark:text-white font-medium shadow-sm">
                        <select id="cms-stu-role" class="w-full px-5 py-3.5 bg-white dark:bg-black/50 border border-slate-300 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand text-slate-700 dark:text-gray-300 font-bold shadow-sm">
                            <option value="Student">Student Privilege</option>
                            <option value="Admin">Administrator Privilege</option>
                        </select>
                        <button type="submit" class="w-full bg-slate-900 dark:bg-white text-white dark:text-black py-4 rounded-xl font-bold hover:scale-[0.98] transition-transform shadow-lg mt-2">Create Profile</button>
                    </form>
                </div>
                
                <div class="glass-card p-8 rounded-3xl lg:col-span-2 shadow-sm">
                    <h3 class="text-xl font-black text-slate-900 dark:text-white mb-6 flex justify-between items-center">Security Alerts <span class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 px-3 py-1.5 rounded-lg text-xs tracking-widest uppercase">${pendingResets.length} Pending</span></h3>
                    <div class="space-y-3 max-h-64 overflow-y-auto pr-2">
                        ${pendingResets.length === 0 ? '<p class="text-sm text-slate-500 font-medium">No alerts.</p>' : resetHtml}
                    </div>
                </div>
            </div>
        `;
        document.getElementById('cms-student-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const role = document.getElementById('cms-stu-role').value; const roll = document.getElementById('cms-stu-roll').value.toUpperCase();
            const rowData = [document.getElementById('cms-stu-name').value, roll, document.getElementById('cms-stu-phone').value || '-', document.getElementById('cms-stu-email').value, roll, role, 'Not Set', 'Not Set'];
            showToast('Provisioning...', 'success');
            const res = await apiCall('addData', { role: currentUser.role, tabName: 'Users', rowData });
            if (res.success) { showToast('Account Active!'); await forceSync(); }
        });
    }

    // 6. ECOSYSTEM
    else if (currentMainView === 'workspace') {
        let bc = `<button onclick="workspacePath={semester:null, subject:null}; renderCanvas()" class="hover:text-brand font-black tracking-wide text-lg ${!workspacePath.semester ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-600'}">Ecosystem</button>`;
        if (workspacePath.semester) bc += ` <span class="text-slate-300 dark:text-slate-700 mx-2">/</span> <button onclick="workspacePath.subject=null; renderCanvas()" class="hover:text-brand font-black tracking-wide text-lg ${!workspacePath.subject ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-600'}">${workspacePath.semester}</button>`;
        if (workspacePath.subject) bc += ` <span class="text-slate-300 dark:text-slate-700 mx-2">/</span> <span class="text-slate-900 dark:text-white font-black tracking-wide text-lg truncate max-w-[150px] md:max-w-none block md:inline">${workspacePath.subject}</span>`;
        document.getElementById('breadcrumb').innerHTML = `<div class="flex items-center truncate">${bc}</div>`;

        if (!workspacePath.semester) {
            const semesters = [...new Set(appData.modules.filter(m => String(m.semester).trim() !== '').map(m => String(m.semester).trim()))];
            let addFolderCard = currentUser.role === 'Admin' ? `
                <div onclick="openModuleModal('Semester')" class="eco-card glass-card p-6 rounded-3xl cursor-pointer hover:-translate-y-2 transition-all group flex flex-col justify-center items-center text-center h-48 md:h-56 border border-dashed border-brand/50 shadow-sm hover:shadow-brand/20 bg-brand/5">
                    <div class="w-14 h-14 rounded-2xl bg-brand text-white flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg></div>
                    <h3 class="text-sm font-bold text-brand uppercase tracking-widest">Add Semester</h3>
                </div>` : '';

            let semHtml = semesters.map(sem => {
                let deleteBtn = currentUser.role === 'Admin' ? `<button onclick="event.stopPropagation(); deleteModule('${sem}', null)" class="absolute top-4 right-4 p-2 text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl opacity-0 group-hover:opacity-100 transition-all z-10"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : '';
                return `
                    <div class="eco-card glass-card p-6 rounded-3xl cursor-pointer hover:-translate-y-2 hover:border-brand/50 transition-all group shadow-sm hover:shadow-xl relative flex flex-col justify-center items-center text-center h-48 md:h-56">
                        ${deleteBtn}
                        <div onclick="workspacePath.semester='${sem}'; renderCanvas()" class="w-full h-full flex flex-col justify-center items-center">
                            <svg class="w-16 h-16 mb-4 text-brand opacity-90 group-hover:scale-110 transition-transform drop-shadow-md" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path></svg>
                            <h3 class="text-xl font-black text-slate-900 dark:text-white w-full truncate px-2">${sem}</h3>
                        </div>
                    </div>
                `;
            }).join('');

            canvas.innerHTML = offlineBanner + `
                <div class="flex flex-col md:flex-row md:justify-between md:items-center mb-10 gap-4">
                    <h1 class="text-4xl font-black text-slate-900 dark:text-white tracking-tight">Ecosystem</h1>
                    <input type="text" id="eco-search" placeholder="Search folders..." class="bg-white dark:bg-black/50 border border-slate-300 dark:border-borderDark rounded-xl px-5 py-3.5 text-sm outline-none focus:border-brand w-full md:w-72 text-slate-900 dark:text-white font-medium shadow-sm">
                </div>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-8">
                    ${addFolderCard}
                    ${semHtml}
                </div>
            `;
        }
        else if (workspacePath.semester && !workspacePath.subject) {
            const subjects = [...new Set(appData.modules.filter(m => String(m.semester).trim() === String(workspacePath.semester).trim() && String(m.subject).trim() !== 'General' && String(m.subject).trim() !== '').map(m => String(m.subject).trim()))];
            
            let addFolderCard = currentUser.role === 'Admin' ? `
                <div onclick="openModuleModal('Subject')" class="eco-card glass-card p-6 rounded-3xl cursor-pointer hover:-translate-y-2 transition-all group flex flex-col justify-center items-center text-center h-48 md:h-56 border border-dashed border-indigo-400/50 shadow-sm hover:shadow-indigo-500/20 bg-indigo-500/5">
                    <div class="w-14 h-14 rounded-2xl bg-indigo-500 text-white flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg></div>
                    <h3 class="text-sm font-bold text-indigo-500 uppercase tracking-widest">Add Subject</h3>
                </div>` : '';

            let subHtml = subjects.map(sub => {
                let deleteBtn = currentUser.role === 'Admin' ? `<button onclick="event.stopPropagation(); deleteModule('${workspacePath.semester}', '${sub}')" class="absolute top-4 right-4 p-2 text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl opacity-0 group-hover:opacity-100 transition-all z-10"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : '';
                return `
                    <div class="eco-card glass-card p-6 rounded-3xl cursor-pointer hover:-translate-y-2 hover:border-indigo-500/50 transition-all group shadow-sm hover:shadow-xl relative flex flex-col justify-center items-center text-center h-48 md:h-56">
                        ${deleteBtn}
                        <div onclick="workspacePath.subject='${sub}'; renderCanvas()" class="w-full h-full flex flex-col justify-center items-center">
                            <svg class="w-16 h-16 mb-4 text-indigo-500 opacity-90 group-hover:scale-110 transition-transform drop-shadow-md" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path></svg>
                            <h3 class="text-base md:text-lg font-black text-slate-900 dark:text-white w-full truncate px-2">${sub}</h3>
                        </div>
                    </div>
                `;
            }).join('');

            canvas.innerHTML = offlineBanner + `
                <div class="flex flex-col md:flex-row md:justify-between md:items-center mb-10 gap-4">
                    <div class="flex items-center gap-4">
                        <button onclick="workspacePath.semester=null; renderCanvas()" class="w-12 h-12 rounded-full bg-white dark:bg-white/5 border border-slate-300 dark:border-borderDark flex items-center justify-center text-slate-900 dark:text-white shrink-0 hover:scale-105 transition-transform shadow-sm">←</button>
                        <h1 class="text-4xl font-black text-slate-900 dark:text-white tracking-tight">${workspacePath.semester}</h1>
                    </div>
                    <input type="text" id="eco-search" placeholder="Search subjects..." class="bg-white dark:bg-black/50 border border-slate-300 dark:border-borderDark rounded-xl px-5 py-3.5 text-sm outline-none focus:border-brand w-full md:w-72 text-slate-900 dark:text-white font-medium shadow-sm">
                </div>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-8">
                    ${addFolderCard}
                    ${subHtml}
                </div>
            `;
        }
        // RESOURCES LEVEL (WITH CLEAR EDIT BUTTONS)
        else if (workspacePath.subject) {
            const notes = validNotes.filter(n => String(n.subject).trim() === String(workspacePath.subject).trim() && String(n.semester).trim() === String(workspacePath.semester).trim());
            const excels = validExcels.filter(e => String(e.subject).trim() === String(workspacePath.subject).trim() && String(e.semester).trim() === String(workspacePath.semester).trim());
            
            let adminBtn = currentUser.role === 'Admin' ? `<button onclick="openResourceModal('create')" class="bg-slate-900 dark:bg-white text-white dark:text-black px-6 py-3 rounded-xl font-bold hover:scale-[0.98] transition-transform shadow-lg flex items-center gap-2 w-full md:w-auto justify-center">+ Publish Content</button>` : '';

            let notesHtml = notes.map(n => {
                const isPinned = pinnedResources.some(p => p.link === n.link);
                const starClass = isPinned ? 'text-yellow-400 drop-shadow-md' : 'text-slate-300 dark:text-gray-600 hover:text-yellow-400';
                const safeTitle = n.title.replace(/'/g, "\\'");
                
                let editBtn = currentUser.role === 'Admin' ? `<button onclick="openResourceModal('edit', 'Notes', '${safeTitle}', '${n.link}', '${n.date}')" class="text-brand hover:bg-brand/10 p-2 rounded-xl transition-colors" title="Edit Resource"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>` : '';
                let delBtn = currentUser.role === 'Admin' ? `<button onclick="deleteRecord('Notes', '${n.date}', '${safeTitle}')" class="text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 p-2 rounded-xl transition-colors" title="Delete Resource"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : '';

                return `
                    <div class="glass-card p-5 md:p-6 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between group gap-4 border border-transparent hover:border-brand/30 shadow-sm">
                        <div class="flex items-center gap-4 overflow-hidden">
                            <div class="w-12 h-12 rounded-2xl bg-brand/10 flex items-center justify-center text-brand shrink-0 shadow-sm"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg></div>
                            <span class="text-base font-bold text-slate-900 dark:text-white truncate">${n.title}</span>
                        </div>
                        <div class="flex items-center justify-end gap-2 shrink-0">
                            <button onclick="togglePin('Note', '${safeTitle}', '${n.link}', '${n.subject}')" class="${starClass} text-2xl transition-transform hover:scale-110 mr-1" title="Quick Pin">★</button>
                            ${editBtn}
                            ${delBtn}
                            <a href="${n.link}" target="_blank" class="text-xs text-brand bg-brand/10 px-5 py-2.5 rounded-xl font-bold uppercase tracking-wider hover:bg-brand hover:text-white transition-colors ml-1">Open</a>
                        </div>
                    </div>
                `;
            }).join('');

            let excelsHtml = excels.map(e => {
                const isPinned = pinnedResources.some(p => p.link === e.link);
                const starClass = isPinned ? 'text-yellow-400 drop-shadow-md' : 'text-slate-300 dark:text-gray-600 hover:text-yellow-400';
                const safeTitle = e.title.replace(/'/g, "\\'");

                let editBtn = currentUser.role === 'Admin' ? `<button onclick="openResourceModal('edit', 'Excels', '${safeTitle}', '${e.link}', '${e.date}')" class="text-green-600 hover:bg-green-500/10 p-2 rounded-xl transition-colors" title="Edit Resource"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>` : '';
                let delBtn = currentUser.role === 'Admin' ? `<button onclick="deleteRecord('Excels', '${e.date}', '${safeTitle}')" class="text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 p-2 rounded-xl transition-colors" title="Delete Resource"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : '';

                return `
                    <div class="glass-card p-5 md:p-6 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between group gap-4 border border-transparent hover:border-green-500/30 shadow-sm">
                        <div class="flex items-center gap-4 overflow-hidden">
                            <div class="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center text-green-600 dark:text-green-500 shrink-0 shadow-sm"><svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg></div>
                            <span class="text-base font-bold text-slate-900 dark:text-white truncate">${e.title}</span>
                        </div>
                        <div class="flex items-center justify-end gap-2 shrink-0">
                            <button onclick="togglePin('Excel', '${safeTitle}', '${e.link}', '${e.subject}')" class="${starClass} text-2xl transition-transform hover:scale-110 mr-1" title="Quick Pin">★</button>
                            ${editBtn}
                            ${delBtn}
                            <a href="${e.link}" target="_blank" class="text-xs text-green-700 dark:text-green-400 bg-green-500/10 px-5 py-2.5 rounded-xl font-bold uppercase tracking-wider hover:bg-green-600 hover:text-white transition-colors ml-1">View</a>
                        </div>
                    </div>
                `;
            }).join('');

            canvas.innerHTML = offlineBanner + `
                <div class="flex flex-col md:flex-row md:justify-between md:items-center mb-10 gap-4">
                    <div class="flex items-center gap-4 overflow-hidden">
                        <button onclick="workspacePath.subject=null; renderCanvas()" class="w-12 h-12 rounded-full bg-white dark:bg-white/5 border border-slate-300 dark:border-borderDark flex items-center justify-center text-slate-900 dark:text-white shrink-0 hover:scale-105 transition-transform shadow-sm">←</button>
                        <h1 class="text-3xl md:text-4xl font-black text-slate-900 dark:text-white truncate leading-tight pb-1">${workspacePath.subject}</h1>
                    </div>
                    ${adminBtn}
                </div>
                <div class="grid grid-cols-1 xl:grid-cols-2 gap-8 md:gap-10">
                    <div>
                        <h3 class="text-xs font-bold text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2"><div class="w-2 h-2 rounded-full bg-brand"></div> Documentation</h3>
                        <div class="space-y-4">
                            ${notes.length > 0 ? notesHtml : '<div class="glass-card p-8 rounded-3xl text-center text-slate-500 font-medium border border-dashed border-slate-300 dark:border-borderDark">No documents indexed.</div>'}
                        </div>
                    </div>
                    <div>
                        <h3 class="text-xs font-bold text-slate-400 dark:text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2"><div class="w-2 h-2 rounded-full bg-green-500"></div> Data Sheets</h3>
                        <div class="space-y-4">
                            ${excels.length > 0 ? excelsHtml : '<div class="glass-card p-8 rounded-3xl text-center text-slate-500 font-medium border border-dashed border-slate-300 dark:border-borderDark">No datasets indexed.</div>'}
                        </div>
                    </div>
                </div>
            `;
        }
        document.getElementById('eco-search')?.addEventListener('input', (e) => { const term = e.target.value.toLowerCase(); document.querySelectorAll('.eco-card').forEach(card => { card.style.display = card.innerText.toLowerCase().includes(term) ? '' : 'none'; }); });
    }
}

// --- MODALS & ACTIONS ---
function openModuleModal(type) { document.getElementById('mod-type').value = type; document.getElementById('mod-modal-title').innerText = type === 'Semester' ? 'Create Semester' : `Add Subject`; document.getElementById('mod-input-name').placeholder = `${type} Name`; document.getElementById('module-modal').classList.remove('hidden'); setTimeout(() => document.getElementById('module-modal').classList.remove('opacity-0'), 10); }
function closeModuleModal() { document.getElementById('module-modal').classList.add('opacity-0'); setTimeout(() => document.getElementById('module-modal').classList.add('hidden'), 300); }
document.getElementById('add-module-form')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = document.getElementById('addModuleBtn'); btn.innerText = 'Deploying...'; btn.disabled = true;
    const type = document.getElementById('mod-type').value; const inputName = document.getElementById('mod-input-name').value;
    const rowData = type === 'Semester' ? [inputName, 'General'] : [workspacePath.semester, inputName];
    const res = await apiCall('addData', { role: currentUser.role, tabName: 'Modules', rowData });
    if (res && res.success) { showToast('Folder Live!', 'success'); closeModuleModal(); e.target.reset(); await forceSync(); } else { showToast('Failed', 'error'); }
    btn.innerText = 'Create Folder'; btn.disabled = false;
});

async function toggleSystemState(newState) { if(!confirm(`Are you sure you want to turn the system ${newState}?`)) return; showToast(`Initiating...`, 'success'); const res = await apiCall('toggleSystemStatus', { role: currentUser.role, status: newState }); if (res && res.success) await forceSync(); }
async function deleteUser(rollNumber) { if (!confirm(`Permanently delete student ${rollNumber}?`)) return; showToast('Deleting user...', 'success'); const res = await apiCall('deleteData', { role: currentUser.role, tabName: 'Users', conditions: { 1: rollNumber } }); if (res && res.success) { showToast('User removed.'); await forceSync(); } else { showToast('Failed to delete', 'error'); } }
async function toggleUserRole(rollNumber, currentRole) { const newRole = currentRole === 'Admin' ? 'Student' : 'Admin'; if (!confirm(`Change ${rollNumber}'s privilege to ${newRole}?`)) return; showToast('Updating privilege...', 'success'); const res = await apiCall('updateRole', { role: currentUser.role, targetRoll: rollNumber, newRole: newRole }); if (res && res.success) { showToast('Privilege updated!'); await forceSync(); } else { showToast('Failed to update', 'error'); } }
async function deleteModule(semester, subject) { if (!confirm(`WARNING: Deleting will permanently erase all contents inside. Continue?`)) return; showToast('Purging...', 'success'); const res = await apiCall('deleteModule', { role: currentUser.role, semester, subject }); if (res && res.success) await forceSync(); else showToast('Failed', 'error'); }
async function deleteRecord(tabName, dateStr, title) { if (!confirm(`Permanently delete this item?`)) return; showToast('Deleting...', 'success'); const res = await apiCall('deleteData', { role: currentUser.role, tabName, conditions: { 1: title, 3: dateStr } }); if (res && res.success) await forceSync(); else showToast('Failed', 'error'); }

// Attendance Actions
async function clearTodaysAttendance() {
    if(!confirm("Clear all attendance logs recorded today?")) return;
    showToast('Clearing logs...', 'success');
    const res = await apiCall('clearAttendance', { role: currentUser.role });
    if(res.success) { showToast(res.message); await forceSync(); } else { showToast('Failed to clear', 'error'); }
}
function showAttOutput(present, absent) {
    const pBox = document.getElementById('att-present-text'); const aBox = document.getElementById('att-absent-text');
    pBox.value = present ? present.split(',').map(r => r.slice(-2)).join(', ') : 'None';
    aBox.value = absent ? absent.split(',').map(r => r.slice(-2)).join(', ') : 'None';
    document.getElementById('att-output-modal').classList.remove('hidden'); setTimeout(() => document.getElementById('att-output-modal').classList.remove('opacity-0'), 10);
}
function closeAttOutput() { document.getElementById('att-output-modal').classList.add('opacity-0'); setTimeout(() => document.getElementById('att-output-modal').classList.add('hidden'), 300); }
function copyToClip(elemId) { const el = document.getElementById(elemId); el.select(); document.execCommand("copy"); showToast('Copied to clipboard!', 'success'); }

// EDIT & CREATE RESOURCE LOGIC
document.getElementById('res-type')?.addEventListener('change', (e) => {
    const linkInput = document.getElementById('res-link');
    linkInput.placeholder = e.target.value === 'Notes' ? "Paste URL Link (e.g. Google Drive)" : "Paste Spreadsheet URL";
});

function openResourceModal(mode = 'create', type = 'Notes', title = '', link = '', date = '') { 
    document.getElementById('res-mode').value = mode;
    if(mode === 'edit') {
        document.getElementById('res-modal-title').innerText = `Edit Document`;
        document.getElementById('modal-subtitle').innerText = `${workspacePath.semester} / ${workspacePath.subject}`;
        document.getElementById('res-type').value = type;
        document.getElementById('res-type').disabled = true;
        document.getElementById('res-title').value = title;
        document.getElementById('res-link').value = link;
        
        document.getElementById('res-orig-type').value = type;
        document.getElementById('res-orig-title').value = title;
        document.getElementById('res-orig-date').value = date;
        document.getElementById('addResourceBtn').innerText = 'Save Changes';
    } else {
        document.getElementById('res-modal-title').innerText = `Publish Content`;
        document.getElementById('modal-subtitle').innerText = `${workspacePath.semester} / ${workspacePath.subject}`;
        document.getElementById('add-resource-form').reset();
        document.getElementById('res-type').disabled = false;
        document.getElementById('addResourceBtn').innerText = 'Publish to Ecosystem';
    }
    document.getElementById('resource-modal').classList.remove('hidden'); 
    setTimeout(() => document.getElementById('resource-modal').classList.remove('opacity-0'), 10); 
}
function closeModal() { document.getElementById('resource-modal').classList.add('opacity-0'); setTimeout(() => document.getElementById('resource-modal').classList.add('hidden'), 300); }

document.getElementById('add-resource-form')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = document.getElementById('addResourceBtn'); btn.innerText = 'Processing...'; btn.disabled = true;
    const isEdit = document.getElementById('res-mode').value === 'edit';
    let res;

    if(isEdit) {
        const originalType = document.getElementById('res-orig-type').value;
        const originalTitle = document.getElementById('res-orig-title').value;
        const originalDate = document.getElementById('res-orig-date').value;
        const rowData = [workspacePath.semester, document.getElementById('res-title').value, workspacePath.subject, originalDate, document.getElementById('res-link').value];
        const conditions = { 1: originalTitle, 3: originalDate };
        res = await apiCall('editData', { role: currentUser.role, tabName: originalType, conditions, newData: rowData });
    } else {
        const rowData = [workspacePath.semester, document.getElementById('res-title').value, workspacePath.subject, new Date().toISOString(), document.getElementById('res-link').value];
        res = await apiCall('addData', { role: currentUser.role, tabName: document.getElementById('res-type').value, rowData });
    }

    if (res && res.success) { showToast('Saved Successfully!', 'success'); closeModal(); await forceSync(); } 
    else { showToast('Failed to save', 'error'); }
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
        document.getElementById('ann-modal-title').innerText = "Global Notice"; document.getElementById('g-ann-mode').value = 'create';
        form.reset(); document.getElementById('postAnnBtn').innerText = "Publish Notice";
    }
    modal.classList.remove('hidden'); setTimeout(() => modal.classList.remove('opacity-0'), 10); 
}
function closeAnnModal() { document.getElementById('announcement-modal').classList.add('opacity-0'); setTimeout(() => document.getElementById('announcement-modal').classList.add('hidden'), 300); }
document.getElementById('global-ann-form')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = document.getElementById('postAnnBtn'); btn.innerText = 'Processing...'; btn.disabled = true;
    const isEdit = document.getElementById('g-ann-mode').value === 'edit';
    const rowData = ['Global', document.getElementById('g-ann-title').value, 'Campus Notice', isEdit ? document.getElementById('g-ann-original-date').value : new Date().toISOString(), document.getElementById('g-ann-desc').value, document.getElementById('g-ann-priority').value, document.getElementById('g-ann-valid').value];
    let res;
    if (isEdit) {
        const conditions = { 1: document.getElementById('g-ann-title').defaultValue || document.getElementById('g-ann-title').value, 3: document.getElementById('g-ann-original-date').value }; 
        res = await apiCall('editData', { role: currentUser.role, tabName: 'Announcements', conditions, newData: rowData });
    } else { res = await apiCall('addData', { role: currentUser.role, tabName: 'Announcements', rowData }); }
    if (res && res.success) { showToast('Success!', 'success'); closeAnnModal(); await forceSync(); } else { showToast('Failed', 'error'); }
    btn.disabled = false;
});

async function approveReset(rollNumber) { showToast('Authorizing...', 'success'); const res = await apiCall('approveReset', { role: currentUser.role, rollNumber }); if (res.success) { showToast('Clearance Granted'); await forceSync(); } }

function exportCSV() {
    let csvContent = "data:text/csv;charset=utf-8,S.No,Student Name,Roll Number,Email ID\n";
    appData.students.forEach((s, idx) => { csvContent += `${idx + 1},${s.name},${s.rollNumber},${s.email}\n`; });
    const link = document.createElement("a"); link.setAttribute("href", encodeURI(csvContent)); link.setAttribute("download", "Class_Directory.csv");
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

// BOOT
if (localStorage.getItem('session')) { currentUser = JSON.parse(localStorage.getItem('session')); initApp(); } 
else { document.getElementById('auth-layout').classList.remove('opacity-0'); }
