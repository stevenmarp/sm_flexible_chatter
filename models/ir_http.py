# -*- coding: utf-8 -*-
from odoo import models


class IrHttp(models.AbstractModel):
    _inherit = "ir.http"

    def session_info(self):
        res = super(IrHttp, self).session_info()
        res["chatter_position"] = self.env.user.chatter_position
        return res
