exports.HTML01 = function (title, pre, code, sub) {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml">
    <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
      <title>${title}</title>
    </head>
    <body style="background-color: #f6f6f6; height: 100%; margin: 0; padding: 0;" bgcolor="#f6f6f6">
      <div style="text-align: center; width: 100%; height: 100%; background-color: #f6f6f6; padding-top: 20px; padding-bottom: 30px; font-family: helvetica, 游ゴシック体, 'Hiragino Sans GB', 'Microsoft Yahei Light', 'Microsoft YaHei', 'WenQuanYi Micro Hei', lucida, sans-serif;" align="center">
          <table width="600" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;"><tbody><tr><td align="middle">
              <div style="width: 600px; text-align: left; color: #000; background-color: #fff; border-radius: 5px; -moz-border-radius: 5px; -khtml-border-radius: 5px; -o-border-radius: 5px; padding: 30px; -webkit-border-radius: 5px; -ms-border-radius: 5px; font-family: helvetica, 游ゴシック体, 'Hiragino Sans GB', 'Microsoft Yahei Light', 'Microsoft YaHei', 'WenQuanYi Micro Hei', lucida, sans-serif;" align="left">
            <p style="text-align: left;" align="left">${pre}</p>
                  <h1 style="text-align: center;" align="center">${code}</h1>
            <p style="text-align: center; font-size: 12px; font-weight: 900; line-height: 1;" align="center">、，；。</p>
            <p style="text-align: right; border-right-color: black; border-right-width: 4px; border-right-style: solid;" align="right">${sub}</p>
              </div>
              <table width="600" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;"><tbody><tr><td align="middle">
              <div style="width: 600px; text-align: center; color: #000; padding: 10px 30px 30px;" align="center">
                  <p style="text-align: center; font-size: 12px; color: #333;" align="center">该邮件由系统自动发送，请勿回复。</p>
                  <p style="text-align: center; font-size: 12px; color: #333;" align="center">&copy;heitaov.cn 一言</p>
              </div>
          </td></tr></tbody></table>
          </td></tr></tbody></table>
      </div>		
    </body>
  </html>`
}

exports.TEXT01 = function (pre, code, sub) {
  return `${pre}
  
  *********************
  ${code}
  *********************
  
  ${sub}
  
  该邮件由系统自动发送，请勿回复。
  
  @heitaov.cn 一言`
}