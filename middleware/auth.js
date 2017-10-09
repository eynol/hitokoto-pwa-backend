const mongoServer = require('../mongo');
const crypto = require('crypto-js');
const validator = require('validator');

const config = require('./auth.config.json');
const secret = config.secret;

function generateAuthToken() {
  return crypto.HmacSHA1('you are awesome!Now:' + Date.now(), secret).toString() + crypto.HmacSHA1('youcantseeme' + (Date.now() + Date.now()), secret).toString();
}

function activeAuth(uid) {
  try {
    if (this.headers && this.headers['user-agent']) {
      let token = generateAuthToken();
      let ua = validator.trim(this.headers['user-agent']);
      return mongoServer.authActive({ua, token, uid}).then(doc => {
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
function checkAuth() {
  try {

    if (this.headers && this.headers['user-agent']) {
      let token = validator.trim(this.headers['x-api-token']);
      let ua = validator.trim(this.headers['user-agent']);
      return mongoServer.authCheck({ua, token}).then(ret => {
        if (ret.code == 200) {
          //  成功
          console.log(ret)
          return ret;
        } else if (ret.code == 301) {
          return Promise.reject({code: ret.code, err: ret.message});
        }
      }).catch(e => {
        return Promise.reject('无授权！')
      })
    } else {
      return Promise.reject('验证失败！')
    }
  } catch (e) {
    return Promise.reject('程序运行出错！')
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

module.exports = function () {
  return function (req, res, next) {
    req.hitoAuthActive = activeAuth;
    req.hitoAuthCheck = checkAuth;
    req.hitoAuthTerminate = terminateAuth;
    return next();
  }
}
