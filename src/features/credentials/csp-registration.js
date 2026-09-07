/**
 * CSP Runtime Registration Feature Module
 * @module features/credentials/csp-registration
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
const getConnection = () => { if (typeof window.getConnection === 'function') { try { window.getConnection(); } catch(e) {} } };

// ═══════════════════════════════════════════════════════════════════════════════
//  REGISTER A CSP AT RUNTIME (self-hosted OpenStack, etc.)
//
//  Makes a cloud that did not exist when CB-Tumblebug started usable without editing
//  assets/cloudinfo.yaml, re-running `make init`, or restarting the server. The driving
//  case is an OpenStack that CB-Tumblebug itself deployed onto a VM it created.
//
//  Three API calls, in this order — the order matters:
//    1. POST /cloudInfo/{provider}           define the provider (driver, regions, zones)
//    2. POST /credential                     authenticate; creates one connection per region
//    3. GET  /loadAssets?providers={provider} pull ONLY this provider's specs and images
//
//  Skipping (3) leaves a verified connection whose catalog is empty, so no spec or image
//  can be chosen and no VM can be created on it. Scoping it to one provider is what keeps
//  it interactive: a DevStack finishes in seconds, against 10-40 minutes for a full load.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parse the two YAML snippets that scripts/usecases/openstack/1.installDevStack.sh (and
 * 2.getRegistrationInfo.sh) print at the end of a run.
 *
 * Deliberately line-based rather than a YAML parse: the text is pasted from a terminal, so
 * it arrives with banner lines, box-drawing characters and inconsistent leading whitespace
 * that a strict parser would reject. Every field is optional here — whatever is found
 * pre-fills the form and the operator can correct the rest.
 */
function parseCspRegistrationSnippet(text) {
  const out = {
    provider: '', driver: '', cloudPlatform: '', description: '',
    region: '', zone: '', display: '', latitude: '', longitude: '',
    identityEndpoint: '', username: '', password: '', domainName: '', projectId: '',
  };
  if (!text) return out;

  const grab = (re) => { const m = text.match(re); return m ? m[1].trim() : ''; };

  // credentials.yaml block
  out.identityEndpoint = grab(/^\s*IdentityEndpoint:\s*(\S+)/mi);
  out.username         = grab(/^\s*Username:\s*(\S+)/mi);
  out.password         = grab(/^\s*Password:\s*(\S+)/mi);
  out.domainName       = grab(/^\s*DomainName:\s*(\S+)/mi);
  out.projectId        = grab(/^\s*ProjectID:\s*(\S+)/mi);

  // cloudinfo.yaml block
  out.driver        = grab(/^\s*driver:\s*(\S+)/mi);
  out.cloudPlatform = grab(/^\s*cloudPlatform:\s*(\S+)/mi);
  out.description   = grab(/^\s*description:\s*(.+)$/mi);
  out.display       = grab(/^\s*display:\s*(.+)$/mi);
  out.latitude      = grab(/^\s*latitude:\s*(-?[\d.]+)/mi);
  out.longitude     = grab(/^\s*longitude:\s*(-?[\d.]+)/mi);
  out.region        = grab(/^\s*id:\s*(\S+)/mi);           // region id, e.g. RegionOne
  out.zone          = grab(/^\s*-\s+(\S+)\s*$/m);           // first list item under zone:

  // The provider name is the key of both blocks: a line ending in ':' whose value block
  // carries IdentityEndpoint or driver. Take the first such key.
  const keyed = text.match(/^\s{2,}([A-Za-z][-A-Za-z0-9+]*):\s*$/gm) || [];
  for (const line of keyed) {
    const name = line.trim().replace(/:$/, '');
    if (name && !['region', 'location', 'zone'].includes(name)) { out.provider = name; break; }
  }
  return out;
}
window.parseCspRegistrationSnippet = parseCspRegistrationSnippet;

