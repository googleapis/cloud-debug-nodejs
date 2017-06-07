// compile with
// $ tsc --lib es6 --target es5 async.ts

function delay(t) {
  return new Promise((resolve, reject) => {
    setTimeout(resolve, t);
  });
}

function get(path, handler) {
  delay(10).then(() => {
    const req = {
      name: 'fake request',
      path: path
    };
    const res = {
      name: 'fake response',
      status: (statusCode) => {
        this.statusCode = statusCode;
        return this;
      },
      send: (msg) => {
        console.log(msg);
      }
    }
    handler(req, res);
  });
}

function run() {
  get('/foo', async (req, res) => {
    await delay(10);
    res.status(200);
  });
}

module.exports = run;
