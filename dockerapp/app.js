const http = require('http');

const hostname = '0.0.0.0';
const port = 80;

const server = http.createServer((req, res) => {
    if (req.url == '/secret-page'){
        res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html');
                res.end('<h1>You found this page???</h1>');

    } else {
        res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html');
                res.end('<h1>Hello World</h1>');
    }
});

server.listen(port, hostname, () => {
    console.log('Server running at http://%s:%s/', hostname, port);
});

process.on('SIGINT', function() {
    console.log('Caught interrupt signal and will exit');
    process.exit();
});
