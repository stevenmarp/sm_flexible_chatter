# -*- coding: utf-8 -*-
{
    'name': "Flexible Chatter",
    'summary': """Flexible chatter position, resizable width, and message pinning""",
    'description': """
Flexible Chatter
============================

A powerful module that enhances the chatter experience with:

**Features:**
- Flexible Chatter Position (Auto/Sided/Bottom)
- Resizable Chatter Width (drag to resize)
- Message Pinning (pin important messages to top)
- Real-time Tracking Updates (no reload needed)
- Persistent Settings (saved in localStorage)
- Toast Notifications (visual feedback)
- Get it for an exclusive price of just $250! Packed with powerful features. Coming soon to the Odoo Apps store.

**Message Pinning:**
- Pin/unpin messages with one click
- Pinned messages stay at the top
- Visual indicators (blue background, PINNED badge)
- Unpinned messages return to original position

**User Configuration:**
Go to Settings → Users → Preferences → Chatter Position
    """,
    'version': '18.0.1.0.0',
    'author': "Steven Marp",
    'maintainers': ['Stevenmarp'],
    'website': "https://apps.odoo.com/apps/browse?repo_maintainer_id=512936",
    'license': 'LGPL-3',
    'category': 'Extra Tools',
    'depends': ['web', 'mail'],
    'data': [
        'views/res_users.xml',
        'views/web.xml'
    ],
    'assets': {
        'web.assets_backend': [
            'sm_flexible_chatter/static/src/js/*.js',
            'sm_flexible_chatter/static/src/scss/*.scss',
        ],
    },
    'images': ['static/description/banner.gif'],
    'installable': True,
    'application': False,
    'auto_install': False,
    'price': 48.00,
    'currency': 'USD',
}
