/*
    Copyright 2025 Stevenmarp
    License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
*/

import {SIZES} from "@web/core/ui/ui_service";
import {patch} from "@web/core/utils/patch";
import {onMounted, onPatched} from "@odoo/owl";
import {FormController} from "@web/views/form/form_controller";
import {FormRenderer} from "@web/views/form/form_renderer";

// Show notification
function showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'sm-toast-notification';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: ${type === 'info' ? '#0d6efd' : '#dc3545'};
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// Store original DOM index for each message (for restoring position when unpinned)
const messageOriginalIndex = new Map();

// Get message ID from element
function getMessageId(msg) {
    // Try data attribute first
    const dataId = msg.dataset.messageId || msg.getAttribute('data-message-id');
    if (dataId) return dataId;
    
    // Try parent with data-message-id
    const parent = msg.closest('[data-message-id]');
    if (parent && parent !== msg) {
        return parent.dataset.messageId;
    }
    
    // Fallback: generate hash from content
    const content = msg.textContent.trim().substring(0, 150);
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
        hash = ((hash << 5) - hash) + content.charCodeAt(i);
        hash = hash & hash;
    }
    return 'msg_hash_' + Math.abs(hash);
}

// Save original indices of all messages
function saveMessageIndices(container) {
    const messages = container.querySelectorAll('.o-mail-Message');
    messages.forEach((msg, index) => {
        const msgId = getMessageId(msg);
        // Only save if not already saved (preserve first known position)
        if (!messageOriginalIndex.has(msgId)) {
            messageOriginalIndex.set(msgId, index);
        }
    });
}

// Reorder: pinned messages at top, unpinned in original order
function reorderMessages(container) {
    const messages = Array.from(container.querySelectorAll('.o-mail-Message'));
    if (messages.length === 0) return;
    
    const parent = messages[0].parentElement;
    if (!parent) return;
    
    // Categorize messages
    const pinned = [];
    const unpinned = [];
    
    messages.forEach(msg => {
        const msgId = getMessageId(msg);
        const isPinned = msg.classList.contains('sm-message-pinned');
        
        if (isPinned) {
            pinned.push({ el: msg, id: msgId });
        } else {
            // Get original index (lower = newer in Odoo chatter)
            const originalIdx = messageOriginalIndex.get(msgId) ?? 9999;
            unpinned.push({ el: msg, id: msgId, originalIndex: originalIdx });
        }
    });
    
    // Sort unpinned by original index (restore original order)
    unpinned.sort((a, b) => a.originalIndex - b.originalIndex);
    
    // Combine: pinned first, then unpinned
    const sortedMessages = [...pinned, ...unpinned];
    
    // Reorder DOM
    sortedMessages.forEach((item, targetIndex) => {
        const siblings = Array.from(parent.querySelectorAll('.o-mail-Message'));
        const currentIndex = siblings.indexOf(item.el);
        
        if (currentIndex !== targetIndex) {
            if (targetIndex === 0) {
                const firstMsg = parent.querySelector('.o-mail-Message');
                if (firstMsg) {
                    parent.insertBefore(item.el, firstMsg);
                }
            } else {
                const prevEl = sortedMessages[targetIndex - 1].el;
                prevEl.after(item.el);
            }
        }
    });
}

// Add pin button to a message
function addPinButton(messageEl, container) {
    // Skip if already has button
    if (messageEl.querySelector('.sm-message-pin-btn')) return;
    
    const msgId = getMessageId(messageEl);
    const isPinned = localStorage.getItem(`sm_pinned_msg_${msgId}`) === 'true';
    
    // Apply pinned class if stored
    if (isPinned) {
        messageEl.classList.add('sm-message-pinned');
    }
    
    // Create button
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sm-message-pin-btn' + (isPinned ? ' sm-pinned' : '');
    btn.title = isPinned ? 'Unpin' : 'Pin';
    btn.innerHTML = `<i class="fa fa-thumb-tack${isPinned ? '' : ' fa-rotate-90'}"></i>`;
    
    // Click handler
    btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const nowPinned = messageEl.classList.toggle('sm-message-pinned');
        btn.classList.toggle('sm-pinned', nowPinned);
        btn.innerHTML = `<i class="fa fa-thumb-tack${nowPinned ? '' : ' fa-rotate-90'}"></i>`;
        btn.title = nowPinned ? 'Unpin' : 'Pin';
        
        if (nowPinned) {
            localStorage.setItem(`sm_pinned_msg_${msgId}`, 'true');
            showNotification('Message Pinned!');
        } else {
            localStorage.removeItem(`sm_pinned_msg_${msgId}`);
            showNotification('Message Unpinned!');
        }
        
        // Reorder messages
        setTimeout(() => reorderMessages(container), 10);
    };
    
    // Make message relative for absolute button positioning
    messageEl.style.position = 'relative';
    messageEl.appendChild(btn);
}

