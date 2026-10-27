/**
 * Object Storage Management Feature Module for cb-mapui
 * Provides multi-cloud bucket lifecycle management, background operations tracking,
 * CSP capability/timing guidance, versioning/CORS control, and Presigned URL object browsing.
 * Modeled after the unified UX/UI patterns of RDBMS Management.
 * @module features/object-storage
 */
import Swal from 'sweetalert2';
import axios from 'axios';
import { tbApiBase, getConfig } from '../../core/api.js';
import { escapeHtml } from '../../core/utils.js';

const addSpinnerTask = (name) => (window.addSpinnerTask ? window.addSpinnerTask(name) : name);
const removeSpinnerTask = (id) => { if (window.removeSpinnerTask) window.removeSpinnerTask(id); };

// --- In-Modal Notification & Overlay Confirmation Handlers ---
let noticeTimeoutId = null;

export function showModalNotice(message, type = 'info', autoDismissMs = 5000) {
  const banner = document.getElementById('osNoticeBanner');
  if (!banner) {
    console.log(`[ObjectStorage ${type}]`, message);
    return;
  }

  if (noticeTimeoutId) {
    clearTimeout(noticeTimeoutId);
    noticeTimeoutId = null;
  }

  const icons = {
    success: '<i class="fas fa-check-circle" style="color: #16a34a; font-size: 18px;"></i>',
    error: '<i class="fas fa-exclamation-circle" style="color: #dc2626; font-size: 18px;"></i>',
    warning: '<i class="fas fa-exclamation-triangle" style="color: #d97706; font-size: 18px;"></i>',
    info: '<i class="fas fa-info-circle" style="color: #2563eb; font-size: 18px;"></i>',
  };

  banner.className = `os-notice-banner os-notice-${type}`;
  banner.innerHTML = `
    <div class="os-notice-content">
      <span class="os-notice-icon">${icons[type] || icons.info}</span>
      <span class="os-notice-text">${escapeHtml(message)}</span>
    </div>
    <button type="button" class="os-notice-close" title="Dismiss">&times;</button>
  `;
  banner.style.display = 'flex';
  banner.style.opacity = '1';

  const closeBtn = banner.querySelector('.os-notice-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => dismissModalNotice());
  }

  if (autoDismissMs > 0 && type !== 'error') {
    noticeTimeoutId = setTimeout(() => {
      dismissModalNotice();
    }, autoDismissMs);
  }
}

export function dismissModalNotice() {
  const banner = document.getElementById('osNoticeBanner');
  if (!banner) return;
  banner.style.opacity = '0';
  setTimeout(() => {
    banner.style.display = 'none';
  }, 200);
}

let confirmResolver = null;

export function showModalConfirm({
  title = 'Confirmation',
  html = '',
  icon = 'warning', // 'warning' | 'danger' | 'info'
  confirmText = 'Confirm',
  confirmButtonClass = 'os-btn-danger',
  cancelText = 'Cancel',
  onBeforeConfirm = null,
}) {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    const overlay = document.getElementById('osConfirmOverlay');
    const titleEl = document.getElementById('osConfirmTitle');
    const bodyEl = document.getElementById('osConfirmBody');
    const iconEl = document.getElementById('osConfirmIcon');
    const actionsEl = document.getElementById('osConfirmActions');

    if (!overlay || !titleEl || !bodyEl || !actionsEl) {
      resolve(confirm(title + '\n' + html.replace(/<[^>]*>/g, '')));
      return;
    }

    titleEl.innerText = title;
    bodyEl.innerHTML = html;

    const iconMap = {
      warning: '<div style="width:52px;height:52px;border-radius:50%;background:#fef3c7;display:flex;align-items:center;justify-content:center;margin:0 auto 14px auto;"><i class="fas fa-exclamation-triangle" style="font-size:24px;color:#d97706;"></i></div>',
      danger: '<div style="width:52px;height:52px;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;margin:0 auto 14px auto;"><i class="fas fa-trash-alt" style="font-size:22px;color:#dc2626;"></i></div>',
      info: '<div style="width:52px;height:52px;border-radius:50%;background:#e0f2fe;display:flex;align-items:center;justify-content:center;margin:0 auto 14px auto;"><i class="fas fa-info-circle" style="font-size:24px;color:#0284c7;"></i></div>',
    };
    if (iconEl) {
      iconEl.innerHTML = iconMap[icon] || iconMap.warning;
    }

    actionsEl.innerHTML = `
      <button id="osConfirmCancelBtn" class="os-btn os-btn-secondary" style="padding: 8px 20px; font-size: 14px; font-weight: 600;">${escapeHtml(cancelText)}</button>
      <button id="osConfirmOkBtn" class="os-btn ${confirmButtonClass}" style="padding: 8px 22px; font-size: 14px; font-weight: 600;">${escapeHtml(confirmText)}</button>
    `;

    overlay.style.display = 'flex';

    const cancelBtn = document.getElementById('osConfirmCancelBtn');
    const okBtn = document.getElementById('osConfirmOkBtn');

    if (cancelBtn) {
      cancelBtn.onclick = () => {
        overlay.style.display = 'none';
        if (confirmResolver) {
          confirmResolver(false);
          confirmResolver = null;
        }
      };
    }

    if (okBtn) {
      okBtn.onclick = () => {
        let extra = true;
        if (typeof onBeforeConfirm === 'function') {
          extra = onBeforeConfirm();
        }
        okBtn.disabled = true;
        okBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Processing...';
        overlay.style.display = 'none';
        if (confirmResolver) {
          confirmResolver(extra !== undefined ? extra : true);
          confirmResolver = null;
        }
      };
    }
  });
}

export function showModalCorsDialog(bucketId, currentRules, provider = '') {
  return new Promise((resolve) => {
    const overlay = document.getElementById('osConfirmOverlay');
    const titleEl = document.getElementById('osConfirmTitle');
    const bodyEl = document.getElementById('osConfirmBody');
    const iconEl = document.getElementById('osConfirmIcon');
    const actionsEl = document.getElementById('osConfirmActions');

    if (!overlay || !titleEl || !bodyEl || !actionsEl) {
      resolve('cancel');
      return;
    }

    const meta = getProviderMetadata(provider);
    const hasCors = currentRules && currentRules.length > 0;
    titleEl.innerText = `🌐 CORS Configuration: ${bucketId}`;
    if (iconEl) {
      iconEl.innerHTML = '<div style="width:52px;height:52px;border-radius:50%;background:#e0f2fe;display:flex;align-items:center;justify-content:center;margin:0 auto 14px auto;"><i class="fas fa-globe" style="font-size:24px;color:#0284c7;"></i></div>';
    }

    bodyEl.innerHTML = `
      <div style="text-align: left; font-size: 14px; line-height: 1.6; margin-bottom: 12px;">
        <p style="margin-bottom: 10px;">CORS (Cross-Origin Resource Sharing) allows web browsers to interact directly with this bucket for Presigned URL uploads and downloads.</p>
        <div style="background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
            <div>
              <b>Current Status:</b>
              ${hasCors ? '<span class="os-badge os-badge-success" style="margin-left:6px;">Configured</span>' : '<span class="os-badge os-badge-warning" style="margin-left:6px;">Not Configured</span>'}
            </div>
            <span style="font-size:12px; color:#0369a1; font-weight:600;">⏱️ Est. Apply Time: ${escapeHtml(meta.estCors)}</span>
          </div>
          ${hasCors ? `<pre style="font-size:12px; margin-top:8px; max-height:140px; overflow:auto; background:#ffffff; padding:10px; border-radius:6px; border:1px solid #cbd5e1;">${escapeHtml(JSON.stringify(currentRules, null, 2))}</pre>` : ''}
        </div>
      </div>
    `;

    actionsEl.innerHTML = `
      <div style="display: flex; gap: 10px; justify-content: flex-end; width: 100%; flex-wrap: wrap;">
        <button id="osCorsCloseBtn" class="os-btn os-btn-secondary" style="padding: 8px 18px; font-size: 14px; font-weight: 600;">Close</button>
        ${hasCors ? `<button id="osCorsDeleteBtn" class="os-btn os-btn-danger" style="padding: 8px 18px; font-size: 14px; font-weight: 600;"><i class="fas fa-trash-alt"></i> Delete CORS</button>` : ''}
        <button id="osCorsApplyBtn" class="os-btn os-btn-primary" style="padding: 8px 20px; font-size: 14px; font-weight: 600;"><i class="fas fa-check"></i> Apply Default CORS (*)</button>
      </div>
    `;

    overlay.style.display = 'flex';

    const closeBtn = document.getElementById('osCorsCloseBtn');
    const deleteBtn = document.getElementById('osCorsDeleteBtn');
    const applyBtn = document.getElementById('osCorsApplyBtn');

    if (closeBtn) closeBtn.onclick = () => { overlay.style.display = 'none'; resolve('cancel'); };
    if (deleteBtn) deleteBtn.onclick = () => { overlay.style.display = 'none'; resolve('delete'); };
    if (applyBtn) applyBtn.onclick = () => { overlay.style.display = 'none'; resolve('apply'); };
  });
}

// Helper to format bytes into readable units
function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Validate bucket name against standard S3/CSP rules: 3-63 chars, lowercase, numbers, hyphens
function isValidBucketName(name) {
  if (!name || name.length < 3 || name.length > 63) return false;
  const regex = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
  return regex.test(name);
}

const CSP_ORDER = ['aws', 'alibaba', 'tencent', 'ncp', 'gcp', 'azure', 'ibm', 'nhn', 'openstack', 'kt'];

// Empirical multi-cloud Object Storage benchmark metadata (from 10-CSP Live Test 05)
const CSP_META = {
  aws: {
    name: 'AWS S3',
    shortName: 'AWS',
    estCreate: '~3–5s',
    estDelete: '~4–6s',
    estCors: '~10–12s',
    estCrud: '~6–9s',
    createSecMax: 5,
    deleteSecMax: 6,
    note: 'Full S3 standard support (CORS, Object Versioning, Presigned URL PUT/GET).',
  },
  alibaba: {
    name: 'Alibaba OSS',
    shortName: 'Alibaba',
    estCreate: '~4–6s',
    estDelete: '~3–5s',
    estCors: '~8–10s',
    estCrud: '~1–3s',
    createSecMax: 6,
    deleteSecMax: 5,
    note: 'Fast S3-compatible OSS operations (~1s Presigned URL CRUD, sub-second Versioning).',
  },
  tencent: {
    name: 'Tencent COS',
    shortName: 'Tencent',
    estCreate: '~3–5s',
    estDelete: '~8–11s',
    estCors: '~10–13s',
    estCrud: '~15–20s',
    createSecMax: 5,
    deleteSecMax: 11,
    note: 'Tencent COS automatically appends -<AppId> to the CSP bucket name (cspResourceName).',
  },
  ncp: {
    name: 'Naver Cloud (NCP)',
    shortName: 'NCP',
    estCreate: '~2–4s',
    estDelete: '~3–5s',
    estCors: 'N/A',
    estCrud: '~1–3s',
    createSecMax: 4,
    deleteSecMax: 5,
    note: 'Fast bucket creation (~2.5s) and S3-compatible Presigned URL CRUD. CORS & Versioning are not exposed via S3 API.',
  },
  gcp: {
    name: 'Google Cloud (GCS)',
    shortName: 'GCP',
    estCreate: '~6–8s',
    estDelete: '~5–8s',
    estCors: '~1.5–3s',
    estCrud: '~3–6s',
    createSecMax: 8,
    deleteSecMax: 8,
    note: 'Hybrid GCS Native SDK (CORS & Object Versions) + S3 HMAC Interop (Presigned URLs).',
  },
  azure: {
    name: 'Azure Blob Storage',
    shortName: 'Azure',
    estCreate: '~1–2s',
    estDelete: '~3–5s',
    estCors: 'Account-level',
    estCrud: '~1–2s',
    createSecMax: 2,
    deleteSecMax: 5,
    note: 'Uses Azure Blob SAS URLs (automatically includes x-ms-blob-type: BlockBlob on upload).',
  },
  ibm: {
    name: 'IBM Cloud COS',
    shortName: 'IBM',
    estCreate: '~10–14s',
    estDelete: '~10–15s',
    estCors: '~60–75s',
    estCrud: '~20–28s',
    createSecMax: 14,
    deleteSecMax: 15,
    note: 'Global US-South endpoint; CORS rule propagation takes ~60–75s on IBM COS.',
  },
  nhn: {
    name: 'NHN Cloud OBS',
    shortName: 'NHN',
    estCreate: '~1–2s',
    estDelete: '~3–4s',
    estCors: '~10–12s',
    estCrud: '~1–3s',
    createSecMax: 2,
    deleteSecMax: 4,
    note: 'Fastest bucket creation (~1.1s) with S3-compatible Presigned URLs.',
  },
  openstack: {
    name: 'OpenStack Swift/S3',
    shortName: 'OpenStack',
    estCreate: '~4–6s',
    estDelete: '~3–5s',
    estCors: '~9–12s',
    estCrud: '~1–3s',
    createSecMax: 6,
    deleteSecMax: 5,
    note: 'Ceph RGW / Swift S3 interface supporting Bucket CRUD, CORS, and Presigned URLs.',
  },
  kt: {
    name: 'KT Cloud Object Storage',
    shortName: 'KT',
    estCreate: '~3–5s',
    estDelete: '~9–13s',
    estCors: '~9–12s',
    estCrud: '~10–14s',
    createSecMax: 5,
    deleteSecMax: 13,
    note: 'Supports full S3 lifecycle including CORS, Versioning, and Presigned URLs.',
  },
};

function getProviderMetadata(providerName) {
  const raw = typeof providerName === 'string'
    ? providerName
    : (providerName?.connectionConfig?.providerName || providerName?.connectionName?.split('-')[0] || providerName?.provider || providerName?.csp || '');
  const p = String(raw || '').toLowerCase().trim();
  const m = CSP_META[p] || {
    name: p ? p.toUpperCase() : 'UNKNOWN',
    shortName: p ? p.toUpperCase() : 'UNKNOWN',
    estCreate: '~2–8s',
    estDelete: '~3–10s',
    estCors: '~5–15s',
    estCrud: '~2–10s',
    createSecMax: 8,
    deleteSecMax: 10,
    note: '',
  };
  return {
    id: p,
    ...m,
    icon: `/img/csp-${p}.png`,
  };
}

function getParallelBucketCreateEstimate(csps = [], autoCors = false) {
  if (!Array.isArray(csps) || csps.length === 0) return { label: '~2–8s', slowestCsp: '' };
  let maxSec = 0;
  let minSec = 999;
  let slowestCsp = '';
  csps.forEach(c => {
    const m = getProviderMetadata(c);
    const p = m.id;
    const corsAdd = (autoCors && osState.supportMatrix?.[p]?.cors) ? (p === 'ibm' ? 68 : 10) : 0;
    const totalMax = m.createSecMax + corsAdd;
    const totalMin = Math.max(1, Math.round(totalMax * 0.6));
    if (totalMax > maxSec) {
      maxSec = totalMax;
      slowestCsp = m.shortName;
    }
    if (totalMin < minSec) minSec = totalMin;
  });
  if (minSec > maxSec) minSec = maxSec;
  return {
    label: minSec === maxSec ? `~${maxSec}s` : `~${minSec}–${maxSec}s`,
    slowestCsp,
  };
}

function getParallelBucketDeleteEstimate(csps = []) {
  if (!Array.isArray(csps) || csps.length === 0) return { label: '~3–10s', slowestCsp: '' };
  let maxSec = 0;
  let minSec = 999;
  let slowestCsp = '';
  csps.forEach(c => {
    const m = getProviderMetadata(c);
    if (m.deleteSecMax > maxSec) {
      maxSec = m.deleteSecMax;
      slowestCsp = m.shortName;
    }
    const low = Math.max(2, Math.round(m.deleteSecMax * 0.6));
    if (low < minSec) minSec = low;
  });
  if (minSec > maxSec) minSec = maxSec;
  return {
    label: minSec === maxSec ? `~${maxSec}s` : `~${minSec}–${maxSec}s`,
    slowestCsp,
  };
}

