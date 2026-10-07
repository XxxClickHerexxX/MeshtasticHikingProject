let csrfToken = null;

async function ensureCsrfToken() {
  if (csrfToken) return csrfToken;
  const response = await fetch('/api/auth/csrf-token');
  if (!response.ok) throw new Error('Failed to initialize session security token');
  const data = await response.json();
  csrfToken = data.csrfToken;
  return csrfToken;
}

async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const token = method === 'GET' ? null : await ensureCsrfToken();
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(token ? { 'csrf-token': token } : {}), ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function setToast(text, className = '') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.className = className;
  toast.textContent = text;
}

async function loginPage() {
  const form = document.getElementById('loginForm');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    try {
      await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: formData.get('email'), password: formData.get('password') }),
      });
      window.location.href = '/dashboard';
    } catch (error) {
      setToast(error.message, 'danger');
    }
  });
}

function attachLogout() {
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  });
}

async function dashboardPage() {
  const { activeAlerts, openRoutes, totalUsers, suspendedUsers, geolockEnabledUsers, routeStatuses, meshStatus, recentActivity } =
    await api('/api/dashboard');
  document.getElementById('pageContent').innerHTML = `
    <h2>Operational Dashboard</h2>
    <div class="grid two">
      <div class="card"><strong>${activeAlerts}</strong><div>Active Alerts</div></div>
      <div class="card"><strong>${openRoutes}</strong><div>Active Mesh Routes</div></div>
      <div class="card"><strong>${totalUsers}</strong><div>Registered Users</div></div>
      <div class="card"><strong>${geolockEnabledUsers}</strong><div>Geolock Enabled Users</div></div>
    </div>
    <h3>Mesh Status</h3>
    <p>${meshStatus.adapter} adapter · ${meshStatus.connected ? 'Connected' : 'Disconnected'}</p>
    <h3>Route Status</h3>
    <table class="table"><tr><th>Route</th><th>Status</th><th>Nodes</th></tr>${routeStatuses
      .map((r) => `<tr><td>${r.routeId}</td><td>${r.status}</td><td>${r.nodeCount}</td></tr>`)
      .join('')}</table>
    <h3>Recent Activity</h3>
    <ul>${recentActivity.map((a) => `<li>${a.eventType || a.event_type} (${new Date(a.createdAt || a.created_at).toLocaleString()})</li>`).join('')}</ul>
    <p class="hint">Suspended users: ${suspendedUsers}</p>
  `;
}

