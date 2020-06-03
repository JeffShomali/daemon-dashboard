var Client = require('ssh2').Client
var http = require('https')
const winston = require('winston')
var moment = require('moment')
var osascript = require('node-osascript')
const { exec } = require('child_process')

function loggerWrapper(type, message, env) {
    let logFile = env === 'stage' ? 'stage.log' : 'prod.log'
    const logger = winston.createLogger({
        format: winston.format.simple(),
        transports: [new winston.transports.File({ filename: logFile })],
    })
    if (type === 'info') {
        logger.info(`${moment().format('ddd MMM D h:mm:ss a')} | ${message}`)
    } else if (type === 'error') {
        logger.error(`${moment().format('ddd MMM D h:mm:ss a')} | ${message}`)
    } else {
        logger.info(type)
    }
}

function prodLog(type, message) {
    const logger = winston.createLogger({
        format: winston.format.simple(),
        transports: [new winston.transports.File({ filename: 'production.log' })],
    })
    if (type === 'info') {
        logger.info(`${moment().format('ddd MMM D h:mm:ss a')} | ${message}`)
    } else if (type === 'error') {
        logger.error(`${moment().format('ddd MMM D h:mm:ss a')} | ${message}`)
    } else {
        logger.info(type)
    }
}

function moveOldLogs(env = 'stage') {
    let _cmd = `cat ${env}.log >> old_logs/all_${env}.log`
    exec(_cmd, (error, stdout, stderr) => {
        if (error) {
            loggerWrapper(`error: ${error.message}`)
            return
        }
        if (stderr) {
            loggerWrapper(`stderr: ${stderr}`)
            return
        }
    })
}

function clearLog(env = 'stage') {
    const logger = winston.createLogger({
        format: winston.format.simple(),
        transports: [
            new winston.transports.File({
                filename: `${env}.log`,
                options: { flags: 'w' },
            }),
        ],
    })
}

function sendSlackNotification(message) {
    var options = {
        method: 'POST',
        hostname: 'hooks.slack.com',
        port: null,
        path: '/services/TP7UKQFNX/BQFNGK49J/UuVKAq3B2yP0We2mcANhm9EQ',
        headers: {
            'content-type': 'application/json',
            'content-length': '200',
        },
    }

    var req = http.request(options, function (res) {
        var chunks = []

        res.on('data', function (chunk) {
            chunks.push(chunk)
        })

        res.on('end', function () {
            var body = Buffer.concat(chunks)
            // console.log(body.toString());
        })
    })

    req.write(JSON.stringify({ text: message }))
    req.end()
}

function sendMacPushNotification() {
    osascript.execute(
        'display notification "BB Monitored" with title "All Stage and Production Servers" subtitle "Please Review Logs Jeff!" sound name "Submarine"',
        function (err, result, raw) {
            if (err) loggerWrapper('error', err)
        }
    )
}

function commandRunner(ip, cmd, message = 'Default Server', env = 'stage') {
    var conn = new Client()

    let result = ''

    conn.on('ready', function () {
        conn.exec(cmd, function (err, stream) {
            if (err) throw err
            stream
                .on('close', function (code, signal) {
                    // loggerWrapper("info", 'Stream :: close :: code: ' + code + ', signal: ' + signal);
                    conn.end()
                })
                .on('data', function (data) {
                    loggerWrapper('info', `${message}${data}`, env)
                    result = data
                })
                .stderr.on('data', function (data) {
                    loggerWrapper('error', 'STDERR: ' + data, env)
                })
            ;[]
        })
    }).connect({
        host: ip,
        port: 22,
        username: 'jeffshomali',
        passphrase: 'asadagha',
        privateKey: require('fs').readFileSync('/Users/jeffshomali/.ssh/id_rsa'),
    })

    console.log(`Connecting to ${ip}`);

    return result
}

function listStageDaemons() {
    commandRunner(
        '35.164.47.115',
        "ps -ef | grep 'bbproc\\|bbsvc\\|cv1comm\\|devcomm' | grep -v grep",
        'Stage App Servers: Check list of running Daemons:\n'
    )

    commandRunner(
        '34.211.243.89',
        "ps -ef | grep 'bbproc\\|bbsvc\\|cv1comm\\|devcomm' | grep -v grep",
        'Stage CV1 Gateway 1: List Running Daemons:\n'
    )
    commandRunner(
        '52.11.24.58',
        "ps -ef | grep 'bbproc\\|bbsvc\\|cv1comm\\|devcomm' | grep -v grep",
        'Stage DC12 LB 1: List Running Daemons:\n'
    )

    commandRunner(
        '35.165.180.23',
        "ps -ef | grep 'bbproc\\|bbsvc\\|cv1comm\\|devcomm' | grep -v grep",
        'Stage DC12 LB 2: List Running Daemons:\n'
    )

    commandRunner(
        '52.38.227.143',
        "ps -ef | grep 'bbproc\\|bbsvc\\|cv1comm\\|devcomm' | grep -v grep",
        'Stage Dev Subsystem: List Running Daemons:\n'
    )

}

// ####################################################### Stage

