const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const config = require('./config.json');

let autoIncrement = require("mongodb-autoincrement");
autoIncrement.setDefaults({field: 'id'});
let trace = console.log.bind(console);
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
  },
  photo: String,
  intro: String,
  collections: [String],
  collectionsCount: [Schema.Types.Number],
  permited: Boolean
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
})

userSchema.methods.updateCollectionName = function (oldname, newname) {
  return this.model('hitokoto').find({creator_id: this._id, collec: oldname}).select('collections').exec().then(hitokotos => {
    let updateList = hitokotos.map(hitokoto => {
      let index = hitokoto.collec.indexOf(oldname)
      if (~ index) {
        //找到了
        hitokoto.collec.splice(index, 1, newname);
        hitokoto.markModified('collec');
        return hitokoto.save();
      } else {
        return Promise.resolve(true);
      }
    });
    if (updateList.length != 0) {

      return Promise.all(updateList)
    } else {
      return [];
    }
  }).then(promiseArray => {
    let index = this.collections.indexOf(oldname);
    this.collections.splice(index, 1, newname);
    this.markModified('collections');
    return this.save();
  });
}

userSchema.methods.deleteCollection = function (oldname) {
  let oldnameIndex = this.collections.indexOf(oldname),
    oldNameCount = this.collectionsCount[oldnameIndex];
  let defaultIndex = this.collections.indexOf('默认句集'),
    defaultCount = this.collectionsCount[defaultIndex];

  return this.model('hitokoto').find({creator_id: this._id, collec: oldname}).select('collections').exec().then(hitokotos => {
    let updateList = hitokotos.map(hitokoto => {
      let index = hitokoto.collec.indexOf(oldname)
      if (~ index) {
        //找到了
        hitokoto.collec.splice(index, 1);

        if (hitokoto.collec.length == 0) {
          hitokoto.collec.push('默认句集');
          defaultCount += 1;
        }
        hitokoto.markModified('collec');
        return hitokoto.save();
      } else {
        return Promise.resolve(true);
      }
    });
    if (updateList.length != 0) {
      return Promise.all(updateList)
    } else {
      return [];
    }
  }).then(promiseArray => {

    this.collections.splice(oldnameIndex, 1);
    this.collectionsCount.splice(oldnameIndex, 1);
    this.collectionsCount[defaultIndex] = defaultCount;
    this.markModified('collections');
    this.markModified('collectionsCount');
    return this.save();
  });
}
let followSchema = mongoose.Schema({
  user: {
    type: Schema.Types.ObjectId,
    index: true
  },
  follower: [Schema.Types.ObjectId],
  following: [Schema.Types.ObjectId]
})

let hitokotoSchema = mongoose.Schema({
  hitokoto: String,
  from: String,
  creator: String,
  creator_id: {
    type: Schema.Types.ObjectId,
    index: true
  },
  photo: String,
  state: String,
  collec: [String],
  category: String
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
})
hitokotoSchema.plugin(autoIncrement.mongoosePlugin, {field: 'id'});

userSchema.methods.findPublicHitokotos = function () {
  return this.model('hitokoto').find({creator_id: this._id, state: 'public'});
}

userSchema.methods.findMyHitokotos = function () {
  return this.model('hitokoto').find({creator_id: this._id});
}

var emailPushSchema = mongoose.Schema({
  email: {
    type: String,
    lowercase: true,
    index: true
  },
  code: String,
  token: String,
  whatfor: String,
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
  whatfor: String,
  ua: String,
  trust: Boolean
})

var User = mongoose.model('user', userSchema);
var Hitokoto = mongoose.model('hitokoto', hitokotoSchema);
var Follow = mongoose.model('follow', followSchema);
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
  }).select('username nickname email').exec().then(users => {
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
        //初始化句集
        user.collections = ['默认句集', '一百个基本'];
        user.collectionsCount = [0, 0];
        user.permited = true;
        return User.create(user).catch(e => {
          return Promise.reject('创建用户失败！')
        });
      }
    };
  })
};

/**
 * 由用户id查询用户
 *
 * @param {String} uid
 * @returns
 */
exports.getUserByUid = function (uid) {
  return User.findById(uid).select('username nickname email').exec().then(user => {
    trace('由uid查询用户', user);
    if (user) {
      return user;
    } else {
      return {username: 'foolish', nickname: 'foolish', email: 'foolish@foolishmind.shit'}
    }
  })
};

/**
 * 由邮箱查询用户
 *
 * @param {String} email
 * @returns
 */
exports.getUserByEmail = function (email) {
  return User.findOne({email}).select('username nickname email').exec()
};

