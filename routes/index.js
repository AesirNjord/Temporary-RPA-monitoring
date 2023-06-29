var express = require('express');
var router = express.Router();
var nacos = require('nacos')
var mysql = require('mysql')
var db = require('../db')
const axios = require('axios')
var log4js = require('log4js')

log4js.configure({
  appenders: {
    file: {
      type: 'file',
      filename: './logs/runLogs/runLog',
      pattern: 'yyyy-MM-dd.log',
      alwaysIncludePattern: true
    },
    error: {
      type: 'file',
      filename: './logs/errorLogs/errLog',
      pattern: 'yyyy-MM-dd.log',
      alwaysIncludePattern: true
    },
    warn: {
      type: 'file',
      filename: './logs/warnLogs/warnLog',
      pattern: 'yyyy-MM-dd.log',
      alwaysIncludePattern: true
    }
  },
  categories: {
    default: { appenders: ['file'], level: 'info' },
    error: { appenders: ['error'], level: 'error' },
    warn: { appenders: ['warn'], level: 'warn' },
  }
})

const logger = log4js.getLogger()
const errorLogger = log4js.getLogger('error')
const warnLogger = log4js.getLogger('warn')

const client = new nacos.NacosNamingClient({
  logger: console,
  serverList: '221.204.171.58:8849',
  namespace: 'ecc4cbf6-b1df-463a-9516-5c70c4bdaa06',
  secretkey: 'SecretKey012345678901234567890123456789012345678901234567890123456789',
  username: 'TRPA',
  password: '789456123',
})

var conn = mysql.createConnection(db.mysql);
var serverList = [];
var caseNoList = [];
var caseNoList2 = [];
conn.connect();

function query(sql) {
  return new Promise((resolve, reject) => {
    try {
      conn.query(sql, (err, rows) => {
        if (err) {
          reject(err)
        }
        let res = JSON.parse(JSON.stringify(rows))
        console.log(res)
        resolve(res)
      })
    } catch (err) {
      reject(err)
    }
  })
}

setInterval(() => {
  getService()
}, 5000)

setInterval( //监测服务是否超时
  () => {
    console.log('监测')
    if (caseNoList.length > 0) {
      for (let i = 0; i < caseNoList.length; i++) {
        if ((Date.now() - caseNoList[i].sTime) > (60 * caseNoList[i].ERtime * 1000)) {
          try {
            axios.post('http://app.whhcxw.com.cn/hcxw/product16001/wechat/msgSendText', {
              touser: 'YuGangDeMao',
              content: caseNoList[i].sname + '服务超时,最后运行阶段：' + caseNoList[i].Rstate + ",当前任务号：" + caseNoList[i].caseNo + ",任务开始时间：" + caseNoList[i].sTime
            })
            warnLogger.warn(caseNoList[i].sname + '服务超时,最后运行阶段：' + caseNoList[i].Rstate + ",当前任务号：" + caseNoList[i].caseNo)
            caseNoList.splice(i, 1)
            caseNoList2.splice(i, 1)
          } catch (error) {
            console.log(error)
          }
        }
      }
    }
  }, 10000
)

async function getService() {
  axios.get('http://221.204.171.58:8849/nacos/v1/ns/service/list', { //获取命名空间下的所有服务列表
    params: { pageNo: 1, pageSize: 1000, namespaceId: 'ecc4cbf6-b1df-463a-9516-5c70c4bdaa06' }, headers: {
      secretkey: 'SecretKey012345678901234567890123456789012345678901234567890123456789',
      username: 'nacos',
      password: 'nacos'
    }
  }).then(res => {
    console.log(res.data.doms)
    for (var i = 0; i < res.data.doms.length; i++) {
      console.log(res.data.doms[i])
      if (serverList.includes(res.data.doms[i])) {

      }
      else {
        client.subscribe(res.data.doms[i], async hosts => {
          console.log('saaaaa', hosts[0])
          let name = hosts[0].instanceId.split("@@");
          let sname = name[1];//服务名
          let ip = hosts[0].ip;
          let port = hosts[0].port;
          let Hstate = hosts[0].healthy;//服务健康状态
          let Rstate = hosts[0].metadata.Rstate;//服务运行阶段
          let ERtime = hosts[0].metadata.ERtime;//任务预期耗时（分钟）
          let caseNo = hosts[0].metadata.caseNo;//当前案件号
          let sTime = hosts[0].metadata.sTime;//任务开始时间

          var Case = {
            caseNo: caseNo,
            sTime: sTime,
            Rstate: Rstate,
            sname: sname,
            ERtime: ERtime,
          }

          if (hosts[0].healthy == false) {
            axios.post('http://app.whhcxw.com.cn/hcxw/product16001/wechat/msgSendText', {
              touser: 'YuGangDeMao',
              content: sname + '服务离线,最后运行阶段：' + Rstate + ",当前任务号：" + caseNo
            })
            errorLogger.error(sname + '服务离线,最后运行阶段：' + Rstate + ",当前任务号：" + caseNo)
          }
          else {
            logger.info(sname + "服务运行中, 案件号：" + caseNo + ",运行阶段：" + Rstate)
          }
          if (Rstate === '任务开始') {
            if (caseNoList2.indexOf(caseNo) == -1) {
              caseNoList2.push(caseNo)
              caseNoList.push(Case)
            }
            logger.log(caseNoList)
            console.log(caseNoList)
          } else if (Rstate === '任务结束') {
            for (let i = 0; i < caseNoList.length; i++) {
              if (caseNoList[i].caseNo === caseNo) {
                caseNoList.splice(i, 1)
                caseNoList2.splice(i, 1)
              }
            }
          }


          console.log(sname, ip, port, Hstate, Rstate, ERtime, caseNo)

          let sql = 'select * from slist where sname = ' + "'" + sname + "'"
          let data = await query(sql)
          if (data == 0) { //插入数据
            let sql = "insert into slist(sname,ip,port,Hstate,Rstate,ERtime,caseNo,sTime) values('" + sname + "','" + ip + "','" + port + "','" + Hstate + "','" + Rstate + "','" + ERtime + "','" + caseNo + "','" + sTime + "')"
            console.log(sql)
            await query(sql)
          }
          else { //更新数据
            let sql = 'update slist set Hstate = ' + "'" + Hstate + "'" + ", Rstate = " + "'" + Rstate + "'" + ", caseNo = '" + caseNo + "'" + ", sTime = " + sTime + ' where sname = ' + "'" + sname + "'"
            console.log(sql)
            await query(sql)
          }
        })
        serverList.push(res.data.doms[i])
      }
    }
  })
}



module.exports = router;
