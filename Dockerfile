FROM node:alpine

EXPOSE 8080
WORKDIR /app
ENV PORT=8080

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.tuna.tsinghua.edu.cn/g' /etc/apk/repositories && apk add -U tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
COPY package.json /app/
RUN  npm install --no-optional --production --registry=https://registry.npm.taobao.org
COPY . /app
VOLUME  [ "/app/frontend/build" ]
HEALTHCHECK --interval=30s --timeout=30s --start-period=6s --retries=3 CMD [ "wget","--spider","http://127.0.0.1:8080/ping" ]
ENTRYPOINT [ "npm","run","start" ] 