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
    btn.classList.add('hidden'); status.classList.remove('hidden'); status.innerText = 'Securing connection...';
    
    const res = await apiCall('login', { rollNumber: document.getElementById('rollNumber').value, password: document.getElementById('password').value });
    if (res && res.success) {
        status.innerText = 'Session authorized.';
        currentUser = res.user;
        localStorage.setItem('session', JSON.stringify(currentUser));
        
        if (res.adminToken) {
            localStorage.setItem('adminToken', res.adminToken);
        }
        
        apiCall('logActivity', { rollNumber: currentUser.rollNumber, name: currentUser.name, role: currentUser.role });
        setTimeout(initApp, 300);
    } else {
        showToast(res ? res.message : 'Authentication failed', 'error');
        btn.classList.remove('hidden'); status.classList.add('hidden');
    }
});

// --- TWO-STEP FORGOT PASSWORD FLOW ---
function resetForgotFlow() {
    document.getElementById('forgotFormStep1').classList.remove('hidden');
    document.getElementById('forgotFormStep2').classList.add('hidden');
    document.getElementById('resetRoll').value = '';
    document.getElementById('resetAnswer').value = '';
    switchAuthView('login-view');
}

document.getElementById('forgotFormStep1')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('getQBtn'); btn.innerText = 'Searching...'; btn.disabled = true;
    const roll = document.getElementById('resetRoll').value;
    const res = await apiCall('getSecurityQuestion', { rollNumber: roll });
    
    if (res && res.success) {
        document.getElementById('display-sec-q').innerText = res.question;
        document.getElementById('forgotFormStep1').classList.add('hidden');
        document.getElementById('forgotFormStep2').classList.remove('hidden');
    } else {
        showToast(res.message || 'Account not found', 'error');
    }
    btn.innerText = 'Find Account'; btn.disabled = false;
});

document.getElementById('forgotFormStep2')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('resetBtn'); btn.innerText = 'Requesting...'; btn.disabled = true;
    const res = await apiCall('requestReset', { rollNumber: document.getElementById('resetRoll').value, answer: document.getElementById('resetAnswer').value });
    showToast(res.message, res.success ? 'success' : 'error');
    btn.innerText = 'Request Reset'; btn.disabled = false;
    if(res.success) resetForgotFlow();
});

function logout() { 
    localStorage.clear();
    location.reload(); 
}

// --- INIT & SYNC ---
async function initApp() {
    document.getElementById('auth-layout').classList.add('opacity-0');
    setTimeout(() => { document.getElementById('auth-layout').classList.add('hidden'); document.getElementById('app-layout').classList.remove('hidden'); }, 500);
    document.getElementById('ui-username').innerText = currentUser.name;
    document.getElementById('ui-role').innerText = currentUser.role === 'Admin' ? 'Administrator' : 'Student Access';
    document.getElementById('ui-avatar').innerText = currentUser.name.charAt(0).toUpperCase();
    if(currentUser.role === 'Admin') document.getElementById('nav-admin').classList.remove('hidden');

    if (localStorage.getItem('appCache')) {
        appData = JSON.parse(localStorage.getItem('appCache'));
        checkSystemStatus();
    } else {
        document.getElementById('workspace-canvas').innerHTML = `<div class="animate-pulse space-y-4"><div class="h-8 bg-slate-200 dark:bg-white/5 rounded w-1/4"></div><div class="h-48 bg-slate-200 dark:bg-white/5 rounded-3xl w-full"></div></div>`;
    }
    await forceSync();
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
    const shutdownScreen = document.getElementById('shutdown-screen');
    if (isOffline && currentUser.role === 'Student') {
        shutdownScreen.classList.remove('hidden');
    } else {
        if(shutdownScreen) shutdownScreen.classList.add('hidden');
        renderCanvas();
    }
}

