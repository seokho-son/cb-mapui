import Swal from 'sweetalert2';

// Helper: recursively extract all string values from JSON object
export function extractStringValuesFromJson(obj, path = '', results = []) {
  if (typeof obj === 'string') {
    results.push({ path, value: obj });
  } else if (Array.isArray(obj)) {
    obj.forEach((item, idx) => extractStringValuesFromJson(item, `${path}[${idx}]`, results));
  } else if (obj && typeof obj === 'object') {
    Object.keys(obj).forEach(key => {
      const newPath = path ? `${path}.${key}` : key;
      extractStringValuesFromJson(obj[key], newPath, results);
    });
  }
  return results;
}
window.extractStringValuesFromJson = extractStringValuesFromJson;

// Helper: collect likely Base64 strings from string values
export function collectBase64FromStringValues(stringValues) {
  const foundSet = new Set();
  stringValues.forEach(({ path, value }) => {
    const segments = value.split(/[\r\n\s]+/);
    segments.forEach(segment => {
      const trimmed = segment.trim();
      if (trimmed.length < 40) return;
      if (!/^[A-Za-z0-9+/=]+$/.test(trimmed)) return;
      if (trimmed.toLowerCase().includes('http')) return;
      try {
        const testDecode = atob(trimmed);
        if (testDecode.length > 0) {
          foundSet.add(trimmed);
        }
      } catch (e) {}
    });
    if (value.length >= 40 && /^[A-Za-z0-9+/=\s]+$/.test(value)) {
      const cleaned = value.replace(/\s/g, '');
      if (cleaned.length >= 40) {
        try {
          atob(cleaned);
          foundSet.add(cleaned);
        } catch (e) {}
      }
    }
  });
  return Array.from(foundSet);
}
window.collectBase64FromStringValues = collectBase64FromStringValues;

/**
 * JSON Output Toolbar & Base64 Panel Feature Module
 * @module features/base64
 */

// ========== JSON OUTPUT TOOLBAR FUNCTIONS ==========

// Copy JSON to clipboard
window.copyJsonToClipboard = function() {
  const jsonString = window._currentJsonString;
  if (!jsonString) {
    console.error('No JSON data available to copy');
    return;
  }
  
  navigator.clipboard.writeText(jsonString).then(() => {
    // Show brief success feedback
    const btn = document.getElementById('copyJsonBtn');
    if (btn) {
      const originalText = btn.innerHTML;
      btn.innerHTML = '✓ Copied!';
      btn.style.background = '#155724';
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.style.background = '#28a745';
      }, 1500);
    }
  }).catch(err => {
    console.error('Failed to copy:', err);
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = jsonString;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  });
};

