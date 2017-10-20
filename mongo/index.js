const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const config = require('./mongo.hito.secret.config.json');
const co = require('co');
const bunyan = require('bunyan');
const path = require('path');

let logger = bunyan.createLogger({
  name: 'hitokoto.mongoserver',
  streams: [
    {
      stream: process.stdout,
      level: bunyan.DEBUG
    }, {
      path: path.resolve(__dirname, 'mongo.info.log'),
      level: bunyan.INFO
    }, {
      path: path.resolve(__dirname, 'mongo.warn.log'),
      level: bunyan.WARN
    }, {
      path: path.resolve(__dirname, 'mongo.error.log'),
      level: bunyan.ERROR
    }
  ]
});

let autoIncrement = require("mongodb-autoincrement");
autoIncrement.setDefaults({field: 'id'});

mongoose.Promise = global.Promise;
mongoose.connect(config.db, {useMongoClient: true});

let db = mongoose.connection;
db.on('error', logger.error.bind(logger));
db.on('open', function () {
  // we're connected!
  console.log('db open success!')
});

let GLOBAL_PUBLIC_HITOKOTO_NUMBER = null;

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
  sourcesAndPatterns: String,
  permited: Boolean
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
})

userSchema.methods.changePermit = function (permited) {
  this.permited = permited;
  return this.save();
}

userSchema.methods.createDefaultCollection = function () {
  return this.model('folder').create({name: '默认句集', owner: this._id, count: 0, state: 'public'});
};
userSchema.methods.myCollections = function () {
  return this.model('folder').find({owner: this._id}).sort({'updated_at': -1});
};

userSchema.methods.updateCollectionName = function (oldname, newname) {
  return this.model('folder').findOne({owner: this._id, name: oldname}).exec().then(collection => {
    if (!collection) {
      return Promise.reject({message: '没有这个名字的句集', code: 404})
    }
    collection.name = newname;
    return collection.save()
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

let collectionSchema = mongoose.Schema({
  name: String,
  owner: {
    type: Schema.Types.ObjectId,
    index: true
  },
  count: Number,
  state: String
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
});
collectionSchema.methods.countAll = function () {
  return this.model('hitokoto').find({fid: this._id}).count().exec()
}

let hitokotoSchema = mongoose.Schema({
  hitokoto: String,
  author: {
    type: Schema.Types.String,
    index: true
  },
  source: {
    type: Schema.Types.String,
    index: true
  },
  creator: String,
  creator_id: {
    type: Schema.Types.ObjectId,
    index: true
  },
  photo: String,
  state: String,
  fid: {
    type: Schema.Types.ObjectId,
    index: true
  },
  category: {
    type: Schema.Types.String,
    index: true
  }
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
})

hitokotoSchema.methods.getMyCollectionName = function () {
  return this.model('folder').findOne({
    _id: this.fid
  }, {name: 1}).exec().then(collection => collection.name);
}
hitokotoSchema.plugin(autoIncrement.mongoosePlugin, {field: 'id'});

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
});
var tokenSchema = mongoose.Schema({
  token: {
    type: String,
    index: true
  },
  uid: Schema.Types.ObjectId,
  time: Number,
  whatfor: String,
  ua: String,
  ip: String,
  trust: Boolean
});

var throttleSchema = mongoose.Schema({
  key: {
    type: Schema.Types.String
  },
  time: {
    type: Schema.Types.Date
  },
  namespace: String
});

throttleSchema.index({
  key: 1
}, {expireAfterSeconds: 60 *60});

var broadcastSchema = mongoose.Schema({
  endAt: {
    type: Schema.Types.Date,
    index: true
  },
  message: String
})

var User = mongoose.model('user', userSchema);
var Hitokoto = mongoose.model('hitokoto', hitokotoSchema);
var Collection = mongoose.model('folder', collectionSchema);
var Follow = mongoose.model('follow', followSchema);
var Email = mongoose.model('email', emailPushSchema);
var Token = mongoose.model('token', tokenSchema);
var Throttle = mongoose.model('throttle', throttleSchema);
var Broadcast = mongoose.model('broadcast', broadcastSchema);

/**
 *  节流操作
 *
 * @param {String} key
 * @param {number} limit
 * @param {Date} time
 * @param {String} namespace
 * @returns
 */
exports.throttle = function (key, limit, time, namespace) {
  return Throttle.find({
    key,
    time: {
      $gt: time
    },
    namespace
  }).count().then(total => {
    if (total >= limit) {
      return Promise.reject('操作过于频繁，请稍后再试。');
    } else {
      return Throttle.create({key, namespace, time: new Date()}).then(() => Promise.resolve('' + total));
    }
  })
}

/**
 * 1分钟节流
 *
 * @param {String} key
 * @param {number} limit
 * @param {String} namespace
 * @returns
 */
exports.throttleOneMinute = function (key, limit, namespace) {
  let mm1 = new Date();
  mm1.setMinutes(mm1.getMinutes() - 1);
  return exports.throttle(key, limit, mm1, namespace);
}
/**
 * 10分钟内节流
 *
 * @param {String} key
 * @param {number} limit
 * @param {String} namespace
 * @returns
 */
exports.throttleTenMinute = function (key, limit, namespace) {
  let mm10 = new Date();
  mm10.setMinutes(mm10.getMinutes() - 10);
  return exports.throttle(key, limit, mm10, namespace);
}

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
    logger.debug('查找是否有相同用户名 %o', users)
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
        user.permited = true;
        return User.create(user).then(user => {
          return user.createDefaultCollection().then(() => user);
        })
      }
    };
  });
};

