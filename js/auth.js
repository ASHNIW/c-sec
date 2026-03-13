// js/auth.js

function checkAuth() {
    const user = localStorage.getItem('user');
    const path = window.location.pathname;
    const isLoginPage = path.endsWith('index.html') || path === '/' || path.endsWith('class-portal/');
    
    if (!user && !isLoginPage) {
        window.location.href = 'index.html';
    } else if (user && isLoginPage) {
        window.location.href = 'dashboard.html';
    }
}

window.logout = function() {
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

// Run check immediately
checkAuth();

// Inject user details into the UI when pages load
document.addEventListener("DOMContentLoaded", () => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
        const user = JSON.parse(userStr);
        const nameDisplay = document.getElementById('userNameDisplay');
        const adminMenu = document.getElementById('adminMenu');
        
        if (nameDisplay) nameDisplay.textContent = user.name;
        if (adminMenu && user.role === 'Admin') adminMenu.classList.remove('hidden');
    }
});