const restify = require('restify');
const corsMiddleware = require('restify-cors-middleware')
const validator = require('validator');
const bunyan = require('bunyan');
const path = require('path');
const errs = require('restify-errors');

const mongoServer = require('./mongo');
const emailServer = require('./mailpush/index.js');
const authMiddleware = require('./middleware/auth')
const appUtil = require('./util');

let trace = console.log.bind(console);

const cors = corsMiddleware({origins: ['*'], allowHeaders: ['API-Token'], exposeHeaders: ['API-Token-Expiry']})
// var $regist = require('./routes/regist.js');

const whitelistapi = [(/^\/cors/)];
const CURRENTHOST = /^http(s)?:\/\/localhost:8080/;
const PUBLIC_HITO_NEED_REVIEW = true;

let logger = bunyan.createLogger({
  name: 'hitokoto',
  streams: [
    {
      stream: process.stdout,
      level: bunyan.DEBUG
    }, {
      path: path.resolve(__dirname, 'info.log'),
      level: bunyan.INFO
    }, {
      path: path.resolve(__dirname, 'warn.log'),
      level: bunyan.WARN
    }, {
      path: path.resolve(__dirname, 'error.log'),
      level: bunyan.ERROR
    }
  ]
});

const server = restify.createServer({name: 'hitokoto', version: '1.0.0', log: logger});

//  跨域 url 白名单
server.pre(function corsWhiteList(req, res, next) {
  if (req.method !== 'OPTIONS') {
    if (!req.headers['origin'] || CURRENTHOST.test(req.headers['origin'])) {
      return next();
    }
  }

  let passed = true;
  let path = req.path();
  for (let i = 0; i < whitelistapi.length; i++) {
    if (!whitelistapi[i].test(path)) {
      passed = false;
      break;
    }
  }
  if (passed) {
    return next();
  } else {
    res.send(204);
  }
});
server.pre(cors.preflight);

server.use(cors.actual);
server.use(restify.plugins.throttle({
  burst: 100,
  rate: 50,
  ip: true,
  overrides: {
    '127.0.0.1': {
      rate: 0, // unlimited
      burst: 0
    }
  }
}));

//  无需授权  白名单
server.use(authMiddleware([
  (/^\/$/),
  (/^\/debug/),
  (/^\/cors/),
  (/^\/api\/login/),
  (/^\/api\/regist/),
  (/^\/api\/explore/)
]));
server.use(restify.plugins.acceptParser(server.acceptable));
server.use(restify.plugins.gzipResponse());
server.use(restify.plugins.queryParser());
server.use(restify.plugins.bodyParser());
server.use((function CommonPromiseException() {
  function pRejectHandler(next, reason) {
    if (typeof reason == 'string') {
      this.charSet('utf-8');
      this.send(new errs.BadRequestError(reason))
      return next(false);
    } else if (typeof reason == 'object' && typeof reason.message == 'string' && typeof reason.code == 404) {
      this.charSet('utf-8');
      this.send(new errs.NotFoundError(reason.message))
      return next(false);
    } else if (typeof reason == 'object' && typeof reason.message == 'string' && typeof reason.code == 403) {
      this.charSet('utf-8');
      this.send(new errs.ForbiddenError(reason.message))
      return next(false);
    } else {
      return next(new errs.InternalServerError(reason));
    }
  }
  return function pRejectCommonHandler(req, res, next) {

    res.rejectedCommon = (nextRoute) => pRejectHandler.bind(res, nextRoute);
    return next();
  }
})());

server.use((function broadMessagePicker() {
  let BROADCASTS;
  setInterval(() => {
    mongoServer.getBroadcasts().then(messages => {
      BROADCASTS = messages.map(msg => JSON.stringify(msg.endAt)).join('|');
    })
  }, 1000 * 60);

  return (req, res, next) => {
    if (BROADCASTS && BROADCASTS.length) {
      res.once('header', function () {
        res.header('broadcast', BROADCASTS);
      });
    }
    next()
  }
})())

