const API_URL = 'https://script.google.com/macros/s/AKfycbzA0EXeir55_X1U0yQBwFd9vSRkF121h-1usoRFJL5LSuhcKsMg44T9KwVkPDNq7GR1oQ/exec';

async function apiCall(action, data = {}) {
  try {
    const token = localStorage.getItem('adminToken');
    const payload = { action, ...data };
    if (token) payload.token = token;

    const response = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    return await response.json();
  } catch (err) {
    console.error(`[API] ${action} failed:`, err);
    return { success: false, message: "Server connection failed." };
  }
}
