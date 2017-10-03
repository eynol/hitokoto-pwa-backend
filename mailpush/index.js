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

exports.sendVerifyCodeTo = function (email, code, whatfor) {
  if (whatfor == 'regist') {
    return new Promise((resolve, reject) => {

      // setup email data with unicode symbols
      let mailOptions = {
        from: '"Heitaov" <mail@heitaov.cn>', // sender address
        to: email, // list of receivers
        subject: `[一言]注册Hitokoto的验证码为[${code}]`, // Subject line
        text: `验证码: ${code} \n此验证码10分钟内有效。\n该邮件由服务器自动发送，请勿回复。若非您本人亲自操作，请忽略本邮件。`, // plain text body
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
  } else if (whatfor == 'oldemailcode') {
    return new Promise((resolve, reject) => {

      // setup email data with unicode symbols
      let mailOptions = {
        from: '"Heitaov" <mail@heitaov.cn>', // sender address
        to: email, // list of receivers
        subject: `[一言]有人正在一言修改邮箱，验证码为[${code}]`, // Subject line
        text: `验证码: ${code} \n此验证码10分钟内有效。\n该邮件由服务器自动发送，请勿回复。若非您本人亲自操作，请忽略本邮件。`, // plain text body
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
  } else if (whatfor == 'newemailcode') {
    return new Promise((resolve, reject) => {

      // setup email data with unicode symbols
      let mailOptions = {
        from: '"Heitaov" <mail@heitaov.cn>', // sender address
        to: email, // list of receivers
        subject: `[一言]有人正在一言[绑定新的邮箱]，验证码为[${code}]`, // Subject line
        text: `验证码: ${code} \n此验证码10分钟内有效。\n该邮件由服务器自动发送，请勿回复。若非您本人亲自操作，请忽略本邮件。`, // plain text body
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
  }
  return Promise.reject('用途不明!')
  // send mail with defined transport object
}

exports.notifyChangePassword = function (email) {
  return new Promise((resolve, reject) => {

    // setup email data with unicode symbols
    let mailOptions = {
      from: '"Heitaov" <mail@heitaov.cn>', // sender address
      to: email, // list of receivers
      subject: `[一言]有人修改了您的密码，若非本人操作，请及时联系系统管理员。`, // Subject line
      text: `操作时间：${new Date().toLocaleString()} 。若非本人操作，请及时联系系统管理员。\n该邮件由服务器自动发送，请勿回复。若非您本人亲自操作，请忽略本邮件。`, // plain text body
      html: `[一言]有人修改了您的密码，操作时间是 ${new Date().toLocaleString()}。该邮件由服务器自动发送，请勿回复。</p>` // html body
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        reject(error);
      } else {
        resolve(info);
      }
    });
  })
}