// $regist(server);
server.get('/', function (req, res, next) {

  mongoServer.throttleOneMinute('kkk', 40).then((c) => {
    res.send(c);
    return next(false);
  }, res.rejectedCommon(next));

});

server.get('/debug', function (req, res, next) {
  res.send(200, server.getDebugInfo());
  return next();
});

server.get('/debug/email/:email', function (req, res, next) {
  let {email} = req.params
  let code = appUtil.generateCode4();
  emailServer.sendVerifyCodeTo(email, code, 'newemailcode').then(code => {
    res.send(code);
    next()
  }).catch(res.rejectedCommon(next));
});
server.get('/debug/email/:email/:code', function (req, res, next) {
  let {email, code} = req.params

  mongoServer.doEmailVerify(email, code).then(e => {
    res.send(e)
    next()
  }, res.rejectedCommon(next))
});

server.get('/api', function (req, res, next) {
  res.send(req.params);
  return next();
});

/**
 *  CORS
 */

server.get('/cors/:username/:collection', function (req, res, next) {
  let username = req.params.username,
    collectionName = req.params.collection;
  let {jsonp, seed, sync, cursor} = req.query;
  seed = Number(seed);
  username = validator.trim(username);
  collectionName = validator.trim(collectionName);

  res.noCache();
  if (sync) {
    if (cursor) {

      if (cursor == 'empty') {
        cursor = void 0;
      }

      mongoServer.syncPublicCollection(username, collectionName, cursor).then(result => {
        res.send({data: result, limit: 100})
        next();
      }).catch(res.rejectedCommon(next));

    } else {
      mongoServer.userCollectionCountPublic(username, collectionName).then(count => {
        res.send(200, {sync: count});
        next();
      }).catch(res.rejectedCommon(next))
    }
  } else {

    mongoServer.corsUserCollection(username, collectionName, seed).then(hitokoto => {
      if (jsonp) {
        jsonp = validator.toString(jsonp);
        res.header('Content-Type', 'application/javascript; charset=UTF-8');
        res.send(200, jsonp + '(' + JSON.stringify(hitokoto) + ')');
        return next();
      } else {
        res.send(200, hitokoto);
        return next();

      }
    }).catch(res.rejectedCommon(next));
  }
});

/**
 * 获取一条hitokto    所有的 包括公开的和未公开的。
 */

server.get('/api/sources/:uid/:fid', function (req, res, next) {

  let uid = req.params.uid,
    fid = req.params.fid;
  uid = validator.trim(uid);
  fid = validator.trim(fid);

  let {jsonp, seed, sync, cursor} = req.query;
  seed = Number(seed);
  res.noCache();
  res.charSet('utf8');

  if (uid !== req.userid.toString()) {
    res.send(new errs.ForbiddenError('禁止通过该私密接口访问其他人的来源，请使用CORS来源。'))
    return next(false);
  }
  if (sync) {
    if (cursor) {

      if (cursor == 'empty') {
        cursor = void 0;
      }

      mongoServer.syncCollection(uid, fid, cursor).then(result => {
        res.send({data: result, limit: 100})
        next();
      }).catch(res.rejectedCommon(next));

    } else {
      mongoServer.userCollectionCountPrivate(uid, fid).then(count => {
        req.log.debug('count:', count)
        res.send(200, {sync: count});
        next();
      }).catch(res.rejectedCommon(next))
    }
  } else {

    mongoServer.noCorsUserCollection(uid, fid, seed).then(hitokoto => {
      if (jsonp) {
        jsonp = validator.toString(jsonp);
        res.header('Content-Type', 'application/javascript; charset=UTF-8');
        res.send(200, jsonp + '(' + JSON.stringify(hitokoto) + ')');
        return next();
      } else {
        res.send(200, hitokoto);
        return next();
      }
    }).catch(res.rejectedCommon(next));
  }
});

