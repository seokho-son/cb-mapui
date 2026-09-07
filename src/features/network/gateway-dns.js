/**
 * Global DNS (Route53) & Nginx Gateway Feature Module
 * @module features/network/gateway-dns
 */
import Swal from 'sweetalert2';
import axios from 'axios';
import { tbApiBase, getConfig } from '../../core/api.js';
import { escapeHtml } from '../../core/utils.js';
import { POPUP_STYLES } from '../../common/popup-styles.js';

const esc = escapeHtml;
const addSpinnerTask = (name) => (window.addSpinnerTask ? window.addSpinnerTask(name) : name);
const removeSpinnerTask = (id) => { if (window.removeSpinnerTask) window.removeSpinnerTask(id); };
const errorAlert = (msg) => (window.errorAlert ? window.errorAlert(msg) : Swal.fire({ icon: 'error', title: msg, showConfirmButton: true }));
const successAlert = (msg) => (window.successAlert ? window.successAlert(msg) : Swal.fire({ icon: 'success', title: msg, showConfirmButton: false, timer: 2500 }));
const showRemoteCmdResult = (...args) => (window.showRemoteCmdResult ? window.showRemoteCmdResult(...args) : console.log('showRemoteCmdResult', ...args));

// =====================================================================
// Global DNS Management (Route53)
// =====================================================================

