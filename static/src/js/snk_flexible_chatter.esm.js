/*
    Copyright 2025 Sinerka
    License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
*/

import {append, setAttributes} from "@web/core/utils/xml";
import {FormCompiler} from "@web/views/form/form_compiler";
import {SIZES} from "@web/core/ui/ui_service";
import {patch} from "@web/core/utils/patch";
import {onMounted, onPatched} from "@odoo/owl";
import {FormController} from "@web/views/form/form_controller";

// Show notification
function showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'snk-toast-notification';
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
        const isPinned = msg.classList.contains('snk-message-pinned');
        
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
                // Find first message element and insert before it
                const firstMsg = parent.querySelector('.o-mail-Message');
                if (firstMsg) {
                    parent.insertBefore(item.el, firstMsg);
                }
            } else {
                // Insert after previous element in sorted order
                const prevEl = sortedMessages[targetIndex - 1].el;
                prevEl.after(item.el);
            }
        }
    });
}

// Add pin button to a message
function addPinButton(messageEl, container) {
    // Skip if already has button
    if (messageEl.querySelector('.snk-message-pin-btn')) return;
    
    const msgId = getMessageId(messageEl);
    const isPinned = localStorage.getItem(`snk_pinned_msg_${msgId}`) === 'true';
    
    // Apply pinned class if stored
    if (isPinned) {
        messageEl.classList.add('snk-message-pinned');
    }
    
    // Create button
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'snk-message-pin-btn' + (isPinned ? ' snk-pinned' : '');
    btn.title = isPinned ? 'Unpin' : 'Pin';
    btn.innerHTML = `<i class="fa fa-thumb-tack${isPinned ? '' : ' fa-rotate-90'}"></i>`;
    
    // Click handler
    btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const nowPinned = messageEl.classList.toggle('snk-message-pinned');
        btn.classList.toggle('snk-pinned', nowPinned);
        btn.innerHTML = `<i class="fa fa-thumb-tack${nowPinned ? '' : ' fa-rotate-90'}"></i>`;
        btn.title = nowPinned ? 'Unpin' : 'Pin';
        
        if (nowPinned) {
            localStorage.setItem(`snk_pinned_msg_${msgId}`, 'true');
            showNotification('Message Pinned!');
        } else {
            localStorage.removeItem(`snk_pinned_msg_${msgId}`);
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
    if (odoo.snk_flexible_chatter !== 'sided') return;
    
    setTimeout(() => {
        const containers = document.querySelectorAll('.o-mail-Form-chatter.o-aside');
        
        containers.forEach(container => {
            // Add hide/show toggle button
            if (!container.querySelector('.snk-chatter-toggle')) {
                const toggleBtn = document.createElement('button');
                toggleBtn.className = 'snk-chatter-toggle';
                toggleBtn.type = 'button';
                toggleBtn.title = 'Hide Chatter (Fullscreen)';
                toggleBtn.innerHTML = '<i class="fa fa-chevron-right"></i>';
                
                toggleBtn.onclick = () => {
                    const isHidden = container.classList.toggle('snk-chatter-hidden');
                    const formView = container.closest('.o_form_view');
                    const formSheet = formView?.querySelector('.o_form_sheet_bg');
                    
                    // Toggle fullscreen on form
                    if (formSheet) {
                        if (isHidden) {
                            formSheet.classList.add('snk-fullscreen-form');
                        } else {
                            formSheet.classList.remove('snk-fullscreen-form');
                        }
                    }
                    
                    // Update button
                    toggleBtn.innerHTML = isHidden 
                        ? '<i class="fa fa-chevron-left"></i>' 
                        : '<i class="fa fa-chevron-right"></i>';
                    toggleBtn.title = isHidden ? 'Show Chatter' : 'Hide Chatter (Fullscreen)';
                    
                    // Save state globally for all form views
                    localStorage.setItem('snk_chatter_fullscreen', isHidden ? 'true' : 'false');
                    
                    // Show notification
                    showNotification(isHidden ? 'Fullscreen Mode Enabled' : 'Chatter Visible');
                };
                
                container.appendChild(toggleBtn);
                
                // Restore saved state
                const isFullscreen = localStorage.getItem('snk_chatter_fullscreen') === 'true';
                if (isFullscreen) {
                    container.classList.add('snk-chatter-hidden');
                    toggleBtn.innerHTML = '<i class="fa fa-chevron-left"></i>';
                    toggleBtn.title = 'Show Chatter';
                    
                    // Apply fullscreen to form
                    const formView = container.closest('.o_form_view');
                    const formSheet = formView?.querySelector('.o_form_sheet_bg');
                    if (formSheet) {
                        formSheet.classList.add('snk-fullscreen-form');
                    }
                }
            }
            
            // Setup resize handle
            if (!container.querySelector('.snk-chatter-resize-handle')) {
                const handle = document.createElement('div');
                handle.className = 'snk-chatter-resize-handle';
                handle.innerHTML = '<i class="fa fa-ellipsis-v"></i>';
                container.insertBefore(handle, container.firstChild);
                
                // Load saved width
                const savedWidth = localStorage.getItem('snk_chatter_width');
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
                        localStorage.setItem('snk_chatter_width', container.offsetWidth);
                    }
                });
            }
            
            // Process messages and setup observer
            processMessages(container);
            setupMessageObserver(container);
        });
    }, 200);
}