server.get('/cors', function (req, res, next) {
  let {jsonp, seed} = req.query;

  seed = Number(seed);

  res.noCache();
  res.charSet('utf-8')
  mongoServer.corsGetOneRandom(seed).then(hitokoto => {
    if (jsonp) {
      jsonp = validator.toString(jsonp);
      res.header('Content-Type', 'application/javascript; charset=UTF-8');
      res.send(200, jsonp + '(' + JSON.stringify(hitokoto) + ')');
      return next();
    } else {
      res.send(200, hitokoto);
      return next();

    }
  }).catch(res.rejectedCommon(next));
});

/**
 *  注册
 */

server.post('/api/regist', function (req, res, next) {
  let {username, email, password, nickname, code} = req.body;

  //防止注入
  username = validator.trim(username);
  password = validator.trim(password);
  nickname = validator.trim(nickname);
  if (typeof code !== 'undefined') {
    code = validator.trim(code);
  }

  let returnStupid = () => {
    res.send({you: "stupid", err: '418'})
    next(false)
  }
  if (!validator.isEmail(email)) {
    returnStupid();
    return;
  }
  if (code && !/^[a-zA-Z0-9]{4}$/gim.test(code)) {
    returnStupid();
    return;
  }

  let test = !code;

  if (test) {
    mongoServer.throttleOneMinute(username + password + email + nickname, 10).catch(e => {
      return Promise.reject('一分钟内不能超过10次')
    }).then(() => mongoServer.creatUser({
      username,
      password,
      email,
      nickname
    }, true).then(() => {
      return mongoServer.storeEmailVerify(email, appUtil.generateCode4(), 'regist')
    }).then((code) => {
      return emailServer.sendVerifyCodeTo(email, code, 'regist')
    }).then((detail) => {
      if (detail.accepted.length != 1) {
        res.send(500, {
          accepted: detail.accepted.length,
          rejected: detail.rejected.length,
          message: '验证邮件发送失败'
        })
        next(false);
      } else {
        res.send({message: '验证邮件发送成功！'})
        next();
      }
    })).catch(res.rejectedCommon(next));

  } else {
    mongoServer.doEmailVerify(email, code, 'regist').then(() => mongoServer.creatUser({
      username,
      password,
      email,
      nickname
    }, false)).then(user => {
      let uid = user._id;
      trace('创建用户成功', user);
      return req.hitoAuthActive(uid).then(token => {
        res.send({token, nickname, uid, message: '注册成功！欢迎成为网站的一员！\n请遵守国家的相关法律，不发布任何有害内容。\n\n注意：这里不欢迎没有创意的广告！'});
        next()
      })
    }).catch(res.rejectedCommon(next))
  }
});

server.post('/api/login', function (req, res, next) {

  let {username, password} = req.body;
  username = validator.trim(username);
  password = validator.trim(password);

  mongoServer.throttleTenMinute(username, 30).catch(e => {
    return Promise.reject('10分钟内登陆次数不能超过30次！')
  }).then(() => mongoServer.userLogin(username, password)).then(({uid, nickname}) => {
    return req.hitoAuthActive(uid).then(token => {
      res.send({token: token, uid, nickname: nickname, message: '登录成功！'});
      next()
    })
  }).catch(res.rejectedCommon(next))
});

/**
 * 修改密码
 */
server.post('/api/password', function (req, res, next) {

  let {newpass, oldpass} = req.body;
  newpass = validator.trim(newpass);
  oldpass = validator.trim(oldpass);

  mongoServer.throttleTenMinute(req.userid + 'password', 30).catch(e => {
    req.log.warn('用户多次尝试修改密码', req.uid)
    return Promise.reject('10分钟内修改密码次数不能超过30次！')
  }).then(() => mongoServer.updateUserPassword(req.userid, oldpass, newpass)).then(user => {
    return emailServer.notifyChangePassword(user.email)
  }).then(detail => {
    if (detail.accepted.length != 1) {} else {
      //TODO:记录到数据库邮件发送成功！
    }
    res.send({message: '修改密码成功！'});
    next();
  }).catch(res.rejectedCommon(next))

});

/**
 * 个人资料页 得到邮箱号码
 */
