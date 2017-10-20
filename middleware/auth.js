const mongoServer = require('../mongo');
const crypto = require('crypto-js');
const validator = require('validator');
const errs = require('restify-errors');

const config = require('./auth.config.json');
const secret = config.secret;

function generateAuthToken() {
  return crypto.HmacSHA1('you are awesome!Now:' + Date.now(), secret).toString() + crypto.HmacSHA1('youcantseeme' + (Date.now() + Date.now()), secret).toString();
}

function activeAuth(uid) {
  try {
    if (this.headers && this.headers['user-agent']) {
      let token = generateAuthToken();
      let ip = this.headers['x-real-ip'] || this.headers['x-forwarded-for'] || this.connection.remoteAddress;
      let ua = validator.trim(this.headers['user-agent']);
      return mongoServer.authActive({ua, token, uid, ip}).then(doc => {
        return token;
      }).catch(e => {
        return Promise.reject('保存授权失败！')
      })
    } else {
      return Promise.reject('授权失败！')
    }
  } catch (e) {
    console.log(e);
    return Promise.reject('程序运行错误！');
  }

}

function terminateAuth() {
  try {
    if (this.headers && this.headers['user-agent']) {
      let token = generateAuthToken();
      let ua = validator.trim(this.headers['user-agent']);
      return mongoServer.authCheck({ua, token}).then(doc => {
        return token;
      }).catch(e => {
        return Promise.reject('停用授权异常！')
      })
    } else {
      return Promise.reject('验证失败！')
    }
  } catch (e) {
    return Promise.reject('程序运行错误！')
  }
}

module.exports = function (whitelist) {
  return function hitoAuth(req, res, next) {
    req.hitoAuthActive = activeAuth;
    req.hitoAuthTerminate = terminateAuth;

    try {

      let whiteIndex = whitelist.findIndex(reg => reg.test(req.url));

      if (~ whiteIndex) {
        return next();
      }
      if (req.headers && req.headers['user-agent'] && req.headers['x-real-ip']) {
        let token = req.headers['x-api-token'];
        let ua = req.headers['user-agent'];
        if (token && ua) {
          mongoServer.authCheck({ua, token}).then(ret => {
            if (ret.code == 200) {

              req.userid = ret.uid;
              return next();

            } else if (ret.code == 403) {
              res.send(new errs.ForbiddenError(ret.message));
              return next(false);
            } else {
              res.send(new errs.ForbiddenError(ret.message));
              return next(false);
            }
          }).catch(e => {
            res.send(new errs.ForbiddenError(e));
            return next(false);
          })
        } else {
          res.send(new errs.ForbiddenError('缺少参数'))
          return next(false);
        }
      } else {
        req.log.error('出现匿名请求访问');
        res.send(new errs.ForbiddenError('禁止访问'))
        return next(false);
      }
    } catch (e) {
      req.log.error(e);
      res.send(new errs.InternalServerError('程序运行出错！'));
      return next(false);
    }
  }
}