function switchMainView(view) {
    currentMainView = view; workspacePath = { semester: null, subject: null }; 
    if(window.innerWidth < 768) toggleSidebar();
    document.querySelectorAll('.nav-btn').forEach(btn => { btn.classList.remove('active', 'bg-slate-200', 'dark:bg-white/10', 'text-slate-900', 'dark:text-white'); btn.classList.add('text-slate-500', 'dark:text-gray-400'); });
    if(view !== 'profile') { const activeBtn = event.currentTarget || document.querySelector(`[onclick="switchMainView('${view}')"]`); if(activeBtn) { activeBtn.classList.remove('text-slate-500', 'dark:text-gray-400'); activeBtn.classList.add('bg-slate-200', 'dark:bg-white/10', 'text-slate-900', 'dark:text-white'); } }
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
        const allAnns = appData.announcements ? appData.announcements.filter(a => a.title).slice().reverse() : [];
        let addAnnBtn = currentUser.role === 'Admin' ? `<button onclick="openAnnModal()" class="ml-auto bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-900 dark:text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors active:scale-95 flex items-center gap-2">+ Notice</button>` : '';

        let pinsHtml = '';
        if (pinnedResources.length > 0) {
            pinsHtml = `
            <div class="mb-10">
                <h2 class="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2 mb-4">⭐ Quick Pins</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${pinnedResources.map(p => `
                        <div class="glass-card p-4 rounded-2xl flex items-center justify-between group hover:border-brand transition-colors">
                            <div class="flex items-center gap-4 truncate">
                                <div class="w-10 h-10 rounded-xl bg-slate-200 dark:bg-white/5 flex items-center justify-center ${p.type==='Note'?'text-brand':'text-green-500'} shrink-0">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${p.type==='Note'?'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z':'M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z'}"></path></svg>
                                </div>
                                <div class="truncate">
                                    <h4 class="text-sm font-bold text-slate-900 dark:text-white truncate">${p.title}</h4>
                                    <p class="text-[10px] text-slate-500 uppercase tracking-widest">${p.subject}</p>
                                </div>
                            </div>
                            <div class="flex items-center gap-3 shrink-0 ml-2">
                                <button onclick="togglePin('${p.type}', '${p.title.replace(/'/g, "\\'")}', '${p.link}', '${p.subject}')" class="text-yellow-500 hover:scale-110 transition-transform text-lg" title="Unpin">★</button>
                                <a href="${p.link}" target="_blank" class="text-[10px] text-brand bg-brand/10 px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider hover:bg-brand hover:text-white">Open</a>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }

        canvas.innerHTML = offlineBanner + `
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
                <div class="glass-card p-6 rounded-3xl"><h3 class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Total Students</h3><p class="text-4xl font-bold text-slate-900 dark:text-white tracking-tight">${appData.students.length}</p></div>
                <div class="glass-card p-6 rounded-3xl"><h3 class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Total Resources</h3><p class="text-4xl font-bold text-slate-900 dark:text-white tracking-tight">${totalResources}</p></div>
                <div class="glass-card p-6 rounded-3xl"><h3 class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">System Status</h3><p class="text-xl font-medium ${appData.systemStatus === 'Offline' ? 'text-red-500' : 'text-green-500'} mt-2 flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-current shadow-[0_0_12px_currentColor] animate-pulse"></span> ${appData.systemStatus === 'Offline' ? 'Offline' : 'Online'}</p></div>
            </div>
            ${pinsHtml}
            <div class="flex items-center mb-6 w-full"><h2 class="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Notice Board</h2>${addAnnBtn}</div>
            <div class="space-y-4">
                ${allAnns.length > 0 ? allAnns.map(a => {
                    let prioColor = 'border-brand text-brand'; let prioBg = 'bg-brand/10';
                    if(a.priority === 'High') { prioColor = 'border-red-500 text-red-500'; prioBg = 'bg-red-500/10'; }
                    if(a.priority === 'Low') { prioColor = 'border-slate-500 text-slate-500'; prioBg = 'bg-slate-500/10 dark:bg-white/5'; }
                    const expText = a.validUntil ? `<span class="text-[10px] bg-slate-200 dark:bg-white/5 px-2 py-1 rounded text-slate-600 dark:text-gray-400">Valid til: ${new Date(a.validUntil).toLocaleDateString()}</span>` : '';
                    return `
                    <div class="glass-card p-6 rounded-3xl border-l-4 ${prioColor}">
                        <div class="flex justify-between items-start mb-2">
                            <div>
                                <div class="flex items-center gap-2 mb-3">
                                    <span class="text-[10px] uppercase tracking-widest font-bold ${prioColor} ${prioBg} px-2 py-1 rounded-lg">${a.priority || 'Normal'}</span>
                                    <span class="text-[10px] uppercase tracking-widest font-bold text-slate-600 dark:text-gray-400 bg-slate-200 dark:bg-white/5 px-2 py-1 rounded-lg">${a.semester} • ${a.subject}</span>
                                </div>
                                <h3 class="text-lg font-bold text-slate-900 dark:text-white">${a.title}</h3>
                            </div>
                            <div class="flex flex-col items-end gap-2">
                                <div class="flex gap-2">
                                    ${currentUser.role === 'Admin' ? `<button onclick="openAnnModal('${a.date}', '${a.title.replace(/'/g, "\\'")}')" class="text-brand hover:text-blue-500 p-1"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg></button>` : ''}
                                    ${currentUser.role === 'Admin' ? `<button onclick="deleteRecord('Announcements', '${a.date}', '${a.title.replace(/'/g, "\\'")}')" class="text-slate-500 hover:text-red-500 p-1"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : ''}
                                </div>
                                <span class="text-[10px] text-slate-500 font-mono">${new Date(a.date).toLocaleDateString()}</span>
                                ${expText}
                            </div>
                        </div>
                        <p class="text-sm text-slate-700 dark:text-gray-300 mt-2">${a.description}</p>
                    </div>
                `}).join('') : '<div class="glass-card p-8 rounded-3xl text-center text-slate-500">No announcements.</div>'}
            </div>
        `;
    }

    // 2. DIRECTORY
    else if (currentMainView === 'directory') {
        document.getElementById('breadcrumb').innerHTML = '<span class="text-slate-900 dark:text-white font-bold">Directory</span>';
        let csvBtn = currentUser.role === 'Admin' ? `<button onclick="exportCSV()" class="bg-green-600/20 text-green-600 dark:text-green-400 hover:bg-green-600 hover:text-white px-4 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg> CSV</button>` : '';

        canvas.innerHTML = offlineBanner + `
            <div class="mb-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <h1 class="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Class Roster</h1>
                <div class="flex items-center gap-3">
                    <input type="text" id="dir-search" placeholder="Search..." class="bg-white dark:bg-black/50 border border-slate-300 dark:border-borderDark rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand w-full md:w-64 text-slate-900 dark:text-white">
                    ${csvBtn}
                </div>
            </div>
            <div class="glass-card rounded-2xl overflow-hidden overflow-x-auto">
                <table class="w-full text-left text-sm whitespace-nowrap">
                    <thead class="bg-slate-100 dark:bg-white/5 border-b border-slate-200 dark:border-borderDark text-slate-600 dark:text-gray-400">
                        <tr>
                            <th class="py-4 px-6 font-medium w-16">S.No</th>
                            <th class="py-4 px-6 font-medium">Student Name</th>
                            <th class="py-4 px-6 font-medium">Roll Number</th>
                            <th class="py-4 px-6 font-medium">Email ID</th>
                            <th class="py-4 px-6 font-medium">Privilege</th>
                            ${currentUser.role === 'Admin' ? `<th class="py-4 px-6 font-medium text-right">Actions</th>` : ''}
                        </tr>
                    </thead>
                    <tbody id="dir-table" class="divide-y divide-slate-200 dark:divide-borderDark text-slate-800 dark:text-white">
                        ${appData.students.map((s, idx) => `
                            <tr class="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors eco-card">
                                <td class="py-4 px-6 text-slate-500 font-mono text-xs">${idx + 1}</td>
                                <td class="py-4 px-6 font-medium">${s.name}</td>
                                <td class="py-4 px-6 text-slate-500 font-mono text-xs">${s.rollNumber}</td>
                                <td class="py-4 px-6 text-slate-500">${s.email}</td>
                                <td class="py-4 px-6"><span class="px-2.5 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider ${s.role === 'Admin' ? 'bg-brand/20 text-brand' : 'bg-slate-200 dark:bg-white/5 text-slate-600 dark:text-gray-400'}">${s.role}</span></td>
                                ${currentUser.role === 'Admin' ? `
                                    <td class="py-4 px-6 text-right">
                                        ${s.rollNumber !== currentUser.rollNumber ? `
                                            <button onclick="toggleUserRole('${s.rollNumber}', '${s.role}')" class="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-white/10 hover:bg-brand hover:text-white transition-colors mr-2">Toggle Role</button>
                                            <button onclick="deleteUser('${s.rollNumber}')" class="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors">Delete</button>
                                        ` : '<span class="text-xs text-slate-400 italic">Current User</span>'}
                                    </td>
                                ` : ''}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        document.getElementById('dir-search')?.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            document.querySelectorAll('.eco-card').forEach(row => { row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none'; });
        });
    }

    // 3. PROFILE (WITH NEW SECURITY QUESTION SECTION)
    else if (currentMainView === 'profile') {
        document.getElementById('breadcrumb').innerHTML = '<span class="text-slate-900 dark:text-white font-bold">Settings</span>';
        canvas.innerHTML = offlineBanner + `
            <div class="max-w-3xl mx-auto">
                <h1 class="text-3xl font-bold text-slate-900 dark:text-white tracking-tight mb-8">Profile</h1>
                
                <div class="glass-card p-6 md:p-8 rounded-3xl mb-8 flex flex-col md:flex-row items-center gap-6">
                    <div class="w-24 h-24 rounded-full bg-gradient-to-tr from-slate-400 to-slate-600 flex items-center justify-center text-4xl font-bold text-white shadow-inner">${currentUser.name.charAt(0)}</div>
                    <div class="text-center md:text-left">
                        <h2 class="text-2xl font-bold text-slate-900 dark:text-white">${currentUser.name}</h2>
                        <p class="text-slate-500 font-mono text-sm mt-1">${currentUser.rollNumber}</p>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="glass-card p-6 md:p-8 rounded-3xl">
                        <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-1">Security Key</h3>
                        <p class="text-xs text-slate-500 mb-6">Update your access password.</p>
                        <form id="change-pass-form" class="space-y-4">
                            <input type="password" id="new-profile-pass" placeholder="New Password" required class="w-full px-4 py-3 bg-white dark:bg-black/50 border border-slate-300 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand text-slate-900 dark:text-white">
                            <button type="submit" id="save-pass-btn" class="bg-slate-900 dark:bg-white text-white dark:text-black font-bold py-3 px-6 rounded-xl text-sm active:scale-[0.98] w-full">Update Password</button>
                        </form>
                    </div>

                    <div class="glass-card p-6 md:p-8 rounded-3xl">
                        <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-1">Account Recovery</h3>
                        <p class="text-xs text-slate-500 mb-6">Setup in case you forget your password.</p>
                        <form id="update-sec-form" class="space-y-4">
                            <input type="text" id="sec-q" placeholder="Custom Security Question" required class="w-full px-4 py-3 bg-white dark:bg-black/50 border border-slate-300 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand text-slate-900 dark:text-white">
                            <input type="text" id="sec-a" placeholder="Secret Answer" required class="w-full px-4 py-3 bg-white dark:bg-black/50 border border-slate-300 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand text-slate-900 dark:text-white">
                            <button type="submit" id="save-sec-btn" class="bg-brand text-white font-bold py-3 px-6 rounded-xl text-sm active:scale-[0.98] w-full">Save Recovery Info</button>
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

    // 4. ADMIN CMS PANEL
    else if (currentMainView === 'admin' && currentUser.role === 'Admin') {
        document.getElementById('breadcrumb').innerHTML = '<span class="text-brand font-bold">Admin Console</span>';
        
        const pendingResets = appData.resets ? appData.resets.filter(r => r.status === 'Pending') : [];
        const isOffline = appData.systemStatus === 'Offline';
        const today = new Date().toISOString().split('T')[0];
        const allLogs = appData.logs || [];
        const todayLogs = allLogs.filter(l => l.timestamp && l.timestamp.startsWith(today));
        const uniqueLoginsToday = new Set(todayLogs.map(l => l.rollNumber)).size;
        const recentActivity = [...allLogs].reverse().slice(0, 5); 

        canvas.innerHTML = offlineBanner + `
            <h1 class="text-3xl font-bold text-slate-900 dark:text-white tracking-tight mb-8">System Ops</h1>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                <div class="glass-card p-6 md:p-8 rounded-3xl col-span-1 lg:col-span-2 border-l-4 border-l-brand">
                    <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">📊 Telemetry & Analytics</h3>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div class="bg-slate-100 dark:bg-black/50 p-4 rounded-2xl">
                            <h4 class="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Unique Logins Today</h4>
                            <p class="text-3xl font-bold text-brand">${uniqueLoginsToday}</p>
                        </div>
                        <div class="col-span-1 md:col-span-2 bg-slate-100 dark:bg-black/50 p-4 rounded-2xl">
                            <h4 class="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">Live Activity Feed</h4>
                            <div class="space-y-2">
                                ${recentActivity.length > 0 ? recentActivity.map(l => `
                                    <div class="flex justify-between items-center text-xs">
                                        <span class="text-slate-700 dark:text-gray-300 font-medium">${l.name} <span class="text-slate-400 font-mono">(${l.rollNumber})</span> logged in</span>
                                        <span class="text-slate-400">${new Date(l.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                    </div>
                                `).join('') : '<p class="text-xs text-slate-500">No activity recorded yet.</p>'}
                            </div>
                        </div>
                    </div>
                </div>

                <div class="glass-card p-6 md:p-8 rounded-3xl border border-red-500/30">
                    <h3 class="text-lg font-bold text-red-500 mb-2">Danger Zone</h3>
                    <p class="text-sm text-slate-600 dark:text-gray-400 mb-6">Shutting down the system blocks Student access.</p>
                    <button onclick="toggleSystemState('${isOffline ? 'Online' : 'Offline'}')" class="w-full ${isOffline ? 'bg-green-600' : 'bg-red-600'} text-white py-3 rounded-xl font-bold">${isOffline ? 'Reactivate System' : 'Shutdown System'}</button>
                </div>
                
                <div class="glass-card p-6 md:p-8 rounded-3xl">
                    <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-6">Provision User</h3>
                    <form id="cms-student-form" class="space-y-4">
                        <input type="text" id="cms-stu-name" placeholder="Full Name" required class="w-full px-4 py-3 bg-white dark:bg-black/50 border border-slate-300 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand text-slate-900 dark:text-white">
                        <input type="text" id="cms-stu-roll" placeholder="Roll Number" required class="w-full px-4 py-3 bg-white dark:bg-black/50 border border-slate-300 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand uppercase text-slate-900 dark:text-white font-mono">
                        <input type="email" id="cms-stu-email" placeholder="Email Address" required class="w-full px-4 py-3 bg-white dark:bg-black/50 border border-slate-300 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand text-slate-900 dark:text-white">
                        <select id="cms-stu-role" class="w-full px-4 py-3 bg-white dark:bg-black/50 border border-slate-300 dark:border-borderDark rounded-xl text-sm outline-none focus:border-brand text-slate-700 dark:text-gray-300">
                            <option value="Student">Student Privilege</option>
                            <option value="Admin">Administrator Privilege</option>
                        </select>
                        <button type="submit" class="w-full bg-slate-900 dark:bg-white text-white dark:text-black py-3 rounded-xl font-bold">Create Profile</button>
                    </form>
                </div>
                
                <div class="glass-card p-6 md:p-8 rounded-3xl lg:col-span-2">
                    <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-6 flex justify-between items-center">Security Alerts <span class="bg-red-500/20 text-red-500 px-3 py-1 rounded-full text-xs">${pendingResets.length} Pending</span></h3>
                    <div class="space-y-3 max-h-64 overflow-y-auto pr-2">
                        ${pendingResets.length === 0 ? '<p class="text-sm text-slate-500">No alerts.</p>' : pendingResets.map(r => `
                            <div class="flex justify-between items-center p-4 bg-slate-100 dark:bg-black/50 rounded-2xl"><span class="font-mono text-slate-900 dark:text-gray-300">${r.rollNumber}</span><button onclick="approveReset('${r.rollNumber}')" class="text-xs bg-slate-900 dark:bg-white text-white dark:text-black px-4 py-2 rounded-lg font-bold">Authorize</button></div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
        document.getElementById('cms-student-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const role = document.getElementById('cms-stu-role').value;
            const roll = document.getElementById('cms-stu-roll').value.toUpperCase();
            const rowData = [document.getElementById('cms-stu-name').value, roll, 'N/A', document.getElementById('cms-stu-email').value, roll, role, 'Not Set', 'Not Set'];
            showToast('Provisioning...', 'success');
            const res = await apiCall('addData', { role: currentUser.role, tabName: 'Users', rowData });
            if (res.success) { showToast('Account Active!'); await forceSync(); }
        });
    }

    // 5. ECOSYSTEM
    else if (currentMainView === 'workspace') {
        let bc = `<button onclick="workspacePath={semester:null, subject:null}; renderCanvas()" class="hover:text-brand font-bold ${!workspacePath.semester ? 'text-slate-900 dark:text-white' : 'text-slate-500'}">Ecosystem</button>`;
        if (workspacePath.semester) bc += ` <span class="text-slate-400 mx-1">/</span> <button onclick="workspacePath.subject=null; renderCanvas()" class="hover:text-brand font-bold ${!workspacePath.subject ? 'text-slate-900 dark:text-white' : 'text-slate-500'}">${workspacePath.semester}</button>`;
        if (workspacePath.subject) bc += ` <span class="text-slate-400 mx-1">/</span> <span class="text-slate-900 dark:text-white font-bold">${workspacePath.subject}</span>`;
        document.getElementById('breadcrumb').innerHTML = bc;

        if (!workspacePath.semester) {
            const semesters = [...new Set(appData.modules.filter(m => String(m.semester).trim() !== '').map(m => String(m.semester).trim()))];
            let addFolderCard = currentUser.role === 'Admin' ? `
                <div onclick="openModuleModal('Semester')" class="eco-card glass-card p-6 rounded-3xl cursor-pointer hover:-translate-y-1 transition-all group flex flex-col justify-center items-center text-center h-48 border border-dashed border-slate-400 dark:border-gray-600">
                    <div class="w-12 h-12 rounded-full bg-slate-200 dark:bg-white/5 flex items-center justify-center mb-3"><svg class="w-6 h-6 text-slate-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg></div>
                    <h3 class="text-sm font-bold text-slate-600 dark:text-gray-400">Add Semester</h3>
                </div>` : '';

            canvas.innerHTML = offlineBanner + `
                <div class="flex flex-col md:flex-row md:justify-between md:items-center mb-8 gap-4">
                    <h1 class="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Ecosystem</h1>
                    <input type="text" id="eco-search" placeholder="Search folders..." class="bg-white dark:bg-black/50 border border-slate-300 dark:border-borderDark rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand w-full md:w-64 text-slate-900 dark:text-white">
                </div>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    ${addFolderCard}
                    ${semesters.map(sem => `
                        <div class="eco-card glass-card p-6 rounded-3xl cursor-pointer hover:-translate-y-1 hover:border-brand/50 transition-all group shadow-sm relative flex flex-col justify-center items-center text-center h-48">
                            ${currentUser.role === 'Admin' ? `<button onclick="event.stopPropagation(); deleteModule('${sem}', null)" class="absolute top-4 right-4 p-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all z-10"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : ''}
                            <div onclick="workspacePath.semester='${sem}'; renderCanvas()" class="w-full h-full flex flex-col justify-center items-center">
                                <svg class="w-14 h-14 mb-4 text-brand opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path></svg>
                                <h3 class="text-lg font-bold text-slate-900 dark:text-white w-full truncate px-2">${sem}</h3>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        else if (workspacePath.semester && !workspacePath.subject) {
            const subjects = [...new Set(appData.modules.filter(m => String(m.semester).trim() === String(workspacePath.semester).trim() && String(m.subject).trim() !== 'General' && String(m.subject).trim() !== '').map(m => String(m.subject).trim()))];
            
            let addFolderCard = currentUser.role === 'Admin' ? `
                <div onclick="openModuleModal('Subject')" class="eco-card glass-card p-6 rounded-3xl cursor-pointer hover:-translate-y-1 transition-all group flex flex-col justify-center items-center text-center h-48 border border-dashed border-slate-400 dark:border-gray-600">
                    <div class="w-12 h-12 rounded-full bg-slate-200 dark:bg-white/5 flex items-center justify-center mb-3"><svg class="w-6 h-6 text-slate-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg></div>
                    <h3 class="text-sm font-bold text-slate-600 dark:text-gray-400">Add Subject</h3>
                </div>` : '';

            canvas.innerHTML = offlineBanner + `
                <div class="flex flex-col md:flex-row md:justify-between md:items-center mb-8 gap-4">
                    <div class="flex items-center gap-4">
                        <button onclick="workspacePath.semester=null; renderCanvas()" class="w-10 h-10 rounded-full bg-white dark:bg-white/5 border border-slate-300 dark:border-borderDark flex items-center justify-center text-slate-900 dark:text-white shrink-0">←</button>
                        <h1 class="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">${workspacePath.semester}</h1>
                    </div>
                    <input type="text" id="eco-search" placeholder="Search subjects..." class="bg-white dark:bg-black/50 border border-slate-300 dark:border-borderDark rounded-xl px-4 py-2.5 text-sm outline-none focus:border-brand w-full md:w-64 text-slate-900 dark:text-white">
                </div>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    ${addFolderCard}
                    ${subjects.map(sub => `
                        <div class="eco-card glass-card p-6 rounded-3xl cursor-pointer hover:-translate-y-1 hover:border-brand/50 transition-all group shadow-sm relative flex flex-col justify-center items-center text-center h-48">
                            ${currentUser.role === 'Admin' ? `<button onclick="event.stopPropagation(); deleteModule('${workspacePath.semester}', '${sub}')" class="absolute top-4 right-4 p-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all z-10"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : ''}
                            <div onclick="workspacePath.subject='${sub}'; renderCanvas()" class="w-full h-full flex flex-col justify-center items-center">
                                <svg class="w-14 h-14 mb-4 text-indigo-500 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path></svg>
                                <h3 class="text-base font-bold text-slate-900 dark:text-white w-full truncate px-2">${sub}</h3>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        else if (workspacePath.subject) {
            const notes = validNotes.filter(n => String(n.subject).trim() === String(workspacePath.subject).trim() && String(n.semester).trim() === String(workspacePath.semester).trim());
            const excels = validExcels.filter(e => String(e.subject).trim() === String(workspacePath.subject).trim() && String(e.semester).trim() === String(workspacePath.semester).trim());
            let adminBtn = currentUser.role === 'Admin' ? `<button onclick="openResourceModal()" class="bg-slate-900 dark:bg-white text-white dark:text-black px-5 py-2.5 rounded-xl font-bold">+ Publish Content</button>` : '';

            canvas.innerHTML = offlineBanner + `
                <div class="flex flex-col md:flex-row md:justify-between md:items-center mb-8 gap-4">
                    <div class="flex items-center gap-4">
                        <button onclick="workspacePath.subject=null; renderCanvas()" class="w-10 h-10 rounded-full bg-white dark:bg-white/5 border border-slate-300 dark:border-borderDark flex items-center justify-center text-slate-900 dark:text-white shrink-0">←</button>
                        <h1 class="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white truncate">${workspacePath.subject}</h1>
                    </div>
                    ${adminBtn}
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div>
                        <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Documentation</h3>
                        <div class="space-y-3">
                            ${notes.map(n => {
                                const isPinned = pinnedResources.some(p => p.link === n.link);
                                const starClass = isPinned ? 'text-yellow-500' : 'text-slate-300 dark:text-gray-600 hover:text-yellow-500';
                                return `
                                <div class="glass-card p-5 rounded-2xl flex items-center justify-between group">
                                    <div class="flex items-center gap-4 truncate">
                                        <div class="w-8 h-8 rounded bg-brand/10 flex items-center justify-center text-brand shrink-0"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg></div>
                                        <span class="text-sm text-slate-900 dark:text-white font-medium truncate">${n.title}</span>
                                    </div>
                                    <div class="flex items-center gap-2 shrink-0 ml-4">
                                        <button onclick="togglePin('Note', '${n.title.replace(/'/g, "\\'")}', '${n.link}', '${n.subject}')" class="${starClass} text-xl transition-colors" title="Quick Pin">★</button>
                                        ${currentUser.role === 'Admin' ? `<button onclick="deleteRecord('Notes', '${n.date}', '${n.title.replace(/'/g, "\\'")}')" class="text-slate-400 hover:text-red-500 p-1.5 transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : ''}
                                        <a href="${n.link}" target="_blank" class="text-[10px] text-brand bg-brand/10 px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider hover:bg-brand hover:text-white">Open</a>
                                    </div>
                                </div>
                            `}).join('') || '<p class="text-sm text-slate-500">No documents.</p>'}
                        </div>
                    </div>
                    <div>
                        <h3 class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Data Sheets</h3>
                        <div class="space-y-3">
                            ${excels.map(e => {
                                const isPinned = pinnedResources.some(p => p.link === e.link);
                                const starClass = isPinned ? 'text-yellow-500' : 'text-slate-300 dark:text-gray-600 hover:text-yellow-500';
                                return `
                                <div class="glass-card p-5 rounded-2xl flex items-center justify-between group">
                                    <div class="flex items-center gap-4 truncate">
                                        <div class="w-8 h-8 rounded bg-green-500/10 flex items-center justify-center text-green-500 shrink-0"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg></div>
                                        <span class="text-sm text-slate-900 dark:text-white font-medium truncate">${e.title}</span>
                                    </div>
                                    <div class="flex items-center gap-2 shrink-0 ml-4">
                                        <button onclick="togglePin('Excel', '${e.title.replace(/'/g, "\\'")}', '${e.link}', '${e.subject}')" class="${starClass} text-xl transition-colors" title="Quick Pin">★</button>
                                        ${currentUser.role === 'Admin' ? `<button onclick="deleteRecord('Excels', '${e.date}', '${e.title.replace(/'/g, "\\'")}')" class="text-slate-400 hover:text-red-500 p-1.5 transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" document.getElementById('sec-a')="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : ''}
                                        <a href="${e.link}" target="_blank" class="text-[10px] text-green-600 dark:text-green-400 bg-green-500/10 px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider hover:bg-green-500 hover:text-white">View</a>
                                    </div>
                                </div>
                            `}).join('') || '<p class="text-sm text-slate-500">No data sheets.</p>'}
                        </div>
                    </div>
                </div>
            `;
        }
        document.getElementById('eco-search')?.addEventListener('input', (e) => { const term = e.target.value.toLowerCase(); document.querySelectorAll('.eco-card').forEach(card => { card.style.display = card.innerText.toLowerCase().includes(term) ? '' : 'none'; }); });
    }
}

// --- ADMIN ACTIONS ---
async function deleteUser(rollNumber) {
    if (!confirm(`Permanently delete student ${rollNumber}?`)) return;
    showToast('Deleting user...', 'success');
    const conditions = { 1: rollNumber };
    const res = await apiCall('deleteData', { role: currentUser.role, tabName: 'Users', conditions });
    if (res && res.success) { showToast('User removed.'); await forceSync(); } else { showToast('Failed to delete', 'error'); }
}

async function toggleUserRole(rollNumber, currentRole) {
    const newRole = currentRole === 'Admin' ? 'Student' : 'Admin';
    if (!confirm(`Change ${rollNumber}'s privilege to ${newRole}?`)) return;
    showToast('Updating privilege...', 'success');
    const res = await apiCall('updateRole', { role: currentUser.role, targetRoll: rollNumber, newRole: newRole });
    if (res && res.success) { showToast('Privilege updated!'); await forceSync(); } else { showToast('Failed to update', 'error'); }
}

function exportCSV() {
    let csvContent = "data:text/csv;charset=utf-8,S.No,Student Name,Roll Number,Email ID\n";
    appData.students.forEach((s, idx) => { csvContent += `${idx + 1},${s.name},${s.rollNumber},${s.email}\n`; });
    const link = document.createElement("a"); link.setAttribute("href", encodeURI(csvContent)); link.setAttribute("download", "Class_Directory.csv");
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

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

async function toggleSystemState(newState) {
    if(!confirm(`Are you sure you want to turn the system ${newState}?`)) return;
    showToast(`Initiating...`, 'success');
    const res = await apiCall('toggleSystemStatus', { role: currentUser.role, status: newState });
    if (res && res.success) { await forceSync(); }
}

async function deleteModule(semester, subject) {
    if (!confirm(`WARNING: Deleting will permanently erase all contents inside. Continue?`)) return;
    showToast('Purging...', 'success');
    const res = await apiCall('deleteModule', { role: currentUser.role, semester, subject });
    if (res && res.success) { await forceSync(); } else { showToast('Failed', 'error'); }
}

async function deleteRecord(tabName, dateStr, title) {
    if (!confirm(`Permanently delete this item?`)) return;
    showToast('Deleting...', 'success');
    const conditions = { 1: title, 3: dateStr };
    const res = await apiCall('deleteData', { role: currentUser.role, tabName, conditions });
    if (res && res.success) { await forceSync(); } else { showToast('Failed', 'error'); }
}

function openResourceModal() { document.getElementById('modal-subtitle').innerText = `${workspacePath.semester} / ${workspacePath.subject}`; document.getElementById('resource-modal').classList.remove('hidden'); setTimeout(() => document.getElementById('resource-modal').classList.remove('opacity-0'), 10); }
function closeModal() { document.getElementById('resource-modal').classList.add('opacity-0'); setTimeout(() => document.getElementById('resource-modal').classList.add('hidden'), 300); }
document.getElementById('add-resource-form')?.addEventListener('submit', async (e) => {
    e.preventDefault(); const btn = document.getElementById('addResourceBtn'); btn.innerText = 'Publishing...'; btn.disabled = true;
    const rowData = [workspacePath.semester, document.getElementById('res-title').value, workspacePath.subject, new Date().toISOString(), document.getElementById('res-link-desc').value];
    const res = await apiCall('addData', { role: currentUser.role, tabName: document.getElementById('res-type').value, rowData });
    if (res && res.success) { showToast('Resource Added!', 'success'); closeModal(); e.target.reset(); await forceSync(); } else { showToast('Failed to add', 'error'); }
    btn.innerText = 'Publish to Ecosystem'; btn.disabled = false;
});

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

// BOOT
if(localStorage.getItem('theme') === 'light') { document.documentElement.classList.remove('dark'); } else { document.documentElement.classList.add('dark'); }
if (localStorage.getItem('session')) { currentUser = JSON.parse(localStorage.getItem('session')); initApp(); } 
else { document.getElementById('auth-layout').classList.remove('opacity-0'); }