server.get('/api/useremail', function (req, res, next) {

  mongoServer.getUserByUid(req.userid).then(user => {
    trace('得到用户邮箱', user);
    return appUtil.hideEmail(user.email);
  }).then(email => {
    res.send({email})
    next();
  }).catch(res.rejectedCommon(next))
})

/**
 * get 是发送验证码给旧邮箱，post是验证旧验证码
 */
server.get('/api/oldemailcode', function (req, res, next) {
  mongoServer.throttleOneMinute(req.userid + 'oldEmailCode', 1).catch(e => {

    return Promise.reject('一分钟只能发送一次验证码')

  }).then(() => mongoServer.getUserByUid(req.userid)).then(user => {

    req.log.debug(user);

    let email = user.email;

    return mongoServer.storeEmailVerify(email, appUtil.generateCode4(), 'oldemailcode', req.userid).then(code => {
      return emailServer.sendVerifyCodeTo(email, code, 'oldemailcode')
    })

  }).then(detail => {
    if (detail.accepted.length != 1) {
      res.send(500, {
        accepted: detail.accepted.length,
        rejected: detail.rejected.length,
        message: '验证邮件似乎发送失败'
      })
      next(false);
    } else {
      res.send({message: '验证邮件已发送至您的旧邮箱内！请输入您收到的验证码'})
      next();
    }
  }).catch(res.rejectedCommon(next))

})

/**
 * 验证旧邮箱收到的验证码
 */
server.post('/api/oldemailcode', function (req, res, next) {

  let {code} = req.body;
  code = validator.trim(code);
  mongoServer.throttleTenMinute(req.userid + 'verifyoldemail', 30).catch(e => {
    return Promise.reject('操作过于频繁！')
  }).then(() => mongoServer.getUserByUid(req.userid)).then(user => {
    req.log.debug(user);
    let email = user.email;
    return mongoServer.doEmailVerify(email, code, 'oldemailcode', req.userid)
  }).then(() => {
    res.send({message: "验证成功！请输入新的邮箱。"});
    next()
  }).catch(res.rejectedCommon(next))

})

/**
 * get 是发送验证码给新邮箱
 */
server.get('/api/newemailcode', function (req, res, next) {

  let {email} = req.query;
  email = validator.trim(email);

  if (validator.isEmail(email)) {
    mongoServer.throttleOneMinute(email, 1).then(() => mongoServer.getUserByEmail(email)).then(user => {
      if (user) {
        return Promise.reject('该邮箱已存在用户');
      } else {
        return mongoServer.storeEmailVerify(email, appUtil.generateCode4(), 'newemailcode', req.userid).then(code => {
          return emailServer.sendVerifyCodeTo(email, code, 'newemailcode')
        })
      }
    }).then(detail => {
      if (detail.accepted.length != 1) {
        res.send(500, {
          accepted: detail.accepted.length,
          rejected: detail.rejected.length,
          message: '邮件似乎发送失败'
        })
        next(false);
      } else {
        res.send({message: '成功发送新的验证码至您的新邮箱！请输入您收到的新验证码！'})
        next();
      }
    }).catch(res.rejectedCommon(next))
  } else {
    res.send(new errs.InvalidArgumentError('邮箱格式不正确！'));
    next(false);
  }

})

/**
 * 验证新邮箱收到的验证码
 */
server.post('/api/newemailcode', function (req, res, next) {

  let {email, code} = req.body;
  email = validator.trim(email);
  code = validator.trim(code);

  if (validator.isEmail(email)) {
    mongoServer.throttleTenMinute(email + 'veryfyNewEmail', 30).then(() => mongoServer.getUserByUid(req.userid)).then(user => {
      return mongoServer.doEmailVerify(email, code, 'newemailcode', req.userid).then(() => {
        //确保上一条验证短信是成功的
        return mongoServer.makeSureUserEmailBeforeUpdate(req.userid, user.email)
      }).then(() => {
        return mongoServer.updateUserEmail(req.userid, email);
      })
    }).then(() => {
      res.send({message: "绑定新邮箱成功！"});
      next()
    }).catch(res.rejectedCommon(next))
  } else {
    next(new errs.InternalError('邮箱格式不正确！'));
  }
});