// Patch FormController
patch(FormController.prototype, {
    setup() {
        super.setup();
        onMounted(() => initChatterFeatures());
        onPatched(() => initChatterFeatures());
    },
});

patch(FormCompiler.prototype, {
    /**
     * @override
     */
    compile(node, params) {
        const res = super.compile(node, params);
        const webClientViewAttachmentViewHookXml = res.querySelector(
            ".o_attachment_preview"
        );
        const chatterContainerHookXml = res.querySelector(
            ".o-mail-Form-chatter:not(.o-isInFormSheetBg)"
        );
        if (!chatterContainerHookXml) {
            // No chatter, keep the result as it is
            return res;
        }
        const chatterContainerXml = chatterContainerHookXml.querySelector(
            "t[t-component='__comp__.mailComponents.Chatter']"
        );
        const formSheetBgXml = res.querySelector(".o_form_sheet_bg");
        const parentXml = formSheetBgXml && formSheetBgXml.parentNode;
        if (!parentXml) {
            // Miss-config: a sheet-bg is required for the rest
            return res;
        }

        // Don't patch anything if the setting is "auto": this is the core behaviour
        if (odoo.snk_flexible_chatter === "auto") {
            return res;
            // For "sided", we have to remote the bottom chatter
            // (except if there is an attachment viewer, as we have to force bottom)
        } else if (odoo.snk_flexible_chatter === "sided") {
            setAttributes(chatterContainerXml, {
                isInFormSheetBg: `__comp__.uiService.size < ${SIZES.XXL}`,
                isChatterAside: `__comp__.uiService.size >= ${SIZES.XXL}`,
            });
            setAttributes(chatterContainerHookXml, {
                class: "o-mail-ChatterContainer o-mail-Form-chatter o-aside w-print-100",
            });
            // For "bottom", we keep the chatter in the form sheet
            // (the one used for the attachment viewer case)
            // If it's not there, we create it.
        } else if (odoo.snk_flexible_chatter === "bottom") {
            // Force full width form view if chatter is set to bottom manually
            formSheetBgXml.classList.add("o_fullwidth");
            if (webClientViewAttachmentViewHookXml) {
                const sheetBgChatterContainerHookXml = res.querySelector(
                    ".o-mail-Form-chatter.o-isInFormSheetBg"
                );
                setAttributes(sheetBgChatterContainerHookXml, {
                    "t-if": "true",
                });
                setAttributes(chatterContainerHookXml, {
                    "t-if": "false",
                });
            } else {
                const sheetBgChatterContainerHookXml =
                    chatterContainerHookXml.cloneNode(true);
                sheetBgChatterContainerHookXml.classList.add("o-isInFormSheetBg");
                setAttributes(sheetBgChatterContainerHookXml, {
                    "t-if": "true",
                    "t-attf-class": `{{ (__comp__.uiService.size >= ${SIZES.XXL} && ${
                        odoo.snk_flexible_chatter !== "bottom"
                    }) ? "o-aside" : "mt-4 mt-md-0" }}`,
                });
                append(formSheetBgXml, sheetBgChatterContainerHookXml);
                const sheetBgChatterContainerXml =
                    sheetBgChatterContainerHookXml.querySelector(
                        "t[t-component='__comp__.mailComponents.Chatter']"
                    );

                setAttributes(sheetBgChatterContainerXml, {
                    isInFormSheetBg: "true",
                });
                setAttributes(chatterContainerHookXml, {
                    "t-if": "false",
                });
            }
        }
        return res;
    },
    compileForm(el, params) {
        const form = super.compileForm(el, params);
        const sheet = form.querySelector(".o_form_sheet_bg");
        if (sheet && odoo.snk_flexible_chatter === "sided") {
            setAttributes(form, {
                "t-attf-class": "",
                class: "d-flex d-print-block flex-nowrap h-100",
            });
        }
        return form;
    },
});