// Process all messages in container
function processMessages(container) {
    // Save original indices first
    saveMessageIndices(container);
    
    // Add pin buttons
    const messages = container.querySelectorAll('.o-mail-Message');
    messages.forEach(msg => addPinButton(msg, container));
    
    // Reorder if any pinned
    reorderMessages(container);
}

// Observed containers (to avoid duplicate observers)
const observedContainers = new WeakSet();

// Setup MutationObserver for new messages (tracking field updates)
function setupMessageObserver(container) {
    if (observedContainers.has(container)) return;
    observedContainers.add(container);
    
    const observer = new MutationObserver((mutations) => {
        let hasNewMessages = false;
        
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.classList?.contains('o-mail-Message') ||
                            node.querySelector?.('.o-mail-Message')) {
                            hasNewMessages = true;
                            break;
                        }
                    }
                }
            }
            if (hasNewMessages) break;
        }
        
        if (hasNewMessages) {
            // Small delay to let DOM settle
            setTimeout(() => processMessages(container), 50);
        }
    });
    
    observer.observe(container, {
        childList: true,
        subtree: true
    });
}

// Initialize all chatter features
function initChatterFeatures() {
    if (odoo.sm_flexible_chatter !== 'sided') return;
    
    setTimeout(() => {
        const containers = document.querySelectorAll('.o-mail-Form-chatter.o-aside');
        
        containers.forEach(container => {
            // Add hide/show toggle button
            if (!container.querySelector('.sm-chatter-toggle')) {
                const toggleBtn = document.createElement('button');
                toggleBtn.className = 'sm-chatter-toggle';
                toggleBtn.type = 'button';
                toggleBtn.title = 'Hide Chatter (Fullscreen)';
                toggleBtn.innerHTML = '<i class="fa fa-chevron-right"></i>';
                
                toggleBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const isHidden = container.classList.toggle('sm-chatter-hidden');
                    const formRenderer = container.closest('.o_form_renderer');
                    const formSheet = formRenderer?.querySelector('.o_form_sheet_bg');
                    
                    // Toggle fullscreen on form
                    if (formSheet) {
                        formSheet.classList.toggle('sm-fullscreen-form', isHidden);
                    }
                    
                    // When hiding, clear inline width styles so CSS takes over
                    if (isHidden) {
                        container.style.width = '';
                        container.style.minWidth = '';
                        container.style.maxWidth = '';
                    } else {
                        // Restore saved width when showing
                        const savedWidth = localStorage.getItem('sm_chatter_width');
                        if (savedWidth) {
                            container.style.width = savedWidth + 'px';
                            container.style.minWidth = savedWidth + 'px';
                            container.style.maxWidth = savedWidth + 'px';
                        }
                    }
                    
                    // Update button icon
                    toggleBtn.innerHTML = isHidden 
                        ? '<i class="fa fa-chevron-left"></i>' 
                        : '<i class="fa fa-chevron-right"></i>';
                    toggleBtn.title = isHidden ? 'Show Chatter' : 'Hide Chatter (Fullscreen)';
                    
                    // Save state
                    localStorage.setItem('sm_chatter_fullscreen', isHidden ? 'true' : 'false');
                    
                    showNotification(isHidden ? 'Fullscreen Mode Enabled' : 'Chatter Visible');
                };
                
                // Insert toggle as first child so it's always accessible
                container.insertBefore(toggleBtn, container.firstChild);
                
                // Restore saved state
                const isFullscreen = localStorage.getItem('sm_chatter_fullscreen') === 'true';
                if (isFullscreen) {
                    container.classList.add('sm-chatter-hidden');
                    toggleBtn.innerHTML = '<i class="fa fa-chevron-left"></i>';
                    toggleBtn.title = 'Show Chatter';
                    
                    // Clear inline width
                    container.style.width = '';
                    container.style.minWidth = '';
                    container.style.maxWidth = '';
                    
                    // Apply fullscreen to form
                    const formRenderer = container.closest('.o_form_renderer');
                    const formSheet = formRenderer?.querySelector('.o_form_sheet_bg');
                    if (formSheet) {
                        formSheet.classList.add('sm-fullscreen-form');
                    }
                }
            }
            
            // Setup resize handle
            if (!container.querySelector('.sm-chatter-resize-handle')) {
                const handle = document.createElement('div');
                handle.className = 'sm-chatter-resize-handle';
                handle.innerHTML = '<i class="fa fa-ellipsis-v"></i>';
                container.insertBefore(handle, container.firstChild);
                
                // Load saved width
                const savedWidth = localStorage.getItem('sm_chatter_width');
                if (savedWidth) {
                    container.style.width = savedWidth + 'px';
                    container.style.minWidth = savedWidth + 'px';
                    container.style.maxWidth = savedWidth + 'px';
                }
                
                // Resize logic
                let isResizing = false, startX = 0, startWidth = 0;
                
                handle.onmousedown = (e) => {
                    isResizing = true;
                    startX = e.clientX;
                    startWidth = container.offsetWidth;
                    document.body.style.cursor = 'ew-resize';
                    document.body.style.userSelect = 'none';
                    e.preventDefault();
                };
                
                document.addEventListener('mousemove', (e) => {
                    if (!isResizing) return;
                    const newWidth = Math.max(300, Math.min(800, startWidth + (startX - e.clientX)));
                    container.style.width = newWidth + 'px';
                    container.style.minWidth = newWidth + 'px';
                    container.style.maxWidth = newWidth + 'px';
                });
                
                document.addEventListener('mouseup', () => {
                    if (isResizing) {
                        isResizing = false;
                        document.body.style.cursor = '';
                        document.body.style.userSelect = '';
                        localStorage.setItem('sm_chatter_width', container.offsetWidth);
                    }
                });
            }
            
            // Process messages and setup observer
            processMessages(container);
            setupMessageObserver(container);
        });
    }, 200);
}

