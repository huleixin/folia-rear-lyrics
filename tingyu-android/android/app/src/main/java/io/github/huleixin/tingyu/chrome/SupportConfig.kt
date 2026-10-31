package io.github.huleixin.tingyu.chrome

import io.github.huleixin.tingyu.R

// android/app/src/main/java/io/github/huleixin/tingyu/chrome/SupportConfig.kt
// 「支持与交流」唯一的素材配置位置。这里只描述静态素材与联系方式：
// 不接入任何应用内支付、不请求用户支付信息、不会自动弹出任何赞赏请求。

object SupportConfig {
    // 微信赞赏码：res/drawable-nodpi/support_wechat_qr.png
    val wechatRewardQr: Int = R.drawable.support_wechat_qr

    // 支付宝收款码：res/drawable-nodpi/support_alipay_qr.jpg
    val alipayQr: Int = R.drawable.support_alipay_qr

    // QQ 交流群号（纯数字字符串）。留空表示「未配置」，界面显示占位并禁用按钮。
    const val qqGroupId: String = "991539402"

    // QQ 群邀请链接。配置后优先通过它跳转，失败再回退到群号跳转，最后回退到复制群号。
    const val qqGroupInvite: String = "https://qm.qq.com/q/F8DX8ixdD2"
}
