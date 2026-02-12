/* HOLDED2GLS — Frontend */

const SENT_STAGE_ID = '698cbc438d534d720403ffa3';
let shipments = [];

// ── API helpers ──────────────────────────────────────────────────

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Toast notifications ──────────────────────────────────────────

function showToast(message, type) {
  type = type || 'info';
  var container = document.getElementById('toast-container');
  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 5000);
}

// ── Load & render ────────────────────────────────────────────────

async function loadShipments() {
  try {
    shipments = await api('GET', '/shipments');
    renderTable();
    renderStats();
  } catch (err) {
    showToast('Failed to load shipments: ' + err.message, 'error');
  }
}

function renderStats() {
  document.getElementById('stat-total').textContent = shipments.length;
  document.getElementById('stat-pending').textContent = shipments.filter(function(s) { return s.localStatus === 'PENDING'; }).length;
  document.getElementById('stat-labeled').textContent = shipments.filter(function(s) { return s.localStatus === 'LABELED'; }).length;
  document.getElementById('stat-sent').textContent = shipments.filter(function(s) { return s.localStatus === 'SENT_BY_API'; }).length;
  document.getElementById('stat-errors').textContent = shipments.filter(function(s) {
    return s.holdedTrackingSyncStatus === 'ERROR' ||
           s.holdedCustomFieldSyncStatus === 'ERROR' ||
           s.holdedStageSyncStatus === 'ERROR';
  }).length;
}

function renderTable() {
  var tbody = document.getElementById('shipments-body');

  if (shipments.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8"><div class="empty-state"><p>No shipments found. Click <strong>Sync Waybills</strong> to fetch from Holded.</p></div></td></tr>';
    return;
  }

  tbody.innerHTML = shipments.map(function(s) {
    return '<tr>' +
      '<td><strong>' + esc(s.holdedDocumentId.substring(0, 8)) + '...</strong><br><span style="color:var(--text-muted);font-size:0.75rem">' + esc(s.holdedDocType) + '</span></td>' +
      '<td>' + esc(s.recipientName) + '<br><span style="color:var(--text-muted);font-size:0.75rem">' + esc(s.recipientCity) + '</span></td>' +
      '<td>' + esc(s.recipientCountry) + '</td>' +
      '<td>' + renderTracking(s) + '</td>' +
      '<td>' + renderStatusBadge(s) + '</td>' +
      '<td>' + renderSyncIndicators(s) + '</td>' +
      '<td>' + renderEtapa(s) + '</td>' +
      '<td class="actions-cell">' + renderActions(s) + '</td>' +
    '</tr>';
  }).join('');
}