async function showRegisterCspModal() {
  // Yield once before opening. Callers in the context menus historically follow the
  // handler with Swal.close(); firing synchronously would open this dialog and have that
  // very call close it again. Deferring puts our fire() after any such close.
  await new Promise((r) => setTimeout(r, 0));

  const cfg  = getConfig();
  const auth = { username: cfg.username, password: cfg.password };
  const base = tbApiBase();
  const esc  = (v) => window.escapeHtml(String(v == null ? '' : v));

  const field = (id, label, ph, hint) => `
    <div class="popup-field">
      <label class="popup-label">${label}</label>
      <input type="text" id="${id}" class="popup-input" placeholder="${ph}" style="width:100%">
      ${hint ? `<div style="font-size:0.7rem;color:#888;margin-top:2px;">${hint}</div>` : ''}
    </div>`;

  const result = await Swal.fire({
    title: '☁️ Register a CSP (runtime)',
    width: 820,
    html: `${POPUP_STYLES}
      <div style="text-align:left;font-size:0.82rem;color:#555;margin-bottom:8px;">
        Registers a cloud that was not present when CB-Tumblebug started — no file edit,
        no restart. Paste the output of the DevStack <b>Get Registration Info</b> step and
        the fields below fill themselves.
      </div>
      <div class="popup-field">
        <label class="popup-label">Paste installer output (optional)</label>
        <textarea id="cspSnippet" class="popup-input" rows="6" style="width:100%;font-family:monospace;font-size:0.72rem"
          placeholder="Paste the credentials.yaml / cloudinfo.yaml snippets printed by the install script..."></textarea>
        <button type="button" id="cspParseBtn" class="btn btn-info" style="margin-top:6px">📋 Parse into the fields</button>
        <span id="cspParseMsg" style="font-size:0.74rem;margin-left:8px;color:#2e7d32"></span>
      </div>
      <hr style="margin:10px 0">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:left">
        ${field('cspProvider','Provider name *','openstack-host-openstack','Becomes the provider in connection names')}
        ${field('cspDriver','Driver *','openstack-driver-v1.0.so','')}
        ${field('cspPlatform','Base platform *','openstack','Which driver CB-Spider loads. Required for a derived CSP')}
        ${field('cspDescription','Description','DevStack on 1.2.3.4','')}
        ${field('cspRegion','Region *','RegionOne','')}
        ${field('cspZone','Zone *','nova','')}
        ${field('cspDisplay','Location label','Europe (Milan)','Where it appears on the map')}
        ${field('cspLat','Latitude','45.4','')}
        ${field('cspLon','Longitude','9.1','')}
        ${field('cspEndpoint','IdentityEndpoint *','http://1.2.3.4/identity/v3','')}
        ${field('cspUser','Username *','admin','')}
        ${field('cspPassword','Password *','','')}
        ${field('cspDomain','DomainName','Default','')}
        ${field('cspProject','ProjectID *','','')}
      </div>
      <label style="display:flex;align-items:center;gap:6px;margin-top:10px;font-size:0.8rem">
        <input type="checkbox" id="cspFetchAssets" checked>
        Fetch this provider's specs and images after registering
        <span style="color:#888">(required before any VM can be created on it)</span>
      </label>`,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Register',
    cancelButtonText: 'Cancel',
    didOpen: () => {
      document.getElementById('cspParseBtn').addEventListener('click', () => {
        const parsed = parseCspRegistrationSnippet(document.getElementById('cspSnippet').value);
        const map = {
          cspProvider: parsed.provider, cspDriver: parsed.driver, cspPlatform: parsed.cloudPlatform,
          cspDescription: parsed.description, cspRegion: parsed.region, cspZone: parsed.zone,
          cspDisplay: parsed.display, cspLat: parsed.latitude, cspLon: parsed.longitude,
          cspEndpoint: parsed.identityEndpoint, cspUser: parsed.username,
          cspPassword: parsed.password, cspDomain: parsed.domainName, cspProject: parsed.projectId,
        };
        let filled = 0;
        Object.entries(map).forEach(([id, val]) => {
          if (val) { document.getElementById(id).value = val; filled++; }
        });
        // A DevStack is an instance of the openstack platform; infer it when the snippet
        // omits cloudPlatform but the driver makes it obvious.
        const plat = document.getElementById('cspPlatform');
        if (!plat.value && /openstack/i.test(document.getElementById('cspDriver').value)) {
          plat.value = 'openstack'; filled++;
        }
        document.getElementById('cspParseMsg').textContent =
          filled ? `Filled ${filled} field(s) — check them before registering.` : 'Nothing recognised in that text.';
        document.getElementById('cspParseMsg').style.color = filled ? '#2e7d32' : '#c62828';
      });
    },
    preConfirm: () => {
      const val = (id) => (document.getElementById(id).value || '').trim();
      const req = { provider: val('cspProvider'), driver: val('cspDriver'), platform: val('cspPlatform'),
                    region: val('cspRegion'), zone: val('cspZone'), endpoint: val('cspEndpoint'),
                    user: val('cspUser'), password: val('cspPassword'), project: val('cspProject') };
      const missing = Object.entries(req).filter(([, v]) => !v).map(([k]) => k);
      if (missing.length) { Swal.showValidationMessage(`Missing required: ${missing.join(', ')}`); return false; }
      return {
        ...req,
        description: val('cspDescription'), display: val('cspDisplay'),
        lat: parseFloat(val('cspLat')) || 0, lon: parseFloat(val('cspLon')) || 0,
        domain: val('cspDomain') || 'Default',
        fetchAssets: document.getElementById('cspFetchAssets').checked,
      };
    },
  });

  if (!result.value) return;
  const v = result.value;

  const step = (n, total, text) => Swal.update({
    title: `Registering ${esc(v.provider)}`,
    html: `<div style="text-align:left;font-size:0.85rem">Step ${n}/${total} — ${esc(text)}</div>`,
    showConfirmButton: false, showCancelButton: false,
  });
  const total = v.fetchAssets ? 3 : 2;
  Swal.fire({ title: 'Registering…', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    // 1 — define the provider
    step(1, total, 'defining the provider');
    await axios.post(`${base}/cloudInfo/${encodeURIComponent(v.provider)}`, {
      description: v.description || `Registered from CB-MapUI`,
      cloudPlatform: v.platform,
      driver: v.driver,
      regions: { [v.region]: {
        regionId: v.region, zones: [v.zone],
        location: { display: v.display || v.region, latitude: v.lat, longitude: v.lon },
      } },
    }, { auth, timeout: 60000 });

    // 2 — credentials. The server hands out a short-lived RSA key; each value is
    // AES-encrypted and the AES key travels RSA-wrapped, so nothing is sent in the clear.
    step(2, total, 'registering credentials and verifying the connection');
    const keyRes = await axios.get(`${base}/credential/publicKey`, { auth, timeout: 30000 });
    const { publicKey, publicKeyTokenId } = keyRes.data || {};
    if (!publicKey || !publicKeyTokenId) throw new Error('Could not obtain the credential encryption key');

    const enc = await encryptCredentialValues(publicKey, {
      IdentityEndpoint: v.endpoint, Username: v.user, Password: v.password,
      DomainName: v.domain, ProjectID: v.project,
    });
    const credRes = await axios.post(`${base}/credential`, {
      credentialHolder: 'admin',
      providerName: v.provider,
      credentialKeyValueList: Object.entries(enc.values).map(([key, value]) => ({ key, value })),
      publicKeyTokenId,
      encryptedClientAesKeyByPublicKey: enc.aesKey,
    }, { auth, timeout: 900000 });

    const conns = (credRes.data?.allConnections?.connectionconfig || [])
      .filter(c => (c.providerName || '').toLowerCase() === v.provider.toLowerCase());
    const verified = conns.filter(c => c.verified);

    // 3 — assets, scoped to this provider only
    let assetNote = '';
    if (v.fetchAssets) {
      if (!verified.length) {
        assetNote = 'Skipped the asset fetch: no connection verified, and assets are only '
                  + 'fetched from verified connections.';
      } else {
        step(3, total, 'fetching specs and images for this provider');
        await axios.get(`${base}/loadAssets`, {
          params: { providers: v.provider }, auth, timeout: 1800000,
        });
        assetNote = 'Specs and images fetched for this provider.';
      }
    }

    const rows = conns.map(c =>
      `<tr><td style="padding:2px 6px">${esc(c.configName)}</td>`
      + `<td style="padding:2px 6px">${c.verified ? '✅ verified' : '❌ unverified'}</td>`
      + `<td style="padding:2px 6px;color:#c62828;font-size:0.72rem">${esc(c.verifiedMessage || '')}</td></tr>`
    ).join('');

    await Swal.fire({
      icon: verified.length ? 'success' : 'warning',
      title: verified.length ? 'CSP registered' : 'Registered, but not verified',
      width: 720,
      html: `<div style="text-align:left;font-size:0.85rem">
        <p><b>${esc(v.provider)}</b> is now a provider — no restart needed.</p>
        <table style="width:100%;border-collapse:collapse;font-size:0.78rem"><tbody>${rows}</tbody></table>
        ${assetNote ? `<p style="margin-top:8px">${esc(assetNote)}</p>` : ''}
        ${verified.length
          ? '<p style="margin-top:8px;color:#555">You can now create an Infra on this provider.</p>'
          : '<p style="margin-top:8px;color:#c62828">Read the message above. For a self-hosted '
            + 'OpenStack the usual cause is the API port (80) being closed in the security group '
            + 'of the VM hosting it.</p>'}
      </div>`,
    });
    if (typeof getConnection === 'function') { try { getConnection(); } catch (e) {} }
  } catch (e) {
    errorAlert(e.response?.data?.message || e.message || 'Registration failed');
  }
}
window.showRegisterCspModal = showRegisterCspModal;


/**
 * Wrap a PKCS#1 RSAPublicKey DER in the SubjectPublicKeyInfo structure WebCrypto expects:
 *
 *   SEQUENCE {
 *     SEQUENCE { OID rsaEncryption, NULL }
 *     BIT STRING { <the PKCS#1 body> }
 *   }
 */
function pkcs1ToSpki(pkcs1) {
  // DER length bytes: short form below 128, else 0x80|n followed by n big-endian bytes.
  const derLength = (n) => {
    if (n < 0x80) return [n];
    const bytes = [];
    for (let v = n; v > 0; v >>= 8) bytes.unshift(v & 0xff);
    return [0x80 | bytes.length, ...bytes];
  };
  // AlgorithmIdentifier for rsaEncryption (1.2.840.113549.1.1.1) with NULL parameters
  const algorithm = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86,
                     0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  // BIT STRING with a leading 0x00 "unused bits" octet
  const bitString = [0x03, ...derLength(pkcs1.length + 1), 0x00, ...pkcs1];
  const body = [...algorithm, ...bitString];
  return new Uint8Array([0x30, ...derLength(body.length), ...body]);
}

/**
 * Encrypt credential values the way POST /credential expects: each value under AES-256-CBC
 * with a fresh IV prepended, and that AES key RSA-OAEP(SHA-256) wrapped with the server's
 * public key. Uses WebCrypto, so nothing extra has to be bundled.
 */
async function encryptCredentialValues(publicKeyPem, credential) {
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const pemBody = publicKeyPem.replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\s+/g, '');
  let der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  // CB-Tumblebug emits PKCS#1 ("BEGIN RSA PUBLIC KEY", x509.MarshalPKCS1PublicKey), but
  // WebCrypto imports RSA public keys as SPKI only. Wrap the PKCS#1 body in the SPKI
  // structure rather than asking the server to change format, so this keeps working
  // against existing deployments.
  if (/BEGIN RSA PUBLIC KEY/.test(publicKeyPem)) der = pkcs1ToSpki(der);

  const rsaKey = await crypto.subtle.importKey(
    'spki', der, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);

  const aesRaw = crypto.getRandomValues(new Uint8Array(32));
  const aesKey = await crypto.subtle.importKey('raw', aesRaw, { name: 'AES-CBC' }, false, ['encrypt']);

  const values = {};
  for (const [name, value] of Object.entries(credential)) {
    const iv = crypto.getRandomValues(new Uint8Array(16));
    const ct = await crypto.subtle.encrypt(
      { name: 'AES-CBC', iv }, aesKey, new TextEncoder().encode(String(value)));
    // The server splits the IV back off the front, so order matters.
    const joined = new Uint8Array(iv.length + ct.byteLength);
    joined.set(iv, 0); joined.set(new Uint8Array(ct), iv.length);
    values[name] = b64(joined);
  }
  const wrapped = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsaKey, aesRaw);
  return { values, aesKey: b64(wrapped) };
}


window.pkcs1ToSpki = pkcs1ToSpki;
window.encryptCredentialValues = encryptCredentialValues;
