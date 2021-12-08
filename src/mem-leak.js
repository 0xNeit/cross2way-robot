const express = require('express')
const app = express()
const port = 9999

app.all('*', (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  res.header("Access-Control-Allow-Methods","PUT,POST,GET,DELETE,OPTIONS");
  res.header("X-Powered-By",' 3.2.1')
  res.header("Content-Type", "application/json;charset=utf-8");
  next();
});

process.on('unhandledRejection', (err) => {
  log.error(`unhandledRejection ${err}`);
});

let theThing = null;
let replaceThing = function() {
  const newThing = theThing;
  const unused = function() {
    if (newThing) console.log("hi");
  };
  // 不断修改引用
  theThing = {
    longStr: new Array(1e8).join("*"),
    someMethod: function() {
      console.log("a");
    },
  };

  // 每次输出的值会越来越大
  console.log(process.memoryUsage().heapUsed);
};

setInterval(replaceThing, 100);

// app.get("/h", function(req, res){
//   replaceThing()
//   console.log(process.memoryUsage().heapUsed);
//   res.send({ mem: process.memoryUsage().heapUsed });
// })

app.get("/mem", (req, res) => {
  res.send({ mem: process.memoryUsage().heapUsed });
})

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
})