async function alertsPage() {
  const content = document.getElementById('pageContent');
  const me = window.__USER__ || {};
  const canManage = ['Administrator', 'Coordinator'].includes(me.role);

  const render = async () => {
    const { alerts } = await api('/api/alerts');
    content.innerHTML = `
      <h2>Hiker Alerts</h2>
      <form id="alertForm" class="grid two">
        <select name="type">${['Injury', 'Lost', 'Off track', 'Bad weather', 'Emergency', 'Other']
          .map((t) => `<option>${t}</option>`)
          .join('')}</select>
        <select name="priority">${['Low', 'Medium', 'High', 'Critical'].map((t) => `<option>${t}</option>`).join('')}</select>
        <input name="locationDescription" placeholder="Location description" required />
        <input name="message" placeholder="Message" required />
        <input name="latitude" type="number" step="any" placeholder="Latitude (optional)" />
        <input name="longitude" type="number" step="any" placeholder="Longitude (optional)" />
        <label><input type="checkbox" name="confirmation" /> Confirm emergency/critical submission</label>
        <button type="submit">Submit alert</button>
      </form>
      <h3>Current alerts</h3>
      <div class="grid">${alerts
        .map(
          (a) => `<div class="card">
            <strong>${a.type}</strong> · ${a.priority} · ${a.status}<br/>
            ${a.locationDescription}<br/>
            ${a.message}<br/>
            <small>Reporter: ${a.reporterUserId}, ${new Date(a.createdAt).toLocaleString()}</small>
            ${canManage ? `<div><button data-ack="${a.id}">Acknowledge</button> <button data-resolve="${a.id}">Resolve</button></div>
            <form data-action="${a.id}" class="stack"><input name="actionType" placeholder="Action type" /><input name="notes" placeholder="Notes" /><button type="submit">Record Action</button></form>` : ''}
            <details><summary>Action history</summary><ul>${(a.actions || [])
              .map((x) => `<li>${x.actionType}: ${x.notes} (${new Date(x.createdAt).toLocaleString()})</li>`)
              .join('')}</ul></details>
          </div>`
        )
        .join('')}</div>
    `;

    document.getElementById('alertForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(event.target);
      const type = formData.get('type');
      const priority = formData.get('priority');
      if ((type === 'Emergency' || priority === 'Critical') && !formData.get('confirmation')) {
        setToast('Emergency/Critical alerts require explicit confirmation checkbox.', 'warn');
        return;
      }
      await api('/api/alerts', {
        method: 'POST',
        body: JSON.stringify({
          type,
          priority,
          locationDescription: formData.get('locationDescription'),
          message: formData.get('message'),
          latitude: formData.get('latitude') ? Number(formData.get('latitude')) : null,
          longitude: formData.get('longitude') ? Number(formData.get('longitude')) : null,
          confirmation: Boolean(formData.get('confirmation')),
        }),
      });
      setToast('Alert submitted.');
      await render();
    });

    content.querySelectorAll('[data-ack]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        await api(`/api/alerts/${btn.dataset.ack}/acknowledge`, { method: 'PATCH' });
        await render();
      })
    );

    content.querySelectorAll('[data-resolve]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        await api(`/api/alerts/${btn.dataset.resolve}/resolve`, { method: 'PATCH' });
        await render();
      })
    );

    content.querySelectorAll('form[data-action]').forEach((form) =>
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const fd = new FormData(form);
        await api(`/api/alerts/${form.dataset.action}/actions`, {
          method: 'POST',
          body: JSON.stringify({ actionType: fd.get('actionType'), notes: fd.get('notes') }),
        });
        await render();
      })
    );
  };

  await render();
}

async function geolockPage() {
  const content = document.getElementById('pageContent');
  const { geofences } = await api('/api/geofences');
  content.innerHTML = `
    <h2>Geolock</h2>
    <p class="hint">Stores only current policy checks and audit events, not full location history.</p>
    <pre>${JSON.stringify(geofences, null, 2)}</pre>
    <form id="checkGeo" class="grid two">
      <input name="latitude" type="number" step="any" placeholder="Latitude" required />
      <input name="longitude" type="number" step="any" placeholder="Longitude" required />
      <input name="accuracyMeters" type="number" step="any" placeholder="Accuracy meters" required />
      <input name="timestamp" type="datetime-local" required />
      <button type="submit">Check geolock</button>
    </form>
    <pre id="geoResult"></pre>
  `;

  document.getElementById('checkGeo').addEventListener('submit', async (event) => {
    event.preventDefault();
    const fd = new FormData(event.target);
    const result = await api('/api/geolock/check', {
      method: 'POST',
      body: JSON.stringify({
        latitude: Number(fd.get('latitude')),
        longitude: Number(fd.get('longitude')),
        accuracyMeters: Number(fd.get('accuracyMeters')),
        timestamp: new Date(fd.get('timestamp')).toISOString(),
      }),
    });
    document.getElementById('geoResult').textContent = JSON.stringify(result, null, 2);
  });
}