function groupConnectionsByProvider(connections) {
  const providerMap = {};
  for (const c of (connections || [])) {
    let p = (c.providerName || '').toLowerCase();
    if (!p && c.configName) {
      p = c.configName.split('-')[0].toLowerCase();
    }
    if (!providerMap[p]) {
      providerMap[p] = [];
    }
    providerMap[p].push(c);
  }
  return providerMap;
}

function getRegionDisplay(conn) {
  const rawDisp = (conn.regionDetail?.location?.display || conn.regionDetail?.description || '').trim();
  const reg = (conn.regionDetail?.regionName || conn.regionZoneInfo?.assignedRegion || conn.configName || '').trim();
  const cfg = (conn.configName || '').trim();
  const t = `${rawDisp} ${reg} ${cfg}`.toLowerCase();

  let flag = '🌐';
  let cleanName = rawDisp;

  if (t.includes('korea') || t.includes('seoul') || t.includes('pangyo') || t.includes('pyeongchon') || t.includes('gasan') || t.includes('mok-dong') || t.includes('kr1') || t.includes('kr2') || cfg.includes('-kr')) {
    flag = '🇰🇷';
    cleanName = (t.includes('seoul') || reg === 'kr' || reg.startsWith('kr-') || reg === 'kr1') ? 'Seoul, South Korea' : (t.includes('pangyo') ? 'Pangyo, South Korea' : 'South Korea');
  } else if (t.includes('japan') || t.includes('tokyo') || t.includes('osaka') || t.includes('jp1') || t.includes('jpn') || reg === 'ap-northeast-1' || reg === 'ap-northeast-3') {
    flag = '🇯🇵';
    cleanName = t.includes('osaka') || reg === 'ap-northeast-3' ? 'Osaka, Japan' : 'Tokyo, Japan';
  } else if (t.includes('singapore') || t.includes('southeast-1') || reg === 'sgn') {
    flag = '🇸🇬';
    cleanName = 'Singapore';
  } else if (t.includes('china') || t.includes('beijing') || t.includes('shanghai') || t.includes('guangzhou') || t.includes('shenzhen') || reg.startsWith('cn-')) {
    flag = '🇨🇳';
    cleanName = 'China';
  } else if (t.includes('united states') || t.includes('usa') || t.includes('virginia') || t.includes('ohio') || t.includes('oregon') || t.includes('texas') || t.includes('dallas') || reg.startsWith('us-')) {
    flag = '🇺🇸';
    cleanName = reg === 'us-south' ? 'Dallas (US-South), USA' : 'United States';
  } else if (t.includes('germany') || t.includes('frankfurt')) {
    flag = '🇩🇪';
    cleanName = 'Frankfurt, Germany';
  } else if (t.includes('united kingdom') || t.includes('london')) {
    flag = '🇬🇧';
    cleanName = 'London, UK';
  }

  if (!cleanName) cleanName = reg;
  return `${flag} ${cleanName} (${reg})`;
}

function sortConnections(connList) {
  return [...connList].sort((a, b) => {
    const dispA = getRegionDisplay(a);
    const dispB = getRegionDisplay(b);
    const isKrA = dispA.includes('🇰🇷');
    const isKrB = dispB.includes('🇰🇷');
    if (isKrA && !isKrB) return -1;
    if (!isKrA && isKrB) return 1;
    return dispA.localeCompare(dispB);
  });
}

// --- Background Operations Tracker (Modeled after RDBMS Background Operations) ---
let osActiveOperations = [];
let osOpCounter = 1;
let osOpElapsedTimerId = null;

function formatElapsedSec(startMs, endMs) {
  const diffSec = Math.max(0, Math.floor(((endMs || Date.now()) - startMs) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const m = Math.floor(diffSec / 60);
  const s = diffSec % 60;
  return `${m}m ${s}s`;
}

function ensureOpElapsedTimer() {
  if (osOpElapsedTimerId) return;
  osOpElapsedTimerId = setInterval(() => {
    const hasRunning = osActiveOperations.some(op => !op.dismissed && op.status === 'running');
    if (!hasRunning) {
      clearInterval(osOpElapsedTimerId);
      osOpElapsedTimerId = null;
      return;
    }
    document.querySelectorAll('.os-op-elapsed-live').forEach(el => {
      const startMs = Number(el.dataset.startMs || 0);
      if (startMs > 0) {
        el.textContent = `Elapsed: ${formatElapsedSec(startMs)}`;
      }
    });
  }, 1000);
}

function createBackgroundOperation({ title, subtitle = '', estLabel = '', steps = [] }) {
  const op = {
    id: `os-op-${Date.now()}-${osOpCounter++}`,
    title,
    subtitle,
    estLabel,
    status: 'running', // 'running' | 'completed' | 'warning' | 'failed'
    startTime: Date.now(),
    endTime: null,
    dismissed: false,
    summaryHtml: '',
    steps: steps.map(s => ({
      key: s.key,
      title: s.title,
      desc: s.desc || '',
      descHtml: s.descHtml || '',
      detailsHtml: s.detailsHtml || '',
      status: s.status || 'pending', // 'pending' | 'running' | 'completed' | 'warning' | 'failed'
    })),
  };
  osActiveOperations.unshift(op);
  ensureOpElapsedTimer();
  renderActiveOperationsPanelIfOpen();
  return op;
}

function generateSingleOpCardHtml(op) {
  const isRunning = op.status === 'running';
  const isSuccess = op.status === 'completed';
  const isWarning = op.status === 'warning';
  const borderLeftColor = isRunning ? '#0284c7' : (isSuccess ? '#16a34a' : (isWarning ? '#d97706' : '#dc2626'));
  const statusBadge = isRunning
    ? `<span class="os-badge os-badge-info"><i class="fas fa-circle-notch fa-spin"></i> Running</span>`
    : (isSuccess
      ? `<span class="os-badge os-badge-success"><i class="fas fa-check"></i> Completed</span>`
      : (isWarning
        ? `<span class="os-badge os-badge-warning"><i class="fas fa-exclamation-triangle"></i> Partial / Warning</span>`
        : `<span class="os-badge os-badge-danger"><i class="fas fa-times"></i> Failed</span>`));

  const elapsedStr = formatElapsedSec(op.startTime, op.endTime);

  return `
    <div class="os-op-card" style="background:#ffffff; border:1px solid #e2e8f0; border-left:4px solid ${borderLeftColor}; border-radius:8px; padding:12px 14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          ${statusBadge}
          <strong style="font-size:13.5px; color:#0f172a;">${escapeHtml(op.title)}</strong>
          ${op.subtitle ? `<span style="font-size:12px; color:#64748b;">(${escapeHtml(op.subtitle)})</span>` : ''}
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          ${op.estLabel ? `<span style="font-size:11.5px; color:#0369a1; background:#e0f2fe; padding:2px 8px; border-radius:4px; font-weight:600;">⏱️ Est. ${escapeHtml(op.estLabel)}</span>` : ''}
          <span class="os-op-elapsed-live" data-start-ms="${op.startTime}" style="font-size:11.5px; font-family:monospace; color:#475569; background:#f1f5f9; padding:2px 8px; border-radius:4px;">Elapsed: ${elapsedStr}</span>
          ${!isRunning ? `<button type="button" class="os-btn os-btn-secondary btn-dismiss-os-op" data-op-id="${op.id}" style="padding:2px 7px; font-size:11px;">✕</button>` : ''}
        </div>
      </div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(230px, 1fr)); gap:8px;">
        ${op.steps.map(st => {
          let icon = '<i class="far fa-clock" style="color:#94a3b8;"></i>';
          let bg = '#f8fafc';
          let bdr = '#e2e8f0';
          if (st.status === 'running') {
            icon = '<i class="fas fa-circle-notch fa-spin" style="color:#0284c7;"></i>';
            bg = '#f0f9ff';
            bdr = '#bae6fd';
          } else if (st.status === 'completed') {
            icon = '<i class="fas fa-check-circle" style="color:#16a34a;"></i>';
            bg = '#f0fdf4';
            bdr = '#bbf7d0';
          } else if (st.status === 'warning') {
            icon = '<i class="fas fa-exclamation-triangle" style="color:#d97706;"></i>';
            bg = '#fffbeb';
            bdr = '#fde68a';
          } else if (st.status === 'failed') {
            icon = '<i class="fas fa-times-circle" style="color:#dc2626;"></i>';
            bg = '#fef2f2';
            bdr = '#fecaca';
          }
          return `
            <div style="display:flex; gap:8px; align-items:flex-start; padding:7px 10px; border-radius:6px; background:${bg}; border:1px solid ${bdr};">
              <div style="margin-top:2px;">${icon}</div>
              <div style="flex:1; font-size:12px;">
                <div style="font-weight:700; color:#1e293b;">${escapeHtml(st.title)}</div>
                <div style="color:#475569; margin-top:1px;">${st.descHtml || escapeHtml(st.desc || '')}</div>
                ${st.detailsHtml ? `<div style="margin-top:4px;">${st.detailsHtml}</div>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
      ${op.summaryHtml ? `
        <div style="margin-top:8px; padding:8px 12px; border-radius:6px; font-size:12px; background:${isSuccess ? '#f0fdf4' : (isWarning ? '#fffbeb' : '#fef2f2')}; border:1px solid ${isSuccess ? '#bbf7d0' : (isWarning ? '#fde68a' : '#fecaca')}; color:${isSuccess ? '#166534' : (isWarning ? '#92400e' : '#991b1b')};">
          ${op.summaryHtml}
        </div>
      ` : ''}
    </div>
  `;
}

function renderActiveOperationsPanelIfOpen() {
  const container = document.getElementById('osActiveOpsContainer');
  if (!container) return;
  const visibleOps = osActiveOperations.filter(op => !op.dismissed);
  if (visibleOps.length === 0) {
    container.innerHTML = '';
    return;
  }
  const runningCount = visibleOps.filter(op => op.status === 'running').length;
  const finishedCount = visibleOps.length - runningCount;

  container.innerHTML = `
    <div class="os-card" style="padding:14px 16px; margin-bottom:14px; border-left:4px solid #0284c7; background:#fafcfe;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px;">
        <div style="font-weight:700; font-size:13.5px; color:#1e293b; display:flex; align-items:center; gap:8px;">
          <span>⚡ Background Operations</span>
          ${runningCount > 0 ? `<span class="os-badge os-badge-info"><i class="fas fa-circle-notch fa-spin"></i> ${runningCount} Running</span>` : ''}
          ${finishedCount > 0 ? `<span class="os-badge os-badge-secondary">${finishedCount} Finished</span>` : ''}
        </div>
        ${finishedCount > 0 ? `
          <button type="button" id="osClearFinishedOpsBtn" class="os-btn os-btn-secondary" style="padding:3px 9px; font-size:11.5px;">
            ✕ Clear Finished
          </button>
        ` : ''}
      </div>
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${visibleOps.map(op => generateSingleOpCardHtml(op)).join('')}
      </div>
    </div>
  `;

  container.querySelectorAll('.btn-dismiss-os-op').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const op = osActiveOperations.find(o => o.id === btn.dataset.opId);
      if (op) {
        op.dismissed = true;
        renderActiveOperationsPanelIfOpen();
      }
    };
  });

  const clearAllBtn = document.getElementById('osClearFinishedOpsBtn');
  if (clearAllBtn) {
    clearAllBtn.onclick = () => {
      osActiveOperations.forEach(o => {
        if (o.status !== 'running') o.dismissed = true;
      });
      renderActiveOperationsPanelIfOpen();
    };
  }
}

// --- Internal Modal State ---
let osState = {
  namespace: '',
  view: 'buckets', // 'buckets' | 'objects'
  currentBucket: null,
  bucketList: [],
  objectList: [],
  connections: [],
  supportMatrix: {},
  filterProvider: 'all',
  filterText: '',
  selectedBucketIds: new Set(),
  isCreateOpen: false,
  multiCspSelected: ['aws'],
  selectedRegionsByCsp: {},
  bucketLocations: {},
  bucketVersioning: {},
};

let osAutoSyncTimerId = null;

function computeBucketListSignature(list) {
  return (list || [])
    .map(b => {
      const conds = (b.conditions || []).map(c => `${c.type}:${c.status}:${c.reason}`).join(',');
      return `${b.id || ''}:${b.status || ''}:${b.cspResourceName || ''}:${conds}`;
    })
    .sort()
    .join('|');
}

function startOsModalAutoSync() {
  stopOsModalAutoSync();
  osAutoSyncTimerId = setInterval(() => {
    const modalContent = document.getElementById('osModalContent');
    if (!modalContent) {
      stopOsModalAutoSync();
      return;
    }
    if (document.hidden) return;
    if (osState.view === 'buckets') {
      refreshBucketsSilently({ onlyIfChanged: true });
    }
  }, 8000);
}

function stopOsModalAutoSync() {
  if (osAutoSyncTimerId) {
    clearInterval(osAutoSyncTimerId);
    osAutoSyncTimerId = null;
  }
}

function isBucketCspMissing(b) {
  if (!b) return false;
  const st = (b.status || '').toLowerCase();
  if (st.includes('cspdeleted') || st.includes('missing')) return true;
  if (Array.isArray(b.conditions)) {
    return b.conditions.some(c =>
      c.reason === 'CspResourceMissing' ||
      c.reason === 'CSPDeleted' ||
      (c.type === 'Synced' && c.status === 'False')
    );
  }
  return false;
}

async function refreshBucketsSilently({ onlyIfChanged = false } = {}) {
  const config = getConfig();
  try {
    const prevSig = computeBucketListSignature(osState.bucketList);
    const res = await axios.get(`${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage`, {
      auth: { username: config.username, password: config.password },
    });
    const nextList = (res.data && res.data.objectStorage) ? res.data.objectStorage : [];
    const nextSig = computeBucketListSignature(nextList);
    if (onlyIfChanged && prevSig === nextSig) return;

    osState.bucketList = nextList;
    const liveIds = new Set(nextList.map(b => b.id));
    for (const id of osState.selectedBucketIds) {
      if (!liveIds.has(id)) osState.selectedBucketIds.delete(id);
    }
    syncBucketListDom();
  } catch (err) {
    console.warn('[ObjectStorage] Silent refresh error:', err);
  }
}

/**
 * Open the Object Storage Management Modal
 * @param {string} [initialBucketId] - Optional bucket ID to open directly into object view
 */
