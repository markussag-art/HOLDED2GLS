/* HOLDED2GLS — Frontend */

var SENT_STAGE_ID = '698cbc438d534d720403ffa3';
var shipments = [];
var appConfig = null;
var METHODS = [];

// ── API ──────────────────────────────────────────────────────────

async function api(method, path, body) {
  var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  var res = await fetch('/api' + path, opts);
  var data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function showToast(msg, type) {
  var c = document.getElementById('toast-container');
  var t = document.createElement('div');
  t.className = 'toast ' + (type || 'info');
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(function() { t.remove(); }, 5000);
}

function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// ── Load config ──────────────────────────────────────────────────

async function loadConfig() {
  try {
    appConfig = await api('GET', '/config');
    METHODS = appConfig.shippingMethods || [];
    var bar = document.getElementById('sender-bar');
    var s = appConfig.sender;
    bar.innerHTML = '<strong>Sender:</strong> ' + esc(s.name) + ' &mdash; ' + esc(s.address) + ', ' + esc(s.city) + ' &mdash; NIF: ' + esc(s.taxId);
    bar.style.display = '';
  } catch (e) { /* config endpoint optional */ }
}

// ── Load & render ────────────────────────────────────────────────

async function loadShipments() {
  try { shipments = await api('GET', '/shipments'); renderTable(); renderStats(); }
  catch (err) { showToast('Failed to load: ' + err.message, 'error'); }
}

function renderStats() {
  document.getElementById('stat-total').textContent = shipments.length;
  document.getElementById('stat-pending').textContent = shipments.filter(function(s) { return s.localStatus === 'PENDING'; }).length;
  document.getElementById('stat-labeled').textContent = shipments.filter(function(s) { return s.localStatus === 'LABELED'; }).length;
  document.getElementById('stat-sent').textContent = shipments.filter(function(s) { return s.localStatus === 'SENT_BY_API'; }).length;
  document.getElementById('stat-errors').textContent = shipments.filter(function(s) {
    return s.holdedTrackingSyncStatus === 'ERROR' || s.holdedCustomFieldSyncStatus === 'ERROR' || s.holdedStageSyncStatus === 'ERROR';
  }).length;
}

function renderTable() {
  var tbody = document.getElementById('shipments-body');
  if (!shipments.length) {
    tbody.innerHTML = '<tr><td colspan="9"><div class="empty-state"><p>No shipments. Click <strong>Sync Waybills</strong>.</p></div></td></tr>';
    return;
  }
  tbody.innerHTML = shipments.map(function(s) {
    var methodLabel = '';
    if (s.shippingMethod) { var m = METHODS.find(function(x) { return x.code === s.shippingMethod; }); methodLabel = m ? m.label.split(' - ')[0] : s.shippingMethod; }
    return '<tr class="clickable" ondblclick="openDetail(\'' + s.id + '\')">' +
      '<td><strong>' + esc(s.waybillNumber || s.holdedDocumentId.substring(0,8)) + '</strong></td>' +
      '<td>' + esc(s.recipientCommercialName || s.recipientName) +
        (s.recipientCommercialName && s.recipientName ? '<br><span style="color:var(--text-muted);font-size:0.7rem">' + esc(s.recipientName) + '</span>' : '') +
        '<br><span style="color:var(--text-muted);font-size:0.7rem">' + esc(s.recipientCity) + '</span></td>' +
      '<td>' + esc(s.recipientCountry) + '</td>' +
      '<td><span style="font-size:0.75rem">' + esc(methodLabel) + '</span></td>' +
      '<td>' + renderTracking(s) + '</td>' +
      '<td>' + renderStatusBadge(s) + '</td>' +
      '<td>' + renderSyncSteps(s) + '</td>' +
      '<td>' + renderEtapa(s) + '</td>' +
      '<td class="actions-cell">' + renderActions(s) + '</td>' +
    '</tr>';
  }).join('');
}

function renderTracking(s) {
  if (!s.trackingNumber) return '<span style="color:var(--text-muted)">—</span>';
  return s.trackingUrl
    ? '<a href="' + esc(s.trackingUrl) + '" target="_blank" style="color:var(--primary);font-size:0.8rem">' + esc(s.trackingNumber) + '</a>'
    : '<span style="font-size:0.8rem">' + esc(s.trackingNumber) + '</span>';
}

function renderStatusBadge(s) {
  var map = { SENT_BY_API: ['badge-sent','Sent by API'], LABELED: ['badge-labeled','Labeled'], PENDING: ['badge-pending','Pending'], ERROR: ['badge-error','Error'] };
  var m = map[s.localStatus] || ['badge-pending', s.localStatus];
  return '<span class="badge ' + m[0] + '">' + m[1] + '</span>';
}

function renderSyncSteps(s) {
  function step(status, label) {
    var cls = status === 'SYNCED' ? 'synced' : (status === 'ERROR' ? 'error' : 'pending');
    return '<span class="sync-step"><span class="dot ' + cls + '" title="' + label + ': ' + status + '"></span>' + label + '</span>';
  }
  return '<div class="sync-steps">' +
    step(s.holdedTrackingSyncStatus, 'Seg.') +
    step(s.holdedCustomFieldSyncStatus, 'CF') +
    step(s.holdedStageSyncStatus, 'Etapa') +
  '</div>';
}

function renderEtapa(s) {
  if (s.holdedStageIdLastSet === SENT_STAGE_ID && s.holdedStageSyncStatus === 'SYNCED') {
    return '<span class="etapa-badge">Enviado por API GLS</span>';
  }
  return '<span style="color:var(--text-muted);font-size:0.75rem">—</span>';
}

function renderActions(s) {
  var id = s.id;
  var h = '<div class="dropdown"><button class="btn btn-sm" onclick="event.stopPropagation();toggleDropdown(this)">Actions</button><div class="dropdown-menu">';
  h += '<button class="dropdown-item" onclick="openDetail(\'' + id + '\')">Open Detail</button>';
  if (s.localStatus === 'PENDING') h += '<button class="dropdown-item" onclick="generateLabel(\'' + id + '\')">Generate Label</button>';
  if (s.trackingNumber) {
    h += '<button class="dropdown-item" onclick="downloadLabel(\'' + id + '\')">Download Label</button>';
    h += '<button class="dropdown-item" onclick="regenerateLabel(\'' + id + '\')">Regenerate Label</button>';
    h += '<div class="dropdown-divider"></div>';
  }
  var hasErr = s.holdedTrackingSyncStatus === 'ERROR' || s.holdedCustomFieldSyncStatus === 'ERROR' || s.holdedStageSyncStatus === 'ERROR';
  if (hasErr || (s.trackingNumber && s.localStatus !== 'SENT_BY_API')) {
    h += '<button class="dropdown-item" onclick="retryAllSync(\'' + id + '\')">Retry All Holded Sync</button>';
    h += '<div class="dropdown-divider"></div>';
  }
  if (s.trackingNumber) h += '<button class="dropdown-item text-danger" onclick="deleteTrackingAction(\'' + id + '\')">Delete Tracking</button>';
  h += '</div></div>';
  return h;
}

// ── Dropdown ─────────────────────────────────────────────────────

function toggleDropdown(btn) {
  document.querySelectorAll('.dropdown-menu.show').forEach(function(m) { if (m !== btn.nextElementSibling) m.classList.remove('show'); });
  btn.nextElementSibling.classList.toggle('show');
}
document.addEventListener('click', function(e) {
  if (!e.target.closest('.dropdown')) document.querySelectorAll('.dropdown-menu.show').forEach(function(m) { m.classList.remove('show'); });
});

// ── Detail modal ─────────────────────────────────────────────────

async function openDetail(id) {
  var s = shipments.find(function(x) { return x.id === id; });
  if (!s) return;
  document.getElementById('detail-title').textContent = 'Waybill ' + (s.waybillNumber || s.holdedDocumentId.substring(0,8));
  var body = document.getElementById('detail-body');

  // Recipient info
  var html = '<div class="detail-section"><h3>Recipient</h3><div class="detail-grid">' +
    field('Commercial Name', s.recipientCommercialName) +
    field('Contact Name', s.recipientName) +
    field('Address', s.recipientAddress) +
    field('City', s.recipientCity) +
    field('Province', s.recipientProvince) +
    field('Postcode', s.recipientPostcode) +
    field('Country', s.recipientCountry) +
    field('Phone', s.recipientPhone) +
    field('Email', s.recipientEmail) +
  '</div></div>';

  // Shipping params form (only if PENDING)
  if (s.localStatus === 'PENDING') {
    html += '<div class="detail-section"><h3>Shipping Parameters</h3>' +
      '<div class="form-row">' +
        '<div class="form-group"><label>Weight (kg)</label><input type="number" id="d-weight" step="0.1" min="0.1" value="' + (s.weight || 1) + '"></div>' +
        '<div class="form-group"><label>Packages</label><input type="number" id="d-packages" min="1" value="' + (s.packages || 1) + '"></div>' +
        '<div class="form-group"><label>Shipping Method</label><select id="d-method">' + methodOptions(s.shippingMethod) + '</select></div>' +
      '</div>' +
      '<div class="form-row"><div class="form-group"><label>Delivery Notes</label><input type="text" id="d-notes" value="' + esc(s.deliveryNotes || '') + '" placeholder="e.g. Entregar por la mañana"></div></div>' +
      '<div class="check-row"><label><input type="checkbox" id="d-morning" ' + (s.deliveryNotes && s.deliveryNotes.indexOf('mañana') >= 0 ? 'checked' : '') + '> Entregar por la mañana</label></div>' +
      '<div style="display:flex;gap:0.5rem;margin-top:0.75rem">' +
        '<button class="btn btn-primary btn-sm" onclick="saveParamsAndGenerate(\'' + id + '\')">Save & Generate Label</button>' +
        '<button class="btn btn-sm" onclick="saveParams(\'' + id + '\')">Save Params</button>' +
        '<button class="btn btn-sm" onclick="runPreflight(\'' + id + '\')">Preflight Check</button>' +
      '</div>' +
      '<div id="preflight-result"></div>' +
    '</div>';
  }

  // Tracking info
  if (s.trackingNumber) {
    html += '<div class="detail-section"><h3>Tracking</h3><div class="detail-grid">' +
      field('Tracking Number', s.trackingNumber) +
      field('Tracking URL', s.trackingUrl ? '<a href="' + esc(s.trackingUrl) + '" target="_blank">' + esc(s.trackingUrl) + '</a>' : '—') +
      field('Expedition ID', s.expeditionId || '—') +
      field('Label PDF', s.labelPdfPath ? '<a href="/api/shipments/' + id + '/label" target="_blank">Download</a>' : '—') +
    '</div></div>';
  }

  // Sync status checklist
  html += '<div class="detail-section"><h3>Holded Sync Status</h3><div class="detail-grid">' +
    syncField('Seguimiento', s.holdedTrackingSyncStatus, s.holdedTrackingSyncError) +
    syncField('Custom Field', s.holdedCustomFieldSyncStatus, s.holdedCustomFieldSyncError) +
    syncField('Etapa', s.holdedStageSyncStatus, s.holdedStageSyncError) +
    field('Last Stage Set', s.holdedStageIdLastSet === SENT_STAGE_ID ? 'Enviado por API GLS' : (s.holdedStageIdLastSet || '—')) +
  '</div></div>';

  // Debug panel
  if (s.glsRawResponse) {
    html += '<div class="debug-toggle" onclick="this.nextElementSibling.classList.toggle(\'show\')">GLS Debug Response (click to toggle)</div>';
    var pretty = ''; try { pretty = JSON.stringify(JSON.parse(s.glsRawResponse), null, 2); } catch(e) { pretty = s.glsRawResponse; }
    html += '<div class="debug-panel">' + esc(pretty) + '</div>';
  }

  body.innerHTML = html;
  document.getElementById('detail-modal').style.display = '';
}

function closeDetail() { document.getElementById('detail-modal').style.display = 'none'; }

function field(label, value) {
  return '<div class="detail-field"><div class="lbl">' + esc(label) + '</div><div class="val">' + (value || '—') + '</div></div>';
}

function syncField(label, status, error) {
  var cls = status === 'SYNCED' ? 'synced' : (status === 'ERROR' ? 'error' : 'pending');
  var val = '<span class="sync-step"><span class="dot ' + cls + '"></span> ' + status + '</span>';
  if (error) val += '<br><span style="font-size:0.7rem;color:var(--danger)">' + esc(error) + '</span>';
  return '<div class="detail-field"><div class="lbl">' + esc(label) + '</div><div class="val">' + val + '</div></div>';
}

function methodOptions(current) {
  var opts = '<option value="">-- Select --</option>';
  METHODS.forEach(function(m) {
    opts += '<option value="' + m.code + '"' + (m.code === current ? ' selected' : '') + '>' + esc(m.label) + '</option>';
  });
  return opts;
}

// ── Detail actions ───────────────────────────────────────────────

async function saveParams(id) {
  var notes = document.getElementById('d-notes').value;
  if (document.getElementById('d-morning').checked && notes.indexOf('mañana') < 0) {
    notes = notes ? notes + '; Entregar por la mañana' : 'Entregar por la mañana';
  }
  try {
    await api('PUT', '/shipments/' + id + '/params', {
      weight: parseFloat(document.getElementById('d-weight').value) || 1,
      packages: parseInt(document.getElementById('d-packages').value) || 1,
      shippingMethod: document.getElementById('d-method').value,
      deliveryNotes: notes,
    });
    showToast('Parameters saved', 'success');
    await loadShipments();
  } catch (err) { showToast('Save failed: ' + err.message, 'error'); }
}

async function saveParamsAndGenerate(id) {
  await saveParams(id);
  closeDetail();
  await generateLabel(id);
}

async function runPreflight(id) {
  try {
    var result = await api('GET', '/shipments/' + id + '/preflight');
    var el = document.getElementById('preflight-result');
    if (result.ok) {
      el.innerHTML = '<div style="color:var(--success);font-size:0.875rem;margin-top:0.5rem">All checks passed</div>';
    } else {
      el.innerHTML = '<div class="preflight-issues">' + result.issues.map(function(i) {
        return '<div class="issue"><strong>' + esc(i.field) + ':</strong> ' + esc(i.message) + '</div>';
      }).join('') + '</div>';
    }
  } catch (err) { showToast('Preflight failed: ' + err.message, 'error'); }
}

// ── Main actions ─────────────────────────────────────────────────

async function syncWaybills() {
  var btn = document.getElementById('btn-sync');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Syncing...';
  try {
    var r = await api('POST', '/shipments/sync');
    showToast('Synced ' + r.synced + ' waybill(s)', 'success');
    await loadShipments();
  } catch (err) { showToast('Sync failed: ' + err.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Sync Waybills'; }
}

async function generateLabel(id) {
  if (!confirm('Generate GLS label?')) return;
  try {
    var r = await api('POST', '/shipments/' + id + '/generate-label');
    if (r.errors && r.errors.length) showToast('Label generated with warnings: ' + r.errors.join('; '), 'error');
    else showToast('Label generated and Holded synced', 'success');
    await loadShipments();
  } catch (err) { showToast('Label generation failed: ' + err.message, 'error'); }
}

async function regenerateLabel(id) {
  if (!confirm('Regenerate label? Creates new GLS shipment.')) return;
  try {
    var r = await api('POST', '/shipments/' + id + '/regenerate-label');
    if (r.errors && r.errors.length) showToast('Regenerated with warnings: ' + r.errors.join('; '), 'error');
    else showToast('Label regenerated', 'success');
    await loadShipments();
  } catch (err) { showToast('Regeneration failed: ' + err.message, 'error'); }
}

async function deleteTrackingAction(id) {
  if (!confirm('Delete tracking? Clears Holded fields.')) return;
  try {
    await api('POST', '/shipments/' + id + '/delete-tracking');
    showToast('Tracking deleted', 'success');
    await loadShipments();
  } catch (err) { showToast('Delete failed: ' + err.message, 'error'); }
}

function downloadLabel(id) { window.open('/api/shipments/' + id + '/label', '_blank'); }

async function retryAllSync(id) {
  try {
    var r = await api('POST', '/shipments/' + id + '/retry-all-sync');
    if (r.errors && r.errors.length) showToast('Partial: ' + r.errors.join('; '), 'error');
    else showToast('All Holded sync completed', 'success');
    await loadShipments();
  } catch (err) { showToast('Retry failed: ' + err.message, 'error'); }
}

// ── Init ─────────────────────────────────────────────────────────

loadConfig();
loadShipments();