async function meshesPage() {
  const content = document.getElementById('pageContent');
  const me = window.__USER__ || {};
  const canManage = ['Administrator', 'Coordinator'].includes(me.role);

  const render = async () => {
    const { routes } = await api('/api/routes');
    content.innerHTML = `
      <h2>Mesh Routes</h2>
      ${canManage ? `<form id="routeForm" class="grid two">
        <input name="name" placeholder="Route name" required />
        <input name="routeId" placeholder="Route ID" required />
        <input name="channelTopic" placeholder="Channel/topic metadata" required />
        <input name="nodeCount" type="number" placeholder="Node count" required />
        <input name="status" placeholder="Status" required />
        <input name="approvedNodes" placeholder="Approved nodes comma-separated" />
        <button type="submit">Add route</button>
      </form>` : ''}
      <table class="table"><tr><th>Name</th><th>ID</th><th>Topic</th><th>Nodes</th><th>Status</th><th>Active</th></tr>
      ${routes
        .map(
          (r) => `<tr><td>${r.name}</td><td>${r.routeId}</td><td>${r.channelTopic}</td><td>${r.nodeCount}</td><td>${r.status}</td><td>${r.active}</td></tr>`
        )
        .join('')}
      </table>
    `;

    document.getElementById('routeForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fd = new FormData(event.target);
      await api('/api/routes', {
        method: 'POST',
        body: JSON.stringify({
          name: fd.get('name'),
          routeId: fd.get('routeId'),
          channelTopic: fd.get('channelTopic'),
          nodeCount: Number(fd.get('nodeCount')),
          status: fd.get('status'),
          approvedNodes: (fd.get('approvedNodes') || '')
            .toString()
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean),
          active: true,
        }),
      });
      await render();
    });
  };

  await render();
}

async function usersPage() {
  const content = document.getElementById('pageContent');
  const me = window.__USER__ || {};
  if (!['Administrator', 'Coordinator'].includes(me.role)) {
    content.innerHTML = '<h2>Users</h2><p class="danger">You are not authorized to manage users.</p>';
    return;
  }

  const render = async () => {
    const { users } = await api('/api/users');
    content.innerHTML = `
      <h2>User Management</h2>
      <form id="userForm" class="grid two">
        <input name="displayName" placeholder="Display name" required />
        <input name="email" type="email" placeholder="Email" required />
        <input name="password" type="password" placeholder="Temporary password" required />
        <select name="role">${['Administrator', 'Coordinator', 'Hiker', 'Viewer']
          .map((r) => `<option>${r}</option>`)
          .join('')}</select>
        <label><input type="checkbox" name="requiresGeolock" /> Requires geolock</label>
        <button type="submit">Add user</button>
      </form>
      <table class="table"><tr><th>Name</th><th>Email</th><th>Role</th><th>Geolock</th><th>Suspended</th><th>Action</th></tr>
      ${users
        .map(
          (u) => `<tr><td>${u.displayName}</td><td>${u.email}</td><td>${u.role}</td><td>${u.requiresGeolock}</td><td>${u.suspended}</td><td><button data-toggle="${u.id}">${u.suspended ? 'Unsuspend' : 'Suspend'}</button></td></tr>`
        )
        .join('')}</table>
    `;

    document.getElementById('userForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const fd = new FormData(event.target);
      await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          displayName: fd.get('displayName'),
          email: fd.get('email'),
          password: fd.get('password'),
          role: fd.get('role'),
          requiresGeolock: Boolean(fd.get('requiresGeolock')),
        }),
      });
      await render();
    });

    content.querySelectorAll('[data-toggle]').forEach((button) =>
      button.addEventListener('click', async () => {
        const target = users.find((u) => String(u.id) === button.dataset.toggle);
        await api(`/api/users/${target.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ suspended: !target.suspended }),
        });
        await render();
      })
    );
  };

  await render();
}

async function settingsPage() {
  const content = document.getElementById('pageContent');
  let html = '<h2>Settings & Audit</h2><p class="hint">MQTT credentials are backend-only and never exposed to the browser.</p>';
  try {
    const { auditLogs } = await api('/api/audit-logs');
    html += `<ul>${auditLogs
      .map((log) => `<li>${log.eventType} · ${new Date(log.createdAt).toLocaleString()} · target: ${log.targetType}</li>`)
      .join('')}</ul>`;
  } catch {
    html += '<p>Audit log access requires Coordinator or Administrator.</p>';
  }
  content.innerHTML = html;
}

(async function init() {
  const page = window.__PAGE__;
  if (page === 'login') return loginPage();
  attachLogout();
  const handlers = {
    dashboard: dashboardPage,
    alerts: alertsPage,
    geolock: geolockPage,
    meshes: meshesPage,
    users: usersPage,
    settings: settingsPage,
  };
  try {
    await handlers[page]?.();
  } catch (error) {
    setToast(error.message, 'danger');
  }
})();
