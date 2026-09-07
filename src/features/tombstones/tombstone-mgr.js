/**
 * Tombstone Management (Deletion Pending Review & Force Purge) Feature Module
 * @module features/tombstones
 */
import Swal from 'sweetalert2';
import axios from 'axios';
import { tbApiBase, getConfig } from '../../core/api.js';

const getInfra = () => { if (window.getInfra) window.getInfra(); };

// A resource is a deletion tombstone when its deletion was requested but not yet confirmed
// gone on the CSP: it carries deletionRequestedAt, or Deleting status, or a DeletionFailed condition.
function isTombstoneResource(item) {
  if (!item) return false;
  if (item.deletionRequestedAt) return true;
  if ((item.status || "").toString().toLowerCase() === "deleting") return true;
  const conds = Array.isArray(item.conditions) ? item.conditions : [];
  return conds.some((c) => c && c.reason === "DeletionFailed");
}
// Tombstoned resources awaiting user review/force-purge, keyed by resource type.
window.tombstoneRegistry = { vNet: [], securityGroup: [], sshKey: [] };

// Flatten the tombstone registry into a [{type, item}] list.
function tombstoneList() {
  const reg = window.tombstoneRegistry || {};
  const out = [];
  ["vNet", "securityGroup", "sshKey"].forEach((t) => (reg[t] || []).forEach((item) => out.push({ type: t, item })));
  return out;
}

// Bottom-right HUD: persistent state chips (running cost, pending-deletion), stacked.
// Adopts the running-cost pill (defined statically in index.html) so both chips
// share one corner and stack/hide cleanly via flexbox.
function hudChipsContainer() {
  let el = document.getElementById("hud-chips");
  if (el) return el;
  el = document.createElement("div");
  el.id = "hud-chips";
  el.style.cssText =
    "position:fixed;bottom:20px;right:20px;z-index:1000;display:flex;" +
    "flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none;";
  document.body.appendChild(el);
  const cost = document.getElementById("running-cost-display");
  if (cost && cost.parentElement !== el) {
    cost.style.position = "static";
    cost.style.bottom = cost.style.right = "auto";
    cost.style.order = "2"; // keep cost at the bottom of the stack
    cost.style.pointerEvents = "auto";
    el.appendChild(cost);
  }
  return el;
}

// Show/update a pending-deletion chip (bottom-right, above cost) when tombstones
// exist; clicking opens the review dialog. Full wording lives in the tooltip.
function updateTombstoneBanner() {
  const list = tombstoneList();
  let banner = document.getElementById("tombstoneBanner");
  if (list.length === 0) {
    if (banner) banner.style.display = "none";
    return;
  }
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "tombstoneBanner";
    banner.style.cssText =
      "order:1;background:#fb7185;color:#fff;border-radius:10px;padding:8px 14px;" +
      "cursor:pointer;pointer-events:auto;box-shadow:0 4px 14px rgba(0,0,0,0.18);" +
      "font-size:13px;font-weight:600;display:flex;align-items:center;gap:5px;white-space:nowrap;";
    banner.title = "Resources pending deletion — click to review & force-purge";
    banner.onclick = showTombstoneReview;
    hudChipsContainer().appendChild(banner);
  }
  banner.style.display = "flex";
  banner.innerHTML = '🗑 <b>' + list.length + '</b> pending';
}

// Dialog listing tombstoned resources, each with a Force purge action.
function showTombstoneReview() {
  const list = tombstoneList();
  if (list.length === 0) return;
  const rows = list.map((e) => {
    const it = e.item;
    const cond = (it.conditions || []).find((c) => c && c.reason === "DeletionFailed");
    const msg = it.systemMessage || (cond && cond.message) || "";
    const rid = it.id || it.name;
    return (
      '<tr>' +
      '<td style="text-align:left;padding:4px 8px;">' + e.type + '</td>' +
      '<td style="text-align:left;padding:4px 8px;"><b>' + rid + '</b><br>' +
      '<span style="color:#888;font-size:11px;">' + (it.status || "") + (msg ? " — " + msg : "") + '</span></td>' +
      '<td style="padding:4px 8px;white-space:nowrap;">' +
      '<button class="swal2-styled" style="background:#3085d6;font-size:12px;padding:4px 10px;margin:0 4px 0 0;" ' +
      'onclick="window.retryDeleteTombstone(\'' + e.type + '\',\'' + rid + '\')" title="Retry the normal deletion (e.g. after removing a dependency)">Retry delete</button>' +
      '<button class="swal2-styled" style="background:#2e9e5b;font-size:12px;padding:4px 10px;margin:0 4px 0 0;" ' +
      'onclick="window.restoreTombstone(\'' + e.type + '\',\'' + rid + '\')" title="Cancel the deletion and return to Available (only if the CSP resource still exists)">Restore</button>' +
      '<button class="swal2-styled" style="background:none;color:#b91c1c;border:1px solid #b91c1c;font-size:11px;padding:3px 8px;margin:0;" ' +
      'onclick="window.forcePurgeTombstone(\'' + e.type + '\',\'' + rid + '\')" title="Discard the record; may leave a CSP orphan">Force purge</button></td>' +
      '</tr>'
    );
  }).join("");
  Swal.fire({
    title: "Resources pending deletion",
    html:
      '<div style="max-height:50vh;overflow:auto;"><table style="width:100%;border-collapse:collapse;">' +
      '<thead><tr style="border-bottom:1px solid #ddd;"><th style="text-align:left;padding:4px 8px;">Type</th>' +
      '<th style="text-align:left;padding:4px 8px;">Resource</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p style="margin-top:10px;color:#666;font-size:12px;text-align:left;">Deletion was not confirmed on the CSP, so the record is kept.<br>' +
      '<b>Retry delete</b>: run the normal deletion again (e.g. after removing a dependency the CSP reported).<br>' +
      '<b>Restore</b>: cancel the deletion and return to Available — only works while the CSP resource still exists.<br>' +
      '<b>Force purge</b>: discard the record; use only when the CSP resource is truly gone (may otherwise orphan it).</p>',
    width: 720,
    showConfirmButton: false,
    showCloseButton: true,
  });
}
window.showTombstoneReview = showTombstoneReview;

