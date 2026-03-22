# -*- coding: utf-8 -*-
from odoo import api, fields, models


class ResUsers(models.Model):
    _inherit = "res.users"

    chatter_position = fields.Selection(
        [
            ("auto", "Automatic"),
            ("bottom", "Bottom"),
            ("sided", "Sided"),
        ],
        default="auto",
        string="Chatter Position",
        required=True,
    )
    
    def _get_chatter_position(self):
        """Get chatter position with fallback to default"""
        return getattr(self, 'chatter_position', 'auto') or 'auto'

    @property
    def SELF_READABLE_FIELDS(self):
        return super().SELF_READABLE_FIELDS + ["chatter_position"]

    @property
    def SELF_WRITEABLE_FIELDS(self):
        return super().SELF_WRITEABLE_FIELDS + [
            "chatter_position",
        ]