export async function showObjectStorageModal(initialBucketId = null) {
  const namespace = window.configNamespace || '';
  if (!namespace) {
    Swal.fire({
      icon: 'warning',
      title: 'Namespace Required',
      text: 'Please select a namespace from the top bar or settings first.',
      confirmButtonColor: '#3085d6',
    });
    return;
  }

  osState.namespace = namespace;
  osState.view = initialBucketId ? 'objects' : 'buckets';
  osState.currentBucket = initialBucketId ? { id: initialBucketId, name: initialBucketId } : null;
  osState.filterText = '';

  Swal.fire({
    title: '🪣 Object Storage Management (S3 / Blob / COS / OSS)',
    html: `
      <style>
        .swal2-os-modal { max-width: 1460px !important; position: relative !important; overflow: hidden !important; }
        .os-modal-container { 
          text-align: left; 
          font-size: 14px; 
          line-height: 1.5; 
          color: #1e293b; 
          max-height: 80vh; 
          overflow-y: auto; 
          padding: 6px 10px; 
        }
        .os-header-bar { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          background: #f8fafc; 
          padding: 12px 16px; 
          border-radius: 8px; 
          margin-bottom: 12px; 
          border: 1px solid #e2e8f0;
          flex-wrap: wrap;
          gap: 10px;
        }
        .os-header-title { 
          font-weight: 700; 
          font-size: 16px; 
          color: #0f172a; 
          display: flex; 
          align-items: center; 
          gap: 8px;
          flex-wrap: wrap;
        }
        .os-badge { 
          padding: 3px 9px; 
          border-radius: 6px; 
          font-size: 12px; 
          font-weight: 600; 
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .os-badge-success { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
        .os-badge-danger { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
        .os-badge-warning { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
        .os-badge-info { background: #e0f2fe; color: #0369a1; border: 1px solid #7dd3fc; }
        .os-badge-secondary { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }

        .os-card { 
          background: #ffffff; 
          border: 1px solid #e2e8f0; 
          border-radius: 8px; 
          padding: 16px; 
          margin-bottom: 14px; 
          box-shadow: 0 1px 3px rgba(0,0,0,0.04); 
        }
        .os-card h6 { 
          margin: 0 0 12px 0; 
          font-size: 15px; 
          font-weight: 700; 
          color: #1e293b; 
          display: flex; 
          align-items: center; 
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
        }
        .os-form-row { display: flex; gap: 14px; margin-bottom: 12px; flex-wrap: wrap; }
        .os-form-col { flex: 1; min-width: 220px; }
        .os-form-col label { 
          display: block; 
          margin-bottom: 5px; 
          font-size: 13px; 
          font-weight: 700; 
          color: #334155; 
        }
        .os-form-control { 
          width: 100%; 
          height: 38px; 
          padding: 6px 11px; 
          font-size: 13.5px; 
          border: 1.5px solid #cbd5e1; 
          border-radius: 6px; 
          box-sizing: border-box; 
          background: #ffffff;
          color: #0f172a;
        }
        .os-form-control:focus { 
          outline: none; 
          border-color: #2563eb; 
          box-shadow: 0 0 0 3px rgba(37,99,235,0.15); 
        }
        .os-validation-hint { font-size: 12px; margin-top: 4px; }

        .os-table-container { border: 1px solid #e2e8f0; border-radius: 8px; overflow-x: auto; background: #fff; }
        .os-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
        .os-table th { 
          background: #f8fafc; 
          color: #334155; 
          font-weight: 700; 
          font-size: 13px; 
          text-align: left; 
          padding: 10px 12px; 
          border-bottom: 1.5px solid #e2e8f0;
          white-space: nowrap;
        }
        .os-table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
        .os-table tr:hover td { background-color: #f8fafc; }

        .os-btn { 
          display: inline-flex; 
          align-items: center; 
          gap: 5px; 
          padding: 6px 11px; 
          font-size: 12.5px; 
          font-weight: 600; 
          border-radius: 6px; 
          border: 1px solid transparent; 
          cursor: pointer; 
          text-decoration: none; 
          transition: all 0.15s; 
        }
        .os-btn:disabled, .os-btn[disabled] {
          opacity: 0.6;
          cursor: not-allowed !important;
        }
        .os-btn-primary { background: #2563eb; color: #fff; border-color: #1d4ed8; }
        .os-btn-primary:hover:not(:disabled) { background: #1d4ed8; }
        .os-btn-secondary { background: #f1f5f9; color: #334155; border-color: #cbd5e1; }
        .os-btn-secondary:hover:not(:disabled) { background: #e2e8f0; }
        .os-btn-danger { background: #fff; color: #dc2626; border-color: #fca5a5; }
        .os-btn-danger:hover:not(:disabled) { background: #fee2e2; }
        .os-btn-success { background: #16a34a; color: #fff; border-color: #15803d; }
        .os-btn-success:hover:not(:disabled) { background: #15803d; }
        .os-btn-warning { background: #fffbeb; color: #b45309; border-color: #fde68a; }
        .os-btn-warning:hover:not(:disabled) { background: #fef3c7; }

        .os-dropzone { 
          border: 2px dashed #94a3b8; 
          border-radius: 8px; 
          padding: 20px; 
          text-align: center; 
          background: #f8fafc; 
          cursor: pointer; 
          transition: all 0.2s; 
          margin-bottom: 12px; 
          font-size: 14px;
        }
        .os-dropzone:hover, .os-dropzone.dragover { border-color: #2563eb; background: #eff6ff; }
        .os-progress-bar { width: 100%; height: 10px; background: #e2e8f0; border-radius: 5px; overflow: hidden; margin-top: 8px; }
        .os-progress-fill { height: 100%; background: #2563eb; width: 0%; transition: width 0.15s; }

        /* CSP Filter & Multi-Select Tiles */
        .os-csp-container { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 10px; }
        .os-csp-tile {
          display: flex; align-items: center; gap: 7px; padding: 6px 12px;
          border: 1.5px solid #cbd5e1; border-radius: 8px; background: #ffffff;
          cursor: pointer; transition: all 0.15s ease; user-select: none;
        }
        .os-csp-tile:hover { border-color: #93c5fd; background: #f8fafc; }
        .os-csp-tile.active {
          border-color: #2563eb; background: #eff6ff;
          box-shadow: 0 0 0 2px rgba(37,99,235,0.2);
        }
        .os-csp-logo { width: 20px; height: 20px; object-fit: contain; }
        .os-csp-name { font-weight: 700; font-size: 13px; color: #0f172a; }
        .os-csp-count { font-size: 11.5px; font-weight: 600; color: #475569; background: #f1f5f9; padding: 1px 6px; border-radius: 10px; }
        .os-csp-tile.active .os-csp-count { background: #dbeafe; color: #1d4ed8; }

        .os-csp-info-box {
          background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
          padding: 10px 14px; margin-bottom: 4px; font-size: 12.5px; line-height: 1.6;
        }

        /* Notice Banner */
        .os-notice-banner {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 10px 16px; border-radius: 8px; margin: 4px 10px 10px 10px;
          font-size: 13.5px; line-height: 1.5; box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }
        .os-notice-content { display: flex; align-items: center; gap: 10px; flex: 1; text-align: left; }
        .os-notice-success { background: #f0fdf4; border: 1.5px solid #86efac; color: #166534; }
        .os-notice-error { background: #fef2f2; border: 1.5px solid #fca5a5; color: #991b1b; }
        .os-notice-warning { background: #fffbeb; border: 1.5px solid #fde68a; color: #92400e; }
        .os-notice-info { background: #eff6ff; border: 1.5px solid #bfdbfe; color: #1e40af; }
        .os-notice-close { background: transparent; border: none; font-size: 20px; cursor: pointer; opacity: 0.6; color: inherit; }

        /* Confirm Overlay */
        .os-confirm-overlay {
          position: absolute; inset: 0; background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(3px);
          z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 24px; border-radius: 15px;
        }
        .os-confirm-card {
          background: #ffffff; border-radius: 12px; padding: 24px 28px; max-width: 600px; width: 100%;
          box-shadow: 0 20px 25px -5px rgba(0,0,0,0.3); text-align: center; border: 1px solid #e2e8f0;
        }
        .os-confirm-title { margin: 0 0 10px 0; font-size: 17px; font-weight: 700; color: #0f172a; }
        .os-confirm-body { font-size: 14px; color: #334155; margin-bottom: 20px; line-height: 1.6; }
        .os-confirm-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }

        @keyframes osSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .fa-spin, .os-spin { display: inline-block !important; animation: osSpin 0.9s infinite linear !important; }
      </style>
      <div class="os-modal-wrapper" style="position: relative; width: 100%;">
        <div id="osNoticeBanner" class="os-notice-banner" style="display: none;"></div>
        <div id="osModalContent" class="os-modal-container">
          <div style="text-align: center; padding: 30px;"><i class="fas fa-circle-notch fa-spin fa-2x text-primary"></i><div class="mt-2 text-muted">Loading Object Storage data...</div></div>
        </div>
        <div id="osConfirmOverlay" class="os-confirm-overlay" style="display: none;">
          <div class="os-confirm-card" id="osConfirmCard">
            <div id="osConfirmIcon"></div>
            <h4 id="osConfirmTitle" class="os-confirm-title"></h4>
            <div id="osConfirmBody" class="os-confirm-body"></div>
            <div id="osConfirmActions" class="os-confirm-actions"></div>
          </div>
        </div>
      </div>
    `,
    width: '94%',
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: '✖ Close',
    customClass: {
      popup: 'swal2-os-modal',
      htmlContainer: 'p-0',
    },
    didOpen: async () => {
      await loadConnectionsAndSupport();
      await renderModalView();
      startOsModalAutoSync();
    },
    didClose: () => {
      stopOsModalAutoSync();
      if (noticeTimeoutId) {
        clearTimeout(noticeTimeoutId);
        noticeTimeoutId = null;
      }
    },
  });
}

async function loadConnectionsAndSupport() {
  const config = getConfig();
  try {
    const [connRes, suppRes] = await Promise.all([
      axios.get(`${tbApiBase()}/connConfig`, {
        auth: { username: config.username, password: config.password },
      }),
      axios.get(`${tbApiBase()}/objectStorage/support`, {
        auth: { username: config.username, password: config.password },
      }).catch(() => ({ data: { supports: {} } })),
    ]);

    if (connRes.data && connRes.data.connectionconfig) {
      osState.connections = connRes.data.connectionconfig;
    }
    if (suppRes.data && suppRes.data.supports) {
      osState.supportMatrix = suppRes.data.supports;
    }
  } catch (err) {
    console.warn('[ObjectStorage] Failed to preload connections/support:', err);
  }
}

async function renderModalView() {
  const container = document.getElementById('osModalContent');
  if (!container) return;

  if (osState.view === 'buckets') {
    await renderBucketListView(container);
  } else if (osState.view === 'objects') {
    await renderObjectExplorerView(container);
  }
}

function renderFilterCspInfoBoxHtml(provider, totalCount) {
  if (!provider || provider === 'all') {
    return `
      <div style="display:flex; gap:16px; flex-wrap:wrap; align-items:center;">
        <div><strong>Scope:</strong> <span class="os-badge os-badge-info">All Supported Clouds (10 Providers)</span></div>
        <div><strong>Protocols:</strong> AWS S3, Azure Blob SAS, Google Cloud Storage, Alibaba OSS, Tencent COS, IBM COS, Swift/S3</div>
        <div><strong>Total Buckets:</strong> <b>${totalCount}</b> Bucket${totalCount === 1 ? '' : 's'}</div>
      </div>
      <div style="margin-top:5px; font-size:12px; color:#334155;">
        <strong>⏱️ Empirical Provisioning & Delete Speed:</strong>
        <span style="color:#15803d; font-weight:600;">Fast (~1–2.5s):</span> NHN, Azure, NCP ·
        <span style="color:#0369a1; font-weight:600;">Standard (~3.5–7s):</span> AWS, Tencent, KT, Alibaba, OpenStack, GCP ·
        <span style="color:#b45309; font-weight:600;">Global (~10–14s, CORS ~68s):</span> IBM
      </div>
      <div style="margin-top:3px; color:#64748b; font-size:11.5px;">
        ℹ️ Click any CSP chip above to filter buckets and inspect provider-specific feature support (CORS, Versioning, Presigned URL) and empirical duration estimates.
      </div>
    `;
  }

  const meta = getProviderMetadata(provider);
  const sup = osState.supportMatrix?.[provider] || {};
  const corsStr = sup.cors ? '✅ Supported' : '⚪ Console / Account-level';
  const verStr = sup.versioning ? '✅ Supported' : '⚪ Unsupported';
  const preStr = sup.presignedUrl !== false ? '✅ Supported' : '❌ Unsupported';

  return `
    <div style="display:flex; gap:14px; flex-wrap:wrap; align-items:center;">
      <div><strong>Provider:</strong> <span class="os-badge os-badge-info">${escapeHtml(meta.name)}</span></div>
      <div><strong>CORS API:</strong> ${corsStr}</div>
      <div><strong>Versioning API:</strong> ${verStr}</div>
      <div><strong>Presigned URL:</strong> ${preStr}</div>
      <div>
        <strong>⏱️ Est. Time:</strong>
        Create <code style="color:#0369a1;font-weight:700;">${escapeHtml(meta.estCreate)}</code> ·
        Delete <code style="color:#b91c1c;font-weight:700;">${escapeHtml(meta.estDelete)}</code> ·
        5-Step Object CRUD <code style="color:#15803d;font-weight:700;">${escapeHtml(meta.estCrud)}</code>
      </div>
    </div>
    ${meta.note ? `<div style="margin-top:4px; color:#64748b; font-size:12px;">ℹ️ ${escapeHtml(meta.note)}</div>` : ''}
  `;
}

