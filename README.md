# FIST OF ALL
You have to config `.env` file as following:

```
MONGODB_CONN=mongodb://localhost://xxx
QQMAIL_NAME=xxxx@qq.com
QQMAIL_PASS=xxxx
# secret for encoding message
SECRET=xxxx
# allowed cors origin urls, https: and http: are different
CORS_URLS=https://hitokoto.heitaov.cn|http://localhost:9999
```

# Build web resources
```
git submodule update --init --recursive
```

# Run
Run following commands to start the server.
```
npm install
npm run start 
#or you can run `node app.js` 
#or node application managers such as pm2 
```


