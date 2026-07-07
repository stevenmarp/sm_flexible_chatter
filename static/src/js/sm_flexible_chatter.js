/*
    Copyright 2026 Stevenmarp
    License LGPL-3.0 or later (https://www.gnu.org/licenses/lgpl).
*/

(function() {
    'use strict';
    
    // Initialize session preference globally
    const sessionPos = (window.odoo && window.odoo.session_info && window.odoo.session_info.chatter_position) || 'sided';
    window.odoo = window.odoo || {};
    window.odoo.sm_flexible_chatter = sessionPos;
    
    if (document.body) {
        document.body.setAttribute('data-chatter-position', sessionPos);
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            document.body.setAttribute('data-chatter-position', sessionPos);
        });
    }


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
            pointer-events: none;
        `;
        document.body.appendChild(toast);
        
        // Simple vanilla CSS transition fallback
        toast.style.transition = 'opacity 0.3s ease';
        toast.style.opacity = '1';
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }

    const messageOriginalIndex = new Map();

    function getMessageId(msg) {
        const dataId = msg.dataset.id || msg.dataset.messageId || msg.getAttribute('data-id') || msg.getAttribute('data-message-id');
        if (dataId) return String(dataId);
        
        const parent = msg.closest('[data-id], [data-message-id]');
        if (parent && parent !== msg) {
            return String(parent.dataset.id || parent.dataset.messageId || parent.getAttribute('data-id') || parent.getAttribute('data-message-id'));
        }
        
        const content = msg.textContent.trim().substring(0, 150);
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            hash = ((hash << 5) - hash) + content.charCodeAt(i);
            hash = hash & hash;
        }
        return 'msg_hash_' + Math.abs(hash);
    }

    function saveMessageIndices(container) {
        const messages = container.querySelectorAll('.o_Message, .o-mail-Message, .o_thread_message');
        messages.forEach((msg, index) => {
            const msgId = getMessageId(msg);
            if (!messageOriginalIndex.has(msgId)) {
                messageOriginalIndex.set(msgId, index);
            }
        });
    }

    function reorderMessages(container) {
        const messages = Array.from(container.querySelectorAll('.o_Message, .o-mail-Message, .o_thread_message'));
        if (messages.length === 0) return;
        
        const parent = messages[0].parentElement;
        if (!parent) return;
        
        const pinned = [];
        const unpinned = [];
        
        messages.forEach(msg => {
            const msgId = getMessageId(msg);
            const isPinned = msg.classList.contains('sm-message-pinned');
            
            if (isPinned) {
                pinned.push({ el: msg, id: msgId });
            } else {
                const originalIdx = messageOriginalIndex.get(msgId) ?? 9999;
                unpinned.push({ el: msg, id: msgId, originalIndex: originalIdx });
            }
        });
        
        unpinned.sort((a, b) => a.originalIndex - b.originalIndex);
        const sortedMessages = [...pinned, ...unpinned];
        
        sortedMessages.forEach((item, targetIndex) => {
            const siblings = Array.from(parent.querySelectorAll('.o_Message, .o-mail-Message, .o_thread_message'));
            const currentIndex = siblings.indexOf(item.el);
            
            if (currentIndex !== targetIndex) {
                if (targetIndex === 0) {
                    const firstMsg = parent.querySelector('.o_Message, .o-mail-Message, .o_thread_message');
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

    function addPinButton(messageEl, container) {
        if (messageEl.querySelector('.sm-message-pin-btn')) return;
        
        const msgId = getMessageId(messageEl);
        const isPinned = localStorage.getItem('sm_pinned_msg_' + msgId) === 'true';
        
        if (isPinned) {
            messageEl.classList.add('sm-message-pinned');
        }
        
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sm-message-pin-btn' + (isPinned ? ' sm-pinned' : '');
        btn.title = isPinned ? 'Unpin' : 'Pin';
        btn.innerHTML = '<i class="fa fa-thumb-tack' + (isPinned ? '' : ' fa-rotate-90') + '"></i>';
        
        btn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const nowPinned = messageEl.classList.toggle('sm-message-pinned');
            btn.classList.toggle('sm-pinned', nowPinned);
            btn.innerHTML = '<i class="fa fa-thumb-tack' + (nowPinned ? '' : ' fa-rotate-90') + '"></i>';
            btn.title = nowPinned ? 'Unpin' : 'Pin';
            
            if (nowPinned) {
                localStorage.setItem('sm_pinned_msg_' + msgId, 'true');
                showNotification('Message Pinned!');
            } else {
                localStorage.removeItem('sm_pinned_msg_' + msgId);
                showNotification('Message Unpinned!');
            }
            
            setTimeout(function() { reorderMessages(container); }, 10);
        };
        
        messageEl.style.position = 'relative';
        messageEl.appendChild(btn);
    }

    function processMessages(container) {
        saveMessageIndices(container);
        const messages = container.querySelectorAll('.o_Message, .o-mail-Message, .o_thread_message');
        messages.forEach(function(msg) { addPinButton(msg, container); });
        reorderMessages(container);
    }

    function initChatterFeatures() {
        const position = window.odoo && window.odoo.sm_flexible_chatter || 'auto';
        if (document.body) {
            document.body.setAttribute('data-chatter-position', position);
        }

        let chatterContainers = document.querySelectorAll('.o_FormRenderer_chatterContainer, .o_ChatterContainer, .o_chatter, .oe_chatter');
        chatterContainers = Array.from(chatterContainers).filter(container => {
            const parent = container.parentElement.closest('.o_FormRenderer_chatterContainer, .o_ChatterContainer, .o_chatter, .oe_chatter');
            return !parent;
        });
        chatterContainers.forEach(function(container) {
            const formView = container.closest('.o_form_view');
            if (!formView) return;

            // Do not apply sided layout inside modals/dialogs
            const isModal = container.closest('.modal') || container.closest('.o_dialog') || container.closest('.modal-content');

            if (position !== 'sided' || isModal) {
                formView.classList.remove('sm-chatter-sided');
                container.classList.remove('o-aside');
                
                // Move chatter inside form view container so it scrolls naturally
                const viewContainer = formView.querySelector('.o_form_view_container');
                if (viewContainer && container.parentElement !== viewContainer) {
                    viewContainer.appendChild(container);
                }
                
                const toggle = container.querySelector('.sm-chatter-toggle');
                if (toggle) toggle.remove();
                const handle = container.querySelector('.sm-chatter-resize-handle');
                if (handle) handle.remove();
                container.style.width = '';
                container.style.minWidth = '';
                container.style.maxWidth = '';
                return;
            }

            formView.classList.add('sm-chatter-sided');
            container.classList.add('o-aside');

            // Add hide/show toggle button
            if (!container.querySelector('.sm-chatter-toggle')) {
                const toggleBtn = document.createElement('button');
                toggleBtn.className = 'sm-chatter-toggle';
                toggleBtn.type = 'button';
                toggleBtn.title = 'Hide Chatter (Fullscreen)';
                toggleBtn.innerHTML = '<i class="fa fa-chevron-right"></i>';
                
                toggleBtn.onclick = function() {
                    const isHidden = container.classList.toggle('sm-chatter-hidden');
                    const formSheet = formView.querySelector('.o_form_sheet_bg');
                    
                    if (formSheet) {
                        if (isHidden) {
                            formSheet.classList.add('sm-fullscreen-form');
                        } else {
                            formSheet.classList.remove('sm-fullscreen-form');
                        }
                    }
                    
                    toggleBtn.innerHTML = isHidden 
                        ? '<i class="fa fa-chevron-left"></i>' 
                        : '<i class="fa fa-chevron-right"></i>';
                    toggleBtn.title = isHidden ? 'Show Chatter' : 'Hide Chatter (Fullscreen)';
                    
                    localStorage.setItem('sm_chatter_fullscreen', isHidden ? 'true' : 'false');
                    showNotification(isHidden ? 'Fullscreen Mode Enabled' : 'Chatter Visible');
                };
                
                container.appendChild(toggleBtn);
                
                // Restore saved state
                const isFullscreen = localStorage.getItem('sm_chatter_fullscreen') === 'true';
                if (isFullscreen) {
                    container.classList.add('sm-chatter-hidden');
                    toggleBtn.innerHTML = '<i class="fa fa-chevron-left"></i>';
                    toggleBtn.title = 'Show Chatter';
                    
                    const formSheet = formView.querySelector('.o_form_sheet_bg');
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
                
                // Load saved width or use a clean default (e.g., 380px)
                const savedWidth = localStorage.getItem('sm_chatter_width') || '380';
                container.style.width = savedWidth + 'px';
                container.style.minWidth = savedWidth + 'px';
                container.style.maxWidth = savedWidth + 'px';
                
                // Resize logic
                let isResizing = false, startX = 0, startWidth = 0;
                
                handle.onmousedown = function(e) {
                    isResizing = true;
                    startX = e.clientX;
                    startWidth = container.offsetWidth;
                    document.body.style.cursor = 'ew-resize';
                    document.body.style.userSelect = 'none';
                    e.preventDefault();
                };
                
                document.addEventListener('mousemove', function(e) {
                    if (!isResizing) return;
                    const newWidth = Math.max(300, Math.min(800, startWidth + (startX - e.clientX)));
                    container.style.width = newWidth + 'px';
                    container.style.minWidth = newWidth + 'px';
                    container.style.maxWidth = newWidth + 'px';
                });
                
                document.addEventListener('mouseup', function() {
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
        });
    }

    // Set up MutationObserver to detect new views and updates
    function init() {
        const observer = new MutationObserver(function(mutations) {
            let shouldInit = false;
            mutations.forEach(function(mutation) {
                if (mutation.type === 'childList') {
                    for (let i = 0; i < mutation.addedNodes.length; i++) {
                        const node = mutation.addedNodes[i];
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.querySelector('.o_form_view') || node.classList.contains('o_form_view') ||
                                node.querySelector('.o_Message, .o-mail-Message, .o_thread_message') ||
                                node.classList.contains('o_Message') || node.classList.contains('o-mail-Message') || node.classList.contains('o_thread_message')) {
                                shouldInit = true;
                                break;
                            }
                        }
                    }
                }
                if (shouldInit) return;
            });
            if (shouldInit) {
                initChatterFeatures();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Initial run
        initChatterFeatures();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
