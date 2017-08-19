const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const config = require('./config.json');

let trace = console
  .log
  .bind(console);
mongoose.Promise = global.Promise;
mongoose.connect(config.db);

let db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.on('open', function (some) {
  // we're connected!
  console.log('db open!', some)
});

let userSchema = mongoose.Schema({
  username: {
    type: String,
    unique: true,
    require: true
  },
  password: {
    type: String,
    require: true
  },
  role: String,
  email: {
    type: String,
    require: true,
    lowercase: true,
    unique: true
  },
  nickname: {
    type: String,
    require: true,
    index: true,
    unique: true
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
})

userSchema.methods.findPublicHitokotos = function (cb) {
  return this
    .model('Hitokoto')
    .find({
      creator_id: this._id,
      state: 'public'
    }, cb);
}

userSchema.methods.findMyHitokotos = function (cb) {
  return this
    .model('Hitokoto')
    .find({
      creator_id: this._id
    }, cb);
}
let hitokotoSchema = mongoose.Schema({
  hitokoto: String,
  from: String,
  creator: String,
  creator_id: {
    type: Schema.Types.ObjectId,
    index: true
  },
  state: String,
  tag: [String],
  category: String
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
})

var emailPushSchema = mongoose.Schema({
  email: {
    type: String,
    lowercase: true,
    index: true
  },
  code: String,
  wasted: Boolean,
  time: Number
})
var tokenSchema = mongoose.Schema({
  token: {
    type: String,
    index: true
  },
  uid: Schema.Types.ObjectId,
  time: Number,
  ua: String,
  trust: Boolean
})

var User = mongoose.model('user', userSchema);
var Hitokoto = mongoose.model('hitokoto', hitokotoSchema);
var Email = mongoose.model('email', emailPushSchema);
var Token = mongoose.model('token', tokenSchema);

/**
 *  创建新建用户，test为true时只测试用户是否存在，不创建用户
 *
 * @param {{username:String,nickname:String,email:String}} user
 * @param {boolean} test
 * @returns
 */
exports.creatUser = function (user, test) {

  return User.find({
    "$or": [
      {
        username: user.username
      }, {
        nickname: user.nickname
      }, {
          email: user.email
        }
      ]
  })
    .select('username nickname email')
    .exec()
    .then(users => {
      trace('查找是否有相同用户名', users)
      if (users.length != 0) {
        let reason = '';
        users.forEach(_user => {
          if (_user.username == user.username) {
            reason += '用户名被占用！\n'
          } else if (_user.nickname == user.nickname) {
            reason += '昵称被占用！\n'
          } else {
            reason += '邮箱已经被注册过了！\n'
          }
        })
        return Promise.reject(reason)
      } else {
        if (test) {
          return Promise.resolve();
        } else {
          return User
            .create(user)
            .catch(e => {
              return Promise.reject('创建用户失败！')
            });
        }
      };
    })
};

/**
 *  用户登录验证,成功返回用户id 和用户昵称
 *
 * @param {String} username
 * @param {String} password
 * @returns {Promise<{uid:String,nickname:String}>}
 */
exports.userLogin = function (username, password) {
  return User
    .findOne({username})
    .select('_id username password nickname')
    .exec()
    .then(doc => {
      if (doc) {
        if (doc.password == password) {
          return {uid: doc._id, nickname: doc.nickname};
        } else {
          return Promise.reject('用户名错误！')
        }
      } else {
        return Promise.reject('用户名错误！')
      }
    }, e => {
      console.log(e);
      return Promise.reject('程序查询出错！')
    })
}

/**
 *  验证存储的邮箱和验证码，返回创建的DB文档
 *
 * @param {String} email
 * @param {String} code - 邮箱验证码
 * @returns {Promise<Document>}
 */
exports.doEmailVerify = function (email, code) {
  // let LIMIT_10M = 10*60*1000;
  let LIMIT_10M = 600000;
  let _10M_Before = Date.now() - LIMIT_10M;

  return Email.find({
    email: email,
    code: code.toUpperCase(),
      time: {
        $gt: _10M_Before
      }
    })
    .sort({time: -1})
    .exec()
    .then((docs) => {
      if (docs.length == 0) {
        return Promise.reject('验证码错误！');
      }
      //  else if (docs.length > 1) {   docs.sort((e1, e2) => {     return e2.time -
      // e1.time   }); }

      let latest = docs[0];

      if (latest.wasted) {
        return Promise.reject('该验证码已经被使用过了！')
      } else {
        latest.wasted = true;
        return latest
          .save()
          .catch(reason => {
            trace('保存修改的验证码失败', reason);
            return Promise.reject('保存验证码失败！');
          })

      }
    })
}

/**
 *  存储邮箱和邮箱验证码，返回验证码
 *
 * @param {String} email
 * @param {String} code
 * @returns  {Promise<String code>}
 */
exports.storeEmailVerify = function (email, code) {
  return new Email({
      email: email,
      code: code,
      wasted: false,
      time: Date.now()
    })
    .save()
    .then(() => code)
}

/**
 *
 *
 * @param {String} {String : userAgent, userId, token, time}
 */
exports.authActive = function ({ua, uid, token}) {
  // let _30DAYS = 30 * 24 * 60 * 60 * 1000;
  let _30DAYS = 2592000000;
  return Token.create({
    token,
    uid,
    time: Date.now() + _30DAYS,
    ua,
    trust: true
  }).catch(e => {
    trace('save token', e)
    return Promise.reject('创建失败！')
  })
}

exports.authCheck = function ({ua, token}) {
  return Token
    .findOne({token, ua, trust: true})
    .exec()
    .then(token => {
      if (token) {
        let expireTime = token.time;
        if (Date.now() < expireTime) {
          return '授权成功！'
        }
      }
      return Promise.reject('授权失败')
    })
    .catch(e => {
      trace('save token', e)
      return Promise.reject('授权失败')
    })
}

exports.authTerminate = function ({ua, token}) {
  return Token
    .findOne({token, ua})
    .exec()
    .then(tokenDoc => {
      if (tokenDoc) {
        if (tokenDoc.trust) {
          tokenDoc.trust = false;
          return tokenDoc
            .save()
            .then(() => {
              return 'OK';
            }, e => {
              return Promise.reject('撤销授权失败')
            })
        } else {
          return 'OK';
        }
      } else {
        return Promise.reject('授权失败')
      }
    })
    .catch(e => {
      trace('save token', e)
      return Promise.reject('撤销失败')
    })
}