/**
 * 获取自己所有的句集
 */
server.get('/api/collections', function (req, res, next) {

  mongoServer.userCollections(req.userid).then(collections => {
    req.log.debug(collections);
    res.send({collections});
    next()
  }).catch(res.rejectedCommon(next))

});

/**
 * 新建句集
 */
server.put('/api/collections', function (req, res, next) {

  let {name} = req.body;
  name = validator.trim(name);

  if (name === '默认句集') {
    res.send(400, {message: '默认句集无法添加！'});
    next(false)
    return;
  }
  mongoServer.newUserCollection(req.userid, name).then(() => mongoServer.userCollections(req.userid)).then(collections => {
    res.send({collections, message: '添加成功！'});
    next()
  }).catch(res.rejectedCommon(next))

});

/**
 * 重命名句集
 */
server.post('/api/collections', function (req, res, next) {

  let {oldname, newname} = req.body;
  oldname = validator.trim(oldname);
  newname = validator.trim(newname);
  if (oldname === newname) {
    res.send(400, {message: '修改的名称相等！无需修改！'});
    next(false)
    return;
  }
  mongoServer.updateUserCollectionName(req.userid, oldname, newname).then(() => mongoServer.userCollections(req.userid)).then(after => {
    res.send({collections: after, message: '重命名成功！'});
    next()
  }).catch(res.rejectedCommon(next))

});
/**
 * 删除句集
 */
server.del('/api/collections', function (req, res, next) {

  let {name} = req.body;
  name = validator.trim(name);

  if (name === '默认句集') {
    res.send(400, {message: '默认句集无法删除！'});
    next(false)
    return;
  }
  mongoServer.deleteUserCollection(req.userid, name).then(theone => {
    if (!theone) {
      res.send(404, {message: '未找到该句集。可能已经被删除了'});
    } else {
      return mongoServer.userCollections(req.userid).then(collections => {
        res.send({collections, message: '删除成功'});
        next()
      })
    }
  }).catch(res.rejectedCommon(next))

})

/***
 *
 *    得到自己句集下面的所有句子
 *
 */

server.get('/api/collections/:name', function (req, res, next) {

  let name = req.params.name;
  name = validator.trim(name);

  let page = req.query.page || 1;
  let perpage = req.query.perpage || 20;
  page = ~~Number(page);
  perpage = ~~Number(perpage);
  if (page < 1) {
    page = 1;
  }

  if (perpage < 1) {
    perpage = 10;
  }

  let uid = req.userid;
  function getAll(page, perpage) {
    return Promise.all([
      mongoServer.userCollections(uid),
      mongoServer.viewUserCollection(uid, name, page, perpage)
    ])
  }

  function selectResult(results) {
    let collections = results[0],
      target = collections.find(item => item.name == name),
      count = target.count,
      totalPage = Math.ceil(count / perpage);

    req.log.debug(count, totalPage);
    if (page > 0 && totalPage > 0 && totalPage < page) {
      return getAll(--page, perpage).then(selectResult);
    } else {
      return ({hitokotos: results[1], totalPage, currentPage: page});
    }
  }

  getAll(page, perpage).then(selectResult).then(result => {
    res.send(result);
    next()
  }).catch(res.rejectedCommon(next))

});

/**
 * 添加句子
 */
server.put('/api/collections/:name', function (req, res, next) {

  let name = req.params.name;
  name = validator.trim(name);

  let {hitokoto, source, author, category, state} = req.body;
  hitokoto = validator.trim(hitokoto);
  source = validator.trim(source);
  author = validator.trim(author);
  category = validator.trim(category);
  state = state != 'false'; // 'true' != 'false' ~ true

  if (PUBLIC_HITO_NEED_REVIEW) {
    state = state
      ? 'private'
      : 'reviewing';
  } else {
    state = state
      ? 'private'
      : 'public';
  }
  mongoServer.createHitokoto(req.userid, name, {
    id: 1,
    source,
    author,
    category,
    hitokoto,
    creator_id: req.userid,
    state
  }).then(hitokoto => {
    res.send({
      hitokoto: hitokoto,
      message: state == 'reviewing'
        ? '新增成功！'
        : '新增成功！请等待管理员审核!'
    });
    next()
  }).catch(res.rejectedCommon(next))

});

