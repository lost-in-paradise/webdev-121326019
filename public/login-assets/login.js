const signinSection = document.getElementById('signin-section');
const signupSection = document.getElementById('signup-section');
const errorDiv = document.getElementById('error-message');

document.getElementById('to-signup').addEventListener('click', (e) => {
  e.preventDefault();
  errorDiv.textContent = '';
  errorDiv.style.display = 'none';
  signinSection.style.display = 'none';
  signupSection.style.display = 'block';
});

document.getElementById('to-signin').addEventListener('click', (e) => {
  e.preventDefault();
  errorDiv.textContent = '';
  errorDiv.style.display = 'none';
  signupSection.style.display = 'none';
  signinSection.style.display = 'block';
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  errorDiv.style.display = 'none';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      window.location.href = data.redirect || '/events';
    } else {
      errorDiv.textContent = data.error || 'Login failed';
      errorDiv.style.display = 'block';
    }
  } catch (err) {
    errorDiv.textContent = 'An unexpected error occurred';
    errorDiv.style.display = 'block';
  }
});

document.getElementById('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  errorDiv.style.display = 'none';

  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      window.location.href = data.redirect || '/events';
    } else {
      errorDiv.textContent = data.error || 'Sign up failed';
      errorDiv.style.display = 'block';
    }
  } catch (err) {
    errorDiv.textContent = 'An unexpected error occurred';
    errorDiv.style.display = 'block';
  }
});