// -------------------------------------------------------------------------------------------------
// VIEW 1: BUCKET LIST, FILTER BAR, BACKGROUND OPS & MULTI-CLOUD PROVISIONING
// -------------------------------------------------------------------------------------------------
async function renderBucketListView(container) {
  const config = getConfig();
  try {
    const res = await axios.get(`${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage`, {
      auth: { username: config.username, password: config.password },
    });
    osState.bucketList = (res.data && res.data.objectStorage) ? res.data.objectStorage : [];
  } catch (err) {
    console.error('[ObjectStorage] List error:', err);
    osState.bucketList = [];
  }

  const providerMap = groupConnectionsByProvider(osState.connections);
  const availableProviders = Object.keys(providerMap);
  const sortedProviderList = CSP_ORDER
    .filter(p => providerMap[p] && providerMap[p].length > 0)
    .concat(availableProviders.filter(p => !CSP_ORDER.includes(p)));

  if (!osState.multiCspSelected || osState.multiCspSelected.length === 0) {
    osState.multiCspSelected = sortedProviderList.includes('aws') ? ['aws'] : (sortedProviderList.slice(0, 1));
  }

  const bucketsByProvider = {};
  osState.bucketList.forEach(b => {
    const p = (b.connectionConfig?.providerName || (b.connectionName ? b.connectionName.split('-')[0] : '')).toLowerCase();
    bucketsByProvider[p] = (bucketsByProvider[p] || 0) + 1;
  });

  const missingCount = osState.bucketList.filter(isBucketCspMissing).length;
  const selCount = osState.selectedBucketIds.size;

  const filterChipsHtml = [
    `<div class="os-csp-tile ${osState.filterProvider === 'all' ? 'active' : ''}" data-filter-csp="all" title="All Clouds (${osState.bucketList.length} buckets)">
      <span class="os-csp-name">🌐 All Clouds</span>
      <span class="os-csp-count" id="osFilterCount-all">${osState.bucketList.length}</span>
    </div>`,
    ...sortedProviderList.map(p => {
      const meta = getProviderMetadata(p);
      const count = bucketsByProvider[p] || 0;
      const isActive = osState.filterProvider === p ? 'active' : '';
      return `
        <div class="os-csp-tile ${isActive}" data-filter-csp="${p}" title="${escapeHtml(meta.name)} (${count} buckets · Est. Create ${meta.estCreate})">
          <img src="${meta.icon}" class="os-csp-logo" onerror="this.src='/img/circle.png';">
          <span class="os-csp-name">${escapeHtml(meta.shortName)}</span>
          <span class="os-csp-count" id="osFilterCount-${p}">${count}</span>
        </div>
      `;
    }),
  ].join('');

  container.innerHTML = `
    <!-- Top Header & Action Bar -->
    <div class="os-header-bar">
      <div class="os-header-title">
        <i class="fas fa-cubes text-primary" style="font-size: 16px;"></i>
        <span>Object Storage Buckets</span>
        <span class="os-badge os-badge-info">Namespace: ${escapeHtml(osState.namespace)}</span>
        <span class="os-badge os-badge-secondary" id="osTotalBucketsBadge">${osState.bucketList.length} Total Bucket(s)</span>
        ${missingCount > 0 ? `<span class="os-badge os-badge-danger" id="osMissingBucketsBadge">⚠️ ${missingCount} CSP Missing</span>` : ''}
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
        <button id="osRefreshBucketsBtn" class="os-btn os-btn-secondary" title="Refresh bucket list">
          <i class="fas fa-sync-alt"></i> Refresh
        </button>
        <button id="osReconcileAllBtn" class="os-btn os-btn-secondary" title="Verify all buckets against live CSP state (PUT .../objectStorage/reconcile)">
          <i class="fas fa-stethoscope"></i> Reconcile All
        </button>
        <button id="osPruneOrphansBtn" class="os-btn ${missingCount > 0 ? 'os-btn-warning' : 'os-btn-secondary'}" style="${missingCount > 0 ? '' : 'display:none;'}" title="Purge Tumblebug metadata for buckets missing on CSP">
          <i class="fas fa-broom"></i> Prune Orphans (${missingCount})
        </button>
        <button id="osBatchTestCrudBtn" class="os-btn os-btn-secondary" title="Run 5-Step Presigned URL E2E Object CRUD Verification on selected (or all) buckets">
          <i class="fas fa-vial" style="color:#0284c7;"></i> <span id="osBatchTestBtnLabel">${selCount > 0 ? `Batch E2E Test (${selCount})` : 'Batch E2E Test'}</span>
        </button>
        <button id="osBatchDeleteBtn" class="os-btn os-btn-danger" style="${selCount > 0 ? '' : 'display:none;'}" title="Delete selected buckets in parallel">
          <i class="fas fa-trash-alt"></i> <span id="osBatchDeleteBtnLabel">Delete Selected (${selCount})</span>
        </button>
        <button id="osToggleCreateDrawerBtn" class="os-btn os-btn-primary">
          <i class="fas ${osState.isCreateOpen ? 'fa-chevron-up' : 'fa-plus-circle'}"></i>
          <span>${osState.isCreateOpen ? 'Hide Create Form' : 'New Bucket (Single / Multi-Cloud)'}</span>
        </button>
      </div>
    </div>

    <!-- Active Background Operations Container -->
    <div id="osActiveOpsContainer"></div>

    <!-- Multi-Cloud / Single-Cloud Create Bucket Drawer -->
    <div id="osCreateDrawerCard" class="os-card" style="display:${osState.isCreateOpen ? 'block' : 'none'}; border-left:4px solid #2563eb; background:#fbfdff;">
      <h6>
        <span><i class="fas fa-cloud-upload-alt text-primary"></i> Provision New Object Storage Bucket(s) (Single or Parallel Multi-Cloud)</span>
        <div style="display:flex; gap:6px;">
          <button type="button" id="osSelectAllCreateCspsBtn" class="os-btn os-btn-secondary" style="padding:3px 9px; font-size:11.5px;">Select All CSPs (${sortedProviderList.length})</button>
          <button type="button" id="osClearCreateCspsBtn" class="os-btn os-btn-secondary" style="padding:3px 9px; font-size:11.5px;">Single (AWS)</button>
        </div>
      </h6>

      <label style="display:block; margin-bottom:6px; font-size:12.5px; font-weight:700; color:#334155;">
        1. Select Target Cloud Provider(s) (Click one or multiple CSPs to provision in parallel)
      </label>
      <div id="osCreateCspTilesContainer" class="os-csp-container">
        ${sortedProviderList.map(p => {
          const meta = getProviderMetadata(p);
          const conns = providerMap[p] || [];
          const isSelected = osState.multiCspSelected.includes(p);
          return `
            <div class="os-csp-tile os-create-csp-tile ${isSelected ? 'active' : ''}" data-create-csp="${p}" title="Est. Create ${meta.estCreate} · Delete ${meta.estDelete}">
              <input type="checkbox" ${isSelected ? 'checked' : ''} style="pointer-events:none; margin:0;">
              <img src="${meta.icon}" class="os-csp-logo" onerror="this.src='/img/circle.png';">
              <span class="os-csp-name">${escapeHtml(meta.shortName)}</span>
              <span class="os-csp-count">${escapeHtml(meta.estCreate)}</span>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Per-CSP Region Selectors Grid -->
      <div id="osCreateRegionsGrid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(270px, 1fr)); gap:10px; margin-bottom:12px;"></div>

      <!-- Bucket Name, Description & Automation Checkboxes -->
      <div class="os-form-row">
        <div class="os-form-col" style="flex:1.2;">
          <label for="osBucketNameInput">2. Bucket Name (or Base Prefix for Multi-Cloud) <span class="text-danger">*</span></label>
          <input type="text" id="osBucketNameInput" class="os-form-control" value="tb-os-bucket" placeholder="ex: tb-os-bucket (lowercase, digits, -)">
          <div id="osBucketNameHint" class="os-validation-hint text-muted">3–63 chars, lowercase letters, numbers, and hyphens.</div>
        </div>
        <div class="os-form-col" style="flex:1.2;">
          <label for="osDescriptionInput">3. Description (Optional)</label>
          <input type="text" id="osDescriptionInput" class="os-form-control" placeholder="Multi-cloud object storage bucket managed by CB-Tumblebug">
        </div>
        <div class="os-form-col" style="flex:1.3; display:flex; flex-direction:column; justify-content:center; gap:6px; padding-top:16px;">
          <label style="display:flex; align-items:center; gap:7px; font-size:12.5px; cursor:pointer; margin:0;">
            <input type="checkbox" id="osAutoCorsCheckbox" checked>
            <span>🌐 Auto-enable Default CORS (<code>*</code>) on supported CSPs</span>
          </label>
          <label style="display:flex; align-items:center; gap:7px; font-size:12.5px; cursor:pointer; margin:0;">
            <input type="checkbox" id="osAutoVersioningCheckbox">
            <span>🕓 Auto-enable Object Versioning (<code>Enabled</code>) on supported CSPs</span>
          </label>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-top:8px; padding-top:10px; border-top:1px solid #e2e8f0;">
        <div id="osCreateEstimateSummary" style="font-size:12.5px; color:#334155;"></div>
        <button id="osCreateBucketSubmitBtn" class="os-btn os-btn-primary" style="padding:8px 18px; font-size:13px;">
          <i class="fas fa-rocket"></i> Provision Bucket(s)
        </button>
      </div>
    </div>

    <!-- 1. Filter by Cloud Service Provider (CSP) Card -->
    <div class="os-card" style="padding:14px 16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
        <span style="font-size:13px; font-weight:700; color:#334155;">1. Filter by Cloud Service Provider (CSP) & Inspect Capabilities</span>
        <input type="text" id="osBucketSearchInput" value="${escapeHtml(osState.filterText)}" placeholder="🔍 Search bucket ID, CSP bucket name, region, status..." style="padding:5px 10px; font-size:12.5px; border:1.5px solid #cbd5e1; border-radius:6px; width:300px;">
      </div>
      <div id="osFilterCspContainer" class="os-csp-container">
        ${filterChipsHtml}
      </div>
      <div id="osFilterCspInfoBox" class="os-csp-info-box">
        ${renderFilterCspInfoBoxHtml(osState.filterProvider, osState.bucketList.length)}
      </div>
    </div>

    <!-- Buckets List Table -->
    <div class="os-card" style="margin-bottom:0; padding:14px 16px;">
      <div class="os-table-container">
        <table class="os-table" id="osBucketsTable">
          <thead>
            <tr>
              <th style="width:32px; text-align:center;">
                <input type="checkbox" id="osSelectAllBucketsCheckbox" title="Select all visible buckets">
              </th>
              <th>Bucket ID & CSP Bucket Name</th>
              <th>Cloud Provider & Connection</th>
              <th>Status & Sync State</th>
              <th>Features (CORS / Ver.)</th>
              <th>Est. Speed</th>
              <th>Created</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody id="osBucketsTableBody">
            ${renderBucketRows(getFilteredBuckets())}
          </tbody>
        </table>
      </div>
    </div>
  `;

  renderActiveOperationsPanelIfOpen();
  renderCreateRegionsGrid();
  setupBucketViewEvents(sortedProviderList);
}

function getFilteredBuckets() {
  const q = (osState.filterText || '').toLowerCase().trim();
  return (osState.bucketList || []).filter(b => {
    const p = (b.connectionConfig?.providerName || (b.connectionName ? b.connectionName.split('-')[0] : '')).toLowerCase();
    if (osState.filterProvider && osState.filterProvider !== 'all' && p !== osState.filterProvider) {
      return false;
    }
    if (!q) return true;
    const hay = `${b.id || ''} ${b.name || ''} ${b.cspResourceName || ''} ${b.uid || ''} ${b.connectionName || ''} ${p} ${b.status || ''} ${b.description || ''}`.toLowerCase();
    return hay.includes(q);
  });
}

function syncBucketListDom() {
  const totalBadge = document.getElementById('osTotalBucketsBadge');
  if (totalBadge) totalBadge.textContent = `${osState.bucketList.length} Total Bucket(s)`;

  const bucketsByProvider = {};
  osState.bucketList.forEach(b => {
    const p = (b.connectionConfig?.providerName || (b.connectionName ? b.connectionName.split('-')[0] : '')).toLowerCase();
    bucketsByProvider[p] = (bucketsByProvider[p] || 0) + 1;
  });

  const allCountEl = document.getElementById('osFilterCount-all');
  if (allCountEl) allCountEl.textContent = String(osState.bucketList.length);
  Object.keys(CSP_META).forEach(p => {
    const el = document.getElementById(`osFilterCount-${p}`);
    if (el) el.textContent = String(bucketsByProvider[p] || 0);
  });

  const missingCount = osState.bucketList.filter(isBucketCspMissing).length;
  const pruneBtn = document.getElementById('osPruneOrphansBtn');
  if (pruneBtn) {
    pruneBtn.style.display = missingCount > 0 ? '' : 'none';
    pruneBtn.innerHTML = `<i class="fas fa-broom"></i> Prune Orphans (${missingCount})`;
  }

  const selCount = osState.selectedBucketIds.size;
  const batchDelBtn = document.getElementById('osBatchDeleteBtn');
  const batchDelLbl = document.getElementById('osBatchDeleteBtnLabel');
  if (batchDelBtn) batchDelBtn.style.display = selCount > 0 ? '' : 'none';
  if (batchDelLbl) batchDelLbl.textContent = `Delete Selected (${selCount})`;

  const batchTestLbl = document.getElementById('osBatchTestBtnLabel');
  if (batchTestLbl) batchTestLbl.textContent = selCount > 0 ? `Batch E2E Test (${selCount})` : 'Batch E2E Test';

  const infoBox = document.getElementById('osFilterCspInfoBox');
  if (infoBox) {
    infoBox.innerHTML = renderFilterCspInfoBoxHtml(osState.filterProvider, osState.bucketList.length);
  }

  const tbody = document.getElementById('osBucketsTableBody');
  if (tbody) {
    tbody.innerHTML = renderBucketRows(getFilteredBuckets());
  }
}

function renderBucketRows(buckets) {
  if (!buckets || buckets.length === 0) {
    return `
      <tr>
        <td colspan="8" style="text-align: center; color: #94a3b8; padding: 28px;">
          <i class="fas fa-box-open fa-2x mb-2" style="display: block; opacity: 0.5;"></i>
          No object storage buckets match the current filter in namespace <b>${escapeHtml(osState.namespace)}</b>.<br>
          Click <b>New Bucket (Single / Multi-Cloud)</b> above to provision across 1 to 10 CSPs!
        </td>
      </tr>
    `;
  }

  return buckets.map(b => {
    const bId = escapeHtml(b.id || b.name || '');
    const cspName = escapeHtml(b.cspResourceName || b.uid || bId);
    const conn = escapeHtml(b.connectionName || '');
    const provider = (b.connectionConfig?.providerName || (b.connectionName ? b.connectionName.split('-')[0] : '')).toLowerCase();
    const provMeta = getProviderMetadata(provider);
    const sup = osState.supportMatrix?.[provider] || {};
    const isChecked = osState.selectedBucketIds.has(b.id || b.name);

    const isMissing = isBucketCspMissing(b);
    const status = b.status || 'Available';
    const statusClass = isMissing
      ? 'os-badge-danger'
      : (status === 'Available' ? 'os-badge-success' : (status === 'Failed' ? 'os-badge-danger' : 'os-badge-warning'));

    const createdRaw = b.creationDate || (b.conditions && b.conditions[0]?.lastTransitionTime ? b.conditions[0].lastTransitionTime : '');
    const created = createdRaw && !createdRaw.startsWith('0001-') ? escapeHtml(createdRaw.split('T')[0]) : '-';
    const errMsg = escapeHtml(b.systemMessage || '');

    const verState = osState.bucketVersioning[b.id] || '';

    return `
      <tr data-bucket-id="${bId}" data-provider="${escapeHtml(provider)}">
        <td style="text-align:center;">
          <input type="checkbox" class="os-bucket-row-checkbox" data-id="${bId}" ${isChecked ? 'checked' : ''}>
        </td>
        <td>
          <div style="display:flex; align-items:center; gap:6px;">
            <a href="javascript:void(0)" class="os-open-bucket" data-id="${bId}" style="font-weight:700; color:#2563eb; text-decoration:none; font-size:13.5px;">
              🪣 ${bId}
            </a>
          </div>
          <div style="font-size:11.5px; color:#64748b; margin-top:2px; font-family:monospace; display:flex; align-items:center; gap:4px;">
            <span title="Actual CSP Bucket / Container Name">CSP: ${cspName}</span>
            <button type="button" class="os-btn os-btn-secondary os-btn-copy-text" data-copy="${cspName}" title="Copy CSP Bucket Name" style="padding:1px 5px; font-size:10px;">
              <i class="far fa-copy"></i>
            </button>
          </div>
          ${b.description ? `<div style="font-size:11px; color:#94a3b8; margin-top:1px;">${escapeHtml(b.description)}</div>` : ''}
        </td>
        <td>
          <div style="display:flex; align-items:center; gap:6px;">
            <img src="${provMeta.icon}" class="os-csp-logo" onerror="this.src='/img/circle.png';" style="width:17px; height:17px;">
            <span style="font-weight:700; font-size:12.5px;">${escapeHtml(provMeta.name)}</span>
          </div>
          <div style="margin-top:3px;">
            <span class="os-badge os-badge-secondary" style="font-family:monospace; font-size:11px;">${conn}</span>
          </div>
        </td>
        <td>
          <span class="os-badge ${statusClass}" ${errMsg ? `title="${errMsg}" style="cursor:help;"` : ''}>
            ${isMissing ? '⚠️ CSP Missing' : escapeHtml(status)}
          </span>
          ${errMsg ? `<div style="font-size:11px; color:#dc2626; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${errMsg}">${errMsg}</div>` : ''}
        </td>
        <td>
          <div style="display:flex; gap:4px; flex-wrap:wrap;">
            ${sup.cors
              ? `<span class="os-badge os-badge-info" style="font-size:11px;" title="S3 CORS API supported">CORS ✓</span>`
              : `<span class="os-badge os-badge-secondary" style="font-size:11px; opacity:0.65;" title="CORS managed at CSP account/console level">CORS -</span>`}
            ${sup.versioning
              ? `<span class="os-badge ${verState === 'Enabled' ? 'os-badge-success' : 'os-badge-info'}" style="font-size:11px;" title="S3 Bucket Versioning supported">${verState ? `Ver: ${escapeHtml(verState)}` : 'Ver ✓'}</span>`
              : `<span class="os-badge os-badge-secondary" style="font-size:11px; opacity:0.65;" title="Bucket versioning not supported via S3 API">Ver -</span>`}
          </div>
        </td>
        <td style="font-size:11.5px; color:#475569; white-space:nowrap;">
          <div>Del: <code style="color:#b91c1c; font-weight:600;">${escapeHtml(provMeta.estDelete)}</code></div>
          <div>CRUD: <code style="color:#15803d; font-weight:600;">${escapeHtml(provMeta.estCrud)}</code></div>
        </td>
        <td style="color:#64748b; font-size:12px; white-space:nowrap;">${created}</td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="os-btn os-btn-primary os-btn-explore" data-id="${bId}" title="Browse, Upload & Download Objects">
            <i class="fas fa-folder-open"></i> Explore
          </button>
          <button class="os-btn os-btn-secondary os-btn-test-crud" data-id="${bId}" title="Run 5-Step Presigned URL Object CRUD Verification (${escapeHtml(provMeta.estCrud)})">
            <i class="fas fa-vial" style="color:#0284c7;"></i> Test CRUD
          </button>
          ${sup.cors ? `
            <button class="os-btn os-btn-secondary os-btn-cors" data-id="${bId}" data-provider="${escapeHtml(provider)}" title="Configure CORS (${escapeHtml(provMeta.estCors)})">
              <i class="fas fa-globe"></i> CORS
            </button>
          ` : ''}
          ${sup.versioning ? `
            <button class="os-btn os-btn-secondary os-btn-versioning" data-id="${bId}" data-provider="${escapeHtml(provider)}" title="Configure Object Versioning & View Versions">
              <i class="fas fa-history"></i> Ver.
            </button>
          ` : ''}
          <button class="os-btn os-btn-warning os-btn-empty-bucket" data-id="${bId}" title="Empty all objects in bucket (?option=empty)">
            <i class="fas fa-eraser"></i>
          </button>
          <button class="os-btn os-btn-danger os-btn-delete" data-id="${bId}" data-provider="${escapeHtml(provider)}" title="Delete Bucket (Est. ${escapeHtml(provMeta.estDelete)})">
            <i class="fas fa-trash-alt"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderCreateRegionsGrid() {
  const grid = document.getElementById('osCreateRegionsGrid');
  if (!grid) return;

  const providerMap = groupConnectionsByProvider(osState.connections);
  const selectedCsps = osState.multiCspSelected || [];
  const nameInput = document.getElementById('osBucketNameInput');
  const rawName = (nameInput?.value || 'tb-os-bucket').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  const isMulti = selectedCsps.length > 1;

  grid.innerHTML = selectedCsps.map(p => {
    const meta = getProviderMetadata(p);
    const conns = sortConnections(providerMap[p] || []);
    const currentConn = osState.selectedRegionsByCsp[p] || (conns[0]?.configName || '');
    if (currentConn) osState.selectedRegionsByCsp[p] = currentConn;
    const resolvedBucketName = isMulti ? `${rawName}-${p}`.slice(0, 63) : rawName;
    const sup = osState.supportMatrix?.[p] || {};

    return `
      <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; padding:10px 12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <img src="${meta.icon}" style="width:16px; height:16px; object-fit:contain;" onerror="this.src='/img/circle.png';">
            <strong style="font-size:12.5px; color:#0f172a;">${escapeHtml(meta.name)}</strong>
          </div>
          <span style="font-size:11px; color:#0369a1; font-weight:600;">⏱️ ${escapeHtml(meta.estCreate)}</span>
        </div>
        <select class="os-form-control os-create-region-select" data-csp="${p}" style="height:34px; font-size:12.5px; padding:4px 8px;">
          ${conns.map(c => `<option value="${escapeHtml(c.configName)}" ${c.configName === currentConn ? 'selected' : ''}>${escapeHtml(getRegionDisplay(c))}</option>`).join('')}
        </select>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px; font-size:11px; color:#64748b;">
          <span>Bucket: <code style="color:#1e293b; font-weight:600;">${escapeHtml(resolvedBucketName || '-')}</code></span>
          <span>${sup.cors ? 'CORS✓' : ''} ${sup.versioning ? 'Ver✓' : ''}</span>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.os-create-region-select').forEach(sel => {
    sel.addEventListener('change', () => {
      osState.selectedRegionsByCsp[sel.dataset.csp] = sel.value;
    });
  });

  updateCreateEstimateBanner();
}

function updateCreateEstimateBanner() {
  const summaryEl = document.getElementById('osCreateEstimateSummary');
  const submitBtn = document.getElementById('osCreateBucketSubmitBtn');
  const autoCors = document.getElementById('osAutoCorsCheckbox')?.checked ?? false;
  const csps = osState.multiCspSelected || [];
  const est = getParallelBucketCreateEstimate(csps, autoCors);

  if (summaryEl) {
    if (csps.length === 0) {
      summaryEl.innerHTML = `<span class="text-danger"><i class="fas fa-exclamation-circle"></i> Select at least 1 CSP above.</span>`;
    } else {
      summaryEl.innerHTML = `
        <strong>Target:</strong> <span class="os-badge os-badge-info">${csps.length} CSP(s) in Parallel</span> ·
        <strong>⏱️ Est. Wall-Clock Time:</strong> <code style="color:#0369a1; font-weight:700; font-size:13px;">${escapeHtml(est.label)}</code>
        ${est.slowestCsp ? `<span style="color:#64748b;">(paced by ${escapeHtml(est.slowestCsp)})</span>` : ''}
      `;
    }
  }
  if (submitBtn) {
    submitBtn.disabled = csps.length === 0;
    submitBtn.innerHTML = csps.length > 1
      ? `<i class="fas fa-rocket"></i> Provision ${csps.length} Buckets in Parallel (${escapeHtml(est.label)})`
      : `<i class="fas fa-cloud-upload-alt"></i> Create Bucket (${escapeHtml(est.label)})`;
  }
}

function setupBucketViewEvents(sortedProviderList) {
  // Refresh button
  const refreshBtn = document.getElementById('osRefreshBucketsBtn');
  if (refreshBtn) refreshBtn.onclick = () => renderModalView();

  // Reconcile All button
  const reconcileBtn = document.getElementById('osReconcileAllBtn');
  if (reconcileBtn) reconcileBtn.onclick = () => handleReconcileAllBuckets();

  // Prune Orphans button
  const pruneBtn = document.getElementById('osPruneOrphansBtn');
  if (pruneBtn) pruneBtn.onclick = () => handlePruneOrphanBuckets();

  // Batch Test CRUD button
  const batchTestBtn = document.getElementById('osBatchTestCrudBtn');
  if (batchTestBtn) batchTestBtn.onclick = () => handleBatchTestCrud();

  // Batch Delete button
  const batchDelBtn = document.getElementById('osBatchDeleteBtn');
  if (batchDelBtn) batchDelBtn.onclick = () => handleBatchDeleteBuckets();

  // Toggle Create Drawer
  const toggleDrawerBtn = document.getElementById('osToggleCreateDrawerBtn');
  const drawerCard = document.getElementById('osCreateDrawerCard');
  if (toggleDrawerBtn && drawerCard) {
    toggleDrawerBtn.onclick = () => {
      osState.isCreateOpen = !osState.isCreateOpen;
      drawerCard.style.display = osState.isCreateOpen ? 'block' : 'none';
      toggleDrawerBtn.innerHTML = `
        <i class="fas ${osState.isCreateOpen ? 'fa-chevron-up' : 'fa-plus-circle'}"></i>
        <span>${osState.isCreateOpen ? 'Hide Create Form' : 'New Bucket (Single / Multi-Cloud)'}</span>
      `;
    };
  }

  // Multi-CSP selection in Create Drawer
  document.querySelectorAll('.os-create-csp-tile').forEach(tile => {
    tile.onclick = () => {
      const p = tile.dataset.createCsp;
      if (!p) return;
      const idx = osState.multiCspSelected.indexOf(p);
      if (idx >= 0) {
        if (osState.multiCspSelected.length > 1) {
          osState.multiCspSelected.splice(idx, 1);
        }
      } else {
        osState.multiCspSelected.push(p);
      }
      document.querySelectorAll('.os-create-csp-tile').forEach(t => {
        const active = osState.multiCspSelected.includes(t.dataset.createCsp);
        t.classList.toggle('active', active);
        const chk = t.querySelector('input[type="checkbox"]');
        if (chk) chk.checked = active;
      });
      renderCreateRegionsGrid();
    };
  });

  const selectAllCreateBtn = document.getElementById('osSelectAllCreateCspsBtn');
  if (selectAllCreateBtn) {
    selectAllCreateBtn.onclick = () => {
      osState.multiCspSelected = [...sortedProviderList];
      document.querySelectorAll('.os-create-csp-tile').forEach(t => {
        t.classList.add('active');
        const chk = t.querySelector('input[type="checkbox"]');
        if (chk) chk.checked = true;
      });
      renderCreateRegionsGrid();
    };
  }

  const clearCreateBtn = document.getElementById('osClearCreateCspsBtn');
  if (clearCreateBtn) {
    clearCreateBtn.onclick = () => {
      osState.multiCspSelected = sortedProviderList.includes('aws') ? ['aws'] : sortedProviderList.slice(0, 1);
      document.querySelectorAll('.os-create-csp-tile').forEach(t => {
        const active = osState.multiCspSelected.includes(t.dataset.createCsp);
        t.classList.toggle('active', active);
        const chk = t.querySelector('input[type="checkbox"]');
        if (chk) chk.checked = active;
      });
      renderCreateRegionsGrid();
    };
  }

  const nameInput = document.getElementById('osBucketNameInput');
  const nameHint = document.getElementById('osBucketNameHint');
  if (nameInput) {
    nameInput.addEventListener('input', () => {
      const val = nameInput.value.trim();
      if (nameHint) {
        if (!val) {
          nameHint.className = 'os-validation-hint text-muted';
          nameHint.innerText = '3–63 chars, lowercase letters, numbers, and hyphens.';
        } else if (isValidBucketName(val)) {
          nameHint.className = 'os-validation-hint text-success';
          nameHint.innerHTML = '<i class="fas fa-check-circle"></i> Valid bucket name.';
        } else {
          nameHint.className = 'os-validation-hint text-danger';
          nameHint.innerHTML = '<i class="fas fa-times-circle"></i> Must be 3–63 lowercase alphanumeric characters or hyphens.';
        }
      }
      renderCreateRegionsGrid();
    });
  }

  const autoCorsChk = document.getElementById('osAutoCorsCheckbox');
  if (autoCorsChk) autoCorsChk.addEventListener('change', updateCreateEstimateBanner);

  const createSubmitBtn = document.getElementById('osCreateBucketSubmitBtn');
  if (createSubmitBtn) createSubmitBtn.onclick = () => handleCreateBucketsParallel();

  // Filter CSP chips
  document.querySelectorAll('[data-filter-csp]').forEach(chip => {
    chip.onclick = () => {
      osState.filterProvider = chip.dataset.filterCsp || 'all';
      document.querySelectorAll('[data-filter-csp]').forEach(c => {
        c.classList.toggle('active', c.dataset.filterCsp === osState.filterProvider);
      });
      syncBucketListDom();
    };
  });

  // Search input
  const searchInput = document.getElementById('osBucketSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      osState.filterText = e.target.value || '';
      const tbody = document.getElementById('osBucketsTableBody');
      if (tbody) tbody.innerHTML = renderBucketRows(getFilteredBuckets());
    });
  }

  // Select All checkbox
  const selectAllChk = document.getElementById('osSelectAllBucketsCheckbox');
  if (selectAllChk) {
    selectAllChk.addEventListener('change', () => {
      const visible = getFilteredBuckets();
      if (selectAllChk.checked) {
        visible.forEach(b => osState.selectedBucketIds.add(b.id || b.name));
      } else {
        visible.forEach(b => osState.selectedBucketIds.delete(b.id || b.name));
      }
      syncBucketListDom();
    });
  }

  // Table row actions & checkboxes
  const table = document.getElementById('osBucketsTable');
  if (table) {
    table.addEventListener('change', (e) => {
      const rowChk = e.target.closest('.os-bucket-row-checkbox');
      if (rowChk) {
        const id = rowChk.getAttribute('data-id');
        if (rowChk.checked) osState.selectedBucketIds.add(id);
        else osState.selectedBucketIds.delete(id);
        syncBucketListDom();
      }
    });

    table.addEventListener('click', async (e) => {
      const copyBtn = e.target.closest('.os-btn-copy-text');
      if (copyBtn) {
        const txt = copyBtn.getAttribute('data-copy') || '';
        navigator.clipboard?.writeText(txt);
        showModalNotice(`Copied "${txt}" to clipboard.`, 'info', 2500);
        return;
      }

      const exploreBtn = e.target.closest('.os-btn-explore') || e.target.closest('.os-open-bucket');
      if (exploreBtn) {
        const bucketId = exploreBtn.getAttribute('data-id');
        const matched = osState.bucketList.find(b => b.id === bucketId || b.name === bucketId);
        osState.currentBucket = matched || { id: bucketId, name: bucketId };
        osState.view = 'objects';
        renderModalView();
        return;
      }

      const testCrudBtn = e.target.closest('.os-btn-test-crud');
      if (testCrudBtn) {
        const bucketId = testCrudBtn.getAttribute('data-id');
        const matched = osState.bucketList.find(b => b.id === bucketId || b.name === bucketId);
        if (matched) await runE2eObjectCrudBenchmark([matched]);
        return;
      }

      const corsBtn = e.target.closest('.os-btn-cors');
      if (corsBtn) {
        const bucketId = corsBtn.getAttribute('data-id');
        const provider = corsBtn.getAttribute('data-provider') || '';
        handleConfigureCors(bucketId, provider);
        return;
      }

      const verBtn = e.target.closest('.os-btn-versioning');
      if (verBtn) {
        const bucketId = verBtn.getAttribute('data-id');
        const provider = verBtn.getAttribute('data-provider') || '';
        handleVersioningDialog(bucketId, provider);
        return;
      }

      const emptyBtn = e.target.closest('.os-btn-empty-bucket');
      if (emptyBtn) {
        const bucketId = emptyBtn.getAttribute('data-id');
        handleEmptyBucket(bucketId);
        return;
      }

      const deleteBtn = e.target.closest('.os-btn-delete');
      if (deleteBtn) {
        const bucketId = deleteBtn.getAttribute('data-id');
        const provider = deleteBtn.getAttribute('data-provider') || '';
        handleDeleteBucket(bucketId, provider);
      }
    });
  }
}

// --- Parallel Multi-Cloud / Single-Cloud Bucket Provisioning ---
async function handleCreateBucketsParallel() {
  const nameInput = document.getElementById('osBucketNameInput');
  const descInput = document.getElementById('osDescriptionInput');
  const autoCors = document.getElementById('osAutoCorsCheckbox')?.checked ?? false;
  const autoVersioning = document.getElementById('osAutoVersioningCheckbox')?.checked ?? false;

  const baseName = (nameInput?.value || '').trim().toLowerCase();
  const description = (descInput?.value || '').trim();
  const targetCsps = [...(osState.multiCspSelected || [])];

  if (!isValidBucketName(baseName)) {
    showModalNotice('Please provide a valid bucket name (3–63 lowercase alphanumeric characters or hyphens).', 'warning');
    nameInput?.focus();
    return;
  }
  if (targetCsps.length === 0) {
    showModalNotice('Please select at least one Cloud Service Provider.', 'warning');
    return;
  }

  const isMulti = targetCsps.length > 1;
  const tasks = targetCsps.map(csp => {
    const conn = osState.selectedRegionsByCsp[csp] || '';
    const bucketName = isMulti ? `${baseName}-${csp}`.slice(0, 63) : baseName;
    const meta = getProviderMetadata(csp);
    return { csp, conn, bucketName, meta };
  }).filter(t => t.conn);

  if (tasks.length === 0) {
    showModalNotice('No valid connection selected for the chosen CSP(s).', 'warning');
    return;
  }

  const est = getParallelBucketCreateEstimate(targetCsps, autoCors);
  const op = createBackgroundOperation({
    title: isMulti ? `Provisioning ${tasks.length} Object Storage Buckets in Parallel` : `Provisioning Bucket "${tasks[0].bucketName}" on ${tasks[0].meta.shortName}`,
    subtitle: `Namespace: ${osState.namespace}`,
    estLabel: est.label,
    steps: tasks.map(t => ({
      key: t.csp,
      title: `${t.meta.shortName} (${t.bucketName})`,
      desc: `Creating on ${t.conn} (Est. ${t.meta.estCreate})...`,
      status: 'running',
    })),
  });

  // Collapse create drawer so user immediately sees the Background Operations panel and table updates
  osState.isCreateOpen = false;
  const drawerCard = document.getElementById('osCreateDrawerCard');
  if (drawerCard) drawerCard.style.display = 'none';
  const toggleDrawerBtn = document.getElementById('osToggleCreateDrawerBtn');
  if (toggleDrawerBtn) {
    toggleDrawerBtn.innerHTML = `<i class="fas fa-plus-circle"></i> <span>New Bucket (Single / Multi-Cloud)</span>`;
  }

  const config = getConfig();
  let passCount = 0;
  let failCount = 0;

  await Promise.all(tasks.map(async (t) => {
    const step = op.steps.find(s => s.key === t.csp);
    const t0 = Date.now();
    try {
      const res = await axios.put(`${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage`, {
        bucketName: t.bucketName,
        connectionName: t.conn,
        description: description || `Multi-cloud Object Storage bucket on ${t.meta.name}`,
      }, {
        auth: { username: config.username, password: config.password },
        headers: { 'Content-Type': 'application/json' },
      });

      const createSec = ((Date.now() - t0) / 1000).toFixed(1);
      const extras = [];
      const sup = osState.supportMatrix?.[t.csp] || {};

      if (autoCors && sup.cors) {
        if (step) {
          step.desc = `Created (${createSec}s) · Applying CORS (${t.meta.estCors})...`;
          renderActiveOperationsPanelIfOpen();
        }
        try {
          await enableDefaultCors(osState.namespace, t.bucketName);
          extras.push('CORS✓');
        } catch (corsErr) {
          extras.push('CORS⚠️');
        }
      }

      if (autoVersioning && sup.versioning) {
        if (step) {
          step.desc = `Created (${createSec}s) · Enabling Versioning...`;
          renderActiveOperationsPanelIfOpen();
        }
        try {
          await axios.put(
            `${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${t.bucketName}/versioning`,
            { status: 'Enabled' },
            { auth: { username: config.username, password: config.password } }
          );
          osState.bucketVersioning[t.bucketName] = 'Enabled';
          extras.push('Ver:Enabled✓');
        } catch (verErr) {
          extras.push('Ver⚠️');
        }
      }

      const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
      const cspBucket = res.data?.cspResourceName || res.data?.uid || t.bucketName;
      if (step) {
        step.status = 'completed';
        step.desc = `Ready in ${totalSec}s (CSP: ${cspBucket}) ${extras.join(' ')}`;
      }
      passCount++;
    } catch (err) {
      const durSec = ((Date.now() - t0) / 1000).toFixed(1);
      const msg = err.response?.data?.message || err.message || 'Creation failed';
      if (step) {
        step.status = 'failed';
        step.desc = `Failed (${durSec}s): ${msg}`;
      }
      failCount++;
    } finally {
      renderActiveOperationsPanelIfOpen();
      await refreshBucketsSilently();
    }
  }));

  op.endTime = Date.now();
  op.status = failCount === 0 ? 'completed' : (passCount > 0 ? 'warning' : 'failed');
  op.summaryHtml = `<b>Result:</b> ${passCount}/${tasks.length} bucket(s) provisioned in <b>${formatElapsedSec(op.startTime, op.endTime)}</b>.`;
  renderActiveOperationsPanelIfOpen();
  await refreshBucketsSilently();
}

// --- 5-Step Presigned URL E2E Object CRUD Verification ---
async function runE2eObjectCrudBenchmark(buckets) {
  if (!buckets || buckets.length === 0) {
    showModalNotice('No buckets available to test.', 'warning');
    return;
  }

  const csps = buckets.map(b => (b.connectionConfig?.providerName || (b.connectionName ? b.connectionName.split('-')[0] : '')).toLowerCase());
  const op = createBackgroundOperation({
    title: `5-Step Presigned URL Object CRUD Verification (${buckets.length} Bucket${buckets.length === 1 ? '' : 's'})`,
    subtitle: 'Upload URL -> PUT -> List/HEAD -> Download & Verify -> Delete Object',
    estLabel: csps.includes('ibm') ? '~20–28s' : (csps.includes('tencent') ? '~15–20s' : '~2–12s'),
    steps: buckets.map(b => {
      const p = (b.connectionConfig?.providerName || (b.connectionName ? b.connectionName.split('-')[0] : '')).toLowerCase();
      const m = getProviderMetadata(p);
      return {
        key: b.id,
        title: `${m.shortName}: ${b.id}`,
        desc: `[1/5] Generating Presigned Upload URL...`,
        status: 'running',
      };
    }),
  });

  const config = getConfig();
  let passCount = 0;
  let failCount = 0;

  await Promise.all(buckets.map(async (b) => {
    const bId = b.id || b.name;
    const step = op.steps.find(s => s.key === bId);
    const probeKey = `cb-mapui-probe-${Date.now()}.txt`;
    const payload = `Cloud-Barista Object Storage E2E Probe on ${bId} at ${new Date().toISOString()}`;
    const t0 = Date.now();

    try {
      // [1/5] Generate Upload Presigned URL
      const upUrlRes = await axios.post(
        `${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bId}/object/${encodeURIComponent(probeKey)}/presignedUrl?operation=upload&expires=3600`,
        {},
        { auth: { username: config.username, password: config.password } }
      );
      const upUrl = upUrlRes.data?.presignedURL;
      const reqHeaders = upUrlRes.data?.requiredHeaders || {};
      const browserSafeHeaders = Object.fromEntries(
        Object.entries(reqHeaders).filter(([k]) => k.toLowerCase() !== 'host')
      );
      if (!upUrl) throw new Error('Empty upload presignedURL');

      // [2/5] Direct PUT upload to CSP (use clean axios instance without Tumblebug interceptors)
      const cspDirectHttp = axios.create();
      if (step) {
        step.desc = `[2/5] Uploading ${payload.length}B via Presigned PUT...`;
        renderActiveOperationsPanelIfOpen();
      }
      const p = (b.connectionConfig?.providerName || (b.connectionName ? b.connectionName.split('-')[0] : '')).toLowerCase();
      const corsSupported = osState.supportMatrix?.[p]?.cors !== false;
      const isHttpsToHttp = window.location?.protocol === 'https:' && upUrl.startsWith('http://');

      let directPutBlockedByBrowserPolicy = false;
      try {
        await cspDirectHttp.put(upUrl, payload, {
          headers: {
            'Content-Type': 'text/plain',
            ...browserSafeHeaders,
          },
        });
      } catch (putErr) {
        const isCorsOrNet = putErr.message && (putErr.message.includes('Network Error') || putErr.message.includes('CORS'));
        if (isCorsOrNet && (!corsSupported || isHttpsToHttp)) {
          directPutBlockedByBrowserPolicy = true;
        } else {
          throw putErr;
        }
      }

      if (directPutBlockedByBrowserPolicy) {
        // Verify remaining Control-Plane APIs: Object List & Download Presigned URL generation
        if (step) {
          step.desc = `[Control-Plane] Verifying ListDataObjects & Download Presigned URL...`;
          renderActiveOperationsPanelIfOpen();
        }
        const [listRes, dlUrlRes] = await Promise.all([
          axios.get(`${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bId}/object`, {
            auth: { username: config.username, password: config.password },
          }),
          axios.post(
            `${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bId}/object/${encodeURIComponent(probeKey)}/presignedUrl?operation=download&expires=3600`,
            {},
            { auth: { username: config.username, password: config.password } }
          ),
        ]);
        const listOk = Array.isArray(listRes.data?.objects) || (listRes.status >= 200 && listRes.status < 300);
        const dlUrlOk = Boolean(dlUrlRes.data?.presignedURL);
        const durSec = ((Date.now() - t0) / 1000).toFixed(2);
        const skipReason = isHttpsToHttp
          ? 'Browser Mixed Content on HTTPS; use http://localhost:8080 for Direct PUT'
          : `${p.toUpperCase()} has no S3 CORS API; Direct PUT via CLI/SDK`;
        if (step) {
          step.status = (listOk && dlUrlOk) ? 'warning' : 'failed';
          step.desc = `PASS (Control-Plane) in ${durSec}s · UpURL✓ DlURL:${dlUrlOk ? '✓' : '✗'} List:${listOk ? '✓' : '✗'} (Browser Direct PUT skipped: ${skipReason})`;
        }
        if (listOk && dlUrlOk) {
          passCount++;
        } else {
          failCount++;
        }
        return;
      }

      // [3/5] List Objects & HEAD Object Info
      if (step) {
        step.desc = `[3/5] Verifying ListDataObjects & HEAD metadata...`;
        renderActiveOperationsPanelIfOpen();
      }
      const [listRes, headRes] = await Promise.all([
        axios.get(`${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bId}/object`, {
          auth: { username: config.username, password: config.password },
        }),
        axios.head(`${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bId}/object/${encodeURIComponent(probeKey)}`, {
          auth: { username: config.username, password: config.password },
        }),
      ]);
      const objs = listRes.data?.objects || [];
      const inList = objs.some(o => o.key === probeKey);
      const etag = headRes.headers?.etag || headRes.headers?.ETag || 'verified';

      // [4/5] Presigned Download & Verify Content
      if (step) {
        step.desc = `[4/5] Downloading via Presigned GET & verifying content...`;
        renderActiveOperationsPanelIfOpen();
      }
      const dlUrlRes = await axios.post(
        `${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bId}/object/${encodeURIComponent(probeKey)}/presignedUrl?operation=download&expires=3600`,
        {},
        { auth: { username: config.username, password: config.password } }
      );
      const dlUrl = dlUrlRes.data?.presignedURL;
      const dlRes = await cspDirectHttp.get(dlUrl, { responseType: 'text' });
      const verified = typeof dlRes.data === 'string' && dlRes.data.includes(bId);

      // [5/5] Delete Probe Object
      if (step) {
        step.desc = `[5/5] Cleaning up probe object (${probeKey})...`;
        renderActiveOperationsPanelIfOpen();
      }
      await axios.delete(
        `${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bId}/object/${encodeURIComponent(probeKey)}`,
        { auth: { username: config.username, password: config.password } }
      );

      const durSec = ((Date.now() - t0) / 1000).toFixed(2);
      if (step) {
        step.status = (inList && verified) ? 'completed' : 'warning';
        step.desc = `PASS in ${durSec}s · PUT✓ List:${inList ? '✓' : '⚠️'} HEAD(ETag:${etag})✓ GET:${verified ? '✓' : '⚠️'} DEL✓`;
      }
      passCount++;
    } catch (err) {
      const durSec = ((Date.now() - t0) / 1000).toFixed(2);
      const isCorsOrNet = err.message && (err.message.includes('Network Error') || err.message.includes('CORS'));
      const msg = isCorsOrNet
        ? 'Browser CORS blocked direct PUT/GET (Click CORS button on bucket to enable *)'
        : (err.response?.data?.message || err.message || 'CRUD test failed');
      if (step) {
        step.status = 'failed';
        step.desc = `Failed (${durSec}s): ${msg}`;
      }
      failCount++;
    } finally {
      renderActiveOperationsPanelIfOpen();
    }
  }));

  op.endTime = Date.now();
  const hasWarning = op.steps.some(st => st.status === 'warning');
  op.status = failCount === 0 ? (hasWarning ? 'warning' : 'completed') : (passCount > 0 ? 'warning' : 'failed');
  op.summaryHtml = `<b>5-Step Presigned URL CRUD Summary:</b> ${passCount}/${buckets.length} bucket(s) verified in <b>${formatElapsedSec(op.startTime, op.endTime)}</b>.`;
  renderActiveOperationsPanelIfOpen();
}

async function handleBatchTestCrud() {
  const selectedIds = osState.selectedBucketIds;
  const targets = selectedIds.size > 0
    ? osState.bucketList.filter(b => selectedIds.has(b.id || b.name))
    : getFilteredBuckets();

  if (targets.length === 0) {
    showModalNotice('No buckets available to test.', 'warning');
    return;
  }
  await runE2eObjectCrudBenchmark(targets);
}

// --- Reconcile All & Prune Orphans ---
async function handleReconcileAllBuckets() {
  const config = getConfig();
  const spinnerId = addSpinnerTask('Reconciling Object Storage buckets');
  try {
    const res = await axios.put(
      `${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/reconcile`,
      {},
      { auth: { username: config.username, password: config.password } }
    );
    const total = res.data?.total ?? osState.bucketList.length;
    const synced = res.data?.synced ?? 0;
    const missing = res.data?.cspResourceMissing ?? 0;
    showModalNotice(
      `Reconcile complete: ${total} checked (${synced} Available, ${missing} Missing on CSP).`,
      missing > 0 ? 'warning' : 'success'
    );
    await refreshBucketsSilently();
  } catch (err) {
    showModalNotice(`Reconcile failed: ${err.response?.data?.message || err.message}`, 'error');
  } finally {
    removeSpinnerTask(spinnerId);
  }
}

async function handlePruneOrphanBuckets() {
  const missingBuckets = osState.bucketList.filter(isBucketCspMissing);
  const confirmed = await showModalConfirm({
    title: 'Prune Orphaned Bucket Metadata?',
    html: `Purge Tumblebug metadata for <b>${missingBuckets.length}</b> bucket(s) diagnosed as missing on CSP?<br><small style="color:#64748b;">(${missingBuckets.map(b => escapeHtml(b.id)).join(', ')})</small>`,
    icon: 'warning',
    confirmText: '🧹 Prune Orphans',
    confirmButtonClass: 'os-btn-primary',
  });
  if (!confirmed) return;

  const config = getConfig();
  try {
    const res = await axios.post(
      `${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/reconcile/prune`,
      {},
      { auth: { username: config.username, password: config.password } }
    );
    showModalNotice(`Pruned ${res.data?.deleted ?? missingBuckets.length} orphaned bucket record(s).`, 'success');
    await refreshBucketsSilently();
  } catch (err) {
    showModalNotice(`Prune failed: ${err.response?.data?.message || err.message}`, 'error');
  }
}

// --- Empty Bucket (?option=empty) ---
async function handleEmptyBucket(bucketId) {
  const confirmed = await showModalConfirm({
    title: `Empty Bucket "${bucketId}"?`,
    html: `This will permanently delete <b>all objects and versions</b> inside bucket <b>${escapeHtml(bucketId)}</b> while keeping the bucket itself (<code>DELETE ...?option=empty</code>).`,
    icon: 'warning',
    confirmText: '🧹 Yes, Empty Bucket',
    confirmButtonClass: 'os-btn-danger',
  });
  if (!confirmed) return;

  const config = getConfig();
  const spinnerId = addSpinnerTask(`Emptying bucket ${bucketId}`);
  try {
    await axios.delete(
      `${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bucketId}?option=empty`,
      { auth: { username: config.username, password: config.password } }
    );
    showModalNotice(`Bucket "${bucketId}" emptied successfully.`, 'success');
    if (osState.view === 'objects' && (osState.currentBucket?.id === bucketId || osState.currentBucket?.name === bucketId)) {
      await loadObjectsList(bucketId);
    } else {
      await refreshBucketsSilently();
    }
  } catch (err) {
    showModalNotice(`Failed to empty bucket: ${err.response?.data?.message || err.message}`, 'error');
  } finally {
    removeSpinnerTask(spinnerId);
  }
}

// --- Single & Batch Bucket Deletion (with Force Delete Option & Estimated Time) ---
async function handleDeleteBucket(bucketId, provider = '') {
  const meta = getProviderMetadata(provider);
  let useForce = true;

  const confirmed = await showModalConfirm({
    title: `Delete Bucket "${bucketId}"?`,
    html: `
      <div style="text-align:left; font-size:13.5px;">
        <p style="margin-bottom:10px;">Are you sure you want to delete bucket <b>${escapeHtml(bucketId)}</b> on <b>${escapeHtml(meta.name)}</b>?</p>
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px; margin-bottom:10px;">
          <div style="font-size:12.5px; color:#0369a1; font-weight:600; margin-bottom:6px;">
            ⏱️ Estimated Deletion Time: <code>${escapeHtml(meta.estDelete)}</code>
          </div>
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; color:#0f172a; margin:0;">
            <input type="checkbox" id="osDeleteForceCheckbox" checked>
            <span><b>Force Delete (<code>?option=force</code>)</b> — Automatically remove all objects & versions before deleting the bucket</span>
          </label>
        </div>
      </div>
    `,
    icon: 'danger',
    confirmText: `🗑️ Delete (${meta.estDelete})`,
    confirmButtonClass: 'os-btn-danger',
    onBeforeConfirm: () => {
      const chk = document.getElementById('osDeleteForceCheckbox');
      return { force: chk ? chk.checked : true };
    },
  });

  if (!confirmed) return;
  if (typeof confirmed === 'object' && confirmed !== null) {
    useForce = Boolean(confirmed.force);
  }

  await executeBucketsDelete([{ id: bucketId, provider }], useForce);
}

async function handleBatchDeleteBuckets() {
  const ids = [...osState.selectedBucketIds];
  if (ids.length === 0) return;

  const targets = ids.map(id => {
    const b = osState.bucketList.find(x => (x.id || x.name) === id);
    const provider = (b?.connectionConfig?.providerName || (b?.connectionName ? b.connectionName.split('-')[0] : '')).toLowerCase();
    return { id, provider };
  });

  const est = getParallelBucketDeleteEstimate(targets.map(t => t.provider));
  let useForce = true;

  const confirmed = await showModalConfirm({
    title: `Batch Delete ${targets.length} Bucket(s)?`,
    html: `
      <div style="text-align:left; font-size:13.5px;">
        <p style="margin-bottom:8px;">Delete <b>${targets.length}</b> selected bucket(s) in parallel?</p>
        <div style="max-height:100px; overflow:auto; font-family:monospace; font-size:12px; background:#f1f5f9; padding:8px; border-radius:6px; margin-bottom:10px;">
          ${targets.map(t => escapeHtml(t.id)).join(', ')}
        </div>
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 12px;">
          <div style="font-size:12.5px; color:#0369a1; font-weight:600; margin-bottom:6px;">
            ⏱️ Estimated Parallel Deletion Time: <code>${escapeHtml(est.label)}</code> ${est.slowestCsp ? `(paced by ${escapeHtml(est.slowestCsp)})` : ''}
          </div>
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; color:#0f172a; margin:0;">
            <input type="checkbox" id="osBatchDeleteForceCheckbox" checked>
            <span><b>Force Delete (<code>?option=force</code>)</b> — Delete even if buckets contain objects/versions</span>
          </label>
        </div>
      </div>
    `,
    icon: 'danger',
    confirmText: `🗑️ Delete ${targets.length} Buckets (${est.label})`,
    confirmButtonClass: 'os-btn-danger',
    onBeforeConfirm: () => {
      const chk = document.getElementById('osBatchDeleteForceCheckbox');
      return { force: chk ? chk.checked : true };
    },
  });

  if (!confirmed) return;
  if (typeof confirmed === 'object' && confirmed !== null) {
    useForce = Boolean(confirmed.force);
  }

  await executeBucketsDelete(targets, useForce);
}

async function executeBucketsDelete(targets, useForce = true) {
  const est = getParallelBucketDeleteEstimate(targets.map(t => t.provider));
  const op = createBackgroundOperation({
    title: targets.length > 1 ? `Deleting ${targets.length} Buckets in Parallel` : `Deleting Bucket "${targets[0].id}"`,
    subtitle: useForce ? 'Mode: Force Delete (?option=force)' : 'Mode: Standard Delete',
    estLabel: est.label,
    steps: targets.map(t => {
      const m = getProviderMetadata(t.provider);
      return {
        key: t.id,
        title: `${m.shortName}: ${t.id}`,
        desc: `Deleting from CSP (Est. ${m.estDelete})...`,
        status: 'running',
      };
    }),
  });

  const config = getConfig();
  let passCount = 0;
  let failCount = 0;

  await Promise.all(targets.map(async (t) => {
    const step = op.steps.find(s => s.key === t.id);
    const t0 = Date.now();
    try {
      const q = useForce ? '?option=force' : '';
      await axios.delete(`${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${t.id}${q}`, {
        auth: { username: config.username, password: config.password },
      });
      const durSec = ((Date.now() - t0) / 1000).toFixed(1);
      if (step) {
        step.status = 'completed';
        step.desc = `Deleted in ${durSec}s`;
      }
      osState.selectedBucketIds.delete(t.id);
      passCount++;
    } catch (err) {
      const durSec = ((Date.now() - t0) / 1000).toFixed(1);
      const msg = err.response?.data?.message || err.message || 'Delete failed';
      if (step) {
        step.status = 'failed';
        step.desc = `Failed (${durSec}s): ${msg}`;
      }
      failCount++;
    } finally {
      renderActiveOperationsPanelIfOpen();
      await refreshBucketsSilently();
    }
  }));

  op.endTime = Date.now();
  op.status = failCount === 0 ? 'completed' : (passCount > 0 ? 'warning' : 'failed');
  op.summaryHtml = `<b>Deletion Summary:</b> ${passCount}/${targets.length} bucket(s) deleted in <b>${formatElapsedSec(op.startTime, op.endTime)}</b>.`;
  renderActiveOperationsPanelIfOpen();
  await refreshBucketsSilently();
}

// --- Versioning & Object Versions Dialog ---
async function handleVersioningDialog(bucketId, provider = '') {
  const config = getConfig();
  let verStatus = 'Unversioned';
  let versionsList = [];
  let deleteMarkers = [];

  try {
    const [vRes, listRes] = await Promise.all([
      axios.get(`${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bucketId}/versioning`, {
        auth: { username: config.username, password: config.password },
      }).catch(() => ({ data: { status: 'Unversioned' } })),
      axios.get(`${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bucketId}/versions`, {
        auth: { username: config.username, password: config.password },
      }).catch(() => ({ data: {} })),
    ]);
    verStatus = vRes.data?.status || 'Unversioned';
    osState.bucketVersioning[bucketId] = verStatus;
    versionsList = listRes.data?.version || [];
    deleteMarkers = listRes.data?.deleteMarker || [];
  } catch (err) {
    console.warn('[ObjectStorage] Versioning fetch warning:', err);
  }

  const allVersions = [
    ...versionsList.map(v => ({ ...v, isDeleteMarker: false })),
    ...deleteMarkers.map(d => ({ ...d, isDeleteMarker: true })),
  ];

  const action = await new Promise((resolve) => {
    const overlay = document.getElementById('osConfirmOverlay');
    const titleEl = document.getElementById('osConfirmTitle');
    const bodyEl = document.getElementById('osConfirmBody');
    const iconEl = document.getElementById('osConfirmIcon');
    const actionsEl = document.getElementById('osConfirmActions');

    if (!overlay || !titleEl || !bodyEl || !actionsEl) {
      resolve('close');
      return;
    }

    titleEl.innerText = `🕓 Object Versioning: ${bucketId}`;
    if (iconEl) {
      iconEl.innerHTML = '<div style="width:52px;height:52px;border-radius:50%;background:#e0f2fe;display:flex;align-items:center;justify-content:center;margin:0 auto 14px auto;"><i class="fas fa-history" style="font-size:24px;color:#0284c7;"></i></div>';
    }

    const badgeClass = verStatus === 'Enabled' ? 'os-badge-success' : 'os-badge-secondary';
    bodyEl.innerHTML = `
      <div style="text-align:left; font-size:13.5px;">
        <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:10px 12px; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:10px;">
          <div>
            <b>Current Status:</b> <span class="os-badge ${badgeClass}" style="margin-left:6px;">${escapeHtml(verStatus)}</span>
          </div>
          <span style="font-size:12px; color:#64748b;">Stored Versions: <b>${versionsList.length}</b> · Delete Markers: <b>${deleteMarkers.length}</b></span>
        </div>
        ${allVersions.length > 0 ? `
          <div style="max-height:180px; overflow:auto; border:1px solid #e2e8f0; border-radius:6px;">
            <table class="os-table" style="font-size:12px;">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Version ID</th>
                  <th>Type</th>
                  <th>Size</th>
                </tr>
              </thead>
              <tbody>
                ${allVersions.slice(0, 30).map(v => `
                  <tr>
                    <td><b>${escapeHtml(v.key || '')}</b> ${v.isLatest ? '<span class="os-badge os-badge-info" style="font-size:10px;">Latest</span>' : ''}</td>
                    <td style="font-family:monospace; font-size:11px;">${escapeHtml((v.versionId || 'null').slice(0, 22))}</td>
                    <td>${v.isDeleteMarker ? '<span class="os-badge os-badge-danger" style="font-size:10px;">DeleteMarker</span>' : '<span class="os-badge os-badge-secondary" style="font-size:10px;">Version</span>'}</td>
                    <td>${v.isDeleteMarker ? '-' : formatBytes(v.size)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `<div style="text-align:center; color:#94a3b8; padding:14px; background:#f8fafc; border-radius:6px;">No versioned objects recorded yet.</div>`}
      </div>
    `;

    actionsEl.innerHTML = `
      <div style="display:flex; gap:8px; justify-content:flex-end; width:100%; flex-wrap:wrap;">
        <button id="osVerCloseBtn" class="os-btn os-btn-secondary">Close</button>
        ${verStatus === 'Enabled'
          ? `<button id="osVerSuspendBtn" class="os-btn os-btn-warning"><i class="fas fa-pause"></i> Suspend Versioning</button>`
          : `<button id="osVerEnableBtn" class="os-btn os-btn-primary"><i class="fas fa-check"></i> Enable Versioning</button>`}
      </div>
    `;

    overlay.style.display = 'flex';
    const closeBtn = document.getElementById('osVerCloseBtn');
    const enableBtn = document.getElementById('osVerEnableBtn');
    const suspendBtn = document.getElementById('osVerSuspendBtn');
    if (closeBtn) closeBtn.onclick = () => { overlay.style.display = 'none'; resolve('close'); };
    if (enableBtn) enableBtn.onclick = () => { overlay.style.display = 'none'; resolve('Enabled'); };
    if (suspendBtn) suspendBtn.onclick = () => { overlay.style.display = 'none'; resolve('Suspended'); };
  });

  if (action === 'Enabled' || action === 'Suspended') {
    try {
      await axios.put(
        `${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bucketId}/versioning`,
        { status: action },
        { auth: { username: config.username, password: config.password } }
      );
      osState.bucketVersioning[bucketId] = action;
      showModalNotice(`Bucket "${bucketId}" versioning set to ${action}.`, 'success');
      if (osState.view === 'buckets') syncBucketListDom();
      else await renderModalView();
    } catch (err) {
      showModalNotice(`Failed to update versioning: ${err.response?.data?.message || err.message}`, 'error');
    }
  }
}

// -------------------------------------------------------------------------------------------------
// VIEW 2: OBJECT (FILE) EXPLORER VIEW
// -------------------------------------------------------------------------------------------------
async function renderObjectExplorerView(container) {
  const b = osState.currentBucket || {};
  const bId = escapeHtml(b.id || b.name || '');
  const cspName = escapeHtml(b.cspResourceName || b.uid || bId);
  const conn = escapeHtml(b.connectionName || '');
  const provider = (b.connectionConfig?.providerName || (b.connectionName ? b.connectionName.split('-')[0] : '')).toLowerCase();
  const provMeta = getProviderMetadata(provider);
  const sup = osState.supportMatrix?.[provider] || {};

  container.innerHTML = `
    <!-- Top Explorer Bar -->
    <div class="os-header-bar">
      <div class="os-header-title">
        <button id="osBackToBucketsBtn" class="os-btn os-btn-secondary">
          <i class="fas fa-arrow-left"></i> All Buckets
        </button>
        <img src="${provMeta.icon}" style="width:20px; height:20px; object-fit:contain;" onerror="this.src='/img/circle.png';">
        <span>🪣 <b>${bId}</b></span>
        <span class="os-badge os-badge-secondary" style="font-family:monospace;" title="Actual CSP Bucket Name">CSP: ${cspName}</span>
        ${conn ? `<span class="os-badge os-badge-info" style="font-family:monospace;">${conn}</span>` : ''}
        <span id="osExplorerLocationBadge" class="os-badge os-badge-secondary" style="display:none;"></span>
        <span id="osExplorerVersioningBadge" class="os-badge os-badge-secondary" style="display:none;"></span>
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        <button id="osExplorerTestCrudBtn" class="os-btn os-btn-secondary" title="Run 5-Step Presigned URL Object CRUD Verification">
          <i class="fas fa-vial" style="color:#0284c7;"></i> Test CRUD (${escapeHtml(provMeta.estCrud)})
        </button>
        ${sup.cors ? `
          <button id="osEnableCorsBtn" class="os-btn os-btn-secondary" title="Configure CORS on this bucket">
            <i class="fas fa-globe"></i> CORS
          </button>
        ` : ''}
        ${sup.versioning ? `
          <button id="osExplorerVersioningBtn" class="os-btn os-btn-secondary" title="Manage Versioning & Object Versions">
            <i class="fas fa-history"></i> Versioning
          </button>
        ` : ''}
        <button id="osExplorerEmptyBtn" class="os-btn os-btn-warning" title="Empty all objects in this bucket (?option=empty)">
          <i class="fas fa-eraser"></i> Empty Bucket
        </button>
        <button id="osRefreshObjectsBtn" class="os-btn os-btn-secondary" title="Refresh object list">
          <i class="fas fa-sync-alt"></i> Refresh
        </button>
      </div>
    </div>

    <!-- Active Background Operations Container -->
    <div id="osActiveOpsContainer"></div>

    <!-- Drag & Drop Upload Zone -->
    <div class="os-card">
      <div id="osDropzone" class="os-dropzone">
        <i class="fas fa-cloud-upload-alt fa-2x text-primary" style="margin-bottom:6px;"></i>
        <div style="font-weight:700; font-size:13.5px;">Drag & Drop file(s) here, or <span style="color:#2563eb; text-decoration:underline;">Browse</span></div>
        <div class="text-muted" style="font-size:12px; margin-top:3px;">
          Direct binary PUT to <b>${escapeHtml(provMeta.name)}</b> via Tumblebug Presigned URL
          ${provider === 'azure' ? ' (automatically attaches <code>x-ms-blob-type: BlockBlob</code>)' : ''}
        </div>
        <input type="file" id="osFileInput" multiple style="display:none;">
      </div>
      <div id="osUploadProgressContainer" style="display:none;">
        <div style="display:flex; justify-content:space-between; font-size:12px; color:#475569;">
          <span id="osUploadFileName">Uploading file...</span>
          <span id="osUploadPercentage">0%</span>
        </div>
        <div class="os-progress-bar">
          <div id="osProgressFill" class="os-progress-fill"></div>
        </div>
      </div>
    </div>

    <!-- Objects List Card -->
    <div class="os-card" style="margin-bottom:0;">
      <h6>
        <span><i class="fas fa-file-alt text-secondary"></i> Objects / Files (<span id="osExplorerObjectsCount">0</span>)</span>
        <input type="text" id="osObjectSearchInput" placeholder="🔍 Search object keys..." style="padding:4px 10px; font-size:12.5px; border:1.5px solid #cbd5e1; border-radius:6px; width:240px;">
      </h6>
      <div class="os-table-container">
        <table class="os-table" id="osObjectsTable">
          <thead>
            <tr>
              <th>Object Key (File Name)</th>
              <th>Size</th>
              <th>ETag</th>
              <th>Storage Class</th>
              <th>Last Modified</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody id="osObjectsTableBody">
            <tr><td colspan="6" style="text-align:center; padding:22px; color:#94a3b8;"><i class="fas fa-circle-notch fa-spin"></i> Loading objects...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  renderActiveOperationsPanelIfOpen();
  setupObjectViewEvents(provider);
  await loadObjectsList(b.id || b.name, provider);
}

async function loadObjectsList(bucketId, provider = '') {
  const tbody = document.getElementById('osObjectsTableBody');
  if (!tbody) return;

  const config = getConfig();
  const sup = osState.supportMatrix?.[provider] || {};

  try {
    const [objRes, locRes, verRes] = await Promise.all([
      axios.get(`${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bucketId}/object`, {
        auth: { username: config.username, password: config.password },
      }),
      axios.get(`${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bucketId}/location`, {
        auth: { username: config.username, password: config.password },
      }).catch(() => null),
      sup.versioning
        ? axios.get(`${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bucketId}/versioning`, {
            auth: { username: config.username, password: config.password },
          }).catch(() => null)
        : Promise.resolve(null),
    ]);

    osState.objectList = (objRes.data && objRes.data.objects) ? objRes.data.objects : [];

    const countEl = document.getElementById('osExplorerObjectsCount');
    if (countEl) countEl.textContent = String(osState.objectList.length);

    if (locRes?.data?.locationConstraint) {
      const locBadge = document.getElementById('osExplorerLocationBadge');
      if (locBadge) {
        locBadge.style.display = 'inline-flex';
        locBadge.textContent = `📍 Location: ${locRes.data.locationConstraint}`;
      }
    }
    if (verRes?.data?.status) {
      osState.bucketVersioning[bucketId] = verRes.data.status;
      const verBadge = document.getElementById('osExplorerVersioningBadge');
      if (verBadge) {
        verBadge.style.display = 'inline-flex';
        verBadge.className = `os-badge ${verRes.data.status === 'Enabled' ? 'os-badge-success' : 'os-badge-secondary'}`;
        verBadge.textContent = `🕓 Versioning: ${verRes.data.status}`;
      }
    }
  } catch (err) {
    console.error('[ObjectStorage] Load objects error:', err);
    osState.objectList = [];
  }

  tbody.innerHTML = renderObjectRows(osState.objectList);
}

function renderObjectRows(objects) {
  if (!objects || objects.length === 0) {
    return `
      <tr>
        <td colspan="6" style="text-align:center; color:#94a3b8; padding:26px;">
          <i class="fas fa-folder-open fa-2x mb-2" style="display:block; opacity:0.5;"></i>
          No objects in this bucket yet.<br>
          Drag and drop file(s) above or click <b>Test CRUD</b> to verify Presigned URL upload & download!
        </td>
      </tr>
    `;
  }

  return objects.map(o => {
    const key = escapeHtml(o.key || '');
    const size = formatBytes(o.size);
    const etag = escapeHtml((o.eTag || '-').replace(/"/g, ''));
    const storageClass = escapeHtml(o.storageClass || 'STANDARD');
    const lastMod = o.lastModified ? escapeHtml(o.lastModified.replace('T', ' ').replace('Z', '')) : '-';

    return `
      <tr data-key="${key}">
        <td>
          <i class="far fa-file-alt text-primary" style="margin-right:6px;"></i>
          <b>${key}</b>
        </td>
        <td><span class="os-badge os-badge-secondary">${size}</span></td>
        <td style="font-family:monospace; font-size:11.5px; color:#64748b;">${etag}</td>
        <td><span class="os-badge os-badge-info">${storageClass}</span></td>
        <td style="color:#64748b; font-size:12px;">${lastMod}</td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="os-btn os-btn-secondary os-btn-head-object" data-key="${key}" title="Verify Object Metadata via HEAD API">
            <i class="fas fa-info-circle"></i> Info
          </button>
          <button class="os-btn os-btn-secondary os-btn-copy-presigned" data-key="${key}" title="Generate & Copy Presigned Download URL (1h)">
            <i class="fas fa-link"></i> Copy URL
          </button>
          <button class="os-btn os-btn-primary os-btn-download" data-key="${key}" title="Download file via Presigned URL">
            <i class="fas fa-download"></i> Download
          </button>
          <button class="os-btn os-btn-danger os-btn-delete-object" data-key="${key}" title="Delete object">
            <i class="fas fa-trash-alt"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function setupObjectViewEvents(provider = '') {
  const bucketId = osState.currentBucket?.id || osState.currentBucket?.name;

  const backBtn = document.getElementById('osBackToBucketsBtn');
  if (backBtn) {
    backBtn.onclick = () => {
      osState.view = 'buckets';
      renderModalView();
    };
  }

  const refreshBtn = document.getElementById('osRefreshObjectsBtn');
  if (refreshBtn) refreshBtn.onclick = () => loadObjectsList(bucketId, provider);

  const testCrudBtn = document.getElementById('osExplorerTestCrudBtn');
  if (testCrudBtn) {
    testCrudBtn.onclick = async () => {
      await runE2eObjectCrudBenchmark([osState.currentBucket]);
      await loadObjectsList(bucketId, provider);
    };
  }

  const corsBtn = document.getElementById('osEnableCorsBtn');
  if (corsBtn) corsBtn.onclick = () => handleConfigureCors(bucketId, provider);

  const verBtn = document.getElementById('osExplorerVersioningBtn');
  if (verBtn) verBtn.onclick = () => handleVersioningDialog(bucketId, provider);

  const emptyBtn = document.getElementById('osExplorerEmptyBtn');
  if (emptyBtn) emptyBtn.onclick = () => handleEmptyBucket(bucketId);

  const searchInput = document.getElementById('osObjectSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase().trim();
      document.querySelectorAll('#osObjectsTableBody tr').forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(query) ? '' : 'none';
      });
    });
  }

  const dropzone = document.getElementById('osDropzone');
  const fileInput = document.getElementById('osFileInput');
  if (dropzone && fileInput) {
    dropzone.onclick = () => fileInput.click();
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer?.files?.length > 0) {
        for (const f of e.dataTransfer.files) {
          await uploadFileToBucket(f, bucketId, provider);
        }
      }
    });
    fileInput.addEventListener('change', async () => {
      if (fileInput.files?.length > 0) {
        for (const f of fileInput.files) {
          await uploadFileToBucket(f, bucketId, provider);
        }
      }
    });
  }

  const table = document.getElementById('osObjectsTable');
  if (table) {
    table.addEventListener('click', async (e) => {
      const headBtn = e.target.closest('.os-btn-head-object');
      if (headBtn) {
        const key = headBtn.getAttribute('data-key');
        await handleInspectObjectHead(bucketId, key);
        return;
      }

      const copyUrlBtn = e.target.closest('.os-btn-copy-presigned');
      if (copyUrlBtn) {
        const key = copyUrlBtn.getAttribute('data-key');
        await handleCopyPresignedDownloadUrl(bucketId, key);
        return;
      }

      const downloadBtn = e.target.closest('.os-btn-download');
      if (downloadBtn) {
        const key = downloadBtn.getAttribute('data-key');
        handleDownloadObject(bucketId, key);
        return;
      }

      const deleteBtn = e.target.closest('.os-btn-delete-object');
      if (deleteBtn) {
        const key = deleteBtn.getAttribute('data-key');
        handleDeleteObject(bucketId, key, provider);
      }
    });
  }
}

// Upload file using Presigned URL (merges requiredHeaders such as x-ms-blob-type: BlockBlob for Azure!)
async function uploadFileToBucket(file, bucketId, provider = '') {
  if (!file) return;

  const objectKey = file.name;
  const progressContainer = document.getElementById('osUploadProgressContainer');
  const fileNameLabel = document.getElementById('osUploadFileName');
  const percentLabel = document.getElementById('osUploadPercentage');
  const progressFill = document.getElementById('osProgressFill');

  if (progressContainer) progressContainer.style.display = 'block';
  if (fileNameLabel) fileNameLabel.innerText = `Uploading ${file.name} (${formatBytes(file.size)})...`;
  if (percentLabel) percentLabel.innerText = '0%';
  if (progressFill) progressFill.style.width = '0%';

  const config = getConfig();
  try {
    // 1. Request presigned upload URL from Tumblebug
    const urlRes = await axios.post(
      `${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bucketId}/object/${encodeURIComponent(objectKey)}/presignedUrl?operation=upload&expires=3600`,
      {},
      { auth: { username: config.username, password: config.password } }
    );

    const presignedURL = urlRes.data?.presignedURL;
    const requiredHeaders = urlRes.data?.requiredHeaders || {};
    const browserSafeHeaders = Object.fromEntries(
      Object.entries(requiredHeaders).filter(([k]) => k.toLowerCase() !== 'host')
    );
    if (!presignedURL) {
      throw new Error('Did not receive a presigned URL from server');
    }

    // 2. Perform direct binary PUT upload to the CSP (including requiredHeaders for Azure BlockBlob)
    const cspDirectHttp = axios.create();
    await cspDirectHttp.put(presignedURL, file, {
      headers: {
        'Content-Type': file.type || 'application/octet-stream',
        ...browserSafeHeaders,
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          if (percentLabel) percentLabel.innerText = `${percent}%`;
          if (progressFill) progressFill.style.width = `${percent}%`;
        }
      },
    });

    showModalNotice(`File "${file.name}" uploaded successfully!`, 'success');
    await loadObjectsList(bucketId, provider);
  } catch (err) {
    console.error('[ObjectStorage] Upload failed:', err);
    if (err.message && (err.message.includes('Network Error') || err.message.includes('CORS'))) {
      const pKey = (provider || '').toLowerCase();
      const corsSupported = !pKey || osState.supportMatrix?.[pKey]?.cors !== false;
      if (!corsSupported) {
        showModalNotice(
          `Upload blocked by browser CORS policy. ${provider.toUpperCase()} does not provide a bucket CORS API — please enable CORS in the ${provider.toUpperCase()} console or upload via Presigned URL CLI.`,
          'warning',
          7000
        );
      } else {
        const askCors = await showModalConfirm({
          title: 'Upload Blocked by Browser CORS Policy',
          html: `Browser direct upload was blocked by CSP CORS policy.<br><small class="text-muted" style="display:block; margin-top:6px;">Would you like to auto-configure CORS rules on bucket <b>${escapeHtml(bucketId)}</b> and retry?</small>`,
          icon: 'warning',
          confirmText: '🌐 Enable CORS & Retry',
          confirmButtonClass: 'os-btn-primary',
          cancelText: 'Cancel',
        });
        if (askCors) {
          try {
            await enableDefaultCors(osState.namespace, bucketId);
            showModalNotice('CORS enabled! Please retry uploading the file.', 'success');
          } catch (corsErr) {
            showModalNotice(`Failed to enable CORS: ${corsErr.response?.data?.message || corsErr.message}`, 'error');
          }
        }
      }
    } else {
      showModalNotice(`Upload failed: ${err.response?.data?.message || err.message}`, 'error');
    }
  } finally {
    if (progressContainer) progressContainer.style.display = 'none';
    const fileInput = document.getElementById('osFileInput');
    if (fileInput) fileInput.value = '';
  }
}

async function handleInspectObjectHead(bucketId, objectKey) {
  const config = getConfig();
  try {
    const res = await axios.head(
      `${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bucketId}/object/${encodeURIComponent(objectKey)}`,
      { auth: { username: config.username, password: config.password } }
    );
    const etag = res.headers?.etag || res.headers?.ETag || '-';
    const lastMod = res.headers?.['last-modified'] || res.headers?.['Last-Modified'] || '-';
    showModalNotice(`HEAD "${objectKey}" -> 200 OK (ETag: ${etag}, Last-Modified: ${lastMod})`, 'info', 6000);
  } catch (err) {
    showModalNotice(`HEAD "${objectKey}" failed: ${err.response?.data?.message || err.message}`, 'error');
  }
}

async function handleCopyPresignedDownloadUrl(bucketId, objectKey) {
  const config = getConfig();
  try {
    const res = await axios.post(
      `${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bucketId}/object/${encodeURIComponent(objectKey)}/presignedUrl?operation=download&expires=3600`,
      {},
      { auth: { username: config.username, password: config.password } }
    );
    const downloadUrl = res.data?.presignedURL;
    const reqHeaders = res.data?.requiredHeaders || {};
    if (!downloadUrl) throw new Error('Failed to generate Presigned URL');
    await navigator.clipboard?.writeText(downloadUrl);
    const hostNote = reqHeaders.Host ? ` (Required Header: Host: ${reqHeaders.Host})` : '';
    showModalNotice(`Copied 1-hour Presigned Download URL for "${objectKey}" to clipboard!${hostNote}`, 'success', 6000);
  } catch (err) {
    showModalNotice(`Failed to generate URL: ${err.response?.data?.message || err.message}`, 'error');
  }
}

async function handleDownloadObject(bucketId, objectKey) {
  const config = getConfig();
  try {
    const res = await axios.post(
      `${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bucketId}/object/${encodeURIComponent(objectKey)}/presignedUrl?operation=download&expires=3600`,
      {},
      { auth: { username: config.username, password: config.password } }
    );

    const downloadUrl = res.data?.presignedURL;
    if (!downloadUrl) throw new Error('Failed to generate download URL');

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = objectKey;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('[ObjectStorage] Download error:', err);
    showModalNotice(`Download failed: ${err.response?.data?.message || err.message}`, 'error');
  }
}

async function handleDeleteObject(bucketId, objectKey, provider = '') {
  const confirmed = await showModalConfirm({
    title: 'Delete Object?',
    html: `Are you sure you want to delete object "<b>${escapeHtml(objectKey)}</b>"?`,
    icon: 'danger',
    confirmText: '🗑️ Delete Object',
    confirmButtonClass: 'os-btn-danger',
    cancelText: 'Cancel',
  });

  if (!confirmed) return;

  const config = getConfig();
  try {
    await axios.delete(
      `${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bucketId}/object/${encodeURIComponent(objectKey)}`,
      { auth: { username: config.username, password: config.password } }
    );
    showModalNotice(`Object "${objectKey}" deleted.`, 'success');
    await loadObjectsList(bucketId, provider);
  } catch (err) {
    console.error('[ObjectStorage] Object deletion failed:', err);
    showModalNotice(`Failed to delete object: ${err.response?.data?.message || err.message}`, 'error');
  }
}

export async function enableDefaultCors(nsId, osId) {
  const config = getConfig();
  const corsPayload = {
    corsRule: [
      {
        allowedMethod: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
        allowedOrigin: ['*'],
        allowedHeader: ['*'],
        exposeHeader: ['Content-Type', 'ETag', 'x-amz-request-id', 'Content-Length'],
        maxAgeSeconds: 3000,
      },
    ],
  };

  return await axios.put(
    `${tbApiBase()}/ns/${nsId}/resources/objectStorage/${osId}/cors`,
    corsPayload,
    {
      auth: { username: config.username, password: config.password },
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

async function handleConfigureCors(bucketId, provider = '') {
  const config = getConfig();
  let currentRules = [];

  try {
    const res = await axios.get(`${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bucketId}/cors`, {
      auth: { username: config.username, password: config.password },
    });
    currentRules = res.data?.corsRule || [];
  } catch (err) {
    console.log('No CORS configured yet or CORS fetch error');
  }

  const action = await showModalCorsDialog(bucketId, currentRules, provider);
  if (action === 'apply') {
    const meta = getProviderMetadata(provider);
    const spinnerId = addSpinnerTask(`Applying CORS on ${bucketId} (${meta.estCors})`);
    try {
      await enableDefaultCors(osState.namespace, bucketId);
      showModalNotice(`Default CORS rules (*) applied on "${bucketId}".`, 'success');
    } catch (err) {
      showModalNotice(`Failed to set CORS: ${err.response?.data?.message || err.message}`, 'error');
    } finally {
      removeSpinnerTask(spinnerId);
    }
  } else if (action === 'delete') {
    try {
      await axios.delete(`${tbApiBase()}/ns/${osState.namespace}/resources/objectStorage/${bucketId}/cors`, {
        auth: { username: config.username, password: config.password },
      });
      showModalNotice(`CORS rules removed from "${bucketId}".`, 'success');
    } catch (err) {
      showModalNotice(`Failed to remove CORS: ${err.response?.data?.message || err.message}`, 'error');
    }
  }
}

// Expose globally for index.html and other modules
window.showObjectStorageModal = showObjectStorageModal;