function stage() {
    moveOldLogs()
    clearLog()

    listStageDaemons()

    commandRunner(
        '35.161.211.195',
        'tail -n 1000 /var/log/php_errors.log | grep -i "ERROR" | wc -l',
        'Stage Web Server: Count PHP Errors: '
    )

    commandRunner(
        '35.164.47.115',
        "ps -ef | grep 'bbproc\\|bbsvc\\|cv1comm\\|devcomm' | grep -v grep | wc -l",
        'Stage App Server: Count Daemons: '
    )
    commandRunner(
        '35.164.47.115',
        "df -kh | grep -i '/dev/xvda1' | grep -oh '..%' | grep -oh ..",
        'Stage App Server: Check Disk Usage: '
    )

    commandRunner('35.164.47.115', 'tail -n1  /var/log/activemq.log', 'Stage App Server: Check ActiveMQ Logs:\n')

    //---------- Stage CV1 Gateways
    commandRunner(
        '34.211.243.89',
        "df -kh | grep -i '/dev/xvda1' | grep -oh '..%' | grep -oh ..",
        'Stage CV1 Gateway 1: Check Disk Usage: '
    )
    commandRunner(
        '34.211.243.89',
        "ps -ef | grep 'bbproc\\|bbsvc\\|cv1comm\\|devcomm' | grep -v grep | wc -l",
        'Stage CV1 Gateway 1: Count Running Daemons: '
    )

    commandRunner(
        '34.210.17.87',
        "df -kh | grep -i '/dev/xvda1' | grep -oh '..%' | grep -oh ..",
        'Stage CV1 Gateway 2: Check Disk Usage: '
    )

    // ----------- Stage Load Balancers
    commandRunner(
        '52.11.24.58',
        "df -kh | grep -i '/dev/xvda1' | grep -oh '..%' | grep -oh ..",
        'Stage DC12 LB 1: Check Disk Usage: '
    )

    // ----------- Stage Devcomm12 Server
    commandRunner(
        '34.209.90.124',
        "ps -ef | grep 'bbproc\\|bbsvc\\|cv1comm\\|devcomm' | grep -v grep | wc -l",
        'Stage New DC12 Server 1: Count Running Daemons: '
    )

    commandRunner(
        '35.165.180.23',
        "df -kh | grep -i '/dev/xvda1' | grep -oh '..%' | grep -oh ..",
        'Stage New DC12 Server 2: Check Disk Usage: '
    )

    // ----- Mac Notification
    sendMacPushNotification()
}



 /*
|--------------------------------------------------------------------------
| Production Health Check 
|--------------------------------------------------------------------------
|
| Here is where you can register web routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| contains the "web" middleware group. Now create something great!
|
*/



function listProdDaemons() {
    
    // user layer
    commandRunner(
        '35.160.15.180',
        "ps -ef | grep 'bbproc\\|bbsvc\\|cv1comm\\|devcomm' | grep -v grep",
        'Production User Layer: Check list of running Daemons:\n',
        'prod'
    )
    // dev subsystem
    commandRunner(
        '44.229.186.48',
        "ps -ef | grep 'bbproc\\|bbsvc\\|cv1comm\\|devcomm' | grep -v grep | head -5",
        'Production CV1 Gateway 2: Check list of running Daemons:\n',
        'prod'
    )

    commandRunner(
        '34.217.247.96',
        "ps -ef | grep 'bbproc\\|bbsvc\\|cv1comm\\|devcomm' | grep -v grep",
        'Production DC12 1: Check list of running Daemons:\n',
        'prod'
    )
    commandRunner(
        '54.212.96.206',
        "ps -ef | grep 'bbproc\\|bbsvc\\|cv1comm\\|devcomm' | grep -v grep",
        'Production DC12 2: Check list of running Daemons:\n',
        'prod'
    )

    commandRunner(
        '54.202.54.146',
        "ps -ef | grep 'bbproc\\|bbsvc\\|cv1comm\\|devcomm' | grep -v grep",
        'Production Periodic Reports: Check list of running Daemons:\n',
        'prod'
    )
    


    // commandRunner(
    //     '35.165.61.1',
    //     "ssh -p 10001 jeffshomali@bb-db-device.local && ps -ef | grep 'bbproc\\|bbsvc\\|cv1comm\\|devcomm' | grep -v grep",
    //     'Production Sonic DevComm 12: Check list of running Daemons through Web Server 1:\n',
    //     'prod'
    // )

    // cv1 gateways
}

function countProdDaemons() {}

function checkProdPhpErrors() {
    commandRunner(
        '35.165.61.1',
        "tail -n500 /var/log/php_errors.log  | grep -iA5 'PHP error' | head -25",
        'Prod Web Server 1: Look for Stack Trace Keyword: ',
        'prod'
    )
    commandRunner(
        '54.202.85.41',
        "tail -n500 /var/log/php_errors.log  | grep -iA5 'PHP Error' | head -25",
        'Prod Web Server 2: Look for Stack Trace Keyword: ',
        'prod'
    )
}

function checkProdDiskSpace() {}

function production() {
    moveOldLogs('prod')
    clearLog('prod')
    listProdDaemons()
    // checkProdPhpErrors()
    // sendMacPushNotification()
}

// stage()
production()

// security list-keychains  # "/Users/jeffshomali/Library/Keychains/login.keychain-db"
// security dump-keychain 
// security find-generic-password -ga Arteen | grep password
// security -h find-generic-password     // display help for each command
// security dump-keychain | grep 0x00000007 | awk -F= '{print $2}' // list of all keys