/**
 * 更改用户的邮箱；
 *
 * @param {String} uid
 * @param {String} email
 * @returns
 */
exports.updateUserEmail = function (uid, email) {
  return User.findByIdAndUpdate(uid, {email: email}).select('username nickname email').exec().then(user => {
    trace('修改用户邮箱', user);
    if (user) {
      return user;
    } else {
      return {username: 'foolish', nickname: 'foolish', email: 'foolish@foolishmind.shit'}
    }
  })
};

/**
 * 修改用户密码
 *
 * @param {String} uid
 * @param {String} oldpassword
 * @param {String} newpassword
 * @returns
 */
exports.updateUserPassword = function (uid, oldpassword, newpassword) {
  return User.findById(uid).select('username password email').exec().then(user => {
    trace('修改用户密码', user);
    if (user) {

      if (user.password == oldpassword) {
        user.password = newpassword;
        return user.save()
      } else {
        return Promise.reject('原密码错误!');
      }
    } else {
      return Promise.reject('没有该用户！');
    }
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
  return User.findOne({username}).select('_id username password nickname permited').exec().then(doc => {
    if (doc) {
      if (!doc.permited) {
        return Promise.reject('禁止该用户访问！请联系管理员')
      }
      if (doc.password == password) {
        return {uid: doc._id, nickname: doc.nickname};
      } else {
        return Promise.reject('密码错误！')
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
 *  获得用户所有的句集
 *
 * @param {String} uid
 * @returns
 */
exports.userCollections = function (uid) {
  return User.findOne({_id: uid}).select('_id collections collectionsCount permited').exec().then(doc => {
    console.log(doc)
    if (doc) {
      if (!doc.permited) {
        return Promise.reject('禁止访问该用户！请联系管理员')
      }
      return doc.collections.map((collecName, index) => ({name: collecName, count: doc.collectionsCount[index]}));

    } else {
      return Promise.reject('无用户！')
    }
  }, e => {
    console.log(e);
    return Promise.reject('程序查询出错！')
  })
}

/**
 *  更新句集的名字
 *
 * @param {String} uid
 * @param {String} oldname
 * @param {String} newname
 * @returns
 */
exports.updateUserCollectionName = function (uid, oldname, newname) {
  return User.findOne({_id: uid}).select('_id collections collectionsCount permited').exec().then(doc => {
    return doc.updateCollectionName(oldname, newname).then(doc => {
      return doc.collections.map((collecName, index) => ({name: collecName, count: doc.collectionsCount[index]}));
    });
  }, e => {
    console.log(e);
    return Promise.reject('程序查询出错！')
  })
}

/**
 *
 *  新建一个句集
 * @param {String} uid
 * @param {String} newname
 * @returns
 */
exports.newUserCollection = function (uid, newname) {
  return User.findOne({_id: uid}).select('_id collections collectionsCount permited').exec().then(doc => {
    let index = doc.collections.indexOf(newname);
    if (~ index) {
      //找到了
      return Promise.reject('已经存在该句集了！')
    } else {
      doc.collections.push(newname);
      doc.collectionsCount.push(0);
      doc.markModified('collections');
      doc.markModified('collectionsCount');
      return doc.save().then(doc => {
        return doc.collections.map((collecName, index) => ({name: collecName, count: doc.collectionsCount[index]}));
      });
    }

  }, e => {
    console.log(e);
    return Promise.reject('程序查询出错！')
  })
}
/**
 *
 * 删除用户句集
 * @param {String} uid
 * @param {String} oldname
 * @returns
 */
exports.deleteUserCollection = function (uid, oldname) {
  return User.findOne({_id: uid}).select('_id collections collectionsCount permited').exec().then(doc => {
    return doc.deleteCollection(oldname).then(doc => {
      return doc.collections.map((collecName, index) => ({name: collecName, count: doc.collectionsCount[index]}));
    });
  }, e => {
    console.log(e);
    return Promise.reject('程序查询出错！')
  })
}

/**
 *
 * 用户查看自己的句集内容
 * @param {String} uid
 * @param {String} name
 * @returns
 */
exports.viewUserCollection = function (uid, name) {
  return Hitokoto.find({
    creator_id: uid,
    collec: name
  }, 'hitokoto id from creator creator_id collec created_at category ').sort({created_at: -1}).exec().then(hitokotos => {
    return hitokotos.map(hito => hito.toJSON())
  }, e => {
    console.log(e);
    return Promise.reject('程序查询出错！')
  })
}

/**
 *   新建hitokoto
 *
 * @param {Object} hitokoto
 * @param {String} uid
 * @param {String} name
 * @returns
 */
exports.createHitokoto = function (hitokoto, uid, name) {
  return Hitokoto.create(hitokoto).then(hitokoto => {
    return User.findOne({_id: uid}).exec().then(user => {
      console.log(user);
      let index = user.collections.indexOf(name);
      let org = user.collectionsCount[index];
      user.collectionsCount[index] = org + 1;
      user.markModified('collectionsCount');
      return user.save()
    }).then(() => {
      return hitokoto
    })
  }, e => {
    console.log(e);
    return Promise.reject('创建hitokoto失败！！')
  })
}

/**
 *   更新hitokoto
 *
 * @param {Object} hitokoto
 * @param {Sting} hid
 * @returns
 */
exports.updateHitokoto = function (hitokoto, hid) {

  return Hitokoto.findByIdAndUpdate(hid, hitokoto).exec().then(hitokoto => {
    return '更新hitokoto成功！';
  }, e => {
    console.log(e);
    return Promise.reject('修改hitokoto失败！！')
  })
}

/**
 *   删除hitokoto
 *
 * @param {Object} hitokoto
 * @param {Sting} hid
 * @returns
 */
exports.deleteHitokoto = function (hid) {

  return Hitokoto.findByIdAndRemove(hid).exec().then(hitokoto => {
    if (!hitokoto) {
      return Promise.reject('找不到对应的句子！')
    }

    let uid = hitokoto.creator_id;
    let collec = hitokoto.collec[0];

    return User.findById(uid).exec().then(user => {

      let collections = user.collections,
        collectionsCount = user.collectionsCount;
      let index = user.collections.indexOf(collec);
      if (~ index) {
        user.collectionsCount[index] -= 1;
        console.log('user collection count ', collectionsCount)
        user.markModified('collectionsCount');
        return user.save().then(() => '删除hitokoto成功！')
      } else {
        return '删除hitokoto成功！';
      }
    })
  }, e => {
    console.log(e);
    return Promise.reject('删除hitokoto失败！！')
  })
}

/**
 *  验证存储的邮箱和验证码，返回创建的DB文档
 *
 * @param {String} email
 * @param {String} code - 邮箱验证码
 * @returns {Promise<Document>}
 */
exports.doEmailVerify = function (email, code, whatfor, token) {
  // let LIMIT_10M = 10*60*1000;
  let LIMIT_10M = 600000;
  let _10M_Before = Date.now() - LIMIT_10M;
  let query = {
    email: email,
    code: code.toUpperCase(),
    time: {
      $gt: _10M_Before
    },
    whatfor
  };
  if (token) {
    query.token = token;
  }

  return Email.find(query).sort({time: -1}).exec().then((docs) => {
    if (docs.length == 0) {
      return Promise.reject('验证码错误或超时！');
    }
    //  else if (docs.length > 1) {   docs.sort((e1, e2) => {     return e2.time -
    // e1.time   }); }

    let latest = docs[0];

    if (latest.wasted) {
      return Promise.reject('该验证码已经被使用过了！')
    } else {
      latest.wasted = true;
      return latest.save().catch(reason => {
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
 * @returns  {Promise<String>}
 */
exports.storeEmailVerify = function (email, code, whatfor, token) {
  let query = {
    email: email,
    code: code,
    wasted: false,
    time: Date.now(),
    whatfor
  };
  if (token) {
    query.token = token;
  }
  return new Email(query).save().then(() => code)
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

/**
 *  验证token是否是属于某个用户
 *
 * @param  {{ua:String,token:String}}
 * @returns
 */
exports.authCheck = function ({ua, token}) {
  return Token.findOne({token, ua, trust: true}).exec().then(token => {
    if (token) {
      let expireTime = token.time;
      if (Date.now() < expireTime) {
        return {uid: token.uid, code: 200}
      } else {
        return {uid: token.uid, message: '授权过期，请重新登录', code: 301}
      }
    }
    return Promise.reject('授权失败')
  }).catch(e => {
    trace('save token', e)
    return Promise.reject('授权失败')
  })
}

/**
 *
 * 禁用一个token
 * @param {String} {ua, token}
 * @returns
 */
exports.authTerminate = function ({ua, token}) {
  return Token.findOne({token, ua}).exec().then(tokenDoc => {
    if (tokenDoc) {
      if (tokenDoc.trust) {
        tokenDoc.trust = false;
        return tokenDoc.save().then(() => {
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
  }).catch(e => {
    trace('save token', e)
    return Promise.reject('撤销失败')
  })
}