/**
 * 由用户id查询用户
 *
 * @param {String} uid
 * @returns
 */
exports.getUserByUid = function (uid) {
  return User.findById(uid).select('username nickname email').exec().then(user => {
    logger.debug('由uid查询用户', user);
    if (user) {
      return user;
    } else {
      return Promise.reject('用户不存在');
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
 * 获得用户的基本资料；用户名 头像 个性签名
 *
 * @param {String} uid
 * @returns
 *
 */
exports.exploreUser = function (uid) {
  return User.findById(uid).select('nickname intro photo permited').exec().then(user => {
    logger.debug('获得用户的基本资料:%o', user);
    if (user) {
      if (user.permited) {
        return user.myCollections().then(collections => {
          let ret = user.toObject();
          ret.collections = collections.reduce((list, v) => {
            if (v.state == 'public') {
              list.push(v.toObject())
            }
            return list;
          }, []);
          return ret;
        })
      } else {
        return Promise.reject({message: '该用户已被禁用！', code: 403});
      }
    } else {
      return Promise.reject({message: '无该用户！', code: 404});
    }
  })
};

/**
 * 获得用户的基本资料；用户名 头像 个性签名
 *
 * @param {String} uid
 * @param {String} cName
 * @returns
 *
 */
exports.exploreUserCollection = function (uid, cName, page = 1, perpage = 20) {
  return Collection.findOne({owner: uid, name: cName}).exec().then(collection => {
    return Hitokoto.find({creator_id: uid, fid: collection._id, state: 'public'}).sort({created_at: -1}).skip((page - 1) * perpage).limit(perpage).exec()
  })
};
/**
 * 更改用户的邮箱；
 *
 * @param {String} uid
 * @param {String} email
 * @returns
 */
exports.updateUserEmail = function (uid, email) {
  return User.findByIdAndUpdate(uid, {email: email}).select('username nickname email').exec()
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
    logger.debug('修改用户密码', user);
    if (user) {

      if (user.password == oldpassword) {
        user.password = newpassword;
        return user.save()
      } else {
        return Promise.reject('原密码错误!');
      }
    } else {
      return Promise.reject({message: '没有该用户！', code: 404});
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
        return Promise.reject({message: '禁止该用户访问！请联系管理员', code: 403})
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
  return User.findById(uid).exec().then(user => {

    if (user) {
      if (!user.permited) {
        return Promise.reject({message: '禁止该用户访问！请联系管理员', code: 403})
      }

      return user.myCollections().exec().then(collections => {
        //  得到集合内hitokoto的总数；
        return Promise.all(collections.map(v => v.countAll())).then(countList => {

          return collections.map((collection, index) => {
            collection = collection.toObject();
            collection.count = countList[index];
            return collection;
          })
        }).then(ret => {

          return ret
        })
      });
    } else {
      return Promise.reject('无用户！')
    }
  }, e => {

    return Promise.reject('程序查询出错！')
  })
}

/**
 * 获得用户一个句集的总数
 *
 * @param {String} uid
 * @param {String} fid
 * @returns
 */
exports.userCollectionCountPrivate = function (uid, fid) {
  return Hitokoto.find({creator_id: uid, fid: fid}).count().exec().then(count => {
    logger.debug(count);
    return count;
  })
}

/**
 * 获得用户一个句集的总数
 *
 * @param {String} username
 * @param {String} collectionName
 * @returns
 */
exports.userCollectionCountPublic = function (username, collectionName) {
  return User.findOne({
    nickname: username
  }, {_id: 1}).exec().then(user => {
    return Collection.find({
      owner: user._id,
      name: collectionName
    }, {count: 1}).exec().then(collec => collec.count)
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
  return User.findById(uid).exec().then(doc => {
    return doc.updateCollectionName(oldname, newname);
  })
}

/**
 *
 *  新建一个句集
 * @param {String} uid
 * @param {String} newname
 * @returns
 */
exports.newUserCollection = function (uid, newname, state = 'public') {
  return Collection.findOne({owner: uid, name: newname}).exec().then(collection => {
    if (collection) {
      return Promise.reject('已经存在该句集了！')
    } else {
      return Collection.create({owner: uid, name: newname, count: 0, state})
    }
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
  return Collection.findOneAndRemove({owner: uid, name: oldname})

}

/**
 *
 * 用户查看自己的句集内容
 * @param {String} uid
 * @param {String} name
 * @returns
 */
exports.viewUserCollection = function (uid, name, page, perpage) {
  return Collection.findOne({owner: uid, name: name}).then(collection => {
    return Hitokoto.find({creator_id: uid, fid: collection._id}).sort({created_at: -1}).skip((page - 1) * perpage).limit(perpage).exec().then(hitokotos => hitokotos.map(hitokoto => hitokoto.toObject()))
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
exports.createHitokoto = function (uid, name, hitokoto) {
  return User.findById(uid, {nickname: 1}).then(user => {

    hitokoto.creator = user.nickname; //添加用户名

    return Collection.findOne({owner: uid, name: name}).then(collection => {

      hitokoto.fid = collection._id; //添加fid

      if (hitokoto.state == 'public') {
        ++GLOBAL_PUBLIC_HITOKOTO_NUMBER;
        return Hitokoto.create(hitokoto).then(hitokoto => {
          return Collection.findByIdAndUpdate(collection._id, {
            $inc: {
              count: 1
            }
          }).then((coll) => {
            return hitokoto
          })
        }, e => {
          logger.info(e, '创建hitokto失败');
          return Promise.reject({message: '创建hitokoto失败！！', code: 500})
        })
      } else {
        return Hitokoto.create(hitokoto)
      }
    })
  })

}

/**
 *   更新hitokoto
 *
 * @param {Object} hitokoto
 * @param {Sting} hid
 * @returns
 */
exports.updateHitokoto = function (uid, hid, hitokoto) {

  return Hitokoto.findOneAndUpdate({
    _id: hid,
    creator_id: uid
  }, hitokoto, {new: false}).exec().then(oldHitokoto => {
    if (!oldHitokoto) {
      return Promise.reject('更新失败！')
    }
    if (oldHitokoto.state == 'public') {
      if (hitokoto.state == 'public') {
        return;
      } else if (hitokoto.state == 'private' || hitokoto.state == 'reviewing') {
        return Collection.findByIdAndUpdate(oldHitokoto.fid, {
          $inc: {
            count: -1
          }
        }).exec();
      }
    } else if (oldHitokoto.state == 'private') {
      if (hitokoto.state == 'public') {
        return Collection.findByIdAndUpdate(oldHitokoto.fid, {
          $inc: {
            count: 1
          }
        }).exec();
      } else if (hitokoto.state == 'private' || hitokoto.state == 'reviewing') {
        return;
      }
    } else if (oldHitokoto.state == 'reviewing') {
      if (hitokoto.state == 'public') {
        /*return Collection.findByIdAndUpdate(oldHitokoto.fid, {
          $inc: {
            count: 1
          }
        }).exec();*/
        return Promise.reject('用户无此权限');
      } else if (hitokoto.state == 'private' || hitokoto.state == 'reviewing') {
        return;
      }
    } else if (oldHitokoto.state == 'rejected') {
      return;
    }

    return Promise.reject('修改失败,你不按套路出牌。');

  })
}

/**
 *   删除hitokoto
 *
 * @param {Object} hitokoto
 * @param {Sting} hid
 * @returns
 */
exports.deleteHitokoto = function (uid, hid) {

  return Hitokoto.findOneAndRemove({_id: hid, creator_id: uid}).exec().then(hitokoto => {
    if (!hitokoto) {
      return Promise.reject({message: '找不到对应的句子！', code: 404})
    }
    if (hitokoto.state == 'public') {
      --GLOBAL_PUBLIC_HITOKOTO_NUMBER;
      let fid = hitokoto.fid;
      return Collection.findByIdAndUpdate(fid, {
        $inc: {
          count: -1
        }
      })
    } else {
      return hitokoto;
    }
  }, e => {
    logger.error(e, '删除hitokoto失败！');
    return Promise.reject('删除hitokoto失败！！')
  })
}

exports.searchAllPublicHitokotos = function (page, perpage) {
  page = page || 1;
  perpage = perpage || 20;
  return Hitokoto.find({
    state: 'public'
  }, {__v: 0}).sort({"id": -1}).skip((page - 1) * perpage).limit(perpage).exec().then(hitokotos => {
    logger.debug(hitokotos, '所有公开的用户');
    return Promise.all(hitokotos.map(hito => hito.getMyCollectionName())).then(nameList => {
      logger.debug(nameList, '名字');
      return hitokotos.map((hitokoto, index) => {
        hitokoto = hitokoto.toObject();
        hitokoto.collection = nameList[index];
        return hitokoto;
      })
    })
  })
}

/**
 *  验证存储的邮箱和验证码，返回创建的DB文档
 *
 * @param {String} email
 * @param {String} code - 邮箱验证码
 * @param {String} whatfor - 用于做什么
 * @param {String} token - 口令
 * @returns {Promise<Document>}
 */
exports.doEmailVerify = function (email, code, whatfor, token) {
  // let LIMIT_10M = 30*60*1000;
  let LIMIT_30M = 1800000;
  let _10M_Before = Date.now() - LIMIT_30M;
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
        logger.debug('保存修改的验证码失败', reason);
        return Promise.reject('保存验证码失败！');
      })

    }
  })
}

exports.makeSureUserEmailBeforeUpdate = function (uid, email) {
  let t = new Date();
  t.setMinutes(t.getMinutes() - 30);

  return Email.findOne({
    email: email,
    wasted: true,
    time: {
      $gt: t.getTime()
    },
    whatfor: 'oldemailcode',
    token: uid
  }).exec().then(email => {
    if (email) {
      return;
    } else {
      return Promise.reject('用户验证失败！')
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
exports.authActive = function ({ua, uid, token, ip}) {
  // let _30DAYS = 30 * 24 * 60 * 60 * 1000;
  let _30DAYS = 2592000000;
  return Token.create({
    token,
    uid,
    time: Date.now() + _30DAYS,
    ua,
    ip,
    trust: true
  }).catch(e => {
    logger.debug('save token', e)
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
  return Token.findOne({token, ua, trust: true}).sort({time: -1}).exec().then(token => {
    if (token) {
      let expireTime = token.time;
      if (Date.now() < expireTime) {
        return {uid: token.uid, code: 200}
      } else {
        logger.warn({message: '用户授权已过期', uid});
        return {uid: token.uid, message: '授权过期，请重新登录', code: 403}
      }
    } else {
      return {message: '授权失败', code: 403}
    }
  }).catch(e => {
    logger.debug('save token', e)
    return Promise.reject(e);
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
    logger.debug('save token', e)
    return Promise.reject('撤销失败')
  })
}

exports.getPublicHitokotoCount = function () {
  if (GLOBAL_PUBLIC_HITOKOTO_NUMBER === null) {
    return Hitokoto.count({state: 'public'}).exec().then(count => {
      GLOBAL_PUBLIC_HITOKOTO_NUMBER = count;
      return GLOBAL_PUBLIC_HITOKOTO_NUMBER;
    });
  } else {
    return Promise.resolve(GLOBAL_PUBLIC_HITOKOTO_NUMBER)
  }
}

/**
 *  CORS API
 */

/**
 * 跨域获取某一个集合内的hitokoto;
 */
exports.corsUserCollection = function (username, collectionName, lastMagicNumber) {
  return User.findOne({nickname: username}).exec().then(user => {
    if (!user) {
      return Promise.reject({message: '用户不存在！', code: 404})
    } else if (!user.permited) {
      return Promise.reject({message: '用户被封禁！', code: 403})
    } else {
      return Collection.findOne({owner: user._id, name: collectionName}).exec().then(collection => {
        if (!collection) {
          return Promise.reject({message: '句集不存在！', code: 404})
        } else if (collection.state !== 'public') {
          return Promise.reject({message: '该句集不公开，无法获取！', code: 403})
        } else {
          let count = collection.count;
          let skipCount;
          if (lastMagicNumber) {
            skipCount = lastMagicNumber % count;
          } else {
            skipCount = Math.floor(Math.random() * count);
          }
          return Hitokoto.find({
            creator_id: user._id,
            fid: collection._id,
            state: 'public'
          }, {__v: 0}).skip(skipCount).limit(1).exec().then(hitokoto => {
            if (hitokoto.length) {
              hitokoto = hitokoto[0].toObject();
              hitokoto.collection = collection.name;
              return hitokoto;
            } else {
              return Promise.reject({message: '集合内容为空', code: 404})
            }
          });
        }
      })
    }
  })
}

/**
 * 跨域获取某一个集合内的hitokoto;
 */
exports.noCorsUserCollection = function (uid, fid, lastMagicNumber) {
  return Hitokoto.count({creator_id: uid, fid: fid}).exec().then(count => {

    let skipCount;
    if (lastMagicNumber) {
      skipCount = lastMagicNumber % count;
    } else {
      skipCount = Math.floor(Math.random() * count);
    }
    return Hitokoto.find({
      creator_id: uid,
      fid: fid
    }, {__v: 0}).skip(skipCount).limit(1).exec().then(hitokoto => {
      if (hitokoto.length) {
        hitokoto = hitokoto[0].toObject();
        return Collection.findById(fid, {name: 1}).exec().then(collection => {

          hitokoto.collection = collection.name;
          return hitokoto;

        })
      } else {
        return Promise.reject({message: '集合内容为空', code: 404})
      }
    });
  })
}

exports.syncCollection = function (uid, fid, last) {
  if (!last) {
    return Hitokoto.find({creator_id: uid, fid: fid}).sort({_id: 1}).limit(100).exec()
  } else {
    return Hitokoto.find({
      _id: {
        $gt: last
      },
      creator_id: uid,
      fid: fid
    }).sort({_id: 1}).limit(100).exec()
  }
}

exports.syncPublicCollection = function (username, collectionName, last) {
  return User.findOne({
    nickname: username
  }, {_id: 1}).exec().then(user => {
    if (!user) {
      return Promise.reject({message: '用户不存在', code: 404})
    }
    let uid = user._id;
    return Collection.findOne({
      owner: uid,
      name: collectionName
    }, {_id: 1}).exec().then(collection => {
      if (!collection) {
        return Promise.reject({message: '句集不存在！可能改名字了！', code: 404})
      }
      let fid = collection._id;

      if (!last) {
        return Hitokoto.find({creator_id: uid, fid: fid, state: 'public'}).sort({_id: 1}).limit(100).exec()
      } else {
        return Hitokoto.find({
          _id: {
            $gt: last
          },
          creator_id: uid,
          fid: fid,
          state: 'public'
        }).sort({_id: 1}).limit(100).exec()
      }
    })
  })

}

/**
 * 跨域获取某一个集合内的hitokoto;
 * //TODO
 */
exports.corsGetOneRandom = function (lastMagicNumber) {

  return exports.getPublicHitokotoCount().then(count => {
    let skipCount;
    if (lastMagicNumber) {
      skipCount = lastMagicNumber % count;
    } else {
      skipCount = Math.floor(Math.random() * count);
    }
    return Hitokoto.find({
      state: 'public'
    }, {__v: 0}).sort({id: -1}).skip(skipCount).limit(1).exec().then(hitokoto => {
      if (hitokoto.length) {
        hitokoto = hitokoto[0];
        return hitokoto.getMyCollectionName().then(name => {
          hitokoto = hitokoto.toObject();
          hitokoto.collection = name;
          return hitokoto;
        })
      } else {
        return Promise.reject({message: '集合内容为空', code: 404})
      }
    });
  });

}

exports.storeBackup = function (uid, data) {
  return User.findById(uid, {sourcesAndPatterns: 1}).exec().then(user => {
    if (user) {
      user.sourcesAndPatterns = data;
      user.markModified('sourcesAndPatterns');
      return user.save();
    } else {
      return Promise.reject('用户不存在');
    }
  })
}

exports.getBackup = function (uid) {
  return User.findById(uid, {sourcesAndPatterns: 1}).exec().then(user => {
    if (user) {
      return user.sourcesAndPatterns
    } else {
      return Promise.reject('用户不存在');
    }
  })
}

exports.roleCheck = function (uid, role) {
  return User.findById(uid, {role: 1}).exec().then(user => {
    if (!user) {
      return Promise.reject('用户不存在！');
    } else if (user.role) {

      let roles = user.role.split('|');
      if (~ roles.findIndex(r => r == role)) {
        //找到了;
        return true;
      } else {
        return Promise.reject('无权限！')
      };
    } else {
      return Promise.reject('无权限！')
    }
  })
}

//Admin method

exports.changeHitokotoState = function (hid, state) {
  return Hitokoto.findByIdAndUpdate(hid, {
    state
  }, {new: false}).then(old => {
    //
    if (old.state == 'public') {
      if (state == 'public') {
        //通过为公开
        return;
      } else if (state == 'private' || state == 'reviewing') {
        return Collection.findByIdAndUpdate(old.fid, {
          $inc: {
            count: -1
          }
        }).exec();
      }
    } else if (old.state == 'private') {
      //这个函数块不会被调用
      if (state == 'public') {
        return Collection.findByIdAndUpdate(old.fid, {
          $inc: {
            count: 1
          }
        }).exec();
      } else if (state == 'private' || state == 'reviewing') {
        return;
      }
    } else if (old.state == 'reviewing') {
      //主要是这一部分
      if (state == 'public') {
        return Collection.findByIdAndUpdate(old.fid, {
          $inc: {
            count: 1
          }
        }).exec();
      } else if (state == 'private' || state == 'reviewing') {
        return;
      }
    } else if (old.state == 'rejected') {
      if (state == 'public') {
        return Collection.findByIdAndUpdate(old.fid, {
          $inc: {
            count: 1
          }
        }).exec();
      } else if (state == 'private' || state == 'reviewing') {
        return;
      }
    }

  })

}

exports.getNeedReviewingHitokotosCount = function () {
  return Hitokoto.find({state: 'reviewing'}).count()
}

exports.getNeedReviewingHitokotos = function (page, perpage) {
  page = page || 1;
  perpage = perpage || 20;
  return Hitokoto.find({
    state: 'reviewing'
  }, {__v: 0}).sort({"id": 1}).skip((page - 1) * perpage).limit(perpage).exec().then(hitokotos => {
    logger.debug(hitokotos, '所有需要review的句子');
    return Promise.all(hitokotos.map(hito => hito.getMyCollectionName())).then(nameList => {
      logger.debug(nameList, '名字');
      return hitokotos.map((hitokoto, index) => {
        hitokoto = hitokoto.toObject();
        hitokoto.collection = nameList[index];
        return hitokoto;
      })
    })
  })
}

//Broadcast
exports.getBroadcasts = function () {
  return Broadcast.find({
    endAt: {
      $gt: new Date()
    }
  }).exec()
}

exports.putBroadcast = function (b) {
  return Broadcast.create(b)
}
exports.updateBroadcast = function (bid, broadcast) {
  return Broadcast.findByIdAndUpdate(bid, broadcast, {new: true}).exec()
}
exports.deleteBroadcast = function (bid) {
  return Broadcast.findByIdAndRemove(bid).exec()
}
