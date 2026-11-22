const $ = (id) => document.getElementById(id);
const schemas = {
  events: [
    ['title', 'Event title', 'text', true], ['type', 'Event type', 'text', true],
    ['date', 'Date (leave blank for recurring)', 'date', false], ['location', 'Location', 'text', true],
    ['description', 'Description', 'textarea', true], ['link', 'Event URL', 'url', false],
    ['featured', 'Featured event', 'checkbox', false]
  ],
  team: [
    ['name', 'Member name', 'text', true], ['role', 'Club role', 'text', true],
    ['department', 'Department', 'text', true], ['photo_url', 'Photo URL', 'url', false]
  ],
  gallery: [
    ['title', 'Gallery title', 'text', true], ['category', 'Category', 'text', true],
    ['image_url', 'Image URL (optional)', 'url', false], ['alt_text', 'Accessible image description', 'text', false]
  ]
};
let activeTab = 'events', currentEditId = null, content = [];
const el = (tag, text = '', cls = '') => {
  const node = document.createElement(tag);
  node.textContent = text; if (cls) node.className = cls;
  return node;
};
async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-CSI-Request': 'website', ...(options.headers || {}) }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
function authenticated(email) {
  $('login-section').hidden = true;
  $('dashboard').hidden = false;
  $('admin-identity').textContent = `Signed in as ${email}`;
  switchTab('events');
}
async function loadSession() {
  try { const result = await request('/api/admin/me'); authenticated(result.email); }
  catch { $('login-section').hidden = false; $('dashboard').hidden = true; }
}
$('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector('.form-status');
  const button = form.querySelector('button');
  button.disabled = true; status.textContent = 'Signing in…';
  try {
    const data = await request('/api/admin/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    form.reset(); status.textContent = ''; authenticated(data.email);
  } catch (e) { status.textContent = e.message; }
  finally { button.disabled = false; }
});
$('logout').addEventListener('click', async () => {
  try { await request('/api/admin/logout', { method: 'POST' }); location.reload(); }
  catch (e) { alert(e.message); }
});

function createEditor(record = null) {
  currentEditId = record?.id || null;
  $('editor-title').textContent = `${currentEditId ? 'Edit' : 'Add'} ${activeTab === 'gallery' ? 'gallery item' : activeTab === 'team' ? 'team member' : 'event'}`;
  const fields = $('editor-fields'); fields.replaceChildren();
  schemas[activeTab].forEach(([key, label, type, required]) => {
    const wrapper = el('label', label);
    const control = type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
    control.name = key;
    if (type !== 'textarea') control.type = type;
    control.required = required;
    if (type === 'checkbox') control.checked = Boolean(record?.[key]);
    else control.value = record?.[key] ?? '';
    if (type === 'textarea') { control.rows = 4; control.maxLength = 1200; }
    wrapper.append(control); fields.append(wrapper);
  });
  $('save-button').textContent = currentEditId ? 'Update' : 'Save';
  $('editor-status').textContent = '';
}
function renderList(items) {
  const target = $('content-list'); target.replaceChildren();
  if (!items.length) return target.append(el('p', 'No items yet. Add the first one.', 'muted'));
  items.forEach(item => {
    const row = el('div', '', 'admin-row');
    const text = el('div');
    text.append(el('strong', item.title || item.name));
    text.append(el('small', item.type || item.role || item.category, 'muted'));
    const actions = el('div', '', 'row-actions');
    const edit = el('button', 'Edit', 'mini-button'); edit.type = 'button';
    edit.addEventListener('click', () => { createEditor(item); $('editor-form').scrollIntoView({ behavior: 'smooth' }); });
    const del = el('button', 'Delete', 'mini-button danger'); del.type = 'button';
    del.addEventListener('click', async () => {
      if (!confirm(`Delete "${item.title || item.name}"?`)) return;
      try { await request(`/api/admin/${activeTab}/${item.id}`, { method: 'DELETE' }); await loadContent(); }
      catch (e) { alert(e.message); }
    });
    actions.append(edit, del); row.append(text, actions); target.append(row);
  });
}
async function loadContent() {
  try { content = await request(`/api/${activeTab}`); renderList(content); }
  catch (e) { $('content-list').textContent = e.message; }
}
async function loadSubmissions() {
  const root = $('submission-list'); root.replaceChildren(el('p', 'Loading…', 'muted'));
  try {
    const items = await request('/api/admin/submissions'); root.replaceChildren();
    if (!items.length) return root.append(el('p', 'No submissions yet.', 'muted'));
    items.forEach(item => {
      const row = el('div', '', 'submission-row');
      const top = el('div', '', 'submission-top');
      top.append(el('strong', `${item.name} · ${item.kind.toUpperCase()}`), el('small', `${item.created_at} UTC`, 'muted'));
      row.append(top, el('p', item.email), el('p', `${item.department || 'Contact'} ${item.study_year}`), el('p', item.message || 'No message.'));
      const actions = el('div', '', 'row-actions');
      const label = el('label', 'Status: ');
      const select = document.createElement('select');
      ['new', 'reviewed', 'closed'].forEach(status => {
        const option = el('option', status); option.value = status; option.selected = item.status === status; select.append(option);
      });
      select.addEventListener('change', async () => {
        try { await request(`/api/admin/submissions/${item.id}`, { method: 'PATCH', body: JSON.stringify({ status: select.value }) }); }
        catch (e) { alert(e.message); select.value = item.status; }
      });
      label.append(select); actions.append(label);
      const del = el('button', 'Delete', 'mini-button danger'); del.type = 'button';
      del.addEventListener('click', async () => {
        if (!confirm('Permanently delete this submission?')) return;
        try { await request(`/api/admin/submissions/${item.id}`, { method: 'DELETE' }); loadSubmissions(); }
        catch (e) { alert(e.message); }
      });
      actions.append(del); row.append(actions); root.append(row);
    });
  } catch (e) { root.replaceChildren(el('p', e.message, 'muted')); }
}
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('[data-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
  $('content-panel').hidden = tab === 'submissions';
  $('submissions-panel').hidden = tab !== 'submissions';
  if (tab === 'submissions') loadSubmissions();
  else { createEditor(); loadContent(); }
}
document.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
$('cancel-edit').addEventListener('click', () => createEditor());
$('editor-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget, status = $('editor-status');
  const data = {};
  schemas[activeTab].forEach(([key, , type]) => {
    const control = form.elements.namedItem(key);
    data[key] = type === 'checkbox' ? control.checked : control.value;
  });
  const url = `/api/admin/${activeTab}${currentEditId ? `/${currentEditId}` : ''}`;
  $('save-button').disabled = true; status.textContent = 'Saving…';
  try {
    await request(url, { method: currentEditId ? 'PUT' : 'POST', body: JSON.stringify(data) });
    createEditor(); await loadContent(); status.textContent = 'Saved successfully.';
  } catch (e) { status.textContent = e.message; }
  finally { $('save-button').disabled = false; }
});
loadSession();
