/**
 * Label Recommendation System Feature Module
 * @module features/labels
 */

// ========== LABEL RECOMMENDATION SYSTEM ==========
// Predefined common labels for NodeGroup configuration
const PREDEFINED_LABELS = [
  { key: 'role', value: 'control', description: 'Control plane node' },
  { key: 'role', value: 'node', description: 'General node' },
  { key: 'role', value: 'head', description: 'Head node (cluster manager)' },
  { key: 'role', value: 'worker', description: 'Worker node' },
  { key: 'role', value: 'model', description: 'LLM model serving node' },
  { key: 'role', value: 'gui', description: 'GUI/Dashboard node' },
  { key: 'role', value: 'benchmark', description: 'Benchmark manager node' },
  { key: 'role', value: 'observability', description: 'Monitoring/telemetry node' },
  { key: 'accelerator', value: 'gpu', description: 'GPU-enabled node' }
];


// Recently used labels (in-memory storage)
window._recentlyUsedLabels = [];
const MAX_RECENT_LABELS = 10;

// Add label to recently used list
window.addToRecentLabels = function(labelPair) {
  if (!labelPair || !labelPair.includes('=')) return;
  
  // Remove if already exists
  window._recentlyUsedLabels = window._recentlyUsedLabels.filter(l => l !== labelPair);
  
  // Add to front
  window._recentlyUsedLabels.unshift(labelPair);
  
  // Keep only recent N
  if (window._recentlyUsedLabels.length > MAX_RECENT_LABELS) {
    window._recentlyUsedLabels = window._recentlyUsedLabels.slice(0, MAX_RECENT_LABELS);
  }
};

// Add suggested label to input field
window.addSuggestedLabel = function(labelPair, inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  
  const currentValue = input.value.trim();
  const existingLabels = currentValue ? currentValue.split(',').map(l => l.trim()).filter(l => l) : [];
  
  // Check if label already exists
  if (existingLabels.includes(labelPair)) {
    console.log('Label already exists:', labelPair);
    return;
  }
  
  // Add the new label
  existingLabels.push(labelPair);
  input.value = existingLabels.join(', ');
  
  // Update chip styling
  updateLabelSuggestionChipStyle(labelPair, inputId, true);
  
  // Add to recently used
  window.addToRecentLabels(labelPair);
};

// Remove suggested label from input field
window.removeSuggestedLabel = function(labelPair, inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  
  const currentValue = input.value.trim();
  const existingLabels = currentValue ? currentValue.split(',').map(l => l.trim()).filter(l => l) : [];
  
  // Remove the label
  const newLabels = existingLabels.filter(l => l !== labelPair);
  input.value = newLabels.join(', ');
  
  // Update chip styling
  updateLabelSuggestionChipStyle(labelPair, inputId, false);
};

// Toggle label in input field
window.toggleSuggestedLabel = function(labelPair, inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  
  const currentValue = input.value.trim();
  const existingLabels = currentValue ? currentValue.split(',').map(l => l.trim()).filter(l => l) : [];
  
  if (existingLabels.includes(labelPair)) {
    window.removeSuggestedLabel(labelPair, inputId);
  } else {
    window.addSuggestedLabel(labelPair, inputId);
  }
};

// Update chip style based on selection state
export function updateLabelSuggestionChipStyle(labelPair, inputId, isSelected) {
  const container = document.getElementById(`${inputId}-suggestions`);
  if (!container) return;
  
  const chips = container.querySelectorAll('.label-suggestion-chip');
  chips.forEach(chip => {
    if (chip.dataset.label === labelPair) {
      if (isSelected) {
        chip.classList.add('selected');
        chip.style.background = '#28a745';
        chip.style.borderColor = '#28a745';
      } else {
        chip.classList.remove('selected');
        chip.style.background = '#e9ecef';
        chip.style.borderColor = '#ced4da';
      }
    }
  });
}
window.updateLabelSuggestionChipStyle = updateLabelSuggestionChipStyle;

// Sync all chip styles with current input value
window.syncLabelSuggestionChips = function(inputId) {
  const input = document.getElementById(inputId);
  const container = document.getElementById(`${inputId}-suggestions`);
  if (!input || !container) return;
  
  const currentLabels = input.value.trim().split(',').map(l => l.trim()).filter(l => l);
  const chips = container.querySelectorAll('.label-suggestion-chip');
  
  chips.forEach(chip => {
    const labelPair = chip.dataset.label;
    const isSelected = currentLabels.includes(labelPair);
    
    if (isSelected) {
      chip.classList.add('selected');
      chip.style.background = '#28a745';
      chip.style.borderColor = '#28a745';
      chip.style.color = 'white';
    } else {
      chip.classList.remove('selected');
      chip.style.background = '#e9ecef';
      chip.style.borderColor = '#ced4da';
      chip.style.color = '#495057';
    }
  });
};

