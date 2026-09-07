/**
 * Utility functions for CB-MapUI
 * @module core/utils
 */

// Word pool for Infra naming
const _infraNameWordPool = [
  // 🐾 Animals
  'lion','tiger','eagle','wolf','bear','fox','panda','hawk','dolphin','penguin',
  'rabbit','shark','whale','parrot','dragon',
  // 🍎 Fruits
  'apple','banana','orange','grape','mango','lemon','peach','cherry','melon','coconut',
  'kiwi','lime','plum','pear','strawberry',
  // 🌸 Flowers
  'rose','lily','daisy','tulip','poppy','violet','orchid','lavender','jasmine','sunflower',
  // 🌍 Nature
  'rainbow','storm','thunder','wind','fire','ice','snow','river','ocean','island',
  'forest','mountain','volcano','desert','glacier',
  // 🍪 Snacks & Drinks
  'cookie','candy','waffle','donut','muffin','brownie','caramel','honey','latte','cocoa',
  // 🎮 Fantasy
  'wizard','knight','ninja','pirate','viking','samurai','hunter','ranger','shadow','blaze',
  // 💎 Gems
  'ruby','sapphire','emerald','diamond','pearl','jade','amber','topaz','opal','crystal',
  // 🚀 Space
  'sun','moon','star','mars','venus','saturn','jupiter','comet','meteor','galaxy',
  'nebula','aurora','eclipse','rocket','orbit',
];

/**
 * Escapes text for safe inclusion in HTML nodes and attribute values
 * @param {string} text - Raw text to escape
 * @returns {string} - Escaped HTML string
 */
export function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Generates a random alphanumeric string for resource naming
 * @param {number} [len=5] - Desired length
 * @returns {string}
 */
export function generateRandomString(len = 5) {
  return Math.random().toString(36).substr(2, len);
}

/**
 * Returns an Infra-friendly name like "mc-panda", preferring words not recently used.
 * Usage history is stored in localStorage so it persists across sessions.
 * @returns {string}
 */
export function generateInfraName() {
  const STORAGE_KEY = 'infraNameUsedWords';
  let used = [];
  try {
    used = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch (e) { /* ignore */ }

  const unused = _infraNameWordPool.filter(w => !used.includes(w));
  const pool = unused.length > 0 ? unused : _infraNameWordPool;
  const word = pool[Math.floor(Math.random() * pool.length)];

  try {
    const updated = [...used.filter(w => w !== word), word].slice(-100);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) { /* ignore */ }

  return word;
}

/**
 * Truncate Infra name with ellipsis
 * @param {string} name 
 * @param {number} [maxLength=25] 
 * @returns {string}
 */
export function truncateInfraName(name, maxLength = 25) {
  if (!name) return '';
  if (name.length <= maxLength) return name;
  return name.substring(0, maxLength) + '..';
}

/**
 * Helper function to convert hex color to RGB array [r, g, b]
 * @param {string} hex 
 * @returns {number[]}
 */
export function hexToRgb(hex) {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substr(0, 2), 16);
  const g = parseInt(cleanHex.substr(2, 2), 16);
  const b = parseInt(cleanHex.substr(4, 2), 16);
  return [r, g, b];
}

/**
 * Helper function to calculate luminance and determine contrast color
 * @param {string} hexColor 
 * @returns {string}
 */
export function getContrastColor(hexColor) {
  const cleanHex = hexColor.replace('#', '').replace(/ff$/i, '');
  const [r, g, b] = hexToRgb(cleanHex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

/**
 * Check if a string represents a non-negative normal integer
 * @param {string} str
 * @returns {boolean}
 */
export function isNormalInteger(str) {
  var n = Math.floor(Number(str));
  return n !== Infinity && String(n) === String(str) && n >= 0;
}

/**
 * Display auto-dismissing info alert modal
 * @param {string} message
 */
export function infoAlert(message) {
  if (typeof Swal !== 'undefined') {
    Swal.fire({
      icon: 'info',
      title: message,
      showConfirmButton: false,
      timer: 2500,
    });
  } else {
    alert(message);
  }
}

/**
 * Display error alert modal requiring user confirmation
 * @param {string} message
 */
export function errorAlert(message) {
  if (typeof Swal !== 'undefined') {
    Swal.fire({
      icon: 'error',
      title: message,
      showConfirmButton: true,
    });
  } else {
    alert(message);
  }
}

/**
 * Display auto-dismissing success alert modal
 * @param {string} message
 */
export function successAlert(message) {
  if (typeof Swal !== 'undefined') {
    Swal.fire({
      icon: 'success',
      title: message,
      showConfirmButton: false,
      timer: 2500,
    });
  } else {
    alert(message);
  }
}

// Global window registrations for HTML inline event callbacks
window.escapeHtml = escapeHtml;
window.generateRandomString = generateRandomString;
window.generateInfraName = generateInfraName;
window.hexToRgb = hexToRgb;
window.getContrastColor = getContrastColor;
window.isNormalInteger = isNormalInteger;
window.infoAlert = infoAlert;
window.errorAlert = errorAlert;
window.successAlert = successAlert;