/**
 *  修改hitokoto
 */
server.post('/api/collections/:name', function (req, res, next) {

  let name = req.params.name;
  name = validator.trim(name);

  let {
    _id,
    hitokoto,
    author,
    source,
    category,
    state
  } = req.body;

  _id = validator.trim(_id);

  hitokoto = validator.trim(hitokoto);
  source = validator.trim(source);
  author = validator.trim(author);
  category = validator.trim(category);
  state = state != 'false';

  if (PUBLIC_HITO_NEED_REVIEW) {
    state = state
      ? 'private'
      : 'reviewing';
  } else {
    state = state
      ? 'private'
      : 'public';
  }

  mongoServer.updateHitokoto(req.userid, _id, {source, author, category, hitokoto, state}).then(hitokoto => {
    res.send({
      hitokoto: hitokoto,
      message: state == 'reviewing'
        ? '修改成功！请等待管理员审核!'
        : '修改成功！'
    });
    next()
  }).catch(res.rejectedCommon(next))

});

/**
 * 删除句子
 */
server.del('/api/collections/:name', function (req, res, next) {

  let name = req.params.name;
  let {id} = req.body;

  name = validator.trim(name);
  id = validator.trim(id);
  mongoServer.deleteHitokoto(req.userid, id).then(hitokoto => {
    req.log.debug(hitokoto);
    res.send({hitokoto: hitokoto, message: '删除句子成功!'});
    next()
  }).catch(res.rejectedCommon(next))

});

/**
 * 得到所有集合
 */

server.get('/api/explore', function (req, res, next) {

  let page = req.query.page || 1;
  let perpage = req.query.perpage || 20;
  page = ~~Number(page);
  perpage = ~~Number(perpage);
  if (page < 1) {
    page = 1;
  }

  if (perpage < 1) {
    perpage = 10;
  }

  if (Number.isNaN(page) || Number.isNaN(perpage)) {
    res.send(400, `参数非数字!page:${page},perpage:${perpage}`);
  } else {
    Promise.all([
      mongoServer.getPublicHitokotoCount(),
      mongoServer.searchAllPublicHitokotos(page, perpage)
    ]).then(results => {

      let totalPages = Math.ceil(results[0] / perpage);
      res.send({total: totalPages, current: page, hitokotos: results[1]});
      next()
    }).catch(res.rejectedCommon(next))
  }

});

/**
 * 得得到用户信息
 */
server.get('/api/explore/users/:uid', function (req, res, next) {

  let uid = req.params.uid;
  uid = validator.trim(uid);
  mongoServer.exploreUser(uid).then(user => {
    res.send({user: user});
    next(false);
  }, res.rejectedCommon(next))
});

/**
 * 得得到用户集合内容信息
 */
server.get('/api/explore/users/:uid/:colname', function (req, res, next) {

  let uid = req.params.uid,
    collection = req.params.colname;
  uid = validator.trim(uid);
  collection = validator.trim(collection);

  let page = req.query.page || 1;
  let perpage = req.query.perpage || 20;
  page = ~~Number(page);
  perpage = ~~Number(perpage);
  if (page < 1) {
    page = 1;
  }

  if (perpage < 1) {
    perpage = 10;
  }

  Promise.all([
    mongoServer.exploreUser(uid),
    mongoServer.exploreUserCollection(uid, collection, page, perpage)
  ]).then(results => {
    let user = results[0],
      cols = user.collections,
      target = cols.find(v => v.name === collection),
      count = target.count,
      total = Math.ceil(count / perpage);

    res.send({hitokotos: results[1], totalPage: total, currentPage: page});
    next(false);
  }, res.rejectedCommon(next))
});