// Download JSON as file
window.downloadJsonFile = function() {
  const jsonString = window._currentJsonString;
  if (!jsonString) {
    console.error('No JSON data available to download');
    return;
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `response-${timestamp}.json`;
  
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  
  // Show brief success feedback
  const btn = document.getElementById('downloadJsonBtn');
  if (btn) {
    const originalText = btn.innerHTML;
    btn.innerHTML = '✓ Saved!';
    btn.style.background = '#155724';
    setTimeout(() => {
      btn.innerHTML = originalText;
      btn.style.background = '#6c757d';
    }, 1500);
  }
};

// ========== INTEGRATED BASE64 PANEL FUNCTIONS ==========

// Toggle Base64 Panel visibility
window.toggleBase64Panel = function() {
  const panel = document.getElementById('base64Panel');
  if (!panel) return;
  
  if (panel.style.display === 'none') {
    panel.style.display = 'block';
    // Reduce JSON output height when panel is open
    const jsonOutput = document.getElementById('json-output');
    if (jsonOutput) {
      jsonOutput.style.maxHeight = '250px';
    }
  } else {
    panel.style.display = 'none';
    // Restore JSON output height when panel is closed
    const jsonOutput = document.getElementById('json-output');
    if (jsonOutput) {
      jsonOutput.style.maxHeight = '350px';
    }
  }
};

// Auto-find Base64 strings in JSON (for integrated panel)
window.autoFindBase64InJson = function() {
  const jsonData = window._currentJsonOutput;
  if (!jsonData) return;
  
  const chipsContainer = document.getElementById('base64FoundChips');
  const input = document.getElementById('base64Input');
  const output = document.getElementById('base64Output');
  
  if (!chipsContainer || !input || !output) return;
  
  // Use shared helper functions
  const stringValues = window.extractStringValuesFromJson(jsonData);
  const likelyBase64 = window.collectBase64FromStringValues(stringValues);
  
  if (likelyBase64.length === 0) {
    output.value = 'No Base64 strings found in JSON.';
    chipsContainer.style.display = 'none';
    return;
  }
  
  // Decode all and store
  window._base64FoundResults = likelyBase64.map((b64, idx) => {
    try {
      const decoded = atob(b64);
      const decodedUtf8 = decodeURIComponent(escape(decoded));
      return { original: b64, decoded: decodedUtf8 };
    } catch (e) {
      return { original: b64, decoded: '[Decode Error]' };
    }
  });
  
  // Build chips
  let chipsHtml = '<span style="color: #aaa; font-size: 10px; margin-right: 6px;">Found:</span>';
  likelyBase64.slice(0, 8).forEach((b64, idx) => {
    const preview = b64.substring(0, 12) + '...';
    chipsHtml += `
      <button type="button" onclick="selectBase64Chip(${idx})" 
        style="display: inline-block; padding: 2px 6px; margin: 2px; font-size: 10px; 
               background: #3d5a80; color: #fff; border: none; border-radius: 3px; cursor: pointer;"
        title="${b64.substring(0, 50)}">
        #${idx + 1} ${preview}
      </button>
    `;
  });
  if (likelyBase64.length > 8) {
    chipsHtml += `<span style="color: #aaa; font-size: 10px;">+${likelyBase64.length - 8} more</span>`;
  }
  
  chipsContainer.innerHTML = chipsHtml;
  chipsContainer.style.display = 'block';
  
  // Show all decoded results
  output.value = window._base64FoundResults.map((r, i) => `=== #${i + 1} ===\n${r.decoded}`).join('\n\n');
};

// Select a Base64 chip
window.selectBase64Chip = function(index) {
  const results = window._base64FoundResults;
  if (!results || !results[index]) return;
  
  const input = document.getElementById('base64Input');
  const output = document.getElementById('base64Output');
  
  if (input) input.value = results[index].original;
  if (output) output.value = results[index].decoded;
};

// Decode Base64 inline
window.decodeBase64Inline = function() {
  const input = document.getElementById('base64Input');
  const output = document.getElementById('base64Output');
  if (!input || !output) return;
  
  const base64Text = input.value.trim();
  if (!base64Text) {
    output.value = 'Error: No input provided';
    return;
  }
  
  try {
    const decoded = atob(base64Text);
    try {
      output.value = decodeURIComponent(escape(decoded));
    } catch (e) {
      output.value = decoded;
    }
  } catch (err) {
    output.value = `Error: Invalid Base64 string\n${err.message}`;
  }
};

// Encode to Base64 inline
window.encodeBase64Inline = function() {
  const input = document.getElementById('base64Input');
  const output = document.getElementById('base64Output');
  if (!input || !output) return;
  
  const text = input.value;
  if (!text) {
    output.value = 'Error: No input provided';
    return;
  }
  
  try {
    const encoded = btoa(unescape(encodeURIComponent(text)));
    output.value = encoded;
  } catch (err) {
    output.value = `Error: Failed to encode\n${err.message}`;
  }
};

// Clear Base64 inline fields
window.clearBase64Inline = function() {
  const input = document.getElementById('base64Input');
  const output = document.getElementById('base64Output');
  const chipsContainer = document.getElementById('base64FoundChips');
  
  if (input) input.value = '';
  if (output) output.value = '';
  if (chipsContainer) chipsContainer.style.display = 'none';
};

// Copy Base64 result
window.copyBase64Result = function() {
  const output = document.getElementById('base64Output');
  if (!output || !output.value) return;
  
  navigator.clipboard.writeText(output.value).then(() => {
    const originalBg = output.style.background;
    output.style.background = '#1a4d1a';
    setTimeout(() => { output.style.background = originalBg || '#1e1e30'; }, 500);
  }).catch(err => {
    output.select();
    document.execCommand('copy');
  });
};

// Save Base64 result
window.saveBase64Result = function() {
  const output = document.getElementById('base64Output');
  if (!output || !output.value) return;
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `decoded-${timestamp}.txt`;
  
  const blob = new Blob([output.value], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// ========== END INTEGRATED BASE64 PANEL FUNCTIONS ==========

// Open Base64 Decoder window (legacy - kept for backward compatibility)
window.openBase64DecoderWindow = function() {
  Swal.fire({
    title: '🔓 Base64 Decoder',
    width: 700,
    html: `
      <div style="text-align: left;">
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: bold; margin-bottom: 4px; color: #333;">Input (Base64 encoded text)</label>
          <textarea id="base64Input" rows="5" 
            style="width: 100%; font-family: monospace; font-size: 12px; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; resize: vertical;"
            placeholder="Paste Base64 encoded text here..."></textarea>
        </div>
        <div style="margin-bottom: 12px; display: flex; gap: 8px;">
          <button type="button" onclick="decodeBase64Input()" 
            style="padding: 6px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
            🔓 Decode
          </button>
          <button type="button" onclick="encodeBase64Input()" 
            style="padding: 6px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
            🔒 Encode
          </button>
          <button type="button" onclick="clearBase64Fields()" 
            style="padding: 6px 16px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
            🗑️ Clear
          </button>
          <button type="button" onclick="findAndDecodeBase64InJson()" 
            style="padding: 6px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;"
            title="Find and decode all Base64 strings in the original JSON">
            🔍 Auto-find in JSON
          </button>
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display: block; font-weight: bold; margin-bottom: 4px; color: #333;">Output (Decoded text)</label>
          <textarea id="base64Output" rows="8" readonly
            style="width: 100%; font-family: monospace; font-size: 12px; padding: 8px; border: 1px solid #ced4da; border-radius: 4px; 
                   background: #f8f9fa; resize: vertical;"
            placeholder="Decoded result will appear here..."></textarea>
        </div>
        <div style="display: flex; gap: 8px;">
          <button type="button" onclick="copyBase64Output()" 
            style="padding: 6px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
            📋 Copy Output
          </button>
          <button type="button" onclick="downloadBase64Output()" 
            style="padding: 6px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
            💾 Save Output
          </button>
        </div>
        <div id="base64FoundList" style="margin-top: 12px; display: none;">
          <label style="display: block; font-weight: bold; margin-bottom: 4px; color: #333;">Found Base64 strings in JSON:</label>
          <div id="base64FoundItems" style="max-height: 150px; overflow-y: auto; background: #f8f9fa; padding: 8px; border-radius: 4px; font-size: 11px;"></div>
        </div>
      </div>
    `,
    showCloseButton: true,
    showConfirmButton: false,
    customClass: {
      popup: 'base64-decoder-popup'
    }
  });
};

// Decode Base64 input
window.decodeBase64Input = function() {
  const input = document.getElementById('base64Input');
  const output = document.getElementById('base64Output');
  if (!input || !output) return;
  
  const base64Text = input.value.trim();
  if (!base64Text) {
    output.value = 'Error: No input provided';
    return;
  }
  
  try {
    // Try standard Base64 decode
    const decoded = atob(base64Text);
    // Try to parse as UTF-8
    try {
      output.value = decodeURIComponent(escape(decoded));
    } catch (e) {
      output.value = decoded;
    }
  } catch (err) {
    output.value = `Error: Invalid Base64 string\n${err.message}`;
  }
};

// Encode to Base64
window.encodeBase64Input = function() {
  const input = document.getElementById('base64Input');
  const output = document.getElementById('base64Output');
  if (!input || !output) return;
  
  const text = input.value;
  if (!text) {
    output.value = 'Error: No input provided';
    return;
  }
  
  try {
    // Encode to Base64 with UTF-8 support
    const encoded = btoa(unescape(encodeURIComponent(text)));
    output.value = encoded;
  } catch (err) {
    output.value = `Error: Failed to encode\n${err.message}`;
  }
};

// Clear Base64 fields
window.clearBase64Fields = function() {
  const input = document.getElementById('base64Input');
  const output = document.getElementById('base64Output');
  if (input) input.value = '';
  if (output) output.value = '';
  
  const foundList = document.getElementById('base64FoundList');
  if (foundList) foundList.style.display = 'none';
};

// Find and decode Base64 strings in JSON
window.findAndDecodeBase64InJson = function() {
  const jsonData = window._currentJsonOutput;
  if (!jsonData) {
    document.getElementById('base64Output').value = 'Error: No JSON data available';
    return;
  }
  
  const foundList = document.getElementById('base64FoundList');
  const foundItems = document.getElementById('base64FoundItems');
  const output = document.getElementById('base64Output');
  
  // Use shared helper functions
  const stringValues = window.extractStringValuesFromJson(jsonData);
  const likelyBase64 = window.collectBase64FromStringValues(stringValues);
  
  if (likelyBase64.length === 0) {
    output.value = 'No Base64 encoded strings found in the JSON response.';
    foundList.style.display = 'none';
    return;
  }
  
  // Show found Base64 strings
  foundList.style.display = 'block';
  let itemsHtml = '';
  const decodedResults = [];
  
  likelyBase64.slice(0, 10).forEach((b64, idx) => {
    try {
      const decoded = atob(b64);
      const decodedUtf8 = decodeURIComponent(escape(decoded));
      const preview = decodedUtf8.length > 100 ? decodedUtf8.substring(0, 100) + '...' : decodedUtf8;
      decodedResults.push({ original: b64, decoded: decodedUtf8 });
      
      itemsHtml += `
        <div style="margin-bottom: 8px; padding: 6px; background: white; border-radius: 4px; border: 1px solid #dee2e6;">
          <div style="color: #666; font-size: 10px; margin-bottom: 2px;">Found #${idx + 1} (${b64.length} chars)</div>
          <div style="color: #007bff; word-break: break-all; margin-bottom: 4px;">${b64.substring(0, 50)}${b64.length > 50 ? '...' : ''}</div>
          <div style="color: #28a745;"><strong>→</strong> ${window.escapeHtml ? window.escapeHtml(preview) : preview}</div>
          <button type="button" onclick="selectBase64Found(${idx})" 
            style="margin-top: 4px; padding: 2px 8px; font-size: 10px; background: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer;">
            Use this
          </button>
        </div>
      `;
    } catch (e) {
      // Skip invalid entries
    }
  });
  
  foundItems.innerHTML = itemsHtml;
  window._base64FoundResults = decodedResults;
  
  // Show first result in output
  if (decodedResults.length > 0) {
    output.value = decodedResults.map((r, i) => `=== Found #${i + 1} ===\n${r.decoded}`).join('\n\n');
  }
};

// Select a specific found Base64 result
window.selectBase64Found = function(index) {
  const results = window._base64FoundResults;
  if (!results || !results[index]) return;
  
  const input = document.getElementById('base64Input');
  const output = document.getElementById('base64Output');
  
  if (input) input.value = results[index].original;
  if (output) output.value = results[index].decoded;
};

// Copy Base64 output
window.copyBase64Output = function() {
  const output = document.getElementById('base64Output');
  if (!output || !output.value) return;
  
  navigator.clipboard.writeText(output.value).then(() => {
    // Brief feedback
    const originalBg = output.style.background;
    output.style.background = '#d4edda';
    setTimeout(() => { output.style.background = originalBg || '#f8f9fa'; }, 500);
  }).catch(err => {
    console.error('Copy failed:', err);
    output.select();
    document.execCommand('copy');
  });
};

// Download Base64 output as file
window.downloadBase64Output = function() {
  const output = document.getElementById('base64Output');
  if (!output || !output.value) return;
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `decoded-${timestamp}.txt`;
  
  const blob = new Blob([output.value], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// ========== END JSON OUTPUT TOOLBAR FUNCTIONS ==========
