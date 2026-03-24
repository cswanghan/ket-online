// Auth guard: redirect to login if not authenticated
// Include this script at the top of any page that requires login
(function() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    // Verify token is still valid (async, non-blocking for UX)
    fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + token } })
        .then(r => {
            if (!r.ok) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login.html';
            }
        })
        .catch(() => {
            // Network error - allow offline usage, don't kick out
        });
})();
