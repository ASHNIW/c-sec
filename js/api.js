const API_URL = 'https://script.google.com/macros/s/AKfycbzpGvB3M39eVRsxwIbh9N4bV7IRbs_0kxUW8QL_guya9tTdZqeyg4iFipnYXqtKP05jUQ/exec';

async function apiCall(action, payload = {}) {
    try {
        const token = localStorage.getItem('adminToken') || '';
        
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ action, token, ...payload })
        });
        return await response.json();
    } catch (error) {
        console.error("API Error:", error);
        return { success: false, message: 'Network error. Please try again.' };
    }
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}
