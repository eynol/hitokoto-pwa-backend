'use strict';
const nodemailer = require('nodemailer');
const config = require('./email.hito.secret.config.json');

const templates = require('./email-templates');

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
        from: '"一言" <mail@heitaov.cn>', // sender address
        to: email, // list of receivers
        subject: `${code},这是注册一言的验证码`, // Subject line
        text: templates.TEXT01('你注册一言的验证码为：', code, '此验证码30分钟内有效。若非您本人亲自操作，请忽略本邮件。'), // plain text body
        html: templates.HTML01('你注册一言的验证码为：' + code, '你注册一言的验证码为：', code, '此验证码30分钟内有效。若非您本人亲自操作，请忽略本邮件。') // html body
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
        from: '"一言" <mail@heitaov.cn>', // sender address
        to: email, // list of receivers
        subject: `${code},这是在一言修改绑定邮箱的验证码`, // Subject line
        text: templates.TEXT01('你在一言修改绑定邮箱的验证码为：', code, '此验证码30分钟内有效。若非您本人亲自操作，请忽略本邮件。'), // plain text body
        html: templates.HTML01('修改绑定邮箱', '有人正在一言修改绑定邮箱，验证码为：', code, '此验证码30分钟内有效。若非您本人亲自操作，请忽略本邮件。') // html body
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
        from: '"一言" <mail@heitaov.cn>', // sender address
        to: email, // list of receivers
        subject: `${code},这是你在一言绑定新邮箱的验证码`, // Subject line
        text: templates.TEXT01('你在一言绑定新邮箱的验证码为：', code, '此验证码30分钟内有效。若非您本人亲自操作，请忽略本邮件。'), // plain text body
        html: templates.HTML01('绑定新邮箱', '你在一言绑定新邮箱的验证码为：：', code, '此验证码30分钟内有效。若非您本人亲自操作，请忽略本邮件。') // html body
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
      from: '"一言" <mail@heitaov.cn>', // sender address
      to: email, // list of receivers
      subject: `一言-有人修改了您的密码，若非本人操作，请及时联系系统管理员。`, // Subject line
      text: templates.TEXT01('有人修改了您在一言网的密码，时刻是：', new Date().toLocaleString(), '若不是您本人亲自操作，请及时联系管理员。'), // plain text body
      html: templates.HTML01('有人修改了您在一言网的密码', '有人修改了您在一言网的密码，时刻是：', new Date().toLocaleString(), '若不是您本人亲自操作，请及时联系管理员。') // html body
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