// Generate label suggestion chips HTML
window.generateLabelSuggestionChipsHtml = function(inputId, hasGpu = false, currentLabels = '') {
  const existingLabels = currentLabels ? currentLabels.split(',').map(l => l.trim()).filter(l => l) : [];
  
  let html = `<div id="${inputId}-suggestions" style="margin-top: 6px;">`;
  html += '<div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">';
  
  // Get unique labels to show (predefined + recent, avoiding duplicates)
  const labelsToShow = [];
  const addedLabels = new Set();
  
  // Add predefined labels
  PREDEFINED_LABELS.forEach(label => {
    const labelPair = `${label.key}=${label.value}`;
    if (!addedLabels.has(labelPair)) {
      labelsToShow.push({ ...label, labelPair, isRecent: false });
      addedLabels.add(labelPair);
    }
  });
  
  // Add recent labels (that are not in predefined)
  window._recentlyUsedLabels.forEach(labelPair => {
    if (!addedLabels.has(labelPair)) {
      const [key, value] = labelPair.split('=');
      labelsToShow.push({ key, value, labelPair, isRecent: true, description: 'Recently used' });
      addedLabels.add(labelPair);
    }
  });
  
  // Generate chips (with XSS protection)
  labelsToShow.forEach(label => {
    const isSelected = existingLabels.includes(label.labelPair);
    const isGpuLabel = label.labelPair === 'accelerator=gpu';
    const chipStyle = isSelected 
      ? 'background: #28a745; border-color: #28a745; color: white;'
      : 'background: #e9ecef; border-color: #ced4da; color: #495057;';
    const recentBadge = label.isRecent ? '<span style="font-size: 8px; margin-left: 2px;">⏱</span>' : '';
    const gpuBadge = isGpuLabel && hasGpu ? '<span style="font-size: 8px; margin-left: 2px;">🎮</span>' : '';
    
    // Escape values to prevent XSS
    const escapedLabelPair = (label.labelPair || '').replace(/'/g, "&#39;").replace(/"/g, '&quot;');
    const escapedInputId = (inputId || '').replace(/'/g, "&#39;").replace(/"/g, '&quot;');
    const escapedValue = (label.value || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escapedDescription = (label.description || label.labelPair || '').replace(/"/g, '&quot;');
    
    html += `<button type="button" class="label-suggestion-chip ${isSelected ? 'selected' : ''}" 
      data-label="${escapedLabelPair}"
      onclick="toggleSuggestedLabel('${escapedLabelPair}', '${escapedInputId}')"
      style="padding: 2px 8px; border: 1px solid #ced4da; border-radius: 12px; 
             font-size: 0.7rem; cursor: pointer; transition: all 0.2s; ${chipStyle}"
      title="${escapedDescription}">
      ${escapedValue}${recentBadge}${gpuBadge}
    </button>`;
  });
  
  html += '</div></div>';
  return html;
};

// Auto-add GPU label if spec has GPU
window.autoAddGpuLabel = function(hasGpu, inputId) {
  if (!hasGpu) return;
  
  const input = document.getElementById(inputId);
  if (!input) return;
  
  const gpuLabel = 'accelerator=gpu';
  const currentValue = input.value.trim();
  const existingLabels = currentValue ? currentValue.split(',').map(l => l.trim()).filter(l => l) : [];
  
  // Only auto-add if not already present
  if (!existingLabels.includes(gpuLabel)) {
    existingLabels.push(gpuLabel);
    input.value = existingLabels.join(', ');
    
    // Sync chips after auto-add
    setTimeout(() => window.syncLabelSuggestionChips(inputId), 100);
  }
};

// Setup input listener for label suggestions sync
window.setupLabelInputListener = function(inputId) {
  const input = document.getElementById(inputId);
  if (!input || input._labelListenerAttached) return;
  
  input.addEventListener('input', function() {
    window.syncLabelSuggestionChips(inputId);
  });
  
  input._labelListenerAttached = true;
};
// ========== END LABEL RECOMMENDATION SYSTEM ==========
