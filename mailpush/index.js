'use strict';
const nodemailer = require('nodemailer');
const config = require('./config.json');

// create reusable transporter object using the default SMTP transport
let transporter = nodemailer.createTransport({
  host: 'smtp.qq.com', port: 465, secure: true, // secure:true for port 465, secure:false for port 587
  auth: {
    user: config.user,
    pass: config.pass
  }
});

exports.sendVerifyCodeTo = function (email, code) {
  return new Promise((resolve, reject) => {

    // setup email data with unicode symbols
    let mailOptions = {
      from: '"Heitaov" <mail@heitaov.cn>', // sender address
      to: email, // list of receivers
      subject: `注册Hitokoto的验证码为[${code}]`, // Subject line
      text: `验证码:${code} \n此验证码10分钟内有效。\n该邮件由服务器自动发送，请勿回复。`, // plain text body
      html: `<b>验证码:${code}</b><br/><p>此验证码10分钟内有效。该邮件由服务器自动发送，请勿回复。</p>` // html body
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        reject(error);
      } else {
        resolve(info);
      }
    });
  })
  // send mail with defined transport object
}