server.get('/api/backups', function (req, res, next) {
  req.log.debug(req.userid);
  mongoServer.getBackup(req.userid).then(backup => {
    res.send({backup});
    next();
  }).catch(res.rejectedCommon(next));
})
server.post('/api/backups', function (req, res, next) {
  let {data} = req.body;
  data = validator.trim(data);
  mongoServer.storeBackup(req.userid, data).then(() => {
    res.send({message: '备份成功！'});
    next();
  }).catch(res.rejectedCommon(next));
})

/**
 *  Admin API
 */

//获取需要审核的hitokoto
server.get('/api/admin/hitokotos/review', function (req, res, next) {

  let page = req.query.page || 1;
  let perpage = req.query.perpage || 20;
  page = ~~Number(page);
  perpage = ~~Number(perpage);
  if (page < 1) {
    page = 1;
  }

  if (perpage < 1) {
    perpage = 10;
  }

  mongoServer.roleCheck(req.userid, 'reviewHito').then(() => {
    //
    return Promise.all([
      mongoServer.getNeedReviewingHitokotosCount(),
      mongoServer.getNeedReviewingHitokotos(page, perpage)
    ]).then((results) => {
      let count = results[0],
        total = Math.ceil(count / perpage);

      res.send({hitokotos: results[1], totalPage: total, currentPage: page});
      next(false)
    })
  }).catch(res.rejectedCommon(next));
});

//修改hitokoto状态
server.post('/api/admin/hitokotos/review', function (req, res, next) {
  let {hid, state} = req.body;

  hid = validator.trim(hid);
  state = validator.trim(state);

  mongoServer.roleCheck(req.userid, 'reviewHito').then(() => {
    //
    return mongoServer.changeHitokotoState(hid, state).then(() => {
      res.send({message: '操作成功！'});
      next()
    })
  }).catch(res.rejectedCommon(next));
});

server.put('/api/admin/broadcasts', function (req, res, next) {
  let {endAt, message} = req.body;

  mongoServer.roleCheck(req.userid, 'broadcast').then(() => {
    return mongoServer.putBroadcast({endAt, message}).then((message) => {
      res.send({message});
      next()
    })
  }).catch(res.rejectedCommon(next));
});

server.get('/api/admin/broadcasts', function (req, res, next) {

  mongoServer.getBroadcasts().then((messages) => {
    res.send({message: '操作成功！', messages});
    next()
  }).catch(res.rejectedCommon(next));
});

server.post('/api/admin/broadcasts', function (req, res, next) {

  let {endAt, message, _id} = req.body;

  mongoServer.roleCheck(req.userid, 'broadcast').then(() => {
    return mongoServer.updateBroadcast(_id, {endAt, message}).then((message) => {
      res.send({message});
      next()
    })
  }).catch(res.rejectedCommon(next));
});
server.del('/api/admin/broadcasts', function (req, res, next) {

  let {_id} = req.body;

  mongoServer.roleCheck(req.userid, 'broadcast').then(() => {
    return mongoServer.deleteBroadcast(_id).then((message) => {
      res.send({message});
      next()
    })
  }).catch(res.rejectedCommon(next));
});

server.on('after', restify.plugins.auditLogger({
  log: bunyan.createLogger({
    name: 'audit',
    path: path.resolve(__dirname, 'server.after.log')
  }),
  event: 'after',
  printLog: false
}));

server.on('InternalServer', function (req, res, err, callback) {
  // this will get fired first, as it's the most relevant listener
  req.log.error({type: 'InternalServer', err: err});
  return callback();
});

server.on('restifyError', function (req, res, err, callback) {
  // this is fired second.
  req.log.error({type: 'restifyError', err: err});
  return callback();
});

server.on('uncaughtException', function (req, res, route, err) {
  console.log(route, err);
  console.log('eee');
  res.charSet('utf8');
  res.send(new errs.InternalError('程序内部运行出错!'));
});

server.listen(9999, function () {
  console.log('%s listening at %s', server.name, server.url);
});