// Patch FormController - keep pin/resize/toggle features
patch(FormController.prototype, {
    setup() {
        super.setup();
        onMounted(() => initChatterFeatures());
        onPatched(() => initChatterFeatures());
    },
});

/**
 * Patch FormRenderer.mailLayout() to override chatter position
 * based on user preference stored in odoo.sm_flexible_chatter
 * 
 * Odoo 19 uses mailLayout() to determine chatter position dynamically:
 * - "SIDE_CHATTER" = chatter on the side
 * - "BOTTOM_CHATTER" = chatter on the bottom
 * - "COMBO" = chatter bottom + attachment on side
 * - "EXTERNAL_COMBO_XXL" / "EXTERNAL_COMBO" = chatter side/bottom + attachment in separate tab
 * - "NONE" = no chatter
 */
patch(FormRenderer.prototype, {
    mailLayout(hasAttachmentContainer) {
        const preference = odoo.sm_flexible_chatter;
        
        // If "auto" or not set, use the default Odoo 19 behavior
        if (!preference || preference === "auto") {
            return super.mailLayout(hasAttachmentContainer);
        }
        
        // Guard: if mailStore is not available, no chatter
        if (!this.mailStore) {
            return "NONE";
        }
        
        const xxl = this.uiService.size >= SIZES.XXL;
        const hasFile = this.hasFile();
        const hasExternalWindow = !!this.mailPopoutService?.externalWindow;
        
        if (preference === "sided") {
            // Force chatter to the side when screen is large enough
            if (xxl) {
                if (hasExternalWindow && hasFile && hasAttachmentContainer) {
                    return "EXTERNAL_COMBO_XXL";
                }
                if (hasAttachmentContainer && hasFile) {
                    return "COMBO";
                }
                return "SIDE_CHATTER";
            }
            // On smaller screens, fall back to bottom (can't fit side chatter)
            return "BOTTOM_CHATTER";
        }
        
        if (preference === "bottom") {
            // Force chatter to the bottom always
            if (hasExternalWindow && hasFile && hasAttachmentContainer) {
                return "EXTERNAL_COMBO";
            }
            return "BOTTOM_CHATTER";
        }
        
        // Fallback to default
        return super.mailLayout(hasAttachmentContainer);
    },
});
