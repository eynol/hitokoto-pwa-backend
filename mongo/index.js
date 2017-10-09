const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const config = require('./config.json');
const co = require('co');

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
      return Promise.reject('没有这个名字的句集')
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
  trust: Boolean
});

var throttleSchema = mongoose.Schema({
  key: {
    type: Schema.Types.String
  },
  namespace: String
});

throttleSchema.index({
  key: 1
}, {expireAfterSeconds: 60 *60});

var User = mongoose.model('user', userSchema);
var Hitokoto = mongoose.model('hitokoto', hitokotoSchema);
var Collection = mongoose.model('folder', collectionSchema);
var Follow = mongoose.model('follow', followSchema);
var Email = mongoose.model('email', emailPushSchema);
var Token = mongoose.model('token', tokenSchema);
var Throttle = mongoose.model('throttle', throttleSchema);

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
        user.permited = true;
        return User.create(user).then(user => {
          return user.createDefaultCollection().then(() => user);
        })
      }
    };
  }).catch(e => {
    return Promise.reject('创建用户失败！')
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
    trace('由uid查询用户', user);
    if (user) {
      return user;
    } else {
      return;
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
    trace('获得用户的基本资料；', user);
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
        return Promise.reject('该用户已被禁用！');
      }
    } else {
      return Promise.reject('无该用户！');
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
    return Hitokoto.find({creator_id: uid, fid: collection._id}).sort({created_at: -1}).skip((page - 1) * perpage).limit(perpage).exec()
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
  return User.findById(uid).exec().then(user => {

    if (user) {
      if (!user.permited) {
        return Promise.reject('禁止访问该用户！请联系管理员')
      }
      console.log('start', Date.now());
      return user.myCollections().exec().then(collections => {
        //  得到集合内hitokoto的总数；
        return Promise.all(collections.map(v => v.countAll())).then(countList => {
          console.log(countList);
          return collections.map((collection, index) => {
            collection = collection.toObject();
            collection.count = countList[index];
            return collection;
          })
        }).then(ret => {
          console.log('end', Date.now());
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
          }).then(() => hitokoto)
        }, e => {
          console.log(e);
          return Promise.reject('创建hitokoto失败！！')
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
exports.updateHitokoto = function (hid, hitokoto) {

  return Hitokoto.findByIdAndUpdate(hid, hitokoto, {new: false}).exec().then(oldHitokoto => {
    if (hitokoto.state !== oldHitokoto.state) {
      console.log('hitokoto状态不相等');
      return Collection.findByIdAndUpdate(oldHitokoto.fid, {
        $inc: {
          count: (hitokoto.state == 'public'
            ? 1
            : -1)
        }
      }).exec();
    } else {
      return
    }

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
    console.log(e);
    return Promise.reject('删除hitokoto失败！！')
  })
}

exports.searchAllPublicHitokotos = function (page, perpage) {
  page = page || 1;
  perpage = perpage || 20;
  return Hitokoto.find({
    state: 'public'
  }, {
    _id: 0,
    _v: 0
  }).sort({"id": -1}).skip((page - 1) * perpage).limit(perpage).exec().then(hitokotos => {
    console.log(hitokotos);
    return Promise.all(hitokotos.map(hito => hito.getMyCollectionName())).then(nameList => {
      console.log(nameList);
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
      return Promise.reject('用户不存在！')
    } else if (!user.permited) {
      return Promise.reject('用户被封禁！')
    } else {
      return Collection.findOne({owner: user._id, name: collectionName}).exec().then(collection => {
        if (!collection) {
          return Promise.reject('句集不存在！')
        } else if (collection.state !== 'public') {
          return Promise.reject('该句集不公开，无法获取！')
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
              hitokoto.f = collection.name;
              return hitokoto;
            } else {
              return Promise.reject('集合内容为空')
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
          hitokoto.f = name;
          return hitokoto;
        })
      } else {
        return Promise.reject('集合内容为空')
      }
    });

  });

}
