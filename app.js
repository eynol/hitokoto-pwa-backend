const restify = require('restify');
const corsMiddleware = require('restify-cors-middleware')
const validator = require('validator');

const mongoServer = require('./mongo');
const emailServer = require('./mailpush/index.js');
const authMiddleware = require('./middleware/auth')
const appUtil = require('./util');

let trace = console.log.bind(console);

const cors = corsMiddleware({origins: ['*'], allowHeaders: ['API-Token'], exposeHeaders: ['API-Token-Expiry']})
// var $regist = require('./routes/regist.js');

const whitelistapi = [(/^\/cors/)];
const CURRENTHOST = /^http(s)?:\/\/localhost:8080/;

const server = restify.createServer({name: 'hitokoto', version: '1.0.0'});

server.pre((req, res, next) => {
  console.log(req.method, req.path(), req.url);
  console.log(req.connection.remotePort);
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
server.use(restify.plugins.acceptParser(server.acceptable));
server.use(restify.plugins.queryParser());
server.use(restify.plugins.bodyParser());
server.use(authMiddleware())
// $regist(server);

server.get('/', function (req, res, next) {
  res.send(appUtil.generateCode4());
  return next();
});

server.get('/debug', function (req, res, next) {
  res.send(200, server.getDebugInfo());
  return next();
});

server.get('/test/email/:email', function (req, res, next) {
  let {email} = req.params
  let code = appUtil.generateCode4();
  mongoServer.storeEmailVerify(email, code).then(code => {
    res.send(code);
    next();
  })
});
server.get('/test/email/:email/:code', function (req, res, next) {
  let {email, code} = req.params

  mongoServer.doEmailVerify(email, code).then(e => {
    res.send(e)
    next()
  })
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
  let {jsonp, count} = req.query;

  username = validator.trim(username);
  collectionName = validator.trim(collectionName);

  res.noCache();
  res.charSet('utf-8');
  mongoServer.corsUserCollection(username, collectionName).then(hitokoto => {
    if (jsonp) {
      jsonp = validator.toString(jsonp);
      res.header('Content-Type', 'application/javascript; charset=UTF-8');
      res.send(200, jsonp + '(' + JSON.stringify(hitokoto) + ')');
      return next();
    } else {
      res.send(200, hitokoto);
      return next();

    }
  }).catch(e => {
    res.send(500, {message: e});
    return next(false);
  });
});
server.get('/cors', function (req, res, next) {
  let {jsonp, count} = req.query;

  res.noCache();
  res.charSet('utf-8')
  mongoServer.corsGetOneRandom().then(hitokoto => {
    if (jsonp) {
      jsonp = validator.toString(jsonp);
      res.header('Content-Type', 'application/javascript; charset=UTF-8');
      res.send(200, jsonp + '(' + JSON.stringify(hitokoto) + ')');
      return next();
    } else {
      res.send(200, hitokoto);
      return next();

    }
  }).catch(e => {
    res.send(500, {message: e});
    return next(false);
  });
});

/**
 *  注册登录
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
    mongoServer.creatUser({
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
        res.send({accepted: detail.accepted.length, rejected: detail.rejected.length, err: '邮件似乎发送失败'})
        next(false);
      } else {
        res.send({message: '邮件发送成功！'})
        next();
      }
    }).catch(e => {
      trace('send email catch', e)
      res.send({
        err: '执行错误：' + e
      });
      next(false)
    });

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
        res.send({token, nickname});
        next()
      })
    }).catch(e => {
      res.send({
        where: 'newUser',
        err: '执行错误：' + e
      });
      next(false)
    })
  }
});

server.post('/api/login', function (req, res, next) {

  let {username, password} = req.body;
  username = validator.trim(username);
  password = validator.trim(password);

  mongoServer.userLogin(username, password).then(({uid, nickname}) => {
    return req.hitoAuthActive(uid).then(token => {
      res.send({token: token, nickname: nickname});
      next()
    })
  }).catch(e => {
    res.send({err: e});
    next()
  })
});

server.post('/api/password', function (req, res, next) {

  let {newpass, oldpass} = req.body;
  newpass = validator.trim(newpass);
  oldpass = validator.trim(oldpass);

  req.hitoAuthCheck().then(ret => mongoServer.updateUserPassword(ret.uid, oldpass, newpass)).then(user => {
    return emailServer.notifyChangePassword(user.email)
  }).then(detail => {
    if (detail.accepted.length != 1) {} else {
      //TODO:记录到数据库邮件发送成功！
    }
    res.send({message: '修改密码成功！'});
    next();
  }).catch(e => {
    res.send({
      code: e.code,
      err: e.message || e
    });
    next()
  })

});
server.get('/api/useremail', function (req, res, next) {

  req.hitoAuthCheck().then(ret => mongoServer.getUserByUid(ret.uid)).then(user => {
    trace('得到用户邮箱', user);
    return appUtil.hideEmail(user.email);
  }).then(email => {
    res.send({email})
    next();
  }).catch(e => {
    res.send({
      code: e.code,
      err: e.message || e
    });
    next()
  })
})

/**
 * get 是发送验证码给旧邮箱，post是验证旧验证码
 */
server.get('/api/oldemailcode', function (req, res, next) {

  req.hitoAuthCheck().then(ret => {
    return mongoServer.getUserByUid(ret.uid).then(user => {
      console.log(user);
      let email = user.email;

      return mongoServer.storeEmailVerify(email, appUtil.generateCode4(), 'oldemailcode', ret.uid).then(code => {
        return emailServer.sendVerifyCodeTo(email, code, 'oldemailcode')
      })
    })
  }).then(detail => {
    if (detail.accepted.length != 1) {
      res.send({accepted: detail.accepted.length, rejected: detail.rejected.length, err: '邮件似乎发送失败'})
      next(false);
    } else {
      res.send({message: '邮件发送成功！'})
      next();
    }
  }).catch(e => {
    res.send({
      code: e.code,
      err: e.message || e
    });
    next()
  })

})

/**
 * 验证旧邮箱收到的验证码
 */
server.post('/api/oldemailcode', function (req, res, next) {

  let {code} = req.body;
  code = validator.trim(code);

  req.hitoAuthCheck().then(ret => {
    return mongoServer.getUserByUid(ret.uid).then(user => {
      console.log(user);
      let email = user.email;
      return mongoServer.doEmailVerify(email, code, 'oldemailcode', ret.uid)
    })
  }).then(() => {
    res.send({message: "验证成功！"});
    next()
  }).catch(e => {
    res.send({
      code: e.code,
      err: e.message || e
    });
    next()
  })

})

/**
 * get 是发送验证码给新邮箱
 */
server.get('/api/newemailcode', function (req, res, next) {

  let {email} = req.query;
  email = validator.trim(email);

  if (validator.isEmail(email)) {
    req.hitoAuthCheck().then(ret => {
      return mongoServer.getUserByEmail(email).then(user => {
        if (user) {
          return Promise.reject('该邮箱已存在用户');
        } else {
          return mongoServer.storeEmailVerify(email, appUtil.generateCode4(), 'newemailcode', ret.uid).then(code => {
            return emailServer.sendVerifyCodeTo(email, code, 'newemailcode')
          })
        }
      })
    }).then(detail => {
      if (detail.accepted.length != 1) {
        res.send({accepted: detail.accepted.length, rejected: detail.rejected.length, err: '邮件似乎发送失败'})
        next(false);
      } else {
        res.send({message: '邮件发送成功！'})
        next();
      }
    }).catch(e => {
      res.send({
        code: e.code,
        err: e.message || e
      });
      next()
    })
  } else {
    throw new Error('邮箱格式不正确！');
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
    req.hitoAuthCheck().then(ret => {
      return mongoServer.getUserByUid(ret.uid).then(user => {
        return mongoServer.doEmailVerify(email, code, 'newemailcode', ret.uid).then(() => {
          return mongoServer.updateUserEmail(ret.uid, email);
        })
      })
    }).then(() => {
      res.send({message: "验证成功！"});
      next()
    }).catch(e => {
      res.send({
        code: e.code,
        err: e.message || e
      });
      next()
    })
  } else {
    throw new Error('邮箱格式不正确！');
  }
});
server.get('/api/collections', function (req, res, next) {

  req.hitoAuthCheck().then(ret => mongoServer.userCollections(ret.uid)).then(collections => {
    console.log(collections);
    res.send({collections});
    next()
  }).catch(e => {
    res.send({
      code: e.code,
      err: e.message || e
    });
    next()
  })

});
server.put('/api/collections', function (req, res, next) {

  let {name} = req.body;
  name = validator.trim(name);

  if (name === '默认句集') {
    res.send({err: '默认句集无法添加！'});
    next(false)
    return;
  }
  req.hitoAuthCheck().then(ret => mongoServer.newUserCollection(ret.uid, name).then(() => mongoServer.userCollections(ret.uid))).then(collections => {
    res.send({collections});
    next()
  }).catch(e => {
    res.send({
      code: e.code,
      err: e.message || e
    });
    next()
  })

});
server.post('/api/collections', function (req, res, next) {

  let {oldname, newname} = req.body;
  oldname = validator.trim(oldname);
  newname = validator.trim(newname);
  if (oldname === newname) {
    res.send({err: '修改的名称相等！无需修改！'});
    next(false)
    return;
  }
  req.hitoAuthCheck().then(ret => mongoServer.updateUserCollectionName(ret.uid, oldname, newname).then(() => mongoServer.userCollections(ret.uid))).then(after => {
    res.send({collections: after});
    next()
  }).catch(e => {
    res.send({
      code: e.code,
      err: e.message || e
    });
    next()
  })

});
server.del('/api/collections', function (req, res, next) {

  let {name} = req.body;
  name = validator.trim(name);

  if (name === '默认句集') {
    res.send({err: '默认句集无法删除！'});
    next(false)
    return;
  }
  req.hitoAuthCheck().then(ret => mongoServer.deleteUserCollection(ret.uid, name).then(theone => {
    if (!theone) {
      res.send(404, {message: '未找到该句集。可能已经被删除了'});
    } else {
      return mongoServer.userCollections(ret.uid).then(collections => {
        res.send({collections});
        next()
      })
    }
  })).catch(e => {
    res.send({
      code: e.code,
      err: e.message || e
    });
    next()
  })

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

  let uid;
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

    console.log(count, totalPage);
    if (page > 0 && totalPage > 0 && totalPage < page) {
      return getAll(--page, perpage).then(selectResult);
    } else {
      return ({hitokotos: results[1], totalPage, currentPage: page});
    }
  }

  req.hitoAuthCheck().then(ret => {
    uid = ret.uid;
  }).then(() => getAll(page, perpage)).then(selectResult).then(result => {
    res.send(result);
    next()
  }).catch(e => {
    res.send({
      code: e.code,
      err: e.message || e
    });
    next()
  })

});
server.put('/api/collections/:name', function (req, res, next) {

  let name = req.params.name;
  name = validator.trim(name);

  let {hitokoto, source, author, category} = req.body;
  hitokoto = validator.trim(hitokoto);
  source = validator.trim(source);
  author = validator.trim(author);
  category = validator.trim(category);

  req.hitoAuthCheck().then(ret => {
    return mongoServer.createHitokoto(ret.uid, name, {
      id: 1,
      source,
      author,
      category,
      hitokoto,
      creator_id: ret.uid,
      state: 'public'
    })
  }).then(hitokoto => {
    res.send({hitokoto: hitokoto});
    next()
  }).catch(e => {
    res.send({
      code: e.code,
      err: e.message || e
    });
    next()
  })

});

/**
 *  修改hitokoto
 */
server.post('/api/collections/:name', function (req, res, next) {

  let name = req.params.name;
  name = validator.trim(name);

  let {_id, hitokoto, author, source, category} = req.body;

  _id = validator.trim(_id);

  hitokoto = validator.trim(hitokoto);
  source = validator.trim(source);
  author = validator.trim(author);
  category = validator.trim(category);

  req.hitoAuthCheck().then(ret => {
    return mongoServer.updateHitokoto(_id, {source, author, category, hitokoto})
  }).then(hitokoto => {
    res.send({result: hitokoto});
    next()
  }).catch(e => {
    res.send({
      code: e.code,
      err: e.message || e
    });
    next()
  })

});

/**
 * 删除句子
 */
server.del('/api/collections/:name', function (req, res, next) {

  let name = req.params.name;
  let {id} = req.body;

  name = validator.trim(name);
  id = validator.trim(id);

  req.hitoAuthCheck().then(ret => mongoServer.deleteHitokoto(id)).then(result => {
    console.log(result);
    res.send({result: result});
    next()
  }).catch(e => {
    res.send({
      code: e.code,
      err: e.message || e
    });
    next()
  })

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
    throw `参数非数字!page:${page},perpage:${perpage}`;
  } else {
    Promise.all([
      mongoServer.getPublicHitokotoCount(),
      mongoServer.searchAllPublicHitokotos(page, perpage)
    ]).then(results => {

      let totalPages = Math.ceil(results[0] / perpage);
      res.send({total: totalPages, current: page, hitokotos: results[1]});
      next()
    })
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
  }, e => {
    res.send({where: '执行错误', err: e});
    next(false)
  })
});

/**
 * 得得到用户信息
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
  }, e => {
    res.send({where: '执行错误', err: e});
    next(false)
  })
});

server.listen(9999, function () {
  console.log('%s listening at %s', server.name, server.url);
});