async function showDnsManagementModal(preselectedInfraId) {
  const config = getConfig();
  const namespace = window.configNamespace || config.namespace || 'default';

  // Build Infra source section - if preselectedInfraId, pre-fill it
  const infraSourceChecked = preselectedInfraId ? 'checked' : '';
  const ipsSourceChecked = preselectedInfraId ? '' : 'checked';
  const infraIdValue = preselectedInfraId || '';

  // Load hosted zones dynamically
  let hostedZoneOptions = '<option value="">Loading...</option>';
  let hostedZoneWarning = '';
  try {
    const hzResp = await axios.get(`${tbApiBase()}/resources/globalDns/hostedZone`, {
      auth: { username: config.username, password: config.password }, timeout: 15000
    });
    const zones = hzResp.data?.hostedZones || [];
    if (zones.length > 0) {
      hostedZoneOptions = zones.map(z => {
        const name = z.name.replace(/\.$/, '');
        const safeName = window.escapeHtml(name);
        return `<option value="${safeName}">${safeName} (${z.recordCount} records)</option>`;
      }).join('');
    } else {
      hostedZoneOptions = '<option value="">(No hosted zones)</option>';
      hostedZoneWarning = '<div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 10px; margin-bottom: 12px; font-size: 11px; color: #856404;">'
        + '<b>⚠️ No hosted zones found.</b><br>'
        + 'AWS credentials are configured, but no Route53 hosted zones exist.<br>'
        + 'To use this feature, create a hosted zone in <a href="https://console.aws.amazon.com/route53/v2/hostedzones" target="_blank" style="color: #533f03;">AWS Route53 Console</a>.'
        + '</div>';
    }
  } catch (e) {
    const errMsg = e.response?.data?.message || e.message || '';
    hostedZoneOptions = '<option value="">(Unavailable)</option>';
    if (errMsg.includes('VAULT_TOKEN') || errMsg.includes('OpenBao') || errMsg.includes('secret')) {
      hostedZoneWarning = '<div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 6px; padding: 10px; margin-bottom: 12px; font-size: 11px; color: #721c24;">'
        + '<b>🔑 AWS credentials not configured.</b><br>'
        + 'This feature requires AWS credentials stored in OpenBao (Vault).<br>'
        + '<b>Setup:</b> Store <code>AWS_ACCESS_KEY_ID</code>, <code>AWS_SECRET_ACCESS_KEY</code>, <code>AWS_DEFAULT_REGION</code> at <code>secret/csp/aws</code> in OpenBao, and set <code>VAULT_TOKEN</code> env variable.'
        + '</div>';
    } else {
      hostedZoneWarning = '<div style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 6px; padding: 10px; margin-bottom: 12px; font-size: 11px; color: #721c24;">'
        + '<b>❌ Failed to load hosted zones.</b><br>'
        + (errMsg ? window.escapeHtml(errMsg) : 'Could not connect to the server or an unexpected error occurred.')
        + '</div>';
    }
  }

  const html = `
    <div style="text-align: left; font-size: 14px;">
      ${hostedZoneWarning}
      <!-- Hosted Zone Selector -->
      <div style="margin-bottom: 12px;">
        <label style="font-size: 12px; color: #6c757d; font-weight: bold;">Hosted Zone (Domain)</label>
        <select id="dns-hosted-zone" class="swal2-input" style="margin: 4px 0; font-size: 13px; height: 40px; width: 100%;">
          ${hostedZoneOptions}
        </select>
      </div>

      <!-- Query Section -->
      <div style="background: #f8f9fa; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
        <h6 style="margin: 0 0 10px 0; color: #495057;">🔍 Query DNS Records</h6>
        <div style="display: flex; gap: 8px; align-items: end;">
          <div style="flex: 1;">
            <label style="font-size: 12px; color: #6c757d;">Record Name (optional)</label>
            <input type="text" id="dns-query-record" class="swal2-input" style="margin: 4px 0; font-size: 13px;" placeholder="subdomain">
          </div>
          <div>
            <button id="dns-query-btn" class="btn btn-primary" style="height: 40px; white-space: nowrap;">Query</button>
          </div>
        </div>
        <div id="dns-query-result" style="margin-top: 10px; display: none; max-height: 300px; overflow-y: auto;">
        </div>
      </div>

      <!-- Upsert Section -->
      <div style="background: #f0f8ff; border-radius: 8px; padding: 15px;">
        <h6 style="margin: 0 0 10px 0; color: #495057;">✏️ Create / Update DNS Record (UPSERT)</h6>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          <div>
            <label style="font-size: 12px; color: #6c757d;">Record Name</label>
            <input type="text" id="dns-upsert-record" class="swal2-input" style="margin: 4px 0; font-size: 13px;" placeholder="subdomain (auto-appended to domain)">
          </div>
          <div>
            <label style="font-size: 12px; color: #6c757d;">Record Type</label>
            <select id="dns-upsert-type" class="swal2-input" style="margin: 4px 0; font-size: 13px; height: 40px;">
              <option value="A">A</option>
              <option value="AAAA">AAAA</option>
              <option value="CNAME">CNAME</option>
              <option value="TXT">TXT</option>
            </select>
          </div>
          <div>
            <label style="font-size: 12px; color: #6c757d;">TTL (seconds)</label>
            <input type="number" id="dns-upsert-ttl" class="swal2-input" style="margin: 4px 0; font-size: 13px;" value="300" min="1">
          </div>
          <div>
            <label style="font-size: 12px; color: #6c757d;">Routing Policy</label>
            <select id="dns-routing-policy" class="swal2-input" style="margin: 4px 0; font-size: 13px; height: 40px;">
              <option value="simple">Simple (all IPs returned)</option>
              <option value="weighted">Weighted 1:1:1 (Route53 picks one per query)</option>
              <option value="geoproximity">Geoproximity (nearest server)</option>
            </select>
          </div>
        </div>

        <div id="dns-weighted-info" style="display: none; margin-top: 8px; padding: 8px; background: #fff3cd; border-radius: 4px; font-size: 12px; color: #856404;">
          ℹ️ <strong>Weighted</strong>: One A-record per IP, each with weight 1. Route53 picks one record per DNS query in proportion to its weight. TTL 30s recommended.
        </div>

        <div id="dns-geoproxy-info" style="display: none; margin-top: 8px; padding: 8px; background: #e8f4f8; border-radius: 4px; font-size: 12px; color: #0c5460;">
          ℹ️ <strong>Geoproximity</strong>: Each Node gets its own record with lat/lng coordinates. Route53 routes users to the nearest server. Infra source required (Node location data needed).
        </div>

        <div style="margin-top: 12px;">
          <label style="font-size: 12px; color: #6c757d; font-weight: bold;">IP Source (choose one):</label>
          
          <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 8px;">
            <!-- Method 1: Infra + optional Label filter -->
            <div style="background: white; border: 1px solid #dee2e6; border-radius: 6px; padding: 10px;">
              <label style="font-size: 13px; cursor: pointer;">
                <input type="radio" name="dns-ip-source" value="infra" ${infraSourceChecked} style="margin-right: 6px;">
                <strong>Infra</strong> — Collect Public IPs from Nodes in Infra
              </label>
              <div id="dns-source-infra-fields" style="margin-top: 6px; display: ${preselectedInfraId ? 'block' : 'none'};">
                <div style="display: flex; gap: 8px; align-items: center;">
                  <div style="flex: 1;">
                    <label style="font-size: 11px; color: #888;">Namespace</label>
                    <input type="text" id="dns-infra-nsid" class="swal2-input" style="margin: 2px 0; font-size: 12px;" placeholder="Namespace" value="${namespace}">
                  </div>
                  <div style="flex: 1;">
                    <label style="font-size: 11px; color: #888;">Infra</label>
                    <select id="dns-infra-id" class="swal2-input" style="margin: 2px 0; font-size: 12px; height: 38px;">
                      <option value="">Loading...</option>
                    </select>
                  </div>
                </div>
                <!-- Optional Label Filter -->
                <div style="margin-top: 10px; border-top: 1px dashed #dee2e6; padding-top: 8px;">
                  <div style="font-size: 11px; color: #495057; margin-bottom: 6px;">🏷️ <strong>Label Filter</strong> <span style="color: #888;">(optional — narrow down Nodes by labels)</span></div>
                  <div id="selectedLabelsDisplay" style="min-height: 28px; padding: 4px 8px; border: 1px solid #ced4da; border-radius: 4px;
                       background: white; margin-bottom: 6px; display: flex; flex-wrap: wrap; align-items: center; gap: 4px;">
                    <span id="labelPlaceholder" style="color: #999; font-size: 11px;">No filter — all Nodes in Infra will be used</span>
                  </div>
                  <input type="hidden" id="labelSelector" value="">
                  <div style="margin-bottom: 6px;">
                    <button type="button" id="clearLabelSelector"
                      style="padding: 3px 8px; background: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer; font-size: 10px;">
                      Clear All
                    </button>
                  </div>
                  <div style="font-size: 11px; color: #666; margin-bottom: 4px;"><strong>Available Labels</strong> (click to add/remove)</div>
                  <div id="availableLabelsContainer" style="padding: 8px; background: #f8f9fa; border-radius: 4px; min-height: 36px;">
                    <span style="color: #999; font-size: 11px;">Select an Infra to see available labels...</span>
                  </div>
                  <div id="labelMatchPreview" style="margin-top: 6px; padding: 6px; background: #e7f3ff; border-radius: 4px; display: none;">
                    <span style="font-size: 11px; color: #0066cc;">
                      <strong>Matching Nodes:</strong> <span id="matchingNodeCount">0</span> / <span id="totalNodeCount">0</span>
                    </span>
                    <div id="matchingVmList" style="margin-top: 4px; font-size: 10px; color: #666; max-height: 50px; overflow-y: auto;"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Method 2: Manual IPs -->
            <div id="dns-source-ips-container" style="background: white; border: 1px solid #dee2e6; border-radius: 6px; padding: 10px;">
              <label style="font-size: 13px; cursor: pointer;">
                <input type="radio" name="dns-ip-source" value="ips" ${ipsSourceChecked} style="margin-right: 6px;">
                <strong>Manual IPs</strong> — Enter IP addresses directly
              </label>
              <div id="dns-source-ips-fields" style="margin-top: 6px; display: ${preselectedInfraId ? 'none' : 'block'};">
                <input type="text" id="dns-manual-ips" class="swal2-input" style="margin: 2px 0; font-size: 12px;" placeholder="1.2.3.4, 5.6.7.8 (comma-separated)">
              </div>
            </div>
          </div>
        </div>

        <div style="margin-top: 12px; text-align: right;">
          <button id="dns-upsert-btn" class="btn btn-success" style="padding: 8px 24px;">
            Update DNS Record
          </button>
        </div>
        <div id="dns-upsert-result" style="margin-top: 10px; display: none;"></div>
      </div>
    </div>
  `;

  Swal.fire({
    title: '🌐 Global DNS Management (Route53)',
    html: html,
    showConfirmButton: false,
    showCancelButton: true,
    cancelButtonText: '❌ Close',
    width: '780px',
    customClass: {
      popup: 'swal2-infra-context'
    },
    didOpen: () => {
      // Routing policy toggle
      const policySelect = document.getElementById('dns-routing-policy');
      const geoInfo     = document.getElementById('dns-geoproxy-info');
      const weightedInfo = document.getElementById('dns-weighted-info');
      const ipsContainer = document.getElementById('dns-source-ips-container');
      const ttlInput = document.getElementById('dns-upsert-ttl');

      policySelect.addEventListener('change', function() {
        const isGeo      = this.value === 'geoproximity';
        const isWeighted = this.value === 'weighted';
        geoInfo.style.display      = isGeo      ? 'block' : 'none';
        weightedInfo.style.display = isWeighted ? 'block' : 'none';
        // Suggest TTL 30s for weighted, restore 300 otherwise
        if (isWeighted && ttlInput && ttlInput.value === '300') ttlInput.value = '30';
        if (!isWeighted && ttlInput && ttlInput.value === '30') ttlInput.value = '300';
        ipsContainer.style.opacity = isGeo ? '0.5' : '1';
        if (isGeo) {
          const ipsRadio = document.querySelector('input[name="dns-ip-source"][value="ips"]');
          if (ipsRadio.checked) {
            const infraRadio = document.querySelector('input[name="dns-ip-source"][value="infra"]');
            infraRadio.checked = true;
            infraRadio.dispatchEvent(new Event('change'));
          }
          ipsRadio.disabled = true;
        } else {
          document.querySelector('input[name="dns-ip-source"][value="ips"]').disabled = false;
        }
      });

      // Radio button toggle for IP source fields
      document.querySelectorAll('input[name="dns-ip-source"]').forEach(radio => {
        radio.addEventListener('change', function() {
          document.getElementById('dns-source-infra-fields').style.display = this.value === 'infra' ? 'block' : 'none';
          document.getElementById('dns-source-ips-fields').style.display = this.value === 'ips' ? 'block' : 'none';
        });
      });

      // When Infra dropdown changes, fetch Node data and update available labels
      document.getElementById('dns-infra-id').addEventListener('change', async function() {
        var infraId = this.value;
        var labelContainer = document.getElementById('availableLabelsContainer');
        var preview = document.getElementById('labelMatchPreview');
        // Clear label state
        var labelInput = document.getElementById('labelSelector');
        if (labelInput) labelInput.value = '';
        if (window.updateSelectedLabelsDisplay) window.updateSelectedLabelsDisplay();
        if (preview) preview.style.display = 'none';

        if (!infraId) {
          if (labelContainer) labelContainer.innerHTML = '<span style="color: #999; font-size: 11px;">Select an Infra to see available labels...</span>';
          return;
        }
        // Always fetch fresh Infra detail (cached data may lack Node labels)
        if (labelContainer) labelContainer.innerHTML = '<span style="color: #999; font-size: 11px;"><i class="fas fa-spinner fa-spin"></i> Loading labels...</span>';
        try {
          var nsId = document.getElementById('dns-infra-nsid').value.trim();
          var infraDetailUrl = tbApiBase() + '/ns/' + nsId + '/infra/' + infraId;
          var resp = await axios.get(infraDetailUrl, { auth: { username: config.username, password: config.password }, timeout: 15000 });
          var infraDetail = resp.data;
          if (infraDetail && infraDetail.node) {
            if (!window.cloudBaristaCentralData) window.cloudBaristaCentralData = {};
            if (!window.cloudBaristaCentralData.infraData) window.cloudBaristaCentralData.infraData = [];
            window.cloudBaristaCentralData.infraData = window.cloudBaristaCentralData.infraData.filter(function(m) { return m.id !== infraId; });
            window.cloudBaristaCentralData.infraData.push(infraDetail);
          }
        } catch (e) {
          console.error('[DNS] Failed to fetch Infra detail for labels:', e);
          if (labelContainer) labelContainer.innerHTML = '<span style="color: #dc3545; font-size: 11px;">Failed to load labels</span>';
        }
        if (window.updateAvailableLabels) {
          window.updateAvailableLabels(infraId);
          if (window.setupClearLabelButtonListener) window.setupClearLabelButtonListener();
          if (window.setupSelectedLabelsEventListeners) window.setupSelectedLabelsEventListeners();
        }
      });

      // Helper: Load Infra list into a <select> element
      async function loadInfraList(nsId, selectEl, preselect) {
        selectEl.innerHTML = '<option value="">Loading...</option>';
        if (!nsId) { selectEl.innerHTML = '<option value="">(No namespace)</option>'; return; }
        try {
          var infraUrl = tbApiBase() + '/ns/' + nsId + '/infra?option=id';
          const infraResp = await axios.get(infraUrl, {
            auth: { username: config.username, password: config.password }, timeout: 15000
          });
          const infraList = infraResp.data?.output || [];
          if (infraList.length === 0) {
            selectEl.innerHTML = '<option value="">(No Infras found)</option>';
            return;
          }
          selectEl.innerHTML = '';
          infraList.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            if (m === preselect) opt.selected = true;
            selectEl.appendChild(opt);
          });
        } catch (e) {
          selectEl.innerHTML = '<option value="">(Failed to load)</option>';
        }
      }

      // Initialize Infra dropdown and auto-load labels
      const infraSelect = document.getElementById('dns-infra-id');
      loadInfraList(namespace, infraSelect, infraIdValue).then(function() {
        if (infraSelect.value) {
          infraSelect.dispatchEvent(new Event('change'));
        }
      });

      // Reload Infra list when namespace changes
      const nsInput = document.getElementById('dns-infra-nsid');
      if (nsInput) {
        nsInput.addEventListener('change', function() {
          loadInfraList(this.value, infraSelect, '').then(function() {
            if (infraSelect.value) infraSelect.dispatchEvent(new Event('change'));
          });
        });
      }

      // Query button handler
      document.getElementById('dns-query-btn').addEventListener('click', async function() {
        const domain = document.getElementById('dns-hosted-zone').value;
        if (!domain) {
          document.getElementById('dns-query-result').style.display = 'block';
          document.getElementById('dns-query-result').innerHTML = '<div style="color: red;">Please select a hosted zone first.</div>';
          return;
        }
        const recordName = document.getElementById('dns-query-record').value.trim();
        const resultDiv = document.getElementById('dns-query-result');
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<div style="color: #6c757d;"><i class="fas fa-spinner fa-spin"></i> Querying...</div>';

        try {
          let url = `${tbApiBase()}/resources/globalDns/record?domainName=${encodeURIComponent(domain)}`;
          if (recordName) url += `&recordName=${encodeURIComponent(recordName)}`;
          const resp = await axios.get(url, { auth: { username: config.username, password: config.password }, timeout: 30000 });
          const records = resp.data?.record || [];
          if (records.length === 0) {
            resultDiv.innerHTML = '<div style="color: #6c757d;">No records found.</div>';
          } else {
            // Count deletable records (not NS/SOA)
            const deletableRecords = records.filter(r => r.type !== 'NS' && r.type !== 'SOA');
            let bulkBar = '';
            if (deletableRecords.length > 1) {
              bulkBar = `<div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                <label style="font-size: 11px; cursor: pointer; user-select: none;">
                  <input type="checkbox" id="dns-select-all" style="margin-right: 4px;">Select All
                </label>
                <span id="dns-selected-count" style="font-size: 11px; color: #6c757d;">0 selected</span>
                <button id="dns-bulk-delete-btn" class="btn btn-sm btn-danger" style="padding: 2px 10px; font-size: 11px; margin-left: auto;" disabled>
                  🗑️ Delete Selected
                </button>
              </div>`;
            }

            let tableHtml = '<table style="width: 100%; font-size: 11px; border-collapse: collapse;">';
            tableHtml += '<tr style="background: #e9ecef;"><th style="padding: 5px; border: 1px solid #dee2e6; width: 24px;"></th><th style="padding: 5px; border: 1px solid #dee2e6;">Name</th><th style="padding: 5px; border: 1px solid #dee2e6;">Type</th><th style="padding: 5px; border: 1px solid #dee2e6;">TTL</th><th style="padding: 5px; border: 1px solid #dee2e6;">Values</th><th style="padding: 5px; border: 1px solid #dee2e6;">Policy</th><th style="padding: 5px; border: 1px solid #dee2e6;">Actions</th></tr>';
            records.forEach((r, idx) => {
              const esc = window.escapeHtml;
              const policyBadge = r.routingPolicy === 'geoproximity'
                ? `<span style="background: #17a2b8; color: white; padding: 1px 5px; border-radius: 3px; font-size: 10px;">geo</span> ${esc(r.geoLatitude || '')},${esc(r.geoLongitude || '')}`
                : r.routingPolicy === 'weighted'
                ? `<span style="background: #fd7e14; color: white; padding: 1px 5px; border-radius: 3px; font-size: 10px;">weighted</span>`
                : `<span style="background: #6c757d; color: white; padding: 1px 5px; border-radius: 3px; font-size: 10px;">${esc(r.routingPolicy || 'simple')}</span>`;
              const setIdInfo = r.setIdentifier ? `<br><span style="color: #888; font-size: 10px;">id: ${esc(r.setIdentifier)}</span>` : '';
              const isDeletable = r.type !== 'NS' && r.type !== 'SOA';
              const checkbox = isDeletable
                ? `<input type="checkbox" class="dns-row-check" data-idx="${idx}" data-name="${esc(r.name)}" data-type="${esc(r.type)}" data-setid="${esc(r.setIdentifier || '')}">`
                : '';
              const deleteBtn = isDeletable
                ? `<button class="btn btn-sm btn-outline-danger dns-delete-btn" data-name="${esc(r.name)}" data-type="${esc(r.type)}" data-setid="${esc(r.setIdentifier || '')}" style="padding: 1px 6px; font-size: 11px;">🗑️</button>`
                : '';
              tableHtml += `<tr>
                <td style="padding: 5px; border: 1px solid #dee2e6; text-align: center;">${checkbox}</td>
                <td style="padding: 5px; border: 1px solid #dee2e6; word-break: break-all;">${esc(r.name)}${setIdInfo}</td>
                <td style="padding: 5px; border: 1px solid #dee2e6;">${esc(r.type)}</td>
                <td style="padding: 5px; border: 1px solid #dee2e6;">${r.ttl}</td>
                <td style="padding: 5px; border: 1px solid #dee2e6; word-break: break-all;">${(r.values || []).map(v => esc(v)).join(', ')}</td>
                <td style="padding: 5px; border: 1px solid #dee2e6;">${policyBadge}</td>
                <td style="padding: 5px; border: 1px solid #dee2e6; text-align: center;">${deleteBtn}</td>
              </tr>`;
            });
            tableHtml += '</table>';
            resultDiv.innerHTML = bulkBar + tableHtml;

            // Helper: update selected count and bulk button state
            function updateBulkState() {
              const checked = resultDiv.querySelectorAll('.dns-row-check:checked');
              const countSpan = document.getElementById('dns-selected-count');
              const bulkBtn = document.getElementById('dns-bulk-delete-btn');
              if (countSpan) countSpan.textContent = checked.length + ' selected';
              if (bulkBtn) bulkBtn.disabled = checked.length === 0;
              // Sync "select all" checkbox
              const selectAll = document.getElementById('dns-select-all');
              const allChecks = resultDiv.querySelectorAll('.dns-row-check');
              if (selectAll && allChecks.length > 0) {
                selectAll.checked = checked.length === allChecks.length;
                selectAll.indeterminate = checked.length > 0 && checked.length < allChecks.length;
              }
            }

            // Select all checkbox
            const selectAllEl = document.getElementById('dns-select-all');
            if (selectAllEl) {
              selectAllEl.addEventListener('change', function() {
                resultDiv.querySelectorAll('.dns-row-check').forEach(cb => { cb.checked = this.checked; });
                updateBulkState();
              });
            }

            // Individual checkbox change
            resultDiv.querySelectorAll('.dns-row-check').forEach(cb => {
              cb.addEventListener('change', updateBulkState);
            });

            // Bulk delete button
            const bulkDeleteBtn = document.getElementById('dns-bulk-delete-btn');
            if (bulkDeleteBtn) {
              bulkDeleteBtn.addEventListener('click', async function() {
                const checked = resultDiv.querySelectorAll('.dns-row-check:checked');
                if (checked.length === 0) return;

                const items = [];
                checked.forEach(cb => {
                  items.push({ name: cb.dataset.name, type: cb.dataset.type, setId: cb.dataset.setid });
                });

                const confirmed = await Swal.fire({
                  title: 'Bulk Delete',
                  html: `Delete <strong>${items.length}</strong> selected record(s)?`,
                  icon: 'warning',
                  showCancelButton: true,
                  confirmButtonColor: '#d33',
                  confirmButtonText: 'Delete All'
                });
                if (!confirmed.isConfirmed) return;

                bulkDeleteBtn.disabled = true;
                bulkDeleteBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';

                try {
                  const records = items.map(item => {
                    const rec = { domainName: domain, recordName: item.name.replace(/\.$/, ''), recordType: item.type };
                    if (item.setId) rec.setIdentifier = item.setId;
                    return rec;
                  });

                  const resp = await axios.delete(`${tbApiBase()}/resources/globalDns/records`, {
                    data: { records },
                    auth: { username: config.username, password: config.password },
                    timeout: 60000
                  });

                  const data = resp.data;
                  if (data.failed === 0) {
                    Swal.fire({ icon: 'success', title: 'Bulk Delete Complete', text: `${data.succeeded} record(s) deleted successfully.`, timer: 2000, showConfirmButton: false });
                  } else {
                    const failedItems = (data.results || []).filter(r => !r.success).map(r => window.escapeHtml(r.message || 'Unknown error'));
                    Swal.fire({ icon: 'warning', title: 'Partial Delete', html: `<p>${data.succeeded} succeeded, ${data.failed} failed.</p><p style="font-size:12px;color:#dc3545;">${failedItems.join('<br>')}</p>` });
                  }
                } catch (e) {
                  Swal.fire({ icon: 'error', title: 'Bulk Delete Failed', text: e.response?.data?.message || e.message });
                }
                setTimeout(() => showDnsManagementModal(preselectedInfraId), 2100);
              });
            }

            // Attach delete handlers
            resultDiv.querySelectorAll('.dns-delete-btn').forEach(btn => {
              btn.addEventListener('click', async function() {
                const recName = this.dataset.name.replace(/\.$/, '');
                const recType = this.dataset.type;
                const setId = this.dataset.setid;
                const confirmMsg = setId
                  ? `Delete record "${recName}" (${recType}, id: ${setId})?`
                  : `Delete ALL "${recName}" (${recType}) records?`;

                const confirmed = await Swal.fire({
                  title: 'Confirm Delete',
                  text: confirmMsg,
                  icon: 'warning',
                  showCancelButton: true,
                  confirmButtonColor: '#d33',
                  confirmButtonText: 'Delete'
                });
                if (!confirmed.isConfirmed) return;

                try {
                  const delBody = { domainName: domain, recordName: recName, recordType: recType };
                  if (setId) delBody.setIdentifier = setId;
                  await axios.delete(`${tbApiBase()}/resources/globalDns/record`, {
                    data: delBody,
                    auth: { username: config.username, password: config.password },
                    timeout: 30000
                  });
                  Swal.fire({ icon: 'success', title: 'Deleted', text: 'Record deleted successfully.', timer: 2000, showConfirmButton: false });
                  // Re-open the DNS modal to refresh
                  setTimeout(() => showDnsManagementModal(preselectedInfraId), 2100);
                } catch (err) {
                  Swal.fire({ icon: 'error', title: 'Delete Failed', text: err.response?.data?.message || err.message });
                }
              });
            });
          }
        } catch (err) {
          resultDiv.innerHTML = `<div style="color: red;">Error: ${window.escapeHtml(err.response?.data?.message || err.message)}</div>`;
        }
      });

      // Upsert button handler
      document.getElementById('dns-upsert-btn').addEventListener('click', async function() {
        const domain = document.getElementById('dns-hosted-zone').value;
        if (!domain) {
          Swal.showValidationMessage('Please select a hosted zone first.');
          return;
        }
        const recordName = document.getElementById('dns-upsert-record').value.trim();
        const recordType = document.getElementById('dns-upsert-type').value;
        const ttl = parseInt(document.getElementById('dns-upsert-ttl').value) || 300;
        const routingPolicy = document.getElementById('dns-routing-policy').value;
        const source = document.querySelector('input[name="dns-ip-source"]:checked')?.value;

        if (routingPolicy === 'geoproximity' && source === 'ips') {
          Swal.showValidationMessage('Geoproximity routing requires Infra or Label source (for Node location data).');
          return;
        }

        const body = {
          domainName: domain,
          recordName: recordName || domain,
          recordType: recordType,
          ttl: ttl,
          routingPolicy: routingPolicy,
          setBy: {}
        };

        if (source === 'infra') {
          const nsId = document.getElementById('dns-infra-nsid').value.trim();
          const infraId = document.getElementById('dns-infra-id').value;
          if (!nsId || !infraId) {
            Swal.showValidationMessage('Namespace and Infra are required.');
            return;
          }
          // If label filter is set, use label source; otherwise use infra source
          const labelSelector = document.getElementById('labelSelector').value.trim();
          if (labelSelector) {
            // Prepend sys.infraId to scope label query within the selected Infra
            const scopedSelector = 'sys.infraId=' + infraId + ',' + labelSelector;
            body.setBy.label = { nsId, labelSelector: scopedSelector };
          } else {
            body.setBy.infra = { nsId, infraId };
          }
        } else {
          const ipsStr = document.getElementById('dns-manual-ips').value.trim();
          if (!ipsStr) {
            Swal.showValidationMessage('At least one IP address is required.');
            return;
          }
          body.setBy.ips = ipsStr.split(',').map(ip => ip.trim()).filter(ip => ip);
        }

        const resultDiv = document.getElementById('dns-upsert-result');
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<div style="color: #6c757d;"><i class="fas fa-spinner fa-spin"></i> Updating DNS record...</div>';
        this.disabled = true;

        try {
          const url = `${tbApiBase()}/resources/globalDns/record`;
          const resp = await axios.put(url, body, { auth: { username: config.username, password: config.password }, timeout: 60000 });

          // After success, query the updated records to show detailed result
          resultDiv.innerHTML = '<div style="color: #6c757d;"><i class="fas fa-spinner fa-spin"></i> Record updated. Fetching results...</div>';
          try {
            await new Promise(resolve => setTimeout(resolve, 500)); // brief delay for Route53 consistency
            let queryUrl = `${tbApiBase()}/resources/globalDns/record?domainName=${encodeURIComponent(domain)}`;
            if (recordName) queryUrl += `&recordName=${encodeURIComponent(recordName)}`;
            console.log('[DNS] Auto-query URL:', queryUrl);
            const qResp = await axios.get(queryUrl, { auth: { username: config.username, password: config.password }, timeout: 30000 });
            console.log('[DNS] Auto-query response:', JSON.stringify(qResp.data).substring(0, 500));
            const records = (qResp.data?.record || []).filter(r => r.type !== 'NS' && r.type !== 'SOA');
            console.log('[DNS] Filtered records count:', records.length);
            if (records.length > 0) {
              let html = '<div style="color: green; font-weight: bold; margin-bottom: 8px;">✅ DNS record updated successfully.</div>';
              html += '<div style="font-size: 11px; color: #495057; margin-bottom: 4px;">📋 Current records for <b>' + (recordName ? recordName + '.' + domain : domain) + '</b>:</div>';
              html += '<table style="width: 100%; font-size: 11px; border-collapse: collapse;">';
              html += '<tr style="background: #d4edda;"><th style="padding: 5px; border: 1px solid #c3e6cb;">Name</th><th style="padding: 5px; border: 1px solid #c3e6cb;">Type</th><th style="padding: 5px; border: 1px solid #c3e6cb;">TTL</th><th style="padding: 5px; border: 1px solid #c3e6cb;">Values</th><th style="padding: 5px; border: 1px solid #c3e6cb;">Policy</th></tr>';
              records.forEach(r => {
                const esc = window.escapeHtml;
                const policyBadge = r.routingPolicy === 'geoproximity'
                  ? `<span style="background: #17a2b8; color: white; padding: 1px 5px; border-radius: 3px; font-size: 10px;">geo</span> ${esc(r.geoLatitude || '')},${esc(r.geoLongitude || '')}`
                  : r.routingPolicy === 'weighted'
                  ? `<span style="background: #fd7e14; color: white; padding: 1px 5px; border-radius: 3px; font-size: 10px;">weighted</span>`
                  : `<span style="background: #6c757d; color: white; padding: 1px 5px; border-radius: 3px; font-size: 10px;">${esc(r.routingPolicy || 'simple')}</span>`;
                const setIdInfo = r.setIdentifier ? `<br><span style="color: #888; font-size: 10px;">id: ${esc(r.setIdentifier)}</span>` : '';
                html += `<tr>
                  <td style="padding: 5px; border: 1px solid #c3e6cb; word-break: break-all;">${esc(r.name)}${setIdInfo}</td>
                  <td style="padding: 5px; border: 1px solid #c3e6cb;">${esc(r.type)}</td>
                  <td style="padding: 5px; border: 1px solid #c3e6cb;">${r.ttl}</td>
                  <td style="padding: 5px; border: 1px solid #c3e6cb; word-break: break-all;">${(r.values || []).map(v => esc(v)).join(', ')}</td>
                  <td style="padding: 5px; border: 1px solid #c3e6cb;">${policyBadge}</td>
                </tr>`;
              });
              html += '</table>';
              resultDiv.innerHTML = html;
            } else {
              resultDiv.innerHTML = `<div style="color: green; font-weight: bold;">✅ ${resp.data?.message || 'DNS record updated successfully.'}</div>`;
            }
          } catch (qErr) {
            // Query failed but upsert succeeded
            console.warn('[DNS] Auto-query after upsert failed:', qErr);
            resultDiv.innerHTML = `<div style="color: green; font-weight: bold;">✅ ${resp.data?.message || 'DNS record updated successfully.'}</div>`;
          }
        } catch (err) {
          resultDiv.innerHTML = `<div style="color: red;">❌ Error: ${window.escapeHtml(err.response?.data?.message || err.message)}</div>`;
        } finally {
          this.disabled = false;
        }
      });
    }
  });
}
window.showDnsManagementModal = showDnsManagementModal;
// ============================================================
// Nginx Gateway (Load Balancer)
// ============================================================
async function showGatewayModal(preselectedInfraId) {
  const cfg  = getConfig();
  const ns   = window.configNamespace || cfg.namespace || 'default';
  const auth = { username: cfg.username, password: cfg.password };
  const base = `${tbApiBase()}`;

  let infraList = [];
  try {
    const r = await axios.get(`${base}/ns/${ns}/infra?option=id`, { auth, timeout: 15000 });
    infraList = r.data.output || [];
  } catch(e) {
    errorAlert(e.response?.data?.message || e.message || 'Failed to load Infra list');
    return;
  }

  const makeOpts = (selected) => infraList.map(id =>
    `<option value="${window.escapeHtml(id)}"${id === selected ? ' selected' : ''}>${window.escapeHtml(id)}</option>`
  ).join('');

  const result = await Swal.fire({
    title: '🔀 Nginx Gateway (Load Balancer)',
    width: 700,
    html: `${POPUP_STYLES}
      <div class="popup-container">
        <div class="popup-section">
          <div class="popup-section-title">🖥️ Gateway Node (will run nginx)</div>
          <div class="popup-row">
            <div class="popup-col" style="flex:2"><div class="popup-field">
              <label class="popup-label">Infra</label>
              <select id="gw-infra" class="popup-select"><option value="">Select</option>${makeOpts(preselectedInfraId)}</select>
            </div></div>
            <div class="popup-col" style="flex:2"><div class="popup-field">
              <label class="popup-label">Node ID <span style="font-weight:normal;color:#888">(blank = all)</span></label>
              <input id="gw-node" class="popup-input" placeholder="e.g. g1-1">
            </div></div>
            <div class="popup-col" style="flex:1"><div class="popup-field">
              <label class="popup-label">Listen Port</label>
              <input id="gw-lport" type="number" class="popup-input" value="80">
            </div></div>
          </div>
        </div>

        <div class="popup-section">
          <div class="popup-section-title">🎯 Backend Nodes</div>
          <div style="display:flex;gap:16px;margin-bottom:8px;font-size:0.85rem">
            <label><input type="radio" name="gw-src" value="infra" checked> Infra</label>
            <label><input type="radio" name="gw-src" value="label"> Label Selector</label>
            <label><input type="radio" name="gw-src" value="ips"> Manual IPs</label>
          </div>
          <div id="gw-src-infra">
            <div class="popup-field">
              <label class="popup-label">Backend Infra <span style="font-weight:normal;color:#888">(can differ from gateway)</span></label>
              <select id="gw-backend-infra" class="popup-select"><option value="">Select</option>${makeOpts(preselectedInfraId)}</select>
            </div>
          </div>
          <div id="gw-src-label" style="display:none">
            <div class="popup-field">
              <label class="popup-label">Label Selector <span style="font-weight:normal;color:#888">(searches across all infras)</span></label>
              <input id="gw-label" class="popup-input" placeholder="e.g. app=hermes-agent">
            </div>
          </div>
          <div id="gw-src-ips" style="display:none">
            <div class="popup-field">
              <label class="popup-label">Backend IPs</label>
              <input id="gw-ips" class="popup-input" placeholder="1.2.3.4, 5.6.7.8, ...">
            </div>
          </div>
          <div style="margin-top:8px;max-width:160px"><div class="popup-field">
            <label class="popup-label">Backend Port</label>
            <input id="gw-bport" type="number" class="popup-input" value="9120">
          </div></div>
        </div>

        <div style="font-size:0.75rem;color:#888;padding:4px 0">
          ℹ️ nginx round-robin upstream — one request per backend in turn, regardless of DNS caching.
        </div>
      </div>`,
    showCancelButton: true,
    confirmButtonText: '🚀 Deploy nginx',
    didOpen: () => {
      document.querySelectorAll('input[name="gw-src"]').forEach(r =>
        r.addEventListener('change', function() {
          document.getElementById('gw-src-infra').style.display  = this.value === 'infra'  ? '' : 'none';
          document.getElementById('gw-src-label').style.display  = this.value === 'label'  ? '' : 'none';
          document.getElementById('gw-src-ips').style.display    = this.value === 'ips'    ? '' : 'none';
        })
      );
    },
    preConfirm: async () => {
      const gwInfraId = document.getElementById('gw-infra').value;
      const nodeId    = document.getElementById('gw-node').value.trim();
      const src       = document.querySelector('input[name="gw-src"]:checked').value;
      const lport     = document.getElementById('gw-lport').value || '80';
      const bport     = document.getElementById('gw-bport').value || '9120';
      if (!gwInfraId) { Swal.showValidationMessage('Select a Gateway Infra.'); return false; }

      const isValidPort = v => /^\d+$/.test(v) && +v >= 1 && +v <= 65535;
      if (!isValidPort(lport)) { Swal.showValidationMessage('Listener port must be a number between 1 and 65535.'); return false; }
      if (!isValidPort(bport)) { Swal.showValidationMessage('Backend port must be a number between 1 and 65535.'); return false; }

      const isValidIP = v => /^(\d{1,3}\.){3}\d{1,3}$/.test(v) || /^[0-9a-fA-F:]+$/.test(v);

      let backends;
      if (src === 'ips') {
        const v = document.getElementById('gw-ips').value.trim();
        if (!v) { Swal.showValidationMessage('Enter backend IPs.'); return false; }
        const ipList = v.split(/[\s,]+/).filter(Boolean);
        const bad = ipList.find(ip => !isValidIP(ip));
        if (bad) { Swal.showValidationMessage(`Invalid IP address: ${bad}`); return false; }
        backends = ipList.join(' ');
      } else if (src === 'label') {
        const v = document.getElementById('gw-label').value.trim();
        if (!v) { Swal.showValidationMessage('Enter a label selector.'); return false; }
        backends = `$$Func(GetPublicIPs(separator=' ', label='${v}'))`;
      } else {
        // Infra source — resolve IPs from the (possibly different) backend infra
        const bkInfraId = document.getElementById('gw-backend-infra').value;
        if (!bkInfraId) { Swal.showValidationMessage('Select a Backend Infra.'); return false; }
        try {
          const r = await axios.get(`${base}/ns/${ns}/infra/${bkInfraId}`, { auth });
          const ips = (r.data.node || []).map(nd => nd.publicIP).filter(Boolean);
          if (!ips.length) { Swal.showValidationMessage('No public IPs found in the selected Backend Infra.'); return false; }
          backends = ips.join(' ');
        } catch(e) {
          Swal.showValidationMessage('Failed to fetch backend IPs: ' + (e.message || '')); return false;
        }
      }
      return { gwInfraId, nodeId, backends, lport, bport };
    }
  });

  if (!result.isConfirmed || !result.value) return;
  const { gwInfraId, nodeId, backends, lport, bport } = result.value;

  // Cookie-based sticky session: each browser gets a unique cookie on first visit.
  // Works correctly behind corporate NAT (unlike ip_hash which fails when all
  // users share the same external IP). The map directive assigns $request_id as
  // the initial cookie value; subsequent requests reuse the existing cookie value,
  // ensuring consistent backend routing per browser session.
  // WebSocket headers are included for long-lived connections.
  const deployCmd =
    `UPSTREAMS=$(echo "${backends}" | awk -v p=${bport} '{for(i=1;i<=NF;i++) printf "  server %s:%s;\\n",$i,p}') && ` +
    `printf 'map $cookie_gw_id $gw_uid {\\n  default "$request_id";\\n  "~." "$cookie_gw_id";\\n}\\nupstream cb_gw {\\n  hash $gw_uid consistent;\\n%s\\n}\\nserver {\\n  listen ${lport};\\n  location / {\\n    add_header Set-Cookie "gw_id=$gw_uid; Path=/; Max-Age=31536000; SameSite=Lax" always;\\n    proxy_pass http://cb_gw;\\n    proxy_http_version 1.1;\\n    proxy_set_header Upgrade $http_upgrade;\\n    proxy_set_header Connection "upgrade";\\n    proxy_set_header Host $host;\\n    proxy_set_header X-Real-IP $remote_addr;\\n    proxy_read_timeout 3600s;\\n    proxy_send_timeout 3600s;\\n  }\\n}\\n' "$UPSTREAMS" | sudo tee /etc/nginx/conf.d/cb-gateway.conf > /dev/null && ` +
    `sudo rm -f /etc/nginx/sites-enabled/default /etc/nginx/conf.d/default.conf 2>/dev/null; ` +
    `sudo nginx -t && sudo systemctl enable nginx && sudo systemctl restart nginx && ` +
    `echo "✅ Gateway :${lport} → ${backends} (cookie sticky, WebSocket ready)"` ;

  let url = `${base}/ns/${ns}/cmd/infra/${gwInfraId}`;
  if (nodeId) url += `?nodeId=${encodeURIComponent(nodeId)}`;

  try {
    const r = await axios.post(url, {
      command: [
        `sudo apt-get install -y nginx -q 2>/dev/null || sudo yum install -y nginx -q 2>/dev/null; true`,
        deployCmd
      ],
      timeoutMinutes: 10
    }, { auth });
    showRemoteCmdResult(r.data, null, gwInfraId);
  } catch(e) {
    errorAlert(e.response?.data?.message || e.message || 'Deploy failed');
  }
}
window.showGatewayModal = showGatewayModal;