function esc(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderTracking(s) {
  if (!s.trackingNumber) return '<span style="color:var(--text-muted)">—</span>';
  var link = s.trackingUrl
    ? '<a href="' + esc(s.trackingUrl) + '" target="_blank" style="color:var(--primary)">' + esc(s.trackingNumber) + '</a>'
    : esc(s.trackingNumber);
  return link;
}

function renderStatusBadge(s) {
  var cls = 'badge-pending';
  var label = s.localStatus;
  if (s.localStatus === 'SENT_BY_API') { cls = 'badge-sent'; label = 'Sent by API'; }
  else if (s.localStatus === 'LABELED') { cls = 'badge-labeled'; label = 'Labeled'; }
  else if (s.localStatus === 'ERROR') { cls = 'badge-error'; label = 'Error'; }
  else if (s.localStatus === 'PENDING') { cls = 'badge-pending'; label = 'Pending'; }
  return '<span class="badge ' + cls + '">' + label + '</span>';
}

function renderSyncIndicators(s) {
  function dot(status, label) {
    var cls = status === 'SYNCED' ? 'synced' : (status === 'ERROR' ? 'error' : 'pending');
    return '<span class="sync-label"><span class="sync-dot ' + cls + '" title="' + label + ': ' + status + '"></span>' + label + '</span>';
  }
  return '<div class="sync-indicators">' +
    dot(s.holdedTrackingSyncStatus, 'Seguimiento') +
    dot(s.holdedCustomFieldSyncStatus, 'Custom Field') +
    dot(s.holdedStageSyncStatus, 'Etapa') +
  '</div>';
}

function renderEtapa(s) {
  if (s.holdedStageIdLastSet === SENT_STAGE_ID && s.holdedStageSyncStatus === 'SYNCED') {
    return '<span class="etapa-badge">Enviado por API GLS</span>';
  }
  return '<span style="color:var(--text-muted);font-size:0.8125rem">—</span>';
}

function renderActions(s) {
  var id = s.id;
  var html = '<div class="dropdown">' +
    '<button class="btn btn-sm" onclick="toggleDropdown(this)">Actions</button>' +
    '<div class="dropdown-menu">';

  if (s.localStatus === 'PENDING') {
    html += '<button class="dropdown-item" onclick="generateLabel(\'' + id + '\')">Generate Label</button>';
  }

  if (s.trackingNumber) {
    html += '<button class="dropdown-item" onclick="downloadLabel(\'' + id + '\')">Download Label</button>';
    html += '<button class="dropdown-item" onclick="regenerateLabel(\'' + id + '\')">Regenerate Label</button>';
    html += '<div class="dropdown-divider"></div>';
  }

  // Retry sync options — show if any sync step has error
  var hasErrors = s.holdedTrackingSyncStatus === 'ERROR' ||
                  s.holdedCustomFieldSyncStatus === 'ERROR' ||
                  s.holdedStageSyncStatus === 'ERROR';

  if (hasErrors || (s.trackingNumber && s.localStatus !== 'SENT_BY_API')) {
    html += '<button class="dropdown-item" onclick="retryAllSync(\'' + id + '\')">Retry All Holded Sync</button>';

    if (s.holdedTrackingSyncStatus === 'ERROR') {
      html += '<button class="dropdown-item" onclick="retryTrackingSync(\'' + id + '\')">Retry Seguimiento</button>';
    }
    if (s.holdedCustomFieldSyncStatus === 'ERROR') {
      html += '<button class="dropdown-item" onclick="retryCustomFieldSync(\'' + id + '\')">Retry Custom Field</button>';
    }
    if (s.holdedStageSyncStatus === 'ERROR' || (s.holdedStageSyncStatus !== 'SYNCED' && s.holdedTrackingSyncStatus === 'SYNCED' && s.holdedCustomFieldSyncStatus === 'SYNCED')) {
      html += '<button class="dropdown-item" onclick="retryStageSync(\'' + id + '\')">Retry Etapa</button>';
    }
    html += '<div class="dropdown-divider"></div>';
  }

  if (s.trackingNumber) {
    html += '<button class="dropdown-item text-danger" onclick="deleteTrackingAction(\'' + id + '\')">Delete Tracking</button>';
  }

  html += '</div></div>';
  return html;
}

// ── Dropdown toggle ──────────────────────────────────────────────

function toggleDropdown(btn) {
  // Close all other dropdowns
  document.querySelectorAll('.dropdown-menu.show').forEach(function(m) {
    if (m !== btn.nextElementSibling) m.classList.remove('show');
  });
  btn.nextElementSibling.classList.toggle('show');
}

// Close dropdowns on outside click
document.addEventListener('click', function(e) {
  if (!e.target.closest('.dropdown')) {
    document.querySelectorAll('.dropdown-menu.show').forEach(function(m) { m.classList.remove('show'); });
  }
});

// ── Actions ──────────────────────────────────────────────────────

async function syncWaybills() {
  var btn = document.getElementById('btn-sync');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Syncing...';
  try {
    var result = await api('POST', '/shipments/sync');
    showToast('Synced ' + result.synced + ' waybill(s) from Holded', 'success');
    await loadShipments();
  } catch (err) {
    showToast('Sync failed: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sync Waybills';
  }
}

async function generateLabel(id) {
  if (!confirm('Generate GLS label for this shipment?')) return;
  try {
    var result = await api('POST', '/shipments/' + id + '/generate-label', {
      senderName: 'Default Sender',
      senderAddress: 'Default Address',
      senderCity: 'Madrid',
      senderPostcode: '28001',
      senderCountry: 'ES',
      senderPhone: '600000000',
      weight: 1,
      packages: 1,
    });
    if (result.errors && result.errors.length > 0) {
      showToast('Label generated with sync warnings: ' + result.errors.join('; '), 'error');
    } else {
      showToast('Label generated and Holded synced successfully', 'success');
    }
    await loadShipments();
  } catch (err) {
    showToast('Label generation failed: ' + err.message, 'error');
  }
}

async function regenerateLabel(id) {
  if (!confirm('Regenerate label? This will create a new GLS shipment and replace the current tracking.')) return;
  try {
    var result = await api('POST', '/shipments/' + id + '/regenerate-label', {
      senderName: 'Default Sender',
      senderAddress: 'Default Address',
      senderCity: 'Madrid',
      senderPostcode: '28001',
      senderCountry: 'ES',
      senderPhone: '600000000',
      weight: 1,
      packages: 1,
    });
    if (result.errors && result.errors.length > 0) {
      showToast('Label regenerated with sync warnings: ' + result.errors.join('; '), 'error');
    } else {
      showToast('Label regenerated and Holded synced successfully', 'success');
    }
    await loadShipments();
  } catch (err) {
    showToast('Label regeneration failed: ' + err.message, 'error');
  }
}

async function deleteTrackingAction(id) {
  if (!confirm('Delete tracking? This will clear Holded Seguimiento and custom field.')) return;
  try {
    await api('POST', '/shipments/' + id + '/delete-tracking');
    showToast('Tracking deleted and Holded fields cleared', 'success');
    await loadShipments();
  } catch (err) {
    showToast('Delete tracking failed: ' + err.message, 'error');
  }
}

function downloadLabel(id) {
  window.open('/api/shipments/' + id + '/label', '_blank');
}

async function retryAllSync(id) {
  try {
    var result = await api('POST', '/shipments/' + id + '/retry-all-sync');
    if (result.errors && result.errors.length > 0) {
      showToast('Partial sync success. Remaining: ' + result.errors.join('; '), 'error');
    } else {
      showToast('All Holded sync steps completed successfully', 'success');
    }
    await loadShipments();
  } catch (err) {
    showToast('Retry failed: ' + err.message, 'error');
  }
}

async function retryTrackingSync(id) {
  try {
    await api('POST', '/shipments/' + id + '/retry-tracking-sync');
    showToast('Holded Seguimiento synced', 'success');
    await loadShipments();
  } catch (err) {
    showToast('Retry Seguimiento failed: ' + err.message, 'error');
  }
}

async function retryCustomFieldSync(id) {
  try {
    await api('POST', '/shipments/' + id + '/retry-custom-field-sync');
    showToast('Holded custom field synced', 'success');
    await loadShipments();
  } catch (err) {
    showToast('Retry custom field failed: ' + err.message, 'error');
  }
}

async function retryStageSync(id) {
  try {
    await api('POST', '/shipments/' + id + '/retry-stage-sync');
    showToast('Holded etapa set', 'success');
    await loadShipments();
  } catch (err) {
    showToast('Retry etapa failed: ' + err.message, 'error');
  }
}

// ── Init ─────────────────────────────────────────────────────────

loadShipments();