// Force-purge a tombstoned resource after confirmation (DELETE with force).
function forcePurgeTombstone(type, id) {
  const cfg = getConfig();
  const ns = window.configNamespace || cfg.namespace || '';
  let url = tbApiBase() + "/ns/" + ns + "/resources/" + type + "/" + id;
  url += type === "vNet" ? "?action=force" : "?option=force";
  Swal.fire({
    title: "Force purge?",
    html: "Discard the record for <b>" + id + "</b>?<br>" +
      '<span style="color:#dc3545;">If the CSP resource still exists it will become an orphan.</span>',
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#dc3545",
    confirmButtonText: "Force purge",
  }).then((res) => {
    if (!res.isConfirmed) return;
    axios.delete(url, { auth: { username: cfg.username, password: cfg.password } })
      .then(() => {
        Swal.fire({ icon: "success", title: "Purged", text: id, timer: 1500, showConfirmButton: false });
        if (typeof getInfra === "function") getInfra();
      })
      .catch((err) => {
        Swal.fire({ icon: "error", title: "Purge failed", text: (err.response && err.response.data && err.response.data.message) || err.message });
      });
  });
}
window.forcePurgeTombstone = forcePurgeTombstone;

// Retry the normal deletion for a tombstoned resource (idempotent). For vNet this deletes
// with its subnets; the fail-closed gate purges only once the CSP confirms it is gone.
function retryDeleteTombstone(type, id) {
  const cfg = getConfig();
  const ns = window.configNamespace || cfg.namespace || '';
  let url = tbApiBase() + "/ns/" + ns + "/resources/" + type + "/" + id;
  if (type === "vNet") url += "?action=withSubnets";
  Swal.fire({
    title: "Retry delete?",
    html: "Run the normal deletion again for <b>" + id + "</b>.<br>" +
      '<span style="color:#666;">If the CSP rejected it (e.g. a dependency), remove that first.</span>',
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Retry delete",
  }).then((res) => {
    if (!res.isConfirmed) return;
    axios.delete(url, { auth: { username: cfg.username, password: cfg.password } })
      .then((r) => {
        Swal.fire({ icon: "success", title: "Deleted", text: id, timer: 1500, showConfirmButton: false });
        if (typeof getInfra === "function") getInfra();
      })
      .catch((err) => {
        // 409 = still unconfirmed (retained); show the reason, keep the record.
        Swal.fire({ icon: "info", title: "Still not confirmed", text: (err.response && err.response.data && err.response.data.message) || err.message });
        if (typeof getInfra === "function") getInfra();
      });
  });
}
window.retryDeleteTombstone = retryDeleteTombstone;

// Restore a tombstoned resource to Available (cancel the deletion). Backend only allows it
// when the CSP resource is confirmed present, so a mistaken/blocked deletion can be undone.
function restoreTombstone(type, id) {
  const cfg = getConfig();
  const ns = window.configNamespace || cfg.namespace || '';
  const url = tbApiBase() + "/ns/" + ns + "/resources/" + type + "/" + id + "/restore";
  Swal.fire({
    title: "Restore resource?",
    html: "Cancel the deletion of <b>" + id + "</b> and return it to Available.<br>" +
      '<span style="color:#666;">Only succeeds if the CSP resource still exists.</span>',
    icon: "question",
    showCancelButton: true,
    confirmButtonColor: "#2e9e5b",
    confirmButtonText: "Restore",
  }).then((res) => {
    if (!res.isConfirmed) return;
    axios.put(url, {}, { auth: { username: cfg.username, password: cfg.password } })
      .then(() => {
        Swal.fire({ icon: "success", title: "Restored", text: id, timer: 1500, showConfirmButton: false });
        if (typeof getInfra === "function") getInfra();
      })
      .catch((err) => {
        Swal.fire({ icon: "error", title: "Restore failed", text: (err.response && err.response.data && err.response.data.message) || err.message });
      });
  });
}
window.restoreTombstone = restoreTombstone;


window.isTombstoneResource = isTombstoneResource;
window.tombstoneList = tombstoneList;
window.hudChipsContainer = hudChipsContainer;
window.updateTombstoneBanner = updateTombstoneBanner;
window.showTombstoneReview = showTombstoneReview;
window.forcePurgeTombstone = forcePurgeTombstone;
window.retryDeleteTombstone = retryDeleteTombstone;
window.restoreTombstone = restoreTombstone;
