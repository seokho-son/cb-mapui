/**
 * Common Popup Styles Module
 * @module common/popup-styles
 */

export const POPUP_STYLES = `
  <style>
    .popup-container { text-align: left; }
    .popup-section {
      background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 8px;
    }
    .popup-section-title {
      font-size: 0.75rem;
      font-weight: 600;
      color: #6c757d;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid #e9ecef;
    }
    .popup-row {
      display: flex;
      gap: 12px;
      margin-bottom: 6px;
    }
    .popup-row:last-child { margin-bottom: 0; }
    .popup-col { flex: 1; min-width: 0; }
    .popup-col-2 { flex: 2; }
    .popup-field { display: flex; flex-direction: column; gap: 2px; }
    .popup-label { font-size: 0.75rem; color: #888; font-weight: 500; }
    .popup-value { font-size: 0.85rem; font-weight: 600; color: #333; }
    .popup-value-sm { font-size: 0.8rem; color: #555; word-break: break-all; }
    .popup-value-highlight { color: #0d6efd; }
    .popup-value-price { color: #dc3545; }
    .popup-value-gpu { color: #dc3545; font-weight: 700; }
    .popup-input {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid #ced4da;
      border-radius: 5px;
      font-size: 0.85rem;
    }
    .popup-input:focus {
      border-color: #0d6efd;
      box-shadow: 0 0 0 2px rgba(13, 110, 253, 0.15);
      outline: none;
    }
    .popup-select {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid #ced4da;
      border-radius: 5px;
      font-size: 0.85rem;
      background: white;
    }
    .popup-hint { font-size: 0.7rem; color: #999; }
    .popup-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .popup-badge-provider {
      background: linear-gradient(135deg, #0d6efd 0%, #0056b3 100%);
      color: white;
    }
    .popup-inline { display: flex; align-items: center; gap: 6px; }
  </style>
`;

if (typeof window !== 'undefined') {
  window.POPUP_STYLES = POPUP_STYLES;
}

